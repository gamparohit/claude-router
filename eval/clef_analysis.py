# Clef-Flash: (2) does anything predict Haiku failures inside the medium tier, (3) fitted cut-offs.
import json, numpy as np
from explore import auc, R
from fit import T, gold, split, rule, bal_acc, confusion, grid
from compare import rows
for fname, name in [('laya-typed-decisions.json', 'Laya'), ('clef-flash.json', 'Clef-Flash'), ('haiku-clean.json', 'Haiku')]:
    X = rows(fname); sw = [x for x in X if x['src'] == 'swe']
    for x in sw: x['haiku_fail'] = not R['haiku'][x['id']]['resolved']
    print(f'\n=== {name}: AUC on {len(sw)} SWE bug fixes (0.5 = useless), Haiku fail rate {np.mean([x["haiku_fail"] for x in sw]):.3f}')
    for k in ('effort', 'question', 'repro'):
        print(f'  {k:9} predicts haiku_fail: {auc([x[k] for x in sw], [x["haiku_fail"] for x in sw]):.3f}')
    # fitted cut-offs
    tr, te = split(X, 0)
    best = max(grid, key=lambda p: (round(bal_acc(tr, lambda x: rule(x, p)), 3), -abs(p[1] - 1.2) - abs(p[2] - 2.4)))
    print(f'  fitted on 70%: question>={best[0]} effort<{best[1]:.1f}=simple effort>={best[2]:.1f}&repro<{best[3]}=complex')
    print(f'  train {bal_acc(tr, lambda x: rule(x, best)):.3f}  test {bal_acc(te, lambda x: rule(x, best)):.3f}  test confusion {confusion(te, lambda x: rule(x, best))}')
    full = max(grid, key=lambda p: (round(bal_acc(X, lambda x: rule(x, p)), 3), -abs(p[1] - 1.2) - abs(p[2] - 2.4)))
    print(f'  fitted on all 570 (in-sample): q>={full[0]} e_lo={full[1]:.1f} e_hi={full[2]:.1f} r<{full[3]}  bal-acc {bal_acc(X, lambda x: rule(x, full)):.3f}  {confusion(X, lambda x: rule(x, full))}')
    for t in T:
        e = [x['effort'] for x in X if gold(x) == t]; print(f'  effort score {t:8} mean {np.mean(e):.2f}  p10-p90 {np.percentile(e,10):.2f}-{np.percentile(e,90):.2f}')
