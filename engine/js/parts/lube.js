// Сухой картер: поддон, многосекционный насос с зубчатым приводом, маслопроводы, фильтр, датчик.
import * as THREE from 'three';
import { E } from '../spec.js';
import { mesh } from '../model.js';
import { merge, put, mat, alignY, lathe, cyl, ring, tube, crv, extrudeX, extrudeY, polyShape, circlePath, roundRect, hexBolt, gearShape, beltPath, ribbon, DEG, v3 } from '../util.js';
import { roundBox } from './block.js';

export const PUMP = { y: -0.06, z: 0.212, fx: -0.212, r: 0.036, x0: 0.024, x1: 0.30 };
const HTD = { x: 0.347, rc: 0.040, rp: 0.068 };
const along = (g, x0) => put(g, mat([x0, 0, 0], [0, 0, -Math.PI / 2]));

function anEnd(len = 0.02, r = 0.0095) {
  return merge([
    put(hexBolt(r * 2.1, 0.009, false), mat([0, 0, 0])),
    lathe([[0, 0.009], [r * 0.8, 0.009, 1], [r * 0.8, 0.012, 1], [r, 0.013, 1], [r, len - 0.003, 1], [r * 0.75, len, 1], [0, len]], 24),
  ]);
}

export function buildLube(model) {
  const M = model.M, A = model.asm('lube');

  // ---- поддон
  {
    const g = new THREE.Group();
    const alu = [extrudeY(roundRect(0.476, 0.336, 0.02, 0, 0), 0.058, 0.009, 3, 24).translate(0, -0.135, 0)];
    alu.push(extrudeY(roundRect(0.48, 0.344, 0.018, 0, 0), 0.008, 0.0015).translate(0, -0.078, 0));
    for (let k = -3; k <= 3; k++) alu.push(put(new THREE.BoxGeometry(0.38, 0.006, 0.006), mat([0, -0.1365, k * 0.04])));
    // приливы штуцеров откачки на правом борту
    const outlets = OUTLETS;
    for (const x of outlets) alu.push(put(cyl(0.014, 0.012, 28, 0, 0.0015), mat([x, -0.112, 0.166], [Math.PI / 2, 0, 0])));
    const bolts = [];
    for (let k = 0; k < 9; k++) for (const z of [-0.166, 0.166]) bolts.push(put(hexBolt(0.009, 0.005), mat([-0.21 + k * 0.0525, -0.078, z], [Math.PI, 0, 0])));
    bolts.push(put(hexBolt(0.016, 0.007), mat([-0.12, -0.135, -0.07], [Math.PI, 0, 0])));
    const blue = outlets.map(x => put(anEnd(0.018, 0.009), mat([x, -0.112, 0.178], [Math.PI / 2, 0, 0])));
    g.add(mesh(merge(alu), M.aluCast), mesh(merge(bolts), M.zinc), mesh(merge(blue), M.anoBlue));
    A.add('lube.sump', g, [0, -0.13, 0], { delay: 0.2 });
  }

  // ---- насос: 1 нагнетающая + 3 откачивающие секции
  const pumpSpin = new THREE.Group();
  const sec = [];
  {
    const g = new THREE.Group();
    g.position.set(0, PUMP.y, PUMP.z);
    const body = [], rings = [], blue = [];
    const L = (PUMP.x1 - PUMP.x0) / 4;
    for (let k = 0; k < 4; k++) {
      const x0 = PUMP.x0 + k * L;
      body.push(along(cyl(PUMP.r, L - 0.008, 40, 0, 0.002), x0 + 0.004));
      rings.push(along(cyl(PUMP.r + 0.004, 0.008, 40, 0, 0.001), x0 - 0.004));
      // стяжные шпильки по периметру
      sec.push(x0 + L / 2);
    }
    rings.push(along(cyl(PUMP.r + 0.004, 0.008, 40, 0, 0.001), PUMP.x1 - 0.004));
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + Math.PI / 4;
      rings.push(put(cyl(0.0035, PUMP.x1 - PUMP.x0 + 0.012, 12, 0), mat([PUMP.x0 - 0.006, Math.cos(a) * (PUMP.r + 0.001), Math.sin(a) * (PUMP.r + 0.001)], [0, 0, -Math.PI / 2])));
    }
    // передний корпус подшипника и вал к шкиву
    body.push(along(lathe([[0, 0], [0.03, 0, 1], [0.03, 0.01], [0.022, 0.016, 1], [0.022, 0.034, 1], [0, 0.034]], 36), PUMP.x1 + 0.004));
    // порты: нагнетание сверху передней секции, откачка — наружу у трёх остальных
    body.push(put(cyl(0.013, 0.012, 24, PUMP.r - 0.004), mat([sec[0], 0, 0])));
    blue.push(put(anEnd(0.02, 0.0095), mat([sec[0], PUMP.r + 0.008, 0])));
    for (let k = 1; k < 4; k++) {
      body.push(put(cyl(0.014, 0.012, 24, PUMP.r - 0.004), mat([sec[k], 0, 0], [Math.PI / 2, 0, 0])));
      blue.push(put(anEnd(0.02, 0.0105), mat([sec[k], 0, PUMP.r + 0.008], [Math.PI / 2, 0, 0])));
    }
    // кронштейн к юбке блока
    const br = put(roundBox(0.05, 0.024, 0.05, 0.004), mat([0.14, 0.02, -0.03], [0.5, 0, 0]));
    g.add(mesh(merge(body), M.anoBlack), mesh(merge(rings), M.aluMachined), mesh(merge(blue), M.anoBlue), mesh(br, M.aluDark));
    A.add('lube.pump', g, [0.06, 0.0, 0.28], { delay: 0.1 });
  }

  // ---- привод насоса: зубчатый ремень и шкивы
  const drv = { crank: new THREE.Group(), pump: new THREE.Group() };
  {
    const g = new THREE.Group();
    const crankP = merge([
      extrudeX(gearShape(HTD.rc - 0.002, HTD.rc, 30, 0.02, 0.45, 0.3), 0.018, 0).translate(HTD.x - 0.009, 0, 0),
      along(cyl(HTD.rc + 0.004, 0.0015, 48, 0), HTD.x - 0.0105),
    ]);
    drv.crank.add(mesh(crankP, M.steel));
    const pumpP = merge([
      extrudeX(gearShape(HTD.rp - 0.002, HTD.rp, 50, 0.05, 0.45, 0.3), 0.018, 0).translate(-0.009, 0, 0),
      along(cyl(HTD.rp + 0.005, 0.0018, 64, 0), -0.0108),
      along(cyl(HTD.rp + 0.005, 0.0018, 64, 0), 0.009),
      along(hexBolt(0.017, 0.008), 0.0108),
    ]);
    const spokes = new THREE.Shape(); spokes.absarc(0, 0, HTD.rp - 0.006, 0, Math.PI * 2, false);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; spokes.holes.push(circlePath(Math.cos(a) * 0.036, Math.sin(a) * 0.036, 0.014)); }
    spokes.holes.push(circlePath(0, 0, 0.012));
    drv.pump.add(mesh(merge([pumpP]), M.aluMachined), mesh(extrudeX(spokes, 0.004, 0.0006).translate(-0.002, 0, 0), M.aluMachined));
    drv.pump.position.set(HTD.x, PUMP.y, PUMP.z);
    const path = beltPath([{ x: 0, y: 0, r: HTD.rc, s: -1 }, { x: PUMP.fx, y: PUMP.y, r: HTD.rp, s: -1 }], 0.0025);
    const hw = 0.0085;
    const belt = ribbon(path, HTD.x, [[-hw, 0.0038], [hw, 0.0038], [hw, 0.0005], [-hw, 0.0005]], -1);
    g.add(drv.crank, drv.pump, mesh(belt, M.rubber));
    A.add('lube.drive', g, [0.3, -0.04, 0.12], { delay: 0.3 });
  }

  // ---- маслопроводы откачки: из поддона в секции насоса
  {
    const g = new THREE.Group();
    const outlets = OUTLETS;
    const hoses = [], blue = [];
    outlets.forEach((x, i) => {
      const xp = sec[i + 1];
      const a = v3(x, -0.112, 0.196), b = v3(xp, PUMP.y, PUMP.z + PUMP.r + 0.028);
      const c = crv([a, v3(x, -0.112, 0.235), v3((x + xp) / 2, -0.1, 0.285), v3(xp, -0.075, 0.29), b]);
      hoses.push(tube(c, 80, 0.0088, 16));
      for (const [t, sgn] of [[0, -1], [1, 1]]) {
        const p = c.getPoint(t), d = c.getTangent(t).multiplyScalar(sgn);
        blue.push(put(merge([lathe([[0, 0], [0.0108, 0, 1], [0.0108, 0.02, 1], [0.0092, 0.022, 1], [0, 0.022]], 20)]), alignY(p.clone().addScaledVector(d, -0.018), d)));
      }
    });
    // нагнетание: из насоса к фильтру
    const fh = FILTER;
    const c = crv([v3(sec[0], PUMP.y + PUMP.r + 0.028, PUMP.z), v3(sec[0] - 0.01, 0.0, PUMP.z + 0.005), v3(0.1, 0.02, 0.236), v3(0.0, 0.012, 0.236), v3(fh.x + 0.05, fh.y, fh.z)]);
    hoses.push(tube(c, 90, 0.0078, 16));
    for (const [t, sgn] of [[0, -1], [1, 1]]) {
      const p = c.getPoint(t), d = c.getTangent(t).multiplyScalar(sgn);
      blue.push(put(lathe([[0, 0], [0.0098, 0, 1], [0.0098, 0.02, 1], [0.0082, 0.022, 1], [0, 0.022]], 20), alignY(p.clone().addScaledVector(d, -0.018), d)));
    }
    g.add(mesh(merge(hoses), M.braid), mesh(merge(blue), M.anoBlue));
    A.add('lube.lines', g, [0.06, -0.08, 0.46], { delay: 0.2 });
  }

  // ---- масляный фильтр с корпусом
  {
    const g = new THREE.Group();
    const fh = FILTER;
    const alu = [put(roundBox(0.07, 0.03, 0.05, 0.005), mat([fh.x, fh.y, fh.z]))];
    alu.push(put(roundBox(0.03, 0.04, 0.05, 0.004), mat([fh.x, fh.y + 0.002, fh.z - 0.045])));
    const can = lathe([[0, -0.098], [0.02, -0.097], [0.034, -0.09], [0.038, -0.08, 1], [0.038, -0.012, 1], [0.036, -0.004], [0.036, 0, 1], [0.028, 0.002], [0, 0.002]], 48);
    const ribs = [];
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; ribs.push(put(new THREE.BoxGeometry(0.003, 0.012, 0.003), mat([fh.x + Math.cos(a) * 0.0385, fh.y - 0.022, fh.z + Math.sin(a) * 0.0385]))); }
    g.add(mesh(merge(alu), M.aluMachined), mesh(merge([put(can, mat([fh.x, fh.y - 0.015, fh.z])), ...ribs]), M.anoBlack));
    g.add(mesh(put(ring(0.036, 0.0385, 0.012, 48), mat([fh.x, fh.y - 0.07, fh.z])), M.anoBlue));
    A.add('lube.filter', g, [-0.1, -0.14, 0.3], { delay: 0.05 });
  }

  // ---- датчик давления масла на корпусе фильтра
  {
    const g = new THREE.Group();
    const fh = FILTER;
    const m = mat([fh.x - 0.02, fh.y + 0.015, fh.z + 0.01]);
    g.add(mesh(merge([put(hexBolt(0.019, 0.008, false), m), put(lathe([[0, 0.008], [0.0095, 0.008, 1], [0.0095, 0.028, 1], [0.008, 0.03, 1], [0, 0.03]], 24), m)]), M.steel));
    g.add(mesh(put(roundBox(0.014, 0.014, 0.018, 0.003), m.clone().multiply(mat([0, 0.037, 0]))), M.plastic));
    A.add('lube.sender', g, [-0.1, 0.05, 0.36], { delay: 0 });
  }

  model.mover(theta => {
    drv.crank.rotation.x = theta;
    drv.pump.rotation.x = theta * HTD.rc / HTD.rp;
    pumpSpin.rotation.x = theta * HTD.rc / HTD.rp;
  });
}

export const FILTER = { x: -0.075, y: -0.018, z: 0.216 };
const OUTLETS = [0.16, 0.02, -0.17];
