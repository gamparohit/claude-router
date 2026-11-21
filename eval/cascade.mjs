// Expected cost / solve rate on SWE-bench Verified (500 real issues, real per-task cost and outcome for
// Claude 4.5 Haiku/Sonnet/Opus) for the old router, the new classifier, and the new classifier + cascade.
// Expected values, no sampling. usage: node eval/cascade.mjs
import { readFileSync } from 'node:fs'
import { route } from '../logic.ts'
const d = p => JSON.parse(readFileSync(new URL(p, import.meta.url)))
const R = Object.fromEntries(['haiku', 'sonnet', 'opus'].map(m => [m, d(`./data/${m}.json`)]))
const swe = new Set(d('./data/swe_verified.json').map(r => r.instance_id))
const rows = d('./out/laya-typed-decisions.json').filter(r => swe.has(r.id))
const argmax = o => Object.keys(o).reduce((a, b) => (o[a] > o[b] ? a : b))
const c = (m, id) => R[m][id].cost, ok = (m, id) => +R[m][id].resolved

// f = cost of one verification pass as a share of an Opus solve on the same task (Fable priced as Opus).
// recall = share of real failures the validator flags; fpr = share of real successes it wrongly flags.
function run(policy, { f = 0, recall = 1, fpr = 0 } = {}) {
  let cost = 0, solved = 0
  for (const r of rows) {
    const id = r.id, { kind, model } = policy(r)
    if (kind === 'single') { cost += c(model, id); solved += ok(model, id); continue }
    if (kind === 'validated') { cost += c(model, id) + f * c('opus', id); solved += ok(model, id); continue }
    // cascade: haiku attempt -> opus verifies -> on FAIL, opus redo + one more verification
    const pEsc = ok('haiku', id) ? fpr : recall
    cost += c('haiku', id) + f * c('opus', id) + pEsc * (c('opus', id) + f * c('opus', id))
    solved += (1 - pEsc) * ok('haiku', id) + pEsc * ok('opus', id)
  }
  return { cost, solve: solved / rows.length }
}
const OLD = r => { const t = argmax(r.tier); return t === 'simple' ? { kind: 'single', model: 'haiku' } : t === 'medium' ? { kind: 'single', model: 'sonnet' } : { kind: 'validated', model: 'opus' } }
const NEW = r => { const t = route(r).tier; return t === 'simple' ? { kind: 'single', model: 'haiku' } : t === 'medium' ? { kind: 'single', model: 'sonnet' } : { kind: 'validated', model: 'opus' } }
const CASCADE = r => { const t = route(r).tier; return t === 'simple' ? { kind: 'single', model: 'haiku' } : t === 'medium' ? { kind: 'cascade' } : { kind: 'validated', model: 'opus' } }
const OPUS = () => ({ kind: 'single', model: 'opus' })

const fmt = (name, x, base) => console.log(`  ${name.padEnd(46)} ${(x.solve * 100).toFixed(1).padStart(5)}% solved  $${x.cost.toFixed(0).padStart(4)}  ${base ? `${(100 * (1 - x.cost / base.cost)).toFixed(0).padStart(3)}% cheaper than old router` : ''}`)
for (const f of [0.15, 0.3, 0.5]) {
  console.log(`\nverification pass costs ${f * 100}% of an Opus solve`)
  const old = run(OLD, { f })
  fmt('always opus (no router)', run(OPUS), old)
  fmt('old router (tier argmax)', old)
  fmt('new classifier, no cascade', run(NEW, { f }), old)
  for (const [recall, fpr] of [[1, 0], [0.8, 0.1], [0.6, 0.2]])
    fmt(`new + cascade, catches ${recall * 100}% / false alarm ${fpr * 100}%`, run(CASCADE, { f, recall, fpr }), old)
}

// Cheaper failure detectors. Expressed as f (share of an Opus solve): a Haiku reviewer pass ~ 0.44 x an
// Opus pass (Haiku solves cost 44% of Opus here); reading the executor's own test runs costs ~0.
const MED = m => r => { const t = route(r).tier; return t === 'simple' ? { kind: 'single', model: 'haiku' } : t === 'medium' ? { kind: 'single', model: m } : { kind: 'validated', model: 'opus' } }
console.log('\ncheap detectors (complex tasks still pay a 30% Opus-priced Fable pass)')
const old = run(OLD, { f: 0.3 })
fmt('old router (tier argmax)', old)
fmt('always opus (no router)', run(OPUS), old)
fmt('new, medium -> sonnet (current TIERS)', run(MED('sonnet'), { f: 0.3 }), old)
fmt('new, medium -> opus', run(MED('opus'), { f: 0.3 }), old)
fmt('new, medium -> haiku', run(MED('haiku'), { f: 0.3 }), old)
for (const [name, fMed] of [['test signal (free)', 0], ['haiku reviewer (f=0.13)', 0.13]])
  for (const [recall, fpr] of [[0.8, 0.1], [0.6, 0.2], [0.4, 0.1]]) {
    // complex keeps its 0.3 pass; medium uses the cheap detector
    let cost = 0, solved = 0
    for (const r of rows) {
      const id = r.id, t = route(r).tier
      if (t === 'simple') { cost += c('haiku', id); solved += ok('haiku', id) }
      else if (t === 'complex') { cost += 1.3 * c('opus', id); solved += ok('opus', id) }
      else {
        const pEsc = ok('haiku', id) ? fpr : recall
        cost += c('haiku', id) + fMed * c('opus', id) + pEsc * (c('opus', id) + fMed * c('opus', id))
        solved += (1 - pEsc) * ok('haiku', id) + pEsc * ok('opus', id)
      }
    }
    fmt(`new + cascade, ${name}, ${recall * 100}%/${fpr * 100}%`, { cost, solve: solved / rows.length }, old)
  }
