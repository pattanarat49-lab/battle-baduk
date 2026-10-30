# A smaller set to work out full answer lines for: a few problems per category and level (plus spares).
import json, sys, random, collections
d = json.load(open(sys.argv[1])); out = sys.argv[2]
N = {'life': 5, 'capture': 4, 'connect': 3, 'tesuji': 4, 'endgame': 3}
random.seed(11); cells = collections.defaultdict(list)
for q in d['p']: cells[(q['c'], q['l'])].append(q)
pick = []
for k, qs in sorted(cells.items()):
    random.shuffle(qs); pick += qs[:N[k[0]]]
json.dump({'src': d['src'], 'p': pick}, open(out, 'w'), ensure_ascii=False)
print(len(pick))
