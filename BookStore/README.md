# KitabGhar BookStore

A simple React library with All, PDF, Unicode, and Audio filters, title/author search, and responsive book cards. Books load from the local Express server.

## Run

```sh
yarn dev
```

Open the URL printed by Vite (normally http://localhost:5173). Start the backend in a separate terminal:

```sh
cd ../Server
yarn dev
```

Vite forwards `/api/books` requests to http://127.0.0.1:5050/api/books. The page shows loading, error, and retry states. The `/api` proxy is for local development; a deployed frontend needs an equivalent API route or proxy.

```sh
yarn build
yarn lint
```

## Code

- `src/App.jsx`: library layout, format filters, and search.
- `src/components/BookCard.jsx`: reusable book card.
- `src/components/Icon.jsx`: small SVG icons.
- `../Server/src/repositories/bookRepository.js`: reads the MongoDB catalogue for GET /api/books.
- `src/App.css`: responsive page styling.
- `examples/previous-screens/`: previous teaching screens, preserved outside the active application.

The catalogue is fetched from the local server, which queries MongoDB. See `../Server/README.md` for database setup and seeding. Authentication and admin uploads remain future work; see `../API-PLAN.md`. Book files open on the original external host and depend on that host being available. The decorative covers are generated with CSS, so the library does not depend on remote cover images.

## Audiobook login lesson

- Clicking Audiobooks while logged out opens the Login/Register dialog.
- Register sends `POST /register` with name, email, and password, then asks the user to log in.
- Login sends `POST /login` with email and password. Only a successful response unlocks the Audio filter.
- Audio cards in All books also ask logged-out users to log in before opening the file.
- After login, the app selects Audio, clears search, and shows the user's name and a Log out button.
- Login state is held in React memory. Refreshing or logging out asks for login again; restarting the backend clears registered users.

Vite proxies `/register` and `/login` to port 5050, alongside `/api`. This is a classroom UI flow; the backend does not yet issue sessions or tokens or restrict the external audio files.

## Load more pagination

The library loads ten books from `/api/books?page=1&limit=10`. **Load 10 more books** requests the next page and appends its results. The page shows how many books are loaded out of the total and hides the button at the end. A failed next-page request keeps the books already displayed and offers Retry.

Selecting a format, changing search, or returning to All resets loading to page 1. Format filters and title/author/description search run on the server across the full catalogue. The audiobook Login/Register flow remains in place. The catalogue includes 54 clearly labelled demo records with local sample files.
