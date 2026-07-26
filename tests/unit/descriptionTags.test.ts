import { describe, it, expect } from "vitest";
import { buildDescriptionTagsPrompt, parseDescriptionTagsResponse, YOUTUBE_CATEGORIES } from "@/server/descriptionTags";

describe("buildDescriptionTagsPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildDescriptionTagsPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "English" });
    expect(prompt).toContain("Home coffee brewing mistakes");
  });

  it("includes the selected title when provided", () => {
    const prompt = buildDescriptionTagsPrompt({
      topic: "Home coffee brewing mistakes",
      targetLanguage: "English",
      selectedTitle: "5 Coffee Brewing Mistakes You're Making",
    });
    expect(prompt).toContain("5 Coffee Brewing Mistakes You're Making");
  });

  it("includes keywords when provided", () => {
    const prompt = buildDescriptionTagsPrompt({
      topic: "Home coffee brewing mistakes",
      targetLanguage: "English",
      keywords: ["coffee brewing", "espresso tips"],
    });
    expect(prompt).toContain("coffee brewing");
    expect(prompt).toContain("espresso tips");
  });

  it("omits title and keyword context sections when not provided", () => {
    const prompt = buildDescriptionTagsPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "English" });
    expect(prompt).not.toContain("already chosen this title");
    expect(prompt).not.toContain("already researched for this video's SEO");
  });

  it("includes a language instruction for the given target language", () => {
    const prompt = buildDescriptionTagsPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "Arabic" });
    expect(prompt).toContain("Arabic");
  });
});

describe("parseDescriptionTagsResponse", () => {
  const validResponse = {
    description: "Learn the top 5 mistakes home baristas make and how to fix them for better coffee every morning.",
    tags: ["coffee brewing", "espresso tips", "home barista", "coffee mistakes", "brewing guide"],
    hashtags: ["#coffee", "#espresso", "#homebarista"],
    category: "Howto & Style",
    pinnedComment: "What's the biggest coffee mistake you used to make? Let us know below!",
  };

  it("parses a plain JSON object", () => {
    const result = parseDescriptionTagsResponse(JSON.stringify(validResponse));
    expect(result).toEqual(validResponse);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify(validResponse) + "\n```";
    const result = parseDescriptionTagsResponse(raw);
    expect(result).toEqual(validResponse);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseDescriptionTagsResponse("no json here")).toThrow();
  });

  it("throws when description is missing", () => {
    const invalid = { ...validResponse, description: "" };
    expect(() => parseDescriptionTagsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when tags is not an array of strings", () => {
    const invalid = { ...validResponse, tags: [1, 2, 3] };
    expect(() => parseDescriptionTagsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when hashtags is not an array of strings", () => {
    const invalid = { ...validResponse, hashtags: "not-an-array" };
    expect(() => parseDescriptionTagsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when category is not one of the fixed YouTube categories", () => {
    const invalid = { ...validResponse, category: "Made Up Category" };
    expect(() => parseDescriptionTagsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when pinnedComment is missing", () => {
    const invalid = { ...validResponse, pinnedComment: "" };
    expect(() => parseDescriptionTagsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parseDescriptionTagsResponse("{description: unquoted}")).toThrow();
  });

  it("exports the fixed YouTube category list with 15 entries", () => {
    expect(YOUTUBE_CATEGORIES).toHaveLength(15);
    expect(YOUTUBE_CATEGORIES).toContain("Howto & Style");
  });
});
