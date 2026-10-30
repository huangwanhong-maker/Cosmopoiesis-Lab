// ROVER: a rover surveying the Moon's crustal field, and what the mission knows of it (decision 0008).
//
// The page shows the three parts of the formalism's triple relation (§8.8) apart:
//   - the body: the rover where it is, its plan's waypoints, its track and the places of its readings, and
//     its motion's numbers (the robotics domain's vehicles, at the fidelity chosen);
//   - the knowledge: the mission's posterior of the crust's field at the mast's height, its mean or its
//     standard deviation, with the prior (T2015_449) beside it on the same scale, and the measures of its
//     calibration that the mission can compute without the truth (the whitened innovations);
//   - the world: hidden until revealed, as a god's view, the truth, the posterior's error and its z, and
//     their calibration over the map.
// The engine keeps the mission (session "rover") and steps it by its own clock; the page asks it to go
// forward at a rate while it runs, gathers the track and readings it returns, and asks for the map again
// when new readings have come. The map is the engine's grid read bilinearly (mission.js).

import { engine } from '../api.js';
import { alongTrack } from '../charts.js';
import { esc, fmt } from '../format.js';
import { styles } from '../../../../visualization/js/index.js';
import { QUANTITIES, emptyMission, groupRange, merge, offsetMetres, project, quantityOf, rasterise, unproject, valueAt, whitenedBand } from '../mission.js';

const SESSION = 'rover';
const STORE = 'cosmopoiesis-rover';
// Sites with crustal anomalies (USGS Gazetteer of Planetary Nomenclature; Apollo 16's landing site).
const SITES = [['reiner', 'Reiner Gamma', 7.5, -59.0], ['apollo16', 'Apollo 16, Descartes', -8.973, 15.5], ['gerasimovich', 'Gerasimovich', -22.9, -122.6]];
const PLANS = [['lawnmower', 'Lines'], ['adaptive', 'Where least known']];
const FIDELITIES = [['kinematic', 'Kinematic'], ['dynamic', 'Dynamic']];
const RATES = [[60, '×60'], [600, '×600'], [3600, '×3600']];
const TICK_MS = 400, MAP_EVERY_MS = 2500, PICTURE = 240, MAP_MAX_PX = 420, STEP_MAX_S = 3600;
// A magnitude's map by the ground it is drawn on: plum on the night's dark glass, orchid on the day's.
const mapName = (q) => (q.map === 'orchid' && document.documentElement.dataset.theme !== 'day' ? 'plum' : q.map);

export function roverPage(app) {
  let el, canvas, mission = emptyMission(), map = null, running = false, timer = null, busy = false, mapping = false, mapAgain = false, lastMap = 0, lastTick = 0, mappedReadings = -1, hover = null;
  // The rate achieved, mission seconds over wall seconds, smoothed: the engine serves the acquisition too.
  let achieved = null, measuredAt = null, drawnTrack = '';
  const state = Object.assign({ site: 'reiner', plan: 'lawnmower', fidelity: 'kinematic', seed: 1, rate: 600, quantity: 'mean', reveal: false },
    (() => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } })());
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* no storage */ } };
  const seg = (name, list, current) => `<div class="seg" data-seg="${name}">${list.map(([v, t]) => `<button type="button" class="key small${String(v) === String(current) ? ' on' : ''}" data-v="${v}">${esc(t)}</button>`).join('')}</div>`;
  const css = (name) => getComputedStyle(el).getPropertyValue(name).trim() || '#b892dd';
  const error = (text) => { const p = el.querySelector('#rv-error'); p.textContent = text || ''; p.hidden = !text; };

  const config = () => {
    const site = SITES.find((s) => s[0] === state.site) || SITES[0];
    return { lat_deg: site[2], lon_deg: site[3], plan: state.plan, fidelity: state.fidelity, truth_seed: Number(state.seed) || 1 };
  };

  // A request to the engine's mission; an error is shown, unless it is one the caller expects (`quiet`).
  async function ask(request, quiet = null) {
    try {
      const a = await engine({ session: SESSION, reveal: state.reveal, ...request });
      if (a.error) throw new Error(a.error);
      error(null);
      return a;
    } catch (e) {
      if (!(quiet && quiet.test(e.message))) error(e.message);
      return null;
    }
  }

  function adopt(answer) {
    if (!answer) return;
    mission = merge(mission, answer);
    if (!mission.complete) { mission = emptyMission(); refresh(); return; }
    if (answer.done && running) setRunning(false);
    page.render();
  }

  async function refresh() {
    const a = await ask({ op: 'mission.state' }, /no mission/);
    if (a) { mission = emptyMission(); adopt(a); requestMap(true); } else page.render();
  }

  // The posterior's map; a map asked for while one is on its way is asked for again after it (so that a reveal
  // is always drawn with the truth).
  async function requestMap(force = false) {
    if (!mission.state) return;
    if (mapping) { if (force) mapAgain = true; return; }
    if (!force && mission.readings.length === mappedReadings) return;
    mapping = true;
    const n = mission.readings.length;
    const a = await ask({ op: 'mission.map', half_m: 800, n: 41 });
    mapping = false;
    lastMap = performance.now();
    if (a) { map = a; mappedReadings = n; page.draw(); page.knowledge(); }
    if (mapAgain) { mapAgain = false; requestMap(true); }
  }

  // One step of the mission's clock: the wall's time since the last, at the rate (the engine also serves the
  // acquisition, so a step may wait; the next one catches up, an hour at most).
  async function tick() {
    if (busy || !running) return;
    busy = true;
    const now = performance.now();
    const seconds = Math.min(STEP_MAX_S, state.rate * Math.max(TICK_MS, now - lastTick) / 1000);
    lastTick = now;
    const a = await ask({ op: 'mission.step', seconds, since_track: mission.track.length, since_readings: mission.readings.length });
    busy = false;
    if (!a) { setRunning(false); return; }
    if (measuredAt && mission.state) {
      const rate = (a.rover.t_s - measuredAt[1]) / Math.max(1e-3, (performance.now() - measuredAt[0]) / 1000);
      if (rate >= 0) achieved = achieved === null ? rate : 0.7 * achieved + 0.3 * rate;
    }
    measuredAt = [performance.now(), a.rover.t_s];
    adopt(a);
    if (performance.now() - lastMap > MAP_EVERY_MS || a.done) requestMap(a.done);
  }

  function setRunning(on) {
    running = on && !!mission.state && !mission.state.done;
    clearInterval(timer);
    if (running) { lastTick = performance.now(); timer = setInterval(tick, TICK_MS); } else { achieved = null; measuredAt = null; }
    const key = el?.querySelector('#rv-run');
    if (key) { key.classList.toggle('on', running); key.textContent = running ? 'Hold' : 'Run'; }
  }

  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>The rover <span class="aside">a body that senses, a mission that learns</span></h3>
        <div class="controls-grid">
          <span>Site</span>${seg('site', SITES.map((s) => [s[0], s[1]]), state.site)}
          <span>Plan</span>${seg('plan', PLANS, state.plan)}
          <span>Fidelity</span>${seg('fidelity', FIDELITIES, state.fidelity)}
          <span>Truth</span><div class="row" style="margin:0"><label class="note">seed <input type="number" id="rv-seed" min="0" max="4294967295" step="1" value="${Number(state.seed) || 1}" style="width:7em"></label>
            <button type="button" class="key small${state.reveal ? ' on' : ''}" id="rv-reveal">Reveal the truth</button></div>
        </div>
        <div class="keyrow"><button type="button" class="key small" id="rv-start">Start a new mission</button><button type="button" class="key small" id="rv-run">Run</button>${seg('rate', RATES, state.rate)}</div>
        <p class="error" id="rv-error" hidden></p>
        <div id="rv-figure">
          <div class="controls-grid"><span>Show</span>${seg('quantity', QUANTITIES.map((q) => [q.key, q.label]), state.quantity)}</div>
          <div class="figure-line" id="rv-line">&nbsp;</div>
          <div class="rover-map"><canvas id="rv-map" aria-label="The mission's map: the posterior of the crust's field about the site, the rover's track and readings"></canvas></div>
          <div class="cube-legend" id="rv-legend"></div>
          <div class="note num" id="rv-readout">&nbsp;</div>
        </div>
        <h3>Along the track <span class="aside">what it read, and what T2015_449 said there</span></h3>
        <div id="rv-track-figure"><div class="legend" id="rv-track-legend"></div><div class="chart-box" id="rv-track"><p class="note">The readings appear here as the rover drives.</p></div></div>
        <h3>The rover <span class="aside">its motion and its plan</span></h3>
        <div id="rv-status"></div>
        <h3>What the mission knows <span class="aside">from its readings alone</span></h3>
        <table class="knowledge"><tbody id="rv-knowledge"></tbody></table>
        <div class="keyrow"><button type="button" class="key small" id="rv-calibrate">Calibrate over 20 truths</button></div>
        <div id="rv-calibration"></div>
        <p class="note">The world holds the truth: T2015_449 and a hidden realisation of what it leaves unresolved, to degree 1440, from the law of its spectrum and the seed. The rover's magnetometer, on a 1.5 m mast, reads that truth with 0.5 nT of white noise. The mission's knowledge starts from the truth's own law (mean T2015_449, the unresolved part's covariance) and changes only by those readings, so its errors over its standard deviations are standard normal. The rover drives on the Moon's reference sphere, not on its terrain; the solar wind's field is taken as removed.</p>`;
      canvas = document.getElementById('rv-map');
      const figure = document.getElementById('rv-figure');
      const onClick = (e) => {
        const b = e.target.closest('[data-seg] [data-v]');
        if (b) {
          const name = b.parentElement.dataset.seg, v = b.dataset.v;
          state[name] = name === 'rate' ? Number(v) : v;
          for (const x of b.parentElement.querySelectorAll('[data-v]')) x.classList.toggle('on', x === b);
          save();
          if (name === 'quantity') { page.draw(); page.legend(); }
          if (name === 'rate' && running) setRunning(true);
          return;
        }
        if (e.target.id === 'rv-start') page.start();
        if (e.target.id === 'rv-run') setRunning(!running);
        if (e.target.id === 'rv-reveal') {
          state.reveal = !state.reveal;
          e.target.classList.toggle('on', state.reveal);
          save();
          refresh();
        }
        if (e.target.id === 'rv-calibrate') page.calibrate();
      };
      el.addEventListener('click', onClick);
      // The figure takes its keys with it when it is separated; in the page, the page's listener has them.
      figure.addEventListener('click', (e) => { if (!el.contains(figure)) onClick(e); });
      new MutationObserver(() => { page.draw(); page.track(true); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      app.separator.attach(figure, { id: 'rover-map', title: "The mission's map", page: 'ROVER', onChange: () => page.draw() });
      app.separator.attach(document.getElementById('rv-track-figure'), { id: 'rover-track', title: 'Along the track', page: 'ROVER', onChange: () => page.track(true) });
      el.querySelector('#rv-seed').addEventListener('change', (e) => { state.seed = Math.max(0, Math.floor(Number(e.target.value) || 0)); save(); });
      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        hover = [e.clientX - r.left, e.clientY - r.top, r.width, r.height];
        page.readout();
      });
      canvas.addEventListener('mouseleave', () => { hover = null; page.readout(); });
    },
    async show() {
      app.console.widen('right', true);
      if (!mission.state) await refresh();
      else { page.render(); requestMap(true); }
      setTimeout(() => page.draw(), 0);
    },
    hide() { app.console.widen('right', false); },
    async start() {
      setRunning(false);
      const a = await ask({ op: 'mission.start', config: config() });
      if (!a) return;
      mission = emptyMission();
      map = null, mappedReadings = -1;
      adopt(a);
      setRunning(true);  // at once: the first map comes when it comes
      requestMap(true);
    },
    async calibrate() {
      const out = el.querySelector('#rv-calibration');
      out.innerHTML = '<p class="note">Running the same survey, shortened (two lines of 200 m), over twenty truths…</p>';
      const c = { ...config(), lines: 2, length_m: 200, spacing_m: 100, interval_m: 20, budget_m: 400 };
      const a = await ask({ op: 'mission.calibrate', config: c, seeds: 20, half_m: 2000, n: 5 });
      if (!a) { out.innerHTML = ''; return; }
      const band = whitenedBand(a.observations);
      out.innerHTML = `<table><tbody>
        <tr><th>rms z of B down</th><td class="num">${fmt(a.rms_z_down, 3)}</td><td class="note">1 when calibrated; ${a.nodes} node-draws over ${a.seeds} truths, correlated within each</td></tr>
        <tr><th>95 % intervals cover</th><td class="num">${fmt(100 * a.coverage_95_down, 1)} %</td><td class="note">of the map's nodes</td></tr>
        <tr><th>Innovations' mean square</th><td class="num">${fmt(a.whitened_mean_square, 3)}</td><td class="note">${a.observations} observations; 95 % of draws fall in ${fmt(band[0], 3)}–${fmt(band[1], 3)}</td></tr>
      </tbody></table>`;
    },
    render() {
      if (!el) return;
      const s = mission.state;
      const status = el.querySelector('#rv-status'), line = document.getElementById('rv-line');
      if (!s) {
        status.innerHTML = '<p class="note">No mission in the engine yet: choose a site and a plan, and start one.</p>';
        line.innerHTML = '&nbsp;';
        page.draw();
        page.knowledge();
        return;
      }
      const r = s.rover;
      const h = Math.floor(r.t_s / 3600), m = Math.floor((r.t_s % 3600) / 60);
      line.textContent = `${h} h ${String(m).padStart(2, '0')} min · ${fmt(r.odometer_m, 0)} m driven · ${s.readings_total} readings · waypoint ${Math.min(s.plan.next + 1, s.plan.waypoints.length)} of ${s.plan.waypoints.length} · ${s.done ? 'the survey driven' : running ? `driving${achieved ? `, at ×${fmt(achieved, 0)} of ×${state.rate}` : ''}` : 'held'}`;
      status.innerHTML = `<table><tbody>
        <tr><th>Mission time</th><td class="num">${h} h ${String(m).padStart(2, '0')} min</td><th>Driven</th><td class="num">${fmt(r.odometer_m, 1)} m</td></tr>
        <tr><th>Speed</th><td class="num">${fmt(r.speed_m_s, 3)} m/s</td><th>Heading</th><td class="num">${fmt(((r.azimuth_deg % 360) + 360) % 360, 1)}°</td></tr>
        <tr><th>Readings</th><td class="num">${s.readings_total}</td><th>Waypoint</th><td class="num">${Math.min(s.plan.next + 1, s.plan.waypoints.length)} of ${s.plan.waypoints.length}${s.plan.kind === 'adaptive' ? ' (chosen as it goes)' : ''}</td></tr>
        ${r.normal_N !== undefined ? `<tr><th>Ground's force</th><td class="num">${fmt(r.normal_N, 2)} N</td><th>Sideslip</th><td class="num">${fmt(1000 * r.lateral_m_s, 3)} mm/s</td></tr>` : ''}
        <tr><th>At</th><td class="num" colspan="3">${fmt(Math.abs(r.lat_deg), 5)}° ${r.lat_deg >= 0 ? 'N' : 'S'}, ${fmt(Math.abs(r.lon_deg), 5)}° ${r.lon_deg >= 0 ? 'E' : 'W'} · ${esc(s.config.fidelity)} · ${s.done ? 'the survey driven' : running ? 'driving' : 'held'}</td></tr>
      </tbody></table>`;
      page.draw();
      page.knowledge();
      page.track();
    },
    // The readings along the track against the distance driven: what the magnetometer read (|B|), what the prior
    // (T2015_449) said there, and, revealed, the truth.
    track(force = false) {
      const box = document.getElementById('rv-track'), legend = document.getElementById('rv-track-legend');
      if (!box) return;
      const rs = mission.readings;
      // Drawn again when there are new readings, the truth is shown or hidden, or the figure moves.
      const key = `${rs.length}|${state.reveal}|${rs[0]?.t_s}|${app.separator.isOut('rover-track')}|${document.documentElement.dataset.theme}`;
      if (!force && key === drawnTrack) return;
      drawnTrack = key;
      if (rs.length < 2) { legend.innerHTML = ''; box.innerHTML = '<p class="note">The readings appear here as the rover drives.</p>'; return; }
      const series = [
        { label: 'Read', kind: 'points', colour: 'var(--prov-observed)', values: rs.map((r) => r.total_nT) },
        { label: 'T2015_449', kind: 'line', colour: 'var(--prov-model)', values: rs.map((r) => r.prior_total_nT) },
      ];
      if (rs.every((r) => Number.isFinite(r.truth_total_nT))) series.push({ label: 'Truth', kind: 'line', colour: 'var(--ink-2)', dash: '4 3', values: rs.map((r) => r.truth_total_nT) });
      legend.innerHTML = series.map((x) => `<span><span class="swatch" style="background:${x.colour};${x.kind === 'points' ? 'border-radius:50%' : 'height:3px;vertical-align:3px'}"></span> ${esc(x.label)}</span>`).join('');
      // In a window of its own the graph is drawn at the window's size, its text at its own.
      const out = app.separator.isOut('rover-track'), r = box.getBoundingClientRect();
      alongTrack(box, { x: rs.map((q) => q.driven_m), series, unit: 'nT', xUnit: 'm', title: '|B| at the mast', size: out && r.width > 100 && r.height > 100 ? { w: r.width, h: r.height } : null });
    },
    knowledge() {
      const body = el?.querySelector('#rv-knowledge');
      if (!body) return;
      const s = mission.state;
      if (!s) { body.innerHTML = ''; return; }
      const k = s.knowledge, band = whitenedBand(k.observations);
      const rows = [
        ['Prior', esc(k.prior.mean), 'mean; the unresolved part\'s law for its covariance'],
        ['Observations', `${k.observations}`, `three a reading, ${fmt(k.noise_nT, 2)} nT of noise each`],
        ['Innovations\' mean square', fmt(k.whitened_mean_square, 3), band ? `1 when the knowledge is calibrated; 95 % of draws in ${fmt(band[0], 3)}–${fmt(band[1], 3)}` : ''],
      ];
      if (map) {
        rows.push(['sd of B down', `${fmt(map.mean_sd_down_nT, 3)} nT`, `over the map; ${fmt(map.prior_sd_down_nT, 2)} nT before any reading`]);
        const c = map.calibration;
        if (c) {
          rows.push(['Error of |B|', `${fmt(c.rms_error_total_nT, 3)} nT`, `rms over the map; T2015_449 alone ${fmt(c.rms_error_prior_total_nT, 3)} nT`]);
          rows.push(['z of B down', `rms ${fmt(c.rms_z_down, 3)}`, `${fmt(100 * c.coverage_95_down, 1)} % within ±1.96; one truth, its nodes correlated`]);
        }
      }
      body.innerHTML = rows.map(([a, b, n]) => `<tr><th>${a}</th><td class="num">${b}</td><td class="note">${n}</td></tr>`).join('');
    },
    legend() {
      const out = document.getElementById('rv-legend');
      if (!out) return;
      const q = quantityOf(state.quantity);
      const range = map && map[q.values] ? groupRange(map, q) : null;
      if (!range) { out.innerHTML = q.reveal && !state.reveal ? '<span class="note">Reveal the truth to see it.</span>' : ''; return; }
      const cmap = styles.colourMap(mapName(q));
      const digits = Math.abs(range[1] - range[0]) < 5 ? 2 : 1;
      const shared = QUANTITIES.filter((x) => x.group === q.group && map[x.values]).map((x) => x.label);
      out.innerHTML = `<span class="lo">${fmt(range[0], digits)}</span><span class="ramp" style="background:${cmap.gradient()}"></span><span class="hi">${fmt(range[1], digits)}${q.unit ? ` ${q.unit}` : ''}</span>
        <span class="label">${esc(q.label)}${shared.length > 1 ? ` · one scale for ${esc(shared.join(', '))}` : ''}</span>`;
    },
    draw() {
      if (!el || !canvas) return;
      const box = canvas.parentElement.getBoundingClientRect();
      // In its display the map is at most MAP_MAX_PX across; in a window of its own, as large as the window allows.
      const size = app.separator.isOut('rover-map') ? Math.max(160, Math.floor(Math.min(box.width, box.height)) - 2) : Math.max(160, Math.min(box.width || 320, MAP_MAX_PX));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${size}px`, canvas.style.height = `${size}px`;
      canvas.width = Math.round(size * dpr), canvas.height = Math.round(size * dpr);
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      g.fillStyle = css('--panel');
      g.fillRect(0, 0, size, size);
      page.legend();
      if (!map) { page.readout(); return; }
      const q = quantityOf(state.quantity);
      const values = map[q.values];
      const range = values ? groupRange(map, q) : null;
      if (!values) {
        // A view of the truth while it is hidden: say so on the map itself.
        g.fillStyle = css('--ink-3');
        g.font = `13px ${css('--sans')}`;
        g.textAlign = 'center';
        g.fillText(q.reveal && !state.reveal ? 'Reveal the truth to see it' : 'Not in this map', size / 2, size / 2 - 40);
        g.textAlign = 'start';
      }
      if (values && range) {
        const cmap = styles.colourMap(mapName(q));
        const u = (v) => (v - range[0]) / (range[1] - range[0]);
        const picture = new ImageData(rasterise(map, values, cmap.colour, (v) => Math.min(1, Math.max(0, u(v))), PICTURE, PICTURE), PICTURE, PICTURE);
        const off = document.createElement('canvas');
        off.width = off.height = PICTURE;
        off.getContext('2d').putImageData(picture, 0, 0);
        g.imageSmoothingEnabled = true;
        g.drawImage(off, 0, 0, size, size);
      }
      const P = (lat, lon) => project(map, lat, lon, size, size);
      // The plan's waypoints, the track, the readings, the rover.
      const s = mission.state;
      if (s) {
        const halo = 'rgba(12, 6, 18, 0.55)';
        s.plan.waypoints.forEach(([lat, lon], i) => {
          const [x, y] = P(lat, lon);
          g.lineWidth = 3;
          g.strokeStyle = halo;
          g.strokeRect(x - 3, y - 3, 6, 6);
          g.lineWidth = 1.2;
          g.strokeStyle = i === s.plan.next ? css('--rose') : 'rgba(255, 245, 252, 0.9)';
          g.strokeRect(x - 3, y - 3, 6, 6);
          if (i === s.plan.next) { g.fillStyle = css('--rose'); g.fillRect(x - 2, y - 2, 4, 4); }
        });
        const path = () => { g.beginPath(); mission.track.forEach(([lat, lon], i) => { const [x, y] = P(lat, lon); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); };
        g.lineJoin = 'round';
        path();
        g.lineWidth = 4.5;
        g.strokeStyle = halo;
        g.stroke();
        path();
        g.lineWidth = 1.8;
        g.strokeStyle = css('--rose');
        g.stroke();
        for (const r of mission.readings) {
          const [x, y] = P(r.lat_deg, r.lon_deg);
          g.beginPath();
          g.arc(x, y, 2.1, 0, 2 * Math.PI);
          g.fillStyle = css('--rose');
          g.fill();
          g.lineWidth = 0.8;
          g.strokeStyle = halo;
          g.stroke();
        }
        const r = s.rover, [x, y] = P(r.lat_deg, r.lon_deg), a = r.azimuth_deg * Math.PI / 180;
        const f = [Math.sin(a), -Math.cos(a)], l = [-f[1], f[0]];
        g.fillStyle = css('--ink');
        g.strokeStyle = css('--panel');
        g.beginPath();
        g.moveTo(x + 9 * f[0], y + 9 * f[1]);
        g.lineTo(x - 5 * f[0] + 5 * l[0], y - 5 * f[1] + 5 * l[1]);
        g.lineTo(x - 5 * f[0] - 5 * l[0], y - 5 * f[1] - 5 * l[1]);
        g.closePath();
        g.fill();
        g.stroke();
      }
      // A scale bar of 200 m.
      const metres = size / (2 * map.half_m);
      g.strokeStyle = css('--ink-2');
      g.fillStyle = css('--ink-2');
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(10, size - 12);
      g.lineTo(10 + 200 * metres, size - 12);
      g.stroke();
      g.font = `11px ${css('--mono')}`;
      g.fillText('200 m', 10, size - 17);
      g.fillText('N ↑', size - 28, 16);
      page.readout();
    },
    readout() {
      const out = document.getElementById('rv-readout');
      if (!out) return;
      if (!map || !hover) { out.innerHTML = map ? 'Move over the map to read it.' : '&nbsp;'; return; }
      const [x, y, W, H] = hover;
      const [lat, lon] = unproject(map, x, y, W, H);
      const [e, n] = offsetMetres(map, lat, lon);
      const q = quantityOf(state.quantity);
      const parts = [`${fmt(Math.abs(e), 0)} m ${e >= 0 ? 'E' : 'W'}, ${fmt(Math.abs(n), 0)} m ${n >= 0 ? 'N' : 'S'} of the site`];
      const mean = valueAt(map, map.mean_total_nT, x, y, W, H), sd = valueAt(map, map.sd_total_nT, x, y, W, H);
      parts.push(`|B| ${fmt(mean, 2)} ± ${fmt(sd, 2)} nT`);
      if (q.key !== 'mean' && q.key !== 'sd' && map[q.values]) parts.push(`${q.label} ${fmt(valueAt(map, map[q.values], x, y, W, H), 2)}${q.unit ? ` ${q.unit}` : ''}`);
      out.textContent = parts.join(' · ');
    },
  };
  return page;
}
