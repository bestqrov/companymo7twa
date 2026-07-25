export type Platform = "TIKTOK" | "YOUTUBE_SHORTS" | "INSTAGRAM_REELS" | "FACEBOOK_REELS";

export interface WorkflowContext {
  scriptHook?: string | null;
  scriptMainContent?: string | null;
  selectedTitle?: string | null;
  hashtags?: string[] | null;
}

export interface GeneratedVariant {
  hook: string;
  caption: string;
  hashtags: string[];
  coverImagePrompt?: string;
}

export interface GeneratedPlatformVariants {
  tiktok: GeneratedVariant;
  youtubeShorts: GeneratedVariant;
  instagramReels: GeneratedVariant & { coverImagePrompt: string };
  facebookReels: GeneratedVariant;
}

const PLATFORM_TONE: Record<Platform, string> = {
  TIKTOK:
    'TikTok: open with a pattern-interrupt hook (e.g. "Stop doing X", "Nobody is talking about this...") that breaks the scroll immediately.',
  YOUTUBE_SHORTS:
    "YouTube Shorts: open with a clear value proposition hook, integrating a search keyword naturally so it surfaces in Shorts search.",
  INSTAGRAM_REELS:
    "Instagram Reels: open with a visually descriptive, curiosity-driven hook that sets up a striking visual moment.",
  FACEBOOK_REELS:
    "Facebook Reels: open with a question-based, relatable-scenario hook that invites the viewer to see themselves in it.",
};

function buildContextBlock(input: { topic: string } & WorkflowContext): string {
  const scriptBlock =
    input.scriptHook || input.scriptMainContent
      ? `\n\nHere is the existing long-form script to repurpose from:\nHook: ${input.scriptHook ?? ""}\nMain content: ${input.scriptMainContent ?? ""}`
      : "";
  const titleBlock = input.selectedTitle
    ? `\n\nThe creator has already chosen this title for the long-form video: "${input.selectedTitle}"`
    : "";
  const hashtagsBlock =
    input.hashtags && input.hashtags.length > 0
      ? `\n\nThese hashtags were already researched for this video: ${input.hashtags.join(", ")}`
      : "";
  return `${scriptBlock}${titleBlock}${hashtagsBlock}`;
}

export function buildPlatformVariantsPrompt(input: { topic: string } & WorkflowContext): string {
  const contextBlock = buildContextBlock(input);

  return `You are a short-form content strategist repurposing a long-form video concept about:
"${input.topic}"${contextBlock}

Generate a distinct short-form variant for EACH of these 4 platforms. Each platform's hook (the first 5 seconds) and tone must be genuinely different from the others — this is critical anti-duplication/anti-shadowban logic, not a stylistic preference:

- ${PLATFORM_TONE.TIKTOK}
- ${PLATFORM_TONE.YOUTUBE_SHORTS}
- ${PLATFORM_TONE.INSTAGRAM_REELS}
- ${PLATFORM_TONE.FACEBOOK_REELS}

For each platform, provide a "hook" (the opening line, first 5 seconds), a "caption" (the post caption/description), and "hashtags" (a small relevant set). For Instagram Reels ONLY, also provide a "coverImagePrompt": a text-to-image prompt describing a still cover frame for the reel.

Respond with ONLY a JSON object shaped like:
{
  "tiktok": {"hook": "...", "caption": "...", "hashtags": ["...", ...]},
  "youtubeShorts": {"hook": "...", "caption": "...", "hashtags": ["...", ...]},
  "instagramReels": {"hook": "...", "caption": "...", "hashtags": ["...", ...], "coverImagePrompt": "..."},
  "facebookReels": {"hook": "...", "caption": "...", "hashtags": ["...", ...]}
}

Do not include any text outside the JSON object.`;
}

function extractJsonObject(raw: string): Record<string, unknown> {
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

  return parsed as Record<string, unknown>;
}

function validateVariant(value: unknown, label: string, requireCoverImagePrompt: boolean): GeneratedVariant {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Parsed response must have a "${label}" object`);
  }
  const record = value as Record<string, unknown>;

  if (typeof record.hook !== "string" || record.hook.trim().length === 0) {
    throw new Error(`Parsed response's "${label}" must have a non-empty "hook" string`);
  }
  if (typeof record.caption !== "string" || record.caption.trim().length === 0) {
    throw new Error(`Parsed response's "${label}" must have a non-empty "caption" string`);
  }
  if (!Array.isArray(record.hashtags) || !record.hashtags.every((h) => typeof h === "string")) {
    throw new Error(`Parsed response's "${label}" must have a "hashtags" array of strings`);
  }
  if (requireCoverImagePrompt) {
    if (typeof record.coverImagePrompt !== "string" || record.coverImagePrompt.trim().length === 0) {
      throw new Error(`Parsed response's "${label}" must have a non-empty "coverImagePrompt" string`);
    }
    return {
      hook: record.hook,
      caption: record.caption,
      hashtags: record.hashtags as string[],
      coverImagePrompt: record.coverImagePrompt,
    };
  }

  return { hook: record.hook, caption: record.caption, hashtags: record.hashtags as string[] };
}

export function parsePlatformVariantsResponse(raw: string): GeneratedPlatformVariants {
  const record = extractJsonObject(raw);

  return {
    tiktok: validateVariant(record.tiktok, "tiktok", false),
    youtubeShorts: validateVariant(record.youtubeShorts, "youtubeShorts", false),
    instagramReels: validateVariant(record.instagramReels, "instagramReels", true) as GeneratedVariant & {
      coverImagePrompt: string;
    },
    facebookReels: validateVariant(record.facebookReels, "facebookReels", false),
  };
}

export function buildSinglePlatformVariantPrompt(platform: Platform, input: { topic: string } & WorkflowContext): string {
  const contextBlock = buildContextBlock(input);
  const coverImageInstruction =
    platform === "INSTAGRAM_REELS"
      ? ` Also provide a "coverImagePrompt": a text-to-image prompt describing a still cover frame for the reel.`
      : "";
  const responseShape =
    platform === "INSTAGRAM_REELS"
      ? `{"hook": "...", "caption": "...", "hashtags": ["...", ...], "coverImagePrompt": "..."}`
      : `{"hook": "...", "caption": "...", "hashtags": ["...", ...]}`;

  return `You are a short-form content strategist repurposing a long-form video concept about:
"${input.topic}"${contextBlock}

Generate a short-form variant for this platform only: ${PLATFORM_TONE[platform]}

Provide a "hook" (the opening line, first 5 seconds), a "caption" (the post caption/description), and "hashtags" (a small relevant set).${coverImageInstruction}

Respond with ONLY a JSON object shaped like:
${responseShape}

Do not include any text outside the JSON object.`;
}

export function parseSinglePlatformVariantResponse(raw: string, platform: Platform): GeneratedVariant {
  const record = extractJsonObject(raw);
  return validateVariant(record, platform, platform === "INSTAGRAM_REELS");
}
