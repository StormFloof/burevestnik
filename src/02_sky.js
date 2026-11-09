// ===================== небо, солнце, луна, облака =====================
const SKY_UNIFORMS = {
  uSunDir: { value: V3(0, 1, 0) }, uMoonDir: { value: V3(0, -1, 0) },
  uStorm: { value: 0.2 }, uTime: { value: 0 }, uNoise: { value: null }, uFlash: { value: 0 },
  uSkyGain: { value: 1 }, uCloudShift: { value: new THREE.Vector2() },
};

const SKY_GLSL = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uStorm; uniform float uTime;
uniform sampler2D uNoise; uniform float uFlash; uniform float uSkyGain; uniform vec2 uCloudShift;
const vec3 BR = vec3(0.046, 0.108, 0.265);
const float SKYK = 1.9;
float airmass(float y){ return 1.0/(max(y,0.0)+0.034); }
float hgPhase(float mu, float g){ float g2=g*g; return (1.0-g2)/pow(1.0+g2-2.0*g*mu,1.5)*0.0796; }
vec3 sunTrans(float y, float bm){ return exp(-(BR+bm)*airmass(y)); }
// чистая атмосфера (без облаков и диска)
vec3 atmosphere(vec3 d){
  float bm = mix(0.022, 0.24, uStorm);
  vec3 dd = d; dd.y = max(dd.y, 0.0);
  float mv = airmass(dd.y);
  vec3 ext = 1.0 - exp(-(BR+bm)*mv);
  vec3 c = vec3(0.0);
  // солнце
  {
    float mu = dot(dd, uSunDir);
    float mS = airmass(uSunDir.y); mS = mix(mS, min(mS, 2.6), smoothstep(0.0, 0.45, dd.y));
    vec3 T = exp(-(BR+bm)*mS) * smoothstep(-0.12, 0.02, uSunDir.y);
    vec3 ph = (BR*0.75*(1.0+mu*mu) + bm*hgPhase(mu, 0.76)*4.0) / (BR+bm);
    c += SKYK * T * ph * ext;
    c += SKYK * T * ext * 0.09 * smoothstep(-0.1, 0.25, uSunDir.y); // многократное рассеяние
  }
  // луна
  {
    float mu = dot(dd, uMoonDir);
    vec3 T = sunTrans(uMoonDir.y, bm) * smoothstep(-0.1, 0.05, uMoonDir.y);
    vec3 ph = (BR*0.75*(1.0+mu*mu) + bm*hgPhase(mu, 0.8)*4.0) / (BR+bm);
    c += SKYK*0.0055 * T * ph * ext * vec3(0.75, 0.85, 1.15);
  }
  c += vec3(0.0011, 0.0017, 0.0034) * (1.0 + 2.0*exp(-dd.y*6.0)); // свечение ночного неба
  // шторм: серая хмарь
  float lum = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(c, vec3(lum)*vec3(0.88, 0.94, 1.02), uStorm*0.85) * (1.0 - uStorm*0.55);
  return c * uSkyGain;
}
float cloudNoise(vec2 p, float detail){
  float n = texture2D(uNoise, p).r*0.56 + texture2D(uNoise, p*2.31+vec2(0.31,0.17)).g*0.29;
  n += detail > 0.5 ? texture2D(uNoise, p*5.73+vec2(0.71,0.43)).b*0.15 : 0.075;
  return n;
}
// облака: rgb — свет, a — плотность
vec4 clouds(vec3 d, float detail){
  if (d.y < 0.004) return vec4(0.0);
  vec2 p = d.xz/(d.y+0.07)*0.034 + uCloudShift;
  float n = cloudNoise(p, detail);
  float cov = mix(0.565, 0.33, uStorm);
  float a = smoothstep(cov, cov+mix(0.16, 0.26, uStorm), n);
  if (a <= 0.001) return vec4(0.0);
  vec3 L = uSunDir.y > -0.06 ? uSunDir : uMoonDir;
  vec2 ps = p + normalize(L.xz+1e-4)*0.014*(1.0-abs(L.y)*0.5);
  float n2 = cloudNoise(ps, 0.0);
  float shade = clamp(0.62 + (n - n2)*5.5, 0.0, 1.0);
  float bm = mix(0.022, 0.24, uStorm);
  vec3 sunC = 6.0*sunTrans(uSunDir.y, bm)*smoothstep(-0.08, 0.03, uSunDir.y);
  vec3 moonC = 0.06*sunTrans(uMoonDir.y, bm)*smoothstep(-0.05, 0.05, uMoonDir.y)*vec3(0.75,0.85,1.15);
  float mu = dot(d, uSunDir);
  float silver = pow(max(mu,0.0), 12.0)*2.2*(1.0-a*0.6);
  vec3 amb = atmosphere(vec3(0.0,1.0,0.0))*1.6 + atmosphere(normalize(vec3(d.x,0.05,d.z)))*0.35;
  vec3 col = (sunC + moonC*12.0*0.0) * (shade*0.13 + silver*0.05) + moonC*(shade*0.6) + amb;
  // тёмные грозовые днища
  col *= mix(1.0, 0.2 + 0.24*shade, uStorm);
  col += uFlash * vec3(1.6, 1.7, 2.1) * (0.4 + shade);
  float fade = smoothstep(0.004, 0.11, d.y);
  return vec4(col * uSkyGain, a * fade * mix(0.92, 1.0, uStorm));
}
vec3 skyFull(vec3 d, float detail){
  vec3 c = atmosphere(d);
  vec4 cl = clouds(d, detail);
  return mix(c, cl.rgb, cl.a);
}
`;

function makeSkyDome(noSun = false) {
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, SKY_UNIFORMS, { uNoSun: { value: noSun ? 1 : 0 } }), side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform float uNoSun;
      ${SKY_GLSL}
      float hash3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        vec3 c = atmosphere(d);
        float night = smoothstep(0.08, -0.12, uSunDir.y);
        // звёзды
        if (night > 0.01 && d.y > 0.0) {
          vec3 q = d*260.0; vec3 cell = floor(q); vec3 f = fract(q)-0.5;
          float h = hash3(cell);
          if (h > 0.985) {
            float s = smoothstep(0.32, 0.0, length(f)) * (h-0.985)*66.0;
            float tw = 0.65 + 0.35*sin(uTime*(2.0+h*9.0)+h*80.0);
            vec3 sc = mix(vec3(0.75,0.85,1.2), vec3(1.25,1.0,0.75), fract(h*91.7));
            c += sc * s * tw * 0.42 * night * smoothstep(0.0, 0.12, d.y) * (1.0-uStorm);
          }
          // млечный путь
          float band = exp(-pow(dot(d, normalize(vec3(0.3,0.55,0.78)))*3.6, 2.0));
          float mw = texture2D(uNoise, d.xz*1.3+0.2).r*texture2D(uNoise, d.xy*2.7).g;
          c += vec3(0.010,0.011,0.016)*band*mw*3.0*night*(1.0-uStorm);
        }
        // солнце
        float mu = dot(d, uSunDir);
        float bm = mix(0.022, 0.24, uStorm);
        vec3 T = sunTrans(uSunDir.y, bm);
        float disc = smoothstep(0.99996, 0.999985, mu);
        float sunVis = (1.0 - uNoSun) * (1.0 - uStorm*0.85);
        c += T * disc * 2600.0 * smoothstep(-0.02, 0.01, d.y) * sunVis;
        c += T * (pow(max(mu,0.0), 900.0)*30.0 + pow(max(mu,0.0), 80.0)*1.2) * (1.0-uStorm*0.7) * mix(1.0, 0.15, uNoSun);
        // луна
        float mm = dot(d, uMoonDir);
        if (mm > 0.9998) {
          vec3 rt = normalize(cross(uMoonDir, vec3(0.0,1.0,0.0))); vec3 up = cross(rt, uMoonDir);
          vec2 mq = vec2(dot(d-uMoonDir, rt), dot(d-uMoonDir, up)) / 0.0145;
          float r = length(mq);
          if (r < 1.0) {
            vec3 sn = vec3(mq, sqrt(1.0-r*r));
            float lit = clamp(dot(sn, normalize(vec3(-0.55, 0.15, 0.82))), 0.0, 1.0);
            float maria = texture2D(uNoise, mq*0.18+0.4).r;
            vec3 mc = vec3(1.0,0.97,0.9) * (0.55 + 0.6*smoothstep(0.35,0.7,maria)) * (0.04 + lit);
            c = mix(c, mc * 1.9 * sunTrans(uMoonDir.y, bm), smoothstep(1.0, 0.96, r));
          }
        }
        c += vec3(0.6,0.7,1.0) * pow(max(mm,0.0), 600.0) * 0.5 * smoothstep(-0.02,0.04,uMoonDir.y);
        vec4 cl = clouds(d, 1.0);
        c = mix(c, cl.rgb, cl.a);
        // ниже горизонта — тёмное море (для env-карты)
        if (d.y < 0.0) {
          vec3 h = atmosphere(normalize(vec3(d.x, 0.0, d.z)));
          c = mix(h, h*0.12 + vec3(0.002,0.01,0.014), smoothstep(-0.012, -0.25, d.y));
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  m.frustumCulled = false; m.renderOrder = -100;
  return m;
}

// астрономия (в часах). Восток = +X, север = -Z.
function sunMoonFromTime(tod, sun, moon) {
  const lat = 34 * PI / 180;
  const f = (hh, dec, out) => {
    const h = (hh - 12.4) / 12 * PI;
    const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
    const east = -Math.cos(dec) * Math.sin(h);
    const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(h);
    out.set(east, up, -north).normalize();
  };
  f(tod, 11 * PI / 180, sun);
  f(tod + 11.2, -4 * PI / 180, moon);
}

// цвет/сила прямого света (тот же расчёт, что и в шейдере)
const _BR = [0.046, 0.108, 0.265];
function sunTransJS(y, storm, out) {
  const bm = lerp(0.022, 0.24, storm), m = 1 / (Math.max(y, 0) + 0.034);
  out.setRGB(Math.exp(-(_BR[0] + bm) * m), Math.exp(-(_BR[1] + bm) * m), Math.exp(-(_BR[2] + bm) * m));
  return out;
}
