import Anthropic from "@anthropic-ai/sdk";

/**
 * Provider-agnostic text generation interface. Implemented here against the
 * Claude API; a different provider can be swapped in later without changing
 * call sites.
 */
export interface LlmClient {
  generateText(prompt: string): Promise<string>;
}

const DEFAULT_MODEL = "claude-sonnet-5";

class ClaudeLlmClient implements LlmClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error(`Claude response contained no text content (stop_reason: ${response.stop_reason})`);
    }

    return textBlock.text;
  }
}

export function getLlmClient(): LlmClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  return new ClaudeLlmClient(apiKey, process.env.ANTHROPIC_MODEL || DEFAULT_MODEL);
}
