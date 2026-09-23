// Загрузка реального города из OpenStreetMap: поиск (Nominatim), скачивание (Overpass),
// перевод в метры и компактный формат карты, кэш в IndexedDB.

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
    `way["natural"~"^(wood|scrub)$"]${a};);out geom qt;`;
}

async function fetchOverpass(lat, lon, R, onStatus) {
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

export function parseOSM(json, lat0, lon0, R, name) {
  const kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
  const P = g => [Math.round((g.lon - lon0) * kx * 10) / 10, Math.round((g.lat - lat0) * ky * 10) / 10];
  const b = [], rd = [], w = [], g = [], lim = R * 1.08;
  const flat = ring => { const f = []; for (const q of ring) f.push(q[0], q[1]); return f; };
  function addBuilding(rings, t) {
    const k = kindOf(t);
    let h = parseFloat(t.height);
    if (!(h > 0)) { const lv = parseFloat(t['building:levels']); h = lv > 0 ? lv * 3.1 + 1.5 : DEF_H[k]; }
    h = Math.max(3, Math.min(220, h));
    const addr = t['addr:street'] && t['addr:housenumber'] ? `${t['addr:street']}, ${t['addr:housenumber']}` : '';
    for (const ring of rings) {
      if (ring.length < 3) continue;
      let f = flat(ring), a = ringArea(f);
      if (Math.abs(a) < 12) continue;
      if (a < 0) { const r = []; for (let i = f.length - 2; i >= 0; i -= 2) r.push(f[i], f[i + 1]); f = r; a = -a; }
      const [cx, cy] = centroid(f);
      if (Math.hypot(cx, cy) > lim) continue;
      const o = {p: f, h: Math.round(h * 10) / 10, k};
      if (addr) o.a = addr;
      if (t.name) o.n = t.name;
      if (t['building:colour']) o.c = t['building:colour'];
      b.push(o);
    }
  }
  function addArea(list, rings) {
    for (const ring of rings) { if (ring.length < 3) continue; const f = flat(ring); if (Math.abs(ringArea(f)) > 30) list.push(f); }
  }
  for (const el of json.elements) {
    const t = el.tags || {};
    if (el.type === 'way' && el.geometry && el.geometry.length >= 2) {
      const pts = el.geometry.map(P);
      if (t.building && t.building !== 'no') addBuilding(assembleRings([pts]), t);
      else if (t.highway) {
        if (t.service === 'parking_aisle') continue;
        rd.push({p: flat(pts), k: t.highway, n: t.name || ''});
      }
      else if (t.natural === 'water' || t.waterway === 'riverbank') addArea(w, assembleRings([pts]));
      else addArea(g, assembleRings([pts]));
    } else if (el.type === 'relation' && el.members) {
      const outer = el.members.filter(m => m.type === 'way' && (m.role === 'outer' || m.role === '') && m.geometry).map(m => m.geometry.map(P));
      const rings = assembleRings(outer);
      if (t.building) addBuilding(rings, t);
      else if (t.natural === 'water') addArea(w, rings);
    }
  }
  return {v: 1, name, lat: lat0, lon: lon0, r: R, b, rd, w, g};
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

export const mapKey = (lat, lon, R) => `${lat.toFixed(4)},${lon.toFixed(4)},${R}`;

export async function loadCity({lat, lon, r, name}, onStatus) {
  const key = mapKey(lat, lon, r);
  if (key === DEMO.key) return loadDemo(onStatus);
  onStatus('Ищу карту в кэше…');
  const cached = await cacheGet(key);
  if (cached) return cached;
  const raw = await fetchOverpass(lat, lon, r, onStatus);
  onStatus('Разбираю дома и дороги…');
  const map = parseOSM(raw, lat, lon, r, name);
  if (map.b.length < 20 || map.rd.length < 10) throw new Error('В этом месте почти нет домов и дорог. Выбери точку в городе.');
  await cachePut(key, map);
  return map;
}

export const DEMO = {name: 'Москва, Арбат (демо)', lat: 55.7497, lon: 37.5925, r: 650, file: 'data/demo-arbat.json', key: mapKey(55.7497, 37.5925, 650)};
export async function loadDemo(onStatus) {
  onStatus('Открываю демо-город…');
  const r = await fetch(DEMO.file);
  if (!r.ok) throw new Error('Не удалось открыть демо-город');
  return r.json();
}

export const PRESETS = [
  {name: 'Москва, Арбат', lat: 55.7497, lon: 37.5925},
  {name: 'Санкт-Петербург, Невский', lat: 59.9343, lon: 30.3351},
  {name: 'Казань, центр', lat: 55.7887, lon: 49.1221},
  {name: 'Новосибирск, центр', lat: 55.0302, lon: 82.9204},
  {name: 'Екатеринбург, центр', lat: 56.8380, lon: 60.5973},
  {name: 'Париж, Марэ', lat: 48.8590, lon: 2.3580}
];
