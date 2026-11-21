# Router eval

Where the Laya routing rule in `logic.ts` (`route`, `CUTS`, `LAYA_QUESTIONS`) comes from.

## Data (`data/`)
- `swe_verified.json` — 500 SWE-bench Verified issues with human difficulty labels (gold tier: medium).
- `haiku|sonnet|opus.json` — per-task cost and pass/fail, mini-swe-agent v2.0.0, Claude 4.5, effort high,
  one attempt each (SWE-bench/experiments `evaluation/verified/20260217_mini-v2.0.0_claude-4-5-*-high`).
- `simple.json` — 40 CodeAlpaca prompts (gold: simple).
- `author.json` — 10 quick repo asks (simple) + 20 design/migration asks (complex), **hand-labelled**.

## Rerun
```sh
node eval/run-laya.mjs typed-decisions          # needs ./serve.sh; ~15 min for 570 prompts
node eval/heur.mjs                              # keyword fallback tiers
.venv/bin/python eval/explore.py                # AUC of every signal
.venv/bin/python eval/simulate.py               # paper cost of routing policies on SWE-bench
.venv/bin/python eval/fit.py                    # fit CUTS on 70%, score on 30%
node eval/check.mjs                             # shipped logic.ts vs the eval set
node eval/cascade.mjs                           # cost of old router / new classifier / cascade variants
```

## Findings
1. Questions are independent heads: one call with N questions = N single calls, identical numbers.
2. Laya reliably separates trivial asks from real work (AUC 0.9+) and design work from bug fixes (effort score, ~0.8).
3. Among real bug fixes nothing predicts which tasks Haiku fails (AUC 0.47–0.56). Even human difficulty
   labels route no better than random. Per-prompt routing within the medium tier is pointless.
4. Prompt length points the wrong way: long prompts are detailed bug reports, not hard tasks.
   Removed from the fallback heuristic.
5. The old router (tier argmax) sent 342/500 bug fixes to complex. New rule: held-out balanced accuracy
   0.77 ± 0.04 (old 0.49).
6. The yes/no risk checks (security/data/concurrency) didn't separate risky work on real issues; dropped.
7. Cost: Sonnet costs ~87% of Opus per task here and solves fewer (71.4% vs 76.8%). Haiku is 66.6% at 44%
   of Opus's cost. Escalating Haiku → Opus only on detected failure reaches 79% at $339 (vs Opus $377)
   when detection is perfect. The validator-as-escalation step is where the remaining savings are.

8. Cascade cost (eval/cascade.mjs): once the verification pass is paid for, Haiku -> Opus with an Opus
   reviewer costs as much as always-Opus or more. It only saves money with a ~free failure signal, so the
   router escalates on the executor's own `STATUS: FAILED` line or a failing test command. With 40-80% of
   failures caught: 71-76% solved at $259-327 vs old router 75.8% at $450 (27-43% cheaper).
   How many failures the free signal actually catches is the unmeasured number.

Caveats: 4.5-generation models, API prices, a single bash-only agent (no orchestrator/executors),
one run per task (noisy). Only 20 complex examples, and those were written by me.
