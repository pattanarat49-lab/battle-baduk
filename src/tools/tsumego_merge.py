# Keep the problems whose book answer the network agrees with and whose answer line runs five moves (the player's three
# and two replies), with the alternatives the network rates as good at each of the player's turns and the komi.
# Usage: python3 tsumego_merge.py out.json cand1.json res1a.json,res1b.json [cand2.json res2.json ...]
import json, sys, collections
out = sys.argv[1]; keep = []; src = []; n = 0
PRIOR = ('pool.json', 'prior.json')  # the candidate pool and its priors (tsumego_pool.py, tsumego_rank.js)
for cf, rf in zip(sys.argv[2::2], sys.argv[3::2]):
    d = json.load(open(cf)); res = {}
    for f in rf.split(','):
        for r in json.load(open(f)): res[r['i']] = r
    n += len(res)
    for i, q in enumerate(d['p']):
        r = res.get(i)
        if not r or r.get('doubt') or r.get('err') or len(r.get('line') or '') < 10: continue
        name = d['src'][q['s']]
        if name not in src: src.append(name)
        x = r['alt'][:3]
        while x and not x[-1]: x.pop()
        q = dict(q, s=src.index(name), m=r['line'][:10], k=r['komi'])
        if x: q['x'] = x
        keep.append(q)
# Levels were too hard from 7 kyu up (user, 2026-10-30): a ladder level now takes problems from about 0.7 of its old
# level, ordered inside an old level by the network's prior for the book answer (easier first).
pool, prior = json.load(open(PRIOR[0])), json.load(open(PRIOR[1]))
pr = {}
for r in prior: q = pool[r['i']]; pr[(q['src'], q['no'])] = r['prior']
by = collections.defaultdict(list)
for q in keep: by[q['l']].append(q)
for l, qs in by.items():
    qs.sort(key=lambda q: -pr.get((src[q['s']], q['n']), 0))
    for k, q in enumerate(qs): q['l'] = round((l - 0.5 + (k + 0.5) / len(qs)) / 0.7)
keep = [q for q in keep if q['l'] <= 13]
json.dump({'src': src, 'p': keep}, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
t = collections.Counter(q['l'] for q in keep)
print(n, 'worked out,', len(keep), 'kept; per level', [t[l] for l in range(14)])
print('per category', collections.Counter(q['c'] for q in keep))
