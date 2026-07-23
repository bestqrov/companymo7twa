import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { generateImage, predictCtr } from "@/lib/higgsfield";

beforeEach(() => {
  process.env.HIGGSFIELD_API_KEY_ID = "test-key-id";
  process.env.HIGGSFIELD_API_KEY_SECRET = "test-key-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HIGGSFIELD_API_KEY_ID;
  delete process.env.HIGGSFIELD_API_KEY_SECRET;
});

describe("generateImage", () => {
  it("returns the generated image URL on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://higgsfield.ai/img/abc.png" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage("a red espresso cup");
    expect(result.url).toBe("https://higgsfield.ai/img/abc.png");
  });

  it("throws when the request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Server error" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage("a red espresso cup")).rejects.toThrow();
  });

  it("throws when API credentials are not configured", async () => {
    delete process.env.HIGGSFIELD_API_KEY_ID;
    delete process.env.HIGGSFIELD_API_KEY_SECRET;

    await expect(generateImage("a red espresso cup")).rejects.toThrow();
  });
});

describe("predictCtr", () => {
  it("returns a number on success", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ctr_percent: 8.4 }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await predictCtr("https://higgsfield.ai/img/abc.png", "espresso cup");
    expect(result).toBe(8.4);
  });

  it("returns null when the request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const result = await predictCtr("https://higgsfield.ai/img/abc.png", "espresso cup");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await predictCtr("https://higgsfield.ai/img/abc.png", "espresso cup");
    expect(result).toBeNull();
  });

  it("returns null when credentials are not configured (never throws)", async () => {
    delete process.env.HIGGSFIELD_API_KEY_ID;
    delete process.env.HIGGSFIELD_API_KEY_SECRET;

    const result = await predictCtr("https://higgsfield.ai/img/abc.png", "espresso cup");
    expect(result).toBeNull();
  });
});
