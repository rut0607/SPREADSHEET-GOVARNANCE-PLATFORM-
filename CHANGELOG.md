# Changelog

All notable changes to the Spreadsheet Governance Platform, grouped by build phase.

## 1.0.0 — Production Readiness Audit

A cleanup and hardening pass across the whole app, with no new user-facing features. Highlights:

- Fixed a real IDOR: `GET /api/permissions/effective/:userId/worksheet/:worksheetId` had no ownership check, letting any employee query any other employee's column permissions.
- Fixed `approval_requests` having Row Level Security enabled with zero policies defined (silently denying all RLS-respecting access rather than implementing "own requests only" as intended).
- Removed duplicate request logging (morgan + a custom logger were both running on every request).
- Wrapped the core writes in `submitDailyEntry` and `submitDowntime` in Prisma transactions so a mid-request failure can no longer leave production/downtime data out of sync with the row's own JSONB snapshot.
- Rebuilt the Audit Logs page to read from the real `audit_logs` table (with pagination and filters) instead of the approvals table.
- Cleaned up `server/.env` (duplicate `DATABASE_URL`, `VAPID_*`, and `HEALTH_CHECK_API_KEY` entries where an old placeholder block and a real block coexisted); added `server/.env.example` and `client/.env.example` (neither existed before).
- Consolidated hardcoded OE thresholds (85/75) and the downtime category/reason list, each previously duplicated across several files, into `client/src/constants/`.
- Added service worker cache-busting: a version-aware cache name, cleanup of old caches on activate, and an in-app "update available" banner.
- Added `docs/SECURITY_AUDIT.md` and `docs/ENVIRONMENT_VARIABLES.md`; updated `docs/DEPLOYMENT_CHECKLIST.md` to match the current app state (several steps had gone stale, including a reference to `npx prisma migrate deploy`, which doesn't apply to this project's raw-SQL migration workflow).

## Phase 3 — HR Features

- Machine downtime tracking: `machine_downtime` table and RLS policies, submission API with category/reason validation, mobile bottom-sheet logging UI in Production Entry.
- Employee performance history and plant-wide performance history endpoints and admin page (OE trend chart, weekly averages, submission rate, downtime summary).
- Target-vs-actual trend analysis: weekly plant/machine target vs. actual output, OE% gap tracking, admin page with plant-wide and gap-analysis charts.
- Efficiency Dashboard: added a "Today's Status" column (submitted/downtime/no entry) to the machine status table.
- Employee Dashboard: added a "Today's Activity" summary per assigned machine.
- Downtime Log admin page: date-range summary, category breakdown chart, resolve workflow, Excel export.

## Phase 2 — Sync, PWA, and Reporting

- Google Sheets integration (connect, sync, service account), column configuration, spreadsheet version management with validation reports.
- Scheduled sync, pagination, dropdown column support, mobile responsiveness pass.
- PWA support (installable, offline queueing for production entries), web push notifications, weekly report generation and export.
- Mobile polish, performance work, and an initial security hardening pass (rate limiting, input sanitization, CORS tightening).

## Phase 1 — Core Governance Platform

- Role-based access control: roles, role/user-level column permissions, approval workflow for gated edits.
- Admin dashboard, employee dashboard, data viewer, audit logging on direct edits.
- Machine assignment, daily production entry, efficiency thresholds and alerts, efficiency dashboard.
- Dual data sync (Excel upload and Google Sheets) with a shared row/column/worksheet data model.
- Employee-facing efficiency display: ring gauge, 7-day history chart, submission streak; admin employee overview; navbar status indicator.
- Alambre Cables branding (navy/orange-pink-purple gradient) and initial mobile-friendly layout.
