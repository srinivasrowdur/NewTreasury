from __future__ import annotations

import argparse
import json
from pathlib import Path

from research.evaluate import evaluate_candidates
from research.llm import generate_hypotheses
from research.memory import disclosure, load_memory, memory_context, prompt_context, remember_result
from research.prepare import prepare_prices
from research.strategy import generate_candidates
from research.universe import clean_universe_symbols

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "public" / "research-results" / "latest.json"
EXPERIMENT_DIR = ROOT / "research" / "experiments"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the self-improving investment research lab demo.")
    parser.add_argument("--mandate", choices=["conservative", "balanced", "growth"], default="balanced")
    parser.add_argument("--experiments", type=int, default=36)
    parser.add_argument("--use-llm", action="store_true", help="Ask OpenAI for additional research hypotheses.")
    parser.add_argument("--fallback-data", action="store_true", help="Use deterministic fallback data instead of public download.")
    parser.add_argument("--turns", type=int, default=5, help="Target number of visible self-improvement turns.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--json-events", action="store_true", help="Emit newline-delimited JSON progress events.")
    parser.add_argument("--constraints-json", help="JSON object with evaluator constraint overrides.")
    parser.add_argument("--universe-json", help="JSON array of approved instrument symbols to include in the run.")
    return parser.parse_args()


def emit_event(enabled: bool, payload: dict) -> None:
    if not enabled:
        return
    print(json.dumps(payload), flush=True)


def main() -> int:
    args = parse_args()
    constraint_overrides = None
    if args.constraints_json:
        parsed_constraints = json.loads(args.constraints_json)
        if not isinstance(parsed_constraints, dict):
            raise ValueError("--constraints-json must be a JSON object")
        constraint_overrides = parsed_constraints
    universe_symbols = None
    if args.universe_json:
        parsed_universe = json.loads(args.universe_json)
        if not isinstance(parsed_universe, list):
            raise ValueError("--universe-json must be a JSON array")
        universe_symbols = parsed_universe
    asset_order = clean_universe_symbols(universe_symbols)

    emit_event(args.json_events, {"type": "phase", "phase": "prepare", "message": "Preparing market data and mandate constraints."})
    prepare_prices(force_fallback=args.fallback_data, symbols=asset_order)
    emit_event(args.json_events, {"type": "phase", "phase": "memory", "message": "Loading prior research memory."})
    memory = load_memory()
    remembered = memory_context(memory, args.mandate, constraint_overrides)
    emit_event(args.json_events, {"type": "phase", "phase": "hypotheses", "message": "Generating research hypotheses."})
    llm_ideas = (
        generate_hypotheses(args.mandate, count=8, memory_context=prompt_context(remembered), asset_order=asset_order)
        if args.use_llm
        else []
    )
    requested_turns = max(4, min(10, int(args.turns)))

    emit_event(args.json_events, {"type": "phase", "phase": "candidates", "message": "Building candidate portfolio allocations.", "llm_ideas": len(llm_ideas)})
    candidates = generate_candidates(
        args.mandate,
        max_candidates=args.experiments,
        llm_ideas=llm_ideas,
        constraint_overrides=constraint_overrides,
        memory_context=remembered,
        asset_order=asset_order
    )
    emit_event(args.json_events, {"type": "phase", "phase": "evaluate", "message": f"Evaluating {len(candidates)} candidate portfolios."})
    result = evaluate_candidates(
        args.mandate,
        candidates,
        constraint_overrides=constraint_overrides,
        requested_turns=requested_turns,
        asset_order=asset_order
    )
    emit_event(
        args.json_events,
        {
            "type": "phase",
            "phase": "guardrails",
            "message": f"Applying guardrails. {result['rejected_count']} candidates rejected."
        }
    )
    result["llm_enabled"] = bool(args.use_llm)
    result["llm_ideas_used"] = len(llm_ideas)
    result["memory"] = disclosure(remembered)
    updated_memory = remember_result(result)
    result["memory"]["stored_runs"] = len(updated_memory.get("runs", []))
    result["memory"]["stored_lessons"] = len(updated_memory.get("lessons", []))
    result["memory"]["lessons"] = updated_memory.get("lessons", [])[:4]
    remembered_success = updated_memory.get("last_success_by_mandate", {}).get(args.mandate)
    if isinstance(remembered_success, dict):
        result["memory"]["last_success_candidate"] = remembered_success.get("candidate")
        result["memory"]["last_success_session_id"] = remembered_success.get("session_id")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2))

    EXPERIMENT_DIR.mkdir(parents=True, exist_ok=True)
    log_path = EXPERIMENT_DIR / f"{result['session_id']}.json"
    log_path.write_text(json.dumps(result, indent=2))

    summary = {
        "output": str(args.output),
        "session_id": result["session_id"],
        "candidate": result["candidate"]["name"],
        "llm_ideas_used": result["llm_ideas_used"],
        "source": result["source"],
        "universe_symbols": asset_order
    }
    emit_event(args.json_events, {"type": "complete", "phase": "complete", "message": "Research run complete.", **summary})
    if not args.json_events:
        print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
