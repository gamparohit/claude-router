# Paper cost simulation on SWE-bench Verified using real per-task cost/outcome
# (mini-swe-agent v2.0.0, Claude 4.5 Haiku/Sonnet/Opus, effort=high, 1 attempt each).
import json, numpy as np, sys
from pathlib import Path
from explore import rows
D = Path(__file__).parent / 'data'
R = {m: json.load(open(D / f'{m}.json')) for m in ['haiku', 'sonnet', 'opus']}
model = sys.argv[1] if len(sys.argv) > 1 else 'typed-decisions'
sw = [x for x in rows(model) if x['src'] == 'swe']
ids = [x['id'] for x in sw]
cost = {m: np.array([R[m][i]['cost'] for i in ids]) for m in R}
ok = {m: np.array([R[m][i]['resolved'] for i in ids]) for m in R}
N = len(ids)

def report(name, pick):  # pick: array of model names per task
    c = sum(cost[m][j] for j, m in enumerate(pick)); s = sum(ok[m][j] for j, m in enumerate(pick))
    print(f'  {name:48} solve {s / N:6.1%}  cost ${c:7.2f}  ($/solve {c / s:.3f})')
    return c, s

print(f'SWE-bench Verified, {N} tasks, Laya checkpoint={model}\n-- fixed')
for m in R: report(f'always {m}', [m] * N)
best = [next((m for m in R if ok[m][j]), 'haiku') for j in range(N)]
report('oracle: cheapest model that solved it', best)

print('-- per-prompt routing: top X% by score -> opus, rest -> haiku (25% / 50%)')
rng = np.random.default_rng(0)
for feat in ['e_tier', 'effort', 'len', 'heur_tier', 'random', 'human_difficulty']:
    if feat == 'random': s = rng.random(N)
    elif feat == 'human_difficulty': s = np.array([['<15 min fix', '15 min - 1 hour', '1-4 hours', '>4 hours'].index(x['diff']) + rng.random() * .1 for x in sw])
    else: s = np.array([x[feat] for x in sw], float) + rng.random(N) * 1e-9
    for frac in (.25, .5):
        cut = np.quantile(s, 1 - frac)
        report(f'{feat:16} top {frac:.0%} -> opus', ['opus' if v >= cut else 'haiku' for v in s])

print('-- cascade: haiku first, escalate to opus when the attempt is judged failed')
# detector recall r = share of real haiku failures caught; fpr = share of real successes wrongly escalated
for r, fpr in [(1, 0), (.8, .1), (.6, .2)]:
    c = s = 0
    for j in range(N):
        c += cost['haiku'][j]
        flagged = rng.random() < (r if not ok['haiku'][j] else fpr)
        if flagged: c += cost['opus'][j]; s += ok['opus'][j]
        else: s += ok['haiku'][j]
    print(f'  {"haiku -> opus, catch " + f"{r:.0%} fails, {fpr:.0%} false alarms":48} solve {s / N:6.1%}  cost ${c:7.2f}  ($/solve {c / s:.3f})')
