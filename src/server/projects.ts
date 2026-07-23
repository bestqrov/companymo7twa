import { prisma } from "@/lib/prisma";

const DEFAULT_PROJECT_NAME = "My First Channel";

/**
 * Ensures a user has at least one Project. Called from the NextAuth signIn
 * callback on every login; a no-op after the first successful call per user.
 */
export async function ensureDefaultProject(userId: string): Promise<void> {
  const existing = await prisma.project.findFirst({ where: { userId } });
  if (existing) {
    return;
  }

  await prisma.project.create({
    data: {
      userId,
      name: DEFAULT_PROJECT_NAME,
      isActive: true,
      settings: { create: {} },
    },
  });
}

export async function getUserProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    include: { settings: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function setActiveProject(userId: string, projectId: string): Promise<void> {
  await prisma.$transaction([
    prisma.project.updateMany({ where: { userId }, data: { isActive: false } }),
    prisma.project.update({ where: { id: projectId }, data: { isActive: true } }),
  ]);
}
