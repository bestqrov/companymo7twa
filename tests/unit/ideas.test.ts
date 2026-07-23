import { describe, it, expect } from "vitest";
import { buildIdeaPrompt, parseIdeasResponse, determineScoreSource } from "@/server/ideas";

describe("determineScoreSource", () => {
  it("returns REAL_YOUTUBE_DATA when real YouTube data was used", () => {
    expect(determineScoreSource(true)).toBe("REAL_YOUTUBE_DATA");
  });

  it("returns AI_ESTIMATE when no real YouTube data was used", () => {
    expect(determineScoreSource(false)).toBe("AI_ESTIMATE");
  });
});

describe("buildIdeaPrompt", () => {
  it("includes the form inputs", () => {
    const prompt = buildIdeaPrompt({
      channelTopic: "Home coffee brewing",
      primaryNiche: "Specialty coffee",
      targetAudience: "Home baristas 25-40",
    });

    expect(prompt).toContain("Home coffee brewing");
    expect(prompt).toContain("Specialty coffee");
    expect(prompt).toContain("Home baristas 25-40");
  });

  it("includes YouTube context when provided", () => {
    const prompt = buildIdeaPrompt({
      channelTopic: "Home coffee brewing",
      primaryNiche: "Specialty coffee",
      targetAudience: "Home baristas 25-40",
      youtubeContext: '- "Top 5 Espresso Tips" (1000000 views)',
    });

    expect(prompt).toContain("Top 5 Espresso Tips");
  });

  it("omits the YouTube context section when not provided", () => {
    const prompt = buildIdeaPrompt({
      channelTopic: "Home coffee brewing",
      primaryNiche: "Specialty coffee",
      targetAudience: "Home baristas 25-40",
    });

    expect(prompt).not.toContain("real YouTube trend data");
  });
});

describe("parseIdeasResponse", () => {
  it("parses a plain JSON array", () => {
    const raw = JSON.stringify([{ title: "T1", description: "D1", hook: "H1", viralityScore: 85 }]);

    const ideas = parseIdeasResponse(raw);
    expect(ideas).toHaveLength(1);
    expect(ideas[0].title).toBe("T1");
    expect(ideas[0].viralityScore).toBe(85);
  });

  it("parses a JSON array wrapped in markdown code fences", () => {
    const raw =
      "```json\n" +
      JSON.stringify([{ title: "T1", description: "D1", hook: "H1", viralityScore: 50 }]) +
      "\n```";

    const ideas = parseIdeasResponse(raw);
    expect(ideas).toHaveLength(1);
  });

  it("clamps viralityScore to the 0-100 range", () => {
    const raw = JSON.stringify([{ title: "T1", description: "D1", hook: "H1", viralityScore: 150 }]);

    const ideas = parseIdeasResponse(raw);
    expect(ideas[0].viralityScore).toBe(100);
  });

  it("throws when the response has no JSON array", () => {
    expect(() => parseIdeasResponse("no json here")).toThrow();
  });

  it("throws when an idea is missing required fields", () => {
    const raw = JSON.stringify([{ title: "T1" }]);
    expect(() => parseIdeasResponse(raw)).toThrow();
  });
});
