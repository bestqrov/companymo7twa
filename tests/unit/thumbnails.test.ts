import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  determineCtrSource,
  buildCtrFallbackPrompt,
  parseCtrFallbackResponse,
  buildThumbnailImagePrompt,
  buildHeadlinePrompt,
  compositeHeadlineOntoImage,
  buildThumbnailBriefPrompt,
  parseThumbnailBriefResponse,
  buildThumbnailImagePromptFromBrief,
  VARIATION_HINTS,
} from "@/server/thumbnails";

describe("buildThumbnailImagePrompt", () => {
  it("includes the user's scene description", () => {
    const prompt = buildThumbnailImagePrompt("a red espresso cup with dramatic lighting");
    expect(prompt).toContain("a red espresso cup with dramatic lighting");
  });

  it("requests a clean cutout composition instead of a busy photorealistic scene", () => {
    const prompt = buildThumbnailImagePrompt("a laptop on a desk");
    expect(prompt).toContain("clean, thick white");
    expect(prompt).toContain("NOT a busy or photorealistic scene");
  });

  it("instructs the image to be completely text-free", () => {
    const prompt = buildThumbnailImagePrompt("a laptop on a desk");
    expect(prompt.toLowerCase()).toContain("text-free");
  });
});

describe("buildHeadlinePrompt", () => {
  it("includes the topic", () => {
    const prompt = buildHeadlinePrompt("home coffee brewing mistakes");
    expect(prompt).toContain("home coffee brewing mistakes");
  });
});

describe("compositeHeadlineOntoImage", () => {
  it("returns a valid PNG buffer with the same dimensions as the input", async () => {
    const baseImage = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();

    const result = await compositeHeadlineOntoImage(baseImage, "TEST HEADLINE");
    const metadata = await sharp(result).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(100);
  });
});

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
    });
    expect(prompt).toContain("I made $1,000 in 7 days with zero followers");
  });

  it("includes the designer-principles boilerplate", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0] });
    expect(prompt).toContain("Before vs After whenever possible");
    expect(prompt).toContain("Photorealistic");
    expect(prompt).toContain("MrBeast");
  });

  it("includes the given variation hint", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[2] });
    expect(prompt).toContain("day-1-vs-day-7 split panel");
  });

  it("includes idea/script/title context when provided", () => {
    const prompt = buildThumbnailBriefPrompt({
      topic: "any topic",
      variationHint: VARIATION_HINTS[0],
      ideaTitle: "5 Coffee Mistakes",
      scriptHook: "Your coffee is probably wrong",
      selectedTitle: "Stop Ruining Your Coffee",
    });
    expect(prompt).toContain("5 Coffee Mistakes");
    expect(prompt).toContain("Your coffee is probably wrong");
    expect(prompt).toContain("Stop Ruining Your Coffee");
  });

  it("omits context sections when not provided", () => {
    const prompt = buildThumbnailBriefPrompt({ topic: "any topic", variationHint: VARIATION_HINTS[0] });
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
