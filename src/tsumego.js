// Tsumego: problems by category and level (10 kyu to 4 dan), answered by the first move.
// The problems come from tsumego.json (positions and book answers); a wrong move gets the opponent's reply from the
// network's policy inside the problem's corner, so the player sees why it fails.
const Tsumego = (() => {
  "use strict";
  const api = {}; // the game sets api.E, api.ai() (the GoNNAI in use or null), api.sound(), api.onBack()
  const $ = id => document.getElementById(id);
  const CATS = [
    { id: "life", t: "เป็น-ตาย", s: "ทำให้กลุ่มรอด หรือฆ่ากลุ่มฝ่ายตรงข้าม" },
    { id: "capture", t: "จับกิน", s: "ไล่จับ ตาข่าย ตีกลับ แข่งกินลมหายใจ" },
    { id: "connect", t: "ต่อ-ตัด", s: "เชื่อมกลุ่มตัวเอง ตัดกลุ่มคู่ต่อสู้ หนีออก" },
    { id: "tesuji", t: "ทีเด็ด", s: "ท่าไม้ตาย (tesuji) ที่ดูไม่ออกในแวบแรก" },
    { id: "endgame", t: "เอนเกม", s: "ปิดเขตให้ได้แต้มมากที่สุดช่วงท้ายเกม" }
  ];
  const LEVELS = ["10 คิว", "9 คิว", "8 คิว", "7 คิว", "6 คิว", "5 คิว", "4 คิว", "3 คิว", "2 คิว", "1 คิว", "1 ดั้ง", "2 ดั้ง", "3 ดั้ง", "4 ดั้ง"];
  const KEY = "gonn.tsume"; // { problem id: 1 solved first try, 2 solved, 3 answer seen }
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const store = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };

  let DATA = null, loading = null, wired = false;
  const ST = { cat: "life", lvl: null, list: [], i: 0, b: null, base: null, moves: [], mine: [], wrong: 0, done: 0, show: false, mark: null, busy: 0 };

  function fetchData() {
    if (!loading) loading = fetch("tsumego.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => (DATA = d))
      .catch(e => { loading = null; throw e; });
    return loading;
  }
  const idOf = q => DATA.src[q.s] + "#" + q.n;
  const ofLevel = (cat, l) => DATA.p.filter(q => q.c === cat && q.l === l);

  // ---------- picker: categories and levels ----------
  function showPick() {
    ST.lvl = null; $("tsPick").hidden = false; $("tsPlay").hidden = true; $("tsTitle").textContent = "โจทย์ฝึกอ่านหมาก";
    const prog = load();
    $("tsCats").innerHTML = CATS.map(c => `<button class="ts-cat" data-cat="${c.id}" aria-pressed="${c.id === ST.cat}">${c.t}</button>`).join("");
    const cat = CATS.find(c => c.id === ST.cat);
    $("tsCatInfo").textContent = cat.s;
    $("tsLevels").innerHTML = LEVELS.map((name, l) => {
      const qs = ofLevel(ST.cat, l); if (!qs.length) return "";
      const ok = qs.filter(q => prog[idOf(q)] === 1 || prog[idOf(q)] === 2).length;
      return `<button class="ts-lvl${ok === qs.length ? " full" : ""}" data-l="${l}"><b>${name}</b><span>${ok} / ${qs.length}</span><i style="width:${ok / qs.length * 100}%"></i></button>`;
    }).join("");
    window.scrollTo(0, 0);
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
  function openLevel(l) {
    ST.lvl = l; ST.list = ofLevel(ST.cat, l);
    const prog = load(), first = ST.list.findIndex(q => !prog[idOf(q)]);
    ST.i = first < 0 ? 0 : first;
    $("tsPick").hidden = true; $("tsPlay").hidden = false;
    setProblem();
  }
  function setProblem() {
    const q = ST.list[ST.i];
    ST.q = q; ST.crop = cropOf(q); ST.wrong = 0; ST.show = false;
    ST.base = setupMoves(q, ST.crop); reset();
    const cat = CATS.find(c => c.id === ST.cat);
    $("tsTitle").textContent = `${cat.t} · ${LEVELS[ST.lvl]}`;
    $("tsNo").textContent = `ข้อ ${ST.i + 1} / ${ST.list.length}`;
    $("tsPrev").disabled = ST.i === 0; $("tsNext").disabled = ST.i === ST.list.length - 1;
    const prog = load()[idOf(q)];
    say(`<b>${q.t === "B" ? "ดำ" : "ขาว"}เดินก่อน</b> ${hintOf(ST.cat)}` + (prog === 1 || prog === 2 ? `<span class="ts-dim">ข้อนี้คุณเคยทำได้แล้ว</span>` : ""));
    const src = DATA.src[q.s]; // Lee Changho's volumes are named by chapter only
    $("tsSrc").textContent = `จาก ${/^\d/.test(src) ? "Lee Changho Tesuji · " + src : src} ข้อ ${q.n}`;
    window.scrollTo(0, 0);
  }
  const hintOf = cat => ({ life: "หาจุดที่ทำให้รอด หรือทำให้อีกฝ่ายตาย", capture: "หาตาที่จับกินหมากได้", connect: "หาตาที่ต่อหรือตัดได้สำเร็จ",
    tesuji: "หาท่าไม้ตายที่ได้ผลที่สุด", endgame: "หาตาปิดเขตที่ได้แต้มมากที่สุด" })[cat];
  // the answer line (q.m: the player's move, the opponent's reply, ... as point names), the other moves the network
  // rates as just as good at each of the player's turns (q.x), and the komi that makes the framed position even (q.k)
  const lineOf = q => pairs(q.m || q.a[0]);
  function reset(step = 0) {
    const { Board } = api.E, b = new Board(19), line = lineOf(ST.q);
    for (const m of ST.base) b.play(m);
    ST.moves = ST.base.slice();
    for (let k = 0; k < step; k++) { const p = b.pt(...c2(line[k])); b.play(p); ST.moves.push(p); }
    ST.b = b; ST.step = step; ST.done = 0; ST.failed = 0; ST.wait = 0; ST.mark = null; ST.nums = null; ST.busy++;
    ST.last = step ? b.pt(...c2(line[step - 1])) : null;
    $("tsRetry").hidden = true; draw();
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
      if (ST.step >= line.length) { // the line ends on our move: the opponent still answers, from the network
        ST.wait = 1; draw(); await wait(300);
        const r = await replyTo(); if (my !== ST.busy) return;
        if (r !== null) put(r);
        return solved(r !== null);
      }
      ST.wait = 1; say(`<b class="ts-ok">ถูกทาง!</b> อีกฝ่ายตอบ…`); draw();
      await wait(450); if (my !== ST.busy) return;
      put(b.pt(...c2(line[ST.step]))); ST.step++; ST.wait = 0; ST.mark = null;
      if (ST.step >= line.length) return solved(true);
      say(`<b class="ts-ok">ถูกทาง!</b> อีกฝ่ายตอบแล้ว ${q.t === "B" ? "ดำ" : "ขาว"}เดินต่อ หาตาต่อไปให้เจอ`); draw();
      return;
    }
    if (alts.includes(name)) {
      ST.wait = 1; draw();
      const r = await replyTo(); if (my !== ST.busy) return;
      if (r !== null) put(r);
      return solved(false, true);
    }
    ST.wrong++; ST.mark = { p, ok: false }; ST.wait = 1; draw();
    say(`<b class="ts-ng">ยังไม่ใช่</b> ดูว่าอีกฝ่ายจะตอบยังไง…`);
    const reply = await replyTo();
    if (my !== ST.busy) return;
    if (reply !== null) { put(reply); ST.mark.reply = reply; }
    ST.wait = 0; ST.failed = 1; draw();
    say(`<b class="ts-ng">ยังไม่ใช่</b> ${reply !== null ? "อีกฝ่ายตอบแบบนี้แล้วเราเสียเปรียบ " : ""}กด "ลองใหม่" แล้วหาจุดอื่นดูนะ` + (ST.wrong >= 3 ? ` หรือกด "ดูเฉลย"` : ""));
    $("tsRetry").hidden = false;
  }
  function solved(theyGaveUp, other) {
    const prog = load(), id = idOf(ST.q);
    ST.done = 1; ST.wait = 0;
    if (!ST.show && prog[id] !== 1) { prog[id] = ST.wrong ? 2 : 1; store(prog); }
    const why = other ? "ตานี้ก็ได้ผลเหมือนกับเฉลย" : theyGaveUp ? "อีกฝ่ายหมดทางสู้แล้ว" : ST.wrong ? "พลาดไปก่อนแต่หาเจอจนได้" : "เก่งมาก ตอบถูกตั้งแต่ครั้งแรก";
    say(`<b class="ts-ok">ถูกต้อง!</b> ${why}` + (ST.i < ST.list.length - 1 ? ` กด "ข้อต่อไป" ได้เลย` : " ทำครบระดับนี้แล้ว"));
    $("tsRetry").hidden = false; draw();
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
    ST.show = true; const prog = load(), id = idOf(ST.q);
    if (!prog[id]) { prog[id] = 3; store(prog); }
    reset(); const my = ST.busy, line = lineOf(ST.q);
    ST.wait = 1; ST.nums = new Map();
    say(`เฉลย: ${ST.q.t === "B" ? "ดำ" : "ขาว"}เดินตามเลขคี่ อีกฝ่ายตอบตามเลขคู่`);
    for (let k = 0; k < line.length; k++) {
      await wait(k ? 700 : 300); if (my !== ST.busy) return;
      const p = ST.b.pt(...c2(line[k])); put(p); ST.nums.set(p, k + 1); draw();
    }
    ST.wait = 0; ST.failed = 1; $("tsRetry").hidden = false;
    say(`เฉลย: ${ST.q.t === "B" ? "ดำ" : "ขาว"}เดินตามเลขคี่ อีกฝ่ายตอบตามเลขคู่${ST.q.a.length > 1 ? " (ตาแรกมีจุดอื่นที่ถูกด้วย)" : ""} กด "ลองใหม่" เพื่อลองเล่นเองนะ`);
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
    $("tsCats").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (!b) return; ST.cat = b.dataset.cat; showPick(); });
    $("tsLevels").addEventListener("click", e => { const b = e.target.closest("[data-l]"); if (!b) return; openLevel(+b.dataset.l); });
    // after a wrong move: back to just before it; after the answer or a solved problem: from the start
    $("tsRetry").onclick = () => { const k = ST.failed && !ST.nums ? ST.step : 0; reset(k); say(k ? `ลองอีกครั้ง หาตาต่อไปของ${ST.q.t === "B" ? "ดำ" : "ขาว"}` : `ลองอีกครั้ง <b>${ST.q.t === "B" ? "ดำ" : "ขาว"}เดินก่อน</b>`); };
    $("tsAns").onclick = showAnswer;
    $("tsPrev").onclick = () => { if (ST.i > 0) { ST.i--; setProblem(); } };
    $("tsNext").onclick = () => { if (ST.i < ST.list.length - 1) { ST.i++; setProblem(); } };
    $("tsBack").onclick = () => { if (ST.lvl !== null) showPick(); else { $("tsel").hidden = true; if (api.onBack) api.onBack(); } };
  }

  api._setup = q => setupMoves(q, cropOf(q)); // for the script that works out the answer lines (src/tools)
  api._crop = cropOf;
  api.open = async () => {
    if (!wired) wire();
    $("tsel").hidden = false; $("tsPick").hidden = false; $("tsPlay").hidden = true;
    $("tsLevels").innerHTML = `<p class="ts-dim">กำลังโหลดโจทย์…</p>`; $("tsCats").innerHTML = "";
    try { await fetchData(); showPick(); }
    catch (e) { $("tsLevels").innerHTML = `<p class="ts-dim">โหลดโจทย์ไม่สำเร็จ ลองเปิดใหม่อีกครั้ง</p>`; }
  };
  return api;
})();
