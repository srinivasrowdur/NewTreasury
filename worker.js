import { createResearchJob, getLatestResult, getResearchJob, jsonResponse } from "./functions/_shared/researchEngine.js";

function assetResponse(request, env) {
  if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
  return new Response("Not found", { status: 404 });
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return jsonResponse({});
  }

  if (url.pathname === "/api/research/run" && request.method === "POST") {
    const options = await request.json().catch(() => ({}));
    const job = await createResearchJob(options, env);
    return jsonResponse(job, 202);
  }

  const statusMatch = url.pathname.match(/^\/api\/research\/status\/([^/]+)$/);
  if (statusMatch && request.method === "GET") {
    const job = await getResearchJob(statusMatch[1], env);
    if (!job) return jsonResponse({ error: "Research job was not found." }, 404);
    return jsonResponse(job);
  }

  if (url.pathname === "/research-results/latest.json" && request.method === "GET") {
    const result = await getLatestResult(env);
    if (!result) return jsonResponse({ error: "No research result has been generated yet." }, 404);
    return jsonResponse(result);
  }

  return jsonResponse({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/") || url.pathname === "/research-results/latest.json") {
        return await handleApi(request, env);
      }

      return assetResponse(request, env);
    } catch (error) {
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : "Request failed."
        },
        500
      );
    }
  }
};
