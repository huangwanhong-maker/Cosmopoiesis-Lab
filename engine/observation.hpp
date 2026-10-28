// Observation: instruments, where they are, when they can read, and what a reading is (formalism
// §8.2 and §8.5; decision 0004).
//
// An instrument family is an observation operator of one of a few kernels (a point probe of a field,
// a line of sight, a clock, ranging to emitters, an event detector, an external feed, …) bound to a
// model of the world; a sensor is a family mounted somewhere (an address, the observer, a
// satellite) with a timing (a period of the world's clock or of the wall's, a deadline, a declared
// cost, a criticality). A sensor has a coverage, the part of spacetime where it can give a reading:
// its model's validity, its data's span, the bodies it stands on, the heights it works at, and, for a
// physical instrument, the present alone. Asked outside it, it answers why it cannot, never a value.
//
// Every reading names its provenance (§9's channels): physical (an instrument of the world, read
// now), archive (a measurement recorded), model (computed from a model), assimilated (an estimate
// joining observations and a model), synthetic (made up, with the right statistics). The page
// colours them apart, so that a simulated value is never mistaken for a measured one.
//
// Each kernel is an abstract class (PointProbe, Footprint, LineOfSight, Ranging, Counter,
// EventDetector, Proprioceptive, ClockReading, Protocol, QuantumMeasurement, Estimator, Feed), from
// which an implemented family derives: the kernel supplies the measurement's support (a point, a
// column, a cone, the paths to emitters …) and its identity, the family its model. A family that is
// only declared (declared.hpp: the encyclopedia's, bound to its kernel) has no class of its own.
//
// All instruments measuring at one instant read one Snapshot of the world at it, which computes
// what they share once (the Sun's place, a constellation's states) and never changes: their
// readings depend on the instant, the mount and the noise's key alone, never on the order in which
// the runtime runs them or on the number of threads (formalism Proposition 8.6).

#pragma once

#include <cmath>
#include <cstdint>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include <calx/random/stream.hpp>
#include <geodesy/figure/ellipsoid.hpp>
#include <navigation/frames/address.hpp>
#include <science/json.hpp>

#include "spacetime.hpp"

namespace cosmopoiesis {

using science::Json;

// ---- provenance and kernels ----------------------------------------------------------------------

enum class Provenance { physical, archive, model, assimilated, synthetic };

inline const char* name(Provenance p) {
  switch (p) {
    case Provenance::physical: return "physical";
    case Provenance::archive: return "archive";
    case Provenance::model: return "model";
    case Provenance::assimilated: return "assimilated";
    case Provenance::synthetic: return "synthetic";
  }
  return "?";
}

enum class Kernel { point_probe, footprint, line_of_sight, ranging, counter, event_detector, proprioceptive, clock, protocol, quantum, estimator, feed };

struct KernelInfo {
  Kernel kernel;
  const char* key;
  const char* title;
  const char* operator_form;  // the observation operator, in the formalism's notation
  const char* examples;
};

// The kernels of observation operators (formalism §8.5, Table 8.1).
inline const std::vector<KernelInfo>& kernels() {
  static const std::vector<KernelInfo> k = {
      {Kernel::point_probe, "point-probe", "Point probe", "y = φ(x(t)) + ε", "thermometer, barometer, magnetometer, gravimeter, a numerical probe"},
      {Kernel::footprint, "footprint", "Footprint integral", "y = ∫_D w φ dμ + ε", "a pixel's footprint, a sampler's volume, a CTD's cell"},
      {Kernel::line_of_sight, "line-of-sight", "Line of sight", "y = ∫ along rays of the radiance into the aperture", "sun sensor, star tracker, camera, radiometer, spectrometer, telescope"},
      {Kernel::ranging, "ranging", "Ranging", "y = |x − x_e| + c δt + delays + ε", "GNSS, laser and radio ranging, radar, lidar, sonar, Doppler"},
      {Kernel::counter, "counter", "Counter", "N ~ Poisson(∫ A ε Φ dt)", "Geiger counter, photon counter, particle detector, rain gauge"},
      {Kernel::event_detector, "event-detector", "Event detector", "an event when a guard g(state) = 0 is crossed", "threshold alarm, impact switch, seismic trigger"},
      {Kernel::proprioceptive, "proprioceptive", "Proprioceptive", "y = h(q, q̇, a) of the agent's own state", "IMU, encoders, the true position (an ideal probe)"},
      {Kernel::clock, "clock", "Clock", "c(t) = t + b + d (t − t₀) + ε", "atomic clocks, a host's clock against NTP, time scales"},
      {Kernel::protocol, "protocol", "Protocol", "a hybrid automaton of stages with latencies, ending in a result", "mass spectrometer, sequencer, a laboratory analysis"},
      {Kernel::quantum, "quantum", "Quantum measurement", "P(y) = tr(ρ M_y) for a POVM M", "qubit readout, photon counting statistics, state tomography"},
      {Kernel::estimator, "estimator", "Estimator", "ŷ = an estimate from other readings and a model", "a Kalman filter, a fused navigation solution, an analysis"},
      {Kernel::feed, "feed", "External feed", "readings delivered by another system; only timing and coverage modelled", "space-weather services, seismic catalogues, a station's logger"},
  };
  return k;
}
inline const KernelInfo& kernel_info(Kernel k) {
  for (const auto& x : kernels())
    if (x.kernel == k) return x;
  throw std::logic_error("unknown kernel");
}

// ---- what an instrument is -----------------------------------------------------------------------

struct QuantityInfo {
  std::string name, unit, about;
};

struct InstrumentInfo {
  std::string family;     // the registry's key, as "magnetometer.wmm2025"
  std::string title;      // "Magnetometer (WMM2025)"
  std::string catalogue;  // the encyclopedia's family code (docs/instruments.md), as "C01"
  Kernel kernel = Kernel::point_probe;
  Provenance provenance = Provenance::model;
  std::vector<QuantityInfo> quantities;
  double cost_s = 1e-4;     // declared execution time, s of the wall
  double period_s = 1;      // a default period, s of the world's clock
  std::string model;        // what computes it
  std::string about;
  std::string references;
  std::string frame = "";   // the frame of its vector values ("local north, east, down at the mount", "GCRS")
  std::string interaction = "passive";  // passive, active (it emits), contact or destructive (it takes a sample)
};

// ---- where and when ---------------------------------------------------------------------------------

// Where a sensor is at an instant, resolved by the session from its mount.
struct MountState {
  std::string address;                   // the mount's address, canonical
  std::string body;                      // the body it stands on, or is near (a satellite's Earth), or ""
  bool on_body = false;                  // a position on the body (else in space)
  geodesy::figure::Geodetic geodetic{};  // on the body's figure
  Vec3 fixed{0, 0, 0};                   // in the body's fixed frame, m
  std::string fixed_frame;
  Vec3 gcrs{0, 0, 0}, icrs{0, 0, 0};     // m
  Json settings = Json::object();        // the sensor's own settings (its family's, as SensorSpec gives them)
};

struct Availability {
  bool ok = true;
  std::string reason;
};

// The part of spacetime where a sensor can read.
struct Coverage {
  double tt_from = -std::numeric_limits<double>::infinity();  // s of TT from J2000.0
  double tt_to = std::numeric_limits<double>::infinity();
  std::vector<std::string> bodies;  // the mount on or near one of these (empty: anywhere)
  double height_min = -std::numeric_limits<double>::infinity();  // above the body's figure, m
  double height_max = std::numeric_limits<double>::infinity();
  bool present_only = false;        // a physical instrument: the world's instant within `window_s` of now
  double window_s = 0;
  std::string about;

  Availability check(const MountState& m, double tt, double now_tt) const {
    if (tt < tt_from - 1e-9 || tt > tt_to + 1e-9) return {false, "outside the span of " + (about.empty() ? std::string("its model") : about)};
    if (present_only && std::fabs(tt - now_tt) > window_s) return {false, "a physical instrument reads the present, not the world's instant"};
    if (!bodies.empty()) {
      bool any = false;
      for (const auto& b : bodies) any = any || b == m.body;
      if (!any) {
        std::string list;
        for (const auto& b : bodies) list += (list.empty() ? "" : ", ") + b;
        return {false, "it works on or near " + list + ", not " + (m.body.empty() ? std::string("in open space") : m.body)};
      }
      if (m.geodetic.height < height_min - 1e-6 || m.geodetic.height > height_max + 1e-6)
        return {false, "its model covers heights from " + std::to_string(int(height_min)) + " m to " + std::to_string(int(height_max)) + " m"};
    }
    return {};
  }
  Json json() const {
    Json j = Json::object({{"about", about}});
    if (std::isfinite(tt_from)) j.set("tt_from_s", tt_from);
    if (std::isfinite(tt_to)) j.set("tt_to_s", tt_to);
    Json b = Json::array();
    for (const auto& x : bodies) b.push(x);
    j.set("bodies", b);
    if (std::isfinite(height_min)) j.set("height_min_m", height_min);
    if (std::isfinite(height_max)) j.set("height_max_m", height_max);
    j.set("present_only", present_only);
    return j;
  }
};

// ---- the snapshot of the world at an instant --------------------------------------------------------

class World;

class Snapshot {
 public:
  Snapshot(const World& w, const mt::Instant& t, double tt) : world_(w), t_(t), tt_(tt) {}
  const World& world() const { return world_; }
  const mt::Instant& instant() const { return t_; }
  double tt() const { return tt_; }  // s of TT from J2000.0

  // A value computed once per snapshot and shared by every instrument reading at it.
  template <class T>
  const T& shared(const std::string& key, const std::function<T()>& make) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = cache_.find(key);
    if (it == cache_.end()) it = cache_.emplace(key, std::make_shared<Holder<T>>(make())).first;
    return static_cast<const Holder<T>&>(*it->second).value;
  }

 private:
  struct Base { virtual ~Base() = default; };
  template <class T>
  struct Holder : Base { explicit Holder(T v) : value(std::move(v)) {} T value; };
  const World& world_;
  mt::Instant t_;
  double tt_;
  mutable std::mutex mutex_;
  mutable std::map<std::string, std::shared_ptr<Base>> cache_;
};

// ---- noise --------------------------------------------------------------------------------------------

// Noise from calx's counter-based stream, keyed by the sensor and the tick: the same world, sensor,
// tick and seed give the same draw on any machine and any number of threads.
class Noise {
 public:
  Noise(std::uint64_t seed, std::uint32_t sensor, std::uint32_t tick, std::uint32_t purpose = 0) : s_(seed, sensor, tick, purpose) {}
  double normal(double sigma = 1) { return sigma * s_.normal(); }
  double uniform() { return s_.uniform(); }
 private:
  calx::random::Stream s_;
};

// A sensor's key for the noise: FNV-1a of its identifier.
inline std::uint32_t key_of(std::string_view s) {
  std::uint32_t h = 2166136261u;
  for (unsigned char c : s) { h ^= c; h *= 16777619u; }
  return h;
}

// ---- the interface of an instrument -------------------------------------------------------------------

// Why a reading has no value, in the observation envelope's terms: the quantity is not defined
// there by the instrument's model (outside its coverage), the data it needs are missing, or it was
// computed and is not to be trusted (invalid: a compass in a blackout zone).
enum class Quality { valid, outside, missing, invalid };

inline const char* name(Quality q) {
  switch (q) {
    case Quality::valid: return "valid";
    case Quality::outside: return "outside";
    case Quality::missing: return "missing";
    case Quality::invalid: return "invalid";
  }
  return "?";
}

class Unavailable : public std::runtime_error {
 public:
  explicit Unavailable(const std::string& why, Quality q = Quality::outside) : std::runtime_error(why), quality_(q) {}
  Quality quality() const { return quality_; }
 private:
  Quality quality_;
};

class Instrument {
 public:
  virtual ~Instrument() = default;
  virtual const InstrumentInfo& info() const = 0;
  // Its kernel, which the kernel class gives; the registry holds it equal to info().kernel.
  virtual Kernel kernel() const = 0;
  // Where and when it can read, given what the world has loaded.
  virtual Coverage coverage(const World& w) const = 0;
  // The measurement's support in space and time (the envelope's): what the reading integrates over.
  virtual Json support(const MountState& m) const = 0;
  // Its values at the snapshot from the mount, by quantity name (numbers, or arrays for vectors and
  // profiles); Unavailable when it cannot read there (with the reason and the quality).
  virtual Json measure(const Snapshot& s, const MountState& m, Noise& noise) const = 0;
};

// ---- the kernels as classes ---------------------------------------------------------------------------
//
// A family derives from the class of its kernel and gives its model in measure(); the kernel gives
// the support. Kernels with no implemented family yet (counter, event detector, protocol, quantum
// measurement, estimator, feed) are here so that one can be written against them; declared.hpp
// names the families that wait for them.

namespace kernel_detail {
inline Json at_mount(const char* kind, const MountState& m, Json extra = Json::object()) {
  extra.set("kind", kind);
  extra.set("at", m.address);
  return extra;
}
}  // namespace kernel_detail

// y = φ(x(t)) + ε: a field's value at the mount.
class PointProbe : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::point_probe; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("point", m); }
};
// y = ∫_D w φ dμ + ε: a field integrated over a region about the mount (a column, a pixel's footprint).
class Footprint : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::footprint; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("region", m); }
};
// The radiance into an aperture from a cone of directions.
class LineOfSight : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::line_of_sight; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("cone", m); }
};
// Ranges and delays along paths between the mount and emitters.
class Ranging : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::ranging; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("paths", m); }
};
// N ~ Poisson(∫ A ε Φ dt): a counting measure over a window.
class Counter : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::counter; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("window", m); }
};
// An event when a guard g(state) = 0 is crossed.
class EventDetector : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::event_detector; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("guard", m); }
};
// y = h(q, q̇, a) of the agent's own state.
class Proprioceptive : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::proprioceptive; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("own state", m); }
};
// c(t) = t + b + d (t − t₀) + ε: a clock's reading.
class ClockReading : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::clock; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("instant", m); }
};
// A hybrid automaton of stages (sample, prepare, measure) with latencies, ending in a result.
class Protocol : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::protocol; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("sample", m); }
};
// P(y) = tr(ρ M_y): an outcome drawn by the Born rule.
class QuantumMeasurement : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::quantum; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("state", m); }
};
// ŷ from other readings and a model: its readings are assimilated whatever its inputs were.
class Estimator : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::estimator; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("readings", m); }
};
// Readings delivered by another system; only their timing and coverage are modelled (the server's).
class Feed : public Instrument {
 public:
  Kernel kernel() const final { return Kernel::feed; }
  Json support(const MountState& m) const override { return kernel_detail::at_mount("delivered", m); }
};

}  // namespace cosmopoiesis
