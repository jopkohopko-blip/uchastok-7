// Интерфейс: состав, карточки, выноски, подсказки, режимы, презентация, викторина,
// сравнение с фотографией, материалы для скачивания, клавиши, языки.
import * as THREE from 'three';
import { cycle } from './spec.js';
import { t as tr, getLang, setLang, onLang, eng, asmT, partT, plural, tourSteps } from './lang.js';
import { FLOW_KINDS } from './flows.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');
const get = (o, path) => path.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
const svg = (d, fill) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="1.5">${d}</svg>`;
const IC = {
  drag: svg('<path d="M13.5 8A5.5 5.5 0 1 1 11 3.4"/><path d="M11 1v2.6H8.4"/>'),
  click: svg('<path d="M4 2.5 12 8l-3.6.9L10.5 13l-1.6.8-2-4.1L4 12Z"/>'),
  xray: svg('<rect x="2" y="2" width="12" height="12" rx="2" stroke-dasharray="2 2"/><circle cx="8" cy="8" r="2.5"/>'),
  run: svg('<path d="M4.5 2.8v10.4L13 8Z"/>', true),
  tour: svg('<rect x="1.5" y="2.5" width="13" height="9" rx="1.5"/><path d="M5 14.5h6"/><path d="M6.5 5.2v3.6L9.6 7Z"/>'),
  back: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 3 5 8l5 5"/></svg>',
  next: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 3 5 5-5 5"/></svg>',
  zoom: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5M7 5v4M5 7h4"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3.5 8.5 6 11l6.5-6.5"/></svg>',
  chev: '<svg class="chev" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 3 5 5-5 5"/></svg>',
  doc: svg('<path d="M4 1.5h5.5L13 5v9.5H4Z"/><path d="M9.5 1.5V5H13M6 8.5h5M6 11h5"/>'),
  sheet: svg('<rect x="2" y="2.5" width="12" height="11" rx="1.2"/><path d="M2 6.2h12M2 9.8h12M6.5 2.5v11"/>'),
  image: svg('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><circle cx="5.5" cy="6.2" r="1.3"/><path d="m2 12 4-3.5 3 2.5 2-1.5 3.5 3"/>'),
};
const SHOT_SIZE = 2400;

export function initUI(V, { isDark, setDark }) {
  const S = V.S, model = V.model, canvas = V.renderer.domElement, body = document.body;
  const card = $('#card'), list = $('#asmList'), hot = $('#hot'), tip = $('#tip');
  const partKey = p => `${p.asm.id}|${p.key}`;
  const findPart = k => { const [a, key] = k.split('|'); return model.asm(a).parts.find(p => p.key === key); };
  const aT = a => asmT(a), pT = p => partT(p);
  let T = tr();

  // ---------------------------------------------------------------- статические тексты
  function applyStatic() {
    T = tr();
    for (const el of document.querySelectorAll('[data-i18n]')) { const v = get(T, el.dataset.i18n); if (typeof v === 'string') el.textContent = v; }
    for (const el of document.querySelectorAll('[data-i18n-html]')) { const v = get(T, el.dataset.i18nHtml); if (typeof v === 'string') el.innerHTML = v; }
    for (const el of document.querySelectorAll('[data-i18n-title]')) { const v = get(T, el.dataset.i18nTitle); if (typeof v === 'string') el.title = v; }
    for (const el of document.querySelectorAll('[data-i18n-aria]')) { const v = get(T, el.dataset.i18nAria); if (typeof v === 'string') el.setAttribute('aria-label', v); }
    for (const el of document.querySelectorAll('[data-i18n-ph]')) { const v = get(T, el.dataset.i18nPh); if (typeof v === 'string') el.placeholder = v; }
    $('#sub').textContent = T.sub(model.asms.length, model.parts.length);
    document.title = getLang() === 'en' ? 'Racing V8 anatomy' : 'Анатомия гоночного V8';
    $('#photoImg').alt = $('#photoOver').alt = T.photoTitle;
  }

  // ---------------------------------------------------------------- состав
  const expanded = new Set();
  function buildTree() {
    list.innerHTML = model.asms.map(a => `
      <div class="asm" data-asm="${a.id}">
        <button aria-expanded="false"><span class="n">${pad(a.def.no)}</span><span class="t">${esc(aT(a).name)}</span><span class="c">${a.parts.length}</span>${IC.chev}</button>
        <div class="parts" hidden>${a.parts.map(p => `<button class="part" data-part="${partKey(p)}"><span class="n">${p.no}</span><span class="t">${esc(pT(p).name)}</span></button>`).join('')}</div>
      </div>`).join('');
    for (const id of expanded) setExpanded(id, true);
    if ($('#q').value) filter();
  }
  function setExpanded(id, on) {
    const el = list.querySelector(`[data-asm="${id}"]`);
    on ? expanded.add(id) : expanded.delete(id);
    if (!el) return;
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
  function filter() {
    const q = $('#q').value.trim().toLowerCase();
    for (const el of list.querySelectorAll('.asm')) {
      const a = model.asm(el.dataset.asm), an = aT(a).name.toLowerCase();
      let any = !q || an.includes(q);
      for (const pb of el.querySelectorAll('.part')) {
        const name = pT(findPart(pb.dataset.part)).name, i = name.toLowerCase().indexOf(q);
        const hit = !q || i >= 0;
        pb.hidden = !hit && !(!q || an.includes(q));
        pb.querySelector('.t').innerHTML = q && i >= 0 ? `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + q.length))}</mark>${esc(name.slice(i + q.length))}` : esc(name);
        if (q && i >= 0) any = true;
      }
      el.hidden = !any;
      if (q) { el.classList.toggle('open', any); el.querySelector('.parts').hidden = !any; }
      else setExpanded(el.dataset.asm, expanded.has(el.dataset.asm));
    }
  }
  $('#q').addEventListener('input', filter);

  // ---------------------------------------------------------------- карточки
  const cur = () => S.sel ? S.sel.asm : S.open;
  function crumbs(items) {
    return `<nav class="crumbs" aria-label="${esc(T.crumbs)}">${items.map((it, i) => (i ? '<span class="sep">›</span>' : '') + (it.act ? `<button data-act="${it.act}">${esc(it.t)}</button>` : `<span>${esc(it.t)}</span>`)).join('')}</nav>`;
  }
  function overview() {
    const E = eng(), icons = [IC.drag, IC.click, IC.xray, IC.run, IC.tour];
    return `<div class="card">
      <div class="eyebrow">${esc(T.overview)}</div>
      <h2 class="big">${esc(E.name)}</h2>
      <p class="kind">${esc(E.kind)}</p>
      <p class="lead">${esc(E.intro)}</p>
      <dl class="spec">${E.specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="sec">${esc(T.materials)}</div>
      <div class="dl">
        <button class="btn" data-dl="pdf">${IC.doc}<span>${esc(T.pdf)}</span><small>PDF</small></button>
        <button class="btn" data-dl="xlsx">${IC.sheet}<span>${esc(T.xlsx)}</span><small>XLSX</small></button>
        <button class="btn" data-dl="png">${IC.image}<span>${esc(T.png)}</span><small>PNG</small></button>
      </div>
      <div class="sec">${esc(T.howto)}</div>
      <ul class="howto">${T.how.map((h, i) => `<li>${icons[i]}<span>${esc(h)}</span></li>`).join('')}</ul>
      <div class="note">${esc(E.note)}</div>
    </div>`;
  }
  function assemblyCard(a) {
    const n = a.parts.length;
    return `<div class="card">
      ${crumbs([{ t: T.engine, act: 'home' }, { t: `${T.unit} ${pad(a.def.no)}` }])}
      <div class="eyebrow">${esc(T.unit)} ${pad(a.def.no)} · ${n} ${esc(plural(n, T.partsWord))}</div>
      <h2>${esc(aT(a).name)}</h2>
      <p class="lead" style="margin-top:8px">${esc(aT(a).about)}</p>
      <div class="sec">${esc(T.unitParts)}</div>
      <ul class="plist">${a.parts.map(p => `<li><button data-part="${partKey(p)}"><span class="n">${p.no}</span><span>${esc(pT(p).name)}</span><span class="q">×${esc(pT(p).qty.split(' ')[0])}</span></button></li>`).join('')}</ul>
      <div class="actions">
        ${S.exploded ? '' : `<button class="btn" data-act="home">${IC.close}${esc(T.collapse)}</button>`}
        <button class="btn" data-act="frame">${IC.zoom}${esc(T.showAll)}</button>
      </div>
    </div>`;
  }
  function partCard(p) {
    const a = p.asm, d = pT(p), i = a.parts.indexOf(p);
    const prev = a.parts[i - 1], next = a.parts[i + 1];
    return `<div class="card">
      ${crumbs([{ t: T.engine, act: 'home' }, { t: aT(a).name, act: 'asm' }, { t: p.no }])}
      <div class="eyebrow">${esc(T.pos)} ${p.no}</div>
      <h2>${esc(d.name)}</h2>
      <div class="chips"><span class="chip">${esc(T.qty)} <b>${esc(d.qty)}</b></span><span class="chip">${esc(d.mat)}</span></div>
      <div class="sec">${esc(T.role)}</div>
      <p class="body">${esc(d.role)}</p>
      <div class="sec">${esc(T.howWorks)}</div>
      <p class="body">${esc(d.how)}</p>
      ${d.data && d.data.length ? `<div class="sec">${esc(T.params)}</div><dl class="spec">${d.data.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      <div class="actions"><button class="btn" data-act="focus">${IC.zoom}${esc(T.zoom)}</button><button class="btn" data-act="asm">${IC.back}${esc(T.toUnit)}</button></div>
      <div class="pager">
        ${prev ? `<button class="btn" data-part="${partKey(prev)}">${IC.back}<span>${esc(pT(prev).name)}</span></button>` : '<span></span>'}
        ${next ? `<button class="btn" data-part="${partKey(next)}"><span>${esc(pT(next).name)}</span>${IC.next}</button>` : '<span></span>'}
      </div>
    </div>`;
  }
  function runCard() {
    const cyl = no => `<div class="cyl" data-no="${no}"><b>${no}</b><i></i><span>—</span></div>`;
    const dark = isDark(), col = k => '#' + new THREE.Color(dark ? FLOW_KINDS[k].color : FLOW_KINDS[k].light).getHexString();
    const fl = [['air', T.flowAir], ['exh', T.flowExh], ['oil', T.flowOil], ['fuel', T.flowFuel]];
    return `<div class="card">
      <div class="eyebrow">${esc(T.runEyebrow)}</div>
      <h2>${esc(T.runTitle)}</h2>
      <p class="lead" style="margin-top:8px">${esc(T.runLead)}</p>
      <div class="gauge"><span>${esc(T.crankAngle)}</span><b class="num" id="crankDeg">0°</b></div>
      <div class="rpmrow"><span>${esc(T.rpmLabel)}</span><span class="seg" role="group" aria-label="${esc(T.titles.rpm)}">${[15, 40, 90, 180].map(r => `<button data-rpm="${r}" aria-pressed="${S.rpm === r}">${r}</button>`).join('')}</span><small>${esc(T.rpmUnit)}</small></div>
      <div class="cyc">
        <div class="bank"><div class="lbl">${esc(T.bankR)}</div>${[1, 2, 3, 4].map(cyl).join('')}</div>
        <div class="bank"><div class="lbl">${esc(T.bankL)}</div>${[5, 6, 7, 8].map(cyl).join('')}</div>
      </div>
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--accent)"></i>${esc(T.strokes[2])}</span><span><i style="background:var(--cmp)"></i>${esc(T.strokes[3])}</span><span><i style="background:var(--warn)"></i>${esc(T.strokes[0])}</span><span><i style="background:var(--ti)"></i>${esc(T.strokes[1])}</span></div>
      <div class="sec">${esc(T.flows)}</div>
      <div class="flows">${fl.map(([k, n]) => `<span style="color:${col(k)}"><i style="background:${col(k)}"></i><span style="color:var(--ink-2)">${esc(n)}</span></span>`).join('')}</div>
      <label class="check"><input type="checkbox" id="flowsOn" ${S.flows ? 'checked' : ''}>${esc(T.showFlows)}</label>
      <div class="note">${esc(T.runNote)}</div>
    </div>`;
  }

  let lastKey = '', lastOpen = null;
  function render() {
    const a = cur(), p = S.sel;
    const key = getLang() + (quiz.on ? `q:${quiz.i}:${quiz.state}` : S.running ? 'run' + isDark() : p ? 'p:' + partKey(p) + S.exploded : a ? 'a:' + a.id + S.exploded : 'home');
    if (key !== lastKey) {
      card.innerHTML = quiz.on ? quizCard() : S.running ? runCard() : p ? partCard(p) : a ? assemblyCard(a) : overview();
      card.scrollTop = 0;
      lastKey = key;
      if (S.hover && S.hover.kind === 'part') V.setHover(null);
      buildHotspots();
    }
    // состояние дерева
    for (const el of list.querySelectorAll('.asm')) el.classList.toggle('on', !!a && el.dataset.asm === a.id);
    for (const pb of list.querySelectorAll('.part')) pb.classList.toggle('on', !!p && pb.dataset.part === partKey(p));
    if (a && a.id !== lastOpen && !$('#q').value) { for (const id of [...expanded]) if (id !== a.id) setExpanded(id, false); }
    lastOpen = a ? a.id : null;
    if (a && !expanded.has(a.id) && !quiz.on) setExpanded(a.id, true);
    if (p) { const pb = list.querySelector(`.part[data-part="${partKey(p)}"]`); if (pb && list.offsetParent) pb.scrollIntoView({ block: 'nearest' }); }
    // кнопки
    $('#bExplode').setAttribute('aria-pressed', S.exploded);
    $('#amtWrap').hidden = !S.exploded;
    $('#bXray').setAttribute('aria-pressed', S.xray);
    $('#bRun').setAttribute('aria-pressed', S.running);
    $('#bRun .lbl').textContent = S.running ? T.stop : T.run;
    $('#bRun').title = T.titles.run;
    $('#bRun svg').innerHTML = S.running ? '<rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/>' : '<path d="M4.5 2.8v10.4L13 8Z"/>';
    for (const b of card.querySelectorAll('[data-rpm]')) b.setAttribute('aria-pressed', S.rpm === +b.dataset.rpm);
    $('#bSpin').setAttribute('aria-pressed', S.autoRotate);
    $('#bCut').setAttribute('aria-pressed', !!S.section);
    $('#cutPanel').hidden = !S.section;
    for (const b of document.querySelectorAll('[data-cut]')) b.setAttribute('aria-pressed', S.section === b.dataset.cut);
    if (S.section) $('#cutPos').value = S.cut;
  }
  card.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-part],[data-dl],[data-q],[data-rpm]');
    if (!b) return;
    if (b.dataset.rpm) return V.setRpm(+b.dataset.rpm);
    if (b.dataset.q) return quizAction(b.dataset.q);
    if (b.dataset.dl) return download(b.dataset.dl, b);
    if (b.dataset.part) return V.selectPart(findPart(b.dataset.part));
    const act = b.dataset.act, a = cur();
    if (act === 'home') { if (S.exploded) { V.selectPart(null); S.open = null; render(); } else V.closeAll(); }
    else if (act === 'asm' && a) { V.selectPart(null); if (!S.exploded) V.openAssembly(a); }
    else if (act === 'frame') V.setView(null);
    else if (act === 'focus' && S.sel) V.focusPart(S.sel);
  });
  card.addEventListener('change', e => { if (e.target.id === 'flowsOn') V.setFlows(e.target.checked); });
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
    if (!a || S.running || quiz.on) return;
    for (const p of a.parts) {
      const el = document.createElement('button');
      el.className = 'hs';
      el.innerHTML = `<span class="d">${p.index + 1}</span><span class="lb">${esc(pT(p).name)}</span>`;
      el.setAttribute('aria-label', `${p.no} ${pT(p).name}`);
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
      if (el.dataset.k !== String(k) || el.dataset.l !== getLang()) { el.dataset.k = k; el.dataset.l = getLang(); el.querySelector('span').textContent = T.strokes[k]; }
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
    if (quiz.on && (quiz.state !== 'ask' || (t && t.kind !== 'part'))) { V.setHover(null); tip.hidden = true; canvas.style.cursor = ''; return; }
    V.setHover(t);
    if (!t) { tip.hidden = true; canvas.style.cursor = ''; return; }
    canvas.style.cursor = 'pointer';
    if (quiz.on) { tip.hidden = true; return; }
    let name, sub;
    if (t.kind === 'part') { name = pT(t.part).name; sub = T.tipPart(t.part.no); }
    else { name = aT(t.asm).name; sub = S.open && S.open !== t.asm ? T.tipGo : T.tipAsm(pad(t.asm.def.no)); }
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
  canvas.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button };
    hideHint();
    if (tour.on && !tour.paused) pauseTour(true);
  });
  window.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (e.target === canvas && moved < 6 && down.b === 0 && performance.now() - down.t < 700) {
      const hit = V.pick(e.clientX, e.clientY);
      if (quiz.on) quizPick(hit); else V.click(hit);
      tip.hidden = true;
    }
    down = null; dragging = false;
  });
  canvas.addEventListener('dblclick', e => {
    if (quiz.on) return;
    const t = V.hoverTarget(V.pick(e.clientX, e.clientY));
    if (t && t.kind === 'part') V.focusPart(t.part);
  });

  // ---------------------------------------------------------------- панель режимов
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => {
    if (b.dataset.view === 'photo') openPhoto(photoMode);
    else V.setView(b.dataset.view);
  });
  const amt = $('#amt');
  $('#bExplode').addEventListener('click', () => V.setExploded(!S.exploded, +amt.value));
  amt.addEventListener('input', () => V.setAmount(+amt.value));
  $('#bXray').addEventListener('click', () => V.setXray(!S.xray));
  $('#bRun').addEventListener('click', () => toggleRun());
  $('#bSpin').addEventListener('click', () => V.setAutoRotate(!S.autoRotate));
  $('#bTheme').addEventListener('click', () => { setDark(!isDark()); render(); });
  $('#bCut').addEventListener('click', () => toggleCut());
  for (const b of document.querySelectorAll('[data-cut]')) b.addEventListener('click', () => V.setSection(b.dataset.cut));
  $('#cutPos').addEventListener('input', e => V.setCut(+e.target.value));
  $('#bShot').addEventListener('click', () => download('png'));
  $('#bLang').addEventListener('click', () => setLang(getLang() === 'en' ? 'ru' : 'en'));
  $('#bTour').addEventListener('click', () => (tour.on ? endTour() : startTour()));
  $('#bQuiz').addEventListener('click', () => (quiz.on ? exitQuiz() : startQuiz()));
  function toggleRun() {
    const on = !S.running;
    if (on && !S.xray && !S.section) V.setXray(true);
    V.setRunning(on);
    if (on && !S.section) V.setView('iso');
  }
  function toggleCut() { V.setSection(S.section ? null : 'x'); }

  // ---------------------------------------------------------------- сообщения и сохранение файлов
  let toastT = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.hidden = true; }, 2600);
  }
  async function saveFile(filename, blob) {
    const use = window.claude && window.claude.use;
    if (use) {
      let dl = null;
      try { dl = await use.call(window.claude, 'downloads'); } catch (e) { dl = null; }
      if (dl) {
        try { await dl.save({ filename, data: blob }); toast(T.saved); return; }
        catch (e) {
          if (e && e.code === 'declined') { toast(T.declined); return; }
          if (e && e.code === 'rate_limited') { toast(T.saveFail); return; }
          if (e && !['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)) { toast(T.saveFail); return; }
        }
      }
    }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  let busy = false;
  async function download(kind, btn) {
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    try {
      const L = getLang();
      if (kind === 'png') {
        tip.hidden = true;
        const blob = await V.snapshot({ width: SHOT_SIZE, caption: T.caption });
        if (!blob) throw new Error('snapshot');
        const d = new Date(), stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
        await saveFile(`V8-5.0_${stamp}.png`, blob);
      } else {
        const src = kind === 'pdf' ? `spec/v8-spec-${L}.pdf` : 'spec/v8-spec.xlsx';
        const r = await fetch(src);
        if (!r.ok) throw new Error(r.status);
        const name = kind === 'pdf' ? (L === 'en' ? 'V8-5.0_specification.pdf' : 'V8-5.0_specifikaciya.pdf') : 'V8-5.0_specification.xlsx';
        await saveFile(name, await r.blob());
      }
    } catch (e) {
      console.error(e);
      toast(T.saveFail);
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  // ---------------------------------------------------------------- сравнение с фотографией
  const photo = $('#photo'), over = $('#photoOver');
  let photoMode = 'side';
  function openPhoto(mode = 'side') {
    if ($('#photoImg').getAttribute('src') !== 'img/photo.webp') { $('#photoImg').src = 'img/photo.webp'; over.src = 'img/photo.webp'; }
    photo.hidden = false;
    updateInsets();
    setPhotoMode(mode);
    if (S.running) V.setRunning(false);
    if (S.section) V.setSection(null);
    if (S.exploded) V.setExploded(false);
    if (S.open) V.closeAll();
    V.setView('photo');
  }
  function setPhotoMode(m) {
    photoMode = m;
    for (const b of document.querySelectorAll('[data-pm]')) b.setAttribute('aria-pressed', b.dataset.pm === m);
    $('#photoOpWrap').hidden = m !== 'over';
    over.hidden = m !== 'over';
    over.style.opacity = $('#photoOp').value;
    placeOverlay();
  }
  function closePhoto() { if (photo.hidden) return; photo.hidden = true; over.hidden = true; updateInsets(); }
  function placeOverlay() {
    const I = lastIns;
    Object.assign(over.style, { left: `${I.left}px`, top: `${I.top}px`, width: `${innerWidth - I.left - I.right}px`, height: `${innerHeight - I.top - I.bottom}px` });
  }
  for (const b of document.querySelectorAll('[data-pm]')) b.addEventListener('click', () => setPhotoMode(b.dataset.pm));
  $('#photoOp').addEventListener('input', e => { over.style.opacity = e.target.value; });
  $('#photoClose').addEventListener('click', closePhoto);

  // ---------------------------------------------------------------- презентация
  const tour = { on: false, i: 0, paused: false, el: 0, last: 0, dur: 8000 };
  const asm = id => model.asm(id);
  const part = (a, k) => asm(a).parts.find(p => p.key === k);
  function calm(keep = {}) {
    if (S.running && !keep.run) V.setRunning(false);
    if (S.section && !keep.cut) V.setSection(null);
    if (S.exploded && !keep.explode) V.setExploded(false);
    if (S.xray && !keep.xray) V.setXray(false);
    if (S.autoRotate && !keep.spin) V.setAutoRotate(false);
    if (!keep.photo) closePhoto();
    V.setHover(null);
  }
  const STEPS = [
    () => { calm({ spin: 1 }); V.closeAll(); V.setView('iso'); if (!S.autoRotate) V.setAutoRotate(true); },
    () => { calm(); V.closeAll(); V.setView('front'); },
    () => { calm(); V.openAssembly(asm('headR')); },
    () => { calm(); const p = part('headR', 'head.camIn'); V.selectPart(p); setTimeout(() => { if (tour.on && S.sel === p) V.focusPart(p); }, 150); },
    () => { calm(); V.openAssembly(asm('timing')); },
    () => { calm(); V.openAssembly(asm('crank')); },
    () => { calm(); V.openAssembly(asm('exhR')); },
    () => { calm(); V.openAssembly(asm('lube')); },
    () => { calm({ explode: 1 }); V.closeAll(); if (!S.exploded) V.setExploded(true, 0.7); },
    () => { calm({ xray: 1, run: 1 }); V.closeAll(); if (!S.xray) V.setXray(true); if (!S.running) V.setRunning(true); V.setView('iso'); },
    () => { calm({ run: 1, cut: 1 }); V.closeAll(); if (S.section !== 'x') V.setSection('x'); if (!S.running) V.setRunning(true); },
    () => { calm({ photo: 1 }); V.closeAll(); openPhoto('side'); },
    () => { calm({ spin: 1 }); V.closeAll(); V.setView('iso'); if (!S.autoRotate) V.setAutoRotate(true); },
  ];
  function tourText(i) {
    const [title, text] = tourSteps()[i];
    const f = s => s.replace('{A}', model.asms.length).replace('{P}', model.parts.length);
    $('#tourTitle').textContent = f(title);
    $('#tourText').textContent = f(text);
    $('#tourNo').textContent = T.tourStep(i + 1, STEPS.length);
    return f(text);
  }
  function goStep(i) {
    tour.i = Math.max(0, Math.min(STEPS.length - 1, i));
    const text = tourText(tour.i);
    tour.dur = Math.max(6500, 2600 + text.length * 48);
    tour.el = 0;
    STEPS[tour.i]();
    $('#tourPrev').disabled = tour.i === 0;
    $('#tourNext').querySelector('span').textContent = tour.i === STEPS.length - 1 ? T.tourEnd : T.tourNext;
  }
  function startTour() {
    if (quiz.on) exitQuiz();
    tour.on = true; tour.paused = false;
    body.classList.add('touring');
    $('#tour').hidden = false;
    $('#bTour').setAttribute('aria-pressed', true);
    closeDrawer();
    hideHint();
    updateInsets();
    goStep(0);
    pauseTour(false);
    tour.last = performance.now();
    requestAnimationFrame(tourTick);
  }
  function endTour() {
    if (!tour.on) return;
    tour.on = false;
    body.classList.remove('touring');
    $('#tour').hidden = true;
    $('#bTour').setAttribute('aria-pressed', false);
    calm();
    V.closeAll();
    updateInsets();
    V.setView('iso');
  }
  function pauseTour(p) {
    tour.paused = p;
    $('#tourPauseLbl').textContent = p ? T.tourPlay : T.tourPause;
  }
  function tourTick(now) {
    if (!tour.on) return;
    const dt = Math.min(100, Math.max(0, now - tour.last));
    tour.last = now;
    if (!tour.paused) tour.el += dt;
    $('#tourBar').style.width = `${Math.min(100, (tour.i + Math.min(1, tour.el / tour.dur)) / STEPS.length * 100)}%`;
    if (!tour.paused && tour.el >= tour.dur) {
      if (tour.i < STEPS.length - 1) goStep(tour.i + 1);
      else pauseTour(true);
    }
    requestAnimationFrame(tourTick);
  }
  $('#tourNext').addEventListener('click', () => { if (tour.i === STEPS.length - 1) endTour(); else goStep(tour.i + 1); });
  $('#tourPrev').addEventListener('click', () => goStep(tour.i - 1));
  $('#tourPause').addEventListener('click', () => pauseTour(!tour.paused));
  $('#tourEnd').addEventListener('click', endTour);

  // ---------------------------------------------------------------- викторина
  const quiz = { on: false, i: 0, n: 10, list: [], res: [], state: 'ask', picked: null };
  const size = p => { const b = new THREE.Box3(); for (const pc of p.pieces) b.union(pc.box); const s = b.getSize(new THREE.Vector3()); return Math.max(s.x, s.y, s.z); };
  function quizPool() {
    const seen = new Set(), pool = [];
    for (const a of model.asms) for (const p of a.parts) {
      if (seen.has(p.key) || a.parts.length < 3 || size(p) < 0.05) continue;
      seen.add(p.key);
      pool.push(p);
    }
    return pool;
  }
  function startQuiz() {
    if (tour.on) endTour();
    closePhoto();
    calm();
    const pool = quizPool();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    Object.assign(quiz, { on: true, i: 0, n: Math.min(10, pool.length), list: pool.slice(0, 10), res: [], state: 'ask', picked: null });
    body.classList.add('quiz');
    $('#bQuiz').setAttribute('aria-pressed', true);
    closeDrawer();
    hideHint();
    updateInsets();
    ask(0);
  }
  function ask(i) {
    quiz.i = i; quiz.state = 'ask'; quiz.picked = null;
    V.mark(null);
    V.selectPart(null);
    V.openAssembly(quiz.list[i].asm);
    lastKey = '';
    render();
  }
  function quizPick(hit) {
    if (quiz.state !== 'ask') return;
    const t = V.hoverTarget(hit);
    if (!t || t.kind !== 'part') return;
    const target = quiz.list[quiz.i];
    const ok = t.part.key === target.key;
    quiz.res[quiz.i] = ok;
    quiz.picked = ok ? null : t.part;
    quiz.state = 'answered';
    V.setHover(null);
    V.mark(target, 'right');
    lastKey = '';
    render();
  }
  function quizAction(a) {
    if (a === 'skip') { quiz.res[quiz.i] = false; quiz.picked = null; quiz.state = 'answered'; V.mark(quiz.list[quiz.i], 'right'); lastKey = ''; render(); }
    else if (a === 'next') { if (quiz.i + 1 < quiz.n) ask(quiz.i + 1); else { quiz.state = 'done'; V.mark(null); V.closeAll(); V.setView('iso'); lastKey = ''; render(); } }
    else if (a === 'again') startQuiz();
    else if (a === 'end') exitQuiz();
  }
  function exitQuiz() {
    if (!quiz.on) return;
    quiz.on = false;
    body.classList.remove('quiz');
    $('#bQuiz').setAttribute('aria-pressed', false);
    V.mark(null);
    V.closeAll();
    updateInsets();
    lastKey = '';
    render();
  }
  function quizCard() {
    const score = quiz.res.filter(Boolean).length;
    const dots = Array.from({ length: quiz.n }, (_, i) => `<i class="${quiz.res[i] === true ? 'ok' : quiz.res[i] === false ? 'bad' : i === quiz.i && quiz.state !== 'done' ? 'cur' : ''}"></i>`).join('');
    if (quiz.state === 'done') {
      return `<div class="card quiz">
        <div class="eyebrow">${esc(T.quiz)}</div>
        <h2>${esc(T.quizDone)}</h2>
        <div class="dots">${dots}</div>
        <div class="big num">${score} / ${quiz.n}</div>
        <p class="lead">${esc(T.quizResult(score, quiz.n))}. ${esc(T.quizGrade(score, quiz.n))}</p>
        <div class="actions"><button class="btn primary" data-q="again">${esc(T.quizAgain)}</button><button class="btn" data-q="end">${esc(T.quizEnd)}</button></div>
      </div>`;
    }
    const p = quiz.list[quiz.i], d = pT(p), a = p.asm;
    const res = quiz.state === 'answered'
      ? `<div class="qres ${quiz.res[quiz.i] ? 'ok' : 'bad'}">${esc(quiz.res[quiz.i] ? T.quizRight : quiz.picked ? T.quizWrong(pT(quiz.picked).name) : T.quizWrong(d.name))}</div>
         <p class="qrole" style="margin-top:10px">${esc(d.role)}</p>`
      : `<p class="qrole">${esc(T.quizHint)}</p>`;
    return `<div class="card quiz">
      <div class="eyebrow">${esc(T.quizTitle)} · ${esc(T.quizRound(quiz.i + 1, quiz.n))}</div>
      <div class="dots">${dots}</div>
      <div class="score"><span>${esc(T.unit)} ${pad(a.def.no)} · ${esc(aT(a).name)}</span><span>${esc(T.quizScore(score))}</span></div>
      <div class="sec">${esc(T.quizAsk)}</div>
      <div class="qname">${esc(d.name)}</div>
      ${res}
      <div class="actions">
        ${quiz.state === 'answered' ? `<button class="btn primary" data-q="next">${esc(quiz.i + 1 < quiz.n ? T.quizNext : T.quizDone)}${IC.next}</button>` : `<button class="btn" data-q="skip">${esc(T.quizSkip)}</button>`}
        <button class="btn" data-q="end">${esc(T.quizEnd)}</button>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- клавиши
  const VIEWKEYS = { Digit1: 'iso', Digit2: 'front', Digit3: 'rear', Digit4: 'left', Digit5: 'right', Digit6: 'top', Digit7: 'bottom' };
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,select,textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (tour.on) {
      if (e.key === 'Escape') endTour();
      else if (['ArrowRight', 'PageDown', 'Enter'].includes(e.key)) { if (tour.i === STEPS.length - 1) endTour(); else goStep(tour.i + 1); }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) goStep(tour.i - 1);
      else if (e.code === 'Space') pauseTour(!tour.paused);
      else return;
      e.preventDefault();
      return;
    }
    if (quiz.on) {
      if (e.key === 'Escape') exitQuiz();
      else if (e.key === 'Enter' && quiz.state === 'answered') quizAction('next');
      else if (VIEWKEYS[e.code]) V.setView(VIEWKEYS[e.code]);
      return;
    }
    if (e.key === 'Escape') {
      if (document.body.classList.contains('tree-open')) return closeDrawer();
      if (!photo.hidden) return closePhoto();
      if (S.section) return V.setSection(null);
      if (S.running) return V.setRunning(false);
      if (S.sel) return V.selectPart(null);
      if (S.exploded && S.open) { S.open = null; return render(); }
      if (S.open) return V.closeAll();
      if (S.exploded) return V.setExploded(false);
      return;
    }
    if (VIEWKEYS[e.code]) { V.setView(VIEWKEYS[e.code]); e.preventDefault(); }
    else if (e.code === 'Digit8') openPhoto(photoMode);
    else if (e.code === 'KeyE') V.setExploded(!S.exploded, +amt.value);
    else if (e.code === 'KeyX') V.setXray(!S.xray);
    else if (e.code === 'Space') { toggleRun(); e.preventDefault(); }
    else if (e.code === 'KeyR') V.setAutoRotate(!S.autoRotate);
    else if (e.code === 'KeyT') { setDark(!isDark()); render(); }
    else if (e.code === 'KeyC') toggleCut();
    else if (e.code === 'KeyP') download('png');
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
  let lastIns = { left: 0, right: 0, top: 0, bottom: 0 };
  const rect = el => { const r = el.getBoundingClientRect(); return r.width || r.height ? r : null; };
  function updateInsets() {
    const W = innerWidth, H = innerHeight;
    const info = rect($('#info')), tree = rect($('#tree'));
    const bottomEl = rect(tour.on ? $('#tour .glass') : $('#bar .glass'));
    const ins = { left: 0, right: 0, top: 0, bottom: 0 };
    if (W > 760) {
      if (W > 1180 && tree) ins.left = tree.right;
      const ph = rect(photo);
      if (ph && !ph.hidden) ins.left = Math.max(ins.left, ph.right);
      if (info) ins.right = W - info.left;
      ins.bottom = bottomEl ? H - bottomEl.top : 16;
      ins.top = 40;
    } else {
      ins.top = 64;
      const side = rect($('#side'));
      ins.bottom = H - Math.min(bottomEl ? bottomEl.top : H, side ? side.top : H, info ? info.top : H);
    }
    lastIns = ins;
    V.setInsets(ins);
    if (!over.hidden) placeOverlay();
  }
  addEventListener('resize', updateInsets);

  let hintHidden = false;
  function hideHint() { if (hintHidden) return; hintHidden = true; const h = $('#hint'); if (h) h.style.opacity = 0; }

  // ---------------------------------------------------------------- язык
  onLang(() => {
    applyStatic();
    buildTree();
    lastKey = '';
    render();
    if (tour.on) { tourText(tour.i); pauseTour(tour.paused); $('#tourNext').querySelector('span').textContent = tour.i === STEPS.length - 1 ? T.tourEnd : T.tourNext; }
  });

  applyStatic();
  buildTree();
  updateInsets();
  render();
  return { render, updateInsets, startTour, endTour, startQuiz, exitQuiz, quizPick, openPhoto, closePhoto, download, quiz, tour, goStep };
}
