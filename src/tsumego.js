// Tsumego: life-and-death problems picked by level and by category (kill or live), one numbered problem at a time.
// Every problem carries a complete answer tree worked out ahead by an exact solver (src/tools/tsumego_solve.js): at each
// of the player's turns, every move that is proven to work, the opponent's most stubborn reply to it, and for every
// move that fails the reply that refutes it (u: moves it could not settle either way, which get no verdict). A problem is
// 3 to 7 moves long (the player's moves and the replies).
const Tsumego = (() => {
  "use strict";
  const api = {}; // the game sets api.E, api.sound(), api.onBack()
  const $ = id => document.getElementById(id);
  const CATS = [["all", "ทั้งหมด"], ["kill", "ฆ่า"], ["live", "ทำให้รอด"]];
  const GOAL = { kill: "ฆ่ากลุ่มของอีกฝ่ายให้ตาย", live: "ทำให้กลุ่มของเรารอด" };
  const KEY = "gonn.tsume4"; // { s: { problem id: 1 solved at first try, 2 solved after a miss, 3 missed and not solved yet }, lv, cat }
  const fresh0 = () => ({ s: {}, lv: 0, cat: "all" });
  const load = () => { try { const v = Object.assign(fresh0(), JSON.parse(localStorage.getItem(KEY))); if (!v.s || typeof v.s !== "object") v.s = {}; return v; } catch (e) { return fresh0(); } };
  const store = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };

  let DATA = null, loading = null, wired = false;
  const ST = { b: null, q: null, node: null, done: 0, failed: 0, wait: 0, mark: null, busy: 0, missed: false, list: [], at: 0 };

  function fetchData() {
    if (!loading) loading = fetch("tsumego.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => (DATA = d))
      .catch(e => { loading = null; throw e; });
    return loading;
  }

  // ---------- the picker: level, category, numbered problems ----------
  const listOf = (lv, cat) => DATA.p.filter(q => q.l === lv && (cat === "all" || q.c === cat));
  function showPick() {
    ST.playing = false; ST.busy++; $("tsPick").hidden = false; $("tsPlay").hidden = true; $("tsTitle").textContent = "โจทย์ฝึกอ่านหมาก";
    const g = load(), lv = Math.min(g.lv, DATA.lv.length - 1);
    $("tsLvls").innerHTML = DATA.lv.map((L, l) => {
      const all = DATA.p.filter(q => q.l === l), ok = all.filter(q => g.s[q.i] === 1 || g.s[q.i] === 2).length;
      if (!all.length) return ""; // a level with no problems yet
      return `<button data-l="${l}" class="${l === lv ? "on" : ""}"><b>${L.n}</b><small>${L.d} · ${ok}/${all.length}</small></button>`;
    }).join("");
    $("tsCats").innerHTML = CATS.map(([k, n]) => `<button data-c="${k}" class="${k === g.cat ? "on" : ""}">${n}</button>`).join("");
    const list = listOf(lv, g.cat);
    const ok1 = list.filter(q => g.s[q.i] === 1).length, ok2 = list.filter(q => g.s[q.i] === 2).length, miss = list.filter(q => g.s[q.i] === 3).length;
    $("tsStats").textContent = `${list.length} ข้อ · ถูกตั้งแต่ครั้งแรก ${ok1} · แก้ได้ทีหลัง ${ok2} · ยังไม่ผ่าน ${miss}`;
    $("tsGrid").innerHTML = list.map((q, k) => `<button data-k="${k}" class="${["", "ok", "ok2", "ng"][g.s[q.i] || 0]}" aria-label="ข้อ ${k + 1}">${k + 1}</button>`).join("");
    const next = list.findIndex(q => !g.s[q.i]);
    $("tsGo").textContent = next < 0 ? "ทำครบทุกข้อแล้ว เล่นข้อ 1 อีกครั้ง" : `เล่นข้อ ${next + 1}`;
    $("tsGo").dataset.k = Math.max(0, next);
  }
  function pickLevel(l) { const g = load(); g.lv = l; store(g); showPick(); }
  function pickCat(c) { const g = load(); g.cat = c; store(g); showPick(); }
  function start(k) {
    const g = load(); ST.list = listOf(Math.min(g.lv, DATA.lv.length - 1), g.cat); ST.at = k;
    if (ST.list[k]) play(ST.list[k]);
  }

  // ---------- one problem ----------
  const c2 = s => [s.charCodeAt(0) - 97, s.charCodeAt(1) - 97];
  const pairs = s => s.match(/../g) || [];
  const nameOf = p => String.fromCharCode(...ST.b.xy(p).map(v => 97 + v));
  // the part of the board the problem lives in, out to the edge when it is close, at least 7 points each way
  function cropOf(q) {
    let [x0, x1, y0, y1] = q.k;
    while (x1 - x0 < 6) { if (x0 > 0) x0--; if (x1 - x0 < 6 && x1 < 18) x1++; }
    while (y1 - y0 < 6) { if (y0 > 0) y0--; if (y1 - y0 < 6 && y1 < 18) y1++; }
    return { x0, x1, y0, y1 };
  }
  function play(q) {
    ST.playing = true; ST.q = q; ST.crop = cropOf(q); ST.missed = false;
    $("tsPick").hidden = true; $("tsPlay").hidden = false;
    reset();
    const L = DATA.lv[q.l];
    $("tsTitle").textContent = `${L.n} · ข้อ ${ST.at + 1}/${ST.list.length}`;
    $("tsNo").textContent = `หมวด ${q.c === "kill" ? "ฆ่า" : "ทำให้รอด"}`;
    say(`<b>${q.t === "B" ? "ดำ" : "ขาว"}เดินก่อน</b> ${GOAL[q.c]} (เฉลยยาว ${q.d} ตา: เราเดิน ${(q.d + 1) / 2} ตา อีกฝ่ายตอบ ${(q.d - 1) / 2} ตา)`);
    $("tsSrc").textContent = `จาก ${DATA.src[q.s]} ข้อ ${q.n}`;
    $("tsAns").hidden = false; $("tsRetry").hidden = true; $("tsNext").hidden = false;
    window.scrollTo(0, 0);
  }
  function reset() {
    const { Board, PASS } = api.E, b = new Board(19), q = ST.q;
    for (const [col, s] of [[1, q.b], [2, q.w]]) for (const m of pairs(s)) { b.toPlay = col; b.play(b.pt(...c2(m))); }
    b.toPlay = q.t === "B" ? 1 : 2; b.ko = PASS;
    ST.b = b; ST.node = q.a; ST.done = 0; ST.failed = 0; ST.wait = 0; ST.mark = null; ST.nums = null; ST.last = null; ST.hint = null; ST.busy++;
    draw();
  }
  function say(html) { $("tsSay").innerHTML = html; }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function put(p) { if (!ST.b.isLegal(p, ST.b.toPlay)) return false; ST.b.play(p); ST.last = p; if (api.sound) api.sound(); return true; }
  const left = () => { let n = 0, t = ST.node; while (t) { const k = Object.keys(t.w)[0], v = t.w[k]; n++; t = v ? v[1] : null; } return n; };

  async function tap(p) {
    if (ST.done || ST.failed || ST.wait || !ST.b) return;
    const b = ST.b; if (!b.isLegal(p, b.toPlay)) return;
    const name = nameOf(p), node = ST.node, v = node.w[name];
    // a move the solver could neither prove nor refute in its time: no verdict, the player tries another
    if (v === undefined && node.u && node.u.includes(name)) {
      say(`<b>ตานี้ยังตัดสินไม่ได้</b> โปรแกรมตรวจไม่ได้แน่ชัดว่าตานี้ได้ผลจริงไหม (ไม่นับว่าผิด) ลองหาตาอื่นนะ`); return;
    }
    put(p); const my = ++ST.busy;
    if (v !== undefined) {
      ST.mark = { p, ok: true };
      if (v === 0) return end(true);
      ST.wait = 1; say(`<b class="ts-ok">ถูกทาง!</b> อีกฝ่ายตอบ…`); draw();
      await wait(450); if (my !== ST.busy) return;
      put(b.pt(...c2(v[0]))); ST.node = v[1]; ST.wait = 0; ST.mark = null;
      const n = left();
      say(`<b class="ts-ok">ถูกทาง!</b> อีกฝ่ายตอบแล้ว ${ST.q.t === "B" ? "ดำ" : "ขาว"}เดินต่อ (อีก ${n} ตา)`); draw();
      return;
    }
    // a move that fails: the opponent's refutation
    ST.mark = { p, ok: false }; ST.wait = 1; say(`<b class="ts-ng">ยังไม่ใช่</b> ดูว่าอีกฝ่ายจะตอบยังไง…`); draw();
    await wait(450); if (my !== ST.busy) return;
    const r = (node.r && node.r[name]) || node.d;
    if (r && r !== "tt") { const rp = b.pt(...c2(r)); if (put(rp)) ST.mark.reply = rp; }
    end(false);
  }
  function end(won) {
    const g = load(), id = ST.q.i;
    ST.done = won ? 1 : 0; ST.failed = won ? 0 : 1; ST.wait = 0;
    if (won) { const nv = ST.missed ? 2 : 1, old = g.s[id]; g.s[id] = old && old < 3 ? Math.min(old, nv) : nv; }
    else { ST.missed = true; if (!g.s[id]) g.s[id] = 3; }
    store(g);
    if (won) say(`<b class="ts-ok">ถูกต้อง!</b> ${ST.q.c === "kill" ? "กลุ่มนี้ตายแล้ว" : "กลุ่มนี้รอดแล้ว"} ไปข้อต่อไปได้เลย`);
    else say(`<b class="ts-ng">ผิด</b> อีกฝ่ายตอบแบบนี้แล้วเราไม่สำเร็จ กด "ลองใหม่" หรือ "ดูเฉลย"`);
    $("tsRetry").hidden = won; $("tsAns").hidden = false;
    draw();
  }
  // the answer is played out move by move with numbers; the other first moves that also work get green marks
  async function showAnswer() {
    ST.show = true; reset(); const my = ST.busy; ST.failed = 1; $("tsRetry").hidden = true; ST.missed = true;
    { const g = load(); if (!g.s[ST.q.i]) { g.s[ST.q.i] = 3; store(g); } }
    ST.wait = 1; ST.nums = new Map();
    const q = ST.q, side = q.t === "B" ? "ดำ" : "ขาว";
    say(`เฉลย: ${side}เดินตามเลขคี่ อีกฝ่ายตอบตามเลขคู่`);
    let t = q.a, k = 0;
    const firsts = Object.keys(q.a.w);
    while (t) {
      const m = Object.keys(t.w)[0], v = t.w[m];
      await wait(k ? 700 : 300); if (my !== ST.busy) return;
      let p = ST.b.pt(...c2(m)); put(p); ST.nums.set(p, ++k); draw();
      if (!v) break;
      await wait(700); if (my !== ST.busy) return;
      p = ST.b.pt(...c2(v[0])); put(p); ST.nums.set(p, ++k); draw();
      t = v[1];
    }
    ST.wait = 0; ST.show = false;
    ST.hint = firsts.slice(1).map(s => ST.b.pt(...c2(s)));
    draw();
    say(`เฉลย: ${side}เดินตามเลขคี่ อีกฝ่ายตอบตามเลขคู่` + (firsts.length > 1 ? ` · ตาแรกที่ถูกมี ${firsts.length} จุด (อีก ${firsts.length - 1} จุดคือวงเขียว) ทุกจุดนับว่าถูก` : "") + ` · กด "ลองใหม่" เพื่อเล่นเอง`);
    $("tsRetry").hidden = false;
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
    if (ST.hint) for (const p of ST.hint) { const [x, y] = b.xy(p); s.push(`<circle cx="${x}" cy="${y}" r=".3" fill="none" stroke="#57c26b" stroke-width=".1"/>`); }
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
    $("tsLvls").addEventListener("click", e => { const b = e.target.closest("[data-l]"); if (b) pickLevel(+b.dataset.l); });
    $("tsCats").addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (b) pickCat(b.dataset.c); });
    $("tsGrid").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b) start(+b.dataset.k); });
    $("tsGo").onclick = () => start(+$("tsGo").dataset.k || 0);
    $("tsAns").onclick = showAnswer;
    $("tsRetry").onclick = () => { ST.show = false; reset(); say(`<b>ลองอีกครั้ง</b> ${ST.q.t === "B" ? "ดำ" : "ขาว"}เดินก่อน ${GOAL[ST.q.c]}`); $("tsRetry").hidden = true; };
    $("tsNext").onclick = () => { if (ST.at + 1 < ST.list.length) { ST.at++; play(ST.list[ST.at]); } else showPick(); };
    $("tsBack").onclick = () => { if (ST.playing) showPick(); else { $("tsel").hidden = true; if (api.onBack) api.onBack(); } };
  }

  api._state = () => ST; // for tests
  api.open = async () => {
    if (!wired) wire();
    $("tsel").hidden = false; $("tsPick").hidden = false; $("tsPlay").hidden = true; $("tsGo").disabled = true; $("tsGo").textContent = "กำลังโหลดโจทย์…";
    try { await fetchData(); $("tsGo").disabled = false; showPick(); }
    catch (e) { $("tsGo").textContent = "โหลดโจทย์ไม่สำเร็จ ลองเปิดใหม่อีกครั้ง"; }
  };
  return api;
})();
