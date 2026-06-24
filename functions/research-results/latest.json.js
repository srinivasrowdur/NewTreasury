import { getLatestResult, jsonResponse } from "../_shared/researchEngine.js";

export async function onRequestGet({ env }) {
  const result = await getLatestResult(env);
  if (!result) {
    return jsonResponse({ error: "No research result has been generated yet." }, 404);
  }
  return jsonResponse(result);
}
