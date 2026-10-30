# Usage: python3 tsumego_assign.py pool.json prior.json ../../tsumego.json
# Place each candidate at a level: its source's nominal range, ordered inside the source by how natural the book
# answer looks to the network (a high prior is an easier problem). Then keep a balanced set per category and level.
import json, sys, collections, random
pool, prior, out = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), sys.argv[3]
CAP = {'life': 16, 'capture': 10, 'connect': 8, 'tesuji': 10, 'endgame': 8}
for r in prior: pool[r['i']].update(prior=r['prior'], top=r['top'], legal=r['legal'], okTo=r['okTo'])
ok = [q for q in pool if q.get('legal') and q.get('okTo') and (q['prior'] >= 0.001 or q['top'])]
by = collections.defaultdict(list)
for q in ok: by[(q['cat'], q['src'])].append(q)
for qs in by.values():
    qs.sort(key=lambda q: -q['prior'])
    for k, q in enumerate(qs):
        f = k / max(1, len(qs) - 1)
        q['lvl'] = min(13, max(0, round(q['lo'] + (q['hi'] - q['lo']) * f)))
random.seed(3); keep = []
cells = collections.defaultdict(lambda: collections.defaultdict(list))
for q in ok: cells[(q['cat'], q['lvl'])][q['src']].append(q)
for (cat, l), srcs in sorted(cells.items()):
    for v in srcs.values(): random.shuffle(v)
    pick, names = [], sorted(srcs)
    while len(pick) < CAP[cat] and any(srcs[n] for n in names):
        for n in names:
            if srcs[n] and len(pick) < CAP[cat]: pick.append(srcs[n].pop())
    pick.sort(key=lambda q: -q['prior'])
    keep += pick
src = sorted({q['src'] for q in keep})
data = {'src': src, 'p': [{'c': q['cat'], 'l': q['lvl'], 's': src.index(q['src']), 'n': q['no'], 'b': ''.join(q['AB']), 'w': ''.join(q['AW']), 't': q['to'], 'a': q['sol']} for q in keep]}
json.dump(data, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(pool), 'usable', len(ok), 'kept', len(keep))
t = collections.Counter((q['cat'], q['lvl']) for q in keep)
for cat in CAP: print(cat, [t[(cat, l)] for l in range(14)])
