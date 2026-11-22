# Laya vs Clef-Flash on the same 570 prompts, same 3 questions, same metric as fit.py.
# usage: .venv/bin/python eval/compare.py   (needs out/laya-typed-decisions.json and out/clef-flash.json)
import json, numpy as np, re
from pathlib import Path
from explore import swe, lab, heur
from fit import T, gold, split, rule, bal_acc, confusion
import itertools
O = Path(__file__).parent / 'out'
CUTS = (0.8, 1.8, 2.5, 0.3)  # shipped: question, simple, complex, repro

def rows(fname):
    out = []
    for r in json.load(open(O / fname)):
        i = r['id']; x = {k: r[k] for k in ('effort', 'question', 'repro')}; x['id'] = i
        if i in swe: x['src'] = 'swe'
        else: x['src'] = lab[i]['source']; x['gold'] = lab[i]['gold_tier']
        out.append(x)
    return out

grid = list(itertools.product([.5, .6, .7, .8, .9, 1.1], np.arange(.6, 1.81, .1), np.arange(1.6, 3.21, .1), [.3, .4, .5, .6, .7, 1.1]))
def refit(tr, te):
    p = max(grid, key=lambda p: (round(bal_acc(tr, lambda x: rule(x, p)), 3), -abs(p[1] - 1.2) - abs(p[2] - 2.4)))
    return bal_acc(te, lambda x: rule(x, p))

for name, f in [('Laya typed-decisions', 'laya-typed-decisions.json'), ('Clef-Flash 4-bit', 'clef-flash.json'), ('Haiku', 'haiku-clean.json')]:
    X = rows(f); n_each = {t: sum(gold(x) == t for x in X) for t in T}
    print(f'\n=== {name}  ({len(X)} prompts; gold {n_each})')
    print(f'  shipped cut-offs, all 570 : bal-acc {bal_acc(X, lambda x: rule(x, CUTS)):.3f}   gold->pred s/m/c: {confusion(X, lambda x: rule(x, CUTS))}')
    for t in T:
        g = [x for x in X if gold(x) == t]; print(f'     recall {t:8} {np.mean([rule(x, CUTS) == t for x in g]):.3f}')
    accs = []
    for s in range(6):
        tr, te = split(X, s); accs.append(refit(tr, te))
    print(f'  refit on 70% / test 30%, 6 splits: {np.mean(accs):.3f} ± {np.std(accs):.3f}')
