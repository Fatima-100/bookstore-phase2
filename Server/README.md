# BookStore server (Express + MongoDB)

See the main [`../README.md`](../README.md) for setup, environment variables, the API and the
security design.

```bash
cp .env.example .env            # adjust if needed
yarn install                    # or npm install
yarn migrate                    # indexes + upgrade the existing books (safe to repeat)
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='choose-a-strong-one' yarn create-admin
yarn dev                        # http://localhost:5050
yarn test                       # automated tests (no MongoDB needed)
yarn demo                       # live demo of the 8 required test cases (server must be running)
```
