# Claude Router

A Claude Code plugin that reads each prompt, sorts it into **simple**, **medium** or **complex**, and picks which Claude model does the work, how hard it thinks, and whether a validator checks the result. The goal is to stretch your Claude subscription.

## Install (Mac)

In Claude Code, run:

```
/plugin install router --marketplace gamparohit/claude-router
```

Answer `y` to add the marketplace, then pick user scope. Start a new session. The status line shows the evaluator, tier, models and effort after each prompt. That is all: the default evaluator (Haiku) needs nothing else installed.

## Evaluators

The **evaluator** is the model that reads your prompt and scores it. Three are included. They answer the same three questions (how much effort, is it only a question, does it include an error or repro), and the router turns the scores into a tier with cut-offs fitted for each one.

| Evaluator | Switch with | Setup | RAM | Speed | Cost | Accuracy* |
|---|---|---|---|---|---|---|
| **Haiku** (default) | `#haiku` | none | none | about 5 s | about $0.001 per prompt, from your Claude usage | 0.87 |
| **Laya** | `#laya` | `setup.sh` (about 800 MB) | about 3 GB | about 0.1 s | free | 0.77 |
| **Clef-Flash** | `#clef` | `setup-clef.sh` (about 6 GB) | about 6.4 GB (7.1 GB peak) | about 4.6 s | free | 0.97 |

\*Balanced accuracy on held-out prompts from our own 570-prompt eval (`eval/`). Only 20 of those prompts are complex tasks, written by hand, so treat these as rough.

The tag stays in effect for the rest of the session. After `setup.sh` or `setup-clef.sh`, start the server (`./serve.sh` or `./serve-clef.sh` from the plugin folder) before using `#laya` or `#clef`. If an evaluator can't be reached, the router falls back to a simple keyword check.

### Which one for my Mac?

These are rules of thumb. The RAM figures are measured on a 16 GB Apple Silicon Mac, and I have not tested other sizes.

| Your Mac's memory | Suggestion |
|---|---|
| **8 GB** | Stay on **Haiku**. Laya (about 3 GB) fits but leaves little room for your editor, browser and Claude Code. Clef does not fit. |
| **16 GB** | **Haiku**, or **Laya** if you want it free and instant and can spare 3 GB. Clef runs on 16 GB, but it took about 6.4 GB and 4.6 s per prompt, which makes the whole Mac sluggish. |
| **24 GB or more** | **Laya** for speed. **Clef** if you want the best tier accuracy and can wait about 4.6 s per prompt (speed on larger Macs is untested). |

Clef needs Apple Silicon. Haiku and Laya also work on Intel Macs, though Laya on Intel Macs may need extra setup (see Laya's own docs).

## What it saves

On 500 real SWE-bench issues (Claude 4.5 models, API prices, a single agent), the router costs 13–32% less than always using Opus, and solves 0.6–5.6 points fewer. The range depends on how many failed cheap attempts the router catches, which has not been measured yet. Against always using Sonnet the saving is 1–22%. All three evaluators give about the same savings, because almost all of that data is one kind of task (bug fixes). Details are in `eval/HANDOFF.md` and `eval/savings.mjs`.

## Using it

Add tags anywhere in a prompt (they are removed before the model sees it):

| Tag | Effect |
|---|---|
| `#simple` `#medium` `#complex` | Force the tier for this prompt |
| `#validate` / `#novalidate` | Turn the validator on or off (sticky) |
| `#autovalidate` | Back to the default |
| `#haiku` `#laya` `#clef` | Switch evaluator (sticky) |

Defaults live in `logic.ts` (`TIERS`, `EFFORT`, `EVALUATORS`, `DEFAULT_EVALUATOR`). Open `docs/router-explainer.html` for a walkthrough of the router (written before the evaluators were added, so it covers Laya only).

## Status

Early. The classifier rules and cost estimates come from an evaluation on SWE-bench Verified with Claude 4.5 models. The hooks are covered by tests that run against Claude Code's plugin test kit (`claude plugin test .`), where every model call and tool result is a stub. They have not yet been verified in a live Claude Code session; in particular the Haiku evaluator's model call has not run inside Claude Code. Please report what you see.

The SWE-bench data used by `eval/` is not included; see `eval/README.md`.

License: MIT.
