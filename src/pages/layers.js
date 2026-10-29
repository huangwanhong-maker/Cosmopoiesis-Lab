// LAYERS: what is drawn on the bodies and in the sky.

import { globe, scene } from '../../../../visualization/js/index.js';
import { satelliteGroups } from '../api.js';
import { provenanceTag } from '../busclient.js';
import { esc } from '../format.js';
import { fieldLegend, shellFields, worldFields } from '../fields.js';

const { IMAGERY } = globe;

export function layersPage(app) {
  let el;
  const page = {
    mount(root) {
      el = root;
      const o = app.scene.options;
      const radio = (name, value, checked, label, note = '') =>
        `<label class="switch"><input type="radio" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${esc(label)}${note ? ` <small>${esc(note)}</small>` : ''}</span></label>`;
      const check = (id, checked, label, note = '') =>
        `<label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span>${esc(label)}${note ? ` <small>${esc(note)}</small>` : ''}</span></label>`;
      const services = (body, role) => Object.entries(IMAGERY).filter(([, s]) => s.body === body && s.role === role);
      const mapped = Object.values(app.scene.bodies).filter((b) => !b.terrain && b.map).map((b) => b.name);
      el.innerHTML = `
        <h3>The Earth's ground</h3>
        <div class="choices">${services('earth', 'base').map(([id, s]) => radio('base-earth', id, o.base.earth === id, s.title, s.daily ? 'of the instant\'s day' : '')).join('')}
          ${check('night', o.night, 'Lights at night', 'Black Marble 2016')}</div>
        <h3>The sea and the air</h3>
        <div class="choices">${radio('data', '', !o.data, 'Nothing laid over')}
          ${services('earth', 'data').map(([id, s]) => radio('data', id, o.data === id, s.title)).join('')}</div>
        <div class="row"><span>Opacity</span><input type="range" id="data-opacity" min="0" max="1" step="0.05" value="${o.dataOpacity}"></div>
        <h3>Lines and names</h3>
        <div class="choices">${radio('reference', '', !o.reference, 'None')}
          ${services('earth', 'reference').map(([id, s]) => radio('reference', id, o.reference === id, s.title)).join('')}
          ${check('names-earth', app.labels.enabled.earth, 'The Earth\'s places', 'Natural Earth')}
          ${check('names-moon', app.labels.enabled.moon, 'The Moon\'s named features', 'IAU gazetteer')}
          ${check('names-bodies', app.labels.enabled.bodies, 'The bodies\' names')}</div>
        <h3>The Moon's ground</h3>
        <div class="choices">${services('moon', 'base').map(([id, s]) => radio('base-moon', id, o.base.moon === id, s.title)).join('')}
          ${app.scene.bodies.moon?.map ? radio('base-moon', 'map', o.base.moon === 'map', 'The map of the whole Moon', 'Solar System Scope') : ''}</div>
        <h3>The other bodies</h3>
        <p class="note">${mapped.length ? `${esc(mapped.join(', '))}: their maps (Solar System Scope, from NASA, JPL and ESA mission data), with NASA Trek's tiles at close range for Mars and Mercury.` : 'Their maps are not in the data library\'s cache: they are drawn plain.'}</p>
        <h3>Terrain</h3>
        <div class="row"><span>Heights × <b id="ex-value">${o.exaggeration}</b></span>
          <input type="range" id="exaggeration" min="0" max="5" step="1" value="${[1, 2, 3, 5, 10, 20].indexOf(o.exaggeration)}"></div>
        <div class="choices">${radio('surface', 'visible', o.surface === 'visible', 'The sea at its surface')}
          ${radio('surface', 'floor', o.surface === 'floor', 'The sea floor', 'the water taken away')}
          ${check('provenance', o.provenance, 'Where the heights come from')}
          ${check('synthetic', o.synthetic, 'Detail below the data\'s resolution', 'synthetic, labelled')}
          ${check('atmosphere', o.atmosphere, 'The atmosphere\'s glow')}</div>
        <p class="legend" id="prov-legend" ${o.provenance ? '' : 'hidden'}>
          <span><i class="swatch" style="background:rgb(250,168,56)"></i> filled by the source</span><span><i class="swatch" style="background:rgb(89,148,242)"></i> finer than the data</span><span><i class="swatch" style="background:rgb(158,92,199)"></i> synthetic</span></p>
        <h3>Fields <span class="aside">the world's, each with its base and provenance</span></h3>
        <div id="fields-catalogue"><small class="note">reading the world's fields…</small></div>
        <div class="choices">${check('field-lines', o.fieldLines, 'The Earth\'s field lines', 'earth.magnetic.core, coloured by |B|; modelled')}</div>
        <p class="note" id="field-lines-note" ${o.fieldLines ? '' : 'hidden'}></p>
        <p class="legend" id="field-lines-legend" hidden></p>
        <div class="choices">${radio('moon-field', '', !o.moonField, 'The Moon\'s ground without its field')}
          ${radio('moon-field', 'total', o.moonField === 'total', 'The Moon\'s crustal field, |B|', 'T2015_449, assimilated')}
          ${radio('moon-field', 'radial', o.moonField === 'radial', 'Its radial component', 'outward and inward')}
          ${check('moon-field-synthetic', o.moonFieldSynthetic, 'With scales finer than the data', 'synthetic: the power below the crust\'s spectral law, to degree 720')}</div>
        <div class="row"><span>Opacity</span><input type="range" id="moon-field-opacity" min="0" max="1" step="0.05" value="${o.moonFieldOpacity}"></div>
        <p class="legend" id="moon-field-legend" ${o.moonField ? '' : 'hidden'}></p>
        <div class="controls-grid">
          <span>On a sphere about the Earth</span><select id="shell-field"><option value="">none</option></select>
          <span>Shows</span><div class="seg" data-seg="shell-reduction">${[['magnitude', 'Magnitude'], ['radial', 'Radial part']].map(([v, t]) => `<button type="button" class="key small${(o.fieldShell?.reduction || 'magnitude') === v ? ' on' : ''}" data-v="${v}">${t}</button>`).join('')}</div>
          <span>Height <b id="shell-height-value">${Math.round((o.fieldShell?.height_m ?? 400e3) / 1e3)} km</b></span><input type="range" id="shell-height" min="0" max="2000" step="50" value="${Math.round((o.fieldShell?.height_m ?? 400e3) / 1e3)}">
          <span>Opacity</span><input type="range" id="shell-opacity" min="0.1" max="1" step="0.05" value="${o.fieldShell?.opacity ?? 0.7}">
        </div>
        <p class="legend" id="shell-legend" hidden></p>
        <h3>The sky</h3>
        <div class="choices">${check('milky-way', o.milkyWay, 'The Milky Way', 'Solar System Scope, in galactic coordinates')}
          ${check('orbits', o.orbits, 'The orbits', 'one period of each planet, DE440')}</div>
        <h3>Satellites</h3>
        <div class="choices" id="sat-groups"><small class="note">reading the element sets on this computer…</small></div>
        <p class="note">SGP4 on CelesTrak's element sets; a click on a name shows its orbit and ground track. <button type="button" class="link" id="sat-refresh">fetch fresh elements</button></p>`;

      el.addEventListener('change', (e) => {
        const t = e.target;
        if (t.name === 'base-earth') { o.base.earth = t.value; app.scene.setLayers(); }
        else if (t.name === 'base-moon') { o.base.moon = t.value; app.scene.setLayers(); }
        else if (t.id === 'night') { o.night = t.checked; app.scene.setLayers(); }
        else if (t.name === 'data') { o.data = t.value || null; app.scene.setLayers(); }
        else if (t.name === 'reference') { o.reference = t.value || null; app.scene.setLayers(); }
        else if (t.id === 'names-earth') app.labels.enabled.earth = t.checked;
        else if (t.id === 'names-moon') app.labels.enabled.moon = t.checked;
        else if (t.id === 'names-bodies') app.labels.enabled.bodies = t.checked;
        else if (t.id === 'exaggeration') { o.exaggeration = [1, 2, 3, 5, 10, 20][Number(t.value)]; el.querySelector('#ex-value').textContent = o.exaggeration; app.scene.rebuildTerrain(); }
        else if (t.name === 'surface') { o.surface = t.value; app.scene.rebuildTerrain(); }
        else if (t.id === 'synthetic') { o.synthetic = t.checked; app.scene.rebuildTerrain(); }
        else if (t.id === 'provenance') { o.provenance = t.checked; el.querySelector('#prov-legend').hidden = !t.checked; }
        else if (t.id === 'atmosphere') o.atmosphere = t.checked;
        else if (t.id === 'milky-way') app.scene.setMilkyWay(t.checked);
        else if (t.id === 'orbits') { o.orbits = t.checked; app.touch(); }
        else if (t.id === 'field-lines') lines(t.checked);
        else if (t.name === 'moon-field' || t.id === 'moon-field-synthetic') {
          moon(el.querySelector('input[name="moon-field"]:checked')?.value || null, el.querySelector('#moon-field-synthetic').checked);
        }
        else if (t.id === 'shell-field' || t.id === 'shell-height') shell();
        app.updateCredits();
        app.save();
        app.touch();
      });
      el.addEventListener('input', (e) => {
        if (e.target.id === 'data-opacity') { o.dataOpacity = Number(e.target.value); app.touch(); }
        if (e.target.id === 'moon-field-opacity') { o.moonFieldOpacity = Number(e.target.value); app.touch(); }
        if (e.target.id === 'shell-height') el.querySelector('#shell-height-value').textContent = `${e.target.value} km`;
        if (e.target.id === 'shell-opacity') {
          const mesh = app.fields.shell?.object?.children?.[0];
          if (mesh) { mesh.material.opacity = Number(e.target.value); app.touch(); }
          if (o.fieldShell) o.fieldShell.opacity = Number(e.target.value);
        }
      });
      el.querySelector('[data-seg="shell-reduction"]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        for (const x of b.parentElement.querySelectorAll('[data-v]')) x.classList.toggle('on', x === b);
        shell();
      });
      el.querySelector('#sat-groups').addEventListener('change', () => {
        app.satellites.setGroups([...el.querySelectorAll('#sat-groups input:checked')].map((i) => i.dataset.group));
        app.save();
      });
      el.querySelector('#sat-refresh').addEventListener('click', async () => {
        const steps = ['celestrak-stations', 'celestrak-gps-ops', 'celestrak-galileo', 'celestrak-visual'];
        try {
          await fetch(`setup/run?steps=${steps.join(',')}&again=1`, { method: 'POST' });
          app.console.message('advisory', 'Fetching fresh element sets from CelesTrak', 'satellites');
          setTimeout(() => { groups(); app.satellites.window = null; app.touch(); }, 8000);
        } catch { /* SYS shows the recipe */ }
      });
      groups();
      catalogue();
    },
  };
  // The world's fields, as the engine describes them: each its name, title, unit, provenance and base,
  // or why its model is not loaded.
  async function catalogue() {
    const box = el.querySelector('#fields-catalogue');
    try {
      const list = await worldFields();
      box.innerHTML = `<div class="catalogue">${list.map((f) => (f.available
        ? `<div class="entry"><div class="name"><code>${esc(f.name)}</code>${provenanceTag(f.provenance)}</div><div>${esc(f.title)}</div><small>${esc(f.fibre.kind)} in ${esc(scene.unitText(f.fibre.unit))} · ${esc(f.representation.kind)} · ${esc(f.base.about)}</small></div>`
        : `<div class="entry off"><div class="name"><code>${esc(f.name)}</code></div><div>${esc(f.title)}</div><small>${esc(f.missing)}</small></div>`)).join('')}</div>`;
      const sel = el.querySelector('#shell-field');
      const chosen = app.scene.options.fieldShell?.field || '';
      sel.innerHTML = `<option value="">none</option>${(await shellFields()).map((f) => `<option value="${esc(f.name)}" ${f.name === chosen ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}`;
    } catch (e) {
      box.innerHTML = `<small class="note">The engine did not list its fields: ${esc(e.message)}</small>`;
    }
  }
  // The field layers are the engine's: the lines take half a second, the Moon's map and a shell some seconds.
  async function lines(on) {
    const note = el.querySelector('#field-lines-note'), legend = el.querySelector('#field-lines-legend');
    note.hidden = !on;
    legend.hidden = !on;
    if (!on) { await app.fields.setLines(false); return; }
    note.textContent = 'tracing the field lines…';
    try {
      const l = await app.fields.setLines(true);
      if (l) {
        note.textContent = `${l.count} lines from 100 km above WMM's sphere at ±30°, ±50°, ±65° of latitude, traced by RK4 to the ground or six Earth radii${l.utc ? `, at ${l.utc.slice(0, 10)}` : ''}: ${l.caveat}.`;
        legend.innerHTML = fieldLegend(l.legend);
      }
    } catch (e) { note.textContent = `The engine did not trace them: ${e.message}`; legend.hidden = true; }
    app.updateCredits();
  }
  async function moon(quantity, synthetic) {
    const legend = el.querySelector('#moon-field-legend');
    legend.hidden = !quantity;
    if (!quantity) { await app.fields.setMoon(null); app.updateCredits(); return; }
    legend.innerHTML = `<span>computing the field on a half-degree grid${synthetic ? ', with its finer scales' : ''}…</span>`;
    try {
      const map = await app.fields.setMoon(quantity, synthetic);
      const law = map?.legend.law;
      if (map) legend.innerHTML = `${fieldLegend(map.legend)}<span>${provenanceTag(map.legend.provenance)}<small> ${esc(map.legend.field)}${map.legend.parts.length ? `: ${map.legend.parts.map((x) => `${esc(x.name)} (${esc(x.provenance)})`).join(' and ')}` : ''}${law ? `; the crust's spectrum R<sub>n</sub> ∝ n<sup>${law.exponent.toFixed(2)}</sup> ρ<sup>2n</sup>, an effective depth of its sources of ${law.depth_km.toFixed(1)} km` : ''}</small></span>`;
    } catch (e) { legend.innerHTML = `<span>The engine did not map it: ${esc(e.message)}</span>`; }
    app.updateCredits();
  }
  // A field of the Earth on a sphere about it, at a height.
  async function shell() {
    const legend = el.querySelector('#shell-legend');
    const field = el.querySelector('#shell-field').value;
    legend.hidden = !field;
    if (!field) { await app.fields.setShell(null); app.updateCredits(); return; }
    const reduction = el.querySelector('[data-seg="shell-reduction"] .on')?.dataset.v || 'magnitude';
    const height_m = Number(el.querySelector('#shell-height').value) * 1e3, opacity = Number(el.querySelector('#shell-opacity').value);
    legend.innerHTML = '<span>reading the field on the sphere…</span>';
    try {
      const s = await app.fields.setShell({ field, reduction, height_m, opacity });
      if (s) {
        const refused = s.legend.refused.filter((r) => r.share > 0);
        legend.innerHTML = `${fieldLegend(s.legend)}<span>${provenanceTag(s.legend.provenance)}<small> ${esc(s.field.title)} on the sphere of 6371.2 km raised ${(height_m / 1e3).toFixed(0)} km${refused.length ? `; no value at ${refused.map((r) => `${(100 * r.share).toFixed(0)}% (${esc(r.text)})`).join(', ')}` : ''}</small></span>`;
      }
    } catch (e) { legend.innerHTML = `<span>The engine did not read it: ${esc(e.message)}</span>`; }
    app.updateCredits();
  }
  const titles = { stations: 'Space stations', visual: 'The brightest', 'gps-ops': 'GPS', galileo: 'Galileo', 'glo-ops': 'GLONASS', beidou: 'BeiDou', weather: 'Weather', science: 'Science' };
  async function groups() {
    const box = el.querySelector('#sat-groups');
    try {
      const { groups: list } = await satelliteGroups();
      if (!list.length) { box.innerHTML = '<small class="note">No element sets yet: SYS runs the recipe (CelesTrak).</small>'; return; }
      const on = new Set(app.satellites.groups);
      box.innerHTML = list.map((g) => {
        const age = g.retrieved_at ? (Date.now() - Date.parse(g.retrieved_at)) / 3.6e6 : null;
        return `<label class="switch"><input type="checkbox" data-group="${esc(g.group)}" ${on.has(g.group) ? 'checked' : ''}><span>${esc(titles[g.group] || g.group)} <small>${g.count}${age !== null ? `, fetched ${age < 48 ? `${age.toFixed(0)} h` : `${(age / 24).toFixed(0)} d`} ago` : ''}</small></span></label>`;
      }).join('');
    } catch {
      box.innerHTML = '<small class="note">The server did not say which element sets it has.</small>';
    }
  }
  return page;
}
