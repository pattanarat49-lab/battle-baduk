// KataGo residual network evaluated with TensorFlow.js, NHWC layout.
// Layout format 1 (export_tf.py): plain v8-10 nets. Format 2 (export_tf2.py): v8-15 incl. nested bottleneck nets.
function GoTFNet(tf) {
  "use strict";
  function halfToFloat(u16) {
    const out = new Float32Array(u16.length);
    for (let i = 0; i < u16.length; i++) {
      const h = u16[i], s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
      out[i] = e === 0 ? s * f * 5.960464477539063e-8 : e === 31 ? (f ? NaN : s * Infinity) : s * (1 + f / 1024) * Math.pow(2, e - 15);
    }
    return out;
  }

  // meta: parsed JSON layout, buf: ArrayBuffer of float16 weights
  // opts.profile: HumanSL profile to play as (one of meta.metaProfiles; the first by default)
  function build(meta, buf, opts) {
    let profile = opts && opts.profile; // setProfile changes it: Sai and Takemiya share one download
    // converted one tensor at a time so a big net never holds a full float32 copy of itself in memory
    const halves = new Uint16Array(buf, 0, meta.bytes ? meta.bytes >> 1 : buf.byteLength >> 1);
    const W = {};
    for (const t of meta.tensors) {
      const size = t.shape.reduce((a, b) => a * b, 1);
      W[t.name] = tf.tensor(halfToFloat(halves.subarray(t.offset, t.offset + size)), t.shape, "float32");
    }
    for (const t of meta.f32 || []) W[t.name] = tf.tensor(new Float32Array(buf, t.byteOffset, t.shape.reduce((a, b) => a * b, 1)), t.shape, "float32");
    const conv = (x, name) => tf.conv2d(x, W[name], 1, "same");
    const actFn = (y, a) => a === "mish" ? tf.mul(y, tf.tanh(tf.softplus(y))) : a === "silu" ? tf.mul(y, tf.sigmoid(y)) : a === "id" ? y : tf.relu(y);
    const bnAct = (x, name, mask, act = true) => {
      let y = tf.add(tf.mul(x, W[name + ".s"]), W[name + ".b"]);
      if (act) y = actFn(y, act === true ? "relu" : act);
      return tf.mul(y, mask);
    };
    const v2 = meta.format === 2, A = meta.acts || {};
    const ropeQ = {}; // query-head RoPE tables, built on first use and kept with the weights
    const asBias = v => tf.expandDims(tf.expandDims(v, 1), 1);
    // grouped-query attention: each key/value head serves g query heads in a row (head h uses kv head h/g)
    const repeatHeads = (x, g, axis) => tf.gather(x, Array.from({ length: x.shape[axis] * g }, (_, h) => Math.floor(h / g)), axis);
    // RoPE without 5-D tensors (the WebAssembly backend fails on them): x*cos2 + swapPairs(x)*sin2, where cos2/sin2 repeat
    // each pair's value on both channels (sin2 negated on the first) and swapPairs is a fixed DxD permutation
    const ropeTab = {};
    function ropeTables(p) {
      if (ropeTab[p]) return ropeTab[p];
      const cos = W[p + "cos"], [L, Hk, P] = cos.shape, c = cos.dataSync(), sn = W[p + "sin"].dataSync();
      const c2 = new Float32Array(L * Hk * P * 2), s2 = new Float32Array(L * Hk * P * 2);
      for (let i = 0; i < L * Hk * P; i++) { c2[2 * i] = c2[2 * i + 1] = c[i]; s2[2 * i] = -sn[i]; s2[2 * i + 1] = sn[i]; }
      const D = P * 2, sw = new Float32Array(D * D);
      for (let q = 0; q < P; q++) { sw[(2 * q) * D + 2 * q + 1] = 1; sw[(2 * q + 1) * D + 2 * q] = 1; }
      return (ropeTab[p] = { cos: tf.keep(tf.tensor3d(c2, [L, Hk, D])), sin: tf.keep(tf.tensor3d(s2, [L, Hk, D])), swap: tf.keep(tf.tensor2d(sw, [D, D])) });
    }

    // spatial: [N,19,19,22] float32, global: [N,19]
    function forward(spatial, global) {
      return tf.tidy(() => {
        const mask = tf.slice(spatial, [0, 0, 0, 0], [-1, -1, -1, 1]);
        const maskSum = tf.sum(mask, [1, 2]);            // [N,1]
        const f14 = tf.mul(tf.sub(tf.sqrt(maskSum), 14), 0.1);
        const f14sq = tf.sub(tf.mul(f14, f14), 0.1);
        const maskM1 = tf.sub(mask, 1);
        const gpool = (x, valueHead) => {
          const mean = tf.div(tf.sum(x, [1, 2]), maskSum);
          const third = valueHead ? tf.mul(mean, f14sq) : tf.max(tf.add(x, maskM1), [1, 2]);
          return tf.concat([mean, tf.mul(mean, f14), third], 1);
        };
        let x = tf.add(conv(spatial, "init.conv"), asBias(tf.matMul(global, W["init.mm"])));
        // HumanSL: the chosen profile's precomputed metadata bias (see export_tf2.py)
        if (meta.metaProfiles && meta.metaProfiles.length) x = tf.add(x, W["meta." + (profile || meta.metaProfiles[0])]);
        const n0 = spatial.shape[0], flatMask = tf.reshape(mask, [n0, 361, 1]);
        const keyBias = tf.reshape(tf.mul(tf.sub(flatMask, 1), 1e9), [n0, 1, 1, 361]);
        // RMSNorm across channels at each point (transformer blocks), x: [N,361,C]
        const tnorm = (x, nm) => tf.mul(tf.mul(x, tf.rsqrt(tf.add(tf.mean(tf.square(x), -1, true), meta.norms[nm]))), W[nm]);
        const lin = (x, nm) => { const [a, b, c] = x.shape; return tf.reshape(tf.matMul(tf.reshape(x, [a * b, c]), W[nm]), [a, b, -1]); };
        // rotate interleaved channel pairs; x: [N,361,H,D], cos/sin: [361,H,D], swap: [D,D]
        const rope = (x, cos, sin, swap) => {
          const [a, , h, d] = x.shape, sw = tf.reshape(tf.matMul(tf.reshape(x, [-1, d]), swap), [a, 361, h, d]);
          return tf.add(tf.mul(x, cos), tf.mul(sw, sin));
        };
        const tblock = (x, b) => {
          const p = b.p, [N, , , C] = x.shape, t = tf.reshape(x, [N, 361, C]);
          let out;
          if (b.kind === "transformer_ffn_block") {
            const h = tnorm(t, p + "ln");
            out = lin(tf.mul(actFn(lin(h, p + "l1"), "silu"), lin(h, p + "gate")), p + "l2");
          } else {
            const h = tnorm(t, p + "ln"), H = b.heads, KV = b.kvHeads, g = H / KV;
            let q = tf.reshape(lin(h, p + "q"), [N, 361, H, b.qDim]), k = tf.reshape(lin(h, p + "k"), [N, 361, KV, b.qDim]);
            const v = tf.reshape(lin(h, p + "v"), [N, 361, KV, b.vDim]);
            if (b.rope) {
              const T = ropeQ[p] || (ropeQ[p] = (t => g === 1 ? t : { cos: tf.keep(repeatHeads(t.cos, g, 1)), sin: tf.keep(repeatHeads(t.sin, g, 1)), swap: t.swap })(ropeTables(p)));
              const K = ropeTables(p);
              q = rope(q, T.cos, T.sin, T.swap); k = rope(k, K.cos, K.sin, K.swap);
            }
            const kh = tf.transpose(g === 1 ? k : repeatHeads(k, g, 2), [0, 2, 1, 3]), vh = tf.transpose(g === 1 ? v : repeatHeads(v, g, 2), [0, 2, 1, 3]);
            const scores = tf.add(tf.mul(tf.matMul(tf.transpose(q, [0, 2, 1, 3]), kh, false, true), 1 / Math.sqrt(b.qDim)), keyBias);
            const o = tf.matMul(tf.softmax(scores), vh);                       // [N,H,361,vDim]
            out = lin(tf.reshape(tf.transpose(o, [0, 2, 1, 3]), [N, 361, H * b.vDim]), p + "o");
          }
          return tf.add(x, tf.reshape(tf.mul(out, flatMask), [N, 19, 19, C]));
        };
        const block = (x, b) => {
          const p = b.p;
          if (b.kind.startsWith("transformer")) return tblock(x, b);
          if (b.kind === "nested_bottleneck_block") {
            let h = conv(bnAct(x, p + "pre", mask, b.preAct), p + "preconv");
            for (const ib of b.inner) h = block(h, ib);
            return tf.add(x, conv(bnAct(h, p + "post", mask, b.postAct), p + "postconv"));
          }
          const o = bnAct(x, p + "pre", mask, b.preAct || true);
          let a = conv(o, p + "conv1");
          if (b.kind === "gpool_block") {
            const g = bnAct(conv(o, p + "gconv"), p + "gbn", mask, b.gAct || true);
            a = tf.add(a, asBias(tf.matMul(gpool(g, false), W[p + "gmm"])));
          }
          a = bnAct(a, p + "mid", mask, b.midAct || true);
          return tf.add(x, conv(a, p + "conv2"));
        };
        const tree = v2 ? meta.tree : meta.blocks.map((kind, i) => ({ kind, p: "b" + i + "." }));
        for (const b of tree) x = block(x, b);
        let trunk;
        if (meta.tipNorm) {
          // RMSNorm with gamma/beta: over channels at each point, or over all channels and points ("spatial")
          const ms = meta.tipNorm.spatial ? tf.div(tf.sum(tf.mul(tf.square(x), mask), [1, 2, 3], true), tf.mul(tf.reshape(maskSum, [-1, 1, 1, 1]), x.shape[3]))
            : tf.mean(tf.square(x), -1, true);
          trunk = tf.mul(actFn(tf.add(tf.mul(tf.mul(x, tf.rsqrt(tf.add(ms, meta.tipNorm.eps))), W["tip.g"]), W["tip.b"]), A.tip || "relu"), mask);
        } else trunk = bnAct(x, "tip", mask, A.tip || true);
        const g1 = bnAct(conv(trunk, "p.g1"), "p.g1bn", mask, A.g1 || true);
        const pooled = gpool(g1, false);
        let p1 = tf.add(conv(trunk, "p.p1"), asBias(tf.matMul(pooled, W["p.gmm"])));
        p1 = bnAct(p1, "p.p1bn", mask, A.p1 || true);
        let p2 = conv(p1, "p.p2");
        if (v2 && meta.policyChannels > 1) p2 = tf.slice(p2, [0, 0, 0, 0], [-1, -1, -1, 1]);
        p2 = tf.add(tf.mul(p2, mask), tf.mul(maskM1, 5000));
        const n = spatial.shape[0];
        let pass = tf.matMul(pooled, W["p.pass"]);
        if (A.pass) pass = tf.matMul(actFn(tf.add(pass, W["p.passb"]), A.pass), W["p.pass2"]);
        if (pass.shape[1] > 1) pass = tf.slice(pass, [0, 0], [-1, 1]);
        const policy = tf.concat([tf.reshape(p2, [n, 361]), pass], 1);
        const v1 = bnAct(conv(trunk, "v.v1"), "v.v1bn", mask, A.v1 || true);
        const vh = actFn(tf.add(tf.matMul(gpool(v1, true), W["v.v2"]), W["v.v2b"]), A.v2 || "relu");
        const value = tf.add(tf.matMul(vh, W["v.v3"]), W["v.v3b"]);
        let score = tf.add(tf.matMul(vh, W["v.sv3"]), W["v.sv3b"]);
        if (v2 && (meta.scoreMul !== 1 || meta.leadMul !== 1)) {
          const k = [meta.scoreMul, 1, meta.leadMul].concat(Array(score.shape[1] - 3).fill(1));
          score = tf.mul(score, tf.tensor1d(k));
        }
        const own = tf.reshape(tf.tanh(tf.mul(conv(v1, "v.own"), mask)), [n, 361]);
        return [policy, value, score, own];
      });
    }

    // inputs in KataGo NCHW order (22*361 per position); returns plain arrays per position
    async function run(batch) {
      const n = batch.length;
      const sp = new Float32Array(n * 361 * 22), gl = new Float32Array(n * 19);
      batch.forEach((b, k) => {
        const s = b.spatial, base = k * 361 * 22;
        for (let c = 0; c < 22; c++) { const off = c * 361; for (let i = 0; i < 361; i++) sp[base + i * 22 + c] = s[off + i]; }
        gl.set(b.global, k * 19);
      });
      const tsp = tf.tensor4d(sp, [n, 19, 19, 22]), tgl = tf.tensor2d(gl, [n, 19]);
      const outs = forward(tsp, tgl);
      tsp.dispose(); tgl.dispose();
      const data = await Promise.all(outs.map(t => t.data()));
      outs.forEach(t => t.dispose());
      const res = [];
      for (let k = 0; k < n; k++) res.push({
        policy: data[0].subarray(k * 362, k * 362 + 362), value: data[1].subarray(k * 3, k * 3 + 3),
        score: data[2].subarray(k * (data[2].length / n), k * (data[2].length / n) + 4), own: data[3].subarray(k * 361, k * 361 + 361)
      });
      return res;
    }
    // frees the weights (a big brain that failed its warmup on the GPU is rebuilt on WebAssembly)
    const dispose = () => { for (const k in W) W[k].dispose(); };
    const setProfile = p => { if (p && !W["meta." + p]) throw new Error("no HumanSL profile " + p); profile = p; };
    return { run, forward, dispose, setProfile, getProfile: () => profile || (meta.metaProfiles || [])[0], name: meta.name };
  }
  return { build };
}
if (typeof module !== "undefined") module.exports = GoTFNet;
