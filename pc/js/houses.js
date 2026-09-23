// Облик домов: фасады с окнами по типу здания, парапеты и короба на плоских крышах, скатные крыши у частных домов.
// Окна рисует шейдер по «развёртке» стены (метры вдоль стены и высота), поэтому текстуры не нужны.
import * as THREE from 'three';
import {inShape, ringArea} from './osm.js?v=6';

const PLASTER = 0, BRICK = 1, PANEL = 2, GLASS = 3, IND = 4, CHURCH = 5, HOUSE = 6;
const WALLS = [
  ['#dccaa2', '#e5d6b8', '#d2ab8c', '#cdb57e', '#bcc6b0', '#c5ced6', '#e8dfd0', '#d8b8a8', '#c9a27c'], // штукатурка
  ['#9b5b44', '#8a4e3b', '#b27b57', '#c8a16c', '#7e4b3b', '#a86a4c'],                                   // кирпич
  ['#d0cfc8', '#dad5c9', '#bfc6ca', '#cbc3b6', '#b9c0b7', '#d6d9dc'],                                   // панель
  ['#5d7183', '#4e6273', '#6a7c8b', '#57697a', '#44525f'],                                              // стекло
  ['#9ba1a4', '#8f9497', '#a7a093', '#808b91', '#b3ada2'],                                              // промзона
  ['#efe8da', '#f2e4c2', '#ebdaca', '#e6e9ee'],                                                         // храм
  ['#dbd0bb', '#cbb99e', '#e4dac8', '#b8a78e', '#d1d5d0', '#c9b8a6']                                    // частный дом
];
const FLOOR_H = [3.5, 3.0, 2.8, 3.7, 5, 6, 3.0];
const ROOF_FLAT = ['#6b6d6f', '#7c7b76', '#8a867e', '#5f6164', '#9a968d', '#74716a', '#a39b8b', '#7d5d4f', '#5f7564', '#6f7a84'];
const ROOF_PITCH = ['#8f4a36', '#7b4733', '#5c6064', '#6e8060', '#9d5c40', '#4f5b67', '#6a4a3a'];
const ROOF_CHURCH = ['#6f9275', '#c9a54a', '#5d6773', '#7da08a'];
export const EQUIP = new THREE.Color('#a3a5a6');
const C = new THREE.Color(), UP = [0, 1, 0];
const pick = (a, x) => a[Math.floor(x * a.length) % a.length];

function rng(seed) { // свой генератор на каждый дом: облик не меняется от загрузки к загрузке
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function validColour(s) {
  if (!s) return null;
  s = s.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return s;
  return THREE.Color.NAMES[s.replace(/\s+/g, '')] !== undefined ? s.replace(/\s+/g, '') : null;
}
const vec2 = f => { const a = []; for (let i = 0; i < f.length; i += 2) a.push(new THREE.Vector2(f[i], f[i + 1])); return a; };

// тип фасада: по тегам OSM, а где их нет — по высоте и назначению
function facadeStyle(b, x) {
  const t = b.t || '', m = (b.m || '').toLowerCase(), h = b.h;
  if (b.k === 'rel' || /church|cathedral|chapel|temple|mosque|synagogue|monastery|shrine/.test(t)) return CHURCH;
  if (b.k === 'ind' || /warehouse|industrial|garage|shed|hangar|service|storage|manufacture|kiosk|hut/.test(t)) return IND;
  if (/glass|mirror/.test(m)) return GLASS; // материал из OSM важнее догадок по высоте
  if (/brick/.test(m)) return BRICK;
  if (/panel|concrete/.test(m)) return PANEL;
  if (/plaster|stucco|stone|masonry|sandstone|granite|marble/.test(m)) return PLASTER;
  if (h >= 50 || (b.k === 'com' && h >= 24)) return GLASS;
  if (/house|detached|bungalow|cabin|farm|villa/.test(t) || (b.k === 'res' && h <= 8.5)) return HOUSE;
  if (h >= 27) return x < .75 ? PANEL : BRICK; // высотки — чаще панельки
  return x < .5 ? PLASTER : x < .78 ? BRICK : PANEL;
}

// наименьший повёрнутый прямоугольник вокруг контура: по нему строим скатную крышу
export function obb(p) {
  const n = p.length / 2;
  if (n < 3) return null;
  let best = null;
  for (let j = 0; j < n; j++) {
    const ax = p[j * 2], ay = p[j * 2 + 1], bx = p[(j + 1) % n * 2], by = p[(j + 1) % n * 2 + 1], len = Math.hypot(bx - ax, by - ay);
    if (len < .5) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = p[k * 2], y = p[k * 2 + 1], s = x * ux + y * uy, t = -x * uy + y * ux;
      if (s < x0) x0 = s; if (s > x1) x1 = s; if (t < y0) y0 = t; if (t > y1) y1 = t;
    }
    const A = (x1 - x0) * (y1 - y0);
    if (!best || A < best.A) best = {A, ux, uy, x0, x1, y0, y1};
  }
  if (!best) return null;
  let {ux, uy} = best, L = best.x1 - best.x0, W = best.y1 - best.y0;
  const s = (best.x0 + best.x1) / 2, t = (best.y0 + best.y1) / 2, cx = s * ux - t * uy, cy = s * uy + t * ux;
  if (W > L) { [L, W] = [W, L]; [ux, uy] = [-uy, ux]; } // длинная ось — ux
  return {cx, cy, ux, uy, L, W, fit: Math.abs(ringArea(p)) / best.A};
}

function roofPlan(b, st, x) {
  if (b.hl) return null;
  const rs = (b.rs || '').toLowerCase();
  let kind;
  if (/^(hipped|half-hipped|mansard)$/.test(rs)) kind = 'hip';
  else if (/^(gabled|gambrel|saltbox)$/.test(rs)) kind = 'gable';
  else if (/^(pyramidal|dome|onion|cone|round)$/.test(rs)) kind = 'pyr';
  else if (rs) return null; // плоская, односкатная и прочее — плоская с парапетом
  else if (st === HOUSE) kind = x < .55 ? 'hip' : 'gable';
  else if (st === CHURCH && Math.abs(ringArea(b.p)) < 700) kind = 'pyr';
  else return null;
  const o = obb(b.p);
  if (!o || o.fit < .86 || o.W < 3.5 || b.p.length > 40) return null; // только почти прямоугольные: иначе крыша повиснет над пустотой
  if (kind === 'hip' && o.L - o.W < 1) kind = 'pyr';
  return {...o, kind};
}

/* ---------- геометрия всех домов одним куском ----------
   На вершину: позиция, нормаль, цвет (перекрашивается при выборе), aWall — развёртка стены
   (метры вдоль стены, высота, длина стены, высота до крыши), aMat — тип фасада, случайное число дома, высота этажа. */
export function buildHouses(map) {
  const B = map.b, n = B.length, P = [], NR = [], PT = [], AW = [], AM = [];
  let V = 0;
  const put = (x, y, z, nx, ny, nz, part, w0, w1, w2, w3, st, sd, fh) => {
    P.push(x, y, z); NR.push(nx, ny, nz); PT.push(part); AW.push(w0, w1, w2, w3); AM.push(st, sd, fh); V++;
  };
  // стена от точки a к точке c (координаты карты): лицевая сторона — справа по ходу обхода
  const wall = (ax, ay, cx, cy, y0, y1, part, st, sd, fh, H) => {
    const L = Math.hypot(cx - ax, cy - ay) || 1, nx = (cy - ay) / L, nz = (cx - ax) / L;
    put(ax, y0, -ay, nx, 0, nz, part, 0, y0, L, H, st, sd, fh);
    put(cx, y0, -cy, nx, 0, nz, part, L, y0, L, H, st, sd, fh);
    put(cx, y1, -cy, nx, 0, nz, part, L, y1, L, H, st, sd, fh);
    put(ax, y0, -ay, nx, 0, nz, part, 0, y0, L, H, st, sd, fh);
    put(cx, y1, -cy, nx, 0, nz, part, L, y1, L, H, st, sd, fh);
    put(ax, y1, -ay, nx, 0, nz, part, 0, y1, L, H, st, sd, fh);
  };
  // треугольник в координатах three.js; нормаль разворачиваем в сторону out
  const tri = (a, b, c, out, part, st, sd, fh, wf) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
    for (const q of [a, b, c]) { const w = wf(q); put(q[0], q[1], q[2], nx, ny, nz, part, w[0], w[1], w[2], w[3], st, sd, fh); }
  };
  // скатная крыша по повёрнутому прямоугольнику: вальмовая, двускатная с фронтонами или шатровая
  const pitchedRoof = (pl, h, st, sd, fh) => {
    const {cx, cy, ux, uy, L, W, kind} = pl, vx = -uy, vy = ux;
    const M = (s, t, y) => [cx + s * ux + t * vx, y, -(cy + s * uy + t * vy)];
    const ov = .45, a = L / 2, c = W / 2, top = h + Math.min(5.5, Math.max(1.6, W * .36));
    const roofW = q => [q[0], q[1] - h, q[2], 0];
    const R = (p, q, r) => tri(p, q, r, UP, 1, -2, sd, 0, roofW);
    if (kind === 'gable') {
      const C2 = c + ov, p1 = M(-a, -C2, h), p2 = M(a, -C2, h), p3 = M(a, C2, h), p4 = M(-a, C2, h), r1 = M(-a, 0, top), r2 = M(a, 0, top);
      R(p1, p2, r2); R(p1, r2, r1); R(p3, p4, r1); R(p3, r1, r2);
      for (const s of [-1, 1]) tri(M(s * a, -c, h), M(s * a, c, h), M(s * a, 0, top), [s * ux, 0, -s * uy], 0, st, sd, fh, q => [0, q[1], W, h]);
    } else {
      const A = a + ov, C2 = c + ov, p1 = M(-A, -C2, h), p2 = M(A, -C2, h), p3 = M(A, C2, h), p4 = M(-A, C2, h);
      if (kind === 'hip') {
        const e = a - c, r1 = M(-e, 0, top), r2 = M(e, 0, top);
        R(p1, p2, r2); R(p1, r2, r1); R(p3, p4, r1); R(p3, r1, r2); R(p4, p1, r1); R(p2, p3, r2);
      } else {
        const apex = M(0, 0, top);
        R(p1, p2, apex); R(p2, p3, apex); R(p3, p4, apex); R(p4, p1, apex);
      }
    }
    return top;
  };
  // короб на крыше (вентиляция, лифтовая, выход на крышу)
  const box = (x, y, w, d, hh, ux, uy, base) => {
    const vx = -uy, vy = ux;
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [x + s * w / 2 * ux + t * d / 2 * vx, y + s * w / 2 * uy + t * d / 2 * vy]);
    for (let k = 0; k < 4; k++) { const [ax, ay] = cs[k], [cx, cy] = cs[(k + 1) % 4]; wall(ax, ay, cx, cy, base, base + hh, 2, -3, 0, 0, 0); }
    const tp = cs.map(([px, py]) => [px, base + hh, -py]), z = () => [0, 0, 0, 0];
    tri(tp[0], tp[1], tp[2], UP, 2, -3, 0, 0, z); tri(tp[0], tp[2], tp[3], UP, 2, -3, 0, 0, z);
  };
  const roofBoxes = (b, h, r) => {
    const area = Math.abs(ringArea(b.p)) - (b.hl || []).reduce((a, q) => a + Math.abs(ringArea(q)), 0);
    if (area < 300 || h < 6) return h;
    const o = obb(b.p) || {ux: 1, uy: 0};
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, top = h;
    for (let k = 0; k < b.p.length; k += 2) { x0 = Math.min(x0, b.p[k]); x1 = Math.max(x1, b.p[k]); y0 = Math.min(y0, b.p[k + 1]); y1 = Math.max(y1, b.p[k + 1]); }
    const cnt = area > 2500 ? 4 : area > 1000 ? 3 : area > 550 ? 2 : 1;
    for (let k = 0, tries = 0; k < cnt && tries < 40; tries++) {
      const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), w = 2.5 + r() * 4, d = 2.5 + r() * 3.5, hh = 1.2 + r() * 2.2;
      const W2 = w / 2 + 1.2, D2 = d / 2 + 1.2; // с отступом от края крыши
      if (![[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].every(([s, t]) => inShape(x + s * W2 * o.ux - t * D2 * o.uy, y + s * W2 * o.uy + t * D2 * o.ux, b))) continue;
      box(x, y, w, d, hh, o.ux, o.uy, h);
      top = Math.max(top, h + hh); k++;
    }
    return top;
  };

  const bStart = new Int32Array(n), bEnd = new Int32Array(n), bh = new Float32Array(n), bb = new Float32Array(n * 4), wallCol = [], roofCol = [];
  for (let i = 0; i < n; i++) {
    const b = B[i], r = rng(i + 1), sd = r(), st0 = facadeStyle(b, r());
    const shop = st0 !== GLASS && st0 !== IND && st0 !== HOUSE && st0 !== CHURCH && (b.k === 'com' || r() < (b.k === 'pub' ? .15 : .3));
    const st = st0 + (shop ? 10 : 0); // +10 — витрины на первом этаже
    const h = b.h + ((i * 37) % 101) * .004; // чуть разная высота: у соседних крыш на одном уровне не будет ряби
    const fh = st0 === IND || st0 === CHURCH ? Math.max(4, h) : b.lv > 0 ? Math.min(5.5, Math.max(2.6, (h - .6) / b.lv)) : FLOOR_H[st0];
    const plan = roofPlan(b, st0, r());
    const wc = new THREE.Color(pick(WALLS[st0], r())), tag = validColour(b.c);
    if (tag) wc.lerp(C.set(tag), .6);
    wc.offsetHSL(0, 0, (r() - .5) * .06);
    const rc = new THREE.Color(pick(st0 === CHURCH ? ROOF_CHURCH : plan ? ROOF_PITCH : ROOF_FLAT, r())), rtag = validColour(b.rc);
    if (rtag) rc.lerp(C.set(rtag), .75);
    wallCol.push(wc); roofCol.push(rc);
    bStart[i] = V;
    const rings = b.hl ? [b.p, ...b.hl] : [b.p];
    let top;
    if (plan) {
      for (const p of rings) for (let j = 0, m = p.length; j < m; j += 2) wall(p[j], p[j + 1], p[(j + 2) % m], p[(j + 3) % m], 0, h, 0, st, sd, fh, h);
      top = (h + pitchedRoof(plan, h, st, sd, fh)) / 2; // для выбора мышью — середина ската
    } else {
      const par = st0 === GLASS ? 1.1 : st0 === IND ? .45 : .55 + r() * .45; // парапет над плоской крышей
      for (const p of rings) for (let j = 0, m = p.length; j < m; j += 2) {
        const ax = p[j], ay = p[j + 1], cx = p[(j + 2) % m], cy = p[(j + 3) % m];
        wall(ax, ay, cx, cy, 0, h + par, 0, st, sd, fh, h);
        wall(cx, cy, ax, ay, h, h + par, 0, -4, sd, fh, h); // внутренняя сторона парапета
      }
      const outer = vec2(b.p), holes = (b.hl || []).map(vec2);
      let faces = [];
      try { faces = THREE.ShapeUtils.triangulateShape(outer, holes); } catch (e) { /* кривой контур — без крыши */ }
      const all = outer.concat(...holes);
      for (const [a, b2, c] of faces) { // крыша смотрит вверх: если глядеть сверху, треугольник идёт против часовой
        const A = all[a], Bv = all[b2], Cv = all[c], ccw = (Bv.x - A.x) * (Cv.y - A.y) - (Bv.y - A.y) * (Cv.x - A.x) >= 0;
        for (const q of ccw ? [A, Bv, Cv] : [A, Cv, Bv]) put(q.x, h, -q.y, 0, 1, 0, 1, q.x, q.y, 0, 0, -1, sd, 0);
      }
      roofBoxes(b, h, r);
      top = h + par; // для выбора мышью короба не считаем — это та же крыша
    }
    bEnd[i] = V; bh[i] = top;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < b.p.length; k += 2) { x0 = Math.min(x0, b.p[k]); x1 = Math.max(x1, b.p[k]); y0 = Math.min(y0, b.p[k + 1]); y1 = Math.max(y1, b.p[k + 1]); }
    const mg = plan ? .6 : 0;
    bb[i * 4] = x0 - mg; bb[i * 4 + 1] = y0 - mg; bb[i * 4 + 2] = x1 + mg; bb[i * 4 + 3] = y1 + mg;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(NR, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(P.length), 3));
  g.setAttribute('aWall', new THREE.Float32BufferAttribute(AW, 4));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(AM, 3));
  g.computeBoundingSphere();
  return {geometry: g, part: Uint8Array.from(PT), bStart, bEnd, bh, bb, wallCol, roofCol};
}

/* ---------- шейдер фасадов: окна, наличники, швы панелей, отражение неба, свет в окнах ночью ---------- */
const PARS = `
uniform float uNight;
uniform float uLit;
uniform vec3 uSky;
varying vec4 vWall;
varying vec3 vMat;
float fHash(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  float a = fHash(vec3(i, 1.)), b = fHash(vec3(i + vec2(1., 0.), 1.)), c = fHash(vec3(i + vec2(0., 1.), 1.)), d = fHash(vec3(i + 1., 1.));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`;
const MAIN = `
vec3 facadeEmit = vec3(0.);
{
  float st = vMat.x, seed = vMat.y, fh = max(vMat.z, 2.);
  if (st > -.5) { // стена
    float u = vWall.x, v = vWall.y, L = vWall.z, H = vWall.w;
    float shop = step(9.5, st), s = st - shop * 10.;
    float sp = 3.4, ww = 1.3, wh = 1.9, sill = .85;                                     // штукатурка
    if (s > .5 && s < 1.5) { sp = 3.; ww = 1.2; wh = 1.6; sill = .9; }                    // кирпич
    else if (s > 1.5 && s < 2.5) { sp = 3.; ww = 1.6; wh = 1.45; sill = .8; }             // панель
    else if (s > 2.5 && s < 3.5) { sp = 1.6; ww = 1.44; wh = fh - .95; sill = .7; }       // стекло
    else if (s > 3.5 && s < 4.5) { sp = 6.; ww = 4.6; wh = 1.2; sill = fh - 1.8; }        // промзона: окна лентой под крышей
    else if (s > 4.5 && s < 5.5) { sp = 5.; ww = 1.4; wh = min(3.6, fh - 2.4); sill = 1.4; } // храм: высокие окна
    else if (s > 5.5) { sp = 4.2; ww = 1.3; wh = 1.35; sill = .95; }                      // частный дом
    float nC = floor(L / sp), off = (L - nC * sp) * .5;
    vec2 c = vec2((u - off) / sp, v / fh), id = floor(c), f = c - id;
    vec2 fw = max(fwidth(c), vec2(1e-4));
    float x0 = .5 - ww / sp * .5, x1 = 1. - x0, y0 = sill / fh, y1 = min(.96, (sill + wh) / fh);
    if (shop > .5 && id.y < .5) { x0 = .07; x1 = .93; y0 = .1; y1 = .82; }              // витрины
    float inCol = step(0., c.x) * step(c.x, nC);
    float inGrid = inCol * step(0., c.y) * step((id.y + y1) * fh, H - .15);
    float wx = clamp(smoothstep(x0 - fw.x, x0 + fw.x, f.x) - smoothstep(x1 - fw.x, x1 + fw.x, f.x), 0., 1.);
    float wy = clamp(smoothstep(y0 - fw.y, y0 + fw.y, f.y) - smoothstep(y1 - fw.y, y1 + fw.y, f.y), 0., 1.);
    float win = wx * wy * inGrid;
    float far = smoothstep(.2, .45, max(fw.x, fw.y)); // вдали окна сливаются в средний цвет — без ряби
    #ifdef FACADE_LOW
    far = 1.;
    #endif
    float near = 1. - far;
    float frac = (x1 - x0) * (y1 - y0) * inCol * step(v, H - .4);
    float w = mix(win, frac, far);
    vec3 wall = diffuseColor.rgb;
    if (s < .5) { // карниз, цоколь, светлые наличники
      wall *= 1. + .13 * (smoothstep(H - .85, H - .8, v) - smoothstep(H - .35, H - .3, v));
      wall *= 1. - .1 * (1. - smoothstep(.95, 1., v));
      float ax = clamp(smoothstep(x0 - .07 - fw.x, x0 - .07 + fw.x, f.x) - smoothstep(x1 + .07 - fw.x, x1 + .07 + fw.x, f.x), 0., 1.);
      float ay = clamp(smoothstep(y0 - .05 - fw.y, y0 - .05 + fw.y, f.y) - smoothstep(y1 + .07 - fw.y, y1 + .07 + fw.y, f.y), 0., 1.);
      wall = mix(wall, wall * 1.13, max(ax * ay * inGrid - win, 0.) * near);
    } else if (s < 1.5) { // белые рамы на кирпиче
      float ax = clamp(smoothstep(x0 - .035 - fw.x, x0 - .035 + fw.x, f.x) - smoothstep(x1 + .035 - fw.x, x1 + .035 + fw.x, f.x), 0., 1.);
      float ay = clamp(smoothstep(y0 - .03 - fw.y, y0 - .03 + fw.y, f.y) - smoothstep(y1 + .03 - fw.y, y1 + .03 + fw.y, f.y), 0., 1.);
      wall = mix(wall, vec3(.82, .8, .76), max(ax * ay * inGrid - win, 0.) * near * .85);
    } else if (s < 2.5) { // швы между панелями
      float jx = 1. - smoothstep(fw.x, 2. * fw.x, min(f.x, 1. - f.x));
      float jy = 1. - smoothstep(fw.y, 2. * fw.y, min(f.y, 1. - f.y));
      wall *= 1. - .14 * max(jx * inCol, jy) * near;
    } else if (s < 3.5) { // межэтажные пояса у стеклянных фасадов
      wall *= .8;
    } else if (s < 4.5) { // профлист
      wall *= 1. - .07 * step(.5, fract(u * 1.4)) * near;
    }
    wall *= .68 + .32 * smoothstep(0., 7., v); // затенение у земли
    float hw = fHash(vec3(id, seed * 131.));
    diffuseColor.rgb = mix(wall, vec3(.03, .035, .045), w);
    float fres = pow(1. - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0., 1.), 2.);
    vec3 refl = mix(vec3(.05, .06, .08), uSky * .6, .25 + .6 * fres) * (.8 + .4 * mix(hw, .5, far));
    facadeEmit += w * refl * (1. - uNight); // днём в стёклах отражается небо
    float on = step(hw, uLit + shop * step(id.y, .5) * .45);
    vec3 warm = mix(vec3(1., .72, .4), vec3(.72, .84, 1.), step(.84, fHash(vec3(id.yx, seed * 7.))));
    facadeEmit += mix(win * on * warm * 1.5, frac * (uLit + shop * .1) * vec3(1., .8, .55) * 1.1, far) * uNight; // свет в окнах
  } else if (st > -1.5) { // плоская крыша: пятна и зерно
    vec2 p = vWall.xy;
    float fine = mix(.5, fNoise(p * .45), 1. - smoothstep(.3, .8, length(fwidth(p * .45))));
    diffuseColor.rgb *= .82 + .32 * (fNoise(p * .07) * .55 + fine * .45);
  } else if (st > -2.5) { // скатная крыша: ряды черепицы
    float rows = vWall.y / .3, fr = fwidth(rows);
    float ln = (1. - smoothstep(0., .18 + fr, fract(rows))) * (1. - smoothstep(.25, .5, fr));
    diffuseColor.rgb *= (1. - .2 * ln) * (.9 + .2 * fNoise(vWall.xz * .3));
  } else if (st > -3.5) { // короба на крыше
    diffuseColor.rgb *= .95;
  } else { // внутренняя сторона парапета
    diffuseColor.rgb *= .72;
  }
}
`;
export function facadeMaterial(uniforms) {
  const mat = new THREE.MeshLambertMaterial({vertexColors: true});
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aWall;\nattribute vec3 aMat;\nvarying vec4 vWall;\nvarying vec3 vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWall = aWall; vMat = aMat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + MAIN)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += facadeEmit;');
  };
  mat.customProgramCacheKey = () => 'facade-1';
  return mat;
}
