"""Joseki data for the JOSEKI screen (src/joseki.js): corner sequences from pro (2000-2016) and AI-era (2016-2020) games, folded into one trie with counts per era.
from three sets of games in github.com/yenw/computer-go-dataset: pro games 1940-1999 and 2000-2016
(Professional/pro1940-1999.zip, pro2000+.zip) and games by the strong AIs of 2016-2020 (AI/: AlphaGo, FineArt, Golaxy...,
many against top pros), folded into one tree with a count per era. No engine is run: every move and number comes from games.
A corner's sequence is the moves inside its 10x10 quarter in game order; when one side plays there twice in a row a
"tt" (played elsewhere) goes in between, and from the third move on the sequence ends when nobody plays there for 8 moves (the count of
sequences that end at a node is the 4th number). Each sequence is turned so its corner is the top-left one and its first
move off the diagonal lies above it (x > y). Branches seen fewer than 12 times in either pro set and 6 times in the AI set
are left out.
usage: python3 -I joseki_extract.py pro1940-1999.txt pro2000+.txt <AI dir> joseki.json"""
import json, os, re, sys

MOVE = re.compile(r";\s*([BW])\[([a-s]{2})?\]")
MAXN = 18      # corner moves kept (tenuki markers included)
GAMEMOVES = 120


def games_pro(path):
    txt = open(path, encoding="utf-8", errors="ignore").read()
    for g in txt.split("\n"):
        if g.startswith("(;"):
            yield g


def games_ai(root):
    for d, _, fs in os.walk(root):
        for f in fs:
            if f.lower().endswith(".sgf"):
                try:
                    yield open(os.path.join(d, f), encoding="utf-8", errors="ignore").read()
                except Exception:
                    pass


def seqs(sgf):
    if re.search(r"\bA[BW]\[", sgf) or re.search(r"HA\[[1-9]", sgf) or ("SZ[19]" not in sgf and "SZ[" in sgf):
        return
    mv = [(c, s) for c, s in MOVE.findall(sgf)[:GAMEMOVES]]
    for cx in (0, 1):
        for cy in (0, 1):
            out, last, li = [], None, -1
            for i, (c, s) in enumerate(mv):
                if not s or s == "tt":
                    continue
                x, y = ord(s[0]) - 97, ord(s[1]) - 97
                if cx: x = 18 - x
                if cy: y = 18 - y
                if x > 9 or y > 9:
                    continue
                if len(out) >= 3 and i - li > 8:
                    break
                li = i
                if last == c:
                    out.append((("W" if c == "B" else "B"), None))
                out.append((c, (x, y)))
                last = c
                if len(out) >= MAXN:
                    break
            if not out or out[0][1] is None:
                continue
            first = out[0][0]
            flip = None
            for c, p in out:
                if p and p[0] != p[1]:
                    flip = p[0] < p[1]
                    break
            keys = []
            for c, p in out:
                if p is None:
                    keys.append("tt")
                else:
                    x, y = (p[1], p[0]) if flip else p
                    keys.append(chr(97 + x) + chr(97 + y))
            yield keys


def main(old, pro, aidir, outp):
    trie = {"o": 0, "c": 0, "a": 0, "k": {}}
    def add(keys, era):
        n = trie; n[era] += 1
        for k in keys:
            n = n["k"].setdefault(k, {"o": 0, "c": 0, "a": 0, "k": {}})
            n[era] += 1
        n["e" + era] = n.get("e" + era, 0) + 1
    gp = ga = go = 0
    for g in games_pro(old):
        go += 1
        for k in seqs(g): add(k, "o")
    for g in games_pro(pro):
        gp += 1
        for k in seqs(g): add(k, "c")
    for g in games_ai(aidir):
        ga += 1
        for k in seqs(g): add(k, "a")
    print("games", go, gp, ga, file=sys.stderr)
    def prune(n):
        n["k"] = {k: v for k, v in n["k"].items() if v["c"] >= 12 or v["a"] >= 6 or v["o"] >= 12}
        for v in n["k"].values(): prune(v)
    prune(trie)
    def cnt(n): return 1 + sum(cnt(v) for v in n["k"].values())
    print("nodes", cnt(trie), file=sys.stderr)
    trie["k"] = {k: v for k, v in trie["k"].items() if k in ("dd", "dc", "cc", "ed", "ec")}
    def pack(n):
        e = n.get("eo", 0) + n.get("ec", 0) + n.get("ea", 0)
        out = [n["o"], n["c"], n["a"], e]
        if n["k"]: out.append({k: pack(v) for k, v in sorted(n["k"].items(), key=lambda kv: -(kv[1]["o"] + kv[1]["c"] + kv[1]["a"]))})
        return out
    json.dump({"g": [go, gp, ga], "t": pack(trie)}, open(outp, "w"), separators=(",", ":"))


main(*sys.argv[1:])
