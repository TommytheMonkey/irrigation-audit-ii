"""
Centralized config. All env vars are read here — nowhere else in the codebase.
Load secrets with: op run -- uv run python ...
"""

import os


def require(key: str) -> str:
    val = os.getenv(key)
    if not val:
        raise RuntimeError(f"Required env var '{key}' is missing. Check .env.example.")
    return val


# ── App ──────────────────────────────────────────────────────────────────────
APP_ENV: str = os.getenv("APP_ENV", "development")
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

# ── Database ─────────────────────────────────────────────────────────────────
# DATABASE_URL: str = require("DATABASE_URL")

# ── External APIs ─────────────────────────────────────────────────────────────
# SOME_API_KEY: str = require("SOME_API_KEY")
