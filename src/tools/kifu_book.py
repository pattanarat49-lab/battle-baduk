#!/usr/bin/env python3
"""Builds an opening book from one player's game records (SGF): for every position up to MAXMOVE in which that player
was to move, the moves the player chose and how often. Only the book is kept, never the records themselves.

usage: kifu_book.py <dir with .sgf files> <out.json> <name substrings, comma separated>

Positions are keyed by the board, canonical over the 8 symmetries of the 19x19 board (the same rule as kifuKey in
src/nn_main.js), hashed with 32-bit FNV-1a; moves are stored as SGF coordinates in the canonical frame."""
import json, os, re, sys

N, MAXMOVE = 19, 60
T = [lambda x, y: (x, y), lambda x, y: (18 - x, y), lambda x, y: (x, 18 - y), lambda x, y: (18 - x, 18 - y),
     lambda x, y: (y, x), lambda x, y: (18 - y, x), lambda x, y: (y, 18 - x), lambda x, y: (18 - y, 18 - x)]
sg = lambda x, y: chr(97 + x) + chr(97 + y)


def fnv(s):
    h = 0x811C9DC5
    for ch in s.encode():
        h ^= ch; h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, "08x")


def key(stones, to_move):
    best, bt = None, 0
    for i, t in enumerate(T):
        b = sorted(sg(*t(x, y)) for (x, y), c in stones.items() if c == "B")
        w = sorted(sg(*t(x, y)) for (x, y), c in stones.items() if c == "W")
        k = to_move + ":" + "".join(b) + "|" + "".join(w)
        if best is None or k < best: best, bt = k, i
    return best, bt


def play(stones, x, y, c):
    o = "W" if c == "B" else "B"
    stones[(x, y)] = c
    def group(p):
        col, seen, st, libs = stones[p], {p}, [p], False
        while st:
            qx, qy = st.pop()
            for nx, ny in ((qx + 1, qy), (qx - 1, qy), (qx, qy + 1), (qx, qy - 1)):
                if not (0 <= nx < N and 0 <= ny < N): continue
                v = stones.get((nx, ny))
                if v is None: libs = True
                elif v == col and (nx, ny) not in seen: seen.add((nx, ny)); st.append((nx, ny))
        return seen, libs
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if stones.get((nx, ny)) == o:
            g, libs = group((nx, ny))
            if not libs:
                for q in g: del stones[q]


def main():
    src, out, names = sys.argv[1], sys.argv[2], [s.strip().lower() for s in sys.argv[3].split(",")]
    book, games = {}, 0
    for root, _, files in os.walk(src):
        for f in files:
            if not f.lower().endswith(".sgf"): continue
            t = open(os.path.join(root, f), encoding="utf-8", errors="replace").read()
            if re.search(r"SZ\[(?!19\])", t) or re.search(r"\bAB\[", t) or re.search(r"HA\[[1-9]", t): continue
            pb = (re.search(r"PB\[([^\]]*)\]", t) or [None, ""])[1].lower()
            pw = (re.search(r"PW\[([^\]]*)\]", t) or [None, ""])[1].lower()
            me = "B" if any(s in pb for s in names) else "W" if any(s in pw for s in names) else None
            if not me: continue
            games += 1
            stones = {}
            body = t[t.find(";", t.find(";") + 1):] if t.count(";") > 1 else ""
            body = body.split("(")[0]  # main line only
            for i, m in enumerate(re.finditer(r";\s*([BW])\[([a-s]{2})?\]", body)):
                if i >= MAXMOVE: break
                c, mv = m.group(1), m.group(2)
                if not mv: break  # a pass ends the opening
                x, y = ord(mv[0]) - 97, ord(mv[1]) - 97
                if c == me:
                    k, ti = key(stones, c)
                    cm = sg(*T[ti](x, y))
                    e = book.setdefault(fnv(k), {}); e[cm] = e.get(cm, 0) + 1
                play(stones, x, y, c)
    flat = {h: ",".join(m + str(n) for m, n in sorted(v.items(), key=lambda kv: -kv[1])) for h, v in book.items()}
    json.dump({"v": 1, "games": games, "maxMove": MAXMOVE, "book": flat}, open(out, "w"), separators=(",", ":"))
    print("games", games, "positions", len(flat), "bytes", os.path.getsize(out))


main()
