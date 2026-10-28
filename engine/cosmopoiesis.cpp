// The engine of Cosmopoiesis: requests in JSON, answers in JSON (README §6, docs/architecture.md
// §4.5). With --serve it reads one request per line on its standard input and writes one answer
// per line on its standard output, keeping its kernels and catalogue of frames between requests;
// without it, it answers the one request on its standard input. An error is answered as
// {"error": "..."}.
//
// Every request names the world's sources (or the server adds them):
//   "sources": {"ephemeris": path, "moon_pck": path?, "eop": path?, "leap_seconds": path?, "geoid": path?}
// and is one of:
//   {"op": "status"}                                  what is loaded, and its coverage
//   {"op": "time", "time": text}                      an instant in every scale, with the Earth's orientation
//   {"op": "frames"}                                  the catalogue of frames and its relations
//   {"op": "ephemeris", "start": text, "span": s, "step": s}
//                                                     the Earth's and the Moon's orientation and the Moon's and
//                                                     the Sun's positions in the GCRS, sampled for the page
//   {"op": "transform", "from": frame, "to": frame, "time": text, "positions": [[x, y, z]], "velocities"?: [...]}
//   {"op": "holonomy", "time": text}                  the holonomy of every loop of the catalogue
//   {"op": "convert", "time": text, "point": {...}, "observer"?: {...}}
//                                                     a point in every coordinate system (coordinates.hpp)
//   {"op": "geodesic", "from": place, "to": place, "points"?: n}
//                                                     the geodesic between two places on WGS 84
//   {"op": "satellites", "time": text, "files": [{"path", "group"}], "observer"?: place,
//    "window"?: {"span_s", "step_s", "start_s"?}, "limit"?: n}
//                                                     satellites by SGP4 from their element sets (satellites.hpp)
//   {"op": "bodies", "start": text, "span": s, "step": s, "bodies"?: [keys]}
//                                                     every body's place, velocity and orientation in the ICRS
//                                                     (the barycentre's frame), sampled for the page's one world
//   {"op": "address", "text": address, "time"?: text, "answers"?: [{"frame", "chart"}], "observer"?: address}
//                                                     an address read, resolved and answered in frames and charts
//                                                     (navigation/frames/address.hpp); a syntax error says where
//   {"op": "instruments"}                             the kernels of observation and the instrument families held
//   {"op": "acquire.configure" | "acquire.step" | "acquire.analyse" | "acquire.describe", "session": id, ...}
//                                                     the acquisition runtime (acquisition.hpp): sensors, servers and
//                                                     policy; one step of releases, scheduling and dispatch; a
//                                                     simulation of the declared set under each policy
// Times are text: ISO 8601 with a scale ("2026-10-28T12:00:00Z", "2026-10-28 12:00 TT"), "JD …",
// "MJD …", or "unix:<seconds>" for UTC from a clock.

#include <cmath>
#include <exception>
#include <iostream>
#include <map>
#include <memory>
#include <string>

#include <science/json.hpp>

#include <metrology/frames/iau1982.hpp>

#include <algorithm>
#include <thread>

#include <navigation/frames/address.hpp>
#include <navigation/orbits/tle.hpp>

#include "acquisition.hpp"
#include "coordinates.hpp"
#include "environment.hpp"
#include "instruments.hpp"
#include "satellites.hpp"
#include "spacetime.hpp"

using science::Json;
namespace mt = metrology::time;
using namespace cosmopoiesis;

namespace {

Json vec(const Vec3& v) { return Json::array({v[0], v[1], v[2]}); }
Json mat(const Mat3& m) { return Json::array({vec({m[0][0], m[0][1], m[0][2]}), vec({m[1][0], m[1][1], m[1][2]}), vec({m[2][0], m[2][1], m[2][2]})}); }
Json jd(const mt::JulianDate& t) { return Json::array({t.d1, t.d2}); }
Vec3 vec_of(const Json& j) { return {j[0].as_number(), j[1].as_number(), j[2].as_number()}; }

mt::Instant instant_of(const Spacetime& s, const Json& t) {
  const std::string text = t.text();
  if (text.rfind("unix:", 0) == 0) return s.instant_unix(std::stod(text.substr(5)));
  if (text.empty()) throw std::invalid_argument("a time is needed");
  return s.instant(text);
}

Sources sources_of(const Json& j) {
  Sources s;
  s.ephemeris = j["ephemeris"].text();
  s.moon_pck = j["moon_pck"].text();
  s.eop = j["eop"].text();
  s.leap_seconds = j["leap_seconds"].text();
  s.geoid = j["geoid"].text();
  if (s.ephemeris.empty()) throw std::invalid_argument("sources.ephemeris (an SPK kernel such as de440s.bsp) is needed");
  return s;
}

// The worlds loaded, by their sources, so that a serving engine reads its kernels once.
std::map<std::string, std::unique_ptr<Spacetime>> worlds;
Spacetime& world(const Json& request) {
  const Sources s = sources_of(request["sources"]);
  const std::string key = s.ephemeris + "|" + s.moon_pck + "|" + s.eop + "|" + s.leap_seconds;
  auto it = worlds.find(key);
  if (it == worlds.end()) it = worlds.emplace(key, std::make_unique<Spacetime>(s)).first;
  return *it->second;
}

// The coordinates' tools, by the geoid's grid they read.
std::map<std::string, std::unique_ptr<Coordinates>> coordinate_tools;
Coordinates& coordinates(const Json& request) {
  const std::string path = request["sources"]["geoid"].text();
  auto it = coordinate_tools.find(path);
  if (it == coordinate_tools.end()) {
    std::shared_ptr<const geodesy::geoid::GeoidGrid> grid;
    if (!path.empty()) grid = std::make_shared<const geodesy::geoid::GeoidGrid>(geodesy::geoid::GeoidGrid::read_pgm(path));
    it = coordinate_tools.emplace(path, std::make_unique<Coordinates>(grid)).first;
  }
  return *it->second;
}

Json time_answer(const Spacetime& s, const mt::Instant& t) {
  const auto& ts = s.scales();
  Json scales = Json::object();
  for (mt::Scale sc : {mt::Scale::UTC, mt::Scale::UT1, mt::Scale::TAI, mt::Scale::TT, mt::Scale::TDB, mt::Scale::TCG, mt::Scale::TCB, mt::Scale::GPS}) {
    if (sc == mt::Scale::UTC && !t.has_utc) continue;
    const mt::JulianDate v = sc == mt::Scale::UT1 ? t.ut1 : ts.from_tai(t.tai, sc);
    scales.set(std::string(mt::name(sc)), Json::object({{"jd", jd(v)}, {"iso", mt::format_iso(v, sc, ts, 3)}}));
  }
  const double gps_days = ts.from_tai(t.tai, mt::Scale::GPS).minus({2444244.5, 0.0});
  const double gps_week = std::floor(gps_days / 7);
  namespace fr = metrology::frames;
  Json a = Json::object({{"scales", scales},
                         {"ut1_source", std::string(mt::name(t.ut1_source))},
                         {"delta_t_s", t.tt.minus(t.ut1) * mt::DAY},
                         {"tdb_minus_tt_s", t.tdb.minus(t.tt) * mt::DAY},
                         {"gps_week", gps_week},
                         {"gps_seconds_of_week", (gps_days - 7 * gps_week) * mt::DAY},
                         {"earth_rotation_angle_rad", fr::earth_rotation_angle(t.ut1)},
                         {"gmst_rad", fr::gmst(t.ut1, t.tt)},
                         {"gast_rad", fr::gast(t.ut1, t.tt)},
                         {"gmst1982_rad", fr::gmst1982(t.ut1)},
                         {"ephemeris_seconds", t.ephemeris_seconds()}});
  a.set("eop", Json::object({{"x_p_arcsec", t.eop.xp}, {"y_p_arcsec", t.eop.yp}, {"ut1_minus_utc_s", t.eop.dut1}, {"lod_s", t.eop.lod},
                             {"dX_mas", t.eop.dx * 1e3}, {"dY_mas", t.eop.dy * 1e3}, {"predicted", t.eop.predicted}}));
  return a;
}

// The instruments the engine holds.
const Registry& registry() {
  static const Registry r = [] {
    Registry x;
    x.add(std::make_unique<ClockInstrument>());
    x.add(std::make_unique<PositionInstrument>());
    x.add(std::make_unique<SunSensor>());
    x.add(std::make_unique<SkyInstrument>());
    x.add(std::make_unique<GnssReceiver>());
    add_environment_instruments(x);
    return x;
  }();
  return r;
}

// The geoid's grids, by path.
std::shared_ptr<const geodesy::geoid::GeoidGrid> geoid_grid(const std::string& path) {
  static std::map<std::string, std::shared_ptr<const geodesy::geoid::GeoidGrid>> grids;
  if (path.empty()) return nullptr;
  auto it = grids.find(path);
  if (it == grids.end()) it = grids.emplace(path, std::make_shared<const geodesy::geoid::GeoidGrid>(geodesy::geoid::GeoidGrid::read_pgm(path))).first;
  return it->second;
}

// The acquisition sessions of a serving engine, each with the world its instruments read.
struct Held {
  std::unique_ptr<World> world;
  std::unique_ptr<Session> session;
  std::string elements_key;
};
std::map<std::string, Held> sessions;

Held& session_of(Spacetime& s, const Json& r) {
  const std::string id = r["session"].text("default");
  auto it = sessions.find(id);
  if (it == sessions.end()) {
    Held h;
    h.world = std::make_unique<World>(s);
    h.world->geoid = geoid_grid(r["sources"]["geoid"].text());
    attach_environment_models(*h.world, r["sources"]);
    const std::size_t hw = std::max(2u, std::thread::hardware_concurrency());
    const std::size_t workers = r["workers"].is_number() ? std::size_t(std::max(1.0, r["workers"].as_number())) : std::min<std::size_t>(4, hw - 1);
    h.session = std::make_unique<Session>(*h.world, registry(), workers);
    it = sessions.emplace(id, std::move(h)).first;
  }
  Held& h = it->second;
  // The satellites' element sets, by group, read again when the files change.
  if (r["elements"].is_array()) {
    std::string key;
    for (std::size_t i = 0; i < r["elements"].size(); i++) key += r["elements"][i]["path"].text() + "|" + r["elements"][i]["stamp"].text() + ";";
    if (key != h.elements_key) {
      h.world->elements.clear();
      for (std::size_t i = 0; i < r["elements"].size(); i++) {
        const std::string path = r["elements"][i]["path"].text(), group = r["elements"][i]["group"].text();
        try {
          auto sets = navigation::orbits::read_tles(read_text(path));
          auto& into = h.world->elements[group];
          into.insert(into.end(), sets.begin(), sets.end());
        } catch (const std::exception&) {
          // A group whose file cannot be read is left out; its sensors say they have no elements.
        }
      }
      h.elements_key = key;
    }
  }
  return h;
}

Json event_json(const navigation::frames::Event& e) {
  return Json::object({{"frame", e.frame}, {"position_m", vec(e.position)}, {"direction", e.direction}, {"body", e.body}});
}
Json expression_json(const navigation::frames::Expression& x) {
  Json values = Json::object(), units = Json::object();
  for (const auto& v : x.values) {
    if (v.name == "mgrs") { values.set("mgrs", v.unit); continue; }
    values.set(v.name, v.value);
    if (!v.unit.empty()) units.set(v.name, v.unit);
  }
  return Json::object({{"frame", x.frame}, {"chart", x.chart}, {"values", values}, {"units", units},
                       {"address", navigation::frames::print_address(x.address, {7, 10})},
                       {"canonical", navigation::frames::print_address(x.address)}});
}

Json answer(const Json& r) {
  const std::string op = r["op"].text();
  Spacetime& s = world(r);
  if (op == "bodies") {
    namespace nf = navigation::frames;
    const mt::Instant start = instant_of(s, r["start"]);
    const double span = r["span"].is_number() ? r["span"].as_number() : 86400.0;
    const double step = r["step"].is_number() ? r["step"].as_number() : 600.0;
    if (!(step >= 1)) throw std::invalid_argument("bodies: a step of at least 1 s");
    const int count = std::min(4000, int(std::floor(span / step)) + 1);
    std::vector<std::string> keys;
    if (r["bodies"].is_array()) { for (std::size_t i = 0; i < r["bodies"].size(); i++) keys.push_back(r["bodies"][i].text()); }
    else { for (const auto& b : astronomy::ephemerides::BODIES) keys.push_back(std::string(b.key)); }
    std::vector<nf::BodyFrames> frames;
    for (const auto& k : keys) if (const auto b = nf::body_frames(s.catalogue(), k)) frames.push_back(*b);
    std::vector<Json> pos(frames.size(), Json::array()), velo(frames.size(), Json::array()), rot(frames.size(), Json::array());
    Json t = Json::array();
    const auto& g = s.catalogue().graph();
    for (int i = 0; i < count; i++) {
      const mt::Instant at = s.later(start, i * step);
      t.push(i * step);
      for (std::size_t b = 0; b < frames.size(); b++) {
        const auto centre = g.transform(frames[b].inertial, "ICRS", at);
        pos[b].push(vec(centre.b));
        velo[b].push(vec(centre.b_dot));
        const auto q = quaternion(g.transform(frames[b].fixed, "ICRS", at).r);
        rot[b].push(Json::array({q[0], q[1], q[2], q[3]}));
      }
    }
    Json bodies = Json::array();
    for (std::size_t b = 0; b < frames.size(); b++) {
      const auto info = astronomy::ephemerides::body(frames[b].key);
      bodies.push(Json::object({{"key", frames[b].key}, {"name", frames[b].name}, {"naif", info ? double(info->naif) : 0.0},
                                {"radius_m", info ? info->radius : 0.0}, {"gm_m3_s2", info ? info->gm : 0.0},
                                {"figure", frames[b].figure ? frames[b].figure->name() : std::string()},
                                {"equatorial_radius_m", frames[b].figure ? frames[b].figure->a() : 0.0},
                                {"fixed_frame", frames[b].fixed}, {"inertial_frame", frames[b].inertial},
                                {"position", pos[b]}, {"velocity", velo[b]}, {"rotation", rot[b]}}));
    }
    return Json::object({{"start", time_answer(s, start)}, {"step", step}, {"t", t}, {"frame", "ICRS"}, {"bodies", bodies},
                         {"units", "m, m/s; quaternions (w, x, y, z) of the active rotation from the body's fixed frame to the ICRS; t in seconds of TT from start"}});
  }
  if (op == "address") {
    namespace nf = navigation::frames;
    nf::Address a;
    try {
      a = nf::parse_address(r["text"].text());
    } catch (const nf::SyntaxError& e) {
      return Json::object({{"error", std::string(e.what())}, {"syntax", Json::object({{"column", double(e.column())}, {"expected", e.expected()}})}});
    }
    mt::Instant at;
    if (!a.instant.empty())
      at = a.instant == "now" ? instant_of(s, Json("unix:" + std::to_string(r["now_unix"].as_number()))) : instant_of(s, Json(a.instant));
    else
      at = instant_of(s, r["time"]);
    const auto& c = s.catalogue();
    const nf::Event e = nf::resolve(a, c);
    Json answers = Json::array();
    std::vector<std::pair<std::string, std::string>> asked;
    if (r["answers"].is_array()) {
      for (std::size_t i = 0; i < r["answers"].size(); i++) asked.push_back({r["answers"][i]["frame"].text(), r["answers"][i]["chart"].text()});
    } else {
      if (!e.body.empty()) {
        const auto b = nf::body_frames(c, e.body);
        if (b && b->surface) {
          asked.push_back({b->fixed, ""});
          if (b->key == "earth") { asked.push_back({"ITRS", "utm"}); asked.push_back({"ITRS", "mgrs"}); }
          asked.push_back({b->inertial, ""});
        }
      }
      const std::vector<std::pair<std::string, std::string>> standard = {{"ITRS", ""}, {"GCRS", ""}, {"TEME", "cartesian"}, {"ICRS", ""}, {"ICRS", "cartesian"},
                                                                         {"ECLIPTIC_J2000", ""}, {"GALACTIC", ""}, {"GALACTOCENTRIC", "cartesian"},
                                                                         {"EARTH_MOON_ROTATING", "cartesian"}};
      for (const auto& f : standard)
        if (std::find(asked.begin(), asked.end(), f) == asked.end()) asked.push_back(f);
    }
    for (const auto& [frame, chart] : asked) {
      try {
        answers.push(expression_json(nf::express(e, frame, chart, c, at)));
      } catch (const std::exception& x) {
        answers.push(Json::object({{"frame", frame}, {"chart", chart}, {"error", std::string(x.what())}}));
      }
    }
    Json out = Json::object({{"canonical", nf::print_address(a)}, {"display", nf::print_address(a, {7, 10})}, {"event", event_json(e)},
                             {"time", time_answer(s, at)}, {"answers", answers}});
    if (r["observer"].is_string() && !r["observer"].text().empty()) {
      try {
        const nf::Event o = nf::resolve(nf::parse_address(r["observer"].text()), c);
        Json seen = Json::object();
        for (const char* chart : {"aer", "enu", "ned"}) {
          try { seen.set(chart, expression_json(nf::express_from(e, o, chart, c, at))); } catch (const std::exception&) {}
        }
        out.set("from_the_observer", seen);
      } catch (const std::exception& x) {
        out.set("from_the_observer", Json::object({{"error", std::string(x.what())}}));
      }
    }
    if (r["charts"].is_bool() && r["charts"].as_bool()) {
      Json charts = Json::object();
      for (const auto& f : c.graph().frames()) {
        Json list = Json::array();
        for (const auto& x : nf::charts_of(c, f.name)) list.push(x);
        charts.set(f.name, list);
      }
      out.set("charts", charts);
      out.set("grammar", nf::address_grammar());
    }
    return out;
  }
  if (op == "instruments") {
    Json fams = Json::array(), ks = Json::array();
    for (const auto& i : registry().all()) fams.push(info_json(i->info()));
    for (const auto& k : kernels()) ks.push(Json::object({{"key", k.key}, {"title", k.title}, {"operator", k.operator_form}, {"examples", k.examples}}));
    Json prov = Json::array();
    for (Provenance p : {Provenance::physical, Provenance::archive, Provenance::model, Provenance::assimilated, Provenance::synthetic}) prov.push(name(p));
    return Json::object({{"families", fams}, {"kernels", ks}, {"provenance", prov}});
  }
  if (op == "acquire.configure") return session_of(s, r).session->configure(r);
  if (op == "acquire.describe") return session_of(s, r).session->describe();
  if (op == "acquire.step") return session_of(s, r).session->step(r);
  if (op == "acquire.analyse") return session_of(s, r).session->analyse(r);
  if (op == "status") {
    const auto cov = s.catalogue().kernels().spk->coverage();
    Json a = Json::object({{"ephemeris", s.sources().ephemeris}, {"ephemeris_coverage_et", Json::array({cov.first, cov.second})},
                           {"moon_frames", s.catalogue().has_moon_pa() ? "DE440 (MOON_PA, MOON_ME)" : "IAU model (IAU_MOON)"},
                           {"leap_seconds", s.scales().leap_seconds().source()},
                           {"leap_seconds_valid_until_mjd", s.scales().leap_seconds().valid_until_mjd()},
                           {"frames", static_cast<double>(s.catalogue().graph().frames().size())}});
    if (const auto* e = s.earth_orientation())
      a.set("earth_orientation", Json::object({{"source", e->source()}, {"first_mjd", e->first_mjd()}, {"last_mjd", e->last_mjd()}, {"first_predicted_mjd", e->first_predicted_mjd()}}));
    else
      a.set("earth_orientation", nullptr);
    return a;
  }
  if (op == "time") return time_answer(s, instant_of(s, r["time"]));
  if (op == "frames") {
    const auto& g = s.catalogue().graph();
    Json frames = Json::array(), relations = Json::array();
    for (const auto& f : g.frames())
      frames.push(Json::object({{"name", f.name}, {"parent", f.parent >= 0 ? Json(g.frames()[f.parent].name) : Json(nullptr)}, {"about", f.about}}));
    for (const auto& x : g.relations())
      relations.push(Json::object({{"name", x.name}, {"from", g.frames()[x.from].name}, {"to", g.frames()[x.to].name}, {"about", x.about}}));
    return Json::object({{"frames", frames}, {"relations", relations}});
  }
  if (op == "ephemeris") {
    const mt::Instant start = instant_of(s, r["start"]);
    const double span = r["span"].is_number() ? r["span"].as_number() : 86400.0;
    double step = r["step"].is_number() ? r["step"].as_number() : 600.0;
    if (!(step >= 1)) throw std::invalid_argument("ephemeris: a step of at least 1 s");
    const int count = std::min(4000, int(std::floor(span / step)) + 1);
    const bool pa = s.catalogue().has_moon_pa();
    const std::string moon_frame = pa ? "MOON_ME" : "IAU_MOON";
    Json t = Json::array(), earth = Json::array(), moon_q = Json::array(), moon_p = Json::array(), moon_v = Json::array(), sun = Json::array(), sun_v = Json::array();
    for (int i = 0; i < count; i++) {
      const mt::Instant at = s.later(start, i * step);
      const auto e = s.transform("ITRS", "GCRS", at);
      const auto m = s.transform(moon_frame, "GCRS", at);
      const auto sn = s.transform("SUN_ICRS", "GCRS", at);
      t.push(i * step);
      const auto qe = quaternion(e.r), qm = quaternion(m.r);
      earth.push(Json::array({qe[0], qe[1], qe[2], qe[3]}));
      moon_q.push(Json::array({qm[0], qm[1], qm[2], qm[3]}));
      moon_p.push(vec(m.b));
      moon_v.push(vec(m.b_dot));
      sun.push(vec(sn.b));
      sun_v.push(vec(sn.b_dot));
    }
    return Json::object({{"start", time_answer(s, start)}, {"step", step}, {"t", t}, {"earth_itrs_to_gcrs", earth}, {"moon_frame", moon_frame},
                         {"moon_to_gcrs", moon_q}, {"moon_position", moon_p}, {"moon_velocity", moon_v}, {"sun_position", sun}, {"sun_velocity", sun_v},
                         {"frame", "GCRS"}, {"units", "m, m/s; quaternions (w, x, y, z) of the active rotation from the body's frame to the GCRS; t in seconds of TT from start"}});
  }
  if (op == "transform") {
    const mt::Instant at = instant_of(s, r["time"]);
    const auto x = s.transform(r["from"].text(), r["to"].text(), at);
    Json positions = Json::array(), velocities = Json::array();
    const Json& ps = r["positions"];
    const Json& vs = r["velocities"];
    for (std::size_t i = 0; i < ps.size(); i++) {
      const Vec3 p = vec_of(ps[i]);
      const Vec3 v = vs.is_array() && i < vs.size() ? vec_of(vs[i]) : Vec3{0, 0, 0};
      const auto st = x.state(p, v);
      positions.push(vec(st[0]));
      velocities.push(vec(st[1]));
    }
    return Json::object({{"rotation", mat(x.r)}, {"translation", vec(x.b)}, {"rotation_rate", mat(x.r_dot)}, {"velocity", vec(x.b_dot)},
                         {"angular_velocity", vec(x.angular_velocity())}, {"positions", positions}, {"velocities", velocities},
                         {"path", [&] {
                            Json path = Json::array();
                            const auto& g = s.catalogue().graph();
                            for (int f : g.path(g.require(r["from"].text()), g.require(r["to"].text()))) path.push(g.frames()[f].name);
                            return path;
                          }()}});
  }
  if (op == "holonomy") {
    const mt::Instant at = instant_of(s, r["time"]);
    const auto& g = s.catalogue().graph();
    Json loops = Json::array();
    for (std::size_t i = 0; i < g.relations().size(); i++) {
      const auto d = physis::geometry::deviation(g.holonomy(int(i), at));
      const auto& rel = g.relations()[i];
      loops.push(Json::object({{"name", rel.name}, {"from", g.frames()[rel.from].name}, {"to", g.frames()[rel.to].name}, {"about", rel.about},
                               {"angle", d.angle}, {"angle_mas", d.angle / metrology::frames::ARCSEC * 1e3}, {"slide", d.slide}, {"translation", d.translation}}));
    }
    return Json::object({{"time", time_answer(s, at)}, {"loops", loops}});
  }
  if (op == "convert") {
    const mt::Instant at = instant_of(s, r["time"]);
    Json a = coordinates(r).convert(s, r, at);
    a.set("time", time_answer(s, at));
    return a;
  }
  if (op == "geodesic") return coordinates(r).geodesic(r);
  if (op == "satellites") {
    static const Satellites satellites;
    const mt::Instant at = instant_of(s, r["time"]);
    Json a = satellites.answer(s, r, at);
    a.set("time", time_answer(s, at));
    return a;
  }
  throw std::invalid_argument("unknown op: " + op);
}

Json safely(const std::string& line) {
  try {
    return answer(Json::parse(line));
  } catch (const std::exception& e) {
    return Json::object({{"error", std::string(e.what())}});
  }
}

}  // namespace

int main(int argc, char** argv) {
  std::ios::sync_with_stdio(false);
  const bool serve = argc > 1 && std::string(argv[1]) == "--serve";
  if (serve) {
    std::string line;
    while (std::getline(std::cin, line)) {
      if (line.empty()) continue;
      std::cout << safely(line).dump() << "\n";
      std::cout.flush();
    }
    return 0;
  }
  std::string text((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
  const Json a = safely(text);
  std::cout << a.dump() << "\n";
  return a.has("error") ? 1 : 0;
}
