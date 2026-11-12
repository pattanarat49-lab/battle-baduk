// Stone and board skins: bought with LEARN XP in the shop (src/learn.js), equipped there or in the Profile (owner, 2026-11-12).
// Used by the boards people play on: the AI game (nn_main.js) and online play (online.js). Lessons, Analysis and Tsumego keep the classic look.
// Bought ids live in gonn.learn.owned (synced with the account); the two equipped ids in gonn.skin = { stone, board } (account key "skin").
const Skins = (function () {
  const heart = (x, cx, cy, s) => { x.beginPath(); x.moveTo(cx, cy + s * .9); x.bezierCurveTo(cx - s * 1.5, cy - s * .1, cx - s * .75, cy - s * 1.15, cx, cy - s * .35); x.bezierCurveTo(cx + s * .75, cy - s * 1.15, cx + s * 1.5, cy - s * .1, cx, cy + s * .9); x.fill(); };
  const paw = (x, cx, cy, s) => {
    x.beginPath(); x.ellipse(cx, cy + s * .35, s * .62, s * .5, 0, 0, 7); x.fill();
    for (const [dx, dy] of [[-.72, -.25], [-.26, -.72], [.26, -.72], [.72, -.25]]) { x.beginPath(); x.ellipse(cx + dx * s, cy + dy * s, s * .22, s * .27, 0, 0, 7); x.fill(); }
  };
  const ball = (x, cx, cy, r, stops, hx = .35, hy = .4) => { const g = x.createRadialGradient(cx - r * hx, cy - r * hy, r * .1, cx, cy, r); stops.forEach(([o, c]) => g.addColorStop(o, c)); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); };
  const rim = (x, cx, cy, r, col, w) => { x.strokeStyle = col; x.lineWidth = Math.max(1, r * w); x.beginPath(); x.arc(cx, cy, r - x.lineWidth / 2, 0, 7); x.stroke(); };
  const B = [[0, "#6b6b6b"], [.45, "#202020"], [1, "#050505"]], Wt = [[0, "#ffffff"], [.6, "#ecebe5"], [1, "#bdbcb3"]];
  // paint(ctx, cx, cy, r, black): the stone itself; the shadow and transparency are handled by drawStone
  const STONES = [
    { id: "s_classic", t: "คลาสสิก", tag: "ดั้งเดิม", cost: 0, paint: (x, cx, cy, r, b) => ball(x, cx, cy, r, b ? B : Wt) },
    { id: "s_neon", t: "นีออน", tag: "เท่", cost: 150, paint: (x, cx, cy, r, b) => {
      ball(x, cx, cy, r, b ? [[0, "#3a4a6b"], [.5, "#131a2e"], [1, "#05070f"]] : [[0, "#ffffff"], [.65, "#f1eefc"], [1, "#cfc6ea"]]);
      rim(x, cx, cy, r, b ? "#35e6ff" : "#ff4fd8", .13); } },
    { id: "s_fireice", t: "ไฟกับน้ำแข็ง", tag: "เท่", cost: 250, paint: (x, cx, cy, r, b) => {
      if (b) { ball(x, cx, cy, r, [[0, "#ff9a3c"], [.3, "#8a2408"], [.7, "#2a0703"], [1, "#0a0101"]]); rim(x, cx, cy, r, "rgba(255,110,40,.75)", .07); }
      else { ball(x, cx, cy, r, [[0, "#ffffff"], [.55, "#e2f4ff"], [1, "#8fc8ee"]]); rim(x, cx, cy, r, "rgba(70,150,215,.8)", .07); } } },
    { id: "s_galaxy", t: "กาแล็กซี", tag: "เท่", cost: 300, paint: (x, cx, cy, r, b) => {
      if (b) {
        ball(x, cx, cy, r, [[0, "#7a5cc4"], [.45, "#2a1a5e"], [1, "#07041c"]]);
        let s = ((cx * 31 + cy * 17) | 0) + 11; const rnd = () => (s = (s * 16807 + 7) % 2147483647) / 2147483647;
        x.fillStyle = "rgba(255,255,255,.9)";
        for (let i = 0; i < 7; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r * .78; x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(.5, r * (.03 + rnd() * .04)), 0, 7); x.fill(); }
      } else {
        ball(x, cx, cy, r, [[0, "#ffffff"], [.6, "#f3efe0"], [1, "#c9c3ae"]]);
        x.fillStyle = "rgba(150,142,120,.28)";
        for (const [dx, dy, k] of [[.3, .25, .2], [-.3, .38, .13], [.05, -.4, .11], [-.42, -.12, .09]]) { x.beginPath(); x.arc(cx + dx * r, cy + dy * r, k * r, 0, 7); x.fill(); }
      } } },
    { id: "s_heart", t: "หัวใจลูกกวาด", tag: "น่ารัก", cost: 150, paint: (x, cx, cy, r, b) => {
      ball(x, cx, cy, r, b ? [[0, "#9a5a86"], [.5, "#4a1f3c"], [1, "#22091a"]] : [[0, "#ffffff"], [.6, "#ffe9f0"], [1, "#f6b9cb"]]);
      x.fillStyle = b ? "#ff8fb8" : "#ff5c8d"; heart(x, cx, cy + r * .04, r * .36); } },
    { id: "s_paw", t: "อุ้งเท้าแมว", tag: "น่ารัก", cost: 200, paint: (x, cx, cy, r, b) => {
      ball(x, cx, cy, r, b ? [[0, "#6a6a70"], [.5, "#2a2a30"], [1, "#0c0c10"]] : [[0, "#ffffff"], [.6, "#fff6e6"], [1, "#e6d2b0"]]);
      x.fillStyle = b ? "#ffa3bd" : "#c98a5e"; paw(x, cx, cy, r * .5); } },
    { id: "s_jade", t: "หยกกับมุก", tag: "สวย", cost: 300, paint: (x, cx, cy, r, b) => {
      if (b) { ball(x, cx, cy, r, [[0, "#7fd0a6"], [.4, "#1f6b4c"], [1, "#062a1c"]]); rim(x, cx, cy, r, "rgba(210,175,90,.9)", .06); }
      else { ball(x, cx, cy, r, [[0, "#ffffff"], [.5, "#fbf6ec"], [.85, "#e9dcc6"], [1, "#cdb88f"]]); rim(x, cx, cy, r, "rgba(196,160,80,.95)", .06); } } },
  ];

  const rng = seed => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  const fillGrad = (x, W, cols) => { const lg = x.createLinearGradient(0, 0, W, W); cols.forEach((c, i) => lg.addColorStop(i / (cols.length - 1), c)); x.fillStyle = lg; x.fillRect(0, 0, W, W); };
  const grainLines = (x, W, rgb, n, a0) => {
    const r = rng(7);
    for (let i = 0; i < n; i++) {
      const y0 = r() * W, amp = 3 + r() * 10, f = 0.002 + r() * 0.006;
      x.strokeStyle = `rgba(${rgb},${a0 + r() * 0.07})`; x.lineWidth = 0.6 + r() * 2.2 * (W / 800);
      x.beginPath();
      for (let px = 0; px <= W; px += 8) { const py = y0 + Math.sin(px * f + i) * amp; px ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
    }
  };
  // paint(ctx, W): the whole board background, W pixels square. line / star / label: ink colours. dark: black stones get a light edge.
  const BOARDS = [
    { id: "b_classic", t: "ไม้คลาสสิก", tag: "ดั้งเดิม", cost: 0, line: "rgba(42,29,12,.85)", star: "#2a1d0c", label: "rgba(42,29,12,.75)", flat: "#dcb57a",
      paint: (x, W) => { fillGrad(x, W, ["#e6c07a", "#ddb267", "#cf9f52"]); grainLines(x, W, "120,72,20", 90, .04); } },
    { id: "b_night", t: "ท้องฟ้าราตรี", tag: "เท่", cost: 200, dark: true, line: "rgba(214,230,250,.8)", star: "#e8f1ff", label: "rgba(214,230,250,.8)", flat: "#3c5878",
      paint: (x, W) => {
        fillGrad(x, W, ["#4a6a90", "#3a5676", "#2c4462"]); const r = rng(23);
        for (let i = 0; i < 130; i++) { x.fillStyle = `rgba(255,255,255,${.12 + r() * .35})`; x.beginPath(); x.arc(r() * W, r() * W, (.4 + r() * 1.3) * W / 800, 0, 7); x.fill(); } } },
    { id: "b_cyber", t: "ไซเบอร์", tag: "เท่", cost: 300, dark: true, line: "rgba(110,240,255,.9)", star: "#ff5fd8", label: "rgba(150,240,255,.85)", flat: "#463a72",
      paint: (x, W) => {
        fillGrad(x, W, ["#54468a", "#43376f", "#33295a"]);
        const g = x.createRadialGradient(W / 2, W / 2, W * .1, W / 2, W / 2, W * .75); g.addColorStop(0, "rgba(255,95,216,.16)"); g.addColorStop(1, "rgba(95,240,255,.10)"); x.fillStyle = g; x.fillRect(0, 0, W, W);
        x.strokeStyle = "rgba(255,255,255,.05)"; x.lineWidth = 1; for (let y = 0; y < W; y += Math.max(3, W / 160)) { x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); } } },
    { id: "b_sakura", t: "ซากุระ", tag: "น่ารัก", cost: 200, line: "rgba(140,62,92,.8)", star: "#8c3e5c", label: "rgba(140,62,92,.8)", flat: "#f6cdd8",
      paint: (x, W) => {
        fillGrad(x, W, ["#fbdde5", "#f6cbd7", "#efb5c6"]); const r = rng(5);
        for (let i = 0; i < 46; i++) {
          const px = r() * W, py = r() * W, s = (5 + r() * 9) * W / 800, a = r() * 6.283;
          x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = `rgba(255,255,255,${.35 + r() * .3})`;
          x.beginPath(); x.moveTo(0, -s); x.bezierCurveTo(s * .9, -s * .5, s * .6, s * .8, 0, s); x.bezierCurveTo(-s * .6, s * .8, -s * .9, -s * .5, 0, -s); x.fill(); x.restore();
        } } },
    { id: "b_mint", t: "มิ้นต์ลายจุด", tag: "น่ารัก", cost: 150, line: "rgba(38,98,84,.8)", star: "#266254", label: "rgba(38,98,84,.8)", flat: "#bfe6d3",
      paint: (x, W) => {
        fillGrad(x, W, ["#d2f0e2", "#bfe6d3", "#a9dcc4"]); const st = W / 14; x.fillStyle = "rgba(255,255,255,.4)";
        for (let j = 0; j * st < W + st; j++) for (let i = 0; i * st < W + st; i++) { x.beginPath(); x.arc(i * st + (j % 2 ? st / 2 : 0), j * st, st * .13, 0, 7); x.fill(); } } },
    { id: "b_bamboo", t: "ป่าไผ่", tag: "สวย", cost: 200, line: "rgba(34,60,22,.85)", star: "#223c16", label: "rgba(34,60,22,.8)", flat: "#b4cc8e",
      paint: (x, W) => {
        fillGrad(x, W, ["#c3d99c", "#b1ca8a", "#9dba76"]); const k = 9, w = W / k, r = rng(41);
        for (let i = 0; i < k; i++) {
          const g = x.createLinearGradient(i * w, 0, (i + 1) * w, 0); g.addColorStop(0, "rgba(60,95,30,.16)"); g.addColorStop(.5, "rgba(255,255,255,.14)"); g.addColorStop(1, "rgba(60,95,30,.16)");
          x.fillStyle = g; x.fillRect(i * w, 0, w, W);
          x.strokeStyle = "rgba(60,95,30,.28)"; x.lineWidth = Math.max(1, W / 420);
          for (let y = r() * W * .3; y < W; y += W * (.22 + r() * .14)) { x.beginPath(); x.moveTo(i * w + 1, y); x.lineTo((i + 1) * w - 1, y); x.stroke(); }
        } } },
    { id: "b_walnut", t: "ไม้วอลนัท", tag: "สวย", cost: 300, line: "rgba(28,14,4,.9)", star: "#1c0e04", label: "rgba(28,14,4,.8)", flat: "#b07c48",
      paint: (x, W) => { fillGrad(x, W, ["#bd8a54", "#ad7a46", "#996538"]); grainLines(x, W, "60,28,6", 130, .06); } },
  ];

  const ALL = STONES.map(s => Object.assign(s, { kind: "stone" })).concat(BOARDS.map(b => Object.assign(b, { kind: "board" })));
  const byId = id => ALL.find(s => s.id === id);
  const read = k => { try { return JSON.parse(localStorage.getItem("gonn." + k) || "null"); } catch (e) { return null; } };
  const owned = id => { const it = byId(id); if (!it) return false; if (!it.cost) return true; const p = read("learn"); return !!(p && Array.isArray(p.owned) && p.owned.includes(id)); };
  // what is equipped now; an id that is not owned (another device, signed out) falls back to the classic one
  function cur() {
    const e = read("skin") || {};
    const s = byId(e.stone), b = byId(e.board);
    return { stone: s && s.kind === "stone" && owned(s.id) ? s : STONES[0], board: b && b.kind === "board" && owned(b.id) ? b : BOARDS[0] };
  }
  const listeners = [];
  function equip(id) {
    const it = byId(id); if (!it || !owned(id)) return false;
    const e = read("skin") || {}; e[it.kind] = id;
    try { localStorage.setItem("gonn.skin", JSON.stringify(e)); } catch (err) {}
    try { if (window.Account) Account.push(); } catch (err) {}
    listeners.forEach(f => { try { f(); } catch (err) {} });
    return true;
  }
  const equipped = id => { const c = cur(); return c.stone.id === id || c.board.id === id; };

  // color: 1 black, 2 white. alpha null: a solid stone with its shadow; a number: see-through, no shadow
  function drawStone(x, cx, cy, r, color, alpha, skin, board) {
    const sk = skin || cur().stone, bd = board || cur().board, black = color === 1;
    x.save(); x.globalAlpha = alpha == null ? 1 : alpha;
    if (alpha == null) { x.fillStyle = bd.dark ? "rgba(0,0,10,.4)" : "rgba(40,22,0,.35)"; x.beginPath(); x.arc(cx + r * .08, cy + r * .12, r, 0, 7); x.fill(); }
    sk.paint(x, cx, cy, r, black);
    if (bd.dark && black) { x.strokeStyle = "rgba(255,255,255,.4)"; x.lineWidth = Math.max(.8, r * .05); x.beginPath(); x.arc(cx, cy, r - x.lineWidth / 2, 0, 7); x.stroke(); }
    x.restore();
  }
  let layer = null, layerKey = "";
  function boardLayer(W, board) {
    const bd = board || cur().board, key = bd.id + ":" + W;
    if (!board && key === layerKey) return layer;
    const c = document.createElement("canvas"); c.width = c.height = W; bd.paint(c.getContext("2d"), W);
    if (!board) { layer = c; layerKey = key; }
    return c;
  }
  // a small picture for the shop and the Profile: a corner of a board with one stone of each colour
  const thumbs = {};
  function thumb(id) {
    if (thumbs[id]) return thumbs[id];
    const it = byId(id); if (!it) return "";
    try {
      const W = 168, c = document.createElement("canvas"); c.width = c.height = W; const x = c.getContext("2d");
      const bd = it.kind === "board" ? it : BOARDS[0], sk = it.kind === "stone" ? it : STONES[0], cell = W / 3, P = i => cell * (i + .5);
      x.drawImage(boardLayer(W * 2, bd), 0, 0, W, W, 0, 0, W, W);
      x.strokeStyle = bd.line; x.lineWidth = 1.6; x.beginPath();
      for (let i = 0; i < 3; i++) { x.moveTo(0, P(i)); x.lineTo(W, P(i)); x.moveTo(P(i), 0); x.lineTo(P(i), W); }
      x.stroke();
      const big = it.kind === "stone";
      if (big) { drawStone(x, P(0) + cell * .28, P(1), cell * .62, 1, null, sk, bd); drawStone(x, P(2) - cell * .28, P(1), cell * .62, 2, null, sk, bd); }
      else { drawStone(x, P(0), P(1), cell * .46, 1, null, sk, bd); drawStone(x, P(1), P(1), cell * .46, 2, null, sk, bd); drawStone(x, P(1), P(0), cell * .46, 1, null, sk, bd); drawStone(x, P(2), P(2), cell * .46, 2, null, sk, bd); }
      return thumbs[id] = c.toDataURL("image/png");
    } catch (e) { return ""; }
  }
  return { STONES, BOARDS, ALL, byId, owned, cur, equip, equipped, drawStone, boardLayer, thumb, onChange: f => listeners.push(f) };
})();
