import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/llm", () => ({
  getLlmClient: () => ({
    generateText: async () =>
      JSON.stringify({
        titles: [
          "5 Coffee Brewing Mistakes You're Making",
          "Stop Ruining Your Coffee (5 Fixes)",
          "Why Your Espresso Tastes Bad",
          "The Truth About Home Brewing",
          "5 Mistakes Every Home Barista Makes",
          "Fix Your Coffee In 5 Minutes",
          "Your Coffee Is Wrong. Here's Why",
          "5 Brewing Mistakes Ruining Your Morning",
        ],
        keywords: [
          "coffee brewing",
          "espresso tips",
          "home barista",
          "coffee mistakes",
          "brewing guide",
          "coffee tips",
          "espresso guide",
          "coffee beginner",
          "brewing technique",
          "coffee quality",
        ],
      }),
  }),
}));

vi.mock("@/lib/youtube", () => ({
  fetchYoutubeTrendContext: async () => null,
}));

import { createTitleSetForIdeaOrTopic } from "@/server/titles";

describe("createTitleSetForIdeaOrTopic", () => {
  beforeEach(async () => {
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

  it("generates and persists a new title set when no ideaId is given", async () => {
    const user = await prisma.user.create({ data: { email: "creator@example.com", name: "Creator" } });
    const project = await prisma.project.create({
      data: { userId: user.id, name: "Test Channel", isActive: true, settings: { create: {} } },
    });

    const result = await createTitleSetForIdeaOrTopic(project.id, null, null, "Home coffee brewing mistakes");

    expect(result.created).toBe(true);
    expect(result.titleSet.titles).toHaveLength(8);
    expect(result.titleSet.keywords).toHaveLength(10);
    expect(result.titleSet.selectedTitle).toBeNull();

    const stored = await prisma.titleSet.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(1);
  });

  it("returns the existing title set for an idea instead of generating a new one", async () => {
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

    const first = await createTitleSetForIdeaOrTopic(project.id, idea.id, null, "5 Coffee Mistakes");
    const second = await createTitleSetForIdeaOrTopic(project.id, idea.id, null, "5 Coffee Mistakes");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.titleSet.id).toBe(first.titleSet.id);

    const stored = await prisma.titleSet.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(1);
  });
});
