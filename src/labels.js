// Names on the globe: the places of the gazetteer (data/products/place_names.py) written beside
// their points, the larger first, as many as fit without overlapping.
//
// A place is a candidate when it is large enough for the view (a lunar feature whose diameter is a
// sizeable fraction of the camera's range; on the Earth, countries from afar and towns near),
// faces the camera (not hidden by the body's figure, globe.occluded) and falls inside the view.
// Candidates are taken in the gazetteer's order of importance, and each is kept unless its box
// meets one already kept.

import { globe } from '../../../visualization/js/index.js';

const { cartesian, occluded, apply } = globe;
const DEG = Math.PI / 180;

export class Labels {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.places = { earth: [], moon: [] };
    this.enabled = { earth: false, moon: true, bodies: true };
    this.hits = [];
  }

  setPlaces(body, product) {
    this.places[body] = product.places.map(([name, lon, lat, kind, detail, size]) => ({ name, lon, lat, kind, detail, size, xyz: null }));
  }

  resize(w, h, ratio) {
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(h * ratio);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ratio = ratio;
  }

  // view: { body, fig, rotation (body to world), rel (the body's centre relative to the camera,
  // world), camBody (the camera in the body's frame), range (m), project([x, y, z] world relative to
  // the camera) → [px, py] or null, heightAt(lon, lat) }.
  // extra: things named first, before the places: [{ name, screen: [x, y], satellite }] or a body's
  // name [{ name, screen, body }].
  draw(view, style, extra = []) {
    const { ctx } = this;
    const r = this.ratio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hits = [];
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.textBaseline = 'middle';
    const taken = [];
    // The bodies' names, upright, and the satellites', italic, beside their points (which the scene
    // draws), the chosen one first.
    for (const e of extra) {
      ctx.font = e.body ? `${style.size}px ${style.font}` : `italic ${style.size - 1}px ${style.font}`;
      const [x, y] = e.screen;
      const tw = ctx.measureText(e.name).width;
      const box = [x - 6, y - style.size / 2 - 3, x + 9 + tw + 4, y + style.size / 2 + 3];
      if (!e.chosen && taken.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      taken.push(box);
      ctx.lineWidth = 3;
      ctx.strokeStyle = style.halo;
      ctx.strokeText(e.name, x + 8, y);
      ctx.fillStyle = e.body ? style.body || style.ink : e.chosen ? style.chosen : style.satellite;
      ctx.fillText(e.name, x + 8, y);
      this.hits.push({ box, satellite: e.satellite, body: e.body });
    }
    if (!view || !this.enabled[view.body]) return;
    const list = this.places[view.body];
    if (!list.length) return;
    ctx.font = `${style.size}px ${style.font}`;
    const kmPerScreen = view.range / 1000;
    let kept = 0;
    for (const p of list) {
      if (kept >= 90) break;
      if (view.body === 'moon') {
        if (!(p.size >= kmPerScreen * 0.035)) continue;
      } else if (p.kind === 'Country') {
        if (view.range < 1.2e6 || view.range > 4e7) continue;
      } else if (view.range > 3e6 || (p.kind !== 'Admin-0 capital' && view.range > 1.2e6)) continue;
      if (!p.xyz) p.xyz = cartesian(view.fig, p.lon * DEG, p.lat * DEG, 0);
      if (occluded(view.fig, view.camBody, p.xyz, 1000)) continue;
      const w = apply(view.rotation, p.xyz);
      const s = view.project([w[0] + view.rel[0], w[1] + view.rel[1], w[2] + view.rel[2]]);
      if (!s) continue;
      const [x, y] = s;
      const text = p.name;
      const tw = ctx.measureText(text).width;
      const box = [x - 4, y - style.size / 2 - 3, x + 8 + tw + 4, y + style.size / 2 + 3];
      if (box[2] < 0 || box[0] > this.canvas.width / r || box[3] < 0 || box[1] > this.canvas.height / r) continue;
      if (taken.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      taken.push(box);
      kept++;
      ctx.fillStyle = style.dot;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = style.halo;
      ctx.strokeText(text, x + 7, y);
      ctx.fillStyle = style.ink;
      ctx.fillText(text, x + 7, y);
      this.hits.push({ box, place: p });
    }
  }

  // What is named under a point of the canvas (CSS pixels): { place }, { satellite } or { body }, or null.
  at(x, y) {
    return this.hits.find(({ box }) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) || null;
  }
}
