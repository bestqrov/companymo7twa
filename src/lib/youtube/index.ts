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

/**
 * Resolves `channelQuery` (a /channel/UC... URL, an @handle, or a plain
 * channel name) to a channel ID, then fetches a short text summary of that
 * channel's top videos by view count, for use as inspiration context in the
 * idea-generation prompt. Returns `null` on any failure — unresolvable
 * channel, non-2xx response, no results — so callers can cleanly fall back,
 * same "never throws" contract as `fetchYoutubeTrendContext`.
 */
export async function fetchYoutubeChannelContext(apiKey: string, channelQuery: string): Promise<string | null> {
  try {
    let channelId: string | null = null;

    const channelIdMatch = channelQuery.match(/channel\/(UC[\w-]{22})/);
    if (channelIdMatch) {
      channelId = channelIdMatch[1];
    }

    if (!channelId) {
      const handleMatch = channelQuery.match(/@([\w.-]+)/);
      if (handleMatch) {
        const handleRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handleMatch[1])}&key=${apiKey}`
        );
        if (handleRes.ok) {
          const handleData = await handleRes.json();
          channelId = handleData.items?.[0]?.id ?? null;
        }
      }
    }

    if (!channelId) {
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(channelQuery)}&key=${apiKey}`
      );
      if (!searchRes.ok) {
        return null;
      }
      const searchData = await searchRes.json();
      channelId = searchData.items?.[0]?.snippet?.channelId ?? null;
    }

    if (!channelId) {
      return null;
    }

    const videosUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=viewCount&maxResults=5&key=${apiKey}`;
    const videosRes = await fetch(videosUrl);
    if (!videosRes.ok) {
      return null;
    }
    const videosData = await videosRes.json();

    const summaries = (videosData.items ?? []).map((item: { snippet?: { title?: string } }) => {
      const title = item.snippet?.title ?? "Unknown title";
      return `- "${title}"`;
    });

    if (summaries.length === 0) {
      return null;
    }

    return `Top videos from the inspiration channel:\n${summaries.join("\n")}`;
  } catch {
    return null;
  }
}
