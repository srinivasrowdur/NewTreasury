import { createResearchJob, jsonResponse } from "../../_shared/researchEngine.js";

export async function onRequestOptions() {
  return jsonResponse({});
}

export async function onRequestPost({ request, env }) {
  try {
    const options = await request.json().catch(() => ({}));
    const job = await createResearchJob(options, env);
    return jsonResponse(job, 202);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Research run could not be started."
      },
      500
    );
  }
}
