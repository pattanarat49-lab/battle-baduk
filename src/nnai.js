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
      // a GPU that has stopped working returns zeros or NaN: a real network never gives a flat policy
      for (const r of res) {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < AREA; i++) { const v = r.policy[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
        if (!(hi - lo > 1e-3) || !isFinite(r.value[0] + r.value[1] + r.value[2])) throw new Error("bad network output");
      }
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

  function Node() { this.N = 0; this.W = 0; this.L = 0; this.vl = 0; this.slots = null; this.priors = null; this.kids = null; this.pending = false; }
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
  function terminalLead(n, moves, komi) {
    const b = new Board(n); for (const m of moves) b.play(m);
    const d = b.areaScore(komi); return b.toPlay === E.BLACK ? d : -d;
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
    root.N = 1; root.W = util(rootEv); root.L = rootEv.lead;
    if (opts.temperature) { const s = summary(root, base, rootEv); s.move = sampleByPolicy(n, moves, base, rootEv, opts.temperature, opts.blunder || 0, opts.local || 0, opts.noFloat, opts.keepTerritory); return s; }
    let lastReport = 0;
    while (root.N - 1 < maxVisits && Date.now() - t0 < timeMs) {
      if (opts.shouldStop && opts.shouldStop()) break;
      // let the page draw and take clicks between batches; the WebAssembly and CPU backends never yield on their own
      await new Promise(r => setTimeout(r, 0));
      const want = Math.min(B, maxVisits - (root.N - 1));
      const leaves = [];
      for (let k = 0; k < want; k++) {
        let node = root; const path = [root]; const ms = moves.slice(); let done = null, doneLead = 0;
        while (true) {
          const i = selectChild(node);
          ms.push(slotToPoint(base, node.slots[i]));
          let c = node.kids[i]; if (!c) c = node.kids[i] = new Node();
          path.push(c); node = c;
          const L = ms.length;
          if (L >= 2 && ms[L - 1] === PASS && ms[L - 2] === PASS) { done = terminalValue(n, ms, komi, sw); doneLead = terminalLead(n, ms, komi); break; }
          if (!node.slots) break;
        }
        if (done === null && node.pending) break; // collided with a leaf already queued
        for (const p of path) p.vl++;
        if (done !== null) { leaves.push({ path, value: done, lead: doneLead }); continue; }
        node.pending = true;
        leaves.push({ path, ms, node });
      }
      if (!leaves.length) break;
      const need = leaves.filter(l => l.ms);
      if (need.length) {
        const evs = await evalMany(n, need.map(l => l.ms), komi, pdaFor);
        need.forEach((l, i) => { expandFrom(l.node, evs[i]); l.node.pending = false; l.value = util(evs[i]); l.lead = evs[i].lead; });
      }
      for (const l of leaves) {
        let v = l.value, ld = l.lead;
        for (let d = l.path.length - 1; d >= 0; d--) { const p = l.path[d]; p.vl--; p.N++; p.W += v; p.L += ld; v = -v; ld = -ld; }
      }
      if (opts.onProgress && Date.now() - lastReport > 250) { lastReport = Date.now(); opts.onProgress(summary(root, base, rootEv)); }
      if (opts.earlyStop && root.N > 64 && settledEarly(root, maxVisits, timeMs, t0)) break;
    }
    const s = summary(root, base, rootEv);
    s.elapsed = Date.now() - t0;
    if (opts.local) await preferLocal(n, moves, komi, base, root, rootEv, s, opts.local, opts.localMargin || 0.05, pdaFor);
    await avoidEdge(n, moves, komi, base, root, s, pdaFor);
    if (pdaVal || sw) {
      // style settings bias the search values, so report an unbiased evaluation for display
      const plain = await evaluate(n, moves, komi);
      s.winrate = plain.win / (plain.win + plain.loss); s.lead = plain.lead; s.own = plain.own;
    }
    return s;
  }

  // stop searching once more thinking cannot change the move: the runner-up could not catch up with the visits left,
  // or one move has taken nearly all the visits (a forced answer, an obvious capture)
  function settledEarly(root, maxVisits, timeMs, t0) {
    if (!root.kids) return false;
    let a = 0, b = 0;
    for (const k of root.kids) if (k) { if (k.N > a) { b = a; a = k.N; } else if (k.N > b) b = k.N; }
    const done = root.N - 1, spent = Date.now() - t0;
    const left = Math.min(maxVisits - done, done / Math.max(spent, 1) * (timeMs - spent));
    if (a - b > left) return true;
    return done >= Math.max(150, maxVisits * 0.15) && a >= 0.9 * done;
  }

  // Answer near the opponent's last move when that costs at most `margin` win rate against the best move found;
  // a clearly bigger point elsewhere is still played.
  function nearLast(moves, base, local) {
    const last = moves[moves.length - 1];
    if (!local || last === undefined || last === PASS) return null;
    const [lx, ly] = base.xy(last);
    return i => i < AREA && Math.abs(i % 19 - lx) <= local && Math.abs(((i / 19) | 0) - ly) <= local;
  }
  async function preferLocal(n, moves, komi, base, root, rootEv, s, local, margin, pdaFor) {
    const near = nearLast(moves, base, local);
    if (!near || s.move === PASS) return;
    const [bx, by] = base.xy(s.move);
    if (near(by * 19 + bx)) return;
    let mass = 0, li = -1;
    for (let i = 0; i < root.slots.length; i++) if (near(root.slots[i])) { mass += root.priors[i]; if (li < 0 || root.priors[i] > root.priors[li]) li = i; }
    if (li < 0 || mass < 0.15) return;
    const localMove = slotToPoint(base, root.slots[li]);
    const [eb, el] = await evalMany(n, [moves.concat([s.move]), moves.concat([localMove])], komi, pdaFor);
    const mine = ev => ev.loss / (ev.win + ev.loss); // children are evaluated from the opponent's side
    if (mine(el) >= mine(eb) - margin) { s.move = localMove; s.winrate = mine(el); }
  }

  // first-line points (the edge of the board) are only played when the network sees them as needed
  const EDGE_NEED = 0.15;
  const onEdge = (n, i) => { const x = i % 19, y = (i / 19) | 0; return i < AREA && (x === 0 || y === 0 || x === n - 1 || y === n - 1); };
  async function avoidEdge(n, moves, komi, base, root, s, pdaFor) {
    if (s.move === PASS) return;
    const [bx, by] = base.xy(s.move), bi = by * 19 + bx;
    if (!onEdge(n, bi)) return;
    let k = -1, alt = -1;
    for (let i = 0; i < root.slots.length; i++) {
      if (root.slots[i] === bi) k = i;
      else if (root.slots[i] < AREA && !onEdge(n, root.slots[i]) && (alt < 0 || root.priors[i] > root.priors[alt])) alt = i;
    }
    if (k >= 0 && root.priors[k] >= EDGE_NEED) return;
    if (alt < 0) return;
    const other = slotToPoint(base, root.slots[alt]);
    const [eb, eo] = await evalMany(n, [moves.concat([s.move]), moves.concat([other])], komi, pdaFor);
    const mine = ev => ev.loss / (ev.win + ev.loss);
    if (mine(eo) >= mine(eb) - 0.03) { s.move = other; s.winrate = mine(eo); }
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
      own: rootEv.own, pla: rootEv.pla, rootWin: rootEv.win, searchLead: root.L / root.N
    };
  }

  // blunder: chance of a careless move anywhere legal (never filling its own eye), like a real beginner
  // local: answer within this many lines of the opponent's last move, unless the network sees nothing worth playing there
  // noFloat: never a lone stone out in the centre (5th line or higher with no stone within two lines)
  // keepTerritory: skip points the network already counts as solidly ours, unless it rates the move as needed there
  function sampleByPolicy(n, moves, base, ev, temp, blunder, local, noFloat, keepTerritory) {
    const last = moves[moves.length - 1];
    const edge = i => onEdge(n, i) && ev.policy[i] < EDGE_NEED;
    // a point already settled for either side (inside a closed area) is a wasted move unless the network wants it;
    // when only such points are left the game is closed, so pass and let it be counted
    const settled = i => i < AREA && Math.abs(ev.own[i]) > 0.75 && ev.policy[i] < 0.1;
    if (ev.policy[AREA] >= 0.5) return PASS;
    const ownPoint = keepTerritory ? (i => i < AREA && ev.own[i] > 0.8 && ev.policy[i] < 0.1) : null;
    let floating = null;
    if (noFloat) {
      const fb = new Board(n); for (const m of moves) fb.play(m);
      floating = i => {
        const x = i % 19, y = (i / 19) | 0;
        if (Math.min(x, y, n - 1 - x, n - 1 - y) < 4) return false;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const c = fb.color[fb.pt(x + dx, y + dy)]; if (c === E.BLACK || c === E.WHITE) return false;
        }
        return true;
      };
    }
    let near = nearLast(moves, base, local);
    if (near) {
      let mass = 0;
      for (let i = 0; i < AREA; i++) if (near(i)) mass += ev.policy[i];
      if (mass < 0.15) near = null;
    }
    if (blunder && last !== PASS && Math.random() < blunder) {
      const b = new Board(n); for (const m of moves) b.play(m);
      const me = b.toPlay, cands = [];
      for (const q of b.pts) {
        if (!b.isLegal(q, me)) continue;
        { const [x, y] = b.xy(q), i = y * 19 + x; if (edge(i) || settled(i) || (near && !near(i)) || (floating && floating(i)) || (ownPoint && ownPoint(i))) continue; }
        if (b.dirs.every(d => b.color[q + d] === me || b.color[q + d] === 3)) continue;
        cands.push(q);
      }
      if (cands.length) return cands[(Math.random() * cands.length) | 0];
    }
    const p = softmaxMasked(ev.logits, ev.legal, temp);
    p[AREA] *= 0.05; // weak levels rarely pass on their own
    // drop the moves a rule rules out; returns false (leaving p as it was) when no board move would remain
    const filter = (drop, keepPass) => {
      const keep = Float32Array.from(p); let left = 0;
      for (let i = 0; i < AREA; i++) if (p[i] && drop(i)) p[i] = 0; else left += p[i];
      if (!(left > 0)) { p.set(keep); return false; }
      if (!keepPass) p[AREA] = 0;
      return true;
    };
    if (ownPoint && !filter(ownPoint, true)) return PASS; // only our own territory is left to play: pass instead of filling it
    if (!filter(settled, true)) return PASS;
    filter(edge, true);
    if (floating) filter(floating, true);
    if (near) filter(i => !near(i), false);
    let s = 0; for (let i = 0; i < p.length; i++) s += p[i];
    let r = Math.random() * s;
    for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return slotToPoint(base, i); }
    return PASS;
  }

  // Teaching game: read as usual; when clearly ahead, give back points with the smallest natural concession,
  // a move strong players would consider (never a first-line or own-territory filler), so the game stays close.
  // Hikaru's lead right after its previous move, to tell how many points the player's reply gave away
  let lastTeach = null;
  async function teach(n, moves, komi, opts) {
    const t0 = performance.now();
    let s = await think(n, moves, komi, opts);
    // a hard move: the player's reply cut Hikaru's lead by 2+ points, or Hikaru is behind after the opening. Read it again with the
    // rest of opts.hardMs (a fight Hikaru misjudged at normal speed is what lets a player run away with the game)
    const drop = lastTeach && lastTeach.len === moves.length - 1 ? lastTeach.lead - s.searchLead : 0;
    const more = (opts.hardMs || 0) - (performance.now() - t0);
    if (more > 2000 && (drop >= 2 || (moves.length >= 40 && s.searchLead < -2)) && !(opts.shouldStop && opts.shouldStop()))
      s = await think(n, moves, komi, Object.assign({}, opts, { timeMs: more, earlyStop: false, visits: (opts.visits || 2500) * 3 }));
    // the player passed in the late game: they consider it finished, so end it and count
    if (moves.length > 100 && moves[moves.length - 1] === PASS) { s.move = PASS; return s; }
    if (s.move === PASS || s.top.length < 2) return s;
    // Hikaru keeps a small cushion (3 points) instead of steering to an exact tie, so one good player move doesn't put it behind
    const base = new Board(n), target = opts.target || 3;
    const natural = c => {
      // opening: only standard joseki-level moves; later any move the network gives at least 0.5%
      if (c.move === PASS || c.prior < (moves.length < 40 ? 0.08 : 0.005)) return false;
      const [x, y] = base.xy(c.move), i = y * 19 + x;
      return !(onEdge(n, i) && c.prior < EDGE_NEED) && !(s.own[i] > 0.8 && c.prior < 0.1);
    };
    // candidates: the searched best plus the network's 24 favourite moves that pass the filter above
    const ev0 = await evaluate(n, moves, komi), cands = [s.top[0]];
    const order = []; for (let i = 0; i < AREA; i++) if (ev0.policy[i] >= 0.005) order.push(i);
    order.sort((a, b) => ev0.policy[b] - ev0.policy[a]);
    for (const i of order.slice(0, 24)) { const c = { move: slotToPoint(base, i), prior: ev0.policy[i] }; if (c.move !== cands[0].move && natural(c)) cands.push(c); }
    const evs = await evalMany(n, cands.map(c => moves.concat([c.move])), komi);
    cands.forEach((c, i) => { c.leadAfter = -evs[i].lead; });
    // ahead: steer the score back towards even with natural moves, so the player keeps a real game to be measured in
    let pick = cands[0];
    // close or behind: no concessions, play the move the search read best (a one-look pick for points can walk into a cut
    // or a capture)
    // points given back only as far as the player's last move just lost them: against a player who has not made a
    // mistake Hikaru plays its best (the site owner: never go soft on a player who is playing well)
    const gain = lastTeach && lastTeach.len === moves.length - 1 ? pick.leadAfter - lastTeach.lead : 0;
    const done = () => { lastTeach = { len: moves.length + 1, lead: pick.leadAfter }; s.teach = cands.map(c => ({ move: c.move, lead: c.leadAfter })); return s; };
    if (pick.leadAfter < target + 1) return done();
    const ahead = pick.leadAfter - target;
    if (ahead > 1 && gain >= 1.5) {
      // points go back a little at a time (at most 4 a move), never by giving up stones: a concession that leaves any of
      // Hikaru's groups in atari is not one (the site owner: Hikaru must never let itself be captured)
      const want = Math.min(4, ahead, gain);
      const now = new Board(n); for (const m of moves) now.play(m);
      const me = now.toPlay;
      const safe = c => {
        const b = new Board(n); b.copyFrom(now); b.play(c.move);
        for (const p of b.pts) if (b.color[p] === me && b.libs(b.head[p], 2) < 2) return false;
        return true;
      };
      const ok = cands.filter((c, i) => i > 0 && c.leadAfter >= target && cands[0].leadAfter - c.leadAfter <= want + 0.5 && safe(c))
        .sort((a, b) => a.leadAfter - b.leadAfter);
      if (ok.length) {
        // the network's first look can miss a tactic (a group left in atari, a cut): check the player's likeliest replies
        // to each concession and keep it only if it still costs about what was meant, otherwise try a smaller one
        const worst = async c => {
          const after = moves.concat([c.move]), ev = await evaluate(n, after, komi), rs = [];
          for (let i = 0; i < AREA; i++) if (ev.policy[i] >= 0.02) rs.push(i);
          rs.sort((a, b) => ev.policy[b] - ev.policy[a]);
          if (!rs.length) return c.leadAfter;
          const evs = await evalMany(n, rs.slice(0, 4).map(i => after.concat([slotToPoint(base, i)])), komi);
          return Math.min(...evs.map(e => e.lead));
        };
        const w0 = await worst(cands[0]);
        for (const c of ok.slice(0, 3)) {
          const wc = await worst(c);
          if (w0 - wc <= want + 1.5 && wc >= target - 1) { pick = c; break; }
        }
      }
    }
    s.move = pick.move;
    return done();
  }
  // Grade a move: points it gives up against the best move found by a search of the position before it.
  // Grade a move by the points it gives up: the positions after the best move and after the played move
  // each get the same search, and their averaged score leads are compared.
  async function grade(n, moves, played, komi, opts) { return gradeWith(n, moves, played, komi, await think(n, moves, komi, opts), opts); }
  // same, reusing a search already made of that position (the examiner reads while the player thinks)
  // opts.bestChild: a search already made of the position after the best move
  async function gradeWith(n, moves, played, komi, s, opts) {
    if (played === s.move) return { loss: 0, best: s.move, same: true };
    const cv = { visits: (opts && opts.childVisits) || 100, timeMs: (opts && opts.childMs) || 4000, batch: 8 };
    const a = (opts && opts.bestChild) || await think(n, moves.concat([s.move]), komi, cv), b = await think(n, moves.concat([played]), komi, cv);
    return { loss: Math.max(0, b.searchLead - a.searchLead), best: s.move, same: false }; // both from the opponent's view
  }
  const gradeOf = g => g.same || g.loss <= 0.5 ? "best" : g.loss <= 2 ? "good" : g.loss <= 5 ? "normal" : "bad";

  return { evaluate, evalMany, think, teach, grade, gradeWith, gradeOf, clearCache: () => cache.clear() };
}
if (typeof module !== "undefined") module.exports = GoNNAI;
