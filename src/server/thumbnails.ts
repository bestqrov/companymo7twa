import type { CtrSource } from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateImage, predictCtr } from "@/lib/higgsfield";
import { getLlmClient } from "@/lib/llm";

export function determineCtrSource(predictedCtr: number | null): CtrSource {
  return predictedCtr !== null ? "HIGGSFIELD_PREDICTOR" : "AI_ESTIMATE";
}

/**
 * Wraps the user's plain-text description with a detailed prompt template
 * modeled on top-performing YouTube creators' thumbnail style (MrBeast, Ali
 * Abdaal, Iman Gadzhi) — high contrast, extreme expression, bold typography,
 * premium effects. Note: image generation models render legible text
 * unreliably (garbled letters are a known failure mode), so the typography
 * this asks for may come out imperfect — an accepted tradeoff the user opted
 * into after seeing the alternative (a text-free prompt).
 */
export function buildThumbnailImagePrompt(userPrompt: string): string {
  return `Create a professional YouTube thumbnail, in the style of top Fiverr/YouTube thumbnail designers (clean, commercial, template-like quality).

Scene/topic: ${userPrompt}

Composition:
- One person occupying 40-55% of the frame, cut out from their background with a clean, thick white (or bright colored) outline border, like a sticker/cutout composited on top of the background — not blended photorealistically into a scene
- Subject looking directly at camera with a clear, exaggerated expression (shock, excitement, curiosity)
- Simple background: a smooth two-color gradient or solid color split down the middle, optionally with a very subtle abstract pattern — NOT a busy or photorealistic scene
- Plenty of empty, uncluttered space reserved for the headline text
- No floating debris, no explosion particles, no lens flare, no scattered icons or logos anywhere in the image

Typography:
- ONE short, extremely bold, ALL-CAPS headline of exactly 2-3 simple common words summarizing the topic
- Large sans-serif font, thick and heavy weight
- White or bright yellow fill with a thick black outline and a subtle drop shadow
- Text must be large, short, and simple enough to render clearly and legibly — prioritize legibility over decoration

Style:
- Bright, saturated, high-contrast colors
- Clean commercial/template quality, sharp focus, professional lighting
- Flat modern graphic-design look rather than cinematic realism`;
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

  // Generated and persisted one at a time (not in parallel, not batched at
  // the end) so that if a later variant fails — e.g. a Higgsfield rate limit
  // partway through a 4-variant A/B batch — the earlier, already-generated
  // (and already-paid-for) variants are still saved rather than lost.
  const thumbnails = [];
  for (let i = 0; i < variantCount; i++) {
    const { url } = await generateImage(buildThumbnailImagePrompt(input.prompt));

    // The image is already generated (and paid for) at this point. If CTR
    // estimation fails (Claude API error, malformed response), don't let
    // that lose the image — fall back to a neutral estimate and persist it
    // anyway, rather than throwing and discarding an already-paid-for asset.
    let ctrEstimate: number;
    let ctrSource: CtrSource;
    try {
      const result = await estimateCtrWithFallback(url, input.prompt);
      ctrEstimate = result.ctrEstimate;
      ctrSource = result.ctrSource;
    } catch (error) {
      console.error("CTR estimation failed, persisting thumbnail with a neutral fallback estimate:", error);
      ctrEstimate = 5;
      ctrSource = "AI_ESTIMATE";
    }

    const thumbnail = await prisma.thumbnail.create({
      data: {
        projectId,
        ideaId,
        prompt: input.prompt,
        imageUrl: url,
        ctrEstimate,
        ctrSource,
        variantGroup,
      },
    });
    thumbnails.push(thumbnail);
  }

  return thumbnails;
}
