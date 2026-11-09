// ===================== корпус галеона =====================
// Система координат корабля: +X — нос, +Y — вверх, +Z — правый борт. Ватерлиния y=0.
const HULLDEF = (() => {
  const BT = [[-16.2, 3.5], [-15, 3.95], [-13, 4.35], [-10, 4.6], [-6, 4.72], [-2, 4.75], [2, 4.72], [6, 4.55], [9, 4.2], [11.5, 3.65], [13.5, 2.95], [15, 2.15], [16.2, 1.25], [17.0, 0.45], [17.4, 0.0]];
  const KT = [[-16.2, -0.6], [-15, -2.2], [-13, -2.9], [-10, -3.2], [-6, -3.25], [10, -3.25], [12, -3.1], [14, -2.7], [15.5, -2.0], [16.6, -1.0], [17.4, 0.3]];
  function interp(tab, x) {
    if (x <= tab[0][0]) return tab[0][1];
    if (x >= tab[tab.length - 1][0]) return tab[tab.length - 1][1];
    let i = 0; while (x > tab[i + 1][0]) i++;
    const p0 = tab[Math.max(0, i - 1)], p1 = tab[i], p2 = tab[i + 1], p3 = tab[Math.min(tab.length - 1, i + 2)];
    const dx = p2[0] - p1[0], t = (x - p1[0]) / dx, t2 = t * t, t3 = t2 * t;
    const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * dx, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * dx;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  }
  const B = x => Math.max(0, interp(BT, x));
  const keel = x => interp(KT, x);
  const sh = x => 0.004 * x * x;
  const rail = x => 3.9 + sh(x) + 2.0 * smooth(9.0, 10.1, x) + 2.0 * smooth(-5.9, -6.9, x) + 1.5 * smooth(-11.1, -12.1, x);
  const X0 = -16.2, X1 = 17.4;
  const REG = [{ x0: X0, x1: -12.1, lift: 3.5 }, { x0: -12.1, x1: -6.9, lift: 2.0 }, { x0: -6.9, x1: 10.1, lift: 0 }, { x0: 10.1, x1: X1, lift: 2.0 }];
  const deckY = (x, lift) => 2.65 + sh(x) + lift;
  const regionAt = x => REG.find(r => x >= r.x0 && x <= r.x1) || REG[2];
  const fullness = x => x > 0 ? lerp(0.42, 0.95, smooth(5, 17, x)) : lerp(0.42, 0.8, smooth(-6, -16, x));
  const tumble = x => 0.15 + 0.1 * smooth(-12, -16.2, x) - 0.08 * smooth(10, 16, x);
  function W(x, s) {
    const k = keel(x), r = rail(x), sm = clamp((0.7 - k) / (r - k), 0.05, 0.9);
    if (s < sm) return Math.pow(Math.max(0, Math.sin(PI / 2 * s / sm)), fullness(x));
    const t = (s - sm) / (1 - sm); return 1 - tumble(x) * t * t;
  }
  const sAt = (x, y) => { const k = keel(x), r = rail(x); return Math.max(0, (y - k) / (r - k)); };
  function P(x, s, side, off = 0, out = [0, 0, 0]) {
    const k = keel(x), r = rail(x);
    const hw = Math.max(0, B(x) * W(x, s) + off);
    out[0] = x + 1.8 * Math.pow(smooth(11, 17.4, x), 1.5) * Math.pow(s, 1.3) - 1.0 * smooth(-13, -16.2, x) * s;
    out[1] = k + (r - k) * s; out[2] = side * hw; return out;
  }
  function frame(x, y, side, off = 0, vertical = false) {
    const s = sAt(x, y), p = P(x, s, side, off);
    const px = P(x + 0.02, s, side, off), pu = P(x, s + 0.01, side, off), pd = P(x, Math.max(0, s - 0.01), side, off);
    const tx = V3(px[0] - p[0], px[1] - p[1], px[2] - p[2]).normalize();
    const ty = V3(pu[0] - pd[0], pu[1] - pd[1], pu[2] - pd[2]).normalize();
    const n = V3().crossVectors(tx, ty).normalize(); if (n.z * side < 0) n.negate();
    if (vertical) { n.y = 0; n.normalize(); }
    const up = vertical ? V3(0, 1, 0) : V3().crossVectors(n, tx).normalize(); if (up.y < 0) up.negate();
    const t = V3().crossVectors(up, n).normalize();
    return { p: V3(p[0], p[1], p[2]), n, t, up, m: new THREE.Matrix4().makeBasis(t, up, n).setPosition(p[0], p[1], p[2]) };
  }
  return {
    B, keel, rail, sh, X0, X1, REG, deckY, regionAt, W, sAt, P, frame,
    yW1: x => 1.0 + sh(x), yW2: x => 2.42 + sh(x), yB: x => 3.62 + sh(x),
    deckAt: x => deckY(x, regionAt(x).lift),
    MAST: { fore: 12.3, main: 1.2, mizzen: -9.4 },
  };
})();

// полоса вдоль борта: rowsFn(x) -> [[y, off], ...]
function hullStrip(batch, mat, x0, x1, nx, rowsFn, side, uLen, vLen, opts = {}) {
  const H = HULLDEF, cols = [];
  for (let i = 0; i <= nx; i++) {
    const x = lerp(x0, x1, i / nx);
    cols.push(rowsFn(x).map(([y, off]) => H.P(x, H.sAt(x, y), side, off)));
  }
  const nv = cols[0].length - 1, pos = [], uv = [], idx = [];
  for (let i = 0; i <= nx; i++) {
    const c = cols[i]; let acc = opts.v0 || 0;
    for (let j = 0; j <= nv; j++) {
      if (j) acc += Math.hypot(c[j][0] - c[j - 1][0], c[j][1] - c[j - 1][1], c[j][2] - c[j - 1][2]);
      pos.push(c[j][0], c[j][1], c[j][2]);
      uv.push(c[j][0] / uLen, opts.vNorm ? j / nv : acc / vLen);
    }
  }
  const flip = (side < 0) !== !!opts.inward;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    if (!flip) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  batch.add(g, mat); return g;
}
const zoneRows = (lo, hi, n) => x => {
  const k = HULLDEF.keel(x), r = HULLDEF.rail(x), a = clamp(lo(x), k, r), b = clamp(hi(x), a, r);
  const out = []; for (let j = 0; j <= n; j++) out.push([lerp(a, b, j / n), 0]); return out;
};
const profRows = (yc, prof) => x => prof.map(([dy, off]) => [yc(x) + dy, off]);

// ---------- «выветривание»: грязь, потёки, мокрая ватерлиния, водоросли ----------
const WEATHER = { uGrime: { value: null } };
function weather(mat, o = {}) {
  const grime = o.grime ?? 0.5, wet = o.wet ?? 0, algae = o.algae ?? 0, streaks = o.streaks ?? 0.4;
  const f = v => v.toFixed(3);
  mat.onBeforeCompile = sh => {
    sh.uniforms.uGrime = WEATHER.uGrime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;\nuniform sampler2D uGrime;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float gN = texture2D(uGrime, vec2(vLP.x*0.071 + vLP.z*0.043, vLP.y*0.09 + vLP.z*0.037)).b;
        float sk = texture2D(uGrime, vec2(vLP.x*0.55 + vLP.z*0.55, vLP.y*0.025)).g;
        diffuseColor.rgb *= mix(1.0, 0.68 + 0.5*gN, ${f(grime)});
        diffuseColor.rgb *= 1.0 - ${f(streaks)}*smoothstep(0.55, 0.9, sk)*0.4;
        float wl = smoothstep(1.3, -0.2, vLP.y);
        diffuseColor.rgb *= 1.0 - ${f(wet)}*wl*0.45;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045,0.075,0.04), ${f(algae)}*smoothstep(0.6,-0.15,vLP.y)*smoothstep(-1.6,-0.1,vLP.y)*(0.45+0.55*gN));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, roughnessFactor*0.45, ${f(wet)}*smoothstep(1.0, -0.1, vLP.y));`);
  };
  mat.customProgramCacheKey = () => 'wx' + [grime, wet, algae, streaks].join('_');
  return mat;
}

function makeFriezeTex() {
  const [c, g] = mkCanvas(512, 96);
  g.fillStyle = '#4a0d07'; g.fillRect(0, 0, 512, 96);
  for (let k = 0; k < 4; k++) {
    const cx = k * 128 + 64, cy = 48;
    g.beginPath(); g.moveTo(cx - 44, cy); g.lineTo(cx, cy - 30); g.lineTo(cx + 44, cy); g.lineTo(cx, cy + 30); g.closePath();
    g.fillStyle = '#7d4f17'; g.fill(); g.strokeStyle = '#e0b25a'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#e0b25a'; g.beginPath(); g.arc(cx, cy, 7, 0, TAU); g.fill();
    g.beginPath(); g.arc(k * 128, cy, 5, 0, TAU); g.fill();
  }
  g.fillStyle = '#d4a24c'; g.fillRect(0, 0, 512, 7); g.fillRect(0, 89, 512, 7);
  noiseOverlay(g, 512, 96, 0.12, 11);
  return canvasTex(c, { repeat: true });
}

function latheBaluster() {
  const pts = [[0.07, 0], [0.07, 0.07], [0.04, 0.1], [0.065, 0.28], [0.04, 0.46], [0.032, 0.52], [0.06, 0.56], [0.06, 0.62]].map(([r, h]) => new THREE.Vector2(r, h));
  return new THREE.LatheGeometry(pts, 8);
}

async function buildHull(T) {
  const H = HULLDEF;
  setLoad('Обшиваем днище медью…', 0.58); await nextFrame();
  T.copper = makeCopper();
  T.paint = makePlanks(512, 256, { rows: 8, seed: 5, base: [0.8, 0.78, 0.74], vary: 0.3, dirt: 0.15 });
  T.frieze = makeFriezeTex();
  T.grating = makeGratingTex();
  WEATHER.uGrime.value = T.grime;

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    copper: weather(std({ map: T.copper.map, normalMap: T.copper.normal, roughnessMap: T.copper.rm, metalnessMap: T.copper.rm, metalness: 1, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) }), { grime: 0.35, algae: 0.85, streaks: 0 }),
    wood: weather(std({ map: T.hull.map, normalMap: T.hull.normal, roughnessMap: T.hull.rough, roughness: 1, normalScale: new THREE.Vector2(0.7, 0.7) }), { grime: 0.55, wet: 0.8, streaks: 0.6 }),
    ochre: weather(std({ map: T.paint.map, normalMap: T.paint.normal, roughnessMap: T.paint.rough, color: 0xc9902f, roughness: 0.85 }), { grime: 0.45, streaks: 0.7 }),
    blue: weather(std({ map: T.paint.map, normalMap: T.paint.normal, roughnessMap: T.paint.rough, color: 0x1f3463, roughness: 0.8 }), { grime: 0.4, streaks: 0.5 }),
    black: weather(std({ map: T.paint.map, normalMap: T.paint.normal, roughnessMap: T.paint.rough, color: 0x1c1916, roughness: 0.7 }), { grime: 0.3, wet: 0.6 }),
    red: weather(std({ map: T.paint.map, normalMap: T.paint.normal, roughnessMap: T.paint.rough, color: 0x8c2a1a, roughness: 0.8 }), { grime: 0.5, streaks: 0.3 }),
    deck: weather(std({ map: T.deck.map, normalMap: T.deck.normal, roughnessMap: T.deck.rough, roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6) }), { grime: 0.45, streaks: 0 }),
    rail: std({ map: T.grain.map, normalMap: T.grain.normal, roughnessMap: T.grain.rough, color: 0x9a7350, roughness: 0.75 }),
    gold: std({ color: 0xd9a64e, metalness: 1, roughness: 0.55, roughnessMap: T.grime }),
    frieze: std({ map: T.frieze, roughness: 0.6, metalness: 0.15 }),
    dark: std({ color: 0x040302, roughness: 1 }),
    lid: weather(std({ map: T.paint.map, color: 0xa3301d, roughness: 0.7 }), { grime: 0.35 }),
    iron: std({ color: 0x1b1b1c, metalness: 0.85, roughness: 0.42 }),
    grating: std({ map: T.grating, roughness: 0.9 }),
  };
  SHIP.M = M; SHIP.emissive = [];
  const hg = new THREE.Group(); hg.name = 'hull';
  const batch = new Batch();
  const NX = 120;

  // ---------- внешняя обшивка, по зонам ----------
  for (const side of [1, -1]) {
    hullStrip(batch, M.copper, H.X0, H.X1, NX, zoneRows(() => -99, () => 0.32, 16), side, 4.8, 2.8);
    hullStrip(batch, M.wood, H.X0, H.X1, NX, zoneRows(() => 0.32, x => H.yW2(x) - 0.11, 10), side, 14, 2.4);
    hullStrip(batch, M.ochre, H.X0, H.X1, NX, zoneRows(x => H.yW2(x) - 0.11, H.yB, 5), side, 14, 2.4);
    hullStrip(batch, M.blue, H.X0, H.X1, NX, zoneRows(H.yB, H.rail, 10), side, 14, 2.4);
    // накладки: пояса (wales), золотой молдинг, фриз, планширь
    const wale = (o, h) => [[-h, 0], [-h, o], [h, o], [h, 0]];
    hullStrip(batch, M.black, H.X0, H.X1 - 0.05, NX, profRows(H.yW1, wale(0.09, 0.1)), side, 14, 2.4);
    hullStrip(batch, M.black, H.X0, H.X1 - 0.05, NX, profRows(H.yW2, wale(0.1, 0.11)), side, 14, 2.4);
    hullStrip(batch, M.black, H.X0, 16.8, NX, profRows(() => 0.32, wale(0.035, 0.035)), side, 14, 2.4);
    hullStrip(batch, M.gold, H.X0, H.X1 - 0.1, NX, profRows(H.yB, wale(0.05, 0.035)), side, 14, 2.4);
    hullStrip(batch, M.frieze, H.X0, H.X1 - 0.1, NX, profRows(x => H.rail(x) - 0.17, [[-0.13, 0], [-0.13, 0.03], [0.13, 0.03], [0.13, 0]]), side, 3, 1, { vNorm: true });
    hullStrip(batch, M.gold, H.X0, H.X1 - 0.1, NX, profRows(x => H.rail(x) - 0.33, wale(0.045, 0.03)), side, 14, 2.4);
    hullStrip(batch, M.rail, H.X0, H.X1, NX, profRows(H.rail, [[-0.04, 0.07], [0.07, 0.07], [0.07, -0.27], [-0.02, -0.27]]), side, 3, 0.6);
    // внутренняя сторона фальшборта (красная), по секциям палуб
    for (const reg of H.REG) {
      const nx = Math.max(6, Math.round((reg.x1 - reg.x0) / 0.3));
      hullStrip(batch, M.red, reg.x0, reg.x1, nx, x => [[H.deckY(x, reg.lift), -0.22], [H.rail(x) - 0.02, -0.22]], side, 14, 2.4, { inward: true });
    }
  }

  // ---------- палубы ----------
  for (const reg of H.REG) {
    const nx = Math.max(6, Math.round((reg.x1 - reg.x0) / 0.3)), nz = 14, pos = [], uv = [], idx = [];
    for (let i = 0; i <= nx; i++) {
      const x = lerp(reg.x0, reg.x1, i / nx), y = H.deckY(x, reg.lift), p = H.P(x, H.sAt(x, y), 1, -0.2);
      for (let j = 0; j <= nz; j++) { const z = lerp(-p[2], p[2], j / nz); pos.push(p[0], y, z); uv.push(p[0] / 12, z / 2.0); }
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j, b = a + nz + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); batch.add(g, M.deck);
  }

  // ---------- транец (корма) ----------
  setLoad('Режем кормовую галерею…', 0.64); await nextFrame();
  {
    const xT = H.X0, k = H.keel(xT), r = H.rail(xT), ZM = H.P(xT, 0.62, 1)[2] + 0.1;
    const archTop = r + 1.35, zR = 2.3;
    const hwAt = y => H.P(xT, H.sAt(xT, y), 1)[2];
    const rowY1 = H.deckY(xT, 2.0) + 0.95, rowY2 = H.deckY(xT, 3.5) + 0.55;
    const zsFor = (y, n, w) => { const hw = hwAt(y) - 0.45, out = []; for (let i = 0; i < n; i++) out.push(lerp(-hw + w * 0.6, hw - w * 0.6, i / (n - 1))); return out; };
    const L = {
      ZM, y0: k, y1: archTop, paint: H.yB(xT) - 1.2, wales: [H.yW1(xT), H.yW2(xT)], cornice: [rowY1 + 0.75, rowY2 + 0.62],
      rail: r, archTop, zR, nameY: H.yW2(xT) + 0.62, nameW: 3.6,
      rows: [{ y: rowY1, h: 0.95, w: 0.56, arched: true, zs: zsFor(rowY1, 6, 0.56) }, { y: rowY2, h: 0.8, w: 0.5, arched: true, zs: zsFor(rowY2, 5, 0.5) }],
    };
    const tt = makeTransomTex(L, T);
    const tm = new THREE.MeshStandardMaterial({ map: tt.map, emissiveMap: tt.emi, emissive: 0xffa040, emissiveIntensity: 0, roughness: 0.7, metalness: 0.05 });
    SHIP.emissive.push(tm);
    const pos = [], uv = [], idx = [], N = 40;
    const uvOf = (y, z) => [(z + ZM) / (2 * ZM), (y - L.y0) / (L.y1 - L.y0)];
    for (let j = 0; j <= N; j++) {
      const s = j / N;
      for (const side of [1, -1]) { const p = H.P(xT, s, side); pos.push(p[0], p[1], p[2]); uv.push(...uvOf(p[1], p[2])); }
    }
    for (let j = 0; j < N; j++) { const a = j * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    // арка над гакабортом
    const hwR = H.P(xT, 1, 1)[2], sh2 = new THREE.Shape();
    sh2.moveTo(-hwR, r);
    for (let i = 0; i <= 40; i++) { const z = -zR + 2 * zR * i / 40; sh2.lineTo(z, r + (archTop - r) * Math.pow(Math.max(0, 1 - (z / zR) ** 2), 0.6)); }
    sh2.lineTo(hwR, r); sh2.lineTo(-hwR, r);
    const ag = new THREE.ShapeGeometry(sh2, 24), ap = ag.attributes.position, au = ag.attributes.uv;
    for (let i = 0; i < ap.count; i++) {
      const z = ap.getX(i), y = ap.getY(i), s = H.sAt(xT, y);
      ap.setXYZ(i, xT - 1.0 * s - 0.005, y, z); au.setXY(i, ...uvOf(y, z));
    }
    ag.computeVertexNormals();
    const tg = mergeGeos([g, ag]);
    const tmesh = new THREE.Mesh(tg, tm); tmesh.castShadow = tmesh.receiveShadow = true; hg.add(tmesh);
    // задняя сторона арки (чтобы не была прозрачной спереди)
    const back = ag.clone(); back.index.array.reverse(); back.computeVertexNormals();
    { const bp = back.attributes.position; for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) + 0.12); }
    batch.add(back, M.red);
    // золотая окантовка арки
    const ap2 = []; for (let i = 0; i <= 30; i++) { const z = -zR + 2 * zR * i / 30, y = r + (archTop - r) * Math.pow(Math.max(0, 1 - (z / zR) ** 2), 0.6); ap2.push(V3(xT - H.sAt(xT, y) + 0.03, y, z)); }
    batch.add(tubeAlong(ap2, 0.07, 6, 60), M.gold);
    for (const z of [-zR, zR]) batch.add(new THREE.SphereGeometry(0.16, 10, 8), M.gold, M4(xT - H.sAt(xT, r) , r + 0.14, z));
    SHIP.transomL = L;
  }

  // ---------- киль, ахтерштевень, форштевень, княвдигед ----------
  {
    const ks = new THREE.Shape();
    ks.moveTo(-16.45, -3.6); ks.lineTo(13, -3.6);
    for (let x = 13; x <= 17.01; x += 0.25) ks.lineTo(x, H.keel(x) - 0.32);
    ks.lineTo(17.8, 0.35); ks.lineTo(17.2, 0.35);
    for (let x = 17.0; x >= -16.2; x -= 0.5) ks.lineTo(x, H.keel(x) + 0.3);
    ks.lineTo(-16.45, -0.2); ks.closePath();
    const kg = new THREE.ExtrudeGeometry(ks, { depth: 0.38, bevelEnabled: false, curveSegments: 4 });
    kg.translate(0, 0, -0.19);
    { const u = kg.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) / 4.8, u.getY(i) / 2.8); }
    batch.add(kg, M.copper);
    // княвдигед (водорез)
    const hs = new THREE.Shape();
    const pts = [[17.3, 0.3], [17.8, 0.3], [18.7, 0.65], [19.75, 1.85], [20.7, 3.05], [21.45, 4.2], [21.95, 4.85], [21.45, 5.08], [19.2, 4.98], [18.0, 3.9], [17.45, 1.6]];
    hs.moveTo(...pts[0]); for (const p of pts.slice(1)) hs.lineTo(...p); hs.closePath();
    const hk = new THREE.ExtrudeGeometry(hs, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
    hk.translate(0, 0, -0.15);
    { const u = hk.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) / 14, u.getY(i) / 2.4); }
    batch.add(hk, M.black);
    // золотая кромка водореза
    batch.add(tubeAlong([V3(18.7, 0.65, 0), V3(19.75, 1.85, 0), V3(20.7, 3.05, 0), V3(21.45, 4.2, 0), V3(21.95, 4.85, 0)].map(v => v.add(V3(0.03, 0, 0))), 0.05, 6, 30), M.gold);
  }

  // ---------- гальюн (платформа на носу) и леера ----------
  {
    const yb = 4.98;
    const bs = new THREE.Shape(); bs.moveTo(17.0, -1.45); bs.lineTo(19.6, -0.9); bs.lineTo(21.45, -0.18); bs.lineTo(21.45, 0.18); bs.lineTo(19.6, 0.9); bs.lineTo(17.0, 1.45); bs.closePath();
    const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.14, bevelEnabled: false });
    bg.rotateX(PI / 2); bg.translate(0, yb + 0.14, 0);
    { const u = bg.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 0.6, u.getY(i) * 0.6); }
    batch.add(bg, M.grating);
    for (const side of [1, -1]) {
      for (const [y0, y1, r] of [[H.yW2(16.0) + 0.3, 4.62, 0.06], [H.yB(16.4) - 0.2, 5.0, 0.055]]) {
        const p0 = H.P(16.0, H.sAt(16.0, y0), side, 0.03);
        batch.add(tubeAlong([V3(...p0), V3(18.0, (y0 + y1) / 2 + 0.25, side * 1.05), V3(20.1, y1 - 0.05, side * 0.55), V3(21.35, y1 - 0.28, side * 0.12)], r, 6, 30), M.gold);
      }
      const top = [V3(17.0, yb + 0.85, side * 1.45), V3(19.6, yb + 0.72, side * 0.9), V3(21.35, yb + 0.55, side * 0.18)];
      batch.add(tubeAlong(top, 0.05, 6, 20), M.rail);
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, a = new THREE.CatmullRomCurve3(top).getPoint(t);
        batch.add(cylBetween(V3(a.x, yb + 0.14, a.z * 0.98), a, 0.035, 0.035, 6), M.rail);
      }
    }
  }

  // ---------- орудийные порты ----------
  {
    const port = (x, y, side, size, lidOpen = 1.3) => {
      const f = H.frame(x, y, side, 0);
      const add = (geo, mat, lx, ly, lz) => { geo.translate(lx, ly, lz); geo.applyMatrix4(f.m); batch.add(geo, mat); };
      add(new THREE.BoxGeometry(size, size, 0.08), M.dark, 0, 0, 0.0);
      const fw = 0.075;
      add(new THREE.BoxGeometry(size + fw * 2, fw, 0.12), M.black, 0, size / 2 + fw / 2, 0.02);
      add(new THREE.BoxGeometry(size + fw * 2, fw, 0.12), M.black, 0, -size / 2 - fw / 2, 0.02);
      add(new THREE.BoxGeometry(fw, size, 0.12), M.black, size / 2 + fw / 2, 0, 0.02);
      add(new THREE.BoxGeometry(fw, size, 0.12), M.black, -size / 2 - fw / 2, 0, 0.02);
      const ls = size + 0.05, lid = new THREE.BoxGeometry(ls, ls, 0.07);
      lid.translate(0, -ls / 2, 0.035); lid.applyMatrix4(new THREE.Matrix4().makeRotationX(-lidOpen));
      add(lid, M.lid, 0, size / 2 + fw, 0.07);
      // петли
      for (const sx of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.05, 0.05, 0.2), M.iron, sx * size, size / 2 + fw, 0.1);
      return f;
    };
    SHIP.ports = [];
    const lower = [-10.4, -8.0, -5.6, -3.2, -0.8, 1.6, 4.0, 6.4, 8.8, 11.0];
    const upper = [-11.2, -8.8, -6.4, -4.0, -1.6, 0.8, 3.2, 5.6, 8.0, 10.4, 12.6];
    for (const side of [1, -1]) {
      for (const x of lower) SHIP.ports.push({ f: port(x, 1.55 + H.sh(x), side, 0.56), side, x, deck: 0 });
      for (const x of upper) SHIP.ports.push({ f: port(x, 3.32 + H.sh(x), side, 0.52), side, x, deck: 1 });
      for (const x of [-10.9, -8.9, 11.6, 13.4]) SHIP.ports.push({ f: port(x, H.deckY(x, 2.0) + 0.55, side, 0.4), side, x, deck: 2 });
    }
  }

  // ---------- кормовые балконы-галереи ----------
  {
    const gt = makeGalleryTex(3);
    const gm = new THREE.MeshStandardMaterial({ map: gt.map, emissiveMap: gt.emi, emissive: 0xffa040, emissiveIntensity: 0, roughness: 0.7 });
    SHIP.emissive.push(gm);
    for (const side of [1, -1]) {
      const x = -14.3, y = 5.95, f = H.frame(x, y, side, 0, true);
      const box = new THREE.BoxGeometry(2.5, 2.3, 0.85);
      const mats = [M.blue, M.blue, M.blue, M.blue, gm, gm];
      if (side < 0) { mats[4] = M.blue; mats[5] = gm; }
      // локальная +Z frame — наружу, но у левого борта t смотрит назад: используем явную ориентацию
      const m = new THREE.Mesh(box, side > 0 ? [M.blue, M.blue, M.blue, M.blue, gm, M.blue] : [M.blue, M.blue, M.blue, M.blue, gm, M.blue]);
      m.applyMatrix4(f.m); m.translateZ(0.3);
      m.castShadow = m.receiveShadow = true; hg.add(m);
      const add = (geo, mat, lx, ly, lz) => { geo.translate(lx, ly, lz); geo.applyMatrix4(f.m); batch.add(geo, mat); };
      const bottom = new THREE.SphereGeometry(1, 16, 8, 0, PI, PI / 2, PI / 2); bottom.scale(1.3, 1.05, 0.75);
      add(bottom, M.blue, 0, -1.15, 0);
      const top = new THREE.SphereGeometry(1, 16, 6, 0, PI, 0, PI / 2); top.scale(1.3, 0.75, 0.78);
      add(top, M.blue, 0, 1.15, 0);
      add(new THREE.BoxGeometry(2.7, 0.1, 0.95), M.gold, 0, 1.17, 0.3);
      add(new THREE.BoxGeometry(2.7, 0.1, 0.95), M.gold, 0, -1.17, 0.3);
      add(new THREE.SphereGeometry(0.17, 10, 8), M.gold, 0, -2.25, 0.25);
      add(new THREE.SphereGeometry(0.13, 10, 8), M.gold, 0, 1.95, 0.25);
      for (const lx of [-1.25, 1.25]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 8), M.gold, lx, 0, 0.73);
    }
  }

  // ---------- переборки (стенки надстроек), балюстрады ----------
  {
    const blm = latheBaluster();
    const bulk = (xb, liftLo, liftHi, facing, doors, wins) => {
      const yLo = H.deckY(xb, liftLo), yHi = H.deckY(xb, liftHi), h = yHi - yLo;
      const p = H.P(xb, H.sAt(xb, (yLo + yHi) / 2), 1, -0.2), w = p[2] * 2;
      const bt = makeBulkheadTex(w, h, doors, wins);
      const mat = new THREE.MeshStandardMaterial({ map: bt.map, emissiveMap: bt.emi, emissive: 0xffa040, emissiveIntensity: 0, roughness: 0.75 });
      SHIP.emissive.push(mat);
      const g = new THREE.PlaneGeometry(w, h); g.rotateY(facing > 0 ? PI / 2 : -PI / 2);
      const m = new THREE.Mesh(g, mat); m.position.set(p[0] + facing * 0.01, (yLo + yHi) / 2, 0); m.castShadow = m.receiveShadow = true; hg.add(m);
      // балюстрада по кромке верхней палубы
      const n = Math.floor(w / 0.3), pt = H.P(xb, H.sAt(xb, yHi), 1, -0.25);
      for (let i = 0; i <= n; i++) {
        const z = lerp(-pt[2], pt[2], i / n), b = blm.clone(); b.translate(pt[0] - facing * 0.14, yHi, z); batch.add(b, M.rail);
      }
      batch.add(new THREE.BoxGeometry(0.16, 0.09, pt[2] * 2), M.rail, M4(pt[0] - facing * 0.14, yHi + 0.66, 0));
      batch.add(new THREE.BoxGeometry(0.2, 0.12, w), M.gold, M4(p[0] + facing * 0.08, yHi - 0.06, 0));
      batch.add(new THREE.BoxGeometry(0.12, 0.08, w), M.gold, M4(p[0] + facing * 0.06, yLo + 0.14, 0));
    };
    bulk(10.1, 0, 2.0, -1, [-1.6, 1.6], [-2.8, 0, 2.8]);
    bulk(-6.9, 0, 2.0, 1, [-2.7, 2.7], [-1.3, 0, 1.3]);
    bulk(-12.1, 2.0, 3.5, 1, [0], [-2.6, -1.4, 1.4, 2.6]);
  }

  // ---------- люки-решётки на шкафуте ----------
  for (const [x, w] of [[-3.4, 2.4], [5.6, 2.6]]) {
    const y = H.deckY(x, 0);
    batch.add(new THREE.BoxGeometry(w + 0.3, 0.36, 2.5), M.rail, M4(x, y + 0.18, 0));
    const gp = new THREE.PlaneGeometry(w, 2.2); gp.rotateX(-PI / 2);
    { const u = gp.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * w * 0.9, u.getY(i) * 2.2 * 0.9); }
    batch.add(gp, M.grating, M4(x, y + 0.37, 0));
  }

  // ---------- шпигаты и ватервейс вдоль палубы ----------
  for (const side of [1, -1]) for (let x = -5.5; x < 9.5; x += 1.5) {
    const f = H.frame(x, H.deckY(x, 0) + 0.05, side, 0);
    const g = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8); g.rotateX(PI / 2); g.applyMatrix4(f.m); batch.add(g, M.dark);
  }

  // ---------- руль ----------
  const rudder = new THREE.Group(); rudder.position.set(-16.45, 0, 0);
  {
    const rshape = pts => { const s = new THREE.Shape(); s.moveTo(...pts[0]); for (const p of pts.slice(1)) s.lineTo(...p); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 }); g.translate(0, 0, -0.15);
      const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) / 4.8, u.getY(i) / 2.8); return g; };
    const rb = new Batch();
    rb.add(rshape([[0, -3.55], [-1.15, -3.55], [-1.074, 0.25], [0, 0.25]]), M.copper);
    rb.add(rshape([[0, 0.25], [-1.074, 0.25], [-1.05, 1.2], [-0.55, 2.6], [0, 3.0]]), M.black);
    for (const y of [-2.6, -1.2, 0.2]) rb.add(new THREE.BoxGeometry(1.0, 0.1, 0.4), M.iron, M4(-0.45, y, 0));
    rb.build(rudder);
  }
  hg.add(rudder); SHIP.rudder = rudder;

  batch.build(hg);
  hg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return hg;
}
