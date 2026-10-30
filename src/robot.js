// The robot's arithmetic for the page (decision 0011): what the ROBOT page and the world draw from the
// engine's answers (engine/robot.hpp), without the DOM, so that it can be checked.
//
// The robot moves in its plane: x forward along the azimuth chosen, z up along the body's normal at the
// site, the plane's origin on the ground at the site. Each frame gives every link's pose (o_x, o_z, θ): its
// joint's place in the plane and the angle of its frame, θ turning x toward z (the robotics domain's planar
// tree, physis multibody.hpp). A point p of a link is o + R(θ) p.
//
// In the world the plane is placed by its axes in the body's fixed frame: F forward (the azimuth's
// direction in the local east and north), U up (the normal), and L = U × F to the robot's left, so that
// (F, L, U) is right-handed and a link's lateral width lies along L.

import { globe } from '../../../visualization/js/index.js';

export const DEG = Math.PI / 180;

// Sites (USGS Gazetteer of Planetary Nomenclature; Apollo 16's landing site), as the rover's page names them,
// and the point chosen. The body follows the site.
export const SITES = [['reiner', 'Reiner Gamma', 'moon', 7.5, -59.0], ['apollo16', 'Apollo 16, Descartes', 'moon', -8.973, 15.5]];
export const HEADINGS = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']];

// A point p of a link at pose (o_x, o_z, θ), in the plane.
export function onLink(pose, p) {
  const c = Math.cos(pose[2]), s = Math.sin(pose[2]);
  return [pose[0] + c * p[0] - s * p[1], pose[1] + s * p[0] + c * p[1]];
}

// What to draw of a link (its shape, the catalogue's): a capsule's axis and radius, or a box's corners.
export function linkOutline(link, pose) {
  const sh = link.shape;
  if (sh.kind === 'box') {
    const [x0, z0] = sh.from_m, h = sh.thickness_m / 2, L = sh.length_m;
    return { kind: 'box', corners: [[x0, z0 - h], [x0 + L, z0 - h], [x0 + L, z0 + h], [x0, z0 + h]].map((p) => onLink(pose, p)) };
  }
  const a = sh.from_m, b = [a[0] + sh.length_m, a[1]];
  return { kind: 'capsule', a: onLink(pose, a), b: onLink(pose, b), r: sh.thickness_m / 2 };
}

// The angle from a to b the short way round.
const turn = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a));

// A frame between frames a and b, s of the way (0…1): positions and the centre linearly, angles the short
// way round; what is not continuous (the phase, the forces) is a's until halfway, then b's.
export function between(a, b, s) {
  if (!b || s <= 0) return a;
  if (s >= 1) return b;
  const lerp = (x, y) => x + (y - x) * s;
  const near = s < 0.5 ? a : b;
  return {
    ...near,
    t_s: lerp(a.t_s, b.t_s),
    poses: a.poses.map((p, i) => [lerp(p[0], b.poses[i][0]), lerp(p[1], b.poses[i][1]), lerp(p[2], turn(p[2], b.poses[i][2]))]),
    com_m: [lerp(a.com_m[0], b.com_m[0]), lerp(a.com_m[1], b.com_m[1])],
    q: a.q.map((x, i) => lerp(x, b.q[i])),
  };
}

// The frames as the page plays them: gathered from the engine's increments (each answer the frames after the
// index the page had), played by the robot's time a little behind the newest, so that the motion is smooth
// while the engine is asked for more; a gap (the engine busy, the page hidden) is crossed by a jump.
export class Playback {
  constructor({ lag = 0.35, keep = 12 } = {}) {
    Object.assign(this, { lag, keep });
    this.clear();
  }
  clear() { this.frames = []; this.t = null; this.next = 0; }
  // The index of the next frame the engine should send.
  get since() { return this.next; }
  add(frames) {
    for (const f of frames || []) {
      if (f.i < this.next) continue;
      this.frames.push(f);
      this.next = f.i + 1;
    }
    // Keep `keep` seconds: what the trail and the charts show.
    const newest = this.newest;
    if (newest) while (this.frames.length > 2 && this.frames[0].t_s < newest.t_s - this.keep) this.frames.shift();
  }
  get newest() { return this.frames[this.frames.length - 1] || null; }
  // Advance the play time by dt of the wall at a rate; the frame then. The play time stays within the frames,
  // at most `lag` behind the newest in steady motion and never ahead of it.
  advance(dt, rate = 1) {
    const newest = this.newest;
    if (!newest) return null;
    const first = this.frames[0].t_s;
    if (this.t === null || this.t < first || newest.t_s - this.t > this.lag + 1.5) this.t = Math.max(first, newest.t_s - this.lag);
    else this.t = Math.min(newest.t_s, this.t + dt * rate);
    return this.at(this.t);
  }
  // The frame at the robot's time t, interpolated.
  at(t) {
    const fs = this.frames;
    if (!fs.length) return null;
    if (t <= fs[0].t_s) return fs[0];
    let lo = 0, hi = fs.length - 1;
    if (t >= fs[hi].t_s) return fs[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fs[m].t_s <= t) lo = m; else hi = m; }
    return between(fs[lo], fs[hi], (t - fs[lo].t_s) / (fs[hi].t_s - fs[lo].t_s));
  }
  // The centre's path over the last `seconds` before t: [x, z] pairs.
  trail(t, seconds = 3) {
    return this.frames.filter((f) => f.t_s <= t && f.t_s >= t - seconds).map((f) => f.com_m);
  }
}

// The plane's axes in the body's fixed frame at a site (longitude and latitude in radians, azimuth in
// radians from north toward east): F forward, L left, U up, each a unit vector.
export function planeAxes(lon, lat, azimuth) {
  const [E, N, U] = globe.localFrame(lon, lat);
  const sa = Math.sin(azimuth), ca = Math.cos(azimuth);
  const F = [0, 1, 2].map((k) => sa * E[k] + ca * N[k]);
  const L = [U[1] * F[2] - U[2] * F[1], U[2] * F[0] - U[0] * F[2], U[0] * F[1] - U[1] * F[0]];
  return { F, L, U };
}

// A point of the plane (x forward, y left, z up; m) in the body's fixed frame, the plane's origin at `origin`.
export function planeToFixed(axes, origin, [x, y, z]) {
  return [0, 1, 2].map((k) => origin[k] + x * axes.F[k] + y * axes.L[k] + z * axes.U[k]);
}

// A direction of the body's fixed frame in the plane's axes (x forward, y left, z up).
export function fixedToPlane(axes, d) {
  const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  return [dot(axes.F), dot(axes.L), dot(axes.U)];
}

// The view of the world's camera that looks at the robot from its right side, so that it moves to the right
// as in the page's side view: the camera stands toward the azimuth's right (azimuth + 90°) and looks along
// azimuth − 90°, tilted from the vertical by `tilt` (the globe's controls' heading and tilt).
export function sideView(lon, lat, height, azimuth, { range = 1.6, tilt = 76 * DEG } = {}) {
  return { lon, lat, height, range, tilt, heading: azimuth - Math.PI / 2 };
}

// The ticks of distance along the ground of the side view, every `step` metres within [x0, x1].
export function groundTicks(x0, x1, step = 0.1) {
  const out = [];
  for (let k = Math.ceil(x0 / step); k * step <= x1 + 1e-9; k++) out.push(+(k * step).toFixed(6));
  return out;
}

// The motors' load: each joint's torque over its driver's peak (−1…1, beyond at the limit of the line).
export const loads = (state) => (state?.joints || []).map((j) => j.torque_n_m / j.peak_n_m);
