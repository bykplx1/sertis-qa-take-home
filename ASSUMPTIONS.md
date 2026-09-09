# Assumptions

Every place this submission had to decide something the brief or the systems under test left
open. Collected in one file so a reviewer can judge the reasoning even where they disagree with
the conclusion. Each entry says what was assumed, why, and where to read the full reasoning if it
goes deeper than a paragraph.

## The one the acceptance criteria calls out by name

**demoblaze's purchase flow never contacts a server with the order.** Submitting an order
generates an order id in client-side JavaScript, empties the cart, and shows a confirmation
dialog (a SweetAlert DOM node, not a native browser dialog). Nothing is persisted server-side and
no order endpoint exists to query afterwards.

This is recorded as an assumption about how the demo is built, not as a defect (`docs/defects.md`'s
header says the same) — demoblaze was never specified to persist orders; it simply doesn't, and
that isn't a violation of any documented behaviour the way an accepted one-character card number
is.

**Consequence for where the `@e2e` assertion stops:** the confirmation dialog is the only oracle
available for a completed purchase. `TC-01` (`docs/test-cases.md`,
`tests/e2e/purchase-journey.spec.ts`) asserts three things and nothing past them: the dialog is
present, its order-id text is shaped like an id, and the amount shown equals the sum of the
products added to the cart. It does **not** assert the order id's actual value (it is
client-side random; asserting a specific value would be meaningless), and it does **not** verify
persistence by any other means — there is nothing to query. No `@e2e` test calls demoblaze's JSON
API directly to shortcut or double-check a UI assertion (`SPEC.md`, "Oracles" and "Seams").

## Scope and toolchain

- **Two exercises, one toolchain.** Playwright with TypeScript covers both `@e2e` (browser) and
  `@api` (HTTP) suites as two projects sharing one install, one runner, and one HTML report,
  rather than a second framework for the API half. `playwright.config.ts`; rationale in
  `SPEC.md` ("Toolchain").
- **`api-main/` is read-only.** Not modified to fix its defects, pin its Node version, or add a
  lockfile — the tests describe what's wrong instead. `CLAUDE.md`, `SPEC.md` ("Repository
  shape").
- **No test-management tooling, no cross-run history.** Playwright's built-in HTML reporter with
  traces on failure; Allure was considered and rejected because its distinguishing benefits need
  persistence and hosting this repo doesn't have. `SPEC.md` ("Reporting").
- **Chromium only in CI.** Firefox and WebKit are configured and runnable locally
  (`npm run test:cross-browser`) but not part of `npm test` or the pipeline; cross-browser
  execution is costed as its own task in `docs/test-plan.md` (task 10) rather than run for free
  alongside Chromium. `SPEC.md` ("Browser matrix").

## `@e2e` (demoblaze)

- **Selectors are text/role-based, not id-based**, because demoblaze reuses `id="itemc"` across
  all three category links and `id="article"` across every product card (`WEB-006`). Ids are
  used only where independently verified unique. `SPEC.md` ("Selector strategy").
- **The cart total is polled to a stable value before asserting it**, rather than read
  immediately after navigation, because the cart page issues one request per line item and
  recomputes the total as each resolves — an observable race (`WEB-008`). `SPEC.md` ("Cart total
  stability").
- **A fresh, randomised account is created per run** for the primary journey, with an anonymous
  journey as a secondary scenario, so concurrent runs cannot corrupt each other and no
  credentials are ever committed. `SPEC.md` ("Test data").
- **`@e2e` retries twice; `@api` does not retry at all.** demoblaze is crossed over the public
  internet and can be noisy for reasons that have nothing to do with the product; `api-main` is
  local, in-memory and deterministic, so a flaky result there is a finding worth preserving, not
  noise to absorb. `SPEC.md` ("Retries").
- **The listing's stale-window synchronisation is closed two different ways, because only one of
  the two clicks it covers has a live signal to wait on.** `ListingPage.clickPrevious()` (`TC-11`,
  `WEB-011`) waits for `#next2`'s `value` attribute to demonstrably change, or demonstrably not,
  rather than sleeping a fixed duration and hoping it outlasted whatever the 321-702ms stale window
  turns out to be on the machine the suite happens to run on. That attribute is the
  same one `docs/defects.md` (`WEB-011`) documents flipping `9`→`10` in lockstep with the corrupted
  window; a throwaway probe against the live site confirmed the flip lands in the
  same ~100ms poll interval as the rendered product names, so waiting on it is waiting on the
  content, not a proxy for it. The wait is bounded at 5s (`NEXT_VALUE_SETTLE_TIMEOUT_MS`,
  `tests/e2e/pages/listing-page.ts`) purely as a ceiling against a hung page, not as the thing doing
  the proving.

  `ListingPage.openCategory()`'s `settleAfterCategoryClick()` has no equivalent signal — the same
  probe found `#next2`'s `value` never moves on a category click, only on `Next`/`Previous` — so it
  falls back to a fixed 1000ms sleep (`STALE_WINDOW_CLEAR_MS`) before polling for stability. 1000ms
  against a documented worst case of 702ms is a thin margin on a public-internet, CI-hosted run, and
  reading too early here is a real risk. It is judged acceptable specifically because
  `openCategory()` settles on *any* window rather than asserting one is different from before: a
  premature read fails at the calling spec's own assertion, with a readable
  diff, not inside the page object, and not as a silent false pass the way `clickPrevious()`'s old
  sleep-based version could. If demoblaze ever exposes an equivalent signal for category filtering,
  this sleep should be replaced the same way `clickPrevious()`'s was.

- **Six `@e2e` failures were not anticipated at design time: `WEB-009` through `WEB-014`.**
  `TC-02`/`WEB-009` (empty-cart checkout accepted) and `TC-08`/`WEB-010` (cart lost on login) were
  written from intended behaviour before the suite existed, and only found to disagree with the
  live site once the suite actually drove a browser against it. `WEB-011` and `WEB-012`
  (pagination) were found by exploration and argued into defects by
  `docs/adr/0001-pagination-oracle.md`; `WEB-013` (the post-purchase order modal) and `WEB-014`
  (the filtered listing has no address) were likewise found live. Only `TC-05`/`WEB-001` and
  `TC-06`/`WEB-002` were anticipated during design, by reading `SPEC.md`'s "Defects identified
  during design" section. `docs/test-cases.md`, `docs/defects.md`.

## `@api` (api-main)

- **The server is driven over HTTP only, never imported in-process.** This keeps the seam at the
  process boundary and lets the identical suite run against a deployed instance by overriding
  `API_BASE_URL`, rather than coupling tests to Express internals. `SPEC.md` ("API test
  boundary").
- **Three of the original four `API-` defects were reproduced live; the fourth is a specification
  defect no HTTP request can trigger.** `API-001`, `API-002` and `API-003` were confirmed by
  static source inspection (`api-main/server.js` read against `api-main/swagger.yaml`) before the
  `@api` suite existed, and are now reproduced live by the suite itself. `API-004` is a
  contradiction between two passages of `swagger.yaml`'s own documentation — comparing two static
  passages is the whole test, so it remains verified by static source inspection alone. Three
  further defects, `API-005`, `API-006` and `API-007`, did not exist when the register was first
  written; all three were found once the `@api` suite drove HTTP requests against a running
  instance, and all three are reproduced live. `docs/defects.md`'s header states this verification
  history per entry so the register doesn't overclaim beyond what's actually been executed.

## Test planning (`docs/test-plan.md`)

- **Estimation basis: two QA engineers, ten elapsed working days, whole site in scope.** The
  effort column is person-days (20 PD total); the ten-day calendar comes from running two
  engineer-tracks in parallel, not from one engineer working twice as fast — see the plan's
  "Calendar reconciliation" table for how dependencies constrain the schedule.
- **A controlled test environment is recommended, not built.** demoblaze can't be seeded, reset,
  or instrumented, and can change or go down without notice — a risk this plan mitigates with
  resilient selectors and retries for a ten-day engagement, but would replace with a self-hosted
  mirror in a longer one. `docs/test-plan.md`, "The case for a controlled test environment"
  (task 2).

## Performance (`docs/performance-plan.md`, `perf/`)

- **All four k6 thresholds are assumptions, not benchmarks** — demoblaze publishes no SLO, and
  there is no server-side baseline to calibrate against. Stated as explicit numbers precisely so
  a reader can disagree with a specific figure: order submission p95 < 1000ms, add-to-cart
  p95 < 300ms, request failure rate < 1%, LCP p75 < 2500ms. `docs/performance-plan.md` §4.
- **20 concurrent VUs is a validity ceiling, not a politeness one.** Higher concurrency against a
  shared, CDN-fronted public demo increasingly measures the CDN's rate limiter and other tenants'
  traffic rather than demoblaze's own performance; there's no vendor-published capacity figure to
  size against, so this number is itself asserted rather than cited. `docs/performance-plan.md`
  §3.2.
- **The funnel is sourced where possible and labelled where it isn't.** Add-to-cart (7.52%) and
  purchase (1.89%) come from one dataset (IRP Commerce) so the pair is internally consistent; the
  product-view rate (~35%) is a midpoint of a 23%–50% aggregator spread and is flagged as the
  least reliable figure in the model; the cart-page rate (~6%) is derived, not benchmarked, and
  is labelled as such rather than dressed up as a citation. `docs/performance-plan.md` §1,
  §1.3, §1.4.
- **The work is black-box by construction.** Without server-side APM on infrastructure this team
  doesn't own, the load test can show *that* something is slow and *by how much*, never *why*.
  Recorded as a stated limitation, not an oversight. `docs/performance-plan.md` §7.
- **The performance script isn't wired into CI** and isn't run on a schedule — a public demo site
  shouldn't be put under load automatically. `SPEC.md`, Out of Scope; `perf/README.md`.
- **One documented discrepancy between the performance plan and its implementation:**
  `docs/performance-plan.md` §3 specifies the funnel scenario's ramp-down as "k6's default
  ramp-down behaviour," but k6's `ramping-vus` executor has no implicit default — every stage
  needs an explicit duration. `perf/demoblaze-load.js` uses `2m`, mirroring the ramp-up, as the
  closest reading of "default." Reported in `perf/README.md` rather than silently resolved, per
  this repo's convention of reporting drift instead of quietly absorbing it — see the "Reviewer
  map" note on `docs/defects.md`'s discrepancy tracking.

## Pipeline (`.github/workflows/ci.yml`)

- **Both jobs are reporting-only; nothing gates a merge.** This is a QA repository testing
  products it doesn't own — blocking its own merges over defects in `api-main` or demoblaze
  achieves nothing. `continue-on-error: true` on the test step in both jobs, plus a
  failure-by-defect-id summary written to the job output either way. `SPEC.md` ("Pipeline").
- **No branch-protection or required-check configuration exists anywhere in this repo**, by the
  same reasoning. `.github/workflows/ci.yml`'s header comment.
