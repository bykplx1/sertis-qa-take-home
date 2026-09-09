# Coverage map: demoblaze's interaction surface

**Status: final.** This map lists every interaction demoblaze exposes, once, with what it
currently costs the suite; `automated` and `costed-in-plan-not-automated` rows are grounded
against the code and the test-plan's task table respectively, while `consciously-excluded` rows
are this map's own scoping call rather than something the code determines (see "How each row was
grounded"). The map's original open question — where auth sits relative to the purchase flow — is
now settled (see "Settled: where auth sits relative to the purchase flow" below), and two
finer-grained statuses, `driven-not-asserted` and `registered defect, not asserted`, are kept
rather than collapsed into the three broader ones because they name gaps those three can't (see
"Status vocabulary"). The full count — 77 interactions across six statuses, nine of them failing
by design — is in "Counts".

Terms follow `CONTEXT.md`. **TC** ids are cases in `docs/test-cases.md`; **WEB-** ids are entries
in `docs/defects.md`; **task N** refers to the numbered task table in `docs/test-plan.md`.

## How each row was grounded

- **Automated** rows were read out of `tests/e2e/` — the spec files (`smoke`,
  `purchase-journey`, `cart`, `checkout-validation`, `browse`) and the page objects under
  `tests/e2e/pages/`. A row is *automated* only if a spec asserts on it, not merely drives
  through it.
- **Costed in plan, not automated** rows map to a scoped line in `docs/test-plan.md`'s task
  table.
- **Consciously excluded** rows are the ones this map's scoping call put out of scope: not on
  the path to buying anything.
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
| `consciously-excluded` | Deliberately out of scope by this map's own scoping call; accounted for, not tested. |
| `automated` (fails by design) | Asserted, and the assertion fails against the live site because demoblaze violates its own intent. Carries a `WEB-` id. |
| registered defect, not asserted | A known `WEB-` entry lives on this interaction, but no test targets it — usually because it sits below the UI seam `@e2e` is restricted to. |

## The map

### Nav chrome (present on `index.html`, `prod.html`, `cart.html`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Brand `PRODUCT STORE` / logo → `index.html` (`#nava`) | all | no | consciously-excluded | — | Out of scope for this map. `tests/e2e/smoke.spec.ts` asserts the brand link is *visible*, never clicks it. |
| `Home` nav link → `index.html` | all | yes | consciously-excluded | — | Ruled out of scope once auth/nav sat right: a plain hyperlink with no application behaviour of its own, and its one interesting property — resetting a category filter — is `TC-13`'s oracle reached through a second door. Every spec reaches home via `page.goto('/')` (`home-page.ts:14`) instead. |
| `Contact` → `#exampleModal` | all | no | consciously-excluded | — | Out of scope for this map. |
| `About us` → `#videoModal` (video.js player) | all | no | consciously-excluded | — | Out of scope for this map. |
| `Cart` nav link → `cart.html` | `index.html`, `prod.html` | yes | automated (fails by design) | TC-18 | `#cartur` on `index.html`/`prod.html`. **Correction:** this row previously described the link on `cart.html` as the same `#cartur` control; on `cart.html` it is `<a href="#" onclick="showcart()">`, with no `#cartur` id and no navigation, and is out of scope for this row. `CartPage.open()` uses `page.goto('/cart.html')` for its own navigation steps (`cart-page.ts:11-19`), but `TC-18` deliberately clicks this link as the control under test, after a completed purchase — where it demonstrates `WEB-013`: the still-open order modal intercepts the click. |
| `Cart` nav link (`onclick="showcart()"`, no id, no navigation) | `cart.html` | no | consciously-excluded | — | A same-page refresh of the cart the shopper is already viewing; distinct control from the `#cartur` link above. No application behaviour to assert. |
| `Log in` link (`#login2`) → `#logInModal` | all | yes | automated | TC-01 | `HomePage.logIn()`. |
| `Sign up` link (`#signin2`) → `#signInModal` | all | yes | automated | TC-01 | `HomePage.signUp()`. |
| `Log out` link (`#logout2`, `onclick="logOut()"`) | all | yes, promoted by this map's rule | automated | TC-16 | The one gap in the plan itself: task 6's scope line names account creation, login, duplicate signup and wrong password, and does **not** name log-out. This map promoted it into the purchase flow as the mirror of `TC-08`, since it is the second place an auth action can change what is in the cart. `TC-16` asserts the cart belongs to the account, not the session: hidden after log-out, restored on logging back in. Passes. |
| `Welcome {username}` label (`#nameofuser`) | all | yes | automated | TC-01 | Asserted in `HomePage.logIn()` (`home-page.ts:56`) as the login oracle. |
| Navbar toggler (`.navbar-toggler`, collapsed viewport) | all | no | costed-in-plan-not-automated | — | Task 13 (mobile). |
| Footer copyright text | all | no | consciously-excluded | — | Static text, no interaction. |

### Home carousel (`#carouselExampleIndicators`, three slides)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Carousel auto-rotation (`data-ride="carousel"`) | home | no | consciously-excluded | — | Out of scope for this map. |
| Carousel `Previous` / `Next` controls | home | no | consciously-excluded | — | Out of scope for this map. |
| Carousel slide indicators (3 `<li data-slide-to>`) | home | no | consciously-excluded | — | Out of scope for this map. |

### Category list (`.list-group`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| `CATEGORIES` header (`#cat`, `href=""`) | home | no | costed-in-plan-not-automated | — | Task 3. Empty `href` reloads the page rather than acting as a filter; it looks like a control and is not one. |
| `Phones` (`onclick="byCat('phone')"`) | home | yes | automated | TC-01, TC-02–TC-08, TC-13, TC-14, TC-15 | `HomePage.openCategory('Phones')` (`home-page.ts:63`) is used as a navigation step by the journey specs, and is now also asserted on: `TC-13`/`TC-14`/`TC-15` enumerate every category from the DOM and assert the listing narrows to a non-empty proper subset, that it is covered by the union of categories, and that card/detail agree. Live: 7 products. |
| `Laptops` (`byCat('notebook')`) | home | yes | automated | TC-13, TC-14, TC-15 | Enumerated from the DOM, not hardcoded. Live: 6 products. |
| `Monitors` (`byCat('monitor')`) | home | yes | automated | TC-13, TC-14, TC-15 | Enumerated from the DOM, not hardcoded. Live: 2 products. |
| Category links share `id="itemc"` | home | n/a | registered defect, not asserted | — | `WEB-006`. Worked around by role/name selectors (`home-page.ts` class comment); no test asserts the ids are unique. |

### Product listing grid (`#tbodyid .card`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Grid renders 9 product cards on page 1 | home | yes | costed-in-plan-not-automated | — | Task 3. No test asserts a card count or that the grid rendered at all. |
| Card title link → `prod.html?idp_=N` | home | yes | automated | TC-01 | `HomePage.openProduct(name)` clicks by accessible name. |
| Card image link → same product page | home | yes | costed-in-plan-not-automated | — | Task 3. Second route to the same destination; untested. |
| Card price (`<h5>$360</h5>`) | home | yes | automated | TC-15 | Compared to the detail page's parsed price amount, not its text — the card reads `$360`, the detail page `$360 *includes tax`. Closes the listing-vs-detail price agreement gap this row previously flagged as unverified. |
| Card description (`<p id="article">`) | home | yes | costed-in-plan-not-automated | — | Task 3. `id="article"` is duplicated across every card (`WEB-006`). |
| Card image `alt` is empty on every card | home | no | costed-in-plan-not-automated | — | Task 11 (accessibility). Observed live: `<img class="card-img-top" src="imgs/galaxy_s6.jpg" alt="">`. |

### Pagination (`#prev2` / `#next2`)

Task 3's one-line scope ("category navigation, product listing, product detail page") never
named pagination; the estimate-vs-actual note in `docs/test-plan.md` records that gap. All five
rows are now automated, once `docs/adr/0001-pagination-oracle.md` settled the oracle these
assertions needed and could not have been written without.

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| `Next` from page 1 → page 2 | home | yes | automated | TC-09, TC-10 | The only way to reach 6 of the 15 products. `TC-09` asserts the two pages partition the catalogue. |
| `Next` on the last page | home | yes | automated | TC-10 | No further forward navigation is offered. Not a defect (ADR-0001 ruling 1). |
| `Previous` from page 2 | home | yes | automated (fails by design) | TC-11 | `WEB-011`. Returns products 2-10, not 1-9 — does not return to the preceding page. |
| `Previous` on page 1 | home | yes | automated (fails by design) | TC-11 | `WEB-011`. Visible, clickable, and moves the listing forward by one product instead of offering no navigation. |
| Pagination while a category filter is applied | home | yes | automated (fails by design) | TC-12 | `WEB-012`. `Next` is offered under every category though none has a second page, and paging forward discards the filter. |

### Product detail page (`prod.html?idp_=N`)

| Interaction | Page | In purchase flow | Status | TC | Notes |
|---|---|---|---|---|---|
| Product name (`h2.name`) | product | yes | automated | TC-01 | `expect(productPage.name).toHaveText(...)`. |
| Product price (`h3.price-container`) | product | yes | automated | TC-01 | Asserted to contain `$`; parsed to a number and carried into the cart and confirmation assertions. |
| Product description (`.description`) | product | yes | automated | TC-01 | Asserted non-empty only; the text itself is not compared to the listing card. |
| Product image | product | yes | costed-in-plan-not-automated | — | Task 3. |
| `Add to cart` (`onclick="addToCart(N)"`) + native alert | product | yes | automated | TC-01, TC-07, TC-08 | `ProductPage.addToCart()` registers the dialog handler before the click (SPEC.md "Dialog handling") and asserts the message matches `/added/i`. |
| Add-to-cart alert text differs anonymous vs logged in | product | yes | automated (fails by design) | TC-21 | `WEB-007`. `TC-21` compares the two states' messages to each other rather than hardcoding either literal — the journey call sites still use the intent-level `/added/i`, since wording was never their subject. |
| Detail-page tabs (`#myTab`, single empty `<li class="active">`) | product | no | consciously-excluded | — | Renders as an empty pill list; no interaction available. |
| Browser Back from a product opened out of a filtered listing | product | yes | automated (fails by design) | TC-20 | `WEB-014`. Filtering is pure client-side JS (`href="#"`, `byCat()`) and never enters the URL, so a filtered listing has no address; Back lands on the unfiltered first page instead of the filtered listing. |

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
| `Close` button / `×` dismiss | cart | no | consciously-excluded | — | Out of scope for this map (modal dismiss paths). |
| Modal state after dismissing a successful purchase's confirmation | cart | yes | automated (fails by design) | TC-17, TC-19 | `WEB-013`. `#orderModal` is never dismissed: it stays full-viewport with the shopper's name and full card number still in the form (`TC-17`), intercepting the whole nav bar (`TC-18`, above), and a second `Purchase` is accepted rather than refused (`TC-19` — the case's oracle stops at "accepted or refused"; that the accepted duplicate carries a different order id and a fabricated amount is established by exploration probes, not by this test — see `docs/defects.md`'s `WEB-013` entry). |

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
| `Close` / `×` dismiss | all | no | consciously-excluded | — | Out of scope for this map. |

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
| Contact: email / name / message fields + `Send message` (`onclick="send()"`) | all | no | consciously-excluded | — | Out of scope for this map. |
| About us: video.js player (`https://hls.demoblaze.com/index.m3u8`) and its controls | all | no | consciously-excluded | — | Out of scope for this map. |

## Counts

| Status | Rows |
|---|---|
| `automated` | 34 |
| `automated` (fails by design) | 9 |
| `driven-not-asserted` | 1 |
| `costed-in-plan-not-automated` | 15 |
| `consciously-excluded` | 14 |
| registered defect, not asserted | 4 |
| **Total** | **77** |

The nine rows marked *fails by design* are the empty-cart guard (TC-02 / `WEB-009`), cart
survival across log-in (TC-08 / `WEB-010`), `Previous` from page 2 and from page 1 (TC-11 /
`WEB-011`, two rows), pagination discarding a category filter (TC-12 / `WEB-012`), the
add-to-cart wording mismatch (TC-21 / `WEB-007`), browser Back discarding a filtered listing
(TC-20 / `WEB-014`), and the still-open order modal after purchase (TC-17/TC-18/TC-19 / `WEB-013`,
two rows: the nav `Cart` link it blocks, and the modal's own state). The remaining two designed
failures, TC-05 (`WEB-001`) and TC-06 (`WEB-002`), sit inside rows marked plainly `automated` —
the `Credit card` and `Month`/`Year` fields — because those same rows also carry passing
assertions. Across these nine rows plus the two `automated` rows above, nine distinct `WEB-` ids
fail by design in total (`WEB-011` and `WEB-013` each span two rows; the other seven span one
each) — this row count is unchanged by `WEB-013` now having three test cases (`TC-17`, `TC-18`,
`TC-19`) instead of one, since the underlying interactions those cases assert on are still the
same two rows. Matching `docs/test-cases.md` and the `@e2e` suite's actual result: 26 tests, 15
pass, 11 fail by design, across these same nine distinct defects.

Rows are counted per *interaction*, so one test case can appear on several rows (TC-01 touches
nine) and one row can carry several cases.

## Settled: where auth sits relative to the purchase flow

The brief scopes automation to "the process from selecting one or more products, adding them to
the cart, to submitting an order". Signing up and logging in are steps 2 and 3 of TC-01, so *some*
auth is plainly inside the journey; but "select → cart → order" does not reach duplicate signup,
wrong password, or log-out. The map needed one rule, not a case-by-case argument.

### The rule, as decided

**Split auth on a single line: auth is in the purchase flow exactly where it changes what a
shopper can buy or what happens to their cart. Everything else about auth is credential
handling, and stays costed under task 6 rather than being automated as browse/purchase work.**

That line puts these **inside** the flow, and they are automated:

- sign up (TC-01 step 2) and log in (step 3) — the preconditions of an authenticated purchase;
- the anonymous purchase path (`TC-22`, `purchase-journey.spec.ts`), which proves auth is optional
  to buying;
- cart survival across log-in (TC-08 / `WEB-010`) — the one place auth demonstrably changes what
  is in the cart;
- logging out (TC-16) — the mirror case, promoted rather than parked (below).

And it puts these **outside**, remaining `costed-in-plan-not-automated` under task 6:

- duplicate signup, wrong password, non-existent user, blank credentials — these test the
  credential check, not the purchase. A shopper who fails them never reaches a cart.

**Log-out was the one row this rule promoted rather than parked, and it shipped as `TC-16`.**
Logging out is the mirror of TC-08: it is the second place in the site where an auth action can
change what is in the cart, and demoblaze already has a registered identity-key defect on exactly
that seam (`WEB-005`: cart keyed by token when adding, by username when emptying). Measured once
`TC-16` landed: it passes — the cart belongs to the account, not the session, and is hidden rather
than destroyed by logging out. It does not demonstrate `WEB-005`; three completed purchases, two
of them logged in, all left the cart correctly empty, so the seam this map promoted on suspicion
of a defect is the one demoblaze gets right. `WEB-005` stays a registered defect, not asserted, on
its own row above.

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

## Pagination: observations from the live site, and the rulings they led to

Facts recorded on 2026-09-07 from the throwaway exploration script. `docs/adr/0001-pagination-oracle.md`
has since ruled on each: behaviour 2 is `WEB-011` (High), behaviour 3 is `WEB-012`
(Medium), behaviour 1 is not a defect, and behaviour 4 (page size) is not assertable. `TC-09`
through `TC-12` (`tests/e2e/browse.spec.ts`) now automate all five rows in the Pagination table
above.

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
