# ArwaTube AI Engine — Description & Tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Description & Tags: a `DescriptionTagSet` Prisma model, business logic for generating and regenerating a description, tags, hashtags, a YouTube-taxonomy category, and a pinned-comment suggestion via Claude (informed by a linked idea's selected title/keywords when available), four API routes, and a real `/description-tags` page replacing its Phase 1 placeholder.

**Architecture:** `src/server/descriptionTags.ts` holds all testable business logic (prompt building, response parsing, generation orchestration) separate from thin, auth-checked API routes — mirroring `src/server/titles.ts` and `src/server/scripts.ts`. One set per idea is enforced by a unique, nullable `ideaId` column, same pattern as `Script`/`TitleSet`. The whole 5-field batch regenerates together (no per-field regeneration), same as SEO Titles. Unlike SEO Titles' keyword chips, all five fields are user-editable in place: `description`/`pinnedComment` autosave on blur (Script Writer's pattern), `tags`/`hashtags` are editable chip lists that autosave on every add/remove, and `category` autosaves on select-change. The `/description-tags` page follows the established URL-query-param idea handoff pattern (`?ideaId=...`, falling back to `useWorkflowStore.selectedIdeaId`).

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Claude API (via `lib/llm`), Zustand, Vitest.

---

## File Structure

```
prisma/
  schema.prisma                          (MODIFY: add DescriptionTagSet model, relations)

src/
  server/
    descriptionTags.ts                    (NEW: prompt/parse/orchestration logic, YOUTUBE_CATEGORIES)
  components/
    descriptionTags/
      EditableChipList.tsx                 (NEW: reusable add/remove chip list used for tags + hashtags)
  app/
    api/
      description-tags/
        route.ts                           (NEW: POST + GET)
        [id]/
          route.ts                          (NEW: PATCH)
          regenerate/
            route.ts                         (NEW: POST)
    (app)/
      description-tags/
        page.tsx                             (MODIFY: replace placeholder)

tests/
  unit/
    descriptionTags.test.ts                 (NEW: pure-function tests)
  integration/
    descriptionTags.test.ts                 (NEW: createDescriptionTagSetForIdeaOrTopic against a real DB, lib/llm mocked)
```

**IMPORTANT — do not run the full test suite against a live database.** Every task in this plan that runs tests specifies an exact `npx vitest run <specific file>` command — **never run the bare `npm test` or `npx vitest run` with no path argument**. If a `DATABASE_URL` happens to be absent or unreachable in the implementation worktree, integration tests failing with a connectivity error is an accepted, expected outcome — not a task failure.

---

## Task 1: Prisma Schema — `DescriptionTagSet` Model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `DescriptionTagSet` model**

Add this model anywhere at the top level (e.g. after the existing `TitleSet` model):

```prisma
model DescriptionTagSet {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  ideaId    String? @unique
  idea      Idea?   @relation(fields: [ideaId], references: [id], onDelete: SetNull)

  topic         String
  description   String
  tags          String[]
  hashtags      String[]
  category      String
  pinnedComment String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Add the relation fields on `Project` and `Idea`**

Find the `Project` model and add a `descriptionTagSets DescriptionTagSet[]` line alongside its other relation fields (next to `titleSets TitleSet[]`):

```prisma
  scripts            Script[]
  titleSets          TitleSet[]
  descriptionTagSets DescriptionTagSet[]
```

Find the `Idea` model and add a `descriptionTagSet DescriptionTagSet?` back-relation line (singular, since `DescriptionTagSet.ideaId` is unique — a 1:1 relation), next to `titleSet TitleSet?`:

```prisma
  script            Script?
  titleSet          TitleSet?
  descriptionTagSet DescriptionTagSet?
```

- [ ] **Step 3: Format and regenerate**

Run: `npx prisma format`
Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors. This does not require a live database connection.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add DescriptionTagSet model to Prisma schema"
```

---

## Task 2: Description & Tags Business Logic — Prompt Building & Response Parsing

**Files:**
- Create: `src/server/descriptionTags.ts`
- Test: `tests/unit/descriptionTags.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/descriptionTags.test.ts
import { describe, it, expect } from "vitest";
import { buildDescriptionTagsPrompt, parseDescriptionTagsResponse, YOUTUBE_CATEGORIES } from "@/server/descriptionTags";

describe("buildDescriptionTagsPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildDescriptionTagsPrompt({ topic: "Home coffee brewing mistakes" });
    expect(prompt).toContain("Home coffee brewing mistakes");
  });

  it("includes the selected title when provided", () => {
    const prompt = buildDescriptionTagsPrompt({
      topic: "Home coffee brewing mistakes",
      selectedTitle: "5 Coffee Brewing Mistakes You're Making",
    });
    expect(prompt).toContain("5 Coffee Brewing Mistakes You're Making");
  });

  it("includes keywords when provided", () => {
    const prompt = buildDescriptionTagsPrompt({
      topic: "Home coffee brewing mistakes",
      keywords: ["coffee brewing", "espresso tips"],
    });
    expect(prompt).toContain("coffee brewing");
    expect(prompt).toContain("espresso tips");
  });

  it("omits title and keyword context sections when not provided", () => {
    const prompt = buildDescriptionTagsPrompt({ topic: "Home coffee brewing mistakes" });
    expect(prompt).not.toContain("already chosen this title");
    expect(prompt).not.toContain("already researched for this video's SEO");
  });
});

describe("parseDescriptionTagsResponse", () => {
  const validResponse = {
    description: "Learn the top 5 mistakes home baristas make and how to fix them for better coffee every morning.",
    tags: ["coffee brewing", "espresso tips", "home barista", "coffee mistakes", "brewing guide"],
    hashtags: ["#coffee", "#espresso", "#homebarista"],
    category: "Howto & Style",
    pinnedComment: "What's the biggest coffee mistake you used to make? Let us know below!",
  };

  it("parses a plain JSON object", () => {
    const result = parseDescriptionTagsResponse(JSON.stringify(validResponse));
    expect(result).toEqual(validResponse);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify(validResponse) + "\n```";
    const result = parseDescriptionTagsResponse(raw);
    expect(result).toEqual(validResponse);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseDescriptionTagsResponse("no json here")).toThrow();
  });

  it("throws when description is missing", () => {
    const invalid = { ...validResponse, description: "" };
    expect(() => parseDescriptionTagsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when tags is not an array of strings", () => {
    const invalid = { ...validResponse, tags: [1, 2, 3] };
    expect(() => parseDescriptionTagsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when hashtags is not an array of strings", () => {
    const invalid = { ...validResponse, hashtags: "not-an-array" };
    expect(() => parseDescriptionTagsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when category is not one of the fixed YouTube categories", () => {
    const invalid = { ...validResponse, category: "Made Up Category" };
    expect(() => parseDescriptionTagsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when pinnedComment is missing", () => {
    const invalid = { ...validResponse, pinnedComment: "" };
    expect(() => parseDescriptionTagsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parseDescriptionTagsResponse("{description: unquoted}")).toThrow();
  });

  it("exports the fixed YouTube category list with 15 entries", () => {
    expect(YOUTUBE_CATEGORIES).toHaveLength(15);
    expect(YOUTUBE_CATEGORIES).toContain("Howto & Style");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/descriptionTags.test.ts`
Expected: FAIL — `Cannot find module '@/server/descriptionTags'`

- [ ] **Step 3: Create `src/server/descriptionTags.ts`** (full file for this task — Task 3 will extend it)

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/descriptionTags.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/descriptionTags.ts tests/unit/descriptionTags.test.ts
git commit -m "feat: add description & tags prompt-building and response-parsing logic"
```

---

## Task 3: Description & Tags Generation & Regeneration Orchestration

**Files:**
- Modify: `src/server/descriptionTags.ts`
- Test: `tests/integration/descriptionTags.test.ts`

This requires a live Postgres database to actually run. If no `DATABASE_URL` is reachable, write the code and test exactly as specified, verify via `npx tsc --noEmit`, and note in your report that live execution is deferred. **Do not run the bare `npm test` command in this task — only `npx vitest run tests/integration/descriptionTags.test.ts` as shown below.**

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/descriptionTags.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const generateText = vi.fn(async () =>
  JSON.stringify({
    description: "Learn the top 5 mistakes home baristas make and how to fix them for better coffee every morning.",
    tags: ["coffee brewing", "espresso tips", "home barista", "coffee mistakes", "brewing guide"],
    hashtags: ["#coffee", "#espresso", "#homebarista"],
    category: "Howto & Style",
    pinnedComment: "What's the biggest coffee mistake you used to make? Let us know below!",
  })
);

vi.mock("@/lib/llm", () => ({
  getLlmClient: () => ({ generateText }),
}));

import { createDescriptionTagSetForIdeaOrTopic } from "@/server/descriptionTags";

describe("createDescriptionTagSetForIdeaOrTopic", () => {
  beforeEach(async () => {
    generateText.mockClear();
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

  it("generates and persists a new set when no ideaId is given", async () => {
    const user = await prisma.user.create({ data: { email: "creator@example.com", name: "Creator" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel", isActive: true, settings: { create: {} } },
    });

    const result = await createDescriptionTagSetForIdeaOrTopic(project.id, null, "Home coffee brewing mistakes");

    expect(result.created).toBe(true);
    expect(result.descriptionTagSet.tags.length).toBeGreaterThan(0);
    expect(result.descriptionTagSet.category).toBe("Howto & Style");

    const stored = await prisma.descriptionTagSet.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(1);
  });

  it("returns the existing set for an idea instead of generating a new one", async () => {
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

    const first = await createDescriptionTagSetForIdeaOrTopic(project.id, idea.id, "5 Coffee Mistakes");
    const second = await createDescriptionTagSetForIdeaOrTopic(project.id, idea.id, "5 Coffee Mistakes");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.descriptionTagSet.id).toBe(first.descriptionTagSet.id);

    const stored = await prisma.descriptionTagSet.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(1);
  });

  it("pulls the linked idea's selected title and keywords into the prompt when a TitleSet exists", async () => {
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
    await prisma.titleSet.create({
      data: {
        projectId: project.id,
        ideaId: idea.id,
        topic: "5 Coffee Mistakes",
        titles: ["Stop Ruining Your Coffee"],
        keywords: ["coffee brewing", "espresso tips"],
        selectedTitle: "Stop Ruining Your Coffee",
      },
    });

    await createDescriptionTagSetForIdeaOrTopic(project.id, idea.id, "5 Coffee Mistakes");

    expect(generateText).toHaveBeenCalledTimes(1);
    const promptSent = generateText.mock.calls[0][0] as string;
    expect(promptSent).toContain("Stop Ruining Your Coffee");
    expect(promptSent).toContain("coffee brewing");
    expect(promptSent).toContain("espresso tips");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/descriptionTags.test.ts`
Expected: FAIL — `Cannot find export 'createDescriptionTagSetForIdeaOrTopic' from '@/server/descriptionTags'` (or, if no DB is reachable, a DB-connectivity error at `beforeEach` instead — either is an acceptable "red" state given the environment constraint).

- [ ] **Step 3: Add `createDescriptionTagSetForIdeaOrTopic` and `regenerateDescriptionTagSet` to `src/server/descriptionTags.ts`**

Add these two imports at the top of the file:

```ts
import { prisma } from "@/lib/prisma";
import { getLlmClient } from "@/lib/llm";
```

Then append this to the end of the file (keep everything already in it from Task 2):

```ts
async function fetchTitleSetContext(
  ideaId: string | null
): Promise<{ selectedTitle: string | null; keywords: string[] | null }> {
  if (!ideaId) {
    return { selectedTitle: null, keywords: null };
  }
  const titleSet = await prisma.titleSet.findUnique({ where: { ideaId } });
  if (!titleSet) {
    return { selectedTitle: null, keywords: null };
  }
  return { selectedTitle: titleSet.selectedTitle, keywords: titleSet.keywords };
}

export async function createDescriptionTagSetForIdeaOrTopic(projectId: string, ideaId: string | null, topic: string) {
  if (ideaId) {
    const existing = await prisma.descriptionTagSet.findUnique({ where: { ideaId } });
    if (existing) {
      return { descriptionTagSet: existing, created: false };
    }
  }

  const { selectedTitle, keywords } = await fetchTitleSetContext(ideaId);

  const llm = getLlmClient();
  const raw = await llm.generateText(buildDescriptionTagsPrompt({ topic, selectedTitle, keywords }));
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

export async function regenerateDescriptionTagSet(descriptionTagSetId: string) {
  const existing = await prisma.descriptionTagSet.findUniqueOrThrow({ where: { id: descriptionTagSetId } });

  const { selectedTitle, keywords } = await fetchTitleSetContext(existing.ideaId);

  const llm = getLlmClient();
  const raw = await llm.generateText(buildDescriptionTagsPrompt({ topic: existing.topic, selectedTitle, keywords }));
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/descriptionTags.test.ts`
Expected: PASS (3 tests), if a live `DATABASE_URL` is reachable and safe to use. If not, confirm the failure is a database-connectivity error, not a code/import error.

- [ ] **Step 5: Run `npx tsc --noEmit` regardless of DB availability**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/descriptionTags.ts tests/integration/descriptionTags.test.ts
git commit -m "feat: add description & tags generation and regeneration orchestration"
```

---

## Task 4: API Routes — `POST` / `GET /api/description-tags`

**Files:**
- Create: `src/app/api/description-tags/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/description-tags/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDescriptionTagSetForIdeaOrTopic } from "@/server/descriptionTags";

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
    result = await createDescriptionTagSetForIdeaOrTopic(projectId, resolvedIdeaId, topic);
  } catch (error) {
    console.error("Failed to generate description & tags set:", error);
    return NextResponse.json({ error: "Failed to generate metadata. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ descriptionTagSet: result.descriptionTagSet }, { status: result.created ? 201 : 200 });
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

  const descriptionTagSets = await prisma.descriptionTagSet.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ descriptionTagSets });
}
```

Note: unlike `/api/titles`, there is no YouTube API key / `decrypt` step here — Description & Tags generation is not informed by real YouTube trend data per the design spec, only by the linked idea's `TitleSet` (if any), which `createDescriptionTagSetForIdeaOrTopic` fetches internally.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/description-tags` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/description-tags/route.ts
git commit -m "feat: add POST/GET /api/description-tags routes"
```

---

## Task 5: API Route — `PATCH /api/description-tags/:id`

**Files:**
- Create: `src/app/api/description-tags/[id]/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/description-tags/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { YOUTUBE_CATEGORIES } from "@/server/descriptionTags";

const STRING_FIELDS = ["description", "category", "pinnedComment"];
const ARRAY_FIELDS = ["tags", "hashtags"];

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
    if (field === "category" && !(YOUTUBE_CATEGORIES as readonly string[]).includes(value)) {
      return NextResponse.json(
        { error: `category must be one of: ${YOUTUBE_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
  } else if (ARRAY_FIELDS.includes(field)) {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      return NextResponse.json({ error: "value must be an array of strings for this field" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "A valid field is required" }, { status: 400 });
  }

  const descriptionTagSet = await prisma.descriptionTagSet.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!descriptionTagSet) {
    return NextResponse.json({ error: "Description & tags set not found" }, { status: 404 });
  }

  const updated = await prisma.descriptionTagSet.update({
    where: { id: params.id },
    data: { [field]: value },
  });

  return NextResponse.json({ descriptionTagSet: updated });
}
```

Note the ownership check uses a nested relation filter (`project: { userId: session.user.id }`), matching the exact pattern established in `/api/titles/[id]/route.ts` and `/api/scripts/[id]/route.ts`. `field`/`value` mirror Script Writer's `{section, content}` PATCH shape, generalized to one of 5 fields with per-field type + category-taxonomy validation, enforcing the spec's "category must be a real YouTube category" rule server-side, not just in the UI's `<select>`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/description-tags/[id]` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/description-tags/[id]/route.ts"
git commit -m "feat: add PATCH /api/description-tags/:id route for editing fields"
```

---

## Task 6: API Route — `POST /api/description-tags/:id/regenerate`

**Files:**
- Create: `src/app/api/description-tags/[id]/regenerate/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/description-tags/[id]/regenerate/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regenerateDescriptionTagSet } from "@/server/descriptionTags";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const descriptionTagSet = await prisma.descriptionTagSet.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!descriptionTagSet) {
    return NextResponse.json({ error: "Description & tags set not found" }, { status: 404 });
  }

  try {
    const updated = await regenerateDescriptionTagSet(params.id);
    return NextResponse.json({ descriptionTagSet: updated });
  } catch (error) {
    console.error("Failed to regenerate description & tags set:", error);
    return NextResponse.json({ error: "Failed to regenerate metadata. Please try again." }, { status: 502 });
  }
}
```

Note: the ownership/existence check (`prisma.descriptionTagSet.findFirst` → 404) happens **before** the try/catch wrapping the actual regeneration call, so a missing/foreign set returns 404, not a misleading 502 — the same ordering used in `/api/titles/[id]/regenerate/route.ts` and `/api/scripts/[id]/regenerate/route.ts`. Don't reorder this.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/description-tags/[id]/regenerate` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/description-tags/[id]/regenerate/route.ts"
git commit -m "feat: add POST /api/description-tags/:id/regenerate route"
```

---

## Task 7: `EditableChipList` Component and Description & Tags Page

**Files:**
- Create: `src/components/descriptionTags/EditableChipList.tsx`
- Modify: `src/app/(app)/description-tags/page.tsx`

- [ ] **Step 1: Create the `EditableChipList` component**

```tsx
// src/components/descriptionTags/EditableChipList.tsx
"use client";

import { useState } from "react";

export function EditableChipList({
  label,
  chips,
  onSave,
}: {
  label: string;
  chips: string[];
  onSave: (chips: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function removeChip(chip: string) {
    onSave(chips.filter((c) => c !== chip));
  }

  function addChip() {
    const trimmed = draft.trim();
    if (!trimmed || chips.includes(trimmed)) return;
    onSave([...chips, trimmed]);
    setDraft("");
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className="flex items-center gap-1 rounded-full border border-surface-border bg-surface-raised px-3 py-1 text-xs text-zinc-300"
          >
            {chip}
            <button onClick={() => removeChip(chip)} className="text-zinc-500 hover:text-red-400">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChip();
            }
          }}
          placeholder={`Add ${label.toLowerCase()}...`}
          className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-100"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the placeholder page**

Replace the entire contents of `src/app/(app)/description-tags/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";
import { EditableChipList } from "@/components/descriptionTags/EditableChipList";

// Duplicated from src/server/descriptionTags.ts's YOUTUBE_CATEGORIES: that module
// imports `@/lib/prisma`, which is server-only and cannot be imported into this
// client component.
const YOUTUBE_CATEGORIES = [
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
];

interface DescriptionTagSet {
  id: string;
  ideaId: string | null;
  topic: string;
  description: string;
  tags: string[];
  hashtags: string[];
  category: string;
  pinnedComment: string;
}

export default function DescriptionTagsPage() {
  const { currentProject } = useAppStore();
  const ideaIdFromUrl = useSearchParams().get("ideaId");
  const ideaIdFromStore = useWorkflowStore((state) => state.selectedIdeaId);
  const selectedIdeaId = ideaIdFromUrl ?? ideaIdFromStore;

  const [topic, setTopic] = useState("");
  const [set, setSet] = useState<DescriptionTagSet | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [pinnedCommentDraft, setPinnedCommentDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTopic("");
    setSet(null);
    setError(null);

    if (!currentProject) return;

    setIsLoading(true);
    fetch(`/api/description-tags?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const sets: DescriptionTagSet[] = data.descriptionTagSets ?? [];
        if (selectedIdeaId) {
          const existing = sets.find((s) => s.ideaId === selectedIdeaId);
          if (existing) {
            setSet(existing);
          }
        }
      })
      .catch((err) => console.error("Failed to load description & tags sets:", err))
      .finally(() => setIsLoading(false));
  }, [currentProject, selectedIdeaId]);

  useEffect(() => {
    if (!selectedIdeaId || !currentProject || set) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const idea = (data.ideas ?? []).find((i: { id: string }) => i.id === selectedIdeaId);
        if (idea) {
          setTopic(idea.title);
        }
      })
      .catch((err) => console.error("Failed to load selected idea:", err));
  }, [selectedIdeaId, currentProject, set]);

  useEffect(() => {
    setDescriptionDraft(set?.description ?? "");
    setPinnedCommentDraft(set?.pinnedComment ?? "");
  }, [set]);

  async function generate() {
    if (!currentProject || !topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/description-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, ideaId: selectedIdeaId, topic }),
      });
      if (res.ok) {
        const data = await res.json();
        setSet(data.descriptionTagSet);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to generate metadata. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate metadata:", err);
      setError("Failed to generate metadata. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveField(field: string, value: string | string[]) {
    if (!set) return;
    try {
      const res = await fetch(`/api/description-tags/${set.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      if (res.ok) {
        const data = await res.json();
        setSet(data.descriptionTagSet);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to save changes. Please try again.");
      }
    } catch (err) {
      console.error("Failed to save changes:", err);
      setError("Failed to save changes. Please try again.");
    }
  }

  async function regenerate() {
    if (!set) return;
    setIsRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/description-tags/${set.id}/regenerate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSet(data.descriptionTagSet);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to regenerate metadata. Please try again.");
      }
    } catch (err) {
      console.error("Failed to regenerate metadata:", err);
      setError("Failed to regenerate metadata. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100">Description & Tags</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Generate a full metadata package: description, tags, hashtags, category, and a pinned-comment suggestion.
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading...</p>
      ) : set ? (
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Topic: {set.topic}</p>
            <button
              onClick={regenerate}
              disabled={isRegenerating}
              className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-zinc-300 hover:text-accent disabled:opacity-50"
            >
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Description</p>
            <textarea
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              onBlur={() => {
                if (descriptionDraft !== set.description) {
                  saveField("description", descriptionDraft);
                }
              }}
              rows={6}
              className="mt-2 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <EditableChipList label="Tags" chips={set.tags} onSave={(chips) => saveField("tags", chips)} />
          <EditableChipList label="Hashtags" chips={set.hashtags} onSave={(chips) => saveField("hashtags", chips)} />

          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Category</p>
            <select
              value={set.category}
              onChange={(e) => saveField("category", e.target.value)}
              className="mt-2 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
            >
              {YOUTUBE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Pinned Comment</p>
            <textarea
              value={pinnedCommentDraft}
              onChange={(e) => setPinnedCommentDraft(e.target.value)}
              onBlur={() => {
                if (pinnedCommentDraft !== set.pinnedComment) {
                  saveField("pinnedComment", pinnedCommentDraft);
                }
              }}
              rows={2}
              className="mt-2 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
            />
          </div>
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
            {isGenerating ? "Generating..." : "Generate Metadata"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds, `/description-tags` still listed among the routes (now dynamic, not a static placeholder).

- [ ] **Step 5: Commit**

```bash
git add src/components/descriptionTags/EditableChipList.tsx "src/app/(app)/description-tags/page.tsx"
git commit -m "feat: replace Description & Tags placeholder with real generation UI"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run the unit test suite (named files only, never the bare `npm test`)**

Run: `npx vitest run tests/unit`
Expected: all unit test files pass, including the 11 new tests in `tests/unit/descriptionTags.test.ts` alongside every prior phase's unit tests.

- [ ] **Step 2: Attempt the integration test for this phase only**

Run: `npx vitest run tests/integration/descriptionTags.test.ts`
Expected: PASS (3 tests) if a live, safe-to-use `DATABASE_URL` is available; otherwise a DB-connectivity error, which is an accepted outcome — do NOT run any other integration test file or the bare `npm test` to "double check".

- [ ] **Step 3: Run a full production build**

Run: `npm run build`
Expected: succeeds, with `/api/description-tags`, `/api/description-tags/[id]`, `/api/description-tags/[id]/regenerate`, and `/description-tags` present among the routes alongside everything from prior phases.

- [ ] **Step 4: Run `npx tsc --noEmit` across the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: Description & Tags verification pass"
```

(Only run this if Steps 1-4 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** `DescriptionTagSet` model (Task 1), prompt/parse logic incl. `YOUTUBE_CATEGORIES` (Task 2), generation-with-existing-set-shortcut + TitleSet-context-pulling + regeneration (Task 3), all 4 API routes (Tasks 4-6), page wiring including per-field autosave for all 5 fields via `EditableChipList` + textareas + select (Task 7) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO markers.
- **Type consistency:** `createDescriptionTagSetForIdeaOrTopic`'s return shape (`{descriptionTagSet, created}`, Task 3) matches how Task 4's route reads it (`result.descriptionTagSet`, `result.created`). `regenerateDescriptionTagSet`'s signature (`descriptionTagSetId`, Task 3) matches Task 6's route call exactly. The `DescriptionTagSet` interface in Task 7's page (`id, ideaId, topic, description, tags, hashtags, category, pinnedComment`) matches the Prisma row shape from Task 1. The `field`/`value` PATCH body shape is identical between Task 5's route and Task 7's `saveField` calls (`"description"|"tags"|"hashtags"|"category"|"pinnedComment"`, matching string vs `string[]` per field).
- **Standing safety instruction:** every test-running step in this plan specifies an exact file path for `vitest run` and never the bare `npm test`.
