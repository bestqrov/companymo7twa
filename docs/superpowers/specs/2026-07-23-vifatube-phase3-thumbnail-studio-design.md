# VifaTube AI Engine — Phase 3a: Thumbnail Studio & Higgsfield Integration — Design

## Context

Phase 1 (Foundation) and Phase 2 (Idea Finder) are complete and merged to `main`. The full
"Long-Form Suite" scope from the original product spec (Script Writer, SEO Titles, Keyword
Research, Description & Tags, Thumbnail Studio) is too large for one spec/plan cycle, so it
is decomposed into sub-phases, built in this order (confirmed with the user):

1. **Thumbnail Studio & Higgsfield Integration** (this document)
2. Script Writer
3. SEO Titles + Keyword Research
4. Description & Tags

This document covers Thumbnail Studio only.

## Clarified During Brainstorming: Higgsfield MCP vs. App Runtime

The Higgsfield MCP server connected to this Claude Code session is a tool for the assistant
to use during conversations — it is not something VifaTube's deployed Next.js backend can
call at runtime. The app's own server-side code (API routes, running on the user's Coolify
VPS) must talk to Higgsfield's REST API directly, using the app's own credentials, the same
pattern already established for `lib/llm` (Claude) and `lib/youtube` (YouTube Data API).

Higgsfield's authentication uses a key pair — **API Key ID + API Key Secret** — rather than
a single bearer token. The user has now obtained both and will provide them via the app's
`.env` file (gitignored) once implementation begins; they are never pasted into chat or
committed to git. `.env.example` documents the two required variable names
(`HIGGSFIELD_API_KEY_ID`, `HIGGSFIELD_API_KEY_SECRET`) with empty placeholder values, per the
existing pattern for `ANTHROPIC_API_KEY` etc.

The exact Higgsfield REST endpoint paths/request shapes are not fully known at spec time
(no access to their full API documentation during brainstorming) — the implementation plan
will need to consult Higgsfield's actual API docs when writing `lib/higgsfield`. The
interface shape below is fixed; the internal HTTP call details are an implementation detail
to be finalized against real documentation.

## Scope

- Real `lib/higgsfield` implementation (replacing the Phase 1 throwing stub) for image
  generation and CTR prediction, authenticated via the API Key ID/Secret pair.
- Real `lib/drive` implementation (replacing the Phase 1 throwing stub) for uploading a
  generated thumbnail to the user's linked Google Drive, using the `drive.file` OAuth token
  captured at login (Phase 1).
- A `Thumbnail` Prisma model, storing generation metadata (not the image bytes — per the
  Phase 1 architectural decision that the app never persists generated media server-side).
- `/thumbnails` page (replacing its Phase 1 placeholder): prompt input (pre-filled from
  `useWorkflowStore.selectedIdeaId` if the user arrived via an Idea Finder card), a
  Single/A-B-Test(4) mode toggle, a results grid with a CTR% badge per thumbnail, and
  Download / Save-to-Drive actions.
- `POST /api/thumbnails`, `GET /api/thumbnails`, `POST /api/thumbnails/:id/save-to-drive`.

Out of scope: video generation (Higgsfield's `generateVideo` stays a stub until a later
phase), Script Writer / SEO Titles / Keyword Research / Description & Tags (separate
sub-phases).

## Architecture

### `lib/higgsfield` (real implementation)

```
generateImage(prompt: string): Promise<{ url: string }>
predictCtr(imageUrl: string, context: string): Promise<number | null>
```

Authenticates via `HIGGSFIELD_API_KEY_ID` / `HIGGSFIELD_API_KEY_SECRET` env vars.
`predictCtr` mirrors the `fetchYoutubeTrendContext` fallback pattern from Phase 2: if
Higgsfield doesn't expose a usable CTR/virality-prediction endpoint, or the call fails for
any reason, it returns `null` rather than throwing, so the caller can fall back to a Claude
heuristic estimate. This preserves the same hybrid-with-fallback pattern already established
for Idea Finder's Virality Score (`REAL_YOUTUBE_DATA` / `AI_ESTIMATE`) — here as
`HIGGSFIELD_PREDICTOR` / `AI_ESTIMATE`.

### `lib/drive` (real implementation)

```
uploadFile(params: { name: string; mimeType: string; data: Buffer }): Promise<{ fileId: string }>
```

Uses the caller-supplied Google access token (decrypted from `User.googleAccessToken`,
following the same decrypt-in-route pattern as the YouTube API key) to call the Google Drive
API's `files.create`, relying on the `drive.file` scope already requested at login (Phase 1).
Only files this app creates are visible to it — consistent with the minimal-scope decision
made in Phase 1.

### Generation flow (`POST /api/thumbnails`)

1. Auth + ownership check on `projectId` (same pattern as `/api/ideas`, `/api/settings`).
2. Determine variant count: 1 for `mode: "single"`, 4 for `mode: "abtest"`, sharing one
   generated `variantGroup` id (a random UUID) for the 4-variant case.
3. For each variant: call `generateImage(prompt)`, then `predictCtr(imageUrl, prompt)`;
   `ctrSource` is `HIGGSFIELD_PREDICTOR` if `predictCtr` returned a number, else fall back to
   asking Claude (via `lib/llm`) for a heuristic CTR estimate and mark `ctrSource:
   AI_ESTIMATE`.
4. Persist all variants to the `Thumbnail` table, return them.

### `GET /api/thumbnails?projectId=...`

Returns previously-generated thumbnails for a project (ownership-checked), most recent
first.

### `POST /api/thumbnails/:id/save-to-drive`

Ownership-checked (via the thumbnail's project). Server-side fetches the image bytes from
the stored `imageUrl`, then calls `lib/drive.uploadFile` with the user's decrypted Drive
token. Returns the resulting Drive `fileId`.

## Data Model

```prisma
enum CtrSource {
  HIGGSFIELD_PREDICTOR
  AI_ESTIMATE
}

model Thumbnail {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  ideaId    String?
  idea      Idea?   @relation(fields: [ideaId], references: [id], onDelete: SetNull)

  prompt       String
  imageUrl     String
  ctrEstimate  Int
  ctrSource    CtrSource
  variantGroup String

  createdAt DateTime @default(now())
}
```

`Project` gains a `thumbnails Thumbnail[]` relation; `Idea` gains an optional
`thumbnails Thumbnail[]` back-relation. `ideaId` is nullable with `onDelete: SetNull` — a
thumbnail survives its source idea being deleted, it just loses the association.
`imageUrl` stores Higgsfield's returned URL, not the image bytes, consistent with the
no-server-side-media-storage decision; users download directly or save to their own Drive.

## UI / UX

- `/thumbnails` page: a prompt textarea (pre-filled if `useWorkflowStore.selectedIdeaId` is
  set — fetches that idea's title/hook to seed a starting prompt, editable), a
  Single / "A/B Test (4 variations)" mode toggle, and a "Generate" button.
- Results render as a grid (1 image for single mode, a 4-column grid for A/B mode), each
  with a colored CTR% badge (thresholds to be tuned against real Higgsfield output once
  available — placeholder: green ≥7%, orange 4–6.9%, red <4%) and its data-source
  ("Higgsfield" vs "AI Estimate") indicated the same way Idea Finder's cards distinguish
  `REAL_YOUTUBE_DATA` vs `AI_ESTIMATE`.
- Each thumbnail has Download (direct link/anchor to `imageUrl`) and "Save to Drive"
  (calls `POST /api/thumbnails/:id/save-to-drive`) actions.
- On page load: `GET /api/thumbnails` populates previously-generated thumbnails for the
  active project, same pattern as Idea Finder.

## Testing

- Unit tests: `ctrSource`/fallback determination logic, prompt-building for the CTR
  heuristic fallback (mirrors Phase 2's `determineScoreSource`/`buildIdeaPrompt` tests).
- Integration test: `POST /api/thumbnails` persistence logic with `lib/higgsfield` mocked at
  its module boundary (no real Higgsfield credentials are available in the CI/sandbox
  environment used for automated testing — same accepted limitation pattern as Phase 1/2's
  DB-dependent integration tests).
- No E2E tests, consistent with prior phases.

## Explicitly Out of Scope (This Sub-Phase)

- Video generation (`Higgsfield.generateVideo` stays a throwing stub).
- Script Writer, SEO Titles, Keyword Research, Description & Tags (separate sub-phase specs).
- Tuning the CTR badge color thresholds against real data — placeholder values are used
  until real Higgsfield output is observed.
- Exact Higgsfield REST API request/response shapes — to be finalized against their
  documentation during implementation, since full API docs weren't available during this
  brainstorming session.
