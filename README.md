# Sertis QA Take-Home

Deliverable for a QA take-home test with three exercises: test planning and automated `@e2e`
coverage of [demoblaze](https://www.demoblaze.com), `@api` coverage of the local server in
`api-main/`, and a CI pipeline running both. See `SPEC.md` for the full design, `CONTEXT.md` for
the glossary, and `ASSUMPTIONS.md` for every place a decision had to be made rather than derived.

**Read this before running anything: a green run is not the success criterion here.** Both
systems under test are deliberately defective, and this submission asserts what they're supposed
to do rather than what they actually do. That means **8 tests fail on purpose** — 4 in `@api`, 4
in `@e2e` — every one of them traceable to a numbered entry in `docs/defects.md`. A run where
everything passes would mean the tests were written by reading the code instead of the spec; see
"Expected failures" below before treating any red test as something to fix.

## Run everything, from a clean clone

```
npm ci && npx playwright install --with-deps && npm test
```

This installs the root toolchain, installs `api-main`'s own dependencies (via `npm test`'s
`pretest` hook), installs the Playwright browsers, then runs both projects — `@e2e` against
demoblaze in Chromium and `@api` against a locally started `api-main` — and writes one HTML
report. Every command in this README has been run against a clean install; none are aspirational.

Open the report with:

```
npm run report
```

## Prerequisites

| Tool | Needed for | Version used to verify this README |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) + npm | Everything — the root toolchain and both test projects. | Node 22, npm 10 (repo targets Node 20 in CI, see `.github/workflows/ci.yml`). |
| Playwright browsers | `@e2e` only (`@api` drives HTTP, not a browser). Installed by `npx playwright install --with-deps`, not by `npm ci` alone. | Installed via the command above. |
| [k6](https://k6.io/) | `perf/` only — not part of `npm test` and never triggered automatically. Run by hand locally, or dispatched manually from Actions (*Performance (manual)*). See `perf/README.md`. | Not required to satisfy the `npm test` command above. |

## Confirm every red test is deliberate — under a minute

```
npx playwright test --project=api --project=e2e --list
```

lists every test title; the four `@api` and four `@e2e` failures below each carry their defect id
directly in the title (`[API-001]`, `— WEB-009`, etc.), so `grep`-ing the HTML report or CI job
summary for `API-` / `WEB-` is enough to confirm a failing test is expected without reading the
test's body. The CI job summary (`.github/scripts/summarize-failures.js`) does exactly this per
run, listed under "which defect" for each failing title.

## Expected failures

Verified by running both suites (`docs/agents` conventions aside, this count was re-run against
the actual repo state, not taken on trust from an earlier plan):

**`@api` — 4 of 13 fail** (`npm run test:api`):

| Test | Defect |
| --- | --- |
| `POST /signin › a request missing otp produces the documented internal-error response [API-001]` | `API-001` |
| `POST /signin › a request missing phone_no produces the documented internal-error response [API-001]` | `API-001` |
| `POST /signin › the 200 response's field types match the documented schema, including status_code [API-002]` | `API-002` |
| `GET /user/:id › API-003: does not return otp and phone_no to an unauthenticated caller` | `API-003` |

**`@e2e` — 4 of 10 fail** (`npm run test:e2e`; crosses the public internet to demoblaze, so this
one is slower and, per `docs/test-plan.md`'s "case for a controlled test environment," inherently
subject to drift the `@api` suite is not):

| Test | Case | Defect |
| --- | --- | --- |
| `TC-02: ordering with an empty cart is prevented — WEB-009` | `TC-02` | `WEB-009` |
| `TC-05: an invalid card number format is rejected — WEB-001` | `TC-05` | `WEB-001` |
| `TC-06: an impossible expiry date is rejected — WEB-002` | `TC-06` | `WEB-002` |
| `TC-08: adding to cart while logged out, then logging in, preserves the cart — WEB-010` | `TC-08` | `WEB-010` |

Every defect id above resolves to a full entry — severity, repro steps, expected vs. actual
behaviour — in `docs/defects.md`.

## Exercise map: brief → file

`docs/QA Take-Home-Test.docx.pdf` is the original brief. Each of its parts maps to a
specific deliverable:

| Brief exercise | Deliverable | File(s) |
| --- | --- | --- |
| 1a — task list, estimates, priorities for testing the whole site | Prioritised task table, estimation basis, calendar reconciliation | `docs/test-plan.md` |
| 1b — designed test case/scenario for the purchase flow, happy + unhappy paths | One happy path (`TC-01`) + seven unhappy paths (`TC-02`–`TC-08`), intent-level, no selectors | `docs/test-cases.md` |
| 1c — automated test script for 1b | Page objects + Playwright specs implementing `TC-01`–`TC-08` | `tests/e2e/purchase-journey.spec.ts` (`TC-01`), `tests/e2e/cart.spec.ts` (`TC-07`, `TC-08`), `tests/e2e/checkout-validation.spec.ts` (`TC-02`–`TC-06`), page objects under `tests/e2e/pages/` |
| 1d — how to performance test the site (explanation; implementation optional) | Workload model (sourced funnel, load shape, thresholds, black-box limitation, unrun profiles) **and** a working k6 script | `docs/performance-plan.md` (the explanation) + `perf/demoblaze-load.js`, `perf/README.md` (the optional implementation, done anyway) |
| 2 — design and implement API tests against the supplied server | `@api` suite covering `/user/ids`, `/user/:id`, `/signin` across documented success/failure responses, schema, and field types | `tests/api/user.spec.ts`, `tests/api/signin.spec.ts`, `tests/api/smoke.spec.ts` |
| 3 — CI pipeline running the above on merge | Two-job, non-blocking GitHub Actions pipeline (brief asks for GitLab CI or equivalent; GitHub Actions used, see `SPEC.md` "Toolchain"/"Pipeline") | `.github/workflows/ci.yml`, `.github/scripts/summarize-failures.js` |

Supporting documents that don't map to a single brief line item but underpin all of them:
`SPEC.md` (design decisions and rationale for every choice above), `CONTEXT.md` (an eight-term
glossary used consistently across every document and test name), `docs/defects.md` (the defect
register every failing test resolves to), `ASSUMPTIONS.md` (every place a decision had to be made
rather than derived — including why the purchase-flow confirmation dialog is the only oracle
available; see below).

## Other commands

| Command | What it does |
| --- | --- |
| `npm run test:e2e` | Only the `@e2e` project (Chromium). |
| `npm run test:api` | Only the `@api` project. |
| `npm run test:cross-browser` | `@e2e` on Firefox and WebKit. Not part of `npm test` or CI — see `SPEC.md`'s browser matrix decision. |
| `npx playwright test --project=e2e --list` / `--project=api --list` | List every test in a project without running it. Verified working against a clean install. |
| `npm run perf:smoke` | A seconds-long, single-digit-VU k6 smoke run, proving the performance script and its thresholds execute without putting the full plan-shaped load on a shared third-party site. See `perf/README.md`. |
| `npm run perf:load` | The full plan-shaped k6 load (~9 minutes, 20 VUs) against live demoblaze. Never runs automatically; the same profile can be dispatched by hand from Actions → *Performance (manual)* when the result should be stored centrally rather than only in your terminal. |

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

## Assumptions

Every assumption behind the reasoning above — including that demoblaze's purchase flow never
contacts a server with the order, which is why the confirmation dialog is the only oracle
available and exactly where the `@e2e` assertion stops — is collected in one place:
**`ASSUMPTIONS.md`**.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `bykplx1/sertis-qa-take-home`, managed with the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels, unchanged: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
