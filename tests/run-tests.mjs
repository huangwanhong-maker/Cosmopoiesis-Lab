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
