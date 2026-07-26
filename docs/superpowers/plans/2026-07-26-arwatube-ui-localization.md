# ArwaTube AI Engine — UI Localization (en/fr/ar + RTL) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the app's own UI chrome (not just AI-generated content) into English/French/Arabic, with full right-to-left layout for Arabic, driven by the same per-project `targetLanguage` setting the Language Switcher already writes to.

**Architecture:** A `translations.ts` dictionary (nested keys per locale) + a `useT()` hook read every hardcoded string that currently exists in each page/component. `useAppStore` gains a `locale` field that the Language Switcher updates immediately on change (optimistic — no waiting on the server round trip) and that a `LocaleEffects` component uses to set `<html lang>`/`dir`. Since the app is almost entirely flexbox-based, RTL mirroring is close to automatic — only 3 files use physical left/right utilities and need converting to logical (`text-start`/`end-2`/`border-e`) equivalents.

**Tech Stack:** TypeScript, React, Zustand, Tailwind CSS 3.4 (supports logical-property utilities), Vitest.

---

## File Structure

```
src/
  lib/
    i18n/
      translations.ts      (NEW: en/fr/ar dictionaries)
      useTranslation.ts     (NEW: useT() hook)
  store/
    useAppStore.ts          (MODIFY: add locale + setLocale)
  components/
    layout/
      LocaleEffects.tsx     (NEW: sets html lang/dir)
      LanguageSwitcher.tsx  (MODIFY: calls setLocale)
      Sidebar.tsx           (MODIFY: t() + border-r → border-e)
      Topbar.tsx            (MODIFY: t()-based title lookup instead of URL-derived)
      ProjectSwitcher.tsx   (MODIFY: t())
      ThemeToggle.tsx       (MODIFY: t())
    ui/
      PlaceholderPage.tsx   (MODIFY: t())
    idea-finder/
      IdeaCard.tsx          (MODIFY: t())
    scripts/
      ScriptSectionCard.tsx (MODIFY: t())
    thumbnails/
      ThumbnailCard.tsx     (MODIFY: t() + right-2 → end-2)
    platformVariants/
      PlatformVariantCard.tsx (MODIFY: t())
    descriptionTags/
      EditableChipList.tsx  (MODIFY: t(), placeholder prop instead of derived string)
  app/
    (app)/layout.tsx        (MODIFY: mount LocaleEffects)
    (app)/dashboard/page.tsx
    (app)/idea-finder/page.tsx
    (app)/script-writer/page.tsx
    (app)/seo-titles/page.tsx
    (app)/description-tags/page.tsx
    (app)/thumbnails/page.tsx
    (app)/multi-platform-shorts/page.tsx
    (app)/projects/page.tsx
    (app)/settings/page.tsx
    login/page.tsx           (all MODIFY: t())

tests/
  unit/
    i18n.test.ts            (NEW)
```

`src/app/(app)/keyword-research/page.tsx` and `src/app/(app)/one-click-publish/page.tsx` both just render `<PlaceholderPage title="..." phase="...">` — translating `PlaceholderPage` itself (Task 5) covers the "Coming soon" boilerplate; the `title`/`phase` props passed in are handled in that same task too (small, done inline).

**IMPORTANT — do not run the full test suite against a live database.** Only `npx vitest run tests/unit/i18n.test.ts` is needed for this plan (no integration/DB work here) — never the bare `npm test`.

---

## Task 1: Translation Dictionary + `useT()` Hook

**Files:**
- Create: `src/lib/i18n/translations.ts`
- Create: `src/lib/i18n/useTranslation.ts`
- Test: `tests/unit/i18n.test.ts`

This is the foundational task: every string used anywhere in the app must have a key here before
later tasks can reference it. The **English values below are exact** — they are the current,
live strings in the app today, copied verbatim from each file; do not alter them. For **French and
Arabic**, translate every single key naturally and accurately, matching a professional SaaS
product tone (not literal word-for-word machine translation) — two fully worked rows are given per
section below as a quality bar; translate every remaining key in that same section to the same
standard.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/i18n.test.ts
import { describe, it, expect } from "vitest";
import { translations } from "@/lib/i18n/translations";
import { useT } from "@/lib/i18n/useTranslation";
import { useAppStore } from "@/store/useAppStore";

function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null ? collectKeys(value as Record<string, unknown>, path) : [path];
  });
}

describe("translations", () => {
  it("has the exact same set of keys in fr and ar as in en", () => {
    const enKeys = collectKeys(translations.en).sort();
    const frKeys = collectKeys(translations.fr).sort();
    const arKeys = collectKeys(translations.ar).sort();
    expect(frKeys).toEqual(enKeys);
    expect(arKeys).toEqual(enKeys);
  });

  it("has no empty string values in any locale", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      const keys = collectKeys(translations[locale]);
      for (const key of keys) {
        const value = key.split(".").reduce<unknown>((obj, segment) => (obj as Record<string, unknown>)?.[segment], translations[locale]);
        expect(typeof value === "string" && value.trim().length > 0, `${locale}.${key} must be non-empty`).toBe(true);
      }
    }
  });

  it("translates the sidebar nav dashboard label into French and Arabic", () => {
    expect(translations.fr.nav.dashboard).not.toBe(translations.en.nav.dashboard);
    expect(translations.ar.nav.dashboard).not.toBe(translations.en.nav.dashboard);
  });
});

describe("useT", () => {
  it("returns the English string for a known key when locale is en", () => {
    useAppStore.setState({ locale: "en" });
    const t = useT();
    expect(t("nav.dashboard")).toBe(translations.en.nav.dashboard);
  });

  it("returns the French string for a known key when locale is fr", () => {
    useAppStore.setState({ locale: "fr" });
    const t = useT();
    expect(t("nav.dashboard")).toBe(translations.fr.nav.dashboard);
  });

  it("falls back to English when the key is missing from a non-English locale", () => {
    useAppStore.setState({ locale: "fr" });
    const t = useT();
    // "common.generate" always exists per the dictionary below, so simulate a
    // missing key by looking up something that structurally cannot exist.
    expect(t("thisKeyDoesNotExist.atAll")).toBe("thisKeyDoesNotExist.atAll");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/i18n.test.ts`
Expected: FAIL — `Cannot find module '@/lib/i18n/translations'`

- [ ] **Step 3: Create `src/lib/i18n/translations.ts`**

Build one exported `const translations = { en: {...}, fr: {...}, ar: {...} } as const;` object.
Use this exact key structure and English values. For French and Arabic, translate every key —
two worked examples are given per section as a quality/tone bar (French informal-but-professional
"vous" register; Arabic Modern Standard Arabic, formal register consistent with a business tool).

**`common`** (shared across multiple pages):
```
generate: "Generate"
generating: "Generating..."
regenerate: "Regenerate"
regenerating: "Regenerating..."
loading: "Loading..."
save: "Save"
create: "Create"
switchLabel: "Switch"
active: "Active"
hide: "Hide"
show: "Show"
download: "Download"
saveToDrive: "Save to Drive"
add: "Add"
```
Worked examples — French: `generate: "Générer"`, `loading: "Chargement..."`. Arabic:
`generate: "إنشاء"`, `loading: "جارٍ التحميل..."`. Translate the remaining 10 keys in this section
to the same standard.

**`nav`** (sidebar labels — must match `Sidebar.tsx`'s `NAV_ITEMS` order/wording exactly):
```
appName: "ArwaTube AI"
dashboard: "Dashboard"
ideaFinder: "Idea Finder"
scriptWriter: "Script Writer"
seoTitles: "SEO Titles"
keywordResearch: "Keyword Research"
descriptionTags: "Description & Tags"
thumbnails: "Thumbnails & A/B Test"
multiPlatformShorts: "Multi-Platform Shorts"
oneClickPublish: "One-Click Publish"
projects: "Projects"
settings: "Settings"
```
Worked examples — French: `dashboard: "Tableau de bord"`, `settings: "Paramètres"`. Arabic:
`dashboard: "لوحة التحكم"`, `settings: "الإعدادات"`. Translate the remaining 10 keys (note:
`appName` "ArwaTube AI" is a brand name — keep it unchanged in all 3 locales).

**`login`**:
```
title: "ArwaTube AI Engine"
subtitle: "Plan, write, and repurpose your video content with AI."
continueWithGoogle: "Continue with Google"
```
(`title` is the brand name — keep unchanged in all 3 locales.) Worked example — French:
`subtitle: "Planifiez, rédigez et repensez le contenu de vos vidéos grâce à l'IA."`. Arabic:
`subtitle: "خطط لمحتوى الفيديو الخاص بك واكتبه وأعد توظيفه باستخدام الذكاء الاصطناعي."`.
Translate `continueWithGoogle`.

**`dashboard`**:
```
eyebrow: "Analytics Dashboard"
defaultProjectName: "My First Channel"
subtitle: "A live snapshot of everything ArwaTube AI has generated for this project."
statIdeasGenerated: "Ideas Generated"
statThumbnailsGenerated: "Thumbnails Generated"
statAvgVirality: "Avg Virality Score"
statAvgCtr: "Avg Thumbnail CTR"
chartTitle: "Ideas Generated — Last 7 Days"
daySun: "Sun"
dayMon: "Mon"
dayTue: "Tue"
dayWed: "Wed"
dayThu: "Thu"
dayFri: "Fri"
daySat: "Sat"
```
Worked examples — French: `eyebrow: "Tableau de bord analytique"`,
`statIdeasGenerated: "Idées générées"`. Arabic: `eyebrow: "لوحة التحليلات"`,
`statIdeasGenerated: "الأفكار المُنشأة"`. Translate the remaining keys, including all 7 day
abbreviations (French: Dim/Lun/Mar/Mer/Jeu/Ven/Sam; Arabic: use standard short day names).

**`ideaFinder`**:
```
title: "Idea Finder"
subtitle: "Turn a topic into scored video concepts."
placeholderChannelTopic: "Channel Topic"
placeholderPrimaryNiche: "Primary Niche"
placeholderTargetAudience: "Target Audience"
placeholderInspirationChannel: "Inspiration Channel (optional)"
generateButton: "Generate Ideas"
errorRequiredFields: "Channel Topic, Primary Niche, and Target Audience are required."
errorGenerateFailed: "Failed to generate ideas. Please try again."
```
Worked examples — French: `title: "Recherche d'idées"`,
`subtitle: "Transformez un sujet en concepts de vidéo notés."`. Arabic:
`title: "مكتشف الأفكار"`, `subtitle: "حوّل الموضوع إلى أفكار فيديو مُقيّمة."`. Translate the rest.

**`ideaCard`**:
```
realYoutubeData: "REAL YOUTUBE DATA"
aiEstimate: "AI ESTIMATE"
hookLabel: "Hook:"
useThisIdeaIn: "Use this idea in"
actionScriptWriter: "Script Writer"
actionSeoTitles: "SEO Titles"
actionKeywordResearch: "Keyword Research"
actionDescriptionTags: "Description & Tags"
actionThumbnails: "Thumbnails"
actionMultiPlatformShorts: "Multi-Platform Shorts"
```
Worked examples — French: `hookLabel: "Accroche :"`, `useThisIdeaIn: "Utiliser cette idée dans"`.
Arabic: `hookLabel: "الفكرة الافتتاحية:"`, `useThisIdeaIn: "استخدم هذه الفكرة في"`. Translate the
rest (the 6 `action*` keys reuse the same wording as the matching `nav.*` keys' concepts).

**`scriptWriter`**:
```
title: "Script Writer"
subtitle: "Generate a structured video script with Hook, Intro, Main Content, CTA, and Ending."
placeholderTopic: "Video topic..."
generateButton: "Generate Script"
errorGenerateFailed: "Failed to generate script. Please try again."
errorSaveFailed: "Failed to save section. Please try again."
errorRegenerateFailed: "Failed to regenerate section. Please try again."
toneEngaging: "ENGAGING"
toneEducational: "EDUCATIONAL"
toneStorytelling: "STORYTELLING"
toneFastPaced: "FAST_PACED"
```
Worked examples — French: `title: "Rédacteur de script"`,
`toneEngaging: "ENGAGEANT"`. Arabic: `title: "كاتب السيناريو"`, `toneEngaging: "جذّاب"`.
Translate the rest, including all 4 tone labels (these are shown as button labels, so keep them
short, one word/short phrase each, in the corresponding language).

**`scriptSectionCard`**:
```
sectionHook: "Hook"
sectionIntro: "Intro"
sectionMainContent: "Main Content"
sectionCta: "CTA"
sectionEnding: "Ending"
```
Worked examples — French: `sectionHook: "Accroche"`, `sectionEnding: "Conclusion"`. Arabic:
`sectionHook: "الافتتاحية"`, `sectionEnding: "الخاتمة"`. Translate the rest (`sectionCta` can stay
"CTA" / an equivalent short acronym-or-phrase per language — use a natural short phrase, not
necessarily an acronym, e.g. French "Appel à l'action", Arabic "دعوة لاتخاذ إجراء").

**`seoTitles`**:
```
title: "SEO Titles & Keyword Research"
subtitle: "Generate high-CTR title variations and keyword research for your video."
topicLabel: "Topic:"
keywordsLabel: "Keywords"
placeholderTopic: "Video topic..."
researchButton: "Research Titles"
errorGenerateFailed: "Failed to generate titles. Please try again."
errorSelectFailed: "Failed to select title. Please try again."
errorRegenerateFailed: "Failed to regenerate titles. Please try again."
```
Worked examples — French: `title: "Titres SEO et recherche de mots-clés"`,
`keywordsLabel: "Mots-clés"`. Arabic: `title: "عناوين تحسين محركات البحث وأبحاث الكلمات المفتاحية"`,
`keywordsLabel: "الكلمات المفتاحية"`. Translate the rest.

**`descriptionTags`**:
```
title: "Description & Tags"
subtitle: "Generate a full metadata package: description, tags, hashtags, category, and a pinned-comment suggestion."
topicLabel: "Topic:"
descriptionLabel: "Description"
tagsLabel: "Tags"
hashtagsLabel: "Hashtags"
categoryLabel: "Category"
pinnedCommentLabel: "Pinned Comment"
placeholderTopic: "Video topic..."
generateButton: "Generate Metadata"
errorGenerateFailed: "Failed to generate metadata. Please try again."
errorSaveFailed: "Failed to save changes. Please try again."
errorRegenerateFailed: "Failed to regenerate metadata. Please try again."
```
Worked examples — French: `descriptionLabel: "Description"`, `hashtagsLabel: "Hashtags"`. Arabic:
`descriptionLabel: "الوصف"`, `hashtagsLabel: "الوسوم"`. Translate the rest.

**`editableChipList`**:
```
addPrefix: "Add"
```
Worked examples — French: `addPrefix: "Ajouter"`. Arabic: `addPrefix: "إضافة"`. (Used by Task 11's
new `placeholder` prop, e.g. `` `${t("editableChipList.addPrefix")} ${t("descriptionTags.tagsLabel").toLowerCase()}...` ``
— see Task 11.)

**`thumbnails`**:
```
title: "Thumbnail Studio"
subtitle: "Generate and A/B test thumbnails for your video."
placeholderPrompt: "Describe the thumbnail you want..."
singleMode: "Single"
abTestMode: "A/B Test (4 variations)"
generateButton: "Generate"
checkingForSaved: "Checking for saved thumbnails..."
loadingThumbnails: "Loading thumbnails..."
errorGenerateFailed: "Failed to generate thumbnails. Please try again."
errorGenerateFailedPartialSuffix: " Any thumbnails generated before the failure have been saved — reloading now."
errorGenerateFailedReload: "Failed to generate thumbnails. Please try again. Reloading in case some were saved."
```
Worked examples — French: `title: "Studio de miniatures"`, `singleMode: "Unique"`. Arabic:
`title: "استوديو الصور المصغرة"`, `singleMode: "فردي"`. Translate the rest.

**`thumbnailCard`**:
```
higgsfield: "Higgsfield"
aiEstimate: "AI Estimate"
download: "Download"
saveToDrive: "Save to Drive"
savedToDriveMessage: "Saved to Drive."
failedToSaveToDriveMessage: "Failed to save to Drive. Please try again."
ctrLabel: "CTR"
```
Worked examples — French: `savedToDriveMessage: "Enregistré sur Drive."`,
`ctrLabel: "TCC"` (taux de clic — or keep "CTR" as a recognized acronym in French too, your
judgment; if kept, still provide a value, don't leave it identical-by-omission). Arabic:
`savedToDriveMessage: "تم الحفظ في Drive."`, `ctrLabel: "نسبة النقر"`. Translate the rest.

**`multiPlatformShorts`**:
```
title: "Multi-Platform Shorts"
subtitle: "Repurpose your video concept into platform-tailored hooks, captions, and hashtags for TikTok, YouTube Shorts, Instagram Reels, and Facebook Reels."
placeholderTopic: "Video topic..."
generateButton: "Generate Shorts"
errorGenerateFailed: "Failed to generate shorts. Please try again."
errorSaveFailed: "Failed to save changes. Please try again."
errorRegenerateFailed: "Failed to regenerate this variant. Please try again."
```
Worked examples — French: `title: "Extraits multiplateformes"`,
`generateButton: "Générer les extraits"`. Arabic: `title: "مقاطع متعددة المنصات"`,
`generateButton: "إنشاء المقاطع"`. Translate the rest.

**`platformVariantCard`**:
```
hookLabel: "Hook"
captionLabel: "Caption"
hashtagsLabel: "Hashtags"
platformTiktok: "TikTok"
platformYoutubeShorts: "YouTube Shorts"
platformInstagramReels: "Instagram Reels"
platformFacebookReels: "Facebook Reels"
```
Platform/product names (`TikTok`, `YouTube Shorts`, `Instagram Reels`, `Facebook Reels`) are
proper nouns — keep them unchanged in all 3 locales. Worked examples — French:
`hookLabel: "Accroche"`, `captionLabel: "Légende"`. Arabic: `hookLabel: "الافتتاحية"`,
`captionLabel: "التعليق"`. Translate `hashtagsLabel` (same as `descriptionTags.hashtagsLabel`).

**`projects`**:
```
title: "Projects"
subtitle: "Manage the channels you generate content for."
placeholderNewChannelName: "New channel name"
createButton: "Create"
```
Worked examples — French: `title: "Projets"`,
`subtitle: "Gérez les chaînes pour lesquelles vous générez du contenu."`. Arabic:
`title: "المشاريع"`, `subtitle: "أدر القنوات التي تنشئ المحتوى من أجلها."`. Translate the rest.

**`settings`**:
```
title: "Settings"
apiKeyNotice: "Without a YouTube API key, Idea Finder falls back to heuristic AI-generated ideas instead of real search-trend data."
apiKeyLabel: "YouTube Data API Key"
apiKeyPlaceholder: "Enter to update — leave blank to keep current key"
targetCountryLabel: "Target Country"
targetLanguageLabel: "Target Language"
countryUS: "United States"
countryMA: "Morocco"
countryFR: "France"
countryGB: "United Kingdom"
languageEnglish: "English"
languageFrench: "French"
languageArabic: "Arabic"
saveButton: "Save Settings"
savedButton: "Saved"
```
Worked examples — French: `title: "Paramètres"`, `targetLanguageLabel: "Langue cible"`. Arabic:
`title: "الإعدادات"`, `targetLanguageLabel: "اللغة المستهدفة"`. Translate the rest (country names
translate normally, e.g. French `countryUS: "États-Unis"`, Arabic `countryUS: "الولايات المتحدة"`).

**`placeholderPage`**:
```
comingSoonPrefix: "Coming soon — this module ships in"
```
Used as `` `${t("placeholderPage.comingSoonPrefix")} ${phase}.` `` (see Task 5) — `phase` (e.g.
"Phase 3") stays as literal English/numeral text, not translated, since it's an internal
versioning label, not user-facing prose in the same sense. Worked examples — French:
`comingSoonPrefix: "Bientôt disponible — ce module sera livré en"`. Arabic:
`comingSoonPrefix: "قريبًا — سيتم إطلاق هذه الوحدة في"`.

**`ariaLabels`**:
```
activeProject: "Active project"
targetLanguage: "Target language"
switchToLightMode: "Switch to light mode"
switchToDarkMode: "Switch to dark mode"
```
Worked examples — French: `activeProject: "Projet actif"`,
`switchToDarkMode: "Passer au mode sombre"`. Arabic: `activeProject: "المشروع النشط"`,
`switchToDarkMode: "التبديل إلى الوضع الداكن"`. Translate the rest.

Full file shape:

```ts
export const translations = {
  en: { common: {...}, nav: {...}, login: {...}, dashboard: {...}, ideaFinder: {...}, ideaCard: {...}, scriptWriter: {...}, scriptSectionCard: {...}, seoTitles: {...}, descriptionTags: {...}, editableChipList: {...}, thumbnails: {...}, thumbnailCard: {...}, multiPlatformShorts: {...}, platformVariantCard: {...}, projects: {...}, settings: {...}, placeholderPage: {...}, ariaLabels: {...} },
  fr: { /* same shape, all keys translated */ },
  ar: { /* same shape, all keys translated */ },
} as const;
```

- [ ] **Step 4: Create `src/lib/i18n/useTranslation.ts`**

```ts
import { useAppStore } from "@/store/useAppStore";
import { translations } from "./translations";

function lookup(dict: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((obj, segment) => (obj as Record<string, unknown> | undefined)?.[segment], dict);
}

export function useT() {
  const locale = useAppStore((state) => state.locale);
  return function t(key: string): string {
    const path = key.split(".");
    const fromLocale = lookup(translations[locale], path);
    if (typeof fromLocale === "string") return fromLocale;
    const fromEnglish = lookup(translations.en, path);
    if (typeof fromEnglish === "string") return fromEnglish;
    return key;
  };
}
```

Note: `useAppStore` doesn't have a `locale` field yet — that's added in Task 2. This file will not
type-check/pass tests until Task 2 lands; that's expected and fine within this same work session
(both tasks are committed close together), but if working strictly task-by-task, note this
dependency explicitly when reporting Task 1 status.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/i18n.test.ts`
Expected: FAIL at this point specifically due to `useAppStore` not having `locale`/`setState` for
it yet (a TS error, not a logic error) — this is expected; Task 2 resolves it. If your environment
strictly requires green tests before committing, do Task 2's `useAppStore` change first, then
return to verify this test file, then commit both together as noted in Task 2.

- [ ] **Step 6: Commit** (after Task 2's `useAppStore` change makes this compile — see Task 2's
commit step, which commits both together)

---

## Task 2: `useAppStore` Locale Field + `LocaleEffects`

**Files:**
- Modify: `src/store/useAppStore.ts`
- Create: `src/components/layout/LocaleEffects.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Update `src/store/useAppStore.ts`**

```ts
import { create } from "zustand";

export interface ProjectSummary {
  id: string;
  name: string;
  isActive: boolean;
}

export type Locale = "en" | "fr" | "ar";

interface AppState {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  locale: Locale;
  setProjects: (projects: ProjectSummary[]) => void;
  switchProject: (projectId: string) => void;
  setLocale: (locale: Locale) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  currentProject: null,
  locale: "en",

  setProjects: (projects) => {
    // Assumes at most one project has isActive: true (enforced server-side).
    // Falls back to the first project if none is flagged active, or null if the list is empty.
    set({
      projects,
      currentProject: projects.find((p) => p.isActive) ?? projects[0] ?? null,
    });
  },

  switchProject: (projectId) => {
    const projects = get().projects.map((p) => ({ ...p, isActive: p.id === projectId }));
    set({
      projects,
      currentProject: projects.find((p) => p.id === projectId) ?? null,
    });
  },

  setLocale: (locale) => set({ locale }),
}));
```

- [ ] **Step 2: Create `src/components/layout/LocaleEffects.tsx`**

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

- [ ] **Step 3: Mount `LocaleEffects` in `src/app/(app)/layout.tsx`**

Read the current file first (it renders `StoreHydrator`, `Sidebar`, `Topbar` inside a flex
container). Add `LocaleEffects` as a sibling of `StoreHydrator`:

```tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { StoreHydrator } from "@/components/layout/StoreHydrator";
import { LocaleEffects } from "@/components/layout/LocaleEffects";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <StoreHydrator />
      <LocaleEffects />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run Task 1's test to verify it now passes**

Run: `npx vitest run tests/unit/i18n.test.ts`
Expected: PASS (7 tests: 3 in `describe("translations")`, plus the 3 in `describe("useT")` — wait,
recount: 3 + 3 = 6; if your count differs slightly due to how you structured additional cases,
that's fine — the key requirement is 0 failures).

- [ ] **Step 5: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit** (both Task 1 and Task 2's files together, since Task 1 doesn't compile
without Task 2)

```bash
git add src/lib/i18n/translations.ts src/lib/i18n/useTranslation.ts tests/unit/i18n.test.ts src/store/useAppStore.ts src/components/layout/LocaleEffects.tsx "src/app/(app)/layout.tsx"
git commit -m "feat: add i18n dictionary, useT hook, and locale state"
```

---

## Task 3: Language Switcher Wiring

**Files:**
- Modify: `src/components/layout/LanguageSwitcher.tsx`

- [ ] **Step 1: Update `src/components/layout/LanguageSwitcher.tsx`**

Read the current file first. It already fetches the current project's `targetLanguage` on mount
and POSTs on change. Add `setLocale` calls at both points:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { Locale } from "@/store/useAppStore";

const LANGUAGES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "ar", label: "Arabic" },
];

export function LanguageSwitcher() {
  const { currentProject, setLocale } = useAppStore();
  const [targetLanguage, setTargetLanguage] = useState<Locale>("en");

  useEffect(() => {
    if (!currentProject) return;
    fetch(`/api/settings?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.targetLanguage) {
          setTargetLanguage(data.targetLanguage);
          setLocale(data.targetLanguage);
        }
      })
      .catch((err) => console.error("Failed to load target language:", err));
  }, [currentProject, setLocale]);

  if (!currentProject) {
    return null;
  }

  async function updateLanguage(code: Locale) {
    setTargetLanguage(code);
    setLocale(code);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject!.id, targetLanguage: code }),
      });
      if (!res.ok) {
        console.error("Failed to save target language:", res.status, await res.text());
      }
    } catch (error) {
      console.error("Failed to save target language:", error);
    }
  }

  return (
    <select
      aria-label="Target language"
      value={targetLanguage}
      onChange={(e) => updateLanguage(e.target.value as Locale)}
      className="rounded-md border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-fg"
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}
```

(This task keeps the dropdown's own option labels and aria-label in plain English/literal form for
now — Task 5 replaces those specific strings with `t()` calls alongside the rest of the shared
layout components, to keep this task focused purely on the state-wiring behavior.)

- [ ] **Step 2: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/LanguageSwitcher.tsx
git commit -m "feat: sync language switcher selection into locale state immediately"
```

---

## Task 4: RTL Class Conversions

**Files:**
- Modify: `src/app/(app)/seo-titles/page.tsx`
- Modify: `src/components/thumbnails/ThumbnailCard.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

These are the only 3 places in the codebase using physical left/right Tailwind utilities. Convert
each to its logical-property equivalent so it flips correctly under `dir="rtl"`.

- [ ] **Step 1: `src/app/(app)/seo-titles/page.tsx`**

Find the title-selection button's className (currently `"block w-full rounded-md border px-3 py-2 text-left text-sm ${...}"`).
Change `text-left` to `text-start`.

- [ ] **Step 2: `src/components/thumbnails/ThumbnailCard.tsx`**

Find the CTR badge's className (currently `"absolute right-2 top-2 rounded px-2 py-0.5 text-[10px] font-bold text-zinc-900"`).
Change `right-2` to `end-2`.

- [ ] **Step 3: `src/components/layout/Sidebar.tsx`**

Find the `<aside>`'s className (currently `"flex h-screen w-64 flex-col border-r border-surface-border bg-surface p-4"`).
Change `border-r` to `border-e`.

- [ ] **Step 4: Run `npx tsc --noEmit` and a full build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds (this is a pure CSS class change, no logic changed).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/seo-titles/page.tsx" src/components/thumbnails/ThumbnailCard.tsx src/components/layout/Sidebar.tsx
git commit -m "fix: convert physical left/right Tailwind classes to logical properties for RTL"
```

---

## Task 5: Translate Shared Layout Components

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/Topbar.tsx`
- Modify: `src/components/layout/ProjectSwitcher.tsx`
- Modify: `src/components/layout/ThemeToggle.tsx`
- Modify: `src/components/layout/LanguageSwitcher.tsx`
- Modify: `src/components/ui/PlaceholderPage.tsx`
- Modify: `src/app/(app)/keyword-research/page.tsx`
- Modify: `src/app/(app)/one-click-publish/page.tsx`

- [ ] **Step 1: Update `src/components/layout/Sidebar.tsx`**

`NAV_ITEMS`' `label` strings become translation keys instead of literal text, resolved inside the
component (not the module-level array, since `t()` is a hook and can't be called at module scope):

```tsx
"use client";

import { SidebarNavItem } from "./SidebarNavItem";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { useT } from "@/lib/i18n/useTranslation";

const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "nav.dashboard" },
  { href: "/idea-finder", labelKey: "nav.ideaFinder" },
  { href: "/script-writer", labelKey: "nav.scriptWriter" },
  { href: "/seo-titles", labelKey: "nav.seoTitles" },
  { href: "/keyword-research", labelKey: "nav.keywordResearch" },
  { href: "/description-tags", labelKey: "nav.descriptionTags" },
  { href: "/thumbnails", labelKey: "nav.thumbnails" },
  { href: "/multi-platform-shorts", labelKey: "nav.multiPlatformShorts" },
  { href: "/one-click-publish", labelKey: "nav.oneClickPublish" },
  { href: "/projects", labelKey: "nav.projects" },
];

export function Sidebar() {
  const t = useT();

  return (
    <aside className="flex h-screen w-64 flex-col border-e border-surface-border bg-surface p-4">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-accent">{t("nav.appName")}</h1>
      </div>
      <div className="mb-4">
        <ProjectSwitcher />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.href} href={item.href} label={t(item.labelKey)} />
        ))}
      </nav>
      <div className="mt-4 shrink-0 border-t border-surface-border pt-4">
        <SidebarNavItem href="/settings" label={t("nav.settings")} />
      </div>
    </aside>
  );
}
```

Note: this file was already updated in Task 4 to use `border-e` — this step's snippet already
reflects that, so applying this full-file replacement here is safe (don't revert to `border-r`).

- [ ] **Step 2: Update `src/components/layout/Topbar.tsx`**

The current `titleFromPath` derives a title by capitalizing the URL segment — replace this with a
lookup into the same `nav.*` keys used by the sidebar, so the topbar heading translates too:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useT } from "@/lib/i18n/useTranslation";

const PATH_TO_NAV_KEY: Record<string, string> = {
  dashboard: "nav.dashboard",
  "idea-finder": "nav.ideaFinder",
  "script-writer": "nav.scriptWriter",
  "seo-titles": "nav.seoTitles",
  "keyword-research": "nav.keywordResearch",
  "description-tags": "nav.descriptionTags",
  thumbnails: "nav.thumbnails",
  "multi-platform-shorts": "nav.multiPlatformShorts",
  "one-click-publish": "nav.oneClickPublish",
  projects: "nav.projects",
  settings: "nav.settings",
};

export function Topbar() {
  const pathname = usePathname();
  const t = useT();
  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const navKey = PATH_TO_NAV_KEY[segment] ?? "nav.dashboard";

  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-border bg-surface px-6">
      <h2 className="text-sm font-medium text-fg-muted">{t(navKey)}</h2>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Update `src/components/layout/ProjectSwitcher.tsx`**

Only the `aria-label` needs translating:

```tsx
"use client";

import { useAppStore } from "@/store/useAppStore";
import { useT } from "@/lib/i18n/useTranslation";

async function persistActiveProject(projectId: string) {
  try {
    const res = await fetch("/api/projects/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      console.error("Failed to persist active project:", res.status, await res.text());
    }
  } catch (error) {
    console.error("Failed to persist active project:", error);
  }
}

export function ProjectSwitcher() {
  const { projects, currentProject, switchProject } = useAppStore();
  const t = useT();

  if (projects.length === 0) {
    return null;
  }

  return (
    <select
      aria-label={t("ariaLabels.activeProject")}
      value={currentProject?.id ?? ""}
      onChange={(e) => {
        switchProject(e.target.value);
        void persistActiveProject(e.target.value);
      }}
      className="w-full rounded-md border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-fg"
    >
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Update `src/components/layout/ThemeToggle.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useTranslation";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const t = useT();

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch (error) {
      console.error("Failed to persist theme preference:", error);
    }
  }

  const label = isDark ? t("ariaLabels.switchToLightMode") : t("ariaLabels.switchToDarkMode");

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="rounded-md border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-fg hover:text-accent"
    >
      {isDark ? "🌙" : "☀️"}
    </button>
  );
}
```

- [ ] **Step 5: Update `src/components/layout/LanguageSwitcher.tsx`**

Add the `aria-label` translation on top of Task 3's state-wiring change (the `<option>` labels
stay literal language names — "English"/"French"/"Arabic" are proper nouns naming the language
itself, always shown in that same fixed form regardless of UI locale, matching how most apps'
language pickers work):

```tsx
      aria-label={t("ariaLabels.targetLanguage")}
```

Add `const t = useT();` and the `useT` import to the existing file from Task 3.

- [ ] **Step 6: Update `src/components/ui/PlaceholderPage.tsx`**

```tsx
"use client";

import { useT } from "@/lib/i18n/useTranslation";

export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-surface-border py-24 text-center">
      <h2 className="text-xl font-semibold text-fg">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-fg-faint">
        {t("placeholderPage.comingSoonPrefix")} {phase}.
      </p>
    </div>
  );
}
```

Note: `PlaceholderPage` becomes a client component (adds `"use client"`) since `useT()` reads from
the Zustand store, which requires client-side rendering — this is consistent with every other
component in the app already being a client component for the same reason.

- [ ] **Step 7: Update `src/app/(app)/keyword-research/page.tsx`** and
      **`src/app/(app)/one-click-publish/page.tsx`**

These pass `title`/`phase` as plain props to `PlaceholderPage` — translate `title` via a `useT()`
call in each (they must also become client components to call the hook):

```tsx
// src/app/(app)/keyword-research/page.tsx
"use client";

import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { useT } from "@/lib/i18n/useTranslation";

export default function KeywordResearchPage() {
  const t = useT();
  return <PlaceholderPage title={t("nav.keywordResearch")} phase="Phase 3" />;
}
```

```tsx
// src/app/(app)/one-click-publish/page.tsx
"use client";

import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { useT } from "@/lib/i18n/useTranslation";

export default function OneClickPublishPage() {
  const t = useT();
  return <PlaceholderPage title={t("nav.oneClickPublish")} phase="Phase 5" />;
}
```

- [ ] **Step 8: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Topbar.tsx src/components/layout/ProjectSwitcher.tsx src/components/layout/ThemeToggle.tsx src/components/layout/LanguageSwitcher.tsx src/components/ui/PlaceholderPage.tsx "src/app/(app)/keyword-research/page.tsx" "src/app/(app)/one-click-publish/page.tsx"
git commit -m "feat: translate sidebar, topbar, and shared layout components"
```

---

## Task 6: Translate Login Page

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Update `src/app/login/page.tsx`**

```tsx
"use client";

import { signIn } from "next-auth/react";
import { useT } from "@/lib/i18n/useTranslation";

export default function LoginPage() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-accent">{t("login.title")}</h1>
        <p className="mt-2 text-fg-subtle">{t("login.subtitle")}</p>
      </div>
      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="rounded-md bg-accent px-6 py-3 font-medium text-zinc-900 hover:opacity-90"
      >
        {t("login.continueWithGoogle")}
      </button>
    </div>
  );
}
```

Note: the login page sits outside the `(app)` route group, so it never mounts `LocaleEffects` —
it will always render in whatever `locale` the Zustand store currently holds (default `"en"` on a
fresh/unauthenticated session, which is correct: there's no project to read a `targetLanguage`
from before sign-in).

- [ ] **Step 2: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: translate login page"
```

---

## Task 7: Translate Dashboard Page

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

This page is currently a Server Component (`async function DashboardPage()`, no `"use client"`).
`useT()` needs client-side Zustand access, so this task splits it: the data-fetching stays
server-side, but the rendered JSX moves into a small client child component that receives the
computed stats/chart data as props.

- [ ] **Step 1: Create `src/components/dashboard/DashboardView.tsx`**

```tsx
"use client";

import { IdeasChart, type DailyPoint } from "./IdeasChart";
import { useT } from "@/lib/i18n/useTranslation";

interface Stat {
  labelKey: string;
  value: number | string;
  color: string;
  icon: string;
}

export function DashboardView({
  projectName,
  ideasCount,
  thumbnailsCount,
  avgViralityScore,
  avgCtrEstimate,
  chartData,
}: {
  projectName: string | null;
  ideasCount: number;
  thumbnailsCount: number;
  avgViralityScore: number | null;
  avgCtrEstimate: number | null;
  chartData: DailyPoint[];
}) {
  const t = useT();

  const stats: Stat[] = [
    { labelKey: "dashboard.statIdeasGenerated", value: ideasCount, color: "#2a78d6", icon: "💡" },
    { labelKey: "dashboard.statThumbnailsGenerated", value: thumbnailsCount, color: "#eb6834", icon: "🖼️" },
    { labelKey: "dashboard.statAvgVirality", value: avgViralityScore ?? "—", color: "#1baf7a", icon: "📈" },
    {
      labelKey: "dashboard.statAvgCtr",
      value: avgCtrEstimate !== null ? `${avgCtrEstimate}%` : "—",
      color: "#eda100",
      icon: "🎯",
    },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t("dashboard.eyebrow")}</p>
      <h1 className="mt-1 text-3xl font-bold text-fg">{projectName ?? t("dashboard.defaultProjectName")}</h1>
      <p className="mt-2 max-w-xl text-fg-subtle">{t("dashboard.subtitle")}</p>

      <div className="mt-6 rounded-xl bg-[#f9f9f7] p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.labelKey}
              className="flex flex-col justify-between rounded-lg p-4 text-white shadow-sm"
              style={{ backgroundColor: stat.color }}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{stat.icon}</span>
                <span className="text-3xl font-bold">{stat.value}</span>
              </div>
              <p className="mt-3 text-sm font-medium opacity-95">{t(stat.labelKey)}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] p-4">
          <p className="text-sm font-semibold text-[#0b0b0b]">{t("dashboard.chartTitle")}</p>
          <div className="mt-3">
            <IdeasChart data={chartData} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `IdeasChart`'s day labels**

`src/components/dashboard/IdeasChart.tsx` is already a client component (`"use client"` at the
top, already has `useState` for hover). It receives `DailyPoint[]` with a `label` field currently
resolved to `"Sun"`/`"Mon"`/etc. by the server-side `buildLastSevenDays` helper in `page.tsx`
(Step 3 changes that to lowercase keys: `"sun"`, `"mon"`, ...). Add the translation lookup here,
in `IdeasChart` itself, at its two render sites (the hover tooltip and the axis labels row):

```tsx
"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useTranslation";

export interface DailyPoint {
  label: string;
  count: number;
}

const WIDTH = 600;
const HEIGHT = 180;
const PADDING = 24;

const DAY_KEY_TO_TRANSLATION_KEY: Record<string, string> = {
  sun: "dashboard.daySun",
  mon: "dashboard.dayMon",
  tue: "dashboard.dayTue",
  wed: "dashboard.dayWed",
  thu: "dashboard.dayThu",
  fri: "dashboard.dayFri",
  sat: "dashboard.daySat",
};

export function IdeasChart({ data }: { data: DailyPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const t = useT();

  const max = Math.max(1, ...data.map((d) => d.count));
  const stepX = (WIDTH - PADDING * 2) / Math.max(1, data.length - 1);

  function xFor(i: number) {
    return PADDING + i * stepX;
  }
  function yFor(count: number) {
    return HEIGHT - PADDING - (count / max) * (HEIGHT - PADDING * 2);
  }
  function dayLabel(key: string): string {
    return t(DAY_KEY_TO_TRANSLATION_KEY[key] ?? "dashboard.dayMon");
  }

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(d.count)}`).join(" ");
  const areaPath = `${linePath} L${xFor(data.length - 1)},${HEIGHT - PADDING} L${xFor(0)},${HEIGHT - PADDING} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Ideas generated per day">
        {/* recessive baseline */}
        <line x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} stroke="#c3c2b7" strokeWidth={1} />

        <path d={areaPath} fill="#2a78d6" fillOpacity={0.12} />
        <path d={linePath} fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => (
          <g key={d.label}>
            <circle
              cx={xFor(i)}
              cy={yFor(d.count)}
              r={hoverIndex === i ? 5 : 3}
              fill="#2a78d6"
              stroke="#fcfcfb"
              strokeWidth={1.5}
            />
            {/* generous hit target, bigger than the visible marker */}
            <rect
              x={xFor(i) - stepX / 2}
              y={0}
              width={stepX}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex((current) => (current === i ? null : current))}
            />
          </g>
        ))}
      </svg>

      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-md"
          style={{
            left: `${(xFor(hoverIndex) / WIDTH) * 100}%`,
            top: `${(yFor(data[hoverIndex].count) / HEIGHT) * 100}%`,
          }}
        >
          <span className="font-semibold text-zinc-900">{data[hoverIndex].count}</span>{" "}
          <span className="text-fg-faint">{dayLabel(data[hoverIndex].label)}</span>
        </div>
      )}

      <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
        {data.map((d) => (
          <span key={d.label}>{dayLabel(d.label)}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `src/app/(app)/dashboard/page.tsx`**

Change `DAY_LABELS` to lowercase keys and render `DashboardView` instead of inline JSX:

```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserProjects } from "@/server/projects";
import { prisma } from "@/lib/prisma";
import { DashboardView } from "@/components/dashboard/DashboardView";
import type { DailyPoint } from "@/components/dashboard/IdeasChart";

const DAY_LABELS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function buildLastSevenDays(createdAts: Date[]): DailyPoint[] {
  const days: DailyPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const count = createdAts.filter((date) => date >= day && date < nextDay).length;
    days.push({ label: DAY_LABELS[day.getDay()], count });
  }

  return days;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const projects = session?.user?.id ? await getUserProjects(session.user.id) : [];
  const activeProject = projects.find((p) => p.isActive);

  let ideasCount = 0;
  let thumbnailsCount = 0;
  let avgViralityScore: number | null = null;
  let avgCtrEstimate: number | null = null;
  let chartData: DailyPoint[] = buildLastSevenDays([]);

  if (activeProject) {
    const [ideas, thumbnails] = await Promise.all([
      prisma.idea.findMany({ where: { projectId: activeProject.id }, select: { viralityScore: true, createdAt: true } }),
      prisma.thumbnail.findMany({ where: { projectId: activeProject.id }, select: { ctrEstimate: true } }),
    ]);

    ideasCount = ideas.length;
    thumbnailsCount = thumbnails.length;
    avgViralityScore = ideas.length
      ? Math.round(ideas.reduce((sum, idea) => sum + idea.viralityScore, 0) / ideas.length)
      : null;
    avgCtrEstimate = thumbnails.length
      ? Math.round((thumbnails.reduce((sum, thumb) => sum + thumb.ctrEstimate, 0) / thumbnails.length) * 10) / 10
      : null;
    chartData = buildLastSevenDays(ideas.map((idea) => idea.createdAt));
  }

  return (
    <DashboardView
      projectName={activeProject?.name ?? null}
      ideasCount={ideasCount}
      thumbnailsCount={thumbnailsCount}
      avgViralityScore={avgViralityScore}
      avgCtrEstimate={avgCtrEstimate}
      chartData={chartData}
    />
  );
}
```

- [ ] **Step 4: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds, `/dashboard` still listed.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DashboardView.tsx src/components/dashboard/IdeasChart.tsx "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: translate dashboard page"
```

---

## Task 8: Translate Idea Finder Page + IdeaCard

**Files:**
- Modify: `src/app/(app)/idea-finder/page.tsx`
- Modify: `src/components/idea-finder/IdeaCard.tsx`

- [ ] **Step 1: Update `src/app/(app)/idea-finder/page.tsx`**

Add `import { useT } from "@/lib/i18n/useTranslation";` and `const t = useT();`. Replace:
- `"Idea Finder"` heading → `{t("ideaFinder.title")}`
- `"Turn a topic into scored video concepts."` → `{t("ideaFinder.subtitle")}`
- `placeholder="Channel Topic"` → `placeholder={t("ideaFinder.placeholderChannelTopic")}`
- `placeholder="Primary Niche"` → `placeholder={t("ideaFinder.placeholderPrimaryNiche")}`
- `placeholder="Target Audience"` → `placeholder={t("ideaFinder.placeholderTargetAudience")}`
- `placeholder="Inspiration Channel (optional)"` → `placeholder={t("ideaFinder.placeholderInspirationChannel")}`
- `{isGenerating ? "Generating..." : "Generate Ideas"}` → `{isGenerating ? t("common.generating") : t("ideaFinder.generateButton")}`
- `"Channel Topic, Primary Niche, and Target Audience are required."` → `t("ideaFinder.errorRequiredFields")`
- both occurrences of `"Failed to generate ideas. Please try again."` (the `data?.error ?? "..."` fallback and the catch-block fallback) → `t("ideaFinder.errorGenerateFailed")`

- [ ] **Step 2: Update `src/components/idea-finder/IdeaCard.tsx`**

```tsx
"use client";

import { useWorkflowStore } from "@/store/useWorkflowStore";
import { useT } from "@/lib/i18n/useTranslation";

export interface Idea {
  id: string;
  title: string;
  description: string;
  hook: string;
  viralityScore: number;
  scoreSource: "REAL_YOUTUBE_DATA" | "AI_ESTIMATE";
}

const IDEA_ACTIONS = [
  { icon: "📄", labelKey: "ideaCard.actionScriptWriter", href: "/script-writer" },
  { icon: "T", labelKey: "ideaCard.actionSeoTitles", href: "/seo-titles" },
  { icon: "🔍", labelKey: "ideaCard.actionKeywordResearch", href: "/keyword-research" },
  { icon: "🏷️", labelKey: "ideaCard.actionDescriptionTags", href: "/description-tags" },
  { icon: "🖼️", labelKey: "ideaCard.actionThumbnails", href: "/thumbnails" },
  { icon: "📱", labelKey: "ideaCard.actionMultiPlatformShorts", href: "/multi-platform-shorts" },
];

function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 50) return "#f97316";
  return "#f87171";
}

export function IdeaCard({ idea }: { idea: Idea }) {
  const setSelectedIdeaId = useWorkflowStore((state) => state.setSelectedIdeaId);
  const t = useT();

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="flex items-start justify-between">
        <span className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] font-bold text-fg">
          {idea.scoreSource === "REAL_YOUTUBE_DATA" ? t("ideaCard.realYoutubeData") : t("ideaCard.aiEstimate")}
        </span>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold"
          style={{ borderColor: scoreColor(idea.viralityScore), color: scoreColor(idea.viralityScore) }}
        >
          {idea.viralityScore}
        </div>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-fg">{idea.title}</h3>
      <p className="mt-1 text-xs text-fg-subtle">{idea.description}</p>
      <div className="mt-2 rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-fg-muted">
        <span className="font-semibold">{t("ideaCard.hookLabel")}</span> {idea.hook}
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-wide text-fg-faint">{t("ideaCard.useThisIdeaIn")}</p>
      <div className="mt-1 flex gap-2">
        {IDEA_ACTIONS.map((action) => (
          <a
            key={action.href}
            href={`${action.href}?ideaId=${idea.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={t(action.labelKey)}
            aria-label={t(action.labelKey)}
            onClick={() => setSelectedIdeaId(idea.id)}
            className="rounded-md border border-surface-border px-2 py-1 text-sm text-fg-muted hover:text-accent"
          >
            {action.icon}
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/idea-finder/page.tsx" src/components/idea-finder/IdeaCard.tsx
git commit -m "feat: translate Idea Finder page and IdeaCard"
```

---

## Task 9: Translate Script Writer Page + ScriptSectionCard

**Files:**
- Modify: `src/app/(app)/script-writer/page.tsx`
- Modify: `src/components/scripts/ScriptSectionCard.tsx`

- [ ] **Step 1: Update `src/app/(app)/script-writer/page.tsx`**

Add `useT()`. Replace:
- `"Script Writer"` → `t("scriptWriter.title")`
- `"Generate a structured video script with Hook, Intro, Main Content, CTA, and Ending."` → `t("scriptWriter.subtitle")`
- `"Loading..."` → `t("common.loading")`
- `placeholder="Video topic..."` → `t("scriptWriter.placeholderTopic")`
- The `TONES` button labels currently render the raw enum value (`{t}` inside the `.map`, i.e. literally `"ENGAGING"` etc.) — map each tone to its translation key: add a small `TONE_KEYS: Record<Script["tone"], string> = { ENGAGING: "scriptWriter.toneEngaging", EDUCATIONAL: "scriptWriter.toneEducational", STORYTELLING: "scriptWriter.toneStorytelling", FAST_PACED: "scriptWriter.toneFastPaced" }` and render `{t(TONE_KEYS[t_])}` (rename the loop variable from `t` to `toneValue` to avoid shadowing the `t()` translation function).
- `{isGenerating ? "Generating..." : "Generate Script"}` → `{isGenerating ? t("common.generating") : t("scriptWriter.generateButton")}`
- `"Failed to generate script. Please try again."` (both occurrences) → `t("scriptWriter.errorGenerateFailed")`
- `"Failed to save section. Please try again."` (both occurrences) → `t("scriptWriter.errorSaveFailed")`
- `"Failed to regenerate section. Please try again."` (both occurrences) → `t("scriptWriter.errorRegenerateFailed")`

- [ ] **Step 2: Update `src/components/scripts/ScriptSectionCard.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useTranslation";

export interface Script {
  id: string;
  ideaId: string | null;
  topic: string;
  tone: "ENGAGING" | "EDUCATIONAL" | "STORYTELLING" | "FAST_PACED";
  hook: string;
  intro: string;
  mainContent: string;
  cta: string;
  ending: string;
}

export type ScriptSectionKey = "hook" | "intro" | "mainContent" | "cta" | "ending";

const SECTION_LABEL_KEYS: Record<ScriptSectionKey, string> = {
  hook: "scriptSectionCard.sectionHook",
  intro: "scriptSectionCard.sectionIntro",
  mainContent: "scriptSectionCard.sectionMainContent",
  cta: "scriptSectionCard.sectionCta",
  ending: "scriptSectionCard.sectionEnding",
};

export function ScriptSectionCard({
  section,
  value,
  onSave,
  onRegenerate,
}: {
  section: ScriptSectionKey;
  value: string;
  onSave: (section: ScriptSectionKey, content: string) => void;
  onRegenerate: (section: ScriptSectionKey) => Promise<void>;
}) {
  const [text, setText] = useState(value);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const t = useT();

  useEffect(() => {
    setText(value);
  }, [value]);

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await onRegenerate(section);
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">{t(SECTION_LABEL_KEYS[section])}</h3>
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-fg-muted hover:text-accent disabled:opacity-50"
        >
          {isRegenerating ? t("common.regenerating") : t("common.regenerate")}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== value) {
            onSave(section, text);
          }
        }}
        rows={section === "mainContent" ? 8 : 3}
        className="mt-2 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
      />
    </div>
  );
}
```

- [ ] **Step 3: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/script-writer/page.tsx" src/components/scripts/ScriptSectionCard.tsx
git commit -m "feat: translate Script Writer page and ScriptSectionCard"
```

---

## Task 10: Translate SEO Titles Page

**Files:**
- Modify: `src/app/(app)/seo-titles/page.tsx`

- [ ] **Step 1: Update `src/app/(app)/seo-titles/page.tsx`**

Add `useT()`. Replace:
- `"SEO Titles &amp; Keyword Research"` → `t("seoTitles.title")`
- `"Generate high-CTR title variations and keyword research for your video."` → `t("seoTitles.subtitle")`
- `"Loading..."` → `t("common.loading")`
- `` `Topic: ${titleSet.topic}` `` → `` `${t("seoTitles.topicLabel")} ${titleSet.topic}` ``
- `{isRegenerating ? "Regenerating..." : "Regenerate"}` → `{isRegenerating ? t("common.regenerating") : t("common.regenerate")}`
- `"Keywords"` → `t("seoTitles.keywordsLabel")`
- `placeholder="Video topic..."` → `t("seoTitles.placeholderTopic")`
- `{isGenerating ? "Generating..." : "Research Titles"}` → `{isGenerating ? t("common.generating") : t("seoTitles.researchButton")}`
- `"Failed to generate titles. Please try again."` (both occurrences) → `t("seoTitles.errorGenerateFailed")`
- `"Failed to select title. Please try again."` (both occurrences) → `t("seoTitles.errorSelectFailed")`
- `"Failed to regenerate titles. Please try again."` (both occurrences) → `t("seoTitles.errorRegenerateFailed")`

This file was already touched in Task 4 for the `text-left` → `text-start` RTL fix — keep that
change intact while making these text replacements (don't revert it).

- [ ] **Step 2: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/seo-titles/page.tsx"
git commit -m "feat: translate SEO Titles page"
```

---

## Task 11: Translate Description & Tags Page + EditableChipList

**Files:**
- Modify: `src/app/(app)/description-tags/page.tsx`
- Modify: `src/components/descriptionTags/EditableChipList.tsx`
- Modify: `src/components/platformVariants/PlatformVariantCard.tsx` (its `EditableChipList` usage
  needs updating to match the new prop, done here since both call sites change together)

`EditableChipList` currently derives its own "Add {label}..." placeholder text from the `label`
prop via `${label.toLowerCase()}`, which doesn't translate correctly across languages (French,
Arabic word order/grammar differ). Change it to accept an explicit `placeholder` prop instead.

- [ ] **Step 1: Update `src/components/descriptionTags/EditableChipList.tsx`**

```tsx
"use client";

import { useState } from "react";

export function EditableChipList({
  label,
  chips,
  onSave,
  placeholder,
}: {
  label: string;
  chips: string[];
  onSave: (chips: string[]) => void;
  placeholder: string;
}) {
  const [localChips, setLocalChips] = useState(chips);
  const [draft, setDraft] = useState("");

  function removeChip(index: number) {
    const next = localChips.filter((_, i) => i !== index);
    setLocalChips(next);
    onSave(next);
  }

  function addChip() {
    const trimmed = draft.trim();
    if (!trimmed || localChips.includes(trimmed)) return;
    const next = [...localChips, trimmed];
    setLocalChips(next);
    onSave(next);
    setDraft("");
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-fg-faint">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {localChips.map((chip, index) => (
          <span
            key={index}
            className="flex items-center gap-1 rounded-full border border-surface-border bg-surface-raised px-3 py-1 text-xs text-fg-muted"
          >
            {chip}
            <button type="button" onClick={() => removeChip(index)} className="text-fg-faint hover:text-red-400">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChip();
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/app/(app)/description-tags/page.tsx`**

Add `useT()`. Replace:
- `"Description & Tags"` → `t("descriptionTags.title")`
- `"Generate a full metadata package: description, tags, hashtags, category, and a pinned-comment suggestion."` → `t("descriptionTags.subtitle")`
- `"Loading..."` → `t("common.loading")`
- `` `Topic: ${set.topic}` `` → `` `${t("descriptionTags.topicLabel")} ${set.topic}` ``
- `{isRegenerating ? "Regenerating..." : "Regenerate"}` → `{isRegenerating ? t("common.regenerating") : t("common.regenerate")}`
- `"Description"` label → `t("descriptionTags.descriptionLabel")`
- The `EditableChipList` for tags: add `label={t("descriptionTags.tagsLabel")}` (was `"Tags"`) and
  `` placeholder={`${t("editableChipList.addPrefix")} ${t("descriptionTags.tagsLabel").toLowerCase()}...`} ``
- The `EditableChipList` for hashtags: `label={t("descriptionTags.hashtagsLabel")}` (was
  `"Hashtags"`) and
  `` placeholder={`${t("editableChipList.addPrefix")} ${t("descriptionTags.hashtagsLabel").toLowerCase()}...`} ``
- `"Category"` label → `t("descriptionTags.categoryLabel")`
- `"Pinned Comment"` label → `t("descriptionTags.pinnedCommentLabel")`
- `placeholder="Video topic..."` → `t("descriptionTags.placeholderTopic")`
- `{isGenerating ? "Generating..." : "Generate Metadata"}` → `{isGenerating ? t("common.generating") : t("descriptionTags.generateButton")}`
- `"Failed to generate metadata. Please try again."` (both occurrences) → `t("descriptionTags.errorGenerateFailed")`
- `"Failed to save changes. Please try again."` (both occurrences) → `t("descriptionTags.errorSaveFailed")`
- `"Failed to regenerate metadata. Please try again."` (both occurrences) → `t("descriptionTags.errorRegenerateFailed")`

- [ ] **Step 3: Update `src/components/platformVariants/PlatformVariantCard.tsx`'s `EditableChipList` usage**

Read the current file (Task 13 will translate the rest of it) — for now, just add the new
required `placeholder` prop to its one `EditableChipList` call so the component still compiles:

```tsx
        <EditableChipList
          key={`hashtags-${revision}`}
          label="Hashtags"
          chips={variant.hashtags}
          onSave={(chips) => onSaveField(variant.id, "hashtags", chips)}
          placeholder="Add hashtags..."
        />
```

(This literal placeholder is replaced with a translated one in Task 13, which fully translates
this file — this step only exists so the codebase compiles between this task and that one.)

- [ ] **Step 4: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/description-tags/page.tsx" src/components/descriptionTags/EditableChipList.tsx src/components/platformVariants/PlatformVariantCard.tsx
git commit -m "feat: translate Description & Tags page, make EditableChipList placeholder explicit"
```

---

## Task 12: Translate Thumbnails Page + ThumbnailCard

**Files:**
- Modify: `src/app/(app)/thumbnails/page.tsx`
- Modify: `src/components/thumbnails/ThumbnailCard.tsx`

- [ ] **Step 1: Update `src/app/(app)/thumbnails/page.tsx`**

Add `useT()`. Replace:
- `"Thumbnail Studio"` → `t("thumbnails.title")`
- `"Generate and A/B test thumbnails for your video."` → `t("thumbnails.subtitle")`
- `placeholder="Describe the thumbnail you want..."` → `t("thumbnails.placeholderPrompt")`
- `"Single"` → `t("thumbnails.singleMode")`
- `"A/B Test (4 variations)"` → `t("thumbnails.abTestMode")`
- `{isGenerating ? "Generating..." : "Generate"}` → `{isGenerating ? t("common.generating") : t("thumbnails.generateButton")}`
- `"Checking for saved thumbnails..."` → `t("thumbnails.checkingForSaved")`
- `"Loading thumbnails..."` → `t("thumbnails.loadingThumbnails")`
- The error-concatenation line: `(data?.error ?? "Failed to generate thumbnails. Please try again.") + " Any thumbnails generated before the failure have been saved — reloading now."` → `` (data?.error ?? t("thumbnails.errorGenerateFailed")) + t("thumbnails.errorGenerateFailedPartialSuffix") ``
- `"Failed to generate thumbnails. Please try again. Reloading in case some were saved."` → `t("thumbnails.errorGenerateFailedReload")`

- [ ] **Step 2: Update `src/components/thumbnails/ThumbnailCard.tsx`**

```tsx
"use client";

import { useT } from "@/lib/i18n/useTranslation";

export interface Thumbnail {
  id: string;
  imageUrl: string;
  ctrEstimate: number;
  ctrSource: "HIGGSFIELD_PREDICTOR" | "AI_ESTIMATE";
}

function ctrColor(ctr: number): string {
  if (ctr >= 7) return "#4ade80";
  if (ctr >= 4) return "#f97316";
  return "#f87171";
}

export function ThumbnailCard({
  thumbnail,
  onSaveToDrive,
}: {
  thumbnail: Thumbnail;
  onSaveToDrive: (id: string) => void;
}) {
  const t = useT();

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
      <div className="relative aspect-video overflow-hidden rounded-md bg-surface">
        <img src={thumbnail.imageUrl} alt="Generated thumbnail" className="h-full w-full object-cover" />
        <span
          className="absolute end-2 top-2 rounded px-2 py-0.5 text-[10px] font-bold text-zinc-900"
          style={{ backgroundColor: ctrColor(thumbnail.ctrEstimate) }}
        >
          {t("thumbnailCard.ctrLabel")} {thumbnail.ctrEstimate}%
        </span>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-fg-faint">
        {thumbnail.ctrSource === "HIGGSFIELD_PREDICTOR" ? t("thumbnailCard.higgsfield") : t("thumbnailCard.aiEstimate")}
      </p>
      <div className="mt-2 flex gap-2">
        <a
          href={thumbnail.imageUrl}
          download
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-fg-muted hover:text-accent"
        >
          {t("thumbnailCard.download")}
        </a>
        <button
          onClick={() => onSaveToDrive(thumbnail.id)}
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-fg-muted hover:text-accent"
        >
          {t("thumbnailCard.saveToDrive")}
        </button>
      </div>
    </div>
  );
}
```

Note: `right-2` was already converted to `end-2` in Task 4 — this snippet reflects that; don't
revert it.

Also update the page's `saveToDrive` function's two message strings (in `page.tsx`, not
`ThumbnailCard.tsx`): `"Saved to Drive."` → `t("thumbnailCard.savedToDriveMessage")` and
`"Failed to save to Drive. Please try again."` (both occurrences) →
`t("thumbnailCard.failedToSaveToDriveMessage")`.

- [ ] **Step 3: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/thumbnails/page.tsx" src/components/thumbnails/ThumbnailCard.tsx
git commit -m "feat: translate Thumbnail Studio page and ThumbnailCard"
```

---

## Task 13: Translate Multi-Platform Shorts Page + PlatformVariantCard

**Files:**
- Modify: `src/app/(app)/multi-platform-shorts/page.tsx`
- Modify: `src/components/platformVariants/PlatformVariantCard.tsx`

- [ ] **Step 1: Update `src/app/(app)/multi-platform-shorts/page.tsx`**

Add `useT()`. Replace:
- `"Multi-Platform Shorts"` → `t("multiPlatformShorts.title")`
- The long subtitle string → `t("multiPlatformShorts.subtitle")`
- `"Loading..."` → `t("common.loading")`
- `placeholder="Video topic..."` → `t("multiPlatformShorts.placeholderTopic")`
- `{isGenerating ? "Generating..." : "Generate Shorts"}` → `{isGenerating ? t("common.generating") : t("multiPlatformShorts.generateButton")}`
- `"Failed to generate shorts. Please try again."` (both occurrences) → `t("multiPlatformShorts.errorGenerateFailed")`
- `"Failed to save changes. Please try again."` (both occurrences) → `t("multiPlatformShorts.errorSaveFailed")`
- `"Failed to regenerate this variant. Please try again."` (both occurrences) → `t("multiPlatformShorts.errorRegenerateFailed")`

- [ ] **Step 2: Update `src/components/platformVariants/PlatformVariantCard.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { EditableChipList } from "@/components/descriptionTags/EditableChipList";
import { useT } from "@/lib/i18n/useTranslation";

export interface PlatformVariant {
  id: string;
  platform: "TIKTOK" | "YOUTUBE_SHORTS" | "INSTAGRAM_REELS" | "FACEBOOK_REELS";
  hook: string;
  caption: string;
  hashtags: string[];
  coverImageUrl: string | null;
}

const PLATFORM_LABEL_KEYS: Record<PlatformVariant["platform"], string> = {
  TIKTOK: "platformVariantCard.platformTiktok",
  YOUTUBE_SHORTS: "platformVariantCard.platformYoutubeShorts",
  INSTAGRAM_REELS: "platformVariantCard.platformInstagramReels",
  FACEBOOK_REELS: "platformVariantCard.platformFacebookReels",
};

export function PlatformVariantCard({
  variant,
  onSaveField,
  onRegenerate,
}: {
  variant: PlatformVariant;
  onSaveField: (variantId: string, field: string, value: string | string[]) => void;
  onRegenerate: (variantId: string) => Promise<void>;
}) {
  const [hookDraft, setHookDraft] = useState(variant.hook);
  const [captionDraft, setCaptionDraft] = useState(variant.caption);
  const [revision, setRevision] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const t = useT();

  useEffect(() => {
    setHookDraft(variant.hook);
  }, [variant.hook]);

  useEffect(() => {
    setCaptionDraft(variant.caption);
  }, [variant.caption]);

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await onRegenerate(variant.id);
      setRevision((r) => r + 1);
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">{t(PLATFORM_LABEL_KEYS[variant.platform])}</h3>
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-fg-muted hover:text-accent disabled:opacity-50"
        >
          {isRegenerating ? t("common.regenerating") : t("common.regenerate")}
        </button>
      </div>

      {variant.platform === "INSTAGRAM_REELS" && variant.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={variant.coverImageUrl}
          alt="Instagram Reels cover"
          className="mt-3 h-32 w-full rounded-md object-cover"
        />
      )}

      <p className="mt-3 text-[10px] uppercase tracking-wide text-fg-faint">{t("platformVariantCard.hookLabel")}</p>
      <textarea
        value={hookDraft}
        onChange={(e) => setHookDraft(e.target.value)}
        onBlur={() => {
          if (hookDraft !== variant.hook) {
            onSaveField(variant.id, "hook", hookDraft);
          }
        }}
        rows={2}
        className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
      />

      <p className="mt-3 text-[10px] uppercase tracking-wide text-fg-faint">{t("platformVariantCard.captionLabel")}</p>
      <textarea
        value={captionDraft}
        onChange={(e) => setCaptionDraft(e.target.value)}
        onBlur={() => {
          if (captionDraft !== variant.caption) {
            onSaveField(variant.id, "caption", captionDraft);
          }
        }}
        rows={3}
        className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
      />

      <div className="mt-3">
        <EditableChipList
          key={`hashtags-${revision}`}
          label={t("platformVariantCard.hashtagsLabel")}
          chips={variant.hashtags}
          onSave={(chips) => onSaveField(variant.id, "hashtags", chips)}
          placeholder={`${t("editableChipList.addPrefix")} ${t("platformVariantCard.hashtagsLabel").toLowerCase()}...`}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/multi-platform-shorts/page.tsx" src/components/platformVariants/PlatformVariantCard.tsx
git commit -m "feat: translate Multi-Platform Shorts page and PlatformVariantCard"
```

---

## Task 14: Translate Projects Page

**Files:**
- Modify: `src/app/(app)/projects/page.tsx`

- [ ] **Step 1: Update `src/app/(app)/projects/page.tsx`**

Add `useT()`. Replace:
- `"Projects"` → `t("projects.title")`
- `"Manage the channels you generate content for."` → `t("projects.subtitle")`
- `"Active"` → `t("common.active")`
- `"Switch"` → `t("common.switchLabel")`
- `placeholder="New channel name"` → `t("projects.placeholderNewChannelName")`
- `"Create"` → `t("projects.createButton")`

- [ ] **Step 2: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/projects/page.tsx"
git commit -m "feat: translate Projects page"
```

---

## Task 15: Translate Settings Page

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Update `src/app/(app)/settings/page.tsx`**

Add `useT()`. Replace:
- `"Settings"` → `t("settings.title")`
- The API key notice paragraph → `t("settings.apiKeyNotice")`
- `"YouTube Data API Key"` → `t("settings.apiKeyLabel")`
- `placeholder="Enter to update — leave blank to keep current key"` → `t("settings.apiKeyPlaceholder")`
- `{showKey ? "Hide" : "Show"}` → `{showKey ? t("common.hide") : t("common.show")}`
- `"Target Country"` → `t("settings.targetCountryLabel")`
- Country `<option>`s: `"United States"` → `t("settings.countryUS")`, `"Morocco"` →
  `t("settings.countryMA")`, `"France"` → `t("settings.countryFR")`, `"United Kingdom"` →
  `t("settings.countryGB")`
- `"Target Language"` → `t("settings.targetLanguageLabel")`
- Language `<option>`s: `"English"` → `t("settings.languageEnglish")`, `"French"` →
  `t("settings.languageFrench")`, `"Arabic"` → `t("settings.languageArabic")`
- `{saved ? "Saved" : "Save Settings"}` → `{saved ? t("settings.savedButton") : t("settings.saveButton")}`

Note: this page's own language `<option>` values (`"en"`/`"fr"`/`"ar"`) are unaffected — only the
*visible text* of each option changes, not its underlying value.

- [ ] **Step 2: Run `npx tsc --noEmit` and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/settings/page.tsx"
git commit -m "feat: translate Settings page"
```

---

## Task 16: Final Verification

- [ ] **Step 1: Run the i18n unit test**

Run: `npx vitest run tests/unit/i18n.test.ts`
Expected: PASS.

- [ ] **Step 2: Run the full unit test suite**

Run: `npx vitest run tests/unit`
Expected: all test files pass, including `i18n.test.ts` alongside every prior phase's tests
(unaffected by this UI-only work).

- [ ] **Step 3: Run a full production build**

Run: `npm run build`
Expected: succeeds, all routes still listed.

- [ ] **Step 4: Run `npx tsc --noEmit` across the whole project**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 5: Grep for any remaining untranslated literal strings**

Run: `grep -rn '"Loading\.\.\."\|"Generating\.\.\."\|"Regenerating\.\.\."' src/app src/components --include="*.tsx"`
Expected: no matches — every occurrence should now be a `t("common....")` call, not a literal
string. (This is a spot-check, not exhaustive — it catches the 3 most commonly-missed strings
specifically, since they appear in nearly every page.)

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "chore: UI localization verification pass"
```

(Only run this if Steps 1-5 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** translation dictionary + `useT()` (Task 1), locale state + RTL `dir`
  switching (Task 2), language switcher immediate sync (Task 3), the 3 RTL class conversions
  (Task 4), every page (Tasks 6-15) and every shared component with user-facing text (Tasks 5, 8,
  9, 11, 12, 13) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO markers. `EditableChipList`'s prop-API change (Task 11) is a
  deliberate, explicit change (not a placeholder) needed because the old auto-derived-placeholder
  approach can't translate correctly across languages with different grammar/word order.
- **Type consistency:** `Locale` type (`"en" | "fr" | "ar"`, Task 2) is reused consistently in
  `useAppStore`, `LanguageSwitcher` (Task 3), and implicitly via `translations`' locale keys
  (Task 1) — no mismatched literal unions introduced anywhere.
- **Ordering dependency called out explicitly:** Task 1's `useTranslation.ts` references
  `useAppStore`'s `locale` field, which doesn't exist until Task 2 — the plan says so directly in
  Task 1 Step 4/5 rather than silently producing a broken intermediate commit. If executing
  strictly task-by-task, commit both together as Task 2's Step 6 does.
- **PlaceholderPage becoming a client component** (Task 5) and **Dashboard's server/client split**
  (Task 7) are both flagged as deliberate, explained consequences of adding `useT()` (which needs
  client-side Zustand access) to what were previously server-renderable pieces — not accidental
  scope creep.
- **Standing safety instruction:** the only test-running step in this plan (`i18n.test.ts`) has no
  live-database dependency, so there's no DB-connectivity caveat needed here, unlike prior plans'
  integration tests.
