// Впуск (патрубки, дроссельные заслонки, раструбы, привод) и топливная система.
import * as THREE from 'three';
import { E, bp, cylNo } from '../spec.js';
import { mesh } from '../model.js';
import { merge, put, mat, alignY, lathe, cyl, tube, Helix, bez, crv, extrudeX, extrudeY, polyShape, circlePath, roundRect, hexBolt, DEG, v3 } from '../util.js';
import { intakePort } from './head.js';
import { roundBox } from './block.js';

const TILT = 12 * DEG;
const T = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT));
const TB_Y = 0.405, TB_Z = 0.030, TB_H = 0.04;
export const RAIL = { y: 0.462, z: 0.106 };
const tbBase = x => new THREE.Vector3(x, TB_Y, TB_Z);
const tbTop = x => tbBase(x).addScaledVector(T, TB_H);

// Правый ряд строится в мировых координатах, левый — зеркалом по Z.
function side(s) { const g = new THREE.Group(); if (s < 0) g.scale.z = -1; return g; }

const mz = (p, s) => { p.z *= s; return p; };

// Положение форсунки: кончик в патрубке, направление к рампе, длина.
export function injectorFrame(x) {
  const q = runnerCurve(x).getPoint(0.62);
  const top = new THREE.Vector3(x, RAIL.y - 0.0095, RAIL.z);
  const d = top.clone().sub(q).normalize();
  const tip = q.clone().addScaledVector(d, 0.02);
  return { tip, d, L: top.distanceTo(tip), m: alignY(tip, d) };
}

function runnerCurve(x) {
  const port = intakePort(1, x);
  const p0 = port.p.clone().addScaledVector(port.n, 0.0055);
  const c = tbBase(x);
  return bez(p0, p0.clone().addScaledVector(port.n, 0.036), c.clone().addScaledVector(T, -0.046), c);
}

export function buildIntake(model) {
  const M = model.M, A = model.asm('intake');
  const levers = {};
  for (const s of [1, -1]) {
    const xs = E.cyl[s];
    const xmin = Math.min(...xs) - 0.036, xmax = Math.max(...xs) + 0.036;
    const out = new THREE.Vector3(0, 0, s);
    // путь воздуха: раструб → заслонка → патрубок → канал → цилиндр
    xs.forEach((x, i) => {
      const P = [tbTop(x).addScaledVector(T, 0.13), tbTop(x).addScaledVector(T, 0.03), tbBase(x)];
      const rc = runnerCurve(x);
      for (let k = 1; k <= 10; k++) P.push(rc.getPoint(1 - k / 10));
      P.push(bp(1, x, -0.07, 0.285), bp(1, x, -0.03, 0.255), bp(1, x, -0.01, 0.228), bp(1, x, 0, 0.19));
      model.flow('air', P.map(p => mz(p, s)), { no: cylNo(s, i) });
    });

    // ---- патрубки (карбон) с фланцами
    {
      const g = side(s);
      const carb = [], fl = [], bolts = [];
      for (const x of xs) {
        carb.push(tube(runnerCurve(x), 40, t => 0.0236 + 0.0026 * t, 24));
        const port = intakePort(1, x);
        fl.push(put(extrudeY(roundRect(0.064, 0.064, 0.013), 0.006, 0.0012), alignY(port.p, port.n)));
        for (const [dx, dz] of [[-0.024, -0.024], [0.024, -0.024], [-0.024, 0.024], [0.024, 0.024]]) {
          const m = alignY(port.p, port.n).multiply(mat([dx, 0.006, dz]));
          bolts.push(put(hexBolt(0.008, 0.005), m));
        }
        // гнездо форсунки
        const q = runnerCurve(x).getPoint(0.62);
        const d = new THREE.Vector3(x, RAIL.y - 0.01, RAIL.z).sub(q).normalize();
        fl.push(put(cyl(0.0095, 0.012, 20, 0.018), alignY(q, d)));
      }
      g.add(mesh(merge(carb), M.carbon), mesh(merge(fl), M.anoBlack), mesh(merge(bolts), M.zinc));
      A.add('intake.runners', g, [0, 0.08, 0.02 * s], { delay: 0.6 });
    }

    // ---- блоки дроссельных заслонок
    {
      const g = side(s);
      const sh = polyShape([[xmin, -0.034], [xmax, -0.034], [xmax, 0.034], [xmin, 0.034]]);
      for (const x of xs) sh.holes.push(circlePath(x, 0, 0.026));
      const tbm = mat([0, TB_Y, TB_Z], [TILT, 0, 0]);
      const body = [put(extrudeY(sh, TB_H, 0.0022, 2, 40), tbm)];
      for (let i = 0; i < 3; i++) body.push(put(hexBolt(0.008, 0.005), tbm.clone().multiply(mat([(xs[i] + xs[i + 1]) / 2, TB_H, 0.022]))));
      // бобышки оси заслонок по торцам
      body.push(put(cyl(0.009, 0.012, 24, 0), tbm.clone().multiply(mat([xmax, TB_H / 2, 0], [0, 0, -Math.PI / 2]))));
      const flaps = xs.map(x => put(cyl(0.0254, 0.0016, 36, -0.0008), tbm.clone().multiply(mat([x, TB_H / 2, 0], [68 * DEG, 0, 0]))));
      g.add(mesh(merge(body), M.anoBlack), mesh(merge(flaps), M.bronze));
      A.add('intake.throttles', g, [0, 0.19, 0.03 * s], { delay: 0.35 });
    }

    // ---- раструбы
    {
      const g = side(s);
      const prof = [[0.0292, 0], [0.0292, 0.006, 1], [0.0305, 0.03], [0.0345, 0.06], [0.041, 0.074], [0.0445, 0.079], [0.0445, 0.0825], [0.0415, 0.0855], [0.037, 0.0835], [0.0335, 0.077], [0.0290, 0.058], [0.0262, 0.03], [0.026, 0.006], [0.026, 0, 1], [0.0292, 0]];
      const tr = lathe(prof, 48);
      g.add(mesh(merge(xs.map(x => put(tr, alignY(tbTop(x), T)))), M.composite));
      A.add('intake.trumpets', g, [0, 0.3, 0.05 * s], { delay: 0 });
    }

    // ---- привод: ось заслонок, рычаг
    {
      const g = side(s);
      const tbm = mat([0, TB_Y, TB_Z], [TILT, 0, 0]);
      const st = [put(cyl(0.004, xmax + 0.06 - (xmin - 0.006), 16, 0), tbm.clone().multiply(mat([xmin - 0.006, TB_H / 2, 0], [0, 0, -Math.PI / 2])))];
      const lever = new THREE.Shape(); lever.moveTo(-0.009, 0); lever.absarc(0, 0, 0.009, Math.PI, 0, true); lever.lineTo(0.006, 0.04); lever.absarc(0, 0.04, 0.006, 0, Math.PI, false); lever.closePath();
      st.push(put(extrudeX(lever, 0.005, 0.001), tbm.clone().multiply(mat([xmax + 0.045, TB_H / 2, 0], [-0.5, 0, 0]))));
      g.add(mesh(merge(st), M.steel));
      A.add('intake.linkage', g, [0.12, 0.22, 0.03 * s], { delay: 0.2 });
      // кончик рычага в мировых координатах (для тяги между рядами)
      const tip = new THREE.Vector3(0, 0.04, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.5))
        .add(new THREE.Vector3(xmax + 0.0475, TB_H / 2, 0)).applyMatrix4(tbm);
      tip.z *= s;
      levers[s] = tip;
    }
  }

  // ---- тяга между рядами и возвратные пружины
  {
    const g = new THREE.Group();
    const a = levers[1], b = levers[-1];
    const rod = tube(new THREE.LineCurve3(a, b), 2, 0.0022, 12);
    const balls = [a, b].map(p => put(new THREE.SphereGeometry(0.0045, 16, 12), mat([p.x, p.y, p.z])));
    const spring1 = put(tube(new Helix(0.0045, 0.05, 11, 0.4), 160, 0.0009, 6), mat([a.x + 0.004, a.y - 0.052, a.z - 0.012]));
    const spring2 = put(tube(new Helix(0.0045, 0.05, 11, 0.4), 160, 0.0009, 6), mat([b.x + 0.004, b.y - 0.052, b.z + 0.012]));
    g.add(mesh(merge([rod, ...balls]), M.steelPolished), mesh(merge([spring1, spring2]), M.steelDark));
    A.add('intake.linkage', g, [0.12, 0.22, 0], { delay: 0.2 });

    // датчик положения заслонок — на правом ряду, спереди
    const t = new THREE.Group();
    const xmax = Math.max(...E.cyl[1]) + 0.036;
    const tbm = mat([0, TB_Y, TB_Z], [TILT, 0, 0]);
    const body = [put(roundBox(0.012, 0.036, 0.03, 0.004), tbm.clone().multiply(mat([xmax + 0.019, TB_H / 2, 0])))];
    body.push(put(roundBox(0.018, 0.014, 0.016, 0.003), tbm.clone().multiply(mat([xmax + 0.02, TB_H / 2 + 0.024, 0.006]))));
    t.add(mesh(merge(body), M.plastic));
    A.add('intake.tps', t, [0.2, 0.2, 0.06], { delay: 0.1 });
  }
}

// ---------------------------------------------------------------- топливо

function anFitting(len = 0.02) {
  // ось +Y: гайка-шестигранник, шейка, ниппель
  return merge([
    put(hexBolt(0.017, 0.008, false), mat([0, 0, 0])),
    lathe([[0, 0.008], [0.0065, 0.008, 1], [0.0065, 0.012, 1], [0.0072, 0.013, 1], [0.0072, len - 0.004, 1], [0.0055, len, 1], [0, len]], 24),
  ]);
}

export function buildFuel(model) {
  const M = model.M, A = model.asm('fuel');
  const ends = {};
  for (const s of [1, -1]) {
    const xs = E.cyl[s];
    const xf = xs[0] + 0.085, xr = xs[3] - 0.045;
    ends[s] = { xf, xr };

    // ---- рампа
    {
      const g = side(s);
      const body = [extrudeX(roundRect(0.019, 0.019, 0.005, -RAIL.z, RAIL.y), xf - xr, 0.0025).translate(xr, 0, 0)];
      // кронштейны к блоку заслонок
      for (const x of [xs[0] + 0.05, xs[3] - 0.02]) body.push(put(roundBox(0.012, 0.03, 0.05, 0.002), mat([x, RAIL.y - 0.02, RAIL.z - 0.025], [0.5, 0, 0])));
      const blue = [put(anFitting(0.022), mat([xf, RAIL.y, RAIL.z], [0, 0, -Math.PI / 2])), put(anFitting(0.022), mat([xr, RAIL.y, RAIL.z], [0, 0, Math.PI / 2]))];
      g.add(mesh(merge(body), M.anoBlack), mesh(merge(blue), M.anoBlue));
      A.add('fuel.rails', g, [0, 0.34, 0.08 * s], { delay: 0.1 });
    }

    // ---- форсунки
    {
      const g = side(s);
      const blk = [], blue = [], grey = [];
      for (const x of xs) {
        const { L, m } = injectorFrame(x);
        blk.push(put(lathe([[0, 0], [0.0042, 0, 1], [0.0048, 0.01, 1], [0.0072, 0.012, 1], [0.0072, L - 0.02, 1], [0.0058, L - 0.018, 1], [0.0058, L, 1], [0, L]], 24), m));
        blue.push(put(new THREE.TorusGeometry(0.0062, 0.0014, 8, 24), m.clone().multiply(mat([0, L - 0.008, 0], [Math.PI / 2, 0, 0]))));
        blue.push(put(new THREE.TorusGeometry(0.0046, 0.0012, 8, 20), m.clone().multiply(mat([0, 0.006, 0], [Math.PI / 2, 0, 0]))));
        grey.push(put(roundBox(0.016, 0.014, 0.02, 0.003), m.clone().multiply(mat([0, L - 0.027, 0.011]))));
      }
      g.add(mesh(merge(blk), M.plastic), mesh(merge(blue), M.anoBlue), mesh(merge(grey), M.plasticGrey));
      A.add('fuel.injectors', g, [0, 0.22, 0.06 * s], { delay: 0.35 });
    }
  }

  // ---- регулятор давления (на переднем конце левой рампы)
  const fpr = new THREE.Vector3(ends[-1].xf + 0.061, RAIL.y - 0.016, -RAIL.z);
  {
    const g = new THREE.Group();
    const purple = [lathe([[0, 0], [0.019, 0, 1], [0.019, 0.004], [0.0185, 0.0055], [0.0185, 0.012], [0.019, 0.0135], [0.019, 0.02], [0.0185, 0.0215], [0.0185, 0.028], [0.019, 0.0295], [0.019, 0.044, 1], [0.0165, 0.047, 1], [0.0105, 0.047, 1], [0.0105, 0.052, 1], [0, 0.052]], 40).translate(fpr.x, fpr.y, fpr.z)];
    const steel = [
      put(hexBolt(0.016, 0.006, false), mat([fpr.x, fpr.y + 0.052, fpr.z])),
      cyl(0.004, 0.016, 16, fpr.y + 0.058).translate(fpr.x, 0, fpr.z),
    ];
    const blue = [put(anFitting(0.02), mat([fpr.x - 0.019, fpr.y + 0.016, fpr.z], [0, 0, Math.PI / 2])), put(anFitting(0.02), mat([fpr.x + 0.019, fpr.y + 0.03, fpr.z], [0, 0, -Math.PI / 2]))];
    g.add(mesh(merge(purple), M.anoPurple), mesh(merge(steel), M.zinc), mesh(merge(blue), M.anoBlue));
    A.add('fuel.fpr', g, [0.14, 0.34, -0.1], { delay: 0 });
  }

  // ---- магистрали в оплётке
  {
    const g = new THREE.Group();
    const R = ends[1], L = ends[-1];
    const hoses = [
      crv([v3(R.xr - 0.022, RAIL.y, RAIL.z), v3(R.xr - 0.06, RAIL.y + 0.004, RAIL.z - 0.01), v3(-0.3, RAIL.y + 0.03, 0.04), v3(-0.3, RAIL.y + 0.03, -0.04), v3(L.xr - 0.06, RAIL.y + 0.004, -RAIL.z + 0.01), v3(L.xr - 0.022, RAIL.y, -RAIL.z)]),
      crv([v3(R.xf + 0.022, RAIL.y, RAIL.z), v3(R.xf + 0.06, RAIL.y - 0.004, RAIL.z + 0.01), v3(0.33, RAIL.y - 0.03, RAIL.z + 0.06), v3(0.35, RAIL.y - 0.06, RAIL.z + 0.1)]),
      crv([v3(fpr.x + 0.039, fpr.y + 0.03, fpr.z), v3(fpr.x + 0.07, fpr.y + 0.028, fpr.z - 0.01), v3(0.35, RAIL.y - 0.06, -RAIL.z - 0.06), v3(0.36, RAIL.y - 0.09, -RAIL.z - 0.1)]),
    ];
    const braid = hoses.map(c => tube(c, 80, 0.0068, 16));
    // путь топлива: подача → правая рампа → перемычка → левая рампа → регулятор → слив
    const F = [];
    for (let k = 0; k <= 8; k++) F.push(hoses[1].getPoint(1 - k / 8));
    F.push(v3(R.xf, RAIL.y, RAIL.z), v3((R.xf + R.xr) / 2, RAIL.y, RAIL.z), v3(R.xr, RAIL.y, RAIL.z));
    for (let k = 0; k <= 12; k++) F.push(hoses[0].getPoint(k / 12));
    F.push(v3(L.xr, RAIL.y, -RAIL.z), v3((L.xf + L.xr) / 2, RAIL.y, -RAIL.z), v3(L.xf, RAIL.y, -RAIL.z), v3(fpr.x, fpr.y + 0.016, fpr.z), v3(fpr.x, fpr.y + 0.03, fpr.z));
    for (let k = 0; k <= 8; k++) F.push(hoses[2].getPoint(k / 8));
    model.flow('fuel', F);
    const blue = [];
    for (const c of hoses) for (const t of [0, 1]) {
      const p = c.getPoint(t), d = c.getTangent(t).multiplyScalar(t ? 1 : -1);
      blue.push(put(merge([lathe([[0, 0], [0.0085, 0, 1], [0.0085, 0.018, 1], [0.0072, 0.02, 1], [0, 0.02]], 20), put(hexBolt(0.017, 0.008, false), mat([0, 0.004, 0]))]), alignY(p.clone().addScaledVector(d, -0.016), d)));
    }
    g.add(mesh(merge(braid), M.braid), mesh(merge(blue), M.anoBlue));
    A.add('fuel.lines', g, [0.05, 0.46, 0], { delay: 0.2 });
  }
}
