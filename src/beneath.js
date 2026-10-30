// The world beneath a place (decision 0010): a section through the Earth along a geodesic, and the
// column beneath the observer to the centre, drawn in SVG from the engine's answers (beneath.hpp).
//
// The section composes two resolutions and says so: the surface, the sea floor and the sea are the
// terrain's (ETOPO 2022 or Terrarium, a sample every step), the layers beneath are CRUST1.0's, constant
// in each cell of 1°, and the mantle below the Moho is PREM's. A layer is drawn where the model puts it
// and cut by the terrain above it; the first solid layer of a cell reaches up to the terrain where the
// ground stands higher than the cell's mean. Rock is coloured by its density, light rock pale and dense
// rock dark: by night on the plum map (cream sediments, Old Rose crust, plum mantle), by day on the
// orchid map, as the rover's map is; the sea in a translucent blue, ice pale; the earthquakes near the line
// (Global CMT) are the observed rose, sized by magnitude. The surface and crust views are flat, depth
// against distance with their exaggeration stated; the mantle view is the Earth's slice at true scale,
// its curvature drawn. Every point of the figure says on hover what lies there.

import { styles } from '../../../visualization/js/index.js';
import { hover, node, svg } from './charts.js';
import { esc, fmt } from './format.js';

const EARTH_R = 6371e3, MOON_R = 1737.4e3;
// The crust's layers by CRUST1.0's index (geophysics structure's CRUST1_LAYERS).
export const LAYER_NAMES = ['water', 'ice', 'upper sediments', 'middle sediments', 'lower sediments',
  'upper crystalline crust', 'middle crystalline crust', 'lower crystalline crust', 'mantle'];
// Density (kg/m³) to the gold map: water and ice are drawn apart.
export const DENSITY_RANGE = [1500, 4600];
export const VIEWS = {
  surface: 'the surface: the land, the sea and its floor',
  crust: 'the crust to below the Moho',
  mantle: 'the mantle to 800 km, at true scale',
};
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

// ---- what lies where ---------------------------------------------------------------------------------------

// The sample nearest a distance along the section (m).
export function nearestSample(sec, s) {
  const S = sec.points.s_m;
  const k = Math.round((s - S[0]) / sec.step_m);
  return Math.max(0, Math.min(S.length - 1, k));
}

// The surface at a sample: the terrain's height (m above sea level), else the cell's, else 0.
export function surfaceAt(sec, i) {
  const h = sec.terrain?.height_m?.[i];
  if (Number.isFinite(h)) return h;
  const c = sec.columns?.[String(sec.cells?.[i])];
  return c ? (c.surface_m > 0 ? c.surface_m : c.solid_m) : 0;
}

// What lies at sample i and height z (m above sea level): { what, density, vp, vs, model } or null in
// the air. The terrain decides the surface and the sea; CRUST1.0's cell the layers below it, its first
// solid layer reaching up to a surface above the cell's; PREM below the Moho.
export function materialAt(sec, i, z) {
  const surface = surfaceAt(sec, i);
  const sea = Boolean(sec.terrain?.sea?.[i]);
  if (z > Math.max(surface, sea ? 0 : surface)) return null;
  if (sea && z > surface) return { what: 'the sea', density: 1025, vp: 1500, vs: 0, model: sec.terrain ? 'the terrain' : 'CRUST1.0' };
  const col = sec.columns?.[String(sec.cells?.[i])];
  if (!col) return { what: sec.body === 'moon' ? "the Moon's ground (no model of its interior)" : 'the ground', model: 'the terrain' };
  const solid = col.layers.filter((l) => l[0] >= 1);
  for (let k = 0; k < solid.length; k++) {
    const [index, top, bottom, density, vp, vs] = solid[k];
    if (z <= (k === 0 ? Math.max(top, z) : top) && z >= bottom) return { what: LAYER_NAMES[index], density, vp, vs, model: 'CRUST1.0' };
  }
  const depth = -z;
  for (const p of sec.prem || []) {
    if (depth >= p.top_m && depth <= p.bottom_m) {
      const u = (depth - p.top_m) / Math.max(1, p.bottom_m - p.top_m);
      const lerp = (a, b) => a + (b - a) * u;
      return { what: `${p.name} (${p.region})`, density: lerp(p.density_top_kg_m3, p.density_bottom_kg_m3), vp: lerp(p.vp_top_m_s, p.vp_bottom_m_s),
        vs: lerp(p.vs_top_m_s, p.vs_bottom_m_s), model: 'PREM' };
    }
  }
  return { what: 'the mantle', model: 'PREM' };
}

// The heights (m) the view spans: [top, bottom].
export function viewRange(sec, view) {
  const H = sec.points.s_m.map((_, i) => surfaceAt(sec, i));
  const hi = Math.max(0, ...H), lo = Math.min(0, ...H);
  if (view === 'surface') {
    const pad = Math.max(300, 0.12 * (hi - lo));
    return [hi + pad, lo - Math.max(1500, 0.25 * (hi - lo))];
  }
  if (view === 'crust') {
    const moho = sec.deepest_moho_m || (sec.body === 'moon' ? 40e3 : 35e3);
    return [hi + Math.max(500, 0.06 * (moho + hi)), -(Math.ceil((moho + 15e3) / 5e3) * 5e3)];
  }
  return [hi + 2e3, -800e3];
}

// The projection of (s, z) into the figure: flat (linear in both) or curved (the body's slice, true
// scale, its centre below the figure). Its inverse for the pointer.
export function projection(sec, view, W, H, { L = 46, R = 12, T = 16, B = 30 } = {}) {
  const [top, bottom] = viewRange(sec, view);
  const half = sec.half_m;
  if (view !== 'mantle') {
    const w = W - L - R, h = H - T - B;
    const X = (s) => L + ((s + half) / (2 * half)) * w, Y = (z) => T + ((top - z) / (top - bottom)) * h;
    return { curved: false, top, bottom, L, R, T, B, W, H, pt: (s, z) => [X(s), Y(z)], X, Y,
      inverse: (x, y) => [((x - L) / w) * 2 * half - half, top - ((y - T) / h) * (top - bottom)],
      exaggeration: ((2 * half) / w) / ((top - bottom) / h) };
  }
  const Rb = sec.body === 'moon' ? MOON_R : EARTH_R, tmax = half / Rb;
  const D = -bottom;
  const widthM = 2 * (Rb + top) * Math.sin(Math.min(tmax, Math.PI / 2));
  const heightM = (Rb + top) - (Rb - D) * Math.cos(Math.min(tmax, Math.PI));
  const k = Math.min((W - L - R) / widthM, (H - T - B) / heightM);
  const cx = L + (W - L - R) / 2, cy = T + (Rb + top) * k + Math.max(0, ((H - T - B) - heightM * k) / 2);
  const pt = (s, z) => { const t = s / Rb, r = (Rb + z) * k; return [cx + r * Math.sin(t), cy - r * Math.cos(t)]; };
  return { curved: true, top, bottom, L, R, T, B, W, H, pt, cx, cy, k, Rb,
    inverse: (x, y) => { const r = Math.hypot(x - cx, cy - y) / k, t = Math.atan2(x - cx, cy - y); return [t * Rb, r - Rb]; },
    exaggeration: 1 };
}

// ---- drawing ----------------------------------------------------------------------------------------------

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// The density's colour, u = 0 for the lightest rock and 1 for the densest: by night the plum map
// reversed (cream to plum, its darkest end left out against the night), by day the orchid map (pale
// orchid to deep violet).
export function densityColour(rho, day = false) {
  const u = Math.min(1, Math.max(0, (rho - DENSITY_RANGE[0]) / (DENSITY_RANGE[1] - DENSITY_RANGE[0])));
  const c = day ? styles.within(styles.colourMap('orchid').colour, 0.04, 1)(u) : styles.within(styles.colourMap('plum').colour, 0.16, 1)(1 - u);
  return styles.cssColour(c);
}

// A region between distances s0..s1 and heights z0 (top) .. z1 (bottom), as a path; arcs subdivided
// when the projection is curved.
function region(P, s0, s1, z0, z1) {
  const n = P.curved ? Math.max(2, Math.ceil(Math.abs(s1 - s0) / (P.Rb * 0.004))) : 1;
  const pts = [];
  for (let j = 0; j <= n; j++) pts.push(P.pt(s0 + ((s1 - s0) * j) / n, z0));
  for (let j = n; j >= 0; j--) pts.push(P.pt(s0 + ((s1 - s0) * j) / n, z1));
  return `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z`;
}
const line = (pts) => `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}`;

let uid = 0;

// The section. options: { view, size: { w, h } | null, swath }.
export function sectionFigure(el, sec, { view = 'crust', size = null } = {}) {
  const W = size ? Math.round(size.w) : 380, H = size ? Math.round(size.h) - 4 : view === 'mantle' ? 300 : 250;
  const s = svg(el, W, H);
  const P = projection(sec, view, W, H);
  const day = document.documentElement.dataset.theme === 'day';
  const S = sec.points.s_m, n = S.length, half = sec.half_m, step = sec.step_m;
  const id = `bn${++uid}`;
  const defs = node(s, 'defs');
  // Below the surface: the clip of everything solid.
  const surface = S.map((x, i) => P.pt(x, surfaceAt(sec, i)));
  const below = P.curved
    ? `${line(surface)}L${line([P.pt(half, P.bottom), ...Array.from({ length: 41 }, (_, j) => P.pt(half - (2 * half * j) / 40, P.bottom))]).slice(1)}Z`
    : `${line(surface)}L${P.pt(half, P.bottom).join(',')}L${P.pt(-half, P.bottom).join(',')}Z`;
  node(node(defs, 'clipPath', { id: `${id}-ground` }), 'path', { d: below });
  // The frame of the slice (the view's region), for the curved view's outline.
  const frame = region(P, -half, half, Math.min(P.top, 0), P.bottom);
  // PREM below the crust: a gradient in depth (linear when flat, radial about the centre when curved).
  if (sec.prem?.length) {
    const g = P.curved
      ? node(defs, 'radialGradient', { id: `${id}-prem`, gradientUnits: 'userSpaceOnUse', cx: P.cx, cy: P.cy, r: P.Rb * P.k })
      : node(defs, 'linearGradient', { id: `${id}-prem`, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: P.Y(0), y2: P.Y(P.bottom) });
    const depthAt = (d) => (P.curved ? (P.Rb - d) / P.Rb : d / -P.bottom);
    const shells = [...sec.prem].sort((a, b) => (P.curved ? b.top_m - a.top_m : a.top_m - b.top_m));
    for (const p of shells) {
      const a = Math.min(1, Math.max(0, depthAt(p.top_m))), b = Math.min(1, Math.max(0, depthAt(p.bottom_m)));
      const [first, second] = P.curved ? [[b, p.density_bottom_kg_m3], [a, p.density_top_kg_m3]] : [[a, p.density_top_kg_m3], [b, p.density_bottom_kg_m3]];
      node(g, 'stop', { offset: first[0].toFixed(5), 'stop-color': densityColour(first[1], day) });
      node(g, 'stop', { offset: second[0].toFixed(5), 'stop-color': densityColour(second[1], day) });
    }
  }
  const ground = node(s, 'g', { 'clip-path': `url(#${id}-ground)` });
  node(ground, 'path', { d: frame, fill: sec.prem?.length ? `url(#${id}-prem)` : 'var(--unknown-ground)', stroke: 'none' });
  // CRUST1.0: each run of samples in one cell, each of its solid layers.
  const runs = [];
  if (sec.cells) {
    for (let i = 0; i < n; i++) {
      const c = sec.cells[i];
      const s0 = i === 0 ? -half : (S[i - 1] + S[i]) / 2, s1 = i === n - 1 ? half : (S[i] + S[i + 1]) / 2;
      if (runs.length && runs[runs.length - 1].cell === c) runs[runs.length - 1].s1 = s1;
      else runs.push({ cell: c, s0, s1 });
    }
  }
  const boundaries = [], moho = [];
  for (const r of runs) {
    const col = sec.columns[String(r.cell)];
    const solid = col.layers.filter((l) => l[0] >= 1);
    solid.forEach(([index, top, bottom, density], k) => {
      const z0 = k === 0 ? Math.max(P.top, top) : top;
      const fill = index === 1 ? 'var(--ice)' : densityColour(density, day);
      node(ground, 'path', { d: region(P, r.s0, r.s1, z0, Math.max(bottom, P.bottom)), fill, stroke: 'none' });
      if (k > 0) boundaries.push([r.s0, r.s1, top]);
    });
    moho.push([r.s0, r.s1, -col.moho_depth_m]);
  }
  // The layers' boundaries (hairlines) and the Moho (rose), stepping at the cells' edges.
  const hairs = node(ground, 'g', { class: 'layer-lines' });
  for (const [s0, s1, z] of boundaries) node(hairs, 'path', { d: line(arc(P, s0, s1, z)), class: 'boundary' });
  if (moho.length) {
    const pts = [];
    for (const [s0, s1, z] of moho) pts.push(...arc(P, s0, s1, z));
    node(ground, 'path', { d: line(pts), class: 'moho' });
  }
  // PREM's discontinuities in the mantle view.
  if (view === 'mantle') {
    for (const d of sec.discontinuities || []) {
      if (d.depth_m > -P.bottom) continue;
      const pts = arc(P, -half, half, -d.depth_m);
      node(ground, 'path', { d: line(pts), class: 'discontinuity' });
      const [x, y] = P.pt(half, -d.depth_m);
      node(s, 'text', { x: x - 3, y: y - 3, 'text-anchor': 'end', class: 'label small' }, `${fmt(d.depth_m / 1e3, 0)} km`);
    }
  }
  // The sea: from its surface to the floor, where the terrain says it is sea.
  const seaG = node(s, 'g', {});
  let i = 0;
  while (i < n) {
    if (!sec.terrain?.sea?.[i]) { i++; continue; }
    let j = i;
    while (j + 1 < n && sec.terrain.sea[j + 1]) j++;
    const s0 = i === 0 ? -half : (S[i - 1] + S[i]) / 2, s1 = j === n - 1 ? half : (S[j] + S[j + 1]) / 2;
    const top = arc(P, s0, s1, 0);
    const floor = [P.pt(s1, surfaceAt(sec, j))];
    for (let k = j; k >= i; k--) floor.push(P.pt(S[k], surfaceAt(sec, k)));
    floor.push(P.pt(s0, surfaceAt(sec, i)));
    node(seaG, 'path', { d: `${line([...top, ...floor])}Z`, class: 'sea' });
    i = j + 1;
  }
  // The surface, and the sea's surface.
  node(s, 'path', { d: line(surface), class: 'surface' });
  // The earthquakes, smallest first so the great ones lie on top.
  const quakes = (sec.events || []).filter((e) => -e.depth_m >= P.bottom).sort((a, b) => a.magnitude - b.magnitude);
  const radius = (m) => Math.max(1.4, Math.min(6, 1.4 + (m - 5) * 1.25));
  const eq = node(s, 'g', { class: 'quakes' });
  const placed = quakes.map((e) => {
    const [x, y] = P.pt(e.along_m, -e.depth_m);
    node(eq, 'circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: radius(e.magnitude).toFixed(1) });
    return { e, x, y };
  });
  // The observer at the centre: on the ground, or on the sea's surface.
  const i0 = nearestSample(sec, 0);
  const [ox, oy] = P.pt(0, sec.terrain?.sea?.[i0] ? 0 : surfaceAt(sec, i0));
  node(s, 'path', { d: `M${ox - 5},${oy - 11}L${ox + 5},${oy - 11}L${ox},${oy - 3}Z`, class: 'observer-mark' });
  // The frame and the axes.
  if (P.curved) node(s, 'path', { d: frame, class: 'frame' });
  else node(s, 'rect', { x: P.L, y: P.T, width: W - P.L - P.R, height: H - P.T - P.B, class: 'frame' });
  axes(s, sec, view, P);
  // What lies under the pointer.
  const hit = node(s, 'rect', { x: 0, y: 0, width: W, height: H, class: 'hit' });
  hover(hit, (e) => {
    const r = s.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    let near = null, best = 7;
    for (const p of placed) { const d = Math.hypot(p.x - x, p.y - y); if (d < best) { best = d; near = p.e; } }
    if (near) {
      return `<b>M${fmt(near.magnitude, 1)}</b>, ${fmt(near.depth_m / 1e3, 0)} km deep · ${esc(near.time_utc)}<div>${esc(near.region)} (${esc(near.name)})</div>`
        + `<div class="note">${fmt(near.along_m / 1e3, 0)} km along, ${fmt(Math.abs(near.across_m) / 1e3, 0)} km ${near.across_m >= 0 ? 'to the right' : 'to the left'} of the line</div>`;
    }
    const [sx, z] = P.inverse(x, y);
    if (Math.abs(sx) > half || z < P.bottom) return '';
    const k = nearestSample(sec, sx);
    const m = materialAt(sec, k, z);
    const where = `${fmt(Math.abs(sx) / 1e3, 0)} km ${sx >= 0 ? compass(sec.azimuth_deg) : compass(sec.azimuth_deg + 180)} · ${z >= 0 ? `${fmt(z, 0)} m up` : `${fmt(-z / 1e3, z > -10e3 ? 2 : 0)} km deep`}`;
    if (!m) return `${where}<div class="note">the air</div>`;
    const values = m.density ? `<div>ρ <b>${fmt(m.density / 1e3, 2)}</b> g/cm³ · vp <b>${fmt(m.vp / 1e3, 2)}</b> · vs <b>${fmt(m.vs / 1e3, 2)}</b> km/s</div>` : '';
    return `${where}<div><b>${esc(m.what)}</b> <span class="note">${esc(m.model)}</span></div>${values}`;
  });
  return { exaggeration: P.exaggeration, quakes: quakes.length, deeper: (sec.events || []).length - quakes.length, curved: P.curved };
}

// Points along a constant height between two distances (arcs subdivided when curved).
function arc(P, s0, s1, z) {
  const n = P.curved ? Math.max(1, Math.ceil(Math.abs(s1 - s0) / (P.Rb * 0.004))) : 1;
  return Array.from({ length: n + 1 }, (_, j) => P.pt(s0 + ((s1 - s0) * j) / n, z));
}

function ticks(a, b, count) {
  const span = Math.abs(b - a), step0 = span / count, mag = 10 ** Math.floor(Math.log10(step0)), r = step0 / mag;
  const step = (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag;
  const lo = Math.min(a, b), hi = Math.max(a, b), out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) out.push(+v.toPrecision(12));
  return out;
}

function axes(s, sec, view, P) {
  const half = sec.half_m;
  const left = compass(sec.azimuth_deg + 180), right = compass(sec.azimuth_deg);
  if (!P.curved) {
    const km = view === 'surface' && P.top - P.bottom < 20e3;
    for (const z of ticks(P.top, P.bottom, 5)) {
      const y = P.Y(z);
      node(s, 'line', { x1: P.L - 3, x2: P.L, y1: y, y2: y, class: 'axis' });
      if (view !== 'surface' && z > 0) continue;  // depths only, in the views of depth
      const v = view === 'surface' ? z / 1e3 : -z / 1e3;
      const label = Math.abs(v) < 1e-9 ? '0' : fmt(v, km && P.top - P.bottom < 6e3 ? 1 : 0).replace('-', '−');
      node(s, 'text', { x: P.L - 5, y: y + 3.5, 'text-anchor': 'end' }, label);
    }
    node(s, 'text', { x: 2, y: P.T - 5 }, view === 'surface' ? 'height, km' : 'depth, km');
    if (P.top > 0 && P.bottom < 0) node(s, 'line', { x1: P.L, x2: P.W - P.R, y1: P.Y(0), y2: P.Y(0), class: 'sea-level' });
  }
  // Distance along, from the observer.
  const yb = P.H - P.B + 13;
  for (const v of ticks(-half / 1e3, half / 1e3, 4)) {
    const [x] = P.curved ? P.pt(v * 1e3, P.top) : [P.X(v * 1e3)];
    if (Math.abs(v * 1e3) >= half * 0.9) continue;
    node(s, 'text', { x, y: P.curved ? P.pt(v * 1e3, P.top)[1] - 6 : yb, 'text-anchor': 'middle' }, `${fmt(Math.abs(v), 0)}`);
  }
  const ends = P.curved ? [P.pt(-half, P.top), P.pt(half, P.top)] : [[P.L, yb], [P.W - P.R, yb]];
  node(s, 'text', { x: ends[0][0], y: P.curved ? ends[0][1] - 6 : yb, 'text-anchor': 'start', class: 'label' }, `${left} ·`);
  node(s, 'text', { x: ends[1][0], y: P.curved ? ends[1][1] - 6 : yb, 'text-anchor': 'end', class: 'label' }, `· ${right} km`);
}

// ---- the column to the centre -------------------------------------------------------------------------------

// The regions of the Earth from the column's top, for the bands of the deep chart.
export function regionsOf(reading) {
  const moho = reading.moho_depth_m;
  return [
    { from: -reading.surface_m, to: moho, label: 'crust' },
    { from: moho, to: 400e3, label: 'upper mantle' },
    { from: 400e3, to: 670e3, label: 'transition zone' },
    { from: 670e3, to: 2891e3, label: 'lower mantle' },
    { from: 2891e3, to: 5149.5e3, label: 'outer core' },
    { from: 5149.5e3, to: 6371e3, label: 'inner core' },
  ];
}

// A quantity against depth (down). spec: { title, unit, depth: [], series: [{ label, values, dash }], bands,
// marks: [{ depth, label }], from, to, size }.
export function depthChart(el, spec) {
  const W = spec.size ? Math.round(spec.size.w) : 176, H = spec.size ? Math.round(spec.size.h) - 4 : 250, L = 38, R = 8, T = 18, B = 26;
  const s = svg(el, W, H);
  const keep = spec.depth.map((d) => d >= spec.from - 1 && d <= spec.to + 1);
  const all = spec.series.flatMap((x) => x.values.filter((_, i) => keep[i])).filter(Number.isFinite);
  let x0 = Math.min(0, ...all), x1 = Math.max(...all);
  x1 += (x1 - x0) * 0.08;
  const X = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), Y = (d) => T + ((d - spec.from) / (spec.to - spec.from || 1)) * (H - T - B);
  node(s, 'text', { x: L, y: 11, class: 'title' }, `${spec.title}, ${spec.unit}`);
  // The bands, each named on the side its curves leave free at its top.
  const first = spec.series[0];
  const valueAt = (d) => {
    let best = -1;
    spec.depth.forEach((x, i) => { if (x >= d && (best < 0 || x < spec.depth[best])) best = i; });
    return best < 0 ? NaN : Math.max(...spec.series.map((x) => x.values[best]));
  };
  (spec.bands || []).forEach((b, i) => {
    const a = Math.max(spec.from, b.from), c = Math.min(spec.to, b.to);
    if (c <= a) return;
    node(s, 'rect', { x: L, y: Y(a), width: W - L - R, height: Y(c) - Y(a), class: `band ${i % 2 ? 'alt' : ''}` });
    if (Y(c) - Y(a) <= 13 || !first) return;
    const v = valueAt(a + Math.min(c - a, (spec.to - spec.from) * 0.04));
    const right = !(X(v) > L + (W - L - R) * 0.55);
    node(s, 'text', { x: right ? W - R - 3 : L + 3, y: Y(a) + 11, 'text-anchor': right ? 'end' : 'start', class: 'label small' }, b.label);
  });
  for (const d of ticks(spec.from, spec.to, 5)) {
    node(s, 'line', { x1: L, x2: W - R, y1: Y(d), y2: Y(d), class: 'grid' });
    node(s, 'text', { x: L - 4, y: Y(d) + 3.5, 'text-anchor': 'end' }, fmt(d / 1e3, 0).replace('-', '−'));
  }
  for (const v of ticks(x0, x1, 3)) node(s, 'text', { x: X(v), y: H - B + 12, 'text-anchor': 'middle' }, fmt(v, v % 1 ? 1 : 0));
  node(s, 'text', { x: 2, y: T - 4 }, 'km');
  for (const m of spec.marks || []) {
    if (m.depth < spec.from || m.depth > spec.to) continue;
    node(s, 'line', { x1: L, x2: W - R, y1: Y(m.depth), y2: Y(m.depth), class: 'mark-line' });
  }
  for (const x of spec.series) {
    const pts = [];
    spec.depth.forEach((d, i) => { if (keep[i] && Number.isFinite(x.values[i])) pts.push([X(x.values[i]), Y(Math.min(spec.to, Math.max(spec.from, d)))]); });
    if (!pts.length) continue;
    node(s, 'path', { d: line(pts), class: 'line', stroke: 'var(--prov-model)', ...(x.dash ? { 'stroke-dasharray': x.dash } : {}) });
    // Named where the curves stand apart: a third of the way down.
    const yLabel = Y(spec.from + 0.3 * (spec.to - spec.from));
    const at = pts.reduce((best, p) => (Math.abs(p[1] - yLabel) < Math.abs(best[1] - yLabel) ? p : best), pts[0]);
    if (spec.series.length > 1) node(s, 'text', { x: at[0] + 5, y: at[1] + 4, class: 'label' }, x.label);
  }
  const hit = node(s, 'rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'hit' });
  hover(hit, (e) => {
    const r = s.getBoundingClientRect();
    const d = spec.from + ((((e.clientY - r.top) / r.height) * H - T) / (H - T - B)) * (spec.to - spec.from);
    let best = -1;
    spec.depth.forEach((x, i) => { if (keep[i] && (best < 0 || Math.abs(x - d) < Math.abs(spec.depth[best] - d))) best = i; });
    if (best < 0) return '';
    const rows = spec.series.map((x) => `<div>${esc(x.label)} <b>${fmt(x.values[best], 3)}</b> ${esc(spec.unit)}</div>`).join('');
    return `<div>${fmt(spec.depth[best] / 1e3, spec.to < 200e3 ? 1 : 0)} km deep · ${esc(spec.layer?.[best] || '')}</div>${rows}`;
  });
}

// The column's two charts: the speeds of P and S waves, and the density, from the column's top to below
// the Moho or to the centre.
export function columnFigure(speedsEl, densityEl, reading, { range = 'centre', size = null } = {}) {
  const p = reading.profile;
  const to = range === 'centre' ? 6371e3 : Math.ceil((reading.moho_depth_m + 40e3) / 10e3) * 10e3;
  const from = Math.min(0, -reading.surface_m);
  const bands = range === 'centre' ? regionsOf(reading) : [
    ...reading.layers.map((l) => ({ from: -l.top_m, to: -l.bottom_m, label: l.name.replace(' crystalline', '') })),
    { from: reading.moho_depth_m, to, label: 'mantle (PREM)' }];
  const marks = (reading.discontinuities || []).map((d) => ({ depth: d.depth_m, label: d.name }));
  const common = { depth: p.depth_m, bands, marks, from, to, size, layer: p.layer };
  depthChart(speedsEl, { ...common, title: 'Speeds of P and S', unit: 'km/s',
    series: [{ label: 'P', values: p.vp_m_s.map((v) => v / 1e3) }, { label: 'S', values: p.vs_m_s.map((v) => v / 1e3), dash: '4 3' }] });
  depthChart(densityEl, { ...common, title: 'Density', unit: 'g/cm³', series: [{ label: 'ρ', values: p.density_kg_m3.map((v) => v / 1e3) }] });
}

// The legend of the section: what each colour and mark is.
export function sectionLegend(sec, { day = false, swath_m = 0, exaggeration = 1, curved = false } = {}) {
  const ramp = Array.from({ length: 9 }, (_, i) => densityColour(DENSITY_RANGE[0] + (i / 8) * (DENSITY_RANGE[1] - DENSITY_RANGE[0]), day)).join(', ');
  // Only what is drawn: no sea where the line stays on land, no earthquakes where none lie near it.
  const parts = (sec.terrain?.sea || []).some(Boolean) ? [`<span><i class="swatch" style="background: var(--sea)"></i> the sea</span>`] : [];
  if (sec.columns) {
    if (Object.values(sec.columns).some((c) => c.layers.some((l) => l[0] === 1))) parts.push(`<span><i class="swatch" style="background: var(--ice)"></i> ice</span>`);
    parts.push(`<span>rock by density <i class="ramp" style="background: linear-gradient(to right, ${ramp})"></i> ${fmt(DENSITY_RANGE[0] / 1e3, 1)}–${fmt(DENSITY_RANGE[1] / 1e3, 1)} g/cm³</span>`);
    parts.push('<span><i class="swatch line" style="background: var(--ink)"></i> the Moho</span>');
  }
  if (sec.events?.length) parts.push(`<span><i class="swatch dot" style="background: var(--prov-observed)"></i> earthquakes within ${fmt(swath_m / 1e3, 0)} km, by magnitude</span>`);
  parts.push(`<span class="note">${curved ? 'true scale, the curvature drawn' : `depth ×${fmt(exaggeration, exaggeration < 10 ? 1 : 0)} against distance`}</span>`);
  return parts.join('');
}
