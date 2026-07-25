# ArwaTube AI Engine — SEO Titles & Keyword Research — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build SEO Titles & Keyword Research: a `TitleSet` Prisma model, business logic for generating and regenerating 8 titles + 10 keywords via Claude (optionally informed by real YouTube trend data), four API routes, and a real `/seo-titles` page replacing its Phase 1 placeholder.

**Architecture:** `src/server/titles.ts` holds all testable business logic (prompt building, response parsing, generation orchestration) separate from thin, auth-checked API routes — mirroring `src/server/scripts.ts` and `src/server/ideas.ts`. One title set per idea is enforced by a unique, nullable `ideaId` column, same pattern as `Script`. The whole title/keyword batch regenerates together (no per-title regeneration). The `/seo-titles` page follows the URL-query-param idea handoff pattern already established in Thumbnail Studio and Script Writer (`?ideaId=...`, falling back to `useWorkflowStore.selectedIdeaId` for same-tab navigation) — this supersedes the design spec's mention of store-only handoff, which predates that fix.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Claude API (via `lib/llm`), YouTube Data API v3 (via `lib/youtube`), Zustand, Vitest.

---

## File Structure

```
prisma/
  schema.prisma                          (MODIFY: add TitleSet model, relations)

src/
  server/
    titles.ts                             (NEW: prompt/parse/orchestration logic)
  app/
    api/
      titles/
        route.ts                           (NEW: POST + GET)
        [id]/
          route.ts                          (NEW: PATCH)
          regenerate/
            route.ts                         (NEW: POST)
    (app)/
      seo-titles/
        page.tsx                             (MODIFY: replace placeholder)

tests/
  unit/
    titles.test.ts                          (NEW: pure-function tests)
  integration/
    titles.test.ts                          (NEW: createTitleSetForIdeaOrTopic against a real DB, lib/llm and lib/youtube mocked)
```

**IMPORTANT — do not run the full test suite against a live database.** Every task in this plan that runs tests specifies an exact `npx vitest run <specific file>` command — **never run the bare `npm test` or `npx vitest run` with no path argument**. If a `DATABASE_URL` happens to be absent or unreachable in the implementation worktree, integration tests failing with a connectivity error is an accepted, expected outcome — not a task failure.

---

## Task 1: Prisma Schema — `TitleSet` Model

**Files:**
- Modify: `prisma/schema.prisma`

- [x] **Step 1: Add the `TitleSet` model**

Add this model anywhere at the top level (e.g. after the existing `Script` model):

```prisma
model TitleSet {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  ideaId    String? @unique
  idea      Idea?   @relation(fields: [ideaId], references: [id], onDelete: SetNull)

  topic         String
  titles        String[]
  keywords      String[]
  selectedTitle String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [x] **Step 2: Add the relation fields on `Project` and `Idea`**

Find the `Project` model and add a `titleSets TitleSet[]` line alongside its other relation fields (next to `scripts Script[]`):

```prisma
  scripts    Script[]
  titleSets  TitleSet[]
```

Find the `Idea` model and add a `titleSet TitleSet?` back-relation line (singular, since `TitleSet.ideaId` is unique — a 1:1 relation), next to `script Script?`:

```prisma
  script     Script?
  titleSet   TitleSet?
```

- [x] **Step 3: Format and regenerate**

Run: `npx prisma format`
Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors. This does not require a live database connection.

- [x] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add TitleSet model to Prisma schema"
```

---

## Task 2: Titles Business Logic — Prompt Building & Response Parsing

**Files:**
- Create: `src/server/titles.ts`
- Test: `tests/unit/titles.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
// tests/unit/titles.test.ts
import { describe, it, expect } from "vitest";
import { buildTitlesPrompt, parseTitlesResponse } from "@/server/titles";

describe("buildTitlesPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildTitlesPrompt({ topic: "Home coffee brewing mistakes" });
    expect(prompt).toContain("Home coffee brewing mistakes");
  });

  it("includes YouTube context when provided", () => {
    const prompt = buildTitlesPrompt({
      topic: "Home coffee brewing mistakes",
      youtubeContext: '- "Top 5 Espresso Tips" (1000000 views)',
    });
    expect(prompt).toContain("Top 5 Espresso Tips");
  });

  it("omits the YouTube context section when not provided", () => {
    const prompt = buildTitlesPrompt({ topic: "Home coffee brewing mistakes" });
    expect(prompt).not.toContain("real YouTube trend data");
  });
});

describe("parseTitlesResponse", () => {
  const validResponse = {
    titles: [
      "5 Coffee Brewing Mistakes You're Making",
      "Stop Ruining Your Coffee (5 Fixes)",
      "Why Your Espresso Tastes Bad",
      "The Truth About Home Brewing",
      "5 Mistakes Every Home Barista Makes",
      "Fix Your Coffee In 5 Minutes",
      "Your Coffee Is Wrong. Here's Why",
      "5 Brewing Mistakes Ruining Your Morning",
    ],
    keywords: [
      "coffee brewing",
      "espresso tips",
      "home barista",
      "coffee mistakes",
      "brewing guide",
      "coffee tips",
      "espresso guide",
      "coffee beginner",
      "brewing technique",
      "coffee quality",
    ],
  };

  it("parses a plain JSON object", () => {
    const result = parseTitlesResponse(JSON.stringify(validResponse));
    expect(result).toEqual(validResponse);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify(validResponse) + "\n```";
    const result = parseTitlesResponse(raw);
    expect(result).toEqual(validResponse);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseTitlesResponse("no json here")).toThrow();
  });

  it("throws when titles does not have exactly 8 entries", () => {
    const invalid = { ...validResponse, titles: validResponse.titles.slice(0, 5) };
    expect(() => parseTitlesResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when keywords does not have exactly 10 entries", () => {
    const invalid = { ...validResponse, keywords: validResponse.keywords.slice(0, 3) };
    expect(() => parseTitlesResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parseTitlesResponse("{titles: unquoted}")).toThrow();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/titles.test.ts`
Expected: FAIL — `Cannot find module '@/server/titles'`

- [x] **Step 3: Create `src/server/titles.ts`** (full file for this task — Task 3 will extend it)

```ts
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
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/titles.test.ts`
Expected: PASS (9 tests)

- [x] **Step 5: Commit**

```bash
git add src/server/titles.ts tests/unit/titles.test.ts
git commit -m "feat: add SEO titles prompt-building and response-parsing logic"
```

---

## Task 3: Title Set Generation & Regeneration Orchestration

**Files:**
- Modify: `src/server/titles.ts`
- Test: `tests/integration/titles.test.ts`

This requires a live Postgres database to actually run. If no `DATABASE_URL` is reachable, write the code and test exactly as specified, verify via `npx tsc --noEmit`, and note in your report that live execution is deferred. **Do not run the bare `npm test` command in this task — only `npx vitest run tests/integration/titles.test.ts` as shown below.**

- [x] **Step 1: Write the failing test**

```ts
// tests/integration/titles.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/llm", () => ({
  getLlmClient: () => ({
    generateText: async () =>
      JSON.stringify({
        titles: [
          "5 Coffee Brewing Mistakes You're Making",
          "Stop Ruining Your Coffee (5 Fixes)",
          "Why Your Espresso Tastes Bad",
          "The Truth About Home Brewing",
          "5 Mistakes Every Home Barista Makes",
          "Fix Your Coffee In 5 Minutes",
          "Your Coffee Is Wrong. Here's Why",
          "5 Brewing Mistakes Ruining Your Morning",
        ],
        keywords: [
          "coffee brewing",
          "espresso tips",
          "home barista",
          "coffee mistakes",
          "brewing guide",
          "coffee tips",
          "espresso guide",
          "coffee beginner",
          "brewing technique",
          "coffee quality",
        ],
      }),
  }),
}));

vi.mock("@/lib/youtube", () => ({
  fetchYoutubeTrendContext: async () => null,
}));

import { createTitleSetForIdeaOrTopic } from "@/server/titles";

describe("createTitleSetForIdeaOrTopic", () => {
  beforeEach(async () => {
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

  it("generates and persists a new title set when no ideaId is given", async () => {
    const user = await prisma.user.create({ data: { email: "creator@example.com", name: "Creator" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel", isActive: true, settings: { create: {} } },
    });

    const result = await createTitleSetForIdeaOrTopic(project.id, null, null, "Home coffee brewing mistakes");

    expect(result.created).toBe(true);
    expect(result.titleSet.titles).toHaveLength(8);
    expect(result.titleSet.keywords).toHaveLength(10);
    expect(result.titleSet.selectedTitle).toBeNull();

    const stored = await prisma.titleSet.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(1);
  });

  it("returns the existing title set for an idea instead of generating a new one", async () => {
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

    const first = await createTitleSetForIdeaOrTopic(project.id, idea.id, null, "5 Coffee Mistakes");
    const second = await createTitleSetForIdeaOrTopic(project.id, idea.id, null, "5 Coffee Mistakes");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.titleSet.id).toBe(first.titleSet.id);

    const stored = await prisma.titleSet.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(1);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/titles.test.ts`
Expected: FAIL — `Cannot find export 'createTitleSetForIdeaOrTopic' from '@/server/titles'` (or, if no DB is reachable, a DB-connectivity error at `beforeEach` instead — either is an acceptable "red" state given the environment constraint).

- [x] **Step 3: Add `createTitleSetForIdeaOrTopic` and `regenerateTitleSet` to `src/server/titles.ts`**

Add these two imports at the top of the file:

```ts
import { prisma } from "@/lib/prisma";
import { getLlmClient } from "@/lib/llm";
import { fetchYoutubeTrendContext } from "@/lib/youtube";
```

Then append this to the end of the file (keep everything already in it from Task 2):

```ts
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
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/titles.test.ts`
Expected: PASS (2 tests), if a live `DATABASE_URL` is reachable and safe to use. If not, confirm the failure is a database-connectivity error, not a code/import error.

- [x] **Step 5: Run `npx tsc --noEmit` regardless of DB availability**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 6: Commit**

```bash
git add src/server/titles.ts tests/integration/titles.test.ts
git commit -m "feat: add title set generation and regeneration orchestration"
```

---

## Task 4: API Routes — `POST` / `GET /api/titles`

**Files:**
- Create: `src/app/api/titles/route.ts`

- [x] **Step 1: Create the route**

```ts
// src/app/api/titles/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { createTitleSetForIdeaOrTopic } from "@/server/titles";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, ideaId, topic } = await request.json();
  if (typeof projectId !== "string" || typeof topic !== "string") {
    return NextResponse.json({ error: "projectId and topic are required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { settings: true },
  });
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
    const youtubeApiKey = project.settings?.youtubeApiKey ? decrypt(project.settings.youtubeApiKey) : null;
    result = await createTitleSetForIdeaOrTopic(projectId, resolvedIdeaId, youtubeApiKey, topic);
  } catch (error) {
    console.error("Failed to generate title set:", error);
    return NextResponse.json({ error: "Failed to generate titles. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ titleSet: result.titleSet }, { status: result.created ? 201 : 200 });
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

  const titleSets = await prisma.titleSet.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ titleSets });
}
```

Note: the `decrypt()` call is inside the same try/catch as the `createTitleSetForIdeaOrTopic` call — not before it — per the established fix pattern from Phase 2's review (a bad/corrupted encrypted key must not produce an unhandled 500).

- [x] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/titles` listed among the routes.

- [x] **Step 4: Commit**

```bash
git add src/app/api/titles/route.ts
git commit -m "feat: add POST/GET /api/titles routes"
```

---

## Task 5: API Route — `PATCH /api/titles/:id`

**Files:**
- Create: `src/app/api/titles/[id]/route.ts`

- [x] **Step 1: Create the route**

```ts
// src/app/api/titles/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { selectedTitle } = await request.json();
  if (typeof selectedTitle !== "string") {
    return NextResponse.json({ error: "selectedTitle is required" }, { status: 400 });
  }

  const titleSet = await prisma.titleSet.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!titleSet) {
    return NextResponse.json({ error: "Title set not found" }, { status: 404 });
  }

  if (!titleSet.titles.includes(selectedTitle)) {
    return NextResponse.json({ error: "selectedTitle must be one of the generated titles" }, { status: 400 });
  }

  const updated = await prisma.titleSet.update({
    where: { id: params.id },
    data: { selectedTitle },
  });

  return NextResponse.json({ titleSet: updated });
}
```

Note the ownership check uses a nested relation filter (`project: { userId: session.user.id }`), matching the exact pattern established in `/api/scripts/[id]/route.ts`. The `titleSet.titles.includes(selectedTitle)` check enforces the spec's "select from the 8 generated titles only, no free text" rule server-side, not just in the UI.

- [x] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/titles/[id]` listed among the routes.

- [x] **Step 4: Commit**

```bash
git add "src/app/api/titles/[id]/route.ts"
git commit -m "feat: add PATCH /api/titles/:id route for selecting a title"
```

---

## Task 6: API Route — `POST /api/titles/:id/regenerate`

**Files:**
- Create: `src/app/api/titles/[id]/regenerate/route.ts`

- [x] **Step 1: Create the route**

```ts
// src/app/api/titles/[id]/regenerate/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { regenerateTitleSet } from "@/server/titles";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const titleSet = await prisma.titleSet.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
    include: { project: { include: { settings: true } } },
  });
  if (!titleSet) {
    return NextResponse.json({ error: "Title set not found" }, { status: 404 });
  }

  try {
    const youtubeApiKey = titleSet.project.settings?.youtubeApiKey
      ? decrypt(titleSet.project.settings.youtubeApiKey)
      : null;
    const updated = await regenerateTitleSet(params.id, youtubeApiKey);
    return NextResponse.json({ titleSet: updated });
  } catch (error) {
    console.error("Failed to regenerate title set:", error);
    return NextResponse.json({ error: "Failed to regenerate titles. Please try again." }, { status: 502 });
  }
}
```

Note: the ownership/existence check (`prisma.titleSet.findFirst` → 404) happens **before** the try/catch wrapping the actual regeneration call, so a missing/foreign title set returns 404, not a misleading 502 — the same ordering fixed into Script Writer's regenerate route during its review. Don't reorder this.

- [x] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/titles/[id]/regenerate` listed among the routes.

- [x] **Step 4: Commit**

```bash
git add "src/app/api/titles/[id]/regenerate/route.ts"
git commit -m "feat: add POST /api/titles/:id/regenerate route"
```

---

## Task 7: SEO Titles Page

**Files:**
- Modify: `src/app/(app)/seo-titles/page.tsx`

- [x] **Step 1: Replace the placeholder with the real page**

Replace the entire contents of `src/app/(app)/seo-titles/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";

interface TitleSet {
  id: string;
  ideaId: string | null;
  topic: string;
  titles: string[];
  keywords: string[];
  selectedTitle: string | null;
}

export default function SeoTitlesPage() {
  const { currentProject } = useAppStore();
  const ideaIdFromUrl = useSearchParams().get("ideaId");
  const ideaIdFromStore = useWorkflowStore((state) => state.selectedIdeaId);
  const selectedIdeaId = ideaIdFromUrl ?? ideaIdFromStore;

  const [topic, setTopic] = useState("");
  const [titleSet, setTitleSet] = useState<TitleSet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTopic("");
    setTitleSet(null);
    setError(null);

    if (!currentProject) return;

    setIsLoading(true);
    fetch(`/api/titles?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const titleSets: TitleSet[] = data.titleSets ?? [];
        if (selectedIdeaId) {
          const existing = titleSets.find((t) => t.ideaId === selectedIdeaId);
          if (existing) {
            setTitleSet(existing);
          }
        }
      })
      .catch((err) => console.error("Failed to load title sets:", err))
      .finally(() => setIsLoading(false));
  }, [currentProject, selectedIdeaId]);

  useEffect(() => {
    if (!selectedIdeaId || !currentProject || titleSet) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const idea = (data.ideas ?? []).find((i: { id: string }) => i.id === selectedIdeaId);
        if (idea) {
          setTopic(idea.title);
        }
      })
      .catch((err) => console.error("Failed to load selected idea:", err));
  }, [selectedIdeaId, currentProject, titleSet]);

  async function generate() {
    if (!currentProject || !topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, ideaId: selectedIdeaId, topic }),
      });
      if (res.ok) {
        const data = await res.json();
        setTitleSet(data.titleSet);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to generate titles. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate titles:", err);
      setError("Failed to generate titles. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function selectTitle(title: string) {
    if (!titleSet) return;
    try {
      const res = await fetch(`/api/titles/${titleSet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTitle: title }),
      });
      if (res.ok) {
        const data = await res.json();
        setTitleSet(data.titleSet);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to select title. Please try again.");
      }
    } catch (err) {
      console.error("Failed to select title:", err);
      setError("Failed to select title. Please try again.");
    }
  }

  async function regenerate() {
    if (!titleSet) return;
    setIsRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/titles/${titleSet.id}/regenerate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setTitleSet(data.titleSet);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to regenerate titles. Please try again.");
      }
    } catch (err) {
      console.error("Failed to regenerate titles:", err);
      setError("Failed to regenerate titles. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100">SEO Titles &amp; Keyword Research</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Generate high-CTR title variations and keyword research for your video.
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading...</p>
      ) : titleSet ? (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Topic: {titleSet.topic}</p>
            <button
              onClick={regenerate}
              disabled={isRegenerating}
              className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-zinc-300 hover:text-accent disabled:opacity-50"
            >
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {titleSet.titles.map((title) => (
              <button
                key={title}
                onClick={() => selectTitle(title)}
                className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${
                  titleSet.selectedTitle === title
                    ? "border-accent bg-accent/10 text-zinc-100"
                    : "border-surface-border bg-surface-raised text-zinc-300 hover:text-accent"
                }`}
              >
                {titleSet.selectedTitle === title ? "✓ " : ""}
                {title}
              </button>
            ))}
          </div>

          <p className="mt-6 text-[10px] uppercase tracking-wide text-zinc-500">Keywords</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {titleSet.keywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-surface-border bg-surface-raised px-3 py-1 text-xs text-zinc-300"
              >
                {keyword}
              </span>
            ))}
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
            {isGenerating ? "Generating..." : "Research Titles"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [x] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/seo-titles` still listed among the routes (now dynamic, not a static placeholder).

- [x] **Step 4: Commit**

```bash
git add "src/app/(app)/seo-titles/page.tsx"
git commit -m "feat: replace SEO Titles placeholder with real generation UI"
```

---

## Task 8: Final Verification

- [x] **Step 1: Run the unit test suite (named files only, never the bare `npm test`)**

Run: `npx vitest run tests/unit`
Expected: all unit test files pass, including the 9 new tests in `tests/unit/titles.test.ts` alongside every prior phase's unit tests.

- [x] **Step 2: Attempt the integration test for this phase only**

Run: `npx vitest run tests/integration/titles.test.ts`
Expected: PASS (2 tests) if a live, safe-to-use `DATABASE_URL` is available; otherwise a DB-connectivity error, which is an accepted outcome — do NOT run any other integration test file or the bare `npm test` to "double check".

- [x] **Step 3: Run a full production build**

Run: `npm run build`
Expected: succeeds, with `/api/titles`, `/api/titles/[id]`, `/api/titles/[id]/regenerate`, and `/seo-titles` present among the routes alongside everything from prior phases.

- [x] **Step 4: Run `npx tsc --noEmit` across the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [x] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: SEO Titles verification pass"
```

(Only run this if Steps 1-4 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** `TitleSet` model (Task 1), prompt/parse logic (Task 2), generation-with-existing-set-shortcut + regeneration (Task 3), all 4 API routes (Tasks 4-6), page wiring including `selectedIdeaId` consumption via URL param and existing-set auto-load (Task 7) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO markers.
- **Deviation from the written spec, intentional:** the spec's UI section describes `useWorkflowStore.selectedIdeaId` as the sole idea-handoff mechanism. Since that spec was written, Idea Finder's action icons were changed to open in a new tab (commit `9cfe7d6`), which required switching the handoff to a `?ideaId=` URL query param (store-only handoff doesn't survive across tabs). Task 7 uses the URL-param-first pattern already shipped in Thumbnail Studio and Script Writer, not the spec's original store-only wording — this is a necessary correction to match the current, already-shipped codebase, not scope creep.
- **Type consistency:** `createTitleSetForIdeaOrTopic`'s return shape (`{titleSet, created}`, Task 3) matches how Task 4's route reads it (`result.titleSet`, `result.created`). `regenerateTitleSet`'s signature (`titleSetId, youtubeApiKey`, Task 3) matches Task 6's route call exactly. The `TitleSet` interface in Task 7's page (`id, ideaId, topic, titles, keywords, selectedTitle`) is a subset of the Prisma row shape, matching the pattern used in Script Writer's page.
- **Standing safety instruction:** every test-running step in this plan specifies an exact file path for `vitest run` and never the bare `npm test`.
