import type { CtrSource } from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateImage, predictCtr } from "@/lib/higgsfield";
import { getLlmClient } from "@/lib/llm";

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

async function estimateCtrWithFallback(
  imageUrl: string,
  prompt: string
): Promise<{ ctrEstimate: number; ctrSource: CtrSource }> {
  const predicted = await predictCtr(imageUrl, prompt);
  const ctrSource = determineCtrSource(predicted);

  if (ctrSource === "HIGGSFIELD_PREDICTOR" && predicted !== null) {
    return { ctrEstimate: Math.max(0, Math.min(100, Math.round(predicted))), ctrSource };
  }

  const llm = getLlmClient();
  const raw = await llm.generateText(buildCtrFallbackPrompt(prompt));
  const ctrEstimate = parseCtrFallbackResponse(raw);
  return { ctrEstimate, ctrSource };
}

export async function createThumbnailsForProject(
  projectId: string,
  ideaId: string | null,
  input: { prompt: string; mode: "single" | "abtest" }
) {
  const variantCount = input.mode === "abtest" ? 4 : 1;
  const variantGroup = crypto.randomUUID();

  // Generated sequentially (not in parallel) to keep behavior predictable
  // and avoid bursting Higgsfield's API with 4 simultaneous requests.
  const variants: { url: string; ctrEstimate: number; ctrSource: CtrSource }[] = [];
  for (let i = 0; i < variantCount; i++) {
    const { url } = await generateImage(input.prompt);
    const { ctrEstimate, ctrSource } = await estimateCtrWithFallback(url, input.prompt);
    variants.push({ url, ctrEstimate, ctrSource });
  }

  const thumbnails = await prisma.$transaction(
    variants.map((variant) =>
      prisma.thumbnail.create({
        data: {
          projectId,
          ideaId,
          prompt: input.prompt,
          imageUrl: variant.url,
          ctrEstimate: variant.ctrEstimate,
          ctrSource: variant.ctrSource,
          variantGroup,
        },
      })
    )
  );

  return thumbnails;
}
