// KataGo residual network (model versions 8-10) evaluated with TensorFlow.js, NHWC layout.
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
  function build(meta, buf) {
    const all = halfToFloat(new Uint16Array(buf));
    const W = {};
    for (const t of meta.tensors) {
      const size = t.shape.reduce((a, b) => a * b, 1);
      W[t.name] = tf.tensor(all.subarray(t.offset, t.offset + size), t.shape, "float32");
    }
    const conv = (x, name) => tf.conv2d(x, W[name], 1, "same");
    const bnAct = (x, name, mask, act = true) => {
      let y = tf.add(tf.mul(x, W[name + ".s"]), W[name + ".b"]);
      if (act) y = tf.relu(y);
      return tf.mul(y, mask);
    };
    const asBias = v => tf.expandDims(tf.expandDims(v, 1), 1);

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
        meta.blocks.forEach((kind, i) => {
          const p = "b" + i + ".";
          const o = bnAct(x, p + "pre", mask);
          let a = conv(o, p + "conv1");
          if (kind === "gpool_block") {
            const g = bnAct(conv(o, p + "gconv"), p + "gbn", mask);
            a = tf.add(a, asBias(tf.matMul(gpool(g, false), W[p + "gmm"])));
          }
          a = bnAct(a, p + "mid", mask);
          x = tf.add(x, conv(a, p + "conv2"));
        });
        const trunk = bnAct(x, "tip", mask);
        const g1 = bnAct(conv(trunk, "p.g1"), "p.g1bn", mask);
        const pooled = gpool(g1, false);
        let p1 = tf.add(conv(trunk, "p.p1"), asBias(tf.matMul(pooled, W["p.gmm"])));
        p1 = bnAct(p1, "p.p1bn", mask);
        let p2 = conv(p1, "p.p2");
        p2 = tf.add(tf.mul(p2, mask), tf.mul(maskM1, 5000));
        const n = spatial.shape[0];
        const policy = tf.concat([tf.reshape(p2, [n, 361]), tf.matMul(pooled, W["p.pass"])], 1);
        const v1 = bnAct(conv(trunk, "v.v1"), "v.v1bn", mask);
        const v2 = tf.relu(tf.add(tf.matMul(gpool(v1, true), W["v.v2"]), W["v.v2b"]));
        const value = tf.add(tf.matMul(v2, W["v.v3"]), W["v.v3b"]);
        const score = tf.add(tf.matMul(v2, W["v.sv3"]), W["v.sv3b"]);
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
        score: data[2].subarray(k * 4, k * 4 + 4), own: data[3].subarray(k * 361, k * 361 + 361)
      });
      return res;
    }
    return { run, forward, name: meta.name };
  }
  return { build };
}
if (typeof module !== "undefined") module.exports = GoTFNet;
