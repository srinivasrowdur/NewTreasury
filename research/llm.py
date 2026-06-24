from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from research.universe import DEFAULT_SELECTED_SYMBOLS

ROOT = Path(__file__).resolve().parents[1]


def load_env_key() -> str | None:
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"]
    env_path = ROOT / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text().splitlines():
        if not line.startswith("OPENAI_API_KEY="):
            continue
        value = line.split("=", 1)[1].strip().strip('"').strip("'")
        return value or None
    return None


def response_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    parts: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts)


def generate_hypotheses(
    mandate: str,
    count: int = 8,
    memory_context: str | None = None,
    asset_order: list[str] | None = None
) -> list[dict[str, Any]]:
    api_key = load_env_key()
    if not api_key:
        return []

    model = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")
    allowed_symbols = asset_order or DEFAULT_SELECTED_SYMBOLS
    allowed_symbol_text = ", ".join(allowed_symbols)
    sample_weights = {symbol: round(1.0 / len(allowed_symbols), 4) for symbol in allowed_symbols}
    prompt = f"""
You are generating research-only portfolio strategy hypotheses for an offline evaluator.
Return only JSON, with no markdown. Use this shape:
[
  {{
    "name": "short candidate name",
    "hypothesis": "one sentence explaining the research idea",
    "tilt": "quality|defensive|inflation|real assets|global diversification|credit|duration",
    "weights": {json.dumps(sample_weights)}
  }}
]

Rules:
- Generate {count} candidates for the {mandate} mandate.
- Weights must sum to 1.0.
- No leverage, no options, no individual securities, no live trading.
- Use only these approved ETF symbols: {allowed_symbol_text}.
- Do not claim guaranteed return.

Research memory from prior runs:
{memory_context or "No prior research memory is available yet."}
"""
    body = json.dumps({
        "model": model,
        "input": prompt,
        "max_output_tokens": 1600
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return []

    text = response_text(payload).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1:
            return []
        try:
            parsed = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]
