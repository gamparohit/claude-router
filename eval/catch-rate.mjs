// Summarises the router's log: ~/.claude-router/log.jsonl, one line per routed prompt, counts only (no prompt text).
// usage: node eval/catch-rate.mjs [file]
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
const file = process.argv[2] ?? `${process.env.ROUTER_HOME ?? homedir() + '/.claude-router'}/log.jsonl`
const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const n = f => rows.filter(f).length, pct = (a, b) => (b ? `${(100 * a / b).toFixed(0)}%` : 'n/a')
const by = k => Object.entries(rows.reduce((m, r) => ({ ...m, [r[k]]: (m[r[k]] ?? 0) + 1 }), {})).map(([v, c]) => `${v} ${c}`).join(', ')
console.log(`${rows.length} routed prompts in ${file}`)
console.log(`tier: ${by('tier')}\nevaluator: ${by('evaluator')}\ndecided by: ${by('via')}   (a high "fallback" share means the evaluator is not answering)`)

const work = rows.filter(r => r.tier !== 'simple'), esc = work.filter(r => r.escalated)
console.log(`\nmedium + complex prompts: ${work.length}; with at least one Agent call: ${work.filter(r => r.agents).length}; with a test command seen: ${work.filter(r => r.tests).length}`)
console.log(`escalated: ${esc.length} (${pct(esc.length, work.length)})  by signal: ${['status', 'test', 'verdict'].map(s => `${s} ${esc.filter(r => r.escalated === s).length}`).join(', ')}`)
console.log(`after escalating, the retry said: done ${esc.filter(r => r.retry === 'done').length}, failed ${esc.filter(r => r.retry === 'failed').length}, nothing ${esc.filter(r => !r.retry).length}`)

// Known misses: never escalated, yet the last test command of the prompt failed. A failure with no failing test
// leaves no trace here, so this counts only some of the misses and the catch rate below is an upper bound.
const missed = work.filter(r => !r.escalated && r.lastTestFailed === true).length
console.log(`not escalated but the last test run failed: ${missed}`)
console.log(`catch rate, upper bound: ${pct(esc.length, esc.length + missed)}  (failures caught / (caught + known misses))`)
