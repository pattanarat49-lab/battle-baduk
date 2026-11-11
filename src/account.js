// Player accounts (name + password): the Profile page signs in, and the player's progress then follows them to any device.
// Synced: game history (100 most recent), best exam rank, tsumego progress, tutorial step. Not synced: a paused game and
// settings (sound, board size), which belong to the device.
// Requests go to the Worker (/api/acct/*, worker/acct.js); the private preview page swaps in its own backend with
// Account.useBackend(). Progress is sent only when it changed: checked every 20 s and when the tab is hidden.
const Account = (() => {
  const SYNC = ["history", "bestRank", "tsume3", "tutStep"];
  const get = k => { try { const v = localStorage.getItem("gonn." + k); return v === null ? null : JSON.parse(v); } catch (e) { return null; } };
  const put = (k, v) => { try { if (v === null || v === undefined) localStorage.removeItem("gonn." + k); else localStorage.setItem("gonn." + k, JSON.stringify(v)); } catch (e) {} };
  let me = get("acct"); // { token, name, ver, sent: fingerprint of the progress last saved, at: time of the last sync }
  let onChange = () => {}, busy = false, lastErr = "";

  const host = location.hostname;
  const BASE = /github\.io$/.test(host) ? "https://battle-baduk.battlebaduk.workers.dev" : "";
  // the private preview page sets window.ACCT_BACKEND (same server code, kept in the artifact's database)
  let api = window.ACCT_BACKEND || async function (op, body) {
    // text/plain keeps the request simple (no CORS preflight) when the page is on another host
    const r = await fetch(BASE + "/api/acct/" + op, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "text/plain" } });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, body: j || { error: "เซิร์ฟเวอร์ตอบกลับผิดพลาด (" + r.status + ")" } };
  };

  // ---------- progress ----------
  const collect = () => { const d = {}; for (const k of SYNC) { const v = get(k); if (v !== null) d[k] = v; } return d; };
  const fp = d => JSON.stringify(SYNC.map(k => d[k] === undefined ? null : d[k]));
  // two copies of the progress joined so that nothing either device did is lost
  function merge(a, b) {
    a = a || {}; b = b || {};
    const out = {};
    const ha = Array.isArray(a.history) ? a.history : [], hb = Array.isArray(b.history) ? b.history : [];
    if (ha.length || hb.length) {
      const by = new Map();
      for (const h of ha.concat(hb)) {
        if (!h || !h.id) continue;
        const o = by.get(h.id);
        if (!o || (typeof h.rank === "number" && typeof o.rank !== "number")) by.set(h.id, h);
      }
      out.history = [...by.values()].sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, 100);
    }
    const ra = a.bestRank, rb = b.bestRank;
    if (ra || rb) out.bestRank = !ra ? rb : !rb ? ra : (rb.rank > ra.rank ? rb : ra);
    const ta = a.tsume3, tb = b.tsume3;
    if (ta || tb) {
      const m = !ta ? tb : !tb ? ta : ((tb.solved || 0) > (ta.solved || 0) ? tb : ta);
      out.tsume3 = Object.assign({}, m, { best: Math.max((ta && ta.best) || 0, (tb && tb.best) || 0),
        seen: [...new Set([].concat((ta && ta.seen) || [], (tb && tb.seen) || []))].slice(-3000) });
    }
    if (a.tutStep != null || b.tutStep != null) out.tutStep = Math.max(+a.tutStep || 0, +b.tutStep || 0);
    return out;
  }
  function apply(d) { for (const k of SYNC) put(k, d[k] === undefined ? null : d[k]); }

  // ---------- talking to the server ----------
  const remember = () => put("acct", me);
  function signedIn(r) {
    const merged = merge(collect(), r.data);
    apply(merged);
    me = { token: r.token, name: r.name, ver: r.ver, sent: fp(r.data || {}), at: Date.now() };
    remember();
    onChange();
    return push();
  }
  async function push() {
    if (!me || busy) return;
    const d = collect(), f = fp(d);
    if (f === me.sent) return;
    busy = true;
    try {
      for (let i = 0; i < 3; i++) {
        const r = await api("save", { token: me.token, ver: me.ver, data: d });
        if (r.status === 200) { me.ver = r.body.ver; me.sent = f; me.at = Date.now(); lastErr = ""; remember(); break; }
        if (r.status === 409) { // another device saved first: take its copy in and try again
          const m = merge(collect(), r.body.data); apply(m); me.ver = r.body.ver; remember(); onChange();
          Object.assign(d, m); continue;
        }
        if (r.status === 401) { me = null; remember(); lastErr = r.body.error; onChange(); break; }
        lastErr = r.body.error || "บันทึกไม่สำเร็จ"; break;
      }
    } catch (e) { lastErr = "ออฟไลน์อยู่ จะบันทึกให้เมื่อกลับมาออนไลน์"; }
    finally { busy = false; onChange(); }
  }
  // on page load: take in what other devices saved since this one last looked
  async function pull() {
    if (!me) return;
    try {
      const r = await api("load", { token: me.token });
      if (r.status === 401) { me = null; remember(); lastErr = r.body.error; onChange(); return; }
      if (r.status !== 200) return;
      if (r.body.ver !== me.ver) { apply(merge(collect(), r.body.data)); me.ver = r.body.ver; me.sent = fp(r.body.data || {}); remember(); onChange(); }
      me.at = Date.now(); remember();
      await push();
    } catch (e) {}
  }

  // ---------- the sign-in dialog ----------
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let tab = "login";
  function dialog() {
    if ($("acct")) return;
    const d = document.createElement("div");
    d.className = "sure acct"; d.id = "acct"; d.hidden = true;
    d.innerHTML = `<div class="sure-card acct-card" role="dialog" aria-labelledby="acT">
      <button class="acct-x" id="acX" aria-label="ปิด">✕</button>
      <p id="acT"><b>ACCOUNT</b></p>
      <div class="seg acct-tabs" id="acTabs"><button data-t="login">เข้าสู่ระบบ</button><button data-t="signup">สมัครใหม่</button><button data-t="recover">ลืมรหัส</button></div>
      <form id="acForm" autocomplete="on">
        <label>ชื่อผู้ใช้<input id="acName" name="username" autocomplete="username" maxlength="16" autocapitalize="off" spellcheck="false" required></label>
        <label id="acCodeL">รหัสกู้คืน<input id="acCode" autocomplete="off" maxlength="20" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"></label>
        <label><span id="acPassT">รหัสผ่าน</span><input id="acPass" type="password" name="password" maxlength="64" required></label>
        <label id="acPass2L">ใส่รหัสผ่านอีกครั้ง<input id="acPass2" type="password" maxlength="64" autocomplete="new-password"></label>
        <p class="acct-msg" id="acMsg" aria-live="polite"></p>
        <div class="actions"><button type="submit" class="primary" id="acGo">เข้าสู่ระบบ</button></div>
      </form>
      <div id="acDone" hidden>
        <p class="acct-msg ok">สำเร็จแล้ว! เก็บ <strong>รหัสกู้คืน</strong> นี้ไว้ให้ดี (จด หรือแคปหน้าจอ) ถ้าลืมรหัสผ่าน ใช้รหัสนี้ตั้งรหัสใหม่ได้ และจะไม่แสดงอีก</p>
        <div class="acct-code" id="acRec"></div>
        <div class="actions two"><button id="acCopy">คัดลอก</button><button class="primary" id="acOk">จดไว้แล้ว</button></div>
      </div></div>`;
    document.body.appendChild(d);
    d.addEventListener("click", e => { if (e.target === d && $("acDone").hidden) close(); });
    $("acX").onclick = () => close();
    $("acTabs").onclick = e => { const b = e.target.closest("button[data-t]"); if (b) setTab(b.dataset.t); };
    $("acForm").onsubmit = e => { e.preventDefault(); submit(); };
    $("acCopy").onclick = () => { try { navigator.clipboard.writeText($("acRec").textContent); $("acCopy").textContent = "คัดลอกแล้ว"; } catch (e) {} };
    $("acOk").onclick = () => close();
  }
  function setTab(t) {
    tab = t;
    for (const b of $("acTabs").children) b.setAttribute("aria-pressed", String(b.dataset.t === t));
    $("acCodeL").hidden = t !== "recover";
    $("acPass2L").hidden = t === "login";
    $("acPassT").textContent = t === "recover" ? "รหัสผ่านใหม่" : "รหัสผ่าน";
    $("acPass").autocomplete = t === "login" ? "current-password" : "new-password";
    $("acGo").textContent = { login: "เข้าสู่ระบบ", signup: "สมัครและเก็บความคืบหน้า", recover: "ตั้งรหัสผ่านใหม่" }[t];
    $("acMsg").textContent = t === "signup" ? "ชื่อ 3–16 ตัว (ไทย อังกฤษ ตัวเลข _) · รหัสผ่านอย่างน้อย 6 ตัว · ไม่ต้องใช้อีเมล" : "";
    $("acMsg").className = "acct-msg";
  }
  function open(t) {
    dialog();
    $("acForm").hidden = false; $("acDone").hidden = true; $("acTabs").hidden = false;
    $("acPass").value = $("acPass2").value = $("acCode").value = "";
    setTab(t || "login");
    $("acct").hidden = false;
    $("acName").focus();
  }
  function close() { if ($("acct")) $("acct").hidden = true; onChange(); }
  const say = (m, ok) => { $("acMsg").textContent = m; $("acMsg").className = "acct-msg" + (ok ? " ok" : " bad"); };
  async function submit() {
    const name = $("acName").value.trim(), pass = $("acPass").value;
    if (tab !== "login" && pass !== $("acPass2").value) return say("รหัสผ่านสองช่องไม่ตรงกัน");
    if (tab === "recover" && !$("acCode").value.trim()) return say("ใส่รหัสกู้คืนที่ได้ตอนสมัคร");
    $("acGo").disabled = true; say("กำลังเชื่อมต่อ…", true);
    try {
      const body = tab === "signup" ? { name, pass, data: collect() } : tab === "recover" ? { name, pass, code: $("acCode").value } : { name, pass };
      const r = await api(tab, body);
      if (r.status !== 200) { say(r.body.error || "ไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
      await signedIn(r.body);
      if (r.body.recovery) {
        $("acForm").hidden = true; $("acTabs").hidden = true; $("acDone").hidden = false;
        $("acRec").textContent = r.body.recovery; $("acCopy").textContent = "คัดลอก";
      } else close();
    } catch (e) { say("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง"); }
    finally { $("acGo").disabled = false; }
  }
  async function logout() {
    const t = me && me.token;
    await push();
    // the progress is safe in the account, so it leaves this device with the player (the next person starts clean);
    // when the last save did not go through it stays here instead
    if (me && me.sent !== fp(collect())) { lastErr = "ยังบันทึกล่าสุดไม่สำเร็จ ลองออกจากระบบอีกครั้งตอนออนไลน์"; onChange(); return; }
    apply({});
    me = null; remember(); lastErr = ""; onChange();
    if (t) api("logout", { token: t }).catch(() => {});
  }
  const timeTH = t => new Date(t).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  // the card at the top of the Profile page
  function card() {
    if (!me) return `<div class="acct-box"><div class="t"><b>เก็บความคืบหน้าไว้ในแอคเคาท์</b><span>ล็อกอินแล้วประวัติเกม ระดับที่สอบได้ และด่านโจทย์ จะตามไปทุกเครื่อง</span>${lastErr ? `<span class="bad">${esc(lastErr)}</span>` : ""}</div>
      <div class="pf-btns"><button class="pf-an" data-acct="signup">สมัคร</button><button class="pf-an primary" data-acct="login">เข้าสู่ระบบ</button></div></div>`;
    return `<div class="acct-box in"><div class="t"><b>👤 ${esc(me.name)}</b><span>${busy ? "กำลังบันทึก…" : lastErr ? `<span class="bad">${esc(lastErr)}</span>` : `บันทึกขึ้นแอคเคาท์แล้ว · ${timeTH(me.at)}`}</span></div>
      <div class="pf-btns"><button class="pf-an" data-acct="logout">ออกจากระบบ</button></div></div>`;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("button[data-acct]"); if (!b) return;
    const a = b.dataset.acct;
    if (a === "logout") logout(); else open(a);
  });

  function init(cb) {
    onChange = cb || onChange;
    pull();
    setInterval(() => { if (!document.hidden) push(); }, 20e3);
    document.addEventListener("visibilitychange", () => { if (document.hidden) push(); });
  }
  return { init, card, open, push, merge, name: () => me && me.name, useBackend: f => { api = f; } };
})();
