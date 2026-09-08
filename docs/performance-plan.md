# Performance Plan: demoblaze Workload Model

The workload model the k6 script (`perf/`) encodes: the funnel it drives traffic through, its
sources, the load shape, the thresholds it fails against, and the profiles the team should know
about but this engagement does not run. This document is the spec a k6 script gets written from;
every number below either carries a citation or is explicitly labelled an assumption.

Scope is demoblaze only. `api-main` belongs to a different exercise with a different scope (see
`SPEC.md`, Out of Scope) and is not load tested here.

## 1. The funnel

Five journey steps, each expressed as a percentage of the step before it (land is 100% of
sessions by definition). Where a step's rate is a published benchmark, the citation and its
range are given; where it is derived rather than benchmarked, that is stated instead of a
citation.

| Step | Rate (% of sessions) | Basis |
|---|---|---|
| **Land** | 100% | Definitional — the denominator every other step is measured against. |
| **Product view** | ~35% (midpoint of a 23%–50% spread) | Aggregator benchmark, least reliable figure in this model — see §1.3. |
| **Add to cart** | 7.52% | IRP Commerce, *Ecommerce Market Data* (irpcommerce.com/ecommercemarketdata.aspx), UK/Ireland B2C session-level benchmark — see §1.1. |
| **Cart** | ~6% | Derived, not benchmarked — see §1.4. |
| **Purchase** | 1.89% | IRP Commerce, *Ecommerce Market Data* — same report as add-to-cart, so the pair is internally consistent — see §1.1. |

Implied cart-to-purchase completion is 1.89% / 7.52% ≈ 25.1% of carts, i.e. an implied
**cart abandonment rate of ~74.9%** of initiated carts.

### 1.1 Why add-to-cart and purchase are one pair, not two spliced numbers

The add-to-cart rate (7.52%) and the purchase rate (1.89%) are both taken from IRP Commerce's
published ecommerce benchmark data rather than mixed from two vendors with different
methodologies (session definition, bot filtering, device mix all vary between aggregators and
make a spliced pair internally inconsistent). Using one source for both means the
cart-to-purchase math above is a real ratio inside one dataset, not an artefact of comparing two
different populations.

**Caveat 2 (methodology disagreement).** With the exception of Baymard's abandonment
meta-analysis (§1.2), every figure in this funnel — including this pair — is an aggregator
number published by an analytics vendor or benchmarking platform, not a controlled experiment.
Aggregators disagree on session definition, industry mix and bot filtering, and IRP Commerce's
own dataset is geographically limited to Great Britain, Northern Ireland and Ireland. This model
cites a point estimate from one such source and states that limitation rather than presenting
the number as ground truth.

### 1.2 Locating the implied abandonment rate against Baymard

Baymard Institute's *Cart Abandonment Rate* meta-analysis (baymard.com/lists/cart-abandonment-rate)
aggregates 50 independent studies and reports:

- **Average: 70.22%**
- **Range: 55.00% (Forrester Research, 2010) to 84.27% (SaleCycle, 2020)**

The ~74.9% implied by this model's add-to-cart/purchase pair sits inside that 55.00%–84.27%
spread, running above Baymard's 70.22% headline average rather than at it. That is expected and
stated rather than adjusted away: this model's figure comes from a single UK/Ireland-weighted
dataset, not the 50-study aggregate, so landing inside the documented spread — not on the
average — is the right bar to clear.

**Caveat 1 (what Baymard's figure actually measures).** Baymard's ~70% figure is measured
against **carts initiated**, not browsing sessions, and is routinely misquoted as a session-level
abandonment rate. This model applies the comparison correctly: the ~74.9% figure above is
computed against the add-to-cart cohort (carts initiated), which is the same population
Baymard's figure describes, not against all landing sessions.

### 1.3 Product-view rate: the least reliable figure

The product-view rate is a **midpoint of a 23%–50% spread** reported across analytics-vendor
aggregator benchmarks for "sessions reaching a product detail page," rather than a single cited
figure. It is flagged here as the least reliable number in the model because:

- it has no equivalent to Baymard's 50-study meta-analysis pulling it toward a defensible
  average — the spread itself is the only signal;
- "product view" is not consistently defined across sources (some count any product-card
  impression, others require a full product-detail-page load, which is what demoblaze's flow
  actually is); and
- demoblaze's own navigation (duplicate `id="itemc"`/`id="article"` attributes, no category
  filtering beyond three static links) has no equivalent in any of the source studies, so even a
  well-sourced industry figure is an approximation of demoblaze's specific UX, not a
  measurement of it.

35% (the midpoint) is used as the point estimate. This is the step most likely to need
revisiting if the recorded funnel numbers (§7) diverge from it after a real run.

### 1.4 Cart-page rate: derived, not benchmarked

The cart-page rate (~6%) is **not** an independently sourced benchmark. It is derived as
`add-to-cart rate × (assumed near-1 rate of proceeding from "added an item" to "viewing the cart
page")`, rounded to a whole number close to the add-to-cart rate itself, because on demoblaze
the cart page is one click from anywhere (a persistent nav link) and viewing it costs the shopper
nothing — unlike checkout, which is a real commitment. No published aggregator reports
"sessions that viewed the cart page" as a discrete funnel stage; it is not a metric analytics
vendors tend to publish independently of add-to-cart and checkout-initiation. This is stated as a
derivation rather than dressed up as a citation.

## 2. Caveats recap

The two caveats acceptance criteria call out explicitly, gathered in one place:

1. **Baymard's abandonment figure is measured against carts initiated, not sessions.** See §1.2.
   This model applies it to the add-to-cart cohort, which is the correct population.
2. **All figures except Baymard's are aggregator numbers that disagree by methodology.** See
   §1.1. IRP Commerce, and every other benchmark cited or considered here, publishes
   platform-specific or vendor-specific data with its own session definition and industry mix;
   none of it is a controlled experiment, and none of it should be read as more precise than a
   point estimate inside a stated range.

## 3. Load shape

- **Ramp-up:** 0 → 20 concurrent virtual users (VUs) over **2 minutes**.
- **Hold:** 20 VUs sustained for **5 minutes**.
- **Ramp-down:** 20 → 0 VUs (duration left to k6's default ramp-down behaviour for the final
  stage — no hold at zero).
- **Think time:** randomised uniform **1–5 seconds** between each simulated shopper action
  (land → browse, browse → add-to-cart, add-to-cart → cart view, cart → checkout). Applied
  identically inside every VU iteration; not scaled by funnel step.
- **VU identity:** each VU drives the anonymous cart path using a synthetic per-VU cookie/session,
  so every iteration creates and then deletes its own cart and leaves nothing behind in the
  shared demo instance (SPEC.md, Implementation Decisions — Performance approach).

This is a single k6 stages array for the browsing/funnel scenario: `[{duration: '2m', target: 20},
{duration: '5m', target: 20}, {duration: '<default ramp-down>', target: 0}]`. The checkout
scenario (§3.1) runs in parallel at a constant rate, not on this stages array.

### 3.1 Why a second, constant-rate checkout scenario exists

At a 1.89% purchase rate and 20 concurrent users over a ~7-minute run, the funnel scenario alone
produces a single-digit number of completed purchases — not enough to compute a meaningful p95
on the one transaction (order submission) this plan sets a threshold against. A second k6
scenario (`executor: 'constant-arrival-rate'` or equivalent) drives the checkout path directly
and in parallel with the funnel scenario, so order-submission has enough samples to report a
percentile against. This does not change the funnel model — it exists so the funnel model's
rarest step can actually be measured.

### 3.2 Why 20 concurrent users and not more

Higher concurrency is **rejected on validity grounds, not politeness.** demoblaze is shared,
third-party infrastructure sitting behind a CDN with rate limiting demoblaze does not document
and this team cannot inspect. Above some concurrency the load generator stops measuring
demoblaze's application performance and starts measuring:

- demoblaze's rate limiter (a 429 response is not a slow response — thresholds encoded against
  latency alone would misread a rate-limit wall as a performance win, and a failure-rate
  threshold would misattribute it to the application);
- other tenants' traffic and other teams' load tests running against the same shared demo
  instance at the same time, which this team cannot see or control; and
- network variance between the runner and a public endpoint, which dominates measurement noise
  at low absolute request volume long before it would on a private, provisioned target.

20 VUs is chosen as a concurrency the shared instance is expected to absorb as ordinary traffic
without triggering defensive behaviour that would contaminate the result with someone else's
mitigation rather than demoblaze's own performance. There is no vendor-published capacity figure
for demoblaze to size against (it is a public demo site, not a monitored production service), so
this number is itself an assumption, stated as one rather than backed by a citation that does not
exist.

## 4. Thresholds

All four threshold values below are **assumptions**, not benchmarks — demoblaze publishes no
SLO and this model has no server-side baseline to calibrate against. They are stated as explicit,
named numbers precisely so a reader can disagree with a specific figure rather than with a vague
notion of "fast enough."

| Metric | Threshold | Assumption basis |
|---|---|---|
| Order submission (checkout scenario), p95 | < 1000ms | The one business-critical transaction in the funnel; a round, conservative number for a public demo endpoint with no documented SLA. |
| Add-to-cart, p95 | < 300ms | The highest-frequency write in the funnel (7.52% of sessions, far more often than checkout); a tight bound because it sits earlier in the journey where shoppers are most likely to bounce on lag. |
| Request failure rate (all scenarios) | < 1% | A conventional default ceiling for any load test where the target has no documented error budget. |
| LCP (browser-level VUs), p75 | < 2500ms | The "good" boundary of Google's Core Web Vitals LCP scale — a third-party standard borrowed here because demoblaze publishes no equivalent of its own. |

All four are pass/fail thresholds encoded in the k6 script (`thresholds` block), not advisory
lines on a chart. A run that breaches any threshold fails, by design.

**What "order submission" actually measures.** demoblaze's purchase flow never contacts a server
with the order (`ASSUMPTIONS.md`, "The one the acceptance criteria calls out by name"), so there
is no order-submission request to time; the script measures the `deletecart` call that empties the
cart on purchase instead, as the closest real request to that step (`perf/demoblaze-load.js`,
tagged `order_submission`), scoped to the `checkout` scenario only.

Percentiles are reported throughout (p75/p95, per metric above), not averages — an average
hides the slow tail a real shopper actually experiences.

## 5. Measurement approach: protocol + browser, combined

Two kinds of virtual user run side by side:

- **Protocol-level VUs** (the bulk of the 20) generate the funnel and checkout load over raw
  HTTP, cheaply enough to sustain the concurrency in §3.
- **A small number of browser-level VUs** (k6 browser module) ride alongside, under the same
  load, to capture Core Web Vitals (LCP, per §4) as actually rendered.

Neither alone is sufficient: protocol-only measurement cannot see that a page makes several
chained round-trips before it finishes rendering (a real characteristic of demoblaze's product
and cart pages, which fetch data in a separate request per line item), so it would under-report
user-perceived latency. Browser-only measurement cannot generate meaningful concurrent load — a
browser instance is far more expensive per VU than a protocol request — so it cannot produce the
"under load" half of "user-perceived latency under real backend load." Combining them gets both
halves from one run.

## 6. Profiles documented but not executed

Four additional load profiles are documented here for the team's future use. **None of them are
run in this engagement** — see `SPEC.md`, Out of Scope, and the pipeline decision that keeps
performance testing off every automatic CI trigger (SPEC.md, Implementation Decisions —
Performance execution; a public demo site should not be put under any of these on a schedule).

That decision is about *automatic* execution, and the profiles in this table stay unrun under
either route. The load profile in §3 can be dispatched manually in the pipeline
(`.github/workflows/perf.yml`) so its verdict is retained centrally rather than only locally, but
nothing schedules it and no profile below is wired to any trigger at all.

| Profile | Purpose | Why not run here |
|---|---|---|
| **Stress** | Push concurrency past the validated 20-VU ceiling (§3.2) to find where demoblaze (or, more likely, its CDN/rate limiter) starts failing, establishing a practical upper bound. | Directly conflicts with the validity argument in §3.2 — deliberately triggering rate limiting against shared third-party infrastructure this team does not own or have permission to stress. |
| **Spike** | A sudden, short burst far above steady-state concurrency (e.g. 20 → 200 VUs in seconds), to see how the system recovers from a traffic surge rather than a gradual ramp. | Same third-party-infrastructure objection as stress, sharper: a spike is the load pattern most likely to look like an attack to a CDN's automated defences. |
| **Soak** | Sustained moderate load (e.g. 20 VUs) for hours, to catch degradation that only appears over time — memory leaks, connection-pool exhaustion, slow log growth. | Out of scope for a take-home window and, on infrastructure this team does not own or monitor, would tie up a shared public demo resource for hours with no server-side visibility (§7) to justify the cost. |
| **Breakpoint** | Slowly and monotonically increase load until a threshold breaches or the system fails outright, to find the actual capacity ceiling rather than assume one. | Same objection as stress — by construction it seeks the point at which demoblaze's defences engage, which is the outcome §3.2 argues this engagement should not produce. |

## 7. The black-box limitation

This performance work is black box, and that is a recorded limitation rather than an oversight.
Without server-side application performance monitoring (APM) on demoblaze's infrastructure —
which this team does not own, cannot install, and has no access to — the load test can establish
**that** something is slow and **by how much** (via the thresholds in §4 and the percentiles
they gate), but not **why**. A p95 breach on order submission could be database contention,
an unoptimised query, a downstream API call, GC pauses, or the CDN itself; nothing in this
plan's output can distinguish between those causes.

In a real engagement with an owned target, the load generator described here would be paired
with server-side APM (e.g. distributed tracing, a query-level profiler) so that the load test
provokes a condition and the APM explains it. Only the load-generation half of that pair exists
in this engagement; the explanatory half does not, because it requires instrumentation on
infrastructure outside this team's control. Findings from this plan should be read as "here is
where to look," not "here is what is wrong."

## Sources

- IRP Commerce, *Ecommerce Market Data* — irpcommerce.com/ecommercemarketdata.aspx (add-to-cart
  7.52%, purchase 1.89%, UK/Ireland B2C platform data).
- Baymard Institute, *50 Cart Abandonment Rate Statistics* —
  baymard.com/lists/cart-abandonment-rate (average 70.22%, range 55.00%–84.27% across 50
  studies).
- Google, Core Web Vitals thresholds — the "good" LCP boundary (≤2500ms) used as the assumption
  basis for the LCP threshold in §4.
- Product-view rate (§1.3): aggregator range compiled across multiple analytics-vendor ecommerce
  benchmark reports on "sessions reaching a product detail page"; treated as the least reliable
  figure in this model precisely because it is a range without a single authoritative source, per
  §1.3.
