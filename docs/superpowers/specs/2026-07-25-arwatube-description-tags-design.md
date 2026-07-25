# ArwaTube AI Engine — Description & Tags — Design

## Context

Phases completed and merged to `main`: Phase 1 (Foundation), Phase 2 (Idea Finder), Phase 3a
(Thumbnail Studio & Higgsfield Integration), Script Writer, SEO Titles & Keyword Research (which
folded keyword research into the SEO Titles page rather than shipping a standalone
`/keyword-research` module — see that phase's design doc). This document covers **Description &
Tags**, the final sub-phase of the Long-Form Suite, per the roadmap order agreed during Phase 3
brainstorming: Thumbnail Studio → Script Writer → SEO Titles & Keyword Research → Description &
Tags.

The app already has a `/description-tags` placeholder page and a matching entry in `IdeaCard`'s
action icons (`{ icon: "🏷️", label: "Description & Tags", href: "/description-tags" }`) and the
sidebar.

## Scope

- A `DescriptionTagSet` Prisma model: one set per idea (enforced via a unique, nullable `ideaId`),
  or a set generated from a manually-entered topic with no linked idea — same pattern as `Script`
  and `TitleSet`.
- `POST /api/description-tags` — generates a video description, tags, hashtags, a suggested
  category (from YouTube's real fixed category taxonomy), and a pinned-comment suggestion in a
  single Claude call. When the target idea already has a `TitleSet` with a `selectedTitle` and/or
  `keywords`, those are pulled in as prompt context so the output stays consistent with earlier
  workflow steps.
- `GET /api/description-tags?projectId=...` — list sets for a project.
- `PATCH /api/description-tags/:id` — save a manual edit to one field (`description`, `tags`,
  `hashtags`, `category`, or `pinnedComment`).
- `POST /api/description-tags/:id/regenerate` — regenerate the whole 5-field batch in place (not
  per-field — like SEO Titles, treated as one cohesive batch).
- `/description-tags` page (replacing its Phase 1 placeholder): topic input (pre-filled from the
  selected idea via the established `?ideaId=` URL-param-first / `useWorkflowStore.selectedIdeaId`
  fallback pattern), a "Generate Metadata" button, then editable description/tags/hashtags/
  category/pinned-comment fields once a set exists.

Out of scope: per-field regeneration (whole-batch only), any real YouTube upload integration (a
later phase, One-Click Publish), enforcing a specific hashtag count beyond "a small suggested
set (3-5)".

## Data Model

```prisma
model DescriptionTagSet {
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  ideaId        String?  @unique
  idea          Idea?    @relation(fields: [ideaId], references: [id], onDelete: SetNull)

  topic         String
  description   String
  tags          String[]
  hashtags      String[]
  category      String
  pinnedComment String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- `ideaId` is nullable but unique — at most one set per idea, matching `TitleSet`/`Script`. A set
  can also exist with no linked idea (manually-entered topic).
- `topic` is stored on the row (not just derived from a linked idea), same reasoning as
  `Script.topic`/`TitleSet.topic`: `regenerateDescriptionTagSet` needs the original topic as
  context, and a set can exist with no linked `Idea`.
- `tags` and `hashtags` are native Postgres `String[]` columns, same as `TitleSet.titles`/
  `TitleSet.keywords`.
- `category` is a plain `String` column but constrained at the application layer (prompt +
  response validation) to YouTube's fixed category taxonomy: Film & Animation, Autos & Vehicles,
  Music, Pets & Animals, Sports, Travel & Events, Gaming, People & Blogs, Comedy, Entertainment,
  News & Politics, Howto & Style, Education, Science & Technology, Nonprofits & Activism. This is
  the real list YouTube's upload API accepts, so a later One-Click Publish phase can use this
  value directly without remapping.
- `description` and `pinnedComment` are plain, non-empty `String` columns — no length cap enforced
  at the schema level (Claude is prompted for reasonable lengths; not worth a hard DB constraint).
- `Project` gains a `descriptionTagSets DescriptionTagSet[]` relation; `Idea` gains an optional
  `descriptionTagSet DescriptionTagSet?` back-relation (1:1, since `DescriptionTagSet.ideaId` is
  unique).

## Architecture

### Prompt building & parsing (`src/server/descriptionTags.ts`, mirroring `src/server/titles.ts`)

- `buildDescriptionTagsPrompt(input: { topic: string; selectedTitle?: string | null; keywords?: string[] | null })`:
  requests a description, tags, hashtags, category, and pinned-comment suggestion from Claude as a
  single structured JSON response (`{description, tags, hashtags, category, pinnedComment}`). When
  `selectedTitle` and/or `keywords` are provided, they're appended to the prompt as established
  context ("the creator has already chosen this title for the video: ...", "these keywords were
  already researched for this video's SEO: ..."), so the generated description/tags stay aligned
  with earlier workflow steps instead of contradicting them. The prompt lists the fixed YouTube
  category names verbatim and instructs Claude to respond with exactly one of them.
- `parseDescriptionTagsResponse(raw: string)`: extracts and validates the JSON object, mirroring
  `parseTitlesResponse`'s markdown-fence-stripping and try/catch-wrapped `JSON.parse` pattern.
  Validates: `description` and `pinnedComment` are non-empty strings; `tags` and `hashtags` are
  arrays of strings; `category` is a non-empty string that exactly matches one of the fixed
  YouTube category names (throws otherwise).

### `createDescriptionTagSetForIdeaOrTopic` (initial generation)

1. If `ideaId` is provided: look up any existing `DescriptionTagSet` for it — if found, return it
   as-is (no regeneration), so re-visiting Description & Tags for an idea that already has a set
   never silently overwrites it or wastes a Claude call.
2. Otherwise (or if no existing set found): if `ideaId` is provided, look up that idea's `TitleSet`
   (if any) to source `selectedTitle` and `keywords` as prompt context; both are `null` if no
   `TitleSet` exists yet or no title has been selected. Then `buildDescriptionTagsPrompt` +
   `getLlmClient().generateText(...)` + `parseDescriptionTagsResponse`, then
   `prisma.descriptionTagSet.create(...)`.

### `regenerateDescriptionTagSet`

Takes `(descriptionTagSetId)`, loads the existing set, re-pulls the linked idea's `TitleSet`
context (if `ideaId` is set and a `TitleSet` still exists), regenerates the full 5-field batch via
Claude, and overwrites `description`, `tags`, `hashtags`, `category`, and `pinnedComment` on the
row.

## API Routes

All routes follow the established ownership-check pattern (`project.userId ===
session.user.id`, or via the set's project for the two ID-scoped routes) and the
try/catch-wrapped-Claude-call → 502-on-failure pattern used by `/api/titles` and `/api/scripts`.

- **`POST /api/description-tags`** — body `{projectId, ideaId?, topic}`. Ownership-checks the
  project (and the idea, if provided, the same lenient way `/api/titles` resolves an optional
  `ideaId` — silently proceed without it if it doesn't resolve). Delegates to
  `createDescriptionTagSetForIdeaOrTopic`. Returns `{descriptionTagSet}`, 201 on new creation or
  200 if an existing set for that idea was returned instead.
- **`GET /api/description-tags?projectId=...`** — ownership-checked, returns
  `{descriptionTagSets}` for the project, most recent first.
- **`PATCH /api/description-tags/:id`** — body `{field, value}` where `field` is one of
  `description|tags|hashtags|category|pinnedComment` (mirrors Script Writer's `{section,
  content}` shape). `value` must be a `string` for `description`/`pinnedComment`/`category`, or a
  `string[]` for `tags`/`hashtags` (400 on type mismatch for the given field). If `field ===
  "category"`, `value` is additionally re-validated against the fixed YouTube category list (400
  if not a match). Ownership-checked via the set's project. Updates just that column, returns the
  updated `{descriptionTagSet}`.
- **`POST /api/description-tags/:id/regenerate`** — no body needed. Ownership-checked (404)
  **before** the try/catch wrapping the actual regeneration call, so a missing/foreign set returns
  404, not a misleading 502 — same ordering as `/api/titles/:id/regenerate` and
  `/api/scripts/:id/regenerate`. Delegates to `regenerateDescriptionTagSet`, wrapped in try/catch →
  502 on failure. Returns the updated `{descriptionTagSet}`.

## UI / UX

- `/description-tags` page: a topic input (pre-filled from the selected idea's title/hook when
  arriving via `?ideaId=` or `useWorkflowStore.selectedIdeaId`, same pattern as SEO Titles/Script
  Writer/Thumbnail Studio), and a "Generate Metadata" button.
- On page load: if a selected idea already has a set (`GET /api/description-tags?projectId=...`
  includes it), load and display that set directly instead of the empty generation form.
- Once a set exists, five editable fields, each autosaving independently with no separate "Save"
  button (Script Writer's established pattern):
  - `description` — a `textarea`, autosaves via `PATCH {field: "description", value}` on blur.
  - `tags` — an editable chip list: each chip has a small "×" to remove (autosaves the reduced
    array immediately), plus a small text input + Enter to add a new tag (autosaves the appended
    array immediately).
  - `hashtags` — same editable chip-list pattern as `tags`.
  - `category` — a `<select>` populated with the fixed YouTube category list, autosaves via
    `PATCH` on change.
  - `pinnedComment` — a `textarea`, autosaves via `PATCH` on blur, same as `description`.
- A "Regenerate" button that calls `POST /api/description-tags/:id/regenerate` and replaces all
  five fields in place (any in-progress unsaved edit in a field is overwritten by the regenerated
  value, consistent with SEO Titles' "regeneration replaces the whole set" behavior).
- Consistent with every prior module: a visible error message on any failed generate/regenerate/
  save call (not silent).

## Testing

- Unit tests: `buildDescriptionTagsPrompt` (includes topic; includes selected-title context when
  provided; includes keywords context when provided; omits both when absent),
  `parseDescriptionTagsResponse` (valid JSON, markdown-fenced, no-JSON-throws,
  invalid-category-throws, missing-required-field-throws, wrong-type-for-tags/hashtags-throws,
  malformed-JSON-throws).
- Integration test: `createDescriptionTagSetForIdeaOrTopic` against a real DB with `lib/llm`
  mocked at its module boundary — covering: "no idea, fresh generation" path, "idea already has a
  set, return existing" path, and "idea has a `TitleSet` with a selected title and keywords, both
  are present in the prompt sent to the mocked LLM client" path.
- No E2E tests, consistent with prior phases.
- **Standing safety rule carried over from every prior phase:** never run the bare `npm test` or
  an unscoped `vitest run` against a live/shared `DATABASE_URL` — only specifically-named test
  files. A DB-connectivity failure on the integration test (when no `.env`/`DATABASE_URL` is
  present in the implementation worktree) is an accepted, expected outcome, not a defect.

## Explicitly Out of Scope

- Per-field regeneration (only whole-batch regeneration is supported, same as SEO Titles).
- Any real YouTube upload/publish integration — that's One-Click Publish, a separate future
  sub-phase.
- Enforcing a specific hashtag count in code (schema/validation) beyond prompting Claude for "a
  small suggested set (3-5)" — no hard array-length check like `TitleSet`'s exactly-8/exactly-10
  validation, since hashtag count is inherently more variable/subjective than a titles/keywords
  batch.
- A separate description-length cap or SEO-score display for the description field.
