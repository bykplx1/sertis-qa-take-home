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
  produced on request).

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

## Thresholds (`performance-plan.md` §4)

| Metric | Threshold |
|---|---|
| `http_req_duration{name:order_submission,scenario:checkout}` p95 | < 1000ms |
| `http_req_duration{name:add_to_cart}` p95 | < 300ms |
| `http_req_failed` rate | < 1% |
| `browser_web_vital_lcp` p75 | < 2500ms |
| `checks` rate | > 99% |

demoblaze's purchase flow never contacts a server with the order
(`ASSUMPTIONS.md`, "The one the acceptance criteria calls out by name"), so
"order submission" above is measured against the `deletecart` call that empties
the cart on purchase — the closest real request to that step — scoped to the
`checkout` scenario, not the funnel scenario's differently-distributed
purchases.

Every threshold expression also carries a `count>0` (or, for `checks`, is
itself a rate that only holds meaningfully on `>0` samples): a metric that
collected zero samples — every iteration timing out before reaching that
request, say — otherwise reports its threshold as trivially held rather than
as the measured-nothing run it actually is.

A run that breaches any of these fails — that is the intended behaviour, not
a bug: the script is designed to produce a verdict, not a chart. k6 exits `99`
on a breach.

Every run, local or dispatched, writes **`perf-summary.json`** into the working
directory via the script's `handleSummary()`, alongside the usual terminal
summary. `summaryTrendStats` is set explicitly so that p(75) — the percentile
the LCP threshold is set on — appears in that file; k6's default trend stats
omit it, which would leave the LCP threshold reporting "held" without ever
showing the number it held at.

## Discrepancy between the plan and its implementation, reported rather than resolved

`performance-plan.md` §3 specifies the funnel scenario's ramp-down as
"duration left to k6's default ramp-down behaviour," but k6's `ramping-vus`
executor has no implicit default — every stage requires an explicit
duration. This script uses `2m` for the ramp-down stage, mirroring the `2m`
ramp-up, as the closest available reading of "default." A reviewer who wants
a different ramp-down duration need only change that one stage.
