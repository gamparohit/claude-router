// Pure-logic checks. Run with: claude plugin test .
import { expect, test } from 'claude-code/testing'
import {
  CUTS, EFFORT, TIERS, executorFailed, heuristic, heuristicBand,
  failureSignal, isFollowUp, isTestCommand, isVerifyPrompt, newLogRecord, parseHaikuAnswers, parseTags, ratchet, route, validatorFailed,
} from './logic'

test('tags', () => {
  expect(parseTags('#complex #novalidate fix it')).toEqual({ text: 'fix it', tier: 'complex', validate: false })
  expect(parseTags('plain').tier).toBeUndefined()
  expect(parseTags('#autovalidate x').validate).toBe(null)
})

test('keyword fallback', () => {
  expect(heuristic('what does ls -la do?')).toBe('simple')
  expect(heuristic('redesign the auth architecture')).toBe('complex')
  expect(heuristic('add a --verbose flag to the CLI and cover it with tests')).toBe('medium')
  expect(heuristic('x'.repeat(1500))).toBe('medium') // length alone is not difficulty
  expect(heuristicBand('fix typo')).toBe('low')
  expect(heuristicBand('x'.repeat(900))).toBe('mid')
})

test('route and cut-offs', () => {
  expect(route({ effort: 2.5, question: 0.9, repro: 0 })).toEqual({ tier: 'simple', band: 'low' })
  expect(route({ effort: 1.2, question: 0.3, repro: 0.2 }).tier).toBe('simple')
  expect(route({ effort: 1.2, question: 0.3, repro: 0.2 }, { ...CUTS, simple: 1.0 }).tier).toBe('medium') // cut-offs can be passed in
  expect(parseTags('#laya fix it').text).toBe('#laya fix it') // removed evaluator tags are plain text now
  expect(route({ effort: 2.7, question: 0.3, repro: 0.6 }).tier).toBe('medium') // bug report, never complex
  expect(route({ effort: 3.1, question: 0.3, repro: 0.1 })).toEqual({ tier: 'complex', band: 'high' })
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
  expect(failureSignal('STATUS: FAILED: red', false, true)).toBe('status')
  expect(failureSignal('STATUS: DONE', false, true)).toBe('test') // said done, but its last test run failed
  expect(failureSignal('STATUS: DONE', false, false)).toBe(null)
  expect(failureSignal('STATUS: FAILED\nVERDICT: PASS', true, true)).toBe(null) // a verifier is judged by its verdict only
  expect(failureSignal('VERDICT: FAIL: race', true, false)).toBe('verdict')
  expect(newLogRecord('t', 'evaluator', 'medium', 'mid', '  fix   the parser ').words).toBe(3)
})

test('haiku reply parsing', () => {
  const h = parseHaikuAnswers('```json\n{"effort":[0,0.1,0.8,0.1,0],"question":0.05,"repro":0.9}\n```')
  expect(h && Math.abs(h.effort - 2) < 1e-9 && h.repro === 0.9).toBe(true)
  expect(parseHaikuAnswers('sorry')).toBeUndefined()
})

test('tables', () => {
  expect(TIERS.simple.main).toBe('haiku')
  expect(TIERS.medium).toEqual({ main: 'haiku', executor: 'haiku', validator: 'opus', escalate: 'opus' })
  expect(EFFORT.complex.high.validator).toBe('xhigh')
})

test('session stickiness', () => {
  const C = { tier: 'complex', band: 'high' } as const, M = { tier: 'medium', band: 'mid' } as const, S = { tier: 'simple', band: 'low' } as const
  expect(ratchet(null, S, 99)).toEqual(S) // first prompt of a session
  expect(ratchet(M, C, 99)).toEqual(C) // up is always allowed
  expect(ratchet(C, S, 99)).toEqual(C) // down is not, in a long conversation
  expect(ratchet(C, S, 5)).toEqual(S) // but is while the conversation is short
  expect(ratchet({ tier: 'complex', band: 'high' }, { tier: 'complex', band: 'mid' }, 99).band).toBe('high') // same tier keeps its band
  expect(isFollowUp('now add tests')).toBe(true)
  expect(isFollowUp('add a --verbose flag to the CLI and cover it with tests')).toBe(false)
})
