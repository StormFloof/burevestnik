// ===================== свет и окружение =====================
// JS-копия atmosphere() для цвета окружения/тумана
const _ac = new THREE.Color(), _act = new THREE.Color();
function atmoJS(dx, dy, dz, sun, moon, storm, out) {
  const bm = lerp(0.022, 0.24, storm), y = Math.max(dy, 0), mv = 1 / (y + 0.034);
  const ext = [0, 1, 2].map(i => 1 - Math.exp(-(_BR[i] + bm) * mv));
  const hg = (mu, g) => { const g2 = g * g; return (1 - g2) / Math.pow(1 + g2 - 2 * g * mu, 1.5) * 0.0796; };
  let r = 0, gg = 0, b = 0;
  const add = (L, k, g, tint, ms) => {
    const mu = dx * L.x + y * L.y + dz * L.z;
    const m0 = 1 / (Math.max(L.y, 0) + 0.034), mS = lerp(m0, Math.min(m0, 2.6), smooth(0, 0.45, y));
    const vis = smooth(-0.12, 0.02, L.y), T = [0, 1, 2].map(i => Math.exp(-(_BR[i] + bm) * mS) * vis);
    for (let i = 0; i < 3; i++) {
      const ph = (_BR[i] * 0.75 * (1 + mu * mu) + bm * hg(mu, g) * 4) / (_BR[i] + bm);
      const v = k * T[i] * ph * ext[i] * tint[i] + k * T[i] * ext[i] * ms;
      if (i === 0) r += v; else if (i === 1) gg += v; else b += v;
    }
  };
  add(sun, 1.9, 0.76, [1, 1, 1], 0.09 * smooth(-0.1, 0.25, sun.y));
  add(moon, 1.9 * 0.0055, 0.8, [0.75, 0.85, 1.15], 0);
  const glow = 1 + 2 * Math.exp(-y * 6);
  r += 0.0011 * glow; gg += 0.0017 * glow; b += 0.0034 * glow;
  const lum = r * 0.3 + gg * 0.55 + b * 0.15, k = 1 - storm * 0.55;
  out.setRGB(lerp(r, lum * 0.88, storm * 0.85) * k, lerp(gg, lum * 0.94, storm * 0.85) * k, lerp(b, lum * 1.02, storm * 0.85) * k);
  return out;
}

class Lighting {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.sun = V3(); this.moon = V3(); this.key = V3();
    this.keyCol = new THREE.Color(); this.amb = new THREE.Color(); this.horizon = new THREE.Color(); this.zenith = new THREE.Color();
    this.dir = new THREE.DirectionalLight(0xffffff, 1);
    this.dir.castShadow = true;
    const s = this.dir.shadow; s.mapSize.set(2048, 2048);
    Object.assign(s.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 220 });
    s.bias = -0.0004; s.normalBias = 0.05;
    scene.add(this.dir, this.dir.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.4);
    scene.add(this.hemi);
    // окружение для PBR (PMREM из неба без солнечного диска)
    this.envScene = new THREE.Scene();
    this.envScene.add(makeSkyDome(true));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null; this.envKey = '';
    this.night = 0; this.exposure = 0.5;
  }
  update(tod, storm, flash, focus) {
    sunMoonFromTime(tod, this.sun, this.moon);
    SKY_UNIFORMS.uSunDir.value.copy(this.sun); SKY_UNIFORMS.uMoonDir.value.copy(this.moon);
    SKY_UNIFORMS.uStorm.value = storm; SKY_UNIFORMS.uFlash.value = flash;
    const sunUp = smooth(-0.07, 0.04, this.sun.y);
    this.night = 1 - smooth(-0.16, 0.02, this.sun.y);
    // ключевой свет: солнце, иначе луна
    const useSun = this.sun.y > -0.035;
    const L = useSun ? this.sun : this.moon;
    this.key.copy(L); if (this.key.y < 0.03) { this.key.y = 0.03; this.key.normalize(); }
    sunTransJS(L.y, storm, this.keyCol);
    const kI = useSun ? 6.0 * sunUp : 0.085 * smooth(-0.05, 0.08, this.moon.y);
    this.keyCol.multiplyScalar(kI * (1 - storm * 0.82));
    if (!useSun) this.keyCol.multiply(_ac.setRGB(0.72, 0.84, 1.15));
    atmoJS(0, 1, 0, this.sun, this.moon, storm, this.zenith);
    atmoJS(-this.sun.x, 0.04, -this.sun.z, this.sun, this.moon, storm, this.horizon);
    atmoJS(this.sun.x, 0.04, this.sun.z, this.sun, this.moon, storm, _act); this.horizon.lerp(_act, 0.5);
    this.amb.copy(this.zenith).multiplyScalar(1.4).lerp(this.horizon, 0.35);
    // направленный свет следует за фокусом
    this.dir.position.copy(focus).addScaledVector(this.key, 110);
    this.dir.target.position.copy(focus);
    this.dir.color.copy(this.keyCol); this.dir.intensity = 1;
    this.hemi.color.copy(this.zenith).multiplyScalar(1.6);
    this.hemi.groundColor.copy(this.horizon).multiplyScalar(0.25);
    this.hemi.intensity = 0.35;
    // экспозиция: «глаз» адаптируется к ночи
    const lum = this.amb.r * 0.3 + this.amb.g * 0.55 + this.amb.b * 0.15 + (this.keyCol.r + this.keyCol.g) * 0.03;
    const target = clamp(0.62 / Math.pow(lum + 0.004, 0.6), 0.2, 14) * lerp(1, 0.5, smooth(0.3, 1, storm));
    this.exposure = lerp(this.exposure, target, 0.06);
    this.renderer.toneMappingExposure = this.exposure;
    Object.assign(OCEAN_UNIFORMS, {});
    OCEAN_UNIFORMS.uLightDir.value.copy(this.key);
    OCEAN_UNIFORMS.uLightCol.value.copy(this.keyCol);
    OCEAN_UNIFORMS.uAmb.value.copy(this.amb);
    OCEAN_UNIFORMS.uFogCol.value.copy(this.horizon);
    OCEAN_UNIFORMS.uFogDen.value = lerp(0.00035, 0.0042, storm * storm);
    if (this.scene.fog) { this.scene.fog.color.copy(this.horizon); this.scene.fog.density = OCEAN_UNIFORMS.uFogDen.value; }
    // пересчёт env-карты при заметных изменениях
    const key = (tod * 6 | 0) + ':' + (storm * 10 | 0);
    if (key !== this.envKey) {
      this.envKey = key;
      const rt = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt; this.scene.environment = rt.texture;
    }
    this.scene.environmentIntensity = 1;
  }
}
