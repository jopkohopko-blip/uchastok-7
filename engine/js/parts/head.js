// Головки блока: литой корпус с камерами сгорания, 16 клапанов, пружины, толкатели,
// два распредвала с кулачками в фазах, крышки опор, болты, свечи, карбоновая крышка и катушки.
import * as THREE from 'three';
import { E, bankFrame, axis, outer, bp, valveDir, valveSeat, camCenter, VALVES, cylNo, FIRE, EXH, INT, cycle, lift, peak } from '../spec.js';
import { mesh } from '../model.js';
import { merge, put, mat, alignY, lathe, cyl, extrude, extrudeX, extrudeY, polyShape, circlePath, roundRect, hexBolt, tube, Helix, DEG } from '../util.js';
import { boltXs, roundBox } from './block.js';

const HT = E.headTop;            // верх головки (разъём крышек опор)
const B0 = E.deck + E.gasket;    // низ головки
const PLATE = 0.2412, DECK2 = 0.318;
const COVER0 = HT, COVER1 = 0.4068, POD1 = 0.4232;

export const PORT = { inV: 0.290, exV: 0.285, face: 0.1025 };
export function intakePort(s, x) { return { p: bp(s, x, -PORT.face, PORT.inV), n: outer(s).negate() }; }
export function exhaustPort(s, x) { return { p: bp(s, x, PORT.face, PORT.exV), n: outer(s) }; }

const rectXU = (x0, x1, hw) => polyShape([[x0, -hw], [x1, -hw], [x1, hw], [x0, hw]]);

// Центр отверстия толкателя на середине верхней плиты.
function tappetXU(xc, intake, k) {
  const V = intake ? VALVES.in : VALVES.ex;
  const vm = (DECK2 + 0.3367) / 2;
  const du = (vm - E.seatV) * Math.tan(E.valveTilt);
  return { x: xc + (k ? V.dx : -V.dx), u: intake ? V.u - du : V.u + du };
}

export function buildHeads(model) {
  const geo = sharedGeometry();
  for (const s of [1, -1]) buildHead(model, s, geo);
}

function sharedGeometry() {
  const valve = r => lathe([
    [0, 0], [r, 0, 1], [r, 0.0016, 1], [r * 0.78, 0.0042], [r * 0.45, 0.0085], [0.0048, 0.0145], [0.003, 0.021, 1],
    [0.003, 0.0935, 1], [0.0026, 0.0942], [0.0026, 0.0952], [0.003, 0.0958, 1], [0.003, 0.0993, 1], [0.0026, 0.1], [0, 0.1],
  ], 28);
  const spring = tube(new Helix(0.0118, 0.036, 6.2, 0.7), 150, 0.0019, 6);
  const retainer = lathe([[0.0034, 0.004], [0.0034, 0, 1], [0.0068, 0, 1], [0.0118, 0.0028, 1], [0.0118, 0.004, 1], [0.0034, 0.004]], 28);
  const bucket = lathe([[0.0145, -0.022], [0.0155, -0.022, 1], [0.0155, -0.0006, 1], [0.0149, 0], [0, 0.0002]], 32);
  const plugZ = merge([
    cyl(0.0011, 0.0016, 10, 0.2383),
    lathe([[0, 0.2399], [0.0048, 0.2399, 1], [0.0050, 0.2405, 1], [0.0050, 0.259, 1], [0, 0.259]], 20),
    put(hexBolt(0.016, 0.009, false), mat([0, 0.259, 0])),
    cyl(0.0028, 0.009, 12, 0.311),
  ]);
  const plugC = lathe([[0, 0.268], [0.0062, 0.268, 1], [0.0062, 0.276], [0.0056, 0.279], [0.0062, 0.283], [0.0056, 0.287], [0.0062, 0.291], [0.0056, 0.295], [0.0060, 0.303], [0.0048, 0.311], [0, 0.312]], 24);
  return { valveIn: valve(VALVES.in.r), valveEx: valve(VALVES.ex.r), spring, retainer, bucket, plugZ, plugC };
}

function buildHead(model, s, geo) {
  const M = model.M, A = model.asm(s > 0 ? 'headR' : 'headL');
  const xs = E.cyl[s], a = axis(s);
  const off = k => a.clone().multiplyScalar(k);
  const bx = boltXs(xs);

  // ---------------- прокладка ГБЦ
  {
    const f = bankFrame(s);
    const sh = rectXU(E.rear, E.front, 0.097);
    for (const x of xs) sh.holes.push(circlePath(x, 0, 0.0475));
    for (const x of bx) for (const u of [-0.085, 0.085]) sh.holes.push(circlePath(x, -u, 0.0066));
    for (const x of xs) for (const dx of [-0.034, 0.034]) for (const u of [-0.064, 0.064]) sh.holes.push(circlePath(x + dx, -u, 0.0045));
    f.add(mesh(extrudeY(sh, E.gasket, 0.0002, 1, 16).translate(0, E.deck, 0), M.gasket));
    A.add('head.gasket', f, off(0.035), { delay: 0.95 });
  }

  // ---------------- корпус головки
  {
    const f = bankFrame(s);
    const alu = [], dark = [], soot = [];
    const pl = rectXU(E.rear, E.front, 0.098);
    for (const x of xs) pl.holes.push(circlePath(x, 0, 0.045));
    for (const x of bx) for (const u of [-0.085, 0.085]) pl.holes.push(circlePath(x, -u, 0.0068));
    alu.push(extrudeY(pl, PLATE - B0, 0.0008, 1, 24).translate(0, B0, 0));
    for (const x of xs) soot.push(put(lathe(domeProfile(), 48), mat([x, 0, 0])));
    alu.push(extrudeX(polyShape([[0.098, PLATE], [-0.098, PLATE], [-0.098, DECK2], [0.098, DECK2]]), E.front - E.rear, 0.004, 2).translate(E.rear, 0, 0));
    const dk = rectXU(E.rear, E.front, 0.098);
    for (const x of xs) {
      for (const intake of [1, 0]) for (const k of [0, 1]) { const t = tappetXU(x, intake, k); dk.holes.push(circlePath(t.x, -t.u, 0.0172)); }
      dk.holes.push(circlePath(x, 0, 0.0125));
    }
    for (const x of bx) for (const u of [-0.085, 0.085]) dk.holes.push(circlePath(x, -u, 0.0072));
    alu.push(extrudeY(dk, HT - DECK2, 0.0012, 1, 20).translate(0, DECK2, 0));
    // приливы каналов: выпускные снаружи, впускные со стороны развала
    for (const x of xs) {
      alu.push(extrude(roundRect(0.056, 0.046, 0.012, x, PORT.exV), 0.0048, 0.0012).translate(0, 0, 0.0978));
      dark.push(extrude(roundRect(0.038, 0.028, 0.011, x, PORT.exV), 0.0006).translate(0, 0, PORT.face));
      alu.push(extrude(roundRect(0.062, 0.062, 0.031, x, PORT.inV), 0.0048, 0.0012).translate(0, 0, -PORT.face));
      dark.push(extrude(roundRect(0.048, 0.048, 0.024, x, PORT.inV), 0.0006).translate(0, 0, -PORT.face - 0.0006));
    }
    // литые рёбра между каналами
    for (let i = 0; i < 3; i++) {
      const x = (xs[i] + xs[i + 1]) / 2;
      alu.push(extrude(roundRect(0.008, 0.05, 0.003, x, 0.275), 0.006, 0.0015).translate(0, 0, 0.0975));
    }
    f.add(mesh(merge(alu), M.aluCast));
    f.add(mesh(merge(soot), M.soot));
    f.add(mesh(merge(dark), M.hole));
    A.add('head.casting', f, off(0.20), { delay: 0.8 });
  }

  // ---------------- клапаны, пружины, толкатели (инстансы, двигаются в фазах)
  const valveSets = [];
  const mkInst = (g, m, n) => { const im = new THREE.InstancedMesh(g, m, n); im.frustumCulled = false; return im; };
  for (const intake of [true, false]) {
    const f = bankFrame(s);
    const im = mkInst(intake ? geo.valveIn : geo.valveEx, intake ? M.steelPolished : M.valveEx, 8);
    f.add(im);
    A.add(intake ? 'head.valvesIn' : 'head.valvesEx', f, off(0.1).addScaledVector(outer(s), intake ? -0.02 : 0.02), { delay: 0.7 });
    valveSets.push({ intake, im });
  }
  const fs = bankFrame(s), springs = mkInst(geo.spring, M.steelDark, 16), rets = mkInst(geo.retainer, M.steel, 16);
  fs.add(springs, rets);
  A.add('head.springs', fs, off(0.31), { delay: 0.55 });
  const ft = bankFrame(s), buckets = mkInst(geo.bucket, M.steelPolished, 16);
  ft.add(buckets);
  A.add('head.tappets', ft, off(0.37), { delay: 0.5 });

  // список клапанов с положением седла
  const valves = [];
  xs.forEach((xc, i) => {
    const no = cylNo(s, i);
    for (const intake of [true, false]) for (const k of [0, 1]) valves.push({ no, intake, seat: valveSeat(xc, intake, k), dir: valveDir(intake) });
  });

  // ---------------- распределительные валы
  const cams = [];
  for (const intake of [true, false]) {
    const f = bankFrame(s);
    const c = camCenter(intake);
    const shaft = new THREE.Group();
    shaft.position.copy(c);
    const pol = [], core = [];
    const xEnd = E.chain[s] - 0.006;
    core.push(put(cyl(0.0112, xEnd - (E.rear + 0.01), 24, 0, 0.0008), mat([E.rear + 0.01, 0, 0], [0, 0, -Math.PI / 2])));
    for (const xj of bx) pol.push(put(cyl(0.013, 0.018, 32, 0, 0.0008), mat([xj - 0.009, 0, 0], [0, 0, -Math.PI / 2])));
    pol.push(put(cyl(0.0185, 0.008, 36, 0, 0.0008), mat([E.front - 0.014, 0, 0], [0, 0, -Math.PI / 2])));
    const w = intake ? INT : EXH, half = (w.close - w.open) / 4;
    const target = intake ? 180 - E.valveTilt / DEG : -(180 - E.valveTilt / DEG);
    xs.forEach((xc, i) => {
      const no = cylNo(s, i);
      const zeta0 = target + s * (FIRE[no] + peak(w)) / 2;
      const V = intake ? VALVES.in : VALVES.ex;
      for (const dx of [-V.dx, V.dx]) pol.push(extrudeX(lobeShape(zeta0 * DEG, half * DEG), 0.0135, 0.0007, 1).translate(xc + dx - 0.00675, 0, 0));
    });
    shaft.add(mesh(merge(pol), M.steelPolished), mesh(merge(core), M.steel));
    f.add(shaft);
    A.add(intake ? 'head.camIn' : 'head.camEx', f, off(0.45).addScaledVector(outer(s), intake ? -0.025 : 0.025), { delay: 0.4 });
    cams.push(shaft);
  }

  // ---------------- крышки опор распредвалов
  {
    const f = bankFrame(s);
    const g = [], b = [];
    for (const xj of bx) {
      g.push(extrudeX(roundRect(0.148, 0.024, 0.008, 0, HT + 0.012), 0.02, 0.0015).translate(xj - 0.01, 0, 0));
      for (const u of [-0.068, -0.026, 0.026, 0.068]) b.push(put(hexBolt(0.009, 0.006), mat([xj, HT + 0.024, u])));
    }
    f.add(mesh(merge(g), M.aluMachined), mesh(merge(b), M.steelDark));
    A.add('head.camCaps', f, off(0.53), { delay: 0.3 });
  }

  // ---------------- болты ГБЦ
  {
    const f = bankFrame(s);
    const g = [];
    for (const xb of bx) for (const u of [-0.085, 0.085]) g.push(put(hexBolt(0.016, 0.01, true, 0.2), mat([xb, HT, u])));
    f.add(mesh(merge(g), M.steelDark));
    A.add('head.bolts', f, off(0.6), { delay: 0.2 });
  }

  // ---------------- свечи
  {
    const f = bankFrame(s);
    f.add(mesh(merge(xs.map(x => put(geo.plugZ, mat([x, 0, 0])))), M.zinc));
    f.add(mesh(merge(xs.map(x => put(geo.plugC, mat([x, 0, 0])))), M.ceramic));
    A.add('head.plugs', f, off(0.34), { delay: 0.45 });
  }

  // ---------------- клапанная крышка (карбон)
  {
    const f = bankFrame(s);
    const x0 = E.rear + 0.004, x1 = E.front - 0.002;
    const g = [extrudeY(roundRect(x1 - x0, 0.198, 0.03, (x0 + x1) / 2, 0), COVER1 - COVER0, 0.013, 4, 32).translate(0, COVER0, 0)];
    for (const x of xs) g.push(extrudeY(roundRect(0.066, 0.112, 0.024, x, 0), POD1 - 0.391, 0.012, 4, 32).translate(0, 0.391, 0));
    f.add(mesh(merge(g), M.carbon));
    const dark = xs.map(x => cyl(0.0135, 0.0008, 32, POD1 - 0.0002).translate(x, 0, 0));
    f.add(mesh(merge(dark), M.hole));
    const bolts = bx.flatMap(x => [-0.072, 0.072].map(u => put(hexBolt(0.01, 0.006), mat([x, COVER1, u]))));
    f.add(mesh(merge(bolts), M.zinc));
    if (s > 0) {
      const bm = mesh(new THREE.BoxGeometry(0.056, 0.018, 0.0012), M.badge);
      bm.position.set(0.19, (COVER0 + COVER1) / 2, 0.099 + 0.0006);
      f.add(bm);
    }
    A.add('head.cover', f, off(0.66), { delay: 0.1 });
  }

  // ---------------- катушки зажигания
  {
    const f = bankFrame(s);
    const body = [], blk = [];
    for (const x of xs) {
      const m = mat([x, POD1 + 0.016, 0.004], [0.12, 0, 0]);
      body.push(put(roundBox(0.036, 0.03, 0.054, 0.006), m));
      blk.push(put(roundBox(0.02, 0.016, 0.018, 0.003), mat([x, POD1 + 0.014, 0.036], [0.12, 0, 0])));
      blk.push(cyl(0.0105, POD1 - 0.318, 20, 0.318).translate(x, 0, 0));
      blk.push(cyl(0.0125, 0.006, 24, POD1 - 0.003).translate(x, 0, 0));
    }
    f.add(mesh(merge(body), M.coil), mesh(merge(blk), M.plastic));
    A.add('head.coils', f, off(0.82), { delay: 0 });
  }

  // ---------------- кинематика клапанов и распредвалов
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const place = (im, idx, pos, dir, sy = 1) => {
    q.setFromUnitVectors(up, dir);
    sc.set(1, sy, 1);
    m4.compose(pos, q, sc);
    im.setMatrixAt(idx, m4);
  };
  model.mover((theta, phi) => {
    for (const cam of cams) cam.rotation.x = -s * phi / 2 * DEG;
    const idx = { true: 0, false: 0 };
    valves.forEach((v, n) => {
      const L = lift(cycle(v.no, phi), v.intake ? INT : EXH);
      const set = valveSets[v.intake ? 0 : 1];
      p.copy(v.seat).addScaledVector(v.dir, -L);
      place(set.im, idx[v.intake]++, p, v.dir);
      p.copy(v.seat).addScaledVector(v.dir, 0.056);
      place(springs, n, p, v.dir, (0.036 - L) / 0.036);
      p.copy(v.seat).addScaledVector(v.dir, 0.092 - L);
      place(rets, n, p, v.dir);
      p.copy(v.seat).addScaledVector(v.dir, 0.1045 - L);
      place(buckets, n, p, v.dir);
    });
    for (const im of [valveSets[0].im, valveSets[1].im, springs, rets, buckets]) im.instanceMatrix.needsUpdate = true;
  });
}

// Шатровая камера: чаша от кромки на нижней плоскости головки до вершины.
function domeProfile() {
  const pts = [];
  const r0 = 0.045, h = 0.0092;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push([r0 * (1 - t), B0 + 0.0001 + h * Math.sin(t * Math.PI / 2)]);
  }
  return pts;
}

// Профиль кулачка: базовая окружность + подъём по косинусу; zeta0 — направление вершины.
function lobeShape(zeta0, half) {
  const pts = [];
  const N = 96;
  for (let k = 0; k < N; k++) {
    const al = k / N * Math.PI * 2;
    let d = al - zeta0;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const r = E.camR + (Math.abs(d) < half ? E.camLift * (0.5 + 0.5 * Math.cos(Math.PI * d / half)) : 0);
    pts.push([-r * Math.sin(al), r * Math.cos(al)]);
  }
  return polyShape(pts);
}
