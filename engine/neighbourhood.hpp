// The neighbourhood of an event as an instrument reads it: a cube about the event, cut into n³ cells,
// in each of which the instrument's family is read as if it were mounted at the cell's centre
// (formalism Definition 3.10: a visual expression is a mark composed with a reduction and a
// restriction; here the restriction is of the family's observation operator to a cubical region).
//
// The concept. A family whose reading is a function of where it is mounted (a point probe of a field,
// a line of sight from the place, a ranging from it) defines, at one instant, a field over space: the
// map x ↦ H_m(Σ(t), x, ε) of formalism Definition 8.5, from the mount's place to its reading. A cube
// samples that map at the centres of its cells; its reduction is to the reading's numeric scalars,
// each with its unit, and to its vector, turned into the cube's axes; its mark (slices, isosurfaces,
// volume rendering) is the page's. A family whose reading is not a function of the place (a clock, an
// estimator, a feed, an event detector, an agent's own state) has no such field and is refused, with
// the reason. Where the family cannot read (outside its coverage, its data missing, its operator ill
// posed there), a cell has no value (NaN, null in JSON) and its reason is counted, never a zero
// (formalism §3.2 and Definition 8.9).
//
// The cube. Its centre is the event an address names, resolved as a sensor's mount is
// (acquisition.hpp, mount_state): it must be on or near a body with a surface, whose figure gives the
// cube its axes, the local east, north and up of the figure at the centre (geodesy figure Place: the
// rows of R are E, N and U in the body's fixed frame), even when the centre is high above the ground.
// The cube's edges are straight in the fixed frame. Its cell (i, j, k), 0 ≤ i, j, k < n, has its centre
// at the offset
//   o = (((i + ½)/n − ½) a, ((j + ½)/n − ½) a, ((k + ½)/n − ½) a)   along east, north and up,
// a the edge, so that the cell is at x = x₀ + Rᵀ o in the fixed frame; its index is i + n (j + n k),
// east fastest (Fortran's order, as visualization/js/isosurface.js reads a volume). These are the cells
// of physis's VolumeGrid about x₀ with the axes R, which field.sample reads a field on (fields.hpp): a
// family's cube and a field's are on one grid. With n odd, the middle cell's offset is exactly zero,
// and its reading is the family's at the centre itself.
//
// Each cell is a mount of its own: its place on the figure, whether it stands on the body (the rule of
// mount_state), its places in the GCRS and the ICRS (one transform of the fixed frame at the instant),
// and the family's settings from the request. Its noise is keyed by the world's seed, the family, the
// cell's index and the purpose PROBE_VOLUME_STREAM, so that the cube is a function of the request and
// the world alone, on any number of threads (formalism Proposition 8.6).
//
// The vector. A reading that carries north_X, east_X and down_X (the magnetometers: north_T, east_T,
// down_T) is a vector in its own cell's local north, east and down; one that carries vector_enu_X (the
// gravimeter: vector_enu_m_s2) is a vector in its own cell's local east, north and up. Each is turned
// into the fixed frame by its cell's own local frame and then into the cube's axes by R:
//   v_cube = R R_cellᵀ v_enu,cell,
// R_cell the ENU rotation at the cell's latitude and longitude on the figure. Across a cube a thousand
// kilometres wide the local verticals differ by some nine degrees, so that taking the components as
// the cube's would be wrong by as much. The answer's vector is given in the cube's axes alone; the
// scalars north_T, east_T and down_T keep their own cells' frames, as the instrument reads them.
//
// Caveat. The cube reads the family at one instant; the light time across it and the motion of its
// cells during a reading are neglected, as they are for a sensor.

#pragma once

#include <algorithm>
#include <atomic>
#include <bit>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <limits>
#include <map>
#include <numbers>
#include <optional>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include <calx/scheduler/thread_pool.hpp>
#include <physis/fields/sampling.hpp>

#include "acquisition.hpp"
#include "instruments.hpp"

namespace cosmopoiesis {

// ---- base64 of float32 ---------------------------------------------------------------------------------

// Base64 (RFC 4648 §4) of bytes: a grid's or a volume's values as little-endian float32, a sixth of the
// text of their decimal digits, for the pipe between the engine and its server. NaN survives it.
inline std::string base64(const unsigned char* data, std::size_t n) {
  static const char* table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve((n + 2) / 3 * 4);
  for (std::size_t i = 0; i < n; i += 3) {
    const unsigned v = unsigned(data[i]) << 16 | (i + 1 < n ? unsigned(data[i + 1]) << 8 : 0u) | (i + 2 < n ? unsigned(data[i + 2]) : 0u);
    out += table[v >> 18 & 63];
    out += table[v >> 12 & 63];
    out += i + 1 < n ? table[v >> 6 & 63] : '=';
    out += i + 2 < n ? table[v & 63] : '=';
  }
  return out;
}
inline std::string float32_base64(const std::vector<double>& xs) {
  static_assert(std::endian::native == std::endian::little, "float32 values are sent little-endian");
  std::vector<float> packed(xs.begin(), xs.end());
  return base64(reinterpret_cast<const unsigned char*>(packed.data()), packed.size() * sizeof(float));
}

// ---- which families are fields over space --------------------------------------------------------------

// Why a kernel's readings are not a field over space, or "" when they are (point probes, lines of sight
// and rangings read from the place they are mounted at).
inline std::string not_a_field(Kernel k) {
  switch (k) {
    case Kernel::point_probe:
    case Kernel::line_of_sight:
    case Kernel::ranging: return "";
    case Kernel::clock: return "a clock's reading is not a field over space: it reads the instant, the same in every cell";
    case Kernel::proprioceptive: return "a proprioceptive reading is of the mount's own state (an ideal probe of where it is), not a field it samples: the cube's cells are its places already";
    case Kernel::footprint: return "a footprint integrates over a region about its mount (a column, a pixel), not a value at a point: its readings are not a field of cells";
    case Kernel::counter: return "a counter's reading is a count over a window of time, not a value of a field at a point";
    case Kernel::event_detector: return "an event detector reports the crossings of a guard, not values over space";
    case Kernel::protocol: return "a protocol's result comes from a sample taken through stages, not from a point of space";
    case Kernel::quantum: return "a quantum measurement's outcome is drawn from a state, not read from a field over space";
    case Kernel::estimator: return "an estimator's reading is an estimate from other readings, not a field over space";
    case Kernel::feed: return "a feed's readings are delivered by another system, not computed at points of space";
  }
  return "its kernel is not a field over space";
}

// The purpose of the noise of a cube's readings ("CUBE"), apart from every sensor's.
inline constexpr std::uint32_t PROBE_VOLUME_STREAM = 0x43554245;

// The limits of a cube.
inline constexpr int PROBE_VOLUME_MIN_N = 2, PROBE_VOLUME_MAX_N = 24;
inline constexpr double PROBE_VOLUME_MIN_EDGE_M = 1.0, PROBE_VOLUME_MAX_EDGE_M = 2e7;

// ---- the request -----------------------------------------------------------------------------------------

struct VolumeRequest {
  std::string family;                   // an instrument family, or
  std::string field;                    // a field of the world (fields.hpp), read on the same cells
  double edge_m = 0;                    // the cube's edge, m
  int n = 0;                            // cells along an edge
  std::vector<std::string> quantities;  // empty: every numeric scalar the readings carry
  Json settings = Json::object();       // the family's settings, as SensorSpec.settings
  bool f32 = false;                     // values as base64 of float32, else JSON numbers
  std::size_t threads = 0;              // 0: the hardware's

  static VolumeRequest from(const Json& r) {
    VolumeRequest q;
    q.family = r["family"].text();
    q.field = r["field"].text();
    if (q.family.empty() == q.field.empty())
      throw std::invalid_argument("probe_volume: name an instrument family, as \"magnetometer.wmm2025\", or a field of the world, as \"earth.magnetic\"");
    if (!r["n"].is_number() || r["n"].as_number() != std::floor(r["n"].as_number()) || r["n"].as_number() < PROBE_VOLUME_MIN_N ||
        r["n"].as_number() > PROBE_VOLUME_MAX_N)
      throw std::invalid_argument("probe_volume: n, the cells along an edge, is a whole number from " + std::to_string(PROBE_VOLUME_MIN_N) + " to " +
                                  std::to_string(PROBE_VOLUME_MAX_N));
    q.n = int(r["n"].as_number());
    if (!r["edge_m"].is_number() || !(r["edge_m"].as_number() >= PROBE_VOLUME_MIN_EDGE_M && r["edge_m"].as_number() <= PROBE_VOLUME_MAX_EDGE_M))
      throw std::invalid_argument("probe_volume: edge_m, the cube's edge, is from 1 m to 20 000 km");
    q.edge_m = r["edge_m"].as_number();
    if (r["quantities"].is_array())
      for (std::size_t i = 0; i < r["quantities"].size(); i++) {
        if (!r["quantities"][i].is_string()) throw std::invalid_argument("probe_volume: quantities are names, as \"total_T\"");
        q.quantities.push_back(r["quantities"][i].as_string());
      }
    if (r["settings"].is_object()) q.settings = r["settings"];
    const std::string enc = r["encoding"].text("json");
    if (enc != "json" && enc != "f32") throw std::invalid_argument("probe_volume: the encoding is json or f32");
    q.f32 = enc == "f32";
    if (r["threads"].is_number()) q.threads = std::size_t(std::clamp(r["threads"].as_number(), 1.0, 64.0));
    return q;
  }
};

// ---- the cube ---------------------------------------------------------------------------------------------

namespace volume_detail {

struct Cell {
  Quality quality = Quality::valid;
  bool read = false;
  std::string reason;
  Json values;
  gf::Geodetic geodetic{};
};

inline double deg(double rad) { return rad * 180 / std::numbers::pi; }

// The extremes of the finite values, or nulls.
inline std::pair<Json, Json> extremes(const std::vector<double>& xs) {
  double lo = std::numeric_limits<double>::infinity(), hi = -lo;
  for (double x : xs)
    if (std::isfinite(x)) lo = std::min(lo, x), hi = std::max(hi, x);
  if (!(lo <= hi)) return {Json(), Json()};
  return {Json(lo), Json(hi)};
}

inline Json values_json(const std::vector<double>& xs, bool f32) {
  if (f32) return Json(float32_base64(xs));
  Json a = Json::array();
  for (double x : xs) a.push(x);
  return a;
}

// The name of a vector by the suffix its components share, and its unit where none is declared.
inline std::string vector_name(const std::string& suffix) {
  if (suffix == "T") return "B";
  if (suffix == "m_s2") return "g";
  return suffix;
}
inline std::string unit_of_suffix(const std::string& suffix) {
  if (suffix == "T") return "T";
  if (suffix == "m_s2") return "m/s²";
  if (suffix == "m_s") return "m/s";
  if (suffix == "m") return "m";
  return suffix;
}

inline bool scalar(const Json& v) { return v.is_number(); }

}  // namespace volume_detail

// The figure of the body a cube stands on, and the cube's axes about its centre: the body's east, north
// and up there (rows, in the fixed frame); or why there are none.
inline std::pair<gf::Ellipsoid, Mat3> cube_axes(const World& w, const MountState& centre, const std::string& canonical) {
  const auto b = centre.body.empty() ? std::nullopt : nf::body_frames(w.catalogue(), centre.body);
  if (!b || !b->surface || !b->figure)
    throw std::invalid_argument("the cube's axes are a body's east, north and up: its centre must be on or near a body with a surface, and " + canonical +
                                " is in open space");
  return {*b->figure, gf::Place::at(*b->figure, centre.geodetic).to_enu};
}

// The centre, the axes and the time of a cube's answer.
inline Json cube_frame_json(const World& w, const MountState& centre, const std::string& canonical, const gf::Ellipsoid& figure, const Mat3& R,
                            const mt::Instant& t, double tt) {
  const auto& ts = w.spacetime().scales();
  const Json rows = Json::array({Json::array({R[0][0], R[0][1], R[0][2]}), Json::array({R[1][0], R[1][1], R[1][2]}), Json::array({R[2][0], R[2][1], R[2][2]})});
  return Json::object({{"time", Json::object({{"utc", t.has_utc ? Json(mt::format_iso(t.utc, mt::Scale::UTC, ts, 3)) : Json()}, {"tt_s", tt}})},
                       {"centre", Json::object({{"address", canonical}, {"body", centre.body}, {"frame", centre.fixed_frame},
                                                {"fixed_m", Json::array({centre.fixed[0], centre.fixed[1], centre.fixed[2]})},
                                                {"latitude_deg", volume_detail::deg(centre.geodetic.latitude)},
                                                {"longitude_deg", volume_detail::deg(centre.geodetic.longitude)},
                                                {"height_m", centre.geodetic.height}, {"figure", figure.name()}})},
                       {"axes", Json::object({{"names", Json::array({"east", "north", "up"})}, {"rotation", rows},
                                              {"about", "the rows are the cube's east, north and up in the fixed frame; a cell's place is x₀ + Rᵀ o"}})}});
}

// The cube of `q` about `centre` (a mount's place, as mount_state gives it, whose address prints as
// `canonical`) at the instant t, read in the world w by the registry's family.
inline Json probe_volume(const World& w, const Registry& registry, const VolumeRequest& q, const MountState& centre, const std::string& canonical,
                         const mt::Instant& t) {
  namespace vd = volume_detail;
  const auto started = std::chrono::steady_clock::now();
  const Instrument* in = registry.find(q.family);
  if (!in) throw std::invalid_argument(unknown_family(q.family));
  const InstrumentInfo& info = in->info();
  if (const std::string why = not_a_field(in->kernel()); !why.empty()) throw std::invalid_argument(q.family + ": " + why);
  const auto& c = w.catalogue();
  const auto axes = cube_axes(w, centre, canonical);
  const gf::Ellipsoid& figure = axes.first;
  const Mat3 R = axes.second;
  const auto& g = c.graph();
  const StateTransform to_gcrs = g.transform(centre.fixed_frame, "GCRS", t), to_icrs = g.transform(centre.fixed_frame, "ICRS", t);
  const double tt = t.tt.minus({2451545.0, 0.0}) * mt::DAY;
  const Coverage coverage = in->coverage(w);
  const Snapshot snap(w, t, tt);
  const int n = q.n;
  const std::size_t nn = std::size_t(n), cells = nn * nn * nn;
  const double a = q.edge_m;
  const physis::fields::VolumeGrid grid{centre.fixed, R, {a, a, a}, {n, n, n}};
  const std::uint32_t family_key = key_of(q.family);

  // Each cell read as a mount of its own.
  std::vector<vd::Cell> out(cells);
  const auto sample = [&](std::size_t index) {
    vd::Cell& cell = out[index];
    MountState m;
    m.address = canonical;
    m.body = centre.body;
    m.fixed_frame = centre.fixed_frame;
    m.fixed = grid.point(index);
    m.geodetic = figure.geodetic(m.fixed);
    m.on_body = m.geodetic.height < 0.05 * figure.a();
    m.gcrs = to_gcrs.position(m.fixed);
    m.icrs = to_icrs.position(m.fixed);
    m.settings = q.settings;
    cell.geodetic = m.geodetic;
    try {
      const Availability ok = coverage.check(m, tt, w.now_tt);
      if (!ok.ok) {
        cell.quality = Quality::outside;
        cell.reason = ok.reason;
        return;
      }
      Noise noise(w.seed, family_key, static_cast<std::uint32_t>(index), PROBE_VOLUME_STREAM);
      cell.values = in->measure(snap, m, noise);
      cell.read = true;
    } catch (const Unavailable& e) {
      cell.quality = e.quality();
      cell.reason = e.what();
    } catch (const std::exception& e) {
      cell.quality = Quality::invalid;
      cell.reason = e.what();
    }
  };
  // On several threads, the cells taken a few at a time; each writes its own cell alone, so that the
  // cube does not depend on which thread read which.
  std::size_t threads = q.threads ? q.threads : std::max(1u, std::thread::hardware_concurrency());
  threads = std::clamp<std::size_t>(threads, 1, std::max<std::size_t>(1, cells / 8));
  {
    std::atomic<std::size_t> next{0};
    constexpr std::size_t chunk = 8;
    calx::scheduler::ThreadPool pool(threads);
    pool.run([&](std::size_t) {
      for (;;) {
        const std::size_t from = next.fetch_add(chunk, std::memory_order_relaxed);
        if (from >= cells) return;
        for (std::size_t index = from; index < std::min(cells, from + chunk); index++) sample(index);
      }
    });
  }

  // The counts and the reasons.
  double read = 0, outside = 0, missing = 0, invalid = 0;
  std::map<std::pair<std::string, std::string>, double> reasons;
  for (const auto& cell : out) {
    if (cell.read) { read++; continue; }
    (cell.quality == Quality::outside ? outside : cell.quality == Quality::missing ? missing : invalid)++;
    reasons[{cell.reason, name(cell.quality)}]++;
  }
  std::vector<std::pair<std::pair<std::string, std::string>, double>> ranked(reasons.begin(), reasons.end());
  std::stable_sort(ranked.begin(), ranked.end(), [](const auto& x, const auto& y) { return x.second > y.second; });
  Json reasons_json = Json::array();
  for (const auto& [why, count] : ranked) reasons_json.push(Json::object({{"reason", why.first}, {"quality", why.second}, {"count", count}}));

  // The numeric scalars the readings carry: the declared ones in their order, then the others as they
  // first appear, cell by cell.
  std::vector<std::string> seen;
  const auto is_seen = [&](const std::string& s) { return std::find(seen.begin(), seen.end(), s) != seen.end(); };
  {
    std::vector<std::string> found;
    for (const auto& cell : out)
      if (cell.read && cell.values.is_object())
        for (const auto& [key, value] : cell.values.as_object())
          if (vd::scalar(value) && std::find(found.begin(), found.end(), key) == found.end()) found.push_back(key);
    for (const auto& d : info.quantities)
      if (std::find(found.begin(), found.end(), d.name) != found.end()) seen.push_back(d.name);
    for (const auto& f : found)
      if (!is_seen(f)) seen.push_back(f);
  }
  if (read > 0 && seen.empty()) {
    std::string carried;
    for (const auto& d : info.quantities) carried += (carried.empty() ? "" : "; ") + d.name + (d.about.empty() ? std::string() : ": " + d.about);
    throw std::invalid_argument(q.family + ": its readings carry no numeric scalar (" + carried + "), so there is nothing to fill a cube with");
  }
  std::vector<std::string> names = q.quantities.empty() ? seen : q.quantities;
  // A quantity asked for is a number some cell read; where no cell read, one the family declares.
  for (const auto& nm : q.quantities) {
    const bool declared = std::any_of(info.quantities.begin(), info.quantities.end(), [&](const QuantityInfo& d) { return d.name == nm; });
    if (read > 0 ? !is_seen(nm) : !declared) {
      std::string list;
      for (const auto& s : seen) list += (list.empty() ? "" : ", ") + s;
      throw std::invalid_argument(q.family + " reads no numeric quantity " + nm + (list.empty() ? std::string() : "; its numeric quantities are " + list));
    }
  }
  const auto declared_of = [&](const std::string& nm) -> const QuantityInfo* {
    for (const auto& d : info.quantities)
      if (d.name == nm) return &d;
    return nullptr;
  };
  const auto number_at = [&](const vd::Cell& cell, const std::string& nm) {
    if (!cell.read) return std::numeric_limits<double>::quiet_NaN();
    const Json* v = cell.values.find(nm);
    return v && v->is_number() ? v->as_number() : std::numeric_limits<double>::quiet_NaN();
  };
  Json quantities = Json::array();
  for (const auto& nm : names) {
    std::vector<double> xs(cells);
    for (std::size_t i = 0; i < cells; i++) xs[i] = number_at(out[i], nm);
    const auto [lo, hi] = vd::extremes(xs);
    const QuantityInfo* d = declared_of(nm);
    Json qj = Json::object({{"name", nm}, {"unit", d ? d->unit : std::string()}, {"about", d ? d->about : std::string()}, {"min", lo}, {"max", hi}});
    qj.set(q.f32 ? "values_f32" : "values", vd::values_json(xs, q.f32));
    quantities.push(qj);
  }

  // The vector, in the cube's axes.
  Json vector;
  {
    std::string suffix;
    bool ned = false;
    for (const auto& s : seen)
      if (s.rfind("north_", 0) == 0 && is_seen("east_" + s.substr(6)) && is_seen("down_" + s.substr(6))) { suffix = s.substr(6); ned = true; break; }
    if (!ned)
      for (const auto& cell : out) {
        if (!cell.read || !cell.values.is_object()) continue;
        for (const auto& [key, value] : cell.values.as_object())
          if (key.rfind("vector_enu_", 0) == 0 && value.is_array() && value.size() == 3) { suffix = key.substr(11); break; }
        if (!suffix.empty()) break;
      }
    if (!suffix.empty()) {
      std::vector<double> ve(cells), vn(cells), vu(cells);
      double max_norm = 0;
      bool any = false;
      for (std::size_t i = 0; i < cells; i++) {
        const auto& cell = out[i];
        Vec3 enu{std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::quiet_NaN()};
        if (cell.read) {
          if (ned) {
            enu = {number_at(cell, "east_" + suffix), number_at(cell, "north_" + suffix), -number_at(cell, "down_" + suffix)};
          } else if (const Json* v = cell.values.find("vector_enu_" + suffix); v && v->is_array() && v->size() == 3) {
            enu = {(*v)[0].as_number(), (*v)[1].as_number(), (*v)[2].as_number()};
          }
        }
        // v_cube = R R_cellᵀ v_enu: the cell's local frame to the fixed frame, then to the cube's axes.
        const Mat3 rc = gf::ecef_to_enu(cell.geodetic.latitude, cell.geodetic.longitude);
        const Vec3 fixed = physis::geometry::transpose(rc) * enu;
        const Vec3 cube = R * fixed;
        ve[i] = cube[0], vn[i] = cube[1], vu[i] = cube[2];
        const double norm = std::sqrt(cube[0] * cube[0] + cube[1] * cube[1] + cube[2] * cube[2]);
        if (std::isfinite(norm)) max_norm = std::max(max_norm, norm), any = true;
      }
      const QuantityInfo* d = declared_of(ned ? "north_" + suffix : "vector_enu_" + suffix);
      const std::string unit = d && !d->unit.empty() ? d->unit : vd::unit_of_suffix(suffix);
      vector = Json::object({{"name", vd::vector_name(suffix)}, {"unit", unit}, {"frame", "the cube's axes: east, north, up at its centre"},
                             {"from", ned ? "north_" + suffix + ", east_" + suffix + ", down_" + suffix + " in each cell's local north, east, down"
                                          : "vector_enu_" + suffix + " in each cell's local east, north, up"}});
      vector.set("east", vd::values_json(ve, q.f32));
      vector.set("north", vd::values_json(vn, q.f32));
      vector.set("up", vd::values_json(vu, q.f32));
      vector.set("max_norm", any ? Json(max_norm) : Json());
    }
  }

  const double elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
  Json answer = Json::object({{"family", info.family}, {"title", info.title}, {"kernel", kernel_info(info.kernel).key}, {"provenance", name(info.provenance)},
                              {"about", info.about}, {"model", info.model}});
  const Json frame = cube_frame_json(w, centre, canonical, figure, R, t, tt);
  for (const char* k : {"time", "centre", "axes"}) answer.set(k, frame[k]);
  answer.set("n", double(n));
  answer.set("edge_m", a);
  answer.set("cell_m", a / n);
  answer.set("order", "east fastest, then north, then up");
  answer.set("quantities", quantities);
  answer.set("vector", vector);
  answer.set("counts", Json::object({{"read", read}, {"outside", outside}, {"missing", missing}, {"invalid", invalid}}));
  answer.set("reasons", reasons_json);
  answer.set("threads", double(threads));
  answer.set("elapsed_s", elapsed);
  return answer;
}

}  // namespace cosmopoiesis
