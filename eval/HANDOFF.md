# Router: what changed since you built it (handoff)

Another agent (pi) reviewed and re-fitted the router you built in this directory. Summary:

## 1. Is one Laya call with several questions overloaded?
No. Laya answers each question independently from one read of the prompt: asking 3 questions
together or one at a time gave byte-identical probabilities, and together is cheaper. Keep one call.

## 2. The original questions were weak
- `tier` (choice) was the only useful one, and it over-escalated: on real GitHub issues it sent
  342/500 ordinary bug fixes to `complex` (Opus + Fable validator).
- `band` was near random (`ls -la` -> high, a JWT migration -> low).
- `validation` never said yes (max 0.49), so in practice only complex was validated.
- The keyword fallback's "length > 1200 = complex" rule was wrong: long prompts are detailed bug
  reports, not hard tasks.

## 3. Experiment (eval/, rerunnable, see eval/README.md)
- 570 labelled prompts: 500 SWE-bench Verified issues (medium, with human difficulty labels),
  40 CodeAlpaca + 10 quick repo asks (simple), 20 design/migration asks (complex, hand-written).
- Real per-task cost and pass/fail for Claude 4.5 Haiku / Sonnet / Opus on all 500 issues (public
  SWE-bench/experiments runs, mini-swe-agent, effort high): Haiku 66.6% solved/$165,
  Sonnet 71.4%/$329, Opus 76.8%/$377.
- Findings:
  - Laya separates trivial asks from real work (AUC 0.9+) and design work from bug fixes (~0.8).
  - Among real bug fixes NOTHING in the prompt predicts which ones Haiku fails (AUC 0.47-0.56).
    Even human difficulty labels route no better than random. Per-prompt routing inside the medium
    tier is pointless.
  - Sonnet costs ~87% of Opus per task and solves less.

## 4. New classifier (logic.ts `route()`, `LAYA_QUESTIONS`, `CUTS`)
- One Laya call, 3 questions, checkpoint `typed-decisions`:
  - `effort` (score 0-4: answer/one command ... large refactor/migration/architecture)
  - `question` (yes/no: only asking a question, no code change)
  - `repro` (yes/no: includes an error, traceback or repro steps)
- Rule: question >= 0.8 -> simple/low; effort < 1.8 -> simple; effort >= 2.5 and repro < 0.3 ->
  complex (bug reports are never complex); else medium/mid. Complex band high when effort >= 3.0.
- Held-out balanced accuracy 0.77 +/- 0.04 (old tier argmax: 0.49). Latency ~0.1s short prompts,
  ~0.65s at the 2000-char cap.
- Validation: complex always; medium only with #validate.
- Yes/no risk questions (security/data/concurrency) were tried and dropped: they didn't separate
  risky work on real issues.

## 5. Cascade (escalation after a failed cheap attempt)
- TIERS gained `escalate` (simple: null, medium: opus, complex: opus).
- Executors get a rule appended at spawn: end with `STATUS: DONE` (only after a passing test or
  check) or `STATUS: FAILED: ...`. Verifier prompts start with `[verify]` and end with
  `VERDICT: PASS|FAIL`.
- Free failure signals: the executor's `STATUS: FAILED`, a failing test command during the
  attempt, or the verifier's `VERDICT: FAIL`. On failure all later executors for that prompt are
  forced to the escalate model, a note tells the orchestrator to redo the fix once, the status line
  shows "(escalated)". At most once per prompt. Simple tier: no rules, no cascade.
- Why free signals: a paid Opus review on every medium task made the cascade cost MORE than
  always-Opus.

## 6. Cost on SWE-bench (eval/cascade.mjs)
Assumes a review pass costs 30% of an Opus solve.

| Setup | Solved | Cost | vs old router |
|---|---|---|---|
| old router | 75.8% | $450 | baseline |
| always Opus | 76.8% | $377 | -16% |
| new classifier, medium -> Sonnet | 71.2% | $329 | -27% |
| new + cascade, Opus reviewer | 73.6-78.8% | $462-501 | +3-11% |
| **new + cascade, free signals (shipped)** | **71.4-76.2%** | **$259-327** | **-27-43%** |

The range depends on how many Haiku failures the free signals catch (40-80%). That catch rate is
not measured yet. Logging escalations in real use will pin it down.

Caveats: 4.5-generation models at API prices, a single agent (no orchestrator), one run per task,
only 20 complex examples. Hook flow tested with a fake host only, not yet inside Claude Code.

Files: `logic.ts`, `hooks/index.ts`, `logic.test.ts`, `eval/` (README, data, scripts).
