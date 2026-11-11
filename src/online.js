// PLAY ONLINE (rooms between two signed-in players) and WATCH (games in progress, live): lobby, room settings, the
// online board, and the spectator view of online games and of games against the AI / rank tests.
// Server side: worker/online.js through Hub (src/hub.js).
const Online = (() => {
  let D = null; // from nn_main: { CHARS, rankName, hideScreens, showMenu, blip, clack, askSure, Board, PASS, BLACK, WHITE, countLead }
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const charOf = id => D.CHARS.find(c => c.id === id);
  const face = a => a && charOf(a) ? `chars/${a}_face.jpg` : "menu/guest.png";
  const rankOf = r => typeof r === "number" ? D.rankName(r) : "ยังไม่สอบ";
  const show = id => { D.hideScreens(); $(id).hidden = false; window.scrollTo(0, 0); };
  const mins = s => s >= 60 ? `${s / 60} นาที` : s ? `${s} วิ` : "ไม่มี";
  const timeText = x => `${x.main ? mins(x.main) : "ไม่มีเวลาหลัก"}${x.byo ? ` + เบียวโยมิ ${x.byo} วิ × ${x.per}` : ""}`;
  const pickText = { b: "เจ้าของห้องถือดำ", w: "เจ้าของห้องถือขาว", r: "สุ่มสี" };
  const clockText = s => { s = Math.max(0, s); const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, "0")}`; };

  // ---------- lobby (PLAY ONLINE) and WATCH lists ----------
  let lobbyMode = null, offs = [], rooms = {}, lives = {};
  function unsubAll() { offs.forEach(f => f()); offs = []; }
  function openLobby(mode) { // "play" or "watch"
    show(mode === "play" ? "onl" : "wat"); // hiding the other screens leaves any game or list being watched
    lobbyMode = mode;
    rooms = {}; lives = {};
    renderLobby();
    Hub.op("lobby", {}).then(r => { if (r.status === 200) { rooms = Object.fromEntries(r.body.rooms.map(x => [x.id, x])); lives = Object.fromEntries(r.body.live.map(x => [x.g, x])); renderLobby(); } });
    offs.push(Hub.sub("rooms", v => { rooms = (v && v.list) || {}; renderLobby(); }));
    offs.push(Hub.sub("lvidx", v => { lives = (v && v.list) || {}; renderLobby(); }));
    offs.push(Hub.onState(() => renderLobby()));
  }
  const pRow = (p, extra) => `<span class="ol-p"><img src="${face(p && p.a)}" alt="" width="160" height="160"><b>${esc(p ? p.n : "?")}</b><span class="ch-rank${p && typeof p.r === "number" ? "" : " no"}">${esc(rankOf(p && p.r))}</span>${extra || ""}</span>`;
  function gameRows(list) {
    return list.map(g => g.kind === "room"
      ? `<div class="ol-row"><div class="ol-who">${pRow(g.r.host, g.r.black === g.r.host.n ? " ⚫" : " ⚪")}<span class="ol-vs">vs</span>${pRow(g.r.guest, g.r.black === (g.r.guest && g.r.guest.n) ? " ⚫" : " ⚪")}</div>
          <div class="ol-meta"><span class="ol-tag">คน vs คน</span> ${g.r.size}×${g.r.size} · ${esc(timeText(g.r))} · ตาที่ ${g.r.moves}</div><button class="pf-an" data-watch-room="${g.r.id}">ดู</button></div>`
      : (() => { const c = charOf(g.l.char) || { name: g.l.char, id: "" };
        return `<div class="ol-row"><div class="ol-who">${pRow(g.l.who, g.l.human === 1 ? " ⚫" : " ⚪")}<span class="ol-vs">vs</span><span class="ol-p"><img src="${c.id ? `chars/${c.id}_face.jpg` : "menu/guest.png"}" alt="" width="160" height="160"><b>${esc(c.name)}</b>${g.l.human === 1 ? " ⚪" : " ⚫"}</span></div>
          <div class="ol-meta"><span class="ol-tag${g.l.exam ? " exam" : " ai"}">${g.l.exam ? "สอบวัดระดับ" : "vs AI"}</span> ${g.l.size}×${g.l.size} · ตาที่ ${g.l.moves}${g.l.ended ? " · จบแล้ว" : ""}</div><button class="pf-an" data-watch-live="${g.l.g}">ดู</button></div>`; })()).join("");
  }
  function playing() {
    const now = Date.now();
    const a = Object.values(rooms).filter(r => r.st === "play" || r.st === "score").map(r => ({ kind: "room", r, at: r.at }));
    const b = Object.values(lives).filter(l => now - l.at < 10 * 60e3 && !l.ended).map(l => ({ kind: "live", l, at: l.at }));
    return a.concat(b).sort((x, y) => y.at - x.at);
  }
  function renderLobby() {
    if (lobbyMode === "watch") {
      const g = playing();
      $("watBody").innerHTML = (g.length ? `<div class="ol-list">${gameRows(g)}</div>` : `<p class="pf-empty">ตอนนี้ยังไม่มีใครเล่นอยู่ ลองกลับมาดูใหม่นะ (รายการอัปเดตเอง)</p>`)
        + `<p class="note" style="margin-top:8px">ดูได้ทั้งเกมคน vs คน เกมกับ AI และการสอบวัดระดับ แบบเรียลไทม์ · เกมกับ AI ที่ไม่ได้ล็อกอินจะขึ้นชื่อ "ผู้เล่นทั่วไป"</p>`;
      return;
    }
    if (lobbyMode !== "play") return;
    const me = Account.name();
    const open = Object.values(rooms).filter(r => r.st === "open").sort((x, y) => y.at - x.at);
    let h = me ? `<button class="px-start ol-new" id="olNew">+ สร้างห้อง</button>`
      : `<div class="lb-me">ล็อกอินก่อนถึงจะสร้างห้องหรือ Join ได้ <button class="pf-an primary" data-acct="login">เข้าสู่ระบบ</button></div>`;
    h += `<div class="pf-h">ห้องที่รอคู่แข่ง</div>`;
    h += open.length ? `<div class="ol-list">${open.map(r => { const mine = r.host.n === me;
      return `<div class="ol-row${mine ? " me" : ""}"><div class="ol-who">${pRow(r.host)}</div><div class="ol-meta">${r.size}×${r.size} · ${esc(timeText(r))} · ${pickText[r.pick]}</div>
        ${mine ? `<button class="pf-an" data-enter="${r.id}">ห้องของคุณ</button>` : `<button class="pf-an primary" data-join="${r.id}"${me ? "" : " disabled"}>Join</button>`}</div>`; }).join("")}</div>`
      : `<p class="pf-empty">ยังไม่มีห้องว่าง กด "สร้างห้อง" แล้วรอคนมา Join ได้เลย</p>`;
    const g = playing().filter(x => x.kind === "room");
    if (g.length) h += `<div class="pf-h">กำลังเล่นอยู่</div><div class="ol-list">${gameRows(g)}</div>`;
    $("onlBody").innerHTML = h + `<p class="ch-err" id="onlErr" aria-live="assertive"></p>`;
  }

  // ---------- create a room ----------
  const SET = { size: 19, main: 600, byo: 30, per: 3, pick: "r" };
  function openNew() {
    for (const [k, v] of Object.entries(SET)) for (const b of $("onNew").querySelectorAll(`[data-k="${k}"] button`)) b.setAttribute("aria-pressed", String(b.dataset.v == v));
    $("onPerRow").hidden = !SET.byo;
    $("onErr").textContent = "";
    $("onNew").hidden = false;
  }
  async function create() {
    $("onGo").disabled = true; $("onErr").textContent = "กำลังสร้างห้อง…";
    const r = await Hub.op("create", Object.assign({ token: Account.token() }, SET));
    $("onGo").disabled = false;
    if (r.status !== 200) { $("onErr").textContent = r.body.error || "สร้างห้องไม่สำเร็จ"; return; }
    $("onNew").hidden = true; enterRoom(r.body.room.id, r.body.room);
  }

  // ---------- the online board: playing a room, or watching a room / a game against the AI ----------
  let G = null; // { kind: "room"|"live", id, room|live, off, me: "b"|"w"|null, ghost, b: Board, scored, ticked }
  let tickTimer = 0;
  function leaveGame() { if (G) { G.off && G.off(); G = null; } clearInterval(tickTimer); }
  function enterRoom(id, first) {
    leaveGame(); show("og");
    G = { kind: "room", id, room: null, me: null, ghost: null, scored: false, ticked: 0 };
    const g = G;
    if (first) setRoom(first);
    G.off = Hub.sub("room:" + id, r => { if (G === g) { if (!r) { $("ogStatus").textContent = "ห้องนี้ถูกปิดแล้ว"; return; } setRoom(r); } });
    tickTimer = setInterval(tick, 250);
    draw();
  }
  function watchLive(gid) {
    leaveGame(); show("og");
    G = { kind: "live", id: gid, live: null, me: null };
    const g = G;
    G.off = Hub.sub("lv:" + gid, v => { if (G === g && v) { const n0 = G.live ? G.live.moves.length : 0; G.live = v; G.at = Date.now(); if (v.moves.length > n0 && n0) D.clack(); render(); } });
    tickTimer = setInterval(() => renderClocks(), 500);
    render();
  }
  function setRoom(r) {
    const prev = G.room;
    if (prev && r.v < prev.v) return;
    G.room = r;
    const me = Account.name();
    G.me = r.black === me ? "b" : r.white === me ? "w" : null;
    if (prev && r.moves.length > prev.moves.length && r.moves[r.moves.length - 1]) D.clack();
    G.b = replayBoard(r.size, r.moves);
    G.ghost = null;
    if (r.st === "score" && G.me && !G.scored && !(r.scores && r.scores[G.me] !== undefined)) countScore();
    render();
  }
  function replayBoard(n, moves) {
    const b = new D.Board(n);
    for (const m of moves) b.play(m ? b.pt(m[0], m[1]) : D.PASS);
    return b;
  }
  async function countScore() {
    G.scored = true; const g = G, r = G.room;
    const res = await D.countLead(r.size, r.moves, r.komi);
    if (G !== g) return;
    G.dead = res.dead;
    render();
    const x = await Hub.op("score", { token: Account.token(), id: r.id, m: res.lead });
    if (x.status !== 200 && G === g) $("ogStatus").textContent = x.body.error || "ส่งผลนับแต้มไม่สำเร็จ";
  }
  // the time left on a room's clock for colour c, counted down for the player to move
  function left(r, c) {
    const [main, per] = r.clk[c];
    if (r.st !== "play" || (r.moves.length % 2 === 0 ? "b" : "w") !== c) return { main, per, byo: main > 0 ? r.byo : r.byo };
    const el = (Hub.now() - r.turnAt) / 1000;
    if (el <= main) return { main: main - el, per, byo: r.byo, run: true };
    if (!r.byo || per <= 0) return { main: 0, per: 0, byo: 0, run: true, out: true };
    const over = el - main, used = Math.floor(over / r.byo), p = per - used;
    return p > 0 ? { main: 0, per: p, byo: r.byo - (over - used * r.byo), run: true } : { main: 0, per: 0, byo: 0, run: true, out: true };
  }
  function clockStr(t, byoLen) {
    if (t.main > 0) return clockText(t.main) + (byoLen && t.per ? ` <small>+${t.per}×${byoLen}</small>` : "");
    if (t.out) return "หมดเวลา";
    return byoLen ? `${Math.ceil(t.byo)} <small>วิ · เหลือ ${t.per} ครั้ง</small>` : "0:00";
  }
  function tick() {
    if (!G || G.kind !== "room" || !G.room) return;
    renderClocks();
    const r = G.room, c = r.moves.length % 2 === 0 ? "b" : "w";
    if (r.st === "play" && left(r, c).out && Date.now() - G.ticked > 3000) { G.ticked = Date.now(); Hub.op("tick", { id: r.id }); }
    if (r.st === "score" && Hub.now() - r.scoreAt > 62000 && Date.now() - G.ticked > 5000) { G.ticked = Date.now(); Hub.op("tick", { id: r.id }); }
  }
  function renderClocks() {
    if (!G) return;
    if (G.kind === "room" && G.room) {
      const r = G.room;
      for (const c of ["b", "w"]) $("og" + c + "C").innerHTML = clockStr(left(r, c), r.byo);
    } else if (G.kind === "live" && G.live && G.live.clocks) {
      const cl = G.live.clocks, toPlay = G.live.moves.length % 2 === 0 ? 0 : 1, el = G.live.ended ? 0 : (Date.now() - G.at) / 1000;
      ["b", "w"].forEach((c, i) => { const [main, per, byo] = cl[i]; let m = main, b = byo; if (i === toPlay) { if (m > 0) m = Math.max(0, m - el); else b = Math.max(0, b - el); }
        $("og" + c + "C").innerHTML = m > 0 ? clockText(m) : `${Math.ceil(b)} <small>วิ · เหลือ ${per} ครั้ง</small>`; });
    }
  }
  const RES = { resign: "ยอมแพ้", timeout: "หมดเวลา", score: "นับแต้ม" };
  function render() {
    if (!G) return;
    let black, white, status = "", btns = false, turn = null;
    if (G.kind === "room") {
      const r = G.room; if (!r) { $("ogStatus").textContent = "กำลังโหลด…"; return; }
      const host = r.host, guest = r.guest;
      black = r.black ? (r.black === host.n ? host : guest) : host; white = r.white ? (r.white === host.n ? host : guest) : null;
      turn = r.st === "play" ? (r.moves.length % 2 === 0 ? "b" : "w") : null;
      if (r.st === "open") status = `รอคู่แข่งกด Join · รหัสห้อง <b>${r.id}</b> · ${r.size}×${r.size} · ${esc(timeText(r))} · ${pickText[r.pick]}`;
      else if (r.st === "play") status = G.me ? (turn === G.me ? "ตาคุณเดิน" : "รอคู่แข่งเดิน…") : `กำลังดู · ตาที่ ${r.moves.length + 1}`;
      else if (r.st === "score") status = "ผ่านกันทั้งคู่ กำลังนับแต้ม…";
      else if (r.res) { const w = r.res.winner === "b" ? "ดำ" : "ขาว", wn = r.res.winner === "b" ? r.black : r.white;
        status = `<b>${w}ชนะ</b> (${esc(wn)}) · ${RES[r.res.how] || ""}${r.res.margin != null ? ` ${r.res.margin} แต้ม` : ""}${G.me ? (r.res.winner === G.me ? " · คุณชนะ! 🎉" : " · คุณแพ้") : ""}`; }
      btns = !!G.me && (r.st === "play");
      $("ogClose").hidden = !(r.st === "open" && G.me === null && r.host.n === Account.name());
    } else {
      const l = G.live; if (!l) { $("ogStatus").textContent = "รอข้อมูลตาถัดไปจากผู้เล่น…"; $("ogB").innerHTML = $("ogW").innerHTML = ""; draw(); return; }
      const c = charOf(l.char) || { name: l.char, id: "" }, ai = { n: c.name, r: null, a: null, img: c.id ? `chars/${c.id}_face.jpg` : "menu/guest.png", ai: c.rank };
      black = l.human === 1 ? l.who : ai; white = l.human === 1 ? ai : l.who;
      turn = l.ended ? null : (l.moves.length % 2 === 0 ? "b" : "w");
      status = l.ended ? "เกมนี้จบแล้ว" : `กำลังดูสด · ${l.exam ? "สอบวัดระดับ" : "vs AI"} · ตาที่ ${l.moves.length + 1}`;
      $("ogClose").hidden = true;
    }
    const bar = (p, c) => p ? `<img src="${p.img || face(p.a)}" alt="" width="160" height="160"><span class="og-n"><span class="st ${c}"></span><b>${esc(p.n)}</b></span><span class="og-c2"><span class="og-c" id="og${c}C"></span><span class="ch-rank${p.ai || typeof p.r === "number" ? "" : " no"}">${esc(p.ai || rankOf(p.r))}</span></span>`
      : `<span class="og-n"><span class="st ${c}"></span><b>รอคู่แข่ง…</b></span><span class="og-c2"><span class="og-c" id="og${c}C"></span></span>`;
    $("ogB").innerHTML = bar(black, "b"); $("ogW").innerHTML = bar(white, "w");
    $("ogB").classList.toggle("turn", turn === "b"); $("ogW").classList.toggle("turn", turn === "w");
    $("ogStatus").innerHTML = status;
    $("ogPass").hidden = $("ogResign").hidden = !btns;
    $("ogTitle").textContent = G.kind === "room" ? (G.me ? "PLAY ONLINE" : "WATCH") : "WATCH";
    renderClocks(); draw();
  }

  // ---------- drawing ----------
  const STAR = { 9: [2, 4, 6], 13: [3, 6, 9], 19: [3, 9, 15] };
  function draw() {
    const cv = $("ogCv"), box = cv.parentElement.getBoundingClientRect(), sz = Math.max(160, Math.floor(Math.min(box.width, box.height || box.width, window.innerHeight - box.top - 12) - 24));
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== sz * dpr) { cv.width = cv.height = sz * dpr; cv.style.width = cv.style.height = sz + "px"; }
    const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    let n = 19, stones = null, last = -1, dead = null;
    if (G && G.kind === "room" && G.room) { n = G.room.size; const b = G.b; stones = []; for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) { const c = b.color[b.pt(i, y)]; stones.push(c === D.BLACK ? 1 : c === D.WHITE ? 2 : 0); }
      const lm = G.room.moves[G.room.moves.length - 1]; last = lm ? lm[1] * n + lm[0] : -1; dead = G.dead ? new Set(G.dead.map(([i, j]) => j * n + i)) : null; }
    else if (G && G.kind === "live" && G.live) { n = G.live.size; const b = new D.Board(n); for (const m of G.live.moves) b.play(m < 0 ? D.PASS : b.pt(m % n, Math.floor(m / n)));
      stones = []; for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) { const c = b.color[b.pt(i, y)]; stones.push(c === D.BLACK ? 1 : c === D.WHITE ? 2 : 0); }
      const lm = G.live.moves[G.live.moves.length - 1]; last = lm >= 0 ? lm : -1; }
    const cell = sz / (n + 1);
    x.fillStyle = "#dcb57a"; x.fillRect(0, 0, sz, sz);
    x.strokeStyle = "#3b2a17"; x.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      x.beginPath(); x.moveTo(cell, cell * (i + 1)); x.lineTo(cell * n, cell * (i + 1)); x.stroke();
      x.beginPath(); x.moveTo(cell * (i + 1), cell); x.lineTo(cell * (i + 1), cell * n); x.stroke();
    }
    x.fillStyle = "#3b2a17";
    for (const i of STAR[n] || []) for (const j of STAR[n] || []) { if (n === 9 && (i === 4) !== (j === 4)) continue; x.beginPath(); x.arc(cell * (i + 1), cell * (j + 1), Math.max(2, cell * 0.1), 0, 7); x.fill(); }
    const stone = (i, j, c, alpha) => {
      const cx = cell * (i + 1), cy = cell * (j + 1), r = cell * 0.47;
      x.globalAlpha = alpha || 1;
      const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      if (c === 1) { g.addColorStop(0, "#666"); g.addColorStop(1, "#111"); } else { g.addColorStop(0, "#fff"); g.addColorStop(1, "#cfcfc6"); }
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.globalAlpha = 1;
    };
    if (stones) stones.forEach((c, k) => { if (c) stone(k % n, Math.floor(k / n), c, dead && dead.has(k) ? 0.4 : 1); });
    if (last >= 0 && stones) { const i = last % n, j = Math.floor(last / n); x.strokeStyle = stones[last] === 1 ? "#fff" : "#000"; x.lineWidth = 2; x.beginPath(); x.arc(cell * (i + 1), cell * (j + 1), cell * 0.22, 0, 7); x.stroke(); }
    if (G && G.ghost) stone(G.ghost[0], G.ghost[1], G.me === "b" ? 1 : 2, 0.55);
    if (dead) { x.strokeStyle = "#c0392b"; x.lineWidth = 2; for (const k of dead) { const i = k % n, j = Math.floor(k / n), cx = cell * (i + 1), cy = cell * (j + 1), d = cell * 0.18; x.beginPath(); x.moveTo(cx - d, cy - d); x.lineTo(cx + d, cy + d); x.moveTo(cx + d, cy - d); x.lineTo(cx - d, cy + d); x.stroke(); } }
  }
  // tap once to see the stone, again on the same point to play it (a mouse plays on the first click)
  function onBoard(ev) {
    if (!G || G.kind !== "room" || !G.room || G.room.st !== "play" || !G.me) return;
    const r = G.room; if ((r.moves.length % 2 === 0 ? "b" : "w") !== G.me) return;
    const cv = $("ogCv"), rc = cv.getBoundingClientRect(), n = r.size, cell = rc.width / (n + 1);
    const i = Math.round((ev.clientX - rc.left) / cell) - 1, j = Math.round((ev.clientY - rc.top) / cell) - 1;
    if (i < 0 || j < 0 || i >= n || j >= n) return;
    if (!G.b.isLegal(G.b.pt(i, j), G.me === "b" ? D.BLACK : D.WHITE)) { $("ogStatus").textContent = "เดินตรงนั้นไม่ได้"; return; }
    const touch = ev.pointerType === "touch" || ev.pointerType === "pen";
    if (touch && !(G.ghost && G.ghost[0] === i && G.ghost[1] === j)) { G.ghost = [i, j]; draw(); $("ogStatus").textContent = "แตะจุดเดิมอีกครั้งเพื่อวางหมาก"; return; }
    send([i, j]);
  }
  async function send(p) {
    const r = G.room, g = G;
    G.ghost = p ? p : null;
    const x = await Hub.op("move", { token: Account.token(), id: r.id, n: r.moves.length, p });
    if (G !== g) return;
    if (x.status !== 200) { G.ghost = null; $("ogStatus").textContent = x.body.error || "ส่งตาเดินไม่สำเร็จ"; draw(); }
    else if (x.body.room) setRoom(x.body.room);
  }
  // ---------- a game against the AI tells spectators every move ----------
  function live(gid, s) { if (gid) Hub.op("live", { token: Account.token(), g: gid, s }); }

  function init(deps) {
    D = deps;
    $("onlBack").onclick = () => { D.blip(660); unsubAll(); lobbyMode = null; D.showMenu(); };
    $("watBack").onclick = () => { D.blip(660); unsubAll(); lobbyMode = null; D.showMenu(); };
    $("ogBack").onclick = () => { D.blip(660); const from = G && G.kind === "room" && (G.me || (G.room && G.room.host.n === Account.name())) ? "play" : "watch"; leaveGame(); openLobby(from); };
    $("ogClose").onclick = async () => { if (!G || !G.room) return; await Hub.op("close", { token: Account.token(), id: G.room.id }); leaveGame(); openLobby("play"); };
    $("ogPass").onclick = async () => { if (G && G.room && await D.askSure("ผ่าน?", "ไม่วางหมากตานี้ (ถ้าผ่านกันทั้งคู่ เกมจะจบและนับแต้ม)", "ผ่าน")) send(null); };
    $("ogResign").onclick = async () => { if (!G || !G.room || !await D.askSure("ยอมแพ้?", "ยอมแพ้เกมนี้จริงไหม", "ยอมแพ้")) return; const x = await Hub.op("resign", { token: Account.token(), id: G.room.id }); if (x.status === 200 && x.body.room) setRoom(x.body.room); };
    $("ogCv").addEventListener("pointerup", onBoard);
    window.addEventListener("resize", () => { if (G) draw(); });
    $("onNew").addEventListener("click", e => {
      if (e.target === $("onNew") || e.target.id === "onX") { $("onNew").hidden = true; return; }
      const b = e.target.closest("[data-k] button"); if (!b) return;
      const k = b.closest("[data-k]").dataset.k; SET[k] = k === "pick" ? b.dataset.v : +b.dataset.v;
      openNew();
    });
    $("onGo").onclick = create;
    document.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("button"); if (!b) return;
      if (b.id === "olNew") { D.blip(880); openNew(); }
      else if (b.dataset.join) { D.blip(880); (async () => { const x = await Hub.op("join", { token: Account.token(), id: b.dataset.join }); if (x.status !== 200) { const e = $("onlErr"); if (e) { e.textContent = x.body.error || "เข้าห้องไม่ได้"; setTimeout(() => { e.textContent = ""; }, 4000); } return; } enterRoom(x.body.room.id, x.body.room); })(); }
      else if (b.dataset.enter) { D.blip(880); enterRoom(b.dataset.enter); }
      else if (b.dataset.watchRoom) { D.blip(880); enterRoom(b.dataset.watchRoom); }
      else if (b.dataset.watchLive) { D.blip(880); watchLive(b.dataset.watchLive); }
    });
  }
  return { init, openLobby, live, leave: () => { leaveGame(); unsubAll(); lobbyMode = null; } };
})();
