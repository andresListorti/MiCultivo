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

**Deploying**: as of 2026-09-09 this repo has a GitHub remote
(`origin` → `https://github.com/andresListorti/MiCultivo.git`) with Vercel's
native Git integration connected — pushing to `main` triggers a production
deploy automatically (CI/CD). **Commit and push to deploy**; that's now the
normal path, not the Vercel MCP plugin's `deploy_to_vercel` tool (manual
full-file-tree upload), which was the only option before the GitHub link
existed and should be treated as a fallback only. The `deploy` npm script
(`vercel deploy --prod`) still won't work as-is — the local `vercel` CLI is
not logged in on this machine. If you change any file under `api/`, `src/`,
or `index.html`, it takes effect only after that commit is pushed to `main`;
editing local files alone does nothing to the live site.

**Local testing**: `npm run dev` (`vercel dev`) still doesn't work — the CLI
isn't logged in. Instead, `_local-dev.ts` (repo root, untracked/not
gitignored on purpose so it survives across sessions) does
`import app from './src/app'; app.listen(3000, ...)` plus `import
'dotenv/config'` so it picks up a local `.env` (gitignored) for secrets that
only exist as env vars in production, e.g. `BLOB_READ_WRITE_TOKEN` (see
"Photo uploads" below). Run with `npx tsx _local-dev.ts`, then open
`http://localhost:3000` — it's the real app against real Firestore/Storage,
not a mock. Kill-and-restart pattern on Windows since `tsx` doesn't hot
reload: `Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object
{ Stop-Process -Id $_.OwningProcess -Force }`, then relaunch. For one-off
scripted checks (hitting specific endpoints with `fetch`, minting a test ID
token via `authAdmin.createCustomToken` + the Identity Toolkit REST
exchange), write a throwaway script in the same style and delete it after.

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
(`admin.auth().verifyIdToken`) and sets `req.uid`.

### Each account has its own isolated data (`ownerId`)

Nacho and Pochi are **not** sharing one dataset — each `tents`, `plants`,
and `harvests` document has an `ownerId` field (the Firebase Auth uid), set
on creation and enforced on every read/write/delete:
- List endpoints (`GET /api/tents`, `/api/plants`, `/api/harvests`) filter
  by `where('ownerId', '==', req.uid)`.
- Detail/edit/delete endpoints fetch the doc first and check
  `doc.data().ownerId === req.uid`, returning **404** (not 403) if it
  belongs to someone else, so ownership isn't leaked.
- Creating a plant/harvest against a `tentId`/`plantId` that isn't your
  own is rejected with 400 (checked in `src/routes/plants.ts` POST/PUT and
  `src/routes/harvests.ts` POST).
- Waterings/photos (subcollections of a plant) don't carry their own
  `ownerId` — they inherit isolation from `requirePlantOwnership`, a
  middleware in `src/routes/plants.ts` mounted in front of both
  sub-routers, which 404s before the request ever reaches
  `waterings.ts`/`photos.ts` if the parent plant isn't yours.
- The `tents` list query deliberately does **not** use Firestore
  `.orderBy()` (sorting happens in JS after fetching) — combining a
  `where('ownerId', ...)` equality filter with an `orderBy` on a different
  field would require a composite index. Multiple *equality-only* filters
  (e.g. `ownerId` + `tentId`, `ownerId` + `plantId`) don't need one, which
  is why those are fine as-is. Keep this in mind before adding any new
  `orderBy` alongside a `where` — either add the composite index to
  `firestore.indexes.json` and `firebase deploy --only firestore:indexes`
  first, or sort in JS like the tents route does.

`scripts/migrateOwnership.ts` was a one-off migration (already run) that
stamped `ownerId` on all pre-existing docs, assigning them to Nacho — it's
kept in the repo for reference but shouldn't need to run again.

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
  photos — see "Photo uploads" below for how `url` gets populated).
- `harvests/{id}` — root collection (not a plant subcollection) with a
  `plantId` field, so the yield-analytics view can query/compare across
  plants without a Firestore collection-group query.
- Deleting a tent or plant cascades: deleting a tent unassigns (`tentId:
  null`) its plants and wipes its `environmentReadings`; deleting a plant
  wipes its `waterings` and `photos` subcollections
  (`src/lib/deleteCollection.ts`) **and** its Storage files (see below).
- `plants/{id}` also has `etapaDesde` (ISO date, stamped on create and
  re-stamped only when `etapa` actually changes via `PUT` — see the diff
  logic in `plants.ts`'s `PUT /:id`) and `fotoUrl` (cover photo, `null` until
  set). `tents/{id}` also has `luzSchedule` (`{preset, horasEncendido,
  horaInicio}` or `null` — see "Light schedule" below).

### Photo uploads (Vercel Blob, not Firebase Storage)

Firebase Storage was evaluated first (bucket name is even still sitting in
`index.html`'s `firebaseConfig`) but the project's Firebase plan is Spark
(free) and enabling Storage requires upgrading to Blaze (a linked billing
card) — the user explicitly ruled that out. **Vercel Blob** is what's
actually wired up instead: free on the Hobby plan (1GB storage / 10GB
transfer per month, no card), and the project's already on Vercel.

- `src/lib/storage.ts`: thin wrapper over `@vercel/blob`'s `put`/`del`/`list`.
  `uploadImageBuffer(path, buffer, mimetype)` uploads with `access: 'public',
  allowOverwrite: true` (overwrite matters for the cover photo, which always
  reuses the same path). `deleteBlobUrl`/`deleteBlobFolder` clean up on
  delete. Allowed mimetypes include `image/svg+xml` on purpose — the
  per-strain "default cover" illustrations (see below) are generated
  client-side and uploaded through this same path, not just real photos.
- `src/lib/upload.ts`: `multer` (memory storage, 4MB cap — Vercel's function
  body limit is ~4.5MB) plus an error handler that turns
  `LIMIT_FILE_SIZE` into a clean 400 instead of a 500.
- Storage path scheme: `plants/{plantId}/cover` (portada, one stable path,
  overwritten on re-upload — **this means the URL never changes**, so every
  place that renders `fotoUrl` as an `<img src>` must cache-bust it with
  `?v=<actualizadoEn>` — see `versionedFotoUrl()` in `index.html` — or the
  browser will keep showing the old cached image after a re-upload) and
  `plants/{plantId}/photos/{photoDocId}` (dated gallery, one object per
  doc). Deleting a plant wipes the whole `plants/{plantId}/` prefix via
  `deleteBlobFolder`.
- Endpoints: `POST /api/plants/:id/photo` (cover, multipart field `foto`) and
  `DELETE /api/plants/:id/photo` (clear cover); `POST
  /api/plants/:plantId/photos/upload` (gallery, multipart) alongside the
  original JSON-only `POST /api/plants/:plantId/photos` (kept for
  `scripts/seed.ts` and manual URL entries). All gated by the same
  `ownerId`/`requirePlantOwnership` checks as everything else.
- **Vercel project setup**: a Blob store must exist and be connected to the
  project (Vercel dashboard → project → Storage → Create Database → Blob →
  **must pick "Public" access at creation time — this cannot be changed
  later**; a first attempt here accidentally created a Private store, which
  rejects `access:'public'` uploads, and had to be deleted and recreated).
  Once connected, production/preview get `BLOB_STORE_ID` + a rotating OIDC
  token automatically — **no manual env var needed for the deployed app**.
  Local dev has no OIDC token, so it needs a static `BLOB_READ_WRITE_TOKEN`
  in `.env` (copy it from the store's own page → ".env.local" tab in the
  dashboard, not the project's general Environment Variables list, which
  only shows `BLOB_STORE_ID`/`BLOB_WEBHOOK_PUBLIC_KEY`).

### Growing recommendations (100% static, client-side, no AI)

`index.html` has `ETAPA_GUIDE` (generic care tips per `etapa`) and
`STRAIN_GUIDE` (~17 well-known strains with a rough flowering-week range and
notes, matched against the free-text `genetica` field via substring
matching in `findStrainGuide`). Both are hand-curated constants in the
script, not fetched from anywhere — deliberately, since real strain photos
would be a copyright problem and an AI call is unnecessary complexity for a
personal 2-user app. `getPlantRecommendation(plant)` combines the etapa tip
with the strain match and, if `etapa === 'Floración'` and `etapaDesde` is
set, an estimated days-remaining. Shown in the tent modal's plant list and
the plant detail view. Each strain also has a small original SVG
illustration (`strainIllustrationDataUri`, a two-leaflet mark on a
per-strain color, **not a real photo**) offered as a preselectable cover
photo when creating a plant with a recognized strain name.

### Light schedule (`luzSchedule` on `tents/{id}`)

A preset (`18/6`, `12/12`, `20/4`, `24/0`, or `personalizado` with a custom
hour count) plus a `horaInicio` (HH:MM, not required for `24/0`). Validated
and normalized server-side in `tents.ts` (`validateLuzSchedule`/
`normalizeLuzSchedule`). The client computes the actual on/off status
purely from these two numbers (`computeLuzEstado` in `index.html`, handles
wrapping past midnight) — there's no cron/scheduled job, it's just "is the
current wall-clock time inside the on-window" evaluated at render time, so
it's only ever as fresh as the last time that view re-rendered.

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

- "Próximos riegos sugeridos" on the dashboard is a static/hardcoded list,
  not computed from real watering history.
- Browser-history integration (`popstate`/`pushState` in `index.html`)
  covers the 4 main tab views + plant detail; it doesn't try to restore
  scroll position or reopen a modal (tent/plant edit, confirm dialog) that
  was open when the user navigated away.
