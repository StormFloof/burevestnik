// ===================== детали: пушки, фигура, фонари, палубный реквизит =====================
const DET = { lamps: [], lights: [], glows: [], wheel: null, cannons: null };

// труба переменного радиуса
function varTube(pts, rf, radial = 10, segs = 40) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const fr = curve.computeFrenetFrames(segs, false), pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, P = curve.getPointAt(t), N = fr.normals[i], B = fr.binormals[i], r = rf(t);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * TAU, c = Math.cos(a), s = -Math.sin(a);
      pos.push(P.x + r * (c * N.x + s * B.x), P.y + r * (c * N.y + s * B.y), P.z + r * (c * N.z + s * B.z)); uv.push(t * 4, j / radial);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return { g, curve };
}
function orientedM(pos, dir, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromUnitVectors(V3(1, 0, 0), dir.clone().normalize()), V3(sx, sy, sz));
}

function makeGlowTex() {
  const [c, g] = mkCanvas(128, 128), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(0.15, 'rgba(255,170,80,0.55)'); gr.addColorStop(0.45, 'rgba(255,120,40,0.12)'); gr.addColorStop(1, 'rgba(255,100,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return canvasTex(c);
}

async function buildDetails(T) {
  setLoad('Отливаем пушки…', 0.68); await nextFrame();
  const H = HULLDEF, M = SHIP.M, model = SHIP.model, b = new Batch();
  M.bronze = new THREE.MeshStandardMaterial({ color: 0x5c4024, metalness: 1, roughness: 0.42, roughnessMap: T.grime });
  M.gunIron = new THREE.MeshStandardMaterial({ color: 0x17171a, metalness: 0.8, roughness: 0.5, roughnessMap: T.grime });
  M.carr = new THREE.MeshStandardMaterial({ map: T.grain.map, color: 0x8a2a1c, roughness: 0.8 });
  M.goldD = M.gold.clone(); M.goldD.side = THREE.DoubleSide;
  M.eye = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2200, emissiveIntensity: 2 });
  M.ivory = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 });
  M.boat = new THREE.MeshStandardMaterial({ map: T.hull.map, normalMap: T.hull.normal, color: 0xd8c8b0, roughness: 0.9, side: THREE.DoubleSide });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: 0xffa040, emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.92 });
  DET.lamps.push(M.glass);

  // ---------- пушки (инстансы) ----------
  {
    const prof = [[0.0, -1.98], [0.07, -1.96], [0.08, -1.88], [0.035, -1.82], [0.2, -1.8], [0.23, -1.62], [0.215, -1.0], [0.235, -0.98], [0.235, -0.92], [0.19, -0.9],
      [0.165, 0.55], [0.19, 0.57], [0.19, 0.66], [0.15, 0.7], [0.155, 0.9], [0.205, 0.97], [0.205, 1.06], [0.105, 1.06], [0.105, 0.6]].map(([r, y]) => new THREE.Vector2(r, y));
    const bg = new THREE.LatheGeometry(prof, 14); bg.rotateX(PI / 2);
    const trun = new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8); trun.rotateZ(PI / 2); trun.translate(0, 0, -0.35);
    const barrelG = mergeGeos([bg, trun]); barrelG.translate(0, 0, -0.35);
    const cb = new Batch();
    cb.add(new THREE.BoxGeometry(0.62, 0.36, 1.25), M.carr, M4(0, -0.36, -1.15));
    for (const sx of [-1, 1]) cb.add(new THREE.BoxGeometry(0.1, 0.32, 1.15), M.carr, M4(sx * 0.29, -0.08, -1.1));
    for (const sx of [-1, 1]) for (const sz of [-0.62, -1.62]) { const w = new THREE.CylinderGeometry(0.15, 0.15, 0.08, 10); w.rotateZ(PI / 2); cb.add(w, M.carr, M4(sx * 0.33, -0.5, sz)); }
    const carrG = mergeGeos([...cb.m.values()].flat());
    const ports = SHIP.ports, n = ports.length;
    const barrels = new THREE.InstancedMesh(barrelG, M.bronze, n), carrs = new THREE.InstancedMesh(carrG, M.carr, n);
    const base = [], scale = [];
    ports.forEach((p, i) => {
      const s = p.deck === 0 ? 1.08 : p.deck === 1 ? 0.95 : 0.78;
      const m = p.f.m.clone().multiply(new THREE.Matrix4().makeScale(s, s, s));
      base.push(m); scale.push(s);
      barrels.setMatrixAt(i, m); carrs.setMatrixAt(i, m);
    });
    for (const im of [barrels, carrs]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); model.add(im); }
    DET.cannons = { barrels, carrs, base, scale, recoil: new Float32Array(n), vel: new Float32Array(n), ports };
  }

  // ---------- носовая фигура: золотой морской дракон ----------
  setLoad('Вырезаем носового дракона…', 0.7); await nextFrame();
  {
    const neckPts = [V3(20.5, 3.0, 0), V3(21.35, 4.1, 0), V3(22.2, 5.15, 0), V3(22.95, 6.05, 0), V3(23.25, 6.85, 0), V3(23.15, 7.45, 0)];
    const { g: neck, curve } = varTube(neckPts, t => lerp(0.62, 0.3, Math.pow(t, 0.8)) * (1 + 0.08 * Math.sin(t * 30)), 12, 48);
    b.add(neck, M.gold);
    // чешуйчатые кольца
    for (let i = 1; i < 14; i++) {
      const t = i / 14, P = curve.getPointAt(t), Tn = curve.getTangentAt(t), r = lerp(0.62, 0.3, Math.pow(t, 0.8)) + 0.02;
      const tor = new THREE.TorusGeometry(r, 0.028, 5, 16); tor.rotateY(PI / 2);
      b.add(tor, M.gold, orientedM(P, Tn));
    }
    // гребень-шипы
    for (let i = 1; i < 16; i++) {
      const t = i / 16.5, P = curve.getPointAt(t), Tn = curve.getTangentAt(t), back = V3(-Tn.y, Tn.x, 0).normalize();
      const r = lerp(0.62, 0.3, Math.pow(t, 0.8)), h = 0.38 * (1 - t * 0.5);
      const cone = new THREE.ConeGeometry(0.1, h, 6); cone.translate(0, h / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(_UP, back.clone().addScaledVector(Tn, -0.55).normalize());
      cone.applyMatrix4(new THREE.Matrix4().compose(P.clone().addScaledVector(back, r * 0.85), q, _ONE)); b.add(cone, M.gold);
    }
    // голова
    const hb = V3(23.15, 7.45, 0), hd = V3(1, 0.32, 0).normalize(), hp = hb.clone().addScaledVector(hd, 0.42);
    b.add(new THREE.SphereGeometry(1, 18, 12), M.gold, orientedM(hp, hd, 0.62, 0.4, 0.42));
    const brow = V3(0, 1, 0);
    // верхняя челюсть
    const snout = new THREE.CylinderGeometry(0.17, 0.3, 0.95, 12); snout.rotateZ(-PI / 2);
    b.add(snout, M.gold, orientedM(hp.clone().addScaledVector(hd, 0.72).add(V3(0, 0.02, 0)), hd));
    // нижняя челюсть (приоткрыта)
    const jd = hd.clone().applyAxisAngle(V3(0, 0, 1), -0.42), jaw = new THREE.CylinderGeometry(0.11, 0.22, 0.85, 10); jaw.rotateZ(-PI / 2);
    b.add(jaw, M.gold, orientedM(hp.clone().addScaledVector(jd, 0.62).add(V3(0, -0.16, 0)), jd, 1, 0.75, 1));
    // клыки
    for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) {
      const fp = hp.clone().addScaledVector(hd, 0.75 + k * 0.17).add(V3(0, -0.12, sz * (0.17 - k * 0.025)));
      const f = new THREE.ConeGeometry(0.035, 0.17, 5); f.rotateX(PI); b.add(f, M.ivory, M4(fp.x, fp.y, fp.z));
    }
    // ноздри-шарики, глаза, брови
    for (const sz of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.06, 8, 6), M.gold, M4(...hp.clone().addScaledVector(hd, 1.17).add(V3(0, 0.08, sz * 0.1)).toArray()));
      b.add(new THREE.SphereGeometry(0.075, 10, 8), M.eye, M4(...hp.clone().addScaledVector(hd, 0.25).add(V3(0, 0.17, sz * 0.31)).toArray()));
      const browC = new THREE.ConeGeometry(0.07, 0.4, 6); browC.rotateZ(PI / 2);
      b.add(browC, M.gold, orientedM(hp.clone().addScaledVector(hd, 0.2).add(V3(0, 0.27, sz * 0.27)), hd.clone().negate().add(V3(0, 0.25, sz * 0.2))));
      // рога
      const hs = hp.clone().addScaledVector(hd, -0.05).add(V3(0, 0.3, sz * 0.2));
      const { g: horn } = varTube([hs, hs.clone().add(V3(-0.45, 0.32, sz * 0.18)), hs.clone().add(V3(-1.0, 0.42, sz * 0.32)), hs.clone().add(V3(-1.45, 0.25, sz * 0.36))], t => lerp(0.1, 0.012, t), 8, 16);
      b.add(horn, M.ivory);
      // перепончатые «уши»-гребни
      const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-0.7, 0.45); fin.lineTo(-0.5, 0.18); fin.lineTo(-0.85, 0.12); fin.lineTo(-0.55, -0.05); fin.lineTo(-0.8, -0.28); fin.lineTo(-0.25, -0.18); fin.closePath();
      const fg = new THREE.ShapeGeometry(fin); fg.rotateX(sz * 0.5);
      b.add(fg, M.goldD, M4(...hp.clone().addScaledVector(hd, -0.3).add(V3(0, 0.05, sz * 0.38)).toArray(), 0, sz * 0.35, 0));
    }
    // сложенные крылья вдоль гальюна
    for (const sz of [-1, 1]) {
      const w = new THREE.Shape();
      w.moveTo(0, 0); w.quadraticCurveTo(-0.8, 1.3, -2.4, 1.9); w.lineTo(-2.0, 1.35); w.quadraticCurveTo(-2.4, 1.0, -3.1, 0.9);
      w.lineTo(-2.5, 0.5); w.quadraticCurveTo(-2.9, 0.15, -3.4, 0.05); w.lineTo(-2.6, -0.2); w.quadraticCurveTo(-1.4, -0.3, 0, 0);
      const wg = new THREE.ShapeGeometry(w, 10);
      b.add(wg, M.goldD, M4(21.6, 4.3, sz * 0.62, 0, sz * 0.38, 0.12));
      const bone = [V3(0, 0, 0), V3(-0.8, 1.3, 0), V3(-2.4, 1.9, 0)].map(v => v.applyMatrix4(M4(21.6, 4.3, sz * 0.64, 0, sz * 0.38, 0.12)));
      b.add(tubeAlong(bone, 0.06, 6, 16), M.gold);
    }
    // лапа с когтями, держащая шар
    const paw = V3(21.95, 4.95, 0);
    b.add(new THREE.SphereGeometry(0.34, 16, 12), M.gold, M4(paw.x + 0.25, paw.y - 0.2, 0));
    for (const sz of [-1, 1]) {
      const { g: leg } = varTube([V3(21.2, 4.4, sz * 0.45), V3(21.65, 4.6, sz * 0.42), V3(21.95, 4.9, sz * 0.3)], t => lerp(0.17, 0.11, t), 8, 10);
      b.add(leg, M.gold);
      for (let k = -1; k <= 1; k++) { const c = new THREE.ConeGeometry(0.04, 0.22, 5); c.rotateZ(-PI / 2 - 0.5); b.add(c, M.ivory, M4(22.15, 4.82 + k * 0.08, sz * (0.28 + k * 0.03))); }
    }
  }

  // ---------- фонари ----------
  setLoad('Зажигаем кормовые фонари…', 0.71); await nextFrame();
  const glowTex = makeGlowTex();
  const lantern = (p, s, withLight, lightI = 1) => {
    const lb = new THREE.CylinderGeometry(0.3 * s, 0.22 * s, 0.75 * s, 6); b.add(lb, M.glass, M4(p.x, p.y, p.z));
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + PI / 6; b.add(new THREE.BoxGeometry(0.035 * s, 0.78 * s, 0.035 * s), M.gold, M4(p.x + Math.cos(a) * 0.27 * s, p.y, p.z + Math.sin(a) * 0.27 * s)); }
    b.add(new THREE.ConeGeometry(0.36 * s, 0.4 * s, 6), M.gold, M4(p.x, p.y + 0.57 * s, p.z));
    b.add(new THREE.SphereGeometry(0.09 * s, 8, 6), M.gold, M4(p.x, p.y + 0.85 * s, p.z));
    b.add(new THREE.CylinderGeometry(0.26 * s, 0.12 * s, 0.25 * s, 6), M.gold, M4(p.x, p.y - 0.5 * s, p.z));
    b.add(new THREE.SphereGeometry(0.08 * s, 8, 6), M.gold, M4(p.x, p.y - 0.68 * s, p.z));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    sp.position.copy(p); sp.scale.setScalar(3.2 * s); model.add(sp); DET.glows.push({ sp, s });
    if (withLight) { const L = new THREE.PointLight(0xffa24a, 0, 30, 2); L.position.copy(p); model.add(L); DET.lights.push({ L, k: lightI, ph: Math.random() * 9 }); }
  };
  // кормовые фонари стоят на кронштейнах, вырастающих из верхней кромки арки транца
  {
    const TL = SHIP.transomL, xT = H.X0;
    const archY = z => TL.rail + (TL.archTop - TL.rail) * Math.pow(Math.max(0, 1 - (z / TL.zR) ** 2), 0.6);
    const archX = z => xT - 1.0 * H.sAt(xT, archY(z));
    const sternLantern = (z, s, out, withLight) => {
      const B = V3(archX(z) + 0.04, archY(z) - 0.04, z);            // точка крепления на кромке арки
      const tip = V3(B.x - out, B.y + 0.62, z);                      // конец кронштейна под дном фонаря
      b.add(new THREE.CylinderGeometry(0.1, 0.13, 0.16, 8), M.gold, M4(B.x, B.y + 0.04, z)); // основание
      b.add(tubeAlong([B.clone(), V3(B.x - 0.05, B.y + 0.32, z), V3(B.x - out * 0.45, B.y + 0.62, z), V3(B.x - out * 0.85, B.y + 0.5, z), tip.clone()], 0.055 * s, 6, 24), M.gold);
      b.add(cylBetween(V3(B.x, B.y + 0.1, z), V3(B.x - out * 0.75, B.y + 0.52, z), 0.03, 0.03, 5), M.gold); // подкос
      lantern(V3(tip.x, tip.y + 0.68 * s, z), s, withLight, 1);
    };
    sternLantern(0, 1.45, 0.95, true);
    for (const sz of [-1, 1]) sternLantern(sz * 1.7, 1.1, 0.7, false);
  }
  // фонарь на гроте-марсе: стоит на полу марса у кормовой кромки
  {
    const mn = MASTDEF[1], s = 0.8, floorY = mn.topY + 0.05, lx = 0.12 - mn.topR * 0.68;
    const p = toModel(mn.g, V3(lx, floorY + 0.76 * s, 0));
    b.add(new THREE.CylinderGeometry(0.2, 0.24, 0.06, 8), M.iron, new THREE.Matrix4().copy(mn.g.matrix).multiply(M4(lx, floorY + 0.03, 0)));
    lantern(p, s, false);
  }
  // фонарь на баке: на железной стойке от палубы
  {
    const x = 15.6, dk = H.deckY(x, 2.0), s = 0.75, top = dk + 1.15;
    b.add(new THREE.CylinderGeometry(0.045, 0.06, top - dk, 6), M.iron, M4(x, (dk + top) / 2, 0));
    b.add(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 8), M.iron, M4(x, dk + 0.04, 0));
    lantern(V3(x, top + 0.68 * s, 0), s, true, 0.5);
  }
  // фонарь у грот-мачты: висит на крюке-кронштейне, вбитом в мачту
  {
    const mn = MASTDEF[1], s = 0.6, ly = 5.3;
    const root = toModel(mn.g, V3(-mn.r * 0.95, ly, 0)), end = toModel(mn.g, V3(-mn.r - 0.6, ly, 0));
    b.add(new THREE.CylinderGeometry(mn.r + 0.04, mn.r + 0.04, 0.14, 12), M.iron, new THREE.Matrix4().copy(mn.g.matrix).multiply(M4(0, ly, 0)));
    b.add(cylBetween(root, end, 0.04, 0.035, 6), M.iron);
    b.add(cylBetween(toModel(mn.g, V3(-mn.r * 0.95, ly - 0.45, 0)), end.clone().lerp(root, 0.35), 0.025, 0.025, 5), M.iron);
    const hookTop = end.clone(), lampTop = V3(end.x, end.y - 0.22, end.z);
    b.add(cylBetween(hookTop, lampTop, 0.018, 0.018, 4), M.iron);
    const p = V3(lampTop.x, lampTop.y - 0.88 * s, lampTop.z);
    lantern(p, s, false);
    const L = new THREE.PointLight(0xffa24a, 0, 22, 2); L.position.copy(p); model.add(L); DET.lights.push({ L, k: 0.6, ph: 3 });
  }

  // ---------- штурвал и нактоуз ----------
  {
    const x = -11.0, y = H.deckY(x, 2.0), cy = y + 1.25;
    const wg = new THREE.Group(); wg.position.set(x, cy, 0); model.add(wg);
    const wb = new Batch();
    const rim = new THREE.TorusGeometry(0.72, 0.055, 8, 32); rim.rotateY(PI / 2); wb.add(rim, M.rail);
    const rim2 = new THREE.TorusGeometry(0.3, 0.04, 6, 20); rim2.rotateY(PI / 2); wb.add(rim2, M.rail);
    wb.add(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 12).rotateZ(PI / 2), M.gold);
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * TAU, d = V3(0, Math.cos(a), Math.sin(a));
      wb.add(cylBetween(d.clone().multiplyScalar(0.1), d.clone().multiplyScalar(0.95), 0.035, 0.03, 6), M.rail);
      wb.add(new THREE.SphereGeometry(0.05, 8, 6), M.rail, M4(0, d.y * 1.0, d.z * 1.0));
    }
    wb.build(wg); DET.wheel = wg;
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8).rotateZ(PI / 2), M.iron, M4(x - 0.2, cy, 0));
    for (const dx of [-0.55, 0.15]) { b.add(new THREE.BoxGeometry(0.16, 1.4, 0.32), M.rail, M4(x + dx, y + 0.7, 0)); b.add(new THREE.BoxGeometry(0.3, 0.12, 0.5), M.rail, M4(x + dx, y + 0.06, 0)); }
    // нактоуз
    b.add(new THREE.CylinderGeometry(0.28, 0.34, 1.0, 8), M.rail, M4(x + 1.3, y + 0.5, 0));
    b.add(new THREE.SphereGeometry(0.3, 14, 8, 0, TAU, 0, PI / 2), M.bronze, M4(x + 1.3, y + 1.0, 0));
  }

  // ---------- шпиль ----------
  {
    const x = -5.6, y = H.deckY(x, 0);
    b.add(new THREE.CylinderGeometry(0.42, 0.55, 1.0, 12), M.rail, M4(x, y + 0.5, 0));
    b.add(new THREE.CylinderGeometry(0.6, 0.6, 0.25, 12), M.rail, M4(x, y + 1.1, 0));
    b.add(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 12), M.gold, M4(x, y + 1.25, 0));
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; b.add(cylBetween(V3(x + Math.cos(a) * 0.5, y + 1.1, Math.sin(a) * 0.5), V3(x + Math.cos(a) * 1.9, y + 1.1, Math.sin(a) * 1.9), 0.045, 0.04, 6), M.rail); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + PI / 8; b.add(new THREE.BoxGeometry(0.08, 0.9, 0.12), M.rail, M4(x + Math.cos(a) * 0.47, y + 0.5, Math.sin(a) * 0.47, 0, -a, 0)); }
  }

  // ---------- кофель-нагельные планки у мачт ----------
  for (const d of MASTDEF) {
    const x = d.x, y = d.deck;
    for (const dx of [-1.0, 1.0]) {
      b.add(new THREE.BoxGeometry(0.14, 0.12, 2.6), M.rail, M4(x + dx, y + 0.95, 0));
      for (const sz of [-1.2, 1.2]) b.add(new THREE.BoxGeometry(0.16, 0.95, 0.16), M.rail, M4(x + dx, y + 0.47, sz));
      for (let k = -4; k <= 4; k++) b.add(new THREE.CylinderGeometry(0.025, 0.035, 0.35, 5), M.rail, M4(x + dx, y + 1.0, k * 0.26));
    }
  }

  // ---------- шлюпка на рострах ----------
  {
    const L = 6.6, beam = 1.95, depth = 0.85, bx = 5.6, dk0 = H.deckY(bx, 0), by = dk0 + 1.35;
    const hullB = gridGeo(28, 10, (u, v) => {
      const xx = (u - 0.5) * L, a = lerp(-PI / 2, PI / 2, v);
      const hb = beam / 2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 2.4)), 0.55);
      const z = hb * Math.sin(a), yy = -depth * Math.cos(a) * (0.45 + 0.55 * hb / (beam / 2)) + 0.28 * (2 * u - 1) ** 2;
      return [xx, yy, z, u * 2, v];
    });
    b.add(hullB, M.boat, M4(bx, by, 0));
    for (const sz of [-1, 1]) {
      const g = []; for (let i = 0; i <= 20; i++) { const u = i / 20, hb = beam / 2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 2.4)), 0.55); g.push(V3(bx + (u - 0.5) * L, by + 0.28 * (2 * u - 1) ** 2, sz * hb)); }
      b.add(tubeAlong(g, 0.05, 5, 30), M.blue);
    }
    for (const xx of [-1.8, -0.6, 0.6, 1.8]) { const u = xx / L + 0.5, hb = beam / 2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 2.4)), 0.55); b.add(new THREE.BoxGeometry(0.28, 0.05, hb * 1.85), M.rail, M4(bx + xx, by - 0.18, 0)); }
    for (const sz of [-0.35, 0.35]) b.add(cylBetween(V3(bx - 2.6, by - 0.12, sz), V3(bx + 2.4, by - 0.08, sz * 0.8), 0.04, 0.03, 5), M.spar);
    { const ch = by - 0.5 - dk0; for (const xx of [-1.6, 1.6]) b.add(new THREE.BoxGeometry(0.3, ch, 1.6), M.rail, M4(bx + xx, dk0 + ch / 2, 0)); }
  }

  // ---------- бочки, ящики, бухты, ядра, колокол ----------
  {
    const bp = [[0.26, -0.45], [0.31, -0.3], [0.335, 0], [0.31, 0.3], [0.26, 0.45]].map(([r, y]) => new THREE.Vector2(r, y));
    const barrel = (x, y, z, lie = false, s = 1) => {
      const m = lie ? M4(x, y + 0.33 * s, z, PI / 2, 0, 0, s, s, s) : M4(x, y + 0.45 * s, z, 0, 0, 0, s, s, s);
      b.add(new THREE.LatheGeometry(bp, 14), M.yard, m.clone());
      for (const hy of [-0.36, -0.2, 0.2, 0.36]) { const r = Math.abs(hy) > 0.3 ? 0.29 : 0.325; const h = new THREE.CylinderGeometry(r, r, 0.04, 14, 1, true); h.translate(0, hy, 0); b.add(h, M.iron, m.clone()); }
      if (!lie) { const top = new THREE.CircleGeometry(0.26, 14); top.rotateX(-PI / 2); top.translate(0, 0.44, 0); b.add(top, M.yard, m.clone()); }
    };
    const dy = x => H.deckY(x, 0);
    for (const [x, z] of [[-1.2, 2.6], [-1.85, 2.9], [-1.5, 2.2], [8.6, -2.6], [8.0, -3.0]]) barrel(x, dy(x), z);
    barrel(-1.6, dy(-1.6) + 0.9, 2.55, false, 0.95);
    barrel(8.4, dy(8.4), -2.0, true);
    const qy = x => H.deckY(x, 2.0);
    barrel(-8.0, qy(-8.0), -3.3); barrel(-8.0, qy(-8.0), 3.3, false, 0.9);
    for (const [x, y, z, s, r] of [[-0.6, dy(-0.6), -2.9, 0.75, 0.2], [-0.5, dy(-0.6) + 0.75, -2.9, 0.6, -0.3], [7.6, dy(7.6), 2.7, 0.8, 0.1], [14.0, H.deckY(14, 2), 2.2, 0.7, 0.4]]) {
      const box = new THREE.BoxGeometry(s * 1.2, s, s); const u = box.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 0.5, u.getY(i) * 0.25);
      b.add(box, M.deck, M4(x, y + s / 2, z, 0, r, 0));
    }
    const coil = (x, y, z, R = 0.42) => { for (let k = 0; k < 3; k++) { const t = new THREE.TorusGeometry(R - k * 0.09, 0.05, 6, 20); t.rotateX(PI / 2); b.add(t, M.ropeD, M4(x, y + 0.05 + k * 0.08, z)); } };
    coil(2.6, dy(2.6), 2.2); coil(2.6, dy(2.6), -2.2); coil(-0.2, dy(-0.2), 0); coil(13.2, H.deckY(13.2, 2), -1.3); coil(-9.8, qy(-9.8), 2.0, 0.36); coil(-9.8, qy(-9.8), -2.0, 0.36);
    // пирамиды ядер
    for (const [x, z] of [[3.8, 3.0], [3.8, -3.0], [-4.6, 3.1]]) {
      const y0 = dy(x);
      for (let l = 0; l < 3; l++) for (let i = 0; i < 3 - l; i++) for (let j = 0; j < 3 - l; j++)
        b.add(new THREE.SphereGeometry(0.11, 8, 6), M.gunIron, M4(x + (i - (2 - l) / 2) * 0.22, y0 + 0.11 + l * 0.17, z + (j - (2 - l) / 2) * 0.22));
    }
    // рында в бельфрие
    const bx = 10.75, by = H.deckY(bx, 2.0);
    for (const sz of [-0.55, 0.55]) b.add(new THREE.BoxGeometry(0.14, 1.9, 0.14), M.rail, M4(bx, by + 0.95, sz));
    b.add(new THREE.BoxGeometry(0.5, 0.14, 1.4), M.rail, M4(bx, by + 1.95, 0));
    b.add(new THREE.ConeGeometry(0.55, 0.45, 4), M.blue, M4(bx, by + 2.25, 0, 0, PI / 4, 0));
    b.add(new THREE.SphereGeometry(0.12, 8, 6), M.gold, M4(bx, by + 2.55, 0));
    const bellP = [[0.02, 0.4], [0.12, 0.38], [0.16, 0.25], [0.19, 0.0], [0.27, -0.12], [0.29, -0.16], [0.25, -0.16]].map(([r, y]) => new THREE.Vector2(r, y));
    b.add(new THREE.LatheGeometry(bellP, 16), M.gold, M4(bx, by + 1.42, 0));
  }

  // ---------- якоря на кат-балках ----------
  {
    const anchor = (side) => {
      const x = 14.1, f = H.frame(x, 3.1, side, 0.32, true), m = f.m.clone();
      const add = (geo, mat, mx) => { if (mx) geo.applyMatrix4(mx); geo.applyMatrix4(m); b.add(geo, mat); };
      add(new THREE.CylinderGeometry(0.09, 0.11, 3.4, 8), M.gunIron, M4(0, 0, 0.12));
      const arm = []; for (let i = 0; i <= 12; i++) { const a = lerp(-1.2, 1.2, i / 12); arm.push(V3(Math.sin(a) * 1.05, -1.7 + 1.05 * (1 - Math.cos(a)) , 0.12)); }
      add(tubeAlong(arm, 0.1, 6, 24), M.gunIron);
      for (const s of [-1, 1]) { const fl = new THREE.ConeGeometry(0.28, 0.6, 3); add(fl, M.gunIron, M4(s * Math.sin(1.2) * 1.05, -1.7 + 1.05 * (1 - Math.cos(1.2)) + 0.2, 0.12, 0, 0, -s * 0.5, 1, 1, 0.35)); }
      add(new THREE.BoxGeometry(0.22, 0.22, 2.6), M.yard, M4(0, 1.45, 0.12));
      const ring = new THREE.TorusGeometry(0.22, 0.04, 6, 16); add(ring, M.gunIron, M4(0, 1.85, 0.12));
      // кат-балка
      const cat = H.frame(14.8, H.rail(14.8) - 0.15, side, 0, true);
      const cg = new THREE.BoxGeometry(0.34, 0.34, 1.6); cg.translate(0, 0, 0.5); cg.applyMatrix4(cat.m); b.add(cg, M.black);
      const ce = cat.p.clone().addScaledVector(cat.n, 1.25);
      RIG.static && RIG.static.add(ce, V3(0, 1.85, 0.12).applyMatrix4(m), 0.04);
      RIG.static && RIG.static.add(V3(0, -1.6, 0.12).applyMatrix4(m), V3(...H.P(13.2, H.sAt(13.2, H.rail(13.2) - 0.4), side, 0.05)), 0.035);
    };
    anchor(1); anchor(-1);
  }

  // ---------- трапы на шканцы и бак ----------
  {
    const ladder = (xTop, dir, z, lift) => {
      const yTop = H.deckY(xTop, lift), yBot = H.deckY(xTop, 0), n = 7, run = 1.5;
      for (const sz of [-0.38, 0.38]) b.add(cylBetween(V3(xTop, yTop + 0.05, z + sz), V3(xTop + dir * run, yBot, z + sz), 0.05, 0.05, 4), M.rail);
      for (let i = 1; i < n; i++) { const t = i / n; b.add(new THREE.BoxGeometry(0.22, 0.05, 0.72), M.rail, M4(xTop + dir * run * t, lerp(yTop, yBot, t), z)); }
      b.add(cylBetween(V3(xTop, yTop + 0.9, z + 0.45), V3(xTop + dir * run, yBot + 0.9, z + 0.45), 0.03, 0.03, 4), M.rail);
    };
    for (const sz of [-1, 1]) { ladder(-6.95, 1, sz * 3.55, 2.0); ladder(10.15, -1, sz * 3.15, 2.0); }
  }

  const meshes = b.build(model);
  meshes.forEach(m => { m.castShadow = true; m.receiveShadow = true; });
}

const _cm = new THREE.Matrix4(), _cr = new THREE.Matrix4();
function updateDetails(dt) {
  const night = light.night, t = STATE.t;
  for (const m of DET.lamps) m.emissiveIntensity = 0.15 + night * 5 * (0.92 + 0.08 * Math.sin(t * 11.3) * Math.sin(t * 7.1));
  for (const g of DET.glows) g.sp.material.opacity = night * 0.85 * (0.9 + 0.1 * Math.sin(t * 9 + g.s * 5));
  for (const L of DET.lights) L.L.intensity = night * 45 * L.k * (0.85 + 0.15 * Math.sin(t * 12.7 + L.ph) * Math.sin(t * 5.3 + L.ph));
  if (DET.wheel) DET.wheel.rotation.x = (SHIP.rudderAngle || 0) * 6;
  const C = DET.cannons; if (!C) return;
  let dirty = false;
  for (let i = 0; i < C.recoil.length; i++) {
    if (C.recoil[i] === 0 && C.vel[i] === 0) continue;
    C.vel[i] += (-C.recoil[i] * 18 - C.vel[i] * 7) * dt; C.recoil[i] += C.vel[i] * dt;
    if (Math.abs(C.recoil[i]) < 1e-4 && Math.abs(C.vel[i]) < 1e-3) { C.recoil[i] = 0; C.vel[i] = 0; }
    _cm.copy(C.base[i]).multiply(_cr.makeTranslation(0, 0, -C.recoil[i]));
    C.barrels.setMatrixAt(i, _cm); C.carrs.setMatrixAt(i, _cm); dirty = true;
  }
  if (dirty) { C.barrels.instanceMatrix.needsUpdate = true; C.carrs.instanceMatrix.needsUpdate = true; }
}
