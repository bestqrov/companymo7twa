import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { createIdeasForProject } from "@/server/ideas";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, channelTopic, primaryNiche, targetAudience, inspirationChannel } = await request.json();
  if (
    typeof projectId !== "string" ||
    typeof channelTopic !== "string" ||
    typeof primaryNiche !== "string" ||
    typeof targetAudience !== "string" ||
    (inspirationChannel !== undefined && typeof inspirationChannel !== "string")
  ) {
    return NextResponse.json(
      { error: "projectId, channelTopic, primaryNiche, and targetAudience are required" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { settings: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let ideas;
  try {
    const youtubeApiKey = project.settings?.youtubeApiKey ? decrypt(project.settings.youtubeApiKey) : null;

    ideas = await createIdeasForProject(projectId, youtubeApiKey, {
      channelTopic,
      primaryNiche,
      targetAudience,
      inspirationChannel,
    });
  } catch (error) {
    console.error("Failed to generate ideas:", error);
    return NextResponse.json({ error: "Failed to generate ideas. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ ideas }, { status: 201 });
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

  const ideas = await prisma.idea.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ideas });
}
