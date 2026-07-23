import { describe, it, expect } from "vitest";
import { determineCtrSource, buildCtrFallbackPrompt, parseCtrFallbackResponse } from "@/server/thumbnails";

describe("determineCtrSource", () => {
  it("returns HIGGSFIELD_PREDICTOR when a predicted CTR is available", () => {
    expect(determineCtrSource(8.4)).toBe("HIGGSFIELD_PREDICTOR");
  });

  it("returns AI_ESTIMATE when no predicted CTR is available", () => {
    expect(determineCtrSource(null)).toBe("AI_ESTIMATE");
  });
});

describe("buildCtrFallbackPrompt", () => {
  it("includes the thumbnail prompt", () => {
    const prompt = buildCtrFallbackPrompt("a red espresso cup with dramatic lighting");
    expect(prompt).toContain("a red espresso cup with dramatic lighting");
  });
});

describe("parseCtrFallbackResponse", () => {
  it("parses a plain JSON object", () => {
    const raw = JSON.stringify({ ctrEstimate: 7 });
    expect(parseCtrFallbackResponse(raw)).toBe(7);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify({ ctrEstimate: 5 }) + "\n```";
    expect(parseCtrFallbackResponse(raw)).toBe(5);
  });

  it("clamps ctrEstimate to the 0-100 range", () => {
    const raw = JSON.stringify({ ctrEstimate: 150 });
    expect(parseCtrFallbackResponse(raw)).toBe(100);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseCtrFallbackResponse("no json here")).toThrow();
  });

  it("throws when ctrEstimate is missing", () => {
    expect(() => parseCtrFallbackResponse(JSON.stringify({ other: 1 }))).toThrow();
  });
});
