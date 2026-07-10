# Security Audit — Spreadsheet Governance Platform

Audit date: 2026-07-09 (production readiness pass, Phase 4 audit).

## Authentication model

- `authenticate` (`server/src/middleware/auth.js`) validates the `Authorization: Bearer <token>` header against Supabase Auth (`supabaseAdmin.auth.getUser(token)`), then loads the matching `user_profiles` row (rejecting disabled accounts with 403). It sets `req.user` to the full profile (including `is_admin` and `role`).
- `requireAdmin` checks `req.user.is_admin` and must always be used **after** `authenticate` in a route's middleware chain (it does nothing on its own).
- All request bodies, query params, and route params pass through `sanitizeInput` (XSS-escapes string values, explicitly skipping password/token fields) before reaching any route handler.

## Route inventory

### Public routes (no `authenticate`)

| Route | Why it's safe to be public |
|---|---|
| `POST /api/auth/login` | Credential submission endpoint; rate-limited to 10 attempts / 15 min per IP. |
| `POST /api/auth/refresh` | Takes a refresh token (not an access token) in the body; validated by Supabase Auth itself. |
| `POST /api/auth/reset-password` | Password-reset request; must be reachable by logged-out users. |
| `GET /api/push/vapid-key` | Returns only the VAPID **public** key (`getVapidPublicKey()`), which is safe and meant to be public — it's the standard Web Push subscription key, not a secret. Verified this endpoint never touches `VAPID_PRIVATE_KEY`. |
| `GET /api/health` (conditionally) | See below — accepts either a monitoring API key or an admin session, never fully open. |

`GET /api/health` is a special case: it accepts **either** an `x-api-key` header matching `HEALTH_CHECK_API_KEY` (for external uptime monitors that can't hold a user session) **or** a valid admin JWT (for the in-app System Health page), composed manually in `index.js` as `authenticate(req, res, () => requireAdmin(req, res, respond))`. Verified working correctly against the live server in this pass (see Verification section) — it is never reachable without one of those two credentials.

### Authenticated routes (any logged-in user)

All routes below require `authenticate`; several additionally restrict results to the caller's own data at the controller level (noted) rather than the route level:

- `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/roles` — read-only, non-sensitive role list.
- `GET /api/spreadsheets`, `GET /api/spreadsheets/:id`, `GET /api/spreadsheets/worksheet/:worksheetId/data` — **intentionally** open to all employees, not scoped per-user. This matches the platform's design: any employee can view spreadsheet data (permission gating happens at the column/field level elsewhere, and edit access is separately gated by `permission` records). See RLS review (`docs`/migration 006) for the database-level equivalent of this same intentional design decision.
- `PUT /api/spreadsheets/row/:rowId` — any authenticated user can attempt a direct edit; there is no row-level ownership restriction by design (any employee with UI access can propose edits, subject to the approval workflow for gated columns).
- `GET /api/machines/employee/:employeeId`, `GET /api/production/performance-history/:employeeId` — controller-level check: `if (!req.user.is_admin && req.user.id !== employeeId) return 403`.
- `GET /api/production/my-entries` — defaults to the caller's own entries; an `employeeId` query override is only honored for admins.
- `GET /api/permissions/effective/:userId/worksheet/:worksheetId` — **fixed in this audit**, see Findings below.
- `GET /api/downtime/my-downtime`, `POST /api/downtime` — scoped to `req.user.id` at the query/write level.
- `GET /api/notifications`, `PUT /api/notifications/:id/read`, `PUT /api/notifications/mark-all-read` — all scoped to `req.user.id` in the `where` clause, so one user can never read or mark another user's notifications (an update targeting someone else's notification ID simply matches zero rows).
- `POST /api/approvals` — any employee can request an edit to a gated column.
- `GET /api/approvals` — controller-level check: non-admins get `whereClause.requested_by = req.user.id` forced in, admins see everything.
- `POST /api/push/subscribe`, `DELETE /api/push/subscribe` — scoped to the caller's own push subscription.

### Admin-only routes (`authenticate` + `requireAdmin`)

- `/api/users/*` (all)
- `/api/admin/*` (all)
- `/api/roles` — write operations only (`POST`, `PUT`, `DELETE`); `GET` is open per above.
- `/api/spreadsheets/upload`, `/api/spreadsheets/column/:columnId`
- `/api/versions/*` (all)
- `/api/machines/assign`, `/api/machines/assign/:id` (delete), `/api/machines/assignments`, `/api/machines/threshold`
- `/api/permissions/role/*`, `/api/permissions/user/*` (read + write)
- `/api/production/daily-report`, `/efficiency-report`, `/export-excel`, `/alerts`, `/alerts/:id/resolve`, `/plant-history`, `/trend-analysis`
- `/api/downtime/daily-report`, `/summary`, `/export-excel`, `/:id/resolve`
- `/api/audit/logs`, `/api/audit/export`
- `/api/approvals/pending`, `/api/approvals/:id/review`
- `/api/google-sheets/*` (all)
- `/api/reports/*` (all — weekly reports)
- `/api/system/storage`
- `/notifications` route file has no admin routes (all authenticated-user-scoped, see above)

## Findings and fixes

### 1. IDOR in `getEffectivePermissions` (fixed)

`GET /api/permissions/effective/:userId/worksheet/:worksheetId` had `authenticate` but no ownership check in the controller — **any authenticated employee could query any other employee's effective column permissions** by passing an arbitrary `userId`. The response doesn't leak row data, but it does leak another user's column-level `can_view`/`can_edit`/`requires_approval` configuration for a worksheet, which is more than a given employee should be able to see about a colleague.

**Fix**: added the same "admin or own" guard used elsewhere in this codebase (`getEmployeeAssignments`, `getMyEntries`, `getEmployeePerformanceHistory`) to `permissionController.js`:

```js
if (!req.user.is_admin && req.user.id !== userId) {
  return res.status(403).json({ success: false, message: 'Access denied' });
}
```

Updated the existing unit tests (`permissionController.test.js`) to include a realistic `req.user` (previously they called the controller directly without one, which is not representative of how `authenticate` always populates it in production) and added a new test asserting the 403 path. All 33 server tests pass after the fix.

### 2. Sensitive-field exposure — none found

- There is no `password_hash` (or any password) column anywhere in the schema — Supabase Auth owns credentials entirely; `user_profiles` only has profile fields.
- Searched every controller and route file for `service_role_key`, `private_key`, and `SUPABASE_SERVICE*` — none are ever placed in a response body. `getServiceAccountEmail` returns only the Google service account's email address (needed so admins know who to share a Sheet with), never the private key from the service account JSON.
- `GET /api/push/vapid-key` returns only the public key, confirmed by reading `getVapidPublicKey()`'s usage — `VAPID_PRIVATE_KEY` is only read inside `services/pushService.js` for signing outgoing pushes, never returned to any client.

### 3. Inconsistent error handling in a few inline route handlers (tracked, not a security leak)

Three inline handlers (`notifications.js`'s three routes, `spreadsheets.js`'s column-update handler, `googleSheets.js`'s settings handler) log the raw error with `console.error` but don't call `handlePrismaError`, so a Prisma "record not found" (P2025) surfaces as a generic 500 instead of 404. This is a response-consistency issue (tracked and fixed under the API response consistency pass), **not** a security issue — no internal error detail or stack trace is ever sent to the client in either case, only a fixed human-readable message.

## Verified safe by design (flagged in the audit brief, confirmed intentional)

- `row_data` is readable by every authenticated employee — intentional, matches the "any employee can view any spreadsheet's data" design (edit gating happens per-column via `role_permissions`/`user_permissions`, not per-row visibility).
- `/api/push/vapid-key` being public — intentional and safe (public key only).
- `/api/health` dual-auth path — confirmed still working correctly end-to-end after the earlier stale-process fix (re-verified in this pass, see the top-level task summary's Verification section).
