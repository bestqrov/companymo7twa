import type { ScoreSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLlmClient } from "@/lib/llm";
import { fetchYoutubeTrendContext } from "@/lib/youtube";

export interface IdeaGenerationInput {
  channelTopic: string;
  primaryNiche: string;
  targetAudience: string;
  youtubeContext?: string | null;
}

export interface GeneratedIdea {
  title: string;
  description: string;
  hook: string;
  viralityScore: number;
}

export function buildIdeaPrompt(input: IdeaGenerationInput): string {
  const contextBlock = input.youtubeContext
    ? `\n\nHere is real YouTube trend data to inform your ideas:\n${input.youtubeContext}`
    : "";

  return `You are a YouTube content strategist. Generate exactly 6 video ideas for a creator with:
- Channel topic: ${input.channelTopic}
- Primary niche: ${input.primaryNiche}
- Target audience: ${input.targetAudience}${contextBlock}

For each idea, provide a title, a one-sentence description, a short "hook" (the first line spoken in the video), and a virality score from 0-100 estimating how likely the video is to perform well.

Respond with ONLY a JSON array of exactly 6 objects, each shaped like:
{"title": "...", "description": "...", "hook": "...", "viralityScore": 0-100}

Do not include any text outside the JSON array.`;
}

export function parseIdeasResponse(raw: string): GeneratedIdea[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("Could not find a JSON array in the LLM response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON array from LLM response: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Parsed LLM response is not an array");
  }

  return parsed.map((item, index) => {
    if (
      typeof item.title !== "string" ||
      typeof item.description !== "string" ||
      typeof item.hook !== "string" ||
      typeof item.viralityScore !== "number"
    ) {
      throw new Error(`Idea at index ${index} is missing required fields`);
    }

    return {
      title: item.title,
      description: item.description,
      hook: item.hook,
      viralityScore: Math.max(0, Math.min(100, Math.round(item.viralityScore))),
    };
  });
}

export function determineScoreSource(usedRealYoutubeData: boolean): ScoreSource {
  return usedRealYoutubeData ? "REAL_YOUTUBE_DATA" : "AI_ESTIMATE";
}

export async function createIdeasForProject(
  projectId: string,
  youtubeApiKey: string | null,
  input: { channelTopic: string; primaryNiche: string; targetAudience: string }
) {
  const youtubeContext = youtubeApiKey
    ? await fetchYoutubeTrendContext(youtubeApiKey, `${input.channelTopic} ${input.primaryNiche}`)
    : null;

  const scoreSource = determineScoreSource(youtubeContext !== null);

  const llm = getLlmClient();
  const prompt = buildIdeaPrompt({ ...input, youtubeContext });
  const raw = await llm.generateText(prompt);
  const generatedIdeas = parseIdeasResponse(raw);

  const ideas = await prisma.$transaction(
    generatedIdeas.map((idea) =>
      prisma.idea.create({
        data: {
          projectId,
          title: idea.title,
          description: idea.description,
          hook: idea.hook,
          viralityScore: idea.viralityScore,
          scoreSource,
        },
      })
    )
  );

  return ideas;
}
