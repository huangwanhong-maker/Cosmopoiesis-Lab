// The mission's arithmetic for the page (decision 0008): what the ROVER page draws from the engine's
// answers (engine/mission.hpp), without the DOM, so that it can be checked.
//
// The map is the engine's grid of nodes, rows by latitude from north and each row by longitude from west,
// spanning its square about the site exactly; a pixel's value is the bilinear interpolation of the four
// nodes about it, so that the picture is the grid's own continuous reading, not a stretched image of it.
// Places are drawn in the grid's latitude and longitude, which over a few kilometres is the local east and
// north to 10⁻⁶ of the distance.

// What the map can show: the engine's array, its colour map, whether the truth must be revealed for it,
// and the group whose quantities share one scale (so that the posterior, the prior and the truth can be set
// against each other).
export const QUANTITIES = [
  { key: 'mean', label: 'Posterior |B|', values: 'mean_total_nT', map: 'orchid', group: 'B', unit: 'nT' },
  { key: 'sd', label: 'Uncertainty (sd of |B|)', values: 'sd_total_nT', map: 'gold', group: 'sd', unit: 'nT' },
  { key: 'prior', label: 'Prior (T2015_449)', values: 'prior_total_nT', map: 'orchid', group: 'B', unit: 'nT' },
  { key: 'truth', label: 'Truth |B|', values: 'truth_total_nT', map: 'orchid', group: 'B', unit: 'nT', reveal: true },
  { key: 'error', label: 'Error of |B|', values: 'error_total_nT', map: 'lavender-rust', group: 'error', unit: 'nT', reveal: true, centre: 0 },
  { key: 'z', label: 'z of B down', values: 'z_down', map: 'lavender-rust', group: 'z', unit: '', reveal: true, centre: 0, domain: [-3, 3] },
];
export const quantityOf = (key) => QUANTITIES.find((q) => q.key === key) || QUANTITIES[0];

// The range shared by a quantity's group in a map: the union of its members' finite values.
export function groupRange(map, quantity) {
  if (quantity.domain) return quantity.domain;
  let lo = Infinity, hi = -Infinity;
  for (const q of QUANTITIES) {
    if (q.group !== quantity.group || !Array.isArray(map[q.values])) continue;
    for (const v of map[q.values]) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  if (!(hi >= lo)) return null;
  if (quantity.centre !== undefined) { const m = Math.max(Math.abs(lo - quantity.centre), Math.abs(hi - quantity.centre)) || 1; return [quantity.centre - m, quantity.centre + m]; }
  return hi > lo ? [lo, hi] : [lo - 1, hi + 1];
}

// The pixel (x, y) of a place in a W × H picture of the map, and back.
export function project(map, lat, lon, W, H) {
  const n = map.lat_deg[0], s = map.lat_deg[map.lat_deg.length - 1], w = map.lon_deg[0], e = map.lon_deg[map.lon_deg.length - 1];
  return [((lon - w) / (e - w)) * W, ((n - lat) / (n - s)) * H];
}
export function unproject(map, x, y, W, H) {
  const n = map.lat_deg[0], s = map.lat_deg[map.lat_deg.length - 1], w = map.lon_deg[0], e = map.lon_deg[map.lon_deg.length - 1];
  return [n - (y / H) * (n - s), w + (x / W) * (e - w)];
}

// The bilinear value at a pixel's centre: the grid spans the picture exactly, its first and last nodes on
// the picture's edges.
export function valueAt(map, values, x, y, W, H) {
  const k = map.n;
  const gx = Math.min(k - 1, Math.max(0, (x / W) * (k - 1))), gy = Math.min(k - 1, Math.max(0, (y / H) * (k - 1)));
  const i = Math.min(k - 2, Math.floor(gy)), j = Math.min(k - 2, Math.floor(gx));
  const fy = gy - i, fx = gx - j;
  const at = (a, b) => values[a * k + b];
  return (1 - fy) * ((1 - fx) * at(i, j) + fx * at(i, j + 1)) + fy * ((1 - fx) * at(i + 1, j) + fx * at(i + 1, j + 1));
}

// The picture: RGBA bytes of W × H pixels, each the colour of the bilinear value at its centre.
export function rasterise(map, values, colour, u, W, H) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = valueAt(map, values, x + 0.5, y + 0.5, W, H);
      const o = (y * W + x) * 4;
      if (!Number.isFinite(v)) { out[o + 3] = 0; continue; }
      const c = colour(u(v));
      out[o] = Math.round(c[0] * 255), out[o + 1] = Math.round(c[1] * 255), out[o + 2] = Math.round(c[2] * 255), out[o + 3] = 255;
    }
  }
  return out;
}

// East and north of a place from the map's centre, metres, on a sphere of radius R.
export function offsetMetres(map, lat, lon, R = 1737.4e3) {
  const k = map.lat_deg.length;
  const lat0 = (map.lat_deg[0] + map.lat_deg[k - 1]) / 2, lon0 = (map.lon_deg[0] + map.lon_deg[k - 1]) / 2;
  const d = Math.PI / 180;
  return [(lon - lon0) * d * R * Math.cos(lat0 * d), (lat - lat0) * d * R];
}

// The mission as the page keeps it: the engine's latest state, and its track and readings gathered from the
// increments each step returns (the engine sends those from the indices the page has).
export function emptyMission() { return { state: null, track: [], readings: [] }; }
export function merge(local, answer) {
  if (!answer || answer.error) return local;
  const fresh = !local.state || answer.track_total < local.track.length || answer.readings_total < local.readings.length;
  const track = fresh ? [] : local.track.slice(), readings = fresh ? [] : local.readings.slice();
  for (const p of answer.track || []) track.push(p);
  for (const r of answer.readings || []) readings.push(r);
  // Complete when the engine's counts are met; not when its mission was replaced while the page asked for
  // increments (another viewer started one): the page then asks for the whole state.
  const complete = track.length === answer.track_total && readings.length === answer.readings_total;
  return { state: answer, track, readings, complete };
}

// The band within which the whitened innovations' mean square falls with 95 % probability when the model is
// the truth: n independent χ²₁ draws over n, mean 1 and standard deviation √(2/n).
export function whitenedBand(n) {
  if (!(n > 0)) return null;
  const s = Math.sqrt(2 / n);
  return [1 - 1.96 * s, 1 + 1.96 * s];
}
