import type { Register } from 'claude-code'
import {
  EFFORT, LAYA_MODEL, LAYA_QUESTIONS, STATUS_RULE, TIERS, VERDICT_RULE, executorFailed, heuristic, heuristicBand,
  heuristicNeedsValidation, isTestCommand, isVerifyPrompt, parseTags, route, validatorFailed, type Band, type Tier,
} from '../logic'

export const register: Register = on => {
  let tier: Tier = 'simple'
  let band: Band = 'low'
  let needsVal = false // Laya's call for this prompt
  let forced: boolean | null = null // sticky override: #validate / #novalidate, #autovalidate clears
  let escalated = false // this prompt's cheap attempt failed; executors now run on TIERS[tier].escalate
  let lastTest: boolean | undefined // did the most recent test command fail (undefined = none ran)

  const plan = () => ({ ...TIERS[tier], validator: (forced ?? needsVal) ? TIERS[tier].validator : null, effort: EFFORT[tier][band] })
  const executorModel = () => (escalated && plan().escalate) || plan().executor
  const statusText = () => {
    const p = plan()
    return (`router: ${tier}/${band} · ${p.main}:${p.effort.main}${tier === 'simple' ? '' : ' → ' + executorModel() + ':' + p.effort.executor}${escalated ? ' (escalated)' : ''} · val ${p.validator ? p.validator + ':' + p.effort.validator : 'off'}`)
  }

  // Start the local Laya server in the background if it isn't answering.
  on('session.start', async ($, e, next) => {
    try {
      const up = await $.process.run(['curl', '-s', '-m', '1', `${LAYA}/health`], { timeoutMs: 2000 })
      if (!up.stdout) await $.process.run(['sh', '-c', `nohup "${$.plugin.root}/serve.sh" >/dev/null 2>&1 </dev/null &`], { timeoutMs: 3000 })
    } catch {}
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command) return next(e)
    const tags = parseTags(e.text)
    if (tags.validate !== undefined) forced = tags.validate
    const c = await classify($, tags.text)
    tier = tags.tier ?? c.tier
    band = c.band
    needsVal = c.needsVal
    escalated = false
    $.ui.status(statusText())
    return next({ ...e, text: tags.text })
  })

  // Every model request gets its role's model and effort. Main loop = main role;
  // a subagent on the validator model = validator, any other subagent = executor.
  // ponytail: role is guessed from the model name; when validator == escalate (medium: opus) an escalated
  // executor gets validator effort. EFFORT.medium.mid gives both 'medium', so it is harmless today.
  on('turn.step', async function* ($, e, next) {
    const p = plan()
    if (e.agentId === undefined) return yield* next({ ...e, model: p.main, effort: p.effort.main })
    const isValidator = p.validator !== null && e.model.includes(p.validator)
    yield* next({ ...e, effort: isValidator ? p.effort.validator : p.effort.executor })
  })

  // Executors default to the tier's executor model unless the call picked one; after a failed attempt
  // they are forced onto the escalation model. Each spawn gets its reporting rule appended.
  on('agent.spawn', ($, e, next) => {
    const verify = isVerifyPrompt(e.prompt)
    const model = verify ? e.model ?? plan().validator ?? undefined : escalated && plan().escalate ? plan().escalate! : e.model ?? plan().executor
    const prompt = typeof e.prompt === 'string' && tier !== 'simple' ? e.prompt + (verify ? VERDICT_RULE : STATUS_RULE) : e.prompt
    return next({ ...e, model, prompt })
  })

  // Free failure signal 1: test commands (from any agent) that fail.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.tool !== 'Bash' || typeof e.command !== 'string' || !isTestCommand(e.command)) return next(e)
    const ran = await next(e)
    if (ran.deny === undefined) lastTest = ran.isError === true
    return ran
  })

  // Free failure signal 2: the executor's own STATUS line, or the verifier's VERDICT. One escalation per prompt.
  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Agent' || tier === 'simple') return next(e)
    lastTest = undefined
    const ran = await next(e)
    const p = plan()
    if (escalated || !p.escalate || ran.deny !== undefined) return ran
    const reply = JSON.stringify(ran)
    const failed = isVerifyPrompt(e.prompt) ? validatorFailed(reply) : executorFailed(reply) || lastTest === true
    if (!failed) return ran
    escalated = true
    $.ui.status(statusText())
    return appendNote(ran, `\n\n[router] That attempt failed. Delegate the fix ONCE more to an Agent with model "${p.escalate}", passing it the failure details above. Do not escalate again after that; report any remaining problems to the user.`)
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (tier === 'simple') return r
    const p = plan()
    const text =
      `Cost routing is on (${tier} task). Act as orchestrator: delegate bulk work (searching, editing, running commands) to subagents via the Agent tool with model "${p.executor}", keep your own turns short. ` +
      `Ask executors to run the relevant tests. If one reports STATUS: FAILED, re-delegate the fix once to an Agent with model "${p.escalate}".` +
      (p.validator ? ` When everything is done, spawn ONE final Agent with model "${p.validator}" whose prompt starts with "[verify]" to verify the result (run tests, review the diff) and report issues before you finish.` : '')
    return { sections: [...r.sections, { id: 'router:policy', text, scope: 'session' as const }] }
  })
}

const LAYA = 'http://127.0.0.1:8765'

// Adds a line to a tool result the model will read. The Agent result shape isn't pinned down here, so
// only plain-text and content-block results get the note; others pass unchanged (the forced model in
// agent.spawn and the policy text still escalate).
function appendNote(ran: any, note: string) {
  const r = ran?.result
  if (typeof r === 'string') return { ...ran, result: r + note }
  if (Array.isArray(r)) return { ...ran, result: [...r, { type: 'text', text: note }] }
  if (r && typeof r === 'object' && typeof r.content === 'string') return { ...ran, result: { ...r, content: r.content + note } }
  if (r && typeof r === 'object' && Array.isArray(r.content)) return { ...ran, result: { ...r, content: [...r.content, { type: 'text', text: note }] } }
  return ran
}

// Laya (local, ./serve.sh) answers three questions in one call (~0.1s short, ~0.65s at 2000 chars);
// heuristic if the server is down. Validation: complex always, medium only via #validate. Laya's
// yes/no risk questions did not separate risky work on real issues (eval/README.md), so none is asked.
async function classify($: any, text: string): Promise<{ tier: Tier; band: Band; needsVal: boolean }> {
  try {
    const r = await $.process.run(
      ['curl', '-s', '-m', '3', `${LAYA}/v1/systemone`, '-H', 'content-type: application/json', '-d',
        JSON.stringify({ model: LAYA_MODEL, state: { body: text.slice(0, 2000) }, questions: LAYA_QUESTIONS })],
      { timeoutMs: 4000 },
    )
    const a = JSON.parse(r.stdout).answers
    const effort = Number(a?.effort?.score), question = Number(a?.question?.noul), repro = Number(a?.repro?.noul)
    if ([effort, question, repro].every(Number.isFinite)) {
      const { tier, band } = route({ effort, question, repro })
      return { tier, band, needsVal: tier === 'complex' }
    }
  } catch {}
  const tier = heuristic(text), band = heuristicBand(text)
  return { tier, band, needsVal: heuristicNeedsValidation(tier, band) }
}
