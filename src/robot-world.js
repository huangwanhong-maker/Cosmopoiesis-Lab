// The robot drawn in the world (decision 0011): its links as the catalogue's shapes, at true scale, in its
// plane at its site, lit by the Sun from where the Sun is; and the ground the simulation stands on, a level
// strip at the terrain's height under the start, drawn as what it is.
//
// The object's own axes are the plane's: x forward, y left, z up (robot.js); the scene places it in the
// body's fixed frame (Scene.setObject), its matrix turning those axes into F, L and U. Each link is a group
// whose matrix is its pose, a rotation by θ about y (x turning toward z) and the joint's place; its meshes
// are made once and only the poses change.

import * as THREE from 'three';

const SHELL = 0xefe7f1, LIMB = 0xd6c6e2, JOINT = 0x4a2c4f, INNER = 0xee8fbd, EYE = 0x2a1630;

export class RobotInWorld {
  // model: the catalogue's rabbit (robot.models); axes: planeAxes (F, L, U).
  constructor(model, axes) {
    this.model = model;
    this.object = new THREE.Group();
    this.object.matrixAutoUpdate = false;
    this.setAxes(axes);
    const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
    this.links = model.links.map((link, i) => {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      const sh = link.shape;
      // a pair at ±half its width (the rabbit's legs), or one side (the dog's legs: y_m), or the middle
      const sides = sh.paired ? [sh.width_m / 2, -sh.width_m / 2] : [sh.y_m ?? 0];
      for (const y of sides) {
        let mesh;
        if (sh.kind === 'box') {
          // The box with its edges rounded by the drawing: a capsule of its thickness along its length, widened
          // to its width (its mass and inertia are the box's).
          const r = sh.thickness_m / 2;
          mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, sh.length_m - 2 * r, 8, 20), mat(SHELL));
          mesh.rotation.z = -Math.PI / 2;
          mesh.scale.set(1, 1, sh.width_m / sh.thickness_m);
          mesh.position.set(sh.from_m[0] + sh.length_m / 2, y, sh.from_m[1]);
        } else {
          mesh = new THREE.Mesh(new THREE.CapsuleGeometry(sh.thickness_m / 2, sh.length_m, 4, 10), mat(LIMB));
          mesh.rotation.z = -Math.PI / 2;  // its axis, y, along x
          mesh.position.set(sh.from_m[0] + sh.length_m / 2, y, sh.from_m[1]);
        }
        g.add(mesh);
      }
      // The joint's motor, across the pair of legs: a dark cylinder about y at the link's origin.
      if (link.parent >= 0) {
        const span = (sh.paired ? sh.width_m : 0) + 0.03;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, span, 14), mat(JOINT));
        m.position.y = sh.paired ? 0 : sh.y_m ?? 0;  // on its leg's side
        g.add(m);  // a cylinder's axis is y already
      }
      if (i === 0 && model.model === 'rabbit') this.head(g, mat);
      if (i === 0 && model.model === 'dog') {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.10, 0.10), mat(SHELL));
        head.position.set(0.25, 0, 0.05);
        g.add(head);
        for (const y of [0.03, -0.03]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), mat(EYE));
          eye.position.set(0.305, y, 0.07);
          g.add(eye);
        }
      }
      this.object.add(g);
      return g;
    });
    // The Sun's light on the robot (the bodies are drawn by their own shaders, which take no lights).
    this.sun = new THREE.DirectionalLight(0xffffff, 3.0);
    this.sunTarget = new THREE.Object3D();
    this.sun.target = this.sunTarget;
    this.object.add(this.sun, this.sunTarget, new THREE.AmbientLight(0xffffff, 0.55));
    // Its shadow on the ground, as a soft blot along the Sun.
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.matrixAutoUpdate = false;
    this.object.add(this.shadow);
    this.strip = null;
    this.stripTo = 0;
    this.ground(0);
  }

  // The head, its eyes (the cameras of a robot) and its ears: drawn, their mass in the torso's.
  head(g, mat) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.038, 18, 12), mat(SHELL));
    head.position.set(0.165, 0, 0.045);
    g.add(head);
    for (const y of [0.026, -0.026]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), mat(EYE));
      eye.position.set(0.19, y, 0.055);
      g.add(eye);
      const ear = new THREE.Group();
      ear.position.set(0.15, y, 0.075);
      ear.rotation.y = -0.75;  // laid back (a turn about y takes z toward x; back is negative)
      const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.075, 4, 10), mat(SHELL));
      outer.position.z = 0.045;
      outer.scale.set(1, 1, 0.45);  // flat across (its own z, which the turn below lays along y)
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.06, 4, 8), mat(INNER));
      inner.position.set(-0.004, 0, 0.045);
      inner.scale.set(1, 1, 0.5);
      outer.rotation.x = inner.rotation.x = Math.PI / 2;  // the capsules' axes, y, along z
      ear.add(outer, inner);
      g.add(ear);
    }
  }

  // The plane's axes in the body's fixed frame: the object's own matrix (columns F, L, U).
  setAxes({ F, L, U }) {
    this.object.matrix.set(F[0], L[0], U[0], 0, F[1], L[1], U[1], 0, F[2], L[2], U[2], 0, 0, 0, 0, 1);
    this.object.matrixWorldNeedsUpdate = true;
  }

  // A frame's poses: each link turned by θ about y and placed at (o_x, 0, o_z).
  pose(frame) {
    if (!frame) return;
    frame.poses.forEach(([x, z, th], i) => {
      const c = Math.cos(th), s = Math.sin(th);
      this.links[i].matrix.set(c, 0, -s, x, 0, 1, 0, 0, s, 0, c, z, 0, 0, 0, 1);
      this.links[i].matrixWorldNeedsUpdate = true;
    });
    this.ground(frame.com_m[0]);
    this.cast(frame.com_m);
  }

  // The Sun's direction in the plane's axes (x forward, y left, z up).
  light(dir) {
    this.sunDir = dir;
    this.sun.position.set(10 * dir[0], 10 * dir[1], 10 * dir[2]);
    this.sun.intensity = dir[2] > -0.05 ? 3.0 : 0.0;  // below the horizon the Sun gives no light
  }

  cast(com) {
    const d = this.sunDir || [0, 0, 1];
    const up = Math.max(d[2], 0.08);
    // The centre's shadow along the Sun on the ground, stretched as the Sun is low.
    const x = com[0] - com[1] * d[0] / up, y = -com[1] * d[1] / up;
    const stretch = Math.min(4, 1 / up), a = Math.atan2(d[1], d[0]);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, 0.001), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a),
      new THREE.Vector3(0.16 * stretch, 0.07, 1));
    this.shadow.matrix.copy(m);
    this.shadow.material.opacity = d[2] > 0 ? 0.32 / (1 + 2 * com[1]) : 0;
    this.shadow.matrixWorldNeedsUpdate = true;
  }

  // Where its feet read the ground (the engine's readings: [t, x, parameter, value]): a rose point on the strip
  // for each, the friction's on the robot's line, the load's a little to its left. What the robot and the
  // ground made together, kept where it was made.
  marks(readings) {
    if (this.readMarks) {
      this.object.remove(this.readMarks);
      this.readMarks.geometry.dispose();
      this.readMarks.material.dispose();
      this.readMarks = null;
    }
    if (!readings?.length) return;
    const pts = new Float32Array(readings.length * 3);
    readings.forEach((r, i) => { pts[3 * i] = r[1]; pts[3 * i + 1] = r[2] === 0 ? 0 : 0.06; pts[3 * i + 2] = 0.003; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.readMarks = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd55181, size: 6, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
    this.readMarks.frustumCulled = false;
    this.object.add(this.readMarks);
  }

  // The simulation's ground: level, 0.6 m wide, from 1 m behind the start to 2 m ahead of the robot at least,
  // its metres ticked; made again longer as the robot goes.
  ground(x) {
    const need = Math.max(4, Math.ceil(x + 2));
    const back = Math.min(-1, Math.floor(x - 2));
    if (this.strip && need <= this.stripTo && back >= this.stripFrom) return;
    if (this.strip) {
      this.object.remove(this.strip);
      this.strip.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    this.stripFrom = back, this.stripTo = need + 4;
    const g = new THREE.Group();
    const w = 0.3, x0 = this.stripFrom, x1 = this.stripTo;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 2 * w), new THREE.MeshBasicMaterial({ color: 0xb892dd, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    fill.position.set((x0 + x1) / 2, 0, 0);
    const pts = [x0, -w, 0, x1, -w, 0, x0, w, 0, x1, w, 0];
    for (let k = Math.ceil(x0 * 2) / 2; k <= x1; k += 0.5) pts.push(k, -w, 0, k, Number.isInteger(k) ? w : -w + 0.08, 0);
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(pts.map((v, i) => (i % 3 === 2 ? 0.002 : v)), 3));
    g.add(fill, new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0xb892dd, transparent: true, opacity: 0.8 })));
    this.strip = g;
    this.object.add(g);
  }
}

// The fish in the world: its links in its horizontal plane at its depth below the sea's surface, its axes the
// plane's (x forward, y left, z up), each link turned about z by θ. The sea's surface hides what is beneath
// it, so the fish is drawn through it (no depth test), with a disc of the sea's surface about it and its
// wake: the force its tail gives the water, rose marks where it gave it.
export class FishInWorld {
  constructor(model, axes, depth) {
    this.model = model;
    this.depth = depth;
    this.object = new THREE.Group();
    this.object.matrixAutoUpdate = false;
    this.setAxes(axes);
    const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, depthTest: false, transparent: true, opacity: 0.96, ...extra });
    this.links = model.links.map((link, i) => {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      const p = link.part, fin = i === model.links.length - 1;
      let mesh;
      if (fin) {
        // the caudal fin: a thin forked blade, its span across the plane (vertical)
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.lineTo(p.length_m, p.height_m / 2);
        s.lineTo(p.length_m * 0.75, 0);
        s.lineTo(p.length_m, -p.height_m / 2);
        s.closePath();
        mesh = new THREE.Mesh(new THREE.ShapeGeometry(s), mat(0xee8fbd, { side: THREE.DoubleSide }));
        mesh.rotation.x = Math.PI / 2;  // the blade's plane from (x, y) to (x, z)
      } else {
        const r = p.height_m / 2;
        mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat(i === 0 ? 0xefe7f1 : 0xd6c6e2));
        mesh.scale.set(p.length_m / 2 + r * 0.25, r * 0.55, r);  // an ellipsoid: long, narrow across, deep
        mesh.position.set(p.from_m[0] + p.length_m / 2, p.from_m[1], 0);
      }
      mesh.renderOrder = 5;
      g.add(mesh);
      if (i === 0) {
        for (const y of [0.03, -0.03]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), mat(0x2a1630));
          eye.position.set(0.09, y, 0.02);
          eye.renderOrder = 6;
          g.add(eye);
        }
      }
      this.object.add(g);
      return g;
    });
    this.object.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(0.3, 0.2, 1);
    this.object.add(sun);
    // the sea's surface about it: a translucent disc 2 m across at the surface, with its rim
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 48), new THREE.MeshBasicMaterial({ color: 0x3987e5, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    disc.position.set(0, 0, depth);
    const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, k) => new THREE.Vector3(Math.cos(k * Math.PI / 32), Math.sin(k * Math.PI / 32), depth))),
      new THREE.LineBasicMaterial({ color: 0xb892dd, transparent: true, opacity: 0.6 }));
    this.surface = new THREE.Group();
    this.surface.add(disc, rim);
    this.object.add(this.surface);
    this.wake = null;
  }

  setAxes({ F, L, U }) {
    this.object.matrix.set(F[0], L[0], U[0], 0, F[1], L[1], U[1], 0, F[2], L[2], U[2], 0, 0, 0, 0, 1);
    this.object.matrixWorldNeedsUpdate = true;
  }
  light() {}
  marks() {}

  // A frame's poses: each link turned about z by θ and placed at (o_x, o_y, 0); the disc follows the head.
  pose(frame, recent = []) {
    if (!frame) return;
    frame.poses.forEach(([x, y, th], i) => {
      const c = Math.cos(th), s = Math.sin(th);
      this.links[i].matrix.set(c, -s, 0, x, s, c, 0, y, 0, 0, 1, 0, 0, 0, 0, 1);
      this.links[i].matrixWorldNeedsUpdate = true;
    });
    this.surface.position.set(frame.com_m[0], frame.com_m[1], 0);
    this.surface.updateMatrix();
    this.surface.matrixWorldNeedsUpdate = true;
    this.drawWake(recent);
  }

  // The wake of the last seconds' frames: a rose point where each strip of the tail pushed the water.
  drawWake(frames) {
    if (this.wake) {
      this.object.remove(this.wake);
      this.wake.geometry.dispose();
      this.wake.material.dispose();
      this.wake = null;
    }
    const pts = [];
    for (const f of frames) for (const w of f.wake || []) if (Math.hypot(w[2], w[3]) > 0.05) pts.push(w[0], w[1], 0);
    if (!pts.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.wake = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd55181, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }));
    this.wake.renderOrder = 4;
    this.wake.frustumCulled = false;
    this.object.add(this.wake);
  }
}
