// LEARN: a Duolingo-style course for beginners and young children.
// A path of lessons (small tasks on 5x5 / 7x7 boards) and boss stages (capture-go against a character),
// spoken by Hikaru from pre-recorded voice files (learn/voice/<hash>.mp3), with happy / sad sound effects,
// hearts per lesson, stars, XP and a daily streak. Self-contained: its own rules board, no AI network.
const Learn = (function () {
  // ---------- rules ----------
  const P = (s, N) => (N - parseInt(s.slice(1), 10)) * N + (s.charCodeAt(0) - 97); // "c3" -> index, row 1 at the bottom
  const L = (s, N) => s ? s.trim().split(/\s+/).map(x => P(x, N)) : [];
  function nbs(i, N) { const x = i % N, y = (i / N) | 0, r = []; if (x > 0) r.push(i - 1); if (x < N - 1) r.push(i + 1); if (y > 0) r.push(i - N); if (y < N - 1) r.push(i + N); return r; }
  class Board {
    constructor(N) { this.N = N; this.a = new Int8Array(N * N); this.ko = -1; }
    clone() { const b = new Board(this.N); b.a.set(this.a); b.ko = this.ko; return b; }
    group(i) {
      const c = this.a[i], seen = new Set([i]), st = [i], libs = new Set();
      while (st.length) { const j = st.pop(); for (const k of nbs(j, this.N)) { if (this.a[k] === 0) libs.add(k); else if (this.a[k] === c && !seen.has(k)) { seen.add(k); st.push(k); } } }
      return { stones: [...seen], libs };
    }
    play(c, i) {
      if (this.a[i]) return { ok: false, why: "occupied" };
      if (i === this.ko) return { ok: false, why: "ko" };
      this.a[i] = c; const cap = [];
      for (const k of nbs(i, this.N)) if (this.a[k] === 3 - c) { const g = this.group(k); if (g.libs.size === 0) for (const s of g.stones) if (this.a[s]) { this.a[s] = 0; cap.push(s); } }
      const me = this.group(i);
      if (me.libs.size === 0) { this.a[i] = 0; return { ok: false, why: "suicide" }; }
      this.ko = cap.length === 1 && me.stones.length === 1 && me.libs.size === 1 ? cap[0] : -1;
      return { ok: true, cap };
    }
    area() {
      const N = this.N, own = new Int8Array(N * N), seen = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) {
        if (this.a[i] || seen[i]) continue;
        const reg = [i], st = [i]; let border = 0; seen[i] = 1;
        while (st.length) { const j = st.pop(); for (const k of nbs(j, N)) { if (this.a[k]) border |= this.a[k]; else if (!seen[k]) { seen[k] = 1; reg.push(k); st.push(k); } } }
        if (border === 1 || border === 2) for (const r of reg) own[r] = border;
      }
      return own;
    }
    groups(c) { const out = [], seen = new Set(); for (let i = 0; i < this.a.length; i++) if (this.a[i] === c && !seen.has(i)) { const g = this.group(i); g.stones.forEach(s => seen.add(s)); out.push(g); } return out; }
  }

  // ---------- the course ----------
  // item types: info (talk, optional demo moves), any, tap (place on one of ans), capture, escape (group "of" gets 2+ liberties),
  // atari (leave a white group with one liberty), libs (tap every liberty of "of"), stone (tap one of the stones in ans),
  // illegal (tap the forbidden point; c = colour that tries), choice (opts, ok = index)
  const UNITS = [
    { t: "รู้จักหมากล้อม", c: "#58cc02", lessons: [
      { id: "u1a", t: "วางหมาก", icon: "●", items: [
        { t: "info", n: 5, say: "สวัสดีครับ ผมชื่อ**ฮิคารุ** วันนี้เรามาเล่นหมากล้อมกันนะ หมากล้อมมีหมากสองสี คือสีดำกับสีขาว" },
        { t: "info", n: 5, b: "c3 b4", w: "d2", say: "หมากต้องวางบน**จุดที่เส้นตัดกัน** ไม่ได้วางในช่องนะ วางแล้วก็อยู่ตรงนั้นเลย ไม่เดินไปไหน" },
        { t: "any", n: 5, say: "ลองแตะกระดาน วางหมากดำสักเม็ดสิ ตรงไหนก็ได้" },
        { t: "tap", n: 5, ring: "b4", ans: "b4", say: "เก่งมาก ทีนี้วางหมากตรงวงกลมสีส้มนะ", hint: "มองหาวงกลมสีส้มบนกระดาน" },
        { t: "choice", n: 5, opts: ["⚫ สีดำ", "⚪ สีขาว"], ok: 0, say: "ใครได้เดินก่อน สีดำหรือสีขาว", hint: "ในหมากล้อม สีดำเดินก่อนเสมอ" },
        { t: "tap", n: 5, ans: "a1 a5 e1 e5", say: "ลองวางหมากที่มุมกระดานดูสิ มุมไหนก็ได้", hint: "มุมคือจุดที่เส้นขอบสองเส้นมาชนกัน" }
      ] },
      { id: "u1b", t: "ลมหายใจ", icon: "○", items: [
        { t: "info", n: 5, b: "c3", lib: "c3", say: "จุดว่างที่อยู่ติดกับหมาก ทั้งบน ล่าง ซ้าย ขวา เรียกว่า**ลมหายใจ** หมากเม็ดนี้มี**ลมหายใจสี่จุด**" },
        { t: "libs", n: 5, w: "c3", of: "c3", say: "ลองแตะลมหายใจของหมากขาวให้ครบทุกจุด", hint: "ลมหายใจอยู่ติดหมากตรงๆ ไม่นับแนวทแยงนะ" },
        { t: "choice", n: 5, b: "a3", opts: ["2", "3", "4"], ok: 1, say: "หมากที่อยู่ริมกระดาน มีลมหายใจกี่จุด", hint: "ริมกระดานไม่มีลมหายใจด้านนอก เหลือแค่สามจุด" },
        { t: "choice", n: 5, b: "a1", opts: ["2", "3", "4"], ok: 0, say: "แล้วหมากที่อยู่มุมล่ะ มีลมหายใจกี่จุด", hint: "มุมกระดานมีลมหายใจแค่สองจุด" },
        { t: "info", n: 5, b: "c3 d3", lib: "c3", say: "หมากสีเดียวกันที่อยู่ติดกัน เป็น**กลุ่มเดียวกัน** ใช้ลมหายใจร่วมกัน สองเม็ดนี้มีลมหายใจหกจุด" },
        { t: "libs", n: 5, w: "b3 c3", b: "c4", of: "c3", say: "แตะลมหายใจของกลุ่มหมากขาวให้ครบ จุดที่มีหมากดำอยู่แล้วไม่นับนะ", hint: "หาจุดว่างรอบหมากขาวทั้งสองเม็ด" }
      ] }
    ] },
    { t: "กินหมาก", c: "#1cb0f6", lessons: [
      { id: "u2a", t: "กินหมาก", icon: "✊", items: [
        { t: "info", n: 5, w: "c3", b: "b3 c4 d3", play: [{ c: 1, at: "c2" }], say: "ถ้าลมหายใจของหมากถูกปิดจนหมด หมากนั้นจะ**โดนกิน** แล้วยกออกจากกระดาน ดูนะ" },
        { t: "capture", n: 5, w: "c3", b: "b3 c4 d3", ans: "c2", say: "ตาเราแล้ว ลองกินหมากขาวดูสิ", hint: "วางปิดลมหายใจสุดท้ายของหมากขาว" },
        { t: "capture", n: 5, w: "a3", b: "a4 b3", ans: "a2", say: "หมากที่อยู่ริมกระดาน กินง่ายกว่า ลองกินเม็ดนี้", hint: "หมากขาวเหลือลมหายใจจุดเดียว อยู่ด้านล่าง" },
        { t: "capture", n: 5, w: "a1", b: "a2", ans: "b1", say: "หมากที่อยู่มุม กินง่ายที่สุดเลย", hint: "มุมมีลมหายใจแค่สองจุด ดำปิดไปแล้วหนึ่งจุด" },
        { t: "capture", n: 5, w: "d4", b: "d5 e4 c4", ans: "d3", say: "อีกข้อนะ กินหมากขาวให้ได้", hint: "ดูด้านล่างของหมากขาว" },
        { t: "choice", n: 5, opts: ["โดนกิน ยกออก", "กลายเป็นสีดำ", "อยู่ที่เดิม"], ok: 0, say: "ถ้าหมากโดนปิดลมหายใจจนหมด จะเกิดอะไรขึ้น", hint: "หมากที่ไม่มีลมหายใจ จะโดนกินแล้วยกออก" }
      ] },
      { id: "u2b", t: "กินทั้งกลุ่ม", icon: "✋", items: [
        { t: "info", n: 7, w: "c4 d4", b: "b4 c5 d5 e4 c3", play: [{ c: 1, at: "d3" }], say: "กลุ่มหมากก็**โดนกินได้ทั้งกลุ่ม** ถ้าโดนปิดลมหายใจจนหมด ดูนะ" },
        { t: "capture", n: 7, w: "d4 d5", b: "c4 c5 e4 e5 d6", ans: "d3", min: 2, say: "ลองกินหมากขาวทั้งสองเม็ดเลย", hint: "กลุ่มขาวเหลือลมหายใจจุดเดียว" },
        { t: "choice", n: 7, w: "d4 d5", b: "c4 c5 e4 d6", lib: "d4", opts: ["1", "2", "3"], ok: 1, say: "กลุ่มหมากขาวนี้ เหลือลมหายใจกี่จุด", hint: "นับจุดว่างที่ติดกับหมากขาว ได้สองจุด" },
        { t: "capture", n: 7, w: "a4 a5", b: "a6 b5 b4", ans: "a3", min: 2, say: "กลุ่มขาวที่ริมกระดาน ก็กินได้นะ ลองดู", hint: "ลมหายใจสุดท้ายอยู่ริมกระดานด้านล่าง" },
        { t: "capture", n: 7, w: "c3 d3", b: "b3 c4 d4 e3 c2", ans: "d2", min: 2, say: "ข้อสุดท้าย กินกลุ่มขาวให้หมด", hint: "หาจุดว่างจุดเดียวที่ติดกับหมากขาว" }
      ] },
      { id: "boss1", boss: "mek", goal: 1, n: 7, t: "บอส · เมฆ" }
    ] },
    { t: "หนีให้รอด", c: "#ff9600", lessons: [
      { id: "u3a", t: "อาตาริ", icon: "!", items: [
        { t: "info", n: 5, b: "c3", w: "c4 b3 d3", ring: "c2", say: "หมากที่เหลือลมหายใจจุดเดียว เรียกว่าโดน**อาตาริ** แปลว่ากำลังจะโดนกิน ต้องรีบหนีนะ" },
        { t: "stone", n: 5, b: "b4 d2", w: "a4 b5 c4 e2", ans: "b4", say: "หมากดำเม็ดไหนโดนอาตาริ แตะหมากเม็ดนั้น", hint: "หาหมากดำที่เหลือลมหายใจจุดเดียว" },
        { t: "escape", n: 5, b: "c3", w: "c4 b3 d3", of: "c3", ans: "c2", say: "ช่วยหมากดำหนีหน่อย ต่อหมากออกไปทางที่ยังว่าง", hint: "ต่อหมากลงไปด้านล่าง" },
        { t: "escape", n: 7, b: "d4", w: "d5 c4 e4", of: "d4", ans: "d3", say: "อีกเม็ดนะ ช่วยให้รอด", hint: "ทางหนีอยู่ด้านล่าง" },
        { t: "escape", n: 5, b: "a3", w: "a4 b3", of: "a3", ans: "a2", say: "หมากริมกระดานโดนขู่ ช่วยหนีให้ที", hint: "ต่อลงไปตามริมกระดาน" },
        { t: "choice", n: 5, opts: ["ต่อหมากออกไปหนี", "ปล่อยไว้เฉยๆ"], ok: 0, say: "ถ้าหมากของเราโดนอาตาริ ควรทำยังไงดี", hint: "ต่อหมากออกไป จะได้ลมหายใจเพิ่ม" }
      ] },
      { id: "u3b", t: "ขู่กิน", icon: "⚡", items: [
        { t: "info", n: 5, w: "c3", b: "c4 b3", say: "ทีนี้เราเป็นฝ่ายขู่บ้าง ถ้าเราวางให้หมากขาวเหลือลมหายใจจุดเดียว เรียกว่าเราอาตาริ" },
        { t: "atari", n: 5, w: "c3", b: "c4 b3", ans: "d3 c2", say: "วางหมากให้หมากขาวเหลือลมหายใจจุดเดียว", hint: "หมากขาวมีลมหายใจสองจุด ปิดไปหนึ่งจุด" },
        { t: "atari", n: 5, w: "b4", b: "a4 b5", ans: "c4 b3", say: "อาตาริหมากขาวเม็ดนี้", hint: "ปิดลมหายใจทางขวาหรือด้านล่าง" },
        { t: "atari", n: 7, w: "d4 e4", b: "c4 d5 e5 f4", ans: "d3 e3", say: "อาตาริกลุ่มหมากขาวทั้งกลุ่มเลย", hint: "กลุ่มขาวมีลมหายใจสองจุด อยู่ด้านล่าง" },
        { t: "choice", n: 5, opts: ["กินหมากขาวได้", "ต้องรอผ่าน"], ok: 0, say: "ถ้าเราอาตาริแล้ว ขาวไม่หนี ตาต่อไปเราทำอะไรได้", hint: "ปิดลมหายใจสุดท้ายได้เลย" }
      ] },
      { id: "boss2", boss: "win", goal: 2, n: 7, t: "บอส · ลุงวิน" }
    ] },
    { t: "กติกาพิเศษ", c: "#ce82ff", lessons: [
      { id: "u4a", t: "จุดห้ามลง", icon: "✕", items: [
        { t: "info", n: 5, w: "b3 c4 d3 c2", x: "c3", say: "จุดที่โดนหมากขาวล้อมไว้รอบด้าน หมากดำ**ลงไม่ได้** เพราะลงไปก็ไม่มีลมหายใจเลย" },
        { t: "illegal", n: 5, w: "a2 b1 d4 c5 e5", c: 1, ans: "a1 d5", say: "แตะจุดที่หมากดำลงไม่ได้ ตรงไหนก็ได้", hint: "จุดที่โดนหมากขาวล้อมทุกด้าน มีที่มุมล่างซ้าย กับริมด้านบน" },
        { t: "capture", n: 5, w: "a2 b1", b: "a3 b2 c1", ans: "a1", min: 2, say: "แต่ถ้าลงแล้วกินหมากขาวได้ ก็**ลงได้**นะ ลองดู", hint: "ลองลงที่มุมกระดาน" },
        { t: "info", n: 5, b: "c4 b3 c2", w: "d4 e3 d2 c3", play: [{ c: 1, at: "d3" }, { x: "c3" }], say: "ดูนะ ดำกินหมากขาวหนึ่งเม็ด แล้วขาวห้ามกินคืนทันที กติกานี้เรียกว่า**โคะ**" },
        { t: "choice", n: 5, b: "c4 b3 c2 d3", w: "d4 e3 d2", x: "c3", opts: ["ไม่ได้ ต้องไปลงที่อื่นก่อน", "ได้เลย"], ok: 0, say: "ขาวจะกินคืนตรงกากบาททันทีได้ไหม", hint: "โคะห้ามกินคืนทันที ต้องไปลงที่อื่นก่อนหนึ่งตา" }
      ] },
      { id: "u4b", t: "สองห้อง", icon: "∞", items: [
        { t: "info", n: 7, b: "c3 d3 e3 c4 e4 c5 d5 e5", w: "b2 c2 d2 e2 f2 b3 f3 b4 f4 b5 f5 b6 c6 d6 e6 f6", play: [{ c: 2, at: "d4" }], say: "ช่องว่างที่หมากเราล้อมไว้ เรียกว่า**ห้อง** กลุ่มที่มีห้องเดียว โดนกินได้ ดูนะ" },
        { t: "illegal", n: 7, b: "b3 c3 d3 e3 f3 b4 d4 f4 b5 c5 d5 e5 f5", w: "a2 b2 c2 d2 e2 f2 g2 a3 g3 a4 g4 a5 g5 a6 b6 c6 d6 e6 f6 g6", c: 2, ans: "c4 e4", say: "กลุ่มดำนี้มี**สองห้อง** ลองเป็นฝ่ายขาว แตะลงในห้องของดำดูสิ", hint: "ห้องคือช่องว่างที่หมากดำล้อมไว้" },
        { t: "tap", n: 7, b: "b1 b2 c2 d2 e2 f2 f1", w: "a1 a2 b3 c3 d3 e3 f3 g2 g1", ans: "d1", say: "กลุ่มดำมีช่องว่างสามช่อง ลงตรงไหนถึงจะได้สองห้อง", hint: "แบ่งช่องว่างให้เป็นสองส่วน ลงตรงกลาง" },
        { t: "tap", n: 7, w: "b1 b2 c2 d2 e2 f2 f1", b: "a1 a2 b3 c3 d3 e3 f3 g2 g1", ans: "d1", say: "ทีนี้กลุ่มขาว ลงตรงไหนขาวจะสร้างสองห้องไม่ได้", hint: "จุดเดียวกับข้อที่แล้ว" },
        { t: "choice", n: 7, opts: ["ห้องเดียว", "สองห้อง"], ok: 1, say: "กลุ่มหมากต้องมีกี่ห้อง ถึงจะไม่โดนกิน", hint: "สองห้อง ทำให้อีกฝ่ายลงไม่ได้ทั้งคู่" }
      ] },
      { id: "boss3", boss: "yuto", goal: 3, n: 7, t: "บอส · ยูโตะ" }
    ] },
    { t: "ล้อมพื้นที่", c: "#ff4b4b", lessons: [
      { id: "u5a", t: "ล้อมพื้นที่", icon: "▦", items: [
        { t: "info", n: 5, b: "c1 c2 c3 c4 c5", w: "d1 d2 d3 d4 d5", shade: 1, say: "เป้าหมายของหมากล้อม คือ**ล้อมพื้นที่**ให้ได้มากกว่าอีกฝ่าย สี่เหลี่ยมเล็กๆ คือพื้นที่ของแต่ละสี" },
        { t: "choice", n: 5, b: "c1 c2 c3 c4 c5", w: "d1 d2 d3 d4 d5", shade: 1, opts: ["⚫ ดำ", "⚪ ขาว"], ok: 0, say: "ใครล้อมพื้นที่ได้มากกว่ากัน", hint: "นับสี่เหลี่ยมของแต่ละสีดู" },
        { t: "tap", n: 5, b: "c1 c2 c4 c5", w: "d1 d2 d3 d4 d5", ans: "c3", say: "รั้วของดำมีรูอยู่ วางหมากปิดรูให้ได้", hint: "รูอยู่ตรงกลางแถวหมากดำ" },
        { t: "info", n: 5, b: "c1 c2 c3 c4 c5", w: "d1 d2 d3 d4 d5", shade: 1, say: "เรานับแต้มแบบ**กติกาญี่ปุ่น** เอา**หมากเชลย**ที่กินมาได้ ไป**ถมในพื้นที่ของอีกฝ่าย** แล้วนับช่องว่างที่เหลือ หมากบนกระดานไม่นับนะ" },
        { t: "info", n: 5, b: "c1 c2 c3 c4 c5", w: "d1 d2 d3 d4 d5", shade: 1, play: [{ c: 2, at: "e1" }, { c: 2, at: "e2" }], say: "ดำกินหมากขาวมาได้สองเม็ด ดำเอาเชลยสองเม็ดนี้ ไปถมในพื้นที่ของขาว ดูนะ" },
        { t: "choice", n: 5, b: "c1 c2 c3 c4 c5", w: "d1 d2 d3 d4 d5 e1 e2", shade: 1, opts: ["2", "3", "5"], ok: 1, say: "ถมเชลยแล้ว พื้นที่ของขาวเหลือกี่ช่อง", hint: "นับสี่เหลี่ยมสีขาวที่เหลือ ได้สามช่อง" },
        { t: "info", n: 5, b: "c1 c2 c3 c4 c5", w: "d1 d2 d3 d4 d5 e1 e2", shade: 1, say: "ขาวเดินทีหลัง เลยได้**แต้มต่อหกแต้มครึ่ง** เรียกว่า**โคมิ**" },
        { t: "choice", n: 5, b: "c1 c2 c3 c4 c5", w: "d1 d2 d3 d4 d5 e1 e2", shade: 1, opts: ["⚫ ดำ", "⚪ ขาว"], ok: 0, say: "ดำได้สิบแต้ม ขาวได้สามแต้ม บวกโคมิหกแต้มครึ่ง ใครชนะ", hint: "ขาวรวมได้เก้าแต้มครึ่ง ดำได้สิบแต้ม ดำชนะครึ่งแต้ม" },
        { t: "info", n: 5, b: "c1 c2 c3 c4 c5", w: "d1 d2 d3 d4 d5", shade: 1, say: "เมื่อไม่มีที่ให้ลงแล้ว ทั้งสองฝ่ายกดผ่าน เกมก็จบ แล้วนับแต้ม ใครได้มากกว่าชนะ เก่งมาก หนูพร้อมเล่นจริงแล้ว" }
      ] }
    ] }
  ];
  // each boss speaks for himself, in his own voice: learn/voice/<boss>_<hash>.mp3 (turn / yours are shown, not spoken)
  const BOSS = {
    mek: { name: "เมฆ", face: "chars/mek_face.jpg", see: 0.5, say: {
      intro: "สวัสดีครับพี่ ผมชื่อเมฆ ผมเพิ่งหัดเล่นเหมือนกัน ใครกินหมากได้ก่อนหนึ่งเม็ดชนะนะครับ",
      warn: "ระวังนะพี่ หมากของพี่โดนอาตาริอยู่", capOk: "ไม่นะ หมากผมโดนกินแล้ว", capBad: "เย้ ผมกินได้แล้ว",
      win: "พี่เก่งจังเลย สอนผมบ้างได้ไหมครับ", lose: "ผมชนะเหรอ ไม่อยากเชื่อเลย มาเล่นกันอีกนะพี่",
      turn: "ตาผมบ้างนะครับ", yours: "ตาพี่แล้วครับ" } },
    win: { name: "ลุงวิน", face: "chars/win_face.jpg", see: 0.72, say: {
      intro: "ลุงวินมาแล้ว หมากฮอสลุงไม่เคยแพ้ใครนะ ใครกินหมากได้ก่อนสองเม็ดชนะ ระวังหมากโดนขู่ล่ะหลาน",
      warn: "หมากหลานโดนอาตาริอยู่นะ จะหนีไหม", capOk: "เฮ้ย หมากลุงหายไปแล้ว", capBad: "เสร็จลุง กินซะเลย",
      win: "เก่งนี่หว่า เดี๋ยวลุงไปฝึกมาใหม่", lose: "เห็นไหม เซียนก็คือเซียน มาลองใหม่ได้นะหลาน",
      turn: "ตาลุงบ้างละ", yours: "ตาหลานแล้ว" } },
    yuto: { name: "ยูโตะ", face: "chars/yuto_face.jpg", see: 0.9, say: {
      intro: "โอเนไงชิมัส ผมชื่อยูโตะครับ ใครกินหมากได้ก่อนสามเม็ดชนะ ขอคำชี้แนะด้วยครับ",
      warn: "หมากของคุณโดนอาตาริอยู่นะครับ", capOk: "อ๊ะ ผมอ่านพลาดไปครับ", capBad: "ขออนุญาตกินนะครับ",
      win: "มาเกะมาชิตะ ขอบคุณที่ชี้แนะครับ", lose: "ขอบคุณสำหรับเกมครับ ลองใหม่อีกครั้งนะครับ",
      turn: "ขออนุญาตเดินนะครับ", yours: "เชิญครับ" } }
  };
  const SPOKEN = ["intro", "warn", "capOk", "capBad", "win", "lose"];
  const bossTexts = k => SPOKEN.map(n => BOSS[k].say[n]);
  // the teacher is Hikaru (the owner's chibi sprites), perched on the top edge of the board; his pose follows the mood
  const TEACH = { name: "ฮิคารุ", pose: m => `learn/hikaru_${m}.png` };
  const any = a => a[(Math.random() * a.length) | 0];
  const MOOD = { yes: ["happy", "cheer", "laugh", "yay", "excite"], oops: ["nervous", "cringe", "shy", "ask"], side: ["read", "sitcross", "run1", "book", "wave", "sleep"] };
  const plain = s => (s || "").replace(/\*\*/g, "");
  const rich = s => (s || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const TITLE = { info: "เรื่องใหม่", any: "วางหมาก", tap: "วางหมาก", capture: "กินหมาก", escape: "หนีให้รอด", atari: "ขู่กิน", libs: "หาลมหายใจ", stone: "เลือกหมาก", illegal: "จุดห้ามลง", choice: "ตอบคำถาม" };
  const PRAISE = ["เก่งมาก", "ถูกต้องครับ", "สุดยอดเลย", "เยี่ยมไปเลย", "ใช่แล้ว เก่งจริงๆ"];
  const OOPS = ["ไม่เป็นไรนะ ลองใหม่อีกที", "เกือบแล้ว ลองอีกครั้งนะ", "ยังไม่ใช่ ค่อยๆ ดูนะ"];
  const LINES = {
    done: "เรียนจบบทนี้แล้ว เก่งมากเลย", out: "หัวใจหมดแล้ว ไม่เป็นไรนะ มาลองใหม่กัน",
    grad: "ยินดีด้วย หนูเรียนจบทุกบทแล้ว ไปลองเล่นจริงกับเมฆบนกระดานเก้าคูณเก้ากันเลย"
  };
  const ALL = UNITS.flatMap((u, k) => u.lessons.map(l => Object.assign(l, { unit: k })));
  const HEARTS = 5;

  // every spoken sentence maps to learn/voice/<fnv-1a of the text>.mp3 (src/tools/learn_voice.py makes them)
  function vkey(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }
  function texts() {
    const t = new Set([...PRAISE, ...OOPS, ...Object.values(LINES)]);
    for (const l of ALL) for (const it of l.items || []) { t.add(plain(it.say)); if (it.hint) t.add(plain(it.hint)); }
    return [...t];
  }

  // ---------- capture-go opponent: simple tactics, each one noticed only some of the time ----------
  function botMove(b, c, see, rnd = Math.random) {
    const N = b.N, empty = [];
    for (let i = 0; i < N * N; i++) if (!b.a[i]) empty.push(i);
    const tryMove = i => { const t = b.clone(), r = t.play(c, i); return r.ok ? { t, r, i } : null; };
    const legal = empty.map(tryMove).filter(Boolean);
    if (!legal.length) return -1;
    const libsAt = m => m.t.group(m.i).libs.size;
    const pick = arr => arr[(rnd() * arr.length) | 0];
    const caps = legal.filter(m => m.r.cap.length);
    if (caps.length && rnd() < see + 0.25) { const best = Math.max(...caps.map(m => m.r.cap.length)); return pick(caps.filter(m => m.r.cap.length === best)).i; }
    const inAtari = b.groups(c).filter(g => g.libs.size === 1);
    if (inAtari.length && rnd() < see) {
      const saves = legal.filter(m => inAtari.every(g => m.t.a[g.stones[0]] === c && m.t.group(g.stones[0]).libs.size >= 2));
      if (saves.length) return pick(saves).i;
    }
    if (rnd() < see) {
      const hits = legal.filter(m => libsAt(m) >= 2 && m.t.groups(3 - c).some(g => g.libs.size === 1));
      if (hits.length) return pick(hits).i;
    }
    const near = m => nbs(m.i, N).some(k => b.a[k]) || nbs(m.i, N).some(k => nbs(k, N).some(j => b.a[j]));
    const calm = legal.filter(m => libsAt(m) >= 2 && !m.t.groups(c).some(g => g.libs.size === 1));
    const pool = calm.filter(near).length ? calm.filter(near) : calm.length ? calm : legal;
    return pick(pool).i;
  }

  // ---------- saved progress ----------
  const KEY = "gonn.learn";
  function loadP() { try { const p = JSON.parse(localStorage.getItem(KEY) || "null"); if (p && p.stars) return p; } catch (e) {} return { stars: {}, xp: 0, streak: 0, day: "" }; }
  function saveP() { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch (e) {} }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const yesterday = () => { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  let prog = { stars: {}, xp: 0, streak: 0, day: "" };
  function liveStreak() { return prog.day === today() || prog.day === yesterday() ? prog.streak : 0; }
  function finish(id, stars, xp) {
    prog.stars[id] = Math.max(prog.stars[id] || 0, stars); prog.xp += xp;
    const t = today(); if (prog.day !== t) { prog.streak = prog.day === yesterday() ? prog.streak + 1 : 1; prog.day = t; }
    saveP();
  }
  const unlocked = k => k === 0 || !!prog.stars[ALL[k - 1].id];
  const current = () => { const k = ALL.findIndex(l => !prog.stars[l.id]); return k < 0 ? ALL.length : k; };

  // ---------- sound: effects made with WebAudio, speech from files ----------
  const api = { onHome: null, onPlay: null, onBook: null, muted: () => false, voiceDir: "learn/voice/" };
  let ac = null, voiceOn = true, audio = null;
  try { voiceOn = localStorage.getItem("gonn.learnVoice") !== "0"; } catch (e) {}
  function ctx() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch (e) {} return ac; }
  function tone(f, t0, dur, type = "sine", vol = 0.18, f2) {
    const a = ctx(); if (!a || api.muted()) return;
    const t = a.currentTime + t0, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const SFX = {
    tap() { tone(660, 0, 0.07, "triangle", 0.12); },
    stone() { tone(1100, 0, 0.06, "sine", 0.2, 520); tone(2200, 0, 0.03, "triangle", 0.05); },
    good() { tone(784, 0, 0.13, "sine", 0.2); tone(1175, 0.11, 0.28, "sine", 0.2); tone(2350, 0.11, 0.2, "sine", 0.04); }, // happy: rising chime
    bad() { tone(311, 0, 0.18, "triangle", 0.2, 277); tone(233, 0.18, 0.35, "triangle", 0.2, 196); }, // sad: falling "wah wah"
    heart() { tone(440, 0, 0.12, "square", 0.05, 220); },
    cap() { tone(523, 0, 0.08, "square", 0.07); tone(784, 0.07, 0.08, "square", 0.07); tone(1047, 0.14, 0.14, "square", 0.07); },
    done() { [523, 659, 784, 1047].forEach((f, k) => tone(f, k * 0.11, 0.22, "triangle", 0.16)); [1319, 1568, 2093].forEach((f, k) => tone(f, 0.5 + k * 0.07, 0.3, "sine", 0.06)); },
    lose() { [392, 370, 349, 330].forEach((f, k) => tone(f, k * 0.2, 0.22, "triangle", 0.15)); },
    fire() { tone(220, 0, 0.35, "sawtooth", 0.05, 880); }
  };
  function stopVoice() { if (audio) { try { audio.pause(); } catch (e) {} audio = null; } try { speechSynthesis.cancel(); } catch (e) {} }
  // recorded files come first (ElevenLabs voice); the device's own Thai voice is the fallback when a file is missing
  let thVoice;
  function deviceVoice() {
    if (thVoice !== undefined && thVoice !== null) return thVoice;
    try {
      const vs = speechSynthesis.getVoices().filter(v => /^th/i.test(v.lang));
      if (!vs.length) { thVoice = null; return null; }
      const pref = ["Premwadee", "Niwat", "Kanya", "Narisa", "Google", "Achara", "Pattara"];
      thVoice = vs.sort((a, b) => { const r = v => { const k = pref.findIndex(n => v.name.includes(n)); return k < 0 ? 99 : k; }; return r(a) - r(b); })[0];
      return thVoice;
    } catch (e) { thVoice = null; return null; }
  }
  try { speechSynthesis.onvoiceschanged = () => { thVoice = undefined; deviceVoice(); }; } catch (e) {}
  function sayDevice(text) {
    const v = deviceVoice(); if (!v) return false;
    try { const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = 1; u.pitch = 1.12; speechSynthesis.speak(u); return true; } catch (e) { return false; }
  }
  // iOS speaks only after a first utterance made inside a tap
  function primeVoice() { try { if (deviceVoice()) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {} }
  // clips are fetched ahead (whole lesson on open) so a line plays the moment its text appears
  const clips = new Map();
  function clip(text, who = "") {
    const k = (who ? who + "_" : "") + vkey(plain(text)); let a = clips.get(k);
    if (!a) { a = new Audio(api.voiceDir + k + ".mp3"); a.preload = "auto"; clips.set(k, a); }
    try { a.currentTime = 0; } catch (e) {}
    return a;
  }
  function preload(list, who) { if (!voiceOn || api.muted()) return; for (const t of list) if (t) { const a = clip(t, who); try { a.load(); } catch (e) {} } }
  function speak(text, delay = 0, who = "") {
    stopVoice(); text = plain(text); if (!voiceOn || api.muted() || !text) return;
    const go = () => {
      const a = clip(text, who); audio = a;
      a.onerror = () => { // no file: the device's own Thai voice, if there is one
        if (audio !== a || sayDevice(text)) return;
        try { const u = new SpeechSynthesisUtterance(text); u.lang = "th-TH"; u.rate = 0.95; speechSynthesis.speak(u); } catch (e) {}
      };
      a.play().catch(() => {});
    };
    if (delay) later(go, delay); else go();
  }

  // ---------- screens ----------
  const $ = id => document.getElementById(id);
  const S = { view: "path", lesson: null, queue: [], it: null, b: null, done: 0, total: 0, hearts: HEARTS, miss: 0, state: "ask", found: new Set(), last: -1, gone: [], x: [], ring: [], lock: false, timers: [], fight: null };
  const later = (fn, ms) => S.timers.push(setTimeout(fn, ms));
  const clearT = () => { S.timers.forEach(clearTimeout); S.timers = []; };

  function stoneSVG(i, c, N, cls = "") { return `<circle class="${cls}" cx="${i % N}" cy="${(i / N) | 0}" r=".46" fill="url(#lnG${c})" stroke="${c === 1 ? "#000" : "#9c917e"}" stroke-width=".03"/>`; }
  function drawBoard() {
    const b = S.b, N = b.N, s = [], xy = i => [i % N, (i / N) | 0], it = S.it || {};
    s.push(`<defs><radialGradient id="lnG1" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#5b5b5b"/><stop offset="1" stop-color="#0d0d0d"/></radialGradient>
      <radialGradient id="lnG2" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cfc6b4"/></radialGradient></defs>`);
    s.push(`<rect x="-.7" y="-.7" width="${N + .4}" height="${N + .4}" rx=".3" fill="#dcb06e"/>`);
    for (let k = 0; k < N; k++) s.push(`<line x1="0" y1="${k}" x2="${N - 1}" y2="${k}" stroke="#5a3a1a" stroke-width=".05"/><line x1="${k}" y1="0" x2="${k}" y2="${N - 1}" stroke="#5a3a1a" stroke-width=".05"/>`);
    if (N === 7) for (const p of L("c3 e3 c5 e5 d4", 7)) s.push(`<circle cx="${p % N}" cy="${(p / N) | 0}" r=".1" fill="#5a3a1a"/>`);
    if (N === 5) s.push(`<circle cx="2" cy="2" r=".1" fill="#5a3a1a"/>`);
    if (it.shade) { const own = b.area(); for (let i = 0; i < N * N; i++) if (own[i]) s.push(`<rect x="${i % N - .18}" y="${((i / N) | 0) - .18}" width=".36" height=".36" rx=".05" fill="${own[i] === 1 ? "#1a1a1a" : "#fbf7ee"}" stroke="#5a3a1a" stroke-width=".02"/>`); }
    if (it.lib && S.state !== "demo") for (const i of b.group(P(it.lib, N)).libs) { const [x, y] = xy(i); s.push(`<circle class="ln-pulse" cx="${x}" cy="${y}" r=".22" fill="none" stroke="#ff9600" stroke-width=".08"/>`); }
    for (const i of S.ring) { const [x, y] = xy(i); s.push(`<circle class="ln-pulse" cx="${x}" cy="${y}" r=".4" fill="none" stroke="#ff9600" stroke-width=".09"/>`); }
    for (const i of S.found) { const [x, y] = xy(i); s.push(`<circle class="ln-new" cx="${x}" cy="${y}" r=".24" fill="#58cc02"/>`); }
    for (const [i, c] of S.gone) s.push(stoneSVG(i, c, N, "ln-gone"));
    for (let i = 0; i < N * N; i++) if (b.a[i]) s.push(stoneSVG(i, b.a[i], N, i === S.last ? "ln-new" : ""));
    if (S.last >= 0 && b.a[S.last]) { const [x, y] = xy(S.last); s.push(`<circle cx="${x}" cy="${y}" r=".15" fill="none" stroke="${b.a[S.last] === 1 ? "#f3ead8" : "#2a1a0b"}" stroke-width=".07"/>`); }
    for (const i of S.x) { const [x, y] = xy(i); s.push(`<g stroke="#ff4b4b" stroke-width=".12" stroke-linecap="round"><line x1="${x - .22}" y1="${y - .22}" x2="${x + .22}" y2="${y + .22}"/><line x1="${x + .22}" y1="${y - .22}" x2="${x - .22}" y2="${y + .22}"/></g>`); }
    const svg = $("lnBoard"); svg.setAttribute("viewBox", `-.7 -.7 ${N + .4} ${N + .4}`); svg.innerHTML = s.join("");
    svg.classList.toggle("locked", !canTap());
  }
  const canTap = () => !S.lock && ((S.view === "lesson" && S.state === "ask" && S.it && !["info", "choice"].includes(S.it.t)) || (S.view === "fight" && S.fight && !S.fight.over && S.fight.turn === 1));

  function head() {
    return `<div class="ln-top"><button class="ln-x" data-act="home" aria-label="กลับ">← กลับ</button>
      <div class="ln-stat"><span class="ln-fire${liveStreak() ? " on" : ""}" title="เรียนต่อเนื่อง">🔥 ${liveStreak()}</span><span class="ln-xp" title="คะแนนประสบการณ์"><img class="ln-ic " src="learn/icon_star.png" alt=""> ${prog.xp} XP</span>
      <button class="ln-voice" data-act="voice" aria-label="เสียงพูด"><img class="ln-ic${voiceOn ? "" : " off"}" src="learn/icon_voice.png" alt=""></button></div></div>`;
  }
  function renderPath() {
    S.view = "path"; clearT(); stopVoice();
    const cur = current(); let k = 0, h = head() + `<div class="ln-path">`;
    UNITS.forEach((u, ui) => {
      const offs = u.lessons.map((_, j) => [0, 1, 0, -1][(k + j) % 4]), side = offs.reduce((a, b) => a + b, 0) > 0 ? "l" : offs.some(o => o < 0) ? "r" : ui % 2 ? "l" : "r";
      h += `<div class="ln-unit" style="--uc:${u.c}"><small>หน่วยที่ ${ui + 1}</small><b>${u.t}</b></div><div class="ln-nodes"><img class="ln-side ${side}" src="${TEACH.pose(MOOD.side[ui % MOOD.side.length])}" alt="">`;
      u.lessons.forEach((l, li) => {
        const st = prog.stars[l.id] || 0, open = unlocked(k), isCur = k === cur, off = [0, 1, 0, -1][(k) % 4];
        h += `<div class="ln-node-w" style="--off:${off}">${isCur ? `<div class="ln-start">${st ? "อีกครั้ง" : "เริ่ม"}</div>` : ""}
          <button class="ln-node${l.boss ? " boss" : ""}${open ? "" : " lock"}${st ? " done" : ""}${isCur ? " cur" : ""}" style="--uc:${u.c}" data-pick="${k}" aria-label="${l.t}">
          ${l.boss ? `<img src="${BOSS[l.boss].face}" alt="">` : `<span>${open ? (st ? "✓" : l.icon) : "🔒"}</span>`}</button>
          <div class="ln-pop" style="--uc:${u.c}" hidden><b>${l.t}</b><small>${open ? (l.boss ? `จับหมากกับ${BOSS[l.boss].name} · กินก่อน ${l.goal} เม็ดชนะ` : `${l.items.length} ข้อ`) : "ผ่านด่านก่อนหน้าก่อนนะ"}</small>
            ${open ? `<button class="ln-btn pop" data-lesson="${k}">${st ? "เล่นอีกครั้ง" : "เริ่ม"} +${l.boss ? 30 : 25} XP</button>` : ""}</div>
          ${off === 0 || k % 3 === 2 ? `<img class="ln-deco ${off > 0 ? "l" : off < 0 ? "r" : side === "l" ? "r" : "l"}" style="--dl:${(k % 5) * .3}s" src="learn/stone_${(k * 7) % 16 + 1}.png" alt="">` : ""}
          <div class="ln-cap">${l.t}</div><div class="ln-stars">${[1, 2, 3].map(n => `<img class="ln-ic${n <= st ? "" : " off"}" src="learn/icon_star.png" alt="">`).join("")}</div></div>`;
        k++;
      });
      h += `</div>`;
    });
    const all = cur >= ALL.length;
    h += `<div class="ln-grad${all ? " on" : ""}"><div class="ln-trophy">🏆</div><b>${all ? "เรียนจบแล้ว!" : "เรียนจบทุกบท ปลดล็อกเกมจริง"}</b>
      <div class="ln-row"><button class="ln-btn pri" data-act="play"${all ? "" : " disabled"}>เล่นจริง 9×9 กับเมฆ</button><button class="ln-btn" data-act="book">คัมภีร์ฉบับเต็ม</button></div></div></div>`;
    $("learn").innerHTML = h; $("learn").className = "learn path";
    const c = $("learn").querySelector(".ln-node.cur"); if (c) later(() => c.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
  }

  // ---------- a lesson ----------
  function openLesson(k) {
    const l = ALL[k]; if (!l || !unlocked(k)) return;
    clearT(); ctx(); SFX.tap(); primeVoice();
    if (l.boss) return openFight(k);
    preload([...l.items.flatMap(it => [it.say, it.hint]), ...PRAISE, ...OOPS, LINES.done, LINES.out]);
    S.view = "lesson"; S.lesson = k; S.queue = l.items.slice(); S.total = l.items.length; S.done = 0; S.hearts = HEARTS; S.miss = 0; S.usedHint = false;
    nextItem();
  }
  function lessonShell(body, foot) {
    const pct = Math.round(S.done / S.total * 100);
    return `<div class="ln-top lesson"><button class="ln-x" data-act="quit" aria-label="ออก">✕</button><div class="ln-prog"><i style="width:${pct}%"></i></div>
      <span class="ln-hearts${S.hurt ? " hurt" : ""}"><img class="ln-ic " src="learn/icon_heart.png" alt=""> ${S.hearts}</span><button class="ln-voice" data-act="voice" aria-label="เสียงพูด"><img class="ln-ic${voiceOn ? "" : " off"}" src="learn/icon_voice.png" alt=""></button></div>
      <div class="ln-stage">${body}</div>${foot || ""}`;
  }
  function talk(face, name, text, boss) {
    return `<div class="ln-talk${boss ? " boss" : ""}"><div class="ln-bub"><div class="ln-who">${name}</div><p>${rich(text)}</p><button class="ln-say" data-act="again" aria-label="ฟังอีกครั้ง"><img class="ln-ic " src="learn/icon_voice.png" alt=""></button></div>
      <img class="ln-mascot${boss ? " face" : ""}" src="${face}" alt="${name}"></div>`;
  }
  const mood = () => TEACH.pose(S.pose || "idle");
  function setupBoard(it) {
    const N = it.n || 5, b = new Board(N);
    for (const i of L(it.b, N)) b.a[i] = 1;
    for (const i of L(it.w, N)) b.a[i] = 2;
    S.b = b; S.found = new Set(); S.last = -1; S.gone = []; S.x = L(it.x, N); S.ring = L(it.ring, N); S.lock = false;
  }
  function nextItem() {
    clearT(); S.hurt = false; S.typed = null;
    if (!S.queue.length) return lessonDone();
    S.it = S.queue[0]; S.state = S.it.t === "info" ? (S.it.play ? "demo" : "info") : "ask"; S.hintShown = false;
    S.pose = S.it.t === "info" ? (S.it.play ? "point" : S.done === 0 && S.queue.length === S.total ? "wave" : "talk") : S.it.t === "choice" ? "wonder" : any(["think", "chin", "arms"]);
    setupBoard(S.it); renderLesson(); speak(S.it.say);
    if (S.it.play) playDemo(0);
  }
  function playDemo(k) {
    const it = S.it;
    if (k >= it.play.length) { S.state = "info"; return renderLesson(); }
    later(() => {
      const m = it.play[k];
      if (m.at) { const i = P(m.at, it.n), r = S.b.play(m.c, i); if (r.ok) { S.last = i; S.gone = r.cap.map(s => [s, 3 - m.c]); r.cap.length ? SFX.cap() : SFX.stone(); } }
      if (m.x) S.x = L(m.x, it.n);
      drawBoard(); playDemo(k + 1);
    }, k ? 1100 : 2600);
  }
  function renderLesson(fb) {
    const it = S.it;
    const label = it.t === "info" ? "✦ เรื่องใหม่" : "✦ ลองทำ";
    let opts = "";
    if (it.t === "choice") opts = `<div class="ln-opts">${it.opts.map((o, k) => `<button class="ln-opt${fb && k === it.ok ? " right" : ""}${fb && fb.pick === k && !fb.ok ? " wrong" : ""}" data-opt="${k}"${S.state !== "ask" ? " disabled" : ""}>${o}</button>`).join("")}</div>`;
    let meta = it.t === "libs" && S.state === "ask" ? `<div class="ln-meta">เจอแล้ว ${S.found.size} / ${S.b.group(P(it.of, it.n)).libs.size}</div>` : "";
    let foot;
    if (fb) foot = `<div class="ln-sheet ${fb.ok ? "ok" : "bad"}"><div class="in"><div class="ln-fb"><span class="ln-ico">${fb.ok ? "✔" : "✖"}</span><div><b>${fb.title}</b>${fb.text ? `<p>${fb.text}</p>` : ""}</div></div>
      <button class="ln-btn big ${fb.ok ? "pri" : "red"}" data-act="next">${fb.ok ? "ต่อไป" : "เข้าใจแล้ว"}</button></div></div>`;
    else if (S.state === "info" || S.state === "demo") foot = `<div class="ln-sheet"><div class="in"><span></span><button class="ln-btn big pri" data-act="next"${S.state === "demo" ? " disabled" : ""}>ต่อไป</button></div></div>`;
    else foot = `<div class="ln-sheet"><div class="in"><button class="ln-btn link" data-act="skip">ข้าม</button>${it.hint ? `<button class="ln-btn hint" data-act="hint">💡 คำใบ้</button>` : "<span></span>"}<span class="ln-sp"></span></div></div>`;
    const text = S.nudge || (S.hintShown && S.state === "ask" ? it.hint : it.say);
    $("learn").innerHTML = lessonShell(`<div class="ln-label${it.t === "info" ? " new" : ""}">${label}</div><h2 class="ln-title">${it.t === "info" ? ALL[S.lesson].t : TITLE[it.t] || ""}</h2>` + talk(mood(), TEACH.name, text) + `<div class="ln-boardbox"><svg id="lnBoard" role="img" aria-label="กระดาน"></svg></div>` + meta + opts, foot);
    $("learn").className = "learn lesson";
    drawBoard();
    if (S.typed !== text) { S.typed = text; typeIn($("learn").querySelector(".ln-bub p")); }
  }
  // the speech bubble types itself out, like the reference app
  function typeIn(el) {
    if (!el) return;
    const nodes = [], walk = n => { for (const c of n.childNodes) c.nodeType === 3 ? nodes.push([c, c.data]) : walk(c); };
    walk(el); nodes.forEach(([n]) => n.data = "");
    let k = 0, j = 0;
    const tick = () => {
      if (k >= nodes.length || !el.isConnected) return;
      const [n, full] = nodes[k]; j = Math.min(full.length, j + 2); n.data = full.slice(0, j);
      if (j >= full.length) { k++; j = 0; }
      S.timers.push(setTimeout(tick, 28));
    };
    tick();
  }
  function right() {
    S.state = "fb"; S.queue.shift(); S.done++;
    const p = PRAISE[(Math.random() * PRAISE.length) | 0]; S.pose = any(MOOD.yes);
    SFX.good(); speak(p, 150); renderLesson({ ok: true, title: p });
    confetti(12);
  }
  function wrong(pick) {
    S.state = "fb"; S.miss++; S.hearts--; S.hurt = true;
    S.queue.push(S.queue.shift()); // ask it again at the end, like Duolingo
    const o = OOPS[(Math.random() * OOPS.length) | 0], hint = S.it.hint || ""; S.pose = any(MOOD.oops);
    SFX.bad(); later(SFX.heart, 500);
    if (hint) speakPair(o, plain(hint)); else speak(o, 200);
    renderLesson({ ok: false, title: o, text: rich(hint), pick });
    if (S.hearts <= 0) later(outOfHearts, 1500);
  }
  // the "oops" line and the hint are two files, played one after the other
  function speakPair(a, b) {
    stopVoice(); if (!voiceOn || api.muted()) return;
    later(() => {
      const x = clip(a); audio = x;
      x.onended = () => { if (audio === x) { const y = clip(b); audio = y; y.play().catch(() => {}); } };
      x.onerror = () => { if (audio !== x || sayDevice(a + " " + b)) return; try { const u = new SpeechSynthesisUtterance(a + " " + b); u.lang = "th-TH"; speechSynthesis.speak(u); } catch (e) {} };
      x.play().catch(() => {});
    }, 200);
  }
  function outOfHearts() {
    S.view = "end"; SFX.lose(); speak(LINES.out, 300);
    $("learn").innerHTML = `<div class="ln-end bad"><img class="ln-endimg" src="${TEACH.pose("cry")}" alt=""><h2>หัวใจหมดแล้ว</h2><p>ไม่เป็นไรนะ มาลองใหม่กัน</p>
      <div class="ln-row col"><button class="ln-btn big pri" data-act="retry">ลองบทนี้ใหม่</button><button class="ln-btn" data-act="path">กลับไปหน้าบทเรียน</button></div></div>`;
    $("learn").className = "learn end";
  }
  function lessonDone() {
    const l = ALL[S.lesson], stars = Math.min(S.usedHint ? 2 : 3, S.miss === 0 ? 3 : S.miss <= 2 ? 2 : 1), xp = 10 + stars * 5;
    const before = liveStreak(), wasToday = prog.day === today();
    finish(l.id, stars, xp);
    S.view = "end"; SFX.done(); speak(LINES.done, 500); confetti(40);
    $("learn").innerHTML = `<div class="ln-end"><img class="ln-endimg" src="${TEACH.pose("yay")}" alt=""><h2>เรียนจบบท "${l.t}"</h2>
      <div class="ln-bigstars">${[1, 2, 3].map(n => `<img class="${n <= stars ? "on" : "off"}" style="--d:${n * .25}s" src="learn/icon_star.png" alt="">`).join("")}</div>
      <div class="ln-tiles"><div class="ln-tile xp"><small>ได้ XP</small><b>+${xp}</b></div><div class="ln-tile acc"><small>ถูกต้อง</small><b>${Math.round(S.total / (S.total + S.miss) * 100)}%</b></div>
      <div class="ln-tile fire${!wasToday ? " up" : ""}"><small>เรียนต่อเนื่อง</small><b>🔥 ${liveStreak()} วัน</b></div></div>
      ${!wasToday && liveStreak() > before ? `<p class="ln-note">เรียนต่อเนื่องเพิ่มเป็น ${liveStreak()} วันแล้ว พรุ่งนี้มาเรียนอีกนะ</p>` : ""}
      <div class="ln-row col"><button class="ln-btn big pri" data-act="path">ต่อไป</button></div></div>`;
    $("learn").className = "learn end";
    if (!wasToday) later(SFX.fire, 900);
  }

  // checks a tap on the board during a lesson task
  function tapLesson(i) {
    const it = S.it, b = S.b, N = b.N, ans = L(it.ans, N);
    const place = () => { const r = b.play(1, i); if (r.ok) { S.last = i; S.gone = r.cap.map(s => [s, 2]); r.cap.length ? SFX.cap() : SFX.stone(); } return r; };
    const busy = () => { S.nudge = "ตรงนั้นมีหมากอยู่แล้ว ลองแตะจุดว่างนะ"; SFX.heart(); renderLesson(); S.nudge = null; };
    if (it.t === "stone" && !b.a[i]) { S.nudge = "แตะที่ตัวหมากดำเลยนะ"; SFX.heart(); renderLesson(); S.nudge = null; return; }
    if (it.t !== "stone" && b.a[i]) return busy();
    if (it.t === "any") { place(); drawBoard(); return later(right, 350); }
    if (it.t === "tap") { if (!ans.includes(i)) return wrongAt(i); place(); drawBoard(); return later(right, 350); }
    if (it.t === "stone") { if (!ans.includes(i)) return wrongAt(i); S.ring = [i]; SFX.tap(); drawBoard(); return later(right, 300); }
    if (it.t === "illegal") { if (!ans.includes(i)) return wrongAt(i); S.x = [i]; SFX.tap(); drawBoard(); return later(right, 300); }
    if (it.t === "libs") {
      const libs = b.group(P(it.of, N)).libs; if (S.found.has(i)) return;
      if (!libs.has(i)) return wrongAt(i);
      S.found.add(i); SFX.tap();
      if (S.found.size === libs.size) { drawBoard(); return later(right, 300); }
      return renderLesson();
    }
    if (["capture", "escape", "atari"].includes(it.t)) {
      const t = b.clone(), r = t.play(1, i);
      if (!r.ok) return wrongAt(i);
      const good = it.t === "capture" ? r.cap.length >= (it.min || 1)
        : it.t === "escape" ? t.group(P(it.of, N)).libs.size >= 2
        : t.group(i).libs.size >= 2 && t.groups(2).some(g => g.libs.size === 1);
      place(); drawBoard();
      if (good) return later(right, it.t === "capture" ? 600 : 350);
      return later(() => wrong(), 450);
    }
  }
  function wrongAt(i) { S.miss_at = i; later(() => wrong(), 120); }

  // ---------- boss: capture-go ----------
  function openFight(k) {
    const l = ALL[k], bo = BOSS[l.boss];
    preload(bossTexts(l.boss), l.boss);
    S.view = "fight"; S.lesson = k; S.it = { n: l.n };
    const N = l.n, b = new Board(N), c = (N - 1) / 2;
    b.a[c * N + c] = 1; b.a[(c + 1) * N + c + 1] = 1; b.a[c * N + c + 1] = 2; b.a[(c + 1) * N + c] = 2; // the cross-cut start
    S.b = b; S.last = -1; S.gone = []; S.x = []; S.ring = []; S.found = new Set(); S.lock = false;
    S.fight = { boss: l.boss, goal: l.goal, me: 0, it: 0, turn: 1, over: false, line: bo.say.intro, moves: 0 };
    S.typed = null; renderFight(); speak(bo.say.intro, 0, l.boss);
  }
  function renderFight() {
    const f = S.fight, bo = BOSS[f.boss], l = ALL[S.lesson];
    const pips = (n, c) => [...Array(f.goal)].map((_, k) => `<i class="${k < n ? "on " : ""}${c}"></i>`).join("");
    const body = `<div class="ln-label boss">✦ ด่านบอส</div><h2 class="ln-title">จับหมากกับ${bo.name}</h2>` + talk(bo.face, `บอส · ${bo.name}`, f.line, true) +
      `<div class="ln-score"><div class="me"><span class="dot b"></span>เรา <span class="pips">${pips(f.me, "b")}</span></div><div class="vs">กินก่อน ${f.goal} เม็ดชนะ</div><div class="it"><span class="pips">${pips(f.it, "w")}</span> ${bo.name} <span class="dot w"></span></div></div>` +
      `<div class="ln-boardbox"><svg id="lnBoard" role="img" aria-label="กระดาน"></svg></div>`;
    let foot;
    if (f.over) foot = `<div class="ln-sheet ${f.won ? "ok" : "bad"}"><div class="in"><div class="ln-fb"><span class="ln-ico">${f.won ? "🏆" : "↺"}</span><div><b>${f.won ? "ชนะบอสแล้ว!" : "เกือบแล้ว!"}</b><p>${f.won ? "ไปด่านต่อไปกัน" : "ลองใหม่อีกครั้งนะ"}</p></div></div>
      <button class="ln-btn big ${f.won ? "pri" : "red"}" data-act="${f.won ? "bossdone" : "retry"}">${f.won ? "ต่อไป" : "ลองใหม่"}</button></div></div>`;
    else foot = `<div class="ln-sheet"><div class="in"><span class="ln-turn">${f.turn === 1 ? "ตาเรา (ดำ)" : bo.name + " กำลังคิด…"}</span><span></span></div></div>`;
    S.total = 1; S.done = f.won ? 1 : 0;
    $("learn").innerHTML = lessonShell(body, foot).replace(/<span class="ln-hearts[^<]*<\/span>/, `<span class="ln-boss-t">${l.t}</span>`);
    $("learn").className = "learn lesson fight";
    drawBoard();
    if (S.typed !== f.line) { S.typed = f.line; typeIn($("learn").querySelector(".ln-bub p")); }
  }
  function fightMove(c, i) {
    const f = S.fight, r = S.b.play(c, i);
    if (!r.ok) return false;
    f.moves++; S.last = i; S.gone = r.cap.map(s => [s, 3 - c]);
    const bs = BOSS[f.boss].say;
    if (r.cap.length) { if (c === 1) { f.me += r.cap.length; f.line = bs.capOk; SFX.cap(); } else { f.it += r.cap.length; f.line = bs.capBad; SFX.bad(); } }
    else SFX.stone();
    if (f.me >= f.goal || f.it >= f.goal) return endFight(f.me >= f.goal), true;
    f.turn = 3 - c;
    return true;
  }
  function endFight(won) {
    const f = S.fight; f.over = true; f.won = won; f.turn = 0;
    f.line = BOSS[f.boss].say[won ? "win" : "lose"];
    renderFight();
    if (won) { SFX.done(); confetti(40); speak(f.line, 600, f.boss); }
    else { later(SFX.lose, 300); speak(f.line, 900, f.boss); }
  }
  function tapFight(i) {
    const f = S.fight;
    if (S.b.a[i]) return;
    if (!fightMove(1, i)) { S.x = [i]; SFX.heart(); drawBoard(); later(() => { S.x = []; drawBoard(); }, 600); return; }
    if (f.over) return;
    const bs = BOSS[f.boss].say;
    if (f.line === bs.capOk) speak(f.line, 250, f.boss); else f.line = bs.turn;
    renderFight(); S.lock = true;
    later(() => {
      S.lock = false;
      const j = botMove(S.b, 2, BOSS[f.boss].see);
      if (j < 0 || f.moves > S.b.N * S.b.N * 2) return endFight(f.me > f.it);
      const before = f.it; fightMove(2, j);
      if (f.over) return;
      if (f.it > before) speak(bs.capBad, 250, f.boss);
      else if (S.b.groups(1).some(g => g.libs.size === 1)) { if (f.line !== bs.warn) speak(bs.warn, 200, f.boss); f.line = bs.warn; }
      else f.line = bs.yours;
      renderFight();
    }, 650);
  }

  function confetti(n) {
    const box = document.createElement("div"); box.className = "ln-confetti";
    const cols = ["#58cc02", "#1cb0f6", "#ff9600", "#ce82ff", "#ff4b4b", "#ffc800"];
    for (let k = 0; k < n; k++) { const e = document.createElement("i"); e.style.cssText = `left:${Math.random() * 100}%;background:${cols[k % cols.length]};animation-delay:${Math.random() * .3}s;--dx:${(Math.random() - .5) * 160}px;--r:${Math.random() * 720}deg`; box.appendChild(e); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 2200);
  }

  // ---------- wiring ----------
  let wired = false;
  function ptAt(e) {
    const svg = $("lnBoard"); if (!svg) return -1;
    const N = S.b.N, p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse()), x = Math.round(q.x), y = Math.round(q.y);
    const cx = Math.max(0, Math.min(N - 1, x)), cy = Math.max(0, Math.min(N - 1, y)); // any tap on the board counts, snapped to the nearest point
    return q.x < -.75 || q.y < -.75 || q.x > N - .25 || q.y > N - .25 ? -1 : cy * N + cx;
  }
  function wire() {
    wired = true;
    const root = $("learn");
    root.addEventListener("click", e => {
      if (e.target.closest("#lnBoard")) { if (!canTap()) return; const i = ptAt(e); if (i < 0) return; return S.view === "fight" ? tapFight(i) : tapLesson(i); }
      const t = e.target.closest("button"); if (!t || t.disabled) return;
      ctx();
      if (t.dataset.lesson !== undefined) return openLesson(+t.dataset.lesson);
      if (t.dataset.pick !== undefined) {
        const pop = t.parentNode.querySelector(".ln-pop"), was = !pop.hidden;
        root.querySelectorAll(".ln-pop").forEach(p => { p.hidden = true; p.parentNode.classList.remove("open"); });
        pop.hidden = was; t.parentNode.classList.toggle("open", !was); SFX.tap();
        const pl = ALL[+t.dataset.pick]; if (!was && pl && pl.items) preload(pl.items.slice(0, 3).map(it => it.say)); // head start before START
        return;
      }
      if (t.dataset.opt !== undefined) { if (S.state !== "ask") return; return +t.dataset.opt === S.it.ok ? (SFX.tap(), right()) : wrong(+t.dataset.opt); }
      const act = t.dataset.act;
      if (act === "voice") { voiceOn = !voiceOn; try { localStorage.setItem("gonn.learnVoice", voiceOn ? "1" : "0"); } catch (e) {} if (!voiceOn) stopVoice(); t.querySelector("img").classList.toggle("off", !voiceOn); return; }
      if (act === "again") return S.view === "fight" ? speak(S.fight.line, 0, S.fight.boss) : speak(S.it.say);
      if (act === "next") { SFX.tap(); if (S.state === "fb" && S.hearts <= 0) return; if (S.state === "info") { S.queue.shift(); S.done++; } return nextItem(); }
      if (act === "hint") { S.hintShown = true; S.usedHint = true; S.pose = "point"; if (S.it.ans && !["stone"].includes(S.it.t)) S.ring = L(S.it.ans, S.it.n || 5).slice(0, 1); SFX.tap(); renderLesson(); return speak(S.it.hint); }
      if (act === "skip") { S.queue.push(S.queue.shift()); return nextItem(); }
      if (act === "quit" || act === "path") { SFX.tap(); return renderPath(); }
      if (act === "retry") return openLesson(S.lesson);
      if (act === "bossdone") { finish(ALL[S.lesson].id, 3, 30); return renderPath(); }
      if (act === "home") { close(); return api.onHome && api.onHome(); }
      if (act === "play") { close(); return api.onPlay && api.onPlay(); }
      if (act === "book") { close(); return api.onBook && api.onBook(); }
    });
  }
  function close() { clearT(); stopVoice(); $("learn").hidden = true; document.body.classList.remove("learning"); }
  api.open = function () {
    prog = loadP();
    if (!wired) wire();
    $("learn").hidden = false; document.body.classList.add("learning"); window.scrollTo(0, 0);
    renderPath();
  };
  // a line for the main menu card
  api.summary = function () {
    prog = loadP(); const cur = current(), s = liveStreak();
    if (cur >= ALL.length) return `เรียนจบครบ ${ALL.length} ด่านแล้ว 🏆`;
    if (!cur) return "เรียนหมากล้อมจากศูนย์ มีเสียงพูด เหมาะกับเด็กและมือใหม่";
    return `เรียนต่อ: ${ALL[cur].t} · ${cur}/${ALL.length} ด่าน${s ? ` · 🔥 ${s} วัน` : ""}`;
  };
  api.started = () => Object.keys(loadP().stars).length > 0;
  if (typeof window !== "undefined" && /[?&]lntest/.test(location.search)) window.__lnItem = () => S.it;
  api._test = { Board, P, L, UNITS, ALL, BOSS, SPOKEN, bossTexts, botMove, texts, vkey };
  return api;
})();
if (typeof module !== "undefined") module.exports = Learn;
