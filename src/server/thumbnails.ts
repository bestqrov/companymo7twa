import type { CtrSource } from "@prisma/client";

export function determineCtrSource(predictedCtr: number | null): CtrSource {
  return predictedCtr !== null ? "HIGGSFIELD_PREDICTOR" : "AI_ESTIMATE";
}

export function buildCtrFallbackPrompt(thumbnailPrompt: string): string {
  return `You are a YouTube thumbnail expert. A thumbnail was generated from this prompt:
"${thumbnailPrompt}"

Estimate the click-through rate (CTR) this thumbnail would achieve, as a percentage
between 0 and 20 (typical YouTube thumbnail CTRs range from 2% to 15%).

Respond with ONLY a JSON object: {"ctrEstimate": 0-20}
Do not include any text outside the JSON object.`;
}

export function parseCtrFallbackResponse(raw: string): number {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Could not find a JSON object in the LLM response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON object from LLM response: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).ctrEstimate !== "number"
  ) {
    throw new Error("Parsed response is missing a numeric ctrEstimate field");
  }

  const ctrEstimate = (parsed as { ctrEstimate: number }).ctrEstimate;
  return Math.max(0, Math.min(100, Math.round(ctrEstimate)));
}
