# ArwaTube AI Engine — Local `.env` Setup Runbook

## Why this file exists

On 2026-07-24, the working `.env` used for live testing was lost. It had been created *inside*
a git worktree (`.claude/worktrees/vifatube-phase3-thumbnail-studio`) rather than the main repo
root. When that worktree was later removed via `ExitWorktree`/`git worktree remove` after its
branch was merged, the whole directory — including the gitignored, untracked `.env` — was
deleted with it. `.env` is intentionally never committed to git, so there was no other copy
anywhere (not in git history, not in a stash, not in Trash).

**Rule going forward: `.env` lives only in the main repo root**
(`/Users/mac/Documents/compamo7tawa/companymo7twa/.env`), never solely inside a worktree.
Task-implementation worktrees created for subagent-driven development deliberately do **not**
get a copy of `.env` — that is by design, to prevent the full test suite from ever running
against a live/shared database by accident (see the standing safety rule repeated in every
implementation plan since Phase 3a). Only the main repo checkout, used for manual/live testing,
should ever hold real credentials.

## What's needed and where each value comes from

Copy `.env.example` to `.env` in the main repo root, then fill in each value:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase project → Project Settings → Database → **Session pooler** connection string (port 5432, hostname like `aws-0-<region>.pooler.supabase.com`, username `postgres.<project-ref>`). **Do not use the Transaction pooler (port 6543)** — it hangs indefinitely on `prisma db push` (PgBouncer transaction-mode incompatibility). Do not use the direct-connection hostname (`db.xxxx.supabase.co`) — it's IPv6-only and unreachable from this sandbox. |
| `NEXTAUTH_URL` | `http://localhost:3001` (or whichever port the dev server actually binds — port 3000 is often occupied by an unrelated local process; check with `lsof -iTCP -sTCP:LISTEN -P`). Must exactly match a redirect URI registered in Google Cloud Console. |
| `NEXTAUTH_SECRET` | Generate fresh: `openssl rand -base64 32`. No need to match any external service — safe to regenerate anytime (only invalidates existing sessions). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application). Redirect URI must include `${NEXTAUTH_URL}/api/auth/callback/google`. Scope requested at login: `openid email profile https://www.googleapis.com/auth/drive.file`. |
| `APP_ENCRYPTION_KEY` | Generate fresh: `openssl rand -base64 32`. **Regenerating this invalidates any already-encrypted `googleAccessToken`/`googleRefreshToken`/`youtubeApiKey` rows in the DB** (they become undecryptable) — not destructive to core data (ideas/scripts/thumbnails survive), just forces affected users to reconnect Google / re-enter their YouTube API key. |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys. |
| `ANTHROPIC_MODEL` | Optional. Leave blank to use the code's built-in default. |
| `HIGGSFIELD_API_KEY_ID` / `HIGGSFIELD_API_KEY_SECRET` | Higgsfield dashboard → Developer/API settings. **This is a separate pay-as-you-go credit pool from the consumer app/MCP subscription** — funding one does not fund the other. Check Higgsfield's "Billing" page specifically for the API/Developer pool balance before expecting real image generation to succeed. |
| `HIGGSFIELD_API_BASE_URL` | Optional. Leave blank — defaults to `https://platform.higgsfield.ai` (not `api.higgsfield.ai`, which returns a Cloudflare 521). |
| `HIGGSFIELD_MODEL_ID` | Optional. Leave blank — defaults to `higgsfield-ai/soul/standard`, one of only two publicly documented REST API model_ids (the other is `reve/text-to-image`). Consumer-app model slugs like `flux_2` are **not** valid here. |

## After filling in `.env`

```bash
npx prisma generate
npx prisma db push   # only needed if the schema changed since the DB was last synced
npm run dev           # check the terminal output for which port it actually bound to
```

If port 3000 is occupied by an unrelated process, the dev server will pick another port
automatically (or fails — check `package.json`'s dev script / pass `-p <port>` explicitly).
Whatever port it lands on, `NEXTAUTH_URL` and the Google Cloud Console redirect URI must match it
exactly, or login will fail with "Access Denied".
