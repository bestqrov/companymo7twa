# ArwaTube AI Engine — Idea Finder: Inspiration Channel — Design

## Context

Idea Finder (Phase 2) is already built and merged to `main`. It generates 6 scored video ideas
from a channel topic / primary niche / target audience, optionally informed by real YouTube
trend data (`fetchYoutubeTrendContext`, a keyword search) when the project has a YouTube Data
API key configured. This is a small, targeted addition to that existing feature: let the user
optionally name a specific YouTube channel to draw inspiration from (a competitor, or a channel
they admire), instead of the current generic keyword-based trend search.

## Scope

- A new optional "Inspiration Channel" input on the Idea Finder page, alongside the existing
  three inputs (Channel Topic, Primary Niche, Target Audience).
- A new `fetchYoutubeChannelContext` function in `src/lib/youtube/index.ts` that resolves a
  channel name/handle/URL to a channel ID and summarizes that channel's top videos.
- When an inspiration channel is provided (and a YouTube API key is configured for the project),
  idea generation uses that channel's real video data as context instead of the generic
  keyword-based trend search. When not provided, behavior is unchanged from today.

Out of scope: saving/reusing a list of favorite inspiration channels; per-idea channel
attribution in the UI; validating that a resolved channel actually matches what the user meant
before generating (best-effort resolution only, same "never throws, silently degrades" contract
as the existing trend-context function).

## `fetchYoutubeChannelContext` (`src/lib/youtube/index.ts`)

```ts
export async function fetchYoutubeChannelContext(apiKey: string, channelQuery: string): Promise<string | null>
```

Resolves `channelQuery` to a channel ID, trying in order:
1. A `/channel/UC...` URL pattern — the channel ID is extracted directly, no API call needed.
2. An `@handle` (bare, e.g. `@mrbeast`, or embedded in a URL, e.g. `youtube.com/@mrbeast`) —
   resolved via `GET /youtube/v3/channels?part=id&forHandle=<handle>`.
3. Otherwise, treated as a free-text channel name — resolved via
   `GET /youtube/v3/search?part=snippet&type=channel&maxResults=1&q=<channelQuery>`, taking the
   first result's channel ID.

Once a channel ID is resolved, fetches that channel's top 5 videos by view count
(`GET /youtube/v3/search?part=snippet&channelId=<id>&type=video&order=viewCount&maxResults=5`)
and returns a formatted summary string (same shape as `fetchYoutubeTrendContext`'s output: a
bulleted list of video titles).

**Contract, matching `fetchYoutubeTrendContext` exactly:** never throws. Any failure at any
step — unresolvable channel, non-2xx response, empty results — returns `null`, so callers can
cleanly fall back rather than failing the whole request.

## `createIdeasForProject` (`src/server/ideas.ts`)

The `input` parameter gains an optional field:

```ts
input: { channelTopic: string; primaryNiche: string; targetAudience: string; inspirationChannel?: string }
```

Context-fetching logic changes from:

```ts
const youtubeContext = youtubeApiKey
  ? await fetchYoutubeTrendContext(youtubeApiKey, `${input.channelTopic} ${input.primaryNiche}`)
  : null;
```

to:

```ts
const youtubeContext = !youtubeApiKey
  ? null
  : input.inspirationChannel?.trim()
    ? await fetchYoutubeChannelContext(youtubeApiKey, input.inspirationChannel.trim())
    : await fetchYoutubeTrendContext(youtubeApiKey, `${input.channelTopic} ${input.primaryNiche}`);
```

Everything downstream (prompt building via `buildIdeaPrompt`, `determineScoreSource`, idea
persistence) is unchanged — `youtubeContext` is consumed the same way regardless of which
function produced it. `determineScoreSource(youtubeContext !== null)` still means: if the
channel lookup fails and falls through to `null`, the ideas are scored as `AI_ESTIMATE`, not
`REAL_YOUTUBE_DATA` — correct, since no real data was actually used.

## API Route (`src/app/api/ideas/route.ts`)

`POST /api/ideas` accepts an additional optional `inspirationChannel` field in the request body
(no new validation beyond `typeof inspirationChannel === "string" | undefined` — an empty or
whitespace-only value is treated as "not provided" by `createIdeasForProject`'s own `.trim()`
check, so the route does not need to pre-validate this itself). Passed straight through to
`createIdeasForProject`. No other route behavior changes.

## UI (`/idea-finder` page)

A fourth input field, "Inspiration Channel (optional)", placed after the existing three inputs.
Unlike the other three, it does not gate the "Generate Ideas" button — the button remains enabled
based on the existing three required fields only. Its value is included in the `POST /api/ideas`
body when generating. No other UI changes (existing idea cards, loading/error states unchanged).

## Testing

- Unit tests for `fetchYoutubeChannelContext` covering: a `/channel/UC...` URL input, an `@handle`
  input, a plain-text channel name input, and a failure path (non-2xx response → `null`).
- No changes needed to existing `createIdeasForProject`/`buildIdeaPrompt` tests beyond adding a
  case that confirms `inspirationChannel` routes to `fetchYoutubeChannelContext` instead of
  `fetchYoutubeTrendContext` (module-mocked, same pattern as the existing Idea Finder integration
  test).
- No E2E. Standing safety rule unchanged: never run the bare `npm test`/unscoped `vitest run`
  against a live database.
