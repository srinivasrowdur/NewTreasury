from __future__ import annotations

import hashlib
import math
import random
from typing import Any

from research.universe import approved_asset_order

ASSET_ORDER = approved_asset_order()
DEFENSIVE_SYMBOLS = ("AGG", "BIL", "TIP", "SHY", "TLT", "LQD")
EQUITY_SYMBOLS = ("VTI", "VXUS", "QQQ", "IWM", "VTV", "VUG", "USMV")

BASE_WEIGHTS = {
    "conservative": {"VTI": 0.22, "VXUS": 0.12, "AGG": 0.46, "BIL": 0.10, "GLD": 0.06, "VNQ": 0.02, "TIP": 0.02},
    "balanced": {"VTI": 0.34, "VXUS": 0.18, "AGG": 0.30, "BIL": 0.07, "GLD": 0.07, "VNQ": 0.02, "TIP": 0.02},
    "growth": {"VTI": 0.46, "VXUS": 0.24, "AGG": 0.16, "BIL": 0.04, "GLD": 0.05, "VNQ": 0.03, "TIP": 0.02}
}

SEED_IDEAS = [
    ("Global Quality Multi-Asset", "Tilt toward diversified equity while preserving defensive ballast."),
    ("Defensive Carry Blend", "Increase bonds and T-bills to reduce drawdown while retaining income."),
    ("Inflation Shock Absorber", "Use gold and TIPS as inflation-sensitive diversifiers."),
    ("Global Equity Balance", "Spread equity risk across US and international exposures."),
    ("Real Asset Sleeve", "Add moderate real asset exposure while respecting drawdown limits."),
    ("Cash Optionality", "Hold more T-bills to reduce volatility and create rebalance capacity."),
    ("Bond Barbell", "Pair core bonds with T-bills and TIPS for lower rate sensitivity."),
    ("Diversified Growth", "Increase equity return drivers without breaching concentration limits."),
    ("Nasdaq Growth Engine", "Test whether a focused growth sleeve improves expected return."),
    ("Minimum Volatility Equity", "Replace broad equity risk with lower-volatility equity exposure."),
    ("Credit Carry Sleeve", "Add liquid credit exposure as a differentiated income driver."),
    ("Duration Hedge", "Use long Treasuries as a rate-shock hedge."),
    ("Commodity Diversifier", "Add broad commodities as a second inflation-sensitive real asset.")
]


def active_order(asset_order: list[str] | None = None) -> list[str]:
    return list(asset_order or ASSET_ORDER)


def normalize(weights: dict[str, float], asset_order: list[str] | None = None) -> dict[str, float]:
    order = active_order(asset_order)
    clipped = {symbol: max(0.0, float(weights.get(symbol, 0.0))) for symbol in order}
    total = sum(clipped.values())
    if total <= 0:
        return {symbol: round(1.0 / len(order), 6) for symbol in order}
    return {symbol: round(value / total, 6) for symbol, value in clipped.items()}


def stable_id(name: str, weights: dict[str, float], asset_order: list[str] | None = None) -> str:
    order = active_order(asset_order)
    body = name + "|" + "|".join(f"{symbol}:{weights[symbol]:.4f}" for symbol in order)
    digest = hashlib.sha1(body.encode("utf-8")).hexdigest()[:8]
    return f"cand-{digest}"


def apply_tilts(base: dict[str, float], tilts: dict[str, float], asset_order: list[str] | None = None) -> dict[str, float]:
    order = active_order(asset_order)
    weights = {symbol: float(base.get(symbol, 0.0)) for symbol in order}
    for symbol, delta in tilts.items():
        if symbol in weights:
            weights[symbol] += delta
    return normalize(weights, order)


def candidate(
    name: str,
    hypothesis: str,
    weights: dict[str, float],
    source: str,
    asset_order: list[str] | None = None
) -> dict[str, Any]:
    order = active_order(asset_order)
    normalized = normalize(weights, order)
    return {
        "id": stable_id(name, normalized, order),
        "name": name,
        "hypothesis": hypothesis,
        "weights": normalized,
        "source": source
    }


def group_weight(weights: dict[str, float], symbols: tuple[str, ...]) -> float:
    return sum(float(weights.get(symbol, 0.0)) for symbol in symbols)


def symbols_from_group(asset_order: list[str], symbols: tuple[str, ...]) -> list[str]:
    symbol_set = set(symbols)
    return [symbol for symbol in asset_order if symbol in symbol_set]


def distribute_capped(total: float, symbols: list[str], preferences: dict[str, float], cap: float) -> dict[str, float]:
    allocations = {symbol: 0.0 for symbol in symbols}
    remaining = max(0.0, float(total))
    active = set(symbols)
    cap = max(0.0, float(cap))

    while active and remaining > 1e-9:
        preference_total = sum(max(0.0, preferences.get(symbol, 0.0)) for symbol in active)
        if preference_total <= 0:
            preference_total = float(len(active))
            preferences = {symbol: 1.0 for symbol in active}

        proposed = {
            symbol: remaining * max(0.0, preferences.get(symbol, 0.0)) / preference_total
            for symbol in active
        }
        capped = [symbol for symbol, value in proposed.items() if allocations[symbol] + value > cap]
        if not capped:
            for symbol, value in proposed.items():
                allocations[symbol] += value
            remaining = 0.0
            break

        for symbol in capped:
            room = max(0.0, cap - allocations[symbol])
            allocations[symbol] += room
            remaining -= room
            active.remove(symbol)

        if not capped:
            break

    if remaining > 1e-6 and symbols:
        room_symbols = [symbol for symbol in symbols if allocations[symbol] < cap]
        if room_symbols:
            for symbol in room_symbols:
                room = cap - allocations[symbol]
                add = min(room, remaining / len(room_symbols))
                allocations[symbol] += add
                remaining -= add

    return allocations


def defensive_target_weights(
    defensive_target: float,
    max_single_asset: float,
    asset_order: list[str] | None = None
) -> dict[str, float]:
    order = active_order(asset_order)
    defensive_symbols = symbols_from_group(order, DEFENSIVE_SYMBOLS)
    nondefensive_symbols = [symbol for symbol in order if symbol not in defensive_symbols]
    cap = max(0.01, min(1.0, max_single_asset))
    defensive_capacity = cap * len(defensive_symbols)
    nondefensive_capacity = cap * len(nondefensive_symbols)

    if not defensive_symbols:
        return normalize({symbol: 1.0 for symbol in order}, order)

    target = max(0.0, min(1.0, defensive_target))
    target = min(target, defensive_capacity)
    target = max(target, 1.0 - nondefensive_capacity)

    defensive = distribute_capped(
        target,
        defensive_symbols,
        {"AGG": 0.32, "BIL": 0.20, "TIP": 0.14, "SHY": 0.15, "TLT": 0.08, "LQD": 0.11},
        cap
    )
    nondefensive = distribute_capped(
        1.0 - target,
        nondefensive_symbols,
        {
            "VTI": 0.28,
            "VXUS": 0.16,
            "QQQ": 0.10,
            "IWM": 0.06,
            "VTV": 0.09,
            "VUG": 0.08,
            "USMV": 0.08,
            "HYG": 0.04,
            "GLD": 0.07,
            "VNQ": 0.03,
            "DBC": 0.01
        },
        cap
    )
    return normalize({**defensive, **nondefensive}, order)


def cap_and_redistribute(
    weights: dict[str, float],
    cap: float,
    asset_order: list[str] | None = None
) -> dict[str, float]:
    order = active_order(asset_order)
    cap = max(0.01, min(1.0, float(cap)))
    output = {symbol: min(float(weights.get(symbol, 0.0)), cap) for symbol in order}
    remaining = 1.0 - sum(output.values())

    while remaining > 1e-8:
        eligible = [symbol for symbol in order if output[symbol] < cap - 1e-8]
        if not eligible:
            break
        preference_total = sum(float(weights.get(symbol, 0.0)) for symbol in eligible)
        if preference_total <= 0:
            preference_total = float(len(eligible))
        progressed = False
        for symbol in eligible:
            preference = float(weights.get(symbol, 0.0)) if preference_total != len(eligible) else 1.0
            add = remaining * preference / preference_total
            room = cap - output[symbol]
            clipped_add = min(add, room)
            if clipped_add > 0:
                output[symbol] += clipped_add
                remaining -= clipped_add
                progressed = True
        if not progressed:
            break

    return normalize(output, order)


def constraint_candidates(
    base: dict[str, float],
    overrides: dict[str, Any] | None,
    asset_order: list[str] | None = None
) -> list[dict[str, Any]]:
    if not overrides:
        return []

    order = active_order(asset_order)
    max_single_asset = float(overrides.get("max_single_asset", 1.0))
    min_defensive = float(overrides.get("min_defensive_weight", group_weight(base, DEFENSIVE_SYMBOLS)))
    max_drawdown = float(overrides.get("max_drawdown", 1.0))
    max_volatility = float(overrides.get("max_volatility", 1.0))
    base_defensive = group_weight(base, DEFENSIVE_SYMBOLS)
    output: list[dict[str, Any]] = []

    if math.isfinite(min_defensive) and min_defensive > base_defensive + 0.02:
        output.append(candidate(
            "Constraint Defensive Floor",
            "Raise the defensive sleeve to satisfy the user-selected defensive minimum.",
            defensive_target_weights(min_defensive, max_single_asset, order),
            "constraint",
            order
        ))

    if math.isfinite(max_drawdown) and max_drawdown < 0.19:
        output.append(candidate(
            "Lower Drawdown Constraint Fit",
            "Shift toward bonds, T-bills, and TIPS when the drawdown ceiling is tightened.",
            defensive_target_weights(max(min_defensive, 0.58), max_single_asset, order),
            "constraint",
            order
        ))

    if math.isfinite(max_volatility) and max_volatility < 0.10:
        output.append(candidate(
            "Lower Volatility Constraint Fit",
            "Reduce equity risk when the volatility ceiling is tightened.",
            defensive_target_weights(max(min_defensive, 0.62), max_single_asset, order),
            "constraint",
            order
        ))

    if math.isfinite(max_single_asset) and max_single_asset < max(base.values()):
        output.append(candidate(
            "Concentration Constraint Fit",
            "Redistribute positions so the largest ETF weight respects the single-asset cap.",
            cap_and_redistribute(base, max_single_asset, order),
            "constraint",
            order
        ))

    return output


def memory_candidates(
    base: dict[str, float],
    memory_context: dict[str, Any] | None,
    overrides: dict[str, Any] | None,
    asset_order: list[str] | None = None
) -> list[dict[str, Any]]:
    if not memory_context or not memory_context.get("used"):
        return []

    last_success = memory_context.get("last_success")
    if not isinstance(last_success, dict):
        return []

    prior_weights = last_success.get("weights")
    if not isinstance(prior_weights, dict) or not prior_weights:
        return []

    order = active_order(asset_order)
    prior = normalize({symbol: float(prior_weights.get(symbol, 0.0)) for symbol in order}, order)
    prior_name = str(last_success.get("candidate") or "Prior allocation")
    while prior_name.lower().startswith("memory recall:"):
        prior_name = prior_name.split(":", 1)[1].strip()
    prior_name = prior_name[:44]
    max_single_asset = float((overrides or {}).get("max_single_asset", 1.0))
    min_defensive = float((overrides or {}).get("min_defensive_weight", group_weight(base, DEFENSIVE_SYMBOLS)))
    output = [
        candidate(
            f"Memory Recall: {prior_name}",
            "Replay the last passing allocation from persistent research memory.",
            prior,
            "memory",
            order
        )
    ]

    prior_defensive = group_weight(prior, DEFENSIVE_SYMBOLS)
    if math.isfinite(min_defensive) and min_defensive > prior_defensive + 0.01:
        output.append(candidate(
            "Memory Constraint Repair",
            "Adapt the remembered allocation to the current defensive floor.",
            defensive_target_weights(min_defensive, max_single_asset, order),
            "memory",
            order
        ))
    else:
        output.append(candidate(
            "Memory Return Recovery",
            "Test whether the remembered allocation can restore modest equity exposure without breaking guardrails.",
            apply_tilts(prior, {"VTI": 0.025, "VXUS": 0.015, "QQQ": 0.015, "AGG": -0.025, "BIL": -0.015, "SHY": -0.015}, order),
            "memory",
            order
        ))
        output.append(candidate(
            "Memory Risk Repair",
            "Test whether the remembered allocation improves drawdown by adding defensive ballast.",
            apply_tilts(prior, {"AGG": 0.020, "BIL": 0.012, "SHY": 0.012, "LQD": 0.010, "VTI": -0.025, "VXUS": -0.015, "QQQ": -0.014}, order),
            "memory",
            order
        ))

    if math.isfinite(max_single_asset) and max_single_asset < max(prior.values()):
        output.append(candidate(
            "Memory Concentration Repair",
            "Cap the remembered allocation to respect the current single-asset limit.",
            cap_and_redistribute(prior, max_single_asset, order),
            "memory",
            order
        ))

    return output


def idea_to_candidate(
    idea: dict[str, Any],
    mandate: str,
    index: int,
    asset_order: list[str] | None = None
) -> dict[str, Any] | None:
    order = active_order(asset_order)
    base = normalize(BASE_WEIGHTS[mandate], order)
    name = str(idea.get("name") or f"LLM Candidate {index + 1}")[:80]
    hypothesis = str(idea.get("hypothesis") or "LLM-generated allocation idea.")[:260]
    raw_weights = idea.get("weights")
    if isinstance(raw_weights, dict):
        return candidate(name, hypothesis, raw_weights, "llm", order)

    tilt = str(idea.get("tilt") or "").lower()
    tilts: dict[str, float] = {}
    if "quality" in tilt or "equity" in tilt:
        tilts.update({"VTI": 0.03, "VXUS": 0.01, "QQQ": 0.02, "AGG": -0.03, "BIL": -0.01, "SHY": -0.01})
    if "defensive" in tilt or "drawdown" in tilt:
        tilts.update({"AGG": 0.03, "BIL": 0.02, "SHY": 0.02, "USMV": 0.02, "VTI": -0.04, "VXUS": -0.02, "QQQ": -0.01})
    if "inflation" in tilt or "real" in tilt:
        tilts.update({"GLD": 0.03, "DBC": 0.025, "TIP": 0.025, "AGG": -0.03, "VTI": -0.02})
    if "credit" in tilt or "income" in tilt:
        tilts.update({"LQD": 0.025, "HYG": 0.025, "AGG": -0.02, "VTI": -0.015, "VXUS": -0.015})
    if "duration" in tilt or "treasury" in tilt:
        tilts.update({"TLT": 0.035, "SHY": 0.015, "AGG": -0.025, "VTI": -0.015, "VXUS": -0.010})
    if not tilts:
        return None
    return candidate(name, hypothesis, apply_tilts(base, tilts, order), "llm", order)


def generate_candidates(
    mandate: str,
    max_candidates: int = 36,
    llm_ideas: list[dict[str, Any]] | None = None,
    constraint_overrides: dict[str, Any] | None = None,
    memory_context: dict[str, Any] | None = None,
    asset_order: list[str] | None = None
) -> list[dict[str, Any]]:
    order = active_order(asset_order)
    base = normalize(BASE_WEIGHTS[mandate], order)
    candidates: list[dict[str, Any]] = [
        candidate("Baseline Mandate", "Current mandate baseline used for comparison.", base, "baseline", order)
    ]

    candidates.extend(memory_candidates(base, memory_context, constraint_overrides, order))

    deterministic_tilts = [
        {"VTI": 0.04, "VXUS": 0.01, "QQQ": 0.02, "AGG": -0.03, "BIL": -0.02, "SHY": -0.02},
        {"VTI": -0.04, "VXUS": -0.01, "AGG": 0.03, "BIL": 0.02, "SHY": 0.02},
        {"GLD": 0.035, "DBC": 0.025, "TIP": 0.03, "AGG": -0.04, "VNQ": -0.01},
        {"VXUS": 0.05, "VTI": -0.03, "AGG": -0.02},
        {"VNQ": 0.05, "VTI": -0.03, "AGG": -0.02},
        {"BIL": 0.035, "SHY": 0.025, "VTI": -0.03, "VXUS": -0.02},
        {"TIP": 0.035, "TLT": 0.025, "AGG": -0.03, "BIL": -0.02},
        {"VTI": 0.03, "GLD": 0.025, "DBC": 0.02, "AGG": -0.04, "BIL": -0.02},
        {"QQQ": 0.055, "VUG": 0.025, "AGG": -0.04, "BIL": -0.02},
        {"USMV": 0.055, "VTI": -0.025, "VXUS": -0.015, "QQQ": -0.015},
        {"LQD": 0.04, "HYG": 0.025, "AGG": -0.03, "VTI": -0.02},
        {"TLT": 0.055, "BIL": 0.015, "VTI": -0.04, "VXUS": -0.02},
        {"DBC": 0.045, "GLD": 0.025, "AGG": -0.035, "VTI": -0.02}
    ]
    for index, (name, hypothesis) in enumerate(SEED_IDEAS):
        tilt = deterministic_tilts[index % len(deterministic_tilts)]
        candidates.append(candidate(name, hypothesis, apply_tilts(base, tilt, order), "seed", order))

    if llm_ideas:
        for index, idea in enumerate(llm_ideas):
            generated = idea_to_candidate(idea, mandate, index, order)
            if generated:
                candidates.append(generated)

    candidates.extend(constraint_candidates(base, constraint_overrides, order))

    rng = random.Random(f"strategy-grid-{mandate}-{'-'.join(order)}")
    while len(candidates) < max_candidates:
        tilt = {symbol: rng.uniform(-0.04, 0.04) for symbol in order}
        name = f"Allocation Variant {len(candidates):02d}"
        hypothesis = "Explore a bounded allocation perturbation under the mandate guardrails."
        candidates.append(candidate(name, hypothesis, apply_tilts(base, tilt, order), "grid", order))

    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in candidates:
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        unique.append(item)
    return unique[:max_candidates]
