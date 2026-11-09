// ===================== мир: острова, прибой, маяк, чайки =====================
const ISLANDS = [], GULLS = { list: [], vis: 0 }, WORLD = { recycle: 0, lighthouse: null, shoalToast: 0 };

function palmGeo() {
  const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(V3(Math.sin(t * 1.3) * 1.1 * t, t * 8.5, 0)); }
  const trunk = varTube(pts, t => lerp(0.3, 0.17, t) * (1 + 0.12 * Math.sin(t * 60)), 7, 14).g;
  const top = pts[6], leaves = [], nuts = [trunk];
  for (let k = 0; k < 11; k++) {
    const a = k / 11 * TAU + Math.sin(k * 7.3) * 0.25, dx = Math.cos(a), dz = Math.sin(a), L = 4.2 + (k % 3) * 0.7;
    leaves.push(gridGeo(8, 2, (u, v) => {
      const x = u * L, w = Math.sin(PI * Math.min(1, u * 1.1)) * 1.15 * (v * 2 - 1);
      const y = 0.32 * x - x * x * 0.085 + Math.abs(w) * 0.35;
      return [top.x + dx * x - dz * w, top.y + y, top.z + dz * x + dx * w, u, v];
    }));
  }
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU, s = new THREE.SphereGeometry(0.22, 5, 4); s.translate(top.x + Math.cos(a) * 0.3, top.y - 0.35, top.z + Math.sin(a) * 0.3); nuts.push(s); }
  return { trunk: mergeGeos(nuts), leaf: mergeGeos(leaves) };
}

function makeSurfMat() {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({}, SKY_UNIFORMS, OCEAN_UNIFORMS),
    vertexShader: /* glsl */`
      uniform vec2 uCenter; uniform float uTime;
      ${GERSTNER_GLSL}
      attribute float aT;
      varying float vT; varying vec2 vP; varying float vD;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec2 p = w.xz; float dist = length(p - uCenter);
        vec3 d, n; float j; gerstner(p, dist, uTime, d, n, j);
        vec3 wp = vec3(p.x + d.x, d.y + 0.06, p.y + d.z);
        vT = aT; vP = p; vD = length(cameraPosition - wp);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uNoise; uniform float uTime; uniform vec3 uAmb; uniform vec3 uLightCol; uniform vec3 uFogCol; uniform float uFogDen;
      varying float vT; varying vec2 vP; varying float vD;
      void main(){
        float n = texture2D(uNoise, vP * 0.035 + vec2(uTime * 0.008, 0.0)).g;
        float n2 = texture2D(uNoise, vP * 0.11 - vec2(0.0, uTime * 0.015)).b;
        float wave = 0.5 + 0.5 * sin(vT * 14.0 - uTime * 1.3 + n * 7.0);
        float a = (1.0 - vT) * smoothstep(0.42, 0.75, wave * 0.55 + n2 * 0.6) * 0.9;
        a = max(a, smoothstep(0.25, 0.0, vT) * 0.7 * (0.5 + n2));
        vec3 c = uAmb * 1.25 + uLightCol * 0.09;
        float fog = 1.0 - exp(-vD * uFogDen);
        c = mix(c, uFogCol, fog);
        gl_FragColor = vec4(c, a * (1.0 - fog * 0.7));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

function makeLighthouse(M) {
  const g = new THREE.Group(), b = new Batch();
  const [c, gx] = mkCanvas(64, 256);
  for (let i = 0; i < 6; i++) { gx.fillStyle = i % 2 ? '#e8e2d6' : '#a8241a'; gx.fillRect(0, i * 256 / 6, 64, 256 / 6 + 1); }
  noiseOverlay(gx, 64, 256, 0.12, 4);
  const stripe = new THREE.MeshStandardMaterial({ map: canvasTex(c), roughness: 0.75 });
  b.add(new THREE.CylinderGeometry(3.4, 3.9, 2.4, 16), M.stone, M4(0, 1.2, 0));
  b.add(new THREE.CylinderGeometry(1.7, 2.7, 18, 18, 1, true), stripe, M4(0, 11.4, 0));
  b.add(new THREE.CylinderGeometry(2.8, 2.6, 0.45, 18), M.dark, M4(0, 20.6, 0));
  b.add(new THREE.TorusGeometry(2.65, 0.06, 5, 24).rotateX(PI / 2), M.dark, M4(0, 21.6, 0));
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; b.add(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), M.dark, M4(Math.cos(a) * 2.65, 21.1, Math.sin(a) * 2.65)); }
  const glass = new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.2 });
  b.add(new THREE.CylinderGeometry(1.35, 1.35, 2.3, 12), glass, M4(0, 22.0, 0));
  b.add(new THREE.ConeGeometry(1.9, 1.7, 12), M.redRoof, M4(0, 24.0, 0));
  b.add(new THREE.SphereGeometry(0.25, 8, 6), M.dark, M4(0, 25.0, 0));
  b.build(g, false, false);
  // луч
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uOp: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uOp; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float a = pow(vUv.y, 2.2) * pow(abs(dot(vN, vV)), 1.4) * uOp; gl_FragColor = vec4(vec3(2.4, 2.1, 1.6) * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beam = new THREE.Group(); beam.position.y = 22.0;
  for (const s of [1, -1]) {
    const cg = new THREE.ConeGeometry(26, 300, 24, 1, true); cg.translate(0, -150, 0); cg.rotateZ(s * PI / 2);
    const m = new THREE.Mesh(cg, beamMat); m.frustumCulled = false; beam.add(m);
  }
  g.add(beam);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
  sp.position.y = 22.0; sp.scale.setScalar(16); g.add(sp);
  return { g, beam, beamMat, glass, sp };
}

function makeIsland([angDeg, dist, R, H, seed, lh], M, pg, cg, surfMat) {
  const Rn = mulberry(seed * 97 + 13), ph = Array.from({ length: 6 }, () => Rn() * TAU), amp = [0.15, 0.1, 0.07, 0.05, 0.035, 0.025];
  const shoreR = th => { let s = 1; for (let k = 0; k < 6; k++) s += amp[k] * Math.sin((k + 1) * th + ph[k]); return R * s; };
  const peaks = [[(Rn() - 0.5) * R * 0.5, (Rn() - 0.5) * R * 0.5, 1, R * 0.6]];
  for (let k = 0, np = 1 + (Rn() * 2 | 0); k < np; k++) { const a = Rn() * TAU, rr = R * (0.3 + Rn() * 0.35); peaks.push([Math.cos(a) * rr, Math.sin(a) * rr, 0.35 + Rn() * 0.4, R * (0.25 + Rn() * 0.2)]); }
  const height = (x, z) => {
    const r = Math.hypot(x, z), s = r / shoreR(Math.atan2(z, x));
    if (s >= 1) return -Math.min(30, (s - 1) * R * 0.12);
    const land = 1 - s * s;
    let m = 0; for (const [px, pz, w, pr] of peaks) { const q = Math.hypot(x - px, z - pz) / pr; m = Math.max(m, w * Math.exp(-q * q * 1.6)); }
    const n = NZ.fbm(x * 0.011 + seed, z * 0.011, 5), ridge = 1 - Math.abs(NZ2.fbm(x * 0.02 + seed, z * 0.02, 4)) * 2;
    return 2.0 * Math.pow(land, 0.35) + H * land * (m * (0.75 + 0.55 * n) + 0.12 * ridge * m);
  };
  let Rmax = 0; for (let i = 0; i < 64; i++) Rmax = Math.max(Rmax, shoreR(i / 64 * TAU));
  // рельеф
  const NR = 46, NS = 96, pos = [], idx = [];
  for (let i = 0; i <= NR; i++) { const r = Rmax * 1.45 * Math.pow(i / NR, 0.8); for (let j = 0; j < NS; j++) { const a = j / NS * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r; pos.push(x, height(x, z), z); } }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) { const a = i * NS + j, b = i * NS + (j + 1) % NS, c = a + NS, d = b + NS; idx.push(a, b, c, b, d, c); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setIndex(idx); tg.computeVertexNormals();
  const P = tg.attributes.position, N = tg.attributes.normal, col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), h = P.getY(i), z = P.getZ(i), ny = N.getY(i);
    const n = NZ2.fbm(x * 0.045 + seed, z * 0.045, 3), n2 = NZ.fbm(x * 0.15, z * 0.15, 2);
    let r, gg, b;
    if (h < 2.4 + n * 1.5) {
      const wet = smooth(0.6, -0.4, h);
      r = lerp(0.52, 0.2, wet); gg = lerp(0.43, 0.16, wet); b = lerp(0.27, 0.1, wet);
      if (h < -1) { const k = smooth(-1, -8, h); r = lerp(r, 0.08, k); gg = lerp(gg, 0.09, k); b = lerp(b, 0.07, k); }
    } else {
      const k = clamp(n + 0.5, 0, 1); r = lerp(0.03, 0.075, k); gg = lerp(0.075, 0.11, k); b = lerp(0.015, 0.025, k);
      const dry = smooth(H * 0.35, H * 0.7, h) * 0.6; r = lerp(r, 0.11, dry); gg = lerp(gg, 0.1, dry); b = lerp(b, 0.05, dry);
    }
    const rock = clamp(smooth(0.8, 0.55, ny) + smooth(H * 0.6, H * 0.9, h) * 0.8, 0, 1) * (h > 0.5 ? 1 : 0.4), rk = 0.11 + n2 * 0.04;
    r = lerp(r, rk * 1.05, rock); gg = lerp(gg, rk, rock); b = lerp(b, rk * 0.88, rock);
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(tg, M.terrain));
  // растительность
  const palms = [], trees = [];
  const nrmY = (x, z) => { const e = 1.5, hx = (height(x + e, z) - height(x - e, z)) / (2 * e), hz = (height(x, z + e) - height(x, z - e)) / (2 * e); return 1 / Math.hypot(hx, 1, hz); };
  for (let k = 0; k < 3000 && (palms.length < 32 || trees.length < 150); k++) {
    const a = Rn() * TAU, s = Math.sqrt(Rn()) * 0.98, r = shoreR(a) * s, x = Math.cos(a) * r, z = Math.sin(a) * r, h = height(x, z), ny = nrmY(x, z);
    if (h > 0.9 && h < 5 && ny > 0.9) { if (palms.length < 32) palms.push([x, h - 0.2, z]); }
    else if (h > 3.5 && h < H * 0.75 && ny > 0.72 && trees.length < 150) trees.push([x, h - 0.5, z]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = V3(), cc = new THREE.Color();
  if (palms.length) {
    const it = new THREE.InstancedMesh(pg.trunk, M.trunk, palms.length), il = new THREE.InstancedMesh(pg.leaf, M.leaf, palms.length);
    palms.forEach(([x, y, z], i) => { e.set((Rn() - 0.5) * 0.25, Rn() * TAU, (Rn() - 0.5) * 0.25); q.setFromEuler(e); sc.setScalar(1.0 + Rn() * 0.6); m4.compose(V3(x, y, z), q, sc); it.setMatrixAt(i, m4); il.setMatrixAt(i, m4); });
    g.add(it, il);
  }
  if (trees.length) {
    const ic = new THREE.InstancedMesh(cg, M.canopy, trees.length);
    trees.forEach(([x, y, z], i) => {
      const s = 3.5 + Rn() * 4; e.set(0, Rn() * TAU, 0); q.setFromEuler(e); sc.set(s, s * (0.7 + Rn() * 0.4), s); m4.compose(V3(x, y + s * 0.45, z), q, sc); ic.setMatrixAt(i, m4);
      ic.setColorAt(i, cc.setRGB(lerp(0.025, 0.06, Rn()), lerp(0.055, 0.11, Rn()), lerp(0.012, 0.03, Rn())));
    });
    g.add(ic);
  }
  // прибой
  const sp = [], st = [], si = [], NSf = 200;
  for (let j = 0; j <= NSf; j++) { const a = j / NSf * TAU, R0 = shoreR(a); for (const [rr, t] of [[R0 - 1.5, 0], [R0 + 16, 1]]) { sp.push(Math.cos(a) * rr, 0, Math.sin(a) * rr); st.push(t); } }
  for (let j = 0; j < NSf; j++) { const a = j * 2, b = a + 2; si.push(a, a + 1, b, b, a + 1, b + 1); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('aT', new THREE.Float32BufferAttribute(st, 1)); sg.setIndex(si);
  const surf = new THREE.Mesh(sg, surfMat); surf.frustumCulled = false; surf.renderOrder = 2; g.add(surf);
  const a0 = angDeg * PI / 180; g.position.set(Math.cos(a0) * dist, 0, Math.sin(a0) * dist);
  g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  scene.add(g);
  const isl = { g, R, Rmax, coll: Rmax + 30, height, shoreR };
  if (lh) {
    const th = Math.atan2(-g.position.z, -g.position.x), r = shoreR(th) * 0.8, x = Math.cos(th) * r, z = Math.sin(th) * r;
    const L = makeLighthouse(M); L.g.position.set(x, height(x, z) - 0.6, z); g.add(L.g); WORLD.lighthouse = L;
  }
  return isl;
}

function makeGull(M) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), M.gullW); body.scale.set(0.42, 0.12, 0.12); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.gullW); head.position.set(0.36, 0.05, 0); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 5).rotateZ(-PI / 2), M.gullBeak); beak.position.set(0.5, 0.04, 0); g.add(beak);
  const ws = new THREE.Shape(); ws.moveTo(0.16, 0); ws.lineTo(0.06, 0.55); ws.lineTo(-0.12, 1.0); ws.lineTo(-0.2, 0.5); ws.lineTo(-0.14, 0); ws.closePath();
  const wg = new THREE.ShapeGeometry(ws); wg.rotateX(PI / 2);
  const tip = new THREE.Shape(); tip.moveTo(0.02, 0.72); tip.lineTo(-0.12, 1.0); tip.lineTo(-0.17, 0.72); tip.closePath();
  const tg = new THREE.ShapeGeometry(tip); tg.rotateX(PI / 2); tg.translate(0, 0.004, 0);
  const wings = [];
  for (const s of [1, -1]) {
    const w = new THREE.Group(); w.scale.z = s;
    w.add(new THREE.Mesh(wg, M.gullG), new THREE.Mesh(tg, M.gullTip)); g.add(w); wings.push(w);
  }
  g.scale.setScalar(1.35);
  scene.add(g);
  return { g, wings };
}

function initWorld() {
  const M = {
    terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.95 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f5a1c, roughness: 0.8, side: THREE.DoubleSide }),
    canopy: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }),
    stone: new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.5 }),
    redRoof: new THREE.MeshStandardMaterial({ color: 0x8e2016, roughness: 0.6 }),
    gullW: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.7 }),
    gullG: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.7, side: THREE.DoubleSide }),
    gullTip: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.7, side: THREE.DoubleSide }),
    gullBeak: new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.6 }),
  };
  const pg = palmGeo(), cg = new THREE.IcosahedronGeometry(1, 1), surfMat = makeSurfMat();
  const defs = [[125, 900, 210, 48, 11, true], [160, 2400, 560, 210, 23], [300, 1500, 260, 70, 37], [235, 1750, 330, 95, 41], [20, 1250, 160, 35, 53], [80, 1900, 300, 120, 67], [345, 2700, 420, 160, 71]];
  for (const d of defs) ISLANDS.push(makeIsland(d, M, pg, cg, surfMat));
  for (let i = 0; i < 9; i++) {
    const b = makeGull(M);
    Object.assign(b, { phi: Math.random() * TAU, w: (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.15), r: 22 + Math.random() * 30, y: 24 + Math.random() * 18, ph: Math.random() * 10, ox: (Math.random() - 0.5) * 20, oz: (Math.random() - 0.5) * 20, flap: 0 });
    GULLS.list.push(b);
  }
}

// автопилот обходит острова: возвращает поправку курса (рад)
function islandSteer() {
  const h = SHIP.heading, fx = Math.cos(h), fz = -Math.sin(h), rx = Math.sin(h), rz = Math.cos(h);
  let bias = 0;
  for (const isl of ISLANDS) {
    const dx = isl.g.position.x - SHIP.pos.x, dz = isl.g.position.z - SHIP.pos.z, d = Math.hypot(dx, dz), reach = isl.coll + 700;
    if (d > reach) continue;
    const ahead = dx * fx + dz * fz, side = dx * rx + dz * rz;
    if (ahead < -isl.coll || Math.abs(side) > isl.coll + 180) continue;
    bias += (side >= 0 ? 1 : -1) * clamp((reach - d) / 700, 0, 1) * 1.3;
  }
  return clamp(bias, -1.4, 1.4);
}
function islandCollide(dt) {
  WORLD.shoalToast -= dt;
  for (const isl of ISLANDS) {
    const dx = SHIP.pos.x - isl.g.position.x, dz = SHIP.pos.z - isl.g.position.z, d = Math.hypot(dx, dz);
    if (d >= isl.coll) continue;
    SHIP.pos.x = isl.g.position.x + dx / d * isl.coll; SHIP.pos.z = isl.g.position.z + dz / d * isl.coll;
    SHIP.speed *= 1 - dt * 1.5;
    if (WORLD.shoalToast <= 0) { toast('Мель! Отворачивай!'); WORLD.shoalToast = 8; }
  }
}
function recycleIslands() {
  for (const isl of ISLANDS) {
    const dx = isl.g.position.x - SHIP.pos.x, dz = isl.g.position.z - SHIP.pos.z;
    if (dx * dx + dz * dz < 3400 * 3400) continue;
    for (let tr = 0; tr < 12; tr++) {
      const fa = -SHIP.heading, off = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.9), d = 1900 + Math.random() * 900;
      const x = SHIP.pos.x + Math.cos(fa + off) * d, z = SHIP.pos.z + Math.sin(fa + off) * d;
      if (ISLANDS.every(o => o === isl || Math.hypot(o.g.position.x - x, o.g.position.z - z) > o.Rmax + isl.Rmax + 150)) { isl.g.position.set(x, 0, z); isl.g.rotation.y = Math.random() * TAU; break; }
    }
  }
}

function updateWorld(dt) {
  const t = STATE.t;
  WORLD.recycle -= dt; if (WORLD.recycle <= 0) { WORLD.recycle = 1; recycleIslands(); }
  // маяк
  const L = WORLD.lighthouse;
  if (L) {
    const on = clamp(light.night * 1.1 + smooth(0.5, 0.9, STATE.storm) * 0.6, 0, 1);
    L.beam.rotation.y += dt * 0.7; L.beam.visible = on > 0.02;
    L.beamMat.uniforms.uOp.value = on * 0.55; L.glass.emissiveIntensity = 0.2 + on * 6; L.sp.material.opacity = on;
  }
  // чайки: днём и не в шторм
  GULLS.vis = (1 - light.night) * (1 - smooth(0.55, 0.8, STATE.storm));
  for (const b of GULLS.list) {
    b.g.visible = GULLS.vis > 0.05; if (!b.g.visible) continue;
    b.phi += b.w * dt;
    const r = b.r + 6 * Math.sin(b.phi * 0.7 + b.ph);
    const x = SHIP.pos.x + Math.cos(b.phi) * r + b.ox, z = SHIP.pos.z + Math.sin(b.phi) * r + b.oz, y = SHIP.pos.y + b.y + 3 * Math.sin(b.phi * 0.5 + b.ph);
    const dx = x - b.g.position.x, dz = z - b.g.position.z;
    b.g.position.set(x, y, z);
    if (dx * dx + dz * dz > 1e-6) b.g.rotation.y = Math.atan2(-dz, dx);
    b.g.rotation.x = -Math.sign(b.w) * 0.32;
    b.flap += ((Math.sin(t * 0.25 + b.ph) > 0.2 ? 1 : 0) - b.flap) * dt * 2;
    const a = b.flap * 0.65 * Math.sin(t * 9 + b.ph) + (1 - b.flap) * 0.12;
    b.wings[0].rotation.x = a; b.wings[1].rotation.x = -a;
  }
  SOUND.update(dt);
}
