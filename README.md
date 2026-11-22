# Claude Router

A Claude Code plugin that reads each prompt, sorts it into **simple**, **medium** or **complex**, and picks which Claude model does the work, how hard it thinks, and whether a validator checks the result. The goal is to stretch your Claude subscription.

## Install (Mac)

In Claude Code, run:

```
/plugin install router --marketplace gamparohit/claude-router
```

Answer `y` to add the marketplace, then pick user scope. Start a new session. The status line shows the tier, models and effort after each prompt. There is nothing else to install.

## How it decides

Before each prompt runs, the plugin asks Claude Haiku three questions about it: how much effort it needs, whether it is only a question, and whether it includes an error or steps to reproduce. Fixed cut-offs turn the answers into a tier. This call uses your own Claude usage: up to about $0.001 per prompt.

It adds a wait before each prompt. Called through the `claude` command line it measured about 5 s, most of it command-line start-up and thinking; the model call itself was about 0.75 s. The plugin calls Haiku directly at low effort, which should land near the low end, but that has not been timed in a live session.

If the call fails, a simple keyword check decides instead.

Earlier versions could also use two local models, Laya and Clef-Flash. They were removed: on 400 real prompts from coding-agent sessions, Haiku's scores tracked the work that followed best, and it needs no download or memory.

## What it saves

On 500 real SWE-bench issues (Claude 4.5 models, API prices, a single agent), the router costs 16–32% less than always using Opus, and solves 1.1–5.6 points fewer. The range depends on how many failed cheap attempts the router catches, which has not been measured yet. Against always using Sonnet the saving is 3–22%. Details are in `eval/README.md` and `eval/savings.mjs`.

Those figures price a cheap Haiku attempt followed by an Opus retry when a failure is caught, with no orchestrator on top. The plugin's medium tier runs a Haiku main loop over Haiku subagents, with Opus taking over after a failure. The cost of that orchestration is not in the data, so expect real savings to be lower than the figures above. An earlier version put Sonnet in charge of the medium tier; in the same data Sonnet cost 87% of what Opus did per task and solved fewer, which left little to save.

## Using it

Add tags anywhere in a prompt (they are removed before the model sees it):

| Tag | Effect |
|---|---|
| `#simple` `#medium` `#complex` | Force the tier for this prompt |
| `#validate` / `#novalidate` | Turn the validator on or off (sticky) |
| `#autovalidate` | Back to the default |

**The tier is sticky within a session.** Switching the main model in the middle of a conversation throws away that conversation's prompt cache, so the router avoids doing it needlessly:

- The tier moves up when a prompt needs it. It moves down only while the conversation is still short.
- A follow-up of six words or fewer ("continue", "now add tests") keeps the current tier and skips the evaluator, unless the session is on the simple tier.
- The status line shows `(kept)` when this happens. A `#simple`, `#medium` or `#complex` tag always wins, and `/clear` starts afresh.

Defaults live in `logic.ts` (`TIERS`, `EFFORT`, `CUTS`). Open `docs/router-explainer.html` in a browser for a walkthrough with diagrams.

## The log

After each routed prompt the plugin appends one line to `~/.claude-router/log.jsonl`: the tier, how many subagents and test commands ran, whether the router escalated and on which signal. It holds counts only, never your prompt text, and stays on your Mac. Set `ROUTER_LOG=0` in your environment to turn it off.

`node eval/catch-rate.mjs` summarises it. The point is to measure how often the router notices a failed cheap attempt, which the savings figures above only assume. It can only count a miss when a test command failed and nothing escalated, so the catch rate it prints is an upper bound.

## Status

Early. The classifier rules and cost estimates come from an evaluation on SWE-bench Verified with Claude 4.5 models. The hooks are covered by tests that run against Claude Code's plugin test kit (`claude plugin test .`), where every model call and tool result is a stub. They have not yet been verified in a live Claude Code session; in particular the Haiku evaluator's model call has not run inside Claude Code. Please report what you see.

The SWE-bench data used by `eval/` is not included; see `eval/README.md`.

License: MIT.
