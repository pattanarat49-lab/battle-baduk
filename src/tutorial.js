// Tutorial ("คัมภีร์สอนเล่น"): step-by-step lessons on a 9x9 board for people who have never played.
// Uncle Win teaches, Mek asks the beginner's questions. Self-contained: its own tiny rules board, no AI.
const Tutorial = (function () {
  const N = 9, KOMI = 7.5;
  const FACE = { win: "chars/win_face.jpg", mek: "chars/mek_face.jpg" };
  const NAME = { win: "UNCLE WIN · ลุงวิน", mek: "MEK · เมฆ" };
  const P = s => (N - parseInt(s.slice(1), 10)) * N + (s.charCodeAt(0) - 97); // "e5" -> index, row 1 at the bottom
  const L = s => s ? s.trim().split(/\s+/).map(P) : [];
  function nbs(i) { const x = i % N, y = (i / N) | 0, r = []; if (x > 0) r.push(i - 1); if (x < N - 1) r.push(i + 1); if (y > 0) r.push(i - N); if (y < N - 1) r.push(i + N); return r; }

  class TBoard {
    constructor() { this.a = new Int8Array(N * N); this.ko = -1; }
    group(i) {
      const c = this.a[i], seen = new Set([i]), st = [i], libs = new Set();
      while (st.length) { const j = st.pop(); for (const k of nbs(j)) { if (this.a[k] === 0) libs.add(k); else if (this.a[k] === c && !seen.has(k)) { seen.add(k); st.push(k); } } }
      return { stones: [...seen], libs };
    }
    play(c, i) {
      if (this.a[i]) return { ok: false, why: "occupied" };
      if (i === this.ko) return { ok: false, why: "ko" };
      this.a[i] = c; const cap = [];
      for (const k of nbs(i)) if (this.a[k] === 3 - c) { const g = this.group(k); if (g.libs.size === 0) for (const s of g.stones) if (this.a[s]) { this.a[s] = 0; cap.push(s); } }
      const me = this.group(i);
      if (me.libs.size === 0) { this.a[i] = 0; return { ok: false, why: "suicide" }; }
      this.ko = cap.length === 1 && me.stones.length === 1 && me.libs.size === 1 ? cap[0] : -1;
      return { ok: true, cap };
    }
    // area scoring: each empty region bordered by one colour only belongs to that colour
    area() {
      const own = new Int8Array(N * N), seen = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) {
        if (this.a[i] || seen[i]) continue;
        const reg = [i], st = [i]; let border = 0; seen[i] = 1;
        while (st.length) { const j = st.pop(); for (const k of nbs(j)) { if (this.a[k]) border |= this.a[k]; else if (!seen[k]) { seen[k] = 1; reg.push(k); st.push(k); } } }
        if (border === 1 || border === 2) for (const r of reg) own[r] = border;
      }
      return own;
    }
  }

  // a finished 9x9 game used for the goal, territory and counting steps (Black 45, White 36 + 7.5)
  const FINAL = { b: "e9 e8 e7 f6 f5 e4 e3 d2 d1 c6 b3", w: "f9 f8 f7 g6 g5 f4 f3 e2 e1 h7 g2" };

  const CH = ["เริ่มต้น", "ลมหายใจ", "การกิน", "จุดห้ามลง", "ตากับความเป็นตาย", "นับแต้ม"];
  const STEPS = [
    { ch: 0, mek: "ลุงครับ ผมไม่เคยเล่นโกะมาก่อนเลย จะเข้าใจไหมเนี่ย",
      say: "สบายมากหลาน กติกาโกะมีไม่กี่ข้อ ง่ายกว่าหมากฮอสอีก วันนี้ลุงสอนบนกระดานเล็ก <b>9×9</b> ก่อน กด <b>ต่อไป</b> ได้เลย" },
    { ch: 0, setup: { b: "c7 e5 g3", w: "g7 c3" },
      say: "หมากโกะวางบน<b>จุดตัดของเส้น</b> ไม่ได้วางในช่องแบบหมากฮอส วางแล้ว<b>อยู่ตรงนั้นตลอด</b> ไม่เดินไปไหน จนกว่าจะโดนกิน" },
    { ch: 0, say: "ฝ่าย<b>ดำเดินก่อน</b> แล้วผลัดกันวางทีละเม็ด ลองแตะกระดานวางหมากดำสักเม็ดสิ ตรงไหนก็ได้",
      task: { type: "any", hint: "แตะจุดตัดตรงไหนก็ได้ เพื่อวางหมากดำ", ok: "ดีมาก แล้วลุงถือขาววางตอบ ผลัดกันแบบนี้ไปเรื่อยๆ ตาละเม็ด" } },
    { ch: 0, setup: FINAL, shade: true,
      say: "เป้าหมายของเกมคือ<b>ล้อมพื้นที่</b>ให้ได้มากกว่าอีกฝ่าย ช่องที่มีสี่เหลี่ยมเล็กๆ คือพื้นที่ที่แต่ละฝ่ายล้อมไว้ ใครได้มากกว่าชนะ",
      mek: "อ้าว ไม่ใช่แข่งกันกินให้หมดกระดานเหรอครับ" },

    { ch: 1, setup: { b: "e5" }, marks: { lib: "d5 f5 e4 e6" },
      say: "จุดว่างที่อยู่<b>ติดกับหมากตรงๆ</b> ทั้งบน ล่าง ซ้าย ขวา เรียกว่า<b>ลมหายใจ</b> หมากเม็ดนี้มี 4 ลมหายใจ (วงสีส้ม) ส่วนแนวทแยงไม่นับนะหลาน" },
    { ch: 1, setup: { b: "a9 e1 e5" }, autoLibs: "a9 e1 e5",
      say: "ถ้าอยู่<b>ริมกระดาน</b> ลมหายใจเหลือ 3 ถ้าอยู่<b>มุม</b> เหลือแค่ 2 ยิ่งชิดขอบยิ่งหายใจน้อย โดนล้อมได้ง่าย" },
    { ch: 1, setup: { b: "d5 e5" }, autoLibs: "d5", mek: "แล้วถ้าหมากอยู่ติดกันล่ะครับ",
      say: "หมากสีเดียวกันที่ติดกันตรงๆ จะรวมเป็น<b>กลุ่มเดียว</b> ใช้ลมหายใจร่วมกัน สองเม็ดนี้มี 6 ลมหายใจ ต่อกันแล้วแข็งแรงขึ้น" },
    { ch: 1, setup: { w: "d5 e5 e6", b: "c5 e4" },
      say: "ลองดูนะ แตะ<b>ลมหายใจทุกจุด</b>ของกลุ่มหมากขาวนี้ จุดที่มีหมากดำอยู่แล้วไม่นับ",
      task: { type: "libs", of: "e5", hint: "แตะจุดว่างที่ติดกับหมากขาวตรงๆ", ok: "เก่ง! ครบ 5 จุดเลย ลมหายใจที่ดำปิดไว้แล้วไม่นับ", bad: "จุดนั้นไม่ใช่ลมหายใจของขาวนะ ต้องติดกับหมากขาวตรงๆ ไม่ใช่แนวทแยง" } },

    { ch: 2, setup: { w: "e5", b: "e6 d5 f5" },
      say: "ถ้าลมหายใจของหมาก<b>ถูกปิดหมด</b> หมากนั้นจะโดน<b>กิน</b> แล้วยกออกจากกระดาน หมากขาวเม็ดนี้เหลือลมหายใจเดียว กด ▶ ดูนะ",
      seq: [{ c: 1, at: "e4", say: "ดำปิดลมหายใจสุดท้าย ขาวโดนกิน ยกออกไปเลย" }] },
    { ch: 2, setup: { w: "c4", b: "b4 c5 d4" },
      say: "ตาหลานแล้ว ลองกินหมากขาวเม็ดนี้ดู",
      task: { type: "capture", min: 1, ans: "c3", hint: "หาลมหายใจสุดท้ายของขาวแล้ววางปิด", ok: "เสร็จหลาน! กินได้กินเลย เหมือนหมากฮอสนั่นแหละ", bad: "ยังไม่โดนกินนะ หาจุดว่างที่ติดกับหมากขาวดู" } },
    { ch: 2, setup: { w: "e1", b: "d1 f1" },
      say: "หมากที่<b>ริมกระดาน</b>กินง่ายกว่า เพราะลมหายใจน้อย ลองกินเม็ดนี้",
      task: { type: "capture", min: 1, ans: "e2", hint: "หมากริมขอบมีลมหายใจแค่ 3 จุด ดำปิดไปแล้ว 2", ok: "ใช่เลย ริมขอบมีแค่ 3 ลมหายใจ ปิดง่ายมาก", bad: "ยังไม่โดนกินนะ ขาวยังหายใจได้อีกทาง" } },
    { ch: 2, setup: { w: "d5 e5", b: "c5 d6 e6 f5 d4" },
      say: "<b>กลุ่ม</b>ก็โดนกินได้ทั้งกลุ่ม ถ้าปิดลมหายใจครบทุกจุด ลองกินขาวสองเม็ดนี้",
      task: { type: "capture", min: 2, ans: "e4", hint: "กลุ่มนี้เหลือลมหายใจจุดเดียว", ok: "กินได้ทีเดียว 2 เม็ด!", bad: "ยังไม่โดนกินนะ กลุ่มขาวยังเหลือลมหายใจอยู่" } },
    { ch: 2, setup: { b: "e5", w: "e6 d5 f5" }, marks: { lib: "e4" },
      say: "หมากที่เหลือลมหายใจเดียวเรียกว่าโดน<b>อาตาริ</b> คือโดนขู่ว่าจะกิน ตอนนี้ดำโดนอาตาริอยู่ ลองช่วยให้รอด",
      task: { type: "escape", of: "e5", hint: "ต่อหมากออกไปทางที่ยังว่าง", ok: "รอดแล้ว! ต่อออกไปทางที่ว่าง ลมหายใจเพิ่มเป็น 3", bad: "เห็นไหม ขาวกินดำได้เลย ลองต่อหมากจากเม็ดที่โดนขู่ดู" } },

    { ch: 3, setup: { w: "d5 f5 e4 e6" }, marks: { x: "e5" },
      say: "จุดที่ถูกหมากฝ่ายตรงข้ามล้อมจนไม่มีลมหายใจ <b>ลงไม่ได้</b> เพราะเป็นการ<b>ฆ่าตัวตาย</b> ลองแตะจุดกากบาทดู",
      task: { type: "illegal", c: 1, at: "e5", hint: "แตะจุดที่มีกากบาท", ok: "เห็นไหม ลงไม่ได้ เพราะวางปุ๊บก็ไม่มีลมหายใจเลย", bad: "ลองแตะจุดที่มีกากบาทสีส้มดูนะ" } },
    { ch: 3, setup: { w: "a2 b1", b: "a3 b2 c1" },
      say: "แต่มีข้อยกเว้น ถ้าลงแล้ว<b>กินหมากอีกฝ่ายได้</b> ลงได้ เพราะพอยกหมากที่โดนกินออกก็มีลมหายใจทันที ลองหาจุดนั้นดู",
      task: { type: "capture", min: 2, ans: "a1", hint: "ดูที่มุมกระดาน", ok: "ใช่เลย! จุดมุมดูเหมือนห้ามลง แต่ลงแล้วกินขาวได้ 2 เม็ด เลยลงได้", bad: "ยังไม่โดนกินนะ ขาวสองเม็ดนี้เหลือลมหายใจร่วมกันจุดเดียว" } },
    { ch: 3, setup: { w: "f6 g5 f4 e5", b: "e6 d5 e4" }, mek: "เอ๊ะ แบบนี้ก็กินกันไปกินกันมาไม่จบสิครับ",
      say: "นั่นแหละที่มากติกา<b>โค</b> กด ▶ ดูทีละตา",
      seq: [
        { c: 1, at: "f5", say: "ดำลงกินขาว 1 เม็ด" },
        { marks: { x: "e5" }, say: "ขาวอยากกินคืน<b>ทันที</b>ที่จุดกากบาท แต่<b>ห้าม</b> ไม่งั้นจะกินกันวนไปมา กติกานี้เรียกว่า<b>โค</b>" },
        { c: 2, at: "c7", say: "ขาวต้องไปลงที่อื่นก่อน 1 ตา" },
        { c: 1, at: "h2", say: "ดำตอบที่อื่น (ถ้าดำลงปิดจุดโคก็จบเรื่อง)" },
        { c: 2, at: "e5", say: "ผ่านไปหนึ่งตาแล้ว ตอนนี้ขาวกินคืนได้" }
      ] },

    { ch: 4, setup: { b: "d6 e6 f6 d5 f5 d4 e4 f4", w: "c7 d7 e7 f7 g7 c6 g6 c5 g5 c4 g4 c3 d3 e3 f3 g3" },
      say: "ช่องว่างที่ล้อมด้วยหมากเราเรียกว่า<b>ตา</b> กลุ่มดำนี้มี<b>ตาเดียว</b> ข้างนอกโดนขาวล้อมหมดแล้ว กด ▶ ดูว่าจะเกิดอะไรขึ้น",
      seq: [{ c: 2, at: "e5", say: "ขาวลงในตา ปิดลมหายใจสุดท้าย กินดำทั้งกลุ่ม 8 เม็ด! ตาเดียวไม่พอ" }] },
    { ch: 4, setup: { b: "c6 d6 e6 f6 g6 c5 e5 g5 c4 d4 e4 f4 g4", w: "b7 c7 d7 e7 f7 g7 h7 b6 h6 b5 h5 b4 h4 b3 c3 d3 e3 f3 g3 h3" },
      say: "กลุ่มนี้มี<b>สองตา</b> ลองเป็นฝ่ายขาว แตะลงในตาของดำดูสิ",
      task: { type: "illegal", c: 2, at: "d5 f5", hint: "แตะช่องว่างที่ดำล้อมไว้ (ตอนนี้หลานถือขาว)", ok: "ลงไม่ได้ใช่ไหม ลงตาไหนก็เป็นการฆ่าตัวตาย เพราะดำยังเหลืออีกตา กลุ่มที่มี<b>สองตาจะไม่มีวันตาย</b>", bad: "ลองแตะในช่องว่างที่ดำล้อมไว้นะ" } },
    { ch: 4, setup: { b: "c1 c2 d2 e2 f2 g2 g1", w: "b1 b2 c3 d3 e3 f3 g3 h2 h1" },
      say: "ทีนี้ลองทำสองตาเอง กลุ่มดำมีช่องว่าง 3 ช่องเรียงกัน ลงตรงไหนถึงจะแบ่งเป็นสองตา",
      task: { type: "target", at: "e1", hint: "แบ่งช่องว่าง 3 ช่องให้เป็นสองส่วน", ok: "ถูกต้อง! ลงตรงกลางแบ่งเป็นสองตา ดำรอดแน่นอน", bad: "ถ้าลงตรงนั้นจะเหลือตาเดียว ขาวลงตรงกลางทีหลังก็ฆ่าได้ ลองใหม่" } },
    { ch: 4, setup: { w: "c1 c2 d2 e2 f2 g2 g1", b: "b1 b2 c3 d3 e3 f3 g3 h2 h1" },
      say: "กลับกัน ถ้าเป็นกลุ่ม<b>ขาว</b> เราลงจุดเดียวกันก็<b>ฆ่า</b>ได้ ลองดู",
      task: { type: "target", at: "e1", hint: "จุดเดียวกับข้อที่แล้ว", ok: "เยี่ยม! ขาวทำสองตาไม่ได้แล้ว กลุ่มนี้ตาย จำไว้ว่า<b>จุดกลางคือจุดตาย</b> ทั้งของเราและของเขา", bad: "ลงตรงนั้นขาวจะลงตรงกลางแล้วได้สองตานะ ลองใหม่" } },

    { ch: 5, setup: FINAL, shade: true, mek: "แล้วเกมจบตอนไหนครับ",
      say: "เมื่อไม่มีที่ให้ลงที่ได้ประโยชน์แล้ว ทั้งสองฝ่ายกด<b>ผ่าน</b>ติดกัน เกมก็จบ ถ้ามีหมากที่ตายอยู่ในเขตคนอื่น ยกออกก่อนนับ" },
    { ch: 5, setup: FINAL, shade: true, score: true,
      say: "เกมนี้ใช้<b>กติกาจีน</b> นับ<b>หมากบนกระดาน + ช่องที่ล้อมไว้</b> แล้วขาวได้แต้มต่อ<b>โคมิ 7.5</b> เพราะดำได้เดินก่อน ลองทายดูว่าใครชนะ",
      task: { type: "choice", opts: ["ดำชนะ", "ขาวชนะ"], ans: 0, hint: "ดูตัวเลขรวมด้านบน", ok: "ถูกต้อง ดำชนะ 1.5 แต้ม ส่วน .5 ของโคมิทำให้ไม่มีเสมอ", bad: "ลองดูอีกที ขาวได้บวกโคมิแล้วยังน้อยกว่าดำอยู่นะ" } },
    { ch: 5, setup: FINAL, recap: true, mek: "ลุงครับ สรุปให้ผมหน่อย",
      say: "ได้เลย จำแค่นี้ก็เล่นได้แล้ว ไปลองเล่นจริงกับเมฆบนกระดาน 9×9 ดู ลุงเชียร์อยู่ตรงนี้" }
  ];

  const $ = id => document.getElementById(id);
  const api = { onHome: null, onPlay: null };
  const ST = { idx: 0, b: null, marks: {}, found: new Set(), done: false, tries: 0, lock: false, seq: 0, last: -1, gone: [], miss: -1, ghost: -1, mood: "", say: null, timers: [] };
  const later = (fn, ms) => ST.timers.push(setTimeout(fn, ms));
  const remember = n => { try { localStorage.setItem("gonn.tutStep", String(n)); } catch (e) {} };
  const recall = () => { try { return Math.min(STEPS.length - 1, Math.max(0, parseInt(localStorage.getItem("gonn.tutStep") || "0", 10) || 0)); } catch (e) { return 0; } };

  function marksOf(st) { const m = {}; for (const k in (st.marks || {})) m[k] = L(st.marks[k]); return m; }
  function load(n, keepTries) {
    ST.timers.forEach(clearTimeout); ST.timers = [];
    const st = STEPS[n]; ST.idx = n; ST.b = new TBoard();
    for (const i of L(st.setup && st.setup.b)) ST.b.a[i] = 1;
    for (const i of L(st.setup && st.setup.w)) ST.b.a[i] = 2;
    ST.marks = marksOf(st);
    if (st.autoLibs) ST.marks.lib = L(st.autoLibs).flatMap(i => [...ST.b.group(i).libs]);
    ST.found = new Set(); ST.done = false; ST.seq = 0; ST.last = -1; ST.gone = []; ST.miss = -1; ST.mood = ""; ST.say = null; ST.lock = false;
    if (!keepTries) ST.tries = 0;
    if (ST.tries >= 2 && st.task && st.task.ans) ST.marks.hint = L(st.task.ans);
    remember(n);
    render();
  }

  function taskColor() { const t = STEPS[ST.idx].task; if (!t || ST.done || ST.lock) return 0; if (["any", "capture", "escape", "target"].includes(t.type)) return 1; if (t.type === "illegal") return t.c; return 0; }
  function canTap() { const t = STEPS[ST.idx].task; return !!t && t.type !== "choice" && !ST.done && !ST.lock; }

  function drawBoard() {
    const st = STEPS[ST.idx], b = ST.b, s = [], xy = i => [i % N, (i / N) | 0];
    s.push(`<defs><radialGradient id="tuGb" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#5b5b5b"/><stop offset="1" stop-color="#0d0d0d"/></radialGradient>
      <radialGradient id="tuGw" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfc6b4"/></radialGradient></defs>`);
    s.push(`<rect x="-0.62" y="-0.62" width="9.24" height="9.24" fill="var(--wood)"/><rect x="-0.5" y="-0.5" width="9" height="9" fill="#d9a066" opacity=".35"/>`);
    for (let k = 0; k < N; k++) s.push(`<line x1="0" y1="${k}" x2="8" y2="${k}" stroke="#4a2a12" stroke-width=".04"/><line x1="${k}" y1="0" x2="${k}" y2="8" stroke="#4a2a12" stroke-width=".04"/>`);
    for (const p of L("c3 g3 c7 g7 e5")) s.push(`<circle cx="${p % N}" cy="${(p / N) | 0}" r=".09" fill="#4a2a12"/>`);
    if (st.shade) { const own = b.area(); for (let i = 0; i < N * N; i++) if (own[i]) s.push(`<rect x="${i % N - .17}" y="${((i / N) | 0) - .17}" width=".34" height=".34" fill="${own[i] === 1 ? "#141414" : "#f6f1e6"}" stroke="${own[i] === 1 ? "none" : "#7a6a55"}" stroke-width=".03"/>`); }
    for (const i of ST.marks.lib || []) if (!b.a[i]) { const [x, y] = xy(i); s.push(`<circle cx="${x}" cy="${y}" r=".2" fill="none" stroke="#c0560f" stroke-width=".07"/>`); }
    for (const i of ST.found) { const [x, y] = xy(i); s.push(`<circle cx="${x}" cy="${y}" r=".22" fill="#c0560f"/>`); }
    for (const [i, c] of ST.gone) s.push(`<circle class="tu-gone" cx="${i % N}" cy="${(i / N) | 0}" r=".47" fill="url(#${c === 1 ? "tuGb" : "tuGw"})"/>`);
    for (let i = 0; i < N * N; i++) if (b.a[i]) { const [x, y] = xy(i); s.push(`<circle cx="${x}" cy="${y}" r=".47" fill="url(#${b.a[i] === 1 ? "tuGb" : "tuGw"})" stroke="${b.a[i] === 1 ? "#000" : "#9c917e"}" stroke-width=".02"/>`); }
    if (ST.last >= 0 && b.a[ST.last]) { const [x, y] = xy(ST.last); s.push(`<circle cx="${x}" cy="${y}" r=".15" fill="none" stroke="${b.a[ST.last] === 1 ? "#f3ead8" : "#2a1a0b"}" stroke-width=".06"/>`); }
    for (const i of ST.marks.x || []) { const [x, y] = xy(i); s.push(`<g stroke="#e0581c" stroke-width=".1" stroke-linecap="round"><line x1="${x - .22}" y1="${y - .22}" x2="${x + .22}" y2="${y + .22}"/><line x1="${x + .22}" y1="${y - .22}" x2="${x - .22}" y2="${y + .22}"/></g>`); }
    for (const i of ST.marks.hint || []) { const [x, y] = xy(i); s.push(`<circle class="tu-pulse" cx="${x}" cy="${y}" r=".44" fill="none" stroke="#e0581c" stroke-width=".08" stroke-dasharray=".18 .1"/>`); }
    if (ST.miss >= 0) { const [x, y] = xy(ST.miss); s.push(`<circle class="tu-gone" cx="${x}" cy="${y}" r=".42" fill="none" stroke="#e0581c" stroke-width=".09"/>`); }
    const tc = taskColor();
    if (ST.ghost >= 0 && !b.a[ST.ghost] && tc) { const [x, y] = xy(ST.ghost); s.push(`<circle cx="${x}" cy="${y}" r=".45" fill="url(#${tc === 1 ? "tuGb" : "tuGw"})" opacity=".45" pointer-events="none"/>`); }
    $("tuBoard").innerHTML = s.join("");
    $("tuBoard").classList.toggle("locked", !canTap());
  }

  function bubble(who, html, cls) {
    return `<div class="tu-say ${who === "mek" ? "mek" : ""} ${cls || ""}"><img src="${FACE[who]}" alt="" width="160" height="160"><div><div class="tu-who">${NAME[who]}</div><div class="tu-bubble"><p>${html}</p></div></div></div>`;
  }
  function render() {
    const st = STEPS[ST.idx];
    $("tuTabs").innerHTML = CH.map((c, k) => `<button class="tu-tab" data-ch="${k}" aria-current="${k === st.ch}"><b>${k + 1}</b>${c}</button>`).join("");
    $("tuBar").style.width = ((ST.idx + 1) / STEPS.length * 100) + "%";
    $("tuCount").textContent = `${ST.idx + 1} / ${STEPS.length}`;
    $("tuTalk").innerHTML = (st.mek ? bubble("mek", st.mek) : "") + bubble("win", ST.say || st.say, ST.mood);
    let h = "";
    if (st.score) {
      const own = ST.b.area(); let bs = 0, ws = 0, bt = 0, wt = 0;
      for (let i = 0; i < N * N; i++) { if (ST.b.a[i] === 1) bs++; else if (ST.b.a[i] === 2) ws++; else if (own[i] === 1) bt++; else if (own[i] === 2) wt++; }
      h += `<div class="tu-lbl">ผลนับ</div><div class="tu-score">
        <span class="tu-dot b"></span><span>ดำ: หมาก ${bs} + พื้นที่ ${bt}</span><span class="tu-tot">${bs + bt}</span>
        <span class="tu-dot w"></span><span>ขาว: หมาก ${ws} + พื้นที่ ${wt} + โคมิ ${KOMI}</span><span class="tu-tot">${ws + wt + KOMI}</span></div>`;
    }
    if (st.seq) {
      const n = st.seq.length, end = ST.seq >= n;
      h += `<div class="tu-lbl">ตัวอย่าง</div><div class="tu-row"><button class="tu-btn pri" data-act="seq">${end ? "↺ ดูอีกครั้ง" : "▶ " + (n > 1 ? `เดินต่อ (${ST.seq + 1}/${n})` : "ดู")}</button></div>`;
    }
    if (st.task) {
      const t = st.task;
      h += `<div class="tu-lbl ${ST.done ? "done" : ""}">${ST.done ? "✓ ทำได้แล้ว" : "ลองทำ"}</div>`;
      if (!ST.done) h += `<div class="tu-meta">${t.hint}${t.type === "libs" ? ` · เจอแล้ว ${ST.found.size}/${ST.b.group(P(t.of)).libs.size}` : ""}</div>`;
      if (t.type === "choice" && !ST.done) h += `<div class="tu-row">${t.opts.map((o, k) => `<button class="tu-btn" data-opt="${k}">${o}</button>`).join("")}</div>`;
      if (t.type !== "choice") h += `<div class="tu-row"><button class="tu-btn link" data-act="redo">เริ่มข้อนี้ใหม่</button>${!ST.done && ST.tries >= 1 && t.ans && !(ST.marks.hint || []).length ? `<button class="tu-btn link" data-act="hint">ขอคำใบ้</button>` : ""}</div>`;
    }
    if (st.recap) {
      h += `<div class="tu-lbl">กติกาทั้งหมด</div><ol class="tu-recap">
        <li><b>ดำเดินก่อน</b> ผลัดกันวางบนจุดตัด ทีละเม็ด</li>
        <li>จุดว่างที่ติดตรงๆ คือ<b>ลมหายใจ</b> หมากที่ติดกันใช้ร่วมกัน</li>
        <li>ปิดลมหายใจหมด = <b>กิน</b> ยกออกจากกระดาน</li>
        <li>ห้าม<b>ฆ่าตัวตาย</b> ยกเว้นลงแล้วกินได้</li>
        <li><b>โค</b>: ห้ามกินคืนทันที ต้องไปลงที่อื่นก่อน 1 ตา</li>
        <li>กลุ่มที่มี<b>สองตา</b>ไม่มีวันตาย</li>
        <li>ผ่านติดกันสองครั้งจบเกม นับ<b>หมาก + พื้นที่</b> ขาวได้โคมิ 7.5</li></ol>
        <div class="tu-row"><button class="tu-btn pri" data-act="play">เล่นกับเมฆ 9×9</button></div>`;
    }
    $("tuTask").innerHTML = h; $("tuTask").hidden = !h;
    $("tuPrev").disabled = ST.idx === 0;
    const nx = $("tuNext"), last = ST.idx === STEPS.length - 1, pending = st.task && !ST.done;
    nx.hidden = last; nx.textContent = pending ? "ข้าม →" : "ต่อไป →";
    nx.classList.toggle("skip", !!pending); nx.classList.toggle("go", !!(st.task && ST.done));
    drawBoard();
  }

  function win(msg) { ST.done = true; ST.mood = "ok"; ST.say = msg; ST.marks.hint = []; render(); }
  function fail(msg, at) { ST.tries++; ST.mood = "bad"; ST.say = msg; ST.miss = at === undefined ? -1 : at; render(); ST.miss = -1; }
  function placed(r, i, c) { ST.last = i; ST.gone = r.cap.map(s => [s, 3 - c]); }

  function tap(i) {
    if (!canTap()) return;
    const t = STEPS[ST.idx].task, b = ST.b;
    if (t.type === "any") {
      const r = b.play(1, i); if (!r.ok) return fail("ตรงนั้นมีหมากอยู่แล้ว ลองจุดว่างนะ", i);
      placed(r, i, 1); ST.lock = true; render();
      later(() => {
        let j = (N - 1 - ((i / N) | 0)) * N + (N - 1 - i % N);
        if (b.a[j]) j = [...Array(N * N).keys()].find(k => !b.a[k] && nbs(k).length === 4);
        const w = b.play(2, j); if (w.ok) placed(w, j, 2); ST.lock = false; win(t.ok);
      }, 550);
      return;
    }
    if (t.type === "libs") {
      const libs = b.group(P(t.of)).libs;
      if (ST.found.has(i)) return;
      if (libs.has(i)) { ST.found.add(i); ST.mood = ""; ST.say = null; return ST.found.size === libs.size ? win(t.ok) : render(); }
      return fail(b.a[i] ? "ตรงนั้นมีหมากอยู่แล้ว ไม่ใช่จุดว่าง" : t.bad, i);
    }
    if (t.type === "illegal") {
      if (!L(t.at).includes(i)) return fail(t.bad, i);
      ST.marks.x = [i]; return win(t.ok);
    }
    if (t.type === "target") {
      if (b.a[i]) return fail("ตรงนั้นมีหมากอยู่แล้ว", i);
      if (!L(t.at).includes(i)) { if (ST.tries >= 1) ST.marks.hint = L(t.at); return fail(t.bad, i); }
      placed(b.play(1, i), i, 1); return win(t.ok);
    }
    if (t.type === "capture" || t.type === "escape") {
      const r = b.play(1, i);
      if (!r.ok) return fail(r.why === "suicide" ? "ตรงนั้นลงไม่ได้ ไม่มีลมหายใจ" : "ตรงนั้นมีหมากอยู่แล้ว", i);
      placed(r, i, 1);
      if (t.type === "capture" ? r.cap.length >= t.min : b.group(P(t.of)).libs.size >= 2) return win(t.ok);
      ST.lock = true; ST.tries++; ST.mood = "bad"; ST.say = t.bad; render();
      if (t.type === "escape") later(() => { const l = [...b.group(P(t.of)).libs][0]; const w = b.play(2, l); if (w.ok) placed(w, l, 2); render(); }, 500);
      later(() => { const msg = ST.say; load(ST.idx, true); ST.mood = "bad"; ST.say = msg; render(); }, t.type === "escape" ? 1900 : 1100);
    }
  }

  function stepSeq() {
    const st = STEPS[ST.idx];
    if (ST.seq >= st.seq.length) return load(ST.idx);
    const m = st.seq[ST.seq++]; ST.gone = []; ST.marks = marksOf(st);
    if (m.marks) for (const k in m.marks) ST.marks[k] = L(m.marks[k]);
    if (m.at) { const i = P(m.at), r = ST.b.play(m.c, i); if (r.ok) placed(r, i, m.c); }
    ST.say = m.say; ST.mood = ""; render();
  }

  function go(n) { if (n < 0 || n >= STEPS.length) return; load(n); window.scrollTo(0, 0); }
  let wired = false;
  function wire() {
    wired = true;
    const svg = $("tuBoard");
    const ptAt = e => {
      const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      const q = p.matrixTransform(svg.getScreenCTM().inverse()), x = Math.round(q.x), y = Math.round(q.y);
      return x < 0 || y < 0 || x >= N || y >= N || Math.hypot(q.x - x, q.y - y) > .5 ? -1 : y * N + x;
    };
    svg.addEventListener("click", e => { const i = ptAt(e); if (i >= 0) { ST.ghost = -1; tap(i); } });
    svg.addEventListener("pointermove", e => { if (e.pointerType !== "mouse") return; const i = ptAt(e); if (i !== ST.ghost) { ST.ghost = i; drawBoard(); } });
    svg.addEventListener("pointerleave", () => { ST.ghost = -1; drawBoard(); });
    $("tutor").addEventListener("click", e => {
      const t = e.target.closest("button"); if (!t || t.disabled) return;
      if (t.dataset.ch !== undefined) return go(STEPS.findIndex(s => s.ch === +t.dataset.ch));
      if (t.dataset.opt !== undefined) { const task = STEPS[ST.idx].task; return +t.dataset.opt === task.ans ? win(task.ok) : fail(task.bad); }
      const act = t.dataset.act;
      if (act === "seq") return stepSeq();
      if (act === "redo") return load(ST.idx, true);
      if (act === "hint") { ST.marks.hint = L(STEPS[ST.idx].task.ans); return render(); }
      if (act === "play") { close(); return api.onPlay && api.onPlay(); }
      if (t.id === "tuHome") { close(); return api.onHome && api.onHome(); }
      if (t.id === "tuPrev") return go(ST.idx - 1);
      if (t.id === "tuNext") return go(ST.idx + 1);
    });
    document.addEventListener("keydown", e => {
      if ($("tutor").hidden) return;
      if (e.key === "ArrowRight") go(ST.idx + 1); else if (e.key === "ArrowLeft") go(ST.idx - 1);
    });
  }
  function close() { ST.timers.forEach(clearTimeout); ST.timers = []; $("tutor").hidden = true; document.body.classList.remove("tutoring"); }
  api.open = function () {
    if (!wired) wire();
    $("tutor").hidden = false; document.body.classList.add("tutoring"); window.scrollTo(0, 0);
    const n = recall(); load(n === STEPS.length - 1 ? 0 : n); // a finished book opens from the start again
  };
  return api;
})();
