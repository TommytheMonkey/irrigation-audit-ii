# Project Name

One-sentence description.

## Quickstart

```bash
# 1. Clone
git clone git@github.com:TommytheMonkey/project-name.git
cd project-name

# 2. Install deps
uv sync

# 3. Run
op run -- uv run python src/main.py
```

> Prerequisites: [uv](https://docs.astral.sh/uv/getting-started/installation/), [1Password CLI](https://developer.1password.com/docs/cli/get-started/)

## Configuration

Copy `.env.example` as a reference. All secrets live in 1Password — no `.env` files needed when using `op run`.

## Development

```bash
# Lint
uv run ruff check .

# Type check
uv run mypy src/

# Tests
uv run pytest
```

## Worktrees

```bash
# Create a feature worktree
git worktree add ~/worktrees/project-name-feature-x -b feature-x

# List all worktrees
git worktree list
```

## Deployment

<!-- Fill in when applicable -->
