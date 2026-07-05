# Deployment Checklist

Use this before every production deploy of the Spreadsheet Governance Platform.

## 1. Environment variables (server)

`server/src/config/validateEnv.js` enforces these 6 at boot — the process exits with code 1 and a clear list of what's missing if any are absent:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`
- `SUPABASE_STORAGE_BUCKET`

Additional variables referenced elsewhere in the code (not boot-enforced, but required for those features to work):

- `PORT` — defaults to `8000` if unset.
- `NODE_ENV` — set to `production` in production (affects error responses, CORS defaults, Prisma logging verbosity).
- `CLIENT_URL` — must be the real deployed frontend origin; used as the CORS `origin`. Defaults to `http://localhost:3000` if unset — **do not leave this unset in production**, it will block the real frontend.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` — required only if Google Sheets sync is used. If left unset, `GET /api/google-sheets/service-account` and sync will return a "not configured" error rather than crashing.
- `JWT_SECRET` — present in the current `.env` but not referenced anywhere in `server/src`; Supabase Auth issues and validates all tokens. Safe to omit unless something is added later that needs it — don't assume it's load-bearing.

**Known issue to fix before copying `.env` to a new environment:** the current `server/.env` has `DATABASE_URL` listed twice. Only one value will actually take effect — clean this up so there's no ambiguity about which connection string is really in use.

Create a `server/.env.example` (none currently exists) listing all of the above with placeholder values and comments on which are required vs. optional, and make sure real secrets never get committed alongside it.

## 2. Environment variables (client)

- `REACT_APP_API_URL` — must point to the deployed backend's `/api` base (e.g. `https://api.yourdomain.com/api`). Defaults to `http://localhost:8000/api` if unset — will silently talk to localhost if forgotten.

React env vars are baked in at build time — set this **before** running `npm run build`, not just on the server.

## 3. Supabase configuration

- [ ] Confirm the Supabase project used is the intended production project (not a dev/staging project).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is only ever used server-side (`supabaseAdmin` in `server/src/config/supabase.js`) — confirm it is never exposed to the client bundle or logged.
- [ ] Review Supabase Auth settings: email confirmation policy, password requirements, session/JWT expiry (the app additionally enforces its own 8-hour client-side inactivity timeout on top of whatever Supabase issues).
- [ ] If Row Level Security (RLS) is enabled on any tables the app queries via `supabasePublic`, confirm policies match the app's own permission model — the app currently does its own authorization in Express middleware (`authenticate`/`requireAdmin`) rather than relying on RLS, so RLS misconfiguration could either needlessly block the service-role client or fail to add real protection for the anon client.
- [ ] Confirm `DATABASE_URL` (pooled, e.g. pgbouncer) and `DIRECT_URL` (direct connection, used by Prisma for migrations) point to the correct pooling vs. direct endpoints — using the pooled URL for migrations or the direct URL for the app's runtime connection are both common misconfigurations.

## 4. Database migrations

- [ ] Run `npx prisma migrate deploy` (not `migrate dev`) against the production database before starting the server.
- [ ] Run `npx prisma generate` as part of the build/deploy pipeline so the generated client matches `prisma/schema.prisma`.
- [ ] Confirm `database/seeds/001_seed_data.sql` (if it seeds required lookup data such as default roles) has been applied, or apply the equivalent through the app's own admin UI after first login.

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
- [ ] `node scripts/e2e-test.js` (from the repo root, with `API_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` set) against the staging/production URL as a final smoke test.
- [ ] Serve the client build behind a real web server/CDN; serve the API behind a process manager (pm2, systemd, or a container orchestrator) so it restarts on crash.
- [ ] Confirm `NODE_ENV=production` is set for the server process — this suppresses stack traces in error responses.
- [ ] Put the API behind HTTPS (TLS termination at a load balancer/reverse proxy) — tokens and passwords should never travel over plain HTTP.

## 8. Post-deploy verification

- [ ] `curl https://api.yourdomain.com/api/health` returns `{ "success": true, ... }`.
- [ ] Log in as the first admin through the real frontend URL.
- [ ] Upload a test spreadsheet and confirm it appears in Supabase Storage under `excel/`.
- [ ] Check server logs (morgan output) show real request traffic, not just `localhost` noise.
- [ ] Confirm rate limiting is active (`RateLimit-*` response headers present) and the CORS origin matches the real frontend domain (requests from any other origin should be rejected by the browser).
