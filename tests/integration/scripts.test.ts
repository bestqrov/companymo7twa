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
