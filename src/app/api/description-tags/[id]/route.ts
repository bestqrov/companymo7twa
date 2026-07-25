import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { YOUTUBE_CATEGORIES } from "@/server/descriptionTags";

const STRING_FIELDS = ["description", "category", "pinnedComment"];
const ARRAY_FIELDS = ["tags", "hashtags"];

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
    if (field === "category" && !(YOUTUBE_CATEGORIES as readonly string[]).includes(value)) {
      return NextResponse.json(
        { error: `category must be one of: ${YOUTUBE_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
  } else if (ARRAY_FIELDS.includes(field)) {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      return NextResponse.json({ error: "value must be an array of strings for this field" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "A valid field is required" }, { status: 400 });
  }

  const descriptionTagSet = await prisma.descriptionTagSet.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!descriptionTagSet) {
    return NextResponse.json({ error: "Description & tags set not found" }, { status: 404 });
  }

  const updated = await prisma.descriptionTagSet.update({
    where: { id: params.id },
    data: { [field]: value },
  });

  return NextResponse.json({ descriptionTagSet: updated });
}
