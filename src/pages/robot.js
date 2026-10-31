// ROBOT: bodies with joints, the robotics domain's rabbit hopping on the Moon (decision 0011; the
// infrastructure's ADR 0058) and its fish swimming in the Earth's ocean (decision 0012; ADR 0059). The fish is
// seen from above, its plane the horizontal one, with the wake its tail leaves in the water.
//
// The engine keeps the robot (session "rabbit"): its body, its controller at 500 Hz and its motion advanced
// by the method chosen (the variational integrator of the discrete action, semi-implicit Euler, or
// Runge–Kutta). The page asks it for the behaviour (stand, hop in place, hop forward, stop) and steps it by
// the wall's time at a rate, gathering the frames it returns (60 a second of the robot's time) and playing
// them a little behind the newest (robot.js, Playback).
//
// The page shows:
//   - the side view: the robot's plane, its links as their shapes, each motor's torque against its peak as
//     an arc about its joint, the ground's force at each foot as an arrow, the centre's path;
//   - the body's numbers, its motors and its feet, the energy's account and what the method costs;
//   - the robot in the world, at its site, at true scale, lit by the Sun, on the level strip the simulation
//     stands on (robot-world.js); a key flies the camera to watch it from its side, another follows it;
//   - its ground (decision 0012): what it was told (the world's presumption, model), what its feet read
//     (observed), what it believes from them (assimilated), and, revealed, the truth (synthetic), along its
//     line; the feet's readings are marked where they were taken, on the strip in the world too.
// A command the body cannot do is refused by the engine, and the page says why.

import { engine } from '../api.js';
import { hover, node, svg } from '../charts.js';
import { esc, fmt } from '../format.js';
import { globe } from '../../../../visualization/js/index.js';
import { DEG, HEADINGS, Playback, SITES, fixedToPlane, groundTicks, linkOutline, onLink, planeAxes, planeToFixed, sideView } from '../robot.js';
import { FishInWorld, RobotInWorld } from '../robot-world.js';

const SESSION = 'rabbit';
const STORE = 'cosmopoiesis-robot';
const METHODS = [['variational', 'Action (variational)'], ['semi_implicit', 'Semi-implicit Euler'], ['runge_kutta', 'Runge–Kutta 4']];
const RATES = [[0.25, '×¼'], [0.5, '×½'], [1, '×1']];
const TICK_MS = 200, STEP_MAX_S = 1.0, SPAN_M = 0.9, CHART_S = 12;
const ROBOTS = [['rabbit', 'The rabbit, on the Moon'], ['fish', 'The fish, in the ocean'], ['dog', 'The dog, on the Earth']];
// Sites on land of two of CRUST1.0's classes of ground: ice and sediment.
const DOG_SITES = [['greenland', 'The Greenland ice sheet', 'earth', 72.6, -38.5], ['paris', 'Paris, on sediment', 'earth', 48.86, 2.35]];
// Sites at sea (CRUST1.0 has thousands of metres of water at each), and the point chosen on the Earth.
const FISH_SITES = [['pacific', 'The equatorial Pacific', 'earth', 0.0, -150.0], ['atlantic', 'The North Atlantic', 'earth', 30.0, -30.0]];
const FISH_DEPTH_M = 1.0, FISH_SPAN_M = 1.4;
const METHOD_NOTES = {
  variational: 'the discrete action\'s stationary path, the midpoint rule; symplectic, of order 2; implicit, each step solved by Newton\'s method on jets',
  semi_implicit: 'Newton–Euler\'s equations, the velocity first; of order 1; one evaluation a step',
  runge_kutta: 'Newton–Euler\'s equations by the classical method; of order 4; four evaluations a step',
};

export function robotPage(app) {
  let el, canvas, model = null, models = {}, robot = null, world = null, running = false, timer = null, busy = false, raf = 0, lastWall = 0, lastTick = 0;
  let frame = null, axes = null, origin = null, site = null, lastGround = 0, lastFollow = 0, watching = false;
  const play = new Playback();
  const residuals = [];  // [t, J]: the energy's residual at each answer
  let readings = [];      // [t, x, parameter, value]: the feet's readings of the ground, as the engine sent them
  const state = Object.assign({ robot: 'rabbit', site: 'reiner', heading: 90, method: 'semi_implicit', speed: 0.3, height: 0.15, rate: 1, world: true, follow: false, reveal: false },
    (() => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } })());
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* no storage */ } };
  const seg = (name, list, current) => `<div class="seg" data-seg="${name}">${list.map(([v, t]) => `<button type="button" class="key small${String(v) === String(current) ? ' on' : ''}" data-v="${v}">${esc(t)}</button>`).join('')}</div>`;
  const css = (name, fallback = '#b892dd') => (el ? getComputedStyle(el).getPropertyValue(name).trim() : '') || fallback;
  const error = (text) => { const p = el?.querySelector('#rb-error'); if (p) { p.textContent = text || ''; p.hidden = !text; } };
  const refusal = (text) => {
    const p = el?.querySelector('#rb-refusal');
    if (!p) return;
    p.hidden = !text;
    p.innerHTML = text ? `<span class="lamp caution">REFUSED</span> <span>${esc(text)}</span>` : '';
  };

  const isFish = () => state.robot === 'fish';
  const isDog = () => state.robot === 'dog';
  // The site chosen: a named one of the robot's, or the point chosen (on the Moon or the Earth for the rabbit,
  // on the Earth for the fish, which the engine refuses away from the sea).
  function chosenSite() {
    const bodies = isFish() || isDog() ? ['earth'] : ['moon', 'earth'];
    if (state.site === 'point' && app.picked?.body && bodies.includes(app.picked.body) && app.picked.lat !== undefined)
      return { body: app.picked.body, lat: app.picked.lat / DEG, lon: app.picked.lon / DEG, name: 'the point chosen' };
    const list = isFish() ? FISH_SITES : isDog() ? DOG_SITES : SITES;
    const s = list.find((x) => x[0] === state.site) || list[0];
    return { body: s[2], lat: s[3], lon: s[4], name: s[1] };
  }
  // The page as the robot chosen has it: its sites, behaviours, sections and words.
  function applyRobot() {
    if (!el) return;
    // frames of the robot before are not drawn with this one's links
    const m = models[state.robot] || null;
    if (m !== model) { play.clear(); frame = null; }
    model = m;
    const fish = isFish();
    el.querySelector('#rb-title').innerHTML = fish ? 'The fish <span class="aside">a body with joints, swimming in the ocean</span>'
      : isDog() ? 'The dog <span class="aside">a body with four legs, trotting on the Earth</span>' : 'The rabbit <span class="aside">a body with joints, hopping on the Moon</span>';
    for (const b of el.querySelectorAll('[data-seg=site] [data-v]')) b.hidden = b.dataset.for !== 'both' && b.dataset.for !== state.robot;
    for (const x of el.querySelectorAll('[data-only]')) x.hidden = !x.dataset.only.split(' ').includes(state.robot);
    el.querySelector('#rb-start').textContent = fish ? 'Start: holding still' : 'Start: standing';
    el.querySelector('#rb-chart-title').innerHTML = fish ? `The speed of its head <span class="aside">the last ${CHART_S} s</span>` : `The height of its centre <span class="aside">the last ${CHART_S} s</span>`;
  }

  async function ask(request, quiet = null) {
    try {
      const a = await engine({ session: SESSION, reveal: !!state.reveal, ...request });
      if (a.error) throw new Error(a.error);
      error(null);
      return a;
    } catch (e) {
      if (!(quiet && quiet.test(e.message))) error(e.message);
      return null;
    }
  }

  function adopt(a, fresh = false) {
    if (!a) return;
    // a robot begun again drops the last frame drawn too: another robot's poses do not fit this one's links
    if (fresh || (robot && a.t_s < robot.t_s - 1e-9)) { play.clear(); residuals.length = 0; readings = []; frame = null; }
    // the engine's robot is the page's: a fish found there makes the page the fish's
    if (a.model && a.model !== state.robot) {
      state.robot = a.model;
      for (const x of el?.querySelectorAll('[data-seg=robot] [data-v]') || []) x.classList.toggle('on', x.dataset.v === state.robot);
      save();
      applyRobot();
    }
    robot = a;
    if (a.frames) play.add(a.frames);
    if (a.readings?.length) {
      readings = readings.concat(a.readings);
      world?.marks(readings);
    }
    // The engine's frames begin after what it dropped: a page that comes late starts from those it has.
    if (!play.frames.length && a.frames_total) play.next = Math.max(0, a.frames_total - 1);
    residuals.push([a.t_s, a.energy.residual_j]);
    while (residuals.length > 2 && residuals[0][0] < a.t_s - CHART_S) residuals.shift();
    if (!site || site.body !== a.body || site.lat !== a.site.lat_deg || site.lon !== a.site.lon_deg || site.azimuth !== a.site.azimuth_deg) place(a);
    page.render();
  }

  // The robot's plane in the world, at its site; the ground's height there from the terrain where it is loaded.
  function place(a) {
    site = { body: a.body, lat: a.site.lat_deg, lon: a.site.lon_deg, azimuth: a.site.azimuth_deg, depth: a.site.depth_m || 0, fish: a.model === 'fish' };
    axes = planeAxes(site.lon * DEG, site.lat * DEG, site.azimuth * DEG);
    origin = null;
    lastGround = 0;
    if (world) { world.setAxes(axes); }
    drawWorld();
  }
  // The height of the robot's plane: the rabbit's ground, or the fish's depth below the sea's surface, both as
  // the world draws them (the sea's surface stands on the geoid, 13 m above the ellipsoid in the equatorial
  // Pacific).
  function groundHeight() {
    const b = app.scene?.bodies[site.body];
    const h = b?.terrain ? b.tree.heightAt(site.lon * DEG, site.lat * DEG) : 0;
    return (Number.isFinite(h) ? h : 0) - (site.fish ? site.depth : 0);
  }
  function drawWorld() {
    if (!app.scene) return;
    if (!state.world || !robot || !model || !site) {
      if (world) { app.scene.setObject('robot', null, null, null); world = null; }
      return;
    }
    const fig = app.scene.bodies[site.body]?.fig;
    if (!fig) return;
    site.h = groundHeight();
    origin = globe.cartesian(fig, site.lon * DEG, site.lat * DEG, site.h);
    // the world's body is built for one robot's links: another robot (the dog after the rabbit) is built anew
    if (world && (world.fish !== site.fish || world.model !== model)) { app.scene.setObject('robot', null, null, null); world = null; }
    if (!world) {
      world = site.fish ? new FishInWorld(model, axes, site.depth) : new RobotInWorld(model, axes);
      world.fish = site.fish;
      app.scene.setObject('robot', site.body, origin, world.object);
      world.marks(readings);
    } else {
      world.setAxes(axes);
      app.scene.move('robot', origin);
    }
    lightWorld();
    if (frame) world.pose(frame);
    app.touch();
  }
  // The Sun's direction at the site, in the plane's axes.
  function lightWorld() {
    const B = app.bodiesNow?.[site.body], S = app.bodiesNow?.sun;
    if (!world || !B || !S) return;
    const d = [S.position[0] - B.position[0], S.position[1] - B.position[1], S.position[2] - B.position[2]];
    const R = B.rotation, f = [0, 1, 2].map((k) => R[0][k] * d[0] + R[1][k] * d[1] + R[2][k] * d[2]);
    const n = Math.hypot(...f);
    world.light(fixedToPlane(axes, f.map((x) => x / n)));
  }

  // The camera to the robot's side, at a metre and a half; the globe's controls let it come that near.
  function watch() {
    if (!site || !app.nav) return;
    const near = app.nav.controls;
    near.minRange = 0.4, near.clearance = 0.12;
    watching = true;
    const x = frame ? frame.com_m[0] : 0, y = site.fish && frame ? frame.com_m[1] : 0;
    const fig = app.scene.bodies[site.body].fig;
    const g = globe.geodetic(fig, ...planeToFixed(axes, origin || globe.cartesian(fig, site.lon * DEG, site.lat * DEG, 0), [x, y, 0]));
    // the rabbit from its right side; the fish from above and a little to its right, so that it swims across the
    // picture and its beat shows
    const view = site.fish ? { lon: g.lon, lat: g.lat, height: site.h || -site.depth, range: 1.6, tilt: 18 * DEG, heading: site.azimuth * DEG - Math.PI / 2 }
      : sideView(g.lon, g.lat, (site.h || 0) + 0.12, site.azimuth * DEG);
    app.nav.flyToBody(site.body, view, app.bodiesNow, 3);
  }
  function follow(now) {
    if (!state.follow || !frame || !origin || !watching || app.nav.focus !== site.body || app.nav.transfer || app.nav.controls.flight) return;
    if (now - lastFollow < 50) return;
    lastFollow = now;
    const fig = app.scene.bodies[site.body].fig;
    const g = globe.geodetic(fig, ...planeToFixed(axes, origin, [frame.com_m[0], site.fish ? frame.com_m[1] : 0, 0]));
    const v = app.nav.controls.view;
    v.lon = g.lon, v.lat = g.lat, v.height = (site.h || 0) + (site.fish ? 0 : 0.12);
    app.nav.controls.limit();
    app.touch();
  }
  // The ground's height is read again as finer tiles come (on the Earth's ice sheet the first guess was 45 m
  // low): the robot is moved, and a camera watching it is moved with it, never left beneath the ground.
  function keepAbove() {
    if (!watching || app.nav.focus !== site.body || app.nav.transfer || app.nav.controls.flight) return;
    const v = app.nav.controls.view, fig = app.scene.bodies[site.body].fig;
    // A camera taken elsewhere is no longer watching.
    const at = globe.cartesian(fig, v.lon, v.lat, 0), here = globe.cartesian(fig, site.lon * DEG, site.lat * DEG, 0);
    if (Math.hypot(at[0] - here[0], at[1] - here[1], at[2] - here[2]) > 200) { watching = false; return; }
    if (Math.abs(v.height - ((site.h || 0) + (site.fish ? 0 : 0.12))) < 1e-3) return;
    v.height = (site.h || 0) + (site.fish ? 0 : 0.12);
    app.nav.controls.limit();
    app.touch();
  }

  // One step of the robot's time: the wall's time since the last, at the rate.
  async function tick() {
    if (busy || !running) return;
    busy = true;
    const now = performance.now();
    const seconds = Math.min(STEP_MAX_S, state.rate * Math.max(TICK_MS, now - lastTick) / 1000);
    lastTick = now;
    const a = await ask({ op: 'robot.step', seconds, since_frame: play.since, since_reading: readings.length }, /no robot/);
    busy = false;
    if (!a) { setRunning(false); robot = null; page.render(); return; }
    adopt(a);
  }
  function setRunning(on) {
    running = on && !!robot;
    clearInterval(timer);
    if (running) { lastTick = performance.now(); timer = setInterval(tick, TICK_MS); }
    const key = el?.querySelector('#rb-run');
    if (key) { key.classList.toggle('on', running); key.textContent = running ? 'Hold' : 'Run'; }
    animate();
  }
  // The frames played by the wall's time at the rate, while the robot runs or its last frame is to be drawn.
  function animate() {
    if (raf) return;
    lastWall = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - lastWall) / 1000);
      lastWall = now;
      const f = play.advance(dt, state.rate);
      if (f) {
        frame = f;
        page.drawSide();
        if (world) {
          world.pose(f, world.fish ? play.frames.filter((x) => x.t_s > f.t_s - 2 && x.t_s <= f.t_s) : undefined);
          if (now - lastGround > 1000) {
            lastGround = now;
            lightWorld();
            const h = groundHeight();
            if (Math.abs(h - (site.h ?? 0)) > 1e-3) drawWorld();
            keepAbove();
          }
          app.touch();
        }
        follow(now);
      }
      const shown = app.isShown('ROBOT') || (world && state.world);
      raf = running || (shown && play.newest && play.t < play.newest.t_s) ? requestAnimationFrame(loop) : 0;
    };
    raf = requestAnimationFrame(loop);
  }

  async function refresh() {
    const a = await ask({ op: 'robot.state' }, /no robot/);
    if (a) {
      adopt(a, true);
      // The last second's frames, to draw it standing where it is.
      const b = await ask({ op: 'robot.step', seconds: 0, since_frame: Math.max(0, a.frames_total - 60), since_reading: 0 });
      if (b) adopt(b);
      animate();
    } else {
      robot = null;
      page.render();
    }
  }

  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3 id="rb-title">The rabbit <span class="aside">a body with joints, hopping on the Moon</span></h3>
        <div class="controls-grid">
          <span>Robot</span>${seg('robot', ROBOTS, state.robot)}
          <span>Site</span><div class="seg" data-seg="site">${[...SITES.map((x) => [x[0], x[1], 'rabbit']), ...FISH_SITES.map((x) => [x[0], x[1], 'fish']), ...DOG_SITES.map((x) => [x[0], x[1], 'dog']), ['point', 'The point chosen', 'both']]
            .map(([v, t, f]) => `<button type="button" class="key small${v === state.site ? ' on' : ''}" data-v="${v}" data-for="${f}">${esc(t)}</button>`).join('')}</div>
          <span>Heading</span>${seg('heading', HEADINGS, state.heading)}
          <span>Method</span>${seg('method', METHODS, state.method)}
        </div>
        <p class="note" id="rb-method-note"></p>
        <div class="keyrow"><button type="button" class="key small" id="rb-start">Start: standing</button><button type="button" class="key small" id="rb-run">Run</button>${seg('rate', RATES, state.rate)}</div>
        <div class="controls-grid">
          <span>Behaviour</span><div><div class="seg" id="rb-behaviours" data-only="rabbit"><button type="button" class="key small" data-b="stand">Stand</button><button type="button" class="key small" data-b="hop0">Hop in place</button><button type="button" class="key small" data-b="hop">Hop forward</button><button type="button" class="key small" data-b="stop">Stop</button></div>
            <div class="seg" id="rb-dog-behaviours" data-only="dog"><button type="button" class="key small" data-b="stand">Stand</button><button type="button" class="key small" data-b="trot0">Trot in place</button><button type="button" class="key small" data-b="trot">Trot forward</button><button type="button" class="key small" data-b="stop">Stop</button></div>
            <div class="seg" id="rb-fish-behaviours" data-only="fish"><button type="button" class="key small" data-b="hold">Hold</button><button type="button" class="key small" data-b="swim">Swim</button><button type="button" class="key small" data-b="left">Turn left</button><button type="button" class="key small" data-b="right">Turn right</button><button type="button" class="key small" data-b="stop">Stop</button></div></div>
          <span>Asked</span><div class="row" style="margin:0;gap:10px"><label class="note">speed <input type="number" id="rb-speed" min="-0.5" max="0.5" step="0.05" value="${state.speed}" style="width:5em"> m/s</label>
            <label class="note" data-only="rabbit">apex <input type="number" id="rb-height" min="0.02" max="0.4" step="0.01" value="${state.height}" style="width:5em"> m</label></div>
        </div>
        <p class="refusal" id="rb-refusal" hidden></p>
        <p class="error" id="rb-error" hidden></p>
        <div id="rb-figure">
          <div class="figure-line" id="rb-line">&nbsp;</div>
          <div class="robot-side"><canvas id="rb-side" aria-label="The rabbit's plane, seen from its right side: its links, its motors' torques, the ground's forces and its centre's path"></canvas></div>
          <div class="legend" id="rb-legend">
            <span><span class="swatch line" style="background:var(--rose)"></span> a motor's torque, the arc its share of the peak</span>
            <span data-only="rabbit dog"><span class="swatch line" style="background:var(--orchid)"></span> the ground's force at a foot</span>
            <span data-only="fish"><span class="swatch dot" style="background:var(--prov-observed)"></span> its wake: where its tail pushed the water</span>
            <span data-only="fish"><span class="swatch line" style="background:var(--prov-model)"></span> the current (revealed)</span>
            <span><span class="swatch line" style="background:var(--ink-3)"></span> the centre's path</span>
          </div>
        </div>
        <div class="keyrow"><button type="button" class="key small${state.world ? ' on' : ''}" id="rb-world">In the world</button><button type="button" class="key small" id="rb-watch">Watch it</button><button type="button" class="key small${state.follow ? ' on' : ''}" id="rb-follow">Follow</button></div>
        <h3>The body <span class="aside">what it does</span></h3>
        <table><tbody id="rb-body"></tbody></table>
        <h3>Its motors <span class="aside">torque against the driver's peak</span></h3>
        <div class="bars" id="rb-motors"></div>
        <div data-only="rabbit dog">
        <h3>Its feet <span class="aside">the ground's force, compliant (Hunt–Crossley) with Coulomb's friction</span></h3>
        <table><tbody id="rb-feet"></tbody></table>
        </div>
        <h3>Its <span data-only="rabbit dog">ground</span><span data-only="fish">water</span> <span class="aside">told, and (revealed) true</span></h3>
        <div class="keyrow"><button type="button" class="key small${state.reveal ? ' on' : ''}" id="rb-reveal">Reveal the truth</button></div>
        <table class="knowledge"><tbody id="rb-ground"></tbody></table>
        <div id="rb-ground-figure" data-only="rabbit"><div class="legend" id="rb-ground-legend"></div><div class="chart-box" id="rb-ground-chart"></div></div>
        <h3 id="rb-chart-title">The height of its centre <span class="aside">the last ${CHART_S} s</span></h3>
        <div id="rb-height-figure"><div class="chart-box" id="rb-height-chart"></div></div>
        <h3>The energy's account <span class="aside">what the method keeps</span></h3>
        <table class="knowledge"><tbody id="rb-energy"></tbody></table>
        <div id="rb-residual-figure"><div class="chart-box" id="rb-residual-chart"></div></div>
        <p class="note">The rabbit is the robotics domain's (legged/): six links in its plane, a torso of 1.30 kg with its battery at the ends, two-link legs and feet, its five joints driven by geared motors with a torque–speed line, armature and friction, an Achilles tendon at the ankle, the joints' limits as stiff springs; 1.69 kg in all. Its controller reads what a robot reads (encoders, an inertial unit, foot switches) at 500 Hz and holds its torques between: standing by the legs' inverse kinematics and stiff joints; hopping by Raibert's three parts on a virtual leg from the toe to the centre of mass. The ground is compliant, Hunt and Crossley's law with Coulomb's friction regularised. The energy's account E − E₀ − ∫ P dt, P the power of every force but gravity and the potential's (motors, gears, limits, ground), is the method's own error of energy. The ground is level at the terrain's height under the start; the head and ears are drawn, their mass in the torso's.</p>`;
      canvas = el.querySelector('#rb-side');
      const figure = el.querySelector('#rb-figure');
      const onClick = (e) => {
        const b = e.target.closest('[data-seg] [data-v]');
        if (b) {
          const name = b.parentElement.dataset.seg, v = b.dataset.v;
          state[name] = name === 'rate' || name === 'heading' ? Number(v) : v;
          for (const x of b.parentElement.querySelectorAll('[data-v]')) x.classList.toggle('on', x === b);
          if (name === 'robot') {
            // the first site of the robot chosen, unless the point chosen
            if (state.site !== 'point') state.site = (isFish() ? FISH_SITES : isDog() ? DOG_SITES : SITES)[0][0];
            for (const x of el.querySelectorAll('[data-seg=site] [data-v]')) x.classList.toggle('on', x.dataset.v === state.site);
            if (isFish() && state.speed > 0.25) state.speed = 0.15, el.querySelector('#rb-speed').value = 0.15;
            applyRobot();
          }
          save();
          if (name === 'method') page.methodNote();
          // The robot, the site, the heading and the method are the session's: a new robot starts with them.
          if (name === 'robot' || name === 'site' || name === 'heading' || name === 'method') page.start();
          return;
        }
        const be = e.target.closest('#rb-behaviours [data-b], #rb-fish-behaviours [data-b], #rb-dog-behaviours [data-b]');
        if (be) { page.command(be.dataset.b); return; }
        if (e.target.id === 'rb-start') page.start();
        if (e.target.id === 'rb-run') setRunning(!running);
        if (e.target.id === 'rb-world') { state.world = !state.world; e.target.classList.toggle('on', state.world); save(); drawWorld(); }
        if (e.target.id === 'rb-watch') { if (!state.world) { state.world = true; el.querySelector('#rb-world').classList.add('on'); save(); drawWorld(); } watch(); }
        if (e.target.id === 'rb-follow') { state.follow = !state.follow; e.target.classList.toggle('on', state.follow); save(); }
        if (e.target.id === 'rb-reveal') {
          state.reveal = !state.reveal;
          e.target.classList.toggle('on', state.reveal);
          save();
          if (robot && !running) ask({ op: 'robot.state' }).then((a) => { if (a) { robot = { ...robot, ...a }; page.render(); } });
        }
      };
      el.addEventListener('click', onClick);
      figure.addEventListener('click', (e) => { if (!el.contains(figure)) onClick(e); });
      for (const id of ['rb-speed', 'rb-height']) {
        el.querySelector(`#${id}`).addEventListener('change', (e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) state[id === 'rb-speed' ? 'speed' : 'height'] = v;
          save();
        });
      }
      app.separator.attach(figure, { id: 'robot-side', title: 'The rabbit, from its side', page: 'ROBOT', onChange: () => page.drawSide() });
      app.separator.attach(el.querySelector('#rb-ground-figure'), { id: 'robot-ground', title: 'Its ground along its line', page: 'ROBOT', onChange: () => page.ground(true) });
      app.separator.attach(el.querySelector('#rb-height-figure'), { id: 'robot-height', title: 'The height of its centre', page: 'ROBOT', onChange: () => page.charts(true) });
      new MutationObserver(() => { page.drawSide(); page.charts(true); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      page.methodNote();
      applyRobot();
    },
    async show() {
      app.console.widen('right', true);
      if (!model) await page.models();
      if (!robot) await refresh();
      else { page.render(); animate(); }
      setTimeout(() => page.drawSide(), 0);
    },
    async models() {
      const m = await ask({ op: 'robot.models' });
      for (const x of m?.models || []) models[x.model] = x;
      applyRobot();
    },
    hide() { app.console.widen('right', false); },
    methodNote() {
      const p = el?.querySelector('#rb-method-note');
      if (p) p.textContent = `${(METHODS.find((m) => m[0] === state.method) || METHODS[0])[1]}: ${METHOD_NOTES[state.method] || ''}.`;
    },
    async start() {
      setRunning(false);
      const s = chosenSite();
      if (!model) await page.models();
      const config = { model: state.robot, body: s.body, lat_deg: s.lat, lon_deg: s.lon, azimuth_deg: state.heading, method: state.method };
      if (isDog()) config.body = 'earth';
      if (isFish()) config.depth_m = FISH_DEPTH_M;
      const a = await ask({ op: 'robot.start', config });
      if (!a) return;
      refusal(null);
      adopt(a, true);
      setRunning(true);
    },
    async command(b) {
      if (!robot) { await page.start(); if (!robot) return; }
      const request = isDog()
        ? (b === 'trot0' ? { behaviour: 'trot', speed_m_s: 0 } : b === 'trot' ? { behaviour: 'trot', speed_m_s: state.speed } : { behaviour: b })
        : isFish()
        ? (b === 'swim' || b === 'left' || b === 'right' ? { behaviour: 'swim', speed_m_s: state.speed, turn: b === 'left' ? 1 : b === 'right' ? -1 : 0 } : { behaviour: b })
        : b === 'hop0' ? { behaviour: 'hop', speed_m_s: 0, height_m: state.height }
          : b === 'hop' ? { behaviour: 'hop', speed_m_s: state.speed, height_m: state.height } : { behaviour: b };
      const a = await ask({ op: 'robot.command', ...request });
      if (!a) return;
      refusal(a.refused || null);
      robot = { ...robot, ...a, frames: undefined };
      if (!running) setRunning(true);
      page.render();
    },
    render() {
      if (!el) return;
      const r = robot;
      if (r && r.model === 'fish') { page.renderFish(); return; }
      const keys = el.querySelectorAll(r?.model === 'dog' ? '#rb-dog-behaviours [data-b]' : '#rb-behaviours [data-b]');
      const on = !r ? '' : r.behaviour === 'hop' ? (Math.abs(r.speed_asked_m_s) > 1e-9 ? 'hop' : 'hop0') : r.behaviour === 'trot' ? (Math.abs(r.speed_asked_m_s) > 1e-9 ? 'trot' : 'trot0') : r.behaviour;
      for (const k of keys) k.classList.toggle('on', k.dataset.b === on);
      const line = el.querySelector('#rb-line');
      if (!r) {
        line.innerHTML = '&nbsp;';
        el.querySelector('#rb-body').innerHTML = '<tr><td class="note">No robot in the engine yet: choose a site and a method, and start it.</td></tr>';
        el.querySelector('#rb-motors').innerHTML = '';
        el.querySelector('#rb-feet').innerHTML = '';
        el.querySelector('#rb-energy').innerHTML = '';
        el.querySelector('#rb-ground').innerHTML = '';
        page.drawSide();
        return;
      }
      const lat = r.site.lat_deg, lon = r.site.lon_deg;
      line.textContent = `${r.body === 'moon' ? 'the Moon' : 'the Earth'} · ${fmt(Math.abs(lat), 3)}° ${lat >= 0 ? 'N' : 'S'} ${fmt(Math.abs(lon), 3)}° ${lon >= 0 ? 'E' : 'W'} · heading ${fmt(r.site.azimuth_deg, 0)}° · g ${fmt(r.gravity_m_s2, 4)} m/s² · ${(METHODS.find((m) => m[0] === r.method) || [0, r.method])[1]}`;
      const apexAsked = r.behaviour === 'hop' ? ` (asked ${fmt(r.height_asked_m, 2)} m)` : '';
      if (r.model === 'dog') el.querySelector('#rb-body').innerHTML = `
        <tr><th>Time</th><td class="num">${fmt(r.t_s, 2)} s</td><th>Doing</th><td class="num">${esc(r.phase)}</td></tr>
        <tr><th>Speed</th><td class="num">${fmt(r.velocity_m_s[0], 2)} m/s${r.behaviour === 'trot' ? ` (asked ${fmt(r.speed_asked_m_s, 2)})` : ''}</td><th>Pitch</th><td class="num">${fmt(r.pitch_rad / DEG, 1)}°</td></tr>
        <tr><th>Height</th><td class="num">${fmt(r.height_m, 3)} m</td><th>Distance</th><td class="num">${fmt(r.distance_m, 2)} m</td></tr>
        <tr><th>Ground</th><td class="num" colspan="3">${esc(r.ground?.class || '')}, by CRUST1.0</td></tr>`;
      else el.querySelector('#rb-body').innerHTML = `
        <tr><th>Time</th><td class="num">${fmt(r.t_s, 2)} s</td><th>Phase</th><td class="num">${esc(r.phase)}</td></tr>
        <tr><th>Hops</th><td class="num">${fmt(r.hops, 0)}</td><th>Last apex</th><td class="num">${r.apex_m > 0 ? `${fmt(r.apex_m, 3)} m${apexAsked}` : '—'}</td></tr>
        <tr><th>Speed</th><td class="num">${fmt(r.velocity_m_s[0], 2)} m/s${r.behaviour === 'hop' ? ` (asked ${fmt(r.speed_asked_m_s, 2)})` : ''}</td><th>Pitch</th><td class="num">${fmt(r.pitch_rad / DEG, 1)}°</td></tr>
        <tr><th>Distance</th><td class="num">${fmt(r.distance_m, 2)} m</td><th>Thrust</th><td class="num">${fmt(r.thrust_n, 2)} N</td></tr>`;
      el.querySelector('#rb-motors').innerHTML = r.joints.map((j) => {
        const share = Math.min(1, Math.abs(j.torque_n_m) / j.peak_n_m);
        return `<div class="bar-row"><span class="name">${esc(j.joint)}</span><span class="track"><span class="fill${share > 0.98 ? ' late' : ''}" style="width:${(100 * share).toFixed(1)}%;background:${share > 0.98 ? '' : 'var(--rose)'}"></span></span><span class="num">${fmt(j.torque_n_m, 2)} N m</span></div>`;
      }).join('');
      el.querySelector('#rb-feet').innerHTML = `<tr><th></th><th class="num">normal</th><th class="num">slip</th><th class="num">pressed in</th></tr>` + r.feet.filter((f) => r.model === 'dog' || f.touching || ['toe', 'heel', 'paw'].includes(f.name)).map((f) =>
        `<tr><th>${esc(f.name)}</th><td class="num">${f.touching ? `${fmt(f.normal_n, 2)} N` : '—'}</td><td class="num">${f.touching ? `${fmt(1000 * f.slip_m_s, 1)} mm/s` : '—'}</td><td class="num">${f.touching ? `${fmt(1000 * f.penetration_m, 2)} mm` : '—'}</td></tr>`).join('');
      const e = r.energy, c = r.checks;
      const weight = r.gravity_m_s2 * (model?.mass_kg || 1.69);
      el.querySelector('#rb-energy').innerHTML = [
        ['Energy', `${fmt(e.energy_j, 3)} J`, 'kinetic, and the potential of gravity, the tendon and the limits'],
        ['Motors\' work', `${fmt(e.motor_work_j, 2)} J`, 'Σ τ ω over the motion'],
        ['Electrical energy', `${fmt(e.electrical_j, 1)} J`, `drawn: τ ω and the copper loss (τ/k_τ)² R; at most ${fmt(e.peak_power_w, 1)} W`],
        ['Cost of transport', e.cost_of_transport > 0 && Math.abs(r.distance_m) > 0.5 ? fmt(e.cost_of_transport, 2) : '—', `the energy drawn since the start over its weight (${fmt(weight, 2)} N) times the distance, once it has gone half a metre`],
        ['Residual', `${fmt(e.residual_j, 4)} J`, 'E − E₀ − ∫ P dt: the method\'s own error'],
        ['Angular momentum in flight', c.flight_momentum_change > 0 ? fmt(c.flight_momentum_change, 2) : '—', 'its largest relative change in a flight, where only gravity acts'],
        ['Cost', `${fmt(c.cost_s_per_s, 3)} s/s`, `the machine's seconds per second of the robot's; step ${fmt(1000 * r.step_s, 2)} ms${c.fallbacks ? `, ${fmt(c.fallbacks, 0)} steps by semi-implicit Euler where Newton's method did not converge` : ''}`],
        ['Pressed in', `${fmt(1000 * c.max_penetration_m, 2)} mm`, 'the deepest a foot went into the compliant ground'],
      ].map(([a, b, n]) => `<tr><th>${a}</th><td class="num">${b}</td><td class="note">${n}</td></tr>`).join('');
      page.charts();
      page.ground();
      page.drawSide();
    },
    // The fish's readings: its body, its motors, its water, its energy.
    renderFish() {
      const r = robot;
      const on = r.behaviour === 'swim' ? (r.turn_asked > 0.5 ? 'left' : r.turn_asked < -0.5 ? 'right' : 'swim') : r.behaviour;
      for (const k of el.querySelectorAll('#rb-fish-behaviours [data-b]')) k.classList.toggle('on', k.dataset.b === on);
      const lat = r.site.lat_deg, lon = r.site.lon_deg;
      el.querySelector('#rb-line').textContent = `the Earth's ocean · ${fmt(Math.abs(lat), 3)}° ${lat >= 0 ? 'N' : 'S'} ${fmt(Math.abs(lon), 3)}° ${lon >= 0 ? 'E' : 'W'} · ${fmt(r.site.depth_m, 1)} m down${r.water.sea_depth_m ? ` over ${fmt(r.water.sea_depth_m, 0)} m of sea` : ''} · ${(METHODS.find((m) => m[0] === r.method) || [0, r.method])[1]}`;
      const azimuth = ((r.azimuth_now_deg % 360) + 360) % 360;
      el.querySelector('#rb-body').innerHTML = `
        <tr><th>Time</th><td class="num">${fmt(r.t_s, 2)} s</td><th>Doing</th><td class="num">${esc(r.behaviour)}</td></tr>
        <tr><th>Speed</th><td class="num">${fmt(r.forward_m_s, 3)} m/s${r.behaviour === 'swim' ? ` (asked ${fmt(r.speed_asked_m_s, 2)})` : ''}</td><th>Beat</th><td class="num">${r.frequency_hz > 0 ? `${fmt(r.frequency_hz, 2)} Hz${r.at_fastest_beat ? ', its fastest' : ''}` : '—'}</td></tr>
        <tr><th>Heading</th><td class="num">${fmt(azimuth, 1)}° from north</td><th>Swum</th><td class="num">${fmt(r.distance_m, 2)} m</td></tr>`;
      el.querySelector('#rb-motors').innerHTML = r.joints.map((j) => {
        const share = Math.min(1, Math.abs(j.torque_n_m) / j.peak_n_m);
        return `<div class="bar-row"><span class="name">${esc(j.joint)}</span><span class="track"><span class="fill${share > 0.98 ? ' late' : ''}" style="width:${(100 * share).toFixed(1)}%;background:${share > 0.98 ? '' : 'var(--rose)'}"></span></span><span class="num">${fmt(j.torque_n_m, 2)} N m</span></div>`;
      }).join('');
      const w = r.water, t = w.truth;
      el.querySelector('#rb-ground').innerHTML = [
        ['The water', '', esc(w.model)],
        ['Told: density', `${fmt(w.presumed.density_kg_m3, 0)} kg/m³`, 'presumed (the world\'s model of the upper ocean): 95 % within 1020–1030 kg/m³'],
        ['Told: current', 'none', `presumed: each horizontal component of mean 0 and ${fmt(w.presumed.current_sd_m_s, 2)} m/s, which its controller does not correct`],
        ...(t ? [['Truth: density', `${fmt(t.density_kg_m3, 2)} kg/m³`, 'the world\'s water where it swims, which it was not told'],
          ['Truth: current', `${fmt(t.current_east_north_m_s[0], 3)} E · ${fmt(t.current_east_north_m_s[1], 3)} N m/s`, 'it drifts with it']] : []),
      ].map(([a, v, n]) => `<tr><th>${a}</th><td class="num">${v}</td><td class="note">${n}</td></tr>`).join('');
      const e = r.energy, c = r.checks;
      el.querySelector('#rb-energy').innerHTML = [
        ['Energy', `${fmt(e.energy_j, 3)} J`, 'the kinetic energy of the body and of the water it moves (its added mass)'],
        ['Electrical energy', `${fmt(e.electrical_j, 1)} J`, `drawn by its servos: τ ω and the copper loss; at most ${fmt(e.peak_power_w, 1)} W`],
        ['Cost of transport', e.cost_of_transport > 0 && r.distance_m > 0.5 ? fmt(e.cost_of_transport, 2) : '—', 'the energy drawn over its weight times the distance swum'],
        ['Residual', `${fmt(e.residual_j, 4)} J`, 'E − E₀ − ∫ P dt, P the power of the water\'s drag, the servos and the gears: the method\'s own error'],
        ['Cost', `${fmt(c.cost_s_per_s, 3)} s/s`, `the machine's seconds per second of the fish's; step ${fmt(1000 * r.step_s, 2)} ms${c.fallbacks ? `, ${fmt(c.fallbacks, 0)} steps by semi-implicit Euler` : ''}`],
      ].map(([a, b, n]) => `<tr><th>${a}</th><td class="num">${b}</td><td class="note">${n}</td></tr>`).join('');
      page.charts();
      page.drawSide();
    },
    // The dog from its right side: its plane, the camera on its centre, its left legs behind and paler, each
    // motor's torque against its peak, the ground's force at each foot, the feet in stance marked.
    drawDog() {
      const box = canvas.parentElement.getBoundingClientRect();
      const out = app.separator.isOut('robot-side');
      const W = Math.max(240, Math.floor(out ? box.width - 2 : Math.min(box.width || 360, 560)));
      const H = Math.max(160, Math.floor(out ? box.height - 2 : W * 0.62));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${W}px`, canvas.style.height = `${H}px`;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) canvas.width = Math.round(W * dpr), canvas.height = Math.round(H * dpr);
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = css('--panel-solid', '#140b1d');
      g.fillRect(0, 0, W, H);
      const span = 1.1, k = W / span, gy = H - 0.14 * H, f = frame, cx = f ? f.com_m[0] : 0;
      const X = (x) => W / 2 + (x - cx) * k, Y = (z) => gy - z * k;
      const ink = css('--ink', '#f8eff9'), ink2 = css('--ink-2', '#ddcde5'), ink3 = css('--ink-3', '#a48fae'), rose = css('--rose', '#ee8fbd'), orchid = css('--orchid', '#b892dd');
      g.font = `10.5px ${css('--mono', 'monospace')}`;
      g.fillStyle = css('--field', 'rgba(8,4,13,0.5)');
      g.fillRect(0, gy, W, H - gy);
      g.strokeStyle = ink2; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(W, gy + 0.5); g.stroke();
      g.fillStyle = ink3; g.textAlign = 'center';
      for (const x of groundTicks(cx - span / 2 - 0.1, cx + span / 2 + 0.1, 0.1)) {
        const major = Math.abs(x / 0.5 - Math.round(x / 0.5)) < 1e-6;
        g.beginPath(); g.moveTo(X(x), gy); g.lineTo(X(x), gy + (major ? 9 : 5)); g.stroke();
        if (major) g.fillText(`${fmt(x, 1)} m`, X(x), gy + 21);
      }
      g.textAlign = 'left';
      if (!f || !model) return;
      const panel2 = css('--panel-2', 'rgba(34,19,48,0.72)');
      const capsule = (o, fill, edge, w) => {
        g.lineCap = 'round';
        g.strokeStyle = edge; g.lineWidth = w + 2;
        g.beginPath(); g.moveTo(X(o.a[0]), Y(o.a[1])); g.lineTo(X(o.b[0]), Y(o.b[1])); g.stroke();
        g.strokeStyle = fill; g.lineWidth = w; g.stroke();
      };
      const legs = model.links.map((l, i) => ({ l, i, o: linkOutline(l, f.poses[i]) })).filter((x) => x.i > 0);
      for (const { l, o } of legs) if (l.shape.left) capsule(o, panel2, ink3, Math.max(2, 2 * o.r * k));
      const torso = linkOutline(model.links[0], f.poses[0]);
      g.fillStyle = panel2; g.strokeStyle = ink2; g.lineWidth = 1.3;
      g.beginPath();
      torso.corners.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
      g.closePath(); g.fill(); g.stroke();
      // its head, forward of the torso: a rounded block with an eye
      const tp = f.poses[0], P = (p) => { const q = onLink(tp, p); return [X(q[0]), Y(q[1])]; };
      const [hx, hy] = P([0.24, 0.05]);
      g.beginPath(); g.arc(hx, hy, 0.055 * k, 0, 2 * Math.PI); g.fill(); g.stroke();
      const [ex, ey] = P([0.265, 0.07]);
      g.fillStyle = ink; g.beginPath(); g.arc(ex, ey, 2, 0, 2 * Math.PI); g.fill();
      for (const { l, o } of legs) if (!l.shape.left) capsule(o, panel2, ink2, Math.max(2, 2 * o.r * k));
      model.links.forEach((l, i) => {
        if (l.parent < 0 || l.shape.left) return;
        const [x, z] = f.poses[i], j = i - 1, tau = f.torque_n_m[j], share = Math.min(1, Math.abs(tau) / model.motors[j].peak_n_m);
        g.fillStyle = css('--panel-solid', '#140b1d'); g.strokeStyle = ink; g.lineWidth = 1.2;
        g.beginPath(); g.arc(X(x), Y(z), 3, 0, 2 * Math.PI); g.fill(); g.stroke();
        if (share > 0.01) {
          const a0 = -Math.PI / 2, sweep = share * 1.5 * Math.PI * Math.sign(tau);
          g.strokeStyle = share > 0.98 ? css('--status-warning', '#fab219') : rose; g.lineWidth = 2;
          g.beginPath(); g.arc(X(x), Y(z), 8, a0, a0 - sweep, sweep > 0); g.stroke();
        }
      });
      const weight = (robot?.gravity_m_s2 || 9.81) * model.mass_kg;
      model.feet.forEach((foot, l) => {
        const p = onLink(f.poses[foot.link], foot.point_m), n = f.normal_n[l];
        const left = model.links[foot.link].shape.left, x0 = X(p[0]), y0 = Y(Math.max(0, p[1]));
        g.fillStyle = f.stance?.[l] ? (left ? ink3 : ink) : 'transparent'; g.strokeStyle = left ? ink3 : ink2; g.lineWidth = 1;
        g.beginPath(); g.arc(x0, y0, 3, 0, 2 * Math.PI); g.fill(); g.stroke();
        if (n > 0.02 * weight) {
          const len = 0.25 * k * n / weight;
          g.strokeStyle = orchid; g.fillStyle = orchid; g.lineWidth = left ? 1.2 : 2;
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y0 - len); g.stroke();
          g.beginPath(); g.moveTo(x0, y0 - len - 6); g.lineTo(x0 - 4, y0 - len + 1); g.lineTo(x0 + 4, y0 - len + 1); g.closePath(); g.fill();
        }
      });
      g.fillStyle = ink2; g.font = `11.5px ${css('--mono', 'monospace')}`;
      g.fillText(`${fmt(f.t_s, 2)} s · ${f.phase} · ${robot?.ground?.class || ''}`, 8, 16);
      g.strokeStyle = ink2; g.lineWidth = 2;
      g.beginPath(); g.moveTo(W - 10 - 0.1 * k, 12); g.lineTo(W - 10, 12); g.stroke();
      g.textAlign = 'right'; g.fillText('10 cm', W - 10, 26); g.textAlign = 'left';
    },
    // The fish from above: its plane, the camera on its head, its wake, its path, the current (revealed).
    drawTop() {
      const box = canvas.parentElement.getBoundingClientRect();
      const out = app.separator.isOut('robot-side');
      const W = Math.max(240, Math.floor(out ? box.width - 2 : Math.min(box.width || 360, 560)));
      const H = Math.max(160, Math.floor(out ? box.height - 2 : W * 0.62));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${W}px`, canvas.style.height = `${H}px`;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) canvas.width = Math.round(W * dpr), canvas.height = Math.round(H * dpr);
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sea = css('--panel-solid', '#140b1d');
      g.fillStyle = sea;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(57, 135, 229, 0.08)';
      g.fillRect(0, 0, W, H);
      const f = frame, k = W / FISH_SPAN_M;
      const cx = f ? f.com_m[0] - 0.25 : 0, cy = f ? f.com_m[1] : 0;
      const X = (x) => W / 2 + (x - cx) * k, Y = (y) => H / 2 - (y - cy) * k;
      const ink = css('--ink', '#f8eff9'), ink2 = css('--ink-2', '#ddcde5'), ink3 = css('--ink-3', '#a48fae'), rose = css('--rose', '#ee8fbd');
      g.strokeStyle = css('--hair', 'rgba(238,170,215,0.11)');
      g.lineWidth = 1;
      for (let v = Math.ceil((cx - FISH_SPAN_M) / 0.1) * 0.1; v < cx + FISH_SPAN_M; v += 0.1) { g.beginPath(); g.moveTo(X(v), 0); g.lineTo(X(v), H); g.stroke(); }
      for (let v = Math.ceil((cy - FISH_SPAN_M) / 0.1) * 0.1; v < cy + FISH_SPAN_M; v += 0.1) { g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(W, Y(v)); g.stroke(); }
      if (!f || !model) {
        g.fillStyle = ink3;
        g.font = `13px ${css('--sans', 'sans-serif')}`;
        g.textAlign = 'center';
        g.fillText(robot ? 'Its frames are on their way' : 'Start the fish to see it', W / 2, H / 2);
        g.textAlign = 'left';
        return;
      }
      // its wake over the last two seconds, fading, each point where a strip of its tail pushed the water
      for (const fr of play.frames) {
        const age = f.t_s - fr.t_s;
        if (age < 0 || age > 2) continue;
        g.fillStyle = `rgba(213, 81, 129, ${(0.75 * (1 - age / 2)).toFixed(3)})`;
        for (const w of fr.wake || []) {
          const m = Math.hypot(w[2], w[3]);
          if (m < 0.02) continue;
          g.beginPath(); g.arc(X(w[0]), Y(w[1]), Math.min(4, 1 + 3 * m), 0, 2 * Math.PI); g.fill();
        }
      }
      // the head's path
      g.strokeStyle = ink3;
      g.setLineDash([2, 3]);
      g.beginPath();
      play.trail(f.t_s, 6).forEach(([x, y], i) => { if (i) g.lineTo(X(x), Y(y)); else g.moveTo(X(x), Y(y)); });
      g.stroke();
      g.setLineDash([]);
      // the body: an ellipse for each link, the fin a forked blade
      const panel2 = css('--panel-2', 'rgba(34,19,48,0.72)');
      model.links.forEach((l, i) => {
        const [ox, oy, th] = f.poses[i], p = l.part, c = Math.cos(th), s = Math.sin(th);
        const at = (u, v) => [X(ox + c * u - s * v), Y(oy + s * u + c * v)];
        g.fillStyle = i === model.links.length - 1 ? rose : panel2;
        g.strokeStyle = ink2;
        g.lineWidth = 1.2;
        g.beginPath();
        if (i === model.links.length - 1) {
          // seen from above the fin is edge-on: a narrow blade
          const pts = [at(0, 0.006), at(p.length_m, 0.012), at(p.length_m, -0.012), at(0, -0.006)];
          pts.forEach(([x, y], n) => (n ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.closePath();
        } else {
          const [mx, my] = at(p.from_m[0] + p.length_m / 2, 0);
          const a = (p.length_m / 2 + p.height_m * 0.12) * k, b = p.height_m * 0.28 * k;
          g.ellipse(mx, my, a, b, -th, 0, 2 * Math.PI);
        }
        g.fill(); g.stroke();
        if (l.parent >= 0) {
          const j = i - 1, tau = f.torque_n_m[j], share = Math.min(1, Math.abs(tau) / model.motors[j].peak_n_m);
          g.fillStyle = sea; g.strokeStyle = ink; g.lineWidth = 1.1;
          g.beginPath(); g.arc(X(ox), Y(oy), 3, 0, 2 * Math.PI); g.fill(); g.stroke();
          if (share > 0.01) {
            const sweep = share * 1.5 * Math.PI * Math.sign(tau), a0 = -Math.PI / 2;
            g.strokeStyle = share > 0.98 ? css('--status-warning', '#fab219') : rose;
            g.lineWidth = 2;
            g.beginPath(); g.arc(X(ox), Y(oy), 8, a0, a0 - sweep, sweep > 0); g.stroke();
          }
        }
      });
      const [hx, hy, hth] = f.poses[0];
      g.fillStyle = ink;
      for (const v of [0.03, -0.03]) { g.beginPath(); g.arc(X(hx + Math.cos(hth) * 0.09 - Math.sin(hth) * v), Y(hy + Math.sin(hth) * 0.09 + Math.cos(hth) * v), 2, 0, 2 * Math.PI); g.fill(); }
      // the current, revealed: an arrow in the corner, its length 0.5 m per m/s
      const cur = robot?.water?.truth?.current_plane_m_s;
      if (cur) {
        const x0 = W - 46, y0 = H - 40, L = 0.5 * k;
        g.strokeStyle = css('--prov-model', '#3987e5'); g.lineWidth = 2;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + cur[0] * L, y0 - cur[1] * L); g.stroke();
        g.fillStyle = ink3; g.font = `10.5px ${css('--mono', 'monospace')}`; g.textAlign = 'center';
        g.fillText('current', x0, y0 + 24); g.textAlign = 'left';
      }
      g.fillStyle = ink2;
      g.font = `11.5px ${css('--mono', 'monospace')}`;
      g.fillText(`${fmt(f.t_s, 2)} s · seen from above · forward ${fmt(((robot.azimuth_now_deg % 360) + 360) % 360, 0)}°`, 8, 16);
      g.strokeStyle = ink2; g.lineWidth = 2;
      g.beginPath(); g.moveTo(W - 10 - 0.1 * k, 12); g.lineTo(W - 10, 12); g.stroke();
      g.textAlign = 'right'; g.fillText('10 cm', W - 10, 26); g.textAlign = 'left';
    },
    // The ground: a table of what it was told, believes and (revealed) is, and its friction along the line.
    ground(force = false) {
      if (isFish()) return;
      const g = robot?.ground;
      const body = el?.querySelector('#rb-ground');
      if (!body || !g) return;
      const p = g.presumed, b = g.belief_here, t = g.truth_here;
      const range = (m, sd) => `${fmt(m * Math.exp(-1.96 * sd), 2)}–${fmt(m * Math.exp(1.96 * sd), 2)}`;
      const band = (n) => (n > 0 ? `1 when it was told the truth's law; 95 % of draws in ${fmt(Math.max(0, 1 - 1.96 * Math.sqrt(2 / n)), 2)}–${fmt(1 + 1.96 * Math.sqrt(2 / n), 2)}` : 'no readings yet');
      body.innerHTML = [
        ['The ground', '', esc(g.model)],
        ['Told: friction', `${fmt(p.friction, 2)}`, `presumed (the world's model of the place): 95 % within ${range(p.friction, p.friction_log_sd)}, varying over ${fmt(p.correlation_m, 1)} m`],
        ['Told: load at 1 mm', `${fmt(p.load_1mm_n, 1)} N`, `95 % within ${range(p.load_1mm_n, p.load_log_sd)} N`],
        ['Believes at its toe: friction', `${fmt(b.friction, 3)}`, `± ${fmt(100 * b.friction_log_sd, 1)} % (one deviation), from ${fmt(g.readings.friction, 0)} readings of sliding feet`],
        ['Believes at its toe: load', `${fmt(b.load_1mm_n, 2)} N`, `± ${fmt(100 * b.load_log_sd, 1)} %, from ${fmt(g.readings.load, 0)} readings of feet at their deepest`],
        ['Its readings fit what it was told', g.readings.friction ? fmt(g.whitened_mean_square.friction, 2) : '—', `the friction readings' whitened mean square: ${band(g.readings.friction)}`],
        ...(t ? [['Truth at its toe', `${fmt(t.friction, 3)} · ${fmt(t.load_1mm_n, 2)} N`, 'friction · load at 1 mm: the world\'s ground, which its feet press on and its belief does not see']] : []),
      ].map(([a, v, n]) => `<tr><th>${a}</th><td class="num">${v}</td><td class="note">${n}</td></tr>`).join('');
      const box = el.querySelector('#rb-ground-chart'), legend = el.querySelector('#rb-ground-legend');
      const pr = g.profile;
      if (!pr) return;
      const series = [
        { label: 'told (presumed)', colour: 'var(--prov-model)', dash: '5 4' },
        { label: 'believed, ± one deviation', colour: 'var(--prov-assimilated)' },
        { label: 'read by its feet', colour: 'var(--prov-observed)', dot: true },
        ...(pr.truth_friction ? [{ label: 'the truth', colour: 'var(--ink-2)', dash: '2 3' }] : []),
      ];
      legend.innerHTML = series.map((x) => `<span><span class="swatch ${x.dot ? 'dot' : 'line'}" style="background:${x.colour}"></span> ${esc(x.label)}</span>`).join('');
      const out = app.separator.isOut('robot-ground'), r = box.getBoundingClientRect();
      groundChart(box, pr, p, readings.filter((x) => x[2] === 0), robot.ground.belief_here.x_m, out && r.width > 100 && r.height > 100 ? { w: r.width, h: r.height } : null);
    },
    // The side view: the plane seen from the robot's right, the camera on its centre.
    drawSide() {
      if (!el || !canvas) return;
      if (robot?.model === 'fish' || (!robot && isFish())) { page.drawTop(); return; }
      if (robot?.model === 'dog') { page.drawDog(); return; }
      const box = canvas.parentElement.getBoundingClientRect();
      const out = app.separator.isOut('robot-side');
      const W = Math.max(240, Math.floor(out ? box.width - 2 : Math.min(box.width || 360, 560)));
      const H = Math.max(160, Math.floor(out ? box.height - 2 : W * 0.62));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${W}px`, canvas.style.height = `${H}px`;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) canvas.width = Math.round(W * dpr), canvas.height = Math.round(H * dpr);
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = css('--panel-solid', '#140b1d');
      g.fillRect(0, 0, W, H);
      const k = W / SPAN_M, gy = H - 0.16 * H;
      const f = frame;
      const cx = f ? f.com_m[0] : 0;
      const X = (x) => W / 2 + (x - cx) * k, Y = (z) => gy - z * k;
      const ink = css('--ink', '#f8eff9'), ink2 = css('--ink-2', '#ddcde5'), ink3 = css('--ink-3', '#a48fae'), rose = css('--rose', '#ee8fbd'), orchid = css('--orchid', '#b892dd');
      const hair = css('--hair-2', 'rgba(238,170,215,0.22)');
      g.font = `10.5px ${css('--mono', 'monospace')}`;
      // heights
      g.strokeStyle = hair;
      g.lineWidth = 1;
      g.fillStyle = ink3;
      for (let z = 0.1; Y(z) > 14; z += 0.1) {
        g.beginPath(); g.moveTo(0, Math.round(Y(z)) + 0.5); g.lineTo(W, Math.round(Y(z)) + 0.5); g.stroke();
        g.fillText(`${fmt(z, 1)} m`, 4, Y(z) - 3);
      }
      // the apex asked
      if (robot && robot.behaviour === 'hop') {
        const z = robot.standing_height_m + robot.height_asked_m;
        g.setLineDash([5, 4]);
        g.strokeStyle = rose;
        g.beginPath(); g.moveTo(0, Y(z)); g.lineTo(W, Y(z)); g.stroke();
        g.setLineDash([]);
        g.fillStyle = rose;
        g.fillText('the centre\'s apex asked', 52, Y(z) + 13);
      }
      // the ground: a line, hatched beneath, its distance ticked from the start
      g.fillStyle = css('--field', 'rgba(8,4,13,0.5)');
      g.fillRect(0, gy, W, H - gy);
      g.strokeStyle = hair;
      g.beginPath();
      for (let x = -((cx * k) % 9) - 9; x < W + 9; x += 9) { g.moveTo(x, gy + 1); g.lineTo(x - 7, gy + 8); }
      g.stroke();
      g.strokeStyle = ink2;
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(W, gy + 0.5); g.stroke();
      g.fillStyle = ink3;
      g.textAlign = 'center';
      for (const x of groundTicks(cx - SPAN_M / 2 - 0.1, cx + SPAN_M / 2 + 0.1, 0.1)) {
        const major = Math.abs(x / 0.5 - Math.round(x / 0.5)) < 1e-6;
        g.beginPath(); g.moveTo(X(x), gy); g.lineTo(X(x), gy + (major ? 9 : 5)); g.stroke();
        if (major) g.fillText(`${fmt(x, 1)} m`, X(x), gy + 21);
      }
      g.textAlign = 'left';
      if (!f || !model) {
        g.fillStyle = ink3;
        g.font = `13px ${css('--sans', 'sans-serif')}`;
        g.textAlign = 'center';
        g.fillText(robot ? 'Its frames are on their way' : 'Start the robot to see it', W / 2, H / 2 - 20);
        g.textAlign = 'left';
        return;
      }
      // the centre's path
      const trail = play.trail(f.t_s, 3);
      g.strokeStyle = ink3;
      g.setLineDash([2, 3]);
      g.lineWidth = 1;
      g.beginPath();
      trail.forEach(([x, z], i) => { if (i) g.lineTo(X(x), Y(z)); else g.moveTo(X(x), Y(z)); });
      g.stroke();
      g.setLineDash([]);
      // the links: the far side's pair first, a little up and behind; then the torso; then the near side
      const links = model.links.map((l, i) => ({ l, o: linkOutline(l, f.poses[i]), pose: f.poses[i] }));
      const capsule = (o, fill, edge, dx = 0, dy = 0) => {
        const w = Math.max(2, 2 * o.r * k);
        g.lineCap = 'round';
        g.strokeStyle = edge;
        g.lineWidth = w + 2;
        g.beginPath(); g.moveTo(X(o.a[0]) + dx, Y(o.a[1]) + dy); g.lineTo(X(o.b[0]) + dx, Y(o.b[1]) + dy); g.stroke();
        g.strokeStyle = fill;
        g.lineWidth = w;
        g.stroke();
      };
      const panel2 = css('--panel-2', 'rgba(34,19,48,0.72)');
      for (const { l, o } of links) if (o.kind === 'capsule' && l.shape.paired) capsule(o, panel2, ink3, 4, -3);
      const torso = links[0].o;
      g.fillStyle = panel2;
      g.strokeStyle = ink2;
      g.lineWidth = 1.3;
      // the box, its corners rounded as the world draws them
      const rr = 0.3 * model.links[0].shape.thickness_m * k;
      const cs = torso.corners.map(([x, z]) => [X(x), Y(z)]);
      g.beginPath();
      g.moveTo((cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2);
      for (let i = 1; i <= 4; i++) g.arcTo(cs[i % 4][0], cs[i % 4][1], cs[(i + 1) % 4][0], cs[(i + 1) % 4][1], rr);
      g.closePath(); g.fill(); g.stroke();
      // the head, its eye and ears (drawn; their mass in the torso's)
      const tp = f.poses[0], P = (p) => { const q = onLink(tp, p); return [X(q[0]), Y(q[1])]; };
      const ear = (base, tip, w) => {
        const [bx, by] = P(base), [tx, ty] = P(tip);
        g.lineCap = 'round';
        g.strokeStyle = ink2; g.lineWidth = w + 2;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.stroke();
        g.strokeStyle = panel2; g.lineWidth = w; g.stroke();
        g.strokeStyle = rose; g.lineWidth = Math.max(1, w * 0.35); g.stroke();
      };
      ear([0.14, 0.07], [0.07, 0.15], 0.022 * k);
      ear([0.155, 0.07], [0.10, 0.165], 0.022 * k);
      const [hx, hy] = P([0.165, 0.045]);
      g.fillStyle = panel2; g.strokeStyle = ink2; g.lineWidth = 1.3;
      g.beginPath(); g.arc(hx, hy, 0.038 * k, 0, 2 * Math.PI); g.fill(); g.stroke();
      const [ex, ey] = P([0.19, 0.055]);
      g.fillStyle = ink; g.beginPath(); g.arc(ex, ey, Math.max(1.5, 0.008 * k), 0, 2 * Math.PI); g.fill();
      for (const { o } of links) if (o.kind === 'capsule') capsule(o, panel2, ink2);
      // the joints and their motors' torques: an arc about each, its sweep the torque's share of the peak
      model.links.forEach((l, i) => {
        if (l.parent < 0) return;
        const [x, z] = f.poses[i], j = i - 1;
        const tau = f.torque_n_m[j], peak = model.motors[j].peak_n_m, share = Math.min(1, Math.abs(tau) / peak);
        g.fillStyle = css('--panel-solid', '#140b1d');
        g.strokeStyle = ink;
        g.lineWidth = 1.2;
        g.beginPath(); g.arc(X(x), Y(z), Math.max(2.5, 0.012 * k), 0, 2 * Math.PI); g.fill(); g.stroke();
        if (share > 0.01) {
          const a0 = -Math.PI / 2, sweep = share * 1.5 * Math.PI * Math.sign(tau);
          g.strokeStyle = share > 0.98 ? css('--status-warning', '#fab219') : rose;
          g.lineWidth = 2.2;
          g.beginPath();
          // a positive torque turns the link toward z (counter-clockwise on the screen, where y is down)
          g.arc(X(x), Y(z), Math.max(6, 0.03 * k), a0, a0 - sweep, sweep > 0);
          g.stroke();
        }
      });
      // the ground's force at the toe, the heel and the paw: up from the foot, its weight's length 0.12 m
      const weight = (robot?.gravity_m_s2 || 1.62) * model.mass_kg;
      ['toe', 'heel', 'paw'].forEach((name, i) => {
        const n = f.normal_n[i];
        if (!(n > 0.02 * weight)) return;
        const foot = model.feet.find((x) => x.name === name);
        const p = onLink(f.poses[foot.link], foot.point_m);
        const len = 0.12 * k * n / weight;
        const x0 = X(p[0]), y0 = Y(Math.max(0, p[1]));
        g.strokeStyle = orchid; g.fillStyle = orchid; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y0 - len); g.stroke();
        g.beginPath(); g.moveTo(x0, y0 - len - 6); g.lineTo(x0 - 4, y0 - len + 1); g.lineTo(x0 + 4, y0 - len + 1); g.closePath(); g.fill();
      });
      // the centre of mass: a circle quartered
      const [mx, mz] = [X(f.com_m[0]), Y(f.com_m[1])];
      g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 1;
      g.beginPath(); g.arc(mx, mz, 5, 0, 2 * Math.PI); g.stroke();
      g.beginPath(); g.moveTo(mx, mz); g.arc(mx, mz, 5, -Math.PI / 2, 0); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(mx, mz); g.arc(mx, mz, 5, Math.PI / 2, Math.PI); g.closePath(); g.fill();
      // what it is doing, and a scale
      g.fillStyle = ink2;
      g.font = `11.5px ${css('--mono', 'monospace')}`;
      g.fillText(`${fmt(f.t_s, 2)} s · ${f.phase}`, 8, 16);
      g.strokeStyle = ink2; g.lineWidth = 2;
      g.beginPath(); g.moveTo(W - 10 - 0.1 * k, 12); g.lineTo(W - 10, 12); g.stroke();
      g.textAlign = 'right';
      g.fillText('10 cm', W - 10, 26);
      g.textAlign = 'left';
    },
    // The centre's height and the energy's residual against the robot's time: one axis each.
    charts() {
      if (!el) return;
      const fs = play.frames;
      const box = el.querySelector('#rb-height-chart');
      if (fs.length > 2 && robot?.model === 'fish') {
        const out = app.separator.isOut('robot-height'), r = box.getBoundingClientRect();
        const t = [], v = [];
        for (let i = 1; i < fs.length; i++) {
          const dt = fs[i].t_s - fs[i - 1].t_s;
          if (dt > 0) t.push(fs[i].t_s), v.push(Math.hypot(fs[i].com_m[0] - fs[i - 1].com_m[0], fs[i].com_m[1] - fs[i - 1].com_m[1]) / dt);
        }
        timeChart(box, { t, values: v, unit: 'm/s', title: 'The speed of its head', colour: 'var(--orchid)', mark: robot.behaviour === 'swim' ? robot.speed_asked_m_s : null, markLabel: 'asked',
          size: out && r.width > 100 && r.height > 100 ? { w: r.width, h: r.height } : null });
      } else if (fs.length > 2) {
        const out = app.separator.isOut('robot-height'), r = box.getBoundingClientRect();
        const asked = robot?.behaviour === 'hop' ? robot.standing_height_m + robot.height_asked_m : null;
        timeChart(box, { t: fs.map((x) => x.t_s), values: fs.map((x) => x.com_m[1]), unit: 'm', title: 'The centre\'s height', colour: 'var(--orchid)', mark: asked, markLabel: 'apex asked',
          size: out && r.width > 100 && r.height > 100 ? { w: r.width, h: r.height } : null });
      } else box.innerHTML = '<p class="note">The height appears here as the robot moves.</p>';
      const rb = el.querySelector('#rb-residual-chart');
      if (residuals.length > 2) timeChart(rb, { t: residuals.map((x) => x[0]), values: residuals.map((x) => x[1]), unit: 'J', title: 'The residual E − E₀ − ∫ P dt', colour: 'var(--rose)', points: true });
      else rb.innerHTML = '';
    },
  };
  return page;
}

// A quantity against the robot's time, on one axis: a line (or points), an optional level marked dashed, and a
// crosshair with its value on hover.
function timeChart(el, { t, values, unit, title, colour, mark = null, markLabel = '', points = false, size = null }) {
  const W = size ? Math.round(size.w) : 380, H = size ? Math.round(size.h) - 4 : 150, L = 46, R = 10, T = 22, B = 24;
  const s = svg(el, W, H);
  const all = values.filter(Number.isFinite).concat(mark === null ? [] : [mark]);
  let y0 = Math.min(...all), y1 = Math.max(...all);
  if (y1 - y0 < 1e-9) { y0 -= 1e-3; y1 += 1e-3; }
  const pad = (y1 - y0) * 0.1;
  y0 -= pad, y1 += pad;
  const x0 = t[0], x1 = t[t.length - 1] > x0 ? t[t.length - 1] : x0 + 1;
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R), Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  node(s, 'text', { x: L, y: 13, class: 'title' }, `${title}, ${unit}`);
  const step = niceStep((y1 - y0) / 4), digits = Math.max(0, -Math.floor(Math.log10(step)));
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
    node(s, 'line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'grid' });
    node(s, 'text', { x: L - 6, y: Y(v) + 3.5, 'text-anchor': 'end' }, fmt(Math.abs(v) < step / 2 ? 0 : v, digits));
  }
  const ts = niceStep((x1 - x0) / 5);
  for (let v = Math.ceil(x0 / ts) * ts; v <= x1; v += ts) if (X(v) < W - R - 24) node(s, 'text', { x: X(v), y: H - 8, 'text-anchor': 'middle' }, fmt(v, ts < 1 ? 1 : 0));
  node(s, 'text', { x: W - R, y: H - 8, 'text-anchor': 'end' }, 's');
  node(s, 'line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'axis' });
  if (mark !== null) {
    node(s, 'line', { x1: L, x2: W - R, y1: Y(mark), y2: Y(mark), stroke: 'var(--rose)', 'stroke-dasharray': '5 4', 'stroke-width': 1.2 });
    node(s, 'text', { x: W - R, y: Y(mark) - 4, 'text-anchor': 'end', fill: 'var(--rose)' }, markLabel);
  }
  if (points) {
    const g = node(s, 'g', { fill: colour });
    values.forEach((v, i) => node(g, 'circle', { cx: X(t[i]).toFixed(1), cy: Y(v).toFixed(1), r: 1.8 }));
  } else {
    node(s, 'path', { d: values.map((v, i) => `${i ? 'L' : 'M'}${X(t[i]).toFixed(1)},${Y(v).toFixed(1)}`).join(''), class: 'line', stroke: colour, 'stroke-width': 1.6 });
  }
  const cross = node(s, 'line', { x1: 0, x2: 0, y1: T, y2: H - B, class: 'mark-line', visibility: 'hidden' });
  const hit = node(s, 'rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'hit' });
  hover(hit, (e) => {
    const r = s.getBoundingClientRect();
    const vx = x0 + (((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * (x1 - x0);
    let k = 0;
    for (let i = 1; i < t.length; i++) if (Math.abs(t[i] - vx) < Math.abs(t[k] - vx)) k = i;
    cross.setAttribute('x1', X(t[k])); cross.setAttribute('x2', X(t[k])); cross.setAttribute('visibility', 'visible');
    return `<div>${fmt(t[k], 2)} s</div><div><span style="color:${colour}">●</span> ${esc(title)} <b>${fmt(values[k], 4)} ${esc(unit)}</b></div>`;
  });
  hit.addEventListener('pointerleave', () => cross.setAttribute('visibility', 'hidden'));
}
// The friction along the robot's line: the presumption (a level, dashed), the belief's median with a band of
// one deviation, the feet's readings as points, the truth (revealed) dotted, and where its toe is now.
function groundChart(el, pr, told, reads, here, size) {
  const W = size ? Math.round(size.w) : 380, H = size ? Math.round(size.h) - 4 : 170, L = 40, R = 10, T = 20, B = 24;
  const s = svg(el, W, H);
  const xs = pr.x_m, lo = pr.friction.map((m, i) => m * Math.exp(-pr.friction_log_sd[i])), hi = pr.friction.map((m, i) => m * Math.exp(pr.friction_log_sd[i]));
  const all = [...lo, ...hi, told.friction, ...reads.map((x) => x[3]), ...(pr.truth_friction || [])].filter(Number.isFinite);
  let y0 = Math.min(...all), y1 = Math.max(...all);
  const pad = (y1 - y0) * 0.1 || 0.05;
  y0 = Math.max(0, y0 - pad), y1 += pad;
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R), Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  node(s, 'text', { x: L, y: 13, class: 'title' }, 'Friction along its line');
  const step = niceStep((y1 - y0) / 4);
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
    node(s, 'line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'grid' });
    node(s, 'text', { x: L - 6, y: Y(v) + 3.5, 'text-anchor': 'end' }, fmt(v, 2));
  }
  const ts = niceStep((x1 - x0) / 5);
  for (let v = Math.ceil(x0 / ts) * ts; v <= x1; v += ts) if (X(v) < W - R - 24) node(s, 'text', { x: X(v), y: H - 8, 'text-anchor': 'middle' }, fmt(v, ts < 1 ? 1 : 0));
  node(s, 'text', { x: W - R, y: H - 8, 'text-anchor': 'end' }, 'm');
  node(s, 'line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'axis' });
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  node(s, 'path', { d: `${path(hi)}${lo.map((v, i) => `L${X(xs[lo.length - 1 - i]).toFixed(1)},${Y(lo[lo.length - 1 - i]).toFixed(1)}`).join('')}Z`, fill: 'var(--prov-assimilated)', 'fill-opacity': 0.18, stroke: 'none' });
  node(s, 'line', { x1: L, x2: W - R, y1: Y(told.friction), y2: Y(told.friction), stroke: 'var(--prov-model)', 'stroke-width': 1.4, 'stroke-dasharray': '5 4' });
  node(s, 'path', { d: path(pr.friction), class: 'line', stroke: 'var(--prov-assimilated)', 'stroke-width': 1.8 });
  if (pr.truth_friction) node(s, 'path', { d: path(pr.truth_friction), class: 'line', stroke: 'var(--ink-2)', 'stroke-width': 1.3, 'stroke-dasharray': '2 3' });
  const g = node(s, 'g', { fill: 'var(--prov-observed)' });
  for (const r of reads) if (r[1] >= x0 && r[1] <= x1) node(g, 'circle', { cx: X(r[1]).toFixed(1), cy: Y(r[3]).toFixed(1), r: 2.4 });
  if (here >= x0 && here <= x1) node(s, 'line', { x1: X(here), x2: X(here), y1: T, y2: H - B, stroke: 'var(--rose)', 'stroke-width': 1, 'stroke-dasharray': '1 3' });
}

function niceStep(x) {
  const mag = 10 ** Math.floor(Math.log10(x)), r = x / mag;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag;
}
