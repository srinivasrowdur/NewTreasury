from __future__ import annotations

import json
import math
import random
import sys
import urllib.parse
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from research.universe import clean_universe_symbols

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
UNIVERSE_PATH = ROOT / "universe.json"
PRICES_PATH = DATA_DIR / "prices.json"
DEFAULT_GBP_USD_RATE = 1.27


def load_universe() -> dict:
    return json.loads(UNIVERSE_PATH.read_text())


def universe_for_symbols(symbols: list[str] | None = None) -> dict:
    universe = load_universe()
    if symbols is None:
        return universe

    selected = clean_universe_symbols(symbols)
    assets_by_symbol = {str(asset["symbol"]).upper(): asset for asset in universe["assets"]}
    return {
        **universe,
        "assets": [assets_by_symbol[symbol] for symbol in selected if symbol in assets_by_symbol]
    }


def month_add(start: date, months: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 28)


def fetch_yahoo_monthly(symbol: str, start: date) -> dict[str, float]:
    period1 = int(datetime(start.year, start.month, start.day, tzinfo=timezone.utc).timestamp())
    period2 = int((datetime.now(timezone.utc) + timedelta(days=2)).timestamp())
    query = urllib.parse.urlencode({
        "period1": period1,
        "period2": period2,
        "interval": "1mo",
        "events": "history",
        "includeAdjustedClose": "true"
    })
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?{query}"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 TreasuryLab/0.1"
        }
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))

    result = (payload.get("chart", {}).get("result") or [None])[0]
    if not result:
        error = payload.get("chart", {}).get("error") or {}
        raise RuntimeError(f"Yahoo chart returned no data for {symbol}: {error}")

    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators") or {}
    adjclose = ((indicators.get("adjclose") or [{}])[0].get("adjclose") or [])
    closes = ((indicators.get("quote") or [{}])[0].get("close") or [])
    values = adjclose if len(adjclose) == len(timestamps) else closes

    prices: dict[str, float] = {}
    for timestamp, close in zip(timestamps, values):
        if close is None:
            continue
        when = datetime.fromtimestamp(int(timestamp), tz=timezone.utc).date().isoformat()
        prices[when] = round(float(close), 4)

    if len(prices) < 60:
        raise RuntimeError(f"not enough Yahoo price history for {symbol}")
    return prices


def synthetic_returns(symbol: str, months: int) -> list[float]:
    params = {
        "VTI": (0.0072, 0.041),
        "VXUS": (0.0058, 0.047),
        "QQQ": (0.0083, 0.056),
        "IWM": (0.0066, 0.061),
        "VTV": (0.0064, 0.039),
        "VUG": (0.0078, 0.052),
        "USMV": (0.0057, 0.031),
        "AGG": (0.0028, 0.015),
        "BIL": (0.0016, 0.002),
        "ERNS.L": (0.0028, 0.003),
        "IGLT.L": (0.0027, 0.021),
        "INXG.L": (0.0030, 0.025),
        "SLXX.L": (0.0033, 0.014),
        "IGLH.L": (0.0029, 0.012),
        "SHY": (0.0019, 0.006),
        "TLT": (0.0030, 0.047),
        "LQD": (0.0037, 0.020),
        "HYG": (0.0046, 0.027),
        "GLD": (0.0040, 0.050),
        "VNQ": (0.0055, 0.055),
        "TIP": (0.0029, 0.018),
        "DBC": (0.0038, 0.055)
    }
    mean, vol = params.get(symbol, (0.004, 0.03))
    rng = random.Random(f"treasury-lab-{symbol}")
    returns: list[float] = []
    for index in range(months):
        cycle = math.sin(index / 9.0) * 0.006
        shock = 0.0
        if index in {23, 24, 25, 84, 85, 86}:
            shock = -0.055 if symbol in {"VTI", "VXUS", "QQQ", "IWM", "VTV", "VUG", "VNQ", "HYG"} else 0.008
        if index in {36, 37, 38} and symbol in {"AGG", "TIP", "TLT", "LQD", "IGLT.L", "INXG.L", "SLXX.L", "IGLH.L"}:
            shock -= 0.012
        returns.append(mean + cycle + shock + rng.gauss(0, vol))
    return returns


def fallback_fx(reason: str = "demo-assumption") -> dict:
    return {
        "pair": "GBP/USD",
        "gbp_usd": DEFAULT_GBP_USD_RATE,
        "source": reason,
        "as_of": None
    }


def fetch_gbp_usd_rate(start: date) -> dict:
    prices = fetch_yahoo_monthly("GBPUSD=X", start)
    latest_date = max(prices)
    return {
        "pair": "GBP/USD",
        "gbp_usd": round(float(prices[latest_date]), 4),
        "source": "yahoo-chart-monthly",
        "as_of": latest_date
    }


def build_synthetic_prices(universe: dict) -> dict:
    start = date.fromisoformat(universe["fallback_start"])
    months = int(universe["fallback_months"])
    output: dict[str, dict[str, float]] = {}
    for asset in universe["assets"]:
        symbol = asset["symbol"]
        price = 100.0
        series: dict[str, float] = {}
        for index, ret in enumerate(synthetic_returns(symbol, months)):
            price *= 1 + ret
            series[month_add(start, index).isoformat()] = round(price, 4)
        output[symbol] = series
    return {
        "source": "synthetic-fallback",
        "description": "Deterministic scenario data used when public instrument download is unavailable.",
        "fx": fallback_fx("synthetic-fallback"),
        "prices": output
    }


def cached_prices_cover(symbols: list[str]) -> bool:
    if not PRICES_PATH.exists():
        return False
    try:
        payload = json.loads(PRICES_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return False
    prices = payload.get("prices")
    if not isinstance(prices, dict):
        return False
    if payload.get("source") == "synthetic-fallback":
        return False
    return all(symbol in prices and isinstance(prices[symbol], dict) for symbol in symbols)


def prepare_prices(force_fallback: bool = False, symbols: list[str] | None = None) -> dict:
    universe = universe_for_symbols(symbols)
    selected_symbols = [asset["symbol"] for asset in universe["assets"]]
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not force_fallback and cached_prices_cover(selected_symbols):
        cached = json.loads(PRICES_PATH.read_text())
        if "fx" not in cached:
            cached["fx"] = fallback_fx("cached-without-fx")
        return cached
    if force_fallback:
        result = build_synthetic_prices(universe)
        PRICES_PATH.write_text(json.dumps(result, indent=2))
        return result

    downloaded: dict[str, dict[str, float]] = {}
    try:
        start = date.fromisoformat(universe["fallback_start"])
        for asset in universe["assets"]:
            downloaded[asset["symbol"]] = fetch_yahoo_monthly(asset["symbol"], start)
        try:
            fx = fetch_gbp_usd_rate(start)
        except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
            fx = fallback_fx(f"{exc.__class__.__name__}-fallback")
        result = {
            "source": "yahoo-chart-monthly",
            "description": "Monthly adjusted instrument closes and GBP/USD FX downloaded from Yahoo Finance chart data.",
            "downloaded_at": datetime.now(timezone.utc).isoformat(),
            "fx": fx,
            "prices": downloaded
        }
    except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
        result = build_synthetic_prices(universe)
        result["download_error"] = exc.__class__.__name__
        result["description"] = "Deterministic scenario data used because public market data could not be downloaded."

    PRICES_PATH.write_text(json.dumps(result, indent=2))
    return result


def main() -> int:
    force_fallback = "--fallback" in sys.argv
    result = prepare_prices(force_fallback=force_fallback)
    print(json.dumps({"source": result["source"], "symbols": len(result["prices"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
