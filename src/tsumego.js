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
  // the setup stones as a move list the network understands: stones alternate, passes fill in, and the side to move comes last
  function setupMoves(b, q) {
    const { PASS } = api.E, B = pairs(q.b).map(s => b.pt(...c2(s))), W = pairs(q.w).map(s => b.pt(...c2(s)));
    const enc = lead => {
      const m = lead ? [PASS] : []; let i = 0, j = 0;
      while (i < B.length || j < W.length) { if (m.length % 2 === 0) m.push(i < B.length ? B[i++] : PASS); else m.push(j < W.length ? W[j++] : PASS); }
      if ((m.length % 2 === 0 ? "B" : "W") !== q.t) m.push(PASS);
      return m;
    };
    const ok = m => !m.some((x, k) => x === PASS && m[k - 1] === PASS);
    const m = enc(false); return ok(m) ? m : enc(true);
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
    const { Board } = api.E, q = ST.list[ST.i];
    ST.q = q; ST.crop = cropOf(q); ST.wrong = 0; ST.show = false;
    const b = new Board(19);
    ST.base = setupMoves(b, q); reset();
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
  function reset() {
    const { Board } = api.E, b = new Board(19);
    for (const m of ST.base) b.play(m);
    ST.b = b; ST.moves = ST.base.slice(); ST.mine = []; ST.done = 0; ST.mark = null; ST.busy++;
    $("tsRetry").hidden = true; draw();
  }
  function say(html) { $("tsSay").innerHTML = html; }

  async function tap(p) {
    if (ST.done || !ST.b || ST.mine.length) return;
    const b = ST.b; if (!b.isLegal(p, b.toPlay)) return;
    const [x, y] = b.xy(p), name = String.fromCharCode(97 + x, 97 + y);
    b.play(p); ST.moves.push(p); ST.mine.push(p); if (api.sound) api.sound();
    const prog = load(), id = idOf(ST.q);
    if (ST.q.a.includes(name)) {
      ST.done = 1; ST.mark = { p, ok: true };
      if (prog[id] !== 1) { prog[id] = ST.wrong || ST.show ? 2 : 1; store(prog); }
      say(`<b class="ts-ok">ถูกต้อง!</b> ${ST.wrong ? "พลาดไปก่อนแต่หาเจอจนได้" : "เก่งมาก ตอบถูกตั้งแต่ครั้งแรก"}` + (ST.i < ST.list.length - 1 ? ` กด "ข้อต่อไป" ได้เลย` : " ทำครบระดับนี้แล้ว"));
      draw(); return;
    }
    ST.wrong++; ST.mark = { p, ok: false }; draw();
    say(`<b class="ts-ng">ยังไม่ใช่</b> ดูว่าอีกฝ่ายจะตอบยังไง…`);
    const my = ++ST.busy, reply = await replyTo();
    if (my !== ST.busy) return;
    if (reply !== null) { ST.b.play(reply); ST.moves.push(reply); if (api.sound) api.sound(); ST.mark.reply = reply; draw(); }
    say(`<b class="ts-ng">ยังไม่ใช่</b> ${reply !== null ? "อีกฝ่ายตอบแบบนี้แล้วเราเสียเปรียบ " : ""}กด "ลองใหม่" แล้วหาจุดอื่นดูนะ` + (ST.wrong >= 3 ? ` หรือกด "ดูเฉลย"` : ""));
    $("tsRetry").hidden = false;
  }
  // the opponent's answer: the network's favourite point inside the problem area
  async function replyTo() {
    const ai = api.ai && api.ai(); if (!ai) return null;
    try {
      const ev = await ai.evaluate(19, ST.moves, 7.5), { x0, x1, y0, y1 } = ST.crop;
      let best = null, bp = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * 19 + x; if (ev.legal[i] && ev.policy[i] > bp) { bp = ev.policy[i]; best = ST.b.pt(x, y); } }
      return best;
    } catch (e) { return null; }
  }
  function showAnswer() {
    ST.show = true; const prog = load(), id = idOf(ST.q);
    if (!prog[id]) { prog[id] = 3; store(prog); }
    if (ST.mine.length && !ST.done) reset();
    say(`เฉลย: จุดสีเขียวคือตาที่ถูก${ST.q.a.length > 1 ? " (ถูกได้มากกว่าหนึ่งจุด)" : ""} ลองวางเองดูเพื่อจำรูปนะ`);
    draw();
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
    if (ST.mark) {
      const [x, y] = b.xy(ST.mark.p);
      s.push(ST.mark.ok ? `<circle cx="${x}" cy="${y}" r=".24" fill="none" stroke="#57c26b" stroke-width=".1"/>`
        : `<path d="M${x - .2} ${y - .2}L${x + .2} ${y + .2}M${x + .2} ${y - .2}L${x - .2} ${y + .2}" stroke="#e0533d" stroke-width=".1"/>`);
      if (ST.mark.reply) { const [rx, ry] = b.xy(ST.mark.reply); s.push(`<circle cx="${rx}" cy="${ry}" r=".18" fill="none" stroke="#e0533d" stroke-width=".07"/>`); }
    }
    if (ST.show && !ST.done) for (const a of ST.q.a) { const [x, y] = c2(a); s.push(`<circle cx="${x}" cy="${y}" r=".42" fill="#57c26b" opacity=".85"/>`); }
    if (ST.ghost != null && !ST.done && !ST.mine.length && b.color[ST.ghost] === 0) {
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
    $("tsRetry").onclick = () => { reset(); say(`ลองอีกครั้ง <b>${ST.q.t === "B" ? "ดำ" : "ขาว"}เดินก่อน</b>`); };
    $("tsAns").onclick = showAnswer;
    $("tsPrev").onclick = () => { if (ST.i > 0) { ST.i--; setProblem(); } };
    $("tsNext").onclick = () => { if (ST.i < ST.list.length - 1) { ST.i++; setProblem(); } };
    $("tsBack").onclick = () => { if (ST.lvl !== null) showPick(); else { $("tsel").hidden = true; if (api.onBack) api.onBack(); } };
  }

  api.open = async () => {
    if (!wired) wire();
    $("tsel").hidden = false; $("tsPick").hidden = false; $("tsPlay").hidden = true;
    $("tsLevels").innerHTML = `<p class="ts-dim">กำลังโหลดโจทย์…</p>`; $("tsCats").innerHTML = "";
    try { await fetchData(); showPick(); }
    catch (e) { $("tsLevels").innerHTML = `<p class="ts-dim">โหลดโจทย์ไม่สำเร็จ ลองเปิดใหม่อีกครั้ง</p>`; }
  };
  return api;
})();
