import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, youtubeApiKey, targetCountry, targetLanguage } = await request.json();
  if (typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await prisma.projectSettings.update({
    where: { projectId },
    data: {
      ...(youtubeApiKey ? { youtubeApiKey: encrypt(youtubeApiKey) } : {}),
      targetCountry,
      targetLanguage,
    },
  });

  return NextResponse.json({ ok: true });
}
