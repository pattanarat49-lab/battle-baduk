# Keep the problems whose book answer the network agrees with, with their answer lines, alternatives and komi.
import json, sys, glob, collections
d = json.load(open(sys.argv[1])); out = sys.argv[2]
res = {}
for f in sys.argv[3:]:
    for r in json.load(open(f)): res[r['i']] = r
keep = []
for i, q in enumerate(d['p']):
    r = res.get(i)
    if not r or r.get('doubt') or r.get('err') or not r.get('line'): continue
    x = r['alt'][:3]  # at most five moves: three of the player's, two replies (the network answers the last one live)
    while x and not x[-1]: x.pop()
    q = dict(q, m=r['line'][:10], k=r['komi'])
    if x: q['x'] = x
    keep.append(q)
json.dump({'src': d['src'], 'p': keep}, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
t = collections.Counter((q['c'], q['l']) for q in keep)
print(len(res), 'done', len(keep), 'kept')
for c in ['life', 'capture', 'connect', 'tesuji', 'endgame']: print(c, [t[(c, l)] for l in range(14)])
print('line lengths', collections.Counter(len(q['m']) // 2 for q in keep))
