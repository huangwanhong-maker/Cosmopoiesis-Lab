// The console: the glareshield (clocks and annunciators), two multi-function displays with their
// pages, the CDU (the bodies, the spacetime address, the world clock, the messages), the status line.
//
// Nothing pops up. A change of state is a message in the log, with its level (advisory, caution,
// warning) and its source, and lights an annunciator while it lasts; a warning's lamp flashes until it
// is seen (a click). A page is a module with mount(el), and optionally show() and hide(); it is
// registered on a display by its key, and the key's indicator lights while it is shown.

import { esc, fmt, mjdOfTt, rateText, utcIso, duration } from './format.js';
import { RATES } from './clock.js';

const $ = (s) => document.querySelector(s);
const STORE = 'cosmopoiesis-console';

export class Console {
  constructor(app) {
    this.app = app;
    this.pages = { left: new Map(), right: new Map() };
    this.shown = { left: null, right: null };
    this.lamps = new Map();
    this.log = [];
    this.clockCells = {};
    this.buildClocks();
  }

  // ---- the displays ----------------------------------------------------------------------------------
  display(side, keys) {
    const root = $(`#mfd-${side}`);
    root.innerHTML = `<nav class="keys" role="tablist">${keys.map(([k, t]) => `<button type="button" class="key small" role="tab" data-page="${k}" title="${esc(t)}">${esc(k)}</button>`).join('')}
      <button type="button" class="key small icon fold" data-fold title="Fold the display" aria-label="Fold the display">${side === 'left' ? '‹' : '›'}</button></nav><div class="screen"></div>`;
    root.querySelector('.keys').addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]');
      if (b) { root.classList.remove('closed'); this.show(side, b.dataset.page); return; }
      if (e.target.closest('[data-fold]')) root.classList.toggle('closed');
    });
  }
  register(side, key, page) {
    const screen = $(`#mfd-${side} .screen`);
    const el = document.createElement('div');
    el.className = 'page';
    el.dataset.page = key;
    screen.appendChild(el);
    page.mount(el);
    this.pages[side].set(key, { page, el });
  }
  show(side, key) {
    const prev = this.shown[side];
    if (prev && prev !== key) { const p = this.pages[side].get(prev); p.el.classList.remove('on'); p.page.hide?.(); }
    const p = this.pages[side].get(key);
    if (!p) return;
    p.el.classList.add('on');
    this.shown[side] = key;
    for (const b of document.querySelectorAll(`#mfd-${side} [data-page]`)) b.classList.toggle('on', b.dataset.page === key);
    p.page.show?.();
    this.save();
  }
  isShown(key) { return this.shown.left === key || this.shown.right === key; }
  restore() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { /* none */ }
    return s;
  }
  save() {
    try { localStorage.setItem(STORE, JSON.stringify({ left: this.shown.left, right: this.shown.right })); } catch { /* none */ }
  }

  // ---- annunciators and messages ---------------------------------------------------------------------
  lamp(id, label, title = '') {
    const box = $('#annunciators');
    const el = document.createElement('div');
    el.className = 'lamp';
    el.textContent = label;
    el.title = title;
    el.addEventListener('click', () => { el.classList.remove('unseen'); });
    box.appendChild(el);
    this.lamps.set(id, { el, state: 'off', title });
  }
  // state: 'off' | 'good' | 'advisory' | 'caution' | 'warning'; a change is logged.
  setLamp(id, state, why = '') {
    const l = this.lamps.get(id);
    if (!l) return;
    if (l.state === state && l.why === why) return;
    const was = l.state;
    l.state = state;
    l.why = why;
    l.el.className = `lamp ${state === 'off' ? '' : state}${state === 'warning' ? ' unseen' : ''}`;
    l.el.title = `${l.title}${why ? `: ${why}` : ''}`;
    if (why && (state === 'caution' || state === 'warning' || (state === 'advisory' && was !== 'advisory'))) this.message(state === 'good' ? 'advisory' : state, why, id);
    else if (why && state === 'good' && (was === 'caution' || was === 'warning')) this.message('advisory', why, id);
  }
  message(level, text, source = '') {
    const at = new Date();
    const last = this.log[this.log.length - 1];
    if (last && last.text === text && last.level === level) { last.count = (last.count || 1) + 1; last.at = at; }
    else this.log.push({ level, text, source, at });
    if (this.log.length > 300) this.log.shift();
    this.drawMessages();
    this.onMessage?.();
  }
  drawMessages() {
    const list = $('#messages');
    list.innerHTML = this.log.slice(-4).reverse().map((m) => `<li class="${m.level}"><span class="t">${m.at.toISOString().slice(11, 19)}</span><span>${m.level === 'warning' ? 'WARNING ' : m.level === 'caution' ? 'CAUTION ' : ''}${esc(m.text)}${m.count > 1 ? ` (×${m.count})` : ''}</span></li>`).join('');
  }

  // ---- the clocks -------------------------------------------------------------------------------------
  buildClocks() {
    const box = $('#clocks');
    const cells = [['utc', 'UTC', true], ['tt', 'TT'], ['tdb', 'TDB'], ['mjd', 'MJD (TT)'], ['rate', 'World clock'], ['away', 'From the present']];
    box.innerHTML = cells.map(([k, label, wide]) => `<div class="clock-cell ${wide ? 'wide' : ''}" data-cell="${k}"><span class="label">${label}</span><span class="value" id="clock-${k}">—</span></div>`).join('');
    for (const [k] of cells) this.clockCells[k] = $(`#clock-${k}`);
  }
  updateClocks(tt, { ttMinusUtc, tdbMinusTt = 0, rate, running, fromPresent }) {
    const c = this.clockCells;
    c.utc.textContent = `${utcIso(tt, ttMinusUtc)}`;
    c.tt.textContent = utcIso(tt, 0).slice(11);
    c.tdb.textContent = utcIso(tt + tdbMinusTt, 0).slice(11);
    c.mjd.textContent = mjdOfTt(tt).toFixed(6);
    c.rate.textContent = rateText(rate, running);
    const away = Math.abs(fromPresent) > 5;
    c.away.textContent = away ? duration(fromPresent) : 'now';
    c.away.classList.toggle('away', away);
  }

  // ---- the CDU: bodies and time --------------------------------------------------------------------------
  bodyKeys(bodies, onPick) {
    const box = $('#body-keys');
    const abbr = { sun: 'Sun', mercury: 'Mer', venus: 'Ven', earth: 'Earth', moon: 'Moon', mars: 'Mars', jupiter: 'Jup', saturn: 'Sat', uranus: 'Ura', neptune: 'Nep', pluto: 'Plu' };
    box.innerHTML = bodies.map((b) => `<button type="button" class="key small" data-body="${esc(b.key)}" title="${esc(b.name)}">${esc(abbr[b.key] || b.name)}</button>`).join('')
      + '<button type="button" class="key small" data-body="system" title="The Solar System, about the Sun">Sys</button>';
    box.addEventListener('click', (e) => {
      const k = e.target.closest('[data-body]');
      if (k) onPick(k.dataset.body);
    });
  }
  markFocus(key, name) {
    for (const b of document.querySelectorAll('#body-keys [data-body]')) b.classList.toggle('on', b.dataset.body === key);
    $('#focus-name').textContent = name || '';
  }
  timeKeys(clock) {
    const box = $('#time-keys');
    box.innerHTML = `<button type="button" class="key small" data-t="slower" title="Slower, or backwards">◀◀</button>
      <button type="button" class="key small" data-t="play" title="Run or hold the world clock">▶ ❚❚</button>
      <button type="button" class="key small" data-t="faster" title="Faster">▶▶</button>
      <button type="button" class="key small" data-t="real" title="Real rate">×1</button>
      <button type="button" class="key small" data-t="present" title="The present, at real time">Now</button>`;
    box.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-t]');
      if (!k) return;
      try {
        const faster = RATES.find((r) => r > clock.rate + 1e-9) ?? clock.rate;
        const slower = [...RATES].reverse().find((r) => r < clock.rate - 1e-9) ?? clock.rate;
        if (k.dataset.t === 'play') await clock.play();
        else if (k.dataset.t === 'faster') await clock.setRate(faster);
        else if (k.dataset.t === 'slower') await clock.setRate(slower);
        else if (k.dataset.t === 'real') await clock.setRate(1);
        else if (k.dataset.t === 'present') await clock.toPresent();
      } catch (error) {
        this.message('caution', `The world clock was not changed: ${error.message}`, 'clock');
      }
    });
  }
  updateTimeKeys(clock) {
    const play = document.querySelector('#time-keys [data-t="play"]');
    if (play) play.classList.toggle('on', clock.running);
    const real = document.querySelector('#time-keys [data-t="real"]');
    if (real) real.classList.toggle('on', clock.rate === 1 && clock.running);
    $('#time-readout').textContent = `${rateText(clock.rate, clock.running)}${clock.roundTrip ? ` · server ${fmt(clock.roundTrip * 1e3, 0)} ms away` : ''}`;
  }
}
