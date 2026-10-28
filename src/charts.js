// Small charts of the console, in SVG: a profile against height, a skyplot, gauges with their scales'
// thresholds, the scheduler's timeline, and a compass of the magnetic field. Their colours are the
// console's validated tokens (styles.css): a series wears the colour of what it is (a model's blue, an
// observation's pink), text wears the ink, status the four status colours with a word. Every mark
// shows its value on hover (the tooltip #tip).

import { esc, fmt } from './format.js';

const NS = 'http://www.w3.org/2000/svg';

export function svg(el, width, height) {
  el.innerHTML = '';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${width} ${height}`);
  s.setAttribute('class', 'chart');
  el.appendChild(s);
  return s;
}
export function node(parent, name, attrs = {}, text = null) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== null) e.textContent = text;
  parent.appendChild(e);
  return e;
}

// The tooltip: shown beside the pointer while it is over a mark.
export function hover(target, html) {
  const tip = document.getElementById('tip');
  target.addEventListener('pointermove', (e) => {
    tip.innerHTML = typeof html === 'function' ? html(e) : html;
    tip.hidden = false;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14);
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.max(8, e.clientY - tip.offsetHeight - 10)}px`;
  });
  target.addEventListener('pointerleave', () => { tip.hidden = true; });
}

const ticks = (a, b, n = 5) => {
  const span = b - a, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), r = step0 / mag;
  const step = (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9 * step; v += step) out.push(+v.toPrecision(12));
  return out;
};

// A profile: a quantity (x) against height (y, up). spec: { title, x: [], y: [], unit, yUnit, log,
// colour, marks: [{ y, label }], bands: [{ from, to, label }], format(x) }.
export function profile(el, spec) {
  const W = 168, H = 230, L = 34, R = 8, T = 18, B = 26;
  const s = svg(el, W, H);
  const xs = spec.x, ys = spec.y;
  const fx = spec.log ? Math.log10 : (v) => v;
  let x0 = Math.min(...xs.map(fx)), x1 = Math.max(...xs.map(fx));
  if (x1 - x0 < 1e-9) { x0 -= 1; x1 += 1; }
  const pad = (x1 - x0) * 0.06;
  x0 -= pad; x1 += pad;
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (v) => L + ((fx(v) - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => H - B - ((v - y0) / (y1 - y0 || 1)) * (H - T - B);
  node(s, 'text', { x: L, y: 11, class: 'title' }, spec.title);
  (spec.bands || []).forEach((b, i) => {
    const top = Math.min(y1, b.to), bottom = Math.max(y0, b.from);
    if (top <= bottom) return;
    node(s, 'rect', { x: L, y: Y(top), width: W - L - R, height: Y(bottom) - Y(top), class: `band ${i % 2 ? 'alt' : ''}` });
  });
  for (const t of ticks(y0, y1, 4)) {
    node(s, 'line', { x1: L, x2: W - R, y1: Y(t), y2: Y(t), class: 'grid' });
    node(s, 'text', { x: L - 4, y: Y(t) + 3.5, 'text-anchor': 'end' }, fmt(t / 1000, 0));
  }
  const xt = spec.log ? ticks(Math.ceil(x0), Math.floor(x1), 3).map((e) => 10 ** e) : ticks(spec.log ? 10 ** x0 : x0, spec.log ? 10 ** x1 : x1, 3);
  for (const t of xt) {
    if (X(t) < L - 1 || X(t) > W - R + 1) continue;
    node(s, 'line', { x1: X(t), x2: X(t), y1: T, y2: H - B, class: 'grid' });
    node(s, 'text', { x: X(t), y: H - B + 12, 'text-anchor': 'middle' }, spec.tick ? spec.tick(t) : fmt(t, 0));
  }
  node(s, 'text', { x: (L + W - R) / 2, y: H - 3, 'text-anchor': 'middle' }, spec.unit);
  node(s, 'text', { x: 2, y: T - 4 }, spec.yUnit || 'km');
  node(s, 'path', { d: xs.map((v, i) => `${i ? 'L' : 'M'}${X(v).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(''), class: 'line', stroke: spec.colour || 'var(--prov-model)' });
  for (const m of spec.marks || []) {
    if (m.y < y0 || m.y > y1) continue;
    node(s, 'line', { x1: L, x2: W - R, y1: Y(m.y), y2: Y(m.y), class: 'mark-line' });
    node(s, 'text', { x: W - R - 2, y: Y(m.y) - 3, 'text-anchor': 'end', class: 'label' }, m.label);
  }
  // Hover: the level nearest the pointer's height.
  const hit = node(s, 'rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'hit' });
  const dot = node(s, 'circle', { r: 3.5, fill: spec.colour || 'var(--prov-model)', stroke: 'var(--panel-solid)', 'stroke-width': 2, visibility: 'hidden' });
  hover(hit, (e) => {
    const box = s.getBoundingClientRect();
    const py = ((e.clientY - box.top) / box.height) * H;
    const h = y0 + ((H - B - py) / (H - T - B)) * (y1 - y0);
    let best = 0;
    for (let i = 1; i < ys.length; i++) if (Math.abs(ys[i] - h) < Math.abs(ys[best] - h)) best = i;
    dot.setAttribute('cx', X(xs[best]));
    dot.setAttribute('cy', Y(ys[best]));
    dot.setAttribute('visibility', 'visible');
    return `<b>${esc(spec.format ? spec.format(xs[best]) : fmt(xs[best], 3))}</b> at ${fmt(ys[best] / 1000, 2)} km`;
  });
  hit.addEventListener('pointerleave', () => dot.setAttribute('visibility', 'hidden'));
  return s;
}

// Labels beside their marks without covering one another or another mark: the larger marks first,
// each label at the first of eight places round its mark that is free; a label with no free place is
// left to the mark's tooltip (selective direct labels).
function placeLabels(s, marks, size, charWidth = 5.8, height = 11) {
  const boxes = marks.map((m) => ({ x0: m.x - m.size, x1: m.x + m.size, y0: m.y - m.size, y1: m.y + m.size, own: m }));
  const free = (b, own) => b.x0 >= 0 && b.x1 <= size && b.y0 >= 12 && b.y1 <= size + 6
    && !boxes.some((o) => o.own !== own && o.x0 < b.x1 && b.x0 < o.x1 && o.y0 < b.y1 && b.y0 < o.y1);
  for (const m of [...marks].filter((m) => m.it.label).sort((a, b) => b.size - a.size)) {
    const w = m.it.label.length * charWidth, g = m.size + 2;
    const places = [[g, -height / 2, 'start'], [-g, -height / 2, 'end'], [-w / 2, -g - height, 'middle'], [-w / 2, g, 'middle'],
      [g, -height - 1, 'start'], [g, 1, 'start'], [-g, -height - 1, 'end'], [-g, 1, 'end']];
    for (const [dx, dy, anchor] of places) {
      const x0 = anchor === 'end' ? m.x + dx - w : m.x + dx;
      const b = { x0, x1: x0 + w, y0: m.y + dy, y1: m.y + dy + height, own: m };
      if (!free(b, m)) continue;
      const tx = anchor === 'end' ? m.x + dx : anchor === 'middle' ? m.x : m.x + dx;
      node(s, 'text', { x: tx, y: b.y1 - 1.5, 'text-anchor': anchor, class: 'label' }, m.it.label);
      boxes.push(b);
      break;
    }
  }
}

// A skyplot: the sky from the zenith (centre) to the horizon (rim), north up and east to the left as
// one sees it looking up (the GNSS convention puts east to the right; this one is the observer's).
// items: [{ az, el (degrees), label, kind, colour, size, shape }]; options: { eastRight }.
export function skyplot(el, items, { title = 'The sky', eastRight = true, legend = [] } = {}) {
  const S = 220, c = S / 2, r = S / 2 - 18;
  const s = svg(el, S, S + 6);
  node(s, 'text', { x: 4, y: 11, class: 'title' }, title);
  for (const e of [0, 30, 60]) node(s, 'circle', { cx: c, cy: c + 6, r: r * (1 - e / 90), class: e ? 'grid' : 'axis', fill: 'none' });
  for (let a = 0; a < 360; a += 30) {
    const t = (a * Math.PI) / 180, sx = eastRight ? 1 : -1;
    node(s, 'line', { x1: c, y1: c + 6, x2: c + sx * r * Math.sin(t), y2: c + 6 - r * Math.cos(t), class: 'grid' });
  }
  const sx = eastRight ? 1 : -1;
  for (const [t, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const rad = (a * Math.PI) / 180;
    node(s, 'text', { x: c + sx * (r + 10) * Math.sin(rad), y: c + 6 - (r + 10) * Math.cos(rad) + 4, 'text-anchor': 'middle', class: 'label' }, t);
  }
  const marks = [];
  for (const it of items) {
    if (!(it.el > -2)) continue;
    const rr = r * (1 - Math.max(0, it.el) / 90), rad = (it.az * Math.PI) / 180;
    const x = c + sx * rr * Math.sin(rad), y = c + 6 - rr * Math.cos(rad);
    const size = it.size || 4;
    if (it.shape === 'triangle') node(s, 'path', { d: `M${x},${y - size}L${x + size},${y + size * 0.8}L${x - size},${y + size * 0.8}Z`, fill: it.colour });
    else if (it.shape === 'ring') node(s, 'circle', { cx: x, cy: y, r: size, fill: 'none', stroke: it.colour, 'stroke-width': 2 });
    else node(s, 'circle', { cx: x, cy: y, r: size, fill: it.colour, stroke: 'var(--panel-solid)', 'stroke-width': 1.5 });
    const hit = node(s, 'circle', { cx: x, cy: y, r: size + 5, class: 'hit' });
    hover(hit, `<b>${esc(it.name || it.label || '')}</b><br>azimuth ${fmt(it.az, 2)}°, elevation ${fmt(it.el, 2)}°${it.note ? `<br>${esc(it.note)}` : ''}`);
    marks.push({ it, x, y, size });
  }
  placeLabels(s, marks, S);
  if (legend.length) {
    const g = node(s, 'g', {});
    legend.forEach((l, i) => {
      const y = S - 4 - i * 12;
      node(g, 'circle', { cx: 6, cy: y - 3, r: 3.5, fill: l.colour });
      node(g, 'text', { x: 13, y, class: 'label' }, l.label);
    });
  }
  return s;
}

// A gauge: a value on a scale with thresholds. spec: { what, value, text, min, max, log, colour, centre
// (a quantity with two signs fills from it), thresholds: [{ at, label }], scale: [labels] }.
export function gauge(spec) {
  const f = spec.log ? (v) => Math.log10(Math.max(v, 10 ** spec.min)) : (v) => v;
  const lo = spec.log ? spec.min : spec.min, hi = spec.log ? spec.max : spec.max;
  const frac = (v) => Math.max(0, Math.min(1, (f(v) - lo) / (hi - lo)));
  const ticks = (spec.thresholds || []).map((t) => `<span class="tick" style="left:${(frac(t.at) * 100).toFixed(1)}%" title="${esc(t.label)}"></span>`).join('');
  const ok = Number.isFinite(spec.value);
  // A quantity with two signs fills from its centre toward the value; others from the left.
  const fill = () => {
    const at = frac(spec.value), c = spec.centre !== undefined ? frac(spec.centre) : 0;
    const left = Math.min(at, c), width = Math.abs(at - c);
    return `<span class="fill" style="left:${(left * 100).toFixed(1)}%;width:${Math.max(0.6, width * 100).toFixed(1)}%;background:${spec.colour || 'var(--prov-observed)'}"></span>`;
  };
  return `<div class="gauge"><div class="head"><span class="what">${esc(spec.what)}</span><span>${spec.text ?? (ok ? fmt(spec.value, 2) : '—')}</span></div>
    <div class="bar">${ok ? fill() : ''}${ticks}</div>
    ${spec.scale ? `<div class="scale">${spec.scale.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : ''}</div>`;
}

// The scheduler's timeline: a lane per worker (and one for the I/O workers), each job a bar from its
// start to its end coloured by its sensor's criticality (the orchid ramp), its deadline a tick, a late
// job outlined in the critical colour. records: [{ sensor, worker, release, start, end, deadline, late,
// criticality }] in wall seconds; window: [from, to].
export function timeline(el, records, { lanes, from, to, title = 'Jobs on the workers' }) {
  const W = 344, laneH = 15, T = 16, B = 18, L = 38;
  const H = T + B + laneH * lanes.length;
  const s = svg(el, W, H);
  node(s, 'text', { x: 0, y: 11, class: 'title' }, title);
  const X = (t) => L + ((t - from) / (to - from)) * (W - L - 4);
  lanes.forEach((lane, i) => {
    const y = T + i * laneH;
    node(s, 'line', { x1: L, x2: W - 4, y1: y + laneH, y2: y + laneH, class: 'grid' });
    node(s, 'text', { x: L - 4, y: y + laneH - 4, 'text-anchor': 'end' }, lane.label);
  });
  for (const t of ticks(0, to - from, 5)) {
    node(s, 'line', { x1: X(from + t), x2: X(from + t), y1: T, y2: H - B, class: 'grid' });
    node(s, 'text', { x: X(from + t), y: H - 5, 'text-anchor': 'middle' }, `${fmt(t - (to - from), 1)} s`);
  }
  for (const r of records) {
    const lane = lanes.findIndex((l) => l.match(r));
    if (lane < 0 || !(r.end >= from) || !(r.start <= to)) continue;
    const y = T + lane * laneH + 2;
    const x0 = X(Math.max(from, r.start)), x1 = Math.max(x0 + 1.5, X(Math.min(to, r.end)));
    const bar = node(s, 'rect', { x: x0, y, width: x1 - x0, height: laneH - 5, fill: `var(--crit-${r.criticality ?? 1})`,
      stroke: r.late ? 'var(--status-critical)' : 'none', 'stroke-width': r.late ? 1.5 : 0 });
    if (Number.isFinite(r.deadline) && r.deadline <= to && r.deadline >= from) node(s, 'line', { x1: X(r.deadline), x2: X(r.deadline), y1: y - 1, y2: y + laneH - 4, stroke: 'var(--ink-3)' });
    hover(bar, `<b>${esc(r.sensor)}</b><br>ran ${fmt((r.end - r.start) * 1e3, 3)} ms, waited ${fmt(Math.max(0, r.start - (r.release ?? r.start)) * 1e3, 1)} ms<br>${r.late ? '<span class="status critical">late</span>' : `<span class="status good">by its deadline</span> (${fmt((r.deadline - r.end) * 1e3, 0)} ms to spare)`}`);
  }
  return s;
}

// The magnetic field at a place: true north up, the needle at the declination, the dip as a bar.
export function compassRose(el, { declination, inclination, zone }) {
  const S = 150, c = 75, r = 56;
  const s = svg(el, S, S);
  node(s, 'text', { x: 2, y: 11, class: 'title' }, 'The compass');
  node(s, 'circle', { cx: c, cy: c + 6, r, class: 'axis' });
  for (let a = 0; a < 360; a += 10) {
    const t = (a * Math.PI) / 180, l = a % 90 === 0 ? 8 : 4;
    node(s, 'line', { x1: c + (r - l) * Math.sin(t), y1: c + 6 - (r - l) * Math.cos(t), x2: c + r * Math.sin(t), y2: c + 6 - r * Math.cos(t), class: 'axis' });
  }
  node(s, 'text', { x: c, y: c + 6 - r - 4, 'text-anchor': 'middle', class: 'label' }, 'N');
  const d = (declination * Math.PI) / 180;
  const needle = node(s, 'g', {});
  node(needle, 'path', { d: `M${c},${c + 6} L${c + (r - 10) * Math.sin(d)},${c + 6 - (r - 10) * Math.cos(d)}`, stroke: zone === 'blackout' ? 'var(--status-critical)' : 'var(--prov-model)', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
  node(needle, 'circle', { cx: c, cy: c + 6, r: 3, fill: 'var(--ink-2)' });
  hover(needle, `declination ${fmt(declination, 2)}° ${declination >= 0 ? 'east' : 'west'} of true north; inclination ${fmt(inclination, 2)}°`);
  return s;
}
