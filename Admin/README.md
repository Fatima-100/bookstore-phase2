# KitabGhar Admin (library studio)

A small admin-only studio for adding, editing and deleting books. Approving or rejecting
user submissions is done in the **BookStore** app (Admin Review page).

```bash
cd Admin
yarn install      # or npm install
yarn dev          # http://localhost:5174 (the API must be running on port 5050)
```

Sign in with an **administrator e-mail and password** (create one with `npm run create-admin`
inside `Server`; see the main README). The session is an HttpOnly cookie set by the server.
Books added here by an admin are published immediately.

| Action | Method | Endpoint |
| --- | --- | --- |
| Sign in / out | POST | /api/auth/login, /api/auth/logout |
| List all books | GET | /api/my/books (admins receive every book) |
| Add a book | POST | /api/books (multipart/form-data) |
| Edit | PATCH | /api/books/:id |
| Delete | DELETE | /api/books/:id |
