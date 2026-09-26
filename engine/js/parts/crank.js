// Кривошипно-шатунный механизм: коленвал, шатуны, поршни, кольца, пальцы, балансирный вал.
import * as THREE from 'three';
import { E, axis, outer, slider } from '../spec.js';
import { mesh } from '../model.js';
import { merge, put, mat, lathe, cyl, extrudeX, circlePath, polyShape, beltPath, hexBolt, DEG } from '../util.js';

export function buildCrank(model) {
  const M = model.M, A = model.asm('crank');

  // ---------------- коленчатый вал
  const shaft = new THREE.Group();
  const pol = [], forg = [];
  const along = (g, x0) => put(g, mat([x0, 0, 0], [0, 0, -Math.PI / 2])); // lathe Y → +X, начало в x0
  // коренные шейки
  for (const xm of E.mains) pol.push(along(cyl(0.030, 0.024, 40, 0, 0.001), xm - 0.012));
  // шатунные шейки (разнесены на ±15°) и щёки с противовесами
  E.throws.forEach((xt, i) => {
    for (const s of [1, -1]) {
      const psi = E.throwAng[i] - s * E.split;
      const y = E.R * Math.cos(psi), z = E.R * Math.sin(psi);
      const x0 = s > 0 ? xt : xt - 0.022;
      pol.push(put(cyl(0.025, 0.022, 36, 0, 0.0008), mat([x0, y, z], [0, 0, -Math.PI / 2])));
    }
    const mFront = E.mains[i], mRear = E.mains[i + 1];
    forg.push(cheek(E.throwAng[i] - E.split, xt + 0.022, mFront - 0.012));
    forg.push(cheek(E.throwAng[i] + E.split, mRear + 0.012, xt - 0.022));
  });
  // носок и задний фланец
  forg.push(along(lathe([[0, 0], [0.027, 0, 1], [0.027, 0.028, 1], [0.022, 0.03, 1], [0.022, 0.07, 1], [0.020, 0.072, 1], [0.020, 0.112, 1], [0.017, 0.115, 1], [0, 0.115]], 36), 0.224));
  forg.push(along(lathe([[0, 0], [0.043, 0, 1], [0.043, 0.011, 1], [0.036, 0.012, 1], [0.036, 0.038, 1], [0, 0.038]], 44), -0.262));
  shaft.add(mesh(merge(pol), M.steelPolished));
  shaft.add(mesh(merge(forg), M.steel));
  const crankMotion = new THREE.Group();
  crankMotion.add(shaft);
  A.add('crank.shaft', crankMotion, [0, -0.1, 0], { delay: 0.5 });

  // ---------------- шатуны, поршни, кольца, пальцы
  const rodG = rodGeometry();
  const rodBolts = merge([-0.029, 0.029].map(z => put(hexBolt(0.009, 0.006, false, 0.03), mat([0, -0.0272, z], [Math.PI, 0, 0]))));
  const pistonParts = pistonGeometry();
  const ringG = merge([
    lathe(ringProfile(0.0239, 0.0010), 64), lathe(ringProfile(0.0196, 0.0012), 64), lathe(ringProfile(0.0135, 0.0020), 64),
  ]);
  const pinG = merge([
    put(cyl(0.011, 0.058, 28, -0.029, 0.0006), mat([0, 0, 0], [0, 0, -Math.PI / 2])),
    ...[-0.0305, 0.0305].map(x => put(new THREE.TorusGeometry(0.0085, 0.0009, 6, 24), mat([x, 0, 0], [0, Math.PI / 2, 0]))),
  ]);
  const movers = [];
  for (const s of [1, -1]) E.cyl[s].forEach((xc, i) => {
    const a = axis(s), o = outer(s);
    const frame = () => { const f = new THREE.Group(); f.rotation.x = s * E.half; return f; };

    // шатун
    const rf = frame(), rm = new THREE.Group();
    rm.add(mesh(rodG, M.steel), mesh(rodBolts, M.steelDark));
    rm.children.forEach(c => { c.position.x = xc; });
    rf.add(rm);
    A.add('crank.rods', rf, a.clone().multiplyScalar(0.08), { delay: 0.3 });

    // поршень
    const pf = frame(), pm = new THREE.Group();
    const pist = mesh(pistonParts.body, M.piston), skirt = mesh(pistonParts.skirt, M.pistonCoat);
    pist.position.x = skirt.position.x = xc;
    pm.add(pist, skirt);
    pf.add(pm);
    A.add('crank.pistons', pf, a.clone().multiplyScalar(0.21), { delay: 0.1 });

    // кольца
    const kf = frame(), km = new THREE.Group();
    const rg = mesh(ringG, M.steelDark); rg.position.x = xc; km.add(rg); kf.add(km);
    A.add('crank.rings', kf, a.clone().multiplyScalar(0.33), { delay: 0 });

    // палец
    const nf = frame(), nm = new THREE.Group();
    const pn = mesh(pinG, M.steelPolished); pn.position.x = xc; nm.add(pn); nf.add(nm);
    A.add('crank.pins', nf, a.clone().multiplyScalar(0.21).addScaledVector(o, 0.1), { delay: 0.05 });

    movers.push({ s, i, rm, pm, km, nm });
  });

  // ---------------- балансирный вал в развале
  const bal = new THREE.Group();
  const balSteel = [], balW = [];
  balSteel.push(along(cyl(0.011, 0.47, 24, 0, 0.001), -0.212));
  for (const x of [-0.19, 0.0, 0.2]) balSteel.push(along(cyl(0.016, 0.018, 28, 0, 0.001), x - 0.009));
  for (const x of [-0.165, 0.175]) {
    balW.push(put(extrudeX(weightShape(), 0.05, 0.002), mat([x - 0.025, 0, 0])));
    balW.push(along(cyl(0.016, 0.05, 28, 0, 0.001), x - 0.025));
  }
  balW.push(put(extrudeX(gearOf(0.028, 0.031, 30), 0.012, 0.0008), mat([0.244, 0, 0])));
  bal.add(mesh(merge(balSteel), M.steelPolished));
  bal.add(mesh(merge(balW), M.steel));
  const balPos = new THREE.Group(); balPos.position.set(0, 0.168, 0); balPos.add(bal);
  A.add('crank.balancer', balPos, [0, 0.16, 0], { delay: 0.4 });

  // ---------------- кинематика
  const tmpQ = new THREE.Quaternion();
  model.mover(theta => {
    crankMotion.rotation.x = theta;
    bal.rotation.x = -theta;
    for (const m of movers) {
      const k = slider(m.s, m.i, theta);
      m.pm.position.y = m.km.position.y = m.nm.position.y = k.pin;
      m.rm.position.set(0, k.cy, k.cz);
      m.rm.rotation.x = Math.atan2(-k.cz, k.pin - k.cy);
    }
  });
}

// Щека с противовесом: полярный контур вокруг оси коленвала.
function cheek(pinAng, x0, x1) {
  const pts = [];
  const N = 120, Rp = 0.031, Rm = 0.037, Rc = 0.067;
  for (let k = 0; k < N; k++) {
    const al = k / N * Math.PI * 2;            // от направления на шейку
    let r = Rm;
    const sa = E.R * Math.sin(al);
    if (Math.abs(sa) < Rp && Math.cos(al) > -0.2) r = Math.max(r, E.R * Math.cos(al) + Math.sqrt(Rp * Rp - sa * sa));
    const d = Math.abs(((al - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const cw = d < 62 * DEG ? Rc : d < 82 * DEG ? Rm + (Rc - Rm) * (0.5 + 0.5 * Math.cos((d - 62 * DEG) / (20 * DEG) * Math.PI)) : 0;
    r = Math.max(r, cw);
    const a = al + pinAng;
    const y = r * Math.cos(a), z = r * Math.sin(a);
    pts.push([-z, y]);
  }
  const g = extrudeX(polyShape(pts), Math.abs(x1 - x0), 0.0018);
  return g.translate(Math.min(x0, x1), 0, 0);
}

// Шатун: большая головка в начале координат, малая — на +Y (150 мм).
function rodGeometry() {
  const L = E.rodL;
  const path = beltPath([{ x: 0, y: 0, r: 0.040, s: 1 }, { x: 0, y: L, r: 0.0155, s: 1 }], 0.002);
  const pocket = polyShape(POCKET);
  const rim = polyShape(path.pts.map(([x, y]) => [x, y]));
  rim.holes.push(circlePath(0, 0, 0.0255), circlePath(0, L, 0.0112), pocketPath());
  const g1 = extrudeX(rim, 0.020, 0.0012).translate(-0.010, 0, 0);
  const g2 = extrudeX(pocket, 0.008, 0.0005).translate(-0.004, 0, 0);
  // вкладыш и втулка
  const brg = put(lathe([[0.0250, 0.019], [0.0250, 0, 1], [0.0255, 0, 1], [0.0255, 0.019, 1], [0.0250, 0.019]], 36), mat([-0.0095, 0, 0], [0, 0, -Math.PI / 2]));
  return merge([g1, g2, brg]);
}
const POCKET = [[-0.0255, 0.058], [0.0255, 0.058], [0.0139, 0.128], [-0.0139, 0.128]];
function pocketPath() {
  const p = new THREE.Path();
  p.moveTo(POCKET[0][0], POCKET[0][1]);
  for (let i = 1; i < POCKET.length; i++) p.lineTo(POCKET[i][0], POCKET[i][1]);
  p.closePath();
  return p;
}

// Поршень: палец в начале координат, днище на +31 мм.
function pistonGeometry() {
  const R = 0.0459, top = E.compH;
  const body = merge([
    lathe([
      [0.0385, 0.004], [R - 0.0004, 0.004, 1], [R, 0.0046, 1],
      [R, 0.0112, 1], [R - 0.003, 0.0112, 1], [R - 0.003, 0.0138, 1], [R, 0.0138, 1],
      [R, 0.0185, 1], [R - 0.003, 0.0185, 1], [R - 0.003, 0.0197, 1], [R, 0.0197, 1],
      [R, 0.0229, 1], [R - 0.003, 0.0229, 1], [R - 0.003, 0.0240, 1], [R, 0.0240, 1],
      [R, top - 0.0012, 1], [R - 0.0012, top, 1], [0.03, top + 0.0008], [0, top + 0.0012],
    ], 64),
    lathe([[0, 0.019], [0.0385, 0.019, 1], [0.0385, 0.004, 1]], 48),
    put(cyl(0.0155, 0.062, 28, -0.031), mat([0, 0, 0], [0, 0, Math.PI / 2])),
  ]);
  const sk = (start) => new THREE.CylinderGeometry(R - 0.0002, R - 0.0002, 0.036, 20, 1, true, start, 100 * DEG).translate(0, -0.014, 0);
  const skirt = merge([sk(-50 * DEG), sk(130 * DEG)]);
  return { body, skirt };
}

function ringProfile(yTop, h) {
  const a = 0.0428, b = 0.04585;
  return [[a, yTop], [a, yTop - h, 1], [b, yTop - h, 1], [b, yTop, 1], [a, yTop]];
}

// Груз-сектор: вершина на оси вала, дуга R 34 мм, 120°.
function weightShape() {
  const w = new THREE.Shape();
  w.moveTo(0, 0);
  w.absarc(0, 0, 0.034, 30 * DEG, 150 * DEG, false);
  w.closePath();
  return w;
}

function gearOf(r0, r1, n) {
  const s = new THREE.Shape();
  for (let k = 0; k < n * 2; k++) {
    const a = k / (n * 2) * Math.PI * 2, r = k % 2 ? r1 : r0;
    if (k === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  s.holes.push(circlePath(0, 0, 0.011));
  return s;
}
