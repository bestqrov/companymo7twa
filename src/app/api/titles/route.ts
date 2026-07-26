import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { createTitleSetForIdeaOrTopic } from "@/server/titles";
import { resolveLanguageName } from "@/lib/language";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, ideaId, topic } = await request.json();
  if (typeof projectId !== "string" || typeof topic !== "string") {
    return NextResponse.json({ error: "projectId and topic are required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { settings: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // ideaId is optional context (pre-filled from Idea Finder); if the id
  // doesn't resolve to a real idea in this project, silently proceed
  // without it rather than failing the whole request.
  let resolvedIdeaId: string | null = null;
  if (typeof ideaId === "string") {
    const idea = await prisma.idea.findFirst({ where: { id: ideaId, projectId } });
    if (idea) {
      resolvedIdeaId = idea.id;
    }
  }

  let result;
  try {
    const youtubeApiKey = project.settings?.youtubeApiKey ? decrypt(project.settings.youtubeApiKey) : null;
    const targetLanguage = resolveLanguageName(project.settings?.targetLanguage);
    result = await createTitleSetForIdeaOrTopic(projectId, resolvedIdeaId, youtubeApiKey, topic, targetLanguage);
  } catch (error) {
    console.error("Failed to generate title set:", error);
    return NextResponse.json({ error: "Failed to generate titles. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ titleSet: result.titleSet }, { status: result.created ? 201 : 200 });
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const titleSets = await prisma.titleSet.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ titleSets });
}
