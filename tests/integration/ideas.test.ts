import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const generateText = vi.fn(async (_prompt: string) =>
  JSON.stringify([
    { title: "Idea 1", description: "Desc 1", hook: "Hook 1", viralityScore: 70 },
    { title: "Idea 2", description: "Desc 2", hook: "Hook 2", viralityScore: 40 },
  ])
);

vi.mock("@/lib/llm", () => ({
  getLlmClient: () => ({ generateText }),
}));

import { createIdeasForProject } from "@/server/ideas";

describe("createIdeasForProject", () => {
  beforeEach(async () => {
    generateText.mockClear();
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

    const ideas = await createIdeasForProject(
      project.id,
      null,
      {
        channelTopic: "Home coffee brewing",
        primaryNiche: "Specialty coffee",
        targetAudience: "Home baristas 25-40",
      },
      "English"
    );

    expect(ideas).toHaveLength(2);
    expect(ideas.every((idea) => idea.scoreSource === "AI_ESTIMATE")).toBe(true);
    expect(ideas[0].title).toBe("Idea 1");

    const stored = await prisma.idea.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(2);
  });

  it("passes the target language into the prompt sent to the LLM", async () => {
    const user = await prisma.user.create({ data: { email: "creator-lang@example.com", name: "Creator Lang" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel Lang", isActive: true, settings: { create: {} } },
    });

    await createIdeasForProject(
      project.id,
      null,
      { channelTopic: "Home coffee brewing", primaryNiche: "Specialty coffee", targetAudience: "Home baristas 25-40" },
      "French"
    );

    const promptSent = generateText.mock.calls[generateText.mock.calls.length - 1][0] as string;
    expect(promptSent).toContain("French");
  });
});
