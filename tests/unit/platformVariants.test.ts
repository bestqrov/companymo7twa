import { describe, it, expect } from "vitest";
import {
  buildPlatformVariantsPrompt,
  parsePlatformVariantsResponse,
  buildSinglePlatformVariantPrompt,
  parseSinglePlatformVariantResponse,
} from "@/server/platformVariants";

const validVariant = (extra: Record<string, unknown> = {}) => ({
  hook: "Stop brewing your coffee wrong",
  caption: "5 mistakes killing your morning brew. Full breakdown below.",
  hashtags: ["#coffee", "#espresso"],
  ...extra,
});

const validAllPlatforms = {
  tiktok: validVariant(),
  youtubeShorts: validVariant(),
  instagramReels: validVariant({ coverImagePrompt: "A steaming espresso cup on a marble counter, morning light" }),
  facebookReels: validVariant(),
};

describe("buildPlatformVariantsPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildPlatformVariantsPrompt({ topic: "Home coffee brewing mistakes" });
    expect(prompt).toContain("Home coffee brewing mistakes");
  });

  it("includes script context when provided", () => {
    const prompt = buildPlatformVariantsPrompt({
      topic: "Home coffee brewing mistakes",
      scriptHook: "Your coffee is probably wrong",
      scriptMainContent: "Most people over-extract their espresso...",
    });
    expect(prompt).toContain("Your coffee is probably wrong");
    expect(prompt).toContain("Most people over-extract their espresso...");
  });

  it("includes the selected title when provided", () => {
    const prompt = buildPlatformVariantsPrompt({
      topic: "Home coffee brewing mistakes",
      selectedTitle: "5 Coffee Brewing Mistakes You're Making",
    });
    expect(prompt).toContain("5 Coffee Brewing Mistakes You're Making");
  });

  it("includes hashtags when provided", () => {
    const prompt = buildPlatformVariantsPrompt({
      topic: "Home coffee brewing mistakes",
      hashtags: ["#coffee", "#espresso"],
    });
    expect(prompt).toContain("#coffee");
    expect(prompt).toContain("#espresso");
  });

  it("omits all context sections when not provided", () => {
    const prompt = buildPlatformVariantsPrompt({ topic: "Home coffee brewing mistakes" });
    expect(prompt).not.toContain("existing long-form script");
    expect(prompt).not.toContain("already chosen this title");
    expect(prompt).not.toContain("already researched for this video");
  });

  it("includes distinct anti-duplication tone instructions per platform", () => {
    const prompt = buildPlatformVariantsPrompt({ topic: "Home coffee brewing mistakes" });
    expect(prompt).toContain("pattern-interrupt");
    expect(prompt).toContain("value proposition");
    expect(prompt).toContain("curiosity-driven");
    expect(prompt).toContain("question-based");
  });
});

describe("parsePlatformVariantsResponse", () => {
  it("parses a plain JSON object", () => {
    const result = parsePlatformVariantsResponse(JSON.stringify(validAllPlatforms));
    expect(result).toEqual(validAllPlatforms);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify(validAllPlatforms) + "\n```";
    const result = parsePlatformVariantsResponse(raw);
    expect(result).toEqual(validAllPlatforms);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parsePlatformVariantsResponse("no json here")).toThrow();
  });

  it("throws when a platform key is missing", () => {
    const { facebookReels, ...invalid } = validAllPlatforms;
    expect(() => parsePlatformVariantsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when instagramReels is missing coverImagePrompt", () => {
    const invalid = { ...validAllPlatforms, instagramReels: validVariant() };
    expect(() => parsePlatformVariantsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when a platform's hashtags is not an array of strings", () => {
    const invalid = { ...validAllPlatforms, tiktok: validVariant({ hashtags: "not-an-array" }) };
    expect(() => parsePlatformVariantsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when a platform's hook is missing", () => {
    const invalid = { ...validAllPlatforms, youtubeShorts: validVariant({ hook: "" }) };
    expect(() => parsePlatformVariantsResponse(JSON.stringify(invalid))).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parsePlatformVariantsResponse("{tiktok: unquoted}")).toThrow();
  });
});

describe("buildSinglePlatformVariantPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildSinglePlatformVariantPrompt("TIKTOK", { topic: "Home coffee brewing mistakes" });
    expect(prompt).toContain("Home coffee brewing mistakes");
  });

  it("includes only that platform's tone instruction", () => {
    const tiktokPrompt = buildSinglePlatformVariantPrompt("TIKTOK", { topic: "Home coffee brewing mistakes" });
    expect(tiktokPrompt).toContain("pattern-interrupt");
    expect(tiktokPrompt).not.toContain("value proposition");
    expect(tiktokPrompt).not.toContain("curiosity-driven");
    expect(tiktokPrompt).not.toContain("question-based");
  });

  it("requests coverImagePrompt only for INSTAGRAM_REELS", () => {
    const instagramPrompt = buildSinglePlatformVariantPrompt("INSTAGRAM_REELS", { topic: "Home coffee brewing mistakes" });
    const tiktokPrompt = buildSinglePlatformVariantPrompt("TIKTOK", { topic: "Home coffee brewing mistakes" });
    expect(instagramPrompt).toContain("coverImagePrompt");
    expect(tiktokPrompt).not.toContain("coverImagePrompt");
  });

  it("includes context when provided", () => {
    const prompt = buildSinglePlatformVariantPrompt("FACEBOOK_REELS", {
      topic: "Home coffee brewing mistakes",
      selectedTitle: "5 Coffee Brewing Mistakes You're Making",
      hashtags: ["#coffee"],
    });
    expect(prompt).toContain("5 Coffee Brewing Mistakes You're Making");
    expect(prompt).toContain("#coffee");
  });
});

describe("parseSinglePlatformVariantResponse", () => {
  it("parses a valid TIKTOK response with no coverImagePrompt required", () => {
    const result = parseSinglePlatformVariantResponse(JSON.stringify(validVariant()), "TIKTOK");
    expect(result.hook).toBe("Stop brewing your coffee wrong");
    expect(result.hashtags).toEqual(["#coffee", "#espresso"]);
  });

  it("parses a valid INSTAGRAM_REELS response with coverImagePrompt", () => {
    const response = validVariant({ coverImagePrompt: "A steaming espresso cup on a marble counter" });
    const result = parseSinglePlatformVariantResponse(JSON.stringify(response), "INSTAGRAM_REELS");
    expect(result.coverImagePrompt).toBe("A steaming espresso cup on a marble counter");
  });

  it("throws when INSTAGRAM_REELS response is missing coverImagePrompt", () => {
    expect(() => parseSinglePlatformVariantResponse(JSON.stringify(validVariant()), "INSTAGRAM_REELS")).toThrow();
  });

  it("throws when hook is missing", () => {
    const invalid = validVariant({ hook: "" });
    expect(() => parseSinglePlatformVariantResponse(JSON.stringify(invalid), "TIKTOK")).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parseSinglePlatformVariantResponse("{hook: unquoted}", "TIKTOK")).toThrow();
  });
});
