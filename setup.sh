#!/bin/sh
# One-time setup: installs the local Laya classifier (~800 MB with model weights) into ~/.claude-router.
set -e
H="${ROUTER_HOME:-$HOME/.claude-router}"
command -v uv >/dev/null 2>&1 || { echo "Installing uv..."; curl -LsSf https://astral.sh/uv/install.sh | sh; PATH="$HOME/.local/bin:$PATH"; }
mkdir -p "$H"
uv venv --python 3.12 "$H/venv" -q
uv pip install -q --python "$H/venv/bin/python" "laya[serve]"
echo "Done. Laya is installed in $H. The router starts it automatically in each Claude Code session."
