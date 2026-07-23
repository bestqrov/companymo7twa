import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_SECTIONS = ["hook", "intro", "mainContent", "cta", "ending"];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { section, content } = await request.json();
  if (!VALID_SECTIONS.includes(section) || typeof content !== "string") {
    return NextResponse.json({ error: "A valid section and content are required" }, { status: 400 });
  }

  const script = await prisma.script.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const updated = await prisma.script.update({
    where: { id: params.id },
    data: { [section]: content },
  });

  return NextResponse.json({ script: updated });
}
