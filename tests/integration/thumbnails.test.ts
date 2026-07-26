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

    const thumbnails = await createThumbnailsForProject(
      project.id,
      null,
      {
        prompt: "a red espresso cup with dramatic lighting",
        mode: "single",
      },
      "English"
    );

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

    const thumbnails = await createThumbnailsForProject(
      project.id,
      null,
      {
        prompt: "a blue espresso cup",
        mode: "abtest",
      },
      "English"
    );

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

    const thumbnails = await createThumbnailsForProject(
      project.id,
      null,
      {
        prompt: "a green espresso cup",
        mode: "single",
      },
      "English"
    );

    // The image generation succeeded (and was paid for) even though CTR
    // estimation threw, so the thumbnail must still be persisted rather
    // than lost, with a safe fallback CTR value.
    expect(thumbnails).toHaveLength(1);
    expect(thumbnails[0].ctrSource).toBe("AI_ESTIMATE");
    expect(thumbnails[0].ctrEstimate).toBe(5);
    expect(thumbnails[0].imageUrl).toBe("https://higgsfield.ai/img/generated.png");
  });

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
});
