// Языки: русский и английский. Тексты деталей — catalog.js / catalog_en.js, строки интерфейса — здесь.
import { ENGINE, PARTS } from './catalog.js';
import { ENGINE_EN, ASM_EN, PARTS_EN } from './catalog_en.js';

let lang = 'ru';
const subs = [];
export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'ru';
  try { localStorage.setItem('v8-lang', lang); } catch (e) { /* хранилище недоступно */ }
  document.documentElement.lang = lang;
  subs.forEach(f => f(lang));
}
export const onLang = f => subs.push(f);
try { const l = localStorage.getItem('v8-lang'); if (l === 'en' || l === 'ru') lang = l; } catch (e) { /* нет доступа */ }

export const eng = () => lang === 'en' ? ENGINE_EN : ENGINE;
export const asmT = a => lang === 'en' ? ASM_EN[a.id] : a.def;
export const partT = p => lang === 'en' ? PARTS_EN[p.key] : PARTS[p.key];

export function plural(n, forms) {
  if (lang === 'en') return n === 1 ? forms[0] : forms[1];
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

const RU = {
  eyebrow: 'Интерактивная 3D-модель',
  rpmUnit: 'об/мин', rpmLabel: 'Скорость показа', caption: 'V8 5.0 · интерактивная 3D-модель', stageAria: 'Трёхмерная модель двигателя: перетаскивайте, чтобы вращать, нажмите на узел, чтобы разобрать',
  viewsAria: 'Вид на двигатель', barAria: 'Режимы просмотра', toolsAria: 'Инструменты', modesAria: 'Презентация и викторина', grabAria: 'Свернуть или развернуть описание',
  matNote: 'Спецификация перечисляет все позиции с назначением, количеством и материалом. Снимок сохраняет текущий вид модели в высоком разрешении.',
  quizHint: 'Номера и подписи скрыты. Узел уже разобран — найдите в нём нужную деталь.', quizStart: 'Начать', quizIntro: 'Десять вопросов: модель показывает узел, а вы находите в нём названную деталь.',
  tourStep: (i, n) => `${i} / ${n}`,
  sub: (a, p) => `Гоночный атмосферный двигатель · ${a} узлов · ${p} ${plural(p, ['деталь', 'детали', 'деталей'])}`,
  tree: 'Состав двигателя', search: 'Найти деталь: клапан, цепь, форсунка…', searchAria: 'Поиск детали', treeBtn: 'Состав',
  views: { iso: '3/4', front: 'Спереди', rear: 'Сзади', left: 'Слева', right: 'Справа', top: 'Сверху', bottom: 'Снизу', photo: 'Как на фото' },
  explode: 'Разобрать всё', xray: 'Рентген', run: 'Запустить', stop: 'Остановить', spin: 'Вращение', theme: 'Фон',
  section: 'Разрез', shot: 'Снимок', tour: 'Презентация', quiz: 'Викторина', lang: 'EN',
  titles: { explode: 'Разнести все узлы (E)', xray: 'Рентген: видны только движущиеся детали (X)', run: 'Запустить двигатель (пробел)', spin: 'Автоповорот (R)', theme: 'Светлый или тёмный фон (T)', section: 'Разрез двигателя плоскостью (C)', shot: 'Сохранить снимок в PNG (P)', tour: 'Автоматический показ для презентации', quiz: 'Проверить себя: найдите деталь на модели', lang: 'English version', amt: 'Степень разноса', rpm: 'Скорость демонстрации', cut: 'Положение плоскости разреза' },
  cutX: 'Поперёк', cutBank: 'Вдоль ряда',
  hint: 'Перетаскивайте — вращение · колесо — масштаб · правая кнопка — сдвиг · нажмите на узел, чтобы разобрать · <kbd>Esc</kbd> — назад',
  loadEyebrow: 'Сборка модели', loading: 'Загрузка графики…', ready: 'Готово',
  slow: 'Графика загружается дольше обычного. Проверьте подключение к интернету: библиотека three.js подгружается с cdn.jsdelivr.net.',
  fail: 'Не удалось запустить 3D-графику. Откройте страницу в свежей версии Chrome, Edge, Safari или Firefox и проверьте, что в настройках браузера включено аппаратное ускорение.',
  overview: 'Общие сведения', howto: 'Как смотреть',
  how: [
    'Перетаскивайте модель мышью или пальцем, колесо и щипок меняют масштаб. Кнопки справа ставят вид спереди, сзади, сбоку, сверху, снизу и как на фотографии.',
    'Нажмите на любой узел: он разберётся на детали с номерами позиций. Нажмите на деталь — появится её описание и назначение.',
    '«Рентген» делает прозрачным всё, кроме движущихся деталей, «Разрез» рассекает двигатель плоскостью.',
    '«Запустить» показывает работу двигателя в замедленном темпе: поршни, клапаны, цепи и ремни движутся в правильных фазах, видны потоки воздуха, выхлопа, масла и топлива.',
    '«Презентация» проводит по двигателю сама, «Викторина» проверяет, кто запомнил детали.',
  ],
  materials: 'Материалы для презентации', pdf: 'Спецификация, PDF', xlsx: 'Спецификация, Excel', png: 'Снимок экрана, PNG',
  saved: 'Файл сохранён', saveFail: 'Не удалось сохранить файл', declined: 'Сохранение отменено',
  engine: 'Двигатель', unit: 'Узел', units: ['узел', 'узла', 'узлов'], partsWord: ['деталь', 'детали', 'деталей'],
  unitParts: 'Детали узла', collapse: 'Собрать узел', showAll: 'Показать целиком',
  pos: 'Позиция', qty: 'Кол-во', role: 'Назначение', howWorks: 'Как устроено и работает', params: 'Параметры', zoom: 'Показать крупнее', toUnit: 'К узлу',
  runEyebrow: 'Работа двигателя', runTitle: 'Четырёхтактный цикл',
  runLead: 'За два оборота коленчатого вала в каждом цилиндре проходят четыре такта: впуск, сжатие, рабочий ход и выпуск. Вспышки идут через каждые 90° поворота в порядке 1‑5‑4‑8‑7‑2‑6‑3, поэтому за оборот срабатывают четыре цилиндра.',
  crankAngle: 'Угол коленвала', bankR: 'Правый ряд', bankL: 'Левый ряд',
  strokes: ['Рабочий ход', 'Выпуск', 'Впуск', 'Сжатие'],
  flows: 'Потоки', flowAir: 'Воздух', flowExh: 'Выхлоп', flowOil: 'Масло', flowFuel: 'Топливо', showFlows: 'Показывать потоки',
  runNote: 'Показ замедлен: на 7 500 мин⁻¹ коленвал делает 125 оборотов в секунду. Скорость потоков воздуха и выхлопа следует за открытием клапанов своего цилиндра.',
  tipPart: no => `Позиция ${no} · нажмите для описания`, tipAsm: no => `Узел ${no} · нажмите, чтобы разобрать`, tipGo: 'Нажмите, чтобы перейти к этому узлу',
  crumbs: 'Путь',
  photoTitle: 'Сравнение с фотографией', photoSide: 'Рядом', photoOver: 'Наложить', photoOpacity: 'Прозрачность фото', photoClose: 'Закрыть',
  photoNote: 'Камера встала в ракурс исходного снимка. Режим «Наложить» кладёт фото поверх модели.',
  tourNext: 'Далее', tourPrev: 'Назад', tourPause: 'Пауза', tourPlay: 'Продолжить', tourEnd: 'Завершить',
  quizTitle: 'Найдите деталь', quizRound: (i, n) => `Вопрос ${i} из ${n}`, quizScore: s => `Верно: ${s}`,
  quizAsk: 'Нажмите на эту деталь на модели:', quizRight: 'Верно!', quizWrong: name => `Это «${name}». Правильная деталь подсвечена.`,
  quizNext: 'Следующий вопрос', quizSkip: 'Пропустить', quizEnd: 'Закончить', quizDone: 'Викторина окончена',
  quizResult: (s, n) => `Правильных ответов: ${s} из ${n}`, quizAgain: 'Ещё раз',
  quizGrade: (s, n) => s >= n * 0.8 ? 'Отлично: вы хорошо знаете устройство двигателя.' : s >= n * 0.5 ? 'Хорошо. Загляните в карточки деталей, где ошиблись.' : 'Стоит пройтись по узлам ещё раз: карточки объясняют каждую деталь.',
};

const EN = {
  eyebrow: 'Interactive 3D model',
  rpmUnit: 'rpm', rpmLabel: 'Demo speed', caption: 'V8 5.0 · interactive 3D model', stageAria: '3D engine model: drag to rotate, click an assembly to take it apart',
  viewsAria: 'Engine view', barAria: 'View modes', toolsAria: 'Tools', modesAria: 'Presentation and quiz', grabAria: 'Collapse or expand the description',
  matNote: 'The specification lists every item with its purpose, quantity and material. The snapshot saves the current view in high resolution.',
  quizHint: 'Numbers and labels are hidden. The assembly is already taken apart: find the named part in it.', quizStart: 'Start', quizIntro: 'Ten questions: the model shows an assembly and you find the named part in it.',
  tourStep: (i, n) => `${i} / ${n}`,
  sub: (a, p) => `Naturally aspirated racing engine · ${a} assemblies · ${p} parts`,
  tree: 'Engine contents', search: 'Find a part: valve, chain, injector…', searchAria: 'Search parts', treeBtn: 'Contents',
  views: { iso: '3/4', front: 'Front', rear: 'Rear', left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom', photo: 'As in photo' },
  explode: 'Explode all', xray: 'X-ray', run: 'Run', stop: 'Stop', spin: 'Rotate', theme: 'Background',
  section: 'Section', shot: 'Snapshot', tour: 'Presentation', quiz: 'Quiz', lang: 'RU',
  titles: { explode: 'Explode all assemblies (E)', xray: 'X-ray: only moving parts stay solid (X)', run: 'Run the engine (Space)', spin: 'Auto-rotate (R)', theme: 'Light or dark background (T)', section: 'Cut the engine with a plane (C)', shot: 'Save a PNG snapshot (P)', tour: 'Automatic walkthrough for a presentation', quiz: 'Test yourself: find the part on the model', lang: 'Русская версия', amt: 'Explosion amount', rpm: 'Demo speed', cut: 'Section plane position' },
  cutX: 'Across', cutBank: 'Along bank',
  hint: 'Drag to rotate · wheel to zoom · right button to pan · click an assembly to take it apart · <kbd>Esc</kbd> to go back',
  loadEyebrow: 'Building the model', loading: 'Loading graphics…', ready: 'Ready',
  slow: 'Graphics are taking longer than usual to load. Check the internet connection: three.js is loaded from cdn.jsdelivr.net.',
  fail: 'Could not start 3D graphics. Open the page in a recent Chrome, Edge, Safari or Firefox and make sure hardware acceleration is enabled in the browser settings.',
  overview: 'Overview', howto: 'How to explore',
  how: [
    'Drag the model with the mouse or a finger; the wheel or a pinch zooms. The buttons on the right set front, rear, side, top, bottom and photo views.',
    'Click any assembly and it comes apart into numbered parts. Click a part to see what it is and what it does.',
    '"X-ray" makes everything transparent except the moving parts; "Section" cuts the engine with a plane.',
    '"Run" shows the engine working in slow motion: pistons, valves, chains and belts move in the right phases, and air, exhaust, oil and fuel flows are visible.',
    '"Presentation" gives an automatic walkthrough, "Quiz" checks who remembers the parts.',
  ],
  materials: 'Presentation materials', pdf: 'Specification, PDF', xlsx: 'Specification, Excel', png: 'Snapshot, PNG',
  saved: 'File saved', saveFail: 'Could not save the file', declined: 'Save cancelled',
  engine: 'Engine', unit: 'Assembly', units: ['assembly', 'assemblies'], partsWord: ['part', 'parts'],
  unitParts: 'Parts of this assembly', collapse: 'Reassemble', showAll: 'Fit to view',
  pos: 'Item', qty: 'Qty', role: 'Purpose', howWorks: 'How it works', params: 'Specifications', zoom: 'Zoom in', toUnit: 'Back to assembly',
  runEyebrow: 'Engine running', runTitle: 'Four-stroke cycle',
  runLead: 'Over two crankshaft revolutions every cylinder goes through four strokes: intake, compression, power and exhaust. Cylinders fire every 90° in the order 1‑5‑4‑8‑7‑2‑6‑3, so four of them fire per revolution.',
  crankAngle: 'Crank angle', bankR: 'Right bank', bankL: 'Left bank',
  strokes: ['Power', 'Exhaust', 'Intake', 'Compression'],
  flows: 'Flows', flowAir: 'Air', flowExh: 'Exhaust', flowOil: 'Oil', flowFuel: 'Fuel', showFlows: 'Show flows',
  runNote: 'Slowed down: at 7,500 rpm the crankshaft turns 125 times a second. Air and exhaust flow speed follows the valve opening of each cylinder.',
  tipPart: no => `Item ${no} · click for details`, tipAsm: no => `Assembly ${no} · click to take apart`, tipGo: 'Click to switch to this assembly',
  crumbs: 'Path',
  photoTitle: 'Compare with the photo', photoSide: 'Side by side', photoOver: 'Overlay', photoOpacity: 'Photo opacity', photoClose: 'Close',
  photoNote: 'The camera has moved to the angle of the original photo. "Overlay" puts the photo on top of the model.',
  tourNext: 'Next', tourPrev: 'Back', tourPause: 'Pause', tourPlay: 'Resume', tourEnd: 'Finish',
  quizTitle: 'Find the part', quizRound: (i, n) => `Question ${i} of ${n}`, quizScore: s => `Correct: ${s}`,
  quizAsk: 'Click this part on the model:', quizRight: 'Correct!', quizWrong: name => `That is "${name}". The right part is highlighted.`,
  quizNext: 'Next question', quizSkip: 'Skip', quizEnd: 'Finish', quizDone: 'Quiz complete',
  quizResult: (s, n) => `Correct answers: ${s} of ${n}`, quizAgain: 'Play again',
  quizGrade: (s, n) => s >= n * 0.8 ? 'Excellent: you know this engine well.' : s >= n * 0.5 ? 'Good. Check the part cards you missed.' : 'Worth another walk through the assemblies: the cards explain every part.',
};

export const t = () => lang === 'en' ? EN : RU;

// Сценарий презентации: действия выполняет ui.js, здесь только подписи.
export const TOUR = {
  ru: [
    ['Гоночный V8 5.0', 'Атмосферный восьмицилиндровый двигатель с развалом 60°: 640 л. с. при 7 500 об/мин, сухой картер, карбон и титан.'],
    ['Вид спереди', 'Спереди — литая крышка привода ГРМ и ремённый привод: генератор, водяной насос и зубчатый ремень масляного насоса.'],
    ['Головка блока', 'Каждая головка разбирается на 13 деталей: от прокладки до катушек зажигания. Номера на модели совпадают со списком деталей.'],
    ['Распределительный вал', 'У каждой детали есть карточка: назначение, как она работает, материал и параметры.'],
    ['Привод ГРМ', 'Две цепи вращают четыре распредвала ровно вдвое медленнее коленвала.'],
    ['Кривошипно-шатунный механизм', 'Коленвал с разнесёнными шейками, восемь шатунов и поршней, балансирный вал.'],
    ['Выпуск из титана', 'Четыре первичные трубы каждого ряда сходятся в сборник 4-в-1; цвета побежалости — след нагрева.'],
    ['Сухой картер', 'Многосекционный насос откачивает масло в отдельный бак, поэтому смазка надёжна в затяжных поворотах.'],
    ['Разнесённый вид', 'Все {A} узлов и {P} позиций сразу.'],
    ['Работа двигателя', 'Рентген и замедленный запуск: поршни, клапаны, цепи, вспышки в цилиндрах и потоки воздуха, выхлопа и масла.'],
    ['Разрез', 'Плоскость рассекает двигатель поперёк: видно, как поршни ходят в цилиндрах развала 60°.'],
    ['Модель и фотография', 'Модель собрана по снимку реального двигателя — ракурс совпадает с исходной фотографией.'],
    ['Спасибо', 'Модель можно вращать, разбирать и изучать самостоятельно. Все детали — в разделе «Состав двигателя».'],
  ],
  en: [
    ['Racing V8 5.0', 'A naturally aspirated 60-degree V8: 640 hp at 7,500 rpm, dry-sump lubrication, carbon fibre and titanium.'],
    ['Front view', 'At the front: the cast timing cover and the accessory drive with alternator, water pump and the toothed oil-pump belt.'],
    ['Cylinder head', 'Each head comes apart into 13 parts, from gasket to ignition coils. Numbers on the model match the parts list.'],
    ['Camshaft', 'Every part has a card: purpose, how it works, material and specifications.'],
    ['Camshaft drive', 'Two chains turn the four camshafts at exactly half crankshaft speed.'],
    ['Crank train', 'A split-pin crankshaft, eight rods and pistons, and a balance shaft.'],
    ['Titanium exhaust', 'Four primaries per bank merge into a 4-into-1 collector; the heat tint shows where the titanium runs hottest.'],
    ['Dry sump', 'A multi-stage pump scavenges oil into a separate tank, so lubrication stays reliable in long corners.'],
    ['Exploded view', 'All {A} assemblies and {P} items at once.'],
    ['Engine running', 'X-ray and slow-motion running: pistons, valves, chains, combustion flashes and flows of air, exhaust and oil.'],
    ['Section', 'A plane cuts across the engine: you can see the pistons moving in the 60° vee.'],
    ['Model and photo', 'The model was built from a photo of a real engine; the camera matches the original shot.'],
    ['Thank you', 'Rotate, take apart and explore the model yourself. Every part is listed under Engine contents.'],
  ],
};
export const tourSteps = () => TOUR[lang];
