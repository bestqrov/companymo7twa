# ArwaTube AI Engine — Thumbnail Studio Rework — Design

## Context

Thumbnail Studio shipped in Phase 3a with a "clean cutout subject on a gradient
background, no text baked in, headline composited afterward" template
(`src/server/thumbnails.ts`). In manual local testing, this produced two real
problems:

1. **Bug:** `createThumbnailsForProject`'s A/B-test loop calls
   `generateImage(buildThumbnailImagePrompt(input.prompt))` with the **exact
   same prompt on every iteration** — no per-variant variation at all. The 4
   "variants" are just repeated samples of one prompt, and Higgsfield's model
   converges on near-identical images (same face, same pose, only the
   background gradient shifts slightly). The CTR estimate is also identical
   across all 4, for the same reason (`buildCtrFallbackPrompt` receives the
   same shared `input.prompt` every time too).
2. **Style mismatch:** the cutout-on-gradient template looks noticeably worse
   than the high-CTR templates real creators use — phone/bank-balance
   mockups, big bold dollar figures, arrows, before/after panels, cinematic
   photorealistic lighting.

This document covers a rework of the generation pipeline to fix both,
replacing the template-string approach with a two-step, Claude-directed
pipeline using a system prompt the user supplied (a "world's best YouTube
Thumbnail Designer" brief with dynamic slots), applied generally to any
topic/idea — not niche-specific — with genuine per-variant variation across
the 4 A/B slots.

## Scope

- Replace `buildThumbnailImagePrompt` (a static string template) with a
  **two-step Claude-directed pipeline**, run once per variant:
  1. `buildThumbnailBriefPrompt` — sends Claude the full "world's best YouTube
     Thumbnail Designer" system instructions (verbatim from the user's
     template: one clear subject, extreme expression, high contrast,
     cinematic lighting, before/after, money/charts/arrows when relevant,
     clean background, photorealistic, 8K, MrBeast/Hormozi-caliber, etc.),
     the topic, any available idea/script/title context, and a per-variant
     "variation seed" instruction so each of the 4 calls yields a genuinely
     different creative angle. Claude returns a structured JSON "creative
     brief": `{niche, story, person, emotion, before, after, object,
     background, color, thumbnailText, negativePrompt}`.
  2. `buildThumbnailImagePromptFromBrief` — a deterministic template function
     that assembles the brief into the final ready-to-send image-generation
     prompt, in the same format/wording style as the user's "Final Prompt
     Generated" example (photorealistic DSLR framing, bold typography line
     using `thumbnailText`, MrBeast/Hormozi-style framing, 16:9, ending with
     a "Negative prompt: ..." line built from `negativePrompt`).
- The assembled prompt is sent directly to `generateImage` (`lib/higgsfield`).
  Per explicit user decision, the headline text is baked directly into the AI
  image via the prompt's "Bold typography" instruction — not composited
  afterward.
- **Removed:** `buildThumbnailImagePrompt` (old static template),
  `buildHeadlinePrompt`/`deriveThumbnailHeadline` (the separate
  idea-title-or-Claude headline step — folded into the one brief call's
  `thumbnailText` field now), `compositeHeadlineOntoImage` (the sharp/SVG
  text-overlay step — redundant now that text is baked into the AI image),
  and the `sharp` dependency's use in this file (confirmed unused elsewhere
  in the codebase).
- `createThumbnailsForProject`'s per-variant CTR fallback
  (`buildCtrFallbackPrompt`) now receives that variant's actual assembled
  image prompt (not the shared raw `input.prompt`), so CTR estimates
  genuinely differ per variant instead of all reading identical.
- `Thumbnail.imageUrl` now stores the Higgsfield-hosted URL directly (no
  more base64 data-URI from compositing) — the page/API already treat
  `imageUrl` as an opaque string passed to an `<img src>`, so this is a
  transparent, safe simplification requiring no other file changes.

Out of scope: any change to the `Thumbnail` Prisma model (no new columns —
the brief's fields are ephemeral, used only to build one prompt string, not
persisted), any change to `/api/thumbnails` request/response shape, any
change to the `single` vs `abtest` mode distinction (still 1 vs 4 variants,
generated one-at-a-time so a mid-batch failure doesn't lose earlier variants),
video generation, or the CTR-predictor-then-fallback structure itself.

## Architecture

### `ThumbnailCreativeBrief` (new type, `src/server/thumbnails.ts`)

```ts
interface ThumbnailCreativeBrief {
  niche: string;
  story: string;
  person: string;
  emotion: string;
  before: string;
  after: string;
  object: string;
  background: string;
  color: string;
  thumbnailText: string;
  negativePrompt: string;
}
```

### `buildThumbnailBriefPrompt(input)`

`input: {topic: string; variationHint: string; ideaTitle?: string | null;
scriptHook?: string | null; selectedTitle?: string | null}`.

Sends Claude the fixed "world's best YouTube Thumbnail Designer" instructions
(verbatim principles list from the user's template — one subject, extreme
expression, high contrast, cinematic lighting, rich colors, simple
composition, before/after whenever possible, money/charts/arrows/glowing
objects if relevant, clean background, no clutter/watermark/logo,
photorealistic, DSLR/8K/HDR quality language, "better than MrBeast/Hormozi/
Gadzhi/Abdaal/finance and business YouTubers", never illustrations, 16:9),
the topic, optional context (idea title / script hook / already-selected SEO
title, appended the same way every other module appends optional context —
omitted when absent), and `variationHint` (a short per-variant instruction
like "Emphasize a dramatic before/after money transformation" vs "Emphasize a
shocking single-moment reaction with a bold prop" — see Variation below).
Requests a JSON object with exactly the 11 `ThumbnailCreativeBrief` fields.

### `parseThumbnailBriefResponse(raw)`

Validates and returns a `ThumbnailCreativeBrief` — all 11 fields required as
non-empty strings, same markdown-fence-stripping + try/catch JSON.parse
pattern as every other parser in this codebase. Throws with a specific
message naming the missing/invalid field.

### `buildThumbnailImagePromptFromBrief(brief)`

Deterministically assembles the final prompt string from the brief, matching
the user's "Final Prompt Generated" example's structure and vocabulary:
opens with "Create an ultra high CTR YouTube thumbnail", weaves in
`person`/`emotion`/`story`/`before`/`after`/`object`/`background`/`color`,
closes with the fixed photorealistic/DSLR/lighting/quality boilerplate, a
"Bold typography: \"{thumbnailText}\"" line, "MrBeast style. Alex Hormozi
style. Designed for maximum YouTube CTR. 16:9", and a final
"Negative prompt: {negativePrompt}" line. This is a pure string-template
function (no LLM call) — the creative reasoning already happened in the
brief step, keeping this function trivially testable.

### Per-variant variation

A fixed list of `VARIATION_HINTS` (4 distinct short instructions covering
different emotional/visual angles — e.g. dramatic before/after money
transformation, single-shock-moment reaction, curiosity/mystery framing,
comparison/versus framing) is cycled by variant index
(`VARIATION_HINTS[i % VARIATION_HINTS.length]`) so a 4-variant A/B batch
always spans 4 genuinely different creative directions, and a `single`-mode
generation (1 variant) always gets the first hint. This directly fixes the
observed bug (identical prompt every iteration) without depending on model
randomness alone to produce variety.

### `createThumbnailsForProject` (rewritten body, same signature)

For each variant index `i` in `0..variantCount-1`:
1. Fetch idea/script/title context once per call (idea title if `ideaId`
   given; that idea's `Script.hook` and `TitleSet.selectedTitle` if present —
   same `fetchWorkflowContext`-style optional lookups used in
   `platformVariants.ts`, kept local to this file since Thumbnail Studio has
   no other consumer for it).
2. Call `getLlmClient().generateText(buildThumbnailBriefPrompt({topic:
   input.prompt, variationHint: VARIATION_HINTS[i % 4], ...context}))`, parse
   via `parseThumbnailBriefResponse`.
3. Build the final prompt via `buildThumbnailImagePromptFromBrief(brief)`.
4. Call `generateImage(finalPrompt)` — store the returned URL directly as
   `imageUrl` (no compositing step).
5. Estimate CTR via the existing `estimateCtrWithFallback(url, finalPrompt)`
   — now receives the per-variant assembled prompt instead of the shared raw
   topic, so the LLM-fallback CTR estimate varies per variant too.
6. Persist the `Thumbnail` row (same fields as today, `imageUrl` now always a
   direct Higgsfield URL).

The one-at-a-time loop (not `Promise.all`) is preserved — if a later variant
in a 4-variant batch fails (brief generation, image generation, or CTR
estimation), earlynr generated variants are already persisted, matching the
existing "don't lose already-paid-for work" reasoning.

## Testing

- Unit tests (rewriting `tests/unit/thumbnails.test.ts`'s prompt-related
  `describe` blocks, keeping `determineCtrSource`/`buildCtrFallbackPrompt`/
  `parseCtrFallbackResponse` tests as-is since those functions are
  unchanged):
  - `buildThumbnailBriefPrompt`: includes the topic; includes the fixed
    designer-principles boilerplate (spot-check a few distinctive phrases —
    "before vs after", "photorealistic", "MrBeast"); includes the given
    `variationHint`; includes optional idea/script/title context when
    provided, omits it when absent.
  - `parseThumbnailBriefResponse`: valid JSON parses to the 11-field object;
    markdown-fenced JSON parses; throws on missing JSON, malformed JSON, and
    each of the 11 fields missing/empty/wrong-type (table-driven, not 11
    separate near-duplicate tests — a loop over field names).
  - `buildThumbnailImagePromptFromBrief`: given a fixed sample brief, asserts
    the assembled string contains every brief field's value, the "Bold
    typography" line with the exact `thumbnailText`, and a trailing
    "Negative prompt:" line with the exact `negativePrompt`.
  - Remove the now-defunct `buildThumbnailImagePrompt`, `buildHeadlinePrompt`,
    and `compositeHeadlineOntoImage` describe blocks (and the `sharp` import
    used only by the removed compositing test).
- Integration test: `tests/integration/thumbnails.test.ts` already exists and
  covers `createThumbnailsForProject`, but its `generateText` mock returns one
  hardcoded `{ctrEstimate: 6}` response for every call. Under the new
  pipeline, `generateText` is called **twice per variant** — once for the
  creative brief, once for the CTR fallback — so the mock must branch on the
  prompt content (e.g. check whether the prompt text contains the literal
  `"ctrEstimate"` instruction that only `buildCtrFallbackPrompt` produces) and
  return a valid 11-field brief JSON for the first call, `{ctrEstimate: N}`
  for the second. This also means the existing "neutral fallback CTR when
  estimation throws" test must make its mock throw **only on the
  ctrEstimate-shaped call**, not the brief call, or brief generation itself
  fails first with an unrelated error. Add a new assertion that a 4-variant
  `abtest` batch sends 4 *different* assembled image prompts to the mocked
  `generateImage` (proving the variation-hint fix works, not just that the
  code runs), and that `single` mode persists exactly 1 row.
- Standing rule carried over: only named `vitest run <file>` invocations,
  never bare `npm test`.

## Explicitly Out of Scope

- Any Prisma schema change — the creative brief is ephemeral per-generation
  data, not persisted as its own row/column.
- Falling back to composited text if the AI-baked text comes out garbled —
  per explicit user decision, text is baked in via the prompt with no safety
  net; a future phase could revisit this if garbled text becomes a recurring
  problem in practice.
- Letting users edit/regenerate the intermediate creative brief directly —
  regeneration (already existing elsewhere in the app for other modules;
  Thumbnail Studio's existing UI only supports fresh generation, not
  per-thumbnail regeneration) is unaffected by this rework.
- Any change to `generateVideo` (still unimplemented, unrelated to this
  rework).
