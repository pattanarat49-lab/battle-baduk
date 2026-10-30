// Work out each problem's answer line with the site's own KataGo: the player's book answer, then the opponent's best
// reply and the player's best answer in turn, inside the problem area, until one side's best move is elsewhere.
const { chromium } = require('playwright');
const fs = require('fs');
const [, , inFile, shard, shards, outFile, visits] = process.argv;
(async () => {
  const D = JSON.parse(fs.readFileSync(inFile));
  const list = D.p.map((q, i) => Object.assign({ i }, q)).filter(q => q.i % +shards === +shard);
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  p.on('console', m => { if (m.type() === 'log') console.log(shard, m.text()); });
  await p.goto('http://localhost:8123/index.html?backend=wasm');
  await p.waitForFunction(() => typeof Tsumego !== 'undefined' && Tsumego.ai && Tsumego.ai(), null, { timeout: 300000 });
  const res = await p.evaluate(async ([list, V]) => {
    const T = Tsumego, ai = T.ai(), { Board, PASS } = T.E, b0 = new Board(19);
    const name = pt => { if (pt === PASS) return null; const [x, y] = b0.xy(pt); return String.fromCharCode(97 + x, 97 + y); };
    const out = [];
    for (const q of list) {
      try {
        const crop = T._crop(q), inside = s => { if (!s) return false; const x = s.charCodeAt(0) - 97, y = s.charCodeAt(1) - 97; return x >= crop.x0 && x <= crop.x1 && y >= crop.y0 && y <= crop.y1; };
        const pt = s => b0.pt(s.charCodeAt(0) - 97, s.charCodeAt(1) - 97);
        let moves = T._setup(q);
        const opts = { visits: V, timeMs: 20000, batch: 8, top: 12 };
        // is the book answer good by the network? (a misprinted answer, or one the network can't see, is left out)
        // komi that makes the starting position even, so the win rate says who wins the problem, not the frame
        const r0 = await ai.think(19, moves, 7.5, opts);
        const komi = Math.round((7.5 + (q.t === "B" ? 1 : -1) * r0.searchLead) * 2) / 2;
        const root = await ai.think(19, moves, komi, opts);
        const best = root.top[0];
        const book = root.top.find(t => q.a.includes(name(t.move)));
        let doubt = !book ? "unread" : book.winrate < best.winrate - 0.2 ? "worse" : "";
        if (doubt) { out.push({ i: q.i, doubt, komi }); console.log(q.i, doubt); continue; }
        const first = book ? name(book.move) : q.a[0];
        const line = [first], alt = [q.a.filter(a => a !== first).concat(root.top.filter(t => inside(name(t.move)) && !q.a.includes(name(t.move)) && t.visits >= best.visits * 0.15 && t.winrate >= (book || best).winrate - 0.03 && t.lead >= (book || best).lead - 1).map(t => name(t.move))).join("")];
        moves = moves.concat([pt(first)]);
        // a move belongs to the fight when it is within two lines of a move already in the line
        const near = s => line.some(l => Math.max(Math.abs(l.charCodeAt(0) - s.charCodeAt(0)), Math.abs(l.charCodeAt(1) - s.charCodeAt(1))) <= 3);
        const wr = [];
        for (let k = 0; k < 2; k++) { // five moves: the book answer, then reply and answer twice
          const opp = await ai.think(19, moves, komi, opts), r = name(opp.move);
          wr.push(Math.round(opp.top[0].winrate * 100));
          if (!inside(r) || !near(r)) break;
          line.push(r); moves = moves.concat([opp.move]);
          const me = await ai.think(19, moves, komi, opts), m = name(me.move);
          if (!inside(m) || !near(m)) break;
          const t0 = me.top[0];
          line.push(m); moves = moves.concat([me.move]);
          alt.push(me.top.slice(1).filter(t => inside(name(t.move)) && t.visits >= t0.visits * 0.15 && t.winrate >= t0.winrate - 0.03 && t.lead >= t0.lead - 1).map(t => name(t.move)).join(""));
        }
        out.push({ i: q.i, line: line.join(""), alt, doubt, wr, komi, bw: book ? Math.round(book.winrate * 100) : null });
        console.log(q.i, 'komi', komi, 'book', book && Math.round(book.winrate * 100), 'best', Math.round(best.winrate * 100), line.join(" "), doubt, wr.join("/"));
      } catch (e) { out.push({ i: q.i, err: String(e) }); }
    }
    return out;
  }, [list, +visits]);
  fs.writeFileSync(outFile, JSON.stringify(res));
  await b.close();
})();
