# Spreadsheet Governance Platform

A production-grade internal web app for Alambre Cables (a manufacturing company, ~25 employees) that turns spreadsheet-based operations into a governed, role-based system: controlled edits with an approval workflow, daily production/efficiency tracking per machine, machine downtime logging, and manager-facing reporting — all while staying in sync with the Excel/Google Sheets data the company already works from.

## Tech stack

- **Frontend**: React 19 (Create React App), Tailwind CSS, `lucide-react` icons, `recharts` for charts, `react-router-dom` v7, `react-hot-toast`. Installable PWA with offline queueing for production entries and web push notifications.
- **Backend**: Node.js / Express 5, Prisma ORM over PostgreSQL (Supabase). Supabase Auth for authentication; the app's own Express middleware (`authenticate`/`requireAdmin`) does authorization, not Row Level Security (RLS is a secondary defense layer — see `docs/SECURITY_AUDIT.md`).
- **Database**: Supabase PostgreSQL. Schema changes are hand-written SQL files in `database/migrations/`, applied manually via the Supabase SQL editor (not Prisma's own migration system) — `prisma/schema.prisma` is kept in sync with those migrations by hand.
- **Integrations**: Google Sheets API (`googleapis`) for optional two-way sync, `web-push` for push notifications, `xlsx` for Excel import/export.
- **Process management**: `pm2` in cluster mode for production (see `server/ecosystem.config.js`).

## Project layout

```
client/    React frontend (CRA)
server/    Express API + Prisma schema
database/  Hand-written SQL migrations, run manually against Supabase
scripts/   e2e-test.js — smoke test against a running deployment
docs/      API reference, security audit, environment variables, deployment checklist
```

## Running locally

Prerequisites: Node.js 18+, a Supabase project (or access to one), npm.

```bash
# 1. Server
cd server
npm install
cp .env.example .env   # fill in real values — see docs/ENVIRONMENT_VARIABLES.md
npx prisma generate
npm run dev             # nodemon, http://localhost:8000

# 2. Client (in a separate terminal)
cd client
npm install
cp .env.example .env   # fill in real values, or leave defaults for local dev
npm start                # http://localhost:3000
```

The database itself isn't created by any script here — run the files in `database/migrations/` (001 through the latest) against your Supabase project via its SQL editor, in order, before starting the server for the first time. See "First admin user" in `docs/DEPLOYMENT_CHECKLIST.md` for how to create the very first admin account (there's no signup flow — user creation itself requires an existing admin's token).

## Environment variables

Full reference (every variable, required vs. optional, defaults, examples) is in **`docs/ENVIRONMENT_VARIABLES.md`**. Copy `server/.env.example` → `server/.env` and `client/.env.example` → `client/.env` to get started; `server/src/config/validateEnv.js` will tell you at boot if anything required is missing.

## Running tests

```bash
# Server (Jest + Supertest)
cd server
npm test

# Client (React Testing Library)
cd client
CI=true npm test -- --watchAll=false
```

For an end-to-end smoke test against a running deployment (not just unit/integration tests), see `scripts/e2e-test.js`:

```bash
API_BASE_URL=https://your-deployment/api \
HEALTH_CHECK_API_KEY=same-value-as-the-servers-env-var \
E2E_ADMIN_EMAIL=admin@example.com \
E2E_ADMIN_PASSWORD=your-password \
node scripts/e2e-test.js
```

`HEALTH_CHECK_API_KEY` and `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` are each independently optional — whichever aren't set have their checks reported as SKIP rather than FAIL.

## Deploying

See **`docs/DEPLOYMENT_CHECKLIST.md`** for the full, current checklist (environment variables, Supabase configuration, database migrations, storage bucket setup, first admin creation, build/run, and post-deploy verification). In short:

1. Apply every file in `database/migrations/` against the production Supabase project (SQL editor, in order).
2. Set all required/recommended environment variables (server and client) — see `docs/ENVIRONMENT_VARIABLES.md`.
3. `cd client && npm ci && npm run build`; serve the `build/` output behind a real web server/CDN.
4. `cd server && npm ci && npx prisma generate`; run the API behind `pm2` (`npm run start:prod`) or an equivalent process manager, behind HTTPS.
5. Create the first admin account manually (see `docs/DEPLOYMENT_CHECKLIST.md` section 6).
6. Run the post-deploy verification checklist (`/api/health`, login, a test upload, log/rate-limit/CORS checks).

## Further reading

- `docs/API.md` — API reference
- `docs/SECURITY_AUDIT.md` — route-by-route auth review, findings, and fixes
- `docs/ENVIRONMENT_VARIABLES.md` — every environment variable, in full
- `docs/DEPLOYMENT_CHECKLIST.md` — the full pre/post-deploy checklist
- `CHANGELOG.md` — what was built in each phase
