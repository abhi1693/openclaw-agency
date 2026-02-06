from __future__ import annotations

import hashlib
from typing import Mapping

CONFIDENCE_THRESHOLD = 80


def compute_confidence(rubric_scores: Mapping[str, int]) -> int:
    return int(sum(rubric_scores.values()))


def approval_required(*, confidence: int, is_external: bool, is_risky: bool) -> bool:
    return is_external or is_risky or confidence < CONFIDENCE_THRESHOLD


def infer_planning(signals: Mapping[str, bool]) -> bool:
    # Require at least two planning signals to avoid spam on general boards.
    truthy = [key for key, value in signals.items() if value]
    return len(truthy) >= 2


def task_fingerprint(title: str, description: str | None, board_id: str) -> str:
    normalized_title = title.strip().lower()
    normalized_desc = (description or "").strip().lower()
    seed = f"{board_id}::{normalized_title}::{normalized_desc}"
    return hashlib.sha256(seed.encode()).hexdigest()
