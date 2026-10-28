// The arithmetic of a cube of readings about a point (decision 0006; the engine's probe_volume): where
// each cell lies, the scale and colour of its value, the cells a way of showing it keeps, the linear
// fit of a quantity over the cube (its gradient), the value at the centre, arrows of a vector field,
// the body's figure where it crosses the cube, and the surface of one level. Pure functions of the
// engine's answer, without three.js, so that they are checked (tests/run-tests.mjs); cube.js draws
// them.
//
// Coordinates. Cell (i, j, k) of n per edge lies at ((i+½)/n − ½, (j+½)/n − ½, (k+½)/n − ½) of the
// edge along east, north and up; the cells are ordered with i fastest (Fortran order). In the unit
// cube that cube.js draws, x is east, y up and z south (−north): a right-handed frame, so that the
// picture is not mirrored.
//
// The colours are the visualization layer's: its sequential map (plum, Old Rose, cream) for a
// magnitude and its diverging map (lavender, a pale rose, rust) for a signed value or a departure
// about the centre, both made in OKLab with lightness monotone along them, so that their order reads
// without hue. At night the darkest fifth of the sequential map is left out, and by day its palest,
// so that every cell stands out from the display's ground.

import { divergingColour, isosurface, sequentialColour } from '../../../visualization/js/index.js';

// The position of a cell in the unit cube (three.js's axes: x east, y up, z south).
export function cellPosition(n, index) {
  const i = index % n, j = Math.floor(index / n) % n, k = Math.floor(index / (n * n));
  return [(i + 0.5) / n - 0.5, (k + 0.5) / n - 0.5, -((j + 0.5) / n - 0.5)];
}

// The offset of a cell from the cube's centre along east, north and up, in metres.
export function cellOffset(n, edge, index) {
  const i = index % n, j = Math.floor(index / n) % n, k = Math.floor(index / (n * n));
  return [((i + 0.5) / n - 0.5) * edge, ((j + 0.5) / n - 0.5) * edge, ((k + 0.5) / n - 0.5) * edge];
}

// A scale of colour for values: linear, logarithmic (for positive values), or diverging about a value.
export function scaleOf(values, { log = false, about = null } = {}) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi >= lo)) return null;
  if (about !== null && about !== undefined) {
    const m = Math.max(Math.abs(lo - about), Math.abs(hi - about)) || Math.abs(about) * 1e-9 || 1;
    return { kind: 'diverging', lo: about - m, hi: about + m, about, t: (v) => (v - about) / m };
  }
  if (log && lo > 0 && hi > lo) {
    const a = Math.log10(lo), s = Math.log10(hi) - a;
    return { kind: 'log', lo, hi, t: (v) => (Math.log10(Math.max(v, lo)) - a) / s };
  }
  const s = hi - lo || 1;
  return { kind: 'linear', lo, hi, t: (v) => (v - lo) / s };
}

// A value's colour on a scale, [r, g, b] in 0–1, or null where there is no value.
export function colourOf(scale, v, night = true) {
  if (!scale || !Number.isFinite(v)) return null;
  const t = scale.t(v);
  if (scale.kind === 'diverging') return divergingColour(Math.max(-1, Math.min(1, t)));
  const u = Math.max(0, Math.min(1, t));
  return sequentialColour(night ? 0.2 + 0.8 * u : 0.84 * u);
}

// The ramp of a scale as a CSS gradient, for the legend.
export function rampCss(scale, night = true) {
  if (!scale) return 'none';
  const stops = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((u) => {
    const c = scale.kind === 'diverging' ? divergingColour(2 * u - 1) : sequentialColour(night ? 0.2 + 0.8 * u : 0.84 * u);
    return `rgb(${c.map((x) => Math.round(x * 255)).join(',')}) ${u * 100}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

// The cells a mode shows: all with a value, the shell, or three slices (indices along E, N, U).
export function visibleCells(values, n, mode, slices = [0, 0, 0]) {
  const out = [];
  for (let idx = 0; idx < n * n * n; idx++) {
    if (!Number.isFinite(values[idx])) continue;
    const i = idx % n, j = Math.floor(idx / n) % n, k = Math.floor(idx / (n * n));
    if (mode === 'shell' && !(i === 0 || j === 0 || k === 0 || i === n - 1 || j === n - 1 || k === n - 1)) continue;
    if (mode === 'slices' && !(i === slices[0] || j === slices[1] || k === slices[2])) continue;
    if (mode === 'level') continue;
    out.push(idx);
  }
  return out;
}

// The linear fit of a quantity over the cube, v ≈ a + g · x with x the offset in metres along east,
// north and up: its gradient g, by least squares over the cells with a value.
export function gradientOf(values, n, edge) {
  const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], b = [0, 0, 0, 0];
  let count = 0;
  for (let idx = 0; idx < n * n * n; idx++) {
    const v = values[idx];
    if (!Number.isFinite(v)) continue;
    const x = [1, ...cellOffset(n, edge, idx)];
    for (let p = 0; p < 4; p++) { b[p] += x[p] * v; for (let q = 0; q < 4; q++) M[p][q] += x[p] * x[q]; }
    count++;
  }
  if (count < 8) return null;
  // Gauss–Jordan on the 4 × 4 normal equations.
  const A = M.map((row, p) => [...row, b[p]]);
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-30) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let q = c; q < 5; q++) A[r][q] -= f * A[c][q];
    }
  }
  const sol = A.map((row, p) => row[4] / row[p]);
  return { mean: sol[0], east: sol[1], north: sol[2], up: sol[3] };
}

// The value at the cube's centre: the central cell for n odd, the mean of the eight about it else.
export function centreValue(values, n) {
  if (n % 2) return values[(n - 1) / 2 * (1 + n + n * n)];
  const h = n / 2;
  let s = 0, c = 0;
  for (const i of [h - 1, h]) for (const j of [h - 1, h]) for (const k of [h - 1, h]) {
    const v = values[i + n * (j + n * k)];
    if (Number.isFinite(v)) { s += v; c++; }
  }
  return c ? s / c : NaN;
}

// Arrows of a vector field (east, north, up per cell) at every s-th cell, as line segments in the
// unit cube; their lengths proportional to the vectors', the longest a little under the spacing.
export function arrowsGeometry(n, vector, { departure = false, stride = null } = {}) {
  const s = stride || Math.max(1, Math.ceil(n / 7));
  const pick = [];
  const off = Math.floor((s - 1) / 2);
  for (let k = off; k < n; k += s) for (let j = off; j < n; j += s) for (let i = off; i < n; i += s) pick.push(i + n * (j + n * k));
  const mean = [0, 0, 0];
  if (departure) {
    let c = 0;
    for (let idx = 0; idx < n * n * n; idx++) {
      const e = vector.east[idx], no = vector.north[idx], u = vector.up[idx];
      if (Number.isFinite(e) && Number.isFinite(no) && Number.isFinite(u)) { mean[0] += e; mean[1] += no; mean[2] += u; c++; }
    }
    if (c) for (let q = 0; q < 3; q++) mean[q] /= c;
  }
  const vs = pick.map((idx) => [vector.east[idx] - mean[0], vector.north[idx] - mean[1], vector.up[idx] - mean[2]]);
  let top = 0;
  for (const v of vs) if (v.every(Number.isFinite)) top = Math.max(top, Math.hypot(...v));
  const out = [];
  if (!(top > 0)) return { positions: new Float32Array(0), top: 0 };
  const L = 0.9 * s / n;
  pick.forEach((idx, q) => {
    const v = vs[q];
    if (!v.every(Number.isFinite)) return;
    const [x, y, z] = cellPosition(n, idx);
    // east, north, up → x, y, z = east, up, −north
    const d = [v[0] / top * L, v[2] / top * L, -v[1] / top * L];
    const len = Math.hypot(...d);
    if (len < 1e-6) return;
    const a = [x - d[0] / 2, y - d[1] / 2, z - d[2] / 2], b = [x + d[0] / 2, y + d[1] / 2, z + d[2] / 2];
    out.push(...a, ...b);
    // The head: two strokes back from the tip, in the plane of the arrow and the most perpendicular axis.
    const u = d.map((t) => t / len);
    const axis = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const p = [u[1] * axis[2] - u[2] * axis[1], u[2] * axis[0] - u[0] * axis[2], u[0] * axis[1] - u[1] * axis[0]];
    const pn = Math.hypot(...p) || 1;
    const h = Math.min(0.3 * len, 0.35 / n);
    for (const sign of [1, -1]) out.push(...b, b[0] - h * u[0] + sign * 0.5 * h * p[0] / pn, b[1] - h * u[1] + sign * 0.5 * h * p[1] / pn, b[2] - h * u[2] + sign * 0.5 * h * p[2] / pn);
  });
  return { positions: new Float32Array(out), top };
}

// The body's figure where it crosses the cube, as a grid of lines: a sphere of radius R whose top lies
// h below the cube's centre (h the centre's height above the figure), in the unit cube.
export function groundGeometry(R, h, edge, steps = 10) {
  const out = [];
  const up = (e, n) => {
    const r2 = R * R - (e * edge) ** 2 - (n * edge) ** 2;
    return r2 > 0 ? (Math.sqrt(r2) - R - h) / edge : -Infinity;
  };
  const line = (fixed, along) => {
    let prev = null;
    for (let s = 0; s <= 40; s++) {
      const t = -0.5 + s / 40;
      const [e, n] = along ? [t, fixed] : [fixed, t];
      const u = up(e, n);
      const p = u >= -0.5 && u <= 0.5 ? [e, u, -n] : null;
      if (p && prev) out.push(...prev, ...p);
      prev = p;
    }
  };
  for (let q = 0; q <= steps; q++) { const f = -0.5 + q / steps; line(f, true); line(f, false); }
  return new Float32Array(out);
}

// The level surface of a quantity in the unit cube (visualization's surface nets), a cell without a
// value counted below every level (a finite value, so that the crossings interpolate).
export function levelSurface(values, n, level) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const below = lo - (hi - lo || 1);
  const data = Float32Array.from(values, (v) => (Number.isFinite(v) ? v : below));
  const c = 0.5 / n - 0.5;
  // voxel (i, j, k) → (x, y, z) = (east, up, −north) of the unit cube
  const affine = [1 / n, 0, 0, c, 0, 0, 1 / n, c, 0, -1 / n, 0, -c];
  return isosurface({ dims: [n, n, n], data, affine }, level, { smoothing: 1 });
}
