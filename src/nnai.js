// Neural-net guided MCTS (PUCT with batched leaf evaluation) on top of a KataGo network.
// net.run(batch of {spatial, global}) -> [{policy(362 logits), value(3 logits), score, own}]
function GoNNAI(E, F, net) {
  "use strict";
  const { Board, PASS } = E;
  const AREA = F.AREA;
  const cache = new Map();
  const CACHE_MAX = 30000;

  function softmaxMasked(logits, legal, temp) {
    let mx = -Infinity;
    for (let i = 0; i < legal.length; i++) if (legal[i] && logits[i] > mx) mx = logits[i];
    const p = new Float32Array(legal.length); let s = 0;
    for (let i = 0; i < legal.length; i++) if (legal[i]) { p[i] = Math.exp((logits[i] - mx) / temp); s += p[i]; }
    for (let i = 0; i < p.length; i++) p[i] /= s;
    return p;
  }
  const keyOf = (n, moves, komi, pda) => n + ":" + komi + ":" + (pda || 0) + ":" + moves.join(",");

  // Evaluate several positions at once; values are from the view of the player to move.
  // pdaFor(moves) gives the playout-doubling-advantage input for the player to move in that position
  async function evalMany(n, list, komi, pdaFor) {
    const out = new Array(list.length), todo = [], feats = [];
    list.forEach((moves, i) => {
      const pda = pdaFor ? pdaFor(moves) : 0;
      const hit = cache.get(keyOf(n, moves, komi, pda));
      if (hit) out[i] = hit; else { todo.push(i); feats.push(F.featurize(n, moves, komi, null, pda)); }
    });
    if (todo.length) {
      const res = await net.run(feats);
      todo.forEach((i, k) => {
        const f = feats[k], r = res[k], b = f.board, legal = new Uint8Array(AREA + 1);
        for (const p of b.pts) if (b.isLegal(p, b.toPlay)) { const [x, y] = b.xy(p); legal[y * 19 + x] = 1; }
        legal[AREA] = 1;
        const logits = Float32Array.from(r.policy);
        const v = r.value, m = Math.max(v[0], v[1], v[2]);
        const ew = Math.exp(v[0] - m), el = Math.exp(v[1] - m), en = Math.exp(v[2] - m), es = ew + el + en;
        const ev = {
          policy: softmaxMasked(logits, legal, 1), logits, legal, win: ew / es, loss: el / es,
          scoreMean: r.score[0] * 20, lead: r.score[2] * 20, own: Float32Array.from(r.own), pla: b.toPlay
        };
        if (cache.size > CACHE_MAX) cache.clear();
        cache.set(keyOf(n, list[i], komi, pdaFor ? pdaFor(list[i]) : 0), ev);
        out[i] = ev;
      });
    }
    return out;
  }
  async function evaluate(n, moves, komi, pdaFor) { return (await evalMany(n, [moves], komi, pdaFor))[0]; }

  function Node() { this.N = 0; this.W = 0; this.vl = 0; this.slots = null; this.priors = null; this.kids = null; this.pending = false; }
  function expandFrom(node, ev) {
    const slots = [], pri = [];
    for (let i = 0; i <= AREA; i++) if (ev.legal[i] && ev.policy[i] > 1e-5) { slots.push(i); pri.push(ev.policy[i]); }
    node.slots = Int16Array.from(slots); node.priors = Float32Array.from(pri); node.kids = new Array(slots.length).fill(null);
  }

  const CPUCT = 1.1, FPU = 0.2;
  function selectChild(node) {
    const sq = Math.sqrt(Math.max(1, node.N + node.vl));
    const parentQ = node.N > 0 ? node.W / node.N : 0;
    let visitedP = 0;
    for (let i = 0; i < node.kids.length; i++) { const k = node.kids[i]; if (k && k.N + k.vl > 0) visitedP += node.priors[i]; }
    const fpu = parentQ - FPU * Math.sqrt(visitedP);
    let best = -1, bv = -Infinity;
    for (let i = 0; i < node.kids.length; i++) {
      const k = node.kids[i];
      const n = k ? k.N + k.vl : 0;
      // child W is from the child's player-to-move view, so negate; virtual losses count against the parent
      const q = n > 0 ? (-k.W - k.vl) / n : fpu;
      const v = q + CPUCT * node.priors[i] * sq / (1 + n);
      if (v > bv) { bv = v; best = i; }
    }
    return best;
  }

  function terminalValue(n, moves, komi, sw) {
    const b = new Board(n); for (const m of moves) b.play(m);
    const v = (b.areaScore(komi) > 0 ? 1 : -1) * (1 + sw);
    return b.toPlay === E.BLACK ? v : -v;
  }
  const slotToPoint = (b, slot) => slot === AREA ? PASS : b.pt(slot % 19, (slot / 19) | 0);

  // opts: visits, timeMs, batch, onProgress(info), temperature (weak levels play from the raw policy)
  async function think(n, moves, komi, opts) {
    opts = opts || {};
    const maxVisits = opts.visits || 100, timeMs = opts.timeMs || 1e9, B = opts.batch || 8;
    const t0 = Date.now(), base = new Board(n);
    // style: pda > 0 plays sharper (as if stronger than the opponent), < 0 safer; sw rewards bigger margins
    const pdaVal = opts.pda || 0, sw = opts.scoreWeight || 0;
    const rootParity = moves.length % 2;
    const pdaFor = pdaVal ? (ms => ms.length % 2 === rootParity ? pdaVal : -pdaVal) : null;
    const util = ev => ev.win - ev.loss + sw * (2 / Math.PI) * Math.atan(ev.lead / 15);
    const root = new Node();
    const rootEv = await evaluate(n, moves, komi, pdaFor);
    expandFrom(root, rootEv);
    root.N = 1; root.W = util(rootEv);
    if (opts.temperature) { const s = summary(root, base, rootEv); s.move = sampleByPolicy(n, moves, base, rootEv, opts.temperature, opts.blunder || 0); return s; }
    let lastReport = 0;
    while (root.N - 1 < maxVisits && Date.now() - t0 < timeMs) {
      if (opts.shouldStop && opts.shouldStop()) break;
      const want = Math.min(B, maxVisits - (root.N - 1));
      const leaves = [];
      for (let k = 0; k < want; k++) {
        let node = root; const path = [root]; const ms = moves.slice(); let done = null;
        while (true) {
          const i = selectChild(node);
          ms.push(slotToPoint(base, node.slots[i]));
          let c = node.kids[i]; if (!c) c = node.kids[i] = new Node();
          path.push(c); node = c;
          const L = ms.length;
          if (L >= 2 && ms[L - 1] === PASS && ms[L - 2] === PASS) { done = terminalValue(n, ms, komi, sw); break; }
          if (!node.slots) break;
        }
        if (done === null && node.pending) break; // collided with a leaf already queued
        for (const p of path) p.vl++;
        if (done !== null) { leaves.push({ path, value: done }); continue; }
        node.pending = true;
        leaves.push({ path, ms, node });
      }
      if (!leaves.length) break;
      const need = leaves.filter(l => l.ms);
      if (need.length) {
        const evs = await evalMany(n, need.map(l => l.ms), komi, pdaFor);
        need.forEach((l, i) => { expandFrom(l.node, evs[i]); l.node.pending = false; l.value = util(evs[i]); });
      }
      for (const l of leaves) {
        let v = l.value;
        for (let d = l.path.length - 1; d >= 0; d--) { const p = l.path[d]; p.vl--; p.N++; p.W += v; v = -v; }
      }
      if (opts.onProgress && Date.now() - lastReport > 250) { lastReport = Date.now(); opts.onProgress(summary(root, base, rootEv)); }
    }
    const s = summary(root, base, rootEv);
    s.elapsed = Date.now() - t0;
    if (pdaVal || sw) {
      // style settings bias the search values, so report an unbiased evaluation for display
      const plain = await evaluate(n, moves, komi);
      s.winrate = plain.win / (plain.win + plain.loss); s.lead = plain.lead; s.own = plain.own;
    }
    return s;
  }

  function summary(root, base, rootEv) {
    const list = [];
    for (let i = 0; i < root.kids.length; i++) { const k = root.kids[i]; if (k && k.N > 0) list.push({ slot: root.slots[i], N: k.N, q: -k.W / k.N, prior: root.priors[i] }); }
    list.sort((a, b) => b.N - a.N);
    if (!list.length) { let bi = 0; for (let i = 1; i < root.priors.length; i++) if (root.priors[i] > root.priors[bi]) bi = i; list.push({ slot: root.slots[bi], N: 0, q: rootEv.win - rootEv.loss, prior: root.priors[bi] }); }
    const best = list[0];
    return {
      move: slotToPoint(base, best.slot), winrate: Math.max(0, Math.min(1, (best.q + 1) / 2)), visits: root.N - 1, lead: rootEv.lead,
      top: list.slice(0, 5).map(c => ({ move: slotToPoint(base, c.slot), visits: c.N, winrate: Math.max(0, Math.min(1, (c.q + 1) / 2)), prior: c.prior })),
      own: rootEv.own, pla: rootEv.pla, rootWin: rootEv.win
    };
  }

  // blunder: chance of a careless move anywhere legal (never filling its own eye), like a real beginner
  function sampleByPolicy(n, moves, base, ev, temp, blunder) {
    if (blunder && moves[moves.length - 1] !== PASS && Math.random() < blunder) {
      const b = new Board(n); for (const m of moves) b.play(m);
      const me = b.toPlay, cands = [];
      for (const q of b.pts) {
        if (!b.isLegal(q, me)) continue;
        if (b.dirs.every(d => b.color[q + d] === me || b.color[q + d] === 3)) continue;
        cands.push(q);
      }
      if (cands.length) return cands[(Math.random() * cands.length) | 0];
    }
    const p = softmaxMasked(ev.logits, ev.legal, temp);
    p[AREA] *= 0.05; // weak levels rarely pass on their own
    let s = 0; for (let i = 0; i < p.length; i++) s += p[i];
    let r = Math.random() * s;
    for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return slotToPoint(base, i); }
    return PASS;
  }

  return { evaluate, evalMany, think };
}
if (typeof module !== "undefined") module.exports = GoNNAI;
