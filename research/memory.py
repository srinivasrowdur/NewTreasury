from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
MEMORY_PATH = ROOT / "research_memory.json"
PUBLIC_MEMORY_PATH = PROJECT_ROOT / "public" / "research-results" / "memory.json"
MAX_RUNS = 24
MAX_LESSONS = 16


def empty_memory() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "updated_at": None,
        "runs": [],
        "lessons": [],
        "last_success_by_mandate": {}
    }


def load_memory() -> dict[str, Any]:
    if not MEMORY_PATH.exists():
        return empty_memory()
    try:
        payload = json.loads(MEMORY_PATH.read_text())
    except json.JSONDecodeError:
        return empty_memory()
    if not isinstance(payload, dict):
        return empty_memory()
    memory = empty_memory()
    memory.update(payload)
    memory["runs"] = memory["runs"] if isinstance(memory.get("runs"), list) else []
    memory["lessons"] = memory["lessons"] if isinstance(memory.get("lessons"), list) else []
    memory["last_success_by_mandate"] = (
        memory["last_success_by_mandate"]
        if isinstance(memory.get("last_success_by_mandate"), dict)
        else {}
    )
    return memory


def save_memory(memory: dict[str, Any]) -> None:
    memory["updated_at"] = datetime.now(timezone.utc).isoformat()
    MEMORY_PATH.write_text(json.dumps(memory, indent=2))
    PUBLIC_MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_MEMORY_PATH.write_text(json.dumps(memory, indent=2))


def mandate_key(value: str | None) -> str:
    return str(value or "balanced").lower()


def constraint_signature(constraints: dict[str, Any] | None) -> str:
    if not constraints:
        return "default"
    parts = []
    for key in sorted(constraints):
        value = constraints[key]
        if isinstance(value, (int, float)):
            parts.append(f"{key}:{float(value):.4f}")
    return "|".join(parts) or "default"


def compact_weights(weights: dict[str, Any] | None) -> dict[str, float]:
    if not isinstance(weights, dict):
        return {}
    return {
        symbol: round(float(value), 6)
        for symbol, value in weights.items()
        if isinstance(value, (int, float))
    }


def clean_candidate_name(name: Any) -> str | None:
    if not name:
        return None
    output = str(name)
    while output.lower().startswith("memory recall:"):
        output = output.split(":", 1)[1].strip()
    return output


def clean_lesson_text(lesson: Any) -> str:
    output = str(lesson)
    while "Memory Recall: Memory Recall:" in output:
        output = output.replace("Memory Recall: Memory Recall:", "Memory Recall:")
    output = output.replace("Memory recall promoted Memory Recall: ", "Memory recall promoted ")
    output = output.replace("Final promoted candidate was Memory Recall: ", "Final promoted candidate was ")
    return output


def summarize_turn_lesson(turn: dict[str, Any]) -> str | None:
    label = str(turn.get("label") or "")
    candidate = clean_candidate_name(turn.get("best_candidate")) or ""
    change = str(turn.get("change_summary") or "")
    if not label or not candidate or change in {"", "Starting allocation"}:
        return None
    if " +0.0 pp" in change and " -0.0 pp" not in change:
        return None
    return f"{label} promoted {candidate}; {change}; score {float(turn.get('score', 0.0)):.2f}."


def result_lessons(result: dict[str, Any]) -> list[str]:
    lessons: list[str] = []
    for turn in result.get("turns", []):
        if not isinstance(turn, dict):
            continue
        lesson = summarize_turn_lesson(turn)
        if lesson and lesson not in lessons:
            lessons.append(lesson)

    candidate = result.get("candidate", {})
    if isinstance(candidate, dict):
        name = clean_candidate_name(candidate.get("name"))
        score = candidate.get("score")
        drawdown = candidate.get("max_drawdown")
        if name and isinstance(score, (int, float)) and isinstance(drawdown, (int, float)):
            lessons.append(f"Final promoted candidate was {name}; score {score:.2f}; drawdown {drawdown:.1%}.")
    return lessons[:5]


def run_summary(result: dict[str, Any]) -> dict[str, Any]:
    candidate = result.get("candidate", {}) if isinstance(result.get("candidate"), dict) else {}
    return {
        "session_id": result.get("session_id"),
        "updated_at": result.get("updated_at"),
        "mandate": result.get("mandate"),
        "constraints_signature": constraint_signature(result.get("constraints_applied")),
        "candidate": clean_candidate_name(candidate.get("name")),
        "candidate_passes": bool(result.get("candidate_passes")),
        "score": candidate.get("score"),
        "expected_return": candidate.get("expected_return"),
        "volatility": candidate.get("volatility"),
        "max_drawdown": candidate.get("max_drawdown"),
        "weights": compact_weights(candidate.get("weights")),
        "turn_count": len(result.get("turns", [])),
        "lessons": result_lessons(result)
    }


def memory_context(memory: dict[str, Any], mandate: str, constraints: dict[str, Any] | None) -> dict[str, Any]:
    key = mandate_key(mandate)
    runs = [
        item for item in memory.get("runs", [])
        if mandate_key(item.get("mandate")) == key
    ]
    last_success = memory.get("last_success_by_mandate", {}).get(key)
    if isinstance(last_success, dict):
        last_success = dict(last_success)
        last_success["candidate"] = clean_candidate_name(last_success.get("candidate"))
    lessons = [
        clean_lesson_text(item) for item in memory.get("lessons", [])
        if isinstance(item, str)
    ][:6]
    return {
        "used": bool(runs or last_success or lessons),
        "prior_runs": len(runs),
        "constraints_signature": constraint_signature(constraints),
        "last_success": last_success,
        "lessons": lessons,
        "recent_runs": runs[:5]
    }


def prompt_context(context: dict[str, Any]) -> str:
    if not context.get("used"):
        return "No prior research memory is available yet."
    lines = [f"Prior runs for this mandate: {context.get('prior_runs', 0)}."]
    last_success = context.get("last_success")
    if isinstance(last_success, dict) and last_success.get("candidate"):
        lines.append(
            f"Last successful candidate: {last_success['candidate']} "
            f"with score {float(last_success.get('score') or 0.0):.2f}."
        )
        weights = last_success.get("weights")
        if isinstance(weights, dict) and weights:
            lines.append("Last successful weights: " + json.dumps(weights, sort_keys=True))
    lessons = context.get("lessons", [])
    if lessons:
        lines.append("Lessons to consider:")
        for lesson in lessons[:5]:
            lines.append(f"- {lesson}")
    return "\n".join(lines)


def disclosure(context: dict[str, Any]) -> dict[str, Any]:
    last_success = context.get("last_success") if isinstance(context.get("last_success"), dict) else None
    return {
        "used": bool(context.get("used")),
        "prior_runs": int(context.get("prior_runs") or 0),
        "lessons": [clean_lesson_text(item) for item in list(context.get("lessons", []))[:4]],
        "last_success_candidate": clean_candidate_name(last_success.get("candidate")) if last_success else None,
        "last_success_session_id": last_success.get("session_id") if last_success else None
    }


def remember_result(result: dict[str, Any]) -> dict[str, Any]:
    memory = load_memory()
    summary = run_summary(result)
    runs = [summary] + [
        item for item in memory.get("runs", [])
        if item.get("session_id") != summary.get("session_id")
    ]
    memory["runs"] = runs[:MAX_RUNS]

    lessons = [clean_lesson_text(item) for item in summary.get("lessons", [])] + [
        clean_lesson_text(item) for item in memory.get("lessons", [])
        if isinstance(item, str)
    ]
    deduped_lessons = []
    for lesson in lessons:
        if lesson not in deduped_lessons:
            deduped_lessons.append(lesson)
    memory["lessons"] = deduped_lessons[:MAX_LESSONS]

    if summary.get("candidate_passes"):
        memory["last_success_by_mandate"][mandate_key(summary.get("mandate"))] = summary

    save_memory(memory)
    return memory
