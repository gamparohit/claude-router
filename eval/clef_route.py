# Does Clef's effort score help route SWE bug fixes? Send the top-k% by effort to Opus, rest to Haiku; compare with a random k% mix.
import numpy as np
from explore import R
from compare import rows
X = [x for x in rows('clef-flash.json') if x['src'] == 'swe']
c = lambda m, i: R[m][i]['cost']; ok = lambda m, i: float(R[m][i]['resolved'])
rng = np.random.default_rng(0); X.sort(key=lambda x: -x['effort'])
n = len(X); ids = [x['id'] for x in X]
print('top-k% by Clef effort -> opus, rest -> haiku   (random mix of same k% in brackets, mean of 200 draws)')
for k in (0, .1, .2, .3, .5, 1):
    m = round(n * k); s = lambda sel: (sum(c('opus', i) if i in sel else c('haiku', i) for i in ids), 100 * sum(ok('opus', i) if i in sel else ok('haiku', i) for i in ids) / n)
    cost, solved = s(set(ids[:m]))
    rs = [s(set(rng.choice(ids, m, replace=False))) for _ in range(200)] if 0 < m < n else [(cost, solved)]
    print(f'  k={k:>4.0%}  solved {solved:5.1f}% cost ${cost:5.0f}   [random: {np.mean([r[1] for r in rs]):5.1f}% ${np.mean([r[0] for r in rs]):5.0f}]')
