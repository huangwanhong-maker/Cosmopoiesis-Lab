// The acquisition runtime (decision 0004; formalism §8.6): sensors released at the ticks of the
// world's clock or of the wall's, and by events; their jobs scheduled by a policy of calx's
// real-time scheduler (EDF by default) with constant bandwidth servers for classes of work; virtual
// instruments run on worker threads against one snapshot of the world per instant; external ones
// (physical instruments, feeds, data the server samples) planned for the server, which runs them on
// its I/O workers and hands their readings back.
//
// The model of a step. The server calls step() at the ticks of its clock (a fraction of a second of
// the wall) and whenever an event arrives, with the world's clock (TT at a wall instant, a rate,
// running or not), the wall's time, the readings of the external jobs it ran and the events it saw.
// The session then:
//   1. takes the external readings and the events onto the answer (late ones flagged), charging
//      their classes' servers with the time they took;
//   2. releases each sensor whose clock has passed a tick of its period since its last release: one
//      job at the latest tick (a newer release supersedes an older one still waiting: the skipped
//      ticks are counted, never silently lost), with its deadline (the release on the wall plus the
//      sensor's relative deadline, or its server's CBS deadline);
//   3. tests the set for admission (EDF's demand test on the sensors' declared costs and wall
//      periods, the workers taken as one processor of their summed capacity) and, under overload,
//      compresses the periods of the less critical sensors elastically (a sensor of criticality
//      safety is rigid) and decimates their releases by the factor;
//   4. orders the waiting jobs by the policy (EDF, fixed priority with or without aging, FIFO) and
//      dispatches as many internal ones as the step's budget allows (by their declared costs, over
//      the workers); the rest wait for the next step, where aging or their earlier deadlines raise
//      them, so that none waits for ever;
//   5. plans the external jobs released, in the same order, for the server;
//   6. answers the readings, the plan, the trace of every job (release, start, end, deadline, the
//      worker) and the statistics: declared and measured utilisation, lateness, misses, skipped
//      ticks, the admission's verdict and the compressed periods.
//
// What is guaranteed and what is measured. A reading's value depends on its sensor, its tick's
// instant and the seed alone (Snapshot, Noise), whatever the order, the workers or the lateness:
// that is exact. Its timing is measured on a general-purpose operating system and reported, not
// guaranteed; analyse() simulates the declared set in logical time (calx::scheduler::simulate) to
// show what each policy would do with the costs as declared.

#pragma once

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <deque>
#include <limits>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <thread>
#include <vector>

#include <calx/scheduler/kernel.hpp>
#include <calx/scheduler/realtime.hpp>
#include <calx/scheduler/thread_pool.hpp>

#include "declared.hpp"
#include "instruments.hpp"

namespace cosmopoiesis {

namespace cs = calx::scheduler;

// ---- the instruments the engine holds ------------------------------------------------------------------

class Registry {
 public:
  void add(std::unique_ptr<Instrument> i) {
    if (i->kernel() != i->info().kernel) throw std::logic_error("the family " + i->info().family + " declares another kernel than its class's");
    list_.push_back(std::move(i));
  }
  const Instrument* find(const std::string& family) const {
    for (const auto& i : list_)
      if (i->info().family == family) return i.get();
    return nullptr;
  }
  const std::vector<std::unique_ptr<Instrument>>& all() const { return list_; }
 private:
  std::vector<std::unique_ptr<Instrument>> list_;
};

// Why a family cannot be mounted: declared and not implemented (declared.hpp), or unknown.
inline std::string unknown_family(const std::string& family) {
  const std::string code = family.rfind("declared.", 0) == 0 ? family.substr(9) : family;
  for (const auto& d : declared_families())
    if (code == d.code) return std::string("the family ") + d.code + " (" + d.title + ") is declared, not implemented: " + d.state;
  return "no instrument family " + family;
}

// ---- where a mount is ------------------------------------------------------------------------------------

// The place of a mount at an instant, from its address: "satellite:<NORAD>" by SGP4 on the world's
// element sets (in the ITRS, near the Earth), or an address of the navigation bridge's language. An
// address on or near a body with a surface is carried into the body's fixed frame and onto its figure,
// and stands on the body while it is lower than a twentieth of the figure's equatorial radius above it;
// any other is in space. `resolved` holds addresses already read (a session's, resolved before its
// workers run, which then only read it).
inline MountState mount_state(const World& w, const std::string& text, const mt::Instant& t,
                              const std::map<std::string, nf::Event>* resolved = nullptr) {
  MountState m;
  if (text.empty()) return m;
  const auto& c = w.catalogue();
  if (text.rfind("satellite:", 0) == 0) {
    const int norad = std::stoi(text.substr(10));
    for (const auto& [group, sets] : w.elements)
      for (const auto& tle : sets)
        if (tle.number == norad) {
          if (!t.has_utc) throw Unavailable("SGP4's elements are in UTC");
          const navigation::orbits::Sgp4 model(tle);
          const auto x = model.at(t.utc);
          if (!std::isfinite(x.position[0])) throw Unavailable("SGP4 fails for " + tle.name + " at this instant");
          const auto& g = c.graph();
          m.fixed = g.transform("TEME", "ITRS", t).position(x.position);
          m.fixed_frame = "ITRS";
          m.body = "earth";
          m.on_body = false;
          m.geodetic = gf::Ellipsoid::wgs84().geodetic(m.fixed);
          m.gcrs = g.transform("TEME", "GCRS", t).position(x.position);
          m.icrs = g.transform("TEME", "ICRS", t).position(x.position);
          m.address = "satellite " + tle.name;
          return m;
        }
    throw Unavailable("no elements are loaded for NORAD " + std::to_string(norad));
  }
  const auto it = resolved ? resolved->find(text) : std::map<std::string, nf::Event>::const_iterator{};
  const nf::Event e = resolved && it != resolved->end() ? it->second : nf::resolve(nf::parse_address(text), c);
  m.address = text;
  const auto& g = c.graph();
  if (!e.body.empty()) {
    const auto b = nf::body_frames(c, e.body);
    if (b && b->surface) {
      const nf::Event f = nf::carry(e, b->fixed, c, t);
      m.body = e.body;
      m.fixed = f.position;
      m.fixed_frame = b->fixed;
      m.geodetic = b->figure->geodetic(f.position);
      m.on_body = m.geodetic.height < 0.05 * b->figure->a();
    }
  }
  m.gcrs = g.transform(e.frame, "GCRS", t).position(e.position);
  m.icrs = g.transform(e.frame, "ICRS", t).position(e.position);
  return m;
}

// The solar wind as the server passes it with a step ({"imf_gse": [[tt_s, Bx, By, Bz], …] in tesla,
// "speed_m_s", "speed_tt_s", "spacecraft"}), its series ascending in time.
inline SolarWindInputs solar_wind_of(const Json& sw) {
  SolarWindInputs in;
  for (std::size_t i = 0; i < sw["imf_gse"].size(); i++) {
    const Json& row = sw["imf_gse"][i];
    in.imf_gse.push_back({row[0].as_number(), row[1].as_number(), row[2].as_number(), row[3].as_number()});
  }
  std::sort(in.imf_gse.begin(), in.imf_gse.end(), [](const auto& a, const auto& b) { return a[0] < b[0]; });
  in.speed_m_s = sw["speed_m_s"].is_number() ? sw["speed_m_s"].as_number() : 0.0;
  in.speed_tt_s = sw["speed_tt_s"].is_number() ? sw["speed_tt_s"].as_number() : 0.0;
  in.spacecraft = sw["spacecraft"].text();
  return in;
}

inline Json info_json(const InstrumentInfo& i) {
  Json q = Json::array();
  for (const auto& x : i.quantities) q.push(Json::object({{"name", x.name}, {"unit", x.unit}, {"about", x.about}}));
  const auto& k = kernel_info(i.kernel);
  return Json::object({{"family", i.family}, {"title", i.title}, {"catalogue", i.catalogue}, {"kernel", k.key}, {"kernel_title", k.title},
                       {"operator", k.operator_form}, {"provenance", name(i.provenance)}, {"quantities", q}, {"cost_s", i.cost_s},
                       {"period_s", i.period_s}, {"model", i.model}, {"about", i.about}, {"references", i.references}});
}

// ---- sensors, servers, policy ----------------------------------------------------------------------------

inline const char* criticality_name(int c) {
  switch (c) {
    case 3: return "safety";
    case 2: return "mission";
    case 1: return "science";
    default: return "display";
  }
}

struct SensorSpec {
  std::string id, family, title;
  bool external = false;     // run by the server
  std::string kernel = "", provenance = "";  // for an external sensor, as the server declares
  std::string mount;         // an address, "observer", "satellite:<NORAD>", or "" (none)
  std::string clock = "world";  // "world" or "wall"
  double period_s = 1;       // of its clock; 0: only by events and requests
  double deadline_s = 0;     // relative, s of the wall; 0: its wall period, at most 1 s
  double cost_s = 0;         // declared, s of the wall; 0: the instrument's
  int criticality = 1;       // 0 display, 1 science, 2 mission, 3 safety
  std::string server;        // a class's bandwidth server, or ""
  Coverage coverage;         // for an external sensor, as the server declares
  Json settings = Json::object();  // the family's own settings (a lunar magnetometer's synthetic small scales)

  static SensorSpec from(const Json& j) {
    SensorSpec s;
    s.id = j["id"].text();
    s.family = j["family"].text();
    s.title = j["title"].text();
    s.external = j["external"].is_bool() && j["external"].as_bool();
    s.kernel = j["kernel"].text();
    s.provenance = j["provenance"].text();
    s.mount = j["mount"].text();
    s.clock = j["clock"].text("world");
    if (s.clock != "world" && s.clock != "wall") throw std::invalid_argument("a sensor's clock is world or wall");
    if (j["period_s"].is_number()) s.period_s = j["period_s"].as_number();
    if (j["deadline_s"].is_number()) s.deadline_s = j["deadline_s"].as_number();
    if (j["cost_s"].is_number()) s.cost_s = j["cost_s"].as_number();
    if (j["criticality"].is_number()) s.criticality = std::clamp(int(j["criticality"].as_number()), 0, 3);
    s.server = j["server"].text();
    if (j["settings"].is_object()) s.settings = j["settings"];
    if (s.id.empty() || s.family.empty()) throw std::invalid_argument("a sensor needs an id and a family");
    if (!(s.period_s >= 0)) throw std::invalid_argument("a sensor's period is not negative");
    const Json& c = j["coverage"];
    if (c.is_object()) {
      if (c["tt_from_s"].is_number()) s.coverage.tt_from = c["tt_from_s"].as_number();
      if (c["tt_to_s"].is_number()) s.coverage.tt_to = c["tt_to_s"].as_number();
      s.coverage.present_only = c["present_only"].is_bool() && c["present_only"].as_bool();
      if (c["window_s"].is_number()) s.coverage.window_s = c["window_s"].as_number();
      s.coverage.about = c["about"].text();
    }
    return s;
  }
};

struct ServerSpec {
  std::string name;
  double budget_s = 0.01, period_s = 0.1;
};

struct PolicySpec {
  cs::Policy order = cs::Policy::edf;
  bool aging = false;
  double aging_step_s = 0.05;   // fixed priority with aging: a level for each step waited
  double budget = 0.6;          // the fraction of a step's wall interval given to internal jobs
  double target = 0.8;          // the utilisation (per worker) above which periods are compressed
  std::string kernel = "probe"; // "probe": report the kernel's real-time classes; "fifo": raise the workers to SCHED_FIFO where permitted
};

// ---- the session ------------------------------------------------------------------------------------------

class Session {
 public:
  Session(World& w, const Registry& r, std::size_t workers)
      : world_(w), registry_(r), pool_(std::max<std::size_t>(1, workers)), kernel_(cs::probe_kernel()) {}

  std::size_t workers() const { return pool_.size(); }
  const World& world() const { return world_; }
  const std::string& observer() const { return observer_; }

  // {"sensors": [...], "servers": [...], "policy": {...}, "observer": address} — every field optional.
  Json configure(const Json& r) {
    if (r["sensors"].is_array()) {
      std::vector<SensorSpec> next;
      for (std::size_t i = 0; i < r["sensors"].size(); i++) next.push_back(SensorSpec::from(r["sensors"][i]));
      for (const auto& s : next)
        if (!s.external && !registry_.find(s.family)) throw std::invalid_argument(unknown_family(s.family));
      std::map<std::string, State> kept;
      for (const auto& s : next) {
        auto it = state_.find(s.id);
        kept[s.id] = it != state_.end() ? it->second : State{};
      }
      sensors_ = std::move(next);
      state_ = std::move(kept);
      backlog_.erase(std::remove_if(backlog_.begin(), backlog_.end(), [&](const Pending& p) { return !state_.count(p.sensor); }), backlog_.end());
    }
    if (r["sensors_add"].is_array())
      for (std::size_t i = 0; i < r["sensors_add"].size(); i++) {
        const SensorSpec s = SensorSpec::from(r["sensors_add"][i]);
        if (!s.external && !registry_.find(s.family)) throw std::invalid_argument(unknown_family(s.family));
        auto it = std::find_if(sensors_.begin(), sensors_.end(), [&](const SensorSpec& x) { return x.id == s.id; });
        if (it != sensors_.end()) *it = s; else sensors_.push_back(s);
        state_[s.id];
      }
    if (r["sensors_remove"].is_array())
      for (std::size_t i = 0; i < r["sensors_remove"].size(); i++) {
        const std::string id = r["sensors_remove"][i].text();
        sensors_.erase(std::remove_if(sensors_.begin(), sensors_.end(), [&](const SensorSpec& x) { return x.id == id; }), sensors_.end());
        state_.erase(id);
      }
    if (r["servers"].is_array()) {
      servers_.clear();
      cbs_.clear();
      for (std::size_t i = 0; i < r["servers"].size(); i++) {
        const Json& j = r["servers"][i];
        ServerSpec s{j["name"].text(), j["budget_s"].as_number(), j["period_s"].as_number()};
        servers_.push_back(s);
        cbs_.emplace(s.name, cs::ConstantBandwidthServer(s.budget_s, s.period_s));
      }
    }
    if (r["policy"].is_object()) {
      const Json& p = r["policy"];
      const std::string order = p["order"].text("edf");
      policy_.order = order == "fixed-priority" ? cs::Policy::fixed_priority : order == "fifo" ? cs::Policy::fifo : cs::Policy::edf;
      policy_.aging = p["aging"].is_bool() && p["aging"].as_bool();
      if (p["aging_step_s"].is_number()) policy_.aging_step_s = p["aging_step_s"].as_number();
      if (p["budget"].is_number()) policy_.budget = std::clamp(p["budget"].as_number(), 0.05, 1.0);
      if (p["target"].is_number()) policy_.target = std::clamp(p["target"].as_number(), 0.05, 1.0);
      if (p["kernel"].is_string()) {
        const std::string k = p["kernel"].text();
        if (k != "probe" && k != "fifo") throw std::invalid_argument("the policy's kernel is probe or fifo");
        policy_.kernel = k;
      }
      apply_kernel();
    }
    if (r["observer"].is_string() || r["observer"].is_null()) {
      observer_ = r["observer"].is_string() ? r["observer"].text() : "";
      mounts_.clear();
    }
    if (r["seed"].is_number()) world_.seed = std::uint64_t(r["seed"].as_number());
    return describe();
  }

  Json describe() const {
    Json sensors = Json::array();
    for (const auto& s : sensors_) {
      const Instrument* in = s.external ? nullptr : registry_.find(s.family);
      const auto st = state_.find(s.id);
      Json j = Json::object({{"id", s.id}, {"family", s.family}, {"title", s.title.empty() && in ? in->info().title : s.title}, {"external", s.external},
                             {"mount", s.mount}, {"clock", s.clock}, {"period_s", s.period_s}, {"deadline_s", deadline_of(s)}, {"cost_s", cost_of(s)},
                             {"criticality", s.criticality}, {"criticality_name", criticality_name(s.criticality)}, {"server", s.server},
                             {"kernel", in ? kernel_info(in->info().kernel).key : s.kernel}, {"provenance", in ? name(in->info().provenance) : s.provenance},
                             {"coverage", (in ? in->coverage(world_) : s.coverage).json()}, {"settings", s.settings}});
      if (st != state_.end()) {
        j.set("released", double(st->second.released));
        j.set("skipped", double(st->second.skipped));
        j.set("late", double(st->second.late));
        j.set("decimation", double(st->second.decimation));
        j.set("measured_cost_s", st->second.measured);
      }
      sensors.push(j);
    }
    Json servers = Json::array();
    for (const auto& s : servers_) servers.push(Json::object({{"name", s.name}, {"budget_s", s.budget_s}, {"period_s", s.period_s}, {"bandwidth", s.budget_s / s.period_s}}));
    return Json::object({{"sensors", sensors}, {"servers", servers}, {"observer", observer_}, {"workers", double(pool_.size())},
                         {"policy", Json::object({{"order", cs::policy_name(policy_.order)}, {"aging", policy_.aging}, {"aging_step_s", policy_.aging_step_s},
                                                  {"budget", policy_.budget}, {"target", policy_.target}, {"kernel", policy_.kernel}})},
                         {"kernel", kernel_json()}, {"seed", double(world_.seed)}});
  }

  // One step (see the header). Request: {"clock": {"tt_s", "wall", "rate", "running"}, "wall": now,
  // "interval_s": the wall interval to the next step, "external": [readings], "events": [...], "now": [sensor ids]}.
  Json step(const Json& r) {
    const auto call = std::chrono::steady_clock::now();
    const double wall = r["wall"].as_number();
    const Json& clock = r["clock"];
    const double tt0 = clock["tt_s"].as_number(), wall0 = clock["wall"].as_number();
    const double rate = clock["rate"].is_number() ? clock["rate"].as_number() : 1.0;
    const bool running = !clock["running"].is_bool() || clock["running"].as_bool();
    const double tt_now = tt0 + (running ? rate * (wall - wall0) : 0.0);
    const double interval = r["interval_s"].is_number() ? r["interval_s"].as_number() : 0.25;
    world_.now_tt = r["now_tt_s"].is_number() ? r["now_tt_s"].as_number() : tt_now;
    const auto wall_at_tt = [&](double tt) {
      return (running && rate != 0) ? wall0 + (tt - tt0) / rate : wall;
    };
    Json readings = Json::array(), plan = Json::array(), trace = Json::array();

    // 0. What physical sources tell the virtual instruments (the solar wind at L1), before dispatch.
    if (r["inputs"].is_object() && r["inputs"]["solar_wind"].is_object()) world_.solar_wind = solar_wind_of(r["inputs"]["solar_wind"]);

    // 1. External readings and events.
    if (r["external"].is_array())
      for (std::size_t i = 0; i < r["external"].size(); i++) {
        Json x = r["external"][i];
        const std::string sid = x["sensor"].text();
        const double end = x["end_wall"].is_number() ? x["end_wall"].as_number() : wall;
        const double deadline = x["deadline_wall"].is_number() ? x["deadline_wall"].as_number() : std::numeric_limits<double>::infinity();
        const bool late = end > deadline;
        x.set("late", late);
        x.set("delivered_wall", wall);
        if (auto it = state_.find(sid); it != state_.end() && late) it->second.late++;
        if (const SensorSpec* s = sensor(sid); s && !s->server.empty() && x["start_wall"].is_number()) {
          auto c = cbs_.find(s->server);
          if (c != cbs_.end()) c->second.consume(std::max(0.0, end - x["start_wall"].as_number()));
        }
        if (late) late_total_++;
        readings.push(x);
        trace.push(Json::object({{"sensor", sid}, {"worker", "io"}, {"release", x["release_wall"]}, {"start", x["start_wall"]}, {"end", end},
                                 {"deadline", x["deadline_wall"]}, {"late", late}, {"criticality", s_crit(sid)}}));
      }
    std::vector<std::string> triggered;
    if (r["events"].is_array())
      for (std::size_t i = 0; i < r["events"].size(); i++) {
        Json e = r["events"][i];
        e.set("delivered_wall", wall);
        e.set("event", true);
        readings.push(e);
        if (e["trigger"].is_array())
          for (std::size_t k = 0; k < e["trigger"].size(); k++) triggered.push_back(e["trigger"][k].text());
      }
    if (r["now"].is_array())
      for (std::size_t k = 0; k < r["now"].size(); k++) triggered.push_back(r["now"][k].text());

    // 3 (before 2, which uses it). Admission and elastic compression on the declared set.
    const Json admission = admit(running ? rate : 0.0);

    // 2. Releases.
    for (const auto& s : sensors_) {
      State& st = state_[s.id];
      const bool now_requested = std::find(triggered.begin(), triggered.end(), s.id) != triggered.end();
      double t_tick = 0, release_wall = wall;
      long long k = 0;
      bool due = false;
      if (s.period_s > 0) {
        const double x = s.clock == "world" ? tt_now : wall;
        k = static_cast<long long>(std::floor(x / s.period_s + 1e-9));
        if (!st.started) { st.started = true; st.last_k = k - 1; }
        if (k != st.last_k) {
          const long long d = std::max<long long>(1, st.decimation);
          if (std::llabs(k - st.last_k) >= d || st.never) {
            st.skipped += std::max<long long>(0, std::llabs(k - st.last_k) - 1);
            st.last_k = k;
            due = true;
          }
        }
        if (st.never) due = true;
        t_tick = s.clock == "world" ? k * s.period_s : tt_now;
        release_wall = s.clock == "world" ? std::min(wall, wall_at_tt(t_tick)) : k * s.period_s;
        if (st.never) release_wall = wall;  // the session's first release counts from its start
      }
      st.never = false;
      if (now_requested) { due = true; t_tick = tt_now; release_wall = wall; }
      if (!due) continue;
      st.released++;
      Pending p;
      p.sensor = s.id;
      p.tick = k;
      p.tt = s.period_s > 0 && s.clock == "world" && !now_requested ? t_tick : tt_now;
      p.release_wall = release_wall;
      p.deadline_wall = release_wall + deadline_of(s);
      if (!s.server.empty()) {
        auto c = cbs_.find(s.server);
        if (c != cbs_.end()) {
          const bool idle = std::none_of(backlog_.begin(), backlog_.end(), [&](const Pending& q) { const SensorSpec* o = sensor(q.sensor); return o && o->server == s.server; });
          p.deadline_wall = std::min(p.deadline_wall, c->second.arrive(release_wall, idle));
        }
      }
      // A newer release of the sensor supersedes an older one still waiting.
      auto old = std::find_if(backlog_.begin(), backlog_.end(), [&](const Pending& q) { return q.sensor == s.id; });
      if (old != backlog_.end()) { st.skipped++; backlog_.erase(old); }
      if (s.external) {
        plan.push(Json::object({{"sensor", s.id}, {"family", s.family}, {"tick", double(k)}, {"tt_s", p.tt}, {"release_wall", p.release_wall},
                                {"deadline_wall", p.deadline_wall}, {"criticality", s.criticality}, {"mount", s.mount}}));
      } else {
        backlog_.push_back(p);
      }
    }
    // The plan in the policy's order, for the server's I/O workers.
    {
      std::vector<std::pair<double, std::size_t>> order;
      for (std::size_t i = 0; i < plan.size(); i++)
        order.push_back({policy_.order == cs::Policy::edf ? plan[i]["deadline_wall"].as_number()
                         : policy_.order == cs::Policy::fixed_priority ? double(3 - int(plan[i]["criticality"].as_number())) : double(i), i});
      std::stable_sort(order.begin(), order.end());
      Json sorted = Json::array();
      for (const auto& o : order) sorted.push(plan[o.second]);
      plan = sorted;
    }

    // 4. Order the waiting jobs and dispatch what the step's budget allows.
    std::stable_sort(backlog_.begin(), backlog_.end(), [&](const Pending& a, const Pending& b) { return key(a, wall) < key(b, wall); });
    const double budget = policy_.budget * interval * double(pool_.size());
    double planned = 0;
    std::vector<Pending> run;
    std::deque<Pending> wait;
    for (const auto& p : backlog_) {
      const double c = cost_of(*sensor(p.sensor));
      if (run.empty() || planned + c <= budget) { run.push_back(p); planned += c; }
      else wait.push_back(p);
    }
    backlog_.assign(wait.begin(), wait.end());

    // The mounts' addresses resolved here, before the workers read them.
    for (const auto& p : run) {
      const SensorSpec* s = sensor(p.sensor);
      const std::string text = s->mount == "observer" ? observer_ : s->mount;
      if (text.empty() || text.rfind("satellite:", 0) == 0 || mounts_.count(text)) continue;
      try {
        mounts_.emplace(text, nf::resolve(nf::parse_address(text), world_.catalogue()));
      } catch (const std::exception&) {
        // measure() resolves it again and reports why it cannot.
      }
    }
    // Snapshots, one per instant of the jobs run, shared by them.
    std::map<double, std::unique_ptr<Snapshot>> snaps;
    for (const auto& p : run)
      if (!snaps.count(p.tt)) snaps.emplace(p.tt, std::make_unique<Snapshot>(world_, instant_tt(p.tt), p.tt));
    std::vector<Json> results(run.size());
    std::vector<cs::LiveJob> jobs;
    const double wall_call = wall;  // the dispatch's clock starts at the call (≈ the server's wall)
    for (std::size_t i = 0; i < run.size(); i++) {
      const Pending& p = run[i];
      const SensorSpec* s = sensor(p.sensor);
      cs::LiveJob j;
      j.name = p.sensor;
      j.deadline = p.deadline_wall - wall_call;
      j.priority = 3 - s->criticality;
      j.criticality = s->criticality;
      j.work = [this, &results, &snaps, i, p, s](std::size_t) { results[i] = measure(*s, p, *snaps.at(p.tt)); };
      jobs.push_back(std::move(j));
    }
    cs::Dispatch d;
    if (!jobs.empty()) d = cs::dispatch(pool_, jobs, policy_.order == cs::Policy::fifo ? cs::Policy::fifo : policy_.order, call);
    for (const auto& rec : d.records) {
      const Pending& p = run[rec.job];
      const SensorSpec* s = sensor(p.sensor);
      Json& x = results[rec.job];
      const double start = wall_call + rec.start, end = wall_call + rec.end;
      const bool late = end > p.deadline_wall;
      x.set("release_wall", p.release_wall);
      x.set("start_wall", start);
      x.set("end_wall", end);
      x.set("deadline_wall", p.deadline_wall);
      x.set("delivered_wall", end);
      x.set("late", late);
      x.set("worker", double(rec.thread));
      State& st = state_[p.sensor];
      if (late) { st.late++; late_total_++; }
      busy_ += rec.end - rec.start;
      // The measured cost, smoothed (an exponential average over about ten jobs), beside the declared one.
      st.measured = st.measured > 0 ? 0.9 * st.measured + 0.1 * (rec.end - rec.start) : (rec.end - rec.start);
      if (!s->server.empty()) {
        auto c = cbs_.find(s->server);
        if (c != cbs_.end()) c->second.consume(rec.end - rec.start);
      }
      readings.push(x);
      trace.push(Json::object({{"sensor", p.sensor}, {"worker", double(rec.thread)}, {"release", p.release_wall}, {"start", start}, {"end", end},
                               {"deadline", p.deadline_wall}, {"late", late}, {"criticality", s->criticality}}));
    }
    // The statistics.
    const double elapsed = last_wall_ > 0 ? std::max(1e-6, wall - last_wall_) : interval;
    last_wall_ = wall;
    const double measured = busy_ / (elapsed * double(pool_.size()));
    busy_ = 0;
    Json stats = Json::object({{"tt_s", tt_now}, {"wall", wall}, {"rate", rate}, {"running", running}, {"workers", double(pool_.size())},
                               {"run", double(run.size())}, {"waiting", double(backlog_.size())}, {"planned_external", double(plan.size())},
                               {"measured_utilisation", measured}, {"late_total", double(late_total_)}, {"admission", admission},
                               {"policy", cs::policy_name(policy_.order)}, {"aging", policy_.aging}});
    return Json::object({{"readings", readings}, {"plan", plan}, {"trace", trace}, {"stats", stats}});
  }

  // A simulation of the declared set in logical time under each policy (calx::scheduler::simulate),
  // non-preemptive as dispatch is, on the session's workers: what the costs as declared allow.
  // {"rate": world clock rate, "horizon_s": s of the wall, "burst"?: {"at_s", "count", "cost_s", "criticality"}}
  Json analyse(const Json& r) const {
    const double rate = r["rate"].is_number() ? r["rate"].as_number() : 1.0;
    const double horizon = r["horizon_s"].is_number() ? std::clamp(r["horizon_s"].as_number(), 0.01, 60.0) : 2.0;
    std::vector<cs::PeriodicTask> tasks;
    std::vector<std::string> ids;
    for (const auto& s : sensors_) {
      const double p = wall_period(s, rate);
      if (!(p > 0) || !std::isfinite(p)) continue;
      cs::PeriodicTask t;
      t.name = s.id;
      t.cost = cost_of(s);
      t.period = p;
      t.deadline = std::min(deadline_of(s), p);
      t.priority = 3 - s.criticality;
      t.criticality = s.criticality;
      ids.push_back(s.id);
      tasks.push_back(t);
    }
    std::vector<cs::Job> jobs = cs::periodic_jobs(tasks, horizon);
    if (r["burst"].is_object()) {
      const Json& b = r["burst"];
      const int n = std::clamp(int(b["count"].as_number()), 0, 10000);
      for (int k = 0; k < n; k++)
        jobs.push_back({tasks.size(), std::size_t(k), b["at_s"].as_number(), b["cost_s"].as_number(), b["at_s"].as_number() + 0.05,
                        3 - int(b["criticality"].as_number()), int(b["criticality"].as_number()), cs::no_server});
    }
    Json out = Json::array();
    struct Variant { const char* name; cs::Policy p; bool aging; };
    for (const Variant& v : {Variant{"edf", cs::Policy::edf, false}, Variant{"fixed-priority", cs::Policy::fixed_priority, false},
                             Variant{"fixed-priority with aging", cs::Policy::fixed_priority, true}, Variant{"fifo", cs::Policy::fifo, false}}) {
      cs::SimulationOptions o;
      o.policy = v.p;
      o.processors = pool_.size();
      o.preemptive = false;
      o.aging_step = v.aging ? policy_.aging_step_s : 0;
      const auto sim = cs::simulate(jobs, horizon * 1.5, o);
      std::size_t starved = 0;
      for (const auto& oc : sim.outcomes) starved += oc.start < 0 && oc.job.release < horizon;
      Json slices = Json::array();
      for (const auto& sl : sim.slices) {
        if (slices.size() >= 400) break;
        const auto& job = sim.outcomes[sl.job].job;
        slices.push(Json::object({{"task", job.task < ids.size() ? Json(ids[job.task]) : Json("burst")}, {"processor", double(sl.processor)},
                                  {"start", sl.start}, {"end", sl.end}, {"late", sim.outcomes[sl.job].missed(sim.horizon)}}));
      }
      out.push(Json::object({{"policy", v.name}, {"jobs", double(sim.outcomes.size())}, {"misses", double(sim.misses)},
                             {"max_lateness_s", std::isfinite(sim.max_lateness) ? Json(sim.max_lateness) : Json(nullptr)}, {"starved", double(starved)},
                             {"busy_s", sim.busy}, {"slices", slices}}));
    }
    const auto edf = cs::edf_feasible(tasks);
    return Json::object({{"rate", rate}, {"horizon_s", horizon}, {"workers", double(pool_.size())}, {"utilisation", cs::utilisation(tasks)},
                         {"edf_one_worker", Json::object({{"feasible", edf.feasible}, {"utilisation", edf.utilisation}})},
                         {"liu_layland_bound", cs::liu_layland_bound(tasks.size())}, {"policies", out}});
  }

 private:
  struct State {
    long long last_k = 0;
    bool started = false, never = true;
    long long released = 0, skipped = 0, late = 0, decimation = 1;
    double measured = 0;  // s of the wall, smoothed
  };
  struct Pending {
    std::string sensor;
    long long tick = 0;
    double tt = 0, release_wall = 0, deadline_wall = 0;
  };

  const SensorSpec* sensor(const std::string& id) const {
    for (const auto& s : sensors_) if (s.id == id) return &s;
    return nullptr;
  }
  int s_crit(const std::string& id) const { const SensorSpec* s = sensor(id); return s ? s->criticality : 0; }
  // A sensor's cost for admission and budgets: the larger of the declared and the measured (with a
  // margin of a fifth), so that a cost declared too small is corrected by what the jobs take.
  double cost_of(const SensorSpec& s) const {
    double declared = s.cost_s;
    if (!(declared > 0)) {
      const Instrument* i = s.external ? nullptr : registry_.find(s.family);
      declared = i ? i->info().cost_s : 0.01;
    }
    const auto it = state_.find(s.id);
    return it != state_.end() ? std::max(declared, 1.2 * it->second.measured) : declared;
  }
  double wall_period(const SensorSpec& s, double rate) const {
    if (s.period_s <= 0) return 0;
    if (s.clock == "wall") return s.period_s;
    return rate != 0 ? s.period_s / std::fabs(rate) : std::numeric_limits<double>::infinity();
  }
  double deadline_of(const SensorSpec& s) const {
    if (s.deadline_s > 0) return s.deadline_s;
    const double p = s.clock == "wall" ? s.period_s : s.period_s;  // in its own clock; a world second is taken as a wall second here
    return p > 0 ? std::min(p, 1.0) : 1.0;
  }
  // The policy's key: smaller first.
  std::array<double, 3> key(const Pending& p, double wall) const {
    const SensorSpec* s = sensor(p.sensor);
    if (policy_.order == cs::Policy::edf) return {p.deadline_wall, p.release_wall, 0};
    if (policy_.order == cs::Policy::fixed_priority) {
      double level = 3 - s->criticality;
      if (policy_.aging && policy_.aging_step_s > 0) level -= std::floor((wall - p.release_wall) / policy_.aging_step_s);
      return {level, p.release_wall, 0};
    }
    return {p.release_wall, 0, 0};
  }
  mt::Instant instant_tt(double tt) const {
    const double days = tt / mt::DAY;
    const double whole = std::floor(days);
    return world_.spacetime().instant(mt::JulianDate{2451545.0 + whole, days - whole}, mt::Scale::TT);
  }
  // The admission of the declared set at the world clock's rate, and its elastic compression.
  Json admit(double rate) {
    std::vector<cs::PeriodicTask> tasks;
    std::vector<cs::Elastic> elastic;
    std::vector<std::string> ids;
    const double m = double(pool_.size());
    for (const auto& s : sensors_) {
      if (s.external) continue;  // the server's I/O workers run those
      const double p = wall_period(s, rate);
      if (!(p > 0) || !std::isfinite(p)) { state_[s.id].decimation = 1; continue; }
      cs::PeriodicTask t;
      t.name = s.id;
      t.cost = cost_of(s) / m;
      t.period = p;
      t.deadline = std::min(deadline_of(s), p);
      tasks.push_back(t);
      // Elasticity by criticality: safety rigid, mission stiff, science and display supple.
      const double e = s.criticality >= 3 ? 0.0 : s.criticality == 2 ? 0.25 : s.criticality == 1 ? 1.0 : 4.0;
      elastic.push_back({t.cost, p, p * 1e6, e});
      ids.push_back(s.id);
    }
    const double u = cs::utilisation(tasks);
    const auto v = cs::edf_feasible(tasks);
    Json compressed = Json::object();
    bool degraded = false;
    if (u > policy_.target) {
      const auto periods = cs::compress(elastic, policy_.target);
      for (std::size_t i = 0; i < ids.size(); i++) {
        const long long d = periods ? std::max<long long>(1, (long long)std::ceil((*periods)[i] / elastic[i].period - 1e-9)) : 1;
        state_[ids[i]].decimation = d;
        if (d > 1) { compressed.set(ids[i], double(d)); degraded = true; }
      }
    } else {
      for (const auto& id : ids) state_[id].decimation = 1;
    }
    return Json::object({{"utilisation", u}, {"target", policy_.target}, {"feasible", v.feasible}, {"degraded", degraded}, {"decimation", compressed},
                         {"about", "EDF's demand test on the declared costs over the workers' summed capacity; periods compressed elastically above the target"}});
  }
  // The mount of a sensor at an instant (mounts_ is read only on the workers: step() resolved the
  // addresses before dispatching).
  MountState mount_at(const SensorSpec& s, const mt::Instant& t) const {
    MountState m = mount_state(world_, s.mount == "observer" ? observer_ : s.mount, t, &mounts_);
    m.settings = s.settings;
    return m;
  }
  // One job: the reading of an internal sensor at its tick, or why there is none.
  Json measure(const SensorSpec& s, const Pending& p, const Snapshot& snap) const {
    const Instrument* in = registry_.find(s.family);
    const auto& info = in->info();
    // The observation envelope: which measurement, over what interval and support, in what frame, of
    // what quality, from which snapshot (decision 0005; formalism §8.5).
    Json x = Json::object({{"sensor", s.id}, {"family", s.family}, {"title", s.title.empty() ? info.title : s.title},
                           {"kernel", kernel_info(info.kernel).key}, {"provenance", name(info.provenance)}, {"tick", double(p.tick)},
                           {"tt_s", p.tt}, {"criticality", s.criticality}, {"measurement", s.id + "@" + std::to_string(p.tick)},
                           {"interval", Json::object({{"from_tt_s", p.tt}, {"to_tt_s", p.tt}})}, {"frame", info.frame},
                           {"interaction", info.interaction}, {"snapshot", std::to_string(key_of(std::to_string(p.tt)))}});
    try {
      if (snap.instant().has_utc) x.set("time_utc", mt::format_iso(snap.instant().utc, mt::Scale::UTC, world_.spacetime().scales(), 3));
      const MountState m = mount_at(s, snap.instant());
      x.set("mount", Json::object({{"address", m.address}, {"body", m.body}}));
      if (!m.body.empty())
        x.set("place", Json::object({{"latitude_deg", m.geodetic.latitude * 180 / std::numbers::pi}, {"longitude_deg", m.geodetic.longitude * 180 / std::numbers::pi},
                                     {"height_m", m.geodetic.height}}));
      x.set("support", in->support(m));
      const Availability a = in->coverage(world_).check(m, p.tt, world_.now_tt);
      if (!a.ok) {
        x.set("available", false);
        x.set("reason", a.reason);
        x.set("quality", name(Quality::outside));
        return x;
      }
      Noise noise(world_.seed, key_of(s.id), static_cast<std::uint32_t>(p.tick), 0);
      x.set("values", in->measure(snap, m, noise));
      x.set("available", true);
      x.set("quality", name(Quality::valid));
    } catch (const Unavailable& e) {
      x.set("available", false);
      x.set("reason", std::string(e.what()));
      x.set("quality", name(e.quality()));
    } catch (const std::exception& e) {
      x.set("available", false);
      x.set("reason", std::string(e.what()));
      x.set("quality", name(Quality::invalid));
    }
    Json units = Json::object();
    for (const auto& q : info.quantities) if (!q.unit.empty()) units.set(q.name, q.unit);
    x.set("units", units);
    return x;
  }

  // Raise the workers to SCHED_FIFO where the policy asks and the kernel permits, and back otherwise.
  void apply_kernel() {
    const bool want = policy_.kernel == "fifo" && kernel_.fifo_permitted;
    if (want == raised_) return;
    const int priority = kernel_.fifo_min;
    pool_.run([&](std::size_t) { if (want) cs::raise_to_fifo(priority); else cs::lower_to_time_sharing(); });
    raised_ = want;
  }
  Json kernel_json() const {
    std::string workers;
    const_cast<cs::ThreadPool&>(pool_).run([&](std::size_t t) { if (t == pool_.size() - 1) workers = cs::current_class(); });
    return Json::object({{"system", kernel_.system}, {"release", kernel_.release}, {"wsl", kernel_.wsl}, {"preempt_rt", kernel_.preempt_rt},
                         {"fifo_permitted", kernel_.fifo_permitted}, {"deadline_permitted", kernel_.deadline_permitted},
                         {"rtprio_limit", double(kernel_.rtprio_limit)}, {"refusal", kernel_.refusal}, {"about", kernel_.about},
                         {"workers_class", workers}, {"raised", raised_}});
  }

  World& world_;
  const Registry& registry_;
  cs::ThreadPool pool_;
  cs::KernelReport kernel_;
  bool raised_ = false;
  std::vector<SensorSpec> sensors_;
  std::map<std::string, State> state_;
  std::vector<ServerSpec> servers_;
  std::map<std::string, cs::ConstantBandwidthServer> cbs_;
  PolicySpec policy_;
  std::string observer_;
  std::map<std::string, nf::Event> mounts_;  // written by step() alone, read by the workers
  std::vector<Pending> backlog_;
  double busy_ = 0, last_wall_ = 0;
  long long late_total_ = 0;
};

}  // namespace cosmopoiesis
