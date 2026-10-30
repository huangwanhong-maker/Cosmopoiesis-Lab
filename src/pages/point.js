// POINT: the point chosen, the place every display of the science deck studies (decision 0006).
//
// A point is chosen by a click on any body, by a name, or by an address. It is shown first as a
// place (its coordinates on the body's figure, the named feature it lies in), then as seen from the
// observer, whose instruments read the environment (they follow the point unless told not to), then
// the world's fields there (every field of the world at the point, each of its components with its unit
// and provenance: the integrated field at a point, decision 0012), and then in every frame and chart of
// the catalogue, each answer an address that reads back to the same point (navigation/frames/address.hpp).
// The view's own target, the camera, and the language of addresses with its examples close the page.

import { engine } from '../api.js';
import { provenanceTag } from '../busclient.js';
import { esc, fmt, length, ttText, latText, lonText } from '../format.js';

const DEG = 180 / Math.PI;
const RADIUS_KM = { earth: 6371.0, moon: 1737.4 };

// Examples of the language of addresses: each reads in the engine's grammar.
export const EXAMPLES = [
  ['Tycho', 'a crater, by its name in the gazetteer'],
  ['moon(43.31 S, 11.36 W)', 'a point on the Moon\'s figure: latitude, longitude'],
  ['moon(43.31 S, 11.36 W, 2000 m)', 'with a height above the figure'],
  ['earth(48.8584 N, 2.2945 E)', 'a point on the Earth (WGS 84)'],
  ['earth(51.4779 N, 0.0015 W)/aer(90°, 30°, 400 km)', 'a step from a point: azimuth, elevation and range from it'],
  ['earth(35.3606 N, 138.7274 E)/enu(0 m, 0 m, 10 km)', 'a step east, north and up from a point'],
  ['moon(0.674 N, 23.473 E) @ 1969-07-20T20:17:40Z', 'a point at an instant (sets the world clock)'],
  ['earth(48.8584 N, 2.2945 E) @ now', 'a point at the present'],
  ['mars', 'a body\'s centre'],
  ['ICRS:equatorial(266.4°, -28.9°, 8.1 kpc)', 'a point in a frame\'s chart: the Galaxy\'s centre'],
];

// The named feature a point lies in or near, from the gazetteer: within half a lunar feature's
// diameter, or within 40 km of a place on the Earth.
export function nearestPlace(gazetteer, body, latDeg, lonDeg) {
  const R = RADIUS_KM[body];
  if (!gazetteer || !R) return null;
  const la = latDeg / DEG, lo = lonDeg / DEG;
  let best = null;
  for (const e of gazetteer.entries) {
    if (e.body !== body || e.kind === 'Country') continue;
    const lb = e.lat / DEG, dl = e.lon / DEG - lo;
    const c = Math.sin(la) * Math.sin(lb) + Math.cos(la) * Math.cos(lb) * Math.cos(dl);
    const d = R * Math.acos(Math.min(1, Math.max(-1, c)));
    const reach = e.size ? Math.max(e.size / 2, 3) : 40;
    if (d <= reach && (!best || d / reach < best.score)) best = { entry: e, d, score: d / reach, inside: e.size ? d <= e.size / 2 : false };
  }
  return best;
}

export function pointPage(app) {
  let el, grammarShown = false, lastAnswer = null;
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>Point chosen <span class="aside" id="pt-body"></span></h3>
        <div id="pt-where"></div>
        <div id="pt-tiles"></div>
        <div class="keyrow" id="pt-keys">
          <button type="button" class="key small" id="pt-observe">Observe from here</button>
          <button type="button" class="key small" id="pt-field">Field about it</button>
          <button type="button" class="key small" id="pt-fly">Fly to it</button>
          <button type="button" class="key small" id="pt-copy">Put in the address line</button>
        </div>
        <label class="switch"><input type="checkbox" id="pt-follow"><span>The observer follows the point chosen <small>a click on a body then moves the observer and its instruments there</small></span></label>
        <h3>From the observer</h3>
        <div id="pt-seen"><p class="note">The observer's instruments read where it stands; the point is seen from it.</p></div>
        <h3>The fields here <span class="aside">every field of the world at the point, each component</span></h3>
        <div id="pt-fields"><p class="note">Choose a point to read the world's fields there.</p></div>
        <div class="keyrow"><button type="button" class="key small" id="pt-fields-read">Read again</button></div>
        <h3>In every frame <span class="aside">each an address of the same point</span></h3>
        <details id="pt-frames-box"><summary>The frames and charts of the catalogue <small id="pt-frames-count"></small></summary><div id="pt-frames"></div></details>
        <h3>The view <span class="aside" id="pt-focus"></span></h3>
        <div class="address" id="pt-view" title="Click to put it in the address line">—</div>
        <div id="pt-view-tiles"></div>
        <div class="row"><span>The camera</span>
          <label class="switch"><input type="radio" name="follow" value="ground" checked><span>turns with the ground</span></label>
          <label class="switch"><input type="radio" name="follow" value="stars"><span>stays with the stars</span></label></div>
        <h3>The language of addresses</h3>
        <div id="pt-examples">${EXAMPLES.map(([t, about]) => `<div class="row" style="margin:3px 0"><button type="button" class="link" data-example="${esc(t)}"><code>${esc(t)}</code></button><small>${esc(about)}</small></div>`).join('')}</div>
        <details id="pt-grammar-box"><summary>The grammar</summary><div id="pt-grammar"></div></details>`;
      el.addEventListener('change', (e) => {
        if (e.target.name === 'follow') { app.nav.follow = e.target.value; app.touch(); }
        if (e.target.id === 'pt-follow') {
          app.setObserverFollows(e.target.checked);
          if (e.target.checked && app.picked && (app.picked.canonical || app.picked.address) !== app.observer) app.setObserver(app.picked.canonical || app.picked.address);
          app.updateContext?.();
        }
      });
      el.addEventListener('click', (e) => {
        const ex = e.target.closest('[data-example]');
        if (ex) { app.putAddress(ex.dataset.example); return; }
        const a = e.target.closest('.address[data-text]') || (e.target.closest('#pt-view') ? el.querySelector('#pt-view') : null);
        if (a) app.putAddress(a.dataset.text || a.textContent);
        const p = app.picked;
        if (e.target.id === 'pt-observe' && p) app.setObserver(p.canonical || p.address);
        if (e.target.id === 'pt-field' && p) app.openField?.('point');
        if (e.target.id === 'pt-fly' && p) app.flyToPoint?.();
        if (e.target.id === 'pt-copy' && p) app.putAddress(p.canonical || p.address);
        if (e.target.id === 'pt-fields-read' && p) page.fields(p);
      });
      el.querySelector('#pt-grammar-box').addEventListener('toggle', (e) => { if (e.target.open && !grammarShown) { grammarShown = true; grammar(); } });
      page.render();
    },
    show() { page.render(); },
    // Each status tick: the view.
    update() {
      if (!el || !app.isShown('POINT')) return;
      const v = app.nav.controls.view, key = app.nav.focus;
      const body = app.scene.bodies[key];
      el.querySelector('#pt-focus').textContent = body?.name || '';
      const text = viewAddress(key, v);
      const box = el.querySelector('#pt-view');
      if (box.dataset.text !== text) { box.textContent = text; box.dataset.text = text; }
      el.querySelector('#pt-view-tiles').innerHTML = `<div class="readings">
        <div class="reading"><div class="what">Range to the target</div><div class="v">${esc(length(v.range))}</div></div>
        <div class="reading"><div class="what">Eye above the ground</div><div class="v">${esc(length(app.altitude))}</div></div>
        <div class="reading wide"><div class="what">Heading, tilt</div><div class="v">${fmt(v.heading * DEG, 1)}°<span class="u">heading</span> ${fmt(v.tilt * DEG, 1)}°<span class="u">tilt</span></div></div></div>`;
    },
    // The point's place, from the page's own knowledge (its coordinates, the gazetteer).
    render() {
      if (!el) return;
      const p = app.picked;
      el.querySelector('#pt-follow').checked = !!app.observerFollows;
      for (const id of ['pt-observe', 'pt-field', 'pt-fly', 'pt-copy']) el.querySelector(`#${id}`).disabled = !p;
      const isObserver = p && (p.canonical || p.address) === app.observer;
      el.querySelector('#pt-observe').disabled = !p || isObserver;
      if (!p) {
        el.querySelector('#pt-body').textContent = '';
        el.querySelector('#pt-where').innerHTML = `<div class="where">${POINT_GLYPH}<div><div class="what">No point chosen yet</div><div class="more">Click a point on any body, write a place's name or an address below, or choose a body's key.</div></div></div>`;
        el.querySelector('#pt-tiles').innerHTML = '';
        return;
      }
      const lat = p.lat !== undefined ? p.lat * DEG : p.latDeg, lon = p.lon !== undefined ? p.lon * DEG : p.lonDeg;
      const bodyName = app.scene.bodies[p.body]?.name || p.body || '';
      el.querySelector('#pt-body').textContent = bodyName ? `on ${bodyName}` : '';
      const near = lat !== undefined ? nearestPlace(app.gazetteer, p.body, lat, lon) : null;
      const named = near ? (near.inside ? `In ${near.entry.name}` : `${fmt(near.d, near.d < 10 ? 1 : 0)} km from ${near.entry.name}`) : '';
      el.querySelector('#pt-where').innerHTML = `<div class="where">${POINT_GLYPH}<div>
          <div class="what">${esc(named || (lat !== undefined ? `On ${bodyName}` : 'A point in space'))}${near?.entry.kind ? ` <small>${esc(near.entry.kind)}${near.entry.size ? `, ${fmt(near.entry.size, 0)} km across` : ''}</small>` : ''}</div>
          <div class="place">${lat !== undefined ? `${latText(lat, 4)}, ${lonText(lon, 4)}` : esc(p.address)}</div></div>
          <div class="more">${isObserver ? 'The observer is here: the environment (ENV) is read at this point.' : 'The observer is elsewhere: ENV reads the observer, not this point.'}</div></div>`;
      el.querySelector('#pt-tiles').innerHTML = lat !== undefined ? `<div class="readings">
          <div class="reading"><div class="what">Height above the figure</div><div class="v">${fmt(Math.abs(p.h ?? 0) < 0.05 ? 0 : p.h, 1)}<span class="u">m</span></div><div class="sub">${esc(app.scene.bodies[p.body]?.fig?.name || '')}</div></div>
          <div class="reading"><div class="what">Frame</div><div class="v text">${esc(app.world?.info.get(p.body)?.fixedFrame || '—')}</div><div class="sub">the body's fixed frame</div></div></div>` : '';
    },
    // A point chosen: ask the engine for it in every frame and chart, and from the observer.
    async choose(point) {
      page.render();
      const box = el.querySelector('#pt-frames'), seen = el.querySelector('#pt-seen');
      box.innerHTML = '<p class="note">asking the engine…</p>';
      try {
        const a = await engine({ op: 'address', text: point.address, time: ttText(app.clock.now()), observer: app.observer || '' });
        point.canonical = a.canonical;
        lastAnswer = a;
        const rows = a.answers.map((x) => x.error
          ? `<tr><th>${esc(x.frame)}<small>${esc(x.chart)}</small></th><td class="note">${esc(x.error)}</td></tr>`
          : `<tr><th>${esc(x.frame)}<small>${esc(x.chart)}</small></th><td><div class="address" data-text="${esc(x.address)}" title="${esc(x.canonical)}">${esc(x.address.replace(/^[A-Z_]+:[a-z]+/, '').replace(/^\(|\)$/g, ''))}</div></td></tr>`).join('');
        el.querySelector('#pt-frames-count').textContent = `${a.answers.filter((x) => !x.error).length} answers`;
        box.innerHTML = `<div class="address" data-text="${esc(a.canonical)}">${esc(a.display)}</div><table><tbody>${rows}</tbody></table>
          <p class="note">Each answer is an address in that frame's chart, and reads back to the same point (click one to put it in the address line). Positions are geometric, at ${esc(a.time.scales.UTC?.iso || a.time.scales.TT.iso)}.</p>`;
        const s = a.from_the_observer || {};
        const aer = s.aer?.values, enu = s.enu?.values;
        if ((point.canonical || point.address) === app.observer) seen.innerHTML = '<p class="note">The point is the observer itself.</p>';
        else if (aer) {
          seen.innerHTML = `<div class="readings">
            <div class="reading wide big"><div class="what">Range from the observer</div><div class="v">${esc(length(aer.range_m))}</div></div>
            <div class="reading"><div class="what">Azimuth</div><div class="v">${fmt(aer.azimuth_deg, 2)}<span class="u">° from north</span></div></div>
            <div class="reading"><div class="what">Elevation</div><div class="v">${fmt(aer.elevation_deg, 2)}<span class="u">°</span></div></div>
            ${enu ? `<div class="reading wide"><div class="what">East, north, up</div><div class="sub"><span class="n">${esc(length(enu.east_m))}</span> east · <span class="n">${esc(length(enu.north_m))}</span> north · <span class="n">${esc(length(enu.up_m))}</span> up</div></div>` : ''}</div>
            <p class="note">In the observer's local horizon (${esc(app.observer)}).</p>`;
        } else seen.innerHTML = '<p class="note">The observer is not on a body: the point is not seen from a horizon.</p>';
        page.render();
        app.updateContext?.();
      } catch (error) {
        box.innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
      page.fields(point);
    },
    // Every field of the world at the point, at the world's instant: each of its components.
    async fields(point) {
      const box = el.querySelector('#pt-fields');
      box.innerHTML = '<p class="note">reading the world\'s fields there…</p>';
      try {
        const a = await engine({ op: 'field.at', at: point.canonical || point.address, time: ttText(app.clock.now()) });
        box.innerHTML = fieldsHere(a);
      } catch (error) {
        box.innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
    },
    // The observer moved: the point is seen from its new place.
    showObserver() { if (app.picked) page.choose(app.picked); else page.render(); },
    answer() { return lastAnswer; },
  };

  async function grammar() {
    const box = el.querySelector('#pt-grammar');
    try {
      const a = await engine({ op: 'address', text: 'ssb', time: ttText(app.clock.now()), charts: true, answers: [] });
      const frames = Object.entries(a.charts).filter(([, c]) => c.length).map(([f, c]) => `<tr><th><code>${esc(f)}</code></th><td>${c.map(esc).join(', ')}</td></tr>`).join('');
      box.innerHTML = `<pre>${esc(a.grammar)}</pre>
        <p class="note">BODY is a body's name (sun, mercury … pluto, ssb, galaxy); FRAME a frame of the catalogue; UNIT m km au ly pc kpc Mpc deg rad arcmin arcsec; HEMISPHERE N S E W. A step from a point follows a slash: <code>earth(…)/aer(…)</code>. Every alternative begins with its own terminal, so the grammar is LL(1) and an address has one reading; its canonical text reads back to itself.</p>
        <table><tbody>${frames}</tbody></table>`;
    } catch (error) {
      box.innerHTML = `<p class="error">${esc(error.message)}</p>`;
    }
  }
  return page;
}

// The world's fields at a point (the engine's field.at), each a block: its title and provenance, its name and
// frame, and its value: a scalar with its unit; a vector on the local east, north and up of the body the
// point is on (else on its frame's axes) with its length. Those with a value come first; those without one
// there (out of their base, or their model not loaded) follow under a fold, each with why. Teslas in nT.
export function fieldsHere(a) {
  const shown = (x) => {
    if (!Number.isFinite(x)) return '—';
    const m = Math.abs(x);
    return fmt(x, m === 0 ? 0 : m >= 1000 ? 0 : m >= 100 ? 1 : m >= 10 ? 2 : 3);
  };
  const block = (f) => {
    const head = `<div class="head"><span class="title">${esc(f.title)}</span>${f.provenance ? provenanceTag(f.provenance) : ''}</div>
      <div class="name"><code>${esc(f.name)}</code>${f.frame ? ` · ${esc(f.frame)}` : ''}</div>`;
    if (f.missing) return `<div class="field-row">${head}<div class="why">${esc(f.missing)}</div></div>`;
    if (f.quality !== 'valid') return `<div class="field-row">${head}<div class="why">${esc(f.quality)}: ${esc(f.reason || '')}</div></div>`;
    const nano = f.unit === 'T', unit = nano ? 'nT' : f.unit, k = nano ? 1e9 : 1;
    let value;
    if (Array.isArray(f.value)) {
      const [c, axes] = f.enu ? [f.enu, ['east', 'north', 'up']] : [f.value, ['x', 'y', 'z']];
      value = `${c.map((x, i) => `<span class="n">${shown(k * x)}</span> <span class="u">${axes[i]}</span>`).join(' ')}
        <div class="sub">|v| <span class="n">${shown(k * f.magnitude)}</span> ${esc(unit)}${f.enu ? '' : ` · on the axes of ${esc(f.frame)}`}</div>`;
    } else value = `<span class="n">${shown(k * f.value)}</span> <span class="u">${esc(unit)}</span>`;
    return `<div class="field-row">${head}<div class="val">${value}</div>${f.note ? `<div class="why">${esc(f.note)}</div>` : ''}</div>`;
  };
  const valid = a.fields.filter((f) => f.quality === 'valid'), others = a.fields.filter((f) => f.quality !== 'valid');
  return `<div class="fields-here">${valid.map(block).join('')}</div>
    ${others.length ? `<details class="fields-here-none"><summary>${others.length} fields have no value here <small>out of their base, or their model not loaded</small></summary><div class="fields-here">${others.map(block).join('')}</div></details>` : ''}
    <p class="note">${valid.length} of ${a.fields.length} fields have a value here${a.time?.utc ? `, at ${esc(String(a.time.utc).replace('T', ' ').slice(0, 19))} UTC` : ''}. A vector is given on the local east, north and up of the body the point is on. Each field is its domain's model, read where the point is in the field's own frame.</p>`;
}

const POINT_GLYPH = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.2" class="glyph-point"/><path d="M8 0.5v4M8 11.5v4M0.5 8h4M11.5 8h4" class="glyph-point"/></svg>';
export const OBSERVER_GLYPH = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 L13.5 8 L8 14.5 L2.5 8 Z" class="glyph-observer"/></svg>';
export { POINT_GLYPH };

// The view's target as an address: the focus body's surface chart.
export function viewAddress(key, v) {
  const lat = v.lat * DEG, lon = v.lon * DEG;
  return `${key}(${latText(lat, 5)}, ${lonText(lon, 5)}${Math.abs(v.height) > 0.5 ? `, ${v.height.toFixed(0)} m` : ''})`;
}
