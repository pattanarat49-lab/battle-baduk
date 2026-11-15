// Tests for the end-of-game count (GoEngine countScore): node src/tools/score_test.js
// Positions are drawn as text (X black, O white, . empty, first row = top) and set up stone by stone with passes in
// between, so no captures happen unless a test plays them.
const E = require("../engine.js")();
const { Board, PASS, BLACK, WHITE, countScore } = E;
let fail = 0, pass = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); }
}
function setup(rows) {
  const n = rows.length, b = new Board(n);
  const bl = [], wh = [];
  rows.forEach((r, y) => [...r.replace(/ /g, "")].forEach((ch, x) => { if (ch === "X") bl.push(b.pt(x, y)); if (ch === "O") wh.push(b.pt(x, y)); }));
  const moves = [];
  for (let i = 0; i < Math.max(bl.length, wh.length); i++) { moves.push(i < bl.length ? bl[i] : PASS); moves.push(i < wh.length ? wh[i] : PASS); }
  for (const m of moves) b.play(m);
  return b;
}
const at = (b, x, y) => b.pt(x, y);
const sum = r => ({ b: r.b, w: r.w, terrB: r.terrB, terrW: r.terrW, capB: r.capB, capW: r.capW, seki: r.seki.size });

// 1. a plain split board: Black has columns 0-3 (3 empty columns = 27 points), White columns 5-8 (3 empty = 27)
{
  const b = setup([
    "...X.O...", "...X.O...", "...X.O...", "...X.O...", "...X.O...", "...X.O...", "...X.O...", "...X.O...", "...X.O..."]);
  const r = countScore(b, null, "japanese", 6.5);
  check("split: territory", sum(r), { b: 27, w: 27, terrB: 27, terrW: 27, capB: 0, capW: 0, seki: 0 });
  check("split: lead", r.lead, -6.5);
  check("split: dame is nobody's", r.terr.get(at(b, 4, 4)), 0);
  const c = countScore(b, null, "chinese", 7.5);
  check("split chinese", [c.b, c.w, c.lead], [36, 36, -7.5]);
}
// 2. dead stones: a white stone inside Black's area counts as a prisoner and its point as territory
{
  const b = setup([
    "...X.O...", ".O.X.O...", "...X.O...", "...X.O...", "...X.O...", "...X.O...", "...X.O...", "...X.O...", "...X.O..."]);
  const dead = new Set([at(b, 1, 1)]);
  const r = countScore(b, dead, "japanese", 6.5);
  check("dead stone", sum(r), { b: 28, w: 27, terrB: 27, terrW: 27, capB: 1, capW: 0, seki: 0 });
  // without marking it dead, the area touches both colours and counts for nobody
  const r2 = countScore(b, new Set(), "japanese", 6.5);
  check("dead stone not marked", [r2.terrB, r2.capB], [0, 0]);
}
// 3. prisoners taken during the game are counted
{
  const b = new Board(9);
  // Black captures a white stone at the 1-1 point: W at (0,0), B at (1,0) and (0,1)
  for (const m of [at(b, 1, 0), at(b, 0, 0), at(b, 0, 1)]) b.play(m);
  check("capture recorded", b.caps[BLACK], 1);
  const r = countScore(b, null, "japanese", 6.5);
  check("capture counted", r.capB, 1);
  // Japanese = area - (black stones played - white stones played) when nothing is in seki
  const c = countScore(b, null, "chinese", 0);
  check("japanese vs chinese identity", r.lead + 6.5, c.lead - (2 - 1));
}
// 4. seki with no eyes: the two shared liberties belong to nobody, the rest is counted normally
{
  const b = setup([
    "..XO.....",
    "..XO.....",
    "XXXO.....",
    "OOOO.....",
    ".........",
    ".........",
    ".........",
    ".........",
    "........."]);
  // a seki in the corner: black (0..2, 0..1 / row 2) and white around; shared liberties (0,0),(1,0),(0,1),(1,1)?
  // the black group has liberties (0,0),(1,0),(0,1),(1,1) all inside: that is black territory with a white wall outside,
  // and Black is alive or dead by the network; here it is just a normal enclosed area
  const r = countScore(b, null, "japanese", 6.5);
  check("enclosed corner", [r.terrB, r.seki.size], [4, 0]);
}
// 5. a real seki with one eye each: neither eye counts under Japanese rules, both under Chinese
{
  const b = setup([
    ".XO.OX.X.",
    "XXOOOXXX.",
    "OOO.XXXXX",
    ".O.OOOOOO",
    "OOOO.O...",
    ".........",
    ".........",
    ".........",
    "........."]);
  // black at top: chain A (0,1)(1,0)(1,1) with eye (0,0) touches the white wall; the point (3,0) is shared by the white
  // chain (2,0)(2,1)(3,1)(4,1)(4,0)(2,2)... and black (5,0)? simplified check below only asserts consistency
  const r = countScore(b, null, "japanese", 6.5), c = countScore(b, null, "chinese", 6.5);
  check("seki consistent", r.terrB <= c.terrB && r.terrW <= c.terrW, true);
}
// 6. a corner seki with one eye each: Black (1,0)(0,1)(1,1)(2,1) with the eye (0,0), White (3,0)(3,1)(4,1)(5,1)(5,0)
// with the eye (4,0), sharing the liberty (2,0). Neither can fill it, so under Japanese rules both eyes and the shared point are
// nobody's; the Chinese count gives each side its eye. Around it: White owns columns 0-1 below, Black the right side.
{
  const rows = [
    ".X.O.OX..",
    "XXXOOOX..",
    "OOOXXXX..",
    "..OX.....",
    "..OX.....",
    "..OX.....",
    "..OX.....",
    "..OX.....",
    "..OX....."];
  const b = setup(rows);
  const r = countScore(b, null, "japanese", 6.5), c = countScore(b, null, "chinese", 6.5);
  check("seki: black eye nobody's", r.terr.get(at(b, 0, 0)), 0);
  check("seki: white eye nobody's", r.terr.get(at(b, 4, 0)), 0);
  check("seki: shared liberty nobody's", r.terr.get(at(b, 2, 0)), 0);
  check("seki: stones flagged", [r.seki.has(at(b, 1, 0)), r.seki.has(at(b, 3, 0)), r.seki.has(at(b, 6, 0))], [true, true, false]);
  check("seki: chinese gives the eyes", [c.terr.get(at(b, 0, 0)), c.terr.get(at(b, 4, 0))], [BLACK, WHITE]);
  // 7. the groups around it keep their territory: White 2x6 = 12, Black the right side 2x3 + 5x6 = 36
  check("seki: territory around kept", [r.terrW, r.terrB], [12, 36]);
}
// 8. an area left open (a gap in the wall): with the network's ownership the inside goes to its owner, the gap to nobody
{
  const b = setup([
    "...X.O...", "...X.O...", "...X.O...", "...X.O...", ".....O...", "...X.O...", "...X.O...", "...X.O...", "...X.O..."]);
  const own = q => { const [x] = b.xy(q); return x <= 3 ? 1 : x >= 5 ? -1 : 0; };
  const plain = countScore(b, null, "japanese", 6.5), r = countScore(b, null, "japanese", 6.5, own);
  check("open wall without ownership", [plain.terrB, plain.terrW], [0, 27]);
  // the gap (3,4) is next to no white stone but (4,4) is: (3,4) goes to Black (ownership 1), (4,4) to nobody
  check("open wall with ownership", [r.terrB, r.terrW, r.terr.get(at(b, 4, 4)), r.terr.get(at(b, 3, 4))], [28, 27, 0, BLACK]);
}
// 9. identity on random games: with nothing in seki, Japanese lead = Chinese lead - (black stones played - white stones played)
{
  let tried = 0, same = 0;
  for (let g = 0; g < 400; g++) {
    const n = [9, 13, 19][g % 3], b = new Board(n); let pb = 0, pw = 0, passes = 0;
    for (let k = 0; k < n * n * 2 && passes < 2; k++) {
      const legal = b.pts.filter(p => b.color[p] === 0 && b.isLegal(p, b.toPlay));
      // don't fill own one-point eyes, so the game ends like a real one
      const good = legal.filter(p => !b.dirs.every(d => b.color[p + d] === b.toPlay || b.color[p + d] === 3));
      if (!good.length) { b.play(PASS); passes++; continue; }
      passes = 0; const p = good[(Math.random() * good.length) | 0];
      if (b.toPlay === BLACK) pb++; else pw++;
      b.play(p);
    }
    const j = countScore(b, null, "japanese", 6.5), c = countScore(b, null, "chinese", 6.5);
    if (j.seki.size) continue;
    tried++;
    if (Math.abs(j.lead - (c.lead - (pb - pw))) < 1e-9) same++; else if (tried - same < 4) console.log("identity off", j.lead, c.lead, pb, pw);
  }
  check(`identity on ${tried} random games`, same, tried);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
