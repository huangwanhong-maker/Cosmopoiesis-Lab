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
// bus, releases and skips, the instruments' readings, a session's determinism, the policies).
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
