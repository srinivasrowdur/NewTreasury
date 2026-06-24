from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
UNIVERSE_PATH = ROOT / "universe.json"

DEFAULT_SELECTED_SYMBOLS = ["VTI", "VXUS", "AGG", "BIL", "GLD", "VNQ", "TIP"]
FALLBACK_ASSET_ORDER = [
    "VTI",
    "VXUS",
    "QQQ",
    "IWM",
    "VTV",
    "VUG",
    "USMV",
    "AGG",
    "BIL",
    "TIP",
    "SHY",
    "TLT",
    "LQD",
    "HYG",
    "GLD",
    "VNQ",
    "DBC",
]


def load_universe() -> dict[str, Any]:
    return json.loads(UNIVERSE_PATH.read_text())


def approved_asset_order() -> list[str]:
    try:
        payload = load_universe()
        symbols = [str(item["symbol"]).upper() for item in payload.get("assets", []) if item.get("symbol")]
        return symbols or FALLBACK_ASSET_ORDER
    except (OSError, json.JSONDecodeError, TypeError):
        return FALLBACK_ASSET_ORDER


def clean_universe_symbols(input_symbols: Any = None, minimum: int = 5) -> list[str]:
    allowed = approved_asset_order()
    allowed_set = set(allowed)
    default = [symbol for symbol in DEFAULT_SELECTED_SYMBOLS if symbol in allowed_set]

    if not isinstance(input_symbols, list):
        return default

    seen: set[str] = set()
    selected: list[str] = []
    for item in input_symbols:
        symbol = str(item).strip().upper()
        if symbol in allowed_set and symbol not in seen:
            seen.add(symbol)
            selected.append(symbol)

    if len(selected) < minimum:
        return default

    return [symbol for symbol in allowed if symbol in seen]
