// 3D-мир: реальные дома и улицы из OSM, машины нарядов, метки вызовов, слой преступности, день и ночь.
// Координаты карты: x — восток, y — север (метры). В three.js: x = x, z = −y, высота — y.
import * as THREE from 'three';
import {inShape} from './osm.js?v=6';
import {buildHouses, facadeMaterial, EQUIP} from './houses.js?v=6';

const ROAD_W = {motorway: 16, trunk: 14, primary: 13, secondary: 11, tertiary: 9, unclassified: 7, residential: 7, living_street: 6, service: 4.2, pedestrian: 8};
const ROAD_C = {motorway: '#6a7077', trunk: '#6a7077', primary: '#666c73', secondary: '#61676e', tertiary: '#5c6269', unclassified: '#565c63', residential: '#565c63', living_street: '#5b5f63', service: '#4f5459', pedestrian: '#7b7466'};
const ROAD_ORD = {motorway: 6, trunk: 6, primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, living_street: 1, service: 0, pedestrian: 1};
const C = new THREE.Color();
const clamp01 = v => Math.max(0, Math.min(1, v));

// Качество графики: доля пикселей экрана и тени. Сглаживание включается при создании и меняется только перезагрузкой.
export const QUALITY = {
  high: {n: 'высокая', dpr: 1.5, shadow: 2048, blur: 5},
  medium: {n: 'средняя', dpr: 1, shadow: 1024, blur: 3},
  low: {n: 'низкая', dpr: .75, shadow: 0, blur: 0}
};

function makeTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = makeTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const iconCache = new Map();
function iconTex(bg, glyph, fg = '#fff', ring = '#fff') {
  const key = bg + glyph + fg + ring;
  if (!iconCache.has(key)) iconCache.set(key, makeTex(128, 128, (g) => {
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(66, 68, 52, 0, 7); g.fill();
    g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.fill();
    g.lineWidth = 7; g.strokeStyle = ring; g.stroke();
    g.fillStyle = fg; g.font = `700 ${glyph.length > 1 && !/\p{Extended_Pictographic}/u.test(glyph) ? 52 : 60}px Rubik, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, 64, 68);
  }));
  return iconCache.get(key);
}
const labelCache = new Map();
function labelTex(text, bg) {
  const key = text + bg;
  if (!labelCache.has(key)) labelCache.set(key, makeTex(128, 64, (g) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(6, 10, 116, 44, 14); g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
    g.fillStyle = '#fff'; g.font = '700 30px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 33);
  }));
  return labelCache.get(key);
}
const vec2 = f => { const a = []; for (let i = 0; i < f.length; i += 2) a.push(new THREE.Vector2(f[i], f[i + 1])); return a; };

export class World {
  constructor(canvas, map, quality = 'medium') {
    this.map = map; this.R = map.r;
    const r = this.renderer = new THREE.WebGLRenderer({canvas, antialias: quality !== 'low', powerPreference: 'high-performance'});
    r.shadowMap.enabled = true; r.shadowMap.autoUpdate = false; // тени перерисовываем, только когда сдвинулось солнце
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 5, 7000);
    this.scene.fog = new THREE.Fog(0x9fbad2, 1400, 4200);
    this.sky = new THREE.Color(); this.scene.background = this.sky;
    this.fac = {uNight: {value: 0}, uLit: {value: 0}, uSky: {value: this.sky}}; // общие параметры шейдера фасадов
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x3a3326, .9); this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
    const s = sun.shadow.camera, R = this.R * 1.15;
    s.left = -R; s.right = R; s.top = R; s.bottom = -R; s.near = 10; s.far = this.R * 6;
    sun.shadow.bias = -.0002; sun.shadow.normalBias = .4;
    this.scene.add(sun, sun.target);
    this.moon = new THREE.DirectionalLight(0x8fb0ff, 0); this.moon.position.set(-300, 600, 400); this.scene.add(this.moon);
    this.ray = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.buildGround(); this.buildAreas(); this.buildRoads(); this.buildBuildings(); this.buildTrees(); this.buildLights(); this.buildOverlay();
    this.units = new Map(); this.markers = new Map(); this.zoneGroup = new THREE.Group(); this.scene.add(this.zoneGroup);
    this.hover = -1; this.sel = -1; this.pings = [];
    this.rect = {left: 0, top: 0, width: 1, height: 1};
    this.setQuality(quality);
  }

  /* ---------- качество графики ---------- */
  setQuality(q) {
    const Q = QUALITY[q] || QUALITY.medium, r = this.renderer;
    this.quality = q;
    r.setPixelRatio(Math.min(devicePixelRatio, Q.dpr));
    this.shadowsOn = Q.shadow > 0;
    r.shadowMap.enabled = this.shadowsOn;
    // VSM: одна выборка тени на пиксель вместо 17 у PCF; мягкость даёт размытие, а оно считается только при обновлении теней
    r.shadowMap.type = THREE.VSMShadowMap;
    this.sun.castShadow = this.shadowsOn;
    this.sun.shadow.radius = Q.blur; this.sun.shadow.blurSamples = 8;
    if (this.shadowsOn && this.sun.shadow.mapSize.x !== Q.shadow) {
      this.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.bMat.defines = q === 'low' ? {FACADE_LOW: ''} : {}; // на низкой графике окна рисуются упрощённо
    this.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    r.shadowMap.needsUpdate = true;
    if (this.w) this.resize(this.w, this.h);
  }

  /* ---------- земля, вода, парки ----------
     Плоские слои не пишут глубину и рисуются строго по порядку (renderOrder): земля → парки → вода → дороги.
     Так они никогда не рябят друг о друга, как бы далеко ни была камера. Рисуются после домов и деревьев:
     закрытые стенами места отсекаются проверкой глубины и не красятся зря. */
  flat(geo, mat, order, shadow = true) {
    mat.depthWrite = false;
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order; m.receiveShadow = shadow;
    this.scene.add(m);
    return m;
  }
  buildGround() {
    // земля вокруг района — кольцом, чтобы не закрашивать экран дважды под диском района
    const outer = this.flat(new THREE.RingGeometry(this.R * 1.05, this.R * 7, 96, 1), new THREE.MeshLambertMaterial({color: 0x1d2521}), 1, false);
    const disk = this.flat(new THREE.CircleGeometry(this.R * 1.06, 96), new THREE.MeshLambertMaterial({color: 0x454a44}), 2);
    outer.rotation.x = disk.rotation.x = -Math.PI / 2;
    const edge = new THREE.Mesh(new THREE.RingGeometry(this.R * 1.06, this.R * 1.075, 128), new THREE.MeshBasicMaterial({color: 0x8fb7cc, transparent: true, opacity: .35, depthWrite: false}));
    edge.rotation.x = -Math.PI / 2; edge.position.y = .01;
    this.scene.add(edge);
  }
  areaGeometry(list) {
    const pos = [];
    for (const s of list) {
      const outer = vec2(s.p), holes = (s.hl || []).map(vec2);
      let faces;
      try { faces = THREE.ShapeUtils.triangulateShape(outer, holes); } catch (e) { continue; }
      const all = outer.concat(...holes);
      for (const f of faces) for (const k of f) pos.push(all[k].x, 0, -all[k].y);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    return g;
  }
  buildAreas() {
    this.flat(this.areaGeometry(this.map.g), new THREE.MeshLambertMaterial({color: 0x557d4c, side: THREE.DoubleSide}), 3);
    this.flat(this.areaGeometry(this.map.w), new THREE.MeshLambertMaterial({color: 0x3f6f8f, emissive: 0x0b2233, side: THREE.DoubleSide}), 4);
  }

  /* ---------- дороги: сплошные ленты, одна общая геометрия; крупные улицы ложатся поверх мелких ----------
     На изгибах края сходятся «в ус» (без щелей и без лишней перерисовки), круглые стыки — только на крутых поворотах и концах. */
  buildRoads() {
    const pos = [], col = [];
    const push = (x, z, c) => { pos.push(x, 0, -z); col.push(c.r, c.g, c.b); };
    const disk = (x, z, hw, c) => {
      for (let s = 0; s < 8; s++) {
        const a1 = s / 8 * Math.PI * 2, a2 = (s + 1) / 8 * Math.PI * 2;
        push(x, z, c); push(x + Math.cos(a1) * hw, z + Math.sin(a1) * hw, c); push(x + Math.cos(a2) * hw, z + Math.sin(a2) * hw, c);
      }
    };
    const roads = [...this.map.rd].sort((a, b) => (ROAD_ORD[a.k.replace('_link', '')] ?? 0) - (ROAD_ORD[b.k.replace('_link', '')] ?? 0));
    for (const rd of roads) {
      const base = rd.k.replace('_link', ''), link = rd.k.endsWith('_link');
      const hw = (ROAD_W[base] ?? 6) * (link ? .8 : 1) / 2, c = new THREE.Color(ROAD_C[base] ?? '#565c63');
      const p = [];
      for (let i = 0; i < rd.p.length; i += 2) { // без повторяющихся точек — иначе лента схлопнется
        const x = rd.p[i], y = rd.p[i + 1];
        if (!p.length || Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) > .05) p.push(x, y);
      }
      const n = p.length / 2;
      if (n < 2) continue;
      const sn = []; // нормали отрезков
      for (let i = 0; i < n - 1; i++) { const dx = p[i * 2 + 2] - p[i * 2], dy = p[i * 2 + 3] - p[i * 2 + 1], L = Math.hypot(dx, dy); sn.push([-dy / L, dx / L]); }
      const Lp = [], Rp = [];
      for (let i = 0; i < n; i++) {
        const x = p[i * 2], y = p[i * 2 + 1];
        let mx, my, k = hw;
        if (i === 0) [mx, my] = sn[0];
        else if (i === n - 1) [mx, my] = sn[n - 2];
        else {
          const a = sn[i - 1], b = sn[i];
          mx = a[0] + b[0]; my = a[1] + b[1];
          const ml = Math.hypot(mx, my);
          if (ml < 1e-6) { mx = a[0]; my = a[1]; } else { mx /= ml; my /= ml; }
          k = hw / Math.max(mx * a[0] + my * a[1], .5); // длина «уса», не больше двух полуширин
          if (a[0] * b[0] + a[1] * b[1] < .5) disk(x, y, hw, c); // поворот круче 60° — закругляем
        }
        Lp.push(x + mx * k, y + my * k); Rp.push(x - mx * k, y - my * k);
      }
      for (let i = 0; i < n - 1; i++) {
        const j = i * 2, q = j + 2;
        push(Lp[j], Lp[j + 1], c); push(Rp[j], Rp[j + 1], c); push(Rp[q], Rp[q + 1], c);
        push(Lp[j], Lp[j + 1], c); push(Rp[q], Rp[q + 1], c); push(Lp[q], Lp[q + 1], c);
      }
      disk(p[0], p[1], hw, c); disk(p[n * 2 - 2], p[n * 2 - 1], hw, c); // концы — на перекрёстках
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    this.flat(g, new THREE.MeshLambertMaterial({vertexColors: true, side: THREE.DoubleSide}), 5);
  }

  /* ---------- дома: фасады с окнами, парапеты, скатные крыши — см. houses.js ---------- */
  buildBuildings() {
    const H = buildHouses(this.map);
    this.bGeo = H.geometry; this.part = H.part; this.bStart = H.bStart; this.bEnd = H.bEnd;
    this.bh = H.bh; this.bb = H.bb; this.wallCol = H.wallCol; this.roofCol = H.roofCol;
    this.bState = this.map.b.map(() => ({role: null, gang: false}));
    for (let i = 0; i < this.map.b.length; i++) this.paint(i, false);
    const mesh = this.bMesh = new THREE.Mesh(this.bGeo, this.bMat = facadeMaterial(this.fac));
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
  }
  // итоговый цвет дома: базовый → роль полиции → банда на крыше → выбор/наведение
  paint(i, upload = true) {
    const st = this.bState[i], attr = this.bGeo.attributes.color, col = attr.array, part = this.part;
    const cols = [this.wallCol[i].clone(), this.roofCol[i].clone(), this.roofCol[i].clone().lerp(EQUIP, .55)]; // стены, крыша, короба
    for (let k = 0; k < 3; k++) {
      const c = cols[k], roof = k > 0;
      if (st.role) c.lerp(C.set(st.role), roof ? .7 : .45);
      if (st.gang) c.lerp(C.set(roof ? 0xb3263a : 0x6b2a33), roof ? .55 : .2);
      if (i === this.sel) c.lerp(C.set(roof ? 0xfff3c4 : 0xffffff), roof ? .5 : .35);
      else if (i === this.hover) c.lerp(C.set(0xffffff), roof ? .25 : .2);
    }
    for (let v = this.bStart[i]; v < this.bEnd[i]; v++) { const c = cols[part[v]]; col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
    if (upload) { attr.addUpdateRange(this.bStart[i] * 3, (this.bEnd[i] - this.bStart[i]) * 3); attr.needsUpdate = true; } // на видеокарту — только этот дом
  }
  setRole(i, color) { this.bState[i].role = color; this.paint(i); }
  setGang(i, on) { if (this.bState[i].gang !== on) { this.bState[i].gang = on; this.paint(i); } }
  setHover(i) { if (i === this.hover) return; const o = this.hover; this.hover = i; if (o >= 0) this.paint(o); if (i >= 0) this.paint(i); }
  setSelected(i) { if (i === this.sel) return; const o = this.sel; this.sel = i; if (o >= 0) this.paint(o); if (i >= 0) this.paint(i); }

  /* ---------- деревья в парках ---------- */
  buildTrees() {
    const pts = [];
    for (const s of this.map.g) {
      const p = s.p;
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (let i = 0; i < p.length; i += 2) { minx = Math.min(minx, p[i]); maxx = Math.max(maxx, p[i]); miny = Math.min(miny, p[i + 1]); maxy = Math.max(maxy, p[i + 1]); }
      const area = (maxx - minx) * (maxy - miny), cnt = Math.min(90, Math.floor(area / 260));
      for (let k = 0, tries = 0; k < cnt && tries < cnt * 4; tries++) {
        const x = minx + Math.random() * (maxx - minx), y = miny + Math.random() * (maxy - miny);
        if (inShape(x, y, s)) { pts.push(x, y); k++; }
      }
      if (pts.length > 5000) break;
    }
    const n = pts.length / 2;
    if (!n) return;
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({color: 0xffffff}), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = 2.6 + Math.random() * 2.4;
      p3.set(pts[i * 2], s * 1.1, -pts[i * 2 + 1]); sc.set(s, s * 1.15, s);
      mesh.setMatrixAt(i, m.compose(p3, q, sc));
      mesh.setColorAt(i, C.setHSL(.27 + Math.random() * .06, .35, .26 + Math.random() * .1));
    }
    mesh.castShadow = true;
    this.scene.add(mesh);
  }

  /* ---------- фонари: светятся ночью ---------- */
  buildLights() {
    const pos = [];
    for (const rd of this.map.rd) {
      const base = rd.k.replace('_link', '');
      if (base === 'service') continue;
      const hw = (ROAD_W[base] ?? 6) / 2 + 1.5, p = rd.p;
      let acc = 18, side = 1;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const x1 = p[i], y1 = p[i + 1], x2 = p[i + 2], y2 = p[i + 3], L = Math.hypot(x2 - x1, y2 - y1);
        if (!L) continue;
        for (let d = acc; d < L; d += 38) {
          const t = d / L, nx = -(y2 - y1) / L * hw * side, ny = (x2 - x1) / L * hw * side;
          pos.push(x1 + (x2 - x1) * t + nx, 6, -(y1 + (y2 - y1) * t + ny)); side = -side;
          acc = d + 38;
        }
        acc -= L;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.lamps = new THREE.Points(g, new THREE.PointsMaterial({size: 15, map: glowTex, color: 0xffcf8a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending}));
    this.lamps.visible = false;
    this.scene.add(this.lamps);
  }

  /* ---------- слой преступности: клетки 50 м, красное пятно там, где правят банды ---------- */
  buildOverlay() {
    this.ovCanvas = document.createElement('canvas');
    this.ovTex = new THREE.CanvasTexture(this.ovCanvas);
    this.ovTex.colorSpace = THREE.SRGBColorSpace;
    this.ovMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({map: this.ovTex, transparent: true, depthWrite: false, opacity: .8}));
    this.ovMesh.rotation.x = -Math.PI / 2; this.ovMesh.position.y = .35; this.ovMesh.renderOrder = 2;
    this.scene.add(this.ovMesh);
  }
  setCrime(grid) {
    const {N, cell, o, c, inside} = grid, cv = this.ovCanvas;
    if (cv.width !== N) { cv.width = cv.height = N; this.ovMesh.scale.set(N * cell, N * cell, 1); this.ovMesh.position.set(o + N * cell / 2, .35, -(o + N * cell / 2)); }
    const g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = inside[j * N + i] ? c[j * N + i] : 0, px = ((N - 1 - j) * N + i) * 4; // строки канваса идут с севера на юг
      const a = v < 35 ? 0 : v < 70 ? (v - 35) / 35 * .32 : .45 + (v - 70) / 30 * .25;
      d[px] = v >= 70 ? 214 : 235; d[px + 1] = v >= 70 ? 40 : 150; d[px + 2] = 60; d[px + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    this.ovTex.needsUpdate = true;
  }
  showCrime(on) { this.ovMesh.visible = on; }

  /* ---------- зоны контроля участка и опорных пунктов ---------- */
  setZones(zones) {
    for (const m of this.zoneGroup.children) { m.geometry.dispose(); m.material.dispose(); }
    this.zoneGroup.clear();
    for (const z of zones) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 2.5, z.r, 128), new THREE.MeshBasicMaterial({color: z.color, transparent: true, opacity: .55, depthWrite: false}));
      const fill = new THREE.Mesh(new THREE.CircleGeometry(z.r, 96), new THREE.MeshBasicMaterial({color: z.color, transparent: true, opacity: .06, depthWrite: false}));
      for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; m.position.set(z.x, .4, -z.y); m.renderOrder = 3; this.zoneGroup.add(m); }
    }
  }

  /* ---------- машины нарядов ---------- */
  makeCar() {
    const g = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({color: 0xf2f5f9}), blue = new THREE.MeshLambertMaterial({color: 0x2f6fe0}), glass = new THREE.MeshLambertMaterial({color: 0x26303c});
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.2, 2), white); body.position.y = .9;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.64, .34, 2.04), blue); stripe.position.y = .95;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, .85, 1.8), glass); cab.position.set(-.2, 1.9, 0);
    const red = new THREE.MeshBasicMaterial({color: 0x5a1a22}), blu = new THREE.MeshBasicMaterial({color: 0x17305e});
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(.5, .28, .8), red); l1.position.set(-.2, 2.45, -.45);
    const l2 = new THREE.Mesh(new THREE.BoxGeometry(.5, .28, .8), blu); l2.position.set(-.2, 2.45, .45);
    // своя мягкая тень под машиной: карта теней обновляется редко и за машинами бы не успевала
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), new THREE.MeshBasicMaterial({map: glowTex, color: 0x000000, transparent: true, opacity: .55, depthWrite: false}));
    blob.rotation.x = -Math.PI / 2; blob.position.y = .08; blob.renderOrder = 1;
    g.add(blob, body, stripe, cab, l1, l2);
    g.scale.setScalar(2.4);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, color: 0xff3b4d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
    glow.scale.set(34, 34, 1); glow.position.y = 7;
    const ring = new THREE.Mesh(new THREE.RingGeometry(10, 12.5, 40), new THREE.MeshBasicMaterial({color: 0xb6ff5c, transparent: true, opacity: .9, depthWrite: false}));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .6; ring.renderOrder = 4;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({depthTest: false, transparent: true, sizeAttenuation: false}));
    label.scale.set(.042, .021, 1); label.position.y = 14; label.renderOrder = 10;
    const root = new THREE.Group(); root.add(g, glow, ring, label);
    this.scene.add(root);
    return {root, car: g, glow, ring, label, l1, l2, red, blu, heading: 0, labelKey: ''};
  }
  syncUnits(list, selIds, t) {
    const seen = new Set();
    for (const u of list) {
      seen.add(u.id);
      let o = this.units.get(u.id);
      if (!o) { o = this.makeCar(); this.units.set(u.id, o); }
      o.root.position.set(u.x, 0, -u.y);
      let dh = u.heading - o.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      o.heading += dh * .2;
      o.car.rotation.y = o.heading;
      const siren = u.siren, ph = Math.floor(t * 5) % 2;
      o.glow.visible = siren;
      if (siren) { o.glow.material.color.set(ph ? 0xff3b4d : 0x3d8bff); o.red.color.set(ph ? 0xff2a3d : 0x5a1a22); o.blu.color.set(ph ? 0x17305e : 0x3f8cff); }
      else { o.red.color.set(0x5a1a22); o.blu.color.set(0x17305e); }
      o.ring.visible = selIds.has(u.id);
      const key = u.label + u.labelBg;
      if (o.labelKey !== key) { o.label.material.map = labelTex(u.label, u.labelBg); o.label.material.needsUpdate = true; o.labelKey = key; }
    }
    for (const [id, o] of this.units) if (!seen.has(id)) { this.scene.remove(o.root); this.units.delete(id); }
  }

  /* ---------- метки вызовов и притонов ---------- */
  syncMarkers(list, t) {
    const seen = new Set();
    for (const m of list) {
      seen.add(m.id);
      let o = this.markers.get(m.id);
      if (!o) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({depthTest: false, transparent: true, sizeAttenuation: false}));
        sp.renderOrder = 11;
        const ring = new THREE.Mesh(new THREE.RingGeometry(12, 15, 40), new THREE.MeshBasicMaterial({transparent: true, depthWrite: false}));
        ring.rotation.x = -Math.PI / 2; ring.renderOrder = 4;
        this.scene.add(sp, ring);
        o = {sp, ring, key: ''};
        this.markers.set(m.id, o);
      }
      if (o.key !== m.icon.bg + m.icon.glyph + m.icon.fg) { o.sp.material.map = iconTex(m.icon.bg, m.icon.glyph, m.icon.fg, m.icon.ring); o.sp.material.needsUpdate = true; o.key = m.icon.bg + m.icon.glyph + m.icon.fg; }
      const pulse = m.pulse ? 1 + Math.sin(t * (m.fast ? 9 : 5)) * .12 : 1;
      o.sp.position.set(m.x, m.h + 10, -m.y); o.sp.scale.set(.05 * pulse, .05 * pulse, 1);
      o.ring.position.set(m.x, .45, -m.y);
      o.ring.material.color.set(m.icon.bg);
      o.ring.material.opacity = m.pulse ? .45 + Math.sin(t * 5) * .3 : .5;
      const rs = m.pulse ? 1 + ((t * .8) % 1) * .8 : 1; o.ring.scale.set(rs, rs, 1);
    }
    for (const [id, o] of this.markers) if (!seen.has(id)) { this.scene.remove(o.sp, o.ring); o.sp.material.dispose(); o.ring.geometry.dispose(); o.ring.material.dispose(); this.markers.delete(id); }
  }

  /* ---------- отклик на приказ: расходящееся кольцо на земле ---------- */
  ping(x, y, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(7, 10, 40), new THREE.MeshBasicMaterial({color, transparent: true, depthWrite: false, depthTest: false}));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .7, -y); m.renderOrder = 12; m.userData.t = 0;
    this.scene.add(m); this.pings.push(m);
  }
  updatePings(dt) {
    for (const m of [...this.pings]) {
      const t = m.userData.t += dt / .7;
      if (t >= 1) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); this.pings.splice(this.pings.indexOf(m), 1); continue; }
      const s = 1 + t * 2.4; m.scale.set(s, s, 1); m.material.opacity = 1 - t;
    }
  }

  /* ---------- день и ночь ---------- */
  setTime(min) {
    const h = (min / 60) % 24, u = (h - 6) / 14; // 6:00 — восход, 20:00 — закат
    const elev = u > 0 && u < 1 ? Math.sin(u * Math.PI) : -.3;
    const day = clamp01(elev * 3 + .1), twi = Math.max(0, 1 - Math.abs(elev) * 4) * (elev > -.25 ? 1 : 0);
    this.sky.set(0x0a1322).lerp(C.set(0xa8c6e2), day).lerp(C.set(0xe0936a), twi * .45);
    this.scene.fog.color.copy(this.sky);
    this.scene.fog.near = 900 + day * 700; this.scene.fog.far = 3000 + day * 1500;
    this.hemi.intensity = .42 + .53 * day; this.hemi.color.set(0x9fb6ff).lerp(C.set(0xdfeaff), day);
    const az = clamp01(u) * Math.PI, R = this.R;
    this.sun.position.set(Math.cos(az) * R * 1.3, Math.max(.08, elev) * R * 1.8 + 60, -Math.sin(az) * R * .7 - R * .3);
    this.sun.intensity = 1.9 * day; this.sun.color.set(0xffb070).lerp(C.set(0xfff4e2), clamp01(elev * 2.5));
    // карту теней перерисовываем, только когда солнце заметно сдвинулось (ночью — никогда)
    if (this.shadowsOn && day > .05 && (Math.abs(az - (this.sAz ?? -9)) > .006 || Math.abs(elev - (this.sEl ?? -9)) > .006)) {
      this.sAz = az; this.sEl = elev; this.renderer.shadowMap.needsUpdate = true;
    }
    this.moon.intensity = .55 * (1 - day);
    const lamp = clamp01(1 - day * 1.6);
    this.lamps.material.opacity = lamp; this.lamps.visible = lamp > .01;
    this.renderer.toneMappingExposure = .95 + day * .15;
    this.night = 1 - day;
    // окна: вечером горит почти половина, к ночи всё меньше, под утро снова включают свет
    this.fac.uNight.value = this.night;
    this.fac.uLit.value = h >= 17 && h < 23 ? .5 : h >= 23 ? .35 : h < 5 ? .15 : h < 8 ? .28 : .1;
  }

  /* ---------- ввод: что под курсором ---------- */
  ndc(px, py) { const r = this.rect; return new THREE.Vector2((px - r.left) / r.width * 2 - 1, -(py - r.top) / r.height * 2 + 1); }
  // луч против «коробок» домов, потом точная проверка стен и крыши — в сотни раз быстрее перебора всех треугольников
  pickBuilding(px, py) {
    this.ray.setFromCamera(this.ndc(px, py), this.camera);
    const {origin: o, direction: d} = this.ray.ray;
    const ox = o.x, oy = -o.z, oh = o.y, dx = d.x, dy = -d.z, dh = d.y, bb = this.bb, bh = this.bh;
    let best = -1, bt = Infinity;
    const slab = (org, dir, lo, hi, t) => {
      if (Math.abs(dir) < 1e-9) return org < lo || org > hi ? null : t;
      let a = (lo - org) / dir, b = (hi - org) / dir;
      if (a > b) { const x = a; a = b; b = x; }
      t[0] = Math.max(t[0], a); t[1] = Math.min(t[1], b);
      return t[0] > t[1] ? null : t;
    };
    const t = [0, 0];
    for (let i = 0; i < bh.length; i++) {
      t[0] = 0; t[1] = bt;
      if (!slab(ox, dx, bb[i * 4], bb[i * 4 + 2], t) || !slab(oy, dy, bb[i * 4 + 1], bb[i * 4 + 3], t) || !slab(oh, dh, 0, bh[i], t)) continue;
      const hit = this.hitPrism(i, ox, oy, oh, dx, dy, dh, t[0], t[1]);
      if (hit < bt) { bt = hit; best = i; }
    }
    return best;
  }
  hitPrism(i, ox, oy, oh, dx, dy, dh, t0, t1) {
    const b = this.map.b[i], h = this.bh[i], e = 1e-6;
    let best = Infinity;
    if (dh < 0) { // крыша
      const t = (h - oh) / dh;
      if (t >= t0 - e && t <= t1 + e && inShape(ox + dx * t, oy + dy * t, b)) best = t;
    }
    for (const p of b.hl ? [b.p, ...b.hl] : [b.p]) for (let j = 0, m = p.length; j < m; j += 2) { // стены
      const ax = p[j], ay = p[j + 1], ex = p[(j + 2) % m] - ax, ey = p[(j + 3) % m] - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((ax - ox) * ey - (ay - oy) * ex) / den, s = ((ax - ox) * dy - (ay - oy) * dx) / den;
      if (s < 0 || s > 1 || t < t0 - e || t > t1 + e || t >= best) continue;
      const y = oh + dh * t;
      if (y >= 0 && y <= h) best = t;
    }
    return best;
  }
  pickGround(px, py) {
    this.ray.setFromCamera(this.ndc(px, py), this.camera);
    const v = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.groundPlane, v) ? {x: v.x, y: -v.z} : null;
  }
  toScreen(x, h, y) {
    const r = this.rect, v = new THREE.Vector3(x, h, -y).project(this.camera);
    return {x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, vis: v.z < 1};
  }
  resize(w, h) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.rect = this.renderer.domElement.getBoundingClientRect();
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
