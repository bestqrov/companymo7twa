import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regeneratePlatformVariant } from "@/server/platformVariants";
import { resolveLanguageName } from "@/lib/language";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const platformVariant = await prisma.platformVariant.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
    include: { project: { include: { settings: true } } },
  });
  if (!platformVariant) {
    return NextResponse.json({ error: "Platform variant not found" }, { status: 404 });
  }

  try {
    const targetLanguage = resolveLanguageName(platformVariant.project.settings?.targetLanguage);
    const updated = await regeneratePlatformVariant(params.id, targetLanguage);
    return NextResponse.json({ platformVariant: updated });
  } catch (error) {
    console.error("Failed to regenerate platform variant:", error);
    return NextResponse.json({ error: "Failed to regenerate this variant. Please try again." }, { status: 502 });
  }
}
