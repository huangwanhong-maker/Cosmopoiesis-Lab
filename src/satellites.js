// Satellites about the Earth: the engine's samples (op "satellites": SGP4 on CelesTrak's element
// sets, carried from TEME to the GCRS by the catalogue), interpolated at the frame rate.
//
// The page asks for a window of samples about its instant, every half minute or so, longer and
// coarser as the clock runs faster, and interpolates each satellite's GCRS position by the cubic
// Hermite polynomial through the samples' positions and velocities (globe.SampledPath), exact to a
// few metres over a minute of a low orbit. A satellite chosen by a click gets its own window, one
// revolution long, drawn as its orbit in the GCRS (about the Earth's centre, the ICRS's axes) and its
// ground track on the Earth.

import { globe } from '../../../visualization/js/index.js';
import { engine } from './api.js';
import { ttText } from './format.js';

const { SampledPath, geodetic, cartesian } = globe;
// The groups' colours: GPS orange and Galileo aqua as the skyplot's (validated, palette.js), the stations and the
// brightest in the console's pinks.
const GROUP_COLOURS = { stations: [0.98, 0.72, 0.86], visual: [0.90, 0.84, 0.95], 'gps-ops': [0.92, 0.41, 0.20], galileo: [0.11, 0.69, 0.48], default: [0.82, 0.70, 0.90] };

export class SatelliteLayer {
  constructor(app) {
    this.app = app;
    this.groups = [];
    this.window = null;
    this.loading = false;
    this.retryAt = 0;
    this.selected = null;   // { norad, orbit window }
    this.error = null;
  }

  setGroups(groups) {
    this.groups = groups;
    this.window = null;
    if (!groups.length) {
      this.app.scene.setPoints('satellites', 'earth:inertial', 0);
      this.select(null);
    }
    this.app.touch();
  }

  // Ask for a window about tt when the present one does not hold it.
  ensure(tt, rate = 1) {
    if (!this.groups.length) return;
    const w = this.window;
    const span = Math.max(1200, Math.abs(rate) * 40), step = Math.max(30, span / 40);
    if (w && tt >= w.t0 + 30 && tt <= w.t1 - Math.min(span / 4, 300 + Math.abs(rate) * 5)) return;
    if (this.loading || performance.now() < this.retryAt) return;
    this.loading = true;
    const start = tt - (rate >= 0 ? span * 0.1 : span * 0.9);
    const request = { op: 'satellites', groups: this.groups, time: ttText(start), window: { span_s: span, step_s: step }, limit: 800,
      ...(this.app.observerPlace?.body === 'earth' ? { observer: this.app.observerPlace } : {}) };
    engine(request).then((a) => {
      this.window = this.build(a, start);
      this.loading = false;
      this.error = null;
      this.app.touch();
    }, (error) => {
      this.loading = false;
      this.error = error.message;
      this.retryAt = performance.now() + 10000;
    });
  }

  build(a, t0) {
    const times = a.window_t_s;
    const sats = [];
    for (const s of a.satellites) {
      if (!s.window) continue;
      const ok = s.window.gcrs_m.map((p, i) => p && s.window.gcrs_m_s[i]);
      if (!ok.every(Boolean)) continue;  // decayed or failing within the window: not drawn
      sats.push({ ...s, path: new SampledPath(times, s.window.gcrs_m, s.window.gcrs_m_s), colour: GROUP_COLOURS[s.group] || GROUP_COLOURS.default });
    }
    return { t0, t1: t0 + times[times.length - 1], satellites: sats, count: a.count };
  }

  // Draw the satellites at tt; returns their GCRS positions for the labels.
  draw(tt) {
    const w = this.window;
    if (!w) return [];
    const n = w.satellites.length;
    const pos = new Float32Array(3 * n), col = new Float32Array(3 * n);
    const out = [];
    w.satellites.forEach((s, i) => {
      const p = s.path.at(tt - w.t0);
      pos.set(p, 3 * i);
      const dim = s.sunlit ? 1 : 0.45;
      col.set(s.colour.map((c) => c * dim), 3 * i);
      out.push({ satellite: s, position: p });
    });
    this.app.scene.setPoints('satellites', 'earth:inertial', n, { positions: pos, colours: col, size: 6 });
    return out;
  }

  // Choose a satellite: its orbit over one revolution, in the GCRS, and its ground track.
  async select(s) {
    this.selected = s;
    if (!s) {
      this.app.scene.setFeature('orbit', null, null);
      this.app.scene.setFeature('track', null, null);
      this.app.showSatellite?.(null);
      return;
    }
    const v = Math.hypot(...s.gcrs.velocity_m_s), r = Math.hypot(...s.gcrs.position_m);
    const a = 1 / (2 / r - (v * v) / 3.986004418e14);  // the osculating semi-major axis (vis-viva)
    const period = 2 * Math.PI * Math.sqrt((a * a * a) / 3.986004418e14);
    const span = Math.min(Math.max(period, 600), 2 * 86400), step = span / 240;
    const tt = this.app.clock.now();
    try {
      const ans = await engine({ op: 'satellites', groups: [s.group], time: ttText(tt), window: { span_s: span, step_s: step }, limit: 2000,
        ...(this.app.observerPlace?.body === 'earth' ? { observer: this.app.observerPlace } : {}) });
      const me = ans.satellites.find((x) => x.norad === s.norad);
      if (!me || !me.window) return;
      this.app.scene.setFeature('orbit', 'earth:inertial', me.window.gcrs_m.filter(Boolean), { kind: 'path', colour: 0xf0a8cc, opacity: 0.85, depthTest: true });
      // The sub-satellite points: the geodetic foot of each sample on WGS 84.
      const fig = this.app.scene.bodies.earth.fig;
      this.app.scene.setFeature('track', 'earth', me.window.itrs_m.filter(Boolean).map((p) => {
        const g = geodetic(fig, ...p);
        return cartesian(fig, g.lon, g.lat, 3000);  // lifted above most ground, hidden behind the globe
      }), { kind: 'path', colour: 0xc8a0e8, opacity: 0.75, depthTest: true });
      this.app.showSatellite?.({ ...me, period_s: period });
    } catch (error) {
      this.app.showSatellite?.({ ...s, error: error.message });
    }
  }
}
