"""Export a KataGo .bin.gz model (versions 8-10) to a flat float16 weight file + JSON layout for TF.js (NHWC)."""
import json, sys
import numpy as np
import convert as C

def main(src, dst_prefix):
    m = C.parse(src)
    tensors, chunks, off = [], [], 0
    def add(name, arr):
        nonlocal off
        a = np.ascontiguousarray(arr, dtype=np.float32)
        tensors.append({"name": name, "shape": list(a.shape), "offset": off})
        chunks.append(a.astype(np.float16).tobytes()); off += a.size
    def conv(name, c): add(name, c["w"].transpose(2, 3, 1, 0))  # [oc,ic,y,x] -> [y,x,ic,oc]
    def bn(name, b): add(name + ".s", b["scale"]); add(name + ".b", b["bias"])
    t = m["trunk"]
    conv("init.conv", t["initConv"]); add("init.mm", t["initMatMul"]["w"])
    kinds = []
    for i, b in enumerate(t["blocks"]):
        p = "b%d." % i; kinds.append(b["kind"])
        bn(p + "pre", b["preBN"]); conv(p + "conv1", b["regularConv"])
        if b["kind"] == "gpool_block":
            conv(p + "gconv", b["gpoolConv"]); bn(p + "gbn", b["gpoolBN"]); add(p + "gmm", b["gpoolToBiasMul"]["w"])
        bn(p + "mid", b["midBN"]); conv(p + "conv2", b["finalConv"])
    bn("tip", t["tipBN"])
    p = m["policy"]
    conv("p.p1", p["p1Conv"]); conv("p.g1", p["g1Conv"]); bn("p.g1bn", p["g1BN"]); add("p.gmm", p["gpoolToBiasMul"]["w"])
    bn("p.p1bn", p["p1BN"]); conv("p.p2", p["p2Conv"]); add("p.pass", p["gpoolToPassMul"]["w"])
    v = m["value"]
    conv("v.v1", v["v1Conv"]); bn("v.v1bn", v["v1BN"]); add("v.v2", v["v2Mul"]["w"]); add("v.v2b", v["v2Bias"]["w"])
    add("v.v3", v["v3Mul"]["w"]); add("v.v3b", v["v3Bias"]["w"]); add("v.sv3", v["sv3Mul"]["w"]); add("v.sv3b", v["sv3Bias"]["w"])
    conv("v.own", v["ownConv"])
    open(dst_prefix + ".bin", "wb").write(b"".join(chunks))
    json.dump({"name": m["name"], "version": m["version"], "blocks": kinds, "tensors": tensors, "dtype": "float16"}, open(dst_prefix + ".json", "w"))
    print(m["name"], "floats", off, "bytes", off * 2)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
