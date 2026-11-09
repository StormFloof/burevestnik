// ===================== звук: синтез в Web Audio, без файлов =====================
// Принцип: тишина по умолчанию, звук — от событий, которые видно в кадре.
//  · море — отдельные набегающие волны (а не сплошной шум), чем ниже камера к воде — тем ближе;
//  · плеск у форштевня — когда нос опускается в воду, сильнее на ходу;
//  · скрип — в крайних точках качки (когда корабль перекладывается с борта на борт);
//  · ветер почти не слышен в штиль и растёт со штормом; дождь — только когда идёт дождь;
//  · чайки — от конкретной видимой птицы, с панорамой и затуханием по расстоянию.
const _sv2 = V3();
function bqf(c, type, f, Q = 0.7) { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; }
const SOUND = {
  ctx: null, on: false, vol: 0.5,
  nextWave: 1, nextGull: 6, lastRollSign: 0, lastPitchSign: 0, creakCool: 0, washCool: 0,
  init() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    const c = this.ctx = new AC(), sr = c.sampleRate;
    const mk = (fill, sec = 6) => { const b = c.createBuffer(1, sr * sec, sr); fill(b.getChannelData(0)); return b; };
    this.white = mk(d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.brown = mk(d => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    this.pink = mk(d => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    });
    this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.3;
    this.master.connect(comp); comp.connect(c.destination);
    this.an = c.createAnalyser(); this.an.fftSize = 2048; comp.connect(this.an);
    // короткое эхо над водой
    const ir = c.createBuffer(2, sr * 2.2, sr);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4) * Math.min(1, i / (sr * 0.03)); }
    this.rev = c.createConvolver(); this.rev.buffer = ir;
    const rg = c.createGain(); rg.gain.value = 0.25; this.rev.connect(rg); rg.connect(this.master);
    // фоновые петли: все стартуют с нулевой громкостью
    const loop = (buf, filters) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true; let n = s;
      for (const f of filters) { n.connect(f); n = f; }
      const g = c.createGain(); g.gain.value = 0; n.connect(g); g.connect(this.master); s.start(0, Math.random() * 5); return g;
    };
    this.bed = loop(this.brown, [bqf(c, 'lowpass', 220)]);                        // очень тихий низ далёкого моря
    this.windF = bqf(c, 'bandpass', 450, 1.2); this.wind = loop(this.pink, [this.windF]);
    this.whistleF = bqf(c, 'bandpass', 1200, 18); this.whistle = loop(this.white, [this.whistleF]);
    this.rain = loop(this.white, [bqf(c, 'highpass', 3000), bqf(c, 'lowpass', 8000)]);
    this.hiss = loop(this.pink, [bqf(c, 'bandpass', 1400, 0.5)]);                 // шипение воды вдоль бортов на ходу
    return true;
  },
  toggle(on) {
    if (on && !this.ctx && !this.init()) return;
    if (!this.ctx) return;
    this.on = on; if (on && this.ctx.state !== 'running') this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? this.vol : 0, this.ctx.currentTime, 0.4);
  },
  out(pos) { // панорама + затухание по расстоянию
    const c = this.ctx, v = _sv2.copy(pos).sub(camera.position), d = v.length(); v.normalize();
    const e = camera.matrixWorld.elements, pr = clamp(v.x * e[0] + v.y * e[1] + v.z * e[2], -1, 1);
    let node = this.master;
    if (c.createStereoPanner) { node = c.createStereoPanner(); node.pan.value = pr * 0.8; node.connect(this.master); }
    return { node, d, att: 1 / (1 + d / 40) };
  },
  shipNear() { return clamp(45 / (camera.position.distanceTo(SHIP.pos) + 5), 0.15, 1); },
  waterNear() { return clamp(18 / (Math.max(0, camera.position.y) + 8), 0.25, 1); },
  env(g, t, peak, att, dec) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.setTargetAtTime(0, t + att, dec / 3); },
  update(dt) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime, st = STATE.storm, T = STATE.t;
    const set = (g, v, tc = 0.6) => g.gain.setTargetAtTime(v, t, tc);
    const wn = this.waterNear(), sn = this.shipNear();
    set(this.bed, (0.012 + 0.05 * st) * wn);
    // ветер: в штиль почти тишина, порывы — медленные «вздохи»
    const gust = Math.max(0, Math.sin(T * 0.23) * Math.sin(T * 0.11 + 1.3)) + 0.25 * Math.max(0, Math.sin(T * 0.9));
    set(this.wind, 0.004 + 0.12 * Math.pow(st, 1.6) * (0.4 + gust));
    this.windF.frequency.setTargetAtTime(300 + 500 * gust + 400 * st, t, 0.8);
    set(this.whistle, 0.025 * smooth(0.55, 1, st) * gust);
    this.whistleF.frequency.setTargetAtTime(900 + 600 * gust, t, 0.6);
    set(this.rain, 0.08 * smooth(0.42, 0.85, st));
    set(this.hiss, 0.025 * clamp((SHIP.speed - 2) / 6, 0, 1) * sn * wn);
    // отдельные волны вокруг камеры
    this.nextWave -= dt;
    if (this.nextWave <= 0) {
      this.nextWave = lerp(3.5, 1.1, st) * (0.6 + Math.random() * 0.8);
      this.wave(lerp(0.055, 0.11, st) * wn * (0.6 + Math.random() * 0.6));
    }
    // плеск: нос пошёл вниз
    this.washCool -= dt;
    const ps = Math.sign(SHIP.vPitch);
    if (ps < 0 && this.lastPitchSign > 0 && this.washCool <= 0 && SHIP.speed > 1.5) {
      this.washCool = 1.5;
      this.bowWash(clamp(SHIP.speed / 7, 0.3, 1.2) * sn * (0.6 + Math.abs(SHIP.pitch) * 8));
    }
    this.lastPitchSign = ps;
    // скрип: в крайней точке крена
    this.creakCool -= dt;
    const rs = Math.sign(SHIP.vRoll);
    if (rs !== this.lastRollSign && Math.abs(SHIP.roll - SHIP.heel) > 0.012 && this.creakCool <= 0 && Math.random() < 0.7) {
      this.creakCool = 1.2; this.creak(0.04 * sn * clamp(Math.abs(SHIP.roll - SHIP.heel) * 25, 0.4, 1.4));
    }
    this.lastRollSign = rs;
    // чайки
    if (GULLS.vis > 0.3) { this.nextGull -= dt; if (this.nextGull <= 0) { this.nextGull = 6 + Math.random() * 12; this.gull(); } }
  },
  // одна набегающая волна: мягкий нарастающий шорох с низами и короткий «гребень»
  wave(v) {
    const c = this.ctx, t = c.currentTime + 0.02, att = 0.8 + Math.random() * 0.9, dec = 1.6 + Math.random() * 1.6;
    let out = this.master; if (c.createStereoPanner) { out = c.createStereoPanner(); out.pan.value = Math.random() * 1.6 - 0.8; out.connect(this.master); }
    const s = c.createBufferSource(); s.buffer = this.pink;
    const bp = bqf(c, 'bandpass', 260, 0.7);
    bp.frequency.setValueAtTime(240, t); bp.frequency.linearRampToValueAtTime(620 + Math.random() * 300, t + att); bp.frequency.exponentialRampToValueAtTime(200, t + att + dec);
    const g = c.createGain(); this.env(g, t, v, att, dec);
    s.connect(bp); bp.connect(g); g.connect(out);
    s.start(t, Math.random() * 4, att + dec + 0.4);
    const h = c.createBufferSource(); h.buffer = this.white;
    const hp = bqf(c, 'bandpass', 2500, 0.6), hg = c.createGain(); this.env(hg, t + att * 0.8, v * 0.18, 0.15, 0.9);
    h.connect(hp); hp.connect(hg); hg.connect(out); h.start(t + att * 0.8, Math.random() * 4, 1.3);
  },
  bowWash(v) {
    const c = this.ctx, t = c.currentTime + 0.05, { node } = this.out(SHIP.root.localToWorld(_sv2.set(16, 0.5, 0)).clone());
    const s = c.createBufferSource(); s.buffer = this.pink;
    const bp = bqf(c, 'bandpass', 900, 0.8); bp.frequency.setValueAtTime(1300, t); bp.frequency.exponentialRampToValueAtTime(380, t + 1.4);
    const g = c.createGain(); this.env(g, t, 0.07 * v, 0.12, 1.3);
    s.connect(bp); bp.connect(g); g.connect(node); s.start(t, Math.random() * 4, 1.8);
  },
  // скрип дерева: низкий «стон» со срывами (прилипание-скольжение)
  creak(vol) {
    const c = this.ctx, t = c.currentTime + 0.02, d = 0.35 + Math.random() * 0.6, f = 55 + Math.random() * 60;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.5), t + d);
    const bp = bqf(c, 'bandpass', 500 + Math.random() * 600, 5);
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(18 + Math.random() * 10, t); lfo.frequency.linearRampToValueAtTime(30 + Math.random() * 20, t + d);
    const lg = c.createGain(); lg.gain.value = 0.5; const am = c.createGain(); am.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
    const e = c.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(vol, t + d * 0.35); e.gain.linearRampToValueAtTime(0, t + d);
    o.connect(bp); bp.connect(am); am.connect(e); e.connect(this.master);
    o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
  },
  fire(pos, s = 1) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, { node, d, att } = this.out(pos), t = c.currentTime + d / 343 + 0.01;
    const src = c.createBufferSource(); src.buffer = this.white;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(clamp(5000 / (1 + d / 120), 500, 5000), t); lp.frequency.exponentialRampToValueAtTime(140, t + 1.0);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * att * s, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    src.connect(lp); lp.connect(g); g.connect(node); g.connect(this.rev);
    const o = c.createOscillator(); o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    const og = c.createGain(); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.32 * att * s, t + 0.008); og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(og); og.connect(node);
    src.start(t, Math.random() * 4, 2); o.start(t); o.stop(t + 0.9);
  },
  splash(pos, k = 1) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, { node, d } = this.out(pos), t = c.currentTime + d / 343, att = 1 / (1 + d / 50);
    const src = c.createBufferSource(); src.buffer = this.pink;
    const bp = bqf(c, 'bandpass', 1500, 0.8); bp.frequency.setValueAtTime(1700, t); bp.frequency.exponentialRampToValueAtTime(380, t + 0.9);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * att * k, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(bp); bp.connect(g); g.connect(node); g.connect(this.rev);
    src.start(t, Math.random() * 4, 1.4);
  },
  thunder(delay, k) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime + delay;
    if (delay < 2.2) {
      const s = c.createBufferSource(); s.buffer = this.white;
      const hp = bqf(c, 'highpass', 1500), g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18 * k, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      s.connect(hp); hp.connect(g); g.connect(this.master); g.connect(this.rev); s.start(t, Math.random() * 4, 0.5);
    }
    const src = c.createBufferSource(); src.buffer = this.brown; src.loop = true;
    const lp = bqf(c, 'lowpass', 220 + 300 * k), g = c.createGain(), dur = 4 + Math.random() * 3;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35 * k, t + 0.12);
    let tt = t; for (let i = 0; i < 4; i++) { tt += 0.4 + Math.random() * 0.9; g.gain.linearRampToValueAtTime((0.12 + Math.random() * 0.2) * k * (1 - i / 5), tt); }
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(this.master); g.connect(this.rev);
    src.start(t, Math.random() * 4); src.stop(t + dur + 0.1);
  },
  slam(k) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime, sn = this.shipNear();
    const src = c.createBufferSource(); src.buffer = this.brown;
    const lp = bqf(c, 'lowpass', 160), g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * k * sn, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start(t, Math.random() * 4, 0.8);
    this.splash(SHIP.root.localToWorld(_sv2.set(17, 1, 0)).clone(), 0.9 * k);
  },
  gull() {
    const b = GULLS.list[(Math.random() * GULLS.list.length) | 0]; if (!b || !b.g.visible) return;
    const c = this.ctx, { node, d } = this.out(b.g.position), v = 0.035 * GULLS.vis / (1 + d / 30);
    if (v < 0.004) return;
    const n = 2 + (Math.random() * 3 | 0), base = 1500 + Math.random() * 600; let t = c.currentTime + 0.05;
    for (let i = 0; i < n; i++) {
      const dd = 0.16 + Math.random() * 0.14, o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.25, t); o.frequency.exponentialRampToValueAtTime(base * 0.8, t + dd);
      const vib = c.createOscillator(); vib.frequency.value = 26; const vg = c.createGain(); vg.gain.value = 50; vib.connect(vg); vg.connect(o.frequency);
      const bp = bqf(c, 'bandpass', base * 1.3, 3), g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, t + dd);
      o.connect(bp); bp.connect(g); g.connect(node); o.start(t); vib.start(t); o.stop(t + dd + 0.02); vib.stop(t + dd + 0.02);
      t += dd + 0.08 + Math.random() * 0.12;
    }
  },
};
window.SOUND = SOUND;
Object.assign(SFX, { fire: (p, s) => SOUND.fire(p, s), splash: (p, k) => SOUND.splash(p, k), thunder: (d, k) => SOUND.thunder(d, k), slam: k => SOUND.slam(k) });
// звук включается при первом действии пользователя (браузеры запрещают автозапуск)
function firstGesture(e) {
  if (e.target && e.target.id === 'sndBtn') return;
  removeEventListener('pointerdown', firstGesture, true); removeEventListener('keydown', firstGesture, true);
  if (!STATE.sound) { STATE.sound = true; SOUND.toggle(true); syncUI(); toast('Звук включён · кнопка «Звук» — выключить'); }
}
addEventListener('pointerdown', firstGesture, true); addEventListener('keydown', firstGesture, true);
