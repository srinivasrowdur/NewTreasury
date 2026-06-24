export type Mandate = "Conservative" | "Balanced" | "Growth";

export type ExperimentStatus = "running" | "queued" | "completed" | "discarded";

export type Experiment = {
  id: string;
  status: ExperimentStatus;
  name: string;
  tag?: string;
  hypothesis: string;
  window: string;
  progress: number;
  confidence: number | null;
  impactBps: number | null;
  riskScore: number;
  elapsed: string;
};

export type ScoreMetric = {
  label: string;
  value: string;
  baseline: string;
  tone: "positive" | "warning" | "neutral";
};

export type Guardrail = {
  label: string;
  limit: string;
  current: string;
  status: "pass" | "watch" | "fail";
};

export type Recommendation = {
  rank: number;
  candidate: string;
  tag: string;
  thesis: string;
  impactBps: number;
  confidence: number;
  riskScore: number;
  action: "Review" | "Hold" | "Reject";
};

export type AuditEvent = {
  time: string;
  event: string;
  detail: string;
  decision: "KEEP" | "DISCARD" | "REVIEW" | "-";
};

export const experiments: Experiment[] = [
  {
    id: "exp-101",
    status: "running",
    name: "EQ Quality Tilt v3",
    tag: "Best Candidate",
    hypothesis:
      "Quality tilt with profitability and balance sheet strength improves risk-adjusted returns.",
    window: "2015 - Present",
    progress: 72,
    confidence: 68,
    impactBps: 62,
    riskScore: 3.5,
    elapsed: "02:14:37"
  },
  {
    id: "exp-102",
    status: "running",
    name: "Rates Carry Rotation v2",
    hypothesis:
      "Dynamic duration and curve positioning can add carry without taking equity beta.",
    window: "2012 - Present",
    progress: 48,
    confidence: 54,
    impactBps: 38,
    riskScore: 3,
    elapsed: "01:37:12"
  },
  {
    id: "exp-103",
    status: "queued",
    name: "Credit Quality Ladder v1",
    hypothesis:
      "Barbell credit allocation may improve spread capture while lowering drawdowns.",
    window: "2014 - Present",
    progress: 0,
    confidence: null,
    impactBps: null,
    riskScore: 0,
    elapsed: "-"
  },
  {
    id: "exp-104",
    status: "completed",
    name: "Global Macro Overlay v1",
    hypothesis:
      "Trend-following overlay can improve crisis alpha uncorrelated to risk assets.",
    window: "2008 - Present",
    progress: 100,
    confidence: 41,
    impactBps: 12,
    riskScore: 4.5,
    elapsed: "Complete"
  }
];

export const scoreMetrics: ScoreMetric[] = [
  { label: "Annualized Return", value: "5.82%", baseline: "4.91%", tone: "positive" },
  { label: "Volatility", value: "7.45%", baseline: "8.32%", tone: "positive" },
  { label: "Sharpe Ratio", value: "0.78", baseline: "0.59", tone: "positive" },
  { label: "Max Drawdown", value: "-8.74%", baseline: "-11.32%", tone: "warning" },
  { label: "Information Ratio", value: "0.46", baseline: "0.18", tone: "warning" },
  { label: "Hit Rate", value: "61%", baseline: "53%", tone: "warning" }
];

export const guardrails: Guardrail[] = [
  { label: "Max Portfolio Volatility (Ann.)", limit: "<= 10.00%", current: "7.45%", status: "pass" },
  { label: "Max Drawdown", limit: "<= 15.00%", current: "8.74%", status: "pass" },
  { label: "Tracking Error vs. Benchmark", limit: "<= 4.00%", current: "2.31%", status: "pass" },
  { label: "Sector Active Risk", limit: "<= 3.00%", current: "2.12%", status: "pass" },
  { label: "Leverage (Gross)", limit: "<= 120%", current: "98%", status: "pass" },
  { label: "Avg. Credit Quality", limit: ">= A-", current: "A", status: "pass" },
  { label: "Liquidity Score (1-10)", limit: ">= 6", current: "7.1", status: "pass" },
  { label: "ESG Controversy Score", limit: "<= 2.50", current: "1.80", status: "pass" }
];

export const recommendations: Recommendation[] = [
  {
    rank: 1,
    candidate: "EQ Quality Tilt v3",
    tag: "Best Candidate",
    thesis:
      "Quality factors with profitability and strong balance sheets improve risk-adjusted returns across regimes.",
    impactBps: 62,
    confidence: 68,
    riskScore: 3.5,
    action: "Review"
  },
  {
    rank: 2,
    candidate: "Rates Carry Rotation v2",
    tag: "Review",
    thesis:
      "Dynamic duration and curve positioning captures carry while managing rate risk.",
    impactBps: 38,
    confidence: 54,
    riskScore: 3,
    action: "Review"
  },
  {
    rank: 3,
    candidate: "Credit Quality Ladder v1",
    tag: "Queued",
    thesis:
      "Credit quality barbell may improve spread capture while lowering drawdowns.",
    impactBps: 25,
    confidence: 47,
    riskScore: 2.5,
    action: "Hold"
  }
];

export const auditEvents: AuditEvent[] = [
  {
    time: "10:21 AM",
    event: "Hypothesis Generated",
    detail: "Quality tilt should outperform in low-growth environments without breaching concentration limits.",
    decision: "-"
  },
  {
    time: "10:18 AM",
    event: "Backtest Completed",
    detail: "EQ Quality Tilt v3 completed walk-forward validation from 2015 to present.",
    decision: "REVIEW"
  },
  {
    time: "10:18 AM",
    event: "Keep Candidate",
    detail: "RAIS exceeded threshold. Candidate advanced to best-candidate review.",
    decision: "KEEP"
  },
  {
    time: "10:15 AM",
    event: "Hypothesis Generated",
    detail: "Dynamic curve positioning may improve carry without duration concentration.",
    decision: "-"
  },
  {
    time: "10:12 AM",
    event: "Discarded",
    detail: "Global Macro Overlay v1 failed tracking-error guardrail during stress window.",
    decision: "DISCARD"
  }
];

export const performance = [
  { month: "May '20", candidate: -2.1, baseline: -3.5 },
  { month: "Sep '20", candidate: 3.8, baseline: 0.7 },
  { month: "Jan '21", candidate: 8.4, baseline: 4.2 },
  { month: "May '21", candidate: 12.2, baseline: 6.1 },
  { month: "Sep '21", candidate: 13.7, baseline: 7.5 },
  { month: "Jan '22", candidate: 8.9, baseline: 2.3 },
  { month: "May '22", candidate: 4.6, baseline: -3.2 },
  { month: "Sep '22", candidate: 9.8, baseline: 1.4 },
  { month: "Jan '23", candidate: 10.6, baseline: 3.2 },
  { month: "May '23", candidate: 13.2, baseline: 4.5 },
  { month: "Sep '23", candidate: 18.6, baseline: 8.2 },
  { month: "Jan '24", candidate: 19.8, baseline: 9.1 },
  { month: "May '24", candidate: 21.4, baseline: 10.7 },
  { month: "Sep '24", candidate: 24.8, baseline: 12.1 },
  { month: "Jan '25", candidate: 26.1, baseline: 12.9 },
  { month: "May '25", candidate: 24.7, baseline: 12.1 }
];

export const allocationByMandate: Record<Mandate, { name: string; value: number; color: string }[]> = {
  Conservative: [
    { name: "Core Bonds", value: 48, color: "#5cc8ff" },
    { name: "US Equity", value: 22, color: "#1dd6c1" },
    { name: "Intl Equity", value: 12, color: "#8fb5ff" },
    { name: "T-Bills", value: 10, color: "#f2c94c" },
    { name: "Gold", value: 8, color: "#ff9f43" }
  ],
  Balanced: [
    { name: "US Equity", value: 34, color: "#1dd6c1" },
    { name: "Core Bonds", value: 30, color: "#5cc8ff" },
    { name: "Intl Equity", value: 18, color: "#8fb5ff" },
    { name: "Gold", value: 9, color: "#ff9f43" },
    { name: "T-Bills", value: 9, color: "#f2c94c" }
  ],
  Growth: [
    { name: "US Equity", value: 46, color: "#1dd6c1" },
    { name: "Intl Equity", value: 24, color: "#8fb5ff" },
    { name: "Core Bonds", value: 16, color: "#5cc8ff" },
    { name: "Real Assets", value: 8, color: "#ff9f43" },
    { name: "T-Bills", value: 6, color: "#f2c94c" }
  ]
};

