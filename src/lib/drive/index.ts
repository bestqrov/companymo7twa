/**
 * Uploads generated assets to a user's linked Google Drive using the
 * `drive.file` token captured at login (see src/lib/auth.ts). Implemented
 * starting Phase 3.
 */
export interface DriveClient {
  uploadFile(params: { name: string; mimeType: string; data: Buffer }): Promise<{ fileId: string }>;
}

export function getDriveClient(accessToken: string): DriveClient {
  throw new Error("Drive client not yet implemented — see Phase 3 plan");
}
