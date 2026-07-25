import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STRING_FIELDS = ["hook", "caption"];
const ARRAY_FIELDS = ["hashtags"];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { field, value } = await request.json();

  if (STRING_FIELDS.includes(field)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return NextResponse.json({ error: "value must be a non-empty string for this field" }, { status: 400 });
    }
  } else if (ARRAY_FIELDS.includes(field)) {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      return NextResponse.json({ error: "value must be an array of strings for this field" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "A valid field is required" }, { status: 400 });
  }

  const platformVariant = await prisma.platformVariant.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!platformVariant) {
    return NextResponse.json({ error: "Platform variant not found" }, { status: 404 });
  }

  const updated = await prisma.platformVariant.update({
    where: { id: params.id },
    data: { [field]: value },
  });

  return NextResponse.json({ platformVariant: updated });
}
