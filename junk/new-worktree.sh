#!/usr/bin/env bash
# Usage: ./scripts/new-worktree.sh feature-name
# Creates: ~/worktrees/<repo>-<feature-name> on a new branch

set -euo pipefail

BRANCH="${1:?Usage: $0 <branch-name>}"
REPO_NAME="$(basename "$(git rev-parse --show-toplevel)")"
WORKTREE_PATH="$HOME/worktrees/${REPO_NAME}-${BRANCH}"

git worktree add "$WORKTREE_PATH" -b "$BRANCH"
echo ""
echo "✅ Worktree ready: $WORKTREE_PATH"
echo "   cd $WORKTREE_PATH && uv sync"
