import assert from 'node:assert/strict'
import { heuristic, parseTags } from './logic.ts'

assert.deepEqual(parseTags('#complex #novalidate fix it'), { text: 'fix it', tier: 'complex', validate: false })
assert.equal(parseTags('plain').tier, undefined)
assert.equal(heuristic('what does ls -la do?'), 'simple')
assert.equal(heuristic('redesign the auth architecture'), 'complex')
console.log('ok')
assert.equal(heuristic('add a --verbose flag to the CLI and cover it with tests'), 'medium')
import { EFFORT, heuristicBand } from './logic.ts'
assert.equal(heuristicBand('fix typo'), 'low')
assert.equal(heuristicBand('x'.repeat(900)), 'mid') // length alone is not difficulty
assert.equal(heuristic('x'.repeat(1500)), 'medium')
assert.equal(EFFORT.complex.high.validator, 'xhigh')
import { heuristicNeedsValidation, TIERS } from './logic.ts'
assert.equal(TIERS.simple.main, 'haiku')
assert.equal(parseTags('#autovalidate x').validate, null)
assert.equal(heuristicNeedsValidation('medium', 'low'), false)
import { route } from './logic.ts'
assert.deepEqual(route({ effort: 2.5, question: 0.9, repro: 0 }), { tier: 'simple', band: 'low' })
assert.equal(route({ effort: 1.4, question: 0.3, repro: 0.2 }).tier, 'simple')
assert.equal(route({ effort: 2.7, question: 0.3, repro: 0.6 }).tier, 'medium') // bug report, never complex
assert.deepEqual(route({ effort: 3.1, question: 0.3, repro: 0.1 }), { tier: 'complex', band: 'high' })
import { executorFailed, validatorFailed, isTestCommand, isVerifyPrompt } from './logic.ts'
assert.equal(executorFailed('done.\nSTATUS: FAILED: 2 tests still red'), true)
assert.equal(executorFailed('found 3 call sites in src/'), false) // search agents never say DONE
assert.equal(executorFailed('STATUS: DONE'), false)
assert.equal(validatorFailed('VERDICT: FAIL: missing null check'), true)
assert.equal(validatorFailed('VERDICT: PASS'), false)
assert.equal(isTestCommand('cd app && npm test -- --watch=false'), true)
assert.equal(isTestCommand('python -m pytest tests/'), true)
assert.equal(isTestCommand('ls -la'), false)
assert.equal(isVerifyPrompt('[verify] check the diff'), true)
assert.equal(isVerifyPrompt('fix the bug'), false)
assert.equal(TIERS.medium.escalate, 'opus')
