# ArwaTube AI Engine — SEO Titles & Keyword Research — Design

## Context

Phases completed and merged to `main`: Phase 1 (Foundation), Phase 2 (Idea Finder), Phase 3a
(Thumbnail Studio & Higgsfield Integration), Script Writer. This document covers **SEO Titles &
Keyword Research**, the next sub-phase of the Long-Form Suite, per the roadmap order agreed
during Phase 3 brainstorming: Thumbnail Studio → Script Writer → SEO Titles & Keyword Research →
Description & Tags.

The app already has a `/seo-titles` placeholder page and a matching entry in `IdeaCard`'s action
icons (`{ icon: "T", label: "SEO Titles", href: "/seo-titles" }`) and the sidebar. There is no
separate `/keyword-research` entry point in the UI — keyword research is folded into this single
SEO Titles page/feature, not a standalone module.

## Scope

- A `TitleSet` Prisma model: one title/keyword set per idea (enforced via a unique, nullable
  `ideaId`), or a set generated from a manually-entered topic with no linked idea — same pattern
  as `Script`.
- `POST /api/titles` — generates 8 title variations and 10 keywords in a single Claude call,
  informed by real YouTube trend data when a project has a YouTube Data API key configured
  (reusing `lib/youtube`'s `fetchYoutubeTrendContext`, same as Idea Finder).
- `GET /api/titles?projectId=...` — list title sets for a project.
- `PATCH /api/titles/:id` — save the user's selected title (one of the 8 generated titles).
- `POST /api/titles/:id/regenerate` — regenerate the whole title/keyword batch in place (not
  per-title — unlike Script Writer's per-section regeneration, a title/keyword set is treated
  as one cohesive batch, not independently-editable sections).
- `/seo-titles` page (replacing its Phase 1 placeholder): topic input (pre-filled from
  `useWorkflowStore.selectedIdeaId` when arriving from an Idea Finder card), a "Research Titles"
  button, then a list of 8 selectable titles and 10 keyword chips once a set exists.

Out of scope: Description & Tags (separate future sub-phase). Per-title regeneration. Free-text
custom titles outside the generated 8 (the user picks one of the 8, they do not type their own).

## Data Model

```prisma
model TitleSet {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  ideaId    String? @unique
  idea      Idea?   @relation(fields: [ideaId], references: [id], onDelete: SetNull)

  topic         String
  titles        String[]
  keywords      String[]
  selectedTitle String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- `ideaId` is nullable but unique — enforces at most one title set per idea, matching `Script`'s
  pattern exactly. A title set can also exist with no linked idea (manually-entered topic).
- `topic` is stored on the row (not just derived from a linked idea) for the same reason as
  `Script.topic`: `regenerateTitleSet` needs the original topic as context, and a set can exist
  with no linked `Idea`.
- `titles` and `keywords` are native Postgres `String[]` columns (Prisma supports this directly
  for Postgres — no separate join table or JSON blob needed).
- `selectedTitle` stores the chosen title's text directly (not an index), so it survives
  independent of array ordering. It is nullable — unset until the user picks one, and reset to
  `null` whenever `regenerateTitleSet` produces a new batch (the old selection may no longer
  exist in the new list).
- `Project` gains a `titleSets TitleSet[]` relation; `Idea` gains an optional `titleSet TitleSet?`
  back-relation (1:1, since `TitleSet.ideaId` is unique).

## Architecture

### Prompt building & parsing (`src/server/titles.ts`, mirroring `src/server/scripts.ts` and `src/server/ideas.ts`)

- `buildTitlesPrompt(input: { topic: string; youtubeContext?: string | null })`: requests
  exactly 8 title variations and 10 keywords from Claude as a single structured JSON response
  (`{titles: string[8], keywords: string[10]}`). When `youtubeContext` is provided, it's appended
  to the prompt the same way `buildIdeaPrompt` appends YouTube trend data — real high-performing
  video titles/view counts to inform the suggestions.
- `parseTitlesResponse(raw: string)`: extracts and validates the JSON object, mirroring
  `parseScriptResponse`'s markdown-fence-stripping and try/catch-wrapped `JSON.parse` pattern.
  Validates `titles` is an array of exactly 8 strings and `keywords` is an array of exactly 10
  strings.

### `createTitleSetForIdeaOrTopic` (initial generation)

1. If `ideaId` is provided: look up any existing `TitleSet` for it — if found, return it as-is
   (no regeneration), so re-visiting SEO Titles for an idea that already has a set never
   silently overwrites it or wastes a Claude call.
2. Otherwise (or if no existing set found): call `fetchYoutubeTrendContext(youtubeApiKey, topic)`
   if a `youtubeApiKey` was provided (it returns `null` on any failure — never throws, same
   contract as Idea Finder's usage), then `buildTitlesPrompt` + `getLlmClient().generateText(...)`
   + `parseTitlesResponse`, then `prisma.titleSet.create(...)`.

### `regenerateTitleSet`

Takes `(titleSetId)`, loads the existing set, re-fetches YouTube trend context for the stored
`topic` (using the caller-supplied `youtubeApiKey`, same as generation), regenerates the full
batch via Claude, and updates `titles`, `keywords`, **and clears `selectedTitle` to `null`**
(the previous selection may not exist in the new list).

## API Routes

All four routes follow the established ownership-check pattern (`project.userId ===
session.user.id`, or via the title set's project for the two ID-scoped routes) and the
try/catch-wrapped-Claude-call → 502-on-failure pattern used by `/api/ideas` and `/api/scripts`.

- **`POST /api/titles`** — body `{projectId, ideaId?, topic}`. Ownership-checks the project (and
  the idea, if provided, the same lenient way `/api/scripts` resolves an optional `ideaId` —
  silently proceed without it if it doesn't resolve). Decrypts `project.settings.youtubeApiKey`
  if present (decrypt call inside the same try/catch that wraps the generation call — not
  before it, per the established fix pattern from Phase 2's review). Delegates to
  `createTitleSetForIdeaOrTopic`. Returns `{titleSet}`, 201 on new creation or 200 if an existing
  set for that idea was returned instead.
- **`GET /api/titles?projectId=...`** — ownership-checked, returns `{titleSets}` for the project,
  most recent first.
- **`PATCH /api/titles/:id`** — body `{selectedTitle}` where `selectedTitle` must be a string
  present in that title set's `titles` array (400 if not). Ownership-checked via the title set's
  project. Updates just that column, returns the updated `{titleSet}`.
- **`POST /api/titles/:id/regenerate`** — no body needed. Ownership-checked (404) **before** the
  try/catch wrapping the actual regeneration call, so a missing/foreign title set returns 404,
  not a misleading 502 — the exact ordering fixed into Script Writer's regenerate route during
  its Task 6 review. Delegates to `regenerateTitleSet`, wrapped in try/catch → 502 on failure.
  Returns the updated `{titleSet}`.

## UI / UX

- `/seo-titles` page: a topic input (pre-filled from the selected idea's title/hook when
  `useWorkflowStore.selectedIdeaId` is set, same pattern as Thumbnail Studio and Script Writer),
  and a "Research Titles" button.
- On page load: if `selectedIdeaId` is set and that idea already has a title set (`GET
  /api/titles?projectId=...` includes it), load and display that set directly instead of the
  empty generation form.
- Once a set exists: 8 titles rendered as selectable rows (radio-style — clicking one calls
  `PATCH /api/titles/:id` with `{selectedTitle}` immediately, no separate save button), the
  currently-selected title visually marked; 10 keywords rendered as read-only chips below (no
  interaction — informational context for the creator, not individually actionable).
- A "Regenerate" button that calls `POST /api/titles/:id/regenerate` and replaces the whole list
  in place (any prior selection is cleared, matching the data model).
- Consistent with Idea Finder/Thumbnail Studio/Script Writer: a visible error message on any
  failed generate/regenerate/select call (not silent).

## Testing

- Unit tests: `buildTitlesPrompt` (includes topic, includes YouTube context when provided),
  `parseTitlesResponse` (valid JSON, markdown-fenced, no-JSON-throws, wrong-array-length-throws,
  malformed-JSON-throws).
- Integration test: `createTitleSetForIdeaOrTopic` against a real DB with `lib/llm` and
  `lib/youtube` mocked at their module boundaries — covering the "no idea, fresh generation" path
  and the "idea already has a set, return existing" path.
- No E2E tests, consistent with prior phases.
- **Standing safety rule carried over from every prior phase:** never run the bare `npm test` or
  an unscoped `vitest run` against a live/shared `DATABASE_URL` — only specifically-named test
  files. A DB-connectivity failure on the integration test (when no `.env`/`DATABASE_URL` is
  present in the implementation worktree) is an accepted, expected outcome, not a defect.

## Explicitly Out of Scope

- Description & Tags (separate future sub-phase spec).
- Per-title regeneration (only whole-batch regeneration is supported).
- Free-text custom titles — the user selects from the 8 generated titles only, they cannot type
  their own final title in this phase.
- A standalone `/keyword-research` page or route — keywords are shown as read-only context inside
  the SEO Titles page, not a separately generated/editable resource.
