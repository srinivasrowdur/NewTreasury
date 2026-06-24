import { getResearchJob, jsonResponse } from "../../../_shared/researchEngine.js";

export async function onRequestGet({ env, params }) {
  const job = await getResearchJob(params.id, env);
  if (!job) {
    return jsonResponse({ error: "Research job not found" }, 404);
  }
  return jsonResponse(job);
}
