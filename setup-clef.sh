#!/bin/sh
# Optional: installs the Clef-Flash evaluator (4-bit MLX, ~6 GB download, ~6.4 GB RAM, Apple Silicon only).
set -e
H="${ROUTER_HOME:-$HOME/.claude-router}"
command -v uv >/dev/null 2>&1 || { curl -LsSf https://astral.sh/uv/install.sh | sh; PATH="$HOME/.local/bin:$PATH"; }
mkdir -p "$H"
uv venv --python 3.12 "$H/clef-venv" -q
uv pip install -q --python "$H/clef-venv/bin/python" "mlx-vlm>=0.7.4,<0.8" huggingface_hub
"$H/clef-venv/bin/python" -c "from huggingface_hub import snapshot_download as s; s('mlx-community/clef-flash-4bit', local_dir='$H/clef-model')"
echo "Done. Switch in chat with #clef (and back with #laya). Start it first: ./serve-clef.sh"
