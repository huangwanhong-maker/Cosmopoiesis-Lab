// The fields of the world, drawn (decision 0007; formalism §3.6; the infrastructure's ADR 0053).
//
// The engine holds the world's fields (fields.hpp: physis's fields of the domains' models, each with its
// descriptor) and reads them on samplings and along their integral curves. Each drawing is a visual
// expression of the shared scene model (visualization/scene): a restriction, a reduction and a mark,
// checked by the formalism's rules before it is drawn; the shared styles colour it, and the shared
// renderers make its image, its segments and its three.js objects. What the world draws:
//
//   the Earth's field lines   earth.magnetic.core through 48 seeds, coloured by |B| along them;
//   the Moon's crust          moon.magnetic.crust, or moon.magnetic with its unresolved scales, on its
//                             ground: |B| or B_r, clear where the crust is weakly magnetised;
//   a shell about the Earth   a field of the Earth on the sphere of 6371.2 km at a height: WMM2025's |B|
//                             at 400 km shows the South Atlantic Anomaly, normal gravity its latitude.

import * as THREE from 'three';
import { engine } from './api.js';
import { ttText } from './format.js';
import { canvasOf, fieldMarks, renderers, scene } from '../../../visualization/js/index.js';

const { express, float32Of, legendOf, quantityText, samplesOf, scalarOf, scaleOf, curvesOf } = scene;
const { colouring, curveSegments, drapeImage } = renderers;

const marks = fieldMarks(THREE);
export const float32 = float32Of;

// The floor of the Moon's map: a nanotesla, below which the crust's field is drawn clear.
export const FIELD_FLOOR_T = 1e-9;
// The reference spheres of the bodies' fields: T2015_449's of the Moon, WMM2025's of the Earth.
const MOON_SPHERE_M = 1737.4e3, EARTH_SPHERE_M = 6371.2e3;

// The world's fields, as the engine describes them, read once.
let catalogue = null;
export async function worldFields() {
  if (!catalogue) catalogue = (await engine({ op: 'fields' })).fields;
  return catalogue;
}
async function fieldNamed(name) {
  const f = (await worldFields()).find((x) => x.name === name);
  if (!f) throw new Error(`the world has no field ${name}`);
  if (!f.available) throw new Error(f.missing);
  return f;
}

// The legend of a drawing as HTML: its bar between its end ticks, what it shows and on what scale.
export function fieldLegend(legend) {
  const ticks = legend.ticks;
  const lo = ticks[0]?.label ?? '', hi = ticks[ticks.length - 1]?.label ?? '';
  const floor = legend.scale?.floor ? quantityText(legend.scale.floor, legend.fibreUnit) : null;
  const how = legend.scale?.kind === 'log' ? `logarithmic${floor ? `, clear below ${floor}` : ''}`
    : legend.scale?.kind === 'diverging' ? `diverging about ${quantityText(legend.scale.centre, legend.fibreUnit)} at the middle${floor ? `, logarithmic in its size from ${floor} each way` : ''}` : 'linear';
  const frame = legend.frame ? `, on ${legend.frame}'s axes` : '';
  return `<span>${lo} <i class="ramp" style="background:${legend.map.gradient}"></i> ${hi}<small> ${legend.shows}${frame}, ${how}</small></span>`;
}

// ---- the Moon's crust on its ground -----------------------------------------------------------------

// The crust's field as a layer of the globe's tiles (the whole map, as the bodies' maps are: its two
// halves the two tiles of level 0), with its title, credit and legend.
export async function moonFieldMap({ quantity = 'total', synthetic = false, step_deg = 0.5, height_m = 0 } = {}) {
  const name = synthetic ? 'moon.magnetic' : 'moon.magnetic.crust';
  const field = await fieldNamed(name);
  const nlat = Math.round(180 / step_deg), nlon = 2 * nlat;
  const radial = quantity === 'radial';
  const sampling = { kind: 'sphere', centre: [0, 0, 0], radius_m: MOON_SPHERE_M + height_m, nlat, nlon };
  const expression = express(field, sampling, radial
    ? { reduction: { kind: 'radial' }, map: 'orchid-gold', floor: FIELD_FLOOR_T, opacity: 'rising' }
    : { reduction: { kind: 'magnitude' }, map: 'gold', scale: 'log', floor: FIELD_FLOOR_T, opacity: 'rising' });
  const answer = await engine({ op: 'field.sample', field: name, sampling, reduce: expression.reduction.kind, encoding: 'f32' });
  const samples = samplesOf(answer);
  const values = scalarOf(samples);
  const top = answer.range ? Math.max(Math.abs(answer.range.min), Math.abs(answer.range.max)) : FIELD_FLOOR_T;
  const scale = radial ? scaleOf(values, { kind: 'diverging', centre: 0, floor: FIELD_FLOOR_T }) : scaleOf(values, { kind: 'log', domain: [FIELD_FLOOR_T, top], floor: FIELD_FLOOR_T });
  const canvas = canvasOf(drapeImage(values, answer.sampling, colouring(expression, scale, { alpha: 0.92 })));
  const id = `moon-field-${quantity}-${synthetic ? 'synthetic' : 'model'}-${step_deg}`;
  const title = `The Moon's crustal field, ${radial ? 'its radial component' : '|B|'} at the surface`;
  const credit = synthetic ? `${field.source}` : field.source;
  const half = canvas.width / 2;
  const legend = { ...legendOf(expression, scale, samples), quantity, top, floor: FIELD_FLOOR_T, field: field.name, law: field.law || null };
  return {
    id, title, credit,
    layer: {
      id, maxLevel: 0, service: { body: 'moon', title, credit, kind: 'map' },
      load: async (z, x) => (z === 0 ? createImageBitmap(canvas, x * half, 0, half, canvas.height, { imageOrientation: 'flipY' }) : null),
    },
    legend,
  };
}

// ---- the Earth's field lines --------------------------------------------------------------------------

// Seeds 100 km above WMM's reference sphere at ±30°, ±50° and ±65° of latitude, every 45° of longitude.
function lineSeeds() {
  const seeds = [], r0 = EARTH_SPHERE_M + 100e3;
  for (const latd of [-65, -50, -30, 30, 50, 65]) for (let k = 0; k < 8; k++) {
    const lat = (latd * Math.PI) / 180, lon = (k * Math.PI) / 4;
    seeds.push([r0 * Math.cos(lat) * Math.cos(lon), r0 * Math.cos(lat) * Math.sin(lon), r0 * Math.sin(lat)]);
  }
  return seeds;
}

// The lines at an instant (TT seconds), in the Earth's fixed frame (ITRS), coloured by |B| along them on
// a logarithmic scale: bright where the field is strong, near the ground, fading outward.
export async function earthFieldLines(tt, { maxRadius = 6 } = {}) {
  const field = await fieldNamed('earth.magnetic.core');
  const restriction = { kind: 'curves', seeds: lineSeeds(), within: { inner_m: EARTH_SPHERE_M, outer_m: maxRadius * EARTH_SPHERE_M } };
  const expression = express(field, restriction, { map: 'plum', scale: 'log' });
  const answer = await engine({ op: 'field.curves', field: field.name, time: ttText(tt), seeds: restriction.seeds, within: restriction.within, encoding: 'f32' });
  const curves = curvesOf(answer);
  const all = Float32Array.from(curves.flatMap((c) => [...c.magnitude]));
  const scale = scaleOf(all, { kind: 'log' });
  const night = document.documentElement.dataset.theme !== 'day';
  const seg = curveSegments(curves, colouring(expression, scale, { alpha: 0.85, range: night ? [0.3, 1] : [0, 0.75] }));
  return {
    object: marks.lines(seg.positions, seg.colours, { opacity: 0.9 }),
    count: curves.filter((c) => c.seeded).length,
    utc: answer.time?.utc || null,
    model: field.title, caveat: field.base.about,
    legend: legendOf(expression, scale),
  };
}

// ---- a field on a sphere about the Earth -------------------------------------------------------------

// The fields a shell about the Earth may show: every available field on the ITRS.
export async function shellFields() {
  return (await worldFields()).filter((f) => f.available && f.frame === 'ITRS');
}

// A field of the Earth on the sphere of WMM's reference radius raised by `height_m`, as a translucent
// shell: a vector's magnitude or radial part, a scalar as it is.
export async function earthShell(name, { height_m = 400e3, reduction = 'magnitude', tt = 0, step_deg = 1, opacity = 0.7 } = {}) {
  const field = await fieldNamed(name);
  const vector = field.fibre.kind === 'vector';
  const nlat = Math.round(180 / step_deg), nlon = 2 * nlat;
  const sampling = { kind: 'sphere', centre: [0, 0, 0], radius_m: EARTH_SPHERE_M + height_m, nlat, nlon };
  const kind = vector ? reduction : 'none';
  const expression = express(field, sampling, { reduction: { kind }, map: kind === 'radial' ? 'lavender-rust' : 'plum' });
  const request = { op: 'field.sample', field: name, sampling, reduce: kind, encoding: 'f32' };
  if (field.time !== 'none') request.time = ttText(tt);
  const answer = await engine(request);
  const samples = samplesOf(answer);
  const values = scalarOf(samples);
  const scale = scaleOf(values, kind === 'radial' ? { kind: 'diverging', centre: 0 } : { kind: 'linear' });
  if (!scale) throw new Error(`${field.title} has no value on that sphere: ${samples.reasons.map((r) => r.text).join('; ')}`);
  // On a night ground the darkest part of a sequential map is left out, by day its palest (styles' within).
  const night = document.documentElement.dataset.theme !== 'day';
  const range = kind === 'radial' ? null : night ? [0.25, 1] : [0, 0.8];
  const canvas = canvasOf(drapeImage(values, answer.sampling, colouring(expression, scale, { alpha: 1, range })));
  return {
    object: marks.sphereDrape(canvas, sampling.radius_m, { opacity }),
    legend: legendOf(expression, scale, samples),
    field, height_m, expression,
  };
}

// ---- the layers' state ----------------------------------------------------------------------------------

// The field layers' state, shared by LAYERS and the loop: the lines and a timed shell are drawn again when
// the world's instant moves by more than a month (the secular variation), the map when its quantity changes.
export class FieldLayers {
  constructor(app) {
    this.app = app;
    this.linesAt = null;
    this.lines = null;
    this.map = null;
    this.shell = null;
    this.shellAt = null;
    this.busy = false;
  }

  async setLines(on) {
    const { scene, clock } = this.app;
    scene.options.fieldLines = on;
    if (!on) { scene.setObject('field-lines', null, null, null); this.linesAt = null; return null; }
    const tt = clock.now();
    const lines = await earthFieldLines(tt);
    if (!scene.options.fieldLines) return null;
    scene.setObject('field-lines', 'earth', [0, 0, 0], lines.object, { group: 'fieldLines' });
    this.linesAt = tt;
    this.lines = lines;
    return lines;
  }

  async setShell(spec) {
    const { scene, clock } = this.app;
    scene.options.fieldShell = spec || null;
    if (!spec) { scene.setObject('field-shell', null, null, null); this.shell = null; this.shellAt = null; return null; }
    const tt = clock.now();
    const shell = await earthShell(spec.field, { ...spec, tt });
    if (scene.options.fieldShell !== spec) return null;
    scene.setObject('field-shell', 'earth', [0, 0, 0], shell.object, { group: 'fieldShell' });
    this.shell = shell;
    this.shellAt = shell.field.time !== 'none' ? tt : null;
    return shell;
  }

  tick(tt) {
    if (this.busy) return;
    const stale = (at) => at !== null && Math.abs(tt - at) >= 30 * 86400;
    const lines = this.app.scene.options.fieldLines && stale(this.linesAt);
    const shell = this.app.scene.options.fieldShell && stale(this.shellAt);
    if (!lines && !shell) return;
    this.busy = true;
    Promise.all([lines ? this.setLines(true) : null, shell ? this.setShell(this.app.scene.options.fieldShell) : null])
      .catch(() => {}).finally(() => { this.busy = false; });
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
