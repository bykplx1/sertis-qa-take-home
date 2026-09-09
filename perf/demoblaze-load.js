/**
 * k6 performance script for demoblaze — encodes the workload model documented in
 * `docs/performance-plan.md`. That document is the spec this script implements;
 * read it first if a number here looks unexplained.
 *
 * Two protocol-level scenarios run in parallel against demoblaze's JSON API
 * (`https://api.demoblaze.com`), plus a small browser-level scenario that rides
 * alongside the load to capture Core Web Vitals:
 *
 *   - `funnel`   — ramping-vus, 2m ramp to 20 VUs, 5m hold, 2m ramp down. Each
 *                  iteration walks the sourced funnel (performance-plan.md §1)
 *                  landing -> product view -> add to cart -> cart view / purchase,
 *                  stochastically, so traffic volume at each step matches the
 *                  documented rates.
 *   - `checkout` — constant-arrival-rate. At a 1.89% purchase rate the funnel
 *                  scenario alone produces too few completed purchases to compute
 *                  a meaningful p95 on order submission (performance-plan.md
 *                  §3.1), so this scenario drives the checkout path directly,
 *                  in parallel, at a steady rate.
 *   - `webVitals`— a couple of k6-browser VUs (real Chromium) navigating the site
 *                  under the same load, to capture LCP as actually rendered
 *                  (performance-plan.md §5). Protocol VUs alone cannot see
 *                  chained-request rendering cost; browser VUs alone cannot
 *                  generate meaningful concurrency.
 *
 * Every VU (protocol or browser-driving-cart-state) uses its own synthetic
 * per-iteration cookie for the anonymous cart path and deletes its own cart
 * before finishing, so the run leaves nothing behind in a shared, third-party
 * demo instance (performance-plan.md §3, "VU identity").
 *
 * ---------------------------------------------------------------------------
 * RUN IT (the one documented command, per the issue's acceptance criteria):
 *
 *   npm run perf:load
 *
 * which is:
 *
 *   k6 run perf/demoblaze-load.js
 *
 * This runs the full ~9-minute plan-shaped load against the live demoblaze
 * site. It never runs automatically: no pull request, push or schedule
 * triggers it (SPEC.md, Out of Scope — "Running any performance test in the
 * pipeline automatically"). It runs either by hand, as above, or by a
 * deliberate manual dispatch of .github/workflows/perf.yml, which exists so a
 * run's verdict is stored centrally rather than only on the laptop that
 * happened to run it.
 *
 * A heavily shortened smoke configuration exists for verifying the script
 * itself executes and its thresholds evaluate, without putting real load on
 * demoblaze:
 *
 *   npm run perf:smoke
 *
 * which is:
 *
 *   k6 run -e PERF_PROFILE=smoke perf/demoblaze-load.js
 * ---------------------------------------------------------------------------
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { browser } from 'k6/browser';
// Renders the same end-of-test summary k6 prints by default, which defining
// handleSummary() below otherwise suppresses. See handleSummary at the foot
// of this file.
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.4/index.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL = __ENV.DEMOBLAZE_API_URL || 'https://api.demoblaze.com';
const SITE_URL = __ENV.DEMOBLAZE_SITE_URL || 'https://www.demoblaze.com';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// The resolved k6 binary version, passed in by perf.yml (`-e
// K6_RESOLVED_VERSION=...`, captured from the pinned `k6 version` at install
// time — see C9) so it lands in perf-summary.json itself, not only in a CI
// log line that doesn't outlive the runner. Unset when run locally
// (`npm run perf:load` / `npm run perf:smoke`), where `k6 version` on the
// terminal is right there.
const K6_RESOLVED_VERSION = __ENV.K6_RESOLVED_VERSION || null;

// Counter incremented once per successful webVitals navigation — see
// webVitalsScenario and the `web_vital_navigations` threshold below.
const webVitalNavigations = new Counter('web_vital_navigations');

// `smoke` runs seconds instead of minutes and single-digit VUs instead of 20,
// so the script itself can be proven runnable (executes, requests succeed,
// thresholds evaluate) without running the full plan-shaped load against a
// shared third-party site. `full` (the default) is the plan as documented in
// performance-plan.md §3.
const PROFILE = __ENV.PERF_PROFILE === 'smoke' ? 'smoke' : 'full';

// Funnel rates from performance-plan.md §1. Each is "% of sessions" (of the
// step before it in the table), not independent — implemented below as a
// sequential drop-through, each step's participation probability computed
// conditional on having reached the previous step in the table. This is the
// standard way to build a funnel simulator from a rate table, and is stated
// here as an implementation decision since the plan itself specifies the
// target rates but not the conditional-probability mechanics.
const FUNNEL_RATES = {
  land: 1.0,
  productView: 0.35,
  addToCart: 0.0752,
  cartView: 0.06,
  purchase: 0.0189,
};

// Conditional probabilities derived from the table above (rate_n / rate_n-1),
// used to decide, at each step, whether *this* iteration continues.
const P_VIEW_GIVEN_LAND = FUNNEL_RATES.productView / FUNNEL_RATES.land;
const P_ADD_GIVEN_VIEW = FUNNEL_RATES.addToCart / FUNNEL_RATES.productView;
const P_CART_GIVEN_ADD = FUNNEL_RATES.cartView / FUNNEL_RATES.addToCart;
const P_PURCHASE_GIVEN_CART = FUNNEL_RATES.purchase / FUNNEL_RATES.cartView;

const PROFILES = {
  full: {
    funnelStages: [
      { duration: '2m', target: 20 }, // ramp-up, performance-plan.md §3
      { duration: '5m', target: 20 }, // hold
      // Ramp-down duration: the plan leaves this to "k6's default ramp-down
      // behaviour" but a ramping-vus executor has no implicit default stage —
      // every stage needs an explicit duration. Mirroring the 2m ramp-up is
      // the closest reading of "default" available; flagged as a discrepancy
      // in the implementation report.
      { duration: '2m', target: 0 },
    ],
    checkout: { rate: 6, timeUnit: '1m', duration: '9m', preAllocatedVUs: 10, maxVUs: 20 },
    webVitals: { vus: 2, duration: '9m' },
    // A nine-minute run at this load shape produces enough checks (all
    // scenarios combined) that a single genuinely-transient demoblaze
    // hiccup — this is third-party infrastructure with no SLA — doesn't
    // swing the rate; 99% is a meaningful signal at this sample size.
    checksThreshold: 'rate>0.99',
  },
  smoke: {
    funnelStages: [
      { duration: '5s', target: 2 },
      { duration: '10s', target: 2 },
      { duration: '5s', target: 0 },
    ],
    checkout: { rate: 6, timeUnit: '1m', duration: '20s', preAllocatedVUs: 2, maxVUs: 4 },
    webVitals: { vus: 1, duration: '20s' },
    // The smoke profile yields roughly 25-40 checks total (funnel is
    // seconds long with 2 VUs). At that sample size a single transient
    // demoblaze failure is 2.5-4% of the population — enough to breach a
    // 99% floor on its own, which would fail the "does the script run"
    // smoke check on demoblaze's noise rather than the script's
    // correctness. `@e2e` buys the equivalent tolerance via retries
    // (ASSUMPTIONS.md, "@e2e retries twice"); k6 has no retry mechanism,
    // so the threshold is loosened here instead. Deliberately looser than
    // `full`'s 99% — stated here, not left implicit.
    checksThreshold: 'rate>0.80',
  },
};

const cfg = PROFILES[PROFILE];

export const options = {
  // k6's default trend stats are avg/min/med/max/p(90)/p(95) — which omits
  // p(75), the exact percentile performance-plan.md §4 sets the LCP threshold
  // on. The threshold still evaluates without this, but neither the summary
  // nor perf-summary.json would show the number it evaluated, so a reader
  // could see "held" and not what it held at. Added explicitly. `count` is
  // added too: it's the only way a Trend metric's sample size (0, when
  // nothing was measured) shows up in the JSON summary at all —
  // `.github/scripts/summarize-perf.js` reads it to flag a "held" verdict
  // on zero samples as vacuous rather than clean.
  summaryTrendStats: ['count', 'avg', 'min', 'med', 'max', 'p(75)', 'p(90)', 'p(95)'],
  scenarios: {
    funnel: {
      executor: 'ramping-vus',
      exec: 'funnelScenario',
      startVUs: 0,
      stages: cfg.funnelStages,
      gracefulRampDown: '15s',
      tags: { scenario: 'funnel' },
    },
    checkout: {
      executor: 'constant-arrival-rate',
      exec: 'checkoutScenario',
      rate: cfg.checkout.rate,
      timeUnit: cfg.checkout.timeUnit,
      duration: cfg.checkout.duration,
      preAllocatedVUs: cfg.checkout.preAllocatedVUs,
      maxVUs: cfg.checkout.maxVUs,
      tags: { scenario: 'checkout' },
    },
    webVitals: {
      executor: 'constant-vus',
      exec: 'webVitalsScenario',
      vus: cfg.webVitals.vus,
      duration: cfg.webVitals.duration,
      options: {
        browser: { type: 'chromium' },
      },
      tags: { scenario: 'web_vitals' },
    },
  },
  thresholds: {
    // Order submission p95 < 1000ms (performance-plan.md §4). There is no
    // server-side order endpoint (SPEC.md — the purchase flow never contacts
    // a server with the order); the network operation that actually happens
    // on purchase is the deletecart call that empties the cart before the
    // client renders its confirmation. That call is tagged `order_submission`
    // and is the closest real request to measure against this threshold
    // (docs/performance-plan.md §4, ASSUMPTIONS.md's "one the acceptance
    // criteria calls out by name"). Scoped to `scenario:checkout` only
    // (performance-plan.md §4) — the funnel scenario's purchases arrive
    // after randomised think-times under ramping load, a differently
    // distributed population that would otherwise dilute this p95.
    //
    // Sample guards, precisely: a metric with zero samples (e.g. every
    // iteration timing out before reaching a given request) otherwise
    // reports its threshold as trivially held rather than as the
    // measured-nothing run it actually is. k6 rejects a `count`
    // aggregation on both Trend metrics (`http_req_duration`,
    // `browser_web_vital_lcp`) and Rate metrics (`http_req_failed`,
    // `checks`) — confirmed with `k6 archive`, which rejects the
    // expression at parse time; only Counter metrics support it. So:
    //   - `http_req_duration{...}` pairs with `http_reqs{...}` (same tag
    //     filter) as its guard, below.
    //   - `browser_web_vital_lcp` pairs with `web_vital_navigations`, a
    //     Counter this script increments itself (see webVitalsScenario) —
    //     *not* `iterations{scenario:web_vitals}`, which k6 increments even
    //     when the iteration throws, so it would still read >0 in exactly
    //     the case this guards against (every `page.goto()` timing out
    //     against the CDN).
    //   - `http_req_failed` needs no metric-local guard: it and `http_reqs`
    //     are populated by the same request population (every protocol
    //     request marks both), so the global `http_reqs` guard below covers
    //     it transitively.
    //   - `checks` needs no guard at all: `rate>0.99` on zero samples
    //     evaluates `0 > 0.99`, which is false — a Rate threshold with no
    //     samples already fails loudly on its own, unlike Trend/Counter
    //     percentile and count thresholds.
    'http_req_duration{name:order_submission,scenario:checkout}': ['p(95)<1000'],
    'http_reqs{name:order_submission,scenario:checkout}': ['count>0'],
    // Add-to-cart p95 < 300ms (performance-plan.md §4).
    'http_req_duration{name:add_to_cart}': ['p(95)<300'],
    'http_reqs{name:add_to_cart}': ['count>0'],
    // Request failure rate < 1% (performance-plan.md §4), across every
    // protocol-level request in both scenarios. Guarded transitively by the
    // global `http_reqs` threshold below — see the note above.
    http_req_failed: ['rate<0.01'],
    // LCP p75 < 2500ms (performance-plan.md §4), from the browser-level VUs.
    browser_web_vital_lcp: ['p(75)<2500'],
    web_vital_navigations: ['count>0'],
    // Every check() in this script (setup, funnel, checkout) is decorative
    // without this: a shape drift in a request payload (e.g. `:addtocart`)
    // can make demoblaze answer 200 with an error body on every call, which
    // http_req_failed never sees (still a 2xx) and which even makes
    // durations look *faster* (the server does less real work) — a run that
    // exercised nothing would otherwise report every threshold held. Checks
    // below assert response shape, not only status, so this can actually
    // detect that case. Threshold value is per-profile (`cfg.checksThreshold`)
    // — see PROFILES above for why smoke is deliberately looser than full.
    checks: [cfg.checksThreshold],
    // One global sample guard: if not a single protocol request went out
    // (setup failed, DNS/network down, demoblaze unreachable), every
    // threshold above that isn't independently guarded (http_req_failed)
    // would otherwise hold vacuously on zero samples too.
    http_reqs: ['count>0'],
  },
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Uniform random think time 1-5s, applied identically at every step
 * (performance-plan.md §3 — "not scaled by funnel step"). */
function thinkTime() {
  sleep(1 + Math.random() * 4);
}

function randomId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Synthetic per-iteration cookie for the anonymous cart path, mirroring the
 * shape demoblaze's own client sets (`user=<uuid-like>`), so every iteration
 * creates and later deletes its own, uniquely-keyed cart
 * (performance-plan.md §3, "VU identity"). */
function newSessionCookie() {
  return `user=perf-${__VU}-${__ITER}-${randomId('vu')}`;
}

function pickProductId(productIds) {
  return productIds[Math.floor(Math.random() * productIds.length)];
}

// ---------------------------------------------------------------------------
// Response-shape checks (C3). Every check() below pairs a status assertion
// with a shape assertion: demoblaze answers 200 with an error body when a
// request's payload shape drifts (the `/addtocart` case named in the
// issue), which a status-only check can never see — the run would report
// every threshold held while exercising nothing real. These are written
// against demoblaze's public response schema (`Items` arrays on list
// endpoints, a `title` field on a product), verified live against
// api.demoblaze.com on 2026-09-09 — an earlier attempt was blocked by the
// API returning 500s to every probe, and one assumption written from
// documentation in the meantime turned out to be false. `/addtocart` does
// *not* echo an id-like field back; it answers 200 with a zero-byte body.
// A check asserting that echo could never pass, and duly failed 201 times
// out of 201 in the first full pipeline run. What the write's own response
// can honestly carry is asserted below; whether the item persisted is
// asserted where it is observable, on the `/viewcart` read.
// ---------------------------------------------------------------------------

function hasItemsArray(r) {
  try {
    return Array.isArray(r.json('Items'));
  } catch (e) {
    return false;
  }
}

function looksLikeProduct(r) {
  try {
    const title = r.json('title');
    return typeof title === 'string' && title.length > 0;
  } catch (e) {
    return false;
  }
}

/** A successful `/addtocart` returns an empty body, so emptiness is the
 * whole of what this response can attest. That still catches the shape
 * drift this family of checks exists for: an HTML error page or a JSON
 * error payload arriving here with a 200 is exactly the "answered 200,
 * did nothing" case, and it is no longer empty. */
function isEmptyBody(r) {
  if (r.body === null || typeof r.body === 'undefined') return true;
  return typeof r.body === 'string' && r.body.trim().length === 0;
}

/** The real persistence oracle. Reads the cart back and asserts the product
 * just added is in it — the only place in this API where "the write stuck"
 * is observable at all. Returns a predicate so the check can close over the
 * id the calling iteration actually added, rather than asserting the weaker
 * "some item came back". */
function cartContains(productId) {
  return (r) => {
    try {
      const items = r.json('Items');
      return Array.isArray(items) && items.some((item) => String(item.prod_id) === String(productId));
    } catch (e) {
      return false;
    }
  };
}

function isNotHtmlErrorPage(r) {
  const body = typeof r.body === 'string' ? r.body.trim() : '';
  return body.length > 0 && !body.startsWith('<');
}

function viewProduct(productId) {
  return http.post(`${API_URL}/view`, JSON.stringify({ id: String(productId) }), {
    headers: JSON_HEADERS,
    tags: { name: 'view_product' },
  });
}

function addToCart(cookie, productId) {
  const body = JSON.stringify({
    id: randomId('cart-item'),
    cookie,
    prod_id: productId,
    flag: false, // anonymous path, matches demoblaze js/prod.js addToCart()
  });
  return http.post(`${API_URL}/addtocart`, body, {
    headers: JSON_HEADERS,
    tags: { name: 'add_to_cart' },
  });
}

function viewCart(cookie) {
  return http.post(
    `${API_URL}/viewcart`,
    JSON.stringify({ cookie, flag: false }),
    { headers: JSON_HEADERS, tags: { name: 'view_cart' } },
  );
}

/** Deletes the whole cart for `cookie`. Tagged `order_submission` when this
 * is the delete-on-purchase call (mirrors demoblaze js/cart.js
 * purchaseOrder(), which calls deleteCart() as the operation triggered by
 * placing an order — there is no separate order-submission endpoint,
 * per SPEC.md). Tagged `cart_cleanup` when it is only housekeeping for an
 * iteration that added items but did not "purchase", so cleanup traffic
 * never contaminates the order-submission threshold. */
function deleteCart(cookie, tagName) {
  return http.post(`${API_URL}/deletecart`, JSON.stringify({ cookie }), {
    headers: JSON_HEADERS,
    tags: { name: tagName },
  });
}

// ---------------------------------------------------------------------------
// setup() — resolve real product ids once, shared by every VU/iteration.
// ---------------------------------------------------------------------------

export function setup() {
  const res = http.get(`${API_URL}/entries`, { tags: { name: 'entries' } });
  check(res, {
    'GET /entries 200': (r) => r.status === 200,
    'GET /entries: Items is an array': hasItemsArray,
  });

  let productIds = [];
  try {
    const items = res.json('Items');
    productIds = (items || []).map((item) => item.id);
  } catch (e) {
    productIds = [];
  }

  if (productIds.length === 0) {
    // Fallback to demoblaze's well-known low product ids so the script is
    // still runnable if /entries is briefly unavailable during setup.
    productIds = [1, 2, 3, 4, 5];
  }

  return { productIds };
}

// ---------------------------------------------------------------------------
// funnel scenario — the sourced browsing funnel, ramping-vus load shape.
// ---------------------------------------------------------------------------

export function funnelScenario(data) {
  const cookie = newSessionCookie();
  let cartInitiated = false;

  // Step 1: land. 100% of sessions by definition (performance-plan.md §1).
  const entriesRes = http.get(`${API_URL}/entries`, { tags: { name: 'entries' } });
  check(entriesRes, {
    'land: entries 200': (r) => r.status === 200,
    'land: entries Items is an array': hasItemsArray,
  });
  thinkTime();

  // Step 2: product view (~35%).
  if (Math.random() < P_VIEW_GIVEN_LAND) {
    const productId = pickProductId(data.productIds);
    const viewRes = viewProduct(productId);
    check(viewRes, {
      'product view 200': (r) => r.status === 200,
      'product view: returned a product': looksLikeProduct,
    });
    thinkTime();

    // Step 3: add to cart (~7.52%, conditional on having viewed a product).
    if (Math.random() < P_ADD_GIVEN_VIEW) {
      const addRes = addToCart(cookie, productId);
      check(addRes, {
        'add to cart 200': (r) => r.status === 200,
        'add to cart: no error payload returned': isEmptyBody,
      });
      cartInitiated = true;
      thinkTime();

      // Step 4: cart view (~6%, conditional on add-to-cart).
      if (Math.random() < P_CART_GIVEN_ADD) {
        const cartRes = viewCart(cookie);
        check(cartRes, {
          'view cart 200': (r) => r.status === 200,
          'view cart: Items is an array': hasItemsArray,
          'view cart: the added product persisted': cartContains(productId),
        });
        thinkTime();

        // Step 5: purchase (~1.89%, conditional on having viewed the cart).
        if (Math.random() < P_PURCHASE_GIVEN_CART) {
          const purchaseRes = deleteCart(cookie, 'order_submission');
          check(purchaseRes, {
            'purchase (order submission) 200': (r) => r.status === 200,
            'purchase: response is not an HTML error page': isNotHtmlErrorPage,
          });
          cartInitiated = false; // cart already emptied by the purchase
        }
      }
    }
  }

  // Leave nothing behind: any iteration that initiated a cart but did not
  // purchase deletes it explicitly before finishing.
  if (cartInitiated) {
    deleteCart(cookie, 'cart_cleanup');
  }
}

// ---------------------------------------------------------------------------
// checkout scenario — constant-arrival-rate, always drives to purchase so
// order-submission has enough samples for a meaningful p95 (plan §3.1).
// ---------------------------------------------------------------------------

export function checkoutScenario(data) {
  const cookie = newSessionCookie();
  const productId = pickProductId(data.productIds);

  const viewRes = viewProduct(productId);
  check(viewRes, {
    'checkout: product view 200': (r) => r.status === 200,
    'checkout: product view: returned a product': looksLikeProduct,
  });
  thinkTime();

  const addRes = addToCart(cookie, productId);
  check(addRes, {
    'checkout: add to cart 200': (r) => r.status === 200,
    'checkout: add to cart: no error payload returned': isEmptyBody,
  });
  thinkTime();

  const cartRes = viewCart(cookie);
  check(cartRes, {
    'checkout: view cart 200': (r) => r.status === 200,
    'checkout: view cart: Items is an array': hasItemsArray,
    'checkout: view cart: the added product persisted': cartContains(productId),
  });
  thinkTime();

  const purchaseRes = deleteCart(cookie, 'order_submission');
  check(purchaseRes, {
    'checkout: purchase (order submission) 200': (r) => r.status === 200,
    'checkout: purchase: response is not an HTML error page': isNotHtmlErrorPage,
  });
}

// ---------------------------------------------------------------------------
// web vitals scenario — browser-level VUs riding alongside the protocol
// load, to capture LCP as actually rendered (plan §5). k6's browser module
// emits `browser_web_vital_lcp` natively on page navigation; no manual
// PerformanceObserver wiring is needed.
// ---------------------------------------------------------------------------

export async function webVitalsScenario() {
  const page = await browser.newPage();
  try {
    await page.goto(SITE_URL, { waitUntil: 'networkidle' });
    // Counted only if goto() resolves without throwing — a CDN timeout
    // (the exact C2 case named in the issue) throws before this line runs.
    // The browser's own PerformanceObserver captures LCP during page load,
    // so a navigation that reaches this point is the closest synchronous
    // proxy this API exposes for "a vital was actually recorded". Guards
    // the `browser_web_vital_lcp` threshold below. Deliberately not
    // `iterations{scenario:web_vitals}`: k6 increments `iterations` even
    // when the iteration throws, so that metric would still read >0 in
    // exactly the case this guard exists to catch.
    webVitalNavigations.add(1);
    thinkTime();

    const links = page.locator('.hrefch');
    const count = await links.count();
    if (count > 0) {
      await links.nth(Math.floor(Math.random() * count)).click();
      await page.waitForLoadState('networkidle');
    }
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// handleSummary — emit the run's verdict as a file as well as to the terminal.
//
// A local run prints its summary and it scrolls away; a pipeline run has to
// leave something behind that outlives the runner. Defining handleSummary
// suppresses k6's own end-of-test summary, so the terminal output is
// reproduced explicitly via textSummary and the same data is written to
// `perf-summary.json` for .github/scripts/summarize-perf.js to render and for
// the workflow to upload as an artifact.
//
// This runs identically locally and in CI: `npm run perf:smoke` leaves a
// perf-summary.json in the working directory too.
//
// K6_RESOLVED_VERSION (set by perf.yml, from the pinned `k6 version` at
// install time — see C9) is folded into both outputs here, not only echoed
// to $GITHUB_STEP_SUMMARY: into `perf-summary.json` as a top-level field,
// and into the printed summary — which the workflow `tee`s into
// `k6-console.log` — as a banner line. Both 90-day artifacts can say which
// k6 produced them without cross-referencing a separate CI log.
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  const summaryOut = K6_RESOLVED_VERSION ? { ...data, k6_version: K6_RESOLVED_VERSION } : data;
  const versionBanner = K6_RESOLVED_VERSION ? `k6 version (pinned in perf.yml): ${K6_RESOLVED_VERSION}\n\n` : '';
  return {
    stdout: versionBanner + textSummary(data, { indent: ' ', enableColors: true }),
    'perf-summary.json': JSON.stringify(summaryOut, null, 2),
  };
}
