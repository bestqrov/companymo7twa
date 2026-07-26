import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { regenerateTitleSet } from "@/server/titles";
import { resolveLanguageName } from "@/lib/language";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const titleSet = await prisma.titleSet.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
    include: { project: { include: { settings: true } } },
  });
  if (!titleSet) {
    return NextResponse.json({ error: "Title set not found" }, { status: 404 });
  }

  try {
    const youtubeApiKey = titleSet.project.settings?.youtubeApiKey
      ? decrypt(titleSet.project.settings.youtubeApiKey)
      : null;
    const targetLanguage = resolveLanguageName(titleSet.project.settings?.targetLanguage);
    const updated = await regenerateTitleSet(params.id, youtubeApiKey, targetLanguage);
    return NextResponse.json({ titleSet: updated });
  } catch (error) {
    console.error("Failed to regenerate title set:", error);
    return NextResponse.json({ error: "Failed to regenerate titles. Please try again." }, { status: 502 });
  }
}
