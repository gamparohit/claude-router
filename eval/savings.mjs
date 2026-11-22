// Router cost vs vanilla Claude on 500 SWE-bench Verified issues (real per-task cost/outcome, Claude 4.5, single agent).
// Policy = tier from the evaluator's cut-offs; simple -> haiku; medium -> haiku, escalate to opus when a free signal
// catches a failure (catch rate swept 40-80%, 10-20% false alarms, as in cascade.mjs); complex -> opus + a review pass (30% of an opus solve).
// usage: node --experimental-strip-types eval/savings.mjs
import { readFileSync } from 'node:fs'
import { route, EVALUATORS } from '../logic.ts'
const d = p => JSON.parse(readFileSync(new URL(p, import.meta.url)))
const R = Object.fromEntries(['haiku', 'sonnet', 'opus'].map(m => [m, d(`./data/${m}.json`)]))
const swe = new Set(d('./data/swe_verified.json').map(r => r.instance_id))
const c = (m, id) => R[m][id].cost, ok = (m, id) => +R[m][id].resolved
const sum = (ids, f) => ids.reduce((a, id) => a + f(id), 0)
const ids0 = [...swe]
const single = m => ({ cost: sum(ids0, id => c(m, id)), solved: sum(ids0, id => ok(m, id)) / ids0.length })
const vOpus = single('opus'), vSonnet = single('sonnet'), vHaiku = single('haiku')
const pct = (a, b) => (100 * (1 - a / b)).toFixed(0).padStart(3) + '%'
console.log(`vanilla (one model for everything): opus ${(vOpus.solved * 100).toFixed(1)}% $${vOpus.cost.toFixed(0)} | sonnet ${(vSonnet.solved * 100).toFixed(1)}% $${vSonnet.cost.toFixed(0)} | haiku ${(vHaiku.solved * 100).toFixed(1)}% $${vHaiku.cost.toFixed(0)}`)
// Haiku's evaluator call is a paid API request: measured $0.505 / 570 prompts via `claude -p` (includes CLI overhead), charged below.
const EVAL_COST = { laya: 0, clef: 0, haiku: 0.505 / 570 }
for (const [name, file] of [['laya', 'laya-typed-decisions'], ['clef', 'clef-flash'], ['haiku', 'haiku-clean']]) {
  const rows = d(`./out/${file}.json`).filter(r => swe.has(r.id)), cuts = EVALUATORS[name].cuts
  const n = { simple: 0, medium: 0, complex: 0 }; rows.forEach(r => n[route(r, cuts).tier]++)
  console.log(`\n${name}: SWE issues routed simple/medium/complex = ${n.simple}/${n.medium}/${n.complex}`)
  for (const [recall, fpr] of [[0.4, 0.1], [0.6, 0.2], [0.8, 0.1]]) {
    let cost = rows.length * EVAL_COST[name], solved = 0
    for (const r of rows) {
      const id = r.id, t = route(r, cuts).tier
      if (t === 'simple') { cost += c('haiku', id); solved += ok('haiku', id) }
      else if (t === 'complex') { cost += 1.3 * c('opus', id); solved += ok('opus', id) }
      else { const p = ok('haiku', id) ? fpr : recall; cost += c('haiku', id) + p * c('opus', id); solved += (1 - p) * ok('haiku', id) + p * ok('opus', id) }
    }
    const s = solved / rows.length * 100
    console.log(`  catches ${recall * 100}% / false alarms ${fpr * 100}%: ${s.toFixed(1)}% solved  $${cost.toFixed(0)}  saves ${pct(cost, vOpus.cost)} vs vanilla opus, ${pct(cost, vSonnet.cost)} vs vanilla sonnet; solve rate ${(s - vOpus.solved * 100).toFixed(1)} pts vs opus`)
  }
}
