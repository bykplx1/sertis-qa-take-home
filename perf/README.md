# perf/ — k6 performance script

Implements the workload model documented in `docs/performance-plan.md` against
demoblaze. That document is the spec; this directory is the implementation.
Never runs automatically — no push, pull request or schedule triggers it
(SPEC.md, Out of Scope). Run it by hand locally, or dispatch it manually in
the pipeline (see "Run it in CI" below).

## Requirements

- [k6](https://k6.io/) installed locally (`k6 version`). This script uses the
  `k6/browser` module (native to modern k6, no separate binary needed).

## Run it

The full plan-shaped load (2m ramp to 20 VUs, 5m hold, 2m ramp down, ~9
minutes total, against the live demoblaze site):

```
npm run perf:load
# = k6 run perf/demoblaze-load.js
```

A heavily shortened smoke configuration — seconds instead of minutes,
single-digit VUs instead of 20 — for proving the script itself executes and
its thresholds evaluate, without putting the full plan-shaped load on a
shared third-party site:

```
npm run perf:smoke
# = k6 run -e PERF_PROFILE=smoke perf/demoblaze-load.js
```

## Run it in CI

`.github/workflows/perf.yml`, triggered by **manual dispatch only**: Actions →
*Performance (manual)* → *Run workflow*, choosing the `smoke` or `full`
profile and optionally recording why the run was made.

This exists because a performance result that lives only in a local terminal
is not evidence. A dispatched run executes the same script on a clean Ubuntu
runner and leaves the verdict behind:

- the threshold table and key metrics rendered straight into the run summary,
  by `.github/scripts/summarize-perf.js` — readable without downloading
  anything;
- `perf-summary.json` and the full console log attached as artifacts, retained
  **90 days** (longer than the CI suites' 14, because these runs are
  deliberate and infrequent and their value is that an old result can still be
  produced on request);
- k6 itself installed **pinned**, not whatever the apt repo holds that day —
  currently `K6_VERSION: '2.2.0'` in `.github/workflows/perf.yml`'s "Install
  k6" step, the one place to bump it. The resolved version is echoed into the
  run summary and folded into both artifacts (see "Thresholds", above), so a
  result from weeks ago still says which binary produced it.

A breached threshold fails that job. That is intended: the script produces a
verdict, and a red manual run is the honest rendering of a breach. It gates
nothing — the workflow runs on no pull request and no branch protection
references it.

The reasoning that keeps performance out of automatic CI is untouched: a
public demo site this repo does not own should not be put under load on a
schedule (`docs/performance-plan.md` §6). A human still decides every run;
what changed is only where the result is kept.

## What it does

- `funnel` scenario (`ramping-vus`): walks the sourced funnel from
  `performance-plan.md` §1 — land, product view (~35%), add to cart (~7.52%),
  cart view (~6%), purchase (~1.89%) — stochastically per iteration, at the
  documented load shape.
- `checkout` scenario (`constant-arrival-rate`): drives the checkout path
  directly and in parallel, because the funnel scenario alone produces too
  few completed purchases at 20 VUs to compute a meaningful p95 on order
  submission (`performance-plan.md` §3.1).
- `webVitals` scenario (`constant-vus`, browser-level): a couple of real
  Chromium VUs navigating the site under the same load, capturing Core Web
  Vitals (LCP) via k6's native `browser_web_vital_lcp` metric.

Every iteration that touches the cart uses its own synthetic per-iteration
cookie and deletes its own cart before finishing (`order_submission` for the
delete-on-purchase call, `cart_cleanup` for iterations that added items but
did not purchase) — nothing is left behind in the shared demo instance.

## Thresholds

The four business thresholds from `performance-plan.md` §4:

| Metric | Threshold |
|---|---|
| `http_req_duration{name:order_submission,scenario:checkout}` p95 | < 1000ms |
| `http_req_duration{name:add_to_cart}` p95 | < 300ms |
| `http_req_failed` rate | < 1% |
| `browser_web_vital_lcp` p75 | < 2500ms |

demoblaze's purchase flow never contacts a server with the order
(`ASSUMPTIONS.md`, "The one the acceptance criteria calls out by name"), so
"order submission" above is measured against the `deletecart` call that empties
the cart on purchase — the closest real request to that step — scoped to the
`checkout` scenario, not the funnel scenario's differently-distributed
purchases.

`options.thresholds` in `demoblaze-load.js` holds nine expressions in total,
not four: the four above, plus a `checks` threshold (below, no §4 equivalent)
and four sample-count guard expressions. All nine are listed and explained in
that file's `thresholds` block comments; the two kinds worth knowing about
here:

**Sample-count guards — precisely which thresholds carry one, and why.**
Not every threshold does, and the ones that don't need one, on purpose:

| Threshold | Guarded by | Why |
|---|---|---|
| `http_req_duration{name:order_submission,scenario:checkout}` | `http_reqs{name:order_submission,scenario:checkout}: ['count>0']` | k6 rejects `count` as an aggregation on Trend metrics — confirmed with `k6 archive`, which rejects the expression at parse time — so the guard lives on the matching Counter metric, same tag filter. |
| `http_req_duration{name:add_to_cart}` | `http_reqs{name:add_to_cart}: ['count>0']` | Same reason. |
| `browser_web_vital_lcp` | `web_vital_navigations: ['count>0']` | Same Trend restriction, but *not* `iterations{scenario:web_vitals}`: k6 increments `iterations` even when the iteration throws, so that metric would still read `>0` in exactly the case this guards against — every `page.goto()` timing out against the CDN, the headline case in the issue this branch fixes. `web_vital_navigations` is a Counter the script increments itself, only once `page.goto()` has resolved without throwing. |
| `http_req_failed` | *(none directly — see below)* | k6 rejects `count` on Rate metrics too, so there is no `http_req_failed`-local guard. It doesn't need one: `http_req_failed` and `http_reqs` are populated by the same request population (every protocol request marks both), so the global `http_reqs: ['count>0']` guard covers it transitively. |
| `checks` | *(none needed)* | `rate>0.99` (or `rate>0.80` on smoke — see "Checks", below) on zero samples evaluates `0 > 0.99`, which is `false` — a Rate threshold with no samples already fails loudly on its own, unlike the percentile/count thresholds above. |
| `http_reqs` (global) | itself: `['count>0']` | If not a single protocol request went out at all (setup failed, demoblaze unreachable), this is what catches it. |

A run that breaches any threshold fails — that is the intended behaviour, not
a bug: the script is designed to produce a verdict, not a chart. k6 exits `99`
on a breach.

**Checks.** Every `check()` in the script (setup, funnel, checkout) asserts
both the response status *and* response shape — e.g. that `/addtocart`'s
response looks like a persisted cart item, not just that it returned 200 —
because demoblaze can answer 200 with an error body when a request's payload
shape drifts, which a status-only check would never see (`checks:
['rate>0.99']` on `full` would then be near-decorative, passing everything
`http_req_failed` already passes). The shape checks are written from
demoblaze's documented public response schema; live verification against the
current API was attempted while writing this and blocked by the API itself
returning 500s to every test probe during that session, so treat them as
written from documented behaviour, not a fresh capture, and worth
re-confirming against a live `full` run.

The `checks` threshold value is per-profile, not one number: `> 99%` on
`full`, `> 80%` on `smoke`. `smoke` yields roughly 25-40 checks total (seconds
long, single-digit VUs); at that sample size, one transient demoblaze
failure — third-party infrastructure with no SLA — is 2.5-4% of the
population, enough to breach a 99% floor on its own and fail the "does the
script run" smoke check on demoblaze's noise rather than the script's
correctness. `@e2e` buys the equivalent tolerance via retries
(`ASSUMPTIONS.md`, "`@e2e` retries twice"); k6 has no retry mechanism, so the
threshold is loosened for `smoke` instead, deliberately, rather than left at
99% and treated as an acceptable false-positive rate.

Every run, local or dispatched, writes **`perf-summary.json`** into the working
directory via the script's `handleSummary()`, alongside the usual terminal
summary. `summaryTrendStats` is set explicitly so that p(75) — the percentile
the LCP threshold is set on — and `count` — a Trend metric's sample size,
which the JSON summary otherwise omits entirely — both appear in that file;
`.github/scripts/summarize-perf.js` reads `count` to tell a genuinely-held
threshold from one that reports "held" on zero samples.

`perf-summary.json` also carries a `k6_version` field (and the printed
summary — which the CI workflow tees into `k6-console.log` — carries the same
as a banner line) when `K6_RESOLVED_VERSION` is set in the environment, which
`perf.yml` does from the pinned `k6 version` it resolves at install time (see
"Run it in CI" and `.github/workflows/perf.yml`). A local run has no
`K6_RESOLVED_VERSION` and omits the field; `k6 version` on the terminal is the
answer there.

## Discrepancy between the plan and its implementation, reported rather than resolved

`performance-plan.md` §3 specifies the funnel scenario's ramp-down as
"duration left to k6's default ramp-down behaviour," but k6's `ramping-vus`
executor has no implicit default — every stage requires an explicit
duration. This script uses `2m` for the ramp-down stage, mirroring the `2m`
ramp-up, as the closest available reading of "default." A reviewer who wants
a different ramp-down duration need only change that one stage.
