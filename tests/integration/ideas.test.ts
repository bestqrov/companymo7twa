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
