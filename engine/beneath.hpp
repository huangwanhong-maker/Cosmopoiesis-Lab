// The world beneath a place (decision 0010; the infrastructure's ADR 0055): what lies under the ground
// and under the sea, from the geophysics domain's structure (CRUST1.0 over PREM, sections along
// geodesics), bound here to the world.
//
//   seismic_column.crust1   the column beneath the mount, from the top of its ground or its sea to the
//                           Earth's centre: CRUST1.0's layers (water, ice, sediments, crystalline crust)
//                           to the Moho, PREM below, with the speeds of P and S waves, the density, and
//                           PREM's gravity at each depth; the layer the mount is in if it is below the
//                           surface (model; the encyclopedia's B09, elastic waves)
//
// and the operation that cuts the Earth along a geodesic through a place:
//
//   {"op": "beneath.section", "body": "earth" | "moon", "latitude_deg", "longitude_deg", "azimuth_deg",
//    "half_m", "step_m", "swath_m"?, "events"?: [[lat_deg, lon_deg, depth_m, magnitude], ...]}
//     → the samples along the section (distance, place, CRUST1.0's cell), the cells' columns, PREM's
//       shells, and the events within the swath with their distances along and across.
//
// The terrain along the section, finer than CRUST1.0's cells, is the server's to add (the data
// library's tiles); the events are the catalogue the server holds (Global CMT). On the Moon the
// section has its points and no interior, and says why.

#pragma once

#include <algorithm>
#include <cmath>
#include <map>
#include <memory>
#include <numbers>
#include <string>

#include <geodesy/geodesic/geodesic.hpp>
#include <geophysics/structure/crust.hpp>
#include <geophysics/structure/interior.hpp>
#include <geophysics/structure/prem.hpp>
#include <geophysics/structure/section.hpp>
#include <science/json.hpp>

#include "environment.hpp"
#include "instruments.hpp"

namespace cosmopoiesis {

namespace gs = geophysics::structure;

inline const std::string NO_CRUST = "CRUST1.0 is not in the cache (python data/acquisition/fetch.py crust1; python data/products/crust_model.py)";
inline const std::string NO_MOON_INTERIOR =
    "no model of the Moon's interior is loaded: its crust is known from GRAIL's gravity (Wieczorek et al. 2013) and its deep interior from the "
    "Apollo seismometers (Weber et al. 2011), and neither is in the world yet";

// CRUST1.0, read once for each path (the data library's product crust-crust1.bin).
inline std::shared_ptr<const gs::Crust1> crust_of_path(const std::string& path) {
  static std::map<std::string, std::shared_ptr<const gs::Crust1>> held;
  if (path.empty()) return nullptr;
  auto it = held.find(path);
  if (it == held.end()) {
    std::shared_ptr<const gs::Crust1> m;
    try {
      m = std::make_shared<const gs::Crust1>(gs::Crust1::read_product(path));
    } catch (const std::exception&) {
      m = nullptr;  // the column reports that the model is not loaded
    }
    it = held.emplace(path, m).first;
  }
  return it->second;
}

inline std::shared_ptr<const gs::Crust1> crust_model(const World& w) {
  const auto it = w.models.find("crust1");
  return it == w.models.end() ? nullptr : std::static_pointer_cast<const gs::Crust1>(it->second);
}

// The model the column reads, from the world's sources ("crust1", the product's binary).
inline void attach_structure_model(World& w, const science::Json& sources) {
  if (auto m = crust_of_path(sources["crust1"].text())) w.models["crust1"] = m;
}

inline Json layer_json(const gs::CrustLayer& l) {
  return Json::object({{"name", std::string(l.name)}, {"top_m", l.top_m}, {"bottom_m", l.bottom_m}, {"vp_m_s", l.vp_m_s}, {"vs_m_s", l.vs_m_s},
                       {"density_kg_m3", l.density_kg_m3}});
}

// The discontinuities beneath a column: its Moho (CRUST1.0's), then PREM's in the mantle and the core;
// without a Moho (a section, whose Moho varies), PREM's alone.
inline Json discontinuities_json(double moho_depth_m, bool with_moho = true) {
  Json d = Json::array();
  if (with_moho) d.push(Json::object({{"depth_m", moho_depth_m}, {"name", "the Moho (CRUST1.0)"}}));
  for (const auto& x : gs::PREM_DISCONTINUITIES)
    if (x.depth_m > std::max(moho_depth_m, 24.4e3) + 1) d.push(Json::object({{"depth_m", x.depth_m}, {"name", std::string(x.name)}}));
  return d;
}

class SeismicColumn final : public Footprint {
 public:
  SeismicColumn() {
    info_ = {"seismic_column.crust1", "Seismic column (CRUST1.0 over PREM)", "B09", Kernel::footprint, Provenance::model,
             {{"layers", "", "CRUST1.0's layers present beneath the mount: name, top and bottom (m above sea level), vp and vs (m/s), density (kg/m³)"},
              {"moho_depth_m", "m", "the Moho's depth below sea level"},
              {"crust_m", "m", "the crust's thickness, from the solid surface to the Moho"},
              {"crust_p_time_s", "s", "the time of a P wave rising vertically from the Moho to the solid surface"},
              {"profile", "", "from the column's top to the centre: depth (m), vp, vs (m/s), density (kg/m³), PREM's gravity (m/s²)"},
              {"mount", "", "the layer the mount is in, when it is below the surface"}},
             3e-4, 30, "CRUST1.0 (geophysics structure) to the Moho, PREM below",
             "the column a seismic survey would give, from a model: CRUST1.0 averages each cell of 1°, so a place takes its cell's column; PREM has no "
             "lateral variation; depth is below mean sea level along the ellipsoid's normal",
             "Laske, Masters, Ma and Pasyanos 2013 (CRUST1.0); Dziewonski and Anderson 1981, Table I (PREM, isotropic)"};
  }
  const InstrumentInfo& info() const override { return info_; }
  Coverage coverage(const World&) const override {
    Coverage c;
    c.bodies = {"earth"};
    c.height_min = -6371e3;
    c.height_max = 100e3;
    c.about = "the Earth beneath the mount, from 100 km above its ground to its centre";
    return c;
  }
  Json measure(const Snapshot& s, const MountState& m, Noise&) const override {
    const auto crust = crust_model(s.world());
    if (!crust) throw Unavailable(NO_CRUST, Quality::missing);
    constexpr double deg = 180 / std::numbers::pi;
    const double lat = m.geodetic.latitude * deg, lon = m.geodetic.longitude * deg;
    const int cell = crust->grid().cell(lat, lon);
    const auto centre = crust->grid().centre(cell);
    const gs::CrustColumn c = crust->column_of_cell(cell);
    Json layers = Json::array();
    double time = 0, mass = 0, solid = 0;
    for (const auto& l : c.layers) {
      layers.push(layer_json(l));
      if (l.index >= 2) {  // the sediments and the crystalline crust: the solid crust
        time += l.thickness_m() / l.vp_m_s;
        mass += l.thickness_m() * l.density_kg_m3;
        solid += l.thickness_m();
      }
    }
    // The profile to the centre.
    Json depth = Json::array(), vp = Json::array(), vs = Json::array(), rho = Json::array(), g = Json::array(), from = Json::array(), layer = Json::array();
    for (const auto& p : gs::interior_profile(c, 100e3)) {
      depth.push(p.depth_m);
      vp.push(p.vp_m_s);
      vs.push(p.vs_m_s);
      rho.push(p.density_kg_m3);
      g.push(gs::prem_gravity(std::clamp(gs::PREM_RADIUS_M - std::max(0.0, p.depth_m), 0.0, gs::PREM_RADIUS_M)));
      from.push(p.crust1 ? "CRUST1.0" : "PREM");
      layer.push(std::string(p.layer));
    }
    // The mount: in the air or the sea, or in a layer of the ground.
    const auto [height, msl] = height_above_sea_level(s.world(), m);
    Json mount = Json::object({{"height_msl_m", height}});
    if (height > c.surface_m) {
      mount.set("in", "the air");
      mount.set("above_m", height - c.surface_m);
    } else {
      const gs::InteriorValues v = gs::interior_at(c, height);
      mount.set("in", v.layer.empty() ? std::string("beyond the centre") : std::string(v.layer));
      mount.set("depth_below_surface_m", c.surface_m - height);
      mount.set("vp_m_s", v.vp_m_s);
      mount.set("vs_m_s", v.vs_m_s);
      mount.set("density_kg_m3", v.density_kg_m3);
    }
    return Json::object({{"cell", Json::object({{"latitude_deg", centre[0]}, {"longitude_deg", centre[1]}, {"size_deg", 1.0}, {"index", double(cell)}})},
                         {"layers", layers},
                         {"surface_m", c.surface_m},
                         {"solid_m", c.solid_m},
                         {"moho_depth_m", c.moho_depth_m},
                         {"crust_m", c.crust_m},
                         {"sediments_m", c.sediments_m},
                         {"water_m", c.water_m},
                         {"ice_m", c.ice_m},
                         {"oceanic", c.oceanic},
                         {"mantle", Json::object({{"vp_m_s", c.mantle.vp_m_s}, {"vs_m_s", c.mantle.vs_m_s}, {"density_kg_m3", c.mantle.density_kg_m3}})},
                         {"crust_p_time_s", time},
                         {"mean_crust_density_kg_m3", solid > 0 ? mass / solid : 0.0},
                         {"discontinuities", discontinuities_json(c.moho_depth_m)},
                         {"profile", Json::object({{"depth_m", depth}, {"vp_m_s", vp}, {"vs_m_s", vs}, {"density_kg_m3", rho}, {"gravity_m_s2", g},
                                                   {"model", from}, {"layer", layer}})},
                         {"mount", mount},
                         {"height_datum", msl ? "EGM96" : "the ellipsoid (the geoid is not loaded)"},
                         {"model", "CRUST1.0 to the Moho, PREM (isotropic, 1 s) below"}});
  }
 private:
  InstrumentInfo info_;
};

inline void add_structure_instruments(Registry& r) { r.add(std::make_unique<SeismicColumn>()); }

// ---- the section ------------------------------------------------------------------------------------------

// PREM's shells from a depth down to another, with their values at the top and bottom of each.
inline Json prem_shells_json(double from_m, double to_m) {
  Json out = Json::array();
  for (int k = int(gs::PREM_SHELLS.size()) - 1; k >= 0; k--) {
    const auto& s = gs::PREM_SHELLS[std::size_t(k)];
    if (k > gs::PREM_LID) continue;  // PREM's crust and ocean: CRUST1.0's are used
    double top = gs::PREM_RADIUS_M - s.outer_km * 1e3, bottom = gs::PREM_RADIUS_M - s.inner_km * 1e3;
    if (k == gs::PREM_LID) top = 0;  // the lid continued upward to any Moho
    if (bottom < from_m || top > to_m) continue;
    const auto a = gs::prem_beneath(std::max(top, 1.0), false), b = gs::prem_beneath(bottom, true);
    out.push(Json::object({{"name", std::string(s.name)}, {"region", std::string(s.region)}, {"top_m", top}, {"bottom_m", bottom},
                           {"density_top_kg_m3", a.density_kg_m3}, {"density_bottom_kg_m3", b.density_kg_m3},
                           {"vp_top_m_s", a.vp_m_s}, {"vp_bottom_m_s", b.vp_m_s}, {"vs_top_m_s", a.vs_m_s}, {"vs_bottom_m_s", b.vs_m_s}}));
  }
  return out;
}

inline Json beneath_section(const Json& r) {
  constexpr double deg = std::numbers::pi / 180;
  const std::string body = r["body"].text("earth");
  if (body != "earth" && body != "moon") throw std::invalid_argument("beneath.section: the Earth or the Moon");
  const double lat = r["latitude_deg"].as_number(), lon = r["longitude_deg"].as_number(), az = r["azimuth_deg"].as_number();
  const double half = std::clamp(r["half_m"].as_number(), 1e3, 5000e3);
  const double step = std::clamp(r["step_m"].is_number() ? r["step_m"].as_number() : half / 200, 50.0, half);
  if (half / step > 2000) throw std::invalid_argument("beneath.section: at most 4001 samples");
  const double swath = r["swath_m"].is_number() ? std::clamp(r["swath_m"].as_number(), 0.0, 1000e3) : 100e3;
  // The Earth's ellipsoid, or the Moon's sphere of LOLA's heights.
  static const auto wgs84 = geodesy::geodesic::Geodesic::wgs84();
  static const geodesy::geodesic::Geodesic moon(1737.4e3, 0.0);
  const auto& g = body == "earth" ? wgs84 : moon;
  const gs::SectionLine line(g, lat * deg, lon * deg, az * deg);
  const gs::Section sec = line.sample(half, step);
  const auto crust = body == "earth" ? crust_of_path(r["sources"]["crust1"].text()) : nullptr;
  Json s = Json::array(), la = Json::array(), lo = Json::array(), az_at = Json::array(), cells = Json::array();
  Json columns = Json::object();
  double deepest_moho = 0;
  for (const auto& p : sec.points) {
    s.push(p.s_m);
    la.push(p.latitude / deg);
    lo.push(p.longitude / deg);
    az_at.push(p.azimuth / deg);
    if (!crust) continue;
    const int cell = crust->grid().cell(p.latitude / deg, p.longitude / deg);
    cells.push(double(cell));
    const std::string key = std::to_string(cell);
    if (columns.has(key)) continue;
    const gs::CrustColumn c = crust->column_of_cell(cell);
    Json layers = Json::array();
    for (const auto& l : c.layers)
      layers.push(Json::array({double(l.index), l.top_m, l.bottom_m, l.density_kg_m3, l.vp_m_s, l.vs_m_s}));
    deepest_moho = std::max(deepest_moho, c.moho_depth_m);
    columns.set(key, Json::object({{"surface_m", c.surface_m}, {"solid_m", c.solid_m}, {"moho_depth_m", c.moho_depth_m}, {"oceanic", c.oceanic},
                                   {"layers", layers}, {"mantle", Json::array({c.mantle.density_kg_m3, c.mantle.vp_m_s, c.mantle.vs_m_s})}}));
  }
  // The events within the swath: their distances along and across the geodesic.
  Json events = Json::array();
  const Json& ev = r["events"];
  for (std::size_t i = 0; i < ev.size(); i++) {
    const double elat = ev[i][0].as_number() * deg, elon = ev[i][1].as_number() * deg;
    const gs::SectionOffset o = line.offset(elat, elon);
    if (std::fabs(o.across_m) > swath || std::fabs(o.along_m) > half) continue;
    events.push(Json::array({double(i), o.along_m, o.across_m}));
  }
  Json layer_names = Json::array();
  for (const auto n : gs::CRUST1_LAYERS) layer_names.push(std::string(n));
  Json out = Json::object({{"body", body}, {"latitude_deg", lat}, {"longitude_deg", lon}, {"azimuth_deg", az}, {"half_m", half}, {"step_m", step},
                           {"swath_m", swath},
                           {"points", Json::object({{"s_m", s}, {"latitude_deg", la}, {"longitude_deg", lo}, {"azimuth_deg", az_at}})},
                           {"events", events},
                           {"figure", body == "earth" ? "WGS 84" : "the Moon's sphere of 1737.4 km"}});
  if (crust) {
    out.set("cells", cells);
    out.set("columns", columns);
    out.set("layer_names", layer_names);
    out.set("deepest_moho_m", deepest_moho);
    out.set("prem", prem_shells_json(0, gs::PREM_RADIUS_M));
    out.set("discontinuities", discontinuities_json(0, false));
    out.set("model", "CRUST1.0 to the Moho, PREM (isotropic) below");
  } else {
    out.set("missing", body == "earth" ? NO_CRUST : NO_MOON_INTERIOR);
  }
  return out;
}

}  // namespace cosmopoiesis
