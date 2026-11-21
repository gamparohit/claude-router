# Claude Router

A Claude Code plugin that reads each prompt, sorts it into **simple**, **medium** or **complex**, and picks which Claude model does the work, how hard it thinks, and whether a validator checks the result. The goal is to stretch your Claude subscription. A small local classifier (Laya) makes the call in about 0.1 seconds, with no API cost.

## Install (Mac)

1. In your terminal, run the one-time setup (installs the local classifier, about 800 MB):

   ```sh
   curl -fsSL https://raw.githubusercontent.com/gamparohit/claude-router/main/setup.sh | sh
   ```

2. In Claude Code, run:

   ```
   /plugin install router --marketplace gamparohit/claude-router
   ```

   Answer `y` to add the marketplace, then pick user scope. Start a new session. The status line shows the chosen tier, models and effort after each prompt.

If the classifier isn't installed or running, the router falls back to a keyword heuristic, so it still works, just less accurately.

## Using it

Add tags anywhere in a prompt (they are removed before the model sees it):

| Tag | Effect |
|---|---|
| `#simple` `#medium` `#complex` | Force the tier for this prompt |
| `#validate` / `#novalidate` | Turn the validator on or off (sticky) |
| `#autovalidate` | Back to the default |

Defaults live in `logic.ts` (`TIERS`, `EFFORT`, `CUTS`). Open `docs/router-explainer.html` for a full walkthrough.

## Status

Early. The classifier rule and cost estimates come from an evaluation on SWE-bench Verified with Claude 4.5 models (`eval/HANDOFF.md`). The hooks were tested with a fake host and have not yet been verified in a live Claude Code session. How many failures the cascade catches is unmeasured. Please report what you see.

The SWE-bench data used by `eval/` is not included; see `eval/README.md`.

License: MIT.
