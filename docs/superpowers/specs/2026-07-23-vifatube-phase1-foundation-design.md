# VifaTube AI Engine — Phase 1: Foundation & Global State — Design

## Context

VifaTube AI Engine is a full-stack AI Creator Suite that helps video creators plan, write,
optimize, and repurpose long-form video concepts into multi-platform short-form content
(YouTube Shorts, TikTok, Instagram Reels, Facebook Reels).

The full product is decomposed into five phases, each with its own spec/plan/implementation
cycle:

1. **Foundation & Global State** (this document)
2. Idea Finder
3. Long-Form Suite & Higgsfield Integration (script, SEO titles, keyword research,
   description & tags, thumbnails/A-B testing)
4. Multi-Platform Repurposing Engine (YouTube Shorts, TikTok, IG Reels, FB Reels)
5. Content Matrix Exporter, One-Click Publish & Polish

This document covers **Phase 1 only**: the application shell, navigation, authentication,
data model, global state, and the Settings module. It also establishes shared service-layer
stubs (LLM, Higgsfield, Google Drive clients) that later phases will build on, so those
phases don't need to re-architect the plumbing.

## Reference Product

A comparable product ("TefaTube AI", hosted at a `*.higgsfield.app` domain) was used as UI/UX
inspiration for the sidebar structure and dashboard layout. Module names and navigation
groupings in this spec are informed by it but are not a verbatim copy — VifaTube AI Engine
has its own scope decisions (see "Modules Added Beyond Original Spec" below).

## Full Product Scope (for context — not all built in Phase 1)

- **Idea Finder**: topic/niche/audience → scored video concepts (color-coded Virality Score).
- **Long-Form Suite**: script generator (Hook/Intro/Main/CTA/Ending with tone selection),
  SEO title generator (10 titles + predicted CTR), Keyword Research, Description & Tags
  builder, Thumbnail Studio with A/B testing (4 variations via Higgsfield).
- **Multi-Platform Repurposing Engine**: adapts a long-form concept/script into
  platform-specific short-form assets for YouTube Shorts (<60s, SEO-focused, `#Shorts`),
  TikTok (15-30s, pattern-interrupt hook, trending hashtags), Instagram Reels
  (aesthetic/value-first hook, cover image prompt), and Facebook Reels (engagement-driven,
  broad-appeal). Includes Anti-Duplication/Anti-Shadowban logic: each platform gets a
  distinct hook (first 5 seconds) and tone, per this mapping:
  - TikTok: pattern-interrupts ("Stop doing X", "Nobody is talking about this...")
  - YouTube Shorts: value proposition + search keyword integration
  - Instagram: visually descriptive / curiosity-driven
  - Facebook: question-based / relatable scenario
- **Content Matrix Exporter**: dashboard of all generated assets for one idea (1 long +
  4 short), with Copy All / Export to Markdown-JSON / per-platform copy.
- **One-Click Publish**: real publish to YouTube via OAuth (primary platform); checklist +
  export/download fallback for TikTok/IG/FB, which lack accessible third-party publish APIs.

### Modules Added Beyond Original Spec (approved during brainstorming)

- **Keyword Research** — standalone module in the Long-Form Suite.
- **Description & Tags** — renamed/expanded version of the original "Metadata & Description
  Builder".
- **Projects** — multi-channel management (see Data Model). The original spec assumed a
  single implicit workspace; this was upgraded to full multi-project support.
- **One-Click Publish** — real YouTube publish, not just an export checklist (see above).

## Phase 1 Scope

Build the application shell and everything every other phase depends on:

- Project skeleton (Next.js App Router, TypeScript, Tailwind).
- Sidebar navigation and main layout, dark theme (Slate/Zinc palette) default.
- Authentication (Google OAuth only) with incremental scope requests.
- Core data model: `User`, `Project`, `ProjectSettings`.
- Global state (Zustand) for current project + project list, and a workflow-context store
  for passing state between modules in later phases (e.g. Idea Finder → Long-Form Suite).
- Settings page: YouTube Data API key (encrypted), target country, target language, Google
  Drive connection status.
- Projects page: create / rename / delete / switch between channels.
- Shared service-layer stubs: `lib/llm/`, `lib/higgsfield/`, `lib/drive/` — interfaces and
  client scaffolding only; no feature logic yet.
- Placeholder pages for all modules not yet built (Idea Finder, Script Writer, SEO Titles,
  Keyword Research, Description & Tags, Thumbnails & A/B Test, Multi-Platform Shorts,
  One-Click Publish), each showing a "Coming soon" state, reachable from the sidebar.

Out of scope for Phase 1 (deferred to later phases): any actual AI generation (ideas,
scripts, titles, thumbnails, video), the repurposing algorithm, publishing logic, and the
export/matrix dashboard.

## Architecture

- **Framework**: Next.js (App Router), full-stack — pages and API routes in one project.
- **Database**: PostgreSQL, accessed via Prisma ORM.
- **Auth**: NextAuth (Auth.js) with the Google provider only. Base scope requested at
  login is identity + `drive.file` (so Google Drive linking is available from day one
  without a second consent flow). The YouTube upload scope is requested later, in Phase 5,
  via incremental authorization — not at initial login — so users aren't asked to grant
  publish permissions before that feature exists.
- **Sessions**: database-backed NextAuth sessions (not JWT), since sensitive Google tokens
  are stored server-side and need to support revocation/invalidation.
- **State management**: Zustand for cross-module client state (chosen over React Context
  for ergonomics with state shared across distant routes/modules).
- **Deployment**: Docker container(s) deployed via Coolify on a Hostinger VPS (not Vercel).
- **File/media storage**: No persistent server-side storage of generated media. Generated
  images/video (Phase 3+) are streamed to the client for direct download. Users may
  optionally connect Google Drive (via the `drive.file` scope granted at login) to have
  generated assets saved to their own Drive instead of / in addition to downloading.
- **Secrets**: `DATABASE_URL` and all API keys/secrets live in `.env` (gitignored), with a
  committed `.env.example` listing required variable names without values.
- **Field-level encryption**: `ProjectSettings.youtubeApiKey` and the user's stored Google
  OAuth tokens are encrypted at the application layer (AES, key from `.env`) before being
  written to the database, in addition to normal DB access controls.

### Shared Service Layer (stubs only in Phase 1)

- `lib/llm/` — abstraction over the LLM provider. Default/primary provider is the Claude
  API (Anthropic), but the interface is provider-agnostic so a different provider could be
  swapped in later without touching call sites.
- `lib/higgsfield/` — client wrapper for the Higgsfield MCP/API (image and video
  generation), used starting Phase 3.
- `lib/drive/` — client for uploading generated assets to a user's linked Google Drive,
  used starting Phase 3+.

These are built as empty/interface-only modules in Phase 1 so later phases plug into an
established pattern rather than each inventing its own API-client structure.

## Data Model

```
User
  id, email, name, avatarUrl
  googleAccessToken (encrypted), googleRefreshToken (encrypted)
  createdAt

Project                      // = a channel
  id, userId (FK -> User)
  name
  isActive                   // last-opened project, restored on next login
  createdAt

ProjectSettings              // 1:1 with Project
  id, projectId (FK -> Project)
  youtubeApiKey (encrypted)
  targetCountry
  targetLanguage
```

Tables for Ideas, Scripts, SEO Titles, etc. are added in their respective phases, not here,
so Phase 1 stays scoped to the foundation.

## Auth Flow

1. User clicks "Login with Google". NextAuth runs the OAuth flow requesting identity +
   `drive.file` scopes.
2. On first login, a `User` row is created/updated and tokens are encrypted and stored.
3. If the user has no `Project` yet, a default one ("My First Channel") is created along
   with an empty `ProjectSettings` row.
4. Session is established via a database-backed NextAuth session.
5. YouTube publish scope is requested later (Phase 5) via incremental authorization when the
   user first uses One-Click Publish.

## UI / Navigation

- **Theme**: dark mode default, Slate/Zinc palette with one accent color (exact accent TBD
  in a later styling pass).
- **Layout**: fixed left sidebar + main content area + topbar (current page name, toast
  notification area).
- **Sidebar** (top to bottom): logo + app name, Project Switcher (dropdown), Dashboard,
  Idea Finder, Script Writer, SEO Titles, Keyword Research, Description & Tags, Thumbnails
  & A/B Test, Multi-Platform Shorts, One-Click Publish, Projects, and — set apart at the
  bottom — Settings.
- All module pages besides Dashboard/Settings/Projects are placeholders in Phase 1.

## State Management

- `useAppStore` (Zustand): `currentProject`, `projects[]`. Switching the active project
  persists `isActive` to the database so it's restored on the next session.
- A second store (`useWorkflowStore`, scaffolded but unused until Phase 2) will carry
  transient cross-module context, e.g. a selected Idea/Script passed from Idea Finder into
  the Long-Form Suite via an "Adapt to Shorts"-style action.

## Settings Page

- Switch current project / link to full Projects management page.
- YouTube Data API key input (show/hide toggle, encrypted on save).
- Target Country selector.
- Target Language selector.
- Info banner: without a YouTube API key, later phases fall back to heuristic AI-generated
  ideas (no real search-trend data) — this banner establishes the pattern Phase 2 will rely
  on.
- Google Drive connection status with Connect/Disconnect action (relevant if a user
  originally declined the Drive scope and wants to grant it later).

## Testing

- Unit tests for the Zustand store (project switching, settings updates).
- One integration test covering the auth flow: login → default project + settings created.
- No E2E tests in this phase.

## Explicitly Out of Scope (Phase 1)

- Any AI generation logic (ideas, scripts, SEO titles, keywords, thumbnails, video).
- The multi-platform repurposing/anti-duplication algorithm.
- One-Click Publish logic (only the OAuth scope strategy is decided here).
- Content Matrix Exporter.
- Final visual design/styling pass (colors, spacing polish) beyond "dark Slate/Zinc theme".
