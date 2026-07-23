import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regenerateScriptSection, type ScriptSection } from "@/server/scripts";

const VALID_SECTIONS = ["hook", "intro", "mainContent", "cta", "ending"];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { section } = await request.json();
  if (!VALID_SECTIONS.includes(section)) {
    return NextResponse.json({ error: "A valid section is required" }, { status: 400 });
  }

  const script = await prisma.script.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  try {
    const updated = await regenerateScriptSection(params.id, section as ScriptSection);
    return NextResponse.json({ script: updated });
  } catch (error) {
    console.error("Failed to regenerate script section:", error);
    return NextResponse.json({ error: "Failed to regenerate section. Please try again." }, { status: 502 });
  }
}
