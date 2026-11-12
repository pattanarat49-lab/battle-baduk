// KIFU: a library of game records, from the 17th century to this year, to search by player and step through move by
// move. The data is static files under kifu/ (built by src/tools/kifu_build.py): index.json has the players and events,
// meta-N.json one row of columns per game (oldest first), g/NNNN.json the moves of a few hundred games each, fetched
// when a game is opened. Nothing goes through the Worker.
const Kifu = (() => {
  "use strict";
  const api = {}; // the game may set api.sound(), api.onBack(), api.analyse({ moves, at, floor }) and api.E (the engine, for analysis)
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const BASE = "kifu/", N = 19, PAGE = 50;
  let IDX = null, M = null, loading = null, metaDone = 0, metaWait = null, wired = false;
  const shards = new Map();

  // ---------- categories ----------
  const ERAS = [
    { id: "", t: "ทุกยุค" },
    { id: "edo", t: "โบราณ–เอโดะ", s: "ก่อน 1868", a: 0, b: 1867 },
    { id: "meiji", t: "เมจิ–ก่อนสงคราม", s: "1868–1945", a: 1868, b: 1945 },
    { id: "showa", t: "หลังสงคราม", s: "1946–1979", a: 1946, b: 1979 },
    { id: "e80", t: "ยุค 80–90", s: "1980–1999", a: 1980, b: 1999 },
    { id: "e00", t: "ก่อน AI", s: "2000–2015", a: 2000, b: 2015 },
    { id: "ai", t: "ยุค AI", s: "2016–ปัจจุบัน", a: 2016, b: 9999 }
  ];
  const CC = { JP: ["🇯🇵", "ญี่ปุ่น"], KR: ["🇰🇷", "เกาหลี"], CN: ["🇨🇳", "จีน"], TW: ["🇹🇼", "ไต้หวัน"], XX: ["🌍", "ชาติอื่น ๆ"], AI: ["🤖", "AI"], "": ["", "ไม่ระบุ"] };
  const CCS = ["", "JP", "KR", "CN", "TW", "XX", "AI"];
  const LEVELS = [
    { id: "", t: "ทุกระดับ" }, { id: "9", t: "9 ดั้ง", a: 9, b: 9 }, { id: "7", t: "7–8 ดั้ง", a: 7, b: 8 }, { id: "5", t: "5–6 ดั้ง", a: 5, b: 6 },
    { id: "1", t: "1–4 ดั้ง", a: 1, b: 4 }, { id: "ama", t: "สมัครเล่นระดับสูง", a: 20, b: 29 }
  ];
  const EVTAGS = [
    { id: "", t: "ทุกรายการ" }, { id: "big", t: "แชมป์ใหญ่ญี่ปุ่น" }, { id: "intl", t: "นานาชาติ" }, { id: "f", t: "หญิง" }, { id: "tv", t: "ทีวี / หมากเร็ว" },
    { id: "old", t: "ยุคโบราณ" }, { id: "ama", t: "สมัครเล่น" }, { id: "ai", t: "คน vs AI" }
  ];
  const LEGENDS = ["Honinbo Dosaku", "Honinbo Shusaku", "Honinbo Shusai", "Go Seigen", "Sakata Eio", "Cho Chikun", "Cho Hunhyun", "Lee Changho", "Lee Sedol",
    "Gu Li", "Ke Jie", "Iyama Yuta", "Park Junghwan", "Shin Jinseo", "AlphaGo"];
  const MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const dateText = d => { if (!d) return "ไม่ทราบวันที่"; const y = (d / 10000) | 0, m = ((d / 100) | 0) % 100, dd = d % 100; return (dd ? dd + " " : "") + (m ? MONTHS[m] + " " : "") + y; };
  const lvlText = l => !l ? "" : l <= 9 ? l + " ดั้ง" : "สมัครเล่น";
  // a rank in a game record: 1-9 pro dan, 10 a title holder, 20+ amateur, 30 insei
  const rankText = r => !r ? "" : r <= 9 ? r + "p" : r === 10 ? "แชมป์" : r === 30 ? "อินเซ" : r > 20 ? (r - 20) + "d สมัครเล่น" : "สมัครเล่น";
  function resultText(r) {
    if (r === "0") return "เสมอ (จิโกะ)"; if (r === "V") return "ไม่มีผล"; if (!r || r === "?") return "ไม่ทราบผล";
    const who = r[0] === "B" ? "ดำชนะ" : "ขาวชนะ", x = r.slice(2);
    return who + (x === "R" ? " (อีกฝ่ายยอมแพ้)" : x === "T" ? " (หมดเวลา)" : x === "F" ? " (ผิดกติกา)" : x ? ` ${x} แต้ม` : "");
  }
  const resultShort = r => r === "0" ? "เสมอ" : r === "V" || r === "?" || !r ? "–" : (r[0] === "B" ? "ดำ" : "ขาว") + r.slice(1);

  // ---------- data ----------
  const P = i => IDX.players[i]; // [name, cc, level, games, first year, last year, other spellings, Thai name, group?]
  const pname = i => P(i)[0];
  function fetchIndex() {
    if (IDX) return Promise.resolve(IDX);
    if (!loading) loading = fetch(BASE + "index.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
      IDX = d;
      d.players.forEach((p, i) => { p.i = i; p.key = fold([p[0], p[6], p[7]].join("|")); });
      d.events.forEach((e, i) => { e.i = i + 1; e.key = fold(e[0]); });
      return d;
    }).catch(e => { loading = null; throw e; });
    return loading;
  }
  // the rows of every game, in parts fetched side by side; lists that need them wait on this
  function fetchMeta() {
    if (metaWait) return metaWait;
    const n = IDX.n;
    M = { d: new Int32Array(n), b: new Uint16Array(n), w: new Uint16Array(n), e: new Uint16Array(n), q: new Uint16Array(n), n: new Uint16Array(n), h: new Uint8Array(n), r: new Array(n) };
    metaDone = 0;
    metaWait = Promise.all(Array.from({ length: IDX.parts }, (_, k) => fetch(`${BASE}meta-${k}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(part => {
      const o = k * IDX.per;
      for (const f of ["d", "b", "w", "e", "q", "n", "h"]) M[f].set(part[f], o);
      for (let i = 0; i < part.r.length; i++) M.r[o + i] = part.r[i];
      metaDone++; const el = $("kfLoad"); if (el) el.textContent = `กำลังโหลดรายการเกม ${Math.round(100 * metaDone / IDX.parts)}%`;
    }))).then(() => { index(); return M; }).catch(e => { metaWait = null; throw e; });
    return metaWait;
  }
  // every player's games (ids ascending = oldest first), and every event's
  let byP = null, byE = null;
  function index() {
    const n = IDX.n, np = IDX.players.length, ne = IDX.events.length + 1;
    const build = (cols, size) => {
      const cnt = new Int32Array(size + 1);
      for (const c of cols) for (let i = 0; i < n; i++) cnt[c[i] + 1]++;
      for (let i = 0; i < size; i++) cnt[i + 1] += cnt[i];
      const pos = cnt.slice(0, size), out = new Int32Array(cnt[size]);
      for (let i = 0; i < n; i++) for (const c of cols) { if (cols.length > 1 && c === cols[1] && cols[0][i] === c[i]) continue; out[pos[c[i]]++] = i; }
      return { start: cnt, pos, out };
    };
    byP = build([M.b, M.w], np); byE = build([M.e], ne);
  }
  const gamesOf = (ix, k) => ix.out.subarray(ix.start[k], ix.pos[k]);
  function fetchGame(id) {
    const s = (id / IDX.shard) | 0;
    if (!shards.has(s)) shards.set(s, fetch(`${BASE}g/${String(s).padStart(4, "0")}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(e => { shards.delete(s); throw e; }));
    return shards.get(s).then(rows => rows[id % IDX.shard]);
  }
  // letters only, lower case, so "Yi Ch'ang-ho", "lee changho" and "อี ชางโฮ" are all found as typed
  function fold(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’`.\-]/g, "").replace(/\s+/g, " "); }
  const match = (key, q) => q.every(t => key.includes(t));

  // ---------- state ----------
  const UI = { view: "home", tab: "players", q: "", era: "", cc: "", lvl: "", tag: "", shown: PAGE, stack: [], player: null, event: null, list: null, pq: "", pshown: PAGE, pyear: "" };
  const G = { id: -1, moves: [], at: 0, nums: false, timer: null, info: null, ctx: null };
  const era = () => ERAS.find(e => e.id === UI.era);
  const lvl = () => LEVELS.find(l => l.id === UI.lvl);
  const inLvl = (v, L) => !L.id || (L.id === "ama" ? v >= 20 && v < 30 : v >= L.a && v <= L.b);

  // ---------- home ----------
  const chips = (list, cur, attr, label) => list.map(x => `<button data-${attr}="${x.id}" class="${x.id === cur ? "on" : ""}">${label(x)}</button>`).join("");
  function playerList() {
    const q = fold(UI.q).split(" ").filter(Boolean), E = era(), L = lvl();
    return IDX.players.filter(p => !p[8] && (!UI.cc || p[1] === UI.cc) && inLvl(p[2], L) && (!E.id || (p[4] && p[4] <= E.b && p[5] >= E.a)) && (!q.length || match(p.key, q)));
  }
  function eventList() {
    const q = fold(UI.q).split(" ").filter(Boolean), E = era();
    return IDX.events.filter(e => (!UI.tag || e[4] === UI.tag) && (!E.id || (e[2] && e[2] <= E.b && e[3] >= E.a)) && (!q.length || match(e.key, q)));
  }
  // games newest first that fit the filters; with a search, games of the players it finds
  function gameList(max) {
    const q = fold(UI.q).split(" ").filter(Boolean), E = era(), L = lvl(), out = [];
    let ok = null;
    if (q.length) { ok = new Uint8Array(IDX.players.length); for (const p of IDX.players) if (match(p.key, q)) ok[p.i] = 1; }
    let total = 0;
    for (let i = IDX.n - 1; i >= 0; i--) {
      const y = (M.d[i] / 10000) | 0;
      if (E.id && (!y || y < E.a || y > E.b)) { if (E.id && y && y < E.a) break; continue; }
      if (ok && !ok[M.b[i]] && !ok[M.w[i]]) continue;
      if (UI.cc && P(M.b[i])[1] !== UI.cc && P(M.w[i])[1] !== UI.cc) continue;
      if (L.id) { const q2 = M.q[i]; if (!inLvl(q2 >> 5, L) && !inLvl(q2 & 31, L)) continue; }
      total++; if (out.length < max) out.push(i);
    }
    return { out, total };
  }
  const pcard = p => `<button class="kf-p" data-p="${p.i}"><span class="kf-flag">${CC[p[1]][0] || "·"}</span><span class="kf-pb"><b>${esc(p[0])}</b>${p[7] ? `<small>${esc(p[7])}</small>` : ""}
    <span class="kf-meta">${[CC[p[1]][1], lvlText(p[2]), p[4] ? (p[4] === p[5] ? p[4] : `${p[4]}–${p[5]}`) : ""].filter(Boolean).join(" · ")}</span></span><span class="kf-n"><b>${p[3].toLocaleString()}</b>เกม</span></button>`;
  function grow(g, me) { // one game as a row; me: the player whose page it is on
    const b = M.b[g], w = M.w[g], r = M.r[g], q = M.q[g], win = r && r[1] === "+" ? r[0] : "", e = M.e[g];
    const side = (i, rk, c) => `<span class="kf-s ${c}${win === (c === "b" ? "B" : "W") ? " win" : ""}"><i></i>${esc(pname(i))}${rankText(rk) ? ` <em>${rankText(rk)}</em>` : ""}</span>`;
    let res = `<span class="kf-res">${resultShort(r)}</span>`;
    if (me !== undefined && win) { const won = (win === "B") === (b === me); res = `<span class="kf-res ${won ? "w" : "l"}">${won ? "ชนะ" : "แพ้"} <small>${esc(resultShort(r))}</small></span>`; }
    return `<button class="kf-g" data-g="${g}"><span class="kf-d">${dateText(M.d[g])}</span><span class="kf-vs">${side(b, q >> 5, "b")}${side(w, q & 31, "w")}</span>
      <span class="kf-ev">${[e ? esc(IDX.events[e - 1][0]) : "", M.h[g] ? `ต่อ ${M.h[g]} เม็ด` : "", `${M.n[g]} ตา`].filter(Boolean).join(" · ")}</span>${res}</button>`;
  }
  const more = (left, id) => left > 0 ? `<button class="js-more" id="${id}">ดูเพิ่ม (เหลือ ${left.toLocaleString()})</button>` : "";
  const empty = t => `<p class="ts-dim kf-empty">${t}</p>`;
  function renderHome() {
    $("kfEra").innerHTML = chips(ERAS, UI.era, "era", x => x.s ? `${x.t} <small>${x.s}</small>` : x.t);
    $("kfCc").innerHTML = chips(CCS.map(id => ({ id })), UI.cc, "cc", x => x.id ? `${CC[x.id][0]} ${CC[x.id][1]}` : "ทุกประเทศ");
    $("kfLvl").innerHTML = chips(LEVELS, UI.lvl, "lvl", x => x.t);
    $("kfTag").innerHTML = chips(EVTAGS, UI.tag, "tag", x => x.t);
    for (const b of $("kfTabs").children) b.classList.toggle("on", b.dataset.tab === UI.tab);
    $("kfRowCc").hidden = $("kfRowLvl").hidden = UI.tab === "events"; $("kfRowTag").hidden = UI.tab !== "events";
    const any = UI.q || UI.era || UI.cc || UI.lvl || (UI.tab === "events" && UI.tag);
    $("kfClear").hidden = !any;
    $("kfLegends").hidden = !!any || UI.tab !== "players";
    const box = $("kfList");
    if (UI.tab === "players") {
      const ls = playerList();
      $("kfCount").textContent = `${ls.length.toLocaleString()} คน`;
      box.className = "kf-list kf-plist";
      box.innerHTML = ls.length ? ls.slice(0, UI.shown).map(pcard).join("") + more(ls.length - UI.shown, "kfMore") : empty("ไม่พบผู้เล่นที่ตรงกับคำค้นหรือหมวดที่เลือก ลองสะกดแบบอื่นหรือกด “ล้างตัวกรอง”");
    } else if (UI.tab === "events") {
      const ls = eventList();
      $("kfCount").textContent = `${ls.length.toLocaleString()} รายการ`;
      box.className = "kf-list kf-plist";
      box.innerHTML = ls.length ? ls.slice(0, UI.shown).map(e => `<button class="kf-p" data-e="${e.i}"><span class="kf-flag">🏆</span><span class="kf-pb"><b>${esc(e[0])}</b>
        <span class="kf-meta">${e[2] ? (e[2] === e[3] ? e[2] : `${e[2]}–${e[3]}`) : ""}</span></span><span class="kf-n"><b>${e[1].toLocaleString()}</b>เกม</span></button>`).join("") + more(ls.length - UI.shown, "kfMore")
        : empty("ไม่พบรายการแข่งที่ตรงกับคำค้น");
    } else {
      box.className = "kf-list kf-glist";
      if (!byP) { box.innerHTML = `<p class="ts-dim" id="kfLoad">กำลังโหลดรายการเกม…</p>`; $("kfCount").textContent = ""; fetchMeta().then(() => { if (UI.view === "home" && UI.tab === "games") renderHome(); }).catch(failed); return; }
      const { out, total } = gameList(UI.shown);
      $("kfCount").textContent = `${total.toLocaleString()} เกม (ใหม่สุดก่อน)`;
      box.innerHTML = out.length ? out.map(g => grow(g)).join("") + more(total - out.length, "kfMore") : empty("ไม่พบเกมที่ตรงกับคำค้นหรือหมวดที่เลือก");
      UI.list = out;
    }
    const m = $("kfMore"); if (m) m.onclick = () => { UI.shown += PAGE * 2; renderHome(); };
  }
  const failed = () => { const el = $("kfLoad") || $("kfList"); if (el) el.innerHTML = "โหลดข้อมูลไม่สำเร็จ ลองเปิดใหม่อีกครั้ง"; };

  // ---------- one player, one event ----------
  function renderPlayer() {
    const p = P(UI.player), box = $("kfPList");
    $("kfPName").innerHTML = `${CC[p[1]][0] ? CC[p[1]][0] + " " : ""}${esc(p[0])}${p[7] ? `<small>${esc(p[7])}</small>` : ""}`;
    const also = p[6] ? p[6].split("|").filter(a => !/[()]/.test(a)).slice(0, 5) : [];
    $("kfPInfo").innerHTML = [CC[p[1]][1] !== "ไม่ระบุ" ? `สังกัด/ประเทศ: <b>${CC[p[1]][1]}</b>` : "", p[2] ? `ระดับสูงสุดในบันทึก: <b>${lvlText(p[2])}</b>` : "", p[4] ? `ช่วงปีที่มีเกม: <b>${p[4]}–${p[5]}</b>` : "",
      also.length ? `สะกดแบบอื่น: ${also.map(esc).join(", ")}` : ""].filter(Boolean).join("<br>");
    if (!byP) { box.innerHTML = `<p class="ts-dim" id="kfLoad">กำลังโหลดรายการเกม…</p>`; $("kfPStat").innerHTML = ""; $("kfRivals").innerHTML = ""; $("kfPCount").textContent = ""; fetchMeta().then(() => { if (UI.view === "player") renderPlayer(); }).catch(failed); return; }
    const all = gamesOf(byP, UI.player), me = UI.player;
    let win = 0, loss = 0; const opp = new Map(), years = new Map();
    for (const g of all) {
      const r = M.r[g], iB = M.b[g] === me, o = iB ? M.w[g] : M.b[g];
      if (r && r[1] === "+" && o !== me) { if ((r[0] === "B") === iB) win++; else loss++; }
      if (o !== me) opp.set(o, (opp.get(o) || 0) + 1);
      const dec = Math.floor(M.d[g] / 100000) * 10; if (dec) years.set(dec, (years.get(dec) || 0) + 1);
    }
    $("kfPStat").innerHTML = `<span><b>${all.length.toLocaleString()}</b>เกม</span><span><b>${win.toLocaleString()}</b>ชนะ</span><span><b>${loss.toLocaleString()}</b>แพ้</span><span><b>${win + loss ? Math.round(100 * win / (win + loss)) : 0}%</b>อัตราชนะ</span>`;
    const rivals = [...opp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    $("kfRivals").innerHTML = rivals.length ? `<span class="kf-lab">คู่ที่เจอบ่อย</span>` + rivals.map(([o, c]) => `<button data-rv="${o}" class="${UI.rival === o ? "on" : ""}">${esc(pname(o))} <small>${c}</small></button>`).join("") : "";
    const decs = [...years.keys()].sort((a, b) => a - b);
    $("kfPYears").innerHTML = decs.length > 1 ? `<button data-y="" class="${UI.pyear === "" ? "on" : ""}">ทุกปี</button>` + decs.map(y => `<button data-y="${y}" class="${UI.pyear === y ? "on" : ""}">${y}s</button>`).join("") : "";
    const q = fold(UI.pq).split(" ").filter(Boolean);
    const ls = [];
    for (let k = all.length - 1; k >= 0; k--) {
      const g = all[k], o = M.b[g] === me ? M.w[g] : M.b[g];
      if (UI.rival !== undefined && UI.rival !== null && o !== UI.rival) continue;
      if (UI.pyear !== "" && Math.floor(M.d[g] / 100000) * 10 !== UI.pyear) continue;
      if (q.length && !match(P(o).key, q) && !(M.e[g] && match(IDX.events[M.e[g] - 1].key, q))) continue;
      ls.push(g);
    }
    $("kfPCount").textContent = `${ls.length.toLocaleString()} เกม (ใหม่สุดก่อน)`;
    box.innerHTML = ls.length ? ls.slice(0, UI.pshown).map(g => grow(g, me)).join("") + more(ls.length - UI.pshown, "kfPMore") : empty("ไม่มีเกมที่ตรงกับตัวกรอง");
    UI.list = ls;
    const m = $("kfPMore"); if (m) m.onclick = () => { UI.pshown += PAGE * 2; renderPlayer(); };
  }
  function renderEvent() {
    const e = IDX.events[UI.event - 1], box = $("kfPList");
    $("kfPName").innerHTML = `🏆 ${esc(e[0])}`;
    $("kfPInfo").innerHTML = e[2] ? `ช่วงปีที่มีเกม: <b>${e[2]}–${e[3]}</b>` : "";
    $("kfRivals").innerHTML = "";
    if (!byE) { box.innerHTML = `<p class="ts-dim" id="kfLoad">กำลังโหลดรายการเกม…</p>`; $("kfPStat").innerHTML = ""; $("kfPCount").textContent = ""; fetchMeta().then(() => { if (UI.view === "event") renderEvent(); }).catch(failed); return; }
    const all = gamesOf(byE, UI.event), years = new Map();
    for (const g of all) { const y = (M.d[g] / 10000) | 0; if (y) years.set(y, (years.get(y) || 0) + 1); }
    $("kfPStat").innerHTML = `<span><b>${all.length.toLocaleString()}</b>เกม</span><span><b>${years.size}</b>ปี</span>`;
    const ys = [...years.keys()].sort((a, b) => b - a);
    $("kfPYears").innerHTML = ys.length > 1 ? `<button data-y="" class="${UI.pyear === "" ? "on" : ""}">ทุกปี</button>` + ys.map(y => `<button data-y="${y}" class="${UI.pyear === y ? "on" : ""}">${y}</button>`).join("") : "";
    const q = fold(UI.pq).split(" ").filter(Boolean), ls = [];
    for (let k = all.length - 1; k >= 0; k--) {
      const g = all[k];
      if (UI.pyear !== "" && ((M.d[g] / 10000) | 0) !== UI.pyear) continue;
      if (q.length && !match(P(M.b[g]).key, q) && !match(P(M.w[g]).key, q)) continue;
      ls.push(g);
    }
    $("kfPCount").textContent = `${ls.length.toLocaleString()} เกม (ใหม่สุดก่อน)`;
    box.innerHTML = ls.length ? ls.slice(0, UI.pshown).map(g => grow(g)).join("") + more(ls.length - UI.pshown, "kfPMore") : empty("ไม่มีเกมที่ตรงกับตัวกรอง");
    UI.list = ls;
    const m = $("kfPMore"); if (m) m.onclick = () => { UI.pshown += PAGE * 2; renderEvent(); };
  }

  // ---------- the game viewer ----------
  // the position after `at` moves: stones, the number on each, and the captures so far
  function position(at) {
    const b = new Int8Array(N * N), num = new Int16Array(N * N), cap = [0, 0, 0];
    const nb = p => { const x = p % N, y = (p / N) | 0, o = []; if (x) o.push(p - 1); if (x < N - 1) o.push(p + 1); if (y) o.push(p - N); if (y < N - 1) o.push(p + N); return o; };
    const dead = p => { const c = b[p], g = [p], seen = new Set(g); for (let i = 0; i < g.length; i++) for (const q of nb(g[i])) { if (!b[q]) return null; if (b[q] === c && !seen.has(q)) { seen.add(q); g.push(q); } } return g; };
    for (const p of G.ab) b[p] = 1; for (const p of G.aw) b[p] = 2;
    let c = G.first, last = -1;
    for (let k = 0; k < at; k++) {
      const p = G.moves[k]; last = p;
      if (p >= 0 && !b[p]) {
        b[p] = c; num[p] = k + 1;
        for (const q of nb(p)) if (b[q] === 3 - c) { const g = dead(q); if (g) { cap[c] += g.length; for (const s of g) { b[s] = 0; num[s] = 0; } } }
        const me = dead(p); if (me) for (const s of me) { b[s] = 0; num[s] = 0; }
      }
      c = 3 - c;
    }
    return { b, num, cap, last, next: c };
  }
  function drawBoard() {
    const { b, num, cap, last, next } = position(G.at), s = [];
    s.push(`<rect x="-.75" y="-.75" width="19.5" height="19.5" rx=".15" fill="var(--wood)"/>`);
    for (let k = 0; k < N; k++) s.push(`<path d="M0 ${k}H18M${k} 0V18" stroke="#4a2a12" stroke-width="${k === 0 || k === 18 ? .07 : .04}" fill="none"/>`);
    for (const x of [3, 9, 15]) for (const y of [3, 9, 15]) s.push(`<circle cx="${x}" cy="${y}" r=".11" fill="#4a2a12"/>`);
    for (let p = 0; p < N * N; p++) {
      if (!b[p]) continue; const x = p % N, y = (p / N) | 0, k = num[p];
      s.push(`<circle cx="${x}" cy="${y}" r=".47" fill="url(#kfG${b[p] === 1 ? "b" : "w"})" stroke="${b[p] === 1 ? "#000" : "#9c917e"}" stroke-width=".02"/>`);
      if (G.nums && k) s.push(`<text x="${x}" y="${y + .04}" class="kf-num${k > 99 ? " s3" : k > 9 ? " s2" : ""}" fill="${p === last ? "#e0533d" : b[p] === 1 ? "#f3ead8" : "#1a1208"}">${k}</text>`);
      else if (p === last) s.push(`<circle cx="${x}" cy="${y}" r=".2" fill="none" stroke="${b[p] === 1 ? "#f3ead8" : "#2a1a0b"}" stroke-width=".08"/>`);
    }
    $("kfBoard").innerHTML = `<defs><radialGradient id="kfGb" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#5b5b5b"/><stop offset="1" stop-color="#0d0d0d"/></radialGradient>
      <radialGradient id="kfGw" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfc6b4"/></radialGradient></defs>${s.join("")}`;
    const tot = G.moves.length, passed = G.at && last < 0;
    $("kfStep").innerHTML = `ตา <b>${G.at}</b> / ${tot}${passed ? " · ผ่าน" : ""}${G.at === tot ? ` · จบเกม: <b>${resultText(M.r[G.id])}</b>` : ` · ตาต่อไป${next === 1 ? "ดำ" : "ขาว"}`}`;
    $("kfCapB").textContent = cap[1]; $("kfCapW").textContent = cap[2];
    $("kfSlide").max = tot; $("kfSlide").value = G.at;
    $("kfFirst").disabled = $("kfPrev").disabled = G.at === 0; $("kfNext").disabled = $("kfLast").disabled = G.at === tot;
  }
  function goTo(k, quiet) { const t = Math.max(0, Math.min(G.moves.length, k)); if (t === G.at) return; const fwd = t === G.at + 1; G.at = t; if (fwd && !quiet && api.sound && G.moves[t - 1] >= 0) api.sound(); drawBoard(); }
  function play(on) {
    clearInterval(G.timer); G.timer = null;
    if (on) { if (G.at >= G.moves.length) goTo(0, true); G.timer = setInterval(() => { if (G.at >= G.moves.length) return play(false); goTo(G.at + 1); }, +$("kfSpeed").value); }
    $("kfPlay").textContent = G.timer ? "⏸ หยุด" : "▶ เล่นอัตโนมัติ"; $("kfPlay").classList.toggle("on", !!G.timer);
  }
  const pts = s => { const o = []; for (let i = 0; i + 1 < s.length; i += 2) o.push(s[i] === "." ? -1 : (s.charCodeAt(i + 1) - 97) * N + (s.charCodeAt(i) - 97)); return o; };
  async function openGame(id, ctx) {
    play(false);
    G.id = id; G.ctx = ctx || null; G.at = 0; G.moves = []; G.ab = []; G.aw = []; G.first = 1; G.info = null;
    show("game");
    const b = M.b[id], w = M.w[id], q = M.q[id];
    $("kfGB").innerHTML = `<i></i><span><b>${esc(pname(b))}</b><small>ดำ${rankText(q >> 5) ? " · " + rankText(q >> 5) : ""}</small></span>`; $("kfGB").dataset.p = b;
    $("kfGW").innerHTML = `<i></i><span><b>${esc(pname(w))}</b><small>ขาว${rankText(q & 31) ? " · " + rankText(q & 31) : ""}</small></span>`; $("kfGW").dataset.p = w;
    $("kfGInfo").innerHTML = `<span class="ts-dim">กำลังโหลดเกม…</span>`; $("kfBoard").innerHTML = ""; $("kfStep").textContent = "";
    const pos = ctx ? ctx.indexOf(id) : -1;
    $("kfGPrev").disabled = pos <= 0; $("kfGNext").disabled = pos < 0 || pos >= ctx.length - 1;
    let row;
    try { row = await fetchGame(id); } catch (e) { $("kfGInfo").innerHTML = "โหลดเกมไม่สำเร็จ ลองใหม่อีกครั้ง"; return; }
    if (G.id !== id) return;
    const x = row[1] || {};
    G.moves = pts(row[0]); G.ab = pts(x.ab || ""); G.aw = pts(x.aw || ""); G.first = x.f === "W" ? 2 : 1; G.info = x;
    const e = M.e[id], name = (i, raw) => raw && raw !== pname(i) ? ` <small>(ในบันทึก: ${esc(raw)})</small>` : "";
    const rowsI = [["รายการ", x.e ? esc(x.e) : e ? esc(IDX.events[e - 1][0]) : ""], ["รอบ", esc(x.r || "")], ["วันที่", dateText(M.d[id])], ["สถานที่", esc(x.p || "")],
      ["ผล", `<b>${resultText(M.r[id])}</b>`], ["โคมิ", esc(x.k || "")], ["แต้มต่อ", G.ab.length ? `${G.ab.length} เม็ด` : ""], ["จำนวนตา", `${G.moves.length}`]].filter(r => r[1]);
    $("kfGInfo").innerHTML = rowsI.map(r => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join("") + (x.bn || x.wn ? `<p class="ts-dim">${name(b, x.bn)}${name(w, x.wn)}</p>` : "");
    $("kfAi").disabled = !api.analyse || G.aw.length > 0;
    drawBoard(); window.scrollTo(0, 0);
  }
  // the game as moves for the analysis board: handicap stones first, with white passing between them
  function forAnalysis() {
    const mv = [];
    G.ab.forEach((p, i) => { if (i) mv.push(-1); mv.push(p); });
    const floor = mv.length;
    if (G.ab.length ? G.first === 1 : G.first === 2) mv.push(-1);
    const lead = mv.length;
    return { moves: mv.concat(G.moves), at: lead + G.at, floor: G.ab.length ? lead : 0, lead };
  }
  function sgf() {
    const id = G.id, x = G.info || {}, L = p => String.fromCharCode(97 + p % N) + String.fromCharCode(97 + ((p / N) | 0)), d = M.d[id];
    const e = s => String(s).replace(/[\\\]]/g, "\\$&");
    const dt = d ? `${(d / 10000) | 0}${((d / 100) | 0) % 100 ? "-" + String(((d / 100) | 0) % 100).padStart(2, "0") + (d % 100 ? "-" + String(d % 100).padStart(2, "0") : "") : ""}` : "";
    let s = `(;GM[1]FF[4]SZ[19]PB[${e(x.bn || pname(M.b[id]))}]PW[${e(x.wn || pname(M.w[id]))}]` + (x.e ? `EV[${e(x.e)}]` : "") + (x.r ? `RO[${e(x.r)}]` : "") + (dt ? `DT[${dt}]` : "") + (x.k ? `KM[${e(x.k)}]` : "") +
      (M.r[id] && M.r[id] !== "?" ? `RE[${M.r[id] === "V" ? "Void" : M.r[id]}]` : "") + (G.ab.length ? `HA[${G.ab.length}]AB${G.ab.map(p => `[${L(p)}]`).join("")}` : "") + (G.aw.length ? `AW${G.aw.map(p => `[${L(p)}]`).join("")}` : "");
    let c = G.first; for (const p of G.moves) { s += `;${c === 1 ? "B" : "W"}[${p < 0 ? "" : L(p)}]`; c = 3 - c; }
    return s + ")";
  }

  // ---------- moving between the views ----------
  function show(view) {
    UI.view = view;
    $("kfHome").hidden = view !== "home"; $("kfPage").hidden = view !== "player" && view !== "event"; $("kfGame").hidden = view !== "game";
    $("kfTitle").textContent = view === "game" ? "ดูเกม" : view === "player" ? "ผู้เล่น" : view === "event" ? "รายการแข่ง" : "คลังคิฟุ";
    $("kfPq").placeholder = view === "event" ? "ค้นชื่อผู้เล่นในรายการนี้" : "ค้นคู่แข่งหรือรายการแข่ง";
  }
  function render() { if (UI.view === "home") renderHome(); else if (UI.view === "player") renderPlayer(); else if (UI.view === "event") renderEvent(); }
  const snap = () => ({ view: UI.view, player: UI.player, event: UI.event, pq: UI.pq, pshown: UI.pshown, pyear: UI.pyear, rival: UI.rival, y: window.scrollY, game: G.id, ctx: G.ctx, at: G.at });
  function push() { UI.stack.push(snap()); }
  function openPlayer(i) { push(); play(false); Object.assign(UI, { player: i, pq: "", pshown: PAGE, pyear: "", rival: null }); $("kfPq").value = ""; show("player"); renderPlayer(); window.scrollTo(0, 0); }
  function openEvent(i) { push(); play(false); Object.assign(UI, { event: i, pq: "", pshown: PAGE, pyear: "", rival: null }); $("kfPq").value = ""; show("event"); renderEvent(); window.scrollTo(0, 0); }
  function back() {
    play(false);
    const s = UI.stack.pop();
    if (!s) { $("ksel").hidden = true; if (api.onBack) api.onBack(); return; }
    if (s.view === "game") { openGame(s.game, s.ctx).then(() => goTo(s.at, true)); return; }
    Object.assign(UI, { player: s.player, event: s.event, pq: s.pq, pshown: s.pshown, pyear: s.pyear, rival: s.rival }); $("kfPq").value = s.pq;
    show(s.view); render(); window.scrollTo(0, s.y);
  }

  function wire() {
    wired = true;
    $("kfBack").onclick = back;
    let t = 0;
    $("kfQ").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { UI.q = e.target.value.trim(); UI.shown = PAGE; renderHome(); }, 140); });
    $("kfPq").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { UI.pq = e.target.value.trim(); UI.pshown = PAGE; render(); }, 140); });
    $("kfTabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (!b) return; UI.tab = b.dataset.tab; UI.shown = PAGE; renderHome(); });
    $("kfFilters").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      for (const k of ["era", "cc", "lvl", "tag"]) if (b.dataset[k] !== undefined) UI[k] = b.dataset[k];
      UI.shown = PAGE; renderHome();
    });
    $("kfClear").onclick = () => { Object.assign(UI, { q: "", era: "", cc: "", lvl: "", tag: "", shown: PAGE }); $("kfQ").value = ""; renderHome(); };
    $("kfLegends").addEventListener("click", e => { const b = e.target.closest("[data-p]"); if (b) openPlayer(+b.dataset.p); });
    const pick = e => {
      const p = e.target.closest("[data-p]"), ev = e.target.closest("[data-e]"), g = e.target.closest("[data-g]");
      if (p) openPlayer(+p.dataset.p); else if (ev) openEvent(+ev.dataset.e); else if (g) { push(); openGame(+g.dataset.g, UI.list ? Array.from(UI.list) : null); }
    };
    $("kfList").addEventListener("click", pick); $("kfPList").addEventListener("click", pick);
    $("kfRivals").addEventListener("click", e => { const b = e.target.closest("[data-rv]"); if (!b) return; const o = +b.dataset.rv; UI.rival = UI.rival === o ? null : o; UI.pshown = PAGE; renderPlayer(); });
    $("kfPYears").addEventListener("click", e => { const b = e.target.closest("[data-y]"); if (!b) return; UI.pyear = b.dataset.y === "" ? "" : +b.dataset.y; UI.pshown = PAGE; render(); });
    $("kfFirst").onclick = () => { play(false); goTo(0); }; $("kfPrev").onclick = () => { play(false); goTo(G.at - 1); };
    $("kfNext").onclick = () => { play(false); goTo(G.at + 1); }; $("kfLast").onclick = () => { play(false); goTo(G.moves.length); };
    $("kfSlide").addEventListener("input", e => { play(false); goTo(+e.target.value, true); });
    $("kfPlay").onclick = () => play(!G.timer);
    $("kfSpeed").onchange = () => { if (G.timer) play(true); };
    $("kfNums").onclick = () => { G.nums = !G.nums; $("kfNums").classList.toggle("on", G.nums); drawBoard(); };
    // the right half of the board steps forward, the left half back
    $("kfBoard").addEventListener("click", e => { const r = $("kfBoard").getBoundingClientRect(); play(false); goTo(G.at + (e.clientX - r.left > r.width / 2 ? 1 : -1)); });
    $("kfGB").onclick = $("kfGW").onclick = e => openPlayer(+e.currentTarget.dataset.p);
    $("kfGPrev").onclick = () => { const c = G.ctx, i = c.indexOf(G.id); if (i > 0) openGame(c[i - 1], c); };
    $("kfGNext").onclick = () => { const c = G.ctx, i = c.indexOf(G.id); if (i >= 0 && i < c.length - 1) openGame(c[i + 1], c); };
    $("kfAi").onclick = () => { if (!api.analyse || !G.moves.length) return; play(false); const a = forAnalysis(); $("ksel").hidden = true; api.analyse(a); };
    $("kfSgf").onclick = () => {
      const a = document.createElement("a"), id = G.id, nm = `${pname(M.b[id])} vs ${pname(M.w[id])} ${(M.d[id] / 10000) | 0 || ""}`.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_");
      a.href = URL.createObjectURL(new Blob([sgf()], { type: "application/x-go-sgf" })); a.download = nm + ".sgf"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    document.addEventListener("keydown", e => {
      if ($("ksel").hidden || UI.view !== "game" || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") { play(false); goTo(G.at + 1); } else if (e.key === "ArrowLeft") { play(false); goTo(G.at - 1); }
      else if (e.key === "Home") { play(false); goTo(0); } else if (e.key === "End") { play(false); goTo(G.moves.length); } else return;
      e.preventDefault();
    });
  }
  api.open = async () => {
    if (!wired) wire();
    $("ksel").hidden = false; UI.stack = []; show("home"); window.scrollTo(0, 0);
    if (!IDX) $("kfList").innerHTML = `<p class="ts-dim">กำลังโหลดคลังคิฟุ…</p>`;
    try {
      await fetchIndex();
      $("kfTotal").textContent = `${IDX.n.toLocaleString()} เกม · ผู้เล่น ${IDX.players.filter(p => !p[8]).length.toLocaleString()} คน · ${IDX.events.length.toLocaleString()} รายการแข่ง`;
      const by = new Map(IDX.players.map(p => [p[0], p]));
      $("kfLegends").innerHTML = `<span class="kf-lab">ตำนาน</span>` + LEGENDS.filter(n => by.has(n)).map(n => { const p = by.get(n); return `<button data-p="${p.i}">${esc((p[7] || p[0]).replace(/\s*\(.*\)/, ""))}</button>`; }).join("");
      renderHome(); fetchMeta().catch(() => {});
    } catch (e) { $("kfList").innerHTML = `<p class="ts-dim">โหลดข้อมูลไม่สำเร็จ ลองเปิดใหม่อีกครั้ง</p>`; }
  };
  // back from the analysis board: the game is where it was left
  api.resume = () => { $("ksel").hidden = false; show("game"); drawBoard(); window.scrollTo(0, 0); };
  api._state = () => ({ UI, G, IDX, M }); // for tests
  return api;
})();
