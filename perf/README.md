# perf/ — k6 performance script

Implements the workload model documented in `docs/performance-plan.md` against
demoblaze. That document is the spec; this directory is the implementation.
Not wired into the CI pipeline (SPEC.md, Out of Scope) — run by hand.

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
| `http_req_duration{name:order_submission}` p95 | < 1000ms |
| `http_req_duration{name:add_to_cart}` p95 | < 300ms |
| `http_req_failed` rate | < 1% |
| `browser_web_vital_lcp` p75 | < 2500ms |

A run that breaches any of these fails — that is the intended behaviour, not
a bug: the script is designed to produce a verdict, not a chart.

## Discrepancy between the plan and issue #13, reported rather than resolved

`performance-plan.md` §3 specifies the funnel scenario's ramp-down as
"duration left to k6's default ramp-down behaviour," but k6's `ramping-vus`
executor has no implicit default — every stage requires an explicit
duration. This script uses `2m` for the ramp-down stage, mirroring the `2m`
ramp-up, as the closest available reading of "default." A reviewer who wants
a different ramp-down duration need only change that one stage.
