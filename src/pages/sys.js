// SYS: the engine, the spacetime's sources, the terrain, the credits, the data on this computer and the
// recipe that fetches and builds it; and the whole log of messages.

import { authHeaders, engine, engineState, terrainState } from '../api.js';
import { esc } from '../format.js';

const when = (t) => (t ? `${new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '');
const mjdDate = (mjd) => new Date((mjd - 40587) * 86400000).toISOString().slice(0, 10);

export function sysPage(app) {
  let el, timer = null;
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `<h3>Messages <span class="aside" id="sys-count"></span></h3><div id="sys-log"></div>
        <h3>The engine</h3><div id="sys-engine">…</div>
        <h3>The spacetime's sources</h3><div id="sys-sources">…</div>
        <h3>Terrain</h3><div id="sys-terrain">…</div>
        <h3>Credits</h3><div id="sys-credits" class="note"></div>
        <h3>Data on this computer</h3><div id="sys-setup">…</div>`;
      el.addEventListener('click', async (e) => {
        const all = e.target.closest('[data-run]'), one = e.target.closest('[data-step]');
        if (!all && !one) return;
        const query = one ? `?steps=${encodeURIComponent(one.dataset.step)}&again=1` : '';
        try { await fetch(`setup/run${query}`, { method: 'POST', headers: authHeaders() }); } catch { /* setup reports */ }
        setup();
      });
      app.console.onMessage = () => { if (app.isShown('SYS')) page.drawLog(); };
    },
    show() { page.refresh(); page.drawLog(); },
    drawLog() {
      const log = app.console.log;
      el.querySelector('#sys-count').textContent = `${log.length}`;
      el.querySelector('#sys-log').innerHTML = `<table><tbody>${log.slice(-80).reverse().map((m) => `<tr><th>${m.at.toISOString().slice(11, 19)}<small>${esc(m.source)}</small></th><td class="${m.level === 'warning' ? 'error' : ''}">${m.level === 'caution' ? '<span class="status warning">caution</span> ' : m.level === 'warning' ? '<span class="status critical">warning</span> ' : ''}${esc(m.text)}${m.count > 1 ? ` (×${m.count})` : ''}</td></tr>`).join('')}</tbody></table>`;
    },
    setCredits(list) { if (el) el.querySelector('#sys-credits').innerHTML = list.map((c) => `<div>${esc(c)}</div>`).join(''); },
    async refresh() {
      clearTimeout(timer);
      try {
        const s = await engineState();
        el.querySelector('#sys-engine').innerHTML = `<p class="note">${s.built ? `Built ${esc(s.built_at || '')} with g++ (${esc(s.toolchain)})${s.current ? '' : ', <span class="error">not from the present sources</span>'}.` : '<span class="error">Not built.</span>'}</p>`;
        if (s.built) {
          const st = await engine({ op: 'status' });
          const yr = (et) => (2000 + et / (365.25 * 86400)).toFixed(0);
          const eo = st.earth_orientation;
          el.querySelector('#sys-sources').innerHTML = `<table><tbody>
            <tr><th>Ephemeris</th><td>${esc(st.ephemeris.split('/').pop())}, ${yr(st.ephemeris_coverage_et[0])}–${yr(st.ephemeris_coverage_et[1])}</td></tr>
            <tr><th>The Moon's frames</th><td>${esc(st.moon_frames)}</td></tr>
            <tr><th>Earth orientation</th><td>${eo ? `${esc(eo.source)}: ${mjdDate(eo.first_mjd)} to ${mjdDate(eo.last_mjd)}, predicted from ${mjdDate(eo.first_predicted_mjd)}` : 'none: UT1 approximated'}</td></tr>
            <tr><th>Leap seconds</th><td>${esc(st.leap_seconds)}</td></tr>
            <tr><th>Frames</th><td>${st.frames}</td></tr></tbody></table>`;
        }
      } catch (error) {
        el.querySelector('#sys-engine').innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
      try {
        const t = await terrainState();
        el.querySelector('#sys-terrain').innerHTML = `<table><tbody>${Object.entries(t.bodies).map(([b, v]) =>
          `<tr><th>${b === 'earth' ? 'The Earth' : 'The Moon'}</th><td>${v.ready ? '<span class="status good">ready</span>' : '<span class="status warning">missing sources</span>'}, to level ${t.max_level[b]}<small>${Object.entries(v.needs).map(([k, ok]) => `${ok ? '✓' : '✗'} ${esc(k)}`).join('<br>')}</small></td></tr>`).join('')}</tbody></table>`;
      } catch (error) {
        el.querySelector('#sys-terrain').innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
      await setup();
    },
  };
  async function setup() {
    const box = el.querySelector('#sys-setup');
    let view = null;
    try {
      const r = await fetch('setup', { cache: 'no-store', headers: authHeaders() });
      if (r.ok) view = await r.json();
    } catch { /* below */ }
    if (!view) { box.innerHTML = '<p class="note">This page is not served by its own server; the README gives the commands.</p>'; return; }
    const writable = view.writable !== false;
    const missing = view.steps.filter((s) => !s.done);
    box.innerHTML = `<p class="note">${missing.length ? `${missing.length} of ${view.steps.length} steps are missing.` : `All ${view.steps.length} steps are done.`}${view.running ? ' Fetching and building…' : ''}</p>
      ${missing.length && !view.running && writable ? '<p><button type="button" class="key small" data-run="missing">Fetch and build what is missing</button></p>' : ''}
      <table><tbody>${view.steps.map((s) => `<tr><th>${esc(s.title)}</th><td>${s.done ? when(s.updated) : '<span class="status warning">missing</span>'}${view.running || !writable ? '' : ` <button type="button" class="link" data-step="${esc(s.id)}">${s.done ? 'again' : 'fetch'}</button>`}</td></tr>`).join('')}</tbody></table>
      ${view.log ? `<pre>${esc(view.log)}</pre>` : ''}`;
    if (view.running) timer = setTimeout(setup, 2000);
  }
  return page;
}
