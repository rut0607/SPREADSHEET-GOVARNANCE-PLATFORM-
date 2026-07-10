# Environment Variables

Every environment variable the app reads, gathered by grepping `process.env.*` across `client/src` and `server/src` and cross-checking against the actual `server/.env` / `client/.env` files in this environment.

## Server (`server/.env`)

| Variable | Description | Required | Default | Example |
|---|---|---|---|---|
| `SUPABASE_URL` | Supabase project URL. Used for both the admin and public Supabase clients. | **Required** | — | `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon/public key, used for the RLS-respecting `supabasePublic` client. | **Required** | — | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key, used for the `supabaseAdmin` client (full DB access, bypasses RLS). **Never** expose this to the frontend. | **Required** | — | `eyJhbGciOi...` |
| `DATABASE_URL` | Prisma's pooled Postgres connection string (via Supabase's connection pooler). | **Required** | — | `postgresql://...:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | Prisma's direct (non-pooled) Postgres connection string, used for migrations. | **Required** | — | `postgresql://...:5432/postgres` |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name used for uploaded Excel files. | **Required** | — | `spreadsheet-uploads` |
| `PORT` | Port the Express server listens on. | Optional | `8000` | `8000` |
| `NODE_ENV` | Standard Node environment flag; also gates production-only behavior (file-based access logging, `.env`-based CORS). | Optional | `development` | `production` |
| `CLIENT_URL` | The deployed frontend's origin, used as the CORS `origin`. **Must** be set correctly in production or the real frontend will be blocked. Private LAN IPs (192.168.x.x, 10.x.x.x, 172.16–31.x.x) are additionally trusted outside production for phone/tablet testing. | Optional (but see warning) | `http://localhost:3000` | `https://governance.alambrecables.com` |
| `HEALTH_CHECK_API_KEY` | Shared secret external uptime monitors send as `x-api-key` to `GET /api/health`. If unset, a random key is generated at boot and printed to the server log (won't survive a restart) — set this explicitly in production. | Optional | random, ephemeral | `a1b2c3...` (32+ random hex chars) |
| `DEFAULT_EFFICIENCY_THRESHOLD` | Fallback minimum OE% used whenever a worksheet/process has no explicit `efficiency_thresholds` row. Shared by `productionController`, `machineController`, and `weeklyReportService` via `server/src/config/constants.js`. | Optional | `85.00` | `85` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google service account email for Sheets API access (admins share a Sheet with this address). | Optional (required only for Google Sheets integration) | — | `sheets-sync@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Google service account private key (PEM). Keep this secret; never log or return it in any response. | Optional (required only for Google Sheets integration) | — | `-----BEGIN PRIVATE KEY-----\n...` |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key. If unset (along with `VAPID_PRIVATE_KEY`), a fresh ephemeral keypair is generated at boot — push subscriptions won't survive a restart in that case. | Optional (recommended to set) | ephemeral, generated at boot | `BExxxx...` |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key. Keep secret. | Optional (recommended to set) | ephemeral, generated at boot | `xxxx...` |
| `VAPID_EMAIL` | Contact address required by the Web Push spec (`mailto:` URI), so push services can reach the sender if a subscription is abused. | Optional | `mailto:admin@alambre.com` | `mailto:ops@alambrecables.com` |
| `NODE_APP_INSTANCE` | Set automatically by PM2 in cluster mode (see `ecosystem.config.js`, 2 instances) — **not** something to set manually. Used to ensure cron/interval-driven services (scheduled sync, alert polling) only run on worker `0`, not once per worker. | Set by PM2, not manual | — | `0` |

### Present in `.env` but not currently read by any source file

- `JWT_SECRET` — set in `server/.env` but never referenced in `server/src`. Authentication is handled entirely by Supabase Auth (`supabaseAdmin.auth.getUser(token)` validates the bearer token against Supabase directly), so there is no local JWT-verification code path that would consume this. Left in place rather than deleted, since it's live environment configuration, not something this audit should remove unilaterally — flagged here as a candidate to confirm-and-remove.

## Client (`client/.env`, must be prefixed `REACT_APP_` to be embedded in the build)

| Variable | Description | Required | Default | Example |
|---|---|---|---|---|
| `REACT_APP_API_URL` | Backend API base URL. Only trusted when the page itself was loaded from `localhost`/`127.0.0.1` — see `client/src/services/api.js`'s comment for why (LAN/phone testing derives the API host from `window.location.hostname` instead, so a stale `localhost` value in this var never breaks phone testing). | Optional | derived from `window.location` at `:{REACT_APP_API_PORT}/api` | `https://api.alambrecables.com/api` |
| `REACT_APP_API_PORT` | Port used when deriving the API URL from the page's own hostname (LAN testing, or when `REACT_APP_API_URL` isn't trusted). Added in this hardening pass so the fallback port doesn't have to be hardcoded — keep in sync with the server's `PORT`. | Optional | `8000` | `8000` |

### Present in `.env` but not currently read by any source file

- `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_SUPABASE_URL` — set in `client/.env`, and `@supabase/supabase-js` is a listed dependency in `client/package.json`, but neither the env vars nor the package are imported anywhere in `client/src`. All Supabase access currently goes through the backend API, not a direct client-side Supabase connection. Flagged here and in the final cleanup summary as unused — likely leftover from initial scaffolding, kept as-is pending confirmation rather than removed.

## Notes on the `85` threshold specifically

The task brief called out `85` as a hardcoded value to check. It appears in two independent forms that are **intentionally different** and were not merged:

1. **Server-side default threshold** (`DEFAULT_EFFICIENCY_THRESHOLD`, documented above) — the fallback minimum OE% for alerting/status when no admin-configured threshold exists for a worksheet/process. Now a single constant, overridable via env var.
2. **Client-side fixed OE color bands** (green `>85`, yellow `75–85`, red `<75`) — a distinct, deliberately fixed visual convention used in several employee-facing widgets (efficiency rings, dashboard cards) that is **not** meant to track the admin-configurable per-process threshold; it's a general "how are we doing" color scale. Consolidated into `client/src/constants/thresholds.js` in this pass (see the frontend audit section) so the same three numbers aren't retyped in every component, but deliberately kept as a separate constant from the server's configurable default rather than merged into one "the" threshold — they answer different questions (configurable pass/fail target vs. fixed visual color scale).
