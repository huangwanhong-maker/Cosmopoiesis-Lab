// BUS: every stream of readings, the latest of each, coloured and marked by its provenance: observed
// by a physical instrument now, recorded in an archive, computed by a model, made up (synthetic), or
// estimated by assimilation; with its age, whether it came late, and, where it cannot read, why.

import { provenanceClass, provenanceTag, PROVENANCE_ABOUT, PROVENANCE_WORDS } from '../busclient.js';
import { duration, esc, fmt } from '../format.js';

const CLASSES = ['observed', 'archive', 'model', 'synthetic', 'assimilated'];

// A short text of a reading's values: the first few numbers with their units.
export function summary(r, n = 3) {
  const v = r.values;
  if (!v || typeof v !== 'object') return '';
  const out = [];
  for (const [k, x] of Object.entries(v)) {
    if (out.length >= n) break;
    const unit = r.units?.[k] || '';
    if (typeof x === 'number') {
      const shown = unit === 'T' ? `${fmt(x * 1e9, 1)} nT` : unit === 'Pa' ? `${fmt(x / 100, 2)} hPa` : `${fmt(x, Math.abs(x) < 10 ? 3 : 1)}${unit ? ` ${unit}` : ''}`;
      out.push(`${k.replace(/_(m|s|deg|T|Pa|K|w_m2|m_s|m_s2|kg_m3|m3|pfu)$/g, '').replace(/_/g, ' ')} ${shown}`);
    } else if (typeof x === 'string' && x.length < 40) {
      out.push(`${k.replace(/_/g, ' ')} ${x}`);
    }
  }
  return out.join(' · ');
}

export function busPage(app) {
  let el, last = 0;
  const shown = new Set(CLASSES);
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>The streams <span class="aside" id="bus-count"></span></h3>
        <div class="legend">${CLASSES.map((c) => `<label class="switch" title="${esc(PROVENANCE_ABOUT[c])}"><input type="checkbox" data-class="${c}" checked><span class="prov ${c}"><i></i>${PROVENANCE_WORDS[c]}</span></label>`).join('')}</div>
        <div id="bus-list"></div>
        <h3>Events <span class="aside">they do not wait for a tick</span></h3>
        <div id="bus-events"><p class="note">none yet</p></div>
        <p class="note">Physical readings are of the present; virtual instruments read the world's instant. A reading's provenance never changes as it is drawn, zoomed or combined: a model's value stays a model's.</p>`;
      el.addEventListener('change', (e) => {
        const c = e.target.dataset.class;
        if (!c) return;
        if (e.target.checked) shown.add(c); else shown.delete(c);
        page.render(true);
      });
    },
    show() { page.render(true); },
    onReadings() { if (app.isShown('BUS')) page.render(false); },
    render(force) {
      const now = performance.now();
      if (!force && now - last < 700) return;
      last = now;
      const rows = [...app.bus.latest.values()].sort((a, b) => provenanceClass(a.provenance).localeCompare(provenanceClass(b.provenance)) || String(a.sensor).localeCompare(String(b.sensor)));
      const visible = rows.filter((r) => shown.has(provenanceClass(r.provenance)));
      el.querySelector('#bus-count').textContent = `${visible.length} of ${rows.length} · ${app.bus.received} received`;
      const wall = Date.now() / 1000;
      el.querySelector('#bus-list').innerHTML = visible.map((r) => {
        const age = r.measured_unix ? duration(wall - r.measured_unix) : r.delivered_wall ? duration(wall - r.delivered_wall) : '';
        const where = r.mount?.address ? ` · ${r.mount.address}` : '';
        return `<div class="bus-row ${r.available === false ? 'unavailable' : ''} ${r.late ? 'late' : ''}">
          <span>${provenanceTag(r.provenance)}</span><span class="title">${esc(r.title || r.sensor)}</span><span class="age">${esc(age)}${r.late ? ' · late' : ''}</span>
          <span class="sensor">${esc(r.sensor)}${esc(where)}${r.kernel ? ` · ${esc(r.kernel)}` : ''}</span>
          <span class="value">${r.available === false ? esc(r.reason || 'unavailable') : esc(summary(r))}</span></div>`;
      }).join('') || '<p class="note">no readings yet</p>';
      const events = app.bus.events.slice(-20).reverse();
      if (events.length) {
        el.querySelector('#bus-events').innerHTML = events.map((e) => {
          const level = (e.criticality ?? 1) >= 3 ? 'critical' : (e.criticality ?? 1) >= 2 ? 'warning' : 'good';
          return `<div class="bus-row"><span>${provenanceTag(e.provenance)}</span><span class="title">${esc(e.title || e.kind)}</span><span class="age">${esc(e.time_utc || '')}</span>
            <span class="value"><span class="status ${level}">${esc(e.kind || 'event')}</span> ${e.address ? `<button type="button" class="link" data-go="${esc(e.address)}">go there</button>` : ''}</span></div>`;
        }).join('');
      }
    },
  };
  document.addEventListener('click', (e) => {
    const go = e.target.closest?.('#bus-events [data-go]');
    if (go) app.goTo(go.dataset.go);
  });
  return page;
}
