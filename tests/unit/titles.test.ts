import { describe, it, expect } from "vitest";
import { buildTitlesPrompt, parseTitlesResponse } from "@/server/titles";

describe("buildTitlesPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildTitlesPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "English" });
    expect(prompt).toContain("Home coffee brewing mistakes");
  });

  it("includes YouTube context when provided", () => {
    const prompt = buildTitlesPrompt({
      topic: "Home coffee brewing mistakes",
      targetLanguage: "English",
      youtubeContext: '- "Top 5 Espresso Tips" (1000000 views)',
    });
    expect(prompt).toContain("Top 5 Espresso Tips");
  });

  it("omits the YouTube context section when not provided", () => {
    const prompt = buildTitlesPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "English" });
    expect(prompt).not.toContain("real YouTube trend data");
  });

  it("includes a language instruction for the given target language", () => {
    const prompt = buildTitlesPrompt({ topic: "Home coffee brewing mistakes", targetLanguage: "Arabic" });
    expect(prompt).toContain("Arabic");
  });
});

describe("parseTitlesResponse", () => {
  const validResponse = {
    titles: [
      "5 Coffee Brewing Mistakes You're Making",
      "Stop Ruining Your Coffee (5 Fixes)",
      "Why Your Espresso Tastes Bad",
      "The Truth About Home Brewing",
      "5 Mistakes Every Home Barista Makes",
      "Fix Your Coffee In 5 Minutes",
      "Your Coffee Is Wrong. Here's Why",
      "5 Brewing Mistakes Ruining Your Morning",
    ],
    keywords: [
      "coffee brewing",
      "espresso tips",
      "home barista",
      "coffee mistakes",
      "brewing guide",
      "coffee tips",
      "espresso guide",
      "coffee beginner",
      "brewing technique",
      "coffee quality",
    ],
  };

  it("parses a plain JSON object", () => {
    const result = parseTitlesResponse(JSON.stringify(validResponse));
    expect(result).toEqual(validResponse);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify(validResponse) + "\n```";
    const result = parseTitlesResponse(raw);
    expect(result).toEqual(validResponse);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseTitlesResponse("no json here")).toThrow();
  });

  it("throws when titles does not have exactly 8 entries", () => {
    const invalid = { ...validResponse, titles: validResponse.titles.slice(0, 5) };
    expect(() => parseTitlesResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when keywords does not have exactly 10 entries", () => {
    const invalid = { ...validResponse, keywords: validResponse.keywords.slice(0, 3) };
    expect(() => parseTitlesResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parseTitlesResponse("{titles: unquoted}")).toThrow();
  });
});
