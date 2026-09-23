// Камера стратегии: цель на земле + расстояние + поворот + наклон. Плавное приближение к желаемым значениям.
import * as THREE from 'three';

export class RTSCamera {
  constructor(camera, bound) {
    this.cam = camera;
    this.bound = bound;                 // радиус карты — дальше цель не уходит
    this.t = new THREE.Vector3(0, 0, 0); this.T = this.t.clone();
    this.d = 620; this.D = 620;         // расстояние
    this.yaw = -.55; this.YAW = -.55;   // поворот вокруг вертикали
    this.pitch = .95; this.PITCH = .95; // наклон: 0 — горизонт, π/2 — строго сверху
    this.keys = new Set();
  }
  clampTarget() {
    const r = Math.hypot(this.T.x, this.T.z), m = this.bound * 1.05;
    if (r > m) { this.T.x *= m / r; this.T.z *= m / r; }
  }
  // сдвиг в экранных направлениях; dx, dy — доли расстояния
  pan(dx, dy) {
    const s = this.D, cy = Math.cos(this.YAW), sy = Math.sin(this.YAW);
    // «вправо» по экрану и «вперёд» по земле
    this.T.x += (cy * dx - sy * dy) * s;
    this.T.z += (-sy * dx - cy * dy) * s;
    this.clampTarget();
  }
  zoom(f) { this.D = Math.min(1500, Math.max(35, this.D * f)); }
  rotate(dyaw, dpitch) {
    this.YAW += dyaw;
    this.PITCH = Math.min(1.45, Math.max(.35, this.PITCH + dpitch));
  }
  focus(x, z, d) { this.T.set(x, 0, z); if (d) this.D = d; this.clampTarget(); }
  update(dt) {
    const k = this.keys, sp = 0.9 * dt;
    if (k.has('KeyW') || k.has('ArrowUp')) this.pan(0, sp);
    if (k.has('KeyS') || k.has('ArrowDown')) this.pan(0, -sp);
    if (k.has('KeyA') || k.has('ArrowLeft')) this.pan(-sp, 0);
    if (k.has('KeyD') || k.has('ArrowRight')) this.pan(sp, 0);
    if (k.has('KeyQ')) this.rotate(1.6 * dt, 0);
    if (k.has('KeyE')) this.rotate(-1.6 * dt, 0);
    if (k.has('KeyR')) this.rotate(0, .9 * dt);
    if (k.has('KeyF')) this.rotate(0, -.9 * dt);
    const a = 1 - Math.pow(.0005, dt); // плавность, не зависящая от частоты кадров
    this.t.lerp(this.T, a);
    this.d += (this.D - this.d) * a;
    this.yaw += (this.YAW - this.yaw) * a;
    this.pitch += (this.PITCH - this.pitch) * a;
    const h = Math.sin(this.pitch) * this.d, r = Math.cos(this.pitch) * this.d;
    this.cam.position.set(this.t.x + Math.sin(this.yaw) * r, h, this.t.z + Math.cos(this.yaw) * r);
    this.cam.lookAt(this.t.x, 0, this.t.z);
  }
}
