import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  determineCtrSource,
  buildCtrFallbackPrompt,
  parseCtrFallbackResponse,
  buildThumbnailImagePrompt,
  buildHeadlinePrompt,
  compositeHeadlineOntoImage,
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
