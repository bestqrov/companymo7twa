# VifaTube AI Engine — Phase 3a: Thumbnail Studio & Higgsfield Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Thumbnail Studio: real `lib/higgsfield` (image generation + CTR prediction) and `lib/drive` (Google Drive upload) clients replacing their Phase 1 stubs, a `Thumbnail` Prisma model, `POST`/`GET /api/thumbnails` and `POST /api/thumbnails/:id/save-to-drive` routes, and a real `/thumbnails` page replacing its Phase 1 placeholder.

**Architecture:** `src/lib/higgsfield` and `src/lib/drive` are thin external-service wrappers (mirroring `src/lib/youtube` and `src/lib/llm`'s Phase 1/2 pattern). `src/server/thumbnails.ts` holds the testable business logic — CTR-source determination, the Claude-fallback prompt/parse pair, and `createThumbnailsForProject`, which orchestrates image generation + CTR estimation (Higgsfield first, Claude fallback) + persistence — kept separate from the thin, auth-checked API routes. The `/thumbnails` page is the first real consumer of `useWorkflowStore.selectedIdeaId` (scaffolded in Phase 1, written by Phase 2's `IdeaCard`, unread until now): when a user arrives here via an Idea Finder card, the prompt field is pre-filled from that idea.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Higgsfield REST API (via `fetch`, API Key ID/Secret auth), Google Drive API v3 (multipart upload via `fetch`), Zustand, Vitest.

---

## File Structure

```
prisma/
  schema.prisma                      (MODIFY: add Thumbnail model, CtrSource enum, relations)

src/
  lib/
    higgsfield/
      index.ts                        (MODIFY: replace stub with real client)
    drive/
      index.ts                        (MODIFY: replace stub with real client)
  server/
    thumbnails.ts                     (NEW: CTR logic + createThumbnailsForProject)
  app/
    api/
      thumbnails/
        route.ts                       (NEW: POST + GET)
        [id]/
          save-to-drive/
            route.ts                    (NEW: POST)
    (app)/
      thumbnails/
        page.tsx                        (MODIFY: replace placeholder)
  components/
    thumbnails/
      ThumbnailCard.tsx                 (NEW)

tests/
  unit/
    higgsfield.test.ts                  (NEW)
    drive.test.ts                        (NEW)
    thumbnails.test.ts                    (NEW: pure-function tests)
  integration/
    thumbnails.test.ts                    (NEW: createThumbnailsForProject against a real DB, lib/higgsfield mocked)

.env.example                            (MODIFY: add HIGGSFIELD_API_KEY_ID, HIGGSFIELD_API_KEY_SECRET)
```

**Important note on Higgsfield's exact REST shape:** the precise endpoint paths and response field names below (`/v1/image/generate`, `/v1/predict/ctr`, `url`/`image_url`, `ctr_percent`/`score`) are best-effort placeholders — full Higgsfield API documentation wasn't available at spec time. Every HTTP call is isolated into a small private helper function (`callGenerateImageEndpoint`, `callPredictCtrEndpoint`) specifically so a later correction (real endpoint path, real response field name) only touches that one function, not any call site. If you have access to real Higgsfield API docs while implementing this task, use the real values instead of the placeholders below and note the change in your task report.

---

## Task 1: Prisma Schema — Thumbnail Model & CtrSource Enum

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `CtrSource` enum**

Add this enum anywhere at the top level (e.g. after the existing `ScoreSource` enum):

```prisma
enum CtrSource {
  HIGGSFIELD_PREDICTOR
  AI_ESTIMATE
}
```

- [ ] **Step 2: Add the `Thumbnail` model**

Add this model anywhere at the top level (e.g. after the existing `Idea` model):

```prisma
model Thumbnail {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  ideaId    String?
  idea      Idea?   @relation(fields: [ideaId], references: [id], onDelete: SetNull)

  prompt       String
  imageUrl     String
  ctrEstimate  Int
  ctrSource    CtrSource
  variantGroup String

  createdAt DateTime @default(now())
}
```

- [ ] **Step 3: Add the relation fields on `Project` and `Idea`**

Find the `Project` model and add a `thumbnails Thumbnail[]` line alongside its other relation fields (`ideas Idea[]` should already be there from Phase 2):

```prisma
model Project {
  id       String  @id @default(cuid())
  userId   String
  name     String
  isActive Boolean @default(false)

  user     User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  settings ProjectSettings?
  ideas    Idea[]
  thumbnails Thumbnail[]

  createdAt DateTime @default(now())
}
```

Find the `Idea` model and add a `thumbnails Thumbnail[]` back-relation line:

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

  createdAt DateTime @default(now())
}
```

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Thumbnail model and CtrSource enum to Prisma schema"
```

---

## Task 2: Real Higgsfield Client

**Files:**
- Modify: `src/lib/higgsfield/index.ts`
- Test: `tests/unit/higgsfield.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/higgsfield.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { generateImage, predictCtr } from "@/lib/higgsfield";

beforeEach(() => {
  process.env.HIGGSFIELD_API_KEY_ID = "test-key-id";
  process.env.HIGGSFIELD_API_KEY_SECRET = "test-key-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HIGGSFIELD_API_KEY_ID;
  delete process.env.HIGGSFIELD_API_KEY_SECRET;
});

describe("generateImage", () => {
  it("returns the generated image URL on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://higgsfield.ai/img/abc.png" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage("a red espresso cup");
    expect(result.url).toBe("https://higgsfield.ai/img/abc.png");
  });

  it("throws when the request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Server error" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage("a red espresso cup")).rejects.toThrow();
  });

  it("throws when API credentials are not configured", async () => {
    delete process.env.HIGGSFIELD_API_KEY_ID;
    delete process.env.HIGGSFIELD_API_KEY_SECRET;

    await expect(generateImage("a red espresso cup")).rejects.toThrow();
  });
});

describe("predictCtr", () => {
  it("returns a number on success", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ctr_percent: 8.4 }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await predictCtr("https://higgsfield.ai/img/abc.png", "espresso cup");
    expect(result).toBe(8.4);
  });

  it("returns null when the request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const result = await predictCtr("https://higgsfield.ai/img/abc.png", "espresso cup");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await predictCtr("https://higgsfield.ai/img/abc.png", "espresso cup");
    expect(result).toBeNull();
  });

  it("returns null when credentials are not configured (never throws)", async () => {
    delete process.env.HIGGSFIELD_API_KEY_ID;
    delete process.env.HIGGSFIELD_API_KEY_SECRET;

    const result = await predictCtr("https://higgsfield.ai/img/abc.png", "espresso cup");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/higgsfield.test.ts`
Expected: FAIL — the current stub's `generateImage`/`generateVideo` always throw regardless of input, and `predictCtr` doesn't exist yet, so most of these assertions fail against the Phase 1 stub.

- [ ] **Step 3: Replace the entire contents of `src/lib/higgsfield/index.ts`**

```ts
const HIGGSFIELD_API_BASE = process.env.HIGGSFIELD_API_BASE_URL || "https://api.higgsfield.ai";

function getAuthHeaders(): Record<string, string> {
  const keyId = process.env.HIGGSFIELD_API_KEY_ID;
  const keySecret = process.env.HIGGSFIELD_API_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("HIGGSFIELD_API_KEY_ID / HIGGSFIELD_API_KEY_SECRET is not set");
  }
  return {
    "hf-api-key": keyId,
    "hf-api-secret": keySecret,
    "Content-Type": "application/json",
  };
}

/**
 * Isolated HTTP call for image generation. If Higgsfield's real endpoint path
 * or response field name differs from this placeholder, only this function
 * needs updating — no call sites change.
 */
async function callGenerateImageEndpoint(prompt: string): Promise<{ url: string }> {
  const res = await fetch(`${HIGGSFIELD_API_BASE}/v1/image/generate`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    throw new Error(`Higgsfield generateImage failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const url = data.url ?? data.image_url;
  if (typeof url !== "string") {
    throw new Error("Higgsfield generateImage response did not contain a url");
  }

  return { url };
}

export async function generateImage(prompt: string): Promise<{ url: string }> {
  return callGenerateImageEndpoint(prompt);
}

export async function generateVideo(prompt: string): Promise<{ url: string }> {
  throw new Error("Video generation not yet implemented — see a future phase plan");
}

/**
 * Isolated HTTP call for CTR/virality prediction. Same placeholder-endpoint
 * caveat as callGenerateImageEndpoint above.
 */
async function callPredictCtrEndpoint(imageUrl: string, context: string): Promise<number | null> {
  const res = await fetch(`${HIGGSFIELD_API_BASE}/v1/predict/ctr`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ image_url: imageUrl, context }),
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  const score = data.ctr_percent ?? data.score;
  return typeof score === "number" ? score : null;
}

/**
 * Returns Higgsfield's predicted CTR% for a generated image, or `null` on
 * ANY failure (missing credentials, network error, non-2xx response,
 * unexpected response shape) — never throws, so callers can cleanly fall
 * back to a Claude-based heuristic estimate instead.
 */
export async function predictCtr(imageUrl: string, context: string): Promise<number | null> {
  try {
    return await callPredictCtrEndpoint(imageUrl, context);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/higgsfield.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/higgsfield/index.ts tests/unit/higgsfield.test.ts
git commit -m "feat: implement lib/higgsfield against the real REST API, replacing the Phase 1 stub"
```

---

## Task 3: Real Google Drive Client

**Files:**
- Modify: `src/lib/drive/index.ts`
- Test: `tests/unit/drive.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/drive.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { getDriveClient } from "@/lib/drive";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDriveClient().uploadFile", () => {
  it("uploads a file and returns the Drive fileId", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: "drive-file-123" }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = getDriveClient("fake-access-token");
    const result = await client.uploadFile({
      name: "thumb.png",
      mimeType: "image/png",
      data: Buffer.from("fake-image-bytes"),
    });

    expect(result).toEqual({ fileId: "drive-file-123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("uploadType=multipart");
    expect(options.headers.Authorization).toBe("Bearer fake-access-token");
  });

  it("throws when the upload request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" });
    vi.stubGlobal("fetch", fetchMock);

    const client = getDriveClient("fake-access-token");
    await expect(
      client.uploadFile({ name: "thumb.png", mimeType: "image/png", data: Buffer.from("x") })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/drive.test.ts`
Expected: FAIL — the current stub's `getDriveClient(...).uploadFile` always throws "Drive client not yet implemented", regardless of the mocked `fetch`.

- [ ] **Step 3: Replace the entire contents of `src/lib/drive/index.ts`**

```ts
/**
 * Uploads generated assets to a user's linked Google Drive using the
 * `drive.file` token captured at login (see src/lib/auth.ts).
 */
export interface DriveClient {
  uploadFile(params: { name: string; mimeType: string; data: Buffer }): Promise<{ fileId: string }>;
}

function buildMultipartBody(boundary: string, metadata: object, data: Buffer, mimeType: string): Buffer {
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `--${boundary}--`;

  const metadataPart =
    delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n";
  const mediaPartHeader = delimiter + `Content-Type: ${mimeType}\r\n\r\n`;

  return Buffer.concat([
    Buffer.from(metadataPart, "utf-8"),
    Buffer.from(mediaPartHeader, "utf-8"),
    data,
    Buffer.from("\r\n" + closeDelimiter, "utf-8"),
  ]);
}

class GoogleDriveClient implements DriveClient {
  constructor(private accessToken: string) {}

  async uploadFile(params: { name: string; mimeType: string; data: Buffer }): Promise<{ fileId: string }> {
    const boundary = "vifatube-upload-boundary";
    const body = buildMultipartBody(boundary, { name: params.name, mimeType: params.mimeType }, params.data, params.mimeType);

    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`Google Drive upload failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return { fileId: data.id };
  }
}

export function getDriveClient(accessToken: string): DriveClient {
  return new GoogleDriveClient(accessToken);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/drive.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/drive/index.ts tests/unit/drive.test.ts
git commit -m "feat: implement lib/drive against the real Google Drive API, replacing the Phase 1 stub"
```

---

## Task 4: Thumbnail Business Logic — CTR Source, Fallback Prompt, Parsing

**Files:**
- Create: `src/server/thumbnails.ts`
- Test: `tests/unit/thumbnails.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/thumbnails.test.ts
import { describe, it, expect } from "vitest";
import { determineCtrSource, buildCtrFallbackPrompt, parseCtrFallbackResponse } from "@/server/thumbnails";

describe("determineCtrSource", () => {
  it("returns HIGGSFIELD_PREDICTOR when a predicted CTR is available", () => {
    expect(determineCtrSource(8.4)).toBe("HIGGSFIELD_PREDICTOR");
  });

  it("returns AI_ESTIMATE when no predicted CTR is available", () => {
    expect(determineCtrSource(null)).toBe("AI_ESTIMATE");
  });
});

describe("buildCtrFallbackPrompt", () => {
  it("includes the thumbnail prompt", () => {
    const prompt = buildCtrFallbackPrompt("a red espresso cup with dramatic lighting");
    expect(prompt).toContain("a red espresso cup with dramatic lighting");
  });
});

describe("parseCtrFallbackResponse", () => {
  it("parses a plain JSON object", () => {
    const raw = JSON.stringify({ ctrEstimate: 7 });
    expect(parseCtrFallbackResponse(raw)).toBe(7);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify({ ctrEstimate: 5 }) + "\n```";
    expect(parseCtrFallbackResponse(raw)).toBe(5);
  });

  it("clamps ctrEstimate to the 0-100 range", () => {
    const raw = JSON.stringify({ ctrEstimate: 150 });
    expect(parseCtrFallbackResponse(raw)).toBe(100);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseCtrFallbackResponse("no json here")).toThrow();
  });

  it("throws when ctrEstimate is missing", () => {
    expect(() => parseCtrFallbackResponse(JSON.stringify({ other: 1 }))).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/thumbnails.test.ts`
Expected: FAIL — `Cannot find module '@/server/thumbnails'`

- [ ] **Step 3: Create `src/server/thumbnails.ts`** (full file for this task — Task 5 will extend it)

```ts
import type { CtrSource } from "@prisma/client";

export function determineCtrSource(predictedCtr: number | null): CtrSource {
  return predictedCtr !== null ? "HIGGSFIELD_PREDICTOR" : "AI_ESTIMATE";
}

export function buildCtrFallbackPrompt(thumbnailPrompt: string): string {
  return `You are a YouTube thumbnail expert. A thumbnail was generated from this prompt:
"${thumbnailPrompt}"

Estimate the click-through rate (CTR) this thumbnail would achieve, as a percentage
between 0 and 20 (typical YouTube thumbnail CTRs range from 2% to 15%).

Respond with ONLY a JSON object: {"ctrEstimate": 0-20}
Do not include any text outside the JSON object.`;
}

export function parseCtrFallbackResponse(raw: string): number {
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

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).ctrEstimate !== "number"
  ) {
    throw new Error("Parsed response is missing a numeric ctrEstimate field");
  }

  const ctrEstimate = (parsed as { ctrEstimate: number }).ctrEstimate;
  return Math.max(0, Math.min(100, Math.round(ctrEstimate)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/thumbnails.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/thumbnails.ts tests/unit/thumbnails.test.ts
git commit -m "feat: add CTR-source determination and fallback prompt/parse logic"
```

---

## Task 5: Thumbnail Generation & Persistence — `createThumbnailsForProject`

**Files:**
- Modify: `src/server/thumbnails.ts`
- Test: `tests/integration/thumbnails.test.ts`

This requires a live Postgres database to actually run. If no `DATABASE_URL` is reachable in your environment, write the code and test exactly as specified, verify via `npx tsc --noEmit`, and note in your task report that live execution is deferred — this is the same accepted pattern used for `tests/integration/projects.test.ts` and `tests/integration/ideas.test.ts` in Phases 1 and 2.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/thumbnails.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/higgsfield", () => ({
  generateImage: async () => ({ url: "https://higgsfield.ai/img/generated.png" }),
  predictCtr: async () => null,
}));

vi.mock("@/lib/llm", () => ({
  getLlmClient: () => ({
    generateText: async () => JSON.stringify({ ctrEstimate: 6 }),
  }),
}));

import { createThumbnailsForProject } from "@/server/thumbnails";

describe("createThumbnailsForProject", () => {
  beforeEach(async () => {
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

  it("persists 1 thumbnail with AI_ESTIMATE scoreSource in single mode", async () => {
    const user = await prisma.user.create({ data: { email: "creator@example.com", name: "Creator" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel", isActive: true, settings: { create: {} } },
    });

    const thumbnails = await createThumbnailsForProject(project.id, null, {
      prompt: "a red espresso cup with dramatic lighting",
      mode: "single",
    });

    expect(thumbnails).toHaveLength(1);
    expect(thumbnails[0].ctrSource).toBe("AI_ESTIMATE");
    expect(thumbnails[0].ctrEstimate).toBe(6);
    expect(thumbnails[0].imageUrl).toBe("https://higgsfield.ai/img/generated.png");
  });

  it("persists 4 thumbnails sharing one variantGroup in abtest mode", async () => {
    const user = await prisma.user.create({ data: { email: "creator2@example.com", name: "Creator Two" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel 2", isActive: true, settings: { create: {} } },
    });

    const thumbnails = await createThumbnailsForProject(project.id, null, {
      prompt: "a blue espresso cup",
      mode: "abtest",
    });

    expect(thumbnails).toHaveLength(4);
    const variantGroups = new Set(thumbnails.map((t) => t.variantGroup));
    expect(variantGroups.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/thumbnails.test.ts`
Expected: FAIL — `Cannot find export 'createThumbnailsForProject' from '@/server/thumbnails'` (or, if no DB is reachable, a DB-connectivity error at `beforeEach` instead — either is an acceptable "red" state given the environment constraint above).

- [ ] **Step 3: Add `createThumbnailsForProject` to `src/server/thumbnails.ts`**

Add these two imports at the top of `src/server/thumbnails.ts`, alongside the existing `import type { CtrSource } from "@prisma/client";` line:

```ts
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateImage, predictCtr } from "@/lib/higgsfield";
import { getLlmClient } from "@/lib/llm";
```

Then append this to the end of the file (keep everything already in it from Task 4):

```ts
async function estimateCtrWithFallback(
  imageUrl: string,
  prompt: string
): Promise<{ ctrEstimate: number; ctrSource: CtrSource }> {
  const predicted = await predictCtr(imageUrl, prompt);
  const ctrSource = determineCtrSource(predicted);

  if (ctrSource === "HIGGSFIELD_PREDICTOR" && predicted !== null) {
    return { ctrEstimate: Math.max(0, Math.min(100, Math.round(predicted))), ctrSource };
  }

  const llm = getLlmClient();
  const raw = await llm.generateText(buildCtrFallbackPrompt(prompt));
  const ctrEstimate = parseCtrFallbackResponse(raw);
  return { ctrEstimate, ctrSource };
}

export async function createThumbnailsForProject(
  projectId: string,
  ideaId: string | null,
  input: { prompt: string; mode: "single" | "abtest" }
) {
  const variantCount = input.mode === "abtest" ? 4 : 1;
  const variantGroup = crypto.randomUUID();

  // Generated sequentially (not in parallel) to keep behavior predictable
  // and avoid bursting Higgsfield's API with 4 simultaneous requests.
  const variants: { url: string; ctrEstimate: number; ctrSource: CtrSource }[] = [];
  for (let i = 0; i < variantCount; i++) {
    const { url } = await generateImage(input.prompt);
    const { ctrEstimate, ctrSource } = await estimateCtrWithFallback(url, input.prompt);
    variants.push({ url, ctrEstimate, ctrSource });
  }

  const thumbnails = await prisma.$transaction(
    variants.map((variant) =>
      prisma.thumbnail.create({
        data: {
          projectId,
          ideaId,
          prompt: input.prompt,
          imageUrl: variant.url,
          ctrEstimate: variant.ctrEstimate,
          ctrSource: variant.ctrSource,
          variantGroup,
        },
      })
    )
  );

  return thumbnails;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/thumbnails.test.ts`
Expected: PASS (2 tests), if a live `DATABASE_URL` is reachable. If not, confirm the failure is a database-connectivity error, not a code/import error.

- [ ] **Step 5: Run `npx tsc --noEmit` regardless of DB availability**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/thumbnails.ts tests/integration/thumbnails.test.ts
git commit -m "feat: generate and persist thumbnails via createThumbnailsForProject"
```

---

## Task 6: API Routes — `POST` / `GET /api/thumbnails`

**Files:**
- Create: `src/app/api/thumbnails/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/thumbnails/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createThumbnailsForProject } from "@/server/thumbnails";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, prompt, mode, ideaId } = await request.json();
  if (typeof projectId !== "string" || typeof prompt !== "string" || (mode !== "single" && mode !== "abtest")) {
    return NextResponse.json(
      { error: "projectId, prompt, and a valid mode ('single' or 'abtest') are required" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // ideaId is optional context (pre-filled from Idea Finder); if the id
  // doesn't resolve to a real idea in this project (e.g. deleted since),
  // silently proceed without it rather than failing the whole request.
  let resolvedIdeaId: string | null = null;
  if (typeof ideaId === "string") {
    const idea = await prisma.idea.findFirst({ where: { id: ideaId, projectId } });
    if (idea) {
      resolvedIdeaId = idea.id;
    }
  }

  let thumbnails;
  try {
    thumbnails = await createThumbnailsForProject(projectId, resolvedIdeaId, { prompt, mode });
  } catch (error) {
    console.error("Failed to generate thumbnails:", error);
    return NextResponse.json({ error: "Failed to generate thumbnails. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ thumbnails }, { status: 201 });
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

  const thumbnails = await prisma.thumbnail.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ thumbnails });
}
```

Note: the `createThumbnailsForProject` call is wrapped in try/catch and returns a 502 with a structured error on failure — this follows the exact pattern established (and specifically fixed into place) for `/api/ideas` in Phase 2, where an unguarded call to a genuinely fallible external-API operation was flagged and corrected. Don't regress to an unguarded call here.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/thumbnails` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/thumbnails/route.ts
git commit -m "feat: add POST/GET /api/thumbnails routes"
```

---

## Task 7: API Route — `POST /api/thumbnails/:id/save-to-drive`

**Files:**
- Create: `src/app/api/thumbnails/[id]/save-to-drive/route.ts`

- [ ] **Step 1: Create the route**

```ts
// src/app/api/thumbnails/[id]/save-to-drive/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getDriveClient } from "@/lib/drive";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thumbnail = await prisma.thumbnail.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!thumbnail) {
    return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { googleAccessToken: true },
  });
  if (!user?.googleAccessToken) {
    return NextResponse.json({ error: "Google Drive is not connected" }, { status: 400 });
  }

  try {
    const accessToken = decrypt(user.googleAccessToken);

    const imageRes = await fetch(thumbnail.imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch thumbnail image: ${imageRes.status}`);
    }
    const data = Buffer.from(await imageRes.arrayBuffer());

    const drive = getDriveClient(accessToken);
    const { fileId } = await drive.uploadFile({
      name: `vifatube-thumbnail-${thumbnail.id}.png`,
      mimeType: "image/png",
      data,
    });

    return NextResponse.json({ fileId });
  } catch (error) {
    console.error("Failed to save thumbnail to Drive:", error);
    return NextResponse.json({ error: "Failed to save to Drive. Please try again." }, { status: 502 });
  }
}
```

Note the ownership check uses a nested relation filter (`project: { userId: session.user.id }`) rather than a two-step lookup — this is valid Prisma syntax and keeps the check atomic with the fetch.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, `/api/thumbnails/[id]/save-to-drive` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/thumbnails/[id]/save-to-drive/route.ts"
git commit -m "feat: add POST /api/thumbnails/:id/save-to-drive route"
```

---

## Task 8: `ThumbnailCard` Component

**Files:**
- Create: `src/components/thumbnails/ThumbnailCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/thumbnails/ThumbnailCard.tsx
"use client";

export interface Thumbnail {
  id: string;
  imageUrl: string;
  ctrEstimate: number;
  ctrSource: "HIGGSFIELD_PREDICTOR" | "AI_ESTIMATE";
}

function ctrColor(ctr: number): string {
  if (ctr >= 7) return "#4ade80";
  if (ctr >= 4) return "#f97316";
  return "#f87171";
}

export function ThumbnailCard({
  thumbnail,
  onSaveToDrive,
}: {
  thumbnail: Thumbnail;
  onSaveToDrive: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
      <div className="relative aspect-video overflow-hidden rounded-md bg-surface">
        <img src={thumbnail.imageUrl} alt="Generated thumbnail" className="h-full w-full object-cover" />
        <span
          className="absolute right-2 top-2 rounded px-2 py-0.5 text-[10px] font-bold text-zinc-900"
          style={{ backgroundColor: ctrColor(thumbnail.ctrEstimate) }}
        >
          CTR {thumbnail.ctrEstimate}%
        </span>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-500">
        {thumbnail.ctrSource === "HIGGSFIELD_PREDICTOR" ? "Higgsfield" : "AI Estimate"}
      </p>
      <div className="mt-2 flex gap-2">
        <a
          href={thumbnail.imageUrl}
          download
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-zinc-300 hover:text-accent"
        >
          Download
        </a>
        <button
          onClick={() => onSaveToDrive(thumbnail.id)}
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-zinc-300 hover:text-accent"
        >
          Save to Drive
        </button>
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
git add src/components/thumbnails/ThumbnailCard.tsx
git commit -m "feat: add ThumbnailCard component with CTR badge and Download/Save-to-Drive actions"
```

---

## Task 9: Thumbnails Page

**Files:**
- Modify: `src/app/(app)/thumbnails/page.tsx`

- [ ] **Step 1: Replace the placeholder with the real page**

Replace the entire contents of `src/app/(app)/thumbnails/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";
import { ThumbnailCard, type Thumbnail } from "@/components/thumbnails/ThumbnailCard";

export default function ThumbnailsPage() {
  const { currentProject } = useAppStore();
  const selectedIdeaId = useWorkflowStore((state) => state.selectedIdeaId);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"single" | "abtest">("single");
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrompt("");
    setError(null);

    if (!currentProject) {
      setThumbnails([]);
      return;
    }

    setIsLoading(true);
    fetch(`/api/thumbnails?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => setThumbnails(data.thumbnails ?? []))
      .catch((err) => console.error("Failed to load thumbnails:", err))
      .finally(() => setIsLoading(false));
  }, [currentProject]);

  useEffect(() => {
    if (!selectedIdeaId || !currentProject) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const idea = (data.ideas ?? []).find((i: { id: string }) => i.id === selectedIdeaId);
        if (idea) {
          setPrompt(`${idea.title} — ${idea.hook}`);
        }
      })
      .catch((err) => console.error("Failed to load selected idea:", err));
  }, [selectedIdeaId, currentProject]);

  async function generate() {
    if (!currentProject || !prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProject.id,
          prompt,
          mode,
          ideaId: selectedIdeaId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setThumbnails([...data.thumbnails, ...thumbnails]);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to generate thumbnails. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate thumbnails:", err);
      setError("Failed to generate thumbnails. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveToDrive(id: string) {
    try {
      const res = await fetch(`/api/thumbnails/${id}/save-to-drive`, { method: "POST" });
      if (!res.ok) {
        console.error("Failed to save to Drive:", res.status);
      }
    } catch (err) {
      console.error("Failed to save to Drive:", err);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100">Thumbnail Studio</h1>
      <p className="mt-1 text-sm text-zinc-400">Generate and A/B test thumbnails for your video.</p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the thumbnail you want..."
        rows={3}
        className="mt-4 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
      />

      <div className="mt-3 flex items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-surface-border">
          <button
            onClick={() => setMode("single")}
            className={`px-3 py-1.5 text-xs ${mode === "single" ? "bg-accent text-zinc-900" : "text-zinc-300"}`}
          >
            Single
          </button>
          <button
            onClick={() => setMode("abtest")}
            className={`px-3 py-1.5 text-xs ${mode === "abtest" ? "bg-accent text-zinc-900" : "text-zinc-300"}`}
          >
            A/B Test (4 variations)
          </button>
        </div>
        <button
          onClick={generate}
          disabled={isGenerating || !currentProject || !prompt.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          {isGenerating ? "Generating..." : "Generate"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {isLoading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading thumbnails...</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {thumbnails.map((thumbnail) => (
            <ThumbnailCard key={thumbnail.id} thumbnail={thumbnail} onSaveToDrive={saveToDrive} />
          ))}
        </div>
      )}
    </div>
  );
}
```

This is the first page to actually read `useWorkflowStore.selectedIdeaId` — closing the loop Phase 2's `IdeaCard` opened by writing it but nothing consuming it yet.

- [ ] **Step 2: Add Higgsfield env vars to `.env.example`**

Add these lines to `.env.example` (after the existing `ANTHROPIC_MODEL` line):

```
HIGGSFIELD_API_KEY_ID=""
HIGGSFIELD_API_KEY_SECRET=""
# Optional override if Higgsfield's API base URL differs from the default.
HIGGSFIELD_API_BASE_URL=""
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds, `/thumbnails` still listed among the routes (now dynamic, not a static placeholder).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/thumbnails/page.tsx" .env.example
git commit -m "feat: replace Thumbnail Studio placeholder with real generation UI, consuming selectedIdeaId"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all non-DB unit tests pass — `tests/unit/crypto.test.ts` (6), `tests/unit/useAppStore.test.ts` (4), `tests/unit/youtube.test.ts` (5), `tests/unit/ideas.test.ts` (10), `tests/unit/useWorkflowStore.test.ts` (2), `tests/unit/higgsfield.test.ts` (7), `tests/unit/drive.test.ts` (2), `tests/unit/thumbnails.test.ts` (7) = 43 unit tests. `tests/integration/projects.test.ts` (2), `tests/integration/ideas.test.ts` (1), and `tests/integration/thumbnails.test.ts` (2) will fail if no live `DATABASE_URL` is reachable — confirm any such failures are database-connectivity errors, not code errors, consistent with the accepted pattern from Phases 1 and 2.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: succeeds, with `/api/thumbnails`, `/api/thumbnails/[id]/save-to-drive`, and `/thumbnails` present among the routes alongside everything from Phases 1 and 2.

- [ ] **Step 3: Run `npx tsc --noEmit` across the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 4: Manual cross-check**

Read `src/components/thumbnails/ThumbnailCard.tsx` and `src/app/(app)/thumbnails/page.tsx` side by side and confirm the `Thumbnail` type used by the page (imported from `ThumbnailCard.tsx`) matches what `POST`/`GET /api/thumbnails` actually return (Prisma's `Thumbnail` row shape: `id, projectId, ideaId, prompt, imageUrl, ctrEstimate, ctrSource, variantGroup, createdAt` — a superset of what the component needs, which is fine since it only destructures the fields it uses). Confirm `useWorkflowStore.selectedIdeaId`'s type (`string | null`) matches how the page passes it into the `POST /api/thumbnails` body's `ideaId` field, and that the save-to-drive route's dynamic segment (`[id]`) matches the `fetch(`/api/thumbnails/${id}/save-to-drive`)` call in the page.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: Phase 3a Thumbnail Studio verification pass"
```

(Only run this if Steps 1-4 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** `lib/higgsfield` real implementation with isolated, easily-correctable HTTP calls (Task 2), `lib/drive` real implementation (Task 3), CTR-source/fallback logic (Task 4), generation+persistence orchestration (Task 5), both API route groups (Tasks 6-7), card UI with CTR badge/data-source badge/Download/Save-to-Drive (Task 8), page wiring including `selectedIdeaId` consumption (Task 9) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO markers. The Higgsfield endpoint-shape uncertainty (explicitly flagged in the spec) is handled by isolating the HTTP calls into named helper functions with an explicit code comment, not by leaving a vague "figure this out later" step.
- **Type consistency:** `CtrSource` (Prisma enum, Task 1) → `determineCtrSource`'s return type (Task 4) → `Thumbnail.ctrSource` field (Task 1) → `ThumbnailCard`'s `Thumbnail.ctrSource` union type (Task 8) all agree on the two literal values `HIGGSFIELD_PREDICTOR`/`AI_ESTIMATE`. `createThumbnailsForProject`'s signature (`projectId, ideaId, { prompt, mode }`, Task 5) matches its call site in the API route (Task 6) exactly. `mode: "single" | "abtest"` is consistent between the route's validation (Task 6), `createThumbnailsForProject`'s parameter type (Task 5), and the page's `useState<"single" | "abtest">` (Task 9).
