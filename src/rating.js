// The player's skill rating, moved by every finished game (against the AI, online) and by rank tests.
// Elo on the EGF scale: 1 kyu = 2000, 1 dan = 2100, 15 kyu = 600; one rank = 100 points (about a 64% win rate).
// Kept in localStorage gonn.rating { R, n: games counted, hist: [{ at, R, d: change, k: "ai"|"online"|"exam", o: opponent, w: won }] }
// and synced with the account like the rest of the progress (src/account.js).
const Rating = (() => {
  const KEY = "gonn.rating", START = 600, KEEP = 300;
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
  function update(oppR, won, size, kind, label, at) {
    const cur = get() || { R: START, n: 0, hist: [] };
    const exp = 1 / (1 + Math.pow(10, (oppR - cur.R) / 400));
    const d = Math.round(kOf(cur.n, size) * ((won ? 1 : 0) - exp));
    cur.R = Math.max(100, Math.min(2900, cur.R + d)); cur.n++;
    cur.hist.push({ at: at || Date.now(), R: cur.R, d, k: kind, o: label, w: !!won });
    cur.hist = cur.hist.slice(-KEEP);
    put(cur);
    return cur;
  }
  // a rank test is a direct measure: a new player starts there, later tests pull the rating halfway toward it
  function exam(est, at) {
    const cur = get(), Re = toR(est);
    const R = !cur || cur.n < 5 ? Re : Math.round((cur.R + Re) / 2);
    const v = cur || { R, n: 0, hist: [] };
    const d = R - v.R; v.R = R;
    v.hist.push({ at: at || Date.now(), R, d, k: "exam", o: "ฮิคารุ (สอบวัดระดับ)", w: null });
    v.hist = v.hist.slice(-KEEP);
    put(v);
    return v;
  }
  // two copies (this device, the account) joined: the one with more games counted wins, histories are combined
  function merge(a, b) {
    if (!a) return b || null; if (!b) return a;
    const main = (b.n || 0) > (a.n || 0) || ((b.n || 0) === (a.n || 0) && (last(b) > last(a))) ? b : a;
    const seen = new Set(), hist = [];
    for (const h of (a.hist || []).concat(b.hist || []).sort((x, y) => x.at - y.at)) { const k = h.at + ":" + h.k; if (!seen.has(k)) { seen.add(k); hist.push(h); } }
    return { R: main.R, n: Math.max(a.n || 0, b.n || 0), hist: hist.slice(-KEEP) };
  }
  const last = v => v.hist && v.hist.length ? v.hist[v.hist.length - 1].at : 0;
  return { get, toR, toRank, parseRank, update, exam, merge, START, rank: () => { const v = get(); return v ? toRank(v.R) : null; } };
})();
