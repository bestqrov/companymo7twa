import { describe, it, expect } from "vitest";
import {
  determineCtrSource,
  buildCtrFallbackPrompt,
  parseCtrFallbackResponse,
  buildThumbnailBriefPrompt,
  parseThumbnailBriefResponse,
  buildThumbnailImagePromptFromBrief,
  VARIATION_HINTS,
} from "@/server/thumbnails";

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

describe("buildThumbnailBriefPrompt", () => {
  it("includes the topic", () => {
    const prompt = buildThumbnailBriefPrompt({
      topic: "I made $1,000 in 7 days with zero followers",
      variationHint: VARIATION_HINTS[0],
      targetLanguage: "English",
    });
    expect(prompt).toContain("I made $1,000 in 7 days with zero followers");
  });

  it("includes the designer-principles boilerplate", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0], targetLanguage: "English" });
    expect(prompt).toContain("Before vs After whenever possible");
    expect(prompt).toContain("Photorealistic");
    expect(prompt).toContain("MrBeast");
  });

  it("includes the given variation hint", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[2], targetLanguage: "English" });
    expect(prompt).toContain("day-1-vs-day-7 split panel");
  });

  it("instructs thumbnailText to be written in the given target language", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0], targetLanguage: "Arabic" });
    expect(prompt).toContain("write it in Arabic");
  });

  it("instructs all other brief fields to stay in English regardless of target language", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0], targetLanguage: "Arabic" });
    expect(prompt).toContain("must stay in English regardless");
  });

  it("includes idea/script/title context when provided", () => {
    const prompt = buildThumbnailBriefPrompt({
      topic: "any topic",
      variationHint: VARIATION_HINTS[0],
      targetLanguage: "English",
      ideaTitle: "5 Coffee Mistakes",
      scriptHook: "Your coffee is probably wrong",
      selectedTitle: "Stop Ruining Your Coffee",
    });
    expect(prompt).toContain("5 Coffee Mistakes");
    expect(prompt).toContain("Your coffee is probably wrong");
    expect(prompt).toContain("Stop Ruining Your Coffee");
  });

  it("omits context sections when not provided", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0], targetLanguage: "English" });
    expect(prompt).not.toContain("working title");
    expect(prompt).not.toContain("script opens with");
    expect(prompt).not.toContain("already chosen this title");
  });

  it("exports exactly 4 variation hints, one per composition pattern", () => {
    expect(VARIATION_HINTS).toHaveLength(4);
    expect(VARIATION_HINTS[0]).toContain("phone-to-laptop transformation");
    expect(VARIATION_HINTS[1]).toContain("zero-to-something reveal");
    expect(VARIATION_HINTS[2]).toContain("day-1-vs-day-7 split panel");
    expect(VARIATION_HINTS[3]).toContain("secret-reveal");
  });
});

describe("parseThumbnailBriefResponse", () => {
  const validBrief = {
    niche: "personal finance",
    story: "went from broke to profitable in a week",
    person: "a young entrepreneur in his 20s",
    emotion: "shocked, wide-eyed disbelief",
    before: "$12.43 bank balance",
    after: "$1,000 earnings",
    object: "smartphone and laptop",
    background: "dark cinematic home office",
    color: "green and red",
    compositionPattern: "phone-to-laptop transformation",
    thumbnailText: "$12 → $1,000",
    negativePrompt:
      "blurry, low quality, watermark, logo, illustration, cartoon, extra hands, extra fingers, duplicate people, cropped face, noise",
  };

  it("parses a plain JSON object", () => {
    const result = parseThumbnailBriefResponse(JSON.stringify(validBrief));
    expect(result).toEqual(validBrief);
  });

  it("parses a JSON object wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify(validBrief) + "\n```";
    expect(parseThumbnailBriefResponse(raw)).toEqual(validBrief);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseThumbnailBriefResponse("no json here")).toThrow();
  });

  it("throws when the response is malformed JSON", () => {
    expect(() => parseThumbnailBriefResponse("{niche: unquoted}")).toThrow();
  });

  const requiredFields = [
    "niche",
    "story",
    "person",
    "emotion",
    "before",
    "after",
    "object",
    "background",
    "color",
    "compositionPattern",
    "thumbnailText",
    "negativePrompt",
  ] as const;

  for (const field of requiredFields) {
    it(`throws when ${field} is missing`, () => {
      const invalid: Record<string, unknown> = { ...validBrief };
      delete invalid[field];
      expect(() => parseThumbnailBriefResponse(JSON.stringify(invalid))).toThrow();
    });

    it(`throws when ${field} is an empty string`, () => {
      const invalid = { ...validBrief, [field]: "" };
      expect(() => parseThumbnailBriefResponse(JSON.stringify(invalid))).toThrow();
    });
  }
});

describe("buildThumbnailImagePromptFromBrief", () => {
  it("includes every brief field, the bold typography line, and the negative prompt line", () => {
    const brief = {
      niche: "personal finance",
      story: "went from broke to profitable in a week",
      person: "a young entrepreneur in his 20s",
      emotion: "shocked, wide-eyed disbelief",
      before: "$12.43 bank balance",
      after: "$1,000 earnings",
      object: "smartphone and laptop",
      background: "dark cinematic home office",
      color: "green and red",
      compositionPattern: "phone-to-laptop transformation with a bold arrow",
      thumbnailText: "$12 → $1,000",
      negativePrompt: "blurry, low quality, watermark",
    };

    const prompt = buildThumbnailImagePromptFromBrief(brief);

    expect(prompt).toContain(brief.person);
    expect(prompt).toContain(brief.story);
    expect(prompt).toContain(brief.before);
    expect(prompt).toContain(brief.after);
    expect(prompt).toContain(brief.object);
    expect(prompt).toContain(brief.background);
    expect(prompt).toContain(brief.color);
    expect(prompt).toContain(brief.compositionPattern);
    expect(prompt).toContain(`Bold typography: "${brief.thumbnailText}"`);
    expect(prompt).toContain(`Negative prompt: ${brief.negativePrompt}`);
  });
});
