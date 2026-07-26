# ArwaTube AI Engine — UI Localization (en/fr/ar + RTL) — Design

## Context

The app already has a per-project `targetLanguage` setting (`en`/`fr`/`ar`), wired in a prior
phase so every AI generation module produces content in that language. That phase deliberately
left the app's own UI chrome (sidebar, buttons, headings, placeholders) in English. This document
covers translating that UI chrome itself, so choosing a language in the topbar's Language Switcher
changes the whole app's interface — not just generated content — including full right-to-left
layout for Arabic.

A grep across the codebase found only 3 places using physical left/right Tailwind utilities
(`text-left` in `src/app/(app)/seo-titles/page.tsx`, `right-2` in
`src/components/thumbnails/ThumbnailCard.tsx`, `border-r` in `src/components/layout/Sidebar.tsx`).
Everything else is built with flexbox and symmetric spacing (`p-4`, `gap-2`, `space-y-1`), which
already mirrors automatically once `dir="rtl"` is set on `<html>` — so the RTL portion of this
work is small and targeted, not a wholesale layout rewrite.

## Scope

- A translation dictionary (`src/lib/i18n/translations.ts`) with nested keys per `en`/`fr`/`ar`,
  covering every static, user-facing string in the app: sidebar nav labels, topbar, all 13 pages'
  headings/subheadings/buttons/input placeholders/loading states, and shared components
  (`IdeaCard`, `ScriptSectionCard`, `ThumbnailCard`, `PlatformVariantCard`, `EditableChipList`,
  `PlaceholderPage`, `ProjectSwitcher`, `LanguageSwitcher`, `ThemeToggle`).
- A `useT()` hook (`src/lib/i18n/useTranslation.ts`) returning a `t(key)` lookup function, falling
  back to the English string for any key missing in the current locale (a partially-translated key
  never breaks the UI or throws).
- `useAppStore` gains a `locale` field (`"en" | "fr" | "ar"`, default `"en"`), set once when the
  active project's settings load and updated immediately when `LanguageSwitcher` changes it — so
  the whole UI re-renders in the new language instantly, without waiting on a second round-trip.
- A `LocaleEffects` component (mounted once in the app layout) sets `document.documentElement.lang`
  and `dir` (`"rtl"` for `ar`, `"ltr"` otherwise) whenever `locale` changes.
- The 3 identified physical-direction classes converted to Tailwind's logical-property
  equivalents (`text-left` → `text-start`, `right-2` → `end-2`, `border-r` → `border-e`), which
  respect `dir` automatically.
- Every page and the 8 shared components listed above have their hardcoded strings replaced with
  `t("...")` calls.

Out of scope: translating server-returned error message bodies (the JSON `{error: "..."}` strings
API routes return on failure) — those stay in English for now; only the *client-side* fallback
strings used when a fetch fails before reaching the server (e.g. network error) get translated.
Re-localizing is a larger, separate concern (would require threading locale into every API route)
and is flagged here as a deliberate boundary, not an oversight. Also out of scope: a 4th+ language,
per-user (as opposed to per-project) language preference, translating this design doc itself.

## Architecture

### `src/lib/i18n/translations.ts`

A single exported object keyed by locale, each locale a deeply nested object mirroring the app's
structure, e.g.:

```ts
export const translations = {
  en: {
    nav: { dashboard: "Dashboard", ideaFinder: "Idea Finder", /* ... */ },
    common: { generate: "Generate", regenerate: "Regenerate", loading: "Loading...", save: "Save" /* ... */ },
    dashboard: { title: "Analytics Dashboard", subtitle: "A live snapshot of everything ArwaTube AI has generated for this project." /* ... */ },
    ideaFinder: { /* ... */ },
    // one section per page/component
  },
  fr: { /* same shape, French values */ },
  ar: { /* same shape, Arabic values */ },
} as const;
```

Keys are chosen for readability (`ideaFinder.generateButton`, not `ideaFinder.btn1`) so a missing
translation is easy to spot and fix. `common.*` holds strings reused across multiple pages
(Generate/Regenerate/Save/Loading/etc.) to avoid duplicating the same 3 translations 10 times.

### `src/lib/i18n/useTranslation.ts`

```ts
export function useT() {
  const locale = useAppStore((state) => state.locale);
  return function t(key: string): string {
    const path = key.split(".");
    const fromLocale = path.reduce<unknown>((obj, segment) => (obj as Record<string, unknown>)?.[segment], translations[locale]);
    if (typeof fromLocale === "string") return fromLocale;
    const fromEnglish = path.reduce<unknown>((obj, segment) => (obj as Record<string, unknown>)?.[segment], translations.en);
    return typeof fromEnglish === "string" ? fromEnglish : key;
  };
}
```

Falls back to English, then to the raw key itself (so a totally mistyped key is visibly wrong in
the UI during development rather than silently blank).

### `useAppStore` changes

```ts
interface AppState {
  // ...existing fields...
  locale: "en" | "fr" | "ar";
  setLocale: (locale: "en" | "fr" | "ar") => void;
}
```

`setLocale` is a plain setter. `LanguageSwitcher` (already the only place that changes
`targetLanguage`) calls `setLocale` immediately alongside its existing `POST /api/settings` call —
optimistic update, no need to wait for the server round-trip since the change is virtually always
accepted. `StoreHydrator` (or `LanguageSwitcher`'s own existing settings-fetch effect) calls
`setLocale` once when the current project's `targetLanguage` first loads, so a returning visitor
sees the right language immediately rather than a flash of English.

### `LocaleEffects` component (new, mounted once in `src/app/(app)/layout.tsx`)

```tsx
"use client";
import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

export function LocaleEffects() {
  const locale = useAppStore((state) => state.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  return null;
}
```

### RTL-specific class conversions (the only 3 needed)

- `src/app/(app)/seo-titles/page.tsx`: the title-selection buttons' `text-left` → `text-start`.
- `src/components/thumbnails/ThumbnailCard.tsx`: the CTR badge's `right-2` → `end-2`.
- `src/components/layout/Sidebar.tsx`: the `<aside>`'s `border-r` → `border-e`.

## Testing

- Unit tests for `useT()`: returns the correct string for a known key in each of the 3 locales;
  falls back to English when a key is missing from a non-English locale; falls back to the raw key
  string when missing from English too.
- Unit test for the translation dictionary's structural integrity: every top-level section key
  present in `en` is also present (not necessarily fully filled, but present as an object) in `fr`
  and `ar` — catches an entire section accidentally never translated.
- No integration/E2E test — this is a UI-only, client-rendered concern with no server/database
  interaction, consistent with how other pure-UI work in this app has been tested (or not) so far.

## Explicitly Out of Scope

- Server-returned API error message translation (flagged above).
- A visible "translation coverage" indicator or admin tooling.
- Automated translation (e.g. calling an LLM to generate the French/Arabic strings at runtime) —
  all three languages' strings are written directly into the dictionary, once, by hand/AI-assisted
  authoring at implementation time, not generated dynamically per request.
- Pluralization/ICU message formatting — the app's current strings are simple enough (no "N items"
  style counters needing plural rules) that a plain key→string map is sufficient.
