// Coordinates of a point in every system the spacetime knows (README §5, op "convert"), and the
// geodesic between two places (op "geodesic").
//
// The point is given in one system and answered in all, each value named with its unit and every
// position with its frame: on the Earth, geodetic coordinates on WGS 84, the height above mean sea
// level by EGM96, Earth-centred Cartesian (ITRS) and geocentric spherical coordinates, UTM or UPS
// with the meridian convergence and point scale, and MGRS; in every frame of the catalogue, the
// position and velocity of a point fixed in the frame it was given in; the direction from the
// Earth's centre as right ascension and declination (GCRS axes), ecliptic and galactic coordinates;
// selenographic coordinates in the Moon's mean-Earth frame; and, from an observer, the point's
// local east-north-up and north-east-down coordinates, its azimuth, elevation and range, and the
// geodesic on the ellipsoid. Cosmopoiesis computes none of this itself: geodesy holds the figure,
// geodesics, grids and the geoid, metrology the time scales and the Earth's orientation, astronomy
// the ephemeris, the navigation bridge the catalogue of frames.

#pragma once

#include <cmath>
#include <memory>
#include <numbers>
#include <optional>
#include <string>
#include <vector>

#include <geodesy/figure/ellipsoid.hpp>
#include <geodesy/figure/local.hpp>
#include <geodesy/geodesic/geodesic.hpp>
#include <geodesy/geoid/geoid.hpp>
#include <geodesy/projection/mgrs.hpp>
#include <geodesy/projection/utm.hpp>
#include <science/json.hpp>

#include "spacetime.hpp"

namespace cosmopoiesis {

using science::Json;
namespace gf = geodesy::figure;
namespace gp = geodesy::projection;

inline constexpr double DEG = std::numbers::pi / 180;

inline Json vec_json(const Vec3& v) { return Json::array({v[0], v[1], v[2]}); }
inline Vec3 json_vec(const Json& j) {
  if (!j.is_array() || j.size() != 3) throw std::invalid_argument("a position is three numbers");
  return {j[0].as_number(), j[1].as_number(), j[2].as_number()};
}
inline double required(const Json& j, const char* key) {
  if (!j[key].is_number()) throw std::invalid_argument(std::string("convert: the point needs ") + key);
  return j[key].as_number();
}

// The frames a point is answered in, those of them the catalogue has.
inline const std::vector<std::string>& answered_frames() {
  static const std::vector<std::string> f = {"ITRS", "TIRS", "PEF", "CIRS", "TOD", "MOD", "EME2000", "TEME", "GCRS", "ICRS",
                                             "ECLIPTIC_J2000", "GALACTIC", "MOON_ICRS", "MOON_ME", "IAU_MOON", "EARTH_MOON_ROTATING"};
  return f;
}

class Coordinates {
 public:
  explicit Coordinates(std::shared_ptr<const geodesy::geoid::GeoidGrid> geoid) : geoid_(std::move(geoid)) {}

  // {"point": {...}, "observer"?: {...}, "time"} → the point in every system.
  Json convert(Spacetime& s, const Json& request, const mt::Instant& t) const {
    const Json& p = request["point"];
    const std::string body = p["body"].text("earth");
    const auto& g = s.catalogue().graph();
    const std::string moon_frame = s.catalogue().has_moon_pa() ? "MOON_ME" : "IAU_MOON";
    // The point as a position (and velocity) in a frame.
    std::string frame;
    Vec3 x{0, 0, 0}, v{0, 0, 0};
    const std::string system = p["system"].text("geodetic");
    if (system == "geodetic") {
      const gf::Geodetic where{required(p, "latitude_deg") * DEG, required(p, "longitude_deg") * DEG, p["height_m"].is_number() ? p["height_m"].as_number() : 0.0};
      if (body == "moon") { frame = moon_frame; x = navigation::frames::Catalogue::moon_sphere().cartesian(where); }
      else { frame = "ITRS"; x = wgs84_.cartesian(where); }
    } else if (system == "cartesian") {
      frame = p["frame"].text(body == "moon" ? moon_frame : "ITRS");
      g.require(frame);
      x = json_vec(p["position_m"]);
      if (p["velocity_m_s"].is_array()) v = json_vec(p["velocity_m_s"]);
    } else if (system == "utm" || system == "ups") {
      const int zone = system == "ups" ? 0 : int(required(p, "zone"));
      const bool north = p["north"].is_bool() ? p["north"].as_bool() : true;
      const gf::Geodetic where = grids_.reverse(zone, north, required(p, "easting_m"), required(p, "northing_m"));
      frame = "ITRS";
      x = wgs84_.cartesian({where.latitude, where.longitude, p["height_m"].is_number() ? p["height_m"].as_number() : 0.0});
    } else if (system == "mgrs") {
      const auto parsed = mgrs_.reverse(p["reference"].text());
      frame = "ITRS";
      x = wgs84_.cartesian({parsed.geodetic.latitude, parsed.geodetic.longitude, p["height_m"].is_number() ? p["height_m"].as_number() : 0.0});
    } else {
      throw std::invalid_argument("convert: a point's system is geodetic, cartesian, utm, ups or mgrs, not " + system);
    }
    Json a = Json::object({{"given", Json::object({{"system", system}, {"frame", frame}, {"body", body}})}});

    // In the frames of the catalogue.
    Json frames = Json::array();
    for (const std::string& f : answered_frames()) {
      if (g.find(f) < 0) continue;
      const auto st = g.transform(frame, f, t).state(x, v);
      frames.push(Json::object({{"frame", f}, {"position_m", vec_json(st[0])}, {"velocity_m_s", vec_json(st[1])},
                                {"about", g.frames()[g.find(f)].about}}));
    }
    a.set("frames", frames);

    // On the Earth.
    const Vec3 itrs = g.transform(frame, "ITRS", t).position(x);
    {
      const gf::Geodetic gd = wgs84_.geodetic(itrs);
      Json earth = Json::object({{"geodetic", Json::object({{"latitude_deg", gd.latitude / DEG}, {"longitude_deg", gd.longitude / DEG},
                                                             {"height_m", gd.height}, {"ellipsoid", "WGS 84"}, {"frame", "ITRS"}})},
                                 {"geocentric", Json::object({{"latitude_deg", std::atan2(itrs[2], std::hypot(itrs[0], itrs[1])) / DEG},
                                                               {"longitude_deg", std::atan2(itrs[1], itrs[0]) / DEG},
                                                               {"radius_m", physis::geometry::norm(itrs)}})}});
      if (geoid_) {
        const double n = geoid_->undulation(gd.latitude, gd.longitude);
        earth.set("mean_sea_level", Json::object({{"undulation_m", n}, {"orthometric_height_m", gd.height - n},
                                                  {"geoid", geoid_->name() + ", cubic interpolation"}}));
      } else {
        earth.set("mean_sea_level", nullptr);
      }
      // The grids hold the Earth's surface and the air above it.
      if (std::fabs(gd.height) < 1e6) {
        const gp::UtmUps u = grids_.forward(gd.latitude, gd.longitude);
        earth.set(u.zone ? "utm" : "ups", Json::object({{"zone", u.zone}, {"band", std::string(1, u.band)}, {"north", u.north},
                                                         {"easting_m", u.easting}, {"northing_m", u.northing},
                                                         {"convergence_deg", u.convergence / DEG}, {"scale", u.scale}}));
        earth.set("mgrs", mgrs_.format(u, 5));
      }
      a.set("earth", earth);
    }
    // As seen from the Earth's centre.
    {
      const Vec3 gc = g.transform(frame, "GCRS", t).position(x);
      const double r = physis::geometry::norm(gc);
      // Directions from the geocentre: the GCRS's axes are the ICRS's, turned to the ecliptic's and the galaxy's.
      const Vec3 e = navigation::frames::icrs_to_ecliptic_j2000() * gc, ga = navigation::frames::icrs_to_galactic() * gc;
      auto sph = [](const Vec3& u, const char* lon, const char* lat) {
        double l = std::atan2(u[1], u[0]) / DEG;
        if (l < 0) l += 360;
        return Json::object({{lon, l}, {lat, std::atan2(u[2], std::hypot(u[0], u[1])) / DEG}});
      };
      Json c = Json::object({{"distance_m", r}, {"equatorial", sph(gc, "right_ascension_deg", "declination_deg")},
                             {"ecliptic_j2000", sph(e, "longitude_deg", "latitude_deg")}, {"galactic", sph(ga, "longitude_deg", "latitude_deg")},
                             {"about", "the direction from the Earth's centre, geometric (no light time or aberration), ICRS axes"}});
      a.set("from_the_geocentre", c);
    }
    // On the Moon.
    {
      const Vec3 me = g.transform(frame, moon_frame, t).position(x);
      const gf::Geodetic sel = navigation::frames::Catalogue::moon_sphere().geodetic(me);
      a.set("moon", Json::object({{"frame", moon_frame}, {"latitude_deg", sel.latitude / DEG}, {"longitude_deg", sel.longitude / DEG},
                                  {"height_m", sel.height}, {"sphere_m", 1737.4e3}}));
    }
    // From an observer.
    if (request["observer"].is_object()) a.set("from_the_observer", relative(s, request["observer"], frame, x, t));
    return a;
  }

  // {"from": place, "to": place, "points"?: n} → the geodesic on WGS 84.
  Json geodesic(const Json& request) const {
    const Json& f = request["from"];
    const Json& to = request["to"];
    const double lat1 = required(f, "latitude_deg") * DEG, lon1 = required(f, "longitude_deg") * DEG;
    const double lat2 = required(to, "latitude_deg") * DEG, lon2 = required(to, "longitude_deg") * DEG;
    const auto inv = geodesic_.inverse(lat1, lon1, lat2, lon2);
    const int n = std::max(2, std::min(2000, int(request["points"].is_number() ? request["points"].as_number() : 64)));
    const auto line = geodesic_.inverse_line(lat1, lon1, lat2, lon2);
    Json path = Json::array();
    for (int i = 0; i < n; i++) {
      const auto pnt = line.position(line.distance() * i / (n - 1));
      path.push(Json::array({pnt.lat2 / DEG, pnt.lon2 / DEG}));
    }
    return Json::object({{"distance_m", inv.s12}, {"azimuth_from_deg", inv.azi1 / DEG}, {"azimuth_to_deg", inv.azi2 / DEG},
                         {"arc_deg", inv.a12 / DEG}, {"ellipsoid", "WGS 84"}, {"method", "Karney 2013 (geodesy::geodesic)"},
                         {"path_deg", path}});
  }

 private:
  // The point as seen from an observer at a geodetic place on the Earth or the Moon.
  Json relative(Spacetime& s, const Json& o, const std::string& frame, const Vec3& x, const mt::Instant& t) const {
    const std::string body = o["body"].text("earth");
    const gf::Geodetic where{required(o, "latitude_deg") * DEG, required(o, "longitude_deg") * DEG, o["height_m"].is_number() ? o["height_m"].as_number() : 0.0};
    const bool moon = body == "moon";
    const std::string fixed = moon ? (s.catalogue().has_moon_pa() ? "MOON_ME" : "IAU_MOON") : "ITRS";
    const gf::Ellipsoid fig = moon ? navigation::frames::Catalogue::moon_sphere() : wgs84_;
    const auto place = gf::Place::at(fig, where);
    const Vec3 p = s.catalogue().graph().transform(frame, fixed, t).position(x);
    const Vec3 enu = place.enu_of(p);
    const auto look = gf::look_angles(enu);
    Json r = Json::object({{"body", body}, {"enu_m", vec_json(enu)}, {"ned_m", vec_json({enu[1], enu[0], -enu[2]})},
                           {"azimuth_deg", look.azimuth / DEG}, {"elevation_deg", look.elevation / DEG}, {"range_m", look.range}});
    if (!moon) {
      const gf::Geodetic target = wgs84_.geodetic(p);
      const auto inv = geodesic_.inverse(where.latitude, where.longitude, target.latitude, target.longitude);
      r.set("geodesic", Json::object({{"distance_m", inv.s12}, {"azimuth_from_deg", inv.azi1 / DEG}, {"azimuth_to_deg", inv.azi2 / DEG},
                                      {"about", "along the WGS 84 ellipsoid between the observer's foot and the point's (Karney 2013)"}}));
    }
    return r;
  }

  gf::Ellipsoid wgs84_ = gf::Ellipsoid::wgs84();
  gp::UniversalGrids grids_{gf::Ellipsoid::wgs84()};
  gp::Mgrs mgrs_{gp::UniversalGrids(gf::Ellipsoid::wgs84())};
  geodesy::geodesic::Geodesic geodesic_{gf::Ellipsoid::wgs84()};
  std::shared_ptr<const geodesy::geoid::GeoidGrid> geoid_;
};

}  // namespace cosmopoiesis
