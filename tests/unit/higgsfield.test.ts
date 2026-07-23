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

const SUBMIT_RESPONSE = {
  status: "queued",
  request_id: "req-1",
  status_url: "https://platform.higgsfield.ai/requests/req-1/status",
};

describe("generateImage", () => {
  it("submits a request and polls until completed, returning the image URL", async () => {
    const fetchMock = vi
      .fn()
      // submit
      .mockResolvedValueOnce({ ok: true, json: async () => SUBMIT_RESPONSE })
      // first poll: still in progress
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "in_progress", request_id: "req-1" }) })
      // second poll: completed
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "completed",
          request_id: "req-1",
          images: [{ url: "https://higgsfield.ai/img/abc.png" }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);

    const result = await generateImage("a red espresso cup");
    expect(result.url).toBe("https://higgsfield.ai/img/abc.png");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws when the request fails to complete (status: failed)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => SUBMIT_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "failed", request_id: "req-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage("a red espresso cup")).rejects.toThrow();
  });

  it("throws when the submit request fails", async () => {
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
  it("always returns null (no public CTR-prediction endpoint documented)", async () => {
    const result = await predictCtr("https://higgsfield.ai/img/abc.png", "espresso cup");
    expect(result).toBeNull();
  });
});
