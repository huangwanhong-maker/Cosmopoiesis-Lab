// The world's fields (decision 0007; formalism §3; the infrastructure's ADR 0053, physis decision 0012).
//
// Every field the world holds, by name, as one of physis's fields with its descriptor (its base, fibre,
// representation and provenance, and the capabilities of its representation), and the operations that
// read them: the catalogue, a field read on a sampling, and its integral curves. The fields are the
// domains' own (the field.hpp of geophysics, geodesy, meteorology and planetary science), bound here
// to this world:
//
//   earth.magnetic             WMM2025 on its base, its time the world's: TT seconds from J2000.0, a
//                              decimal year of UTC through metrology's leap seconds;
//   earth.magnetic.core        the same continued outward: beyond 850 km the core's field alone;
//   earth.gravity.normal       the normal gravity of WGS 84's level ellipsoid, on the rotating axes;
//   earth.atmosphere.*         the 1976 standard's temperature, pressure, density and speed of sound,
//                              carried into space by the height above the world's geoid (EGM96), or
//                              above the ellipsoid, with a note, when the geoid is not loaded;
//   moon.magnetic.crust        T2015_449 (assimilated);
//   moon.magnetic.unresolved   the scales it leaves unresolved, to degree 720, drawn with the world's
//                              seed (synthetic);
//   moon.magnetic              their sum, of the more derived provenance of the two (synthetic).
//
// A field whose model the world has not loaded is listed with the reason, as a declared instrument is,
// not left out. Positions are on the axes of the field's frame (ITRS, MOON_ME), in metres, and a
// sampling is given in that frame. Values cross the pipe as float32 in base64 (neighbourhood.hpp),
// NaN where there is none; each point's quality as a byte (physis's order: valid, outside, missing,
// invalid), and its reason or note as an index into the answer's lists.

#pragma once

#include <algorithm>
#include <array>
#include <bit>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <variant>
#include <vector>

#include <geodesy/gravity/field.hpp>
#include <geophysics/geomagnetism/field.hpp>
#include <meteorology/atmosphere/field.hpp>
#include <physis/fields/any.hpp>
#include <physis/fields/compose.hpp>
#include <physis/fields/curves.hpp>
#include <physis/fields/reductions.hpp>
#include <physis/fields/sampling.hpp>
#include <planetary_science/magnetism/field.hpp>
#include <science/json.hpp>

#include "environment.hpp"
#include "instruments.hpp"
#include "lunar.hpp"
#include "neighbourhood.hpp"

namespace cosmopoiesis {

namespace pf = physis::fields;

// ---- the catalogue -------------------------------------------------------------------------------------

struct WorldField {
  pf::Descriptor descriptor;
  pf::VectorField vector;  // a vector field, or
  pf::ScalarField scalar;  // a scalar field; neither when its model is not loaded,
  std::string missing;     // and then why
  Json extra;              // what its domain adds to the descriptor (the Moon's spectral law), or null
  bool available() const { return static_cast<bool>(vector) || static_cast<bool>(scalar); }
};

namespace fields_detail {

// TT seconds from J2000.0 as a decimal year of UTC (metrology's leap seconds); NaN before UTC. The last
// conversion is kept, since the queries of a sampling or a curve share their instant.
inline std::function<double(double)> decimal_year_of(const Spacetime& s) {
  const mt::TimeScales* scales = &s.scales();
  return [scales](double tt_s) {
    thread_local const mt::TimeScales* by = nullptr;
    thread_local double last_t = std::numeric_limits<double>::quiet_NaN(), last_year = 0;
    if (by != scales || tt_s != last_t) {
      const mt::Instant i = scales->instant(mt::JulianDate{2451545.0, 0.0}.plus_seconds(tt_s), mt::Scale::TT);
      last_year = i.has_utc ? geophysics::geomagnetism::decimal_year(i.utc) : std::numeric_limits<double>::quiet_NaN();
      last_t = tt_s;
      by = scales;
    }
    return last_year;
  };
}

// A point of the ITRS as its height above mean sea level: the WGS 84 height less the geoid's undulation.
struct HeightAboveSea {
  std::shared_ptr<const geodesy::geoid::GeoidGrid> geoid;
  pf::Evaluation<double> operator()(const pf::Query<Vec3>& q) const {
    static const geodesy::figure::Ellipsoid wgs84 = geodesy::figure::Ellipsoid::wgs84();
    const geodesy::figure::Geodetic p = wgs84.geodetic(q.x);
    if (!std::isfinite(p.height)) return pf::refused<double>(pf::Quality::invalid, "no height: the point is at the Earth's centre");
    if (!geoid) return pf::valid(p.height, "height above the ellipsoid: the geoid is not loaded");
    return pf::valid(p.height - geoid->undulation(p.latitude, p.longitude));
  }
};

inline WorldField unavailable(std::string name, std::string title, std::string frame, std::string why) {
  WorldField f;
  f.descriptor.name = std::move(name);
  f.descriptor.title = std::move(title);
  f.descriptor.frame = std::move(frame);
  f.missing = std::move(why);
  return f;
}

template <class F>
WorldField vector_field(F f) {
  WorldField w;
  w.vector = pf::VectorField(std::move(f));
  w.descriptor = w.vector.descriptor();
  return w;
}
template <class F>
WorldField scalar_field(F f) {
  WorldField w;
  w.scalar = pf::ScalarField(std::move(f));
  w.descriptor = w.scalar.descriptor();
  return w;
}

}  // namespace fields_detail

// The fields of one world, for its models, its geoid and its seed.
class WorldFields {
 public:
  explicit WorldFields(const World& w) {
    namespace fd = fields_detail;
    namespace gm = geophysics::geomagnetism;
    namespace pm = planetary_science::magnetism;
    namespace ma = meteorology::atmosphere;
    // The Earth's magnetic field.
    const auto wmm = Magnetometer::coefficients(w);
    const std::string no_wmm = "the World Magnetic Model is not loaded (python data/acquisition/fetch.py noaa-wmm)";
    if (wmm) {
      for (const auto extent : {gm::WmmField::Extent::model, gm::WmmField::Extent::continued}) {
        all_.push_back(fd::vector_field(gm::WmmField(wmm, fd::decimal_year_of(w.spacetime()), extent)));
        all_.back().descriptor.time = "TT seconds from J2000.0, read as a decimal year of UTC";
      }
    } else {
      all_.push_back(fd::unavailable("earth.magnetic", "The geomagnetic field (WMM2025)", "ITRS", no_wmm));
      all_.push_back(fd::unavailable("earth.magnetic.core", "The core's field (WMM2025), continued outward", "ITRS", no_wmm));
    }
    // Normal gravity.
    all_.push_back(fd::vector_field(geodesy::gravity::NormalGravityField()));
    // The standard atmosphere, carried into space by the height above mean sea level.
    for (const ma::Quantity q : {ma::Quantity::temperature, ma::Quantity::pressure, ma::Quantity::density, ma::Quantity::speed_of_sound}) {
      const ma::StandardAtmosphereField line(q);
      pf::Descriptor d = line.descriptor();
      d.name = "earth." + d.name;
      d.frame = "ITRS";
      d.base = {pf::BaseKind::region, 3,
                w.geoid ? "the atmosphere above mean sea level (EGM96), from −5 km′ to 86 km"
                        : "the atmosphere above the WGS 84 ellipsoid (the geoid is not loaded), from −5 km′ to 86 km"};
      all_.push_back(fd::scalar_field(pf::pullback<Vec3>(std::move(d), line, fd::HeightAboveSea{w.geoid})));
    }
    // The Moon's crustal field: the model, what it leaves unresolved, and their sum.
    const auto moon = lunar_field(w);
    const std::string no_moon = "the Moon's crustal model is not loaded (python data/acquisition/fetch.py moon-magnetic-t2015)";
    if (moon) {
      const pm::LunarCrustalField crust(moon);
      const Json law = Json::object({{"law", law_json(*moon)}});
      all_.push_back(fd::vector_field(crust));
      all_.back().extra = law;
      if (moon->law_bounded()) {
        const pm::LunarCrustalField unresolved(moon, pm::LunarCrustalField::Part::unresolved, UNRESOLVED_DEGREE, w.seed);
        all_.push_back(fd::vector_field(unresolved));
        all_.back().extra = law;
        all_.push_back(fd::vector_field(pf::sum(composite(crust), crust, unresolved)));
        all_.back().extra = law;
      } else {
        const std::string why = "the law fitted to the model's spectrum does not fall at high degree, so no small scales are drawn";
        all_.push_back(fd::unavailable("moon.magnetic.unresolved", "The Moon's unresolved crustal scales", "MOON_ME", why));
        all_.push_back(fd::unavailable("moon.magnetic", "The Moon's crustal field with its unresolved scales", "MOON_ME", why));
      }
    } else {
      for (const char* name : {"moon.magnetic.crust", "moon.magnetic.unresolved", "moon.magnetic"}) all_.push_back(fd::unavailable(name, "The Moon's crustal field", "MOON_ME", no_moon));
    }
  }

  static constexpr int UNRESOLVED_DEGREE = 720;

  const std::vector<WorldField>& all() const { return all_; }
  const WorldField& operator[](const std::string& name) const {
    for (const auto& f : all_)
      if (f.descriptor.name == name) return f;
    throw std::invalid_argument("no field " + name + " in this world (the op \"fields\" lists them)");
  }

  // The descriptor of the Moon's composite.
  static pf::Descriptor composite(const planetary_science::magnetism::LunarCrustalField& crust) {
    pf::Descriptor d = crust.descriptor();
    d.name = "moon.magnetic";
    d.title = "The Moon's crustal field with its unresolved scales";
    d.source = crust.descriptor().source + "; the unresolved scales drawn from the law of its spectrum";
    return d;
  }

 private:
  std::vector<WorldField> all_;
};

// The fields of a world, made again when its models, its geoid or its seed change.
inline const WorldFields& fields_of(const World& w) {
  struct Held {
    std::vector<std::shared_ptr<const void>> key;
    std::uint64_t seed = 0;
    std::unique_ptr<WorldFields> fields;
  };
  static std::map<const World*, Held> held;
  std::vector<std::shared_ptr<const void>> key{w.geoid};
  for (const char* m : {"wmm", "moon_magnetic"}) {
    const auto it = w.models.find(m);
    key.push_back(it == w.models.end() ? nullptr : it->second);
  }
  Held& h = held[&w];
  if (!h.fields || h.key != key || h.seed != w.seed) h = {key, w.seed, std::make_unique<WorldFields>(w)};
  return *h.fields;
}

// ---- descriptors in JSON -------------------------------------------------------------------------------

inline Json descriptor_json(const WorldField& f) {
  const pf::Descriptor& d = f.descriptor;
  Json j = Json::object({{"name", d.name}, {"title", d.title}, {"frame", d.frame}, {"available", f.available()}});
  if (!f.available()) {
    j.set("missing", f.missing);
    return j;
  }
  Json parts = Json::array(), caps = Json::array();
  for (const auto& p : d.parts) parts.push(Json::object({{"name", p.name}, {"provenance", pf::name(p.provenance)}}));
  for (const auto& c : pf::names(d.capabilities)) caps.push(c);
  j.set("time", d.time);
  j.set("base", Json::object({{"kind", pf::name(d.base.kind)}, {"dimension", double(d.base.dimension)}, {"about", d.base.about}}));
  j.set("fibre", Json::object({{"kind", pf::name(d.fibre.kind)}, {"unit", physis::units::symbol(d.fibre.dimension)}, {"basis", d.fibre.basis}}));
  j.set("representation", Json::object({{"kind", pf::name(d.representation.kind)}, {"about", d.representation.about}}));
  j.set("provenance", pf::name(d.provenance));
  j.set("parts", parts);
  j.set("source", d.source);
  j.set("capabilities", caps);
  if (f.extra.is_object())
    for (const auto& [k, v] : f.extra.as_object()) j.set(k, v);
  return j;
}

inline Json fields_answer(const WorldFields& fs) {
  Json list = Json::array();
  for (const auto& f : fs.all()) list.push(descriptor_json(f));
  return Json::object({{"fields", list}});
}

// ---- samplings -----------------------------------------------------------------------------------------

using AnySampling = std::variant<pf::SphereGrid, pf::PlaneGrid, pf::VolumeGrid, pf::PointList>;

// The most values a sampling may answer (points times components): 8 MiB of float32.
inline constexpr std::size_t FIELD_SAMPLE_MAX_VALUES = std::size_t(1) << 21;

namespace fields_detail {

inline Vec3 vec3_of(const Json& j, const char* what) {
  if (!j.is_array() || j.size() != 3) throw std::invalid_argument(std::string("field.sample: ") + what + " is three numbers");
  const Vec3 v{j[0].as_number(), j[1].as_number(), j[2].as_number()};
  if (!(std::isfinite(v[0]) && std::isfinite(v[1]) && std::isfinite(v[2]))) throw std::invalid_argument(std::string("field.sample: ") + what + " is not finite");
  return v;
}
inline int count_of(const Json& j, const char* what, int most) {
  if (!j.is_number() || !(j.as_number() >= 1 && j.as_number() <= most) || j.as_number() != std::floor(j.as_number()))
    throw std::invalid_argument(std::string("field.sample: ") + what + " is a whole number from 1 to " + std::to_string(most));
  return int(j.as_number());
}
inline double positive_of(const Json& j, const char* what) {
  if (!j.is_number() || !(j.as_number() > 0) || !std::isfinite(j.as_number())) throw std::invalid_argument(std::string("field.sample: ") + what + " is a positive length (m)");
  return j.as_number();
}

}  // namespace fields_detail

// A sampling from its JSON, in the field's frame (m):
//   {"kind": "sphere", "radius_m", "nlat", "nlon", "centre"?}       cells of equal angle, rows from the north
//   {"kind": "plane", "origin", "u", "v", "nu", "nv"}               cells of a parallelogram
//   {"kind": "volume", "centre", "axes"?, "edges", "n"}             cells of a box, its axes the rows (orthonormal)
//   {"kind": "points", "points": [[x, y, z], …]}
inline AnySampling sampling_of(const Json& j) {
  namespace fd = fields_detail;
  const std::string kind = j["kind"].text();
  if (kind == "sphere") {
    pf::SphereGrid g;
    if (j.has("centre")) g.centre = fd::vec3_of(j["centre"], "the sphere's centre");
    g.radius = fd::positive_of(j["radius_m"], "the sphere's radius_m");
    g.nlat = fd::count_of(j["nlat"], "nlat", 2048);
    g.nlon = fd::count_of(j["nlon"], "nlon", 4096);
    return g;
  }
  if (kind == "plane") {
    pf::PlaneGrid g;
    g.origin = fd::vec3_of(j["origin"], "the plane's origin");
    g.u = fd::vec3_of(j["u"], "the plane's u");
    g.v = fd::vec3_of(j["v"], "the plane's v");
    g.nu = fd::count_of(j["nu"], "nu", 4096);
    g.nv = fd::count_of(j["nv"], "nv", 4096);
    return g;
  }
  if (kind == "volume") {
    pf::VolumeGrid g;
    g.centre = fd::vec3_of(j["centre"], "the volume's centre");
    if (j.has("axes")) {
      const Json& a = j["axes"];
      if (!a.is_array() || a.size() != 3) throw std::invalid_argument("field.sample: the volume's axes are three rows");
      for (int r = 0; r < 3; r++) {
        const Vec3 row = fd::vec3_of(a[r], "an axis");
        for (int c = 0; c < 3; c++) g.axes[r][c] = row[c];
      }
      for (int p = 0; p < 3; p++)
        for (int q = 0; q < 3; q++)
          if (std::fabs(physis::geometry::dot(Vec3{g.axes[p][0], g.axes[p][1], g.axes[p][2]}, Vec3{g.axes[q][0], g.axes[q][1], g.axes[q][2]}) - (p == q ? 1.0 : 0.0)) > 1e-9)
            throw std::invalid_argument("field.sample: the volume's axes are not orthonormal");
    }
    const Json& e = j["edges"];
    const Json& n = j["n"];
    if (!e.is_array() || e.size() != 3 || !n.is_array() || n.size() != 3) throw std::invalid_argument("field.sample: a volume has three edges and three counts of cells");
    for (int a = 0; a < 3; a++) {
      g.edges[a] = fd::positive_of(e[a], "an edge");
      g.n[a] = fd::count_of(n[a], "a count of cells", 256);
    }
    return g;
  }
  if (kind == "points") {
    const Json& p = j["points"];
    if (!p.is_array() || p.size() == 0) throw std::invalid_argument("field.sample: points is a list of points");
    pf::PointList g;
    g.points.reserve(p.size());
    for (std::size_t i = 0; i < p.size(); i++) g.points.push_back(fd::vec3_of(p[i], "a point"));
    return g;
  }
  throw std::invalid_argument("field.sample: the sampling's kind is sphere, plane, volume or points, not \"" + kind + "\"");
}

inline Json sampling_json(const AnySampling& s) {
  const auto v = [](const Vec3& x) { return Json::array({x[0], x[1], x[2]}); };
  return std::visit(
      [&](const auto& g) -> Json {
        using G = std::decay_t<decltype(g)>;
        if constexpr (std::is_same_v<G, pf::SphereGrid>)
          return Json::object({{"kind", "sphere"}, {"centre", v(g.centre)}, {"radius_m", g.radius}, {"nlat", double(g.nlat)}, {"nlon", double(g.nlon)},
                               {"order", "rows from the north, columns from 180° W; latitude 90° − (i + ½)·180°/nlat, longitude −180° + (j + ½)·360°/nlon"}});
        else if constexpr (std::is_same_v<G, pf::PlaneGrid>)
          return Json::object({{"kind", "plane"}, {"origin", v(g.origin)}, {"u", v(g.u)}, {"v", v(g.v)}, {"nu", double(g.nu)}, {"nv", double(g.nv)},
                               {"order", "u fastest; cell (i, j) at origin + (i + ½)/nu u + (j + ½)/nv v"}});
        else if constexpr (std::is_same_v<G, pf::VolumeGrid>)
          return Json::object({{"kind", "volume"}, {"centre", v(g.centre)},
                               {"axes", Json::array({v({g.axes[0][0], g.axes[0][1], g.axes[0][2]}), v({g.axes[1][0], g.axes[1][1], g.axes[1][2]}),
                                                     v({g.axes[2][0], g.axes[2][1], g.axes[2][2]})})},
                               {"edges", v(g.edges)}, {"n", Json::array({double(g.n[0]), double(g.n[1]), double(g.n[2])})},
                               {"order", "the first axis fastest; cell (i, j, k) at index i + n₀ (j + n₁ k)"}});
        else return Json::object({{"kind", "points"}, {"count", double(g.points.size())}});
      },
      s);
}

inline std::size_t size_of(const AnySampling& s) { return std::visit([](const auto& g) { return g.size(); }, s); }
inline Vec3 point_of(const AnySampling& s, std::size_t i) { return std::visit([i](const auto& g) { return g.point(i); }, s); }

// ---- reductions ----------------------------------------------------------------------------------------

// What of a vector is answered: itself (three components on the frame's axes), its magnitude, its
// component along an axis of the frame, its radial or horizontal part about a centre, or its components
// on given axes (a volume's own, by default).
struct FieldReduction {
  enum class Kind { none, magnitude, component, radial, horizontal, on_axes } kind = Kind::none;
  int axis = 0;
  Vec3 centre{};
  Mat3 rows = physis::geometry::identity3();
  std::string name = "none";
  std::string basis;
  int components(bool vector) const { return vector && (kind == Kind::none || kind == Kind::on_axes) ? 3 : 1; }
};

inline FieldReduction reduction_of(const Json& j, const AnySampling& s, bool vector) {
  FieldReduction r;
  const std::string kind = j.is_object() ? j["kind"].text() : j.text("none");
  if (kind.empty() || kind == "none") return r;
  if (!vector) throw std::invalid_argument("field.sample: a scalar field is answered as it is; \"" + kind + "\" reduces a vector");
  r.name = kind;
  if (j.is_object() && j.has("centre")) r.centre = fields_detail::vec3_of(j["centre"], "the reduction's centre");
  if (kind == "magnitude") r.kind = FieldReduction::Kind::magnitude;
  else if (kind == "radial") r.kind = FieldReduction::Kind::radial;
  else if (kind == "horizontal") r.kind = FieldReduction::Kind::horizontal;
  else if (kind == "component") {
    r.kind = FieldReduction::Kind::component;
    r.axis = j.is_object() && j["axis"].is_number() ? int(j["axis"].as_number()) : -1;
    if (r.axis < 0 || r.axis > 2) throw std::invalid_argument("field.sample: a component's axis is 0, 1 or 2 of the field's frame");
    r.basis = "the field's frame";
  } else if (kind == "on_axes") {
    r.kind = FieldReduction::Kind::on_axes;
    if (j.is_object() && j.has("axes")) {
      const AnySampling as = sampling_of(Json::object({{"kind", "volume"}, {"centre", Json::array({0.0, 0.0, 0.0})}, {"axes", j["axes"]},
                                                       {"edges", Json::array({1.0, 1.0, 1.0})}, {"n", Json::array({1.0, 1.0, 1.0})}}));
      r.rows = std::get<pf::VolumeGrid>(as).axes;
      r.basis = "the given axes";
    } else if (const auto* g = std::get_if<pf::VolumeGrid>(&s)) {
      r.rows = g->axes;
      r.basis = "the volume's axes";
    } else {
      throw std::invalid_argument("field.sample: on_axes needs axes, or a volume whose axes they are");
    }
  } else {
    throw std::invalid_argument("field.sample: the reduction is none, magnitude, component, radial, horizontal or on_axes, not \"" + kind + "\"");
  }
  return r;
}

// ---- reading a field on a sampling ---------------------------------------------------------------------

namespace fields_detail {

struct Packed {
  std::vector<double> values;  // components interleaved; NaN where there is no value
  std::vector<std::uint8_t> quality;
  std::vector<std::uint16_t> why;
  std::vector<std::pair<std::string_view, std::size_t>> reasons, notes;
  std::array<std::size_t, 4> counts{};
  double lo = std::numeric_limits<double>::infinity(), hi = -std::numeric_limits<double>::infinity();
};

template <class V>
void pack_quality(const pf::Samples<V>& s, Packed& p) {
  p.quality.resize(s.size());
  for (std::size_t i = 0; i < s.size(); i++) p.quality[i] = static_cast<std::uint8_t>(s.quality[i]);
  p.why = s.why;
  p.reasons = s.reasons;
  p.notes = s.notes;
  p.counts = s.counts;
}

inline void extend(Packed& p, double x) {
  if (x < p.lo) p.lo = x;
  if (x > p.hi) p.hi = x;
}

inline Json texts_json(const std::vector<std::pair<std::string_view, std::size_t>>& xs) {
  Json a = Json::array();
  for (const auto& [text, count] : xs) a.push(Json::object({{"text", text}, {"count", double(count)}}));
  return a;
}

template <class T>
std::string bytes_base64(const std::vector<T>& xs) {
  static_assert(std::endian::native == std::endian::little, "values are sent little-endian");
  return base64(reinterpret_cast<const unsigned char*>(xs.data()), xs.size() * sizeof(T));
}

}  // namespace fields_detail

inline double tt_seconds(const mt::Instant& t) { return t.tt.minus({2451545.0, 0.0}) * mt::DAY; }

inline Json instant_json(const mt::Instant& t, const Spacetime& s) {
  Json j = Json::object({{"tt_s", tt_seconds(t)}});
  if (t.has_utc) j.set("utc", mt::format_iso(t.utc, mt::Scale::UTC, s.scales(), 3));
  return j;
}

// {"op": "field.sample", "field": name, "time": text, "sampling": {...}, "reduce"?: kind | {"kind", "axis"?,
// "centre"?, "axes"?}, "encoding"?: "json" | "f32"}
inline Json field_sample(const WorldFields& fs, const Json& r, const mt::Instant& t, const Spacetime& s) {
  namespace fd = fields_detail;
  const auto started = std::chrono::steady_clock::now();
  const WorldField& f = fs[r["field"].text()];
  if (!f.available()) throw std::invalid_argument("field.sample: " + f.descriptor.name + ": " + f.missing);
  const AnySampling g = sampling_of(r["sampling"]);
  const bool vector = static_cast<bool>(f.vector);
  const FieldReduction red = reduction_of(r["reduce"], g, vector);
  const int comps = red.components(vector);
  const std::size_t n = size_of(g);
  if (n * std::size_t(comps) > FIELD_SAMPLE_MAX_VALUES)
    throw std::invalid_argument("field.sample: " + std::to_string(n) + " points of " + std::to_string(comps) + " components is more than the " +
                                std::to_string(FIELD_SAMPLE_MAX_VALUES) + " values a sampling may answer");
  const double tt = tt_seconds(t);
  fd::Packed p;
  p.values.assign(n * std::size_t(comps), std::numeric_limits<double>::quiet_NaN());
  if (vector) {
    const pf::Samples<Vec3> got = std::visit([&](const auto& gg) { return f.vector.sample(gg, tt); }, g);
    fd::pack_quality(got, p);
    for (std::size_t i = 0; i < n; i++) {
      if (got.quality[i] != pf::Quality::valid) continue;
      const Vec3& v = got.values[i];
      const pf::Query<Vec3> q{tt, point_of(g, i)};
      using K = FieldReduction::Kind;
      double x = 0;
      switch (red.kind) {
        case K::none:
        case K::on_axes: {
          const Vec3 w = red.kind == K::none ? v : pf::OnAxes{red.rows}(q, v);
          for (int c = 0; c < 3; c++) p.values[3 * i + std::size_t(c)] = w[std::size_t(c)];
          fd::extend(p, physis::geometry::norm(w));
          continue;
        }
        case K::magnitude: x = pf::Magnitude{}(q, v); break;
        case K::component: x = pf::Component{red.axis}(q, v); break;
        case K::radial: x = pf::Radial{red.centre}(q, v); break;
        case K::horizontal: x = pf::Horizontal{red.centre}(q, v); break;
      }
      p.values[i] = x;
      fd::extend(p, x);
    }
  } else {
    const pf::Samples<double> got = std::visit([&](const auto& gg) { return f.scalar.sample(gg, tt); }, g);
    fd::pack_quality(got, p);
    for (std::size_t i = 0; i < n; i++)
      if (got.quality[i] == pf::Quality::valid) {
        p.values[i] = got.values[i];
        fd::extend(p, got.values[i]);
      }
  }
  const bool f32 = r["encoding"].text("json") == "f32";
  const pf::Descriptor& d = f.descriptor;
  Json a = Json::object({{"field", descriptor_json(f)}, {"sampling", sampling_json(g)}, {"time", instant_json(t, s)}, {"size", double(n)}, {"components", double(comps)}});
  a.set("reduction", Json::object({{"kind", red.name},
                                   {"invariant", red.kind == FieldReduction::Kind::component || red.kind == FieldReduction::Kind::on_axes ? false : true},
                                   {"basis", red.kind == FieldReduction::Kind::none && vector ? "the field's frame, " + d.frame : red.basis},
                                   {"unit", physis::units::symbol(d.fibre.dimension)}}));
  a.set("counts", Json::object({{"valid", double(p.counts[0])}, {"outside", double(p.counts[1])}, {"missing", double(p.counts[2])}, {"invalid", double(p.counts[3])}}));
  a.set("reasons", fd::texts_json(p.reasons));
  a.set("notes", fd::texts_json(p.notes));
  if (p.counts[0]) a.set("range", Json::object({{"min", p.lo}, {"max", p.hi}, {"of", comps == 3 ? "the vectors' lengths" : "the values"}}));
  if (f32) {
    a.set("values_f32", float32_base64(p.values));
    a.set("quality_u8", fd::bytes_base64(p.quality));
    a.set("why_u16", fd::bytes_base64(p.why));
  } else {
    Json vs = Json::array(), qs = Json::array(), ws = Json::array();
    for (const double x : p.values) vs.push(std::isfinite(x) ? Json(x) : Json(nullptr));
    for (std::size_t i = 0; i < n; i++) qs.push(double(p.quality[i])), ws.push(double(p.why[i]));
    a.set("values", vs);
    a.set("quality", qs);
    a.set("why", ws);
  }
  a.set("elapsed_s", std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count());
  return a;
}

// ---- integral curves -----------------------------------------------------------------------------------

inline constexpr std::size_t FIELD_CURVES_MAX_SEEDS = 512, FIELD_CURVES_MAX_STEPS = 20000;

// The curves of a vector field through seeds, restricted when asked to a shell about a centre.
inline std::vector<pf::Curve> curves_of(const pf::VectorField& f, const std::vector<Vec3>& seeds, double tt, const pf::CurveOptions& o, const pf::Shell* within) {
  std::vector<pf::Curve> out;
  out.reserve(seeds.size());
  if (within) {
    const auto inside = pf::restrict(f, *within);
    for (const Vec3& x : seeds) out.push_back(pf::integral_curve(inside, x, tt, o));
  } else {
    for (const Vec3& x : seeds) out.push_back(pf::integral_curve(f, x, tt, o));
  }
  return out;
}

namespace fields_detail {
inline Json end_json(const pf::CurveEnd& e) {
  Json j = Json::object({{"stop", pf::name(e.stop)}});
  if (e.stop == pf::CurveStop::edge) j.set("quality", pf::name(e.quality)), j.set("reason", e.reason);
  return j;
}
}  // namespace fields_detail

// {"op": "field.curves", "field": name, "time": text, "seeds": [[x, y, z], …], "direction"?: "both" | "forward" |
// "backward", "streamline"?: bool, "step_m"?: h | "step_fraction"?: f, "about"?: [x, y, z], "max_steps"?: n,
// "max_length_m"?: L, "within"?: {"inner_m", "outer_m", "centre"?}, "encoding"?: "json" | "f32"}
inline Json field_curves(const WorldFields& fs, const Json& r, const mt::Instant& t, const Spacetime& s) {
  namespace fd = fields_detail;
  const auto started = std::chrono::steady_clock::now();
  const WorldField& f = fs[r["field"].text()];
  if (!f.available()) throw std::invalid_argument("field.curves: " + f.descriptor.name + ": " + f.missing);
  if (!f.vector) throw std::invalid_argument("field.curves: " + f.descriptor.name + " is not a vector field; its curves are of a vector's direction");
  const Json& sj = r["seeds"];
  if (!sj.is_array() || sj.size() == 0 || sj.size() > FIELD_CURVES_MAX_SEEDS)
    throw std::invalid_argument("field.curves: seeds is a list of 1 to " + std::to_string(FIELD_CURVES_MAX_SEEDS) + " points");
  std::vector<Vec3> seeds;
  for (std::size_t i = 0; i < sj.size(); i++) seeds.push_back(fd::vec3_of(sj[i], "a seed"));
  pf::CurveOptions o;
  const std::string dir = r["direction"].text("both");
  if (dir == "forward") o.direction = pf::CurveOptions::Direction::forward;
  else if (dir == "backward") o.direction = pf::CurveOptions::Direction::backward;
  else if (dir != "both") throw std::invalid_argument("field.curves: the direction is both, forward or backward");
  o.along_unit = !(r["streamline"].is_bool() && r["streamline"].as_bool());
  if (r.has("step_m")) o.step = fd::positive_of(r["step_m"], "step_m");
  if (r.has("step_fraction")) {
    const double x = r["step_fraction"].is_number() ? r["step_fraction"].as_number() : 0;
    if (!(x > 0 && x <= 0.2)) throw std::invalid_argument("field.curves: step_fraction is from 0 to 0.2 of the distance from `about`");
    o.step_fraction = x;
  }
  if (r.has("about")) o.about = fd::vec3_of(r["about"], "about");
  if (r.has("max_steps")) o.max_steps = std::size_t(fd::count_of(r["max_steps"], "max_steps", int(FIELD_CURVES_MAX_STEPS)));
  if (r.has("max_length_m")) o.max_length = fd::positive_of(r["max_length_m"], "max_length_m");
  pf::Shell shell;
  const bool within = r.has("within");
  if (within) {
    const Json& w = r["within"];
    if (w.has("centre")) shell.centre = fd::vec3_of(w["centre"], "the shell's centre");
    shell.inner = w.has("inner_m") ? fd::positive_of(w["inner_m"], "inner_m") : 0.0;
    shell.outer = w.has("outer_m") ? fd::positive_of(w["outer_m"], "outer_m") : std::numeric_limits<double>::infinity();
    if (!(shell.outer > shell.inner)) throw std::invalid_argument("field.curves: the shell's outer sphere is beyond its inner");
    shell.below = "inside the curves' inner sphere";
    shell.above = "beyond the curves' outer sphere";
  }
  const double tt = tt_seconds(t);
  const auto curves = curves_of(f.vector, seeds, tt, o, within ? &shell : nullptr);
  const bool f32 = r["encoding"].text("json") == "f32";
  Json list = Json::array();
  std::size_t points = 0;
  for (const auto& c : curves) {
    Json j = Json::object({{"seeded", c.seeded}});
    if (!c.seeded) {
      j.set("quality", pf::name(c.seed_quality));
      j.set("reason", c.seed_reason);
      list.push(j);
      continue;
    }
    // |v| along the curve, for its colour.
    std::vector<float> xyz, mag;
    xyz.reserve(3 * c.points.size());
    mag.reserve(c.points.size());
    for (const Vec3& x : c.points) {
      for (int k = 0; k < 3; k++) xyz.push_back(float(x[std::size_t(k)]));
      const auto e = f.vector.at({tt, x});
      mag.push_back(e.ok() ? float(physis::geometry::norm(e.value)) : std::numeric_limits<float>::quiet_NaN());
    }
    points += c.points.size();
    j.set("seed_index", double(c.seed_index));
    j.set("length_m", c.arc.empty() ? 0.0 : c.arc.back());
    j.set("backward", fd::end_json(c.backward));
    j.set("forward", fd::end_json(c.forward));
    if (f32) {
      j.set("points_f32", fd::bytes_base64(xyz));
      j.set("magnitude_f32", fd::bytes_base64(mag));
    } else {
      Json ps = Json::array(), ms = Json::array();
      for (const Vec3& x : c.points) ps.push(Json::array({x[0], x[1], x[2]}));
      for (const float m : mag) ms.push(std::isfinite(m) ? Json(double(m)) : Json(nullptr));
      j.set("points", ps);
      j.set("magnitude", ms);
    }
    list.push(j);
  }
  return Json::object({{"field", descriptor_json(f)}, {"frame", f.descriptor.frame}, {"time", instant_json(t, s)}, {"curves", list},
                       {"points", double(points)}, {"kind", o.along_unit ? "field lines (dx/ds = v/|v|)" : "streamlines (dx/dt = v)"},
                       {"elapsed_s", std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count()}});
}

// ---- a field about a point ----------------------------------------------------------------------------

namespace fields_detail {

// The suffix a quantity's name carries for its unit, as the instruments' readings name theirs, and the
// unit as they write it.
inline std::string suffix_of(const std::string& unit) {
  if (unit == "m s^-2") return "m_s2";
  if (unit == "m s^-1") return "m_s";
  if (unit == "kg m^-3") return "kg_m3";
  return unit;
}
inline std::string unit_as_read(const std::string& unit) {
  if (unit == "m s^-2") return "m/s²";
  if (unit == "m s^-1") return "m/s";
  if (unit == "kg m^-3") return "kg/m³";
  return unit;
}

}  // namespace fields_detail

// A field of the world read over a cube about an event (probe_volume with "field" for "family"): on the
// cells of a family's cube (physis's VolumeGrid about the centre, its axes the body's east, north and up
// there), in the same answer, so that a page draws the one as the other. A scalar field is one quantity,
// its value; a vector field is four, its magnitude and its components along the cube's axes, and its
// vector on those axes. Where the field has no value a cell is empty, its reason counted (formalism
// §3.2). A field is read in its own frame: the cube's centre must be on the body whose frame it is.
inline Json field_volume(const World& w, const VolumeRequest& q, const MountState& centre, const std::string& canonical, const mt::Instant& t) {
  namespace fd = fields_detail;
  namespace vd = volume_detail;
  const auto started = std::chrono::steady_clock::now();
  const WorldField& f = fields_of(w)[q.field];
  if (!f.available()) throw std::invalid_argument("probe_volume: " + f.descriptor.name + ": " + f.missing);
  const pf::Descriptor& d = f.descriptor;
  if (d.frame != centre.fixed_frame)
    throw std::invalid_argument("probe_volume: " + d.name + " is on " + d.frame + "'s axes, and the cube about " + canonical + " is in " + centre.fixed_frame +
                                ": a field is read in its own frame");
  const auto axes = cube_axes(w, centre, canonical);
  const gf::Ellipsoid& figure = axes.first;
  const Mat3 R = axes.second;
  const double a = q.edge_m, tt = tt_seconds(t);
  const int n = q.n;
  const pf::VolumeGrid grid{centre.fixed, R, {a, a, a}, {n, n, n}};
  const std::size_t cells = grid.size();
  const std::string unit = physis::units::symbol(d.fibre.dimension), suffix = fd::suffix_of(unit), shown = fd::unit_as_read(unit);
  const std::string base = d.name.substr(d.name.rfind('.') + 1);
  std::vector<std::vector<double>> columns;
  std::vector<std::pair<std::string, std::string>> names;  // name, about
  std::vector<pf::Quality> quality(cells);
  std::vector<std::uint16_t> why(cells);
  std::vector<std::pair<std::string_view, std::size_t>> reasons, notes;
  std::array<std::size_t, 4> counts{};
  Json vector;
  const double nan = std::numeric_limits<double>::quiet_NaN();
  if (f.vector) {
    const pf::Samples<Vec3> s = f.vector.sample(grid, tt);
    quality = s.quality, why = s.why, reasons = s.reasons, notes = s.notes, counts = s.counts;
    columns.assign(4, std::vector<double>(cells, nan));
    names = {{"magnitude_" + suffix, "|" + d.name + "|"}, {"east_" + suffix, "along the cube's east"}, {"north_" + suffix, "along the cube's north"},
             {"up_" + suffix, "along the cube's up"}};
    for (std::size_t i = 0; i < cells; i++) {
      if (s.quality[i] != pf::Quality::valid) continue;
      const Vec3 v = pf::OnAxes{R}(pf::Query<Vec3>{tt, grid.point(i)}, s.values[i]);
      columns[0][i] = physis::geometry::norm(v);
      for (int k = 0; k < 3; k++) columns[std::size_t(k) + 1][i] = v[std::size_t(k)];
    }
    vector = Json::object({{"name", d.name}, {"unit", shown}, {"frame", "the cube's axes: east, north, up at its centre"},
                           {"from", "the field's vector on " + d.frame + "'s axes, turned onto the cube's"}});
    double top = 0;
    for (std::size_t i = 0; i < cells; i++)
      if (std::isfinite(columns[0][i])) top = std::max(top, columns[0][i]);
    vector.set("east", vd::values_json(columns[1], q.f32));
    vector.set("north", vd::values_json(columns[2], q.f32));
    vector.set("up", vd::values_json(columns[3], q.f32));
    vector.set("max_norm", counts[0] ? Json(top) : Json());
  } else {
    const pf::Samples<double> s = f.scalar.sample(grid, tt);
    quality = s.quality, why = s.why, reasons = s.reasons, notes = s.notes, counts = s.counts;
    columns.assign(1, std::vector<double>(cells, nan));
    names = {{base + "_" + suffix, d.title}};
    for (std::size_t i = 0; i < cells; i++)
      if (s.quality[i] == pf::Quality::valid) columns[0][i] = s.values[i];
  }
  Json quantities = Json::array();
  for (std::size_t c = 0; c < columns.size(); c++) {
    const auto [lo, hi] = vd::extremes(columns[c]);
    Json qj = Json::object({{"name", names[c].first}, {"unit", shown}, {"about", names[c].second}, {"min", lo}, {"max", hi}});
    qj.set(q.f32 ? "values_f32" : "values", vd::values_json(columns[c], q.f32));
    quantities.push(qj);
  }
  // The reasons with their qualities, most cells first; and the notes.
  std::map<std::pair<std::string, std::string>, double> by;
  for (std::size_t i = 0; i < cells; i++)
    if (quality[i] != pf::Quality::valid && why[i]) by[{std::string(reasons[why[i] - 1u].first), std::string(pf::name(quality[i]))}]++;
  std::vector<std::pair<std::pair<std::string, std::string>, double>> ranked(by.begin(), by.end());
  std::stable_sort(ranked.begin(), ranked.end(), [](const auto& x, const auto& y) { return x.second > y.second; });
  Json reasons_json = Json::array(), notes_json = Json::array();
  for (const auto& [r, count] : ranked) reasons_json.push(Json::object({{"reason", r.first}, {"quality", r.second}, {"count", count}}));
  for (const auto& [text, count] : notes) notes_json.push(Json::object({{"note", text}, {"count", double(count)}}));
  Json answer = Json::object({{"family", ""}, {"field", d.name}, {"title", d.title}, {"kernel", "field"}, {"provenance", pf::name(d.provenance)},
                              {"about", d.base.about}, {"model", d.source}, {"descriptor", descriptor_json(f)}});
  const Json frame = cube_frame_json(w, centre, canonical, figure, R, t, tt);
  for (const char* k : {"time", "centre", "axes"}) answer.set(k, frame[k]);
  answer.set("n", double(n));
  answer.set("edge_m", a);
  answer.set("cell_m", a / n);
  answer.set("order", "east fastest, then north, then up");
  answer.set("quantities", quantities);
  answer.set("vector", vector);
  answer.set("counts", Json::object({{"read", double(counts[0])}, {"outside", double(counts[1])}, {"missing", double(counts[2])}, {"invalid", double(counts[3])}}));
  answer.set("reasons", reasons_json);
  answer.set("notes", notes_json);
  answer.set("threads", 1.0);
  answer.set("elapsed_s", std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count());
  return answer;
}

}  // namespace cosmopoiesis
