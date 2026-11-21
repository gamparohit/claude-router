// End-to-end check of the shipped logic.ts against the eval set: tier accuracy and SWE-bench paper cost.
// Uses stored Laya answers (eval/out/laya-typed-decisions.json) so it runs without the server.
// usage: node eval/check.mjs
import { readFileSync } from 'node:fs'
import { route, heuristic, TIERS } from '../logic.ts'
const d = p => JSON.parse(readFileSync(new URL(p, import.meta.url)))
const swe = Object.fromEntries(d('./data/swe_verified.json').map(r => [r.instance_id, r]))
const lab = Object.fromEntries([...d('./data/simple.json'), ...d('./data/author.json')].map(r => [r.id, r]))
const R = Object.fromEntries(['haiku', 'sonnet', 'opus'].map(m => [m, d(`./data/${m}.json`)]))
const rows = d('./out/laya-typed-decisions.json')
const gold = id => swe[id] ? 'medium' : lab[id].gold_tier
const text = id => swe[id]?.problem_statement ?? lab[id].text
const argmax = o => Object.keys(o).reduce((a, b) => (o[a] > o[b] ? a : b))

const policies = {
  'old: Laya tier argmax': r => argmax(r.tier),
  'old: keyword fallback (no length rule now)': r => heuristic(text(r.id)),
  'new: route()': r => route(r).tier,
}
const T = ['simple', 'medium', 'complex']
const main = t => TIERS[t].main.match(/haiku|sonnet|opus/)?.[0] ?? 'opus' // fable has no SWE data; price as opus
for (const [name, f] of Object.entries(policies)) {
  const recall = T.map(t => { const g = rows.filter(r => gold(r.id) === t); return g.filter(r => f(r) === t).length / g.length })
  let cost = 0, solved = 0, n = 0; const mix = { simple: 0, medium: 0, complex: 0 }
  for (const r of rows.filter(r => swe[r.id])) { const t = f(r), m = main(t); mix[t]++; cost += R[m][r.id].cost; solved += R[m][r.id].resolved; n++ }
  console.log(`${name.padEnd(44)} recall s/m/c ${recall.map(x => x.toFixed(2)).join('/')}  bal ${(recall.reduce((a, b) => a + b) / 3).toFixed(3)} | SWE main-model: ${(solved / n * 100).toFixed(1)}% solved, $${cost.toFixed(0)}, tiers ${mix.simple}/${mix.medium}/${mix.complex}`)
}

// What if medium's main model were different? (simple/complex as in TIERS)
for (const m of ['haiku', 'sonnet', 'opus']) {
  let cost = 0, solved = 0, n = 0
  for (const r of rows.filter(r => swe[r.id])) { const t = route(r).tier, mm = t === 'medium' ? m : main(t); cost += R[mm][r.id].cost; solved += R[mm][r.id].resolved; n++ }
  console.log(`new route(), medium main = ${m.padEnd(6)}  SWE: ${(solved / n * 100).toFixed(1)}% solved, $${cost.toFixed(0)}`)
}
