import type { CtrSource } from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateImage, predictCtr } from "@/lib/higgsfield";
import { getLlmClient } from "@/lib/llm";

export interface ThumbnailCreativeBrief {
  niche: string;
  story: string;
  person: string;
  emotion: string;
  before: string;
  after: string;
  object: string;
  background: string;
  color: string;
  compositionPattern: string;
  thumbnailText: string;
  negativePrompt: string;
}

/**
 * Four concrete, structural composition patterns — not abstract mood words
 * like "money/charts if relevant" — so the model consistently produces the
 * specific composited-mockup look (phone/laptop screenshots, before/after
 * panels, circled callouts) instead of drifting toward a generic
 * photorealistic portrait. Cycled by variant index so a 4-variant A/B batch
 * always spans all 4 patterns instead of 4 samples of one vague prompt.
 */
export const VARIATION_HINTS: string[] = [
  'Use the "phone-to-laptop transformation" composition: the subject holds a phone showing a stark before-number, with a laptop beside or behind them showing an after-number with a rising graph, connected by one big bold colored arrow between the two numbers.',
  'Use the "zero-to-something reveal" composition: the subject shows a phone/app screen with a stark "0" starting stat next to a calendar or counter prop showing a time span, with a second device or graphic showing the achieved result in bright green.',
  'Use the "day-1-vs-day-7 split panel" composition: the frame is split in two with a hard vertical divider (often a lightning-bolt or jagged crack line) — left side shows the subject dejected/before labeled "before", right side shows the same subject triumphant/after labeled "after", with a result graphic anchoring the "after" side.',
  'Use the "secret-reveal / callout" composition: the subject makes a hushing or pointing gesture directly at camera, with a screenshot or dashboard graphic beside them showing one specific number or row circled/highlighted in bright red as the detail nobody told them.',
];

export interface ThumbnailBriefInput {
  topic: string;
  variationHint: string;
  targetLanguage: string;
  ideaTitle?: string | null;
  scriptHook?: string | null;
  selectedTitle?: string | null;
}

export function buildThumbnailBriefPrompt(input: ThumbnailBriefInput): string {
  const contextBlock = [
    input.ideaTitle ? `\nThis video's working title: "${input.ideaTitle}"` : "",
    input.scriptHook ? `\nThe video's script opens with this hook: "${input.scriptHook}"` : "",
    input.selectedTitle ? `\nThe creator has already chosen this title: "${input.selectedTitle}"` : "",
  ].join("");

  return `You are the world's best YouTube Thumbnail Designer.

Your mission is to create thumbnails with an extremely high click-through rate (CTR).

Your thumbnails must instantly communicate curiosity, emotion and transformation in less than one second.

Always follow these principles:
- One clear subject only.
- Extreme facial expression.
- High contrast.
- Cinematic lighting.
- Rich colors.
- Simple composition.
- Big visual story.
- Before vs After whenever possible.
- Money, charts, arrows and glowing objects if relevant.
- Clean background.
- No clutter.
- No watermark.
- No logo.
- No extra objects.
- Photorealistic.
- Premium DSLR look.
- 8K details.
- Hyper realistic skin.
- Professional color grading.
- Dramatic shadows.
- Wide aperture.
- Sharp eyes.
- High dynamic range.
- Designed specifically for YouTube CTR.

The thumbnail must look better than thumbnails from: MrBeast, Alex Hormozi, Iman Gadzhi, Ali Abdaal, Finance YouTubers, Business YouTubers.

Never create illustrations unless requested. Always generate photorealistic images. Aspect ratio 16:9.

These are the 4 composition patterns you can choose between:
1. Phone-to-laptop transformation: the subject holds a phone showing a stark before-number, with a laptop beside or behind them showing an after-number with a rising graph, connected by one big bold colored arrow between the two numbers.
2. Zero-to-something reveal: the subject shows a phone/app screen with a stark "0" starting stat next to a calendar or counter prop showing a time span, with a second device or graphic showing the achieved result in bright green.
3. Day-1-vs-day-7 split panel: the frame is split in two with a hard vertical divider (often a lightning-bolt or jagged crack line) — left side shows the subject dejected/before labeled "before", right side shows the same subject triumphant/after labeled "after", with a result graphic anchoring the "after" side.
4. Secret-reveal / callout: the subject makes a hushing or pointing gesture directly at camera, with a screenshot or dashboard graphic beside them showing one specific number or row circled/highlighted in bright red as the detail nobody told them.

For THIS thumbnail specifically: ${input.variationHint}

TOPIC: ${input.topic}${contextBlock}

Invent the specific creative details that fit this topic and composition pattern. Respond with ONLY a JSON object shaped like:
{"niche": "...", "story": "...", "person": "...", "emotion": "...", "before": "...", "after": "...", "object": "...", "background": "...", "color": "...", "compositionPattern": "...", "thumbnailText": "...", "negativePrompt": "..."}

"compositionPattern" must be a short restatement of which of the 4 composition patterns above you chose (matching the one given in "For THIS thumbnail specifically" above). "thumbnailText" is the exact bold on-thumbnail text (short, punchy, e.g. "$12 → $1,000") — write it in ${input.targetLanguage}. All other fields (niche, story, person, emotion, before, after, object, background, color, negativePrompt) must stay in English regardless, since they describe the image-generation scene, not visible text. "negativePrompt" is a comma-separated list of things to avoid in the image (e.g. "blurry, low quality, watermark, logo, illustration, cartoon, extra hands, extra fingers, duplicate people, cropped face, noise").

Do not include any text outside the JSON object.`;
}

const REQUIRED_BRIEF_FIELDS = [
  "niche",
  "story",
  "person",
  "emotion",
  "before",
  "after",
  "object",
  "background",
  "color",
  "compositionPattern",
  "thumbnailText",
  "negativePrompt",
] as const;

export function parseThumbnailBriefResponse(raw: string): ThumbnailCreativeBrief {
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

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Parsed response is not an object");
  }

  const record = parsed as Record<string, unknown>;

  for (const field of REQUIRED_BRIEF_FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Parsed response must have a non-empty "${field}" string`);
    }
  }

  return record as unknown as ThumbnailCreativeBrief;
}

export function buildThumbnailImagePromptFromBrief(brief: ThumbnailCreativeBrief): string {
  return `Create an ultra high CTR YouTube thumbnail.

${brief.person}, ${brief.emotion}. ${brief.story}

Composition: ${brief.compositionPattern} Before: ${brief.before} After: ${brief.after} Important object: ${brief.object}

Background: ${brief.background}
Main color: ${brief.color}

Photorealistic. Premium DSLR quality. Sony A7R V DSLR quality. 85mm lens. f1.4. HDR. 8K. Hyper realistic skin. Professional color grading. Dramatic shadows. Wide aperture. Sharp eyes. High dynamic range. Cinematic lighting. Clean composition. No clutter. Large negative space.

Bold typography: "${brief.thumbnailText}"

MrBeast style. Alex Hormozi style. Designed for maximum YouTube CTR.

16:9

Negative prompt: ${brief.negativePrompt}`;
}

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

async function fetchThumbnailContext(
  ideaId: string | null
): Promise<{ ideaTitle: string | null; scriptHook: string | null; selectedTitle: string | null }> {
  if (!ideaId) {
    return { ideaTitle: null, scriptHook: null, selectedTitle: null };
  }

  const [idea, script, titleSet] = await Promise.all([
    prisma.idea.findUnique({ where: { id: ideaId }, select: { title: true } }),
    prisma.script.findUnique({ where: { ideaId } }),
    prisma.titleSet.findUnique({ where: { ideaId } }),
  ]);

  return {
    ideaTitle: idea?.title ?? null,
    scriptHook: script?.hook ?? null,
    selectedTitle: titleSet?.selectedTitle ?? null,
  };
}

export async function createThumbnailsForProject(
  projectId: string,
  ideaId: string | null,
  input: { prompt: string; mode: "single" | "abtest" },
  targetLanguage: string
) {
  const variantCount = input.mode === "abtest" ? 4 : 1;
  const variantGroup = crypto.randomUUID();
  const context = await fetchThumbnailContext(ideaId);

  // Generated and persisted one at a time (not in parallel, not batched at
  // the end) so that if a later variant fails — e.g. a Higgsfield rate limit
  // partway through a 4-variant A/B batch — the earlier, already-generated
  // (and already-paid-for) variants are still saved rather than lost.
  const thumbnails = [];
  for (let i = 0; i < variantCount; i++) {
    const llm = getLlmClient();
    const briefRaw = await llm.generateText(
      buildThumbnailBriefPrompt({
        topic: input.prompt,
        variationHint: VARIATION_HINTS[i % VARIATION_HINTS.length],
        targetLanguage,
        ideaTitle: context.ideaTitle,
        scriptHook: context.scriptHook,
        selectedTitle: context.selectedTitle,
      })
    );
    const brief = parseThumbnailBriefResponse(briefRaw);
    const finalPrompt = buildThumbnailImagePromptFromBrief(brief);

    const { url } = await generateImage(finalPrompt);

    let ctrEstimate: number;
    let ctrSource: CtrSource;
    try {
      const result = await estimateCtrWithFallback(url, finalPrompt);
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
