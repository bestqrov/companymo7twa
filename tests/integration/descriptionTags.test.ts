import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const generateText = vi.fn(async (_prompt: string) =>
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
