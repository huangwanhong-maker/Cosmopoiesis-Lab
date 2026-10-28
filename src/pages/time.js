// TIME: the world's instant in every scale, and the Earth's rotation at it; the world clock set by
// text (ISO 8601 with Z or a scale, or a Julian date with its scale) or run at a rate.

import { engine } from '../api.js';
import { RATES } from '../clock.js';
import { DEG, esc, fmt, hms, rateText, ttText } from '../format.js';

export function timePage(app) {
  let el, asked = 0;
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>Set the world clock</h3>
        <form class="row" id="time-set"><input type="text" id="time-text" spellcheck="false" style="flex:1" placeholder="2026-10-28T12:00:00Z · 1969-07-20 20:17 UTC · JD 2451545 TT">
          <button type="submit" class="key small">Set</button></form>
        <div class="row"><span>Rate</span><select id="time-rate">${RATES.map((r) => `<option value="${r}">${esc(rateText(r))}</option>`).join('')}</select></div>
        <p class="error" id="time-error" hidden></p>
        <p class="note">One clock for the world and every page and instrument, held by the server: a physical instrument reads the present, a virtual one the world's instant.</p>
        <h3>The instant in its scales</h3>
        <table><tbody id="time-scales"></tbody></table>
        <h3>The Earth's rotation</h3>
        <table><tbody id="time-rotation"></tbody></table>
        <p class="note" id="time-note"></p>`;
      el.querySelector('#time-set').addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = el.querySelector('#time-error');
        err.hidden = true;
        try {
          await app.clock.setTime(el.querySelector('#time-text').value.trim());
          page.refresh(true);
        } catch (error) {
          err.textContent = error.message;
          err.hidden = false;
        }
      });
      el.querySelector('#time-rate').addEventListener('change', (e) => app.clock.setRate(Number(e.target.value)));
    },
    show() { page.refresh(true); },
    update() { if (app.isShown('TIME')) page.refresh(false); },
    async refresh(force) {
      const now = performance.now();
      if (!force && now - asked < 1000) return;
      asked = now;
      try {
        const a = await engine({ op: 'time', time: ttText(app.clock.now()) });
        app.onTime(a);
        page.render(a);
      } catch { /* the glareshield keeps its last offsets */ }
    },
    render(a) {
      if (!el) return;
      const order = ['UTC', 'UT1', 'TAI', 'TT', 'TDB', 'TCG', 'TCB', 'GPS'];
      el.querySelector('#time-scales').innerHTML = order.filter((s) => a.scales[s]).map((s) => {
        const v = a.scales[s];
        return `<tr><th>${s}</th><td class="num">${esc(v.iso.replace(/ [A-Z0-9]+$/, '').replace('Z', '').replace('T', ' '))}<small>JD ${(v.jd[0] + v.jd[1]).toFixed(8)}</small></td></tr>`;
      }).join('');
      const e = a.eop || {};
      const rows = [
        ['UT1 − UTC', `${fmt(e.ut1_minus_utc_s, 4)} s`], ['ΔT = TT − UT1', `${fmt(a.delta_t_s, 4)} s`], ['TDB − TT', `${fmt(a.tdb_minus_tt_s * 1e3, 4)} ms`],
        ['Earth rotation angle', `${fmt(a.earth_rotation_angle_rad / DEG, 6)}°`], ['GMST (IAU 2006)', hms(a.gmst_rad)], ['GAST (IAU 2006/2000A)', hms(a.gast_rad)],
        ['GMST (IAU 1982, TEME)', hms(a.gmst1982_rad)], ['Polar motion x, y', `${fmt(e.x_p_arcsec, 6)}″, ${fmt(e.y_p_arcsec, 6)}″`],
        ['Celestial pole dX, dY', `${fmt(e.dX_mas, 3)}, ${fmt(e.dY_mas, 3)} mas`], ['Length of day', `${fmt(e.lod_s * 1e3, 4)} ms over 86 400 s`],
        ['GPS week, seconds', `${a.gps_week}, ${fmt(a.gps_seconds_of_week, 3)} s`],
      ];
      el.querySelector('#time-rotation').innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td class="num">${esc(v)}</td></tr>`).join('');
      el.querySelector('#time-note').textContent = `UT1 here is ${a.ut1_source}${e.predicted ? ' (predicted)' : ''}. Scales by the IAU 2006 resolutions and SOFA's algorithms; the Earth's orientation by IAU 2006/2000A with the IERS's EOP.`;
      const input = el.querySelector('#time-text');
      if (document.activeElement !== input) input.value = a.scales.UTC ? a.scales.UTC.iso : a.scales.TT.iso;
      const sel = el.querySelector('#time-rate');
      if (document.activeElement !== sel) sel.value = String(RATES.includes(app.clock.rate) ? app.clock.rate : 1);
    },
  };
  return page;
}
