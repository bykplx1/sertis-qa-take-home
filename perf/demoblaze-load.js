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
  },
  smoke: {
    funnelStages: [
      { duration: '5s', target: 2 },
      { duration: '10s', target: 2 },
      { duration: '5s', target: 0 },
    ],
    checkout: { rate: 6, timeUnit: '1m', duration: '20s', preAllocatedVUs: 2, maxVUs: 4 },
    webVitals: { vus: 1, duration: '20s' },
  },
};

const cfg = PROFILES[PROFILE];

export const options = {
  // k6's default trend stats are avg/min/med/max/p(90)/p(95) — which omits
  // p(75), the exact percentile performance-plan.md §4 sets the LCP threshold
  // on. The threshold still evaluates without this, but neither the summary
  // nor perf-summary.json would show the number it evaluated, so a reader
  // could see "held" and not what it held at. Added explicitly.
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(75)', 'p(90)', 'p(95)'],
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
    // A metric with zero samples (e.g. every iteration timing out before
    // reaching a given request) otherwise reports its threshold as
    // trivially held rather than as the measured-nothing run it actually
    // is. k6 rejects a `count` aggregation on Trend metrics
    // (`http_req_duration`, `browser_web_vital_lcp`) and on Rate metrics
    // (`http_req_failed`, `checks`) alike — only Counter metrics
    // (`http_reqs`, `iterations`) support it — so every threshold below is
    // paired with a `count>0` sibling threshold on the matching Counter
    // metric, same tag filter where one applies, as the sample guard.
    'http_req_duration{name:order_submission,scenario:checkout}': ['p(95)<1000'],
    'http_reqs{name:order_submission,scenario:checkout}': ['count>0'],
    // Add-to-cart p95 < 300ms (performance-plan.md §4).
    'http_req_duration{name:add_to_cart}': ['p(95)<300'],
    'http_reqs{name:add_to_cart}': ['count>0'],
    // Request failure rate < 1% (performance-plan.md §4), across every
    // protocol-level request in both scenarios.
    http_req_failed: ['rate<0.01'],
    // LCP p75 < 2500ms (performance-plan.md §4), from the browser-level VUs.
    browser_web_vital_lcp: ['p(75)<2500'],
    'iterations{scenario:web_vitals}': ['count>0'],
    // Every check() in this script (setup, funnel, checkout) is decorative
    // without this: a shape drift in a request payload (e.g. `:addtocart`)
    // can make demoblaze answer 200 with an error body on every call, which
    // http_req_failed never sees (still a 2xx) and which even makes
    // durations look *faster* (the server does less real work) — a run that
    // exercised nothing would otherwise report every threshold held.
    checks: ['rate>0.99'],
    // One global sample guard: if not a single protocol request went out
    // (setup failed, DNS/network down, demoblaze unreachable), every
    // threshold above that isn't independently guarded (http_req_failed,
    // checks) would otherwise hold vacuously on zero samples too.
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
  check(res, { 'GET /entries 200': (r) => r.status === 200 });

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
  check(entriesRes, { 'land: entries 200': (r) => r.status === 200 });
  thinkTime();

  // Step 2: product view (~35%).
  if (Math.random() < P_VIEW_GIVEN_LAND) {
    const productId = pickProductId(data.productIds);
    const viewRes = viewProduct(productId);
    check(viewRes, { 'product view 200': (r) => r.status === 200 });
    thinkTime();

    // Step 3: add to cart (~7.52%, conditional on having viewed a product).
    if (Math.random() < P_ADD_GIVEN_VIEW) {
      const addRes = addToCart(cookie, productId);
      check(addRes, { 'add to cart 200': (r) => r.status === 200 });
      cartInitiated = true;
      thinkTime();

      // Step 4: cart view (~6%, conditional on add-to-cart).
      if (Math.random() < P_CART_GIVEN_ADD) {
        const cartRes = viewCart(cookie);
        check(cartRes, { 'view cart 200': (r) => r.status === 200 });
        thinkTime();

        // Step 5: purchase (~1.89%, conditional on having viewed the cart).
        if (Math.random() < P_PURCHASE_GIVEN_CART) {
          const purchaseRes = deleteCart(cookie, 'order_submission');
          check(purchaseRes, { 'purchase (order submission) 200': (r) => r.status === 200 });
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
  check(viewRes, { 'checkout: product view 200': (r) => r.status === 200 });
  thinkTime();

  const addRes = addToCart(cookie, productId);
  check(addRes, { 'checkout: add to cart 200': (r) => r.status === 200 });
  thinkTime();

  const cartRes = viewCart(cookie);
  check(cartRes, { 'checkout: view cart 200': (r) => r.status === 200 });
  thinkTime();

  const purchaseRes = deleteCart(cookie, 'order_submission');
  check(purchaseRes, { 'checkout: purchase (order submission) 200': (r) => r.status === 200 });
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
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'perf-summary.json': JSON.stringify(data, null, 2),
  };
}
