// Player-to-player screens built on accounts (src/account.js): world chat (name + rank from the rating on every message),
// the leaderboard (rating, then wins), and the profile picture picker (characters the player has beaten).
const Social = (() => {
  let D = null; // from nn_main: { CHARS, rankName, hideScreens, showMenu, blip, onAvatar }
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const charOf = id => D.CHARS.find(c => c.id === id);
  const face = a => a && charOf(a) ? `chars/${a}_face.jpg` : "menu/guest.png";
  const rankOf = r => typeof r === "number" ? D.rankName(r) : "ยังไม่มีระดับ";
  const show = id => { D.hideScreens(); $(id).hidden = false; window.scrollTo(0, 0); };

  // ---------- world chat ----------
  let msgs = [], seen = new Set();
  function line(m) {
    const mine = m.n === Account.name();
    const at = new Date(m.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    return `<div class="ch-msg${mine ? " me" : ""}"><img src="${face(m.a)}" alt="" width="160" height="160"><div class="ch-b">
      <div class="ch-who"><b>${esc(m.n)}</b> <span class="ch-rank${typeof m.r === "number" ? "" : " no"}">${esc(rankOf(m.r))}</span><time>${at}</time></div>
      <div class="ch-t">${esc(m.t)}</div></div></div>`;
  }
  function render(stick) {
    const box = $("chList"), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = msgs.length ? msgs.map(line).join("") : `<p class="ch-empty">ยังไม่มีข้อความ ทักทายคนอื่นเป็นคนแรกเลย!</p>`;
    if (stick || atEnd) box.scrollTop = box.scrollHeight;
  }
  function add(m) { if (!m || seen.has(m.id)) return; seen.add(m.id); msgs.push(m); msgs = msgs.slice(-100); }
  function syncForm() {
    const on = !!Account.name();
    $("chForm").hidden = !on; $("chLogin").hidden = on;
  }
  let off = null, offState = null;
  function openChat() {
    show("chat"); syncForm();
    $("chState").textContent = "กำลังเชื่อมต่อ…";
    msgs = []; seen = new Set(); render(true);
    closeChat();
    offState = Hub.onState(s => { $("chState").textContent = s === "on" ? "● ออนไลน์" : "ขาดการเชื่อมต่อ กำลังลองใหม่…"; });
    off = Hub.sub("chat", list => {
      $("chState").textContent = "● ออนไลน์";
      const mine = (list || []).some(m => !seen.has(m.id) && m.n === Account.name());
      (list || []).forEach(add); render(mine);
    });
  }
  function closeChat() { if (off) { off(); off = null; } if (offState) { offState(); offState = null; } }
  async function send() {
    const t = $("chText").value.trim();
    if (!t) return;
    $("chText").value = "";
    const r = await Hub.op("say", { token: Account.token(), t });
    if (r.status !== 200) { $("chText").value = $("chText").value || t; $("chErr").textContent = r.body.error || "ส่งไม่สำเร็จ"; setTimeout(() => { $("chErr").textContent = ""; }, 3000); }
  }

  // ---------- leaderboard ----------
  async function openBoard() {
    show("lb");
    $("lbBody").innerHTML = `<p class="note">กำลังโหลด…</p>`;
    let r;
    try { r = await Account.call("board", {}); } catch (e) { r = null; }
    if (!r || r.status !== 200) { $("lbBody").innerHTML = `<p class="pf-empty">โหลดอันดับไม่ได้ ลองใหม่อีกครั้ง</p>`; return; }
    const { list, total, me } = r.body;
    const row = (x, i) => `<div class="lb-row${me && x.n === me.n ? " me" : ""}${i < 3 ? " top" + (i + 1) : ""}"><span class="lb-pos">${i + 1}</span>
      <img src="${face(x.a)}" alt="" width="160" height="160"><span class="lb-name"><b>${esc(x.n)}</b><small>${typeof x.R === "number" ? `เรตติ้ง ${x.R} · ` : ""}ชนะ ${x.w} จาก ${x.g} เกมล่าสุด</small></span>
      <span class="lb-rank${typeof x.r === "number" ? "" : " no"}">${esc(rankOf(x.r))}</span></div>`;
    let h = me ? `<div class="lb-me">อันดับของคุณ <b>#${me.pos}</b> จาก ${total} คน · ${esc(rankOf(me.r))}</div>`
      : Account.name() ? "" : `<div class="lb-me">ล็อกอินในหน้า PROFILE เพื่อขึ้นกระดานอันดับ <button class="pf-an primary" data-acct="login">เข้าสู่ระบบ</button></div>`;
    h += list.length ? `<div class="lb-list">${list.map(row).join("")}</div>` : `<p class="pf-empty">ยังไม่มีผู้เล่นในกระดาน สมัครแอคเคาท์แล้วเป็นคนแรกเลย</p>`;
    h += `<p class="note" style="margin-top:8px">เรียงตามเรตติ้ง (เริ่มจากผลสอบกับฮิคารุที่ดีที่สุด แล้วบวกลบตามผลแพ้ชนะกับ AI และเล่นออนไลน์) ถ้าเท่ากันดูจำนวนชนะ · คนที่ยังไม่มีระดับอยู่ท้ายตาราง</p>`;
    $("lbBody").innerHTML = h;
  }

  // ---------- profile picture ----------
  function openAvatar() {
    const won = new Set(Account.beaten()), cur = Account.avatarSrc();
    const list = D.CHARS.filter(c => !c.tutorial);
    $("avGrid").innerHTML = `<button class="av-pick${cur === "menu/guest.png" ? " on" : ""}" data-av=""><img src="menu/guest.png" alt="" width="160" height="160"><span>ไม่ใช้รูป</span></button>` +
      list.map(c => { const ok = won.has(c.id);
        return `<button class="av-pick${ok ? "" : " lock"}${cur === `chars/${c.id}_face.jpg` ? " on" : ""}" data-av="${c.id}"${ok ? "" : " disabled"}><img src="chars/${c.id}_face.jpg" alt="" width="160" height="160"><span>${ok ? esc(c.name) : "🔒 " + esc(c.name)}</span></button>`; }).join("");
    $("avNote").textContent = won.size ? `ปลดล็อกแล้ว ${list.filter(c => won.has(c.id)).length} จาก ${list.length} ตัว · ชนะตัวละครไหนก็ใช้รูปตัวนั้นได้` : "ยังไม่ได้ชนะตัวละครไหนเลย ลองไปชนะใน PLAY WITH AI ก่อนนะ";
    $("avDlg").hidden = false;
  }

  function init(deps) {
    D = deps;
    $("chBack").onclick = () => { D.blip(660); closeChat(); D.showMenu(); };
    $("lbBack").onclick = () => { D.blip(660); D.showMenu(); };
    $("chForm").onsubmit = e => { e.preventDefault(); send(); };
    $("avX").onclick = () => { $("avDlg").hidden = true; };
    $("avDlg").addEventListener("click", e => {
      if (e.target === $("avDlg")) { $("avDlg").hidden = true; return; }
      const b = e.target.closest("button[data-av]"); if (!b || b.disabled) return;
      try { if (b.dataset.av) localStorage.setItem("gonn.avatar", JSON.stringify(b.dataset.av)); else localStorage.removeItem("gonn.avatar"); } catch (x) {}
      $("avDlg").hidden = true; D.blip(880); Account.push(); D.onAvatar();
    });
    document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("button[data-soc]"); if (b && b.dataset.soc === "avatar") openAvatar(); });
  }
  return { init, openChat, openBoard, openAvatar, closeChat, refresh: () => { if (!$("chat").hidden) { syncForm(); render(); } } };
})();
