#!/bin/sh
# Local classifier server for the router mod. Localhost only. Installed by setup.sh.
V="${ROUTER_HOME:-$HOME/.claude-router}/venv"
[ -x "$V/bin/laya-serve" ] || { echo "Laya not installed: run setup.sh first" >&2; exit 1; }
LAYA_HOST=127.0.0.1 LAYA_PORT=8765 LAYA_PRELOAD=1 LAYA_MODELS=typed-decisions LAYA_LOG_LEVEL=warning exec "$V/bin/laya-serve"
