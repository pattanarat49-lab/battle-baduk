// Board from a picture ("อ่านรูปกระดาน"): the player uploads a screenshot or photo of a Go board, the page finds the grid
// and reads each point as black, white or empty, then the player checks it (drag the four corners, tap a point to change
// it, pick who plays next) before the position goes to the analysis board. All of it runs in the browser on a canvas.
const BoardPhoto = (function () {
  const api = {};
  const $ = id => document.getElementById(id);
  const MAX = 1200; // the picture is scaled down to this many pixels on its long side
  let ST = null, wired = false;

  // ---------- reading the picture ----------
  function grayOf(img) {
    const { width: w, height: h, data } = img, g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = (data[4 * i] * .299 + data[4 * i + 1] * .587 + data[4 * i + 2] * .114) / 255;
    return g;
  }
  // how much each row (or column) looks like a thin dark line: darker than both the row two pixels above and the one two
  // below (an edge between light and dark is darker on one side only, so it doesn't count)
  function lineScores(g, w, h, rows) {
    const len = rows ? h : w, other = rows ? w : h, out = new Float32Array(len);
    const at = (a, b) => rows ? g[a * w + b] : g[b * w + a];
    for (let a = 2; a < len - 2; a++) {
      let s = 0;
      for (let b = 0; b < other; b++) { const d = Math.min(at(a - 2, b), at(a + 2, b)) - at(a, b); if (d > .02) s += Math.min(d, .25); }
      out[a] = s / other;
    }
    // a line can be two pixels thick: let each row take the better of itself and its neighbours
    const sm = new Float32Array(len);
    for (let a = 1; a < len - 1; a++) sm[a] = Math.max(out[a], (out[a - 1] + out[a + 1]) * .6);
    return sm;
  }
  // the n equally spaced lines that best match the line scores: [first, spacing, average score]
  function fitLines(sc, n, sMin, sMax) {
    const len = sc.length, peak = x => { const i = Math.round(x); return i < 1 || i >= len - 1 ? 0 : Math.max(sc[i], sc[i - 1] * .8, sc[i + 1] * .8); };
    let best = [0, 0, -1];
    for (let s = Math.max(4, sMin); s <= sMax; s += .25) {
      const span = s * (n - 1);
      for (let o = 1; o + span < len - 1; o += 1) {
        let t = 0; for (let k = 0; k < n; k++) t += peak(o + k * s);
        if (t > best[2]) best = [o, s, t];
      }
    }
    // refine the first line to a fraction of a pixel
    let [o, s] = best, bt = best[2];
    for (let d = -1; d <= 1; d += .25) for (let e = -.2; e <= .2; e += .05) {
      let t = 0; for (let k = 0; k < n; k++) t += peak(o + d + k * (s + e));
      if (t > bt) { bt = t; best = [o + d, s + e, t]; }
    }
    return [best[0], best[1], best[2] / n];
  }
  // the board size and its four corner points (top-left, top-right, bottom-right, bottom-left), in picture pixels
  function findGrid(g, w, h, only) {
    const rs = lineScores(g, w, h, true), cs = lineScores(g, w, h, false);
    let pick = null;
    for (const n of only ? [only] : [19, 13, 9]) {
      const sMax = Math.min(w, h) / (n - 1), sMin = sMax * .35;
      const [oy, sy, ty] = fitLines(rs, n, sMin, sMax), [ox, sx, tx] = fitLines(cs, n, sMin, sMax);
      const sq = Math.min(sx, sy) / Math.max(sx, sy); // a board's squares are square
      const score = (tx + ty) / 2 * (sq > .9 ? 1 : sq);
      const c = { n, score, corners: [[ox, oy], [ox + sx * (n - 1), oy], [ox + sx * (n - 1), oy + sy * (n - 1)], [ox, oy + sy * (n - 1)]] };
      // the largest size whose lines are about as clear as the best one wins (nine lines of a 19 board fit a 9 board too)
      if (!pick || c.score > pick.score * (c.n < pick.n ? 1.25 : .8)) pick = c;
    }
    return pick;
  }
  // a projective map from the unit square to the four corners, so photos taken at an angle work too
  function homography(q) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9, g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
    return (u, v) => { const z = g * u + h * v + 1; return [(a * u + b * v + x0) / z, (d * u + e * v + y0) / z]; };
  }
  const ptOf = (n, x, y) => { const H = homography(ST.corners); return H(x / (n - 1), y / (n - 1)); };
  // each point: the median brightness and colour strength of a small disc around it
  function sample() {
    const { n, img } = ST, { width: w, height: h, data } = img, out = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const [cx, cy] = ptOf(n, x, y), [rx] = ptOf(n, Math.min(n - 1, x + 1), y), [, ry] = ptOf(n, x, Math.min(n - 1, y + 1));
      const r = Math.max(2, .3 * Math.min(Math.abs(rx - cx) || Math.abs(ptOf(n, x - 1, y)[0] - cx), Math.abs(ry - cy) || Math.abs(ptOf(n, x, y - 1)[1] - cy)));
      const L = [], S = [];
      for (let dy = -r; dy <= r; dy += Math.max(1, r / 5)) for (let dx = -r; dx <= r; dx += Math.max(1, r / 5)) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = Math.round(cx + dx), py = Math.round(cy + dy); if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const i = 4 * (py * w + px), R = data[i] / 255, G = data[i + 1] / 255, B = data[i + 2] / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        L.push((R * .299 + G * .587 + B * .114)); S.push(mx ? (mx - mn) / mx : 0);
      }
      const med = a => { a.sort((p, q) => p - q); return a.length ? a[a.length >> 1] : 0; };
      out.push([med(L), med(S)]);
    }
    return out;
  }
  // three groups by brightness and colour: black stones (dark), white stones (bright, no colour), the board (between, or
  // coloured like wood); a group that isn't clearly apart from the board is board
  function classify(f) {
    const Ls = f.map(v => v[0]).sort((a, b) => a - b), mid = Ls[Ls.length >> 1];
    let c = [[Math.min(.2, Ls[0]), .1], [mid, .3], [Math.max(.9, Ls[Ls.length - 1]), .05]];
    let lab = new Array(f.length).fill(1);
    for (let it = 0; it < 12; it++) {
      lab = f.map(([L, S]) => { let bi = 0, bd = 1e9; c.forEach(([cl, cs], k) => { const d = (L - cl) ** 2 + .5 * (S - cs) ** 2; if (d < bd) { bd = d; bi = k; } }); return bi; });
      c = c.map((old, k) => { const m = f.filter((v, i) => lab[i] === k); return m.length ? [m.reduce((a, v) => a + v[0], 0) / m.length, m.reduce((a, v) => a + v[1], 0) / m.length] : old; });
    }
    const blackOk = c[0][0] < c[1][0] - .22, whiteOk = c[2][0] > c[1][0] + .08 || (c[2][1] < c[1][1] - .12 && c[2][0] > c[1][0] - .02);
    return lab.map(l => l === 0 ? (blackOk ? 1 : 0) : l === 2 ? (whiteOk ? 2 : 0) : 0);
  }
  function read() { ST.stones = classify(sample()); }

  // ---------- the check screen ----------
  function fit() {
    const cv = $("phCanvas"), box = cv.parentElement.getBoundingClientRect(), { width: w, height: h } = ST.img;
    const k = Math.min(box.width / w, (window.innerHeight * .62) / h, 1.6);
    cv.width = Math.round(w * k * devicePixelRatio); cv.height = Math.round(h * k * devicePixelRatio);
    cv.style.width = Math.round(w * k) + "px"; cv.style.height = Math.round(h * k) + "px";
    ST.k = k; draw();
  }
  function draw() {
    const cv = $("phCanvas"), c = cv.getContext("2d"), k = ST.k * devicePixelRatio, n = ST.n;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0);
    c.drawImage(ST.canvas, 0, 0);
    c.lineWidth = 1.2 / ST.k; c.strokeStyle = "rgba(255, 64, 64, .8)";
    for (let i = 0; i < n; i++) {
      c.beginPath(); for (let j = 0; j < n; j++) { const [x, y] = ptOf(n, i, j); j ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      c.beginPath(); for (let j = 0; j < n; j++) { const [x, y] = ptOf(n, j, i); j ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    }
    const sp = Math.hypot(...[0, 1].map(a => ptOf(n, 1, 0)[a] - ptOf(n, 0, 0)[a]));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = ST.stones[y * n + x]; if (!v) continue;
      const [px, py] = ptOf(n, x, y);
      c.beginPath(); c.arc(px, py, sp * .28, 0, 7);
      c.fillStyle = v === 1 ? "#111" : "#fff"; c.fill(); c.lineWidth = 2 / ST.k; c.strokeStyle = v === 1 ? "#ffe066" : "#d33"; c.stroke();
    }
    for (const [x, y] of ST.corners) { c.beginPath(); c.arc(x, y, 9 / ST.k, 0, 7); c.fillStyle = "rgba(63, 143, 216, .85)"; c.fill(); c.lineWidth = 2 / ST.k; c.strokeStyle = "#fff"; c.stroke(); }
    const nb = ST.stones.filter(v => v === 1).length, nw = ST.stones.filter(v => v === 2).length;
    $("phCount").textContent = `อ่านได้ ดำ ${nb} เม็ด · ขาว ${nw} เม็ด`;
    for (const b of document.querySelectorAll("#phSize button")) b.classList.toggle("on", +b.dataset.n === n);
    for (const b of document.querySelectorAll("#phTurn button")) b.classList.toggle("on", +b.dataset.c === ST.toPlay);
  }
  function wire() {
    wired = true;
    const cv = $("phCanvas");
    const at = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / ST.k, (e.clientY - r.top) / ST.k]; };
    let drag = null, down = null;
    cv.addEventListener("pointerdown", e => {
      const [x, y] = at(e); down = [x, y];
      const i = ST.corners.findIndex(([cx, cy]) => Math.hypot(cx - x, cy - y) < 22 / ST.k);
      if (i >= 0) { drag = i; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    cv.addEventListener("pointermove", e => { if (drag === null) return; ST.corners[drag] = at(e); draw(); });
    cv.addEventListener("pointerup", e => {
      const [x, y] = at(e);
      if (drag !== null) { drag = null; read(); draw(); return; }
      if (!down || Math.hypot(x - down[0], y - down[1]) > 8 / ST.k) return;
      // a tap on a point changes it: empty, black, white
      const n = ST.n; let bi = -1, bd = 1e9;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const [px, py] = ptOf(n, i, j), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; bi = j * n + i; } }
      const sp = Math.hypot(...[0, 1].map(a => ptOf(n, 1, 0)[a] - ptOf(n, 0, 0)[a]));
      if (bi >= 0 && bd < sp * .6) { ST.stones[bi] = (ST.stones[bi] + 1) % 3; draw(); }
    });
    $("phSize").addEventListener("click", e => {
      const b = e.target.closest("[data-n]"); if (!b) return;
      const g = findGrid(ST.gray, ST.img.width, ST.img.height, +b.dataset.n);
      ST.n = g.n; ST.corners = g.corners; read(); draw();
    });
    $("phTurn").addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (b) { ST.toPlay = +b.dataset.c; draw(); } });
    $("phCancel").onclick = () => finish(null);
    $("phOk").onclick = () => finish({ n: ST.n, stones: ST.stones.slice(), toPlay: ST.toPlay });
    window.addEventListener("resize", () => { if (ST && !$("photo").hidden) fit(); });
  }
  function finish(v) { $("photo").hidden = true; const d = ST.done; ST = null; d(v); }

  // the picture file in, the position (or null) out
  api.open = file => new Promise((done, fail) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onerror = () => { URL.revokeObjectURL(url); fail(new Error("not an image")); };
    im.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
      const c = canvas.getContext("2d", { willReadFrequently: true }); c.drawImage(im, 0, 0, w, h);
      const img = c.getImageData(0, 0, w, h), gray = grayOf(img), g = findGrid(gray, w, h);
      ST = { canvas, img, gray, n: g.n, corners: g.corners, stones: null, toPlay: 1, k: 1, done };
      read();
      // who plays next: the side with fewer stones, black when even
      const nb = ST.stones.filter(v => v === 1).length, nw = ST.stones.filter(v => v === 2).length;
      ST.toPlay = nb > nw ? 2 : 1;
      if (!wired) wire();
      $("photo").hidden = false; fit();
    };
    im.src = url;
  });
  api._read = (canvas, n) => { // for tests: the grid and stones of a canvas
    const c = canvas.getContext("2d"), img = c.getImageData(0, 0, canvas.width, canvas.height), gray = grayOf(img), g = findGrid(gray, img.width, img.height, n);
    ST = { canvas, img, gray, n: g.n, corners: g.corners }; read(); const r = { n: ST.n, corners: ST.corners, stones: ST.stones }; ST = null; return r;
  };
  return api;
})();
