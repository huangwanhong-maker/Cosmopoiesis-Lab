// The Moon's magnetic field as a magnetometer on or above the Moon reads it (decision 0005; formalism
// §8.7; docs/instruments.md).
//
// The Moon has no dynamo now; its field at the surface is that of magnetised crust, some nanotesla
// over most of it and tens to hundreds over its anomalies (Reiner Gamma, the antipodes of the great
// basins), and above it the field of the solar wind, a few nanotesla, or of the Earth's magnetotail
// when the Moon passes through it near full Moon. The magnetometer sums three parts, each with its
// provenance (formalism Definition 8.7), the reading as a whole being assimilated:
//
//   crustal       T2015_449 to degree 449 (Tsunakawa et al. 2015, expanded by Wieczorek 2018): an
//                 assimilation of the historical record (assimilated);
//   small scales  with the setting `synthetic`, a realisation of what that assimilation leaves
//                 unresolved, from the law Rₙ = A nᵝ ρ²ⁿ fitted to its spectrum over degrees 30–250,
//                 drawn with the session's seed (synthetic);
//   external      the interplanetary field observed at L1 (SWPC's real-time magnetometer, GSE axes),
//                 carried to the Moon at the solar wind's speed, the value measured a travel time ago,
//                 uniform over the Moon (physical); only at the present, and not inside the Earth's
//                 magnetotail.
//
// The model, its law, its unresolved part, the reading on low ground and the carriage from L1 are
// the planetary-science domain's (magnetism; its theory note); this header binds them to a world and
// a mount.
//
// Caveat. The plasma's interaction with the anomalies (compressions, mini-magnetospheres) and the
// fields induced in the Moon's interior by the changing external field are not modelled; GSE's axes
// are taken on the ecliptic of J2000 (0.4° from that of date in 2026); the external part is a
// uniform field, the solar wind's at the Moon's distance from the Sun as at L1's.

#pragma once

#include <cmath>
#include <memory>
#include <numbers>
#include <string>

#include <planetary_science/magnetism/crust.hpp>
#include <planetary_science/magnetism/solar_wind.hpp>

#include "acquisition.hpp"
#include "instruments.hpp"

namespace cosmopoiesis {

namespace pa = physis::analysis;
namespace pm = planetary_science::magnetism;

inline std::shared_ptr<const pm::CrustalField> lunar_field(const World& w) {
  const auto it = w.models.find("moon_magnetic");
  return it == w.models.end() ? nullptr : std::static_pointer_cast<const pm::CrustalField>(it->second);
}

// The model from the data library's moon-magnetic-t2015, with its law.
inline void attach_lunar_model(World& w, const science::Json& sources) {
  const std::string path = sources["moon_magnetic"].text();
  if (path.empty()) return;
  try {
    w.models["moon_magnetic"] = pm::read_lunar_t2015(path);
  } catch (const std::exception&) {
    // The magnetometer reports that the model is not loaded.
  }
}

// The law of a crustal field, as readings and maps report it.
inline Json law_json(const pm::CrustalField& f) {
  return Json::object({{"amplitude_T2", f.law().amplitude}, {"exponent", f.law().exponent}, {"ratio", f.law().ratio},
                       {"depth_km", f.depth_m() / 1e3}, {"band", Json::array({double(f.law().n_from), double(f.law().n_to)})}});
}

class MoonMagnetometer final : public PointProbe {
 public:
  MoonMagnetometer() {
    info_ = {"magnetometer.moon", "Magnetometer on the Moon (T2015_449)", "C01", Kernel::point_probe, Provenance::assimilated,
             {{"north_T", "T", "the Moon's north, local horizon"}, {"east_T", "T", ""}, {"down_T", "T", ""}, {"total_T", "T", "|B|"},
              {"horizontal_T", "T", ""}, {"inclination_deg", "deg", "positive down"}, {"declination_deg", "deg", "east of the Moon's north"},
              {"crustal_T", "T", "|B| of the crust's field (assimilated)"}, {"small_scales_T", "T", "|B| of the synthetic small scales, when asked for"},
              {"external_T", "T", "|B| of the solar wind's field, when included"}, {"delay_s", "s", "the solar wind's travel from L1 to the Moon"}},
             2e-3, 1, "T2015_449 to degree 449 (planetary-science magnetism), its unresolved part drawn from a fitted law, SWPC's field at L1 carried to the Moon",
             "the Moon's crustal field from Kaguya's and Lunar Prospector's record, with synthetic small scales when asked for and the solar wind's field at the present",
             "Tsunakawa et al. 2015, JGR Planets 120, 1160; Wieczorek 2018, JGR Planets 123, 291 (doi:10.5281/zenodo.3873648); NOAA SWPC real-time solar wind",
             "the local horizon at the mount (north, east, down; the Moon's mean-Earth frame)"};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World& w) const override {
    Coverage c;
    c.bodies = {"moon"};
    c.height_min = -pm::LUNAR_LOWEST_GROUND_M;
    c.height_max = 1e7;
    c.about = lunar_field(w) ? "the Moon, from its lowest ground (10 km below its reference sphere of 1737.4 km) to 10 000 km above it; below the sphere, read at it"
                             : "the lunar model, not loaded";
    return c;
  }
  Json measure(const Snapshot& s, const MountState& m, Noise&) const override {
    const auto f = lunar_field(s.world());
    if (!f) throw Unavailable("the Moon's crustal model is not in the cache (python data/acquisition/fetch.py moon-magnetic-t2015)", Quality::missing);
    // Planetocentric coordinates of the mount in the Moon's frame; on low ground, the model is read
    // at its sphere (planetary-science magnetism, theory §3).
    const Vec3& x = m.fixed;
    const double r_mount = std::sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]);
    const double lat = std::asin(x[2] / r_mount), lon = std::atan2(x[1], x[0]);
    const pm::CrustReading crust = pm::crust_at(f->model(), r_mount, lat, lon);
    Json j = Json::object();
    if (crust.below_sphere_m > 0) {
      j.set("read_at_radius_m", crust.radius_read_m);
      j.set("below_sphere_m", crust.below_sphere_m);
      j.set("note", "the mount is " + std::to_string(int(std::lround(crust.below_sphere_m))) +
                        " m below the model's sphere; the field is the model's at the sphere above it, not continued downward");
    }
    double n = crust.field.north, e = crust.field.east, d = crust.field.down;
    Json parts = Json::object({{"crustal", "assimilated"}});
    j.set("crustal_T", crust.field.total());
    // The small scales, when asked for.
    const bool synthetic = m.settings["synthetic"].is_bool() && m.settings["synthetic"].as_bool();
    if (synthetic) {
      if (!f->law_bounded()) throw Unavailable("the law fitted to the model's spectrum does not fall at high degree, so no small scales are drawn", Quality::invalid);
      const int degree = m.settings["synthetic_degree"].is_number() ? std::clamp(int(m.settings["synthetic_degree"].as_number()), 450, 1440) : 720;
      const auto u = f->unresolved(degree, s.world().seed);
      const pa::FieldValue v = pa::field_at(*u, crust.radius_read_m, lat, lon);
      n += v.north, e += v.east, d += v.down;
      j.set("small_scales_T", v.total());
      j.set("small_scales_degree", degree);
      parts.set("small_scales", "synthetic");
    }
    // The solar wind's field, at the present.
    const bool external = !(m.settings["external"].is_bool() && !m.settings["external"].as_bool());
    if (external) {
      const Json note = add_external(s, m, lat, lon, n, e, d, j);
      if (note.is_string()) j.set("external_note", note);
      else parts.set("external", "physical");
    }
    const double h = std::hypot(n, e), total = std::sqrt(n * n + e * e + d * d), deg = 180 / std::numbers::pi;
    j.set("north_T", n), j.set("east_T", e), j.set("down_T", d), j.set("total_T", total), j.set("horizontal_T", h);
    j.set("inclination_deg", std::atan2(d, h) * deg), j.set("declination_deg", std::atan2(e, n) * deg);
    j.set("provenance_of_parts", parts);
    j.set("law", law_json(*f));
    j.set("model", f->source());
    return j;
  }

 private:
  // Adds the external field to (n, e, d) and its facts to j; returns a note (a string) when it is
  // left out, and null when it is in.
  static Json add_external(const Snapshot& s, const MountState& m, double lat, double lon, double& n, double& e, double& d, Json& j) {
    const World& w = s.world();
    const SolarWindInputs& sw = w.solar_wind;
    if (std::fabs(s.tt() - w.now_tt) > 300) return Json("the solar wind is observed at the present only; the world's instant is not the present");
    if (sw.imf_gse.empty() || !(sw.speed_m_s > 0)) return Json("no solar wind from SWPC yet");
    const auto& g = w.catalogue().graph();
    const auto& t = s.instant();
    const Vec3 sun = g.transform("SUN_ICRS", "GCRS", t).b;  // from the Earth, ICRS axes
    const Vec3 moon = g.transform("MOON_ICRS", "GCRS", t).b;
    const pm::Carriage c = pm::carry_from_l1(sun, moon, sw.speed_m_s);
    j.set("in_magnetotail", c.in_magnetotail);
    if (c.in_magnetotail) return Json("the Moon is inside the Earth's magnetotail, whose lobes' field is not modelled");
    const auto best = pm::nearest_sample(sw.imf_gse, w.now_tt - c.delay_s, 300);
    if (!best) return Json("SWPC's series does not reach back the solar wind's travel time from L1");
    const auto& b_gse = *best;
    const pm::GseAxes axes = pm::gse_axes(sun, g.transform("ECLIPTIC_J2000", "ICRS", t).direction({0, 0, 1}));
    const Vec3 b = g.transform("ICRS", m.fixed_frame, t).direction(pm::from_gse(axes, {b_gse[1], b_gse[2], b_gse[3]}));
    const Vec3 ned = pm::north_east_down(b, lat, lon);
    n += ned[0], e += ned[1], d += ned[2];
    j.set("external_T", std::sqrt(b_gse[1] * b_gse[1] + b_gse[2] * b_gse[2] + b_gse[3] * b_gse[3]));
    j.set("external_gse_T", Json::array({b_gse[1], b_gse[2], b_gse[3]}));
    j.set("delay_s", c.delay_s);
    j.set("external_measured_tt_s", b_gse[0]);
    if (!sw.spacecraft.empty()) j.set("external_spacecraft", sw.spacecraft);
    return Json();
  }

  InstrumentInfo info_;
};

inline void add_lunar_instruments(Registry& r) { r.add(std::make_unique<MoonMagnetometer>()); }

}  // namespace cosmopoiesis
