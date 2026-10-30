# More candidates for the level ladder: every usable problem placed at a level (as tsumego_assign.py does, without the
# per-level cap), minus the ones already worked out, up to `per` per level.
import json, sys, collections, random
pool, prior, done_f, out, per = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), sys.argv[3], sys.argv[4], int(sys.argv[5])
for r in prior: pool[r['i']].update(prior=r['prior'], top=r['top'], legal=r['legal'], okTo=r['okTo'])
ok = [q for q in pool if q.get('legal') and q.get('okTo') and (q['prior'] >= 0.001 or q['top'])]
by = collections.defaultdict(list)
for q in ok: by[(q['cat'], q['src'])].append(q)
for qs in by.values():
    qs.sort(key=lambda q: -q['prior'])
    for k, q in enumerate(qs):
        q['lvl'] = min(13, max(0, round(q['lo'] + (q['hi'] - q['lo']) * k / max(1, len(qs) - 1))))
done = json.load(open(done_f)); seen = {(done['src'][q['s']], q['n']) for q in done['p']}
random.seed(5); cells = collections.defaultdict(list)
for q in ok:
    if (q['src'], q['no']) not in seen: cells[q['lvl']].append(q)
src = sorted({q['src'] for q in ok}); pick = []
for l in range(14):
    qs = cells[l]; random.shuffle(qs)
    # mix the categories inside a level
    bc = collections.defaultdict(list)
    for q in qs: bc[q['cat']].append(q)
    got = []
    while len(got) < per and any(bc.values()):
        for c in sorted(bc):
            if bc[c] and len(got) < per: got.append(bc[c].pop())
    pick += got
data = {'src': src, 'p': [{'c': q['cat'], 'l': q['lvl'], 's': src.index(q['src']), 'n': q['no'], 'b': ''.join(q['AB']), 'w': ''.join(q['AW']), 't': q['to'], 'a': q['sol']} for q in pick]}
json.dump(data, open(out, 'w'), ensure_ascii=False)
print(len(pick), collections.Counter(q['lvl'] for q in pick))
