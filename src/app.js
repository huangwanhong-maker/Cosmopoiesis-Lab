// The page of Cosmopoiesis: one world, the Solar System in its spacetime, on a console.
//
// The mission clock is the server's (clock.js): the world's instant in TT, the same for every page and
// every instrument. The engine gives every body's place and orientation about it (world.js); the
// scene draws them all in the ICRS's axes with the camera at the origin (scene.js); the camera is
// held on the body in focus by the shared layer's controls and flies between bodies (navigator.js).
// The instruments read the world at the clock's ticks on the server (runtime.py; the engine's
// acquisition session), and their readings reach the page on the bus (busclient.js), where the
// displays' pages show them by provenance. A point anywhere is written, read and answered in the
// language of addresses (the address line; the POINT page). Nothing pops up: the console's lamps and
// its log say what changes (console.js).
//
// Five things are kept apart and always shown, in the context bar beneath the clocks (decision 0006):
// what the camera looks at (the view), the point chosen (rose, in the world and on every display),
// the observer whose instruments read the environment (orchid), the frame positions are written in,
// and where the instruments are mounted. The science deck studies the point and its environment; the
// engineering deck shows the machinery.

import * as THREE from 'three';
import { globe } from '../../../visualization/js/index.js';
import { acquire, acquisition, engine, engineState, places, terrainState } from './api.js';
import { BusClient } from './busclient.js';
import { MissionClock } from './clock.js';
import { Console } from './console.js';
import { DEG, esc, fmt, latText, length, lonText, ttFromJd, ttText } from './format.js';
import { FieldLayers } from './fields.js';
import { Labels } from './labels.js';
import { loadMaps } from './maps.js';
import { DEFAULT_VIEWS, Navigator } from './navigator.js';
import { Gazetteer, parseCoordinates } from './places.js';
import { SatelliteLayer } from './satellites.js';
import { Scene } from './scene.js';
import { WorldMotion } from './world.js';
import { EXAMPLES, nearestPlace, pointPage } from './pages/point.js';
import { fieldPage } from './pages/field.js';
import { timePage } from './pages/time.js';
import { framesPage } from './pages/frames.js';
import { layersPage } from './pages/layers.js';
import { sysPage } from './pages/sys.js';
import { envPage } from './pages/env.js';
import { busPage } from './pages/bus.js';
import { instrPage } from './pages/instr.js';
import { schedPage } from './pages/sched.js';
import { roverPage } from './pages/rover.js';
import { robotPage } from './pages/robot.js';
import { Separator } from './separate.js';

const { cartesian, geodetic, IMAGERY, loadStarProduct, apply, applyTransposed, localFrame } = globe;
const $ = (s) => document.querySelector(s);
const STORE = 'cosmopoiesis-world';

const app = {
  ttMinusUtc: 69.184, tdbMinusTt: 0, engineOk: false, picked: null, observer: '', observerPlace: null, altitude: 0, bodiesNow: null,
};
window.cosmopoiesis = app;

// ---- the stored view, and the view in the page's address ------------------------------------------------
function restore() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
}
app.save = () => {
  if (!app.scene) return;
  try {
    const o = app.scene.options;
    localStorage.setItem(STORE, JSON.stringify({
      focus: app.nav.focus, follow: app.nav.follow, views: { ...app.nav.views, [app.nav.focus]: { ...app.nav.controls.view } },
      options: { base: o.base, night: o.night, data: o.data, dataOpacity: o.dataOpacity, reference: o.reference, atmosphere: o.atmosphere, milkyWay: o.milkyWay },
      labels: app.labels.enabled, satellites: app.satellites?.groups || [],
    }));
  } catch { /* storage unavailable */ }
};
// #earth/48.85660/2.35220/12000/0/30: body, latitude, longitude (degrees), range (m), heading, tilt (degrees).
function readHash() {
  const m = location.hash.match(/^#([a-z]+)\/(-?[\d.]+)\/(-?[\d.]+)\/([\d.e+]+)(?:\/(-?[\d.]+))?(?:\/([\d.]+))?/);
  if (!m) return null;
  return { body: m[1], view: { lat: Number(m[2]) * DEG, lon: Number(m[3]) * DEG, range: Number(m[4]), heading: Number(m[5] || 0) * DEG, tilt: Number(m[6] || 0) * DEG, height: 0 } };
}
let lastHash = '';
function writeHash() {
  if (app.nav.transfer) return;
  const v = app.nav.controls.view;
  const h = `#${app.nav.focus}/${(v.lat / DEG).toFixed(5)}/${(v.lon / DEG).toFixed(5)}/${Math.round(v.range)}/${(v.heading / DEG).toFixed(1)}/${(v.tilt / DEG).toFixed(1)}`;
  if (h !== lastHash) { history.replaceState(null, '', h); lastHash = h; }
}

// ---- theme ----------------------------------------------------------------------------------------------
function initTheme() {
  let theme = null;
  try { theme = localStorage.getItem('cosmopoiesis-theme'); } catch { /* none */ }
  if (!theme) theme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'day' : 'night';
  document.documentElement.dataset.theme = theme;
  $('#theme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'night' ? 'day' : 'night';
    document.documentElement.dataset.theme = next;
    for (const p of ['ENV', 'BUS']) app.pages[p]?.render?.(true);
    if (app.isShown?.('FIELD')) app.pages.FIELD.draw();
    app.touch?.();
    try { localStorage.setItem('cosmopoiesis-theme', next); } catch { /* none */ }
  });
}

// ---- the instant ----------------------------------------------------------------------------------------
app.onTime = (a) => {
  if (a.scales.UTC) app.ttMinusUtc = ((a.scales.TT.jd[0] - a.scales.UTC.jd[0]) + (a.scales.TT.jd[1] - a.scales.UTC.jd[1])) * 86400;
  app.tdbMinusTt = a.tdb_minus_tt_s || 0;
  const src = a.ut1_source || '';
  app.console.setLamp('eop', /measured/.test(src) ? 'good' : /predicted/.test(src) ? 'advisory' : 'caution',
    /measured/.test(src) ? 'UT1 from the IERS, measured' : /predicted/.test(src) ? 'UT1 from the IERS, predicted' : `UT1 approximated: ${src}`);
  updateImageryDate();
};
let timeAsked = 0;
async function refreshTime(force = false) {
  const now = performance.now();
  if (!force && now - timeAsked < 15000) return;
  timeAsked = now;
  try { app.onTime(await engine({ op: 'time', time: ttText(app.clock.now()) })); } catch { /* the lamp keeps its state */ }
}
function updateImageryDate() {
  const tt = app.clock.now();
  const away = -app.clock.fromPresent();
  let date = null;
  if (away > 1.5 * 86400) {
    const ms = (tt - app.ttMinusUtc) * 1000 + Date.UTC(2000, 0, 1, 12, 0, 0);
    date = new Date(ms).toISOString().slice(0, 10);
  }
  if (date !== app.scene.options.date && (!app.clock.running || Math.abs(app.clock.rate) <= 3600)) {
    app.scene.options.date = date;
    app.scene.setLayers();
  }
}

// ---- credits ----------------------------------------------------------------------------------------------
app.updateCredits = () => {
  const o = app.scene.options;
  const list = [];
  const focus = app.nav.focus;
  if (focus === 'earth') for (const id of [o.base.earth, o.night && 'gibs-blackmarble', o.data, o.reference]) if (id && IMAGERY[id]) list.push(IMAGERY[id].credit);
  if (focus === 'moon' && IMAGERY[o.base.moon]) list.push(IMAGERY[o.base.moon].credit);
  const m = app.scene.bodies[focus]?.map;
  if (m && (focus !== 'moon' || o.base.moon === 'map')) list.push(`${m.title}: ${m.credit}${m.live ? `; at close range ${m.live.credit}` : ''}`);
  if (focus === 'earth') list.push('Heights: ETOPO 2022 (NOAA NCEI); Mapzen Terrarium on AWS; EGM96 (NGA, via GeographicLib); land: Natural Earth');
  if (focus === 'moon') list.push('Heights: LOLA (NASA GSFC, PDS); names: IAU WGPSN (USGS)');
  if (o.synthetic) list.push('Detail below the data\'s resolution is synthetic (violet in the provenance layer)');
  if (focus === 'moon' && o.moonField && app.fields?.map) list.push(`${app.fields.map.title}: ${app.fields.map.credit}`);
  if (focus === 'earth' && o.fieldLines) list.push('Field lines: WMM2025 (NOAA NCEI, BGS), the core\'s field continued outward, traced by the engine');
  if (focus === 'earth' && o.fieldShell && app.fields?.shell) list.push(`On a sphere about the Earth: ${app.fields.shell.field.title} (${app.fields.shell.field.source})`);
  list.push('Ephemeris: JPL DE440s; the Moon: DE440 (NAIF); the Earth: IERS; stars: HYG v4.1 (CC BY-SA 4.0); Milky Way: Solar System Scope (CC BY 4.0)');
  list.push('Space weather: NOAA SWPC; earthquakes: USGS; geomagnetism: WMM2025 (NOAA NCEI, BGS); satellites: CelesTrak');
  $('#credits').textContent = list[0] + (list.length > 1 ? ` · and ${list.length - 1} more (SYS)` : '');
  app.pages.SYS?.setCredits(list);
};

// ---- the observer --------------------------------------------------------------------------------------------
// Whether a point chosen on a body moves the observer (and so its instruments) there: a per-viewer
// preference, on unless turned off in ENV.
const FOLLOW_KEY = 'cosmopoiesis-observer-follows';
app.observerFollows = (() => { try { return localStorage.getItem(FOLLOW_KEY) !== '0'; } catch { return true; } })();
app.setObserverFollows = (on) => {
  app.observerFollows = on;
  try { localStorage.setItem(FOLLOW_KEY, on ? '1' : '0'); } catch { /* no storage */ }
};
// Move the observer: the session's instruments mounted on it read there from the next step.
app.setObserver = async (text) => {
  if (!text) return;
  try {
    app.adoptAcquisition(await acquire({ observer: text }));
    app.console.message('advisory', `The observer is now at ${text}`, 'nav');
  } catch (error) {
    app.console.message('caution', `The observer was not moved: ${error.message}`, 'nav');
  }
  app.pages.ENV?.render(true);
  app.updateContext();
};
app.adoptAcquisition = (a) => {
  if (!a) return;
  app.acquisitionState = a;
  const changed = a.observer && a.observer !== app.observer;
  if (a.observer) app.observer = a.observer;
  if (a.observer_place) app.observerPlace = a.observer_place;
  if (changed) {
    app.pages.POINT?.showObserver();
    app.pages.FIELD?.onObserver();
    if (app.satellites) app.satellites.window = null;
    markObserver();
  }
  const err = a.error;
  app.console.setLamp('acq', err ? 'caution' : 'good', err ? `Acquisition stalled: ${err}` : 'The acquisition runs');
};
function markObserver() {
  const p = app.observerPlace;
  if (!p || !app.scene.bodies[p.body]) { app.scene.setFeature('observer', null, null); return; }
  const fig = app.scene.bodies[p.body].fig;
  app.scene.setFeature('observer', p.body, [cartesian(fig, p.longitude_deg * DEG, p.latitude_deg * DEG, (p.height_m || 0) + 3)], { kind: 'mark', colour: 0xb892dd });
}

// ---- the address line ----------------------------------------------------------------------------------------
// Three ways to the same address: a place's name (the gazetteer) or coordinates, typed; an example
// or the composer (a body, a latitude and longitude, a height, an instant), chosen when the line is
// empty; or the language of addresses itself, read by the engine as it is typed, whose error says
// where it stopped, what it expected, and how such an address is written.
let parseTimer = null;
function hintFor(expected, text) {
  const e = String(expected || '');
  if (/@|instant/.test(e) && /\)\s*[a-z]/i.test(text)) return 'a step from a point follows a slash, as earth(…)/aer(90°, 30°, 400 km); an instant follows @, as … @ now';
  if (/instant/.test(e)) return 'an instant: @ now, @ 2026-10-29T12:00:00Z, @ JD 2461343.0 TT';
  if (/coord|NUMBER|number/.test(e)) return 'coordinates: latitude, then longitude, with N S E W or °, and a height with its unit: moon(43.31 S, 11.36 W, 2000 m)';
  if (/\)/.test(e)) return 'close the coordinates with )';
  if (/BODY|FRAME|body|frame/.test(e)) return 'begin with a body (earth, moon, mars …) or a frame (ICRS, ITRS, GCRS …), or type a place\'s name';
  return 'an empty line shows examples';
}
function initAddress() {
  const input = $('#address-input'), list = $('#address-results'), echo = $('#address-echo');
  let results = [], active = 0;
  const examplesRows = () => [{ head: 'Examples: click one to put it in the line' }, ...EXAMPLES.map(([text, about]) => ({ example: text, about })), { compose: true }];
  const render = () => {
    list.hidden = results.length === 0;
    list.innerHTML = results.map((r, i) => {
      if (r.head) return `<li class="head">${esc(r.head)}</li>`;
      if (r.example) return `<li data-i="${i}" class="example ${i === active ? 'active' : ''}"><code>${esc(r.example)}</code><span class="kind">${esc(r.about)}</span></li>`;
      if (r.compose) {
        const b = ['earth', 'moon'].includes(app.nav.focus) ? app.nav.focus : 'earth';
        return `<li class="compose"><span class="kind" style="text-align:left">Or compose one</span><div class="compose-row">
          <select id="cmp-body">${['earth', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'sun'].map((k) => `<option value="${k}" ${k === b ? 'selected' : ''}>${esc(app.scene.bodies[k]?.name || k)}</option>`).join('')}</select>
          <input type="text" id="cmp-lat" placeholder="43.31 S" aria-label="Latitude"><input type="text" id="cmp-lon" placeholder="11.36 W" aria-label="Longitude">
          <input type="text" id="cmp-h" placeholder="0 m" aria-label="Height"><input type="text" class="wide" id="cmp-at" placeholder="@ now, or an ISO time" aria-label="Instant">
          <button type="button" class="key small" id="cmp-go">Write it</button></div></li>`;
      }
      return `<li data-i="${i}" class="${i === active ? 'active' : ''}"><span>${esc(r.name)}</span><span class="kind">${esc(r.kind)}${r.detail ? ` · ${esc(String(r.detail).slice(0, 34))}` : ''} · ${esc(r.body)}</span></li>`;
    }).join('');
  };
  const check = async () => {
    const text = input.value.trim();
    if (!text) { echo.innerHTML = '—'; return; }
    if (results.length && !results[0].example && !/[(:@/]/.test(text)) { echo.innerHTML = `${results.filter((r) => r.name).length} places · ↵ goes to the first`; return; }
    try {
      const a = await engine({ op: 'address', text, time: ttText(app.clock.now()), answers: [] });
      echo.innerHTML = `<span>${esc(a.display)}</span> · ↵ goes there`;
    } catch (error) {
      const syn = error.body?.syntax;
      if (syn) {
        const col = Math.min(text.length, syn.column);
        echo.innerHTML = `<span class="bad">${esc(text.slice(0, col))}<span class="caret">▸</span>${esc(text.slice(col))}</span> expected ${esc(syn.expected)} · <span class="hint">${esc(hintFor(syn.expected, text))}</span>`;
      } else {
        echo.innerHTML = `<span class="bad">${esc(error.message)}</span> · <span class="hint">${esc(hintFor('', text))}</span>`;
      }
    }
  };
  input.addEventListener('focus', () => { if (!input.value.trim()) { results = examplesRows(); active = -1; render(); } });
  input.addEventListener('input', () => {
    const c = parseCoordinates(input.value);
    const focus = app.nav.focus;
    results = c ? [{ name: `${latText(c.lat, 4)}, ${lonText(c.lon, 4)}`, lon: c.lon, lat: c.lat, kind: 'coordinates', body: ['earth', 'moon'].includes(focus) ? focus : 'earth' }] : [];
    if (!/[(:@/]/.test(input.value)) results = results.concat(app.gazetteer.search(input.value, ['earth', 'moon'].includes(focus) ? focus : 'earth'));
    if (!input.value.trim()) results = examplesRows();
    active = results[0]?.head ? -1 : 0;
    render();
    clearTimeout(parseTimer);
    parseTimer = setTimeout(check, 220);
  });
  list.addEventListener('click', (e) => {
    if (e.target.id !== 'cmp-go') return;
    const v = (id) => list.querySelector(`#${id}`).value.trim();
    const coord = (t, pos, neg) => (/[NSEW]$/i.test(t) ? t.toUpperCase() : t ? (Number(t) < 0 ? `${Math.abs(Number(t))} ${neg}` : `${Number(t)} ${pos}`) : '');
    const lat = coord(v('cmp-lat'), 'N', 'S'), lon = coord(v('cmp-lon'), 'E', 'W'), h = v('cmp-h'), at = v('cmp-at').replace(/^@\s*/, '');
    const coords = lat && lon ? `(${lat}, ${lon}${h ? `, ${/[a-z]$/i.test(h) ? h : `${h} m`}` : ''})` : '';
    app.putAddress(`${v('cmp-body')}${coords}${at ? ` @ ${at}` : ''}`);
    e.stopPropagation();
  });
  input.addEventListener('keydown', (e) => {
    const pickable = (i) => results[i] && !results[i].head && !results[i].compose;
    if (e.key === 'ArrowDown') { let i = active + 1; while (i < results.length && !pickable(i)) i++; if (pickable(i)) active = i; render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { let i = active - 1; while (i >= 0 && !pickable(i)) i--; if (pickable(i)) active = i; render(); e.preventDefault(); }
    if (e.key === 'Escape') { results = []; render(); }
  });
  $('#address').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    const chosen = results[active];
    if (chosen?.example) { app.putAddress(chosen.example); return; }
    if (/[(:/@]/.test(text) || /^(sun|mercury|venus|earth|moon|mars|jupiter|saturn|uranus|neptune|pluto|ssb|galaxy)\b/i.test(text) && !results.length) {
      results = []; render();
      await goToAddress(text);
    } else if (chosen?.name) {
      flyToPlace(chosen);
      results = []; render();
      input.blur();
    } else if (text) {
      await goToAddress(text);
    }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    const r = results[Number(li.dataset.i)];
    if (r?.example) { app.putAddress(r.example); return; }
    flyToPlace(r);
    results = []; render();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#address')) { results = []; render(); } });
}
app.putAddress = (text) => {
  const input = $('#address-input');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  input.focus();
};
app.goTo = (text) => { app.putAddress(text); goToAddress(text); };

function flyToPlace(p) {
  let range;
  if (p.size) range = Math.min(4e6, Math.max(2.5e4, p.size * 1000 * 2.2));
  else if (p.kind === 'Country') range = 4.0e6;
  else if (p.kind === 'coordinates') range = Math.min(app.nav.focus === p.body ? app.nav.controls.view.range : 2e5, 2.0e5);
  else range = 6.0e4;
  app.nav.flyToBody(p.body, { lon: p.lon * DEG, lat: p.lat * DEG, height: 0, range, tilt: range < 3e5 ? 35 * DEG : 0, heading: 0 }, app.bodiesNow);
  app.console.message('advisory', `To ${p.name} (${p.body})`, 'address');
}

// An address: resolved by the engine; a point on a body is flown to, a point in space is marked and
// looked at from its nearest body; an instant in it sets the world clock.
async function goToAddress(text) {
  try {
    const a = await engine({ op: 'address', text, time: ttText(app.clock.now()) });
    const instant = text.split('@')[1]?.trim();
    if (instant && instant !== 'now') await app.clock.setTime(instant);
    else if (instant === 'now') await app.clock.toPresent();
    const e = a.event;
    const onBody = e.body && app.scene.bodies[e.body] && a.answers.find((x) => x.frame === app.world.info.get(e.body)?.fixedFrame && x.values?.latitude_deg !== undefined);
    if (onBody && Math.abs(onBody.values.height_m) < 0.5 * app.scene.bodies[e.body].fig.a) {
      const h = onBody.values.height_m;
      app.nav.flyToBody(e.body, { lon: onBody.values.longitude_deg * DEG, lat: onBody.values.latitude_deg * DEG, height: Math.max(0, h), range: Math.max(3e4, Math.abs(h) * 3, 6e4), tilt: 35 * DEG, heading: 0 }, app.bodiesNow);
      app.picked = { body: e.body, lon: onBody.values.longitude_deg * DEG, lat: onBody.values.latitude_deg * DEG, h, address: a.canonical };
      choosePoint(app.picked);
      if (app.observerFollows) app.setObserver(a.canonical);
    } else {
      // A point in space (or a body's centre): mark it and look at it from the nearest body.
      const icrs = a.answers.find((x) => x.frame === 'ICRS' && x.chart === 'cartesian');
      const p = icrs ? [icrs.values.x_m, icrs.values.y_m, icrs.values.z_m] : null;
      if (p && app.bodiesNow) {
        let best = null;
        for (const [key, B] of Object.entries(app.bodiesNow)) {
          if (!B?.position) continue;
          const d = Math.hypot(p[0] - B.position[0], p[1] - B.position[1], p[2] - B.position[2]);
          if (!best || d < best.d) best = { key, d, B };
        }
        app.scene.setFeature('goto', 'icrs', [p], { kind: 'mark', colour: 0xee8fbd });
        if (best) {
          const local = applyTransposed(best.B.rotation, [p[0] - best.B.position[0], p[1] - best.B.position[1], p[2] - best.B.position[2]]);
          const g = geodetic(app.scene.bodies[best.key].fig, ...local);
          const r = Math.max(best.d * 1.6, app.scene.bodies[best.key].fig.a * 3);
          app.nav.flyToBody(best.key, { lon: g.lon, lat: g.lat, height: 0, range: r, tilt: 0, heading: 0 }, app.bodiesNow);
        }
      }
      app.picked = { address: a.canonical };
      choosePoint(app.picked);
    }
    app.console.message('advisory', `To ${a.display}`, 'address');
  } catch (error) {
    app.console.message('caution', `Not an address the engine can resolve: ${error.message}`, 'address');
  }
}

// A point chosen: marked in rose on its body, answered by POINT, and the field's cube moved to it.
function choosePoint(p) {
  if (p.body && p.lat !== undefined && app.scene.bodies[p.body]) {
    const fig = app.scene.bodies[p.body].fig;
    app.scene.setFeature('chosen', p.body, [cartesian(fig, p.lon, p.lat, (p.h || 0) * app.scene.options.exaggeration + 2)], { kind: 'mark', colour: 0xee8fbd });
  } else app.scene.setFeature('chosen', null, null);
  app.pages.POINT?.choose(p);
  app.pages.FIELD?.onPoint();
  app.updateContext();
}
app.flyToPoint = () => {
  const p = app.picked;
  if (!p?.body || p.lat === undefined) { if (p?.address) goToAddress(p.address); return; }
  const range = app.nav.focus === p.body ? Math.min(app.nav.controls.view.range, 2e5) : 2e5;
  app.nav.flyToBody(p.body, { lon: p.lon, lat: p.lat, height: Math.max(0, p.h || 0), range, tilt: 35 * DEG, heading: 0 }, app.bodiesNow);
};
// The field's cube about the point chosen or the observer.
app.openField = (which) => {
  app.console.open('FIELD');
  app.pages.FIELD.centreOn(which);
};

// ---- the pointer ----------------------------------------------------------------------------------------------
function initPointer(canvas) {
  let down = null;
  canvas.addEventListener('pointermove', (e) => { app.pointer = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerleave', () => { app.pointer = null; });
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || performance.now() - down.t > 450 || app.nav.transfer) return;
    const rect = canvas.getBoundingClientRect();
    const named = app.labels.at(e.clientX - rect.left, e.clientY - rect.top);
    if (named?.satellite) { app.satellites.select(named.satellite); return; }
    if (named?.body) { app.nav.flyToBody(named.body, null, app.bodiesNow); return; }
    if (named?.place) { flyToPlace({ ...named.place, body: app.nav.focus }); return; }
    const hit = app.nav.controls.pick(e.clientX, e.clientY);
    if (!hit) return;
    const key = app.nav.focus, fig = app.scene.bodies[key].fig;
    const g = geodetic(fig, ...hit);
    const h = g.h / app.scene.options.exaggeration;
    const address = `${key}(${latText(g.lat / DEG, 7)}, ${lonText(g.lon / DEG, 7)}, ${h.toFixed(1)} m)`;
    app.picked = { body: key, lon: g.lon, lat: g.lat, h, address };
    app.console.open('POINT');
    choosePoint(app.picked);
    // The observer's instruments follow the point chosen, unless ENV's switch says otherwise.
    if (app.observerFollows) app.setObserver(address);
    else app.pages.ENV?.render(true);
    app.putAddress(address);
  });
}

// ---- the labels -----------------------------------------------------------------------------------------------
const projected = new THREE.Vector3();
function projector(s) {
  const { w, h } = s.size;
  return (p) => {
    projected.set(p[0], p[1], p[2]).applyMatrix4(s.camera.matrixWorldInverse);
    if (projected.z > 0) return null;
    projected.applyMatrix4(s.camera.projectionMatrix);
    if (Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) return null;
    return [(projected.x + 1) * 0.5 * w, (1 - projected.y) * 0.5 * h];
  };
}
function drawLabels(bodies, P, sats) {
  const s = app.scene, key = app.nav.focus, b = s.bodies[key], B = bodies[key];
  const project = projector(s);
  const rel = [B.position[0] - P[0], B.position[1] - P[1], B.position[2] - P[2]];
  const camBody = applyTransposed(B.rotation, rel).map((x) => -x);
  const extra = [];
  // The bodies' names, at their centres when small and above their limbs when large.
  if (app.labels.enabled.bodies) {
    for (const [k, body] of Object.entries(s.bodies)) {
      const Bk = bodies[k];
      if (!Bk) continue;
      const r = [Bk.position[0] - P[0], Bk.position[1] - P[1], Bk.position[2] - P[2]];
      const d = Math.hypot(...r);
      if (k === key && d < 8 * body.fig.a) continue;
      const screen = project(r);
      if (screen) extra.push({ name: body.name, screen, body: k, chosen: false });
    }
  }
  // The satellites named: the chosen one, and all of a few.
  const earth = s.bodies.earth, E = bodies.earth;
  if (sats.length && earth && E) {
    const camEarth = applyTransposed(E.rotation, [P[0] - E.position[0], P[1] - E.position[1], P[2] - E.position[2]]);
    const few = sats.length <= 40;
    for (const { satellite: sat, position: p } of sats) {
      const chosen = app.satellites.selected?.norad === sat.norad;
      if (!chosen && !few && sat.group !== 'stations') continue;
      const bodyP = applyTransposed(E.rotation, p);
      if (globe.occluded(earth.fig, camEarth, bodyP, 0)) continue;
      const screen = project([p[0] + E.position[0] - P[0], p[1] + E.position[1] - P[1], p[2] + E.position[2] - P[2]]);
      if (screen) extra.push({ name: sat.name.trim(), screen, satellite: sat, chosen });
    }
  }
  // The point chosen and the observer, named beside their marks (first, so that nothing hides them).
  const marks = [];
  const at = (bodyKey, lonRad, latRad, h) => {
    const bb = s.bodies[bodyKey], BB = bodies[bodyKey];
    if (!bb || !BB) return null;
    const x = cartesian(bb.fig, lonRad, latRad, h);
    const camHere = applyTransposed(BB.rotation, [P[0] - BB.position[0], P[1] - BB.position[1], P[2] - BB.position[2]]);
    if (globe.occluded(bb.fig, camHere, x, 50)) return null;
    const w = apply(BB.rotation, x);
    return project([w[0] + BB.position[0] - P[0], w[1] + BB.position[1] - P[1], w[2] + BB.position[2] - P[2]]);
  };
  const pk = app.picked, op = app.observerPlace;
  const same = pk && (pk.canonical || pk.address) === app.observer;
  if (pk?.body && pk.lat !== undefined) { const sc = at(pk.body, pk.lon, pk.lat, pk.h || 0); if (sc) marks.push({ name: same ? 'Point · observer' : 'Point', screen: sc, chosen: true, colour: '#FF9FCE' }); }
  if (op && !same) { const sc = at(op.body, op.longitude_deg * DEG, op.latitude_deg * DEG, op.height_m || 0); if (sc) marks.push({ name: 'Observer', screen: sc, chosen: true, colour: '#CDB0EE' }); }
  const night = document.documentElement.dataset.theme !== 'day';
  app.labels.draw(['earth', 'moon'].includes(key) ? { body: key, fig: b.fig, rotation: B.rotation, rel, camBody, range: app.nav.controls.view.range, project } : null,
    { size: 13, font: "'IBM Plex Sans Condensed', 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif", ink: night ? '#F7ECF6' : '#FFF8FD', halo: 'rgba(18, 8, 24, 0.8)', dot: '#EE8FBD',
      satellite: '#F2D8EC', chosen: '#FF9FCE', body: '#E9D2F2' }, [...marks, ...extra]);
}

// ---- the frame loop -------------------------------------------------------------------------------------------
let lastStatus = 0, lastDraw = 0;
app.dirty = true;
app.touch = () => { app.dirty = true; };
function clockInterval() {
  if (!app.clock.running) return Infinity;
  const r = Math.abs(app.clock.rate);
  return r <= 1 ? 250 : r <= 60 ? 100 : 0;
}
function frame(now) {
  requestAnimationFrame(frame);
  const flying = !!app.nav.controls.flight || !!app.nav.transfer;
  const due = app.dirty || flying || now - lastDraw >= clockInterval();
  if (now - lastStatus > 250) { lastStatus = now; status(); }
  if (!due || !app.world.window) return;
  app.dirty = false;
  lastDraw = now;
  const tt = app.clock.now();
  app.world.ensure(tt, app.clock.running ? app.clock.rate : 1);
  const bodies = app.world.at(tt);
  if (!bodies) return;
  app.bodiesNow = bodies;
  app.nav.tick(now, bodies);
  const cam = app.nav.camera(bodies);
  app.altitude = app.nav.altitude(cam, bodies);
  app.satellites.ensure(tt, app.clock.running ? app.clock.rate : 1);
  const sats = app.satellites.draw(tt);
  const { P, stats } = app.scene.draw({ cam, bodies, altitude: app.altitude, starBrightness: starBrightness(bodies, cam) });
  app.stats = stats;
  drawLabels(bodies, P, sats);
  app.north = northOnScreen(bodies, P);
  app.fields?.tick(tt);
  const st = stats[app.nav.focus];
  if (st?.loading > 0) setTimeout(app.touch, 200);
}
// The direction on the screen of the focus body's north at the view's target: the target and a point
// a hundredth of the range north of it (along the meridian, toward the body's rotation pole), both
// projected. Read from the picture, it holds for any heading, tilt or following of the stars; it is
// null in a flight between bodies, or where the target is not on the screen.
function northOnScreen(bodies, P) {
  if (app.nav.transfer) return null;
  const key = app.nav.focus, B = bodies[key], body = app.scene.bodies[key], v = app.nav.controls.view;
  if (!B || !body) return null;
  const project = projector(app.scene);
  const at = (q) => { const w = apply(B.rotation, q); return project([w[0] + B.position[0] - P[0], w[1] + B.position[1] - P[1], w[2] + B.position[2] - P[2]]); };
  const t = cartesian(body.fig, v.lon, v.lat, v.height), N = localFrame(v.lon, v.lat)[1], step = 0.01 * v.range;
  const a = at(t), b = at([t[0] + step * N[0], t[1] + step * N[1], t[2] + step * N[2]]);
  if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3) return null;
  return Math.atan2(b[0] - a[0], a[1] - b[1]);
}

// The stars fade within the sunlit air of the Earth.
function starBrightness(bodies, cam) {
  if (app.nav.focus !== 'earth' || app.altitude > 8e4 || app.nav.transfer) return 1;
  const E = bodies.earth, S = bodies.sun.position;
  const up = applyTransposed(E.rotation, [cam.position[0] - E.position[0], cam.position[1] - E.position[1], cam.position[2] - E.position[2]]);
  const sun = applyTransposed(E.rotation, [S[0] - E.position[0], S[1] - E.position[1], S[2] - E.position[2]]);
  const elevation = (up[0] * sun[0] + up[1] * sun[1] + up[2] * sun[2]) / (Math.hypot(...up) * Math.hypot(...sun));
  const day = Math.min(1, Math.max(0, (elevation + 0.1) / 0.2));
  return 1 - day * (1 - app.altitude / 8e4);
}

function status() {
  const tt = app.clock.now();
  app.console.updateClocks(tt, { ttMinusUtc: app.ttMinusUtc, tdbMinusTt: app.tdbMinusTt, rate: app.clock.rate, running: app.clock.running, fromPresent: app.clock.fromPresent() });
  app.console.updateTimeKeys(app.clock);
  const away = app.clock.fromPresent();
  app.console.setLamp('clk', Math.abs(away) > 60 ? 'advisory' : 'good', Math.abs(away) > 60 ? 'The world is not at the present: physical instruments read the present beside it' : 'The world at the present');
  if (!app.scene) return;
  const v = app.nav.controls.view;
  const name = app.scene.bodies[app.nav.focus]?.name || '';
  const rose = $('#compass');
  rose.classList.toggle('off', app.north === null || app.north === undefined);
  if (app.north !== null && app.north !== undefined) $('#compass-needle').setAttribute('transform', `rotate(${(app.north / DEG).toFixed(2)} 20 20)`);
  rose.title = `${name}'s north at the centre of the view, toward its rotation pole (not a magnetic compass: that is an instrument, in ENV). A click turns north up.`;
  $('#hud-focus').textContent = app.nav.transfer ? `→ ${app.scene.bodies[app.nav.transfer.key].name}` : `${name} · ${length(v.range)}`;
  app.console.markFocus(app.nav.transfer ? app.nav.transfer.key : app.nav.focus, name);
  $('#eye').textContent = `eye ${length(app.altitude)}`;
  if (app.pointer && !app.nav.transfer) {
    const hit = app.nav.controls.pick(app.pointer.x, app.pointer.y);
    if (hit) {
      const g = geodetic(app.scene.bodies[app.nav.focus].fig, ...hit);
      $('#cursor').textContent = `${app.nav.focus} ${latText(g.lat / DEG, 5)}, ${lonText(g.lon / DEG, 5)}, ${fmt(g.h / app.scene.options.exaggeration, 0)} m`;
    } else $('#cursor').textContent = '—';
  }
  const st = app.stats?.[app.nav.focus];
  $('#tiles').textContent = st ? `${st.drawn ?? 0} tiles${st.loading ? ` · ${st.loading} loading` : ''}` : '';
  app.console.setLamp('tile', st?.loading ? 'advisory' : 'off', st?.loading ? `${st.loading} tiles coming` : '');
  app.console.setLamp('eph', app.world.window ? 'good' : 'caution', app.world.window ? 'The bodies placed by DE440' : 'No ephemeris window yet');
  app.console.setLamp('bus', app.bus.ok ? 'good' : 'caution', app.bus.ok ? 'Readings arrive' : `The bus is silent: ${app.bus.error || ''}`);
  app.pages.POINT.update();
  app.pages.TIME.update();
  app.updateContext();
  if (app.clock.running) refreshTime();
  updateImageryDate();
  writeHash();
}

// ---- the context --------------------------------------------------------------------------------------------
// What is looked at, the point chosen, the observer, the frame, the instruments' mounts, and how the
// point and the observer stand to each other: written only when it changes.
const FIGURE_CHART = { earth: 'geodetic on WGS 84', moon: 'on the Moon\'s sphere' };
const contextShown = {};
function put(id, text) { if (contextShown[id] !== text) { contextShown[id] = text; const e = document.getElementById(id); if (e) e.textContent = text; } }
const placeText = (body, latDeg, lonDeg) => `${app.scene?.bodies[body]?.name || body || ''} ${latText(latDeg, 3)}, ${lonText(lonDeg, 3)}`.trim();
app.updateContext = () => {
  if (!app.scene || !app.nav) return;
  const v = app.nav.controls.view, key = app.nav.focus, name = app.scene.bodies[key]?.name || key;
  put('ctx-view-value', app.nav.transfer ? `flying to ${app.scene.bodies[app.nav.transfer.key]?.name || ''}` : `${name} · ${length(v.range)} away`);
  const p = app.picked;
  let point = 'none: click the world';
  if (p?.body && p.lat !== undefined) {
    const near = nearestPlace(app.gazetteer, p.body, p.lat / DEG, p.lon / DEG);
    point = `${near?.inside ? `${near.entry.name} · ` : ''}${placeText(p.body, p.lat / DEG, p.lon / DEG)}`;
  } else if (p?.address) point = p.canonical || p.address;
  put('ctx-point-value', point);
  const o = app.observerPlace;
  put('ctx-observer-value', `${o ? placeText(o.body, o.latitude_deg, o.longitude_deg) : app.observer || '—'}${app.observerFollows ? ' · follows the point' : ''}`);
  const frame = app.world?.info.get(key)?.fixedFrame || '';
  put('ctx-frame-value', `${frame}${FIGURE_CHART[key] ? ` · ${FIGURE_CHART[key]}` : frame ? ' · its IAU sphere' : ''}`);
  const sensors = app.acquisitionState?.session?.sensors || [];
  const on = sensors.filter((s) => s.mount === 'observer').length, feeds = sensors.filter((s) => s.external).length;
  put('ctx-mounts-value', sensors.length ? `${on} on the observer · ${sensors.length - on - feeds} elsewhere · ${feeds} feeds` : '—');
  let rel = '';
  if (p && o) {
    if ((p.canonical || p.address) === app.observer) rel = 'the observer stands at the point';
    else if (p.body === o.body && p.lat !== undefined && app.scene.bodies[p.body]) {
      const R = app.scene.bodies[p.body].fig.a, la = o.latitude_deg * DEG, lb = p.lat, dl = p.lon - o.longitude_deg * DEG;
      const d = R * Math.acos(Math.min(1, Math.max(-1, Math.sin(la) * Math.sin(lb) + Math.cos(la) * Math.cos(lb) * Math.cos(dl))));
      rel = `the point is ${length(d)} from the observer`;
    } else if (p.body && o.body && p.body !== o.body) rel = `the point and the observer are on different bodies`;
  }
  put('ctx-relation-value', rel);
};

// The lamps the readings light.
function readingsLamps() {
  const v = (id) => app.bus.values(id);
  const ntp = app.bus.get('ntp');
  if (ntp?.available) {
    const o = Math.abs(ntp.values.offset_s);
    app.console.setLamp('ntp', o > 2 ? 'warning' : o > 0.5 ? 'caution' : 'good', `This computer's clock is ${fmt(ntp.values.offset_s * 1e3, 0)} ms from UTC`);
  } else if (ntp) app.console.setLamp('ntp', 'advisory', `NTP: ${ntp.reason}`);
  const kp = v('swpc.kp')?.kp, xr = v('goes.xray')?.class, pr = v('goes.protons')?.radiation_storm;
  const severe = (xr && xr[0] === 'X') || (pr && Number(pr[1]) >= 3) || kp >= 7;
  const active = kp >= 5 || (xr && xr[0] === 'M') || (pr && pr !== 'none');
  if (kp !== undefined || xr) {
    app.console.setLamp('swx', severe ? 'warning' : active ? 'caution' : 'good',
      `Space weather: Kp ${fmt(kp, 2)}, X-rays ${xr || '—'}, protons ${pr === 'none' ? 'quiet' : pr || '—'}`);
  }
  const quakes = app.bus.events.filter((e) => e.kind === 'earthquake' && Date.now() / 1000 - (e.delivered_wall || 0) < 86400);
  const big = quakes.reduce((m, e) => Math.max(m, e.values?.magnitude || 0), 0);
  if (quakes.length) app.console.setLamp('seis', big >= 7 ? 'warning' : big >= 6 ? 'caution' : 'advisory', `${quakes.length} earthquake${quakes.length > 1 ? 's' : ''} since this page opened, the largest M ${fmt(big, 1)}`);
  const late = app.acquisitionState?.stats?.late_total;
  if (late !== undefined) app.console.setLamp('acq', app.acquisitionState.error ? 'caution' : 'good', app.acquisitionState.error ? `Acquisition stalled: ${app.acquisitionState.error}` : `The acquisition runs; ${late} late in all`);
}

// ---- orbits ---------------------------------------------------------------------------------------------------
// Each planet's path over one period, as DE440 gives it (barycentric, so the Sun's own small motion is
// in it), its period from the vis-viva relation on its present state about the Sun; and the Moon's
// about the Earth over a sidereal month. Drawn in the system's views, hidden near a body's ground.
async function drawOrbits() {
  const tt = app.clock.now();
  const at = app.world.at(tt), later = app.world.at(tt + 60);
  if (!at || !later) return;
  const gmSun = app.world.info.get('sun')?.gm || 1.32712440041279419e20;
  // The ephemeris's span in TDB seconds from J2000, taken as TT (they differ by 2 ms at most).
  if (!app.ephemerisSpan) try { app.ephemerisSpan = (await engine({ op: 'status' })).ephemeris_coverage_et; } catch { /* unbounded */ }
  for (const key of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
    if (!at[key]) continue;
    const r = [0, 1, 2].map((k) => at[key].position[k] - at.sun.position[k]);
    const v = [0, 1, 2].map((k) => (later[key].position[k] - later.sun.position[k] - r[k]) / 60);
    const mu = gmSun + (app.world.info.get(key)?.gm || 0);
    const a = 1 / (2 / Math.hypot(...r) - (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) / mu);
    if (!(a > 0)) continue;
    const period = 2 * Math.PI * Math.sqrt(a ** 3 / mu);
    const step = Math.max(600, period / 360);
    // The window about the instant, moved inside the ephemeris's span when a period is long (Pluto's
    // 248 years does not fit about every instant of DE440's 1849 to 2150).
    const [lo, hi] = app.ephemerisSpan || [-Infinity, Infinity];
    const span = Math.min(period, step * 3999, hi - lo - 2 * step);
    const start = Math.min(Math.max(tt - span / 2, lo + step), hi - step - span);
    try {
      const ans = await engine({ op: 'bodies', bodies: [key], start: ttText(start), span, step });
      const pts = ans.bodies[0].position;
      pts.push(pts[0]);
      app.scene.setFeature(`orbit-${key}`, 'icrs', pts, { kind: 'path', colour: 0xb892dd, opacity: 0.42, depthTest: true, hideBelow: 2e8, group: 'orbits' });
    } catch { /* a planet without its orbit */ }
  }
  try {
    const month = 27.321661 * 86400;  // the sidereal month (the orbit closes on the stars)
    const ans = await engine({ op: 'bodies', bodies: ['earth', 'moon'], start: ttText(tt - month / 2), span: month, step: month / 360 });
    const [e, m] = ans.bodies[0].key === 'earth' ? ans.bodies : [ans.bodies[1], ans.bodies[0]];
    const pts = m.position.map((p, i) => [p[0] - e.position[i][0], p[1] - e.position[i][1], p[2] - e.position[i][2]]);
    app.scene.setFeature('orbit-moon', 'earth:inertial', pts, { kind: 'path', colour: 0xb892dd, opacity: 0.38, depthTest: true, hideBelow: 2e7, group: 'orbits' });
  } catch { /* no Moon's orbit */ }
}

// ---- start ---------------------------------------------------------------------------------------------------
async function main() {
  initTheme();
  app.console = new Console(app);
  for (const [id, label, title] of [['eng', 'Eng', 'The engine'], ['eph', 'Eph', 'The ephemeris'], ['eop', 'EOP', 'The Earth\'s orientation'], ['clk', 'Clk', 'The world clock'], ['ntp', 'NTP', 'This computer\'s clock'],
    ['acq', 'Acq', 'The acquisition'], ['bus', 'Bus', 'The bus of readings'], ['tile', 'Tiles', 'Terrain and imagery'], ['swx', 'SWx', 'Space weather'], ['seis', 'Seis', 'Earthquakes']]) app.console.lamp(id, label, title);
  app.clock = new MissionClock();
  try { await app.clock.sync(); } catch (error) { app.console.message('warning', `The server's clock did not answer: ${error.message}`, 'clock'); }
  setInterval(() => app.clock.sync().catch(() => {}), 5000);
  app.clock.on(() => { app.touch(); refreshTime(true); });

  const [eng, ter, maps] = await Promise.allSettled([engineState(), terrainState(), loadMaps()]);
  app.engineOk = eng.status === 'fulfilled' && eng.value.built && eng.value.data?.ephemeris;
  app.console.setLamp('eng', app.engineOk ? (eng.value.current === false ? 'caution' : 'good') : 'warning',
    app.engineOk ? (eng.value.current === false ? 'The engine was built from older sources (SYS rebuilds it)' : 'The engine answers') : 'The engine is not built, or the ephemeris is missing (SYS)');
  if (!app.engineOk) { showSetup(eng); return; }

  // The world's first window gives the bodies the scene draws.
  app.world = new WorldMotion({ onWindow: () => app.touch(), onError: (e) => app.console.message('caution', `The ephemeris did not come: ${e.message}`, 'world') });
  app.world.ensure(app.clock.now(), app.clock.rate);
  await app.world.loading;
  if (!app.world.window) { app.console.message('warning', 'No ephemeris window: the world cannot be drawn', 'world'); return; }
  const terrain = ter.status === 'fulfilled' ? ter.value : null;
  const bodies = [...app.world.info.values()];
  app.scene = new Scene($('#globe'), { bodies, maps: maps.status === 'fulfilled' ? maps.value : { bodies: {} },
    maxLevel: terrain?.max_level || { earth: 16, moon: 12 }, terrainReady: { earth: !!terrain?.bodies.earth.ready, moon: !!terrain?.bodies.moon.ready } });
  const saved = restore();
  if (saved?.options) { const o = app.scene.options; Object.assign(o, { ...saved.options, base: { ...o.base, ...(saved.options.base || {}) } }); app.scene.setLayers(); }
  app.scene.onChange = app.touch;
  app.labels = new Labels($('#labels'));
  app.labels.cover = () => {
    const rect = (s) => document.querySelector(s)?.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight, top = rect('#context') || rect('.glare'), foot = rect('#cdu');
    return [top && [0, 0, W, top.bottom], foot && [0, foot.top, W, H],   // the bars, from the window's edges
      ...['#mfd-left', '#mfd-right'].map(rect).filter((r) => r?.width).map((r) => [r.left, r.top, r.right, r.bottom])].filter(Boolean);
  };
  if (saved?.labels) Object.assign(app.labels.enabled, saved.labels);
  app.gazetteer = new Gazetteer();
  app.nav = new Navigator($('#globe'), app.scene, { onChange: app.touch });
  if (saved?.views) Object.assign(app.nav.views, saved.views);
  if (saved?.follow) app.nav.follow = saved.follow;
  const hash = readHash();
  app.nav.setFocus(hash?.body && app.scene.bodies[hash.body] ? hash.body : (saved?.focus && app.scene.bodies[saved.focus] ? saved.focus : 'earth'), hash?.view || null);

  const resize = () => { app.scene.resize(); app.labels.resize(app.scene.size.w, app.scene.size.h, Math.min(window.devicePixelRatio || 1, 2)); };
  window.addEventListener('resize', resize);
  resize();

  app.satellites = new SatelliteLayer(app);
  app.fields = new FieldLayers(app);
  if (Array.isArray(saved?.satellites)) app.satellites.groups = saved.satellites;
  app.bus = new BusClient();

  // The displays and their pages, each of the science deck, the engineering deck, or both.
  const LEFT = [['POINT', 'The point chosen: its place, from the observer, in every frame', 'science'], ['LAYERS', 'What is drawn', 'science'], ['TIME', 'The instant in its scales', 'both'],
    ['FRAMES', 'The catalogue of frames and its loops', 'engineering'], ['SYS', 'The engine, the data, the messages', 'engineering']];
  const RIGHT = [['ENV', 'The environment the observer\'s instruments read', 'science'], ['FIELD', 'The field about a point, as a cube filled with colour', 'science'], ['INSTR', 'The instruments, their readings first', 'both'],
    ['ROVER', 'A rover surveying the Moon\'s field, and what its mission knows', 'science'],
    ['ROBOT', 'Bodies with joints: a rabbit on the Moon, a fish in the ocean, a dog on the ground', 'science'],
    ['BUS', 'Every stream of readings, with its envelope', 'engineering'], ['SCHED', 'The acquisition\'s scheduling', 'engineering']];
  app.separator = new Separator();
  app.console.display('left', LEFT);
  app.console.display('right', RIGHT);
  app.pages = { POINT: pointPage(app), TIME: timePage(app), FRAMES: framesPage(app), LAYERS: layersPage(app), SYS: sysPage(app),
    ENV: envPage(app), FIELD: fieldPage(app), BUS: busPage(app), INSTR: instrPage(app), SCHED: schedPage(app), ROVER: roverPage(app), ROBOT: robotPage(app) };
  for (const [k] of LEFT) app.console.register('left', k, app.pages[k]);
  for (const [k] of RIGHT) app.console.register('right', k, app.pages[k]);
  app.isShown = (k) => app.console.isShown(k) || app.separator.pageHasOut(k);  // a page whose figure is out is kept current
  const shown = app.console.restore();
  app.console.deck = shown?.deck === 'engineering' ? 'engineering' : 'science';
  app.console.show('left', shown?.left && app.pages[shown.left] && LEFT.some(([k]) => k === shown.left) ? shown.left : 'POINT');
  app.console.show('right', shown?.right && RIGHT.some(([k]) => k === shown.right) ? shown.right : 'ENV');
  app.console.setDeck(app.console.deck);
  for (const b of document.querySelectorAll('.glare [data-deck]')) b.addEventListener('click', () => app.console.setDeck(b.dataset.deck));
  // The context: each part opens the page that studies it.
  $('#ctx-view').addEventListener('click', () => app.console.open('POINT'));
  $('#ctx-point').addEventListener('click', () => { app.console.open('POINT'); if (app.picked) app.flyToPoint(); });
  $('#ctx-observer').addEventListener('click', () => app.console.open('ENV'));
  $('#ctx-frame').addEventListener('click', () => app.console.open('FRAMES'));
  $('#ctx-mounts').addEventListener('click', () => app.console.open('INSTR'));
  app.console.bodyKeys(bodies, (key) => {
    if (key === 'system') app.nav.flyToBody('sun', DEFAULT_VIEWS.sun, app.bodiesNow);
    else app.nav.flyToBody(key, null, app.bodiesNow);
  });
  app.console.timeKeys(app.clock);
  $('#compass').addEventListener('click', () => app.nav.controls.flyTo({ heading: 0, tilt: 0 }, 0.8));
  $('#messages-all').addEventListener('click', () => app.console.open('SYS'));
  initAddress();
  initPointer($('#globe'));
  app.updateCredits();

  app.bus.on(() => { app.pages.ENV.onReadings(); app.pages.BUS.onReadings(); readingsLamps(); });
  app.bus.start();
  acquisition().then(app.adoptAcquisition, () => {});
  setInterval(() => acquisition().then(app.adoptAcquisition, () => {}), 10000);
  await refreshTime(true);
  app.console.message('advisory', `${bodies.length} bodies placed by DE440; the world clock ${app.clock.running ? 'runs' : 'is held'}`, 'world');

  requestAnimationFrame(frame);
  // The sky and the names, as they come.
  const galactic = engine({ op: 'transform', from: 'GALACTIC', to: 'ICRS', time: ttText(app.clock.now()) }).then((a) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => a.rotation[j][i])), () => null);
  Promise.all([loadStarProduct('data', 'stars-v1', 6.5).catch(() => null), galactic]).then(([stars, g]) => app.scene.setSky(stars, g));
  for (const b of ['earth', 'moon']) places(b).then((p) => { app.gazetteer.add(b, p); app.labels.setPlaces(b, p); app.touch(); }, () => {});
  drawOrbits();
  window.addEventListener('beforeunload', () => app.save());
  setInterval(() => app.save(), 10000);
}

function showSetup(eng) {
  const card = $('#setup-card');
  const why = eng.status === 'rejected' ? `The server did not answer (${eng.reason.message}).` : !eng.value.built ? 'The engine is not built yet.' : 'The ephemeris is not on this computer yet.';
  card.innerHTML = `<h4>The world is not ready</h4><p>${esc(why)} The recipe compiles the engine (g++ in WSL or natively) and fetches the ephemeris, the Earth's orientation, the terrain's sources and the instruments' models.</p>
    <p><button type="button" class="key" id="setup-run">Fetch and build what is missing</button></p>`;
  card.hidden = false;
  card.addEventListener('click', async (e) => {
    if (e.target.id === 'setup-run') {
      try { await fetch('setup/run', { method: 'POST' }); } catch { /* the log reports */ }
      card.innerHTML = '<h4>Building</h4><p>The recipe runs; reload the page when it is done (python data/acquisition/recipe.py applications/cosmopoiesis-lab/recipe.json does the same).</p>';
    }
  });
}

app.showSatellite = (s) => {
  const card = $('#sat-card');
  if (!s) { card.hidden = true; return; }
  const g = s.geodetic || {}, o = s.observer;
  const v = s.gcrs ? Math.hypot(...s.gcrs.velocity_m_s) : NaN;
  card.innerHTML = `<button type="button" class="link close" aria-label="Close">×</button><h4>${esc(s.name)}</h4>
    <p class="note">NORAD ${s.norad} · ${esc(s.designator)} · ${esc(s.group)}</p>
    <table><tbody>
      <tr><th>Height</th><td class="num">${fmt((g.height_m || 0) / 1000, 1)} km</td></tr>
      <tr><th>Beneath it</th><td class="num">${latText(g.latitude_deg ?? 0, 3)}, ${lonText(g.longitude_deg ?? 0, 3)}</td></tr>
      <tr><th>Speed</th><td class="num">${fmt(v / 1000, 3)} km/s (GCRS)</td></tr>
      ${s.period_s ? `<tr><th>Period</th><td class="num">${fmt(s.period_s / 60, 1)} min</td></tr>` : ''}
      <tr><th>In sunlight</th><td>${s.sunlit ? 'yes' : 'no, in the Earth\'s shadow'}</td></tr>
      ${o ? `<tr><th>From the observer</th><td class="num">az ${fmt(o.azimuth_deg, 2)}°, el ${fmt(o.elevation_deg, 2)}°<br>${fmt(o.range_m / 1000, 1)} km${o.visible_to_the_eye ? '<br><b>visible to the eye now</b>' : ''}</td></tr>` : ''}
      <tr><th>Elements</th><td>epoch ${esc(s.epoch_utc)}, ${fmt(s.age_days, 2)} days old</td></tr></tbody></table>
    <p class="note">SGP4 on CelesTrak's elements: its error grows from about a kilometre at the epoch by kilometres a day.</p>`;
  card.hidden = false;
  card.querySelector('.close').addEventListener('click', () => app.satellites.select(null));
};

main().catch((error) => {
  console.error(error);
  app.console?.message('warning', `The page could not start: ${error.message}`, 'page');
});
