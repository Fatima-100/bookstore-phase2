> **Superseded.** This was the planning note for Phase I. The implemented design is described in [README.md](README.md).

# BookStore API plan

Saved on 2026-11-16. Implement later when requested; this document does not implement the APIs.

## Current project

- Express server: http://localhost:5050.
- POST /register stores name and email in memory.
- GET /fetchbooks returns sample books.
- GET /books currently returns users and needs correcting.
- BookStore login navigates without authenticating; registration does not call the server.
- Admin checks admin / admin123 in React only; server routes are not protected.
- Book cards use hardcoded data; book uploading is not implemented.
- In-memory changes disappear when the server restarts.

## Proposed authentication

- POST /api/auth/signup: accept name, email, password, phone, address; validate, reject duplicate emails, hash password, persist user with role user; return 201 and public user details.
- POST /api/auth/login: verify email/password and create a session; return public user details.
- POST /api/admin/login: verify credentials and require the stored admin role before creating a session.
- POST /api/auth/logout: invalidate the session.
- Never return password hashes. Do not store confirmPassword.
- Create the initial admin through controlled setup, not public signup.
- Enforce session and admin role on the server for every admin endpoint.
- Cookie-session frontend requests use credentials: include. Configure CORS for specific frontend origins with credentials enabled.

## Proposed book routes

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /api/books | Public published books |
| GET | /api/books?bookType=PDF | Filter PDF books |
| GET | /api/books?bookType=UNICODE | Filter readable text books |
| GET | /api/books?category=history | Filter subject category |
| GET | /api/books/:id | One published book |
| GET | /api/admin/books | Admin list including drafts |
| POST | /api/admin/books | Admin upload/create |
| PATCH | /api/admin/books/:id | Admin edit/publish |
| DELETE | /api/admin/books/:id | Admin delete |

## Format, category, language

Keep these separate:

- bookType: PDF, UNICODE, AUDIO.
- category: History, Literature, Technology, etc.
- language: ur, en, ar, etc.

UNICODE is the application's label for readable text books, not a distinct encoding exclusive to those books; PDFs may also contain Unicode text.

## Upload contract

POST /api/admin/books uses multipart/form-data:

- title, author, category, bookType, language, description.
- cover: cover image.
- file: PDF for PDF books; UTF-8 .txt for UNICODE books.
- isPublished: defaults to false for a draft.
- Add structured chapters/content if chapter-based reading is required.
- AUDIO may be added with audio files and narrator metadata.

Frontend: construct FormData and send with credentials: include. Let the browser set Content-Type and its multipart boundary.

Server: authenticate and authorize admin, validate fields and actual file types, enforce size limits, store files, and persist metadata and file locations in a database. Public access must respect publication status, including access to the underlying files.

## Intended flow

Admin signs in -> uploads a PDF or text book -> publishes it -> BookStore fetches published books -> reader opens PDF or text content.

Suggested implementation order: persistent storage and authentication, public book fetching, admin authorization and upload, then connect the React forms and book cards.
