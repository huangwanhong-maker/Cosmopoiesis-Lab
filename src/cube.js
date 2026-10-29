// The cube about a point: an instrument's readings over a cubical neighbourhood of an event, drawn in
// three dimensions with its inside filled with colour (decision 0006; the engine's probe_volume).
//
// A field drawn is restriction ∘ reduction ∘ mark (formalism §3.6). Here the restriction is to the
// cube, whose axes are the local east, north and up at its centre; the reduction is one quantity of
// the instrument's readings, or the field's vector; the mark is a colour in each cell. The cells are
// drawn as small boxes with gaps between them, so that the inside shows through the outside, or as
// three slices through the cube, or as its shell, or as the surface of one level of the quantity
// (visualization's surface nets). Arrows draw the vector where the instrument reads one. A cell with
// no reading (outside the instrument's coverage) is left empty, never coloured.
//
// The arithmetic (where the cells lie, their colours, the gradient, the arrows, the ground, the level
// surface) is volume.js's; this module draws it with three.js, in the unit cube with x east, y up and
// z south.

import * as THREE from 'three';
import { fieldMarks } from '../../../visualization/js/index.js';
import { cellPosition } from './volume.js';

const marks = fieldMarks(THREE);

// The cells as one instanced mesh in the unit cube: each a box of `fill` of a cell's size, coloured (the
// shared renderer's cells, shaded by the direction of their faces).
export function cellsMesh(n, cells, colours, { fill = 0.55, opacity = 1 } = {}) {
  const mesh = marks.cells(cells.map((idx) => cellPosition(n, idx)), colours, { size: fill / n, opacity });
  mesh.userData.cells = cells;
  return mesh;
}

const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

// The display: its own renderer, camera and controls, inside a .cube-view element.
export class CubeView {
  constructor(root, { onHover = () => {} } = {}) {
    this.root = root;
    this.onHover = onHover;
    root.innerHTML = '<canvas></canvas><div class="readout"></div><div class="scale-bar"></div>';
    this.canvas = root.querySelector('canvas');
    this.readout = root.querySelector('.readout');
    this.scaleBar = root.querySelector('.scale-bar');
    this.labels = {};
    for (const k of ['E', 'N', 'U', 'W', 'S', 'D']) {
      const d = document.createElement('div');
      d.className = 'axis-label';
      d.textContent = k;
      if ('WSD'.includes(k)) d.style.opacity = '0.45';
      root.appendChild(d);
      this.labels[k] = d;
    }
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.6, 1.2, 0.8);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    this.view = { yaw: Math.PI / 4, pitch: 0.48, distance: 3.3 };
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.parts = {};
    this.raycaster = new THREE.Raycaster();
    this.bind();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();
  }

  bind() {
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ...this.view }; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (drag) {
        this.view.yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
        this.view.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * 0.008));
        this.render();
      } else this.hover(e);
    });
    this.canvas.addEventListener('pointerup', (e) => { drag = null; this.canvas.releasePointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointerleave', () => { this.onHover(null); });
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.view.distance = Math.max(1.4, Math.min(8, this.view.distance * Math.exp(e.deltaY * 0.001))); this.render(); }, { passive: false });
    this.canvas.addEventListener('dblclick', () => { this.view = { yaw: Math.PI / 4, pitch: 0.48, distance: 3.3 }; this.render(); });
  }

  resize() {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  clear() {
    for (const o of Object.values(this.parts)) {
      this.group.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
    this.parts = {};
  }

  // spec: { n, edge, values, cells, colours, fill, opacity, arrows: positions | null, level: mesh | null,
  // ground: positions | null, centre: bool, edgeText }
  show(spec) {
    this.clear();
    this.spec = spec;
    const ink = new THREE.Color(css('--ink-2', '#dccbe0')), orchid = new THREE.Color(css('--orchid', '#b892dd')), rose = new THREE.Color(css('--point', '#ee8fbd'));
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: orchid, transparent: true, opacity: 0.85 }));
    this.parts.outline = outline;
    // The axes through the centre, to just beyond the faces.
    const axes = new THREE.BufferGeometry();
    axes.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.62, 0, 0, 0, 0, 0, 0, 0.62, 0, 0, 0, 0, 0, 0, -0.62]), 3));
    this.parts.axes = new THREE.LineSegments(axes, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.55 }));
    if (spec.cells?.length) this.parts.cells = cellsMesh(spec.n, spec.cells, spec.colours, { fill: spec.fill, opacity: spec.opacity });
    if (spec.level?.positions?.length) this.parts.level = marks.surface(spec.level, spec.level.colour || [0.85, 0.55, 0.65], { opacity: 0.88 });
    if (spec.arrows?.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(spec.arrows, 3));
      this.parts.arrows = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(css('--ink', '#f6ecf5')), transparent: true, opacity: 0.9 }));
    }
    if (spec.ground?.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(spec.ground, 3));
      this.parts.ground = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(css('--prov-assimilated', '#c98500')), transparent: true, opacity: 0.6 }));
    }
    if (spec.centre) {
      const g = new THREE.BufferGeometry();
      const r = 0.06;
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-r, 0, 0, r, 0, 0, 0, -r, 0, 0, r, 0, 0, 0, -r, 0, 0, r]), 3));
      this.parts.centre = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: rose, depthTest: false }));
      this.parts.centre.renderOrder = 5;
    }
    for (const o of Object.values(this.parts)) this.group.add(o);
    this.scaleBar.textContent = spec.edgeText || '';
    this.render();
  }

  // The camera on its sphere about the centre; the axis labels where the axes end; the cells sorted
  // back to front when they are translucent.
  render() {
    const { yaw, pitch, distance } = this.view;
    this.camera.position.set(distance * Math.cos(pitch) * Math.sin(yaw), distance * Math.sin(pitch), distance * Math.cos(pitch) * Math.cos(yaw));
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    const cells = this.parts.cells;
    if (cells && cells.material.transparent) this.sortCells(cells);
    this.renderer.render(this.scene, this.camera);
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const place = (label, p) => {
      const v = new THREE.Vector3(...p).project(this.camera);
      label.style.left = `${((v.x + 1) / 2) * w}px`;
      label.style.top = `${((1 - v.y) / 2) * h}px`;
      label.hidden = v.z > 1;
    };
    place(this.labels.E, [0.7, 0, 0]); place(this.labels.W, [-0.62, 0, 0]);
    place(this.labels.U, [0, 0.7, 0]); place(this.labels.D, [0, -0.62, 0]);
    place(this.labels.N, [0, 0, -0.7]); place(this.labels.S, [0, 0, 0.62]);
  }

  sortCells(mesh) {
    const cells = mesh.userData.cells;
    const cam = this.camera.position;
    const order = cells.map((idx, q) => {
      const [x, y, z] = cellPosition(this.spec.n, idx);
      return [q, (x - cam.x) ** 2 + (y - cam.y) ** 2 + (z - cam.z) ** 2];
    }).sort((a, b) => b[1] - a[1]);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    const s = this.spec.fill / this.spec.n;
    order.forEach(([q], r) => {
      const [x, y, z] = cellPosition(this.spec.n, cells[q]);
      m.makeScale(s, s, s).setPosition(x, y, z);
      mesh.setMatrixAt(r, m);
      const rgb = this.spec.colours[q];
      mesh.setColorAt(r, c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace));
    });
    mesh.userData.drawn = order.map(([q]) => cells[q]);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // The cell under the pointer, or null.
  hover(e) {
    const cells = this.parts.cells;
    if (!cells) { this.onHover(null); return; }
    const rect = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const hit = this.raycaster.intersectObject(cells, false)[0];
    if (!hit || hit.instanceId === undefined) { this.onHover(null); return; }
    const list = cells.userData.drawn || cells.userData.cells;
    this.onHover(list[hit.instanceId]);
  }

  dispose() {
    this.clear();
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }
}

// The cube in the world: the same cells as a mesh whose own matrix turns the unit cube into the body's
// fixed frame about the cube's centre (columns east, up, south times the edge), for the scene's
// setObject. rotation: the rows east, north, up in the fixed frame.
export function worldCube(n, edge, rotation, cells, colours, { fill = 0.55, opacity = 1 } = {}) {
  const [E, N, U] = rotation;
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.matrix.set(edge * E[0], edge * U[0], -edge * N[0], 0, edge * E[1], edge * U[1], -edge * N[1], 0, edge * E[2], edge * U[2], -edge * N[2], 0, 0, 0, 0, 1);
  if (cells.length) {
    const mesh = cellsMesh(n, cells, colours, { fill, opacity });
    group.add(mesh);
  }
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: new THREE.Color(css('--orchid', '#b892dd')) }));
  group.add(outline);
  return group;
}
