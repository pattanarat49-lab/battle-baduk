// Play Online (rooms between two players) and Watch (every game in progress: online games, games against the AI and
// rank tests). Like acct.js this runs in the Accounts Durable Object and, for the private preview, in the browser.
// Everything is kept in `store` under these keys; whoever is subscribed to a key gets its new value (worker/index.js
// pushes it over the WebSocket, the preview watches the database):
//   "rooms"      { list: { id -> summary } } open rooms and online games in progress
//   "room:<id>"  one room: settings, players, moves [[x, y] | null for a pass], clocks, state, result; "to" = a challenge
//   "inv:<name>" { list: [{ id, from, size, main, byo, per, pick, at }] } challenges waiting for that player
//   "lvidx"      { list: { game id -> summary } } games against the AI being played now (kept in memory on the Worker)
//   "lv:<game>"  the latest position of one of those games (memory too)
// The server keeps the clocks (only time spent on the server's clock counts) and checks every move with the same rules
// code as the game (src/engine.js). After two passes both players' browsers count the score with KataGo and report it.
import GoEngine from "../src/engine.js";

let E = null; // made on first use (the preview page loads the rules code after this file)
const eng = () => E || (E = GoEngine());
const SIZES = [9, 13, 19], MAINS = [0, 60, 300, 600, 1200, 1800, 3600], BYOS = [0, 10, 20, 30, 60], PERS = [1, 3, 5];
const KOMI = 6.5, SCORE_WAIT = 60e3, OPEN_KEEP = 30 * 60e3, LIVE_KEEP = 10 * 60e3, ENDED_KEEP = 10 * 60e3;
const id6 = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint8Array(6)); let s = ""; for (const b of r) s += a[b % a.length]; return s; };

// the position after a list of moves; null when one of them is not legal
function replay(n, moves) {
  const { Board, PASS } = eng(), b = new Board(n);
  for (const m of moves) {
    const p = m ? b.pt(m[0], m[1]) : PASS;
    if (m && (m[0] < 0 || m[1] < 0 || m[0] >= n || m[1] >= n || !b.isLegal(p, b.toPlay))) return null;
    b.play(p);
  }
  return b;
}
const colorToPlay = r => (r.moves.length % 2 === 0 ? "b" : "w");
// a player's time after thinking `el` seconds from main time and byo-yomi periods; null when they ran out
function spend(clk, el, byo) {
  let [main, per] = clk;
  if (el <= main) return [main - el, per];
  let over = el - main;
  if (!byo || per <= 0) return null;
  const used = Math.floor(over / byo); // a period used up completely is lost; the one the move falls in starts again
  per -= used;
  return per > 0 ? [0, per] : null;
}
const deadline = (r, c) => r.turnAt + (r.clk[c][0] + (r.byo ? r.clk[c][1] * r.byo : 0)) * 1000;

export function makeOnline(store, userOf) {
  const err = (status, msg) => ({ status, body: { error: msg } });
  const ok = (body, changed) => ({ status: 200, body, changed: changed || [] });
  const summary = r => ({ id: r.id, st: r.st, size: r.size, main: r.main, byo: r.byo, per: r.per, pick: r.pick, host: r.host, guest: r.guest,
    black: r.black, white: r.white, to: r.to, moves: r.moves.length, at: r.turnAt || r.created });
  async function index(fn) {
    const ix = (await store.get("rooms")) || { list: {} };
    fn(ix.list);
    await store.put("rooms", ix);
  }
  async function saveRoom(r, changed) {
    await store.put("room:" + r.id, r);
    await index(l => { if (r.st === "end" || r.st === "declined") delete l[r.id]; else l[r.id] = summary(r); });
    return ["room:" + r.id, "rooms", ...(changed || [])];
  }
  function finish(r, winner, how, margin) {
    r.st = "end"; r.ended = Date.now();
    r.res = { winner, how, margin: margin == null ? null : Math.round(margin * 10) / 10 };
  }
  // ends a game whose player to move has run out of time, and a count nobody finished; true when it changed
  function check(r, now) {
    if (r.st === "play") {
      const c = colorToPlay(r);
      if (now > deadline(r, c)) { r.clk[c] = [0, 0]; finish(r, c === "b" ? "w" : "b", "timeout"); return true; }
    }
    if (r.st === "score" && now - r.scoreAt > SCORE_WAIT) { settle(r, true); return true; }
    return false;
  }
  // both players' counts agree: that result; they differ, or one never came: a plain area count of the board
  function settle(r, force) {
    const s = r.scores || {}, vals = Object.values(s);
    if (vals.length === 2 && Math.sign(vals[0]) === Math.sign(vals[1]) && vals[0] !== 0) { const m = (vals[0] + vals[1]) / 2; finish(r, m > 0 ? "b" : "w", "score", Math.abs(m)); return; }
    if (vals.length === 1 && force) { const m = vals[0]; if (m) { finish(r, m > 0 ? "b" : "w", "score", Math.abs(m)); return; } }
    if (vals.length < 2 && !force) return;
    const b = replay(r.size, r.moves), m = b ? b.areaScore(r.komi) : 0;
    finish(r, m > 0 ? "b" : "w", "score", Math.abs(m));
  }
  async function room(id) { return typeof id === "string" && /^[A-Z0-9]{6}$/.test(id) ? await store.get("room:" + id) : null; }
  const seat = (r, name) => r.black === name ? "b" : r.white === name ? "w" : null;
  // challenges: a room made for one named player ("to"); that player's "inv:<lower-case name>" lists the open ones,
  // which their page shows as a bar at the top with accept / decline
  const ikey = name => "inv:" + String(name).toLowerCase();
  async function dropInvite(r) {
    if (!r || !r.to) return [];
    const k = ikey(r.to), v = (await store.get(k)) || { list: [] }, list = v.list.filter(x => x.id !== r.id);
    if (list.length === v.list.length) return [];
    await store.put(k, { list });
    return [k];
  }

  const ops = {
    async create(b) {
      const u = await userOf(b.token);
      if (!u) return err(401, "ล็อกอินก่อนถึงจะสร้างห้องได้");
      const size = +b.size, main = +b.main, byo = +b.byo, per = byo ? +b.per : 0, pick = ["b", "w", "r"].includes(b.pick) ? b.pick : "r";
      if (!SIZES.includes(size) || !MAINS.includes(main) || !BYOS.includes(byo) || (byo && !PERS.includes(per))) return err(400, "ตั้งค่าห้องไม่ถูกต้อง");
      if (!main && !byo) return err(400, "ต้องมีเวลาหลักหรือเบียวโยมิอย่างน้อยหนึ่งอย่าง");
      // one open room per player: a new one replaces the old
      const ix = (await store.get("rooms")) || { list: {} }, changed = [];
      let to = null;
      if (b.to != null) {
        const t = typeof b.to === "string" && b.to.length <= 32 ? await store.get("u:" + b.to.toLowerCase()) : null;
        if (!t) return err(404, "ไม่พบผู้เล่นที่จะท้า");
        if (t.name === u.n) return err(400, "ท้าตัวเองไม่ได้นะ");
        to = t.name;
      }
      for (const s of Object.values(ix.list)) if (s.st === "open" && s.host && s.host.n === u.n) {
        changed.push(...await dropInvite(await store.get("room:" + s.id)));
        await store.del("room:" + s.id); delete ix.list[s.id]; changed.push("room:" + s.id);
      }
      await store.put("rooms", ix);
      const r = { id: id6(), v: 1, size, main, byo, per, pick, komi: KOMI, host: u, guest: null, black: null, white: null, st: "open",
        moves: [], clk: { b: [main, per], w: [main, per] }, turnAt: 0, created: Date.now(), res: null, scores: null };
      if (to) {
        r.to = to;
        const k = ikey(to), v = (await store.get(k)) || { list: [] }, now = Date.now();
        const list = v.list.filter(x => now - x.at < OPEN_KEEP && x.from.n !== u.n).slice(-9);
        list.push({ id: r.id, from: u, size, main, byo, per, pick, at: now });
        await store.put(k, { list }); changed.push(k);
      }
      return ok({ room: r }, await saveRoom(r, changed));
    },
    async join(b) {
      const u = await userOf(b.token);
      if (!u) return err(401, "ล็อกอินก่อนถึงจะเข้าห้องได้");
      const r = await room(b.id);
      if (!r) return err(404, "ไม่พบห้องนี้ อาจถูกปิดไปแล้ว");
      if (r.st !== "open") return seat(r, u.n) ? ok({ room: r }) : err(409, "ห้องนี้มีคนเล่นแล้ว กดดูเกมแทนได้");
      if (r.host.n === u.n) return ok({ room: r });
      if (r.to && r.to !== u.n) return err(403, `ห้องนี้เป็นคำท้าส่วนตัวถึง ${r.to}`);
      const hostBlack = r.pick === "b" || (r.pick === "r" && crypto.getRandomValues(new Uint8Array(1))[0] < 128);
      r.guest = u; r.black = hostBlack ? r.host.n : u.n; r.white = hostBlack ? u.n : r.host.n;
      r.st = "play"; r.turnAt = Date.now(); r.v++;
      return ok({ room: r }, await saveRoom(r, await dropInvite(r)));
    },
    // the challenged player says no: the challenger's waiting room shows it, then it is gone
    async decline(b) {
      const u = await userOf(b.token), r = await room(b.id);
      if (!u) return err(401, "ล็อกอินก่อน");
      if (!r || r.st !== "open" || r.to !== u.n) {
        const k = ikey(u.n), v = (await store.get(k)) || { list: [] }, list = v.list.filter(x => x.id !== b.id);
        if (list.length === v.list.length) return ok({});
        await store.put(k, { list }); return ok({}, [k]);
      }
      const changed = await dropInvite(r);
      r.st = "declined"; r.v++; r.ended = Date.now();
      return ok({}, await saveRoom(r, changed));
    },
    // the host closes a room nobody joined yet
    async close(b) {
      const u = await userOf(b.token), r = await room(b.id);
      if (!u || !r || r.st !== "open" || r.host.n !== u.n) return ok({});
      const inv = await dropInvite(r);
      await store.del("room:" + r.id);
      await index(l => { delete l[r.id]; });
      return ok({}, ["room:" + r.id, "rooms", ...inv]);
    },
    async move(b) {
      const u = await userOf(b.token), r = await room(b.id);
      if (!u || !r) return err(404, "ไม่พบเกมนี้");
      const now = Date.now();
      if (check(r, now)) { r.v++; return ok({ room: r }, await saveRoom(r)); }
      if (r.st !== "play") return err(409, "เกมนี้ไม่ได้อยู่ระหว่างเล่น");
      const c = colorToPlay(r);
      if (seat(r, u.n) !== c) return err(409, "ยังไม่ถึงตาคุณ");
      if (b.n !== r.moves.length) return err(409, "ตำแหน่งบนกระดานไม่ตรงกัน กำลังโหลดใหม่");
      const m = b.p === null ? null : Array.isArray(b.p) ? [b.p[0] | 0, b.p[1] | 0] : undefined;
      if (m === undefined) return err(400, "ตาเดินไม่ถูกต้อง");
      const moves = r.moves.concat([m]);
      if (!replay(r.size, moves)) return err(400, "เดินตรงนั้นไม่ได้");
      const left = spend(r.clk[c], (now - r.turnAt) / 1000, r.byo);
      if (!left) { r.clk[c] = [0, 0]; finish(r, c === "b" ? "w" : "b", "timeout"); r.v++; return ok({ room: r }, await saveRoom(r)); }
      r.clk[c] = [Math.round(left[0] * 10) / 10, left[1]];
      r.moves = moves; r.turnAt = now; r.v++;
      const n = moves.length;
      if (n >= 2 && moves[n - 1] === null && moves[n - 2] === null) { r.st = "score"; r.scoreAt = now; r.scores = {}; }
      return ok({ room: r }, await saveRoom(r));
    },
    async resign(b) {
      const u = await userOf(b.token), r = await room(b.id);
      if (!u || !r || (r.st !== "play" && r.st !== "score")) return err(409, "เกมนี้จบไปแล้ว");
      const c = seat(r, u.n); if (!c) return err(403, "คุณไม่ได้เล่นเกมนี้");
      finish(r, c === "b" ? "w" : "b", "resign"); r.v++;
      return ok({ room: r }, await saveRoom(r));
    },
    // the count from one player's browser: m = Black's lead after komi
    async score(b) {
      const u = await userOf(b.token), r = await room(b.id);
      if (!u || !r || r.st !== "score") return err(409, "ไม่ได้อยู่ในช่วงนับแต้ม");
      const c = seat(r, u.n); if (!c) return err(403, "คุณไม่ได้เล่นเกมนี้");
      const m = Number(b.m); if (!isFinite(m) || Math.abs(m) > 400) return err(400, "ผลนับแต้มไม่ถูกต้อง");
      r.scores[c] = m; settle(r, false); r.v++;
      return ok({ room: r }, await saveRoom(r));
    },
    // anyone may ask: ends a game whose clock ran out (the server's own time decides)
    async tick(b) {
      const r = await room(b.id);
      if (!r) return err(404, "ไม่พบเกมนี้");
      if (!check(r, Date.now())) return ok({ room: r });
      r.v++;
      return ok({ room: r }, await saveRoom(r));
    },
    async get(b) {
      const r = await room(b.id);
      return r ? ok({ room: r }) : err(404, "ไม่พบเกมนี้");
    },
    // the lobby: open rooms and games in progress (stale ones cleaned up), plus games against the AI being played now
    async lobby() {
      const ix = (await store.get("rooms")) || { list: {} }, now = Date.now(), changed = [];
      for (const s of Object.values(ix.list)) {
        if (s.st === "open" && now - s.at > OPEN_KEEP) { changed.push(...await dropInvite(await store.get("room:" + s.id))); await store.del("room:" + s.id); delete ix.list[s.id]; changed.push("room:" + s.id); continue; }
        if (s.st === "play" || s.st === "score") {
          const r = await store.get("room:" + s.id);
          if (!r) { delete ix.list[s.id]; continue; }
          if (check(r, now)) { r.v++; await store.put("room:" + r.id, r); delete ix.list[s.id]; changed.push("room:" + r.id); }
        }
      }
      if (changed.length) { await store.put("rooms", ix); changed.push("rooms"); }
      const lv = (await store.get("lvidx")) || { list: {} };
      const live = Object.values(lv.list).filter(g => now - g.at < LIVE_KEEP);
      return ok({ rooms: Object.values(ix.list), live }, changed);
    },
    // a game against the AI (or a rank test) sends its position after every move; spectators watch "lv:<game>"
    async live(b) {
      const g = b.g;
      if (typeof g !== "string" || !/^[a-z0-9]{6,32}$/.test(g) || !b.s || typeof b.s !== "object") return err(400, "bad");
      const s = b.s, u = b.token ? await userOf(b.token) : null;
      const st = { g, char: String(s.char || "").slice(0, 16), exam: !!s.exam, size: +s.size, human: s.human === 2 ? 2 : 1,
        moves: Array.isArray(s.moves) ? s.moves.slice(0, 1000) : [], clocks: s.clocks || null, komi: typeof s.komi === "number" && Math.abs(s.komi) <= 400 ? s.komi : undefined, ended: s.ended || null,
        who: u || { n: "ผู้เล่นทั่วไป", r: null, a: null }, at: Date.now() };
      if (!SIZES.includes(st.size)) return err(400, "bad");
      await store.put("lv:" + g, st);
      const lv = (await store.get("lvidx")) || { list: {} }, old = lv.list[g];
      const sum = { g, char: st.char, exam: st.exam, size: st.size, human: st.human, who: st.who, moves: st.moves.length, ended: st.ended, at: st.at };
      lv.list[g] = sum;
      for (const [k, v] of Object.entries(lv.list)) if (st.at - v.at > LIVE_KEEP || (v.ended && st.at - v.at > 60e3)) delete lv.list[k];
      const keys = Object.keys(lv.list); if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete lv.list[k];
      await store.put("lvidx", lv);
      // the lobby list only needs a new value when a game appears or ends
      return ok({}, !old || !!old.ended !== !!st.ended ? ["lv:" + g, "lvidx"] : ["lv:" + g]);
    }
  };
  return async function handle(op, body) {
    const f = Object.prototype.hasOwnProperty.call(ops, op) && ops[op];
    if (!f) return null;
    return await f(body && typeof body === "object" ? body : {});
  };
}
export { spend, replay };
