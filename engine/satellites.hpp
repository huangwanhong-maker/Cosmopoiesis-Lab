// Satellites in the spacetime (README §5, op "satellites"): their element sets propagated by SGP4,
// carried from TEME to the Earth and the sky by the catalogue's frames, seen from an observer.
//
// The element sets are three-line sets from files the server names (the data library's
// celestrak-gp groups); the navigation bridge reads them (orbits/tle.hpp), propagates them
// (orbits/sgp4.hpp: SGP4/SDP4 after Vallado et al. 2006, WGS 72 and the improved mode, as the
// elements were fitted) and defines TEME (orbits/teme.hpp), which the catalogue hangs from the ITRS.
// For each satellite at the instant: its position and velocity in TEME, the GCRS and the ITRS, its
// geodetic sub-point and height on WGS 84, whether the Sun lights it (outside the Earth's
// cylindrical shadow: a satellite at r is in shadow when r·ŝ < 0 and |r − (r·ŝ)ŝ| < 6378 km, ŝ the
// Sun's direction from the Earth; Vallado 2013, §5.3, the cylindrical model), the age of its
// elements, and from an observer its azimuth, elevation and range, and whether it can be seen there
// with the eye (above the horizon, sunlit, and the observer's Sun at least 6° below the horizon). A
// window of samples in the GCRS and the ITRS can be asked for, for the page to draw orbits and
// ground tracks by interpolation.

#pragma once

#include <cmath>
#include <map>
#include <string>
#include <vector>

#include <geodesy/figure/ellipsoid.hpp>
#include <geodesy/figure/local.hpp>
#include <navigation/orbits/sgp4.hpp>
#include <navigation/orbits/tle.hpp>
#include <science/json.hpp>

#include "coordinates.hpp"
#include "spacetime.hpp"

namespace cosmopoiesis {

namespace no = navigation::orbits;

class Satellites {
 public:
  Json answer(Spacetime& s, const Json& r, const mt::Instant& t) const {
    if (!t.has_utc) throw std::invalid_argument("satellites: the instant has no UTC (before 1960)");
    // The element sets of the files named, each with the group it came from.
    struct Entry { no::Tle tle; std::string group; };
    std::vector<Entry> sets;
    const Json& files = r["files"];
    for (std::size_t i = 0; i < files.size(); i++) {
      const std::string path = files[i]["path"].text(), group = files[i]["group"].text();
      for (auto& tle : no::read_tles(read_text(path))) sets.push_back({std::move(tle), group});
    }
    const std::size_t limit = std::size_t(r["limit"].is_number() ? r["limit"].as_number() : 600);
    if (sets.size() > limit) sets.resize(limit);
    // The window's instants: from the instant, every step for the span (TT seconds).
    std::vector<mt::Instant> window;
    if (r["window"].is_object()) {
      const double span = r["window"]["span_s"].as_number(), step = r["window"]["step_s"].as_number();
      if (!(step >= 1) || !(span >= 0) || span / step > 2000) throw std::invalid_argument("satellites: a window of at most 2000 steps of at least 1 s");
      const double start = r["window"]["start_s"].is_number() ? r["window"]["start_s"].as_number() : 0.0;
      for (double x = start; x <= start + span + 1e-9; x += step) window.push_back(s.later(t, x));
    }
    const auto& g = s.catalogue().graph();
    auto frames_at = [&](const mt::Instant& at) {
      return std::array<StateTransform, 2>{g.transform("TEME", "GCRS", at), g.transform("TEME", "ITRS", at)};
    };
    const auto now = frames_at(t);
    std::vector<std::array<StateTransform, 2>> later;
    for (const auto& at : window) later.push_back(frames_at(at));
    const Vec3 sun = g.transform("SUN_ICRS", "GCRS", t).b;
    const Vec3 sun_hat = (1 / physis::geometry::norm(sun)) * sun;

    // The observer, if any: a place on the WGS 84 ellipsoid, and its Sun's elevation.
    const bool has_observer = r["observer"].is_object();
    std::optional<geodesy::figure::Place> place;
    double sun_elevation = 0;
    if (has_observer) {
      const Json& o = r["observer"];
      const double deg = std::numbers::pi / 180;
      place = geodesy::figure::Place::at(wgs84_, {o["latitude_deg"].as_number() * deg, o["longitude_deg"].as_number() * deg, o["height_m"].is_number() ? o["height_m"].as_number() : 0.0});
      const Vec3 sun_itrs = g.transform("GCRS", "ITRS", t).position(sun);
      sun_elevation = place->look_at(sun_itrs).elevation;
    }

    Json out = Json::array();
    for (const Entry& e : sets) {
      const no::Sgp4 model(e.tle);
      const no::Sgp4State st = model.at(t.utc);
      Json j = Json::object({{"name", e.tle.name}, {"norad", double(e.tle.number)}, {"designator", e.tle.designator}, {"group", e.group},
                             {"epoch_utc", mt::format_iso(e.tle.epoch, mt::Scale::UTC, s.scales(), 0)},
                             {"age_days", (t.utc.d1 - e.tle.epoch.d1) + (t.utc.d2 - e.tle.epoch.d2)},
                             {"checksums_ok", e.tle.checksums_ok()}, {"error", std::string(no::describe(st.error))}});
      if (!std::isfinite(st.position[0])) { out.push(j); continue; }
      const auto gc = now[0].state(st.position, st.velocity), it = now[1].state(st.position, st.velocity);
      const auto gd = wgs84_.geodetic(it[0]);
      const double along = physis::geometry::dot(gc[0], sun_hat);
      const Vec3 perp = gc[0] - along * sun_hat;
      const bool sunlit = !(along < 0 && physis::geometry::norm(perp) < 6378137.0);
      const double deg = 180 / std::numbers::pi;
      j.set("teme", Json::object({{"position_m", vec_json(st.position)}, {"velocity_m_s", vec_json(st.velocity)}}));
      j.set("gcrs", Json::object({{"position_m", vec_json(gc[0])}, {"velocity_m_s", vec_json(gc[1])}}));
      j.set("itrs", Json::object({{"position_m", vec_json(it[0])}, {"velocity_m_s", vec_json(it[1])}}));
      j.set("geodetic", Json::object({{"latitude_deg", gd.latitude * deg}, {"longitude_deg", gd.longitude * deg}, {"height_m", gd.height}}));
      j.set("sunlit", sunlit);
      if (place) {
        const auto look = place->look_at(it[0]);
        j.set("observer", Json::object({{"azimuth_deg", look.azimuth * deg}, {"elevation_deg", look.elevation * deg}, {"range_m", look.range},
                                        {"above_horizon", look.elevation > 0},
                                        {"visible_to_the_eye", look.elevation > 0 && sunlit && sun_elevation < -6 * std::numbers::pi / 180}}));
      }
      if (!window.empty()) {
        Json gp = Json::array(), gv = Json::array(), ip = Json::array();
        for (std::size_t k = 0; k < window.size(); k++) {
          const no::Sgp4State w = model.at(window[k].utc);
          if (!std::isfinite(w.position[0])) { gp.push(nullptr); gv.push(nullptr); ip.push(nullptr); continue; }
          const auto a = later[k][0].state(w.position, w.velocity);
          gp.push(vec_json(a[0]));
          gv.push(vec_json(a[1]));
          ip.push(vec_json(later[k][1].position(w.position)));
        }
        j.set("window", Json::object({{"gcrs_m", gp}, {"gcrs_m_s", gv}, {"itrs_m", ip}}));
      }
      out.push(j);
    }
    Json a = Json::object({{"satellites", out}, {"count", double(out.size())},
                           {"model", "SGP4/SDP4 (Vallado et al. 2006), WGS 72, improved mode; TEME to the GCRS and ITRS by the catalogue"}});
    if (!window.empty()) {
      Json ts = Json::array();
      for (const auto& at : window) ts.push(at.tt.minus(t.tt) * mt::DAY);
      a.set("window_t_s", ts);
    }
    if (has_observer) a.set("observer_sun_elevation_deg", sun_elevation * 180 / std::numbers::pi);
    return a;
  }

 private:
  geodesy::figure::Ellipsoid wgs84_ = geodesy::figure::Ellipsoid::wgs84();
};

}  // namespace cosmopoiesis
