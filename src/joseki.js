// JOSEKI: a library of corner sequences from real games, to look through move by move. Nothing is computed by an engine:
// joseki.json (built by src/tools/joseki_extract.py) is a tree of the corner sequences in about 31,000 pro games of
// 1940-1999, 43,000 pro games of 2000-2016 and 7,300 games of the strong AIs of 2016-2020, with a count for each era.
// Two views: a list of whole sequences (those many games stopped at) with tags for how much each era plays them, and
// an explorer that shows, at every point, the moves played next and how often each era chose them.
const Joseki = (() => {
  "use strict";
  const api = {}; // the game may set api.sound() and api.onBack()
  const $ = id => document.getElementById(id);
  let DATA = null, loading = null, wired = false, LINES = null;
  const ERA = [{ k: 0, t: "ยุคเก่า", s: "1940–1999" }, { k: 1, t: "ก่อน AI", s: "2000–2016" }, { k: 2, t: "ยุค AI", s: "2016–2020" }];
  // the corner's first stone, from the top-left corner: x along the top edge, y down the left edge
  const FAM = { dd: "หมากดาว 4-4", dc: "โคโมคุ 3-4", cc: "ซันซัง 3-3", ed: "ทาคาโมคุ 5-4", ec: "โมคุฮาสุ 5-3" };
  // names for the moves that start the common lines (the longest matching start names a sequence)
  const NAMES = {
    "dd": "หมากดาว 4-4",
    "dd fc": "ประกบม้าเล็ก", "dd gc": "ประกบม้าใหญ่", "dd fd": "ประกบสูง", "dd cc": "บุกซันซัง 3-3", "dd tt": "ดำเล่นมุมนี้ต่อ",
    "dd tt fc": "ปิดมุมม้าเล็ก", "dd tt gc": "ปิดมุมม้าใหญ่", "dd tt fd": "ปิดมุมกระโดด", "dd tt jd": "กางข้าง", "dd tt jc": "กางข้าง",
    "dd fc cf": "ตอบม้าเล็ก", "dd fc df": "ตอบกระโดดหนึ่ง", "dd fc dg": "ตอบกระโดดสอง", "dd fc ec": "ติดหมากประกบ", "dd fc dc": "ตอบลงต่ำ",
    "dd fc tt": "ไม่ตอบ (เล่นที่อื่น)", "dd fc tt cf": "ประกบสองข้าง", "dd fc tt cc": "เข้าซันซัง",
    "dd fc hc": "หนีบต่ำหนึ่งช่อง", "dd fc ic": "หนีบต่ำสองช่อง", "dd fc jc": "หนีบต่ำสามช่อง",
    "dd fc hd": "หนีบสูงหนึ่งช่อง", "dd fc id": "หนีบสูงสองช่อง", "dd fc jd": "หนีบสูงสามช่อง",
    "dd fc cf db cc": "ไถลเข้ามุม", "dd fc cf db": "ไถลเข้ามุม", "dd fc hc cc": "หนีบแล้วเข้าซันซัง", "dd fc ic cc": "หนีบแล้วเข้าซันซัง",
    "dd fc hc tt": "หนีบแล้วไม่ตอบ", "dd fc dc cc": "ตอบลงต่ำ แล้วเข้ามุม",
    "dd cc dc": "ดำปิดทาง",
    "dc": "โคโมคุ 3-4",
    "dc ce": "ประกบม้าเล็ก", "dc de": "ประกบสูงหนึ่งช่อง", "dc cf": "ประกบม้าใหญ่", "dc df": "ประกบสูงสองช่อง", "dc tt": "ดำเล่นมุมนี้ต่อ",
    "dc tt ce": "ปิดมุมม้าเล็ก", "dc tt cf": "ปิดมุมม้าใหญ่", "dc tt de": "ปิดมุมกระโดดหนึ่ง", "dc tt df": "ปิดมุมกระโดดสอง",
    "dc ce dh": "หนีบสูงสองช่อง", "dc ce ch": "หนีบต่ำสองช่อง", "dc ce dg": "หนีบสูงหนึ่งช่อง", "dc ce cg": "หนีบต่ำหนึ่งช่อง",
    "dc ce ci": "หนีบต่ำสามช่อง", "dc ce di": "หนีบสูงสามช่อง", "dc ce cj": "กางข้างไกล",
    "dc ce ed": "ทแยง (โคซูมิ)", "dc ce fd": "ตอบม้าเล็ก", "dc ce cd": "ติดหมากประกบ", "dc ce de": "กดหัวหมากประกบ", "dc ce tt": "ไม่ตอบ (เล่นที่อื่น)",
    "dc de ce": "ติดใต้", "dc de ce cf cd dg": "ติด-ยืด (พื้นฐาน)", "dc de ce cf cd": "ติด-ยืด", "dc de fd": "ตอบม้าเล็ก", "dc de dd": "ดันขึ้น",
    "dc de tt": "ไม่ตอบ (เล่นที่อื่น)", "dc cf tt": "ไม่ตอบ (เล่นที่อื่น)", "dc df tt": "ไม่ตอบ (เล่นที่อื่น)",
    "cc": "ซันซัง 3-3", "cc dd": "กดไหล่", "cc tt": "ดำเล่นมุมนี้ต่อ",
    "ed": "ทาคาโมคุ 5-4", "ed dc": "เข้าใต้ 3-4", "ed tt": "ดำเล่นมุมนี้ต่อ",
    "ec": "โมคุฮาสุ 5-3", "ec dd": "ประกบ 4-4", "ec dc": "ประกบ 3-4", "ec tt": "ดำเล่นมุมนี้ต่อ"
  };
  const nameOf = path => {
    for (let k = path.length; k > 0; k--) { const n = NAMES[path.slice(0, k).join(" ")]; if (n) return { n, k }; }
    return { n: "", k: 0 };
  };
  // a sequence's title: the family, then the names along its start (at most two)
  function titleOf(path) {
    const parts = [];
    for (let k = 2; k <= path.length; k++) { const n = NAMES[path.slice(0, k).join(" ")]; if (n && !parts.includes(n)) parts.push(n); }
    const keep = parts.filter((n, i) => !parts.slice(i + 1).some(m => m.includes(n)));
    return keep.slice(-2).join(" · ") || "แปรผัน";
  }

  function fetchData() {
    if (DATA) return Promise.resolve(DATA);
    if (window.JOSEKI_DATA) { DATA = window.JOSEKI_DATA; return Promise.resolve(DATA); }
    if (!loading) loading = fetch("joseki.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => (DATA = d))
      .catch(e => { loading = null; throw e; });
    return loading;
  }
  const kids = n => n[4] || {};
  const nodeAt = path => { let n = DATA.t; for (const m of path) { n = kids(n)[m]; if (!n) return null; } return n; };
  const total = n => n[0] + n[1] + n[2];

  // ---------- tags ----------
  // per 1,000 games of an era, how often the corner sequence reached this point
  const rate = (n, e) => 1000 * n[e] / DATA.g[e];
  // a whole sequence: hot now / new with the AIs / out of fashion / classic
  function lineTag(n) {
    const a = rate(n, 2), old = Math.max(rate(n, 0), rate(n, 1));
    if (a >= 3 && a >= old * 3 && n[2] >= 10) return { c: "new", t: "มาแรงยุค AI" };
    if (a >= 3) return { c: "hot", t: "ยุคนี้นิยม" };
    if (old >= 1.5 && a <= old * .3) return { c: "old", t: "ตกยุค" };
    if (a >= 1 && a >= old * 3 && n[2] >= 6) return { c: "new", t: "มาแรงยุค AI" };
    return { c: "", t: "คลาสสิก" };
  }
  const stars = n => { const a = rate(n, 2); return a >= 10 ? 3 : a >= 3 ? 2 : a >= 1 ? 1 : 0; };
  // a next move: its share of what each era played at this point
  const share = (p, c, e) => p[e] >= 15 ? c[e] / p[e] : null;
  function moveTag(p, c) {
    const a = share(p, c, 2), old = Math.max(share(p, c, 0) || 0, share(p, c, 1) || 0);
    if (a === null) return { c: "", t: "" };
    if (a >= .08 && a >= old * 2.5 && c[2] >= 6) return { c: "new", t: "มาแรงยุค AI" };
    if (a >= .25) return { c: "hot", t: "ยุคนี้นิยม" };
    if (old >= .15 && a <= old * .35) return { c: "old", t: "ตกยุค" };
    return { c: "", t: "" };
  }

  // ---------- the stones of a sequence (with captures) ----------
  const N = 19;
  function stonesOf(path) {
    const b = new Int8Array(N * N), num = new Map(); let color = 1, k = 0, away = [];
    const nb = p => { const x = p % N, y = (p / N) | 0, o = []; if (x) o.push(p - 1); if (x < N - 1) o.push(p + 1); if (y) o.push(p - N); if (y < N - 1) o.push(p + N); return o; };
    const group = p => { const c = b[p], g = [p], seen = new Set(g); let libs = 0;
      for (let i = 0; i < g.length; i++) for (const q of nb(g[i])) { if (seen.has(q)) continue; seen.add(q); if (!b[q]) libs++; else if (b[q] === c) g.push(q); }
      return { g, libs }; };
    for (const m of path) {
      k++;
      if (m !== "tt") {
        const p = (m.charCodeAt(1) - 97) * N + (m.charCodeAt(0) - 97);
        b[p] = color; num.set(p, k);
        for (const q of nb(p)) if (b[q] === -color) { const gr = group(q); if (!gr.libs) for (const s of gr.g) { b[s] = 0; num.delete(s); } }
        const me = group(p); if (!me.libs) for (const s of me.g) { b[s] = 0; num.delete(s); }
      } else away.push(k);
      color = -color;
    }
    return { b, num, next: color, away };
  }

  function shapeWord(path, m) {
    if (m === "tt") return "เล่นที่อื่น (เทนูกิ)";
    const { b, next } = stonesOf(path), x = m.charCodeAt(0) - 97, y = m.charCodeAt(1) - 97, at = (i, j) => i < 0 || j < 0 || i >= N || j >= N ? 0 : b[j * N + i];
    const side = [[1, 0], [-1, 0], [0, 1], [0, -1]], diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const own = side.some(([i, j]) => at(x + i, y + j) === next), opp = side.some(([i, j]) => at(x + i, y + j) === -next);
    const oppD = diag.some(([i, j]) => at(x + i, y + j) === -next), ownD = diag.some(([i, j]) => at(x + i, y + j) === next);
    const line = Math.min(x, y) + 1;
    if (opp && !own && ownD) return "ฮาเนะ";
    if (opp && !own) return "ติด";
    if (opp && own) return "ดัน / ยืด";
    if (own && oppD) return "ฮาเนะ / ปิด";
    if (own) return "ยืด / ต่อ";
    if (ownD) return "ทแยง";
    if (oppD) return "ทแยงชนหมากอีกฝ่าย";
    return `ตาห่าง (แนวที่ ${line})`;
  }

  // ---------- drawing (shown as the top-right corner) ----------
  const SZ = 11; // points shown each way
  const dx = x => N - 1 - x; // stored top-left, shown top-right
  let svgId = 0;
  function boardSVG(path, opts = {}) {
    const id = "js" + (++svgId), { b, num } = stonesOf(path), s = [], x0 = N - SZ, vx = x0 - .7, vy = -.7, vw = SZ + .2, vh = SZ + .2;
    s.push(`<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="var(--wood)"/>`);
    for (let k = 0; k < SZ; k++) {
      s.push(`<line x1="${x0 - .7}" y1="${k}" x2="18" y2="${k}" stroke="#4a2a12" stroke-width="${k === 0 ? .07 : .04}"/>`);
      s.push(`<line x1="${x0 + k}" y1="0" x2="${x0 + k}" y2="${SZ - .3}" stroke="#4a2a12" stroke-width="${x0 + k === 18 ? .07 : .04}"/>`);
    }
    for (const [x, y] of [[15, 3], [9, 3], [15, 9], [9, 9]]) s.push(`<circle cx="${x}" cy="${y}" r=".1" fill="#4a2a12"/>`);
    const lastK = path.length;
    for (let p = 0; p < N * N; p++) {
      if (!b[p]) continue;
      const x = dx(p % N), y = (p / N) | 0; if (x < x0 || y >= SZ) continue;
      s.push(`<circle cx="${x}" cy="${y}" r=".47" fill="url(#${id}${b[p] > 0 ? "b" : "w"})" stroke="${b[p] > 0 ? "#000" : "#9c917e"}" stroke-width=".02"/>`);
      const k = num.get(p);
      if (opts.nums !== false && k) s.push(`<text x="${x}" y="${y + .04}" class="js-num${k > 9 ? " sm" : ""}" fill="${b[p] > 0 ? "#f3ead8" : "#1a1208"}">${k}</text>`);
      else if (opts.nums === false && k === lastK) s.push(`<circle cx="${x}" cy="${y}" r=".17" fill="none" stroke="${b[p] > 0 ? "#f3ead8" : "#2a1a0b"}" stroke-width=".07"/>`);
    }
    if (opts.marks) for (const m of opts.marks) {
      const x = dx(m.m.charCodeAt(0) - 97), y = m.m.charCodeAt(1) - 97;
      s.push(`<g class="js-mk ${m.c}" data-m="${m.m}"><circle cx="${x}" cy="${y}" r=".42"/><text x="${x}" y="${y + .04}" class="js-num">${m.l}</text></g>`);
    }
    return `<svg viewBox="${vx} ${vy} ${vw} ${vh}" class="${opts.cls || ""}" role="img" aria-label="กระดานมุมขวาบน">
      <defs><radialGradient id="${id}b" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#5b5b5b"/><stop offset="1" stop-color="#0d0d0d"/></radialGradient>
      <radialGradient id="${id}w" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfc6b4"/></radialGradient></defs>${s.join("")}</svg>`;
  }
  const bars = (vals, cls = "") => `<span class="js-bars ${cls}">${ERA.map((e, i) => {
    const v = vals[i]; return `<span class="js-bar e${i}" title="${e.t} ${e.s}"><i style="width:${v === null ? 0 : Math.max(2, Math.min(100, v * 100))}%"></i><em>${v === null ? "–" : Math.round(v * 100) + "%"}</em></span>`;
  }).join("")}</span>`;
  const tagHTML = t => t.t ? `<span class="js-tag ${t.c}">${t.t}</span>` : "";

  // ---------- the list of whole sequences ----------
  // a sequence is a point many games stopped at (a quarter of the games that got there), four or more stones long
  function buildLines() {
    const out = [];
    (function walk(n, path) {
      for (const [m, c] of Object.entries(kids(n))) {
        const p = path.concat(m), stones = p.filter(x => x !== "tt").length, t = total(c);
        if (stones >= 4 && m !== "tt" && t >= 30 && c[3] / t >= .25) out.push({ path: p, n: c });
        walk(c, p);
      }
    })(DATA.t, []);
    return out;
  }
  const UI = { tab: "list", fam: "all", sort: 2, only: "", shown: 60, path: [], from: null };
  function renderList() {
    if (!LINES) LINES = buildLines();
    let ls = LINES.filter(l => UI.fam === "all" || l.path[0] === UI.fam);
    if (UI.only) ls = ls.filter(l => lineTag(l.n).c === UI.only || (UI.only === "hot" && lineTag(l.n).c === "new"));
    const key = UI.sort === 3 ? l => l.path.length : l => rate(l.n, UI.sort);
    ls.sort((a, b) => key(b) - key(a) || total(b.n) - total(a.n));
    $("jsCount").textContent = `${ls.length.toLocaleString()} โจเซกิ`;
    $("jsList").innerHTML = ls.slice(0, UI.shown).map((l, i) => {
      const t = lineTag(l.n), st = stars(l.n), len = l.path.filter(x => x !== "tt").length;
      return `<button class="js-card" data-i="${LINES.indexOf(l)}">${boardSVG(l.path, { cls: "js-mini", nums: false })}
        <span class="js-cbody"><small>${FAM[l.path[0]]}</small><b>${titleOf(l.path)}</b>
        <span class="js-meta">${len} ตา${st ? ` · <span class="js-star" title="ความนิยมยุคนี้">${"★".repeat(st)}${"☆".repeat(3 - st)}</span>` : ""} ${tagHTML(t)}</span>
        <span class="js-rates"><span>ต่อ 1,000 เกม:</span>${ERA.map((e, k) => `<span>${e.t} <b>${rate(l.n, k).toFixed(1)}</b></span>`).join("")}</span></span></button>`;
    }).join("") + (ls.length > UI.shown ? `<button class="js-more" id="jsMore">ดูเพิ่ม (${(ls.length - UI.shown).toLocaleString()})</button>` : "");
    const more = $("jsMore"); if (more) more.onclick = () => { UI.shown += 60; renderList(); };
  }

  // ---------- the explorer ----------
  function renderExplore() {
    const path = UI.path, n = path.length ? nodeAt(path) : DATA.t;
    const all = Object.entries(kids(n)).filter(([m]) => path.length || FAM[m]);
    // moves under 1% in every era wait behind a button
    const often = ([m, c]) => ERA.some((e, k) => n[k] >= 15 && c[k] / n[k] >= .01) || moveTag(n, c).t;
    const ch = UI.rare ? all : all.filter(often), rare = all.length - ch.length;
    const opts = ch.map(([m, c], i) => ({ m, c, l: m === "tt" ? "–" : (i < 26 ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i] : "·"), tag: moveTag(n, c) }));
    const marks = opts.filter(o => o.m !== "tt").map(o => ({ m: o.m, l: o.l, c: o.tag.c || "plain" }));
    const st = stonesOf(path), who = st.next > 0 ? "ดำ" : "ขาว";
    $("jsBoard").innerHTML = boardSVG(path, { marks, cls: "js-big" });
    const nm = path.length ? titleOf(path) : "เลือกตาแรกของมุม";
    $("jsName").innerHTML = path.length ? `<small>${FAM[path[0]]}</small>${nm}` : nm;
    const t = path.length ? total(n) : 0, ends = path.length ? n[3] / Math.max(1, t) : 0;
    $("jsInfo").innerHTML = path.length
      ? `ตำแหน่งนี้พบ <b>${t.toLocaleString()}</b> ครั้ง (${ERA.map((e, k) => `${e.t} ${n[k].toLocaleString()}`).join(" · ")})` +
        (st.away.length ? `<br>ตา ${st.away.join(", ")} เล่นที่อื่นบนกระดาน` : "") +
        (ends >= .25 ? `<br><b class="js-end">จบโจเซกิได้ตรงนี้</b> ${Math.round(ends * 100)}% ของเกมหยุดเล่นมุมนี้ที่จุดนี้` : "")
      : "หมากดาว โคโมคุ ซันซัง ทาคาโมคุ หรือโมคุฮาสุ แตะตัวอักษรบนกระดานหรือเลือกจากรายการ";
    $("jsTurn").textContent = all.length ? `ตาต่อไป: ${who}เดิน · ${all.length} ทางที่เคยเล่น` : "ไม่มีข้อมูลตาต่อจากนี้ (เกมส่วนใหญ่ไปเล่นที่อื่น)";
    $("jsNext").innerHTML = opts.map(o => {
      const nmv = NAMES[path.concat(o.m).join(" ")] || (path.length ? shapeWord(path, o.m) : "");
      return `<button class="js-opt ${o.tag.c}" data-m="${o.m}"><span class="js-l">${o.l}</span><span class="js-on"><b>${nmv}</b>${tagHTML(o.tag)}</span>
        ${bars(ERA.map((e, k) => path.length ? share(n, o.c, k) : o.c[k] / n[k]))}</button>`;
    }).join("") + (rare ? `<button class="js-more" id="jsRare">ดูตาที่พบน้อยอีก ${rare} ตา</button>` : "");
    if (rare) $("jsRare").onclick = () => { UI.rare = true; renderExplore(); };
    $("jsBack1").disabled = $("jsHome").disabled = !path.length;
    $("jsBest").disabled = !opts.length;
  }
  function go(m) { if (api.sound) api.sound(); UI.path = UI.path.concat(m); UI.rare = false; renderExplore(); }
  function show() {
    $("jsTabList").classList.toggle("on", UI.tab === "list"); $("jsTabExp").classList.toggle("on", UI.tab === "exp");
    $("jsListBox").hidden = UI.tab !== "list"; $("jsExpBox").hidden = UI.tab !== "exp";
    if (UI.tab === "list") renderList(); else renderExplore();
  }

  function wire() {
    wired = true;
    $("jsTabList").onclick = () => { UI.tab = "list"; show(); };
    $("jsTabExp").onclick = () => { UI.tab = "exp"; show(); };
    $("jsFams").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return;
      UI.fam = b.dataset.f; UI.shown = 60; for (const x of $("jsFams").children) x.classList.toggle("on", x === b); renderList(); });
    $("jsSort").onchange = e => { UI.sort = +e.target.value; UI.shown = 60; renderList(); };
    $("jsOnly").onchange = e => { UI.only = e.target.value; UI.shown = 60; renderList(); };
    $("jsList").addEventListener("click", e => { const b = e.target.closest(".js-card"); if (!b) return;
      UI.path = LINES[+b.dataset.i].path.slice(); UI.tab = "exp"; show(); window.scrollTo(0, 0); });
    $("jsNext").addEventListener("click", e => { const b = e.target.closest(".js-opt"); if (b) go(b.dataset.m); });
    $("jsBoard").addEventListener("click", e => { const g = e.target.closest(".js-mk"); if (g) go(g.dataset.m); });
    $("jsBack1").onclick = () => { UI.path = UI.path.slice(0, -1); UI.rare = false; renderExplore(); };
    $("jsHome").onclick = () => { UI.path = []; UI.rare = false; renderExplore(); };
    // the move played most in the AI era (or in any era when the AIs have no games here)
    $("jsBest").onclick = () => {
      const n = UI.path.length ? nodeAt(UI.path) : DATA.t, ch = Object.entries(kids(n)).filter(([m]) => UI.path.length || FAM[m]);
      if (!ch.length) return;
      ch.sort((a, b) => (b[1][2] - a[1][2]) || (total(b[1]) - total(a[1])));
      go(ch[0][0]);
    };
    $("jsBack").onclick = () => { $("jsel").hidden = true; if (api.onBack) api.onBack(); };
  }
  api.open = async () => {
    if (!wired) wire();
    $("jsel").hidden = false; $("jsList").innerHTML = `<p class="ts-dim">กำลังโหลดคลังโจเซกิ…</p>`;
    try { await fetchData(); show(); }
    catch (e) { $("jsList").innerHTML = `<p class="ts-dim">โหลดข้อมูลไม่สำเร็จ ลองเปิดใหม่อีกครั้ง</p>`; }
    window.scrollTo(0, 0);
  };
  api._lines = () => (LINES || (LINES = buildLines())).length; // for tests
  return api;
})();
