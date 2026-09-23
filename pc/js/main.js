// Точка входа PC-версии: выбор города, загрузка, игровой цикл, мышь и клавиатура, сохранение.
import {loadCity, geocode, PRESETS, DEMO} from './osm.js?v=5';
import {RoadGraph} from './roads.js?v=5';
import {World, QUALITY} from './world.js?v=5';
import {RTSCamera} from './camera.js?v=5';
import {Game} from './game.js?v=5';
import {UI, UNIT_BG, esc} from './ui.js?v=5';
import {ROLES, TYPES} from './data.js?v=5';

const $ = s => document.querySelector(s);
const SAVE = 'uchastok7pc', GFX = 'uchastok7pc.gfx', GFX_AUTO = 'uchastok7pc.gfxauto';
const app = {game: null, world: null, cam: null, ui: null, map: null, place: null, sel: {units: new Set(), b: -1, inc: null}, crimeOn: true, prevSpeed: 1};
window.app = app; // для отладки из консоли

/* ---------- стартовый экран ---------- */
const RADII = [{r: 500, n: 'Маленький · 1 км'}, {r: 650, n: 'Средний · 1,3 км'}, {r: 850, n: 'Большой · 1,7 км'}];
let radius = 650;
function readSave() { try { return JSON.parse(localStorage.getItem(SAVE)); } catch (e) { return null; } }
function initStart() {
  const sv = readSave();
  if (sv && sv.place) $('#cont').innerHTML = `<button type="button" class="btn primary wide" id="contBtn" style="margin-bottom:6px">▶ Продолжить: ${esc(sv.place.name)} · день ${sv.day || 1}</button>`;
  $('#presets').innerHTML = PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${esc(p.name)}</button>`).join('');
  const drawR = () => { $('#radius').innerHTML = RADII.map(x => `<button type="button" class="chip${x.r === radius ? ' on' : ''}" data-radius="${x.r}">${x.n}</button>`).join(''); };
  drawR();
  const find = async () => {
    const q = $('#q').value.trim();
    if (!q) return;
    $('#results').innerHTML = '<div style="color:var(--dim)">Ищу…</div>';
    try {
      const res = await geocode(q);
      $('#results').innerHTML = res.length ? res.map((x, i) => `<button type="button" data-res="${i}">📍 ${esc(x.name)}</button>`).join('') : '<div style="color:var(--dim)">Ничего не нашлось — попробуй иначе.</div>';
      app.found = res;
    } catch (e) { $('#results').innerHTML = `<div style="color:var(--gold)">${esc(e.message)}</div>`; }
  };
  $('#find').onclick = find;
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
  $('#start').addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'contBtn') start(sv.place, sv);
    else if (t.id === 'demo') start({name: DEMO.name, lat: DEMO.lat, lon: DEMO.lon, r: DEMO.r});
    else if (t.dataset.preset !== undefined) { const p = PRESETS[+t.dataset.preset]; start({...p, r: radius}); }
    else if (t.dataset.res !== undefined) { const p = app.found[+t.dataset.res]; start({name: p.name.split(',').slice(0, 3).join(','), lat: p.lat, lon: p.lon, r: radius}); }
    else if (t.dataset.radius) { radius = +t.dataset.radius; drawR(); }
  });
}
async function start(place, saved) {
  unlockAudio();
  $('#start').hidden = true; $('#loading').hidden = false;
  const say = t => { $('#loadText').textContent = t; };
  try {
    const map = await loadCity(place, say);
    say('Строю город в 3D…');
    await new Promise(r => setTimeout(r, 30));
    boot(map, place, saved);
    $('#loading').hidden = true;
  } catch (e) {
    console.error(e);
    $('#loading').hidden = true; $('#start').hidden = false;
    $('#results').innerHTML = `<div style="color:var(--gold)">${esc(e.message || 'Не удалось загрузить карту')}</div>`;
  }
}

/* ---------- качество графики: авто (снижается само, если кадров мало) или выбранное вручную ---------- */
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
let gfxMode = store(GFX) || 'auto';
const gfxLevel = () => gfxMode === 'auto' ? (QUALITY[store(GFX_AUTO)] ? store(GFX_AUTO) : 'medium') : gfxMode;
const GFX_ORDER = ['auto', 'high', 'medium', 'low'];
function setGfx(mode) {
  gfxMode = mode; store(GFX, mode);
  if (app.world) app.world.setQuality(gfxLevel());
  fps.bad = 0; fps.skip = 2;
  drawGfx();
}
function drawGfx() {
  const q = QUALITY[gfxLevel()].n;
  $('#gfxBtn').textContent = `⚙ ${gfxMode === 'auto' ? 'Авто · ' + q : q[0].toUpperCase() + q.slice(1)}${fps.v ? ' · ' + fps.v + ' FPS' : ''}`;
}
function gpuName(renderer) {
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch (e) { return ''; }
}
const fps = {n: 0, t: 0, v: 0, bad: 0, skip: 3};
function countFps(now) {
  fps.n++;
  if (!fps.t) fps.t = now;
  if (now - fps.t < 1000) return;
  fps.v = Math.round(fps.n * 1000 / (now - fps.t)); fps.n = 0; fps.t = now;
  drawGfx();
  if (fps.skip > 0) { fps.skip--; return; } // первые секунды после смены — прогрев, не считаем
  if (gfxMode !== 'auto' || document.hidden) return;
  fps.bad = fps.v < 30 ? fps.bad + 1 : 0;
  const lvl = gfxLevel();
  if (fps.bad >= 3 && lvl !== 'low') {
    const next = lvl === 'high' ? 'medium' : 'low';
    store(GFX_AUTO, next);
    app.world.setQuality(next);
    fps.bad = 0; fps.skip = 2;
    app.ui.toast(`Графика снижена до «${QUALITY[next].n}» ради плавности. G — сменить`);
  }
}

/* ---------- запуск игры ---------- */
// сохранение привязано к номерам домов — если карта пересобрана, старое сохранение ей не подходит
const mapSig = map => `${map.b.length}|${map.rd.length}|${map.b.length ? map.b[0].p.slice(0, 2).join(',') : ''}`;
function boot(map, place, saved) {
  let stale = false;
  if (saved && (saved.v !== 2 || saved.sig !== mapSig(map))) { saved = null; stale = true; }
  app.map = map; app.place = place;
  const graph = new RoadGraph(map.rd);
  const world = app.world = new World($('#view'), map, gfxLevel());
  const gpu = gpuName(world.renderer);
  $('#gfxBtn').title = `Качество графики — G. Авто само снижает качество, если кадров мало.\nВидеокарта: ${gpu || 'неизвестно'}`;
  if (/swiftshader|basic render|llvmpipe|software/i.test(gpu)) { // браузер рисует 3D процессором — будет тормозить при любых настройках
    if (gfxMode === 'auto' && gfxLevel() !== 'low') { store(GFX_AUTO, 'low'); world.setQuality('low'); }
    setTimeout(() => app.ui.modal(`<h1>Браузер рисует без видеокарты</h1>
      <p>В браузере выключено аппаратное ускорение, поэтому 3D считает процессор и игра тормозит при любых настройках. Графика уже снижена, но лучше включить ускорение:</p>
      <p><b>Chrome / Яндекс / Edge:</b> Настройки → Система → «Использовать аппаратное ускорение» → включить и перезапустить браузер.<br><b>Firefox:</b> Настройки → Производительность → снять «Использовать рекомендуемые» и включить «аппаратное ускорение».</p>
      <button type="button" class="btn primary" data-act="continue">Понятно</button>`), 400);
  }
  const cam = app.cam = new RTSCamera(world.camera, map.r);
  const ui = app.ui = new UI(app);
  const game = app.game = new Game(map, graph, {
    log: (t, k) => ui.log(t, k),
    toast: t => ui.toast(t),
    role: (bi, color) => { world.setRole(bi, color); updatePrompt(); },
    zones: () => world.setZones(game.zones()),
    gang: (bi, on) => world.setGang(bi, on),
    crime: () => world.setCrime(game.grid),
    call: () => { ringSound(); if (game.s.speed === 3) setSpeed(1); ui.renderList(); }, // на перемотке ×4 звонок сбрасывает до ×1
    morning: () => {},
    end: win => showEnd(win)
  });
  if (saved) game.load(saved.game); else game.newGame();
  if (stale) setTimeout(() => ui.toast('Карта обновилась — старое сохранение к ней не подходит, начинаем заново'), 600);
  for (const [bi, t] of Object.entries(game.s.roles)) world.setRole(+bi, ROLES[t].color);
  world.setZones(game.zones()); world.setCrime(game.grid);
  if (game.s.hq >= 0) { const b = game.B[game.s.hq]; cam.focus(b.x, -b.y, 520); } else cam.focus(0, 0, 1100);
  $('#city').textContent = map.name;
  for (const id of ['#top', '#left', '#right', '#mini', '#log', '#hint']) $(id).hidden = false;
  ui.buildMini(map);
  onResize(); drawGfx();
  updatePrompt();
  ui.renderTop(); ui.renderList(true); ui.renderRight(true);
  ui.log(saved ? `С возвращением! ${map.name}, день ${game.day}.` : `Город загружен: ${map.b.length} домов, ${map.rd.length} улиц.`, 'good');
  requestAnimationFrame(loop);
}
function updatePrompt() {
  const p = $('#prompt');
  p.hidden = app.game.s.hq >= 0;
  if (!p.hidden) p.innerHTML = 'Выбери здание для участка<small>Кликни по крупному дому и нажми «Открыть участок здесь» справа</small>';
}

/* ---------- цикл ---------- */
let last = performance.now(), tTop = 0, tList = 0, tMini = 0, tSave = 0;
function markers(g, t) {
  const out = [], s = g.s;
  for (const inc of s.inc) {
    const isNew = inc.status === 'new', T = TYPES[inc.type], left = (isNew ? inc.callEnd : inc.deadline) - s.T;
    const icon = isNew ? {bg: '#eef3f8', glyph: '☎', fg: '#10263a', ring: '#10263a'} : inc.raid ? {bg: '#b3263a', glyph: '☠', fg: '#fff', ring: '#fff'} : {bg: T.color, glyph: T.glyph, fg: '#061525', ring: '#fff'};
    out.push({id: inc.id, inc: inc.id, x: inc.x, y: inc.y, h: inc.h, icon, pulse: isNew || inc.urgent || left < 15, fast: left < 15});
  }
  for (const h of s.hide) {
    if (s.inc.some(i => i.raid && i.bi === h.bi)) continue;
    const b = g.B[h.bi];
    out.push({id: 'hide:' + h.bi, hide: h.bi, x: b.x, y: b.y, h: b.h, icon: {bg: '#2a0d14', glyph: '☠', fg: '#ff617b', ring: '#ff617b'}, pulse: false});
  }
  return out;
}
function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  countFps(now);
  const {game: g, world: w, cam, ui} = app, s = g.s;
  g.tick(dt);
  cam.update(dt);
  w.setTime(s.T % 1440);
  w.syncUnits(s.units.map(u => ({id: u.id, x: u.x, y: u.y, heading: u.heading, siren: u.state === 'respond', label: String(u.no).padStart(2, '0'),
    labelBg: g.activeCrew(u).length ? UNIT_BG[u.state] || '#555' : '#555'})), app.sel.units, now / 1000);
  w.syncMarkers(markers(g, now / 1000), now / 1000);
  w.updatePings(dt);
  w.render();
  if (now - tTop > 250) { tTop = now; ui.renderTop(); }
  if (now - tList > 500 && !app.uiHold) { tList = now; ui.renderList(); ui.renderRight(); }
  if (now - tMini > 300) { tMini = now; ui.drawMini(); }
  if (now - tSave > 10000) { tSave = now; saveGame(); }
  requestAnimationFrame(loop);
}
function saveGame() {
  const g = app.game;
  if (!g || g.s.hq < 0 || g.s.lost) return;
  try { localStorage.setItem(SAVE, JSON.stringify({v: 2, sig: mapSig(app.map), place: app.place, day: g.day, game: g.save()})); } catch (e) { /* место кончилось — не страшно */ }
}
addEventListener('beforeunload', saveGame);

/* ---------- выбор ---------- */
function select({units = null, b = -1, inc = null, add = false} = {}) {
  const S = app.sel;
  if (units) { if (add) { for (const id of units) S.units.has(id) ? S.units.delete(id) : S.units.add(id); } else S.units = new Set(units); }
  else if (!add && !inc) S.units = new Set();
  S.b = b; S.inc = inc;
  app.world.setSelected(b);
  app.ui.renderList(true); app.ui.renderRight(true);
}
function focusXY(x, y, d) { app.cam.focus(x, -y, d); }
function pickUnit(px, py) {
  let best = null, bd = 24;
  for (const u of app.game.s.units) for (const h of [3, 14]) {
    const p = app.world.toScreen(u.x, h, u.y);
    const d = Math.hypot(p.x - px, p.y - py);
    if (p.vis && d < bd) { bd = d; best = u; }
  }
  return best;
}
function pickMarker(px, py) {
  let best = null, bd = 26;
  for (const m of markers(app.game, 0)) {
    const p = app.world.toScreen(m.x, m.h + 10, m.y), d = Math.hypot(p.x - px, p.y - py);
    if (p.vis && d < bd) { bd = d; best = m; }
  }
  return best;
}

/* ---------- мышь ---------- */
const cv = $('#view');
let drag = null, hoverT = 0;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (!app.game) return;
  cv.setPointerCapture(e.pointerId); cv.focus();
  drag = {btn: e.button, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, shift: e.shiftKey};
});
cv.addEventListener('pointermove', e => {
  if (!app.game) return;
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) drag.moved = true;
    if (!drag.moved) return;
    if (drag.btn === 0 && drag.shift) {
      const bx = $('#box'); bx.hidden = false;
      Object.assign(bx.style, {left: Math.min(drag.x0, e.clientX) + 'px', top: Math.min(drag.y0, e.clientY) + 'px', width: Math.abs(e.clientX - drag.x0) + 'px', height: Math.abs(e.clientY - drag.y0) + 'px'});
    } else if (drag.btn === 0) {
      const a = app.world.pickGround(e.clientX - dx, e.clientY - dy), b = app.world.pickGround(e.clientX, e.clientY);
      if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < app.cam.d) app.cam.shift(a.x - b.x, b.y - a.y);
      else app.cam.pan(-dx / innerHeight * 1.15, dy / innerHeight * 1.15); // у горизонта — по-старому
    }
    else app.cam.rotate(-dx * .005, dy * .004);
    return;
  }
  const now = performance.now();
  if (now - hoverT < 60) return;
  hoverT = now;
  hover(e.clientX, e.clientY);
});
cv.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null; $('#box').hidden = true;
  if (d.btn === 0 && d.shift && d.moved) return boxSelect(d.x0, d.y0, e.clientX, e.clientY);
  if (d.moved) return;
  if (d.btn === 0) leftClick(e); else if (d.btn === 2) rightClick(e);
});
cv.addEventListener('wheel', e => { // зум к точке под курсором
  e.preventDefault();
  if (!app.cam) return;
  const f = e.deltaY > 0 ? 1.13 : 1 / 1.13, p = app.world.pickGround(e.clientX, e.clientY);
  if (p) app.cam.zoomAt(f, p.x, -p.y); else app.cam.zoom(f);
}, {passive: false});
cv.addEventListener('pointerleave', () => { if (app.ui) app.ui.tip(0, 0, ''); if (app.world) app.world.setHover(-1); });

function hover(px, py) {
  const g = app.game, u = pickUnit(px, py);
  if (u) { app.world.setHover(-1); return app.ui.tip(px, py, `<b>Экипаж ${g.unitLabel(u)}</b><small>${g.unitState(u)} · сила ${g.unitPower(u)}</small>`); }
  const m = pickMarker(px, py);
  if (m) {
    const inc = m.inc && g.s.inc.find(i => i.id === m.inc);
    app.world.setHover(-1);
    return app.ui.tip(px, py, inc ? `<b>${inc.status === 'new' ? 'Входящий звонок' : esc(inc.title)}</b><small>${esc(inc.addr)}</small>` : '<b>☠ Притон банды</b><small>Выбери экипажи и ПКМ — рейд</small>');
  }
  const bi = app.world.pickBuilding(px, py);
  app.world.setHover(bi);
  if (bi < 0) return app.ui.tip(0, 0, '');
  const b = g.B[bi], role = g.s.roles[bi], cr = Math.round(g.grid.c[b.cell] || 0);
  app.ui.tip(px, py, `<b>${esc(b.name || b.addr || 'Дом без адреса')}</b><small>${role ? ROLES[role].icon + ' ' + ROLES[role].n : `преступность ${cr}%`}${b.name && b.addr ? ' · ' + esc(b.addr) : ''}</small>`);
}
function leftClick(e) {
  const g = app.game, u = pickUnit(e.clientX, e.clientY);
  if (u) return select({units: [u.id], add: e.shiftKey});
  const m = pickMarker(e.clientX, e.clientY);
  if (m) return m.inc ? select({inc: m.inc}) : select({b: m.hide});
  const bi = app.world.pickBuilding(e.clientX, e.clientY);
  select({b: bi});
}
function rightClick(e) {
  const g = app.game, units = [...app.sel.units].map(id => g.unitById(id)).filter(Boolean);
  if (!units.length) return;
  const m = pickMarker(e.clientX, e.clientY);
  if (m && m.inc) {
    for (const u of units) g.order(u, {t: 'inc', id: m.inc});
    app.world.ping(m.x, m.y, '#ff617b'); return;
  }
  const bi = m ? m.hide : app.world.pickBuilding(e.clientX, e.clientY);
  if (bi >= 0 && g.s.hide.some(h => h.bi === bi)) { g.raid(bi, units); app.world.ping(g.B[bi].x, g.B[bi].y, '#ff617b'); return; }
  const role = bi >= 0 ? g.s.roles[bi] : null;
  if (role === 'hq' || role === 'post' || role === 'garage') { for (const u of units) g.order(u, {t: 'base', bi}); app.world.ping(g.B[bi].x, g.B[bi].y, '#55caff'); return; }
  const p = bi >= 0 ? {x: g.B[bi].x, y: g.B[bi].y} : app.world.pickGround(e.clientX, e.clientY);
  if (!p) return;
  units.forEach((u, k) => g.order(u, {t: e.shiftKey ? 'patrol' : 'goto', x: p.x + (k % 3 - 1) * 14, y: p.y + Math.floor(k / 3) * 14}));
  app.world.ping(p.x, p.y, e.shiftKey ? '#4be2b3' : '#b6ff5c');
  app.ui.renderRight(true);
}
function boxSelect(x0, y0, x1, y1) {
  const [a, b, c, d] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
  const ids = app.game.s.units.filter(u => { const p = app.world.toScreen(u.x, 3, u.y); return p.vis && p.x >= a && p.x <= b && p.y >= c && p.y <= d; }).map(u => u.id);
  select({units: ids});
}
const mini = $('#mini'), miniGo = e => { const p = app.ui.miniToWorld(e.clientX, e.clientY); focusXY(p.x, p.y); };
mini.addEventListener('pointerdown', e => { if (!app.ui) return; mini.setPointerCapture(e.pointerId); miniGo(e); });
mini.addEventListener('pointermove', e => { if (app.ui && e.buttons & 1) miniGo(e); });

/* ---------- клавиатура ---------- */
const CAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
addEventListener('keydown', e => {
  if (!app.game || e.target.tagName === 'INPUT') return;
  const g = app.game, s = g.s;
  if (CAM_KEYS.has(e.code)) { app.cam.keys.add(e.code); e.preventDefault(); return; }
  if (e.code === 'Space') { e.preventDefault(); if (document.activeElement !== document.body) document.activeElement.blur(); setSpeed(s.speed ? 0 : app.prevSpeed || 1); }
  else if (/^Digit[1-3]$/.test(e.code)) setSpeed(+e.code.slice(5));
  else if (e.code === 'KeyC') toggleCrime();
  else if (e.code === 'KeyG') setGfx(GFX_ORDER[(GFX_ORDER.indexOf(gfxMode) + 1) % GFX_ORDER.length]);
  else if (e.code === 'KeyH' && s.hq >= 0) { const b = g.B[s.hq]; focusXY(b.x, b.y, 450); }
  else if (e.code === 'KeyB') for (const id of app.sel.units) g.order(g.unitById(id), {t: 'base'});
  else if (e.code === 'Escape') { if (!$('#modal').hidden) app.ui.modal(''); else select(); }
  else if (e.code === 'Tab') {
    e.preventDefault();
    const list = s.units; if (!list.length) return;
    const cur = list.findIndex(u => app.sel.units.has(u.id)), u = list[(cur + 1) % list.length];
    select({units: [u.id]}); focusXY(u.x, u.y);
  }
});
addEventListener('keyup', e => { if (app.cam) app.cam.keys.delete(e.code); });
addEventListener('blur', () => { if (app.cam) app.cam.keys.clear(); });
function setSpeed(v) { const s = app.game.s; if (s.hq < 0) return; if (v) app.prevSpeed = v; s.speed = v; app.ui.renderTop(); }
function toggleCrime() { app.crimeOn = !app.crimeOn; app.world.showCrime(app.crimeOn); $('#crimeBtn').setAttribute('aria-pressed', app.crimeOn); }

/* ---------- кнопки интерфейса ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-speed],[data-tab],[data-inc],[data-unit],[data-b],[data-cap],[data-act],[data-dec]');
  if (!t || !app.game) return;
  const g = app.game, s = g.s, d = t.dataset;
  if (d.speed !== undefined) setSpeed(+d.speed);
  else if (d.tab) { app.ui.tab = d.tab; app.ui.renderList(true); }
  else if (d.inc) { const inc = s.inc.find(i => i.id === d.inc); if (inc) { select({inc: inc.id}); focusXY(inc.x, inc.y); } }
  else if (d.unit) { select({units: [d.unit], add: e.shiftKey}); if (e.detail === 2) { const u = g.unitById(d.unit); if (u) focusXY(u.x, u.y); } }
  else if (d.b) { select({b: +d.b}); const b = g.B[+d.b]; focusXY(b.x, b.y); }
  else if (d.cap) { g.capture(app.sel.b, d.cap); updatePrompt(); app.ui.renderRight(true); app.ui.renderList(true); saveGame(); }
  else if (d.dec) {
    const inc = s.inc.find(i => i.id === app.sel.inc);
    if (!inc) return;
    g.decide(inc, d.dec);
    if (d.dec !== 'accept') select();
    app.ui.renderRight(true); app.ui.renderList(true);
  } else if (d.act) act(d.act, t);
});
function act(a, btn) {
  const g = app.game, s = g.s, sel = app.sel, units = [...sel.units].map(id => g.unitById(id)).filter(Boolean);
  if (a === 'hire') g.hire();
  else if (a === 'buycar') g.buyCar();
  else if (a === 'release') g.release(sel.b);
  else if (a === 'base') units.forEach(u => g.order(u, {t: 'base'}));
  else if (a === 'patrolhere') units.forEach(u => g.order(u, {t: 'patrol', x: u.x, y: u.y}));
  else if (a === 'focusunit' && units[0]) focusXY(units[0].x, units[0].y, 260);
  else if (a === 'clarify') { const inc = s.inc.find(i => i.id === sel.inc); if (inc) g.clarify(inc); }
  else if (a === 'nearest') {
    const inc = s.inc.find(i => i.id === sel.inc); if (!inc) return;
    const u = g.nearestFree(inc);
    if (!u) return app.ui.toast('Свободных экипажей нет');
    g.order(u, {t: 'inc', id: inc.id}); app.world.ping(inc.x, inc.y, '#ff617b');
  } else if (a === 'raidall') {
    const b = g.B[sel.b], free = s.units.filter(u => ['base', 'hold', 'patrol', 'move'].includes(u.state) && g.activeCrew(u).length)
      .sort((x, y) => Math.hypot(x.x - b.x, x.y - b.y) - Math.hypot(y.x - b.x, y.y - b.y)).slice(0, 3);
    g.raid(sel.b, free); app.world.ping(b.x, b.y, '#ff617b');
  } else if (a === 'continue') app.ui.modal('');
  else if (a === 'restart') { localStorage.removeItem(SAVE); location.reload(); }
  app.ui.renderRight(true); app.ui.renderList(true);
}
$('#crimeBtn').addEventListener('click', toggleCrime);
if (!$('#gfxBtn')) $('.res').insertAdjacentHTML('beforeend', '<button type="button" class="iconbtn" id="gfxBtn">⚙ Авто</button>');
$('#gfxBtn').addEventListener('click', () => setGfx(GFX_ORDER[(GFX_ORDER.indexOf(gfxMode) + 1) % GFX_ORDER.length]));
for (const id of ['#left', '#right']) $(id).addEventListener('pointerdown', () => { app.uiHold = true; });
addEventListener('pointerup', () => { app.uiHold = false; });
function showEnd(win) {
  const g = app.game, s = g.s;
  if (!win) setSpeed(0);
  app.ui.modal(win
    ? `<h1>Район очищен! 🏆</h1><p>${Math.round(g.control())}% кварталов под контролем полиции на ${g.day}-й день. Раскрыто ${s.stats.ok} дел, разгромлено притонов — сколько ни пытались банды, район твой.</p>
       <button type="button" class="btn primary" data-act="continue">Играть дальше</button> <button type="button" class="btn" data-act="restart">Новая игра</button>`
    : (localStorage.removeItem(SAVE), `<h1>Тебя сняли с должности</h1><p>Горожане перестали доверять полиции. День ${g.day}: раскрыто ${s.stats.ok}, провалено ${s.stats.fail}, упущено ${s.stats.miss}.</p>
       <button type="button" class="btn primary" data-act="restart">Начать заново</button>`));
}

/* ---------- звук звонка ---------- */
let ac = null;
function unlockAudio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { /* без звука */ } }
function ringSound() {
  if (!ac) return;
  for (const w of [0, .45]) for (const f of [440, 480]) {
    const t = ac.currentTime + w, o = ac.createOscillator(), gn = ac.createGain();
    o.frequency.value = f; gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(.035, t + .02); gn.gain.setValueAtTime(.035, t + .33); gn.gain.linearRampToValueAtTime(0, t + .36);
    o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + .4);
  }
}

function onResize() { if (app.world) app.world.resize(innerWidth, innerHeight); }
addEventListener('resize', onResize);
initStart();
