// KataGo V7 input features (22 spatial planes, 19 global), ported from KataGo's NNInputs::fillRowV7
// for Chinese-style rules: area scoring, simple ko, no suicide, no tax, no encore.
// Uses the Board class from GoEngine. Buffer is always 19x19, smaller boards sit in the top-left corner.
function GoFeatures(E) {
  "use strict";
  const { Board, PASS, EMPTY, BLACK, WHITE } = E;
  const NN = 19, AREA = NN * NN, NSP = 22, NGL = 19;

  // ---------- ladders ----------
  const LADDER_BUDGET = 25000;
  function makeLadderSolver(n) {
    const pool = [];
    let nodes = 0, maxDepth = 0;
    function boardAt(d) { while (pool.length <= d) pool.push(new Board(n)); return pool[d]; }
    function chainLibs(b, p) {
      const h = b.head[p], out = [], st = ++b.stamp, mk = b.mark;
      let s = h;
      do {
        for (const d of b.dirs) { const q = s + d; if (b.color[q] === EMPTY && mk[q] !== st) { mk[q] = st; out.push(q); } }
        s = b.nxt[s];
      } while (s !== h);
      return out;
    }
    // opponent chains next to the defender chain that are in atari: capturing them gains liberties
    function captureMoves(b, p) {
      const h = b.head[p], c = b.color[p], o = 3 - c, out = [];
      const seenHeads = [];
      let s = h;
      do {
        for (const d of b.dirs) {
          const q = s + d;
          if (b.color[q] === o) {
            const oh = b.head[q];
            if (seenHeads.indexOf(oh) < 0) {
              seenHeads.push(oh);
              if (b.libs(oh, 2) === 1 && out.indexOf(b.lib1) < 0) out.push(b.lib1);
            }
          }
        }
        s = b.nxt[s];
      } while (s !== h);
      return out;
    }
    function search(b, p, isDefender, depth) {
      if (++nodes > LADDER_BUDGET) throw "budget";
      if (depth >= maxDepth) return true;
      const libs = b.libs(b.head[p], 3);
      if (!isDefender) { if (libs <= 1) return true; if (libs >= 3) return false; }
      else { if (libs >= 2) return false; if (b.ko !== PASS) return false; }
      const defC = b.color[p], mover = isDefender ? defC : 3 - defC;
      let moves;
      if (isDefender) { moves = captureMoves(b, p); for (const l of chainLibs(b, p)) if (moves.indexOf(l) < 0) moves.push(l); }
      else moves = chainLibs(b, p);
      for (const m of moves) {
        if (!b.isLegal(m, mover)) continue;
        const nb = boardAt(depth + 1); nb.copyFrom(b); nb.toPlay = mover; nb.play(m);
        const r = search(nb, p, !isDefender, depth + 1);
        if (isDefender && !r) return false;
        if (!isDefender && r) return true;
      }
      return isDefender;
    }
    function run(b, p, defenderFirst) {
      const root = boardAt(0); root.copyFrom(b);
      if (defenderFirst) root.ko = PASS;
      try { return search(root, p, defenderFirst, 0); } catch (e) { if (e === "budget") return false; throw e; }
    }
    // returns null if not laddered, else array of working attacker moves (empty for 1-liberty chains)
    return function laddered(b, p, libs) {
      nodes = 0; maxDepth = Math.floor(n * n * 3 / 2);
      if (libs === 1) return run(b, p, true) ? [] : null;
      const c = b.color[p], o = 3 - c, working = [];
      const two = chainLibs(b, p);
      const tmp = new Board(n);
      for (const m of two) {
        if (!b.isLegal(m, o)) continue;
        tmp.copyFrom(b); tmp.toPlay = o; tmp.play(m);
        nodes = 0;
        if (run(tmp, p, true)) working.push(m);
      }
      return working.length ? working : null;
    };
  }

  function iterLadders(b, laddered, f) {
    const solved = new Map();
    for (const p of b.pts) {
      const c = b.color[p];
      if (c !== BLACK && c !== WHITE) continue;
      const libs = b.libs(b.head[p], 3);
      if (libs !== 1 && libs !== 2) continue;
      const h = b.head[p];
      if (solved.has(h)) { if (solved.get(h)) f(p, []); continue; }
      const w = laddered(b, p, libs);
      solved.set(h, w !== null);
      if (w !== null) f(p, w);
    }
  }

  function nnPos(b, p) { const [x, y] = b.xy(p); return y * NN + x; }

  // moves: list of board points / PASS from the empty board, black first. komi from white's view.
  function featurize(n, moves, komi, out, pda) {
    const spatial = out ? out.spatial : new Float32Array(NSP * AREA);
    const glob = out ? out.global : new Float32Array(NGL);
    spatial.fill(0); glob.fill(0);
    // boards after moves.length, -1, -2
    const L = moves.length;
    const boards = [null, null, null];
    const b = new Board(n);
    for (let i = 0; i <= L; i++) {
      const back = L - i;
      if (back <= 2) { const c = new Board(n); c.copyFrom(b); boards[2 - back] = c; }
      if (i < L) b.play(moves[i]);
    }
    const cur = boards[2];
    const pla = cur.toPlay, opp = 3 - pla;
    const set = (pos, ch) => { spatial[ch * AREA + pos] = 1; };

    for (const p of cur.pts) {
      const pos = nnPos(cur, p);
      set(pos, 0);
      const c = cur.color[p];
      if (c === pla) set(pos, 1); else if (c === opp) set(pos, 2);
      if (c === pla || c === opp) {
        const libs = cur.libs(cur.head[p], 4);
        if (libs === 1) set(pos, 3); else if (libs === 2) set(pos, 4); else if (libs === 3) set(pos, 5);
      }
    }
    if (cur.ko !== PASS) set(nnPos(cur, cur.ko), 6);

    // area: stones plus empty regions bordered by a single colour
    let areaScore = 0;
    const seen = new Uint8Array(cur.L);
    for (const p of cur.pts) {
      const c = cur.color[p];
      if (c === BLACK || c === WHITE) { set(nnPos(cur, p), c === pla ? 18 : 19); areaScore += c === pla ? 1 : -1; continue; }
      if (seen[p]) continue;
      const region = [p]; seen[p] = 1; let bb = false, ww = false;
      for (let i = 0; i < region.length; i++) for (const d of cur.dirs) {
        const q = region[i] + d, cq = cur.color[q];
        if (cq === BLACK) bb = true; else if (cq === WHITE) ww = true;
        else if (cq === EMPTY && !seen[q]) { seen[q] = 1; region.push(q); }
      }
      const owner = bb && !ww ? BLACK : ww && !bb ? WHITE : 0;
      if (owner) for (const q of region) { set(nnPos(cur, q), owner === pla ? 18 : 19); areaScore += owner === pla ? 1 : -1; }
    }

    // move history
    const hist = Math.min(5, L);
    for (let k = 0; k < hist; k++) {
      const m = moves[L - 1 - k];
      if (m === PASS) glob[k] = 1; else set(nnPos(cur, m), 9 + k);
    }

    // ladders
    const laddered = makeLadderSolver(n);
    iterLadders(cur, laddered, (p, working) => {
      set(nnPos(cur, p), 14);
      if (cur.color[p] === opp && cur.libs(cur.head[p], 2) > 1) for (const w of working) set(nnPos(cur, w), 17);
    });
    const prev = hist < 1 ? cur : boards[1];
    iterLadders(prev, laddered, p => set(nnPos(prev, p), 15));
    const prev2 = hist < 2 ? prev : boards[0];
    iterLadders(prev2, laddered, p => set(nnPos(prev2, p), 16));

    // globals
    let selfKomi = pla === WHITE ? komi : -komi;
    const bArea = n * n;
    selfKomi = Math.max(-bArea - 20, Math.min(bArea + 20, selfKomi));
    glob[5] = selfKomi / 20;
    glob[14] = L > 0 && moves[L - 1] === PASS ? 1 : 0;
    // playout doubling advantage: >0 plays as if stronger than the opponent (sharper), <0 more cautious
    if (pda) { glob[15] = 1; glob[16] = 0.5 * pda; }
    const even = (n * n) % 2 === 0;
    const komiFloor = even ? Math.floor(selfKomi / 2) * 2 : Math.floor((selfKomi - 1) / 2) * 2 + 1;
    let delta = Math.max(0, Math.min(2, selfKomi - komiFloor));
    glob[18] = delta < 0.5 ? delta : delta < 1.5 ? 1 - delta : delta - 2;
    return { spatial, global: glob, pla, board: cur };
  }

  return { featurize, NN, AREA, NSP, NGL };
}
if (typeof module !== "undefined") module.exports = GoFeatures;
