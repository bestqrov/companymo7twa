import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getDriveClient } from "@/lib/drive";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thumbnail = await prisma.thumbnail.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!thumbnail) {
    return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { googleAccessToken: true },
  });
  if (!user?.googleAccessToken) {
    return NextResponse.json({ error: "Google Drive is not connected" }, { status: 400 });
  }

  try {
    const accessToken = decrypt(user.googleAccessToken);

    const imageRes = await fetch(thumbnail.imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch thumbnail image: ${imageRes.status}`);
    }
    const data = Buffer.from(await imageRes.arrayBuffer());

    const drive = getDriveClient(accessToken);
    const { fileId } = await drive.uploadFile({
      name: `vifatube-thumbnail-${thumbnail.id}.png`,
      mimeType: "image/png",
      data,
    });

    return NextResponse.json({ fileId });
  } catch (error) {
    console.error("Failed to save thumbnail to Drive:", error);
    return NextResponse.json({ error: "Failed to save to Drive. Please try again." }, { status: 502 });
  }
}
