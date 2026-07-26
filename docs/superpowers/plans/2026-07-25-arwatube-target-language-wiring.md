# ArwaTube AI Engine — Target Language Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Wire the existing (currently unused) `ProjectSettings.targetLanguage` field into all 6 generation modules (Idea Finder, Script Writer, SEO Titles, Description & Tags, Multi-Platform Shorts, Thumbnail Studio) so generated content is produced in the project's chosen language (English/French/Arabic) instead of always defaulting to English.

**Architecture:** A shared `resolveLanguageName` helper maps the stored code (`"en"/"fr"/"ar"`) to a full language name, defaulting to `"English"`. Each module's route resolves this once and threads it through that module's orchestration function into its prompt builder(s), which append a "write your entire response in {language}" instruction. Thumbnail Studio is the one exception: the instruction applies only to the visible `thumbnailText` field, not the English-language internal scene-description fields that drive the image-generation prompt.

**Tech Stack:** TypeScript, Prisma, Claude API (via `lib/llm`), Next.js API routes, Vitest.

---

## File Structure

```
src/
  lib/
    language.ts                                    (NEW: resolveLanguageName helper)
  server/
    ideas.ts                                       (MODIFY: targetLanguage in prompt + createIdeasForProject)
    scripts.ts                                     (MODIFY: targetLanguage in both prompts + create/regenerate)
    titles.ts                                      (MODIFY: targetLanguage in prompt + create/regenerate)
    descriptionTags.ts                             (MODIFY: targetLanguage in prompt + create/regenerate)
    platformVariants.ts                            (MODIFY: targetLanguage in both prompts + create/regenerate)
    thumbnails.ts                                  (MODIFY: targetLanguage replaces topic-language-inference for thumbnailText only)
  app/api/
    ideas/route.ts                                  (MODIFY: resolve + pass targetLanguage)
    scripts/route.ts                                (MODIFY: fetch settings, resolve + pass targetLanguage)
    scripts/[id]/regenerate/route.ts                (MODIFY: fetch project/settings, resolve + pass targetLanguage)
    titles/route.ts                                 (MODIFY: resolve + pass targetLanguage)
    titles/[id]/regenerate/route.ts                 (MODIFY: resolve + pass targetLanguage)
    description-tags/route.ts                       (MODIFY: fetch settings, resolve + pass targetLanguage)
    description-tags/[id]/regenerate/route.ts       (MODIFY: fetch project/settings, resolve + pass targetLanguage)
    platform-variants/route.ts                      (MODIFY: fetch settings, resolve + pass targetLanguage)
    platform-variants/[id]/regenerate/route.ts      (MODIFY: fetch project/settings, resolve + pass targetLanguage)
    thumbnails/route.ts                             (MODIFY: fetch settings, resolve + pass targetLanguage)

tests/
  unit/
    language.test.ts                                (NEW)
    ideas.test.ts, scripts.test.ts, titles.test.ts, descriptionTags.test.ts,
    platformVariants.test.ts, thumbnails.test.ts     (MODIFY: pass targetLanguage in existing calls, add 1 new case each)
  integration/
    ideas.test.ts, scripts.test.ts, titles.test.ts, descriptionTags.test.ts,
    platformVariants.test.ts, thumbnails.test.ts     (MODIFY: add 1 new assertion each that targetLanguage reaches the mocked LLM prompt)
```

**IMPORTANT — do not run the full test suite against a live database.** Every task in this plan that runs tests specifies an exact `npx vitest run <specific file>` command — **never run the bare `npm test` or `npx vitest run` with no path argument**. If a `DATABASE_URL` happens to be absent or unreachable, integration test failures with a connectivity error are an accepted, expected outcome — not a task failure.

---

## Task 1: `resolveLanguageName` Helper

**Files:**
- Create: `src/lib/language.ts`
- Test: `tests/unit/language.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/language.test.ts
import { describe, it, expect } from "vitest";
import { resolveLanguageName } from "@/lib/language";

describe("resolveLanguageName", () => {
  it("resolves 'en' to English", () => {
    expect(resolveLanguageName("en")).toBe("English");
  });

  it("resolves 'fr' to French", () => {
    expect(resolveLanguageName("fr")).toBe("French");
  });

  it("resolves 'ar' to Arabic", () => {
    expect(resolveLanguageName("ar")).toBe("Arabic");
  });

  it("defaults to English for null", () => {
    expect(resolveLanguageName(null)).toBe("English");
  });

  it("defaults to English for undefined", () => {
    expect(resolveLanguageName(undefined)).toBe("English");
  });

  it("defaults to English for an unrecognized code", () => {
    expect(resolveLanguageName("xx")).toBe("English");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/language.test.ts`
Expected: FAIL — `Cannot find module '@/lib/language'`

- [x] **Step 3: Create `src/lib/language.ts`**

```ts
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  ar: "Arabic",
};

export function resolveLanguageName(code: string | null | undefined): string {
  if (!code) return "English";
  return LANGUAGE_NAMES[code] ?? "English";
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/language.test.ts`
Expected: PASS (6 tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/language.ts tests/unit/language.test.ts
git commit -m "feat: add resolveLanguageName helper for target-language wiring"
```

---

## Task 2: Wire Target Language Into Idea Finder

**Files:**
- Modify: `src/server/ideas.ts`
- Modify: `src/app/api/ideas/route.ts`
- Modify: `tests/unit/ideas.test.ts`
- Modify: `tests/integration/ideas.test.ts`

- [x] **Step 1: Update `src/server/ideas.ts`**

Change the `IdeaGenerationInput` interface (add `targetLanguage`):

```ts
export interface IdeaGenerationInput {
  channelTopic: string;
  primaryNiche: string;
  targetAudience: string;
  targetLanguage: string;
  youtubeContext?: string | null;
}
```

Change `buildIdeaPrompt` to append the language instruction before the response-format instruction:

```ts
export function buildIdeaPrompt(input: IdeaGenerationInput): string {
  const contextBlock = input.youtubeContext
    ? `\n\nHere is real YouTube trend data to inform your ideas:\n${input.youtubeContext}`
    : "";

  return `You are a YouTube content strategist. Generate exactly 6 video ideas for a creator with:
- Channel topic: ${input.channelTopic}
- Primary niche: ${input.primaryNiche}
- Target audience: ${input.targetAudience}${contextBlock}

For each idea, provide a title, a one-sentence description, a short "hook" (the first line spoken in the video), and a virality score from 0-100 estimating how likely the video is to perform well.

Write your entire response (title, description, hook) in ${input.targetLanguage}.

Respond with ONLY a JSON array of exactly 6 objects, each shaped like:
{"title": "...", "description": "...", "hook": "...", "viralityScore": 0-100}

Do not include any text outside the JSON array.`;
}
```

Change `createIdeasForProject` to accept and thread `targetLanguage`:

```ts
export async function createIdeasForProject(
  projectId: string,
  youtubeApiKey: string | null,
  input: { channelTopic: string; primaryNiche: string; targetAudience: string; inspirationChannel?: string },
  targetLanguage: string
) {
  const youtubeContext = !youtubeApiKey
    ? null
    : input.inspirationChannel?.trim()
      ? await fetchYoutubeChannelContext(youtubeApiKey, input.inspirationChannel.trim())
      : await fetchYoutubeTrendContext(youtubeApiKey, `${input.channelTopic} ${input.primaryNiche}`);

  const scoreSource = determineScoreSource(youtubeContext !== null);

  const llm = getLlmClient();
  const prompt = buildIdeaPrompt({ ...input, youtubeContext, targetLanguage });
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
```

- [x] **Step 2: Update `src/app/api/ideas/route.ts`**

Add the import and resolve/pass the language (the route already fetches `project.settings`):

```ts
import { resolveLanguageName } from "@/lib/language";
```

Change the `try` block inside `POST`:

```ts
  let ideas;
  try {
    const youtubeApiKey = project.settings?.youtubeApiKey ? decrypt(project.settings.youtubeApiKey) : null;
    const targetLanguage = resolveLanguageName(project.settings?.targetLanguage);

    ideas = await createIdeasForProject(
      projectId,
      youtubeApiKey,
      {
        channelTopic,
        primaryNiche,
        targetAudience,
        inspirationChannel,
      },
      targetLanguage
    );
  } catch (error) {
    console.error("Failed to generate ideas:", error);
    return NextResponse.json({ error: "Failed to generate ideas. Please try again." }, { status: 502 });
  }
```

- [x] **Step 3: Update `tests/unit/ideas.test.ts`**

Add `targetLanguage: "English"` to every existing `buildIdeaPrompt(...)` call (required now that it's on the interface), and add one new test. Replace the entire `describe("buildIdeaPrompt", ...)` block with:

```ts
describe("buildIdeaPrompt", () => {
  it("includes the form inputs", () => {
    const prompt = buildIdeaPrompt({
      channelTopic: "Home coffee brewing",
      primaryNiche: "Specialty coffee",
      targetAudience: "Home baristas 25-40",
      targetLanguage: "English",
    });

    expect(prompt).toContain("Home coffee brewing");
    expect(prompt).toContain("Specialty coffee");
    expect(prompt).toContain("Home baristas 25-40");
  });

  it("includes YouTube context when provided", () => {
    const prompt = buildIdeaPrompt({
      channelTopic: "Home coffee brewing",
      primaryNiche: "Specialty coffee",
      targetAudience: "Home baristas 25-40",
      targetLanguage: "English",
      youtubeContext: '- "Top 5 Espresso Tips" (1000000 views)',
    });

    expect(prompt).toContain("Top 5 Espresso Tips");
  });

  it("omits the YouTube context section when not provided", () => {
    const prompt = buildIdeaPrompt({
      channelTopic: "Home coffee brewing",
      primaryNiche: "Specialty coffee",
      targetAudience: "Home baristas 25-40",
      targetLanguage: "English",
    });

    expect(prompt).not.toContain("real YouTube trend data");
  });

  it("includes a language instruction for the given target language", () => {
    const prompt = buildIdeaPrompt({
      channelTopic: "Home coffee brewing",
      primaryNiche: "Specialty coffee",
      targetAudience: "Home baristas 25-40",
      targetLanguage: "French",
    });

    expect(prompt).toContain("Write your entire response");
    expect(prompt).toContain("French");
  });
});
```

- [x] **Step 4: Update `tests/integration/ideas.test.ts`**

Read the current file first — it mocks `@/lib/llm`'s `generateText` inline (not via `vi.fn`). Convert the mock to a `vi.fn` so a test can inspect the prompt argument, and add one assertion. At the top of the file, replace the `vi.mock("@/lib/llm", ...)` block with:

```ts
const generateText = vi.fn(async () =>
  JSON.stringify([{ title: "T1", description: "D1", hook: "H1", viralityScore: 85 }])
);

vi.mock("@/lib/llm", () => ({
  getLlmClient: () => ({ generateText }),
}));
```

(Keep any existing `vi.mock("@/lib/youtube", ...)` block unchanged.) Add `generateText.mockClear();` as the first line of the existing `beforeEach`. Then find the call(s) to `createIdeasForProject(...)` in the test bodies and add `"English"` as the trailing argument (matching the new signature: `createIdeasForProject(projectId, youtubeApiKey, input, targetLanguage)`). Add this new test at the end of the `describe` block:

```ts
  it("passes the target language into the prompt sent to the LLM", async () => {
    const user = await prisma.user.create({ data: { email: "creator-lang@example.com", name: "Creator Lang" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel Lang", isActive: true, settings: { create: {} } },
    });

    await createIdeasForProject(
      project.id,
      null,
      { channelTopic: "Home coffee brewing", primaryNiche: "Specialty coffee", targetAudience: "Home baristas 25-40" },
      "French"
    );

    const promptSent = generateText.mock.calls[generateText.mock.calls.length - 1][0] as string;
    expect(promptSent).toContain("French");
  });
```

- [x] **Step 5: Run tests**

Run: `npx vitest run tests/unit/ideas.test.ts`
Expected: PASS (all tests including the new one)

Run: `npx vitest run tests/integration/ideas.test.ts`
Expected: PASS, if a live `DATABASE_URL` is reachable; otherwise a DB-connectivity error is an accepted outcome.

- [x] **Step 6: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 7: Commit**

```bash
git add src/server/ideas.ts src/app/api/ideas/route.ts tests/unit/ideas.test.ts tests/integration/ideas.test.ts
git commit -m "feat: wire target language into Idea Finder generation"
```

---

## Task 3: Wire Target Language Into Script Writer

**Files:**
- Modify: `src/server/scripts.ts`
- Modify: `src/app/api/scripts/route.ts`
- Modify: `src/app/api/scripts/[id]/regenerate/route.ts`
- Modify: `tests/unit/scripts.test.ts`
- Modify: `tests/integration/scripts.test.ts`

- [x] **Step 1: Update `src/server/scripts.ts`**

Change `ScriptGenerationInput` (add `targetLanguage`):

```ts
export interface ScriptGenerationInput {
  topic: string;
  tone: ScriptTone;
  targetLanguage: string;
}
```

Update `buildScriptPrompt`:

```ts
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

Write the script text (hook, intro, mainContent, cta, ending) in ${input.targetLanguage}. The bracketed [B-ROLL: ...] visual-suggestion notes may stay in English regardless, since they're production notes, not spoken script content.

Respond with ONLY a JSON object shaped like:
{"hook": "...", "intro": "...", "mainContent": "...", "cta": "...", "ending": "..."}

Do not include any text outside the JSON object.`;
}
```

Update `buildSectionRegeneratePrompt` (add `targetLanguage` to its input type and body):

```ts
export function buildSectionRegeneratePrompt(input: {
  topic: string;
  tone: ScriptTone;
  section: ScriptSection;
  currentSectionText: string;
  targetLanguage: string;
}): string {
  return `You are a YouTube scriptwriter. Rewrite ONE section of a video script about:
"${input.topic}"

Tone: ${input.tone} — ${TONE_INSTRUCTIONS[input.tone]}

Section to rewrite: ${SECTION_LABELS[input.section]}

Current text for this section (for context — write a fresh alternative, do not just repeat it):
"${input.currentSectionText}"

Write the new section text in ${input.targetLanguage}.

Respond with ONLY the new text for this section. Do not include any JSON, labels, or text outside the section content itself.`;
}
```

Update `createScriptForIdeaOrTopic` and `regenerateScriptSection`:

```ts
export async function createScriptForIdeaOrTopic(
  projectId: string,
  ideaId: string | null,
  input: { topic: string; tone: ScriptTone },
  targetLanguage: string
) {
  if (ideaId) {
    const existing = await prisma.script.findUnique({ where: { ideaId } });
    if (existing) {
      return { script: existing, created: false };
    }
  }

  const llm = getLlmClient();
  const raw = await llm.generateText(buildScriptPrompt({ ...input, targetLanguage }));
  const generated = parseScriptResponse(raw);

  const script = await prisma.script.create({
    data: {
      projectId,
      ideaId,
      topic: input.topic,
      tone: input.tone,
      hook: generated.hook,
      intro: generated.intro,
      mainContent: generated.mainContent,
      cta: generated.cta,
      ending: generated.ending,
    },
  });

  return { script, created: true };
}

export async function regenerateScriptSection(scriptId: string, section: ScriptSection, targetLanguage: string) {
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId } });

  const llm = getLlmClient();
  const raw = await llm.generateText(
    buildSectionRegeneratePrompt({
      topic: script.topic,
      tone: script.tone,
      section,
      currentSectionText: script[section],
      targetLanguage,
    })
  );

  return prisma.script.update({
    where: { id: scriptId },
    data: { [section]: raw.trim() },
  });
}
```

- [x] **Step 2: Update `src/app/api/scripts/route.ts`**

Add `include: { settings: true }` to the project lookup, import the helper, and thread the language through:

```ts
import { resolveLanguageName } from "@/lib/language";
```

```ts
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { settings: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
```

```ts
  let result;
  try {
    const targetLanguage = resolveLanguageName(project.settings?.targetLanguage);
    result = await createScriptForIdeaOrTopic(projectId, resolvedIdeaId, { topic, tone }, targetLanguage);
  } catch (error) {
    console.error("Failed to generate script:", error);
    return NextResponse.json({ error: "Failed to generate script. Please try again." }, { status: 502 });
  }
```

- [x] **Step 3: Update `src/app/api/scripts/[id]/regenerate/route.ts`**

Add `include: { project: { include: { settings: true } } }` to the script lookup, import the helper, and pass the language through:

```ts
import { resolveLanguageName } from "@/lib/language";
```

```ts
  const script = await prisma.script.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
    include: { project: { include: { settings: true } } },
  });
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  try {
    const targetLanguage = resolveLanguageName(script.project.settings?.targetLanguage);
    const updated = await regenerateScriptSection(params.id, section as ScriptSection, targetLanguage);
    return NextResponse.json({ script: updated });
  } catch (error) {
    console.error("Failed to regenerate script section:", error);
    return NextResponse.json({ error: "Failed to regenerate section. Please try again." }, { status: 502 });
  }
```

- [x] **Step 4: Update `tests/unit/scripts.test.ts`**

Add `targetLanguage: "English"` to the existing `buildScriptPrompt` and `buildSectionRegeneratePrompt` calls, and add two new tests. Replace the `describe("buildScriptPrompt", ...)` and `describe("buildSectionRegeneratePrompt", ...)` blocks with:

```ts
describe("buildScriptPrompt", () => {
  it("includes the topic and tone", () => {
    const prompt = buildScriptPrompt({ topic: "Home coffee brewing mistakes", tone: "FAST_PACED", targetLanguage: "English" });
    expect(prompt).toContain("Home coffee brewing mistakes");
    expect(prompt).toContain("FAST_PACED");
  });

  it("includes a language instruction for the given target language", () => {
    const prompt = buildScriptPrompt({ topic: "Home coffee brewing mistakes", tone: "FAST_PACED", targetLanguage: "Arabic" });
    expect(prompt).toContain("Arabic");
  });
});
```

```ts
describe("buildSectionRegeneratePrompt", () => {
  it("includes the topic, tone, section, and current text", () => {
    const prompt = buildSectionRegeneratePrompt({
      topic: "Home coffee brewing mistakes",
      tone: "EDUCATIONAL",
      section: "cta",
      currentSectionText: "Please subscribe.",
      targetLanguage: "English",
    });
    expect(prompt).toContain("Home coffee brewing mistakes");
    expect(prompt).toContain("EDUCATIONAL");
    expect(prompt).toContain("Please subscribe.");
  });

  it("includes a language instruction for the given target language", () => {
    const prompt = buildSectionRegeneratePrompt({
      topic: "Home coffee brewing mistakes",
      tone: "EDUCATIONAL",
      section: "cta",
      currentSectionText: "Please subscribe.",
      targetLanguage: "French",
    });
    expect(prompt).toContain("French");
  });
});
```

- [x] **Step 5: Update `tests/integration/scripts.test.ts`**

Read the current file first. Convert its inline `@/lib/llm` mock to a `vi.fn` (same pattern as Task 2's Idea Finder change) so a test can inspect the prompt, add `generateText.mockClear();` to `beforeEach`, add `"English"` as the trailing argument to every existing `createScriptForIdeaOrTopic(...)` call, and add:

```ts
  it("passes the target language into the prompt sent to the LLM", async () => {
    const user = await prisma.user.create({ data: { email: "creator-lang@example.com", name: "Creator Lang" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel Lang", isActive: true, settings: { create: {} } },
    });

    await createScriptForIdeaOrTopic(project.id, null, { topic: "Home coffee brewing mistakes", tone: "ENGAGING" }, "French");

    const promptSent = generateText.mock.calls[generateText.mock.calls.length - 1][0] as string;
    expect(promptSent).toContain("French");
  });
```

- [x] **Step 6: Run tests**

Run: `npx vitest run tests/unit/scripts.test.ts`
Expected: PASS

Run: `npx vitest run tests/integration/scripts.test.ts`
Expected: PASS, if a live `DATABASE_URL` is reachable; otherwise a DB-connectivity error is accepted.

- [x] **Step 7: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 8: Commit**

```bash
git add src/server/scripts.ts src/app/api/scripts/route.ts "src/app/api/scripts/[id]/regenerate/route.ts" tests/unit/scripts.test.ts tests/integration/scripts.test.ts
git commit -m "feat: wire target language into Script Writer generation"
```

---

## Task 4: Wire Target Language Into SEO Titles

**Files:**
- Modify: `src/server/titles.ts`
- Modify: `src/app/api/titles/route.ts`
- Modify: `src/app/api/titles/[id]/regenerate/route.ts`
- Modify: `tests/unit/titles.test.ts`
- Modify: `tests/integration/titles.test.ts`

- [x] **Step 1: Update `src/server/titles.ts`**

Change `TitleGenerationInput`:

```ts
export interface TitleGenerationInput {
  topic: string;
  targetLanguage: string;
  youtubeContext?: string | null;
}
```

Update `buildTitlesPrompt`:

```ts
export function buildTitlesPrompt(input: TitleGenerationInput): string {
  const contextBlock = input.youtubeContext
    ? `\n\nHere is real YouTube trend data to inform your suggestions:\n${input.youtubeContext}`
    : "";

  return `You are a YouTube SEO expert. Generate title variations and keywords for a video about:
"${input.topic}"${contextBlock}

Generate exactly 8 distinct, high-CTR title variations for this video — a mix of styles (curiosity-driven, number-based, direct-benefit, urgency). Each title should be concise and compelling.

Also generate exactly 10 relevant SEO keywords/search terms a creator should consider for this video's tags and description.

Write the titles and keywords in ${input.targetLanguage}.

Respond with ONLY a JSON object shaped like:
{"titles": ["...", ... (exactly 8)], "keywords": ["...", ... (exactly 10)]}

Do not include any text outside the JSON object.`;
}
```

Update `createTitleSetForIdeaOrTopic` and `regenerateTitleSet` (each gains a trailing `targetLanguage: string` parameter):

```ts
export async function createTitleSetForIdeaOrTopic(
  projectId: string,
  ideaId: string | null,
  youtubeApiKey: string | null,
  topic: string,
  targetLanguage: string
) {
  if (ideaId) {
    const existing = await prisma.titleSet.findUnique({ where: { ideaId } });
    if (existing) {
      return { titleSet: existing, created: false };
    }
  }

  const youtubeContext = youtubeApiKey ? await fetchYoutubeTrendContext(youtubeApiKey, topic) : null;

  const llm = getLlmClient();
  const raw = await llm.generateText(buildTitlesPrompt({ topic, youtubeContext, targetLanguage }));
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

export async function regenerateTitleSet(titleSetId: string, youtubeApiKey: string | null, targetLanguage: string) {
  const existing = await prisma.titleSet.findUniqueOrThrow({ where: { id: titleSetId } });

  const youtubeContext = youtubeApiKey ? await fetchYoutubeTrendContext(youtubeApiKey, existing.topic) : null;

  const llm = getLlmClient();
  const raw = await llm.generateText(buildTitlesPrompt({ topic: existing.topic, youtubeContext, targetLanguage }));
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
```

- [x] **Step 2: Update `src/app/api/titles/route.ts`**

The route already fetches `settings`. Add the import and resolve/pass the language:

```ts
import { resolveLanguageName } from "@/lib/language";
```

```ts
  let result;
  try {
    const youtubeApiKey = project.settings?.youtubeApiKey ? decrypt(project.settings.youtubeApiKey) : null;
    const targetLanguage = resolveLanguageName(project.settings?.targetLanguage);
    result = await createTitleSetForIdeaOrTopic(projectId, resolvedIdeaId, youtubeApiKey, topic, targetLanguage);
  } catch (error) {
    console.error("Failed to generate title set:", error);
    return NextResponse.json({ error: "Failed to generate titles. Please try again." }, { status: 502 });
  }
```

- [x] **Step 3: Update `src/app/api/titles/[id]/regenerate/route.ts`**

Already fetches `project.settings`. Add the import and pass the language:

```ts
import { resolveLanguageName } from "@/lib/language";
```

```ts
  try {
    const youtubeApiKey = titleSet.project.settings?.youtubeApiKey
      ? decrypt(titleSet.project.settings.youtubeApiKey)
      : null;
    const targetLanguage = resolveLanguageName(titleSet.project.settings?.targetLanguage);
    const updated = await regenerateTitleSet(params.id, youtubeApiKey, targetLanguage);
    return NextResponse.json({ titleSet: updated });
  } catch (error) {
    console.error("Failed to regenerate title set:", error);
    return NextResponse.json({ error: "Failed to regenerate titles. Please try again." }, { status: 502 });
  }
```

- [x] **Step 4: Update `tests/unit/titles.test.ts`**

Add `targetLanguage: "English"` to every existing `buildTitlesPrompt(...)` call, and one new test. Replace `describe("buildTitlesPrompt", ...)` with:

```ts
describe("buildTitlesPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildTitlesPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "English" });
    expect(prompt).toContain("Home coffee brewing mistakes");
  });

  it("includes YouTube context when provided", () => {
    const prompt = buildTitlesPrompt({
      topic: "Home coffee brewing mistakes",
      targetLanguage: "English",
      youtubeContext: '- "Top 5 Espresso Tips" (1000000 views)',
    });
    expect(prompt).toContain("Top 5 Espresso Tips");
  });

  it("omits the YouTube context section when not provided", () => {
    const prompt = buildTitlesPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "English" });
    expect(prompt).not.toContain("real YouTube trend data");
  });

  it("includes a language instruction for the given target language", () => {
    const prompt = buildTitlesPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "Arabic" });
    expect(prompt).toContain("Arabic");
  });
});
```

- [x] **Step 5: Update `tests/integration/titles.test.ts`**

Convert the inline `generateText` mock to a `vi.fn` (keep the same returned JSON body) so its call arguments can be inspected, add `generateText.mockClear();` to `beforeEach`, add `"English"` as the trailing argument to both existing `createTitleSetForIdeaOrTopic(...)` calls, and add:

```ts
  it("passes the target language into the prompt sent to the LLM", async () => {
    const user = await prisma.user.create({ data: { email: "creator-lang@example.com", name: "Creator Lang" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel Lang", isActive: true, settings: { create: {} } },
    });

    await createTitleSetForIdeaOrTopic(project.id, null, null, "Home coffee brewing mistakes", "French");

    const promptSent = generateText.mock.calls[generateText.mock.calls.length - 1][0] as string;
    expect(promptSent).toContain("French");
  });
```

- [x] **Step 6: Run tests**

Run: `npx vitest run tests/unit/titles.test.ts`
Expected: PASS

Run: `npx vitest run tests/integration/titles.test.ts`
Expected: PASS, if a live `DATABASE_URL` is reachable; otherwise a DB-connectivity error is accepted.

- [x] **Step 7: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 8: Commit**

```bash
git add src/server/titles.ts src/app/api/titles/route.ts "src/app/api/titles/[id]/regenerate/route.ts" tests/unit/titles.test.ts tests/integration/titles.test.ts
git commit -m "feat: wire target language into SEO Titles generation"
```

---

## Task 5: Wire Target Language Into Description & Tags

**Files:**
- Modify: `src/server/descriptionTags.ts`
- Modify: `src/app/api/description-tags/route.ts`
- Modify: `src/app/api/description-tags/[id]/regenerate/route.ts`
- Modify: `tests/unit/descriptionTags.test.ts`
- Modify: `tests/integration/descriptionTags.test.ts`

- [x] **Step 1: Update `src/server/descriptionTags.ts`**

Change `DescriptionTagsGenerationInput`:

```ts
export interface DescriptionTagsGenerationInput {
  topic: string;
  targetLanguage: string;
  selectedTitle?: string | null;
  keywords?: string[] | null;
}
```

Update `buildDescriptionTagsPrompt`:

```ts
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

Write the description, tags, hashtags, and pinned comment in ${input.targetLanguage}. The "category" value must still be exactly one of the fixed English category names listed above, regardless of language.

Respond with ONLY a JSON object shaped like:
{"description": "...", "tags": ["...", ...], "hashtags": ["...", ...], "category": "...", "pinnedComment": "..."}

Do not include any text outside the JSON object.`;
}
```

Update `createDescriptionTagSetForIdeaOrTopic` and `regenerateDescriptionTagSet`:

```ts
export async function createDescriptionTagSetForIdeaOrTopic(
  projectId: string,
  ideaId: string | null,
  topic: string,
  targetLanguage: string
) {
  if (ideaId) {
    const existing = await prisma.descriptionTagSet.findUnique({ where: { ideaId } });
    if (existing) {
      return { descriptionTagSet: existing, created: false };
    }
  }

  const { selectedTitle, keywords } = await fetchTitleSetContext(ideaId);

  const llm = getLlmClient();
  const raw = await llm.generateText(buildDescriptionTagsPrompt({ topic, selectedTitle, keywords, targetLanguage }));
  const generated = parseDescriptionTagsResponse(raw);

  const descriptionTagSet = await prisma.descriptionTagSet.create({
    data: {
      projectId,
      ideaId,
      topic,
      description: generated.description,
      tags: generated.tags,
      hashtags: generated.hashtags,
      category: generated.category,
      pinnedComment: generated.pinnedComment,
    },
  });

  return { descriptionTagSet, created: true };
}

export async function regenerateDescriptionTagSet(descriptionTagSetId: string, targetLanguage: string) {
  const existing = await prisma.descriptionTagSet.findUniqueOrThrow({ where: { id: descriptionTagSetId } });

  const { selectedTitle, keywords } = await fetchTitleSetContext(existing.ideaId);

  const llm = getLlmClient();
  const raw = await llm.generateText(
    buildDescriptionTagsPrompt({ topic: existing.topic, selectedTitle, keywords, targetLanguage })
  );
  const generated = parseDescriptionTagsResponse(raw);

  return prisma.descriptionTagSet.update({
    where: { id: descriptionTagSetId },
    data: {
      description: generated.description,
      tags: generated.tags,
      hashtags: generated.hashtags,
      category: generated.category,
      pinnedComment: generated.pinnedComment,
    },
  });
}
```

- [x] **Step 2: Update `src/app/api/description-tags/route.ts`**

Add `include: { settings: true }` (this route doesn't fetch settings today), import the helper, and pass the language:

```ts
import { resolveLanguageName } from "@/lib/language";
```

```ts
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { settings: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
```

```ts
  let result;
  try {
    const targetLanguage = resolveLanguageName(project.settings?.targetLanguage);
    result = await createDescriptionTagSetForIdeaOrTopic(projectId, resolvedIdeaId, topic, targetLanguage);
  } catch (error) {
    console.error("Failed to generate description & tags set:", error);
    return NextResponse.json({ error: "Failed to generate metadata. Please try again." }, { status: 502 });
  }
```

- [x] **Step 3: Update `src/app/api/description-tags/[id]/regenerate/route.ts`**

Add `include: { project: { include: { settings: true } } }` to the row lookup (this route doesn't fetch it today), import the helper, and pass the language:

```ts
import { resolveLanguageName } from "@/lib/language";
```

```ts
  const descriptionTagSet = await prisma.descriptionTagSet.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
    include: { project: { include: { settings: true } } },
  });
  if (!descriptionTagSet) {
    return NextResponse.json({ error: "Description & tags set not found" }, { status: 404 });
  }

  try {
    const targetLanguage = resolveLanguageName(descriptionTagSet.project.settings?.targetLanguage);
    const updated = await regenerateDescriptionTagSet(params.id, targetLanguage);
    return NextResponse.json({ descriptionTagSet: updated });
  } catch (error) {
    console.error("Failed to regenerate description & tags set:", error);
    return NextResponse.json({ error: "Failed to regenerate metadata. Please try again." }, { status: 502 });
  }
```

- [x] **Step 4: Update `tests/unit/descriptionTags.test.ts`**

Add `targetLanguage: "English"` to every existing `buildDescriptionTagsPrompt(...)` call, and one new test. Replace `describe("buildDescriptionTagsPrompt", ...)` with:

```ts
describe("buildDescriptionTagsPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildDescriptionTagsPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "English" });
    expect(prompt).toContain("Home coffee brewing mistakes");
  });

  it("includes the selected title when provided", () => {
    const prompt = buildDescriptionTagsPrompt({
      topic: "Home coffee brewing mistakes",
      targetLanguage: "English",
      selectedTitle: "5 Coffee Brewing Mistakes You're Making",
    });
    expect(prompt).toContain("5 Coffee Brewing Mistakes You're Making");
  });

  it("includes keywords when provided", () => {
    const prompt = buildDescriptionTagsPrompt({
      topic: "Home coffee brewing mistakes",
      targetLanguage: "English",
      keywords: ["coffee brewing", "espresso tips"],
    });
    expect(prompt).toContain("coffee brewing");
    expect(prompt).toContain("espresso tips");
  });

  it("omits title and keyword context sections when not provided", () => {
    const prompt = buildDescriptionTagsPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "English" });
    expect(prompt).not.toContain("already chosen this title");
    expect(prompt).not.toContain("already researched for this video's SEO");
  });

  it("includes a language instruction for the given target language", () => {
    const prompt = buildDescriptionTagsPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "Arabic" });
    expect(prompt).toContain("Arabic");
  });
});
```

- [x] **Step 5: Update `tests/integration/descriptionTags.test.ts`**

This file already uses `const generateText = vi.fn(async (_prompt: string) => ...)`. Add `"English"` as the trailing argument to every existing `createDescriptionTagSetForIdeaOrTopic(...)` call, and add:

```ts
  it("passes the target language into the prompt sent to the LLM", async () => {
    const user = await prisma.user.create({ data: { email: "creator-lang@example.com", name: "Creator Lang" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel Lang", isActive: true, settings: { create: {} } },
    });

    await createDescriptionTagSetForIdeaOrTopic(project.id, null, "Home coffee brewing mistakes", "French");

    const promptSent = generateText.mock.calls[generateText.mock.calls.length - 1][0] as string;
    expect(promptSent).toContain("French");
  });
```

- [x] **Step 6: Run tests**

Run: `npx vitest run tests/unit/descriptionTags.test.ts`
Expected: PASS

Run: `npx vitest run tests/integration/descriptionTags.test.ts`
Expected: PASS, if a live `DATABASE_URL` is reachable; otherwise a DB-connectivity error is accepted.

- [x] **Step 7: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 8: Commit**

```bash
git add src/server/descriptionTags.ts src/app/api/description-tags/route.ts "src/app/api/description-tags/[id]/regenerate/route.ts" tests/unit/descriptionTags.test.ts tests/integration/descriptionTags.test.ts
git commit -m "feat: wire target language into Description & Tags generation"
```

---

## Task 6: Wire Target Language Into Multi-Platform Shorts

**Files:**
- Modify: `src/server/platformVariants.ts`
- Modify: `src/app/api/platform-variants/route.ts`
- Modify: `src/app/api/platform-variants/[id]/regenerate/route.ts`
- Modify: `tests/unit/platformVariants.test.ts`
- Modify: `tests/integration/platformVariants.test.ts`

- [x] **Step 1: Update `src/server/platformVariants.ts`**

Update `buildPlatformVariantsPrompt` and `buildSinglePlatformVariantPrompt` to accept `targetLanguage` as part of their input, and append the instruction. Replace both functions:

```ts
export function buildPlatformVariantsPrompt(
  input: { topic: string; targetLanguage: string } & WorkflowContext
): string {
  const contextBlock = buildContextBlock(input);

  return `You are a short-form content strategist repurposing a long-form video concept about:
"${input.topic}"${contextBlock}

Generate a distinct short-form variant for EACH of these 4 platforms. Each platform's hook (the first 5 seconds) and tone must be genuinely different from the others — this is critical anti-duplication/anti-shadowban logic, not a stylistic preference:

- ${PLATFORM_TONE.TIKTOK}
- ${PLATFORM_TONE.YOUTUBE_SHORTS}
- ${PLATFORM_TONE.INSTAGRAM_REELS}
- ${PLATFORM_TONE.FACEBOOK_REELS}

For each platform, provide a "hook" (the opening line, first 5 seconds), a "caption" (the post caption/description), and "hashtags" (a small relevant set). For Instagram Reels ONLY, also provide a "coverImagePrompt": a text-to-image prompt describing a still cover frame for the reel.

Write the hook, caption, and hashtags for every platform in ${input.targetLanguage}. The "coverImagePrompt" for Instagram Reels must stay in English regardless, since it's an image-generation instruction, not visible text.

Respond with ONLY a JSON object shaped like:
{
  "tiktok": {"hook": "...", "caption": "...", "hashtags": ["...", ...]},
  "youtubeShorts": {"hook": "...", "caption": "...", "hashtags": ["...", ...]},
  "instagramReels": {"hook": "...", "caption": "...", "hashtags": ["...", ...], "coverImagePrompt": "..."},
  "facebookReels": {"hook": "...", "caption": "...", "hashtags": ["...", ...]}
}

Do not include any text outside the JSON object.`;
}
```

```ts
export function buildSinglePlatformVariantPrompt(
  platform: Platform,
  input: { topic: string; targetLanguage: string } & WorkflowContext
): string {
  const contextBlock = buildContextBlock(input);
  const coverImageInstruction =
    platform === "INSTAGRAM_REELS"
      ? ` Also provide a "coverImagePrompt": a text-to-image prompt describing a still cover frame for the reel (keep this in English regardless of the target language below, since it's an image-generation instruction, not visible text).`
      : "";
  const responseShape =
    platform === "INSTAGRAM_REELS"
      ? `{"hook": "...", "caption": "...", "hashtags": ["...", ...], "coverImagePrompt": "..."}`
      : `{"hook": "...", "caption": "...", "hashtags": ["...", ...]}`;

  return `You are a short-form content strategist repurposing a long-form video concept about:
"${input.topic}"${contextBlock}

Generate a short-form variant for this platform only: ${PLATFORM_TONE[platform]}

Provide a "hook" (the opening line, first 5 seconds), a "caption" (the post caption/description), and "hashtags" (a small relevant set).${coverImageInstruction}

Write the hook, caption, and hashtags in ${input.targetLanguage}.

Respond with ONLY a JSON object shaped like:
${responseShape}

Do not include any text outside the JSON object.`;
}
```

Update `createPlatformVariantsForIdeaOrTopic` and `regeneratePlatformVariant`:

```ts
export async function createPlatformVariantsForIdeaOrTopic(
  projectId: string,
  ideaId: string | null,
  topic: string,
  targetLanguage: string
) {
  if (ideaId) {
    const existing = await prisma.platformVariant.findMany({ where: { ideaId } });
    if (existing.length > 0) {
      return { platformVariants: existing, created: false };
    }
  }

  const context = await fetchWorkflowContext(ideaId);
  const llm = getLlmClient();
  const raw = await llm.generateText(buildPlatformVariantsPrompt({ topic, targetLanguage, ...context }));
  const generated = parsePlatformVariantsResponse(raw);

  const { url: coverImageUrl } = await generateImage(generated.instagramReels.coverImagePrompt);

  const dataByPlatform: Record<Platform, GeneratedVariant> = {
    TIKTOK: generated.tiktok,
    YOUTUBE_SHORTS: generated.youtubeShorts,
    INSTAGRAM_REELS: generated.instagramReels,
    FACEBOOK_REELS: generated.facebookReels,
  };

  const platformVariants = await prisma.$transaction(
    PLATFORM_ORDER.map((platform) =>
      prisma.platformVariant.create({
        data: {
          projectId,
          ideaId,
          platform,
          topic,
          hook: dataByPlatform[platform].hook,
          caption: dataByPlatform[platform].caption,
          hashtags: dataByPlatform[platform].hashtags,
          coverImagePrompt: platform === "INSTAGRAM_REELS" ? generated.instagramReels.coverImagePrompt : null,
          coverImageUrl: platform === "INSTAGRAM_REELS" ? coverImageUrl : null,
        },
      })
    )
  );

  return { platformVariants, created: true };
}

export async function regeneratePlatformVariant(variantId: string, targetLanguage: string) {
  const existing = await prisma.platformVariant.findUniqueOrThrow({ where: { id: variantId } });

  const context = await fetchWorkflowContext(existing.ideaId);
  const llm = getLlmClient();
  const raw = await llm.generateText(
    buildSinglePlatformVariantPrompt(existing.platform, { topic: existing.topic, targetLanguage, ...context })
  );
  const generated = parseSinglePlatformVariantResponse(raw, existing.platform);

  let coverImagePrompt = existing.coverImagePrompt;
  let coverImageUrl = existing.coverImageUrl;
  if (existing.platform === "INSTAGRAM_REELS" && generated.coverImagePrompt) {
    coverImagePrompt = generated.coverImagePrompt;
    const result = await generateImage(generated.coverImagePrompt);
    coverImageUrl = result.url;
  }

  return prisma.platformVariant.update({
    where: { id: variantId },
    data: {
      hook: generated.hook,
      caption: generated.caption,
      hashtags: generated.hashtags,
      coverImagePrompt,
      coverImageUrl,
    },
  });
}
```

- [x] **Step 2: Update `src/app/api/platform-variants/route.ts`**

Add `include: { settings: true }` (this route doesn't fetch settings today):

```ts
import { resolveLanguageName } from "@/lib/language";
```

```ts
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { settings: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
```

```ts
  let result;
  try {
    const targetLanguage = resolveLanguageName(project.settings?.targetLanguage);
    result = await createPlatformVariantsForIdeaOrTopic(projectId, resolvedIdeaId, topic, targetLanguage);
  } catch (error) {
    console.error("Failed to generate platform variants:", error);
    return NextResponse.json({ error: "Failed to generate shorts. Please try again." }, { status: 502 });
  }
```

- [x] **Step 3: Update `src/app/api/platform-variants/[id]/regenerate/route.ts`**

Add `include: { project: { include: { settings: true } } }` (this route doesn't fetch it today):

```ts
import { resolveLanguageName } from "@/lib/language";
```

```ts
  const platformVariant = await prisma.platformVariant.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
    include: { project: { include: { settings: true } } },
  });
  if (!platformVariant) {
    return NextResponse.json({ error: "Platform variant not found" }, { status: 404 });
  }

  try {
    const targetLanguage = resolveLanguageName(platformVariant.project.settings?.targetLanguage);
    const updated = await regeneratePlatformVariant(params.id, targetLanguage);
    return NextResponse.json({ platformVariant: updated });
  } catch (error) {
    console.error("Failed to regenerate platform variant:", error);
    return NextResponse.json({ error: "Failed to regenerate this variant. Please try again." }, { status: 502 });
  }
```

- [x] **Step 4: Update `tests/unit/platformVariants.test.ts`**

Add `targetLanguage: "English"` to every existing `buildPlatformVariantsPrompt(...)` and `buildSinglePlatformVariantPrompt(...)` call. Add these two new tests inside their respective existing `describe` blocks (append, don't remove anything):

```ts
  it("includes a language instruction for the given target language", () => {
    const prompt = buildPlatformVariantsPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "Arabic" });
    expect(prompt).toContain("Arabic");
  });
```

(add inside `describe("buildPlatformVariantsPrompt", ...)`)

```ts
  it("includes a language instruction for the given target language", () => {
    const prompt = buildSinglePlatformVariantPrompt("TIKTOK", { topic: "Home coffee brewing mistakes", targetLanguage: "French" });
    expect(prompt).toContain("French");
  });
```

(add inside `describe("buildSinglePlatformVariantPrompt", ...)`)

- [x] **Step 5: Update `tests/integration/platformVariants.test.ts`**

This file already uses `const generateText = vi.fn(async (_prompt: string) => ...)`. Add `"English"` as the trailing argument to every existing `createPlatformVariantsForIdeaOrTopic(...)` call, and add:

```ts
  it("passes the target language into the prompt sent to the LLM", async () => {
    const user = await prisma.user.create({ data: { email: "creator-lang@example.com", name: "Creator Lang" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel Lang", isActive: true, settings: { create: {} } },
    });

    await createPlatformVariantsForIdeaOrTopic(project.id, null, "Home coffee brewing mistakes", "French");

    const briefPromptCalls = generateText.mock.calls.map((call) => call[0] as string);
    expect(briefPromptCalls.some((p) => p.includes("French"))).toBe(true);
  });
```

- [x] **Step 6: Run tests**

Run: `npx vitest run tests/unit/platformVariants.test.ts`
Expected: PASS

Run: `npx vitest run tests/integration/platformVariants.test.ts`
Expected: PASS, if a live `DATABASE_URL` is reachable; otherwise a DB-connectivity error is accepted.

- [x] **Step 7: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 8: Commit**

```bash
git add src/server/platformVariants.ts src/app/api/platform-variants/route.ts "src/app/api/platform-variants/[id]/regenerate/route.ts" tests/unit/platformVariants.test.ts tests/integration/platformVariants.test.ts
git commit -m "feat: wire target language into Multi-Platform Shorts generation"
```

---

## Task 7: Wire Target Language Into Thumbnail Studio (thumbnailText Only)

**Files:**
- Modify: `src/server/thumbnails.ts`
- Modify: `src/app/api/thumbnails/route.ts`
- Modify: `tests/unit/thumbnails.test.ts`
- Modify: `tests/integration/thumbnails.test.ts`

- [x] **Step 1: Update `src/server/thumbnails.ts`**

Add `targetLanguage` to `ThumbnailBriefInput`:

```ts
export interface ThumbnailBriefInput {
  topic: string;
  variationHint: string;
  targetLanguage: string;
  ideaTitle?: string | null;
  scriptHook?: string | null;
  selectedTitle?: string | null;
}
```

In `buildThumbnailBriefPrompt`, replace the just-shipped topic-language-inference sentence with the explicit `targetLanguage`. Find this exact current line:

```ts
"compositionPattern" must be a short restatement of which of the 4 composition patterns above you chose (matching the one given in "For THIS thumbnail specifically" above). "thumbnailText" is the exact bold on-thumbnail text (short, punchy, e.g. "$12 → $1,000") — write it in the SAME language as the TOPIC below (e.g. Arabic topic → Arabic thumbnailText, French topic → French thumbnailText), not translated to English. "negativePrompt" is a comma-separated list of things to avoid in the image (e.g. "blurry, low quality, watermark, logo, illustration, cartoon, extra hands, extra fingers, duplicate people, cropped face, noise").
```

Replace it with:

```ts
"compositionPattern" must be a short restatement of which of the 4 composition patterns above you chose (matching the one given in "For THIS thumbnail specifically" above). "thumbnailText" is the exact bold on-thumbnail text (short, punchy, e.g. "$12 → $1,000") — write it in ${input.targetLanguage}. All other fields (niche, story, person, emotion, before, after, object, background, color, negativePrompt) must stay in English regardless, since they describe the image-generation scene, not visible text. "negativePrompt" is a comma-separated list of things to avoid in the image (e.g. "blurry, low quality, watermark, logo, illustration, cartoon, extra hands, extra fingers, duplicate people, cropped face, noise").
```

Update `createThumbnailsForProject` to accept and thread `targetLanguage` (added as a trailing parameter, passed into the per-variant brief call):

```ts
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
```

- [x] **Step 2: Update `src/app/api/thumbnails/route.ts`**

Add `include: { settings: true }` (this route doesn't fetch settings today):

```ts
import { resolveLanguageName } from "@/lib/language";
```

```ts
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { settings: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
```

```ts
  let thumbnails;
  try {
    const targetLanguage = resolveLanguageName(project.settings?.targetLanguage);
    thumbnails = await createThumbnailsForProject(projectId, resolvedIdeaId, { prompt, mode }, targetLanguage);
  } catch (error) {
    console.error("Failed to generate thumbnails:", error);
    return NextResponse.json({ error: "Failed to generate thumbnails. Please try again." }, { status: 502 });
  }
```

- [x] **Step 3: Update `tests/unit/thumbnails.test.ts`**

Every existing `buildThumbnailBriefPrompt(...)` call needs a `targetLanguage: "English"` field added. Find the existing test that currently reads:

```ts
  it("instructs thumbnailText to match the topic's language", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0] });
    expect(prompt).toContain("write it in the SAME language as the TOPIC");
  });
```

Replace that whole test (its premise — topic-language inference — no longer applies) with:

```ts
  it("instructs thumbnailText to be written in the given target language", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0], targetLanguage: "Arabic" });
    expect(prompt).toContain("write it in Arabic");
  });

  it("instructs all other brief fields to stay in English regardless of target language", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0], targetLanguage: "Arabic" });
    expect(prompt).toContain("must stay in English regardless");
  });
```

Add `targetLanguage: "English"` to every other existing `buildThumbnailBriefPrompt(...)` call in the file (the "includes the topic", "includes the designer-principles boilerplate", "includes the given variation hint", "includes idea/script/title context when provided", "omits context sections when not provided", and "exports exactly 4 variation hints" tests).

- [x] **Step 4: Update `tests/integration/thumbnails.test.ts`**

Add `"English"` as the trailing argument to every existing `createThumbnailsForProject(...)` call (matching the new signature: `createThumbnailsForProject(projectId, ideaId, input, targetLanguage)`), and add:

```ts
  it("passes the target language into the brief prompt sent to the LLM", async () => {
    const user = await prisma.user.create({ data: { email: "creator-lang@example.com", name: "Creator Lang" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel Lang", isActive: true, settings: { create: {} } },
    });

    await createThumbnailsForProject(project.id, null, { prompt: "a red espresso cup", mode: "single" }, "French");

    const briefPromptCalls = generateText.mock.calls
      .map((call) => call[0] as string)
      .filter((prompt) => !prompt.includes("ctrEstimate"));
    expect(briefPromptCalls.some((p) => p.includes("write it in French"))).toBe(true);
  });
```

- [x] **Step 5: Run tests**

Run: `npx vitest run tests/unit/thumbnails.test.ts`
Expected: PASS

Run: `npx vitest run tests/integration/thumbnails.test.ts`
Expected: PASS, if a live `DATABASE_URL` is reachable; otherwise a DB-connectivity error is accepted.

- [x] **Step 6: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 7: Commit**

```bash
git add src/server/thumbnails.ts src/app/api/thumbnails/route.ts tests/unit/thumbnails.test.ts tests/integration/thumbnails.test.ts
git commit -m "feat: wire target language into Thumbnail Studio (thumbnailText only)"
```

---

## Task 8: Final Verification

- [x] **Step 1: Run the full unit test suite (named files only, never the bare `npm test`)**

Run: `npx vitest run tests/unit`
Expected: all unit test files pass, including `tests/unit/language.test.ts` and every module's updated tests.

- [x] **Step 2: Run every integration test file individually**

Run each of these separately (never combine into an unscoped `vitest run`):
```
npx vitest run tests/integration/ideas.test.ts
npx vitest run tests/integration/scripts.test.ts
npx vitest run tests/integration/titles.test.ts
npx vitest run tests/integration/descriptionTags.test.ts
npx vitest run tests/integration/platformVariants.test.ts
npx vitest run tests/integration/thumbnails.test.ts
```
Expected: all PASS if a live, safe-to-use `DATABASE_URL` is available; otherwise DB-connectivity errors are an accepted outcome — do NOT run the bare `npm test` to "double check".

- [x] **Step 3: Run a full production build**

Run: `npm run build`
Expected: succeeds — no route/page changes expected in this plan, this confirms every route file's new `resolveLanguageName` import and every server function's new `targetLanguage` parameter type-check correctly together.

- [x] **Step 4: Run `npx tsc --noEmit` across the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [x] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: target language wiring verification pass"
```

(Only run this if Steps 1-4 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** shared helper (Task 1), all 6 modules wired (Tasks 2-7) with route-level `settings` fetching added everywhere it was missing (Scripts POST+regenerate, Description & Tags POST+regenerate, Multi-Platform Shorts POST+regenerate, Thumbnail Studio POST), the Thumbnail Studio exception (only `thumbnailText` follows `targetLanguage`, replacing the prior topic-inference sentence) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO markers.
- **Type consistency:** every orchestration function gains exactly one new trailing `targetLanguage: string` parameter, matching the exact call-site updates shown in each task's route-file and test-file changes. `resolveLanguageName`'s return type (`string`, never `null`) matches every prompt builder's `targetLanguage: string` (non-optional) field — no module needs to null-check it.
- **Existing-test-call updates:** every task explicitly calls out that pre-existing test calls to a changed function need `targetLanguage: "English"` (unit) or `"English"` as a trailing arg (integration) added, so the plan doesn't silently leave stale, now-uncompilable test code for the executor to discover on their own.
- **Standing safety instruction:** every test-running step in this plan specifies an exact file path for `vitest run` and never the bare `npm test`.
