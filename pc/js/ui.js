// Интерфейс PC-версии: верхняя панель, списки слева, панель выбранного справа, журнал, мини-карта.
import {ROLES, TYPES, KIND_N} from './data.js?v=5';
import {chance, CAR_COST, HIRE_COST, WIN} from './game.js?v=5';

const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const fmt = n => Math.floor(n).toLocaleString('ru-RU');
const said = s => esc(s).replace(/\*([^*]+)\*/g, '<i>$1</i>');
export const UNIT_BG = {base: '#3d6f9e', respond: '#d9364f', scene: '#d99a26', patrol: '#2f9e7a', hold: '#3d8bff', move: '#3d8bff', return: '#5a7288'};
const mins = m => m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`;

export class UI {
  constructor(app) { this.app = app; this.tab = 'inc'; this.lastRight = ''; this.lastList = ''; }

  /* ---------- верх ---------- */
  renderTop() {
    const g = this.app.game, s = g.s;
    $('#clock').innerHTML = `${g.clock()}<small>день ${g.day} · ${g.isNight() ? '🌙 ночь' : '☀ день'}</small>`;
    $('#money').textContent = fmt(s.money);
    $('#trust').textContent = Math.round(s.trust);
    $('#trustbar').style.width = s.trust + '%';
    $('#staff').textContent = `${s.officers.length}/${g.bedCap()}`;
    $('#cars').textContent = `${s.units.length}/${g.unitCap()}`;
    $('#ctrl').textContent = g.control() + '%';
    document.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.speed === s.speed));
    const n = s.inc.filter(i => i.status === 'new').length, el = $('#incN');
    el.textContent = n; el.hidden = !n;
  }

  /* ---------- списки слева ---------- */
  renderList(force) {
    const a = this.app, g = a.game, s = g.s;
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === this.tab));
    let h = '';
    if (this.tab === 'inc') {
      const list = [...s.inc].sort((x, y) => (x.status === 'new' ? 0 : 1) - (y.status === 'new' ? 0 : 1) || (x.deadline - y.deadline));
      if (!list.length) h = `<p class="empty">${s.hq < 0 ? 'Сначала открой участок — выбери здание на карте.' : 'Звонков нет. Ночью и рядом с бандами звонят чаще.'}</p>`;
      for (const inc of list) {
        const isNew = inc.status === 'new', T = TYPES[inc.type], left = Math.max(0, Math.round((isNew ? inc.callEnd : inc.deadline) - s.T));
        const units = inc.units.map(id => g.unitById(id)).filter(Boolean).map(u => g.unitLabel(u));
        const st = isNew ? 'Звонок ждёт решения' : inc.status === 'scene' ? 'Наряд на месте' : units.length ? `Едут: ${units.join(', ')}` : 'Ждёт наряда';
        h += `<button type="button" class="item${a.sel.inc === inc.id ? ' on' : ''}${isNew ? ' new' : ''}" data-inc="${inc.id}">
          <span class="ic" style="background:${isNew ? '#e9eef5' : inc.raid ? '#b3263a' : T.color}">${isNew ? '☎' : inc.raid ? '☠' : T.glyph}</span>
          <span class="tx"><b>${esc(isNew ? 'Входящий звонок' : inc.title)}${inc.urgent && !isNew ? ' · срочно' : ''}</b><small>${esc(inc.addr)}</small><small>${st}</small></span>
          <span class="tm${left < 15 ? ' hot' : ''}">${left} мин</span></button>`;
      }
    } else if (this.tab === 'units') {
      if (!s.units.length) h = '<p class="empty">Экипажей пока нет.</p>';
      for (const u of s.units) {
        const crew = g.crewOf(u), fat = crew.length ? crew.reduce((x, o) => x + o.fat, 0) / crew.length : 0;
        h += `<button type="button" class="item${a.sel.units.has(u.id) ? ' on' : ''}" data-unit="${u.id}">
          <span class="ic" style="background:${UNIT_BG[u.state] || '#555'};color:#fff">${String(u.no).padStart(2, '0')}</span>
          <span class="tx"><b>Экипаж ${g.unitLabel(u)}</b><small>${g.unitState(u)} · сила ${g.unitPower(u)} · людей ${g.activeCrew(u).length}/2</small><span class="mbar"><i style="width:${fat}%"></i></span></span></button>`;
      }
      h += '<p class="empty">Shift+клик — выбрать несколько. Двойной клик — показать на карте.</p>';
    } else {
      const roles = Object.entries(s.roles);
      h += `<div class="grid2" style="margin:2px 0 8px"><button type="button" class="btn" data-act="hire">Нанять · ${HIRE_COST} ₽</button><button type="button" class="btn" data-act="buycar">Машина · ${CAR_COST} ₽</button></div>
        <p class="empty" style="padding:0 2px 6px">Людей ${s.officers.length}/${g.bedCap()} · машин ${s.units.length}/${g.unitCap()}. Места дают участок, общежития, гаражи и опорные пункты.</p>`;
      for (const [bi, t] of roles) {
        const R = ROLES[t];
        h += `<button type="button" class="item${a.sel.b === +bi ? ' on' : ''}" data-b="${bi}"><span class="ic" style="background:${R.color}">${R.icon}</span><span class="tx"><b>${R.n}</b><small>${esc(g.bName(+bi))}</small></span></button>`;
      }
      h += '<div class="sect">Сотрудники</div>';
      for (const o of s.officers) {
        const u = o.unit ? g.unitById(o.unit) : null;
        h += `<div class="crew"><span class="nm">${esc(o.name)}<br><small>навык ${o.skill} · ${o.hurt ? 'ранен' : u ? 'экипаж ' + g.unitLabel(u) : 'в резерве'}</small></span><span class="mbar" style="width:60px"><i style="width:${o.fat}%"></i></span></div>`;
      }
    }
    if (force || h !== this.lastList) { $('#list').innerHTML = h; this.lastList = h; }
  }

  /* ---------- панель справа ---------- */
  renderRight(force) {
    const a = this.app, g = a.game, s = g.s;
    let h;
    const inc = a.sel.inc && s.inc.find(i => i.id === a.sel.inc);
    if (a.sel.inc && !inc) a.sel.inc = null;
    if (inc) h = this.incPanel(inc);
    else if (a.sel.units.size) h = this.unitPanel([...a.sel.units].map(id => g.unitById(id)).filter(Boolean));
    else if (a.sel.b >= 0) h = this.buildingPanel(a.sel.b);
    else h = this.overview();
    if (force || h !== this.lastRight) { $('#right').innerHTML = h; this.lastRight = h; }
  }
  overview() {
    const g = this.app.game, s = g.s;
    if (s.hq < 0) return `<h2>С чего начать</h2><div class="sub">Выбери дом для участка</div>
      <p style="color:var(--dim);line-height:1.5;margin:0">Кликни по крупному зданию (от 150 м²) и нажми «Открыть участок здесь». Вокруг участка появится зона контроля 320 м, в ней можно занимать другие дома под нужды полиции.</p>
      <p style="color:var(--dim);line-height:1.5">Красные пятна — кварталы под бандами. Ночью они расползаются. Лучше не селиться прямо рядом с ними.</p>`;
    const ctrl = g.control();
    return `<h2>Обстановка в районе</h2><div class="sub">${esc(this.app.map.name)}</div>
      <div class="kv"><span>Под контролем полиции</span><b>${ctrl}% района (цель — ${WIN}%)</b></div>
      <div class="mbar" style="height:6px;margin:6px 0 2px"><i style="width:${Math.min(100, ctrl / WIN * 100)}%;background:var(--green)"></i></div>
      <div class="kv"><span>Притонов банд</span><b>${s.hide.length}</b></div>
      <div class="kv"><span>Активных вызовов</span><b>${s.inc.length}</b></div>
      <div class="kv"><span>Раскрыто / провалено / упущено</span><b>${s.stats.ok} / ${s.stats.fail} / ${s.stats.miss}</b></div>
      <p class="why" style="color:var(--dim);line-height:1.45">Контроль — кварталы внутри зон участка, опорных пунктов и камер, где нет банд. Расширяй зону опорными пунктами и выбивай банды.</p>
      <div class="sect">Как играть</div>
      <p style="color:var(--dim);line-height:1.55;margin:0">Выбери экипаж (клик по машине или в списке «Наряды») и кликни <b>правой кнопкой</b> по вызову — он поедет туда. Правой кнопкой по улице — поставить на позицию, с Shift — патрулировать вокруг. Патрули гасят преступность. Притоны (☠) громи рейдами из нескольких экипажей. Кликни по любому дому — его можно занять под опорный пункт, гараж, общежитие, камеры или академию.</p>`;
  }
  buildingPanel(bi) {
    const g = this.app.game, s = g.s, b = g.B[bi], role = s.roles[bi], crime = Math.round(g.grid.c[b.cell] || 0);
    const hide = s.hide.some(q => q.bi === bi);
    const ctag = crime >= 70 ? '<span class="tag hot">банда</span>' : crime >= 40 ? '<span class="tag">неспокойно</span>' : '<span class="tag good">спокойно</span>';
    let h = `<h2>${esc(b.name || b.addr || 'Дом без адреса')}</h2><div class="sub">${KIND_N[b.k] || 'Здание'}${b.name && b.addr ? ' · ' + esc(b.addr) : ''}</div>
      <div class="kv"><span>Площадь</span><b>${fmt(b.area)} м² · ~${Math.max(1, Math.round(b.h / 3.1))} эт.</b></div>
      <div class="kv"><span>Квартал</span><b>преступность ${crime}% ${ctag}</b></div>`;
    if (s.hq >= 0) h += `<div class="kv"><span>Зона контроля</span><b>${g.inZone(b) ? 'да' : 'нет'}</b></div>`;
    if (hide) {
      const free = s.units.filter(u => ['base', 'hold', 'patrol', 'move'].includes(u.state) && g.activeCrew(u).length);
      const P = free.slice(0, 3).reduce((x, u) => x + g.unitPower(u), 0), D = Math.round(40 + crime * .15);
      h += `<div class="sect">☠ Притон банды</div><p style="color:var(--dim);margin:0 0 8px;line-height:1.45">Отсюда банда расползается по соседним кварталам. Разгромишь притон — район вздохнёт. Нужна сила около ${D}: отправляй несколько экипажей сразу.</p>
        <button type="button" class="btn danger wide" data-act="raidall" ${free.length ? '' : 'disabled'}>Рейд: ${Math.min(3, free.length)} ближайш. экипажа · шанс ~${free.length ? Math.round(chance(P, D) * 100) : 0}%</button>
        <p class="why">Или выбери экипажи сам и кликни ПКМ по притону.</p>`;
    }
    if (role) {
      const R = ROLES[role];
      h += `<div class="sect">Здание полиции</div><div class="role"><span class="em">${R.icon}</span><div><b>${R.n}</b><small>${R.d}</small>${role !== 'hq' ? '<button type="button" class="btn" data-act="release">Освободить здание</button>' : ''}</div></div>`;
    } else if (s.hq < 0) {
      const why = g.canCapture(bi, 'hq');
      h += `<div class="sect">Участок</div><p style="color:var(--dim);margin:0 0 8px;line-height:1.45">${ROLES.hq.d}</p>
        <button type="button" class="btn primary wide" data-cap="hq" ${why ? 'disabled' : ''}>🏛️ Открыть участок здесь</button>${why ? `<p class="why">${why}</p>` : ''}`;
    } else if (!hide) {
      h += '<div class="sect">Занять под нужды полиции</div>';
      for (const [t, R] of Object.entries(ROLES)) {
        if (t === 'hq') continue;
        const why = g.canCapture(bi, t);
        h += `<div class="role"><span class="em">${R.icon}</span><div style="flex:1"><b>${R.n} · ${fmt(R.cost)} ₽</b><small>${R.d}${R.upkeep ? ` Содержание ${R.upkeep} ₽ в день.` : ''}</small>
          <button type="button" class="btn${why ? '' : ' primary'}" data-cap="${t}" ${why ? 'disabled' : ''}>Занять</button>${why ? `<p class="why">${why}</p>` : ''}</div></div>`;
      }
    }
    return h;
  }
  unitPanel(units) {
    const g = this.app.game;
    if (units.length > 1) {
      const P = units.reduce((x, u) => x + g.unitPower(u), 0);
      return `<h2>Выбрано экипажей: ${units.length}</h2><div class="sub">Общая сила ${P}</div>
        ${units.map(u => `<div class="kv"><span>${g.unitLabel(u)}</span><b>${g.unitState(u)} · сила ${g.unitPower(u)}</b></div>`).join('')}
        <div class="grid2" style="margin-top:12px"><button type="button" class="btn" data-act="base">На базу · B</button><button type="button" class="btn" data-act="patrolhere">Патруль здесь</button></div>
        <p class="why" style="color:var(--dim)">ПКМ по вызову — все едут туда. ПКМ по притону — рейд.</p>`;
    }
    const u = units[0], crew = g.crewOf(u);
    let h = `<h2>Экипаж ${g.unitLabel(u)}</h2><div class="sub">${g.unitState(u)}${u.target && u.target.t === 'inc' ? ' · ' + esc((g.s.inc.find(i => i.id === u.target.id) || {}).title || '') : ''}</div>
      <div class="kv"><span>Сила экипажа</span><b>${g.unitPower(u)}</b></div><div class="sect">Экипаж</div>`;
    if (!crew.length) h += '<p class="empty">В машине никого. Найми людей во вкладке «Участок».</p>';
    for (const o of crew) h += `<div class="crew"><span class="nm">${esc(o.name)}<br><small>навык ${o.skill} · усталость ${Math.round(o.fat)}%</small></span>${o.hurt ? '<span class="tag hot">ранен</span>' : `<span class="mbar" style="width:70px"><i style="width:${o.fat}%"></i></span>`}</div>`;
    h += `<div class="grid2" style="margin-top:12px"><button type="button" class="btn" data-act="base">На базу · B</button><button type="button" class="btn" data-act="patrolhere">Патруль здесь</button></div>
      <button type="button" class="btn wide" style="margin-top:6px" data-act="focusunit">Показать на карте</button>
      <p class="why" style="color:var(--dim);line-height:1.45">ПКМ по вызову — ехать на вызов. ПКМ по улице — встать на позицию, Shift+ПКМ — патрулировать вокруг. Уставшие экипажи слабее — возвращай их на базу отдохнуть.</p>`;
    return h;
  }
  incPanel(inc) {
    const g = this.app.game, s = g.s, T = TYPES[inc.type], isNew = inc.status === 'new';
    const units = inc.units.map(id => g.unitById(id)).filter(Boolean);
    const sel = [...this.app.sel.units].map(id => g.unitById(id)).filter(Boolean);
    const P = (units.length ? units : sel).reduce((x, u) => x + g.unitPower(u), 0);
    const left = Math.max(0, Math.round((isNew ? inc.callEnd : inc.deadline) - s.T));
    let h = `<h2>${isNew ? 'Входящий звонок 102' : esc(inc.title)}</h2><div class="sub">📍 ${esc(inc.addr)}${inc.urgent ? ' · <span class="tag hot">срочно</span>' : ''}</div>`;
    if (!inc.raid) h += `<div class="quote">«${said(inc.open)}»${inc.revealed && inc.detail ? `<br><span style="color:var(--dim)">Уточнили: ${said(inc.detail)}</span>` : ''}</div>`;
    h += `<div class="kv"><span>${isNew ? 'Ответить нужно за' : 'Наряд нужен за'}</span><b>${mins(left)}</b></div>
      <div class="kv"><span>Опасность</span><b>${inc.known ? `нужна сила ≈ ${inc.diff}` : '? — уточни или поставь камеры'}</b></div>`;
    if (!isNew) h += `<div class="kv"><span>Тип</span><b>${inc.raid ? 'рейд' : T.n}</b></div>`;
    if (units.length) h += `<div class="kv"><span>Едут</span><b>${units.map(u => g.unitLabel(u)).join(', ')} · сила ${P}</b></div>`;
    if (inc.known && P) h += `<div class="kv"><span>Шанс успеха</span><b>~${Math.round(chance(P, inc.diff) * 100)}%${units.length ? '' : ' для выбранных'}</b></div>`;
    if (isNew) {
      h += `<div class="sect">Решение</div><button type="button" class="btn primary wide" data-act="nearest">🚓 Принять и отправить ближайший экипаж</button>
        <div class="grid2" style="margin-top:6px">${inc.revealed ? '' : '<button type="button" class="btn" data-act="clarify">Уточнить детали</button>'}<button type="button" class="btn" data-dec="accept">Принять</button>
        <button type="button" class="btn" data-dec="ems">🚑 В скорую</button><button type="button" class="btn" data-dec="fire">🚒 В МЧС</button></div>
        <button type="button" class="btn danger wide" style="margin-top:6px" data-dec="drop">Сбросить — это шутка</button>
        <p class="why" style="color:var(--dim);line-height:1.45">Слушай, что говорят: смех на фоне и бред — шутники, болезнь и пожар — не к полиции. Уточнение раскрывает подробности и опасность, но отнимает пару минут.</p>`;
    } else if (inc.status !== 'scene' || units.length < 3) {
      h += `<button type="button" class="btn primary wide" style="margin-top:12px" data-act="nearest">🚓 Отправить ближайший свободный экипаж</button><p class="why" style="color:var(--dim)">Или выбери экипаж и кликни ПКМ по метке вызова.</p>`;
    }
    return h;
  }

  /* ---------- журнал и уведомления ---------- */
  log(text, kind = '') {
    const box = $('#log'), el = document.createElement('div');
    el.className = 'ln ' + kind; el.textContent = text; box.prepend(el);
    while (box.children.length > 6) box.lastChild.remove();
    setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 1000); }, 14000);
  }
  toast(text) {
    const box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast'; el.textContent = text; box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 2800);
  }
  tip(x, y, html) {
    const t = $('#tip');
    if (!html) { t.hidden = true; return; }
    t.innerHTML = html; t.hidden = false;
    t.style.left = Math.min(innerWidth - 290, x + 16) + 'px'; t.style.top = (y + 16) + 'px';
  }
  modal(html) { $('#modalCard').innerHTML = html; $('#modal').hidden = !html; }

  /* ---------- мини-карта ---------- */
  buildMini(map) {
    const S = 432, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), k = S / (map.r * 2.3), X = x => S / 2 + x * k, Y = y => S / 2 - y * k;
    this.mk = {k, X, Y, S};
    g.fillStyle = '#0b1522'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#18242a'; g.beginPath(); g.arc(S / 2, S / 2, map.r * 1.06 * k, 0, 7); g.fill();
    const poly = (s, fill) => {
      g.beginPath();
      for (const p of [s.p, ...(s.hl || [])]) { for (let i = 0; i < p.length; i += 2) g[i ? 'lineTo' : 'moveTo'](X(p[i]), Y(p[i + 1])); g.closePath(); }
      g.fillStyle = fill; g.fill('evenodd');
    };
    for (const s of map.g) poly(s, '#23402b');
    for (const s of map.w) poly(s, '#1f4a66');
    g.strokeStyle = '#4b5966'; g.lineCap = 'round';
    for (const r of map.rd) {
      g.lineWidth = /primary|secondary|trunk|motorway/.test(r.k) ? 2.6 : r.k === 'service' ? .8 : 1.5;
      g.beginPath(); for (let i = 0; i < r.p.length; i += 2) g[i ? 'lineTo' : 'moveTo'](X(r.p[i]), Y(r.p[i + 1])); g.stroke();
    }
    for (const b of map.b) poly(b, '#6d7680');
    this.miniBase = c;
  }
  drawMini() {
    const a = this.app, g = a.game, s = g.s, cv = $('#mini'), ctx = cv.getContext('2d'), {k, X, Y, S} = this.mk;
    ctx.drawImage(this.miniBase, 0, 0);
    const {N, cell, o, c, inside} = g.grid;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = c[j * N + i];
      if (!inside[j * N + i] || v < 40) continue;
      ctx.fillStyle = v >= 70 ? 'rgba(214,40,60,.5)' : 'rgba(235,150,60,.22)';
      ctx.fillRect(X(o + i * cell), Y(o + (j + 1) * cell), cell * k + .5, cell * k + .5);
    }
    for (const z of g.zones()) { ctx.strokeStyle = z.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(z.x), Y(z.y), z.r * k, 0, 7); ctx.stroke(); }
    for (const [bi, t] of Object.entries(s.roles)) { const b = g.B[bi]; ctx.fillStyle = ROLES[t].color; ctx.fillRect(X(b.x) - 4, Y(b.y) - 4, 8, 8); }
    ctx.font = '700 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const h of s.hide) { const b = g.B[h.bi]; ctx.fillStyle = '#ff617b'; ctx.fillText('☠', X(b.x), Y(b.y)); }
    const blink = Math.floor(performance.now() / 400) % 2;
    for (const inc of s.inc) {
      ctx.fillStyle = inc.status === 'new' ? (blink ? '#ffffff' : '#7f8fa0') : inc.raid ? '#ff617b' : TYPES[inc.type].color;
      ctx.beginPath(); ctx.arc(X(inc.x), Y(inc.y), 6, 0, 7); ctx.fill();
    }
    for (const u of s.units) {
      ctx.fillStyle = a.sel.units.has(u.id) ? '#b6ff5c' : '#ffffff';
      ctx.strokeStyle = UNIT_BG[u.state] || '#555'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(X(u.x), Y(u.y), 5, 0, 7); ctx.fill(); ctx.stroke();
    }
    // что видит камера
    const w = a.world, r = w.renderer.domElement.getBoundingClientRect(), pts = [[r.left, r.top + 60], [r.right, r.top + 60], [r.right, r.bottom], [r.left, r.bottom]].map(([x, y]) => w.pickGround(x, y));
    if (pts.every(Boolean)) {
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](X(p.x), Y(p.y))); ctx.closePath(); ctx.stroke();
    }
  }
  miniToWorld(px, py) {
    const cv = $('#mini'), r = cv.getBoundingClientRect(), {k, S} = this.mk;
    const x = (px - r.left) / r.width * S, y = (py - r.top) / r.height * S;
    return {x: (x - S / 2) / k, y: -(y - S / 2) / k};
  }
}
