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


ACTS = {"ACTIVATION_RELU": "relu", "ACTIVATION_MISH": "mish", "ACTIVATION_SILU": "silu", "ACTIVATION_IDENTITY": "id"}


def parse(path):
    r = Reader(gzip.open(path).read())
    name = r.tok(); ver = r.int()
    assert 8 <= ver <= 15, "model version %d not supported" % ver
    nin = r.int(); nglob = r.int()
    post = dict(scoreMean=20.0, lead=20.0)
    if ver >= 13:
        td = r.float(); post["scoreMean"] = r.float(); r.float(); post["lead"] = r.float(); r.float(); r.float(); r.float()
    if ver >= 15:
        meta = r.int(); assert meta == 0, "SGF-metadata (human) nets are not supported here"
        extra = [r.int() for _ in range(7)]
        assert all(e in (0, 1) for e in extra[:2]) and not any(extra[2:]), extra

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
            else:
                raise ValueError("unsupported block kind " + kind)
            out.append(b)
        return out

    # trunk
    r.tok(); nblocks = r.int(); r.int(); r.int(); r.int(); r.int(); r.int()
    if ver >= 15:
        norm = r.int(); assert norm == 0, "only standard batchnorm trunks are supported"
        assert not any(r.int() for _ in range(5))
    conv("init.conv"); matmul("init.mm")
    tree = stack(nblocks, "b")
    bn("tip"); tipAct = act()

    # policy head
    r.tok()
    conv("p.p1"); conv("p.g1"); bn("p.g1bn"); g1Act = act(); matmul("p.gmm"); bn("p.p1bn"); p1Act = act()
    pch = conv("p.p2"); matmul("p.pass")
    passAct = None
    if ver >= 15:
        matbias("p.passb"); passAct = act(); matmul("p.pass2")
    # value head
    r.tok()
    conv("v.v1"); bn("v.v1bn"); v1Act = act(); matmul("v.v2"); matbias("v.v2b"); v2Act = act()
    matmul("v.v3"); matbias("v.v3b"); matmul("v.sv3"); matbias("v.sv3b"); conv("v.own")

    layout = {"name": name, "version": ver, "format": 2, "dtype": "float16", "tree": tree,
              "acts": {"tip": tipAct, "g1": g1Act, "p1": p1Act, "pass": passAct, "v1": v1Act, "v2": v2Act},
              "policyChannels": pch, "scoreMul": post["scoreMean"] / 20.0, "leadMul": post["lead"] / 20.0,
              "tensors": tensors}
    return layout, b"".join(chunks), off[0]


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
