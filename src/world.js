// The bodies of the one world about the clock's instant: windows of the engine's samples ({op:
// "bodies"}), interpolated.
//
// Every body of DE440 (the Sun, the planets or their systems' barycentres beyond Mars, the Moon) is
// placed in the ICRS, the barycentre's frame, and turned from its fixed frame (the ITRS, the Moon's
// mean-Earth frame, the IAU frames of the others) to the ICRS's axes. The engine samples a window;
// the page interpolates positions by cubic Hermite polynomials on the positions and velocities and
// orientations by spherical interpolation, the Earth's daily turn factored out so that the
// interpolation carries only its slow precession and nutation (the shared layer's motion.js). The
// window is asked for before it runs out, longer and coarser as the clock runs faster, so that it
// lasts some tens of seconds of the wall whatever the rate. The engine computes; the page draws.

import { globe } from '../../../visualization/js/index.js';
import { engine } from './api.js';
import { ttFromJd, ttText } from './format.js';

const { SampledRotation, SampledPath, EARTH_SPIN, quatToMatrix } = globe;

const MIN_SPAN = 2 * 86400;
const SAMPLES = 300;

export class WorldMotion {
  constructor({ onWindow = () => {}, onError = () => {} } = {}) {
    this.window = null;
    this.loading = null;
    this.info = new Map();   // key → { name, radius, equatorialRadius, fixedFrame, inertialFrame, gm }
    Object.assign(this, { onWindow, onError });
  }

  ensure(tt, rate = 1) {
    const w = this.window;
    const span = Math.max(MIN_SPAN, Math.abs(rate) * 60);
    const margin = Math.min(span / 6, 6 * 3600 + Math.abs(rate) * 10);
    if (w && tt >= w.t0 + margin && tt <= w.t1 - margin) return;
    if (this.loading || (this.retryAt && performance.now() < this.retryAt)) return;
    const start = tt - (rate >= 0 ? span / 4 : (3 * span) / 4);
    const step = Math.max(60, span / SAMPLES);
    this.loading = engine({ op: 'bodies', start: ttText(start), span, step }).then((a) => {
      this.window = this.build(a);
      this.loading = null;
      this.retryAt = 0;
      this.onWindow(this.window);
    }, (error) => {
      this.loading = null;
      this.onError(error);
      this.retryAt = performance.now() + 5000;
    });
  }

  build(a) {
    const t0 = ttFromJd(a.start.scales.TT.jd);
    const times = a.t;
    const bodies = new Map();
    for (const b of a.bodies) {
      this.info.set(b.key, { key: b.key, name: b.name, radius: b.radius_m, equatorialRadius: b.equatorial_radius_m, gm: b.gm_m3_s2,
        fixedFrame: b.fixed_frame, inertialFrame: b.inertial_frame, figure: b.figure });
      bodies.set(b.key, {
        path: new SampledPath(times, b.position, b.velocity),
        turn: new SampledRotation(times, b.rotation, b.key === 'earth' ? { spin: EARTH_SPIN } : {}),
      });
    }
    return { t0, t1: t0 + times[times.length - 1], step: a.step, start: a.start, bodies };
  }

  // Every body at tt: { key: { position (ICRS, m), rotation (fixed → ICRS), quaternion } }, or null.
  at(tt) {
    const w = this.window;
    if (!w) return null;
    const t = tt - w.t0;
    const out = { inside: t >= 0 && t <= w.t1 - w.t0 };
    for (const [key, b] of w.bodies) {
      const q = b.turn.at(t);
      out[key] = { position: b.path.at(t), rotation: quatToMatrix(q), quaternion: q };
    }
    return out;
  }
}
