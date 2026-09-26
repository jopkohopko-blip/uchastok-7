// Маховик и многодисковое сцепление на заднем фланце коленвала.
import * as THREE from 'three';
import { mesh } from '../model.js';
import { merge, put, mat, lathe, extrudeX, polyShape, circlePath, gearShape, hexBolt, DEG } from '../util.js';

const X = -0.262;                                   // задний торец фланца коленвала
const back = (g, x0) => put(g, mat([x0, 0, 0], [0, 0, Math.PI / 2])); // lathe Y → −X
const slab = (shape, x0, t, b = 0.0006) => extrudeX(shape, t, b, 1, 48).translate(x0 - t, 0, 0); // от x0 назад

function annulus(r0, r1) {
  const s = new THREE.Shape(); s.absarc(0, 0, r1, 0, Math.PI * 2, false);
  s.holes.push(circlePath(0, 0, r0));
  return s;
}

export function buildClutch(model) {
  const M = model.M, A = model.asm('clutch');
  const spins = [];
  const piece = (key, meshes, off, delay) => {
    const g = new THREE.Group(), sp = new THREE.Group();
    meshes.forEach(m => sp.add(m));
    g.add(sp); spins.push(sp);
    A.add(key, g, off, { delay });
  };

  // ---- маховик с венцом
  {
    const d = annulus(0.021, 0.088);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; d.holes.push(circlePath(Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.0056)); }
    for (let k = 0; k < 6; k++) { const a = (k + 0.5) / 6 * Math.PI * 2; d.holes.push(circlePath(Math.cos(a) * 0.066, Math.sin(a) * 0.066, 0.0085)); }
    const steel = [slab(d, X, 0.012, 0.001), slab(gearShape(0.0895, 0.0955, 96, 0.0875), X - 0.0015, 0.009, 0)];
    const face = slab(annulus(0.038, 0.074), X - 0.012, 0.0006, 0);
    piece('clutch.flywheel', [mesh(merge(steel), M.steel), mesh(face, M.steelPolished)], [-0.06, 0, 0], 0.7);
  }

  // ---- ведомые диски и промежуточные
  const x1 = X - 0.0125;
  const lugged = () => {
    const pts = [];
    for (let k = 0; k < 180; k++) {
      const a = k / 180 * Math.PI * 2, m = ((a / (Math.PI * 2) * 6) % 1);
      const r = (m < 0.07 || m > 0.93) ? 0.078 : 0.0695;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const s = polyShape(pts); s.holes.push(circlePath(0, 0, 0.034));
    return s;
  };
  const discG = merge([slab(annulus(0.03, 0.0695), 0, 0.004), back(lathe([[0.0125, 0], [0.026, 0, 1], [0.026, 0.012, 1], [0.0125, 0.012, 1]], 36), 0.004)]);
  const hubG = gearShape(0.012, 0.0135, 22, 0);
  const plateG = slab(lugged(), 0, 0.003);
  let x = x1;
  for (let k = 0; k < 3; k++) {
    const g = put(discG, mat([x, 0, 0]));
    piece('clutch.discs', [mesh(g, M.friction), mesh(put(slab(hubG, 0.004, 0.012, 0), mat([x, 0, 0])), M.steelDark)], [-0.13 - k * 0.05, 0, 0], 0.45 - k * 0.05);
    x -= 0.004;
    if (k < 2) {
      piece('clutch.plates', [mesh(put(plateG, mat([x, 0, 0])), M.steel)], [-0.155 - k * 0.05, 0, 0], 0.42 - k * 0.05);
      x -= 0.003;
    }
  }

  // ---- корзина: кольцо с окнами, фланец, диафрагменная пружина
  {
    const alu = [back(lathe([[0.0745, 0.0005], [0.0745, 0.026, 1], [0.0405, 0.026, 1], [0.0405, 0.031, 1], [0.0865, 0.031, 1], [0.0865, 0.0055, 1], [0.092, 0.0055, 1], [0.092, 0.0005, 1], [0.0745, 0.0005]], 96), x1)];
    const dark = [];
    for (let k = 0; k < 6; k++) {
      const a = (k + 0.5) / 6 * Math.PI * 2;
      dark.push(put(new THREE.BoxGeometry(0.014, 0.0012, 0.026), mat([x1 - 0.018, Math.cos(a) * 0.0868, Math.sin(a) * 0.0868], [a - Math.PI / 2, 0, 0])));
    }
    const dia = [];
    for (let k = 0; k < 18; k++) {
      const a = k / 18 * Math.PI * 2;
      const f = new THREE.Shape(); f.moveTo(0.021, -0.004); f.lineTo(0.0405, -0.0055); f.lineTo(0.0405, 0.0055); f.lineTo(0.021, 0.004); f.closePath();
      dia.push(put(extrudeX(f, 0.0014, 0.0003, 1, 4), mat([x1 - 0.029, 0, 0], [a, 0, 0])));
    }
    piece('clutch.cover', [mesh(merge(alu), M.aluMachined), mesh(merge(dark), M.hole), mesh(merge(dia), M.steelDark)], [-0.27, 0, 0], 0.2);
  }

  // ---- болты
  {
    const b = [];
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; b.push(back(hexBolt(0.012, 0.007), X - 0.012).applyMatrix4(new THREE.Matrix4().makeTranslation(0, Math.cos(a) * 0.03, Math.sin(a) * 0.03))); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.push(back(hexBolt(0.011, 0.006), x1 - 0.0055).applyMatrix4(new THREE.Matrix4().makeTranslation(0, Math.cos(a) * 0.0835, Math.sin(a) * 0.0835))); }
    piece('clutch.bolts', [mesh(merge(b), M.steelDark)], [-0.34, 0, 0], 0);
  }

  model.mover(theta => { for (const s of spins) s.rotation.x = theta; });
}
