// Блок цилиндров: два ряда с расточками, картер с перегородками, крышки коренных опор.
import * as THREE from 'three';
import { E, bankFrame, axis } from '../spec.js';
import { mesh } from '../model.js';
import { merge, put, mat, lathe, cyl, extrudeX, extrudeY, polyShape, circlePath, roundRect, hexBolt, DEG } from '../util.js';

// Контур «вид спереди»: shape.x = −z, shape.y = y.
const fv = pts => pts.map(([z, y]) => [-z, y]);
const mirrorZ = pts => pts.map(([z, y]) => [-z, y]);

export const SKIRT = [[0.168, -0.07], [0.168, -0.056], [0.152, -0.05], [0.150, 0.02], [0.136, 0.044], [0.124, 0.038], [0.140, 0.015], [0.142, -0.07]];
export const CASE_OUTLINE = [[0.168, -0.07], [0.168, -0.056], [0.152, -0.05], [0.150, 0.02], [0.136, 0.044], [0, 0.125], [-0.136, 0.044], [-0.150, 0.02], [-0.152, -0.05], [-0.168, -0.056], [-0.168, -0.07]];

export function buildBlock(model) {
  const M = model.M, A = model.asm('block');
  const cast = [], zinc = [], dark = [];
  const casting = new THREE.Group();

  // ---- ряды цилиндров: призмы с расточками, отверстиями под болты ГБЦ и каналами охлаждения
  for (const s of [1, -1]) {
    const xs = E.cyl[s];
    const f = bankFrame(s);
    const sh = polyShape([[E.rear, -0.095], [E.front, -0.095], [E.front, 0.095], [E.rear, 0.095]]);
    for (const x of xs) sh.holes.push(circlePath(x, 0, 0.0497));
    for (const x of boltXs(xs)) for (const u of [-0.085, 0.085]) sh.holes.push(circlePath(x, -u, 0.0062));
    for (const x of xs) for (const dx of [-0.034, 0.034]) for (const u of [-0.064, 0.064]) sh.holes.push(circlePath(x + dx, -u, 0.0042));
    const g = [extrudeY(sh, E.deck - 0.105, 0.0016, 1, 24).translate(0, 0.105, 0)];
    // водяная рубашка — выпуклый пояс по наружной стенке
    g.push(extrudeX(roundRect(0.012, 0.072, 0.005, -0.098, 0.168), E.front - E.rear - 0.03, 0.003).translate(E.rear + 0.015, 0, 0));
    // приливы под шпильки выпускного коллектора ниже головки не нужны; бобышки датчика детонации
    const bank = mesh(merge(g), M.aluCast);
    f.add(bank);
    casting.add(f);
  }

  // ---- картер: юбки, торцевые стенки, перегородки коренных опор
  const skirtR = polyShape(fv(SKIRT)), skirtL = polyShape(fv(mirrorZ(SKIRT)));
  const len = E.front - E.rear;
  cast.push(extrudeX(skirtR, len, 0.002).translate(E.rear, 0, 0));
  cast.push(extrudeX(skirtL, len, 0.002).translate(E.rear, 0, 0));
  for (const [x0, x1] of [[0.22, E.front], [E.rear, -0.22]]) {
    const w = polyShape(fv(CASE_OUTLINE));
    w.holes.push(circlePath(0, 0, 0.036));
    cast.push(extrudeX(w, x1 - x0, 0.0015).translate(x0, 0, 0));
  }
  for (const xm of E.mains) cast.push(extrudeX(bulkhead(), 0.022, 0.0015).translate(xm - 0.011, 0, 0));

  // рёбра жёсткости и стяжные болты на юбках
  for (const xm of E.mains) for (const s of [1, -1]) {
    cast.push(put(ribGeom(), mat([xm, -0.015, s * 0.1545])));
    zinc.push(put(hexBolt(0.013, 0.008), mat([xm, -0.03, s * 0.1585], [s * Math.PI / 2, 0, 0])));
  }
  // площадки опор двигателя
  for (const s of [1, -1]) {
    cast.push(put(extrudeX(roundRect(0.012, 0.05, 0.004), 0.07, 0.003), mat([0.035, -0.012, s * 0.155])));
    for (const [dx, dy] of [[0.012, 0.012], [0.058, 0.012], [0.035, -0.014]]) {
      dark.push(put(cyl(0.0045, 0.0012, 16), mat([0.035 + dx, -0.012 + dy, s * 0.1605], [s * Math.PI / 2, 0, 0])));
    }
  }
  // задний сальник коленвала
  cast.push(put(lathe([[0.036, 0.012], [0.036, 0, 1], [0.064, 0, 1], [0.064, 0.008, 1], [0.052, 0.012, 1], [0.036, 0.012]], 48), mat([E.rear, 0, 0], [0, 0, Math.PI / 2])));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + Math.PI / 6;
    zinc.push(put(hexBolt(0.008, 0.005), mat([E.rear - 0.008, Math.cos(a) * 0.056, Math.sin(a) * 0.056], [0, 0, Math.PI / 2])));
  }
  // заглушки масляных магистралей на заднем торце
  for (const [z, y] of [[0.09, -0.04], [-0.09, -0.04], [0, 0.085]]) zinc.push(put(hexBolt(0.011, 0.005, false), mat([E.rear, y, z], [0, 0, Math.PI / 2])));

  casting.add(mesh(merge(cast), M.aluCast));
  casting.add(mesh(merge(zinc), M.zinc));
  casting.add(mesh(merge(dark), M.hole));
  A.add('block.casting', casting);

  // ---- гильзы цилиндров
  const liner = lathe([[0.0460, E.deck - 0.0004], [0.0460, 0.106, 1], [0.0493, 0.106, 1], [0.0493, E.deck - 0.0004, 1], [0.0460, E.deck - 0.0004]], 56);
  for (const s of [1, -1]) E.cyl[s].forEach((x, i) => {
    const f = bankFrame(s);
    f.add(mesh(put(liner, mat([x, 0, 0])), M.steelPolished));
    A.add('block.liners', f, axis(s).multiplyScalar(0.2 + i * 0.015), { delay: 0.2 + i * 0.08 });
  });

  // ---- крышки коренных подшипников
  const capG = extrudeX(capShape(), 0.022, 0.0015);
  E.mains.forEach((xm, i) => {
    const g = new THREE.Group();
    g.add(mesh(put(capG, mat([xm - 0.011, 0, 0])), M.steel));
    g.add(mesh(merge([-0.046, 0.046].map(z => put(hexBolt(0.012, 0.008, true, 0.07), mat([xm, -0.058, z], [Math.PI, 0, 0])))), M.steelDark));
    A.add('block.mainCaps', g, [0, -0.15, 0], { delay: i * 0.1 });
  });

  // ---- датчики детонации на юбках
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    const body = merge([
      lathe([[0, 0], [0.015, 0, 1], [0.015, 0.004, 1], [0.013, 0.005, 1], [0.013, 0.014, 1], [0.009, 0.016], [0, 0.016]], 32),
      put(roundBox(0.018, 0.012, 0.014), mat([0.014, 0.009, 0])),
    ]);
    g.add(mesh(put(body, mat([-0.053, 0.0, s * 0.151], [s * Math.PI / 2, 0, 0])), M.plastic));
    g.add(mesh(put(hexBolt(0.010, 0.006), mat([-0.053, 0.0, s * 0.167], [s * Math.PI / 2, 0, 0])), M.zinc));
    A.add('block.knock', g, [0, -0.02, s * 0.16], { delay: 0.3 });
  }
}

// Положения болтов ГБЦ вдоль ряда.
export function boltXs(xs) { return [xs[0] + 0.053, ...xs.map(x => x - 0.053)]; }

function bulkhead() {
  const s = new THREE.Shape();
  const P = [[-0.142, -0.07], [-0.142, 0.015], [-0.124, 0.038], [0, 0.118], [0.124, 0.038], [0.142, 0.015], [0.142, -0.07], [0.07, -0.07], [0.07, 0], [0.034, 0]];
  s.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]);
  s.absarc(0, 0, 0.034, 0, Math.PI, false);
  s.lineTo(-0.07, 0); s.lineTo(-0.07, -0.07); s.closePath();
  for (const x of [-0.106, 0.106]) s.holes.push(circlePath(x, -0.026, 0.016));
  for (const x of [-0.064, 0.064]) s.holes.push(circlePath(x, 0.05, 0.012));
  return s;
}

function capShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.066, -0.058); s.lineTo(0.066, -0.058); s.lineTo(0.066, 0); s.lineTo(0.034, 0);
  s.absarc(0, 0, 0.034, 0, Math.PI, true);
  s.lineTo(-0.066, 0); s.closePath();
  return s;
}

function ribGeom() {
  return new THREE.BoxGeometry(0.008, 0.07, 0.008);
}

export function roundBox(w, h, d, r = 0.002) {
  return extrudeX(roundRect(d, h, r), w, r).translate(-w / 2, 0, 0);
}
