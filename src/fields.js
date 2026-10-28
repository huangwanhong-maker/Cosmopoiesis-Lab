// The magnetic fields drawn in the world: the Earth's field lines from WMM2025, and the Moon's crustal
// field from T2015_449 (Tsunakawa et al. 2015, as Wieczorek expanded it), each the engine's (the ops
// field_lines and field_map). A field is drawn as what it is (formalism §3.6): a vector field over
// space as curves tangent to it, a scalar over a body's ground as a colour on that ground.

import { engine } from './api.js';
import { ttText } from './format.js';

// The colour of the crust's |B|: one hue, gold, from pale to deep, on a logarithmic scale from a
// nanotesla to the map's greatest; its opacity rises with it from nothing, so that where the crust is
// weakly magnetised (most of the Moon, a few nanotesla) the ground shows through and the anomalies
// stand out. The radial component is diverging: gold outward, orchid inward, about a clear zero.
const GOLD = [[0, [246, 227, 180]], [0.5, [233, 170, 64]], [1, [150, 82, 8]]];
const ORCHID = [[0, [236, 222, 247]], [0.5, [184, 146, 221]], [1, [94, 58, 139]]];
function ramp(stops, t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i], [t0, c0] = stops[i - 1];
    if (t <= t1) { const f = (t - t0) / (t1 - t0); return c0.map((x, k) => x + f * (c1[k] - x)); }
  }
  return stops[stops.length - 1][1];
}
export const FIELD_FLOOR_T = 1e-9;

// The engine's float32 values, sent as base64 (little-endian, as every browser's typed arrays are here).
export function float32(text) {
  const s = atob(text), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

// The ramps sampled at 256 steps, with the opacity that rises along them.
const STEPS = 256;
const table = (stops) => Array.from({ length: STEPS }, (_, k) => {
  const t = k / (STEPS - 1), c = ramp(stops, t);
  return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), Math.round(255 * 0.92 * Math.sqrt(t))];
});
const GOLD_TABLE = table(GOLD), ORCHID_TABLE = table(ORCHID);

// The engine's grid as an equirectangular image, west at the left and north at the top.
function imageOf(ans) {
  const { nlat, nlon, quantity } = ans;
  const values = ans.values || float32(ans.values_f32);
  const top = Math.max(Math.abs(ans.min), Math.abs(ans.max));
  const span = Math.log10(top / FIELD_FLOOR_T);
  const canvas = document.createElement('canvas');
  canvas.width = nlon;
  canvas.height = nlat;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(nlon, nlat), px = img.data;
  for (let i = 0; i < nlat * nlon; i++) {
    const v = values[i];
    const t = Math.log10(Math.max(Math.abs(v), FIELD_FLOOR_T) / FIELD_FLOOR_T) / span;
    const c = (quantity === 'radial' && v < 0 ? ORCHID_TABLE : GOLD_TABLE)[Math.min(STEPS - 1, Math.max(0, Math.round(t * (STEPS - 1))))];
    px[4 * i] = c[0], px[4 * i + 1] = c[1], px[4 * i + 2] = c[2], px[4 * i + 3] = c[3];
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, top };
}

// The Moon's crustal field as a layer of the globe's tiles (the whole map, as the bodies' maps are:
// its two halves the two tiles of level 0), with its title, credit and legend.
export async function moonFieldMap({ quantity = 'total', synthetic = false, step_deg = 0.5, height_m = 0 } = {}) {
  const ans = await engine({ op: 'field_map', body: 'moon', quantity, synthetic, step_deg, height_m, encoding: 'f32' });
  const { canvas, top } = imageOf(ans);
  const id = `moon-field-${quantity}-${synthetic ? 'synthetic' : 'model'}-${step_deg}`;
  const title = `The Moon's crustal field, ${quantity === 'radial' ? 'its radial component' : '|B|'} at the surface`;
  const credit = `${ans.model}${synthetic ? `; synthetic, the power the model lacks below the crust's spectral law, to degree ${ans.degree}` : ''}`;
  const half = canvas.width / 2;
  return {
    id, title, credit,
    layer: {
      id, maxLevel: 0, service: { body: 'moon', title, credit, kind: 'map' },
      load: async (z, x) => (z === 0 ? createImageBitmap(canvas, x * half, 0, half, canvas.height, { imageOrientation: 'flipY' }) : null),
    },
    legend: { quantity, top, floor: FIELD_FLOOR_T, min: ans.min, max: ans.max, provenance: ans.provenance, law: ans.law, degree: ans.degree },
  };
}

// The legend of the map, as HTML: the ramp and its ends.
export function fieldLegend(legend) {
  const stops = (s) => [0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${ramp(s, t).map(Math.round).join(',')}) ${t * 100}%`).join(', ');
  const nT = (x) => `${(x * 1e9).toFixed(x >= 1e-9 ? 0 : 1)} nT`;
  const bar = (s) => `<i class="ramp" style="background: linear-gradient(to right, ${stops(s)})"></i>`;
  const inward = ORCHID.map(([t, c]) => [1 - t, c]).reverse();
  return legend.quantity === 'radial'
    ? `<span>inward ${nT(legend.top)} ${bar(inward)} 0 ${bar(GOLD)} ${nT(legend.top)} outward<small> logarithmic in |B_r| from ${nT(legend.floor)}</small></span>`
    : `<span>${nT(legend.floor)} ${bar(GOLD)} ${nT(legend.top)}<small> logarithmic, clear below ${nT(legend.floor)}</small></span>`;
}

// The Earth's field lines at an instant (TT seconds), in the Earth's fixed frame (ITRS), as the
// segments of a 'lines' feature.
export async function earthFieldLines(tt, { maxRadius = 6 } = {}) {
  const ans = await engine({ op: 'field_lines', body: 'earth', time: ttText(tt), max_radius: maxRadius });
  const segments = [];
  for (const line of ans.lines) for (let i = 1; i < line.length; i++) segments.push(line[i - 1], line[i]);
  return { segments, model: ans.model, caveat: ans.caveat, year: ans.decimal_year, count: ans.lines.length };
}

// The two layers' state, shared by LAYERS and the loop: the lines are drawn again when the world's
// instant moves by more than a month (the secular variation), the map when its quantity changes.
export class FieldLayers {
  constructor(app) {
    this.app = app;
    this.linesAt = null;
    this.lines = null;
    this.map = null;
    this.busy = false;
  }

  async setLines(on) {
    const { scene, clock } = this.app;
    scene.options.fieldLines = on;
    if (!on) { scene.setFeature('field-lines', 'earth', null); this.linesAt = null; return null; }
    const tt = clock.now();
    const lines = await earthFieldLines(tt);
    if (!scene.options.fieldLines) return null;
    scene.setFeature('field-lines', 'earth', lines.segments, { kind: 'lines', colour: 0x7fb0ee, opacity: 0.55, depthTest: true, group: 'fieldLines' });
    this.linesAt = tt;
    this.lines = lines;
    return lines;
  }

  tick(tt) {
    if (!this.app.scene.options.fieldLines || this.linesAt === null || this.busy || Math.abs(tt - this.linesAt) < 30 * 86400) return;
    this.busy = true;
    this.setLines(true).catch(() => {}).finally(() => { this.busy = false; });
  }

  async setMoon(quantity, synthetic) {
    const { scene } = this.app, o = scene.options;
    o.moonField = quantity || null;
    o.moonFieldSynthetic = !!synthetic;
    if (!quantity) { scene.setMoonField(null); this.map = null; return null; }
    const map = await moonFieldMap({ quantity, synthetic: !!synthetic });
    if (o.moonField !== quantity || o.moonFieldSynthetic !== !!synthetic) return null;
    scene.setMoonField(map);
    this.map = map;
    return map;
  }
}
