// A mission: a rover that surveys the Moon's crustal magnetic field, and what the mission learns of it
// (decision 0008; formalism §8.8).
//
// The triple relation of a world, the bodies in it and what is known of it:
//
//   the world      the truth. The Moon's crust is T2015_449 and a hidden realisation of what that model leaves
//                  unresolved, to degree 1440 by default, from the law of its spectrum and a seed (the
//                  planetary-science domain's CrustalField, the same draw as its synthetic layer's). No part of
//                  the mission reads it except through its instrument; the page sees it only when it asks to
//                  (reveal). The law fitted to T2015 puts the sources at an effective depth of 6.6 km, and its
//                  unresolved power peaks at degree 450 (a wavelength of 24 km); to degree 1440 the truth carries
//                  all but 0.3 % of it. A rover's survey of a kilometre thus sees a smooth field and its
//                  gradients, which T2015's regularisation has lost: the scales of a rover's own (shallower
//                  sources) are an open question.
//   the body       the rover: a robotics vehicle on the Moon's reference sphere, kinematic or dynamic; its
//                  controller, the waypoint follower, given the rover's pose; its plan, a lawnmower or an
//                  adaptive survey; its magnetometer on a mast, which reads the truth at the sensor, in its own
//                  axes, with white noise drawn by index (robotics sensing).
//   the knowledge  the mission's field of distributions over the crust's field: Gaussian, its prior the law
//                  of the truth itself (mean T2015_449, covariance physis's PotentialCovariance of the
//                  unresolved spectrum), changed only by delivered readings (tyche's Gaussian conditioning,
//                  three scalar observations a reading: its components in the Moon's frame).
//
// Because the truth is a draw from the prior, the posterior is calibrated by construction: its errors over
// its standard deviations are standard normal, and the whitened innovations of the readings too. The map
// shows the posterior; revealed, the truth, the errors and those calibrations beside it. One map's nodes are
// strongly correlated (one truth), so its own coverage scatters widely; calibrate() runs many truths, and
// over them the errors' z is standard normal.
//
// The adaptive survey chooses each next place from a ring of candidates about the rover, within the area,
// by the posterior variance of the field there (robotics planning's best: uncertainty sampling).
//
// Caveats. The rover drives on the reference sphere (1737.4 km), not on the terrain; the external field (the
// solar wind's, a few nanotesla) is taken as removed from the readings; the noise is white and isotropic,
// with no field of the rover's own; the controller and the knowledge are given the rover's true pose (its
// estimation is robotics's planned module).

#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <memory>
#include <numbers>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <physis/analysis/covariance.hpp>
#include <physis/analysis/random_field.hpp>
#include <planetary_science/magnetism/crust.hpp>
#include <robotics/control/waypoints.hpp>
#include <robotics/planning/survey.hpp>
#include <robotics/sensing/mount.hpp>
#include <robotics/vehicles/dynamic.hpp>
#include <robotics/vehicles/kinematic.hpp>
#include <science/json.hpp>
#include <tyche/spatial/conditioning.hpp>

namespace cosmopoiesis::mission {

using science::Json;
using Vec3 = robotics::vehicles::Vec3;
namespace pa = physis::analysis;
namespace pm = planetary_science::magnetism;
namespace rv = robotics::vehicles;
namespace rc = robotics::control;
namespace rp = robotics::planning;
namespace rs = robotics::sensing;

inline constexpr double DEG = std::numbers::pi / 180;
inline constexpr double NANO = 1e9;  // T → nT

// The local axes at a direction: north, east, down.
struct Local {
  Vec3 north, east, down;
};
inline Local local_at(double lat, double lon) {
  const double cp = std::cos(lat), sp = std::sin(lat), cl = std::cos(lon), sl = std::sin(lon);
  return {{-sp * cl, -sp * sl, cp}, {-sl, cl, 0}, {-cp * cl, -cp * sl, -sp}};
}
inline double dot3(const Vec3& a, const Vec3& b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

struct Config {
  double lat_deg = 7.5, lon_deg = -59.0, azimuth_deg = 0;  // Reiner Gamma, the plan's lines along north
  std::string plan = "lawnmower";                          // or "adaptive"
  int lines = 6;
  double length_m = 600, spacing_m = 100;                  // the lawnmower's
  double budget_m = 4000, ring_m = 80, area_m = 700;       // the adaptive survey's
  int candidates = 16;
  std::string fidelity = "kinematic";                      // or "dynamic"
  double speed_m_s = 0.2, mast_m = 1.5, noise_nT = 0.5, interval_m = 10;
  int truth_degree = 1440;
  std::uint64_t truth_seed = 1;

  static Config from(const Json& c) {
    Config k;
    const auto num = [&](const char* key, double& into, double lo, double hi) {
      if (c[key].is_null()) return;
      const double v = c[key].as_number();
      if (!(v >= lo && v <= hi)) throw std::invalid_argument(std::string("mission: ") + key + " between " + std::to_string(lo) + " and " + std::to_string(hi));
      into = v;
    };
    num("lat_deg", k.lat_deg, -80, 80);  // the lawnmower's local axes need north and east
    num("lon_deg", k.lon_deg, -180, 360);
    num("azimuth_deg", k.azimuth_deg, -360, 360);
    num("length_m", k.length_m, 10, 5000);
    num("spacing_m", k.spacing_m, 1, 1000);
    num("budget_m", k.budget_m, 10, 20000);
    num("ring_m", k.ring_m, 5, 1000);
    num("area_m", k.area_m, 20, 5000);
    num("speed_m_s", k.speed_m_s, 0.01, 2);
    num("mast_m", k.mast_m, 0.1, 10);
    num("noise_nT", k.noise_nT, 0.01, 100);
    num("interval_m", k.interval_m, 1, 1000);
    double lines = k.lines, candidates = k.candidates, degree = k.truth_degree, seed = double(k.truth_seed);
    num("lines", lines, 1, 40);
    num("candidates", candidates, 4, 64);
    num("truth_degree", degree, 450, 2000);
    num("truth_seed", seed, 0, 4294967295.0);
    k.lines = int(lines), k.candidates = int(candidates), k.truth_degree = int(degree), k.truth_seed = std::uint64_t(seed);
    k.plan = c["plan"].text(k.plan);
    k.fidelity = c["fidelity"].text(k.fidelity);
    if (k.plan != "lawnmower" && k.plan != "adaptive") throw std::invalid_argument("mission: the plan is \"lawnmower\" or \"adaptive\"");
    if (k.fidelity != "kinematic" && k.fidelity != "dynamic") throw std::invalid_argument("mission: the fidelity is \"kinematic\" or \"dynamic\"");
    return k;
  }
  Json json() const {
    return Json::object({{"lat_deg", lat_deg}, {"lon_deg", lon_deg}, {"azimuth_deg", azimuth_deg}, {"plan", plan}, {"lines", lines}, {"length_m", length_m},
                         {"spacing_m", spacing_m}, {"budget_m", budget_m}, {"ring_m", ring_m}, {"area_m", area_m}, {"candidates", candidates},
                         {"fidelity", fidelity}, {"speed_m_s", speed_m_s}, {"mast_m", mast_m}, {"noise_nT", noise_nT}, {"interval_m", interval_m},
                         {"truth_degree", truth_degree}, {"truth_seed", double(truth_seed)}});
  }
};

class Mission {
 public:
  Mission(std::shared_ptr<const pm::CrustalField> crust, const Config& c)
      : c_(c), crust_(std::move(crust)), sphere_{crust_->model().radius, MOON_GM},
        hidden_(std::make_shared<const pa::HarmonicPotential>(pa::unresolved_part(crust_->model(), crust_->law(), c.truth_degree, c.truth_seed, pm::LUNAR_STREAM))),
        covariance_(pa::PotentialCovariance(spectrum_nT2(*crust_, c.truth_degree), 1, c.truth_degree, crust_->model().radius),
                    crust_->model().radius + c.mast_m, TABLE_ANGLE, TABLE_POINTS),
        mast_{{0, 0, c.mast_m}, rv::Rotation{}}, noise_{c.noise_nT, c.truth_seed ^ 0x6d6167ull, 0x4d414731u} {
    const rv::SurfacePose start = rv::SurfacePose::at(c.lat_deg * DEG, c.lon_deg * DEG, c.azimuth_deg * DEG);
    site_ = start.place(sphere_);
    const rv::Limits limits{std::max(0.3, c.speed_m_s), 0.2, 0.3};
    if (c.fidelity == "kinematic") {
      kin_.emplace(sphere_, limits);
      ks_ = kin_->start(start, 0);
    } else {
      dyn_.emplace(sphere_, rv::Drive{140, 400, 200, 0.5, limits}, rv::Ground{0.5, 0.5, 0.1});
      ds_ = dyn_->start(start, 0);
    }
    gains_ = {c.speed_m_s, 0.6, 0.2, 0.5};
    if (c.plan == "lawnmower") {
      waypoints_ = rp::lawnmower(site_, c.azimuth_deg * DEG, c.length_m, c.spacing_m, c.lines, sphere_);
      follower_.emplace(waypoints_, sphere_, gains_);
    } else {
      follower_.emplace(std::vector<Vec3>{}, sphere_, gains_);
    }
    track_.push_back(latlon(place()));
    last_track_ = place();
    observe();  // a first reading where it stands
    next_reading_m_ = c.interval_m;
  }

  // The Moon's GM (DE440's, m³/s²), for the dynamic rover's weight.
  static constexpr double MOON_GM = 4.9028001e12;
  // The covariance's table: to 0.02 rad (35 km) in 8000 steps, N δ = 3.6 × 10⁻³ at degree 1440 (physis's check holds
  // the table to 4 × 10⁻¹² of the variance at N δ = 1.8 × 10⁻³; the error grows as (N δ)⁴).
  static constexpr double TABLE_ANGLE = 0.02;
  static constexpr int TABLE_POINTS = 8000;

  // The prior's spectrum: the law's power less the model's, and the law's own above its degree (nT²).
  static std::vector<double> spectrum_nT2(const pm::CrustalField& f, int degree) {
    std::vector<double> s = pa::unresolved_spectrum(f.model(), f.law(), degree);
    for (auto& x : s) x *= NANO * NANO;
    return s;
  }

  const Config& config() const { return c_; }
  bool done() const { return done_; }
  double time() const { return kin_ ? ks_.t : ds_.t; }
  double odometer() const { return kin_ ? ks_.odometer : ds_.odometer; }
  const rv::SurfacePose& pose() const { return kin_ ? ks_.pose : ds_.pose; }
  Vec3 place() const { return kin_ ? ks_.place() : ds_.place(); }
  double speed() const { return kin_ ? ks_.speed : dyn_->forward_speed(ds_); }

  // The mission's clock forward by `seconds`, in the vehicle's steps.
  void advance(double seconds) {
    const double h = kin_ ? 0.5 : 0.05;
    const long steps = std::lround(std::ceil(std::max(0.0, seconds) / h));
    for (long i = 0; i < steps && !done_; i++) {
      if (follower_->done()) {
        if (c_.plan == "adaptive" && odometer() < c_.budget_m) plan_next();
        else if (std::fabs(speed()) < 1e-3) {
          done_ = true;  // the plan driven, and the rover at rest
          break;
        }
      }
      const rv::Command command = follower_->command(pose());  // none once the plan is driven: it comes to rest
      if (kin_) kin_->step(ks_, command, h);
      else dyn_->step(ds_, command, h);
      if (odometer() >= next_reading_m_) {
        observe();
        next_reading_m_ += c_.interval_m;
      }
      const auto here = latlon(place());
      if (rv::distance(place(), last_track_, sphere_) >= 2.0) track_.push_back(here), last_track_ = place();
    }
  }

  // The rover, its plan, its track and readings (from the indices given), and the knowledge's measures.
  Json state(bool reveal, std::size_t track_from = 0, std::size_t readings_from = 0) const {
    const auto here = latlon(place());
    Json rover = Json::object({{"t_s", time()}, {"lat_deg", here[0]}, {"lon_deg", here[1]}, {"azimuth_deg", pose().azimuth() / DEG}, {"speed_m_s", speed()},
                               {"odometer_m", odometer()}, {"place_m", vec(place())}, {"fidelity", c_.fidelity}});
    if (dyn_) rover.set("normal_N", ds_.normal), rover.set("lateral_m_s", dyn_->lateral_speed(ds_));
    Json wp = Json::array();
    for (const auto& w : follower_->waypoints()) {
      const auto ll = latlon(w);
      wp.push(Json::array({ll[0], ll[1]}));
    }
    Json track = Json::array();
    for (std::size_t i = std::min(track_from, track_.size()); i < track_.size(); i++) track.push(Json::array({track_[i][0], track_[i][1]}));
    Json readings = Json::array();
    for (std::size_t i = std::min(readings_from, readings_.size()); i < readings_.size(); i++) {
      const auto& r = readings_[i];
      Json x = Json::object({{"t_s", r.t}, {"driven_m", r.driven}, {"lat_deg", r.lat}, {"lon_deg", r.lon}, {"sensor_nT", vec(r.sensor)}, {"ned_nT", vec(r.ned)},
                             {"total_nT", norm3(r.ned)}, {"prior_ned_nT", vec(r.prior_ned)}, {"prior_total_nT", norm3(r.prior_ned)}});
      if (reveal) x.set("truth_ned_nT", vec(r.truth_ned)), x.set("truth_total_nT", norm3(r.truth_ned));
      readings.push(x);
    }
    double square = 0;
    for (double z : G_.whitened()) square += z * z;
    const double n = double(G_.size());
    Json knowledge = Json::object({{"readings", double(readings_.size())}, {"observations", n}, {"whitened_mean_square", n > 0 ? square / n : 0.0},
                                   {"log_likelihood", G_.log_likelihood()}, {"prior", prior_json()}, {"noise_nT", c_.noise_nT}});
    Json out = Json::object({{"config", c_.json()}, {"done", done_}, {"rover", rover},
                             {"plan", Json::object({{"kind", c_.plan}, {"waypoints", wp}, {"next", double(follower_->next())}})},
                             {"track", track}, {"track_total", double(track_.size())}, {"readings", readings}, {"readings_total", double(readings_.size())},
                             {"knowledge", knowledge}, {"site", Json::object({{"lat_deg", c_.lat_deg}, {"lon_deg", c_.lon_deg}})},
                             {"frame", "MOON_ME"}, {"units", "nT, m, s, degrees"}});
    if (reveal) out.set("truth", Json::object({{"model", crust_->source()}, {"degree", c_.truth_degree}, {"seed", double(c_.truth_seed)}}));
    return out;
  }

  // The posterior on a grid of latitudes and longitudes about the site, at the mast's height: its mean and
  // standard deviation of |B| (linearised) and of B's down component; the prior's mean; revealed, the
  // truth, the errors and their calibration.
  Json map(double half_m, int n, bool reveal, std::size_t threads) const {
    if (!(half_m >= 10 && half_m <= 15000) || n < 3 || n > 81) throw std::invalid_argument("mission.map: a half-width of 10 m to 15 km and 3 to 81 points a side");
    const double r = sphere_.radius + c_.mast_m;
    const double lat0 = c_.lat_deg * DEG, lon0 = c_.lon_deg * DEG;
    const double dlat = half_m / sphere_.radius, dlon = half_m / (sphere_.radius * std::cos(lat0));
    std::vector<double> lats(static_cast<std::size_t>(n)), lons(static_cast<std::size_t>(n));
    for (int i = 0; i < n; i++) lats[std::size_t(i)] = lat0 + dlat * (1 - 2.0 * i / (n - 1)), lons[std::size_t(i)] = lon0 + dlon * (-1 + 2.0 * i / (n - 1));
    const auto prior = pa::field_grid(crust_->model(), r, lats, lons);
    std::vector<pa::FieldValue> hidden;
    if (reveal) hidden = pa::field_grid(*hidden_, r, lats, lons);
    const std::size_t N = std::size_t(n) * std::size_t(n);
    std::vector<double> mean_total(N), sd_total(N), mean_down(N), sd_down(N), prior_total(N), prior_down(N), truth_total, truth_down, error_total, z_down;
    if (reveal) truth_total.resize(N), truth_down.resize(N), error_total.resize(N), z_down.resize(N);
    const auto work = [&](std::size_t from, std::size_t to) {
      for (std::size_t k = from; k < to; k++) {
        const std::size_t i = k / std::size_t(n), j = k % std::size_t(n);
        const Local L = local_at(lats[i], lons[j]);
        const Vec3 at = point(r, lats[i], lons[j]);
        const pa::FieldValue& p = prior[k];
        const Vec3 m0{p.north * NANO, p.east * NANO, p.down * NANO};
        const Posterior post = posterior(at, L, m0);
        mean_total[k] = norm3(post.mean), mean_down[k] = post.mean[2], sd_down[k] = std::sqrt(std::max(0.0, post.cov[2][2]));
        sd_total[k] = sd_along(post, post.mean);
        prior_total[k] = norm3(m0), prior_down[k] = m0[2];
        if (reveal) {
          const pa::FieldValue& h = hidden[k];
          const Vec3 t{m0[0] + h.north * NANO, m0[1] + h.east * NANO, m0[2] + h.down * NANO};
          truth_total[k] = norm3(t), truth_down[k] = t[2];
          error_total[k] = mean_total[k] - truth_total[k];
          z_down[k] = sd_down[k] > 0 ? (mean_down[k] - truth_down[k]) / sd_down[k] : 0.0;
        }
      }
    };
    const std::size_t workers = std::max<std::size_t>(1, std::min<std::size_t>(threads, 16));
    std::vector<std::thread> pool;
    for (std::size_t w = 0; w < workers; w++) pool.emplace_back(work, N * w / workers, N * (w + 1) / workers);
    for (auto& t : pool) t.join();
    Json out = Json::object({{"half_m", half_m}, {"n", n}, {"height_m", c_.mast_m}, {"lat_deg", degrees(lats)}, {"lon_deg", degrees(lons)},
                             {"rows", "by latitude from north, each row by longitude from west"},
                             {"mean_total_nT", mean_total}, {"sd_total_nT", sd_total}, {"mean_down_nT", mean_down}, {"sd_down_nT", sd_down},
                             {"prior_total_nT", prior_total}, {"prior_down_nT", prior_down}, {"readings", double(readings_.size())},
                             {"mean_sd_down_nT", mean_of(sd_down)}, {"prior_sd_down_nT", prior_sd_down(r)}});
    if (reveal) {
      double se = 0, se_prior = 0, zz = 0;
      int covered = 0;
      for (std::size_t k = 0; k < N; k++) {
        se += error_total[k] * error_total[k];
        se_prior += (prior_total[k] - truth_total[k]) * (prior_total[k] - truth_total[k]);
        zz += z_down[k] * z_down[k];
        covered += std::fabs(z_down[k]) < 1.959963984540054;
      }
      out.set("truth_total_nT", truth_total), out.set("truth_down_nT", truth_down), out.set("error_total_nT", error_total), out.set("z_down", z_down);
      out.set("calibration", Json::object({{"rms_error_total_nT", std::sqrt(se / double(N))}, {"rms_error_prior_total_nT", std::sqrt(se_prior / double(N))},
                                           {"rms_z_down", std::sqrt(zz / double(N))}, {"coverage_95_down", double(covered) / double(N)},
                                           {"note", "z = (posterior mean − truth)/sd of B's down component, standard normal when the posterior is calibrated; "
                                                    "neighbouring nodes are correlated, so the map's coverage scatters about 0.95 more than independent draws would"}}));
    }
    return out;
  }

 private:
  struct Reading {
    double t = 0, driven = 0, lat = 0, lon = 0;
    Vec3 place{}, sensor{}, ned{}, truth_ned{}, prior_ned{};  // prior: T2015_449 where it read
  };
  struct Posterior {
    Vec3 mean{};
    std::array<std::array<double, 3>, 3> cov{};
  };

  static Json vec(const Vec3& v) { return Json::array({v[0], v[1], v[2]}); }
  static double norm3(const Vec3& v) { return std::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
  static Json degrees(const std::vector<double>& radians) {
    Json a = Json::array();
    for (double x : radians) a.push(x / DEG);
    return a;
  }
  static double mean_of(const std::vector<double>& x) {
    double s = 0;
    for (double v : x) s += v;
    return x.empty() ? 0.0 : s / double(x.size());
  }
  static std::array<double, 2> latlon(const Vec3& p) { return {std::atan2(p[2], std::hypot(p[0], p[1])) / DEG, std::atan2(p[1], p[0]) / DEG}; }
  static Vec3 point(double r, double lat, double lon) { return {r * std::cos(lat) * std::cos(lon), r * std::cos(lat) * std::sin(lon), r * std::sin(lat)}; }

  // B in nT, Cartesian (MOON_ME), of an expansion at a place.
  static Vec3 field_cartesian(const pa::HarmonicPotential& p, const Vec3& at) {
    const double r = norm3(at), lat = std::atan2(at[2], std::hypot(at[0], at[1])), lon = std::atan2(at[1], at[0]);
    const pa::FieldValue f = pa::field_at(p, std::max(r, p.radius), lat, lon);
    const Local L = local_at(lat, lon);
    Vec3 b;
    for (int i = 0; i < 3; i++) b[i] = NANO * (f.north * L.north[i] + f.east * L.east[i] + f.down * L.down[i]);
    return b;
  }

  Json prior_json() const {
    const auto& law = crust_->law();
    return Json::object({{"mean", crust_->source()}, {"covariance", "the unresolved part's law: Rₙ = A nᵝ ρ²ⁿ less the model's power, to degree " + std::to_string(c_.truth_degree)},
                         {"law", Json::object({{"amplitude_T2", law.amplitude}, {"exponent", law.exponent}, {"ratio", law.ratio}, {"depth_m", crust_->depth_m()}})}});
  }

  // The prior standard deviation of B's down component at the mast's height (the same everywhere).
  double prior_sd_down(double r) const {
    const Vec3 at = point(r, c_.lat_deg * DEG, c_.lon_deg * DEG);
    const Local L = local_at(c_.lat_deg * DEG, c_.lon_deg * DEG);
    const auto H = covariance_.field(at, at);
    double v = 0;
    for (int a = 0; a < 3; a++)
      for (int b = 0; b < 3; b++) v += L.down[a] * H[a][b] * L.down[b];
    return std::sqrt(v);
  }

  // The posterior of B (north, east, down, nT) at a place, its prior mean m0 there.
  Posterior posterior(const Vec3& at, const Local& L, const Vec3& m0) const {
    const std::size_t k = readings_.size();
    std::array<std::vector<double>, 3> cov;
    for (auto& v : cov) v.assign(3 * k, 0.0);
    const std::array<const Vec3*, 3> axes{&L.north, &L.east, &L.down};
    for (std::size_t j = 0; j < k; j++) {
      const auto H = covariance_.field(at, readings_[j].place);
      for (int c = 0; c < 3; c++)
        for (int b = 0; b < 3; b++) cov[std::size_t(c)][3 * j + std::size_t(b)] = (*axes[std::size_t(c)])[0] * H[0][b] + (*axes[std::size_t(c)])[1] * H[1][b] + (*axes[std::size_t(c)])[2] * H[2][b];
    }
    const auto H0 = covariance_.field(at, at);
    std::array<std::vector<double>, 3> w;
    for (int c = 0; c < 3; c++) w[std::size_t(c)] = G_.whiten(cov[std::size_t(c)]);
    Posterior P;
    const auto& z = G_.whitened();
    for (int c = 0; c < 3; c++) {
      double m = m0[std::size_t(c)];
      for (std::size_t i = 0; i < z.size(); i++) m += w[std::size_t(c)][i] * z[i];
      P.mean[std::size_t(c)] = m;
      for (int d = 0; d < 3; d++) {
        double prior = 0;
        for (int a = 0; a < 3; a++)
          for (int b = 0; b < 3; b++) prior += (*axes[std::size_t(c)])[a] * H0[a][b] * (*axes[std::size_t(d)])[b];
        for (std::size_t i = 0; i < z.size(); i++) prior -= w[std::size_t(c)][i] * w[std::size_t(d)][i];
        P.cov[std::size_t(c)][std::size_t(d)] = prior;
      }
    }
    return P;
  }
  // The standard deviation of |B| to first order: of B's component along its mean.
  static double sd_along(const Posterior& P, const Vec3& m) {
    const double n = norm3(m);
    if (!(n > 0)) return std::sqrt(std::max(0.0, P.cov[0][0] + P.cov[1][1] + P.cov[2][2]));
    double v = 0;
    for (int a = 0; a < 3; a++)
      for (int b = 0; b < 3; b++) v += m[std::size_t(a)] * P.cov[std::size_t(a)][std::size_t(b)] * m[std::size_t(b)];
    return std::sqrt(std::max(0.0, v)) / n;
  }

  // A reading where the rover stands: the truth at the sensor, in its axes, with noise; then the knowledge
  // conditioned on it, its three components in the Moon's frame.
  void observe() {
    using namespace physis::geometry::operators;
    const rs::SensorPose S = rs::sensor_pose(place(), pose(), mast_);
    const Vec3 truth = field_cartesian(crust_->model(), S.place) + field_cartesian(*hidden_, S.place);
    const Vec3 noise = noise_.vector(readings_.size());
    const Vec3 in_sensor = S.to_sensor(truth);
    Reading r;
    r.t = time();
    r.place = S.place;
    r.sensor = {in_sensor[0] + noise[0], in_sensor[1] + noise[1], in_sensor[2] + noise[2]};
    const Vec3 measured = S.from_sensor(r.sensor);
    const auto ll = latlon(S.place);
    r.lat = ll[0], r.lon = ll[1];
    const Local L = local_at(ll[0] * DEG, ll[1] * DEG);
    r.ned = {dot3(measured, L.north), dot3(measured, L.east), dot3(measured, L.down)};
    r.truth_ned = {dot3(truth, L.north), dot3(truth, L.east), dot3(truth, L.down)};
    r.driven = odometer();
    // The innovations against the prior mean, and the covariances with every earlier reading.
    const Vec3 mean = field_cartesian(crust_->model(), S.place);
    r.prior_ned = {dot3(mean, L.north), dot3(mean, L.east), dot3(mean, L.down)};
    std::vector<std::array<std::array<double, 3>, 3>> blocks;
    blocks.reserve(readings_.size());
    for (const auto& q : readings_) blocks.push_back(covariance_.field(S.place, q.place));
    const auto self = covariance_.field(S.place, S.place);
    for (int a = 0; a < 3; a++) {
      std::vector<double> c;
      c.reserve(3 * blocks.size() + 2);
      for (const auto& B : blocks)
        for (int b = 0; b < 3; b++) c.push_back(B[a][b]);
      for (int b = 0; b < a; b++) c.push_back(self[a][b]);
      G_.observe(c, self[a][a], c_.noise_nT * c_.noise_nT, measured[std::size_t(a)] - mean[std::size_t(a)]);
    }
    readings_.push_back(r);
  }

  // The adaptive survey's next place: the candidate about the rover, within the area, where the field is
  // least known; the site's centre when none is within it.
  void plan_next() {
    const auto candidates = rp::ring(pose(), c_.ring_m, c_.candidates, sphere_);
    std::vector<Vec3> inside;
    for (const auto& x : candidates)
      if (rv::distance(x, site_, sphere_) <= c_.area_m) inside.push_back(x);
    Vec3 next = site_;
    if (!inside.empty()) {
      const double r = sphere_.radius + c_.mast_m;
      const auto value = [&](const Vec3& x) {
        const auto ll = latlon(x);
        const Local L = local_at(ll[0] * DEG, ll[1] * DEG);
        const auto P = posterior(point(r, ll[0] * DEG, ll[1] * DEG), L, {0, 0, 0});
        return P.cov[0][0] + P.cov[1][1] + P.cov[2][2];
      };
      next = inside[rp::best(inside, value, [](const Vec3&) { return 0.0; }, 0.0)];
    }
    follower_.emplace(std::vector<Vec3>{next}, sphere_, gains_);
  }

  Config c_;
  std::shared_ptr<const pm::CrustalField> crust_;
  rv::Sphere sphere_;
  std::shared_ptr<const pa::HarmonicPotential> hidden_;
  pa::TabulatedCovariance covariance_;
  rs::Mount mast_;
  rs::WhiteNoise noise_;
  Vec3 site_{};
  std::optional<rv::KinematicRover> kin_;
  std::optional<rv::DynamicRover> dyn_;
  rv::KinematicState ks_;
  rv::DynamicState ds_;
  rc::FollowerGains gains_;
  std::vector<Vec3> waypoints_;
  std::optional<rc::WaypointFollower> follower_;
  tyche::spatial::GaussianConditioning G_;
  std::vector<Reading> readings_;
  std::vector<std::array<double, 2>> track_;
  Vec3 last_track_{};
  double next_reading_m_ = 0;
  bool done_ = false;
};

// The posterior's calibration over many truths: the same mission run with each seed, its map's z of B's
// down component pooled over the nodes and the seeds, and the whitened innovations pooled over the readings.
// Under the model both are standard normal: rms z → 1, the 95 % intervals cover 0.95, the innovations' mean
// square → 1.
inline Json calibrate(const std::shared_ptr<const pm::CrustalField>& crust, Config c, const std::vector<std::uint64_t>& seeds, double half_m, int n,
                      std::size_t threads) {
  struct Tally {
    double zz = 0, ww = 0;
    long nodes = 0, covered = 0, observations = 0;
  };
  std::vector<Tally> tallies(seeds.size());
  const auto run = [&](std::size_t from, std::size_t to) {
    for (std::size_t i = from; i < to; i++) {
      Config k = c;
      k.truth_seed = seeds[i];
      Mission m(crust, k);
      for (int guard = 0; guard < 10000 && !m.done(); guard++) m.advance(600);
      const Json mp = m.map(half_m, n, true, 1);
      const Json& z = mp["z_down"];
      Tally& t = tallies[i];
      for (std::size_t j = 0; j < z.size(); j++) {
        const double v = z[j].as_number();
        t.zz += v * v, t.nodes++, t.covered += std::fabs(v) < 1.959963984540054;
      }
      const Json st = m.state(false);
      t.observations = long(st["knowledge"]["observations"].as_number());
      t.ww = st["knowledge"]["whitened_mean_square"].as_number() * double(t.observations);
    }
  };
  const std::size_t workers = std::max<std::size_t>(1, std::min(threads, seeds.size()));
  std::vector<std::thread> pool;
  for (std::size_t w = 0; w < workers; w++) pool.emplace_back(run, seeds.size() * w / workers, seeds.size() * (w + 1) / workers);
  for (auto& t : pool) t.join();
  Tally all;
  for (const auto& t : tallies) all.zz += t.zz, all.ww += t.ww, all.nodes += t.nodes, all.covered += t.covered, all.observations += t.observations;
  return Json::object({{"seeds", double(seeds.size())}, {"nodes", double(all.nodes)}, {"rms_z_down", std::sqrt(all.zz / double(all.nodes))},
                       {"coverage_95_down", double(all.covered) / double(all.nodes)}, {"observations", double(all.observations)},
                       {"whitened_mean_square", all.ww / double(all.observations)}, {"config", c.json()},
                       {"note", "a map's nodes are correlated within a truth, so the pooled z has fewer independent draws than nodes"}});
}

}  // namespace cosmopoiesis::mission
