// ===================== рангоут, паруса, такелаж, флаги =====================
const RIG = { square: [], jibs: [], flags: [], lateen: null, brace: 0, lat: 0, drive: 0, ready: false,
  wind: { ax: 1, az: 0, A: 1, phi: 0, ws: 8, Wx: 0, Wz: 0 } };
const _t1 = V3(), _t2 = V3(), _t3 = V3(), _t4 = V3(), _r1 = V3();
function toModel(obj, v) { let o = obj; while (o && o !== SHIP.model) { v.applyMatrix4(o.matrix); o = o.parent; } return v; }

// парусина: просвечивает на солнце
const SAIL_U = { uKeyV: { value: V3(0, 1, 0) }, uKeyC: { value: new THREE.Color() } };
function sailMat(tex, color = 0xffffff) {
  const m = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.93, color });
  m.onBeforeCompile = sh => {
    sh.uniforms.uKeyV = SAIL_U.uKeyV; sh.uniforms.uKeyC = SAIL_U.uKeyC;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uKeyV; uniform vec3 uKeyC;')
      .replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * uKeyC * max(-dot(normal, uKeyV), 0.0) * 0.13;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'sail';
  return m;
}

// канаты — один InstancedMesh из цилиндров
class Ropes {
  constructor(max, mat, parent) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); g.translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(g, mat, max); this.mesh.count = 0; this.max = max; this.n = 0;
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._d = V3(); this._s = V3(); this._p0 = V3(); this._p1 = V3();
  }
  add(a, b, r) {
    if (this.n >= this.max) return;
    const d = this._d.subVectors(b, a), L = d.length(); if (L < 1e-4) return;
    this._q.setFromUnitVectors(_UP, d.multiplyScalar(1 / L));
    this._m.compose(a, this._q, this._s.set(r, L, r));
    this.mesh.setMatrixAt(this.n++, this._m);
  }
  sag(a, b, r, sag, seg = 4) {
    const p0 = this._p0.copy(a), p1 = this._p1;
    for (let i = 1; i <= seg; i++) { const t = i / seg; p1.lerpVectors(a, b, t); p1.y -= sag * 4 * t * (1 - t); this.add(p0, p1, r); p0.copy(p1); }
  }
  begin() { this.n = 0; }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; }
}

function gridIndex(nu, nv) {
  const idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  return idx;
}

// прямой парус: сетка в координатах реи (x — вперёд, y — вверх, z — вдоль реи)
class SquareSail {
  constructor(parent, o) {
    this.o = o; const nu = 20, nv = 14; this.nu = nu; this.nv = nv;
    const n = (nu + 1) * (nv + 1), uv = new Float32Array(n * 2);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const k = j * (nu + 1) + i; uv[k * 2] = i / nu; uv[k * 2 + 1] = 1 - j / nv; }
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(gridIndex(nu, nv));
    this.geo = g;
    this.mesh = new THREE.Mesh(g, o.mat); this.mesh.castShadow = this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    const rg = new THREE.CylinderGeometry(1, 1, o.wt * 0.9, 10, 1); rg.rotateX(PI / 2);
    this.roll = new THREE.Mesh(rg, o.rollMat); this.roll.position.set(0.22, -0.3, 0); this.roll.castShadow = true; parent.add(this.roll);
    this.set = 1; this.D = 0; this.vD = 0; this.p = 0; this.ph = Math.random() * 10;
    this.area = (o.wt + o.wb) / 2 * o.h;
  }
  update(dt, target, p, q, t, storm, kick) {
    const o = this.o;
    this.set += clamp(target - this.set, -dt * 0.45, dt * 0.45);
    const s = this.set;
    this.mesh.visible = s > 0.02; this.roll.visible = s < 0.985;
    const rr = 0.09 + 0.3 * (1 - s); this.roll.scale.set(rr, rr * 1.15, 1);
    this.p = p;
    const Dt = clamp(p, -0.25, 1) * q * 0.13 * o.h * (0.3 + 0.7 * s) + kick;
    this.vD += ((Dt - this.D) * 30 - this.vD * 5.5) * dt; this.D += this.vD * dt;
    if (!this.mesh.visible) return;
    const luff = Math.exp(-(p * p) / 0.05);
    const A = (0.03 + luff * 0.42 + storm * 0.07) * Math.min(1, o.h * 0.1);
    const om = 7 + storm * 6 + luff * 4;
    const nu = this.nu, nv = this.nv, P = this.pos, H = o.h * s;
    let k = 0;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv, sv = Math.sin(PI * 0.62 * v), v4 = v * v * v * v;
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, su = Math.sin(PI * u);
        const z = lerp(lerp(-o.wt / 2, o.wt / 2, u), lerp(-o.wb / 2, o.wb / 2, u), v);
        const y = o.y0 - v * H + v * v * v * 0.45 * su * s;
        const bill = sv * (0.3 + 0.7 * su) * (1 - Math.pow(1 - su, 3) * v4);
        const edge = 0.25 + 0.75 * Math.max(1 - su, v * v);
        const fl = A * edge * Math.min(1, v * 5) * (0.6 * Math.sin(u * o.wt * 0.8 - t * om + v * 2.6 + this.ph) + 0.4 * Math.sin(v * o.h * 0.9 - t * om * 1.37 + u * 4.1 + this.ph * 1.7));
        P[k++] = 0.3 + this.D * bill + fl; P[k++] = y; P[k++] = z;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// косой парус (кливер, латинский): A — галс, B — фал (верх), C — шкот
class TriSail {
  constructor(parent, mat, lateen = false) {
    const nu = 16, nv = 10; this.nu = nu; this.nv = nv; this.lateen = lateen;
    const n = (nu + 1) * (nv + 1), uv = new Float32Array(n * 2);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const k = j * (nu + 1) + i; uv[k * 2] = j / nv; uv[k * 2 + 1] = i / nu; }
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(gridIndex(nu, nv));
    this.geo = g;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.castShadow = this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.set = 1; this.D = 0; this.vD = 0; this.ph = Math.random() * 10; this.area = 1;
    this.clew = V3(); this._b = V3(); this._l = V3(); this._q = V3(); this._ab = V3(); this._ac = V3();
  }
  update(dt, A, B, C, n, target, p, q, t, storm) {
    this.set += clamp(target - this.set, -dt * 0.45, dt * 0.45);
    const s = this.set; this.mesh.visible = s > 0.02;
    const Bs = this._b, Cs = this.clew;
    if (this.lateen) { Bs.copy(B); Cs.lerpVectors(this._l.lerpVectors(A, B, 0.45), C, s); }
    else { Bs.lerpVectors(A, B, s); Cs.lerpVectors(A, C, s); }
    this.area = 0.5 * this._ab.subVectors(Bs, A).cross(this._ac.subVectors(Cs, A)).length();
    const size = Math.sqrt(this.area);
    const Dt = clamp(p, -1, 1) * q * 0.11 * size;
    this.vD += ((Dt - this.D) * 26 - this.vD * 5) * dt; this.D += this.vD * dt;
    if (!this.mesh.visible) return;
    const luff = Math.exp(-(p * p) / 0.04);
    const Af = (0.03 + luff * 0.3 + storm * 0.06);
    const om = 8 + storm * 6 + luff * 4;
    const P = this.pos, L = this._l, Q = this._q; let k = 0;
    for (let j = 0; j <= this.nv; j++) {
      const u = j / this.nv;
      L.lerpVectors(A, Bs, u);
      for (let i = 0; i <= this.nu; i++) {
        const v = i / this.nu * 0.985;
        Q.lerpVectors(L, Cs, v);
        const bill = Math.pow(4 * v * (1 - v), 0.8) * (0.35 + 0.65 * Math.sin(PI * u));
        const fl = Af * v * (0.6 * Math.sin(v * size * 1.2 - t * om + u * 3 + this.ph) + 0.4 * Math.sin(u * size - t * om * 1.3 + this.ph));
        const d = this.D * bill + fl;
        P[k++] = Q.x + n.x * d; P[k++] = Q.y + n.y * d; P[k++] = Q.z + n.z * d;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// флаг — Верле-ткань в мировых координатах (видимый ветер получается сам)
class Flag {
  constructor(scene, tex, nx, ny, fly, hoist, taper = 0) {
    this.nx = nx; this.ny = ny; this.fly = fly; this.hoist = hoist; this.taper = taper;
    const n = nx * ny; this.n = n;
    this.p = new Float32Array(n * 3); this.o = new Float32Array(n * 3); this.nrm = new Float32Array(n * 3);
    const C = [], add = (a, b) => C.push(a, b);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i < nx - 1) add(k, k + 1);
      if (j < ny - 1) add(k, k + nx);
      if (i < nx - 1 && j < ny - 1) { add(k, k + nx + 1); add(k + 1, k + nx); }
      if (i < nx - 2) add(k, k + 2);
      if (j < ny - 2) add(k, k + 2 * nx);
    }
    this.C = new Int32Array(C); this.rest = new Float32Array(C.length / 2);
    const dx = fly / (nx - 1);
    const flat = k => { const i = k % nx, j = (k / nx) | 0, hh = hoist * (1 - taper * i / (nx - 1)); return [i * dx, hh * (0.5 - j / (ny - 1)) - (hoist - hh) * 0.5]; };
    for (let c = 0; c < this.rest.length; c++) { const a = flat(this.C[c * 2]), b = flat(this.C[c * 2 + 1]); this.rest[c] = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    const uv = new Float32Array(n * 2), idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; uv[k * 2] = i / (nx - 1); uv[k * 2 + 1] = 1 - j / (ny - 1); }
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + nx; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, sailMat(tex)); this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.init = false; this.acc = 0; this.ph = Math.random() * 10;
  }
  pinPos(j, top, bot, out) { return out.lerpVectors(top, bot, j / (this.ny - 1)); }
  step(dt, top, bot, wind, t) {
    const { nx, ny, p, o } = this;
    if (!this.init) {
      const W = Math.hypot(wind.x, wind.z) || 1, dx = this.fly / (nx - 1);
      for (let j = 0; j < ny; j++) { this.pinPos(j, top, bot, _r1); for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 3; p[k] = o[k] = _r1.x + wind.x / W * dx * i; p[k + 1] = o[k + 1] = _r1.y - 0.05 * i; p[k + 2] = o[k + 2] = _r1.z + wind.z / W * dx * i; } }
      this.init = true;
    }
    const H = 1 / 120; this.acc += dt; let n = 0;
    while (this.acc >= H && n < 4) { this.sub(H, top, bot, wind, t + n * H); this.acc -= H; n++; }
    if (n === 4) this.acc = 0;
    this.attr.array.set(p); this.attr.needsUpdate = true; this.geo.computeVertexNormals();
  }
  sub(h, top, bot, wind, t) {
    const { nx, ny, p, o } = this;
    const W = Math.hypot(wind.x, wind.z) + 1e-6, px = -wind.z / W, pz = wind.x / W;
    const om = 5 + W * 0.45, h2 = h * h;
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      const k = j * nx + i, k3 = k * 3;
      const kr = (i < nx - 1 ? k + 1 : k) * 3, kl = (k - 1) * 3, ku = (j > 0 ? k - nx : k) * 3, kd = (j < ny - 1 ? k + nx : k) * 3;
      const ex = p[kr] - p[kl], ey = p[kr + 1] - p[kl + 1], ez = p[kr + 2] - p[kl + 2];
      const fx = p[kd] - p[ku], fy = p[kd + 1] - p[ku + 1], fz = p[kd + 2] - p[ku + 2];
      let nxv = ey * fz - ez * fy, nyv = ez * fx - ex * fz, nzv = ex * fy - ey * fx;
      const nl = Math.hypot(nxv, nyv, nzv) + 1e-9; nxv /= nl; nyv /= nl; nzv /= nl;
      const vx = (p[k3] - o[k3]) / h, vy = (p[k3 + 1] - o[k3 + 1]) / h, vz = (p[k3 + 2] - o[k3 + 2]) / h;
      const fr = i / nx;
      const gl = W * 0.22 * Math.sin(t * om - i * 0.6 + j * 0.3 + this.ph) * (0.3 + fr);
      const gv = W * 0.1 * Math.sin(t * om * 0.73 - i * 0.45 + this.ph * 2);
      const rx = wind.x + px * gl - vx, ry = gv - vy, rz = wind.z + pz * gl - vz;
      const rl = Math.hypot(rx, ry, rz), dn = rx * nxv + ry * nyv + rz * nzv;
      const ax = nxv * dn * rl * 0.05 + rx * 0.5, ay = nyv * dn * rl * 0.05 + ry * 0.5 - 2.6, az = nzv * dn * rl * 0.05 + rz * 0.5;
      for (let c = 0; c < 3; c++) {
        const cur = p[k3 + c], a = c === 0 ? ax : c === 1 ? ay : az;
        p[k3 + c] = cur + (cur - o[k3 + c]) * 0.99 + a * h2; o[k3 + c] = cur;
      }
    }
    for (let j = 0; j < ny; j++) { this.pinPos(j, top, bot, _r1); const k3 = j * nx * 3; p[k3] = o[k3] = _r1.x; p[k3 + 1] = o[k3 + 1] = _r1.y; p[k3 + 2] = o[k3 + 2] = _r1.z; }
    const C = this.C, R = this.rest, nc = R.length;
    for (let it = 0; it < 6; it++) for (let c = 0; c < nc; c++) {
      const a = C[c * 2], b = C[c * 2 + 1], a3 = a * 3, b3 = b * 3;
      const dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2];
      const d = Math.hypot(dx, dy, dz) + 1e-9, diff = (d - R[c]) / d;
      const wa = a % nx === 0 ? 0 : 1, wb = b % nx === 0 ? 0 : 1, ws = wa + wb; if (!ws) continue;
      const ka = diff * wa / ws, kb = diff * wb / ws;
      p[a3] += dx * ka; p[a3 + 1] += dy * ka; p[a3 + 2] += dz * ka;
      p[b3] -= dx * kb; p[b3 + 1] -= dy * kb; p[b3 + 2] -= dz * kb;
    }
  }
}

// ---------- мачты ----------
const MASTDEF = [
  { key: 'fore', x: 12.3, rake: 0.0, deck: 5.26, r: 0.4, topY: 17.2, topR: 1.55, tmX: 0.68, tmTop: 26.8, ttY: 25.8, tgX: 1.02, tgTop: 33.0, staff: 1.8,
    yards: [{ y: 16.0, L: 19.5, x: 0.62, foot: 7.6, emblem: true }, { y: 25.2, L: 14, x: 1.06 }, { y: 31.2, L: 8.6, x: 1.3 }], chan: [13.2, 10.2, 5] },
  { key: 'main', x: 1.2, rake: 0.035, deck: 2.66, r: 0.45, topY: 18.4, topR: 1.75, tmX: 0.72, tmTop: 29.3, ttY: 28.3, tgX: 1.08, tgTop: 36.5, staff: 3.0,
    yards: [{ y: 17.3, L: 22.5, x: 0.66, foot: 6.2, emblem: true }, { y: 27.6, L: 16, x: 1.1 }, { y: 34.5, L: 9.6, x: 1.34 }], chan: [2.2, -1.8, 6] },
  { key: 'mizzen', x: -9.4, rake: 0.05, deck: 5.0, r: 0.32, topY: 15.4, topR: 1.25, tmX: 0.55, tmTop: 24.6, ttY: 0, tgX: 0, tgTop: 0, staff: 1.6,
    yards: [{ y: 23.0, L: 9.4, x: 0.85, wb: 11, footY: 15.9 }], chan: [-8.7, -11.2, 4] },
];

function woodCylInto(b, a, c, r1, r2, mat, seg = 12) {
  const geo = cylBetween(a, c, r1, r2, seg), L = a.distanceTo(c), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * L / 3);
  b.add(geo, mat);
}

function buildYard(yg, L, M) {
  const b = new Batch(), half = L / 2, r0 = clamp(L * 0.0115, 0.09, 0.26), r1 = r0 * 0.45;
  for (const s of [-1, 1]) {
    woodCylInto(b, V3(0, 0, 0), V3(0, 0, s * half), r0, r1, M.yard, 10);
    for (const f of [0.97, 0.5]) { const r = lerp(r0, r1, f) + 0.025, g = new THREE.CylinderGeometry(r, r, 0.16, 8); g.rotateX(PI / 2); b.add(g, M.iron, M4(0, 0, s * half * f)); }
    // перты
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V3(-0.12, -0.25 - 0.5 * Math.sin(PI * t), s * lerp(half * 0.95, 0.7, t))); }
    b.add(tubeAlong(pts, 0.022, 4, 20), M.ropeS);
    for (let k = 1; k < 4; k++) { const t = k / 4, z = s * lerp(half * 0.95, 0.7, t); b.add(cylBetween(V3(-0.05, 0, z), V3(-0.12, -0.25 - 0.5 * Math.sin(PI * t), z), 0.015, 0.015, 4), M.ropeS); }
  }
  const c = new THREE.CylinderGeometry(r0 * 1.1, r0 * 1.1, L * 0.18, 8); c.rotateX(PI / 2); b.add(c, M.yard);
  b.build(yg);
}

function buildMast(d, T, M) {
  const g = new THREE.Group(); g.position.set(d.x, 0, 0); g.rotation.z = d.rake; g.updateMatrix(); SHIP.model.add(g); d.g = g;
  const b = new Batch();
  const top2 = d.tgTop ? d.tgTop : d.tmTop;
  woodCylInto(b, V3(0, d.deck - 0.3, 0), V3(0, d.topY + 1.7, 0), d.r, d.r * 0.78, M.spar);
  for (let y = d.deck + 1.2; y < d.topY - 2.5; y += 1.5) { const r = lerp(d.r, d.r * 0.78, (y - d.deck) / (d.topY + 2 - d.deck)) + 0.03; b.add(new THREE.CylinderGeometry(r, r, 0.16, 12), M.black, M4(0, y, 0)); }
  b.add(new THREE.CylinderGeometry(d.r + 0.22, d.r + 0.32, 0.3, 12), M.black, M4(0, d.deck + 0.1, 0));
  // круглый марс
  const R = d.topR;
  b.add(new THREE.CylinderGeometry(R + 0.05, R * 0.6, 0.5, 24), M.yard, M4(0.12, d.topY - 0.2, 0));
  b.add(new THREE.CylinderGeometry(R, R * 0.97, 0.85, 24, 1, true), M.topBlue, M4(0.12, d.topY + 0.45, 0));
  for (const y of [d.topY + 0.88, d.topY + 0.06]) b.add(new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.09, 24, 1, true), M.gold, M4(0.12, y, 0));
  for (const sz of [-1, 1]) b.add(new THREE.BoxGeometry(0.28, 1.8, 0.18), M.yard, M4(0, d.topY - 0.9, sz * (d.r * 0.8 + 0.09)));
  b.add(new THREE.BoxGeometry(d.tmX + 0.8, 0.32, 0.75), M.black, M4(d.tmX / 2, d.topY + 1.75, 0));
  // стеньга
  woodCylInto(b, V3(d.tmX, d.topY - 1.2, 0), V3(d.tmX, d.tmTop + 0.6, 0), d.r * 0.62, d.r * 0.45, M.spar);
  if (d.tgTop) {
    b.add(new THREE.CylinderGeometry(0.95, 0.75, 0.16, 16), M.yard, M4(d.tmX + 0.1, d.ttY, 0));
    b.add(new THREE.CylinderGeometry(0.9, 0.88, 0.42, 16, 1, true), M.topBlue, M4(d.tmX + 0.1, d.ttY + 0.25, 0));
    b.add(new THREE.CylinderGeometry(0.94, 0.94, 0.07, 16, 1, true), M.gold, M4(d.tmX + 0.1, d.ttY + 0.46, 0));
    b.add(new THREE.BoxGeometry(d.tgX - d.tmX + 0.6, 0.24, 0.5), M.black, M4((d.tmX + d.tgX) / 2, d.tmTop + 0.65, 0));
    woodCylInto(b, V3(d.tgX, d.ttY - 0.9, 0), V3(d.tgX, d.tgTop, 0), d.r * 0.36, d.r * 0.2, M.spar, 10);
  }
  const sx = d.tgTop ? d.tgX : d.tmX;
  b.add(new THREE.SphereGeometry(0.2, 12, 8), M.gold, M4(sx, top2 + 0.62 * (d.tgTop ? 0 : 1) + 0.1, 0));
  woodCylInto(b, V3(sx, top2, 0), V3(sx, top2 + d.staff + (d.tgTop ? 0 : 0.6), 0), 0.06, 0.035, M.yard, 6);
  b.add(new THREE.SphereGeometry(0.09, 8, 6), M.gold, M4(sx, top2 + d.staff + (d.tgTop ? 0 : 0.6), 0));
  d.staffTop = V3(sx, top2 + d.staff + (d.tgTop ? 0 : 0.6), 0);
  b.build(g);
  // реи и паруса
  d.yards.forEach((yd, level) => {
    const yg = new THREE.Group(); yg.position.set(yd.x, yd.y, 0); g.add(yg); yg.updateMatrix();
    buildYard(yg, yd.L, M);
    let footY, wb;
    if (yd.foot !== undefined) { footY = yd.foot; wb = yd.L + 0.5; }
    else if (yd.footY !== undefined) { footY = yd.footY; wb = yd.wb; }
    else { const pr = d.yards[level - 1]; footY = pr.y + 0.35; wb = pr.L - 1.4; }
    const tex = yd.emblem ? T.sailE : T.sail;
    const sail = new SquareSail(yg, { wt: yd.L - 0.9, wb, h: yd.y - 0.25 - footY, y0: -0.25, mat: sailMat(tex), rollMat: M.roll });
    RIG.square.push({ yard: yg, sail, level: d.key === 'mizzen' ? 1 : level, mast: d, yd });
  });
}

function ratlines(S, list, step) {
  const y0 = Math.max(...list.map(l => l[0].y)) + 0.55, y1 = Math.min(...list.map(l => l[1].y)) - 0.5;
  const at = (l, y, out) => out.lerpVectors(l[0], l[1], (y - l[0].y) / (l[1].y - l[0].y));
  const a = V3(), b = V3();
  for (let y = y0; y < y1; y += step) for (let i = 0; i < list.length - 1; i++) { at(list[i], y, a); at(list[i + 1], y, b); S.add(a, b, 0.016); }
}

async function buildRig(T) {
  setLoad('Ставим мачты…', 0.72); await nextFrame();
  const M = SHIP.M, H = HULLDEF;
  M.spar = new THREE.MeshStandardMaterial({ map: T.grain.map, normalMap: T.grain.normal, roughnessMap: T.grain.rough, color: 0xd9b080, roughness: 1 });
  M.yard = new THREE.MeshStandardMaterial({ map: T.grain.map, normalMap: T.grain.normal, roughnessMap: T.grain.rough, color: 0x4a3526, roughness: 1 });
  M.topBlue = new THREE.MeshStandardMaterial({ map: T.paint.map, color: 0x1f3463, roughness: 0.8, side: THREE.DoubleSide });
  M.ropeS = new THREE.MeshStandardMaterial({ color: 0x1d1712, roughness: 0.95 });
  M.ropeD = new THREE.MeshStandardMaterial({ color: 0x6e5a42, roughness: 0.9 });
  M.roll = new THREE.MeshStandardMaterial({ map: T.sail, color: 0xd8ccb0, roughness: 0.95 });
  const model = SHIP.model;
  RIG.static = new Ropes(3000, M.ropeS, model);
  RIG.dyn = new Ropes(400, M.ropeD, model);
  for (const d of MASTDEF) buildMast(d, T, M);
  const [fore, main, miz] = MASTDEF;
  const mp = (d, x, y, z) => toModel(d.g, V3(x, y, z));
  setLoad('Тянем ванты и штаги…', 0.8); await nextFrame();

  // ---------- русленя, ванты, выбленки, бакштаги ----------
  const rb = new Batch(), S = RIG.static;
  for (const d of MASTDEF) {
    const [cx0, cx1, n] = d.chan, chanY = x => H.rail(x) - 0.55;
    for (const side of [1, -1]) {
      hullStrip(rb, M.black, cx1 - 0.6, cx0 + 0.6, 10, profRows(chanY, [[-0.06, 0], [-0.06, 0.55], [0.06, 0.55], [0.06, 0]]), side, 14, 2.4);
      const low = [];
      for (let i = 0; i < n; i++) {
        const x = lerp(cx0, cx1, i / (n - 1)), y = chanY(x) + 0.06;
        const pc = V3(...H.P(x, H.sAt(x, y), side, 0.48)), de = pc.clone().add(V3(0, 0.42, 0));
        const dg = new THREE.CylinderGeometry(0.13, 0.13, 0.09, 10); dg.rotateX(PI / 2); rb.add(dg, M.black, M4(de.x, de.y, de.z));
        rb.add(cylBetween(pc.clone(), pc.clone().add(V3(0, -1.0, -side * 0.12)), 0.03, 0.03, 5), M.iron);
        S.add(pc, de, 0.03);
        const top = mp(d, lerp(0.25, -0.65, i / (n - 1)), d.topY - 0.1, side * d.topR * 0.82);
        S.add(de, top, 0.045); low.push([de, top]);
      }
      ratlines(S, low, 0.42);
      const nt = d.key === 'mizzen' ? 3 : 4, upTop = d.tgTop ? d.ttY - 0.15 : d.tmTop - 1.3, tms = [];
      for (let i = 0; i < nt; i++) {
        const lx = lerp(0.65, -0.55, i / (nt - 1));
        const rim = mp(d, lx, d.topY + 0.85, side * d.topR * 0.95);
        S.add(mp(d, 0, d.topY - 2.2, side * (d.r + 0.05)), mp(d, lx, d.topY + 0.05, side * d.topR * 0.95), 0.03);
        const head = mp(d, d.tmX, upTop, side * 0.28);
        S.add(rim, head, 0.035); tms.push([rim, head]);
      }
      ratlines(S, tms, 0.42);
      if (d.tgTop) for (const lx of [0.25, -0.35]) S.add(mp(d, d.tmX + lx, d.ttY + 0.25, side * 0.88), mp(d, d.tgX, d.tgTop - 1.5, side * 0.12), 0.025);
      const bx = cx1 - 2.2, by = H.rail(bx) - 0.5;
      S.add(mp(d, d.tmX, upTop + 0.2, side * 0.25), V3(...H.P(bx, H.sAt(bx, by), side, 0.3)), 0.045);
      if (d.tgTop) { const bx2 = cx1 - 3.6, by2 = H.rail(bx2) - 0.5; S.add(mp(d, d.tgX, d.tgTop - 1.3, side * 0.1), V3(...H.P(bx2, H.sAt(bx2, by2), side, 0.3)), 0.035); }
    }
  }

  // ---------- бушприт и утлегарь ----------
  const BS0 = V3(15.2, 5.1, 0), BE = V3(27.0, 13.4, 0), JE = V3(31.9, 16.85, 0);
  const onBS = t => BS0.clone().lerp(BE, t);
  woodCylInto(rb, BS0, BE, 0.42, 0.27, M.spar, 12);
  woodCylInto(rb, onBS(0.72).add(V3(0, 0.32, 0)), JE, 0.18, 0.09, M.spar, 10);
  for (const t of [0.48, 0.62, 0.76, 0.98]) rb.add(cylBetween(onBS(t - 0.008), onBS(t + 0.008), lerp(0.42, 0.27, t) + 0.035, lerp(0.42, 0.27, t) + 0.035, 12), M.black);
  rb.add(new THREE.BoxGeometry(0.5, 0.9, 0.5), M.black, M4(BE.x, BE.y + 0.1, 0, 0, 0, -0.6));

  // ---------- штаги ----------
  S.add(mp(main, 0.45, main.topY - 0.25, 0), V3(fore.x - 0.7, fore.deck + 0.4, 0), 0.085);
  S.add(mp(main, main.tmX + 0.2, main.ttY - 0.25, 0), mp(fore, 0.3, fore.topY + 1.5, 0), 0.06);
  S.add(mp(main, main.tgX + 0.1, main.tgTop - 1.4, 0), mp(fore, fore.tmX + 0.1, fore.ttY + 0.2, 0), 0.04);
  S.add(mp(fore, 0.45, fore.topY - 0.25, 0), onBS(0.35), 0.08);
  const FT = mp(fore, fore.tmX + 0.2, fore.ttY - 0.25, 0), FTG = mp(fore, fore.tgX + 0.1, fore.tgTop - 1.4, 0);
  S.add(FT, BE, 0.055); S.add(FTG, JE, 0.04);
  S.add(mp(miz, 0.4, miz.topY - 0.25, 0), V3(main.x - 0.7, 3.6, 0), 0.06);
  S.add(mp(miz, miz.tmX + 0.1, miz.tmTop - 1.3, 0), mp(main, 0.2, main.topY + 0.8, 0), 0.04);
  for (const t of [0.6, 0.82]) S.add(onBS(t), V3(20.4 + (t - 0.6) * 3, 2.9 + (t - 0.6) * 4.5, 0), 0.06);
  for (const side of [1, -1]) S.add(onBS(0.7), V3(...H.P(16.0, H.sAt(16.0, H.rail(16.0) - 1.6), side, 0.1)), 0.045);

  // ---------- флагшток на корме ----------
  const es0 = V3(-15.9, H.deckY(-15.9, 3.5), 0), es1 = V3(-17.5, 15.0, 0);
  rb.add(new THREE.BoxGeometry(0.4, 0.3, 0.4), M.yard, M4(es0.x, es0.y + 0.15, 0));
  woodCylInto(rb, es0, es1, 0.08, 0.05, M.yard, 8);
  rb.add(new THREE.SphereGeometry(0.12, 10, 8), M.gold, M4(es1.x, es1.y, 0));
  rb.build(model);
  S.end();

  // ---------- блинд (под бушпритом) ----------
  {
    const yg = new THREE.Group(); yg.position.set(24.0, 10.45, 0); model.add(yg); yg.updateMatrix();
    buildYard(yg, 11, M);
    const sail = new SquareSail(yg, { wt: 10.4, wb: 11.6, h: 4.8, y0: -0.25, mat: sailMat(T.sail), rollMat: M.roll });
    RIG.square.push({ yard: yg, sail, level: -1, mast: null, yd: { L: 11 } });
  }

  // ---------- латинская бизань ----------
  {
    const pivot = new THREE.Group(); pivot.position.set(0.45, 14.4, 0); miz.g.add(pivot); pivot.updateMatrix();
    const yb = new Batch(), a = V3(5.5, -6.4, -0.45), c = V3(-6.5, 7.6, -0.45), mid = a.clone().lerp(c, 0.45);
    woodCylInto(yb, mid, a, 0.22, 0.1, M.yard, 10); woodCylInto(yb, mid, c, 0.22, 0.09, M.yard, 10);
    yb.build(pivot);
    const sail = new TriSail(pivot, sailMat(T.sail), true);
    RIG.lateen = { pivot, sail, A: V3(5.2, -6.1, -0.75), B: V3(-6.2, 7.25, -0.75), C: V3(-5.6, -4.8, -0.75) };
  }

  // ---------- кливера ----------
  for (const [A, B, C0] of [[BE.clone().lerp(FT, 0.05), BE.clone().lerp(FT, 0.8), V3(17.8, 9.4, 0)], [JE.clone().lerp(FTG, 0.04), JE.clone().lerp(FTG, 0.78), V3(22.4, 14.0, 0)]]) {
    const sail = new TriSail(model, sailMat(T.sail));
    const sheet = [-1, 1].map(s => { const x = 15.6; return V3(...H.P(x, H.sAt(x, H.rail(x)), s, 0)); });
    RIG.jibs.push({ A, B, C0, C: C0.clone(), sail, sheet });
  }

  // ---------- точки бегучего такелажа ----------
  const hullPt = (x, dy, side, off = 0.05) => V3(...H.P(x, H.sAt(x, H.rail(x) + dy), side, off));
  for (const e of RIG.square) {
    const d = e.mast, k = d ? d.key : 'sprit', lv = e.level;
    e.lift = []; e.brace = []; e.sheet = null;
    for (const side of [-1, 1]) {
      if (!d) { e.lift.push(BE.clone()); e.brace.push(hullPt(16.2, 0, side)); continue; }
      if (k === 'mizzen') { e.lift.push(mp(d, d.tmX, d.tmTop - 0.5, side * 0.15)); e.brace.push(hullPt(-15.6, 0, side)); continue; }
      if (lv === 0) e.lift.push(mp(d, 0, d.topY + 1.5, side * 0.35));
      else if (lv === 1) e.lift.push(mp(d, d.tmX, d.ttY + 0.45, side * 0.2));
      else e.lift.push(mp(d, d.tgX, d.tgTop - 0.3, side * 0.1));
      if (k === 'main') e.brace.push(lv === 0 ? hullPt(-6.6, 0.1, side) : lv === 1 ? mp(miz, 0, miz.topY + 0.5, side * 0.6) : mp(miz, miz.tmX, miz.tmTop - 1.0, side * 0.2));
      else e.brace.push(lv === 0 ? mp(main, 0, 11.5, side * 0.45) : lv === 1 ? mp(main, 0, main.topY + 1.0, side * 0.6) : mp(main, main.tmX, main.ttY - 0.5, side * 0.25));
    }
    if (d && lv === 0 && k !== 'mizzen') e.sheet = [-1, 1].map(side => hullPt(d.x - 5.2, 0.05, side));
  }
  RIG.lateen.sheet = [-1, 1].map(side => hullPt(-15.9, 0.1, side));

  // ---------- флаги ----------
  RIG.flags.push({ obj: main.g, top: main.staffTop.clone().add(V3(0, -0.1, 0)), bot: main.staffTop.clone().add(V3(0, -2.7, 0)), flag: new Flag(scene, T.flag, 18, 11, 4.4, 2.6) });
  for (const d of [fore, miz]) RIG.flags.push({ obj: d.g, top: d.staffTop.clone().add(V3(0, -0.1, 0)), bot: d.staffTop.clone().add(V3(0, -0.65, 0)), flag: new Flag(scene, T.pennant, 28, 3, 8, 0.55, 0.85) });
  RIG.flags.push({ obj: model, top: es0.clone().lerp(es1, 0.97), bot: es0.clone().lerp(es1, 0.7), flag: new Flag(scene, T.flag, 16, 10, 3.6, 2.2) });
  RIG.ready = true;
}

function rebuildDynRopes() {
  const R = RIG.dyn; R.begin();
  for (const e of RIG.square) {
    const half = e.yd.L / 2 * 0.97;
    for (let si = 0; si < 2; si++) {
      const side = si ? 1 : -1;
      const arm = toModel(e.yard, _t1.set(0, 0, side * half));
      R.add(arm, e.lift[si], 0.026);
      R.sag(arm, e.brace[si], 0.03, 0.18);
      if (e.sheet && e.sail.mesh.visible) {
        const o = e.sail.o, clew = toModel(e.yard, _t2.set(0.3, o.y0 - o.h * e.sail.set, side * o.wb / 2));
        R.sag(clew, e.sheet[si], 0.035, 0.12);
      }
    }
  }
  for (const j of RIG.jibs) if (j.sail.mesh.visible) R.sag(j.sail.clew, j.C.z > 0 ? j.sheet[1] : j.sheet[0], 0.03, 0.1);
  const L = RIG.lateen;
  if (L.sail.mesh.visible) { const c = toModel(L.pivot, _t3.copy(L.sail.clew)); R.sag(c, c.z > 0 ? L.sheet[1] : L.sheet[0], 0.03, 0.15); }
  R.end();
}

function updateRig(dt) {
  if (!RIG.ready) return;
  const t = STATE.t, storm = STATE.storm, h = SHIP.heading, wa = STATE.windAng;
  const ws = lerp(7, 21, storm);
  const fx = Math.cos(h), fz = -Math.sin(h), sx = Math.sin(h), sz = Math.cos(h);
  const Wx = Math.cos(wa) * ws, Wz = Math.sin(wa) * ws;
  const Ax = Wx - fx * SHIP.speed, Az = Wz - fz * SHIP.speed;
  const ax = Ax * fx + Az * fz, az = Ax * sx + Az * sz, A = Math.hypot(ax, az) + 1e-6, phi = Math.atan2(az, ax);
  Object.assign(RIG.wind, { ax, az, A, phi, ws, Wx, Wz });
  const q = clamp((A / 11) ** 2, 0.3, 1.5);
  RIG.brace += clamp(clamp(phi * 0.55, -0.62, 0.62) - RIG.brace, -dt * 0.16, dt * 0.16);
  const s = STATE.sail * (1 - 0.5 * smooth(0.55, 1, storm)), tgt = [smooth(0.3, 0.7, s), smooth(0.0, 0.4, s), smooth(0.6, 0.85, s)];
  let drive = 0;
  for (const e of RIG.square) {
    const beta = RIG.brace * (1 + 0.07 * Math.max(0, e.level));
    e.yard.rotation.y = -beta; e.yard.updateMatrix();
    const p = (ax * Math.cos(beta) + az * Math.sin(beta)) / A;
    const target = e.level < 0 ? smooth(0.45, 0.8, s) : tgt[e.level];
    e.sail.update(dt, target, p, q, t, storm, -SHIP.vPitch * 0.4);
    drive += e.sail.area * e.sail.set * Math.max(p, -0.3) * Math.cos(beta) * q;
  }
  const L = RIG.lateen;
  RIG.lat += clamp(clamp(phi * 0.45, -0.75, 0.75) - RIG.lat, -dt * 0.2, dt * 0.2);
  L.pivot.rotation.y = RIG.lat; L.pivot.updateMatrix();
  const pl = (ax * Math.sin(RIG.lat) + az * Math.cos(RIG.lat)) / A;
  L.sail.update(dt, L.A, L.B, L.C, _t4.set(0, 0, 1), smooth(0.2, 0.6, s), pl, q, t, storm);
  drive += L.sail.area * L.sail.set * Math.abs(pl) * 0.35 * q;
  for (const j of RIG.jibs) {
    j.C.copy(j.C0); j.C.z = 1.7 * Math.tanh(az / 3);
    const n = _t2.subVectors(j.B, j.A).cross(_t3.subVectors(j.C, j.A)).normalize();
    const pj = (n.x * ax + n.z * az) / A;
    j.sail.update(dt, j.A, j.B, j.C, n, smooth(0.1, 0.5, s), pj, q, t, storm);
    drive += j.sail.area * j.sail.set * Math.abs(pj) * 0.3 * q;
  }
  RIG.drive = drive;
  rebuildDynRopes();
  SHIP.root.updateMatrixWorld(true);
  const W = _t4.set(Wx, 0, Wz);
  for (const f of RIG.flags) {
    const top = SHIP.model.localToWorld(toModel(f.obj, _t1.copy(f.top)));
    const bot = SHIP.model.localToWorld(toModel(f.obj, _t2.copy(f.bot)));
    f.flag.step(dt, top, bot, W, t);
  }
}
