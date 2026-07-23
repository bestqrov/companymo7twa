# VifaTube AI Engine — Phase 1: Foundation & Global State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the VifaTube AI Engine application shell: Next.js project skeleton, Postgres/Prisma data model, Google-only auth with encrypted token storage, Zustand global state, dark-themed sidebar layout with placeholder module pages, a working Settings page and Projects page, and interface-only stubs for the LLM/Higgsfield/Drive service layers that later phases will implement.

**Architecture:** Next.js App Router (TypeScript) full-stack app. PostgreSQL via Prisma is the single source of truth for `User`, `Project`, `ProjectSettings`, plus the standard NextAuth `Account`/`Session`/`VerificationToken` tables. NextAuth (Google provider only, database sessions) handles login; on first sign-in a default `Project` + `ProjectSettings` row is created and the user's Google tokens are AES-encrypted and copied onto `User` for later use (Drive uploads, future YouTube publish). Zustand (`useAppStore`) holds the active project + project list client-side; a second store (`useWorkflowStore`) is scaffolded for later cross-module handoff. The app shell (sidebar + topbar) wraps every authenticated route; unbuilt modules render a shared `PlaceholderPage` component. Deployment target is Docker via Coolify on a Hostinger VPS.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, PostgreSQL, Prisma, NextAuth v4 (`next-auth` + `@next-auth/prisma-adapter`), Zustand, Vitest (unit + integration tests), Docker.

---

## File Structure

```
.env.example
.gitignore
package.json
tsconfig.json
next.config.mjs
tailwind.config.ts
postcss.config.js
vitest.config.ts
Dockerfile
.dockerignore
docker-compose.yml

prisma/
  schema.prisma

src/
  app/
    layout.tsx
    globals.css
    page.tsx
    login/
      page.tsx
    api/
      auth/
        [...nextauth]/route.ts
    (app)/
      layout.tsx
      dashboard/page.tsx
      idea-finder/page.tsx
      script-writer/page.tsx
      seo-titles/page.tsx
      keyword-research/page.tsx
      description-tags/page.tsx
      thumbnails/page.tsx
      multi-platform-shorts/page.tsx
      one-click-publish/page.tsx
      projects/page.tsx
      settings/page.tsx
  components/
    layout/
      Sidebar.tsx
      SidebarNavItem.tsx
      ProjectSwitcher.tsx
      Topbar.tsx
    ui/
      PlaceholderPage.tsx
  lib/
    prisma.ts
    crypto.ts
    auth.ts
    llm/index.ts
    higgsfield/index.ts
    drive/index.ts
  server/
    projects.ts
  store/
    useAppStore.ts
    useWorkflowStore.ts
  types/
    next-auth.d.ts

tests/
  unit/
    crypto.test.ts
    useAppStore.test.ts
  integration/
    projects.test.ts
```

- `lib/` holds framework-agnostic utilities and service-layer clients (importable from both server components and API routes).
- `server/projects.ts` holds the default-project-creation logic used by the NextAuth callback, kept separate from `lib/auth.ts` so it's independently testable without mocking NextAuth.
- `store/` holds only Zustand stores — no business logic, so they stay trivial to reason about.
- Placeholder pages are thin (a few lines each) because all the shared rendering lives in `components/ui/PlaceholderPage.tsx`.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "vifatube-ai-engine",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "next": "14.2.15",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "next-auth": "4.24.7",
    "@next-auth/prisma-adapter": "1.0.7",
    "@prisma/client": "5.19.1",
    "zustand": "4.5.5"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "@types/node": "20.14.15",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "prisma": "5.19.1",
    "tailwindcss": "3.4.10",
    "postcss": "8.4.41",
    "autoprefixer": "10.4.20",
    "vitest": "2.0.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

export default nextConfig;
```

`output: "standalone"` produces a minimal `.next/standalone` build, which the Dockerfile in Task 9 relies on.

- [ ] **Step 4: Create `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#18181b", // zinc-900
          raised: "#27272a", // zinc-800
          border: "#3f3f46", // zinc-700
        },
        accent: {
          DEFAULT: "#a3e635", // lime-400
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create `postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
.next/
.env
.env.local
*.log
dist/
```

- [ ] **Step 7: Create `.env.example`**

```
DATABASE_URL="postgresql://user:password@localhost:5432/vifatube?schema=public"

NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# 32-byte key (base64) used for AES-256-GCM encryption of secrets at rest.
# Generate with: openssl rand -base64 32
APP_ENCRYPTION_KEY=""
```

- [ ] **Step 8: Create `src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body {
  @apply bg-surface text-zinc-100;
}
```

- [ ] **Step 9: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VifaTube AI Engine",
  description: "AI Creator Suite for planning, writing, and repurposing video content.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Create `src/app/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
```

`/dashboard` is behind the `(app)` layout's auth guard (Task 6), so unauthenticated users land back on `/login`.

- [ ] **Step 11: Install dependencies and verify the app boots**

Run: `npm install && npm run build`
Expected: build fails only on missing `/dashboard` route (not yet created) — confirms the scaffold compiles. If it fails on config/syntax errors, fix those before continuing.

- [ ] **Step 12: Commit**

```bash
git add package.json tsconfig.json next.config.mjs tailwind.config.ts postcss.config.js .gitignore .env.example src/app/globals.css src/app/layout.tsx src/app/page.tsx
git commit -m "chore: scaffold Next.js project with Tailwind dark theme"
```

---

## Task 2: Prisma Schema & Client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`

- [ ] **Step 1: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  avatarUrl     String?
  emailVerified DateTime?

  // AES-256-GCM encrypted (see src/lib/crypto.ts). Populated from the Google
  // OAuth `account` payload during sign-in (see src/lib/auth.ts).
  googleAccessToken  String?
  googleRefreshToken String?

  accounts Account[]
  sessions Session[]
  projects Project[]

  createdAt DateTime @default(now())
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

model Project {
  id       String  @id @default(cuid())
  userId   String
  name     String
  isActive Boolean @default(false)

  user     User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  settings ProjectSettings?

  createdAt DateTime @default(now())
}

model ProjectSettings {
  id        String  @id @default(cuid())
  projectId String  @unique
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // AES-256-GCM encrypted (see src/lib/crypto.ts).
  youtubeApiKey String?

  targetCountry  String?
  targetLanguage String?
}
```

- [ ] **Step 2: Create `src/lib/prisma.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

The global cache prevents Next.js dev-mode hot reload from opening a new Postgres connection pool on every file save.

- [ ] **Step 3: Generate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma src/lib/prisma.ts
git commit -m "feat: add Prisma schema (User, Account, Session, Project, ProjectSettings)"
```

---

## Task 3: Encryption Utility

**Files:**
- Create: `src/lib/crypto.ts`
- Test: `tests/unit/crypto.test.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/crypto.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

beforeAll(() => {
  // 32-byte key, base64-encoded — matches the format documented in .env.example.
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("encrypt/decrypt", () => {
  it("round-trips a plaintext string", () => {
    const plaintext = "AIzaSyD-example-youtube-api-key";
    const ciphertext = encrypt(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext on repeated calls", () => {
    const plaintext = "same-input";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/crypto.test.ts`
Expected: FAIL — `Cannot find module '@/lib/crypto'`

- [ ] **Step 4: Write minimal implementation**

```ts
// src/lib/crypto.ts
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("APP_ENCRYPTION_KEY is not set");
  }
  const buffer = Buffer.from(key, "base64");
  if (buffer.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return buffer;
}

/** Encrypts a UTF-8 string. Output format: base64(iv):base64(authTag):base64(ciphertext) */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/crypto.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/lib/crypto.ts tests/unit/crypto.test.ts
git commit -m "feat: add AES-256-GCM encrypt/decrypt helpers with tests"
```

---

## Task 4: Default Project Creation Logic

**Files:**
- Create: `src/server/projects.ts`
- Test: `tests/integration/projects.test.ts`

This is the core "login creates a default project" behavior called out in the spec. It's extracted from the NextAuth callback (Task 5) so it can be tested directly against a real database without mocking OAuth.

- [ ] **Step 1: Write the failing test**

Requires a running Postgres reachable via `DATABASE_URL` (see Task 9's `docker-compose.yml`, or any local Postgres) with migrations applied.

```ts
// tests/integration/projects.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureDefaultProject } from "@/server/projects";

describe("ensureDefaultProject", () => {
  beforeEach(async () => {
    await prisma.projectSettings.deleteMany();
    await prisma.project.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a default project and empty settings for a new user", async () => {
    const user = await prisma.user.create({
      data: { email: "creator@example.com", name: "Creator" },
    });

    await ensureDefaultProject(user.id);

    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      include: { settings: true },
    });

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("My First Channel");
    expect(projects[0].isActive).toBe(true);
    expect(projects[0].settings).not.toBeNull();
  });

  it("does not create a second project if one already exists", async () => {
    const user = await prisma.user.create({
      data: { email: "creator2@example.com", name: "Creator Two" },
    });

    await ensureDefaultProject(user.id);
    await ensureDefaultProject(user.id);

    const projects = await prisma.project.findMany({ where: { userId: user.id } });
    expect(projects).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/projects.test.ts`
Expected: FAIL — `Cannot find module '@/server/projects'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/projects.ts
import { prisma } from "@/lib/prisma";

const DEFAULT_PROJECT_NAME = "My First Channel";

/**
 * Ensures a user has at least one Project. Called from the NextAuth signIn
 * callback on every login; a no-op after the first successful call per user.
 */
export async function ensureDefaultProject(userId: string): Promise<void> {
  const existing = await prisma.project.findFirst({ where: { userId } });
  if (existing) {
    return;
  }

  await prisma.project.create({
    data: {
      userId,
      name: DEFAULT_PROJECT_NAME,
      isActive: true,
      settings: { create: {} },
    },
  });
}

export async function getUserProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    include: { settings: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function setActiveProject(userId: string, projectId: string): Promise<void> {
  await prisma.$transaction([
    prisma.project.updateMany({ where: { userId }, data: { isActive: false } }),
    prisma.project.update({ where: { id: projectId }, data: { isActive: true } }),
  ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/projects.test.ts`
Expected: PASS (2 tests). If it fails with a connection error, confirm `DATABASE_URL` is set and `npx prisma migrate dev` has been run against it.

- [ ] **Step 5: Commit**

```bash
git add src/server/projects.ts tests/integration/projects.test.ts
git commit -m "feat: add default-project creation and project query helpers"
```

---

## Task 5: NextAuth Configuration (Google-only, Database Sessions, Encrypted Tokens)

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/types/next-auth.d.ts`

- [ ] **Step 1: Create `src/lib/auth.ts`**

```ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { ensureDefaultProject } from "@/server/projects";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // drive.file: only files this app creates/opens — sufficient for
          // saving generated assets, and requested up front so users don't
          // hit a second consent screen the first time they use it.
          // YouTube upload scope is requested later (Phase 5) via
          // incremental authorization, not here.
          scope: "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.access_token) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            googleAccessToken: encrypt(account.access_token),
            googleRefreshToken: account.refresh_token ? encrypt(account.refresh_token) : undefined,
          },
        });
      }

      await ensureDefaultProject(user.id);

      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
```

- [ ] **Step 2: Create `src/app/api/auth/[...nextauth]/route.ts`**

```ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

- [ ] **Step 3: Create `src/types/next-auth.d.ts`**

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
```

This augments the built-in `Session` type so `session.user.id` (set in the callback above) type-checks everywhere it's read.

- [ ] **Step 4: Type-check the project**

Run: `npx tsc --noEmit`
Expected: no errors referencing `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, or `src/types/next-auth.d.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/[...nextauth]/route.ts src/types/next-auth.d.ts
git commit -m "feat: configure NextAuth with Google provider, database sessions, encrypted tokens"
```

---

## Task 6: Login Page

**Files:**
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: Create `src/app/login/page.tsx`**

```tsx
"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-accent">VifaTube AI Engine</h1>
        <p className="mt-2 text-zinc-400">Plan, write, and repurpose your video content with AI.</p>
      </div>
      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="rounded-md bg-accent px-6 py-3 font-medium text-zinc-900 hover:opacity-90"
      >
        Continue with Google
      </button>
    </div>
  );
}
```

`signIn` is client-side NextAuth's helper, so this page must be a client component (`"use client"`).

- [ ] **Step 2: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: add login page with Google sign-in"
```

---

## Task 7: Zustand Stores

**Files:**
- Create: `src/store/useAppStore.ts`
- Create: `src/store/useWorkflowStore.ts`
- Test: `tests/unit/useAppStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/useAppStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store/useAppStore";

const sampleProjects = [
  { id: "p1", name: "My First Channel", isActive: true },
  { id: "p2", name: "Side Channel", isActive: false },
];

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.setState({ projects: [], currentProject: null });
  });

  it("sets projects and derives currentProject from the active one", () => {
    useAppStore.getState().setProjects(sampleProjects);

    expect(useAppStore.getState().projects).toHaveLength(2);
    expect(useAppStore.getState().currentProject?.id).toBe("p1");
  });

  it("switches the current project", () => {
    useAppStore.getState().setProjects(sampleProjects);
    useAppStore.getState().switchProject("p2");

    expect(useAppStore.getState().currentProject?.id).toBe("p2");
    expect(useAppStore.getState().projects.find((p) => p.id === "p2")?.isActive).toBe(true);
    expect(useAppStore.getState().projects.find((p) => p.id === "p1")?.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/useAppStore.test.ts`
Expected: FAIL — `Cannot find module '@/store/useAppStore'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/store/useAppStore.ts
import { create } from "zustand";

export interface ProjectSummary {
  id: string;
  name: string;
  isActive: boolean;
}

interface AppState {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  setProjects: (projects: ProjectSummary[]) => void;
  switchProject: (projectId: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  currentProject: null,

  setProjects: (projects) => {
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
}));
```

Persisting the switch to the database (`setActiveProject` from Task 4) is wired up from the `ProjectSwitcher` component in Task 10, not inside the store — the store stays pure client state.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/useAppStore.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Create `src/store/useWorkflowStore.ts`**

```ts
// src/store/useWorkflowStore.ts
import { create } from "zustand";

/**
 * Scaffolded for Phase 2+: carries a selected idea/script across modules,
 * e.g. Idea Finder's "Adapt for Shorts" populating the Repurposing Engine.
 * Unused until a later phase defines its first payload shape.
 */
interface WorkflowState {
  selectedIdeaId: string | null;
  setSelectedIdeaId: (id: string | null) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  selectedIdeaId: null,
  setSelectedIdeaId: (id) => set({ selectedIdeaId: id }),
}));
```

- [ ] **Step 6: Commit**

```bash
git add src/store/useAppStore.ts src/store/useWorkflowStore.ts tests/unit/useAppStore.test.ts
git commit -m "feat: add Zustand stores for active project and cross-module workflow state"
```

---

## Task 8: App Shell — Sidebar, Topbar, Auth-Guarded Layout

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/SidebarNavItem.tsx`
- Create: `src/components/layout/ProjectSwitcher.tsx`
- Create: `src/components/layout/Topbar.tsx`
- Create: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create `src/components/layout/SidebarNavItem.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarNavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`block rounded-md px-3 py-2 text-sm ${
        isActive ? "bg-surface-raised text-accent" : "text-zinc-300 hover:bg-surface-raised"
      }`}
    >
      {label}
    </Link>
  );
}
```

- [ ] **Step 2: Create `src/components/layout/ProjectSwitcher.tsx`**

```tsx
"use client";

import { useAppStore } from "@/store/useAppStore";

async function persistActiveProject(projectId: string) {
  await fetch("/api/projects/active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
}

export function ProjectSwitcher() {
  const { projects, currentProject, switchProject } = useAppStore();

  if (projects.length === 0) {
    return null;
  }

  return (
    <select
      value={currentProject?.id ?? ""}
      onChange={(e) => {
        switchProject(e.target.value);
        void persistActiveProject(e.target.value);
      }}
      className="w-full rounded-md border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-zinc-100"
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

The `/api/projects/active` route is created in Task 10 alongside the Projects page — the switcher only needs the contract (`POST { projectId }`), not the route's internals.

- [ ] **Step 3: Create `src/components/layout/Sidebar.tsx`**

```tsx
import { SidebarNavItem } from "./SidebarNavItem";
import { ProjectSwitcher } from "./ProjectSwitcher";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/idea-finder", label: "Idea Finder" },
  { href: "/script-writer", label: "Script Writer" },
  { href: "/seo-titles", label: "SEO Titles" },
  { href: "/keyword-research", label: "Keyword Research" },
  { href: "/description-tags", label: "Description & Tags" },
  { href: "/thumbnails", label: "Thumbnails & A/B Test" },
  { href: "/multi-platform-shorts", label: "Multi-Platform Shorts" },
  { href: "/one-click-publish", label: "One-Click Publish" },
  { href: "/projects", label: "Projects" },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-surface-border bg-surface p-4">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-accent">VifaTube AI</h1>
      </div>
      <div className="mb-4">
        <ProjectSwitcher />
      </div>
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>
      <div className="mt-4 border-t border-surface-border pt-4">
        <SidebarNavItem href="/settings" label="Settings" />
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Create `src/components/layout/Topbar.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";

function titleFromPath(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  return segment
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function Topbar() {
  const pathname = usePathname();

  return (
    <header className="flex h-14 items-center border-b border-surface-border bg-surface px-6">
      <h2 className="text-sm font-medium text-zinc-300">{titleFromPath(pathname)}</h2>
    </header>
  );
}
```

Toast notifications are not implemented in Phase 1 (no generation actions exist yet to trigger them) — this header is the anchor point later phases will extend.

- [ ] **Step 5: Create `src/app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

Every route under `src/app/(app)/` inherits this guard automatically — individual pages don't need their own auth checks.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout src/app/\(app\)/layout.tsx
git commit -m "feat: add auth-guarded app shell with sidebar and topbar"
```

---

## Task 9: Placeholder Pages & Dashboard

**Files:**
- Create: `src/components/ui/PlaceholderPage.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/app/(app)/idea-finder/page.tsx`
- Create: `src/app/(app)/script-writer/page.tsx`
- Create: `src/app/(app)/seo-titles/page.tsx`
- Create: `src/app/(app)/keyword-research/page.tsx`
- Create: `src/app/(app)/description-tags/page.tsx`
- Create: `src/app/(app)/thumbnails/page.tsx`
- Create: `src/app/(app)/multi-platform-shorts/page.tsx`
- Create: `src/app/(app)/one-click-publish/page.tsx`

- [ ] **Step 1: Create `src/components/ui/PlaceholderPage.tsx`**

```tsx
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-surface-border py-24 text-center">
      <h2 className="text-xl font-semibold text-zinc-200">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">
        Coming soon — this module ships in {phase}.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create each placeholder page**

```tsx
// src/app/(app)/idea-finder/page.tsx
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function IdeaFinderPage() {
  return <PlaceholderPage title="Idea Finder" phase="Phase 2" />;
}
```

```tsx
// src/app/(app)/script-writer/page.tsx
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function ScriptWriterPage() {
  return <PlaceholderPage title="Script Writer" phase="Phase 3" />;
}
```

```tsx
// src/app/(app)/seo-titles/page.tsx
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function SeoTitlesPage() {
  return <PlaceholderPage title="SEO Titles" phase="Phase 3" />;
}
```

```tsx
// src/app/(app)/keyword-research/page.tsx
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function KeywordResearchPage() {
  return <PlaceholderPage title="Keyword Research" phase="Phase 3" />;
}
```

```tsx
// src/app/(app)/description-tags/page.tsx
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function DescriptionTagsPage() {
  return <PlaceholderPage title="Description & Tags" phase="Phase 3" />;
}
```

```tsx
// src/app/(app)/thumbnails/page.tsx
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function ThumbnailsPage() {
  return <PlaceholderPage title="Thumbnails & A/B Test" phase="Phase 3" />;
}
```

```tsx
// src/app/(app)/multi-platform-shorts/page.tsx
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function MultiPlatformShortsPage() {
  return <PlaceholderPage title="Multi-Platform Shorts" phase="Phase 4" />;
}
```

```tsx
// src/app/(app)/one-click-publish/page.tsx
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function OneClickPublishPage() {
  return <PlaceholderPage title="One-Click Publish" phase="Phase 5" />;
}
```

- [ ] **Step 3: Create `src/app/(app)/dashboard/page.tsx`**

```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserProjects } from "@/server/projects";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const projects = session?.user?.id ? await getUserProjects(session.user.id) : [];
  const activeProject = projects.find((p) => p.isActive);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Analytics Dashboard</p>
      <h1 className="mt-1 text-3xl font-bold text-zinc-100">{activeProject?.name ?? "My First Channel"}</h1>
      <p className="mt-2 max-w-xl text-zinc-400">
        A live snapshot of everything VifaTube AI has generated for this project will appear here
        once Idea Finder and the Long-Form Suite ship.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Build the project to catch any type errors across the new routes**

Run: `npm run build`
Expected: build succeeds; all ten routes under `(app)/` listed in the output.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/PlaceholderPage.tsx "src/app/(app)/dashboard" "src/app/(app)/idea-finder" "src/app/(app)/script-writer" "src/app/(app)/seo-titles" "src/app/(app)/keyword-research" "src/app/(app)/description-tags" "src/app/(app)/thumbnails" "src/app/(app)/multi-platform-shorts" "src/app/(app)/one-click-publish"
git commit -m "feat: add dashboard and placeholder pages for unbuilt modules"
```

---

## Task 10: Projects Page + Active-Project API Route

**Files:**
- Create: `src/app/(app)/projects/page.tsx`
- Create: `src/app/api/projects/active/route.ts`
- Create: `src/app/api/projects/route.ts`

- [ ] **Step 1: Create `src/app/api/projects/route.ts`** (list + create)

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserProjects } from "@/server/projects";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await getUserProjects(session.user.id);
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await request.json();
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: { userId: session.user.id, name: name.trim(), settings: { create: {} } },
  });

  return NextResponse.json({ project }, { status: 201 });
}
```

- [ ] **Step 2: Create `src/app/api/projects/active/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { setActiveProject } from "@/server/projects";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await request.json();
  if (typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  await setActiveProject(session.user.id, projectId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create `src/app/(app)/projects/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export default function ProjectsPage() {
  const { projects, setProjects, switchProject } = useAppStore();
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data.projects.map((p: { id: string; name: string; isActive: boolean }) => p)));
  }, [setProjects]);

  async function createProject() {
    if (!newName.trim()) return;
    setIsCreating(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    setProjects([...projects, { ...data.project, isActive: false }]);
    setNewName("");
    setIsCreating(false);
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-zinc-100">Projects</h1>
      <p className="mt-1 text-sm text-zinc-400">Manage the channels you generate content for.</p>

      <ul className="mt-6 space-y-2">
        {projects.map((project) => (
          <li
            key={project.id}
            className="flex items-center justify-between rounded-md border border-surface-border bg-surface-raised px-4 py-3"
          >
            <span className="text-zinc-200">{project.name}</span>
            {project.isActive ? (
              <span className="text-xs font-medium text-accent">Active</span>
            ) : (
              <button
                onClick={() => switchProject(project.id)}
                className="text-xs text-zinc-400 hover:text-accent"
              >
                Switch
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New channel name"
          className="flex-1 rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <button
          onClick={createProject}
          disabled={isCreating}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build to verify the new routes compile**

Run: `npm run build`
Expected: build succeeds, `/projects`, `/api/projects`, `/api/projects/active` listed among the routes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects "src/app/(app)/projects"
git commit -m "feat: add Projects page with create/switch and backing API routes"
```

---

## Task 11: Settings Page

**Files:**
- Create: `src/app/(app)/settings/page.tsx`
- Create: `src/app/api/settings/route.ts`

- [ ] **Step 1: Create `src/app/api/settings/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, youtubeApiKey, targetCountry, targetLanguage } = await request.json();
  if (typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await prisma.projectSettings.update({
    where: { projectId },
    data: {
      ...(youtubeApiKey ? { youtubeApiKey: encrypt(youtubeApiKey) } : {}),
      targetCountry,
      targetLanguage,
    },
  });

  return NextResponse.json({ ok: true });
}
```

The key is only re-encrypted and saved when the user submits a non-empty value — an empty field on save means "leave unchanged," not "clear the key."

- [ ] **Step 2: Create `src/app/(app)/settings/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export default function SettingsPage() {
  const { currentProject } = useAppStore();
  const [youtubeApiKey, setYoutubeApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [targetCountry, setTargetCountry] = useState("US");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!currentProject) return;
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: currentProject.id, youtubeApiKey, targetCountry, targetLanguage }),
    });
    setYoutubeApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>

      <div className="rounded-md border border-surface-border bg-surface-raised p-4 text-sm text-zinc-400">
        Without a YouTube API key, Idea Finder falls back to heuristic AI-generated ideas instead of
        real search-trend data.
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300">YouTube Data API Key</label>
        <div className="mt-1 flex gap-2">
          <input
            type={showKey ? "text" : "password"}
            value={youtubeApiKey}
            onChange={(e) => setYoutubeApiKey(e.target.value)}
            placeholder="Enter to update — leave blank to keep current key"
            className="flex-1 rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-100"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="rounded-md border border-surface-border px-3 text-sm text-zinc-300"
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300">Target Country</label>
          <select
            value={targetCountry}
            onChange={(e) => setTargetCountry(e.target.value)}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-100"
          >
            <option value="US">United States</option>
            <option value="MA">Morocco</option>
            <option value="FR">France</option>
            <option value="GB">United Kingdom</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300">Target Language</label>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-100"
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="ar">Arabic</option>
          </select>
        </div>
      </div>

      <button
        onClick={save}
        disabled={!currentProject}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
      >
        {saved ? "Saved" : "Save Settings"}
      </button>
    </div>
  );
}
```

Google Drive connect/disconnect is not implemented in this page yet: connecting always happens at login (Task 5 requests `drive.file` up front), so there's no "connect" action to wire until a user can decline it — deferred to Phase 3 when Drive upload is first used and disconnect becomes meaningful.

- [ ] **Step 3: Build to verify the new routes compile**

Run: `npm run build`
Expected: build succeeds, `/settings` and `/api/settings` listed among the routes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/settings" src/app/api/settings
git commit -m "feat: add Settings page for YouTube API key, country, and language"
```

---

## Task 12: Shared Service-Layer Stubs

**Files:**
- Create: `src/lib/llm/index.ts`
- Create: `src/lib/higgsfield/index.ts`
- Create: `src/lib/drive/index.ts`

These establish the interface every later phase implements against, so Phase 2+ plans plug into an existing shape rather than inventing their own.

- [ ] **Step 1: Create `src/lib/llm/index.ts`**

```ts
/**
 * Provider-agnostic text generation interface. Phase 3 implements this
 * against the Claude API; a different provider can be swapped in later
 * without changing call sites.
 */
export interface LlmClient {
  generateText(prompt: string): Promise<string>;
}

export function getLlmClient(): LlmClient {
  throw new Error("LLM client not yet implemented — see Phase 3 plan");
}
```

- [ ] **Step 2: Create `src/lib/higgsfield/index.ts`**

```ts
/**
 * Client wrapper for the Higgsfield MCP/API (image and video generation).
 * Implemented starting Phase 3 (Thumbnail Studio / A-B testing).
 */
export interface HiggsfieldClient {
  generateImage(prompt: string): Promise<{ url: string }>;
  generateVideo(prompt: string): Promise<{ url: string }>;
}

export function getHiggsfieldClient(): HiggsfieldClient {
  throw new Error("Higgsfield client not yet implemented — see Phase 3 plan");
}
```

- [ ] **Step 3: Create `src/lib/drive/index.ts`**

```ts
/**
 * Uploads generated assets to a user's linked Google Drive using the
 * `drive.file` token captured at login (see src/lib/auth.ts). Implemented
 * starting Phase 3.
 */
export interface DriveClient {
  uploadFile(params: { name: string; mimeType: string; data: Buffer }): Promise<{ fileId: string }>;
}

export function getDriveClient(accessToken: string): DriveClient {
  throw new Error("Drive client not yet implemented — see Phase 3 plan");
}
```

- [ ] **Step 4: Type-check the project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm src/lib/higgsfield src/lib/drive
git commit -m "feat: add interface-only stubs for LLM, Higgsfield, and Drive service layers"
```

---

## Task 13: Docker & Coolify Deployment Files

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["node", "server.js"]
```

Relies on `output: "standalone"` set in `next.config.mjs` (Task 1), which bundles only the files `server.js` needs at runtime — the final image doesn't carry the full `node_modules`.

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
.next
.env
.env.local
.git
```

- [ ] **Step 3: Create `docker-compose.yml`** (local Postgres for development/testing)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: vifatube
    ports:
      - "5432:5432"
    volumes:
      - vifatube_postgres_data:/var/lib/postgresql/data

volumes:
  vifatube_postgres_data:
```

The app container itself is not defined here — on Coolify, the app is deployed directly from the `Dockerfile` with `DATABASE_URL` pointed at Coolify's managed Postgres service. `docker-compose.yml` is purely a local convenience for `npm run dev` / running tests against a real Postgres instance.

- [ ] **Step 4: Verify the Docker image builds**

Run: `docker build -t vifatube-ai-engine .`
Expected: image builds successfully (this requires `DATABASE_URL` to at least be a syntactically valid Postgres URL at build time for `prisma generate`, but no live DB connection is needed at build time).

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml
git commit -m "chore: add Docker build and local Postgres compose file for Coolify deployment"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (`crypto.test.ts`, `useAppStore.test.ts`, `projects.test.ts`).

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: build succeeds with all routes listed (`/`, `/login`, `/dashboard`, `/idea-finder`, `/script-writer`, `/seo-titles`, `/keyword-research`, `/description-tags`, `/thumbnails`, `/multi-platform-shorts`, `/one-click-publish`, `/projects`, `/settings`, plus the `/api/*` routes).

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: redirected to `/login`; "Continue with Google" visible. (Full OAuth round-trip requires real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env` — verifying the redirect and button render is sufficient here since Phase 1's automated tests already cover the default-project logic.)

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: Phase 1 foundation verification pass"
```

(Only run this if Steps 1-3 required fixes. If everything passed cleanly, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** every Phase 1 spec item has a task — project skeleton (Task 1), data model (Task 2), encryption (Task 3), default-project-on-login (Task 4), NextAuth + incremental-scope strategy (Task 5), sidebar/layout/theme (Task 8), placeholder pages (Task 9), Projects page (Task 10), Settings page (Task 11), service-layer stubs (Task 12), Docker/Coolify (Task 13). `useWorkflowStore` scaffolding is in Task 7 per spec ("scaffolded but unused until Phase 2").
- **Placeholder scan:** no TBD/TODO markers; the one deliberately deferred item (Drive connect/disconnect UI) is called out explicitly in Task 11 with the reason it's deferred, not left vague.
- **Type consistency:** `ProjectSummary` (store) fields (`id`, `name`, `isActive`) match what `getUserProjects`/`/api/projects` return and what `ProjectSwitcher`/Projects page consume. `ensureDefaultProject`, `getUserProjects`, `setActiveProject` signatures are defined once in Task 4 and used identically in Tasks 5, 9, 10.
