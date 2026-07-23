import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchYoutubeTrendContext } from "@/lib/youtube";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchYoutubeTrendContext", () => {
  it("returns a formatted summary on success", async () => {
    const searchResponse = { items: [{ id: { videoId: "abc123" } }] };
    const videosResponse = {
      items: [{ snippet: { title: "Top 5 Espresso Tips" }, statistics: { viewCount: "1000000" } }],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => searchResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => videosResponse });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeTrendContext("fake-key", "coffee");

    expect(result).toContain("Top 5 Espresso Tips");
    expect(result).toContain("1000000");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when the search request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeTrendContext("fake-key", "coffee");
    expect(result).toBeNull();
  });

  it("returns null when the search request returns no video ids", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeTrendContext("fake-key", "coffee");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeTrendContext("fake-key", "coffee");
    expect(result).toBeNull();
  });
});
