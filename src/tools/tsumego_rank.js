// Usage: serve the repo on :8123, then node tsumego_rank.js pool.json prior.json (pool.json from tsumego_pool.py).
// Policy prior of the book answer for every candidate, from the site's own KataGo running in headless Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const pool = JSON.parse(fs.readFileSync(process.argv[2]));
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8123/index.html');
  await p.waitForFunction(() => typeof Analysis !== 'undefined' && Analysis.ai && Analysis.ai(), null, { timeout: 180000 });
  const out = await p.evaluate(async pool => {
    const { Board, PASS } = Analysis.E, ai = Analysis.ai();
    const c2 = s => [s.charCodeAt(0) - 97, s.charCodeAt(1) - 97];
    const res = [];
    for (let s = 0; s < pool.length; s += 16) {
      const batch = pool.slice(s, s + 16), lists = [];
      for (const q of batch) {
        const b = new Board(19), pt = s => b.pt(...c2(s));
        const enc = lead => { const B = q.AB.map(pt), W = q.AW.map(pt), m = lead ? [PASS] : []; let i = 0, j = 0;
          while (i < B.length || j < W.length) { if (m.length % 2 === 0) m.push(i < B.length ? B[i++] : PASS); else m.push(j < W.length ? W[j++] : PASS); }
          if ((m.length % 2 === 0 ? "B" : "W") !== q.to) m.push(PASS); return m; };
        const ok = m => !m.some((x, k) => x === PASS && m[k - 1] === PASS);
        let m = enc(false); if (!ok(m)) m = enc(true);
        q.moves = m; lists.push(m);
      }
      const evs = await ai.evalMany(19, lists, 7.5);
      batch.forEach((q, k) => {
        const ev = evs[k], xs = [], ys = [];
        for (const s of q.AB.concat(q.AW, q.sol)) { const [x, y] = c2(s); xs.push(x); ys.push(y); }
        const x0 = Math.max(0, Math.min(...xs) - 2), x1 = Math.min(18, Math.max(...xs) + 2), y0 = Math.max(0, Math.min(...ys) - 2), y1 = Math.min(18, Math.max(...ys) + 2);
        let tot = 0, best = -1, bp = -1;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = ev.policy[y * 19 + x]; tot += v; if (v > bp) { bp = v; best = y * 19 + x; } }
        const solIdx = q.sol.map(s => { const [x, y] = c2(s); return y * 19 + x; });
        const prior = solIdx.reduce((a, i) => a + ev.policy[i], 0) / (tot || 1);
        res.push({ i: s + k, prior, top: solIdx.includes(best), legal: solIdx.every(i => ev.legal[i]), pla: ev.pla, okTo: (ev.pla === 1 ? "B" : "W") === q.to, n: q.moves.length });
      });
    }
    return res;
  }, pool);
  fs.writeFileSync(process.argv[3], JSON.stringify(out));
  await b.close();
})();
