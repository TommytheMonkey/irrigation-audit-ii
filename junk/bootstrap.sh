#!/usr/bin/env bash
# Run once after cloning: ./bootstrap.sh
# Assumes: uv and op (1Password CLI) are installed

set -euo pipefail

echo "→ Installing Python deps..."
uv sync

echo "→ Checking 1Password CLI..."
if ! command -v op &>/dev/null; then
  echo "  ⚠️  1Password CLI not found. Install from https://developer.1password.com/docs/cli"
  echo "     Then run: op signin"
else
  echo "  ✅ op found"
fi

echo ""
echo "✅ Bootstrap complete."
echo ""
echo "To run:"
echo "   op run -- uv run python src/main.py"
