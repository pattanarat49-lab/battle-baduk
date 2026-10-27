(function () {
  const E = GoEngine(null);
  const F = GoFeatures(E);
  const { Board, PASS, EMPTY, BLACK, WHITE } = E;
  const LETTERS = "ABCDEFGHJKLMNOPQRST";
  const $ = id => document.getElementById(id);
  const cv = $("board"), g = cv.getContext("2d");
  const MODEL = window.GO_MODEL || "b10";

  function load(k, d) { try { const v = localStorage.getItem("gonn." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("gonn." + k, JSON.stringify(v)); } catch (e) {} }

  const STYLE = {
    balance: { label: "สมดุล", opts: {} },
    attack: { label: "บุกสุดๆ", opts: { pda: 1.5, scoreWeight: 0.5 } },
    defend: { label: "ตั้งรับสุดๆ", opts: { pda: -1.25 } }
  };
  // Strength comes from how much the network reads ahead; ranks are estimates, not measured against people.
  const CHARS = [
    { id: "mek", en: "MEK", name: "เมฆ", country: "ไทย", rank: "15 คิว", style: "balance", search: { temperature: 2.0, blunder: 0.3 },
      bio: "เด็ก ม.6 เพิ่งหัดเล่นโกะ เดินตามความรู้สึก",
      say: { hello: "เพิ่งหัดเล่นนะครับ เบามือหน่อย", ahead: "เอ๊ะ ผมนำอยู่เหรอ", behind: "โห พี่เล่นเก่งจัง", win: "ชนะแล้ว! ไม่อยากเชื่อเลย", lose: "สอนผมบ้างได้ไหมครับ" } },
    { id: "win", en: "UNCLE WIN", name: "ลุงวิน", country: "ไทย", rank: "8 คิว", style: "balance", search: { temperature: 1.6, blunder: 0.15 },
      bio: "เซียนหมากฮอสประจำวินมอเตอร์ไซค์ เพิ่งมาลองเล่นโกะ",
      say: { hello: "หมากฮอสลุงไม่เคยแพ้ใครนะ มาลองโกะกันหน่อย", ahead: "กินได้กินเลย เหมือนหมากฮอสนั่นแหละ", behind: "เดี๋ยวๆ ขอคิดแป๊บ", win: "เห็นไหม เซียนก็คือเซียน", lose: "เก่งนี่หว่า เดี๋ยวลุงไปฝึกมาใหม่" } },
    { id: "yuto", en: "YUTO", name: "ยูโตะ", country: "ญี่ปุ่น", rank: "5 คิว", style: "balance", search: { temperature: 1.0, blunder: 0.03 },
      bio: "นักเรียนชมรมโกะจากญี่ปุ่น เล่นตามตำราที่ชมรมสอน",
      say: { hello: "โอเนไงชิมัส! ขอคำชี้แนะด้วยครับ", ahead: "ตามที่รุ่นพี่ชมรมสอนเป๊ะเลย", behind: "ต้องตั้งใจกว่านี้แล้ว", win: "ขอบคุณสำหรับเกมครับ", lose: "อาริงาโตะ จะกลับไปซ้อมที่ชมรมครับ" } },
    { id: "chris", en: "CHRIS", name: "คริส", country: "อังกฤษ", rank: "1 ดั้ง", style: "balance", search: { visits: 8 },
      bio: "นักหมากล้อมจากอังกฤษ ใจเย็น คิดอย่างมีเหตุผล",
      say: { hello: "Good game ahead. เชิญเลยครับ", ahead: "เป็นไปตามแผน", behind: "Interesting... น่าสนใจมาก", win: "Well played, เกมดีครับ", lose: "Brilliant! คุณเล่นได้ยอดเยี่ยม" } },
    { id: "weiqi", en: "WEIQI", name: "เว่ยฉี", country: "จีน", rank: "3 ดั้ง", style: "attack", opening: "tengen", search: { visits: 32 },
      bio: "ดาวรุ่งอายุน้อยจากจีน เปิดเทนเง็นทุกกระดาน บุกหนักทุกตา ไล่ฆ่าทุกกลุ่มที่เห็น",
      say: { hello: "เตรียมตัวไว้ ผมไม่ปล่อยกลุ่มไหนรอดแน่", ahead: "กลุ่มนั้นตายแล้ว", behind: "ยังไม่จบ! เดี๋ยวบุกกลับ", win: "บอกแล้วว่าไม่มีใครหนีพ้น", lose: "แค่ครั้งนี้เท่านั้น ครั้งหน้าไม่รอดแน่" } },
    { id: "tora", en: "TORA", name: "โทระ", country: "ญี่ปุ่น", rank: "4 ดั้ง", style: "defend", opening: "33", search: { visits: 64 },
      bio: "คู่แข่งตลอดกาลของเว่ยฉี ยึด 3-3 ทุกมุมที่ว่าง ตั้งรับแน่นหนา แทบไม่มีช่องโหว่",
      say: { hello: "บุกมาเลย ผมรับได้หมด", ahead: "ป้อมของผมไม่มีวันแตก", behind: "ยังรับไหว", win: "การป้องกันที่ดีที่สุดคือการไม่ให้โอกาส", lose: "ทะลวงป้อมผมได้... ไม่เลว" } },
    { id: "kan", en: "KAN", name: "กัน", country: "ไทย", rank: "5 ดั้ง", style: "balance", search: { visits: 120, timeMs: 10000 },
      bio: "นักหมากล้อมทีมชาติไทย นิ่ง แม่นยำ อ่านเกมขาด",
      say: { hello: "เล่นเต็มที่นะครับ", ahead: "เกมนี้อยู่ในมือแล้ว", behind: "ยังมีทางสู้", win: "ขอบคุณที่เล่นด้วยครับ ฝึกต่อไปนะ", lose: "ฝีมือระดับทีมชาติเลยนะครับ" } },
    { id: "todo", en: "TODO", name: "โทโด", country: "ญี่ปุ่น", rank: "1 ดั้งโปร", style: "balance", search: { visits: 4000, timeMs: 15000 },
      bio: "นักหมากล้อมมืออาชีพจากญี่ปุ่น อ่านเกมจนหมดเวลาทุกตา เก่งที่สุดในสนาม",
      say: { hello: "...เชิญ", ahead: "จบแล้ว", behind: "อืม", win: "ยังต้องฝึกอีกมาก", lose: "เจ้าคือผู้ที่ข้ารอคอยมานาน" } }
  ];
  function avatarSVG(c, cls) { return cls ? `<img class="${cls}" src="chars/${c.id}.jpg" alt="${c.name}" width="480" height="480">` : `<img class="av" src="chars/${c.id}_face.jpg" alt="" width="160" height="160">`; }
  // a plain silhouette for the human player until real profiles exist
  const YOU_AV = `<img class="av" alt="" width="160" height="160" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#3b6a73"/><circle cx="32" cy="25" r="11" fill="#a9c3c2"/><path d="M11 60c2-12 11-19 21-19s19 7 21 19z" fill="#a9c3c2"/></svg>')}">`;
  const settings = { size: load("size", 19), human: load("human", BLACK), char: load("char8", 4) };
  if (!CHARS[settings.char]) settings.char = 4;
  const KOMI = 7.5;
  let n, board, history, human, ai, thinking = false, think = null, hint = null, hover = null;
  let winBlack = 0.5, leadBlack = 0, over = null, scoring = null, gameChar = 5;
  let AI = null, gen = 0, engineReady = false;

  // ---------- load network ----------
  // weights as raw float16 (.bin), or base64 text where binary files can't be served
  async function loadWeights() {
    try {
      const r = await fetch(MODEL + ".bin");
      if (r.ok && !(r.headers.get("content-type") || "").includes("text/html")) return await r.arrayBuffer();
    } catch (e) {}
    const r = await fetch(MODEL + ".b64.txt");
    if (!r.ok) throw new Error("model weights " + r.status);
    const bin = atob((await r.text()).trim()), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  async function initEngine() {
    const el = { set textContent(t) { $("engine").textContent = t; $("engineHome").textContent = t; } };
    try {
      if (typeof tf === "undefined") throw new Error("โหลด TensorFlow.js ไม่สำเร็จ");
      let backend = "cpu";
      try { if (await tf.setBackend("webgl")) backend = "webgl"; } catch (e) {}
      if (backend !== "webgl") await tf.setBackend("cpu");
      await tf.ready();
      el.textContent = "กำลังดาวน์โหลดสมอง AI (6 MB)…";
      const [meta, buf] = await Promise.all([
        fetch(MODEL + ".json").then(r => { if (!r.ok) throw new Error("model json " + r.status); return r.json(); }),
        loadWeights()
      ]);
      const net = GoTFNet(tf).build(meta, buf);
      AI = GoNNAI(E, F, net);
      el.textContent = "กำลังอุ่นเครื่อง AI…";
      const t0 = performance.now();
      await AI.evalMany(19, [[], [E.PASS]], KOMI);
      const t1 = performance.now();
      await AI.evalMany(19, Array.from({ length: 8 }, (_, i) => [new Board(19).pt(i, 3)]), KOMI);
      const ms = Math.round((performance.now() - t1) / 8);
      engineReady = true;
      el.textContent = `สมอง AI พร้อม · KataGo b10 · ${backend === "webgl" ? "ใช้การ์ดจอ" : "ใช้ CPU (ช้า)"} · ~${ms} ms ต่อการประเมิน`;
      console.log("warmup", Math.round(t1 - t0), "ms; per eval", ms, "ms");
      if (board) { render(); maybeAI(); }
    } catch (e) {
      console.error(e);
      el.textContent = "โหลดสมอง AI ไม่สำเร็จ: " + e.message;
    }
  }

  // ---------- character speech ----------
  let said = {};
  function speak(kind, force) {
    if (said[kind] && !force) return;
    said[kind] = true;
    const c = CHARS[gameChar], q = $("quote");
    q.hidden = false;
    q.innerHTML = `${avatarSVG(c)}<span><b>${c.name}</b>${c.say[kind]}</span>`;
  }
  function reactTo(res) {
    // res.winrate is for the AI, the player to move when it searched
    if (history.length < 20) return;
    if (res.winrate > 0.85) speak("ahead"); else if (res.winrate < 0.2) speak("behind");
  }

  // ---------- clocks: 15 min main time, then byo-yomi 10 s x 3 ----------
  const MAIN_S = 900, BYO_S = 10, PERIODS = 3;
  let clocks = null, lastTick = 0;
  const freshClock = () => ({ main: MAIN_S, byo: BYO_S, per: PERIODS });
  const clockLive = () => board && engineReady && !over && !scoring;
  function tick() {
    const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
    if (!clocks || !clockLive()) return;
    const c = clocks[board.toPlay];
    let t = dt;
    if (c.main > 0) { const use = Math.min(c.main, t); c.main -= use; t -= use; }
    if (t > 0) {
      c.byo -= t;
      while (c.byo <= 0 && c.per > 0) { c.per--; if (c.per > 0) c.byo += BYO_S; }
      if (c.per === 0) { c.byo = 0; timeout(board.toPlay); return; }
    }
    renderClocks();
  }
  // after a move the mover's byo-yomi period starts fresh
  function clockMoved(color) { if (clocks && clocks[color].main <= 0) clocks[color].byo = BYO_S; }
  function timeout(color) {
    cancelAI();
    const name = CHARS[gameChar].name;
    over = color === human ? { text: `คุณหมดเวลา ${name} ชนะ`, detail: "ใช้เบียวโยมิครบ 3 ครั้งแล้ว" }
      : { text: `${name} หมดเวลา คุณชนะ!`, detail: "" };
    speak(color === human ? "win" : "lose", true); reportEnd(color !== human, "timeout"); render();
  }
  // how long the AI may think this move without risking its clock
  function aiBudget(base) {
    const c = clocks[ai];
    const limit = c.main > 0 ? Math.max(c.main * 1000 / 25, 6000) : (BYO_S - 3.5) * 1000;
    return Math.min(base || 1e9, limit);
  }
  const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function renderClocks() {
    if (!clocks) return;
    for (const [col, k] of [[BLACK, "B"], [WHITE, "W"]]) {
      const c = clocks[col], inByo = c.main <= 0;
      $("clk" + k).textContent = inByo ? fmt(c.byo) : fmt(c.main);
      $("by" + k).textContent = c.per === 0 ? "หมดเวลา" : inByo ? `เบียวโยมิ เหลือ ${c.per} ครั้ง` : `+ ${PERIODS}×${BYO_S} วิ`;
      $("p" + k).classList.toggle("low", inByo ? c.byo <= 5 : c.main <= 30);
      $("p" + k).classList.toggle("out", c.per === 0);
    }
  }
  setInterval(tick, 200);

  // ---------- anonymous play statistics, stored by the site's Worker at /api/event ----------
  const host = location.hostname;
  const STATS_URL = /workers\.dev$|^localhost$|^127\.0\.0\.1$/.test(host) ? "/api/event"
    : /github\.io$/.test(host) ? "https://battle-baduk.battlebaduk.workers.dev/api/event" : null;
  const rid = () => (Math.random().toString(36).slice(2, 10) + Date.now().toString(36)).replace(/[^a-z0-9]/g, "");
  let playerId = load("pid", null);
  if (!playerId) { playerId = rid(); save("pid", playerId); }
  let gameId = null, gameReported = false;
  function track(ev) {
    if (!STATS_URL || !gameId) return;
    try {
      const body = JSON.stringify(Object.assign({ player: playerId, game: gameId, char: CHARS[gameChar].id }, ev));
      if (!(navigator.sendBeacon && navigator.sendBeacon(STATS_URL, new Blob([body], { type: "text/plain" }))))
        fetch(STATS_URL, { method: "POST", body, keepalive: true }).catch(() => {});
    } catch (e) {}
  }
  function reportEnd(humanWon, how) {
    if (gameReported) return;
    gameReported = true; track({ type: "end", winner: humanWon ? "human" : "ai", how, moves: history.length, state: snapshot() });
  }
  // the position as spectators on /watch see it
  function snapshot() {
    let b = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = board.color[board.pt(x, y)]; b += c === BLACK ? "b" : c === WHITE ? "w" : "."; }
    const last = history.length ? history[history.length - 1] : PASS;
    const lastIdx = last === PASS ? -1 : (([x, y]) => y * n + x)(board.xy(last));
    const ck = c => [Math.round(c.main), c.per, Math.round(c.byo)];
    return { size: n, board: b, last: lastIdx, moveNo: history.length, toPlay: board.toPlay, human,
      caps: [board.caps[BLACK], board.caps[WHITE]], clocks: clocks ? [ck(clocks[BLACK]), ck(clocks[WHITE])] : null, winB: Math.round(winBlack * 100) };
  }

  // ---------- game flow ----------
  function cancelAI() { gen++; thinking = false; think = null; }
  function newGame() {
    cancelAI();
    n = boardSize(); human = settings.human; ai = 3 - human; gameChar = settings.char;
    board = new Board(n); history = []; hint = null; over = null; scoring = null; winBlack = 0.5; leadBlack = 0;
    $("sub").textContent = `กระดาน ${n}×${n} · กติกาจีน · โคมิ ${KOMI} · คู่ต่อสู้: ${CHARS[gameChar].name} (${CHARS[gameChar].rank} · ${STYLE[CHARS[gameChar].style].label})`;
    const ch = CHARS[gameChar];
    for (const [col, k] of [[BLACK, "B"], [WHITE, "W"]]) {
      const me = col === human;
      $("n" + k).textContent = me ? "คุณ" : ch.name;
      $("rk" + k).textContent = me ? "ผู้เล่น" : `${ch.rank} · ${ch.country}`;
      $("av" + k).innerHTML = me ? YOU_AV : avatarSVG(ch);
    }
    clocks = { [BLACK]: freshClock(), [WHITE]: freshClock() }; lastTick = performance.now(); renderClocks();
    said = {}; speak("hello");
    gameId = rid(); gameReported = false; track({ type: "start", size: n, color: human, state: snapshot() });
    resize(); render(); maybeAI();
  }
  function replay() { board = new Board(n); for (const m of history) board.play(m); }
  // ---------- sound: a short wooden click, synthesised so no audio file is needed ----------
  let actx = null, soundOn = load("sound", true);
  function unlockAudio() {
    try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {}
  }
  function clack() {
    if (!actx || !soundOn) return;
    const t = actx.currentTime, len = Math.floor(actx.sampleRate * 0.09), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = actx.createBufferSource(); src.buffer = buf;
    const bp = actx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 1.2;
    const ng = actx.createGain(); ng.gain.value = 0.9;
    src.connect(bp).connect(ng).connect(actx.destination);
    const o = actx.createOscillator(), og = actx.createGain();
    o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.05);
    og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(og).connect(actx.destination);
    src.start(t); o.start(t); o.stop(t + 0.08);
  }
  function playMove(p) {
    if (p !== PASS) clack();
    clockMoved(board.toPlay);
    board.play(p); history.push(p); hint = null;
    track({ type: "move", state: snapshot() });
    if (board.passes >= 2) startScoring();
    render();
    if (!over && !scoring) maybeAI();
  }
  function setEval(res) {
    // res values are for the player to move at the searched position
    const forBlack = res.pla === BLACK;
    winBlack = forBlack ? res.winrate : 1 - res.winrate;
    leadBlack = forBlack ? res.lead : -res.lead;
  }
  // signature openings: Weiqi takes tengen (or attaches to it), Tora takes 3-3 in every empty corner
  function openingMove() {
    const ch = CHARS[gameChar];
    if (!ch.opening) return null;
    for (const p of board.pts) if (board.color[p] === ai && board.libs(board.head[p], 2) === 1) return null; // a group in atari comes first
    const ok = p => board.color[p] === EMPTY && board.isLegal(p, ai);
    if (ch.opening === "tengen") {
      if (history.some((m, i) => (i % 2 === 0 ? BLACK : WHITE) === ai)) return null;
      const c = (n - 1) / 2, t = board.pt(c, c);
      if (ok(t)) return t;
      const near = board.dirs.map(d => t + d).filter(ok);
      return near.length ? near[(Math.random() * near.length) | 0] : null;
    }
    if (ch.opening === "33") {
      const free = [];
      for (const [cx, cy] of [[0, 0], [n - 6, 0], [0, n - 6], [n - 6, n - 6]]) {
        let empty = true;
        for (let y = cy; y < cy + 6 && empty; y++) for (let x = cx; x < cx + 6; x++) if (board.color[board.pt(x, y)] !== EMPTY) { empty = false; break; }
        const p = board.pt(cx ? n - 3 : 2, cy ? n - 3 : 2);
        if (empty && ok(p)) free.push(p);
      }
      return free.length ? free[(Math.random() * free.length) | 0] : null;
    }
    return null;
  }
  async function maybeAI() {
    if (!engineReady || over || scoring || board.toPlay !== ai || thinking) return;
    const my = ++gen; thinking = true; think = null; render();
    const moves = history.slice();
    await new Promise(r => setTimeout(r, 30));
    const book = openingMove();
    if (book !== null) {
      await new Promise(r => setTimeout(r, 600));
      if (my !== gen) return;
      thinking = false; playMove(book); return;
    }
    const res = await AI.think(n, moves, KOMI, Object.assign({
      batch: 8, shouldStop: () => my !== gen,
      onProgress: s => { if (my === gen) { think = s; renderStatus(); drawBoard(); } }
    }, CHARS[gameChar].search, STYLE[CHARS[gameChar].style].opts, { timeMs: aiBudget(CHARS[gameChar].search.timeMs) }));
    if (my !== gen) return;
    thinking = false; think = null;
    setEval(res);
    reactTo(res);
    if (res.winrate < 0.03 && history.length > n * n / 3 && !CHARS[gameChar].search.temperature) {
      over = { text: `${CHARS[gameChar].name} ยอมแพ้ คุณชนะ!`, detail: "AI ประเมินว่าโอกาสชนะเหลือไม่ถึง 3%" }; speak("lose", true); reportEnd(true, "resign"); render(); return;
    }
    playMove(res.move);
  }

  async function startScoring() {
    scoring = { dead: new Set(), loading: true, terr: null };
    render();
    const my = gen;
    const ev = await AI.evaluate(n, history.slice(), KOMI);
    if (my !== gen || !scoring) return;
    const dead = new Set(), seen = new Set();
    const ownBlack = q => { const [x, y] = board.xy(q); const o = ev.own[y * 19 + x]; return ev.pla === BLACK ? o : -o; };
    for (const p of board.pts) {
      const c = board.color[p]; if ((c !== BLACK && c !== WHITE) || seen.has(p)) continue;
      const chain = chainOf(p); let s = 0;
      for (const q of chain) { seen.add(q); s += ownBlack(q); }
      s /= chain.length;
      if ((c === BLACK && s < -0.3) || (c === WHITE && s > 0.3)) chain.forEach(q => dead.add(q));
    }
    scoring.dead = dead; scoring.loading = false; render();
  }
  function chainOf(p) {
    const c = board.color[p], out = [p], seen = new Set([p]);
    for (let i = 0; i < out.length; i++) for (const d of board.dirs) {
      const q = out[i] + d; if (board.color[q] === c && !seen.has(q)) { seen.add(q); out.push(q); }
    }
    return out;
  }
  function areaCount(dead) {
    const terr = new Map(); let b = 0, w = 0; const seen = new Set();
    for (const p of board.pts) {
      const c = board.color[p];
      if ((c === BLACK || c === WHITE) && !dead.has(p)) { if (c === BLACK) b++; else w++; continue; }
      if (seen.has(p)) continue;
      const region = [p]; seen.add(p); let tb = false, tw = false;
      for (let i = 0; i < region.length; i++) for (const d of board.dirs) {
        const q = region[i] + d, cq = board.color[q];
        if (cq === 3) continue;
        if ((cq === BLACK || cq === WHITE) && !dead.has(q)) { if (cq === BLACK) tb = true; else tw = true; }
        else if (!seen.has(q)) { seen.add(q); region.push(q); }
      }
      const owner = tb && !tw ? BLACK : tw && !tb ? WHITE : 0;
      for (const q of region) terr.set(q, owner);
      if (owner === BLACK) b += region.length; else if (owner === WHITE) w += region.length;
    }
    return { b, w, terr };
  }

  // ---------- input ----------
  function pointAt(ev) {
    const r = cv.getBoundingClientRect(); const cell = r.width / (n + 1);
    const x = Math.round((ev.clientX - r.left) / cell) - 1, y = Math.round((ev.clientY - r.top) / cell) - 1;
    if (x < 0 || y < 0 || x >= n || y >= n) return null;
    return board.pt(x, y);
  }
  cv.addEventListener("click", ev => {
    const p = pointAt(ev); if (p === null) return;
    if (scoring && !scoring.loading) {
      const c = board.color[p]; if (c !== BLACK && c !== WHITE) return;
      const ch = chainOf(p); const isDead = scoring.dead.has(p);
      ch.forEach(q => isDead ? scoring.dead.delete(q) : scoring.dead.add(q));
      render(); return;
    }
    unlockAudio();
    if (!engineReady || over || scoring || thinking || board.toPlay !== human) return;
    if (board.color[p] !== EMPTY) return;
    if (!board.isLegal(p, human)) { flash(p === board.ko ? "ห้ามเดินตรงนี้ทันที เพราะเป็นโค ให้เดินที่อื่นก่อนหนึ่งตา" : "จุดนี้วางไม่ได้ (ไม่มีลมหายใจ)"); return; }
    playMove(p);
  });
  cv.addEventListener("pointermove", ev => { if (ev.pointerType !== "mouse" || !board) return; const p = pointAt(ev); if (p !== hover) { hover = p; drawBoard(); } });
  cv.addEventListener("pointerleave", () => { hover = null; drawBoard(); });

  let flashMsg = null, flashT = 0;
  function flash(t) { flashMsg = t; clearTimeout(flashT); flashT = setTimeout(() => { flashMsg = null; renderStatus(); }, 2600); renderStatus(); }

  $("btnPass").onclick = () => { if (!engineReady || over || scoring || thinking || board.toPlay !== human) return; playMove(PASS); };
  $("btnHint").onclick = async () => {
    if (!engineReady || over || scoring || thinking || board.toPlay !== human) return;
    const my = ++gen; thinking = true; think = null; render();
    const res = await AI.think(n, history.slice(), KOMI, { visits: 120, timeMs: Math.min(8000, clocks[human].main > 0 ? 8000 : Math.max(1000, (clocks[human].byo - 2.5) * 1000)), batch: 8, shouldStop: () => my !== gen,
      onProgress: s => { if (my === gen) { think = s; renderStatus(); drawBoard(); } } });
    if (my !== gen) return;
    thinking = false; think = null; hint = res.move; setEval(res); render();
    if (res.move === PASS) flash("AI แนะนำให้ผ่าน");
  };
  $("btnResign").onclick = () => {
    if (over || scoring || !history.length) return;
    cancelAI(); over = { text: `คุณยอมแพ้ ${CHARS[gameChar].name} ชนะ`, detail: "" }; speak("win", true); reportEnd(false, "resign"); render();
  };
  // characters from 3 kyu up (index 3 onwards) only play on the full 19x19 board
  const only19 = i => i >= 3;
  const boardSize = () => only19(settings.char) ? 19 : settings.size;
  function seg(id, key) {
    const el = $(id);
    const sync = () => {
      const val = key === "size" ? boardSize() : settings[key];
      el.querySelectorAll("button").forEach(b => {
        b.setAttribute("aria-pressed", String(+b.dataset.v === val));
        if (key === "size") b.disabled = only19(settings.char) && +b.dataset.v !== 19;
      });
      if (key === "size") $("sizeLegend").textContent = only19(settings.char) ? "กระดาน (ตัวนี้เล่น 19×19 เท่านั้น)" : "กระดาน";
    };
    el.addEventListener("click", e => { const b = e.target.closest("button"); if (!b || b.disabled) return; settings[key] = +b.dataset.v; save(key, settings[key]); sync(); });
    sync();
    return sync;
  }

  // ---------- rendering ----------
  function render() { renderPanel(); renderStatus(); drawBoard(); }
  function renderPanel() {
    $("cB").textContent = "หมากเชลย " + board.caps[BLACK];
    $("cW").textContent = "หมากเชลย " + board.caps[WHITE];
    renderClocks();
    const live = !over && !scoring;
    $("pB").classList.toggle("turn", live && board.toPlay === BLACK);
    $("pW").classList.toggle("turn", live && board.toPlay === WHITE);
    const pct = Math.round(winBlack * 100);
    $("wrFill").style.width = pct + "%"; $("wrB").textContent = "ดำ " + pct + "%"; $("wrW").textContent = "ขาว " + (100 - pct) + "%";
    const lead = Math.abs(leadBlack).toFixed(1);
    $("wrMid").textContent = history.length ? `${leadBlack >= 0 ? "ดำ" : "ขาว"} นำ ~${lead} แต้ม` : "โอกาสชนะ";
    const myTurn = engineReady && live && !thinking && board.toPlay === human;
    $("btnPass").disabled = !myTurn; $("btnHint").disabled = !myTurn;
    $("btnResign").disabled = !live || !history.length;
    const res = $("result");
    if (over) { res.hidden = false; res.innerHTML = `<h2>${over.text}</h2><div class="nums">${over.detail}</div>`; }
    else if (scoring && !scoring.loading) {
      const r = areaCount(scoring.dead); scoring.terr = r.terr;
      const diff = r.b - (r.w + KOMI);
      const winner = diff > 0 ? BLACK : WHITE;
      res.hidden = false;
      if (!scoring.spoke) { scoring.spoke = true; speak(winner === human ? "lose" : "win", true); reportEnd(winner === human, "score"); }
      res.innerHTML = `<h2>${winner === human ? "คุณชนะ" : CHARS[gameChar].name + " ชนะ"} (${winner === BLACK ? "ดำ" : "ขาว"} ชนะ ${Math.abs(diff)} แต้ม)</h2>
        <div class="nums">ดำ ${r.b} · ขาว ${r.w} + โคมิ ${KOMI} = ${r.w + KOMI}</div>
        <p class="note" style="margin-top:6px">หมากที่มีกากบาทถูกนับว่าตาย แตะกลุ่มเพื่อแก้</p>`;
    } else res.hidden = true;
  }
  function moveName(p) { if (p === PASS) return "ผ่าน"; const [x, y] = board.xy(p); return LETTERS[x] + (n - y); }
  function renderStatus() {
    const el = $("status"); let html;
    if (flashMsg) html = `<b>${flashMsg}</b>`;
    else if (!engineReady) html = "<b>รอสมอง AI โหลดเสร็จ…</b>";
    else if (over) html = "เกมจบแล้ว กด \"เริ่มเกมใหม่\" เพื่อเล่นอีกครั้ง";
    else if (scoring) html = scoring.loading ? "ทั้งสองฝ่ายผ่าน กำลังประเมินหมากตาย…" : "<b>นับแต้ม</b> ตรวจหมากตายบนกระดาน";
    else if (thinking) {
      const who = board.toPlay === ai ? "AI กำลังคิด" : "AI กำลังหาตาแนะนำ";
      html = `<b>${who}…</b><span class="meta">${think ? think.visits.toLocaleString() + " รูปแบบ · คิดว่า " + moveName(think.move) + " (" + Math.round(think.winrate * 100) + "%)" : "เริ่มอ่าน"}</span>`;
    } else {
      const last = history.length ? `ตาที่แล้ว: ${history.length % 2 ? "ดำ" : "ขาว"} ${moveName(history[history.length - 1])}` : "เริ่มเกม";
      const mine = board.toPlay === human ? `ตาคุณ (${human === BLACK ? "ดำ" : "ขาว"})` : "ตา AI";
      html = `<b>${mine}</b><span class="meta">ตาที่ ${history.length + 1} · ${last}${hint !== null ? " · แนะนำ " + moveName(hint) : ""}</span>`;
    }
    el.innerHTML = html;
    const live = !over && !scoring, myTurn = engineReady && live && !thinking && board.toPlay === human;
    $("btnPass").disabled = !myTurn; $("btnHint").disabled = !myTurn;
  }

  let dpr = 1, S = 800;
  function resize() {
    const w = cv.getBoundingClientRect().width || 600;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    S = w; cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr);
    drawBoard();
  }
  window.addEventListener("resize", () => { if (board) resize(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (board && !$("game").hidden) resize(); }).observe(cv.parentElement);

  let grain = null, grainKey = "";
  function woodLayer(W) {
    if (grainKey === String(W)) return grain;
    const c = document.createElement("canvas"); c.width = c.height = W; const x = c.getContext("2d");
    const lg = x.createLinearGradient(0, 0, W, W); lg.addColorStop(0, "#e6c07a"); lg.addColorStop(.5, "#ddb267"); lg.addColorStop(1, "#cf9f52");
    x.fillStyle = lg; x.fillRect(0, 0, W, W);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      const y0 = r() * W, amp = 3 + r() * 10, f = 0.002 + r() * 0.006;
      x.strokeStyle = `rgba(120,72,20,${0.04 + r() * 0.07})`; x.lineWidth = 0.6 + r() * 2.2 * (W / 800);
      x.beginPath();
      for (let px = 0; px <= W; px += 8) { const py = y0 + Math.sin(px * f + i) * amp; px ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
    }
    grain = c; grainKey = String(W); return c;
  }
  function drawStone(cx, cy, r, color, alpha) {
    g.save(); g.globalAlpha = alpha == null ? 1 : alpha;
    if (alpha == null) { g.fillStyle = "rgba(40,22,0,.35)"; g.beginPath(); g.arc(cx + r * .08, cy + r * .12, r, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r);
    if (color === BLACK) { gr.addColorStop(0, "#6b6b6b"); gr.addColorStop(.45, "#202020"); gr.addColorStop(1, "#050505"); }
    else { gr.addColorStop(0, "#ffffff"); gr.addColorStop(.6, "#ecebe5"); gr.addColorStop(1, "#bdbcb3"); }
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.restore();
  }
  function drawBoard() {
    if (!board) return;
    const W = cv.width; g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(woodLayer(W), 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = S / (n + 1), P = i => cell * (i + 1);
    g.strokeStyle = "rgba(42,29,12,.85)"; g.lineWidth = Math.max(0.8, cell / 34);
    g.beginPath();
    for (let i = 0; i < n; i++) { g.moveTo(P(0), P(i)); g.lineTo(P(n - 1), P(i)); g.moveTo(P(i), P(0)); g.lineTo(P(i), P(n - 1)); }
    g.stroke();
    g.lineWidth = Math.max(1.4, cell / 18); g.strokeRect(P(0), P(0), P(n - 1) - P(0), P(n - 1) - P(0));
    const stars = n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : [2, 4, 6];
    g.fillStyle = "#2a1d0c";
    for (const a of stars) for (const b of stars) {
      if (n === 9 && (a === 4) !== (b === 4)) continue;
      g.beginPath(); g.arc(P(a), P(b), Math.max(2, cell * .11), 0, 7); g.fill();
    }
    g.fillStyle = "rgba(42,29,12,.75)"; g.font = `500 ${Math.max(8, cell * .34)}px "IBM Plex Mono", monospace`;
    g.textAlign = "center"; g.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      g.fillText(LETTERS[i], P(i), cell * .42); g.fillText(LETTERS[i], P(i), S - cell * .42);
      g.fillText(String(n - i), cell * .42, P(i)); g.fillText(String(n - i), S - cell * .42, P(i));
    }
    const r = cell * .475, dead = scoring ? scoring.dead : null, terr = scoring && !scoring.loading ? scoring.terr : null;
    for (const p of board.pts) {
      const c = board.color[p]; const [x, y] = board.xy(p);
      if (c === BLACK || c === WHITE) {
        const isDead = dead && dead.has(p);
        drawStone(P(x), P(y), r, c, isDead ? 0.45 : null);
        if (isDead) {
          g.strokeStyle = c === BLACK ? "#f3f3ee" : "#1a1a1a"; g.lineWidth = Math.max(1.2, cell / 14); const k = r * .4;
          g.beginPath(); g.moveTo(P(x) - k, P(y) - k); g.lineTo(P(x) + k, P(y) + k); g.moveTo(P(x) + k, P(y) - k); g.lineTo(P(x) - k, P(y) + k); g.stroke();
        }
      }
      if (terr) {
        const owner = terr.get(p);
        if (owner) { const k = cell * .2; g.fillStyle = owner === BLACK ? "rgba(10,10,10,.85)" : "rgba(255,255,255,.95)";
          g.fillRect(P(x) - k, P(y) - k, 2 * k, 2 * k); if (owner === WHITE) { g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1; g.strokeRect(P(x) - k, P(y) - k, 2 * k, 2 * k); } }
      }
    }
    const last = history.length ? history[history.length - 1] : PASS;
    if (last !== PASS && !scoring) {
      const [x, y] = board.xy(last); const c = board.color[last];
      g.strokeStyle = c === BLACK ? "#f5f2e8" : "#222"; g.lineWidth = Math.max(1.4, cell / 14);
      g.beginPath(); g.arc(P(x), P(y), r * .45, 0, 7); g.stroke();
    }
    const target = thinking && think && board.toPlay !== ai ? think.move : hint;
    if (target !== null && target !== undefined && target !== PASS) {
      const [x, y] = board.xy(target);
      g.strokeStyle = "#1f6b55"; g.lineWidth = Math.max(2, cell / 10); g.setLineDash([cell * .14, cell * .1]);
      g.beginPath(); g.arc(P(x), P(y), r * .8, 0, 7); g.stroke(); g.setLineDash([]);
    }
    if (hover !== null && engineReady && !thinking && !over && !scoring && board.toPlay === human && board.isLegal(hover, human)) {
      const [x, y] = board.xy(hover); drawStone(P(x), P(y), r, human, .45);
    }
  }

  const syncSize = seg("segSize", "size"); seg("segColor", "human");
  // home screen: arcade-style character select, one featured card with its neighbours either side
  const charsEl = $("chars"), L8 = CHARS.length;
  const pxImg = (c, cls) => `<img class="${cls}" src="chars/${c.id}.jpg" alt="${c.name}" width="480" height="480">`;
  function blip(f) {
    if (!actx || !soundOn) return;
    const t = actx.currentTime, o = actx.createOscillator(), g2 = actx.createGain();
    o.type = "square"; o.frequency.setValueAtTime(f, t); g2.gain.setValueAtTime(0.06, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g2).connect(actx.destination); o.start(t); o.stop(t + 0.09);
  }
  $("faces").innerHTML = CHARS.map((c, i) => `<button data-i="${i}" aria-label="${c.name}"><img src="chars/${c.id}_face.jpg" alt="" width="160" height="160"></button>`).join("");
  function syncChars(anim) {
    const i = settings.char, c = CHARS[i], prev = CHARS[(i + L8 - 1) % L8], next = CHARS[(i + 1) % L8];
    charsEl.innerHTML = `<button class="ghost left" data-go="-1" aria-label="ตัวก่อนหน้า">${pxImg(prev, "")}</button>
      <button class="arrow left" data-go="-1" aria-label="ตัวก่อนหน้า"></button>
      <div class="card${anim ? " pop" : ""}"><div class="card-in"><div class="cname">${c.en}</div><div class="cthai">${c.name}</div>${pxImg(c, "pxp")}<div class="crank">${c.rank}</div></div></div>
      <button class="arrow right" data-go="1" aria-label="ตัวถัดไป"></button>
      <button class="ghost right" data-go="1" aria-label="ตัวถัดไป">${pxImg(next, "")}</button>`;
    $("pick").innerHTML = `<div class="cmeta">${c.country} · ${STYLE[c.style].label}</div><p class="cbio">${c.bio}</p><p class="csay">"${c.say.hello}"</p>`;
    $("faces").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.i === i)));
    syncSize();
  }
  function choose(i) { unlockAudio(); settings.char = (i + L8) % L8; save("char8", settings.char); syncChars(true); blip(660); }
  charsEl.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) choose(settings.char + +b.dataset.go); });
  $("faces").addEventListener("click", e => { const b = e.target.closest("button"); if (b) choose(+b.dataset.i); });
  let swipeX = null;
  charsEl.addEventListener("pointerdown", e => { swipeX = e.clientX; });
  charsEl.addEventListener("pointerup", e => { if (swipeX === null) return; const dx = e.clientX - swipeX; swipeX = null; if (Math.abs(dx) > 40) choose(settings.char + (dx < 0 ? 1 : -1)); });
  document.addEventListener("keydown", e => {
    if ($("home").hidden) return;
    if (e.key === "ArrowLeft") choose(settings.char - 1); else if (e.key === "ArrowRight") choose(settings.char + 1);
    else if (e.key === "Enter" && !e.target.closest("button")) { unlockAudio(); startGame(); }
  });
  ["segSize", "segColor"].forEach(id => $(id).addEventListener("click", () => { unlockAudio(); blip(520); }));
  syncChars();
  document.body.classList.add("arcade");
  function showHome() { cancelAI(); $("game").hidden = true; $("home").hidden = false; document.body.classList.add("arcade"); document.body.classList.remove("playing"); window.scrollTo(0, 0); syncChars(); }
  function startGame() { blip(880); $("home").hidden = true; $("game").hidden = false; document.body.classList.remove("arcade"); document.body.classList.add("playing"); window.scrollTo(0, 0); newGame(); }
  $("btnNew").onclick = () => { unlockAudio(); startGame(); };
  const syncSound = () => { $("btnSound").textContent = soundOn ? "เสียง: เปิด" : "เสียง: ปิด"; $("btnSound").setAttribute("aria-pressed", String(soundOn)); };
  $("btnSound").onclick = () => { soundOn = !soundOn; save("sound", soundOn); unlockAudio(); syncSound(); clack(); };
  syncSound();
  // true fullscreen where the browser allows it (Android, desktop); the layout already fits the screen either way
  const fsEl = document.documentElement, canFs = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  $("btnFull").hidden = !canFs;
  $("btnFull").onclick = () => {
    try {
      if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { const r = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl); if (r && r.catch) r.catch(() => {}); }
    } catch (e) {}
  };
  const syncFs = () => { $("btnFull").textContent = isFs() ? "ออกเต็มจอ" : "เต็มจอ"; if (board) resize(); };
  document.addEventListener("fullscreenchange", syncFs); document.addEventListener("webkitfullscreenchange", syncFs);
  $("btnRestart").onclick = () => { settings.char = gameChar; newGame(); };
  $("btnHome").onclick = showHome;
  initEngine();
})();
