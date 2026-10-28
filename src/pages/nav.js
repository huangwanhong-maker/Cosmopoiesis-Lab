// NAV: where the view is, and a point in every frame and chart.
//
// The view's address is written in the language of addresses (navigation/frames/address.hpp) as the
// focus body's surface chart; a point chosen on any body is answered by the engine in every frame of
// the catalogue, each answer an address that reads back to the same point, and seen from the
// observer (azimuth, elevation and range; east, north and up; north, east and down). The grammar
// is the engine's own.

import { engine, acquire } from '../api.js';
import { esc, fmt, length, ttText, latText, lonText } from '../format.js';

const DEG = 180 / Math.PI;

export function navPage(app) {
  let el, grammarShown = false;
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>The view <span class="aside" id="nav-focus"></span></h3>
        <div class="address" id="nav-view" title="Click to put it in the address line">—</div>
        <table><tbody id="nav-view-table"></tbody></table>
        <div class="row"><span>The camera</span>
          <label class="switch"><input type="radio" name="follow" value="ground" checked><span>turns with the ground</span></label>
          <label class="switch"><input type="radio" name="follow" value="stars"><span>stays with the stars</span></label></div>
        <h3>The point chosen <span class="aside">click the world</span></h3>
        <div id="nav-point"><p class="note">Click a point on any body: it is answered in every frame and chart, and seen from the observer.</p></div>
        <h3>The observer <span class="aside">its instruments read the environment</span></h3>
        <div class="address" id="nav-observer">—</div>
        <p id="nav-observer-place" class="note"></p>
        <p><button type="button" class="key small" id="nav-set-observer" disabled>Observe from the point chosen</button>
           <button type="button" class="key small" id="nav-go-observer">Go to the observer</button></p>
        <h3>The language of addresses <span class="aside"><button type="button" class="link" id="nav-grammar-toggle">show</button></span></h3>
        <div id="nav-grammar" hidden></div>`;
      el.addEventListener('change', (e) => { if (e.target.name === 'follow') { app.nav.follow = e.target.value; app.touch(); } });
      el.addEventListener('click', (e) => {
        const a = e.target.closest('.address[data-text]') || (e.target.id === 'nav-view' ? e.target : null);
        if (a) app.putAddress(a.dataset.text || a.textContent);
        if (e.target.id === 'nav-set-observer' && app.picked) setObserver(app.picked.canonical);
        if (e.target.id === 'nav-go-observer' && app.observer) app.goTo(app.observer);
        if (e.target.id === 'nav-grammar-toggle') {
          grammarShown = !grammarShown;
          el.querySelector('#nav-grammar').hidden = !grammarShown;
          e.target.textContent = grammarShown ? 'hide' : 'show';
          if (grammarShown) grammar();
        }
      });
    },
    // Each status tick: the view's address.
    update() {
      if (!el || !app.isShown('NAV')) return;
      const v = app.nav.controls.view, key = app.nav.focus;
      const body = app.scene.bodies[key];
      el.querySelector('#nav-focus').textContent = body?.name || '';
      const text = viewAddress(key, v);
      const box = el.querySelector('#nav-view');
      box.textContent = text;
      box.dataset.text = text;
      el.querySelector('#nav-view-table').innerHTML = `
        <tr><th>Range</th><td class="num">${length(v.range)}</td></tr>
        <tr><th>Eye above the ground</th><td class="num">${length(app.altitude)}</td></tr>
        <tr><th>Heading, tilt</th><td class="num">${fmt(v.heading * DEG, 1)}°, ${fmt(v.tilt * DEG, 1)}°</td></tr>`;
    },
    // A point chosen: ask the engine for it in every frame and chart.
    async choose(point) {
      el.querySelector('#nav-set-observer').disabled = false;
      const box = el.querySelector('#nav-point');
      box.innerHTML = '<p class="note">asking the engine…</p>';
      try {
        const a = await engine({ op: 'address', text: point.address, time: ttText(app.clock.now()), observer: app.observer || '' });
        point.canonical = a.canonical;
        const rows = a.answers.map((x) => x.error
          ? `<tr><th>${esc(x.frame)}<small>${esc(x.chart)}</small></th><td class="note">${esc(x.error)}</td></tr>`
          : `<tr><th>${esc(x.frame)}<small>${esc(x.chart)}</small></th><td><div class="address" data-text="${esc(x.address)}" title="${esc(x.canonical)}">${esc(x.address.replace(/^[A-Z_]+:[a-z]+/, '').replace(/^\(|\)$/g, ''))}</div></td></tr>`).join('');
        const seen = a.from_the_observer || {};
        const aer = seen.aer?.values, enu = seen.enu?.values;
        box.innerHTML = `<div class="address" data-text="${esc(a.canonical)}">${esc(a.display)}</div>
          <table><tbody>${rows}</tbody></table>
          ${aer ? `<table><tbody><tr><th>From the observer</th><td class="num">az ${fmt(aer.azimuth_deg, 4)}°, el ${fmt(aer.elevation_deg, 4)}°<br>${length(aer.range_m)}</td></tr>
            ${enu ? `<tr><th>East, north, up</th><td class="num">${[enu.east_m, enu.north_m, enu.up_m].map((x) => length(x)).join('<br>')}</td></tr>` : ''}</tbody></table>` : ''}
          <p class="note">Each answer is an address in that frame's chart; it reads back to the same point (click to put it in the address line). Positions are geometric, at ${esc(a.time.scales.UTC?.iso || a.time.scales.TT.iso)}.</p>`;
      } catch (error) {
        box.innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
    },
    showObserver() {
      if (!el) return;
      el.querySelector('#nav-observer').textContent = app.observer || '—';
      const p = app.observerPlace;
      el.querySelector('#nav-observer-place').textContent = p ? `${p.body === 'earth' ? 'On the Earth' : `On ${p.body}`}: ${latText(p.latitude_deg, 4)}, ${lonText(p.longitude_deg, 4)}, ${fmt(p.height_m, 1)} m` : '';
    },
  };

  async function setObserver(text) {
    try {
      const a = await acquire({ observer: text });
      app.adoptAcquisition(a);
      app.console.message('advisory', `The observer is now at ${text}`, 'nav');
    } catch (error) {
      app.console.message('caution', `The observer was not moved: ${error.message}`, 'nav');
    }
  }

  async function grammar() {
    const box = el.querySelector('#nav-grammar');
    try {
      const a = await engine({ op: 'address', text: 'ssb', time: ttText(app.clock.now()), charts: true, answers: [] });
      const frames = Object.entries(a.charts).filter(([, c]) => c.length).map(([f, c]) => `<tr><th>${esc(f)}</th><td>${c.map(esc).join(', ')}</td></tr>`).join('');
      box.innerHTML = `<pre>${esc(a.grammar)}</pre>
        <p class="note">BODY is a body's name (sun, mercury … pluto, ssb, galaxy); FRAME a frame of the catalogue; UNIT m km au ly pc kpc Mpc deg rad arcmin arcsec; HEMISPHERE N S E W. Every alternative begins with its own terminal: the grammar is LL(1), and an address has one reading. Its canonical text reads back to itself.</p>
        <table><tbody>${frames}</tbody></table>`;
    } catch (error) {
      box.innerHTML = `<p class="error">${esc(error.message)}</p>`;
    }
  }
  return page;
}

// The view's target as an address: the focus body's surface chart.
export function viewAddress(key, v) {
  const lat = v.lat * DEG, lon = v.lon * DEG;
  return `${key}(${latText(lat, 5)}, ${lonText(lon, 5)}${Math.abs(v.height) > 0.5 ? `, ${v.height.toFixed(0)} m` : ''})`;
}
