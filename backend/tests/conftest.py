"""Pytest configuration for backend tests."""

from __future__ import annotations

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
TEST_DATABASE_PATH = (
    REPO_ROOT / ".tmp" / "agent" / "backend-tests" / "gpu-booking-test.sqlite3"
)
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{TEST_DATABASE_PATH}"

TEST_DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
for suffix in ("", "-shm", "-wal"):
    TEST_DATABASE_PATH.with_name(f"{TEST_DATABASE_PATH.name}{suffix}").unlink(
        missing_ok=True
    )

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["GPU_BOOKING_DATABASE_URL"] = TEST_DATABASE_URL

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
