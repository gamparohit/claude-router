# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead: on this repository, go to **Security**, then **Report a vulnerability**. Only the maintainer sees the report.

This is a one-person project, so there is no guaranteed response time. The latest release is the only supported version.

## What the plugin touches

For anyone assessing it:

- It runs inside Claude Code as a hooks module and can see every prompt you submit and every tool call.
- It sends the first 2000 characters of each prompt to Claude Haiku through your own Claude Code session, to classify it. It makes no other network requests.
- It appends one line per prompt to `~/.claude-router/log.jsonl` using a shell command. The line holds counts and labels only, never prompt text. `ROUTER_LOG=0` turns this off.
- It changes which model and effort level your requests use, and adds text to the system prompt and to subagent prompts.
