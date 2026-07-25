# ArwaTube AI Engine — Multi-Platform Repurposing Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Multi-Platform Repurposing Engine: a `PlatformVariant` Prisma model (one row per platform per idea/topic), business logic to generate all 4 platform variants (TikTok, YouTube Shorts, Instagram Reels, Facebook Reels) in one Claude call plus regenerate any single platform independently, an Instagram cover image via Higgsfield, four API routes, and a real `/multi-platform-shorts` page replacing its Phase 1 placeholder.

**Architecture:** `src/server/platformVariants.ts` holds all testable business logic (prompt building, response parsing, generation orchestration), mirroring `src/server/descriptionTags.ts`. Unlike prior modules (one row per idea), this is one row per platform per idea via a compound unique `(ideaId, platform)`, enabling independent per-platform regeneration. Initial generation is one combined Claude call covering all 4 platforms at once (so the model can genuinely differentiate hook/tone per platform); regeneration is a separate single-platform prompt/parse pair. The page renders 4 independent cards, each holding its own local state object, reusing the existing `EditableChipList` component for hashtags.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Claude API (via `lib/llm`), Higgsfield image generation (via `lib/higgsfield`), Zustand, Vitest.

---

## File Structure

```
prisma/
  schema.prisma                          (MODIFY: add RepurposePlatform enum, PlatformVariant model, relations)

src/
  server/
    platformVariants.ts                   (NEW: prompt/parse/orchestration logic)
  components/
    platformVariants/
      PlatformVariantCard.tsx              (NEW: one platform's editable card, reuses EditableChipList)
  app/
    api/
      platform-variants/
        route.ts                           (NEW: POST + GET)
        [id]/
          route.ts                          (NEW: PATCH)
          regenerate/
            route.ts                         (NEW: POST)
    (app)/
      multi-platform-shorts/
        page.tsx                             (MODIFY: replace placeholder)

tests/
  unit/
    platformVariants.test.ts                (NEW: pure-function tests)
  integration/
    platformVariants.test.ts                (NEW: createPlatformVariantsForIdeaOrTopic against a real DB, lib/llm and lib/higgsfield mocked)
```

**IMPORTANT — do not run the full test suite against a live database.** Every task in this plan that runs tests specifies an exact `npx vitest run <specific file>` command — **never run the bare `npm test` or `npx vitest run` with no path argument**. If a `DATABASE_URL` happens to be absent or unreachable in the implementation worktree, integration tests failing with a connectivity error is an accepted, expected outcome — not a task failure.

---

## Task 1: Prisma Schema — `RepurposePlatform` Enum & `PlatformVariant` Model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `RepurposePlatform` enum**

Add this enum near the other enums at the top of the file (after `ScriptTone`):

```prisma
enum RepurposePlatform {
  TIKTOK
  YOUTUBE_SHORTS
  INSTAGRAM_REELS
  FACEBOOK_REELS
}
```

- [ ] **Step 2: Add the `PlatformVariant` model**

Add this model anywhere at the top level (e.g. after the existing `DescriptionTagSet` model):

```prisma
model PlatformVariant {
  id        String            @id @default(cuid())
  projectId String
  project   Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  ideaId    String?
  idea      Idea?             @relation(fields: [ideaId], references: [id], onDelete: SetNull)
  platform  RepurposePlatform

  topic            String
  hook             String
  caption          String
  hashtags         String[]
  coverImagePrompt String?
  coverImageUrl    String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([ideaId, platform])
}
```

Note this is deliberately **not** a nullable-unique `ideaId` like `TitleSet`/`DescriptionTagSet` — `ideaId` alone is not unique, only the combination `(ideaId, platform)` is, since up to 4 rows (one per platform) share the same `ideaId`.

- [ ] **Step 3: Add the relation fields on `Project` and `Idea`**

Find the `Project` model and add a `platformVariants PlatformVariant[]` line alongside its other relation fields (next to `descriptionTagSets DescriptionTagSet[]`):

```prisma
  titleSets          TitleSet[]
  descriptionTagSets DescriptionTagSet[]
  platformVariants   PlatformVariant[]
```

Find the `Idea` model and add a `platformVariants PlatformVariant[]` line (plural — unlike `titleSet TitleSet?`/`descriptionTagSet DescriptionTagSet?`, since one idea now has up to 4 of these rows, not a 1:1 relation), next to `descriptionTagSet DescriptionTagSet?`:

```prisma
  titleSet          TitleSet?
  descriptionTagSet DescriptionTagSet?
  platformVariants  PlatformVariant[]
```

- [ ] **Step 4: Format and regenerate**

Run: `npx prisma format`
Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors. This does not require a live database connection.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add RepurposePlatform enum and PlatformVariant model to Prisma schema"
```

---

## Task 2: Platform Variants Business Logic — Prompt Building & Response Parsing

**Files:**
- Create: `src/server/platformVariants.ts`
- Test: `tests/unit/platformVariants.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/platformVariants.test.ts
import { describe, it, expect } from "vitest";
import {
  buildPlatformVariantsPrompt,
  parsePlatformVariantsResponse,
  buildSinglePlatformVariantPrompt,
  parseSinglePlatformVariantResponse,
} from "@/server/platformVariants";

const validVariant = (extra: Record<string, unknown> = {}) => ({
  hook: "Stop brewing your coffee wrong",
  caption: "5 mistakes killing your morning brew. Full breakdown below.",
  hashtags: ["#coffee", "#espresso"],
  ...extra,
});

const validAllPlatforms = {
  tiktok: validVariant(),
  youtubeShorts: validVariant(),
  instagramReels: validVariant({ coverImagePrompt: "A steaming espresso cup on a marble counter, morning light" }),
  facebookReels: validVariant(),
};

describe("buildPlatformVariantsPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildPlatformVariantsPrompt({ topic: "Home coffee brewing mistakes" });
    expect(prompt).toContain("Home coffee brewing mistakes");
  });

  it("includes script context when provided", () => {
    const prompt = buildPlatformVariantsPrompt({
      topic: "Home coffee brewing mistakes",
      scriptHook: "Your coffee is probably wrong",
      scriptMainContent: "Most people over-extract their espresso...",
    });
    expect(prompt).toContain("Your coffee is probably wrong");
    expect(prompt).toContain("Most people over-extract their espresso...");
  });

  it("includes the selected title when provided", () => {
    const prompt = buildPlatformVariantsPrompt({
      topic: "Home coffee brewing mistakes",
      selectedTitle: "5 Coffee Brewing Mistakes You're Making",
    });
    expect(prompt).toContain("5 Coffee Brewing Mistakes You're Making");
  });

  it("includes hashtags when provided", () => {
    const prompt = buildPlatformVariantsPrompt({
      topic: "Home coffee brewing mistakes",
      hashtags: ["#coffee", "#espresso"],
    });
    expect(prompt).toContain("#coffee");
    expect(prompt).toContain("#espresso");
  });

  it("omits all context sections when not provided", () => {
    const prompt = buildPlatformVariantsPrompt({ topic: "Home coffee brewing mistakes" });
    expect(prompt).not.toContain("existing long-form script");
    expect(prompt).not.toContain("already chosen this title");
    expect(prompt).not.toContain("already researched for this video");
  });

  it("includes distinct anti-duplication tone instructions per platform", () => {
    const prompt = buildPlatformVariantsPrompt({ topic: "Home coffee brewing mistakes" });
    expect(prompt).toContain("pattern-interrupt");
    expect(prompt).toContain("value proposition");
    expect(prompt).toContain("curiosity-driven");
    expect(prompt).toContain("question-based");
  });
});

describe("parsePlatformVariantsResponse", () => {
  it("parses a plain JSON object", () => {
    const result = parsePlatformVariantsResponse(JSON.stringify(validAllPlatforms));
    expect(result).toEqual(validAllPlatforms);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify(validAllPlatforms) + "\n```";
    const result = parsePlatformVariantsResponse(raw);
    expect(result).toEqual(validAllPlatforms);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parsePlatformVariantsResponse("no json here")).toThrow();
  });

  it("throws when a platform key is missing", () => {
    const { facebookReels, ...invalid } = validAllPlatforms;
    expect(() => parsePlatformVariantsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when instagramReels is missing coverImagePrompt", () => {
    const invalid = { ...validAllPlatforms, instagramReels: validVariant() };
    expect(() => parsePlatformVariantsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when a platform's hashtags is not an array of strings", () => {
    const invalid = { ...validAllPlatforms, tiktok: validVariant({ hashtags: "not-an-array" }) };
    expect(() => parsePlatformVariantsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when a platform's hook is missing", () => {
    const invalid = { ...validAllPlatforms, youtubeShorts: validVariant({ hook: "" }) };
    expect(() => parsePlatformVariantsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parsePlatformVariantsResponse("{tiktok: unquoted}")).toThrow();
  });
});

describe("buildSinglePlatformVariantPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildSinglePlatformVariantPrompt("TIKTOK", { topic: "Home coffee brewing mistakes" });
    expect(prompt).toContain("Home coffee brewing mistakes");
  });

  it("includes only that platform's tone instruction", () => {
    const tiktokPrompt = buildSinglePlatformVariantPrompt("TIKTOK", { topic: "Home coffee brewing mistakes" });
    expect(tiktokPrompt).toContain("pattern-interrupt");
    expect(tiktokPrompt).not.toContain("value proposition");
    expect(tiktokPrompt).not.toContain("curiosity-driven");
    expect(tiktokPrompt).not.toContain("question-based");
  });

  it("requests coverImagePrompt only for INSTAGRAM_REELS", () => {
    const instagramPrompt = buildSinglePlatformVariantPrompt("INSTAGRAM_REELS", { topic: "Home coffee brewing mistakes" });
    const tiktokPrompt = buildSinglePlatformVariantPrompt("TIKTOK", { topic: "Home coffee brewing mistakes" });
    expect(instagramPrompt).toContain("coverImagePrompt");
    expect(tiktokPrompt).not.toContain("coverImagePrompt");
  });

  it("includes context when provided", () => {
    const prompt = buildSinglePlatformVariantPrompt("FACEBOOK_REELS", {
      topic: "Home coffee brewing mistakes",
      selectedTitle: "5 Coffee Brewing Mistakes You're Making",
      hashtags: ["#coffee"],
    });
    expect(prompt).toContain("5 Coffee Brewing Mistakes You're Making");
    expect(prompt).toContain("#coffee");
  });
});

describe("parseSinglePlatformVariantResponse", () => {
  it("parses a valid TIKTOK response with no coverImagePrompt required", () => {
    const result = parseSinglePlatformVariantResponse(JSON.stringify(validVariant()), "TIKTOK");
    expect(result.hook).toBe("Stop brewing your coffee wrong");
    expect(result.hashtags).toEqual(["#coffee", "#espresso"]);
  });

  it("parses a valid INSTAGRAM_REELS response with coverImagePrompt", () => {
    const response = validVariant({ coverImagePrompt: "A steaming espresso cup on a marble counter" });
    const result = parseSinglePlatformVariantResponse(JSON.stringify(response), "INSTAGRAM_REELS");
    expect(result.coverImagePrompt).toBe("A steaming espresso cup on a marble counter");
  });

  it("throws when INSTAGRAM_REELS response is missing coverImagePrompt", () => {
    expect(() => parseSinglePlatformVariantResponse(JSON.stringify(validVariant()), "INSTAGRAM_REELS")).toThrow();
  });

  it("throws when hook is missing", () => {
    const invalid = validVariant({ hook: "" });
    expect(() => parseSinglePlatformVariantResponse(JSON.stringify(invalid), "TIKTOK")).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parseSinglePlatformVariantResponse("{hook: unquoted}", "TIKTOK")).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/platformVariants.test.ts`
Expected: FAIL — `Cannot find module '@/server/platformVariants'`

- [ ] **Step 3: Create `src/server/platformVariants.ts`** (full file for this task — Task 3 will extend it)

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/platformVariants.test.ts`
Expected: PASS (21 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/platformVariants.ts tests/unit/platformVariants.test.ts
git commit -m "feat: add platform variants prompt-building and response-parsing logic"
```

---

## Task 3: Platform Variants Generation & Regeneration Orchestration

**Files:**
- Modify: `src/server/platformVariants.ts`
- Test: `tests/integration/platformVariants.test.ts`

This requires a live Postgres database to actually run. If no `DATABASE_URL` is reachable, write the code and test exactly as specified, verify via `npx tsc --noEmit`, and note in your report that live execution is deferred. **Do not run the bare `npm test` command in this task — only `npx vitest run tests/integration/platformVariants.test.ts` as shown below.**

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/platformVariants.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const generateText = vi.fn(async (_prompt: string) =>
  JSON.stringify({
    tiktok: { hook: "Stop brewing your coffee wrong", caption: "5 mistakes. Full breakdown below.", hashtags: ["#coffee"] },
    youtubeShorts: { hook: "Fix these 5 coffee mistakes", caption: "Better coffee starts here.", hashtags: ["#coffee"] },
    instagramReels: {
      hook: "The espresso shot everyone gets wrong",
      caption: "Slow down your morning ritual.",
      hashtags: ["#coffee"],
      coverImagePrompt: "A steaming espresso cup on a marble counter, morning light",
    },
    facebookReels: { hook: "Ever wonder why your coffee tastes off?", caption: "5 fixes inside.", hashtags: ["#coffee"] },
  })
);

vi.mock("@/lib/llm", () => ({
  getLlmClient: () => ({ generateText }),
}));

const generateImage = vi.fn(async (_prompt: string) => ({ url: "https://cdn.example.com/cover.png" }));

vi.mock("@/lib/higgsfield", () => ({
  generateImage,
}));

import { createPlatformVariantsForIdeaOrTopic } from "@/server/platformVariants";

describe("createPlatformVariantsForIdeaOrTopic", () => {
  beforeEach(async () => {
    generateText.mockClear();
    generateImage.mockClear();
    await prisma.platformVariant.deleteMany();
    await prisma.descriptionTagSet.deleteMany();
    await prisma.titleSet.deleteMany();
    await prisma.script.deleteMany();
    await prisma.thumbnail.deleteMany();
    await prisma.idea.deleteMany();
    await prisma.projectSettings.deleteMany();
    await prisma.project.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("generates and persists 4 platform rows when no ideaId is given", async () => {
    const user = await prisma.user.create({ data: { email: "creator@example.com", name: "Creator" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel", isActive: true, settings: { create: {} } },
    });

    const result = await createPlatformVariantsForIdeaOrTopic(project.id, null, "Home coffee brewing mistakes");

    expect(result.created).toBe(true);
    expect(result.platformVariants).toHaveLength(4);
    const platforms = result.platformVariants.map((v) => v.platform).sort();
    expect(platforms).toEqual(["FACEBOOK_REELS", "INSTAGRAM_REELS", "TIKTOK", "YOUTUBE_SHORTS"]);

    const instagram = result.platformVariants.find((v) => v.platform === "INSTAGRAM_REELS")!;
    expect(instagram.coverImageUrl).toBe("https://cdn.example.com/cover.png");
    expect(instagram.coverImagePrompt).toBe("A steaming espresso cup on a marble counter, morning light");

    const tiktok = result.platformVariants.find((v) => v.platform === "TIKTOK")!;
    expect(tiktok.coverImageUrl).toBeNull();
    expect(tiktok.coverImagePrompt).toBeNull();

    expect(generateImage).toHaveBeenCalledTimes(1);

    const stored = await prisma.platformVariant.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(4);
  });

  it("returns the existing variants for an idea instead of generating new ones", async () => {
    const user = await prisma.user.create({ data: { email: "creator2@example.com", name: "Creator Two" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel 2", isActive: true, settings: { create: {} } },
    });
    const idea = await prisma.idea.create({
      data: {
        projectId: project.id,
        title: "5 Coffee Mistakes",
        description: "desc",
        hook: "hook",
        viralityScore: 80,
        scoreSource: "AI_ESTIMATE",
      },
    });

    const first = await createPlatformVariantsForIdeaOrTopic(project.id, idea.id, "5 Coffee Mistakes");
    const second = await createPlatformVariantsForIdeaOrTopic(project.id, idea.id, "5 Coffee Mistakes");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.platformVariants.map((v) => v.id).sort()).toEqual(first.platformVariants.map((v) => v.id).sort());
    expect(generateText).toHaveBeenCalledTimes(1);

    const stored = await prisma.platformVariant.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(4);
  });

  it("pulls the linked idea's Script/TitleSet/DescriptionTagSet context into the prompt", async () => {
    const user = await prisma.user.create({ data: { email: "creator3@example.com", name: "Creator Three" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel 3", isActive: true, settings: { create: {} } },
    });
    const idea = await prisma.idea.create({
      data: {
        projectId: project.id,
        title: "5 Coffee Mistakes",
        description: "desc",
        hook: "hook",
        viralityScore: 80,
        scoreSource: "AI_ESTIMATE",
      },
    });
    await prisma.script.create({
      data: {
        projectId: project.id,
        ideaId: idea.id,
        topic: "5 Coffee Mistakes",
        tone: "ENGAGING",
        hook: "Your coffee is probably wrong",
        intro: "intro",
        mainContent: "Most people over-extract their espresso",
        cta: "cta",
        ending: "ending",
      },
    });
    await prisma.titleSet.create({
      data: {
        projectId: project.id,
        ideaId: idea.id,
        topic: "5 Coffee Mistakes",
        titles: ["Stop Ruining Your Coffee"],
        keywords: ["coffee brewing"],
        selectedTitle: "Stop Ruining Your Coffee",
      },
    });
    await prisma.descriptionTagSet.create({
      data: {
        projectId: project.id,
        ideaId: idea.id,
        topic: "5 Coffee Mistakes",
        description: "description",
        tags: ["coffee brewing"],
        hashtags: ["#coffeehacks"],
        category: "Howto & Style",
        pinnedComment: "pinned",
      },
    });

    await createPlatformVariantsForIdeaOrTopic(project.id, idea.id, "5 Coffee Mistakes");

    expect(generateText).toHaveBeenCalledTimes(1);
    const promptSent = generateText.mock.calls[0][0] as string;
    expect(promptSent).toContain("Your coffee is probably wrong");
    expect(promptSent).toContain("Most people over-extract their espresso");
    expect(promptSent).toContain("Stop Ruining Your Coffee");
    expect(promptSent).toContain("#coffeehacks");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/platformVariants.test.ts`
Expected: FAIL — `Cannot find export 'createPlatformVariantsForIdeaOrTopic' from '@/server/platformVariants'` (or, if no DB is reachable, a DB-connectivity error at `beforeEach` instead — either is an acceptable "red" state given the environment constraint).

- [ ] **Step 3: Add `fetchWorkflowContext`, `createPlatformVariantsForIdeaOrTopic`, and `regeneratePlatformVariant` to `src/server/platformVariants.ts`**

Add these imports at the top of the file:

```ts
import { prisma } from "@/lib/prisma";
import { getLlmClient } from "@/lib/llm";
import { generateImage } from "@/lib/higgsfield";
```

Then append this to the end of the file (keep everything already in it from Task 2):

```ts
const PLATFORM_ORDER: Platform[] = ["TIKTOK", "YOUTUBE_SHORTS", "INSTAGRAM_REELS", "FACEBOOK_REELS"];

export async function fetchWorkflowContext(ideaId: string | null): Promise<WorkflowContext> {
  if (!ideaId) {
    return { scriptHook: null, scriptMainContent: null, selectedTitle: null, hashtags: null };
  }

  const [script, titleSet, descriptionTagSet] = await Promise.all([
    prisma.script.findUnique({ where: { ideaId } }),
    prisma.titleSet.findUnique({ where: { ideaId } }),
    prisma.descriptionTagSet.findUnique({ where: { ideaId } }),
  ]);

  return {
    scriptHook: script?.hook ?? null,
    scriptMainContent: script?.mainContent ?? null,
    selectedTitle: titleSet?.selectedTitle ?? null,
    hashtags: descriptionTagSet?.hashtags ?? null,
  };
}

export async function createPlatformVariantsForIdeaOrTopic(projectId: string, ideaId: string | null, topic: string) {
  if (ideaId) {
    const existing = await prisma.platformVariant.findMany({ where: { ideaId } });
    if (existing.length > 0) {
      return { platformVariants: existing, created: false };
    }
  }

  const context = await fetchWorkflowContext(ideaId);
  const llm = getLlmClient();
  const raw = await llm.generateText(buildPlatformVariantsPrompt({ topic, ...context }));
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

export async function regeneratePlatformVariant(variantId: string) {
  const existing = await prisma.platformVariant.findUniqueOrThrow({ where: { id: variantId } });

  const context = await fetchWorkflowContext(existing.ideaId);
  const llm = getLlmClient();
  const raw = await llm.generateText(
    buildSinglePlatformVariantPrompt(existing.platform, { topic: existing.topic, ...context })
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/platformVariants.test.ts`
Expected: PASS (3 tests), if a live `DATABASE_URL` is reachable and safe to use. If not, confirm the failure is a database-connectivity error, not a code/import error.

- [ ] **Step 5: Run `npx tsc --noEmit` regardless of DB availability**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/platformVariants.ts tests/integration/platformVariants.test.ts
git commit -m "feat: add platform variants generation and regeneration orchestration"
```

---

## Task 4: API Routes — `POST` / `GET /api/platform-variants`

**Files:**
- Create: `src/app/api/platform-variants/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/platform-variants/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPlatformVariantsForIdeaOrTopic } from "@/server/platformVariants";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, ideaId, topic } = await request.json();
  if (typeof projectId !== "string" || typeof topic !== "string") {
    return NextResponse.json({ error: "projectId and topic are required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // ideaId is optional context (pre-filled from Idea Finder); if the id
  // doesn't resolve to a real idea in this project, silently proceed
  // without it rather than failing the whole request.
  let resolvedIdeaId: string | null = null;
  if (typeof ideaId === "string") {
    const idea = await prisma.idea.findFirst({ where: { id: ideaId, projectId } });
    if (idea) {
      resolvedIdeaId = idea.id;
    }
  }

  let result;
  try {
    result = await createPlatformVariantsForIdeaOrTopic(projectId, resolvedIdeaId, topic);
  } catch (error) {
    console.error("Failed to generate platform variants:", error);
    return NextResponse.json({ error: "Failed to generate shorts. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ platformVariants: result.platformVariants }, { status: result.created ? 201 : 200 });
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const platformVariants = await prisma.platformVariant.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ platformVariants });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/platform-variants` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/platform-variants/route.ts
git commit -m "feat: add POST/GET /api/platform-variants routes"
```

---

## Task 5: API Route — `PATCH /api/platform-variants/:id`

**Files:**
- Create: `src/app/api/platform-variants/[id]/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/platform-variants/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STRING_FIELDS = ["hook", "caption"];
const ARRAY_FIELDS = ["hashtags"];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { field, value } = await request.json();

  if (STRING_FIELDS.includes(field)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return NextResponse.json({ error: "value must be a non-empty string for this field" }, { status: 400 });
    }
  } else if (ARRAY_FIELDS.includes(field)) {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      return NextResponse.json({ error: "value must be an array of strings for this field" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "A valid field is required" }, { status: 400 });
  }

  const platformVariant = await prisma.platformVariant.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!platformVariant) {
    return NextResponse.json({ error: "Platform variant not found" }, { status: 404 });
  }

  const updated = await prisma.platformVariant.update({
    where: { id: params.id },
    data: { [field]: value },
  });

  return NextResponse.json({ platformVariant: updated });
}
```

Note: only `hook`, `caption`, and `hashtags` are editable through this route — `coverImagePrompt`/`coverImageUrl` are only ever produced by generation/regeneration, never hand-edited, per the design spec.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/platform-variants/[id]` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/platform-variants/[id]/route.ts"
git commit -m "feat: add PATCH /api/platform-variants/:id route for editing fields"
```

---

## Task 6: API Route — `POST /api/platform-variants/:id/regenerate`

**Files:**
- Create: `src/app/api/platform-variants/[id]/regenerate/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/platform-variants/[id]/regenerate/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regeneratePlatformVariant } from "@/server/platformVariants";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const platformVariant = await prisma.platformVariant.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!platformVariant) {
    return NextResponse.json({ error: "Platform variant not found" }, { status: 404 });
  }

  try {
    const updated = await regeneratePlatformVariant(params.id);
    return NextResponse.json({ platformVariant: updated });
  } catch (error) {
    console.error("Failed to regenerate platform variant:", error);
    return NextResponse.json({ error: "Failed to regenerate this variant. Please try again." }, { status: 502 });
  }
}
```

Note: the ownership/existence check happens **before** the try/catch wrapping the actual regeneration call, so a missing/foreign variant returns 404, not a misleading 502 — the same ordering used in every prior regenerate route. Don't reorder this.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/platform-variants/[id]/regenerate` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/platform-variants/[id]/regenerate/route.ts"
git commit -m "feat: add POST /api/platform-variants/:id/regenerate route"
```

---

## Task 7: `PlatformVariantCard` Component and Multi-Platform Shorts Page

**Files:**
- Create: `src/components/platformVariants/PlatformVariantCard.tsx`
- Modify: `src/app/(app)/multi-platform-shorts/page.tsx`

- [ ] **Step 1: Create the `PlatformVariantCard` component**

This component owns all local editing state for one platform's row, including a `revision` counter that only increments on a successful regenerate — never on a plain field save — so hashtags-chip-list remounts (needed to pick up regenerated hashtags) never fire from an unrelated hook/caption save. `hook`/`caption` drafts resync via `useEffect` on the primitive string prop (safe: strings compare by value, so an unrelated field's save — which doesn't change this string's content — never retriggers it), the same pattern already proven safe in `ScriptSectionCard`.

```tsx
// src/components/platformVariants/PlatformVariantCard.tsx
"use client";

import { useEffect, useState } from "react";
import { EditableChipList } from "@/components/descriptionTags/EditableChipList";

export interface PlatformVariant {
  id: string;
  platform: "TIKTOK" | "YOUTUBE_SHORTS" | "INSTAGRAM_REELS" | "FACEBOOK_REELS";
  hook: string;
  caption: string;
  hashtags: string[];
  coverImageUrl: string | null;
}

const PLATFORM_LABELS: Record<PlatformVariant["platform"], string> = {
  TIKTOK: "TikTok",
  YOUTUBE_SHORTS: "YouTube Shorts",
  INSTAGRAM_REELS: "Instagram Reels",
  FACEBOOK_REELS: "Facebook Reels",
};

export function PlatformVariantCard({
  variant,
  onSaveField,
  onRegenerate,
}: {
  variant: PlatformVariant;
  onSaveField: (variantId: string, field: string, value: string | string[]) => void;
  onRegenerate: (variantId: string) => Promise<void>;
}) {
  const [hookDraft, setHookDraft] = useState(variant.hook);
  const [captionDraft, setCaptionDraft] = useState(variant.caption);
  const [revision, setRevision] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    setHookDraft(variant.hook);
  }, [variant.hook]);

  useEffect(() => {
    setCaptionDraft(variant.caption);
  }, [variant.caption]);

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await onRegenerate(variant.id);
      setRevision((r) => r + 1);
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">{PLATFORM_LABELS[variant.platform]}</h3>
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-zinc-300 hover:text-accent disabled:opacity-50"
        >
          {isRegenerating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>

      {variant.platform === "INSTAGRAM_REELS" && variant.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={variant.coverImageUrl}
          alt="Instagram Reels cover"
          className="mt-3 h-32 w-full rounded-md object-cover"
        />
      )}

      <p className="mt-3 text-[10px] uppercase tracking-wide text-zinc-500">Hook</p>
      <textarea
        value={hookDraft}
        onChange={(e) => setHookDraft(e.target.value)}
        onBlur={() => {
          if (hookDraft !== variant.hook) {
            onSaveField(variant.id, "hook", hookDraft);
          }
        }}
        rows={2}
        className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-100"
      />

      <p className="mt-3 text-[10px] uppercase tracking-wide text-zinc-500">Caption</p>
      <textarea
        value={captionDraft}
        onChange={(e) => setCaptionDraft(e.target.value)}
        onBlur={() => {
          if (captionDraft !== variant.caption) {
            onSaveField(variant.id, "caption", captionDraft);
          }
        }}
        rows={3}
        className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-100"
      />

      <div className="mt-3">
        <EditableChipList
          key={`hashtags-${revision}`}
          label="Hashtags"
          chips={variant.hashtags}
          onSave={(chips) => onSaveField(variant.id, "hashtags", chips)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the placeholder page**

Replace the entire contents of `src/app/(app)/multi-platform-shorts/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";
import { PlatformVariantCard, type PlatformVariant } from "@/components/platformVariants/PlatformVariantCard";

const PLATFORM_ORDER: PlatformVariant["platform"][] = ["TIKTOK", "YOUTUBE_SHORTS", "INSTAGRAM_REELS", "FACEBOOK_REELS"];

export default function MultiPlatformShortsPage() {
  const { currentProject } = useAppStore();
  const ideaIdFromUrl = useSearchParams().get("ideaId");
  const ideaIdFromStore = useWorkflowStore((state) => state.selectedIdeaId);
  const selectedIdeaId = ideaIdFromUrl ?? ideaIdFromStore;

  const [topic, setTopic] = useState("");
  const [variants, setVariants] = useState<PlatformVariant[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTopic("");
    setVariants(null);
    setError(null);

    if (!currentProject) return;

    setIsLoading(true);
    fetch(`/api/platform-variants?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const all: PlatformVariant[] = data.platformVariants ?? [];
        if (selectedIdeaId) {
          const existing = all.filter((v) => (v as unknown as { ideaId: string | null }).ideaId === selectedIdeaId);
          if (existing.length > 0) {
            setVariants(sortByPlatform(existing));
          }
        }
      })
      .catch((err) => console.error("Failed to load platform variants:", err))
      .finally(() => setIsLoading(false));
  }, [currentProject, selectedIdeaId]);

  useEffect(() => {
    if (!selectedIdeaId || !currentProject || variants) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const idea = (data.ideas ?? []).find((i: { id: string }) => i.id === selectedIdeaId);
        if (idea) {
          setTopic(idea.title);
        }
      })
      .catch((err) => console.error("Failed to load selected idea:", err));
  }, [selectedIdeaId, currentProject, variants]);

  function sortByPlatform(list: PlatformVariant[]): PlatformVariant[] {
    return [...list].sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
  }

  async function generate() {
    if (!currentProject || !topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/platform-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, ideaId: selectedIdeaId, topic }),
      });
      if (res.ok) {
        const data = await res.json();
        setVariants(sortByPlatform(data.platformVariants));
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to generate shorts. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate shorts:", err);
      setError("Failed to generate shorts. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveField(variantId: string, field: string, value: string | string[]) {
    try {
      const res = await fetch(`/api/platform-variants/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      if (res.ok) {
        const data = await res.json();
        setVariants((prev) => prev?.map((v) => (v.id === variantId ? data.platformVariant : v)) ?? null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to save changes. Please try again.");
      }
    } catch (err) {
      console.error("Failed to save changes:", err);
      setError("Failed to save changes. Please try again.");
    }
  }

  async function regenerate(variantId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/platform-variants/${variantId}/regenerate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setVariants((prev) => prev?.map((v) => (v.id === variantId ? data.platformVariant : v)) ?? null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to regenerate this variant. Please try again.");
      }
    } catch (err) {
      console.error("Failed to regenerate variant:", err);
      setError("Failed to regenerate this variant. Please try again.");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100">Multi-Platform Shorts</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Repurpose your video concept into platform-tailored hooks, captions, and hashtags for TikTok, YouTube Shorts,
        Instagram Reels, and Facebook Reels.
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading...</p>
      ) : variants ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {variants.map((variant) => (
            <PlatformVariantCard key={variant.id} variant={variant} onSaveField={saveField} onRegenerate={regenerate} />
          ))}
        </div>
      ) : (
        <>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Video topic..."
            className="mt-4 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
          />
          <button
            onClick={generate}
            disabled={isGenerating || !currentProject || !topic.trim()}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate Shorts"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

Note: the `PlatformVariant` interface in `PlatformVariantCard.tsx` doesn't declare `ideaId`, but the initial-load filter in the page casts to read it off the raw API response (`data.platformVariants` rows do include `ideaId` from Prisma) — this keeps the card's own prop type minimal (it never needs `ideaId` itself) while the page still filters correctly by it.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds, `/multi-platform-shorts` still listed among the routes (now dynamic, not a static placeholder).

- [ ] **Step 5: Commit**

```bash
git add src/components/platformVariants/PlatformVariantCard.tsx "src/app/(app)/multi-platform-shorts/page.tsx"
git commit -m "feat: replace Multi-Platform Shorts placeholder with real generation UI"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run the unit test suite (named files only, never the bare `npm test`)**

Run: `npx vitest run tests/unit`
Expected: all unit test files pass, including the 21 new tests in `tests/unit/platformVariants.test.ts` alongside every prior phase's unit tests.

- [ ] **Step 2: Attempt the integration test for this phase only**

Run: `npx vitest run tests/integration/platformVariants.test.ts`
Expected: PASS (3 tests) if a live, safe-to-use `DATABASE_URL` is available; otherwise a DB-connectivity error, which is an accepted outcome — do NOT run any other integration test file or the bare `npm test` to "double check".

- [ ] **Step 3: Run a full production build**

Run: `npm run build`
Expected: succeeds, with `/api/platform-variants`, `/api/platform-variants/[id]`, `/api/platform-variants/[id]/regenerate`, and `/multi-platform-shorts` present among the routes alongside everything from prior phases.

- [ ] **Step 4: Run `npx tsc --noEmit` across the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: Multi-Platform Repurposing Engine verification pass"
```

(Only run this if Steps 1-4 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** `RepurposePlatform` enum + `PlatformVariant` model with compound unique (Task 1), dual prompt/parse pairs for combined-4-platform and single-platform generation incl. anti-duplication tone mapping (Task 2), `fetchWorkflowContext` pulling Script/TitleSet/DescriptionTagSet context + `$transaction`-based 4-row creation + Higgsfield cover image generation + per-platform regeneration (Task 3), all 4 API routes (Tasks 4-6), page wiring with per-card independent state and `EditableChipList` reuse (Task 7) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO markers.
- **Type consistency:** `createPlatformVariantsForIdeaOrTopic`'s return shape (`{platformVariants, created}`, Task 3) matches Task 4's route (`result.platformVariants`, `result.created`). `regeneratePlatformVariant`'s signature (`variantId`, Task 3) matches Task 6's route call. `GeneratedPlatformVariants`'s three parallel-shaped platform keys (Task 2) match `dataByPlatform`'s lookup in Task 3's `createPlatformVariantsForIdeaOrTopic`. The `PlatformVariant` interface in Task 7's card component (`id, platform, hook, caption, hashtags, coverImageUrl`) is a subset of the Prisma row shape from Task 1. The `field`/`value` PATCH body shape is identical between Task 5's route and Task 7's `saveField` calls (`"hook"|"caption"|"hashtags"`).
- **Bug-class avoidance:** per the design doc, each platform card manages hook/caption via primitive-string-keyed `useEffect` resync (safe against unrelated-field-save clobbering, matching `ScriptSectionCard`'s proven-safe pattern) and hashtags via a `revision` counter that increments ONLY on that card's own successful regenerate — never on a plain field save — avoiding the stale-resync bug class found and fixed during Description & Tags' code review.
- **Standing safety instruction:** every test-running step in this plan specifies an exact file path for `vitest run` and never the bare `npm test`.
