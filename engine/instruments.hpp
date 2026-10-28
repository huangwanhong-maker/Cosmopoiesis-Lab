// The virtual instruments of the spacetime slice (decision 0004; docs/instruments.md): observation
// operators of the kernels of observation.hpp, bound to the models the infrastructure holds. They
// compute nothing of their own physics: the time scales are metrology's, the frames the navigation
// bridge's, the figures and grids geodesy's, the orbits SGP4's (navigation), the ephemeris
// astronomy's; what is here is the operator: what is read, from where, with what noise.
//
//   clock.scales            the instant in every time scale at the mount (model; UT1 an archive's)
//   position.truth          the mount's place in its frames, an ideal probe (model)
//   sun.sensor              the Sun's direction, the fraction of its disc not hidden by the
//                           horizon or another body (eclipses), the irradiance (model)
//   sky.bodies              the Sun, the Moon, the Earth and the planets in the local sky (model)
//   gnss.receiver           GPS and Galileo satellites in view (SGP4 on CelesTrak's elements),
//                           their dilution of precision, and a simulated fix (model)
//
// and, on the domains' models of the Earth's environment (environment.hpp): the magnetometer
// (WMM2025, geophysics), the gravimeter (normal gravity, geodesy; a point mass elsewhere), the
// barometer and thermometer and a radiosonde's column (the U.S. Standard Atmosphere 1976,
// meteorology).

#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <map>
#include <memory>
#include <numbers>
#include <string>
#include <vector>

#include <astronomy/ephemerides/bodies.hpp>
#include <geodesy/figure/local.hpp>
#include <geodesy/geoid/geoid.hpp>
#include <navigation/orbits/sgp4.hpp>
#include <navigation/orbits/tle.hpp>

#include "observation.hpp"

namespace cosmopoiesis {

namespace nf = navigation::frames;
namespace gf = geodesy::figure;

// The nominal total solar irradiance at 1 au, IAU 2015 Resolution B3 (Prša et al. 2016, AJ 152, 41).
inline constexpr double SOLAR_IRRADIANCE_W_M2 = 1361.0;
// The Sun's nominal radius, IAU 2015 Resolution B3.
inline constexpr double SUN_RADIUS_M = 6.957e8;

// What the world has loaded for its instruments: the spacetime, the geoid, the satellites' element
// sets by group, and the present (the wall's now, in TT seconds from J2000.0), for the coverage of
// physical instruments.
// What physical sources tell the virtual instruments (the server passes them with a step): the
// interplanetary field at L1 in GSE axes, minute by minute (TT seconds from J2000.0 and tesla), and the
// solar wind's bulk speed. Written by the session before it dispatches, read by the instruments only.
struct SolarWindInputs {
  std::vector<std::array<double, 4>> imf_gse;  // tt_s, Bx, By, Bz, ascending in time
  double speed_m_s = 0;
  double speed_tt_s = 0;
  std::string spacecraft;
};

class World {
 public:
  explicit World(Spacetime& s) : s_(s) {}
  Spacetime& spacetime() const { return s_; }
  const Catalogue& catalogue() const { return s_.catalogue(); }
  std::shared_ptr<const geodesy::geoid::GeoidGrid> geoid;
  std::map<std::string, std::vector<navigation::orbits::Tle>> elements;  // by group
  double now_tt = 0;
  std::uint64_t seed = 20261028;
  // Extensions the environment's models attach (environment.hpp, lunar.hpp), by name.
  std::map<std::string, std::shared_ptr<const void>> models;
  SolarWindInputs solar_wind;
 private:
  Spacetime& s_;
};

namespace detail {

inline double deg(double rad) { return rad * 180 / std::numbers::pi; }

// The fraction of a disc of angular radius a whose centre lies θ from the centre of a disc of
// radius b that the second disc does not cover: discs on the sky, flat to second order in the radii.
inline double uncovered(double a, double b, double theta) {
  if (theta >= a + b) return 1.0;
  if (theta <= b - a) return 0.0;               // within the occulter
  if (theta <= a - b) return 1.0 - (b * b) / (a * a);  // the occulter inside the disc (an annulus)
  // The lens of two circles (the area of their intersection).
  const double a2 = a * a, b2 = b * b, t2 = theta * theta;
  const double alpha = std::acos(std::clamp((t2 + a2 - b2) / (2 * theta * a), -1.0, 1.0));
  const double beta = std::acos(std::clamp((t2 + b2 - a2) / (2 * theta * b), -1.0, 1.0));
  const double lens = a2 * (alpha - std::sin(2 * alpha) / 2) + b2 * (beta - std::sin(2 * beta) / 2);
  return std::clamp(1.0 - lens / (std::numbers::pi * a2), 0.0, 1.0);
}
// The fraction of a disc of angular radius a, its centre at elevation e, above a flat horizon.
inline double above_horizon(double a, double e) {
  if (e >= a) return 1.0;
  if (e <= -a) return 0.0;
  // A circular segment of the disc above the chord at distance e from its centre (e may be negative).
  const double d = -e;  // the horizon's distance below the centre
  const double segment = a * a * std::acos(std::clamp(d / a, -1.0, 1.0)) - d * std::sqrt(std::max(0.0, a * a - d * d));
  return std::clamp(segment / (std::numbers::pi * a * a), 0.0, 1.0);
}

}  // namespace detail

// ---- clock.scales ----------------------------------------------------------------------------------

class ClockInstrument final : public ClockReading {
 public:
  ClockInstrument() {
    info_ = {"clock.scales", "Time scales", "A01", Kernel::clock, Provenance::model,
             {{"utc", "ISO 8601", "Coordinated Universal Time"}, {"tai_minus_utc_s", "s", "leap seconds"}, {"tt_minus_ut1_s", "s", "ΔT"},
              {"ut1_minus_utc_s", "s", "from the IERS (measured, or predicted beyond the series)"}, {"tdb_minus_tt_s", "s", "at the geocentre"},
              {"gps_week", "", "weeks from 1980 January 6"}, {"gps_seconds_of_week", "s", ""}},
             1e-5, 1, "metrology's time scales (SOFA's definitions), the IERS's UT1 − UTC and IANA's leap seconds",
             "the instant in the scales of time, as an ideal clock at the geocentre would show them",
             "IAU 2006 Resolution B3; IERS Conventions 2010, ch. 10; IERS Bulletins A"};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World&) const override {
    Coverage c;
    c.about = "the time scales (UTC from 1960)";
    return c;
  }
  Json measure(const Snapshot& s, const MountState&, Noise&) const override {
    const auto& t = s.instant();
    const auto& ts = s.world().spacetime().scales();
    if (!t.has_utc) throw Unavailable("UTC is defined from 1960");
    const double gps_days = ts.from_tai(t.tai, mt::Scale::GPS).minus({2444244.5, 0.0});
    const double week = std::floor(gps_days / 7);
    return Json::object({{"utc", mt::format_iso(t.utc, mt::Scale::UTC, ts, 3)},
                         {"tai_minus_utc_s", std::round(t.tai.minus(t.utc) * mt::DAY * 1e6) / 1e6},
                         {"tt_minus_ut1_s", t.tt.minus(t.ut1) * mt::DAY},
                         {"ut1_minus_utc_s", t.ut1.minus(t.utc) * mt::DAY},
                         {"tdb_minus_tt_s", t.tdb.minus(t.tt) * mt::DAY},
                         {"gps_week", week},
                         {"gps_seconds_of_week", (gps_days - 7 * week) * mt::DAY},
                         {"ut1_source", std::string(mt::name(t.ut1_source))},
                         {"eop_predicted", t.eop.predicted}});
  }
 private:
  InstrumentInfo info_;
};

// ---- position.truth ---------------------------------------------------------------------------------

class PositionInstrument final : public Proprioceptive {
 public:
  PositionInstrument() {
    info_ = {"position.truth", "Position (truth)", "J06", Kernel::proprioceptive, Provenance::model,
             {{"latitude_deg", "deg", "on the body's figure"}, {"longitude_deg", "deg", ""}, {"height_m", "m", "above the figure"},
              {"gcrs_m", "m", "from the Earth's centre, ICRS axes"}, {"icrs_m", "m", "from the barycentre"}},
             2e-5, 1, "the catalogue of frames (navigation)", "the mount's place itself, without error: an ideal numerical probe, a control, not an instrument", ""};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World&) const override { Coverage c; c.about = "the ephemeris's span"; return c; }
  Json measure(const Snapshot&, const MountState& m, Noise&) const override {
    Json j = Json::object({{"address", m.address}, {"body", m.body},
                           {"gcrs_m", Json::array({m.gcrs[0], m.gcrs[1], m.gcrs[2]})}, {"icrs_m", Json::array({m.icrs[0], m.icrs[1], m.icrs[2]})}});
    if (!m.body.empty()) {
      j.set("latitude_deg", detail::deg(m.geodetic.latitude));
      j.set("longitude_deg", detail::deg(m.geodetic.longitude));
      j.set("height_m", m.geodetic.height);
    }
    return j;
  }
 private:
  InstrumentInfo info_;
};

// ---- sun.sensor -------------------------------------------------------------------------------------

class SunSensor final : public LineOfSight {
 public:
  SunSensor() {
    info_ = {"sun.sensor", "Sun sensor and radiometer", "C10", Kernel::line_of_sight, Provenance::model,
             {{"azimuth_deg", "deg", "of the Sun's centre, clockwise from north"}, {"elevation_deg", "deg", "geometric, without refraction"},
              {"distance_m", "m", "to the Sun's centre"}, {"disc_visible", "", "the fraction of the Sun's disc not hidden by the horizon, the Earth or the Moon"},
              {"irradiance_w_m2", "W/m²", "on a surface facing the Sun, above any atmosphere"},
              {"horizontal_irradiance_w_m2", "W/m²", "on the level ground, above any atmosphere"}},
             8e-5, 1, "DE440 positions; the IAU's nominal solar irradiance 1361 W/m² (2015 B3) at 1 au, by the inverse square",
             "geometric directions (no light time, no aberration, no refraction); the discs on the sky flat to second order",
             "IAU 2015 Resolution B3 (Prša et al. 2016)"};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World&) const override { Coverage c; c.about = "the ephemeris's span"; return c; }
  Json measure(const Snapshot& s, const MountState& m, Noise&) const override {
    const auto& g = s.world().catalogue().graph();
    const auto& t = s.instant();
    const Vec3 sun = g.transform("SUN_ICRS", "ICRS", t).b;
    const Vec3 to_sun = sun - m.icrs;
    const double r = physis::geometry::norm(to_sun);
    const double a = std::asin(SUN_RADIUS_M / r);
    double visible = 1.0;
    Json j = Json::object({{"distance_m", r}, {"angular_radius_deg", detail::deg(a)}});
    // Hidden by the ground beneath, for a mount on a body.
    double elevation = std::numeric_limits<double>::quiet_NaN();
    if (m.on_body) {
      const auto b = nf::body_frames(s.world().catalogue(), m.body);
      const Vec3 sun_fixed = g.transform("SUN_ICRS", m.fixed_frame, t).b;
      const auto place = gf::Place::at(*b->figure, m.geodetic);
      const auto look = place.look_at(sun_fixed);
      elevation = look.elevation;
      visible *= detail::above_horizon(a, look.elevation);
      j.set("azimuth_deg", detail::deg(look.azimuth));
      j.set("elevation_deg", detail::deg(look.elevation));
    }
    // Hidden by the Earth or the Moon (other than the body stood on): eclipses.
    Json by = Json::object();
    for (const char* key : {"earth", "moon"}) {
      if (m.on_body && m.body == key) continue;
      const auto b = nf::body_frames(s.world().catalogue(), key);
      if (!b) continue;
      const Vec3 c = g.transform(b->inertial, "ICRS", t).b - m.icrs;
      const double dc = physis::geometry::norm(c);
      const double radius = b->figure->a();
      if (dc <= radius) continue;
      if (physis::geometry::dot(c, to_sun) <= 0 && std::string(key) != m.body) {
        // The body is behind the observer, away from the Sun: it hides nothing.
        continue;
      }
      const double rb = std::asin(std::min(1.0, radius / dc));
      const double theta = std::acos(std::clamp(physis::geometry::dot(c, to_sun) / (dc * r), -1.0, 1.0));
      const double u = detail::uncovered(a, rb, theta);
      if (u < 1.0) by.set(key, 1.0 - u);
      visible *= u;
    }
    const double irradiance = SOLAR_IRRADIANCE_W_M2 * std::pow(nf::AU_M / r, 2) * visible;
    j.set("disc_visible", visible);
    j.set("hidden_by", by);
    j.set("irradiance_w_m2", irradiance);
    if (std::isfinite(elevation)) j.set("horizontal_irradiance_w_m2", irradiance * std::max(0.0, std::sin(elevation)));
    return j;
  }
 private:
  InstrumentInfo info_;
};

// ---- sky.bodies -------------------------------------------------------------------------------------

class SkyInstrument final : public LineOfSight {
 public:
  SkyInstrument() {
    info_ = {"sky.bodies", "The bodies in the sky", "F07", Kernel::line_of_sight, Provenance::model,
             {{"bodies", "", "for each body: azimuth and elevation (deg), distance (m), angular radius (deg)"}},
             1.5e-4, 5, "DE440 and the IAU rotation models, through the catalogue", "geometric places in the local sky of a mount on a body", ""};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World&) const override { Coverage c; c.about = "the ephemeris's span"; return c; }
  Json measure(const Snapshot& s, const MountState& m, Noise&) const override {
    if (!m.on_body) throw Unavailable("a sky has a horizon: the mount stands on a body");
    const auto& g = s.world().catalogue().graph();
    const auto b = nf::body_frames(s.world().catalogue(), m.body);
    const auto place = gf::Place::at(*b->figure, m.geodetic);
    Json out = Json::array();
    for (const auto& body : astronomy::ephemerides::BODIES) {
      if (body.key == m.body) continue;
      const auto f = nf::body_frames(s.world().catalogue(), body.key);
      if (!f) continue;
      const Vec3 p = g.transform(f->inertial, m.fixed_frame, s.instant()).b;
      const auto look = place.look_at(p);
      out.push(Json::object({{"body", std::string(body.key)}, {"azimuth_deg", detail::deg(look.azimuth)}, {"elevation_deg", detail::deg(look.elevation)},
                             {"distance_m", look.range}, {"angular_radius_deg", detail::deg(std::asin(std::min(1.0, body.radius / look.range)))}}));
    }
    return Json::object({{"bodies", out}});
  }
 private:
  InstrumentInfo info_;
};

// ---- gnss.receiver -----------------------------------------------------------------------------------

// The constellation's states in the ITRS at a snapshot, computed once for every receiver.
struct ConstellationState {
  struct Satellite { std::string name; int norad; Vec3 itrs; double age_days; };
  std::vector<Satellite> satellites;
};

class GnssReceiver final : public Ranging {
 public:
  explicit GnssReceiver(double sigma_uere_m = 3.0, double mask_deg = 10.0) : sigma_(sigma_uere_m), mask_(mask_deg * std::numbers::pi / 180) {
    info_ = {"gnss.receiver", "GNSS receiver (simulated)", "A02", Kernel::ranging, Provenance::model,
             {{"in_view", "", "satellites above the mask, by constellation"}, {"gdop", "", ""}, {"pdop", "", ""}, {"hdop", "", ""}, {"vdop", "", ""}, {"tdop", "", ""},
              {"fix", "", "the simulated position (latitude, longitude in deg, height in m)"}, {"error_m", "m", "the fix's error, east, north, up"},
              {"sky", "", "each satellite in view: its name, azimuth and elevation (deg)"}},
             1.2e-3, 1, "SGP4 on CelesTrak's elements (navigation); the geometry of the dilution of precision; a declared range error",
             "the geometry of a receiver's sky; its fix's error is drawn from the declared user-equivalent range error σ times the dilution, not from a model of the signals",
             "Misra and Enge 2011, Global Positioning System, 2nd ed., §6.1 (the dilution of precision)"};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World& w) const override {
    Coverage c;
    c.bodies = {"earth"};
    c.height_min = -500;
    c.height_max = 2.0e7;
    c.about = "the Earth and the space beneath the GNSS orbits, while CelesTrak's elements are loaded";
    (void)w;
    return c;
  }
  Json measure(const Snapshot& s, const MountState& m, Noise& noise) const override {
    const auto& w = s.world();
    if (!s.instant().has_utc) throw Unavailable("SGP4's elements are in UTC (after 1960)");
    const auto wgs = gf::Ellipsoid::wgs84();
    const auto place = gf::Place::at(wgs, m.geodetic);
    Json in_view = Json::object(), sky = Json::array();
    std::vector<std::array<double, 4>> rows;
    std::size_t loaded = 0;
    for (const char* group : {"gps-ops", "galileo"}) {
      const auto it = w.elements.find(group);
      if (it == w.elements.end() || it->second.empty()) continue;
      loaded++;
      const auto& c = s.shared<ConstellationState>(std::string("gnss:") + group, [&]() {
        ConstellationState st;
        const auto teme = w.catalogue().graph().transform("TEME", "ITRS", s.instant());
        for (const auto& tle : it->second) {
          const navigation::orbits::Sgp4 model(tle);
          const auto x = model.at(s.instant().utc);
          if (!std::isfinite(x.position[0])) continue;
          st.satellites.push_back({tle.name, tle.number, teme.position(x.position),
                                   (s.instant().utc.d1 - tle.epoch.d1) + (s.instant().utc.d2 - tle.epoch.d2)});
        }
        return st;
      });
      int count = 0;
      for (const auto& sat : c.satellites) {
        if (std::fabs(sat.age_days) > 30) continue;  // elements a month from the instant are not used
        const auto look = place.look_at(sat.itrs);
        if (look.elevation < mask_) continue;
        // The line of sight must clear the Earth (for a mount above the ground).
        const Vec3 d = sat.itrs - m.fixed;
        const double tmin = std::clamp(-physis::geometry::dot(m.fixed, d) / physis::geometry::dot(d, d), 0.0, 1.0);
        if (physis::geometry::norm(m.fixed + tmin * d) < wgs.a() - 1 && m.geodetic.height > 1e5) continue;
        count++;
        const double ce = std::cos(look.elevation);
        rows.push_back({-ce * std::sin(look.azimuth), -ce * std::cos(look.azimuth), -std::sin(look.elevation), 1.0});
        sky.push(Json::object({{"name", sat.name}, {"norad", double(sat.norad)}, {"constellation", std::string(group)},
                               {"azimuth_deg", detail::deg(look.azimuth)}, {"elevation_deg", detail::deg(look.elevation)}}));
      }
      in_view.set(group, double(count));
    }
    if (loaded == 0) throw Unavailable("no GNSS elements are loaded (the recipe's celestrak-gps-ops and celestrak-galileo)");
    Json j = Json::object({{"in_view", in_view}, {"sky", sky}, {"mask_deg", detail::deg(mask_)}, {"sigma_uere_m", sigma_}});
    if (rows.size() < 4) {
      j.set("fix", nullptr);
      j.set("reason", "fewer than four satellites in view: no fix");
      return j;
    }
    // H = (GᵀG)⁻¹, by Gauss–Jordan on the 4 × 4 normal matrix.
    double n[4][8] = {};
    for (const auto& r : rows)
      for (int a = 0; a < 4; a++)
        for (int b = 0; b < 4; b++) n[a][b] += r[a] * r[b];
    for (int a = 0; a < 4; a++) n[a][4 + a] = 1;
    for (int col = 0; col < 4; col++) {
      int piv = col;
      for (int k = col + 1; k < 4; k++) if (std::fabs(n[k][col]) > std::fabs(n[piv][col])) piv = k;
      if (std::fabs(n[piv][col]) < 1e-12) throw Unavailable("the satellites in view are in a degenerate geometry");
      for (int k = 0; k < 8; k++) std::swap(n[col][k], n[piv][k]);
      const double p = n[col][col];
      for (int k = 0; k < 8; k++) n[col][k] /= p;
      for (int k = 0; k < 4; k++) {
        if (k == col) continue;
        const double f = n[k][col];
        for (int q = 0; q < 8; q++) n[k][q] -= f * n[col][q];
      }
    }
    const double he = n[0][4], hn = n[1][5], hu = n[2][6], ht = n[3][7];
    const double hdop = std::sqrt(he + hn), vdop = std::sqrt(hu);
    j.set("gdop", std::sqrt(he + hn + hu + ht));
    j.set("pdop", std::sqrt(he + hn + hu));
    j.set("hdop", hdop);
    j.set("vdop", vdop);
    j.set("tdop", std::sqrt(ht));
    // The simulated fix: the true place moved by the declared range error times the dilution.
    const Vec3 err{noise.normal(sigma_ * std::sqrt(he)), noise.normal(sigma_ * std::sqrt(hn)), noise.normal(sigma_ * std::sqrt(hu))};
    const auto fixed = wgs.geodetic(place.ecef_of(err));
    j.set("fix", Json::object({{"latitude_deg", detail::deg(fixed.latitude)}, {"longitude_deg", detail::deg(fixed.longitude)}, {"height_m", fixed.height}}));
    j.set("error_m", Json::array({err[0], err[1], err[2]}));
    return j;
  }
 private:
  InstrumentInfo info_;
  double sigma_, mask_;
};

}  // namespace cosmopoiesis
