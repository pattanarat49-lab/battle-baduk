# Tsumego answer trees, step 1 of 3 (list -> build -> pack).
# Usage: git clone https://github.com/sanderland/tsumego; python3 tsumego_list.py list.json "<folder under tsumego/problems>" ...
# Candidate problems: positions + book first-move answers (Ten Thousand Tsumego).
import json,glob,os,sys
root='tsumego/problems/'
out=[]
for d in sys.argv[2:]:
    for f in sorted(glob.glob(root+d+'/*.json')):
        j=json.load(open(f)); sol=j.get('SOL') or []
        if not sol or str(j.get('SZ','19'))!='19': continue
        col=sol[0][0]
        if any(s[0]!=col for s in sol) or col not in 'BW': continue
        if not j.get('AB') or not j.get('AW'): continue
        out.append({'id':d.split('/')[-1].strip()+'#'+os.path.basename(f)[:-5],'AB':j['AB'],'AW':j['AW'],'to':col,'ans':[s[1] for s in sol]})
json.dump(out,open(sys.argv[1],'w')); print(len(out))
