// The instruments of a place's environment: what the air, the ground and the fields around a mount
// are, read by virtual instruments on the domains' models (decision 0004).
//
//   gravimeter.body        gravity: on the Earth the normal gravity of the WGS 84 level ellipsoid at the
//                          mount's height (geodesy gravity, exact in ellipsoidal harmonics); elsewhere the
//                          body as a point mass with the centrifugal term of its rotation (model)
//   atmosphere.ussa1976    the U.S. Standard Atmosphere 1976 at the mount's height above mean sea level
//                          (EGM96): pressure, temperature, density, speed of sound, the layer (model)
//   radiosonde.ussa1976    the same as a column from the ground to 86 km, as a sounding gives it (model)
//   magnetometer.wmm2025   the Earth's main field by the World Magnetic Model 2025 (geophysics
//                          geomagnetism), its seven elements and their secular variation, the compass's
//                          zone, the model's uncertainty, and the centred dipole's latitude and L (model)

#pragma once

#include <cmath>
#include <numbers>
#include <string>

#include <astronomy/ephemerides/bodies.hpp>
#include <geodesy/figure/local.hpp>
#include <geodesy/gravity/normal.hpp>
#include <geophysics/geomagnetism/wmm.hpp>
#include <meteorology/atmosphere/standard.hpp>
#include <metrology/time/datetime.hpp>

#include "acquisition.hpp"
#include "instruments.hpp"

namespace cosmopoiesis {

class PointMassGravimeter final : public PointProbe {
 public:
  PointMassGravimeter() {
    info_ = {"gravimeter.body", "Gravimeter", "E03", Kernel::point_probe, Provenance::model,
             {{"gravity_m_s2", "m/s²", "the magnitude of gravity, attraction and centrifugal"}, {"attraction_m_s2", "m/s²", "GM/r² (a point mass)"},
              {"centrifugal_m_s2", "m/s²", "ω²ρ, ρ the distance from the axis (a point mass)"}, {"deflection_deg", "deg", "of gravity from the figure's normal"},
              {"model", "", "normal gravity of WGS 84 on the Earth, a point mass with rotation elsewhere"}},
             3e-5, 5, "on the Earth the WGS 84 level ellipsoid (geodesy gravity); elsewhere GM of DE440 (Park et al. 2021) and the rotation of the body's IAU frame",
             "normal gravity: the field of the level ellipsoid, without the mass's irregularities (no geoid, no anomalies); on other bodies, no flattening either",
             "NGA.STND.0036 (WGS 84), ch. 4; Hofmann-Wellenhof and Moritz 2006, ch. 2; Park et al. 2021, AJ 161, 105"};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World&) const override {
    Coverage c;
    c.bodies = {"sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"};
    c.about = "a body's gravity, outside it";
    return c;
  }
  Json measure(const Snapshot& s, const MountState& m, Noise&) const override {
    namespace nf = navigation::frames;
    const auto info = astronomy::ephemerides::body(m.body);
    if (!info) throw Unavailable("no GM for " + m.body);
    if (m.body == "earth") {
      // The normal gravity of the WGS 84 level ellipsoid at the mount (exact in ellipsoidal harmonics).
      static const geodesy::gravity::LevelEllipsoid wgs = geodesy::gravity::LevelEllipsoid::wgs84();
      const auto n = wgs.at(m.geodetic);
      return Json::object({{"gravity_m_s2", n.magnitude_m_s2}, {"deflection_deg", n.deflection_rad * 180 / std::numbers::pi},
                           {"down_m_s2", n.down_m_s2}, {"north_m_s2", n.north_m_s2},
                           {"vector_enu_m_s2", Json::array({n.enu_m_s2[0], n.enu_m_s2[1], n.enu_m_s2[2]})}, {"model", "normal gravity, WGS 84"}});
    }
    const auto b = nf::body_frames(s.world().catalogue(), m.body);
    const Vec3& r = m.fixed;
    const double rr = physis::geometry::norm(r);
    if (rr < 1) throw Unavailable("at the body's centre");
    // The fixed frame's rotation relative to its inertial frame, ω in the fixed frame's axes.
    const auto x = s.world().catalogue().graph().transform(b->fixed, b->inertial, s.instant());
    const Vec3 omega = physis::geometry::transpose(x.r) * x.angular_velocity();
    const Vec3 attraction = (-info->gm / (rr * rr * rr)) * r;
    const Vec3 centrifugal = -1.0 * physis::geometry::cross(omega, physis::geometry::cross(omega, r));
    const Vec3 g = attraction + centrifugal;
    const auto place = gf::Place::at(*b->figure, m.geodetic);
    const Vec3 enu = place.to_enu * g;
    const double gn = physis::geometry::norm(g);
    return Json::object({{"gravity_m_s2", gn}, {"attraction_m_s2", physis::geometry::norm(attraction)}, {"centrifugal_m_s2", physis::geometry::norm(centrifugal)},
                         {"deflection_deg", std::acos(std::clamp(-enu[2] / gn, -1.0, 1.0)) * 180 / std::numbers::pi},
                         {"vector_enu_m_s2", Json::array({enu[0], enu[1], enu[2]})}, {"model", "point mass with rotation"}});
  }
 private:
  InstrumentInfo info_;
};

// The mount's height above mean sea level: the ellipsoidal height less the geoid's undulation
// (EGM96), or the ellipsoidal height when the geoid is not loaded (then said).
inline std::pair<double, bool> height_above_sea_level(const World& w, const MountState& m) {
  if (!w.geoid) return {m.geodetic.height, false};
  return {m.geodetic.height - w.geoid->undulation(m.geodetic.latitude, m.geodetic.longitude), true};
}

class AtmosphereProbe final : public PointProbe {
 public:
  AtmosphereProbe() {
    info_ = {"atmosphere.ussa1976", "Barometer and thermometer (standard atmosphere)", "D01", Kernel::point_probe, Provenance::model,
             {{"pressure_Pa", "Pa", ""}, {"temperature_K", "K", "kinetic"}, {"density_kg_m3", "kg/m³", ""}, {"speed_of_sound_m_s", "m/s", ""},
              {"layer", "", "troposphere, tropopause, stratosphere, stratopause, mesosphere"}, {"height_msl_m", "m", "geometric, above mean sea level (EGM96)"}},
             8e-6, 2, "the U.S. Standard Atmosphere 1976 (meteorology atmosphere), to 86 km",
             "the idealised mean of the mid-latitude atmosphere, not the weather: a barometer of the model, not of the air today",
             "NOAA, NASA and USAF 1976, U.S. Standard Atmosphere, 1976, eqs. 17–53"};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World&) const override {
    Coverage c;
    c.bodies = {"earth"};
    c.height_min = -5000;
    c.height_max = meteorology::atmosphere::us1976::top_geometric_m + 200;  // the coverage is on the ellipsoid; measure() decides at sea level
    c.about = "the standard atmosphere from 5 km below to 86 km above mean sea level";
    return c;
  }
  Json measure(const Snapshot& s, const MountState& m, Noise&) const override {
    const auto [z, msl] = height_above_sea_level(s.world(), m);
    const auto st = meteorology::atmosphere::at_geometric_height(z);
    if (!st) throw Unavailable("the 1976 standard atmosphere ends at 86 km (its upper atmosphere, of each gas diffusing, is not implemented)");
    return Json::object({{"pressure_Pa", st->pressure_Pa}, {"temperature_K", st->temperature_K}, {"density_kg_m3", st->density_kg_m3},
                         {"speed_of_sound_m_s", st->speed_of_sound_m_s}, {"layer", std::string(st->layer_name)}, {"height_msl_m", z},
                         {"height_datum", msl ? "EGM96" : "the ellipsoid (the geoid is not loaded)"},
                         {"pressure_scale_height_m", st->pressure_scale_height_m}, {"mean_free_path_m", st->mean_free_path_m}});
  }
 private:
  InstrumentInfo info_;
};

class Radiosonde final : public Footprint {
 public:
  Radiosonde() {
    info_ = {"radiosonde.ussa1976", "Radiosonde column (standard atmosphere)", "D01", Kernel::footprint, Provenance::model,
             {{"levels", "", "from the ground to 86 km: height (m above sea level), temperature (K), pressure (Pa), density (kg/m³)"},
              {"layers", "", "the standard atmosphere's layers: their names and bases (m above sea level)"}},
             2e-4, 30, "the U.S. Standard Atmosphere 1976 (meteorology atmosphere)",
             "the column a sounding would give in the standard atmosphere, every 500 m from the ground", "NOAA, NASA and USAF 1976"};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World& w) const override { return AtmosphereProbe().coverage(w); }
  Json measure(const Snapshot& s, const MountState& m, Noise&) const override {
    namespace at = meteorology::atmosphere;
    const auto [ground, msl] = height_above_sea_level(s.world(), m);
    const double from = std::max(ground, at::geometric_height(at::us1976::bottom_geopotential_m) + 1);
    if (!(from < at::us1976::top_geometric_m)) throw Unavailable("the mount is above the standard atmosphere's 86 km");
    Json z = Json::array(), t = Json::array(), p = Json::array(), rho = Json::array();
    double next = from;
    while (next < at::us1976::top_geometric_m) {
      const auto st = at::at_geometric_height(next);
      if (st) { z.push(next); t.push(st->temperature_K); p.push(st->pressure_Pa); rho.push(st->density_kg_m3); }
      next = (std::floor(next / 500) + 1) * 500;
    }
    if (const auto top = at::at_geometric_height(at::us1976::top_geometric_m)) {
      z.push(at::us1976::top_geometric_m); t.push(top->temperature_K); p.push(top->pressure_Pa); rho.push(top->density_kg_m3);
    }
    Json layers = Json::array();
    for (const auto& l : at::layers())
      layers.push(Json::object({{"name", std::string(l.name)}, {"base_m", at::geometric_height(l.base_geopotential_m)},
                                {"gradient_K_per_km", l.gradient_K_per_m * 1e3}}));
    return Json::object({{"levels", Json::object({{"height_m", z}, {"temperature_K", t}, {"pressure_Pa", p}, {"density_kg_m3", rho}})},
                         {"layers", layers}, {"ground_msl_m", ground}, {"height_datum", msl ? "EGM96" : "the ellipsoid"}});
  }
 private:
  InstrumentInfo info_;
};

// The TT seconds from J2000.0 of 0h UTC of a Gregorian date, for coverages given by calendar years.
inline double tt_of_date(const World& w, int year, int month = 1, int day = 1) {
  const auto& ts = w.spacetime().scales();
  const mt::JulianDate jd = mt::from_datetime(mt::DateTime{year, month, day, 0, 0, 0.0}, mt::Scale::UTC, ts);
  const mt::Instant t = ts.instant(jd, mt::Scale::UTC);
  return t.tt.minus({2451545.0, 0.0}) * mt::DAY;
}

class Magnetometer final : public PointProbe {
 public:
  Magnetometer() {
    info_ = {"magnetometer.wmm2025", "Magnetometer (WMM2025)", "C01", Kernel::point_probe, Provenance::model,
             {{"north_T", "T", "X, along the geodetic north"}, {"east_T", "T", "Y"}, {"down_T", "T", "Z"}, {"horizontal_T", "T", "H"},
              {"total_T", "T", "F"}, {"inclination_deg", "deg", "I, positive down"}, {"declination_deg", "deg", "D, east of true north"},
              {"grid_variation_deg", "deg", "GV, poleward of 55°"}, {"total_T_per_year", "T/yr", "Ḟ"}, {"declination_deg_per_year", "deg/yr", "Ḋ"},
              {"zone", "", "the compass: reliable, caution (H < 6000 nT) or blackout (H < 2000 nT)"},
              {"declination_uncertainty_deg", "deg", "the model's error, WMM2025 report §3.4"},
              {"geomagnetic_latitude_deg", "deg", "in the centred dipole"}, {"l_shell", "", "McIlwain's L of the centred dipole, in Earth radii of 6371.2 km"}},
             6e-5, 1, "the World Magnetic Model 2025 (NOAA NCEI and BGS), geophysics::geomagnetism",
             "the main field of the core to degree 12 and its secular variation; the crust's fields, the ionosphere's and the magnetosphere's are not in it",
             "Chulliat et al. 2025, The US/UK World Magnetic Model for 2025–2030, NOAA NCEI (doi:10.25923/prbc-s316)"};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World& w) const override {
    Coverage c;
    c.bodies = {"earth"};
    c.height_min = geophysics::geomagnetism::LOWEST_HEIGHT_M;
    c.height_max = geophysics::geomagnetism::HIGHEST_HEIGHT_M;
    const auto model = coefficients(w);
    if (model) {
      c.tt_from = tt_of_date(w, int(std::floor(model->valid_from_year())));
      c.tt_to = tt_of_date(w, int(std::floor(model->valid_until_year())));
    }
    c.about = model ? "WMM2025's lifetime, 2025.0 to 2030.0, from 1 km below to 850 km above the ellipsoid" : "WMM2025, not loaded";
    return c;
  }
  Json measure(const Snapshot& s, const MountState& m, Noise&) const override {
    namespace gm = geophysics::geomagnetism;
    const auto model = coefficients(s.world());
    if (!model) throw Unavailable("the World Magnetic Model is not in the cache (python data/acquisition/fetch.py noaa-wmm)");
    if (!s.instant().has_utc) throw Unavailable("the model's time is a calendar year (UTC)");
    const double year = gm::decimal_year(s.instant().utc);
    const gm::Field f = gm::field(*model, m.fixed, year);
    const gm::Validity v = gm::validity(*model, m.geodetic, year, f);
    const auto u = gm::wmm2025_uncertainty(f.elements.horizontal_T);
    const auto d = gm::dipole(*model, year);
    const double deg = 180 / std::numbers::pi;
    const auto& e = f.elements;
    Json j = Json::object({{"north_T", e.north_T}, {"east_T", e.east_T}, {"down_T", e.down_T}, {"horizontal_T", e.horizontal_T}, {"total_T", e.total_T},
                           {"inclination_deg", e.inclination_rad * deg}, {"declination_deg", e.declination_rad * deg},
                           {"total_T_per_year", f.secular_variation.total_T_per_year}, {"declination_deg_per_year", f.secular_variation.declination_rad_per_year * deg},
                           {"zone", v.zone == gm::CompassZone::blackout ? "blackout" : v.zone == gm::CompassZone::caution ? "caution" : "reliable"},
                           {"declination_uncertainty_deg", u.declination_rad * deg}, {"total_uncertainty_T", u.total_T},
                           {"geomagnetic_latitude_deg", gm::geomagnetic_latitude_rad(d, m.fixed) * deg}, {"l_shell", gm::mcilwain_l(d, m.fixed)},
                           {"itrs_T", Json::array({f.itrs_T[0], f.itrs_T[1], f.itrs_T[2]})}, {"decimal_year", year}});
    if (std::isfinite(e.grid_variation_rad)) j.set("grid_variation_deg", e.grid_variation_rad * deg);
    if (!v.reasons.empty()) j.set("caveat", v.reasons);
    return j;
  }
  static std::shared_ptr<const geophysics::geomagnetism::Coefficients> coefficients(const World& w) {
    const auto it = w.models.find("wmm");
    return it == w.models.end() ? nullptr : std::static_pointer_cast<const geophysics::geomagnetism::Coefficients>(it->second);
  }
 private:
  InstrumentInfo info_;
};

// A magnetic compass near the ground (the encyclopedia's A03): the bearing of the horizontal field,
// from WMM2025. It reads where a compass is used, on the Earth from 1 km below the ellipsoid (a mine)
// to 30 km above it (a balloon), and refuses where its needle does not settle: where the horizontal
// field is below 2000 nT, WMM's blackout zone about each magnetic pole, it answers why (invalid); below
// 6000 nT, the caution zone, it reads and says so (the WMM2025 report, §1.8). An ideal compass: no
// deviation of a vehicle's own field, no needle's friction.
class MagneticCompass final : public PointProbe {
 public:
  MagneticCompass() {
    info_ = {"compass.magnetic", "Magnetic compass (WMM2025)", "A03", Kernel::point_probe, Provenance::model,
             {{"magnetic_north_deg", "deg", "the needle's bearing from true north, the declination D, east positive"},
              {"dip_deg", "deg", "the inclination I, positive down"}, {"horizontal_T", "T", "H, which turns the needle"},
              {"zone", "", "reliable, or caution where H < 6000 nT"}, {"grid_variation_deg", "deg", "GV, poleward of 55°"}},
             6e-5, 1, "the World Magnetic Model 2025 (NOAA NCEI and BGS), geophysics::geomagnetism",
             "a compass on or near the ground: the direction of the horizontal field, refused in the blackout zones about the magnetic poles",
             "Chulliat et al. 2025, The US/UK World Magnetic Model for 2025–2030, NOAA NCEI, §1.8 (the blackout and caution zones)",
             "the local horizon at the mount (true north)"};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World& w) const override {
    Coverage c;
    c.bodies = {"earth"};
    c.height_min = geophysics::geomagnetism::LOWEST_HEIGHT_M;
    c.height_max = 30e3;
    const auto model = Magnetometer::coefficients(w);
    if (model) {
      c.tt_from = tt_of_date(w, int(std::floor(model->valid_from_year())));
      c.tt_to = tt_of_date(w, int(std::floor(model->valid_until_year())));
    }
    c.about = "near the Earth's ground, from 1 km below the ellipsoid to 30 km above it, within WMM2025's lifetime";
    return c;
  }
  Json measure(const Snapshot& s, const MountState& m, Noise&) const override {
    namespace gm = geophysics::geomagnetism;
    const auto model = Magnetometer::coefficients(s.world());
    if (!model) throw Unavailable("the World Magnetic Model is not in the cache (python data/acquisition/fetch.py noaa-wmm)", Quality::missing);
    if (!s.instant().has_utc) throw Unavailable("the model's time is a calendar year (UTC)");
    const gm::Field f = gm::field(*model, m.fixed, gm::decimal_year(s.instant().utc));
    const auto& e = f.elements;
    const double deg = 180 / std::numbers::pi;
    if (e.horizontal_T < gm::BLACKOUT_HORIZONTAL_T)
      throw Unavailable("the horizontal field is " + std::to_string(int(std::lround(e.horizontal_T * 1e9))) +
                            " nT, below the 2000 nT of WMM's blackout zone about the magnetic pole: a compass needle does not settle here",
                        Quality::invalid);
    Json j = Json::object({{"magnetic_north_deg", e.declination_rad * deg}, {"dip_deg", e.inclination_rad * deg}, {"horizontal_T", e.horizontal_T},
                           {"zone", e.horizontal_T < gm::CAUTION_HORIZONTAL_T ? "caution" : "reliable"}});
    if (std::isfinite(e.grid_variation_rad)) j.set("grid_variation_deg", e.grid_variation_rad * deg);
    return j;
  }
 private:
  InstrumentInfo info_;
};

inline void add_environment_instruments(Registry& r) {
  r.add(std::make_unique<PointMassGravimeter>());
  r.add(std::make_unique<Magnetometer>());
  r.add(std::make_unique<MagneticCompass>());
  r.add(std::make_unique<AtmosphereProbe>());
  r.add(std::make_unique<Radiosonde>());
}

// The models the environment's instruments read, from the world's sources: the World Magnetic
// Model's coefficients ("wmm", the data library's noaa-wmm).
inline void attach_environment_models(World& w, const science::Json& sources) {
  const std::string wmm = sources["wmm"].text();
  if (!wmm.empty()) {
    try {
      w.models["wmm"] = std::make_shared<const geophysics::geomagnetism::Coefficients>(geophysics::geomagnetism::read_cof(wmm));
    } catch (const std::exception&) {
      // The magnetometer reports that the model is not loaded.
    }
  }
}

}  // namespace cosmopoiesis
