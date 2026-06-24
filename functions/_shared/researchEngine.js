const TURN_DISPLAY_MS = 1100;
const MAX_JOB_AGE_SECONDS = 60 * 60 * 6;

const constraintRanges = {
  max_drawdown: [0.05, 0.35],
  max_volatility: [0.04, 0.25],
  max_single_asset: [0.2, 0.7],
  min_defensive_weight: [0, 0.75],
  max_turnover: [0.05, 0.8],
  min_liquidity_score: [5, 10]
};

const constraints = {
  conservative: {
    label: "Conservative",
    max_drawdown: 0.1,
    max_volatility: 0.075,
    max_single_asset: 0.5,
    max_turnover: 0.35,
    min_defensive_weight: 0.45,
    min_liquidity_score: 7,
    baseline_weights: { VTI: 0.12, VXUS: 0.06, AGG: 0.06, "ERNS.L": 0.26, "IGLT.L": 0.24, "SLXX.L": 0.14, "IGLH.L": 0.02, "INXG.L": 0.06, GLD: 0.04 }
  },
  balanced: {
    label: "Balanced",
    max_drawdown: 0.25,
    max_volatility: 0.13,
    max_single_asset: 0.45,
    max_turnover: 0.45,
    min_defensive_weight: 0.25,
    min_liquidity_score: 7,
    baseline_weights: { VTI: 0.2, VXUS: 0.1, AGG: 0.06, "ERNS.L": 0.16, "IGLT.L": 0.16, "SLXX.L": 0.1, "IGLH.L": 0.08, "INXG.L": 0.04, GLD: 0.07, VNQ: 0.03 }
  },
  growth: {
    label: "Growth",
    max_drawdown: 0.22,
    max_volatility: 0.15,
    max_single_asset: 0.5,
    max_turnover: 0.55,
    min_defensive_weight: 0.15,
    min_liquidity_score: 6.5,
    baseline_weights: { VTI: 0.36, VXUS: 0.18, QQQ: 0.08, AGG: 0.06, "ERNS.L": 0.08, "IGLT.L": 0.06, "SLXX.L": 0.06, "INXG.L": 0.03, GLD: 0.06, VNQ: 0.03 }
  }
};

const approvedEtfs = [
  ["VTI", "US Total Equity", "Core equity", 9.5, "USD", "USD unhedged", 1],
  ["VXUS", "Global ex-US Equity", "Core equity", 8.7, "USD", "USD unhedged", 1],
  ["QQQ", "Nasdaq 100 Growth", "Growth equity", 9.7, "USD", "USD unhedged", 1],
  ["IWM", "US Small Cap", "Growth equity", 9.3, "USD", "USD unhedged", 1],
  ["VTV", "US Value Equity", "Factor equity", 8.9, "USD", "USD unhedged", 1],
  ["VUG", "US Growth Equity", "Factor equity", 8.9, "USD", "USD unhedged", 1],
  ["USMV", "Minimum Volatility Equity", "Defensive equity", 8.4, "USD", "USD unhedged", 1],
  ["AGG", "US Core Bonds", "USD fixed income", 9.1, "USD", "USD unhedged", 1],
  ["BIL", "US T-Bills", "USD cash", 9.8, "USD", "USD unhedged", 1],
  ["ERNS.L", "iShares GBP Ultrashort Bond", "GBP cash", 8.8, "GBP", "GBP native", 0],
  ["IGLT.L", "iShares UK Gilts", "GBP government bonds", 8.9, "GBP", "GBP native", 0],
  ["INXG.L", "iShares Index-Linked Gilts", "GBP inflation-linked bonds", 8.5, "GBP", "GBP native", 0],
  ["SLXX.L", "iShares GBP Corporate Bond", "GBP credit", 8.4, "GBP", "GBP native", 0],
  ["IGLH.L", "iShares Global Govt Bond GBP Hedged", "GBP hedged bonds", 8.0, "GBP", "GBP hedged", 0.05],
  ["TIP", "US Inflation-Linked Bonds", "USD fixed income", 8.6, "USD", "USD unhedged", 1],
  ["SHY", "US Short Treasuries", "USD fixed income", 9.2, "USD", "USD unhedged", 1],
  ["TLT", "US Long Treasuries", "Duration hedge", 9.4, "USD", "USD unhedged", 1],
  ["LQD", "US Investment Grade Credit", "Credit", 9.0, "USD", "USD unhedged", 1],
  ["HYG", "US High Yield Credit", "Credit", 9.1, "USD", "USD unhedged", 1],
  ["GLD", "Gold", "Alternatives", 8.9, "USD", "USD unhedged", 1],
  ["VNQ", "US Real Estate", "Real assets", 8.3, "USD", "USD unhedged", 1],
  ["DBC", "Broad Commodities", "Real assets", 7.8, "USD", "USD unhedged", 1]
].map(([symbol, name, category, liquidity_score, currency, hedge, usd_exposure]) => ({
  symbol,
  name,
  category,
  liquidity_score,
  currency,
  hedge,
  usd_exposure
}));

const approvedOrder = approvedEtfs.map((asset) => asset.symbol);
const assetBySymbol = Object.fromEntries(approvedEtfs.map((asset) => [asset.symbol, asset]));
const defaultUniverseSymbols = ["VTI", "VXUS", "AGG", "ERNS.L", "IGLT.L", "SLXX.L", "IGLH.L", "GLD", "VNQ", "INXG.L"];
const defensiveSymbols = ["AGG", "BIL", "ERNS.L", "IGLT.L", "INXG.L", "SLXX.L", "IGLH.L", "TIP", "SHY", "TLT", "LQD"];
const allocationGroups = [
  ["equity", "Equity", ["VTI", "VXUS", "QQQ", "IWM", "VTV", "VUG", "USMV"]],
  ["defensive", "Defensive", defensiveSymbols],
  ["credit", "Credit", ["HYG", "SLXX.L", "LQD"]],
  ["alternatives", "Alternatives", ["GLD", "VNQ", "DBC"]]
];
const DEFAULT_GBP_USD_RATE = 1.27;

const seedIdeas = [
  ["Global Quality Multi-Asset", "Tilt toward diversified equity while preserving defensive ballast."],
  ["Defensive Carry Blend", "Increase GBP cash, gilts, and high-quality bonds to reduce drawdown while retaining income."],
  ["Inflation Shock Absorber", "Use gold and TIPS as inflation-sensitive diversifiers."],
  ["Global Equity Balance", "Spread equity risk across US and international exposures."],
  ["Real Asset Sleeve", "Add moderate real asset exposure while respecting drawdown limits."],
  ["Sterling Liquidity Reserve", "Hold more GBP cash-like exposure to reduce volatility and preserve deployment capacity."],
  ["Gilt Barbell", "Pair ultrashort GBP bonds with gilts and linkers for rate and inflation resilience."],
  ["GBP Hedge Upgrade", "Test whether hedged global bonds reduce unhedged USD exposure without losing defensive carry."],
  ["Diversified Growth", "Increase equity return drivers without breaching concentration limits."],
  ["Nasdaq Growth Engine", "Test whether a focused growth sleeve improves expected return."],
  ["Minimum Volatility Equity", "Replace broad equity risk with lower-volatility equity exposure."],
  ["Credit Carry Sleeve", "Add liquid credit exposure as a differentiated income driver."],
  ["Duration Hedge", "Use long Treasuries as a rate-shock hedge."],
  ["Commodity Diversifier", "Add broad commodities as a second inflation-sensitive real asset."]
];

const seedTilts = [
  { VTI: 0.04, VXUS: 0.01, QQQ: 0.02, "ERNS.L": -0.025, "IGLT.L": -0.025, AGG: -0.02 },
  { VTI: -0.04, VXUS: -0.01, "ERNS.L": 0.025, "IGLT.L": 0.025, "IGLH.L": 0.015 },
  { GLD: 0.035, DBC: 0.025, "INXG.L": 0.03, AGG: -0.03, VNQ: -0.01 },
  { VXUS: 0.05, VTI: -0.03, AGG: -0.02 },
  { VNQ: 0.05, VTI: -0.03, AGG: -0.02 },
  { "ERNS.L": 0.04, "SLXX.L": 0.02, VTI: -0.035, VXUS: -0.025 },
  { "INXG.L": 0.035, "IGLT.L": 0.03, AGG: -0.025, VTI: -0.02 },
  { "IGLH.L": 0.045, "ERNS.L": 0.02, VTI: -0.035, VXUS: -0.02, AGG: -0.01 },
  { VTI: 0.03, GLD: 0.025, DBC: 0.02, AGG: -0.04, BIL: -0.02 },
  { QQQ: 0.055, VUG: 0.025, AGG: -0.04, BIL: -0.02 },
  { USMV: 0.055, VTI: -0.025, VXUS: -0.015, QQQ: -0.015 },
  { "SLXX.L": 0.04, LQD: 0.02, HYG: 0.015, AGG: -0.025, VTI: -0.02 },
  { "IGLT.L": 0.045, "INXG.L": 0.02, VTI: -0.04, VXUS: -0.02 },
  { DBC: 0.045, GLD: 0.025, AGG: -0.035, VTI: -0.02 }
];

const syntheticParams = {
  VTI: [0.0072, 0.041],
  VXUS: [0.0058, 0.047],
  QQQ: [0.0083, 0.056],
  IWM: [0.0066, 0.061],
  VTV: [0.0064, 0.039],
  VUG: [0.0078, 0.052],
  USMV: [0.0057, 0.031],
  AGG: [0.0028, 0.015],
  BIL: [0.0016, 0.002],
  "ERNS.L": [0.0028, 0.003],
  "IGLT.L": [0.0027, 0.021],
  "INXG.L": [0.003, 0.025],
  "SLXX.L": [0.0033, 0.014],
  "IGLH.L": [0.0029, 0.012],
  SHY: [0.0019, 0.006],
  TLT: [0.003, 0.047],
  LQD: [0.0037, 0.02],
  HYG: [0.0046, 0.027],
  GLD: [0.004, 0.05],
  VNQ: [0.0055, 0.055],
  TIP: [0.0029, 0.018],
  DBC: [0.0038, 0.055]
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

function clamp(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}

function cleanConstraintOverrides(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.entries(constraintRanges).reduce((output, [key, [lower, upper]]) => {
    const value = Number(input[key]);
    if (Number.isFinite(value)) output[key] = clamp(value, lower, upper);
    return output;
  }, {});
}

function cleanTurnCount(input) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? Math.min(10, Math.max(4, Math.round(parsed))) : 5;
}

function cleanUniverseSymbols(input) {
  if (!Array.isArray(input)) return defaultUniverseSymbols;
  const allowed = new Set(approvedOrder);
  const selected = [];
  const seen = new Set();
  for (const item of input) {
    const symbol = String(item || "").trim().toUpperCase();
    if (allowed.has(symbol) && !seen.has(symbol)) {
      seen.add(symbol);
      selected.push(symbol);
    }
  }
  if (selected.length < 5) return defaultUniverseSymbols;
  return approvedOrder.filter((symbol) => seen.has(symbol));
}

function normalize(weights, order) {
  const clipped = Object.fromEntries(order.map((symbol) => [symbol, Math.max(0, Number(weights[symbol] || 0))]));
  const total = Object.values(clipped).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Object.fromEntries(order.map((symbol) => [symbol, round(1 / order.length, 6)]));
  return Object.fromEntries(order.map((symbol) => [symbol, round(clipped[symbol] / total, 6)]));
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(seed) {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function stableId(name, weights, order) {
  const body = `${name}|${order.map((symbol) => `${symbol}:${Number(weights[symbol] || 0).toFixed(4)}`).join("|")}`;
  return `cand-${hashString(body).toString(16).slice(0, 8)}`;
}

function candidate(name, hypothesis, weights, source, order) {
  const normalized = normalize(weights, order);
  return {
    id: stableId(name, normalized, order),
    name,
    hypothesis,
    weights: normalized,
    source
  };
}

function applyTilts(base, tilts, order) {
  const output = Object.fromEntries(order.map((symbol) => [symbol, Number(base[symbol] || 0)]));
  for (const [symbol, delta] of Object.entries(tilts)) {
    if (symbol in output) output[symbol] += Number(delta);
  }
  return normalize(output, order);
}

function groupWeight(weights, symbols) {
  return symbols.reduce((sum, symbol) => sum + Number(weights[symbol] || 0), 0);
}

function distributeCapped(total, symbols, preferences, cap) {
  const allocations = Object.fromEntries(symbols.map((symbol) => [symbol, 0]));
  let remaining = Math.max(0, total);
  let active = new Set(symbols);
  while (active.size && remaining > 1e-9) {
    const activeSymbols = Array.from(active);
    let preferenceTotal = activeSymbols.reduce((sum, symbol) => sum + Math.max(0, preferences[symbol] || 0), 0);
    if (preferenceTotal <= 0) preferenceTotal = activeSymbols.length;
    const capped = [];
    for (const symbol of activeSymbols) {
      const preference = Math.max(0, preferences[symbol] || 0) || 1;
      const proposed = remaining * preference / preferenceTotal;
      if (allocations[symbol] + proposed > cap) capped.push(symbol);
    }
    if (!capped.length) {
      for (const symbol of activeSymbols) {
        const preference = Math.max(0, preferences[symbol] || 0) || 1;
        allocations[symbol] += remaining * preference / preferenceTotal;
      }
      remaining = 0;
      break;
    }
    for (const symbol of capped) {
      const room = Math.max(0, cap - allocations[symbol]);
      allocations[symbol] += room;
      remaining -= room;
      active.delete(symbol);
    }
  }
  return allocations;
}

function defensiveTargetWeights(defensiveTarget, maxSingleAsset, order) {
  const defensive = order.filter((symbol) => defensiveSymbols.includes(symbol));
  const nondefensive = order.filter((symbol) => !defensive.includes(symbol));
  const cap = Math.max(0.01, Math.min(1, maxSingleAsset));
  if (!defensive.length) return normalize(Object.fromEntries(order.map((symbol) => [symbol, 1])), order);
  let target = Math.max(0, Math.min(1, defensiveTarget));
  target = Math.min(target, cap * defensive.length);
  target = Math.max(target, 1 - cap * nondefensive.length);
  return normalize({
    ...distributeCapped(
      target,
      defensive,
      { "ERNS.L": 0.22, "IGLT.L": 0.2, "SLXX.L": 0.14, "IGLH.L": 0.12, "INXG.L": 0.1, AGG: 0.1, BIL: 0.04, TIP: 0.04, SHY: 0.02, TLT: 0.01, LQD: 0.01 },
      cap
    ),
    ...distributeCapped(1 - target, nondefensive, {
      VTI: 0.28,
      VXUS: 0.16,
      QQQ: 0.1,
      IWM: 0.06,
      VTV: 0.09,
      VUG: 0.08,
      USMV: 0.08,
      HYG: 0.04,
      GLD: 0.07,
      VNQ: 0.03,
      DBC: 0.01
    }, cap)
  }, order);
}

function capAndRedistribute(weights, cap, order) {
  const output = Object.fromEntries(order.map((symbol) => [symbol, Math.min(Number(weights[symbol] || 0), cap)]));
  let remaining = 1 - Object.values(output).reduce((sum, value) => sum + value, 0);
  while (remaining > 1e-8) {
    const eligible = order.filter((symbol) => output[symbol] < cap - 1e-8);
    if (!eligible.length) break;
    const preferenceTotal = eligible.reduce((sum, symbol) => sum + Number(weights[symbol] || 0), 0) || eligible.length;
    let progressed = false;
    for (const symbol of eligible) {
      const preference = preferenceTotal === eligible.length ? 1 : Number(weights[symbol] || 0);
      const add = Math.min(remaining * preference / preferenceTotal, cap - output[symbol]);
      if (add > 0) {
        output[symbol] += add;
        remaining -= add;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return normalize(output, order);
}

function constraintCandidates(base, overrides, order) {
  if (!overrides) return [];
  const maxSingleAsset = Number(overrides.max_single_asset || 1);
  const minDefensive = Number(overrides.min_defensive_weight || groupWeight(base, defensiveSymbols));
  const maxDrawdown = Number(overrides.max_drawdown || 1);
  const maxVolatility = Number(overrides.max_volatility || 1);
  const baseDefensive = groupWeight(base, defensiveSymbols);
  const output = [];
  if (Number.isFinite(minDefensive) && minDefensive > baseDefensive + 0.02) {
    output.push(candidate("Constraint Defensive Floor", "Raise the defensive sleeve to satisfy the user-selected defensive minimum.", defensiveTargetWeights(minDefensive, maxSingleAsset, order), "constraint", order));
  }
  if (Number.isFinite(maxDrawdown) && maxDrawdown < 0.19) {
    output.push(candidate("Lower Drawdown Constraint Fit", "Shift toward GBP cash, gilts, and hedged bonds when the drawdown ceiling is tightened.", defensiveTargetWeights(Math.max(minDefensive, 0.58), maxSingleAsset, order), "constraint", order));
  }
  if (Number.isFinite(maxVolatility) && maxVolatility < 0.1) {
    output.push(candidate("Lower Volatility Constraint Fit", "Reduce equity risk when the volatility ceiling is tightened.", defensiveTargetWeights(Math.max(minDefensive, 0.62), maxSingleAsset, order), "constraint", order));
  }
  if (Number.isFinite(maxSingleAsset) && maxSingleAsset < Math.max(...Object.values(base))) {
    output.push(candidate("Concentration Constraint Fit", "Redistribute positions so the largest instrument weight respects the single-asset cap.", capAndRedistribute(base, maxSingleAsset, order), "constraint", order));
  }
  return output;
}

function memoryCandidates(base, memory, overrides, order) {
  const lastSuccess = memory?.last_success_by_mandate?.[memory.mandate];
  if (!lastSuccess?.weights) return [];
  const prior = normalize(lastSuccess.weights, order);
  const priorName = String(lastSuccess.candidate || "Prior allocation").replace(/^Memory Recall:\s*/i, "").slice(0, 44);
  const maxSingleAsset = Number(overrides?.max_single_asset || 1);
  const minDefensive = Number(overrides?.min_defensive_weight || groupWeight(base, defensiveSymbols));
  const output = [candidate(`Memory Recall: ${priorName}`, "Replay the last passing allocation from persistent research memory.", prior, "memory", order)];
  if (Number.isFinite(minDefensive) && minDefensive > groupWeight(prior, defensiveSymbols) + 0.01) {
    output.push(candidate("Memory Constraint Repair", "Adapt the remembered allocation to the current defensive floor.", defensiveTargetWeights(minDefensive, maxSingleAsset, order), "memory", order));
  } else {
    output.push(candidate("Memory Return Recovery", "Test whether the remembered allocation can restore modest equity exposure without breaking guardrails.", applyTilts(prior, { VTI: 0.025, VXUS: 0.015, QQQ: 0.015, "ERNS.L": -0.02, "IGLT.L": -0.015, AGG: -0.01 }, order), "memory", order));
    output.push(candidate("Memory Risk Repair", "Test whether the remembered allocation improves drawdown by adding defensive ballast.", applyTilts(prior, { "ERNS.L": 0.02, "IGLT.L": 0.016, "IGLH.L": 0.012, "SLXX.L": 0.01, VTI: -0.025, VXUS: -0.015, QQQ: -0.014 }, order), "memory", order));
  }
  if (Number.isFinite(maxSingleAsset) && maxSingleAsset < Math.max(...Object.values(prior))) {
    output.push(candidate("Memory Concentration Repair", "Cap the remembered allocation to respect the current single-asset limit.", capAndRedistribute(prior, maxSingleAsset, order), "memory", order));
  }
  return output;
}

function ideaToCandidate(idea, mandate, index, order) {
  const base = normalize(constraints[mandate].baseline_weights, order);
  const name = String(idea?.name || `LLM Candidate ${index + 1}`).slice(0, 80);
  const hypothesis = String(idea?.hypothesis || "LLM-generated allocation idea.").slice(0, 260);
  if (idea?.weights && typeof idea.weights === "object" && !Array.isArray(idea.weights)) {
    return candidate(name, hypothesis, idea.weights, "llm", order);
  }
  const tilt = String(idea?.tilt || "").toLowerCase();
  const tilts = {};
  if (tilt.includes("quality") || tilt.includes("equity")) Object.assign(tilts, { VTI: 0.03, VXUS: 0.01, QQQ: 0.02, "ERNS.L": -0.02, "IGLT.L": -0.02, AGG: -0.01 });
  if (tilt.includes("defensive") || tilt.includes("drawdown")) Object.assign(tilts, { "ERNS.L": 0.025, "IGLT.L": 0.025, "IGLH.L": 0.015, USMV: 0.02, VTI: -0.04, VXUS: -0.02, QQQ: -0.01 });
  if (tilt.includes("inflation") || tilt.includes("real")) Object.assign(tilts, { GLD: 0.03, DBC: 0.025, "INXG.L": 0.03, TIP: 0.015, AGG: -0.02, VTI: -0.02 });
  if (tilt.includes("credit") || tilt.includes("income")) Object.assign(tilts, { "SLXX.L": 0.03, LQD: 0.02, HYG: 0.02, AGG: -0.02, VTI: -0.015, VXUS: -0.015 });
  if (tilt.includes("duration") || tilt.includes("treasury")) Object.assign(tilts, { "IGLT.L": 0.035, "INXG.L": 0.015, TLT: 0.015, AGG: -0.02, VTI: -0.015, VXUS: -0.01 });
  if (tilt.includes("hedge") || tilt.includes("currency") || tilt.includes("sterling") || tilt.includes("gbp")) Object.assign(tilts, { "IGLH.L": 0.035, "ERNS.L": 0.02, VTI: -0.025, VXUS: -0.015, AGG: -0.015 });
  return Object.keys(tilts).length ? candidate(name, hypothesis, applyTilts(base, tilts, order), "llm", order) : null;
}

function generateCandidates({ mandate, maxCandidates, llmIdeas, overrides, memory, order }) {
  const base = normalize(constraints[mandate].baseline_weights, order);
  const candidates = [candidate("Baseline Mandate", "Current mandate baseline used for comparison.", base, "baseline", order)];
  candidates.push(...memoryCandidates(base, memory, overrides, order));
  seedIdeas.forEach(([name, hypothesis], index) => {
    candidates.push(candidate(name, hypothesis, applyTilts(base, seedTilts[index % seedTilts.length], order), "seed", order));
  });
  for (const [index, idea] of (llmIdeas || []).entries()) {
    const generated = ideaToCandidate(idea, mandate, index, order);
    if (generated) candidates.push(generated);
  }
  candidates.push(...constraintCandidates(base, overrides, order));
  const random = rng(`strategy-grid-${mandate}-${order.join("-")}`);
  while (candidates.length < maxCandidates) {
    const tilt = Object.fromEntries(order.map((symbol) => [symbol, random() * 0.08 - 0.04]));
    candidates.push(candidate(`Allocation Variant ${String(candidates.length).padStart(2, "0")}`, "Explore a bounded allocation perturbation under the mandate guardrails.", applyTilts(base, tilt, order), "grid", order));
  }
  const seen = new Set();
  return candidates.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, maxCandidates);
}

function monthAdd(start, months) {
  const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 28));
  return date.toISOString().slice(0, 10);
}

function syntheticReturns(symbol, months) {
  const [mean, vol] = syntheticParams[symbol] || [0.004, 0.03];
  const random = rng(`treasury-lab-${symbol}`);
  const output = [];
  for (let index = 0; index < months; index += 1) {
    const cycle = Math.sin(index / 9) * 0.006;
    let shock = 0;
    if ([23, 24, 25, 84, 85, 86].includes(index)) shock = ["VTI", "VXUS", "QQQ", "IWM", "VTV", "VUG", "VNQ", "HYG"].includes(symbol) ? -0.055 : 0.008;
    if ([36, 37, 38].includes(index) && ["AGG", "TIP", "TLT", "LQD", "IGLT.L", "INXG.L", "SLXX.L", "IGLH.L"].includes(symbol)) shock -= 0.012;
    const noise = (random() + random() + random() + random() + random() + random() - 3) * vol * 0.82;
    output.push(mean + cycle + shock + noise);
  }
  return output;
}

function buildSyntheticPrices(order) {
  const start = new Date(Date.UTC(2015, 0, 31));
  const months = 132;
  const prices = {};
  for (const symbol of order) {
    let price = 100;
    prices[symbol] = {};
    syntheticReturns(symbol, months).forEach((ret, index) => {
      price *= 1 + ret;
      prices[symbol][monthAdd(start, index)] = round(price, 4);
    });
  }
  return {
    source: "synthetic-fallback",
    description: "Deterministic scenario data used when public instrument download is unavailable.",
    fx: fallbackFx("synthetic-fallback"),
    prices
  };
}

function fallbackFx(source = "demo-assumption") {
  return {
    pair: "GBP/USD",
    gbp_usd: DEFAULT_GBP_USD_RATE,
    source,
    as_of: null
  };
}

async function fetchYahooMonthly(symbol, startDate) {
  const period1 = Math.floor(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()) / 1000);
  const period2 = Math.floor((Date.now() + 2 * 24 * 60 * 60 * 1000) / 1000);
  const query = new URLSearchParams({
    period1: String(period1),
    period2: String(period2),
    interval: "1mo",
    events: "history",
    includeAdjustedClose: "true"
  });
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`, {
    headers: { accept: "application/json", "user-agent": "TreasuryLab/0.1" }
  });
  if (!response.ok) throw new Error(`Yahoo returned ${response.status} for ${symbol}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo returned no data for ${symbol}`);
  const timestamps = result.timestamp || [];
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const values = adjclose.length === timestamps.length ? adjclose : closes;
  const prices = {};
  timestamps.forEach((timestamp, index) => {
    const close = values[index];
    if (close == null) return;
    prices[new Date(Number(timestamp) * 1000).toISOString().slice(0, 10)] = round(Number(close), 4);
  });
  if (Object.keys(prices).length < 60) throw new Error(`Not enough price history for ${symbol}`);
  return prices;
}

async function fetchGbpUsdRate(startDate) {
  const prices = await fetchYahooMonthly("GBPUSD=X", startDate);
  const latestDate = Object.keys(prices).sort().at(-1);
  return {
    pair: "GBP/USD",
    gbp_usd: round(Number(prices[latestDate]), 4),
    source: "yahoo-chart-monthly",
    as_of: latestDate
  };
}

async function preparePrices(order, env, forceFallback) {
  const cacheKey = `prices:${order.join(",")}`;
  if (!forceFallback) {
    const cached = await getJson(env, cacheKey);
    if (cached?.prices && order.every((symbol) => cached.prices[symbol])) {
      return { ...cached, fx: cached.fx || fallbackFx("cached-without-fx") };
    }
  }
  if (forceFallback) return buildSyntheticPrices(order);
  try {
    const start = new Date(Date.UTC(2015, 0, 31));
    const entries = await Promise.all(order.map(async (symbol) => [symbol, await fetchYahooMonthly(symbol, start)]));
    let fx = fallbackFx("fx-fallback");
    try {
      fx = await fetchGbpUsdRate(start);
    } catch (error) {
      fx = fallbackFx(error instanceof Error ? `${error.name}-fallback` : "fx-fallback");
    }
    const payload = {
      source: "yahoo-chart-monthly",
      description: "Monthly adjusted instrument closes and GBP/USD FX downloaded from Yahoo Finance chart data.",
      downloaded_at: new Date().toISOString(),
      fx,
      prices: Object.fromEntries(entries)
    };
    await putJson(env, cacheKey, payload, 60 * 60 * 12);
    return payload;
  } catch (error) {
    const payload = buildSyntheticPrices(order);
    payload.download_error = error instanceof Error ? error.name : "MarketDataError";
    payload.description = "Deterministic scenario data used because public market data could not be downloaded.";
    return payload;
  }
}

function alignedReturns(pricePayload, order) {
  const monthlyPrices = {};
  for (const symbol of order) {
    monthlyPrices[symbol] = {};
    const series = pricePayload.prices[symbol] || {};
    for (const date of Object.keys(series).sort()) {
      monthlyPrices[symbol][date.slice(0, 7)] = Number(series[date]);
    }
  }
  const monthSets = order.map((symbol) => new Set(Object.keys(monthlyPrices[symbol] || {})));
  const commonMonths = Array.from(monthSets.reduce((intersection, set) => new Set([...intersection].filter((item) => set.has(item))))).sort();
  const months = commonMonths.slice(-132);
  if (months.length < 36) throw new Error("At least 36 months of aligned price data is required.");
  const returns = {};
  for (const symbol of order) {
    returns[symbol] = [];
    for (let index = 1; index < months.length; index += 1) {
      const previous = Number(monthlyPrices[symbol][months[index - 1]]);
      const current = Number(monthlyPrices[symbol][months[index]]);
      returns[symbol].push(current / previous - 1);
    }
  }
  return { dates: months.slice(1).map((month) => `${month}-01`), returns };
}

function portfolioReturns(weights, returns, order) {
  const length = returns[order[0]].length;
  const output = [];
  for (let index = 0; index < length; index += 1) {
    output.push(order.reduce((sum, symbol) => sum + Number(weights[symbol] || 0) * returns[symbol][index], 0));
  }
  return output;
}

function annualizedReturn(monthlyReturns) {
  return monthlyReturns.reduce((total, item) => total * (1 + item), 1) ** (12 / monthlyReturns.length) - 1;
}

function annualizedVolatility(monthlyReturns) {
  const mean = monthlyReturns.reduce((sum, item) => sum + item, 0) / monthlyReturns.length;
  const variance = monthlyReturns.reduce((sum, item) => sum + (item - mean) ** 2, 0) / Math.max(1, monthlyReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12);
}

function maxDrawdown(monthlyReturns) {
  let value = 1;
  let peak = 1;
  let worst = 0;
  for (const item of monthlyReturns) {
    value *= 1 + item;
    peak = Math.max(peak, value);
    worst = Math.min(worst, value / peak - 1);
  }
  return worst;
}

function metricPack(monthlyReturns) {
  const annualized_return = annualizedReturn(monthlyReturns);
  const volatility = annualizedVolatility(monthlyReturns);
  return {
    annualized_return,
    volatility,
    max_drawdown: maxDrawdown(monthlyReturns),
    sharpe: volatility === 0 ? 0 : (annualized_return - 0.02) / volatility
  };
}

function cumulativeIndex(monthlyReturns) {
  let index = 100;
  return monthlyReturns.map((item) => {
    index *= 1 + item;
    return round(index, 2);
  });
}

function turnover(weights, baseline, order) {
  return order.reduce((sum, symbol) => sum + Math.abs(Number(weights[symbol] || 0) - Number(baseline[symbol] || 0)), 0) / 2;
}

function weightedLiquidity(weights, order) {
  const scores = Object.fromEntries(approvedEtfs.map((asset) => [asset.symbol, asset.liquidity_score]));
  return order.reduce((sum, symbol) => sum + Number(weights[symbol] || 0) * Number(scores[symbol] || 0), 0);
}

function guardrails(item, metrics, rules, order) {
  const weights = item.weights;
  const maxWeight = Math.max(...order.map((symbol) => Number(weights[symbol] || 0)));
  const currentTurnover = turnover(weights, rules.baseline_weights, order);
  const currentDefensive = groupWeight(weights, defensiveSymbols);
  const liquidity = weightedLiquidity(weights, order);
  return [
    ["Max drawdown", `<= ${(rules.max_drawdown * 100).toFixed(0)}%`, `${(Math.abs(metrics.max_drawdown) * 100).toFixed(1)}%`, Math.abs(metrics.max_drawdown) <= rules.max_drawdown],
    ["Volatility", `<= ${(rules.max_volatility * 100).toFixed(0)}%`, `${(metrics.volatility * 100).toFixed(1)}%`, metrics.volatility <= rules.max_volatility],
    ["Max single asset", `<= ${(rules.max_single_asset * 100).toFixed(0)}%`, `${(maxWeight * 100).toFixed(1)}%`, maxWeight <= rules.max_single_asset],
    ["Turnover vs. baseline", `<= ${(rules.max_turnover * 100).toFixed(0)}%`, `${(currentTurnover * 100).toFixed(1)}%`, currentTurnover <= rules.max_turnover],
    ["Defensive allocation", `>= ${(rules.min_defensive_weight * 100).toFixed(0)}%`, `${(currentDefensive * 100).toFixed(1)}%`, currentDefensive >= rules.min_defensive_weight],
    ["Liquidity score", `>= ${rules.min_liquidity_score.toFixed(1)}`, liquidity.toFixed(1), liquidity >= rules.min_liquidity_score]
  ].map(([label, limit, current, pass]) => ({ label, limit, current, pass }));
}

function scoreCandidate(metrics, baselineMetrics, rows) {
  const failures = rows.filter((row) => !row.pass).length;
  return (
    0.35 * (metrics.annualized_return - baselineMetrics.annualized_return) * 100 +
    0.25 * (metrics.sharpe - baselineMetrics.sharpe) +
    0.2 * (Math.abs(baselineMetrics.max_drawdown) - Math.abs(metrics.max_drawdown)) * 100 -
    0.3 * Math.max(0, Math.abs(metrics.max_drawdown) - Math.abs(baselineMetrics.max_drawdown)) * 100 -
    2 * failures
  );
}

function allocationGroupWeights(weights, order) {
  const active = new Set(order);
  return Object.fromEntries(allocationGroups.map(([key, _label, symbols]) => [key, round(symbols.filter((symbol) => active.has(symbol)).reduce((sum, symbol) => sum + Number(weights[symbol] || 0), 0), 6)]));
}

function currencyExposureSummary(weights, order, pricePayload = {}) {
  const fx = pricePayload.fx && typeof pricePayload.fx === "object" ? pricePayload.fx : fallbackFx();
  const gbpUsdRate = Number.isFinite(Number(fx.gbp_usd)) ? Number(fx.gbp_usd) : DEFAULT_GBP_USD_RATE;
  let usdExposure = 0;
  let gbpNative = 0;
  let gbpHedged = 0;
  let unhedged = 0;
  for (const symbol of order) {
    const weight = Number(weights[symbol] || 0);
    const asset = assetBySymbol[symbol] || {};
    const currency = asset.currency || "USD";
    const hedge = asset.hedge || "USD unhedged";
    const residualUsdExposure = Number.isFinite(Number(asset.usd_exposure)) ? Number(asset.usd_exposure) : currency === "GBP" ? 0 : 1;
    usdExposure += weight * residualUsdExposure;
    if (hedge === "GBP native") gbpNative += weight;
    else if (hedge === "GBP hedged") gbpHedged += weight;
    else if (hedge.toLowerCase().includes("unhedged")) unhedged += weight;
  }
  usdExposure = Math.max(0, Math.min(1, usdExposure));
  const gbpNativeOrHedged = Math.max(0, Math.min(1, 1 - usdExposure));
  return {
    base_currency: "GBP",
    quote_currency: "USD",
    gbp_usd_rate: round(gbpUsdRate, 4),
    source: fx.source || "demo-assumption",
    as_of: fx.as_of || null,
    usd_exposure: round(usdExposure, 6),
    gbp_native_or_hedged: round(gbpNativeOrHedged, 6),
    gbp_native: round(gbpNative, 6),
    gbp_hedged: round(gbpHedged, 6),
    unhedged: round(unhedged, 6),
    warning: `This allocation has ${(usdExposure * 100).toFixed(1)}% USD exposure before hedging.`
  };
}

function summarizeAllocationChange(previous, current, order) {
  if (!previous) return "Starting allocation";
  const before = allocationGroupWeights(previous, order);
  const after = allocationGroupWeights(current, order);
  return allocationGroups.map(([key, label]) => {
    const delta = after[key] - before[key];
    const sign = delta >= 0 ? "+" : "-";
    return `${label} ${sign}${Math.abs(delta * 100).toFixed(1)} pp`;
  }).join(", ");
}

const sourceLabels = {
  baseline: "baseline",
  memory: "research memory",
  seed: "seed hypothesis",
  llm: "OpenAI hypothesis",
  constraint: "constraint response",
  grid: "improvement search"
};

function sourceLabel(source) {
  return sourceLabels[source] || source || "candidate";
}

function parseMetric(value) {
  const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function guardrailPressure(row) {
  const current = parseMetric(row.current);
  const limit = parseMetric(row.limit);
  if (current == null || limit == null || limit <= 0) return 0;
  return String(row.limit).includes(">=") ? limit / Math.max(current, 0.0001) : current / limit;
}

function rejectedCandidateSummary(items) {
  return items
    .filter((item) => !item.passes)
    .slice(0, 3)
    .map((item) => ({
      name: item.candidate.name,
      score: round(item.score, 2),
      failed_constraints: item.guardrails.filter((row) => !row.pass).map((row) => row.label).slice(0, 3)
    }));
}

function constraintDriver(best, group) {
  const failed = new Map();
  for (const item of group) {
    for (const row of item.guardrails.filter((entry) => !entry.pass)) {
      failed.set(row.label, (failed.get(row.label) || 0) + 1);
    }
  }
  if (failed.size) {
    const [label, count] = [...failed.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      label,
      status: "Rejected candidates",
      detail: `${count} new candidate${count === 1 ? "" : "s"} failed this rule.`
    };
  }
  const closest = [...best.guardrails].sort((a, b) => guardrailPressure(b) - guardrailPressure(a))[0];
  return closest
    ? {
        label: closest.label,
        status: closest.pass ? "Closest passing rule" : "Failed rule",
        current: closest.current,
        limit: closest.limit,
        detail: `${closest.current} versus ${closest.limit}`
      }
    : null;
}

function turnWhyChanged(previousTurn, best, source) {
  const bestName = best.candidate.name;
  const candidateSource = sourceLabel(best.candidate.source || source);
  if (!previousTurn) {
    return `Started from the mandate baseline so every later candidate has a controlled comparison point.`;
  }
  if (previousTurn.best_candidate === bestName) {
    return `No promotion: the new ${sourceLabel(source)} candidates did not beat ${bestName} after scoring and guardrails.`;
  }
  const delta = best.score - Number(previousTurn.score || 0);
  const scoreText = Number.isFinite(delta) ? ` Score improved by ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}.` : "";
  return `Promoted ${bestName} from ${candidateSource} because it ranked higher after return, drawdown, and guardrail checks.${scoreText}`;
}

function openAiReview(seen, group, best) {
  const llmSeen = seen.filter((item) => item.candidate.source === "llm");
  const llmInTurn = group.filter((item) => item.candidate.source === "llm");
  const rejected = llmSeen.filter((item) => !item.passes).length;
  const acceptedOpenAi = best.candidate.source === "llm";
  if (!llmSeen.length) {
    return {
      proposed: 0,
      accepted: best.candidate.name,
      accepted_source: sourceLabel(best.candidate.source),
      rejected: 0,
      note: "No OpenAI candidates had entered the search yet."
    };
  }
  return {
    proposed: llmSeen.length,
    proposed_this_turn: llmInTurn.length,
    accepted: best.candidate.name,
    accepted_source: sourceLabel(best.candidate.source),
    rejected,
    note: acceptedOpenAi
      ? `Evaluator accepted an OpenAI hypothesis as best so far.`
      : `Evaluator kept ${sourceLabel(best.candidate.source)} ahead of the OpenAI proposals.`
  };
}

function appendTurn(turns, seen, group, label, focus, source, previousWeights, order) {
  seen.push(...group);
  const eligible = seen.filter((item) => item.passes);
  const best = (eligible.length ? eligible : seen).reduce((winner, item) => item.score > winner.score ? item : winner);
  const weights = normalize(best.candidate.weights, order);
  const previousTurn = turns.at(-1);
  turns.push({
    turn: turns.length + 1,
    source,
    label,
    focus,
    new_candidates: group.length,
    candidates_tested: seen.length,
    rejected_count: seen.filter((item) => !item.passes).length,
    best_candidate: best.candidate.name,
    candidate_source: best.candidate.source || source,
    score: round(best.score, 4),
    expected_return: round(best.metrics.annualized_return, 6),
    volatility: round(best.metrics.volatility, 6),
    max_drawdown: round(best.metrics.max_drawdown, 6),
    sharpe: round(best.metrics.sharpe, 6),
    candidate_passes: Boolean(best.passes),
    weights,
    allocation_groups: allocationGroupWeights(weights, order),
    change_summary: summarizeAllocationChange(previousWeights, weights, order),
    why_changed: turnWhyChanged(previousTurn, best, source),
    constraint_driver: constraintDriver(best, group),
    rejected_candidates: rejectedCandidateSummary(group),
    openai_review: openAiReview(seen, group, best)
  });
  return weights;
}

function chunked(items, count) {
  if (!items.length) return [];
  const chunkCount = Math.max(1, Math.min(count, items.length));
  const baseSize = Math.floor(items.length / chunkCount);
  const remainder = items.length % chunkCount;
  const output = [];
  let start = 0;
  for (let index = 0; index < chunkCount; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    output.push(items.slice(start, start + size));
    start += size;
  }
  return output;
}

function buildTurns(evaluated, requestedTurns, order) {
  const definitions = [
    ["baseline", "Baseline", "Current mandate before any improvement."],
    ["memory", "Memory recall", "Candidates rebuilt from prior successful research runs."],
    ["seed", "Seed hypotheses", "Deterministic research priors tested against the rules."],
    ["llm", "OpenAI hypotheses", "LLM-generated allocation ideas added to the search."],
    ["constraint", "Constraint response", "Candidates built specifically for the selected constraints."]
  ];
  const turns = [];
  const seen = [];
  let previousWeights = null;
  for (const [source, label, focus] of definitions) {
    const group = evaluated.filter((item) => item.candidate.source === source);
    if (group.length) previousWeights = appendTurn(turns, seen, group, label, focus, source, previousWeights, order);
  }
  const grid = evaluated.filter((item) => item.candidate.source === "grid");
  if (grid.length && turns.length < requestedTurns) {
    const chunks = chunked(grid, requestedTurns - turns.length);
    chunks.forEach((group, index) => {
      const label = chunks.length === 1 ? "Improvement search" : `Improvement search ${index + 1}`;
      const focus = chunks.length === 1 ? "Bounded allocation variants swept by the evaluator." : `Search wave ${index + 1} of ${chunks.length} across bounded allocation variants.`;
      previousWeights = appendTurn(turns, seen, group, label, focus, "grid", previousWeights, order);
    });
  }
  return turns;
}

async function generateHypotheses(mandate, count, memoryContext, order, env) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return [];
  const sampleWeights = Object.fromEntries(order.map((symbol) => [symbol, round(1 / order.length, 4)]));
  const prompt = `You are generating research-only portfolio strategy hypotheses for an offline evaluator.
Return only JSON, with no markdown. Use this shape:
[{"name":"short candidate name","hypothesis":"one sentence explaining the research idea","tilt":"quality|defensive|inflation|real assets|global diversification|credit|duration|currency hedge|sterling","weights":${JSON.stringify(sampleWeights)}}]

Rules:
- Generate ${count} candidates for the ${mandate} mandate.
- Weights must sum to 1.0.
- No leverage, no options, no individual securities, no live trading.
- Use only these approved instrument symbols: ${order.join(", ")}.
- Do not claim guaranteed return.

Research memory from prior runs:
${memoryContext || "No prior research memory is available yet."}`;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5.4-mini",
        input: prompt,
        max_output_tokens: 1600
      })
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const text = payload.output_text || (payload.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").join("\n");
    const parsed = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
  } catch {
    return [];
  }
}

function memoryPrompt(memory) {
  const runs = Array.isArray(memory.runs) ? memory.runs.length : 0;
  const last = memory.last_success_by_mandate?.[memory.mandate];
  const lines = [`Prior runs for this mandate: ${runs}.`];
  if (last?.candidate) lines.push(`Last successful candidate: ${last.candidate}.`);
  if (last?.weights) lines.push(`Last successful weights: ${JSON.stringify(last.weights)}`);
  return lines.join("\n");
}

async function loadMemory(env, mandate) {
  const payload = await getJson(env, "research-memory") || { runs: [], lessons: [], last_success_by_mandate: {} };
  payload.mandate = mandate;
  return payload;
}

async function rememberResult(env, result, mandate) {
  const memory = await loadMemory(env, mandate);
  const candidatePayload = {
    session_id: result.session_id,
    mandate,
    candidate: result.candidate.name,
    score: result.candidate.score,
    weights: result.candidate.weights,
    candidate_passes: result.candidate_passes,
    updated_at: result.updated_at
  };
  memory.runs = [candidatePayload, ...(Array.isArray(memory.runs) ? memory.runs : [])].slice(0, 20);
  if (result.candidate_passes) {
    memory.last_success_by_mandate = { ...(memory.last_success_by_mandate || {}), [mandate]: candidatePayload };
  }
  memory.lessons = [
    `${result.candidate.name} tested best for ${result.mandate} with ${(result.candidate.expected_return * 100).toFixed(1)}% expected return and ${(Math.abs(result.candidate.max_drawdown) * 100).toFixed(1)}% drawdown.`,
    ...(Array.isArray(memory.lessons) ? memory.lessons : [])
  ].slice(0, 8);
  await putJson(env, "research-memory", memory, MAX_JOB_AGE_SECONDS * 20);
  return memory;
}

function memoryDisclosure(memory) {
  const runs = Array.isArray(memory.runs) ? memory.runs : [];
  const last = memory.last_success_by_mandate?.[memory.mandate];
  return {
    used: Boolean(runs.length || last),
    prior_runs: runs.length,
    lessons: (Array.isArray(memory.lessons) ? memory.lessons : []).slice(0, 4),
    last_success_candidate: last?.candidate || null,
    last_success_session_id: last?.session_id || null
  };
}

async function evaluateResearch({ mandate, experiments, turns, useLlm, fallbackData, overrides, order }, env) {
  const rules = {
    ...constraints[mandate],
    baseline_weights: normalize(constraints[mandate].baseline_weights, order),
    ...overrides
  };
  const memory = await loadMemory(env, mandate);
  const llmIdeas = useLlm ? await generateHypotheses(mandate, 8, memoryPrompt(memory), order, env) : [];
  const candidates = generateCandidates({ mandate, maxCandidates: experiments, llmIdeas, overrides, memory, order });
  const pricePayload = await preparePrices(order, env, fallbackData);
  const { dates, returns } = alignedReturns(pricePayload, order);
  const baselineReturns = portfolioReturns(rules.baseline_weights, returns, order);
  const baselineMetrics = metricPack(baselineReturns);
  const evaluated = candidates.map((item) => {
    const candidateReturns = portfolioReturns(item.weights, returns, order);
    const metrics = metricPack(candidateReturns);
    const rows = guardrails(item, metrics, rules, order);
    return {
      candidate: item,
      metrics,
      returns: candidateReturns,
      guardrails: rows,
      passes: rows.every((row) => row.pass),
      score: scoreCandidate(metrics, baselineMetrics, rows)
    };
  });
  const eligible = evaluated.filter((item) => item.passes);
  const best = (eligible.length ? eligible : evaluated).reduce((winner, item) => item.score > winner.score ? item : winner);
  const selfImprovementTurns = buildTurns(evaluated, turns, order);
  const candidateIndex = cumulativeIndex(best.returns);
  const benchmarkIndex = cumulativeIndex(baselineReturns);
  const stride = Math.max(1, Math.floor(dates.length / 16));
  const chart = [];
  for (let index = 0; index < dates.length; index += stride) {
    chart.push({ label: dates[index].slice(0, 4), candidate: candidateIndex[index], benchmark: benchmarkIndex[index] });
  }
  if (chart.at(-1)?.label !== dates.at(-1)?.slice(0, 4)) {
    chart.push({ label: dates.at(-1).slice(0, 4), candidate: candidateIndex.at(-1), benchmark: benchmarkIndex.at(-1) });
  }
  const rejectedCount = evaluated.filter((item) => !item.passes).length;
  const isMarketData = pricePayload.source !== "synthetic-fallback";
  const failedRules = best.guardrails.filter((row) => !row.pass).map((row) => row.label).join(", ");
  const bestWeights = normalize(best.candidate.weights, order);
  const currencyExposure = currencyExposureSummary(bestWeights, order, pricePayload);
  const result = {
    schema_version: 1,
    session_id: `research-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`,
    updated_at: new Date().toISOString(),
    source: pricePayload.source,
    data_summary: {
      source: pricePayload.source,
      label: isMarketData ? "Public instrument closes + GBP/USD FX" : "Demonstration scenario data",
      description: pricePayload.description || "",
      range_start: dates[0],
      range_end: dates.at(-1),
      observations: dates.length,
      assets: order.length,
      is_market_data: isMarketData
    },
    universe_symbols: order,
    currency_exposure: currencyExposure,
    mandate: rules.label,
    completed_experiments: evaluated.length,
    total_experiments: evaluated.length,
    rejected_count: rejectedCount,
    requested_turns: turns,
    candidate_passes: Boolean(best.passes),
    constraints_applied: Object.fromEntries(Object.keys(constraintRanges).map((key) => [key, rules[key]])),
    active_step: 3,
    candidate: {
      id: best.candidate.id,
      name: best.candidate.name,
      hypothesis: best.candidate.hypothesis,
      expected_return: best.metrics.annualized_return,
      volatility: best.metrics.volatility,
      max_drawdown: best.metrics.max_drawdown,
      sharpe: best.metrics.sharpe,
      score: best.score,
      weights: bestWeights
    },
    baseline: baselineMetrics,
    chart,
    turns: selfImprovementTurns,
    risk: best.guardrails.map((row) => ({ label: row.label, limit: row.limit, current: row.current, status: row.pass ? "Pass" : "Fail" })),
    audit_trail: [
      `Generated ${evaluated.length} candidate strategies for the ${rules.label} mandate across ${order.length} selected instruments.`,
      `Recorded ${selfImprovementTurns.length} self-improvement turns and kept the best passing allocation after each turn.`,
      `Rejected ${rejectedCount} candidates for guardrail failures.`,
      currencyExposure.warning,
      `Promoted ${best.candidate.name} after locked evaluator scoring.`,
      "Queued recommendation for human portfolio-manager review."
    ],
    why: [
      "Best risk-adjusted score among candidates passing all hard guardrails.",
      "Maintains diversification across equity, GBP cash, bond, credit, and alternative exposures.",
      currencyExposure.warning,
      "Improves expected return while preserving mandate drawdown controls.",
      "All recommendations remain research-only until human approval."
    ],
    memo: best.passes
      ? `${best.candidate.name} is the current top-ranked research candidate. It passed the locked drawdown, volatility, concentration, turnover, defensive-allocation, and liquidity checks. This is a research recommendation for review, not a trading instruction.`
      : `No tested candidate passed every guardrail. ${best.candidate.name} is the highest-ranked exception for human review, with unresolved checks: ${failedRules}. This is not a trading instruction.`,
    llm_enabled: Boolean(useLlm),
    llm_ideas_used: llmIdeas.length,
    memory: memoryDisclosure(memory)
  };
  const updatedMemory = await rememberResult(env, result, mandate);
  result.memory.stored_runs = updatedMemory.runs?.length || 0;
  result.memory.stored_lessons = updatedMemory.lessons?.length || 0;
  result.memory.lessons = (updatedMemory.lessons || []).slice(0, 4);
  return result;
}

function resultAtTurn(result, turnIndex) {
  const turns = Array.isArray(result.turns) ? result.turns.slice(0, turnIndex) : [];
  const activeTurn = turns.at(-1);
  if (!activeTurn) return result;
  const order = Array.isArray(result.universe_symbols) ? result.universe_symbols : Object.keys(activeTurn.weights || {});
  const fx = result.currency_exposure
    ? {
        gbp_usd: result.currency_exposure.gbp_usd_rate,
        source: result.currency_exposure.source,
        as_of: result.currency_exposure.as_of
      }
    : fallbackFx();
  return {
    ...result,
    turns,
    completed_experiments: activeTurn.candidates_tested,
    rejected_count: activeTurn.rejected_count,
    candidate_passes: activeTurn.candidate_passes,
    candidate: {
      ...result.candidate,
      id: `turn-${activeTurn.turn}`,
      name: activeTurn.best_candidate,
      hypothesis: activeTurn.focus,
      expected_return: activeTurn.expected_return,
      volatility: activeTurn.volatility,
      max_drawdown: activeTurn.max_drawdown,
      sharpe: activeTurn.sharpe,
      score: activeTurn.score,
      weights: activeTurn.weights
    },
    currency_exposure: currencyExposureSummary(activeTurn.weights, order, { fx })
  };
}

function phaseStep(phase) {
  return { queued: 0, prepare: 0, memory: 1, hypotheses: 1, candidates: 1, evaluate: 2, guardrails: 3, turns: 4, complete: 4, error: 0 }[phase] || 0;
}

function publicJobAtTime(job, now = Date.now()) {
  const turns = job.result?.turns || [];
  const revealIndex = Math.min(turns.length, Math.max(1, Math.floor((now - job.revealStartedAt) / TURN_DISPLAY_MS) + 1));
  const complete = revealIndex >= turns.length && now - job.revealStartedAt > turns.length * TURN_DISPLAY_MS;
  const activeTurn = turns[Math.max(0, revealIndex - 1)];
  const phase = complete ? "complete" : "turns";
  return {
    id: job.id,
    status: complete ? "complete" : "running",
    phase,
    step: phaseStep(phase),
    message: complete
      ? "Research complete. Allocation ready for review."
      : `Turn ${activeTurn?.turn || 1} of ${turns.length}: ${activeTurn?.label || "Research"}. ${activeTurn?.best_candidate || job.result.candidate.name} is best so far.`,
    startedAt: job.startedAt,
    completedAt: complete ? job.completedAt : null,
    events: job.events || [],
    result: complete ? job.result : resultAtTurn(job.result, revealIndex),
    error: null
  };
}

async function createResearchJob(options, env) {
  const id = crypto.randomUUID();
  const mandate = ["conservative", "balanced", "growth"].includes(options?.mandate) ? options.mandate : "balanced";
  const turns = cleanTurnCount(options?.turns);
  const experiments = Number.isFinite(Number(options?.experiments)) ? Math.min(72, Math.max(8, Number(options.experiments))) : Math.min(72, Math.max(36, 18 + turns * 6));
  const overrides = cleanConstraintOverrides(options?.constraints);
  const order = cleanUniverseSymbols(options?.universeSymbols);
  const result = await evaluateResearch({
    mandate,
    experiments,
    turns,
    useLlm: options?.useLlm !== false,
    fallbackData: options?.fallbackData === true,
    overrides,
    order
  }, env);
  const job = {
    id,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    revealStartedAt: Date.now(),
    events: [{ at: new Date().toISOString(), phase: "turns", message: "Research turns ready to reveal.", status: "running" }],
    result
  };
  await putJson(env, `job:${id}`, job, MAX_JOB_AGE_SECONDS);
  await putJson(env, "latest-result", result, MAX_JOB_AGE_SECONDS);
  return publicJobAtTime(job);
}

async function getResearchJob(id, env) {
  const job = await getJson(env, `job:${id}`);
  return job ? publicJobAtTime(job) : null;
}

async function getLatestResult(env) {
  return getJson(env, "latest-result");
}

async function resetResearchState(env) {
  await Promise.all([deleteJson(env, "latest-result"), deleteJson(env, "research-memory")]);
  return {
    reset_at: new Date().toISOString(),
    cleared: ["latest-result", "research-memory"]
  };
}

async function getJson(env, key) {
  if (env.TREASURY_KV?.get) {
    const value = await env.TREASURY_KV.get(key, "json");
    if (value) return value;
  }
  const memory = globalThis.__TREASURY_MEMORY || {};
  return memory[key] || null;
}

async function putJson(env, key, value, expirationTtl) {
  if (env.TREASURY_KV?.put) {
    await env.TREASURY_KV.put(key, JSON.stringify(value), { expirationTtl });
    return;
  }
  globalThis.__TREASURY_MEMORY = globalThis.__TREASURY_MEMORY || {};
  globalThis.__TREASURY_MEMORY[key] = value;
}

async function deleteJson(env, key) {
  if (env.TREASURY_KV?.delete) {
    await env.TREASURY_KV.delete(key);
    return;
  }
  globalThis.__TREASURY_MEMORY = globalThis.__TREASURY_MEMORY || {};
  delete globalThis.__TREASURY_MEMORY[key];
}

export { createResearchJob, getLatestResult, getResearchJob, jsonResponse, resetResearchState };
