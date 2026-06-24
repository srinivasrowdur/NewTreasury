# TreasuryLab

TreasuryLab is a stakeholder demo of a self-improving investment research lab. It starts with capital, mandate constraints, and an approved ETF universe, then runs research turns that generate, test, reject, remember, and improve portfolio candidates.

This is research-only software. It does not connect to a brokerage, place trades, or make final suitability decisions.

## Demo Story

1. Set the capital pool and mandate constraints.
2. Select the approved ETFs the system is allowed to use.
3. Run the research engine.
4. Watch self-improvement turns unfold progressively.
5. Review the best allocation, guardrail checks, memory recall, and audit note.

The point of the demo is to make the background work visible: hypotheses are generated, candidate allocations are tested against market data, failed candidates are rejected, prior successful runs are recalled, and the final allocation is left for human approval.

## What Is Included

- React/Vite cockpit designed for senior stakeholder walkthroughs.
- Editable investment constraints and visible research-turn depth.
- Editable approved ETF universe across equity, defensive fixed income, credit, real assets, and alternatives.
- Python research backend with candidate generation, guardrail scoring, memory recall, and self-improvement turns.
- Optional OpenAI hypothesis generation through the Responses API.
- Public ETF monthly adjusted-close data path with deterministic fallback scenario data.
- Local API middleware that streams research job progress to the UI.

## Architecture

```text
React cockpit
  -> Vite research API middleware
    -> Python research runner
      -> data preparation
      -> OpenAI hypothesis generation
      -> candidate generation
      -> evaluator and guardrails
      -> persistent research memory
  -> latest research result rendered in the browser
```

## Setup

```bash
npm install
cp .env.example .env
```

Add your OpenAI key to `.env`:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
```

The API key is read only by the Python backend. It is not bundled into the browser app.

The project pins Node.js `22.12.0` through `.node-version` and `.nvmrc` so Cloudflare Pages uses a runtime that satisfies Vite and Wrangler.

## Run Locally

```bash
npm run dev
```

Open `http://127.0.0.1:5173/`.

The app can run directly from the browser UI. You can also run the backend manually:

```bash
npm run research:run
npm run research:public-data
npm run research:conservative
npm run research:growth
```

## Deploy To Cloudflare

This repo deploys to Cloudflare Workers with static assets. The deployed app does not need the local Python process; Cloudflare runs the API routes in Workers-compatible JavaScript.

Cloudflare resources used:

- Workers static assets for the Vite UI.
- A Worker entrypoint for `/api/research/run`, `/api/research/status/:id`, and `/research-results/latest.json`.
- Workers KV binding `TREASURY_KV` for job state, latest result, research memory, and price cache.

Deploy from the command line:

```bash
npm run workers:deploy
```

The project is configured by `wrangler.toml`:

```toml
name = "treasury"
main = "worker.js"

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
```

In Cloudflare, use these build settings:

```bash
Build command: npm run build
Deploy command: npx wrangler deploy
Root directory: /
```

Set Cloudflare environment variables:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
NODE_VERSION=22.12.0
```

Create a Workers KV namespace in the same Cloudflare account as the Workers app, then bind it to the `treasury` Worker:

```bash
Binding name: TREASURY_KV
```

`TREASURY_KV` is used for job state, latest result, research memory, and price cache. The app can build without it, but live research runs are not reliable until the binding exists.

You can preview the Workers build locally with:

```bash
npm run workers:dev
```

## Useful Commands

```bash
npm run build
npm run workers:dev
npm run workers:deploy
python3 -m research.run_lab --mandate balanced --experiments 60 --turns 8 --use-llm
python3 -m research.run_lab --mandate balanced --experiments 60 --turns 8 --fallback-data
```

## Data Notes

- `research:public-data` and browser-triggered runs attempt to download public Yahoo Finance monthly adjusted-close data.
- If public data cannot be downloaded, the backend uses deterministic fallback scenario data and labels the result accordingly.
- Generated price caches, latest result files, experiment logs, research memory, and local build/test artifacts are intentionally ignored by git.

## Safety Boundaries

- No live trading.
- No brokerage integration.
- No leverage, options, or individual securities.
- Hard guardrails are evaluated before a candidate is promoted.
- Output is a research recommendation for human review, not an execution instruction.
