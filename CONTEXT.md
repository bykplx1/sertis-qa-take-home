# Context

Terms used consistently across every document and test name in this repo.

**e2e** — a test that drives the demoblaze website through a browser. Asserts only through the rendered page.

**api** — a test that calls the `api-main` server over HTTP. Never imports the server in-process.

**journey** — one complete path a shopper takes through the purchase flow, from landing to order confirmation.

**defect** — a numbered discrepancy between how a system should behave and how it does behave. Recorded in `docs/defects.md`, prefixed `WEB-` for demoblaze and `API-` for `api-main`.

**VU** — virtual user. One concurrent simulated visitor in a k6 performance run.

**threshold** — a pass/fail limit on a performance metric. A run with no thresholds produces a chart; a run with thresholds produces a verdict.

**funnel** — the drop-off ratios between consecutive journey steps, used to shape performance test traffic.

**think time** — a simulated pause between one shopper action and the next, so generated load resembles human traffic rather than a burst no real user produces.

**result set** — the products a listing is currently showing the shopper, after any active category filter. The whole catalogue when no filter is applied.

**page window** — the contiguous slice of the result set one page of a listing shows. The pages of a listing partition its result set: every product in the set appears in exactly one window, none twice, none missing.
