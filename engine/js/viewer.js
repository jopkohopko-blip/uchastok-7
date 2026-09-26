// Ядро просмотрщика: сцена, свет, постобработка, камера, разборка, рентген, запуск.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials, studioEnvironment, backdrop, glowTexture } from './mats.js';
import { Model, mesh } from './model.js';
import { E, bp, cycle, FIRE } from './spec.js';
import { extrudeY, roundRect, clamp, ease, DEG } from './util.js';
import { buildBlock } from './parts/block.js';
import { buildCrank } from './parts/crank.js';
import { buildHeads } from './parts/head.js';
import { buildIntake, buildFuel } from './parts/intake.js';
import { buildExhaust } from './parts/exhaust.js';
import { buildFront } from './parts/front.js';
import { buildLube } from './parts/lube.js';
import { buildClutch } from './parts/clutch.js';

const BUILDERS = [
  ['Блок цилиндров', buildBlock],
  ['Кривошипно-шатунный механизм', buildCrank],
  ['Головки блока', buildHeads],
  ['Впускная система', buildIntake],
  ['Топливная система', buildFuel],
  ['Выпускные коллекторы', buildExhaust],
  ['Привод ГРМ и навесное оборудование', buildFront],
  ['Система смазки', buildLube],
  ['Маховик и сцепление', buildClutch],
];

export async function createViewer(canvas, opts = {}) {
  const on = { change: [], hover: [], frame: [] };
  const emit = (k, v) => on[k].forEach(f => f(v));
  const progress = opts.onProgress || (() => {});

  // ---------------------------------------------------------------- рендер
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  const maxDpr = opts.maxDpr || 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const M = createMaterials(renderer);
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.95;
  let dark = opts.dark !== false;
  scene.background = backdrop(dark);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
  camera.position.set(1.55, 1.25, 2.35);

  // ---------------------------------------------------------------- свет
  const key = new THREE.SpotLight(0xfff6ea, 42, 0, 0.3, 0.85, 2);
  key.position.set(0.7, 3.4, 1.3);
  key.target.position.set(0, 0.3, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1.2; key.shadow.camera.far = 6;
  key.shadow.bias = -0.00012; key.shadow.normalBias = 0.012;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xdce6ff, 1.1);
  rim.position.set(-2.2, 2.2, -2.6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(2.5, 0.8, 1.5);
  scene.add(fill);

  // ---------------------------------------------------------------- подиум
  const stand = new THREE.Group();
  const ped = mesh(extrudeY(roundRect(1.25, 0.95, 0.03), 0.9, 0.012, 3), M.pedestal);
  ped.position.y = -0.9; ped.receiveShadow = true;
  const wood = mesh(extrudeY(roundRect(0.34, 0.24, 0.006), E.root - 0.135, 0.004, 2), M.wood);
  wood.castShadow = wood.receiveShadow = true;
  stand.add(ped, wood);
  scene.add(stand);

  // ---------------------------------------------------------------- модель
  const model = new Model(M);
  model.root.position.y = E.root;
  scene.add(model.root);
  for (let i = 0; i < BUILDERS.length; i++) {
    const [name, fn] = BUILDERS[i];
    progress(name, i / BUILDERS.length);
    await new Promise(r => setTimeout(r, 0));
    try { fn(model); } catch (err) { console.error('Ошибка сборки узла', name, err); }
  }
  model.finalize();
  const pieces = model.pieces;
  const allMeshes = pieces.flatMap(p => p.meshes);
  const DS = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const m of allMeshes) {
    const proto = Object.getPrototypeOf(m);
    m.raycast = function (r, out) { const k = this.material; this.material = DS; proto.raycast.call(this, r, out); this.material = k; };
  }
  progress('Готово', 1);

  // вспышки сгорания (видны в рентгене при работе)
  const glowTex = glowTexture();
  const glows = [];
  for (const s of [1, -1]) E.cyl[s].forEach((x, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0 }));
    sp.position.copy(bp(s, x, 0, 0.238)); sp.scale.setScalar(0.11); sp.renderOrder = 10; sp.visible = false;
    model.root.add(sp);
    glows.push({ sp, no: (s > 0 ? 1 : 5) + i });
  });

  // ---------------------------------------------------------------- управление камерой
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 0.35;
  controls.maxDistance = 7;
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 0.9;
  controls.target.set(0, E.root + 0.2, 0);
  controls.autoRotateSpeed = 0.7;
  controls.update();

  // ---------------------------------------------------------------- постобработка
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({ radius: 0.07, distanceExponent: 2, thickness: 1.2, scale: 1.1, samples: 16, distanceFallOff: 1 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
  gtao.overrideVisibility = function () {
    const cache = this._visibilityCache;
    this.scene.traverse(o => {
      cache.set(o, o.visible);
      if (o.isPoints || o.isLine || o.isSprite || (o.isMesh && (o.material.transparent || o.material === M.ghost))) o.visible = false;
    });
  };
  // В r169 фон сцены при подмене материала рисуется как плоскость 2×2 м — убираем его на время прохода нормалей.
  const baseOverride = gtao.renderOverride.bind(gtao);
  gtao.renderOverride = function (...args) { const bg = this.scene.background; this.scene.background = null; baseOverride(...args); this.scene.background = bg; };
  composer.addPass(gtao);
  const hoverPass = new OutlinePass(new THREE.Vector2(size.x, size.y), scene, camera);
  const selPass = new OutlinePass(new THREE.Vector2(size.x, size.y), scene, camera);
  for (const p of [hoverPass, selPass]) { p.edgeGlow = 0; p.pulsePeriod = 0; p.usePatternTexture = false; }
  hoverPass.edgeStrength = 2.6; hoverPass.edgeThickness = 1.0;
  selPass.edgeStrength = 4.0; selPass.edgeThickness = 1.4;
  composer.addPass(hoverPass);
  composer.addPass(selPass);
  composer.addPass(new OutputPass());
  let useAO = opts.ao !== false;
  gtao.enabled = useAO;

  // ---------------------------------------------------------------- состояние
  const S = {
    open: null, sel: null, hover: null, xray: false, running: false, rpm: 40,
    exploded: false, amount: 0.7, autoRotate: false, phi: 28, insets: { left: 0, right: 0, top: 0, bottom: 0 },
  };
  let needs = true;
  const invalidate = () => { needs = true; };

  function themeColors() {
    M.ghost.uniforms.color.value.set(dark ? 0x9cc3ee : 0x3b5f8c);
    M.ghost.uniforms.opacity.value = dark ? 0.018 : 0.035;
    M.ghost.uniforms.rim.value = dark ? 0.2 : 0.26;
    hoverPass.visibleEdgeColor.set(dark ? 0x9fd0ff : 0x1d6fe0);
    hoverPass.hiddenEdgeColor.set(dark ? 0x2a4a6e : 0x8fb3e0);
    selPass.visibleEdgeColor.set(dark ? 0x4aa8ff : 0x0b5fd6);
    selPass.hiddenEdgeColor.set(dark ? 0x1b3d66 : 0x6f9ad6);
  }
  themeColors();

  // Кого приглушать: узлы, кроме открытого, и корпусные детали в рентгене.
  function refreshGhosts() {
    for (const pc of pieces) {
      const a = pc.part.asm;
      let g = false;
      if (!S.exploded && S.open && a !== S.open) g = true;
      if (S.xray && !pc.part.def.inner && !(S.open && a === S.open && !S.exploded)) g = true;
      pc.setGhost(g, M.ghost);
    }
    hoverPass.selectedObjects = [];
    selPass.selectedObjects = S.sel ? S.sel.meshes.filter(m => !m.userData.piece.ghost) : [];
    invalidate();
  }

  // ---------------------------------------------------------------- камера: анимация и кадрирование
  let tween = null;
  const sph = new THREE.Spherical(), sph2 = new THREE.Spherical();
  function flyTo(target, pos, dur = 1.0) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) dur = 0.01;
    const t0 = controls.target.clone(), p0 = camera.position.clone();
    sph.setFromVector3(p0.clone().sub(t0));
    sph2.setFromVector3(pos.clone().sub(target));
    let dth = sph2.theta - sph.theta;
    while (dth > Math.PI) dth -= Math.PI * 2;
    while (dth < -Math.PI) dth += Math.PI * 2;
    tween = { t: 0, dur, t0, t1: target.clone(), a: { r: sph.radius, th: sph.theta, ph: sph.phi }, b: { r: sph2.radius, th: sph.theta + dth, ph: sph2.phi } };
  }
  function stepTween(dt) {
    if (!tween) return false;
    tween.t = clamp(tween.t + Math.max(0, dt) / tween.dur, 0, 1);
    const k = ease(tween.t);
    const tg = tween.t0.clone().lerp(tween.t1, k);
    const s = new THREE.Spherical(
      tween.a.r + (tween.b.r - tween.a.r) * k,
      tween.a.ph + (tween.b.ph - tween.a.ph) * k,
      tween.a.th + (tween.b.th - tween.a.th) * k);
    controls.target.copy(tg);
    camera.position.copy(tg).add(new THREE.Vector3().setFromSpherical(s));
    if (tween.t >= 1) tween = null;
    return true;
  }
  controls.addEventListener('start', () => { tween = null; });

  const _b = new THREE.Box3(), _c = new THREE.Vector3(), _s = new THREE.Sphere();
  // Точное кадрирование: все восемь углов габарита должны попасть в свободную часть экрана.
  function fitBoxDistance(box, f) {
    const W = canvas.clientWidth || 1, H = canvas.clientHeight || 1, I = S.insets;
    const fw = Math.max(120, W - I.left - I.right), fh = Math.max(120, H - I.top - I.bottom);
    const t = Math.tan(camera.fov * DEG / 2), tanV = t * fh / H * 0.92, tanH = t * fw / H * 0.92;
    const up0 = Math.abs(f.y) > 0.98 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    const X = new THREE.Vector3().crossVectors(up0, f).normalize(), Y = new THREE.Vector3().crossVectors(f, X);
    const c = box.getCenter(new THREE.Vector3()), p = new THREE.Vector3();
    let d = 0;
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      d = Math.max(d, p.dot(f) + Math.abs(p.dot(X)) / tanH, p.dot(f) + Math.abs(p.dot(Y)) / tanV);
    }
    return d;
  }
  function frameBox(box, dir, dur) {
    const center = box.getCenter(new THREE.Vector3());
    const d = dir ? dir.clone().normalize() : camera.position.clone().sub(controls.target).normalize();
    const dist = clamp(fitBoxDistance(box, d), controls.minDistance, controls.maxDistance);
    flyTo(center, center.clone().addScaledVector(d, dist), dur);
  }
  function worldTargetBox(filter) {
    model.targetBox(filter, _b);
    _b.translate(new THREE.Vector3(0, rootTarget(), 0));
    return _b;
  }
  const VIEWS = {
    iso: new THREE.Vector3(0.52, 0.42, 0.74),
    front: new THREE.Vector3(1, 0.12, 0),
    rear: new THREE.Vector3(-1, 0.12, 0),
    right: new THREE.Vector3(0, 0.12, 1),
    left: new THREE.Vector3(0, 0.12, -1),
    top: new THREE.Vector3(0.001, 1, 0.0005),
    bottom: new THREE.Vector3(0.12, -0.8, 0.25),
  };
  function frameCurrent(dir, dur) {
    const f = S.exploded ? () => true : S.open ? pc => pc.part.asm === S.open : () => true;
    frameBox(worldTargetBox(f), dir, dur);
  }

  // Подъём двигателя над подиумом, если разобранные детали уходят вниз.
  let rootY = E.root;
  function rootTarget() {
    model.targetBox(pc => !pc.ghost || S.exploded, _b);
    return E.root + Math.max(0, -(_b.min.y + E.root) + (S.exploded ? 0.12 : 0.03));
  }

  // ---------------------------------------------------------------- действия
  function openAssembly(a) {
    if (a === S.open && !S.exploded) return;
    if (S.running) setRunning(false);
    S.open = a;
    S.sel = null;
    if (!S.exploded) for (const x of model.asms) x.eT = x === a ? 1 : 0;
    refreshGhosts();
    frameCurrent(null, 1.1);
    emit('change', S);
  }
  function selectPart(p) {
    if (p && S.running) setRunning(false);
    if (p && !S.exploded && S.open !== p.asm) { S.open = p.asm; for (const x of model.asms) x.eT = x === p.asm ? 1 : 0; refreshGhosts(); frameCurrent(null, 1.1); }
    S.sel = p;
    selPass.selectedObjects = p ? p.meshes : [];
    invalidate();
    emit('change', S);
  }
  function closeAll() {
    S.sel = null;
    if (S.open) { S.open = null; for (const x of model.asms) x.eT = S.exploded ? S.amount : 0; refreshGhosts(); frameCurrent(null, 1.0); }
    selPass.selectedObjects = [];
    emit('change', S);
    invalidate();
  }
  function setExploded(on, amount = S.amount) {
    if (on && S.running) setRunning(false);
    S.exploded = on;
    S.amount = amount;
    model.gT = on ? amount : 0;
    model.lsT = on ? 0.55 : 1;
    for (const a of model.asms) a.eT = on ? amount : (a === S.open ? 1 : 0);
    if (on) S.open = S.sel ? S.sel.asm : null;
    refreshGhosts();
    frameCurrent(null, 1.2);
    emit('change', S);
  }
  function setAmount(v) {
    S.amount = v;
    if (!S.exploded) return;
    model.gT = v;
    for (const a of model.asms) a.eT = v;
    invalidate();
  }
  function setXray(v) { S.xray = v; refreshGhosts(); emit('change', S); }
  function setRunning(v) {
    if (v) {
      if (S.exploded) { S.exploded = false; model.gT = 0; model.lsT = 1; }
      S.open = null; S.sel = null;
      for (const a of model.asms) a.eT = 0;
      refreshGhosts();
    }
    S.running = v;
    for (const g of glows) g.sp.visible = false;
    emit('change', S);
    invalidate();
  }
  function setRpm(v) { S.rpm = v; emit('change', S); }
  function setAutoRotate(v) { S.autoRotate = v; controls.autoRotate = v; emit('change', S); invalidate(); }
  function setView(name) {
    frameCurrent(name ? VIEWS[name] || VIEWS.iso : null, 1.2);
  }
  // Вступление: камера облетает двигатель и подходит к виду 3/4.
  function intro() {
    const box = worldTargetBox(() => true);
    const c = box.getCenter(new THREE.Vector3());
    const d = fitBoxDistance(box, VIEWS.iso.clone().normalize());
    const start = VIEWS.iso.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.9).normalize();
    start.y += 0.25;
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(start.normalize(), d * 1.9);
    flyTo(c, c.clone().addScaledVector(VIEWS.iso.clone().normalize(), d), 2.2);
  }
  function setTheme(isDark) {
    dark = isDark;
    const old = scene.background; scene.background = backdrop(dark); old.dispose();
    themeColors();
    invalidate();
  }
  function setInsets(ins) {
    S.insets = ins;
    applySize();
  }
  function focusPart(p) {
    frameBox(worldTargetBox(pc => pc.part === p), null, 0.9);
  }

  // ---------------------------------------------------------------- выбор мышью
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const live = [], ghost = [];
    for (const m of allMeshes) (m.userData.piece.ghost ? ghost : live).push(m);
    let h = ray.intersectObjects(live, false)[0];
    if (h) return { piece: h.object.userData.piece, ghost: false, point: h.point };
    if (!S.exploded && S.open) {
      h = ray.intersectObjects(ghost, false)[0];
      if (h) return { piece: h.object.userData.piece, ghost: true, point: h.point };
    }
    return null;
  }
  // Что подсветить под курсором: узел или деталь.
  function hoverTarget(hit) {
    if (!hit) return null;
    const part = hit.piece.part, asm = part.asm;
    if (S.exploded) return { kind: 'part', part, asm };
    if (S.open && asm === S.open && !hit.ghost) return { kind: 'part', part, asm };
    return { kind: 'asm', asm };
  }
  function setHover(t) {
    const same = t && S.hover && t.kind === S.hover.kind && t.asm === S.hover.asm && t.part === S.hover.part;
    if (same || (!t && !S.hover)) return;
    S.hover = t;
    const meshes = !t ? [] : t.kind === 'part' ? t.part.meshes : t.asm.meshes;
    hoverPass.selectedObjects = t && t.kind === 'asm' && S.open && t.asm !== S.open ? [] : meshes.filter(m => !m.userData.piece.ghost);
    invalidate();
    emit('hover', t);
  }
  function click(hit) {
    const t = hoverTarget(hit);
    if (!t) { if (S.sel) selectPart(null); else if (S.open && !S.exploded) closeAll(); return; }
    if (t.kind === 'asm') openAssembly(t.asm);
    else selectPart(t.part);
  }

  // ---------------------------------------------------------------- размеры
  function applySize() {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    renderer.getDrawingBufferSize(size);
    camera.aspect = W / H;
    const I = S.insets;
    camera.setViewOffset(W, H, -(I.left - I.right) / 2, -(I.top - I.bottom) / 2, W, H);
    camera.updateProjectionMatrix();
    invalidate();
  }
  new ResizeObserver(applySize).observe(canvas);
  applySize();

  // ---------------------------------------------------------------- кинематика
  function pose(phiDeg) {
    const theta = -phiDeg * DEG;
    for (const f of model.movers) f(theta, phiDeg);
  }
  pose(S.phi);

  // ---------------------------------------------------------------- цикл
  let last = performance.now(), fpsAcc = 0, fpsN = 0, slow = 0;
  const pedFade = { v: 1 };
  function loop(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = Math.max(last, now);
    let active = false;
    if (stepTween(dt)) active = true;
    if (controls.update()) active = true;
    if (model.update(dt)) active = true;
    const rt = rootTarget();
    if (Math.abs(rt - rootY) > 1e-4) { rootY += (rt - rootY) * Math.min(1, dt * 5); if (Math.abs(rt - rootY) < 1e-4) rootY = rt; model.root.position.y = rootY; active = true; }
    if (S.running) {
      S.phi += dt * S.rpm * 6;
      pose(S.phi);
      if (S.xray) for (const g of glows) {
        const a = cycle(g.no, S.phi);
        const k = a < 50 ? Math.exp(-a / 14) : 0;
        g.sp.visible = k > 0.02;
        g.sp.material.opacity = k;
        g.sp.scale.setScalar(0.07 + 0.06 * k);
      }
      active = true;
    }
    // подиум прячется, когда смотрим снизу
    const want = camera.position.y < 0.03 ? 0 : 1;
    if (pedFade.v !== want) {
      pedFade.v += Math.sign(want - pedFade.v) * Math.min(Math.abs(want - pedFade.v), dt * 4);
      const tr = pedFade.v < 0.999;
      if (M.pedestal.transparent !== tr) { M.pedestal.transparent = M.wood.transparent = tr; M.pedestal.needsUpdate = M.wood.needsUpdate = true; }
      M.pedestal.opacity = M.wood.opacity = pedFade.v;
      M.pedestal.depthWrite = M.wood.depthWrite = !tr;
      ped.visible = wood.visible = pedFade.v > 0.01;
      active = true;
    }
    if (active || needs) {
      const t0 = performance.now();
      composer.render(dt);
      needs = false;
      emit('frame', S);
      // адаптивное качество: при медленной отрисовке отключаем AO, затем снижаем разрешение
      if (active) {
        fpsAcc += performance.now() - t0 + (dt * 1000 > 40 ? dt * 1000 - 16 : 0);
        fpsN++;
        if (fpsN >= 45) {
          const avg = fpsAcc / fpsN;
          if (avg > 30 && ++slow >= 2) {
            if (gtao.enabled) gtao.enabled = false;
            else if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); applySize(); }
            slow = 0;
          }
          fpsAcc = 0; fpsN = 0;
        }
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // стартовый кадр
  frameBox(worldTargetBox(() => true), VIEWS.iso, 0.01);

  return {
    model, scene, camera, controls, renderer, composer, gtao, S, M,
    on: (k, f) => on[k].push(f),
    pick, hoverTarget, setHover, click, openAssembly, selectPart, closeAll, focusPart, intro,
    setExploded, setAmount, setXray, setRunning, setRpm, setAutoRotate, setView, setTheme, setInsets,
    invalidate, pose, frameBox, worldTargetBox, VIEWS,
    renderNow: () => { controls.update(); composer.render(0); },
    settle() {
      if (tween) { tween.t = 1; stepTween(0); }
      model.g = model.gT; model.ls = model.lsT;
      for (const a of model.asms) a.e = a.eT;
      model.update(0);
      rootY = rootTarget(); model.root.position.y = rootY;
      controls.update();
      invalidate();
    },
  };
}
