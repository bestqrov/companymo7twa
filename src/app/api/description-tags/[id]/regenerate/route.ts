import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regenerateDescriptionTagSet } from "@/server/descriptionTags";
import { resolveLanguageName } from "@/lib/language";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const descriptionTagSet = await prisma.descriptionTagSet.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
    include: { project: { include: { settings: true } } },
  });
  if (!descriptionTagSet) {
    return NextResponse.json({ error: "Description & tags set not found" }, { status: 404 });
  }

  try {
    const targetLanguage = resolveLanguageName(descriptionTagSet.project.settings?.targetLanguage);
    const updated = await regenerateDescriptionTagSet(params.id, targetLanguage);
    return NextResponse.json({ descriptionTagSet: updated });
  } catch (error) {
    console.error("Failed to regenerate description & tags set:", error);
    return NextResponse.json({ error: "Failed to regenerate metadata. Please try again." }, { status: 502 });
  }
}
