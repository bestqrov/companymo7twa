/**
 * Fetches a short text summary of high-performing YouTube videos related to
 * `query`, for use as context in the idea-generation prompt. Returns `null`
 * on any failure (network error, non-2xx response, no results) so callers
 * can cleanly fall back to a pure-heuristic generation path rather than
 * failing the whole request.
 */
export async function fetchYoutubeTrendContext(apiKey: string, query: string): Promise<string | null> {
  // Intentionally broad: catches network failures AND any parsing/shape
  // surprises from the API response, per this function's "never throws" contract.
  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=5&q=${encodeURIComponent(query)}&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      return null;
    }
    const searchData = await searchRes.json();
    const videoIds = (searchData.items ?? [])
      .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
      .filter((id: string | undefined): id is string => Boolean(id));

    if (videoIds.length === 0) {
      return null;
    }

    const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(",")}&key=${apiKey}`;
    const videosRes = await fetch(videosUrl);
    if (!videosRes.ok) {
      return null;
    }
    const videosData = await videosRes.json();

    const summaries = (videosData.items ?? []).map(
      (item: { snippet?: { title?: string }; statistics?: { viewCount?: string } }) => {
        const title = item.snippet?.title ?? "Unknown title";
        const views = item.statistics?.viewCount ?? "unknown";
        return `- "${title}" (${views} views)`;
      }
    );

    if (summaries.length === 0) {
      return null;
    }

    return `Similar high-performing videos on YouTube:\n${summaries.join("\n")}`;
  } catch {
    return null;
  }
}
