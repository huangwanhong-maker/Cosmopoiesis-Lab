// BUS: every stream of readings, the latest of each, grouped by where it is read and marked by its
// provenance: observed by a physical instrument now, recorded in an archive, computed by a model, made
// up (synthetic), or estimated by assimilation; with its age, whether it came late, and, where it
// cannot read, why (decisions 0004 and 0006). A stream is read first as its value (as INSTR and ENV
// show it); a click opens its inspector: every quantity with its unit, and the observation envelope
// (the measurement's tick and instant, its support, frame, quality and snapshot), and the record as
// the engine wrote it.

import { provenanceClass, provenanceTag, PROVENANCE_ABOUT, PROVENANCE_WORDS } from '../busclient.js';
import { duration, esc, fmt } from '../format.js';
import { GROUP_TITLES, mountText, partsHtml, primary, valueHtml } from '../readings.js';

const CLASSES = ['observed', 'archive', 'model', 'synthetic', 'assimilated'];

// A short text of a reading's values: the first few numbers with their units (kept for the tests and
// for any family the displays do not name).
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

// A value of a reading in the inspector: numbers with their units, vectors, short texts.
function shown(x, unit) {
  if (typeof x === 'number') return unit === 'T' ? `${fmt(x * 1e9, 3)} nT` : `${fmt(x, 6)}${unit ? ` ${unit}` : ''}`;
  if (Array.isArray(x) && x.length <= 4 && x.every((y) => typeof y === 'number')) return `[${x.map((y) => fmt(y, 4)).join(', ')}]${unit ? ` ${unit}` : ''}`;
  if (typeof x === 'string') return x;
  if (typeof x === 'boolean') return x ? 'yes' : 'no';
  return Array.isArray(x) ? `${x.length} items` : x && typeof x === 'object' ? `${Object.keys(x).length} fields` : String(x);
}

export function busPage(app) {
  let el, last = 0, group = 'all';
  const classes = new Set(CLASSES);
  const open = new Set();
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>The streams <span class="aside" id="bus-count"></span></h3>
        <div class="filters"><input type="search" id="bus-search" placeholder="Find a stream, a quantity, a place" aria-label="Find a stream"></div>
        <div class="seg" id="bus-groups">${[['all', 'All'], ['observer', 'Observer'], ['places', 'Places'], ['satellites', 'Satellites'], ['feeds', 'Feeds']].map(([k, t]) => `<button type="button" class="key small${k === 'all' ? ' on' : ''}" data-group="${k}">${t}</button>`).join('')}</div>
        <div class="legend">${CLASSES.map((c) => `<label class="switch" title="${esc(PROVENANCE_ABOUT[c])}"><input type="checkbox" data-class="${c}" checked><span class="prov ${c}"><i></i>${PROVENANCE_WORDS[c]}</span></label>`).join('')}</div>
        <div id="bus-list"></div>
        <h3>Events <span class="aside">they do not wait for a tick</span></h3>
        <div id="bus-events"><p class="note">none yet</p></div>
        <p class="note">Physical readings are of the present; virtual instruments read the world's instant. A reading's provenance never changes as it is drawn, zoomed or combined: a model's value stays a model's.</p>`;
      el.addEventListener('change', (e) => {
        const c = e.target.dataset.class;
        if (!c) return;
        if (e.target.checked) classes.add(c); else classes.delete(c);
        page.render(true);
      });
      el.querySelector('#bus-search').addEventListener('input', () => page.render(true));
      el.addEventListener('click', (e) => {
        const g = e.target.closest('[data-group]');
        if (g) {
          group = g.dataset.group;
          for (const b of el.querySelectorAll('[data-group]')) b.classList.toggle('on', b === g);
          page.render(true);
          return;
        }
        const go = e.target.closest('[data-go]');
        if (go) { app.goTo(go.dataset.go); return; }
        const head = e.target.closest('.inst .head');
        if (head) {
          const id = head.parentElement.dataset.id;
          if (open.has(id)) open.delete(id); else open.add(id);
          page.render(true);
        }
      });
    },
    show() { page.render(true); },
    onReadings() { if (app.isShown('BUS')) page.render(false); },
    render(force) {
      const now = performance.now();
      if (!force && now - last < 700) return;
      last = now;
      const q = el.querySelector('#bus-search').value.trim().toLowerCase();
      const rows = [...app.bus.latest.values()].sort((a, b) => String(a.title || a.sensor).localeCompare(String(b.title || b.sensor)));
      const groupOf = (r) => {
        const a = r.mount?.address || '';
        if (r.sensor?.startsWith('observer.') || r.sensor === 'terrain.probe' || (a && a === app.observer)) return 'observer';
        if (!a) return 'feeds';
        return a.startsWith('satellite ') ? 'satellites' : 'places';
      };
      const visible = rows.filter((r) => classes.has(provenanceClass(r.provenance)) && (group === 'all' || groupOf(r) === group)
        && (!q || [r.title, r.sensor, r.family, r.mount?.address, summary(r, 8)].some((x) => String(x || '').toLowerCase().includes(q))));
      el.querySelector('#bus-count').textContent = `${visible.length} of ${rows.length} · ${app.bus.received} received`;
      const wall = Date.now() / 1000;
      const byGroup = new Map();
      for (const r of visible) { const g = groupOf(r); if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(r); }
      el.querySelector('#bus-list').innerHTML = ['observer', 'places', 'satellites', 'feeds'].filter((g) => byGroup.has(g)).map((g) => `<div class="group-head"><b>${GROUP_TITLES[g]}</b><span>${byGroup.get(g).length}</span></div>`
        + byGroup.get(g).map((r) => stream(r, wall)).join('')).join('') || '<p class="note">no stream matches</p>';
      const events = app.bus.events.slice(-20).reverse();
      if (events.length) {
        el.querySelector('#bus-events').innerHTML = events.map((e) => {
          const level = (e.criticality ?? 1) >= 3 ? 'critical' : (e.criticality ?? 1) >= 2 ? 'warning' : 'good';
          return `<div class="inst"><div class="head"><span class="health ${level === 'good' ? 'good' : 'late'}"></span><span class="title">${esc(e.title || e.kind)}</span><span class="value" style="font-size:12.5px;font-weight:400">${esc(e.time_utc || '')}</span>
            <span class="line"><span class="status ${level}">${esc(e.kind || 'event')}</span>${provenanceTag(e.provenance)}${e.address ? `<button type="button" class="link" data-go="${esc(e.address)}">go there</button>` : ''}</span></div></div>`;
        }).join('');
      }
    },
  };

  function stream(r, wall) {
    const p = primary(r);
    const age = r.measured_unix ? duration(wall - r.measured_unix) : r.delivered_wall ? duration(wall - r.delivered_wall) : '';
    const health = r.available === false ? 'off' : r.late ? 'late' : 'good';
    const id = r.sensor;
    let inspector = '';
    if (open.has(id)) {
      const values = Object.entries(r.values || {}).map(([k, x]) => `<tr><th><code>${esc(k)}</code></th><td>${esc(shown(x, r.units?.[k] || ''))}</td></tr>`).join('');
      const env = [['measurement', r.measurement], ['tick', r.tick], ['instant (TT s)', r.tt_s], ['UTC', r.time_utc], ['quality', r.quality], ['support', r.support?.kind ? `${r.support.kind} at ${r.support.at || ''}` : ''],
        ['frame', r.frame], ['interaction', r.interaction], ['snapshot', r.snapshot], ['kernel', r.kernel], ['family', r.family], ['criticality', r.criticality]]
        .filter(([, x]) => x !== undefined && x !== null && x !== '').map(([k, x]) => `<tr><th>${esc(k)}</th><td class="mono">${esc(typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(3)) : x)}</td></tr>`).join('');
      inspector = `<div class="inspect"><h4 style="margin-top:0">Quantities</h4><table><tbody>${values || '<tr><td class="note">none</td></tr>'}</tbody></table>
        <h4>The envelope</h4><table><tbody>${env}</tbody></table>
        <details><summary>The record</summary><pre>${esc(JSON.stringify(r, null, 1)).slice(0, 6000)}</pre></details></div>`;
    }
    return `<div class="inst" data-id="${esc(id)}"><div class="head">
        <span class="health ${health}"></span><span class="title">${esc(r.title || r.sensor)}</span><span class="value">${p ? valueHtml(p) : ''}</span>
        <span class="line"><span>${esc(mountText(r, app.observer))}</span>${provenanceTag(r.provenance)}<span>${esc(age)}${r.late ? ' · late' : ''}</span></span>
        ${r.available === false ? `<span class="unavailable">${esc(r.reason || 'unavailable')}</span>` : p?.parts?.length ? `<span class="line">${partsHtml(p).replace(/^<div class="parts">|<\/div>$/g, '')}</span>` : ''}
      </div>${inspector}</div>`;
  }
  return page;
}
