# Spec: QA Take-Home Test Deliverable

## Problem Statement

A QA engineer has been given a 7-day take-home test with three exercises: plan and automate testing for a public e-commerce website (demoblaze), design and implement api tests against a small local server supplied in `api-main/`, and wire both into a CI pipeline that runs on merge.

The reviewer is not primarily buying passing tests. They are assessing approach and quality of work. That creates the real problem: the two systems under test are both defective, and a submission that only demonstrates green tests demonstrates that the candidate did not look. Both systems must be tested against what they are *supposed* to do, and every gap between that and what they *actually* do must be reported rather than absorbed.

Three properties of the systems make this harder than it looks:

- **The demoblaze purchase flow has no server-side order.** Submitting an order generates an order id in client JavaScript, empties the cart, and shows a confirmation dialog. Nothing is persisted and no order endpoint exists. The confirmation dialog is the only oracle available.
- **`api-main` contradicts its own `swagger.yaml`** in at least four places, including a boolean-logic error in the signin guard and an unauthenticated endpoint that returns one-time passwords in plaintext.
- **demoblaze is third-party infrastructure.** It cannot be seeded, reset, or instrumented, and it can change or go down without warning.

## Solution

A single repository containing five things: written test-planning documents, an `@e2e` suite driving demoblaze through a browser, an `@api` suite driving the local server over HTTP, a runnable k6 performance script, and a GitHub Actions pipeline that runs both suites on pull request and on push to `main`.

Tests assert intended behaviour rather than observed behaviour. Where a system violates its intent, the test fails and the failure is traceable to a numbered entry in a defect register. The pipeline reports those failures without blocking merges, because this is a QA repository and blocking its own merges over defects in someone else's product achieves nothing.

## User Stories

1. As a reviewer, I want a single repository with an obvious entry point, so that I can evaluate the whole submission without hunting across archives.
2. As a reviewer, I want to run every test with one documented command, so that I can verify the work rather than take it on trust.
3. As a reviewer, I want each exercise from the brief mapped to a specific file, so that I can confirm nothing was skipped.
4. As a reviewer, I want stated assumptions collected in one place, so that I can judge the reasoning even where I disagree with the conclusion.
5. As a QA lead, I want a prioritised task list covering the whole demoblaze site with day estimates, so that I can plan a testing effort against a real calendar.
6. As a QA lead, I want the estimation basis stated explicitly, so that the numbers mean something.
7. As a QA lead, I want cross-browser testing costed as its own task, so that I can decide whether to buy it.
8. As a shopper, I want to browse products by category, so that I can find what I am looking for.
9. As a shopper, I want to open a product and see its name, price and description, so that I can decide whether to buy it.
10. As a shopper, I want to add a product to my cart and be told it worked, so that I know the action registered.
11. As a shopper, I want to add several products and see them all in my cart, so that I can buy them together.
12. As a shopper, I want the cart total to equal the sum of my items, so that I am not overcharged.
13. As a shopper, I want to remove an item from my cart and see the total recalculate, so that I can change my mind.
14. As a shopper, I want to sign up and log in, so that my cart is associated with me.
15. As a shopper, I want to place an order and receive a confirmation showing the amount, so that I know the purchase completed.
16. As a shopper, I want my cart emptied after purchase, so that I do not accidentally buy the same items twice.
17. As a shopper, I want to be prevented from ordering with an empty name, so that my order is deliverable.
18. As a shopper, I want to be prevented from ordering with an empty card number, so that payment does not silently fail.
19. As a shopper, I want an invalid card number rejected, so that I find out at checkout rather than days later.
20. As a shopper, I want an impossible expiry date rejected, so that obvious mistakes are caught immediately.
21. As a shopper, I want ordering with an empty cart to be prevented, so that I cannot create a meaningless order.
22. As a shopper who added items before logging in, I want my cart to survive logging in, so that I do not have to start over.
23. As a QA engineer, I want the purchase journey automated end to end, so that regressions are caught without manual re-testing.
24. As a QA engineer, I want tests to read as intent rather than selectors, so that the designed test case and the automated test are recognisably the same document.
25. As a QA engineer, I want selectors resilient to demoblaze's duplicate and missing element ids, so that tests fail for real reasons.
26. As a QA engineer, I want the add-to-cart native dialog handled explicitly, so that it does not silently block execution.
27. As a QA engineer, I want the cart total polled to stability, so that the page's incremental recalculation does not cause intermittent failures.
28. As a QA engineer, I want a fresh randomised account per run, so that concurrent runs cannot corrupt each other.
29. As a QA engineer, I want no credentials committed to the repository, so that the submission is safe to publish.
30. As a QA engineer, I want `@e2e` retried twice and `@api` not retried at all, so that network noise is absorbed while genuine nondeterminism stays visible.
31. As a QA engineer, I want an HTML report with traces on failure, so that I can diagnose a failure without reproducing it.
32. As a QA engineer, I want to run the api suite against a configurable base url, so that the same tests work locally and against the deployed server.
33. As a QA engineer, I want `GET /user/ids` verified to return every known user id, so that the discovery endpoint is trustworthy.
34. As a QA engineer, I want `GET /user/:id` verified against the documented schema for a known id, so that the contract holds.
35. As a QA engineer, I want an unknown user id verified to produce the documented error shape, so that clients can handle failure.
36. As a QA engineer, I want a valid phone and otp to sign in successfully and return the correct user, so that the primary function works.
37. As a QA engineer, I want a wrong otp to be rejected, so that the credential check is real.
38. As a QA engineer, I want a request missing `otp` to produce the documented response, so that partial input is handled per spec.
39. As a QA engineer, I want a request missing `phone_no` to produce the documented response, for the same reason.
40. As a QA engineer, I want an empty request body to produce the documented internal-error response, so that the guard behaves as written down.
41. As a QA engineer, I want response field types checked against the documented schema, so that clients relying on the types are not broken.
42. As a QA engineer, I want one user's otp rejected against another user's phone number, so that credentials cannot be mixed across accounts.
43. As a QA engineer, I want a test that fails by design to carry its defect id in its title, so that red output explains itself.
44. As a developer, I want a defect register with reproduction steps, expected and actual behaviour, and severity, so that I can act on findings without re-investigating them.
45. As a developer, I want defects numbered by system, so that I can tell at a glance which product a finding belongs to.
46. As a security reviewer, I want the plaintext otp exposure recorded as a defect, so that it is triaged rather than lost.
47. As a security reviewer, I want base64 password encoding and unflagged cookies recorded, so that the risk is visible.
48. As a performance engineer, I want a workload model derived from sourced funnel benchmarks, so that the load shape resembles real traffic.
49. As a performance engineer, I want randomised think time between steps, so that the generated traffic is not a shape no human produces.
50. As a performance engineer, I want browser-level and protocol-level measurement combined, so that I measure user-perceived latency under real backend load.
51. As a performance engineer, I want a dedicated checkout scenario alongside the funnel scenario, so that the transaction I care about is sampled enough to measure.
52. As a performance engineer, I want thresholds encoded as pass/fail, so that the run has a verdict rather than a chart.
53. As a performance engineer, I want percentiles rather than averages reported, so that the slow tail is visible.
54. As a performance engineer, I want stress, spike and soak profiles documented, so that the team knows what else to run and why.
55. As a performance engineer, I want the black-box limitation stated, so that nobody expects root-cause analysis from these numbers.
56. As a performance engineer, I want each virtual user to clean up its own cart, so that the run does not leave debris in a shared system.
57. As a team member, I want both suites to run on every pull request, so that evidence of passing tests exists before merge.
58. As a team member, I want the pipeline to report failures without blocking merges, so that a red result informs rather than freezes the repository.
59. As a team member, I want failures summarised in the pipeline output, so that I can see what broke without downloading artifacts.
60. As a team member, I want reports and traces retained as artifacts, so that I can investigate after the run has finished.
61. As a team member, I want the performance test kept out of every automatic pipeline trigger, so that CI runs stay fast and we do not put a public demo site under load on a schedule.
61a. As a team member, I want to be able to dispatch the performance run manually from the pipeline and have its verdict and artifacts retained there, so that a result is something I can link to rather than something that only ever existed on one laptop.
62. As a newcomer, I want a short glossary of the terms this repo uses, so that the same word means the same thing in every document.

## Implementation Decisions

**Repository shape.** One repository. `api-main/` is vendored as a read-only system under test and is not modified: not to fix its defects, not to pin its Node version, not to add a lockfile. Written deliverables live in `docs/`, tests in `tests/`, the performance script in `perf/`, pipeline config in `.github/workflows/`.

**Toolchain.** Playwright with TypeScript for both suites, configured as two Playwright projects sharing one install, one runner and one report. The api suite uses Playwright's request context rather than a second framework.

**Vocabulary.** Exactly two tags: `@e2e` for demoblaze browser tests, `@api` for `api-main` HTTP tests. No further taxonomy. Terms used consistently across all documents are defined in a short root `CONTEXT.md`: e2e, api, journey, defect, VU, threshold, funnel, think time, result set, page window.

**E2E architecture.** Page objects as classes, injected into tests as Playwright fixtures. Specs contain no selectors; a spec step reads as an intent-level call. This is deliberate: the designed test case document and the automated script should map to each other line for line.

**Selector strategy.** Text- and role-based locators. demoblaze reuses `id="itemc"` across all three category links and `id="article"` across every product card, cart rows carry no identifying attribute, and the Place Order button has no id. Ids are used only where verified unique.

**Dialog handling.** Add-to-cart triggers a native browser dialog and requires a dialog handler registered before the click. Purchase confirmation is a DOM node rendered by a SweetAlert component, not a native dialog, and is asserted as an element. These two must not be handled by the same mechanism.

**Cart total stability.** The cart page issues one request to fetch the cart and then one request per line item, recomputing the displayed total as each resolves. The total is polled to a stable value before assertion rather than read immediately after navigation.

**Test data.** The primary journey signs up a fresh randomised account per run. An anonymous journey is covered as a secondary scenario. No credentials are committed.

**Oracles.** `@e2e` assertions go through the rendered UI only. Order completion is asserted on the confirmation dialog's presence, its order-id format, and its amount matching the sum of added products. The order id value itself is not asserted; it is client-side random and asserting it would be meaningless. No api calls are used to verify a browser test.

**API test boundary.** Tests speak HTTP to a configurable base url, defaulting to a locally started server. The server module is never imported in-process. This keeps the seam at the process boundary and lets the identical suite run against the deployed instance.

**Assertion basis.** Both suites assert intended behaviour. Where a system deviates, the test fails, and its title carries the defect id so the failure is self-describing. No test is written to certify a known defect as correct.

**Retries.** `@e2e` retries twice; it crosses the public internet to a third-party site. `@api` does not retry; the server is local, in-memory and deterministic, so flakiness there is a finding and retrying would destroy the evidence.

**Reporting.** Playwright's built-in HTML reporter with traces captured on failure. Allure was evaluated and rejected: its distinguishing benefits are cross-run history and test-management integration, both of which require persistence and hosting infrastructure that does not exist here, and it lacks the trace viewer that is the genuinely useful artifact for debugging a third-party site.

**Browser matrix.** Chromium in the pipeline. Firefox and WebKit configured and runnable locally. Cross-browser coverage appears in the test plan as a separately estimated task.

**Pipeline.** GitHub Actions. Two jobs, `e2e` and `api`, both non-blocking, triggered on pull request and on push to `main`. The api job starts the local server before running. Both jobs upload their report and traces, and write a failure summary listing defect ids. Nothing gates the merge: this is a QA repository, the defects live in products it does not own, and evidence of a passing run is attached to the pull request rather than enforced by a gate.

**Performance execution.** The k6 script is runnable two ways, and neither is automatic. Locally by hand (`npm run perf:load`, `npm run perf:smoke`), and in the pipeline via a `workflow_dispatch`-only workflow (`.github/workflows/perf.yml`) that takes the profile as an input, renders the threshold verdict into the run summary, and retains `perf-summary.json` plus the console log as artifacts for 90 days. The reasoning that kept performance out of CI is unchanged and still holds — a public demo site this repo does not own should not be put under load on a schedule — and the manual workflow does not weaken it: there is no `push`, `pull_request` or `schedule` trigger, and a run happens only when a person starts one. What it adds is durability of evidence. A performance result whose only record is a terminal that has since been closed cannot be reviewed, compared, or trusted; one attached to a numbered run can. Threshold breaches fail that job, because the script is built to produce a verdict rather than a chart, and a manual workflow gates nothing.

**Performance approach.** k6 against demoblaze, as two parallel scenarios in one script:

- A browsing scenario following a sourced funnel: 100% land, ~35% view a product, ~7.5% add to cart, ~6% reach the cart, ~1.9% purchase. The add-to-cart and purchase figures are taken from a single published dataset (7.52% and 1.89% of sessions respectively) so that they are internally consistent rather than spliced from sources with different methodologies; they imply a cart abandonment rate of ~74.9%, which sits inside Baymard Institute's documented 55%–84.27% spread while running above its 70.19–70.22% headline average. The product-page view rate is the midpoint of a wide 23%–50% spread across studies and is the least reliable figure in the model. The cart-page rate is derived, not benchmarked, and is labelled as such.

  Two caveats are recorded alongside the numbers. First, Baymard's ~70% abandonment figure is measured against *carts initiated*, not browsing sessions, and is routinely misquoted as a session-level number; this model applies it correctly to the add-to-cart cohort. Second, with the exception of Baymard, these are aggregator figures published by analytics vendors and marketing blogs, and they disagree by methodology. The performance plan cites ranges with a chosen point estimate rather than presenting bare numbers as fact.

- A constant-rate checkout scenario, because at a realistic 1.9% conversion the checkout path would otherwise receive too few samples for a meaningful percentile. At 20 concurrent users over a seven-minute run, the funnel scenario alone would produce a single-digit number of completed purchases.

Protocol-level virtual users generate load; a small number of browser-level virtual users measure Core Web Vitals under that load. Protocol-only measurement cannot see that the home page makes two chained round-trips before rendering a product; browser-only cannot generate load.

Ramp to 20 concurrent users over two minutes, hold five minutes, ramp down. Think time randomised 1-5 seconds. Virtual users drive the anonymous cart path with a synthetic per-user cookie, so each iteration creates and then deletes its own cart and leaves nothing behind. Higher concurrency is rejected on validity grounds rather than politeness: against a shared demo site behind a CDN, higher numbers increasingly measure rate limiting and other people's tests.

Thresholds are assumed, stated as assumptions, and encoded as pass/fail: order submission p95 under 1000ms, add-to-cart p95 under 300ms, request failure rate under 1%, LCP p75 under 2500ms. Percentiles are reported, not averages.

Stress, spike, soak and breakpoint profiles are documented with their purpose but not executed.

**Performance limitation, recorded deliberately.** The performance work is black box. It can establish that something is slow and by how much, but not why, because there is no server-side instrumentation on infrastructure we do not own. In a real engagement the load generator would be paired with server-side APM so that the load test provokes a condition and the APM explains it; only half that pair exists here. This is a stated constraint, not an oversight.

**Estimation basis for the test plan.** Two QA engineers, ten working days elapsed including environment setup, whole site in scope. Roughly fifteen tasks, tabulated with scope, priority, estimate, dependencies and rationale.

**Defect register.** Numbered by system, `WEB-xxx` for demoblaze and `API-xxx` for `api-main`. Each entry records id, title, severity on a standard Critical/High/Medium/Low scale, steps to reproduce, expected behaviour, actual behaviour, and where applicable the spec reference. Severity only; priority is not tracked separately.

**Defects identified during design, before implementation.**

*api-main:* the signin guard uses a boolean OR where the spec requires both credentials, so a request with a phone number and no otp returns "not found" instead of the documented internal error; `status_code` is documented as a string but emitted as a number by the signin endpoint; the user-detail endpoint returns the one-time password and phone number to any unauthenticated caller; the swagger document's own not-found example carries a success message.

*demoblaze:* checkout accepts any card value including a single character; checkout accepts an impossible expiry date; passwords are base64-encoded rather than encrypted and travel in the request body with no authorization header; session cookies are set without Secure, HttpOnly or expiry; the cart is keyed by token when items are added but by username when emptied after purchase, so a logged-in user's cart may not reliably clear; duplicate element ids across category links and product cards; inconsistent add-to-cart confirmation text between logged-in and anonymous users; the cart total is computed across a request-per-item sequence and is observably racy.

**Recorded as an assumption rather than a defect.** demoblaze's purchase flow never contacts a server with the order. This is documented in the assumptions file as the reason the confirmation dialog is the only oracle available, explaining where the assertion stops. It is not written up as a defect.

## Testing Decisions

**What makes a good test here.** A good test asserts behaviour observable at the boundary of the system under test, expressed in the language of the person who cares about it. It does not reach past that boundary to verify itself, does not assert on values the system generates randomly, and does not encode the current implementation as the expectation. When it fails, its name should be enough to know what broke.

**Seams.** Three, and no lower ones:

1. **The demoblaze browser UI.** All `@e2e` assertions pass through the rendered page. No direct calls to demoblaze's json api from a test, no cookie manipulation to shortcut authentication.
2. **The `api-main` HTTP boundary.** All `@api` tests speak HTTP to a base url. The server module is never imported in-process, which would be a lower seam, would couple the tests to Express internals, and would prevent the same suite running against the deployed instance.
3. **demoblaze's public HTTP and browser surface,** for k6. This is the same boundary as seam 1 approached with a different tool, not an additional seam.

Two systems under test require two boundaries at minimum; seam 3 reuses seam 1's. No seam is created into page objects or fixtures. Page objects are test infrastructure: if one breaks, an `@e2e` test fails and reports it. There are no unit tests on test infrastructure.

**Modules covered.**

*`@e2e`, demoblaze:* the purchase journey as one happy path, plus seven unhappy paths - ordering with an empty cart; ordering with a blank name; ordering with a blank card; an invalid card format; an impossible expiry date; removing an item and confirming the total recalculates; and adding to cart while logged out then logging in to check the cart survives. The invalid-card and impossible-expiry cases are expected to fail, since the site performs no such validation; they are written from expected behaviour precisely because that is where the defects are.

*`@api`, api-main:* the three endpoints across their documented success and failure responses, response schema and field types checked against the swagger document, and credential handling including a cross-account case where one user's otp is presented with another user's phone number.

**Prior art.** None. The repository contains no existing tests. The conventions established by this spec are therefore the prior art for everything added later, which is a further reason to keep the vocabulary small and the seams few.

**Verification of the deliverable itself.** The pipeline running both suites on a pull request is the evidence that the suites execute. Expected failures are expected: a run in which every test passes would mean the assertions had been written from observed behaviour, and would be a defect in this deliverable.

## Out of Scope

- Modifying `api-main` in any way, including fixing the defects it demonstrably has.
- Fixing or reporting defects to demoblaze's maintainers.
- Cross-browser execution in the pipeline. Configured and runnable locally, costed as a task in the plan, not run automatically.
- Executing stress, spike, soak or breakpoint performance profiles. Designed and documented only.
- Running any performance test *automatically* — on pull request, on push, or on a schedule. The k6 run is available in the pipeline on manual dispatch only (`.github/workflows/perf.yml`), so that a deliberate run's verdict is stored centrally instead of only in the terminal of whichever laptop produced it. Nothing triggers it but a person.
- Accessibility, visual regression, mobile-device and localisation testing. Present as costed tasks in the plan; not implemented.
- Load testing `api-main`. It belongs to a different exercise with a different scope; the performance work targets demoblaze.
- Test-management tool integration and cross-run reporting history.
- Any merge-gating or branch-protection configuration.
- Root-cause analysis of performance findings, which is not possible without server-side access.

## Further Notes

The single most valuable property of this submission is that some tests fail. The reviewer supplied two defective systems and asked for an approach; a green pipeline over a server that leaks one-time passwords and a checkout that accepts a one-character card number would demonstrate that the assertions were written by reading the code rather than the specification. The defect register is the primary artifact and the passing tests are the supporting evidence.

The second-order risk is that this reads as an excuse for a broken suite. The mitigation is traceability: every failure carries a defect id in its title, every defect id resolves to a register entry with reproduction steps and severity, and the count of expected failures is stated up front. A reader should be able to confirm in under a minute that each red test is deliberate.

demoblaze is outside our control and may change or become unavailable. The `@e2e` suite will therefore decay in a way the `@api` suite will not. This is inherent to testing a third-party system and is the strongest practical argument, worth making in the test plan, for a controlled test environment in any real engagement.
