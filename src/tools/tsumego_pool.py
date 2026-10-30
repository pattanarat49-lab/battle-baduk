# Usage: git clone https://github.com/sanderland/tsumego, then python3 tsumego_pool.py tsumego/problems pool.json
# Candidate problems: positions + first-move answers, each source tagged with a category and a nominal level range
# (0 = 10 kyu ... 9 = 1 kyu, 10 = 1 dan ... 13 = 4 dan).
import json, glob, os, sys, random
root, out = sys.argv[1], sys.argv[2]
T, I, A = '1a. Tsumego Beginner/', '1b. Tsumego Intermediate/', '1c. Tsumego Advanced/'
L, S = '2b. Lee Changho Tesuji/', '2a. Tesuji/'
SRC = [  # (category, folder, lo, hi, cap)
 ('life', T + 'Ishigure Ikuro 123 Basic Tsumego', 0, 3, 123), ('life', T + 'Cho Chikun Encyclopedia Life And Death - Elementary', 0, 2, 120),
 ('life', T + 'Yamada Kimio - Basic Tsumego ', 0, 3, 20), ('life', T + 'Fujisawa Shuuko - Collection Or Original Tsumego - Elementary', 1, 4, 40),
 ('life', I + 'Maeda Tsumego Collection - 10k-5k', 0, 5, 225), ('life', I + 'Maeda Nobuaki Newly Selected Tsumego 100 Problems For 1-8k', 2, 9, 100),
 ('life', I + 'Maeda Tsumego Collection - 1k-5k', 5, 9, 210), ('life', I + 'Ishida Akira Tsumego Masterpiece Kyu Level', 4, 9, 53),
 ('life', I + 'Fujisawa Shuuko - Collection Of Original Tsumego - Intermediate', 4, 9, 39), ('life', I + 'Cho Chikun Encyclopedia Life And Death - Intermediate', 3, 8, 120),
 ('life', A + 'Maeda Tsumego Collection - 1k-1d', 8, 10, 150), ('life', A + 'Ishigure Ikuro - Challenging Shodan Tsumego', 9, 11, 40),
 ('life', A + 'Cho Chikun Encyclopedia Life And Death - Advanced', 8, 12, 150), ('life', A + 'Ishida Akira Tsumego Masterpiece Dan Level', 10, 12, 50),
 ('life', A + 'Fujisawa Shuuko - Collection Or Original Tsumego - Advanced', 10, 12, 60), ('life', A + 'Yamada Kimio - Road To 3 Dan ', 9, 12, 108),
 ('life', A + 'Ishida Akira Tsumego Masterpiece High Dan Level', 12, 13, 14), ('life', A + 'Fujisawa Shuuko - Collection Or Original Tsumego - High Dan', 12, 13, 23),
 ('capture', L + '1. Fighting And Capturing', 0, 5, 123), ('capture', L + '2. Snapback And Shortage Of Liberties', 1, 7, 123),
 ('capture', L + '4. Net And Squeeze Tactics', 3, 9, 123), ('capture', L + '6.1 Capturing Race', 7, 13, 40),
 ('connect', L + '3.1 Connecting Groups', 0, 6, 28), ('connect', L + '3.2 Splitting Groups', 1, 8, 57), ('connect', L + '3.3 Settling Groups', 3, 8, 8),
 ('connect', L + '5.1 Connecting', 7, 13, 16), ('connect', L + '5.6 Escape', 7, 13, 10),
 ('endgame', L + '3.4 Endgame', 0, 7, 29), ('endgame', L + '5.3 End Game', 6, 11, 20), ('endgame', L + '6.3 Endgame', 8, 13, 42),
 ('tesuji', L + '5.2 Making Shape', 6, 11, 28), ('tesuji', L + '5.5 Attack', 7, 12, 32), ('tesuji', L + '6.2 Attack', 8, 13, 40),
 ('tesuji', S + 'Kobayashi Satoru 105 Basic Tesuji For 1~3 Dan', 9, 12, 104), ('tesuji', S + 'Go Seigen - Segoe Tesuji Dictionary', 0, 13, 300), ('tesuji', S + 'Tesuji Great Dictionary', 0, 13, 300),
]
random.seed(7); pool = []; seen = set()
for cat, d, lo, hi, cap in SRC:
    fs = sorted(glob.glob(os.path.join(root, d, '*.json'))); random.shuffle(fs); k = 0
    for f in fs:
        if k >= cap: break
        j = json.load(open(f)); sol = j['SOL']
        if not sol or any('Backup' in (s[3] or '') for s in sol): continue
        col = sol[0][0]
        if any(s[0] != col for s in sol) or col not in 'BW' or str(j.get('SZ', '19')) != '19': continue
        key = (tuple(sorted(j.get('AB', []))), tuple(sorted(j.get('AW', []))))
        if key in seen or not key[0] or not key[1]: continue
        seen.add(key); k += 1
        pool.append({'cat': cat, 'src': d.split('/')[-1].strip(), 'no': os.path.basename(f)[:-5], 'lo': lo, 'hi': hi,
                     'AB': j.get('AB', []), 'AW': j.get('AW', []), 'to': col, 'sol': [s[1] for s in sol]})
json.dump(pool, open(out, 'w'))
import collections; print(len(pool), collections.Counter(p['cat'] for p in pool))
