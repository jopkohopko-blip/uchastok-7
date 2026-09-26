// Запуск: сборка модели, тема, интерфейс.
import { createViewer } from './viewer.js';
import { initUI } from './ui.js';
import { getLang, t } from './lang.js';

const root = document.documentElement;
root.lang = getLang();
const T0 = t();
document.querySelector('#loading .eyebrow').textContent = T0.loadEyebrow;
document.getElementById('lmsg').textContent = T0.loading;
const mq = matchMedia('(prefers-color-scheme: light)');
const isDark = () => { const t = root.dataset.theme; return t ? t !== 'light' : !mq.matches; };
const lbar = document.getElementById('lbar'), lmsg = document.getElementById('lmsg');
let viewer = null;

function setDark(on) {
  root.dataset.theme = on ? 'dark' : 'light';
  try { localStorage.setItem('v8-theme', root.dataset.theme); } catch (e) { /* хранилище недоступно */ }
  viewer?.setTheme(on);
}
try { const t = localStorage.getItem('v8-theme'); if (t && !root.dataset.theme) root.dataset.theme = t; } catch (e) { /* нет доступа */ }
new MutationObserver(() => viewer?.setTheme(isDark())).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
mq.addEventListener?.('change', () => viewer?.setTheme(isDark()));

try {
  viewer = await createViewer(document.getElementById('stage'), {
    dark: isDark(),
    lang: getLang(),
    onProgress: (name, f) => { lmsg.textContent = name; lbar.style.width = `${Math.round(f * 100)}%`; },
  });
  window.__v8ready = true;
  window.v8 = viewer;
  window.v8ui = initUI(viewer, { isDark, setDark });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) viewer.intro(); else viewer.setView('iso');
  const ld = document.getElementById('loading');
  ld.style.opacity = 0;
  setTimeout(() => ld.remove(), 650);
} catch (err) {
  console.error(err);
  window.__v8ready = true;
  lmsg.innerHTML = `<span class="err">${t().fail}</span>`;
}
