// Serves the static game and keeps anonymous play statistics in a SQLite-backed Durable Object.
// POST /api/event  {type: "start"|"end", game, player, char, size, color, winner, how, moves}
// GET  /stats      summary page,  GET /api/stats  the same numbers as JSON
import { DurableObject } from "cloudflare:workers";

const CHARS = {
  mek: "เมฆ", win: "ลุงวิน", yuto: "ยูโตะ", chris: "คริส",
  weiqi: "เว่ยฉี", tora: "โทระ", kan: "กัน", todo: "โทโด"
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
  }
  record(e) {
    const now = Date.now();
    if (e.type === "start") {
      this.sql.exec("INSERT OR IGNORE INTO games (id, player, char, size, color, started) VALUES (?, ?, ?, ?, ?, ?)",
        e.game, e.player, e.char, e.size, e.color, now);
    } else {
      // only the first result of a game counts
      this.sql.exec("UPDATE games SET ended = ?, winner = ?, how = ?, moves = ? WHERE id = ? AND ended IS NULL",
        now, e.winner, e.how, e.moves, e.game);
    }
  }
  summary() {
    const rows = this.sql.exec(`SELECT char, COUNT(*) AS games, COUNT(DISTINCT player) AS players,
        SUM(ended IS NOT NULL) AS finished, SUM(winner = 'human') AS human_wins, SUM(winner = 'ai') AS ai_wins,
        SUM(how = 'resign') AS resigns, SUM(how = 'timeout') AS timeouts, AVG(moves) AS avg_moves
      FROM games GROUP BY char`).toArray();
    const total = this.sql.exec("SELECT COUNT(*) AS games, COUNT(DISTINCT player) AS players FROM games").one();
    const since = Date.now() - 14 * 864e5;
    const days = this.sql.exec(`SELECT date(started / 1000, 'unixepoch', '+7 hours') AS day, COUNT(*) AS games, COUNT(DISTINCT player) AS players
      FROM games WHERE started >= ? GROUP BY day ORDER BY day`, since).toArray();
    return { total, chars: rows, days };
  }
}

function clean(b) {
  if (!b || (b.type !== "start" && b.type !== "end")) return null;
  const e = { type: b.type, game: id(b.game), player: id(b.player), char: b.char };
  if (!e.game || !e.player || !(e.char in CHARS)) return null;
  if (b.type === "start") {
    e.size = [9, 13, 19].includes(b.size) ? b.size : 19;
    e.color = b.color === 2 ? 2 : 1;
  } else {
    if (b.winner !== "human" && b.winner !== "ai") return null;
    e.winner = b.winner; e.how = HOWS.has(b.how) ? b.how : "score";
    e.moves = Number.isInteger(b.moves) && b.moves >= 0 && b.moves < 2000 ? b.moves : null;
  }
  return e;
}

const pct = (a, b) => b ? Math.round(100 * a / b) + "%" : "–";
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
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
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
.day i { display: block; height: 10px; border-radius: 5px; background: var(--accent); min-width: 4px; } .day span, .day b { color: var(--muted); font-weight: 400; }
</style></head><body><main>
<h1>สถิติ Baduk Battle</h1>
<div class="tiles"><div class="tile"><b>${s.total.games}</b><span>เกมที่เริ่มเล่นทั้งหมด</span></div><div class="tile"><b>${s.total.players}</b><span>ผู้เล่น (นับตามเครื่อง)</span></div></div>
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
    if (url.pathname === "/api/stats") return Response.json(await stub().summary(), { headers: CORS });
    if (url.pathname === "/stats" || url.pathname === "/stats/")
      return new Response(page(await stub().summary()), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    return env.ASSETS.fetch(req);
  }
};
