# Router eval

Where the numbers in the main README come from. The plugin's evaluator is Claude Haiku. Earlier versions also offered
two local models (Laya and Clef-Flash); they and their experiments were removed, and are in the git history.

## Data (`data/`, not in the repo)
- `swe_verified.json`: the 500 SWE-bench Verified issues (fields `instance_id`, `problem_statement`).
- `haiku.json`, `sonnet.json`, `opus.json`: per-task `cost` and `resolved`, keyed by instance id, from the public
  SWE-bench/experiments runs `evaluation/verified/20260217_mini-v2.0.0_claude-4-5-*-high` (mini-swe-agent, Claude 4.5,
  effort high, one attempt each).
- `simple.json`: 40 CodeAlpaca prompts labelled simple. `author.json`: 10 quick asks (simple) and 20 design or
  migration asks (complex), hand-written.

## Scripts
```sh
node --experimental-strip-types eval/run-haiku.mjs   # Haiku's answers for the 570 prompts -> out/haiku.json (about $0.50)
node --experimental-strip-types eval/savings.mjs     # router cost vs one model for everything, on the 500 issues
node eval/catch-rate.mjs                             # summary of your own ~/.claude-router/log.jsonl
```

## Findings that shaped the router
1. Among real bug fixes, nothing in the prompt predicted which ones a cheap model fails (AUC 0.47 to 0.56), and human
   difficulty labels did no better. So the medium tier is not split further; a failed cheap attempt is caught afterwards.
2. Prompt length is not difficulty: long prompts are mostly detailed bug reports.
3. One model for everything on the 500 issues: Haiku 66.6% solved for $165, Sonnet 71.4% for $329, Opus 76.8% for $377.
   Sonnet cost 87% of Opus per task and solved fewer, so the medium tier starts on Haiku and escalates to Opus.
4. A paid Opus review of every medium task cost more than always using Opus. The router escalates only on free
   signals: an executor's `STATUS: FAILED` line, a failing test command, or a verifier's `VERDICT: FAIL`.
5. With 40 to 80% of failures caught (assumed, not measured), `savings.mjs` gives 71 to 76% solved for $256 to $318:
   16 to 32% cheaper than Opus, 1 to 6 points fewer solved.

## What these numbers do not cover
- The catch rate is assumed. The plugin's log exists to measure it.
- The data is one agent working alone. The plugin runs a main loop over subagents; that overhead is not priced.
- The 570-prompt set rewards prompt length (every medium example is a long GitHub issue), so the cut-offs fitted on it
  are starting values and no accuracy figure from it is quoted any more.
- Claude 4.5 models at API prices, one run per task.
