function GoEngine(ctx) {
  "use strict";
  const EMPTY = 0, BLACK = 1, WHITE = 2, BORDER = 3, PASS = -1;

  let rs = (Date.now() ^ 0x9e3779b9) | 0 || 12345;
  function rnd() { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return rs >>> 0; }
  function randInt(n) { return rnd() % n; }
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  class Board {
    constructor(n) {
      this.n = n; const w = n + 2; this.w = w; const L = w * w; this.L = L;
      this.color = new Uint8Array(L); this.head = new Int32Array(L); this.nxt = new Int32Array(L);
      this.plib = new Int32Array(L); this.gsize = new Int32Array(L);
      this.empt = new Int32Array(L); this.eidx = new Int32Array(L).fill(-1); this.ne = 0;
      this.mark = new Int32Array(L); this.stamp = 0; this.lib1 = PASS;
      this.ko = PASS; this.toPlay = BLACK; this.passes = 0; this.last = PASS; this.caps = [0, 0, 0]; this.moveNo = 0;
      this.dirs = [1, -1, w, -w]; this.diag = [w + 1, w - 1, 1 - w, -1 - w];
      this.pts = []; this.line = new Uint8Array(L);
      for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (x === 0 || y === 0 || x === w - 1 || y === w - 1) this.color[p] = BORDER;
        else {
          this.pts.push(p); this.eidx[p] = this.ne; this.empt[this.ne++] = p;
          this.line[p] = Math.min(x, y, n + 1 - x, n + 1 - y);
        }
      }
    }
    copyFrom(b) {
      this.color.set(b.color); this.head.set(b.head); this.nxt.set(b.nxt); this.plib.set(b.plib);
      this.gsize.set(b.gsize); this.empt.set(b.empt); this.eidx.set(b.eidx); this.ne = b.ne;
      this.ko = b.ko; this.toPlay = b.toPlay; this.passes = b.passes; this.last = b.last; this.moveNo = b.moveNo;
      this.caps[1] = b.caps[1]; this.caps[2] = b.caps[2];
    }
    pt(x, y) { return (y + 1) * this.w + x + 1; }
    xy(p) { return [(p % this.w) - 1, ((p / this.w) | 0) - 1]; }
    remEmpty(p) { const i = this.eidx[p], q = this.empt[--this.ne]; this.empt[i] = q; this.eidx[q] = i; this.eidx[p] = -1; }
    addEmpty(p) { this.eidx[p] = this.ne; this.empt[this.ne++] = p; }
    // number of p's neighbours belonging to group h
    adj(p, h) {
      let k = 0; const col = this.color, hd = this.head;
      for (let i = 0; i < 4; i++) { const q = p + this.dirs[i]; const c = col[q]; if ((c === BLACK || c === WHITE) && hd[q] === h) k++; }
      return k;
    }
    isLegal(p, c) {
      if (p === PASS) return true;
      const col = this.color;
      if (col[p] !== EMPTY || p === this.ko) return false;
      const d = this.dirs;
      for (let i = 0; i < 4; i++) if (col[p + d[i]] === EMPTY) return true;
      const o = 3 - c;
      for (let i = 0; i < 4; i++) {
        const q = p + d[i], cq = col[q];
        if (cq === c) { const h = this.head[q]; if (this.plib[h] > this.adj(p, h)) return true; }
        else if (cq === o) { const h = this.head[q]; if (this.plib[h] === this.adj(p, h)) return true; }
      }
      return false;
    }
    // would playing p capture something?
    captures(p, c) {
      const o = 3 - c;
      for (let i = 0; i < 4; i++) {
        const q = p + this.dirs[i];
        if (this.color[q] === o) { const h = this.head[q]; if (this.plib[h] === this.adj(p, h)) return true; }
      }
      return false;
    }
    isEye(p, c) {
      const col = this.color;
      for (let i = 0; i < 4; i++) { const cq = col[p + this.dirs[i]]; if (cq !== c && cq !== BORDER) return false; }
      let bad = 0, edge = 0; const o = 3 - c;
      for (let i = 0; i < 4; i++) { const cq = col[p + this.diag[i]]; if (cq === BORDER) edge = 1; else if (cq === o) bad++; }
      return edge ? bad === 0 : bad < 2;
    }
    // distinct liberties of group h, stops counting at max; sets lib1 to one of them
    libs(h, max) {
      const st = ++this.stamp, mk = this.mark, col = this.color, nx = this.nxt, d = this.dirs;
      let n = 0, s = h;
      do {
        for (let i = 0; i < 4; i++) {
          const q = s + d[i];
          if (col[q] === EMPTY && mk[q] !== st) { mk[q] = st; this.lib1 = q; if (++n >= max) return n; }
        }
        s = nx[s];
      } while (s !== h);
      return n;
    }
    // liberties a stone of colour c at p would have (approx, distinct, up to max) - used to avoid self-atari
    libsAfter(p, c, max) {
      const st = ++this.stamp, mk = this.mark, col = this.color, d = this.dirs;
      mk[p] = st; let n = 0;
      for (let i = 0; i < 4; i++) {
        const q = p + d[i], cq = col[q];
        if (cq === EMPTY) { if (mk[q] !== st) { mk[q] = st; if (++n >= max) return n; } }
        else if (cq === c) {
          const h = this.head[q]; let s = h;
          do {
            for (let j = 0; j < 4; j++) { const r = s + d[j]; if (col[r] === EMPTY && mk[r] !== st) { mk[r] = st; if (++n >= max) return n; } }
            s = this.nxt[s];
          } while (s !== h);
        } else if (cq === 3 - c) {
          const h = this.head[q];
          if (this.plib[h] === this.adj(p, h)) return max; // captures: fine
        }
      }
      return n;
    }
    merge(a, b) {
      if (this.gsize[a] < this.gsize[b]) { const t = a; a = b; b = t; }
      const hd = this.head; let s = b;
      do { hd[s] = a; s = this.nxt[s]; } while (s !== b);
      const t = this.nxt[a]; this.nxt[a] = this.nxt[b]; this.nxt[b] = t;
      this.plib[a] += this.plib[b]; this.gsize[a] += this.gsize[b];
      return a;
    }
    removeGroup(h) {
      const col = this.color, nx = this.nxt, d = this.dirs; let s = h;
      do { col[s] = EMPTY; this.addEmpty(s); s = nx[s]; } while (s !== h);
      s = h;
      do {
        for (let i = 0; i < 4; i++) { const q = s + d[i], cq = col[q]; if (cq === BLACK || cq === WHITE) this.plib[this.head[q]]++; }
        s = nx[s];
      } while (s !== h);
    }
    play(p) {
      const c = this.toPlay, o = 3 - c;
      this.last = p; this.toPlay = o; this.moveNo++;
      if (p === PASS) { this.passes++; this.ko = PASS; return; }
      this.passes = 0;
      const col = this.color, hd = this.head, pl = this.plib, d = this.dirs;
      col[p] = c; this.remEmpty(p); hd[p] = p; this.nxt[p] = p; this.gsize[p] = 1;
      let lib = 0;
      for (let i = 0; i < 4; i++) { const q = p + d[i], cq = col[q]; if (cq === EMPTY) lib++; else if (cq !== BORDER) pl[hd[q]]--; }
      pl[p] = lib;
      let g = p;
      for (let i = 0; i < 4; i++) { const q = p + d[i]; if (col[q] === c && hd[q] !== g) g = this.merge(g, hd[q]); }
      let captured = 0, capPos = PASS;
      for (let i = 0; i < 4; i++) {
        const q = p + d[i];
        if (col[q] === o && pl[hd[q]] === 0) { captured += this.gsize[hd[q]]; capPos = q; this.removeGroup(hd[q]); }
      }
      this.caps[c] += captured;
      g = hd[p];
      this.ko = (captured === 1 && this.gsize[g] === 1 && pl[g] === 1) ? capPos : PASS;
    }
    areaScore(komi) {
      let s = 0; const col = this.color, d = this.dirs;
      for (const p of this.pts) {
        const c = col[p];
        if (c === BLACK) s++; else if (c === WHITE) s--;
        else {
          let b = 0, w = 0;
          for (let i = 0; i < 4; i++) { const cq = col[p + d[i]]; if (cq === BLACK) b = 1; else if (cq === WHITE) w = 1; }
          if (b && !w) s++; else if (w && !b) s--;
        }
      }
      return s - komi;
    }
  }

  // ---------- playout policy ----------
  const near = [0, 0, 0, 0, 0];
  function policyMove(b, c) {
    const L = b.last, o = 3 - c, col = b.color;
    if (L !== PASS) {
      near[0] = L; near[1] = L + 1; near[2] = L - 1; near[3] = L + b.w; near[4] = L - b.w;
      // capture the opponent stones next to the last move if in atari
      for (let i = 0; i < 5; i++) {
        const q = near[i];
        if (col[q] === o && b.libs(b.head[q], 2) === 1) { const m = b.lib1; if (b.isLegal(m, c)) return m; }
      }
      // save own group put in atari by the last move
      for (let i = 1; i < 5; i++) {
        const q = near[i];
        if (col[q] === c && b.libs(b.head[q], 2) === 1) {
          const m = b.lib1;
          if (b.isLegal(m, c) && b.libsAfter(m, c, 3) >= 3) return m;
        }
      }
    }
    const ne = b.ne; if (ne === 0) return PASS;
    let i = randInt(ne);
    for (let k = 0; k < ne; k++) {
      const p = b.empt[i];
      if (!b.isEye(p, c) && b.isLegal(p, c)) {
        // reject most self-ataris of more than one stone
        if (b.libsAfter(p, c, 2) >= 2 || (rnd() & 7) === 0) return p;
      }
      if (++i === ne) i = 0;
    }
    // fallback: any non-eye legal move
    for (let k = 0; k < ne; k++) { const p = b.empt[k]; if (!b.isEye(p, c) && b.isLegal(p, c)) return p; }
    return PASS;
  }

  function playout(b, maxMoves, seqM, seqC, sl) {
    let moves = 0;
    while (b.passes < 2 && moves < maxMoves) {
      const c = b.toPlay, p = policyMove(b, c);
      if (p !== PASS) { seqM[sl] = p; seqC[sl] = c; sl++; }
      b.play(p); moves++;
    }
    return sl;
  }

  // ---------- MCTS with RAVE ----------
  function Node(move, toPlay) { this.move = move; this.toPlay = toPlay; this.N = 0; this.W = 0; this.aN = 0; this.aW = 0; this.children = null; }

  function expand(node, b) {
    const c = b.toPlay, ch = [], n = b.n, early = b.moveNo < n * n / 8, L = b.last;
    let lx = -99, ly = -99; if (L !== PASS) [lx, ly] = b.xy(L);
    for (const p of b.pts) {
      if (b.color[p] !== EMPTY || b.isEye(p, c) || !b.isLegal(p, c)) continue;
      const nd = new Node(p, 3 - c);
      let pw = 10; const line = b.line[p];
      if (n >= 9) {
        if (line === 1) pw = early ? 2 : 5;
        else if (line === 2) pw = early ? 6 : 9;
        else if (early && n >= 13 && (line === 3 || line === 4)) pw = 13;
      }
      if (b.captures(p, c)) pw = 17;
      else if (b.libsAfter(p, c, 2) < 2) pw = 3;
      if (L !== PASS) { const [x, y] = b.xy(p); if (Math.abs(x - lx) + Math.abs(y - ly) <= 2) pw += 2; }
      nd.aN = 20; nd.aW = pw;
      ch.push(nd);
    }
    node.children = ch;
  }

  const B2 = 4 * 0.03 * 0.03, CEXP = 0.08;
  function select(node) {
    let best = null, bv = -1; const ln = Math.log(node.N + 1);
    const ch = node.children;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i]; const aq = c.aW / c.aN; let v;
      if (c.N === 0) v = aq + CEXP * Math.sqrt(ln);
      else {
        const beta = c.aN / (c.aN + c.N + c.aN * c.N * B2);
        v = (1 - beta) * (c.W / c.N) + beta * aq + CEXP * Math.sqrt(ln / c.N);
      }
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  }

  function search(root, rb, timeMs, komi, onProgress, maxIt) {
    const n = rb.n, L = rb.L, b = new Board(n);
    const seqM = new Int32Array(n * n * 4 + 16), seqC = new Uint8Array(n * n * 4 + 16);
    const mapS = new Int32Array(L), mapC = new Uint8Array(L);
    const EXP = n <= 9 ? 2 : 4, maxMoves = n * n * 3;
    if (!root.children) expand(root, rb);
    const t0 = now(); let tp = t0, it = 0;
    if (root.children.length === 0) return 0;
    while (true) {
      if ((it & 31) === 0) {
        const t = now();
        if (t - t0 > timeMs || (maxIt && it >= maxIt)) break;
        if (onProgress && t - tp > 250) { tp = t; onProgress(root, it); }
      }
      it++;
      b.copyFrom(rb);
      let node = root; const path = [root]; let sl = 0;
      while (node.children !== null && node.children.length > 0) {
        const ch = select(node); seqM[sl] = ch.move; seqC[sl] = b.toPlay; sl++;
        b.play(ch.move); node = ch; path.push(ch);
      }
      if (node.children === null && b.passes < 2 && node.N >= EXP) {
        expand(node, b);
        if (node.children.length) {
          const ch = select(node); seqM[sl] = ch.move; seqC[sl] = b.toPlay; sl++;
          b.play(ch.move); node = ch; path.push(ch);
        }
      }
      sl = playout(b, maxMoves, seqM, seqC, sl);
      const winner = b.areaScore(komi) > 0 ? BLACK : WHITE;
      let idx = sl;
      for (let d = path.length - 1; d >= 0; d--) {
        const nd = path[d];
        nd.N++; if (winner !== nd.toPlay) nd.W++;
        while (idx > d) { idx--; mapS[seqM[idx]] = it; mapC[seqM[idx]] = seqC[idx]; }
        const chs = nd.children;
        if (chs) {
          const tp2 = nd.toPlay, win = winner === tp2 ? 1 : 0;
          for (let i = 0; i < chs.length; i++) { const c = chs[i], m = c.move; if (mapS[m] === it && mapC[m] === tp2) { c.aN++; c.aW += win; } }
        }
      }
    }
    return it;
  }

  function bestChild(root) {
    let best = null;
    for (const c of root.children) if (!best || c.N > best.N) best = c;
    return best;
  }

  function topMoves(root, k) {
    return root.children.filter(c => c.N > 0).sort((a, b) => b.N - a.N).slice(0, k)
      .map(c => ({ move: c.move, visits: c.N, winrate: c.W / c.N }));
  }

  function ownership(rb, timeMs, komi) {
    const n = rb.n, b = new Board(n), own = new Float32Array(rb.L);
    const seqM = new Int32Array(n * n * 4 + 16), seqC = new Uint8Array(n * n * 4 + 16);
    const t0 = now(); let cnt = 0, sum = 0, bw = 0; const d = rb.dirs;
    while (cnt < 64 || now() - t0 < timeMs) {
      b.copyFrom(rb); playout(b, n * n * 3, seqM, seqC, 0);
      for (const p of b.pts) {
        const c = b.color[p];
        if (c === BLACK) own[p]++; else if (c === WHITE) own[p]--;
        else {
          let bl = 0, wh = 0;
          for (let i = 0; i < 4; i++) { const cq = b.color[p + d[i]]; if (cq === BLACK) bl = 1; else if (cq === WHITE) wh = 1; }
          if (bl && !wh) own[p]++; else if (wh && !bl) own[p]--;
        }
      }
      const s = b.areaScore(komi); sum += s; if (s > 0) bw++;
      cnt++;
      if (cnt >= 20000) break;
    }
    const out = [];
    for (const p of rb.pts) out.push(own[p] / cnt);
    return { own: out, score: sum / cnt, blackWin: bw / cnt, playouts: cnt };
  }

  function handle(msg, post) {
    const { id, kind, n, komi, moves, time } = msg;
    const b = new Board(n);
    for (const m of moves) b.play(m);
    if (kind === "own") { const r = ownership(b, time, komi); post({ id, kind: "own", own: r.own, score: r.score, blackWin: r.blackWin }); return; }
    const c = b.toPlay;
    // Opponent passed: pass too if we are ahead once the game is played out.
    if (b.last === PASS && moves.length > 0) {
      const r = ownership(b, Math.min(time, 1200), komi);
      const myWin = c === BLACK ? r.blackWin : 1 - r.blackWin;
      if (myWin > 0.6) { post({ id, kind: "move", move: PASS, winrate: myWin, playouts: r.playouts, top: [] }); return; }
    }
    const root = new Node(PASS, c);
    const report = (rt, it) => {
      const bc = bestChild(rt);
      post({ id, kind: "progress", playouts: it, winrate: bc && bc.N ? bc.W / bc.N : 0.5, best: bc ? bc.move : PASS });
    };
    const it = search(root, b, time, komi, msg.progress ? report : null);
    if (!root.children.length) { post({ id, kind: "move", move: PASS, winrate: 0.5, playouts: 0, top: [] }); return; }
    const bc = bestChild(root); const wr = bc.W / Math.max(1, bc.N);
    const resign = msg.allowResign && wr < 0.04 && b.moveNo > n * n / 3 && it > 2000;
    post({ id, kind: "move", move: bc.move, winrate: wr, playouts: it, resign, top: topMoves(root, 5) });
  }

  if (ctx) ctx.onmessage = e => handle(e.data, m => ctx.postMessage(m));
  return { Board, handle, search, ownership, Node, bestChild, PASS, EMPTY, BLACK, WHITE, BORDER };
}
if (typeof module !== "undefined") module.exports = GoEngine;
