# Sertis QA Take-Home

Deliverable for a QA take-home test: test planning, an `@e2e` suite against
[demoblaze](https://www.demoblaze.com), an `@api` suite against the local
server in `api-main/`, a k6 performance script, and a CI pipeline. See
`SPEC.md` for the full design and `CONTEXT.md` for the glossary.

## Run everything, from a clean clone

```
npm ci && npx playwright install --with-deps && npm test
```

This installs the root toolchain, installs `api-main`'s own dependencies
(via `npm test`'s `pretest` hook), installs the Playwright browsers, then
runs both projects — `@e2e` against demoblaze in Chromium and `@api` against
a locally started `api-main` — and writes one HTML report.

Open the report with:

```
npm run report
```

## Other commands

| Command | What it does |
| --- | --- |
| `npm run test:e2e` | Only the `@e2e` project (Chromium). |
| `npm run test:api` | Only the `@api` project. |
| `npm run test:cross-browser` | `@e2e` on Firefox and WebKit. Not part of `npm test` or CI — see `SPEC.md`'s browser matrix decision. |

## Configuration

Environment variable overrides (see `playwright.config.ts`):

- `API_BASE_URL` — base url for the `@api` project. Defaults to a locally
  started `api-main` (`http://127.0.0.1:3000`, or `API_PORT` if set). Set
  this to point the identical suite at a deployed instance instead; when
  set, Playwright does not spawn a local server.
- `API_PORT` — port used to start the local `api-main` (default `3000`).
- `E2E_BASE_URL` — base url for the `@e2e` project (default
  `https://www.demoblaze.com`).

`api-main/` is a read-only system under test — it is only started as a
separate process, never imported in-process.
