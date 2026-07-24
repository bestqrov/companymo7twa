import { describe, it, expect } from "vitest";
import { buildScriptPrompt, parseScriptResponse, buildSectionRegeneratePrompt } from "@/server/scripts";

describe("buildScriptPrompt", () => {
  it("includes the topic and tone", () => {
    const prompt = buildScriptPrompt({ topic: "Home coffee brewing mistakes", tone: "FAST_PACED" });
    expect(prompt).toContain("Home coffee brewing mistakes");
    expect(prompt).toContain("FAST_PACED");
  });
});

describe("parseScriptResponse", () => {
  const validResponse = {
    hook: "Your coffee is burnt and it's not your fault.",
    intro: "Today we're breaking down five brewing mistakes.",
    mainContent: "Point one: grind size. [B-ROLL: close-up of grinder]",
    cta: "Subscribe for more coffee tips.",
    ending: "See you in the next one.",
  };

  it("parses a plain JSON object", () => {
    const result = parseScriptResponse(JSON.stringify(validResponse));
    expect(result).toEqual(validResponse);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify(validResponse) + "\n```";
    const result = parseScriptResponse(raw);
    expect(result).toEqual(validResponse);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseScriptResponse("no json here")).toThrow();
  });

  it("throws when a required field is missing", () => {
    const incomplete = { hook: "x", intro: "y", mainContent: "z", cta: "w" };
    expect(() => parseScriptResponse(JSON.stringify(incomplete))).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parseScriptResponse("{hook: unquoted}")).toThrow();
  });
});

describe("buildSectionRegeneratePrompt", () => {
  it("includes the topic, tone, section, and current text", () => {
    const prompt = buildSectionRegeneratePrompt({
      topic: "Home coffee brewing mistakes",
      tone: "EDUCATIONAL",
      section: "cta",
      currentSectionText: "Please subscribe.",
    });
    expect(prompt).toContain("Home coffee brewing mistakes");
    expect(prompt).toContain("EDUCATIONAL");
    expect(prompt).toContain("Please subscribe.");
  });
});
