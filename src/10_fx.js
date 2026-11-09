// ===================== эффекты: залп, дым, брызги, след, отражение, дождь, молнии =====================
const SFX = { fire() {}, splash() {}, thunder() {}, slam() {} }; // заполняется на этапе звука
const FX = { shake: 0, queue: [], cool: { '-1': 0, '1': 0 }, balls: [], slamCool: 0, bowAcc: 0, gunLights: [], ready: false };
const PART_U = { uScale: { value: 600 }, uAmb: { value: new THREE.Color() }, uKey: { value: new THREE.Color() } };
const rnd = a => (Math.random() - 0.5) * 2 * a;
const _f1 = V3(), _f2 = V3(), _mz = V3(), _md = V3(), _sv = V3(), _c1 = new THREE.Color(), _bm = new THREE.Matrix4(), _ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// ---------- частицы ----------
const PART_VS = /* glsl */`
  attribute vec4 aCol; attribute float aSize; attribute float aRot;
  uniform float uScale;
  varying vec4 vCol; varying float vRot;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize <= 0.0 ? 0.0 : clamp(aSize * uScale / max(-mv.z, 0.1), 1.0, 900.0);
    vCol = aCol; vRot = aRot;
  }`;
const SMOKE_FS = /* glsl */`
  uniform sampler2D uNoise; uniform vec3 uAmb; uniform vec3 uKey; uniform float uFlash;
  varying vec4 vCol; varying float vRot;
  void main(){
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    vec2 q = mat2(c, -s, s, c) * p;
    float n = texture2D(uNoise, q * 0.55 + vec2(vRot * 0.13, vRot * 0.07)).r;
    float r = length(p) * 2.0;
    float a = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.7) * vCol.a;
    if (a < 0.003) discard;
    float top = clamp(0.5 - q.y, 0.0, 1.0);
    vec3 L = uAmb * 0.32 + uKey * 0.2 * (0.55 + 0.6 * top) + vec3(0.6, 0.65, 0.8) * uFlash;
    gl_FragColor = vec4(vCol.rgb * L * (0.85 + 0.3 * n), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const GLOW_FS = /* glsl */`
  varying vec4 vCol; varying float vRot;
  void main(){
    vec2 p = gl_PointCoord - 0.5;
    float a = exp(-dot(p, p) * 14.0) * vCol.a;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vCol.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

class Particles {
  constructor(max, additive) {
    this.max = max; this.head = 0;
    const g = new THREE.BufferGeometry(), dyn = a => a.setUsage(THREE.DynamicDrawUsage);
    this.P = new Float32Array(max * 3); this.C = new Float32Array(max * 4); this.S = new Float32Array(max); this.R = new Float32Array(max);
    g.setAttribute('position', dyn(new THREE.BufferAttribute(this.P, 3)));
    g.setAttribute('aCol', dyn(new THREE.BufferAttribute(this.C, 4)));
    g.setAttribute('aSize', dyn(new THREE.BufferAttribute(this.S, 1)));
    g.setAttribute('aRot', dyn(new THREE.BufferAttribute(this.R, 1)));
    this.g = g;
    this.V = new Float32Array(max * 3); this.age = new Float32Array(max).fill(1e9); this.life = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max); this.drag = new Float32Array(max);
    this.grav = new Float32Array(max); this.rv = new Float32Array(max); this.base = new Float32Array(max * 3); this.fin = new Float32Array(max); this.wk = new Float32Array(max);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: PART_U.uScale, uNoise: SKY_UNIFORMS.uNoise, uAmb: PART_U.uAmb, uKey: PART_U.uKey, uFlash: SKY_UNIFORMS.uFlash },
      vertexShader: PART_VS, fragmentShader: additive ? GLOW_FS : SMOKE_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 12 : 10;
    scene.add(this.pts);
  }
  spawn(x, y, z, vx, vy, vz, o) {
    const i = this.head, i3 = i * 3; this.head = (i + 1) % this.max;
    this.P[i3] = x; this.P[i3 + 1] = y; this.P[i3 + 2] = z;
    this.V[i3] = vx; this.V[i3 + 1] = vy; this.V[i3 + 2] = vz;
    this.age[i] = 0; this.life[i] = o.life; this.s0[i] = o.s0; this.s1[i] = o.s1; this.a0[i] = o.a;
    this.drag[i] = o.drag ?? 0; this.grav[i] = o.grav ?? 0; this.rv[i] = rnd(o.spin ?? 0.5); this.R[i] = Math.random() * TAU;
    this.base[i3] = o.r; this.base[i3 + 1] = o.g; this.base[i3 + 2] = o.b; this.fin[i] = o.fin ?? 0.05; this.wk[i] = o.wind ?? 1;
  }
  update(dt, wx, wz) {
    const { P, V, C, S, R } = this;
    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3, i4 = i * 4;
      if (this.age[i] >= this.life[i]) { if (S[i] !== 0) { S[i] = 0; C[i4 + 3] = 0; } continue; }
      const a = (this.age[i] += dt), t = Math.min(1, a / this.life[i]);
      const k = 1 - Math.exp(-this.drag[i] * dt), w = this.wk[i];
      V[i3] += (wx * w - V[i3]) * k; V[i3 + 2] += (wz * w - V[i3 + 2]) * k; V[i3 + 1] += -V[i3 + 1] * k - this.grav[i] * dt;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      if (this.grav[i] > 2 && P[i3 + 1] < -1.5) { this.age[i] = this.life[i]; S[i] = 0; C[i4 + 3] = 0; continue; }
      const e = 1 - (1 - t) * (1 - t);
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
      R[i] += this.rv[i] * dt;
      C[i4] = this.base[i3]; C[i4 + 1] = this.base[i3 + 1]; C[i4 + 2] = this.base[i3 + 2];
      C[i4 + 3] = this.a0[i] * Math.min(1, t / this.fin[i]) * (1 - t) * Math.sqrt(1 - t);
    }
    for (const n of ['position', 'aCol', 'aSize', 'aRot']) this.g.attributes[n].needsUpdate = true;
  }
}

// ---------- след на воде (рендер в текстуру сверху) ----------
const WAKE = { res: 1024, size: 560, trail: [], rings: [], acc: 0, max: 70000, n: 0 };
const WAKE_VS = /* glsl */`
  attribute float aFoam; attribute vec2 aSlope; attribute float aAlpha; uniform float uK;
  varying float vF; varying vec2 vS; varying float vA;
  void main(){ vF = aFoam; vS = aSlope; vA = clamp(aAlpha * uK, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WAKE_FS = /* glsl */`
  varying float vF; varying vec2 vS; varying float vA;
  void main(){ gl_FragColor = vec4(vF, 0.5 + vS.x, 0.5 + vS.y, vA); }`;
function wakeMaterial() {
  return new THREE.ShaderMaterial({ uniforms: { uK: { value: 1 } }, vertexShader: WAKE_VS, fragmentShader: WAKE_FS, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });
}
function hullFoamGeo() {
  const H = HULLDEF, S = [];
  for (let x = H.X0; x < H.X1 - 0.3; x += 0.5) { const p = H.P(x, H.sAt(x, 0.15), 1); S.push([p[0], p[2]]); }
  const loop = [...S, [H.X1 + 0.6, 0], ...S.slice().reverse().map(([x, z]) => [x, -z])];
  const n = loop.length, pos = [], foam = [], slope = [], alpha = [], idx = [];
  for (let i = 0; i < n; i++) {
    const [px, pz] = loop[i], a = loop[(i + n - 1) % n], b = loop[(i + 1) % n];
    let nx = b[1] - a[1], nz = -(b[0] - a[0]); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const ax = clamp(px, H.X0 + 2, H.X1 - 3);
    if (nx * (px - ax) + nz * pz < 0) { nx = -nx; nz = -nz; }
    const w = 0.8 + 2.8 * smooth(9, 17.8, px) + 1.4 * smooth(-12, -16.6, px);
    const I = Math.min(1, 0.35 + 0.65 * smooth(8, 17, px) + 0.4 * smooth(-13, -16.4, px));
    for (const [o, al, f, sg] of [[-0.3, I, 1, 0], [0.45, I * 0.75, 0.8, 0.3], [1, 0, 0.5, 0.15]]) {
      pos.push(px + nx * w * o, 0, pz + nz * w * o); foam.push(f); slope.push(nx * sg, nz * sg); alpha.push(al);
    }
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; for (let r = 0; r < 2; r++) { const a = i * 3 + r, b = j * 3 + r; idx.push(a, b, a + 1, a + 1, b, b + 1); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
  g.setAttribute('aSlope', new THREE.Float32BufferAttribute(slope, 2));
  g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alpha, 1));
  g.setIndex(idx); return g;
}
function initWake() {
  WAKE.rt = new THREE.WebGLRenderTarget(WAKE.res, WAKE.res, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  WAKE.scene = new THREE.Scene();
  const h = WAKE.size / 2; WAKE.cam = new THREE.OrthographicCamera(-h, h, h, -h, 1, 300); WAKE.cam.up.set(0, 0, -1);
  const M = WAKE.max, g = new THREE.BufferGeometry(), dyn = a => a.setUsage(THREE.DynamicDrawUsage);
  WAKE.P = new Float32Array(M * 3); WAKE.F = new Float32Array(M); WAKE.S = new Float32Array(M * 2); WAKE.A = new Float32Array(M);
  g.setAttribute('position', dyn(new THREE.BufferAttribute(WAKE.P, 3)));
  g.setAttribute('aFoam', dyn(new THREE.BufferAttribute(WAKE.F, 1)));
  g.setAttribute('aSlope', dyn(new THREE.BufferAttribute(WAKE.S, 2)));
  g.setAttribute('aAlpha', dyn(new THREE.BufferAttribute(WAKE.A, 1)));
  WAKE.geo = g;
  const dynMesh = new THREE.Mesh(g, wakeMaterial()); dynMesh.frustumCulled = false; dynMesh.renderOrder = 0;
  WAKE.hull = new THREE.Mesh(hullFoamGeo(), wakeMaterial()); WAKE.hull.frustumCulled = false; WAKE.hull.renderOrder = 1;
  WAKE.scene.add(dynMesh, WAKE.hull);
  OCEAN_UNIFORMS.uWake.value = WAKE.rt.texture;
}
function wv(v) {
  const n = WAKE.n; if (n >= WAKE.max) return;
  WAKE.P[n * 3] = v[0]; WAKE.P[n * 3 + 1] = 0; WAKE.P[n * 3 + 2] = v[1];
  WAKE.F[n] = v[2]; WAKE.S[n * 2] = v[3]; WAKE.S[n * 2 + 1] = v[4]; WAKE.A[n] = v[5]; WAKE.n++;
}
function wStrip(A, B) { for (let k = 0; k < A.length - 1; k++) { wv(A[k]); wv(B[k]); wv(A[k + 1]); wv(A[k + 1]); wv(B[k]); wv(B[k + 1]); } }

function updateWake(dt) {
  const t = STATE.t, h = SHIP.heading, ch = Math.cos(h), sh = Math.sin(h), P = SHIP.pos;
  const now = { sx: P.x - ch * 16, sz: P.z + sh * 16, bx: P.x + ch * 17, bz: P.z - sh * 17, h, v: SHIP.speed, t };
  WAKE.acc += dt;
  if (WAKE.acc > 0.25) { WAKE.acc = 0; WAKE.trail.unshift(now); }
  while (WAKE.trail.length && t - WAKE.trail[WAKE.trail.length - 1].t > 75) WAKE.trail.pop();
  const list = [now, ...WAKE.trail];
  WAKE.n = 0;
  // турбулентный след за кормой
  let prev = null;
  for (const p of list) {
    const a = t - p.t, vf = Math.min(1, Math.max(p.v, 0) / 5.5);
    const w = Math.min(18, 2.6 + a * 0.5) * (0.6 + 0.4 * vf), I = Math.pow(vf, 1.2) * Math.exp(-a / 16) * 0.8;
    const Lx = Math.sin(p.h), Lz = Math.cos(p.h);
    const cs = [[-1, 0], [-0.45, 0.9], [0, 1], [0.45, 0.9], [1, 0]].map(([o, k]) => [p.sx + Lx * w * o, p.sz + Lz * w * o, 1, 0, 0, I * k]);
    if (prev) wStrip(prev, cs); prev = cs;
  }
  // расходящиеся волны Кельвина (по две гряды на борт)
  for (const s of [-1, 1]) for (const [kd, ki] of [[1, 1], [0.8, 0.55]]) {
    prev = null;
    for (const p of list) {
      const a = t - p.t, vf = Math.min(1, Math.max(p.v, 0) / 5.5);
      const d = 0.354 * Math.max(p.v, 0) * a * kd + 1.5, nx = Math.sin(p.h) * s, nz = Math.cos(p.h) * s;
      const cx = p.bx + nx * d, cz = p.bz + nz * d, aw = 1.0 + a * 0.08;
      const I = vf * Math.exp(-a / 18) * 0.38 * ki * Math.min(1, a / 1.5), sl = 0.32;
      const cs = [[-1, 0, 0], [-0.25, I, -sl], [0.25, I, sl], [1, 0, 0]].map(([o, al, sg]) => [cx + nx * aw * o, cz + nz * aw * o, 0.45, nx * sg, nz * sg, al]);
      if (prev) wStrip(prev, cs); prev = cs;
    }
  }
  // кольца от падения ядер
  for (const r of WAKE.rings) r.t += dt;
  WAKE.rings = WAKE.rings.filter(r => r.t < 9);
  for (const r of WAKE.rings) {
    const R = 1.5 + r.t * 2.6, w = 0.8 + r.t * 0.3, I = Math.exp(-r.t / 2.8) * 0.9 * r.k, N = 36;
    let pr = null;
    for (let j = 0; j <= N; j++) {
      const an = j / N * TAU, nx = Math.cos(an), nz = Math.sin(an);
      const cs = [[R - w, 0, 0], [R, I, 0.3], [R + w, 0, 0]].map(([rr, al, sg]) => [r.x + nx * rr, r.z + nz * rr, 1, nx * sg, nz * sg, al]);
      if (pr) wStrip(pr, cs); pr = cs;
    }
    if (r.t < 2) {
      const ca = (1 - r.t / 2) * 0.9 * r.k, Rd = R * 0.8;
      for (let j = 0; j < N; j++) {
        const a0 = j / N * TAU, a1 = (j + 1) / N * TAU;
        wv([r.x, r.z, 1, 0, 0, ca]); wv([r.x + Math.cos(a0) * Rd, r.z + Math.sin(a0) * Rd, 1, 0, 0, 0]); wv([r.x + Math.cos(a1) * Rd, r.z + Math.sin(a1) * Rd, 1, 0, 0, 0]);
      }
    }
  }
  const g = WAKE.geo;
  for (const n of ['position', 'aFoam', 'aSlope', 'aAlpha']) g.attributes[n].needsUpdate = true;
  g.setDrawRange(0, WAKE.n);
  // пена вокруг корпуса и носовой бурун
  WAKE.hull.position.set(P.x, 0, P.z); WAKE.hull.rotation.y = h;
  WAKE.hull.material.uniforms.uK.value = 0.25 + clamp(SHIP.speed / 6, 0, 1.2) * (0.7 + STATE.storm * 0.5);
}
function renderWake() {
  const tx = WAKE.size / WAKE.res, cx = Math.round(SHIP.pos.x / tx) * tx, cz = Math.round(SHIP.pos.z / tx) * tx;
  WAKE.cam.position.set(cx, 100, cz); WAKE.cam.lookAt(cx, 0, cz); WAKE.cam.updateMatrixWorld();
  OCEAN_UNIFORMS.uWakeMat.value.multiplyMatrices(WAKE.cam.projectionMatrix, WAKE.cam.matrixWorldInverse);
  renderer.setRenderTarget(WAKE.rt); renderer.setClearColor(0x000000, 0);
  renderer.render(WAKE.scene, WAKE.cam);
  renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1);
}

// ---------- отражение корабля в воде (зеркальная камера под водой) ----------
const REFL = { rt: null, cam: new THREE.PerspectiveCamera(), clip: [new THREE.Plane(V3(0, 1, 0), 0.3)] };
const _ru = V3(), _rf = V3(), _dbs = new THREE.Vector2();
function resizeRefl() { renderer.getDrawingBufferSize(_dbs); REFL.rt.setSize(Math.max(2, _dbs.x >> 1), Math.max(2, _dbs.y >> 1)); }
function initRefl() {
  const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  REFL.rt = new THREE.WebGLRenderTarget(2, 2, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType });
  resizeRefl();
  OCEAN_UNIFORMS.uReflTex.value = REFL.rt.texture; OCEAN_UNIFORMS.uReflOn.value = 1;
  SHIP.root.traverse(o => o.layers.enable(1));
  for (const f of RIG.flags) f.flag.mesh.layers.enable(1);
  light.dir.layers.enable(1); light.hemi.layers.enable(1);
}
function renderReflection() {
  const c = REFL.cam;
  c.fov = camera.fov; c.aspect = camera.aspect; c.near = camera.near; c.far = camera.far; c.updateProjectionMatrix();
  const e = camera.matrixWorld.elements;
  _ru.set(e[4], -e[5], e[6]); _rf.set(-e[8], e[9], -e[10]);
  c.position.set(camera.position.x, -camera.position.y, camera.position.z);
  c.up.copy(_ru); c.lookAt(_rf.add(c.position)); c.layers.set(1); c.updateMatrixWorld();
  OCEAN_UNIFORMS.uReflMat.value.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  renderer.setRenderTarget(REFL.rt); renderer.setClearColor(0x000000, 0);
  renderer.clippingPlanes = REFL.clip; renderer.shadowMap.autoUpdate = false;
  renderer.render(scene, c);
  renderer.clippingPlanes = []; renderer.shadowMap.autoUpdate = true;
  renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1);
}

// ---------- дождь ----------
const RAIN = { N: 9000, mesh: null };
function initRain() {
  const N = RAIN.N, seed = new Float32Array(N * 6), end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { const a = Math.random(), b = Math.random(), c = Math.random(); for (let k = 0; k < 2; k++) { seed.set([a, b, c], (i * 2 + k) * 3); end[i * 2 + k] = k; } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCam: { value: V3() }, uVel: { value: V3(0, -26, 0) }, uBox: { value: 70 }, uCol: { value: new THREE.Color() }, uAlpha: { value: 0.45 } },
    vertexShader: /* glsl */`
      attribute vec3 aSeed; attribute float aEnd;
      uniform float uTime; uniform vec3 uCam; uniform vec3 uVel; uniform float uBox;
      varying float vFade;
      void main(){
        vec3 q = aSeed * uBox + uVel * uTime;
        vec3 o = uCam - uBox * 0.5;
        vec3 w = o + mod(q - o, uBox);
        w -= uVel * 0.028 * aEnd;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        vFade = (1.0 - aEnd * 0.85) * smoothstep(uBox * 0.5, uBox * 0.12, length(w - uCam));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uAlpha; varying float vFade;
      void main(){ gl_FragColor = vec4(uCol, uAlpha * vFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  RAIN.mesh = new THREE.LineSegments(g, mat); RAIN.mesh.frustumCulled = false; RAIN.mesh.renderOrder = 11;
  scene.add(RAIN.mesh);
}
function updateRain() {
  const r = smooth(0.42, 0.85, STATE.storm), m = RAIN.mesh, u = m.material.uniforms;
  m.visible = r > 0.01; if (!m.visible) return;
  m.geometry.setDrawRange(0, Math.floor(RAIN.N * r) * 2);
  u.uTime.value = STATE.t; u.uCam.value.copy(camera.position);
  u.uVel.value.set(RIG.wind.Wx * 0.7, -26, RIG.wind.Wz * 0.7);
  u.uCol.value.copy(light.amb).multiplyScalar(0.55).add(_c1.copy(light.keyCol).multiplyScalar(0.06));
  u.uCol.value.r += STATE.flash * 2.5; u.uCol.value.g += STATE.flash * 2.7; u.uCol.value.b += STATE.flash * 3.2;
}

// ---------- молнии ----------
const LIGHTNING = { next: 5, group: null, t0: 0, k: 1, pulses: [], dir: V3(0, 1, 0) };
function boltPath(a, b, w, depth, out) {
  const n = depth === 0 ? 22 : 10, len = a.distanceTo(b);
  let prev = a.clone();
  for (let i = 1; i <= n; i++) {
    const t = i / n, q = a.clone().lerp(b, t);
    if (i < n) q.add(V3(rnd(1), rnd(0.25), rnd(1)).multiplyScalar(len * (depth ? 0.09 : 0.05)));
    out.push([prev, q, w * (1 - 0.5 * t)]);
    if (depth < 2 && i < n - 2 && Math.random() < (depth ? 0.12 : 0.28)) {
      const dir = q.clone().sub(prev).normalize();
      const be = q.clone().add(V3(dir.x + rnd(1.2), dir.y * 0.5 - 0.25, dir.z + rnd(1.2)).normalize().multiplyScalar(len * (0.12 + Math.random() * 0.2)));
      boltPath(q.clone(), be, w * 0.45, depth + 1, out);
    }
    prev = q;
  }
}
function boltGeo(segs, wm, cam) {
  const pos = new Float32Array(segs.length * 18); let o = 0;
  const d = V3(), v = V3(), s = V3();
  for (const [a, b, w] of segs) {
    d.subVectors(b, a); v.subVectors(cam, a); s.crossVectors(d, v).normalize().multiplyScalar(w * wm * 0.5);
    const q = [a.x - s.x, a.y - s.y, a.z - s.z, a.x + s.x, a.y + s.y, a.z + s.z, b.x + s.x, b.y + s.y, b.z + s.z, b.x - s.x, b.y - s.y, b.z - s.z];
    for (const k of [0, 1, 2, 0, 2, 3]) { pos[o++] = q[k * 3]; pos[o++] = q[k * 3 + 1]; pos[o++] = q[k * 3 + 2]; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return g;
}
function strike() {
  const fwd = camera.getWorldDirection(_f1), yaw = Math.atan2(fwd.x, fwd.z) + rnd(0.9), dist = 380 + Math.random() * 1100;
  const gx = camera.position.x + Math.sin(yaw) * dist, gz = camera.position.z + Math.cos(yaw) * dist;
  const segs = []; boltPath(V3(gx + rnd(120), 430 + Math.random() * 100, gz + rnd(120)), V3(gx, -2, gz), 3.5, 0, segs);
  if (LIGHTNING.group) { scene.remove(LIGHTNING.group); LIGHTNING.group.children.forEach(m => m.geometry.dispose()); }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(boltGeo(segs, 1, camera.position), LIGHTNING.core), new THREE.Mesh(boltGeo(segs, 7, camera.position), LIGHTNING.glowM));
  g.children.forEach(m => { m.frustumCulled = false; m.renderOrder = 13; });
  scene.add(g);
  LIGHTNING.group = g; LIGHTNING.t0 = STATE.t; LIGHTNING.k = clamp(1.4 - dist / 1500, 0.4, 1);
  const r = Math.random();
  LIGHTNING.pulses = r < 0.4 ? [[0, 0.08], [0.13, 0.22]] : r < 0.8 ? [[0, 0.06], [0.1, 0.17], [0.26, 0.36]] : [[0, 0.1], [0.15, 0.2], [0.24, 0.3], [0.42, 0.5]];
  LIGHTNING.dir.set(gx - SHIP.pos.x, 250, gz - SHIP.pos.z).normalize();
  SFX.thunder(dist / 340, LIGHTNING.k);
}
function updateLightning(dt) {
  if (STATE.storm > 0.62) {
    LIGHTNING.next -= dt;
    if (LIGHTNING.next <= 0) { strike(); LIGHTNING.next = lerp(16, 4, smooth(0.62, 1, STATE.storm)) * (0.5 + Math.random()); }
  }
  const G = LIGHTNING.group;
  if (G) {
    const tt = STATE.t - LIGHTNING.t0; let on = false;
    for (const [a, b] of LIGHTNING.pulses) if (tt >= a && tt < b) on = true;
    G.visible = on;
    if (on) STATE.flash = Math.max(STATE.flash, 0.95 * LIGHTNING.k);
    if (tt > 0.7) { scene.remove(G); G.children.forEach(m => m.geometry.dispose()); LIGHTNING.group = null; }
  }
  FX.flashLight.intensity = STATE.flash * 4;
  FX.flashLight.position.copy(SHIP.pos).addScaledVector(LIGHTNING.dir, 120);
  FX.flashLight.target.position.copy(SHIP.pos);
}

// ---------- залп ----------
function shipVel(out) { return out.set(Math.cos(SHIP.heading) * SHIP.speed, 0, -Math.sin(SHIP.heading) * SHIP.speed); }
function broadside(side) {
  if (!FX.ready) return;
  if (FX.cool[side] > 0) { toast('Пушки перезаряжаются…'); return; }
  FX.cool[side] = 4;
  const C = DET.cannons, list = C.ports.map((p, i) => ({ p, i })).filter(o => o.p.side === side);
  list.sort((a, b) => b.p.x - a.p.x || a.p.deck - b.p.deck);
  list.forEach((o, k) => FX.queue.push({ t: STATE.t + k * 0.07 + Math.random() * 0.05, i: o.i }));
  toast(side < 0 ? 'Залп левым бортом!' : 'Залп правым бортом!');
}
function fireCannon(i) {
  const C = DET.cannons, m = C.base[i], s = C.scale[i], side = C.ports[i].side;
  _mz.set(0, 0, 0.8).applyMatrix4(m); SHIP.model.localToWorld(_mz);
  _md.set(0, 0, 1).transformDirection(m).transformDirection(SHIP.model.matrixWorld);
  C.vel[i] = 3.2 * s;
  const vs = shipVel(_sv);
  // вспышка и искры
  FX.glow.spawn(_mz.x, _mz.y, _mz.z, vs.x, 0, vs.z, { life: 0.11, s0: 2.5 * s, s1: 4.5 * s, a: 1, r: 40, g: 20, b: 7, fin: 0.01, wind: 0 });
  FX.glow.spawn(_mz.x + _md.x * 1.2, _mz.y + _md.y * 1.2, _mz.z + _md.z * 1.2, vs.x + _md.x * 8, _md.y * 8, vs.z + _md.z * 8, { life: 0.16, s0: 1.8 * s, s1: 3.4 * s, a: 0.9, r: 30, g: 12, b: 3, fin: 0.01, wind: 0 });
  for (let k = 0; k < 12; k++) {
    const sp = 18 + Math.random() * 30;
    FX.glow.spawn(_mz.x, _mz.y, _mz.z, vs.x + (_md.x + rnd(0.35)) * sp, (_md.y + rnd(0.3) + 0.1) * sp, vs.z + (_md.z + rnd(0.35)) * sp,
      { life: 0.25 + Math.random() * 0.5, s0: 0.22, s1: 0.08, a: 1, r: 25, g: 9, b: 2, grav: 9.8, drag: 0.8, wind: 0, fin: 0.01 });
  }
  // клубы порохового дыма
  for (let k = 0; k < 9; k++) {
    const sp = 6 + Math.random() * 16, f = Math.random();
    FX.smoke.spawn(_mz.x + _md.x * f * 1.5, _mz.y, _mz.z + _md.z * f * 1.5,
      vs.x + (_md.x + rnd(0.3)) * sp, (_md.y + rnd(0.25) + 0.08) * sp, vs.z + (_md.z + rnd(0.3)) * sp,
      { life: 7 + Math.random() * 6, s0: 1.2 + Math.random(), s1: 7 + Math.random() * 6, a: 0.8, r: 0.78, g: 0.76, b: 0.72, drag: 1.4, grav: -0.25, fin: 0.03, spin: 0.6 });
  }
  // ядро
  const ball = FX.balls.find(b => !b.on);
  if (ball) {
    const sp = 80 + Math.random() * 15, el = 0.03 + Math.random() * 0.12;
    _f1.copy(_md).applyAxisAngle(_UP, rnd(0.05)); _f1.y += el; _f1.normalize().multiplyScalar(sp).add(vs);
    ball.v.copy(_f1); ball.p.copy(_mz).addScaledVector(_md, 0.6); ball.on = true; ball.t = 0;
  }
  const gl = FX.gunLights[side > 0 ? 0 : 1]; gl.k = 1; gl.L.position.copy(_mz).addScaledVector(_md, 1.5);
  SHIP.vRoll -= side * 0.005; FX.shake = Math.min(1.2, FX.shake + 0.1);
  SFX.fire(_mz, s);
}
function splash(x, y, z, k = 1) {
  for (let i = 0; i < 40 * k; i++) {
    const a = Math.random() * TAU, r = Math.random(), up = 6 + Math.random() * 12 * k, hs = 1.2 + r * 2.8;
    FX.spray.spawn(x + Math.cos(a) * r * 0.8, y, z + Math.sin(a) * r * 0.8, Math.cos(a) * hs, up, Math.sin(a) * hs,
      { life: 1.3 + Math.random(), s0: 0.6, s1: 2.0 + Math.random() * 1.5, a: 0.85, r: 0.93, g: 0.95, b: 0.97, grav: 9.81, drag: 0.15, wind: 0.3, fin: 0.04, spin: 1.5 });
  }
  for (let i = 0; i < 7; i++) FX.spray.spawn(x + rnd(1.5), y + 1 + Math.random() * 3, z + rnd(1.5), rnd(1), 1 + Math.random() * 1.5, rnd(1),
    { life: 3.5, s0: 3, s1: 11, a: 0.28, r: 0.9, g: 0.93, b: 0.96, drag: 0.8, grav: -0.2, fin: 0.1 });
  WAKE.rings.push({ x, z, t: 0, k });
  SFX.splash(V3(x, y, z), k);
}
// брызги у носа: удар в волну или просто свежий ход
function bowSpray(k, n = Math.round(60 * k)) {
  const vs = shipVel(_sv), ch = Math.cos(SHIP.heading), sh = Math.sin(SHIP.heading);
  for (let i = 0; i < n; i++) {
    const side = Math.random() < 0.5 ? -1 : 1, x = 14 + Math.random() * 3.5;
    _f1.set(x, 0.6 + Math.random() * 0.8, side * (HULLDEF.B(x) * 0.7 + 0.3)); SHIP.model.localToWorld(_f1);
    const ox = Math.sin(SHIP.heading) * side, oz = Math.cos(SHIP.heading) * side;
    const up = 3 + Math.random() * 7 * k + k * 4, os = 2 + Math.random() * 5 * (0.4 + k), fw = Math.random() * 2;
    FX.spray.spawn(_f1.x, _f1.y, _f1.z, vs.x * 0.8 + ox * os + ch * fw, up, vs.z * 0.8 + oz * os - sh * fw,
      { life: 1.0 + Math.random() * 0.9, s0: 0.4 + k * 0.4, s1: 1.4 + k * 2.5, a: 0.75, r: 0.93, g: 0.95, b: 0.97, grav: 9.81, drag: 0.3, wind: 0.4, fin: 0.04, spin: 2 });
  }
}

function updatePartScale() { renderer.getDrawingBufferSize(_dbs); PART_U.uScale.value = _dbs.y * 0.5 / Math.tan(camera.fov * PI / 360); }

function initFX() {
  FX.smoke = new Particles(3500, false); FX.spray = new Particles(3000, false); FX.glow = new Particles(1200, true);
  updatePartScale();
  FX.ballMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 10, 8), SHIP.M.gunIron, 80);
  FX.ballMesh.frustumCulled = false; FX.ballMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < 80; i++) { FX.ballMesh.setMatrixAt(i, _ZERO); FX.balls.push({ on: false, p: V3(), v: V3(), t: 0 }); }
  scene.add(FX.ballMesh);
  for (let i = 0; i < 2; i++) { const L = new THREE.PointLight(0xffb060, 0, 60, 2); L.layers.enable(1); scene.add(L); FX.gunLights.push({ L, k: 0 }); }
  FX.flashLight = new THREE.DirectionalLight(0xc8d4ff, 0); FX.flashLight.layers.enable(1); scene.add(FX.flashLight, FX.flashLight.target);
  LIGHTNING.core = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 9.5, 13), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  LIGHTNING.glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.42, 0.9), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  initWake(); initRefl(); initRain();
  FX.ready = true;
}

function updateFX(dt) {
  if (!FX.ready) return;
  SHIP.root.updateMatrixWorld(true);
  // очередь выстрелов залпа
  for (let k = FX.queue.length - 1; k >= 0; k--) if (STATE.t >= FX.queue[k].t) { fireCannon(FX.queue[k].i); FX.queue.splice(k, 1); }
  FX.cool['-1'] -= dt; FX.cool['1'] -= dt;
  for (const g of FX.gunLights) { g.k = Math.max(0, g.k - dt * 12); g.L.intensity = g.k * g.k * 800; }
  // ядра
  let bi = 0;
  for (const b of FX.balls) {
    if (b.on) {
      b.t += dt; b.v.y -= 9.81 * dt; b.p.addScaledVector(b.v, dt);
      if (Math.random() < 0.6) FX.smoke.spawn(b.p.x, b.p.y, b.p.z, 0, 0, 0, { life: 1.2, s0: 0.25, s1: 1.1, a: 0.22, r: 0.8, g: 0.8, b: 0.78, drag: 2, fin: 0.05 });
      if (b.t > 0.3) { const wh = waterHeight(b.p.x, b.p.z); if (b.p.y < wh) { splash(b.p.x, wh, b.p.z, 1); b.on = false; } }
      if (b.t > 8) b.on = false;
    }
    FX.ballMesh.setMatrixAt(bi++, b.on ? _bm.makeTranslation(b.p.x, b.p.y, b.p.z) : _ZERO);
  }
  FX.ballMesh.instanceMatrix.needsUpdate = true;
  // брызги у носа
  FX.slamCool -= dt;
  if (SHIP.slam > 0.35 && FX.slamCool <= 0) { FX.slamCool = 0.9; bowSpray(SHIP.slam); SFX.slam(SHIP.slam); }
  FX.bowAcc += Math.max(0, SHIP.speed - 4) * (0.3 + STATE.storm * 2) * 3 * dt;
  while (FX.bowAcc > 1) { FX.bowAcc--; bowSpray(0.15, 1); }
  // частицы
  const wx = RIG.wind.Wx * 0.5, wz = RIG.wind.Wz * 0.5;
  FX.smoke.update(dt, wx, wz); FX.spray.update(dt, wx, wz); FX.glow.update(dt, wx, wz);
  PART_U.uAmb.value.copy(light.amb); PART_U.uKey.value.copy(light.keyCol);
  updateWake(dt); updateRain(); updateLightning(dt);
}
function applyShake(dt) {
  if (FX.shake <= 0.001) return;
  const s = FX.shake * 0.35;
  camera.position.x += rnd(s); camera.position.y += rnd(s); camera.position.z += rnd(s);
  FX.shake = Math.max(0, FX.shake - dt * 2.2);
}
