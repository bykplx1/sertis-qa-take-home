# Sertis QA Take-Home

Deliverable for a QA take-home test with three exercises: test planning and automated `@e2e`
coverage of [demoblaze](https://www.demoblaze.com), `@api` coverage of the local server in
`api-main/`, and a CI pipeline running both. See `SPEC.md` for the full design, `CONTEXT.md` for
the glossary, and `ASSUMPTIONS.md` for every place a decision had to be made rather than derived.

**Read this before running anything: a green run is not the success criterion here.** Both
systems under test are deliberately defective, and this submission asserts what they're supposed
to do rather than what they actually do. That means **24 tests reproduce a defect on purpose** —
13 in `@api`, 11 in `@e2e` — every one of them traceable to a numbered entry in `docs/defects.md`.

The two suites surface those reproductions differently, so read `npm test`'s summary line with
that in mind:

- The **13 `@api` reproductions are plain `test()` calls that fail.** They are the `13 failed`.
- The **11 `@e2e` reproductions are declared `test.fail()`**, so Playwright scores a defect that
  still reproduces as a *pass*. They are inside the `34 passed`. (Why: re-running a known-failing
  demoblaze journey twice more under retry triples the cost for no new evidence — the reasoning
  is at `tests/e2e/browse.spec.ts:28`.) Such a test goes red only if it *stops* failing, which
  means the defect may have been fixed.

A clean local run therefore prints **`13 failed, 34 passed` over 47 tests** — not 24 failures.
CI is the opposite: both jobs go red, because the summarizer deliberately counts the `test.fail()`
reproductions as non-passing (see the paragraph after next).

(The `@api` register runs `API-001`–`API-007`; six of those seven are reproduced live by a failing
test, and the seventh, `API-004`, is a defect in `swagger.yaml` itself that no HTTP request can
trigger, so it has none. The `@e2e` reproductions span nine defects, `WEB-001`, `WEB-002`,
`WEB-007`, `WEB-009` through `WEB-014`.) A run where every test passes *and* no `test.fail()`
reports an unexpected pass would mean the tests were written by reading the code instead of the
spec; see "Expected failures" below before treating any red test as something to fix.

The pipeline says the same thing in the same voice: **the CI jobs are red, on purpose, and will
stay red while the systems under test stay defective.** Any non-passing test fails its job, all
24 by-design reproductions included — the 11 `test.fail()` ones too, even though Playwright's own
exit code scores them green (`.github/scripts/summarize-failures.js` keeps them explicitly, and
exits 1 on the count). A green tick over a run whose entire product is a defect register would be
the one genuinely misleading artifact in this repository. Red here blocks nothing — no branch
protection or required check references these jobs — it just refuses to certify as clean a run
that was not. Open the job summary: it leads with why it is red and
sorts every non-passing test into by-design defects, defects that may now be fixed, suspected
demoblaze outages, and unexpected failures. The last of those four is the only one that means
something is wrong with this repository.

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

lists every test title; the 13 `@api` and 11 `@e2e` reproductions below each carry their defect id
directly in the title (`[API-001]`, `— WEB-009`, etc.), so `grep`-ing the HTML report or CI job
summary for `API-` / `WEB-` is enough to confirm a failing test is expected without reading the
test's body. The CI job summary (`.github/scripts/summarize-failures.js`) sorts every non-passing
test into a "By-design defect failures" section keyed on that same id, a "Defects that may be
FIXED" section for the rare case where a `test.fail()` reproduction passes unexpectedly (the
defect it names may no longer be present), and an "Unexpected failures" section for anything else.

## Expected failures

Verified by running the full suite on 2026-09-09 (`npm test`), which printed
**`13 failed, 34 passed (2.4m)`** across 47 tests. These counts are from that run, not taken on
trust from an earlier plan or from a prior ticket's report.

**`@api` — 13 of 21 fail** (`npm run test:api`). These are the run's entire `13 failed`:

| Test | Defect |
| --- | --- |
| `malformed JSON on POST /signin gets a JSON error envelope, not an HTML stack page [API-007]` | `API-007` |
| `POST /signin › a wrong otp for a known phone_no is rejected [API-002]` | `API-002` |
| `POST /signin › one user's otp presented with another user's phone_no is rejected [API-002]` | `API-002` |
| `POST /signin › a request missing otp produces the documented internal-error response [API-001]` | `API-001` |
| `POST /signin › a request missing phone_no produces the documented internal-error response [API-001]` | `API-001` |
| `POST /signin › an empty request body produces the documented internal-error response [API-002]` | `API-002` |
| `POST /signin › non-string phone_no and otp (numeric coercion) do not sign in [API-006]` | `API-006` |
| `POST /signin › non-string phone_no and otp (array coercion) do not sign in [API-006]` | `API-006` |
| `POST /signin › the 200 response's field types match the documented schema, including status_code [API-002]` | `API-002` |
| `GET /user/:id › a prototype-chain id ('toString') produces the documented error shape and status code [API-005]` | `API-005` |
| `GET /user/:id › a prototype-chain id ('constructor') produces the documented error shape and status code [API-005]` | `API-005` |
| `GET /user/:id › a prototype-chain id ('__proto__') produces the documented error shape and status code [API-005]` | `API-005` |
| `GET /user/:id › does not return otp and phone_no to an unauthenticated caller [API-003]` | `API-003` |

Six defects, `API-001`, `API-002`, `API-003`, `API-005`, `API-006` and `API-007`, are reproduced by
one or more of the rows above. A seventh, `API-004`, is registered in `docs/defects.md` but has no
row here: it is a contradiction inside `swagger.yaml`'s own documentation, not a defect an HTTP
request can trigger.

**`@e2e` — 11 of 26 are `test.fail()` reproductions** (`npm run test:e2e`). Each one below did
reproduce its defect in the 2026-09-09 run, and each is therefore counted among the run's
`34 passed`, not among its failures — see the opening section for why. All 26 `@e2e` tests
reported green. (This suite crosses the public internet to demoblaze, so it is slower and, per
`docs/test-plan.md`'s "case for a controlled test environment," inherently subject to drift the
`@api` suite is not.)

| Test | Case | Defect |
| --- | --- | --- |
| `TC-02: ordering with an empty cart is prevented — WEB-009` | `TC-02` | `WEB-009` |
| `TC-05: an invalid card number format is rejected — WEB-001` | `TC-05` | `WEB-001` |
| `TC-06: an impossible expiry date is rejected — WEB-002` | `TC-06` | `WEB-002` |
| `TC-08: adding to cart while logged out, then logging in, preserves the cart — WEB-010` | `TC-08` | `WEB-010` |
| `TC-11: Previous returns to the preceding page, and offers nothing on the first page — WEB-011` | `TC-11` | `WEB-011` |
| `TC-12: paging within a category keeps the category filter — WEB-012` | `TC-12` | `WEB-012` |
| `TC-17: acknowledging the purchase confirmation closes the order modal and clears its form — WEB-013` | `TC-17` | `WEB-013` |
| `TC-18: after a completed purchase, the navigation bar is reachable again — WEB-013` | `TC-18` | `WEB-013` |
| `TC-19: a cart already emptied by a completed order cannot be ordered from a second time — WEB-013` | `TC-19` | `WEB-013` |
| `TC-20: browser Back from a product opened out of a filtered listing restores that listing — WEB-014` | `TC-20` | `WEB-014` |
| `TC-21: the add-to-cart confirmation reads the same for anonymous and logged-in shoppers — WEB-007` | `TC-21` | `WEB-007` |

Nine defects are reproduced across these eleven tests (`WEB-013` spans three: `TC-17`, `TC-18`,
`TC-19`). Both figures — 21 `@api` tests, 13 failing; 26 `@e2e` tests, 11 of them `test.fail()`
reproductions — are from a run performed for this document, not carried forward from an earlier
ticket's report.

Every defect id above resolves to a full entry — severity, repro steps, expected vs. actual
behaviour — in `docs/defects.md`.

## Exercise map: brief → file

`docs/QA Take-Home-Test.docx.pdf` is the original brief. Each of its parts maps to a
specific deliverable:

| Brief exercise | Deliverable | File(s) |
| --- | --- | --- |
| 1a — task list, estimates, priorities for testing the whole site | Prioritised task table, estimation basis, calendar reconciliation | `docs/test-plan.md` |
| 1b — designed test case/scenario for the purchase flow, happy + unhappy paths | One happy path (`TC-01`) + unhappy paths and browse/listing coverage, `TC-02`–`TC-22`, intent-level, no selectors | `docs/test-cases.md` |
| 1c — automated test script for 1b | Page objects + Playwright specs implementing `TC-01`–`TC-22` | `tests/e2e/purchase-journey.spec.ts` (`TC-01` and the anonymous purchase journey), `tests/e2e/cart.spec.ts` (`TC-07`, `TC-08`, `TC-21`), `tests/e2e/checkout-validation.spec.ts` (`TC-02`–`TC-06`), `tests/e2e/browse.spec.ts` (`TC-09`–`TC-20`), page objects under `tests/e2e/pages/` |
| 1d — how to performance test the site (explanation; implementation optional) | Workload model (sourced funnel, load shape, thresholds, black-box limitation, unrun profiles) **and** a working k6 script | `docs/performance-plan.md` (the explanation) + `perf/demoblaze-load.js`, `perf/README.md` (the optional implementation, done anyway) |
| 2 — design and implement API tests against the supplied server | `@api` suite covering `/user/ids`, `/user/:id`, `/signin` across documented success/failure responses, schema, and field types | `tests/api/user.spec.ts`, `tests/api/signin.spec.ts`, `tests/api/smoke.spec.ts` |
| 3 — CI pipeline running the above on merge | Two-job GitHub Actions pipeline; red whenever any test does not pass, blocking nothing (no branch protection) — see `SPEC.md` "Toolchain"/"Pipeline" (brief asks for GitLab CI or equivalent; GitHub Actions used) | `.github/workflows/ci.yml`, `.github/scripts/summarize-failures.js` |

Supporting documents that don't map to a single brief line item but underpin all of them:
`SPEC.md` (design decisions and rationale for every choice above), `CONTEXT.md` (a ten-term
glossary used consistently across every document and test name), `docs/defects.md` (the defect
register every failing test resolves to), `docs/coverage-map.md` (every interaction demoblaze
exposes, once, with what it currently costs the suite), `docs/adr/0001-pagination-oracle.md` (the
accepted decision record arguing the pagination oracle `TC-11` and `TC-12` need), `ASSUMPTIONS.md`
(every place a decision had to be made rather than derived — including why the purchase-flow
confirmation dialog is the only oracle available; see below).

## Other commands

| Command | What it does |
| --- | --- |
| `npm run test:e2e` | Only the `@e2e` project (Chromium). |
| `npm run test:api` | Only the `@api` project. |
| `npm run test:cross-browser` | `@e2e` on Firefox and WebKit. Not part of `npm test` or CI — see `SPEC.md`'s browser matrix decision. |
| `npx playwright test --project=e2e --list` / `--project=api --list` | List every test in a project without running it. Verified working against a clean install. |
| `npm run perf:smoke` | A seconds-long, single-digit-VU k6 smoke run, proving the performance script and its thresholds execute without putting the full plan-shaped load on a shared third-party site. See `perf/README.md`. |
| `npm run perf:load` | The full plan-shaped k6 load (~9 minutes, 20 VUs) against live demoblaze. Never runs automatically; the same profile can be dispatched by hand from Actions → *Performance (manual)* when the result should be stored centrally rather than only in your terminal. |

### A non-zero exit from k6 is a measurement, not a broken script

The same "red is not necessarily wrong" caveat applies to `perf/`, for a different reason. k6
exits non-zero when a **threshold is breached**, and the thresholds are the plan's targets
(`docs/performance-plan.md` §4) measured against a live third-party site nobody here controls.

`npm run perf:smoke`, verified on 2026-09-09: 30.8s, 5 VUs at peak, 12 iterations, **all 54
checks passed** — and k6 still exited non-zero, because `http_req_duration{name:add_to_cart}`
measured `p(95)=302ms` against the plan's `p(95)<300`. A 2ms overshoot on demoblaze's latency
that day. Everything the script asserts about *correctness* held; one latency target did not.

So when reading a perf result, separate the three outcomes:

| Outcome | What it means |
| --- | --- |
| Thresholds held | The run met the plan's targets. |
| A threshold breached (non-zero exit) | A real measurement of the site, at that moment, from that network. Not a defect in this repository. |
| Zero samples on a metric | The run measured *nothing* — the script guards each threshold with a `count>0` companion so this can't masquerade as "held"; `.github/scripts/summarize-perf.js` flags such a verdict as vacuous. |

Because a breach depends on the network path and the hour, treat a single local run as evidence
about demoblaze, not as a pass/fail gate on this submission — which is why `perf/` is excluded
from `npm test` and from every automatic CI trigger (`SPEC.md`, Out of Scope).

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
