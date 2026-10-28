// The camera of the one world.
//
// One body is in focus at a time, and the shared layer's GlobeControls hold the camera in that body's
// fixed frame (a target on the body, a range, a heading and a tilt), so that its ground stays still
// under the camera while it turns. Each body keeps its own view. Going to another body is a flight
// (globe.transferCamera): the camera carried relative to the target's centre, which moves with the
// instant, its distance interpolated in its logarithm and raised in mid-flight to see both bodies,
// its view turned to look at the target; at the end the target is in focus with the view asked for.
// The Sun in focus, with a range of hundreds of astronomical units, is the view of the whole system.
// When the camera stays with the stars, it is carried by the focus body's turning back to where it
// was in the ICRS.

import { globe } from '../../../visualization/js/index.js';
import { AU } from './format.js';

const { GlobeControls, cameraOf, cartesian, geodetic, localFrame, apply, applyTransposed, transferCamera, ease } = globe;
const DEG = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

// How far the camera may stand from a body in focus: the Earth to beyond the Moon's orbit, the Sun to
// beyond Neptune's, the others to two hundred radii.
export function maxRangeOf(key, fig) {
  if (key === 'sun') return 400 * AU;
  if (key === 'earth') return 2.5e9;
  return Math.max(60 * fig.a, 200 * fig.a);
}

export const DEFAULT_VIEWS = {
  earth: { lon: 12 * DEG, lat: 30 * DEG, height: 0, range: 2.0e7, heading: 0, tilt: 0 },
  moon: { lon: 0, lat: 0, height: 0, range: 6.0e6, heading: 0, tilt: 0 },
  sun: { lon: 0, lat: 0, height: 0, range: 110 * AU, heading: 0, tilt: 55 * DEG },
};

export class Navigator {
  constructor(canvas, scene, { onChange = () => {}, heightAt = () => 0 } = {}) {
    this.scene = scene;
    this.focus = 'earth';
    this.follow = 'ground';
    this.views = { ...DEFAULT_VIEWS };
    this.transfer = null;
    this.prevRotation = null;
    this.onChange = onChange;
    const fig = scene.bodies.earth.fig;
    this.controls = new GlobeControls(canvas, {
      fig,
      rayAt: (x, y) => scene.rayAt(this.controls.camera(), x, y),
      heightAt: (lon, lat) => (scene.bodies[this.focus]?.terrain ? scene.bodies[this.focus].tree.heightAt(lon, lat) : 0),
      onChange,
    });
    this.controls.setFigure(fig, { maxRange: maxRangeOf('earth', fig) });
    this.controls.view = { ...this.views.earth };
  }

  viewOf(key) {
    if (!this.views[key]) {
      const r = this.scene.bodies[key].fig.a;
      this.views[key] = { lon: 0, lat: 10 * DEG, height: 0, range: 4 * r, heading: 0, tilt: 0 };
    }
    return this.views[key];
  }

  setFocus(key, view = null) {
    if (!this.scene.bodies[key]) return;
    this.views[this.focus] = { ...this.controls.view };
    this.focus = key;
    const fig = this.scene.bodies[key].fig;
    this.controls.setFigure(fig, { maxRange: maxRangeOf(key, fig) });
    this.controls.flight = null;
    this.controls.view = { ...this.viewOf(key), ...(view || {}) };
    this.controls.limit();
    this.prevRotation = null;
    this.onChange();
  }

  // The camera in the ICRS from a view of a body, given the body's state.
  cameraFrom(key, view, B) {
    const c = cameraOf(this.scene.bodies[key].fig, view);
    return { position: add(B.position, apply(B.rotation, c.position)), forward: apply(B.rotation, c.forward), up: apply(B.rotation, c.up) };
  }

  // Go to a body: a flight from the present camera, or at once when `seconds` is 0. `view` is in the
  // target's fixed frame (lon, lat in radians, height, range, heading, tilt).
  flyToBody(key, view = null, bodies, seconds = 4) {
    if (!this.scene.bodies[key]) return;
    const target = { ...this.viewOf(key), ...(view || {}) };
    if (key === this.focus || !bodies || !seconds) {
      if (key === this.focus) this.controls.flyTo(target, 2.4); else this.setFocus(key, target);
      return;
    }
    const cam = this.camera(bodies);
    const C = bodies[key].position;
    this.transfer = {
      key, view: target, start: performance.now(), seconds,
      from: { position: sub(cam.position, C), forward: cam.forward, up: cam.up },
      span: norm(sub(bodies[this.focus].position, C)),
    };
    this.onChange();
  }

  // Advance a flight or a globe's flight; returns whether one is under way.
  tick(now, bodies) {
    if (this.transfer) {
      const t = (now - this.transfer.start) / (this.transfer.seconds * 1000);
      if (t >= 1) {
        const { key, view } = this.transfer;
        this.transfer = null;
        this.setFocus(key, view);
      }
      return true;
    }
    if (this.follow === 'stars' && bodies && !this.controls.flight) this.followStars(bodies[this.focus].rotation);
    if (bodies) this.prevRotation = bodies[this.focus].rotation;
    return this.controls.tick(now);
  }

  // The camera now, in the ICRS: { position, forward, up, focusCamera (in the focus body's frame) }.
  camera(bodies) {
    const B = bodies[this.focus];
    if (this.transfer) {
      const tr = this.transfer;
      const s = ease(Math.min(1, (performance.now() - tr.start) / (tr.seconds * 1000)));
      const Bt = bodies[tr.key];
      const end = this.cameraFrom(tr.key, tr.view, Bt);
      const to = { position: sub(end.position, Bt.position), forward: end.forward, up: end.up };
      const peak = Math.max(norm(tr.from.position), norm(to.position), 0.7 * tr.span);
      const c = transferCamera(tr.from, to, peak, s);
      const position = add(Bt.position, c.position);
      return { position, forward: c.forward, up: c.up, focusCamera: null, transfer: true };
    }
    const local = this.controls.camera();
    return {
      position: add(B.position, apply(B.rotation, local.position)), forward: apply(B.rotation, local.forward), up: apply(B.rotation, local.up),
      focusCamera: local, transfer: false,
    };
  }

  // The camera's height above the nearest body's ground (m), for the near plane and the readouts.
  altitude(cam, bodies) {
    let best = Infinity;
    for (const [key, b] of Object.entries(this.scene.bodies)) {
      const B = bodies[key];
      if (!B) continue;
      const local = applyTransposed(B.rotation, sub(cam.position, B.position));
      if (norm(local) > 50 * b.fig.a) continue;
      const g = geodetic(b.fig, ...local);
      const ground = b.terrain ? b.tree.heightAt(g.lon, g.lat) : 0;
      best = Math.min(best, g.h - ground);
    }
    return Number.isFinite(best) ? best : norm(sub(cam.position, bodies.sun?.position || [0, 0, 0])) - 6.957e8;
  }

  // Carry the camera with the focus body's turning back to where it was in the ICRS.
  followStars(now) {
    const prev = this.prevRotation;
    if (!prev) return;
    const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => now[0][i] * prev[0][j] + now[1][i] * prev[1][j] + now[2][i] * prev[2][j]));
    const v = this.controls.view, fig = this.scene.bodies[this.focus].fig;
    const t = apply(M, cartesian(fig, v.lon, v.lat, v.height));
    const g = geodetic(fig, ...t);
    const north = apply(M, localFrame(v.lon, v.lat)[1]);
    const [E2, N2] = localFrame(g.lon, g.lat);
    const twist = Math.atan2(north[0] * E2[0] + north[1] * E2[1] + north[2] * E2[2], north[0] * N2[0] + north[1] * N2[1] + north[2] * N2[2]);
    v.lon = g.lon;
    v.lat = g.lat;
    v.heading -= twist;
  }
}
