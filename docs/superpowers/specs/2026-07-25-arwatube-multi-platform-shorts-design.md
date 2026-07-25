# ArwaTube AI Engine — Multi-Platform Repurposing Engine — Design

## Context

Phases completed and merged to `main`: Phase 1 (Foundation), Phase 2 (Idea Finder), Phase 3a
(Thumbnail Studio & Higgsfield Integration), Script Writer, SEO Titles & Keyword Research,
Description & Tags — completing the Long-Form Suite. This document covers the **Multi-Platform
Repurposing Engine**, Phase 4 per the original roadmap
(`docs/superpowers/specs/2026-07-23-vifatube-phase1-foundation-design.md`): "adapts a long-form
concept/script into platform-specific short-form assets for YouTube Shorts, TikTok, Instagram
Reels, and Facebook Reels," including Anti-Duplication/Anti-Shadowban logic so each platform gets
a distinct hook (first 5 seconds) and tone.

The app already has a `/multi-platform-shorts` placeholder page and sidebar entry.

## Scope

- A `PlatformVariant` Prisma model: one row per platform per idea/topic (four rows per
  generation batch — TikTok, YouTube Shorts, Instagram Reels, Facebook Reels), enforced via a
  compound unique `(ideaId, platform)`.
- `POST /api/platform-variants` — generates all 4 platform variants (hook, caption, hashtags,
  plus a cover image for Instagram Reels) in a single Claude call, informed by the linked idea's
  existing `Script` (hook/mainContent), `TitleSet` (selected title), and `DescriptionTagSet`
  (hashtags) when available.
- `GET /api/platform-variants?projectId=...` — list all variants for a project.
- `PATCH /api/platform-variants/:id` — save a manual edit to one field (`hook`, `caption`, or
  `hashtags`) on one platform's row.
- `POST /api/platform-variants/:id/regenerate` — regenerate a single platform's variant in place
  (independent per-platform regeneration, unlike SEO Titles'/Description & Tags' whole-batch-only
  regeneration, since each platform's content is independent rather than one cohesive artifact).
- `/multi-platform-shorts` page (replacing its Phase 1 placeholder): topic input (pre-filled from
  the selected idea via the established URL-param/store handoff pattern), a "Generate Shorts"
  button, then four independent platform cards once variants exist.

Out of scope: Content Matrix Exporter and One-Click Publish (separate later phases), generating a
full restructured short-form script body (hook + caption + hashtags only — a full script is
Script Writer's job, not this phase's), actual video/audio generation for the shorts themselves.

## Data Model

```prisma
enum RepurposePlatform {
  TIKTOK
  YOUTUBE_SHORTS
  INSTAGRAM_REELS
  FACEBOOK_REELS
}

model PlatformVariant {
  id        String            @id @default(cuid())
  projectId String
  project   Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  ideaId    String?
  idea      Idea?             @relation(fields: [ideaId], references: [id], onDelete: SetNull)
  platform  RepurposePlatform

  topic            String
  hook             String
  caption          String
  hashtags         String[]
  coverImagePrompt String?
  coverImageUrl    String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([ideaId, platform])
}
```

- Unlike `TitleSet`/`DescriptionTagSet` (one row per idea, 1:1), this is **one row per platform
  per idea** — up to 4 rows share the same `ideaId`. The compound unique `(ideaId, platform)`
  enforces at most one variant per platform per idea while allowing all 4 platforms to coexist.
  Postgres treats each `NULL` in a unique constraint as distinct, so topic-only (no linked idea)
  generations can accumulate multiple rows per platform over time without a uniqueness conflict —
  the same characteristic `TitleSet`/`DescriptionTagSet` already have for their single nullable
  unique `ideaId`.
- `coverImagePrompt` and `coverImageUrl` are populated only for the `INSTAGRAM_REELS` row; `null`
  for the other three platforms.
- `topic` is stored per-row (not just derived from a linked idea), same reasoning as
  `Script.topic`/`TitleSet.topic`: a set can exist with no linked `Idea`, and regeneration needs
  the original topic as context.
- `Project` gains `platformVariants PlatformVariant[]`. `Idea` gains `platformVariants
  PlatformVariant[]` — plural, unlike the singular optional 1:1 relations on `Script`/`TitleSet`/
  `DescriptionTagSet`, since one idea now has up to 4 of these rows.

## Architecture

### Prompt building & parsing (`src/server/platformVariants.ts`)

- `buildPlatformVariantsPrompt(input: {topic, scriptHook?, scriptMainContent?, selectedTitle?, hashtags?})`:
  requests all 4 platform variants from Claude in a **single call**, as one structured JSON
  response. Generating all 4 together (rather than 4 independent calls) lets the model see all 4
  simultaneously and genuinely satisfy the anti-duplication requirement — four independent calls
  risk converging on similar phrasing since each has no visibility into what the others produced.
  The prompt embeds the exact anti-shadowban mapping from the spec: TikTok gets a pattern-interrupt
  hook ("Stop doing X", "Nobody is talking about this..."); YouTube Shorts gets a value-proposition
  hook with search keyword integration; Instagram Reels gets a visually-descriptive/curiosity-driven
  hook; Facebook Reels gets a question-based/relatable-scenario hook. For each platform, the prompt
  requests `{hook, caption, hashtags}`; for Instagram Reels only, it additionally requests
  `coverImagePrompt` (a text-to-image prompt for a still cover frame). When `scriptHook`/
  `scriptMainContent`/`selectedTitle`/`hashtags` are provided, they're appended as context the same
  way `buildDescriptionTagsPrompt` appends `selectedTitle`/`keywords` — omitted when absent.
- `parsePlatformVariantsResponse(raw)`: extracts and validates the JSON object (same
  markdown-fence-stripping + try/catch `JSON.parse` pattern as every prior parser). Validates all 4
  platform keys (`tiktok`, `youtubeShorts`, `instagramReels`, `facebookReels`) are present, each
  with non-empty `hook`/`caption` strings and a `hashtags` string array, and that
  `instagramReels.coverImagePrompt` is specifically a non-empty string (the other 3 platforms have
  no such field and none is expected).
- `buildSinglePlatformVariantPrompt(platform: RepurposePlatform, input)` /
  `parseSinglePlatformVariantResponse(raw, platform)`: the per-platform-regenerate equivalents,
  requesting/parsing just `{hook, caption, hashtags}` (plus `coverImagePrompt` only when
  `platform === "INSTAGRAM_REELS"`) for the one given platform, still instructing that platform's
  specific hook/tone style from the same mapping.
- `fetchWorkflowContext(ideaId: string | null)`: returns `{scriptHook, scriptMainContent,
  selectedTitle, hashtags}`, each `null` if `ideaId` is `null` or the corresponding sibling record
  (`Script`, `TitleSet`, `DescriptionTagSet`) doesn't exist for that idea.

### `createPlatformVariantsForIdeaOrTopic` (initial generation)

1. If `ideaId` is provided: check for any existing `PlatformVariant` rows for it
   (`prisma.platformVariant.findMany({where: {ideaId}})`). If any exist, return them as-is
   (`created: false`) — the four rows are always created together, so any existing row implies the
   full set exists; never regenerate implicitly.
2. Otherwise: call `fetchWorkflowContext(ideaId)`, build the combined-4-platform prompt via
   `buildPlatformVariantsPrompt`, call `getLlmClient().generateText(...)`, parse via
   `parsePlatformVariantsResponse`. Call `generateImage(coverImagePrompt)` (from `lib/higgsfield`,
   the same function Thumbnail Studio already uses) to produce the Instagram cover image URL. Then
   create all 4 rows in a single `prisma.$transaction`. Returns `{platformVariants: [...4 rows],
   created: true}`.

### `regeneratePlatformVariant` (per-platform regeneration)

Takes `(variantId)`, loads the existing row via `findUniqueOrThrow`, re-pulls workflow context via
the row's stored `ideaId`, regenerates just that platform via `buildSinglePlatformVariantPrompt` +
`parseSinglePlatformVariantResponse`, regenerates the cover image too (via `generateImage`) if
`platform === "INSTAGRAM_REELS"`, and updates only that one row's `hook`/`caption`/`hashtags`
(+`coverImagePrompt`/`coverImageUrl` for Instagram).

## API Routes

All routes follow the established ownership-check pattern (`project.userId ===
session.user.id`, or via the variant's project for the two ID-scoped routes) and the
try/catch-wrapped-Claude-call → 502-on-failure pattern used by every prior generation route.

- **`POST /api/platform-variants`** — body `{projectId, ideaId?, topic}`. Ownership-checks the
  project and leniently resolves `ideaId` (same silent-fallback pattern as `/api/titles` and
  `/api/description-tags`). Delegates to `createPlatformVariantsForIdeaOrTopic`. Returns
  `{platformVariants}`, 201 on new creation or 200 if an existing set was returned instead.
- **`GET /api/platform-variants?projectId=...`** — ownership-checked, returns
  `{platformVariants}` for the project, most recent first (client groups by `ideaId`/`topic` to
  reconstruct the 4-card batches).
- **`PATCH /api/platform-variants/:id`** — body `{field, value}` where `field` is one of
  `hook|caption|hashtags`. `value` must be a non-empty `string` for `hook`/`caption`, or a
  `string[]` for `hashtags` (400 on type mismatch). `coverImagePrompt`/`coverImageUrl` are not
  editable through this route — only through regeneration. Ownership-checked via the variant's
  project (404 if not found). Updates just that column, returns `{platformVariant}`.
- **`POST /api/platform-variants/:id/regenerate`** — no body needed. Ownership-checked (404)
  **before** the try/catch wrapping the actual regeneration call, same ordering fix carried over
  from every prior regenerate route. Delegates to `regeneratePlatformVariant`, wrapped in
  try/catch → 502 on failure. Returns `{platformVariant}`.

## UI / UX

- `/multi-platform-shorts` page: a topic input (pre-filled from the selected idea via `?ideaId=`
  URL param / `useWorkflowStore.selectedIdeaId` fallback, same pattern as every prior module), and
  a "Generate Shorts" button.
- On page load: if the selected idea already has variants (`GET
  /api/platform-variants?projectId=...` includes rows for that `ideaId`), load and display them
  directly instead of the empty generation form.
- Once variants exist: four independent cards in a fixed order (TikTok, YouTube Shorts, Instagram
  Reels, Facebook Reels). **Each card's data is held as its own separate object in local React
  state** (an array of 4 independently-managed row objects, not one shared parent object) — this
  is a deliberate structural choice to avoid the "unrelated field save clobbers in-progress edits
  elsewhere" bug class found during Description & Tags' review, where a single shared `set` object
  meant any field's save response could stomp another field's local draft. Here, saving/regenerating
  one platform's card only ever touches that one row's own local state.
- Each card shows: platform label/heading, a `hook` textarea (autosaves via `PATCH` on blur, same
  pattern as Description & Tags), a `caption` textarea (autosaves via `PATCH` on blur), hashtags via
  the existing `EditableChipList` component (reused as-is from Description & Tags — no new
  component needed), and a per-card "Regenerate" button that calls that row's
  `POST /api/platform-variants/:id/regenerate` and replaces only that card's fields in place. The
  Instagram Reels card additionally displays the generated cover image (`coverImageUrl`) inline,
  read-only (regenerated only via that card's Regenerate button, never manually edited).
- Consistent with every prior module: a visible error message on any failed generate/regenerate/
  save call (not silent), scoped to the specific card where the failure occurred.

## Testing

- Unit tests: `buildPlatformVariantsPrompt` (includes topic; includes script/title/hashtag context
  when provided; omits it when absent; embeds the anti-duplication mapping instructions),
  `parsePlatformVariantsResponse` (valid JSON, markdown-fenced, no-JSON-throws, missing-platform-key
  throws, missing-instagram-coverImagePrompt-throws, wrong-type-for-hashtags-throws,
  malformed-JSON-throws), `buildSinglePlatformVariantPrompt`/`parseSinglePlatformVariantResponse`
  (same category of cases, scoped to one platform, including the Instagram-only
  `coverImagePrompt` requirement).
- Integration test: `createPlatformVariantsForIdeaOrTopic` against a real DB with `lib/llm` and
  `lib/higgsfield` mocked at their module boundaries — covering: "no idea, fresh generation creates
  4 rows" path, "idea already has variants, return existing without regenerating" path, and "idea
  has a Script/TitleSet/DescriptionTagSet, their content reaches the prompt sent to the mocked LLM
  client" path.
- No E2E tests, consistent with prior phases.
- **Standing safety rule carried over from every prior phase:** never run the bare `npm test` or
  an unscoped `vitest run` against a live/shared `DATABASE_URL` — only specifically-named test
  files. A DB-connectivity failure on the integration test (when no `.env`/`DATABASE_URL` is
  present in the implementation worktree) is an accepted, expected outcome, not a defect.

## Explicitly Out of Scope

- Content Matrix Exporter and One-Click Publish — separate, later phases per the original roadmap.
- A full restructured short-form script body — this phase generates a hook, caption, and hashtags
  per platform, not a complete re-paced script (that remains Script Writer's responsibility).
- Actual video or audio generation for the shorts themselves — this phase produces text assets (and
  a still cover image for Instagram only), not video content.
- Manual editing of `coverImagePrompt`/`coverImageUrl` — these are only produced/replaced via
  regeneration, never hand-edited through the PATCH route.
- Cover images for platforms other than Instagram Reels — the spec only calls for a cover image
  prompt on Instagram Reels; TikTok/YouTube Shorts/Facebook Reels have no image field.
