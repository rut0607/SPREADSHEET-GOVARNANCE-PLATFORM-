# API Reference

Base URL: `{API_BASE_URL}` (default `http://localhost:8000/api` in development).

All responses follow a consistent envelope:

```json
{ "success": true, "message": "optional", "data": { } }
{ "success": false, "message": "human-readable error" }
```

## Authentication

Except where noted, endpoints require an `Authorization: Bearer <token>` header, where `<token>` is the `token` returned from `POST /api/auth/login`. Endpoints marked **Admin** additionally require the authenticated user to have `is_admin: true`.

## Rate limits

- All `/api/*` routes: 100 requests / 15 minutes / IP.
- `POST /api/auth/login`: 10 requests / 15 minutes / IP.

Exceeding a limit returns `429` with `{ "success": false, "message": "Too many requests..." }`.

---

## Health

### `GET /api/health`
No auth required.

**Response 200**
```json
{ "success": true, "message": "Spreadsheet Governance Platform API is running", "timestamp": "...", "environment": "development" }
```

---

## Auth (`/api/auth`)

### `POST /api/auth/login`
No auth required. Rate-limited (10/15min).

**Body**: `{ "email": "string", "password": "string" }`

**Response 200**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "string",
    "refresh_token": "string",
    "user": { "id": "uuid", "full_name": "string", "email": "string", "role": {}, "is_admin": false, "is_active": true }
  }
}
```
**Errors**: `400` missing email/password, `401` invalid credentials / no profile, `403` account disabled.

### `POST /api/auth/logout`
Requires auth. No body. **Response 200**: `{ "success": true, "message": "Logged out successfully" }`

### `GET /api/auth/me`
Requires auth. **Response 200**: `{ "success": true, "data": { "user": {...} } }`

### `POST /api/auth/refresh`
No auth required. **Body**: `{ "refresh_token": "string" }` → `{ "success": true, "data": { "token", "refresh_token" } }`

### `POST /api/auth/reset-password`
No auth required. **Body**: `{ "email": "string" }` → `{ "success": true, "message": "Password reset email sent if account exists" }`

---

## Users (`/api/users`) — all Admin

### `GET /api/users`
**Response 200**: `{ "success": true, "data": { "users": [ { ...UserProfile, role } ] } }`

### `POST /api/users`
**Body**: `{ "full_name": "string", "email": "string", "password": "string (min 8 chars)", "role_id": "uuid?", "is_admin": false }`
Validation: `full_name` required, `email` must match a valid email format, `password` must be ≥ 8 characters. Returns `400` with a specific message for whichever check fails.
**Response 201**: `{ "success": true, "message": "User created successfully", "data": { "user": {...} } }`

### `GET /api/users/:id`
**Response 200/404**

### `PUT /api/users/:id`
**Body**: `{ "full_name", "role_id", "is_active", "is_admin" }` → `{ "success": true, "data": { "user": {...} } }`

### `POST /api/users/:id/reset-password`
**Body**: `{ "new_password": "string (min 8 chars)" }` → `{ "success": true, "message": "Password reset successfully" }`

### `DELETE /api/users/:id`
No body. Cannot delete your own account (`400`). → `{ "success": true, "message": "User deleted successfully" }`

---

## Roles (`/api/roles`)

### `GET /api/roles`
Requires auth (any authenticated user). **Response 200**: `{ "success": true, "data": { "roles": [...] } }` (may include `"cached": true`)

### `POST /api/roles` — Admin
**Body**: `{ "name": "string (required, ≤100 chars)", "description": "string?" }`
Validation: name required and non-blank, ≤ 100 characters, must be unique. **Response 201/400**

### `PUT /api/roles/:id` — Admin
**Body**: `{ "name", "description", "is_active" }` → `{ "success": true, "data": { "role": {...} } }`

### `DELETE /api/roles/:id` — Admin
→ `{ "success": true, "message": "..." }`

---

## Spreadsheets (`/api/spreadsheets`)

### `POST /api/spreadsheets/upload` — Admin
**Headers**: `Content-Type: multipart/form-data`. **Form fields**: `file` (`.xlsx`/`.xls`, ≤10MB), `name` (string).
**Response 201**: `{ "success": true, "data": { "source": {...}, "worksheets": [...] } }`

### `GET /api/spreadsheets`
**Response 200**: `{ "success": true, "data": { "sources": [ { ...source, worksheets: [{ id, name, display_name, row_count }], creator } ] } }`

### `GET /api/spreadsheets/worksheet/:worksheetId/data?page=1&limit=50`
**Response 200**: `{ "success": true, "data": { "worksheet": { columns: [...] }, "rows": [...], "pagination": { total, page, limit, total_pages } } }`

### `PUT /api/spreadsheets/column/:columnId` — Admin
**Body**: `{ "display_name", "data_type", "is_required", "is_unique", "is_identifier", "dropdown_options" }` (all optional, only provided fields are updated)

### `PUT /api/spreadsheets/row/:rowId`
**Body**: `{ "data": { <column_key>: <value> } (required, non-empty object), "column_id": "uuid?", "previous_value": "string?", "new_value": "string?" }`
Validation: `data` must be a non-empty plain object, otherwise `400`.
**Response 200**: `{ "success": true, "message": "Row updated successfully", "data": { "row": {...} } }`

### `GET /api/spreadsheets/:id`
**Response 200/404**: source detail including worksheets/columns.

---

## Permissions (`/api/permissions`)

### `GET /api/permissions/role/:roleId` — Admin
### `POST /api/permissions/role/:roleId` — Admin
**Body**: `{ "permissions": [{ "worksheet_id", "column_id", "can_view", "can_edit", "requires_approval" }] }`

### `GET /api/permissions/user/:userId` — Admin
### `POST /api/permissions/user/:userId` — Admin
Same shape as the role variant, scoped to a specific user override.

### `GET /api/permissions/effective/:userId/worksheet/:worksheetId`
Requires auth (any authenticated user — no ownership check against `userId`).
**Response 200**: `{ "success": true, "data": { "permissions": [ { column_id, column_key, display_name, data_type, can_view, can_edit, requires_approval, source: "admin"|"role"|"user_override" } ] } }`
Admins always receive `can_view: true, can_edit: true, requires_approval: false` for every active column in the worksheet.

---

## Approvals (`/api/approvals`)

### `POST /api/approvals`
Requires auth. **Body**: `{ "worksheet_id": "uuid (required)", "row_id": "uuid (required)", "column_id": "uuid (required)", "previous_value": "string?", "requested_value": "any (required, may be an empty string)" }`
Validation: `worksheet_id`/`row_id`/`column_id` must be present and non-blank; `requested_value` must not be `undefined`/`null` (an empty string is allowed, to support clearing a cell).
**Response 201**: `{ "success": true, "message": "Approval request submitted successfully", "data": { "approval": {...} } }`

### `GET /api/approvals/pending` — Admin
**Response 200**: `{ "success": true, "data": { "approvals": [...] } }`

### `GET /api/approvals?status=pending&page=1&limit=50`
Requires auth. Non-admins only see their own requests. **Response 200**: `{ "success": true, "data": { "approvals": [...], "pagination": {...} } }`

### `PUT /api/approvals/:id/review` — Admin
**Body**: `{ "status": "approved" | "rejected" (required), "review_notes": "string?" }`
Validation: `status` must be exactly `"approved"` or `"rejected"`, else `400`.
**Response 200**: `{ "success": true, "message": "Approval request ... successfully", "data": { "approval": {...} } }`

---

## Notifications (`/api/notifications`)

### `GET /api/notifications`
Requires auth. **Response 200**: `{ "success": true, "data": { "notifications": [...], "unread_count": 0 } }`

### `PUT /api/notifications/:id/read`
Requires auth. → `{ "success": true, "message": "Notification marked as read" }`

### `PUT /api/notifications/mark-all-read`
Requires auth. → `{ "success": true, "message": "All notifications marked as read" }`

---

## Versions (`/api/versions`) — all Admin

### `GET /api/versions/:sourceId`
**Response 200**: `{ "success": true, "data": { "versions": [...] } }`

### `POST /api/versions/:sourceId/upload`
**Headers**: `Content-Type: multipart/form-data`. **Form fields**: `file`, `notes`.
**Response 201**: `{ "success": true, "message": "New version uploaded successfully", "data": { "version": {...} } }`

### `PUT /api/versions/:sourceId/restore/:versionId`
No body. → `{ "success": true, "message": "Restored to version N" }`

### `GET /api/versions/:sourceId/report/validation`
**Response 200**: `{ "success": true, "data": { "report": { "worksheets": [ { worksheet_name, total_rows, total_columns, issues: [...], column_stats: [...] } ] } } }`

---

## Google Sheets (`/api/google-sheets`) — all Admin

### `GET /api/google-sheets/service-account`
**Response 200**: `{ "success": true, "data": { "email": "string" } }`

### `POST /api/google-sheets/connect`
**Body**: `{ "spreadsheet_url": "string", "name": "string" }` → `{ "success": true, "data": { "source": {...} } }`

### `POST /api/google-sheets/sync/:sourceId`
No body. → `{ "success": true, "message": "Synced successfully" }`

### `PUT /api/google-sheets/settings/:sourceId`
**Body**: sync settings (e.g. `sync_mode`, `source_of_truth`, `conflict_resolution`).

---

## Audit (`/api/audit`) — Admin

### `GET /api/audit/export`
No body. **Response 200**: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="audit-log-export-<date>.csv"`. Columns: `Date, User, Role, Sheet, Field, Previous Value, New Value, Status, Review Notes`.

---

## System (`/api/system`) — Admin

### `GET /api/system/storage`
**Response 200**: `{ "success": true, "data": { "storage": { "total_bytes": 0, "file_count": 0 } } }`

---

## Error responses

| Status | Meaning |
|---|---|
| 400 | Validation failure — body includes a specific `message` |
| 401 | Missing/invalid/expired token, or inactive user profile lookup failure |
| 403 | Authenticated but not authorized (e.g. non-admin hitting an admin route, or disabled account) |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error (logged server-side via `console.error`) |
