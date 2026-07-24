# ArwaTube AI Engine — Idea Finder: Inspiration Channel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional "Inspiration Channel" input to Idea Finder that, when provided, generates ideas informed by a specific YouTube channel's top videos instead of a generic keyword trend search.

**Architecture:** A new `fetchYoutubeChannelContext` function in `src/lib/youtube/index.ts` resolves a channel name/handle/URL to real video data (never throws, same contract as the existing `fetchYoutubeTrendContext`). `createIdeasForProject` (`src/server/ideas.ts`) branches on an optional `inspirationChannel` input field to pick which YouTube fetch function supplies context to the existing prompt-building/generation pipeline — everything downstream is unchanged. The route and page pass this one new optional field through.

**Tech Stack:** Next.js App Router, TypeScript, YouTube Data API v3, Vitest.

---

## File Structure

```
src/
  lib/
    youtube/
      index.ts                    (MODIFY: add fetchYoutubeChannelContext)
  server/
    ideas.ts                      (MODIFY: createIdeasForProject accepts inspirationChannel)
  app/
    api/
      ideas/
        route.ts                  (MODIFY: pass inspirationChannel through)
    (app)/
      idea-finder/
        page.tsx                  (MODIFY: add Inspiration Channel input)

tests/
  unit/
    youtube.test.ts               (MODIFY: add fetchYoutubeChannelContext tests)
    ideas.test.ts                 (no changes needed — createIdeasForProject isn't unit-tested, only its pure helpers are)
```

**Standing safety rule, unchanged from every prior phase:** never run the bare `npm test` or an unscoped `vitest run` with no path argument. Only run specifically-named files, exactly as shown in each task below.

---

## Task 1: `fetchYoutubeChannelContext`

**Files:**
- Modify: `src/lib/youtube/index.ts`
- Test: `tests/unit/youtube.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these `describe` blocks to the end of `tests/unit/youtube.test.ts` (keep the existing `fetchYoutubeTrendContext` tests and imports, just add `fetchYoutubeChannelContext` to the existing import line and append):

```ts
// Change the existing import line at the top of the file to:
import { fetchYoutubeTrendContext, fetchYoutubeChannelContext } from "@/lib/youtube";

// Append this describe block at the end of the file:
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/youtube.test.ts`
Expected: FAIL — `fetchYoutubeChannelContext is not exported` (or similar)

- [ ] **Step 3: Add `fetchYoutubeChannelContext` to `src/lib/youtube/index.ts`**

Append this function to the end of the file (keep the existing `fetchYoutubeTrendContext` unchanged above it):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/youtube.test.ts`
Expected: PASS (11 tests — 5 existing + 6 new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/index.ts tests/unit/youtube.test.ts
git commit -m "feat: add fetchYoutubeChannelContext for channel-based idea inspiration"
```

---

## Task 2: Wire `inspirationChannel` Through `createIdeasForProject`

**Files:**
- Modify: `src/server/ideas.ts`

- [ ] **Step 1: Update the import and function**

Change the import line at the top of `src/server/ideas.ts` from:

```ts
import { fetchYoutubeTrendContext } from "@/lib/youtube";
```

to:

```ts
import { fetchYoutubeTrendContext, fetchYoutubeChannelContext } from "@/lib/youtube";
```

Then replace the `createIdeasForProject` function's signature and its first block exactly as follows — change:

```ts
export async function createIdeasForProject(
  projectId: string,
  youtubeApiKey: string | null,
  input: { channelTopic: string; primaryNiche: string; targetAudience: string }
) {
  const youtubeContext = youtubeApiKey
    ? await fetchYoutubeTrendContext(youtubeApiKey, `${input.channelTopic} ${input.primaryNiche}`)
    : null;
```

to:

```ts
export async function createIdeasForProject(
  projectId: string,
  youtubeApiKey: string | null,
  input: { channelTopic: string; primaryNiche: string; targetAudience: string; inspirationChannel?: string }
) {
  const youtubeContext = !youtubeApiKey
    ? null
    : input.inspirationChannel?.trim()
      ? await fetchYoutubeChannelContext(youtubeApiKey, input.inspirationChannel.trim())
      : await fetchYoutubeTrendContext(youtubeApiKey, `${input.channelTopic} ${input.primaryNiche}`);
```

Leave everything else in the function (scoreSource, prompt building, persistence) exactly as it is — `buildIdeaPrompt({ ...input, youtubeContext })` will now also spread `inspirationChannel` into the prompt-builder's input object, which is harmless: `buildIdeaPrompt` only reads the fields it destructures/uses (`channelTopic`, `primaryNiche`, `targetAudience`, `youtubeContext`) and ignores unknown extra fields, same as any plain JS object spread.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the existing unit tests to confirm no regression**

Run: `npx vitest run tests/unit/ideas.test.ts`
Expected: PASS (all existing tests still pass — `buildIdeaPrompt`/`parseIdeasResponse`/`determineScoreSource` are unchanged, this task only touches `createIdeasForProject`, which isn't unit-tested directly).

- [ ] **Step 4: Commit**

```bash
git add src/server/ideas.ts
git commit -m "feat: use inspiration channel context in idea generation when provided"
```

---

## Task 3: API Route — Pass `inspirationChannel` Through

**Files:**
- Modify: `src/app/api/ideas/route.ts`

- [ ] **Step 1: Update the `POST` handler**

In `src/app/api/ideas/route.ts`, change:

```ts
  const { projectId, channelTopic, primaryNiche, targetAudience } = await request.json();
  if (
    typeof projectId !== "string" ||
    typeof channelTopic !== "string" ||
    typeof primaryNiche !== "string" ||
    typeof targetAudience !== "string"
  ) {
    return NextResponse.json(
      { error: "projectId, channelTopic, primaryNiche, and targetAudience are required" },
      { status: 400 }
    );
  }
```

to:

```ts
  const { projectId, channelTopic, primaryNiche, targetAudience, inspirationChannel } = await request.json();
  if (
    typeof projectId !== "string" ||
    typeof channelTopic !== "string" ||
    typeof primaryNiche !== "string" ||
    typeof targetAudience !== "string" ||
    (inspirationChannel !== undefined && typeof inspirationChannel !== "string")
  ) {
    return NextResponse.json(
      { error: "projectId, channelTopic, primaryNiche, and targetAudience are required" },
      { status: 400 }
    );
  }
```

Then change the `createIdeasForProject` call from:

```ts
    ideas = await createIdeasForProject(projectId, youtubeApiKey, {
      channelTopic,
      primaryNiche,
      targetAudience,
    });
```

to:

```ts
    ideas = await createIdeasForProject(projectId, youtubeApiKey, {
      channelTopic,
      primaryNiche,
      targetAudience,
      inspirationChannel,
    });
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ideas/route.ts
git commit -m "feat: accept inspirationChannel in POST /api/ideas"
```

---

## Task 4: Idea Finder Page — Inspiration Channel Input

**Files:**
- Modify: `src/app/(app)/idea-finder/page.tsx`

- [ ] **Step 1: Add the state and input field**

Add a new state hook alongside the existing three, changing:

```ts
  const [channelTopic, setChannelTopic] = useState("");
  const [primaryNiche, setPrimaryNiche] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
```

to:

```ts
  const [channelTopic, setChannelTopic] = useState("");
  const [primaryNiche, setPrimaryNiche] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [inspirationChannel, setInspirationChannel] = useState("");
```

In the `useEffect` that resets form fields on project change, add the new field's reset, changing:

```ts
  useEffect(() => {
    setChannelTopic("");
    setPrimaryNiche("");
    setTargetAudience("");
    setGenerateError(null);
```

to:

```ts
  useEffect(() => {
    setChannelTopic("");
    setPrimaryNiche("");
    setTargetAudience("");
    setInspirationChannel("");
    setGenerateError(null);
```

In `generateIdeas`, add `inspirationChannel` to the request body, changing:

```ts
        body: JSON.stringify({
          projectId: currentProject.id,
          channelTopic,
          primaryNiche,
          targetAudience,
        }),
```

to:

```ts
        body: JSON.stringify({
          projectId: currentProject.id,
          channelTopic,
          primaryNiche,
          targetAudience,
          inspirationChannel: inspirationChannel.trim() || undefined,
        }),
```

In the JSX, add a fourth input after the existing three (change the grid to 4 columns and add the field), changing:

```tsx
      <div className="mt-6 grid grid-cols-3 gap-3">
        <input
          value={channelTopic}
          onChange={(e) => setChannelTopic(e.target.value)}
          placeholder="Channel Topic"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={primaryNiche}
          onChange={(e) => setPrimaryNiche(e.target.value)}
          placeholder="Primary Niche"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="Target Audience"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
      </div>
```

to:

```tsx
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <input
          value={channelTopic}
          onChange={(e) => setChannelTopic(e.target.value)}
          placeholder="Channel Topic"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={primaryNiche}
          onChange={(e) => setPrimaryNiche(e.target.value)}
          placeholder="Primary Niche"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="Target Audience"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={inspirationChannel}
          onChange={(e) => setInspirationChannel(e.target.value)}
          placeholder="Inspiration Channel (optional)"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
      </div>
```

Note: the `disabled` condition on the "Generate Ideas" button (`isGenerating || !currentProject`) is intentionally left unchanged — `inspirationChannel` does not gate the button, matching the design spec ("does not gate the Generate Ideas button").

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/idea-finder/page.tsx"
git commit -m "feat: add optional Inspiration Channel input to Idea Finder page"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Run the unit test suite (named files only, never the bare `npm test`)**

Run: `npx vitest run tests/unit`
Expected: all unit test files pass, including the 6 new `fetchYoutubeChannelContext` tests in `tests/unit/youtube.test.ts`.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: succeeds, `/idea-finder` and `/api/ideas` still present among the routes.

- [ ] **Step 3: Run `npx tsc --noEmit` across the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: Idea Finder inspiration-channel verification pass"
```

(Only run this if Steps 1-3 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** `fetchYoutubeChannelContext` (Task 1), `createIdeasForProject` branching
  logic (Task 2), route pass-through (Task 3), UI input (Task 4) — every spec section has a
  task.
- **Placeholder scan:** no TBD/TODO markers.
- **Type consistency:** `inspirationChannel?: string` is consistent across `createIdeasForProject`'s
  input type (Task 2), the route's destructuring/validation (Task 3), and the page's state/body
  (Task 4). `fetchYoutubeChannelContext`'s signature (`apiKey: string, channelQuery: string`) is
  called identically to `fetchYoutubeTrendContext`'s existing call sites in style.
- **Contract preserved:** `fetchYoutubeChannelContext` never throws (wrapped in a single
  try/catch), matching `fetchYoutubeTrendContext`'s existing contract exactly — this is what lets
  `createIdeasForProject` remain unchanged in its error-handling shape.
