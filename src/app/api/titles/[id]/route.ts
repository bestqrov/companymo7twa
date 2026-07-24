import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { selectedTitle } = await request.json();
  if (typeof selectedTitle !== "string") {
    return NextResponse.json({ error: "selectedTitle is required" }, { status: 400 });
  }

  const titleSet = await prisma.titleSet.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!titleSet) {
    return NextResponse.json({ error: "Title set not found" }, { status: 404 });
  }

  if (!titleSet.titles.includes(selectedTitle)) {
    return NextResponse.json({ error: "selectedTitle must be one of the generated titles" }, { status: 400 });
  }

  const updated = await prisma.titleSet.update({
    where: { id: params.id },
    data: { selectedTitle },
  });

  return NextResponse.json({ titleSet: updated });
}
