// Состав двигателя: узлы → детали → экземпляры (pieces) со своими векторами разбора.
import * as THREE from 'three';
import { ASSEMBLIES, PARTS } from './catalog.js';
import { clamp, ease } from './util.js';

const _box = new THREE.Box3(), _v = new THREE.Vector3();

export function mesh(g, m, name) {
  const o = new THREE.Mesh(g, m);
  if (name) o.name = name;
  return o;
}

export class Model {
  constructor(materials) {
    this.M = materials;
    this.root = new THREE.Group();
    this.root.name = 'engine';
    this.asms = [];
    this.byId = new Map();
    for (const def of ASSEMBLIES) {
      const a = new Assembly(this, def);
      this.asms.push(a);
      this.byId.set(def.id, a);
    }
    this.movers = [];
    this.g = 0; this.gT = 0;     // общий разнос узлов
    this.ls = 1; this.lsT = 1;   // масштаб разбора внутри узлов
  }
  asm(id) { return this.byId.get(id); }
  mover(fn) { this.movers.push(fn); }
  get pieces() { return this.asms.flatMap(a => a.parts.flatMap(p => p.pieces)); }
  get parts() { return this.asms.flatMap(a => a.parts); }

  // Вызывается после сборки: запоминает габариты деталей в покое.
  finalize() {
    this.root.updateMatrixWorld(true);
    const rootPos = this.root.position;
    for (const pc of this.pieces) {
      pc.box = new THREE.Box3().setFromObject(pc.obj);
      pc.box.translate(_v.copy(rootPos).negate());
      pc.box.getCenter(pc.center);
    }
    for (const pc of this.pieces) for (const m of pc.meshes) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      if (!m.isInstancedMesh && m.geometry.boundingSphere.radius < 0.025) { m.userData.cast = false; m.castShadow = false; }
    }
    for (const a of this.asms) {
      a.parts = a.parts.filter(p => p.pieces.length);
      a.parts.forEach((p, i) => { p.index = i; p.no = `${a.def.no}.${String(i + 1).padStart(2, '0')}`; });
    }
  }

  // Анимация разборки. dt — секунды; rate — скорость (1 = обычная).
  update(dt, rate = 1) {
    let moving = false;
    const step = dt * rate / 0.95;
    if (this.g !== this.gT) { this.g = approach(this.g, this.gT, step * 0.85); moving = true; }
    if (this.ls !== this.lsT) { this.ls = approach(this.ls, this.lsT, step); moving = true; }
    const ge = ease(this.g);
    for (const a of this.asms) {
      if (a.e !== a.eT) { a.e = approach(a.e, a.eT, step); moving = true; }
      a.group.position.copy(a.gOff).multiplyScalar(ge);
      for (const p of a.parts) for (const pc of p.pieces) {
        const t = ease(clamp((a.e - pc.delay * 0.4) / 0.6));
        pc.wrap.position.copy(pc.off).multiplyScalar(t * this.ls);
      }
    }
    return moving;
  }

  // Габариты конфигурации, к которой идёт анимация (в системе двигателя).
  targetBox(filter = () => true, out = new THREE.Box3()) {
    out.makeEmpty();
    const ge = ease(this.gT);
    for (const a of this.asms) for (const p of a.parts) for (const pc of p.pieces) {
      if (!filter(pc)) continue;
      _box.copy(pc.box);
      _box.translate(_v.copy(a.gOff).multiplyScalar(ge));
      _box.translate(_v.copy(pc.off).multiplyScalar((a.eT >= 0.999 ? 1 : ease(a.eT)) * this.lsT));
      out.union(_box);
    }
    return out;
  }
}

function approach(x, t, s) { return x < t ? Math.min(t, x + s) : Math.max(t, x - s); }

export class Assembly {
  constructor(model, def) {
    this.model = model;
    this.def = def;
    this.id = def.id;
    this.group = new THREE.Group();
    this.group.name = def.id;
    model.root.add(this.group);
    this.parts = def.parts.map((key, i) => new Part(this, key, i));
    this.byKey = new Map(this.parts.map(p => [p.key, p]));
    this.e = 0; this.eT = 0;
    this.gOff = new THREE.Vector3(...def.global);
  }
  add(key, obj, off = [0, 0, 0], opt = {}) {
    const part = this.byKey.get(key);
    if (!part) throw new Error(`Нет детали ${key} в узле ${this.id}`);
    const pc = new Piece(part, obj, off, opt);
    part.pieces.push(pc);
    return pc;
  }
  get meshes() { return this.parts.flatMap(p => p.meshes); }
}

export class Part {
  constructor(asm, key, index) {
    this.asm = asm;
    this.key = key;
    this.def = PARTS[key];
    if (!this.def) throw new Error(`Нет описания детали ${key}`);
    this.index = index;
    this.no = '';
    this.pieces = [];
  }
  get meshes() { return this.pieces.flatMap(pc => pc.meshes); }
  // Точка для номера-выноски: центр экземпляра, ближайшего к центру всей детали.
  anchor(out = new THREE.Vector3()) {
    const pcs = this.pieces;
    if (pcs.length === 1) return pieceWorldCenter(pcs[0], out);
    const c = new THREE.Vector3(), t = new THREE.Vector3();
    for (const pc of pcs) c.add(pieceWorldCenter(pc, t));
    c.multiplyScalar(1 / pcs.length);
    let best = Infinity;
    for (const pc of pcs) { pieceWorldCenter(pc, t); const d = t.distanceToSquared(c); if (d < best) { best = d; out.copy(t); } }
    return out;
  }
}

export function pieceWorldCenter(pc, out) {
  const a = pc.part.asm;
  return out.copy(pc.center).add(pc.wrap.position).add(a.group.position).add(a.model.root.position);
}

export class Piece {
  constructor(part, obj, off, opt) {
    this.part = part;
    this.obj = obj;
    this.wrap = new THREE.Group();
    this.wrap.add(obj);
    part.asm.group.add(this.wrap);
    this.off = off instanceof THREE.Vector3 ? off.clone() : new THREE.Vector3(off[0], off[1], off[2]);
    this.delay = opt.delay ?? 0;
    this.center = new THREE.Vector3();
    this.box = null;
    this.meshes = [];
    this.ghost = false;
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.userData.piece = this;
      o.userData.base = o.material;
      o.userData.cast = opt.shadow !== false && !o.userData.noShadow;
      o.castShadow = o.userData.cast;
      o.receiveShadow = true;
      this.meshes.push(o);
    });
  }
  setGhost(on, ghostMat) {
    if (this.ghost === on) return;
    this.ghost = on;
    for (const m of this.meshes) {
      m.material = on ? ghostMat : m.userData.base;
      m.castShadow = on ? false : m.userData.cast;
      m.renderOrder = on ? 2 : 0;
    }
  }
}

export { PARTS, ASSEMBLIES };
