// Player accounts: a name and a password, and one saved copy of the player's progress (game history, best exam rank,
// tsumego and tutorial progress) so it follows them to another device.
// The same code runs in the Accounts Durable Object (worker/index.js) and, for the private preview page, in the browser
// on top of the artifact's database: `store` only needs get(key) / put(key, value) / del(key) with JSON values.
//   user:  "u:" + lower-case name -> { name, salt, hash, rsalt, rhash, data, ver, created, updated, fails, lockUntil }
//   login: "s:" + sha256(token)   -> { u: lower-case name, at }
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
      return ok({ ver: u.ver });
    },
    async logout(b) {
      if (typeof b.token === "string") await store.del("s:" + await sha(b.token));
      return ok({});
    }
  };
  return async function handle(op, body) {
    const f = Object.prototype.hasOwnProperty.call(ops, op) && ops[op];
    if (!f) return err(404, "not found");
    return await f(body && typeof body === "object" ? body : {});
  };
}
