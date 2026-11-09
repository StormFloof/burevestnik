// ===================== сборка корабля, плавучесть, управление, ход =====================
async function buildShip(T) {
  const hull = await buildHull(T);
  SHIP.model = new THREE.Group();
  SHIP.model.add(hull);
  SHIP.model.position.y = -0.12; // осадка
  SHIP.root.clear();
  SHIP.root.add(SHIP.model);
  Object.assign(SHIP, { pitch: 0, roll: 0, heave: 0, vPitch: 0, vRoll: 0, vHeave: 0, yawRate: 0, rudderAngle: 0, heel: 0, slam: 0, autoSide: 1 });
  await buildRig(T);
  await buildDetails(T);
  RIG.static.end();
  SHIP.heading = autoHeading(0);
  SHIP.speed = 4.5;
  SHIP.ready = true;
}

const wrapPI = a => Math.atan2(Math.sin(a), Math.cos(a));
// угол между носом и направлением, ОТКУДА дует ветер (0 — прямо в лоб)
function windRel(h) { return wrapPI(-h - (STATE.windAng + PI)); }
// курс автопилота: держим ветер в бакштаг/галфвинд, плавно «гуляя»
function autoHeading(t) {
  const rel = SHIP.autoSide * (1.95 + 0.6 * Math.sin(t * 0.011) + 0.25 * Math.sin(t * 0.037));
  return -(rel + STATE.windAng + PI);
}

// точки корпуса для расчёта плавучести (в локальных координатах x вперёд, z вправо)
const FLOAT_PTS = [];
for (const x of [-13, -8, -3, 2, 7, 12, 16]) for (const z of [-1, 1]) FLOAT_PTS.push([x, z * HULLDEF.B(x) * 0.8]);
const _e = new THREE.Euler();
let _manualToast = false;

function updateShipBasic(dt) {
  const t = STATE.t;
  // ---------- ветер: медленно гуляет, в шторм — порывы ----------
  STATE.windAng += (0.004 * Math.sin(t * 0.021) + 0.002 * Math.sin(t * 0.0057)) * dt + STATE.storm * 0.02 * Math.sin(t * 0.31) * dt;

  // ---------- ввод ----------
  const left = KEYS.has('KeyA') || KEYS.has('ArrowLeft'), right = KEYS.has('KeyD') || KEYS.has('ArrowRight');
  if ((left || right) && STATE.auto) { STATE.auto = false; syncUI(); if (!_manualToast) { toast('Ручное управление · P — автопилот'); _manualToast = true; } }
  if (KEYS.has('KeyW') || KEYS.has('ArrowUp')) { STATE.sail = Math.min(1, STATE.sail + dt * 0.35); syncUI(); }
  if (KEYS.has('KeyS') || KEYS.has('ArrowDown')) { STATE.sail = Math.max(0, STATE.sail - dt * 0.35); syncUI(); }

  // ---------- руль ----------
  let rudT;
  if (STATE.auto) {
    // смена галса раз в ~2.5 минуты, чтобы не уходить в одну сторону бесконечно
    if (Math.sin(t * 0.0042) * SHIP.autoSide < -0.2) SHIP.autoSide *= -1;
    const err = wrapPI(autoHeading(t) + islandSteer() - SHIP.heading);
    rudT = clamp(err * 1.6 - SHIP.yawRate * 9, -0.45, 0.45);
  } else rudT = left ? 0.55 : right ? -0.55 : 0;
  SHIP.rudderAngle += clamp(rudT - SHIP.rudderAngle, -dt * 0.7, dt * 0.7);

  // ---------- паруса и ход ----------
  updateRig(dt);
  updateDetails(dt);
  const v = SHIP.speed;
  // тяга от парусов, сопротивление ~ v², плюс торможение при перекладке руля
  const thrust = 0.00054 * Math.max(RIG.drive, -40);
  const drag = 0.006 * v * Math.abs(v) + 0.015 * v * Math.abs(SHIP.rudderAngle) + (v > 0 ? 0 : 0.05 * v);
  SHIP.speed = clamp(v + (thrust - drag) * dt, -1, 9.5);
  // поворот: рыскание пропорционально скорости и перекладке, с инерцией
  const rT = SHIP.rudderAngle * (0.016 + 0.03 * Math.max(v, 0));
  SHIP.yawRate += (rT - SHIP.yawRate) * dt * 0.55;
  SHIP.heading += SHIP.yawRate * dt;
  const ch = Math.cos(SHIP.heading), sh = Math.sin(SHIP.heading);
  // небольшой дрейф под ветер
  const drift = RIG.wind.az / (RIG.wind.A + 1e-6) * 0.25 * STATE.sail * (0.4 + STATE.storm);
  SHIP.pos.x += (ch * SHIP.speed + sh * drift) * dt;
  SHIP.pos.z += (-sh * SHIP.speed + ch * drift) * dt;
  islandCollide(dt);

  // ---------- плавучесть: средняя высота и наклоны по точкам корпуса ----------
  let s0 = 0, sx = 0, sxx = 0, sxh = 0, sz = 0, szz = 0, szh = 0;
  for (const [lx, lz] of FLOAT_PTS) {
    const wx = SHIP.pos.x + ch * lx + sh * lz, wz = SHIP.pos.z - sh * lx + ch * lz;
    const h = waterHeight(wx, wz);
    s0 += h; sx += lx; sxx += lx * lx; sxh += lx * h; sz += lz; szz += lz * lz; szh += lz * h;
  }
  const n = FLOAT_PTS.length, mh = s0 / n;
  const slopeX = (sxh - sx * mh) / (sxx - sx * sx / n), slopeZ = (szh - sz * mh) / (szz - sz * sz / n);
  const tPitch = Math.atan(slopeX) * 0.85, tRoll = -Math.atan(slopeZ) * 0.85;

  // ---------- крен: давление ветра на паруса + центробежный при повороте ----------
  const W = RIG.wind, q = clamp((W.A / 11) ** 2, 0.3, 1.6);
  let sailSet = 0; for (const e of RIG.square) sailSet += e.sail.set; sailSet /= RIG.square.length || 1;
  const heelT = clamp(0.085 * q * sailSet * (W.az / W.A) * (0.7 + STATE.storm * 0.8) + SHIP.yawRate * Math.max(v, 0) * 0.35, -0.3, 0.3);
  SHIP.heel += (heelT - SHIP.heel) * dt * 0.5;

  // пружина-демпфер (инерция корабля); в шторм качка «тяжелее»
  const spring = (val, vel, target, k, c) => { const a = (target - val) * k - vel * c; vel += a * dt; return [val + vel * dt, vel]; };
  [SHIP.heave, SHIP.vHeave] = spring(SHIP.heave, SHIP.vHeave, mh, 9, 4.5);
  [SHIP.pitch, SHIP.vPitch] = spring(SHIP.pitch, SHIP.vPitch, tPitch - 0.004 * v, 7, 3.5);
  [SHIP.roll, SHIP.vRoll] = spring(SHIP.roll, SHIP.vRoll, tRoll + SHIP.heel, lerp(5, 3.2, STATE.storm), lerp(2.2, 1.4, STATE.storm));
  // удар носом в волну (для брызг/звука на следующих этапах): нос глубоко в воде и идёт вниз
  const bowWater = waterHeight(SHIP.pos.x + ch * 17, SHIP.pos.z - sh * 17), bowY = SHIP.heave + Math.sin(SHIP.pitch) * 17;
  const imm = bowWater - bowY;
  SHIP.slam = Math.max(SHIP.slam - dt * 2, imm > 0.5 && SHIP.vPitch < -0.04 ? clamp(imm * 0.6, 0, 1) : 0);

  SHIP.pos.y = SHIP.heave;
  SHIP.root.position.copy(SHIP.pos);
  _e.set(SHIP.roll, SHIP.heading, SHIP.pitch, 'YXZ');
  SHIP.root.quaternion.setFromEuler(_e);
  if (SHIP.rudder) SHIP.rudder.rotation.y = -SHIP.rudderAngle;
  // окна светятся ночью
  const glow = light.night * 0.9 + 0.03;
  for (const m of SHIP.emissive) m.emissiveIntensity = glow;
}
