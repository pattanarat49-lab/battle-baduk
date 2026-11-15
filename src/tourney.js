// TOURNAMENT: the weekly knockout every Sunday 18:00 (Thai time) between players with an account. Join beforehand;
// at 18:00 the server draws a random bracket and starts every game (worker/tourney.js). This screen shows the bracket,
// who is out, and a button to watch each game still being played. Also here: the bar that calls a player to their
// match from any screen, and the title picker of the Profile page (the champion's title is worn after the name).
const Tourney = (() => {
  let D = null; // from nn_main: { CHARS, rankName, hideScreens, showMenu, blip, askSure, enterRoom, currentRoom, openPlayer }
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const face = a => a && D.CHARS.some(c => c.id === a || (c.pair && c.pair.some(p => p.id === a))) ? `chars/${a}_face.jpg` : "menu/guest.png";
  const rankOf = r => typeof r === "number" ? D.rankName(r) : "ยังไม่มีระดับ";
  const PRIZE = [["🥇", "อันดับ 1", "+100 เรตติ้ง + ฉายา Champion of Tournament"], ["🥈", "อันดับ 2", "+50 เรตติ้ง"], ["🥉", "อันดับ 3", "+25 เรตติ้ง"]];
  const HOW = { resign: "ยอมแพ้", timeout: "หมดเวลา", score: "นับแต้ม", noshow: "ไม่มาแข่ง", bye: "บาย" };
  const when = t => new Date(t).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " น.";
  let T = null, open = false, timer = 0, offOpen = null, offBar = null, barName = null;

  // ---------- the screen ----------
  function openScreen() {
    D.hideScreens(); $("tour").hidden = false; window.scrollTo(0, 0); open = true;
    if (!T) $("tourBody").innerHTML = `<p class="note">กำลังโหลด…</p>`; else render();
    Hub.op("tour", {}).then(r => { if (r.status === 200) { T = r.body; render(); } else if (!T) $("tourBody").innerHTML = `<p class="pf-empty">โหลดทัวร์นาเมนต์ไม่ได้ ลองใหม่อีกครั้ง</p>`; });
    if (!offOpen) offOpen = Hub.sub("tour", v => { if (v) { T = Object.assign({}, T, v); render(); bar(); } });
    clearInterval(timer); timer = setInterval(countdown, 1000);
  }
  function close() { open = false; clearInterval(timer); if (offOpen) { offOpen(); offOpen = null; } }
  let poked = 0;
  function countdown() {
    const el = $("tourCd"); if (!el || !T || T.cur.st !== "signup") return;
    const s = Math.max(0, Math.floor((T.cur.at - Hub.now()) / 1000));
    el.textContent = s >= 86400 ? `อีก ${Math.floor(s / 86400)} วัน ${Math.floor(s % 86400 / 3600)} ชม.` : `อีก ${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    // 18:00: ask the server, which then makes the draw (if its own alarm has not done it already)
    if (s === 0 && Date.now() - poked > 5000) { poked = Date.now(); Hub.op("tour", {}).then(r => { if (r.status === 200) { T = r.body; render(); } }); }
  }
  const me = () => Account.name();
  const pTag = (p, cls) => p ? `<span class="tr-p${cls ? " " + cls : ""}" data-player="${esc(p.n)}"><img src="${face(p.a)}" alt="" width="160" height="160"><span class="tr-n"><b>${esc(p.n)}</b>${titleTag(p.t)}<small>${esc(rankOf(p.r))}</small></span></span>`
    : `<span class="tr-p tr-tbd"><span class="tr-n"><b>รอผู้ชนะ…</b></span></span>`;
  function matchBox(m) {
    const mine = !!me() && ((m.a && m.a.n === me()) || (m.b && m.b.n === me()));
    if (m.how === "bye") return `<div class="tr-m bye">${pTag(m.a || m.b, "win")}<div class="tr-st">ผ่านเข้ารอบ (บาย)</div></div>`;
    if (m.how === "none") return "";
    const side = s => { const p = m[s]; if (!p) return pTag(null); return pTag(p, m.w ? (m.w === s ? "win" : "out") : ""); };
    let st = "";
    if (m.w) st = `<div class="tr-st">${esc(m[m.w].n)} ชนะ · ${HOW[m.how] || ""}${m.how === "score" && m.margin != null ? ` ${m.margin} แต้ม` : ""}${m.room ? ` <button class="tr-btn" data-tour-room="${m.room}">ดูเกม</button>` : ""}</div>`;
    else if (m.room) st = `<div class="tr-st"><span class="tr-live">● LIVE</span> ${mine ? `<button class="tr-btn primary" data-tour-room="${m.room}">เข้าเล่น</button>` : `<button class="tr-btn" data-tour-room="${m.room}">ดูเกม</button>`}</div>`;
    else st = `<div class="tr-st">รอคู่แข่งจากรอบก่อน</div>`;
    return `<div class="tr-m${mine ? " me" : ""}${m.room && !m.w ? " live" : ""}">${side("a")}<i class="tr-vs">vs</i>${side("b")}${st}</div>`;
  }
  const roundName = (n, k, R) => k === R - 1 ? "ชิงชนะเลิศ" : n === 2 ? "รองชนะเลิศ" : n === 4 ? "รอบ 8 คน" : n === 8 ? "รอบ 16 คน" : n === 16 ? "รอบ 32 คน" : "รอบ 64 คน";
  function bracket(t) {
    const R = t.rounds.length;
    let h = `<div class="tr-br" role="region" aria-label="ตารางการแข่งขัน" tabindex="0">` + t.rounds.map((rd, k) => `<div class="tr-col"><div class="tr-rh">${roundName(rd.length, k, R)}</div><div class="tr-ms">${rd.map(matchBox).join("")}</div></div>`).join("") + `</div>`;
    if (t.third && t.third.how !== "none") h += `<div class="tr-third"><div class="tr-rh">ชิงอันดับ 3</div>${matchBox(t.third)}</div>`;
    return h;
  }
  function podium(t) {
    if (!t.res) return "";
    const pl = [t.res.first, t.res.second, t.res.third], who = n => [].concat(t.ents || [], t.rounds.flat().flatMap(m => [m.a, m.b])).find(p => p && p.n === n);
    return `<div class="tr-pod">${pl.map((n, i) => n ? `<div class="tr-pl p${i + 1}"><span class="tr-medal">${PRIZE[i][0]}</span><img src="${face((who(n) || {}).a)}" alt="" width="160" height="160"><b data-player="${esc(n)}">${esc(n)}</b><small>${PRIZE[i][2]}</small></div>` : "").join("")}</div>`;
  }
  function render() {
    if (!open || !T) return;
    const t = T.cur, mine = me(), joined = !!mine && t.ents.some(e => e.n === mine);
    let h = `<div class="tr-hero"><div class="tr-hl"><div class="px">WEEKLY TOURNAMENT · ครั้งที่ ${t.no}</div>`;
    if (t.st === "signup") {
      h += `<h2>${when(t.at)}</h2><div class="tr-cd" id="tourCd"></div><div class="tr-cnt">สมัครแล้ว <b>${t.ents.length}</b> คน${t.note ? ` · <span class="tr-note">${esc(t.note)}</span>` : ""}</div></div><div class="tr-hb">`
        + (!mine ? `<span class="note">ต้องมีแอคเคาท์ถึงจะลงแข่งได้</span><button class="pf-an primary" data-acct="login">เข้าสู่ระบบ</button><button class="pf-an" data-acct="signup">สมัคร</button>`
          : joined ? `<span class="tr-in">✔ คุณสมัครแล้ว</span><button class="pf-an" id="tourLeave">ถอนตัว</button>` : `<button class="px-start tr-join" id="tourJoin">JOIN</button>`) + `</div></div>`;
    } else {
      const live = t.rounds.flat().concat(t.third ? [t.third] : []).filter(m => m.room && !m.w).length;
      h += `<h2>กำลังแข่ง!</h2><div class="tr-cnt">${t.ents.length} คน · เริ่ม ${when(t.began || t.at)} · กำลังเล่นอยู่ ${live} เกม</div></div><div class="tr-hb">${joined ? `<span class="tr-in">คุณอยู่ในทัวร์นาเมนต์นี้</span>` : ""}</div></div>`;
    }
    h += `<div class="tr-noai" role="note"><b>⚠ ห้ามใช้ AI ช่วยเล่นในทัวร์นาเมนต์</b> ทั้งโปรแกรม AI แอปวิเคราะห์ หรือให้คนอื่นเล่นแทน ถ้าพบว่าใช้ จะถูกตัดสิทธิ์และริบรางวัล</div>`;
    h += `<p class="ch-err" id="tourErr" aria-live="assertive"></p>`;
    if (t.st === "play") h += `<div class="pf-h">ตารางการแข่งขัน</div>${bracket(t)}<p class="note">แพ้ 1 เกมตกรอบ · กด "ดูเกม" เพื่อดูเกมที่ยังเล่นอยู่แบบสด ๆ · ชิงที่ 3 เล่นพร้อมรอบชิงชนะเลิศ</p>`;
    if (t.st === "signup" && t.ents.length) h += `<div class="pf-h">ผู้สมัคร (${t.ents.length})</div><div class="tr-ents">${t.ents.map(e => pTag(e, e.n === mine ? "me" : "")).join("")}</div>`;
    h += `<div class="pf-h">รางวัล</div><div class="tr-prize">${PRIZE.map(p => `<div><span class="tr-medal">${p[0]}</span><b>${p[1]}</b><small>${p[2]}</small></div>`).join("")}</div>`;
    h += `<div class="pf-h">กติกา</div><ul class="tr-rules"><li>แข่งทุกวันอาทิตย์ 18:00 น. (เวลาไทย) กด JOIN ไว้ล่วงหน้าได้ ถอนตัวได้ก่อนเริ่ม</li><li>จับสายแบบสุ่ม แพ้คัดออก ถ้าจำนวนคนไม่ลงตัว บางคนได้บายผ่านรอบแรก</li>
      <li>กระดาน 19×19 · เวลา 30 นาที + เบียวโยมิ 30 วิ × 3 · กติกาญี่ปุ่น โคมิ 6.5 · สุ่มสี</li><li>เกมเริ่มเองเมื่อรู้คู่ ต้องเดินตาแรกภายใน 5 นาที ไม่อย่างนั้นแพ้ (ไม่มาแข่ง)</li>
      <li>เปิดเกมค้างไว้ได้ทุกหน้า พอแมตช์ของคุณเริ่ม จะมีแถบเรียกขึ้นด้านบน</li><li>แพ้ในรองชนะเลิศ ได้เล่นชิงอันดับ 3</li><li><b>ห้ามใช้ AI ช่วยเล่น</b> ต้องคิดเองทุกตา</li></ul>`;
    if (T.last && T.last.st === "done") h += `<div class="pf-h">ผลครั้งที่ ${T.last.no}</div>${podium(T.last)}<details class="tr-old"><summary>ดูตารางครั้งที่ ${T.last.no}</summary>${bracket(T.last)}</details>`;
    if (T.champs && T.champs.length) h += `<div class="pf-h">ทำเนียบแชมป์</div><div class="tr-champs">${T.champs.map(c => `<div class="tr-ch"><img src="${face(c.a)}" alt="" width="160" height="160"><span><b data-player="${esc(c.n)}">${esc(c.n)}</b><small>Champion of Tournament ครั้งที่ ${c.no}</small></span></div>`).join("")}</div>`;
    $("tourBody").innerHTML = h;
    countdown();
  }
  async function join(on) {
    D.blip(880);
    if (on && !await D.askSure("สมัครทัวร์นาเมนต์", "ห้ามใช้ AI ช่วยเล่นในทัวร์นาเมนต์ (โปรแกรม AI แอปวิเคราะห์ หรือให้คนอื่นเล่นแทน) ถ้าพบว่าใช้ จะถูกตัดสิทธิ์และริบรางวัล", "รับทราบ · JOIN")) return;
    const r = await Hub.op(on ? "tourJoin" : "tourLeave", { token: Account.token() });
    if (r.status !== 200) { const e = $("tourErr"); if (e) e.textContent = r.body.error || "ไม่สำเร็จ"; return; }
    if (T && r.body.cur) { T.cur = r.body.cur; render(); }
    bar();
  }

  // ---------- the bar that calls a player to their match (every screen) ----------
  function myMatch(t) {
    const n = me(); if (!n || !t || t.st !== "play") return null;
    return t.rounds.flat().concat(t.third ? [t.third] : []).find(m => m.room && !m.w && ((m.a && m.a.n === n) || (m.b && m.b.n === n))) || null;
  }
  function bar() {
    let el = $("tourBar");
    const t = T && T.cur, m = myMatch(t), n = me();
    let html = "";
    if (m && D.currentRoom() !== m.room) {
      const opp = m.a.n === n ? m.b : m.a;
      html = `<span class="tr-medal">🏆</span><div class="inv-t"><b>แมตช์ทัวร์นาเมนต์ของคุณเริ่มแล้ว!</b><small>vs ${esc(opp.n)} · ต้องเดินตาแรกภายใน 5 นาที · ห้ามใช้ AI ช่วยเล่น</small></div><div class="inv-b"><button class="pf-an primary" data-tour-room="${m.room}">เข้าเล่น</button></div>`;
    } else if (t && t.st === "signup" && n && t.ents.some(e => e.n === n) && t.at - Hub.now() < 15 * 60e3 && t.at > Hub.now() && $("tour").hidden) {
      html = `<span class="tr-medal">🏆</span><div class="inv-t"><b>ทัวร์นาเมนต์เริ่ม ${new Date(t.at).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })} น.</b><small>อีก ${Math.max(1, Math.ceil((t.at - Hub.now()) / 60e3))} นาที · เปิดเกมค้างไว้ได้เลย</small></div><div class="inv-b"><button class="pf-an primary" data-tour-open="1">ดูตาราง</button></div>`;
    }
    if (!html) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement("div"); el.id = "tourBar"; el.className = "inv-bar tr-bar"; el.setAttribute("role", "alert"); document.body.appendChild(el); }
    el.innerHTML = html; el.hidden = false;
  }
  // a signed-in player follows the tournament from every page (one more key on the page's socket; the server pushes
  // only when the bracket changes), so the call to a match arrives wherever they are
  function follow() {
    const n = me() || null;
    if (n === barName) return;
    barName = n;
    if (offBar) { offBar(); offBar = null; }
    if (n) {
      offBar = Hub.sub("tour", v => { if (!v) return; const was = T; T = Object.assign({}, T, v); bar(); if (open) render(); prize(was); });
      Hub.op("tour", {}).then(r => { if (r.status === 200) { T = r.body; bar(); if (open) render(); prize(null); } });
    }
    bar();
  }
  // a finished tournament where this player placed: fetch the points and title from the account, once
  function prize() {
    const L = T && T.last, n = me();
    if (!L || !L.res || !n) return;
    const place = [L.res.first, L.res.second, L.res.third].indexOf(n);
    if (place < 0) return;
    const key = "gonn.tourSeen";
    let seen = 0; try { seen = +localStorage.getItem(key) || 0; } catch (e) {}
    if (seen >= L.no) return;
    try { localStorage.setItem(key, String(L.no)); } catch (e) {}
    Account.pull();
    D.askSure(`${PRIZE[place][0]} ทัวร์นาเมนต์ครั้งที่ ${L.no}`, place === 0 ? `ยินดีด้วย! คุณเป็นแชมป์ ได้ +100 เรตติ้ง และฉายา "Champion of Tournament ครั้งที่ ${L.no}" (เลือกใส่/ถอดฉายาได้ในหน้า PROFILE)` : `ยินดีด้วย! คุณได้อันดับ ${place + 1} รับ ${PRIZE[place][2]}`, "เยี่ยม!");
  }

  // ---------- Profile: which title is worn after the name ----------
  function titleSection() {
    if (!Account.name()) return "";
    const list = Account.titles(), cur = Account.title();
    if (!list.length) return `<div class="pf-h">ฉายา</div><div class="pf-rank"><span class="note" style="display:block">ยังไม่มีฉายา ชนะทัวร์นาเมนต์รายสัปดาห์ (วันอาทิตย์ 18:00 น.) เพื่อรับฉายา Champion of Tournament ไว้โชว์หลังชื่อ</span></div>`;
    return `<div class="pf-h">ฉายา</div><div class="tr-titles"><button class="tr-tt${cur ? "" : " on"}" data-title="">ไม่ใช้ฉายา</button>${list.map(x => `<button class="tr-tt${cur === x.id ? " on" : ""}" data-title="${esc(x.id)}">🏆 ${esc(x.t)}</button>`).join("")}</div>
      <p class="note" style="margin-top:6px">ฉายาที่เลือกจะขึ้นหลังชื่อคุณในแชท กระดานอันดับ ห้องออนไลน์ และตารางทัวร์นาเมนต์</p>`;
  }

  function init(deps) {
    D = deps;
    $("tourBack").onclick = () => { D.blip(660); close(); D.showMenu(); };
    document.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("button, [data-player]"); if (!b) return;
      if (b.id === "tourJoin") join(true);
      else if (b.id === "tourLeave") join(false);
      else if (b.dataset.tourRoom) { D.blip(880); const id = b.dataset.tourRoom; if ($("tourBar")) $("tourBar").hidden = true; close(); D.enterRoom(id); }
      else if (b.dataset.tourOpen) { D.blip(880); if ($("tourBar")) $("tourBar").hidden = true; openScreen(); }
      else if (b.dataset.title !== undefined && b.classList.contains("tr-tt")) { D.blip(880); Account.setTitle(b.dataset.title || null); }
      else if (b.dataset.player && b.closest("#tourBody")) { D.blip(880); close(); D.openPlayer(b.dataset.player); }
    });
    setTimeout(follow, 1200);
    setInterval(bar, 30e3);
  }
  return { init, open: openScreen, close, follow, bar, titleSection };
})();
