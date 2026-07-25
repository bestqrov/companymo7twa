# ArwaTube AI Engine — Thumbnail Studio Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `src/server/thumbnails.ts`'s generation pipeline: replace the static cutout-template prompt with a two-step Claude-directed pipeline (a "creative brief" JSON call, then a deterministic template that assembles the final image prompt), fix the bug where all 4 A/B variants used the identical prompt, and bake the headline text directly into the AI image instead of compositing it afterward.

**Architecture:** Task 1 adds the new pure functions (`ThumbnailCreativeBrief`, `buildThumbnailBriefPrompt`, `parseThumbnailBriefResponse`, `buildThumbnailImagePromptFromBrief`, `VARIATION_HINTS`) alongside the existing code with their own unit tests — nothing is removed yet, so the file compiles and all existing tests keep passing throughout. Task 2 rewires `createThumbnailsForProject` to use the new pipeline, deletes the now-dead old functions (`buildThumbnailImagePrompt`, `buildHeadlinePrompt`, `deriveThumbnailHeadline`, `compositeHeadlineOntoImage`, and their only helpers `escapeXml`/`wrapHeadline`), drops the `sharp` import, and updates the integration test's mock to handle two distinct `generateText` calls per variant (brief generation vs. CTR fallback).

**Tech Stack:** TypeScript, Prisma, Claude API (via `lib/llm`), Higgsfield image generation (via `lib/higgsfield`), Vitest.

---

## File Structure

```
src/
  server/
    thumbnails.ts                (MODIFY: new brief pipeline added in Task 1, old code removed + createThumbnailsForProject rewired in Task 2)

tests/
  unit/
    thumbnails.test.ts           (MODIFY: new describe blocks added in Task 1, old ones removed in Task 2)
  integration/
    thumbnails.test.ts           (MODIFY: mock updated in Task 2 to branch per call)
```

No Prisma schema changes. No API route changes (`src/app/api/thumbnails/route.ts` is untouched — it only calls `createThumbnailsForProject`, whose signature is unchanged). The `sharp` npm package is left in `package.json` (removing an unused devDependency and touching the lockfile is unnecessary churn for this change) — only its `import` and usage in `src/server/thumbnails.ts`/`tests/unit/thumbnails.test.ts` are removed.

**IMPORTANT — do not run the full test suite against a live database.** Every task in this plan that runs tests specifies an exact `npx vitest run <specific file>` command — **never run the bare `npm test` or `npx vitest run` with no path argument**. If a `DATABASE_URL` happens to be absent or unreachable in the implementation worktree, integration test failures with a connectivity error are an accepted, expected outcome — not a task failure.

---

## Task 1: New Creative-Brief Pipeline (Additive — Nothing Removed Yet)

**Files:**
- Modify: `src/server/thumbnails.ts` (add new code, don't remove anything)
- Modify: `tests/unit/thumbnails.test.ts` (add new tests, don't remove anything)

- [ ] **Step 1: Write the failing tests**

Add these imports and describe blocks to `tests/unit/thumbnails.test.ts`, **on top of** its existing content (don't remove the existing `sharp` import or any existing describe block yet — that happens in Task 2):

```ts
// Add these three names to the existing `import { ... } from "@/server/thumbnails";` block:
//   buildThumbnailBriefPrompt, parseThumbnailBriefResponse, buildThumbnailImagePromptFromBrief, VARIATION_HINTS
```

The full updated import statement:

```ts
import {
  determineCtrSource,
  buildCtrFallbackPrompt,
  parseCtrFallbackResponse,
  buildThumbnailImagePrompt,
  buildHeadlinePrompt,
  compositeHeadlineOntoImage,
  buildThumbnailBriefPrompt,
  parseThumbnailBriefResponse,
  buildThumbnailImagePromptFromBrief,
  VARIATION_HINTS,
} from "@/server/thumbnails";
```

Then append these new `describe` blocks anywhere in the file (e.g. at the end):

```ts
describe("buildThumbnailBriefPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildThumbnailBriefPrompt({
      topic: "I made $1,000 in 7 days with zero followers",
      variationHint: VARIATION_HINTS[0],
    });
    expect(prompt).toContain("I made $1,000 in 7 days with zero followers");
  });

  it("includes the designer-principles boilerplate", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0] });
    expect(prompt).toContain("Before vs After whenever possible");
    expect(prompt).toContain("Photorealistic");
    expect(prompt).toContain("MrBeast");
  });

  it("includes the given variation hint", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[2] });
    expect(prompt).toContain("day-1-vs-day-7 split panel");
  });

  it("includes idea/script/title context when provided", () => {
    const prompt = buildThumbnailBriefPrompt({
      topic: "any topic",
      variationHint: VARIATION_HINTS[0],
      ideaTitle: "5 Coffee Mistakes",
      scriptHook: "Your coffee is probably wrong",
      selectedTitle: "Stop Ruining Your Coffee",
    });
    expect(prompt).toContain("5 Coffee Mistakes");
    expect(prompt).toContain("Your coffee is probably wrong");
    expect(prompt).toContain("Stop Ruining Your Coffee");
  });

  it("omits context sections when not provided", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0] });
    expect(prompt).not.toContain("working title");
    expect(prompt).not.toContain("script opens with");
    expect(prompt).not.toContain("already chosen this title");
  });

  it("exports exactly 4 variation hints, one per composition pattern", () => {
    expect(VARIATION_HINTS).toHaveLength(4);
    expect(VARIATION_HINTS[0]).toContain("phone-to-laptop transformation");
    expect(VARIATION_HINTS[1]).toContain("zero-to-something reveal");
    expect(VARIATION_HINTS[2]).toContain("day-1-vs-day-7 split panel");
    expect(VARIATION_HINTS[3]).toContain("secret-reveal");
  });
});

describe("parseThumbnailBriefResponse", () => {
  const validBrief = {
    niche: "personal finance",
    story: "went from broke to profitable in a week",
    person: "a young entrepreneur in his 20s",
    emotion: "shocked, wide-eyed disbelief",
    before: "$12.43 bank balance",
    after: "$1,000 earnings",
    object: "smartphone and laptop",
    background: "dark cinematic home office",
    color: "green and red",
    compositionPattern: "phone-to-laptop transformation",
    thumbnailText: "$12 → $1,000",
    negativePrompt:
      "blurry, low quality, watermark, logo, illustration, cartoon, extra hands, extra fingers, duplicate people, cropped face, noise",
  };

  it("parses a plain JSON object", () => {
    const result = parseThumbnailBriefResponse(JSON.stringify(validBrief));
    expect(result).toEqual(validBrief);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify(validBrief) + "\n```";
    expect(parseThumbnailBriefResponse(raw)).toEqual(validBrief);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseThumbnailBriefResponse("no json here")).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parseThumbnailBriefResponse("{niche: unquoted}")).toThrow();
  });

  const requiredFields = [
    "niche",
    "story",
    "person",
    "emotion",
    "before",
    "after",
    "object",
    "background",
    "color",
    "compositionPattern",
    "thumbnailText",
    "negativePrompt",
  ] as const;

  for (const field of requiredFields) {
    it(`throws when ${field} is missing`, () => {
      const invalid: Record<string, unknown> = { ...validBrief };
      delete invalid[field];
      expect(() => parseThumbnailBriefResponse(JSON.stringify(invalid))).toThrow();
    });

    it(`throws when ${field} is an empty string`, () => {
      const invalid = { ...validBrief, [field]: "" };
      expect(() => parseThumbnailBriefResponse(JSON.stringify(invalid))).toThrow();
    });
  }
});

describe("buildThumbnailImagePromptFromBrief", () => {
  it("includes every brief field, the bold typography line, and the negative prompt line", () => {
    const brief = {
      niche: "personal finance",
      story: "went from broke to profitable in a week",
      person: "a young entrepreneur in his 20s",
      emotion: "shocked, wide-eyed disbelief",
      before: "$12.43 bank balance",
      after: "$1,000 earnings",
      object: "smartphone and laptop",
      background: "dark cinematic home office",
      color: "green and red",
      compositionPattern: "phone-to-laptop transformation with a bold arrow",
      thumbnailText: "$12 → $1,000",
      negativePrompt: "blurry, low quality, watermark",
    };

    const prompt = buildThumbnailImagePromptFromBrief(brief);

    expect(prompt).toContain(brief.person);
    expect(prompt).toContain(brief.story);
    expect(prompt).toContain(brief.before);
    expect(prompt).toContain(brief.after);
    expect(prompt).toContain(brief.object);
    expect(prompt).toContain(brief.background);
    expect(prompt).toContain(brief.color);
    expect(prompt).toContain(brief.compositionPattern);
    expect(prompt).toContain(`Bold typography: "${brief.thumbnailText}"`);
    expect(prompt).toContain(`Negative prompt: ${brief.negativePrompt}`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/thumbnails.test.ts`
Expected: FAIL — `buildThumbnailBriefPrompt` (and the other 3 new names) are not exported from `@/server/thumbnails`.

- [ ] **Step 3: Add the new pipeline to `src/server/thumbnails.ts`**

Insert this new code block into `src/server/thumbnails.ts` directly after the existing imports (before `export function determineCtrSource`) — everything already in the file stays exactly as-is for this task:

```ts
export interface ThumbnailCreativeBrief {
  niche: string;
  story: string;
  person: string;
  emotion: string;
  before: string;
  after: string;
  object: string;
  background: string;
  color: string;
  compositionPattern: string;
  thumbnailText: string;
  negativePrompt: string;
}

/**
 * Four concrete, structural composition patterns — not abstract mood words
 * like "money/charts if relevant" — so the model consistently produces the
 * specific composited-mockup look (phone/laptop screenshots, before/after
 * panels, circled callouts) instead of drifting toward a generic
 * photorealistic portrait. Cycled by variant index so a 4-variant A/B batch
 * always spans all 4 patterns instead of 4 samples of one vague prompt.
 */
export const VARIATION_HINTS: string[] = [
  'Use the "phone-to-laptop transformation" composition: the subject holds a phone showing a stark before-number, with a laptop beside or behind them showing an after-number with a rising graph, connected by one big bold colored arrow between the two numbers.',
  'Use the "zero-to-something reveal" composition: the subject shows a phone/app screen with a stark "0" starting stat next to a calendar or counter prop showing a time span, with a second device or graphic showing the achieved result in bright green.',
  'Use the "day-1-vs-day-7 split panel" composition: the frame is split in two with a hard vertical divider (often a lightning-bolt or jagged crack line) — left side shows the subject dejected/before labeled "before", right side shows the same subject triumphant/after labeled "after", with a result graphic anchoring the "after" side.',
  'Use the "secret-reveal / callout" composition: the subject makes a hushing or pointing gesture directly at camera, with a screenshot or dashboard graphic beside them showing one specific number or row circled/highlighted in bright red as the detail nobody told them.',
];

export interface ThumbnailBriefInput {
  topic: string;
  variationHint: string;
  ideaTitle?: string | null;
  scriptHook?: string | null;
  selectedTitle?: string | null;
}

export function buildThumbnailBriefPrompt(input: ThumbnailBriefInput): string {
  const contextBlock = [
    input.ideaTitle ? `\nThis video's working title: "${input.ideaTitle}"` : "",
    input.scriptHook ? `\nThe video's script opens with this hook: "${input.scriptHook}"` : "",
    input.selectedTitle ? `\nThe creator has already chosen this title: "${input.selectedTitle}"` : "",
  ].join("");

  return `You are the world's best YouTube Thumbnail Designer.

Your mission is to create thumbnails with an extremely high click-through rate (CTR).

Your thumbnails must instantly communicate curiosity, emotion and transformation in less than one second.

Always follow these principles:
- One clear subject only.
- Extreme facial expression.
- High contrast.
- Cinematic lighting.
- Rich colors.
- Simple composition.
- Big visual story.
- Before vs After whenever possible.
- Money, charts, arrows and glowing objects if relevant.
- Clean background.
- No clutter.
- No watermark.
- No logo.
- No extra objects.
- Photorealistic.
- Premium DSLR look.
- 8K details.
- Hyper realistic skin.
- Professional color grading.
- Dramatic shadows.
- Wide aperture.
- Sharp eyes.
- High dynamic range.
- Designed specifically for YouTube CTR.

The thumbnail must look better than thumbnails from: MrBeast, Alex Hormozi, Iman Gadzhi, Ali Abdaal, Finance YouTubers, Business YouTubers.

Never create illustrations unless requested. Always generate photorealistic images. Aspect ratio 16:9.

These are the 4 composition patterns you can choose between:
1. Phone-to-laptop transformation: the subject holds a phone showing a stark before-number, with a laptop beside or behind them showing an after-number with a rising graph, connected by one big bold colored arrow between the two numbers.
2. Zero-to-something reveal: the subject shows a phone/app screen with a stark "0" starting stat next to a calendar or counter prop showing a time span, with a second device or graphic showing the achieved result in bright green.
3. Day-1-vs-day-7 split panel: the frame is split in two with a hard vertical divider (often a lightning-bolt or jagged crack line) — left side shows the subject dejected/before labeled "before", right side shows the same subject triumphant/after labeled "after", with a result graphic anchoring the "after" side.
4. Secret-reveal / callout: the subject makes a hushing or pointing gesture directly at camera, with a screenshot or dashboard graphic beside them showing one specific number or row circled/highlighted in bright red as the detail nobody told them.

For THIS thumbnail specifically: ${input.variationHint}

TOPIC: ${input.topic}${contextBlock}

Invent the specific creative details that fit this topic and composition pattern. Respond with ONLY a JSON object shaped like:
{"niche": "...", "story": "...", "person": "...", "emotion": "...", "before": "...", "after": "...", "object": "...", "background": "...", "color": "...", "compositionPattern": "...", "thumbnailText": "...", "negativePrompt": "..."}

"compositionPattern" must be a short restatement of which of the 4 composition patterns above you chose (matching the one given in "For THIS thumbnail specifically" above). "thumbnailText" is the exact bold on-thumbnail text (short, punchy, e.g. "$12 → $1,000"). "negativePrompt" is a comma-separated list of things to avoid in the image (e.g. "blurry, low quality, watermark, logo, illustration, cartoon, extra hands, extra fingers, duplicate people, cropped face, noise").

Do not include any text outside the JSON object.`;
}

const REQUIRED_BRIEF_FIELDS = [
  "niche",
  "story",
  "person",
  "emotion",
  "before",
  "after",
  "object",
  "background",
  "color",
  "compositionPattern",
  "thumbnailText",
  "negativePrompt",
] as const;

export function parseThumbnailBriefResponse(raw: string): ThumbnailCreativeBrief {
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

  for (const field of REQUIRED_BRIEF_FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Parsed response must have a non-empty "${field}" string`);
    }
  }

  return record as unknown as ThumbnailCreativeBrief;
}

export function buildThumbnailImagePromptFromBrief(brief: ThumbnailCreativeBrief): string {
  return `Create an ultra high CTR YouTube thumbnail.

${brief.person}, ${brief.emotion}. ${brief.story}

Composition: ${brief.compositionPattern} Before: ${brief.before} After: ${brief.after} Important object: ${brief.object}

Background: ${brief.background}
Main color: ${brief.color}

Photorealistic. Premium DSLR quality. Sony A7R V DSLR quality. 85mm lens. f1.4. HDR. 8K. Hyper realistic skin. Professional color grading. Dramatic shadows. Wide aperture. Sharp eyes. High dynamic range. Cinematic lighting. Clean composition. No clutter. Large negative space.

Bold typography: "${brief.thumbnailText}"

MrBeast style. Alex Hormozi style. Designed for maximum YouTube CTR.

16:9

Negative prompt: ${brief.negativePrompt}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/thumbnails.test.ts`
Expected: PASS — all existing tests still pass (nothing removed yet) plus all new tests pass (should be in the 40s count given the per-field loop generates 24 tests alone).

- [ ] **Step 5: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/thumbnails.ts tests/unit/thumbnails.test.ts
git commit -m "feat: add creative-brief-directed thumbnail prompt pipeline"
```

---

## Task 2: Rewire Generation, Remove Old Pipeline

**Files:**
- Modify: `src/server/thumbnails.ts`
- Modify: `tests/unit/thumbnails.test.ts`
- Modify: `tests/integration/thumbnails.test.ts`

- [ ] **Step 1: Remove the now-dead old functions from `src/server/thumbnails.ts`**

Delete these from the file entirely (they're being replaced by the Task 1 pipeline):
- `import sharp from "sharp";` (the import line)
- `buildThumbnailImagePrompt` (the whole function)
- `buildHeadlinePrompt` (the whole function)
- `deriveThumbnailHeadline` (the whole function)
- `escapeXml` (the whole function — only used by `compositeHeadlineOntoImage`)
- `wrapHeadline` (the whole function — only used by `compositeHeadlineOntoImage`)
- `compositeHeadlineOntoImage` (the whole function)

Everything else in the file (the Task 1 additions, `determineCtrSource`, `buildCtrFallbackPrompt`, `parseCtrFallbackResponse`, `estimateCtrWithFallback`) stays unchanged.

- [ ] **Step 2: Add a workflow-context helper and rewrite `createThumbnailsForProject`**

Add this helper directly above `createThumbnailsForProject`:

```ts
async function fetchThumbnailContext(
  ideaId: string | null
): Promise<{ ideaTitle: string | null; scriptHook: string | null; selectedTitle: string | null }> {
  if (!ideaId) {
    return { ideaTitle: null, scriptHook: null, selectedTitle: null };
  }

  const [idea, script, titleSet] = await Promise.all([
    prisma.idea.findUnique({ where: { id: ideaId }, select: { title: true } }),
    prisma.script.findUnique({ where: { ideaId } }),
    prisma.titleSet.findUnique({ where: { ideaId } }),
  ]);

  return {
    ideaTitle: idea?.title ?? null,
    scriptHook: script?.hook ?? null,
    selectedTitle: titleSet?.selectedTitle ?? null,
  };
}
```

Replace the entire body of `createThumbnailsForProject` with:

```ts
export async function createThumbnailsForProject(
  projectId: string,
  ideaId: string | null,
  input: { prompt: string; mode: "single" | "abtest" }
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

Note: `imageUrl` now stores the Higgsfield-hosted URL directly — no more base64 data-URI compositing. `estimateCtrWithFallback` is unchanged and now receives each variant's real assembled `finalPrompt` instead of the previously-shared raw `input.prompt`, so CTR estimates genuinely differ per variant too.

- [ ] **Step 3: Remove the now-dead old tests from `tests/unit/thumbnails.test.ts`**

Remove the `sharp` import line (`import sharp from "sharp";`), remove `buildThumbnailImagePrompt`, `buildHeadlinePrompt`, and `compositeHeadlineOntoImage` from the `@/server/thumbnails` import list, and delete these three `describe` blocks entirely: `describe("buildThumbnailImagePrompt", ...)`, `describe("buildHeadlinePrompt", ...)`, `describe("compositeHeadlineOntoImage", ...)`. Everything else in the file (the Task 1 additions and the `determineCtrSource`/`buildCtrFallbackPrompt`/`parseCtrFallbackResponse` blocks) stays.

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `npx vitest run tests/unit/thumbnails.test.ts`
Expected: PASS, no `sharp`-related or old-function-related failures.

- [ ] **Step 5: Update the integration test's mocks**

Replace the entire contents of `tests/integration/thumbnails.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/higgsfield", () => ({
  generateImage: async () => ({ url: "https://higgsfield.ai/img/generated.png" }),
  predictCtr: async () => null,
}));

const validBrief = {
  niche: "personal finance",
  story: "went from broke to profitable in a week",
  person: "a young entrepreneur in his 20s",
  emotion: "shocked, wide-eyed disbelief",
  before: "$12.43 bank balance",
  after: "$1,000 earnings",
  object: "smartphone and laptop",
  background: "dark cinematic home office",
  color: "green and red",
  compositionPattern: "phone-to-laptop transformation",
  thumbnailText: "$12 → $1,000",
  negativePrompt: "blurry, low quality, watermark",
};

// generateText is called twice per variant under the new pipeline: once to
// generate the creative brief, once (via estimateCtrWithFallback's LLM
// fallback) to estimate CTR. buildCtrFallbackPrompt's own template literally
// contains the string `{"ctrEstimate": 0-20}`, so branching on that
// substring reliably tells the two calls apart — the brief prompt never
// contains it.
const generateText = vi.fn(async (prompt: string) => {
  if (prompt.includes("ctrEstimate")) {
    return JSON.stringify({ ctrEstimate: 6 });
  }
  return JSON.stringify(validBrief);
});

vi.mock("@/lib/llm", () => ({
  getLlmClient: () => ({
    generateText,
  }),
}));

import { createThumbnailsForProject } from "@/server/thumbnails";

describe("createThumbnailsForProject", () => {
  beforeEach(async () => {
    generateText.mockClear();
    generateText.mockImplementation(async (prompt: string) => {
      if (prompt.includes("ctrEstimate")) {
        return JSON.stringify({ ctrEstimate: 6 });
      }
      return JSON.stringify(validBrief);
    });
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

  it("persists 4 thumbnails sharing one variantGroup in abtest mode, each from a different brief prompt", async () => {
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

    const briefPromptCalls = generateText.mock.calls
      .map((call) => call[0] as string)
      .filter((prompt) => !prompt.includes("ctrEstimate"));
    expect(briefPromptCalls).toHaveLength(4);
    const uniqueVariationHints = new Set(
      briefPromptCalls.map((p) => p.split("For THIS thumbnail specifically:")[1])
    );
    expect(uniqueVariationHints.size).toBe(4);
  });

  it("persists the thumbnail with a neutral fallback CTR when CTR estimation throws", async () => {
    generateText.mockImplementation(async (prompt: string) => {
      if (prompt.includes("ctrEstimate")) {
        throw new Error("Claude API failure");
      }
      return JSON.stringify(validBrief);
    });

    const user = await prisma.user.create({ data: { email: "creator3@example.com", name: "Creator Three" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel 3", isActive: true, settings: { create: {} } },
    });

    const thumbnails = await createThumbnailsForProject(project.id, null, {
      prompt: "a green espresso cup",
      mode: "single",
    });

    // The image generation succeeded (and was paid for) even though CTR
    // estimation threw, so the thumbnail must still be persisted rather
    // than lost, with a safe fallback CTR value.
    expect(thumbnails).toHaveLength(1);
    expect(thumbnails[0].ctrSource).toBe("AI_ESTIMATE");
    expect(thumbnails[0].ctrEstimate).toBe(5);
    expect(thumbnails[0].imageUrl).toBe("https://higgsfield.ai/img/generated.png");
  });
});
```

- [ ] **Step 6: Run the integration test to verify it passes**

Run: `npx vitest run tests/integration/thumbnails.test.ts`
Expected: PASS (3 tests), if a live `DATABASE_URL` is reachable and safe to use. If not, confirm the failure is a database-connectivity error, not a code/import error.

- [ ] **Step 7: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/thumbnails.ts tests/unit/thumbnails.test.ts tests/integration/thumbnails.test.ts
git commit -m "feat: rewire thumbnail generation to the creative-brief pipeline, remove old template"
```

---

## Task 3: Final Verification

- [ ] **Step 1: Run the unit test suite (named files only, never the bare `npm test`)**

Run: `npx vitest run tests/unit`
Expected: all unit test files pass, including the rewritten `tests/unit/thumbnails.test.ts`, alongside every prior phase's unit tests.

- [ ] **Step 2: Attempt the integration test for this phase only**

Run: `npx vitest run tests/integration/thumbnails.test.ts`
Expected: PASS (3 tests) if a live, safe-to-use `DATABASE_URL` is available; otherwise a DB-connectivity error, which is an accepted outcome — do NOT run any other integration test file or the bare `npm test` to "double check".

- [ ] **Step 3: Run a full production build**

Run: `npm run build`
Expected: succeeds — no route changes expected, but confirms nothing else in the app broke (e.g. anything importing `sharp`-related exports from `src/server/thumbnails.ts` that no longer exist).

- [ ] **Step 4: Run `npx tsc --noEmit` across the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: Thumbnail Studio rework verification pass"
```

(Only run this if Steps 1-4 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** `ThumbnailCreativeBrief` + 4 composition patterns + `VARIATION_HINTS` (Task 1), `buildThumbnailBriefPrompt`/`parseThumbnailBriefResponse`/`buildThumbnailImagePromptFromBrief` (Task 1), removal of the old template/headline/compositing functions and the `sharp` import (Task 2), rewired `createThumbnailsForProject` with per-variant variation and context-fetching (Task 2), per-variant CTR estimation using the real assembled prompt (Task 2), updated integration test mocks distinguishing the two `generateText` call sites (Task 2) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO markers.
- **Type consistency:** `ThumbnailCreativeBrief`'s 12 fields (Task 1) match exactly between `parseThumbnailBriefResponse`'s `REQUIRED_BRIEF_FIELDS` list, `buildThumbnailImagePromptFromBrief`'s field usages, and both test files' `validBrief`/sample-brief objects. `ThumbnailBriefInput`'s optional `ideaTitle`/`scriptHook`/`selectedTitle` fields (Task 1) match exactly what `fetchThumbnailContext` returns and what `createThumbnailsForProject` passes into `buildThumbnailBriefPrompt` (Task 2). No leftover references to deleted functions (`buildThumbnailImagePrompt`, `buildHeadlinePrompt`, `deriveThumbnailHeadline`, `compositeHeadlineOntoImage`, `escapeXml`, `wrapHeadline`) anywhere after Task 2.
- **Two-phase additive-then-subtractive structure:** deliberately chosen so the file compiles and all existing tests pass after Task 1 alone, minimizing the window where the file is in a broken intermediate state — standard TDD safety net, especially valuable here since this is a rework of shipped code rather than a green-field addition.
- **Standing safety instruction:** every test-running step in this plan specifies an exact file path for `vitest run` and never the bare `npm test`.
