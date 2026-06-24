import { jsonResponse, resetResearchState } from "../../_shared/researchEngine.js";

export async function onRequestOptions() {
  return jsonResponse({});
}

export async function onRequestPost({ env }) {
  try {
    return jsonResponse(await resetResearchState(env));
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Research state could not be reset."
      },
      500
    );
  }
}
