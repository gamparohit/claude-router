import type { Register } from 'claude-code'
import {
  EFFORT, EVALUATOR_MODEL, EVALUATOR_TIMEOUT_SEC, HAIKU_SYSTEM, STATUS_RULE, TIERS, VERDICT_RULE, executorDone, executorFailed, failureSignal, heuristic, heuristicBand,
  isFollowUp, isTestCommand, isVerifyPrompt, newLogRecord, parseHaikuAnswers, parseTags, ratchet, route, type Band, type LogRecord, type Tier,
} from '../logic'

export const register: Register = on => {
  let tier: Tier = 'simple'
  let band: Band = 'low'
  let needsVal = false // does this prompt's tier get a validator by default
  let forced: boolean | null = null // sticky override: #validate / #novalidate, #autovalidate clears
  let escalated = false // this prompt's cheap attempt failed; executors now run on TIERS[tier].escalate
  let lastTest: boolean | undefined // did the most recent test command fail (undefined = none ran)
  let routed = false // has this session routed a prompt yet (reset on /clear)
  let messages = 0 // size of the main loop's last request: how much cached history a model switch would throw away
  let kept = false // this prompt kept the session's tier instead of the evaluator's answer
  let rec: LogRecord | undefined // this prompt's log line, written when the main turn completes

  const plan = () => ({ ...TIERS[tier], validator: (forced ?? needsVal) ? TIERS[tier].validator : null, effort: EFFORT[tier][band] })
  const executorModel = () => (escalated && plan().escalate) || plan().executor
  const statusText = () => {
    const p = plan()
    return (`router: ${tier}/${band}${kept ? ' (kept)' : ''} · ${p.main}:${p.effort.main}${tier === 'simple' ? '' : ' → ' + executorModel() + ':' + p.effort.executor}${escalated ? ' (escalated)' : ''} · val ${p.validator ? p.validator + ':' + p.effort.validator : 'off'}`)
  }

  on('prompt.submit', async ($, e, next) => {
    if (e.command) return next(e)
    const tags = parseTags(e.text)
    if (tags.validate !== undefined) forced = tags.validate
    // A short follow-up (or a prompt the engine injected) keeps the tier and skips the evaluator call. In a simple
    // session it is classified as usual: that is cheap, and the tier can still move up.
    const followUp = routed && !tags.tier && (e.isMeta === true || (tier !== 'simple' && isFollowUp(tags.text)))
    let via: LogRecord['via'] = 'kept', held = false
    if (!followUp) {
      const c = await classify($, tags.text)
      const picked = tags.tier ? { tier: tags.tier, band: c.band } : ratchet(routed ? { tier, band } : null, { tier: c.tier, band: c.band }, messages)
      held = !tags.tier && picked.tier !== c.tier
      via = tags.tier ? 'tag' : c.via
      tier = picked.tier
      band = picked.band
    }
    kept = followUp || held
    needsVal = tier === 'complex' // complex is always validated; medium only with #validate
    routed = true
    escalated = false
    rec = newLogRecord(new Date().toISOString(), via, tier, band, tags.text)
    if (held) rec.held = true
    $.ui.status(statusText())
    return next({ ...e, text: tags.text })
  })

  // /clear starts a new conversation with nothing cached: route its first prompt afresh.
  on('session.end', ($, e, next) => {
    routed = false
    messages = 0
    return next(e)
  })

  // Every model request gets its role's model and effort. Main loop = main role;
  // a subagent on the validator model = validator, any other subagent = executor.
  // ponytail: role is guessed from the model name; when validator == escalate (medium: opus) an escalated
  // executor gets validator effort. EFFORT.medium.mid gives both 'medium', so it is harmless today.
  on('turn.step', async function* ($, e, next) {
    const p = plan()
    if (e.agentId === undefined) messages = e.messageCount
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
    if (ran.deny === undefined) {
      lastTest = ran.isError === true
      if (rec) { rec.tests++; if (lastTest) rec.testsFailed++; rec.lastTestFailed = lastTest }
    }
    return ran
  })

  // Free failure signal 2: the executor's own STATUS line, or the verifier's VERDICT. One escalation per prompt.
  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Agent' || tier === 'simple') return next(e)
    lastTest = undefined
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const p = plan(), reply = JSON.stringify(ran), verify = isVerifyPrompt(e.prompt)
    const said = verify ? null : executorFailed(reply) ? 'failed' : executorDone(reply) ? 'done' : null
    if (rec) { rec.agents++; if (said && escalated) rec.retry = said; else if (said) rec[said]++ }
    if (escalated || !p.escalate) return ran
    const signal = failureSignal(reply, verify, lastTest === true)
    if (!signal) return ran
    escalated = true
    if (rec) rec.escalated = signal
    $.ui.status(statusText())
    return appendNote(ran, `\n\n[router] That attempt failed. Delegate the fix ONCE more to an Agent with model "${p.escalate}", passing it the failure details above. Do not escalate again after that; report any remaining problems to the user.`)
  })

  // The main loop's turn is over: write this prompt's log line.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && rec) {
      const line = JSON.stringify({ ...rec, reason: e.reason, ms: e.durationMs }) + '\n'
      rec = undefined
      await writeLog($, line)
    }
    return next(e)
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

// Appends one line to the log. Shell append, so the file never has to be read back; failures are ignored.
async function writeLog($: any, line: string) {
  try {
    await $.process.run(['sh', '-c', '[ "$ROUTER_LOG" = 0 ] || { d="${ROUTER_HOME:-$HOME/.claude-router}"; mkdir -p "$d" && cat >> "$d/log.jsonl"; }'], { stdin: line, timeoutMs: 3000 })
  } catch {}
}

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

// Haiku answers the three questions in one call; the keyword heuristic decides when the call fails or the reply
// does not parse. Low effort: sorting a prompt into three tiers needs no thinking, and thinking was about 1 s of each
// call in eval/.
async function classify($: any, text: string): Promise<{ tier: Tier; band: Band; via: 'evaluator' | 'fallback' }> {
  try {
    const r = await $.model.complete({ model: EVALUATOR_MODEL, system: HAIKU_SYSTEM, prompt: `<request>\n${text.slice(0, 2000)}\n</request>`, maxTokens: 200, effort: 'low', timeoutMs: EVALUATOR_TIMEOUT_SEC * 1000 })
    const a = r.isAnswered ? parseHaikuAnswers(r.text) : undefined
    if (a) return { ...route(a), via: 'evaluator' }
  } catch {}
  return { tier: heuristic(text), band: heuristicBand(text), via: 'fallback' }
}
