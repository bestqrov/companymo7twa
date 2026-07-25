export const YOUTUBE_CATEGORIES = [
  "Film & Animation",
  "Autos & Vehicles",
  "Music",
  "Pets & Animals",
  "Sports",
  "Travel & Events",
  "Gaming",
  "People & Blogs",
  "Comedy",
  "Entertainment",
  "News & Politics",
  "Howto & Style",
  "Education",
  "Science & Technology",
  "Nonprofits & Activism",
] as const;

export interface DescriptionTagsGenerationInput {
  topic: string;
  selectedTitle?: string | null;
  keywords?: string[] | null;
}

export interface GeneratedDescriptionTags {
  description: string;
  tags: string[];
  hashtags: string[];
  category: string;
  pinnedComment: string;
}

export function buildDescriptionTagsPrompt(input: DescriptionTagsGenerationInput): string {
  const titleBlock = input.selectedTitle
    ? `\n\nThe creator has already chosen this title for the video: "${input.selectedTitle}"`
    : "";
  const keywordsBlock =
    input.keywords && input.keywords.length > 0
      ? `\n\nThese keywords were already researched for this video's SEO: ${input.keywords.join(", ")}`
      : "";

  return `You are a YouTube metadata expert. Generate a full metadata package for a video about:
"${input.topic}"${titleBlock}${keywordsBlock}

Generate:
1. A compelling, SEO-friendly video description (2-4 paragraphs, natural keyword usage, no keyword stuffing).
2. Exactly 10-15 relevant tags for the video's tags field.
3. A small set of 3-5 relevant hashtags (each starting with #) for the description.
4. A suggested video category — must be EXACTLY one of these: ${YOUTUBE_CATEGORIES.join(", ")}.
5. A short pinned-comment suggestion the creator could post to boost engagement (e.g. a question to the audience).

Respond with ONLY a JSON object shaped like:
{"description": "...", "tags": ["...", ...], "hashtags": ["...", ...], "category": "...", "pinnedComment": "..."}

Do not include any text outside the JSON object.`;
}

export function parseDescriptionTagsResponse(raw: string): GeneratedDescriptionTags {
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

  if (typeof record.description !== "string" || record.description.trim().length === 0) {
    throw new Error('Parsed response must have a non-empty "description" string');
  }
  if (!Array.isArray(record.tags) || !record.tags.every((t) => typeof t === "string")) {
    throw new Error('Parsed response must have a "tags" array of strings');
  }
  if (!Array.isArray(record.hashtags) || !record.hashtags.every((h) => typeof h === "string")) {
    throw new Error('Parsed response must have a "hashtags" array of strings');
  }
  if (typeof record.category !== "string" || !(YOUTUBE_CATEGORIES as readonly string[]).includes(record.category)) {
    throw new Error(`Parsed response must have a "category" matching one of: ${YOUTUBE_CATEGORIES.join(", ")}`);
  }
  if (typeof record.pinnedComment !== "string" || record.pinnedComment.trim().length === 0) {
    throw new Error('Parsed response must have a non-empty "pinnedComment" string');
  }

  return {
    description: record.description,
    tags: record.tags as string[],
    hashtags: record.hashtags as string[],
    category: record.category,
    pinnedComment: record.pinnedComment,
  };
}
