// FRAMES: the catalogue of frames as one tree, a point carried between any two, and the loops between
// standards with their holonomy.
//
// The catalogue is a connection on a graph (formalism §2.6): each frame a vertex, each defining motion
// an edge carrying a rigid motion, each relation between two standards an edge more. A change of the
// frames' realisations is a gauge transformation, U_e ↦ g_tail U_e g_head⁻¹; it conjugates every loop's
// holonomy, so the holonomy's class (its angle and its slide, Chasles's screw) is what does not depend
// on the choices: the curvature of the connection, where two standards disagree.

import { engine } from '../api.js';
import { esc, fmt, ttText } from '../format.js';

export function framesPage(app) {
  let el, frames = [], loaded = false;
  let from = 'ITRS', to = 'ICRS';
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>The catalogue <span class="aside">click: from · shift-click: to</span></h3>
        <div class="tree" id="fr-tree">…</div>
        <h3>Carry a point</h3>
        <div class="row"><span>from</span><select id="fr-from"></select></div>
        <div class="row"><span>to</span><select id="fr-to"></select></div>
        <div class="row"><span>position (m)</span><input type="text" id="fr-position" value="6378137 0 0" style="flex:1" spellcheck="false"></div>
        <div class="row"><span>velocity (m/s)</span><input type="text" id="fr-velocity" value="0 0 0" style="flex:1" spellcheck="false"></div>
        <p><button type="button" class="key small" id="fr-convert">Carry at the world's instant</button></p>
        <div id="fr-converted"></div>
        <h3>Loops and their holonomy <span class="aside">the curvature of the catalogue</span></h3>
        <p class="note">Two routes between two frames close a loop. Once round it, the motion is the identity when the standards agree; otherwise its angle and slide measure by how much, and they are the same whatever realisation of each frame is chosen (a gauge transformation conjugates the holonomy).</p>
        <table><tbody id="fr-loops"></tbody></table>
        <p><button type="button" class="key small" id="fr-holonomy">Measure at the world's instant</button></p>`;
      el.addEventListener('click', (e) => {
        const f = e.target.closest('[data-frame]');
        if (f) { if (e.shiftKey) to = f.dataset.frame; else from = f.dataset.frame; fill(); return; }
        if (e.target.id === 'fr-convert') convert();
        if (e.target.id === 'fr-holonomy') holonomy();
      });
      el.addEventListener('change', (e) => {
        if (e.target.id === 'fr-from') { from = e.target.value; fill(); }
        if (e.target.id === 'fr-to') { to = e.target.value; fill(); }
      });
    },
    show() { if (!loaded) { load(); holonomy(); } },
  };

  function fill() {
    const opts = frames.map((f) => `<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('');
    el.querySelector('#fr-from').innerHTML = opts;
    el.querySelector('#fr-to').innerHTML = opts;
    el.querySelector('#fr-from').value = from;
    el.querySelector('#fr-to').value = to;
    const children = new Map();
    for (const f of frames) { if (!children.has(f.parent)) children.set(f.parent, []); children.get(f.parent).push(f); }
    const node = (f) => `<li><span class="frame ${f.name === from ? 'from' : ''} ${f.name === to ? 'to' : ''}" data-frame="${esc(f.name)}" title="${esc(f.about)}">${esc(f.name)}</span>${children.has(f.name) ? `<ul>${children.get(f.name).map(node).join('')}</ul>` : ''}</li>`;
    el.querySelector('#fr-tree').innerHTML = `<ul>${(children.get(null) || []).map(node).join('')}</ul>`;
  }
  async function load() {
    try {
      const a = await engine({ op: 'frames' });
      frames = a.frames;
      loaded = true;
      fill();
    } catch (error) {
      el.querySelector('#fr-tree').innerHTML = `<p class="error">${esc(error.message)}</p>`;
    }
  }
  const vector = (text) => {
    const v = text.trim().split(/[\s,;]+/).map(Number);
    if (v.length !== 3 || v.some((x) => !Number.isFinite(x))) throw new Error('a vector is three numbers');
    return v;
  };
  async function convert() {
    const out = el.querySelector('#fr-converted');
    try {
      const a = await engine({ op: 'transform', from, to, time: ttText(app.clock.now()), positions: [vector(el.querySelector('#fr-position').value)], velocities: [vector(el.querySelector('#fr-velocity').value)] });
      const p = a.positions[0], v = a.velocities[0], w = a.angular_velocity;
      out.innerHTML = `<p class="note">${a.path.map(esc).join(' → ')}</p><table><tbody>
        <tr><th>position</th><td class="num">${p.map((x) => fmt(x, 3)).join('<br>')} m</td></tr>
        <tr><th>velocity</th><td class="num">${v.map((x) => fmt(x, 6)).join('<br>')} m/s</td></tr>
        <tr><th>|r|</th><td class="num">${fmt(Math.hypot(...p), 3)} m</td></tr>
        <tr><th>ω of ${esc(from)} in ${esc(to)}</th><td class="num">${w.map((x) => fmt(x, 12)).join('<br>')} rad/s</td></tr></tbody></table>`;
    } catch (error) {
      out.innerHTML = `<p class="error">${esc(error.message)}</p>`;
    }
  }
  async function holonomy() {
    const body = el.querySelector('#fr-loops');
    try {
      const a = await engine({ op: 'holonomy', time: ttText(app.clock.now()) });
      body.innerHTML = a.loops.map((l) => `<tr><th title="${esc(l.about)}">${esc(l.name)}<small>${esc(l.from)} → ${esc(l.to)}</small></th><td class="num">${fmt(l.angle_mas, 4)} mas<br>${fmt(l.slide, 4)} m</td></tr>`).join('');
    } catch (error) {
      body.innerHTML = `<tr><td class="error">${esc(error.message)}</td></tr>`;
    }
  }
  return page;
}
