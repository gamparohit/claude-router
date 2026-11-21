# Fit the few thresholds of the new tier rule on 70% of the labelled prompts, report on the held-out 30%.
# Gold: CodeAlpaca + author quick asks = simple, SWE-bench Verified bug fixes = medium, author design/migration = complex.
import json, itertools, numpy as np, sys
from pathlib import Path
from explore import rows
O = Path(__file__).parent / 'out'
T = ['simple', 'medium', 'complex']

def gold(x): return 'medium' if x['src'] == 'swe' else x['gold']

def split(X, seed=0):  # stratified 70/30
    rng = np.random.default_rng(seed); tr, te = [], []
    for t in T:
        g = [x for x in X if gold(x) == t]; rng.shuffle(g); k = round(len(g) * .7); tr += g[:k]; te += g[k:]
    return tr, te

def rule(x, p):  # p = (q, e_lo, e_hi, r)
    q, e_lo, e_hi, r = p
    if x['question'] >= q or x['effort'] < e_lo: return 'simple'
    if x['effort'] >= e_hi and x['repro'] < r: return 'complex'
    return 'medium'

def bal_acc(X, f):  # mean per-class recall: the 500 SWE rows must not drown the 20 design rows
    return np.mean([np.mean([f(x) == t for x in X if gold(x) == t]) for t in T])

def current(x):  # the router as shipped: Laya tier argmax
    return max(x['tier'], key=x['tier'].get)

def confusion(X, f):
    m = {g: {p: 0 for p in T} for g in T}
    for x in X: m[gold(x)][f(x)] += 1
    return '  '.join(f"{g}->" + '/'.join(str(m[g][p]) for p in T) for g in T)

if __name__ != '__main__': grid = list(itertools.product([.5, .6, .7, .8, .9, 1.1], np.arange(.6, 1.81, .1), np.arange(1.6, 3.21, .1), [.3, .4, .5, .6, .7, 1.1]))
else: grid = list(itertools.product([.5, .6, .7, .8, .9, 1.1], np.arange(.6, 1.81, .1), np.arange(1.6, 3.21, .1), [.3, .4, .5, .6, .7, 1.1]))
def main():
  heur = {r['id']: r['tier'] for r in json.load(open(O / 'heuristic.json'))}
  for model in ['default', 'typed-decisions']:
      X = rows(model); tr, te = split(X)
      best = max(grid, key=lambda p: (round(bal_acc(tr, lambda x: rule(x, p)), 3), -abs(p[1] - 1.2) - abs(p[2] - 2.4)))
      print(f'\n=== {model}  best params q>={best[0]} effort<{best[1]:.1f}=simple effort>={best[2]:.1f}&repro<{best[3]}=complex')
      for name, f in [('keyword heuristic', lambda x: heur[x['id']]), ('current (tier argmax)', current), ('new rule', lambda x: rule(x, best))]:
          print(f'  {name:22} train {bal_acc(tr, f):.3f}  test {bal_acc(te, f):.3f}   test confusion gold->pred s/m/c: {confusion(te, f)}')
      # stability: refit on 5 other splits
      accs = []
      for s in range(1, 6):
          a, b = split(X, s); p = max(grid, key=lambda p: round(bal_acc(a, lambda x: rule(x, p)), 3)); accs.append(bal_acc(b, lambda x: rule(x, p)))
      print(f'  new rule, 5 other splits: test bal-acc {np.mean(accs):.3f} ± {np.std(accs):.3f}')
      json.dump({'model': model, 'q': best[0], 'e_lo': round(best[1], 2), 'e_hi': round(best[2], 2), 'r': best[3]}, open(O / f'fit-{model}.json', 'w'))

if __name__ == '__main__': main()