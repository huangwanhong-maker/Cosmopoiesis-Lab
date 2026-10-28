// The scene of the one world: every body of the ephemeris as a globe of the shared visualization
// layer, Saturn's rings, and the sky, drawn in the ICRS's axes with the camera at the origin.
//
// Each body is a TileTree (its level of detail, in its fixed frame), a renderer of its tiles and the
// imagery drawn on it. The Earth and the Moon carry terrain from the data library's tiles; the other
// bodies are their figures (the IAU mean spheres) carrying their maps, with NASA Trek's tiles at
// close range where they exist. Each frame every body is placed relative to the camera in double
// precision (positions in the ICRS, m, are subtracted before anything reaches the graphics card,
// which holds single precision: the "relative to eye" method of Cozzi and Ring 2011, §5.1), and asked
// which tiles to draw given the camera and the view's frustum in its own frame: a plane n·x + d ≥ 0
// of the camera's frame is, in the body's, (Rᵀn)·y + (d + n·c) ≥ 0 for a body at c turned by R. A body
// smaller than a few pixels is drawn as a point of light instead, so that the whole Solar System can
// be seen at once.

import * as THREE from 'three';
import { globe } from '../../../visualization/js/index.js';
import { BY_KEY as ASTRONOMY_BODIES } from '../../../domains/astronomy/js/index.js';
import { terrainUrl } from './api.js';
import { loadImage } from './maps.js';

const {
  figure, TileTree, TerrainWorkers, createGlobeRenderer, createSky, imageryLayer, mapLayer, IMAGERY, apply, applyTransposed,
} = globe;

const unit = (v) => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// The heights of the bodies with terrain (m), lowest and highest, for the trees' bounds.
const HEIGHTS = { earth: [-11000, 8900], moon: [-9200, 10800] };
// A point's colour for each body when it is too small to be a globe (its map's mean tone, softened).
const POINT = { sun: 0xfff1d6, mercury: 0xbfb2a6, venus: 0xf0dcb4, earth: 0xa8c4ee, moon: 0xd8d2ca, mars: 0xe8a07c, jupiter: 0xe8cfae,
  saturn: 0xead8a8, uranus: 0xb8e2ea, neptune: 0x8fb0f0, pluto: 0xd8c4b0 };

export class Scene {
  // bodies: [{ key, name, radius, equatorialRadius }]; maps: loadMaps()'s answer.
  constructor(canvas, { bodies, maps = { bodies: {} }, maxLevel = { earth: 18, moon: 14 }, terrainReady = { earth: true, moon: true } } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040306);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1e18);
    this.workers = new TerrainWorkers();
    this.maps = maps;
    this.maxLevel = maxLevel;
    this.terrainReady = terrainReady;
    this.options = {
      exaggeration: 1, surface: 'visible', synthetic: false, provenance: false, atmosphere: true, milkyWay: true, orbits: true,
      fieldLines: false, moonField: null, moonFieldSynthetic: false, moonFieldOpacity: 0.8,
      base: { earth: 'eox-s2cloudless-2016', moon: 'trek-lro-wac' }, night: true,
      data: null, dataOpacity: 0.75, reference: null, referenceOpacity: 0.9, date: null,
    };
    this.onChange = () => {};
    this.features = new Map();
    this.bodies = {};
    for (const b of bodies) this.bodies[b.key] = this.makeBody(b);
    this.rings = null;
    if (maps.rings && this.bodies.saturn) this.makeRings(maps.rings);
    this.points = this.makePoints();
    this.sky = null;
    this.frustum = new THREE.Frustum();
    this.projView = new THREE.Matrix4();
    this.resize();
  }

  makeBody(info) {
    const key = info.key;
    const fig = key === 'earth' || key === 'moon' ? figure(key) : figure({ name: `${info.name}, IAU mean sphere`, a: info.equatorialRadius || info.radius, f: 0 });
    const lighting = key === 'earth' ? 'earth' : key === 'sun' ? 'sun' : key === 'moon' ? 'moon' : 'body';
    const gpu = createGlobeRenderer(THREE, { fig, lighting, atmosphere: key === 'earth' });
    this.scene.add(gpu.group);
    const body = { key, name: info.name, fig, gpu, tree: null, terrain: key in HEIGHTS, map: this.maps.bodies[key] || null };
    body.tree = this.makeTree(body);
    return body;
  }

  makeTree(body) {
    const { key, fig, gpu } = body;
    const o = this.options;
    const ex = o.exaggeration;
    const live = body.map?.live;
    const maxLevel = body.terrain ? this.maxLevel[key] : Math.max(4, live ? live.levels - 1 : 4);
    return new TileTree({
      fig, maxLevel, heightRange: body.terrain ? HEIGHTS[key].map((h) => h * ex) : [0, 0],
      layers: this.layersFor(body),
      loadTerrain: (z, x, y, signal) => this.workers.build({
        url: body.terrain && this.terrainReady[key] ? terrainUrl(key, z, x, y, { synthetic: o.synthetic }) : null,
        figure: body.terrain ? key : { name: fig.name, a: fig.a, f: fig.f }, z, x, y, exaggeration: ex, surface: o.surface,
      }, signal),
      on: {
        ready: (t) => { gpu.ready(t); this.onChange(); },
        released: (t) => gpu.released(t),
        imageReady: (t, layer, image) => { gpu.imageReady(t, layer, image); this.onChange(); },
        imageReleased: (t, layer) => gpu.imageReleased(t, layer),
      },
      tolerance: 2.5, maxLoads: 12, maxImageLoads: 24, maxTiles: body.terrain ? 900 : 300,
    });
  }

  // The imagery drawn on a body: on the Earth its base, the night's lights, a field and a reference;
  // on the Moon its base; on the others their maps.
  layersFor(body) {
    const o = this.options;
    if (body.key === 'earth' || body.key === 'moon') {
      const ids = [o.base[body.key]];
      if (body.key === 'earth') {
        if (o.night) ids.push('gibs-blackmarble');
        if (o.data) ids.push(o.data);
        if (o.reference) ids.push(o.reference);
      }
      const layers = ids.filter((id) => id && IMAGERY[id] && IMAGERY[id].body === body.key)
        .map((id) => imageryLayer(this.layerKey(id), IMAGERY[id], { date: () => (IMAGERY[id].daily ? o.date || undefined : undefined) }));
      if (body.key === 'moon' && o.base.moon === 'map' && body.map) layers.splice(0, layers.length, mapLayer('map-moon', body.map));
      if (body.key === 'moon' && o.moonField && this.moonFieldMap) layers.push(this.moonFieldMap.layer);
      return layers;
    }
    return body.map ? [mapLayer(`map-${body.key}`, body.map)] : [];
  }
  baseKey(body) {
    if (body.key === 'earth') return this.layerKey(this.options.base.earth);
    if (body.key === 'moon') return this.options.base.moon === 'map' && body.map ? 'map-moon' : this.layerKey(this.options.base.moon);
    return body.map ? `map-${body.key}` : null;
  }
  layerKey(id) {
    if (!id) return null;
    return IMAGERY[id]?.daily ? `${id}@${this.options.date || 'latest'}` : id;
  }
  setLayers() {
    for (const b of Object.values(this.bodies)) b.tree.setLayers(this.layersFor(b));
    this.onChange();
  }
  // The Moon's crustal field, laid over its ground as its data layer (fields.js), or null.
  setMoonField(map) {
    this.moonFieldMap = map;
    this.setLayers();
  }
  rebuildTerrain() {
    for (const b of Object.values(this.bodies)) {
      if (!b.terrain) continue;
      for (const t of b.tree.tiles.values()) {
        if (t.abort) t.abort.abort();
        for (const [id, img] of t.images) {
          if (img.abort) img.abort.abort();
          if (img.state === 'ready') b.gpu.imageReleased(t, id);
        }
        if (t.state === 'ready') b.gpu.released(t);
      }
      b.tree = this.makeTree(b);
    }
    this.onChange();
  }

  // Saturn's rings: an annulus in its equatorial plane carrying the radial strip of the product (from
  // the inner edge of the C ring to the outer edge of the A ring), its transparency the strip's.
  async makeRings(rings) {
    const radii = rings.radii_km || [ASTRONOMY_BODIES.saturn.rings.inner, ASTRONOMY_BODIES.saturn.rings.outer];
    const [inner, outer] = radii.map((km) => km * 1e3);
    let image;
    try { image = await loadImage(rings.url); } catch { return; }
    const texture = new THREE.Texture(image);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.RingGeometry(inner, outer, 256, 1);
    const pos = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vPos;
void main() { vUv = uv; vPos = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
#include <logdepthbuf_vertex>
}`,
      fragmentShader: `#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform vec3 sunLocal; uniform float planetRadius;
varying vec2 vUv; varying vec3 vPos;
void main() {
  #include <logdepthbuf_fragment>
  vec4 c = texture2D(map, vec2(vUv.x, 0.5));
  // Saturn's shadow on the rings: the ring point is shadowed when the planet lies between it and the Sun.
  vec3 s = normalize(sunLocal);
  float along = dot(vPos, s);
  float off = length(vPos - along * s);
  float lit = (along < 0.0 && off < planetRadius) ? 0.12 : 1.0;
  gl_FragColor = vec4(c.rgb * lit, c.a);
  #include <colorspace_fragment>
}`,
      uniforms: { map: { value: texture }, sunLocal: { value: new THREE.Vector3(1, 0, 0) }, planetRadius: { value: this.bodies.saturn.fig.a } },
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    this.rings = { mesh, inner, outer };
    this.onChange();
  }

  // The bodies as points of light, for when they are smaller than a few pixels.
  makePoints() {
    const keys = Object.keys(this.bodies);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * keys.length), 3).setUsage(THREE.DynamicDrawUsage));
    const colours = new Float32Array(3 * keys.length);
    keys.forEach((k, i) => { const c = new THREE.Color(POINT[k] ?? 0xffffff); colours.set([c.r, c.g, c.b], 3 * i); });
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const object = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, map: this.disc(), transparent: true, alphaTest: 0.2, depthTest: false }));
    object.frustumCulled = false;
    object.renderOrder = 4;
    this.scene.add(object);
    return { object, keys };
  }

  // The sky: the stars, and the Milky Way when its map and the ICRS → galactic rotation (rows; the
  // engine's catalogue gives it: the transform GALACTIC → ICRS, transposed) are at hand.
  async setSky(stars, toGalactic = null) {
    if (this.sky) { this.scene.remove(this.sky.group); this.sky.dispose(); }
    let milkyWay = null;
    if (this.maps.sky && toGalactic) {
      try {
        const image = await loadImage(this.maps.sky.url);
        milkyWay = { image, southUp: this.maps.sky.southUp, toGalactic };
      } catch { /* the stars alone */ }
    }
    this.sky = createSky(THREE, { stars, limit: 6.5, milkyWay });
    if (this.sky.milky) this.sky.milky.visible = this.options.milkyWay;
    this.scene.add(this.sky.group);
    this.onChange();
  }

  setMilkyWay(on) {
    this.options.milkyWay = on;
    if (this.sky?.milky) this.sky.milky.visible = on;
    this.onChange();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.size = { w, h };
    this.onChange?.();
  }

  // A ray through a pixel, in the focus body's frame, from a camera given in it.
  rayAt(cam, clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1, y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    const f = cam.forward, u = cam.up;
    const r = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
    const d = [0, 1, 2].map((k) => f[k] + x * t * this.camera.aspect * r[k] + y * t * u[k]);
    return { origin: cam.position, direction: unit(d) };
  }

  // Draw. state: { cam: { position (ICRS, m), forward, up } in the ICRS's axes, bodies: { key: {
  // position (ICRS), rotation (fixed → ICRS) } }, altitude (m above the nearest ground), starBrightness }.
  draw(state) {
    const o = this.options;
    const P = state.cam.position, fw = state.cam.forward, up = state.cam.up;
    const cam = this.camera;
    cam.position.set(0, 0, 0);
    cam.up.set(up[0], up[1], up[2]);
    cam.lookAt(fw[0], fw[1], fw[2]);
    const near = Math.max(0.05, Math.min(5e4, (state.altitude || 1000) * 0.02));
    if (Math.abs(cam.near - near) / near > 0.2) { cam.near = near; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const planes = this.frustum.planes.map((p) => [p.normal.x, p.normal.y, p.normal.z, p.constant]);
    const sunW = state.bodies.sun?.position || [0, 0, 0];
    const viewRot = new THREE.Matrix3().setFromMatrix4(cam.matrixWorldInverse);
    const pixel = (2 * Math.tan((cam.fov * Math.PI) / 360)) / this.size.h;  // radians per pixel
    const pointPos = this.points.object.geometry.attributes.position;
    const stats = {};
    this.points.keys.forEach((key, i) => {
      const b = this.bodies[key], B = state.bodies[key];
      if (!B) { pointPos.setXYZ(i, 0, 0, -1e30); return; }
      const rel = sub(B.position, P);
      const dist = Math.hypot(...rel);
      const angular = b.fig.a / Math.max(dist, 1);
      const asGlobe = angular > 1.5 * pixel;
      // The point, drawn at a fixed distance along its direction so that single precision holds it.
      if (!asGlobe) {
        const u = unit(rel);
        pointPos.setXYZ(i, u[0] * 1e6, u[1] * 1e6, u[2] * 1e6);
      } else {
        pointPos.setXYZ(i, 0, 0, -1e30);
      }
      b.gpu.group.visible = asGlobe;
      if (!asGlobe) { stats[key] = { drawn: 0 }; return; }
      const R = B.rotation;
      const camBody = applyTransposed(R, rel).map((x) => -x);
      const bodyPlanes = planes.map(([nx, ny, nz, d]) => {
        const n = applyTransposed(R, [nx, ny, nz]);
        return [n[0], n[1], n[2], d + nx * rel[0] + ny * rel[1] + nz * rel[2]];
      });
      const selection = b.tree.update({ camera: camBody, planes: bodyPlanes, height: this.size.h, fovY: (cam.fov * Math.PI) / 180 });
      const sunDir = key === 'sun' ? unit(rel.map((x) => -x)) : unit(sub(sunW, B.position));
      const sunView = new THREE.Vector3(...sunDir).applyMatrix3(viewRot);
      b.gpu.draw(selection, {
        bodyRelative: rel, rotation: R, sunBody: applyTransposed(R, sunDir),
        base: this.baseKey(b), night: key === 'earth' && o.night ? 'gibs-blackmarble' : null,
        data: key === 'earth' && o.data ? { layer: this.layerKey(o.data), opacity: o.dataOpacity }
          : key === 'moon' && o.moonField && this.moonFieldMap ? { layer: this.moonFieldMap.id, opacity: o.moonFieldOpacity } : null,
        reference: key === 'earth' && o.reference ? { layer: this.layerKey(o.reference), opacity: o.referenceOpacity } : null,
        overlay: o.provenance && b.terrain ? 1 : 0, exposure: key === 'moon' ? 1.05 : 1,
        sunView: [sunView.x, sunView.y, sunView.z], atmosphere: o.atmosphere,
      });
      stats[key] = { ...b.tree.stats };
    });
    pointPos.needsUpdate = true;
    // Saturn's rings, in its equatorial plane (its fixed frame's x–y plane).
    if (this.rings && state.bodies.saturn) {
      const B = state.bodies.saturn, R = B.rotation, rel = sub(B.position, P);
      const dist = Math.hypot(...rel);
      this.rings.mesh.visible = this.rings.outer / dist > 1.5 * pixel;
      this.rings.mesh.matrix.set(R[0][0], R[0][1], R[0][2], rel[0], R[1][0], R[1][1], R[1][2], rel[1], R[2][0], R[2][1], R[2][2], rel[2], 0, 0, 0, 1);
      this.rings.mesh.matrixWorldNeedsUpdate = true;
      const s = applyTransposed(R, unit(sub(sunW, B.position)));
      this.rings.mesh.material.uniforms.sunLocal.value.set(s[0], s[1], s[2]);
    }
    // The features: each drawn in its frame, relative to the camera in double precision.
    for (const f of this.features.values()) {
      const frame = this.frameOf(f.frame, state);
      if (!frame || (f.hideBelow && (state.altitude ?? Infinity) < f.hideBelow) || (f.group && !this.options[f.group])) { f.object.visible = false; continue; }
      f.object.visible = true;
      const R = frame.rotation, c = f.centre;
      const rel = sub(frame.position, P), rc = apply(R, c);
      f.object.matrix.set(R[0][0], R[0][1], R[0][2], rel[0] + rc[0], R[1][0], R[1][1], R[1][2], rel[1] + rc[1], R[2][0], R[2][1], R[2][2], rel[2] + rc[2], 0, 0, 0, 1);
      f.object.matrixWorldNeedsUpdate = true;
    }
    if (this.sky) {
      const sunRel = sub(sunW, P);
      const sunAngular = 6.957e8 / Math.max(Math.hypot(...sunRel), 1);
      this.sky.update({ sunDirection: unit(sunRel), sunRadius: Math.max(0.0005, sunAngular), camera: cam, brightness: state.starBrightness ?? 1,
        sun: sunAngular < 3 * pixel });
    }
    this.renderer.render(this.scene, cam);
    return { P, stats };
  }

  // A frame for features: a body's key (its fixed frame), "<key>:inertial" (its centre, ICRS axes) or "icrs".
  frameOf(name, state) {
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    if (name === 'icrs') return { position: [0, 0, 0], rotation: I };
    const [key, kind] = name.split(':');
    const B = state.bodies[key];
    if (!B) return null;
    return kind === 'inertial' ? { position: B.position, rotation: I } : B;
  }

  // A path (a line through points), lines (segments, their ends in pairs), points, or a mark, in a frame
  // (frameOf); null removes it.
  // hideBelow: not drawn when the camera is nearer than this to a body's ground (m); group: an option
  // that hides the feature when false (as 'orbits').
  setFeature(key, frame, points, { kind = 'path', colour = 0xe889b8, size = 7, opacity = 1, depthTest = null, hideBelow = 0, group = null } = {}) {
    this.drop(key);
    if (!points || !points.length) { this.onChange(); return; }
    const centre = points[0];
    const position = new Float32Array(points.length * 3);
    points.forEach((p, i) => { for (let k = 0; k < 3; k++) position[3 * i + k] = p[k] - centre[k]; });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    let object;
    if (kind === 'path' || kind === 'lines') {
      const material = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity, depthTest: depthTest ?? false });
      object = kind === 'path' ? new THREE.Line(geometry, material) : new THREE.LineSegments(geometry, material);
    } else {
      object = new THREE.Points(geometry, new THREE.PointsMaterial({ color: colour, size: kind === 'mark' ? size + 4 : size, sizeAttenuation: false,
        map: this.disc(), transparent: true, alphaTest: 0.2, depthTest: kind !== 'mark', opacity }));
    }
    object.matrixAutoUpdate = false;
    object.frustumCulled = false;
    object.renderOrder = 2;
    this.scene.add(object);
    this.features.set(key, { frame, centre, object, hideBelow, group });
    this.onChange();
  }

  // Any three.js object in a frame (frameOf), at a point of it (m), turned and scaled by its own matrix
  // within the frame's axes; null removes it. The field's cube is one (cube.js, worldCube).
  setObject(key, frame, centre, object, { hideBelow = 0, group = null } = {}) {
    this.drop(key);
    if (!object) { this.onChange(); return; }
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.add(object);
    holder.traverse((o) => { o.frustumCulled = false; });
    holder.renderOrder = 2;
    this.scene.add(holder);
    this.features.set(key, { frame, centre, object: holder, hideBelow, group });
    this.onChange();
  }

  // A feature removed, its geometries and materials freed.
  drop(key) {
    const f = this.features.get(key);
    if (!f) return;
    this.scene.remove(f.object);
    f.object.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    this.features.delete(key);
  }

  // Many moving points (the satellites): a buffer refilled each frame, in a frame (frameOf).
  setPoints(key, frame, count, { positions = null, colours = null, size = 6 } = {}) {
    let f = this.features.get(key);
    if (!count) {
      if (f) this.drop(key);
      return;
    }
    if (!f || f.capacity < count) {
      if (f) { this.scene.remove(f.object); f.object.geometry.dispose(); f.object.material.dispose(); }
      const capacity = Math.max(64, count * 2);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * capacity), 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * capacity), 3).setUsage(THREE.DynamicDrawUsage));
      const object = new THREE.Points(geometry, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, map: this.disc(), transparent: true, alphaTest: 0.2 }));
      object.matrixAutoUpdate = false;
      object.frustumCulled = false;
      object.renderOrder = 3;
      this.scene.add(object);
      f = { frame, centre: [0, 0, 0], object, capacity };
      this.features.set(key, f);
    }
    const g = f.object.geometry;
    if (positions) { g.attributes.position.array.set(positions); g.attributes.position.needsUpdate = true; }
    if (colours) { g.attributes.color.array.set(colours); g.attributes.color.needsUpdate = true; }
    g.setDrawRange(0, count);
  }

  disc() {
    if (this._disc) return this._disc;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.7, 'rgba(255,255,255,1)');
    grad.addColorStop(0.85, 'rgba(30,16,36,0.9)');
    grad.addColorStop(1, 'rgba(30,16,36,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(32, 32, 30, 0, 2 * Math.PI);
    g.fill();
    this._disc = new THREE.CanvasTexture(c);
    return this._disc;
  }
}
