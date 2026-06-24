import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  FlaskConical,
  Layers3,
  Lock,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRoundCheck
} from "lucide-react";
import { Mandate } from "./data/researchData";

type ResearchRisk = {
  label: string;
  limit: string;
  current: string;
  status: string;
};

type ResearchTurn = {
  turn: number;
  source: string;
  label: string;
  focus: string;
  new_candidates: number;
  candidates_tested: number;
  rejected_count: number;
  best_candidate: string;
  candidate_source: string;
  score: number;
  expected_return: number;
  volatility: number;
  max_drawdown: number;
  sharpe: number;
  candidate_passes: boolean;
  weights: Record<string, number>;
  allocation_groups?: Record<string, number>;
  change_summary: string;
};

type ResearchMemory = {
  used: boolean;
  prior_runs: number;
  lessons: string[];
  last_success_candidate?: string | null;
  last_success_session_id?: string | null;
  stored_runs?: number;
  stored_lessons?: number;
};

type ConstraintKey =
  | "max_drawdown"
  | "max_volatility"
  | "max_single_asset"
  | "min_defensive_weight"
  | "max_turnover"
  | "min_liquidity_score";

type ConstraintState = Record<ConstraintKey, number>;

type ResearchResult = {
  session_id: string;
  updated_at: string;
  source: string;
  data_summary?: {
    source: string;
    label: string;
    description: string;
    range_start: string;
    range_end: string;
    observations: number;
    assets: number;
    is_market_data: boolean;
  };
  mandate: Mandate;
  completed_experiments: number;
  total_experiments: number;
  rejected_count: number;
  candidate_passes?: boolean;
  constraints_applied?: Partial<ConstraintState>;
  llm_enabled?: boolean;
  llm_ideas_used?: number;
  requested_turns?: number;
  universe_symbols?: string[];
  memory?: ResearchMemory;
  turns?: ResearchTurn[];
  candidate: {
    id: string;
    name: string;
    hypothesis: string;
    expected_return: number;
    volatility: number;
    max_drawdown: number;
    sharpe: number;
    score: number;
    weights?: Record<string, number>;
  };
  risk: ResearchRisk[];
  why: string[];
  memo: string;
};

type ResearchJobStatus = {
  id: string;
  status: "running" | "complete" | "error";
  phase: string;
  step: number;
  message: string;
  startedAt: string;
  completedAt: string | null;
  result?: ResearchResult | null;
  error?: string | null;
};

type FlowStep = {
  title: string;
  description: string;
};

type EtfOption = {
  symbol: string;
  label: string;
  category: string;
};

const flowSteps: FlowStep[] = [
  { title: "Capital + rules", description: "Set money and constraints." },
  { title: "Hypotheses", description: "Generate candidate ideas." },
  { title: "Backtest", description: "Simulate portfolios." },
  { title: "Guardrails", description: "Reject failures." },
  { title: "Allocation", description: "Review the best fit." }
];

const approvedEtfs: EtfOption[] = [
  { symbol: "VTI", label: "US total equity", category: "Core equity" },
  { symbol: "VXUS", label: "Global ex-US equity", category: "Core equity" },
  { symbol: "QQQ", label: "Nasdaq 100", category: "Growth equity" },
  { symbol: "IWM", label: "US small cap", category: "Growth equity" },
  { symbol: "VTV", label: "US value", category: "Factor equity" },
  { symbol: "VUG", label: "US growth", category: "Factor equity" },
  { symbol: "USMV", label: "Minimum volatility", category: "Defensive equity" },
  { symbol: "AGG", label: "Core bonds", category: "Defensive fixed income" },
  { symbol: "BIL", label: "T-bills", category: "Defensive fixed income" },
  { symbol: "TIP", label: "Inflation-linked bonds", category: "Defensive fixed income" },
  { symbol: "SHY", label: "Short Treasuries", category: "Defensive fixed income" },
  { symbol: "TLT", label: "Long Treasuries", category: "Duration hedge" },
  { symbol: "LQD", label: "Investment grade credit", category: "Credit" },
  { symbol: "HYG", label: "High yield credit", category: "Credit" },
  { symbol: "GLD", label: "Gold", category: "Alternatives" },
  { symbol: "VNQ", label: "US real estate", category: "Real assets" },
  { symbol: "DBC", label: "Broad commodities", category: "Real assets" }
];

const assetOrder = approvedEtfs.map((asset) => asset.symbol);
const defaultUniverseSymbols = ["VTI", "VXUS", "AGG", "BIL", "GLD", "VNQ", "TIP"];
const minUniverseSymbols = 5;

const assetLabels: Record<string, string> = {
  VTI: "US equity",
  VXUS: "International equity",
  QQQ: "Nasdaq 100",
  IWM: "Small cap",
  VTV: "Value equity",
  VUG: "Growth equity",
  USMV: "Low-vol equity",
  AGG: "Bonds",
  BIL: "T-bills",
  SHY: "Short Treasuries",
  TLT: "Long Treasuries",
  LQD: "IG credit",
  HYG: "High yield",
  GLD: "Gold",
  VNQ: "Real estate",
  TIP: "TIPS",
  DBC: "Commodities"
};

const assetColors: Record<string, string> = {
  VTI: "#0f766e",
  VXUS: "#2563eb",
  QQQ: "#7c3aed",
  IWM: "#dc2626",
  VTV: "#4f46e5",
  VUG: "#0891b2",
  USMV: "#16a34a",
  AGG: "#64748b",
  BIL: "#14b8a6",
  SHY: "#94a3b8",
  TLT: "#475569",
  LQD: "#a855f7",
  HYG: "#ea580c",
  GLD: "#b7791f",
  VNQ: "#be123c",
  TIP: "#0284c7",
  DBC: "#ca8a04"
};

const minResearchTurns = 4;
const maxResearchTurns = 10;

const defaultConstraints: ConstraintState = {
  max_drawdown: 0.25,
  max_volatility: 0.13,
  max_single_asset: 0.45,
  min_defensive_weight: 0.25,
  max_turnover: 0.45,
  min_liquidity_score: 7.0
};

const visibleConstraintControls: Array<{
  key: ConstraintKey;
  label: string;
  helper: string;
  min: number;
  max: number;
  step: number;
}> = [
  {
    key: "max_drawdown",
    label: "Max drawdown",
    helper: "Worst allowed peak-to-trough loss",
    min: 0.05,
    max: 0.35,
    step: 0.01
  },
  {
    key: "max_volatility",
    label: "Max volatility",
    helper: "Annualized risk ceiling",
    min: 0.04,
    max: 0.25,
    step: 0.01
  },
  {
    key: "min_defensive_weight",
    label: "Defensive minimum",
    helper: "Bonds, T-bills, and TIPS floor",
    min: 0,
    max: 0.75,
    step: 0.01
  },
  {
    key: "max_single_asset",
    label: "Single ETF cap",
    helper: "Concentration limit",
    min: 0.2,
    max: 0.7,
    step: 0.01
  }
];

const defaultWeights: Record<string, number> = {
  VTI: 0.333333,
  VXUS: 0.176471,
  AGG: 0.254902,
  BIL: 0.068627,
  GLD: 0.107843,
  VNQ: 0.009804,
  TIP: 0.04902
};

const defaultResult: ResearchResult = {
  session_id: "research-demo",
  updated_at: "2026-06-23T21:00:00Z",
  source: "synthetic-fallback",
  data_summary: {
    source: "synthetic-fallback",
    label: "Demonstration scenario data",
    description: "Deterministic scenario data used when public ETF download is unavailable.",
    range_start: "2015-02-28",
    range_end: "2025-12-28",
    observations: 131,
    assets: 7,
    is_market_data: false
  },
  mandate: "Balanced",
  completed_experiments: 36,
  total_experiments: 36,
  rejected_count: 0,
  candidate_passes: true,
  constraints_applied: defaultConstraints,
  llm_enabled: true,
  llm_ideas_used: 8,
  universe_symbols: defaultUniverseSymbols,
  memory: {
    used: false,
    prior_runs: 0,
    lessons: []
  },
  candidate: {
    id: "candidate-69",
    name: "Inflation Shock Absorber",
    hypothesis: "Blend growth exposure with defensive assets and inflation-sensitive diversifiers.",
    expected_return: 0.037,
    volatility: 0.062,
    max_drawdown: -0.107,
    sharpe: 0.28,
    score: 0.72,
    weights: defaultWeights
  },
  risk: [
    { label: "Max drawdown", limit: "<= 25%", current: "10.7%", status: "Pass" },
    { label: "Volatility", limit: "<= 13%", current: "6.2%", status: "Pass" },
    { label: "Defensive allocation", limit: ">= 25%", current: "37.3%", status: "Pass" },
    { label: "Liquidity score", limit: ">= 7.0", current: "9.2", status: "Pass" }
  ],
  why: [
    "Best risk-adjusted score among candidates passing all hard guardrails.",
    "Maintains diversification across equity, bond, cash, and alternative exposures."
  ],
  memo:
    "Inflation Shock Absorber is the current top-ranked research candidate. It passed the locked guardrail checks and is ready for human review, not execution."
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatShortCurrency(value: number) {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  return `$${Math.round(value / 1_000_000)}M`;
}

function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedPercent(value: number, digits = 1) {
  return `${value < 0 ? "-" : ""}${Math.abs(value * 100).toFixed(digits)}%`;
}

function shortSessionId(id: string) {
  return id.startsWith("research-") ? `#${id.replace("research-", "")}` : `#${id.slice(0, 8)}`;
}

function formatMonth(value?: string) {
  if (!value) {
    return "n/a";
  }
  return value.slice(0, 7);
}

function dataSummary(result: ResearchResult) {
  return result.data_summary ?? {
    source: result.source,
    label: result.source === "synthetic-fallback" ? "Demonstration scenario data" : "Public monthly ETF closes",
    description: "",
    range_start: "",
    range_end: "",
    observations: 0,
    assets: result.universe_symbols?.length || defaultUniverseSymbols.length,
    is_market_data: result.source !== "synthetic-fallback"
  };
}

function constraintsFromResult(result: ResearchResult) {
  if (!result.constraints_applied) {
    return null;
  }

  return Object.entries(defaultConstraints).reduce((output, [key, fallback]) => {
    const constraintKey = key as ConstraintKey;
    const value = Number(result.constraints_applied?.[constraintKey]);
    output[constraintKey] = Number.isFinite(value) ? value : fallback;
    return output;
  }, { ...defaultConstraints });
}

function turnCountFromResult(result: ResearchResult) {
  const value = Number(result.requested_turns || result.turns?.length || 5);
  if (!Number.isFinite(value)) {
    return 5;
  }
  return Math.min(maxResearchTurns, Math.max(minResearchTurns, Math.round(value)));
}

function experimentsForTurns(turns: number) {
  return Math.min(72, Math.max(36, 18 + turns * 6));
}

function cleanUniverseSymbols(symbols?: string[]) {
  if (!Array.isArray(symbols)) {
    return defaultUniverseSymbols;
  }
  const approved = new Set(assetOrder);
  const seen = new Set<string>();
  const selected = symbols.reduce<string[]>((output, item) => {
    const symbol = String(item || "").toUpperCase();
    if (approved.has(symbol) && !seen.has(symbol)) {
      seen.add(symbol);
      output.push(symbol);
    }
    return output;
  }, []);

  if (selected.length < minUniverseSymbols) {
    return defaultUniverseSymbols;
  }

  return assetOrder.filter((symbol) => seen.has(symbol));
}

function symbolsFromResult(result: ResearchResult, universeSymbols: string[]) {
  const weights = result.candidate.weights ?? defaultWeights;
  const withWeights = Object.entries(weights)
    .filter(([, weight]) => Number(weight) > 0.0001)
    .map(([symbol]) => symbol);
  return cleanUniverseSymbols([...universeSymbols, ...withWeights]);
}

function nextActionLabel(step: number, isRunning: boolean) {
  if (isRunning) return "Running research";
  if (step === 0) return "Run simulation";
  return "Run again";
}

function stepNarrative(step: number, result: ResearchResult, job: ResearchJobStatus | null, runError: string) {
  if (runError) return runError;
  if (job?.status === "running" && job.message) return job.message;
  if (step === 0) return "We start with capital and a mandate. The rules are fixed before the system tests anything.";
  if (step === 1) return `OpenAI proposes ${result.llm_ideas_used || 0} research hypotheses inside ${result.universe_symbols?.length || defaultUniverseSymbols.length} selected ETFs.`;
  if (step === 2) return `The evaluator simulates ${result.total_experiments} candidate portfolios and compares them to the mandate.`;
  if (step === 3) return `${result.rejected_count} candidates failed hard rules. Passing candidates move forward for ranking.`;
  const turnCount = result.turns?.length;
  const turnPhrase = turnCount ? `${turnCount} improvement turns` : "the research run";
  return result.candidate_passes === false
    ? `After ${turnPhrase}, no candidate passed every rule. ${result.candidate.name} is the best available exception for human review.`
    : `After ${turnPhrase}, ${result.candidate.name} is the best fit under these constraints.`;
}

function Header() {
  return (
    <header className="topBar">
      <div className="brand">
        <div className="brandMark">
          <Sparkles size={18} />
        </div>
        <div>
          <strong>TreasuryLab</strong>
          <span>Investment Research Lab</span>
        </div>
      </div>

      <div className="safetyRail" aria-label="Research safety state">
        <span>
          <FlaskConical size={14} />
          Research mode
        </span>
        <span>
          <Lock size={14} />
          No live trading
        </span>
        <span>
          <UserRoundCheck size={14} />
          Human approval
        </span>
      </div>
    </header>
  );
}

function Flow({ activeStep }: { activeStep: number }) {
  return (
    <nav className="flow" aria-label="Research flow">
      {flowSteps.map((item, index) => {
        const state = index < activeStep ? "done" : index === activeStep ? "active" : "";
        return (
          <div className={`flowItem ${state}`} key={item.title}>
            <div className="flowDot">{index < activeStep ? <CheckCircle2 size={18} /> : index + 1}</div>
            <div>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function CapitalAndConstraints({
  capital,
  capitalText,
  constraints,
  isRunning,
  onCapitalTextChange,
  onConstraintChange,
  onUniverseToggle,
  onResearchTurnCountChange,
  researchTurnCount,
  result,
  universeSymbols
}: {
  capital: number;
  capitalText: string;
  constraints: ConstraintState;
  isRunning: boolean;
  onCapitalTextChange: (value: string) => void;
  onConstraintChange: (key: ConstraintKey, value: number) => void;
  onUniverseToggle: (symbol: string) => void;
  onResearchTurnCountChange: (value: number) => void;
  researchTurnCount: number;
  result: ResearchResult;
  universeSymbols: string[];
}) {
  return (
    <section className="inputPanel">
      <div className="panelTitle">
        <CircleDollarSign size={18} />
        <span>Money and mandate</span>
      </div>

      <label className="capitalInput">
        <span>Capital to allocate</span>
        <input
          aria-label="Capital to allocate"
          inputMode="numeric"
          onChange={(event) => onCapitalTextChange(event.target.value)}
          value={capitalText}
        />
      </label>

      <div className="mandateLine">
        <span>Mandate</span>
        <strong>{result.mandate}</strong>
      </div>

      <div className="constraintBlock">
        <div className="panelTitle small">
          <SlidersHorizontal size={16} />
          <span>Editable constraints</span>
        </div>
        {visibleConstraintControls.map((control) => (
          <div className="constraintControl" key={control.key}>
            <div className="constraintHead">
              <span>
                <em>{control.label}</em>
                <small>{control.helper}</small>
              </span>
              <label className="constraintNumber">
                <input
                  aria-label={`${control.label} percent`}
                  disabled={isRunning}
                  max={Math.round(control.max * 100)}
                  min={Math.round(control.min * 100)}
                  onChange={(event) => onConstraintChange(control.key, Number(event.target.value) / 100)}
                  step={Math.round(control.step * 100)}
                  type="number"
                  value={Math.round(constraints[control.key] * 100)}
                />
                <b>%</b>
              </label>
            </div>
            <input
              aria-label={control.label}
              disabled={isRunning}
              max={control.max}
              min={control.min}
              onChange={(event) => onConstraintChange(control.key, Number(event.target.value))}
              onInput={(event) => onConstraintChange(control.key, Number(event.currentTarget.value))}
              step={control.step}
              type="range"
              value={constraints[control.key]}
            />
          </div>
        ))}
        <div className="constraintControl turnDepthControl">
          <div className="constraintHead">
            <span>
              <em>Research turns</em>
              <small>Visible improvement passes</small>
            </span>
            <label className="constraintNumber turnNumber">
              <input
                aria-label="Research turns"
                disabled={isRunning}
                max={maxResearchTurns}
                min={minResearchTurns}
                onChange={(event) => onResearchTurnCountChange(Number(event.target.value))}
                step={1}
                type="number"
                value={researchTurnCount}
              />
            </label>
          </div>
          <input
            aria-label="Research turns"
            disabled={isRunning}
            max={maxResearchTurns}
            min={minResearchTurns}
            onChange={(event) => onResearchTurnCountChange(Number(event.target.value))}
            onInput={(event) => onResearchTurnCountChange(Number(event.currentTarget.value))}
            step={1}
            type="range"
            value={researchTurnCount}
          />
        </div>
      </div>

      <EtfUniverseControl isRunning={isRunning} onToggle={onUniverseToggle} universeSymbols={universeSymbols} />

      <div className="universeLine compact">
        <span>Data source</span>
        <strong>Market first</strong>
      </div>
      <p className="quietCopy">The system can only search inside this mandate. It cannot trade or change the rules.</p>
      <p className="quietCopy">Each run requests public monthly ETF prices. If the download fails, the result is labelled as demo data.</p>
      <p className="capitalFootnote">Current pool: {formatCurrency(capital)}</p>
    </section>
  );
}

function EtfUniverseControl({
  isRunning,
  onToggle,
  universeSymbols
}: {
  isRunning: boolean;
  onToggle: (symbol: string) => void;
  universeSymbols: string[];
}) {
  const selectedSet = new Set(universeSymbols);

  return (
    <div className="etfBlock">
      <div className="panelTitle small">
        <Layers3 size={16} />
        <span>ETF universe</span>
      </div>
      <div className="etfSummary">
        <span>Approved shelf</span>
        <strong>
          {universeSymbols.length} of {approvedEtfs.length}
        </strong>
      </div>
      <div className="etfList" aria-label="Editable ETF universe">
        {approvedEtfs.map((asset) => {
          const selected = selectedSet.has(asset.symbol);
          const locked = selected && universeSymbols.length <= minUniverseSymbols;
          return (
            <label className={`etfChoice ${selected ? "selected" : ""}`} key={asset.symbol}>
              <input
                checked={selected}
                disabled={isRunning || locked}
                onChange={() => onToggle(asset.symbol)}
                type="checkbox"
              />
              <strong>{asset.symbol}</strong>
              <span>{asset.label}</span>
              <em>{asset.category}</em>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function TurnAllocationBar({ symbols, weights }: { symbols: string[]; weights: Record<string, number> }) {
  return (
    <div className="turnAllocationBar" aria-label="Turn allocation">
      {symbols.map((symbol) => {
        const weight = Number(weights[symbol] || 0);
        return (
          <span
            key={symbol}
            style={{ background: assetColors[symbol] || "#94a3b8", width: `${Math.max(weight * 100, 1)}%` }}
            title={`${assetLabels[symbol] || symbol}: ${formatPercent(weight)}`}
          />
        );
      })}
    </div>
  );
}

function SelfImprovementTurns({
  isRunning,
  result,
  step,
  targetTurnCount,
  universeSymbols
}: {
  isRunning: boolean;
  result: ResearchResult;
  step: number;
  targetTurnCount: number;
  universeSymbols: string[];
}) {
  const turns = result.turns ?? [];
  if (step < 4 || turns.length === 0) {
    return null;
  }
  const turnLabel = isRunning ? `${turns.length} of ${Math.max(targetTurnCount, turns.length)} turns` : `${turns.length} turns`;

  return (
    <div className="turnsPanel">
      <div className="turnsHeader">
        <span>Self-improvement turns</span>
        <strong>{turnLabel}</strong>
      </div>

      <div className="turnList">
        {turns.map((turn, index) => (
          <article className={`turnRow ${isRunning && index === turns.length - 1 ? "active" : ""}`} key={`${turn.turn}-${turn.label}`}>
            <div className="turnIndex">
              <span>Turn {turn.turn}</span>
              <strong>{turn.label}</strong>
              <em>
                {turn.new_candidates} new · {turn.candidates_tested} tested
              </em>
            </div>

            <div className="turnMain">
              <div className="turnCandidate">
                <span>Best so far</span>
                <strong>{turn.best_candidate}</strong>
              </div>
              <TurnAllocationBar symbols={symbolsFromResult(result, universeSymbols)} weights={turn.weights} />
              <p>{turn.change_summary}</p>
            </div>

            <div className="turnStats">
              <div>
                <span>Score</span>
                <strong>{turn.score.toFixed(2)}</strong>
              </div>
              <div>
                <span>Return</span>
                <strong>{formatPercent(turn.expected_return)}</strong>
              </div>
              <div>
                <span>Drawdown</span>
                <strong>{formatSignedPercent(turn.max_drawdown)}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function OpenAiStrip({ result }: { result: ResearchResult }) {
  const ideasUsed = result.llm_ideas_used ?? 0;
  const wasRequested = result.llm_enabled !== false;
  const openAiTurn = (result.turns || []).find((turn) => turn.source === "llm" || turn.label.toLowerCase().includes("openai"));
  const headline = !wasRequested ? "Not requested" : ideasUsed > 0 ? `${ideasUsed} generated` : "Requested, 0 returned";
  const detail = !wasRequested
    ? "This run used deterministic seed hypotheses only."
    : ideasUsed > 0 && openAiTurn
    ? `Visible in ${openAiTurn.label}; best so far was ${openAiTurn.best_candidate}.`
    : ideasUsed > 0
    ? "Generated ideas were evaluated, but they did not create a separate visible turn in this view."
    : "Check the OpenAI key/model in the runtime; deterministic hypotheses still ran.";

  return (
    <div className={`memoryStrip aiStrip ${ideasUsed > 0 ? "used" : ""}`}>
      <span>OpenAI</span>
      <strong>{headline}</strong>
      <em>{detail}</em>
    </div>
  );
}

function MemoryStrip({ memory }: { memory?: ResearchMemory }) {
  if (!memory) {
    return null;
  }

  const headline = memory.used
    ? `${memory.prior_runs} prior ${memory.prior_runs === 1 ? "run" : "runs"} recalled`
    : "No prior memory used";
  const detail = memory.used
    ? `Remembered ${memory.last_success_candidate || "prior allocations"} and ${memory.lessons.length} lesson${memory.lessons.length === 1 ? "" : "s"}.`
    : "This run will write lessons for the next session.";

  return (
    <div className={`memoryStrip ${memory.used ? "used" : ""}`}>
      <span>Research memory</span>
      <strong>{headline}</strong>
      <em>{detail}</em>
    </div>
  );
}

function GuardrailList({ risk }: { risk: ResearchRisk[] }) {
  return (
    <div className="guardrailList">
      {risk.map((row) => (
        <div className={row.status === "Pass" ? "pass" : "fail"} key={row.label}>
          <span>{row.label}</span>
          <strong>{row.current}</strong>
          <em>{row.limit}</em>
        </div>
      ))}
    </div>
  );
}

function SimulationPanel({
  isRunning,
  job,
  onRun,
  result,
  runError,
  step,
  targetTurnCount,
  universeSymbols
}: {
  isRunning: boolean;
  job: ResearchJobStatus | null;
  onRun: () => void;
  result: ResearchResult;
  runError: string;
  step: number;
  targetTurnCount: number;
  universeSymbols: string[];
}) {
  const progress = Math.round((step / 4) * 100);
  const headerTitle = runError
    ? "Run needs attention"
    : isRunning && step === 4
    ? "Research turns running"
    : isRunning
    ? "Research in progress"
    : step === 4
    ? "Allocation ready"
    : "Ready to test portfolios";
  const turnValue =
    step >= 4 && isRunning
      ? `${result.turns?.length || 0}/${Math.max(targetTurnCount, result.turns?.length || 0)}`
      : step >= 4
      ? result.turns?.length || 0
      : step >= 1
      ? "Running"
      : "—";
  const testedValue = step >= 4 ? result.completed_experiments : step >= 2 ? "Testing" : "—";
  const guardrailValue = step >= 4 ? (result.candidate_passes === false ? "Review" : "Passed") : step >= 3 ? "Checking" : "—";
  const outcomeValue = step >= 4 ? (result.candidate_passes === false ? "Exception" : "Review ready") : isRunning ? "Running" : "Pending";

  return (
    <section className="simulationPanel">
      <div className="simulationHeader">
        <div>
          <span>Simulation engine</span>
          <h2>{headerTitle}</h2>
        </div>
        <button className="primaryAction" disabled={isRunning} onClick={onRun} type="button">
          <Play size={16} />
          {nextActionLabel(step, isRunning)}
        </button>
      </div>

      <div className="progressTrack" aria-label={`${progress}% complete`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <p className={`stageNarrative ${runError ? "error" : ""}`}>{stepNarrative(step, result, job, runError)}</p>

      <div className="proofGrid">
        <div>
          <span>Improvement turns</span>
          <strong>{turnValue}</strong>
        </div>
        <div>
          <span>Portfolios tested</span>
          <strong>{testedValue}</strong>
        </div>
        <div>
          <span>Guardrails</span>
          <strong>{guardrailValue}</strong>
        </div>
        <div>
          <span>Outcome</span>
          <strong>{outcomeValue}</strong>
        </div>
      </div>

      <MemoryStrip memory={result.memory} />
      <OpenAiStrip result={result} />

      <div className="stageList">
        {flowSteps.slice(1).map((item, index) => {
          const stageIndex = index + 1;
          return (
            <div className={step > stageIndex ? "complete" : step === stageIndex ? "active" : ""} key={item.title}>
              <CheckCircle2 size={16} />
              <span>{item.title}</span>
            </div>
          );
        })}
      </div>

      <SelfImprovementTurns
        isRunning={isRunning}
        result={result}
        step={step}
        targetTurnCount={targetTurnCount}
        universeSymbols={universeSymbols}
      />
    </section>
  );
}

function AllocationPanel({
  capital,
  isRunning,
  result,
  step,
  universeSymbols
}: {
  capital: number;
  isRunning: boolean;
  result: ResearchResult;
  step: number;
  universeSymbols: string[];
}) {
  const displaySymbols = useMemo(() => symbolsFromResult(result, universeSymbols), [result, universeSymbols]);
  const allocation = useMemo(() => {
    const weights = result.candidate.weights ?? defaultWeights;
    return displaySymbols.map((symbol) => ({
      amount: capital * Number(weights[symbol] || 0),
      color: assetColors[symbol] || "#94a3b8",
      label: assetLabels[symbol] || symbol,
      symbol,
      weight: Number(weights[symbol] || 0)
    }));
  }, [capital, displaySymbols, result.candidate.weights]);

  const ready = step >= 4;

  return (
    <section className={`allocationPanel ${ready ? "ready" : "waiting"}`}>
      <div className="panelTitle">
        <ShieldCheck size={18} />
        <span>{ready ? (isRunning ? "Best so far" : "Recommended allocation") : "Allocation output"}</span>
      </div>

      {ready ? (
        <>
          <h2>{result.candidate.name}</h2>
          <p>
            {isRunning
              ? "Current best allocation from the latest completed turn. Final guardrails appear after the run completes."
              : result.candidate_passes === false
              ? "No tested portfolio passed every hard rule. This is the highest-ranked exception for human review."
              : "Best fit under the selected objective, constraints, and available data. Human review is still required."}
          </p>

          <div className="allocationBar" aria-label="Recommended allocation">
            {allocation.map((item) => (
              <span
                key={item.symbol}
                style={{ background: item.color, width: `${Math.max(item.weight * 100, 1)}%` }}
                title={`${item.label}: ${formatPercent(item.weight)}`}
              />
            ))}
          </div>

          <div className="allocationList">
            {allocation.map((item) => (
              <div key={item.symbol}>
                <i style={{ background: item.color }} />
                <span>{item.label}</span>
                <strong>{formatPercent(item.weight)}</strong>
                <em>{formatShortCurrency(item.amount)}</em>
              </div>
            ))}
          </div>

          <div className="metricsRow">
            <div>
              <span>Expected return</span>
              <strong>{formatPercent(result.candidate.expected_return)}</strong>
            </div>
            <div>
              <span>Volatility</span>
              <strong>{formatPercent(result.candidate.volatility)}</strong>
            </div>
            <div>
              <span>Max drawdown</span>
              <strong>{formatSignedPercent(result.candidate.max_drawdown)}</strong>
            </div>
          </div>

          {!isRunning && <GuardrailList risk={result.risk} />}
        </>
      ) : (
        <div className="emptyAllocation">
          <span />
          <h2>Run the simulation to reveal the portfolio.</h2>
          <p>The allocation remains hidden until hypotheses, backtests, and guardrails complete.</p>
        </div>
      )}
    </section>
  );
}

function ReviewPanel({ job, result, step }: { job: ResearchJobStatus | null; result: ResearchResult; step: number }) {
  const turnText = result.turns?.length ? ` across ${result.turns.length} improvement turns` : "";
  const memoryText = result.memory?.used ? ` Memory recalled ${result.memory.prior_runs} prior run${result.memory.prior_runs === 1 ? "" : "s"}.` : "";

  return (
    <section className="reviewPanel">
      <div>
        <span>Decision note</span>
        <p>{step >= 4 ? result.memo : "The investment committee memo appears after the allocation step."}</p>
      </div>
      <div>
        <span>Audit</span>
        <p>
          {job?.status === "running"
            ? `Run ${shortSessionId(job.id)} is active. ${job.message}`
            : step >= 3
            ? `${result.completed_experiments} candidates tested${turnText}. ${result.rejected_count} rejected by guardrails.${memoryText}${result.candidate_passes === false ? " No fully compliant candidate was found." : ""}`
            : "Audit trail is created as each stage completes."}
        </p>
      </div>
    </section>
  );
}

function DataProvenance({ result }: { result: ResearchResult }) {
  const summary = dataSummary(result);
  return (
    <div className={`dataBadge ${summary.is_market_data ? "market" : "demo"}`}>
      <span>{summary.is_market_data ? "Market data" : "Demo data"}</span>
      <strong>{summary.label}</strong>
      <em>
        {formatMonth(summary.range_start)} to {formatMonth(summary.range_end)} · {summary.assets} ETFs · {summary.observations} monthly observations
      </em>
    </div>
  );
}

export function App() {
  const [capitalText, setCapitalText] = useState("$100,000,000");
  const [constraints, setConstraints] = useState<ConstraintState>(defaultConstraints);
  const [isRunning, setIsRunning] = useState(false);
  const [job, setJob] = useState<ResearchJobStatus | null>(null);
  const [runError, setRunError] = useState("");
  const [researchTurnCount, setResearchTurnCount] = useState(5);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ResearchResult>(defaultResult);
  const [universeSymbols, setUniverseSymbols] = useState<string[]>(defaultUniverseSymbols);

  useEffect(() => {
    let mounted = true;
    fetch(`/research-results/latest.json?t=${Date.now()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: ResearchResult | null) => {
        if (!mounted || !payload?.candidate) {
          return;
        }
        setResult(payload);
        setStep(4);
        setResearchTurnCount(turnCountFromResult(payload));
        setUniverseSymbols(cleanUniverseSymbols(payload.universe_symbols));
        const appliedConstraints = constraintsFromResult(payload);
        if (appliedConstraints) {
          setConstraints(appliedConstraints);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const capital = useMemo(() => {
    const parsed = Number(capitalText.replace(/[^0-9]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 100_000_000;
  }, [capitalText]);

  const activeFlowStep = Math.min(step, flowSteps.length - 1);
  const updatedAt = new Date(result.updated_at);
  const activeJobId = job?.status === "running" ? job.id : null;
  const updatedLabel = activeJobId
    ? `Run ${shortSessionId(activeJobId)} · ${job?.message || "Running"}`
    : Number.isNaN(updatedAt.getTime())
    ? "Latest run loaded"
    : `Run ${shortSessionId(result.session_id)} · ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  useEffect(() => {
    if (!activeJobId) {
      return undefined;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/research/status/${activeJobId}`);
        const payload = (await response.json()) as ResearchJobStatus;
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || "Research status could not be loaded.");
        }

        setJob(payload);
        setStep(Math.min(Math.max(payload.step || 0, 0), 4));
        if (payload.result?.candidate) {
          setResult(payload.result);
        }

        if (payload.status === "complete") {
          if (payload.result?.candidate) {
            setResult(payload.result);
          }
          setIsRunning(false);
          setRunError("");
          setStep(4);
        }

        if (payload.status === "error") {
          setIsRunning(false);
          setRunError(payload.error || payload.message || "Research run failed.");
          setStep(0);
        }
      } catch (error) {
        if (!cancelled) {
          setIsRunning(false);
          setRunError(error instanceof Error ? error.message : "Research status could not be loaded.");
        }
      }
    };

    poll();
    const interval = window.setInterval(poll, 800);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeJobId]);

  const runSimulation = async () => {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    setJob(null);
    setRunError("");
    setResult((current) => ({ ...current, turns: [], universe_symbols: universeSymbols }));
    setStep(0);

    try {
      const response = await fetch("/api/research/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capital,
          constraints,
          experiments: experimentsForTurns(researchTurnCount),
          fallbackData: false,
          mandate: result.mandate.toLowerCase(),
          turns: researchTurnCount,
          universeSymbols,
          useLlm: true
        })
      });
      const payload = (await response.json()) as ResearchJobStatus;
      if (!response.ok) {
        throw new Error(payload.error || "Research run could not be started.");
      }
      setJob(payload);
      setStep(Math.min(Math.max(payload.step || 0, 0), 4));
    } catch (error) {
      setIsRunning(false);
      setRunError(error instanceof Error ? error.message : "Research run could not be started.");
      setStep(0);
    }
  };

  const updateCapitalText = (value: string) => {
    const digits = value.replace(/[^0-9]/g, "");
    if (!digits) {
      setCapitalText("");
      return;
    }
    setCapitalText(formatCurrency(Number(digits)));
  };

  const updateConstraint = (key: ConstraintKey, value: number) => {
    if (!Number.isFinite(value)) {
      return;
    }
    setConstraints((current) => ({ ...current, [key]: value }));
    setRunError("");
    if (!isRunning) {
      setStep(0);
    }
  };

  const updateResearchTurnCount = (value: number) => {
    if (!Number.isFinite(value)) {
      return;
    }
    const nextValue = Math.min(maxResearchTurns, Math.max(minResearchTurns, Math.round(value)));
    setResearchTurnCount(nextValue);
    setRunError("");
    if (!isRunning) {
      setStep(0);
    }
  };

  const toggleUniverseSymbol = (symbol: string) => {
    setUniverseSymbols((current) => {
      const selected = current.includes(symbol);
      if (selected && current.length <= minUniverseSymbols) {
        return current;
      }
      const next = selected ? current.filter((item) => item !== symbol) : [...current, symbol];
      return cleanUniverseSymbols(next);
    });
    setRunError("");
    if (!isRunning) {
      setStep(0);
    }
  };

  return (
    <div className="appShell">
      <Header />

      <main className="mainStage">
        <section className="heroLine">
          <div>
            <h1>Allocate {formatShortCurrency(capital)} under a {result.mandate.toLowerCase()} mandate.</h1>
            <p>Give the system money and rules. It searches, tests, rejects failures, and returns the best portfolio for human review.</p>
          </div>
          <DataProvenance result={result} />
        </section>

        <Flow activeStep={activeFlowStep} />

        <section className="workspace">
          <CapitalAndConstraints
            capital={capital}
            capitalText={capitalText}
            constraints={constraints}
            isRunning={isRunning}
            onCapitalTextChange={updateCapitalText}
            onConstraintChange={updateConstraint}
            onResearchTurnCountChange={updateResearchTurnCount}
            onUniverseToggle={toggleUniverseSymbol}
            researchTurnCount={researchTurnCount}
            result={result}
            universeSymbols={universeSymbols}
          />
          <SimulationPanel
            isRunning={isRunning}
            job={job}
            onRun={runSimulation}
            result={result}
            runError={runError}
            step={step}
            targetTurnCount={researchTurnCount}
            universeSymbols={universeSymbols}
          />
          <AllocationPanel
            capital={capital}
            isRunning={isRunning}
            result={result}
            step={step}
            universeSymbols={universeSymbols}
          />
        </section>

        <ReviewPanel job={job} result={result} step={step} />
      </main>

      <footer className="bottomBar">
        <span>{updatedLabel}</span>
        <span>No brokerage connection · Research only</span>
        <button disabled={isRunning} onClick={runSimulation} type="button">
          {nextActionLabel(step, isRunning)}
          <ArrowRight size={14} />
        </button>
      </footer>
    </div>
  );
}
