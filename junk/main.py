"""
Entry point. Run with: op run -- uv run python src/main.py
"""

import logging
import os

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger(__name__)


def main() -> None:
    log.info("Starting...")
    # your code here


if __name__ == "__main__":
    main()
