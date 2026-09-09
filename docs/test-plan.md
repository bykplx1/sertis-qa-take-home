# Test Plan: demoblaze

Prioritised task list for testing the whole demoblaze site, tabulated so a QA lead can plan
against a real calendar and see what each line costs to buy. This plan covers demoblaze only;
`api-main` is a separate exercise with its own test suite (`tests/api`) and is out of scope here.

## Estimation basis

- **Two QA engineers**, working in parallel.
- **Ten working days elapsed**, including environment setup. This is a calendar constraint, not
  a headcount multiplier: the plan is costed in person-days (PD) and scheduled across two
  engineers so that the *elapsed* time fits ten days even though the *effort* exceeds what one
  engineer could do solo in that window.
- **Capacity**: 2 engineers × 10 days = **20 person-days**. Every task below is estimated in PD;
  the column totals reconcile to this figure (see "Calendar reconciliation").
- **Whole site in scope**: browsing, product detail, cart, checkout, auth, plus the
  cross-cutting quality dimensions (cross-browser, accessibility, visual, mobile, localisation)
  that a real engagement would be expected to price separately rather than absorb silently into
  functional testing.
- Priority uses the same Critical/High/Medium/Low scale as the defect register in
  `docs/defects.md`, applied here to test coverage rather than to a found defect.

## The case for a controlled test environment

demoblaze is third-party infrastructure: it cannot be seeded, reset, or instrumented, and it can
change or go down without notice from us. Every task below that automates against demoblaze
directly (tasks 3–9, 11–14) is therefore built on a foundation that can shift under the suite
without warning — a copy change breaks a text-based locator, a marketing A/B test breaks a flow
assumption, an outage blocks a whole day's run. None of that is true of `api-main`: it is
in-repo, deterministic, and versioned alongside the tests that exercise it, so the `@api` suite
only breaks when the tests or the server's own behaviour actually change.

This asymmetry means the `@e2e` suite will **decay** — accumulate failures caused by drift in
the target rather than by regressions in the product — in a way the `@api` suite structurally
cannot. In this ten-day engagement that risk is accepted and mitigated with resilient,
text/role-based selectors and a two-retry policy (see `SPEC.md`'s "Selector strategy" and
"Retries" sections for that decision; it is not yet recorded as a standalone ADR). In any
engagement longer than this one, the recommendation is a
**controlled test environment**: a self-hosted or containerised mirror of the target(s) that the
team seeds, resets, and instruments, so failures are attributable to the product rather than to
the internet between the runner and someone else's server. Task 2 below scopes that
recommendation as a costed deliverable (the analysis and mitigation plan) without attempting to
stand up a demoblaze mirror inside this ten-day window, which would be a substantially larger
effort than the window allows.

## Entry and exit criteria

**Test environments.** This plan's tasks assume the `@e2e` project as configured in
`playwright.config.ts:86-113`: Chromium is the default, CI-run environment; Firefox and WebKit are
configured and runnable locally (task 10) but not wired into CI. The target base url is
demoblaze itself, overridable via `E2E_BASE_URL` (default `https://www.demoblaze.com`) — there is
no staging or mirrored environment, per "The case for a controlled test environment" above.

**Entry criteria:**

- The harness (task 1) is scaffolded and `@e2e` runs against a reachable demoblaze before task 3
  starts; nothing downstream is buildable without it.
- The test-data strategy (a fresh randomised account per run) is agreed, since demoblaze cannot
  be seeded with a fixed account and every downstream task depends on that mechanism working.
- `SPEC.md`'s implementation decisions for this suite — seams, selector strategy, oracles — are
  settled, since work started against a contested seam would be rebuilt once it is.

**Exit criteria:**

- Every task in the table below is either executed and evidenced (a written deliverable, a
  landed spec file, or a defect-register entry) or explicitly descoped by the QA lead against
  the risk table below.
- Every defect found is recorded in `docs/defects.md` with severity, repro steps, and
  expected/actual behaviour, and every test that fails by design carries that defect's id in its
  title — the traceability `SPEC.md`'s "Further Notes" commits to.
- `npm run test:e2e` runs to completion and the CI `e2e` job produces a summary rather than a
  broken run. A green job is not the bar and will not happen while the defects stand: any
  non-passing test turns the job red, by-design reproductions included, so red is the expected
  steady state and the summary is what is read (see the README's "Expected failures"). What must
  not appear is a BROKEN RUN or an unexpected failure with no defect id.
- Remaining gaps are enumerated, not silent: rows still `costed-in-plan-not-automated` in
  `docs/coverage-map.md` are the honest remainder the QA lead signs off against, not an implied
  completeness.
- Exit is reached on the tenth elapsed day regardless of open defects in demoblaze — this is a
  fixed-calendar engagement against a system this plan cannot fix, so the calendar ends it, not a
  bug count reaching zero.

## Risks, mitigations, owners

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| demoblaze changes or degrades mid-engagement — third-party infrastructure that cannot be seeded, reset, or instrumented | High | High: breaks locators or flow assumptions without warning | Text/role-based selectors, a two-retry policy on `@e2e`, and the decay documented in "The case for a controlled test environment" above, accepted rather than denied | Whichever engineer's track currently owns the affected task (tasks 3–9, 11–14 per that section) |
| CI is deliberately non-blocking (`SPEC.md` "Pipeline"), so a genuine regression could land on `main` unnoticed | Medium | Medium: a real break hides among expected by-design failures | The `e2e` job's summary (`.github/scripts/summarize-failures.js`) names which defect explains each red `@e2e` test; a failure with no matching defect id is visible by inspection rather than buried in a merge that went through anyway | Both engineers, checked at hand-off |
| A one-line task scope hides real cost — task 3 already did this once | Medium | High: further misses eat into a fixed 20 PD budget with no contingency line | Priority ordering already protects Critical work from a slip (Critical tasks scheduled first per engineer-track); see "Estimate vs. actual" below for the concrete instance, its cost, and what a lead would cut to absorb it — recorded there rather than repeated here | QA lead |

**Defect triage.** New `docs/defects.md` entries are triaged by the QA lead against the same
Critical/High/Medium/Low scale used in "Estimation basis" above: Critical and High are triaged the
same working day they're filed (before the next day's task assignments are confirmed), Medium
within two working days, Low by task 15's end-of-engagement compilation if not sooner. This is the
same priority ordering that already protects the budget in the risk table above, stated as an SLA
rather than left implied.

**Roles.** Two QA engineers execute the task table in parallel per the calendar reconciliation
below; a QA lead makes the prioritisation calls in the risk table above when the fixed budget is
exceeded and triages defects per the SLA above. The developers who own demoblaze are outside this
engagement and receive `docs/defects.md` as their queue, not a request for a fix within this
ten-day window.

## Tasks

| # | Task | Scope | Priority | Estimate (PD) | Dependencies | Rationale |
|---|------|-------|----------|----------------|---------------|-----------|
| 1 | Environment & harness setup | Playwright project scaffold, two-project config (`@e2e`/`@api`), test-data strategy (randomised account per run), CI skeleton | Critical | 2.0 | None | Nothing else runs without a harness; blocks every other task. |
| 2 | Controlled test environment: risk case & mitigation plan | Written analysis of demoblaze's third-party volatility, selector-resilience strategy, retry policy, and a scoped recommendation for a future controlled/mirrored environment | High | 0.5 | 1 | Makes the environment case explicit and costed rather than assumed; see previous section. |
| 3 | Browse & discover | Category navigation, product listing, product detail page (name, price, description) | High | 1.5 | 1 | Entry point for every downstream journey; duplicate `id="itemc"`/`id="article"` attributes make selector design non-trivial. |
| 4 | Cart contents management | Add to cart (incl. native dialog handling), add multiple items, remove an item | Critical | 1.5 | 1 | Core commerce function; add-to-cart dialog and lack of stable cart-row identifiers are known friction points. |
| 5 | Cart total accuracy | Total equals sum of added items; total recalculates correctly after removal; total polled to stability against the request-per-item recompute | Critical | 1.0 | 4 | The cart total is observably racy (WEB defect candidate); this is the single highest-value correctness check on the cart. |
| 6 | Signup & login | Account creation, login, and the corresponding negative cases (duplicate signup, wrong password) | Critical | 1.5 | 1 | Required before an authenticated purchase can be tested; also the seam where password/cookie handling defects live. |
| 7 | Cart persistence across login | Add to cart while anonymous, then log in and confirm the cart survives | High | 1.0 | 4, 6 | Directly named in the brief as a shopper expectation; exercises the token-vs-username cart-keying inconsistency. |
| 8 | Checkout happy path & confirmation | Full purchase journey: cart → place order → confirmation dialog asserted on presence, order-id format, and amount | Critical | 1.5 | 5, 6 | The one journey every other unhappy-path test is a variant of; the confirmation dialog is the only oracle available. |
| 9 | Checkout validation (unhappy paths) | Empty name, empty card, invalid card format, impossible expiry date, empty cart | Critical | 2.0 | 8 | Highest defect density in the site: checkout is known to accept a one-character card and an impossible expiry, so these tests are expected to fail by design and carry defect ids. |
| 10 | Cross-browser regression | Re-run the critical-path suite (tasks 3–9) against Firefox and WebKit, configured but not wired into CI | Medium | 2.0 | 9 | Separately estimated per the brief: buying this means paying for a second and third execution of the same suite, not free with the Chromium pipeline. |
| 11 | Accessibility testing | Automated axe-core scan of key pages (home, product, cart, checkout) plus a manual keyboard-navigation and screen-reader spot check | Medium | 1.5 | 3, 8 | Costed but not implemented in this engagement; scoped so a QA lead can decide whether to buy it. |
| 12 | Visual regression testing | Baseline screenshots of key pages/states with pixel-diff comparison on subsequent runs | Low | 1.0 | 3, 8 | Costed but not implemented; lower priority than functional and accessibility coverage for a demo storefront. |
| 13 | Mobile-device testing | Responsive-layout checks at common breakpoints plus a spot check on at least one real or emulated mobile device per OS | Medium | 1.5 | 8 | A meaningful share of shopper traffic on any storefront is mobile; costed but not implemented here. |
| 14 | Localisation testing | Currency/number/date formatting review, character-set handling in text fields, and an i18n-readiness assessment (demoblaze ships English-only, so this is a readiness audit rather than a locale-switch test) | Low | 0.5 | 3 | Named explicitly in the brief as a costed dimension even though demoblaze itself does not currently expose multiple locales. |
| 15 | Defect register & reporting | Maintain `docs/defects.md` as findings surface across tasks 3–14; compile the final report and hand-off to the QA lead | High | 1.0 | 3–14 | The defect register is the primary deliverable of this engagement (see `SPEC.md`); this task is where it gets written up, not discovered incidentally. |

**Total: 20.0 PD** against a 20 PD budget (2 engineers × 10 days).

## Calendar reconciliation

The ten elapsed days are two parallel engineer-tracks, not one engineer working twice as fast.
Task numbers below refer to the table above.

| Day | Engineer A | Engineer B |
|---|---|---|
| 1 | Task 1 (Environment & harness setup, shared) | Task 1 (Environment & harness setup, shared) |
| 2 | Task 3 (Browse & discover) | Task 6 (Signup & login) |
| 3 | Task 2 (Controlled-env case) + start Task 4 | Task 4 (Cart contents management, cont'd) |
| 4 | Task 4 (Cart contents, finish) → Task 5 (Cart total accuracy) | Task 7 (Cart persistence across login) |
| 5 | Task 5 (finish) → Task 8 (Checkout happy path, start) | Task 8 (Checkout happy path, cont'd/pairing) |
| 6 | Task 9 (Checkout validation) | Task 9 (Checkout validation, cont'd) |
| 7 | Task 10 (Cross-browser regression) | Task 11 (Accessibility testing) |
| 8 | Task 10 (cont'd) | Task 13 (Mobile-device testing) |
| 9 | Task 12 (Visual regression) | Task 14 (Localisation testing) |
| 10 | Task 15 (Defect register & reporting, shared) | Task 15 (Defect register & reporting, shared) |

Dependencies in the task table are respected throughout: task 8 (checkout happy path) does not
start until both task 5 (cart total accuracy) and task 6 (signup & login) are done, and the four
costed-but-not-implemented quality dimensions (tasks 10–14) are all scheduled after the
functional core (tasks 3–9) they exercise. The register (task 15) runs as a background thread
throughout the engagement in practice — findings are logged as they occur, not withheld to day
10 — but is placed last in the schedule table because its estimate covers the compilation and
final hand-off, which genuinely is end-of-engagement work.

## Estimate vs. actual: task 3 was under-scoped

Task 3's one-line scope — "category navigation, product listing, product detail page" — costed
at 1.5 PD, is what a QA lead would have read as the browse surface's whole cost. It wasn't. Once
`docs/coverage-map.md` inventoried the surface in full, pagination turned out to be five
further interactions the scope line never named, and a defect oracle for two of them
(`WEB-011`, `WEB-012`) had to be argued from first principles rather than read off a spec
(`docs/adr/0001-pagination-oracle.md`) before a test could even be written. Category-narrows-
listing (`TC-13`–`TC-15`) turned out to need its own oracle work too: no rendered evidence
anywhere on the site connects a product to a category, so "Laptops shows only laptops" is not an
assertable claim, and the cases that shipped assert something weaker and harder to design —
selectivity and self-consistency — instead. None of that is visible in a one-line scope
that reads like a straightforward CRUD-listing check.

**This reconciliation is deliberately left broken, not retrofitted.** The task table above is
untouched: it still reads 1.5 PD for task 3 and the column still totals 20.0 PD against a 20 PD
budget. Rewriting task 3's estimate now, after the actual cost is known, would launder a planning
miss into a plan that always looked right — exactly the kind of retrofit that makes an estimation
section worthless to a reader trying to judge the *process* that produced it, not just its
output. The honest record is that a QA lead reading only the original task table would have
under-bought this task, and the estimation basis should be read with that failure left visible.

**What a QA lead would have had to drop to buy the real cost.** The pagination and category work
that actually shipped is, at a rough count, closer to a full day than the 1.5 PD task 3 already
carries for the whole browse surface — call it a further 0.5–1.0 PD once the ADR work, the two
listing oracles, and the auth-invariance parameterisation (`TC-13`–`TC-15` each running twice)
are counted. Against a fixed 20 PD budget with no slack, that has to come from somewhere else.
The candidates, in the order a lead should cut them: task 12 (visual regression, 1.0 PD, lowest
priority on the table and the dimension a demo storefront needs least) first, then task 14
(localisation, 0.5 PD, already scoped as a readiness audit rather than real locale coverage on a
site that ships English-only). Cutting both frees 1.5 PD, enough to absorb the miss without
touching anything Critical- or High-priority. Task 3 itself would need to be re-scoped from
"category navigation, product listing, product detail page" to explicitly name pagination and
the category-narrows-listing oracle, so the next estimate is not made against the same
incomplete description.
