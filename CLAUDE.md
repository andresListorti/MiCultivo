# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal cannabis grow-tracking app ("Mi Cultivo") for two users (Nacho and
Pochi). Backend: Node.js + Express + TypeScript, deployed as a single Vercel
serverless function. Database: Firebase Firestore, accessed only through the
Admin SDK server-side. Auth: Firebase Auth (email/password), exactly two
accounts, no roles/multi-tenancy. Frontend: one static `index.html` (vanilla
JS, Tailwind + Font Awesome + Firebase Auth compat SDK via CDN `<script>`
tags, no build step, no framework).

Live URL: https://mi-cultivo-app-andres-projects-cd4bd72c.vercel.app
Firebase project: `mi-cultivo-app` (console.firebase.google.com/project/mi-cultivo-app)

There are three unrelated mockup HTML files at the repo root
(`Mi_Cultivo_App (1).html`, `diseno-app-cultivo-v1.html`,
`diseno-app-cultivo-v2.html`) — these are earlier static design iterations,
not part of the running app. `index.html` is the only one actually served.

## Commands

```bash
npm install                       # install deps
npm run build                     # tsc --noEmit type-check (api/, src/, scripts/) — there is no test suite
npm run seed                      # tsx scripts/seed.ts — seeds 2 tents + 5 plants + waterings + harvests
npm run create-users               # tsx scripts/createUsers.ts — creates/resets Nacho & Pochi in Firebase Auth,
                                    # writes generated passwords to credenciales-generadas.txt (gitignored)
```

Both scripts (and any other local script that imports `src/firebaseAdmin.ts`)
need Firebase Admin credentials on disk: a `firebase-service-account.json`
file in the repo root (gitignored, download it from Firebase Console →
Project Settings → Service Accounts). There is no `GOOGLE_APPLICATION_CREDENTIALS`
setup — `src/firebaseAdmin.ts` looks for `FIREBASE_SERVICE_ACCOUNT` (env var,
JSON string — how Vercel production is configured) first, then falls back to
that local file.

**Deploying**: the `deploy` npm script (`vercel deploy --prod`) will not work
as-is — the local `vercel` CLI is not logged in on this machine. Actual
deploys so far were done via the Vercel MCP plugin's `deploy_to_vercel` tool
(uploads the full file tree, target `production`). There is no git remote
connected to Vercel and no CI/CD — every deploy is a manual full-tree upload.
If you change any file under `api/`, `src/`, or `index.html`, you must
redeploy for it to take effect; editing local files alone does nothing to
the live site.

**Local testing**: there's no wired-up local dev server (`npm run dev` runs
`vercel dev`, which also needs the CLI logged in). To sanity-check backend
changes before deploying, write a throwaway script that does
`import app from '../src/app'; app.listen(0, ...)` and hit it with `fetch`
(this is how earlier debugging was done — see git history for the pattern,
the scratch files were deleted afterward). Run with `npx tsx <script>.ts`.

## Architecture

### The API is one Express app, one Vercel function — routing is load-bearing

`src/app.ts` exports a single Express `app` with all routes mounted on it
(`/api/tents`, `/api/plants`, `/api/harvests`, and nested sub-routers for
`/api/plants/:plantId/waterings` and `/api/plants/:plantId/photos`).
`api/index.ts` just wraps that app as one Vercel Node function.

**Do not use a Vercel filename-based catch-all (`api/[...path].ts`) for
this.** That was the original setup and it silently only matched a single
path segment — `/api/tents` worked but `/api/tents/:id`,
`/api/plants/:id/waterings`, etc. 404'd at the Vercel edge before ever
reaching Express (very confusing: no server-side error, no log, just a
Vercel-branded 404 page). The fix, currently in place, is: a plain
`api/index.ts` (no dynamic filename) plus a `vercel.json` rewrite
(`"/api/(.*)"` → `"/api"`) that forwards every `/api/*` request to that one
function while Vercel preserves the original `req.url`, which Express then
routes internally. If API routes with path params start 404'ing again,
check `vercel.json`'s `rewrites` before anything else.

### The frontend is served BY Express, not as a static Vercel asset

Vercel's zero-config framework detection identifies this project as an
Express app and routes *everything* (including `/`) through the function —
it does not publish `index.html` as a static asset alongside it. So
`src/app.ts` reads `index.html` off disk at startup (`loadIndexHtml()`,
tries a few candidate paths) and serves it directly for `GET /` and, as an
SPA fallback, for any other non-`/api/*` GET request. The file is bundled
into the function via `vercel.json`'s `functions["api/index.ts"].includeFiles`.
If you ever see the frontend 404 or serve a stale/blank page in production,
this is the mechanism to check — not Vercel's static-file settings.

### Firestore is never touched from the browser

`firestore.rules` denies all direct client reads/writes. The frontend only
does two things: (1) Firebase Auth client SDK for login (`firebase.auth()`
in `index.html`), and (2) `fetch('/api/...')` calls with the Firebase ID
token as `Authorization: Bearer <token>`. Every `/api/tents`, `/api/plants`,
`/api/harvests` route is wrapped in `requireAuth` (`src/middleware/auth.ts`),
which verifies that token server-side via the Admin SDK
(`admin.auth().verifyIdToken`) — there are no per-route permission checks
beyond "is this one of the two accounts," since the whole dataset is shared
between Nacho and Pochi (no per-user scoping anywhere).

### Data model (Firestore)

- `tents/{id}` — a "carpa" (grow tent or space, e.g. also used for a
  secado/curado area). Has `nombre`, `dimensiones`, `tipoLuz`, `extraccion`,
  `notas`, and an `ambiente` field that's a *snapshot* of the latest
  environmental reading (temp/humedad/luzHoras/co2) — environment monitoring
  is per-tent, not global (this was a deliberate change from an earlier
  design). `GET /api/tents` returns every tent with its plants **already
  embedded** (`plants: [...]`, joined server-side by `tentId`) so the
  dashboard can render "grouped by carpa" in one round trip — don't add a
  second N+1 fetch for plants-per-tent, it's already there.
- `tents/{id}/environmentReadings/{id}` — history subcollection; each
  `POST /api/tents/:id/environment` both appends here and overwrites the
  parent tent's `ambiente` snapshot.
- `plants/{id}` — has `tentId` as a **plain foreign-key field, not a
  subcollection path**, specifically so a plant can move between tents
  over its life (vegetativo → floración → zona de secado) via a normal
  `PUT /api/plants/:id { tentId }`. `etapa` is constrained server-side to
  one of `Enraizado | Vegetativo | Floración | Secado | Curado`
  (`ETAPAS` array in `src/routes/plants.ts`).
- `plants/{id}/waterings/{id}` and `plants/{id}/photos/{id}` — true
  subcollections (fecha, producto/pH/EC for waterings; fecha/url/nota for
  photos — photo upload itself is not implemented, see below).
- `harvests/{id}` — root collection (not a plant subcollection) with a
  `plantId` field, so the yield-analytics view can query/compare across
  plants without a Firestore collection-group query.
- Deleting a tent or plant cascades: deleting a tent unassigns (`tentId:
  null`) its plants and wipes its `environmentReadings`; deleting a plant
  wipes its `waterings` and `photos` subcollections
  (`src/lib/deleteCollection.ts`).

### Auth accounts

Exactly two Firebase Auth users, created/reset via `scripts/createUsers.ts`
(random passwords, written to `credenciales-generadas.txt`, gitignored).
Their placeholder emails (`nacho@micultivo.app`, `pochi@micultivo.app`)
don't need to be real inboxes — Firebase Auth doesn't require deliverability
unless you call `sendEmailVerification`.

### Vercel project settings that aren't in code

- **Deployment Protection (Vercel Authentication) is manually disabled** in
  the Vercel dashboard for this project. If someone re-enables it, the
  public URL will start redirecting to a Vercel SSO page and look "down"
  from outside — that's the first thing to check, not the app code.
- `FIREBASE_SERVICE_ACCOUNT` env var is set in the Vercel project (all
  environments) with the full service-account JSON as its value.
- The Vercel MCP connection used for deploys has been scope-limited in
  practice: `get_deployment`, `get_deployment_build_logs`,
  `list_deployments`, `list_projects`, and `get_project_deployment_protection`
  have all 403'd with a team-scope re-auth error even after successful
  deploys, while `deploy_to_vercel` itself and
  `web_fetch_vercel_url`/direct `curl` against the live URL work fine. Don't
  assume you can introspect deploy status via those read-tools — verify by
  curling the deployment's own URL (returned by `deploy_to_vercel`) instead,
  and check its `<title>` (`"Deployment is building"` vs the real page)
  before trusting an HTTP 200.

## Known gaps (not bugs, just unfinished)

- No real photo upload: `POST /api/plants/:id/photos` only accepts an
  already-hosted `url` — there's no Storage upload wired up client-side.
- "Próximos riegos sugeridos" on the dashboard is a static/hardcoded list,
  not computed from real watering history.
