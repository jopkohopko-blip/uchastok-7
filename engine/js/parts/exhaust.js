// Выпускные коллекторы 4-в-1 из титана: фланец, первичные трубы со сварными швами,
// сборник, лямбда-зонд, шпильки. Правый ряд строится в мировых координатах, левый — зеркалом.
import * as THREE from 'three';
import { E, bankFrame, outer, bp, cylNo } from '../spec.js';
import { mesh } from '../model.js';
import { merge, put, mat, alignY, lathe, cyl, tube, crv, extrude, roundRect, circlePath, hexBolt, studNut, paint, v3, smooth } from '../util.js';
import { exhaustPort, PORT } from './head.js';

const R = 0.022;                        // радиус первичной трубы
const COL = { x: -0.33, y: 0.108, z: 0.29 };
const LANES = [[-1, 1], [-1, -1], [1, 1], [1, -1]]; // (y, z) смещения в пучке для цилиндров спереди назад
const FL = 0.008;                       // толщина фланца

function side(s) { const g = new THREE.Group(); if (s < 0) g.scale.z = -1; return g; }

// Цвета побежалости у фланца: соломенный → бронзовый → синеватый → металл.
function heat(d) {
  const stops = [[0, [1.0, 0.86, 0.6]], [0.035, [0.95, 0.72, 0.45]], [0.07, [0.62, 0.62, 0.95]], [0.11, [0.85, 0.88, 1.0]], [0.17, [1, 1, 1]]];
  if (d >= stops[stops.length - 1][0]) return [1, 1, 1];
  for (let i = 1; i < stops.length; i++) if (d < stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (d - a) / (b - a);
    return ca.map((c, k) => c + (cb[k] - c) * t);
  }
  return [1, 1, 1];
}

function primaryCurve(x, i) {
  const port = exhaustPort(1, x);
  const p0 = port.p.clone().addScaledVector(port.n, FL);
  const [ly, lz] = LANES[i];
  const y = COL.y + ly * 0.0235, z = COL.z + lz * 0.0235;
  return crv([
    p0,
    p0.clone().addScaledVector(port.n, 0.04),
    v3(x - 0.028, y + 0.03, z - 0.004),
    v3(x - 0.09, y, z),
    v3(Math.min(x - 0.16, -0.24), y, z),
    v3(COL.x, COL.y + ly * 0.0215, COL.z + lz * 0.0215),
  ], 0.5);
}

export function buildExhaust(model) {
  for (const s of [1, -1]) buildSide(model, s);
}

function buildSide(model, s) {
  const M = model.M, A = model.asm(s > 0 ? 'exhR' : 'exhL');
  const xs = E.cyl[s];
  const outV = new THREE.Vector3(0, -0.12, s);

  // ---- фланец (в системе ряда: z = наружу)
  {
    const f = bankFrame(s);
    const sh = roundRect(xs[0] - xs[3] + 0.09, 0.068, 0.016, (xs[0] + xs[3]) / 2, PORT.exV);
    for (const x of xs) sh.holes.push(roundRectPath(0.04, 0.03, 0.011, x, PORT.exV));
    for (const x of xs) for (const dv of [-0.026, 0.026]) sh.holes.push(circlePath(x, PORT.exV + dv, 0.0045));
    f.add(mesh(extrude(sh, FL, 0.0012, 1, 24).translate(0, 0, PORT.face), M.steel));
    A.add('exh.flange', f, outV.clone().multiplyScalar(0.1), { delay: 0.35 });
  }

  // ---- шпильки и гайки
  {
    const f = bankFrame(s);
    const g = [];
    for (const x of xs) for (const dv of [-0.026, 0.026]) g.push(put(studNut(0.012, 0.007), mat([x, PORT.exV + dv, PORT.face + FL], [Math.PI / 2, 0, 0])));
    f.add(mesh(merge(g), M.copper));
    A.add('exh.studs', f, outV.clone().multiplyScalar(0.035), { delay: 0.6 });
  }

  // путь выхлопа: цилиндр → канал → первичная труба → сборник
  xs.forEach((x, i) => {
    const c = primaryCurve(x, i), P = [bp(1, x, 0, 0.2), bp(1, x, 0.02, 0.232), bp(1, x, 0.06, 0.272)];
    for (let k = 0; k <= 16; k++) P.push(c.getPoint(k / 16));
    P.push(v3(COL.x - 0.1, COL.y, COL.z), v3(COL.x - 0.22, COL.y, COL.z));
    model.flow('exh', P.map(p => { p.z *= s; return p; }), { no: cylNo(s, i) });
  });

  // ---- первичные трубы со сварными швами
  {
    const g = side(s);
    const pipes = [], welds = [];
    xs.forEach((x, i) => {
      const c = primaryCurve(x, i), len = c.getLength();
      pipes.push(tube(c, Math.ceil(len / 0.008), R, 24, { color: t => heat(t * len) }));
      for (let d = 0.07; d < len - 0.03; d += 0.085) {
        const t = d / len, p = c.getPointAt(t), tg = c.getTangentAt(t);
        welds.push(paint(put(new THREE.TorusGeometry(R + 0.0002, 0.0011, 5, 28), alignY(p, tg).multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0]))), heat(d)));
      }
      // корень трубы у фланца — сварной шов
      const p0 = c.getPointAt(0), t0 = c.getTangentAt(0);
      welds.push(paint(put(new THREE.TorusGeometry(R + 0.0004, 0.0016, 8, 36), alignY(p0.clone().addScaledVector(t0, 0.001), t0).multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0]))), heat(0)));
    });
    g.add(mesh(merge(pipes), M.titanium), mesh(merge(welds), M.titanium));
    A.add('exh.primaries', g, outV.clone().multiplyScalar(0.2), { delay: 0.15 });
  }

  // ---- сборник 4-в-1 с хомутом
  const colPos = v3(COL.x, COL.y, COL.z);
  {
    const g = side(s);
    const ax = [0, 0, Math.PI / 2];       // lathe Y → −X
    const cone = lathe([[0.0565, 0], [0.0565, 0.012, 1], [0.050, 0.05], [0.041, 0.1], [0.039, 0.115, 1], [0.039, 0.17, 1], [0.035, 0.17], [0.035, 0], [0.0565, 0]], 48);
    const vband = merge([
      lathe([[0.039, 0], [0.046, 0.002, 1], [0.046, 0.01, 1], [0.039, 0.012, 1]], 40).translate(0, 0.158, 0),
      lathe([[0.041, 0], [0.0485, 0.003, 1], [0.0485, 0.014, 1], [0.041, 0.016, 1]], 40).translate(0, 0.156, 0),
    ]);
    g.add(mesh(paint(put(cone, mat([colPos.x, colPos.y, colPos.z], ax)), [1, 1, 1]), M.titanium));
    g.add(mesh(put(vband, mat([colPos.x, colPos.y, colPos.z], ax)), M.steel));
    g.add(mesh(put(hexBolt(0.008, 0.012, false), mat([colPos.x - 0.165, colPos.y + 0.05, colPos.z])), M.zinc));
    A.add('exh.collector', g, outV.clone().multiplyScalar(0.2).add(v3(-0.13, 0, 0)), { delay: 0.05 });
  }

  // ---- лямбда-зонд на конусе сборника
  {
    const g = side(s);
    const base = v3(colPos.x - 0.07, colPos.y + 0.043, colPos.z + 0.012);
    const dir = v3(0.15, 1, 0.35).normalize();
    const m = alignY(base, dir);
    const steel = [put(cyl(0.011, 0.01, 24, -0.006), m), put(hexBolt(0.022, 0.012, false), m.clone().multiply(mat([0, 0.004, 0]))), put(cyl(0.0085, 0.03, 24, 0.016), m)];
    const wire = put(tube(crv([v3(0, 0.044, 0), v3(0, 0.07, 0), v3(0.03, 0.1, 0.02), v3(0.07, 0.11, 0.02)]), 40, 0.0028, 10), m);
    const boot = put(cyl(0.006, 0.014, 18, 0.042), m);
    g.add(mesh(merge(steel), M.steel), mesh(merge([wire, boot]), M.plastic));
    A.add('exh.lambda', g, outV.clone().multiplyScalar(0.2).add(v3(-0.13, 0.12, 0)), { delay: 0 });
  }
}

function roundRectPath(w, h, r, cx, cy) {
  const s = roundRect(w, h, r, cx, cy);
  const p = new THREE.Path(s.getPoints(12));
  return p;
}
