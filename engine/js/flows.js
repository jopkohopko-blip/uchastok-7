// Потоки при работе двигателя: воздух, выхлоп, масло, топливо — светящиеся частицы вдоль путей,
// которые узлы регистрируют через model.flow(). Воздух и выхлоп идут толчками в фазе клапанов.
import * as THREE from 'three';
import { E, cycle, lift, INT, EXH } from './spec.js';
import { crv } from './util.js';

// size — для PointsMaterial: экранный размер = size · (высота / 2) / расстояние.
export const FLOW_KINDS = {
  air: { color: 0x5ec8ff, light: 0x0a7fd6, speed: 0.5, gap: 0.017, size: 0.06, valve: INT },
  exh: { color: 0xff8a3d, light: 0xe05a00, speed: 0.75, gap: 0.019, size: 0.07, valve: EXH },
  oil: { color: 0xe8b64a, light: 0xb57d00, speed: 0.12, gap: 0.02, size: 0.045 },
  fuel: { color: 0xc28bff, light: 0x7a3ce0, speed: 0.07, gap: 0.02, size: 0.04 },
};
const LUT = 256;

export function createFlows(model, tex) {
  const group = new THREE.Group();
  group.name = 'flows';
  group.visible = false;
  const sets = {};
  for (const f of model.flows || []) {
    const K = FLOW_KINDS[f.kind];
    if (!K || f.pts.length < 2) continue;
    const c = crv(f.pts, 0.35);
    const L = c.getLength();
    const lut = c.getSpacedPoints(LUT);
    const n = Math.max(3, Math.round(L / K.gap));
    (sets[f.kind] ||= { K, paths: [] }).paths.push({ lut, L, n, no: f.no, u: Math.random() });
  }
  const mats = [];
  for (const [kind, S] of Object.entries(sets)) {
    const total = S.paths.reduce((a, p) => a + p.n, 0);
    const g = new THREE.BufferGeometry();
    S.pos = new THREE.BufferAttribute(new Float32Array(total * 3), 3).setUsage(THREE.DynamicDrawUsage);
    S.col = new THREE.BufferAttribute(new Float32Array(total * 4).fill(1), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', S.pos);
    g.setAttribute('color', S.col);
    const m = new THREE.PointsMaterial({
      size: S.K.size, map: tex, color: S.K.color, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    m.name = 'flow-' + kind;
    mats.push({ m, K: S.K });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    pts.name = kind;
    group.add(pts);
    S.points = pts;
  }

  const tmp = new THREE.Vector3();
  function update(phi, dt, rate) {
    for (const S of Object.values(sets)) {
      const { K } = S, P = S.pos.array, C = S.col.array;
      let o = 0;
      for (const p of S.paths) {
        const k = K.valve ? lift(cycle(p.no, phi), K.valve) / E.camLift : 1;
        p.u = (p.u + dt * rate * K.speed * (K.valve ? 0.08 + k : 1) / p.L) % 1;
        const glow = K.valve ? 0.18 + 0.82 * k : 0.85;
        for (let i = 0; i < p.n; i++, o++) {
          const t = (i / p.n + p.u) % 1, f = t * LUT, j = Math.min(LUT - 1, f | 0);
          tmp.copy(p.lut[j]).lerp(p.lut[j + 1], f - j);
          P[o * 3] = tmp.x; P[o * 3 + 1] = tmp.y; P[o * 3 + 2] = tmp.z;
          const edge = Math.min(1, t / 0.06, (1 - t) / 0.06);
          C[o * 4 + 3] = glow * edge;
        }
      }
      S.pos.needsUpdate = true;
      S.col.needsUpdate = true;
    }
  }
  function setTheme(dark) {
    for (const { m, K } of mats) {
      m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.color.set(dark ? K.color : K.light);
      m.size = K.size * (dark ? 1 : 0.8);
      m.needsUpdate = true;
    }
  }
  return { group, update, setTheme, materials: mats.map(x => x.m), kinds: Object.keys(sets) };
}
