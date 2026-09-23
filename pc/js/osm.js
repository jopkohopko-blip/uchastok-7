// Загрузка реального города из OpenStreetMap: поиск (Nominatim), скачивание (Overpass),
// перевод в метры и компактный формат карты, чистка данных, кэш в IndexedDB.

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

export async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=ru&q=${encodeURIComponent(q)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Поиск адресов сейчас недоступен');
  return (await r.json()).map(x => ({name: x.display_name, lat: +x.lat, lon: +x.lon})).filter((x, i, a) => a.findIndex(y => y.name === x.name) === i);
}

function query(lat, lon, R) {
  const a = `(around:${R},${lat},${lon})`;
  const roads = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
  return `[out:json][timeout:90];(way["building"]${a};relation["building"]["type"="multipolygon"]${a};` +
    `way["highway"~"^(${roads})$"]${a};way["natural"="water"]${a};relation["natural"="water"]${a};way["waterway"="riverbank"]${a};` +
    `way["leisure"~"^(park|garden|pitch|playground)$"]${a};way["landuse"~"^(grass|forest|meadow|recreation_ground|village_green)$"]${a};` +
    `way["natural"~"^(wood|scrub)$"]${a};relation["leisure"="park"]${a};);out geom qt;`;
}

export async function fetchOverpass(lat, lon, R, onStatus) {
  const body = 'data=' + encodeURIComponent(query(lat, lon, R));
  for (const url of MIRRORS) {
    const host = new URL(url).host;
    try {
      onStatus(`Скачиваю дома и улицы (${host})…`);
      const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 70000);
      const r = await fetch(url, {method: 'POST', body, headers: {'Content-Type': 'application/x-www-form-urlencoded'}, signal: ctrl.signal});
      clearTimeout(to);
      if (!r.ok) continue;
      const j = await r.json();
      if (j && Array.isArray(j.elements) && j.elements.length) return j;
    } catch (e) { /* пробуем следующий сервер */ }
  }
  throw new Error('Ни один сервер OpenStreetMap не ответил. Попробуй позже или открой демо-город.');
}

/* ---------- геометрия ---------- */
export function ringArea(p) { // p — плоский массив [x,y,x,y…], площадь со знаком (CCW > 0)
  let s = 0;
  for (let i = 0, n = p.length; i < n; i += 2) { const j = (i + 2) % n; s += p[i] * p[j + 1] - p[j] * p[i + 1]; }
  return s / 2;
}
export function centroid(p) {
  let x = 0, y = 0;
  for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; }
  return [x / (p.length / 2), y / (p.length / 2)];
}
export function inPoly(x, y, p) {
  let ins = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
// точка внутри участка с дырами (дворы у домов, острова у воды)
export const inShape = (x, y, s) => inPoly(x, y, s.p) && !(s.hl && s.hl.some(h => inPoly(x, y, h)));

const same = (a, b) => Math.abs(a[0] - b[0]) < .05 && Math.abs(a[1] - b[1]) < .05;
function assembleRings(lines) { // склеиваем куски контура (у многоугольников-отношений) в замкнутые кольца
  const rings = [], open = [];
  for (const l of lines) { if (l.length >= 4 && same(l[0], l[l.length - 1])) rings.push(l.slice(0, -1)); else if (l.length >= 2) open.push(l.slice()); }
  while (open.length) {
    let cur = open.shift(), changed = true;
    while (changed && !same(cur[0], cur[cur.length - 1])) {
      changed = false;
      for (let i = 0; i < open.length; i++) {
        const o = open[i], a = cur[cur.length - 1];
        if (same(a, o[0])) cur = cur.concat(o.slice(1));
        else if (same(a, o[o.length - 1])) cur = cur.concat(o.slice(0, -1).reverse());
        else if (same(cur[0], o[o.length - 1])) cur = o.concat(cur.slice(1));
        else if (same(cur[0], o[0])) cur = o.slice().reverse().concat(cur.slice(1));
        else continue;
        open.splice(i, 1); changed = true; break;
      }
    }
    if (cur.length >= 4 && same(cur[0], cur[cur.length - 1])) rings.push(cur.slice(0, -1));
  }
  return rings;
}
const flat = ring => { const f = []; for (const q of ring) f.push(q[0], q[1]); return f; };
function orient(f, ccw) { // внешние кольца — против часовой, дыры — по часовой
  if ((ringArea(f) > 0) === ccw) return f;
  const r = []; for (let i = f.length - 2; i >= 0; i -= 2) r.push(f[i], f[i + 1]);
  return r;
}
// к каждому внешнему кольцу — его дыры
function shapes(outers, inners) {
  const out = outers.map(o => ({p: orient(flat(o), true), hl: []}));
  for (const h of inners) {
    const f = orient(flat(h), false);
    if (Math.abs(ringArea(f)) < 4) continue;
    const s = out.find(s => inPoly(f[0], f[1], s.p));
    if (s) s.hl.push(f);
  }
  for (const s of out) if (!s.hl.length) delete s.hl;
  return out;
}

function kindOf(t) {
  const b = t.building;
  if (/^(apartments|house|residential|detached|dormitory|terrace|semidetached_house|bungalow)$/.test(b)) return 'res';
  if (/^(office|commercial|retail|supermarket|kiosk|hotel|shop)$/.test(b) || t.shop || t.office || t.tourism === 'hotel') return 'com';
  if (/^(industrial|warehouse|service|garages|garage|storage_tank|hangar|shed|manufacture)$/.test(b)) return 'ind';
  if (/^(church|cathedral|chapel|mosque|synagogue|temple|monastery)$/.test(b) || t.amenity === 'place_of_worship') return 'rel';
  if (/^(school|kindergarten|university|college|hospital|public|civic|government|train_station|transportation|museum|theatre)$/.test(b) || t.amenity) return 'pub';
  return 'gen';
}
const DEF_H = {res: 16, com: 14, ind: 7, pub: 13, rel: 18, gen: 11};
// навесы, подземные и снесённые здания на карте не рисуем
const skipBuilding = t => t.building === 'no' || t.building === 'roof' || t.building === 'demolished' || t.location === 'underground' || parseFloat(t.layer) < 0;
// дороги в туннелях скрыты под землёй — не рисуем и не ездим по ним
const skipRoad = t => t.service === 'parking_aisle' || t.area === 'yes' || (t.tunnel && t.tunnel !== 'no' && t.tunnel !== 'building_passage');

export function parseOSM(json, lat0, lon0, R, name) {
  const kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
  const P = g => [Math.round((g.lon - lon0) * kx * 10) / 10, Math.round((g.lat - lat0) * ky * 10) / 10];
  const b = [], rd = [], w = [], g = [], lim = R * 1.08;
  function addBuilding(list, t) {
    const k = kindOf(t);
    let h = parseFloat(t.height);
    if (!(h > 0)) { const lv = parseFloat(t['building:levels']); h = lv > 0 ? lv * 3.1 + 1.5 : DEF_H[k]; }
    h = Math.max(3, Math.min(220, h));
    const addr = t['addr:street'] && t['addr:housenumber'] ? `${t['addr:street']}, ${t['addr:housenumber']}` : '';
    for (const s of list) {
      if (s.p.length < 6 || ringArea(s.p) < 12) continue;
      const [cx, cy] = centroid(s.p);
      if (Math.hypot(cx, cy) > lim) continue;
      const o = {p: s.p, h: Math.round(h * 10) / 10, k};
      if (s.hl) o.hl = s.hl;
      if (addr) o.a = addr;
      if (t.name) o.n = t.name;
      if (t['building:colour']) o.c = t['building:colour'];
      if (t.building !== 'yes') o.t = t.building;
      if (t['roof:shape']) o.rs = t['roof:shape'];
      if (t['roof:colour']) o.rc = t['roof:colour'];
      const mat = t['building:material'] || t['building:facade:material'];
      if (mat) o.m = mat;
      const lv = parseFloat(t['building:levels']);
      if (lv > 0) o.lv = lv;
      b.push(o);
    }
  }
  const addArea = (list, sh) => { for (const s of sh) if (s.p.length >= 6 && ringArea(s.p) > 30) list.push(s); };
  for (const el of json.elements) {
    const t = el.tags || {};
    if (el.type === 'way' && el.geometry && el.geometry.length >= 2) {
      const pts = el.geometry.map(P);
      if (t.building) { if (!skipBuilding(t)) addBuilding(shapes(assembleRings([pts]), []), t); }
      else if (t.highway) { if (!skipRoad(t)) rd.push({p: flat(pts), k: t.highway, n: t.name || ''}); }
      else if (t.natural === 'water' || t.waterway === 'riverbank') addArea(w, shapes(assembleRings([pts]), []));
      else addArea(g, shapes(assembleRings([pts]), []));
    } else if (el.type === 'relation' && el.members) {
      const ring = role => assembleRings(el.members.filter(m => m.type === 'way' && m.geometry && (role === 'inner' ? m.role === 'inner' : m.role !== 'inner')).map(m => m.geometry.map(P)));
      const sh = shapes(ring('outer'), ring('inner'));
      if (t.building) { if (!skipBuilding(t)) addBuilding(sh, t); }
      else if (t.natural === 'water') addArea(w, sh);
      else addArea(g, sh);
    }
  }
  return cleanMap({v: 2, name, lat: lat0, lon: lon0, r: R, b, rd, w, g});
}

/* ---------- чистка: дубликаты домов, обрезка по краю района ---------- */
function clipRing(f, R) { // отсекаем кольцо кругом радиуса R (многоугольник из 72 сторон)
  let inside = true;
  for (let i = 0; i < f.length; i += 2) if (Math.hypot(f[i], f[i + 1]) > R) { inside = false; break; }
  if (inside) return f;
  let pts = []; for (let i = 0; i < f.length; i += 2) pts.push([f[i], f[i + 1]]);
  const n = 72;
  for (let k = 0; k < n && pts.length; k++) {
    const a1 = k / n * Math.PI * 2, a2 = (k + 1) / n * Math.PI * 2;
    const ax = Math.cos(a1) * R, ay = Math.sin(a1) * R, bx = Math.cos(a2) * R, by = Math.sin(a2) * R;
    const side = q => (bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    pts = out;
  }
  const r = [];
  for (const [x, y] of pts) {
    const X = Math.round(x * 10) / 10, Y = Math.round(y * 10) / 10;
    if (r.length && r[r.length - 2] === X && r[r.length - 1] === Y) continue;
    r.push(X, Y);
  }
  return r;
}
function cut(x1, y1, x2, y2, R) { // где отрезок пересекает окружность радиуса R
  const dx = x2 - x1, dy = y2 - y1, a = dx * dx + dy * dy, b = 2 * (x1 * dx + y1 * dy), c = x1 * x1 + y1 * y1 - R * R;
  const d = Math.sqrt(Math.max(0, b * b - 4 * a * c));
  let t = (-b + d) / (2 * a);
  if (t < 0 || t > 1) t = (-b - d) / (2 * a);
  t = Math.max(0, Math.min(1, t));
  return [Math.round((x1 + dx * t) * 10) / 10, Math.round((y1 + dy * t) * 10) / 10];
}
export function cleanMap(map) {
  if (map.clean) return map;
  const norm = a => Array.isArray(a) ? {p: a} : a; // старый формат — голые кольца без дыр
  // дубликаты домов (дом и отношение с тем же контуром): крыши рябили бы друг о друга
  const byKey = new Map();
  for (const b of map.b) {
    const [x, y] = centroid(b.p), key = `${Math.round(x / 2)},${Math.round(y / 2)},${Math.round(Math.abs(ringArea(b.p)) / 8)}`;
    const old = byKey.get(key);
    if (!old || (b.hl && !old.hl)) byKey.set(key, b);
  }
  map.b = [...byKey.values()];
  // вода и зелень — только внутри района
  const R = map.r * 1.06;
  const clipShape = s => {
    const p = clipRing(s.p, R);
    if (p.length < 6 || Math.abs(ringArea(p)) < 30) return null;
    const o = {p};
    if (s.hl) { const hl = s.hl.map(h => clipRing(h, R)).filter(h => h.length >= 6); if (hl.length) o.hl = hl; }
    return o;
  };
  map.w = map.w.map(norm).map(clipShape).filter(Boolean);
  map.g = map.g.map(norm).map(clipShape).filter(Boolean);
  // дороги обрезаем по краю района: за ним машинам делать нечего
  const lim = map.r * 1.07, rd = [];
  for (const r of map.rd) {
    const p = r.p;
    let cur = [];
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], y = p[i + 1], ins = Math.hypot(x, y) <= lim;
      if (i > 0) {
        const px = p[i - 2], py = p[i - 1], pins = Math.hypot(px, py) <= lim;
        if (ins !== pins) {
          cur.push(...cut(px, py, x, y, lim));
          if (!ins) { if (cur.length >= 4) rd.push({...r, p: cur}); cur = []; }
        }
      }
      if (ins) cur.push(x, y);
    }
    if (cur.length >= 4) rd.push({...r, p: cur});
  }
  map.rd = rd;
  map.clean = 1;
  return map;
}

/* ---------- кэш карт в IndexedDB (карта бывает несколько мегабайт — в localStorage не влезет) ---------- */
function idb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open('uchastok7pc', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('maps');
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function cacheGet(key) {
  try {
    const db = await idb();
    return await new Promise(res => { const r = db.transaction('maps').objectStore('maps').get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
  } catch (e) { return null; }
}
async function cachePut(key, val) {
  try {
    const db = await idb();
    await new Promise(res => { const tx = db.transaction('maps', 'readwrite'); tx.objectStore('maps').put(val, key); tx.oncomplete = res; tx.onerror = res; });
  } catch (e) { /* без кэша тоже работаем */ }
}

// v3 — карты с дворами, островами и тегами облика домов; старый кэш без них скачается заново
export const mapKey = (lat, lon, R) => `v3|${lat.toFixed(4)},${lon.toFixed(4)},${R}`;

export async function loadCity({lat, lon, r, name}, onStatus) {
  const key = mapKey(lat, lon, r);
  if (key === DEMO.key) return loadDemo(onStatus);
  onStatus('Ищу карту в кэше…');
  const cached = await cacheGet(key);
  if (cached) return cleanMap(cached);
  const raw = await fetchOverpass(lat, lon, r, onStatus);
  onStatus('Разбираю дома и дороги…');
  const map = parseOSM(raw, lat, lon, r, name);
  if (map.b.length < 20 || map.rd.length < 10) throw new Error('В этом месте почти нет домов и дорог. Выбери точку в городе.');
  await cachePut(key, map);
  return map;
}

export const DEMO = {name: 'Москва, Арбат (демо)', lat: 55.7497, lon: 37.5925, r: 650, file: 'data/demo-arbat.json?v=5', key: mapKey(55.7497, 37.5925, 650)};
export async function loadDemo(onStatus) {
  onStatus('Открываю демо-город…');
  const r = await fetch(DEMO.file);
  if (!r.ok) throw new Error('Не удалось открыть демо-город');
  return cleanMap(await r.json());
}

export const PRESETS = [
  {name: 'Москва, Арбат', lat: 55.7497, lon: 37.5925},
  {name: 'Санкт-Петербург, Невский', lat: 59.9343, lon: 30.3351},
  {name: 'Казань, центр', lat: 55.7887, lon: 49.1221},
  {name: 'Новосибирск, центр', lat: 55.0302, lon: 82.9204},
  {name: 'Екатеринбург, центр', lat: 56.8380, lon: 60.5973},
  {name: 'Париж, Марэ', lat: 48.8590, lon: 2.3580}
];
