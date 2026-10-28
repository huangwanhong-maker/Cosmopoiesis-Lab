// The server's interface (serve.py; README §5): the engine's answers, the mission clock, the bus of
// readings, the acquisition session, the terrain's state, the maps of the bodies, the recipe.

async function asJson(r) {
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${r.status}: ${text.slice(0, 200)}`); }
  if (!r.ok || body.error) {
    const e = new Error(body.error || body.message || `HTTP ${r.status}`);
    e.body = body;
    throw e;
  }
  return body;
}

const TOKEN_KEY = 'science-token';
export function authHeaders() {
  let t = '';
  try { t = sessionStorage.getItem(TOKEN_KEY) || ''; } catch { /* no storage */ }
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const post = (url, body, signal) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body), signal });

// A request to the engine: { op: 'time' | 'bodies' | 'address' | 'frames' | 'transform' | 'holonomy' | 'status' | … }.
export async function engine(request, { signal } = {}) {
  return asJson(await post('api/engine', request, signal));
}
export const engineState = async () => asJson(await fetch('api/engine', { cache: 'no-store' }));
export const terrainState = async () => asJson(await fetch('api/terrain', { cache: 'no-store' }));
export const places = async (body) => asJson(await fetch(`data/products/places/${body}.json`));
export const maps = async () => asJson(await fetch('api/maps', { cache: 'no-store' }));
export const satelliteGroups = async () => asJson(await fetch('api/satellites', { cache: 'no-store' }));

// The mission clock.
export const clockState = async () => asJson(await fetch('api/clock', { cache: 'no-store' }));
export const clockCommand = async (body) => asJson(await post('api/clock', body));

// The bus of readings, and the acquisition.
export const bus = async (since, wait = 0, signal) => asJson(await fetch(`api/bus?since=${since}&wait=${wait}`, { cache: 'no-store', signal }));
export const busLatest = async () => asJson(await fetch('api/bus/latest', { cache: 'no-store' }));
export const acquisition = async () => asJson(await fetch('api/acquisition', { cache: 'no-store' }));
export const acquire = async (body) => asJson(await post('api/acquisition', body));
export const trace = async (since) => asJson(await fetch(`api/acquisition/trace?since=${since}`, { cache: 'no-store' }));
export const analyse = async (body) => asJson(await post('api/acquisition/analyse', body));
export const instruments = async () => asJson(await fetch('api/instruments', { cache: 'no-store' }));

// The address of a terrain tile.
export const terrainUrl = (body, z, x, y, { synthetic = false } = {}) =>
  `${location.origin}/tiles/terrain/${body}/${z}/${x}/${y}${synthetic ? '?synthetic=1' : ''}`;
