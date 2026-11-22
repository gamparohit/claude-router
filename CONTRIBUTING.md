# Contributing

Thanks for looking at Claude Router. Bug reports, measurements from real use and code changes are all welcome.

## The most useful thing you can send

The plugin has not been verified in a live Claude Code session by anyone but its author, and its savings estimate rests on a number nobody has measured: how often it notices a failed cheap attempt. So the most valuable contributions right now are:

- **What happened when you ran it.** Did the status line appear? Did the tier make sense? Did anything break? Open an issue with the "Bug report" template, even if it worked.
- **Your catch-rate summary.** After a week or so of use, run `node eval/catch-rate.mjs` and paste the output into an issue. The log it reads holds counts only, never your prompts.

## Changing the code

`main` only takes changes through pull requests.

1. Fork the repo and create a branch.
2. Load your copy in Claude Code with `claude --plugin-dir /path/to/your/clone`.
3. Make the change. The layout:
   - `logic.ts`: the tier table, effort matrix, cut-offs and every pure function. Most changes belong here.
   - `hooks/index.ts`: the hooks that connect the logic to Claude Code.
   - `logic.test.ts`, `hooks/router.test.ts`: tests.
   - `eval/`: the experiments behind the numbers. See `eval/README.md`.
4. Run both checks. They need Claude Code installed:
   ```sh
   claude plugin test .
   claude plugin validate .
   ```
5. Open a pull request and fill in the template.

### What a good change looks like

- **Small.** One idea per pull request.
- **Tested.** New logic gets a test. A new hook behaviour gets a test in `hooks/router.test.ts`.
- **Backed by evidence, or labelled as a guess.** If you change a cut-off, a threshold or the tier table, say what you measured and how. If it is a hand pick, say so in a comment, as the existing ones do.
- **No new dependencies.** The plugin has none, and a hooks module can only import its own files and `claude-code`.
- **Plain about limits.** The README and code comments say what is unmeasured. Please keep that habit.

### Things to leave out

- Your `~/.claude-router/log.jsonl`, any SWE-bench or SWE-chat data, and anything from your own Claude Code transcripts. None of it belongs in the repo.
- Keys or tokens of any kind.

## Questions and ideas

Open an issue with the "Idea" template. For anything security-related, see `SECURITY.md`.

## Licence

By contributing you agree that your contribution is released under the MIT licence in `LICENSE`.
