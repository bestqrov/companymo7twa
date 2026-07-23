const HIGGSFIELD_API_BASE = process.env.HIGGSFIELD_API_BASE_URL || "https://platform.higgsfield.ai";
const HIGGSFIELD_MODEL_ID = "higgsfield-ai/soul/standard";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

function getAuthHeader(): string {
  const keyId = process.env.HIGGSFIELD_API_KEY_ID;
  const keySecret = process.env.HIGGSFIELD_API_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("HIGGSFIELD_API_KEY_ID / HIGGSFIELD_API_KEY_SECRET is not set");
  }
  return `Key ${keyId}:${keySecret}`;
}

interface HiggsfieldStatusResponse {
  status: "queued" | "in_progress" | "nsfw" | "failed" | "completed";
  request_id: string;
  images?: { url: string }[];
}

interface HiggsfieldSubmitResponse {
  status: string;
  request_id: string;
  status_url: string;
}

/**
 * Higgsfield's generation API is asynchronous: submitting a request queues
 * it and returns a `status_url` to poll rather than the result directly.
 * This polls until the request reaches a terminal status (completed,
 * failed, or nsfw) or the timeout elapses.
 */
async function pollForCompletion(statusUrl: string): Promise<HiggsfieldStatusResponse> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const res = await fetch(statusUrl, { headers: { Authorization: getAuthHeader() } });
    if (!res.ok) {
      throw new Error(`Higgsfield status check failed: ${res.status} ${await res.text()}`);
    }

    const data: HiggsfieldStatusResponse = await res.json();
    if (data.status === "completed" || data.status === "failed" || data.status === "nsfw") {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Higgsfield generation timed out waiting for completion");
}

/**
 * Isolated HTTP calls for image generation (submit + poll), per Higgsfield's
 * documented async queue pattern: https://docs.higgsfield.ai/docs/how-to/introduction
 * If Higgsfield's real endpoint path or response shape ever changes, only
 * this function needs updating — no call sites change.
 */
async function callGenerateImageEndpoint(prompt: string): Promise<{ url: string }> {
  const res = await fetch(`${HIGGSFIELD_API_BASE}/${HIGGSFIELD_MODEL_ID}`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, aspect_ratio: "16:9", resolution: "720p" }),
  });

  if (!res.ok) {
    throw new Error(`Higgsfield generateImage failed: ${res.status} ${await res.text()}`);
  }

  const submitted: HiggsfieldSubmitResponse = await res.json();
  const result = await pollForCompletion(submitted.status_url);

  if (result.status !== "completed" || !result.images?.[0]?.url) {
    throw new Error(`Higgsfield generation did not complete successfully (status: ${result.status})`);
  }

  return { url: result.images[0].url };
}

export async function generateImage(prompt: string): Promise<{ url: string }> {
  return callGenerateImageEndpoint(prompt);
}

export async function generateVideo(prompt: string): Promise<{ url: string }> {
  throw new Error("Video generation not yet implemented — see a future phase plan");
}

/**
 * Higgsfield's public REST API (https://docs.higgsfield.ai) documents only
 * generation/status/cancel endpoints — no CTR/virality-prediction endpoint
 * is published. Always returns null so callers fall back to the
 * Claude-based heuristic estimate. Revisit if Higgsfield publishes such an
 * endpoint later.
 */
export async function predictCtr(imageUrl: string, context: string): Promise<number | null> {
  return null;
}
