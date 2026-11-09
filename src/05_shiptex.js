// ===================== текстуры корабля (медь, корма, переборки, окна, решётки) =====================
function makeCopper(W = 512, H = 512) {
  const rows = 8, per = 4, R = mulberry(9), tint = [];
  for (let i = 0; i < rows * per; i++) tint.push(R());
  const col = new Uint8Array(W * H * 4), rm = new Uint8Array(W * H * 4), hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H, fy = v * rows, r = Math.min(rows - 1, fy | 0), ly = fy - r;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, fu = u * per + (r & 1) * 0.5, c = Math.floor(fu), lx = fu - c;
      const pid = r * per + ((c % per) + per) % per, t = tint[pid];
      const ex = Math.min(lx, 1 - lx) * W / per, ey = Math.min(ly, 1 - ly) * H / rows;
      const n = NZ.fbm(u * 6, v * 6, 5, 6), n2 = NZ2.fbm(u * 3 + 5, v * 3, 4, 3), n3 = NZ.fbm(u * 24, v * 24, 2, 24);
      // медь -> окисленная бурая -> зелёная патина
      let cr = 0.74, cg = 0.38, cb = 0.24;
      const ox = clamp(0.35 + t * 0.4 + n * 0.9, 0, 1);
      cr = lerp(cr, 0.30, ox); cg = lerp(cg, 0.15, ox); cb = lerp(cb, 0.09, ox);
      const pat = smooth(0.12, 0.42, n2 + n3 * 0.2 + (t - 0.5) * 0.2);
      cr = lerp(cr, 0.13, pat); cg = lerp(cg, 0.36, pat); cb = lerp(cb, 0.28, pat);
      let metal = 1 - pat * 0.95 - ox * 0.25, rough = 0.32 + ox * 0.3 + pat * 0.45 + n3 * 0.08;
      let h = ly * 0.5 + n3 * 0.05;
      // нахлёст листов и гвозди
      if (ey < 1.6 || ex < 1.2) { cr *= 0.55; cg *= 0.55; cb *= 0.55; h -= 0.3; }
      const rv = (ey > 2.5 && ey < 5.5) || (ex > 2.5 && ex < 5.5);
      if (rv) {
        const along = ey > 2.5 && ey < 5.5 ? x : y;
        if (along % 9 < 2.2) { cr = lerp(cr, 0.9, 0.35); cg = lerp(cg, 0.55, 0.35); cb = lerp(cb, 0.35, 0.3); h += 0.25; metal = Math.max(metal, 0.7); }
      }
      const o = (y * W + x) * 4;
      col[o] = c8(Math.pow(cr, 1 / 2.2)); col[o + 1] = c8(Math.pow(cg, 1 / 2.2)); col[o + 2] = c8(Math.pow(cb, 1 / 2.2)); col[o + 3] = 255;
      rm[o] = 255; rm[o + 1] = c8(rough); rm[o + 2] = c8(metal); rm[o + 3] = 255;
      hgt[y * W + x] = h;
    }
  }
  return { map: dataTex(col, W, H, { srgb: true, repeat: true }), rm: dataTex(rm, W, H, { repeat: true }), normal: heightToNormal(hgt, W, H, 3) };
}

function noiseOverlay(g, W, H, a = 0.12, seed = 1) {
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = NZ.fbm(x / W * 7 + seed, y / H * 7, 4, 4096) * 0.8 + NZ2.fbm(x / W * 60, y / H * 60, 2) * 0.3;
    const k = 1 + n * a * 2, o = (y * W + x) * 4;
    d[o] = clamp(d[o] * k, 0, 255); d[o + 1] = clamp(d[o + 1] * k, 0, 255); d[o + 2] = clamp(d[o + 2] * k, 0, 255);
  }
  g.putImageData(img, 0, 0);
}

function drawLattice(g, x, y, w, h, step, color, lw) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.strokeStyle = color; g.lineWidth = lw;
  for (let k = -h; k < w + h; k += step) {
    g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + h, y + h); g.stroke();
    g.beginPath(); g.moveTo(x + k + h, y); g.lineTo(x + k, y + h); g.stroke();
  }
  g.restore();
}
function windowShape(g, x, y, w, h, arched) {
  g.beginPath();
  if (arched) { const r = w / 2; g.moveTo(x, y + h); g.lineTo(x, y + r); g.arc(x + r, y + r, r, PI, 0); g.lineTo(x + w, y + h); g.closePath(); }
  else g.rect(x, y, w, h);
}
function drawWindow(g, ge, x, y, w, h, arched, ppm) {
  const fr = Math.max(3, ppm * 0.06);
  g.save(); windowShape(g, x - fr, y - fr, w + fr * 2, h + fr * 2, arched);
  g.fillStyle = '#c99a45'; g.fill(); g.restore();
  g.save(); windowShape(g, x, y, w, h, arched); g.clip();
  const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#2a3a52'); gr.addColorStop(0.5, '#0b1220'); gr.addColorStop(1, '#1a2638');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.restore();
  drawLattice(g, x, y, w, h, Math.max(6, w / 4), 'rgba(20,14,8,0.9)', Math.max(1.2, ppm * 0.012));
  g.strokeStyle = '#6d4c1c'; g.lineWidth = Math.max(2, ppm * 0.025);
  g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke();
  if (ge) {
    ge.save(); windowShape(ge, x, y, w, h, arched); ge.clip();
    const eg = ge.createRadialGradient(x + w / 2, y + h * 0.6, 2, x + w / 2, y + h * 0.6, Math.max(w, h));
    eg.addColorStop(0, '#ffd08a'); eg.addColorStop(0.6, '#ff9a3c'); eg.addColorStop(1, '#a8501a');
    ge.fillStyle = eg; ge.fillRect(x, y, w, h); ge.restore();
    drawLattice(ge, x, y, w, h, Math.max(6, w / 4), 'rgba(0,0,0,0.85)', Math.max(1.2, ppm * 0.012));
    ge.strokeStyle = '#000'; ge.lineWidth = Math.max(2, ppm * 0.025);
    ge.beginPath(); ge.moveTo(x + w / 2, y); ge.lineTo(x + w / 2, y + h); ge.stroke();
  }
}
function goldScroll(g, x, y, s, dir) {
  g.save(); g.translate(x, y); g.scale(dir * s, s);
  g.strokeStyle = '#d4a24c'; g.lineCap = 'round'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(30, -40, 90, -40, 110, 0); g.bezierCurveTo(125, 30, 95, 55, 75, 35); g.bezierCurveTo(62, 22, 75, 8, 88, 16); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(40, -26); g.bezierCurveTo(30, -60, 60, -75, 70, -55); g.stroke();
  g.beginPath(); g.moveTo(20, -10); g.bezierCurveTo(-5, 10, 5, 40, 30, 35); g.stroke();
  g.fillStyle = '#e8bd62'; for (const [px, py] of [[88, 16], [70, -55], [30, 35]]) { g.beginPath(); g.arc(px, py, 6, 0, TAU); g.fill(); }
  g.restore();
}
function drawEmblem(g, cx, cy, s) {
  g.save(); g.translate(cx, cy); g.scale(s, s);
  // щит
  g.beginPath(); g.moveTo(-60, -70); g.lineTo(60, -70); g.lineTo(60, 10); g.quadraticCurveTo(60, 70, 0, 92); g.quadraticCurveTo(-60, 70, -60, 10); g.closePath();
  const gr = g.createLinearGradient(0, -70, 0, 90); gr.addColorStop(0, '#9e1e16'); gr.addColorStop(1, '#5c0e0a');
  g.fillStyle = gr; g.fill(); g.strokeStyle = '#e0b25a'; g.lineWidth = 9; g.stroke();
  // птица
  g.fillStyle = '#0d0a08';
  g.beginPath(); g.moveTo(0, -18); g.quadraticCurveTo(-22, -48, -52, -38); g.quadraticCurveTo(-34, -30, -28, -18); g.quadraticCurveTo(-16, -22, -10, -8);
  g.lineTo(-6, 22); g.lineTo(0, 14); g.lineTo(6, 22); g.lineTo(10, -8); g.quadraticCurveTo(16, -22, 28, -18); g.quadraticCurveTo(34, -30, 52, -38); g.quadraticCurveTo(22, -48, 0, -18); g.fill();
  g.beginPath(); g.arc(0, -22, 6, 0, TAU); g.fill();
  g.fillStyle = '#e0b25a'; g.beginPath(); g.moveTo(4, 8); g.lineTo(-8, 38); g.lineTo(1, 36); g.lineTo(-6, 64); g.lineTo(12, 30); g.lineTo(3, 32); g.closePath(); g.fill();
  // корона
  g.fillStyle = '#e0b25a';
  g.beginPath(); g.moveTo(-46, -80); g.lineTo(-52, -118); g.lineTo(-26, -96); g.lineTo(0, -128); g.lineTo(26, -96); g.lineTo(52, -118); g.lineTo(46, -80); g.closePath(); g.fill();
  g.fillStyle = '#9e1e16'; for (const x of [-26, 0, 26]) { g.beginPath(); g.arc(x, -88, 5, 0, TAU); g.fill(); }
  g.fillStyle = '#f2d389'; for (const [x, y] of [[-52, -118], [0, -128], [52, -118]]) { g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); }
  g.restore();
}

// корма: L — раскладка в метрах
function makeTransomTex(L, T) {
  const S = 1024, [c, g] = mkCanvas(S, S), [ce, ge] = mkCanvas(S, S);
  const X = z => (z + L.ZM) / (2 * L.ZM) * S, Y = y => (1 - (y - L.y0) / (L.y1 - L.y0)) * S, ppm = S / (2 * L.ZM);
  g.fillStyle = '#16243f'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#3a2819'; g.fillRect(0, Y(L.paint), S, S - Y(L.paint));
  for (let y = L.y0; y < L.y1; y += 0.27) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, Y(y), S, 1.6);
    g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`; g.fillRect(0, Y(y) - ppm * 0.12, S, ppm * 0.1);
  }
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  for (const w of L.wales) { g.fillStyle = '#0b0908'; g.fillRect(0, Y(w + 0.12), S, ppm * 0.24); }
  // золотые карнизы
  const gl = (y, t = 0.05) => { g.fillStyle = '#c99a45'; g.fillRect(0, Y(y + t / 2), S, Math.max(2, ppm * t)); };
  gl(L.paint + 0.04, 0.07); for (const y of L.cornice) gl(y, 0.06);
  // фриз (как на бортах)
  const f0 = L.rail - 0.5, f1 = L.rail - 0.16;
  g.fillStyle = '#4a0d07'; g.fillRect(0, Y(f1), S, Y(f0) - Y(f1));
  for (let z = -L.ZM; z < L.ZM; z += 0.75) {
    const cx = X(z + 0.375), cy = (Y(f0) + Y(f1)) / 2, hw = ppm * 0.375 * 0.62, hh = (Y(f0) - Y(f1)) / 2 * 0.62;
    g.beginPath(); g.moveTo(cx - hw, cy); g.lineTo(cx, cy - hh); g.lineTo(cx + hw, cy); g.lineTo(cx, cy + hh); g.closePath();
    g.fillStyle = '#8a5a1c'; g.fill(); g.strokeStyle = '#d9aa52'; g.lineWidth = 3; g.stroke();
  }
  gl(f0, 0.04); gl(f1, 0.04);
  // имя
  g.drawImage(T.name.image, X(-L.nameW / 2), Y(L.nameY + 0.28), X(L.nameW / 2) - X(-L.nameW / 2), Y(L.nameY - 0.28) - Y(L.nameY + 0.28));
  // пилястры
  for (const row of L.rows) {
    const zs = row.zs;
    for (let i = 0; i <= zs.length; i++) {
      const z = i === 0 ? zs[0] - row.w * 0.85 : i === zs.length ? zs[zs.length - 1] + row.w * 0.85 : (zs[i - 1] + zs[i]) / 2;
      const pw = ppm * 0.14;
      g.fillStyle = '#1d2d4f'; g.fillRect(X(z) - pw / 2, Y(row.y + row.h / 2 + 0.12), pw, Y(row.y - row.h / 2 - 0.12) - Y(row.y + row.h / 2 + 0.12));
      g.strokeStyle = '#c99a45'; g.lineWidth = 2.5; g.strokeRect(X(z) - pw / 2, Y(row.y + row.h / 2 + 0.12), pw, Y(row.y - row.h / 2 - 0.12) - Y(row.y + row.h / 2 + 0.12));
      g.fillStyle = '#d9aa52'; g.fillRect(X(z) - pw * 0.8, Y(row.y + row.h / 2 + 0.16), pw * 1.6, ppm * 0.07);
      g.fillRect(X(z) - pw * 0.8, Y(row.y - row.h / 2 - 0.1), pw * 1.6, ppm * 0.07);
    }
    for (const z of zs) drawWindow(g, ge, X(z - row.w / 2), Y(row.y + row.h / 2), row.w * ppm, row.h * ppm, row.arched, ppm);
  }
  // герб и завитки
  const ey = (L.rail + L.archTop) / 2 - 0.05;
  goldScroll(g, X(-0.55), Y(ey - 0.15), ppm / 130, -1); goldScroll(g, X(0.55), Y(ey - 0.15), ppm / 130, 1);
  goldScroll(g, X(-1.4), Y(L.rail + 0.25), ppm / 190, -1); goldScroll(g, X(1.4), Y(L.rail + 0.25), ppm / 190, 1);
  drawEmblem(g, X(0), Y(ey), ppm / 230);
  // розетки между рядами
  for (let z = -2.4; z <= 2.41; z += 0.8) { const cx = X(z), cy = Y((L.rows[0].y + L.rows[0].h / 2 + L.cornice[0]) / 2 + 0.02); g.fillStyle = '#d4a24c'; g.beginPath(); g.arc(cx, cy, ppm * 0.05, 0, TAU); g.fill(); }
  // золотая кайма арки
  g.strokeStyle = '#d4a24c'; g.lineWidth = ppm * 0.08; g.beginPath();
  for (let i = 0; i <= 40; i++) { const z = L.zR * (1 - 2 * i / 40); const y = L.rail + (L.archTop - L.rail) * Math.pow(Math.max(0, 1 - (z / L.zR) ** 2), 0.6) - 0.06; i ? g.lineTo(X(z), Y(y)) : g.moveTo(X(z), Y(y)); }
  g.stroke();
  noiseOverlay(g, S, S, 0.1, 3);
  return { map: canvasTex(c), emi: canvasTex(ce) };
}

function makeBulkheadTex(wM, hM, doors, wins) {
  const W = 1024, H = Math.max(128, Math.round(W * hM / wM)), [c, g] = mkCanvas(W, H), [ce, ge] = mkCanvas(W, H);
  const ppm = W / wM, X = z => (z / wM + 0.5) * W, Y = y => H - y * ppm * (H / (hM * ppm));
  const py = H / hM;
  g.fillStyle = '#15233f'; g.fillRect(0, 0, W, H);
  for (let z = -wM / 2; z < wM / 2; z += 0.2) { g.fillStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.15})`; g.fillRect(X(z), 0, 1.5, H); }
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  // филёнки
  g.strokeStyle = '#b58a3e'; g.lineWidth = 2.5;
  for (let z = -wM / 2 + 0.2; z < wM / 2 - 0.9; z += 1.1) {
    if (doors.some(d => Math.abs(d - (z + 0.45)) < 1.0)) continue;
    g.strokeRect(X(z), Y(hM - 0.18), ppm * 0.9, (hM - 0.36) * py);
  }
  g.fillStyle = '#c99a45'; g.fillRect(0, Y(0.12), W, 0.05 * py); g.fillRect(0, Y(hM - 0.06), W, 0.05 * py);
  for (const d of doors) {
    const dw = 0.95, dh = Math.min(1.75, hM - 0.12), x = X(d - dw / 2), y = Y(dh), w = dw * ppm, h = dh * py;
    g.fillStyle = '#c99a45'; g.fillRect(x - 6, y - 6, w + 12, h + 6);
    const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#3b2414'); gr.addColorStop(0.5, '#5a3820'); gr.addColorStop(1, '#3b2414');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2;
    for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x + w * k / 6, y); g.lineTo(x + w * k / 6, y + h); g.stroke(); }
    g.lineWidth = 3; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke();
    if (h > 90) drawWindow(g, ge, x + w * 0.2, y + h * 0.1, w * 0.6, h * 0.22, true, ppm);
    g.fillStyle = '#d9aa52'; for (const s of [-1, 1]) { g.beginPath(); g.arc(x + w / 2 + s * 8, y + h * 0.58, 4, 0, TAU); g.fill(); }
  }
  for (const z of wins) drawWindow(g, ge, X(z - 0.25), Y(hM * 0.72), 0.5 * ppm, Math.min(0.45, hM * 0.35) * py, false, ppm);
  noiseOverlay(g, W, H, 0.1, 5);
  return { map: canvasTex(c), emi: canvasTex(ce) };
}

function makeGalleryTex(n) {
  const W = 512, H = 200, [c, g] = mkCanvas(W, H), [ce, ge] = mkCanvas(W, H);
  g.fillStyle = '#16243f'; g.fillRect(0, 0, W, H); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  g.fillStyle = '#c99a45'; g.fillRect(0, 0, W, 8); g.fillRect(0, H - 8, W, 8);
  const ww = W / n;
  for (let i = 0; i < n; i++) {
    drawWindow(g, ge, i * ww + ww * 0.18, 26, ww * 0.64, H - 52, true, 70);
    g.fillStyle = '#c99a45'; g.fillRect(i * ww - 3, 10, 6, H - 20);
  }
  noiseOverlay(g, W, H, 0.1, 7);
  return { map: canvasTex(c), emi: canvasTex(ce) };
}

function makeGratingTex() {
  const S = 256, [c, g] = mkCanvas(S, S);
  g.fillStyle = '#0c0805'; g.fillRect(0, 0, S, S);
  const step = 32, bw = 9;
  for (let i = 0; i < S; i += step) {
    g.fillStyle = '#7a5a3a'; g.fillRect(i, 0, bw, S);
    g.fillStyle = '#8a6844'; g.fillRect(0, i, S, bw);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(i + bw - 2, 0, 2, S); g.fillRect(0, i + bw - 2, S, 2);
  }
  noiseOverlay(g, S, S, 0.15, 9);
  const t = canvasTex(c, { repeat: true }); return t;
}
