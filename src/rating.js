// The player's skill rating: the best rank test, plus or minus every finished game since (against the AI, online).
// Elo on the EGF scale: 1 kyu = 2000, 1 dan = 2100, 15 kyu = 600; one rank = 100 points (about a 64% win rate).
// Kept in localStorage gonn.rating { R, n: games counted, base: best exam rank it starts from, hist: [{ at, R, d: change, k: "ai"|"online"|"exam"|"tour", o: opponent, w: won }] }
// and synced with the account like the rest of the progress (src/account.js).
const Rating = (() => {
  const KEY = "gonn.rating", START = 600, KEEP = 300;
  // no ceiling at 9 dan any more (owner 2026-11-15: above 2900 is still 9 dan); MAX_R only stops a broken value
  const MAX_R = 5000;
  const get = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v.R === "number" ? v : null; } catch (e) { return null; } };
  const put = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const toR = rank => 2000 + 100 * rank;           // rank: 1 kyu = 0, 1 dan = 1, 15 kyu = -14 (rankName() scale)
  const toRank = R => (R - 2000) / 100;
  // "15 คิว" -> -14, "2 ดั้ง" -> 2, "1 ดั้งโปร" -> 7 (a professional is stronger than an amateur of the same number), else null
  function parseRank(s) {
    const m = /^(\d+)\s*(คิว|ดั้ง)(โปร)?/.exec(String(s || ""));
    if (!m) return null;
    const v = +m[1];
    return m[2] === "คิว" ? 1 - v : m[3] ? Math.min(9, v + 6) : v;
  }
  // provisional ratings move fast so a strong newcomer climbs quickly; small boards say less about strength
  const kOf = (n, size) => (n < 5 ? 150 : n < 15 ? 60 : 32) * (size >= 19 ? 1 : size >= 13 ? 0.6 : 0.4);
  // a win against an AI character counts double (owner 2026-11-15: beating the bots should give more); losses stay as they are
  const AI_WIN = 2;
  function update(oppR, won, size, kind, label, at) {
    const cur = get() || { R: START, n: 0, hist: [] };
    const exp = 1 / (1 + Math.pow(10, (oppR - cur.R) / 400));
    const d = Math.round(kOf(cur.n, size) * ((won ? 1 : 0) - exp) * (won && kind === "ai" ? AI_WIN : 1));
    cur.R = Math.max(100, Math.min(MAX_R, cur.R + d)); cur.n++;
    cur.hist.push({ at: at || Date.now(), R: cur.R, d, k: kind, o: label, w: !!won });
    cur.hist = cur.hist.slice(-KEEP);
    put(cur);
    return cur;
  }
  // the best rank test is the starting point (owner 2026-11-11): the rating is that rank plus whatever the games played
  // since that test added or took away. A better test result moves the base up; a worse one leaves it.
  // best = { rank, at } (the player's best exam). Also fixes up ratings made before this rule.
  function anchor(best) {
    if (!best || typeof best.rank !== "number") return get();
    const cur = get();
    if (cur && typeof cur.base === "number" && best.rank <= cur.base) return cur;
    const v = cur || { R: START, n: 0, hist: [] }, at = best.at || Date.now();
    const since = v.hist.filter(h => h.k !== "exam" && h.at > at).reduce((a, h) => a + (h.d || 0), 0);
    const R = Math.max(100, Math.min(MAX_R, toR(best.rank) + since)), d = R - v.R;
    v.R = R; v.base = best.rank; v.n = Math.max(v.n, 5); // a tested player is not a newcomer: normal steps from here
    v.hist = v.hist.filter(h => !(h.k === "exam" && h.at >= at));
    v.hist.push({ at, R: toR(best.rank), d, k: "exam", o: "ฮิคารุ (สอบวัดระดับ)", w: null });
    v.hist.sort((x, y) => x.at - y.at);
    // later points on the graph follow the new base
    let r = toR(best.rank); for (const h of v.hist) if (h.at > at) { r = Math.max(100, Math.min(MAX_R, r + (h.d || 0))); h.R = r; }
    v.hist = v.hist.slice(-KEEP);
    put(v);
    return v;
  }
  // two copies (this device, the account) joined. When one already holds the other's latest game it is simply the newer
  // copy of the same progress and wins. Otherwise they grew apart (a device played as a guest, then signed in): the
  // higher rating is kept with its own graph (owner 2026-11-11: keep the best when accounts are linked).
  function merge(a, b) {
    if (!a) return b || null; if (!b) return a;
    const key = h => h.at + ":" + h.k, ha = a.hist || [], hb = b.hist || [];
    const has = (list, h) => !h || list.some(e => key(e) === key(h));
    const la = ha[ha.length - 1], lb = hb[hb.length - 1];
    let main, hist;
    if (has(ha, lb) || has(hb, la)) {
      main = has(ha, lb) ? a : b;
      const seen = new Set(); hist = [];
      for (const h of ha.concat(hb).sort((x, y) => x.at - y.at)) { const k = key(h); if (!seen.has(k)) { seen.add(k); hist.push(h); } }
    } else {
      main = (b.R || 0) > (a.R || 0) ? b : a;
      hist = (main.hist || []).slice();
    }
    const base = Math.max(typeof a.base === "number" ? a.base : -99, typeof b.base === "number" ? b.base : -99);
    const out = { R: main.R, n: Math.max(a.n || 0, b.n || 0), hist: hist.slice(-KEEP) };
    if (base > -99) out.base = base;
    return out;
  }
  // points the server awarded (tournament places, worker/tourney.js): each { id, d, o, at } is added once, at its own
  // time in the graph (games after it move up or down with it). Returns true when something was added.
  function bonus(list) {
    if (!Array.isArray(list) || !list.length) return false;
    const cur = get() || { R: START, n: 0, hist: [] };
    let added = false;
    for (const b of list) {
      if (!b || typeof b.id !== "string" || typeof b.d !== "number" || cur.hist.some(h => h.k === "tour" && h.id === b.id)) continue;
      const at = b.at || Date.now(), i = cur.hist.findIndex(h => h.at > at), before = i < 0 ? cur.R : cur.hist[i].R - (cur.hist[i].d || 0);
      const e = { at, R: Math.max(100, Math.min(MAX_R, before + b.d)), d: b.d, k: "tour", o: String(b.o || "ทัวร์นาเมนต์"), w: true, id: b.id };
      if (i < 0) cur.hist.push(e); else { cur.hist.splice(i, 0, e); for (let j = i + 1; j < cur.hist.length; j++) cur.hist[j].R = Math.max(100, Math.min(MAX_R, cur.hist[j].R + b.d)); }
      cur.R = Math.max(100, Math.min(MAX_R, cur.R + b.d));
      added = true;
    }
    if (added) { cur.hist = cur.hist.slice(-KEEP); put(cur); }
    return added;
  }
  const last = v => v.hist && v.hist.length ? v.hist[v.hist.length - 1].at : 0;
  return { get, toR, toRank, parseRank, update, anchor, merge, bonus, START, rank: () => { const v = get(); return v ? toRank(v.R) : null; } };
})();
