// Spectator page for one game: polls /api/game every 2 seconds and redraws the board.
export const WATCH = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Baduk Battle Live</title>
<style>
:root { --bg: #15333a; --surface: #20474f; --fg: #f3ead8; --muted: #b3c8c5; --line: rgba(243,234,216,.14); --accent: #e3b06a; --warn: #ff9e80; color-scheme: dark; }
html, body { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 "IBM Plex Sans Thai", "Leelawadee UI", system-ui, sans-serif; }
.app { position: fixed; inset: 0; display: grid; gap: 10px; padding: 10px; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-areas: "bar" "board" "info"; }
@media (min-aspect-ratio: 9/8) { .app { grid-template-columns: minmax(0, 1fr) clamp(260px, 30vw, 360px); grid-template-rows: auto minmax(0, 1fr); grid-template-areas: "board bar" "board info"; } }
.bar { grid-area: bar; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.p { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.p.turn { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.p .n { font-weight: 600; display: flex; gap: 6px; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st { width: 14px; height: 14px; border-radius: 50%; flex: none; } .st.b { background: radial-gradient(circle at 35% 30%, #6a6a6a, #111 60%); } .st.w { background: radial-gradient(circle at 35% 30%, #fff, #d4d4cc 75%); }
.p .c { font: 600 22px/1.2 ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; } .p .s { font-size: 12px; color: var(--muted); }
.cell { grid-area: board; min-height: 0; container-type: size; display: grid; place-items: center; }
canvas { width: calc(min(100cqw, 100cqh) - 12px); height: calc(min(100cqw, 100cqh) - 12px); border-radius: 8px; box-shadow: 0 0 0 6px #5a331a; }
.info { grid-area: info; display: flex; flex-direction: column; gap: 8px; }
.info .live { color: #9fd8c0; font-weight: 600; } .info .done { color: var(--accent); font-weight: 600; }
.muted { color: var(--muted); font-size: 13px; } a { color: var(--accent); }
.wr { height: 10px; border-radius: 5px; overflow: hidden; background: #ecebe4; } .wr i { display: block; height: 100%; background: #111; }
</style></head><body>
<main class="app">
  <div class="bar"><div class="p" id="pB"></div><div class="p" id="pW"></div></div>
  <div class="cell"><canvas id="cv" width="800" height="800" aria-label="กระดาน"></canvas></div>
  <div class="info"><div id="status">กำลังโหลด…</div><div class="wr"><i id="wr" style="width:50%"></i></div><div class="muted" id="wrl"></div>
    <a href="/stats">← กลับไปหน้าสถิติ</a></div>
</main>
<script>
const NAMES = { mek: "เมฆ", win: "ลุงวิน", yuto: "ยูโตะ", chris: "คริส", weiqi: "เว่ยฉี", tora: "โทระ", kan: "กัน", todo: "โทโด" };
const HOW = { score: "นับแต้ม", resign: "ยอมแพ้", timeout: "หมดเวลา", cancel: "ยกเลิก" };
const g = new URLSearchParams(location.search).get("g");
const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
let st = null, offset = 0, gotAt = 0;
const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
function clockText(c, running) {
  if (!c) return ["–", ""];
  let [main, per, byo] = c, t = running ? (Date.now() - gotAt) / 1000 + (st.now - st.updated) / 1000 : 0;
  if (main > 0) { const u = Math.min(main, t); main -= u; t -= u; }
  if (t > 0) byo = Math.max(0, byo - t);
  return main > 0 ? [fmt(main), "+ เบียวโยมิ " + per + " ครั้ง"] : [fmt(byo), "เบียวโยมิ เหลือ " + per + " ครั้ง"];
}
function renderPanels() {
  if (!st) return;
  const live = !st.ended;
  for (const [col, id] of [[1, "pB"], [2, "pW"]]) {
    const name = col === st.human ? "ผู้เล่น" : NAMES[st.char];
    const [c, s] = clockText(st.clocks && st.clocks[col - 1], live && st.toPlay === col);
    const el = document.getElementById(id);
    el.className = "p" + (live && st.toPlay === col ? " turn" : "");
    el.innerHTML = '<div class="n"><span class="st ' + (col === 1 ? "b" : "w") + '"></span>' + name + '</div><div class="c">' + c + '</div><div class="s">' + s + ' · หมากเชลย ' + st.caps[col - 1] + '</div>';
  }
}
function draw() {
  if (!st) return;
  const dpr = Math.min(devicePixelRatio || 1, 2.5), W = cv.getBoundingClientRect().width || 600;
  cv.width = cv.height = Math.round(W * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = st.size, cell = W / (n + 1), P = i => cell * (i + 1);
  const lg = ctx.createLinearGradient(0, 0, W, W); lg.addColorStop(0, "#e6c07a"); lg.addColorStop(1, "#cf9f52");
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = "rgba(42,29,12,.85)"; ctx.lineWidth = Math.max(.8, cell / 34); ctx.beginPath();
  for (let i = 0; i < n; i++) { ctx.moveTo(P(0), P(i)); ctx.lineTo(P(n - 1), P(i)); ctx.moveTo(P(i), P(0)); ctx.lineTo(P(i), P(n - 1)); }
  ctx.stroke();
  const stars = n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : [2, 4, 6]; ctx.fillStyle = "#2a1d0c";
  for (const a of stars) for (const b of stars) { if (n === 9 && (a === 4) !== (b === 4)) continue; ctx.beginPath(); ctx.arc(P(a), P(b), Math.max(2, cell * .11), 0, 7); ctx.fill(); }
  const r = cell * .475;
  for (let i = 0; i < n * n; i++) {
    const c = st.board[i]; if (c === ".") continue;
    const x = P(i % n), y = P((i / n) | 0), gr = ctx.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
    if (c === "b") { gr.addColorStop(0, "#6b6b6b"); gr.addColorStop(.45, "#202020"); gr.addColorStop(1, "#050505"); }
    else { gr.addColorStop(0, "#fff"); gr.addColorStop(.6, "#ecebe5"); gr.addColorStop(1, "#bdbcb3"); }
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  if (st.last >= 0) { const c = st.board[st.last]; ctx.strokeStyle = c === "b" ? "#f5f2e8" : "#222"; ctx.lineWidth = Math.max(1.4, cell / 14);
    ctx.beginPath(); ctx.arc(P(st.last % n), P((st.last / n) | 0), r * .45, 0, 7); ctx.stroke(); }
}
function renderInfo() {
  const s = document.getElementById("status");
  if (!st) return;
  if (st.ended) {
    const who = st.how === "cancel" ? "ยกเลิก ขออภัยด้วยครับ" : st.winner === "human" ? "ผู้เล่นชนะ" : st.winner === "ai" ? NAMES[st.char] + " ชนะ" : "จบเกม";
    s.innerHTML = '<span class="done">' + who + (st.how && st.how !== "cancel" ? " (" + HOW[st.how] + ")" : "") + '</span> · ' + st.moveNo + ' ตา';
  } else s.innerHTML = '<span class="live">● กำลังเล่น</span> · ตาที่ ' + (st.moveNo + 1) + ' · ตา' + (st.toPlay === st.human ? "ผู้เล่น" : NAMES[st.char]);
  document.getElementById("wr").style.width = st.winB + "%";
  document.getElementById("wrl").textContent = "โอกาสชนะ ดำ " + st.winB + "% · ขาว " + (100 - st.winB) + "% (ตามที่ AI ประเมิน)";
}
async function poll() {
  try {
    const r = await fetch("/api/game?g=" + encodeURIComponent(g || ""), { cache: "no-store" });
    if (r.status === 404) { document.getElementById("status").textContent = "ไม่พบเกมนี้ หรือเกมจบไปนานแล้ว"; return; }
    const next = await r.json(); gotAt = Date.now();
    const changed = !st || next.board !== st.board || next.size !== st.size;
    st = next; if (changed) draw(); renderInfo(); renderPanels();
    if (st.ended) return;
  } catch (e) {}
  setTimeout(poll, 2000);
}
setInterval(renderPanels, 500);
addEventListener("resize", draw);
poll();
</script></body></html>`;
