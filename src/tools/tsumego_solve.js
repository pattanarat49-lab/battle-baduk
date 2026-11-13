// Life-and-death solver for small framed tsumego positions (allocation-free core).
// The board is the problem area plus a ring: board edge, or "wall" = uncapturable attacker stones; the area is the crop
// points within R steps of a defender stone (or 4 steps along empty points, within 3). Attacker wins once every original defender stone has been captured;
// defender wins on Benson life, or when both sides pass with original stones standing (seki counts as life).
// Ko: the usual rule (no immediate retake) for both sides, and a repeated position is a failure for the player; the
// builder (tsumego_build.js) does not credit a winning move that takes a ko.
"use strict";
const EMPTY = 0, WALL = 3, EDGE = 4;
const c2 = s => [s.charCodeAt(0) - 97, s.charCodeAt(1) - 97];
const nm = (x, y) => String.fromCharCode(97 + x, 97 + y);
const TTBITS = 22, TTSIZE = 1 << TTBITS, TTMASK = TTSIZE - 1;
const TK1 = new Int32Array(TTSIZE), TK2 = new Int32Array(TTSIZE), TV = new Int8Array(TTSIZE), TD = new Int8Array(TTSIZE), TM = new Int16Array(TTSIZE);
let ttGen = 1; const TG = new Int32Array(TTSIZE);

function makeProblem({ AB, AW, to, att, crop, nodeLimit = 2e6, R = 2, timeLimit = 15000 }) {
  let T0 = Date.now();
  ttGen++;
  const { x0, x1, y0, y1 } = crop, Wd = x1 - x0 + 3, Ht = y1 - y0 + 3, N = Wd * Ht;
  const idx = (x, y) => (y - y0 + 1) * Wd + (x - x0 + 1);
  const c = new Int8Array(N), insideA = [];
  const DEF = (att === "B" ? AW : AB).map(c2);
  // the area: within R steps of a defender stone, or within 4 steps of one along empty points (its eye space)
  const occ = new Map(); for (const s of AB) occ.set(s, 1); for (const s of AW) occ.set(s, 2);
  const AC = att === "B" ? 1 : 2, area = new Set(), dist = new Map(), Q = [];
  for (const [x, y] of DEF) { dist.set(x * 32 + y, 0); Q.push([x, y]); }
  for (let k = 0; k < Q.length; k++) { const [x, y] = Q[k], d0 = dist.get(x * 32 + y); if (d0 >= 4) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < x0 || X > x1 || Y < y0 || Y > y1 || dist.has(X * 32 + Y)) continue;
      if (occ.get(nm(X, Y)) === AC) continue; dist.set(X * 32 + Y, d0 + 1); Q.push([X, Y]); } }
  for (const k of dist.keys()) { const X = k >> 5, Y = k & 31; if (DEF.some(([a, b]) => Math.abs(a - X) + Math.abs(b - Y) <= 3)) area.add(k); }
  const near0 = (x, y) => area.has(x * 32 + y) || DEF.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) <= R);
  for (let gy = 0; gy < Ht; gy++) for (let gx = 0; gx < Wd; gx++) {
    const x = gx - 1 + x0, y = gy - 1 + y0, i = gy * Wd + gx;
    if (x < 0 || y < 0 || x > 18 || y > 18) c[i] = EDGE; else if (x < x0 || x > x1 || y < y0 || y > y1 || !near0(x, y)) c[i] = WALL; else insideA.push(i);
  }
  const inside = Int32Array.from(insideA), NI = inside.length;
  const inC = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && near0(x, y);
  for (const s of AB) { const [x, y] = c2(s); if (inC(x, y)) c[idx(x, y)] = 1; }
  for (const s of AW) { const [x, y] = c2(s); if (inC(x, y)) c[idx(x, y)] = 2; }
  const P = to === "B" ? 1 : 2, A = att === "B" ? 1 : 2, D = 3 - A;
  const NB = [1, -1, Wd, -Wd];
  const ptName = i => i < 0 ? "pass" : nm(i % Wd - 1 + x0, Math.floor(i / Wd) - 1 + y0);
  const ptOf = s => { const [x, y] = c2(s); return inC(x, y) ? idx(x, y) : -2; };
  const ORIG = new Int32Array(N).fill(-1); let nd0 = 0;
  for (const i of inside) if (c[i] === D) ORIG[i] = nd0++;
  if (nd0 > 30) throw new Error("too many defender stones");
  let seed = 987654321; const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const Z1 = [null, new Int32Array(N), new Int32Array(N)], Z2 = [null, new Int32Array(N), new Int32Array(N)];
  for (let i = 0; i < N; i++) for (const k of [1, 2]) { Z1[k][i] = rnd(); Z2[k][i] = rnd(); }
  const ZK1 = new Int32Array(N + 1).map(() => rnd()), ZK2 = new Int32Array(N + 1).map(() => rnd());
  const ZO1 = new Int32Array(32).map(() => rnd()), ZO2 = new Int32Array(32).map(() => rnd());
  const ZT1 = rnd(), ZT2 = rnd(), ZP1 = rnd(), ZP2 = rnd();
  let h1 = 0, h2 = 0, og = nd0 >= 31 ? -1 : ((1 << nd0) - 1), nd = nd0, tp = P, passes = 0, ko = -1;
  for (const i of inside) if (c[i] === 1 || c[i] === 2) { h1 ^= Z1[c[i]][i]; h2 ^= Z2[c[i]][i]; }

  const mk = new Int32Array(N), lm = new Int32Array(N); let stamp = 1, lst = 1;
  let chainLibs = 0, chainWall = false;
  const buf = new Int32Array(N);
  function chainAt(i) {
    const col = c[i]; let n = 0; stamp++; lst++; chainLibs = 0; chainWall = false;
    buf[n++] = i; mk[i] = stamp;
    for (let k = 0; k < n; k++) { const p = buf[k];
      for (let d = 0; d < 4; d++) { const q = p + NB[d], v = c[q];
        if (v === EMPTY) { if (lm[q] !== lst) { lm[q] = lst; chainLibs++; } }
        else if (v === WALL) { if (col === A) chainWall = true; }
        else if (v === col && mk[q] !== stamp) { mk[q] = stamp; buf[n++] = q; } } }
    return n;
  }
  // undo stacks
  const MAXU = 4096, uM = new Int32Array(MAXU), uCol = new Int8Array(MAXU), uH1 = new Int32Array(MAXU), uH2 = new Int32Array(MAXU),
    uOg = new Int32Array(MAXU), uNd = new Int32Array(MAXU), uTp = new Int8Array(MAXU), uPs = new Int8Array(MAXU), uKo = new Int32Array(MAXU), uCs = new Int32Array(MAXU);
  const capStk = new Int32Array(1 << 16); let capTop = 0, uTop = 0;
  function play(m) {
    const col = tp, opp = 3 - col;
    if (m < 0) {
      uM[uTop] = m; uCol[uTop] = col; uH1[uTop] = h1; uH2[uTop] = h2; uOg[uTop] = og; uNd[uTop] = nd; uTp[uTop] = tp; uPs[uTop] = passes; uKo[uTop] = ko; uCs[uTop] = capTop; uTop++;
      tp = opp; passes = m === -9 ? 0 : passes + 1; ko = -1; return true;
    }
    if (c[m] !== EMPTY || m === ko) return false;
    const sH1 = h1, sH2 = h2, sOg = og, sNd = nd, cs = capTop;
    c[m] = col; h1 ^= Z1[col][m]; h2 ^= Z2[col][m];
    for (let d = 0; d < 4; d++) { const q = m + NB[d]; if (c[q] !== opp) continue;
      const n = chainAt(q); if (chainWall || chainLibs) continue;
      for (let k = 0; k < n; k++) { const p = buf[k]; c[p] = EMPTY; h1 ^= Z1[opp][p]; h2 ^= Z2[opp][p]; capStk[capTop++] = p;
        if (opp === D && ORIG[p] >= 0 && (og & (1 << ORIG[p]))) { og &= ~(1 << ORIG[p]); nd--; } } }
    const n = chainAt(m), ncap = capTop - cs;
    if (!chainWall && !chainLibs) { c[m] = EMPTY; while (capTop > cs) c[capStk[--capTop]] = opp; h1 = sH1; h2 = sH2; og = sOg; nd = sNd; return false; }
    uM[uTop] = m; uCol[uTop] = col; uH1[uTop] = sH1; uH2[uTop] = sH2; uOg[uTop] = sOg; uNd[uTop] = sNd; uTp[uTop] = tp; uPs[uTop] = passes; uKo[uTop] = ko; uCs[uTop] = cs; uTop++;
    tp = opp; passes = 0;
    ko = ncap === 1 && n === 1 && chainLibs === 1 && !chainWall ? capStk[cs] : -1;
    return true;
  }
  function undo() {
    const u = --uTop, m = uM[u];
    if (m >= 0) { const opp = 3 - uCol[u]; c[m] = EMPTY; while (capTop > uCs[u]) c[capStk[--capTop]] = opp; }
    h1 = uH1[u]; h2 = uH2[u]; og = uOg[u]; nd = uNd[u]; tp = uTp[u]; passes = uPs[u]; ko = uKo[u];
  }
  // Benson for the defender
  const chainId = new Int32Array(N), regId = new Int32Array(N);
  const rNbc = [], rVital = [], rOk = [];
  function benson() {
    chainId.fill(-1); regId.fill(-1);
    let nC = 0;
    for (let t = 0; t < NI; t++) { const i = inside[t]; if (c[i] === D && chainId[i] < 0) { const n = chainAt(i); for (let k = 0; k < n; k++) chainId[buf[k]] = nC; nC++; } }
    if (!nC) return false;
    let nR = 0;
    const pts = [];
    for (let t = 0; t < NI; t++) { const i = inside[t]; if (c[i] === D || regId[i] >= 0) continue;
      pts.length = 0; pts.push(i); regId[i] = nR; let wall = false; let nbc = 0; // bitmask of chains (< 31)
      for (let k = 0; k < pts.length; k++) { const p = pts[k];
        for (let d = 0; d < 4; d++) { const q = p + NB[d], v = c[q];
          if (v === WALL) wall = true; else if (v === EDGE) {} else if (v === D) nbc |= 1 << (chainId[q] & 31);
          else if (regId[q] < 0) { regId[q] = nR; pts.push(q); } } }
      let vital = 0;
      if (!wall && pts.length <= 12) {
        vital = nbc;
        for (const p of pts) if (c[p] === EMPTY) { let adj = 0; for (let d = 0; d < 4; d++) { const q = p + NB[d]; if (c[q] === D) adj |= 1 << (chainId[q] & 31); } vital &= adj; }
      }
      rNbc[nR] = nbc; rVital[nR] = vital; rOk[nR] = !wall && pts.length <= 12; nR++;
    }
    let alive = nC >= 31 ? -1 : (1 << nC) - 1, okR = 0n; // regions alive tracked in array
    const ra = rOk.slice(0, nR);
    for (;;) {
      let ch = false;
      for (let k = 0; k < nC && k < 31; k++) if (alive & (1 << k)) { let v = 0; for (let r = 0; r < nR; r++) if (ra[r] && (rVital[r] & (1 << k))) v++; if (v < 2) { alive &= ~(1 << k); ch = true; } }
      for (let r = 0; r < nR; r++) if (ra[r] && (rNbc[r] & ~alive)) { ra[r] = false; ch = true; }
      if (!ch) break;
    }
    return alive !== 0;
  }
  // candidate moves into mv buffer at offset; returns count
  const near = new Int32Array(N); let nearSt = 1;
  const MV = new Int32Array(64 * 64), SC = new Int32Array(64);
  const hist = new Int32Array(N);
  function genMoves(off, all) {
    nearSt++;
    if (!all) {
      for (let t = 0; t < NI; t++) { const i = inside[t]; if (c[i] !== D) continue;
        for (let d = 0; d < 4; d++) { const q = i + NB[d]; if (c[q] === EMPTY) { near[q] = nearSt; for (let e = 0; e < 4; e++) if (c[q + NB[e]] === EMPTY) near[q + NB[e]] = nearSt; } } }
      stamp++; const seen = stamp; // chains of the attacker short of liberties
      for (let t = 0; t < NI; t++) { const i = inside[t]; if (c[i] !== A || mk[i] === seen) continue;
        const n = chainAt(i); // chainAt bumps stamp; mark this chain's stones with seen
        for (let k = 0; k < n; k++) mk[buf[k]] = seen;
        if (!chainWall && chainLibs <= 2) for (let k = 0; k < n; k++) { const p = buf[k]; for (let d = 0; d < 4; d++) if (c[p + NB[d]] === EMPTY) near[p + NB[d]] = nearSt; } }
    }
    let n = 0;
    for (let t = 0; t < NI; t++) { const i = inside[t];
      if (c[i] !== EMPTY || (!all && near[i] !== nearSt)) continue;
      // own-eye fill (all neighbours own colour, or wall for the attacker, or edge) unless an own neighbour is short of liberties
      let own = true;
      for (let d = 0; d < 4; d++) { const v = c[i + NB[d]]; if (v === EDGE || (v === WALL && tp === A) || v === tp) continue; own = false; break; }
      if (own) { let short = false; for (let d = 0; d < 4; d++) { const q = i + NB[d]; if (c[q] === tp) { chainAt(q); if (!chainWall && chainLibs < 3) { short = true; break; } } } if (!short) continue; }
      let s = hist[i] >> 4; for (let d = 0; d < 4; d++) { const v = c[i + NB[d]]; if (v === 1 || v === 2) s += 8; if (v === D) s += 4; }
      // insertion sort by score
      let j = n++; while (j > 0 && SC[j - 1] < s) { MV[off + j] = MV[off + j - 1]; SC[j] = SC[j - 1]; j--; }
      MV[off + j] = i; SC[j] = s;
    }
    return n;
  }
  let nodes = 0, aborted = false, ply = 0;
  const pathK1 = new Int32Array(512), pathK2 = new Int32Array(512);
  const k1 = () => h1 ^ (tp === 1 ? ZT1 : 0) ^ (passes ? ZP1 : 0) ^ (ko >= 0 ? ZK1[ko] : 0) ^ ogHash1();
  let ogh1 = 0, ogh2 = 0, ogc = -2;
  function ogHash1() { if (og !== ogc) { ogc = og; ogh1 = 0; ogh2 = 0; for (let k = 0; k < nd0 && k < 31; k++) if (og & (1 << k)) { ogh1 ^= ZO1[k]; ogh2 ^= ZO2[k]; } } return ogh1; }
  const k2 = () => { ogHash1(); return h2 ^ (tp === 1 ? ZT2 : 0) ^ (passes ? ZP2 : 0) ^ (ko >= 0 ? ZK2[ko] : 0) ^ ogh2; };
  const REP = P === A ? -1 : 1; // a repeat is a failure for the player
  // value for the attacker: 1 win, -1 loss, 0 unknown
  function solve(depth) {
    if (nd === 0) return 1;
    if (passes >= 2) return -1;
    const a = k1(), b = k2();
    // repetition on the current path (position + side, ignoring passes/ko)
    const pa = h1 ^ (tp === 1 ? ZT1 : 0) ^ ogh1, pb = h2 ^ (tp === 1 ? ZT2 : 0) ^ ogh2;
    for (let i = ply - 2; i >= 0; i -= 2) if (pathK1[i] === pa && pathK2[i] === pb) return REP;
    const slot = (a ^ (b >>> 7)) & TTMASK;
    let ttMove = -3;
    if (TG[slot] === ttGen && TK1[slot] === a && TK2[slot] === b) {
      const v = TV[slot]; if (v !== 0 || TD[slot] >= depth) return v; ttMove = TM[slot];
    } else if (uTop && uCol[uTop - 1] === D && uM[uTop - 1] >= 0 && benson()) { store(slot, a, b, -1, 120, -3); return -1; }
    if (depth <= 0 || aborted) return 0;
    if (++nodes > nodeLimit || ((nodes & 4095) === 0 && Date.now() - T0 > timeLimit)) { aborted = true; return 0; }
    const want = tp === A ? 1 : -1; let best = -want, unk = false, bm = -3;
    const off = (ply & 63) * 64; let n = genMoves(off, false);
    MV[off + n++] = -1;
    if (ttMove >= -1) for (let j = 0; j < n; j++) if (MV[off + j] === ttMove) { MV[off + j] = MV[off]; MV[off] = ttMove; break; }
    pathK1[ply] = pa; pathK2[ply] = pb; ply++;
    for (let j = 0; j < n; j++) {
      const m = MV[off + j];
      if (!play(m)) continue;
      const v = solve(depth - 1); undo();
      if (v === want) { best = want; bm = m; if (m >= 0) hist[m] += depth * depth; break; }
      if (v === 0) unk = true;
    }
    ply--;
    if (best !== want && unk) best = 0;
    store(slot, a, b, best, depth, bm);
    return best;
  }
  function store(slot, a, b, v, d, m) { TG[slot] = ttGen; TK1[slot] = a; TK2[slot] = b; TV[slot] = v; TD[slot] = d; TM[slot] = m; }
  function solveID(maxD = 40) { let v = 0; for (const d of [6, 10, 14, 20, 28, maxD]) { v = solve(d); if (v || aborted) break; } return v; }
  function moves(all) { const n = genMoves(63 * 64, all); return Array.from(MV.subarray(63 * 64, 63 * 64 + n)); }
  return {
    play, undo, solve, solveID, moves, benson, ptName, ptOf, A, D, P, inside: insideA, c,
    get tp() { return tp; }, get ko() { return ko; }, get nd() { return nd; }, get passes() { return passes; },
    stats: () => ({ nodes, aborted }), resetLimit: (n, t) => { nodes = 0; aborted = false; if (n) nodeLimit = n; if (t) { timeLimit = t; T0 = Date.now(); } },
    empties: insideA.filter(i => c[i] === EMPTY).length, crop, Wd, key: () => k1() + ':' + k2(),
  };
}
module.exports = { makeProblem, c2, nm };
