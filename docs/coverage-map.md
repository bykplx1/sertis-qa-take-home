# Coverage map: demoblaze's interaction surface

**Status: draft.** Produced by the inventory ticket (#16) of the coverage map (#15). Every
interaction demoblaze exposes is listed once, with what it currently costs the suite. Later
tickets in #15 pick their work from this table; nothing here is a decision about what to
automate beyond the status each row already has.

Terms follow `CONTEXT.md`. **TC** ids are cases in `docs/test-cases.md`; **WEB-** ids are entries
in `docs/defects.md`; **task N** refers to the numbered task table in `docs/test-plan.md`.

## How each row was grounded

- **Automated** rows were read out of `tests/e2e/` — the four spec files (`smoke`,
  `purchase-journey`, `cart`, `checkout-validation`) and the five page objects under
  `tests/e2e/pages/`. A row is *automated* only if a spec asserts on it, not merely drives
  through it.
- **Costed in plan, not automated** rows map to a scoped line in `docs/test-plan.md`'s task
  table.
- **Consciously excluded** rows are the ones #15 put out of scope: not on the path to buying
  anything.
- The interaction list itself came from driving the live site with a throwaway Playwright
  script (2026-09-07) and dumping the DOM of the nav, carousel, category list, listing grid,
  pagination controls, product cards, product detail page, cart page, and every modal. Markup
  quoted below is from that run, not from memory.

## Status vocabulary

| Status | Means |
|---|---|
| `automated` | A spec in `tests/e2e/` asserts on this interaction today. |
| `driven-not-asserted` | A spec exercises this as a navigation step but asserts nothing about it. Counted separately from `automated` because the distinction is the whole point of this map. |
| `costed-in-plan-not-automated` | Named in a `docs/test-plan.md` task; no test exists. |
| `consciously-excluded` | Deliberately out of scope per #15; accounted for, not tested. |
| `automated` (fails by design) | Asserted, and the assertion fails against the live site because demoblaze violates its own intent. Carries a `WEB-` id. |
| registered defect, not asserted | A known `WEB-` entry lives on this interaction, but no test targets it — usually because it sits below the UI seam `@e2e` is restricted to. |

## The map

### Nav chrome (present on `index.html`, `prod.html`, `cart.html`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Brand `PRODUCT STORE` / logo → `index.html` (`#nava`) | all | no | consciously-excluded | — | #15 out of scope. `tests/e2e/smoke.spec.ts` asserts the brand link is *visible*, never clicks it. |
| `Home` nav link → `index.html` | all | yes | costed-in-plan-not-automated | — | Task 3. Every spec reaches home via `page.goto('/')` (`home-page.ts:14`); the link itself is never clicked. Confirmed live that clicking it resets a category-filtered listing to the full first page. |
| `Contact` → `#exampleModal` | all | no | consciously-excluded | — | #15 out of scope. |
| `About us` → `#videoModal` (video.js player) | all | no | consciously-excluded | — | #15 out of scope. |
| `Cart` nav link (`#cartur`) → `cart.html` | all | yes | costed-in-plan-not-automated | — | Task 4. `CartPage.open()` deliberately uses `page.goto('/cart.html')` instead, to dodge the stale order-modal backdrop (`cart-page.ts:11-19`). The nav link is therefore never exercised. |
| `Log in` link (`#login2`) → `#logInModal` | all | yes | automated | TC-01 | `HomePage.logIn()`. |
| `Sign up` link (`#signin2`) → `#signInModal` | all | yes | automated | TC-01 | `HomePage.signUp()`. |
| `Log out` link (`#logout2`, `onclick="logOut()"`) | all | ambiguous — see the auth question below | costed-in-plan-not-automated | — | The one gap in the plan itself: task 6's scope line names account creation, login, duplicate signup and wrong password, and does **not** name log-out. Recorded here so it stops being invisible. |
| `Welcome {username}` label (`#nameofuser`) | all | yes | automated | TC-01 | Asserted in `HomePage.logIn()` (`home-page.ts:56`) as the login oracle. |
| Navbar toggler (`.navbar-toggler`, collapsed viewport) | all | no | costed-in-plan-not-automated | — | Task 13 (mobile). |
| Footer copyright text | all | no | consciously-excluded | — | Static text, no interaction. |

### Home carousel (`#carouselExampleIndicators`, three slides)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Carousel auto-rotation (`data-ride="carousel"`) | home | no | consciously-excluded | — | #15 out of scope. |
| Carousel `Previous` / `Next` controls | home | no | consciously-excluded | — | #15 out of scope. |
| Carousel slide indicators (3 `<li data-slide-to>`) | home | no | consciously-excluded | — | #15 out of scope. |

### Category list (`.list-group`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| `CATEGORIES` header (`#cat`, `href=""`) | home | no | costed-in-plan-not-automated | — | Task 3. Empty `href` reloads the page rather than acting as a filter; it looks like a control and is not one. |
| `Phones` (`onclick="byCat('phone')"`) | home | yes | driven-not-asserted | TC-01, TC-02–TC-08 | `HomePage.openCategory('Phones')` (`home-page.ts:63`) is used as a navigation step by every journey spec. **No test asserts the listing actually narrows.** Live: 7 products. |
| `Laptops` (`byCat('notebook')`) | home | yes | costed-in-plan-not-automated | — | Task 3. Never driven by any test. Live: 6 products. |
| `Monitors` (`byCat('monitor')`) | home | yes | costed-in-plan-not-automated | — | Task 3. Never driven by any test. Live: 2 products. |
| Category links share `id="itemc"` | home | n/a | registered defect, not asserted | — | `WEB-006`. Worked around by role/name selectors (`home-page.ts` class comment); no test asserts the ids are unique. |

### Product listing grid (`#tbodyid .card`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Grid renders 9 product cards on page 1 | home | yes | costed-in-plan-not-automated | — | Task 3. No test asserts a card count or that the grid rendered at all. |
| Card title link → `prod.html?idp_=N` | home | yes | automated | TC-01 | `HomePage.openProduct(name)` clicks by accessible name. |
| Card image link → same product page | home | yes | costed-in-plan-not-automated | — | Task 3. Second route to the same destination; untested. |
| Card price (`<h5>$360</h5>`) | home | yes | costed-in-plan-not-automated | — | Task 3. Price is asserted on the detail page and in the cart, never on the card — so listing-vs-detail price agreement is unverified. |
| Card description (`<p id="article">`) | home | yes | costed-in-plan-not-automated | — | Task 3. `id="article"` is duplicated across every card (`WEB-006`). |
| Card image `alt` is empty on every card | home | no | costed-in-plan-not-automated | — | Task 11 (accessibility). Observed live: `<img class="card-img-top" src="imgs/galaxy_s6.jpg" alt="">`. |

### Pagination (`#prev2` / `#next2`)

All five rows are task 3 territory that task 3's one-line scope ("category navigation, product
listing, product detail page") does not actually name — the estimate-vs-actual note #15 calls
for belongs here.

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| `Next` from page 1 → page 2 | home | yes | costed-in-plan-not-automated | — | Task 3. The only way to reach 6 of the 15 products. |
| `Next` on the last page | home | yes | costed-in-plan-not-automated | — | Task 3. See pagination observations below. |
| `Previous` from page 2 | home | yes | costed-in-plan-not-automated | — | Task 3. |
| `Previous` on page 1 | home | yes | costed-in-plan-not-automated | — | Task 3. See pagination observations below. |
| Pagination while a category filter is applied | home | yes | costed-in-plan-not-automated | — | Task 3. See pagination observations below. |

### Product detail page (`prod.html?idp_=N`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Product name (`h2.name`) | product | yes | automated | TC-01 | `expect(productPage.name).toHaveText(...)`. |
| Product price (`h3.price-container`) | product | yes | automated | TC-01 | Asserted to contain `$`; parsed to a number and carried into the cart and confirmation assertions. |
| Product description (`.description`) | product | yes | automated | TC-01 | Asserted non-empty only; the text itself is not compared to the listing card. |
| Product image | product | yes | costed-in-plan-not-automated | — | Task 3. |
| `Add to cart` (`onclick="addToCart(N)"`) + native alert | product | yes | automated | TC-01, TC-07, TC-08 | `ProductPage.addToCart()` registers the dialog handler before the click (SPEC.md "Dialog handling") and asserts the message matches `/added/i`. |
| Add-to-cart alert text differs anonymous vs logged in | product | yes | registered defect, not asserted | — | `WEB-007`. The `/added/i` assertion is loose enough to pass under both wordings, so no test demonstrates the inconsistency. |
| Detail-page tabs (`#myTab`, single empty `<li class="active">`) | product | no | consciously-excluded | — | Renders as an empty pill list; no interaction available. |

### Cart page (`cart.html`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Cart rows list (`#tbodyid tr`) | cart | yes | automated | TC-01, TC-07, TC-08 | Rows addressed by visible product name; they carry no identifying attribute (SPEC.md "Selector strategy"). |
| Row product title | cart | yes | automated | TC-01 | Via `rowFor(name)`. |
| Row price | cart | yes | automated | TC-01 | `expect(rowFor(name)).toContainText(String(price))`. |
| Row image column | cart | yes | costed-in-plan-not-automated | — | Task 4. |
| `Delete` link on a row | cart | yes | automated | TC-07 | `CartPage.removeItem()`. |
| Total (`#totalp`) | cart | yes | automated | TC-01, TC-07 | Polled to stability against the request-per-item recompute (`WEB-008`, `cart-page.ts:41-76`). |
| Cart empty after a completed purchase | cart | yes | automated | TC-01 | Both journey tests re-open the cart and assert `isEmpty()`. |
| `Place Order` button → `#orderModal` | cart | yes | automated | TC-01–TC-06 | `CartPage.placeOrder()`; button has no id (SPEC.md), selected by role/name. |
| Empty-cart guard on `Place Order` | cart | yes | automated (fails by design) | TC-02 | `WEB-009`. |
| Cart survives log-in | cart | yes | automated (fails by design) | TC-08 | `WEB-010`; the `user` cookie is read directly to prove the mechanism. |
| Cart keyed by token when adding, by username when emptying | cart | yes | registered defect, not asserted | — | `WEB-005`. No test targets it. |

### Checkout modal (`#orderModal`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Modal opens on `Place Order` | cart | yes | automated | TC-01 | `CheckoutModal.waitUntilOpen()`. |
| `Total:` label (`#totalm`) inside the modal | cart | yes | costed-in-plan-not-automated | — | Task 8. Never asserted. Its `for="name"` collides with the Name field's label, which is why the page object uses field ids rather than `getByLabel` (`checkout-modal.ts:14-19`). |
| `Name` field (`#name`) | cart | yes | automated | TC-01, TC-03 | Blank-name rejection is a passing test. |
| `Country` (`#country`), `City` (`#city`) | cart | yes | driven-not-asserted | TC-01 | Filled with valid values; no test omits them to see whether they are required. |
| `Credit card` (`#card`) | cart | yes | automated | TC-01, TC-04, TC-05 | Blank card rejected (passes); invalid format accepted (`WEB-001`, fails by design). |
| `Month` (`#month`), `Year` (`#year`) | cart | yes | automated | TC-01, TC-06 | Impossible expiry accepted (`WEB-002`, fails by design). |
| `Purchase` button (`onclick="purchaseOrder()"`) | cart | yes | automated | TC-01–TC-06 | |
| Inline error label (`#errors`) | cart | yes | costed-in-plan-not-automated | — | Task 9. TC-03/TC-04 assert only that *no confirmation appears*; the message shown to the shopper is never read. |
| `Close` button / `×` dismiss | cart | no | consciously-excluded | — | #15 out of scope (modal dismiss paths). |

### Order confirmation (SweetAlert `.sweet-alert`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Confirmation appears after a valid order | cart | yes | automated | TC-01 | The only oracle available; there is no server-side order (SPEC.md). |
| Order id shape | cart | yes | automated | TC-01 | `/^\d+$/`; the value itself is deliberately not asserted. |
| Amount equals the sum of cart items | cart | yes | automated | TC-01 | |
| Confirmation *absence* on a rejected order | cart | yes | automated | TC-02–TC-06 | `OrderConfirmation.assertDoesNotAppear()` waits the full timeout rather than checking once. |
| `OK` button closes the confirmation | cart | yes | automated | TC-01 | `OrderConfirmation.close()` also asserts it becomes hidden. |

### Sign-up modal (`#signInModal`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Username / password fields + `Sign up` button + `Sign up successful.` alert | all | yes | automated | TC-01, TC-07, TC-08 | Handler registered before the click (`home-page.ts:24-39`). |
| Duplicate username rejected | all | see auth question | costed-in-plan-not-automated | — | Task 6, named explicitly in its scope line. |
| Blank username / blank password | all | see auth question | costed-in-plan-not-automated | — | Task 6, by implication; not named. |
| `Close` / `×` dismiss | all | no | consciously-excluded | — | #15 out of scope. |

### Log-in modal (`#logInModal`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Username / password fields + `Log in` button | all | yes | automated | TC-01, TC-08 | Oracle is the `#nameofuser` nav label. |
| Wrong password rejected | all | see auth question | costed-in-plan-not-automated | — | Task 6, named explicitly in its scope line. |
| Non-existent user rejected | all | see auth question | costed-in-plan-not-automated | — | Task 6, by implication. Observed live: a native alert reading `User does not exist.` — a *native* dialog, unlike the DOM `#errorl` label the modal also carries. |
| Inline error label (`#errorl`) | all | no | costed-in-plan-not-automated | — | Task 6. |
| Password travels base64-encoded with no auth header | all | n/a | registered defect, not asserted | — | `WEB-003`. Not reachable through the UI seam that `@e2e` is restricted to (SPEC.md "Seams"). |
| Session cookies set without `Secure`/`HttpOnly`/expiry | all | n/a | registered defect, not asserted | — | `WEB-004`. Same reason. |

### Contact and About-us modals

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Contact: email / name / message fields + `Send message` (`onclick="send()"`) | all | no | consciously-excluded | — | #15 out of scope. |
| About us: video.js player (`https://hls.demoblaze.com/index.m3u8`) and its controls | all | no | consciously-excluded | — | #15 out of scope. |

## Counts

| Status | Rows |
|---|---|
| `automated` | 27 |
| `automated` (fails by design) | 2 |
| `driven-not-asserted` | 2 |
| `costed-in-plan-not-automated` | 26 |
| `consciously-excluded` | 12 |
| registered defect, not asserted | 5 |
| **Total** | **74** |

The two rows marked *fails by design* are the empty-cart guard (TC-02 / `WEB-009`) and cart
survival across log-in (TC-08 / `WEB-010`). The other two designed failures, TC-05 (`WEB-001`) and
TC-06 (`WEB-002`), sit inside rows marked plainly `automated` — the `Credit card` and
`Month`/`Year` fields — because those same rows also carry passing assertions. Four designed
failures in total, unchanged from `docs/test-cases.md`.

Rows are counted per *interaction*, so one test case can appear on several rows (TC-01 touches
nine) and one row can carry several cases.

## The open question: where does auth sit relative to the purchase flow?

The brief scopes automation to "the process from selecting one or more products, adding them to
the cart, to submitting an order". Signing up and logging in are steps 2 and 3 of TC-01, so *some*
auth is plainly inside the journey; but "select → cart → order" does not reach duplicate signup,
wrong password, or log-out. The map needs one rule, not a case-by-case argument.

### Recommendation

**Split auth on a single line: auth is in the purchase flow exactly where it changes what a
shopper can buy or what happens to their cart. Everything else about auth is credential
handling, and stays costed under task 6 rather than being automated as browse/purchase work.**

That line puts these **inside** the flow, and they are already automated:

- sign up (TC-01 step 2) and log in (step 3) — the preconditions of an authenticated purchase;
- the anonymous purchase path (`purchase-journey.spec.ts`), which proves auth is optional to buying;
- cart survival across log-in (TC-08 / `WEB-010`) — the one place auth demonstrably changes what
  is in the cart.

And it puts these **outside**, remaining `costed-in-plan-not-automated` under task 6:

- duplicate signup, wrong password, non-existent user, blank credentials — these test the
  credential check, not the purchase. A shopper who fails them never reaches a cart.

**Log-out is the one row this rule promotes rather than parks.** Logging out is the mirror of
TC-08: it is the second place in the site where an auth action can change what is in the cart, and
demoblaze already has a registered identity-key defect on exactly that seam (`WEB-005`: cart keyed
by token when adding, by username when emptying). By the rule above, "add to cart while logged in,
log out, open the cart" is *inside* the purchase flow and worth a test — and it is the one
interaction the plan's task table never names at all. Recommend a TC-09-or-later case for it.

### Why this line and not the alternatives

- **"All auth is in scope, because TC-01 signs up."** Over-reads one step. TC-01 signs up because
  demoblaze cannot be seeded with a fixed account (SPEC.md "Test data"); the sign-up is a test-data
  mechanism, not the thing under test. Following this reading would pull the whole of task 6 into
  a purchase-flow ticket and silently double-count 1.5 PD that the plan already prices separately.
- **"No auth is in scope, because you can buy anonymously."** True and demonstrated by the
  anonymous journey test — but it would drop TC-08 and `WEB-010`, one of only two defects this
  suite found live rather than by reading the spec. The cart is the thing being bought with; an
  auth action that empties it is a purchase-flow defect wearing an auth costume.
- **"Decide per test case."** That is what the repo does today, and it is why `openCategory()` can
  be a navigation step in every spec while nothing asserts that it filters. A stated line is the
  point of this map.

## Pagination: observations from the live site

Facts recorded on 2026-09-07 from the throwaway exploration script. **These are observations
only.** Whether any of them is a defect is ticket #18's call, not this document's.

1. **Catalogue size and page size.** 15 products in total. Page 1 of the unfiltered home listing
   shows **9**; page 2 shows the remaining **6**. No page-number control exists — only `Previous`
   and `Next`.
2. **`Next` on the last page.** On page 2, `#next2` is present in the DOM but styled
   `display:none`, so it is not clickable. A forced programmatic `.click()` on it leaves the
   listing unchanged. `#prev2` stays visible on both pages.
3. **`Previous` on page 1.** `#prev2` is **visible and clickable on page 1**, where there is no
   previous page. Clicking it does not leave the listing unchanged: the grid re-renders as
   products **2–10** — a nine-item window shifted forward by one, dropping "Samsung galaxy s6" and
   pulling in "Apple monitor 24" from page 2. `#next2`'s `value` attribute changes from `9` to
   `10` at the same time. Clicking `Previous` a second time is idempotent (the window stays at
   offset 1). Reproduced across two independent runs.
4. **Pagination ignores the category filter.** With `Phones` (7 items), `Laptops` (6) or
   `Monitors` (2) selected, `#next2` is visible in every case even though no category has a second
   page. Clicking it in any of the three yields the **same** listing — the unfiltered page 2
   (`Apple monitor 24, MacBook air, Dell i7 8gb, 2017 Dell 15.6 Inch, ASUS Full HD, MacBook Pro`).
   The category filter is silently dropped. `Previous` from that state likewise returns the
   unfiltered 2–10 window, not the category.
5. **Category views are unpaginated.** Each of the three categories renders all of its matching
   products in one grid (7 / 6 / 2 = 15, matching the catalogue total). No category exceeds the
   9-item page size, so a filtered second page is unreachable by construction.
6. **The `Home` nav link resets the filter.** Selecting `Monitors` then clicking `Home` returns
   the full first page of 9.
