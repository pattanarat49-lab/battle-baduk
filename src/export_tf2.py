"""Export a KataGo .bin.gz model (model versions 8-15, incl. nested bottleneck "nbt" nets such as
kata1-b18c384nbt) to a flat float16 weight file + JSON layout for TF.js (NHWC), read by tfnet.js.

Usage: python3 export_tf2.py model.bin.gz out_prefix   ->  out_prefix.bin + out_prefix.json
Layout format 2: "tree" describes the residual block stack (nested blocks have "inner"), each
activation is named (relu / mish / silu / identity). Heads use the same tensor names as format 1.
"""
import gzip, json, sys
import numpy as np


class Reader:
    def __init__(self, data):
        self.d = data; self.i = 0

    def tok(self):
        d = self.d
        while d[self.i] in b" \t\r\n":
            self.i += 1
        j = self.i
        while d[j] not in b" \t\r\n":
            j += 1
        s = d[self.i:j].decode(); self.i = j
        return s

    def int(self): return int(self.tok())
    def float(self): return float(self.tok())

    def floats(self, n):
        while self.d[self.i] != ord("@"):
            self.i += 1
        assert self.d[self.i:self.i + 5] == b"@BIN@", "expected binary block"
        self.i += 5
        a = np.frombuffer(self.d, dtype="<f4", count=n, offset=self.i).astype(np.float32)
        self.i += 4 * n
        return a


# HumanSL profiles baked into the export (see KataGo cpp/neuralnet/sgfmetadata.cpp), for a 19x19 board
PROFILES = ["proyear_1850", "rank_9d", "proyear_1980"]  # Sai, Lee Changho's opening, Takemiya (stored in the .bin)
# later profiles go into the .json only, so adding one leaves the 53 MB .bin unchanged and players keep their download
EXTRA_PROFILES = ["proyear_1995"]  # Lee Changho


def meta_row(prof):
    import datetime, math
    row = np.zeros(192)
    if prof.startswith("proyear_"):
        inv, date, source, tc = 1, datetime.date(int(prof[8:]), 6, 1), 5, 75     # GoGoD, time control unknown
        rated = 0.0
    else:
        ranks = {"9d": 1, "8d": 2, "7d": 3, "6d": 4, "5d": 5, "4d": 6, "3d": 7, "2d": 8, "1d": 9}
        inv, date, source, tc = ranks[prof.split("_")[1]], datetime.date(2020, 3, 1), 2, 79  # KGS, byo-yomi 1200s + 5x30s
        rated = 0.5
    row[0] = row[1] = 1.0                         # both players human
    row[6:6 + min(inv, 34)] = 1.0; row[40:40 + min(inv, 34)] = 1.0
    row[74] = rated
    row[tc] = 1.0
    main, period, periods = (1200.0, 30.0, 5) if tc == 79 else (0.0, 0.0, 0)
    row[82] = 0.4 * (math.log(main + 60.0) - 6.5); row[83] = 0.3 * (math.log(period + 1.0) - 3.0)
    row[84] = 0.5 * (math.log(periods + 2.0) - 1.5); row[85] = 0.25 * (math.log(0 + 2.0) - 1.5)
    row[86] = 0.0                                 # 0.5*log(area/361) on 19x19
    days = (date - datetime.date(1970, 1, 1)).days
    period_ = 7.0; factor = 80000 ** (1.0 / 31)
    for i in range(32):
        rev = days / period_
        row[87 + 2 * i] = math.cos(rev * 2 * math.pi); row[88 + 2 * i] = math.sin(rev * 2 * math.pi)
        period_ *= factor
    row[151 + source] = 1.0
    return row


ACTS = {"ACTIVATION_RELU": "relu", "ACTIVATION_MISH": "mish", "ACTIVATION_SILU": "silu", "ACTIVATION_IDENTITY": "id"}


def parse(path):
    r = Reader(gzip.open(path).read())
    name = r.tok(); ver = r.int()
    assert 8 <= ver <= 17, "model version %d not supported" % ver
    nin = r.int(); nglob = r.int()
    post = dict(scoreMean=20.0, lead=20.0)
    if ver >= 13:
        td = r.float(); post["scoreMean"] = r.float(); r.float(); post["lead"] = r.float(); r.float(); r.float(); r.float()
    if ver >= 15:
        meta = r.int(); assert meta in (0, 1), meta
        extra = [r.int() for _ in range(7)]
        assert all(e in (0, 1) for e in extra[:2]) and not any(extra[2:]), extra
        prefer = extra[:2]
    else:
        prefer = [0, 0]
        meta = 0

    tensors, chunks = [], []
    off = [0]

    def add(nm, arr):
        a = np.ascontiguousarray(arr, dtype=np.float32)
        assert np.isfinite(a).all() and np.abs(a).max() < 60000, nm
        tensors.append({"name": nm, "shape": list(a.shape), "offset": off[0]})
        chunks.append(a.astype(np.float16).tobytes()); off[0] += a.size

    def act():
        r.tok()
        return ACTS[r.tok()] if ver >= 11 else "relu"

    def conv(nm):
        r.tok(); ky = r.int(); kx = r.int(); ic = r.int(); oc = r.int(); dy = r.int(); dx = r.int()
        assert dy == 1 and dx == 1
        add(nm, r.floats(ky * kx * ic * oc).reshape(ky, kx, ic, oc))  # already [y,x,ic,oc]
        return oc

    def bn(nm):
        r.tok(); c = r.int(); eps = r.float(); hs = r.int(); hb = r.int()
        mean = r.floats(c); var = r.floats(c)
        scale = r.floats(c) if hs else np.ones(c, np.float32)
        bias = r.floats(c) if hb else np.zeros(c, np.float32)
        ms = scale / np.sqrt(var + eps)
        add(nm + ".s", ms); add(nm + ".b", bias - ms * mean)

    def matmul(nm):
        r.tok(); ic = r.int(); oc = r.int()
        add(nm, r.floats(ic * oc).reshape(ic, oc))
        return oc

    def matbias(nm):
        r.tok(); c = r.int(); add(nm, r.floats(c))

    def tnorm(nm):
        r.tok(); c = r.int(); eps = r.float(); add(nm, r.floats(c)); norms[nm] = eps

    norms, rope32 = {}, {}

    def stack(n, prefix):
        out = []
        for i in range(n):
            kind = r.tok(); r.tok(); p = "%s%d." % (prefix, i)
            b = {"kind": kind, "p": p}
            if kind == "nested_bottleneck_block":
                k = r.int()
                bn(p + "pre"); b["preAct"] = act(); conv(p + "preconv")
                b["inner"] = stack(k, p + "i")
                bn(p + "post"); b["postAct"] = act(); conv(p + "postconv")
            elif kind in ("ordinary_block", "gpool_block"):
                bn(p + "pre"); b["preAct"] = act(); conv(p + "conv1")
                if kind == "gpool_block":
                    conv(p + "gconv"); bn(p + "gbn"); b["gAct"] = act(); matmul(p + "gmm")
                bn(p + "mid"); b["midAct"] = act(); conv(p + "conv2")
            elif kind == "transformer_attention_block":
                nh = r.int(); nkv = r.int(); qd = r.int(); vd = r.int(); rope = r.int(); lrope = r.int()
                b.update(heads=nh, kvHeads=nkv, qDim=qd, vDim=vd)
                tnorm(p + "ln")
                for k in ("q", "k", "v", "o"):
                    matmul(p + k)
                if rope:
                    P = qd // 2
                    if lrope:
                        r.tok(); hk = r.int(); pp = r.int(); two = r.int(); assert hk == nkv and pp == P and two == 2
                        fr = r.floats(nkv * P * 2).reshape(nkv, P, 2)
                        ang = np.array([[[x * fr[h, q, 0] + y * fr[h, q, 1] for q in range(P)] for h in range(nkv)]
                                        for y in range(19) for x in range(19)], np.float64)  # [361, kv, P]
                    else:
                        r.tok(); theta = r.float(); half = P // 2; ang1 = np.zeros((361, P))
                        for q in range(P):
                            f = 1.0 / theta ** (2 * (q % half) / (qd / 2))
                            for xy in range(361):
                                ang1[xy, q] = (xy // 19 if q < half else xy % 19) * f
                        ang = np.repeat(ang1[:, None, :], nkv, axis=1)
                    # RoPE tables are kept in float32 (stored as two float16 halves would lose angle precision)
                    rope32[p + "cos"] = np.cos(ang).astype(np.float32); rope32[p + "sin"] = np.sin(ang).astype(np.float32)
                    b["rope"] = True
            elif kind == "transformer_ffn_block":
                c = r.int(); fc = r.int(); swi = r.int()
                tnorm(p + "ln"); matmul(p + "l1")
                if swi:
                    matmul(p + "gate")
                matmul(p + "l2")
                b.update(swiglu=bool(swi))
                assert swi, "only SwiGLU feed-forward blocks are supported"
            else:
                raise ValueError("unsupported block kind " + kind)
            out.append(b)
        return out

    # trunk
    r.tok(); nblocks = r.int(); r.int(); r.int(); r.int(); r.int(); r.int()
    norm = 0
    if ver >= 15:
        norm = r.int(); assert norm in (0, 1), norm
        assert not any(r.int() for _ in range(5))
    conv("init.conv"); matmul("init.mm")
    metaBias = []
    metaExtra = {}
    if meta:
        # HumanSL: SGF metadata (rank, date, source...) goes through a small MLP into a per-channel trunk bias. The profiles
        # used by the game are fixed, so the MLP is run here and only its output vector is stored per profile.
        r.tok(); nmeta = r.int(); assert nmeta == 192
        def mm():
            r.tok(); ic = r.int(); oc = r.int(); return r.floats(ic * oc).reshape(ic, oc)
        def mb():
            r.tok(); c = r.int(); return r.floats(c)
        m1 = mm(); b1 = mb(); a1 = act(); m2 = mm(); b2 = mb(); a2 = act(); m3 = mm()
        F = {"relu": lambda v: np.maximum(v, 0), "mish": lambda v: v * np.tanh(np.where(v < 20, np.log1p(np.exp(np.minimum(v, 20))), v)),
             "silu": lambda v: v / (1 + np.exp(-v)), "id": lambda v: v}
        for prof in PROFILES:
            row = meta_row(prof).astype(np.float64)
            h = F[a1](row @ m1 + b1); h = F[a2](h @ m2 + b2); out = h @ m3
            add("meta." + prof, out); metaBias.append(prof)
        for prof in EXTRA_PROFILES:
            row = meta_row(prof).astype(np.float64)
            h = F[a1](row @ m1 + b1); h = F[a2](h @ m2 + b2)
            metaExtra[prof] = [float(v) for v in (h @ m3)]
    tree = stack(nblocks, "b")
    tipNorm = None
    if norm == 0:
        bn("tip")
    else:
        r.tok(); c = r.int(); eps = r.float(); spatial = r.int(); cg = r.int(); assert cg == 0
        add("tip.g", r.floats(c)); add("tip.b", r.floats(c)); tipNorm = {"eps": eps, "spatial": bool(spatial)}
    tipAct = act()

    # policy head
    r.tok()
    if ver >= 17:
        r.int(); assert not any(r.int() for _ in range(3))
    conv("p.p1"); conv("p.g1"); bn("p.g1bn"); g1Act = act(); matmul("p.gmm"); bn("p.p1bn"); p1Act = act()
    pch = conv("p.p2"); matmul("p.pass")
    passAct = None
    if ver >= 15:
        matbias("p.passb"); passAct = act(); matmul("p.pass2")
    # value head
    r.tok()
    if ver >= 17:
        assert not any(r.int() for _ in range(3))
    conv("v.v1"); bn("v.v1bn"); v1Act = act(); matmul("v.v2"); matbias("v.v2b"); v2Act = act()
    matmul("v.v3"); matbias("v.v3b"); matmul("v.sv3"); matbias("v.sv3b"); conv("v.own")

    layout = {"name": name, "version": ver, "format": 2, "dtype": "float16", "tree": tree,
              "acts": {"tip": tipAct, "g1": g1Act, "p1": p1Act, "pass": passAct, "v1": v1Act, "v2": v2Act},
              "policyChannels": pch, "metaProfiles": metaBias, "metaExtra": metaExtra, "tipNorm": tipNorm, "norms": norms, "prefer": prefer, "scoreMul": post["scoreMean"] / 20.0, "leadMul": post["lead"] / 20.0,
              "tensors": tensors}
    # float32 extras (RoPE tables) go after the float16 weights, 4-byte aligned
    data = b"".join(chunks)
    if len(data) % 4:
        data += b"\0" * (4 - len(data) % 4)
    extra = []
    for nm, a in rope32.items():
        extra.append({"name": nm, "shape": list(a.shape), "byteOffset": len(data)}); data += np.ascontiguousarray(a).tobytes()
    layout["f32"] = extra
    return layout, data, off[0]


def main(src, dst):
    layout, data, n = parse(src)
    # Cloudflare serves static files up to 25 MiB, so a big net is split into parts: dst.bin.0, dst.bin.1, ...
    PART = 20 * 1024 * 1024
    if len(data) > PART:
        parts = [data[i:i + PART] for i in range(0, len(data), PART)]
        for k, d in enumerate(parts):
            open("%s.bin.%d" % (dst, k), "wb").write(d)
        layout["parts"] = len(parts)
    else:
        open(dst + ".bin", "wb").write(data)
    layout["bytes"] = len(data)
    json.dump(layout, open(dst + ".json", "w"))
    print(layout["name"], "version", layout["version"], "floats", n, "bytes", len(data))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
