// Runs every prompt in the dataset through local Laya (current + candidate questions), in parallel.
// usage: node eval/run-laya.mjs [model]   -> eval/out/laya-<model>.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const LAYA = 'http://127.0.0.1:8765/v1/systemone'
const model = process.argv[2] // undefined = server default
const dir = new URL('./data/', import.meta.url)
const load = f => JSON.parse(readFileSync(new URL(f, dir)))

const items = [
  ...load('swe_verified.json').map(r => ({ id: r.instance_id, text: r.problem_statement, source: 'swe' })),
  ...load('simple.json'),
  ...load('author.json'),
]

export const QUESTIONS = {
  // current router questions (hooks/index.ts)
  tier: { type: 'choice', instructions: 'How much engineering effort does this coding-assistant request need?',
    criteria: { simple: 'a question, explanation, tiny edit or single command', medium: 'a feature or bug fix touching a few files, with tests', complex: 'multi-file design, large refactor, migration, architecture or deep debugging' } },
  validation: { type: 'choice', instructions: 'After the orchestrator finishes, does the result need an independent verifier?',
    criteria: { no: 'answer, explanation, trivial or easily checked change; the orchestrator alone is enough', yes: 'risky or hard-to-check change: security, data loss, many files, subtle logic, or cannot be confirmed by a quick look' } },
  band: { type: 'choice', instructions: 'Within its kind, how demanding is this request to get right?',
    criteria: { low: 'well specified, one clear step, little ambiguity, easy to check', mid: 'several steps or some judgement calls, but the goal is clear', high: 'open ended or ambiguous, many interacting parts, long running or needs investigation' } },
  // candidates
  effort: { type: 'score', instructions: 'How much engineering effort does this coding request need?',
    criteria: ['answer a question or run one command', 'tiny edit in one place', 'feature or bug fix in a few files', 'multi-file change with design decisions', 'large refactor, migration, architecture or deep debugging'] },
  question: { type: 'noul', instructions: 'The user is only asking a question and wants no code changed.' },
  security: { type: 'noul', instructions: 'The request touches authentication, permissions, secrets or security.' },
  data: { type: 'noul', instructions: 'The request could lose or corrupt data, or changes a database schema or migration.' },
  concurrency: { type: 'noul', instructions: 'The request involves concurrency, race conditions, performance under load or intermittent failures.' },
  wide: { type: 'noul', instructions: 'The request changes many files or several services.' },
  spec: { type: 'noul', instructions: 'The request says exactly what to change, or already contains the fix.' },
  repro: { type: 'noul', instructions: 'The request includes an error message, traceback or steps to reproduce.' },
}

const ask = async it => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(LAYA, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: { body: it.text.slice(0, 2000) }, questions: QUESTIONS, ...(model && { model }) }) })
      const a = (await r.json()).answers
      const out = {}
      for (const [k, v] of Object.entries(a)) out[k] = v.type === 'noul' ? +v.noul : v.type === 'score' ? +v.score : Object.fromEntries(Object.entries(v.probabilities).map(([o, p]) => [o, +p]))
      return { id: it.id, ...out }
    } catch (e) { if (attempt === 2) return { id: it.id, error: String(e) } }
  }
}

const CONC = 8, res = new Array(items.length)
let next = 0, done = 0
const t0 = performance.now()
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < items.length) { const i = next++; res[i] = await ask(items[i]); if (++done % 100 === 0) console.error(`${done}/${items.length}`) }
}))
mkdirSync(new URL('./out/', import.meta.url), { recursive: true })
writeFileSync(new URL(`./out/laya-${model ?? 'default'}.json`, import.meta.url), JSON.stringify(res))
console.log(`${model ?? 'default'}: ${items.length} prompts, ${res.filter(r => r.error).length} errors, ${((performance.now() - t0) / 1000).toFixed(1)}s`)
