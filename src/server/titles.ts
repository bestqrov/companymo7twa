import { prisma } from "@/lib/prisma";
import { getLlmClient } from "@/lib/llm";
import { fetchYoutubeTrendContext } from "@/lib/youtube";

export interface TitleGenerationInput {
  topic: string;
  youtubeContext?: string | null;
}

export interface GeneratedTitles {
  titles: string[];
  keywords: string[];
}

export function buildTitlesPrompt(input: TitleGenerationInput): string {
  const contextBlock = input.youtubeContext
    ? `\n\nHere is real YouTube trend data to inform your suggestions:\n${input.youtubeContext}`
    : "";

  return `You are a YouTube SEO expert. Generate title variations and keywords for a video about:
"${input.topic}"${contextBlock}

Generate exactly 8 distinct, high-CTR title variations for this video — a mix of styles (curiosity-driven, number-based, direct-benefit, urgency). Each title should be concise and compelling.

Also generate exactly 10 relevant SEO keywords/search terms a creator should consider for this video's tags and description.

Respond with ONLY a JSON object shaped like:
{"titles": ["...", ... (exactly 8)], "keywords": ["...", ... (exactly 10)]}

Do not include any text outside the JSON object.`;
}

export function parseTitlesResponse(raw: string): GeneratedTitles {
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

  if (!Array.isArray(record.titles) || record.titles.length !== 8 || !record.titles.every((t) => typeof t === "string")) {
    throw new Error('Parsed response must have a "titles" array of exactly 8 strings');
  }
  if (
    !Array.isArray(record.keywords) ||
    record.keywords.length !== 10 ||
    !record.keywords.every((k) => typeof k === "string")
  ) {
    throw new Error('Parsed response must have a "keywords" array of exactly 10 strings');
  }

  return { titles: record.titles as string[], keywords: record.keywords as string[] };
}

export async function createTitleSetForIdeaOrTopic(
  projectId: string,
  ideaId: string | null,
  youtubeApiKey: string | null,
  topic: string
) {
  if (ideaId) {
    const existing = await prisma.titleSet.findUnique({ where: { ideaId } });
    if (existing) {
      return { titleSet: existing, created: false };
    }
  }

  const youtubeContext = youtubeApiKey ? await fetchYoutubeTrendContext(youtubeApiKey, topic) : null;

  const llm = getLlmClient();
  const raw = await llm.generateText(buildTitlesPrompt({ topic, youtubeContext }));
  const generated = parseTitlesResponse(raw);

  const titleSet = await prisma.titleSet.create({
    data: {
      projectId,
      ideaId,
      topic,
      titles: generated.titles,
      keywords: generated.keywords,
    },
  });

  return { titleSet, created: true };
}

export async function regenerateTitleSet(titleSetId: string, youtubeApiKey: string | null) {
  const existing = await prisma.titleSet.findUniqueOrThrow({ where: { id: titleSetId } });

  const youtubeContext = youtubeApiKey ? await fetchYoutubeTrendContext(youtubeApiKey, existing.topic) : null;

  const llm = getLlmClient();
  const raw = await llm.generateText(buildTitlesPrompt({ topic: existing.topic, youtubeContext }));
  const generated = parseTitlesResponse(raw);

  return prisma.titleSet.update({
    where: { id: titleSetId },
    data: {
      titles: generated.titles,
      keywords: generated.keywords,
      selectedTitle: null,
    },
  });
}
