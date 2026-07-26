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

const mockGenerateImage = vi.fn(async (_prompt: string) => ({ url: "https://cdn.example.com/cover.png" }));

vi.mock("@/lib/higgsfield", () => ({
  generateImage: (prompt: string) => mockGenerateImage(prompt),
}));

import { createPlatformVariantsForIdeaOrTopic } from "@/server/platformVariants";

describe("createPlatformVariantsForIdeaOrTopic", () => {
  vi.setConfig({ testTimeout: 20000 });

  beforeEach(async () => {
    generateText.mockClear();
    mockGenerateImage.mockClear();
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

    const result = await createPlatformVariantsForIdeaOrTopic(project.id, null, "Home coffee brewing mistakes", "English");

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

    expect(mockGenerateImage).toHaveBeenCalledTimes(1);

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

    const first = await createPlatformVariantsForIdeaOrTopic(project.id, idea.id, "5 Coffee Mistakes", "English");
    const second = await createPlatformVariantsForIdeaOrTopic(project.id, idea.id, "5 Coffee Mistakes", "English");

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

    await createPlatformVariantsForIdeaOrTopic(project.id, idea.id, "5 Coffee Mistakes", "English");

    expect(generateText).toHaveBeenCalledTimes(1);
    const promptSent = generateText.mock.calls[0][0] as string;
    expect(promptSent).toContain("Your coffee is probably wrong");
    expect(promptSent).toContain("Most people over-extract their espresso");
    expect(promptSent).toContain("Stop Ruining Your Coffee");
    expect(promptSent).toContain("#coffeehacks");
  });

  it("passes the target language into the prompt sent to the LLM", async () => {
    const user = await prisma.user.create({ data: { email: "creator-lang@example.com", name: "Creator Lang" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel Lang", isActive: true, settings: { create: {} } },
    });

    await createPlatformVariantsForIdeaOrTopic(project.id, null, "Home coffee brewing mistakes", "French");

    const briefPromptCalls = generateText.mock.calls.map((call) => call[0] as string);
    expect(briefPromptCalls.some((p) => p.includes("French"))).toBe(true);
  });
});
