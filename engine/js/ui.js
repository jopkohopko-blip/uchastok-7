// Интерфейс: состав, карточка детали, выноски, подсказки, панель режимов, клавиши.
import * as THREE from 'three';
import { ENGINE } from './catalog.js';
import { cycle } from './spec.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');
const STROKES = ['Рабочий ход', 'Выпуск', 'Впуск', 'Сжатие'];
const IC = {
  drag: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.5 8A5.5 5.5 0 1 1 11 3.4"/><path d="M11 1v2.6H8.4"/></svg>',
  click: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2.5 12 8l-3.6.9L10.5 13l-1.6.8-2-4.1L4 12Z"/></svg>',
  xray: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2" stroke-dasharray="2 2"/><circle cx="8" cy="8" r="2.5"/></svg>',
  run: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.8v10.4L13 8Z"/></svg>',
  back: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 3 5 8l5 5"/></svg>',
  next: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 3 5 5-5 5"/></svg>',
  zoom: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5M7 5v4M5 7h4"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3.5 8.5 6 11l6.5-6.5"/></svg>',
  chev: '<svg class="chev" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 3 5 5-5 5"/></svg>',
};

export function initUI(V, { isDark, setDark }) {
  const S = V.S, model = V.model, canvas = V.renderer.domElement;
  const card = $('#card'), list = $('#asmList'), hot = $('#hot'), tip = $('#tip');
  const partKey = p => `${p.asm.id}|${p.key}`;
  const findPart = k => { const [a, key] = k.split('|'); return model.asm(a).parts.find(p => p.key === key); };

  $('#partCount').textContent = model.parts.length;

  // ---------------------------------------------------------------- состав
  list.innerHTML = model.asms.map(a => `
    <div class="asm" data-asm="${a.id}">
      <button aria-expanded="false"><span class="n">${pad(a.def.no)}</span><span class="t">${esc(a.def.name)}</span><span class="c">${a.parts.length}</span>${IC.chev}</button>
      <div class="parts" hidden>${a.parts.map(p => `<button class="part" data-part="${partKey(p)}"><span class="n">${p.no}</span><span class="t">${esc(p.def.name)}</span></button>`).join('')}</div>
    </div>`).join('');
  const expanded = new Set();
  function setExpanded(id, on) {
    const el = list.querySelector(`[data-asm="${id}"]`);
    on ? expanded.add(id) : expanded.delete(id);
    el.classList.toggle('open', on);
    el.querySelector('.parts').hidden = !on;
    el.querySelector('button').setAttribute('aria-expanded', on);
  }
  list.addEventListener('click', e => {
    const pb = e.target.closest('.part');
    if (pb) { V.selectPart(findPart(pb.dataset.part)); closeDrawer(); return; }
    const ab = e.target.closest('.asm>button');
    if (ab) {
      const id = ab.parentElement.dataset.asm, a = model.asm(id);
      if (S.open === a && !S.sel && expanded.has(id)) { setExpanded(id, false); return; }
      setExpanded(id, true);
      if (S.exploded) { V.selectPart(null); S.open = a; render(); } else V.openAssembly(a);
    }
  });
  list.addEventListener('pointerover', e => {
    const pb = e.target.closest('.part');
    if (pb) { const p = findPart(pb.dataset.part); V.setHover({ kind: 'part', part: p, asm: p.asm }); }
  });
  list.addEventListener('pointerleave', () => V.setHover(null));

  // поиск
  $('#q').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    for (const el of list.querySelectorAll('.asm')) {
      const a = model.asm(el.dataset.asm);
      let any = !q || a.def.name.toLowerCase().includes(q);
      for (const pb of el.querySelectorAll('.part')) {
        const p = findPart(pb.dataset.part), name = p.def.name, i = name.toLowerCase().indexOf(q);
        const hit = !q || i >= 0;
        pb.hidden = !hit && !(!q || a.def.name.toLowerCase().includes(q));
        pb.querySelector('.t').innerHTML = q && i >= 0 ? `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + q.length))}</mark>${esc(name.slice(i + q.length))}` : esc(name);
        if (q && i >= 0) any = true;
      }
      el.hidden = !any;
      if (q) { el.classList.toggle('open', any); el.querySelector('.parts').hidden = !any; }
      else setExpanded(el.dataset.asm, expanded.has(el.dataset.asm));
    }
  });

  // ---------------------------------------------------------------- карточка
  const cur = () => S.sel ? S.sel.asm : S.open;
  function crumbs(items) {
    return `<nav class="crumbs" aria-label="Путь">${items.map((it, i) => (i ? '<span class="sep">›</span>' : '') + (it.act ? `<button data-act="${it.act}">${esc(it.t)}</button>` : `<span>${esc(it.t)}</span>`)).join('')}</nav>`;
  }
  function overview() {
    return `<div class="card">
      <div class="eyebrow">Общие сведения</div>
      <h2 class="big">${esc(ENGINE.name)}</h2>
      <p class="kind">${esc(ENGINE.kind)}</p>
      <p class="lead">${esc(ENGINE.intro)}</p>
      <dl class="spec">${ENGINE.specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="sec">Как смотреть</div>
      <ul class="howto">
        <li>${IC.drag}<span>Перетаскивайте модель мышью или пальцем, колесо и щипок меняют масштаб. Кнопки внизу ставят вид спереди, сзади, сбоку, сверху и снизу.</span></li>
        <li>${IC.click}<span>Нажмите на любой узел: он разберётся на детали с номерами позиций. Нажмите на деталь — появится её описание и назначение.</span></li>
        <li>${IC.xray}<span>«Рентген» делает прозрачным всё, кроме движущихся деталей: видно коленвал, шатуны, поршни, клапаны, распредвалы и цепи.</span></li>
        <li>${IC.run}<span>«Запустить» показывает работу двигателя в замедленном темпе: поршни, клапаны, цепи и ремни движутся в правильных фазах.</span></li>
      </ul>
      <div class="note">${esc(ENGINE.note)}</div>
    </div>`;
  }
  function assemblyCard(a) {
    return `<div class="card">
      ${crumbs([{ t: 'Двигатель', act: 'home' }, { t: `Узел ${pad(a.def.no)}` }])}
      <div class="eyebrow">Узел ${pad(a.def.no)} · ${a.parts.length} ${plural(a.parts.length, 'деталь', 'детали', 'деталей')}</div>
      <h2>${esc(a.def.name)}</h2>
      <p class="lead" style="margin-top:8px">${esc(a.def.about)}</p>
      <div class="sec">Детали узла</div>
      <ul class="plist">${a.parts.map(p => `<li><button data-part="${partKey(p)}"><span class="n">${p.no}</span><span>${esc(p.def.name)}</span><span class="q">×${esc(p.def.qty.split(' ')[0])}</span></button></li>`).join('')}</ul>
      <div class="actions">
        ${S.exploded ? '' : `<button class="btn" data-act="home">${IC.close}Собрать узел</button>`}
        <button class="btn" data-act="frame">${IC.zoom}Показать целиком</button>
      </div>
    </div>`;
  }
  function partCard(p) {
    const a = p.asm, d = p.def, i = a.parts.indexOf(p);
    const prev = a.parts[i - 1], next = a.parts[i + 1];
    return `<div class="card">
      ${crumbs([{ t: 'Двигатель', act: 'home' }, { t: a.def.name, act: 'asm' }, { t: p.no }])}
      <div class="eyebrow">Позиция ${p.no}</div>
      <h2>${esc(d.name)}</h2>
      <div class="chips"><span class="chip">Кол-во <b>${esc(d.qty)}</b></span><span class="chip">${esc(d.mat)}</span></div>
      <div class="sec">Назначение</div>
      <p class="body">${esc(d.role)}</p>
      <div class="sec">Как устроено и работает</div>
      <p class="body">${esc(d.how)}</p>
      ${d.data && d.data.length ? `<div class="sec">Параметры</div><dl class="spec">${d.data.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      <div class="actions"><button class="btn" data-act="focus">${IC.zoom}Показать крупнее</button><button class="btn" data-act="asm">${IC.back}К узлу</button></div>
      <div class="pager">
        ${prev ? `<button class="btn" data-part="${partKey(prev)}">${IC.back}<span>${esc(prev.def.name)}</span></button>` : '<span></span>'}
        ${next ? `<button class="btn" data-part="${partKey(next)}"><span>${esc(next.def.name)}</span>${IC.next}</button>` : '<span></span>'}
      </div>
    </div>`;
  }
  function runCard() {
    const cyl = no => `<div class="cyl" data-no="${no}"><b>${no}</b><i></i><span>—</span></div>`;
    return `<div class="card">
      <div class="eyebrow">Работа двигателя</div>
      <h2>Четырёхтактный цикл</h2>
      <p class="lead" style="margin-top:8px">За два оборота коленчатого вала в каждом цилиндре проходят четыре такта: впуск, сжатие, рабочий ход и выпуск. Вспышки идут через каждые 90° поворота в порядке 1‑5‑4‑8‑7‑2‑6‑3, поэтому за оборот срабатывают четыре цилиндра.</p>
      <div class="gauge"><span>Угол коленвала</span><b class="num" id="crankDeg">0°</b></div>
      <div class="cyc">
        <div class="bank"><div class="lbl">Правый ряд</div>${[1, 2, 3, 4].map(cyl).join('')}</div>
        <div class="bank"><div class="lbl">Левый ряд</div>${[5, 6, 7, 8].map(cyl).join('')}</div>
      </div>
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--accent)"></i>Впуск</span><span><i style="background:var(--cmp)"></i>Сжатие</span><span><i style="background:var(--warn)"></i>Рабочий ход</span><span><i style="background:var(--ti)"></i>Выпуск</span></div>
      <div class="note">Показ замедлен: на 7 500 мин⁻¹ коленвал делает 125 оборотов в секунду. В режиме «Рентген» видны вспышки в цилиндрах, поршни, шатуны и клапаны.</div>
    </div>`;
  }
  let lastKey = '', lastOpen = null;
  function render() {
    const a = cur(), p = S.sel;
    const key = S.running ? 'run' : p ? 'p:' + partKey(p) + S.exploded : a ? 'a:' + a.id + S.exploded : 'home';
    if (key !== lastKey) {
      card.innerHTML = S.running ? runCard() : p ? partCard(p) : a ? assemblyCard(a) : overview();
      card.scrollTop = 0;
      lastKey = key;
      if (S.hover && S.hover.kind === 'part') V.setHover(null);
      buildHotspots();
    }
    // состояние дерева
    for (const el of list.querySelectorAll('.asm')) el.classList.toggle('on', a && el.dataset.asm === a.id);
    for (const pb of list.querySelectorAll('.part')) pb.classList.toggle('on', !!p && pb.dataset.part === partKey(p));
    if (a && a.id !== lastOpen && !$('#q').value) { for (const id of [...expanded]) if (id !== a.id) setExpanded(id, false); }
    lastOpen = a ? a.id : null;
    if (a && !expanded.has(a.id)) setExpanded(a.id, true);
    if (p) { const pb = list.querySelector(`.part[data-part="${partKey(p)}"]`); if (pb && list.offsetParent) pb.scrollIntoView({ block: 'nearest' }); }
    // кнопки
    $('#bExplode').setAttribute('aria-pressed', S.exploded);
    $('#amtWrap').hidden = !S.exploded;
    $('#bXray').setAttribute('aria-pressed', S.xray);
    $('#bRun').setAttribute('aria-pressed', S.running);
    $('#bRun .lbl').textContent = S.running ? 'Остановить' : 'Запустить';
    $('#bRun svg').innerHTML = S.running ? '<rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/>' : '<path d="M4.5 2.8v10.4L13 8Z"/>';
    $('#rpm').hidden = !S.running;
    $('#bSpin').setAttribute('aria-pressed', S.autoRotate);
  }
  card.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-part]');
    if (!b) return;
    if (b.dataset.part) return V.selectPart(findPart(b.dataset.part));
    const act = b.dataset.act, a = cur();
    if (act === 'home') { if (S.exploded) { V.selectPart(null); S.open = null; render(); } else V.closeAll(); }
    else if (act === 'asm' && a) { V.selectPart(null); if (!S.exploded) V.openAssembly(a); }
    else if (act === 'frame') V.setView(null);
    else if (act === 'focus' && S.sel) V.focusPart(S.sel);
  });
  card.addEventListener('pointerover', e => {
    const b = e.target.closest('.plist [data-part]');
    if (b) { const p = findPart(b.dataset.part); V.setHover({ kind: 'part', part: p, asm: p.asm }); }
  });
  card.addEventListener('pointerleave', () => V.setHover(null));

  // ---------------------------------------------------------------- выноски
  let hsList = [];
  function buildHotspots() {
    hot.innerHTML = '';
    hsList = [];
    const a = cur();
    if (!a || S.running) return;
    for (const p of a.parts) {
      const el = document.createElement('button');
      el.className = 'hs';
      el.innerHTML = `<span class="d">${p.index + 1}</span><span class="lb">${esc(p.def.name)}</span>`;
      el.setAttribute('aria-label', `${p.no} ${p.def.name}`);
      el.addEventListener('click', () => V.selectPart(p));
      el.addEventListener('pointerenter', () => V.setHover({ kind: 'part', part: p, asm: a }));
      el.addEventListener('pointerleave', () => V.setHover(null));
      hot.appendChild(el);
      hsList.push({ p, el });
    }
  }
  const v = new THREE.Vector3();
  function placeHotspots() {
    if (!hsList.length) return;
    const a = cur();
    const show = a && (a.e > 0.85 || S.exploded);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    for (const h of hsList) {
      h.p.anchor(v).project(V.camera);
      const vis = show && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      h.el.style.display = vis ? '' : 'none';
      if (vis) h.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * W}px, ${(-v.y * 0.5 + 0.5) * H}px) translate(-12px, -50%)`;
      h.el.classList.toggle('on', S.sel === h.p);
    }
  }

  // ---------------------------------------------------------------- работа двигателя: живая таблица тактов
  function updateRun() {
    if (!S.running) return;
    const deg = $('#crankDeg');
    if (!deg) return;
    deg.textContent = `${Math.floor(((S.phi % 360) + 360) % 360)}°`;
    for (const el of card.querySelectorAll('.cyl')) {
      const a = cycle(+el.dataset.no, S.phi), k = Math.floor(a / 180);
      if (el.dataset.k !== String(k)) { el.dataset.k = k; el.querySelector('span').textContent = STROKES[k]; }
      el.querySelector('i').style.width = `${Math.max(8, (a % 180) / 180 * 100)}%`;
      el.classList.toggle('fire', a < 40);
    }
  }

  V.on('change', render);
  V.on('frame', () => { placeHotspots(); updateRun(); });

  // ---------------------------------------------------------------- указатель
  let ptr = null, down = null, raf = 0, dragging = false;
  function doHover() {
    raf = 0;
    if (!ptr || dragging || ptr.type === 'touch') return;
    const hit = V.pick(ptr.x, ptr.y);
    const t = V.hoverTarget(hit);
    V.setHover(t);
    if (!t) { tip.hidden = true; canvas.style.cursor = ''; return; }
    canvas.style.cursor = 'pointer';
    let name, sub;
    if (t.kind === 'part') { name = t.part.def.name; sub = `Позиция ${t.part.no} · нажмите для описания`; }
    else { name = t.asm.def.name; sub = S.open && S.open !== t.asm ? 'Нажмите, чтобы перейти к этому узлу' : `Узел ${pad(t.asm.def.no)} · нажмите, чтобы разобрать`; }
    tip.innerHTML = `<b>${esc(name)}</b><small>${esc(sub)}</small>`;
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = ptr.x + 16, y = ptr.y + 18;
    if (x + tw > innerWidth - 8) x = ptr.x - tw - 12;
    if (y + th > innerHeight - 8) y = ptr.y - th - 12;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }
  canvas.addEventListener('pointermove', e => {
    ptr = { x: e.clientX, y: e.clientY, type: e.pointerType };
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { dragging = true; tip.hidden = true; }
    if (!raf) raf = requestAnimationFrame(doHover);
  });
  canvas.addEventListener('pointerleave', () => { ptr = null; tip.hidden = true; V.setHover(null); });
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button }; hideHint(); });
  window.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (e.target === canvas && moved < 6 && down.b === 0 && performance.now() - down.t < 700) {
      V.click(V.pick(e.clientX, e.clientY));
      tip.hidden = true;
    }
    down = null; dragging = false;
  });
  canvas.addEventListener('dblclick', e => {
    const t = V.hoverTarget(V.pick(e.clientX, e.clientY));
    if (t && t.kind === 'part') V.focusPart(t.part);
  });

  // ---------------------------------------------------------------- панель режимов
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => V.setView(b.dataset.view));
  const amt = $('#amt');
  $('#bExplode').addEventListener('click', () => V.setExploded(!S.exploded, +amt.value));
  amt.addEventListener('input', () => V.setAmount(+amt.value));
  $('#bXray').addEventListener('click', () => V.setXray(!S.xray));
  $('#bRun').addEventListener('click', () => toggleRun());
  $('#rpm').addEventListener('change', e => V.setRpm(+e.target.value));
  $('#bSpin').addEventListener('click', () => V.setAutoRotate(!S.autoRotate));
  $('#bTheme').addEventListener('click', () => { setDark(!isDark()); });
  function toggleRun() {
    const on = !S.running;
    if (on && !S.xray) V.setXray(true);
    V.setRunning(on);
    if (on) V.setView('iso');
  }

  // ---------------------------------------------------------------- клавиши
  const VIEWKEYS = { Digit1: 'iso', Digit2: 'front', Digit3: 'rear', Digit4: 'left', Digit5: 'right', Digit6: 'top', Digit7: 'bottom' };
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,select,textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (document.body.classList.contains('tree-open')) return closeDrawer();
      if (S.running) return V.setRunning(false);
      if (S.sel) return V.selectPart(null);
      if (S.exploded && S.open) { S.open = null; return render(); }
      if (S.open) return V.closeAll();
      if (S.exploded) return V.setExploded(false);
      return;
    }
    if (VIEWKEYS[e.code]) { V.setView(VIEWKEYS[e.code]); e.preventDefault(); }
    else if (e.code === 'KeyE') V.setExploded(!S.exploded, +amt.value);
    else if (e.code === 'KeyX') V.setXray(!S.xray);
    else if (e.code === 'Space') { toggleRun(); e.preventDefault(); }
    else if (e.code === 'KeyR') V.setAutoRotate(!S.autoRotate);
    else if (e.code === 'KeyT') setDark(!isDark());
    else if (e.code === 'KeyF') { if (S.sel) V.focusPart(S.sel); else V.setView(null); }
  });

  // ---------------------------------------------------------------- раскладка и отступы сцены
  const treeBtn = $('#treeBtn');
  function closeDrawer() { document.body.classList.remove('tree-open'); treeBtn.setAttribute('aria-expanded', 'false'); updateInsets(); }
  treeBtn.addEventListener('click', () => {
    const on = !document.body.classList.contains('tree-open');
    document.body.classList.toggle('tree-open', on);
    treeBtn.setAttribute('aria-expanded', on);
    updateInsets();
  });
  $('#grab').addEventListener('click', () => { document.body.classList.toggle('sheet-min'); setTimeout(updateInsets, 30); });
  function updateInsets() {
    const W = innerWidth, H = innerHeight;
    const info = $('#info').getBoundingClientRect(), bar = $('#bar .glass').getBoundingClientRect(), tree = $('#tree');
    const ins = { left: 0, right: 0, top: 0, bottom: 0 };
    if (W > 760) {
      if (W > 1180) ins.left = tree.getBoundingClientRect().right;
      ins.right = W - info.left;
      ins.bottom = H - bar.top;
      ins.top = 40;
    } else {
      ins.top = 64;
      ins.bottom = H - Math.min(bar.top, $('#views').getBoundingClientRect().top);
    }
    V.setInsets(ins);
  }
  addEventListener('resize', updateInsets);
  updateInsets();

  let hintHidden = false;
  function hideHint() { if (hintHidden) return; hintHidden = true; $('#hint').style.opacity = 0; }

  render();
  return { render, updateInsets };
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
