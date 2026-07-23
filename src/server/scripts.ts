import type { ScriptTone } from "@prisma/client";

export interface ScriptGenerationInput {
  topic: string;
  tone: ScriptTone;
}

export interface GeneratedScript {
  hook: string;
  intro: string;
  mainContent: string;
  cta: string;
  ending: string;
}

export type ScriptSection = "hook" | "intro" | "mainContent" | "cta" | "ending";

const TONE_INSTRUCTIONS: Record<ScriptTone, string> = {
  ENGAGING: "Conversational and energetic, drawing the viewer in with enthusiasm.",
  EDUCATIONAL: "Clear, structured, and informative, like a knowledgeable teacher.",
  STORYTELLING: "Narrative-driven, building tension and using vivid imagery.",
  FAST_PACED: "Quick, punchy sentences with rapid pacing and minimal fluff.",
};

const SECTION_LABELS: Record<ScriptSection, string> = {
  hook: "Hook (a short, attention-grabbing opening line)",
  intro: "Intro (a brief introduction setting up what the video covers)",
  mainContent: "Main Content (the core content as points, each with a [B-ROLL: ...] suggestion)",
  cta: "CTA (a call-to-action encouraging the viewer to like, subscribe, or comment)",
  ending: "Ending (a short closing line to end the video)",
};

export function buildScriptPrompt(input: ScriptGenerationInput): string {
  return `You are a YouTube scriptwriter. Write a full video script about:
"${input.topic}"

Tone: ${input.tone} — ${TONE_INSTRUCTIONS[input.tone]}

Structure the script into exactly 5 sections:
- hook: A short, attention-grabbing opening line (1-2 sentences).
- intro: A brief introduction setting up what the video will cover (2-4 sentences).
- mainContent: The core content, written as a series of points. For each point, include a suggested B-roll visual in square brackets, e.g. "Point text here. [B-ROLL: description of footage]".
- cta: A call-to-action encouraging the viewer to like/subscribe/comment.
- ending: A short closing line to end the video.

Respond with ONLY a JSON object shaped like:
{"hook": "...", "intro": "...", "mainContent": "...", "cta": "...", "ending": "..."}

Do not include any text outside the JSON object.`;
}

export function parseScriptResponse(raw: string): GeneratedScript {
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
  const fields: ScriptSection[] = ["hook", "intro", "mainContent", "cta", "ending"];
  for (const field of fields) {
    if (typeof record[field] !== "string") {
      throw new Error(`Parsed response is missing a string "${field}" field`);
    }
  }

  return {
    hook: record.hook as string,
    intro: record.intro as string,
    mainContent: record.mainContent as string,
    cta: record.cta as string,
    ending: record.ending as string,
  };
}

export function buildSectionRegeneratePrompt(input: {
  topic: string;
  tone: ScriptTone;
  section: ScriptSection;
  currentSectionText: string;
}): string {
  return `You are a YouTube scriptwriter. Rewrite ONE section of a video script about:
"${input.topic}"

Tone: ${input.tone} — ${TONE_INSTRUCTIONS[input.tone]}

Section to rewrite: ${SECTION_LABELS[input.section]}

Current text for this section (for context — write a fresh alternative, do not just repeat it):
"${input.currentSectionText}"

Respond with ONLY the new text for this section. Do not include any JSON, labels, or text outside the section content itself.`;
}
