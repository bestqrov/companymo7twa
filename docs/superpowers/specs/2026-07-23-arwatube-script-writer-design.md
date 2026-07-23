# ArwaTube AI Engine — Script Writer — Design

## Context

Phases completed and merged to `main`: Phase 1 (Foundation), Phase 2 (Idea Finder), Phase 3a
(Thumbnail Studio & Higgsfield Integration). The app was renamed from VifaTube to ArwaTube
during Phase 3a live testing. This document covers **Script Writer**, the next sub-phase of
the Long-Form Suite, per the roadmap order agreed during Phase 3 brainstorming: Thumbnail
Studio → Script Writer → SEO Titles + Keyword Research → Description & Tags.

## Scope

- A `Script` Prisma model: one script per idea (enforced via a unique, nullable `ideaId`), or
  a script generated from a manually-entered topic with no linked idea.
- `POST /api/scripts` — initial generation of all 5 sections at once, using Claude
  (`lib/llm`, already configured since Phase 2 — no new external API/credentials needed for
  this phase).
- `GET /api/scripts?projectId=...` — list scripts for a project.
- `PATCH /api/scripts/:id` — save a manual edit to one section.
- `POST /api/scripts/:id/regenerate` — regenerate a single section via Claude, in place.
- `/script-writer` page (replacing its Phase 1 placeholder): topic input (pre-filled from
  `useWorkflowStore.selectedIdeaId` when arriving from an Idea Finder card, matching the
  pattern already established for Thumbnail Studio), a tone selector, a "Generate Script"
  button, and five editable section cards once a script exists.

Out of scope: SEO Titles, Keyword Research, Description & Tags (separate future sub-phases).

## Data Model

```prisma
enum ScriptTone {
  ENGAGING
  EDUCATIONAL
  STORYTELLING
  FAST_PACED
}

model Script {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  ideaId    String?  @unique
  idea      Idea?    @relation(fields: [ideaId], references: [id], onDelete: SetNull)

  tone      ScriptTone

  hook        String
  intro       String
  mainContent String
  cta         String
  ending      String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- `ideaId` is nullable but unique — enforces at most one script per idea. A script can also
  exist with no idea (manually-entered topic).
- `mainContent` is a single text field containing the main content points with B-roll
  suggestions embedded as formatted text (e.g. `- Point: ... [B-ROLL: ...]`) rather than a
  separate structured/JSON sub-model — matches the plan's chosen section granularity (5
  sections, not sub-point-level editing).
- `tone` is fixed at generation time for the whole script (chosen once, before the first
  generation); regenerating an individual section reuses the script's existing `tone`, it is
  not re-selected per section.
- `updatedAt` auto-updates on every manual edit or section regeneration.
- `Project` gains a `scripts Script[]` relation; `Idea` gains an optional `script Script?`
  back-relation (1:1, since `ideaId` is unique on `Script`).

## Architecture

### Prompt building & parsing (`src/server/scripts.ts`, mirroring `src/server/ideas.ts`)

- `buildScriptPrompt(input: { topic: string; tone: ScriptTone })`: requests all 5 sections
  from Claude as a single structured JSON response in one call (`{hook, intro, mainContent,
  cta, ending}`), including tone-specific instructions per the four tone values.
- `parseScriptResponse(raw: string)`: extracts and validates the JSON object, mirroring
  `parseIdeasResponse`'s markdown-fence-stripping and try/catch-wrapped `JSON.parse` pattern
  (a fix already applied to that function during Phase 2 review — this new parser is written
  with that same protection from the start, not retrofitted after the fact).
- `buildSectionRegeneratePrompt(input: { topic: string; tone: ScriptTone; section: string;
  currentSectionText: string })`: a separate, single-section prompt used only by the
  regenerate endpoint — asks Claude to rewrite just that one section, given the script's
  topic/tone and (for context) its current text, returning plain text rather than JSON.

### `createScriptForIdeaOrTopic` (initial generation)

1. If `ideaId` is provided: look up any existing `Script` for it — if found, return it
   as-is (no regeneration), so re-visiting Script Writer for an idea that already has a
   script never silently overwrites it or wastes a Claude call. The UI is expected to load
   this existing script rather than re-show the generation form in that case (see UI section).
2. Otherwise (or if no existing script found): call `buildScriptPrompt` +
   `getLlmClient().generateText(...)` + `parseScriptResponse`, then `prisma.script.create(...)`.

### `regenerateScriptSection`

Takes `(scriptId, section)`, loads the existing script, calls
`buildSectionRegeneratePrompt` with that script's `topic`/`tone`/current section text, gets
Claude's rewritten text for just that section, and updates only that one column via
`prisma.script.update`.

## API Routes

All four routes follow the established ownership-check pattern (`project.userId ===
session.user.id`, or via the script's project for the two ID-scoped routes) and the
try/catch-wrapped-Claude-call → 502-on-failure pattern fixed into `/api/ideas` and
`/api/thumbnails` during their respective reviews.

- **`POST /api/scripts`** — body `{projectId, ideaId?, topic, tone}`. Ownership-checks the
  project (and the idea, if provided, the same lenient way `/api/thumbnails` resolves an
  optional `ideaId` — silently proceed without it if it doesn't resolve). Delegates to
  `createScriptForIdeaOrTopic`. Returns `{script}`, 201 on new creation or 200 if an existing
  script for that idea was returned instead.
- **`GET /api/scripts?projectId=...`** — ownership-checked, returns `{scripts}` for the
  project, most recent first.
- **`PATCH /api/scripts/:id`** — body `{section, content}` where `section` is one of
  `hook|intro|mainContent|cta|ending`. Ownership-checked via the script's project. Updates
  just that column, returns the updated `{script}`.
- **`POST /api/scripts/:id/regenerate`** — body `{section}`. Ownership-checked the same way.
  Delegates to `regenerateScriptSection`, wrapped in try/catch → 502 on failure. Returns the
  updated `{script}`.

## UI / UX

- `/script-writer` page: a topic input (pre-filled from the selected idea's title/hook when
  `useWorkflowStore.selectedIdeaId` is set, same pattern as Thumbnail Studio's prompt
  pre-fill), a 4-option tone selector, and a "Generate Script" button.
- On page load: if `selectedIdeaId` is set and that idea already has a script (`GET
  /api/scripts?projectId=...` includes it), load and display that script directly instead of
  the empty generation form — the user lands on their existing script, not a fresh
  "Generate" prompt they'd have to skip past.
- Once a script exists: five section cards (Hook, Intro, Main Content, CTA, Ending), each
  with an editable `textarea` (autosaves via `PATCH` on blur, no separate "Save" button) and
  a small "Regenerate" button that calls `POST /api/scripts/:id/regenerate` for just that
  section and replaces its text in place.
- Consistent with Idea Finder/Thumbnail Studio: a visible error message on any failed
  generate/regenerate call (not silent), matching the UX-gap fixes already applied to those
  pages during their reviews.

## Testing

- Unit tests: `buildScriptPrompt`, `parseScriptResponse` (including the malformed-JSON and
  markdown-fence cases), `buildSectionRegeneratePrompt`.
- Integration test: `createScriptForIdeaOrTopic` against a real DB with `lib/llm` mocked at
  its module boundary — covering both the "no idea, fresh generation" path and the "idea
  already has a script, return existing" path.
- No E2E tests, consistent with prior phases.

## Explicitly Out of Scope

- SEO Titles, Keyword Research, Description & Tags (separate future sub-phase specs).
- Per-sub-point (rather than per-section) editing of Main Content.
- Changing tone after initial generation (would require a full regeneration of all 5
  sections, which is out of scope — the user can always start a new script by deleting the
  existing one, but no "delete script" UI is included in this phase).
