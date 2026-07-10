# Deployment Checklist

Use this before every production deploy of the Spreadsheet Governance Platform.

## 1. Environment variables (server)

Full reference for every variable (required/optional, defaults, examples) lives in `docs/ENVIRONMENT_VARIABLES.md` — this section is just the deploy-time highlights. Copy `server/.env.example` to `server/.env` and fill in real values.

`server/src/config/validateEnv.js` enforces these 6 at boot — the process exits with code 1 and a clear list of what's missing if any are absent:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`
- `SUPABASE_STORAGE_BUCKET`

Additional variables worth double-checking before a production deploy:

- `PORT` — defaults to `8000` if unset.
- `NODE_ENV` — set to `production` in production (affects error responses, CORS defaults, Prisma logging verbosity).
- `CLIENT_URL` — must be the real deployed frontend origin; used as the CORS `origin`. Defaults to `http://localhost:3000` if unset — **do not leave this unset in production**, it will block the real frontend.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` — required only if Google Sheets sync is used. If left unset, `GET /api/google-sheets/service-account` and sync will return a "not configured" error rather than crashing.
- `HEALTH_CHECK_API_KEY` — set explicitly for production so external uptime monitors have a stable key; if left unset, one is generated at boot and lost on every restart.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` — set explicitly so push subscriptions survive a server restart; otherwise ephemeral keys are generated each boot.
- `DEFAULT_EFFICIENCY_THRESHOLD` — optional, defaults to `85`; only needed if the plant-wide default target OE% should differ from 85%.
- `JWT_SECRET` — present in `.env` but not referenced anywhere in `server/src`; Supabase Auth issues and validates all tokens. Safe to omit — don't assume it's load-bearing.

## 2. Environment variables (client)

Copy `client/.env.example` to `client/.env` and fill in real values.

- `REACT_APP_API_URL` — must point to the deployed backend's `/api` base (e.g. `https://api.yourdomain.com/api`). Only trusted when the page is loaded from localhost — otherwise the API host is derived from the page's own hostname (see `client/src/services/api.js`), so this mainly matters for the production build.
- `REACT_APP_API_PORT` — port used when deriving the API URL from the page's own hostname. Defaults to `8000`; keep in sync with the server's `PORT`.
- `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` — present in `.env` but currently unused by any code in `client/src` (no direct Supabase client-side usage exists yet). Safe to leave unset.

React env vars are baked in at build time — set these **before** running `npm run build`, not just on the server.

## 3. Supabase configuration

- [ ] Confirm the Supabase project used is the intended production project (not a dev/staging project).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is only ever used server-side (`supabaseAdmin` in `server/src/config/supabase.js`) — confirm it is never exposed to the client bundle or logged.
- [ ] Review Supabase Auth settings: email confirmation policy, password requirements, session/JWT expiry (the app additionally enforces its own 8-hour client-side inactivity timeout on top of whatever Supabase issues).
- [ ] If Row Level Security (RLS) is enabled on any tables the app queries via `supabasePublic`, confirm policies match the app's own permission model — the app currently does its own authorization in Express middleware (`authenticate`/`requireAdmin`) rather than relying on RLS, so RLS misconfiguration could either needlessly block the service-role client or fail to add real protection for the anon client. See `docs/SECURITY_AUDIT.md` for the full route-by-route auth review, and make sure migration `006_rls_policy_fixes.sql` (below) has been applied.
- [ ] Confirm `DATABASE_URL` (pooled, e.g. pgbouncer) and `DIRECT_URL` (direct connection, used by Prisma for migrations) point to the correct pooling vs. direct endpoints — using the pooled URL for migrations or the direct URL for the app's runtime connection are both common misconfigurations.

## 4. Database migrations

- [ ] Run every file in `database/migrations/` in order (001 through 006 as of this writing) against the production database via the Supabase SQL editor — these are plain SQL files, not Prisma migrations, so `prisma migrate deploy` does not apply them.
- [ ] Run `npx prisma generate` as part of the build/deploy pipeline so the generated client matches `prisma/schema.prisma`.
- [ ] Confirm `database/seeds/001_seed_data.sql` (if it seeds required lookup data such as default roles) has been applied, or apply the equivalent through the app's own admin UI after first login.
- [ ] Specifically confirm `006_rls_policy_fixes.sql` has been applied — it fixes a gap where `approval_requests` had RLS enabled but no policies defined (see `docs/SECURITY_AUDIT.md`).

## 5. Storage bucket setup

- [ ] Create the Supabase Storage bucket referenced by `SUPABASE_STORAGE_BUCKET` before first use — the app does not auto-create it.
- [ ] Uploaded Excel files are stored under an `excel/` prefix inside the bucket; confirm the bucket's access policy allows the service-role key to `upload`/`list` (private bucket is fine — all storage access goes through `supabaseAdmin` server-side, never directly from the browser).
- [ ] Set a reasonable bucket size/quota alert — `GET /api/system/storage` (System Health page) reports total bytes used, so this is easy to monitor after launch.

## 6. First admin user

There is no signup flow — `POST /api/users` (the only way to create a user) itself requires an existing admin's token, so the very first admin must be created manually:

1. Create the user in Supabase Auth (Dashboard → Authentication → Add user, or via the Admin API) with the desired email/password. Note the generated user `id` (UUID).
2. Insert a matching row into `user_profiles` with that same `id`, setting `is_admin = true` and `is_active = true`:
   ```sql
   insert into user_profiles (id, full_name, email, is_admin, is_active)
   values ('<supabase-auth-user-id>', 'Initial Admin', 'admin@yourdomain.com', true, true);
   ```
3. Log in through the app with that account and confirm the admin sidebar/dashboard appears.
4. Immediately create any additional real admin accounts through `POST /api/users` (via the Users page UI) rather than repeating the manual SQL step.

## 7. Build & run

- [ ] `cd client && npm ci && npm run build` — verify it completes with no errors (warnings from pre-existing unused imports are expected and non-blocking).
- [ ] `cd server && npm ci` — verify a clean install.
- [ ] `npm test` in `server/` — confirm the Jest suite passes before deploying.
- [ ] `CI=true npm test -- --watchAll=false` in `client/` — confirm the React Testing Library suite passes before deploying.
- [ ] `node scripts/e2e-test.js` (from the repo root, with `API_BASE_URL`, `HEALTH_CHECK_API_KEY`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` set) against the staging/production URL as a final smoke test — checks for credentials you don't provide are skipped rather than failed, but provide all of them here for a real signal.
- [ ] Serve the client build behind a real web server/CDN; serve the API behind a process manager (pm2, systemd, or a container orchestrator) so it restarts on crash.
- [ ] Confirm `NODE_ENV=production` is set for the server process — this suppresses stack traces in error responses.
- [ ] Put the API behind HTTPS (TLS termination at a load balancer/reverse proxy) — tokens and passwords should never travel over plain HTTP.

## 8. Post-deploy verification

- [ ] `curl https://api.yourdomain.com/api/health` returns `{ "success": true, ... }`.
- [ ] Log in as the first admin through the real frontend URL.
- [ ] Upload a test spreadsheet and confirm it appears in Supabase Storage under `excel/`.
- [ ] Check server logs (`server/src/middleware/requestLogger.js` output — method, path, status, response time, user ID, IP) show real request traffic, not just `localhost` noise, and that each request produces exactly **one** log line (morgan was removed; requestLogger is now the only logger, so a duplicate line here would mean something regressed).
- [ ] Confirm rate limiting is active (`RateLimit-*` response headers present) and the CORS origin matches the real frontend domain (requests from any other origin should be rejected by the browser).
