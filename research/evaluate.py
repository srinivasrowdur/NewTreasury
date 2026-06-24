from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from research.prepare import PRICES_PATH, prepare_prices
from research.strategy import ASSET_ORDER, DEFENSIVE_SYMBOLS

ROOT = Path(__file__).resolve().parent
CONSTRAINTS_PATH = ROOT / "constraints.json"
UNIVERSE_PATH = ROOT / "universe.json"

CONSTRAINT_RANGES = {
    "max_drawdown": (0.05, 0.35),
    "max_volatility": (0.04, 0.25),
    "max_single_asset": (0.20, 0.70),
    "min_defensive_weight": (0.00, 0.75),
    "max_turnover": (0.05, 0.80),
    "min_liquidity_score": (5.0, 10.0)
}

TURN_DEFINITIONS = [
    ("baseline", "Baseline", "Current mandate before any improvement."),
    ("memory", "Memory recall", "Candidates rebuilt from prior successful research runs."),
    ("seed", "Seed hypotheses", "Deterministic research priors tested against the rules."),
    ("llm", "OpenAI hypotheses", "LLM-generated allocation ideas added to the search."),
    ("constraint", "Constraint response", "Candidates built specifically for the selected constraints.")
]

ALLOCATION_GROUPS = [
    ("equity", "Equity", ("VTI", "VXUS", "QQQ", "IWM", "VTV", "VUG", "USMV")),
    ("defensive", "Defensive", DEFENSIVE_SYMBOLS),
    ("credit", "Credit", ("HYG", "SLXX.L", "LQD")),
    ("alternatives", "Alternatives", ("GLD", "VNQ", "DBC"))
]
DEFAULT_GBP_USD_RATE = 1.27


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


def active_order(asset_order: list[str] | None = None) -> list[str]:
    return list(asset_order or ASSET_ORDER)


def normalize_weights(weights: dict[str, float], asset_order: list[str] | None = None) -> dict[str, float]:
    order = active_order(asset_order)
    clipped = {symbol: max(0.0, float(weights.get(symbol, 0.0))) for symbol in order}
    total = sum(clipped.values())
    if total <= 0:
        return {symbol: round(1.0 / len(order), 6) for symbol in order}
    return {symbol: round(value / total, 6) for symbol, value in clipped.items()}


def apply_constraint_overrides(
    mandate_rules: dict,
    overrides: dict[str, Any] | None,
    asset_order: list[str] | None = None
) -> dict:
    rules = dict(mandate_rules)
    rules["baseline_weights"] = normalize_weights(dict(mandate_rules["baseline_weights"]), asset_order)
    if not overrides:
        return rules

    for key, value in overrides.items():
        if key not in CONSTRAINT_RANGES or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            continue
        lower, upper = CONSTRAINT_RANGES[key]
        rules[key] = clamp(float(value), lower, upper)
    return rules


def load_prices(asset_order: list[str] | None = None) -> dict:
    order = active_order(asset_order)
    if not PRICES_PATH.exists():
        prepare_prices(symbols=order)
    payload = load_json(PRICES_PATH)
    prices = payload.get("prices", {})
    if not all(symbol in prices for symbol in order):
        payload = prepare_prices(symbols=order)
        prices = payload.get("prices", {})
    if not all(symbol in prices for symbol in order):
        missing = ", ".join(symbol for symbol in order if symbol not in prices)
        raise RuntimeError(f"missing price data for selected instruments: {missing}")
    return payload


def aligned_returns(price_payload: dict, asset_order: list[str] | None = None) -> tuple[list[str], dict[str, list[float]]]:
    order = active_order(asset_order)
    prices = price_payload["prices"]
    monthly_prices: dict[str, dict[str, float]] = {}
    for symbol in order:
        series = prices[symbol]
        by_month: dict[str, float] = {}
        for date_key in sorted(series):
            month_key = str(date_key)[:7]
            by_month[month_key] = float(series[date_key])
        monthly_prices[symbol] = by_month

    common_months = sorted(set.intersection(*(set(monthly_prices[symbol].keys()) for symbol in order)))
    common_months = common_months[-132:] if len(common_months) > 132 else common_months
    if len(common_months) < 36:
        raise RuntimeError("at least 36 months of aligned price data is required")

    returns: dict[str, list[float]] = {}
    for symbol in order:
        series = monthly_prices[symbol]
        symbol_returns = []
        for before, after in zip(common_months, common_months[1:]):
            previous = float(series[before])
            current = float(series[after])
            symbol_returns.append((current / previous) - 1)
        returns[symbol] = symbol_returns
    return [f"{month}-01" for month in common_months[1:]], returns


def portfolio_returns(
    weights: dict[str, float],
    returns: dict[str, list[float]],
    asset_order: list[str] | None = None
) -> list[float]:
    order = active_order(asset_order)
    length = len(next(iter(returns.values())))
    output = []
    for index in range(length):
        output.append(sum(float(weights.get(symbol, 0.0)) * returns[symbol][index] for symbol in order))
    return output


def annualized_return(monthly_returns: list[float]) -> float:
    total = 1.0
    for item in monthly_returns:
        total *= 1 + item
    return total ** (12 / len(monthly_returns)) - 1


def annualized_volatility(monthly_returns: list[float]) -> float:
    mean = sum(monthly_returns) / len(monthly_returns)
    variance = sum((item - mean) ** 2 for item in monthly_returns) / max(1, len(monthly_returns) - 1)
    return math.sqrt(variance) * math.sqrt(12)


def max_drawdown(monthly_returns: list[float]) -> float:
    value = 1.0
    peak = 1.0
    worst = 0.0
    for item in monthly_returns:
        value *= 1 + item
        peak = max(peak, value)
        worst = min(worst, value / peak - 1)
    return worst


def sharpe_ratio(monthly_returns: list[float], annual_risk_free: float = 0.02) -> float:
    annual_return = annualized_return(monthly_returns)
    volatility = annualized_volatility(monthly_returns)
    if volatility == 0:
        return 0.0
    return (annual_return - annual_risk_free) / volatility


def cumulative_index(monthly_returns: list[float]) -> list[float]:
    index = 100.0
    output = []
    for item in monthly_returns:
        index *= 1 + item
        output.append(round(index, 2))
    return output


def weighted_liquidity(
    weights: dict[str, float],
    universe: dict,
    asset_order: list[str] | None = None
) -> float:
    order = active_order(asset_order)
    scores = {item["symbol"]: float(item["liquidity_score"]) for item in universe["assets"]}
    return sum(float(weights.get(symbol, 0.0)) * scores[symbol] for symbol in order)


def turnover(
    weights: dict[str, float],
    baseline: dict[str, float],
    asset_order: list[str] | None = None
) -> float:
    order = active_order(asset_order)
    return sum(abs(float(weights.get(symbol, 0.0)) - float(baseline.get(symbol, 0.0))) for symbol in order) / 2


def defensive_weight(weights: dict[str, float]) -> float:
    return sum(float(weights.get(symbol, 0.0)) for symbol in DEFENSIVE_SYMBOLS)


def metric_pack(monthly_returns: list[float]) -> dict[str, float]:
    return {
        "annualized_return": annualized_return(monthly_returns),
        "volatility": annualized_volatility(monthly_returns),
        "max_drawdown": max_drawdown(monthly_returns),
        "sharpe": sharpe_ratio(monthly_returns)
    }


def guardrails(
    candidate: dict[str, Any],
    metrics: dict[str, float],
    mandate_rules: dict,
    universe: dict,
    asset_order: list[str] | None = None
) -> list[dict[str, Any]]:
    order = active_order(asset_order)
    weights = candidate["weights"]
    baseline = mandate_rules["baseline_weights"]
    max_weight = max(float(weights.get(symbol, 0.0)) for symbol in order)
    current_turnover = turnover(weights, baseline, order)
    current_defensive = defensive_weight(weights)
    current_liquidity = weighted_liquidity(weights, universe, order)
    rows = [
        {
            "label": "Max drawdown",
            "limit": f"<= {mandate_rules['max_drawdown']:.0%}",
            "current": f"{abs(metrics['max_drawdown']):.1%}",
            "pass": abs(metrics["max_drawdown"]) <= mandate_rules["max_drawdown"]
        },
        {
            "label": "Volatility",
            "limit": f"<= {mandate_rules['max_volatility']:.0%}",
            "current": f"{metrics['volatility']:.1%}",
            "pass": metrics["volatility"] <= mandate_rules["max_volatility"]
        },
        {
            "label": "Max single asset",
            "limit": f"<= {mandate_rules['max_single_asset']:.0%}",
            "current": f"{max_weight:.1%}",
            "pass": max_weight <= mandate_rules["max_single_asset"]
        },
        {
            "label": "Turnover vs. baseline",
            "limit": f"<= {mandate_rules['max_turnover']:.0%}",
            "current": f"{current_turnover:.1%}",
            "pass": current_turnover <= mandate_rules["max_turnover"]
        },
        {
            "label": "Defensive allocation",
            "limit": f">= {mandate_rules['min_defensive_weight']:.0%}",
            "current": f"{current_defensive:.1%}",
            "pass": current_defensive >= mandate_rules["min_defensive_weight"]
        },
        {
            "label": "Liquidity score",
            "limit": f">= {mandate_rules['min_liquidity_score']:.1f}",
            "current": f"{current_liquidity:.1f}",
            "pass": current_liquidity >= mandate_rules["min_liquidity_score"]
        }
    ]
    return rows


def score_candidate(metrics: dict[str, float], baseline_metrics: dict[str, float], guardrail_rows: list[dict[str, Any]]) -> float:
    failures = sum(1 for row in guardrail_rows if not row["pass"])
    return (
        0.35 * (metrics["annualized_return"] - baseline_metrics["annualized_return"]) * 100
        + 0.25 * (metrics["sharpe"] - baseline_metrics["sharpe"])
        + 0.20 * (abs(baseline_metrics["max_drawdown"]) - abs(metrics["max_drawdown"])) * 100
        - 0.30 * max(0.0, abs(metrics["max_drawdown"]) - abs(baseline_metrics["max_drawdown"])) * 100
        - 2.0 * failures
    )


def rounded_weights(weights: dict[str, float], asset_order: list[str] | None = None) -> dict[str, float]:
    order = active_order(asset_order)
    return {symbol: round(float(weights.get(symbol, 0.0)), 6) for symbol in order}


def allocation_groups(weights: dict[str, float], asset_order: list[str] | None = None) -> dict[str, float]:
    order = set(active_order(asset_order))
    return {
        key: round(sum(float(weights.get(symbol, 0.0)) for symbol in symbols if symbol in order), 6)
        for key, _label, symbols in ALLOCATION_GROUPS
    }


def asset_metadata(universe: dict) -> dict[str, dict[str, Any]]:
    return {
        str(asset.get("symbol", "")).upper(): asset
        for asset in universe.get("assets", [])
        if asset.get("symbol")
    }


def currency_exposure_summary(
    weights: dict[str, float],
    universe: dict,
    price_payload: dict,
    asset_order: list[str] | None = None
) -> dict[str, Any]:
    order = active_order(asset_order)
    metadata = asset_metadata(universe)
    fx = price_payload.get("fx") if isinstance(price_payload.get("fx"), dict) else {}
    try:
        gbp_usd_rate = float(fx.get("gbp_usd", DEFAULT_GBP_USD_RATE))
    except (TypeError, ValueError):
        gbp_usd_rate = DEFAULT_GBP_USD_RATE

    usd_exposure = 0.0
    gbp_native = 0.0
    gbp_hedged = 0.0
    unhedged = 0.0
    for symbol in order:
        weight = float(weights.get(symbol, 0.0))
        asset = metadata.get(symbol, {})
        hedge = str(asset.get("hedge") or "USD unhedged")
        currency = str(asset.get("currency") or "USD")
        exposure = float(asset.get("usd_exposure", 0.0 if currency == "GBP" else 1.0))
        usd_exposure += weight * exposure
        if hedge == "GBP native":
            gbp_native += weight
        elif hedge == "GBP hedged":
            gbp_hedged += weight
        elif "unhedged" in hedge.lower():
            unhedged += weight

    usd_exposure = max(0.0, min(1.0, usd_exposure))
    gbp_native_or_hedged = max(0.0, min(1.0, 1.0 - usd_exposure))
    return {
        "base_currency": "GBP",
        "quote_currency": "USD",
        "gbp_usd_rate": round(gbp_usd_rate, 4),
        "source": fx.get("source") or "demo-assumption",
        "as_of": fx.get("as_of"),
        "usd_exposure": round(usd_exposure, 6),
        "gbp_native_or_hedged": round(gbp_native_or_hedged, 6),
        "gbp_native": round(gbp_native, 6),
        "gbp_hedged": round(gbp_hedged, 6),
        "unhedged": round(unhedged, 6),
        "warning": f"This allocation has {usd_exposure * 100:.1f}% USD exposure before hedging."
    }


def signed_percentage_points(value: float) -> str:
    sign = "+" if value >= 0 else "-"
    return f"{sign}{abs(value) * 100:.1f} pp"


def summarize_allocation_change(
    previous: dict[str, float] | None,
    current: dict[str, float],
    asset_order: list[str] | None = None
) -> str:
    if previous is None:
        return "Starting allocation"

    previous_groups = allocation_groups(previous, asset_order)
    current_groups = allocation_groups(current, asset_order)
    shifts = []
    for key, label, _symbols in ALLOCATION_GROUPS:
        delta = current_groups[key] - previous_groups[key]
        shifts.append(f"{label} {signed_percentage_points(delta)}")
    return ", ".join(shifts)


SOURCE_LABELS = {
    "baseline": "baseline",
    "memory": "research memory",
    "seed": "seed hypothesis",
    "llm": "OpenAI hypothesis",
    "constraint": "constraint response",
    "grid": "improvement search"
}


def source_label(source: str | None) -> str:
    return SOURCE_LABELS.get(str(source or ""), str(source or "candidate"))


def parse_metric(value: Any) -> float | None:
    text = "".join(character for character in str(value or "") if character.isdigit() or character in ".-")
    try:
        parsed = float(text)
    except ValueError:
        return None
    return parsed if math.isfinite(parsed) else None


def guardrail_pressure(row: dict[str, Any]) -> float:
    current = parse_metric(row.get("current"))
    limit = parse_metric(row.get("limit"))
    if current is None or limit is None or limit <= 0:
        return 0.0
    return limit / max(current, 0.0001) if ">=" in str(row.get("limit")) else current / limit


def rejected_candidate_summary(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    for item in [entry for entry in items if not entry["passes"]][:3]:
        output.append({
            "name": item["candidate"]["name"],
            "score": round(float(item["score"]), 2),
            "failed_constraints": [
                row["label"]
                for row in item["guardrails"]
                if not row["pass"]
            ][:3]
        })
    return output


def constraint_driver(best: dict[str, Any], group: list[dict[str, Any]]) -> dict[str, Any] | None:
    failed: dict[str, int] = {}
    for item in group:
        for row in [entry for entry in item["guardrails"] if not entry["pass"]]:
            failed[row["label"]] = failed.get(row["label"], 0) + 1
    if failed:
        label, count = max(failed.items(), key=lambda item: item[1])
        return {
            "label": label,
            "status": "Rejected candidates",
            "detail": f"{count} new candidate{'s' if count != 1 else ''} failed this rule."
        }
    closest = max(best["guardrails"], key=guardrail_pressure, default=None)
    if not closest:
        return None
    return {
        "label": closest["label"],
        "status": "Closest passing rule" if closest["pass"] else "Failed rule",
        "current": closest["current"],
        "limit": closest["limit"],
        "detail": f"{closest['current']} versus {closest['limit']}"
    }


def turn_why_changed(previous_turn: dict[str, Any] | None, best: dict[str, Any], source: str) -> str:
    best_name = best["candidate"]["name"]
    candidate_source = source_label(best["candidate"].get("source", source))
    if previous_turn is None:
        return "Started from the mandate baseline so every later candidate has a controlled comparison point."
    if previous_turn["best_candidate"] == best_name:
        return f"No promotion: the new {source_label(source)} candidates did not beat {best_name} after scoring and guardrails."
    delta = float(best["score"]) - float(previous_turn.get("score", 0.0))
    return (
        f"Promoted {best_name} from {candidate_source} because it ranked higher after return, "
        f"drawdown, and guardrail checks. Score improved by {delta:+.2f}."
    )


def openai_review(seen: list[dict[str, Any]], group: list[dict[str, Any]], best: dict[str, Any]) -> dict[str, Any]:
    llm_seen = [item for item in seen if item["candidate"].get("source") == "llm"]
    llm_in_turn = [item for item in group if item["candidate"].get("source") == "llm"]
    rejected = sum(1 for item in llm_seen if not item["passes"])
    accepted_openai = best["candidate"].get("source") == "llm"
    if not llm_seen:
        return {
            "proposed": 0,
            "accepted": best["candidate"]["name"],
            "accepted_source": source_label(best["candidate"].get("source")),
            "rejected": 0,
            "note": "No OpenAI candidates had entered the search yet."
        }
    return {
        "proposed": len(llm_seen),
        "proposed_this_turn": len(llm_in_turn),
        "accepted": best["candidate"]["name"],
        "accepted_source": source_label(best["candidate"].get("source")),
        "rejected": rejected,
        "note": (
            "Evaluator accepted an OpenAI hypothesis as best so far."
            if accepted_openai
            else f"Evaluator kept {source_label(best['candidate'].get('source'))} ahead of the OpenAI proposals."
        )
    }


def append_turn(
    turns: list[dict[str, Any]],
    seen: list[dict[str, Any]],
    group: list[dict[str, Any]],
    label: str,
    focus: str,
    source: str,
    previous_weights: dict[str, float] | None,
    asset_order: list[str] | None = None
) -> dict[str, float]:
    order = active_order(asset_order)
    seen.extend(group)
    eligible = [item for item in seen if item["passes"]]
    best_so_far = max(eligible or seen, key=lambda item: item["score"])
    best_candidate = best_so_far["candidate"]
    metrics = best_so_far["metrics"]
    weights = rounded_weights(best_candidate["weights"], order)
    previous_turn = turns[-1] if turns else None

    turns.append({
        "turn": len(turns) + 1,
        "source": source,
        "label": label,
        "focus": focus,
        "new_candidates": len(group),
        "candidates_tested": len(seen),
        "rejected_count": sum(1 for item in seen if not item["passes"]),
        "best_candidate": best_candidate["name"],
        "candidate_source": best_candidate.get("source", source),
        "score": round(float(best_so_far["score"]), 4),
        "expected_return": round(float(metrics["annualized_return"]), 6),
        "volatility": round(float(metrics["volatility"]), 6),
        "max_drawdown": round(float(metrics["max_drawdown"]), 6),
        "sharpe": round(float(metrics["sharpe"]), 6),
        "candidate_passes": bool(best_so_far["passes"]),
        "weights": weights,
        "allocation_groups": allocation_groups(weights, order),
        "change_summary": summarize_allocation_change(previous_weights, weights, order),
        "why_changed": turn_why_changed(previous_turn, best_so_far, source),
        "constraint_driver": constraint_driver(best_so_far, group),
        "rejected_candidates": rejected_candidate_summary(group),
        "openai_review": openai_review(seen, group, best_so_far)
    })
    return weights


def chunked(items: list[dict[str, Any]], chunk_count: int) -> list[list[dict[str, Any]]]:
    if not items:
        return []
    chunk_count = max(1, min(chunk_count, len(items)))
    base_size = len(items) // chunk_count
    remainder = len(items) % chunk_count
    chunks = []
    start = 0
    for index in range(chunk_count):
        size = base_size + (1 if index < remainder else 0)
        chunks.append(items[start : start + size])
        start += size
    return chunks


def build_self_improvement_turns(
    evaluated: list[dict[str, Any]],
    requested_turns: int | None = None,
    asset_order: list[str] | None = None
) -> list[dict[str, Any]]:
    order = active_order(asset_order)
    turns = []
    seen: list[dict[str, Any]] = []
    previous_weights: dict[str, float] | None = None

    for source, label, focus in TURN_DEFINITIONS:
        group = [item for item in evaluated if item["candidate"].get("source") == source]
        if not group:
            continue
        previous_weights = append_turn(turns, seen, group, label, focus, source, previous_weights, order)

    grid_group = [item for item in evaluated if item["candidate"].get("source") == "grid"]
    if grid_group and (not isinstance(requested_turns, int) or len(turns) < requested_turns):
        target_turns = requested_turns if isinstance(requested_turns, int) else len(turns) + 1
        search_turn_count = max(1, target_turns - len(turns))
        search_chunks = chunked(grid_group, search_turn_count)
        for index, group in enumerate(search_chunks):
            label = "Improvement search" if len(search_chunks) == 1 else f"Improvement search {index + 1}"
            focus = (
                "Bounded allocation variants swept by the evaluator."
                if len(search_chunks) == 1
                else f"Search wave {index + 1} of {len(search_chunks)} across bounded allocation variants."
            )
            previous_weights = append_turn(turns, seen, group, label, focus, "grid", previous_weights, order)

    return turns


def evaluate_candidates(
    mandate: str,
    candidates: list[dict[str, Any]],
    constraint_overrides: dict[str, Any] | None = None,
    requested_turns: int | None = None,
    asset_order: list[str] | None = None
) -> dict[str, Any]:
    order = active_order(asset_order)
    constraints = load_json(CONSTRAINTS_PATH)
    universe = load_json(UNIVERSE_PATH)
    mandate_rules = apply_constraint_overrides(constraints[mandate], constraint_overrides, order)
    price_payload = load_prices(order)
    dates, returns = aligned_returns(price_payload, order)
    baseline_returns = portfolio_returns(mandate_rules["baseline_weights"], returns, order)
    baseline_metrics = metric_pack(baseline_returns)

    evaluated = []
    for item in candidates:
        candidate_returns = portfolio_returns(item["weights"], returns, order)
        metrics = metric_pack(candidate_returns)
        guardrail_rows = guardrails(item, metrics, mandate_rules, universe, order)
        passes = all(row["pass"] for row in guardrail_rows)
        evaluated.append({
            "candidate": item,
            "metrics": metrics,
            "returns": candidate_returns,
            "guardrails": guardrail_rows,
            "passes": passes,
            "score": score_candidate(metrics, baseline_metrics, guardrail_rows)
        })

    eligible = [item for item in evaluated if item["passes"]]
    best = max(eligible or evaluated, key=lambda item: item["score"])
    turns = build_self_improvement_turns(evaluated, requested_turns=requested_turns, asset_order=order)
    rejected_count = sum(1 for item in evaluated if not item["passes"])
    candidate_index = cumulative_index(best["returns"])
    benchmark_index = cumulative_index(baseline_returns)
    stride = max(1, len(dates) // 16)
    chart = [
        {"label": dates[index][:4], "candidate": candidate_index[index], "benchmark": benchmark_index[index]}
        for index in range(0, len(dates), stride)
    ]
    if chart[-1]["label"] != dates[-1][:4]:
        chart.append({"label": dates[-1][:4], "candidate": candidate_index[-1], "benchmark": benchmark_index[-1]})

    best_candidate = best["candidate"]
    best_metrics = best["metrics"]
    best_weights = rounded_weights(best_candidate["weights"], order)
    best_currency_exposure = currency_exposure_summary(best_weights, universe, price_payload, order)
    is_market_data = price_payload["source"] != "synthetic-fallback"
    source_label = "Public instrument closes + GBP/USD FX" if is_market_data else "Demonstration scenario data"
    memo = (
        f"{best_candidate['name']} is the current top-ranked research candidate. "
        "It passed the locked drawdown, volatility, concentration, turnover, defensive-allocation, "
        "and liquidity checks. This is a research recommendation for review, not a trading instruction."
    )
    if not best["passes"]:
        failed_rules = ", ".join(row["label"] for row in best["guardrails"] if not row["pass"])
        memo = (
            f"No tested candidate passed every guardrail. {best_candidate['name']} is the highest-ranked exception "
            f"for human review, with unresolved checks: {failed_rules}. This is not a trading instruction."
        )

    return {
        "schema_version": 1,
        "session_id": f"research-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": price_payload["source"],
        "data_summary": {
            "source": price_payload["source"],
            "label": source_label,
            "description": price_payload.get("description", ""),
            "range_start": dates[0],
            "range_end": dates[-1],
            "observations": len(dates),
            "assets": len(order),
            "is_market_data": is_market_data
        },
        "universe_symbols": order,
        "currency_exposure": best_currency_exposure,
        "mandate": mandate_rules["label"],
        "completed_experiments": len(evaluated),
        "total_experiments": len(evaluated),
        "rejected_count": rejected_count,
        "requested_turns": requested_turns,
        "candidate_passes": bool(best["passes"]),
        "constraints_applied": {
            key: mandate_rules[key]
            for key in CONSTRAINT_RANGES
            if key in mandate_rules
        },
        "active_step": 3,
        "candidate": {
            "id": best_candidate["id"],
            "name": best_candidate["name"],
            "hypothesis": best_candidate["hypothesis"],
            "expected_return": best_metrics["annualized_return"],
            "volatility": best_metrics["volatility"],
            "max_drawdown": best_metrics["max_drawdown"],
            "sharpe": best_metrics["sharpe"],
            "score": best["score"],
            "weights": best_weights
        },
        "baseline": baseline_metrics,
        "chart": chart,
        "turns": turns,
        "risk": [
            {
                "label": row["label"],
                "limit": row["limit"],
                "current": row["current"],
                "status": "Pass" if row["pass"] else "Fail"
            }
            for row in best["guardrails"]
        ],
        "audit_trail": [
            f"Generated {len(evaluated)} candidate strategies for the {mandate_rules['label']} mandate across {len(order)} selected instruments.",
            f"Recorded {len(turns)} self-improvement turns and kept the best passing allocation after each turn.",
            f"Rejected {rejected_count} candidates for guardrail failures.",
            best_currency_exposure["warning"],
            f"Promoted {best_candidate['name']} after locked evaluator scoring.",
            "Queued recommendation for human portfolio-manager review."
        ],
        "why": [
            "Best risk-adjusted score among candidates passing all hard guardrails.",
            "Maintains diversification across equity, GBP cash, bond, credit, and alternative exposures.",
            best_currency_exposure["warning"],
            "Improves expected return while preserving mandate drawdown controls.",
            "All recommendations remain research-only until human approval."
        ],
        "memo": memo
    }
