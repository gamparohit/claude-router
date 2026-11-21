import { readFileSync, writeFileSync } from 'node:fs'
import { heuristic, heuristicBand } from '../logic.ts'
const d = f => JSON.parse(readFileSync(new URL('./data/' + f, import.meta.url)))
const items = [...d('swe_verified.json').map(r => ({ id: r.instance_id, text: r.problem_statement })), ...d('simple.json'), ...d('author.json')]
writeFileSync(new URL('./out/heuristic.json', import.meta.url), JSON.stringify(items.map(i => ({ id: i.id, tier: heuristic(i.text), band: heuristicBand(i.text) }))))
