// Материалы и процедурные текстуры: литой алюминий, карбон саржевого плетения
// с анизотропным бликом, шлифованный титан, оплётка шлангов, дерево подставки.
import * as THREE from 'three';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Бесшовный value-noise.
function vnoise(size, period, rand, out, w = 1) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (i, j) => g[(((j % period) + period) % period) * period + (((i % period) + period) % period)];
  for (let y = 0; y < size; y++) {
    const fy = y / size * period, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const fx = x / size * period, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      out[y * size + x] += w * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
  }
  return out;
}

function dataTex(data, size, repeat, aniso, srgb = false) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function normalFromHeight(h, size, k) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], b = h[((y + 1) % size) * size + x];
    let nx = (l - r) * k, ny = (u - b) * k, nz = 1;
    const il = 1 / Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    d[i] = (nx * il * 0.5 + 0.5) * 255; d[i + 1] = (ny * il * 0.5 + 0.5) * 255; d[i + 2] = (nz * il * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  return d;
}

// ---------------------------------------------------------------- текстуры

function castTextures(aniso) {
  const S = 256, rand = rng(7), h = new Float32Array(S * S);
  vnoise(S, 64, rand, h, 0.55);
  vnoise(S, 128, rand, h, 0.35);
  vnoise(S, 16, rand, h, 0.25);
  for (let i = 0; i < h.length; i++) h[i] += (rand() - 0.5) * 0.35;
  const rough = new Uint8Array(S * S * 4);
  const blot = new Float32Array(S * S); vnoise(S, 6, rand, blot, 1);
  for (let i = 0; i < S * S; i++) {
    const v = Math.min(255, Math.max(0, 150 + (h[i] - 0.6) * 60 + (blot[i] - 0.5) * 70));
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = v; rough[i * 4 + 3] = 255;
  }
  return {
    normal: dataTex(normalFromHeight(h, S, 1.4), S, 1 / 0.06, aniso),
    rough: dataTex(rough, S, 1 / 0.06, aniso),
  };
}

// Саржа 2×2: восемь жгутов на плитку, каждый — с продольной штриховкой волокон.
function carbonTextures(aniso) {
  const S = 512, T = 8, cell = S / T, rand = rng(11);
  const col = new Uint8Array(S * S * 4), an = new Uint8Array(S * S * 4), h = new Float32Array(S * S);
  const streak = new Float32Array(S * 4);
  for (let i = 0; i < streak.length; i++) streak[i] = rand();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = Math.floor(x / cell), j = Math.floor(y / cell);
    const fx = (x % cell) / cell, fy = (y % cell) / cell;
    const k = (((i - j) % 4) + 4) % 4;
    const warp = k < 2;
    const across = warp ? fx : fy;
    const along = warp ? (k === 1 ? fy * 0.5 : 0.5 + fy * 0.5) : (k === 2 ? fx * 0.5 : 0.5 + fx * 0.5);
    const bulge = Math.sin(Math.PI * across);
    const dip = Math.pow(Math.sin(Math.PI * along), 0.35);
    const fib = streak[(warp ? x : y + S) % streak.length] * 0.5 + streak[((warp ? x : y) * 7 + 13) % streak.length] * 0.5;
    const base = warp ? 26 : 21;
    const v = base * (0.62 + 0.38 * bulge * dip) * (0.86 + 0.28 * fib);
    const p = (y * S + x) * 4;
    col[p] = v; col[p + 1] = v * 1.02; col[p + 2] = v * 1.08; col[p + 3] = 255;
    // направление анизотропии: основа — вдоль v, уток — вдоль u
    an[p] = warp ? 128 : 255; an[p + 1] = warp ? 255 : 128; an[p + 2] = Math.round(255 * (0.55 + 0.45 * bulge)); an[p + 3] = 255;
    h[y * S + x] = bulge * dip * 0.8 + fib * 0.08;
  }
  const rep = 1 / 0.032;
  return {
    color: dataTex(col, S, rep, aniso, true),
    aniso: dataTex(an, S, rep, aniso),
    normal: dataTex(normalFromHeight(h, S, 2.2), S, rep, aniso),
  };
}

// Шлифовка: продольные риски вдоль u.
function brushedTexture(aniso, rep = 1 / 0.08) {
  const S = 256, rand = rng(23), d = new Uint8Array(S * S * 4);
  const row = new Float32Array(S);
  for (let y = 0; y < S; y++) row[y] = rand();
  for (let y = 0; y < S; y++) {
    const r = (row[y] * 0.6 + row[(y + 1) % S] * 0.25 + row[(y + S - 1) % S] * 0.15);
    for (let x = 0; x < S; x++) {
      const v = Math.min(255, Math.max(0, 120 + (r - 0.5) * 110 + (rand() - 0.5) * 18));
      const p = (y * S + x) * 4; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
    }
  }
  const t = dataTex(d, S, rep, aniso);
  t.repeat.set(rep * 0.25, rep);
  return t;
}

// Оплётка шланга из нержавеющей проволоки.
function braidTextures(aniso) {
  const S = 128, h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = ((x + y) % 16) / 16, b = ((x - y + S * 4) % 16) / 16;
    const over = (Math.floor((x + y) / 16) + Math.floor((x - y + S * 4) / 16)) % 2 === 0;
    const wa = Math.sin(Math.PI * a), wb = Math.sin(Math.PI * b);
    h[y * S + x] = over ? Math.max(wa, wb * 0.6) : Math.max(wb, wa * 0.6);
  }
  const rough = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { const v = 90 + (1 - h[i]) * 120; rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = v; rough[i * 4 + 3] = 255; }
  return { normal: dataTex(normalFromHeight(h, S, 3.5), S, 1 / 0.012, aniso), rough: dataTex(rough, S, 1 / 0.012, aniso) };
}

function woodTexture(aniso) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d'), rand = rng(5);
  g.fillStyle = '#b98e5e'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 90; i++) {
    const y = rand() * 256, w = 0.6 + rand() * 2.2, a = 0.08 + rand() * 0.18;
    g.strokeStyle = `rgba(${90 + rand() * 30},${55 + rand() * 20},${28 + rand() * 12},${a})`;
    g.lineWidth = w; g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.012 + i) * 3 + (rand() - 0.5) * 1.5);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
  t.repeat.set(1 / 0.35, 1 / 0.18);
  return t;
}

function badgeTexture(aniso) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#2b7bf0'); grd.addColorStop(1, '#1650b8');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 8; g.strokeRect(18, 18, 476, 220);
  g.fillStyle = '#eaf2ff'; g.font = '700 118px "IBM Plex Sans Condensed", "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('V8 5.0', 256, 134);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  return t;
}

export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,240,200,1)'); grd.addColorStop(0.25, 'rgba(255,170,60,.85)');
  grd.addColorStop(0.6, 'rgba(255,90,20,.25)'); grd.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- материалы

export function createMaterials(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const cast = castTextures(aniso), carbon = carbonTextures(aniso), braid = braidTextures(aniso);
  const brushed = brushedTexture(aniso);
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const S = (o) => new THREE.MeshStandardMaterial(o);

  const M = {
    aluCast: S({ color: 0x9fa4ab, metalness: 1, roughness: 0.95, roughnessMap: cast.rough, normalMap: cast.normal, normalScale: new THREE.Vector2(0.55, 0.55) }),
    aluCastDark: S({ color: 0x8f949b, metalness: 1, roughness: 0.92, roughnessMap: cast.rough, normalMap: cast.normal, normalScale: new THREE.Vector2(0.5, 0.5) }),
    aluMachined: S({ color: 0xd3d6da, metalness: 1, roughness: 0.46, roughnessMap: brushed }),
    aluDark: S({ color: 0x3b3f45, metalness: 0.85, roughness: 0.38 }),
    anoBlack: S({ color: 0x1c1e22, metalness: 0.7, roughness: 0.34 }),
    anoBlue: P({ color: 0x2b78f0, metalness: 1, roughness: 0.24, clearcoat: 0.3, clearcoatRoughness: 0.2 }),
    anoPurple: P({ color: 0x8a45f0, metalness: 1, roughness: 0.24, clearcoat: 0.3, clearcoatRoughness: 0.2 }),
    anoRed: P({ color: 0xd8342c, metalness: 1, roughness: 0.28 }),
    steel: S({ color: 0x9aa0a7, metalness: 1, roughness: 0.62, roughnessMap: brushed }),
    steelPolished: S({ color: 0xe4e6e9, metalness: 1, roughness: 0.1 }),
    steelDark: S({ color: 0x4b4f55, metalness: 1, roughness: 0.36 }),
    steelBlack: S({ color: 0x2a2c30, metalness: 0.9, roughness: 0.42 }),
    zinc: S({ color: 0xc7cacf, metalness: 1, roughness: 0.3 }),
    titanium: P({ color: 0xc9c4ba, metalness: 1, roughness: 0.56, roughnessMap: brushed, vertexColors: true }),
    weld: S({ color: 0xa9a49a, metalness: 1, roughness: 0.45, vertexColors: false }),
    carbon: P({
      color: 0xffffff, map: carbon.color, normalMap: carbon.normal, normalScale: new THREE.Vector2(0.35, 0.35),
      metalness: 0.4, roughness: 0.32, anisotropy: 0.85, anisotropyMap: carbon.aniso,
      clearcoat: 1, clearcoatRoughness: 0.035,
    }),
    composite: P({ color: 0x141518, metalness: 0.1, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.12 }),
    plastic: S({ color: 0x17191c, metalness: 0, roughness: 0.52 }),
    plasticGrey: S({ color: 0x55595f, metalness: 0, roughness: 0.5 }),
    coil: P({ color: 0x1c2438, metalness: 0.15, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
    rubber: S({ color: 0x141414, metalness: 0, roughness: 0.82 }),
    loom: S({ color: 0x1d1f22, metalness: 0.1, roughness: 0.74, roughnessMap: braid.rough, normalMap: braid.normal, normalScale: new THREE.Vector2(0.7, 0.7) }),
    sight: P({ color: 0x9a6415, metalness: 0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    fin: S({ color: 0xb9bdc2, metalness: 1, roughness: 0.5, side: THREE.DoubleSide }),
    braid: S({ color: 0xc4c7cc, metalness: 1, roughness: 0.68, roughnessMap: braid.rough, normalMap: braid.normal, normalScale: new THREE.Vector2(0.9, 0.9) }),
    piston: S({ color: 0xc9ccd1, metalness: 1, roughness: 0.6, roughnessMap: brushed }),
    pistonCoat: S({ color: 0x35373b, metalness: 0.25, roughness: 0.6, side: THREE.DoubleSide }),
    soot: S({ color: 0x2b2724, metalness: 0.2, roughness: 0.85, side: THREE.DoubleSide }),
    valveEx: S({ color: 0x6b6862, metalness: 1, roughness: 0.4 }),
    ceramic: P({ color: 0xf2f1ec, metalness: 0, roughness: 0.25, clearcoat: 0.6 }),
    gasket: S({ color: 0x4f545b, metalness: 0.85, roughness: 0.42 }),
    guide: S({ color: 0xa8521f, metalness: 0, roughness: 0.55 }),
    friction: S({ color: 0x2c2b2a, metalness: 0.3, roughness: 0.78 }),
    copper: S({ color: 0xc27a4a, metalness: 1, roughness: 0.3 }),
    bronze: S({ color: 0xb08a55, metalness: 1, roughness: 0.32 }),
    badge: S({ map: badgeTexture(aniso), metalness: 0.6, roughness: 0.3 }),
    wood: S({ map: woodTexture(aniso), metalness: 0, roughness: 0.72 }),
    pedestal: S({ color: 0xd4d5d2, metalness: 0, roughness: 0.9 }),
    hole: S({ color: 0x0b0b0c, metalness: 0, roughness: 0.9 }),
  };
  M.ghost = ghostMaterial();
  for (const [k, m] of Object.entries(M)) m.name = k;
  return M;
}

// Полупрозрачный «призрак» для приглушённых узлов и режима рентгена.
export function ghostMaterial() {
  return new THREE.ShaderMaterial({
    name: 'ghost',
    uniforms: { color: { value: new THREE.Color(0x9fc2e8) }, opacity: { value: 0.05 }, rim: { value: 0.32 } },
    vertexShader: /* glsl */`
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main() {
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        vN = normalize(transformedNormal); vV = normalize(-mvPosition.xyz);
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float opacity; uniform float rim;
      varying vec3 vN; varying vec3 vV;
      #include <clipping_planes_pars_fragment>
      void main() {
        #include <clipping_planes_fragment>
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(color, clamp(opacity + rim * pow(f, 2.2), 0.0, 1.0));
      }`,
    transparent: true, depthWrite: false, side: THREE.FrontSide,
  });
}

// ---------------------------------------------------------------- окружение

// Студия с софтбоксами: длинные блики на карбоне и титане, как на предметной съёмке.
export function studioEnvironment(renderer) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial({ color: 0x2b2e34, side: THREE.BackSide }));
  room.position.y = 5; scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.34, 0.34, 0.35) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.8; scene.add(floor);
  const panel = (w, h, k, p, look, tint = [1, 1, 1]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint[0] * k, tint[1] * k, tint[2] * k), side: THREE.DoubleSide }));
    m.position.set(p[0], p[1], p[2]); m.lookAt(look[0], look[1], look[2]); scene.add(m);
  };
  panel(9, 5, 4.2, [0, 10, 0], [0, 0, 0]);
  panel(1.6, 8, 5.5, [-10, 4, 3], [0, 2, 0], [1, 0.98, 0.95]);
  panel(1.6, 8, 4.2, [10, 4, -2], [0, 2, 0], [0.95, 0.98, 1]);
  panel(12, 1.4, 2.2, [0, 5, -11], [0, 2, 0]);
  panel(12, 4, 1.5, [2, 2.5, 11], [0, 2, 0]);
  panel(3, 6, 2.0, [8, 3, 8], [0, 1.5, 0]);
  panel(3, 6, 1.6, [-8, 3, -8], [0, 1.5, 0]);
  panel(3, 3, 2.4, [-6, 7, -7], [0, 1, 0], [0.85, 0.92, 1]);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.03);
  pm.dispose();
  return rt.texture;
}

// Фон-градиент под тему (рисуется на весь экран).
export function backdrop(dark) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(512, 400, 30, 512, 520, 820);
  if (dark) { grd.addColorStop(0, '#262a31'); grd.addColorStop(0.45, '#111317'); grd.addColorStop(1, '#050608'); }
  else { grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#eceef1'); grd.addColorStop(1, '#c9ced6'); }
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);
  // лёгкий шум против полос градиента
  const img = g.getImageData(0, 0, 1024, 1024), d = img.data, r = rng(3);
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 3; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
