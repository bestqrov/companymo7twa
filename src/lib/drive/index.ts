/**
 * Uploads generated assets to a user's linked Google Drive using the
 * `drive.file` token captured at login (see src/lib/auth.ts).
 */
import crypto from "node:crypto";

export interface DriveClient {
  uploadFile(params: { name: string; mimeType: string; data: Buffer }): Promise<{ fileId: string }>;
}

function buildMultipartBody(boundary: string, metadata: object, data: Buffer, mimeType: string): Buffer {
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `--${boundary}--`;

  const metadataPart =
    delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n";
  const mediaPartHeader = delimiter + `Content-Type: ${mimeType}\r\n\r\n`;

  return Buffer.concat([
    Buffer.from(metadataPart, "utf-8"),
    Buffer.from(mediaPartHeader, "utf-8"),
    data,
    Buffer.from("\r\n" + closeDelimiter, "utf-8"),
  ]);
}

class GoogleDriveClient implements DriveClient {
  constructor(private accessToken: string) {}

  async uploadFile(params: { name: string; mimeType: string; data: Buffer }): Promise<{ fileId: string }> {
    const boundary = `vifatube-${crypto.randomBytes(16).toString("hex")}`;
    const body = buildMultipartBody(boundary, { name: params.name, mimeType: params.mimeType }, params.data, params.mimeType);

    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`Google Drive upload failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    if (typeof data.id !== "string") {
      throw new Error("Google Drive upload response did not contain a file id");
    }
    return { fileId: data.id };
  }
}

export function getDriveClient(accessToken: string): DriveClient {
  return new GoogleDriveClient(accessToken);
}
