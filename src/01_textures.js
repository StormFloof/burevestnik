// ===================== процедурные текстуры =====================
function makeNoiseTex() {
  const S = 256, d = new Uint8Array(S * S * 4), R = mulberry(17);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, o = (y * S + x) * 4;
    d[o] = c8(0.5 + 0.78 * NZ.fbm(u * 8, v * 8, 5, 8));
    d[o + 1] = c8(0.5 + 0.8 * NZ2.fbm(u * 16, v * 16, 4, 16));
    d[o + 2] = c8(0.5 + 0.85 * NZ.fbm(u * 32 + 7, v * 32 + 3, 3, 32));
    d[o + 3] = c8(R());
  }
  return dataTex(d, S, S, { repeat: true });
}

// тайлящаяся карта нормалей ряби (сумма синусов с целыми частотами)
function makeWaterNormal() {
  const S = 512, d = new Uint8Array(S * S * 4), R = mulberry(5), W = [];
  for (let i = 0; i < 30; i++) {
    let kx, ky;
    do { kx = Math.round((R() * 2 - 1) * 26); ky = Math.round((R() * 2 - 1) * 26); } while (kx * kx + ky * ky < 9);
    const k = Math.hypot(kx, ky);
    W.push([kx, ky, 0.9 / Math.pow(k, 1.35), R() * TAU]);
  }
  const cs = 0.045;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; let dx = 0, dy = 0;
    for (const w of W) { const c = Math.cos(TAU * (w[0] * u + w[1] * v) + w[3]) * w[2] * TAU; dx += c * w[0]; dy += c * w[1]; }
    let nx = -dx * cs, ny = -dy * cs, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * S + x) * 4; d[o] = c8(nx * 0.5 + 0.5); d[o + 1] = c8(ny * 0.5 + 0.5); d[o + 2] = c8(nz); d[o + 3] = 255;
  }
  return dataTex(d, S, S, { repeat: true });
}

function heightToNormal(h, W, H, strength) {
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xl = (x - 1 + W) % W, xr = (x + 1) % W, yu = (y - 1 + H) % H, yd = (y + 1) % H;
    const dx = (h[y * W + xr] - h[y * W + xl]) * strength, dy = (h[yd * W + x] - h[yu * W + x]) * strength;
    let nx = -dx, ny = -dy, nz = 1; const l = Math.hypot(nx, ny, nz);
    const o = (y * W + x) * 4; d[o] = c8(nx / l * 0.5 + 0.5); d[o + 1] = c8(ny / l * 0.5 + 0.5); d[o + 2] = c8(nz / l * 0.5 + 0.5); d[o + 3] = 255;
  }
  return dataTex(d, W, H, { repeat: true });
}

// доски: цвет + шероховатость + нормали. Доски идут вдоль U, ряды стопкой по V.
function makePlanks(W, H, { rows = 8, seed = 3, base = [0.56, 0.40, 0.25], vary = 1, dirt = 0.25 } = {}) {
  const R = mulberry(seed), rd = [];
  for (let r = 0; r < rows; r++) {
    const n = 2 + ((R() * 2) | 0), cuts = []; let p = R();
    for (let i = 0; i < n; i++) { cuts.push(p % 1); p += (1 / n) * (0.7 + R() * 0.6); }
    cuts.sort((a, b) => a - b);
    rd.push({ cuts, tint: cuts.map(() => 0.74 + R() * 0.46 * vary), hue: cuts.map(() => R() * 2 - 1), id: cuts.map(() => (R() * 50) | 0) });
  }
  const col = new Uint8Array(W * H * 4), rough = new Uint8Array(W * H * 4), hgt = new Float32Array(W * H);
  const plankPx = H / rows;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H, fy = v * rows, r = Math.min(rows - 1, Math.floor(fy)), ly = fy - r, row = rd[r];
    const acrossPx = Math.min(ly, 1 - ly) * plankPx;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, cuts = row.cuts;
      let si = cuts.length - 1; for (let i = 0; i < cuts.length; i++) if (u >= cuts[i]) si = i;
      let du = 1; for (const c of cuts) { const dd = Math.abs(u - c); du = Math.min(du, dd, 1 - dd); }
      const alongPx = du * W, pid = row.id[si];
      const g1 = NZ.fbm(u * 6 + pid, fy * 7, 4, 6, rows * 7);
      const streak = NZ2.fbm(u * 10 + pid * 3, fy * 46, 3, 10, rows * 46);
      const rings = 0.5 + 0.5 * Math.sin((ly * 2.2 + g1 * 4.5 + pid * 0.37) * TAU);
      const big = NZ.fbm(u * 3, v * 3, 3, 3);
      let k = row.tint[si] * (0.80 + 0.14 * rings + 0.28 * streak) * (1 - dirt * Math.max(0, big));
      const hu = row.hue[si] * 0.06;
      let cr = base[0] * k * (1 + hu), cg = base[1] * k, cb = base[2] * k * (1 - hu);
      let h = 0.6 + streak * 0.12 + rings * 0.05, ro = 0.66 + 0.18 * (1 - rings) + 0.12 * Math.max(0, big);
      // гвозди-нагели у торцов
      if (alongPx > 5 && alongPx < 15) {
        for (const ny of [0.28, 0.72]) {
          const ddx = (alongPx - 10), ddy = (ly - ny) * plankPx;
          if (ddx * ddx + ddy * ddy < 7) { cr *= 0.45; cg *= 0.42; cb *= 0.4; h -= 0.25; }
        }
      }
      // щели (конопатка)
      const gapA = smooth(1.1, 2.6, acrossPx), gapB = smooth(0.6, 1.8, alongPx), gap = Math.min(gapA, gapB);
      cr = lerp(0.035, cr, gap); cg = lerp(0.028, cg, gap); cb = lerp(0.022, cb, gap);
      h = lerp(0, h, gap); ro = lerp(0.95, ro, gap);
      const o = (y * W + x) * 4;
      col[o] = c8(Math.pow(cr, 1 / 2.2)); col[o + 1] = c8(Math.pow(cg, 1 / 2.2)); col[o + 2] = c8(Math.pow(cb, 1 / 2.2)); col[o + 3] = 255;
      rough[o] = 255; rough[o + 1] = c8(ro); rough[o + 2] = 0; rough[o + 3] = 255;
      hgt[y * W + x] = h;
    }
  }
  return { map: dataTex(col, W, H, { srgb: true, repeat: true }), rough: dataTex(rough, W, H, { repeat: true }), normal: heightToNormal(hgt, W, H, 2.2) };
}

// волокна дерева для рангоута (волокна вдоль V)
function makeGrain(W, H, base = [0.5, 0.34, 0.2], seed = 4) {
  const col = new Uint8Array(W * H * 4), rough = new Uint8Array(W * H * 4), hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const s = NZ.fbm(u * 24 + seed, v * 3, 4, 24, 3), s2 = NZ2.fbm(u * 64, v * 6, 2, 64, 6), b = NZ.fbm(u * 4, v * 4, 3, 4);
    const k = 0.82 + 0.3 * s + 0.12 * s2 - 0.12 * Math.max(0, b);
    const o = (y * W + x) * 4;
    col[o] = c8(Math.pow(base[0] * k, 1 / 2.2)); col[o + 1] = c8(Math.pow(base[1] * k, 1 / 2.2)); col[o + 2] = c8(Math.pow(base[2] * k, 1 / 2.2)); col[o + 3] = 255;
    rough[o] = 255; rough[o + 1] = c8(0.55 + 0.25 * s2 + 0.15 * b); rough[o + 3] = 255;
    hgt[y * W + x] = s * 0.5 + s2 * 0.3;
  }
  return { map: dataTex(col, W, H, { srgb: true, repeat: true }), rough: dataTex(rough, W, H, { repeat: true }), normal: heightToNormal(hgt, W, H, 1.2) };
}

function makeGrime(S = 256) {
  const d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, n = NZ.fbm(u * 8, v * 8, 5, 8), m = NZ2.fbm(u * 32, v * 32, 2, 32), o = (y * S + x) * 4;
    d[o] = 255; d[o + 1] = c8(0.45 + 0.5 * n + 0.15 * m); d[o + 2] = c8(0.5 + n); d[o + 3] = 255;
  }
  return dataTex(d, S, S, { repeat: true });
}

// парусина
function makeSailTex(emblem, seed) {
  const S = 1024, [c, g] = mkCanvas(S, S), R = mulberry(seed);
  const [nc, ng] = mkCanvas(256, 256), img = ng.createImageData(256, 256), d = img.data;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = x / 256, v = y / 256, n = NZ.fbm(u * 5 + seed, v * 5, 5, 5), m = NZ2.fbm(u * 20, v * 20, 2, 20);
    let k = 0.93 + 0.07 * n + 0.03 * m;
    k *= 1 - 0.16 * smooth(0.45, 1, v) * (0.6 + n);                // копоть/грязь снизу
    k *= 1 - 0.05 * Math.max(0, Math.sin(u * 40 + n * 6)) * v;     // потёки
    const o = (y * 256 + x) * 4;
    d[o] = 236 * k; d[o + 1] = 224 * k; d[o + 2] = 196 * k; d[o + 3] = 255;
  }
  ng.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(nc, 0, 0, S, S);
  // полотнища (вертикальные швы)
  const n = 14;
  for (let i = 1; i < n; i++) {
    const x = i * S / n + (R() - 0.5) * 3;
    g.fillStyle = 'rgba(95,72,40,0.22)'; g.fillRect(x - 3, 0, 6, S);
    g.strokeStyle = 'rgba(70,50,28,0.45)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - 3, 0); g.lineTo(x - 3, S); g.moveTo(x + 3, 0); g.lineTo(x + 3, S); g.stroke();
    g.strokeStyle = 'rgba(255,250,235,0.18)'; g.beginPath(); g.moveTo(x + 5, 0); g.lineTo(x + 5, S); g.stroke();
  }
  // рифы
  for (const ry of [0.09, 0.19, 0.29]) {
    const y = ry * S;
    g.fillStyle = 'rgba(110,85,50,0.22)'; g.fillRect(0, y - 6, S, 12);
    g.strokeStyle = 'rgba(60,44,24,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, y - 6); g.lineTo(S, y - 6); g.moveTo(0, y + 6); g.lineTo(S, y + 6); g.stroke();
    g.strokeStyle = 'rgba(70,52,30,0.75)'; g.lineWidth = 3;
    for (let x = 18; x < S; x += 36) { g.beginPath(); g.moveTo(x, y - 2); g.quadraticCurveTo(x + 3, y + 10, x - 1, y + 20); g.stroke(); }
  }
  // заплаты
  for (let i = 0; i < 6; i++) {
    const w = 50 + R() * 90, h = 40 + R() * 80, x = R() * (S - w), y = S * 0.35 + R() * (S * 0.6 - h);
    const tt = R() < 0.5 ? 'rgba(200,180,140,0.35)' : 'rgba(250,240,215,0.32)';
    g.fillStyle = tt; g.fillRect(x, y, w, h);
    g.setLineDash([5, 4]); g.strokeStyle = 'rgba(70,50,28,0.55)'; g.lineWidth = 1.5; g.strokeRect(x + 3, y + 3, w - 6, h - 6); g.setLineDash([]);
  }
  // ликтрос / кромки
  g.strokeStyle = 'rgba(90,66,36,0.5)'; g.lineWidth = 22; g.strokeRect(0, 0, S, S);
  g.strokeStyle = 'rgba(60,44,24,0.55)'; g.lineWidth = 2; g.strokeRect(20, 20, S - 40, S - 40);
  if (emblem) {
    const cx = S * 0.5, cy = S * 0.58, r = S * 0.25;
    g.save(); g.globalAlpha = 0.93;
    const gr = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    gr.addColorStop(0, '#9c1d16'); gr.addColorStop(1, '#6a100c');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.strokeStyle = '#c0913c'; g.lineWidth = 12; g.beginPath(); g.arc(cx, cy, r - 14, 0, TAU); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r - 30, 0, TAU); g.stroke();
    // лучи компаса
    g.fillStyle = 'rgba(192,145,60,0.85)';
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU, l = i % 2 ? r * 0.82 : r * 0.92, w = i % 2 ? 0.05 : 0.08;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      g.lineTo(cx + Math.cos(a + w) * r * 0.62, cy + Math.sin(a + w) * r * 0.62);
      g.lineTo(cx + Math.cos(a - w) * r * 0.62, cy + Math.sin(a - w) * r * 0.62); g.fill();
    }
    // буревестник
    const s = r * 0.62;
    g.fillStyle = '#120c0a';
    g.beginPath(); g.moveTo(cx, cy - 0.06 * s);
    g.quadraticCurveTo(cx - 0.38 * s, cy - 0.52 * s, cx - 1.0 * s, cy - 0.3 * s);
    g.quadraticCurveTo(cx - 0.62 * s, cy - 0.22 * s, cx - 0.5 * s, cy - 0.05 * s);
    g.quadraticCurveTo(cx - 0.34 * s, cy - 0.12 * s, cx - 0.22 * s, cy + 0.1 * s);
    g.lineTo(cx - 0.13 * s, cy + 0.5 * s); g.lineTo(cx, cy + 0.34 * s); g.lineTo(cx + 0.13 * s, cy + 0.5 * s);
    g.lineTo(cx + 0.22 * s, cy + 0.1 * s);
    g.quadraticCurveTo(cx + 0.34 * s, cy - 0.12 * s, cx + 0.5 * s, cy - 0.05 * s);
    g.quadraticCurveTo(cx + 0.62 * s, cy - 0.22 * s, cx + 1.0 * s, cy - 0.3 * s);
    g.quadraticCurveTo(cx + 0.38 * s, cy - 0.52 * s, cx, cy - 0.06 * s);
    g.fill();
    g.beginPath(); g.arc(cx, cy - 0.13 * s, 0.1 * s, 0, TAU); g.fill();
    // молния
    g.fillStyle = '#e2b354';
    g.beginPath(); g.moveTo(cx + 0.06 * s, cy + 0.05 * s); g.lineTo(cx - 0.12 * s, cy + 0.42 * s); g.lineTo(cx + 0.0 * s, cy + 0.40 * s);
    g.lineTo(cx - 0.1 * s, cy + 0.78 * s); g.lineTo(cx + 0.16 * s, cy + 0.3 * s); g.lineTo(cx + 0.03 * s, cy + 0.32 * s); g.closePath(); g.fill();
    g.restore();
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5; g.drawImage(nc, 0, 0, S, S);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  return canvasTex(c);
}

function makeFlagTex() {
  const [c, g] = mkCanvas(512, 320);
  g.fillStyle = '#0d0c0d'; g.fillRect(0, 0, 512, 320);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * 512, Math.random() * 320, 2, 2); }
  const cx = 256, cy = 140;
  g.fillStyle = '#e9e2d0'; g.strokeStyle = '#e9e2d0'; g.lineCap = 'round';
  g.lineWidth = 26;
  g.beginPath(); g.moveTo(cx - 120, cy + 40); g.lineTo(cx + 120, cy + 150); g.moveTo(cx + 120, cy + 40); g.lineTo(cx - 120, cy + 150); g.stroke();
  for (const [x, y] of [[cx - 128, cy + 34], [cx - 128, cy + 156], [cx + 128, cy + 34], [cx + 128, cy + 156]]) { g.beginPath(); g.arc(x, y, 17, 0, TAU); g.fill(); }
  g.beginPath(); g.ellipse(cx, cy - 10, 74, 80, 0, 0, TAU); g.fill();
  g.fillRect(cx - 44, cy + 40, 88, 50);
  g.fillStyle = '#0d0c0d';
  g.beginPath(); g.ellipse(cx - 28, cy - 4, 20, 24, 0.2, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(cx + 28, cy - 4, 20, 24, -0.2, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(cx, cy + 22); g.lineTo(cx - 10, cy + 40); g.lineTo(cx + 10, cy + 40); g.fill();
  for (let i = -2; i <= 2; i++) g.fillRect(cx + i * 15 - 3, cy + 58, 6, 30);
  return canvasTex(c);
}

function makePennantTex() {
  const [c, g] = mkCanvas(512, 64);
  const gr = g.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, '#8e1610'); gr.addColorStop(1, '#5c0d09');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#d7a548'; g.fillRect(0, 26, 512, 12);
  return canvasTex(c);
}

function makeNameTex() {
  const [c, g] = mkCanvas(1024, 160);
  const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#13213d'); gr.addColorStop(1, '#0a1428');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = '#c99a45'; g.lineWidth = 8; g.strokeRect(8, 8, 1008, 144);
  g.lineWidth = 2; g.strokeRect(22, 22, 980, 116);
  g.font = 'bold 84px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#5a3f12'; g.fillText('БУРЕВЕСТНИКЪ', 515, 86);
  const tg = g.createLinearGradient(0, 40, 0, 120); tg.addColorStop(0, '#ffe7a3'); tg.addColorStop(0.5, '#d9a546'); tg.addColorStop(1, '#8a5d1d');
  g.fillStyle = tg; g.fillText('БУРЕВЕСТНИКЪ', 512, 82);
  for (const x of [60, 964]) { g.fillStyle = '#c99a45'; g.beginPath(); g.arc(x, 80, 18, 0, TAU); g.fill(); g.fillStyle = '#13213d'; g.beginPath(); g.arc(x, 80, 9, 0, TAU); g.fill(); }
  return canvasTex(c);
}

async function makeTextures() {
  const T = {};
  setLoad('Замешиваем шум…', 0.04); await nextFrame();
  T.noise = makeNoiseTex();
  T.waterN = makeWaterNormal();
  setLoad('Строгаем доски обшивки…', 0.14); await nextFrame();
  T.hull = makePlanks(1024, 512, { rows: 8, seed: 3, base: [0.2, 0.115, 0.06], dirt: 0.3 });
  setLoad('Драим палубу…', 0.26); await nextFrame();
  T.deck = makePlanks(1024, 512, { rows: 8, seed: 11, base: [0.4, 0.29, 0.18], vary: 0.8, dirt: 0.35 });
  setLoad('Тешем мачты…', 0.36); await nextFrame();
  T.grain = makeGrain(256, 512, [0.46, 0.31, 0.18]);
  T.grime = makeGrime();
  setLoad('Шьём паруса…', 0.44); await nextFrame();
  T.sail = makeSailTex(false, 21);
  T.sailE = makeSailTex(true, 33);
  T.flag = makeFlagTex(); T.pennant = makePennantTex(); T.name = makeNameTex();
  return T;
}
