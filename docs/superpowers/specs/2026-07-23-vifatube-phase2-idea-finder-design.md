# VifaTube AI Engine — Phase 2: Idea Finder — Design

## Context

Phase 1 (Foundation & Global State) is complete and merged to `main`: Next.js App Router,
PostgreSQL via Prisma, NextAuth (Google-only, `drive.file` scope, database sessions),
multi-project/channel support, Zustand (`useAppStore` for the active project,
`useWorkflowStore` scaffolded for cross-module handoff), a Settings page (encrypted YouTube
API key, target country/language), and interface-only stubs for `lib/llm`, `lib/higgsfield`,
`lib/drive`.

This document covers **Phase 2 only**: the Idea Finder module — the entry point where a
creator turns a topic into scored video concepts, which then route into the (still
placeholder) Long-Form Suite modules.

**Scope note on `lib/llm`:** Phase 1's plan labeled the LLM client implementation as
"Phase 3" work, but Idea Finder needs real LLM generation now. This phase replaces the
`lib/llm` throwing stub with a real Claude API implementation. The "Phase 3" label in the
original spec was an approximate estimate, not a hard boundary — Phase 3 will still add
whatever additional LLM usage it needs (scripts, SEO titles) on top of this same client.

**UI reference:** Idea card layout (circular percentage score, data-source badge, Hook
callout, multi-icon "use this idea in" row) was refined during brainstorming using a
comparable product's card design as visual inspiration, validated with the user via mockup.

## Scope

- Idea Finder input form: Channel Topic, Primary Niche, Target Audience.
- Idea generation: hybrid — real YouTube Data API trend signals (when the project has a
  YouTube API key configured) blended into the Claude prompt, or pure LLM heuristic
  generation when no key is present.
- Virality Score: 0-100 integer, color-coded (Green ≥80, Orange 50-79, Red <50), tagged with
  a `scoreSource` (`REAL_YOUTUBE_DATA` or `AI_ESTIMATE`) shown as a badge on the card.
- Ideas persist to the database, scoped to the active `Project`, so a user can leave and
  return without regenerating.
- Each idea card has five action icons (Script Writer, SEO Titles, Keyword Research,
  Description & Tags, Thumbnails) that store the selected idea in `useWorkflowStore` and
  navigate to the corresponding module page. Those module pages remain Phase 1 placeholders
  — only the routing/state-handoff is built now, so it's ready when Phase 3 implements them.
- Replaces the `lib/llm` stub with a real Claude API client.

Out of scope: implementing the destination modules themselves (Script Writer, SEO Titles,
etc. stay placeholders), the Multi-Platform Repurposing Engine, Higgsfield/Drive usage.

## Architecture

### Idea generation flow (`POST /api/ideas`)

1. Auth + ownership check: session must own `projectId` (same pattern as `/api/settings`).
2. Load `ProjectSettings.youtubeApiKey`; if present, `decrypt()` it (first real use of
   `lib/crypto.ts`'s `decrypt`, which existed since Phase 1 but was only exercised by
   `encrypt` in tests until now).
3. If a key is present: query the YouTube Data API (search + videos.list) for trend signals
   related to the submitted Channel Topic/Niche (view counts, titles of similar videos).
4. Build a prompt for Claude (via `lib/llm`) combining the form inputs and, if available,
   the YouTube trend data. Request a fixed number of ideas (6) as structured JSON: `title`,
   `description`, `hook`, and a Claude-estimated score.
5. `scoreSource` is set by the route based on whether real YouTube data was actually used
   for that generation call — not decided by Claude.
6. Persist all 6 generated ideas to the `Idea` table under the active project, return them.

### `GET /api/ideas?projectId=...`

Returns previously-generated ideas for a project (ownership-checked), so the Idea Finder
page shows existing ideas on load without requiring regeneration.

### `lib/llm` (real implementation, replacing the Phase 1 stub)

Implements `LlmClient.generateText` (already defined in the Phase 1 interface) against the
Claude API (Anthropic SDK), reading the API key from `.env` (a new `ANTHROPIC_API_KEY`
variable, following the same `.env`/`.env.example` pattern as other secrets). The interface
shape stays exactly as Phase 1 defined it — only the throwing stub body is replaced with a
real call — so nothing else in `getLlmClient()`'s contract changes for future callers.

## Data Model

```prisma
enum ScoreSource {
  REAL_YOUTUBE_DATA
  AI_ESTIMATE
}

model Idea {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  title       String
  description String
  hook        String

  viralityScore Int
  scoreSource   ScoreSource

  createdAt DateTime @default(now())
}
```

`Project` gains an `ideas Idea[]` relation. No changes to any Phase 1 model.

## UI / UX

- `/idea-finder` page: input form (Topic/Niche/Audience + "Generate Ideas" button) above a
  card grid.
- On page load: `GET /api/ideas` populates the grid with previously-generated ideas for the
  active project, if any exist.
- Each card: title, one-line description, a circular percentage score (colored per the
  Green/Orange/Red thresholds above), a data-source badge ("REAL YOUTUBE DATA" /
  "AI ESTIMATE"), a highlighted "Hook" callout, and a row of 5 icon buttons labeled via
  `title` attributes: Script Writer (📄), SEO Titles (T), Keyword Research (🔍),
  Description & Tags (🏷️), Thumbnails (🖼️).
- Clicking any icon: calls `useWorkflowStore.setSelectedIdeaId(idea.id)`, then
  `router.push()` to that module's route (e.g. `/script-writer`). The destination pages
  remain Phase 1 placeholders for now; they'll read `selectedIdeaId` once Phase 3 implements
  them.

## Testing

- Unit tests: `scoreSource` determination logic (real-data-used vs. not), and
  `useWorkflowStore.setSelectedIdeaId`.
- Integration test: `POST /api/ideas` with no YouTube API key configured on the project →
  asserts ideas are persisted with `scoreSource: AI_ESTIMATE`. The real Claude API call is
  mocked at the `lib/llm` boundary for this test — calling the actual Anthropic API isn't
  something to depend on in CI.
- No E2E tests, consistent with Phase 1.

## Explicitly Out of Scope (Phase 2)

- Implementing Script Writer, SEO Titles, Keyword Research, Description & Tags, or
  Thumbnails themselves — they stay Phase 1 placeholders; only routing/state-handoff to them
  is built here.
- The Multi-Platform Repurposing Engine (Phase 4).
- Higgsfield or Google Drive usage (Phase 3+).
- Real YouTube Data API quota/error handling beyond a basic "key present or not" check —
  deeper API failure handling (rate limits, invalid key at call time) is deferred; a failed
  YouTube API call falls back to the AI_ESTIMATE path for that generation rather than
  failing the whole request.
