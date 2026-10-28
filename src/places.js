// Finding a place: by its name in the gazetteer (data/products/place_names.py) or by coordinates.

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export class Gazetteer {
  constructor() { this.entries = []; }

  add(body, product) {
    for (const [name, lon, lat, kind, detail, size, link] of product.places) {
      this.entries.push({ body, name, key: fold(name), lon, lat, kind, detail, size, link, rank: this.entries.length });
    }
  }

  // The best matches of a text: the names that begin with it, then those that contain it; the body
  // in view first.
  search(text, body, limit = 12) {
    const q = fold(text.trim());
    if (q.length < 2) return [];
    const out = [];
    for (const e of this.entries) {
      const at = e.key.indexOf(q);
      if (at < 0) continue;
      const score = (at === 0 ? 0 : at > 0 && e.key[at - 1] === ' ' ? 1 : 2) + (e.body === body ? 0 : 3);
      out.push([score, e.rank, e]);
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out.slice(0, limit).map((x) => x[2]);
  }
}

// Coordinates in a text: "48.86 N 2.35 E", "48°51′N 2°21′E", "48.86, 2.35" (latitude first), or
// "lat=… lon=…"; degrees, east and north positive. Null when the text is not coordinates.
export function parseCoordinates(text) {
  const t = text.trim().replace(/[°º]/g, ' d ').replace(/[′']/g, ' m ').replace(/[″"]/g, ' s ').replace(/,/g, ' ');
  const tokens = t.split(/\s+/).filter(Boolean);
  const values = [];
  let cur = null;
  const push = () => { if (cur) { values.push(cur); cur = null; } };
  for (const tok of tokens) {
    const hemi = /^[NSEWnsew]$/.test(tok) ? tok.toUpperCase() : null;
    const m = tok.match(/^([+-]?\d+(?:\.\d+)?)([NSEWnsew])?$/);
    if (m) {
      if (cur && (cur.unit === null || cur.unit === 's')) push();
      if (!cur) cur = { deg: Number(m[1]), sign: Math.sign(Number(m[1])) || 1, unit: null, hemi: null };
      else if (cur.unit === 'd') { cur.deg += Math.abs(Number(m[1])) / 60 * cur.sign; cur.unit = 'm'; }
      else if (cur.unit === 'm') { cur.deg += Math.abs(Number(m[1])) / 3600 * cur.sign; cur.unit = 's'; }
      if (m[2]) { cur.hemi = m[2].toUpperCase(); push(); }
      continue;
    }
    if (tok === 'd' || tok === 'm' || tok === 's') { if (cur) cur.unit = tok; continue; }
    if (hemi && cur) { cur.hemi = hemi; push(); continue; }
    if (/^(lat|latitude|lon|long|longitude)=?/i.test(tok)) continue;
    return null;
  }
  push();
  if (values.length !== 2) return null;
  let lat = null, lon = null;
  for (const v of values) {
    const x = v.hemi === 'S' || v.hemi === 'W' ? -Math.abs(v.deg) : v.deg;
    if (v.hemi === 'N' || v.hemi === 'S') lat = x;
    else if (v.hemi === 'E' || v.hemi === 'W') lon = x;
  }
  if (lat === null && lon === null) [lat, lon] = values.map((v) => v.deg);
  else if (lat === null) lat = values.find((v) => !v.hemi || v.hemi === 'N' || v.hemi === 'S').deg;
  else if (lon === null) lon = values.find((v) => !v.hemi || v.hemi === 'E' || v.hemi === 'W').deg;
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 360)) return null;
  if (lon > 180) lon -= 360;
  return { lat, lon };
}
