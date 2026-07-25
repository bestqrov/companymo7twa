import type { CtrSource } from "@prisma/client";
import crypto from "node:crypto";
import sharp from "sharp";
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

"compositionPattern" must be a short restatement of which of the 4 composition patterns above you chose (matching the one given in "For THIS thumbnail specifically" above). "thumbnailText" is the exact bold on-thumbnail text (short, punchy, e.g. "$12 → $1,000"). "negativePrompt" is a comma-separated list of things to avoid in the image (e.g. "blurry, low quality, watermark, logo, illustration, cartoon, extra hands, extra fingers, duplicate people, cropped face, noise").

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

/**
 * Wraps the user's plain-text description with a clean, commercial YouTube
 * thumbnail composition (Fiverr/template-designer style) — cutout subject,
 * simple background, space reserved for a headline. Deliberately asks for
 * NO text in the generated image: image models render legible text
 * unreliably (garbled letters), so the headline is composited separately
 * afterward with real vector text (see `compositeHeadlineOntoImage`), which
 * is always legible.
 */
export function buildThumbnailImagePrompt(userPrompt: string): string {
  return `Create a professional YouTube thumbnail background image, in the style of top Fiverr/YouTube thumbnail designers (clean, commercial, template-like quality).

Scene/topic: ${userPrompt}

Composition:
- One person occupying 40-55% of the frame, cut out from their background with a clean, thick white (or bright colored) outline border, like a sticker/cutout composited on top of the background — not blended photorealistically into a scene
- Subject looking directly at camera with a clear, exaggerated expression (shock, excitement, curiosity)
- Simple background: a smooth two-color gradient or solid color split down the middle, optionally with a very subtle abstract pattern — NOT a busy or photorealistic scene
- Plenty of empty, uncluttered space in the lower-left area, reserved for a text headline that will be added afterward
- No floating debris, no explosion particles, no lens flare, no scattered icons or logos anywhere in the image

Style:
- Bright, saturated, high-contrast colors
- Clean commercial/template quality, sharp focus, professional lighting
- Flat modern graphic-design look rather than cinematic realism

Do not include any text, letters, numbers, or logos anywhere in the image — the image must be completely text-free.`;
}

/** Requests a short, punchy headline from Claude for topics with no linked Idea Finder idea to draw a title from. */
export function buildHeadlinePrompt(topic: string): string {
  return `You are a YouTube thumbnail copywriter. Write ONE short, punchy headline (2-4 words) for a video about:
"${topic}"

Respond with ONLY the headline text — no quotes, no punctuation at the end, no explanation.`;
}

/**
 * Headline text always comes from a real source of truth rather than being
 * invented at composite-time: the linked idea's title when one exists
 * (already a short, punchy line from Idea Finder), or a fresh short
 * headline from Claude when generating from a freeform topic with no idea.
 */
async function deriveThumbnailHeadline(ideaId: string | null, fallbackPrompt: string): Promise<string> {
  if (ideaId) {
    const idea = await prisma.idea.findUnique({ where: { id: ideaId }, select: { title: true } });
    if (idea?.title) {
      return idea.title;
    }
  }

  const llm = getLlmClient();
  const raw = await llm.generateText(buildHeadlinePrompt(fallbackPrompt));
  return raw.trim().replace(/^["']|["']$/g, "");
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapHeadline(headline: string, maxCharsPerLine: number): string[] {
  const words = headline.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

/**
 * Composites `headline` onto `imageBuffer` as real vector text (bold,
 * white fill, black stroke, bottom-left) via an SVG overlay rendered by
 * sharp — guaranteed legible, unlike text baked in by the image model.
 */
export async function compositeHeadlineOntoImage(imageBuffer: Buffer, headline: string): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 1280;
  const height = metadata.height ?? 720;

  const fontSize = Math.round(width * 0.08);
  const lineHeight = fontSize * 1.15;
  const lines = wrapHeadline(headline.toUpperCase(), 14);
  const startY = height - 40 - lines.length * lineHeight;

  const textElements = lines
    .map((line, i) => {
      const y = startY + i * lineHeight + fontSize;
      return `<text x="40" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="900" fill="#ffffff" stroke="#000000" stroke-width="${Math.round(
        fontSize * 0.06
      )}" paint-order="stroke" stroke-linejoin="round">${escapeXml(line)}</text>`;
    })
    .join("\n");

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${textElements}</svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
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
  const headline = await deriveThumbnailHeadline(ideaId, input.prompt);

  // Generated and persisted one at a time (not in parallel, not batched at
  // the end) so that if a later variant fails — e.g. a Higgsfield rate limit
  // partway through a 4-variant A/B batch — the earlier, already-generated
  // (and already-paid-for) variants are still saved rather than lost.
  const thumbnails = [];
  for (let i = 0; i < variantCount; i++) {
    const { url } = await generateImage(buildThumbnailImagePrompt(input.prompt));

    // The image is already generated (and paid for) at this point. If
    // compositing the headline fails for any reason, don't lose the image —
    // fall back to the AI-generated image without the text overlay rather
    // than throwing and discarding an already-paid-for asset.
    let finalImageUrl = url;
    try {
      const imageRes = await fetch(url);
      const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
      const composited = await compositeHeadlineOntoImage(imageBuffer, headline);
      finalImageUrl = `data:image/png;base64,${composited.toString("base64")}`;
    } catch (error) {
      console.error("Failed to composite headline onto thumbnail, using image without overlay:", error);
    }

    // CTR estimation is passed the original Higgsfield-hosted URL (a real
    // fetchable address an external predictor could use), not the
    // composited data URI — same "don't lose the image on failure" pattern.
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
        imageUrl: finalImageUrl,
        ctrEstimate,
        ctrSource,
        variantGroup,
      },
    });
    thumbnails.push(thumbnail);
  }

  return thumbnails;
}
