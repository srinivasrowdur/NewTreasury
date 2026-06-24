# Self-Improving Investment Research Lab Demo Plan

## Objective

Build a stakeholder-ready demo that adapts Andrej Karpathy's `autoresearch` pattern into an investment research lab. The demo must show an agent improving portfolio research ideas through controlled experiments, while making clear that it does not trade, allocate live capital, or bypass human approval.

## Current Build Status

The first working demo is now implemented:

- React/Vite stakeholder cockpit at `http://127.0.0.1:5173/`.
- Python research loop under `research/`.
- OpenAI hypothesis generation through the Responses API when `OPENAI_API_KEY` is set.
- Locked local evaluator for returns, volatility, max drawdown, Sharpe, guardrails, audit trail, and recommendation memo.
- Dashboard data handoff through `public/research-results/latest.json`.
- Repeatable demo command: `npm run research:run`.

## Demo Positioning

The product is a research assistant for portfolio managers and investment committees:

- It generates candidate investment strategies.
- It backtests and validates them against fixed data and fixed rules.
- It keeps candidates only when they improve risk-adjusted outcomes.
- It rejects candidates that violate guardrails.
- It produces a ranked recommendation queue for human review.

The key stakeholder message is: the system is not an autonomous financial adviser. It is an auditable, self-improving research lab.

## Autoresearch Mapping

| Karpathy `autoresearch` concept | Investment lab equivalent |
| --- | --- |
| `prepare.py` | Locked market data, benchmark data, client mandate, and constraints |
| `train.py` | Agent-editable strategy or allocation logic |
| `program.md` | Research mandate, experiment rules, and acceptance criteria |
| Validation loss | Risk-adjusted portfolio score after costs and penalties |
| Repeated experiments | Candidate strategy iterations |
| Keep/discard code | Promote or reject candidate allocation logic |

## First Demo Scope

Use a public ETF model portfolio universe:

- US equity: `VTI` or `SPY`
- International equity: `VXUS`
- Bonds: `AGG` or `BND`
- T-bills/cash: `BIL` or `SHY`
- Gold: `GLD`
- Real estate: `VNQ`
- Inflation-linked bonds: `TIP`

Use deterministic fallback data for the first stakeholder demo so the story is repeatable. The backend can also attempt public ETF price downloads through `npm run research:public-data`.

## System Shape

```text
investment-autoresearch/
  plan.md
  AGENT.md
  README.md
  .env.example
  research/
    prepare.py              # locked data builder
    evaluate.py             # locked evaluator and scoring
    strategy.py             # controlled candidate generator
    llm.py                  # OpenAI hypothesis generation
    run_lab.py              # demo orchestration CLI
    constraints.json        # mandate rules
    universe.json           # ETF universe
    experiments/            # run logs
  public/research-results/
    latest.json             # UI data handoff
  src/                      # stakeholder dashboard
  docs/
    stakeholder-dashboard-concept.png
    story-first-cockpit-concept.png
```

## Research Loop

1. Read the research mandate and current client profile.
2. Generate a strategy hypothesis.
3. Modify only the allowed strategy surface.
4. Run the evaluator against train, validation, and walk-forward windows.
5. Apply transaction cost, turnover, drawdown, liquidity, and concentration penalties.
6. Reject any candidate with hard constraint violations.
7. Promote candidates only when validation score improves.
8. Write an audit note explaining the hypothesis, result, and decision.
9. Add promoted candidates to a human approval queue.

## Scoring Model

The demo should avoid the objective "make more money." Use a constrained score:

```text
Risk-Adjusted Impact Score =
  0.35 * annualized return improvement
+ 0.25 * Sharpe improvement
+ 0.20 * Sortino improvement
- 0.30 * max drawdown penalty
- 0.10 * turnover penalty
- 1.00 * hard constraint violation penalty
```

Hard failures:

- Max drawdown above mandate limit.
- Volatility above mandate limit.
- Single asset allocation above mandate limit.
- Turnover above mandate limit.
- Tracking error above mandate limit.
- Look-ahead bias or data leakage.
- Leverage not explicitly permitted.
- Any live trading or brokerage action.

## Stakeholder UI Requirements

The dashboard must visibly show the "magic happening in the background":

- A running experiment engine with live status, progress, confidence, impact, and risk score.
- A walk-forward validation chart comparing the best candidate to the baseline.
- A portfolio scorecard with return, volatility, Sharpe, drawdown, information ratio, and hit rate.
- A risk guardrails panel with pass/fail status.
- A recommendation queue ranked by expected risk-adjusted impact.
- An audit log showing hypothesis generation, backtest completion, keep/discard decisions, and guardrail failures.
- Clear persistent labels: `Research Mode`, `No Live Trading`, and `Human Approval Required`.

## First Build Milestones

1. Completed: Create a Vite React dashboard with institutional finance styling.
2. Completed: Add local UI interactions for mandate selection, experiment review, and simulated agent ticks.
3. Completed: Create a client-facing visual flow that explains the loop without requiring technical details.
4. Completed: Add Python backend loop for data preparation, strategy generation, evaluation, and experiment persistence.
5. Completed: Add OpenAI hypothesis generation and bind backend output into the dashboard.

## Future Backend Milestones

1. Add real market data provider hardening and cache provenance.
2. Add train/validation/walk-forward split controls.
3. Add regression tests for scoring, guardrail rejection, and JSON schema stability.
4. Add experiment comparison history in the UI.
5. Add approval workflow artifacts for committee review.
6. Add paper-trading mode only after offline validation and compliance review are stable.

## Demo Guardrails

- No brokerage integration.
- No live trade execution.
- No individualized regulated advice in the demo.
- No private client data.
- No agent control over constraints, scoring, or evaluator code.
- Every recommendation remains subject to human approval.
