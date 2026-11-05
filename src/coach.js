// Beginner coach ("ครูมิชิโอะ", Kru Michio): a teacher character who plays the player on 19x19 and, during the game, offers three choices
// for the player's move with the idea behind each, comments on the player's moves and her own, and answers typed
// questions in Thai. The choices are read with KataGo b10 (how good each move really is) together with the HumanSL
// network at a club-kyu profile (how natural the move is for a human), so the suggestions are good moves a beginner can
// understand and remember, not the engine's most surprising one. Everything runs in the browser: no server, no LLM.
const Coach = (function () {
  // set by the game: E, ai() (KataGo b10 or null), humanAI() (the HumanSL brain set to 9 dan, or null), state()
  // ({ n, moves, human, live, myTurn }), play(p), preview(p), marks(list), evalMs(), komi()
  const api = {};
  const LETTERS = "ABCDEFGHJKLMNOPQRST";
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const REGION = [["มุมซ้ายบน", "ด้านบน", "มุมขวาบน"], ["ด้านซ้าย", "กลางกระดาน", "ด้านขวา"], ["มุมซ้ายล่าง", "ด้านล่าง", "มุมขวาล่าง"]];
  const CN = [null, "ดำ", "ขาว"];
  const NAME = "ครูมิชิโอะ", FACE = "chars/michio_face.jpg";
  let E, Board, PASS, BLACK, WHITE;
  let on = false, tok = 0, chain = Promise.resolve(), busy = 0;
  let picks = null;      // the choices for the position on the board: { key, list: [{ move, letter, grade, ... }] }
  let phaseTold = {};    // which phase talks were given this game

  // one network job at a time, and the game's own AI waits for it (idle) so the two never share the network's profile
  function queue(fn) { busy++; const p = chain.then(fn); chain = p.catch(e => console.warn("coach", e)).finally(() => { busy--; renderBusy(); }); renderBusy(); return p; }
  api.idle = () => chain;

  // ---------- board helpers ----------
  const st = () => api.state();
  const keyOf = ms => ms.join(",");
  function boardOf(n, ms) { const b = new Board(n); for (const m of ms) b.play(m); return b; }
  const oi = (b, p) => { const [x, y] = b.xy(p); return y * 19 + x; };
  function name(n, p) { if (p === PASS) return "ผ่าน"; const b = new Board(n), [x, y] = b.xy(p); return LETTERS[x] + (n - y); }
  function regionOf(n, x, y) { const t = v => v < n / 3 ? 0 : v < 2 * n / 3 ? 1 : 2; return REGION[t(y)][t(x)]; }
  const regionAt = (b, p) => { const [x, y] = b.xy(p); return regionOf(st().n, x, y); };
  function parsePoint(n, text) {
    const m = /(?:^|[^A-Za-z])([A-HJ-Ta-hj-t])\s?-?\s?(1[0-9]|[1-9])(?![0-9])/.exec(text);
    if (!m) return null;
    const x = LETTERS.indexOf(m[1].toUpperCase()), y = n - +m[2];
    if (x < 0 || x >= n || y < 0 || y >= n) return null;
    return new Board(n).pt(x, y);
  }
  function chains(b) {
    const m = new Map();
    for (const p of b.pts) { const c = b.color[p]; if (c !== BLACK && c !== WHITE) continue; const h = b.head[p]; if (!m.has(h)) m.set(h, { c, stones: [] }); m.get(h).stones.push(p); }
    return m;
  }
  function centre(b, n, stones) { let sx = 0, sy = 0; for (const p of stones) { const [x, y] = b.xy(p); sx += x; sy += y; } return regionOf(n, Math.round(sx / stones.length), Math.round(sy / stones.length)); }
  const pts = v => (Math.round(Math.abs(v) * 10) / 10).toFixed(1);

  // ---------- what a beginner should know ----------
  // the idea behind a reason (Analysis reasons carry a kind), in plain words
  const IDEA = {
    capture: "กินหมากได้ทั้งได้แต้ม และทำให้หมากเรารอบๆ ปลอดภัยขึ้น",
    escape: "หมากที่โดนอะตาริ (เหลือลมหายใจเดียว) ต้องรีบหนีให้ลมหายใจเพิ่ม หรือถ้าหนีไม่รอดก็ยอมทิ้งแล้วไปเล่นที่อื่น",
    libs: "กลุ่มที่ลมหายใจน้อยเสี่ยงโดนกิน เติมลมหายใจไว้ก่อนจะปลอดภัย",
    atari: "อะตาริคือทำให้หมากอีกฝ่ายเหลือลมหายใจเดียว เขาต้องรีบแก้ เราได้เป็นฝ่ายคุมเกม",
    squeeze: "ลดลมหายใจกลุ่มอีกฝ่าย ให้เขาต้องคอยระวังตลอด",
    connect: "หมากที่ต่อกันเป็นกลุ่มเดียวแข็งแรงกว่าหมากที่แยกกัน อีกฝ่ายตัดไม่ได้ก็ไม่ต้องห่วง",
    cut: "ตัดหมากอีกฝ่ายให้แยกกัน เขาจะมีกลุ่มอ่อนหลายกลุ่มที่ต้องดูแลพร้อมกัน",
    save: "ดูแลกลุ่มที่อ่อนก่อนเสมอ กลุ่มที่ตายจะเสียทั้งหมากและพื้นที่รอบๆ",
    safe: "กลุ่มที่ปลอดภัยแล้วไม่ต้องห่วง เราจะไปบุกหรือสร้างพื้นที่ที่อื่นได้เต็มที่",
    strong: "กลุ่มที่แข็งแรงคือกลุ่มที่มีที่ว่างพอจะสร้างสองห้อง หรือเชื่อมกับเพื่อนได้",
    kill: "กลุ่มอีกฝ่ายที่ไม่มีที่สร้างสองห้องจะตาย หมากทั้งกลุ่มกลายเป็นแต้มของเรา",
    attack: "บุกกลุ่มที่อ่อนของอีกฝ่าย ระหว่างที่เขาหนี เราได้กำแพงหรือพื้นที่ไปฟรีๆ",
    press: "กดดันกลุ่มอีกฝ่ายจากด้านนอก เขาต้องหนีเข้าที่แคบ ส่วนเราได้หันหน้าเข้าพื้นที่กว้าง",
    ifcapt: "ถ้าอีกฝ่ายได้เล่นจุดนี้ก่อนเราจะโดนกิน จุดแบบนี้รีบกว่าการสร้างพื้นที่",
    ifdanger: "ถ้าอีกฝ่ายได้เล่นจุดนี้ก่อน กลุ่มเราจะลำบาก ดูแลก่อนเสียหาย",
    ifescape: "ถ้าเราไม่เล่น กลุ่มอ่อนของอีกฝ่ายจะรอด จุดนี้ปิดทางหนีของเขา",
    vital: "จุดที่ทั้งสองฝ่ายอยากได้คือจุดสำคัญ ใครได้ก่อนได้เปรียบ",
    urgent: "ตาเร่งด่วน (ถ้าไม่เล่นจะเสียหาย) สำคัญกว่าตาที่แค่ใหญ่",
    build: "สร้างพื้นที่คือการล้อมจุดว่างไว้ให้เป็นของเรา ตอนจบเกมนับจุดเหล่านี้เป็นแต้ม",
    reduce: "ลดพื้นที่อีกฝ่ายก่อนที่มันจะปิดสนิทกลายเป็นแต้มของเขา",
    corner: "หลัก มุม → ด้าน → กลาง: มุมใช้หมากน้อยที่สุดในการล้อมพื้นที่ เพราะมีขอบกระดานช่วยกั้นสองด้าน",
    "33": "จุด 3-3 คือทางบุกเข้าไปใต้หมากอีกฝ่ายที่มุม เพื่อแย่งพื้นที่มุมมาเป็นของเรา",
    kakari: "คาคาริคือเข้าไปประชิดมุมที่อีกฝ่ายจองไว้เม็ดเดียว ก่อนเขาจะปิดมุมได้แน่น",
    shimari: "ชิมาริคือวางเม็ดที่สองปิดมุมของเรา มุมจะแน่นจนบุกยาก",
    side: "มุมจองครบแล้ว ต่อไปคือขยายไปตามด้าน ที่ยังกว้างและว่าง",
    answer: "อีกฝ่ายเพิ่งมาคุกคามหมากเรา ตอบรับให้กลุ่มเราไม่เสียหายก่อน",
    tenuki: "ไม่ต้องตอบทุกตาที่อีกฝ่ายเดิน ถ้าที่อื่นใหญ่กว่า ไปเล่นที่ใหญ่กว่า (เรียกว่าเทนูกิ)",
    pass: "เกมใกล้จบแล้ว ถ้าไม่มีจุดไหนได้แต้มเพิ่ม ผ่านได้เลย",
    shape: "บางตาไม่ได้กินหรือตัดอะไร แต่ทำให้หมากเรามีรูปทรงแข็งแรง เชื่อมกันดี และไปต่อได้หลายทาง"
  };
  // answers to typed words: [pattern, answer]; the first match wins
  const GLOSSARY = [
    [/ลมหายใจ|ลิเบอร์ตี้|liberty/i, "<b>ลมหายใจ</b> คือจุดว่างที่อยู่ติดหมาก (บน ล่าง ซ้าย ขวา ไม่นับแนวทแยง) หมากที่ติดกันใช้ลมหายใจร่วมกัน ถ้าลมหายใจหมด หมากทั้งกลุ่มโดนกินออกจากกระดาน"],
    [/อะตาริ|atari/i, "<b>อะตาริ</b> คือตอนที่หมากเหลือลมหายใจแค่เดียว ถ้าเป็นหมากเรา ต้องรีบหนี (ต่อให้ลมหายใจเพิ่ม) หรือยอมทิ้ง ถ้าเป็นหมากเขา ตาหน้าเราก็กินได้เลย"],
    [/บันได|ลาดเดอร์|ladder|shicho|ชิโจ/i, "<b>บันได (ชิโจ)</b> คือการไล่อะตาริซ้ำๆ เป็นแนวทแยงจนหมากชนขอบแล้วโดนกิน ก่อนหนีให้ดูก่อนว่าบนเส้นทางทแยงนั้นมีหมากเราช่วยไหม ถ้าไม่มี อย่าหนี จะยิ่งเสียเยอะ"],
    [/ห้อง|สองห้อง|eye/i, "<b>ห้อง</b> คือจุดว่างที่ล้อมด้วยหมากเราทั้งหมด กลุ่มที่มี <b>สองห้องแยกกัน</b> จะไม่มีวันโดนกิน เพราะอีกฝ่ายลงในห้องไม่ได้ทั้งสองห้องพร้อมกัน นี่คือหัวใจของการทำให้กลุ่มรอด"],
    [/(^|[^ก-๙])โคะ?([^ก-๙]|$)|\bko\b/i, "<b>โคะ</b> คือรูปที่กินกันไปกินกันมาได้ไม่จบ กติกาจึงห้ามกินคืนทันที ต้องไปเล่นที่อื่นก่อนหนึ่งตา (เรียกว่าหาตาขู่) แล้วค่อยกลับมากินคืน"],
    [/ชิมาริ|shimari|ปิดมุม/i, "<b>ชิมาริ (ปิดมุม)</b> คือเล่นเม็ดที่สองที่มุมของเราเอง เช่นจาก 4-4 ไปที่ 3-6 หรือ 4-6 ทำให้มุมแน่นจนอีกฝ่ายบุกยาก"],
    [/คาคาริ|kakari|ประชิดมุม/i, "<b>คาคาริ</b> คือเข้าไปประชิดมุมที่อีกฝ่ายจองไว้เม็ดเดียว ไม่ให้เขาปิดมุมได้ง่ายๆ ปกติเล่นห่างจากหมากเขาสองสามช่อง"],
    [/3-3|สามสาม|ซันซัง|san-san/i, "<b>จุด 3-3</b> คือจุดที่ห่างขอบ 3 เส้นทั้งสองด้าน ใช้จองมุมแบบแน่นๆ หรือบุกเข้าใต้หมาก 4-4 ของอีกฝ่ายเพื่อแย่งพื้นที่มุม"],
    [/4-4|ดาว|ฮอชิ|hoshi|star/i, "<b>จุดดาว (4-4)</b> คือจุดที่ห่างขอบ 4 เส้น จองมุมได้เร็วด้วยเม็ดเดียวและหันออกไปทางด้านได้ดี แต่มุมยังโดนบุกที่ 3-3 ได้"],
    [/โจเซกิ|joseki/i, "<b>โจเซกิ</b> คือลำดับการเล่นที่มุมที่นักเล่นยุคก่อนๆ ศึกษามาแล้วว่ายุติธรรมกับทั้งสองฝ่าย มือใหม่ไม่ต้องจำ แค่ตอบให้หมากเราไม่โดนตัดและยังมีที่สร้างห้องก็พอ"],
    [/ฟุเซกิ|fuseki|เปิดเกม/i, "<b>ช่วงเปิดเกม</b> บนกระดาน 19×19 ให้จำหลักเดียว <b>มุม → ด้าน → กลาง</b> จองมุมก่อน (มีขอบช่วยกั้นสองด้าน) แล้วขยายตามด้าน (มีขอบช่วยด้านเดียว) กลางกระดานเก็บไว้ทีหลังเพราะล้อมยากที่สุด"],
    [/เทนูกิ|tenuki/i, "<b>เทนูกิ</b> คือไม่ตอบหมากที่อีกฝ่ายเพิ่งเดิน แล้วไปเล่นจุดที่ใหญ่กว่าที่อื่น ทำได้เมื่อหมากเราตรงนั้นยังไม่เสียหายหนักถ้าไม่ตอบ"],
    [/เซนเต|sente|โกเต|gote|จังหวะ/i, "<b>เซนเต</b> คือตาที่อีกฝ่ายต้องตอบ แล้วเราได้เล่นต่อ (เราคุมจังหวะ) <b>โกเต</b> คือตาที่จบแล้วอีกฝ่ายได้เลือกเล่นที่ไหนก็ได้ ตาเซนเตจึงมีค่ากว่าตาโกเตที่ได้แต้มเท่ากัน"],
    [/โยเซ|yose|ปลายเกม|ท้ายเกม/i, "<b>ช่วงปลายเกม</b> เขตแดนเกือบชัดแล้ว ให้ปิดชายแดนของเรา เก็บจุดที่ได้แต้มมากที่สุดก่อน และเล่นตาที่อีกฝ่ายต้องตอบ (เซนเต) ก่อนตาที่ไม่ต้องตอบ"],
    [/กลางเกม|ต่อสู้/i, "<b>ช่วงกลางเกม</b> ดูว่ากลุ่มไหนยังไม่มีสองห้อง (กลุ่มอ่อน) ดูแลกลุ่มอ่อนของเราก่อน แล้วค่อยบุกกลุ่มอ่อนของอีกฝ่าย ระหว่างไล่บุก เราจะได้พื้นที่หรือกำแพงเพิ่มเอง"],
    [/โคมิ|komi/i, "<b>โคมิ</b> คือแต้มที่ขาวได้เพิ่มตอนนับ (ที่นี่ 7.5 แต้ม) เพราะดำได้เดินก่อนซึ่งได้เปรียบ ครึ่งแต้มทำให้ไม่มีเสมอ"],
    [/นับแต้ม|นับคะแนน|ชนะยังไง|ชนะได้ยังไง|แพ้ชนะ|กติกา/i, "เกมนี้นับแบบ<b>พื้นที่ (กติกาจีน)</b> แต้ม = หมากเราที่ยังอยู่บนกระดาน + จุดว่างที่หมากเราล้อมไว้ ขาวได้โคมิเพิ่ม 7.5 ใครแต้มมากกว่าชนะ เกมจบเมื่อทั้งสองฝ่ายผ่านติดกัน"],
    [/ผ่าน|pass/i, "<b>ผ่าน</b> คือไม่วางหมากตานี้ ใช้ตอนท้ายเกมที่ไม่มีจุดไหนได้แต้มเพิ่มแล้ว ถ้าผ่านติดกันทั้งสองฝ่าย เกมจะจบและนับแต้ม ช่วงต้นเกมอย่าผ่านนะ เสียจังหวะเปล่าๆ"],
    [/ตัด|cut/i, "<b>การตัด</b> คือวางหมากแทรกระหว่างหมากอีกฝ่ายสองเม็ดที่ยังไม่ต่อกัน ให้แยกเป็นสองกลุ่ม ส่วนตอนอีกฝ่ายจะตัดเรา ให้<b>ต่อ</b>หรือ<b>เชื่อม</b>ไว้ก่อนถ้าจุดตัดนั้นอันตราย"],
    [/เชื่อม|ต่อ(หมาก|กัน)|connect/i, "<b>การเชื่อม</b> ทำให้หมากหลายเม็ดกลายเป็นกลุ่มเดียว ใช้ลมหายใจร่วมกัน แข็งแรงกว่าและไม่ต้องห่วงโดนตัด"],
    [/พื้นที่|เขต|อาณาเขต|territory/i, "<b>พื้นที่</b> คือจุดว่างที่หมากเราล้อมไว้จนอีกฝ่ายเข้ามาสร้างกลุ่มที่รอดไม่ได้ ตอนจบเกมทุกจุดนับเป็นแต้ม มุมล้อมง่ายที่สุด รองลงมาคือด้าน กลางกระดานยากที่สุด"],
    [/อิทธิพล|กำแพง|influence/i, "<b>กำแพง (อิทธิพล)</b> คือหมากแถวยาวที่หันหน้าออกไปพื้นที่กว้าง ยังไม่ใช่แต้มทันที แต่ใช้บุกหรือสร้างพื้นที่ใหญ่ตรงที่มันหันไปได้ อย่าเอากำแพงไปล้อมพื้นที่ใกล้ๆ ตัวเอง ให้ใช้มันไล่บุก"],
    [/กิน|จับ|capture/i, "<b>การกิน</b> คือปิดลมหายใจของหมากอีกฝ่ายจนหมด แล้วเอาหมากนั้นออก แต่ในเกมจริง การกินไม่ใช่เป้าหมายหลัก <b>พื้นที่</b>ต่างหากที่ตัดสินแพ้ชนะ"],
    [/หมากต่อ|แฮนดิแคป|handicap/i, "<b>หมากต่อ</b> คือให้ฝ่ายที่อ่อนกว่าวางหมากดำไว้ก่อนหลายเม็ดที่จุดดาว เกมกับครูมิชิโอะเป็นเกมเสมอกัน ไม่มีหมากต่อ"]
  ];

  // ---------- chat ----------
  function bubble(html, who) {
    const el = document.createElement("div");
    el.className = "co-msg " + (who === "me" ? "me" : "bot"); // not "coach": that is the panel's own class
    el.innerHTML = who === "me" ? `<div class="co-b">${html}</div>` : `<img src="${FACE}" alt="" width="160" height="160"><div class="co-b">${html}</div>`;
    const log = $("coLog"); log.appendChild(el);
    while (log.children.length > 80) log.removeChild(log.firstChild);
    // the compact strip (portrait) shows the start of the newest message; the open chat follows the bottom
    log.scrollTop = $("coach").classList.contains("open") || !matchMedia("(max-aspect-ratio: 9/8)").matches ? log.scrollHeight : el.offsetTop;
    return el;
  }
  const say = html => bubble(html, "coach");
  api.say = line => { if (on) say(esc(line)); }; // the character's own talk (hello, captures...) goes into the chat
  function setChips() {
    const s = st(), list = [["ควรเดินตรงไหน?", "ควรเดินตรงไหน"], ["ภาพรวมตอนนี้", "ภาพรวมตอนนี้ควรทำอะไร"]];
    if (s.moves.length && s.moves[s.moves.length - 1] !== PASS && s.moves.length % 2 === (s.human === BLACK ? 0 : 1)) list.push(["ทำไมครูเดินตานั้น?", "ทำไมครูเดินตานั้น"]);
    if (myLast(s) !== null) list.push(["ตาที่ฉันเดินดีไหม?", "ตาที่ฉันเดินเมื่อกี้ดีไหม"]);
    list.push(["ใครนำอยู่?", "ใครนำอยู่"], ["กลุ่มไหนอันตราย?", "กลุ่มไหนอันตราย"]);
    $("coChips").innerHTML = list.map(([t, q]) => `<button type="button" class="co-chip" data-q="${esc(q)}">${esc(t)}</button>`).join("");
  }
  function myLast(s) {
    for (let i = s.moves.length - 1; i >= 0; i--) if ((i % 2 === 0 ? BLACK : WHITE) === s.human) return s.moves[i] === PASS ? null : i;
    return null;
  }
  function renderBusy() { const el = $("coBusy"); if (el) el.hidden = !(on && busy > 0); }

  // ---------- phase of the game (19x19) ----------
  function emptyCorners(b, n) {
    const out = [], z = n >= 19 ? 6 : 4;
    for (const [cx, cy, nm] of [[0, 0, "มุมซ้ายบน"], [1, 0, "มุมขวาบน"], [0, 1, "มุมซ้ายล่าง"], [1, 1, "มุมขวาล่าง"]]) {
      let any = false;
      for (const p of b.pts) { if (!b.color[p] || b.color[p] > 2) continue; const [x, y] = b.xy(p); if ((cx ? x >= n - z : x < z) && (cy ? y >= n - z : y < z)) { any = true; break; } }
      if (!any) out.push(nm);
    }
    return out;
  }
  function phaseOf(b, n, len, ev) {
    if (len < 50 && (emptyCorners(b, n).length || len < 24)) return "open";
    if (ev) {
      let open = 0, all = 0;
      for (const p of b.pts) if (b.color[p] === 0) { all++; if (Math.abs(ev.own[oi(b, p)]) < 0.5) open++; }
      if (len >= 120 && open < all * 0.18) return "end";
    }
    return len >= 190 ? "end" : "mid";
  }
  const PHASE_TALK = {
    open: "<b>ช่วงเปิดเกม</b> กระดาน 19×19 กว้างมาก หลักที่ครูอยากให้จำคือ <b>มุม → ด้าน → กลาง</b> มุมล้อมพื้นที่ง่ายที่สุดเพราะมีขอบช่วยกั้นสองด้าน รองลงมาคือด้าน กลางกระดานยากที่สุด ยังไม่ต้องรีบกินหมากใคร จองที่ใหญ่ๆ ก่อน",
    mid: "<b>เข้าสู่กลางเกม</b> ตอนนี้ให้มองหา<b>กลุ่มอ่อน</b> คือกลุ่มที่ยังไม่มีที่สร้างสองห้อง ดูแลกลุ่มอ่อนของเราก่อน แล้วค่อยบุกกลุ่มอ่อนของอีกฝ่าย ระหว่างไล่บุก เราจะได้พื้นที่เพิ่มเอง",
    end: "<b>ใกล้ปลายเกมแล้ว</b> เขตแดนส่วนใหญ่ชัดแล้ว ตอนนี้ให้ปิดชายแดนพื้นที่ของเรา เก็บจุดที่ได้แต้มมากก่อน และเลือกตาที่อีกฝ่ายต้องตอบก่อน (เซนเต) เมื่อไม่มีจุดได้แต้มแล้วค่อยผ่าน"
  };

  // ---------- reading a position ----------
  function gradeOf(loss) {
    if (loss <= 0.8) return { cls: "best", t: "ดีที่สุด" };
    if (loss <= 2) return { cls: "good", t: "ดีมาก" };
    if (loss <= 4) return { cls: "normal", t: "พอใช้" };
    return { cls: "bad", t: "ไม่แนะนำ" };
  }
  // the three choices: KataGo's reading of every candidate (from the search, or one look after the move) and HumanSL's
  // view of how natural each one is; choice A is the most natural of the near-best moves, B a good move with another idea,
  // C either a third good move or the tempting one a beginner would play that reads clearly worse (a lesson)
  async function readChoices(my) {
    const AI = api.ai(); if (!AI) return null;
    const s0 = st(), n = s0.n, moves = s0.moves.slice(), b = boardOf(n, moves), c = b.toPlay;
    const ms = api.evalMs ? api.evalMs() : 50;
    // the best move comes from HumanSL at its strongest (9 dan) reading ahead with KataGo's eye for who is winning
    // (owner 2026-11-01); without it (still loading, or it failed) KataGo b10 reads alone
    let H = null; try { H = await api.humanAI(); } catch (e) { H = null; }
    if (my !== tok) return null;
    const brain = H || AI;
    let s;
    try { s = await brain.think(n, moves, api.komi(), { visits: H ? 600 : 2500, timeMs: ms > 150 ? 3000 : 4000, batch: H ? 1 : ms < 40 ? 16 : 8, top: 10, shouldStop: () => my !== tok }); }
    catch (e) { if (!H) throw e; s = await AI.think(n, moves, api.komi(), { visits: 2500, timeMs: 3000, batch: 8, top: 10, shouldStop: () => my !== tok }); }
    if (my !== tok) return null;
    let hp = null;
    try { hp = H ? (await H.evaluate(n, moves, api.komi())).policy : null; } catch (e) { hp = null; }
    if (my !== tok) return null;
    const maxN = s.top[0].visits;
    const cand = new Map();
    for (const t of s.top) if (t.move !== PASS && (t.visits >= Math.max(3, maxN * 0.03) || cand.size < 3)) cand.set(t.move, { move: t.move, visits: t.visits, sLead: t.lead, win: t.winrate });
    if (hp) {
      const order = []; for (let i = 0; i < 361; i++) order.push(i);
      order.sort((a, z) => hp[z] - hp[a]);
      for (const i of order.slice(0, 6)) { const p = b.pt(i % 19, (i / 19) | 0); if (p !== undefined && b.isLegal(p, c) && !cand.has(p)) cand.set(p, { move: p, visits: 0 }); }
    }
    const list = [...cand.values()];
    if (!list.length) return { pass: true, s, n, moves };
    // one look after every candidate, so moves the search skipped compare fairly with the rest
    const evs = await AI.evalMany(n, list.map(x => moves.concat([x.move])), api.komi());
    if (my !== tok) return null;
    list.forEach((x, i) => { x.one = -evs[i].lead; x.hp = hp ? hp[oi(b, x.move)] : 0; });
    const best = cand.get(s.top[0].move) || list[0];
    for (const x of list) x.loss = x.visits >= 40 && best.visits >= 40 ? Math.max(0, best.sLead - x.sLead) : Math.max(0, best.one - x.one);
    best.loss = 0;
    const by = (arr, f) => arr.slice().sort((a, z) => f(z) - f(a))[0];
    const far = (p, q) => { const [x1, y1] = b.xy(p), [x2, y2] = b.xy(q); return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) >= 3; };
    const easy = x => x.hp + (x.visits / maxN) * 0.15; // natural for a human, and read well by the engine
    const A = best; // HumanSL's best move is always choice A
    const restGood = list.filter(x => x !== A && x.loss <= 3);
    const B = by(restGood.filter(x => far(x.move, A.move)), easy) || by(restGood, easy);
    let C = null, trap = false;
    const tempt = by(list.filter(x => x !== A && x !== B && x.loss >= 3 && x.hp >= 0.04), x => x.hp);
    if (tempt) { C = tempt; trap = true; }
    else { const rest = list.filter(x => x !== A && x !== B && x.loss <= 5); C = by(rest.filter(x => far(x.move, A.move) && (!B || far(x.move, B.move))), easy) || by(rest, easy); }
    const chosen = [A, B, C].filter(Boolean);
    const why = await Analysis.explainFor(AI, n, moves, chosen.map(x => x.move));
    if (my !== tok) return null;
    chosen.forEach((x, i) => { x.why = why[i].why; x.letter = "ABC"[i]; x.grade = gradeOf(x.loss); x.trap = x === C && trap; x.region = regionAt(b, x.move); });
    // the side to move's chance and lead, for the summary
    return { key: keyOf(moves), n, moves, b, c, s, list: chosen, best };
  }
  function ideaOf(why) { const r = why.find(x => !x.neg && IDEA[x.k]); return r ? IDEA[r.k] : IDEA.shape; }
  function pickHtml(x, n, told) {
    const good = x.why.filter(r => !r.neg && !r.fb).slice(0, 2), bad = x.why.filter(r => r.neg).slice(0, 1);
    let h = `<div class="co-pick g-${x.grade.cls}"><div class="co-ph"><b class="co-l">${x.letter}</b> <b>${name(n, x.move)}</b> <span class="co-rg">${x.region}</span> <span class="g-t g-${x.grade.cls}">${x.trap ? "ระวัง!" : x.grade.t}</span></div>`;
    if (x.trap) {
      h += `<div>ตานี้ดูน่าเดินและมือใหม่เลือกกันบ่อย${good.length ? ` (${esc(good[0].t)})` : ""} แต่อ่านลึกแล้ว<b>เสียราว ${pts(x.loss)} แต้ม</b>${bad.length ? ` เพราะ${esc(bad[0].t)}` : " เพราะมีจุดที่ใหญ่หรือรีบกว่านี้"}</div>`;
    } else {
      h += good.length ? `<ul>${good.map(r => `<li>${esc(r.t)}</li>`).join("")}</ul>` : `<div>${esc(x.why[0].t)}</div>`;
      if (bad.length) h += `<div class="co-warn">ข้อควรระวัง: ${esc(bad[0].t)}</div>`;
      const idea = ideaOf(x.why);
      if (!told.has(idea)) { told.add(idea); h += `<div class="co-idea">💡 ${idea}</div>`; }
      if (x.hp >= 0.15 && !told.has("common")) { told.add("common"); h += `<div class="co-dim">เป็นตาที่คนเล่นกันเป็นปกติ จำรูปนี้ไว้ใช้ได้บ่อย</div>`; }
    }
    h += `<div class="co-acts"><button type="button" data-see="${x.move}">👀 ดูบนกระดาน</button><button type="button" class="co-go" data-play="${x.move}">เดิน ${x.letter} (${name(n, x.move)})</button></div></div>`;
    return h;
  }
  function showPicks(r) {
    picks = r;
    api.marks(r ? r.list.map(x => ({ p: x.move, label: x.letter, cls: x.trap ? "bad" : x.grade.cls })) : []);
    $("coPicks").innerHTML = r ? r.list.map(x => `<button type="button" class="co-pk g-${x.trap ? "bad" : x.grade.cls}" data-see="${x.move}"><b>${x.letter}</b> ${name(r.n, x.move)}<small>${x.trap ? "ระวัง" : x.grade.t}</small></button>`).join("") : "";
  }
  async function suggest(asked) {
    const s = st(); if (!s.myTurn) { say(s.live ? "รอครูเดินก่อนนะ เดี๋ยวครูช่วยดูให้" : "เกมจบแล้วครับ กด ANALYSIS เพื่อทบทวนทั้งเกมได้นะ"); return; }
    const my = tok;
    if (picks && picks.key === keyOf(s.moves)) { if (asked) explainPicks(picks); return; }
    const wait = say("ขอครูดูกระดานแป๊บนึงนะ… 🤔");
    const r = await queue(() => my !== tok ? null : readChoices(my));
    if (my !== tok) { wait.remove(); return; }
    if (!r) { wait.querySelector(".co-b").textContent = "ตอนนี้ครูยังอ่านกระดานไม่ได้ รอสมอง AI โหลดเสร็จก่อนนะ"; return; }
    wait.remove();
    if (r.pass) { say("ตอนนี้ไม่มีจุดไหนได้แต้มเพิ่มแล้ว กด<b>ผ่าน</b>ได้เลย"); return; }
    // the phase talk, once per phase
    const ph = phaseOf(r.b, r.n, r.moves.length, null);
    if (!phaseTold[ph]) { phaseTold[ph] = true; say(PHASE_TALK[ph] + (ph === "open" ? cornerHint(r.b, r.n) : "")); }
    showPicks(r);
    explainPicks(r);
  }
  function cornerHint(b, n) { const e = emptyCorners(b, n); return e.length ? `<br>ตอนนี้ยังมี<b>มุมว่าง ${e.length} มุม</b> (${e.join(", ")})` : ""; }
  function explainPicks(r) {
    const c = r.c, win = r.s.winrate, lead = r.s.searchLead;
    let h = `<b>ตาคุณ (${CN[c]})</b> ครูเลือกมาให้ ${r.list.length} ทาง วงตัวอักษรบนกระดาน แตะ 👀 เพื่อดู หรือกดเดินได้เลย`;
    h += `<span class="co-dim"> · ตอนนี้${Math.abs(lead) < 1 ? "สูสีกัน" : lead > 0 ? `คุณนำ ~${pts(lead)} แต้ม` : `คุณตาม ~${pts(lead)} แต้ม`} (โอกาสชนะ ${Math.round(win * 100)}%)</span>`;
    const told = new Set();
    h += r.list.map(x => pickHtml(x, r.n, told)).join("");
    say(h);
  }

  // ---------- comments on moves ----------
  // The coach stays quiet move by move (owner 2026-11-02): it speaks only when the player made a clear mistake,
  // or when the teacher's move threatens something the player must answer. The same warning is never repeated.
  const BLUNDER = 5;            // points lost by the player's move before the coach steps in
  const warned = new Map();     // warning key -> move number it was given at
  function fresh(key, gap, at) { const w = warned.get(key); if (w !== undefined && at - w < gap) return false; warned.set(key, at); return true; }
  // after the player's move (runs as one queued step): silent unless it was a trap they were warned about, or it lost a lot of points
  async function judgeMine(prevPicks, moves, m) {
    const AI = api.ai(), s = st(), my = tok; if (!AI || m === PASS) return;
    const asked = prevPicks && prevPicks.key === keyOf(moves) ? prevPicks : null;
    const hit = asked ? asked.list.find(x => x.move === m) : null;
    if (hit && hit.trap) { say(`เลือก ${hit.letter} ${name(s.n, m)} ทั้งที่ครูเตือนแล้วนะ 😅 ลองดูว่าครูจะตอบยังไง แล้วจะเห็นว่าทำไมมันเสีย`); return; }
    if (hit) return; // a good choice: nothing to add
    // a quick look: how much the move lost compared with the position before it (both seen from the player)
    const [ev0, ev1] = await (my !== tok ? null : AI.evalMany(s.n, [moves, moves.concat([m])], api.komi())) || [];
    if (!ev0 || my !== tok) return;
    if (ev0.lead + ev1.lead < BLUNDER) return; // ev0 is from the player to move, ev1 from the teacher
    // a real mistake: find the better move (the choice A the player was shown, or a short b10 reading)
    let better = asked ? asked.list[0].move : null;
    if (better === null) {
      const r = await (my !== tok ? null : AI.think(s.n, moves, api.komi(), { visits: 400, timeMs: 1500, batch: 8, top: 3, shouldStop: () => my !== tok }));
      if (!r || my !== tok || !r.top.length) return;
      better = r.top[0].move;
    }
    if (better === PASS || better === m) return;
    const [evB, evM] = await (my !== tok ? null : AI.evalMany(s.n, [moves.concat([better]), moves.concat([m])], api.komi())) || [];
    if (!evB || my !== tok) return;
    const loss = evM.lead - evB.lead; // both from the teacher's side after the move
    if (loss < BLUNDER) return;
    const ex = await (my !== tok ? null : Analysis.explainFor(AI, s.n, moves, [m, better])) || [];
    if (my !== tok || !ex.length) return;
    const wM = ex[0] ? ex[0].why : [], wB = ex[1] ? ex[1].why : [];
    const bad = wM.find(x => x.neg), good = wB.find(x => !x.neg && !x.fb) || wB.find(x => !x.neg);
    const b = boardOf(s.n, moves);
    let h = `<span class="co-warn">ตาเมื่อกี้ <b>${name(s.n, m)}</b> เสียไปราว ${pts(loss)} แต้มนะ</span>`;
    const [mx, my2] = b.xy(m), line = Math.min(mx, my2, s.n - 1 - mx, s.n - 1 - my2) + 1;
    h += bad ? `<br>เพราะ${esc(bad.t)}` : line <= 2 && moves.length < 80 ? `<br>เพราะหมากบนเส้นที่ ${line} ติดขอบเกินไป ล้อมพื้นที่ได้น้อยมาก ช่วงนี้ควรเล่นเส้นที่ 3–4 ก่อน` : `<br>เพราะตรงนั้นเล็กไป ยังมีจุดที่ใหญ่กว่า หรือเร่งด่วนกว่านี้อยู่`;
    h += `<br>ตรงนี้ดีกว่า: <b>${name(s.n, better)}</b> (${regionAt(b, better)})${good ? ` เพราะ${esc(good.t)}` : ""}`;
    const tip = good && IDEA[good.k];
    if (tip) h += `<br><span class="co-idea">💡 ${tip}</span>`;
    say(h);
  }
  // after the teacher's move: a warning only when it threatens the player's stones or corner
  const THREAT = { atari: "หมากของคุณเหลือลมหายใจเดียวแล้ว ถ้าไม่หนีหรือต่อ จะโดนกินนะ", kill: "ครูกำลังจะทำให้หมากกลุ่มนั้นของคุณไม่มีห้อง ระวังนะ",
    attack: "ครูกำลังไล่โจมตีหมากที่ยังอ่อนของคุณ ลองหาทางทำห้องหรือหนีออกที่กว้าง", cut: "ครูตัดหมากของคุณให้ขาดจากกัน ลองดูว่าฝั่งไหนสำคัญกว่าแล้วดูแลฝั่งนั้น",
    squeeze: "ครูกำลังบีบหมากของคุณ ลมหายใจเหลือน้อยแล้ว", "33": "ครูบุกเข้าจุด 3-3 ในมุมของคุณ มุมนี้จะเป็นของใครตัดสินกันตอนนี้",
    kakari: "ครูเข้ามาแย่งมุมที่คุณจับไว้ ลองตอบให้มุมยังเป็นของคุณ" };
  async function explainMine(moves, m) {
    const AI = api.ai(), s = st(), my = tok; if (!AI) return;
    if (m === PASS) { if (fresh("pass", 99, moves.length)) say("ครูขอผ่านนะ ไม่มีจุดไหนได้แต้มเพิ่มแล้ว ถ้าคุณก็ไม่มีจุดจะเล่น ผ่านตามได้เลย เกมจะจบและนับแต้ม"); return; }
    const [ex] = await queue(() => my !== tok ? null : Analysis.explainFor(AI, s.n, moves, [m])) || [];
    if (!ex || my !== tok) return;
    const t = ex.why.find(x => THREAT[x.k]);
    if (!t) return;
    const rg = regionAt(boardOf(s.n, moves), m);
    if (!fresh(t.k + "|" + rg, t.k === "atari" ? 4 : 12, moves.length)) return;
    say(`<span class="co-warn">ระวัง! ครูเดิน <b>${name(s.n, m)}</b> (${rg})</span><br>${THREAT[t.k]}`);
  }

  // when the player asks why the teacher played a move: always answer
  async function whyTeacher(moves, m) {
    const AI = api.ai(), s = st(), my = tok; if (!AI) return;
    if (m === PASS) { say("ครูผ่านเพราะไม่มีจุดไหนได้แต้มเพิ่มแล้ว"); return; }
    const [ex] = await queue(() => my !== tok ? null : Analysis.explainFor(AI, s.n, moves, [m])) || [];
    if (!ex || my !== tok) return;
    const r = ex.why.filter(x => !x.neg)[0], t = ex.why.find(x => THREAT[x.k]);
    let h = `ครูเดิน <b>${name(s.n, m)}</b> (${regionAt(boardOf(s.n, moves), m)}): ${esc(r ? r.t : "ทำให้รูปหมากครูแข็งแรง")}`;
    if (t) h += `<br><span class="co-warn">${THREAT[t.k]}</span>`;
    say(h);
  }

  // ---------- typed questions ----------
  async function status() {
    const AI = api.ai(), s = st(), my = tok; if (!AI) return;
    const ev = await queue(() => my !== tok ? null : AI.evaluate(s.n, s.moves, api.komi()));
    if (!ev || my !== tok) return;
    const b = boardOf(s.n, s.moves), meSign = b.toPlay === s.human ? 1 : -1;
    const myLead = meSign * ev.lead;
    let h = `<b>ตอนนี้</b> ${Math.abs(myLead) < 1 ? "สูสีกันมาก" : myLead > 0 ? `คุณนำ ~${pts(myLead)} แต้ม` : `ครูนำ ~${pts(myLead)} แต้ม`} (รวมโคมิแล้ว)`;
    h += overview(b, s.n, ev, s.human);
    say(h);
  }
  // the whole board: territory by region, weak groups, and big empty areas
  function overview(b, n, ev, me) {
    const sideOf = c => c === me ? "ของคุณ" : "ของครู";
    const sign = ev.pla === BLACK ? 1 : -1; // own is from the player to move
    const area = {}, open = {};
    for (const p of b.pts) {
      const rg = regionAt(b, p), v = ev.own[oi(b, p)] * sign;
      area[rg] = (area[rg] || 0) + v;
      if (b.color[p] === 0 && Math.abs(v) < 0.3) open[rg] = (open[rg] || 0) + 1;
    }
    let h = "";
    const mine = [], theirs = [];
    for (const [rg, v] of Object.entries(area)) if (Math.abs(v) >= 8) ((v > 0) === (me === BLACK) ? mine : theirs).push(rg);
    if (mine.length) h += `<br>🟢 พื้นที่${sideOf(me)}: ${mine.join(", ")}`;
    if (theirs.length) h += `<br>🔴 พื้นที่${sideOf(3 - me)}: ${theirs.join(", ")}`;
    const wide = Object.entries(open).filter(([, k]) => k >= 14).sort((a, z) => z[1] - a[1]).map(([rg]) => rg).slice(0, 3);
    if (wide.length) h += `<br>⬜ ที่ว่างใหญ่ที่ยังไม่มีใครจอง: ${wide.join(", ")}`;
    const weak = weakGroups(b, n, ev);
    if (weak.length) h += `<br>⚠️ กลุ่มที่ยังไม่ปลอดภัย: ${weak.slice(0, 3).map(w => `กลุ่ม${w.c === me ? "ของคุณ" : "ของครู"} ${w.size} เม็ดที่${w.where}`).join(", ")}`;
    return h;
  }
  function weakGroups(b, n, ev) {
    const sign = ev.pla === BLACK ? 1 : -1, out = [];
    for (const [, g] of chains(b)) {
      if (g.stones.length < 2) continue;
      const life = g.stones.reduce((s, p) => s + ev.own[oi(b, p)] * sign, 0) / g.stones.length * (g.c === BLACK ? 1 : -1);
      if (life < 0.45 && life > -0.75) out.push({ c: g.c, size: g.stones.length, where: centre(b, n, g.stones), life });
    }
    return out.sort((a, z) => z.size - a.size);
  }
  async function dangers() {
    const AI = api.ai(), s = st(), my = tok; if (!AI) return;
    const ev = await queue(() => my !== tok ? null : AI.evaluate(s.n, s.moves, api.komi()));
    if (!ev || my !== tok) return;
    const b = boardOf(s.n, s.moves), w = weakGroups(b, s.n, ev);
    if (!w.length) { say("ตอนนี้ยังไม่มีกลุ่มไหนน่าห่วงเลย ทุกกลุ่มมีที่สร้างห้องพอ ไปจองที่ใหญ่ๆ ได้สบายใจ"); return; }
    const mine = w.filter(x => x.c === s.human), theirs = w.filter(x => x.c !== s.human);
    let h = "";
    if (mine.length) h += `<b>กลุ่มของคุณที่ต้องดูแล:</b> ${mine.slice(0, 3).map(x => `${x.size} เม็ดที่${x.where}`).join(", ")}<br>ทางแก้คือขยายออกไปที่ว่าง เชื่อมกับกลุ่มที่แข็งแรง หรือสร้างสองห้อง`;
    if (theirs.length) h += `${h ? "<br>" : ""}<b>กลุ่มของครูที่ยังอ่อน:</b> ${theirs.slice(0, 3).map(x => `${x.size} เม็ดที่${x.where}`).join(", ")}<br>ลองบุกจากด้านนอก ปิดทางหนี แต่อย่าเข้าไปใกล้จนหมากเราเองโดนตัด`;
    say(h);
  }
  async function bigPicture() {
    const AI = api.ai(), s = st(), my = tok; if (!AI) return;
    const ev = await queue(() => my !== tok ? null : AI.evaluate(s.n, s.moves, api.komi()));
    if (!ev || my !== tok) return;
    const b = boardOf(s.n, s.moves), ph = phaseOf(b, s.n, s.moves.length, ev);
    phaseTold[ph] = true;
    say(PHASE_TALK[ph] + (ph === "open" ? cornerHint(b, s.n) : "") + overview(b, s.n, ev, s.human));
  }
  async function aboutPoint(p) {
    const AI = api.ai(), s = st(), my = tok; if (!AI) return;
    const b = boardOf(s.n, s.moves);
    if (b.color[p] === BLACK || b.color[p] === WHITE) { say(`${name(s.n, p)} มีหมาก${CN[b.color[p]]}อยู่แล้วนะ`); return; }
    if (!s.myTurn) { say("รอครูเดินก่อนนะ แล้วถามครูใหม่อีกที"); return; }
    if (!b.isLegal(p, b.toPlay)) { say(`${name(s.n, p)} วางไม่ได้นะ (เป็นจุดห้ามเดิน เช่นโคะ หรือวางแล้วไม่มีลมหายใจเลย)`); return; }
    const wait = say(`ขอครูอ่าน ${name(s.n, p)} แป๊บนึงนะ…`);
    const out = await queue(async () => {
      if (my !== tok) return null;
      const r = picks && picks.key === keyOf(s.moves) ? picks : null;
      const ref = r ? r.list[0].move : (await AI.think(s.n, s.moves, api.komi(), { visits: 600, timeMs: 2000, batch: 8, shouldStop: () => my !== tok })).move;
      const [evR, evP] = await AI.evalMany(s.n, [s.moves.concat([ref]), s.moves.concat([p])], api.komi());
      const [ex] = await Analysis.explainFor(AI, s.n, s.moves, [p]);
      return { ref, loss: ref === p ? 0 : Math.max(0, evP.lead - evR.lead), ex };
    });
    if (!out || my !== tok) { wait.remove(); return; }
    const g = gradeOf(out.loss), good = out.ex.why.filter(x => !x.neg && !x.fb).slice(0, 2), bad = out.ex.why.filter(x => x.neg);
    let h = `ถ้าเดิน <b>${name(s.n, p)}</b> · <span class="g-t g-${g.cls}">${g.t}</span>${out.loss > 0.8 ? ` (เสียราว ${pts(out.loss)} แต้มเทียบกับ ${name(s.n, out.ref)})` : ""}`;
    if (good.length) h += `<ul>${good.map(x => `<li>${esc(x.t)}</li>`).join("")}</ul>`;
    if (bad.length) h += `<div class="co-warn">ข้อเสีย: ${esc(bad[0].t)}</div>`;
    h += `<div class="co-acts"><button type="button" data-see="${p}">👀 ดูบนกระดาน</button><button type="button" class="co-go" data-play="${p}">เดิน ${name(s.n, p)}</button></div>`;
    wait.querySelector(".co-b").innerHTML = h;
  }
  async function aboutMyLast() {
    const s = st(), i = myLast(s);
    if (i === null) { say("คุณยังไม่ได้เดินเลยนะ ลองเลือกจากตัวเลือกที่ครูให้ดูก่อนก็ได้"); return; }
    const AI = api.ai(), my = tok, moves = s.moves.slice(0, i), m = s.moves[i];
    const out = await queue(async () => {
      if (my !== tok) return null;
      const t = await AI.think(s.n, moves, api.komi(), { visits: 600, timeMs: 2000, batch: 8, shouldStop: () => my !== tok });
      const [evR, evP] = await AI.evalMany(s.n, [moves.concat([t.move]), moves.concat([m])], api.komi());
      const ex = (await Analysis.explainFor(AI, s.n, moves, [m]))[0];
      const ex2 = t.move === m ? ex : (await Analysis.explainFor(AI, s.n, moves, [t.move]))[0];
      return { ref: t.move, loss: t.move === m ? 0 : Math.max(0, evP.lead - evR.lead), ex, ex2 };
    });
    if (!out || my !== tok) return;
    const g = gradeOf(out.loss), good = out.ex.why.filter(x => !x.neg && !x.fb), bad = out.ex.why.filter(x => x.neg);
    let h = `ตาที่คุณเดิน <b>${name(s.n, m)}</b> · <span class="g-t g-${g.cls}">${g.t}</span>${out.loss > 0.8 ? ` (เสียราว ${pts(out.loss)} แต้ม)` : ""}`;
    if (good.length) h += `<br>ข้อดี: ${esc(good[0].t)}`;
    if (bad.length) h += `<br><span class="co-warn">ข้อเสีย: ${esc(bad[0].t)}</span>`;
    if (out.loss > 0.8) { const w = out.ex2.why.find(x => !x.neg); h += `<br>ตาที่ดีกว่าคือ <b>${name(s.n, out.ref)}</b>${w ? `: ${esc(w.t)}` : ""}<div class="co-idea">💡 ${ideaOf(out.ex2.why)}</div>`; }
    say(h);
  }
  async function aboutTeacherLast() {
    const s = st();
    let i = -1; for (let k = s.moves.length - 1; k >= 0; k--) if ((k % 2 === 0 ? BLACK : WHITE) !== s.human) { i = k; break; }
    if (i < 0) { say("ครูยังไม่ได้เดินเลยนะ"); return; }
    await whyTeacher(s.moves.slice(0, i), s.moves[i]);
  }
  async function ask(text) {
    const t = text.trim(); if (!t) return;
    bubble(esc(t), "me");
    const s = st(), p = parsePoint(s.n, t);
    if (/^(สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi)/i.test(t)) { say("สวัสดีครับ ครูมิชิโอะเอง ถามได้ทุกเรื่องเลยนะ เช่น “ควรเดินตรงไหน” “ทำไมครูเดินตานั้น” “ใครนำอยู่” หรือพิมพ์จุดเช่น “D4 ดีไหม”"); return; }
    if (/ขอบคุณ|ขอบใจ|thank/i.test(t)) { say("ยินดีครับ เล่นต่อเลย ตาไหนคิดไม่ออกกดแนะนำได้ ถ้าเดินพลาดหนักครูจะบอกเอง 😊"); return; }
    if (p !== null && /ครู|เขา|ทำไม/.test(t)) {
      const b = boardOf(s.n, s.moves);
      if (b.color[p] && b.color[p] !== s.human) { const i = s.moves.lastIndexOf(p); if (i >= 0) { await whyTeacher(s.moves.slice(0, i), p); return; } }
    }
    if (p !== null) { await aboutPoint(p); return; }
    if (/ทำไม.*ครู|ครู.*(เดิน|ลง|วาง)|ตา(ของ)?ครู|ครูกำลัง|เขาเดิน|บอท|AI เดิน/i.test(t)) { await aboutTeacherLast(); return; }
    if (/(ตา|หมาก)(ที่)?(ฉัน|ผม|หนู|เรา|ของฉัน|ของผม)|(ฉัน|ผม|หนู|เรา)(เดิน|ลง|วาง)|ตา(ที่)?(แล้ว|เมื่อกี้|ก่อน)|เมื่อกี้.*(ดี|พลาด)|พลาดไหม|ดีไหม/.test(t)) { await aboutMyLast(); return; }
    if (/ภาพรวม|แผน|ควรทำอะไร|ต้องทำอะไร|แนวคิด|มุมมอง|ช่วงนี้|เป้าหมาย|กลยุทธ์/.test(t)) { await bigPicture(); return; }
    if (/ควร|เดินไหน|เดินตรงไหน|ลงตรงไหน|วางตรงไหน|แนะนำ|ช่วยด้วย|ช่วยหน่อย|ไม่รู้|ทางเลือก|ตัวเลือก|ช้อย|ต่อไป|hint|เดินอะไร/i.test(t)) { await suggest(true); return; }
    if (/ใคร.*(นำ|ชนะ|เปรียบ)|สถานการณ์|นำกี่|ตามกี่|แต้มตอนนี้|คะแนนตอนนี้|สกอร์/.test(t)) { await status(); return; }
    if (/อันตราย|กลุ่ม|ตายไหม|รอดไหม|จะตาย|อ่อน/.test(t)) { await dangers(); return; }
    if (/ทำอะไร|หลักการ|19/.test(t)) { await bigPicture(); return; }
    for (const [re, ans] of GLOSSARY) if (re.test(t)) { say(ans); return; }
    say("ครูยังไม่เข้าใจคำถามนี้ 😅 ลองถามแบบนี้ดูนะ: “ควรเดินตรงไหน” · “ภาพรวมตอนนี้” · “ทำไมครูเดินตานั้น” · “ตาที่ฉันเดินดีไหม” · “ใครนำอยู่” · พิมพ์จุดเช่น “Q16 ดีไหม” · หรือถามคำศัพท์ เช่น “ห้องคืออะไร” “อะตาริ” “โคะ” “เซนเต”");
  }

  // ---------- the game tells the coach what happened ----------
  // a move was played: comment on it. The choices come only when the player asks (the แนะนำ button, owner 2026-11-01)
  api.moved = function (moves, mover) {
    if (!on) return;
    const s = st(), prev = picks, before = moves.slice(0, -1), m = moves[moves.length - 1];
    tok++; picks = null; api.marks([]); $("coPicks").innerHTML = ""; setChips();
    if (mover === s.human) queue(() => judgeMine(prev, before, m)); // one queued step, so the teacher waits for the whole review
    else explainMine(before, m).then(() => setChips());
  };
  api.turn = () => { if (on) setChips(); };
  api.hint = () => { if (!on) return; bubble("แนะนำหน่อยครับ", "me"); suggest(true); };
  api.start = function (o) {
    E = api.E; Board = E.Board; PASS = E.PASS; BLACK = E.BLACK; WHITE = E.WHITE;
    on = !!o; tok++; picks = null; phaseTold = {}; warned.clear();
    document.body.classList.toggle("coaching", on);
    $("coach").hidden = !on; $("coach").classList.remove("open");
    if (!on) { api.marks([]); return; }
    $("coLog").innerHTML = "";
    const s = st();
    if (o.resume) say(`กลับมาเล่นต่อแล้ว ครูจำกระดานได้ เดี๋ยวช่วยดูให้นะ`);
    else say(`สวัสดีครับ ครูมิชิโอะเอง วันนี้เรามาเล่นกระดานจริง 19×19 กัน คุณเป็น<b>${CN[s.human]}</b> ตาไหนคิดไม่ออก กดปุ่ม<b>แนะนำ</b> ครูจะเลือกตาให้ 3 ทาง <b>A B C</b> พร้อมเหตุผล จะเลือกตามครูหรือเดินเองก็ได้ ระหว่างเกมครูจะพูดเฉพาะตอนสำคัญ เช่น ตอนต้องระวัง หรือตอนที่เดินพลาดหนัก แล้วพิมพ์ถามครูได้ตลอดเลยนะ`);
    setChips(); renderBusy();
  };
  api.stop = () => { on = false; tok++; document.body.classList.remove("coaching"); $("coach").hidden = true; };
  api.active = () => on;

  // ---------- wiring ----------
  function wire() {
    $("coForm").addEventListener("submit", e => { e.preventDefault(); const v = $("coIn").value; $("coIn").value = ""; ask(v); });
    $("coOpen").onclick = () => { $("coach").classList.add("open"); $("coLog").scrollTop = $("coLog").scrollHeight; };
    $("coClose").onclick = () => $("coach").classList.remove("open");
    $("coLog").addEventListener("click", e => { if (!e.target.closest("button") && !$("coach").classList.contains("open") && matchMedia("(max-aspect-ratio: 9/8)").matches) $("coOpen").onclick(); });
    $("coach").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.q) { ask(b.dataset.q); return; }
      if (b.dataset.see !== undefined) {
        const p = +b.dataset.see; api.preview(p);
        const x = picks && picks.list.find(y => y.move === p);
        if (x && b.classList.contains("co-pk")) { // a choice button under the board: say why in a line
          const r = x.why.find(y => !y.neg);
          say(`${x.letter} <b>${name(picks.n, p)}</b> ${x.trap ? `ระวัง! เสียราว ${pts(x.loss)} แต้ม` : esc(r ? r.t : "")} · กด<b>วางหมาก</b>เพื่อเดินตานี้`);
        }
        $("coach").classList.remove("open");
        return;
      }
      if (b.dataset.play !== undefined) { $("coach").classList.remove("open"); api.play(+b.dataset.play); }
    });
  }
  let wired = false;
  const _start = api.start;
  api.start = o => { if (!wired) { wired = true; wire(); } _start(o); };
  return api;
})();
