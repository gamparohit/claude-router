// Drives the hooks through the engine's test kit. Run with: claude plugin test .
// Nothing real runs beneath a test: every model call, curl call and tool result below is a stub, so these
// prove the hooks handle the shapes fed to them, not that Claude Code sends those shapes.
import { expect, test } from 'claude-code/testing'

const reply = (effort: number[], question = 0, repro = 0) => JSON.stringify({ effort, question, repro })
const COMPLEX = reply([0, 0, 0, 0.1, 0.9]), MEDIUM = reply([0, 0, 1, 0, 0], 0, 0.9), SIMPLE = reply([1, 0, 0, 0, 0], 0.9)
const DONE = { result: 'did it\nSTATUS: DONE' }, FAILED = { result: 'did stuff\nSTATUS: FAILED: 2 tests red' }

// Stand-in for the engine. `h` holds what the stubs answer (tests change it) and what they saw.
function host(on: any, haiku: string | null = COMPLEX) {
  const h: any = { haiku, agent: DONE, bash: { result: '', isError: false }, laya: '', status: [], steps: [], spawns: [], completes: [], runs: [], prompts: [] }
  on('model.complete', (_: any, e: any) => { h.completes.push(e); return { value: h.haiku === null ? { isAnswered: false, reason: 'api-error' } : { isAnswered: true, text: h.haiku, usage: {} } } })
  on('process.run', (_: any, e: any) => { h.runs.push(e); return { value: { exitCode: 0, stdout: h.laya, stderr: '' } } })
  on('ui.status', (_: any, e: any) => { h.status.push(JSON.stringify(e)); return { value: {} } })
  on('prompt.submit', (_: any, e: any) => { h.prompts.push(e); return { text: e.text } })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }))
  on('turn.step', async function* (_: any, e: any) { h.steps.push(e); return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } })
  on('agent.spawn', (_: any, e: any) => { h.spawns.push(e); return { model: e.model } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('session.end', (_: any, e: any) => ({ sessionId: e.sessionId }))
  on('tool.call', async (_: any, e: any) => (e.tool === 'Bash' ? h.bash : typeof h.agent === 'function' ? h.agent() : h.agent))
  return h
}
const submit = ($: any, text: string, extra = {}) => $.prompt.submit({ text, ...extra })
const step = async ($: any, extra = {}) => { for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'sonnet', messageCount: 1, ...extra })) { /* drain */ } }
const spawn = ($: any, extra = {}) => $.agent.spawn({ tool_use_id: 'x', prompt: 'fix it', description: 'd', subagentType: 'general-purpose', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', ...extra })
const agent = ($: any, prompt = 'fix it') => $.tool.call({ tool: 'Agent', prompt, description: 'd' })
const last = (a: any[]) => a[a.length - 1]
const complete = ($: any, extra = {}) => $.turn.complete({ answer: 'done', durationMs: 1234, isAborted: false, turnId: 't', reason: 'answer', ...extra })

test('haiku evaluator sets the tier and the status line', async ($, on) => {
  const h = host(on)
  await submit($, 'redo the storage layer')
  expect(h.completes.length).toBe(1)
  expect(h.completes[0].model).toBe('haiku')
  expect(last(h.status)).toContain('router[haiku]: complex/high')
  expect(last(h.status)).toContain('opus')
})

test('evaluator down: keyword fallback', async ($, on) => {
  const h = host(on, null)
  await submit($, 'what does ls -la do?')
  expect(last(h.status)).toContain('simple')
  h.haiku = 'sorry, no' // answered, but not the JSON asked for
  await submit($, 'redesign the auth architecture')
  expect(last(h.status)).toContain('complex')
})

test('#laya asks the local server through curl', async ($, on) => {
  const h = host(on)
  h.laya = JSON.stringify({ answers: { effort: { score: 2.1 }, question: { noul: 0.1 }, repro: { noul: 0.8 } } })
  await submit($, '#laya parser crashes on empty input, traceback below')
  expect(h.completes.length).toBe(0)
  expect(JSON.stringify(h.runs[0])).toContain('127.0.0.1:8765/v1/systemone')
  expect(last(h.status)).toContain('router[laya]: medium/mid')
})

test('tags force the tier and are stripped; slash commands pass through', async ($, on) => {
  const h = host(on, SIMPLE)
  await submit($, '#complex tidy the readme')
  expect(last(h.prompts).text).toBe('tidy the readme')
  expect(last(h.status)).toContain('complex')
  const n = h.status.length
  await submit($, '/help', { command: { name: 'help', args: '' } })
  expect(last(h.prompts).text).toBe('/help')
  expect(h.status.length).toBe(n)
})

test('turn.step: main loop gets the tier model and effort; a subagent keeps its model', async ($, on) => {
  const h = host(on)
  await submit($, 'redo the storage layer')
  await step($)
  expect(last(h.steps).model).toBe('opus')
  expect(last(h.steps).effort).toBe('xhigh')
  await step($, { agentId: 'a1', model: 'claude-sonnet-5-5' })
  expect(last(h.steps).model).toBe('claude-sonnet-5-5')
  expect(last(h.steps).effort).toBe('high') // executor effort for complex/high
  await step($, { agentId: 'a2', model: 'claude-fable-5-2' })
  expect(last(h.steps).effort).toBe('xhigh') // validator effort
})

test('agent.spawn: executor default, explicit model kept, verifier gets the validator', async ($, on) => {
  const h = host(on)
  await submit($, 'redo the storage layer')
  await spawn($)
  expect(last(h.spawns).model).toBe('sonnet')
  expect(last(h.spawns).prompt).toContain('STATUS: DONE')
  await spawn($, { model: 'haiku' })
  expect(last(h.spawns).model).toBe('haiku')
  await spawn($, { prompt: '[verify] check the diff' })
  expect(last(h.spawns).model).toBe('fable')
  expect(last(h.spawns).prompt).toContain('VERDICT: PASS')
})

test('simple tier: no rules, no policy section, no cascade', async ($, on) => {
  const h = host(on, SIMPLE)
  await submit($, 'what is a monad?')
  await spawn($)
  expect(last(h.spawns).prompt).toBe('fix it')
  h.agent = FAILED
  expect(JSON.stringify(await agent($))).not.toContain('[router]')
  const c: any = await $.prompt.compose({ model: 'haiku', promptModel: 'haiku', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(c.sections.length).toBe(1)
})

test('policy section for medium and complex', async ($, on) => {
  host(on, MEDIUM)
  await submit($, 'parser crashes on empty input')
  const c: any = await $.prompt.compose({ model: 'sonnet', promptModel: 'sonnet', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(last(c.sections).id).toBe('router:policy')
  expect(last(c.sections).text).toContain('STATUS: FAILED')
  expect(last(c.sections).text).not.toContain('[verify]') // medium: validator only with #validate
})

test('STATUS: FAILED escalates once: note, status, later executors forced to the escalate model', async ($, on) => {
  const h = host(on, MEDIUM)
  await submit($, 'parser crashes on empty input')
  expect(JSON.stringify(await agent($))).not.toContain('[router]')
  h.agent = FAILED
  expect(JSON.stringify(await agent($))).toContain('Agent with model \\"opus\\"')
  expect(last(h.status)).toContain('(escalated)')
  await spawn($, { model: 'haiku' })
  expect(last(h.spawns).model).toBe('opus')
  expect(JSON.stringify(await agent($))).not.toContain('[router]') // at most once per prompt
  await submit($, 'another bug: the lexer drops the last token')
  expect(last(h.status)).not.toContain('(escalated)') // resets on the next prompt
})

test('a failing test command during the attempt escalates; a passing one does not', async ($, on) => {
  const h = host(on, MEDIUM)
  await submit($, 'parser crashes on empty input')
  h.agent = async () => { await $.tool.call({ tool: 'Bash', command: 'npm test' }); return DONE }
  expect(JSON.stringify(await agent($))).not.toContain('[router]')
  h.bash = { result: '1 failed', isError: true }
  expect(JSON.stringify(await agent($))).toContain('[router]')
})

test('VERDICT: FAIL from the verifier escalates', async ($, on) => {
  const h = host(on)
  await submit($, 'redo the storage layer')
  h.agent = { result: 'looked\nVERDICT: FAIL: race in the writer' }
  expect(JSON.stringify(await agent($, '[verify] check the diff'))).toContain('[router]')
})

const logged = (h: any) => h.runs.filter((r: any) => r.init?.stdin).map((r: any) => JSON.parse(r.init.stdin))

test('log: one line per routed prompt at the end of the main turn, counts only', async ($, on) => {
  const h = host(on, MEDIUM)
  await submit($, 'parser crashes on empty input')
  h.agent = async () => { await $.tool.call({ tool: 'Bash', command: 'npm test' }); return DONE }
  await agent($)
  await complete($, { agentId: 'a1' }) // a subagent's turn does not flush
  expect(logged(h).length).toBe(0)
  await complete($)
  await complete($) // nothing left to write
  expect(logged(h).length).toBe(1)
  const r = logged(h)[0]
  expect({ ...r, t: '' }).toEqual({ t: '', evaluator: 'haiku', via: 'evaluator', tier: 'medium', band: 'mid', words: 5, agents: 1, done: 1, failed: 0,
    tests: 1, testsFailed: 0, lastTestFailed: false, escalated: null, retry: null, reason: 'answer', ms: 1234 })
  expect(JSON.stringify(last(h.runs))).not.toContain('parser')
})

test('log: records which signal escalated and what the retry reported', async ($, on) => {
  const h = host(on, MEDIUM)
  await submit($, 'parser crashes on empty input')
  h.agent = FAILED; await agent($)
  h.agent = DONE; await agent($)
  await complete($)
  const r = logged(h)[0]
  expect([r.agents, r.failed, r.done, r.escalated, r.retry]).toEqual([2, 1, 0, 'status', 'done'])
})

test('log: says when the keyword fallback or a tag decided, and skips slash commands', async ($, on) => {
  const h = host(on, null)
  await submit($, 'what does ls -la do?'); await complete($)
  await submit($, '#medium tidy the readme'); await complete($)
  await submit($, '/help', { command: { name: 'help', args: '' } }); await complete($)
  expect(logged(h).map((r: any) => r.via)).toEqual(['fallback', 'tag'])
})

const LONG = 'please take a look at the settings page and tell me what the save button does'

test('a short follow-up keeps the tier and skips the evaluator call', async ($, on) => {
  const h = host(on)
  await submit($, 'redo the storage layer'); await complete($)
  h.haiku = SIMPLE
  await submit($, 'continue')
  expect(h.completes.length).toBe(1)
  expect(last(h.status)).toContain('complex/high (kept)')
  await step($)
  expect(last(h.steps).model).toBe('opus')
  await complete($)
  expect(logged(h)[1].via).toBe('kept')
})

test('in a simple session a short follow-up is still classified, so it can move up', async ($, on) => {
  const h = host(on, SIMPLE)
  await submit($, 'what is a monad?')
  h.haiku = MEDIUM
  await submit($, 'now add tests')
  expect(h.completes.length).toBe(2)
  expect(last(h.status)).toContain('medium')
})

test('ratchet: a long conversation does not move down a tier, unless tagged', async ($, on) => {
  const h = host(on)
  await submit($, 'redo the storage layer')
  await step($, { messageCount: 40 }); await complete($)
  h.haiku = SIMPLE
  await submit($, LONG)
  expect(h.completes.length).toBe(2)
  expect(last(h.status)).toContain('complex/high (kept)')
  expect(last(h.status)).toContain('fable') // still validated
  await complete($)
  expect(logged(h)[1].held).toBe(true)
  await submit($, '#simple ' + LONG)
  expect(last(h.status)).toContain('simple')
})

test('ratchet: a short conversation may move down, and /clear starts afresh', async ($, on) => {
  const h = host(on)
  await submit($, 'redo the storage layer')
  await step($, { messageCount: 3 })
  h.haiku = SIMPLE
  await submit($, LONG)
  expect(last(h.status)).toContain('simple')
  h.haiku = COMPLEX
  await submit($, 'redo the storage layer again from the ground up please')
  await step($, { messageCount: 40 })
  await ($ as any).session.end({ reason: 'clear', sessionId: 's' })
  h.haiku = SIMPLE
  await submit($, LONG)
  expect(last(h.status)).toContain('simple')
})

test('an injected prompt keeps the tier', async ($, on) => {
  const h = host(on, MEDIUM)
  await submit($, 'parser crashes on empty input')
  await submit($, 'background task 12 finished with exit code 0 and wrote its report to disk', { isMeta: true })
  expect(h.completes.length).toBe(1)
})

test('a forced #complex is validated even when the evaluator says simple', async ($, on) => {
  const h = host(on, SIMPLE)
  await submit($, '#complex tidy the readme')
  expect(last(h.status)).toContain('val fable')
})
