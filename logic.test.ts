// Pure-logic checks. Run with: claude plugin test .
import { expect, test } from 'claude-code/testing'
import {
  DEFAULT_EVALUATOR, EFFORT, EVALUATORS, TIERS, executorFailed, heuristic, heuristicBand, heuristicNeedsValidation,
  isTestCommand, isVerifyPrompt, parseHaikuAnswers, parseTags, route, validatorFailed,
} from './logic'

test('tags', () => {
  expect(parseTags('#complex #novalidate fix it')).toEqual({ text: 'fix it', tier: 'complex', validate: false, evaluator: undefined })
  expect(parseTags('plain').tier).toBeUndefined()
  expect(parseTags('#autovalidate x').validate).toBe(null)
  expect(parseTags('#clef fix it').evaluator).toBe('clef')
  expect(parseTags('#haiku x').evaluator).toBe('haiku')
  expect(parseTags('fix it').evaluator).toBeUndefined()
})

test('keyword fallback', () => {
  expect(heuristic('what does ls -la do?')).toBe('simple')
  expect(heuristic('redesign the auth architecture')).toBe('complex')
  expect(heuristic('add a --verbose flag to the CLI and cover it with tests')).toBe('medium')
  expect(heuristic('x'.repeat(1500))).toBe('medium') // length alone is not difficulty
  expect(heuristicBand('fix typo')).toBe('low')
  expect(heuristicBand('x'.repeat(900))).toBe('mid')
  expect(heuristicNeedsValidation('medium', 'low')).toBe(false)
})

test('route and cut-offs', () => {
  expect(route({ effort: 2.5, question: 0.9, repro: 0 })).toEqual({ tier: 'simple', band: 'low' })
  expect(route({ effort: 1.4, question: 0.3, repro: 0.2 }).tier).toBe('simple')
  expect(route({ effort: 2.7, question: 0.3, repro: 0.6 }).tier).toBe('medium') // bug report, never complex
  expect(route({ effort: 3.1, question: 0.3, repro: 0.1 })).toEqual({ tier: 'complex', band: 'high' })
  expect(route({ effort: 1.5, question: 0, repro: 0 }).tier).toBe('simple') // laya cuts
  expect(route({ effort: 1.5, question: 0, repro: 0 }, EVALUATORS.clef.cuts).tier).toBe('medium') // clef: simple below 1.1
})

test('failure signals', () => {
  expect(executorFailed('done.\nSTATUS: FAILED: 2 tests still red')).toBe(true)
  expect(executorFailed('found 3 call sites in src/')).toBe(false) // search agents never say DONE
  expect(executorFailed('STATUS: DONE')).toBe(false)
  expect(validatorFailed('VERDICT: FAIL: missing null check')).toBe(true)
  expect(validatorFailed('VERDICT: PASS')).toBe(false)
  expect(isTestCommand('cd app && npm test -- --watch=false')).toBe(true)
  expect(isTestCommand('python -m pytest tests/')).toBe(true)
  expect(isTestCommand('ls -la')).toBe(false)
  expect(isVerifyPrompt('[verify] check the diff')).toBe(true)
  expect(isVerifyPrompt('fix the bug')).toBe(false)
})

test('haiku reply parsing', () => {
  const h = parseHaikuAnswers('```json\n{"effort":[0,0.1,0.8,0.1,0],"question":0.05,"repro":0.9}\n```')
  expect(h && Math.abs(h.effort - 2) < 1e-9 && h.repro === 0.9).toBe(true)
  expect(parseHaikuAnswers('sorry')).toBeUndefined()
})

test('tables', () => {
  expect(TIERS.simple.main).toBe('haiku')
  expect(TIERS.medium.escalate).toBe('opus')
  expect(EFFORT.complex.high.validator).toBe('xhigh')
  expect(DEFAULT_EVALUATOR).toBe('haiku')
})
