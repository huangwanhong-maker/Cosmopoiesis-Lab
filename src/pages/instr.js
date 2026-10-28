// INSTR: the instruments of the session, the kernels of observation they are built on, and the families
// that may be mounted (decision 0004; docs/instruments.md).
//
// An instrument is a family (a registry's entry: a kernel, a model, its quantities, its cost, its
// coverage) mounted somewhere (an address, the observer, a satellite) with a timing (a period of the
// world's clock or of the wall's, a deadline, a criticality). Each family is a class of the engine
// deriving from one of the twelve kernel classes (observation.hpp); the encyclopedia's 101 families
// are declared beside them (declared.hpp), each bound to its kernel class, and are refused when
// mounted until a model is written for them.

import { acquisition, acquire, instruments } from '../api.js';
import { provenanceTag } from '../busclient.js';
import { esc, fmt } from '../format.js';

const CRIT = ['display', 'science', 'mission', 'safety'];
const SECTIONS = {
  A: 'Spacetime, navigation, geometry and mechanics', B: 'Thermal, fluid, acoustic and environmental physics',
  C: 'Electromagnetism, optics and radiation', D: 'Atmospheres, oceans and planetary environments',
  E: 'Solid Earth, planetary surfaces and subsurface investigation', F: 'Spacecraft, plasma physics and astrophysics',
  G: 'Chemistry, molecular science and materials', H: 'Biology, ecology, physiology and medicine',
  I: 'Advanced quantum, atomic and fundamental-physics experiments', J: 'Infrastructure, safety, computational and virtual sensing',
};

export function instrPage(app) {
  let el, catalogue = null;
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>Mounted <span class="aside" id="in-count"></span></h3>
        <div id="in-sensors">…</div>
        <h3>Mount an instrument</h3>
        <form id="in-add">
          <div class="row"><span>family</span><select id="in-family" style="flex:1"></select></div>
          <div class="row"><span>on</span><select id="in-mount" style="flex:1"><option value="observer">the observer</option><option value="satellite:25544">the ISS</option><option value="address">an address…</option></select></div>
          <div class="row" id="in-address-row" hidden><span>address</span><input type="text" id="in-address" style="flex:1" placeholder="moon(0.674 N, 23.473 E)"></div>
          <div class="row"><span>every</span><input type="text" id="in-period" value="1" style="width:60px"><span class="note">s of the world's clock</span></div>
          <div class="row" id="in-settings-row" hidden><label class="switch"><input type="checkbox" id="in-synthetic"><span>with the crust's finer scales <small>synthetic, from its spectral law</small></span></label></div>
          <div class="row"><span>criticality</span><select id="in-crit">${CRIT.map((c, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${c}</option>`).join('')}</select>
            <button type="submit" class="key small">Mount</button></div>
        </form>
        <h3>The kernels of observation</h3>
        <div id="in-kernels">…</div>
        <h3>Families in the engine</h3>
        <div id="in-families">…</div>
        <h3>The encyclopedia's families <span class="aside" id="in-declared-count"></span></h3>
        <p class="note">Every family of docs/encyclopedia-of-instruments.md, declared in the engine with its kernel class, what it reads and how it touches what it measures. A declared family is a class without a model: mounting it is refused, and says so, until one is written.</p>
        <div id="in-declared">…</div>`;
      el.querySelector('#in-mount').addEventListener('change', (e) => { el.querySelector('#in-address-row').hidden = e.target.value !== 'address'; });
      // A family's settings: the Moon's magnetometer may add the scales finer than its model.
      el.querySelector('#in-family').addEventListener('change', (e) => { el.querySelector('#in-settings-row').hidden = e.target.value !== 'magnetometer.moon'; });
      el.querySelector('#in-add').addEventListener('submit', async (e) => {
        e.preventDefault();
        const family = el.querySelector('#in-family').value;
        const where = el.querySelector('#in-mount').value;
        const mount = where === 'address' ? el.querySelector('#in-address').value.trim() : where;
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
        if (!rm) return;
        try {
          app.adoptAcquisition(await acquire({ sensors_remove: [rm.dataset.remove] }));
          page.refresh();
        } catch (error) {
          app.console.message('caution', `Not removed: ${error.message}`, 'instruments');
        }
      });
    },
    async show() {
      if (!catalogue) {
        try { catalogue = await instruments(); } catch (error) { el.querySelector('#in-kernels').innerHTML = `<p class="error">${esc(error.message)}</p>`; }
        if (catalogue) {
          el.querySelector('#in-kernels').innerHTML = `<table><tbody>${catalogue.kernels.map((k) => `<tr><th>${esc(k.title)}<small>${esc(k.key)}</small></th><td>${esc(k.operator)}<small>${esc(k.examples)}</small></td></tr>`).join('')}</tbody></table>
            <p class="note">Every instrument of the encyclopedia is one of these kernels with parameters: a magnetometer of any make is a point probe of B; a camera, a radiometer and a star tracker are lines of sight; GNSS, radar and lidar range. The families below are the engine's; the physical sources are the server's adapters.</p>`;
          el.querySelector('#in-families').innerHTML = `<table><tbody>${catalogue.families.map((f) => `<tr><th>${esc(f.title)}<small>${esc(f.family)} · ${esc(f.catalogue)}</small></th><td>${provenanceTag(f.provenance)} ${esc(f.kernel_title)}<small>${esc(f.model)}</small><small>${esc(f.about)}</small></td></tr>`).join('')}
            ${(catalogue.external || []).map((f) => `<tr><th>${esc(f.title)}<small>${esc(f.family)}</small></th><td>${provenanceTag(f.provenance)} ${esc(f.kernel)}<small>${esc(f.about)}</small></td></tr>`).join('')}</tbody></table>`;
          el.querySelector('#in-family').innerHTML = catalogue.families.map((f) => `<option value="${esc(f.family)}">${esc(f.title)}</option>`).join('');
          const declared = catalogue.declared || [];
          el.querySelector('#in-declared-count').textContent = `${declared.filter((d) => d.implemented).length} of ${declared.length} with a model`;
          const groups = Object.entries(SECTIONS).map(([letter, title]) => [letter, title, declared.filter((d) => d.code.startsWith(letter))]).filter(([, , ds]) => ds.length);
          el.querySelector('#in-declared').innerHTML = groups.map(([letter, title, ds]) => `<details class="declared"><summary>${letter}. ${esc(title)} <small>${ds.filter((d) => d.implemented).length} of ${ds.length}</small></summary>
            <table><tbody>${ds.map((d) => `<tr><th><span class="status ${d.implemented ? 'good' : 'muted'}">${d.implemented ? 'model' : 'declared'}</span> ${esc(d.code)} ${esc(d.title)}<small>${esc(d.instruments)}</small></th>
              <td>${esc(d.class)}<small>reads ${esc(d.reads)}; ${esc(d.interaction)}, ${esc(d.temporal)}</small>${(d.engine_families || []).length ? `<small>in the engine: ${d.engine_families.map(esc).join(', ')}</small>` : ''}</td></tr>`).join('')}</tbody></table></details>`).join('');
        }
      }
      page.refresh();
    },
    async refresh() {
      try {
        const a = await acquisition();
        app.adoptAcquisition(a);
        const sensors = a.session?.sensors || [];
        el.querySelector('#in-count').textContent = `${sensors.length}`;
        el.querySelector('#in-sensors').innerHTML = `<table><tbody>${sensors.map((s) => `<tr><th><span class="crit c${s.criticality}" title="${esc(s.criticality_name)}"></span>${esc(s.title || s.id)}<small>${esc(s.id)}</small></th>
          <td>${provenanceTag(s.provenance)} ${esc(s.kernel)}<small>${esc(s.mount || 'no mount')} · every ${fmt(s.period_s, 2)} s (${esc(s.clock)})${s.server ? ` · server ${esc(s.server)}` : ''}</small>
          <small>${fmt(s.released ?? 0, 0)} released, ${fmt(s.skipped ?? 0, 0)} skipped, ${fmt(s.late ?? 0, 0)} late${s.decimation > 1 ? `, decimated ×${s.decimation}` : ''}${s.measured_cost_s ? `, ${fmt(s.measured_cost_s * 1e3, 3)} ms each` : ''}</small>
          <small>${esc(s.coverage?.about || '')}</small>${s.id.startsWith('user.') ? ' <button type="button" class="link" data-remove="' + esc(s.id) + '">remove</button>' : ''}</td></tr>`).join('')}</tbody></table>`;
      } catch (error) {
        el.querySelector('#in-sensors').innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
    },
  };
  return page;
}
