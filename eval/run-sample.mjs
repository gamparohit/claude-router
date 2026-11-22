// Scores a prompt sample ([{id, text}]) with the Haiku evaluator. Writes [{id, effort, question, repro}].
// usage: node --experimental-strip-types eval/run-sample.mjs <sample.json> <out.json>   (calls `claude -p`: a fraction of a cent per prompt)
import { readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { HAIKU_SYSTEM, parseHaikuAnswers } from '../logic.ts'
const [sampleFile, outFile] = process.argv.slice(2), name = 'haiku'
const items = JSON.parse(readFileSync(sampleFile, 'utf8'))
const haiku = text => new Promise((resolve, reject) => {
  const p = spawn('claude', ['-p', '--model', 'haiku', '--effort', 'low', '--tools', '', '--disable-slash-commands', '--no-session-persistence',
    '--setting-sources', '', '--strict-mcp-config', '--system-prompt', HAIKU_SYSTEM, '--output-format', 'json'], { cwd: '/tmp' })
  let out = ''; p.stdout.on('data', d => out += d); p.stdin.end(`<request>\n${text.slice(0, 2000)}\n</request>`)
  p.on('close', () => { try { const j = JSON.parse(out), a = parseHaikuAnswers(j.result); a ? resolve({ ...a, usd: j.total_cost_usd }) : reject(new Error('unparsed')) } catch (e) { reject(e) } })
})
const ask = haiku, conc = 6
const res = new Array(items.length); let next = 0, done = 0; const lat = []
await Promise.all(Array.from({ length: conc }, async () => { while (next < items.length) {
  const i = next++, t = performance.now()
  try { res[i] = { id: items[i].id, ...(await ask(items[i].text)) } } catch (e) { res[i] = { id: items[i].id, error: String(e).slice(0, 80) } }
  lat.push(performance.now() - t); if (++done % 50 === 0) console.error(`${done}/${items.length}`)
} }))
writeFileSync(outFile, JSON.stringify(res))
lat.sort((a, b) => a - b)
console.log(JSON.stringify({ evaluator: name, n: res.length, errors: res.filter(r => r.error).length, median_ms: Math.round(lat[lat.length >> 1]), usd: +res.reduce((a, r) => a + (r.usd ?? 0), 0).toFixed(3) }))
