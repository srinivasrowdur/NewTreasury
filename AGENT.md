# Agent Operating Contract

This repository is a demo of a self-improving investment research lab. Any agent working in this repo must preserve the distinction between research and live investment management.

## Product Principles

- The system researches candidate portfolios; it does not trade.
- The system recommends options for human review; it does not make final suitability decisions.
- The system improves through offline experiments only.
- The evaluator, constraints, and scoring function are controlled surfaces and should not be agent-editable.
- The user interface should make background research activity visible to senior stakeholders.

## Visual Demo Direction

Build a rich institutional dashboard that shows the research loop in motion, with the least possible noise:

- Experiment engine with running, queued, completed, kept, and discarded states.
- Walk-forward validation against a baseline.
- Portfolio scorecard with risk and return deltas.
- Risk guardrails with pass/fail state.
- Ranked recommendation queue.
- Audit log that explains the agent's reasoning and decisions in plain language.

The main stakeholder story should be visible in the first screen: mandate, running research loop, best candidate found, evidence, and safety state.

## LLM Role

Use the LLM to propose research hypotheses, stress-test narrative explanations, and draft recommendation memos. Do not use the LLM to control the evaluator, change constraints, fetch secrets, bypass guardrails, or decide live trades.

The evaluator remains the source of truth. If an LLM-proposed candidate violates hard constraints, reject it and keep the rejection visible in the audit trail.

The demo should feel like serious financial infrastructure: dense, calm, precise, and audit-ready. Avoid marketing-page treatment, decorative hero sections, oversized claims, and anything that suggests the system is autonomously handling money.

## Research Constraints

Agents may propose and test investment strategies only inside a controlled sandbox:

- Allowed editable surface: strategy hypothesis or allocation logic.
- Locked surfaces: data pipeline, evaluator, scoring formula, mandate constraints, audit log schema, and compliance labels.
- Required labels: `Research Mode`, `No Live Trading`, `Human Approval Required`.
- Any candidate violating a hard guardrail must be rejected.
- Any promoted candidate must include an explanation and supporting metrics.

## Stakeholder Messaging

Use this language consistently:

- "Candidate strategy"
- "Research experiment"
- "Walk-forward validation"
- "Risk guardrail"
- "Human approval"
- "No live trading"

Avoid this language:

- "Guaranteed return"
- "Autonomous adviser"
- "Auto-trade"
- "Risk-free"
- "Best investment for everyone"

## Implementation Notes

- Keep the frontend interactive even when data is simulated.
- Prefer reusable dashboard components over one large monolithic screen.
- Keep text legible at desktop and laptop sizes.
- Use icons for controls where appropriate.
- Use stable dimensions for tables, charts, scorecards, and control bars so the demo does not shift while the simulated agent runs.
