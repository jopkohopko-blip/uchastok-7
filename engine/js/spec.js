// Размеры и кинематика модели. Начало координат — ось коленвала,
// X — вперёд (к ремённому приводу), Y — вверх, Z — вправо (правый ряд).
import * as THREE from 'three';
import { DEG } from './util.js';

export const E = {
  bore: 0.092, stroke: 0.094, R: 0.047, rodL: 0.150, compH: 0.031,
  half: 30 * DEG,                       // половина развала 60°
  deck: 0.230,                          // от оси коленвала до плоскости блока вдоль оси цилиндра
  gasket: 0.0012,
  cyl: { 1: [0.170, 0.064, -0.042, -0.148], [-1]: [0.148, 0.042, -0.064, -0.170] },
  mains: [0.212, 0.106, 0, -0.106, -0.212],
  throws: [0.159, 0.053, -0.053, -0.159],
  throwAng: [0, 90, 270, 180].map(a => a * DEG),
  split: 15 * DEG,                      // разнос шатунных шеек ±15°
  front: 0.24, rear: -0.24,
  valveTilt: 15 * DEG,
  seatV: 0.2362,                        // тарелки клапанов
  valveLen: 0.100,
  camR: 0.018, camLift: 0.0115,
  headTop: 0.3548,                      // разъём постели распредвалов
  chain: { 1: 0.252, [-1]: 0.268 },     // плоскости цепей ГРМ
  belt: 0.318,                          // плоскость поликлинового ремня
  root: 0.185,                          // высота оси коленвала над подиумом
};

// Оси ряда: a — вдоль цилиндра, o — наружу поперёк ряда (для s = +1 правый, −1 левый).
export const axis = s => new THREE.Vector3(0, Math.cos(E.half), s * Math.sin(E.half));
export const outer = s => new THREE.Vector3(0, -Math.sin(E.half), s * Math.cos(E.half));

// Точка в системе ряда: x — вдоль двигателя, u — наружу, v — вдоль цилиндра.
export function bp(s, x, u, v) {
  const c = Math.cos(E.half), sn = Math.sin(E.half);
  return new THREE.Vector3(x, v * c - u * sn, s * (v * sn + u * c));
}

// Группа-«ряд»: внутри неё геометрия строится как для правого ряда
// (y — вдоль цилиндра, z — наружу); левый ряд получается зеркалом.
export function bankFrame(s) {
  const g = new THREE.Group();
  g.rotation.x = s * E.half;
  if (s < 0) g.scale.z = -1;
  return g;
}

// Направление вдоль клапана (вверх, к распредвалу) в системе ряда.
export function valveDir(intake) {
  const t = E.valveTilt;
  return new THREE.Vector3(0, Math.cos(t), intake ? -Math.sin(t) : Math.sin(t));
}
// Положение тарелок клапанов (x, z) относительно центра цилиндра.
export const VALVES = {
  in: { dx: 0.0205, u: -0.0185, r: 0.0185 },
  ex: { dx: 0.0175, u: 0.0175, r: 0.0160 },
};
export function valveSeat(xc, intake, k) {
  const V = intake ? VALVES.in : VALVES.ex;
  return new THREE.Vector3(xc + (k ? V.dx : -V.dx), E.seatV, V.u);
}
// Центр распредвала в системе ряда.
export function camCenter(intake) {
  const seat = valveSeat(0, intake, 0);
  const d = valveDir(intake);
  return seat.addScaledVector(d, E.valveLen + 0.004 + E.camR);
}

// ---------------------------------------------------------------- фазы

// Номер цилиндра: правый ряд 1–4 спереди назад, левый 5–8.
export const cylNo = (s, i) => (s > 0 ? 1 : 5) + i;
export const FIRING = [1, 5, 4, 8, 7, 2, 6, 3];
// Угол φ (растёт при вращении по часовой, если смотреть спереди), при котором цилиндр в ВМТ такта сжатия.
export const FIRE = { 1: -45, 5: 45, 4: 135, 8: 225, 7: 315, 2: 405, 6: 495, 3: 585 };
export const EXH = { open: 110, close: 390 };
export const INT = { open: 330, close: 600 };

export function cycle(no, phiDeg) {
  return (((phiDeg - FIRE[no]) % 720) + 720) % 720;
}
export function lift(alpha, w) {
  let a = alpha - w.open;
  if (a < 0) a += 720;
  const dur = w.close - w.open;
  if (a > dur) return 0;
  return E.camLift * (0.5 - 0.5 * Math.cos(2 * Math.PI * a / dur));
}
export const peak = w => (w.open + w.close) / 2;

// Положение поршня (палец) вдоль оси цилиндра и точка шатунной шейки
// в повёрнутой (не зеркальной) системе ряда при угле коленвала θ (поворот вокруг +X).
export function slider(s, i, theta) {
  const psi = E.throwAng[i] - s * E.split;          // шейка в покое
  const w = psi + theta - s * E.half;              // угол шейки от оси цилиндра
  const py = E.R * Math.cos(w), pz = E.R * Math.sin(w);
  const sl = py + Math.sqrt(E.rodL * E.rodL - E.R * E.R * Math.sin(w) * Math.sin(w));
  return { pin: sl, cy: py, cz: pz };
}
