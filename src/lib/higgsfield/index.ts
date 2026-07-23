/**
 * Client wrapper for the Higgsfield MCP/API (image and video generation).
 * Implemented starting Phase 3 (Thumbnail Studio / A-B testing).
 */
export interface HiggsfieldClient {
  generateImage(prompt: string): Promise<{ url: string }>;
  generateVideo(prompt: string): Promise<{ url: string }>;
}

export function getHiggsfieldClient(): HiggsfieldClient {
  throw new Error("Higgsfield client not yet implemented — see Phase 3 plan");
}
