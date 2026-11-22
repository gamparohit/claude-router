#!/bin/sh
# Local Clef-Flash evaluator on 127.0.0.1:8766. Run after setup-clef.sh, before using #clef.
H="${ROUTER_HOME:-$HOME/.claude-router}"
M="${CLEF_MODEL_DIR:-$H/clef-model}"; P="${CLEF_PYTHON:-$H/clef-venv/bin/python}"
[ -x "$P" ] && [ -d "$M" ] || { echo "Clef not installed: run setup-clef.sh first" >&2; exit 1; }
cd "$M" && exec "$P" clef_mlx.py serve --port 8766 --name clef-flash
