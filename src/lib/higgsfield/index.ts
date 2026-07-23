const HIGGSFIELD_API_BASE = process.env.HIGGSFIELD_API_BASE_URL || "https://api.higgsfield.ai";

function getAuthHeaders(): Record<string, string> {
  const keyId = process.env.HIGGSFIELD_API_KEY_ID;
  const keySecret = process.env.HIGGSFIELD_API_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("HIGGSFIELD_API_KEY_ID / HIGGSFIELD_API_KEY_SECRET is not set");
  }
  return {
    "hf-api-key": keyId,
    "hf-api-secret": keySecret,
    "Content-Type": "application/json",
  };
}

/**
 * Isolated HTTP call for image generation. If Higgsfield's real endpoint path
 * or response field name differs from this placeholder, only this function
 * needs updating — no call sites change.
 */
async function callGenerateImageEndpoint(prompt: string): Promise<{ url: string }> {
  const res = await fetch(`${HIGGSFIELD_API_BASE}/v1/image/generate`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    throw new Error(`Higgsfield generateImage failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const url = data.url ?? data.image_url;
  if (typeof url !== "string") {
    throw new Error("Higgsfield generateImage response did not contain a url");
  }

  return { url };
}

export async function generateImage(prompt: string): Promise<{ url: string }> {
  return callGenerateImageEndpoint(prompt);
}

export async function generateVideo(prompt: string): Promise<{ url: string }> {
  throw new Error("Video generation not yet implemented — see a future phase plan");
}

/**
 * Isolated HTTP call for CTR/virality prediction. Same placeholder-endpoint
 * caveat as callGenerateImageEndpoint above.
 */
async function callPredictCtrEndpoint(imageUrl: string, context: string): Promise<number | null> {
  const res = await fetch(`${HIGGSFIELD_API_BASE}/v1/predict/ctr`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ image_url: imageUrl, context }),
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  const score = data.ctr_percent ?? data.score;
  return typeof score === "number" ? score : null;
}

/**
 * Returns Higgsfield's predicted CTR% for a generated image, or `null` on
 * ANY failure (missing credentials, network error, non-2xx response,
 * unexpected response shape) — never throws, so callers can cleanly fall
 * back to a Claude-based heuristic estimate instead.
 */
export async function predictCtr(imageUrl: string, context: string): Promise<number | null> {
  try {
    return await callPredictCtrEndpoint(imageUrl, context);
  } catch {
    return null;
  }
}
