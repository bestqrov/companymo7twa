import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchYoutubeTrendContext, fetchYoutubeChannelContext } from "@/lib/youtube";

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

  it("returns null when the videos request fails", async () => {
    const searchResponse = { items: [{ id: { videoId: "abc123" } }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => searchResponse })
      .mockResolvedValueOnce({ ok: false });
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

describe("fetchYoutubeChannelContext", () => {
  it("resolves a /channel/UC... URL directly without a resolution API call", async () => {
    const videosResponse = {
      items: [{ snippet: { title: "How I Made $1M" } }],
    };
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => videosResponse });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeChannelContext(
      "fake-key",
      "https://www.youtube.com/channel/UC1234567890123456789012"
    );

    expect(result).toContain("How I Made $1M");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("channelId=UC1234567890123456789012");
  });

  it("resolves an @handle via the channels endpoint", async () => {
    const handleResponse = { items: [{ id: "UCabcdefghijklmnopqrstuv" }] };
    const videosResponse = { items: [{ snippet: { title: "Handle Channel Video" } }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => handleResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => videosResponse });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeChannelContext("fake-key", "@somehandle");

    expect(result).toContain("Handle Channel Video");
    expect(fetchMock.mock.calls[0][0]).toContain("forHandle=somehandle");
  });

  it("resolves a plain-text channel name via search", async () => {
    const searchResponse = { items: [{ snippet: { channelId: "UCsearchresultchannelid1" } }] };
    const videosResponse = { items: [{ snippet: { title: "Searched Channel Video" } }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => searchResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => videosResponse });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeChannelContext("fake-key", "Some Creator Name");

    expect(result).toContain("Searched Channel Video");
    expect(fetchMock.mock.calls[0][0]).toContain("type=channel");
  });

  it("returns null when the channel cannot be resolved", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeChannelContext("fake-key", "Nonexistent Channel Xyz");
    expect(result).toBeNull();
  });

  it("returns null when the videos request fails", async () => {
    const handleResponse = { items: [{ id: "UCabcdefghijklmnopqrstuv" }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => handleResponse })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeChannelContext("fake-key", "@somehandle");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeChannelContext("fake-key", "@somehandle");
    expect(result).toBeNull();
  });
});
