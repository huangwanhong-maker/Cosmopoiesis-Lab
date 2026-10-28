// The spacetime of a world (formalism §§1–2, §10): its time scales, its frames from the
// barycentre to a place on the ground, and the bodies that carry them.
//
// Cosmopoiesis composes it from the infrastructure and writes none of it: the time scales,
// leap seconds and Earth orientation are metrology's, the ephemerides and the Moon's frames
// astronomy's, the figure of the Earth geodesy's, the catalogue of frames the navigation bridge's,
// and the frame graph with its holonomy physis's. What is here is the binding: which kernels and
// series a world reads (paths given by the request, nothing else is read), and the answers the page
// needs, in SI units and named frames and scales.

#pragma once

#include <cmath>
#include <fstream>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <navigation/frames/catalogue.hpp>
#include <metrology/frames/iau2006.hpp>
#include <metrology/time/datetime.hpp>
#include <metrology/time/scales.hpp>
#include <physis/geometry/rotation.hpp>

namespace cosmopoiesis {

namespace mt = metrology::time;
namespace eo = metrology::earth_orientation;
using navigation::frames::Catalogue;
using physis::geometry::Mat3;
using physis::geometry::StateTransform;
using physis::geometry::Vec3;
using namespace physis::geometry::operators;

inline std::string read_text(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) throw std::invalid_argument("cannot read " + path);
  std::stringstream b;
  b << in.rdbuf();
  return b.str();
}

// What a world reads: the paths of its kernels and series.
struct Sources {
  std::string ephemeris;      // SPK, e.g. de440s.bsp (required)
  std::string moon_pck;       // binary PCK of the Moon's principal axes (optional)
  std::string eop;            // IERS finals2000A (optional; UT1 then approximated)
  std::string leap_seconds;   // IANA leap-seconds.list (optional; the built-in table then)
  std::string geoid;          // EGM96's 15' grid as GeographicLib's PGM (optional; no heights above sea level then)
};

class Spacetime {
 public:
  explicit Spacetime(const Sources& s) : sources_(s) {
    navigation::frames::Kernels k;
    k.spk = std::make_shared<const astronomy::ephemerides::Spk>(astronomy::ephemerides::Spk::read(s.ephemeris));
    if (!s.moon_pck.empty()) k.moon_pck = std::make_shared<const astronomy::ephemerides::Pck>(astronomy::ephemerides::Pck::read(s.moon_pck));
    if (!s.eop.empty()) eop_ = std::make_unique<eo::Series>(eo::Series::parse_finals2000a(read_text(s.eop), "IERS finals2000A"));
    mt::LeapSeconds leap = s.leap_seconds.empty() ? mt::LeapSeconds::built_in() : mt::LeapSeconds::parse_iana(read_text(s.leap_seconds));
    scales_ = std::make_unique<mt::TimeScales>(std::move(leap), eop_.get(), mt::Ut1Policy::approximate);
    catalogue_ = std::make_unique<Catalogue>(k);
  }

  const mt::TimeScales& scales() const { return *scales_; }
  const Catalogue& catalogue() const { return *catalogue_; }
  Catalogue& catalogue() { return *catalogue_; }
  const eo::Series* earth_orientation() const { return eop_.get(); }
  const Sources& sources() const { return sources_; }

  // An instant from text (ISO 8601 with its scale, "JD …", "MJD …") or "now" (given as UTC by the
  // caller's clock in Unix seconds).
  mt::Instant instant(const std::string& text) const {
    const auto [jd, scale] = mt::parse_time(text, *scales_);
    return scales_->instant(jd, scale);
  }
  mt::Instant instant(const mt::JulianDate& jd, mt::Scale scale) const { return scales_->instant(jd, scale); }
  mt::Instant instant_unix(double unix_seconds) const {
    const double days = unix_seconds / mt::DAY;
    const double whole = std::floor(days);
    return scales_->instant({2440587.5 + whole, days - whole}, mt::Scale::UTC);
  }
  // The same instant moved by seconds of TT (the page's clock runs in TT).
  mt::Instant later(const mt::Instant& t, double seconds) const { return scales_->instant(t.tt.plus_seconds(seconds), mt::Scale::TT); }

  StateTransform transform(const std::string& from, const std::string& to, const mt::Instant& t) const {
    return catalogue_->graph().transform(from, to, t);
  }

 private:
  Sources sources_;
  std::unique_ptr<eo::Series> eop_;
  std::unique_ptr<mt::TimeScales> scales_;
  std::unique_ptr<Catalogue> catalogue_;
};

// A rotation matrix as a unit quaternion (w, x, y, z), the active rotation it performs.
inline std::array<double, 4> quaternion(const Mat3& r) {
  const auto q = physis::geometry::Rotation::from_matrix(physis::geometry::orthonormalised(r), 1e-6);
  return {q.w(), q.x(), q.y(), q.z()};
}

}  // namespace cosmopoiesis
