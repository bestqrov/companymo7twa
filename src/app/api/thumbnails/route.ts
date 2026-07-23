import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createThumbnailsForProject } from "@/server/thumbnails";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, prompt, mode, ideaId } = await request.json();
  if (typeof projectId !== "string" || typeof prompt !== "string" || (mode !== "single" && mode !== "abtest")) {
    return NextResponse.json(
      { error: "projectId, prompt, and a valid mode ('single' or 'abtest') are required" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // ideaId is optional context (pre-filled from Idea Finder); if the id
  // doesn't resolve to a real idea in this project (e.g. deleted since),
  // silently proceed without it rather than failing the whole request.
  let resolvedIdeaId: string | null = null;
  if (typeof ideaId === "string") {
    const idea = await prisma.idea.findFirst({ where: { id: ideaId, projectId } });
    if (idea) {
      resolvedIdeaId = idea.id;
    }
  }

  let thumbnails;
  try {
    thumbnails = await createThumbnailsForProject(projectId, resolvedIdeaId, { prompt, mode });
  } catch (error) {
    console.error("Failed to generate thumbnails:", error);
    return NextResponse.json({ error: "Failed to generate thumbnails. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ thumbnails }, { status: 201 });
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

  const thumbnails = await prisma.thumbnail.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ thumbnails });
}
