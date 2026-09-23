// Симуляция: время суток, наряды на улицах, вызовы 102, здания полиции, расползание преступности, экономика.
// 1 секунда реального времени на скорости ×1 = 1 игровая минута. Машины едут в метрах за реальную секунду.
import {ROLES, TYPES, CALLS, SERVICE, FM, FF, LN} from './data.js';
import {centroid, ringArea} from './osm.js';

export const SPEEDS = [0, 1, 2, 4];
const pick = a => a[Math.floor(Math.random() * a.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 9);
export const chance = (P, D) => clamp(1 / (1 + Math.exp(-4 * (P / D - .85))), .03, .97);
export const CAR_COST = 800, HIRE_COST = 350, WIN = 80;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Game {
  constructor(map, graph, hooks) {
    this.map = map; this.g = graph; this.hooks = hooks;
    this.B = map.b.map((b, i) => {
      const [x, y] = centroid(b.p);
      return {i, x, y, area: Math.abs(ringArea(b.p)), h: b.h, node: graph.nearest(x, y), addr: b.a || '', name: b.n || '', k: b.k};
    });
    const cell = 50, N = Math.ceil(map.r * 2.2 / cell), o = -N * cell / 2;
    this.grid = {N, cell, o, c: new Float32Array(N * N), inside: new Uint8Array(N * N)};
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.grid.inside[j * N + i] = Math.hypot(o + (i + .5) * cell, o + (j + .5) * cell) <= map.r * 1.02 ? 1 : 0;
    this.nInside = this.grid.inside.reduce((a, v) => a + v, 0);
    this.cellB = new Map();
    for (const b of this.B) { b.cell = this.cellOf(b.x, b.y); if (b.cell >= 0 && b.node >= 0) { let l = this.cellB.get(b.cell); if (!l) this.cellB.set(b.cell, l = []); l.push(b.i); } }
    this.prot = new Uint8Array(N * N); this.cctv = new Uint8Array(N * N); this.hideMask = new Uint8Array(N * N);
    this.gangRoof = new Uint8Array(this.B.length);
    this.acc = 0;
  }
  cellOf(x, y) {
    const {N, cell, o} = this.grid, i = Math.floor((x - o) / cell), j = Math.floor((y - o) / cell);
    return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
  }
  nx(n) { return this.g.x[n]; }
  ny(n) { return this.g.y[n]; }

  /* ---------- новая игра / загрузка ---------- */
  newGame() {
    this.s = {v: 1, T: 8 * 60, speed: 1, money: 2600, trust: 55, hq: -1, roles: {}, officers: [], units: [], inc: [], hide: [],
      stats: {ok: 0, fail: 0, miss: 0, calls: 0}, lastPay: 1, won: false, lost: false, unitNo: 0};
    const {N, c, inside} = this.grid;
    for (let k = 0; k < N * N; k++) c[k] = inside[k] ? 10 + Math.random() * 20 : 0;
    const far = this.B.filter(b => Math.hypot(b.x, b.y) > this.map.r * .45 && b.node >= 0);
    for (let s = 0; s < 3 && far.length; s++) { const b = pick(far); this.bump(b.x, b.y, 96, 115); }
    this.hourly(true);
  }
  load(d) {
    this.s = d.s;
    this.grid.c.set(d.crime);
    this.recalcZones(); this.hourly(true);
  }
  save() { return {s: this.s, crime: Array.from(this.grid.c, v => Math.round(v * 10) / 10)}; }
  bump(x, y, peak, rad) {
    const {N, cell, o, c, inside} = this.grid;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, d = Math.hypot(o + (i + .5) * cell - x, o + (j + .5) * cell - y);
      if (inside[k] && d < rad) c[k] = Math.max(c[k], peak * (1 - d / rad * .5));
    }
  }

  /* ---------- время ---------- */
  get day() { return Math.floor(this.s.T / 1440) + 1; }
  get hour() { return (this.s.T % 1440) / 60; }
  isNight() { const h = this.hour; return h >= 21 || h < 6; }
  clock() { const m = Math.floor(this.s.T % 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  // контроль — доля района, которая в зонах участка, опорных пунктов или камер и где нет банд
  control() { const {c, inside} = this.grid; let ok = 0; for (let k = 0; k < c.length; k++) if (inside[k] && (this.prot[k] || this.cctv[k]) && c[k] < 40) ok++; return Math.round(ok / this.nInside * 100); }
  avgCrime() { const {c, inside} = this.grid; let s = 0; for (let k = 0; k < c.length; k++) if (inside[k]) s += c[k]; return s / this.nInside; }

  /* ---------- здания полиции ---------- */
  bases() { return Object.entries(this.s.roles).filter(([, t]) => t === 'hq' || t === 'post').map(([bi, t]) => ({b: this.B[bi], r: ROLES[t].radius, t})); }
  zones() {
    const z = [];
    for (const [bi, t] of Object.entries(this.s.roles)) if (ROLES[t].radius) { const b = this.B[bi]; z.push({x: b.x, y: b.y, r: ROLES[t].radius, color: ROLES[t].color}); }
    return z;
  }
  inZone(b) { return this.bases().some(z => Math.hypot(z.b.x - b.x, z.b.y - b.y) <= z.r); }
  countRole(t) { return Object.values(this.s.roles).filter(v => v === t).length; }
  unitCap() { return Object.values(this.s.roles).reduce((a, t) => a + (ROLES[t].units || 0), 0); }
  bedCap() { return Object.values(this.s.roles).reduce((a, t) => a + (ROLES[t].beds || 0), 0); }
  recalcZones() {
    const {N, cell, o} = this.grid;
    this.prot.fill(0); this.cctv.fill(0);
    for (const [bi, t] of Object.entries(this.s.roles)) {
      const R = ROLES[t].radius; if (!R) continue;
      const b = this.B[bi], mask = t === 'cctv' ? this.cctv : this.prot;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (Math.hypot(o + (i + .5) * cell - b.x, o + (j + .5) * cell - b.y) <= R) mask[j * N + i] = 1;
    }
    this.hooks.zones();
  }
  canCapture(bi, type) {
    const R = ROLES[type], b = this.B[bi], s = this.s;
    if (s.roles[bi]) return 'Здание уже занято полицией';
    if (b.node < 0) return 'К зданию нет подъезда';
    if (b.area < R.minArea) return `Мало места: нужно от ${R.minArea} м², здесь ${Math.round(b.area)} м²`;
    if (this.grid.c[b.cell] >= 70) return 'Квартал под бандой — сначала отбей его';
    if (type === 'hq') return s.hq >= 0 ? 'Участок уже есть' : '';
    if (s.hq < 0) return 'Сначала выбери здание для участка';
    if (R.limit && this.countRole(type) >= R.limit) return 'Такое здание уже есть';
    if (!this.inZone(b)) return 'Здание вне зоны контроля — поставь рядом опорный пункт';
    if (s.money < R.cost) return `Не хватает ${R.cost - Math.floor(s.money)} ₽`;
    return '';
  }
  capture(bi, type) {
    const why = this.canCapture(bi, type);
    if (why) return this.hooks.toast(why);
    const s = this.s, R = ROLES[type];
    s.money -= R.cost; s.roles[bi] = type;
    this.hooks.role(bi, R.color);
    if (type === 'hq') {
      s.hq = bi;
      for (let k = 0; k < 4; k++) s.officers.push(this.mkOfficer());
      for (let k = 0; k < 2; k++) s.units.push(this.mkUnit(bi));
      this.assignCrews();
      this.hooks.log(`🏛️ Участок открыт: ${this.bName(bi)}. Два экипажа готовы к работе.`, 'good');
    } else this.hooks.log(`${R.icon} ${R.n}: ${this.bName(bi)}`, 'good');
    this.recalcZones();
  }
  release(bi) {
    const t = this.s.roles[bi];
    if (!t || t === 'hq') return;
    delete this.s.roles[bi];
    this.hooks.role(bi, null);
    for (const u of this.s.units) if (u.base === +bi) u.base = this.s.hq;
    this.hooks.log(`Здание освобождено: ${this.bName(bi)}`);
    this.recalcZones();
  }
  bName(bi) { const b = this.B[bi]; return b.name || b.addr || 'дом без адреса'; }

  /* ---------- люди и машины ---------- */
  mkOfficer() {
    const fem = Math.random() < .35;
    return {id: uid(), name: `${pick(fem ? FF : FM)} ${pick(LN)}${fem ? 'а' : ''}`, fem, skill: rint(3, 5), xp: 0, fat: rint(0, 15), hurt: 0, unit: null};
  }
  mkUnit(base) {
    const b = this.B[base];
    this.s.unitNo++;
    return {id: uid(), no: this.s.unitNo, crew: [], x: this.nx(b.node), y: this.ny(b.node), node: b.node, path: null, pi: 0, state: 'base', base, heading: 0, target: null};
  }
  hire() {
    const s = this.s;
    if (s.hq < 0) return;
    if (s.officers.length >= this.bedCap()) return this.hooks.toast('Нет мест для новых сотрудников — займи общежитие');
    if (s.money < HIRE_COST) return this.hooks.toast(`Не хватает ${HIRE_COST - Math.floor(s.money)} ₽`);
    s.money -= HIRE_COST;
    const o = this.mkOfficer(); s.officers.push(o);
    this.assignCrews();
    this.hooks.log(`👮 Принят на службу: ${o.name}, навык ${o.skill}`);
  }
  buyCar() {
    const s = this.s;
    if (s.hq < 0) return;
    if (s.units.length >= this.unitCap()) return this.hooks.toast('Негде поставить машину — займи гараж или опорный пункт');
    if (s.money < CAR_COST) return this.hooks.toast(`Не хватает ${CAR_COST - Math.floor(s.money)} ₽`);
    s.money -= CAR_COST;
    const u = this.mkUnit(s.hq); s.units.push(u);
    this.assignCrews();
    this.hooks.log(`🚓 Новый экипаж ${this.unitLabel(u)}${u.crew.length < 2 ? ' — нужны люди в экипаж' : ''}`);
  }
  ofc(id) { return this.s.officers.find(o => o.id === id); }
  unitById(id) { return this.s.units.find(u => u.id === id); }
  unitLabel(u) { return `7-${String(u.no).padStart(2, '0')}`; }
  crewOf(u) { return u.crew.map(id => this.ofc(id)).filter(Boolean); }
  activeCrew(u) { return this.crewOf(u).filter(o => !o.hurt); }
  unitPower(u) { return Math.round(this.activeCrew(u).reduce((a, o) => a + o.skill * 3 * (o.fat > 75 ? .7 : o.fat > 50 ? .88 : 1), 0)); }
  assignCrews() {
    for (const u of this.s.units) {
      u.crew = u.crew.filter(id => { const o = this.ofc(id); return o && !(o.hurt && u.state === 'base' && this.freeOfficers().length); });
      for (const o of this.s.officers) if (o.unit === u.id && !u.crew.includes(o.id)) o.unit = null;
      while (u.crew.length < 2) {
        const f = this.freeOfficers()[0];
        if (!f) break;
        f.unit = u.id; u.crew.push(f.id);
      }
    }
  }
  freeOfficers() { return this.s.officers.filter(o => !o.unit && !o.hurt); }
  baseFor(u) { // возвращаемся на ближайшую базу
    let best = this.s.hq, bd = Infinity;
    for (const [bi, t] of Object.entries(this.s.roles)) if (t === 'hq' || t === 'post' || t === 'garage') {
      const b = this.B[bi], d = Math.hypot(b.x - u.x, b.y - u.y);
      if (d < bd) { bd = d; best = +bi; }
    }
    return best;
  }
  unitState(u) {
    if (!this.activeCrew(u).length) return u.state === 'base' ? 'Нет экипажа' : 'Экипаж ранен';
    return {base: 'На базе', respond: 'Едет на вызов', scene: 'На месте', move: 'Едет', hold: 'На позиции', patrol: 'Патрулирует', return: 'Возвращается'}[u.state] || u.state;
  }

  /* ---------- приказы ---------- */
  order(u, cmd) {
    if (!u) return;
    if (!this.activeCrew(u).length && cmd.t !== 'base') return this.hooks.toast(`${this.unitLabel(u)}: нет экипажа`);
    this.detach(u);
    let dest;
    if (cmd.t === 'inc') {
      const inc = this.s.inc.find(i => i.id === cmd.id);
      if (!inc) return;
      if (inc.status === 'new') inc.status = 'accepted';
      inc.units.push(u.id);
      u.state = 'respond'; u.target = {t: 'inc', id: inc.id}; dest = inc.node;
    } else if (cmd.t === 'goto' || cmd.t === 'patrol') {
      dest = this.g.nearest(cmd.x, cmd.y);
      u.state = cmd.t === 'goto' ? 'move' : 'patrol'; u.target = {t: cmd.t, x: cmd.x, y: cmd.y};
    } else {
      u.base = cmd.bi !== undefined && this.s.roles[cmd.bi] ? +cmd.bi : this.baseFor(u); dest = this.B[u.base].node;
      u.state = 'return'; u.target = null;
    }
    const p = this.g.path(u.node, dest);
    if (!p) return this.hooks.toast('Туда не проехать');
    u.path = p; u.pi = 0;
    if (p.length <= 1) { u.path = null; this.arrive(u); }
  }
  detach(u) { // снимаем наряд с прежнего вызова
    if (u.target && u.target.t === 'inc') {
      const inc = this.s.inc.find(i => i.id === u.target.id);
      if (inc) inc.units = inc.units.filter(id => id !== u.id);
    }
    u.target = null;
  }
  nearestFree(inc) {
    let best = null, bd = Infinity;
    for (const u of this.s.units) {
      if (!['base', 'hold', 'patrol', 'move'].includes(u.state) || !this.activeCrew(u).length) continue;
      const d = Math.hypot(u.x - inc.x, u.y - inc.y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  moveUnit(u, secs) {
    if (!u.path) return;
    let rem = (u.state === 'respond' ? 24 : 15) * secs;
    while (rem > 0 && u.pi < u.path.length) {
      const n = u.path[u.pi], dx = this.nx(n) - u.x, dy = this.ny(n) - u.y, d = Math.hypot(dx, dy);
      if (d > .05) u.heading = Math.atan2(dy, dx);
      if (d <= rem) { u.x = this.nx(n); u.y = this.ny(n); u.node = n; u.pi++; rem -= d; }
      else { u.x += dx / d * rem; u.y += dy / d * rem; rem = 0; }
    }
    if (u.pi >= u.path.length) { u.path = null; this.arrive(u); }
  }
  arrive(u) {
    const s = this.s;
    if (u.state === 'respond') {
      const inc = s.inc.find(i => u.target && i.id === u.target.id);
      if (!inc) return this.order(u, {t: 'base'});
      if (inc.kind !== 'police') return this.falseCall(inc, u);
      u.state = 'scene';
      if (inc.status !== 'scene') { inc.status = 'scene'; inc.work = inc.raid ? 30 : TYPES[inc.type].work; }
    } else if (u.state === 'move') u.state = 'hold';
    else if (u.state === 'patrol') {
      const n = this.g.randomNear(u.target.x, u.target.y, 170), p = this.g.path(u.node, n);
      if (p && p.length > 1) { u.path = p; u.pi = 0; }
    } else if (u.state === 'return') { u.state = 'base'; this.assignCrews(); }
  }

  /* ---------- вызовы 102 ---------- */
  spawnIncident() {
    const s = this.s, {c} = this.grid, night = this.isNight();
    // дом выбираем с весом по преступности квартала
    let tot = 0; const cand = [];
    for (const [cell, list] of this.cellB) { const w = Math.pow(c[cell] + 8, 1.6) * list.length; cand.push([cell, list, w]); tot += w; }
    let x = Math.random() * tot, bi = -1;
    for (const [, list, w] of cand) { x -= w; if (x <= 0) { bi = pick(list); break; } }
    if (bi < 0) return;
    const b = this.B[bi], cv = c[b.cell], gang = cv >= 70;
    const r = Math.random(), fakeP = night ? .24 : .17;
    let kind = r < .6 ? 'police' : r < .6 + fakeP ? 'fake' : 'service';
    if (gang && kind === 'service') kind = 'police';
    let pool = CALLS.filter(q => kind === 'service' ? q.k === 'ems' || q.k === 'fire' : q.k === kind);
    if (kind === 'police' && gang && Math.random() < .55) pool = pool.filter(q => q.type === 'assault');
    else if (kind === 'police' && !gang && Math.random() < .7) pool = pool.filter(q => q.type !== 'assault');
    const q = pick(pool);
    const diff = Math.round(TYPES[q.type].base + cv * .2 + (night ? 5 : 0) + (q.urgent ? 4 : 0) + rint(0, 4));
    s.inc.push({id: uid(), bi, x: b.x, y: b.y, h: b.h, node: b.node, cell: b.cell, kind: q.k, type: q.type, title: q.title, open: q.open, detail: q.detail,
      urgent: !!q.urgent, diff, known: !!this.cctv[b.cell], revealed: false, status: 'new', t0: s.T, callEnd: s.T + 20,
      deadline: s.T + (q.urgent ? rint(45, 70) : rint(90, 150)), units: [], work: 0, addr: b.addr || b.name || 'дом без адреса'});
    s.stats.calls++;
    this.hooks.call();
  }
  clarify(inc) {
    if (inc.revealed) return;
    inc.revealed = true; inc.known = true; inc.callEnd += 4; inc.deadline -= 3;
  }
  decide(inc, act) {
    const s = this.s, truth = inc.kind === 'ems' || inc.kind === 'fire' ? inc.kind : inc.kind;
    if (act === 'accept') { inc.status = 'accepted'; return; }
    let rep = 0, text;
    if (act === 'drop') {
      if (truth === 'fake') { rep = 1; text = `Шутник вычислен: «${inc.title}»`; }
      else if (truth === 'police') { rep = -3; text = `Отказ в помощи: «${inc.title}» был настоящим вызовом`; this.grid.c[inc.cell] += 4; }
      else { rep = -2; text = `Человек остался без помощи: нужно было передать в ${SERVICE[truth]}`; }
    } else if (truth === act) { rep = 1; text = `Верно: «${inc.title}» — передано в ${SERVICE[act]}`; }
    else if (truth === 'fake') { rep = -1; text = `Служба съездила к шутникам: «${inc.title}»`; }
    else if (truth === 'police') { rep = -2; text = `Это было дело полиции: «${inc.title}»`; this.grid.c[inc.cell] += 3; }
    else text = `Не та служба: нужна была ${SERVICE[truth]}`;
    s.trust = clamp(s.trust + rep, 0, 100);
    s.inc = s.inc.filter(i => i !== inc);
    this.hooks.log(`${rep > 0 ? '✔' : rep < 0 ? '✖' : '•'} ${text}${rep ? ` (${rep > 0 ? '+' : '−'}${Math.abs(rep)} ★)` : ''}`, rep > 0 ? 'good' : rep < 0 ? 'bad' : '');
  }
  falseCall(inc, u) {
    const s = this.s;
    if (inc.kind === 'fake') { s.trust = clamp(s.trust - 1, 0, 100); this.hooks.log(`✖ ${this.unitLabel(u)} на месте: никого нет — «${inc.title}» оказался шуткой (−1 ★)`, 'bad'); }
    else this.hooks.log(`• ${this.unitLabel(u)} на месте: помощь нужна не полиции — экипаж сам вызвал ${SERVICE[inc.kind]}`);
    this.finish(inc);
  }
  finish(inc) {
    const s = this.s;
    s.inc = s.inc.filter(i => i !== inc);
    for (const u of s.units) if (u.target && u.target.t === 'inc' && u.target.id === inc.id) { u.target = null; this.order(u, {t: 'base'}); }
    if (inc.raid) s.hide = s.hide.filter(h => h.bi !== inc.bi || !inc.done);
  }
  resolve(inc) {
    const s = this.s, units = s.units.filter(u => u.state === 'scene' && u.target && u.target.id === inc.id);
    const P = units.reduce((a, u) => a + this.unitPower(u), 0), D = inc.diff, ok = Math.random() < chance(P, D);
    const crew = units.flatMap(u => this.activeCrew(u)), {c} = this.grid;
    if (ok) {
      const money = Math.round((60 + D * 6) * (inc.raid ? 2 : 1));
      s.money += money; s.trust = clamp(s.trust + (inc.raid ? 5 : inc.urgent ? 3 : 2), 0, 100); s.stats.ok++;
      if (inc.raid) { this.clearArea(inc.x, inc.y, 120, 40); s.hide = s.hide.filter(h => h.bi !== inc.bi); }
      else { c[inc.cell] = Math.max(0, c[inc.cell] - 14); }
      for (const o of crew) { o.xp += inc.raid ? 12 : 6; if (o.xp >= o.skill * 20 && o.skill < 10) { o.xp = 0; o.skill++; this.hooks.log(`⬆ ${o.name}: навык ${o.skill}`, 'good'); } }
      this.hooks.log(`✔ ${inc.raid ? 'Притон разгромлен' : inc.title}: ${inc.addr} · +${money} ₽`, 'good');
    } else {
      s.trust = clamp(s.trust - (inc.raid ? 3 : 2), 0, 100); s.stats.fail++;
      c[inc.cell] = Math.min(100, c[inc.cell] + 6);
      const hurt = [];
      for (const o of crew) if (Math.random() < (inc.raid ? .45 : .3)) { o.hurt = s.T + 360; hurt.push(o.name); }
      this.hooks.log(`✖ ${inc.raid ? 'Рейд провален' : inc.title}: ${inc.addr}${hurt.length ? ` · ранены: ${hurt.join(', ')}` : ''}`, 'bad');
    }
    for (const o of crew) o.fat = Math.min(100, o.fat + 8);
    this.finish(inc);
  }
  clearArea(x, y, r, amount) {
    const {N, cell, o, c} = this.grid;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const d = Math.hypot(o + (i + .5) * cell - x, o + (j + .5) * cell - y);
      if (d < r) c[j * N + i] = Math.max(0, c[j * N + i] - amount * (1 - d / r * .5));
    }
  }
  raid(bi, units) {
    const s = this.s, h = s.hide.find(q => q.bi === bi);
    if (!h || !units.length) return;
    let inc = s.inc.find(i => i.raid && i.bi === bi);
    if (!inc) {
      const b = this.B[bi];
      inc = {id: uid(), bi, x: b.x, y: b.y, h: b.h, node: b.node, cell: b.cell, kind: 'police', type: 'assault', raid: true, title: 'Рейд на притон',
        open: 'Логово банды. Чем больше экипажей, тем выше шанс.', detail: '', urgent: false, diff: Math.round(40 + this.grid.c[b.cell] * .15), known: true, revealed: true,
        status: 'accepted', t0: s.T, callEnd: s.T, deadline: s.T + 300, units: [], work: 0, addr: b.addr || b.name || 'притон'};
      s.inc.push(inc);
    }
    for (const u of units) this.order(u, {t: 'inc', id: inc.id});
  }

  /* ---------- течение времени ---------- */
  tick(dtReal) {
    const s = this.s;
    if (!s || s.lost || s.hq < 0) return;
    const mult = SPEEDS[s.speed];
    if (!mult) return;
    const secs = Math.min(dtReal, .1) * mult;
    for (const u of s.units) this.moveUnit(u, secs);
    this.acc += secs;
    let steps = 0;
    while (this.acc >= 1 && steps++ < 10) { this.acc -= 1; this.minute(); }
  }
  minute() {
    const s = this.s;
    s.T += 1;
    this.crimeStep();
    // люди: отдых на базе, усталость в поле, выздоровление, учёба в академии
    const academy = this.countRole('academy') > 0;
    for (const o of s.officers) {
      if (o.hurt && s.T >= o.hurt) { o.hurt = 0; this.hooks.log(`🩹 ${o.name} вернулся в строй`); this.assignCrews(); }
      const u = o.unit ? this.unitById(o.unit) : null, home = !u || u.state === 'base';
      o.fat = clamp(o.fat + (home ? -.25 : u.state === 'scene' ? .08 : .04), 0, 100);
      if (home && academy && o.skill < 10) { o.xp += .05; if (o.xp >= o.skill * 20) { o.xp = 0; o.skill++; this.hooks.log(`🎓 ${o.name}: навык ${o.skill}`, 'good'); } }
    }
    // вызовы: трубку бросили, наряд не успел, работа на месте
    for (const inc of [...s.inc]) {
      if (inc.status === 'new' && s.T >= inc.callEnd) {
        s.inc = s.inc.filter(i => i !== inc);
        if (inc.kind === 'police') { s.trust = clamp(s.trust - 1, 0, 100); this.grid.c[inc.cell] += 2; this.hooks.log(`✖ Звонок без ответа: «${inc.title}» (−1 ★)`, 'bad'); }
        continue;
      }
      if (inc.status !== 'scene' && s.T >= inc.deadline) {
        if (inc.kind === 'police') { s.trust = clamp(s.trust - (inc.urgent ? 3 : 2), 0, 100); this.grid.c[inc.cell] = Math.min(100, this.grid.c[inc.cell] + 6); s.stats.miss++; this.hooks.log(`✖ Наряд не успел: «${inc.title}», ${inc.addr}`, 'bad'); }
        this.finish(inc);
        continue;
      }
      if (inc.status === 'scene') {
        const here = s.units.filter(u => u.state === 'scene' && u.target && u.target.id === inc.id).length;
        if (!here) { inc.status = 'accepted'; continue; }
        inc.work -= 1 + .5 * (here - 1);
        if (inc.work <= 0) this.resolve(inc);
      }
    }
    // новые звонки: ночью и в неблагополучных районах чаще
    const active = s.inc.filter(i => !i.raid).length;
    const rate = (this.isNight() ? 1.6 : .8) * (.5 + this.avgCrime() / 60) * (1 + s.units.length * .1);
    if (active < 8 && Math.random() < rate / 60) this.spawnIncident();
    if (s.T % 1440 === 0) this.newGang();
    if (s.T % 10 === 0) this.syncRoofs();
    if (s.T % 60 === 0) this.hourly(false);
    // утренний отчёт в 8:00: бюджет от города, зарплаты, содержание зданий
    if (this.hour >= 8 && s.lastPay < this.day) {
      s.lastPay = this.day;
      const ctrl = this.control(), income = Math.round(350 + s.trust * 10 + ctrl * 6);
      const costs = s.officers.length * 45 + s.units.length * 35 + Object.values(s.roles).reduce((a, t) => a + ROLES[t].upkeep, 0);
      s.money += income - costs;
      this.hooks.log(`☀ Утро дня ${this.day}: бюджет города +${income} ₽, зарплаты и содержание −${costs} ₽`, income >= costs ? 'good' : 'bad');
      this.hooks.morning(income, costs);
    }
    if (s.trust <= 0 && !s.lost) { s.lost = true; this.hooks.end(false); }
  }
  // со второго дня по ночам в район заходят новые банды — туда, где полиции нет
  newGang() {
    if (this.day < 2 || Math.random() > Math.min(.8, .3 + this.day * .1)) return;
    const hq = this.B[this.s.hq], far = this.B.filter(b => b.node >= 0 && b.cell >= 0 && !this.prot[b.cell] && !this.cctv[b.cell] && !this.s.roles[b.i] && Math.hypot(b.x - hq.x, b.y - hq.y) > 250);
    if (!far.length) return;
    const b = pick(far);
    this.bump(b.x, b.y, 92, 85);
    this.hooks.log(`☠ В район зашла новая банда: ${this.bName(b.i)}. Ночью она начнёт расползаться.`, 'bad');
    this.syncRoofs();
  }
  crimeStep() {
    const {N, c, inside} = this.grid, night = this.isNight(), next = c.slice();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (!inside[k]) continue;
      const v = c[k];
      if (v >= 70) { // банда расползается на соседние кварталы, ночью — быстро
        const rate = (night ? .085 : .015) * (this.hideMask[k] ? 1.5 : 1);
        for (const [di, dj] of DIRS) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const kk = jj * N + ii;
          if (inside[kk] && c[kk] < v) next[kk] += rate * (this.prot[kk] ? .3 : 1);
        }
        if (night) next[k] += .01;
      }
      if (this.prot[k]) next[k] -= .025;
      if (this.cctv[k]) next[k] -= .04;
      if (v > 14 && v < 70 && !this.prot[k]) next[k] -= .003;
    }
    for (const u of this.s.units) {
      if (u.state === 'base' || !this.activeCrew(u).length) continue;
      const k = this.cellOf(u.x, u.y);
      if (k >= 0) next[k] -= u.state === 'patrol' ? .3 : .12;
    }
    for (let k = 0; k < next.length; k++) next[k] = clamp(next[k], 0, 100);
    c.set(next);
  }
  // раз в час: притоны банд, крыши, победа
  hourly(init) {
    const {N, c, inside} = this.grid, s = this.s, seen = new Uint8Array(N * N);
    this.hideMask.fill(0);
    s.hide = s.hide.filter(h => c[this.B[h.bi].cell] >= 60);
    for (let k = 0; k < N * N; k++) {
      if (seen[k] || !inside[k] || c[k] < 70) continue;
      const region = [], st = [k]; seen[k] = 1;
      while (st.length) {
        const q = st.pop(); region.push(q);
        const i = q % N, j = (q - i) / N;
        for (const [di, dj] of DIRS) {
          const ii = i + di, jj = j + dj, kk = jj * N + ii;
          if (ii >= 0 && jj >= 0 && ii < N && jj < N && !seen[kk] && inside[kk] && c[kk] >= 70) { seen[kk] = 1; st.push(kk); }
        }
      }
      let has = s.hide.some(h => region.includes(this.B[h.bi].cell));
      if (!has && region.length >= 3) {
        const cands = region.flatMap(q => this.cellB.get(q) || []).filter(bi => !s.roles[bi]);
        if (cands.length) { const bi = pick(cands); s.hide.push({bi}); has = true; if (!init) this.hooks.log(`☠ Банда устроила притон: ${this.bName(bi)}`, 'bad'); }
      }
      if (has) for (const q of region) this.hideMask[q] = 1;
    }
    this.syncRoofs();
    if (!init && !s.won && this.control() >= WIN) { s.won = true; this.hooks.end(true); }
  }
  syncRoofs() {
    const c = this.grid.c;
    for (const b of this.B) {
      const g = b.cell >= 0 && c[b.cell] >= 70 && !this.s.roles[b.i] ? 1 : 0;
      if (g !== this.gangRoof[b.i]) { this.gangRoof[b.i] = g; this.hooks.gang(b.i, !!g); }
    }
    this.hooks.crime();
  }
}
