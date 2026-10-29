// Serves the static game and keeps anonymous play statistics in a SQLite-backed Durable Object.
// POST /api/event  {type: "start"|"move"|"end", game, player, char, size, color, winner, how, moves, state}
// GET  /stats      summary page and games in progress,  GET /api/stats  the same numbers as JSON
// GET  /watch?g=…  live board of one game,  GET /api/game?g=…  its latest position
// GET  /api/cancel  the current cancel number (the game polls it),  POST /api/cancel {key}  cancels every game in progress
// GET  /admin  page with the cancel button; the key is the Worker secret ADMIN_KEY
import { DurableObject } from "cloudflare:workers";
import { WATCH } from "./watch.js";

const CHARS = {
  mek: "เมฆ", win: "ลุงวิน", yuto: "ยูโตะ", joker: "โจ๊กเกอร์",
  chris: "คริส",
  weiqi: "เว่ยฉี", tora: "โทระ", kan: "กัน", todo: "โทโด", hikaru: "ฮิคารุ"
};
const HOWS = new Set(["score", "resign", "timeout"]);
const id = v => typeof v === "string" && /^[a-z0-9]{6,32}$/.test(v) ? v : null;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export class Stats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY, player TEXT, char TEXT, size INTEGER, color INTEGER,
      started INTEGER, ended INTEGER, winner TEXT, how TEXT, moves INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS live (game TEXT PRIMARY KEY, char TEXT, updated INTEGER, ended INTEGER, state TEXT)`);
    // placement-test results (games against Hikaru); rank: 1 kyu = 0, 15 kyu = -14, 1 dan = 1
    this.sql.exec(`CREATE TABLE IF NOT EXISTS exams (game TEXT PRIMARY KEY, player TEXT, ended INTEGER, how TEXT, moves INTEGER,
      graded INTEGER, not_best REAL, rank REAL)`);
    // each cancel bumps this number; open games that see it change stop and apologise
    this.sql.exec("CREATE TABLE IF NOT EXISTS cancels (n INTEGER PRIMARY KEY, at INTEGER)");
    // games that ended before the rank threshold was lowered still get a rank from the share of non-Best moves they stored
    for (const r of this.sql.exec("SELECT game, not_best FROM exams WHERE rank IS NULL AND graded >= 20 AND moves >= 100 AND not_best IS NOT NULL").toArray())
      this.sql.exec("UPDATE exams SET rank = ? WHERE game = ?", Math.round(estimateRank(r.not_best) * 10) / 10, r.game);
  }
  // latest position of a game, kept for spectators; old rows are dropped as new ones arrive
  saveState(e, ended) {
    if (!e.state) return;
    const now = Date.now();
    this.sql.exec(`INSERT INTO live (game, char, updated, ended, state) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(game) DO UPDATE SET updated = excluded.updated, ended = COALESCE(live.ended, excluded.ended), state = excluded.state`,
      e.game, e.char, now, ended ? now : null, JSON.stringify(e.state));
    this.sql.exec("DELETE FROM live WHERE updated < ?", now - 864e5);
  }
  liveGames() {
    return this.sql.exec(`SELECT live.game, live.char, updated, live.ended, state, games.how FROM live LEFT JOIN games ON games.id = live.game
        WHERE updated >= ? ORDER BY updated DESC LIMIT 50`, Date.now() - 20 * 6e4)
      .toArray().map(r => { const st = JSON.parse(r.state); return { game: r.game, char: r.char, updated: r.updated, ended: r.ended, how: r.how, size: st.size, moveNo: st.moveNo, human: st.human }; });
  }
  game(g) {
    const r = this.sql.exec("SELECT game, char, updated, ended, state FROM live WHERE game = ?", g).toArray()[0];
    if (!r) return null;
    const res = this.sql.exec("SELECT winner, how FROM games WHERE id = ?", g).toArray()[0] || {};
    return { game: r.game, char: r.char, updated: r.updated, ended: r.ended, winner: res.winner || null, how: res.how || null, now: Date.now(), ...JSON.parse(r.state) };
  }
  cancelNo() { return this.sql.exec("SELECT COALESCE(MAX(n), 0) AS n FROM cancels").one().n; }
  // ends every unfinished game as cancelled; results sent later for those games are ignored
  cancelAll() {
    const now = Date.now();
    this.sql.exec("INSERT INTO cancels (at) VALUES (?)", now);
    // games started in the last 6 hours; older unfinished ones were closed long ago
    const n = this.sql.exec("UPDATE games SET ended = ?, how = 'cancel' WHERE ended IS NULL AND started >= ?", now, now - 6 * 36e5).rowsWritten;
    this.sql.exec("UPDATE live SET ended = ? WHERE ended IS NULL AND game IN (SELECT id FROM games WHERE how = 'cancel')", now);
    return { n: this.cancelNo(), cancelled: n };
  }
  record(e) {
    const now = Date.now();
    if (e.type === "move") { this.saveState(e, false); return; }
    if (e.type === "start") {
      this.saveState(e, false);
      this.sql.exec("INSERT OR IGNORE INTO games (id, player, char, size, color, started) VALUES (?, ?, ?, ?, ?, ?)",
        e.game, e.player, e.char, e.size, e.color, now);
    } else {
      this.saveState(e, true);
      // only the first result of a game counts
      this.sql.exec("UPDATE games SET ended = ?, winner = ?, how = ?, moves = ? WHERE id = ? AND ended IS NULL",
        now, e.winner, e.how, e.moves, e.game);
      const cancelled = this.sql.exec("SELECT how FROM games WHERE id = ?", e.game).toArray()[0]?.how === "cancel";
      if (e.exam && !cancelled) this.sql.exec("INSERT OR IGNORE INTO exams (game, player, ended, how, moves, graded, not_best, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        e.game, e.player, now, e.how, e.moves, e.exam.graded, e.exam.notBest, e.exam.rank);
    }
  }
  summary() {
    const rows = this.sql.exec(`SELECT char, COUNT(*) AS games, COUNT(DISTINCT player) AS players,
        SUM(ended IS NOT NULL AND how != 'cancel') AS finished, SUM(how = 'cancel') AS cancelled, SUM(winner = 'human') AS human_wins, SUM(winner = 'ai') AS ai_wins,
        SUM(how = 'resign') AS resigns, SUM(how = 'timeout') AS timeouts, AVG(moves) AS avg_moves
      FROM games GROUP BY char`).toArray();
    const total = this.sql.exec("SELECT COUNT(*) AS games, COUNT(DISTINCT player) AS players FROM games").one();
    const since = Date.now() - 14 * 864e5;
    const days = this.sql.exec(`SELECT date(started / 1000, 'unixepoch', '+7 hours') AS day, COUNT(*) AS games, COUNT(DISTINCT player) AS players
      FROM games WHERE started >= ? GROUP BY day ORDER BY day`, since).toArray();
    const exams = this.sql.exec(`SELECT COUNT(*) AS tests, COUNT(DISTINCT player) AS players, SUM(rank IS NOT NULL) AS ranked,
        SUM(rank IS NOT NULL AND how = 'score') AS full FROM exams`).one();
    const examRanks = this.sql.exec("SELECT ROUND(rank) AS r, COUNT(*) AS n FROM exams WHERE rank IS NOT NULL GROUP BY r ORDER BY r DESC").toArray();
    const examRecent = this.sql.exec("SELECT ended, how, moves, graded, not_best, rank FROM exams ORDER BY ended DESC LIMIT 10").toArray();
    return { total, chars: rows, days, live: this.liveGames(), exams, examRanks, examRecent };
  }
}

// only well-formed positions are stored and shown to spectators
function cleanState(s) {
  if (!s || ![9, 13, 19].includes(s.size) || typeof s.board !== "string" || s.board.length !== s.size * s.size || !/^[.bw]+$/.test(s.board)) return null;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : 0;
  const clock = c => Array.isArray(c) && c.length === 3 ? [int(c[0], 0, 3600), int(c[1], 0, 9), int(c[2], 0, 60)] : null;
  return { size: s.size, board: s.board, last: int(s.last, -1, 360), moveNo: int(s.moveNo, 0, 2000), toPlay: s.toPlay === 2 ? 2 : 1, human: s.human === 2 ? 2 : 1,
    caps: Array.isArray(s.caps) ? [int(s.caps[0], 0, 400), int(s.caps[1], 0, 400)] : [0, 0],
    clocks: Array.isArray(s.clocks) && s.clocks.length === 2 ? [clock(s.clocks[0]), clock(s.clocks[1])] : null, winB: int(s.winB, 0, 100) };
}

function clean(b) {
  if (!b || !["start", "move", "end"].includes(b.type)) return null;
  const e = { type: b.type, game: id(b.game), player: id(b.player), char: b.char, state: cleanState(b.state) };
  if (!e.game || !e.player || !(e.char in CHARS)) return null;
  if (b.type === "move") return e.state ? e : null;
  if (b.type === "start") {
    e.size = [9, 13, 19].includes(b.size) ? b.size : 19;
    e.color = b.color === 2 ? 2 : 1;
  } else {
    if (b.winner !== "human" && b.winner !== "ai") return null;
    e.winner = b.winner; e.how = HOWS.has(b.how) ? b.how : "score";
    e.moves = Number.isInteger(b.moves) && b.moves >= 0 && b.moves < 2000 ? b.moves : null;
    const x = b.exam;
    if (e.char === "hikaru" && x && Number.isInteger(x.graded) && x.graded >= 0 && x.graded < 1000) {
      const num = (v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi ? v : null;
      e.exam = { graded: x.graded, notBest: num(x.notBest, 0, 100), rank: null };
      // an older page may leave the rank out; it is the same estimate the game shows
      if (x.graded >= 20 && e.moves >= 100) e.exam.rank = num(x.rank, -30, 10) ?? (e.exam.notBest === null ? null : Math.round(estimateRank(e.exam.notBest) * 10) / 10);
    }
  }
  return e;
}

const pct = (a, b) => b ? Math.round(100 * a / b) + "%" : "–";
// same table as EXAM_CALIB in src/nn_main.js: share of non-Best moves each character plays, and its rank
const EXAM_CALIB = [{ rank: -14, avg: 60 }, { rank: -7, avg: 44 }, { rank: -4, avg: 21 }, { rank: 1, avg: 15 }, { rank: 4, avg: 7.6 }, { rank: 5, avg: 3.7 }];
function estimateRank(avg) {
  if (avg >= EXAM_CALIB[0].avg) return EXAM_CALIB[0].rank;
  for (let i = 1; i < EXAM_CALIB.length; i++) if (avg >= EXAM_CALIB[i].avg) {
    const a = EXAM_CALIB[i - 1], b = EXAM_CALIB[i]; return a.rank + (a.avg - avg) / (a.avg - b.avg) * (b.rank - a.rank);
  }
  return EXAM_CALIB[EXAM_CALIB.length - 1].rank;
}
const rankName = v => v >= 5 ? "5 ดั้งขึ้นไป" : v >= 1 ? Math.round(v) + " ดั้ง" : (1 - Math.round(v)) + " คิว";
const HOW_TH = { score: "นับแต้ม", resign: "ยอมแพ้", timeout: "หมดเวลา", cancel: "ยกเลิก" };
function page(s) {
  const order = Object.keys(CHARS);
  const by = Object.fromEntries(s.chars.map(r => [r.char, r]));
  const rows = order.map(k => {
    const r = by[k] || {};
    const fin = (r.human_wins || 0) + (r.ai_wins || 0);
    return `<tr><th>${CHARS[k]}</th><td>${r.games || 0}</td><td>${r.players || 0}</td><td>${fin}</td>
      <td>${r.human_wins || 0}</td><td>${r.ai_wins || 0}</td><td>${pct(r.human_wins || 0, fin)}</td><td>${r.avg_moves ? Math.round(r.avg_moves) : "–"}</td></tr>`;
  }).join("");
  const max = Math.max(1, ...s.days.map(d => d.games));
  const days = s.days.map(d => `<div class="day"><span>${d.day.slice(5)}</span><i style="width:${Math.round(100 * d.games / max)}%"></i><b>${d.games} เกม · ${d.players} คน</b></div>`).join("") || "<p class=\"muted\">ยังไม่มีข้อมูล</p>";
  const ago = t => { const m = Math.round((s.now - t) / 6e4); return m < 1 ? "เมื่อสักครู่" : m < 60 ? m + " นาทีที่แล้ว" : m < 1440 ? Math.round(m / 60) + " ชั่วโมงที่แล้ว" : Math.round(m / 1440) + " วันที่แล้ว"; };
  const live = s.live.length ? `<div class="live">${s.live.map(g => `<a class="lg" href="/watch?g=${g.game}"><b>${CHARS[g.char]}</b>
    <span>${g.size}×${g.size} · คนถือ${g.human === 1 ? "ดำ" : "ขาว"} · ตาที่ ${g.moveNo}</span><span class="${g.ended ? "done" : "on"}">${g.how === "cancel" ? "ยกเลิก" : g.ended ? "จบแล้ว" : "● กำลังเล่น"} · ${ago(g.updated)}</span></a>`).join("")}</div>`
    : `<p class="muted">ตอนนี้ยังไม่มีใครเล่นอยู่ (หน้านี้รีเฟรชเองทุก 30 วินาที)</p>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>Baduk Battle Stats</title>
<style>
:root { --bg: #15333a; --surface: #20474f; --fg: #f3ead8; --muted: #b3c8c5; --line: rgba(243,234,216,.14); --accent: #e3b06a; color-scheme: dark; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 "IBM Plex Sans Thai", "Leelawadee UI", system-ui, sans-serif; padding: 20px 16px; }
main { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
h1 { margin: 0; font-size: 28px; } h2 { margin: 0 0 8px; font-size: 18px; color: var(--accent); }
.tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.tile b { display: block; font-size: 30px; font-variant-numeric: tabular-nums; } .tile span, .muted { color: var(--muted); font-size: 13px; }
.wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; min-width: 560px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
thead th { color: var(--muted); font-weight: 500; font-size: 13px; } tbody th { text-align: left; } tr:last-child > * { border-bottom: 0; }
.day { display: grid; grid-template-columns: 48px 1fr auto; gap: 10px; align-items: center; font-size: 13px; padding: 3px 0; }
.live { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.lg { display: flex; flex-direction: column; gap: 2px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; color: var(--fg); text-decoration: none; }
.lg:hover { border-color: var(--accent); } .lg span { font-size: 13px; color: var(--muted); } .lg .on { color: #9fd8c0; }
.day i { display: block; height: 10px; border-radius: 5px; background: var(--accent); min-width: 4px; } .day span, .day b { color: var(--muted); font-weight: 400; }
</style></head><body><main>
<h1>สถิติ Baduk Battle</h1>
<div class="tiles"><div class="tile"><b>${s.total.games}</b><span>เกมที่เริ่มเล่นทั้งหมด</span></div><div class="tile"><b>${s.total.players}</b><span>ผู้เล่น (นับตามเครื่อง)</span></div></div>
<section><h2>กำลังเล่นอยู่ตอนนี้</h2>${live}</section>
<section><h2>สอบวัดระดับ (ฮิคารุ)</h2>
<div class="tiles"><div class="tile"><b>${s.exams.tests || 0}</b><span>สอบจบแล้ว (${s.exams.players || 0} คน)</span></div>
<div class="tile"><b>${s.exams.ranked || 0}</b><span>ได้ผลระดับ (เกมยาวอย่างน้อย 100 ตา) · เล่นจนนับแต้ม ${s.exams.full || 0}</span></div></div>
${s.examRanks.length ? `<div class="wrap" style="margin-top:10px"><table style="min-width:0"><thead><tr><th style="text-align:left">ระดับที่ได้</th><th>จำนวน</th></tr></thead><tbody>${s.examRanks.map(r => `<tr><th>${rankName(r.r)}</th><td>${r.n}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">ยังไม่มีใครสอบจบ</p>`}
${s.examRecent.length ? `<div class="wrap" style="margin-top:10px"><table style="min-width:0"><thead><tr><th style="text-align:left">ล่าสุด</th><th>ผล</th><th>ไม่ใช่ Best</th><th>ตาที่ให้คะแนน</th><th>จบด้วย</th></tr></thead><tbody>${s.examRecent.map(r => `<tr><th>${ago(r.ended)}</th><td>${r.rank === null ? "ไม่พอประเมิน" : rankName(r.rank)}</td><td>${r.not_best === null ? "–" : Math.round(r.not_best) + "%"}</td><td>${r.graded}</td><td>${HOW_TH[r.how] || r.how}</td></tr>`).join("")}</tbody></table></div>` : ""}
<p class="muted">แนะนำให้ผู้สอบเล่นจนจบกระดานและนับแต้ม ผลจะใกล้เคียงที่สุด</p></section>
<section><h2>แยกตามตัวละคร</h2><div class="wrap"><table>
<thead><tr><th style="text-align:left">ตัวละคร</th><th>เกม</th><th>ผู้เล่น</th><th>เล่นจบ</th><th>คนชนะ</th><th>AI ชนะ</th><th>คนชนะ %</th><th>ตาเฉลี่ย</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<p class="muted">"เล่นจบ" นับเกมที่มีผลแพ้ชนะ (นับแต้ม ยอมแพ้ หรือหมดเวลา) เกมที่ปิดกลางคันจะนับแค่ในช่อง "เกม"</p></section>
<section><h2>14 วันล่าสุด</h2>${days}</section>
</main></body></html>`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const stub = () => env.STATS.get(env.STATS.idFromName("global"));
    if (url.pathname === "/api/event") {
      if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
      if (req.method !== "POST") return new Response("method", { status: 405, headers: CORS });
      let body = null;
      try { body = JSON.parse(await req.text()); } catch (e) {}
      const e = clean(body);
      if (!e) return new Response("bad event", { status: 400, headers: CORS });
      await stub().record(e);
      return new Response(null, { status: 204, headers: CORS });
    }
    const html = body => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (url.pathname === "/api/stats") return Response.json(await stub().summary(), { headers: CORS });
    if (url.pathname === "/stats" || url.pathname === "/stats/") return html(page({ ...(await stub().summary()), now: Date.now() }));
    if (url.pathname === "/api/game") {
      const g = id(url.searchParams.get("g") || ""), st = g && await stub().game(g);
      return st ? Response.json(st, { headers: { ...CORS, "cache-control": "no-store" } }) : new Response("not found", { status: 404, headers: CORS });
    }
    if (url.pathname === "/watch") return html(WATCH);
    if (url.pathname === "/api/cancel") {
      if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
      if (req.method === "GET") return Response.json({ n: await stub().cancelNo() }, { headers: { ...CORS, "cache-control": "no-store" } });
      if (!env.ADMIN_KEY) return Response.json({ error: "ยังไม่ได้ตั้งรหัส ADMIN_KEY ใน Cloudflare" }, { status: 503 });
      let key = "";
      try { key = String((await req.json()).key || ""); } catch (e) {}
      if (key !== env.ADMIN_KEY) return Response.json({ error: "รหัสไม่ถูกต้อง" }, { status: 403 });
      return Response.json(await stub().cancelAll());
    }
    if (url.pathname === "/admin") return html(ADMIN);
    return env.ASSETS.fetch(req);
  }
};

const ADMIN = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Baduk Battle Admin</title><meta name="robots" content="noindex">
<style>body{font-family:system-ui,sans-serif;background:#0f3b3a;color:#f3ead2;margin:0;padding:24px 16px}main{max-width:420px;margin:auto}
h1{font-size:22px}input,button{font:inherit;width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:0;margin-top:10px}
button{background:#e2902e;color:#2a1a0b;font-weight:700;cursor:pointer}p{line-height:1.5}#out{margin-top:14px;font-weight:600}</style></head>
<body><main><h1>ยกเลิกเกมที่กำลังเล่นอยู่</h1>
<p>ทุกเกมที่ยังไม่จบจะถูกยกเลิก ผู้เล่นจะเห็นข้อความ "ยกเลิก ขออภัยด้วยครับ" บนจอภายในประมาณ 30 วินาที และผลเกมเหล่านั้นจะไม่ถูกนับ</p>
<input id="key" type="password" placeholder="รหัสผู้ดูแล" autocomplete="current-password">
<button id="go">ยกเลิกทุกเกมตอนนี้</button><div id="out"></div></main>
<script>
document.getElementById("go").onclick = async () => {
  const out = document.getElementById("out");
  if (!confirm("ยกเลิกทุกเกมที่กำลังเล่นอยู่?")) return;
  out.textContent = "กำลังยกเลิก…";
  try {
    const r = await fetch("/api/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: document.getElementById("key").value }) });
    const j = await r.json();
    out.textContent = r.ok ? "ยกเลิกแล้ว " + j.cancelled + " เกม" : j.error;
  } catch (e) { out.textContent = "ส่งไม่สำเร็จ: " + e.message; }
};
</script></body></html>`;
