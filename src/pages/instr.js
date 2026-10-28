// INSTR: the instruments of the session, each first as what it measures and its present reading, then,
// on demand, as the machinery behind it (decisions 0004 and 0006; docs/instruments.md).
//
// An instrument is a family (a registry's entry: a kernel, a model, its quantities, its cost, its
// coverage) mounted somewhere (an address, the observer, a satellite) with a timing (a period of the
// world's clock or of the wall's, a deadline, a criticality). A card shows its reading (the bus's
// latest, as BUS and ENV show it), where it is mounted, its period and its health; its inspector
// shows its kernel, its family's key, its counters of releases and lateness, its cost and its
// coverage. Each family is a class of the engine deriving from one of the twelve kernel classes
// (observation.hpp); the encyclopedia's 101 families are declared beside them (declared.hpp), each
// bound to its kernel class, and are refused when mounted until a model is written for them.

import { acquisition, acquire, instruments } from '../api.js';
import { provenanceTag } from '../busclient.js';
import { esc, fmt } from '../format.js';
import { ageText, GROUP_TITLES, mountGroup, partsHtml, primary, valueHtml } from '../readings.js';

const CRIT = ['display', 'science', 'mission', 'safety'];
const SECTIONS = {
  A: 'Spacetime, navigation, geometry and mechanics', B: 'Thermal, fluid, acoustic and environmental physics',
  C: 'Electromagnetism, optics and radiation', D: 'Atmospheres, oceans and planetary environments',
  E: 'Solid Earth, planetary surfaces and subsurface investigation', F: 'Spacecraft, plasma physics and astrophysics',
  G: 'Chemistry, molecular science and materials', H: 'Biology, ecology, physiology and medicine',
  I: 'Advanced quantum, atomic and fundamental-physics experiments', J: 'Infrastructure, safety, computational and virtual sensing',
};

// The mount in words, for a sensor of the session.
function mountWords(s, app) {
  const m = s.mount || '';
  if (m === 'observer') return 'on the observer';
  if (m === 'satellite:25544') return 'on the ISS';
  if (m.startsWith('satellite:')) return `on satellite ${m.slice(10)}`;
  if (!m) return s.external ? 'a feed of the present, from the server' : 'no mount';
  return `at ${m}`;
}

export function instrPage(app) {
  let el, catalogue = null, sensors = [], timer = null;
  const open = new Set();
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>Mounted <span class="aside" id="in-count"></span></h3>
        <div class="filters"><input type="search" id="in-search" placeholder="Find an instrument, a model, a place" aria-label="Find an instrument"></div>
        <div id="in-sensors">…</div>
        <h3>Mount an instrument</h3>
        <form id="in-add">
          <div class="controls-grid">
            <span>Instrument</span><select id="in-family"></select>
            <span>On</span><select id="in-mount"><option value="observer">the observer</option><option value="point">the point chosen</option><option value="satellite:25544">the ISS</option><option value="address">an address…</option></select>
            <span id="in-address-label" hidden>Address</span><input type="text" id="in-address" hidden placeholder="moon(0.674 N, 23.473 E)">
            <span>Every</span><div class="row" style="margin:0"><input type="text" id="in-period" value="1" style="width:64px"><span class="note">s of the world's clock</span></div>
            <span>Criticality</span><select id="in-crit">${CRIT.map((c, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${c}</option>`).join('')}</select>
          </div>
          <div class="row" id="in-settings-row" hidden><label class="switch"><input type="checkbox" id="in-synthetic"><span>with the crust's finer scales <small>synthetic, from its spectral law</small></span></label></div>
          <div class="keyrow"><button type="submit" class="key small">Mount</button></div>
        </form>
        <h3>The registry <span class="aside">the engine's classes</span></h3>
        <details><summary>The kernels of observation <small id="in-kernels-count"></small></summary><div id="in-kernels">…</div></details>
        <details><summary>Families in the engine <small id="in-families-count"></small></summary><div id="in-families">…</div></details>
        <details><summary>The encyclopedia's families <small id="in-declared-count"></small></summary>
          <p class="note">Every family of docs/encyclopedia-of-instruments.md, declared in the engine with its kernel class, what it reads and how it touches what it measures. A declared family is a class without a model: mounting it is refused, and says so, until one is written.</p>
          <div id="in-declared">…</div></details>`;
      el.querySelector('#in-mount').addEventListener('change', (e) => {
        const a = e.target.value === 'address';
        el.querySelector('#in-address').hidden = !a;
        el.querySelector('#in-address-label').hidden = !a;
      });
      el.querySelector('#in-family').addEventListener('change', (e) => { el.querySelector('#in-settings-row').hidden = e.target.value !== 'magnetometer.moon'; });
      el.querySelector('#in-search').addEventListener('input', () => page.draw());
      el.querySelector('#in-add').addEventListener('submit', async (e) => {
        e.preventDefault();
        const family = el.querySelector('#in-family').value;
        const where = el.querySelector('#in-mount').value;
        const mount = where === 'address' ? el.querySelector('#in-address').value.trim() : where === 'point' ? (app.picked?.canonical || app.picked?.address || '') : where;
        if (!mount) { app.console.message('caution', 'Not mounted: no point is chosen', 'instruments'); return; }
        const id = `user.${family}.${Date.now().toString(36)}`;
        const settings = family === 'magnetometer.moon' && el.querySelector('#in-synthetic').checked ? { synthetic: true } : undefined;
        try {
          const a = await acquire({ sensors_add: [{ id, family, mount, period_s: Number(el.querySelector('#in-period').value) || 1, criticality: Number(el.querySelector('#in-crit').value), title: '', ...(settings ? { settings } : {}) }] });
          app.adoptAcquisition(a);
          app.console.message('advisory', `Mounted ${family} on ${mount}`, 'instruments');
          page.refresh();
        } catch (error) {
          app.console.message('caution', `Not mounted: ${error.message}`, 'instruments');
        }
      });
      el.addEventListener('click', async (e) => {
        const rm = e.target.closest('[data-remove]');
        if (rm) {
          try {
            app.adoptAcquisition(await acquire({ sensors_remove: [rm.dataset.remove] }));
            page.refresh();
          } catch (error) {
            app.console.message('caution', `Not removed: ${error.message}`, 'instruments');
          }
          return;
        }
        const head = e.target.closest('.inst .head');
        if (head) {
          const id = head.parentElement.dataset.id;
          if (open.has(id)) open.delete(id); else open.add(id);
          page.draw();
        }
      });
    },
    async show() {
      if (!catalogue) {
        try { catalogue = await instruments(); } catch (error) { el.querySelector('#in-kernels').innerHTML = `<p class="error">${esc(error.message)}</p>`; }
        if (catalogue) {
          el.querySelector('#in-kernels-count').textContent = `${catalogue.kernels.length}`;
          el.querySelector('#in-kernels').innerHTML = `<table><tbody>${catalogue.kernels.map((k) => `<tr><th>${esc(k.title)}<small><code>${esc(k.class)}</code></small></th><td>${esc(k.operator)}<small>${esc(k.examples)}</small></td></tr>`).join('')}</tbody></table>
            <p class="note">Every instrument of the encyclopedia is one of these kernels with parameters: a magnetometer of any make is a point probe of B; a camera, a radiometer and a star tracker are lines of sight; GNSS, radar and lidar range.</p>`;
          el.querySelector('#in-families-count').textContent = `${catalogue.families.length + (catalogue.external || []).length}`;
          el.querySelector('#in-families').innerHTML = `<table><tbody>${catalogue.families.map((f) => `<tr><th>${esc(f.title)}<small><code>${esc(f.family)}</code> · ${esc(f.catalogue)}</small></th><td>${provenanceTag(f.provenance)} ${esc(f.kernel_title)}<small>${esc(f.model)}</small><small>${esc(f.about)}</small></td></tr>`).join('')}
            ${(catalogue.external || []).map((f) => `<tr><th>${esc(f.title)}<small><code>${esc(f.family)}</code></small></th><td>${provenanceTag(f.provenance)} ${esc(f.kernel)}<small>${esc(f.about)}</small></td></tr>`).join('')}</tbody></table>`;
          el.querySelector('#in-family').innerHTML = catalogue.families.map((f) => `<option value="${esc(f.family)}">${esc(f.title)}</option>`).join('');
          const declared = catalogue.declared || [];
          el.querySelector('#in-declared-count').textContent = `${declared.filter((d) => d.implemented).length} of ${declared.length} with a model`;
          const groups = Object.entries(SECTIONS).map(([letter, title]) => [letter, title, declared.filter((d) => d.code.startsWith(letter))]).filter(([, , ds]) => ds.length);
          el.querySelector('#in-declared').innerHTML = groups.map(([letter, title, ds]) => `<details class="declared"><summary>${letter}. ${esc(title)} <small>${ds.filter((d) => d.implemented).length} of ${ds.length}</small></summary>
            <table><tbody>${ds.map((d) => `<tr><th><span class="status ${d.implemented ? 'good' : 'muted'}">${d.implemented ? 'model' : 'declared'}</span> ${esc(d.code)} ${esc(d.title)}<small>${esc(d.instruments)}</small></th>
              <td><code>${esc(d.class)}</code><small>reads ${esc(d.reads)}; ${esc(d.interaction)}, ${esc(d.temporal)}</small>${(d.engine_families || []).length ? `<small>in the engine: ${d.engine_families.map(esc).join(', ')}</small>` : ''}</td></tr>`).join('')}</tbody></table></details>`).join('');
        }
      }
      page.refresh();
      clearInterval(timer);
      timer = setInterval(() => { if (app.isShown('INSTR')) page.draw(); else clearInterval(timer); }, 1500);
    },
    hide() { clearInterval(timer); },
    async refresh() {
      try {
        const a = await acquisition();
        app.adoptAcquisition(a);
        sensors = a.session?.sensors || [];
        page.draw();
      } catch (error) {
        el.querySelector('#in-sensors').innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
    },
    draw() {
      const q = el.querySelector('#in-search').value.trim().toLowerCase();
      const shown = sensors.filter((s) => !q || [s.title, s.id, s.family, s.mount, s.kernel].some((x) => String(x || '').toLowerCase().includes(q)));
      el.querySelector('#in-count').textContent = q ? `${shown.length} of ${sensors.length}` : `${sensors.length}`;
      const groups = new Map();
      for (const s of shown) {
        const g = mountGroup(s.id, s.mount, s.external);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(s);
      }
      const order = ['observer', 'places', 'satellites', 'feeds'];
      el.querySelector('#in-sensors').innerHTML = order.filter((g) => groups.has(g)).map((g) => `<div class="group-head"><b>${GROUP_TITLES[g]}</b><span>${groups.get(g).length}</span></div>`
        + groups.get(g).map((s) => card(s)).join('')).join('') || '<p class="note">no instrument matches</p>';
    },
  };

  function card(s) {
    const r = app.bus.get(s.id);
    const p = primary(r);
    const late = (s.late ?? 0) > 0 && r?.late;
    const health = !r ? 'off' : r.available === false ? 'off' : late ? 'late' : 'good';
    const healthWord = !r ? 'no reading yet' : r.available === false ? 'not reading here' : late ? 'reading, late' : 'reading';
    const model = (s.title || '').match(/\(([^)]+)\)/)?.[1] || '';
    const title = (s.title || s.id).replace(/\s*\([^)]*\)\s*$/, '');
    const body = open.has(s.id) ? `<div class="inspect"><table><tbody>
        <tr><th>Family</th><td><code>${esc(s.family)}</code></td></tr>
        <tr><th>Sensor</th><td><code>${esc(s.id)}</code></td></tr>
        <tr><th>Kernel</th><td>${esc(s.kernel)} ${provenanceTag(s.provenance)}</td></tr>
        <tr><th>Mount</th><td>${esc(s.mount || 'none')}${s.server ? ` · the server's ${esc(s.server)}` : ''}</td></tr>
        <tr><th>Timing</th><td>every ${fmt(s.period_s, 2)} s of the ${esc(s.clock)}'s clock · <span class="crit c${s.criticality}"></span>${esc(s.criticality_name || CRIT[s.criticality] || '')}</td></tr>
        <tr><th>Counters</th><td>${fmt(s.released ?? 0, 0)} released, ${fmt(s.skipped ?? 0, 0)} skipped, ${fmt(s.late ?? 0, 0)} late${s.decimation > 1 ? `, decimated ×${s.decimation}` : ''}${s.measured_cost_s ? `<small>${fmt(s.measured_cost_s * 1e3, 3)} ms each, measured</small>` : ''}</td></tr>
        <tr><th>Coverage</th><td>${esc(s.coverage?.about || '—')}</td></tr></tbody></table>
        ${s.id.startsWith('user.') ? `<p><button type="button" class="key small" data-remove="${esc(s.id)}">Remove</button></p>` : ''}</div>` : '';
    return `<div class="inst" data-id="${esc(s.id)}"><div class="head">
        <span class="health ${health}" title="${esc(healthWord)}"></span>
        <span class="title">${esc(title)}${model ? `<small>${esc(model)}</small>` : ''}</span>
        <span class="value">${p ? valueHtml(p) : ''}</span>
        <span class="line"><span>${esc(mountWords(s, app))}</span><span>every ${fmt(s.period_s, 2)} s</span>${r ? `${provenanceTag(r.provenance)}<span>${esc(ageText(r))}</span>` : ''}</span>
        ${r && r.available === false ? `<span class="unavailable">${esc(r.reason || 'not reading here')}</span>` : p?.parts?.length ? `<span class="line">${partsHtml(p).replace(/^<div class="parts">|<\/div>$/g, '')}</span>` : ''}
      </div>${body}</div>`;
  }
  return page;
}
