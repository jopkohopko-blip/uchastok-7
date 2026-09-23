// Граф дорог из OSM: перекрёстки склеиваются по совпадающим координатам,
// маршруты — A* по самой большой связной сети.

const COST = {motorway: .8, trunk: .8, primary: .85, secondary: .9, tertiary: .95, unclassified: 1, residential: 1, living_street: 1.2, service: 1.3, pedestrian: 2};

class Heap {
  constructor() { this.a = []; this.p = []; }
  push(v, pr) {
    const a = this.a, p = this.p; let i = a.length;
    a.push(v); p.push(pr);
    while (i > 0) { const j = (i - 1) >> 1; if (p[j] <= pr) break; a[i] = a[j]; p[i] = p[j]; i = j; }
    a[i] = v; p[i] = pr;
  }
  pop() {
    const a = this.a, p = this.p, top = a[0], lv = a.pop(), lp = p.pop(), n = a.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && p[c + 1] < p[c]) c++;
        if (p[c] >= lp) break;
        a[i] = a[c]; p[i] = p[c]; i = c;
      }
      a[i] = lv; p[i] = lp;
    }
    return top;
  }
  get size() { return this.a.length; }
}

export class RoadGraph {
  constructor(roads) {
    this.x = []; this.y = []; this.adj = [];
    const key = new Map();
    const node = (px, py) => {
      const k = px + ',' + py;
      let i = key.get(k);
      if (i === undefined) { i = this.x.length; key.set(k, i); this.x.push(px); this.y.push(py); this.adj.push([]); }
      return i;
    };
    for (const r of roads) {
      const c = COST[r.k.replace('_link', '')] ?? 1.2;
      let prev = -1;
      for (let i = 0; i < r.p.length; i += 2) {
        const n = node(r.p[i], r.p[i + 1]);
        if (prev >= 0 && prev !== n) {
          const d = Math.hypot(this.x[n] - this.x[prev], this.y[n] - this.y[prev]) * c;
          this.adj[prev].push(n, d); this.adj[n].push(prev, d);
        }
        prev = n;
      }
    }
    // оставляем самую большую связную сеть — иначе машина может «застрять» на оторванном куске двора
    const comp = new Int32Array(this.x.length).fill(-1);
    let best = -1, bestSize = 0;
    for (let s = 0, c = 0; s < this.x.length; s++) {
      if (comp[s] >= 0) continue;
      const st = [s]; comp[s] = c; let size = 0;
      while (st.length) { const u = st.pop(); size++; const A = this.adj[u]; for (let k = 0; k < A.length; k += 2) if (comp[A[k]] < 0) { comp[A[k]] = c; st.push(A[k]); } }
      if (size > bestSize) { bestSize = size; best = c; }
      c++;
    }
    this.main = comp.map(c => c === best ? 1 : 0);
    // сетка для поиска ближайшего узла
    this.cell = 40; this.grid = new Map();
    for (let i = 0; i < this.x.length; i++) {
      if (!this.main[i]) continue;
      const k = this.gk(Math.floor(this.x[i] / this.cell), Math.floor(this.y[i] / this.cell));
      let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(i);
    }
  }
  gk(cx, cy) { return cx * 100003 + cy; }
  nearest(x, y) {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    let best = -1, bd = Infinity;
    for (let r = 0; r < 40; r++) {
      for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) {
        if (r && i > cx - r && i < cx + r && j > cy - r && j < cy + r) continue; // только новое кольцо
        const l = this.grid.get(this.gk(i, j));
        if (l) for (const n of l) { const d = (this.x[n] - x) ** 2 + (this.y[n] - y) ** 2; if (d < bd) { bd = d; best = n; } }
      }
      if (best >= 0 && r * this.cell > Math.sqrt(bd) + this.cell) break;
    }
    return best;
  }
  // A*: возвращает список узлов от a до b (включительно) или null
  path(a, b) {
    if (a < 0 || b < 0) return null;
    if (a === b) return [a];
    const n = this.x.length, g = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const h = i => Math.hypot(this.x[i] - this.x[b], this.y[i] - this.y[b]) * .8;
    const q = new Heap();
    g[a] = 0; q.push(a, h(a));
    while (q.size) {
      const u = q.pop();
      if (u === b) break;
      if (done[u]) continue;
      done[u] = 1;
      const A = this.adj[u];
      for (let k = 0; k < A.length; k += 2) {
        const v = A[k], nd = g[u] + A[k + 1];
        if (nd < g[v]) { g[v] = nd; from[v] = u; q.push(v, nd + h(v)); }
      }
    }
    if (from[b] < 0) return null;
    const p = [b];
    for (let u = b; u !== a; u = from[u]) p.push(from[u]);
    return p.reverse();
  }
  randomNear(x, y, r) { // случайный узел сети в радиусе r — для патрулирования
    for (let t = 0; t < 30; t++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const n = this.nearest(x + Math.cos(a) * d, y + Math.sin(a) * d);
      if (n >= 0) return n;
    }
    return this.nearest(x, y);
  }
}
