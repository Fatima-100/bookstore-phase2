# KitabGhar BookStore — Phase II: Multi-User Catalogue & Admin Approval

React + Node.js/Express + MongoDB. Registered users submit books; an administrator approves
them before they become public and downloadable.

```
backend/
  Server/     Express API (port 5050), MongoDB, tests, scripts
  BookStore/  React app (port 5173): library, login/register, My Catalogue, Admin Review
  Admin/      React "library studio" for admins (port 5174)
```

## 1. Installation

Requirements: Node.js 20+, a local MongoDB (`mongodb://127.0.0.1:27017`), Yarn or npm.

```bash
# 1. API
cd Server
cp .env.example .env              # see section 2
npm install
npm run migrate                      # creates indexes, upgrades the existing books (see section 6)
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='a-strong-password' ADMIN_NAME='Site Admin' npm run create-admin
npm run dev                          # http://localhost:5050

# 2. BookStore (second terminal)
cd BookStore && npm install && npm run dev     # http://localhost:5173

# 3. Admin studio (optional, third terminal)
cd Admin && npm install && npm run dev         # http://localhost:5174
```

Vite proxies `/api` and `/uploads` to port 5050, so the browser talks to one origin and the
session cookie "just works".

**Creating the admin securely:** admins can never be created through the public API —
registration always creates `role: "user"` and ignores any `role` in the request. The only way
to get an admin is the server-side command `npm run create-admin` (run on the server with the
password in the command line/environment, not in a file). Running it for an existing e-mail
promotes that user and leaves the password untouched.

**Sample accounts:** none are shipped. Register two users in the BookStore app (or use
`npm run demo`, which creates throw-away users) and create one admin with the command above.

## 2. Environment variables (`Server/.env`, no secrets are committed)

| Name | Purpose | Default |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017` |
| `MONGODB_DB` | Database name | `bookstore` |
| `PORT` | API port | `5050` |
| `FRONTEND_ORIGINS` | Origins allowed to call the API with cookies (CORS) | `http://localhost:5173,http://localhost:5174` |
| `COOKIE_SECURE` | `true` when served over HTTPS (cookie becomes HTTPS-only) | `false` |
| `ALLOWED_URL_HOSTS` | Optional allow-list of hosts for book links | empty (any http/https host) |
| `UPLOAD_DIR` | Where uploaded files are kept | `Server/uploads` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Read only by `npm run create-admin` | – |

Sessions use random tokens, so there is no signing secret to keep in the code.

## 3. MongoDB schema

**users** — `id` (24-hex string, referenced by books), `name`, `email` (unique, lower-case),
`passwordHash` (`scrypt$salt$hash`), `role` (`user` | `admin`), `createdAt`.

**books** — the existing fields (`id`, `title`, `subtitle`, `author`, `category`, `bookType`
PDF/UNICODE/AUDIO, `color`, `fileUrl`) plus:
`description`, `uploadedBy` (→ `users.id`), `status` (`pending` | `approved` | `rejected`),
`rejectionReason`, `reviewedBy`, `reviewedAt`, `createdAt`, `updatedAt`, `fileName`
(only for files stored on this server), and for the revision feature `revision`
(`{ changes, status, rejectionReason, submittedAt }` or `null`) with the flat flag `hasPendingRevision`.

**notifications** — `id`, `userId` (→ `users.id`), `type`, `bookId`, `message`, `createdAt`, `readAt`.

**auditLogs** — `id`, `at`, `actorId`, `actorEmail`, `action`, `targetId`, `details` (no passwords or tokens).

**sessions** — `tokenHash` (SHA-256 of the cookie token, unique), `userId`, `expiresAt`
(MongoDB TTL index deletes expired sessions automatically; sessions last 8 hours).

Indexes: `users.email` (unique), `books.hasPendingRevision`, `notifications.userId+createdAt`, `auditLogs.at`, `books.id` (unique), `books.status`, `books.uploadedBy`,
`books.fileName`, `sessions.tokenHash` (unique), `sessions.expiresAt` (TTL).

## 4. How authentication and authorization are enforced

* **Authentication** – `POST /api/auth/login` checks the scrypt password hash and starts a
  server-side session. The browser only holds an opaque random token in an **HttpOnly,
  SameSite=Lax** cookie (invisible to JavaScript). The database stores only the token's hash.
  A middleware loads the user from the session on every request; the identity is *never* read
  from the request body. Failed logins return the same message for unknown e-mail and wrong
  password, and are rate-limited (10 per 15 min per e-mail+address).
* **Authorization on every route** – `requireLogin` → 401, `requireAdmin` → 403 (routes), and
  `service.js` re-checks role and ownership itself (defence in depth):
  * users may edit/delete only books where `book.uploadedBy === user.id`; admins may manage any book;
  * another user's *pending/rejected* book answers **404** (its existence is not revealed),
    another user's *approved* book answers **403**;
  * approve/reject/pending-list are admin-only.
* **Never trusting the client** – requests are whitelisted field by field. `uploadedBy`,
  `status`, `role`, `rejectionReason`, `id` in a request body are ignored; the server sets the
  owner from the session and the status from the workflow. All values must be plain strings
  (object payloads like `{"$ne": ""}` are rejected).
* **Public visibility** – `GET /api/books` queries `{ status: 'approved' }` only, and strips the
  owner and review fields. Uploaded files are served by `GET /uploads/:file`, which looks up the
  owning book: approved → anyone; otherwise only the owner or an admin; else 404. (The old
  public static `/uploads` folder was removed.)
* **Input & file validation** – lengths/types are validated server-side; links must be
  http(s) with a matching extension (`.pdf`, `.txt`, audio) and no embedded credentials; uploads
  are limited to 25 MB and checked by extension **and** file signature (PDF header, UTF-8 text,
  audio headers); stored under a random UUID file name.

## 5. API

| Method | Endpoint | Who | Behaviour |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | guest | name, email, password, confirmPassword → creates a `user` |
| POST | `/api/auth/login` | guest | verifies credentials, sets session cookie |
| POST | `/api/auth/logout` | any | ends the session |
| GET | `/api/auth/me` | logged in | current user (name, email, role) |
| GET | `/api/books` | public | approved books only; `bookType`, `category`, `search`, `page`, `limit` (≤100) |
| GET | `/api/books/:id` | public/owner/admin | approved book, or your own / any (admin) |
| GET | `/api/my/books` | logged in | own books (admin: all). Paginated, **50 per page** (`page`, `limit` ≤100), `status` filter, `search`; returns `counts` per status |
| POST | `/api/books` | logged in | JSON or multipart (`file` or `fileUrl`); saved as **pending** (admin: approved) |
| PATCH | `/api/books/:id` | owner/admin | edit. Owner's edit of an **approved** book becomes a *revision* (the approved version stays public); edit of a rejected book → **pending** |
| POST | `/api/books/:id/resubmit` | owner/admin | rejected book (or rejected revision) → pending without changes |
| DELETE | `/api/books/:id/revision` | owner/admin | discard the unapproved edit; the approved version is untouched |
| DELETE | `/api/books/:id` | owner/admin | deletes the book (and its uploaded file) |
| GET | `/api/admin/books/pending` | admin | new submissions **and** edits to public books (`kind`: `new`/`revision`) with owner name/e-mail |
| PATCH | `/api/admin/books/:id/approve` | admin | new book → approved; revision → replaces the live version |
| PATCH | `/api/admin/books/:id/reject` | admin | body `{ "reason": "…" }` (required); a rejected revision leaves the approved version public |
| GET | `/api/notifications` | logged in | your approval/rejection notifications + unread count |
| POST | `/api/notifications/read` | logged in | mark all as read |
| GET | `/api/admin/audit-logs` | admin | audit log, newest first, 50 per page |

Status codes: 400 validation, 401 not logged in, 403 not allowed, 404 not found, 409 conflict
(duplicate e-mail, already approved), 413 file too large, 429 too many log-ins.

### Rules chosen where the assignment leaves room
* Revision history: a normal user's edit of an **approved** book is stored as a pending *revision*. The approved version stays public and downloadable; approval replaces it, rejection keeps it (the owner sees the reason and can edit, resubmit or discard).
* Editing a rejected book resubmits it; `POST …/resubmit` resubmits without edits.
* An admin's own uploads are approved immediately; an admin editing a user's book does not reset its status.
* Deleting is permanent (hard delete) and also removes an uploaded file.
* File replacement: a book uploaded as a file keeps that file; to change it, delete and resubmit.

## 6. Migration of the existing books

`npm run migrate` is idempotent and deletes nothing. It creates a **system owner** (an admin account
with a random password that nobody can log in to), imports the books from `src/data/books.js`
that are not yet in MongoDB, and sets on every book that has no owner/status:
`uploadedBy = system owner`, `status = approved` (they were already public), plus timestamps.
Files already uploaded to this server are linked through `fileName`, so the download rule covers them.

## 7. Required demonstration — the 8 test cases

Automated: `cd Server && npm run test` (service tests run without MongoDB; `test/http.test.js`
also exercises cookies and 401/403 over real HTTP). Live: with the server running,

```bash
cd Server && ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='…' npm run demo
```

| # | Scenario | Where it is checked |
| --- | --- | --- |
| 1 | User A submits Book X → pending in their catalogue | `workflow.test.js` #1, `demo` |
| 2 | Guest does not see Book X | #2 |
| 3 | User B cannot modify User A's Book X (404/403) | #3 |
| 4 | Normal user calls an admin endpoint → 403 | #4 (the API-authorization failure to show on camera) |
| 5 | Admin approves → public | #5 |
| 6 | Editing an approved book → edit goes to review, approved version stays public | #6 |
| 7 | Rejection shows a reason; owner revises → pending again | #7 |
| 8 | Owner deletes own book | #8 |

To show a 403 by hand, log in as a normal user in the browser and run in the dev-tools console:
`fetch('/api/admin/books/pending').then(r => r.status)` → `403` (and `401` when logged out).

## 8. Screenshots
Ready-made screenshots are in `screenshots/` (see `screenshots/README.txt`): login and register
dialogs, public library (approved only), My Catalogue with every status, a rejected book with its
reason, search and pending edit, notifications, Admin Review with a proposed-changes diff, the
audit log, and the output of `npm run demo`. Retake them on your own machine for the final submission.

## 9. Optional extensions (all implemented except the cloud/e-mail ones)
* **Pagination (50 per request) and status filtering** — `GET /api/my/books`, with Previous/Next in the UI.
* **Search within the user's own catalogue** — search box (title, author, category, subtitle).
* **Notifications for approval/rejection** — in-app bell with unread count; also for revisions.
* **Revision history** — the last approved version stays visible while an edit is reviewed.
* **Audit log** — registrations, log-ins (including failures), submissions, edits, deletions, approvals
  and rejections; admin-only page *Audit Log*.
* Not implemented: *object-storage upload*, *e-mail verification* and *password reset* — they need an
  external provider (cloud bucket, mail service). Uploaded files are already access-controlled by the
  server (section 4).
* Also included: login rate limiting and automatic expiry of sessions.
