// Передняя часть: крышка и цепной привод ГРМ, демпфер, поликлиновой ремень и навесные агрегаты.
// Плоские контуры строятся в координатах «вид спереди»: fx = −z, fy = y.
import * as THREE from 'three';
import { E, bp, camCenter } from '../spec.js';
import { mesh } from '../model.js';
import { merge, put, mat, lathe, cyl, ring, extrudeX, polyShape, circlePath, roundRect, hexBolt, gearShape, beltPath, ribbon, DEG, v3 } from '../util.js';
import { roundBox } from './block.js';

const X0 = E.front, XC = 0.285;         // крышка ГРМ: от блока до лицевой плоскости
const PITCH = 0.008, R_CRANK = 0.02303, R_CAM = 0.0459;
const along = (g, x0) => put(g, mat([x0, 0, 0], [0, 0, -Math.PI / 2]));
const at = (g, x, fx, fy) => put(g, mat([x, fy, -fx], [0, 0, -Math.PI / 2]));

// Центры распредвалов в плоскости «вид спереди».
function camFX(s, intake) {
  const c = camCenter(intake), w = bp(s, 0, c.z, c.y);
  return { fx: -w.z, fy: w.y };
}

export const BELT = {
  wp: { fx: 0, fy: 0.19, r: 0.05 },
  ten: { fx: 0.16, fy: 0.172, r: 0.03 },
  alt: { fx: 0.255, fy: 0.06, r: 0.03 },
  idl: { fx: -0.088, fy: 0.12, r: 0.03 },
  crank: { r: 0.082 },
};

// Шкив с ручьями поликлинового ремня: профиль (r, y) для lathe, ось вдоль Y.
function polyV(r, y0, y1, n = 6, pitch = 0.00356, depth = 0.0024) {
  const pts = [[r - 0.002, y0, 1], [r, y0 + 0.0015, 1]];
  const mid = (y0 + y1) / 2, start = mid - pitch * (n - 1) / 2;
  for (let k = 0; k < n; k++) {
    const c = start + k * pitch;
    pts.push([r, c - pitch / 2], [r - depth, c], [r, c + pitch / 2]);
  }
  pts.push([r, y1 - 0.0015, 1], [r - 0.002, y1, 1]);
  return pts;
}

export function buildFront(model) {
  buildTiming(model);
  buildAccessories(model);
}

// ================================================================ ГРМ
function buildTiming(model) {
  const M = model.M, A = model.asm('timing');
  const cams = { 1: { ex: camFX(1, false), in: camFX(1, true) }, [-1]: { ex: camFX(-1, false), in: camFX(-1, true) } };

  // ---- крышка
  {
    const g = new THREE.Group();
    const R = cams[1], L = cams[-1], rl = 0.058;
    const outline = d => beltPath([
      { x: 0.156, y: -0.123, r: 0.012 - Math.min(d, 0.011), s: 1 },
      { x: 0.156 - d, y: 0.0, r: 0, s: 1 },
      { x: L.ex.fx, y: L.ex.fy, r: rl - d, s: 1 },
      { x: L.in.fx, y: L.in.fy, r: rl - d, s: 1 },
      { x: 0, y: 0.262 - d, r: 0, s: 1 },
      { x: R.in.fx, y: R.in.fy, r: rl - d, s: 1 },
      { x: R.ex.fx, y: R.ex.fy, r: rl - d, s: 1 },
      { x: -0.156 + d, y: 0.0, r: 0, s: 1 },
      { x: -0.156, y: -0.123, r: 0.012 - Math.min(d, 0.011), s: 1 },
    ], 0.003);
    const o0 = outline(0), o1 = outline(0.008);
    const shape0 = polyShape(o0.pts), shape1 = polyShape(o1.pts);
    const alu = [
      extrudeX(shape0, 0.012, 0.0015, 1).translate(X0, 0, 0),
      extrudeX(shape1, XC - X0 - 0.011, 0.006, 3).translate(X0 + 0.011, 0, 0),
    ];
    // бобышки болтов по периметру
    const bolts = [];
    const n = Math.round(o0.length / 0.043);
    for (let k = 0; k < n; k++) {
      const p = o0.sample(k / n * o0.length);
      const fx = p.x + (-p.ty) * 0.0062, fy = p.y + p.tx * 0.0062;
      alu.push(at(cyl(0.0088, 0.022, 20, 0, 0.001), X0 + 0.008, fx, fy));
      bolts.push(at(hexBolt(0.01, 0.0065), X0 + 0.030, fx, fy));
    }
    // улитка водяного насоса, прилив сальника, гнёзда датчиков фаз
    alu.push(at(lathe([[0, 0], [0.062, 0, 1], [0.062, 0.004], [0.056, 0.01, 1], [0.03, 0.012], [0, 0.012]], 64), XC - 0.002, 0, BELT.wp.fy));
    alu.push(at(lathe([[0.022, 0.006], [0.022, 0, 1], [0.05, 0, 1], [0.05, 0.003], [0.045, 0.006, 1], [0.022, 0.006]], 64), XC - 0.001, 0, 0));
    for (const s of [1, -1]) alu.push(at(cyl(0.016, 0.008, 28, 0, 0.0015), XC - 0.002, cams[s].in.fx, cams[s].in.fy));
    // рёбра жёсткости
    const rib = (a, b, h = 0.006) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      const gg = new THREE.BoxGeometry(h * 2, len, 0.007);
      return put(gg, mat([XC, (a[1] + b[1]) / 2, -(a[0] + b[0]) / 2], [Math.atan2(-dx, dy), 0, 0]));
    };
    alu.push(rib([0, 0.045], [0, 0.132]));
    for (const s of [1, -1]) {
      alu.push(rib([s * 0.045, 0.225], [s * 0.105, 0.3]));
      alu.push(rib([s * 0.04, -0.035], [s * 0.125, -0.1]));
      alu.push(rib([s * 0.055, 0.02], [s * 0.14, 0.02]));
    }
    // пробки масляных каналов
    for (const [fx, fy] of [[0.1, -0.06], [-0.1, -0.06], [0.07, 0.1], [-0.07, 0.1]]) bolts.push(at(hexBolt(0.012, 0.004, false), XC + 0.001, fx, fy));
    g.add(mesh(merge(alu), M.aluCast), mesh(merge(bolts), M.zinc));
    A.add('timing.cover', g, [0.26, 0, 0], { delay: 0 });
  }

  // ---- звёздочки распредвалов (вращаются с распредвалами)
  const camSpr = [];
  {
    const shape = gearShape(R_CAM - 0.0026, R_CAM + 0.0032, 36, 0.0115);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; shape.holes.push(circlePath(Math.cos(a) * 0.027, Math.sin(a) * 0.027, 0.0085)); }
    const sprG = merge([extrudeX(shape, 0.008, 0.0006, 1, 8).translate(-0.004, 0, 0), along(cyl(0.017, 0.016, 32, 0, 0.001), -0.008), along(hexBolt(0.016, 0.008), 0.008)]);
    for (const s of [1, -1]) for (const intake of [true, false]) {
      const c = cams[s][intake ? 'in' : 'ex'];
      const grp = new THREE.Group(), spin = new THREE.Group();
      grp.position.set(E.chain[s], c.fy, -c.fx);
      spin.add(mesh(sprG, M.steel));
      grp.add(spin);
      A.add('timing.camSprockets', grp, [0.14, 0.04, -c.fx * 0.25], { delay: 0.35 });
      camSpr.push(spin);
    }
  }

  // ---- ведущая звёздочка коленвала (двухрядная)
  const crankSpr = new THREE.Group();
  {
    const shape = gearShape(R_CRANK - 0.0026, R_CRANK + 0.0032, 18, 0.0205);
    const parts = [along(ring(0.0205, 0.017 + 0.008, 0.034, 32), E.front + 0.004)];
    for (const s of [1, -1]) parts.push(extrudeX(shape, 0.008, 0.0005, 1, 8).translate(E.chain[s] - 0.004, 0, 0));
    crankSpr.add(mesh(merge(parts), M.steel));
    A.add('timing.crankSprocket', crankSpr, [0.18, -0.05, 0], { delay: 0.5 });
  }

  // ---- цепи (инстансы, звенья бегут по контуру)
  const chains = [];
  {
    const plate = (off, t) => [-1, 1].map(k => extrudeX(roundRect(0.0072, PITCH + 0.0072, 0.0036, 0, PITCH / 2), t, 0, 1, 4).translate(k * off - t / 2, 0, 0));
    const roller = along(cyl(0.0024, 0.0092, 8, 0), -0.0046);
    const linkOuter = merge([...plate(0.0041, 0.0011), roller]);
    const linkInner = merge([...plate(0.0029, 0.0011), roller]);
    for (const s of [1, -1]) {
      const c = cams[s];
      const order = s > 0 ? [{ x: 0, y: 0, r: R_CRANK, s: -1 }, { x: c.ex.fx, y: c.ex.fy, r: R_CAM, s: -1 }, { x: c.in.fx, y: c.in.fy, r: R_CAM, s: -1 }]
        : [{ x: 0, y: 0, r: R_CRANK, s: -1 }, { x: c.in.fx, y: c.in.fy, r: R_CAM, s: -1 }, { x: c.ex.fx, y: c.ex.fy, r: R_CAM, s: -1 }];
      const path = beltPath(order, 0.0015);
      const N = Math.round(path.length / PITCH / 2) * 2;
      const g = new THREE.Group();
      const outer = new THREE.InstancedMesh(linkOuter, M.steel, N / 2), inner = new THREE.InstancedMesh(linkInner, M.steelDark, N / 2);
      outer.frustumCulled = inner.frustumCulled = false;
      g.add(outer, inner);
      A.add('timing.chains', g, [0.09, 0, 0], { delay: 0.4 });
      chains.push({ s, path, N, outer, inner, x: E.chain[s], order });
    }
  }
  const m4 = new THREE.Matrix4(), X = new THREE.Vector3(1, 0, 0), Tv = new THREE.Vector3(), Nv = new THREE.Vector3(), P = new THREE.Vector3();
  function layChains(phi) {
    for (const ch of chains) {
      const step = ch.path.length / ch.N, off = phi * DEG * R_CRANK;
      for (let k = 0; k < ch.N; k++) {
        const a = ch.path.sample(k * step + off), b = ch.path.sample(k * step + off + step);
        let tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        Tv.set(0, ty, -tx); Nv.set(0, tx, ty);
        m4.makeBasis(X, Tv, Nv).setPosition(P.set(ch.x, a.y, -a.x));
        (k % 2 ? ch.inner : ch.outer).setMatrixAt(k >> 1, m4);
      }
      ch.outer.instanceMatrix.needsUpdate = ch.inner.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- успокоители (ведущая ветвь) и башмаки натяжителей (ведомая ветвь)
  {
    const g = new THREE.Group(), guides = [], steel = [], tens = [], plung = [];
    for (const ch of chains) {
      // участки: 0 — от коленвала (ведомая), последний — к коленвалу (ведущая)
      const spans = ch.path.tang;
      const slack = spans[0], tight = spans[spans.length - 1];
      for (const [sp, isArm] of [[slack, true], [tight, false]]) {
        const [p0, p1] = [sp.p0, sp.p1];
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;                    // наружу от петли для обхода по часовой — влево
        const pts = [], N = 18, t0 = isArm ? 0.08 : 0.16, t1 = isArm ? 0.8 : 0.86;
        for (let k = 0; k <= N; k++) { const t = t0 + (t1 - t0) * k / N; pts.push([p0[0] + dx * t + nx * 0.0048, p0[1] + dy * t + ny * 0.0048]); }
        for (let k = N; k >= 0; k--) {
          const t = t0 + (t1 - t0) * k / N, w = (isArm ? 0.011 : 0.008) + 0.004 * Math.sin(Math.PI * (k / N));
          pts.push([p0[0] + dx * t + nx * (0.0048 + w), p0[1] + dy * t + ny * (0.0048 + w)]);
        }
        guides.push(extrudeX(polyShape(pts), 0.013, 0.001, 1).translate(ch.x - 0.0065, 0, 0));
        const ends = isArm ? [t0 + 0.02] : [t0 + 0.04, t1 - 0.04];
        for (const t of ends) {
          const fx = p0[0] + dx * t + nx * 0.011, fy = p0[1] + dy * t + ny * 0.011;
          steel.push(at(hexBolt(0.01, 0.006), ch.x + 0.0065, fx, fy));
          steel.push(at(cyl(0.0065, 0.013, 16, 0), ch.x - 0.0065, fx, fy));
        }
        if (isArm) {
          // гидронатяжитель давит на башмак снаружи
          const t = 0.62, w = 0.011 + 0.004 * Math.sin(Math.PI * 0.7);
          const fx = p0[0] + dx * t + nx * (0.0048 + w), fy = p0[1] + dy * t + ny * (0.0048 + w);
          const body = new THREE.Group();
          body.add(mesh(put(roundBox(0.02, 0.03, 0.022, 0.003), mat([ch.x, 0.028, 0])), M.aluCast));
          body.add(mesh(put(cyl(0.0055, 0.016, 16, 0.002), mat([ch.x, 0, 0])), M.steelPolished));
          body.add(mesh(merge([-0.012, 0.012].map(dz => put(hexBolt(0.008, 0.005), mat([ch.x + 0.01, 0.034, dz], [0, 0, -Math.PI / 2])))), M.zinc));
          body.position.set(0, fy, -fx);
          body.rotation.x = Math.atan2(-nx, ny);
          tens.push({ body, fx, fy, nx, ny });
        }
      }
    }
    g.add(mesh(merge(guides), M.guide), mesh(merge(steel), M.zinc));
    A.add('timing.guides', g, [0.18, 0, 0], { delay: 0.25 });
    for (const t of tens) {
      const tg = new THREE.Group();
      tg.add(t.body);
      A.add('timing.tensioners', tg, [0.22, 0, -t.fx * 0.3], { delay: 0.15 });
    }
  }

  // ---- датчики фаз на крышке
  {
    const g = new THREE.Group(), blk = [], grey = [];
    for (const s of [1, -1]) {
      const c = cams[s].in;
      blk.push(at(lathe([[0, 0], [0.0092, 0, 1], [0.0092, 0.022, 1], [0.0075, 0.025, 1], [0, 0.025]], 24), XC + 0.006, c.fx, c.fy));
      blk.push(put(roundBox(0.012, 0.02, 0.028, 0.003), mat([XC + 0.021, c.fy + 0.012, -c.fx])));
      grey.push(put(roundBox(0.004, 0.028, 0.022, 0.002), mat([XC + 0.008, c.fy, -c.fx])));
    }
    g.add(mesh(merge(blk), M.plastic), mesh(merge(grey), M.plasticGrey));
    A.add('timing.camSensors', g, [0.36, 0.05, 0], { delay: 0 });
  }

  // ---- кинематика
  model.mover((theta, phi) => {
    crankSpr.rotation.x = theta;
    for (const sp of camSpr) sp.rotation.x = -phi / 2 * DEG;
    layChains(phi);
  });
}

// ================================================================ навесное
function buildAccessories(model) {
  const M = model.M, A = model.asm('front');
  const XB = E.belt;                      // центр ручьёв

  // ---- демпфер + задающий диск 60−2
  const damper = new THREE.Group();
  {
    const steel = [], rub = [];
    const ringProf = [[0.0665, XB + 0.013, 1], [0.0665, XB - 0.013, 1], ...polyV(0.082, XB - 0.013, XB + 0.013).map(p => [p[0], p[1], p[2]])];
    // ступица, диск, инерционное кольцо
    steel.push(along(lathe([[0.0205, 0], [0.032, 0, 1], [0.032, 0.040, 1], [0.0205, 0.040, 1]], 48), 0.296));
    steel.push(along(ring(0.03, 0.065, 0.006, 64), XB - 0.012));
    const rp = lathe(ringProf.map(p => [p[0], p[1] - XB, p[2]]).concat([[0.0665, 0.013 + 0.0001]]), 96);
    steel.push(along(rp, XB));
    rub.push(along(ring(0.0642, 0.0668, 0.024, 64), XB - 0.012));
    // задающий диск
    const tw = new THREE.Shape();
    const nT = 60, rr = 0.066, rt = 0.071;
    const p = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
    tw.moveTo(...p(0, rr));
    for (let k = 0; k < nT; k++) {
      const a0 = k / nT * Math.PI * 2, a1 = (k + 0.5) / nT * Math.PI * 2;
      if (k < nT - 2) { tw.lineTo(...p(a0 + 0.0005, rt)); tw.lineTo(...p(a1, rt)); tw.lineTo(...p(a1 + 0.0005, rr)); }
      else tw.lineTo(...p(a1, rr));
      if (k < nT - 1) tw.lineTo(...p((k + 1) / nT * Math.PI * 2, rr));
    }
    tw.closePath();
    tw.holes.push(circlePath(0, 0, 0.021));
    steel.push(extrudeX(tw, 0.002, 0).translate(0.2935, 0, 0));
    steel.push(along(hexBolt(0.024, 0.011), 0.357));
    damper.add(mesh(merge(steel), M.steel), mesh(merge(rub), M.rubber));
    A.add('front.damper', damper, [0.2, 0, 0], { delay: 0.35 });
  }

  // ---- поликлиновой ремень
  const beltCircles = [
    { x: BELT.wp.fx, y: BELT.wp.fy, r: BELT.wp.r, s: -1 },
    { x: BELT.ten.fx, y: BELT.ten.fy, r: BELT.ten.r + 0.0045, s: 1 },
    { x: BELT.alt.fx, y: BELT.alt.fy, r: BELT.alt.r, s: -1 },
    { x: 0, y: 0, r: BELT.crank.r, s: -1 },
    { x: BELT.idl.fx, y: BELT.idl.fy, r: BELT.idl.r + 0.0045, s: 1 },
  ];
  {
    const path = beltPath(beltCircles, 0.0025);
    const hw = 0.0107, prof = [[-hw, 0.0045], [hw, 0.0045], [hw, 0.0012]];
    for (let k = 5; k >= 0; k--) { const c = -hw + 0.00178 + k * 0.00356; prof.push([c + 0.00178, 0.0012], [c, -0.0012]); }
    prof.push([-hw, 0.0012]);
    const g = new THREE.Group();
    g.add(mesh(ribbon(path, XB, prof, -1), M.rubber));
    A.add('front.belt', g, [0.34, 0, 0], { delay: 0.1 });
  }

  // ---- генератор
  const altSpin = new THREE.Group();
  {
    const g = new THREE.Group();
    g.position.set(0, BELT.alt.fy, -BELT.alt.fx);
    const body = [], steel = [], dark = [];
    body.push(along(lathe([[0, 0], [0.04, 0.002], [0.056, 0.012], [0.061, 0.022, 1], [0.061, 0.085, 1], [0.065, 0.088, 1], [0.065, 0.096, 1], [0.05, 0.1], [0.022, 0.101, 1], [0.022, 0.114, 1], [0, 0.114]], 48), 0.186));
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2;
      dark.push(put(new THREE.BoxGeometry(0.03, 0.006, 0.003), mat([0.23, Math.cos(a) * 0.0605, Math.sin(a) * 0.0605], [a, 0, 0])));
    }
    // плюсовая клемма
    steel.push(put(cyl(0.004, 0.014, 12, 0), mat([0.19, 0.03, 0.035], [Math.PI / 2 - 0.9, 0, 0])));
    const pul = lathe([[0.012, XB - 0.0145], ...polyV(BELT.alt.r, XB - 0.012, XB + 0.012), [0.012, XB + 0.012]], 48);
    altSpin.add(mesh(merge([along(pul.translate(0, -XB, 0), XB), along(hexBolt(0.017, 0.008), XB + 0.012)]), M.steel));
    const fan = new THREE.Shape(); fan.absarc(0, 0, 0.05, 0, Math.PI * 2, false);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; fan.holes.push(circlePath(Math.cos(a) * 0.034, Math.sin(a) * 0.034, 0.008)); }
    altSpin.add(mesh(extrudeX(fan, 0.003, 0.0005).translate(0.298, 0, 0), M.steelDark));
    g.add(mesh(merge(body), M.anoBlack), mesh(merge(dark), M.hole), mesh(merge(steel), M.anoRed), altSpin);
    // кронштейн к крышке
    const br = new THREE.Shape(); br.moveTo(0.03, -0.034); br.lineTo(-0.02, -0.034); br.lineTo(-0.085, -0.006); br.lineTo(-0.085, 0.024); br.lineTo(0.03, 0.034); br.closePath();
    br.holes.push(circlePath(0, 0, 0.0235));
    g.add(mesh(extrudeX(br, 0.008, 0.0012).translate(XC, 0, 0), M.aluDark));
    A.add('front.alternator', g, [0.3, 0, -0.14], { delay: 0.2 });
  }

  // ---- водяной насос: подшипниковый узел, шкив, патрубок
  const wpSpin = new THREE.Group();
  {
    const g = new THREE.Group();
    g.position.set(0, BELT.wp.fy, 0);
    const alu = [along(lathe([[0, 0], [0.03, 0, 1], [0.03, 0.004], [0.026, 0.006, 1], [0.026, 0.016, 1], [0, 0.016]], 40), XC + 0.008)];
    alu.push(put(lathe([[0.0125, 0.05], [0.0125, 0, 1], [0.0165, 0, 1], [0.0165, 0.036, 1], [0.0185, 0.04], [0.0165, 0.044], [0.0165, 0.05, 1], [0.0125, 0.05]], 28), mat([XC + 0.004, 0.02, -0.046], [-1.16, 0, 0])));
    const pul = lathe([[0.02, XB - 0.0145], [0.03, XB - 0.0145], ...polyV(BELT.wp.r, XB - 0.012, XB + 0.012), [0.02, XB + 0.012]], 64);
    const spokes = new THREE.Shape(); spokes.absarc(0, 0, 0.04, 0, Math.PI * 2, false);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; spokes.holes.push(circlePath(Math.cos(a) * 0.028, Math.sin(a) * 0.028, 0.008)); }
    spokes.holes.push(circlePath(0, 0, 0.012));
    wpSpin.add(mesh(merge([along(pul.translate(0, -XB, 0), XB), extrudeX(spokes, 0.004, 0.0006).translate(XB - 0.002, 0, 0), ...[0, 1, 2, 3].map(k => at(hexBolt(0.008, 0.005), XB + 0.01, Math.cos(k * Math.PI / 2 + 0.4) * 0.017, Math.sin(k * Math.PI / 2 + 0.4) * 0.017))]), M.steel));
    g.add(mesh(merge(alu), M.aluCast), wpSpin);
    A.add('front.waterPump', g, [0.3, 0.12, 0], { delay: 0.2 });
  }

  // ---- натяжитель
  const tenSpin = new THREE.Group();
  {
    const g = new THREE.Group();
    const pv = { fx: 0.118, fy: 0.118 };
    const arm = new THREE.Shape();
    const dx = BELT.ten.fx - pv.fx, dy = BELT.ten.fy - pv.fy, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const pA = (t, w) => [pv.fx + Math.cos(a) * t - Math.sin(a) * w, pv.fy + Math.sin(a) * t + Math.cos(a) * w];
    arm.moveTo(...pA(0, -0.014)); arm.lineTo(...pA(L, -0.012)); arm.lineTo(...pA(L + 0.012, 0)); arm.lineTo(...pA(L, 0.012)); arm.lineTo(...pA(0, 0.014)); arm.lineTo(...pA(-0.014, 0)); arm.closePath();
    const base = [
      at(lathe([[0, 0], [0.024, 0, 1], [0.024, 0.02, 1], [0.02, 0.022, 1], [0, 0.022]], 36), XC, pv.fx, pv.fy),
      extrudeX(arm, 0.007, 0.0012).translate(XB - 0.02, 0, 0),
      at(cyl(0.009, XB - 0.013 - XC, 20, 0), XC, BELT.ten.fx, BELT.ten.fy),
    ];
    g.add(mesh(merge(base), M.aluDark));
    const pul = lathe([[0.012, -0.013], [BELT.ten.r - 0.001, -0.013, 1], [BELT.ten.r, -0.011, 1], [BELT.ten.r, 0.011, 1], [BELT.ten.r - 0.001, 0.013, 1], [0.012, 0.013]], 48);
    tenSpin.add(mesh(merge([pul, put(ring(0.006, 0.02, 0.003, 32), mat([0, 0.013, 0]))]), M.steel));
    tenSpin.position.set(XB, BELT.ten.fy, -BELT.ten.fx);
    tenSpin.rotation.set(0, 0, -Math.PI / 2);
    const bolt = at(hexBolt(0.013, 0.007), XB + 0.016, BELT.ten.fx, BELT.ten.fy);
    g.add(tenSpin, mesh(bolt, M.zinc));
    A.add('front.tensioner', g, [0.3, 0.08, -0.08], { delay: 0.15 });
  }

  // ---- обводной ролик
  const idlSpin = new THREE.Group();
  {
    const g = new THREE.Group();
    g.add(mesh(at(cyl(0.012, XB - 0.013 - XC, 20, 0), XC, BELT.idl.fx, BELT.idl.fy), M.aluDark));
    const pul = lathe([[0.012, -0.013], [BELT.idl.r - 0.001, -0.013, 1], [BELT.idl.r, -0.011, 1], [BELT.idl.r, 0.011, 1], [BELT.idl.r - 0.001, 0.013, 1], [0.012, 0.013]], 48);
    idlSpin.add(mesh(merge([pul, put(ring(0.006, 0.02, 0.003, 32), mat([0, 0.013, 0]))]), M.steel));
    idlSpin.position.set(XB, BELT.idl.fy, -BELT.idl.fx);
    idlSpin.rotation.set(0, 0, -Math.PI / 2);
    g.add(idlSpin, mesh(at(hexBolt(0.013, 0.007), XB + 0.016, BELT.idl.fx, BELT.idl.fy), M.zinc));
    A.add('front.idler', g, [0.3, 0.06, 0.1], { delay: 0.15 });
  }

  // ---- датчик коленвала у задающего диска
  {
    const g = new THREE.Group();
    const ang = -125 * DEG, rr = 0.086;
    const fx = Math.cos(ang) * rr, fy = Math.sin(ang) * rr;
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), v3(0, fy, -fx).normalize());
    const m = new THREE.Matrix4().compose(v3(0.2945, fy, -fx), q, v3(1, 1, 1));
    const body = [put(lathe([[0, -0.012], [0.0065, -0.012, 1], [0.0072, -0.008], [0.0072, 0.016, 1], [0.009, 0.016, 1], [0.009, 0.022, 1], [0, 0.022]], 24), m)];
    body.push(put(roundBox(0.01, 0.014, 0.016, 0.002), m.clone().multiply(mat([0, 0.028, 0]))));
    const br = put(roundBox(0.012, 0.03, 0.02, 0.002), m.clone().multiply(mat([-0.0035, 0.004, 0])));
    g.add(mesh(merge(body), M.plastic), mesh(br, M.aluDark));
    A.add('front.crankSensor', g, [0.26, -0.08, 0], { delay: 0 });
  }

  // ---- кинематика навесного
  model.mover((theta) => {
    damper.rotation.x = theta;
    altSpin.rotation.x = theta * BELT.crank.r / BELT.alt.r;
    wpSpin.rotation.x = theta * BELT.crank.r / BELT.wp.r;
    tenSpin.rotation.x = -theta * BELT.crank.r / BELT.ten.r;
    idlSpin.rotation.x = -theta * BELT.crank.r / BELT.idl.r;
  });
}
