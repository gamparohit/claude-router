# Scores the Haiku evaluator on the SWE-chat sample. SWE-chat has no simple/medium/complex labels, so this checks the
# scores against what happened after each prompt: tool calls, "Action" tool calls (as the dataset labels them) and files
# touched. Word count is the baseline a useful evaluator has to beat.
# usage: .venv/bin/python eval/swechat_sample.py
#        node --experimental-strip-types eval/run-sample.mjs ~/.claude-router/swe-chat/sample.json ~/.claude-router/swe-chat/out-haiku.json
#        .venv/bin/python eval/swechat_score.py
import json, re, numpy as np
from pathlib import Path
D = Path.home() / '.claude-router' / 'swe-chat'
S = json.load(open(D / 'sample.json'))
R = {r['id']: r for r in json.load(open(D / 'out-haiku.json')) if 'error' not in r}
# the shipped cut-offs, read from logic.ts so this never drifts from the plugin
C = {k: float(v) for k, v in re.findall(r'(\w+): ([\d.]+)', re.search(r'export const CUTS = \{([^}]*)\}', (Path(__file__).parent.parent / 'logic.ts').read_text()).group(1))}
T = ['simple', 'medium', 'complex']

def rank(a):
    a = np.asarray(a, float); o = a.argsort(); r = np.empty(len(a)); r[o] = np.arange(len(a))
    for v in np.unique(a): m = a == v; r[m] = r[m].mean()
    return r
def spearman(a, b): return float(np.corrcoef(rank(a), rank(b))[0, 1])
def auc(score, y):
    s, y = np.asarray(score, float), np.asarray(y, bool); p, n = s[y], s[~y]
    return float((p[:, None] > n[None, :]).mean() + (p[:, None] == n[None, :]).mean() / 2) if len(p) and len(n) else float('nan')
def tier(x):
    if x['question'] >= C['question'] or x['effort'] < C['simple']: return 'simple'
    return 'complex' if x['effort'] >= C['complex'] and x['repro'] < C['repro'] else 'medium'

X = [s for s in S if s['id'] in R]
print(f'{len(X)} of {len(S)} prompts scored; first prompts {sum(x["first"] for x in X)}, follow-ups {sum(not x["first"] for x in X)}; cut-offs {C}')
groups = [('all', X), ('first prompts', [x for x in X if x['first']]), ('follow-ups', [x for x in X if not x['first']])]

print('\n1. Does the effort score track the work that followed? Spearman correlation (0 = none, 1 = perfect)')
print(f"   {'':15}{'scorer':8} tools  actions  files")
for g, rows in groups:
    for name, sc in [('words', [x['words'] for x in rows]), ('haiku', [R[x['id']]['effort'] for x in rows])]:
        print(f"   {g:15}{name:8} {spearman(sc, [x['tools'] for x in rows]):5.2f}  {spearman(sc, [x['actions'] for x in rows]):6.2f}  {spearman(sc, [x['files'] for x in rows]):5.2f}")

print('\n2. Does the "only a question" score find prompts with no Action tool call after them? AUC (0.5 = useless)')
for g, rows in groups:
    q = [R[x['id']]['question'] for x in rows]
    print(f"   {g:15}no action: {auc(q, [x['actions'] == 0 for x in rows]):.2f}   intent 'understand': {auc(q, [x['intent'] == 'understand' for x in rows]):.2f}   (no-action share {np.mean([x['actions'] == 0 for x in rows]):.0%})")

print('\n3. Tiers assigned, and the work that followed each: prompts (median tools, share with any action)')
for g, rows in groups:
    parts = []
    for t in T:
        m = [x for x in rows if tier(R[x['id']]) == t]
        parts.append(f"{t} {len(m):3d} ({np.median([x['tools'] for x in m]) if m else 0:4.1f} tools, {np.mean([x['actions'] > 0 for x in m]) if m else 0:.0%} act)")
    print(f"   {g:15}" + '   '.join(parts))

print('\n4. Can the prompt predict that the user pushed back next (correction, rejection or failure report)? AUC')
Y = [x for x in X if x['next_pushback']]; bad = [x['next_pushback'] != 'non_pushback' for x in Y]
print(f"   {len(Y)} prompts with a labelled next prompt, {np.mean(bad):.0%} pushback: words {auc([x['words'] for x in Y], bad):.2f}  haiku effort {auc([R[x['id']]['effort'] for x in Y], bad):.2f}")

print('\n5. Short follow-ups (6 words or fewer: the sticky rule keeps their tier instead of classifying them)')
for g, rows in [('short', [x for x in X if not x['first'] and x['words'] <= 6]), ('longer', [x for x in X if not x['first'] and x['words'] > 6])]:
    print(f"   {g:7}{len(rows):4d} prompts: median tools {np.median([x['tools'] for x in rows]):.1f}, with any action {np.mean([x['actions'] > 0 for x in rows]):.0%}, called simple by haiku {np.mean([tier(R[x['id']]) == 'simple' for x in rows]):.0%}")
