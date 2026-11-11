// Player accounts: a name and a password, and one saved copy of the player's progress (game history, best exam rank,
// tsumego and tutorial progress) so it follows them to another device.
// The same code runs in the Accounts Durable Object (worker/index.js) and, for the private preview page, in the browser
// on top of the artifact's database: `store` only needs get(key) / put(key, value) / del(key) with JSON values.
//   user:  "u:" + lower-case name -> { name, salt, hash, rsalt, rhash, data, ver, created, updated, fails, lockUntil }
//   login: "s:" + sha256(token)   -> { u: lower-case name, at }
//   "lb":   leaderboard, { e: { lower-case name -> { n: name, r: rank from the rating (or best exam rank), R: rating, a: avatar, g: games, w: wins } } }
//   "chat": world chat, { m: [last 50 messages { id, n, r, a, t, at }] }
// Passwords and recovery codes are kept only as PBKDF2-SHA256 hashes with a random salt each.
const ITER = 100000;                 // PBKDF2 rounds (the most WebCrypto allows on Workers)
const MAX_FAILS = 5, LOCK_MS = 5 * 60e3; // five wrong passwords in a row lock the name for five minutes
const MAX_DATA = 1500000;            // bytes of saved progress per account
const NAME_RE = /^[A-Za-z0-9_฀-๿]{3,16}$/;
const RC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // recovery code letters (no 0/O, 1/I)

const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
const rand = n => crypto.getRandomValues(new Uint8Array(n));
async function pbkdf2(secret, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, key, 256));
}
const sha = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
function same(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const newToken = () => btoa(String.fromCharCode(...rand(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function newRecovery() { const r = rand(12); let s = ""; for (let i = 0; i < 12; i++) { if (i && i % 4 === 0) s += "-"; s += RC[r[i] % RC.length]; } return s; }
const CHAT_KEEP = 50, CHAT_LEN = 200, CHAT_GAP = 1500; // messages kept, characters per message, ms between one player's messages
// what other players see of an account, worked out from its saved progress: rating (or best exam rank), games and wins among the
// last 100, and the profile picture, which must be a character the player has beaten
function summary(data) {
  let d = null; try { d = data ? JSON.parse(data) : null; } catch (e) {}
  d = d || {};
  const hist = Array.isArray(d.history) ? d.history : [];
  let r = d.bestRank && typeof d.bestRank.rank === "number" ? d.bestRank.rank : null;
  for (const h of hist) if (h && typeof h.rank === "number" && (r === null || h.rank > r)) r = h.rank;
  const beaten = new Set(Array.isArray(d.beaten) ? d.beaten : []);
  for (const h of hist) if (h && h.won && typeof h.char === "string") beaten.add(h.char);
  const a = typeof d.avatar === "string" && /^[a-z]{2,12}$/.test(d.avatar) && beaten.has(d.avatar) ? d.avatar : null;
  // the rating (src/rating.js, moved by every game and rank test) is the rank shown everywhere; the best exam rank
  // stands in for accounts that have no rating yet
  const R = d.rating && typeof d.rating.R === "number" && isFinite(d.rating.R) ? Math.max(100, Math.min(2900, Math.round(d.rating.R))) : null;
  if (R !== null) r = (R - 2000) / 100;
  return { r: r === null ? null : Math.round(r * 10) / 10, R, a, g: hist.length, w: hist.filter(h => h && h.won).length };
}
const cleanText = t => String(t || "").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAT_LEN);
const cleanCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-");

export function makeAccounts(store) {
  const err = (status, msg) => ({ status, body: { error: msg } });
  const ok = body => ({ status: 200, body });
  const ukey = name => "u:" + String(name || "").toLowerCase();
  async function session(u) {
    const token = newToken();
    await store.put("s:" + await sha(token), { u: ukey(u.name).slice(2), at: Date.now() });
    return token;
  }
  async function byToken(token) {
    if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
    const s = await store.get("s:" + await sha(token));
    if (!s) return null;
    return await store.get("u:" + s.u);
  }
  // the leaderboard row of one account, rewritten only when something on it changed
  async function board(u) {
    const sum = summary(u.data), lb = (await store.get("lb")) || { e: {} }, k = ukey(u.name).slice(2);
    const row = { n: u.name, r: sum.r, R: sum.R, a: sum.a, g: sum.g, w: sum.w };
    if (JSON.stringify(lb.e[k]) === JSON.stringify(row)) return;
    lb.e[k] = row;
    await store.put("lb", lb);
  }
  const pts = x => x.R ?? (typeof x.r === "number" ? 2000 + 100 * x.r : -1);
  const order = (x, y) => pts(y) - pts(x) || y.w - x.w || (x.n < y.n ? -1 : 1);
  const lastSaid = new Map(); // name -> time of the last chat message (memory only)
  const dataOf = v => { if (v == null) return null; const s = JSON.stringify(v); return s.length > MAX_DATA ? undefined : s; };
  const out = (u, token, extra) => Object.assign({ token, name: u.name, data: u.data ? JSON.parse(u.data) : null, ver: u.ver }, extra);
  const ops = {
    async signup(b) {
      const name = String(b.name || "").trim(), pass = String(b.pass || "");
      if (!NAME_RE.test(name)) return err(400, "ชื่อผู้ใช้ต้องยาว 3–16 ตัว ใช้ได้แค่ตัวอักษรไทย อังกฤษ ตัวเลข และ _");
      if (pass.length < 6 || pass.length > 64) return err(400, "รหัสผ่านต้องยาว 6–64 ตัว");
      if (await store.get(ukey(name))) return err(409, "ชื่อนี้มีคนใช้แล้ว ลองชื่ออื่นนะ");
      const data = dataOf(b.data); if (data === undefined) return err(413, "ข้อมูลใหญ่เกินไป");
      const recovery = newRecovery(), salt = hex(rand(16)), rsalt = hex(rand(16));
      const u = { name, salt, hash: await pbkdf2(pass, salt), rsalt, rhash: await pbkdf2(recovery.replace(/-/g, ""), rsalt),
        data, ver: 1, created: Date.now(), updated: Date.now(), fails: 0, lockUntil: 0 };
      await store.put(ukey(name), u);
      await board(u);
      return ok(out(u, await session(u), { recovery }));
    },
    async login(b) {
      const u = await store.get(ukey(b.name));
      if (!u) return err(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      const now = Date.now();
      if (u.lockUntil > now) return err(429, `ใส่รหัสผิดหลายครั้ง รออีก ${Math.ceil((u.lockUntil - now) / 60e3)} นาทีแล้วลองใหม่`);
      if (!same(await pbkdf2(String(b.pass || ""), u.salt), u.hash)) {
        u.fails = (u.fails || 0) + 1;
        if (u.fails >= MAX_FAILS) { u.fails = 0; u.lockUntil = now + LOCK_MS; }
        await store.put(ukey(u.name), u);
        return err(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      }
      if (u.fails) { u.fails = 0; await store.put(ukey(u.name), u); }
      await board(u); // accounts made before the leaderboard existed join it at their next login
      return ok(out(u, await session(u)));
    },
    // forgotten password: the recovery code from sign-up sets a new password, and a new recovery code replaces the used one
    async recover(b) {
      const u = await store.get(ukey(b.name)), pass = String(b.pass || "");
      if (!u) return err(401, "ชื่อผู้ใช้หรือรหัสกู้คืนไม่ถูกต้อง");
      const now = Date.now();
      if (u.lockUntil > now) return err(429, `ลองผิดหลายครั้ง รออีก ${Math.ceil((u.lockUntil - now) / 60e3)} นาทีแล้วลองใหม่`);
      if (pass.length < 6 || pass.length > 64) return err(400, "รหัสผ่านใหม่ต้องยาว 6–64 ตัว");
      if (!same(await pbkdf2(cleanCode(b.code).replace(/-/g, ""), u.rsalt), u.rhash)) {
        u.fails = (u.fails || 0) + 1;
        if (u.fails >= MAX_FAILS) { u.fails = 0; u.lockUntil = now + LOCK_MS; }
        await store.put(ukey(u.name), u);
        return err(401, "ชื่อผู้ใช้หรือรหัสกู้คืนไม่ถูกต้อง");
      }
      const recovery = newRecovery();
      u.salt = hex(rand(16)); u.hash = await pbkdf2(pass, u.salt);
      u.rsalt = hex(rand(16)); u.rhash = await pbkdf2(recovery.replace(/-/g, ""), u.rsalt);
      u.fails = 0; u.lockUntil = 0;
      await store.put(ukey(u.name), u);
      return ok(out(u, await session(u), { recovery }));
    },
    async load(b) {
      const u = await byToken(b.token);
      if (u) await board(u);
      return u ? ok(out(u, undefined)) : err(401, "หมดเวลาเข้าสู่ระบบ กรุณาล็อกอินใหม่");
    },
    // ver is the version the client last saw; when another device saved in between, the client gets that copy back,
    // merges it with its own and saves again
    async save(b) {
      const u = await byToken(b.token);
      if (!u) return err(401, "หมดเวลาเข้าสู่ระบบ กรุณาล็อกอินใหม่");
      if (b.ver !== u.ver) return { status: 409, body: out(u, undefined, { error: "conflict" }) };
      const data = dataOf(b.data); if (data === undefined) return err(413, "ข้อมูลใหญ่เกินไป");
      u.data = data; u.ver++; u.updated = Date.now();
      await store.put(ukey(u.name), u);
      await board(u);
      return ok({ ver: u.ver });
    },
    // top 100 players: highest rating first (players with no rating and no exam last), then wins; plus the asking player's place
    async board(b) {
      const lb = (await store.get("lb")) || { e: {} };
      const all = Object.values(lb.e).sort(order);
      const u = b.token ? await byToken(b.token) : null;
      const at = u ? all.findIndex(x => x.n === u.name) : -1;
      return ok({ list: all.slice(0, 100), total: all.length, me: at < 0 ? null : Object.assign({ pos: at + 1 }, all[at]) });
    },
    async chat() {
      const c = (await store.get("chat")) || { m: [] };
      return ok({ m: c.m });
    },
    async say(b) {
      const u = await byToken(b.token);
      if (!u) return err(401, "หมดเวลาเข้าสู่ระบบ กรุณาล็อกอินใหม่");
      const t = cleanText(b.t);
      if (!t) return err(400, "พิมพ์ข้อความก่อนนะ");
      const now = Date.now(), k = ukey(u.name);
      if (now - (lastSaid.get(k) || 0) < CHAT_GAP) return err(429, "ส่งเร็วเกินไป รอสักครู่");
      lastSaid.set(k, now);
      if (lastSaid.size > 5000) lastSaid.clear();
      const sum = summary(u.data);
      const msg = { id: hex(rand(6)), n: u.name, r: sum.r, a: sum.a, t, at: now };
      const c = (await store.get("chat")) || { m: [] };
      c.m.push(msg); c.m = c.m.slice(-CHAT_KEEP);
      await store.put("chat", c);
      return ok({ msg });
    },
    async logout(b) {
      if (typeof b.token === "string") await store.del("s:" + await sha(b.token));
      return ok({});
    }
  };
  async function handle(op, body) {
    const f = Object.prototype.hasOwnProperty.call(ops, op) && ops[op];
    if (!f) return err(404, "not found");
    const r = await f(body && typeof body === "object" ? body : {});
    if (op === "say" && r.status === 200) r.changed = ["chat"];
    return r;
  }
  // who a login token belongs to, as other players see them (name, rank, rating, picture); null when not signed in
  handle.userOf = async token => { const u = await byToken(token); if (!u) return null; const s = summary(u.data); return { n: u.name, r: s.r, R: s.R, a: s.a }; };
  return handle;
}
