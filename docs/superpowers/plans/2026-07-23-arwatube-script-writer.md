# ArwaTube AI Engine — Script Writer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Script Writer: a `Script` Prisma model, business logic for generating and regenerating a 5-section script via Claude, four API routes, a section-card component, and a real `/script-writer` page replacing its Phase 1 placeholder.

**Architecture:** `src/server/scripts.ts` holds all testable business logic (prompt building, response parsing, generation orchestration) separate from thin, auth-checked API routes — mirroring `src/server/ideas.ts` and `src/server/thumbnails.ts`. One script per idea is enforced by a unique, nullable `ideaId` column. Individual sections regenerate independently via their own endpoint; manual edits autosave via a separate `PATCH` endpoint. The `/script-writer` page is the second real consumer of `useWorkflowStore.selectedIdeaId` (after Thumbnail Studio), pre-filling the topic from the selected idea and loading that idea's existing script directly if one was already generated.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Claude API (via the already-implemented `lib/llm`), Zustand, Vitest.

---

## File Structure

```
prisma/
  schema.prisma                          (MODIFY: add Script model, ScriptTone enum, relations)

src/
  server/
    scripts.ts                            (NEW: prompt/parse/orchestration logic)
  app/
    api/
      scripts/
        route.ts                           (NEW: POST + GET)
        [id]/
          route.ts                          (NEW: PATCH)
          regenerate/
            route.ts                         (NEW: POST)
    (app)/
      script-writer/
        page.tsx                             (MODIFY: replace placeholder)
  components/
    scripts/
      ScriptSectionCard.tsx                  (NEW)

tests/
  unit/
    scripts.test.ts                          (NEW: pure-function tests)
  integration/
    scripts.test.ts                          (NEW: createScriptForIdeaOrTopic against a real DB, lib/llm mocked)
```

**IMPORTANT — do not run the full test suite against a live database.** A real Supabase `DATABASE_URL` may be present in `.env` in this environment from prior manual testing. Running `npm test` (the full suite) against it previously wiped real user/project/idea data via the integration tests' `beforeEach` cleanup (`deleteMany()` on shared tables). Every task in this plan that runs tests specifies an exact `npx vitest run <specific file>` command — **never run the bare `npm test` or `npx vitest run` with no path argument**. If a `DATABASE_URL` happens to be absent or unreachable, integration tests failing with a connectivity error is an accepted, expected outcome (same pattern as every prior phase) — not a task failure.

---

## Task 1: Prisma Schema — Script Model & ScriptTone Enum

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `ScriptTone` enum**

Add this enum anywhere at the top level (e.g. after the existing `CtrSource` enum):

```prisma
enum ScriptTone {
  ENGAGING
  EDUCATIONAL
  STORYTELLING
  FAST_PACED
}
```

- [ ] **Step 2: Add the `Script` model**

Add this model anywhere at the top level (e.g. after the existing `Thumbnail` model):

```prisma
model Script {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  ideaId    String? @unique
  idea      Idea?   @relation(fields: [ideaId], references: [id], onDelete: SetNull)

  topic String
  tone  ScriptTone

  hook        String
  intro       String
  mainContent String
  cta         String
  ending      String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Note: `topic` is stored on the row (not just derived from a linked idea at generation time) because section regeneration needs the original topic as context, and a script can also exist with no linked idea at all (manually-entered topic).

- [ ] **Step 3: Add the relation fields on `Project` and `Idea`**

Find the `Project` model and add a `scripts Script[]` line alongside its other relation fields:

```prisma
model Project {
  id       String  @id @default(cuid())
  userId   String
  name     String
  isActive Boolean @default(false)

  user       User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  settings   ProjectSettings?
  ideas      Idea[]
  thumbnails Thumbnail[]
  scripts    Script[]

  createdAt DateTime @default(now())
}
```

Find the `Idea` model and add a `script Script?` back-relation line (singular, since `Script.ideaId` is unique — a 1:1 relation):

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

  thumbnails Thumbnail[]
  script     Script?

  createdAt DateTime @default(now())
}
```

- [ ] **Step 4: Format and regenerate**

Run: `npx prisma format` (fixes column alignment automatically)
Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors. This does not require a live database connection.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Script model and ScriptTone enum to Prisma schema"
```

---

## Task 2: Script Business Logic — Prompt Building & Response Parsing

**Files:**
- Create: `src/server/scripts.ts`
- Test: `tests/unit/scripts.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/scripts.test.ts
import { describe, it, expect } from "vitest";
import { buildScriptPrompt, parseScriptResponse, buildSectionRegeneratePrompt } from "@/server/scripts";

describe("buildScriptPrompt", () => {
  it("includes the topic and tone", () => {
    const prompt = buildScriptPrompt({ topic: "Home coffee brewing mistakes", tone: "FAST_PACED" });
    expect(prompt).toContain("Home coffee brewing mistakes");
    expect(prompt).toContain("FAST_PACED");
  });
});

describe("parseScriptResponse", () => {
  const validResponse = {
    hook: "Your coffee is burnt and it's not your fault.",
    intro: "Today we're breaking down five brewing mistakes.",
    mainContent: "Point one: grind size. [B-ROLL: close-up of grinder]",
    cta: "Subscribe for more coffee tips.",
    ending: "See you in the next one.",
  };

  it("parses a plain JSON object", () => {
    const result = parseScriptResponse(JSON.stringify(validResponse));
    expect(result).toEqual(validResponse);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify(validResponse) + "\n```";
    const result = parseScriptResponse(raw);
    expect(result).toEqual(validResponse);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseScriptResponse("no json here")).toThrow();
  });

  it("throws when a required field is missing", () => {
    const incomplete = { hook: "x", intro: "y", mainContent: "z", cta: "w" };
    expect(() => parseScriptResponse(JSON.stringify(incomplete))).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parseScriptResponse("{hook: unquoted}")).toThrow();
  });
});

describe("buildSectionRegeneratePrompt", () => {
  it("includes the topic, tone, section, and current text", () => {
    const prompt = buildSectionRegeneratePrompt({
      topic: "Home coffee brewing mistakes",
      tone: "EDUCATIONAL",
      section: "cta",
      currentSectionText: "Please subscribe.",
    });
    expect(prompt).toContain("Home coffee brewing mistakes");
    expect(prompt).toContain("EDUCATIONAL");
    expect(prompt).toContain("Please subscribe.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/scripts.test.ts`
Expected: FAIL — `Cannot find module '@/server/scripts'`

- [ ] **Step 3: Create `src/server/scripts.ts`** (full file for this task — Task 3 will extend it)

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/scripts.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/scripts.ts tests/unit/scripts.test.ts
git commit -m "feat: add script prompt-building and response-parsing logic"
```

---

## Task 3: Script Generation & Regeneration Orchestration

**Files:**
- Modify: `src/server/scripts.ts`
- Test: `tests/integration/scripts.test.ts`

This requires a live Postgres database to actually run. If no `DATABASE_URL` is reachable, or one is present but you were instructed not to use it against live data, write the code and test exactly as specified, verify via `npx tsc --noEmit`, and note in your report that live execution is deferred. **Do not run the bare `npm test` command in this task — only `npx vitest run tests/integration/scripts.test.ts` as shown below.**

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/scripts.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/llm", () => ({
  getLlmClient: () => ({
    generateText: async () =>
      JSON.stringify({
        hook: "Your coffee is burnt and it's not your fault.",
        intro: "Today we're breaking down five brewing mistakes.",
        mainContent: "Point one: grind size. [B-ROLL: close-up of grinder]",
        cta: "Subscribe for more coffee tips.",
        ending: "See you in the next one.",
      }),
  }),
}));

import { createScriptForIdeaOrTopic } from "@/server/scripts";

describe("createScriptForIdeaOrTopic", () => {
  beforeEach(async () => {
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

  it("generates and persists a new script when no ideaId is given", async () => {
    const user = await prisma.user.create({ data: { email: "creator@example.com", name: "Creator" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel", isActive: true, settings: { create: {} } },
    });

    const result = await createScriptForIdeaOrTopic(project.id, null, {
      topic: "Home coffee brewing mistakes",
      tone: "FAST_PACED",
    });

    expect(result.created).toBe(true);
    expect(result.script.hook).toContain("burnt");
    expect(result.script.tone).toBe("FAST_PACED");

    const stored = await prisma.script.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(1);
  });

  it("returns the existing script for an idea instead of generating a new one", async () => {
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

    const first = await createScriptForIdeaOrTopic(project.id, idea.id, {
      topic: "5 Coffee Mistakes",
      tone: "ENGAGING",
    });
    const second = await createScriptForIdeaOrTopic(project.id, idea.id, {
      topic: "5 Coffee Mistakes",
      tone: "ENGAGING",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.script.id).toBe(first.script.id);

    const stored = await prisma.script.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/scripts.test.ts`
Expected: FAIL — `Cannot find export 'createScriptForIdeaOrTopic' from '@/server/scripts'` (or, if no DB is reachable, a DB-connectivity error at `beforeEach` instead — either is an acceptable "red" state given the environment constraint).

- [ ] **Step 3: Add `createScriptForIdeaOrTopic` and `regenerateScriptSection` to `src/server/scripts.ts`**

Add these two imports at the top of the file, alongside the existing `import type { ScriptTone } from "@prisma/client";` line:

```ts
import { prisma } from "@/lib/prisma";
import { getLlmClient } from "@/lib/llm";
```

Then append this to the end of the file (keep everything already in it from Task 2):

```ts
export async function createScriptForIdeaOrTopic(
  projectId: string,
  ideaId: string | null,
  input: { topic: string; tone: ScriptTone }
) {
  if (ideaId) {
    const existing = await prisma.script.findUnique({ where: { ideaId } });
    if (existing) {
      return { script: existing, created: false };
    }
  }

  const llm = getLlmClient();
  const raw = await llm.generateText(buildScriptPrompt(input));
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

export async function regenerateScriptSection(scriptId: string, section: ScriptSection) {
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId } });

  const llm = getLlmClient();
  const raw = await llm.generateText(
    buildSectionRegeneratePrompt({
      topic: script.topic,
      tone: script.tone,
      section,
      currentSectionText: script[section],
    })
  );

  return prisma.script.update({
    where: { id: scriptId },
    data: { [section]: raw.trim() },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/scripts.test.ts`
Expected: PASS (2 tests), if a live `DATABASE_URL` is reachable and safe to use. If not, confirm the failure is a database-connectivity error, not a code/import error.

- [ ] **Step 5: Run `npx tsc --noEmit` regardless of DB availability**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/scripts.ts tests/integration/scripts.test.ts
git commit -m "feat: add script generation and section-regeneration orchestration"
```

---

## Task 4: API Routes — `POST` / `GET /api/scripts`

**Files:**
- Create: `src/app/api/scripts/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/scripts/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createScriptForIdeaOrTopic } from "@/server/scripts";

const VALID_TONES = ["ENGAGING", "EDUCATIONAL", "STORYTELLING", "FAST_PACED"];

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, ideaId, topic, tone } = await request.json();
  if (typeof projectId !== "string" || typeof topic !== "string" || !VALID_TONES.includes(tone)) {
    return NextResponse.json(
      { error: "projectId, topic, and a valid tone are required" },
      { status: 400 }
    );
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
    result = await createScriptForIdeaOrTopic(projectId, resolvedIdeaId, { topic, tone });
  } catch (error) {
    console.error("Failed to generate script:", error);
    return NextResponse.json({ error: "Failed to generate script. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ script: result.script }, { status: result.created ? 201 : 200 });
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

  const scripts = await prisma.script.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ scripts });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/scripts` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/scripts/route.ts
git commit -m "feat: add POST/GET /api/scripts routes"
```

---

## Task 5: API Route — `PATCH /api/scripts/:id`

**Files:**
- Create: `src/app/api/scripts/[id]/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/scripts/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_SECTIONS = ["hook", "intro", "mainContent", "cta", "ending"];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { section, content } = await request.json();
  if (!VALID_SECTIONS.includes(section) || typeof content !== "string") {
    return NextResponse.json({ error: "A valid section and content are required" }, { status: 400 });
  }

  const script = await prisma.script.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const updated = await prisma.script.update({
    where: { id: params.id },
    data: { [section]: content },
  });

  return NextResponse.json({ script: updated });
}
```

Note the ownership check uses a nested relation filter (`project: { userId: session.user.id }`), matching the exact pattern established in `/api/thumbnails/[id]/save-to-drive/route.ts`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/scripts/[id]` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/scripts/[id]/route.ts"
git commit -m "feat: add PATCH /api/scripts/:id route for manual section edits"
```

---

## Task 6: API Route — `POST /api/scripts/:id/regenerate`

**Files:**
- Create: `src/app/api/scripts/[id]/regenerate/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/scripts/[id]/regenerate/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regenerateScriptSection, type ScriptSection } from "@/server/scripts";

const VALID_SECTIONS = ["hook", "intro", "mainContent", "cta", "ending"];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { section } = await request.json();
  if (!VALID_SECTIONS.includes(section)) {
    return NextResponse.json({ error: "A valid section is required" }, { status: 400 });
  }

  const script = await prisma.script.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  try {
    const updated = await regenerateScriptSection(params.id, section as ScriptSection);
    return NextResponse.json({ script: updated });
  } catch (error) {
    console.error("Failed to regenerate script section:", error);
    return NextResponse.json({ error: "Failed to regenerate section. Please try again." }, { status: 502 });
  }
}
```

Note: `createScriptForIdeaOrTopic` in `/api/scripts` and `regenerateScriptSection` here both call `getLlmClient().generateText(...)`, a genuinely fallible external API call — both routes wrap it in try/catch returning 502, per the pattern fixed into `/api/ideas` and `/api/thumbnails` during their reviews. Don't regress to an unguarded call here.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/scripts/[id]/regenerate` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/scripts/[id]/regenerate/route.ts"
git commit -m "feat: add POST /api/scripts/:id/regenerate route"
```

---

## Task 7: `ScriptSectionCard` Component

**Files:**
- Create: `src/components/scripts/ScriptSectionCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/scripts/ScriptSectionCard.tsx
"use client";

import { useEffect, useState } from "react";

export interface Script {
  id: string;
  ideaId: string | null;
  topic: string;
  tone: "ENGAGING" | "EDUCATIONAL" | "STORYTELLING" | "FAST_PACED";
  hook: string;
  intro: string;
  mainContent: string;
  cta: string;
  ending: string;
}

export type ScriptSectionKey = "hook" | "intro" | "mainContent" | "cta" | "ending";

const SECTION_LABELS: Record<ScriptSectionKey, string> = {
  hook: "Hook",
  intro: "Intro",
  mainContent: "Main Content",
  cta: "CTA",
  ending: "Ending",
};

export function ScriptSectionCard({
  section,
  value,
  onSave,
  onRegenerate,
}: {
  section: ScriptSectionKey;
  value: string;
  onSave: (section: ScriptSectionKey, content: string) => void;
  onRegenerate: (section: ScriptSectionKey) => Promise<void>;
}) {
  const [text, setText] = useState(value);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    setText(value);
  }, [value]);

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await onRegenerate(section);
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">{SECTION_LABELS[section]}</h3>
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-zinc-300 hover:text-accent disabled:opacity-50"
        >
          {isRegenerating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== value) {
            onSave(section, text);
          }
        }}
        rows={section === "mainContent" ? 8 : 3}
        className="mt-2 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-100"
      />
    </div>
  );
}
```

The `useEffect` syncing `text` from `value` is required so that after `onRegenerate` updates the parent's `script` state (and thus this card's `value` prop), the textarea actually shows the new text — without it, the component's local `text` state would stay stuck at whatever the user last typed (or the initial value), silently ignoring the regenerated content.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/scripts/ScriptSectionCard.tsx
git commit -m "feat: add ScriptSectionCard component with autosave and per-section regenerate"
```

---

## Task 8: Script Writer Page

**Files:**
- Modify: `src/app/(app)/script-writer/page.tsx`

- [ ] **Step 1: Replace the placeholder with the real page**

Replace the entire contents of `src/app/(app)/script-writer/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";
import { ScriptSectionCard, type Script, type ScriptSectionKey } from "@/components/scripts/ScriptSectionCard";

const TONES: Script["tone"][] = ["ENGAGING", "EDUCATIONAL", "STORYTELLING", "FAST_PACED"];
const SECTION_ORDER: ScriptSectionKey[] = ["hook", "intro", "mainContent", "cta", "ending"];

export default function ScriptWriterPage() {
  const { currentProject } = useAppStore();
  const selectedIdeaId = useWorkflowStore((state) => state.selectedIdeaId);
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Script["tone"]>("ENGAGING");
  const [script, setScript] = useState<Script | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setScript(null);
    setTopic("");
    setError(null);

    if (!currentProject) return;

    setIsLoading(true);
    fetch(`/api/scripts?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const scripts: Script[] = data.scripts ?? [];
        if (selectedIdeaId) {
          const existing = scripts.find((s) => s.ideaId === selectedIdeaId);
          if (existing) {
            setScript(existing);
          }
        }
      })
      .catch((err) => console.error("Failed to load scripts:", err))
      .finally(() => setIsLoading(false));
  }, [currentProject, selectedIdeaId]);

  useEffect(() => {
    if (!selectedIdeaId || !currentProject || script) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const idea = (data.ideas ?? []).find((i: { id: string }) => i.id === selectedIdeaId);
        if (idea) {
          setTopic(`${idea.title} — ${idea.hook}`);
        }
      })
      .catch((err) => console.error("Failed to load selected idea:", err));
  }, [selectedIdeaId, currentProject, script]);

  async function generate() {
    if (!currentProject || !topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, ideaId: selectedIdeaId, topic, tone }),
      });
      if (res.ok) {
        const data = await res.json();
        setScript(data.script);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to generate script. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate script:", err);
      setError("Failed to generate script. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveSection(section: ScriptSectionKey, content: string) {
    if (!script) return;
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, content }),
      });
      if (res.ok) {
        const data = await res.json();
        setScript(data.script);
      } else {
        console.error("Failed to save section:", res.status);
      }
    } catch (err) {
      console.error("Failed to save section:", err);
    }
  }

  async function regenerateSection(section: ScriptSectionKey) {
    if (!script) return;
    try {
      const res = await fetch(`/api/scripts/${script.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      if (res.ok) {
        const data = await res.json();
        setScript(data.script);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to regenerate section. Please try again.");
      }
    } catch (err) {
      console.error("Failed to regenerate section:", err);
      setError("Failed to regenerate section. Please try again.");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100">Script Writer</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Generate a structured video script with Hook, Intro, Main Content, CTA, and Ending.
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading...</p>
      ) : script ? (
        <div className="mt-6 space-y-4">
          {SECTION_ORDER.map((section) => (
            <ScriptSectionCard
              key={section}
              section={section}
              value={script[section]}
              onSave={saveSection}
              onRegenerate={regenerateSection}
            />
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
          <div className="mt-3 flex w-fit overflow-hidden rounded-md border border-surface-border">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`px-3 py-1.5 text-xs ${tone === t ? "bg-accent text-zinc-900" : "text-zinc-300"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={generate}
            disabled={isGenerating || !currentProject || !topic.trim()}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate Script"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/script-writer` still listed among the routes (now dynamic, not a static placeholder).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/script-writer/page.tsx"
git commit -m "feat: replace Script Writer placeholder with real generation UI, consuming selectedIdeaId"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run the unit test suite (named files only, never the bare `npm test`)**

Run: `npx vitest run tests/unit`
Expected: all unit test files pass, including the 7 new tests in `tests/unit/scripts.test.ts` alongside every prior phase's unit tests (crypto, useAppStore, youtube, ideas, useWorkflowStore, higgsfield, drive, thumbnails).

- [ ] **Step 2: Attempt the integration test for this phase only**

Run: `npx vitest run tests/integration/scripts.test.ts`
Expected: PASS (2 tests) if a live, safe-to-use `DATABASE_URL` is available; otherwise a DB-connectivity error, which is an accepted outcome — do NOT run any other integration test file or the bare `npm test` to "double check", per this plan's standing instruction not to touch the full suite against a live database.

- [ ] **Step 3: Run a full production build**

Run: `npm run build`
Expected: succeeds, with `/api/scripts`, `/api/scripts/[id]`, `/api/scripts/[id]/regenerate`, and `/script-writer` present among the routes alongside everything from prior phases.

- [ ] **Step 4: Run `npx tsc --noEmit` across the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 5: Manual cross-check**

Read `src/components/scripts/ScriptSectionCard.tsx` and `src/app/(app)/script-writer/page.tsx` together and confirm the `Script` type (imported from `ScriptSectionCard.tsx`) matches what `POST`/`GET /api/scripts` actually return (Prisma's `Script` row shape is a superset: `id, projectId, ideaId, topic, tone, hook, intro, mainContent, cta, ending, createdAt, updatedAt` — the component's `Script` interface uses only the fields it needs, which is fine). Confirm `ScriptSection`/`ScriptSectionKey` naming is consistent between `src/server/scripts.ts` (`ScriptSection`) and `ScriptSectionCard.tsx` (`ScriptSectionKey`) — these are two independently-defined types with the same literal union (`"hook"|"intro"|"mainContent"|"cta"|"ending"`), which is intentional (server and component layers don't share a type import), but verify the literal values match exactly.

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "chore: Script Writer verification pass"
```

(Only run this if Steps 1-5 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** `Script` model + `ScriptTone` enum (Task 1), prompt/parse logic (Task 2), generation-with-existing-script-shortcut + section regeneration (Task 3), all 4 API routes (Tasks 4-6), editable/regeneratable section card (Task 7), page wiring including `selectedIdeaId` consumption and existing-script auto-load (Task 8) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO markers.
- **Spec gap found and fixed during planning:** the approved design spec's `Script` data model did not include a `topic` field, but `regenerateScriptSection` (also specified in the same doc) needs the original topic as context to regenerate a section meaningfully, and a script can exist with no linked `Idea` to derive a topic from. Task 1 adds `topic String` to the `Script` model to close this gap — a necessary correction, not scope creep, since the spec's own `regenerate` behavior is unimplementable without it.
- **Type consistency:** `ScriptSection` (server, Task 2/3) and `ScriptSectionKey` (component, Task 7) are separately-defined but identical literal unions — confirmed matching. `createScriptForIdeaOrTopic`'s return shape (`{script, created}`, Task 3) matches how Task 4's route reads it (`result.script`, `result.created`). `regenerateScriptSection`'s signature (`scriptId, section`, Task 3) matches Task 6's route call exactly. The `[section]: content` / `[section]: raw.trim()` dynamic-key Prisma updates in Tasks 5 and 3 both key off the same 5-value `VALID_SECTIONS`/`ScriptSection` set.
- **Standing safety instruction:** every test-running step in this plan specifies an exact file path for `vitest run` and never the bare `npm test`, per the explicit constraint carried over from Phase 3a's live-testing session (running the full suite against a live, in-use `DATABASE_URL` previously deleted real user data).
