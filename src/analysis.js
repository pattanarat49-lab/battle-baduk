// Analysis board ("วิเคราะห์เกม"): step through a finished game or try moves on a free board; ANALYSIS marks the
// strongest candidate moves (win rate and score lead) and Kan explains in a chat why the standout moves are good.
// Everything is worked out in the browser from the network's outputs (policy, win rate, score lead, ownership) and the
// board itself: no server and no language model, so typed questions are matched by keywords.
const Analysis = (function () {
  const api = {}; // the game sets api.E, api.ai() (the GoNNAI in use or null), api.evalMs(), api.onBack
  const LETTERS = "ABCDEFGHJKLMNOPQRST", KOMI = 7.5;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const CN = [null, "ดำ", "ขาว"];
  const REGION = [["มุมซ้ายบน", "ด้านบน", "มุมขวาบน"], ["ด้านซ้าย", "กลางกระดาน", "ด้านขวา"], ["มุมซ้ายล่าง", "ด้านล่าง", "มุมขวาล่าง"]];
  // the main search: many visits so the second and third choices are read properly too
  // (a slow device, a phone without a usable GPU, gets more time so the reading isn't too shallow)
  const SEARCH = { visits: 2000, timeMs: 7000, batch: 8, top: 12 };
  const searchOpts = () => Object.assign({}, SEARCH, { timeMs: (api.evalMs && api.evalMs() > 60) ? 14000 : SEARCH.timeMs });
  let E, Board, PASS, BLACK, WHITE;
  let ST = null, tok = 0, chain = Promise.resolve();
  // one network job at a time; a job for a position the board has left is dropped when its turn comes
  function queue(fn) { const p = chain.then(fn); chain = p.catch(e => console.warn("analysis", e)); return p; }

  // ---------- board helpers ----------
  const cur = () => ST.line.slice(0, ST.at);
  const keyOf = ms => ST.n + ":" + ms.join(",");
  function boardOf(ms) { const b = new Board(ST.n); for (const m of ms) b.play(m); return b; }
  const oi = (b, p) => { const [x, y] = b.xy(p); return y * 19 + x; };
  function name(p) { if (p === PASS) return "ผ่าน"; const b = ST.b0, [x, y] = b.xy(p); return LETTERS[x] + (ST.n - y); }
  function parsePoint(t) {
    const m = /(?:^|[^a-z])([a-hj-t])\s?(\d{1,2})(?!\d)/i.exec(t); if (!m) return null;
    const x = LETTERS.indexOf(m[1].toUpperCase()), y = ST.n - +m[2];
    if (x < 0 || x >= ST.n || y < 0 || y >= ST.n) return null;
    return ST.b0.pt(x, y);
  }
  function regionOf(x, y) { const n = ST.n, t = v => v < n / 3 ? 0 : v < 2 * n / 3 ? 1 : 2; return REGION[t(y)][t(x)]; }
  const regionAt = p => { const [x, y] = ST.b0.xy(p); return regionOf(x, y); };
  // every chain on the board: head -> { c, stones }
  function chains(b) {
    const m = new Map();
    for (const p of b.pts) { const c = b.color[p]; if (c !== BLACK && c !== WHITE) continue; const h = b.head[p]; if (!m.has(h)) m.set(h, { c, stones: [] }); m.get(h).stones.push(p); }
    return m;
  }
  function centre(stones) { let sx = 0, sy = 0; for (const p of stones) { const [x, y] = ST.b0.xy(p); sx += x; sy += y; } return regionOf(Math.round(sx / stones.length), Math.round(sy / stones.length)); }
  const avgOwn = (b, own, stones, sign) => stones.reduce((s, p) => s + sign * own[oi(b, p)], 0) / stones.length;
  const pct = w => (Math.round(w * 1000) / 10).toFixed(1);
  const pts = v => (Math.round(Math.abs(v) * 10) / 10).toFixed(1);
  const leadText = (c, lead) => Math.abs(lead) < 0.5 ? "สูสีกันมาก" : `${CN[c]}${lead > 0 ? "นำ" : "ตาม"} ~${pts(lead)} แต้ม`;
  function gradeOf(loss) {
    if (loss <= 0.5) return { cls: "best", t: "ยอดเยี่ยม เทียบเท่าตาที่ AI เลือก" };
    if (loss <= 2) return { cls: "good", t: `ดี เสียไปนิดเดียว (~${pts(loss)} แต้ม)` };
    if (loss <= 5) return { cls: "normal", t: `พอใช้ เสียไป ~${pts(loss)} แต้ม` };
    return { cls: "bad", t: `พลาด เสียไป ~${pts(loss)} แต้ม` };
  }

  // ---------- why a move is good ----------
  // moves: the position; m: the move by the player to move. evB: network view of the position (player to move = mover),
  // evA: after m (player to move = opponent), evP / evPm: after a pass, and after the opponent then takes m themselves.
  // Returns reasons strongest first: { w, t, neg }.
  function reasons(moves, m, evB, evA, evP, evPm) {
    const out = [], add = (w, t, neg) => out.push({ w, t, neg: !!neg });
    if (m === PASS) { add(1, "ไม่มีจุดไหนที่ให้แต้มเพิ่มแล้ว ผ่านได้เลย"); return out; }
    const B = boardOf(moves), c = B.toPlay, o = 3 - c, n = ST.n;
    if (!B.isLegal(m, c)) return [{ w: 0, t: "จุดนี้วางไม่ได้", neg: true }];
    const A = new Board(n); A.copyFrom(B); A.play(m);
    const cn = CN[c], on = CN[o];
    const nb = col => { const hs = new Set(); for (const d of B.dirs) { const q = m + d; if (B.color[q] === col) hs.add(B.head[q]); } return [...hs]; };
    const myB = nb(c), opB = nb(o);
    // tactics
    const capt = A.caps[c] - B.caps[c];
    if (capt > 0) add(10 + capt, `กินหมาก${on} ${capt} เม็ด${A.ko !== PASS ? " (เป็นการกินโค อีกฝ่ายกินคืนทันทีไม่ได้)" : ""}`);
    const hm = A.head[m], myLibs = A.libs(hm, 4);
    const saved = myB.filter(h => B.libs(h, 2) === 1).reduce((s, h) => s + B.gsize[h], 0);
    if (saved && myLibs >= 2) add(9 + saved, `พาหมาก${cn} ${saved} เม็ดที่โดนขู่กิน (อะตาริ) หนีออกมา${myLibs === 2 ? " แต่ยังเหลือลมหายใจแค่ 2 ต้องระวังต่อ" : ""}`);
    else if (myB.some(h => B.libs(h, 3) === 2) && myLibs >= 3) add(4, `เพิ่มลมหายใจให้กลุ่ม${cn}ที่เหลือลมหายใจแค่ 2`);
    const opA = new Set(); for (const d of A.dirs) { const q = m + d; if (A.color[q] === o) opA.add(A.head[q]); }
    for (const h of opA) {
      const l = A.libs(h, 3), s = A.gsize[h];
      if (l === 1) add(6 + s, `ขู่กิน (อะตาริ) หมาก${on} ${s} เม็ด ${on}ต้องรีบหนีหรือยอมเสีย`);
      else if (l === 2 && s >= 3 && B.libs(B.head[h], 3) >= 3) add(4, `บีบกลุ่ม${on} ${s} เม็ดให้เหลือลมหายใจแค่ 2`);
    }
    if (myB.length >= 2) add(5, `เชื่อมหมาก${cn} ${myB.length} กลุ่มเข้าเป็นกลุ่มเดียว ไม่ให้${on}ตัดขาด`);
    if (opB.length >= 2) add(5, `ตัดหมาก${on}ให้แยกเป็น ${opB.length} กลุ่ม ต้องดูแลหลายทาง`);
    if (myLibs === 1 && !capt) add(8, `หมากที่ลงเหลือลมหายใจเดียว ${on}กินได้ทันที`, true);
    // groups: ownership of their stones before and after, from the mover's side (-1 = the opponent's, +1 = ours)
    const before = evB.own, after = evA.own; // evA is from the opponent's side, so its signs flip
    for (const [h, g] of chains(A)) {
      if (g.c !== c || g.stones.length < 2) continue;
      const old = g.stones.filter(p => p !== m && B.color[p] === c);
      if (!old.length) continue;
      const ob = avgOwn(B, before, old, 1), oa = avgOwn(A, after, g.stones, -1), s = g.stones.length;
      if (ob < -0.4 && oa > 0.3) add(9 + s / 2, `ช่วยกลุ่ม${cn} ${s} เม็ดที่${centre(g.stones)}ที่เกือบตายให้รอด`);
      else if (ob < 0.15 && oa > 0.55) add(6 + s / 3, `ทำให้กลุ่ม${cn} ${s} เม็ดที่${centre(g.stones)}ที่ยังไม่แข็งแรง ปลอดภัยขึ้นมาก`);
      else if (ob > 0.3 && oa < -0.3) add(7 + s / 2, `กลุ่ม${cn} ${s} เม็ดที่${centre(g.stones)}จะตกอยู่ในอันตราย`, true);
      else if (oa - ob >= 0.35) add(4 + s / 4, `ทำให้กลุ่ม${cn} ${s} เม็ดที่${centre(g.stones)}แข็งแรงขึ้น`);
    }
    for (const [h, g] of chains(B)) {
      if (g.c !== o) continue;
      const left = g.stones.filter(p => A.color[p] === o); if (!left.length) continue; // captured: said above
      const lb = avgOwn(B, before, left, -1), la = avgOwn(A, after, left, 1), s = left.length; // the opponent's view of its own stones
      if (lb > 0.2 && la < -0.45) add(9 + s / 2, `ทำให้กลุ่ม${on} ${s} เม็ดที่${centre(left)}แทบไม่มีทางรอด`);
      else if (lb > 0.5 && la < 0.15 && s >= 2) add(6 + s / 3, `โจมตีกลุ่ม${on} ${s} เม็ดที่${centre(left)}ให้อ่อนแอ ต้องเหนื่อยหาทางรอด`);
      else if (lb - la >= 0.35 && s >= 2) add(4 + s / 4, `กดดันกลุ่ม${on} ${s} เม็ดที่${centre(left)}ให้อ่อนลง`);
    }
    // what happens if we don't: the opponent takes this point instead (evPm is from our side again)
    if (evPm) {
      const P = new Board(n); P.copyFrom(B); P.play(PASS); P.play(m);
      const lost = P.caps[o] - B.caps[o];
      if (lost > 0) add(8 + lost, `ถ้าปล่อยให้${on}ได้ลงตรงนี้ หมาก${cn} ${lost} เม็ดจะโดนกิน`);
      for (const [h, g] of chains(B)) {
        const left = g.stones.filter(p => P.color[p] === g.c); if (left.length < 2) continue;
        const sg = g.c === c ? 1 : -1, lb = avgOwn(B, before, left, sg), lp = avgOwn(P, evPm.own, left, sg), s = left.length;
        if (g.c === c && lb > -0.1 && lp < -0.45) add(8 + s / 2, `ถ้าปล่อยให้${on}ได้ลงตรงนี้ กลุ่ม${cn} ${s} เม็ดที่${centre(left)}จะเสี่ยงตาย`);
        else if (g.c === o && lb < 0.1 && lp > 0.45) add(6 + s / 3, `ถ้าปล่อยให้${on}ได้ลงตรงนี้ กลุ่ม${on} ${s} เม็ดที่${centre(left)}ที่กำลังอ่อนแอจะรอดไปได้`);
      }
    }
    // territory: empty points that turn ours (build) or stop being theirs (reduce), per region
    const build = {}, reduce = {};
    for (const p of A.pts) {
      if (A.color[p] !== 0 || p === m) continue;
      const i = oi(A, p), ob = before[i], oa = -after[i], d = oa - ob;
      if (d <= 0.1) continue;
      const r = regionAt(p);
      if (ob < -0.3) reduce[r] = (reduce[r] || 0) + d; else if (oa > 0.3) build[r] = (build[r] || 0) + d;
    }
    const top = o2 => Object.entries(o2).sort((a, b) => b[1] - a[1])[0];
    const tb = top(build), tr = top(reduce);
    if (tb && tb[1] >= 2) add(3 + Math.min(4, tb[1] / 3), `สร้างพื้นที่${cn}ที่${tb[0]}เพิ่มราว ${Math.round(tb[1])} แต้ม`);
    if (tr && tr[1] >= 2) add(3 + Math.min(4, tr[1] / 3), `ลดพื้นที่${on}ที่${tr[0]}ไปราว ${Math.round(tr[1])} แต้ม`);
    // the opening: corners first, then the sides
    const [x, y] = A.xy(m), dx = Math.min(x, n - 1 - x), dy = Math.min(y, n - 1 - y), z = n >= 19 ? 6 : n >= 13 ? 5 : 4;
    let stones = 0; for (const p of B.pts) if (B.color[p] === BLACK || B.color[p] === WHITE) stones++;
    if (stones < n * n * 0.12) {
      if (dx < z && dy < z) {
        let mine = 0, theirs = 0;
        for (const p of B.pts) { const [px, py] = B.xy(p); if ((x < n / 2 ? px < z : px >= n - z) && (y < n / 2 ? py < z : py >= n - z)) { if (B.color[p] === c) mine++; else if (B.color[p] === o) theirs++; } }
        const where = regionOf(x, y);
        if (!mine && !theirs) add(6, `จับจอง${where}ที่ยังว่าง มุมล้อมพื้นที่ได้ง่ายที่สุดเพราะมีขอบกระดานช่วยกั้นสองด้าน`);
        else if (!mine && theirs && dx === 2 && dy === 2) add(6, `บุก 3-3 เข้าไปแย่งพื้นที่${where}ของ${on}`);
        else if (!mine && theirs === 1) add(5, `ประชิดมุม (คาคาริ) ไม่ปล่อยให้${on}ยึด${where}ไว้ง่ายๆ`);
        else if (mine && !theirs) add(5, `ปิดมุม (ชิมาริ) ทำให้${where}เป็นของ${cn}แน่นขึ้น`);
      } else if (Math.min(dx, dy) >= 2 && Math.min(dx, dy) <= 3) {
        let near = false; for (const p of B.pts) { if (B.color[p] !== BLACK && B.color[p] !== WHITE) continue; const [px, py] = B.xy(p); if (Math.max(Math.abs(px - x), Math.abs(py - y)) <= 2) near = true; }
        if (!near) add(4, `จุดใหญ่ที่${regionOf(x, y)} ขยายตามขอบที่ยังว่างอยู่`);
      }
    }
    // the last move: answer it, or play elsewhere because something else is bigger
    const last = moves[moves.length - 1];
    if (last !== undefined && last !== PASS) {
      const [lx, ly] = B.xy(last), dist = Math.max(Math.abs(lx - x), Math.abs(ly - y));
      if (dist <= 2) add(2.5, `ตอบโต้หมาก${on}ที่เพิ่งลง ${name(last)}`);
      else if (dist >= 6 && moves.length > 12) add(3, `ยังไม่ต้องตอบ ${name(last)} ตอนนี้มีจุดที่ใหญ่กว่า (เทนูกิ)`);
    }
    // a point both sides want. swing: our lead if we take the point against our lead if the opponent takes it; any move is
    // worth about two tempos that way (a lot in the opening, little in the endgame), so only the part above that is "big"
    if (evP && evPm) {
      const i = oi(B, m), want = evP.policy[i];
      let topI = 0; for (let k = 1; k < 361; k++) if (evP.policy[k] > evP.policy[topI]) topI = k;
      const swing = -evA.lead - evPm.lead, tempo = Math.max(0, evB.lead + evP.lead), extra = swing - 2 * tempo;
      if (want >= 0.2 || topI === i) add(5.5, `ถ้า${cn}ไม่เล่นตรงนี้ ${on}ก็อยากเล่นจุดนี้เหมือนกัน (จุดสำคัญของทั้งสองฝ่าย)${extra >= 3 ? ` ได้-เสียต่างกันราว ${Math.round(swing)} แต้ม` : ""}`);
      else if (extra >= 4) add(4 + Math.min(4, extra / 4), `ตานี้รีบกว่าตาทั่วไป ถ้าปล่อยให้${on}ได้เล่นตรงนี้แทน จะต่างกันราว ${Math.round(swing)} แต้ม`);
    }
    out.sort((a, b) => b.w - a.w);
    if (!out.some(r => !r.neg)) out.push({ w: 1, t: "ไม่ได้กินหรือตัดอะไรชัดๆ แต่ AI อ่านแล้วว่าทำให้รูปหมากแข็งแรงและคุ้มที่สุด", fb: true });
    return out;
  }
  // the network's evaluations a reasons() call needs, for several moves of one position at once
  async function evalsFor(AI, moves, list) {
    const n = ST.n, B = boardOf(moves);
    const [evB, evP, ...evAs] = await AI.evalMany(n, [moves, moves.concat([PASS]), ...list.map(m => moves.concat([m]))], KOMI);
    const okAfterPass = list.map(m => { if (m === PASS) return false; const b = new Board(n); b.copyFrom(B); b.play(PASS); return b.isLegal(m, b.toPlay); });
    const pm = list.filter((m, i) => okAfterPass[i]);
    const evPms = pm.length ? await AI.evalMany(n, pm.map(m => moves.concat([PASS, m])), KOMI) : [];
    let k = 0;
    return list.map((m, i) => ({ evB, evA: evAs[i], evP, evPm: okAfterPass[i] ? evPms[k++] : null }));
  }
  // the likeliest continuation after a move, the network's first choice at each turn
  async function followUp(AI, moves, len) {
    const seq = [], ms = moves.slice();
    for (let k = 0; k < len; k++) {
      const ev = await AI.evaluate(ST.n, ms, KOMI);
      let bi = 0; for (let i = 1; i < 361; i++) if (ev.policy[i] > ev.policy[bi]) bi = i;
      if (ev.policy[361] > ev.policy[bi]) break;
      const p = ST.b0.pt(bi % 19, (bi / 19) | 0); seq.push(p); ms.push(p);
    }
    return seq;
  }

  // ---------- chat ----------
  function bubble(html, who) {
    const el = document.createElement("div");
    el.className = "an-msg " + (who === "me" ? "me" : "kan");
    el.innerHTML = who === "me" ? `<div class="an-b">${html}</div>`
      : `<img src="chars/kan_face.jpg" alt="" width="160" height="160"><div><div class="an-who">KAN · กัน</div><div class="an-b">${html}</div></div>`;
    $("anChat").appendChild(el); $("anChat").scrollTop = $("anChat").scrollHeight;
    return el;
  }
  const say = html => bubble(html, "kan");
  function setChips(list) {
    $("anChips").innerHTML = list.map(([t, act]) => `<button class="an-chip" data-act="${esc(act)}">${esc(t)}</button>`).join("");
  }
  function chipsFor() {
    const r = ST.res && ST.res.key === keyOf(cur()) ? ST.res : null, list = [];
    if (!r) list.push(["▶ วิเคราะห์ตานี้", "go"]);
    else {
      list.push([`ทำไมต้อง ${name(r.s.top[0].move)}?`, "why"]);
      if (r.cands.length > 1) list.push([`แล้ว ${name(r.cands[1].move)} ล่ะ?`, "second"]);
      list.push(["ดูลำดับต่อ", "pv"]);
    }
    const g = gameMove(); if (g !== null) list.push([`ตาที่เดินจริง (${name(g)}) เป็นไง?`, "played"]);
    list.push(["ใครได้เปรียบ?", "status"]);
    if (ST.game && ST.game.moves.length > 10) list.push(["จุดพลาดในเกมนี้", "mistakes"]);
    if (ST.game && !onGameLine()) list.push(["↩ กลับเส้นเกมจริง", "back"]);
    setChips(list);
  }
  // the move the real game played from the shown position, while the board still follows the game
  function gameMove() { if (!ST.game || !onGameLine()) return null; const m = ST.game.moves[ST.at]; return m === undefined ? null : m; }
  function onGameLine() { const g = ST.game.moves; for (let i = 0; i < ST.at; i++) if (ST.line[i] !== g[i]) return false; return true; }

  // ---------- analysis ----------
  async function analyze(explain) {
    const AI = api.ai(); if (!AI) { say("รอสมอง AI โหลดเสร็จก่อนนะครับ"); return; }
    const moves = cur(), key = keyOf(moves), my = tok;
    if (ST.res && ST.res.key === key) { if (explain) await explainBest(); return; }
    ST.running = true; ST.live = null; render();
    const s = await queue(() => my !== tok ? null : AI.think(ST.n, moves, KOMI, Object.assign(searchOpts(), {
      shouldStop: () => my !== tok, onProgress: p => { if (my === tok) { ST.live = p; drawBoard(); renderInfo(); } } })));
    if (my !== tok || !s) return;
    ST.running = false; ST.live = null;
    // the candidates worth showing: a real share of the reading, or close to the best
    const maxN = s.top[0].visits;
    const cands = s.top.filter((c, i) => i < 3 || c.visits >= Math.max(3, maxN * 0.04)).slice(0, 10);
    ST.res = { key, s, cands, at: ST.at }; ST.win = s.winrate; ST.lead = s.searchLead; ST.pla = s.pla;
    render();
    if (explain) await explainBest();
  }
  // the reply for the shown position: the best move, the other standouts, and how the real game's move compares
  async function explainBest() {
    const AI = api.ai(), r = ST.res, moves = cur(), my = tok;
    if (!AI || !r || r.key !== keyOf(moves)) return;
    const c = ST.b.toPlay, s = r.s, best = r.cands[0], list = r.cands.slice(0, 4).map(x => x.move);
    const evs = await queue(() => my !== tok ? null : evalsFor(AI, moves, list));
    if (!evs || my !== tok) return;
    const why = list.map((m, i) => reasons(moves, m, evs[i].evB, evs[i].evA, evs[i].evP, evs[i].evPm));
    r.why = why;
    const pos = why[0].filter(x => !x.neg).slice(0, 3);
    let h = `<b>ตาที่ ${ST.at + 1} · ${CN[c]}เดิน</b> ${CN[c]}โอกาสชนะ ${pct(s.winrate)}% (${leadText(c, s.searchLead)})<br>`;
    h += `<span class="an-dim">อ่านไป ${s.visits.toLocaleString()} รูปแบบ ตัวเลือกที่น่าสนใจ ${r.cands.length} จุด วงบนกระดาน (ตัวเลขบน = % ชนะ, ล่าง = แต้มนำ)</span>`;
    if (best.move === PASS) { say(h + `<p>★ ตอนนี้แนะนำให้<b>ผ่าน</b> ไม่มีจุดไหนได้แต้มเพิ่มแล้ว</p>`); chipsFor(); return; }
    h += `<p><span class="an-tag best">★ ตาแนะนำ ${name(best.move)}</span> ชนะ ${pct(best.winrate)}% · ${pos.map(x => esc(x.t)).join(" · ")}</p>`;
    // other standouts: close to the best, or the move that looks natural but reads worse
    const others = [];
    for (let i = 1; i < list.length && others.length < 2; i++) {
      const cd = r.cands[i], loss = best.lead - cd.lead, w = why[i].filter(x => !x.neg);
      if (cd.move === PASS) continue;
      // a reason the best move's summary didn't already give, or say it is the same idea
      const own = w.find(x => !pos.some(y => y.t === x.t) && !x.fb);
      if (loss <= 1.5) others.push(`<p><span class="an-tag near">◆ ${name(cd.move)}</span> ก็ดีใกล้เคียง (${loss < 0.1 ? "พอๆ กัน" : `ด้อยกว่าแค่ ${pts(loss)} แต้ม`}) · ${own ? esc(own.t) : `แนวคิดเดียวกับ ${name(best.move)}`}</p>`);
      else if (i === 1 || cd.prior > best.prior) others.push(`<p><span class="an-tag far">○ ${name(cd.move)}</span> ${cd.prior > best.prior ? "ดูน่าเดินกว่าเมื่อมองแวบแรก" : "เป็นตัวเลือกรองลงมา"}: ${esc(w[0].t)} แต่อ่านลึกแล้วเสียกว่า ~${pts(loss)} แต้ม</p>`);
    }
    h += others.join("");
    const gap = r.cands.length > 1 ? Math.min(...r.cands.slice(1).filter(x => x.move !== PASS).map(x => best.lead - x.lead)) : 0;
    if (gap >= 3) h += `<p class="an-warn">ตานี้มีทางที่ถูกอยู่ทางเดียว ตาอื่นเสียตั้งแต่ ${pts(gap)} แต้มขึ้นไป</p>`;
    say(h);
    chipsFor();
    const g = gameMove(); if (g !== null && g !== best.move) await explainMove(g, true);
  }
  // how a move compares with the best one in the shown position
  async function explainMove(m, real) {
    const AI = api.ai(), moves = cur(), my = tok, c = ST.b.toPlay;
    if (!AI) return;
    if (m !== PASS && !ST.b.isLegal(m, c)) { say(`${name(m)} ตอนนี้วางไม่ได้ครับ (มีหมากอยู่แล้ว หรือเป็นจุดห้ามเดิน)`); return; }
    if (!ST.res || ST.res.key !== keyOf(moves)) await analyze(false);
    const r = ST.res; if (my !== tok || !r || r.key !== keyOf(moves)) return;
    const best = r.cands[0], label = real ? `ในเกมจริง${CN[c]}เดิน <b>${name(m)}</b>` : `ถ้า${CN[c]}เดิน <b>${name(m)}</b>`;
    if (m === best.move) { say(`${label} ตรงกับตาที่ AI แนะนำเลยครับ 👍`); return; }
    const wait = say(`${label} … ขอผมอ่านตานั้นแป๊บนึงนะครับ`);
    // both moves read with the same search, so their score leads compare fairly
    const known = r.cands.find(x => x.move === m && x.visits >= 60);
    let lead, win, bestLead = best.lead;
    if (known) { lead = known.lead; win = known.winrate; }
    else {
      const cv = { visits: 400, timeMs: 3000, batch: 8, shouldStop: () => my !== tok };
      const a = await queue(() => my !== tok ? null : AI.think(ST.n, moves.concat([best.move]), KOMI, cv));
      const b = await queue(() => my !== tok ? null : AI.think(ST.n, moves.concat([m]), KOMI, cv));
      if (!a || !b || my !== tok) return;
      lead = -b.searchLead; win = 1 - b.winrate; bestLead = -a.searchLead;
    }
    const loss = Math.max(0, bestLead - lead), gr = gradeOf(loss);
    const [ev] = await queue(() => my !== tok ? null : evalsFor(AI, moves, [m])) || [];
    if (!ev || my !== tok) return;
    const mine = reasons(moves, m, ev.evB, ev.evA, ev.evP, ev.evPm);
    let h = `${label} · <span class="g-t g-${gr.cls}">${gr.t}</span> (ชนะ ${pct(win)}%)`;
    const good = mine.filter(x => !x.neg && !x.fb).slice(0, 2), bad = mine.filter(x => x.neg);
    if (good.length) h += `<br>ข้อดี: ${good.map(x => esc(x.t)).join(" · ")}`;
    else if (loss > 2) h += `<br>ตานี้ไม่ได้กิน ตัด หรือสร้างพื้นที่อะไรเพิ่มขึ้นชัดๆ`;
    if (bad.length) h += `<br><span class="an-warn">ข้อเสีย: ${bad.map(x => esc(x.t)).join(" · ")}</span>`;
    if (loss > 2) {
      // what the opponent does about it: their likeliest reply, and why it hurts
      const after = moves.concat([m]);
      let bi = 0; for (let i = 1; i < 361; i++) if (ev.evA.policy[i] > ev.evA.policy[bi]) bi = i;
      const reply = ST.b0.pt(bi % 19, (bi / 19) | 0);
      if (ev.evA.policy[361] < ev.evA.policy[bi]) {
        const [re] = await queue(() => my !== tok ? null : evalsFor(AI, after, [reply])) || [];
        if (!re || my !== tok) return;
        const rr = reasons(after, reply, re.evB, re.evA, re.evP, re.evPm).filter(x => !x.neg);
        h += `<br>จากนั้น${CN[3 - c]}น่าจะตอบที่ <b>${name(reply)}</b>: ${esc(rr[0].t)}`;
      }
      const bw = r.why ? r.why[0].filter(x => !x.neg) : [];
      h += `<br>ตา ${name(best.move)} ดีกว่า: ${bw.length ? esc(bw[0].t) : "อ่านแล้วได้แต้มมากกว่า"}`;
    }
    wait.querySelector(".an-b").innerHTML = h;
    $("anChat").scrollTop = $("anChat").scrollHeight;
  }
  async function explainWhy() {
    if (!ST.res || ST.res.key !== keyOf(cur())) { await analyze(true); return; }
    if (!ST.res.why) await explainBest();
    const r = ST.res, best = r.cands[0]; if (!r.why || best.move === PASS) return;
    const all = r.why[0];
    say(`<b>ทำไมต้อง ${name(best.move)}</b><ul>${all.slice(0, 6).map(x => `<li${x.neg ? ' class="an-warn"' : ""}>${esc(x.t)}</li>`).join("")}</ul>`);
    await showPv();
  }
  async function explainSecond() {
    if (!ST.res || ST.res.key !== keyOf(cur())) await analyze(false);
    const r = ST.res; if (!r || r.cands.length < 2) return;
    await explainMove(r.cands[1].move, false);
  }
  async function showPv() {
    const AI = api.ai(), my = tok, moves = cur();
    if (!AI) return;
    if (!ST.res || ST.res.key !== keyOf(moves)) await analyze(false);
    const r = ST.res; if (!r || my !== tok || r.cands[0].move === PASS) return;
    const seq = [r.cands[0].move].concat(await queue(() => my !== tok ? [] : followUp(AI, moves.concat([r.cands[0].move]), 5)));
    if (my !== tok) return;
    ST.pv = seq; drawBoard();
    const c = ST.b.toPlay;
    say(`ลำดับที่น่าจะตามมา (เลขบนกระดาน): ${seq.map((p, i) => `${CN[i % 2 ? 3 - c : c]} ${name(p)}`).join(" → ")}<br><span class="an-dim">แตะกระดานหรือเปลี่ยนตาเพื่อซ่อน</span>`);
  }
  async function explainStatus() {
    const AI = api.ai(), my = tok, moves = cur(); if (!AI) return;
    const ev = await queue(() => my !== tok ? null : AI.evaluate(ST.n, moves, KOMI));
    if (!ev || my !== tok) return;
    const b = ST.b, c = b.toPlay, o = 3 - c;
    const r = ST.res && ST.res.key === keyOf(moves) ? ST.res.s : null;
    const win = r ? r.winrate : ev.win / (ev.win + ev.loss), lead = r ? r.searchLead : ev.lead;
    const wb = c === BLACK ? win : 1 - win, lb = c === BLACK ? lead : -lead;
    let h = `<b>สถานการณ์ตอนนี้</b> ${Math.abs(lb) < 0.5 ? "สูสีกันมาก" : `${lb > 0 ? "ดำ" : "ขาว"}นำ ~${pts(lb)} แต้ม`} (โอกาสชนะ ดำ ${pct(wb)}% · ขาว ${pct(1 - wb)}%)`;
    const weak = [], dead = [];
    for (const [hd, g] of chains(b)) {
      if (g.stones.length < 3) continue;
      const life = avgOwn(b, ev.own, g.stones, g.c === c ? 1 : -1);
      if (life < -0.55) dead.push(`กลุ่ม${CN[g.c]} ${g.stones.length} เม็ดที่${centre(g.stones)}`);
      else if (life < 0.35) weak.push(`กลุ่ม${CN[g.c]} ${g.stones.length} เม็ดที่${centre(g.stones)}`);
    }
    if (dead.length) h += `<br>น่าจะตายแล้ว: ${dead.slice(0, 3).join(", ")}`;
    if (weak.length) h += `<br>ยังไม่แน่นอน ต้องดูแล: ${weak.slice(0, 3).join(", ")}`;
    const area = {};
    for (const p of b.pts) { const v = ev.own[oi(b, p)] * (c === BLACK ? 1 : -1), rg = regionAt(p); area[rg] = (area[rg] || 0) + v; }
    const big = Object.entries(area).filter(([, v]) => Math.abs(v) >= 6).sort((a, b2) => Math.abs(b2[1]) - Math.abs(a[1])).slice(0, 4);
    if (big.length) h += `<br>พื้นที่หลัก: ${big.map(([rg, v]) => `${rg}เป็นของ${v > 0 ? "ดำ" : "ขาว"}`).join(", ")}`;
    h += `<br><span class="an-dim">สี่เหลี่ยมบนกระดานคือพื้นที่ที่ AI คิดว่าเป็นของแต่ละฝ่าย</span>`;
    ST.own = { key: keyOf(moves), own: ev.own, pla: c }; drawBoard();
    say(h);
  }
  // the player's biggest losses over the whole game, from the network's first look at every position
  async function explainMistakes() {
    const AI = api.ai(), g = ST.game; if (!AI || !g) return;
    const ms = g.moves, wait = say("กำลังไล่ดูทั้งเกม… 0%"), lb = [];
    for (let k = 0; k <= ms.length; k += 8) {
      const list = []; for (let j = k; j <= Math.min(ms.length, k + 7); j++) list.push(ms.slice(0, j));
      const evs = await queue(() => AI.evalMany(ST.n, list, KOMI));
      evs.forEach((ev, i) => { const j = k + i; lb[j] = (j % 2 === 0 ? 1 : -1) * ev.lead; });
      wait.querySelector(".an-b").textContent = `กำลังไล่ดูทั้งเกม… ${Math.round(Math.min(1, (k + 8) / (ms.length + 1)) * 100)}%`;
    }
    const who = g.human || 0, list = [];
    for (let k = 0; k < ms.length; k++) {
      const col = k % 2 === 0 ? BLACK : WHITE; if (who && col !== who) continue;
      if (ms[k] === PASS) continue;
      const loss = col === BLACK ? lb[k] - lb[k + 1] : lb[k + 1] - lb[k];
      if (loss >= 2) list.push({ k, loss, col });
    }
    list.sort((a, b) => b.loss - a.loss);
    const top = list.slice(0, 5).sort((a, b) => a.k - b.k);
    if (!top.length) { wait.querySelector(".an-b").innerHTML = `ทั้งเกมไม่มีตาไหนที่${who ? "คุณ" : ""}เสียเกิน 2 แต้มเลยครับ เล่นได้แน่นมาก`; return; }
    wait.querySelector(".an-b").innerHTML = `<b>จุดพลาดใหญ่${who ? "ของคุณ (" + CN[who] + ")" : ""}</b> (ประเมินคร่าวๆ แตะเพื่อไปดูตานั้น)<div class="an-list">${top.map(x =>
      `<button class="an-chip" data-goto="${x.k}">ตาที่ ${x.k + 1} · ${CN[x.col]} ${name(ms[x.k])} · เสีย ~${pts(x.loss)}</button>`).join("")}</div>`;
  }
  const GLOSS = [
    [/อะตาริ|atari/, "<b>อะตาริ</b> คือหมากที่เหลือลมหายใจเดียว ตาต่อไปอีกฝ่ายกินได้ ต้องรีบหนี (ต่อให้ลมหายใจเพิ่ม) หรือยอมทิ้ง"],
    [/โค|ko\b/, "<b>โค</b> คือรูปที่ผลัดกันกินหมากเม็ดเดียวได้ไม่รู้จบ กติกาจึงห้ามกินคืนทันที ต้องไปเดินที่อื่นก่อนหนึ่งตา (เรียกว่าหาภัยคุกคามโค)"],
    [/เซกิ|seki/, "<b>เซกิ</b> คือกลุ่มของทั้งสองฝ่ายที่ใช้ลมหายใจร่วมกัน ใครเข้าไปลงก่อนจะโดนกิน จึงไม่มีใครลง ทั้งคู่รอดไปด้วยกัน"],
    [/โคมิ|komi/, "<b>โคมิ</b> คือแต้มชดเชยที่ขาวได้ เพราะดำได้เดินก่อน เกมนี้ใช้ 7.5 แต้ม (.5 กันเสมอ)"],
    [/เทนูกิ|tenuki/, "<b>เทนูกิ</b> คือการไม่ตอบหมากที่อีกฝ่ายเพิ่งลง แล้วไปเล่นจุดอื่นที่ใหญ่กว่า"],
    [/โจเซกิ|joseki/, "<b>โจเซกิ</b> คือลำดับหมากมาตรฐานในมุมที่ทั้งสองฝ่ายได้เท่าๆ กัน"],
    [/ชิมาริ|shimari/, "<b>ชิมาริ</b> คือการลงหมากเม็ดที่สองในมุมของตัวเอง เพื่อปิดมุมให้แน่น"],
    [/คาคาริ|kakari/, "<b>คาคาริ</b> คือการเข้าไปประชิดมุมที่อีกฝ่ายมีหมากเม็ดเดียว ไม่ให้เขาปิดมุมได้ง่ายๆ"],
    [/3-3|สามสาม/, "<b>3-3</b> คือจุดที่สามจากขอบทั้งสองด้านในมุม ได้พื้นที่มุมแน่นอน มักใช้บุกมุมที่อีกฝ่ายลงไว้ที่ 4-4"],
    [/สองตา|ตาคืออะไร|\bตา\b.*คือ/, "<b>ตา</b> คือจุดว่างที่ล้อมด้วยหมากของเราทั้งหมด กลุ่มที่มี<b>สองตาแท้</b>ไม่มีวันถูกกิน"],
    [/ลมหายใจ|liberty/, "<b>ลมหายใจ</b> คือจุดว่างที่ติดกับหมากตรงๆ (บน ล่าง ซ้าย ขวา) ถ้าโดนปิดหมด หมากนั้นถูกกิน"]
  ];
  // typed questions: matched by keywords, the analysis itself comes from the network
  async function ask(text) {
    const t = text.trim(); if (!t) return;
    bubble(esc(t), "me");
    const low = t.toLowerCase(), p = parsePoint(t);
    const mv = /ตา(?:ที่)?\s*(\d{1,3})/.exec(low);
    if (/คืออะไร|หมายถึง|แปลว่า|คือไร/.test(low) || GLOSS.some(([re]) => re.test(low) && low.length <= 12)) {
      const hit = GLOSS.find(([re]) => re.test(low));
      if (hit) return say(hit[1]);
    }
    if (p !== null) return explainMove(p, false);
    if (mv && !/ลำดับ/.test(low)) {
      const k = Math.max(1, Math.min(ST.line.length, +mv[1]));
      if (ST.line.length) { goTo(k - 1); say(`ไปที่ตาที่ ${k} แล้วครับ (ก่อน${CN[ST.b.toPlay]}เดิน)`); return analyze(true); }
    }
    if (/พลาด|ผิด|เสียแต้ม|แย่ตรงไหน|สรุป|ทั้งเกม|review/.test(low)) return ST.game ? explainMistakes() : say("จุดพลาดดูได้เมื่อเปิดเกมที่เล่นจบแล้วครับ (กดวิเคราะห์จากหน้าจบเกม)");
    if (/ลำดับ|ต่อไป|ตามมา|แล้วไง|แล้วยังไง|ต่อจากนี้/.test(low)) return showPv();
    if (/ทำไม|เพราะ|เหตุผล|อธิบาย|why/.test(low)) return explainWhy();
    if (/อันดับ\s*2|ตัวเลือกอื่น|ตาอื่น|อย่างอื่น|second/.test(low)) return explainSecond();
    if (/ควร|ตรงไหน|ที่ไหน|แนะนำ|เดินอะไร|เดินไหน|ตาดี|best|วิเคราะห์/.test(low)) return analyze(true);
    if (/ใคร|นำ|เปรียบ|ชนะ|แพ้|สถานการณ์|ตอนนี้|พื้นที่|กลุ่ม|ตาย|รอด/.test(low)) return explainStatus();
    if (/เดินจริง|ที่เดินไป|ตาที่เล่น|ตาเมื่อกี้|ตาเรา/.test(low)) { const g = gameMove(); return g !== null ? explainMove(g, true) : say("ตอนนี้ไม่ได้อยู่บนเส้นเกมจริง หรือเป็นตาสุดท้ายแล้วครับ"); }
    if (/สวัสดี|หวัดดี|hello|^hi\b/.test(low)) return say("สวัสดีครับ ผมกัน จะช่วยดูหมากให้ กด ANALYSIS หรือพิมพ์ถามได้เลย");
    if (/ขอบคุณ|ขอบใจ|thank/.test(low)) return say("ยินดีครับ ฝึกต่อไปนะครับ");
    say(`ข้อนี้ผมยังตอบไม่ได้ครับ ผมตอบได้เฉพาะเรื่องบนกระดาน ลองถามเช่น<br>· "ควรเดินตรงไหน" · "ทำไมต้องเดินตรงนั้น" · "ถ้าเดิน ${name(ST.b0.pt(3, 3))} ล่ะ" · "ใครนำ" · "ลำดับต่อไป" · "ตาที่ 30" · "จุดพลาด" · "โคคืออะไร"`);
  }

  // ---------- board ----------
  function setPos() {
    tok++; ST.pv = null; ST.running = false; ST.live = null; ST.own = null;
    ST.b = boardOf(cur());
    if (ST.res && ST.res.key !== keyOf(cur())) ST.res = null;
    render();
    const AI = api.ai(), my = tok, moves = cur();
    if (ST.auto) { analyze(true); return; }
    if (!AI) return;
    // a quick first look for the win-rate bar
    queue(() => my !== tok ? null : AI.evaluate(ST.n, moves, KOMI)).then(ev => {
      if (!ev || my !== tok || ST.res) return;
      ST.win = ev.win / (ev.win + ev.loss); ST.lead = ev.lead; ST.pla = ev.pla; renderInfo();
    });
  }
  function goTo(k) { k = Math.max(0, Math.min(ST.line.length, k)); if (k === ST.at && ST.b) return; ST.at = k; setPos(); }
  function play(p) {
    const b = ST.b; if (p !== PASS && !b.isLegal(p, b.toPlay)) return;
    if (ST.line[ST.at] === p) { goTo(ST.at + 1); return; }
    ST.line = ST.line.slice(0, ST.at).concat([p]); ST.at++; setPos();
  }
  function drawBoard() {
    const n = ST.n, b = ST.b, s = [], xy = p => b.xy(p);
    s.push(`<defs><radialGradient id="anGb" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#5b5b5b"/><stop offset="1" stop-color="#0d0d0d"/></radialGradient>
      <radialGradient id="anGw" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfc6b4"/></radialGradient></defs>`);
    s.push(`<rect x="-1.1" y="-1.1" width="${n + 1.2}" height="${n + 1.2}" fill="var(--wood)"/>`);
    for (let k = 0; k < n; k++) s.push(`<line x1="0" y1="${k}" x2="${n - 1}" y2="${k}" stroke="#4a2a12" stroke-width=".04"/><line x1="${k}" y1="0" x2="${k}" y2="${n - 1}" stroke="#4a2a12" stroke-width=".04"/>`);
    const stars = n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : [2, 4, 6];
    for (const a of stars) for (const c of stars) { if (n === 9 && (a === 4) !== (c === 4)) continue; s.push(`<circle cx="${a}" cy="${c}" r=".09" fill="#4a2a12"/>`); }
    for (let k = 0; k < n; k++) s.push(`<text x="${k}" y="-.62" class="an-co">${LETTERS[k]}</text><text x="-.68" y="${k}" class="an-co">${n - k}</text>`);
    if (ST.own) for (const p of b.pts) {
      if (b.color[p] !== 0) continue;
      const v = ST.own.own[oi(b, p)] * (ST.own.pla === BLACK ? 1 : -1); if (Math.abs(v) < 0.35) continue;
      const [x, y] = xy(p), k = .12 + .14 * Math.min(1, Math.abs(v));
      s.push(`<rect x="${x - k}" y="${y - k}" width="${2 * k}" height="${2 * k}" fill="${v > 0 ? "#141414" : "#f6f1e6"}" opacity=".8"/>`);
    }
    for (const p of b.pts) {
      const c = b.color[p]; if (c !== BLACK && c !== WHITE) continue;
      const [x, y] = xy(p); s.push(`<circle cx="${x}" cy="${y}" r=".47" fill="url(#${c === BLACK ? "anGb" : "anGw"})" stroke="${c === BLACK ? "#000" : "#9c917e"}" stroke-width=".02"/>`);
    }
    const last = ST.at ? ST.line[ST.at - 1] : PASS;
    if (last !== PASS && b.color[last]) { const [x, y] = xy(last); s.push(`<circle cx="${x}" cy="${y}" r=".16" fill="none" stroke="${b.color[last] === BLACK ? "#f3ead8" : "#2a1a0b"}" stroke-width=".06"/>`); }
    if (ST.pv) {
      const c0 = b.toPlay; let sb = new Board(n); sb.copyFrom(b);
      ST.pv.forEach((p, i) => {
        if (p === PASS) return;
        const [x, y] = xy(p), c = i % 2 ? 3 - c0 : c0;
        s.push(`<circle cx="${x}" cy="${y}" r=".46" fill="url(#${c === BLACK ? "anGb" : "anGw"})" opacity=".82"/><text x="${x}" y="${y + .02}" class="an-pvn" fill="${c === BLACK ? "#f3ead8" : "#1a1208"}">${i + 1}</text>`);
      });
    } else {
      const sum = ST.running ? ST.live : ST.res && ST.res.key === keyOf(cur()) ? ST.res.s : null;
      const list = ST.running ? (sum ? sum.top.slice(0, 10) : []) : ST.res && ST.res.key === keyOf(cur()) ? ST.res.cands : [];
      const bestLead = list.length ? list[0].lead : 0;
      list.forEach((cd, i) => {
        if (cd.move === PASS) return;
        const [x, y] = xy(cd.move), loss = bestLead - cd.lead;
        const fill = i === 0 ? "#57c26b" : loss <= 1 ? "#c4d45a" : loss <= 3 ? "#e0a552" : "#cf7b4a";
        s.push(`<g class="an-cand"><circle cx="${x}" cy="${y}" r=".47" fill="${fill}" stroke="${i === 0 ? "#1f6b3a" : "rgba(42,26,11,.5)"}" stroke-width="${i === 0 ? .07 : .03}"/>
          <text x="${x}" y="${y - .13}" class="an-w">${pct(cd.winrate)}</text><text x="${x}" y="${y + .2}" class="an-l">${cd.lead >= 0 ? "+" : "−"}${pts(cd.lead)}</text>
          <text x="${x + .36}" y="${y - .4}" class="an-rk">${i + 1}</text></g>`);
      });
      const gm = gameMove();
      if (gm !== null && gm !== PASS) { const [x, y] = xy(gm); s.push(`<circle cx="${x}" cy="${y}" r=".5" fill="none" stroke="#3f8fd8" stroke-width=".07" stroke-dasharray=".16 .1"/>`); }
    }
    if (ST.ghost !== null && b.color[ST.ghost] === 0 && b.isLegal(ST.ghost, b.toPlay)) {
      const [x, y] = xy(ST.ghost); s.push(`<circle cx="${x}" cy="${y}" r=".45" fill="url(#${b.toPlay === BLACK ? "anGb" : "anGw"})" opacity=".4" pointer-events="none"/>`);
    }
    $("anBoard").innerHTML = s.join("");
  }
  function renderInfo() {
    const b = ST.b, c = b.toPlay;
    let win = ST.win, lead = ST.lead;
    if (ST.running && ST.live) { win = ST.live.winrate; lead = ST.live.searchLead; }
    const wb = win === null ? 0.5 : ST.pla === BLACK || (ST.running && c === BLACK) ? win : 1 - win;
    $("anWrFill").style.width = (wb * 100) + "%";
    $("anWrB").textContent = "ดำ " + pct(wb); $("anWrW").textContent = "ขาว " + pct(1 - wb);
    const lb = lead === null ? 0 : (ST.pla === BLACK ? lead : -lead);
    const gm = gameMove();
    $("anInfo").innerHTML = `ตา ${ST.at}/${ST.line.length} · ตา${CN[c]} · หมากเชลย ดำ ${b.caps[BLACK]} ขาว ${b.caps[WHITE]}` +
      (lead === null ? "" : ` · ${Math.abs(lb) < 0.5 ? "สูสี" : (lb > 0 ? "ดำ" : "ขาว") + "นำ ~" + pts(lb)}`) +
      (ST.running ? ` · <b>กำลังอ่าน${ST.live ? " " + ST.live.visits.toLocaleString() + " รูปแบบ" : "…"}</b>` : "") +
      (gm !== null ? ` · <span class="an-real">วงฟ้า = ตาที่เดินจริง</span>` : "");
  }
  function render() {
    drawBoard(); renderInfo(); chipsFor();
    $("anFirst").disabled = $("anPrev").disabled = ST.at === 0;
    $("anNext").disabled = $("anLast").disabled = ST.at >= ST.line.length;
    const go = $("anGo"); go.classList.toggle("on", !!ST.auto); go.setAttribute("aria-pressed", String(!!ST.auto)); // green while every position is read on its own
  }

  // ---------- wiring ----------
  let wired = false;
  function wire() {
    wired = true;
    const svg = $("anBoard");
    const ptAt = e => {
      const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      const q = p.matrixTransform(svg.getScreenCTM().inverse()), x = Math.round(q.x), y = Math.round(q.y);
      return x < 0 || y < 0 || x >= ST.n || y >= ST.n || Math.hypot(q.x - x, q.y - y) > .5 ? null : ST.b0.pt(x, y);
    };
    svg.addEventListener("click", e => { const p = ptAt(e); if (ST.pv) { ST.pv = null; drawBoard(); return; } if (p !== null) { ST.ghost = null; play(p); } });
    svg.addEventListener("pointermove", e => { if (e.pointerType !== "mouse") return; const p = ptAt(e); if (p !== ST.ghost) { ST.ghost = p; drawBoard(); } });
    svg.addEventListener("pointerleave", () => { ST.ghost = null; drawBoard(); });
    $("anFirst").onclick = () => goTo(0);
    $("anPrev").onclick = () => goTo(ST.at - 1);
    $("anNext").onclick = () => goTo(ST.at + 1);
    $("anLast").onclick = () => goTo(ST.line.length);
    $("anPass").onclick = () => play(PASS);
    $("anGo").onclick = () => {
      if (ST.auto) { ST.auto = false; render(); return; }
      ST.auto = true; render(); analyze(true);
    };
    $("anBack").onclick = () => { close(); api.onBack && api.onBack(ST.from); };
    $("anAsk").addEventListener("submit", e => { e.preventDefault(); const v = $("anInput").value; $("anInput").value = ""; ask(v); });
    $("anel").addEventListener("click", e => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.goto !== undefined) { const k = +t.dataset.goto; if (ST.game) { ST.line = ST.game.moves.slice(); } goTo(k); analyze(true); return; }
      const act = t.dataset.act; if (!act) return;
      if (act === "go") { analyze(true); return; }
      const label = t.textContent;
      if (["why", "second", "pv", "played", "status", "mistakes"].includes(act)) bubble(esc(label), "me");
      if (act === "why") explainWhy();
      else if (act === "second") explainSecond();
      else if (act === "pv") showPv();
      else if (act === "played") { const g = gameMove(); if (g !== null) explainMove(g, true); }
      else if (act === "status") explainStatus();
      else if (act === "mistakes") explainMistakes();
      else if (act === "back") { ST.line = ST.game.moves.slice(); setPos(); }
      else if (act.startsWith("new")) { start({ n: +act.slice(3), moves: [] }); }
      else if (act === "last") { start(api.lastGame()); }
    });
    document.addEventListener("keydown", e => {
      if ($("anel").hidden || e.target.closest("input")) return;
      if (e.key === "ArrowLeft") goTo(ST.at - 1); else if (e.key === "ArrowRight") goTo(ST.at + 1);
    });
  }
  function close() { tok++; $("anel").hidden = true; document.body.classList.remove("analysing"); }
  function start(g) {
    const n = g.n || 19;
    ST = { n, b0: new Board(n), line: (g.moves || []).slice(), at: 0, game: g.moves && g.moves.length ? { moves: g.moves.slice(), human: g.human || 0 } : null,
      res: null, pv: null, own: null, ghost: null, running: false, live: null, win: null, lead: null, pla: BLACK, auto: ST ? ST.auto : false, from: g.from || (ST && ST.from) };
    ST.at = g.at === undefined ? ST.line.length : Math.max(0, Math.min(ST.line.length, g.at));
    $("anChat").innerHTML = "";
    $("anBoard").setAttribute("viewBox", `-1.1 -1.1 ${n + 1.2} ${n + 1.2}`);
    say(ST.game ? `สวัสดีครับ ผม<b>กัน</b> มาดูเกมนี้ด้วยกัน (${n}×${n}, ${ST.line.length} ตา) กด ◀ ▶ เพื่อเลือกตา แล้วกด <b>ANALYSIS</b> ให้ AI ชี้จุดที่น่าเดินพร้อมเหตุผล หรือแตะกระดานเพื่อลองเดินเอง พิมพ์ถามได้เลยครับ`
      : `สวัสดีครับ ผม<b>กัน</b> นี่คือกระดานวิเคราะห์ ${n}×${n} แตะกระดานวางหมาก (ดำ-ขาวสลับกัน) แล้วกด <b>ANALYSIS</b> ให้ AI ชี้จุดที่น่าเดินพร้อมบอกเหตุผล พิมพ์ถามได้เลยครับ` +
        `<div class="an-list"><button class="an-chip" data-act="new19">กระดาน 19×19</button><button class="an-chip" data-act="new13">13×13</button><button class="an-chip" data-act="new9">9×9</button>${api.lastGame && api.lastGame() ? '<button class="an-chip" data-act="last">เปิดเกมล่าสุดที่เล่น</button>' : ""}</div>`);
    tok++; ST.b = null; setPos();
  }
  api.open = function (g) {
    E = api.E; Board = E.Board; PASS = E.PASS; BLACK = E.BLACK; WHITE = E.WHITE;
    if (!wired) wire();
    $("anel").hidden = false; document.body.classList.add("analysing"); window.scrollTo(0, 0);
    start(g || { n: 19, moves: [] });
  };
  return api;
})();
