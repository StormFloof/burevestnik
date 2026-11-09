// ===================== главный цикл =====================
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.debug.onShaderError = (gl, prog, vs, fs) => {
  const log = (s) => { const l = gl.getShaderInfoLog(s); return l ? l.trim() : ''; };
  const src = gl.getShaderSource(fs) || '';
  const msg = 'VS: ' + log(vs) + '\nFS: ' + log(fs);
  const m = /ERROR: \d+:(\d+)/.exec(msg);
  let ctx = ''; if (m) { const lines = (/FS: ERROR/.test(msg) ? src : gl.getShaderSource(vs)).split('\n'); const n = +m[1]; ctx = lines.slice(Math.max(0, n - 3), n + 2).map((l, i) => (n - 2 + i) + ': ' + l).join('\n'); }
  document.body.dataset.shaderErr = (document.body.dataset.shaderErr || '') + msg.slice(0, 800) + '\n' + ctx + '\n----\n';
  console.error('SHADER', msg.slice(0, 600));
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8899aa, 0.0006);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.3, 12000);

const STATE = {
  tod: 18.45, storm: 0.22, sail: 0.85, cam: 'orbit', auto: true, timeRun: false, sound: false,
  windAng: -0.35, seaAng: -0.35, flash: 0, t: 0,
};
const T = await makeTextures();
SKY_UNIFORMS.uNoise.value = T.noise;
OCEAN_UNIFORMS.uWaterN.value = T.waterN;
OCEAN_UNIFORMS.uWake.value = dataTex(new Uint8Array(4), 1, 1);
OCEAN_UNIFORMS.uReflTex.value = dataTex(new Uint8Array(4), 1, 1);

setLoad('Разливаем океан…', 0.55); await nextFrame();
const sky = makeSkyDome(false); scene.add(sky);
const ocean = makeOcean(); scene.add(ocean);
const light = new Lighting(renderer, scene);
setSeaState(STATE.storm, STATE.seaAng);

const SHIP = { pos: V3(0, 0, 0), heading: 0, speed: 0, root: new THREE.Group(), ready: false };
scene.add(SHIP.root);
await buildShip(T);

// ---------- камера ----------
const CAM = { yaw: 2.35, pitch: 0.17, dist: 58, tYaw: 2.35, tPitch: 0.17, tDist: 58, target: V3(), idle: 0 };
const pointers = new Map();
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); canvas.classList.add('drag'); CAM.idle = 0; canvas.focus(); });
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p[0], dy = e.clientY - p[1];
  if (pointers.size === 1) { CAM.tYaw -= dx * 0.005; CAM.tPitch = clamp(CAM.tPitch + dy * 0.004, -0.05, 1.35); }
  else { const o = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1]; const d0 = Math.hypot(p[0] - o[0], p[1] - o[1]), d1 = Math.hypot(e.clientX - o[0], e.clientY - o[1]); if (d0 > 4 && d1 > 4) CAM.tDist = clamp(CAM.tDist * d0 / d1, 9, 260); }
  pointers.set(e.pointerId, [e.clientX, e.clientY]); CAM.idle = 0;
});
const endPtr = e => { pointers.delete(e.pointerId); if (!pointers.size) canvas.classList.remove('drag'); };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); CAM.tDist = clamp(CAM.tDist * Math.exp(e.deltaY * 0.0011), 9, 260); CAM.idle = 0; }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function updateCamera(dt) {
  CAM.idle += dt;
  const k = 1 - Math.exp(-dt * 6);
  CAM.target.lerp(CAM.focusLocal ? SHIP.root.localToWorld(_v1.copy(CAM.focusLocal)) : _v1.set(SHIP.pos.x, SHIP.pos.y + 6, SHIP.pos.z), 1 - Math.exp(-dt * 4));
  if (STATE.cam === 'cine') {
    const t = STATE.t * 0.045;
    CAM.tYaw = SHIP.heading + PI * 0.5 + Math.sin(t) * 1.7;
    CAM.tPitch = 0.08 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.7 + 1));
    CAM.tDist = 38 + 26 * (0.5 + 0.5 * Math.sin(t * 0.8));
  } else if (STATE.cam === 'orbit' && CAM.idle > 10) {
    CAM.tYaw += dt * 0.025;
  }
  CAM.yaw = lerp(CAM.yaw, CAM.tYaw, k); CAM.pitch = lerp(CAM.pitch, CAM.tPitch, k); CAM.dist = lerp(CAM.dist, CAM.tDist, k);
  if (STATE.cam === 'deck') {
    const f = _v2.set(Math.cos(SHIP.heading), 0, -Math.sin(SHIP.heading));
    camera.position.set(SHIP.pos.x - f.x * 8, SHIP.pos.y + 5, SHIP.pos.z - f.z * 8);
    const look = V3(SHIP.pos.x + f.x * 20 + Math.sin(CAM.yaw) * 8, SHIP.pos.y + 4 + CAM.pitch * 10, SHIP.pos.z + f.z * 20 + Math.cos(CAM.yaw) * 8);
    camera.lookAt(look);
    return;
  }
  const cp = Math.cos(CAM.pitch);
  camera.position.set(CAM.target.x + Math.sin(CAM.yaw) * cp * CAM.dist, CAM.target.y + Math.sin(CAM.pitch) * CAM.dist, CAM.target.z + Math.cos(CAM.yaw) * cp * CAM.dist);
  const wh = waterHeight(camera.position.x, camera.position.z) + 1.4;
  if (camera.position.y < wh) camera.position.y = wh;
  camera.lookAt(CAM.target);
}

// ---------- UI ----------
const ui = {
  tod: $('tod'), storm: $('storm'), sail: $('sail'),
};
function fmtTime(h) { h = ((h % 24) + 24) % 24; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
function syncUI() {
  ui.tod.value = STATE.tod; $('todV').textContent = fmtTime(STATE.tod);
  ui.storm.value = STATE.storm; $('stormV').textContent = Math.round(STATE.storm * 100) + '%';
  ui.sail.value = STATE.sail; $('sailV').textContent = Math.round(STATE.sail * 100) + '%';
  document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === STATE.cam));
  $('autoBtn').classList.toggle('on', STATE.auto); $('sndBtn').classList.toggle('on', STATE.sound); $('timeBtn').classList.toggle('on', STATE.timeRun);
}
ui.tod.addEventListener('input', () => { STATE.tod = +ui.tod.value; syncUI(); });
ui.storm.addEventListener('input', () => { STATE.storm = +ui.storm.value; syncUI(); });
ui.sail.addEventListener('input', () => { STATE.sail = +ui.sail.value; syncUI(); });
$('vol').addEventListener('input', () => { const v = +$('vol').value; $('volV').textContent = Math.round(v * 100) + '%'; SOUND.vol = v; if (SOUND.ctx && SOUND.on) SOUND.master.gain.setTargetAtTime(v, SOUND.ctx.currentTime, 0.1); });
document.querySelectorAll('[data-tod]').forEach(b => b.addEventListener('click', () => { STATE.todTarget = +b.dataset.tod; }));
document.querySelectorAll('[data-cam]').forEach(b => b.addEventListener('click', () => { STATE.cam = b.dataset.cam; syncUI(); }));
$('autoBtn').onclick = () => { STATE.auto = !STATE.auto; syncUI(); };
$('timeBtn').onclick = () => { STATE.timeRun = !STATE.timeRun; syncUI(); };
$('sndBtn').onclick = () => { STATE.sound = !STATE.sound; syncUI(); if (window.SOUND) SOUND.toggle(STATE.sound); };
const KEYS = new Set();
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  KEYS.add(e.code);
  switch (e.code) {
    case 'Digit1': STATE.todTarget = 6.1; break; case 'Digit2': STATE.todTarget = 13; break;
    case 'Digit3': STATE.todTarget = 18.72; break; case 'Digit4': STATE.todTarget = 23.5; break;
    case 'KeyC': { const l = ['orbit', 'cine', 'deck']; STATE.cam = l[(l.indexOf(STATE.cam) + 1) % 3]; syncUI(); toast({ orbit: 'Орбита', cine: 'Кинокамера', deck: 'С палубы' }[STATE.cam]); break; }
    case 'KeyT': STATE.stormTarget = STATE.storm > 0.5 ? 0.15 : 0.9; toast(STATE.storm > 0.5 ? 'Шторм стихает' : 'Надвигается шторм!'); break;
    case 'KeyP': STATE.auto = !STATE.auto; syncUI(); toast(STATE.auto ? 'Автопилот' : 'Ручное управление'); break;
    case 'KeyH': ['ui', 'hud', 'help'].forEach(id => $(id).classList.toggle('hidden')); break;
    case 'KeyQ': broadside(-1); break;
    case 'KeyE': broadside(1); break;
  }
});
addEventListener('keyup', e => KEYS.delete(e.code));
syncUI();

// компас
const cmp = $('compass').getContext('2d');
function drawCompass() {
  const g = cmp, S = 200, c = S / 2;
  g.clearRect(0, 0, S, S);
  g.save(); g.translate(c, c);
  g.strokeStyle = 'rgba(224,178,90,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 88, 0, TAU); g.stroke();
  const camYaw = Math.atan2(camera.position.x - CAM.target.x, camera.position.z - CAM.target.z);
  g.rotate(camYaw);
  g.font = 'bold 22px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  [['С', 0, -1], ['В', 1, 0], ['Ю', 0, 1], ['З', -1, 0]].forEach(([s, x, y]) => { g.fillStyle = s === 'С' ? '#e05a40' : '#eadfca'; g.fillText(s, x * 70, y * 70); });
  for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; g.strokeStyle = 'rgba(234,223,202,.35)'; g.beginPath(); g.moveTo(Math.sin(a) * 82, -Math.cos(a) * 82); g.lineTo(Math.sin(a) * (i % 4 ? 86 : 78), -Math.cos(a) * (i % 4 ? 86 : 78)); g.stroke(); }
  // ветер (откуда дует)
  const wa = STATE.windAng; g.save(); g.rotate(Math.atan2(Math.cos(wa), -Math.sin(wa)) + PI);
  g.fillStyle = 'rgba(120,190,255,.85)'; g.beginPath(); g.moveTo(0, -60); g.lineTo(9, -40); g.lineTo(-9, -40); g.fill(); g.restore();
  // курс корабля
  g.save(); g.rotate(-SHIP.heading + PI / 2);
  g.fillStyle = '#e0b25a'; g.beginPath(); g.moveTo(0, -56); g.lineTo(11, 18); g.lineTo(0, 8); g.lineTo(-11, 18); g.fill(); g.restore();
  g.restore();
}

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); resizeRefl(); updatePartScale(); });
$('fireL').onclick = () => broadside(-1);
$('fireR').onclick = () => broadside(1);
initFX();
setLoad('Насыпаем острова…', 0.9); await nextFrame();
initWorld();

// ---------- цикл ----------
setLoad('Поднимаем якорь…', 0.95); await nextFrame();
let last = performance.now(), fpsAcc = 0, fpsN = 0;
const _ws = {};
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  STATE.t += dt; WAVES.time = STATE.t;
  SKY_UNIFORMS.uTime.value = STATE.t;
  if (STATE.todTarget !== undefined) {
    let d = STATE.todTarget - STATE.tod; if (d < -12) d += 24; if (d > 12) d -= 24;
    if (Math.abs(d) < 0.02) { STATE.tod = STATE.todTarget; STATE.todTarget = undefined; } else STATE.tod = (STATE.tod + Math.sign(d) * Math.min(Math.abs(d), dt * 4.5) + 24) % 24;
    syncUI();
  } else if (STATE.timeRun) { STATE.tod = (STATE.tod + dt * 0.08) % 24; ui.tod.value = STATE.tod; $('todV').textContent = fmtTime(STATE.tod); }
  if (STATE.stormTarget !== undefined) {
    const d = STATE.stormTarget - STATE.storm;
    if (Math.abs(d) < 0.005) { STATE.storm = STATE.stormTarget; STATE.stormTarget = undefined; } else STATE.storm += Math.sign(d) * Math.min(Math.abs(d), dt * 0.12);
    syncUI();
  }
  setSeaState(STATE.storm, STATE.seaAng);
  OCEAN_UNIFORMS.uWaveAmp.value = WAVES.amp;
  OCEAN_UNIFORMS.uFoamThr.value = lerp(0.3, 0.88, STATE.storm);
  SKY_UNIFORMS.uCloudShift.value.set(Math.cos(STATE.windAng), Math.sin(STATE.windAng)).multiplyScalar(STATE.t * lerp(0.0015, 0.006, STATE.storm));

  if (SHIP.ready) updateShipBasic(dt);
  else {
    // временный буй
    SHIP.heading += dt * 0.02;
    SHIP.pos.x += Math.cos(SHIP.heading) * dt * 4; SHIP.pos.z -= Math.sin(SHIP.heading) * dt * 4;
    waterSample(SHIP.pos.x, SHIP.pos.z, STATE.t, _ws);
    SHIP.pos.y = lerp(SHIP.pos.y, _ws.h, 0.2);
    SHIP.root.position.copy(SHIP.pos);
    _q.setFromUnitVectors(_UP, _v1.set(_ws.nx, _ws.ny, _ws.nz));
    SHIP.root.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(_UP, SHIP.heading));
  }
  STATE.flash = Math.max(0, STATE.flash - dt * 3);
  updateFX(dt);
  updateWorld(dt);
  updateCamera(dt);
  applyShake(dt);
  light.update(STATE.tod, STATE.storm, STATE.flash, SHIP.pos);
  sky.position.copy(camera.position);
  camera.updateMatrixWorld();
  SAIL_U.uKeyV.value.copy(light.key).transformDirection(camera.matrixWorldInverse);
  SAIL_U.uKeyC.value.copy(light.keyCol);
  OCEAN_UNIFORMS.uCenter.value.set(Math.round(camera.position.x), Math.round(camera.position.z));
  renderWake();
  renderReflection();
  renderer.render(scene, camera);

  $('spd').textContent = (SHIP.speed * 1.944).toFixed(1);
  drawCompass();
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { syncUI(); $('fps').textContent = Math.round(fpsN / fpsAcc) + ' FPS'; fpsAcc = 0; fpsN = 0; }
  if (!window.__shipReady) { window.__shipReady = true; document.body.dataset.ready = '1'; setLoad('Готово', 1); $('loading').classList.add('hide'); }
}
requestAnimationFrame(frame);
window.__dbg = { STATE, CAM, SHIP, light, renderer, scene, camera, broadside, splash, strike, bowSpray, FX, RIG, WAKE, THREE };
// отладочный канал через DOM (для headless-проверок из изолированного мира)
addEventListener('dbgcmd', () => {
  try { const d = window.__dbg; (0, eval)('(function(d){' + document.body.dataset.cmd + '})')(d); } catch (e) { document.body.dataset.err = String(e); }
  document.body.dataset.info = JSON.stringify({ exp: renderer.toneMappingExposure.toFixed(2), fps: $('fps').textContent, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, out: window.__out });
});
