// ===================== утилиты =====================
const $ = id => document.getElementById(id);
const PI = Math.PI, TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = x => x - Math.floor(x);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const c8 = v => v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// value-noise с периодом (для тайлящихся текстур)
function makeValueNoise(seed) {
  const R = mulberry(seed), P = new Uint16Array(512), p = [];
  for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) { const j = (R() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const G = new Float32Array(256); for (let i = 0; i < 256; i++) G[i] = R() * 2 - 1;
  const h = (x, y, px, py) => { x = ((x % px) + px) % px; y = ((y % py) + py) % py; return G[P[P[x & 255] + (y & 255)]]; };
  function n(x, y, px = 4096, py = px) {
    const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi, px, py), b = h(xi + 1, yi, px, py), c = h(xi, yi + 1, px, py), d = h(xi + 1, yi + 1, px, py);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, oct = 4, px = 4096, py = px, gain = 0.5) {
    let s = 0, a = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f, px * f, py * f); norm += a; a *= gain; f *= 2; }
    return s / norm;
  }
  return { n, fbm };
}
const NZ = makeValueNoise(7), NZ2 = makeValueNoise(91);

// ---------- геометрия ----------
function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const g of list) { if (!g.attributes.normal) g.computeVertexNormals(); nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count;
    for (let i = 0; i < n; i++) {
      const o = (vo + i) * 3;
      pos[o] = P.getX(i); pos[o + 1] = P.getY(i); pos[o + 2] = P.getZ(i);
      nor[o] = N.getX(i); nor[o + 1] = N.getY(i); nor[o + 2] = N.getZ(i);
      if (U) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); }
    }
    if (g.index) { const I = g.index; for (let i = 0; i < I.count; i++) idx[io++] = I.getX(i) + vo; }
    else for (let i = 0; i < n; i++) idx[io++] = vo + i;
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

class Batch {
  constructor() { this.m = new Map(); }
  add(geo, mat, mtx) { if (mtx) geo.applyMatrix4(mtx); let e = this.m.get(mat); if (!e) this.m.set(mat, e = []); e.push(geo); return geo; }
  build(parent, cast = true, receive = true) {
    const out = [];
    for (const [mat, list] of this.m) {
      const mesh = new THREE.Mesh(mergeGeos(list), mat);
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      parent.add(mesh); out.push(mesh); list.forEach(g => g.dispose());
    }
    this.m.clear(); return out;
  }
}

const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0), _ONE = new THREE.Vector3(1, 1, 1);
function cylBetween(a, b, r1, r2, seg = 8, open = false) {
  const d = _v1.copy(b).sub(a); const L = Math.max(d.length(), 1e-4);
  const g = new THREE.CylinderGeometry(r2, r1, L, seg, 1, open);
  _q.setFromUnitVectors(_UP, d.normalize());
  _m4.compose(_v2.addVectors(a, b).multiplyScalar(0.5), _q, _ONE);
  g.applyMatrix4(_m4); return g;
}
function M4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
function tubeAlong(points, r, radial = 6, segs) {
  const c = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return new THREE.TubeGeometry(c, segs || Math.max(8, points.length * 3), r, radial, false);
}
function gridGeo(nu, nv, fn, flip = false) { // fn(i/nu, j/nv) -> [x,y,z,u,v]
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const r = fn(i / nu, j / nv); pos.push(r[0], r[1], r[2]); uv.push(r[3], r[4]); }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    if (!flip) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

// ---------- текстуры ----------
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; }
function canvasTex(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; t.needsUpdate = true; return t;
}
function dataTex(arr, w, h, { srgb = false, repeat = false } = {}) {
  const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; t.needsUpdate = true; return t;
}
function setLoad(txt, f) { $('loadText').textContent = txt; $('loadBar').style.width = (f * 100).toFixed(0) + '%'; }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.remove('show'), 1800); }
