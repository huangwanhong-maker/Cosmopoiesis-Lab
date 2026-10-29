// Checks of what is Cosmopoiesis's own: the console's formats of numbers, angles and times; its view of
// the mission clock (extrapolated from the server's answers, with the offset of the server's wall
// estimated from the round trip); its search (coordinates in their usual forms, names in the
// gazetteer); the world's windows of the bodies' motion, interpolated as the engine sampled them; the
// navigator's ranges; its recipe (every step a dataset or a script that exists); and, when the engine
// is built and the ephemeris is in the cache, the engine's answers held to the protocol of the README
// (§5) and to SOFA's examples and the bodies' known motions: TT − UTC of 2006-01-15 (65.184 s), the
// frames' tree and its paths, the bodies of DE440, a transform and its inverse, the holonomy of the
// catalogue's loops (the equinox route within a milliarcsecond), addresses read, printed and carried
// between charts and back, the instruments' kernels; and the server's runtime and an acquisition
// session in the engine (tests/check_runtime.py: the mission clock's time scales and commands, the
// bus, releases and skips, the instruments' readings, a session's determinism, the policies); and the
// world's fields (decision 0007): their catalogue, a field read on a sampling and its curves, held to
// NOAA's test values, the old operations' answers, the field equations and a family's own cube; and a
// mission (decision 0008): the page's arithmetic of its map, and the engine's rover surveying the Moon's
// crust at both fidelities and by both plans, the truth hidden until revealed, and the knowledge's
// calibration over many truths.
// The science itself is checked by the domains metrology, geodesy, astronomy, geophysics,
// meteorology and navigation and by physis and calx; the drawing by the shared visualization layer.
// Run from the repository root:  node applications/cosmopoiesis-lab/tests/run-tests.mjs

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { suite, ROOT, CACHE } from '../../../development/tools/checks.mjs';
import { ttFromJd, ttText, mjdOfTt, utcIso, hms, dms, length, duration, rateText, J2000, DAY, AU, PARSEC } from '../src/format.js';
import { MissionClock } from '../src/clock.js';
import { Gazetteer, parseCoordinates } from '../src/places.js';
import { WorldMotion } from '../src/world.js';
import { maxRangeOf, DEFAULT_VIEWS } from '../src/navigator.js';
import { provenanceClass } from '../src/busclient.js';
import { arrowsGeometry, cellOffset, cellPosition, centreValue, colourOf, gradientOf, groundGeometry, scaleOf, visibleCells } from '../src/volume.js';
import { primary } from '../src/readings.js';
import { nearestPlace } from '../src/pages/point.js';
import { analysisHtml } from '../src/pages/sched.js';
import { QUANTITIES, emptyMission, groupRange, merge, offsetMetres, project, rasterise, unproject, valueAt, whitenedBand } from '../src/mission.js';

const { assert, check, skip, done } = suite();
const APP = resolve(ROOT, 'applications/cosmopoiesis-lab');

// ---- the console's formats -----------------------------------------------------------------------------
check('format: J2000.0 is TT second 0', ttFromJd([2451545.0, 0]), 0, 's');
check('format: a day after J2000.0, as a two-part date', ttFromJd([2451545.5, 0.5]) - DAY, 0, 's');
const text = ttText(1e9);
check('format: an instant written as "JD … TT" reads back to 0.1 ms', Math.abs((Number(text.split(' ')[1]) - J2000) * DAY - 1e9), 1e-4, 's');
assert('format: the engine is named the scale', text.endsWith(' TT'));
check('format: MJD of J2000.0 is 51544.5', mjdOfTt(0) - 51544.5, 0);
assert('format: J2000.0 is 11:58:55 UTC (TT − UTC = 64.184 s in 2000)', utcIso(0, 64.184) === '2000-01-01 11:58:55', utcIso(0, 64.184));
assert('format: six hours of right ascension', hms(Math.PI / 2) === '06ʰ 00ᵐ 00.000ˢ', hms(Math.PI / 2));
assert('format: −43.31° in degrees, minutes and seconds', dms(-43.31) === '-43° 18′ 36.00″', dms(-43.31));
assert('format: a length in the unit of its size: m, km, au, pc, kpc',
  [length(91), length(6.371e6), length(AU), length(4.2 * PARSEC), length(8.122e3 * PARSEC)].map((x) => x.split(' ').pop()).join() === 'm,km,au,pc,kpc');
assert('format: durations and rates in words', duration(0.0025) === '2.50 ms' && duration(7200) === '2.0 h' && rateText(1) === 'real time' && rateText(-86400) === '−1 d per second' && rateText(60, false) === 'held',
  [duration(0.0025), duration(7200), rateText(-86400)].join(' | '));

// ---- the page's view of the mission clock ----------------------------------------------------------------
{
  const c = new MissionClock();
  const wall = Date.now() / 1000;
  // An answer that left the server 0.3 s after the page's clock says it did: the offset is the
  // server's wall less the midpoint of the request and the answer (RFC 4330 §5).
  c.adopt({ tt_s: 1000, wall: wall + 0.3, rate: 3600, running: true, present_tt_s: 1000 }, wall - 0.05, wall + 0.05);
  // Unix seconds near 1.8e9 are spaced by 2.4e-7 s in doubles: a microsecond is the precision here.
  check('clock: the server\'s wall is estimated from the round trip', c.offset - 0.3, 1e-6, 's');
  check('clock: the round trip is measured', c.roundTrip - 0.1, 1e-6, 's');
  const t = c.now();
  check('clock: at 1 h/s it extrapolates the server\'s instant', t - 1000 - 3600 * (Date.now() / 1000 + c.offset - (wall + 0.3)), 5, 's');
  let heard = null;
  c.on((what) => { heard = what; });
  c.adopt({ tt_s: 5e8, wall: wall + 0.3, rate: 3600, running: false, present_tt_s: 1000 });
  assert('clock: a jump of the instant is heard as a setting', heard === 'set');
  check('clock: paused, it stands', c.now() - 5e8, 0, 's');
}

// ---- coordinates and names --------------------------------------------------------------------------------
const cases = [
  ['48.8566 N 2.3522 E', 48.8566, 2.3522], ['48°51′24″N 2°21′08″E', 48 + 51 / 60 + 24 / 3600, 2 + 21 / 60 + 8 / 3600],
  ['48.8566, 2.3522', 48.8566, 2.3522], ['-43.31 -11.36', -43.31, -11.36], ['43.31S 11.36W', -43.31, -11.36],
  ['2.3522 E 48.8566 N', 48.8566, 2.3522], ['10 N 350', 10, -10],
];
for (const [t, lat, lon] of cases) {
  const c = parseCoordinates(t);
  check(`places: "${t}" is ${lat.toFixed(4)}, ${lon.toFixed(4)}`, c ? Math.hypot(c.lat - lat, c.lon - lon) : 1, 1e-9, 'deg');
}
for (const t of ['Tycho', '12 34 56', '95 N 10 E', '']) assert(`places: "${t}" is not coordinates`, parseCoordinates(t) === null);
{
  const g = new Gazetteer();
  g.add('moon', { places: [['Tycho', -11.36, -43.31, 'Crater', '', 85.3, ''], ['Tycho A', -12.0, -39.9, 'Crater', '', 29, ''], ['Statio Tranquillitatis', 23.47, 0.67, 'Statio', '', 0.01, '']] });
  g.add('earth', { places: [['Paris', 2.35, 48.86, 'Admin-0 capital', 'France', null, null], ['Sao Tome', 6.73, 0.34, 'Admin-0 capital', 'Sao Tome and Principe', null, null]] });
  assert('places: a name is found by its beginning, the body in view first', g.search('tyc', 'moon').map((p) => p.name).join() === 'Tycho,Tycho A');
  assert('places: accents and case do not matter', g.search('SÃO', 'earth')[0]?.name === 'Sao Tome');
  assert('places: a word inside a name is found', g.search('tranq', 'earth')[0]?.name === 'Statio Tranquillitatis');
}
const placesProduct = resolve(CACHE, 'products/places/moon.json');
if (existsSync(placesProduct)) {
  const moon = JSON.parse(readFileSync(placesProduct, 'utf8'));
  const tycho = moon.places.find((p) => p[0] === 'Tycho');
  // The gazetteer's Tycho: 43.30 S, 11.22 W (USGS Astrogeology, feature 6163).
  assert('places: the gazetteer gives Tycho near 43.3 S, 11.2 W', tycho && Math.abs(tycho[2] + 43.3) < 0.05 && Math.abs(tycho[1] + 11.22) < 0.05, JSON.stringify(tycho));
  assert('places: the Moon\'s names are the IAU\'s adopted ones, largest first', moon.places.length > 8000 && moon.places[0][5] >= moon.places[1][5]);
} else skip('places: the gazetteer of the Moon is not built (python data/products/place_names.py)');

// ---- a window of the bodies' motion --------------------------------------------------------------------------------
{
  // A synthetic answer of {op: "bodies"}: the Earth turning at about its rate, the Moon on a circle
  // about the barycentre, the Sun fixed.
  const w = 7.292115e-5, n = 145, step = 600;
  const t = Array.from({ length: n }, (_, i) => i * step);
  const q = (a) => [Math.cos(a / 2), 0, 0, Math.sin(a / 2)];
  const W = 2.6617e-6, r = 3.844e8;
  const body = (key, position, velocity, rotation) => ({ key, name: key, radius_m: 1, equatorial_radius_m: 1, gm_m3_s2: 1, fixed_frame: key.toUpperCase(), inertial_frame: key.toUpperCase(), figure: '', position, velocity, rotation });
  const answer = {
    start: { scales: { TT: { jd: [2461341.5, 0.25] } } }, step, t,
    bodies: [
      body('earth', t.map(() => [0, 0, 0]), t.map(() => [0, 0, 0]), t.map((s) => q(1.0 + w * s))),
      body('moon', t.map((s) => [r * Math.cos(W * s), r * Math.sin(W * s), 0]), t.map((s) => [-r * W * Math.sin(W * s), r * W * Math.cos(W * s), 0]), t.map((s) => q(W * s))),
      body('sun', t.map(() => [1.496e11, 0, 0]), t.map(() => [0, 0, 0]), t.map(() => [1, 0, 0, 0])),
    ],
  };
  const world = new WorldMotion();
  world.window = world.build(answer);
  const t0 = ttFromJd([2461341.5, 0.25]);
  const at = world.at(t0 + 12345.6);
  const a = 1.0 + w * 12345.6;
  check('world: the Earth\'s rotation between samples, its spin factored out', Math.abs(at.earth.rotation[1][0] - Math.sin(a)) + Math.abs(at.earth.rotation[0][0] - Math.cos(a)), 1e-11);
  const m = at.moon.position, s = W * 12345.6;
  check('world: the Moon between samples (Hermite), on its circle', Math.hypot(m[0] - r * Math.cos(s), m[1] - r * Math.sin(s)), 0.5, 'm');
  assert('world: an instant inside the window is said to be', at.inside && !world.at(t0 - 10).inside);
  assert('world: the bodies\' facts are kept by key', world.info.get('moon')?.fixedFrame === 'MOON' && world.info.size === 3);
}

// ---- the mission's map, as the page reads it (src/mission.js) ---------------------------------------------------
{
  // A grid of 5 × 5 nodes about 7.5 N, 59 W, a linear field on it: bilinear reading is exact for it.
  const n = 5, lat = [7.52, 7.51, 7.5, 7.49, 7.48], lon = [-59.02, -59.01, -59.0, -58.99, -58.98];
  const f = (la, lo) => 3 * la - 2 * lo + 1;
  const values = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) values.push(f(lat[i], lon[j]));
  const map = { n, half_m: 600, lat_deg: lat, lon_deg: lon, mean_total_nT: values, prior_total_nT: values.map((v) => v + 1), truth_total_nT: values.map((v) => v - 2) };
  const [x, y] = project(map, 7.503, -59.007, 200, 200);
  const [la, lo] = unproject(map, x, y, 200, 200);
  check('mission map: a place projected onto the picture and back', Math.abs(la - 7.503) + Math.abs(lo + 59.007), 1e-12, '°');
  let worst = 0;
  for (const [px, py] of [[0, 0], [200, 200], [37.3, 151.9], [100, 100]]) {
    const [pla, plo] = unproject(map, px, py, 200, 200);
    worst = Math.max(worst, Math.abs(valueAt(map, values, px, py, 200, 200) - f(pla, plo)));
  }
  check('mission map: the bilinear reading of a linear field is the field (at corners and between nodes)', worst, 1e-9);
  const rgba = rasterise(map, values, (u) => [u, u, u], (v) => (v - 140) / 10, 16, 16);
  assert('mission map: a picture of 16 × 16 pixels, every pixel coloured', rgba.length === 16 * 16 * 4 && rgba.every((c, i) => i % 4 !== 3 || c === 255));
  const r = groupRange(map, QUANTITIES.find((q) => q.key === 'mean'));
  assert('mission map: the posterior, the prior and the truth share one scale, their union', r[0] === Math.min(...values) - 2 && r[1] === Math.max(...values) + 1, JSON.stringify(r));
  const [e, nn] = offsetMetres(map, 7.5, -59.0 + 0.01);
  check('mission map: east of the centre by 0.01° of longitude at 7.5 N', Math.abs(e - 0.01 * Math.PI / 180 * 1737.4e3 * Math.cos(7.5 * Math.PI / 180)) + Math.abs(nn), 1e-9, 'm');
  let m = merge(emptyMission(), { track: [[1, 1], [1, 2]], track_total: 2, readings: [{ t_s: 0 }], readings_total: 1 });
  m = merge(m, { track: [[1, 3]], track_total: 3, readings: [], readings_total: 1 });
  assert('mission: increments are gathered in order, and the whole is complete', m.track.length === 3 && m.track[2][1] === 3 && m.readings.length === 1 && m.complete);
  const gap = merge(m, { track: [[9, 9]], track_total: 40, readings: [], readings_total: 7 });
  assert('mission: increments of another mission are not spliced in: the page asks for the whole', gap.complete === false);
  const band = whitenedBand(200);
  check('mission: the innovations\' band is 1 ± 1.96 √(2/n)', Math.abs(band[1] - 1 - 1.96 * 0.1), 1e-12);
}

// ---- the navigator and the provenance of readings ---------------------------------------------------------------
assert('navigator: the system\'s view holds Neptune\'s orbit, and the Sun in focus may stand back to 400 au',
  DEFAULT_VIEWS.sun.range > 60 * AU && maxRangeOf('sun', { a: 6.957e8 }) === 400 * AU);
assert('navigator: from the Earth the camera may stand beyond the Moon\'s orbit', maxRangeOf('earth', { a: 6378137 }) > 4.06e8);
assert('provenance: five classes of reading, an unknown one read as a model',
  ['physical', 'archive', 'model', 'synthetic', 'assimilated', 'guess'].map(provenanceClass).join() === 'observed,archive,model,synthetic,assimilated,model');

// ---- the field's cube, as the page reckons it (decision 0006) --------------------------------------------------
{
  const n = 7, L = 7000, N3 = n * n * n;
  const centre = (n - 1) / 2 * (1 + n + n * n);
  check('cube: the middle cell of an odd cube lies at its centre', Math.hypot(...cellOffset(n, L, centre)), 0, 'm');
  check('cube: the first cell lies half a cell in from the south-west-lower corner, east fastest',
    Math.hypot(...cellOffset(n, L, 0).map((x) => x + L / 2 - L / (2 * n))) + Math.abs(cellOffset(n, L, 1)[0] - cellOffset(n, L, 0)[0] - L / n), 0, 'm');
  assert('cube: in three.js\'s axes east is x, up is y and north is −z (a right-handed frame)',
    cellPosition(n, centre + 1)[0] > 0 && cellPosition(n, centre + n * n)[1] > 0 && cellPosition(n, centre + n)[2] < 0);
  // A linear field a + g·x, with a few cells unread, gives back its gradient and its mean.
  const g = [3.5e-3, -1.25e-3, -2.0e-2], a = 4.2e4;
  const values = Float32Array.from({ length: N3 }, (_, idx) => { const x = cellOffset(n, L, idx); return a + g[0] * x[0] + g[1] * x[1] + g[2] * x[2]; });
  for (const idx of [0, 5, 17, 200]) values[idx] = NaN;
  const fit = gradientOf(values, n, L);
  check('cube: the linear fit recovers the gradient of a linear field with cells unread', Math.max(...[fit.east - g[0], fit.north - g[1], fit.up - g[2]].map(Math.abs)) / 2e-2, 2e-5);
  check('cube: and its mean', (fit.mean - a) / a, 1e-7);
  check('cube: the value at the centre of an odd cube is its middle cell\'s', centreValue(values, n) - values[centre], 0);
  const even = Float32Array.from({ length: 64 }, (_, idx) => idx);
  check('cube: of an even cube, the mean of the eight about its centre', centreValue(even, 4) - 31.5, 0);
  // Scales and colours.
  const lin = scaleOf(values), log = scaleOf(values, { log: true }), about = scaleOf(values, { about: a });
  assert('cube: a linear scale spans the values read', lin.kind === 'linear' && Math.abs(lin.t(lin.lo)) < 1e-12 && Math.abs(lin.t(lin.hi) - 1) < 1e-12);
  assert('cube: a logarithmic scale spans them too', log.kind === 'log' && Math.abs(log.t(log.hi) - 1) < 1e-12 && Math.abs(log.t(log.lo)) < 1e-12);
  assert('cube: a diverging scale is symmetric about its value', about.kind === 'diverging' && Math.abs(about.t(a)) < 1e-12 && Math.abs(about.t(about.hi) - 1) < 1e-9 && Math.abs(about.t(about.lo) + 1) < 1e-9);
  assert('cube: a cell without a value has no colour', colourOf(lin, NaN) === null);
  const luminance = ([r, gg, b]) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  const ramp = [0, 0.25, 0.5, 0.75, 1].map((t) => luminance(colourOf(lin, lin.lo + t * (lin.hi - lin.lo), true)));
  assert('cube: the sequential colours grow lighter with the value, so their order reads without hue', ramp.every((x, i) => i === 0 || x > ramp[i - 1]), ramp.map((x) => x.toFixed(3)).join(' '));
  // The cells each way of showing keeps.
  const full = Float32Array.from({ length: N3 }, () => 1);
  check('cube: the shell is n³ − (n−2)³ cells', visibleCells(full, n, 'shell').length - (N3 - (n - 2) ** 3), 0);
  check('cube: three slices through a cell are 3n² − 3n + 1 cells', visibleCells(full, n, 'slices', [3, 3, 3]).length - (3 * n * n - 3 * n + 1), 0);
  check('cube: the cells shown leave out those unread', visibleCells(values, n, 'cells').length - (N3 - 4), 0);
  // The figure's surface through the cube: every point on the sphere.
  const R = 1737.4e3, h = 20e3, edge = 100e3, ground = groundGeometry(R, h, edge);
  let worst = 0;
  for (let i = 0; i < ground.length; i += 3) {
    const e = ground[i] * edge, u = ground[i + 1] * edge, no = -ground[i + 2] * edge;
    worst = Math.max(worst, Math.abs(Math.hypot(e, no, u + R + h) - R));
  }
  assert('cube: the figure\'s surface drawn lies on the sphere to a metre', ground.length > 0 && worst < 1, `${worst} m`);
  // Arrows of a uniform field point along it.
  const north = { east: new Float32Array(N3), north: new Float32Array(N3).fill(1), up: new Float32Array(N3) };
  const arrows = arrowsGeometry(n, north).positions;
  assert('cube: arrows of a field due north point along −z', arrows.length > 0 && Math.abs(arrows[0] - arrows[3]) < 1e-9 && arrows[5] < arrows[2]);
  assert('cube: the departure of a uniform field is nothing to draw', arrowsGeometry(n, north, { departure: true }).positions.length === 0);
}
{
  const p = primary({ family: 'magnetometer.wmm2025', available: true, values: { total_T: 4.91284e-5, north_T: 1.9561e-5, east_T: 4.3e-7, down_T: 4.5063e-5, declination_deg: 1.26, inclination_deg: 66.53 } });
  assert('readings: a magnetometer is read first as |B| in nanotesla', p.value === '49,128' && p.unit === 'nT', `${p.value} ${p.unit}`);
  assert('readings: an unknown family shows its first numbers', primary({ family: 'x', available: true, values: { speed_m_s: 12.5, note: 'a' }, units: { speed_m_s: 'm/s' } }).unit === 'm/s');
  assert('readings: no reading where the instrument cannot read', primary({ family: 'magnetometer.wmm2025', available: false, reason: 'outside' }) === null);
  const gz = new Gazetteer();
  gz.add('moon', { places: [['Tycho', -11.36, -43.31, 'Crater', '', 85]] });
  assert('point: a point in Tycho is named by it', nearestPlace(gz, 'moon', -43.4, -11.3)?.inside === true);
  assert('point: a point 300 km away is not', nearestPlace(gz, 'moon', -33.3, -11.3) === null);
  const html = analysisHtml({ utilisation: 0.079, edf_one_worker: { feasible: true }, liu_layland_bound: 0.7, workers: 4, horizon_s: 2,
    policies: [{ policy: 'edf', jobs: 231, misses: 108, starved: 0, max_lateness_s: 0.06 }] }, true);
  assert('sched: with a burst of 200 jobs of 2 ms due in 50 ms, 4 workers leave at least 100 late under any policy', /at least 100 of the burst/.test(html));
}

// ---- the recipe -----------------------------------------------------------------------------------------------
{
  const recipe = JSON.parse(readFileSync(resolve(APP, 'recipe.json'), 'utf8'));
  for (const step of recipe.steps) {
    const [script, arg] = step.run;
    const exists = existsSync(resolve(ROOT, script));
    const manifest = script.endsWith('fetch.py') ? existsSync(resolve(ROOT, 'data/registry', `${arg}.json`)) : true;
    assert(`recipe: ${step.id} runs a script that exists${script.endsWith('fetch.py') ? ' with a registered dataset' : ''}`, exists && manifest);
  }
}

// ---- the engine -------------------------------------------------------------------------------------------------
const python = ['python', 'python3'].find((p) => spawnSync(p, ['--version'], { stdio: 'ignore' }).status === 0);
const status = python && spawnSync(python, [resolve(APP, 'engine.py'), 'status'], { cwd: ROOT, encoding: 'utf8' });
const state = status && status.status === 0 ? JSON.parse(status.stdout) : null;
if (!state || !state.built || !state.data.ephemeris) {
  skip('engine: not built, or the ephemeris is not in the cache (python data/acquisition/recipe.py applications/cosmopoiesis-lab/recipe.json)');
} else {
  if (!state.current) skip('engine: built from older sources; its answers are checked as they are');
  const ask = (request) => {
    const r = spawnSync(python, [resolve(APP, 'engine.py'), 'run', '-'], { cwd: ROOT, input: JSON.stringify(request), encoding: 'utf8', timeout: 120000 });
    try { return JSON.parse(r.stdout); } catch { return { error: (r.stderr || r.stdout || '').slice(-300) }; }
  };
  const a = ask({ op: 'time', time: '2006-01-15T21:24:37.5 UTC' });
  const ttUtc = a.scales ? ((a.scales.TT.jd[0] - a.scales.UTC.jd[0]) + (a.scales.TT.jd[1] - a.scales.UTC.jd[1])) * DAY : NaN;
  check('engine: TT − UTC on 2006-01-15 is 65.184 s (SOFA, Time Scale and Calendar Tools)', ttUtc - 65.184, 1e-6, 's');
  assert('engine: an instant is answered in eight scales', a.scales && ['UTC', 'UT1', 'TAI', 'TT', 'TDB', 'TCG', 'TCB', 'GPS'].every((s) => a.scales[s]?.iso));
  check('engine: GPS is TAI − 19 s', a.scales ? ((a.scales.TAI.jd[0] - a.scales.GPS.jd[0]) + (a.scales.TAI.jd[1] - a.scales.GPS.jd[1])) * DAY - 19 : 1, 1e-6, 's');
  const f = ask({ op: 'frames' });
  const byName = new Map((f.frames || []).map((x) => [x.name, x]));
  assert('engine: the frames form one tree from the ICRS', f.frames && byName.get('ICRS').parent === null && f.frames.every((x) => x.parent === null || byName.has(x.parent)));
  assert('engine: the Earth\'s chain GCRS → CIRS → TIRS → ITRS', byName.get('CIRS')?.parent === 'GCRS' && byName.get('TIRS')?.parent === 'CIRS' && byName.get('ITRS')?.parent === 'TIRS');
  const eph = ask({ op: 'ephemeris', start: '2026-10-28T00:00:00Z', span: 7200, step: 600 });
  assert('engine: a window of two hours at ten minutes is 13 samples', eph.t?.length === 13 && eph.earth_itrs_to_gcrs.length === 13);
  if (eph.t) {
    const unit = [...eph.earth_itrs_to_gcrs, ...eph.moon_to_gcrs].every((q) => Math.abs(Math.hypot(...q) - 1) < 1e-12);
    assert('engine: its rotations are unit quaternions', unit);
    const q0 = eph.earth_itrs_to_gcrs[0], q1 = eph.earth_itrs_to_gcrs[1];
    const dot = Math.abs(q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3]);
    const rate = (2 * Math.acos(Math.min(1, dot))) / 600;
    check('engine: the Earth turns at 7.2921e-5 rad/s between samples', Math.abs(rate - 7.2921151e-5) / 7.2921151e-5, 1e-4);
    const d = Math.hypot(...eph.moon_position[0]);
    assert('engine: the Moon is between perigee and apogee', d > 3.56e8 && d < 4.07e8, `${d} m`);
    const sd = Math.hypot(...eph.sun_position[0]);
    assert('engine: the Sun is about 1 au away', sd > 1.47e11 && sd < 1.53e11, `${sd} m`);
  }
  const p = [6378137, 1000, -500];
  const there = ask({ op: 'transform', from: 'ITRS', to: 'MOON_ME', time: '2026-10-28T12:00:00Z', positions: [p] });
  const back = there.positions ? ask({ op: 'transform', from: 'MOON_ME', to: 'ITRS', time: '2026-10-28T12:00:00Z', positions: there.positions }) : {};
  check('engine: a point carried from the ITRS to the Moon\'s frame and back', back.positions ? Math.hypot(...back.positions[0].map((x, k) => x - p[k])) : 1e9, 1e-6, 'm');
  assert('engine: the path from the ITRS to the Moon goes through the GCRS', there.path?.join(' ') === 'ITRS TIRS CIRS GCRS MOON_ICRS MOON_ME', there.path?.join(' '));
  const h = ask({ op: 'holonomy', time: '2026-10-28T12:00:00Z' });
  const eq = (h.loops || []).find((l) => l.name === 'ITRS by the equinox route');
  check('engine: the equinox and the CIO routes to the ITRS agree within a milliarcsecond', eq ? eq.angle_mas : 1e9, 1, 'mas');
  const iau = (h.loops || []).find((l) => l.name === 'MOON_ME by the IAU model');
  assert('engine: the IAU\'s Moon and DE440\'s differ by some arcseconds, not more', iau && iau.angle_mas > 100 && iau.angle_mas < 60000, iau && `${iau.angle_mas} mas`);
  const bad = ask({ op: 'transform', from: 'NOWHERE', to: 'ITRS', time: '2026-10-28T12:00:00Z', positions: [[0, 0, 0]] });
  assert('engine: an unknown frame is an error, not an answer', typeof bad.error === 'string');
  const teme = (h.loops || []).find((l) => l.name === 'TEME by the equation of the equinoxes');
  assert('engine: the loop through TEME measures GMST 1982 against IAU 2006 (tens of mas)', teme && teme.angle_mas > 10 && teme.angle_mas < 200, teme && `${teme.angle_mas} mas`);

  // ---- the bodies of DE440 ------------------------------------------------------------------------------------
  const bodies = ask({ op: 'bodies', start: '2026-10-28T00:00:00Z', span: 60, step: 60 });
  const B = new Map((bodies.bodies || []).map((x) => [x.key, x]));
  assert('bodies: the Sun, the planets, Pluto and the Moon', ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].every((k) => B.has(k)), [...B.keys()].join());
  if (B.has('earth') && B.has('moon')) {
    assert('bodies: every orientation a unit quaternion', [...B.values()].every((x) => x.rotation.every((q) => Math.abs(Math.hypot(...q) - 1) < 1e-12)));
    const d = Math.hypot(...[0, 1, 2].map((k) => B.get('moon').position[0][k] - B.get('earth').position[0][k]));
    assert('bodies: the Moon between perigee and apogee from the Earth, both in the ICRS', d > 3.56e8 && d < 4.07e8, `${d} m`);
    const [q0, q1] = B.get('earth').rotation;
    const rate = (2 * Math.acos(Math.min(1, Math.abs(q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3])))) / 60;
    check('bodies: the Earth turns from the ITRS at 7.2921e-5 rad/s', Math.abs(rate - 7.2921151e-5) / 7.2921151e-5, 1e-4);
    const sun = Math.hypot(...B.get('sun').position[0]);
    assert('bodies: the Sun within a few of its radii of the barycentre', sun < 3 * 6.957e8, `${sun} m`);
  }

  // ---- addresses ---------------------------------------------------------------------------------------------
  const T = '2026-10-28T12:00:00Z';
  const where = (text, answers, observer) => ask({ op: 'address', text, time: T, ...(answers ? { answers } : {}), ...(observer ? { observer } : {}) });
  const tower = where('earth(48.8584 N, 2.2945 E, 330 m)', null, 'earth(48.8606 N, 2.3376 E, 35 m)');
  assert('address: read and printed canonically', tower.canonical === 'earth(48.8584 N, 2.2945 E, 330 m)', tower.canonical);
  const value = (ans, frame, chart) => (ans.answers || []).find((x) => x.frame === frame && (!chart || x.chart === chart));
  const geo = value(tower, 'ITRS', 'geodetic');
  check('address: its geodetic coordinates come back from the event', geo ? Math.hypot(geo.values.latitude_deg - 48.8584, geo.values.longitude_deg - 2.2945) : 1, 1e-12, 'deg');
  // Every answer is itself an address: read again, it is the same event (to the precision of
  // doubles: a micrometre at an astronomical unit, some tens of kilometres from the galaxy's centre).
  for (const [frame, chart, limit] of [['ICRS', 'cartesian', 1e-3], ['GALACTIC', '', 1e-3], ['ECLIPTIC_J2000', '', 1e-3], ['EARTH_MOON_ROTATING', 'cartesian', 1e-6], ['TEME', 'cartesian', 1e-6], ['GALACTOCENTRIC', 'cartesian', 1e5]]) {
    const ans = value(tower, frame, chart);
    const back = ans ? where(ans.canonical, [{ frame: 'ITRS', chart: 'cartesian' }]) : {};
    const xyz = back.answers?.[0]?.values;
    const err = xyz ? Math.hypot(xyz.x_m - tower.event.position_m[0], xyz.y_m - tower.event.position_m[1], xyz.z_m - tower.event.position_m[2]) : 1e30;
    check(`address: the tower written in ${frame}${chart ? ':' + chart : ''} reads back to the same point`, err, limit, 'm');
  }
  const aer = tower.from_the_observer?.aer;
  if (aer) {
    const step = where(`earth(48.8606 N, 2.3376 E, 35 m)/aer(${aer.values.azimuth_deg} deg, ${aer.values.elevation_deg} deg, ${aer.values.range_m} m)`, [{ frame: 'ITRS', chart: 'geodetic' }]);
    const g = step.answers?.[0]?.values;
    check('address: from the Louvre, a step by its azimuth, elevation and range reaches the tower', g ? Math.hypot((g.latitude_deg - 48.8584) * 111e3, (g.longitude_deg - 2.2945) * 73e3, g.height_m - 330) : 1e9, 1e-3, 'm');
  }
  const tycho = where('moon(43.31 S, 11.36 W)', [{ frame: 'ITRS', chart: 'cartesian' }]);
  const fromEarth = tycho.answers?.[0];
  const home = fromEarth ? where(fromEarth.canonical, [{ frame: tycho.event.frame, chart: '' }]) : {};
  const s2 = home.answers?.[0]?.values;
  check('address: Tycho written from the Earth\'s frame reads back to the crater', s2 ? Math.hypot(s2.latitude_deg + 43.31, s2.longitude_deg + 11.36) : 1, 1e-9, 'deg');
  const unread = where('moon(43.31 S, 11.36 W) aer(0 deg, 30 deg, 2 km)');
  assert('address: a syntax error says where and what was expected', unread.syntax?.column === 23 && /@/.test(unread.syntax?.expected || ''), JSON.stringify(unread.syntax));
  const charts = ask({ op: 'address', text: 'ICRS', time: T, charts: true });
  assert('address: the grammar and every frame\'s charts are told', /address\s+::=/.test(charts.grammar || '') && (charts.charts?.ITRS || []).includes('mgrs'));

  // ---- instruments -----------------------------------------------------------------------------------------------
  const ins = ask({ op: 'instruments' });
  const kernels = new Set((ins.kernels || []).map((k) => k.key));
  assert('instruments: twelve kernels of observation', kernels.size === 12, [...kernels].join());
  const families = (ins.families || []).map((f) => f.family);
  assert('instruments: the engine\'s families, the clock to the radiosonde',
    ['clock.scales', 'position.truth', 'sun.sensor', 'sky.bodies', 'gnss.receiver', 'gravimeter.body', 'magnetometer.wmm2025', 'atmosphere.ussa1976', 'radiosonde.ussa1976'].every((f) => families.includes(f)), families.join());
  assert('instruments: every family is one of the kernels, with a provenance', (ins.families || []).every((f) => kernels.has(f.kernel) && f.provenance));
  assert('instruments: the compass and the Moon\'s magnetometer are families of the engine', ['compass.magnetic', 'magnetometer.moon'].every((f) => families.includes(f)));
  const reference = (ins.families || []).find((f) => f.family === 'position.truth');
  assert('instruments: position.truth is the reference state, the mount\'s modelled place without error, an ideal probe and a control',
    reference?.title === 'Reference state' && /modelled place/.test(reference?.about || '') && /control/.test(reference?.about || ''), reference?.title);
  const classes = new Set((ins.kernels || []).map((k) => k.class));
  const declared = ins.declared || [];
  assert('instruments: the encyclopedia\'s 101 families are declared, each bound to one of the twelve kernel classes',
    declared.length === 101 && classes.size === 12 && declared.every((d) => classes.has(d.class)), `${declared.length} declared, ${classes.size} classes`);
  assert('instruments: a declared family with a model names the engine\'s families that carry it',
    declared.filter((d) => d.implemented).length >= 20 && declared.find((d) => d.code === 'C01')?.engine_families?.includes('magnetometer.moon'));

  // ---- the fields: the Earth's field lines, the Moon's crustal field -----------------------------------------------
  const fl = ask({ op: 'field_lines', body: 'earth', time: '2026-10-28T12:00:00Z' });
  const RE = 6371.2e3, radius = (q) => Math.hypot(q[0], q[1], q[2]);
  const radii = (fl.lines || []).flat().map(radius);
  assert('field lines: 48 lines of WMM2025 in the ITRS, between the ground and six Earth radii',
    fl.frame === 'ITRS' && fl.lines?.length === 48 && radii.every((r) => r >= RE && r <= 6.2 * RE), `${fl.lines?.length} lines, ${radii.length} points`);
  // A line from 30° of latitude is closed: both its ends at the ground, in opposite hemispheres, its apex
  // within two Earth radii, as a dipole's from λₘ = 30 ± 15° of geomagnetic latitude (L = 1/cos²λₘ, 1.07
  // to 2.0: the dipole's axis is some 10° from the rotation's, and the field is not a dipole's).
  const low = (fl.lines || []).filter((l) => l.some((q) => Math.abs(Math.asin(q[2] / radius(q))) > 25 * Math.PI / 180 && Math.abs(Math.asin(q[2] / radius(q))) < 35 * Math.PI / 180) && Math.max(...l.map(radius)) < 2 * RE);
  const closed = low.filter((l) => radius(l[0]) < RE + 150e3 && radius(l[l.length - 1]) < RE + 150e3 && Math.sign(l[0][2]) !== Math.sign(l[l.length - 1][2]));
  assert('field lines: those from ±30° close, from the ground to the ground across the magnetic equator, their apex 1.05 to 2 Earth radii',
    low.length >= 8 && closed.length === low.length && closed.every((l) => { const a = Math.max(...l.map(radius)) / RE; return a > 1.05 && a < 2; }),
    `${closed.length} of ${low.length}`);
  const map = ask({ op: 'field_map', body: 'moon', quantity: 'total', step_deg: 2 });
  const packed = ask({ op: 'field_map', body: 'moon', quantity: 'total', step_deg: 2, encoding: 'f32' });
  const f32 = packed.values_f32 ? new Float32Array(Uint8Array.from(Buffer.from(packed.values_f32, 'base64')).buffer) : [];
  assert('field map: the Moon\'s crust on a grid of 2°, 90 rows of 180, its |B| from T2015_449 between a hundredth and a thousand nanotesla',
    map.nlat === 90 && map.nlon === 180 && map.values?.length === 90 * 180 && map.min > 1e-11 && map.max < 1e-6 && map.frame === 'MOON_ME', `${map.min} to ${map.max} T`);
  assert('field map: as float32 in base64 it carries the same values, to float32\'s precision',
    f32.length === 90 * 180 && map.values.every((x, i) => Math.abs(f32[i] - x) <= 1e-7 * Math.abs(x)));
  const radial = ask({ op: 'field_map', body: 'moon', quantity: 'radial', step_deg: 2 });
  assert('field map: its radial component takes both signs and is never larger than |B|',
    radial.min < 0 && radial.max > 0 && radial.values?.every((x, i) => Math.abs(x) <= map.values[i] * (1 + 1e-12)));

  // ---- the neighbourhood of an event: a family read in the n³ cells of a cube (probe_volume) ----------------------
  // Held to truths outside the operation: NOAA's test values of WMM2025, pyshtools on T2015_449, the
  // 1976 standard's temperature law, the field equations outside the sources (∇·B = 0 and ∇×B = 0 for
  // the main field; ∇·g = 2ω² and ∇×g = 0 for normal gravity, the potential's Laplacian in the
  // rotating frame). The equality of a cube's centre with a session's own sensor is checked in
  // tests/check_runtime.py, which holds a session.
  {
    const T0 = '2026-10-28T12:00:00Z';
    const cube = (request) => ask({ op: 'probe_volume', time: T0, ...request });
    const nan = (xs) => (xs || []).map((v) => (v === null ? NaN : v));
    const values = (a, nm) => nan((a.quantities || []).find((x) => x.name === nm)?.values);
    const centre = (n) => { const m = (n - 1) / 2; return m + n * (m + n * m); };
    const cells = (a) => a.n ** 3;
    const counted = (a) => a.counts ? a.counts.read + a.counts.outside + a.counts.missing + a.counts.invalid : -1;
    const f32 = (text) => (text ? Array.from(new Float32Array(Uint8Array.from(Buffer.from(text, 'base64')).buffer)) : []);
    const rows = (path) => readFileSync(resolve(ROOT, path), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));

    // 1. With n odd, the centre cell is the family's reading at the centre itself.
    const wmmTest = rows('domains/geophysics/tests/fixtures/wmm2025-test-values.txt').map((l) => l.trim().split(/\s+/).map(Number)).find((r) => r[0] === 2025 && r[2] === 43 && r[3] === 93);
    const wmm5 = wmmTest ? cube({ at: `earth(43 N, 93 E, ${wmmTest[1]} km)`, time: '2025-01-01T00:00:00Z', family: 'magnetometer.wmm2025', edge_m: 10000, n: 5 }) : {};
    const nT = 1e-9, c5 = centre(5);
    const wmmErr = wmmTest && wmm5.quantities ? Math.max(...[['north_T', 7], ['east_T', 8], ['down_T', 9], ['total_T', 10]].map(([nm, k]) => Math.abs(values(wmm5, nm)[c5] / nT - wmmTest[k]))) : NaN;
    check('probe volume: the centre of a WMM2025 cube is NOAA\'s test point at 65 km over 43° N, 93° E in 2025.0 (X, Y, Z, F; the file departs from the report by 7e-4 nT)', wmmErr, 1e-3, 'nT');
    const lunar = rows('domains/planetary-science/tests/fixtures/lunar-field.txt').map((l) => l.trim().split(/\s+/)).find((r) => r[0] === 'gerasimovich');
    const moon3 = lunar ? cube({ at: `moon(${Math.abs(+lunar[1])} S, ${Math.abs(+lunar[2])} W, ${+lunar[3]} m)`, family: 'magnetometer.moon', edge_m: 1000, n: 3 }) : {};
    const bRef = lunar ? Math.hypot(+lunar[4], +lunar[5], +lunar[6]) : NaN;
    const moonErr = moon3.quantities ? Math.max(...[['north_T', 4], ['east_T', 5], ['down_T', 6]].map(([nm, k]) => Math.abs(values(moon3, nm)[centre(3)] - +lunar[k]))) / bRef : NaN;
    check('probe volume: the centre of a lunar cube over Gerasimovich is T2015_449 as pyshtools gives it (to 1e-7 of |B|)', moonErr, 1e-7);
    const air5 = cube({ at: 'earth(45 N, 10 E, 1500 m)', family: 'atmosphere.ussa1976', edge_m: 1000, n: 5 });
    const z = values(air5, 'height_msl_m')[c5], r0 = 6356766, hGeo = (r0 * z) / (r0 + z);
    check('probe volume: the centre of an atmosphere cube has the 1976 standard\'s temperature, 288.15 K − 6.5 K/km of geopotential height (its eq. 23)',
      values(air5, 'temperature_K')[c5] - (288.15 - 6.5e-3 * hGeo), 1e-9, 'K');
    const axes = air5.axes?.rotation;
    const phi = 45 * Math.PI / 180, lam = 10 * Math.PI / 180;
    const up = [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    assert('probe volume: its axes are the east, north and up of WGS 84 at the centre, orthonormal, up along the normal',
      axes && [0, 1, 2].every((a) => [0, 1, 2].every((b) => Math.abs(dot(axes[a], axes[b]) - (a === b ? 1 : 0)) < 1e-15)) && Math.hypot(...axes[2].map((x, k) => x - up[k])) < 1e-15
      && axes[0][2] === 0 && air5.order === 'east fastest, then north, then up', JSON.stringify(axes));
    const rise = [0, 1, 2, 3].map((k) => values(air5, 'height_msl_m')[centre(5) - 2 * 25 + (k + 1) * 25] - values(air5, 'height_msl_m')[centre(5) - 2 * 25 + k * 25]);
    check('probe volume: up is the slowest index, a cell\'s edge apart from layer to layer (cells i + n(j + nk))', Math.max(...rise.map((d) => Math.abs(d - air5.cell_m))), 1e-6, 'm');

    // 2. WMM2025's cube is a potential field outside its sources: by central differences over the cells, in the
    // cube's axes, ∇·B and ∇×B vanish beside the gradient's scale. Its vector is turned from each cell's own
    // north, east and down into the cube's axes; taken unturned, as if the local frames were one, it fails.
    const fieldMetrics = (a, comps) => {
      const n = a.n, h = a.cell_m, at = (c, i, j, k) => c[i + n * (j + n * k)];
      let div = 0, curl = 0, grad = 0, sum = 0, used = 0;
      for (let k = 1; k < n - 1; k++) for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
        const G = comps.map((c) => [(at(c, i + 1, j, k) - at(c, i - 1, j, k)) / (2 * h), (at(c, i, j + 1, k) - at(c, i, j - 1, k)) / (2 * h), (at(c, i, j, k + 1) - at(c, i, j, k - 1)) / (2 * h)]);
        if (G.flat().some((x) => !Number.isFinite(x))) continue;
        used++;
        const d = G[0][0] + G[1][1] + G[2][2];
        div = Math.max(div, Math.abs(d)); sum += d;
        curl = Math.max(curl, Math.hypot(G[2][1] - G[1][2], G[0][2] - G[2][0], G[1][0] - G[0][1]));
        grad = Math.max(grad, ...G.flat().map(Math.abs));
      }
      return { used, div: div / grad, curl: curl / grad, mean_div: sum / used, grad };
    };
    const wmm12 = cube({ at: 'earth(51.4769 N, 0.0005 W, 200 km)', family: 'magnetometer.wmm2025', edge_m: 200000, n: 12 });
    const v12 = wmm12.vector || {};
    const potential = wmm12.vector ? fieldMetrics(wmm12, [nan(v12.east), nan(v12.north), nan(v12.up)]) : { div: NaN, curl: NaN, used: 0 };
    assert('probe volume: WMM2025 over Greenwich (200 km cube at 200 km, 12³ cells) is a potential field: |∇·B| and |∇×B| below 1% of max|∂Bᵢ/∂xⱼ|',
      potential.used === 1000 && potential.div < 0.01 && potential.curl < 0.01, `div ${potential.div?.toExponential(2)}, curl ${potential.curl?.toExponential(2)} of ${potential.grad?.toExponential(2)} T/m`);
    const unturned = wmm12.quantities ? fieldMetrics(wmm12, [values(wmm12, 'east_T'), values(wmm12, 'north_T'), values(wmm12, 'down_T').map((x) => -x)]) : { div: 0 };
    assert('probe volume: the cells\' own north, east and down, taken unturned as the cube\'s axes, are not (the rotation matters)', unturned.div > 0.1, `div ${unturned.div?.toExponential(2)}`);
    const tot = values(wmm12, 'total_T');
    const norms = nan(v12.east).map((e, i) => Math.abs(Math.hypot(e, nan(v12.north)[i], nan(v12.up)[i]) - tot[i]) / tot[i]);
    check('probe volume: the turned vector keeps each cell\'s |B|', norms.length ? Math.max(...norms) : NaN, 1e-12);
    assert('probe volume: the vector is B in tesla, in the cube\'s axes', v12.name === 'B' && v12.unit === 'T' && /cube's axes/.test(v12.frame || ''), JSON.stringify({ name: v12.name, unit: v12.unit, frame: v12.frame }));
    const grav = cube({ at: 'earth(30 S, 140 E, 100 km)', family: 'gravimeter.body', edge_m: 20000, n: 7 });
    const gm = grav.vector ? fieldMetrics(grav, [nan(grav.vector.east), nan(grav.vector.north), nan(grav.vector.up)]) : { mean_div: NaN, curl: NaN };
    const omega = 7.292115e-5;  // WGS 84's angular velocity, rad/s (NGA.STND.0036, Table 3.1)
    check('probe volume: normal gravity\'s cube (20 km at 100 km) has ∇·g = 2ω², the normal potential\'s Laplacian in the rotating frame (relative)', gm.mean_div / (2 * omega * omega) - 1, 0.01);
    check('probe volume: and ∇×g = 0 (beside its gradient)', gm.curl, 1e-4);

    // 3. Every cell is counted once; where the family cannot read, no value, and the reason.
    const ground = cube({ at: 'earth(45 N, 10 E)', family: 'atmosphere.ussa1976', edge_m: 20000, n: 4 });
    const tK = values(ground, 'temperature_K');
    assert('probe volume: a cube on the ground, half below it: the 1976 standard\'s cells deeper than 5 km (the lowest layer) have no value, and say so',
      ground.counts?.outside === 16 && ground.counts?.read === 48 && tK.every((x, i) => (i < 16) === Number.isNaN(x))
      && ground.reasons?.[0]?.quality === 'outside' && /heights/.test(ground.reasons?.[0]?.reason || '') && ground.reasons?.[0]?.count === 16,
      JSON.stringify({ counts: ground.counts, reasons: ground.reasons }));
    const answered = [wmm5, moon3, air5, wmm12, grav, ground];
    assert('probe volume: the counts of every cube sum to n³', answered.every((a) => a.n && counted(a) === cells(a)), answered.map((a) => `${counted(a)}/${a.n ** 3}`).join(' '));

    // 4. Families whose readings are not fields over space, cubes too large, and families unknown are refused.
    const refused = [
      [{ family: 'clock.scales', at: 'earth(45 N, 10 E)', edge_m: 1000, n: 3 }, /clock's reading is not a field/],
      [{ family: 'magnetometer.wmm2025', at: 'earth(45 N, 10 E)', edge_m: 1000, n: 25 }, /from 2 to 24/],
      [{ family: 'magnetometer.nowhere', at: 'earth(45 N, 10 E)', edge_m: 1000, n: 3 }, /no instrument family/],
      [{ family: 'declared.C06', at: 'earth(45 N, 10 E)', edge_m: 1000, n: 3 }, /declared, not implemented/],
      [{ family: 'magnetometer.wmm2025', at: 'GCRS:cartesian(7000 km, 0 m, 0 m)', edge_m: 1000, n: 3 }, /body with a surface/],
    ].map(([r, why]) => [r.family + (r.n === 25 ? ' at n = 25' : r.at.startsWith('GCRS') ? ' in open space' : ''), why.test(cube(r).error || '')]);
    assert('probe volume: a clock, n = 25, an unknown family, a declared one and a centre in open space are refused, each with its reason',
      refused.every(([, ok]) => ok), refused.filter(([, ok]) => !ok).map(([what]) => what).join(', '));

    // 5. As float32 in base64 the values are the JSON numbers rounded to float32, NaN where there is none.
    const same32 = (json, packed) => { const p = f32(packed); return p.length === json.length && json.every((x, i) => (Number.isNaN(x) ? Number.isNaN(p[i]) : p[i] === Math.fround(x))); };
    const wmm12f = cube({ at: 'earth(51.4769 N, 0.0005 W, 200 km)', family: 'magnetometer.wmm2025', edge_m: 200000, n: 12, encoding: 'f32' });
    const groundf = cube({ at: 'earth(45 N, 10 E)', family: 'atmosphere.ussa1976', edge_m: 20000, n: 4, encoding: 'f32' });
    assert('probe volume: the f32 and json encodings agree, quantities and vector, NaN where a cell has no reading',
      [[wmm12, wmm12f], [ground, groundf]].every(([j, f]) => j.quantities && f.quantities && j.quantities.length === f.quantities.length
        && j.quantities.every((q, k) => f.quantities[k].name === q.name && same32(nan(q.values), f.quantities[k].values_f32)))
      && ['east', 'north', 'up'].every((c) => same32(nan(v12[c]), wmm12f.vector?.[c])));

    // 6. A cube is a function of its request: two runs agree exactly, on any number of threads.
    const strip = (a) => JSON.stringify({ ...a, elapsed_s: 0, threads: 0 });
    const lunarFine = { at: 'moon(7.5 N, 59 W, 20 km)', family: 'magnetometer.moon', edge_m: 30000, n: 5, settings: { synthetic: true } };
    const once = cube({ ...lunarFine, threads: 1 }), twice = cube({ ...lunarFine, threads: 6 });
    assert('probe volume: two runs agree exactly, on one thread and on six (the Moon\'s crust with its synthetic small scales)',
      !once.error && once.counts?.read > 0 && strip(once) === strip(twice) && strip(cube({ at: 'earth(45 N, 10 E)', family: 'atmosphere.ussa1976', edge_m: 20000, n: 4 })) === strip(ground),
      once.error || '');
  }

  // ---- the world's fields (decision 0007): the catalogue, samplings, curves, a field's cube ----------------------
  {
    const T0 = '2026-10-28T12:00:00Z';
    const nan = (xs) => (xs || []).map((v) => (v === null ? NaN : v));
    const cat = ask({ op: 'fields' }).fields || [];
    const byName = new Map(cat.map((f) => [f.name, f]));
    const names = ['earth.magnetic', 'earth.magnetic.core', 'earth.gravity.normal', 'earth.atmosphere.temperature', 'earth.atmosphere.pressure',
      'earth.atmosphere.density', 'earth.atmosphere.speed_of_sound', 'moon.magnetic.crust', 'moon.magnetic.unresolved', 'moon.magnetic'];
    assert('fields: the world holds ten fields, the domains\' models, each with its descriptor', names.every((n) => byName.has(n)) && cat.length === 10, cat.map((f) => f.name).join(', '));
    const moonField = byName.get('moon.magnetic');
    assert('fields: the Moon\'s composite is synthetic, its parts the assimilated model and the synthetic scales, read on spheres row by row',
      !moonField?.available || (moonField.provenance === 'synthetic' && moonField.parts?.map((x) => `${x.name}:${x.provenance}`).join() === 'moon.magnetic.crust:assimilated,moon.magnetic.unresolved:synthetic'
        && moonField.capabilities.includes('sphere grid') && moonField.representation.kind === 'composite' && moonField.law?.band?.join() === '30,250'));
    assert('fields: WMM2025\'s time is the world\'s; normal gravity\'s and the standard atmosphere\'s none',
      byName.get('earth.magnetic')?.time?.startsWith('TT seconds from J2000.0') && byName.get('earth.gravity.normal')?.time === 'none' && byName.get('earth.atmosphere.pressure')?.fibre?.unit === 'Pa');

    // NOAA's test point at 65 km over 43° N, 93° E in 2025.0, read at its place on the ITRS's axes.
    const wgs84 = (latDeg, lonDeg, h) => {
      const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f), p = latDeg * Math.PI / 180, l = lonDeg * Math.PI / 180;
      const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
      return [(N + h) * Math.cos(p) * Math.cos(l), (N + h) * Math.cos(p) * Math.sin(l), (N * (1 - e2) + h) * Math.sin(p)];
    };
    const test = readFileSync(resolve(ROOT, 'domains/geophysics/tests/fixtures/wmm2025-test-values.txt'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => l.trim().split(/\s+/).map(Number)).find((r) => r[0] === 2025 && r[2] === 43 && r[3] === 93);
    if (test && byName.get('earth.magnetic')?.available) {
      const at = wgs84(43, 93, test[1] * 1000), up = [Math.cos(43 * Math.PI / 180) * Math.cos(93 * Math.PI / 180), Math.cos(43 * Math.PI / 180) * Math.sin(93 * Math.PI / 180), Math.sin(43 * Math.PI / 180)];
      const one = ask({ op: 'field.sample', field: 'earth.magnetic', time: '2025-01-01T00:00:00Z', sampling: { kind: 'points', points: [at] } });
      const B = nan(one.values);
      const nT = 1e-9;
      check('field.sample: WMM2025 at NOAA\'s test point, |B| = F and B · up = −Z (the file departs from the report by 7e-4 nT)',
        Math.max(Math.abs(Math.hypot(...B) / nT - test[10]), Math.abs((B[0] * up[0] + B[1] * up[1] + B[2] * up[2]) / nT + test[9])), 1e-3, 'nT');
    }
    const timeless = ask({ op: 'field.sample', field: 'earth.magnetic', sampling: { kind: 'points', points: [[7e6, 0, 0]] } });
    assert('field.sample: a field that depends on the time is not read without one', /depends on the time/.test(timeless.error || ''), timeless.error);

    // The Moon's crust on a sphere: the same numbers as field_map gives, which is now a sampling of it.
    if (byName.get('moon.magnetic.crust')?.available) {
      const sphere = { kind: 'sphere', centre: [0, 0, 0], radius_m: 1737400, nlat: 90, nlon: 180 };
      const s2 = ask({ op: 'field.sample', field: 'moon.magnetic.crust', sampling: sphere, reduce: 'magnitude' });
      const m2 = ask({ op: 'field_map', body: 'moon', quantity: 'total', step_deg: 2 });
      const v = nan(s2.values);
      check('field.sample: the Moon\'s |B| on a 2° sphere is field_map\'s, value for value (relative)',
        v.length === 16200 && m2.values?.length === 16200 ? Math.max(...v.map((x, i) => Math.abs(x - m2.values[i]) / m2.values[i])) : NaN, 1e-12);
      assert('field.sample: every cell read, no reason, a range of |B|', s2.counts?.valid === 16200 && s2.reasons?.length === 0 && s2.range?.max > s2.range?.min);
      const low = ask({ op: 'field.sample', field: 'moon.magnetic.crust', sampling: { kind: 'sphere', radius_m: 1737400 - 3000, nlat: 6, nlon: 12 } });
      assert('field.sample: on low ground below the model\'s sphere every cell is read with the note, counted once',
        low.counts?.valid === 72 && low.notes?.[0]?.count === 72 && /not continued downward/.test(low.notes?.[0]?.text || ''), JSON.stringify(low.notes));
    }

    // Normal gravity in a volume about a point, on its axes east, north and up: ∇·γ = 2ω² and ∇×γ = 0. With
    // cells of h = 20 km / 7 at 100 km up, each derivative errs by some 4 (h/r)² γ/r = 1.1e-12 s⁻², a
    // ten-thousandth of 2ω², and the values are doubles.
    {
      const lat = -30 * Math.PI / 180, lon = 140 * Math.PI / 180;
      const E = [-Math.sin(lon), Math.cos(lon), 0], N = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
      const U = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
      const n = 7, edge = 20000, h = edge / n;
      const vol = ask({ op: 'field.sample', field: 'earth.gravity.normal', sampling: { kind: 'volume', centre: wgs84(-30, 140, 100e3), axes: [E, N, U], edges: [edge, edge, edge], n: [n, n, n] }, reduce: 'on_axes' });
      const g = nan(vol.values), at = (c, i, j, k) => g[3 * (i + n * (j + n * k)) + c];
      let div = 0, curl = 0, used = 0;
      for (let k = 1; k < n - 1; k++) for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
        const d = (c, axis) => (axis === 0 ? at(c, i + 1, j, k) - at(c, i - 1, j, k) : axis === 1 ? at(c, i, j + 1, k) - at(c, i, j - 1, k) : at(c, i, j, k + 1) - at(c, i, j, k - 1)) / (2 * h);
        div = Math.max(div, Math.abs(d(0, 0) + d(1, 1) + d(2, 2) - 2 * 7.292115e-5 ** 2));
        curl = Math.max(curl, Math.hypot(d(2, 1) - d(1, 2), d(0, 2) - d(2, 0), d(1, 0) - d(0, 1)));
        used++;
      }
      check('field.sample: normal gravity on its volume\'s own axes has ∇·γ = 2ω² (125 inner cells; relative to 2ω²)', used === 125 ? div / (2 * 7.292115e-5 ** 2) : NaN, 1e-3);
      check('field.sample: and ∇×γ = 0', used === 125 ? curl : NaN, 1e-11, '1/s²');
    }
    const tooMany = ask({ op: 'field.sample', field: 'earth.gravity.normal', sampling: { kind: 'sphere', radius_m: 7e6, nlat: 2048, nlon: 4096 } });
    const scalarReduced = ask({ op: 'field.sample', field: 'earth.atmosphere.temperature', sampling: { kind: 'points', points: [[6.4e6, 0, 0]] }, reduce: 'magnitude' });
    const unknown = ask({ op: 'field.sample', field: 'earth.nothing', sampling: { kind: 'points', points: [[6.4e6, 0, 0]] } });
    assert('field.sample: too many points, a reduction of a scalar and an unknown field are refused, each with its reason',
      /more than the/.test(tooMany.error || '') && /reduces a vector/.test(scalarReduced.error || '') && /no field earth.nothing/.test(unknown.error || ''),
      [tooMany.error, scalarReduced.error, unknown.error].join(' | '));
    const air = ask({ op: 'field.sample', field: 'earth.atmosphere.temperature', sampling: { kind: 'points', points: [wgs84(45, 10, 15000), wgs84(45, 10, 100e3)] } });
    assert('field.sample: 15 km up the standard atmosphere is at its tropopause, 216.65 K; 100 km up there is none, and the reason',
      Math.abs(nan(air.values)[0] - 216.65) < 1e-9 && Number.isNaN(nan(air.values)[1]) && air.quality?.[1] === 1 && /1976 standard's heights/.test(air.reasons?.[0]?.text || ''), JSON.stringify(air.values));

    // Field lines of the core's field: within their shell, each end with why it ended, |B| along them the field's.
    if (byName.get('earth.magnetic.core')?.available) {
      const R = 6371.2e3;
      const seeds = [[0, R + 100e3, 0], [(R + 100e3) * Math.cos(Math.PI / 6), 0, (R + 100e3) * Math.sin(Math.PI / 6)]];
      const cv = ask({ op: 'field.curves', field: 'earth.magnetic.core', time: T0, seeds, within: { inner_m: R, outer_m: 6 * R } });
      const pts = (cv.curves || []).flatMap((c) => c.points || []);
      assert('field.curves: two lines, every point within the shell from the sphere to six Earth radii',
        cv.curves?.length === 2 && pts.length > 20 && pts.every((x) => Math.hypot(...x) >= R * (1 - 1e-12) && Math.hypot(...x) <= 6 * R), `${pts.length} points`);
      assert('field.curves: a line from 30° N closes at the ground, both its ends at the edge of the base or the shell, with the reason',
        (cv.curves || []).every((c) => c.backward?.stop === 'edge' && c.forward?.stop === 'edge' && c.backward.reason && c.forward.reason), JSON.stringify(cv.curves?.map((c) => [c.backward, c.forward])));
      const line = cv.curves?.[1];
      if (line?.points) {
        const pick = [0, Math.floor(line.points.length / 2), line.points.length - 1];
        const at = ask({ op: 'field.sample', field: 'earth.magnetic.core', time: T0, sampling: { kind: 'points', points: pick.map((i) => line.points[i]) }, reduce: 'magnitude' });
        check('field.curves: |B| along a line is the field\'s at its points (to float32)', Math.max(...pick.map((i, k) => Math.abs(line.magnitude[i] - nan(at.values)[k]) / nan(at.values)[k])), 1e-7);
      }
    }

    // A field's cube beside its instrument's: the same cells, the same values, the vector turned alike.
    if (byName.get('earth.magnetic')?.available) {
      const req = { op: 'probe_volume', at: 'earth(51.4769 N, 0.0005 W, 200 km)', time: T0, edge_m: 200000, n: 5 };
      const fieldCube = ask({ ...req, field: 'earth.magnetic' }), familyCube = ask({ ...req, family: 'magnetometer.wmm2025' });
      const q = (a, nm) => nan(a.quantities?.find((x) => x.name === nm)?.values);
      const mag = q(fieldCube, 'magnitude_T'), tot = q(familyCube, 'total_T');
      check('probe volume: a field\'s cube (earth.magnetic) gives the magnetometer\'s |B| in every cell (relative)', mag.length === 125 ? Math.max(...mag.map((x, i) => Math.abs(x - tot[i]) / tot[i])) : NaN, 1e-12);
      const fv = fieldCube.vector || {}, mv = familyCube.vector || {};
      check('probe volume: and the same vector on the cube\'s axes, the one turned from the field\'s frame, the other from each cell\'s north, east and down (of |B|)',
        mag.length === 125 ? Math.max(...['east', 'north', 'up'].flatMap((c) => nan(fv[c]).map((x, i) => Math.abs(x - nan(mv[c])[i]) / tot[i]))) : NaN, 1e-12);
      assert('probe volume: a field\'s cube names its field and its provenance, and is the same shape as a family\'s',
        fieldCube.field === 'earth.magnetic' && fieldCube.kernel === 'field' && fieldCube.provenance === 'model' && fieldCube.counts?.read === 125 && fieldCube.axes?.rotation?.length === 3);
      const wrongFrame = ask({ op: 'probe_volume', at: 'moon(7.5 N, 59 W)', time: T0, field: 'earth.magnetic', edge_m: 1000, n: 3 });
      assert('probe volume: a field is read in its own frame: the Earth\'s about a point on the Moon is refused', /its own frame/.test(wrongFrame.error || ''), wrongFrame.error);
    }
  }

  // ---- coordinates: the top of the Eiffel Tower ----------------------------------------------------------
  const eiffel = { system: 'geodetic', latitude_deg: 48.8584, longitude_deg: 2.2945, height_m: 330 };
  const c = ask({ op: 'convert', time: '2026-10-28T12:00:00Z', point: eiffel, observer: { latitude_deg: 48.8606, longitude_deg: 2.3376, height_m: 35 } });
  // GEOTRANS (the mgrs package) writes 31UDQ4825211954 for this point.
  assert('convert: the MGRS reference is GEOTRANS\'s', c.earth?.mgrs === '31UDQ4825211954', c.earth?.mgrs);
  assert('convert: the point is answered in the catalogue\'s frames, TEME and the rotating frame among them',
    ['ITRS', 'GCRS', 'TEME', 'EME2000', 'GALACTIC', 'MOON_ME', 'EARTH_MOON_ROTATING'].every((x) => (c.frames || []).some((f) => f.frame === x)));
  check('convert: on the Earth, its geodetic coordinates come back', c.earth ? Math.hypot(c.earth.geodetic.latitude_deg - 48.8584, c.earth.geodetic.longitude_deg - 2.2945) : 1, 1e-12, 'deg');
  assert('convert: the geoid lies some 45 m above the ellipsoid at Paris (EGM96)', c.earth?.mean_sea_level && Math.abs(c.earth.mean_sea_level.undulation_m - 44.6) < 1, c.earth?.mean_sea_level && `${c.earth.mean_sea_level.undulation_m} m`);
  if (c.earth?.utm) {
    const u = c.earth.utm;
    const fromGrid = ask({ op: 'convert', time: '2026-10-28T12:00:00Z', point: { system: 'utm', zone: u.zone, north: u.north, easting_m: u.easting_m, northing_m: u.northing_m, height_m: 330 } });
    check('convert: from its UTM coordinates the point comes back', fromGrid.earth ? Math.hypot(fromGrid.earth.geodetic.latitude_deg - 48.8584, fromGrid.earth.geodetic.longitude_deg - 2.2945) * 111e3 : 1e9, 1e-6, 'm');
    const fromMgrs = ask({ op: 'convert', time: '2026-10-28T12:00:00Z', point: { system: 'mgrs', reference: c.earth.mgrs } });
    check('convert: from its 1 m MGRS square the point comes back within the square', fromMgrs.earth ? Math.hypot((fromMgrs.earth.geodetic.latitude_deg - 48.8584) * 111.2e3, (fromMgrs.earth.geodetic.longitude_deg - 2.2945) * 73.2e3) : 1e9, 1.0, 'm');
  }
  const r = c.from_the_observer;
  assert('convert: from the Louvre the tower stands to the west, a little above the horizon', r && r.azimuth_deg > 255 && r.azimuth_deg < 275 && r.elevation_deg > 0 && r.elevation_deg < 10, r && `${r.azimuth_deg}°, ${r.elevation_deg}°`);
  // ---- the geodesic from JFK to Heathrow (GeographicLib 2.1: 5 554 908.7905 m, setting off at 51.38165°) ------------
  const gd = ask({ op: 'geodesic', from: { latitude_deg: 40.6413, longitude_deg: -73.7781 }, to: { latitude_deg: 51.47, longitude_deg: -0.4543 }, points: 9 });
  check('geodesic: JFK to Heathrow against GeographicLib', (gd.distance_m ?? 0) - 5554908.7905475, 1e-6, 'm');
  check('geodesic: its azimuth at JFK against GeographicLib', (gd.azimuth_from_deg ?? 0) - 51.38164785836946, 1e-11, 'deg');
  assert('geodesic: the path is sampled from end to end', gd.path_deg?.length === 9 && Math.abs(gd.path_deg[8][0] - 51.47) < 1e-9);

  // ---- satellites, from the element sets in the cache ----------------------------------------------------------------
  const tle = resolve(CACHE, 'celestrak-gp/stations/gp.tle');
  if (!existsSync(tle)) {
    skip('satellites: no element sets in the cache (python data/acquisition/fetch.py celestrak-gp --profile stations)');
  } else {
    const epochLine = readFileSync(tle, 'utf8').split('\n').find((l) => l.startsWith('1 25544'));
    const sats = ask({ op: 'satellites', time: 'unix:' + Date.now() / 1000, files: [{ path: tle, group: 'stations' }], window: { span_s: 600, step_s: 60 }, observer: { latitude_deg: 48.85, longitude_deg: 2.35 } });
    const iss = (sats.satellites || []).find((s) => s.norad === 25544);
    assert('satellites: the ISS is among the stations', !!iss, epochLine);
    if (iss) {
      const h = iss.geodetic?.height_m;
      assert('satellites: the ISS flies between 350 and 460 km', h > 350e3 && h < 460e3, `${h} m`);
      const v = Math.hypot(...iss.gcrs.velocity_m_s);
      assert('satellites: at about 7.66 km/s in the GCRS', Math.abs(v - 7660) < 60, `${v} m/s`);
      assert('satellites: with a window of 11 samples and look angles from Paris', iss.window?.gcrs_m.length === 11 && Number.isFinite(iss.observer?.elevation_deg));
      check('satellites: TEME and GCRS agree on the distance from the Earth\'s centre', Math.hypot(...iss.teme.position_m) - Math.hypot(...iss.gcrs.position_m), 1e-6, 'm');
    }
  }
}

// ---- a mission: the rover, its readings and what it learns (engine/mission.hpp) ---------------------------------
if (state && state.built && state.data.ephemeris && state.data.moon_magnetic) {
  const ask = (request) => {
    const r = spawnSync(python, [resolve(APP, 'engine.py'), 'run', '-'], { cwd: ROOT, input: JSON.stringify(request), encoding: 'utf8', timeout: 300000 });
    try { return JSON.parse(r.stdout); } catch { return { error: (r.stderr || r.stdout || '').slice(-300) }; }
  };
  const short = { lines: 2, length_m: 200, spacing_m: 100, interval_m: 10 };
  const run = ask({ op: 'mission.run', config: short, seconds: 20000, map: { half_m: 500, n: 11 } });
  if (run.error) assert('mission: a short survey runs', false, run.error);
  else {
    const k = run.knowledge, band = whitenedBand(k.observations);
    assert('mission: the lawnmower is driven to its end, and the rover at rest', run.done && Math.abs(run.rover.speed_m_s) < 1e-3, `${run.rover.odometer_m} m`);
    assert('mission: a reading every 10 m driven, and one where it started', run.readings_total === Math.floor(run.rover.odometer_m / 10) + 1, `${run.readings_total} readings, ${run.rover.odometer_m} m`);
    assert('mission: three observations a reading', k.observations === 3 * run.readings_total);
    assert('mission: the whitened innovations\' mean square within its 95 % band', k.whitened_mean_square > band[0] && k.whitened_mean_square < band[1], `${k.whitened_mean_square} in ${band}`);
    assert('mission: the truth is hidden unless revealed (no truth in the state, the readings or the map)',
      !run.truth && run.readings.every((r) => !r.truth_ned_nT) && !run.map.truth_total_nT && !run.map.calibration);
    assert('mission: where it has read, the field is known far better than before', Math.min(...run.map.sd_down_nT) < 0.1 * run.map.prior_sd_down_nT,
      `${Math.min(...run.map.sd_down_nT)} against ${run.map.prior_sd_down_nT} nT`);
  }
  const shown = ask({ op: 'mission.run', config: short, seconds: 20000, map: { half_m: 500, n: 11 }, reveal: true });
  if (!shown.error) {
    const c = shown.map.calibration;
    assert('mission: revealed, the posterior\'s error of |B| is below the prior\'s (T2015_449 alone)', c.rms_error_total_nT < 0.5 * c.rms_error_prior_total_nT, `${c.rms_error_total_nT} against ${c.rms_error_prior_total_nT} nT`);
    assert('mission: and the readings carry the truth they read', shown.readings.every((r) => Array.isArray(r.truth_ned_nT)) && shown.truth?.degree === 1440);
    const r0 = shown.readings[3];
    const noise = Math.hypot(...r0.ned_nT.map((v, i) => v - r0.truth_ned_nT[i]));
    assert('mission: a reading is the truth with noise of 0.5 nT a component (within 5 sd of its magnitude)', noise < 5 * 0.5 * Math.sqrt(3), `${noise} nT`);
  }
  const dyn = ask({ op: 'mission.run', config: { ...short, fidelity: 'dynamic' }, seconds: 20000 });
  if (dyn.error) assert('mission: the dynamic rover runs', false, dyn.error);
  else {
    assert('mission: the dynamic rover drives the same survey to its end', dyn.done && dyn.readings_total >= run.readings_total - 1, `${dyn.readings_total} readings`);
    check('mission: the ground carries its 140 kg in the Moon\'s gravity (N/(m g) − 1)', Math.abs(dyn.rover.normal_N / (140 * 4.9028001e12 / 1737.4e3 ** 2) - 1), 1e-6);
  }
  const adaptive = ask({ op: 'mission.run', config: { plan: 'adaptive', budget_m: 400, ring_m: 60, area_m: 150, interval_m: 10 }, seconds: 20000 });
  if (adaptive.error) assert('mission: an adaptive survey runs', false, adaptive.error);
  else {
    const site = adaptive.site, R = 1737.4e3, d = Math.PI / 180;
    const far = Math.max(...adaptive.track.map(([la, lo]) => Math.hypot((la - site.lat_deg) * d * R, (lo - site.lon_deg) * d * R * Math.cos(site.lat_deg * d))));
    assert('mission: the adaptive survey drives its budget, choosing each place where the field is least known', adaptive.done && adaptive.rover.odometer_m >= 400, `${adaptive.rover.odometer_m} m`);
    assert('mission: and keeps within its area and a ring\'s reach of it', far <= 150 + 60 + 1, `${far} m`);
  }
  const wrong = ask({ op: 'mission.run', config: { plan: 'spiral' } });
  assert('mission: a plan it does not know is refused, saying which it knows', /lawnmower/.test(wrong.error || ''));
  const none = ask({ op: 'mission.step', session: 'nobody', seconds: 10 });
  assert('mission: stepping a mission never started is refused', /no mission/.test(none.error || ''));
  const cal = ask({ op: 'mission.calibrate', config: { lines: 2, length_m: 200, spacing_m: 100, interval_m: 20 }, seeds: 24, half_m: 2000, n: 5 });
  if (cal.error) assert('mission: the calibration runs', false, cal.error);
  else {
    // 24 truths: the rms z's standard error is about 1/√(2 × 24) ≈ 0.14 (fewer independent draws than nodes).
    assert('mission: over 24 truths the posterior\'s z of B down has rms near 1', cal.rms_z_down > 0.65 && cal.rms_z_down < 1.35, `${cal.rms_z_down}`);
    assert('mission: and its 95 % intervals cover about 95 %', cal.coverage_95_down > 0.85 && cal.coverage_95_down <= 1, `${cal.coverage_95_down}`);
    const b = whitenedBand(cal.observations);
    assert('mission: the whitened innovations, pooled, within their 95 % band', cal.whitened_mean_square > b[0] && cal.whitened_mean_square < b[1], `${cal.whitened_mean_square} in ${b}`);
  }
} else skip('mission: the engine, the ephemeris or the Moon\'s crustal model is not in the cache (python data/acquisition/fetch.py moon-magnetic-t2015)');

// ---- the server's runtime, and a session in the engine (tests/check_runtime.py) ------------------------------------
if (!python) skip('runtime: no Python');
else {
  const r = spawnSync(python, [resolve(APP, 'tests/check_runtime.py')], { cwd: ROOT, encoding: 'utf8', timeout: 600000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const lines = (r.stdout || '').split('\n').filter((l) => l.startsWith('{'));
  if (!lines.length) assert('runtime: its checks ran', false, (r.stderr || '').slice(-400));
  for (const l of lines) {
    const x = JSON.parse(l);
    if (x.skip) skip(x.skip);
    else assert(x.check, x.ok, x.detail);
  }
  if (r.status !== 0) assert('runtime: its checks ended cleanly', false, (r.stderr || '').slice(-400));
}

done();
