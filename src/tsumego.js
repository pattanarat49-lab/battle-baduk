// Tsumego: a level ladder from 10 kyu to 4 dan. Each problem is a five-move answer line (the player's three moves and the
// opponent's two replies, worked out ahead by KataGo, see src/tools); solving one moves the player up a level, a wrong
// move gets one reply from the opponent and sends the player back to 10 kyu. Problems never repeat until a level runs out.
const Tsumego = (() => {
  "use strict";
  const api = {}; // the game sets api.E, api.ai() (the GoNNAI in use or null), api.sound(), api.onBack()
  const $ = id => document.getElementById(id);
  const CATS = { life: "เป็น-ตาย", capture: "จับกิน", connect: "ต่อ-ตัด", tesuji: "ทีเด็ด", endgame: "เอนเกม" };
  const LEVELS = ["10 คิว", "9 คิว", "8 คิว", "7 คิว", "6 คิว", "5 คิว", "4 คิว", "3 คิว", "2 คิว", "1 คิว", "1 ดั้ง", "2 ดั้ง", "3 ดั้ง", "4 ดั้ง"];
  const TOP = LEVELS.length - 1;
  const KEY = "gonn.tsume2"; // { lvl: current level, best: highest level reached, solved: count, seen: [problem ids] }
  const fresh0 = () => ({ lvl: 0, best: 0, solved: 0, seen: [] });
  const load = () => { try { return Object.assign(fresh0(), JSON.parse(localStorage.getItem(KEY))); } catch (e) { return fresh0(); } };
  const store = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };

  let DATA = null, loading = null, wired = false;
  const ST = { b: null, base: null, moves: [], done: 0, failed: 0, wait: 0, mark: null, busy: 0, playing: false };

  function fetchData() {
    if (!loading) loading = fetch("tsumego.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => (DATA = d))
      .catch(e => { loading = null; throw e; });
    return loading;
  }
  const idOf = q => DATA.src[q.s] + "#" + q.n;

  // ---------- the ladder screen ----------
  function showLadder() {
    ST.playing = false; ST.busy++; $("tsPick").hidden = false; $("tsPlay").hidden = true; $("tsTitle").textContent = "โจทย์ฝึกอ่านหมาก";
    const g = load();
    $("tsNow").textContent = LEVELS[g.lvl];
    $("tsStats").textContent = `สูงสุดที่เคยถึง ${LEVELS[g.best]} · ทำถูกแล้ว ${g.solved} ข้อ`;
    $("tsSteps").innerHTML = LEVELS.map((n, l) => `<i class="${l === g.lvl ? "now" : l <= g.best ? "been" : ""}" title="${n}"></i>`).join("");
    $("tsGo").textContent = g.lvl ? `เล่นต่อที่ ${LEVELS[g.lvl]}` : "เริ่มที่ 10 คิว";
    window.scrollTo(0, 0);
  }
  // a problem at this level not seen yet; when the level has run out, its problems start over
  function nextProblem(l) {
    const g = load(), seen = new Set(g.seen), all = DATA.p.filter(q => q.l === l);
    let fresh = all.filter(q => !seen.has(idOf(q)));
    if (!fresh.length) { const ids = new Set(all.map(idOf)); g.seen = g.seen.filter(id => !ids.has(id)); store(g); fresh = all; }
    return fresh[Math.floor(Math.random() * fresh.length)];
  }

  // ---------- one problem ----------
  const c2 = s => [s.charCodeAt(0) - 97, s.charCodeAt(1) - 97];
  const pairs = s => s.match(/../g) || [];
  // stones that fill the rest of the board (a "tsumego frame"): a solid wall of the attacking side around the problem area,
  // then the attacker's and the defender's living masses with eyes, so the network reads only the problem and doesn't
  // look for big points elsewhere. The defender is the side whose stones sit nearer the edges.
  function frameOf(q, crop) {
    const edge = s => { const [x, y] = c2(s); return Math.min(x, y, 18 - x, 18 - y); };
    const mean = ss => ss.length ? ss.reduce((a, s) => a + edge(s), 0) / ss.length : 9;
    const atk = mean(pairs(q.b)) > mean(pairs(q.w)) ? "B" : "W";
    const x0 = Math.max(0, crop.x0 - 1), x1 = Math.min(18, crop.x1 + 1), y0 = Math.max(0, crop.y0 - 1), y1 = Math.min(18, crop.y1 + 1);
    const out = [];
    for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) {
      const d = Math.max(x0 - x, x - x1, y0 - y, y - y1, 0); if (d > 0) out.push({ x, y, d });
    }
    out.sort((a, b) => a.d - b.d);
    const half = out.length / 2, f = { B: [], W: [] };
    out.forEach((o, k) => {
      const mine = o.d === 1 || k < half ? atk : atk === "B" ? "W" : "B";
      if (o.d > 1 && o.x % 3 === 1 && o.y % 3 === 1) return; // eyes
      f[mine].push(String.fromCharCode(97 + o.x, 97 + o.y));
    });
    return f;
  }
  // the setup stones as a move list the network understands: stones alternate, passes fill in, and the side to move comes last
  function setupMoves(q, crop) {
    const { Board, PASS } = api.E, b0 = new Board(19);
    const build = (bs, ws) => {
      const B = bs.map(s => b0.pt(...c2(s))), W = ws.map(s => b0.pt(...c2(s)));
      const enc = lead => {
        const m = lead ? [PASS] : []; let i = 0, j = 0;
        while (i < B.length || j < W.length) { if (m.length % 2 === 0) m.push(i < B.length ? B[i++] : PASS); else m.push(j < W.length ? W[j++] : PASS); }
        if ((m.length % 2 === 0 ? "B" : "W") !== q.t) m.push(PASS);
        return m;
      };
      const ok = m => !m.some((x, k) => x === PASS && m[k - 1] === PASS);
      const m = enc(false); return ok(m) ? m : enc(true);
    };
    // every stone must go down legally and nothing may be captured, or the frame is left out
    const valid = m => { const b = new Board(19); for (const p of m) { if (p !== PASS && !b.isLegal(p, b.toPlay)) return false; b.play(p); }
      return m.filter(p => p !== PASS).every(p => b.color[p] !== 0); };
    const f = frameOf(q, crop), m = build(pairs(q.b).concat(f.B), pairs(q.w).concat(f.W));
    return valid(m) ? m : build(pairs(q.b), pairs(q.w));
  }
  // the part of the board the problem lives in, out to the edge when it is close
  function cropOf(q) {
    const xs = [], ys = [];
    for (const s of pairs(q.b + q.w).concat(q.a)) { const [x, y] = c2(s); xs.push(x); ys.push(y); }
    let x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 2;
    if (x0 <= 2) x0 = 0; if (y0 <= 2) y0 = 0; if (x1 >= 16) x1 = 18; if (y1 >= 16) y1 = 18;
    // at least 7 points each way so the stones don't get huge
    while (x1 - x0 < 6) { if (x0 > 0) x0--; if (x1 - x0 < 6 && x1 < 18) x1++; }
    while (y1 - y0 < 6) { if (y0 > 0) y0--; if (y1 - y0 < 6 && y1 < 18) y1++; }
    return { x0, x1, y0, y1 };
  }
  function play() {
    const g = load(), q = nextProblem(g.lvl);
    if (!q) return;
    g.seen.push(idOf(q)); store(g);
    ST.playing = true; ST.q = q; ST.crop = cropOf(q); ST.show = false;
    $("tsPick").hidden = true; $("tsPlay").hidden = false;
    ST.base = setupMoves(q, ST.crop); reset();
    $("tsTitle").textContent = `ระดับ ${LEVELS[g.lvl]}`;
    $("tsNo").textContent = `หมวด ${CATS[q.c]}`;
    say(`<b>${q.t === "B" ? "ดำ" : "ขาว"}เดินก่อน</b> ${hintOf(q.c)} ต้องเดินถูกทั้ง 3 ตา (อีกฝ่ายตอบ 2 ตา)`);
    const src = DATA.src[q.s]; // Lee Changho's volumes are named by chapter only
    $("tsSrc").textContent = `จาก ${/^\d/.test(src) ? "Lee Changho Tesuji · " + src : src} ข้อ ${q.n}`;
    $("tsAns").hidden = true; $("tsNext").hidden = true;
    window.scrollTo(0, 0);
  }
  const hintOf = cat => ({ life: "หาจุดที่ทำให้รอด หรือทำให้อีกฝ่ายตาย", capture: "หาตาที่จับกินหมากได้", connect: "หาตาที่ต่อหรือตัดได้สำเร็จ",
    tesuji: "หาท่าไม้ตายที่ได้ผลที่สุด", endgame: "หาตาปิดเขตที่ได้แต้มมากที่สุด" })[cat];
  // the answer line (q.m: the player's move, the opponent's reply, ... as point names), the other moves the network
  // rates as just as good at each of the player's turns (q.x), and the komi that makes the framed position even (q.k)
  const lineOf = q => pairs(q.m || q.a[0]);
  function reset() {
    const { Board } = api.E, b = new Board(19);
    for (const m of ST.base) b.play(m);
    ST.moves = ST.base.slice();
    ST.b = b; ST.step = 0; ST.done = 0; ST.failed = 0; ST.wait = 0; ST.mark = null; ST.nums = null; ST.last = null; ST.busy++;
    draw();
  }
  function say(html) { $("tsSay").innerHTML = html; }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function put(p) { ST.b.play(p); ST.moves.push(p); ST.last = p; if (api.sound) api.sound(); }

  async function tap(p) {
    if (ST.done || ST.failed || ST.wait || !ST.b) return;
    const b = ST.b; if (!b.isLegal(p, b.toPlay)) return;
    const [x, y] = b.xy(p), name = String.fromCharCode(97 + x, 97 + y), q = ST.q, line = lineOf(q), k = ST.step;
    const alts = pairs((k === 0 ? q.a.join("") : "") + ((q.x && q.x[k / 2]) || ""));
    put(p); ST.mark = { p, ok: true };
    const my = ++ST.busy;
    if (name === line[k]) {
      ST.step++;
      if (ST.step >= line.length) return end(true);
      ST.wait = 1; say(`<b class="ts-ok">ถูกทาง!</b> อีกฝ่ายตอบ…`); draw();
      await wait(450); if (my !== ST.busy) return;
      put(b.pt(...c2(line[ST.step]))); ST.step++; ST.wait = 0; ST.mark = null;
      say(`<b class="ts-ok">ถูกทาง!</b> อีกฝ่ายตอบแล้ว ${q.t === "B" ? "ดำ" : "ขาว"}เดินต่อ (เหลืออีก ${(line.length - ST.step + 1) / 2} ตา)`); draw();
      return;
    }
    // another move the network rates as good as the line's counts as solved, after one reply
    const ok = alts.includes(name);
    if (!ok) { ST.mark = { p, ok: false }; say(`<b class="ts-ng">ยังไม่ใช่</b> ดูว่าอีกฝ่ายจะตอบยังไง…`); }
    ST.wait = 1; draw();
    const r = await replyTo(); if (my !== ST.busy) return;
    if (r !== null) { put(r); if (!ok) ST.mark.reply = r; }
    end(ok, ok);
  }
  // the end of a problem: up a level, or back to 10 kyu
  function end(won, other) {
    const g = load(), was = g.lvl;
    ST.done = won ? 1 : 0; ST.failed = won ? 0 : 1; ST.wait = 0;
    if (won) { g.solved++; g.lvl = Math.min(TOP, g.lvl + 1); g.best = Math.max(g.best, g.lvl); }
    else g.lvl = 0;
    store(g);
    if (won) say(`<b class="ts-ok">ถูกต้อง!</b> ${other ? "ตานี้ก็ได้ผลเหมือนกับเฉลย " : ""}` + (was === TOP ? "ระดับ 4 ดั้งแล้ว สุดยอดมาก ลองข้อต่อไปที่ 4 ดั้งอีกนะ" : `ขึ้นเป็น <b>${LEVELS[g.lvl]}</b>`));
    else say(`<b class="ts-ng">ผิด</b> อีกฝ่ายตอบแบบนี้แล้วเราเสียเปรียบ ${was ? "ต้องกลับไปเริ่มที่ <b>10 คิว</b> ใหม่" : "ลองข้อต่อไปที่ 10 คิวนะ"} กด "ดูเฉลย" เพื่อดูวิธีที่ถูกได้`);
    $("tsNext").textContent = `ข้อต่อไป (${LEVELS[g.lvl]}) →`; $("tsNext").hidden = false; $("tsAns").hidden = false;
    draw();
  }
  // the opponent's answer off the line: the network's favourite point inside the problem area
  async function replyTo() {
    const ai = api.ai && api.ai(); if (!ai) return null;
    try {
      const ev = await ai.evaluate(19, ST.moves, ST.q.k === undefined ? 7.5 : ST.q.k), { x0, x1, y0, y1 } = ST.crop;
      let best = null, bp = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * 19 + x; if (ev.legal[i] && ev.policy[i] > bp) { bp = ev.policy[i]; best = ST.b.pt(x, y); } }
      return best;
    } catch (e) { return null; }
  }
  // the answer is played out move by move with numbers
  async function showAnswer() {
    ST.show = true;
    reset(); const my = ST.busy, line = lineOf(ST.q); ST.failed = 1; $("tsAns").hidden = true;
    ST.wait = 1; ST.nums = new Map();
    say(`เฉลย: ${ST.q.t === "B" ? "ดำ" : "ขาว"}เดินตามเลขคี่ อีกฝ่ายตอบตามเลขคู่`);
    for (let k = 0; k < line.length; k++) {
      await wait(k ? 700 : 300); if (my !== ST.busy) return;
      const p = ST.b.pt(...c2(line[k])); put(p); ST.nums.set(p, k + 1); draw();
    }
    ST.wait = 0; $("tsAns").hidden = false;
    say(`เฉลย: ${ST.q.t === "B" ? "ดำ" : "ขาว"}เดินตามเลขคี่ อีกฝ่ายตอบตามเลขคู่${ST.q.a.length > 1 ? " (ตาแรกมีจุดอื่นที่ถูกด้วย)" : ""} กด "ข้อต่อไป" เมื่อพร้อม`);
  }

  // ---------- board ----------
  function draw() {
    const b = ST.b, { x0, x1, y0, y1 } = ST.crop, s = [];
    // lines run on past the crop where the board continues, and stop at a real edge
    const lx0 = x0 === 0 ? 0 : x0 - .6, lx1 = x1 === 18 ? 18 : x1 + .6, ly0 = y0 === 0 ? 0 : y0 - .6, ly1 = y1 === 18 ? 18 : y1 + .6;
    const vx = x0 - .9, vy = y0 - .9, vw = x1 - x0 + 1.8, vh = y1 - y0 + 1.8;
    $("tsBoard").setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
    s.push(`<defs><radialGradient id="tsGb" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#5b5b5b"/><stop offset="1" stop-color="#0d0d0d"/></radialGradient>
      <radialGradient id="tsGw" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfc6b4"/></radialGradient></defs>`);
    s.push(`<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="var(--wood)"/>`);
    for (let k = y0; k <= y1; k++) s.push(`<line x1="${lx0}" y1="${k}" x2="${lx1}" y2="${k}" stroke="#4a2a12" stroke-width="${k === 0 || k === 18 ? .07 : .04}"/>`);
    for (let k = x0; k <= x1; k++) s.push(`<line x1="${k}" y1="${ly0}" x2="${k}" y2="${ly1}" stroke="#4a2a12" stroke-width="${k === 0 || k === 18 ? .07 : .04}"/>`);
    for (const a of [3, 9, 15]) for (const c of [3, 9, 15]) if (a >= x0 && a <= x1 && c >= y0 && c <= y1) s.push(`<circle cx="${a}" cy="${c}" r=".1" fill="#4a2a12"/>`);
    const { BLACK, WHITE } = api.E;
    for (const p of b.pts) {
      const c = b.color[p]; if (c !== BLACK && c !== WHITE) continue;
      const [x, y] = b.xy(p); if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      s.push(`<circle cx="${x}" cy="${y}" r=".47" fill="url(#${c === BLACK ? "tsGb" : "tsGw"})" stroke="${c === BLACK ? "#000" : "#9c917e"}" stroke-width=".02"/>`);
    }
    if (ST.nums) for (const [p, k] of ST.nums) {
      if (!b.color[p]) continue;
      const [x, y] = b.xy(p); s.push(`<text x="${x}" y="${y + .04}" class="ts-num" fill="${b.color[p] === BLACK ? "#f3ead8" : "#1a1208"}">${k}</text>`);
    } else if (ST.last != null && b.color[ST.last] && !(ST.mark && ST.mark.p === ST.last)) {
      const [x, y] = b.xy(ST.last); s.push(`<circle cx="${x}" cy="${y}" r=".16" fill="none" stroke="${b.color[ST.last] === BLACK ? "#f3ead8" : "#2a1a0b"}" stroke-width=".06"/>`);
    }
    if (ST.mark && !ST.nums) {
      const [x, y] = b.xy(ST.mark.p);
      s.push(ST.mark.ok ? `<circle cx="${x}" cy="${y}" r=".24" fill="none" stroke="#57c26b" stroke-width=".1"/>`
        : `<path d="M${x - .2} ${y - .2}L${x + .2} ${y + .2}M${x + .2} ${y - .2}L${x - .2} ${y + .2}" stroke="#e0533d" stroke-width=".1"/>`);
      if (ST.mark.reply) { const [rx, ry] = b.xy(ST.mark.reply); s.push(`<circle cx="${rx}" cy="${ry}" r=".18" fill="none" stroke="#e0533d" stroke-width=".07"/>`); }
    }
    if (ST.ghost != null && !ST.done && !ST.failed && !ST.wait && b.color[ST.ghost] === 0) {
      const [x, y] = b.xy(ST.ghost); s.push(`<circle cx="${x}" cy="${y}" r=".45" fill="url(#${b.toPlay === BLACK ? "tsGb" : "tsGw"})" opacity=".45"/>`);
    }
    $("tsBoard").innerHTML = s.join("");
    $("tsTurn").className = "ts-turn " + (ST.q.t === "B" ? "b" : "w");
  }

  function wire() {
    wired = true;
    const svg = $("tsBoard");
    const ptAt = e => {
      const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      const q = p.matrixTransform(svg.getScreenCTM().inverse()), x = Math.round(q.x), y = Math.round(q.y), c = ST.crop;
      return x < c.x0 || y < c.y0 || x > c.x1 || y > c.y1 || Math.hypot(q.x - x, q.y - y) > .5 ? null : ST.b.pt(x, y);
    };
    svg.addEventListener("click", e => { const p = ptAt(e); if (p !== null) { ST.ghost = null; tap(p); } });
    svg.addEventListener("pointermove", e => { if (e.pointerType !== "mouse" || !ST.b) return; const p = ptAt(e); if (p !== ST.ghost) { ST.ghost = p; draw(); } });
    svg.addEventListener("pointerleave", () => { if (!ST.b) return; ST.ghost = null; draw(); });
    $("tsGo").onclick = play;
    $("tsAns").onclick = showAnswer;
    $("tsNext").onclick = play;
    // leaving in the middle of a problem keeps the level (the problem counts as seen)
    $("tsBack").onclick = () => { if (ST.playing) showLadder(); else { $("tsel").hidden = true; if (api.onBack) api.onBack(); } };
  }

  api._setup = q => setupMoves(q, cropOf(q)); // for the script that works out the answer lines (src/tools)
  api._crop = cropOf;
  api.open = async () => {
    if (!wired) wire();
    $("tsel").hidden = false; $("tsPick").hidden = false; $("tsPlay").hidden = true; $("tsGo").disabled = true; $("tsGo").textContent = "กำลังโหลดโจทย์…";
    try { await fetchData(); $("tsGo").disabled = false; showLadder(); }
    catch (e) { $("tsGo").textContent = "โหลดโจทย์ไม่สำเร็จ ลองเปิดใหม่อีกครั้ง"; }
  };
  return api;
})();
