# ArwaTube AI Engine — Target Language Wiring — Design

## Context

`ProjectSettings.targetLanguage` has existed since Phase 1 (`prisma/schema.prisma`), and the
Settings page (`src/app/(app)/settings/page.tsx`) already lets a creator pick English, French, or
Arabic for their project. Nothing consumes it: a grep across every generation module
(`src/server/ideas.ts`, `scripts.ts`, `titles.ts`, `descriptionTags.ts`, `thumbnails.ts`,
`platformVariants.ts`) confirms `targetLanguage` never reaches a single prompt. Every module always
generates in English regardless of the project's setting.

A just-shipped small fix to `buildThumbnailBriefPrompt` (in `src/server/thumbnails.ts`) instructs
Claude to write the on-thumbnail text "in the same language as the topic" — an inference-based
workaround. This document replaces that inference with the explicit, already-stored
`targetLanguage` setting, and extends the same idea to every other generation module.

## Scope

- A new `resolveLanguageName(code: string | null | undefined): string` helper in
  `src/lib/language.ts`, mapping `"en"→"English"`, `"fr"→"French"`, `"ar"→"Arabic"`, defaulting to
  `"English"` for `null`, `undefined`, or any unrecognized code (covers every existing project that
  never touched the setting, and any future value drift without throwing).
- Every generation and regeneration route fetches `project.settings.targetLanguage` (adding
  `include: { settings: true }` where a route doesn't already do so for the YouTube API key) and
  resolves it via `resolveLanguageName`, passing the resolved language name into that module's
  orchestration function.
- Every orchestration function's signature gains a `targetLanguage: string` parameter (the already
  *resolved* full name, e.g. `"French"` — resolution happens once at the route layer, not
  repeated in every prompt builder), threaded into that module's prompt-building function(s).
- Every prompt builder appends a language instruction covering its entire generated output:
  `Ideas`, `Script Writer`, `SEO Titles`, `Description & Tags`, `Multi-Platform Shorts` — the whole
  response (titles, keywords, script sections, description, tags, hashtags, hooks, captions) must
  be written in the resolved language.
- **Thumbnail Studio exception:** the language instruction applies **only** to the brief's
  `thumbnailText` field. The other creative-brief fields (`niche`, `story`, `person`, `emotion`,
  `before`, `after`, `object`, `background`, `color`, `compositionPattern`) stay instructed in
  English, since they feed the photorealistic image-generation prompt sent to Higgsfield, not
  visible page text — English scene descriptions get the most reliable image-model comprehension
  regardless of the project's content language. This replaces the just-shipped
  "match the topic's language" instruction (an unreliable inference) with the explicit,
  already-stored setting.
- Regeneration functions re-resolve `targetLanguage` the same way as initial generation (fetched
  fresh from the row's project settings at regenerate-time, not cached from the original
  generation), so a language changed in Settings after initial generation is honored on the next
  regenerate.

Out of scope: translating the app's own UI chrome (sidebar, buttons, page headings, error
messages) — those stay English per the earlier scoping decision. Adding new languages beyond
en/fr/ar. RTL layout. A UI indicator showing which language a piece of content was generated in.
Retroactively translating already-generated content sitting in the database.

## Architecture

### `src/lib/language.ts` (new)

```ts
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  ar: "Arabic",
};

export function resolveLanguageName(code: string | null | undefined): string {
  if (!code) return "English";
  return LANGUAGE_NAMES[code] ?? "English";
}
```

Pure, dependency-free, trivially unit-testable — no changes needed elsewhere if a 4th language is
ever added (just extend the map).

### Per-module changes (six modules, same shape)

For **Ideas**, **Script Writer**, **SEO Titles**, **Description & Tags**, **Multi-Platform
Shorts**:
1. That module's `POST` route (and `regenerate` route, where one exists) fetches
   `project.settings` (adding `include: { settings: true }` if not already present) and computes
   `const targetLanguage = resolveLanguageName(project.settings?.targetLanguage);` (or, for
   regenerate routes that only have the child row today, add
   `include: { project: { include: { settings: true } } }` to that row's `findFirst` and resolve
   from `row.project.settings?.targetLanguage`).
2. The route passes `targetLanguage` as a new final argument into that module's
   `create*ForIdeaOrTopic(...)` / `regenerate*(...)` orchestration function.
3. The orchestration function passes it straight into its prompt-building function(s).
4. Each prompt-building function appends one line near the end of its instructions:
   `Write your entire response in ${targetLanguage}.` (exact wording may vary slightly per module
   to fit that module's existing prompt voice, but the substance — "everything in
   `${targetLanguage}`" — is identical).

For **Thumbnail Studio** specifically:
1. `POST /api/thumbnails` fetches `project.settings` (currently doesn't) and resolves
   `targetLanguage` the same way.
2. `createThumbnailsForProject` gains a `targetLanguage: string` parameter, passed through to
   `buildThumbnailBriefPrompt` (both the initial-generation call and, inside
   `regeneratePlatformVariant`-style regeneration if Thumbnail Studio has one — it currently does
   not support per-thumbnail regeneration, only fresh generation, so no regenerate-route change is
   needed here).
3. `buildThumbnailBriefPrompt`'s instruction changes from (current) "write \[thumbnailText\] in
   the same language as the TOPIC below" to "write \[thumbnailText\] in ${targetLanguage}" — the
   rest of the brief-generation instructions (which drive the English-language image-generation
   scene description) are unchanged.

### Signature changes (exact, for plan precision)

- `createIdeasForProject(projectId, youtubeApiKey, input, targetLanguage)` gains a trailing
  `targetLanguage: string` parameter (Ideas has no separate regenerate function — regeneration is
  just calling the same create function again from the Idea Finder UI).
- `createScriptForIdeaOrTopic(projectId, ideaId, topic, tone, targetLanguage)` and
  `regenerateScriptSection(scriptId, section, targetLanguage)`.
- `createTitleSetForIdeaOrTopic(projectId, ideaId, youtubeApiKey, topic, targetLanguage)` and
  `regenerateTitleSet(titleSetId, youtubeApiKey, targetLanguage)`.
- `createDescriptionTagSetForIdeaOrTopic(projectId, ideaId, topic, targetLanguage)` and
  `regenerateDescriptionTagSet(descriptionTagSetId, targetLanguage)`.
- `createPlatformVariantsForIdeaOrTopic(projectId, ideaId, topic, targetLanguage)` and
  `regeneratePlatformVariant(variantId, targetLanguage)`.
- `createThumbnailsForProject(projectId, ideaId, input, targetLanguage)`.

(Exact parameter names/order are finalized in the implementation plan against each file's current
real signature — the point captured here is that every create/regenerate function gains exactly
one new trailing `targetLanguage: string` parameter, no other signature changes.)

## Testing

- `src/lib/language.ts` gets a new `tests/unit/language.test.ts`: resolves each of the 3 known
  codes to their correct name, defaults to `"English"` for `null`, `undefined`, and an unrecognized
  string.
- Each module's existing prompt-builder unit tests gain one new case: the prompt contains the
  language instruction when a non-English `targetLanguage` is passed (e.g. `"French"` →
  `expect(prompt).toContain("French")`), and existing tests that don't pass `targetLanguage`
  explicitly are updated to pass `"English"` (the resolved default) so their assertions keep
  passing unchanged.
- Each module's existing integration test gains one new assertion: the resolved language reaches
  the mocked LLM call's prompt argument for a non-default language.
- Standing rule carried over: only named `vitest run <file>` invocations, never bare `npm test`.

## Explicitly Out of Scope

- UI chrome translation, RTL layout, a language switcher — per the earlier scoping decision, only
  AI-generated content changes language; the app's own interface stays English.
- Adding a 4th+ language.
- Translating content already sitting in the database from before this change.
- Any change to how `targetLanguage` itself is set/stored (the Settings page and
  `ProjectSettings.targetLanguage` column already work correctly — this only wires up the
  consuming side).
