# Tsumego answer trees, step 3 of 3 (list -> build -> pack). Usage: python3 tsumego_pack.py ../../tsumego.json
# (reads the candidate lists from tsumego_list.py and runs5/*.jsonl from tsumego_build.js)
# Pack the solver's results (tsumego_build.js) into tsumego.json for the game: problems by level and category, each with its
# answer tree (every proven move at the player's turns, the opponent's reply, refutations of wrong moves).
import json, sys, glob, collections, math
items = {p['id']: p for f in ('all.json', 'more.json', 'dan.json') for p in json.load(open(f))}
# each source's nominal strength as a band on the ladder (0 = 15-13 kyu ... 7 = 5-7 dan); inside a band the
# solver's measures (length, single-answer turns, choices) split the problems over the band's two levels
TIER = {'Cho Chikun Encyclopedia Life And Death - Elementary': 0, 'Ishigure Ikuro 123 Basic Tsumego': 0, 'Yamada Kimio - Basic Tsumego': 0,
        'Fujisawa Shuuko - Collection Or Original Tsumego - Elementary': 1, 'Moves To Attack And Protect - Elementary': 1, 'Maeda Tsumego Collection - 10k-5k': 1,
        'Cho Chikun Encyclopedia Life And Death - Intermediate': 2, 'Maeda Nobuaki Newly Selected Tsumego 100 Problems For 1-8k': 2,
        'Fujisawa Shuuko - Collection Of Original Tsumego - Intermediate': 2, 'Moves To Attack And Protect - Intermediate': 2,
        '1 Year Tsumego': 2, 'Tsumego For The Millions Vol.2': 2, 'Enjoy Tsumego And Get Stronger': 2, 'Yamada Kimio - High Speed Attack Tsumego': 2,
        'Ishida Akira Tsumego Masterpiece Kyu Level': 3, 'Maeda Tsumego Collection - 1k-5k': 3, 'Fifty Three To Go': 3, '5.4 Life And Death': 3,
        'Cho Chikun Encyclopedia Life And Death - Advanced': 4, 'Maeda Tsumego Collection - 1k-1d': 4, 'Ishigure Ikuro - Challenging Shodan Tsumego': 4,
        'Fujisawa Shuuko - Collection Or Original Tsumego - Advanced': 4, 'Moves To Attack And Protect - Advanced': 4,
        'Ishida Akira Tsumego Masterpiece Dan Level': 5, 'Yamada Kimio - Road To 3 Dan': 5, 'Moments Of The Wind Vol.1': 5, 'Moments Of The Wind Vol.2': 5,
        'Moments Of The Wind Vol.3': 5, 'Famous Creations Three Hundred Selections': 5,
        'Ishida Akira Tsumego Masterpiece High Dan Level': 6, 'Fujisawa Shuuko - Collection Or Original Tsumego - High Dan': 6, 'Ishida Akira Tsumego Masterpiece Pro Level': 6}
LV = [("15–13 คิว", "เริ่มต้น"), ("12–10 คิว", "พื้นฐาน"), ("9–7 คิว", "ปานกลาง"), ("6–4 คิว", "กลางค่อนยาก"),
      ("3–1 คิว", "ยาก"), ("1–2 ดั้ง", "ระดับดั้ง"), ("3–4 ดั้ง", "ดั้งสูง"), ("5–7 ดั้ง", "สุดยอด")]
def compact(node):
    w = {}
    for m, v in node['w'].items(): w[m] = 0 if v == 0 else [v[0], compact(v[1])]
    r = node['r']; cnt = collections.Counter(r.values()); d = cnt.most_common(1)[0][0] if cnt else 'tt'
    out = {'w': w, 'd': d}
    ex = {k: v for k, v in r.items() if v != d}
    if ex: out['r'] = ex
    return out
def stats(node, depth=0):
    # player turns on the main line, how many of them have a single right move, and how many moves were possible
    n1 = 0; turns = 0; t = node
    while t:
        turns += 1; ws = list(t['w'].keys())
        if len(ws) == 1: n1 += 1
        v = t['w'][ws[0]]; t = v[1] if v else None
    return turns, n1, len(node['w']) + len(node['r'])
res = []
for f in glob.glob('runs5/*.jsonl'):
    for l in open(f):
        r = json.loads(l)
        if 'tree' not in r: continue
        it = items[r['id']]; src, no = r['id'].split('#')
        tree = r['tree']
        # at every turn the move with the shortest finish first (the book answer first among equals)
        def plen(node):
            best = None
            for m, v in node['w'].items():
                L = 1 if v == 0 else 2 + plen(v[1])
                node.setdefault('_len', {})[m] = L
                best = L if best is None else min(best, L)
            node['w'] = dict(sorted(node['w'].items(), key=lambda kv: (node['_len'][kv[0]], kv[0] not in it['ans'])))
            del node['_len']
            return best
        r['D'] = plen(tree)
        if not 3 <= r['D'] <= 7: continue
        w = tree['w']
        turns, n1, legal = stats(tree)
        score = r['D'] * .9 + n1 * .8 - (len(w) - 1) * .7 + math.log(max(legal, 2)) * .6
        cr = r['crop']
        res.append({'i': 'c' + str(abs(hash(r['id'])) % 10**9) if False else r['id'], 'src': src, 'n': no, 'score': score, 'tier': TIER.get(src.strip(), 2),
                    'c': 'kill' if it['to'] == r['att'] else 'live', 't': it['to'], 'b': ''.join(it['AB']), 'w': ''.join(it['AW']),
                    'k': [cr['x0'], cr['x1'], cr['y0'], cr['y1']], 'd': r['D'], 'a': compact(tree)})
import hashlib
srcs = []; out = []
bands = collections.defaultdict(list)
for q in res: bands[q['tier']].append(q)
for t, qs in bands.items():
    qs.sort(key=lambda q: (q['score'], q['src'], q['n']))
    for k, q in enumerate(qs):
        # the easier ~60% of a band on its lower level, the rest one up (the top band stays at the top)
        q['l'] = min(len(LV) - 1, t + (1 if k >= len(qs) * .6 else 0))
res.sort(key=lambda q: (q['l'], q['score'], q['src'], q['n']))
for q in res:
    if q['src'] not in srcs: srcs.append(q['src'])
    q['s'] = srcs.index(q['src'])
    q['i'] = hashlib.sha1((q['src'] + '#' + q['n']).encode()).hexdigest()[:8]
    del q['src'], q['score'], q['tier']
    out.append(q)
L = len(LV)
# lines the game's own ko rule refuses (found by playing every stored line in the game's engine); left out
SKIP = {'a31bb161', 'ef907dbe', '473153f7'}
out = [q for q in out if q['i'] not in SKIP]
data = {'v': 4, 'src': srcs, 'lv': [{'n': n, 'd': d} for n, d in LV], 'p': out}
s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
open(sys.argv[1], 'w').write(s)
print(len(out), 'problems', len(s) // 1024, 'KB')
c = collections.Counter((q['l'], q['c']) for q in out)
for l in range(L): print(LV[l], c[(l, 'kill')], c[(l, 'live')], collections.Counter(srcs[q['s']][:20] for q in out if q['l'] == l).most_common(3))
print('D', collections.Counter(q['d'] for q in out))
