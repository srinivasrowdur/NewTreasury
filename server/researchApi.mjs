import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const latestPath = path.join(root, "public", "research-results", "latest.json");
const memoryPath = path.join(root, "research", "research_memory.json");
const publicMemoryPath = path.join(root, "public", "research-results", "memory.json");
const universePath = path.join(root, "research", "universe.json");
const jobs = new Map();
const MIN_PHASE_DISPLAY_MS = 1200;
const TURN_DISPLAY_MS = 1100;

const phaseStep = {
  queued: 0,
  prepare: 0,
  memory: 1,
  hypotheses: 1,
  candidates: 1,
  evaluate: 2,
  guardrails: 3,
  turns: 4,
  complete: 4,
  error: 0
};

const constraintRanges = {
  max_drawdown: [0.05, 0.35],
  max_volatility: [0.04, 0.25],
  max_single_asset: [0.20, 0.70],
  min_defensive_weight: [0.00, 0.75],
  max_turnover: [0.05, 0.80],
  min_liquidity_score: [5.0, 10.0]
};

function loadApprovedSymbols() {
  try {
    const payload = JSON.parse(readFileSync(universePath, "utf8"));
    const symbols = Array.isArray(payload.assets)
      ? payload.assets.map((asset) => String(asset.symbol || "").toUpperCase()).filter(Boolean)
      : [];
    return symbols.length ? symbols : ["VTI", "VXUS", "AGG", "ERNS.L", "IGLT.L", "SLXX.L", "IGLH.L", "GLD", "VNQ", "INXG.L"];
  } catch {
    return ["VTI", "VXUS", "AGG", "ERNS.L", "IGLT.L", "SLXX.L", "IGLH.L", "GLD", "VNQ", "INXG.L"];
  }
}

const approvedUniverseSymbols = loadApprovedSymbols();
const defaultUniverseSymbols = ["VTI", "VXUS", "AGG", "ERNS.L", "IGLT.L", "SLXX.L", "IGLH.L", "GLD", "VNQ", "INXG.L"].filter((symbol) =>
  approvedUniverseSymbols.includes(symbol)
);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    step: phaseStep[job.phase] ?? 0,
    message: job.message,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    events: job.events,
    result: job.result,
    error: job.error
  };
}

function updateJob(job, patch) {
  Object.assign(job, patch);
  if (patch.message || patch.phase) {
    job.events.push({
      at: new Date().toISOString(),
      phase: job.phase,
      message: job.message,
      status: job.status
    });
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function queueDisplayEvent(job, event) {
  job.displayQueue = job.displayQueue.then(async () => {
    const elapsed = Date.now() - job.lastDisplayedAt;
    if (job.lastDisplayedAt && elapsed < MIN_PHASE_DISPLAY_MS) {
      await wait(MIN_PHASE_DISPLAY_MS - elapsed);
    }

    updateJob(job, {
      phase: event.phase || job.phase,
      message: event.message || job.message
    });
    job.lastDisplayedAt = Date.now();
  });
}

async function loadLatestResult() {
  return JSON.parse(await readFile(latestPath, "utf8"));
}

async function resetResearchState() {
  jobs.clear();
  await Promise.all([latestPath, memoryPath, publicMemoryPath].map((filePath) => rm(filePath, { force: true })));
  return {
    reset_at: new Date().toISOString(),
    cleared: ["latest-result", "research-memory"]
  };
}

function clamp(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}

function cleanConstraintOverrides(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.entries(constraintRanges).reduce((output, [key, range]) => {
    const value = Number(input[key]);
    if (Number.isFinite(value)) {
      output[key] = clamp(value, range[0], range[1]);
    }
    return output;
  }, {});
}

function cleanTurnCount(input) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return 5;
  }
  return Math.min(10, Math.max(4, Math.round(parsed)));
}

function cleanUniverseSymbols(input) {
  if (!Array.isArray(input)) {
    return defaultUniverseSymbols;
  }

  const allowed = new Set(approvedUniverseSymbols);
  const seen = new Set();
  const selected = input.reduce((output, item) => {
    const symbol = String(item || "").trim().toUpperCase();
    if (allowed.has(symbol) && !seen.has(symbol)) {
      seen.add(symbol);
      output.push(symbol);
    }
    return output;
  }, []);

  if (selected.length < 5) {
    return defaultUniverseSymbols;
  }

  return approvedUniverseSymbols.filter((symbol) => seen.has(symbol));
}

function defaultExperimentsForTurns(turns) {
  return Math.min(72, Math.max(36, 18 + turns * 6));
}

function resultAtTurn(result, turnIndex) {
  const turns = Array.isArray(result.turns) ? result.turns.slice(0, turnIndex) : [];
  const activeTurn = turns[turns.length - 1];
  if (!activeTurn) {
    return result;
  }

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
    }
  };
}

async function revealTurns(job, result) {
  const turns = Array.isArray(result.turns) ? result.turns : [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    updateJob(job, {
      status: "running",
      phase: "turns",
      message: `Turn ${turn.turn} of ${turns.length}: ${turn.label}. ${turn.best_candidate} is best so far.`,
      result: resultAtTurn(result, index + 1)
    });
    await wait(TURN_DISPLAY_MS);
  }
}

function startResearchJob(options = {}) {
  const id = randomUUID();
  const mandate = ["conservative", "balanced", "growth"].includes(options.mandate) ? options.mandate : "balanced";
  const turns = cleanTurnCount(options.turns);
  const experiments = Number.isFinite(Number(options.experiments))
    ? String(Math.min(72, Math.max(8, Number(options.experiments))))
    : String(defaultExperimentsForTurns(turns));
  const useLlm = options.useLlm !== false;
  const fallbackData = options.fallbackData === true;
  const constraints = cleanConstraintOverrides(options.constraints);
  const universeSymbols = cleanUniverseSymbols(options.universeSymbols);

  const job = {
    id,
    status: "running",
    phase: "queued",
    message: "Research job queued.",
    startedAt: new Date().toISOString(),
    completedAt: null,
    events: [],
    result: null,
    error: null,
    displayQueue: Promise.resolve(),
    lastDisplayedAt: 0
  };
  updateJob(job, {});
  jobs.set(id, job);

  const args = ["-m", "research.run_lab", "--mandate", mandate, "--experiments", experiments, "--json-events"];
  args.push("--turns", String(turns));
  args.push("--universe-json", JSON.stringify(universeSymbols));
  if (useLlm) args.push("--use-llm");
  if (fallbackData) args.push("--fallback-data");
  if (Object.keys(constraints).length) {
    args.push("--constraints-json", JSON.stringify(constraints));
  }

  const child = spawn("python3", args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdoutBuffer = "";
  let stderrText = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "phase") {
          queueDisplayEvent(job, event);
        }
      } catch {
        // Ignore non-JSON process output; stdout is not user-visible.
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrText += chunk;
  });

  child.on("error", (error) => {
    updateJob(job, {
      status: "error",
      phase: "error",
      completedAt: new Date().toISOString(),
      message: "Research process could not start.",
      error: error.message
    });
  });

  child.on("close", async (code) => {
    await job.displayQueue;
    if (job.status === "error") {
      return;
    }

    if (code === 0) {
      try {
        const result = await loadLatestResult();
        await revealTurns(job, result);
        updateJob(job, {
          status: "complete",
          phase: "complete",
          completedAt: new Date().toISOString(),
          message: "Research complete. Allocation ready for review.",
          result
        });
      } catch (error) {
        updateJob(job, {
          status: "error",
          phase: "error",
          completedAt: new Date().toISOString(),
          message: "Research finished, but the result could not be loaded.",
          error: error instanceof Error ? error.message : "Unknown result loading error"
        });
      }
      return;
    }

    updateJob(job, {
      status: "error",
      phase: "error",
      completedAt: new Date().toISOString(),
      message: "Research process failed.",
      error: stderrText.trim().slice(-1200) || `Process exited with code ${code}`
    });
  });

  return job;
}

export function researchApiMiddleware(req, res, next) {
  const requestPath = req.url?.split(/[?#]/)[0] || "";

  if (req.method === "GET" && requestPath === "/research-results/latest.json") {
    loadLatestResult()
      .then((payload) => {
        sendJson(res, 200, payload);
      })
      .catch(() => {
        sendJson(res, 404, { error: "No research result has been generated yet." });
      });
    return;
  }

  if (!requestPath.startsWith("/api/research")) {
    next();
    return;
  }

  if (req.method === "POST" && requestPath === "/api/research/run") {
    readJson(req)
      .then((body) => {
        const job = startResearchJob(body);
        sendJson(res, 202, publicJob(job));
      })
      .catch((error) => {
        sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid request body" });
      });
    return;
  }

  if (req.method === "POST" && requestPath === "/api/research/reset") {
    resetResearchState()
      .then((payload) => {
        sendJson(res, 200, payload);
      })
      .catch((error) => {
        sendJson(res, 500, { error: error instanceof Error ? error.message : "Research state could not be reset." });
      });
    return;
  }

  const statusMatch = requestPath.match(/^\/api\/research\/status\/([^/]+)/);
  if (req.method === "GET" && statusMatch) {
    const job = jobs.get(statusMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: "Research job not found" });
      return;
    }
    sendJson(res, 200, publicJob(job));
    return;
  }

  sendJson(res, 404, { error: "Unknown research API route" });
}
