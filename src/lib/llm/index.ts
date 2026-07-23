/**
 * Provider-agnostic text generation interface. Phase 3 implements this
 * against the Claude API; a different provider can be swapped in later
 * without changing call sites.
 */
export interface LlmClient {
  generateText(prompt: string): Promise<string>;
}

export function getLlmClient(): LlmClient {
  throw new Error("LLM client not yet implemented — see Phase 3 plan");
}
