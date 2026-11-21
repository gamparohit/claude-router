# Which signals actually separate the routing classes? AUC per feature, per checkpoint.
import json, re, numpy as np
from pathlib import Path
D = Path(__file__).parent / 'data'; O = Path(__file__).parent / 'out'
swe = {r['instance_id']: r for r in json.load(open(D / 'swe_verified.json'))}
lab = {r['id']: r for r in json.load(open(D / 'simple.json')) + json.load(open(D / 'author.json'))}
R = {m: json.load(open(D / f'{m}.json')) for m in ['haiku', 'sonnet', 'opus']}
heur = {r['id']: r for r in json.load(open(O / 'heuristic.json'))}

def auc(score, y):
    s, y = np.asarray(score, float), np.asarray(y, bool)
    pos, neg = s[y], s[~y]
    if not len(pos) or not len(neg): return float('nan')
    gt = (pos[:, None] > neg[None, :]).mean(); eq = (pos[:, None] == neg[None, :]).mean()
    return gt + eq / 2

def text_feats(t):
    return {'len': len(t), 'traceback': int(bool(re.search(r'Traceback|Error:|Exception', t))),
            'code_blocks': t.count('```'), 'paths': len(set(re.findall(r'[\w/]+\.(?:py|ts|js|rs|go|java|c|cpp)\b', t))),
            'heur_tier': {'simple': 0, 'medium': 1, 'complex': 2}[heur_tier_of(t)]}
heur_tier_of = None

def rows(model):
    out = []
    for r in json.load(open(O / f'laya-{model}.json')):
        i = r['id']; f = {k: v for k, v in r.items() if k != 'id'}
        f['p_simple'] = f['tier']['simple']; f['p_complex'] = f['tier']['complex']
        f['e_tier'] = f['tier']['medium'] + 2 * f['tier']['complex']
        f['p_val_yes'] = f['validation']['yes']; f['e_band'] = f['band']['mid'] + 2 * f['band']['high']
        f['heur_tier'] = {'simple': 0, 'medium': 1, 'complex': 2}[heur[i]['tier']]
        t = swe[i]['problem_statement'] if i in swe else lab[i]['text']
        f['len'] = len(t); f['traceback'] = int(bool(re.search(r'Traceback|Error\b|Exception', t)))
        f['code_blocks'] = t.count('```')
        f['paths'] = len(set(re.findall(r'[\w/]+\.(?:py|ts|js|rs|go|java|c|cpp)\b', t)))
        if i in swe:
            f['src'] = 'swe'; f['diff'] = swe[i]['difficulty']
            f['haiku_fail'] = not R['haiku'][i]['resolved']
            f['hard'] = swe[i]['difficulty'] not in ('<15 min fix',)
        else:
            f['src'] = lab[i]['source']; f['gold'] = lab[i]['gold_tier']
        f['id'] = i; out.append(f)
    return out

FEATS = ['p_simple', 'p_complex', 'e_tier', 'effort', 'p_val_yes', 'e_band', 'question', 'security', 'data', 'concurrency', 'wide', 'spec', 'repro', 'heur_tier', 'len', 'traceback', 'code_blocks', 'paths']
if __name__ == '__main__':
    for model in ['default', 'typed-decisions']:
        X = rows(model)
        simple = [x for x in X if x.get('gold') == 'simple']; work = [x for x in X if x['src'] == 'swe' or x.get('gold') == 'complex']
        cplx = [x for x in X if x.get('gold') == 'complex']; sw = [x for x in X if x['src'] == 'swe']
        print(f'\n=== {model}   AUC (0.5 = useless; <0.5 = inverted)')
        print(f"{'feature':12} simple-vs-work  complex-vs-swe  swe:haiku_fail  swe:>=15min")
        for k in FEATS:
            a1 = auc([x[k] for x in work + simple], [1] * len(work) + [0] * len(simple))
            a2 = auc([x[k] for x in cplx + sw], [1] * len(cplx) + [0] * len(sw))
            a3 = auc([x[k] for x in sw], [x['haiku_fail'] for x in sw])
            a4 = auc([x[k] for x in sw], [x['hard'] for x in sw])
            print(f'{k:12} {a1:14.2f}  {a2:14.2f}  {a3:14.2f}  {a4:11.2f}')
