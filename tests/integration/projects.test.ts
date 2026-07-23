import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureDefaultProject } from "@/server/projects";

describe("ensureDefaultProject", () => {
  beforeEach(async () => {
    await prisma.projectSettings.deleteMany();
    await prisma.project.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a default project and empty settings for a new user", async () => {
    const user = await prisma.user.create({
      data: { email: "creator@example.com", name: "Creator" },
    });

    await ensureDefaultProject(user.id);

    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      include: { settings: true },
    });

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("My First Channel");
    expect(projects[0].isActive).toBe(true);
    expect(projects[0].settings).not.toBeNull();
  });

  it("does not create a second project if one already exists", async () => {
    const user = await prisma.user.create({
      data: { email: "creator2@example.com", name: "Creator Two" },
    });

    await ensureDefaultProject(user.id);
    await ensureDefaultProject(user.id);

    const projects = await prisma.project.findMany({ where: { userId: user.id } });
    expect(projects).toHaveLength(1);
  });
});
