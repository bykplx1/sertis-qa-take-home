# Designed test cases: the demoblaze storefront

The written source for the `@e2e` coverage of demoblaze's storefront: browsing and category
filtering, the product listing and its pagination, the cart, and the purchase journey. Each case
is stated as intent: preconditions, steps, expected result. No selectors, no code — the automated
specs (`tests/e2e/*.spec.ts`) map to these cases step for step.

Terms follow `CONTEXT.md`: **journey** is one complete path from landing to order confirmation,
**e2e** is a test that drives demoblaze through a browser, **defect** is a numbered discrepancy
recorded in `docs/defects.md`, **result set** is the products a listing is currently showing, and
**page window** is the contiguous slice of that result set one page of a listing shows.

A case expected to fail carries the `WEB-` defect id it demonstrates. Two cases below were known
at design time to be expected to fail because demoblaze performs no such validation: `TC-05` and
`TC-06`. Their defect ids assume `docs/defects.md` numbers demoblaze's card-and-expiry defects
`WEB-001` (any card value accepted) and `WEB-002` (impossible expiry accepted), in the order
those defects are listed in `SPEC.md`'s "Defects identified during design" section — the
register is being built in a parallel ticket; if its numbering lands differently, these two ids
should be updated to match rather than the register renumbered to match this document.

Two further cases, `TC-02` and `TC-08`, were written from intended behaviour at design time and
only found to fail once the `@e2e` suite actually drove a browser against the live site — neither
demoblaze defect was anticipated when this document was first written. `TC-02` carries `WEB-009`
(found implementing the checkout-validation suite) and `TC-08` carries `WEB-010`
(found implementing the cart-behaviour suite); both ids were added to the register
after the fact rather than assumed up front, the same way `TC-05` and `TC-06` assumed `WEB-001`
and `WEB-002` up front.

`TC-09` onward cover the browse and listing surface, added once `docs/adr/0001-pagination-oracle.md`
settled a pagination oracle and the remaining category, cart-identity and post-purchase-navigation
cases were designed on top of it. Five of them are expected to fail by design: `TC-11`
(`WEB-011`), `TC-12` (`WEB-012`), `TC-17` (`WEB-013`), `TC-18` (`WEB-014`), and `TC-19`
(`WEB-007`, added once the existing `/added/i` assertion was found too loose to demonstrate it).
Nine cases are therefore expected to fail by design in total: `TC-02`, `TC-05`, `TC-06`, `TC-08`,
`TC-11`, `TC-12`, `TC-17`, `TC-18`, and `TC-19`.

Category filtering asserts that the listing is **selective and self-consistent**, never that it
is **semantically correct**: no rendered evidence anywhere in demoblaze — not the listing card,
not the product detail page — connects a product to a category, so no test here can assert that
"Laptops shows only laptops". `TC-13` and `TC-14` compare the site to itself instead.

## TC-01 — Happy path: sign up, add to cart, place an order, see confirmation

**Preconditions:** demoblaze is reachable. No account exists yet for the run; a fresh,
randomised username and password are available.

**Steps:**

1. Land on the demoblaze home page.
2. Sign up for a new account using the fresh randomised username and password.
3. Log in with that account.
4. Open a product category and select a product from it.
5. On the product page, confirm its name, price and description are displayed.
6. Add the product to the cart and acknowledge the add-to-cart confirmation.
7. Open the cart and confirm the product appears, priced correctly.
8. Proceed to place the order.
9. Fill in the order form with a name and a card number (and any other fields the form
   requires) using valid-looking values.
10. Submit the order.

**Expected result:** an order confirmation appears, showing an order id and a purchase amount
equal to the sum of the products added to the cart. The order id's value itself is not
significant (it is generated client-side and is not asserted precisely, only that it is
present and shaped like an id). Returning to the cart afterwards shows it empty.

## TC-02 — Ordering with an empty cart is prevented — `WEB-009`

**Preconditions:** logged in with a valid account. The cart contains no items.

**Steps:**

1. Open the cart with nothing in it.
2. Attempt to proceed to place an order.

**Expected result:** the shopper cannot complete an order from an empty cart — either the
order action is unavailable, or submitting it is rejected and no order confirmation appears.

**Known to fail:** the "Place Order" button and order modal are available regardless of cart
contents. Submitting the order form against a cart confirmed empty (`itemCount()` is `0`) is
accepted: a confirmation dialog appears showing a generated order id and an amount of `0`,
reproduced repeatedly against the live site. This case was written from intended behaviour at
design time; the defect was only found live while implementing the `@e2e` checkout-validation
suite, not anticipated up front the way `TC-05` and `TC-06` were. It fails by
design, demonstrating `WEB-009`.

## TC-03 — Ordering with a blank name is prevented

**Preconditions:** logged in with a valid account. The cart contains at least one item. The
order form is open.

**Steps:**

1. Leave the Name field blank.
2. Fill in the remaining order fields, including a valid-looking card number, with valid
   values.
3. Submit the order.

**Expected result:** the order is rejected. No order confirmation appears.

## TC-04 — Ordering with a blank card is prevented

**Preconditions:** logged in with a valid account. The cart contains at least one item. The
order form is open.

**Steps:**

1. Fill in the Name field with a valid value.
2. Leave the Credit card field blank.
3. Submit the order.

**Expected result:** the order is rejected. No order confirmation appears.

## TC-05 — An invalid card number format is rejected — `WEB-001`

**Preconditions:** logged in with a valid account. The cart contains at least one item. The
order form is open.

**Steps:**

1. Fill in the Name field with a valid value.
2. Enter a card value that is not a valid card number (for example, a single character).
3. Fill in the remaining order fields with valid values.
4. Submit the order.

**Expected result:** the order is rejected as an invalid card format; no order confirmation
appears.

**Known to fail:** demoblaze performs no card-format validation and accepts the order
regardless of the card value entered. This case is written from intended behaviour and fails
by design, demonstrating `WEB-001`.

## TC-06 — An impossible expiry date is rejected — `WEB-002`

**Preconditions:** logged in with a valid account. The cart contains at least one item. The
order form is open.

**Steps:**

1. Fill in the Name field and Credit card field with valid values.
2. Enter an expiry month/year combination that cannot exist (for example, a month outside
   1-12, or a date already in the past).
3. Submit the order.

**Expected result:** the order is rejected as having an impossible expiry date; no order
confirmation appears.

**Known to fail:** demoblaze performs no expiry-date validation and accepts the order
regardless of the expiry value entered. This case is written from intended behaviour and fails
by design, demonstrating `WEB-002`.

## TC-07 — Removing an item recalculates the cart total

**Preconditions:** logged in with a valid account. The cart contains two or more items of
known prices.

**Steps:**

1. Open the cart and note the displayed total.
2. Remove one item from the cart.
3. Wait for the displayed total to stop changing.

**Expected result:** the stabilised total equals the sum of the prices of the items still in
the cart.

## TC-08 — Adding to cart while logged out, then logging in, preserves the cart — `WEB-010`

**Preconditions:** not logged in. An existing account is available to log into during the
journey.

**Steps:**

1. While logged out, add one or more products to the cart.
2. Open the cart and note its contents.
3. Log in with an existing account.
4. Open the cart again.

**Expected result:** the cart still contains the items added while logged out; logging in does
not lose them.

**Known to fail:** demoblaze keys the anonymous cart by a `user` cookie set on landing. That
cookie's value is unchanged by logging in (login only adds a separate `tokenp_` cookie), yet the
cart shown after logging in is empty — the post-login cart lookup does not surface items stored
under the pre-login identity. This case is written from intended behaviour and fails by design,
demonstrating `WEB-010`.

## Browse and listing cases

`TC-09` through `TC-12` assert the two principles argued in `docs/adr/0001-pagination-oracle.md`:
the pages of a listing partition its result set, and a control labelled with a direction either
moves the listing that way or is not offered. None of them names a product count, so a changed
catalogue does not turn the suite red.

## TC-09 — The pages of the unfiltered listing partition the catalogue

**Preconditions:** demoblaze is reachable. No category filter is applied.

**Steps:**

1. Land on the home page and note the first page window.
2. Page forward through every further page the listing offers.

**Expected result:** no product appears on more than one page window, and no product is missing
from all of them — the page windows partition the unfiltered result set.

## TC-10 — The last page offers no way to page further forward

**Preconditions:** demoblaze is reachable. No category filter is applied.

**Steps:**

1. Land on the home page and page forward to the last page the listing offers.

**Expected result:** the last page offers no further forward navigation — the control that would
move the listing further forward is either hidden, disabled, or, if clicked, leaves the listing
unchanged. This is the convention `TC-11` relies on demoblaze already applying in one direction.

## TC-11 — `Previous` returns to the preceding page, and offers nothing on the first page — `WEB-011`

**Preconditions:** demoblaze is reachable. No category filter is applied.

**Steps:**

1. From the first page, note whether `Previous` is offered, and if so what clicking it does to
   the listing.
2. From an honestly-reached second page (arrived at via `Next`, not via `Previous`), click
   `Previous` and note the listing.

**Expected result:** on the first page, `Previous` offers no navigation — it either is not
offered, or clicking it leaves the listing unchanged. From the second page, `Previous` returns
the listing to the first page's products.

**Known to fail:** `Previous` moves the listing forward by one product instead of returning to
the previous page, from any starting page. This case is written from intended behaviour and
fails by design, demonstrating `WEB-011`.

## TC-12 — Paging within a category keeps the category filter — `WEB-012`

**Preconditions:** demoblaze is reachable.

**Steps:**

1. For each category the page offers, select it and note the resulting listing.
2. If a further page is offered under that category, page forward and note the listing.

**Expected result:** if a further page is offered while a category filter is active, every
product it shows also matches that filter. A shopper's chosen category is never silently
discarded by paging forward.

**Known to fail:** `Next` is offered under every category even though none has a second page,
and paging forward under any of them shows the unfiltered catalogue's second page instead. This
case is written from intended behaviour and fails by design, demonstrating `WEB-012`.

`TC-13` through `TC-15` each run twice, once anonymous and once logged in, to prove browsing is
auth-invariant rather than assume it. Neither run is expected to fail.

## TC-13 — Selecting a category narrows the listing to a non-empty proper subset of the catalogue

**Preconditions:** demoblaze is reachable.

**Steps:**

1. Note the unfiltered result set.
2. For each category the page offers, select it and note the resulting result set.

**Expected result:** each category's result set is non-empty, every product in it also appears
in the unfiltered result set, and it is strictly smaller than the unfiltered result set — a
non-empty proper subset, not the whole catalogue again.

## TC-14 — Every product on the unfiltered listing appears in some category

**Preconditions:** demoblaze is reachable.

**Steps:**

1. Note the unfiltered result set.
2. Note the union of every category's result set.

**Expected result:** every product in the unfiltered result set appears in at least one
category's result set — nothing on the storefront is unreachable by browsing categories. This
does not assert the reverse (that the union equals the unfiltered set exactly): a catalogue that
added an uncategorised product would be a correct system, not a broken one, and this case must
not fail against it.

## TC-15 — A product opened from the listing shows that product, at that price

**Preconditions:** demoblaze is reachable.

**Steps:**

1. For each product card in a listing, open the product it links to.

**Expected result:** the detail page's product name matches the card's title, and the detail
page's price, as a parsed amount rather than as text, matches the card's price. Comparing parsed
amounts is deliberate: the card and the detail page format the same price differently.

## TC-16 — Logging out hides the account's cart, and logging back in restores it

**Preconditions:** a fresh account exists and is logged in. The cart is empty.

**Steps:**

1. While logged in, add one or more products to the cart.
2. Open the cart and note its contents.
3. Log out.
4. Open the cart.
5. Log back in with the same account.
6. Open the cart again.

**Expected result:** after logging out, the cart shows none of the items added while logged
in — the anonymous shopper is not shown the account's cart. After logging back in, the cart
contains exactly the items added in step 1, at the same prices: logging out hid the cart, it did
not destroy it. This case is not to be read as demonstrating `WEB-005`; the cart-clearing seam
`WEB-005` describes did not reproduce when checked alongside it.

## TC-17 — After a completed purchase, the order modal closes, the form clears, and the order cannot be repeated — `WEB-013`

**Filed under browse, not checkout-validation.** This is a checkout/order-modal case, but it lands
in `tests/e2e/browse.spec.ts` alongside `TC-09`–`TC-18` rather than in
`tests/e2e/checkout-validation.spec.ts` next to `TC-02`–`TC-06`. There is no fixture dependency
forcing that: `checkout-validation.spec.ts` already declares `listingPage` for `TC-03`, and step 3
of this case reaches the cart via `homePage.openCartFromNav()` (`tests/e2e/browse.spec.ts:366`), a
`homePage` method, not a `listingPage` one. The filing is historical: the ticket that added the
browse/listing surface batched this case in alongside it because `docs/coverage-map.md` ties it to
the nav-chrome `Cart` link row it also demonstrates, not because either spec file needed it there.

**Preconditions:** logged in with a valid account. A product is in the cart. The order form is
open and filled with valid-looking values.

**Steps:**

1. Submit the order and note the confirmation.
2. Dismiss the confirmation.
3. Attempt to reach the cart from the `Cart` link in the navigation bar.
4. Submit the order a second time.

**Expected result:** dismissing the confirmation closes the order modal and clears the form,
which held the shopper's name and full card number. With the modal gone, the shopper can reach
the rest of the site — the nav `Cart` link works and shows the now-empty cart. The order cannot
be submitted a second time from a cart the first order already emptied.

**Known to fail:** the order modal is never dismissed. It stays open, full-viewport, with the
form still populated, and its subtree intercepts pointer events across the whole viewport, so
the nav bar is unreachable behind it. Submitting the order a second time is accepted and books a
duplicate order for a fabricated amount. This case is written from intended behaviour and fails
by design, demonstrating `WEB-013`.

## TC-18 — Browser Back from a product opened out of a filtered listing restores that listing — `WEB-014`

**Preconditions:** demoblaze is reachable.

**Steps:**

1. Select a category and note the resulting listing.
2. Open a product from that listing.
3. Press the browser's Back button.

**Expected result:** the listing shown after Back is the filtered listing from step 1, not the
unfiltered catalogue.

**Known to fail:** category filtering runs entirely in client-side JavaScript and never enters
the URL, so a filtered listing has no address. Browser Back lands on the unfiltered first page
instead, silently discarding the shopper's chosen filter. This case is written from intended
behaviour and fails by design, demonstrating `WEB-014`.

## TC-19 — The add-to-cart confirmation reads the same for anonymous and logged-in shoppers — `WEB-007`

**Preconditions:** demoblaze is reachable. An account is available to log into.

**Steps:**

1. While logged out, add a product to the cart and note the confirmation.
2. Log in, add the same product to the cart again, and note the confirmation.

**Expected result:** the two confirmations read the same. There is one intended message for "a
product was added"; which auth state the shopper is in is not part of that intent. Neither
wording is hardcoded as the expectation, because the defect this case demonstrates is the
divergence between the two, not one particular wording.

**Known to fail:** the anonymous and logged-in confirmations do not read the same. This case is
written from intended behaviour and fails by design, demonstrating `WEB-007`.

## `api-main`

The written source for the `@api` coverage of the local server in `api-main/`: the two `user`
endpoints and `/signin`, asserted against `api-main/swagger.yaml` rather than against what
`api-main/server.js` happens to do (`CLAUDE.md`, `SPEC.md` "Assertion basis"). Ids below are
`AC-` (api case), a separate sequence from this document's `TC-` ids, since they cover a
different system through a different seam (`api-main`'s HTTP boundary, not demoblaze's browser
UI — `CONTEXT.md`). Each row names the endpoint under test, the precondition the request
depends on, the response the specification documents, the status that response gives the test
(`Pass` or `Fails by design`), and, where it fails, the `API-` defect id in `docs/defects.md`
that failure demonstrates. The `Test` column holds the test's name as it appears in the suite's
output, without its trailing `` @api `` tag (`AC-02`'s name also carries its describe-block
prefix, `GET /user/ids ›`, exactly as the suite prints it). Rows are keyed by that name within
their file, not by a guaranteed one-for-one line mapping — titles and line numbers can drift as
the suite changes independently of this document.

Thirteen of the 21 are expected to fail by design: `AC-07`, `AC-08`, `AC-09` (`API-005`),
`AC-10` (`API-003`), `AC-13`, `AC-14` (`API-002`), `AC-15`, `AC-16` (`API-001`), `AC-17`
(`API-002`), `AC-18`, `AC-19` (`API-006`), `AC-20` (`API-002`), and `AC-21` (`API-007`) — matching
the suite's own verified count, 21 tests, 8 pass, 13 fail (`npm run test:api`, re-run
2026-09-08). `AC-03` deliberately does not check `otp` or `phone_no`'s presence, even though
`swagger.yaml:68-71` documents them on the `200` schema: asserting they are absent is `AC-10`'s
job (`API-003`), and asserting they are present would certify that defect as correct, which
`SPEC.md` "Assertion basis" rules out.

### `GET /user/ids`

| AC | Test | Precondition | Expected response | Status | Defect |
|---|---|---|---|---|---|
| AC-01 | `GET /user/ids responds over the wired base url with a JSON array` (`tests/api/smoke.spec.ts:11`) | server reachable at the configured base url | `200`, `content-type: application/json`, body is an array | Pass | — |
| AC-02 | `GET /user/ids › returns every known user id` (`tests/api/user.spec.ts:14`) | the server's two seeded users, ids `"001"` and `"002"` | `200`, JSON array whose contents equal exactly `["001", "002"]` | Pass | — |

### `GET /user/:id`

| AC | Test | Precondition | Expected response | Status | Defect |
|---|---|---|---|---|---|
| AC-03 | `known id matches the documented schema and field types` (`user.spec.ts:25`) | `id` = `"001"`, a known user | `200`; `first_name`, `last_name`, `permission` are each typed `string` per `swagger.yaml:60-77` (`otp`/`phone_no` deliberately unchecked — see note above) | Pass | — |
| AC-04 | `id 001 matches its documented first_name, last_name and permission` (`user.spec.ts:56`) | `id` = `"001"` | `200`; `first_name`, `last_name`, `permission` equal the documented seeded values exactly | Pass | — |
| AC-05 | `id 002 matches its documented first_name, last_name and permission` (`user.spec.ts:56`) | `id` = `"002"` | `200`; same, for user `002` | Pass | — |
| AC-06 | `an unknown id ('999') produces the documented error shape and status code` (`user.spec.ts:75`) | `id` = `"999"`, a plain own-property miss on `user_data` | `400`, `{status_code: "400", message: string}` per `swagger.yaml:79-92` | Pass | — |
| AC-07 | `a prototype-chain id ('toString') produces the documented error shape and status code [API-005]` (`user.spec.ts:103`) | `id` = `"toString"`, resolves via the prototype chain rather than as an own key of `user_data` | `400`, documented error shape | Fails by design | `API-005` |
| AC-08 | `a prototype-chain id ('constructor') produces the documented error shape and status code [API-005]` (`user.spec.ts:103`) | `id` = `"constructor"` | `400`, documented error shape | Fails by design | `API-005` |
| AC-09 | `a prototype-chain id ('__proto__') produces the documented error shape and status code [API-005]` (`user.spec.ts:103`) | `id` = `"__proto__"` | `400`, documented error shape | Fails by design | `API-005` |
| AC-10 | `does not return otp and phone_no to an unauthenticated caller [API-003]` (`user.spec.ts:117`) | `id` = `"001"`, no authentication presented | `200`; `otp` and `phone_no` are absent from the response body | Fails by design | `API-003` |

### `POST /signin`

| AC | Test | Precondition | Expected response | Status | Defect |
|---|---|---|---|---|---|
| AC-11 | `valid phone_no and otp sign in and return the matching user` (`signin.spec.ts:25`) | body = user `001`'s documented `phone_no`/`otp` | `200`, `status: "Pass"`, `data` matches user `001`'s `id`/`first_name`/`last_name`/`permission`, `data.otp`/`data.phone_no` absent | Pass | — |
| AC-12 | `a second valid user signs in and returns their own identity, not the first user's` (`signin.spec.ts:47`) | body = user `002`'s documented `phone_no`/`otp` | `200`, `status: "Pass"`, `data` matches user `002`'s identity, not user `001`'s | Pass | — |
| AC-13 | `a wrong otp for a known phone_no is rejected [API-002]` (`signin.spec.ts:67`) | body = user `001`'s `phone_no`, an `otp` that does not match | `404`, `status: "Not found"`, `message: "User not found"`, `status_code` typed `string` per `swagger.yaml:157` | Fails by design | `API-002` (`status_code` type only; the `404` envelope itself matches) |
| AC-14 | `one user's otp presented with another user's phone_no is rejected [API-002]` (`signin.spec.ts:82`) | body = user `001`'s `phone_no`, user `002`'s `otp` — both real, not a matching pair | `404`, same shape as AC-13 | Fails by design | `API-002` (`status_code` type only) |
| AC-15 | `a request missing otp produces the documented internal-error response [API-001]` (`signin.spec.ts:99`) | body = `{phone_no}` only, `otp` key absent | `500`, `status: "Fail"`, `message: "Internal Server Error"` per `swagger.yaml:170-189` | Fails by design | `API-001` |
| AC-16 | `a request missing phone_no produces the documented internal-error response [API-001]` (`signin.spec.ts:118`) | body = `{otp}` only, `phone_no` key absent | `500`, same shape as AC-15 | Fails by design | `API-001` |
| AC-17 | `an empty request body produces the documented internal-error response [API-002]` (`signin.spec.ts:132`) | body = `{}`, neither key present | `500`, `status: "Fail"`, `message: "Internal Server Error"`, `status_code` typed `string` per `swagger.yaml:177` | Fails by design | `API-002` (`status_code` type only; unaffected by `API-001`, since neither arm of the guard's `OR` is true regardless) |
| AC-18 | `non-string phone_no and otp (numeric coercion) do not sign in [API-006]` (`signin.spec.ts:155`) | body = `{phone_no: 20011893, otp: 123456}` (numeric, matching user `001`'s values under `==` coercion) | `404`, `status: "Not found"` — documented types are `string`; a numeric pair is not a documented match | Fails by design | `API-006` |
| AC-19 | `non-string phone_no and otp (array coercion) do not sign in [API-006]` (`signin.spec.ts:176`) | body = `{phone_no: ["020011893"], otp: ["123456"]}` (single-element arrays, matching under `==` coercion) | `404`, `status: "Not found"` | Fails by design | `API-006` |
| AC-20 | `the 200 response's field types match the documented schema, including status_code [API-002]` (`signin.spec.ts:191`) | body = user `001`'s documented `phone_no`/`otp` | `200`; every field (`status_code`, `status`, `message`, `data`, `data.id`, `data.first_name`, `data.last_name`, `data.permission`) typed per `swagger.yaml:122-140` — `status_code` as `string` | Fails by design | `API-002` (`status_code` only; the other seven fields are expected to pass) |
| AC-21 | `malformed JSON on POST /signin gets a JSON error envelope, not an HTML stack page` (`tests/api/edge-cases.spec.ts:8`) | body = the literal string `{bad` (invalid JSON), `content-type: application/json` | `content-type: application/json`; body has `status_code`, `status`, `data`, `message`, each typed per the envelope every documented `/signin` branch shares (`swagger.yaml:116-189`) — no specific status code is pinned, since swagger documents no dedicated request-parse-failure response | Fails by design | `API-007` (id pending — this test's title does not yet carry it; see `API-007` in `docs/defects.md`) |

### `GET /signin` — dropped, not carried into this table

`#27` designed and then dropped a `GET /signin` test asserting `not.toBe(200)`. `swagger.yaml`
documents only `POST` for `/signin`, so there is no documented contract for `GET` to violate —
carrying it here as an `AC` row with no defect id and no positive expectation would misrepresent
it as a designed case rather than a discarded one. Confirmed live against a local instance,
2026-09-08: `GET /signin` returns `200 text/html` (the swagger-ui catch-all page served at `/`);
`GET /nope`, an arbitrary undocumented path, behaves identically. This is recorded here rather
than registered as a defect against `swagger.yaml`, which states no convention for undocumented
methods or paths for this register to hold the server to.
