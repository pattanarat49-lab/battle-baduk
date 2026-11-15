// The weekly TOURNAMENT: players press Join any time before Sunday 19:00 (Thai time); at 19:00 the entrants are drawn
// into a random single-elimination bracket and every game is an online room the server starts by itself (19×19,
// 15 min + one byo-yomi period of 30 s, Japanese rules, komi 6.5). A lost game knocks the player out; the winners meet in the next
// round as soon as both are free, and the two semi-final losers play for third place at the same time as the final.
// Prizes (owner 2026-11-15): 1st +100 rating and the title "Champion of Tournament ครั้งที่ N", 2nd +50, 3rd +25.
// Like acct.js and online.js this runs in the Accounts Durable Object (and in a test page); everything is in `store`:
//   "tour"  { cur: the tournament taking entries or being played, last: the one before, champs: [{ no, n, a, at }] }
//   a tournament: { no, at: start time, st: "signup"|"play"|"done"|"off", ents: [player], rounds: [[match]], third: match|null,
//                   res: { first, second, third } names, ended }
//   a match: { a: player|null, b: player|null, room: id|null, w: "a"|"b"|null, how }   (player = { n, r, R, a, t })
// Nothing runs on a timer here: tick(now) does whatever is due (start at 19:00, clocks of the games). The Durable
// Object calls it from an alarm (wake() says when), and every look at the tournament page calls it too.
const SET = { size: 19, main: 900, byo: 30, per: 1 }; // owner 2026-11-15: 15 min + one 30 s byo-yomi, tournament only
const MAX = 64, PRIZE = [100, 50, 25];
const DAY = 86400e3, WEEK = 7 * DAY;
// the next Sunday 19:00 in Thailand (UTC+7, no daylight saving) = Sunday 12:00 UTC (owner 2026-11-15), after `now`
function nextStart(now) {
  const d = new Date(now), base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
  let t = base + ((7 - d.getUTCDay()) % 7) * DAY;
  if (t <= now) t += WEEK;
  return t;
}
const champTitle = no => ({ id: "champ-" + no, t: `Champion of Tournament ครั้งที่ ${no}` });
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const winner = m => m && m.w ? m[m.w] : null;
const loser = m => m && m.w && m.how !== "bye" ? m[m.w === "a" ? "b" : "a"] : null;

export function makeTourney(store, acct, online) {
  const err = (status, msg) => ({ status, body: { error: msg } });
  const ok = (body, changed) => ({ status: 200, body, changed: changed || [] });
  const fresh = (no, now, ents) => ({ no, at: nextStart(now), st: "signup", ents: ents || [], rounds: [], third: null, res: null });
  async function load(now) {
    let T = await store.get("tour");
    if (!T) { T = { cur: fresh(1, now), last: null, champs: [] }; await store.put("tour", T); }
    return T;
  }
  const save = async T => { await store.put("tour", T); return ["tour"]; };

  // a game between the two players of a match (or straight through when one of them is missing)
  async function begin(t, m, rd, i) {
    if (!m.a || !m.b) { m.w = m.a ? "a" : "b"; m.how = "bye"; return; }
    const r = await online.startGame(m.a, m.b, { no: t.no, rd, m: i }, SET);
    m.room = r.id;
  }
  // fills every match whose two players are known, starts their games, and settles the places once the last game is over
  async function advance(t, now) {
    const R = t.rounds.length;
    for (let k = 1; k < R; k++) {
      for (let i = 0; i < t.rounds[k].length; i++) {
        const m = t.rounds[k][i];
        if (m.room || m.w) continue;
        const x = t.rounds[k - 1][2 * i], y = t.rounds[k - 1][2 * i + 1];
        if (!x.w || !y.w) continue;
        m.a = winner(x); m.b = winner(y);
        await begin(t, m, k, i);
      }
    }
    // third place: the two semi-final losers, once both semi-finals are over (with a single loser, that player is third)
    if (R >= 2 && !t.third) {
      const semi = t.rounds[R - 2];
      if (semi.every(m => m.w)) {
        const ls = semi.map(loser).filter(Boolean);
        if (ls.length === 2) { t.third = { a: ls[0], b: ls[1], room: null, w: null, how: null }; await begin(t, t.third, "3rd", 0); }
        else if (ls.length === 1) t.third = { a: ls[0], b: null, room: null, w: "a", how: "bye" };
        else t.third = { a: null, b: null, room: null, w: "a", how: "none" };
      }
    }
    const fin = t.rounds[R - 1][0];
    if (fin.w && (R < 2 || (t.third && t.third.w))) {
      t.st = "done"; t.ended = now;
      t.res = { first: winner(fin).n, second: loser(fin) ? loser(fin).n : null, third: R >= 2 ? (winner(t.third) || {}).n || null : null };
      const places = [t.res.first, t.res.second, t.res.third];
      for (let p = 0; p < 3; p++) if (places[p]) await acct.award(places[p], { id: `tour-${t.no}`, d: PRIZE[p], o: `ทัวร์นาเมนต์ครั้งที่ ${t.no} อันดับ ${p + 1}`, at: now, title: p === 0 ? champTitle(t.no) : null });
    }
  }
  // 19:00: the draw. Every entrant gets a random place; byes (when the number is not a power of two) are spread so
  // that no match is two byes, and a player with a bye simply goes through to the next round
  async function start(T, now) {
    const t = T.cur;
    if (t.ents.length < 2) { // not enough players: the same tournament moves to next week, entries kept
      t.at = nextStart(now); t.note = "คนสมัครไม่ถึง 2 คน เลื่อนไปสัปดาห์หน้า";
      return;
    }
    const ents = shuffle(await Promise.all(t.ents.map(async e => (await acct.userByName(e.n)) || e)));
    let P = 2; while (P < ents.length) P *= 2;
    const half = P / 2, first = [];
    for (let i = 0; i < half; i++) first.push({ a: ents[i], b: ents[i + half] || null, room: null, w: null, how: null });
    shuffle(first);
    t.rounds = [first];
    for (let n = half / 2; n >= 1; n /= 2) t.rounds.push(Array.from({ length: n }, () => ({ a: null, b: null, room: null, w: null, how: null })));
    t.st = "play"; t.began = now; delete t.note;
    for (let i = 0; i < first.length; i++) await begin(t, first[i], 0, i);
    await advance(t, now);
  }
  // a finished tournament goes to "last" and the next week's one opens for entries
  function roll(T, now) {
    const t = T.cur;
    if (t.res && t.res.first) T.champs = [{ no: t.no, n: t.res.first, a: (winner(t.rounds[t.rounds.length - 1][0]) || {}).a || null, at: t.ended }].concat(T.champs || []).slice(0, 100);
    T.last = t; T.cur = fresh(t.no + 1, now);
  }
  const matches = t => t.rounds.flat().concat(t.third ? [t.third] : []);
  // whatever is due now; returns the store keys that changed
  async function tick(now) {
    const T = await load(now), t = T.cur, changed = [];
    if (t.st === "signup" && now >= t.at) { await start(T, now); changed.push(...await save(T)); }
    if (T.cur.st === "play") {
      // clocks: a game whose player ran out of time (or never came) ends here even when nobody is looking at it;
      // ending it runs onEnd below, which saves the bracket itself
      for (const m of matches(T.cur)) if (m.room && !m.w) changed.push(...await online.checkGame(m.room, now));
    }
    const T2 = await store.get("tour");
    if (T2.cur.st === "done") { roll(T2, now); changed.push(...await save(T2)); }
    return [...new Set(changed)];
  }
  // a tournament game ended (online.js saveRoom): record the winner and move on
  async function onEnd(r) {
    const T = await store.get("tour"), t = T && T.cur;
    if (!t || t.st !== "play" || t.no !== r.tour.no) return [];
    const m = r.tour.rd === "3rd" ? t.third : t.rounds[r.tour.rd] && t.rounds[r.tour.rd][r.tour.m];
    if (!m || m.room !== r.id || m.w) return [];
    const wn = r.res.winner === "b" ? r.black : r.white;
    m.w = m.a.n === wn ? "a" : "b"; m.how = r.res.how; m.margin = r.res.margin;
    await advance(t, Date.now());
    if (t.st === "done") roll(T, Date.now());
    return await save(T);
  }
  // when the Durable Object should wake up next: every minute while games are on (their clocks), else at the start
  async function wake() {
    const T = await store.get("tour");
    if (!T) return null;
    return T.cur.st === "play" ? Date.now() + 60e3 : T.cur.at;
  }

  const ops = {
    async tour() {
      const now = Date.now(), changed = await tick(now), T = await store.get("tour");
      return ok({ cur: T.cur, last: T.last, champs: T.champs || [], now }, changed);
    },
    async tourJoin(b) {
      const u = await acct.userOf(b.token);
      if (!u) return err(401, "ล็อกอินก่อนถึงจะ Join ได้");
      const now = Date.now(), T = await load(now), t = T.cur;
      if (t.st !== "signup" || now >= t.at) return err(409, "ทัวร์นาเมนต์เริ่มไปแล้ว รอ Join ครั้งหน้านะ");
      if (t.ents.some(e => e.n === u.n)) return ok({ cur: t });
      if (t.ents.length >= MAX) return err(409, `ทัวร์นาเมนต์เต็มแล้ว (${MAX} คน)`);
      t.ents.push(Object.assign({}, u, { at: now }));
      return ok({ cur: t }, await save(T));
    },
    async tourLeave(b) {
      const u = await acct.userOf(b.token);
      if (!u) return err(401, "ล็อกอินก่อน");
      const now = Date.now(), T = await load(now), t = T.cur;
      if (t.st !== "signup") return err(409, "ทัวร์นาเมนต์เริ่มไปแล้ว ถอนตัวไม่ได้");
      const n = t.ents.length; t.ents = t.ents.filter(e => e.n !== u.n);
      return ok({ cur: t }, n === t.ents.length ? [] : await save(T));
    },
    // the alarm of the Durable Object (and tests): whatever is due
    async tourTick() { return ok({}, await tick(Date.now())); }
  };
  async function handle(op, body) {
    const f = Object.prototype.hasOwnProperty.call(ops, op) && ops[op];
    if (!f) return null;
    return await f(body && typeof body === "object" ? body : {});
  }
  handle.onEnd = onEnd;
  handle.wake = wake;
  return handle;
}
export { nextStart };
