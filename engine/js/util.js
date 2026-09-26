// Геометрические помощники. Все размеры в метрах, UV тоже в метрах —
// так текстуры (литьё, карбон, шлифовка) ложатся одинаково на любые детали.
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- матрицы

// Матрица из позиции, углов Эйлера (рад) и масштаба.
export function mat(p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], order = 'XYZ') {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], order));
  return m.compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(s[0], s[1], s[2]));
}

// Матрица, переводящая локальную ось Y в направление dir, с началом в точке p.
export function alignY(p, dir, spin = 0) {
  const d = dir.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
  return new THREE.Matrix4().compose(p.clone(), q, new THREE.Vector3(1, 1, 1));
}

export function put(g, m) { return g.clone().applyMatrix4(m); }

// ---------------------------------------------------------------- слияние

// Сливает список геометрий (индексированных и нет) в одну индексированную.
export function merge(list) {
  list = list.filter(Boolean);
  let nv = 0, ni = 0, hasColor = false;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
    if (g.attributes.color) hasColor = true;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const col = hasColor ? new Float32Array(nv * 3).fill(1) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv, c = g.attributes.color;
    const cnt = p.count;
    copyAttr(p, pos, vo, 3);
    copyAttr(n, nor, vo, 3);
    if (t) copyAttr(t, uv, vo, 2);
    if (c && col) copyAttr(c, col, vo, 3);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
    else { for (let i = 0; i < cnt; i++) idx[io + i] = vo + i; io += cnt; }
    vo += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

function copyAttr(attr, dst, vo, size) {
  if (!attr.isInterleavedBufferAttribute && attr.itemSize === size) {
    dst.set(attr.array.subarray(0, attr.count * size), vo * size);
    return;
  }
  for (let i = 0; i < attr.count; i++) for (let k = 0; k < size; k++) {
    dst[(vo + i) * size + k] = k < attr.itemSize ? attr.getComponent(i, k) : 1;
  }
}

// Постоянный цвет вершин (для материалов с vertexColors).
export function paint(g, c) {
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Масштабирует нормированные UV встроенных геометрий в метры.
export function uvScale(g, su, sv = su) {
  const t = g.attributes.uv;
  if (!t) return g;
  for (let i = 0; i < t.count; i++) t.setXY(i, t.getX(i) * su, t.getY(i) * sv);
  return g;
}

// ---------------------------------------------------------------- тела вращения

// Профиль [[r, y, острый?], ...] обходится так, чтобы материал был слева
// (снаружи — вверх, сверху — к оси). Острые точки дают излом нормали.
export function lathe(pts, seg = 48, phiStart = 0, phiLength = Math.PI * 2) {
  const runs = [];
  let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i]);
    if (pts[i][2] && i < pts.length - 1) { runs.push(cur); cur = [pts[i]]; }
  }
  runs.push(cur);
  const rRef = Math.max(0.004, ...pts.map(p => p[0]));
  const pos = [], nor = [], uv = [], idx = [];
  let vAcc = 0;
  for (const run of runs) {
    const n = run.length, base = pos.length / 3;
    const nr = [], ny = [], vv = [];
    for (let j = 0; j < n; j++) {
      let tx = 0, ty = 0;
      if (j > 0) { const dx = run[j][0] - run[j - 1][0], dy = run[j][1] - run[j - 1][1], l = Math.hypot(dx, dy) || 1; tx += dx / l; ty += dy / l; }
      if (j < n - 1) { const dx = run[j + 1][0] - run[j][0], dy = run[j + 1][1] - run[j][1], l = Math.hypot(dx, dy) || 1; tx += dx / l; ty += dy / l; }
      const l = Math.hypot(tx, ty) || 1;
      nr.push(ty / l); ny.push(-tx / l);
      if (j > 0) vAcc += Math.hypot(run[j][0] - run[j - 1][0], run[j][1] - run[j - 1][1]);
      vv.push(vAcc);
    }
    for (let i = 0; i <= seg; i++) {
      const phi = phiStart + phiLength * i / seg, c = Math.cos(phi), s = Math.sin(phi);
      for (let j = 0; j < n; j++) {
        const r = run[j][0];
        pos.push(r * s, run[j][1], r * c);
        nor.push(nr[j] * s, ny[j], nr[j] * c);
        uv.push(phi * rRef, vv[j]);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < n - 1; j++) {
      const a = base + i * n + j, b = a + n, c = b + 1, d = a + 1;
      idx.push(a, b, d, c, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Цилиндр вдоль Y (сплошной, с фасками), низ в y0.
export function cyl(r, h, seg = 32, y0 = 0, ch = 0) {
  if (ch > 0) return lathe([[0, y0], [r - ch, y0, 1], [r, y0 + ch, 1], [r, y0 + h - ch, 1], [r - ch, y0 + h, 1], [0, y0 + h]], seg);
  return lathe([[0, y0], [r, y0, 1], [r, y0 + h, 1], [0, y0 + h]], seg);
}

// Труба (кольцо) вдоль Y.
export function ring(rIn, rOut, h, seg = 40, y0 = 0) {
  return lathe([[rIn, y0 + h], [rIn, y0, 1], [rOut, y0, 1], [rOut, y0 + h, 1], [rIn, y0 + h]], seg);
}

// ---------------------------------------------------------------- трубы по кривой

// Труба по кривой с переменным радиусом; UV: u — длина, v — окружность.
export function tube(curve, segs, radius, radial = 16, opt = {}) {
  const closed = !!opt.closed;
  const frames = curve.computeFrenetFrames(segs, closed);
  const len = curve.getLength();
  const rf = typeof radius === 'function' ? radius : () => radius;
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const P = new THREE.Vector3(), nv = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(closed && i === segs ? 0 : t, P);
    const N = frames.normals[closed && i === segs ? 0 : i], B = frames.binormals[closed && i === segs ? 0 : i];
    const r = rf(t);
    const c = opt.color ? opt.color(t) : null;
    for (let j = 0; j <= radial; j++) {
      const v = j / radial * Math.PI * 2, sn = Math.sin(v), cs = -Math.cos(v);
      nv.set(cs * N.x + sn * B.x, cs * N.y + sn * B.y, cs * N.z + sn * B.z).normalize();
      pos.push(P.x + r * nv.x, P.y + r * nv.y, P.z + r * nv.z);
      nor.push(nv.x, nv.y, nv.z);
      uv.push(t * len, j / radial * Math.PI * 2 * r);
      if (c) col.push(c[0], c[1], c[2]);
    }
  }
  for (let j = 1; j <= segs; j++) for (let i = 1; i <= radial; i++) {
    const a = (radial + 1) * (j - 1) + (i - 1), b = (radial + 1) * j + (i - 1), c = (radial + 1) * j + i, d = (radial + 1) * (j - 1) + i;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// Винтовая линия вдоль Y (для пружин).
export class Helix extends THREE.Curve {
  constructor(r, h, turns, flat = 0.6) { super(); this.r = r; this.h = h; this.turns = turns; this.flat = flat; }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    // крайние витки поджаты: шаг у концов меньше
    const e = this.flat / this.turns;
    let y;
    if (t < e) y = t / e * 0.5 * (this.h * 0.06);
    else if (t > 1 - e) y = this.h - (1 - t) / e * 0.5 * (this.h * 0.06);
    else y = this.h * 0.03 + (t - e) / (1 - 2 * e) * this.h * 0.94;
    return target.set(Math.cos(a) * this.r, y, Math.sin(a) * this.r);
  }
}

// ---------------------------------------------------------------- 2D-контуры

export function roundRect(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

export function circlePath(cx, cy, r, cw = true) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, cw);
  return p;
}

export function polyShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

// Выдавливание вдоль +Z с фаской. depth — полная толщина вместе с фаской.
export function extrude(shape, depth, bevel = 0, seg = 1, curveSegments = 24) {
  const b = Math.min(bevel, depth / 2 - 1e-5);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-5, depth - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b,
    bevelOffset: -b, bevelSegments: seg, curveSegments,
  });
  if (b > 0) g.translate(0, 0, b);
  return g;
}

// Выдавливание, повернутое так, что толщина идёт вдоль +Y (контур в плоскости XZ: shape.x → x, shape.y → −z).
export function extrudeY(shape, depth, bevel = 0, seg = 1, cs = 24) {
  return extrude(shape, depth, bevel, seg, cs).rotateX(-Math.PI / 2);
}

// Выдавливание вдоль +X: контур в плоскости «вид спереди» (shape.x = −z, shape.y = y).
export function extrudeX(shape, depth, bevel = 0, seg = 1, cs = 24) {
  return extrude(shape, depth, bevel, seg, cs).rotateY(Math.PI / 2);
}

// ---------------------------------------------------------------- крепёж

const _hexCache = new Map();
// Болт с шестигранной головкой и буртиком; ось +Y, опорная плоскость в y=0.
export function hexBolt(af = 0.010, h = 0.006, flange = true, shank = 0) {
  const key = `${af}|${h}|${flange}|${shank}`;
  if (_hexCache.has(key)) return _hexCache.get(key);
  const R = af / Math.sqrt(3);
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + Math.PI / 6;
    if (i === 0) s.moveTo(Math.cos(a) * R, Math.sin(a) * R); else s.lineTo(Math.cos(a) * R, Math.sin(a) * R);
  }
  s.closePath();
  const fl = flange ? 0.0016 : 0;
  const head = extrude(s, h - fl, Math.min(0.0007, af * 0.06), 1, 6).rotateX(-Math.PI / 2).translate(0, fl, 0);
  const parts = [head];
  if (flange) parts.push(cyl(af * 0.72, fl, 16));
  if (shank > 0) parts.push(cyl(af * 0.32, shank, 8, -shank));
  const g = merge(parts);
  _hexCache.set(key, g);
  return g;
}

// Гайка на шпильке (кончик шпильки торчит над гайкой).
export function studNut(af = 0.012, h = 0.008) {
  return merge([hexBolt(af, h, true), cyl(af * 0.3, h + 0.004, 12, 0)]);
}

// Зубчатый венец (звёздочка/шестерня) — контур с зубьями.
export function gearShape(rRoot, rTip, teeth, holeR = 0, tip = 0.3, root = 0.34) {
  const s = new THREE.Shape();
  const p = Math.PI * 2 / teeth, fl = (1 - tip - root) / 2;
  let first = true;
  const pt = (a, r) => {
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (first) { s.moveTo(x, y); first = false; } else s.lineTo(x, y);
  };
  for (let k = 0; k < teeth; k++) {
    const a = k * p;
    pt(a, rRoot);
    pt(a + root * p, rRoot);
    pt(a + (root + fl) * p, rTip);
    pt(a + (root + fl + tip) * p, rTip);
  }
  s.closePath();
  if (holeR > 0) s.holes.push(circlePath(0, 0, holeR, true));
  return s;
}

// ---------------------------------------------------------------- ремни и цепи

// Путь ремня вокруг шкивов. circles: [{x, y, r, s}] в порядке движения;
// s = +1 — ремень огибает шкив против часовой, −1 — по часовой.
// Возвращает плотную замкнутую ломаную с длиной и функцией выборки.
export function beltPath(circles, step = 0.002) {
  const n = circles.length;
  const tang = [];
  for (let i = 0; i < n; i++) {
    const A = circles[i], B = circles[(i + 1) % n];
    const ra = A.s * A.r, rb = B.s * B.r;
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L, px = -uy, py = ux;
    const al = -(rb - ra) / L, h = -Math.sqrt(Math.max(0, 1 - al * al));
    const nx = al * ux + h * px, ny = al * uy + h * py;
    tang.push({ p0: [A.x + ra * nx, A.y + ra * ny], p1: [B.x + rb * nx, B.y + rb * ny] });
  }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const C = circles[i];
    const pin = tang[(i - 1 + n) % n].p1, pout = tang[i].p0;
    if (C.r > 1e-6) {
      const a0 = Math.atan2(pin[1] - C.y, pin[0] - C.x), a1 = Math.atan2(pout[1] - C.y, pout[0] - C.x);
      let d = a1 - a0;
      if (C.s > 0) { while (d < 0) d += Math.PI * 2; } else { while (d > 0) d -= Math.PI * 2; }
      const k = Math.max(1, Math.ceil(Math.abs(d) * C.r / step));
      for (let j = 0; j < k; j++) { const a = a0 + d * j / k; pts.push([C.x + Math.cos(a) * C.r, C.y + Math.sin(a) * C.r]); }
    } else pts.push([C.x, C.y]);
    const q0 = pout, q1 = tang[i].p1;
    const k = Math.max(1, Math.ceil(Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) / step));
    for (let j = 0; j < k; j++) pts.push([q0[0] + (q1[0] - q0[0]) * j / k, q0[1] + (q1[1] - q0[1]) * j / k]);
  }
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[pts.length];
  function sample(d) {
    d = ((d % length) + length) % length;
    let lo = 0, hi = pts.length;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const a = pts[lo], b = pts[(lo + 1) % pts.length];
    const seg = cum[lo + 1] - cum[lo] || 1, t = (d - cum[lo]) / seg;
    const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx, ty };
  }
  return { pts, length, sample, tang };
}

// Лента вдоль замкнутой ломаной в плоскости «вид спереди» (x2 = −z, y2 = y).
// profile — точки сечения [w, t]: w — вдоль оси X двигателя, t — наружу от петли.
export function ribbon(path, x0, profile, outwardSign = 1) {
  const P = path.pts, n = P.length, m = profile.length;
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i % n], c = P[(i + 1) % n];
    let tx = c[0] - a[0], ty = c[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    // наружу — вправо от направления для обхода по часовой (x2,y2)
    const ox = ty * outwardSign, oy = -tx * outwardSign;
    if (i > 0) acc += Math.hypot(b[0] - P[(i - 1 + n) % n][0], b[1] - P[(i - 1 + n) % n][1]);
    for (let j = 0; j < m; j++) {
      const [w, t] = profile[j];
      const x2 = b[0] + ox * t, y2 = b[1] + oy * t;
      pos.push(x0 + w, y2, -x2);
      uv.push(acc, j * 0.004);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const j2 = (j + 1) % m;
    const a = i * m + j, b = (i + 1) * m + j, c = (i + 1) * m + j2, d = i * m + j2;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- прочее

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Кубическая кривая Безье в 3D из четырёх точек.
export const bez = (a, b, c, d) => new THREE.CubicBezierCurve3(a, b, c, d);
export const crv = (pts, tension = 0.5) => new THREE.CatmullRomCurve3(pts, false, 'catmullrom', tension);
