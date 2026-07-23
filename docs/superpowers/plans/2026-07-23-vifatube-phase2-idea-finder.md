# VifaTube AI Engine — Phase 2: Idea Finder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Idea Finder module: a `POST /api/ideas` endpoint that generates 6 scored video concepts (via a real Claude API client, optionally informed by real YouTube trend data), a `GET /api/ideas` endpoint that returns previously-generated ideas, and a real `/idea-finder` page with a form and card grid replacing its Phase 1 placeholder.

**Architecture:** A new `Idea` Prisma model (with a `ScoreSource` enum) stores generated ideas per project. `src/lib/llm`'s Phase 1 stub is replaced with a real Anthropic Claude client behind the same interface. A new `src/lib/youtube` client fetches trend signals from the YouTube Data API when a project has a configured key, returning `null` on any failure so callers can cleanly fall back. `src/server/ideas.ts` holds the testable business logic (prompt building, response parsing, score-source determination, persistence), kept separate from the thin, auth-checked API route — mirroring the `src/server/projects.ts` pattern from Phase 1. The Idea Finder page and a new `IdeaCard` component consume these routes and write the selected idea into the already-scaffolded `useWorkflowStore` before navigating to a destination module.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, `@anthropic-ai/sdk` (Claude API), YouTube Data API v3 (via `fetch`), Zustand, Vitest.

---

## File Structure

```
prisma/
  schema.prisma          (MODIFY: add Idea model, ScoreSource enum, Project.ideas relation)

src/
  lib/
    youtube/
      index.ts            (NEW: fetchYoutubeTrendContext)
    llm/
      index.ts             (MODIFY: replace throwing stub with real Claude client)
  server/
    ideas.ts               (NEW: buildIdeaPrompt, parseIdeasResponse, determineScoreSource, createIdeasForProject)
  app/
    api/
      ideas/
        route.ts            (NEW: POST + GET)
    (app)/
      idea-finder/
        page.tsx             (MODIFY: replace placeholder with real page)
  components/
    idea-finder/
      IdeaCard.tsx           (NEW)

tests/
  unit/
    youtube.test.ts          (NEW)
    ideas.test.ts             (NEW: pure-function tests)
    useWorkflowStore.test.ts  (NEW)
  integration/
    ideas.test.ts             (NEW: createIdeasForProject against a real DB, lib/llm mocked)

.env.example                 (MODIFY: add ANTHROPIC_API_KEY, ANTHROPIC_MODEL)
package.json                  (MODIFY: add @anthropic-ai/sdk dependency)
```

- `src/lib/youtube/index.ts` and `src/lib/llm/index.ts` stay single-purpose external-service wrappers, matching the Phase 1 pattern (`src/lib/crypto.ts`, `src/lib/prisma.ts`).
- `src/server/ideas.ts` holds all idea-generation business logic so it's testable without going through NextAuth/HTTP, mirroring `src/server/projects.ts`.
- `src/app/api/ideas/route.ts` stays thin: auth, input validation, ownership check, delegate to `src/server/ideas.ts`.

---

## Task 1: Prisma Schema — Idea Model & ScoreSource Enum

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `ScoreSource` enum and `Idea` model, and add the relation on `Project`**

In `prisma/schema.prisma`, add this enum anywhere at the top level (e.g. right after the `datasource` block):

```prisma
enum ScoreSource {
  REAL_YOUTUBE_DATA
  AI_ESTIMATE
}
```

Add this model anywhere at the top level (e.g. after the existing `ProjectSettings` model):

```prisma
model Idea {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  title       String
  description String
  hook        String

  viralityScore Int
  scoreSource   ScoreSource

  createdAt DateTime @default(now())
}
```

Modify the existing `Project` model to add the relation — find this block:

```prisma
model Project {
  id       String  @id @default(cuid())
  userId   String
  name     String
  isActive Boolean @default(false)

  user     User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  settings ProjectSettings?

  createdAt DateTime @default(now())
}
```

and add an `ideas Idea[]` line so it reads:

```prisma
model Project {
  id       String  @id @default(cuid())
  userId   String
  name     String
  isActive Boolean @default(false)

  user     User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  settings ProjectSettings?
  ideas    Idea[]

  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors. This does not require a live database connection.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Idea model and ScoreSource enum to Prisma schema"
```

---

## Task 2: YouTube Trend Context Client

**Files:**
- Create: `src/lib/youtube/index.ts`
- Test: `tests/unit/youtube.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/youtube.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchYoutubeTrendContext } from "@/lib/youtube";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchYoutubeTrendContext", () => {
  it("returns a formatted summary on success", async () => {
    const searchResponse = { items: [{ id: { videoId: "abc123" } }] };
    const videosResponse = {
      items: [{ snippet: { title: "Top 5 Espresso Tips" }, statistics: { viewCount: "1000000" } }],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => searchResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => videosResponse });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeTrendContext("fake-key", "coffee");

    expect(result).toContain("Top 5 Espresso Tips");
    expect(result).toContain("1000000");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when the search request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeTrendContext("fake-key", "coffee");
    expect(result).toBeNull();
  });

  it("returns null when the search request returns no video ids", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeTrendContext("fake-key", "coffee");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeTrendContext("fake-key", "coffee");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/youtube.test.ts`
Expected: FAIL — `Cannot find module '@/lib/youtube'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/youtube/index.ts

/**
 * Fetches a short text summary of high-performing YouTube videos related to
 * `query`, for use as context in the idea-generation prompt. Returns `null`
 * on any failure (network error, non-2xx response, no results) so callers
 * can cleanly fall back to a pure-heuristic generation path rather than
 * failing the whole request.
 */
export async function fetchYoutubeTrendContext(apiKey: string, query: string): Promise<string | null> {
  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=5&q=${encodeURIComponent(query)}&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      return null;
    }
    const searchData = await searchRes.json();
    const videoIds = (searchData.items ?? [])
      .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
      .filter((id: string | undefined): id is string => Boolean(id));

    if (videoIds.length === 0) {
      return null;
    }

    const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(",")}&key=${apiKey}`;
    const videosRes = await fetch(videosUrl);
    if (!videosRes.ok) {
      return null;
    }
    const videosData = await videosRes.json();

    const summaries = (videosData.items ?? []).map(
      (item: { snippet?: { title?: string }; statistics?: { viewCount?: string } }) => {
        const title = item.snippet?.title ?? "Unknown title";
        const views = item.statistics?.viewCount ?? "unknown";
        return `- "${title}" (${views} views)`;
      }
    );

    if (summaries.length === 0) {
      return null;
    }

    return `Similar high-performing videos on YouTube:\n${summaries.join("\n")}`;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/youtube.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/index.ts tests/unit/youtube.test.ts
git commit -m "feat: add YouTube trend-context client with graceful failure fallback"
```

---

## Task 3: Real Claude LLM Client

**Files:**
- Modify: `src/lib/llm/index.ts`
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Add the `@anthropic-ai/sdk` dependency**

In `package.json`, add this line to `"dependencies"` (alphabetically, after `"@prisma/client"`):

```json
    "@anthropic-ai/sdk": "0.32.1",
```

- [ ] **Step 2: Install the new dependency**

Run: `npm install`
Expected: succeeds, `@anthropic-ai/sdk` appears in `node_modules` and `package-lock.json`.

- [ ] **Step 3: Add environment variables**

In `.env.example`, add these lines (after the existing `APP_ENCRYPTION_KEY` line):

```
ANTHROPIC_API_KEY=""
# Optional override — defaults to a current Claude Sonnet model if unset.
ANTHROPIC_MODEL=""
```

- [ ] **Step 4: Replace the stub in `src/lib/llm/index.ts`**

Replace the entire contents of `src/lib/llm/index.ts` with:

```ts
import Anthropic from "@anthropic-ai/sdk";

/**
 * Provider-agnostic text generation interface. Implemented here against the
 * Claude API; a different provider can be swapped in later without changing
 * call sites.
 */
export interface LlmClient {
  generateText(prompt: string): Promise<string>;
}

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

class ClaudeLlmClient implements LlmClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude response contained no text content");
    }

    return textBlock.text;
  }
}

export function getLlmClient(): LlmClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  return new ClaudeLlmClient(apiKey, process.env.ANTHROPIC_MODEL || DEFAULT_MODEL);
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. Note: this cannot be exercised end-to-end without a real `ANTHROPIC_API_KEY` and network access — that's expected. Later tasks mock `getLlmClient`/`generateText` at the module boundary rather than calling the real API in tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/index.ts package.json package-lock.json .env.example
git commit -m "feat: implement lib/llm against the real Claude API, replacing the Phase 1 stub"
```

---

## Task 4: Idea Generation Business Logic — Prompt, Parsing, Score Source

**Files:**
- Create: `src/server/ideas.ts`
- Test: `tests/unit/ideas.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/ideas.test.ts
import { describe, it, expect } from "vitest";
import { buildIdeaPrompt, parseIdeasResponse, determineScoreSource } from "@/server/ideas";

describe("determineScoreSource", () => {
  it("returns REAL_YOUTUBE_DATA when real YouTube data was used", () => {
    expect(determineScoreSource(true)).toBe("REAL_YOUTUBE_DATA");
  });

  it("returns AI_ESTIMATE when no real YouTube data was used", () => {
    expect(determineScoreSource(false)).toBe("AI_ESTIMATE");
  });
});

describe("buildIdeaPrompt", () => {
  it("includes the form inputs", () => {
    const prompt = buildIdeaPrompt({
      channelTopic: "Home coffee brewing",
      primaryNiche: "Specialty coffee",
      targetAudience: "Home baristas 25-40",
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
      youtubeContext: '- "Top 5 Espresso Tips" (1000000 views)',
    });

    expect(prompt).toContain("Top 5 Espresso Tips");
  });

  it("omits the YouTube context section when not provided", () => {
    const prompt = buildIdeaPrompt({
      channelTopic: "Home coffee brewing",
      primaryNiche: "Specialty coffee",
      targetAudience: "Home baristas 25-40",
    });

    expect(prompt).not.toContain("real YouTube trend data");
  });
});

describe("parseIdeasResponse", () => {
  it("parses a plain JSON array", () => {
    const raw = JSON.stringify([{ title: "T1", description: "D1", hook: "H1", viralityScore: 85 }]);

    const ideas = parseIdeasResponse(raw);
    expect(ideas).toHaveLength(1);
    expect(ideas[0].title).toBe("T1");
    expect(ideas[0].viralityScore).toBe(85);
  });

  it("parses a JSON array wrapped in markdown code fences", () => {
    const raw =
      "```json\n" +
      JSON.stringify([{ title: "T1", description: "D1", hook: "H1", viralityScore: 50 }]) +
      "\n```";

    const ideas = parseIdeasResponse(raw);
    expect(ideas).toHaveLength(1);
  });

  it("clamps viralityScore to the 0-100 range", () => {
    const raw = JSON.stringify([{ title: "T1", description: "D1", hook: "H1", viralityScore: 150 }]);

    const ideas = parseIdeasResponse(raw);
    expect(ideas[0].viralityScore).toBe(100);
  });

  it("throws when the response has no JSON array", () => {
    expect(() => parseIdeasResponse("no json here")).toThrow();
  });

  it("throws when an idea is missing required fields", () => {
    const raw = JSON.stringify([{ title: "T1" }]);
    expect(() => parseIdeasResponse(raw)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/ideas.test.ts`
Expected: FAIL — `Cannot find module '@/server/ideas'`

- [ ] **Step 3: Write the implementation**

Create `src/server/ideas.ts` with this content (this is the full file for this task — Task 5 will extend it):

```ts
import type { ScoreSource } from "@prisma/client";

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

  const parsed = JSON.parse(match[0]);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ideas.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/ideas.ts tests/unit/ideas.test.ts
git commit -m "feat: add idea prompt-building, response-parsing, and score-source logic"
```

---

## Task 5: Idea Persistence — `createIdeasForProject`

**Files:**
- Modify: `src/server/ideas.ts`
- Test: `tests/integration/ideas.test.ts`

This requires a live Postgres database to actually run. If no `DATABASE_URL` is reachable in your environment, write the code and test exactly as specified, verify via `npx tsc --noEmit`, and note in your task report that live execution is deferred — this is the same accepted pattern used for `tests/integration/projects.test.ts` in Phase 1.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/ideas.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/llm", () => ({
  getLlmClient: () => ({
    generateText: async () =>
      JSON.stringify([
        { title: "Idea 1", description: "Desc 1", hook: "Hook 1", viralityScore: 70 },
        { title: "Idea 2", description: "Desc 2", hook: "Hook 2", viralityScore: 40 },
      ]),
  }),
}));

import { createIdeasForProject } from "@/server/ideas";

describe("createIdeasForProject", () => {
  beforeEach(async () => {
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

  it("persists ideas with scoreSource AI_ESTIMATE when no YouTube API key is provided", async () => {
    const user = await prisma.user.create({ data: { email: "creator@example.com", name: "Creator" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel", isActive: true, settings: { create: {} } },
    });

    const ideas = await createIdeasForProject(project.id, null, {
      channelTopic: "Home coffee brewing",
      primaryNiche: "Specialty coffee",
      targetAudience: "Home baristas 25-40",
    });

    expect(ideas).toHaveLength(2);
    expect(ideas.every((idea) => idea.scoreSource === "AI_ESTIMATE")).toBe(true);
    expect(ideas[0].title).toBe("Idea 1");

    const stored = await prisma.idea.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/ideas.test.ts`
Expected: FAIL — `Cannot find export 'createIdeasForProject' from '@/server/ideas'` (or similar — the function doesn't exist yet).

- [ ] **Step 3: Add `createIdeasForProject` to `src/server/ideas.ts`**

Append this to the end of `src/server/ideas.ts` (keep everything already in the file from Task 4), adding these two imports at the top of the file alongside the existing `import type { ScoreSource } from "@prisma/client";` line:

```ts
import { prisma } from "@/lib/prisma";
import { getLlmClient } from "@/lib/llm";
import { fetchYoutubeTrendContext } from "@/lib/youtube";
```

Then append at the end of the file:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/ideas.test.ts`
Expected: PASS (1 test), if a live `DATABASE_URL` is reachable. If not, confirm the failure is a database-connectivity error (e.g. "Environment variable not found: DATABASE_URL" or a connection-refused error), not a code/import error — that distinction confirms the code is correct even if unexecutable here.

- [ ] **Step 5: Run `npx tsc --noEmit` regardless of DB availability**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/ideas.ts tests/integration/ideas.test.ts
git commit -m "feat: persist generated ideas via createIdeasForProject"
```

---

## Task 6: API Routes — `POST` / `GET /api/ideas`

**Files:**
- Create: `src/app/api/ideas/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/ideas/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { createIdeasForProject } from "@/server/ideas";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, channelTopic, primaryNiche, targetAudience } = await request.json();
  if (
    typeof projectId !== "string" ||
    typeof channelTopic !== "string" ||
    typeof primaryNiche !== "string" ||
    typeof targetAudience !== "string"
  ) {
    return NextResponse.json(
      { error: "projectId, channelTopic, primaryNiche, and targetAudience are required" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { settings: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const youtubeApiKey = project.settings?.youtubeApiKey ? decrypt(project.settings.youtubeApiKey) : null;

  const ideas = await createIdeasForProject(projectId, youtubeApiKey, {
    channelTopic,
    primaryNiche,
    targetAudience,
  });

  return NextResponse.json({ ideas }, { status: 201 });
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

  const ideas = await prisma.idea.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ideas });
}
```

Note the ownership check pattern (`findFirst({ where: { id, userId } })`) matches `/api/settings` and `/api/projects/active` from Phase 1 — keep it, it's a required security invariant, not optional boilerplate.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/ideas` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ideas/route.ts
git commit -m "feat: add POST/GET /api/ideas routes"
```

---

## Task 7: `useWorkflowStore` Test Coverage

**Files:**
- Test: `tests/unit/useWorkflowStore.test.ts`

`src/store/useWorkflowStore.ts` already exists from Phase 1 (scaffolded, untested). This task only adds test coverage — no changes to the store itself.

- [ ] **Step 1: Write the tests**

```ts
// tests/unit/useWorkflowStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useWorkflowStore } from "@/store/useWorkflowStore";

describe("useWorkflowStore", () => {
  beforeEach(() => {
    useWorkflowStore.setState({ selectedIdeaId: null });
  });

  it("sets the selected idea id", () => {
    useWorkflowStore.getState().setSelectedIdeaId("idea-1");
    expect(useWorkflowStore.getState().selectedIdeaId).toBe("idea-1");
  });

  it("clears the selected idea id", () => {
    useWorkflowStore.getState().setSelectedIdeaId("idea-1");
    useWorkflowStore.getState().setSelectedIdeaId(null);
    expect(useWorkflowStore.getState().selectedIdeaId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/useWorkflowStore.test.ts`
Expected: PASS (2 tests) — the store implementation already exists from Phase 1, so no implementation step is needed here.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/useWorkflowStore.test.ts
git commit -m "test: add coverage for useWorkflowStore.setSelectedIdeaId"
```

---

## Task 8: `IdeaCard` Component

**Files:**
- Create: `src/components/idea-finder/IdeaCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/idea-finder/IdeaCard.tsx
"use client";

import { useRouter } from "next/navigation";
import { useWorkflowStore } from "@/store/useWorkflowStore";

export interface Idea {
  id: string;
  title: string;
  description: string;
  hook: string;
  viralityScore: number;
  scoreSource: "REAL_YOUTUBE_DATA" | "AI_ESTIMATE";
}

const IDEA_ACTIONS = [
  { icon: "📄", label: "Script Writer", href: "/script-writer" },
  { icon: "T", label: "SEO Titles", href: "/seo-titles" },
  { icon: "🔍", label: "Keyword Research", href: "/keyword-research" },
  { icon: "🏷️", label: "Description & Tags", href: "/description-tags" },
  { icon: "🖼️", label: "Thumbnails", href: "/thumbnails" },
];

function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 50) return "#f97316";
  return "#f87171";
}

export function IdeaCard({ idea }: { idea: Idea }) {
  const router = useRouter();
  const setSelectedIdeaId = useWorkflowStore((state) => state.setSelectedIdeaId);

  function useIdeaIn(href: string) {
    setSelectedIdeaId(idea.id);
    router.push(href);
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="flex items-start justify-between">
        <span className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] font-bold text-zinc-200">
          {idea.scoreSource === "REAL_YOUTUBE_DATA" ? "REAL YOUTUBE DATA" : "AI ESTIMATE"}
        </span>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold"
          style={{ borderColor: scoreColor(idea.viralityScore), color: scoreColor(idea.viralityScore) }}
        >
          {idea.viralityScore}
        </div>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-zinc-100">{idea.title}</h3>
      <p className="mt-1 text-xs text-zinc-400">{idea.description}</p>
      <div className="mt-2 rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-zinc-300">
        <span className="font-semibold">Hook:</span> {idea.hook}
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-wide text-zinc-500">Use this idea in</p>
      <div className="mt-1 flex gap-2">
        {IDEA_ACTIONS.map((action) => (
          <button
            key={action.href}
            title={action.label}
            onClick={() => useIdeaIn(action.href)}
            className="rounded-md border border-surface-border px-2 py-1 text-sm text-zinc-300 hover:text-accent"
          >
            {action.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/idea-finder/IdeaCard.tsx
git commit -m "feat: add IdeaCard component with virality score, hook callout, and module-routing actions"
```

---

## Task 9: Idea Finder Page

**Files:**
- Modify: `src/app/(app)/idea-finder/page.tsx`

- [ ] **Step 1: Replace the placeholder with the real page**

Replace the entire contents of `src/app/(app)/idea-finder/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { IdeaCard, type Idea } from "@/components/idea-finder/IdeaCard";

export default function IdeaFinderPage() {
  const { currentProject } = useAppStore();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [channelTopic, setChannelTopic] = useState("");
  const [primaryNiche, setPrimaryNiche] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!currentProject) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => setIdeas(data.ideas ?? []))
      .catch((error) => console.error("Failed to load ideas:", error));
  }, [currentProject]);

  async function generateIdeas() {
    if (!currentProject || !channelTopic.trim() || !primaryNiche.trim() || !targetAudience.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProject.id,
          channelTopic,
          primaryNiche,
          targetAudience,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setIdeas([...data.ideas, ...ideas]);
      } else {
        console.error("Failed to generate ideas:", res.status);
      }
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100">Idea Finder</h1>
      <p className="mt-1 text-sm text-zinc-400">Turn a topic into scored video concepts.</p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <input
          value={channelTopic}
          onChange={(e) => setChannelTopic(e.target.value)}
          placeholder="Channel Topic"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={primaryNiche}
          onChange={(e) => setPrimaryNiche(e.target.value)}
          placeholder="Primary Niche"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="Target Audience"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
      </div>
      <button
        onClick={generateIdeas}
        disabled={isGenerating || !currentProject}
        className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
      >
        {isGenerating ? "Generating..." : "Generate Ideas"}
      </button>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ideas.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/idea-finder` still listed among the routes (now a dynamic client page instead of the static placeholder).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/idea-finder/page.tsx"
git commit -m "feat: replace Idea Finder placeholder with real form and idea card grid"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all non-DB tests pass — `tests/unit/crypto.test.ts` (6), `tests/unit/useAppStore.test.ts` (4), `tests/unit/youtube.test.ts` (4), `tests/unit/ideas.test.ts` (8), `tests/unit/useWorkflowStore.test.ts` (2) = 24 unit tests. `tests/integration/projects.test.ts` (2) and `tests/integration/ideas.test.ts` (1) will fail if no live `DATABASE_URL` is reachable — confirm any such failures are database-connectivity errors, not code errors, consistent with the accepted Phase 1 pattern.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: succeeds, with `/api/ideas` and `/idea-finder` present among the routes alongside everything from Phase 1.

- [ ] **Step 3: Run `npx tsc --noEmit` across the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project, not just files touched in this plan.

- [ ] **Step 4: Manual cross-check**

Read `src/store/useWorkflowStore.ts` and `src/components/idea-finder/IdeaCard.tsx` side by side and confirm `setSelectedIdeaId` is called with the exact same signature both tasks assumed (`(id: string | null) => void`). Read `src/app/(app)/idea-finder/page.tsx` and confirm it imports `Idea` as a type from `@/components/idea-finder/IdeaCard`, matching what that file exports.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: Phase 2 Idea Finder verification pass"
```

(Only run this if Steps 1-4 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** hybrid virality scoring (Task 2 YouTube client + Task 3 Claude client + Task 5 `createIdeasForProject`'s fallback logic), `Idea` persistence (Task 1, Task 5), `GET`/`POST /api/ideas` (Task 6), card UI with circular score/badge/hook/5-icon routing (Task 8), `useWorkflowStore` wiring (Task 7, Task 8, Task 9), real `lib/llm` implementation (Task 3) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO markers. The one deliberately deferred item (live DB execution of integration tests in this sandbox) is called out explicitly with the exact accepted-failure-mode check, not left vague.
- **Type consistency:** `Idea` type in `IdeaCard.tsx` (`id, title, description, hook, viralityScore, scoreSource`) matches the Prisma `Idea` model's shape from Task 1 and what `/api/ideas`'s `GET`/`POST` responses return (Prisma's generated `Idea` rows serialize to exactly these fields via `NextResponse.json`). `GeneratedIdea` (Task 4, pre-persistence) and `Idea` (Task 8, post-persistence, includes `id` and `scoreSource`) are intentionally different types for different stages of the pipeline — not a naming inconsistency. `determineScoreSource`, `buildIdeaPrompt`, `parseIdeasResponse`, `createIdeasForProject` are defined once in Task 4/5 and used with identical signatures in Task 6's route.
