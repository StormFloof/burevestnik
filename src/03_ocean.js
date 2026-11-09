// ===================== океан: волны Герстнера (общие для GPU и CPU) =====================
// [длина волны м, угол от ветра рад, вес]
const WAVE_DEF = [
  [78, 0.00, 1.00], [53, 0.38, 0.85], [37, -0.46, 0.80], [26, 0.85, 0.65],
  [18.5, -0.95, 0.60], [13.1, 0.22, 0.55], [9.4, 1.35, 0.50], [6.8, -1.55, 0.45],
  [4.9, 0.62, 0.42], [3.6, -0.30, 0.40], [2.6, 1.9, 0.35], [1.9, -2.2, 0.32],
];
const NW = WAVE_DEF.length;
const WAVES = {
  A: new Float32Array(NW), k: new Float32Array(NW), w: new Float32Array(NW), ph: new Float32Array(NW),
  dx: new Float32Array(NW), dz: new Float32Array(NW), Q: new Float32Array(NW), fade: new Float32Array(NW),
  uA: Array.from({ length: NW }, () => new THREE.Vector4()), uB: Array.from({ length: NW }, () => new THREE.Vector4()),
  amp: 1, time: 0,
};
{
  const R = mulberry(77);
  for (let i = 0; i < NW; i++) { WAVES.ph[i] = R() * TAU; const k = TAU / WAVE_DEF[i][0]; WAVES.k[i] = k; WAVES.w[i] = Math.sqrt(9.81 * k); }
}
function setSeaState(storm, windAng) {
  const eps = lerp(0.0055, 0.042, Math.pow(storm, 1.3));
  let sumH = 0;
  for (let i = 0; i < NW; i++) {
    const [lam, ang, wgt] = WAVE_DEF[i];
    // в штиль длинные волны слабее, в шторм — доминируют
    const longBias = lam > 30 ? lerp(0.45, 1.25, storm) : lam < 6 ? lerp(1.2, 0.9, storm) : 1;
    const A = lam * eps * wgt * longBias / TAU * 2.2;
    const a = windAng + ang * lerp(1, 0.7, storm);
    WAVES.A[i] = A; WAVES.dx[i] = Math.cos(a); WAVES.dz[i] = Math.sin(a);
    WAVES.Q[i] = clamp(lerp(0.55, 0.85, storm) / (WAVES.k[i] * A * NW + 1e-6), 0, 1.0);
    WAVES.fade[i] = Math.max(260, lam * 26);
    WAVES.uA[i].set(WAVES.dx[i], WAVES.dz[i], WAVES.k[i], A);
    WAVES.uB[i].set(WAVES.w[i], WAVES.ph[i], WAVES.Q[i], WAVES.fade[i]);
    sumH += A;
  }
  WAVES.amp = sumH;
}

// смещение точки решётки p (без инверсии)
function gerstnerAt(px, pz, t, out) {
  let x = 0, y = 0, z = 0, nx = 0, nz = 0, jxx = 1, jzz = 1, jxz = 0;
  for (let i = 0; i < NW; i++) {
    const A = WAVES.A[i], k = WAVES.k[i], dx = WAVES.dx[i], dz = WAVES.dz[i], Q = WAVES.Q[i];
    const th = k * (dx * px + dz * pz) - WAVES.w[i] * t + WAVES.ph[i];
    const s = Math.sin(th), c = Math.cos(th), WA = k * A;
    x += Q * A * dx * c; y += A * s; z += Q * A * dz * c;
    nx += WA * dx * c; nz += WA * dz * c;
    jxx -= Q * WA * dx * dx * s; jzz -= Q * WA * dz * dz * s; jxz -= Q * WA * dx * dz * s;
  }
  out.x = x; out.y = y; out.z = z; out.sx = nx; out.sz = nz; out.jxx = jxx; out.jzz = jzz; out.jxz = jxz;
  return out;
}
const _gw = {};
// высота воды в мировой точке (x,z) с инверсией горизонтального смещения
function waterHeight(x, z, t = WAVES.time) {
  let px = x, pz = z;
  for (let it = 0; it < 4; it++) { gerstnerAt(px, pz, t, _gw); px = x - _gw.x; pz = z - _gw.z; }
  gerstnerAt(px, pz, t, _gw);
  return _gw.y;
}
// высота + нормаль
function waterSample(x, z, t, out) {
  const h = waterHeight(x, z, t);
  const g = _gw;
  // dP/dx = (jxx, sx, jxz), dP/dz = (jxz, sz, jzz) ; n = dPdz × dPdx
  const ax = g.jxx, ay = g.sx, az = g.jxz, bx = g.jxz, by = g.sz, bz = g.jzz;
  let nx = by * az - bz * ay, ny = bz * ax - bx * az, nz = bx * ay - by * ax;
  const l = Math.hypot(nx, ny, nz); out.h = h; out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
  return out;
}

const OCEAN_UNIFORMS = {
  uWA: { value: WAVES.uA }, uWB: { value: WAVES.uB }, uCenter: { value: new THREE.Vector2() },
  uLightDir: { value: V3(0, 1, 0) }, uLightCol: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.2, 0.25, 0.3) },
  uFogCol: { value: new THREE.Color() }, uFogDen: { value: 0.0012 }, uWaterN: { value: null }, uFoamThr: { value: 0.3 },
  uWaveAmp: { value: 1 }, uShip: { value: new THREE.Vector4(0, 0, 0, 0) }, uShipDir: { value: new THREE.Vector2(1, 0) },
  uWake: { value: null }, uWakeMat: { value: new THREE.Matrix4() }, uReflTex: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 },
};

const GERSTNER_GLSL = /* glsl */`
#define NW ${NW}
uniform vec4 uWA[NW]; uniform vec4 uWB[NW];
void gerstner(vec2 p, float dist, float t, out vec3 disp, out vec3 nrm, out float jac){
  disp = vec3(0.0); float sx = 0.0, sz = 0.0, jxx = 1.0, jzz = 1.0, jxz = 0.0;
  for (int i = 0; i < NW; i++) {
    vec4 a = uWA[i], b = uWB[i];
    float A = a.w * (1.0 - smoothstep(b.w*0.45, b.w, dist));
    if (A < 1e-4) continue;
    float k = a.z;
    float th = k*dot(a.xy, p) - b.x*t + b.y;
    float s = sin(th), c = cos(th), WA = k*A, Q = b.z;
    disp += vec3(Q*A*a.x*c, A*s, Q*A*a.y*c);
    sx += WA*a.x*c; sz += WA*a.y*c;
    jxx -= Q*WA*a.x*a.x*s; jzz -= Q*WA*a.y*a.y*s; jxz -= Q*WA*a.x*a.y*s;
  }
  vec3 dPdx = vec3(jxx, sx, jxz), dPdz = vec3(jxz, sz, jzz);
  nrm = normalize(cross(dPdz, dPdx));
  jac = jxx*jzz - jxz*jxz;
}
`;

function makeOceanGrid() {
  const RINGS = 230, SEG = 400, R0 = 0.22, RMAX = 7000;
  const b = Math.log(RMAX / R0) / RINGS;
  const pos = new Float32Array((RINGS + 1) * SEG * 3 + 3), idx = [];
  pos[0] = 0; pos[1] = 0; pos[2] = 0;
  for (let r = 0; r <= RINGS; r++) {
    const rad = R0 * Math.exp(b * r) - R0 * 0.999 + 0.08 * r * 0;
    for (let s = 0; s < SEG; s++) {
      const a = (s + (r & 1) * 0.5) / SEG * TAU, o = 3 + (r * SEG + s) * 3;
      pos[o] = Math.cos(a) * rad; pos[o + 1] = 0; pos[o + 2] = Math.sin(a) * rad;
    }
  }
  for (let s = 0; s < SEG; s++) idx.push(0, 1 + (s + 1) % SEG, 1 + s);
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
    const a = 1 + r * SEG + s, b2 = 1 + r * SEG + (s + 1) % SEG, c = a + SEG, d = b2 + SEG;
    idx.push(a, b2, c, b2, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(V3(), 1e5);
  return g;
}

function makeOcean() {
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, SKY_UNIFORMS, OCEAN_UNIFORMS),
    vertexShader: /* glsl */`
      uniform vec2 uCenter; uniform float uTime;
      ${GERSTNER_GLSL}
      varying vec3 vW; varying vec3 vN; varying float vJ; varying float vH; varying vec2 vGrid; varying float vDist;
      void main(){
        vec2 p = position.xz + uCenter;
        float dist = length(position.xz);
        vec3 d, n; float j;
        gerstner(p, dist, uTime, d, n, j);
        vec3 w = vec3(p.x + d.x, d.y, p.y + d.z);
        vW = w; vN = n; vJ = j; vH = d.y; vGrid = p; vDist = dist;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${SKY_GLSL}
      uniform vec3 uLightDir; uniform vec3 uLightCol; uniform vec3 uAmb; uniform vec3 uFogCol; uniform float uFogDen;
      uniform sampler2D uWaterN; uniform float uFoamThr; uniform float uWaveAmp;
      uniform vec4 uShip; uniform vec2 uShipDir;
      uniform sampler2D uWake; uniform mat4 uWakeMat;
      uniform sampler2D uReflTex; uniform mat4 uReflMat; uniform float uReflOn;
      varying vec3 vW; varying vec3 vN; varying float vJ; varying float vH; varying vec2 vGrid; varying float vDist;
      vec3 wn(vec2 uv){ return texture2D(uWaterN, uv).xyz*2.0 - 1.0; }
      void main(){
        vec3 toEye = cameraPosition - vW; float dist = length(toEye); vec3 V = toEye/dist;
        vec2 wp = vGrid;
        // детальные нормали: два слоя ряби + шумовые пятна (ветровая рябь)
        float detail = exp(-dist/110.0) * mix(0.55, 1.0, uStorm);
        vec3 n1 = wn(wp*0.061 + vec2(uTime*0.021, uTime*0.013));
        vec3 n2 = wn(mat2(0.8,0.6,-0.6,0.8)*wp*0.173 - vec2(uTime*0.035, -uTime*0.022));
        vec3 n3 = wn(wp*0.47 + vec2(-uTime*0.06, uTime*0.05));
        float gust = texture2D(uNoise, wp*0.0045 + uTime*0.0015).r;
        vec2 slope = (n1.xy*0.55 + n2.xy*0.45 + n3.xy*0.25*exp(-dist/30.0)) * detail * (0.55 + gust*0.9);
        vec3 N = normalize(vN + vec3(slope.x, 0.0, slope.y)*0.85);
        // след за кораблём (wake-текстура, пена + возмущение)
        vec4 wk = vec4(0.0);
        vec4 wq = uWakeMat * vec4(vW.x, 0.0, vW.z, 1.0);
        if (abs(wq.x) < 1.0 && abs(wq.y) < 1.0) { wk = texture2D(uWake, wq.xy*0.5+0.5); }
        N = normalize(N + vec3(wk.g-0.5, 0.0, wk.b-0.5)*wk.a*1.4);

        float ndv = max(dot(N, V), 0.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.002;
        float F = 0.02 + 0.98*pow(1.0 - ndv, 5.0);
        F = mix(F, 0.06 + 0.4*pow(1.0-ndv, 3.0), smoothstep(80.0, 900.0, dist)*0.6);
        vec3 refl = skyFull(normalize(R), 0.0);
        // планарное отражение корабля
        if (uReflOn > 0.5) {
          vec4 rp = uReflMat * vec4(vW.x, 0.0, vW.z, 1.0);
          vec2 ruv = rp.xy/rp.w*0.5 + 0.5 + N.xz*0.06;
          if (rp.w > 0.0 && ruv.x > 0.0 && ruv.x < 1.0 && ruv.y > 0.0 && ruv.y < 1.0) {
            vec4 rc = texture2D(uReflTex, ruv);
            refl = mix(refl, rc.rgb, rc.a);
          }
        }
        // тело воды
        vec3 L = uLightDir;
        float hN = clamp(vH/(uWaveAmp+0.05)*0.5 + 0.5, 0.0, 1.0);
        vec3 deep = vec3(0.0035, 0.018, 0.03);
        vec3 scat = vec3(0.012, 0.075, 0.105);
        vec3 body = deep*(uAmb*2.0 + uLightCol*0.08) + scat*(uAmb*0.9 + uLightCol*max(dot(N,L),0.0)*0.06)*(0.4 + hN*0.9);
        // подповерхностное свечение гребней на просвет
        vec3 Lh = normalize(vec3(-L.x, 0.0, -L.z) + vec3(0.0, 0.25, 0.0));
        float sss = pow(clamp(dot(V, normalize(vec3(-L.x, -0.15, -L.z))), 0.0, 1.0), 4.0) * smoothstep(0.35, 1.0, hN) * (0.4 + 0.6*max(dot(N, -Lh), 0.0));
        body += vec3(0.05, 0.32, 0.25) * uLightCol * sss * 0.11;
        vec3 col = mix(body, refl, F);
        // солнечные блики
        vec3 H = normalize(L + V);
        float rough = mix(0.035, 0.11, uStorm) + smoothstep(50.0, 800.0, dist)*0.1;
        float m = 2.0/(rough*rough) - 2.0;
        float spec = (m+8.0)/25.13 * pow(max(dot(N,H),0.0), m) * F * smoothstep(0.0, 0.08, L.y + 0.04);
        col += uLightCol * spec * 1.4;
        // пена на гребнях
        float fn = texture2D(uNoise, wp*0.09 + vec2(uTime*0.01, 0.0)).g * 0.6 + texture2D(uNoise, wp*0.31 - vec2(0.0, uTime*0.02)).b * 0.4;
        float crest = smoothstep(uFoamThr + 0.28, uFoamThr - 0.12, vJ);
        float foam = clamp(crest*(fn*1.7 - 0.25), 0.0, 1.0);
        foam += smoothstep(0.62, 0.8, fn) * uStorm * 0.25 * smoothstep(0.4, 0.95, hN);
        // пена следа
        foam = max(foam, wk.r * smoothstep(0.28, 0.72, fn + wk.r * 0.35));
        foam = clamp(foam, 0.0, 1.0) * exp(-dist/650.0);
        vec3 foamCol = uLightCol*max(dot(N,L)*0.5+0.5, 0.0)*0.09 + uAmb*1.25;
        col = mix(col, foamCol, foam*0.92);
        // туман/дымка к горизонту
        vec3 hd = normalize(vec3(-V.x, max(-V.y, 0.0)*0.2 + 0.015, -V.z));
        vec3 fogC = atmosphere(hd);
        fogC = mix(fogC, uFogCol, 0.5);
        float fog = 1.0 - exp(-dist*uFogDen);
        col = mix(col, fogC, fog);
        col += uFlash * vec3(0.5,0.55,0.7) * F;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.uniforms.uTime = SKY_UNIFORMS.uTime;
  const mesh = new THREE.Mesh(makeOceanGrid(), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -50;
  return mesh;
}
