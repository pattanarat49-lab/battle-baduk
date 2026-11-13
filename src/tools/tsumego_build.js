// Tsumego answer trees, step 2 of 3 (list -> build -> pack).
// Usage: node tsumego_build.js list.json out.jsonl FROM TO   (run several in parallel over slices of the list)
// For each book problem: infer attacker/defender (the side nearer the edges defends; the other way round is tried when
// the book answer fails), prove every first move with the solver (tsumego_solve.js), and keep the problem when every
// book answer is proven and at most three first moves work. Then build the answer tree: at each of the player's turns
// every proven move, the opponent's most stubborn reply, until the position is settled (dead or alive even if the
// opponent then gets two moves in a row);
// and for every wrong move the opponent's refutation. The main line must be 3, 5 or 7 moves.
// Each proof has a small time budget; a move that isn't settled in time is listed in u (no verdict in the game), and a
// win that takes a ko is not credited either.
const { makeProblem, c2 } = require('./tsumego_solve.js');
const fs = require('fs'), path = require('path');
const [listFile, outFile, from, to] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(listFile)).slice(+from, +to);
const MAXP = 7;
const edge = s => { const [x, y] = c2(s); return Math.min(x, y, 18 - x, 18 - y); };
const mean = ss => ss.reduce((a, s) => a + edge(s), 0) / ss.length;
function cropFor(def, m = 2) {
  const xs = def.map(s => c2(s)[0]), ys = def.map(s => c2(s)[1]);
  let x0 = Math.min(...xs) - m, x1 = Math.max(...xs) + m, y0 = Math.min(...ys) - m, y1 = Math.max(...ys) + m;
  if (x0 <= 2) x0 = 0; if (y0 <= 2) y0 = 0; if (x1 >= 16) x1 = 18; if (y1 >= 16) y1 = 18;
  return { x0, x1, y0, y1 };
}
function work(item) {
  const first = mean(item.AB) > mean(item.AW) ? 'B' : 'W';
  const r1 = work1(item, first);
  if (r1.err !== 'book') return r1;
  const r2 = work1(item, first === 'B' ? 'W' : 'B');
  return r2.tree || !['book', 'nodef', 'empties', 'big'].includes(r2.err) ? Object.assign(r2, { swapped: 1 }) : r1;
}
function work1(item, att) {
  const { AB, AW, to, ans } = item;
  const def = att === 'B' ? AW : AB;
  if (!def.length) return { err: 'nodef' };
  const crop = cropFor(def);
  if ((crop.x1 - crop.x0 + 1) * (crop.y1 - crop.y0 + 1) > 100) return { err: 'big' };
  const pr = makeProblem({ AB, AW, to, att, crop, nodeLimit: 2e7, timeLimit: 1000 });
  if (pr.empties > 32) return { err: 'empties' };
  const playerIsAtt = to === att, PW = playerIsAtt ? 1 : -1; // attacker-value that means the player wins
  // every proof gets its own time budget; anything not proven in time counts as not working for the player
  const T0 = Date.now();
  const val = (ms = 300) => { if (Date.now() - T0 > 45000) throw new Error('slow'); pr.resetLimit(2e7, ms); return pr.solveID(); };
  const nm = m => pr.ptName(m);
  // root
  const win = [], unk = [];
  const bookPts = ans.map(a => pr.ptOf(a));
  for (const m of pr.moves(true)) { if (!pr.play(m)) continue; const v = val(bookPts.includes(m) ? 8000 : 1000); pr.undo(); if (v === PW) win.push(m); else if (v === 0) unk.push(m); }
  const wn = win.map(nm);
  if (unk.length > (win.length + unk.length) * 0 + pr.moves(true).length * .6) return { err: 'unknown', win: wn };
  if (!ans.every(a => wn.includes(a))) return { err: 'book', win: wn };
  if (win.length > 3) return { err: 'loose', win: wn };
  // settled: after the player's move, the opponent gets two moves in a row and still can't change the result
  const setMemo = new Map();
  function settled() {
    if (playerIsAtt && pr.nd === 0) return true;
    const k = keyNow(); if (setMemo.has(k)) return setMemo.get(k);
    let ok = true;
    for (const m1 of pr.moves(false)) { if (!pr.play(m1)) continue; pr.play(-9); const v = val(); pr.undo(); pr.undo(); if (v !== PW) { ok = false; break; } }
    setMemo.set(k, ok); return ok;
  }
  const keyNow = () => pr.key();
  // fewest plies for the player to a settled position (player to move), opponent resists; Infinity past cap
  const dMemo = new Map();
  // a player turn where more than three moves win is no real question: the problem ended with the move before
  const looseMemo = new Map();
  function loose() {
    const k = keyNow(); if (looseMemo.has(k)) return looseMemo.get(k);
    let n = 0;
    for (const m of pr.moves(true)) { if (!pr.play(m)) continue; if (val() === PW) n++; pr.undo(); if (n > 3) break; }
    looseMemo.set(k, n > 3); return n > 3;
  }
  // after the player's move: settled, or every reply leaves a loose turn
  function done() {
    if (settled()) return true;
    for (const r of oppReplies()) { pr.play(r); const l = loose(); pr.undo(); if (!l) return false; }
    return true;
  }
  function dist(cap) {
    if (cap < 1) return Infinity;
    const k = keyNow() + ':' + cap; if (dMemo.has(k)) return dMemo.get(k);
    let best = Infinity;
    for (const m of pr.moves(true)) {
      if (!pr.play(m)) continue;
      if (val() === PW) { const d = done() ? 1 : 1 + oppDist(cap - 1); if (d < best) best = d; }
      pr.undo(); if (best === 1) break;
    }
    dMemo.set(k, best); return best;
  }
  function oppReplies() { const r = []; for (const m of pr.moves(false).concat([-1])) { if (pr.play(m)) { r.push(m); pr.undo(); } } return r; }
  function oppDist(cap) { // opponent to move, max over replies
    if (cap < 2) return Infinity;
    let worst = 0, rep = null;
    for (const r of oppReplies()) { pr.play(r); const d = loose() ? 0 : 1 + dist(cap - 1); pr.undo(); if (d > worst) { worst = d; rep = r; } if (worst === Infinity) break; }
    return worst;
  }
  // tree: player node = { w: {move: 0 (settled) | [reply, node]}, r: {wrong move: reply} }
  let nodesBuilt = 0;
  function playerNode(plies) {
    nodesBuilt++;
    const node = { w: {}, r: {} };
    const ms = pr.moves(true);
    for (const m of ms.concat([-1])) {
      if (!pr.play(m)) continue;
      const v = val(plies === 0 ? 1000 : 400);
      if (v === PW && pr.ko >= 0) { (node.u = node.u || []).push(nm(m)); pr.undo(); continue; } // a win that takes a ko: not credited
      if (v === PW) {
        if (m === -1) { pr.undo(); continue; } // passing never counts
        if (done() || plies + 1 >= MAXP + 2) node.w[nm(m)] = 0;
        else {
          // the stubbornest reply: longest distance, then fewest right answers for the player
          let best = null, bd = -1;
          for (const r of oppReplies()) { pr.play(r); const d = loose() ? -1 : dist(MAXP + 2 - plies - 2); pr.undo(); if (d > bd) { bd = d; best = r; } }
          pr.play(best); const sub = playerNode(plies + 2); pr.undo(); if (sub) node.w[nm(m)] = [nm(best), sub]; else (node.u = node.u || []).push(nm(m));
        }
      } else if (v === 0 && m !== -1) {
        // not settled either way in the time given: the game says so instead of calling it wrong
        (node.u = node.u || []).push(nm(m));
      } else {
        // refutation: an opponent reply that keeps the player losing (prefer contact moves: moves() is sorted that way)
        let ref = null;
        for (const r of pr.moves(true).concat([-1])) { if (!pr.play(r)) continue; const w = val(150); pr.undo(); if (w === -PW) { ref = r; break; } }
        if (ref === null) { const rs = pr.moves(false); for (const r of rs) if (pr.play(r)) { pr.undo(); ref = r; break; } }
        node.r[m === -1 ? 'tt' : nm(m)] = ref === null ? 'tt' : nm(ref);
      }
      pr.undo();
    }
    if (!Object.keys(node.w).length) { if (!plies) throw new Error('ko'); return null; }
    return node;
  }
  const D = dist(MAXP);
  if (D < 3 || D > MAXP) return { err: 'len', D, win: wn };
  const tree = playerNode(0);
  return { att, crop, D, tree, win: wn, unk: unk.length, ms: Date.now() - T0 };
}
const out = fs.openSync(outFile, 'a');
for (const item of list) {
  const t0 = Date.now(); let r;
  try { r = work(item); } catch (e) { r = { err: ['slow', 'ko'].includes(e.message) ? e.message : 'exc ' + e.message }; }
  fs.writeSync(out, JSON.stringify(Object.assign({ id: item.id, ms: Date.now() - t0 }, r)) + '\n');
}
