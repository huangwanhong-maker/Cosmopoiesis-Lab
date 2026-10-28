// The maps of the bodies, the rings and the sky, as the data library's imagery products give them
// (data/products: imagery/1 records of the solar-system-maps dataset, Solar System Scope, CC BY 4.0,
// with NASA Trek's tile services for the Moon, Mars and Mercury at close range).

const BASE = 'data/products';

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

// { bodies: { key: { url, title, credit, live } }, rings: { url, radii_km, credit }, sky: { url, southUp, credit } }
export async function loadMaps() {
  const out = { bodies: {}, rings: null, sky: null };
  let index;
  try { index = await json(`${BASE}/index.json`); } catch { return out; }
  await Promise.all((index.imagery || []).map(async (e) => {
    if (!['body', 'rings', 'sky'].includes(e.role)) return;
    try {
      const m = await json(`${BASE}/${e.file}`);
      const credit = m.source?.credit || '';
      const url = `${BASE}/${m.file}`;
      if (e.role === 'body' && m.body) {
        out.bodies[m.body] = { url, title: m.title, credit, body: m.body,
          live: m.live ? { template: m.live.template, levels: m.live.levels, credit: m.live.credit || 'NASA Trek' } : null };
      } else if (e.role === 'rings') {
        out.rings = { url, radii_km: m.radii_km, credit };
      } else if (e.role === 'sky') {
        out.sky = { url, southUp: /south galactic pole at the top/.test(m.projection || ''), credit };
      }
    } catch { /* a missing product leaves its body plain */ }
  }));
  return out;
}

export async function loadImage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return createImageBitmap(await r.blob(), { imageOrientation: 'flipY' });
}
