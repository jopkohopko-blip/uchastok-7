// 3D-мир: реальные дома и улицы из OSM, машины нарядов, метки вызовов, слой преступности, день и ночь.
// Координаты карты: x — восток, y — север (метры). В three.js: x = x, z = −y, высота — y.
import * as THREE from 'three';
import {centroid} from './osm.js';

const KIND_COL = {res: '#cdbb9e', com: '#b3bcc6', ind: '#a8a08f', pub: '#dccaa6', rel: '#eadcb9', gen: '#c2b9aa'};
const ROAD_W = {motorway: 16, trunk: 14, primary: 13, secondary: 11, tertiary: 9, unclassified: 7, residential: 7, living_street: 6, service: 4.2, pedestrian: 8};
const ROAD_C = {motorway: '#6a7077', trunk: '#6a7077', primary: '#666c73', secondary: '#61676e', tertiary: '#5c6269', unclassified: '#565c63', residential: '#565c63', living_street: '#5b5f63', service: '#4f5459', pedestrian: '#7b7466'};
const ROAD_ORD = {motorway: 6, trunk: 6, primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, living_street: 1, service: 0, pedestrian: 1};
const C = new THREE.Color();

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
function validColour(s) {
  if (!s) return null;
  s = s.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return s;
  return THREE.Color.NAMES[s.replace(/\s+/g, '')] !== undefined ? s.replace(/\s+/g, '') : null;
}

export class World {
  constructor(canvas, map) {
    this.map = map; this.R = map.r;
    const r = this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 2, 9000);
    this.scene.fog = new THREE.Fog(0x9fbad2, 1400, 4200);
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x3a3326, .9); this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera, R = this.R * 1.15;
    s.left = -R; s.right = R; s.top = R; s.bottom = -R; s.near = 10; s.far = this.R * 6;
    sun.shadow.bias = -.0004; sun.shadow.normalBias = 1.2;
    this.scene.add(sun, sun.target);
    this.moon = new THREE.DirectionalLight(0x8fb0ff, 0); this.moon.position.set(-300, 600, 400); this.scene.add(this.moon);
    this.ray = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.buildGround(); this.buildAreas(); this.buildRoads(); this.buildBuildings(); this.buildTrees(); this.buildLights(); this.buildOverlay();
    this.units = new Map(); this.markers = new Map(); this.zoneGroup = new THREE.Group(); this.scene.add(this.zoneGroup);
    this.hover = -1; this.sel = -1; this.pings = [];
  }

  /* ---------- земля, вода, парки ---------- */
  buildGround() {
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(this.R * 10, this.R * 10), new THREE.MeshLambertMaterial({color: 0x1d2521}));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -.2; outer.receiveShadow = true;
    const disk = new THREE.Mesh(new THREE.CircleGeometry(this.R * 1.06, 96), new THREE.MeshLambertMaterial({color: 0x454a44}));
    disk.rotation.x = -Math.PI / 2; disk.position.y = -.05; disk.receiveShadow = true;
    const edge = new THREE.Mesh(new THREE.RingGeometry(this.R * 1.06, this.R * 1.075, 128), new THREE.MeshBasicMaterial({color: 0x8fb7cc, transparent: true, opacity: .35}));
    edge.rotation.x = -Math.PI / 2; edge.position.y = .01;
    this.scene.add(outer, disk, edge);
  }
  polyGeometry(list, y) {
    const pos = [];
    for (const p of list) {
      const contour = []; for (let i = 0; i < p.length; i += 2) contour.push(new THREE.Vector2(p[i], p[i + 1]));
      const faces = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const f of faces) for (const k of f) pos.push(contour[k].x, y, -contour[k].y);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
  buildAreas() {
    const green = new THREE.Mesh(this.polyGeometry(this.map.g, .02), new THREE.MeshLambertMaterial({color: 0x557d4c}));
    const water = new THREE.Mesh(this.polyGeometry(this.map.w, .03), new THREE.MeshLambertMaterial({color: 0x3f6f8f, emissive: 0x0b2233}));
    green.receiveShadow = water.receiveShadow = true;
    this.scene.add(green, water);
  }

  /* ---------- дороги: ленты с круглыми стыками, одна общая геометрия ---------- */
  buildRoads() {
    const pos = [], col = [];
    const push = (x, y, z, c) => { pos.push(x, y, -z); col.push(c.r, c.g, c.b); };
    for (const rd of this.map.rd) {
      const base = rd.k.replace('_link', ''), link = rd.k.endsWith('_link');
      const w = (ROAD_W[base] ?? 6) * (link ? .8 : 1), hw = w / 2, y = .05 + (ROAD_ORD[base] ?? 0) * .012;
      const c = new THREE.Color(ROAD_C[base] ?? '#565c63'), p = rd.p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const x1 = p[i], y1 = p[i + 1], x2 = p[i + 2], y2 = p[i + 3], L = Math.hypot(x2 - x1, y2 - y1) || 1;
        const nx = -(y2 - y1) / L * hw, ny = (x2 - x1) / L * hw;
        push(x1 + nx, y, y1 + ny, c); push(x1 - nx, y, y1 - ny, c); push(x2 - nx, y, y2 - ny, c);
        push(x1 + nx, y, y1 + ny, c); push(x2 - nx, y, y2 - ny, c); push(x2 + nx, y, y2 + ny, c);
      }
      for (let i = 0; i < p.length; i += 2) { // круглые стыки, чтобы повороты не рвались
        const x = p[i], z = p[i + 1];
        for (let s = 0; s < 8; s++) {
          const a1 = s / 8 * Math.PI * 2, a2 = (s + 1) / 8 * Math.PI * 2;
          push(x, y, z, c); push(x + Math.cos(a1) * hw, y, z + Math.sin(a1) * hw, c); push(x + Math.cos(a2) * hw, y, z + Math.sin(a2) * hw, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({vertexColors: true, side: THREE.DoubleSide}));
    m.receiveShadow = true;
    this.scene.add(m);
  }

  /* ---------- дома: одна общая геометрия, цвет каждого дома можно менять ---------- */
  buildBuildings() {
    const B = this.map.b, n = B.length;
    const tris = [], contours = [];
    let nv = 0;
    for (const b of B) {
      const ct = []; for (let i = 0; i < b.p.length; i += 2) ct.push(new THREE.Vector2(b.p[i], b.p[i + 1]));
      const f = THREE.ShapeUtils.triangulateShape(ct, []);
      contours.push(ct); tris.push(f);
      nv += ct.length * 6 + f.length * 3;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), shade = new Float32Array(nv);
    this.bStart = new Int32Array(n); this.bWallEnd = new Int32Array(n); this.bEnd = new Int32Array(n);
    this.faceB = new Int32Array(nv / 3);
    this.wallCol = []; this.roofCol = []; this.centers = [];
    let v = 0;
    const put = (x, y, z, nx, ny, nz, sh) => {
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz; shade[v] = sh; v++;
    };
    for (let i = 0; i < n; i++) {
      const b = B[i], ct = contours[i], h = b.h, m = ct.length;
      const wall = new THREE.Color(KIND_COL[b.k] || KIND_COL.gen), tag = validColour(b.c);
      if (tag) wall.lerp(new THREE.Color(tag), .45);
      const jit = ((i * 2654435761) % 1000) / 1000 * .12 - .06; // лёгкий разброс оттенков соседних домов
      wall.offsetHSL(0, 0, jit);
      const roof = wall.clone().multiplyScalar(.72);
      this.wallCol.push(wall); this.roofCol.push(roof);
      this.centers.push(centroid(b.p));
      this.bStart[i] = v;
      for (let j = 0; j < m; j++) {
        const a = ct[j], c = ct[(j + 1) % m], L = Math.hypot(c.x - a.x, c.y - a.y) || 1;
        const nx = (c.y - a.y) / L, ny = -(c.x - a.x) / L; // наружная нормаль в координатах карты
        put(a.x, 0, -a.y, nx, 0, -ny, .62); put(c.x, 0, -c.y, nx, 0, -ny, .62); put(c.x, h, -c.y, nx, 0, -ny, 1);
        put(a.x, 0, -a.y, nx, 0, -ny, .62); put(c.x, h, -c.y, nx, 0, -ny, 1); put(a.x, h, -a.y, nx, 0, -ny, 1);
      }
      this.bWallEnd[i] = v;
      for (const f of tris[i]) for (const k of f) put(ct[k].x, h, -ct[k].y, 0, 1, 0, 1);
      this.bEnd[i] = v;
      for (let t = this.bStart[i] / 3; t < v / 3; t++) this.faceB[t] = i;
    }
    this.shade = shade;
    const g = this.bGeo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    this.bState = B.map(() => ({role: null, gang: false, hq: false}));
    for (let i = 0; i < n; i++) this.paint(i, false);
    const mesh = this.bMesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({vertexColors: true, side: THREE.DoubleSide}));
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
  }
  // итоговый цвет дома: базовый → роль полиции → банда на крыше → выбор/наведение
  paint(i, upload = true) {
    const st = this.bState[i], col = this.bGeo.attributes.color.array, sh = this.shade;
    const wall = this.wallCol[i].clone(), roof = this.roofCol[i].clone();
    if (st.role) { const rc = new THREE.Color(st.role); wall.lerp(rc, .5); roof.lerp(rc, .7); }
    if (st.gang) { roof.lerp(C.set(0xb3263a), .55); wall.lerp(C.set(0x6b2a33), .2); }
    if (i === this.sel) { wall.lerp(C.set(0xffffff), .35); roof.lerp(C.set(0xfff3c4), .5); }
    else if (i === this.hover) { wall.lerp(C.set(0xffffff), .2); roof.lerp(C.set(0xffffff), .25); }
    for (let v = this.bStart[i]; v < this.bEnd[i]; v++) {
      const c = v < this.bWallEnd[i] ? wall : roof, s = sh[v];
      col[v * 3] = c.r * s; col[v * 3 + 1] = c.g * s; col[v * 3 + 2] = c.b * s;
    }
    if (upload) this.bGeo.attributes.color.needsUpdate = true;
  }
  setRole(i, color) { this.bState[i].role = color; this.paint(i); }
  setGang(i, on) { if (this.bState[i].gang !== on) { this.bState[i].gang = on; this.paint(i); } }
  setHover(i) { if (i === this.hover) return; const o = this.hover; this.hover = i; if (o >= 0) this.paint(o); if (i >= 0) this.paint(i); }
  setSelected(i) { if (i === this.sel) return; const o = this.sel; this.sel = i; if (o >= 0) this.paint(o); if (i >= 0) this.paint(i); }

  /* ---------- деревья в парках ---------- */
  buildTrees() {
    const pts = [];
    for (const p of this.map.g) {
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (let i = 0; i < p.length; i += 2) { minx = Math.min(minx, p[i]); maxx = Math.max(maxx, p[i]); miny = Math.min(miny, p[i + 1]); maxy = Math.max(maxy, p[i + 1]); }
      const area = (maxx - minx) * (maxy - miny), cnt = Math.min(90, Math.floor(area / 260));
      for (let k = 0, tries = 0; k < cnt && tries < cnt * 4; tries++) {
        const x = minx + Math.random() * (maxx - minx), y = miny + Math.random() * (maxy - miny);
        if (inPoly(x, y, p)) { pts.push(x, y); k++; }
      }
      if (pts.length > 5000) break;
    }
    const n = pts.length / 2;
    if (!n) return;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({color: 0xffffff}), n);
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
    this.lamps = new THREE.Points(g, new THREE.PointsMaterial({size: 34, map: glowTex, color: 0xffcf8a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending}));
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
      d[px] = v >= 70 ? 214 : 235; d[px + 1] = v >= 70 ? 40 : 150; d[px + 2] = v >= 70 ? 60 : 60; d[px + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    this.ovTex.needsUpdate = true;
  }
  showCrime(on) { this.ovMesh.visible = on; }

  /* ---------- зоны контроля участка и опорных пунктов ---------- */
  setZones(zones) {
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
    for (const m of [body, stripe, cab]) m.castShadow = true;
    g.add(body, stripe, cab, l1, l2);
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
    for (const [id, o] of this.markers) if (!seen.has(id)) { this.scene.remove(o.sp, o.ring); this.markers.delete(id); }
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
    const day = Math.min(1, Math.max(0, elev * 3 + .1)), twi = Math.max(0, 1 - Math.abs(elev) * 4) * (elev > -.25 ? 1 : 0);
    const sky = new THREE.Color(0x0a1322).lerp(C.set(0xa8c6e2), day);
    sky.lerp(C.set(0xe0936a), twi * .45);
    this.scene.background = sky; this.scene.fog.color.copy(sky);
    this.scene.fog.near = 900 + day * 700; this.scene.fog.far = 3000 + day * 1500;
    this.hemi.intensity = .42 + .53 * day; this.hemi.color.set(0x9fb6ff).lerp(C.set(0xdfeaff), day);
    const az = Math.max(0, Math.min(1, u)) * Math.PI, R = this.R;
    this.sun.position.set(Math.cos(az) * R * 1.3, Math.max(.08, elev) * R * 1.8 + 60, -Math.sin(az) * R * .7 - R * .3);
    this.sun.intensity = 1.9 * day; this.sun.color.set(0xffb070).lerp(C.set(0xfff4e2), Math.min(1, elev * 2.5));
    this.sun.castShadow = day > .05;
    this.moon.intensity = .55 * (1 - day);
    this.lamps.material.opacity = Math.max(0, Math.min(1, 1 - day * 1.6));
    this.renderer.toneMappingExposure = .95 + day * .15;
    this.night = 1 - day;
  }

  /* ---------- ввод: что под курсором ---------- */
  ndc(px, py) { const r = this.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2((px - r.left) / r.width * 2 - 1, -(py - r.top) / r.height * 2 + 1); }
  pickBuilding(px, py) {
    this.ray.setFromCamera(this.ndc(px, py), this.camera);
    const hit = this.ray.intersectObject(this.bMesh, false)[0];
    return hit ? this.faceB[hit.faceIndex] : -1;
  }
  pickGround(px, py) {
    this.ray.setFromCamera(this.ndc(px, py), this.camera);
    const v = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.groundPlane, v) ? {x: v.x, y: -v.z} : null;
  }
  toScreen(x, h, y) {
    const r = this.renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3(x, h, -y).project(this.camera);
    return {x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, vis: v.z < 1};
  }
  resize(w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  render() { this.renderer.render(this.scene, this.camera); }
}

export function inPoly(x, y, p) {
  let ins = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
