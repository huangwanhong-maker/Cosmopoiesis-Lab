// FIELD: the field about a point, as a cube of its neighbourhood filled with colour (decision 0006).
//
// Any instrument whose reading is a function of where it stands (a point probe: a magnetometer, a
// gravimeter, the barometer and thermometer of the standard atmosphere, a compass; and the lines of
// sight and ranging, whose readings also vary with the place) is read by the engine at every cell of a
// cube about the point chosen or the observer (probe_volume): the same model, the same world and the
// same instant as the observer's own instruments, so that the cube's centre is what the observer
// reads there. The cube's axes are the local east, north and up at its centre; it is centred on the
// point, or stands on the ground with the point at the middle of its floor. One quantity colours the
// cells; a vector quantity draws arrows, of the field or of its departure from the cube's mean; the
// linear fit over the cube gives the quantity's gradient. A cell the instrument cannot read (outside
// its coverage, below the ground for the air) is left empty, and the reasons are counted.
//
// A field of the world (the engine's fields.hpp: the domains' models as physis's fields) may fill the
// cube instead of an instrument: read on the same cells, without an instrument's noise or coverage but
// within the field's own base, its magnitude and its components along the cube's axes for a vector, its
// value for a scalar. The two are offered side by side, so that an instrument's reading and the field
// it samples can be set against each other.

import { engine, instruments } from '../api.js';
import { float32, worldFields } from '../fields.js';
import { provenanceTag } from '../busclient.js';
import { esc, fmt, latText, length, lonText, ttText } from '../format.js';
import { CubeView, worldCube } from '../cube.js';
import { arrowsGeometry, cellOffset, centreValue, colourOf, gradientOf, groundGeometry, levelSurface, rampCss, scaleOf, visibleCells } from '../volume.js';
import { OBSERVER_GLYPH, POINT_GLYPH } from './point.js';

const KERNELS = new Set(['point-probe', 'line-of-sight', 'ranging']);
const STORE = 'cosmopoiesis-field';
const EDGES = [[1e3, '1 km'], [1e4, '10 km'], [1e5, '100 km'], [1e6, '1000 km']];
const SIZES = [9, 13, 17, 21];
const MODES = [['cells', 'Cells'], ['slices', 'Slices'], ['shell', 'Shell'], ['level', 'Level']];
const SCALES = [['linear', 'Linear'], ['log', 'Log'], ['about', 'About the centre']];
const ARROWS = [['off', 'Off'], ['field', 'Field'], ['departure', 'Departure']];
// The quantity a family shows first, and its scale.
const FIRST = {
  'magnetometer.wmm2025': ['total_T', 'linear'], 'magnetometer.moon': ['total_T', 'log'], 'compass.magnetic': ['magnetic_north_deg', 'linear'],
  'atmosphere.ussa1976': ['temperature_K', 'linear'], 'gravimeter.body': ['gravity_m_s2', 'linear'], 'sun.sensor': ['irradiance_w_m2', 'linear'], 'gnss.receiver': ['pdop', 'linear'],
  'field:earth.magnetic': ['magnitude_T', 'linear'], 'field:earth.magnetic.core': ['magnitude_T', 'linear'], 'field:earth.gravity.normal': ['magnitude_m_s2', 'linear'],
  'field:moon.magnetic.crust': ['magnitude_T', 'log'], 'field:moon.magnetic.unresolved': ['magnitude_T', 'log'], 'field:moon.magnetic': ['magnitude_T', 'log'],
};
// The frame of each body's fields.
const FRAME_OF = { earth: 'ITRS', moon: 'MOON_ME' };
// How a unit is shown: tesla as nanotesla, pascal as hectopascal.
const SHOWN = { T: ['nT', 1e9], Pa: ['hPa', 0.01], 'T/yr': ['nT/yr', 1e9] };
const shownUnit = (u) => SHOWN[u] || [u, 1];
const RADIUS = { earth: 6371.0e3, moon: 1737.4e3 };

export function fieldPage(app) {
  let el, view = null, families = null, fields = [], answer = null, asking = false, hoverCell = null, sampledAt = null, timer = null;
  const state = Object.assign({ centre: 'point', placement: 'auto', families: {}, quantity: null, edge: 1e5, n: 13, mode: 'cells', scale: null, arrows: 'field', fill: 0.55, opacity: 1, slices: null, level: 0.5, world: false },
    (() => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } })());
  if (typeof state.families !== 'object' || !state.families) state.families = {};
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ ...state, slices: null })); } catch { /* no storage */ } };
  const seg = (name, list, current) => `<div class="seg" data-seg="${name}">${list.map(([v, t]) => `<button type="button" class="key small${String(v) === String(current) ? ' on' : ''}" data-v="${v}">${t}</button>`).join('')}</div>`;

  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>Field about a point <span class="aside">an instrument read over a cube</span></h3>
        <div id="fd-where"></div>
        <div class="controls-grid">
          <span>Centre</span>${seg('centre', [['point', 'Point chosen'], ['observer', 'Observer']], state.centre)}
          <span>Read by</span><select id="fd-family"><option>…</option></select>
          <span>Quantity</span><select id="fd-quantity"><option>…</option></select>
          <span>Edge</span><div class="row" style="margin:0">${seg('edge', EDGES, state.edge)}</div>
          <span>Cells</span><div class="row" style="margin:0">${seg('n', SIZES.map((s) => [s, `${s}³`]), state.n)}${seg('placement', [['auto', 'Auto'], ['centred', 'Centred'], ['above', 'On the ground']], state.placement)}</div>
        </div>
        <div id="fd-figure"><div class="cube-view" id="fd-cube"></div><div class="cube-legend" id="fd-legend"></div></div>
        <div class="controls-grid">
          <span>Show</span>${seg('mode', MODES, state.mode)}
          <span>Colour</span>${seg('scale', SCALES, state.scale || 'linear')}
          <span>Arrows</span>${seg('arrows', ARROWS, state.arrows)}
          <span id="fd-fill-label">Cell size</span><input type="range" id="fd-fill" min="0.2" max="1" step="0.05" value="${state.fill}">
          <span id="fd-opacity-label">Opacity</span><input type="range" id="fd-opacity" min="0.15" max="1" step="0.05" value="${state.opacity}">
          <span id="fd-slices-label" hidden>Slices</span><div id="fd-slices" hidden class="row" style="margin:0"></div>
          <span id="fd-level-label" hidden>Level</span><input type="range" id="fd-level" min="0" max="1" step="0.01" value="${state.level}" hidden>
        </div>
        <div class="keyrow"><button type="button" class="key small" id="fd-sample">Read again</button><button type="button" class="key small" id="fd-world">In the world</button><button type="button" class="key small" id="fd-reset">Turn to south-east</button></div>
        <h3>Across the cube <span class="aside" id="fd-prov"></span></h3>
        <div id="fd-stats"><p class="note">Choose a point (a click on a body), or centre the cube on the observer.</p></div>
        <div id="fd-reasons"></div>
        <p class="note" id="fd-about"></p>`;
      view = new CubeView(document.getElementById('fd-cube'), { onHover: (cell) => { hoverCell = cell; readout(); } });
      app.separator.attach(document.getElementById('fd-figure'), { id: 'field-cube', title: 'The field about a point', page: 'FIELD', onChange: () => view.resize() });
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-seg] [data-v]');
        if (b) {
          const name = b.parentElement.dataset.seg, v = b.dataset.v;
          state[name] = ['edge', 'n'].includes(name) ? Number(v) : v;
          for (const x of b.parentElement.querySelectorAll('[data-v]')) x.classList.toggle('on', x === b);
          save();
          if (['centre', 'edge', 'n', 'placement'].includes(name)) page.sample(); else page.draw();
          return;
        }
        if (e.target.id === 'fd-sample') page.sample();
        if (e.target.id === 'fd-reset') { view.view = { yaw: Math.PI / 4, pitch: 0.48, distance: 3.3 }; view.render(); }
        if (e.target.id === 'fd-world') { state.world = !state.world; save(); page.drawWorld(); }
      });
      el.querySelector('#fd-family').addEventListener('change', (e) => { state.families[centreBody() || 'any'] = e.target.value; state.quantity = null; state.scale = null; save(); page.sample(); });
      el.querySelector('#fd-quantity').addEventListener('change', (e) => { state.quantity = e.target.value; state.scale = null; save(); page.draw(); });
      for (const id of ['fd-fill', 'fd-opacity', 'fd-level']) {
        el.querySelector(`#${id}`).addEventListener('input', (e) => { state[id.slice(3)] = Number(e.target.value); save(); page.draw(); });
      }
      el.querySelector('#fd-slices').addEventListener('input', (e) => {
        const k = Number(e.target.dataset.axis);
        if (!Number.isFinite(k) || !state.slices) return;
        state.slices[k] = Number(e.target.value);
        page.draw();
      });
    },
    async show() {
      app.console.widen('right', true);
      setTimeout(() => view?.resize(), 0);
      if (!families) {
        try {
          const c = await instruments();
          families = c.families.filter((f) => KERNELS.has(f.kernel));
          fields = (await worldFields()).filter((f) => f.available);
        } catch (error) {
          families = families || [];
          el.querySelector('#fd-stats').innerHTML = `<p class="error">${esc(error.message)}</p>`;
        }
      }
      fillFamilies();
      if (!answer || centreText() !== answer.request.at) page.sample();
      else page.draw();
      clearInterval(timer);
      // The cube is read again when the world's instant has moved by more than an hour.
      timer = setInterval(() => {
        if (!app.isShown('FIELD')) { clearInterval(timer); return; }
        if (answer && sampledAt !== null && Math.abs(app.clock.now() - sampledAt) > 3600 && !asking) page.sample();
      }, 5000);
    },
    hide() { app.console.widen('right', false); clearInterval(timer); },
    // Centre the cube on the point or the observer, and open the page.
    centreOn(which) {
      state.centre = which;
      save();
      for (const x of el.querySelectorAll('[data-seg="centre"] [data-v]')) x.classList.toggle('on', x.dataset.v === which);
      if (app.isShown('FIELD')) page.sample();
    },
    onPoint() { if (app.isShown('FIELD') && state.centre === 'point') page.sample(); },
    onObserver() { if (app.isShown('FIELD') && state.centre === 'observer') page.sample(); },

    async sample() {
      const at = centreText();
      fillWhere();
      if (!at) { answer = null; view.show({ n: state.n, edgeText: '' }); document.getElementById('fd-legend').innerHTML = ''; return; }
      const family = familyFor();
      if (!family) return;
      fillFamilies();
      asking = true;
      document.getElementById('fd-cube').insertAdjacentHTML('beforeend', '<div class="busy"></div>');
      const request = { op: 'probe_volume', at, time: ttText(app.clock.now()), edge_m: state.edge, n: state.n, encoding: 'f32',
        ...(family.startsWith('field:') ? { field: family.slice(6) } : { family }) };
      try {
        const a = await engine(request);
        a.request = request;
        for (const q of a.quantities || []) q.data = q.values_f32 ? float32(q.values_f32) : Float32Array.from(q.values.map((x) => (x === null ? NaN : x)));
        if (a.vector) for (const k of ['east', 'north', 'up']) a.vector[k] = a.vector[`${k}_f32`] ? float32(a.vector[`${k}_f32`]) : typeof a.vector[k] === 'string' ? float32(a.vector[k]) : Float32Array.from(a.vector[k].map((x) => (x === null ? NaN : x)));
        answer = a;
        sampledAt = app.clock.now();
        state.slices = [0, 1, 2].map(() => Math.floor(a.n / 2));
        fillQuantities();
        page.draw();
      } catch (error) {
        el.querySelector('#fd-stats').innerHTML = `<p class="error">The cube was not read: ${esc(error.message)}</p>`;
      } finally {
        asking = false;
        document.querySelector('#fd-cube .busy')?.remove();
      }
    },

    draw() {
      if (!answer) return;
      const q = quantity();
      if (!q) {
        // Nothing read: say why, and draw the empty cube.
        view.show({ n: answer.n, cells: [], edgeText: `edge ${length(answer.edge_m)} · no cell read` });
        document.getElementById('fd-legend').innerHTML = '';
        el.querySelector('#fd-stats').innerHTML = `<div class="readings"><div class="reading off wide"><div class="what">${esc(answer.title)} reads nothing in this cube</div><div class="v">${esc(answer.reasons?.[0]?.reason || 'no reason given')}</div></div></div>`;
        el.querySelector('#fd-reasons').innerHTML = '';
        app.scene.setObject('field-cube', null, null, null);
        return;
      }
      const n = answer.n, values = q.data;
      const [unit, k] = shownUnit(q.unit);
      const scaleName = state.scale || FIRST[sourceOf(answer)]?.[1] || 'linear';
      const centre = centreValue(values, n);
      const scale = scaleOf(values, { log: scaleName === 'log', about: scaleName === 'about' ? centre : null });
      const night = document.documentElement.dataset.theme !== 'day';
      const slicesOn = state.mode === 'slices', levelOn = state.mode === 'level';
      el.querySelector('#fd-slices').hidden = !slicesOn;
      el.querySelector('#fd-slices-label').hidden = !slicesOn;
      el.querySelector('#fd-level').hidden = !levelOn;
      el.querySelector('#fd-level-label').hidden = !levelOn;
      if (slicesOn && !el.querySelector('#fd-slices input')) {
        el.querySelector('#fd-slices').innerHTML = ['E', 'N', 'U'].map((a, i) => `<label class="switch" style="gap:4px">${a}<input type="range" data-axis="${i}" min="0" max="${n - 1}" step="1" value="${state.slices[i]}" style="width:80px"></label>`).join('');
      }
      const cells = visibleCells(values, n, state.mode, state.slices || [0, 0, 0]);
      const colours = cells.map((idx) => colourOf(scale, values[idx], night));
      let level = null;
      if (levelOn && scale) {
        const lv = scale.kind === 'log' ? 10 ** (Math.log10(scale.lo) + state.level * (Math.log10(scale.hi) - Math.log10(scale.lo))) : scale.lo + state.level * (scale.hi - scale.lo);
        level = levelSurface(values, n, lv);
        level.colour = colourOf(scale, lv, night);
        level.value = lv;
      }
      let arrows = null;
      if (answer.vector && state.arrows !== 'off') arrows = arrowsGeometry(n, answer.vector, { departure: state.arrows === 'departure' }).positions;
      const c = answer.centre;
      const R = RADIUS[c.body];
      const ground = R ? groundGeometry(R, c.height_m, answer.edge_m) : null;
      view.show({ n, edge: answer.edge_m, values, cells, colours, fill: slicesOn || state.mode === 'shell' ? 0.98 : state.fill, opacity: state.opacity, arrows, level, ground,
        centre: true, edgeText: `edge ${length(answer.edge_m)} · cell ${length(answer.cell_m)}` });
      this.drawn = { scale, cells, colours, unit, k };
      // The legend.
      const lo = scale ? scale.lo * k : NaN, hi = scale ? scale.hi * k : NaN;
      const digits = digitsFor(Math.abs(hi - lo));
      document.getElementById('fd-legend').innerHTML = scale ? `<span class="lo">${fmt(lo, digits)}</span><span class="ramp" style="background:${rampCss(scale, night)}"></span><span class="hi">${fmt(hi, digits)} ${esc(unit)}</span>
        <span class="label">${esc(labelOf(q))}${scale.kind === 'log' ? ', logarithmic' : scale.kind === 'diverging' ? `, about the centre's ${fmt(centre * k, digits)} ${esc(unit)}` : ''}${level ? ` · the level surface at ${fmt(level.value * k, digits)} ${esc(unit)}` : ''}${state.arrows !== 'off' && answer.vector ? ` · arrows: ${state.arrows === 'departure' ? 'the departure of' : ''} ${esc(answer.vector.name)} (${esc(answer.vector.frame || 'the cube\'s axes')})` : ''}</span>` : '<span class="label">no cell has a reading</span>';
      el.querySelector('#fd-fill').disabled = slicesOn || state.mode === 'shell' || levelOn;
      // Across the cube: the centre, the range, the gradient, the cells read.
      const g = gradientOf(values, n, answer.edge_m);
      const perKm = (x) => fmt(x * k * 1e3, digitsFor(Math.abs(x * k * 1e3) * 10));
      const counts = answer.counts || {};
      const total = n * n * n;
      el.querySelector('#fd-stats').innerHTML = `<div class="readings">
        <div class="reading big"><div class="what">At the centre</div><div class="v">${fmt(centre * k, digits + 1)}<span class="u">${esc(unit)}</span></div><div class="sub">${esc(labelOf(q))}</div></div>
        <div class="reading"><div class="what">Across the cube</div><div class="v">${fmt((hi - lo), digits)}<span class="u">${esc(unit)}</span></div><div class="sub">from ${fmt(lo, digits)} to ${fmt(hi, digits)}${Number.isFinite(centre) && centre !== 0 && Math.abs(hi - lo) < Math.abs(centre * k) ? `, ${fmt(100 * Math.abs(hi - lo) / Math.abs(centre * k), 2)}% of the centre's` : ''}</div></div>
        ${g ? `<div class="reading wide"><div class="what">Gradient, the linear fit over the cube</div><div class="v">${perKm(Math.hypot(g.east, g.north, g.up))}<span class="u">${esc(unit)}/km</span></div>
          <div class="sub">east <span class="n">${perKm(g.east)}</span> · north <span class="n">${perKm(g.north)}</span> · up <span class="n">${perKm(g.up)}</span> ${esc(unit)}/km</div></div>` : ''}
        <div class="reading wide"><div class="what">Cells read</div><div class="v">${fmt(counts.read ?? 0, 0)}<span class="u">of ${fmt(total, 0)}</span></div>
          <div class="sub">${['outside', 'missing', 'invalid'].filter((x) => counts[x]).map((x) => `${fmt(counts[x], 0)} ${x}`).join(' · ') || 'every cell has a reading'} · read in ${fmt((answer.elapsed_s ?? 0) * 1e3, 0)} ms</div></div></div>`;
      const told = [...(answer.reasons || []).slice(0, 4).map((r) => `<tr><th>${fmt(r.count, 0)} cells<small>${esc(r.quality)}</small></th><td class="note">${esc(r.reason)}</td></tr>`),
        ...(answer.notes || []).slice(0, 2).map((x) => `<tr><th>${fmt(x.count, 0)} cells<small>read, with a note</small></th><td class="note">${esc(x.note)}</td></tr>`)];
      el.querySelector('#fd-reasons').innerHTML = told.length ? `<table><tbody>${told.join('')}</tbody></table>` : '';
      el.querySelector('#fd-prov').innerHTML = `${provenanceTag(answer.provenance)} <small>${esc(answer.time?.utc ? `${String(answer.time.utc).replace('T', ' ').slice(0, 19)} UTC` : '')}</small>`;
      const what = answer.field ? `The field ${esc(answer.field)}, ${esc(answer.title)}: ${esc(answer.model || '')}; its base: ${esc(answer.about || '')}.` : `${esc(answer.title)}: ${esc(answer.model || '')}.`;
      el.querySelector('#fd-about').innerHTML = `${what} The cube's axes are the local east, north and up at its centre (${esc(c.frame)}); the figure's surface, where it crosses the cube, is drawn in amber. Drag to turn, scroll to zoom, double-click to face south-east.`;
      readout();
      page.drawWorld();
    },

    // The cube in the world, at its place in the body's fixed frame.
    drawWorld() {
      el.querySelector('#fd-world').classList.toggle('on', state.world);
      if (!state.world || !answer || !this.drawn) { app.scene.setObject('field-cube', null, null, null); return; }
      const c = answer.centre;
      const obj = worldCube(answer.n, answer.edge_m, answer.axes.rotation, this.drawn.cells, this.drawn.colours, { fill: state.mode === 'cells' ? state.fill : 0.98, opacity: 1 });
      app.scene.setObject('field-cube', c.body, c.fixed_m, obj);
    },
  };

  // The body the cube's centre is on, and what reads it there (each body remembers its own): an instrument
  // family, or a field of the world ("field:" and its name) in the body's frame.
  function centreBody() { return state.centre === 'observer' ? app.observerPlace?.body : app.picked?.body; }
  const sourceOf = (a) => (a?.field ? `field:${a.field}` : a?.family);
  function fieldsHere() { const frame = FRAME_OF[centreBody()]; return fields.filter((f) => f.frame === frame); }
  function familyFor() {
    const body = centreBody();
    const chosen = (state.families || {})[body || 'any'];
    const known = (v) => families.some((f) => f.family === v) || fieldsHere().some((f) => `field:${f.name}` === v);
    if (chosen && (!families || known(chosen))) return chosen;
    const want = body === 'earth' ? 'magnetometer.wmm2025' : body === 'moon' ? 'magnetometer.moon' : 'gravimeter.body';
    return families?.find((f) => f.family === want)?.family || families?.[0]?.family || want;
  }
  function fillFamilies() {
    const sel = el.querySelector('#fd-family');
    if (!families) return;
    const here = fieldsHere();
    sel.innerHTML = `<optgroup label="Instruments">${families.map((f) => `<option value="${esc(f.family)}">${esc(f.title)}</option>`).join('')}</optgroup>`
      + (here.length ? `<optgroup label="Fields of the world">${here.map((f) => `<option value="field:${esc(f.name)}">${esc(f.name)}: ${esc(f.title)}</option>`).join('')}</optgroup>` : '');
    sel.value = familyFor();
  }
  function quantity() {
    const qs = answer?.quantities || [];
    return qs.find((q) => q.name === state.quantity) || qs.find((q) => q.name === FIRST[sourceOf(answer)]?.[0]) || qs[0] || null;
  }
  function fillQuantities() {
    const sel = el.querySelector('#fd-quantity');
    const qs = answer?.quantities || [];
    sel.innerHTML = qs.map((q) => `<option value="${esc(q.name)}">${esc(labelOf(q))}${q.unit ? ` (${esc(shownUnit(q.unit)[0])})` : ''}</option>`).join('');
    const q = quantity();
    if (q) sel.value = q.name;
    for (const b of el.querySelectorAll('[data-seg="scale"] [data-v]')) b.classList.toggle('on', b.dataset.v === (state.scale || FIRST[sourceOf(answer)]?.[1] || 'linear'));
  }
  function labelOf(q) {
    const name = q.name.replace(/_(T|Pa|K|deg|m_s2|m_s|w_m2|kg_m3|m|s)$/, '').replace(/_/g, ' ');
    return q.about ? `${name}: ${q.about}` : name;
  }
  // The centre's address: the point or the observer, raised when the cube stands on the ground.
  function centreText() {
    let body, lat, lon, h;
    if (state.centre === 'observer') {
      const p = app.observerPlace;
      if (!p) return app.observer || '';
      body = p.body; lat = p.latitude_deg; lon = p.longitude_deg; h = p.height_m || 0;
    } else {
      const p = app.picked;
      if (!p) return '';
      if (p.lat === undefined) return p.canonical || p.address;
      body = p.body; lat = p.lat * 180 / Math.PI; lon = p.lon * 180 / Math.PI; h = p.h || 0;
    }
    const above = state.placement === 'above' || (state.placement === 'auto' && Math.abs(h) < state.edge / 2);
    const H = above ? h + state.edge / 2 : h;
    return `${body}(${latText(lat, 6)}, ${lonText(lon, 6)}, ${H.toFixed(1)} m)`;
  }
  function fillWhere() {
    const p = state.centre === 'observer' ? app.observerPlace : app.picked;
    const glyph = state.centre === 'observer' ? OBSERVER_GLYPH : POINT_GLYPH;
    const what = state.centre === 'observer' ? 'About the observer' : 'About the point chosen';
    const at = centreText();
    el.querySelector('#fd-where').innerHTML = `<div class="where">${glyph}<div><div class="what">${what}</div>
      <div class="place">${p ? (p.latitude_deg !== undefined ? `${latText(p.latitude_deg, 4)}, ${lonText(p.longitude_deg, 4)}` : p.lat !== undefined ? `${latText(p.lat * 180 / Math.PI, 4)}, ${lonText(p.lon * 180 / Math.PI, 4)}` : esc(p.address || '')) : 'none yet'}</div></div>
      <div class="more">${at ? `the cube's centre: <code>${esc(at)}</code>` : state.centre === 'point' ? 'Click a point on a body to choose it.' : 'The observer is not placed yet.'}</div></div>`;
  }
  // The hovered cell, or the cube's summary.
  function readout() {
    const box = document.querySelector('#fd-cube .readout');
    if (!box) return;
    if (!answer || !el) { box.innerHTML = ''; return; }
    const q = quantity();
    if (!q) return;
    const [unit, k] = shownUnit(q.unit);
    if (hoverCell === null || hoverCell === undefined) {
      box.innerHTML = `<b>${fmt(centreValue(q.data, answer.n) * k, 4)}</b> ${esc(unit)} at the centre <small>· point at a cell to read it</small>`;
      return;
    }
    const [e, nn, u] = cellOffset(answer.n, answer.edge_m, hoverCell);
    const v = q.data[hoverCell];
    const vec = answer.vector ? [answer.vector.east[hoverCell], answer.vector.north[hoverCell], answer.vector.up[hoverCell]] : null;
    const [vu, vk] = answer.vector ? shownUnit(answer.vector.unit) : ['', 1];
    box.innerHTML = `<b>${fmt(v * k, 4)}</b> ${esc(unit)}<br>${esc(signed(e))} east, ${esc(signed(nn))} north, ${esc(signed(u))} up
      ${vec && vec.every(Number.isFinite) ? `<br>${esc(answer.vector.name)} = (${vec.map((x) => fmt(x * vk, 1)).join(', ')}) ${esc(vu)} E, N, U` : ''}`;
  }
  return page;
}

const signed = (m) => `${m >= 0 ? '+' : '−'}${length(Math.abs(m))}`;
// Digits enough to tell the ends of a range apart.
function digitsFor(span) {
  if (!(span > 0)) return 2;
  return Math.max(0, Math.min(6, 2 - Math.floor(Math.log10(span))));
}
