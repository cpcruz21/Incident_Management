# Accounts and audit history

Super administrators use **User Management** to create administrators, reset their
passwords, and delete accounts. The account directory supports name/username search.
The super administrator enters a full name, username, password, and password confirmation.
The full name is the display name in accounts and audit history; the separate username
is used for signing in. Editing the name does not change the username field.
Passwords require 8–256 characters, including at least one letter and one special
character, and are stored only as salted hashes. After
creation, the form clears the password fields and shows a short confirmation.

Reset password uses the same password rules or lets the super
administrator generate one locally. Successful reset rotates the session key and
signs out existing sessions. Deletion requires a confirmation dialog and removes
the account's sign-in access immediately. Reports and audit history remain.
Super administrators cannot delete the super-admin account or reset it through
the directory. They change their own password, using the current password, in
**Account Settings**. Ordinary administrators can only change their own password.
The profile menu's **Account settings** shortcut opens a dedicated personal view
with the password form; it does not open the account creation directory.

**Audit Logs** is a separate sidebar module, available only to super administrators.
It supports search by person/activity/target, activity and result filters, refresh,
and cursor pagination. Times are displayed in Asia/Taipei (UTC+8). The server checks
the role for every audit request; hiding the sidebar is not the access boundary.

## API contract

All mutations require the existing authenticated super-admin session and same-origin
checks. The account endpoints are:

- `GET /api/admin/users`: safe account profiles; no password hashes or session keys.
- `POST /api/admin/users`: `{name, username, password}` returns `{account}`, status 201.
- `PATCH /api/admin/users`: `{id, password}` resets an administrator's password, status 204.
- `DELETE /api/admin/users`: `{id}` deletes an administrator, status 204.
- `GET /api/admin/audit`: super-admin-only, no-store. Optional `query` (up to 100
  characters), `group` (`auth`, `account`, `report`, `incident`, `department`,
  `analytics`), `outcome` (`success`, `failure`), and opaque `cursor`.
  Returns `{entries, nextCursor, storageWarning}` with at most 25 entries.

Unauthenticated requests are 401; administrators requesting super-admin operations
receive 403. Invalid input is 400; unavailable usernames are 409; missing accounts
are 404. Password reset can return 409 if the account changes concurrently.

## Recorded events and storage

Logging begins when this update is installed; no earlier history is fabricated.
Events include successful account creation/reset/deletion, sign-in and sign-out,
own-password changes, report publication and archive saves/deletion, legacy archive
imports, incident assignment changes, department mapping changes, and IR analytics
saves. Failed sign-ins, throttled authentication, incorrect current passwords, and
invalid/duplicate account creation are recorded too. Client-side edits and downloads,
expired sessions, rejected permission checks, and operations rejected before these
handlers complete are not a complete activity history.

Events use the server-verified actor, not an `updatedBy` value from the browser.
Only allowlisted actor/target fields are written. Passwords, hashes, tokens,
session keys, request bodies, and report contents are excluded.

Append-only daily JSONL files live under `data/audit/`, or the configured
`SMAC_DATA_DIR/audit/`. They have no UI edit/delete action or automatic retention
deletion. Include this directory in backups. This is application-level history,
not a tamper-proof external security log; server filesystem administrators can
still alter files. Deployment uses the existing single application instance with
persistent writable storage.

If an audit write fails, the already completed action still succeeds; a fixed
server error is logged, and the audit viewer shows a storage warning for the rest
of that process's lifetime. Malformed stored lines are skipped with a warning.
Audit read failures display an error instead of pretending the log is empty.

## Verification

- `node scripts/verify-user-management.cjs`: username and password validation,
  role-specific controls, and separation of the Audit Logs module.
- `node scripts/verify-account-audit.cjs`: actual route/auth/storage code against
  synthetic accounts in a temporary directory. Checks create/reset/delete,
  old-session invalidation, login and own-password changes, archive events,
  authorization, cursor pagination, filtering, persistence, and secret exclusion.
  It does not alter real accounts or production data.
