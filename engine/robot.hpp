// Robots in the world: the rabbit of the robotics domain (legged/) on the Moon and its fish (swimming/) in the
// Earth's ocean, each simulated in a session of the serving engine and placed on a body at a site (decisions
// 0011, 0012; the infrastructure's ADR 0058, 0059).
//
// The fish swims in its horizontal plane at a depth below the sea's surface, its x forward along the azimuth
// and its second axis to its left. It swims only in the sea: where CRUST1.0 (the geophysics domain) has less
// water than twice its depth, it is refused. Its water is the world's (oceanography water): the upper ocean's
// density and current at the site, realised with the world's seed; it is told the presumption (none of the
// current), and its readings and its drawing keep the two apart.
//
// The dog trots on the Earth's ground in its sagittal plane along the azimuth. Its ground is the world's
// (geophysics ground): the class CRUST1.0 gives the place (ice, sediment or rock), that class's presumed law
// realised with the world's seed; at sea it is refused. It is told the presumption and learns its ground from
// its feet, as the rabbit does.
//
// The robot moves in its own vertical plane, the plane through the site along an azimuth: its x forward
// along the azimuth, its z up along the body's normal there. The page places that plane in the world (its
// origin on the ground at the site) and draws the links from their poses in it. The ground is the plane's
// line, level: at the robot's scale (a metre) LOLA's 237 m grid gives no slope worth the name, and a slope is
// a later piece of work (a ground line's slope is physis's GroundLine already).
//
// Gravity is the body's at the site: the Moon's GM over its radius squared (DE440's GM, the sphere of
// 1737.4 km), the Earth's normal gravity at the site's latitude (WGS 84's level ellipsoid, Somigliana).
//
// Operations (cosmopoiesis.cpp):
//   robot.models                                    the catalogue: the rabbit's links, motors, feet, shapes
//   robot.start   {session, config: {model, body, lat_deg, lon_deg, azimuth_deg, method}}
//   robot.command {session, behaviour, speed_m_s, height_m}     → refused, with the reason, if it cannot
//   robot.step    {session, seconds, since_frame}               → the frames since since_frame, and the state
//   robot.state | robot.stop {session}
//   robot.run     {config, commands: [{t_s, behaviour, speed_m_s, height_m}], seconds}  a session run whole, its
//                                                   commands given at their times; its state at the end
// The frames are the links' poses at 60 Hz of the robot's time, for drawing; the state its readings and
// the checks of its motion (the energy's account, the angular momentum in flight, the method's cost).
//
// The ground (decision 0012; ADR 0059). On the Moon the robot's feet press on the world's regolith: the
// planetary-science domain's presumed contact law, realised with the world's seed (the fields
// moon.ground.*, the same ground the POINT page reads), along the robot's line. The robot is told the
// presumption (a virtual instrument's reading of the world's model) and learns the ground from its feet;
// the answers give the presumption, its belief and its feet's readings, and the truth only when revealed
// ("reveal"), as the rover's mission does. Elsewhere it stands on its own law, the same everywhere.

#pragma once

#include <algorithm>
#include <cmath>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>

#include <geodesy/gravity/normal.hpp>
#include <oceanography/water/presumed.hpp>
#include <geophysics/ground/presumed.hpp>
#include <robotics/quadruped/dog.hpp>
#include <robotics/swimming/fish.hpp>
#include <planetary_science/surfaces/regolith.hpp>
#include <robotics/legged/simulation.hpp>
#include <science/json.hpp>

#include "beneath.hpp"

namespace cosmopoiesis::robot {

namespace rl = robotics::legged;
namespace pm = physis::mechanics;
using science::Json;

inline constexpr double MOON_GM = 4.9028001e12;   // DE440's, m³/s²
inline constexpr double MOON_RADIUS = 1737.4e3;   // m

inline double gravity_at(const std::string& body, double lat_deg) {
  if (body == "moon") return MOON_GM / (MOON_RADIUS * MOON_RADIUS);
  if (body == "earth") return geodesy::gravity::LevelEllipsoid::wgs84().somigliana(lat_deg * rl::DEG);
  throw std::invalid_argument("robot: a body the rabbit can stand on: the Moon or the Earth");
}

inline Json vec(const std::array<double, 2>& a) { return Json::array({a[0], a[1]}); }

inline constexpr std::uint64_t WORLD_SEED = 20261028;  // the world's, unless a request names another

// The world's ground along the robot's line: on the Moon, the regolith at the site's point plus x along the
// azimuth (in the Moon's fixed frame, on its sphere); nowhere else yet.
struct GroundOfSite {
  std::shared_ptr<const planetary_science::surfaces::RegolithGround> regolith;
  std::array<double, 3> origin{}, forward{};
  pm::CompliantContact at(double x) const {
    const auto g = regolith->at({origin[0] + x * forward[0], origin[1] + x * forward[1], origin[2] + x * forward[2]});
    pm::CompliantContact c;
    c.stiffness = g.stiffness(), c.exponent = g.exponent, c.damping = g.damping_s_m, c.friction = g.friction, c.slip_speed = 0.01;
    return c;
  }
};

// A robot of a session, whatever its body: what the engine's operations ask of it.
class Robot {
 public:
  virtual ~Robot() = default;
  virtual Json command(const Json& r) = 0;
  virtual Json step(double seconds, std::size_t since, std::size_t since_reading, bool reveal) = 0;
  virtual Json state(bool reveal) const = 0;
  virtual Json frames(std::size_t since) const = 0;
  virtual void advance(double seconds) = 0;
  virtual double time() const = 0;
};

Json fish_model();
Json dog_model();

// The catalogue: what the page needs to draw the robots and to say what they are.
inline Json catalogue() {
  const auto r = rl::rabbit();
  Json links = Json::array();
  for (std::size_t i = 0; i < r.links.size(); i++) {
    const auto& l = r.links[i];
    const auto& sh = r.shapes[i];
    links.push(Json::object({{"name", l.name}, {"parent", double(l.parent)}, {"joint_m", vec(l.joint)}, {"mass_kg", l.mass}, {"centre_m", vec(l.centre)},
                             {"inertia_kg_m2", l.inertia}, {"armature_kg_m2", l.armature},
                             {"shape", Json::object({{"kind", std::string(sh.kind)}, {"from_m", vec(sh.from)}, {"length_m", sh.length},
                                                     {"thickness_m", sh.thickness}, {"width_m", sh.width}, {"paired", sh.paired}})}}));
  }
  Json motors = Json::array();
  for (std::size_t j = 0; j < rl::JOINTS; j++) {
    const auto& m = r.actuators[j];
    motors.push(Json::object({{"joint", std::string(rl::JOINT_NAMES[j])}, {"peak_n_m", m.peak}, {"no_load_rad_s", m.no_load}, {"stall_n_m", m.stall()},
                              {"armature_kg_m2", m.armature}, {"torque_constant_n_m_a", m.torque_constant}, {"resistance_ohm", m.resistance},
                              {"lower_rad", r.limits[j].lower}, {"upper_rad", r.limits[j].upper}}));
  }
  Json feet = Json::array();
  for (const auto& f : r.feet) feet.push(Json::object({{"name", std::string(f.name)}, {"link", double(f.link)}, {"point_m", vec(f.point)}}));
  return Json::object({{"models", Json::array({Json::object({
                           {"model", "rabbit"},
                           {"title", "A rabbit: a hopping robot of 1.69 kg"},
                           {"mass_kg", r.mass()},
                           {"links", links},
                           {"motors", motors},
                           {"feet", feet},
                           {"tendon", Json::object({{"stiffness_n_m_rad", r.tendon_stiffness}, {"rest_rad", r.tendon_rest}})},
                           {"ground", Json::object({{"stiffness", r.ground_law.stiffness}, {"exponent", r.ground_law.exponent}, {"damping_s_m", r.ground_law.damping},
                                                    {"friction", r.ground_law.friction}, {"slip_speed_m_s", r.ground_law.slip_speed}})},
                           {"behaviours", Json::array({"stand", "hop", "stop"})},
                           {"methods", Json::array({"variational", "semi_implicit", "runge_kutta"})},
                           {"coordinates", Json::array({"x", "z", "pitch", "hip", "knee", "ankle", "shoulder", "elbow"})},
                       }), fish_model(), dog_model()})}});
}

class Session : public Robot {
 public:
  Session(const Json& c)
      : body_(c["body"].text("moon")), lat_(c["lat_deg"].is_number() ? c["lat_deg"].as_number() : 7.5),
        lon_(c["lon_deg"].is_number() ? c["lon_deg"].as_number() : -59.0), azimuth_(c["azimuth_deg"].is_number() ? c["azimuth_deg"].as_number() : 90.0),
        seed_(c["seed"].is_number() ? std::uint64_t(c["seed"].as_number()) : WORLD_SEED), ground_(ground_of(body_, lat_, lon_, azimuth_, seed_)),
        sim_(rl::rabbit(), config(c, gravity_at(body_, lat_), ground_)) {
    if (c["model"].text("rabbit") != "rabbit") throw std::invalid_argument("robot: the model is the rabbit");
  }

  void advance(double seconds) override { sim_.advance(seconds); }
  double time() const override { return sim_.time(); }

  Json command(const Json& r) override {
    const std::string b = r["behaviour"].text("stand");
    rl::Command cmd;
    cmd.behaviour = b == "hop" ? rl::Behaviour::hop : b == "stop" ? rl::Behaviour::stop : rl::Behaviour::stand;
    if (b != "hop" && b != "stop" && b != "stand") throw std::invalid_argument("robot.command: the behaviour is stand, hop or stop");
    cmd.speed = std::clamp(r["speed_m_s"].is_number() ? r["speed_m_s"].as_number() : 0.0, -0.5, 0.5);
    cmd.height = std::clamp(r["height_m"].is_number() ? r["height_m"].as_number() : 0.15, 0.02, 0.4);
    sim_.command(cmd);
    Json a = state();
    if (!sim_.controller().refusal().empty()) a.set("refused", sim_.controller().refusal());
    return a;
  }

  Json step(double seconds, std::size_t since, std::size_t since_reading = 0, bool reveal = false) override {
    sim_.advance(std::clamp(seconds, 0.0, 5.0));
    Json a = state(reveal);
    a.set("frames", frames(since));
    a.set("readings", readings(since_reading));
    // Keep the frames the page has not yet read; drop the rest.
    if (since > sim_.frames_dropped()) sim_.trim_frames(since - sim_.frames_dropped());
    return a;
  }

  Json frames(std::size_t since) const override {
    Json out = Json::array();
    const auto& fs = sim_.frames();
    const std::size_t base = sim_.frames_dropped();
    for (std::size_t i = since > base ? since - base : 0; i < fs.size(); i++) {
      const auto& f = fs[i];
      const auto st = sim_.tree().kinematics(f.q);
      Json poses = Json::array();
      for (const auto& l : st) poses.push(Json::array({l.o[0], l.o[1], l.theta}));
      Json q = Json::array(), tq = Json::array(), n = Json::array();
      for (double x : f.q) q.push(x);
      for (double x : f.torque) tq.push(x);
      for (double x : f.normal) n.push(x);
      out.push(Json::object({{"i", double(base + i)}, {"t_s", f.t}, {"poses", poses}, {"q", q}, {"torque_n_m", tq}, {"normal_n", n}, {"com_m", vec(f.com)},
                             {"phase", std::string(rl::phase_name(f.phase))}}));
    }
    return out;
  }

  // The feet's readings of the ground since an index: [t, x, parameter (0 friction, 1 load), value].
  Json readings(std::size_t since) const {
    Json out = Json::array();
    const auto& rs = sim_.readings();
    const std::size_t base = sim_.readings_dropped();
    for (std::size_t i = since > base ? since - base : 0; i < rs.size(); i++) out.push(Json::array({rs[i].t, rs[i].x, double(rs[i].parameter), rs[i].value}));
    return out;
  }

  // The ground: what the robot was told, what it believes where its toe is and along its line, and (revealed)
  // the truth.
  Json ground(bool reveal) const {
    const auto& b = sim_.belief();
    const auto& pr = b.presumption;
    const double x = sim_.contacts()[0].place[0];
    const auto f = b.friction.at(x), l = b.load.at(x);
    Json g = Json::object({
        {"model", ground_.regolith ? "the Moon's regolith (planetary-science surfaces), its presumed law realised with the world's seed" : "the robot's own contact law, the same everywhere (no model of this ground)"},
        {"presumed", Json::object({{"friction", pr.friction.median}, {"friction_log_sd", pr.friction.log_sd}, {"load_1mm_n", pr.load.median},
                                   {"load_log_sd", pr.load.log_sd}, {"correlation_m", pr.correlation_m}})},
        {"belief_here", Json::object({{"x_m", x}, {"friction", f.median}, {"friction_log_sd", f.log_sd}, {"load_1mm_n", l.median}, {"load_log_sd", l.log_sd}})},
        {"readings", Json::object({{"friction", double(b.friction.readings())}, {"load", double(b.load.readings())}})},
        {"whitened_mean_square", Json::object({{"friction", b.friction.whitened_mean_square()}, {"load", b.load.whitened_mean_square()}})},
        {"readings_total", double(sim_.readings_dropped() + sim_.readings().size())},
    });
    // Along the line: from half a metre behind the first place it read (or its start) to a metre ahead.
    double lo = std::min(0.0, x) - 0.5, hi = x + 1.0;
    for (double p : b.friction.places()) lo = std::min(lo, p - 0.5);
    lo = std::max(lo, hi - 12.0);
    Json xs = Json::array(), fm = Json::array(), fs = Json::array(), lm = Json::array(), ls = Json::array(), tf = Json::array(), tl = Json::array();
    const int n = 120;
    for (int i = 0; i <= n; i++) {
      const double u = lo + (hi - lo) * i / n;
      const auto bf = b.friction.at(u), bl = b.load.at(u);
      xs.push(u), fm.push(bf.median), fs.push(bf.log_sd), lm.push(bl.median), ls.push(bl.log_sd);
      if (reveal) {
        const auto t = sim_.ground_at(u);
        tf.push(t.friction), tl.push(t.stiffness * std::pow(1e-3, t.exponent));
      }
    }
    Json profile = Json::object({{"x_m", xs}, {"friction", fm}, {"friction_log_sd", fs}, {"load_1mm_n", lm}, {"load_log_sd", ls}});
    if (reveal) {
      profile.set("truth_friction", tf), profile.set("truth_load_1mm_n", tl);
      const auto t = sim_.ground_at(x);
      g.set("truth_here", Json::object({{"friction", t.friction}, {"load_1mm_n", t.stiffness * std::pow(1e-3, t.exponent)}, {"damping_s_m", t.damping}}));
    }
    g.set("profile", profile);
    return g;
  }

  Json state(bool reveal = false) const override {
    const auto& q = sim_.q();
    const auto& v = sim_.v();
    const auto com = sim_.tree().centre_of_mass(q);
    const auto P = sim_.tree().linear_momentum(q, v);
    const double m = sim_.rabbit().mass();
    Json joints = Json::array();
    for (std::size_t j = 0; j < rl::JOINTS; j++) {
      const auto& a = sim_.rabbit().actuators[j];
      const double tau = sim_.torque()[j], w = v[rl::HIP + j];
      joints.push(Json::object({{"joint", std::string(rl::JOINT_NAMES[j])}, {"angle_rad", q[rl::HIP + j]}, {"rate_rad_s", w}, {"torque_n_m", tau},
                                {"peak_n_m", a.peak}, {"power_w", a.electrical_power(tau, w)}}));
    }
    Json feet = Json::array();
    const auto cs = sim_.contacts();
    for (std::size_t i = 0; i < cs.size(); i++)
      feet.push(Json::object({{"name", std::string(sim_.rabbit().feet[i].name)}, {"normal_n", cs[i].normal}, {"touching", cs[i].touching},
                              {"slip_m_s", cs[i].slip}, {"penetration_m", cs[i].penetration}}));
    const auto& ctl = sim_.controller();
    return Json::object({
        {"t_s", sim_.time()},
        {"body", body_},
        {"site", Json::object({{"lat_deg", lat_}, {"lon_deg", lon_}, {"azimuth_deg", azimuth_}})},
        {"gravity_m_s2", sim_.config().gravity},
        {"method", std::string(rl::method_name(sim_.config().method))},
        {"step_s", sim_.config().step},
        {"behaviour", std::string(rl::behaviour_name(ctl.current().behaviour))},
        {"speed_asked_m_s", ctl.current().speed},
        {"height_asked_m", ctl.current().height},
        {"standing_height_m", ctl.standing_height()},
        {"phase", std::string(rl::phase_name(ctl.phase()))},
        {"hops", double(ctl.hops())},
        {"apex_m", ctl.last_apex()},
        {"stance_s", ctl.stance_time()},
        {"thrust_n", ctl.thrust()},
        {"pitch_rad", q[rl::PITCH]},
        {"com_m", vec(com)},
        {"velocity_m_s", Json::array({P[0] / m, P[1] / m})},
        {"distance_m", sim_.distance()},
        {"joints", joints},
        {"feet", feet},
        {"energy", Json::object({{"energy_j", sim_.energy()},
                                 {"residual_j", sim_.energy_residual()},
                                 {"motor_work_j", sim_.motor_work()},
                                 {"electrical_j", sim_.electrical_energy()},
                                 {"peak_power_w", sim_.peak_power()},
                                 {"cost_of_transport", sim_.cost_of_transport()}})},
        {"checks", Json::object({{"flight_momentum_change", sim_.flight_momentum_change()},
                                 {"max_penetration_m", sim_.max_penetration()},
                                 {"fallbacks", double(sim_.fallbacks())},
                                 {"cost_s_per_s", sim_.cost()}})},
        {"model", "rabbit"},
        {"ground", ground(reveal)},
        {"seed", double(seed_)},
        {"frames_dropped", double(sim_.frames_dropped())},
        {"frames_total", double(sim_.frames_dropped() + sim_.frames().size())},
    });
  }

 private:
  static GroundOfSite ground_of(const std::string& body, double lat_deg, double lon_deg, double azimuth_deg, std::uint64_t seed) {
    GroundOfSite g;
    if (body != "moon") return g;
    namespace ps = planetary_science::surfaces;
    g.regolith = std::make_shared<const ps::RegolithGround>(ps::RegolithLaw{}, seed);
    const double la = lat_deg * rl::DEG, lo = lon_deg * rl::DEG, az = azimuth_deg * rl::DEG, R = ps::MOON_RADIUS_M;
    g.origin = {R * std::cos(la) * std::cos(lo), R * std::cos(la) * std::sin(lo), R * std::sin(la)};
    const std::array<double, 3> E{-std::sin(lo), std::cos(lo), 0.0}, N{-std::sin(la) * std::cos(lo), -std::sin(la) * std::sin(lo), std::cos(la)};
    for (int k = 0; k < 3; k++) g.forward[std::size_t(k)] = std::sin(az) * E[std::size_t(k)] + std::cos(az) * N[std::size_t(k)];
    return g;
  }

  static rl::SimulationConfig config(const Json& c, double g, const GroundOfSite& ground) {
    rl::SimulationConfig sc;
    sc.gravity = g;
    sc.method = rl::method_of(c["method"].text("semi_implicit"));
    if (ground.regolith) {
      sc.ground_at = [ground](double x) { return ground.at(x); };
      const auto& law = ground.regolith->law();
      sc.presumption.friction = {law.friction.median, law.friction.log_sd};
      sc.presumption.load = {law.load.median, law.load.log_sd};
      sc.presumption.exponent = law.exponent;
      sc.presumption.correlation_m = law.correlation_m;
    }
    return sc;
  }

  std::string body_;
  double lat_, lon_, azimuth_;
  std::uint64_t seed_;
  GroundOfSite ground_;
  rl::Simulation sim_;
};

// ---- the fish ----------------------------------------------------------------------------------------------

namespace rs = robotics::swimming;

inline Json fish_model() {
  const auto f = rs::fish();
  Json links = Json::array();
  for (std::size_t i = 0; i < f.links.size(); i++) {
    const auto& l = f.links[i];
    const auto& b = f.parts[i];
    links.push(Json::object({{"name", l.name}, {"parent", double(l.parent)}, {"joint_m", vec(l.joint)}, {"offset_rad", l.offset}, {"mass_kg", l.mass},
                             {"centre_m", vec(l.centre)}, {"inertia_kg_m2", l.inertia}, {"armature_kg_m2", l.armature},
                             {"part", Json::object({{"from_m", vec(b.from)}, {"length_m", b.length}, {"height_m", b.height}})}}));
  }
  Json motors = Json::array();
  for (std::size_t j = 0; j < rs::JOINTS; j++) {
    const auto& m = f.motors[j];
    motors.push(Json::object({{"joint", std::string(rs::JOINT_NAMES[j])}, {"peak_n_m", m.peak}, {"no_load_rad_s", m.no_load}, {"torque_constant_n_m_a", m.torque_constant},
                              {"resistance_ohm", m.resistance}, {"limit_rad", f.limit[j]}}));
  }
  const auto w = rs::water();
  return Json::object({{"model", "fish"},
                       {"title", "A fish: a swimming robot of 1.85 kg"},
                       {"mass_kg", f.mass()},
                       {"length_m", f.length()},
                       {"links", links},
                       {"motors", motors},
                       {"water", Json::object({{"normal_drag", w.normal_drag}, {"friction_drag", w.friction_drag}, {"strips", double(w.strips)}})},
                       {"behaviours", Json::array({"hold", "swim", "stop"})},
                       {"methods", Json::array({"variational", "semi_implicit", "runge_kutta"})},
                       {"coordinates", Json::array({"x", "y", "heading", "neck", "waist", "peduncle", "tail"})}});
}

class FishSession : public Robot {
 public:
  FishSession(const Json& c, const Json& sources)
      : body_(c["body"].text("earth")), lat_(c["lat_deg"].is_number() ? c["lat_deg"].as_number() : 0.0), lon_(c["lon_deg"].is_number() ? c["lon_deg"].as_number() : -150.0),
        azimuth_(c["azimuth_deg"].is_number() ? c["azimuth_deg"].as_number() : 90.0), depth_(std::clamp(c["depth_m"].is_number() ? c["depth_m"].as_number() : 1.0, 0.3, 100.0)),
        seed_(c["seed"].is_number() ? std::uint64_t(c["seed"].as_number()) : WORLD_SEED), ocean_(oceanography::water::WaterLaw{}, seed_),
        water_(ocean_.at(site_point())), sim_(rs::fish(), config(c)) {
    if (body_ != "earth") throw std::invalid_argument("robot: the fish swims in the Earth's ocean");
    if (const auto crust = crust_of_path(sources["crust1"].text())) {
      const double w = crust->column(lat_, lon_).water_m;
      if (w < 2 * depth_)
        throw std::invalid_argument("robot: the fish needs the sea: CRUST1.0 has " + std::to_string(int(std::lround(w))) + " m of water at this place, and it swims " +
                                    std::to_string(depth_).substr(0, 4) + " m down");
      sea_m_ = w;
    }
  }

  void advance(double seconds) override { sim_.advance(seconds); }
  double time() const override { return sim_.time(); }

  Json command(const Json& r) override {
    const std::string b = r["behaviour"].text("hold");
    if (b != "hold" && b != "swim" && b != "stop") throw std::invalid_argument("robot.command: the fish's behaviour is hold, swim or stop");
    rs::Command cmd;
    cmd.behaviour = b == "swim" ? rs::Behaviour::swim : b == "stop" ? rs::Behaviour::stop : rs::Behaviour::hold;
    cmd.speed = std::clamp(r["speed_m_s"].is_number() ? r["speed_m_s"].as_number() : 0.15, 0.0, 0.4);
    cmd.turn = std::clamp(r["turn"].is_number() ? r["turn"].as_number() : 0.0, -1.0, 1.0);
    sim_.command(cmd);
    return state(false);
  }

  Json step(double seconds, std::size_t since, std::size_t, bool reveal) override {
    sim_.advance(std::clamp(seconds, 0.0, 5.0));
    Json a = state(reveal);
    a.set("frames", frames(since));
    a.set("readings", Json::array());
    if (since > sim_.frames_dropped()) sim_.trim_frames(since - sim_.frames_dropped());
    return a;
  }

  Json frames(std::size_t since) const override {
    Json out = Json::array();
    const auto& fs = sim_.frames();
    const std::size_t base = sim_.frames_dropped();
    for (std::size_t i = since > base ? since - base : 0; i < fs.size(); i++) {
      const auto& f = fs[i];
      const auto st = sim_.tree().kinematics(f.q);
      Json poses = Json::array(), q = Json::array(), tq = Json::array(), wake = Json::array();
      for (const auto& l : st) poses.push(Json::array({l.o[0], l.o[1], l.theta}));
      for (double x : f.q) q.push(x);
      for (double x : f.torque) tq.push(x);
      for (const auto& w : f.wake) wake.push(Json::array({w.x, w.y, w.fx, w.fy}));
      out.push(Json::object({{"i", double(base + i)}, {"t_s", f.t}, {"poses", poses}, {"q", q}, {"torque_n_m", tq}, {"wake", wake},
                             {"com_m", Json::array({f.q[rs::X], f.q[rs::Y]})}, {"phase", "swimming"}}));
    }
    return out;
  }

  Json state(bool reveal) const override {
    const auto& q = sim_.q();
    const auto& v = sim_.v();
    const auto& ctl = sim_.controller();
    Json joints = Json::array();
    for (std::size_t j = 0; j < rs::JOINTS; j++) {
      const auto& m = sim_.fish().motors[j];
      const double tau = sim_.torque()[j], w = v[rs::J1 + j];
      joints.push(Json::object({{"joint", std::string(rs::JOINT_NAMES[j])}, {"angle_rad", q[rs::J1 + j]}, {"rate_rad_s", w}, {"torque_n_m", tau},
                                {"peak_n_m", m.peak}, {"power_w", m.electrical_power(tau, w)}}));
    }
    const auto& law = ocean_.law();
    Json water = Json::object({{"model", "the upper ocean (oceanography water), its presumed law realised with the world's seed"},
                               {"presumed", Json::object({{"density_kg_m3", law.density_median}, {"current_m_s", Json::array({0.0, 0.0})}, {"current_sd_m_s", law.current_sd}})},
                               {"depth_m", depth_}});
    if (sea_m_ > 0) water.set("sea_depth_m", sea_m_);
    if (reveal) water.set("truth", Json::object({{"density_kg_m3", water_.density}, {"current_east_north_m_s", Json::array({water_.east, water_.north})},
                                                 {"current_plane_m_s", Json::array({sim_.config().current[0], sim_.config().current[1]})}}));
    const bool fastest = ctl.current().behaviour == rs::Behaviour::swim && ctl.frequency() >= 3.0 - 1e-9 && sim_.forward() < ctl.current().speed;
    const auto tip = sim_.tail_tip();
    return Json::object({
        {"model", "fish"},
        {"t_s", sim_.time()},
        {"body", body_},
        {"site", Json::object({{"lat_deg", lat_}, {"lon_deg", lon_}, {"azimuth_deg", azimuth_}, {"depth_m", depth_}})},
        {"method", std::string(rs::method_name(sim_.config().method))},
        {"step_s", sim_.config().step},
        {"behaviour", std::string(rs::behaviour_name(ctl.current().behaviour))},
        {"speed_asked_m_s", ctl.current().speed},
        {"turn_asked", ctl.current().turn},
        {"frequency_hz", ctl.frequency()},
        {"at_fastest_beat", fastest},
        {"heading_rad", q[rs::HEADING]},
        {"azimuth_now_deg", azimuth_ - q[rs::HEADING] * 180 / std::numbers::pi},
        {"position_m", Json::array({q[rs::X], q[rs::Y]})},
        {"velocity_m_s", Json::array({v[rs::X], v[rs::Y]})},
        {"forward_m_s", sim_.forward()},
        {"distance_m", sim_.odometer()},
        {"tail_tip_m", vec(tip)},
        {"joints", joints},
        {"water", water},
        {"energy", Json::object({{"energy_j", sim_.energy()}, {"residual_j", sim_.energy_residual()}, {"electrical_j", sim_.electrical_energy()},
                                 {"peak_power_w", sim_.peak_power()}, {"cost_of_transport", sim_.cost_of_transport()}})},
        {"checks", Json::object({{"fallbacks", double(sim_.fallbacks())}, {"cost_s_per_s", sim_.cost()}})},
        {"seed", double(seed_)},
        {"frames_dropped", double(sim_.frames_dropped())},
        {"frames_total", double(sim_.frames_dropped() + sim_.frames().size())},
    });
  }

 private:
  // The site's point at the fish's depth, in the ITRS (WGS 84).
  oceanography::water::UpperOcean::Point site_point() const {
    const double a = 6378137.0, f = 1 / 298.257223563, e2 = f * (2 - f), la = lat_ * rl::DEG, lo = lon_ * rl::DEG, h = -depth_;
    const double n = a / std::sqrt(1 - e2 * std::sin(la) * std::sin(la));
    return {(n + h) * std::cos(la) * std::cos(lo), (n + h) * std::cos(la) * std::sin(lo), (n * (1 - e2) + h) * std::sin(la)};
  }
  rs::SimulationConfig config(const Json& c) const {
    rs::SimulationConfig sc;
    sc.method = rs::method_of(c["method"].text("runge_kutta"));
    sc.density = water_.density;
    // the current on the plane's axes: forward along the azimuth, and to the left
    const double A = azimuth_ * rl::DEG;
    sc.current = {water_.east * std::sin(A) + water_.north * std::cos(A), -water_.east * std::cos(A) + water_.north * std::sin(A)};
    return sc;
  }

  std::string body_;
  double lat_, lon_, azimuth_, depth_;
  std::uint64_t seed_;
  oceanography::water::UpperOcean ocean_;
  oceanography::water::WaterAt water_;
  double sea_m_ = 0;
  rs::Simulation sim_;
};

// ---- the dog -----------------------------------------------------------------------------------------------

namespace rq = robotics::quadruped;

inline Json dog_model() {
  const auto d = rq::dog();
  Json links = Json::array();
  for (std::size_t i = 0; i < d.links.size(); i++) {
    const auto& l = d.links[i];
    // the shapes: the torso a box; each leg's links capsules, on its side (left legs at +y, behind as drawn)
    Json shape;
    if (i == 0) shape = Json::object({{"kind", "box"}, {"from_m", vec({-0.20, 0.0})}, {"length_m", 0.40}, {"thickness_m", 0.10}, {"width_m", 0.20}, {"paired", false}, {"y_m", 0.0}});
    else {
      const std::size_t leg = (i - 1) / 2;
      const bool left = leg == rq::LF || leg == rq::LH;
      const bool thigh = (i - 1) % 2 == 0;
      shape = Json::object({{"kind", "capsule"}, {"from_m", vec({0.0, 0.0})}, {"length_m", thigh ? d.thigh : d.shank}, {"thickness_m", thigh ? 0.045 : 0.03},
                            {"width_m", 0.03}, {"paired", false}, {"y_m", left ? d.width / 2 : -d.width / 2}, {"left", left}});
    }
    links.push(Json::object({{"name", l.name}, {"parent", double(l.parent)}, {"joint_m", vec(l.joint)}, {"mass_kg", l.mass}, {"centre_m", vec(l.centre)},
                             {"inertia_kg_m2", l.inertia}, {"armature_kg_m2", l.armature}, {"shape", shape}}));
  }
  Json motors = Json::array();
  for (std::size_t j = 0; j < rq::JOINTS; j++) {
    const auto& m = d.motors[j];
    motors.push(Json::object({{"joint", std::string(rq::LEG_NAMES[j / 2]) + (j % 2 ? " knee" : " hip")}, {"peak_n_m", m.peak}, {"no_load_rad_s", m.no_load},
                              {"torque_constant_n_m_a", m.torque_constant}, {"resistance_ohm", m.resistance}}));
  }
  Json feet = Json::array();
  for (std::size_t l = 0; l < rq::LEGS; l++) feet.push(Json::object({{"name", std::string(rq::LEG_NAMES[l])}, {"link", double(2 + 2 * l)}, {"point_m", vec({d.shank, 0.0})}}));
  return Json::object({{"model", "dog"},
                       {"title", "A dog: a four-legged robot of 10.2 kg"},
                       {"mass_kg", d.mass()},
                       {"links", links},
                       {"motors", motors},
                       {"feet", feet},
                       {"behaviours", Json::array({"stand", "trot", "stop"})},
                       {"methods", Json::array({"variational", "semi_implicit", "runge_kutta"})}});
}

class DogSession : public Robot {
 public:
  DogSession(const Json& c, const Json& sources)
      : lat_(c["lat_deg"].is_number() ? c["lat_deg"].as_number() : 48.86), lon_(c["lon_deg"].is_number() ? c["lon_deg"].as_number() : 2.35),
        azimuth_(c["azimuth_deg"].is_number() ? c["azimuth_deg"].as_number() : 90.0),
        seed_(c["seed"].is_number() ? std::uint64_t(c["seed"].as_number()) : WORLD_SEED), ground_(ground_of(sources, lat_, lon_, azimuth_, seed_)),
        sim_(rq::dog(), config(c, ground_)) {
    if (c["body"].text("earth") != "earth") throw std::invalid_argument("robot: the dog trots on the Earth's ground");
  }

  void advance(double seconds) override { sim_.advance(seconds); }
  double time() const override { return sim_.time(); }

  Json command(const Json& r) override {
    const std::string b = r["behaviour"].text("stand");
    if (b != "stand" && b != "trot" && b != "stop") throw std::invalid_argument("robot.command: the dog's behaviour is stand, trot or stop");
    rq::Command cmd;
    cmd.behaviour = b == "trot" ? rq::Behaviour::trot : b == "stop" ? rq::Behaviour::stop : rq::Behaviour::stand;
    cmd.speed = std::clamp(r["speed_m_s"].is_number() ? r["speed_m_s"].as_number() : 0.0, -0.6, 0.6);
    sim_.command(cmd);
    return state(false);
  }

  Json step(double seconds, std::size_t since, std::size_t since_reading, bool reveal) override {
    sim_.advance(std::clamp(seconds, 0.0, 5.0));
    Json a = state(reveal);
    a.set("frames", frames(since));
    Json rs = Json::array();
    const auto& all = sim_.readings();
    const std::size_t base = sim_.readings_dropped();
    for (std::size_t i = since_reading > base ? since_reading - base : 0; i < all.size(); i++) rs.push(Json::array({all[i].t, all[i].x, double(all[i].parameter), all[i].value}));
    a.set("readings", rs);
    if (since > sim_.frames_dropped()) sim_.trim_frames(since - sim_.frames_dropped());
    return a;
  }

  Json frames(std::size_t since) const override {
    Json out = Json::array();
    const auto& fs = sim_.frames();
    const std::size_t base = sim_.frames_dropped();
    for (std::size_t i = since > base ? since - base : 0; i < fs.size(); i++) {
      const auto& f = fs[i];
      const auto st = sim_.tree().kinematics(f.q);
      Json poses = Json::array(), q = Json::array(), tq = Json::array(), n = Json::array(), stance = Json::array();
      for (const auto& l : st) poses.push(Json::array({l.o[0], l.o[1], l.theta}));
      for (double x : f.q) q.push(x);
      for (double x : f.torque) tq.push(x);
      for (double x : f.normal) n.push(x);
      for (bool b : f.stance) stance.push(b);
      out.push(Json::object({{"i", double(base + i)}, {"t_s", f.t}, {"poses", poses}, {"q", q}, {"torque_n_m", tq}, {"normal_n", n}, {"stance", stance},
                             {"com_m", vec(f.com)}, {"phase", sim_.controller().trotting() ? "trotting" : "standing"}}));
    }
    return out;
  }

  Json state(bool reveal) const override {
    const auto& q = sim_.q();
    const auto& v = sim_.v();
    const auto& ctl = sim_.controller();
    const double m = sim_.dog().mass();
    const auto P = sim_.tree().linear_momentum(q, v);
    Json joints = Json::array();
    for (std::size_t j = 0; j < rq::JOINTS; j++) {
      const auto& mo = sim_.dog().motors[j];
      const double tau = sim_.torque()[j], w = v[3 + j];
      joints.push(Json::object({{"joint", std::string(rq::LEG_NAMES[j / 2]) + (j % 2 ? " knee" : " hip")}, {"torque_n_m", tau}, {"peak_n_m", mo.peak},
                                {"power_w", mo.electrical_power(tau, w)}}));
    }
    Json feet = Json::array();
    const auto cs = sim_.contacts();
    for (std::size_t l = 0; l < rq::LEGS; l++)
      feet.push(Json::object({{"name", std::string(rq::LEG_NAMES[l])}, {"normal_n", cs[l].normal}, {"touching", cs[l].touching}, {"slip_m_s", cs[l].slip},
                              {"penetration_m", cs[l].penetration}, {"stance", ctl.in_stance(l)}}));
    const auto& b = sim_.belief();
    const double x = 0.5 * (cs[rq::RF].place[0] + cs[rq::LF].place[0]);
    const auto fb = b.friction.at(x), lb = b.load.at(x);
    Json ground = Json::object({{"model", ground_.ground ? "the Earth's ground (geophysics ground): its class by CRUST1.0, its presumed law realised with the world's seed" : "rock, the same everywhere (CRUST1.0 is not loaded)"},
                                {"class", ground_.cls},
                                {"presumed", Json::object({{"friction", b.presumption.friction.median}, {"friction_log_sd", b.presumption.friction.log_sd},
                                                           {"load_1mm_n", b.presumption.load.median}, {"load_log_sd", b.presumption.load.log_sd}, {"correlation_m", b.presumption.correlation_m}})},
                                {"belief_here", Json::object({{"x_m", x}, {"friction", fb.median}, {"friction_log_sd", fb.log_sd}, {"load_1mm_n", lb.median}, {"load_log_sd", lb.log_sd}})},
                                {"readings", Json::object({{"friction", double(b.friction.readings())}, {"load", double(b.load.readings())}})},
                                {"whitened_mean_square", Json::object({{"friction", b.friction.whitened_mean_square()}, {"load", b.load.whitened_mean_square()}})}});
    if (reveal) {
      const auto t = sim_.ground_at(x);
      ground.set("truth_here", Json::object({{"friction", t.friction}, {"load_1mm_n", t.stiffness * std::pow(1e-3, t.exponent)}, {"damping_s_m", t.damping}}));
    }
    return Json::object({
        {"model", "dog"},
        {"t_s", sim_.time()},
        {"body", "earth"},
        {"site", Json::object({{"lat_deg", lat_}, {"lon_deg", lon_}, {"azimuth_deg", azimuth_}})},
        {"gravity_m_s2", sim_.config().gravity},
        {"method", std::string(rq::method_name(sim_.config().method))},
        {"step_s", sim_.config().step},
        {"behaviour", std::string(rq::behaviour_name(ctl.current().behaviour))},
        {"speed_asked_m_s", ctl.current().speed},
        {"phase", ctl.trotting() ? "trotting" : "standing"},
        {"pitch_rad", q[rq::PITCH]},
        {"height_m", q[rq::Z]},
        {"velocity_m_s", Json::array({P[0] / m, P[1] / m})},
        {"distance_m", sim_.distance()},
        {"joints", joints},
        {"feet", feet},
        {"ground", ground},
        {"energy", Json::object({{"energy_j", sim_.energy()}, {"residual_j", sim_.energy_residual()}, {"electrical_j", sim_.electrical_energy()},
                                 {"peak_power_w", sim_.peak_power()}, {"cost_of_transport", sim_.cost_of_transport()}})},
        {"checks", Json::object({{"fallbacks", double(sim_.fallbacks())}, {"cost_s_per_s", sim_.cost()}, {"max_penetration_m", sim_.max_penetration()}})},
        {"seed", double(seed_)},
        {"frames_dropped", double(sim_.frames_dropped())},
        {"frames_total", double(sim_.frames_dropped() + sim_.frames().size())},
    });
  }

 private:
  struct Ground {
    std::shared_ptr<const geophysics::ground::EarthGround> ground;
    std::array<double, 3> origin{}, forward{};
    std::string cls = "rock";
    geophysics::ground::GroundLaw law{};
  };
  static Ground ground_of(const Json& sources, double lat_deg, double lon_deg, double azimuth_deg, std::uint64_t seed) {
    namespace gg = geophysics::ground;
    Ground g;
    g.law = gg::law_of(gg::GroundClass::rock);
    const auto crust = crust_of_path(sources["crust1"].text());
    if (!crust) return g;
    g.ground = std::make_shared<const gg::EarthGround>(crust, seed);
    const auto c = g.ground->class_at(lat_deg, lon_deg);
    if (c == gg::GroundClass::sea) throw std::invalid_argument("robot: the dog needs ground: CRUST1.0 has the sea at this place");
    g.cls = gg::class_name(c);
    g.law = gg::law_of(c);
    const double a = 6378137.0, f = 1 / 298.257223563, e2 = f * (2 - f), la = lat_deg * rl::DEG, lo = lon_deg * rl::DEG, az = azimuth_deg * rl::DEG;
    const double n = a / std::sqrt(1 - e2 * std::sin(la) * std::sin(la));
    g.origin = {n * std::cos(la) * std::cos(lo), n * std::cos(la) * std::sin(lo), n * (1 - e2) * std::sin(la)};
    const std::array<double, 3> E{-std::sin(lo), std::cos(lo), 0.0}, N{-std::sin(la) * std::cos(lo), -std::sin(la) * std::sin(lo), std::cos(la)};
    for (int k = 0; k < 3; k++) g.forward[std::size_t(k)] = std::sin(az) * E[std::size_t(k)] + std::cos(az) * N[std::size_t(k)];
    return g;
  }
  static rq::SimulationConfig config(const Json& c, const Ground& g) {
    rq::SimulationConfig sc;
    sc.gravity = geodesy::gravity::LevelEllipsoid::wgs84().somigliana((c["lat_deg"].is_number() ? c["lat_deg"].as_number() : 48.86) * rl::DEG);
    sc.method = rq::method_of(c["method"].text("semi_implicit"));
    sc.presumption.friction = {g.law.friction.median, g.law.friction.log_sd};
    sc.presumption.load = {g.law.load.median, g.law.load.log_sd};
    sc.presumption.exponent = g.law.exponent;
    sc.presumption.correlation_m = geophysics::ground::EarthGround::CORRELATION_M;
    if (g.ground) {
      sc.ground_at = [g](double x) {
        const auto a = g.ground->at({g.origin[0] + x * g.forward[0], g.origin[1] + x * g.forward[1], g.origin[2] + x * g.forward[2]});
        pm::CompliantContact law;
        if (a.cls == geophysics::ground::GroundClass::sea) return rq::rock();  // a shore crossed: the line's ground ends; rock stands for it
        law.stiffness = a.stiffness(), law.exponent = a.exponent, law.damping = a.damping_s_m, law.friction = a.friction, law.slip_speed = 0.03;
        return law;
      };
    }
    return sc;
  }

  double lat_, lon_, azimuth_;
  std::uint64_t seed_;
  Ground ground_;
  rq::Simulation sim_;
};

// A robot from a session's config: the rabbit (the default), the fish or the dog.
inline std::unique_ptr<Robot> make(const Json& config, const Json& sources) {
  const std::string m = config["model"].text("rabbit");
  if (m == "fish") return std::make_unique<FishSession>(config, sources);
  if (m == "dog") return std::make_unique<DogSession>(config, sources);
  if (m != "rabbit") throw std::invalid_argument("robot: the model is the rabbit, the fish or the dog");
  return std::make_unique<Session>(config);
}

// A session run whole: its commands at their times (in order), then to `seconds`; what each command was
// answered (refused or not), and the state at the end.
inline Json run(const Json& r) {
  auto s = make(r["config"], r["sources"]);
  const Json& cs = r["commands"];
  const double end = std::clamp(r["seconds"].is_number() ? r["seconds"].as_number() : 0.0, 0.0, 120.0);
  Json answers = Json::array();
  for (std::size_t i = 0; cs.is_array() && i < cs.size(); i++) {
    const double at = std::clamp(cs[i]["t_s"].is_number() ? cs[i]["t_s"].as_number() : 0.0, 0.0, end);
    if (at > s->time()) s->advance(at - s->time());
    const Json a = s->command(cs[i]);
    answers.push(a["refused"].is_string() ? a["refused"] : Json());
  }
  if (end > s->time()) s->advance(end - s->time());
  Json a = s->state(r["reveal"].is_bool() && r["reveal"].as_bool());
  a.set("refusals", answers);
  return a;
}

}  // namespace cosmopoiesis::robot
