// Электроника (блок управления, жгут, датчик температуры) и внешние узлы стенда:
// масляный бак сухого картера с маслопроводами и радиатор охлаждения.
import * as THREE from 'three';
import { E, bp } from '../spec.js';
import { mesh } from '../model.js';
import { merge, put, mat, alignY, lathe, cyl, ring, tube, crv, extrudeX, roundRect, hexBolt, v3 } from '../util.js';
import { roundBox } from './block.js';
import { injectorFrame, RAIL } from './intake.js';
import { PUMP, PUMP_P } from './lube.js';

const ECU = { x: -0.335, y: 0.31, w: 0.045, h: 0.17, d: 0.25 };
const ECU_PLUG = s => v3(-0.3035, 0.36, s * 0.06);
const TANK = { x: 0.49, z: 0.37, y0: -0.175, y1: 0.115, r: 0.065 };
// Штуцер возврата масла на крышке бака.
const RET = { p: v3(TANK.x - 0.028, TANK.y1 - 0.006, TANK.z + 0.03), d: v3(-0.4, 1, 0.3).normalize() };
const RAD = { x0: -0.60, x1: -0.29, y0: -0.165, y1: 0.035, z: -0.43, t: 0.032 };

// Разъём/штуцер по оси Y: корпус и накидная гайка.
function plug(r = 0.0075, len = 0.02) {
  return lathe([[0, 0], [r * 0.7, 0, 1], [r, 0.002, 1], [r, len * 0.55, 1], [r * 1.12, len * 0.6, 1], [r * 1.12, len, 1], [0, len]], 16);
}
function anFitting(r = 0.0105, len = 0.022) {
  return merge([
    put(hexBolt(r * 2.1, 0.009, false), mat([0, 0, 0])),
    lathe([[0, 0.009], [r * 0.8, 0.009, 1], [r * 0.8, 0.012, 1], [r, 0.013, 1], [r, len - 0.003, 1], [r * 0.75, len, 1], [0, len]], 20),
  ]);
}
// Термоусадочные метки вдоль жгута.
function bands(c, ts, r) {
  return ts.map(t => put(ring(r * 0.98, r * 1.18, 0.009, 16, -0.0045), alignY(c.getPointAt(t), c.getTangentAt(t))));
}

export function buildElectronics(model) {
  const M = model.M, A = model.asm('elec');

  // ---- блок управления двигателем
  {
    const g = new THREE.Group();
    const cx = ECU.x, cy = ECU.y;
    const body = [put(roundBox(ECU.w, ECU.h, ECU.d, 0.008), mat([cx, cy, 0]))];
    // рёбра охлаждения на задней стенке
    for (let k = -9; k <= 9; k++) body.push(put(roundBox(0.012, ECU.h - 0.03, 0.004, 0.0015), mat([cx - ECU.w / 2 - 0.005, cy, k * 0.0125])));
    const dark = [put(roundBox(0.002, ECU.h - 0.036, ECU.d - 0.04, 0.004), mat([cx + ECU.w / 2 + 0.0004, cy - 0.01, 0]))];
    // разъёмы на передней стенке: по одному на ряд и сервисный
    const plugs = [], blue = [];
    for (const s of [1, -1]) {
      const p = ECU_PLUG(s);
      plugs.push(put(roundBox(0.016, 0.032, 0.052, 0.004), mat([p.x - 0.001, p.y, p.z])));
      blue.push(put(roundBox(0.004, 0.036, 0.056, 0.002), mat([p.x + 0.002, p.y, p.z])));
    }
    plugs.push(put(roundBox(0.012, 0.018, 0.03, 0.003), mat([cx + ECU.w / 2 + 0.006, cy - 0.05, 0])));
    // крепёж и кронштейны к задней плоскости головок
    const bolts = [], br = [];
    for (const [y, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      bolts.push(put(hexBolt(0.009, 0.005), mat([cx + ECU.w / 2, cy + y * (ECU.h / 2 - 0.012), z * (ECU.d / 2 - 0.014)], [0, 0, -Math.PI / 2])));
    }
    for (const s of [1, -1]) {
      br.push(put(roundBox(E.rear - 0.002 - (cx + ECU.w / 2), 0.022, 0.006, 0.002), mat([(E.rear - 0.002 + cx + ECU.w / 2) / 2, 0.268, s * 0.105])));
      br.push(put(roundBox(0.006, 0.05, 0.03, 0.002), mat([cx + ECU.w / 2 + 0.003, 0.268, s * 0.105])));
      bolts.push(put(hexBolt(0.009, 0.005), mat([E.rear - 0.004, 0.268, s * 0.114], [0, 0, Math.PI / 2])));
    }
    const badge = mesh(new THREE.BoxGeometry(0.0012, 0.03, 0.09), M.badge);
    badge.position.set(cx + ECU.w / 2 + 0.0007, cy + 0.05, 0);
    badge.rotation.y = Math.PI / 2;
    g.add(mesh(merge(body), M.aluDark), mesh(merge(dark), M.anoBlack), mesh(merge(plugs), M.plastic), mesh(merge(blue), M.anoBlue),
      mesh(merge(bolts), M.zinc), mesh(merge(br), M.aluMachined), badge);
    A.add('elec.ecu', g, [-0.18, 0.06, 0], { delay: 0 });
  }

  // ---- жгут: магистраль вдоль каждой головки, отводы к катушкам и форсункам
  {
    const g = new THREE.Group();
    const loom = [], sub = [], boots = [], marks = [];
    const TR = 0.0068;
    for (const s of [1, -1]) {
      const xs = E.cyl[s];
      const tr = u => bp(s, u, 0.106, 0.395);
      const main = crv([tr(0.235), tr(0.12), tr(-0.05), tr(-0.2), tr(-0.255), v3(-0.278, 0.33, s * 0.2), v3(-0.272, 0.362, s * 0.098), ECU_PLUG(s).add(v3(0.02, 0, 0)), ECU_PLUG(s).add(v3(0.008, 0, 0))], 0.4);
      loom.push(tube(main, 160, TR, 12));
      marks.push(...bands(main, [0.08, 0.3, 0.55, 0.78], TR));
      // катушки
      for (const x of xs) {
        const a = tr(x), b = bp(s, x, 0.084, 0.428), c = bp(s, x, 0.056, 0.441);
        const cc = crv([a, b, c]);
        sub.push(tube(cc, 20, 0.0034, 8));
        boots.push(put(plug(0.0058, 0.016), alignY(c.clone().addScaledVector(cc.getTangentAt(1), -0.004), cc.getTangentAt(1))));
      }
      // форсунки: подмагистраль над топливной рампой
      const inj = xs.map(x => {
        const f = injectorFrame(x);
        const p = new THREE.Vector3(0, f.L - 0.027, 0.013).applyMatrix4(f.m);
        const n = new THREE.Vector3(0, 0, 1).transformDirection(f.m);
        p.z *= s; n.z *= s;
        return { x, p, n };
      });
      const ry = RAIL.y + 0.034, rz = s * (RAIL.z + 0.028);
      const trunk = crv([v3(0.205, ry, rz), ...inj.map(q => v3(q.x, ry, rz)), v3(-0.225, ry - 0.004, rz), v3(-0.262, 0.43, s * 0.13), v3(-0.272, 0.37, s * 0.1), v3(-0.285, 0.366, s * 0.07), ECU_PLUG(s).add(v3(0.012, 0.004, 0))], 0.4);
      loom.push(tube(trunk, 140, 0.0052, 10));
      marks.push(...bands(trunk, [0.12, 0.62], 0.0052));
      for (const q of inj) {
        const a = v3(q.x, ry, rz), end = q.p.clone().addScaledVector(q.n, 0.012);
        const cc = crv([a, v3(q.x, (ry + end.y) / 2 + 0.004, (rz + end.z) / 2), end]);
        sub.push(tube(cc, 16, 0.003, 8));
        boots.push(put(plug(0.0055, 0.014), alignY(q.p.clone().addScaledVector(q.n, 0.002), q.n)));
      }
      // датчик температуры (правый ряд)
      if (s > 0) {
        const tip = CTS.p.clone().addScaledVector(CTS.d, 0.046);
        const cc = crv([tr(0.235), v3(0.255, 0.305, 0.3), v3(0.292, 0.325, 0.29), v3(0.302, 0.3, 0.2), tip.clone().addScaledVector(CTS.d, 0.03), tip]);
        sub.push(tube(cc, 40, 0.0036, 8));
      }
    }
    g.add(mesh(merge(loom), M.loom), mesh(merge(sub), M.loom), mesh(merge(boots), M.plastic), mesh(merge(marks), M.plasticGrey));
    A.add('elec.harness', g, [0, 0.2, 0], { delay: 0.2 });
  }

  // ---- датчик температуры охлаждающей жидкости
  {
    const g = new THREE.Group();
    const m = alignY(CTS.p, CTS.d);
    g.add(mesh(merge([put(hexBolt(0.017, 0.008, false), m), put(lathe([[0, 0.008], [0.0075, 0.008, 1], [0.0075, 0.016, 1], [0.0065, 0.018], [0, 0.018]], 20), m)]), M.bronze));
    g.add(mesh(put(plug(0.0078, 0.028), m.clone().multiply(mat([0, 0.018, 0]))), M.plasticGrey));
    A.add('elec.cts', g, [0.14, 0.08, 0.1], { delay: 0 });
  }
}

const CTS = { p: v3(0.289, 0.22, 0.052), d: v3(0, 0.5, 0.866).normalize() };

export function buildExternal(model) {
  const M = model.M, A = model.asm('ext');
  const T = TANK;

  // ---- масляный бак
  {
    const g = new THREE.Group();
    const at = (x, y, z) => mat([T.x + x, y, T.z + z]);
    const shell = lathe([[0, T.y0], [0.04, T.y0 + 0.003], [0.058, T.y0 + 0.01], [T.r, T.y0 + 0.022, 1], [T.r, T.y1 - 0.022, 1], [0.058, T.y1 - 0.01], [0.04, T.y1 - 0.003], [0, T.y1]], 56);
    const welds = [T.y0 + 0.022, T.y1 - 0.022].map(y => put(new THREE.TorusGeometry(T.r + 0.0004, 0.0024, 8, 64).rotateX(Math.PI / 2), at(0, y, 0)));
    // хомуты и стойки к основанию
    const straps = [], frame = [], bolts = [];
    for (const y of [-0.12, 0.06]) {
      straps.push(put(ring(T.r + 0.0005, T.r + 0.004, 0.018, 64, -0.009), at(0, y, 0)));
      straps.push(put(roundBox(0.02, 0.018, 0.016, 0.002), at(T.r + 0.012, y, 0)));
      bolts.push(put(hexBolt(0.009, 0.005), at(T.r + 0.012, y, 0.008).multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0]))));
    }
    const yb = -E.root;
    frame.push(put(roundBox(0.16, 0.006, 0.16, 0.003), at(0.01, yb + 0.003, 0)));
    frame.push(put(roundBox(0.012, 0.25, 0.02, 0.002), at(T.r + 0.026, yb + 0.006 + 0.125, 0)));
    frame.push(put(roundBox(0.03, 0.006, 0.05, 0.002), at(T.r + 0.014, yb + 0.009, 0)));
    for (const [x, z] of [[-0.06, -0.06], [-0.06, 0.06], [0.08, -0.06], [0.08, 0.06]]) bolts.push(put(hexBolt(0.009, 0.005), at(x, yb + 0.006, z)));
    // опорные лапы под днищем
    for (const a of [0, 2.1, 4.2]) frame.push(put(roundBox(0.012, T.y0 - yb - 0.004, 0.012, 0.002), at(Math.cos(a) * 0.04, (T.y0 + yb) / 2 + 0.004, Math.sin(a) * 0.04)));
    // сапун, возврат сверху, заборный штуцер снизу, заливная горловина
    const blue = [], steel = [];
    blue.push(put(anFitting(0.0095, 0.02), at(0, T.y1 - 0.002, 0)));
    steel.push(put(tube(crv([v3(0, 0.02, 0), v3(0, 0.05, 0), v3(0.03, 0.072, 0), v3(0.07, 0.07, 0)]), 30, 0.0065, 12), at(0, T.y1 - 0.002, 0)));
    const filt = put(lathe([[0, 0], [0.012, 0, 1], [0.017, 0.006, 1], [0.017, 0.05, 1], [0.012, 0.056, 1], [0, 0.056]], 28), at(0.07, T.y1 + 0.068, 0).multiply(mat([0, 0, 0], [0, 0, -Math.PI / 2])));
    blue.push(put(anFitting(0.0105, 0.022), alignY(RET.p, RET.d)));
    blue.push(put(anFitting(0.012, 0.022), at(-T.r - 0.004, -0.15, 0).multiply(mat([0, 0, 0], [0, 0, Math.PI / 2]))));
    blue.push(put(cyl(0.016, 0.014, 28, 0, 0.002), at(0.034, T.y1 - 0.02, -0.02)));
    steel.push(put(cyl(0.022, 0.008, 32, 0.012, 0.002), at(0.034, T.y1 - 0.02, -0.02)));
    // смотровое стекло уровня
    const sight = [], sightF = [];
    const sd = v3(0.5, 0, 0.866), sr = T.r + 0.012;
    for (const y of [-0.14, 0.09]) sightF.push(put(cyl(0.0048, 0.015, 16, 0), at(0, y, 0).multiply(alignY(sd.clone().multiplyScalar(T.r - 0.003), sd))));
    for (const y of [-0.14, 0.09]) sightF.push(put(cyl(0.0078, 0.012, 16, -0.006), at(sd.x * sr, y, sd.z * sr)));
    sight.push(put(cyl(0.0055, 0.23, 16, 0), at(sd.x * sr, -0.14, sd.z * sr)));
    g.add(mesh(put(shell, at(0, 0, 0)), M.aluMachined), mesh(merge(welds), M.weld), mesh(merge(straps), M.anoBlack), mesh(merge(frame), M.aluDark),
      mesh(merge(bolts), M.zinc), mesh(merge(blue), M.anoBlue), mesh(merge(steel), M.braid), mesh(filt, M.steel), mesh(merge(sight), M.sight), mesh(merge(sightF), M.anoBlue));
    A.add('ext.tank', g, [0.12, 0.02, 0.14], { delay: 0 });
  }

  // ---- маслопроводы бака: подача к насосу и возврат из откачки
  {
    const g = new THREE.Group();
    const hoses = [], blue = [];
    const pumpIn = v3(PUMP_P, PUMP.y - PUMP.r - 0.032, PUMP.z);
    const feed = crv([v3(T.x - T.r - 0.03, -0.15, T.z), v3(T.x - T.r - 0.07, -0.152, T.z - 0.02), v3(0.3, -0.156, 0.31), v3(0.16, -0.158, 0.29), v3(0.085, -0.15, 0.255), v3(PUMP_P + 0.004, -0.14, 0.222), pumpIn]);
    hoses.push(tube(feed, 120, 0.0102, 16));
    const pumpOut = v3(PUMP.x0 - 0.044, PUMP.y, PUMP.z);
    const retEnd = RET.p.clone().addScaledVector(RET.d, 0.026);
    const ret = crv([pumpOut, v3(-0.035, -0.058, 0.226), v3(-0.042, -0.035, 0.29), v3(0.02, 0.0, 0.39), v3(0.2, 0.045, 0.43), v3(0.36, 0.11, 0.425), retEnd.clone().addScaledVector(RET.d, 0.05), retEnd]);
    hoses.push(tube(ret, 160, 0.0094, 16));
    for (const c of [feed, ret]) for (const [t, sgn] of [[0, -1], [1, 1]]) {
      const p = c.getPointAt(t), d = c.getTangentAt(t).multiplyScalar(sgn);
      blue.push(put(lathe([[0, 0], [0.0122, 0, 1], [0.0122, 0.022, 1], [0.0104, 0.024, 1], [0, 0.024]], 20), alignY(p.clone().addScaledVector(d, -0.02), d)));
    }
    g.add(mesh(merge(hoses), M.braid), mesh(merge(blue), M.anoBlue));
    A.add('ext.tankLines', g, [0.08, 0.12, 0.22], { delay: 0.2 });
    const tankIn = [v3(T.x, 0.05, T.z), v3(T.x, -0.1, T.z), v3(T.x - 0.03, -0.15, T.z)];
    const fP = [...tankIn]; for (let k = 0; k <= 16; k++) fP.push(feed.getPointAt(k / 16)); fP.push(v3(PUMP_P, PUMP.y, PUMP.z));
    model.flow('oil', fP);
    const rP = [v3(PUMP.x0 + 0.05, PUMP.y, PUMP.z)]; for (let k = 0; k <= 22; k++) rP.push(ret.getPointAt(k / 22)); rP.push(v3(T.x - 0.02, T.y1 - 0.04, T.z + 0.02), v3(T.x + 0.02, 0.0, T.z - 0.03), v3(T.x, -0.06, T.z));
    model.flow('oil', rP);
  }

  // ---- радиатор
  {
    const g = new THREE.Group();
    const R = RAD, W = R.x1 - R.x0, H = R.y1 - R.y0;
    const tubes = [], fins = [], tanks = [], dark = [], caps = [], rub = [], bolts = [];
    const N = 17, pitch = H / N;
    for (let k = 0; k <= N; k++) tubes.push(put(roundBox(W, 0.0028, R.t, 0.0012), mat([(R.x0 + R.x1) / 2, R.y0 + k * pitch, R.z])));
    fins.push(finGeometry(R.x0, R.x1, R.y0, pitch, N, R.z, R.t * 0.94));
    dark.push(put(new THREE.BoxGeometry(W, H, 0.002), mat([(R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, R.z])));
    // боковые бачки, рамка, горловина с крышкой, патрубки с заглушками, лапы
    for (const x of [R.x0 - 0.018, R.x1 + 0.018]) tanks.push(put(roundBox(0.036, H + 0.04, R.t + 0.012, 0.008), mat([x, (R.y0 + R.y1) / 2, R.z])));
    for (const y of [R.y0 - 0.008, R.y1 + 0.008]) tanks.push(put(roundBox(W + 0.004, 0.012, R.t + 0.006, 0.002), mat([(R.x0 + R.x1) / 2, y, R.z])));
    const neck = v3(R.x1 + 0.018, R.y1 + 0.02, R.z);
    tanks.push(put(cyl(0.013, 0.02, 28, 0), mat([neck.x, neck.y, neck.z])));
    caps.push(put(lathe([[0, 0.034], [0.02, 0.034, 1], [0.021, 0.03], [0.021, 0.022, 1], [0.016, 0.02], [0, 0.02]], 32), mat([neck.x, neck.y, neck.z])));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; caps.push(put(new THREE.BoxGeometry(0.003, 0.01, 0.004), mat([neck.x + Math.cos(a) * 0.021, neck.y + 0.027, neck.z + Math.sin(a) * 0.021], [0, -a, 0]))); }
    for (const [x, y] of [[R.x1 + 0.018, R.y1 - 0.03], [R.x0 - 0.018, R.y0 + 0.03]]) {
      const m = mat([x, y, R.z + (R.t + 0.012) / 2], [Math.PI / 2, 0, 0]);
      tanks.push(put(ring(0.013, 0.0165, 0.05, 32, 0), m));
      rub.push(put(cyl(0.0185, 0.03, 32, 0.022, 0.003), m));
      rub.push(put(ring(0.0185, 0.021, 0.008, 32, 0.034), m));
    }
    for (const x of [R.x0 + 0.04, R.x1 - 0.04]) {
      tanks.push(put(roundBox(0.03, R.y0 - 0.008 + E.root, 0.012, 0.002), mat([x, (R.y0 - 0.008 - E.root) / 2, R.z])));
      tanks.push(put(roundBox(0.05, 0.006, 0.07, 0.002), mat([x, -E.root + 0.003, R.z])));
      for (const dz of [-0.024, 0.024]) bolts.push(put(hexBolt(0.009, 0.005), mat([x, -E.root + 0.006, R.z + dz])));
    }
    g.add(mesh(merge(tubes), M.aluMachined), mesh(fins[0], M.fin), mesh(merge(dark), M.hole), mesh(merge(tanks), M.aluCast), mesh(merge(caps), M.anoBlack), mesh(merge(rub), M.rubber), mesh(merge(bolts), M.zinc));
    A.add('ext.radiator', g, [0, 0.03, -0.16], { delay: 0 });
  }
}

// Гофрированные пластины между трубками: зигзаг в плоскости XY, вытянутый по Z.
function finGeometry(x0, x1, y0, pitch, n, z, depth) {
  const pos = [], nor = [], uv = [], idx = [];
  const step = 0.004, cnt = Math.floor((x1 - x0) / step);
  for (let k = 0; k < n; k++) {
    const ya = y0 + k * pitch + 0.0016, yb = y0 + (k + 1) * pitch - 0.0016;
    const base = pos.length / 3;
    for (let i = 0; i <= cnt; i++) {
      const x = x0 + i * step, y = i % 2 ? yb : ya;
      const nx = (i % 2 ? 1 : -1) * 0.2;
      for (const zz of [z - depth / 2, z + depth / 2]) { pos.push(x, y, zz); nor.push(nx, 0, 1); uv.push(x, zz); }
    }
    for (let i = 0; i < cnt; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
