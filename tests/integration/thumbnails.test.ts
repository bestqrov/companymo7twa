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
