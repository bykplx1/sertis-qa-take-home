# Defect register

Every failing `@e2e` or `@api` test carries a defect id in its title; that id resolves to an
entry here. Ids are numbered by system: `API-` for `api-main`, `WEB-` for demoblaze. Severity
uses a standard Critical/High/Medium/Low scale. Priority is not tracked separately.

demoblaze's absent server-side order (the purchase flow never persists an order; the
confirmation dialog is the only oracle) is not a defect and is not listed here — it is recorded
in the assumptions, because it reflects how the demo is built rather than a violation of any
documented behaviour.

**Verification status**, stated per entry so this register does not overclaim:

- The four `API-` entries were verified by reading `api-main/server.js` against
  `api-main/swagger.yaml` line for line. `api-main` was not modified (it is a read-only system
  under test) and, at the time this register was written, these were confirmed by static source
  inspection rather than by an executed HTTP request against a running instance. The `@api`
  suite (a later ticket) exercises them live; each entry's repro steps are written as the HTTP
  request that suite will send.
- `WEB-001` through `WEB-008` were identified during design, by reading `SPEC.md`'s "Defects
  identified during design" section and reasoning about demoblaze's documented/expected
  behaviour. They are **design-time assertions, not yet reproduced against the live site** by
  this register — demoblaze is third-party infrastructure this ticket does not drive a browser
  against. The `@e2e` suite (a later ticket) is what actually reproduces them; each entry's repro
  steps are written as the manual steps that suite will automate.
- `WEB-009` and `WEB-010` were **not** identified during design; they were found once the `@e2e`
  suite actually drove a browser against the live site (issues #10 and #9 respectively), and
  each was **reproduced live** by the test named in its Verification line. Their repro steps
  describe what that test actually did, not a manual procedure still to be automated.
- `WEB-011` and `WEB-012` were **not** identified during design; they were found by throwaway
  exploration scripts driving the live site (issues #16 and #18), argued into defects rather than
  design-time assumptions by `docs/adr/0001-pagination-oracle.md`, and are now **reproduced live**
  by the `@e2e` suite.
- `WEB-013` and `WEB-014` were likewise found live, by issue #22's and #17's exploration scripts
  respectively, and are now reproduced live by the `@e2e` suite.
- `WEB-007` was identified during design but, as first implemented, asserted too loosely
  (`/added/i`) to distinguish the two wordings it claims differ. It is now **reproduced live** by
  `TC-19`, which compares the two states' messages to each other rather than certifying either as
  correct.

## `api-main`

### API-001 — Signin guard accepts a request with only one credential (OR instead of AND)

- **Severity:** High
- **Verification:** static source inspection
- **Spec reference:** `api-main/swagger.yaml` documents `/signin`'s request body as taking both
  `phone_no` and `otp`, and its `500` response as "Internal Server Error" — implying an
  incomplete-credentials request should hit that path.
- **Location:** `api-main/server.js:59` — `if ("phone_no" in body || "otp" in body) {`
- **Steps to reproduce:** `POST /signin` with a body containing only `phone_no` (e.g.
  `{"phone_no": "020011893"}`, no `otp` key).
- **Expected behaviour:** the guard requires both credentials; an incomplete body falls through
  to the `else` branch and returns `500` with `"status": "Fail"`, `"message": "Internal Server
  Error"`.
- **Actual behaviour:** the `OR` at `server.js:59` lets a body with only `phone_no` (or only
  `otp`) enter the matching loop. No user matches on the missing field, so the response is `404`
  `"status": "Not found"`, `"message": "User not found"` — the wrong documented response for
  partial input.

### API-002 — `status_code` is documented as a string but emitted as a number

- **Severity:** Medium
- **Verification:** static source inspection
- **Spec reference:** `api-main/swagger.yaml:87` (`/user/{id}` 400 response) and `:125`, `:157`,
  `:177` (`/signin` 200/404/500 responses) all declare `status_code: { type: string }`, with
  examples quoted as strings (`"400"`, `"200"`, `"404"`, `"500"`).
- **Location:** `api-main/server.js:48` (`"status_code": "400"` is actually emitted as a
  string here — see note below), `:64` (`status_code = 200`), `:84` (`status_code = 404`), `:93`
  (`status_code = 500`) — the `/signin` handler assigns `status_code` from a numeric literal and
  serialises it as a JSON number in every branch.
- **Steps to reproduce:** `POST /signin` with valid `phone_no`/`otp` for a known user; inspect
  the JSON response's `status_code` field type.
- **Expected behaviour:** `status_code` is a JSON string, matching the schema and examples in
  `swagger.yaml` (e.g. `"status_code": "200"`).
- **Actual behaviour:** `status_code` is a JSON number (e.g. `"status_code": 200`) in all three
  `/signin` branches, a type contract violation for any client that deserialises strictly
  against the documented schema.

### API-003 — `GET /user/:id` returns OTP and phone number to an unauthenticated caller

- **Severity:** Critical
- **Verification:** static source inspection
- **Spec reference:** `api-main/swagger.yaml:41-77` documents the `/user/{id}` 200 response
  schema as including `phone_no` and `otp`, but the endpoint carries no authentication
  requirement anywhere in the spec or the implementation — meaning any caller who knows or
  enumerates an id (trivial here: `GET /user/ids` lists them all) retrieves another user's
  one-time password and phone number with zero credentials.
- **Location:** `api-main/server.js:41-51` — `app.get("/user/:id", ...)` has no auth middleware
  and sends `user_data[id]` unfiltered, including `otp` and `phone_no`.
- **Steps to reproduce:** `GET /user/ids` (no auth) to enumerate ids, then `GET /user/001` (no
  auth, no session, no token).
- **Expected behaviour:** a resource containing a live one-time password and phone number should
  not be retrievable by an unauthenticated caller; at minimum `otp` should never be returned to
  any caller outside the signin flow that consumes it.
- **Actual behaviour:** the full user record, `otp` and `phone_no` included, is returned in
  plaintext to any caller, unauthenticated.

### API-004 — Swagger's 404 example for `/signin` carries the success message

- **Severity:** Low
- **Verification:** static source inspection
- **Spec reference:** `api-main/swagger.yaml:166-169`, the `404` response example for `/signin`,
  and the identical block in the API Documentation appendix of the original brief
  (`QA Take-Home-Test.docx.pdf`, repo root).
- **Location:** `api-main/swagger.yaml:169` — `message: "Sign in success"` under the `404`
  example, versus the actual message the server emits for that case at `api-main/server.js:89`
  — `"message": "User not found"`. The same line appears in the brief's appendix. Stripped of
  indentation, the two documents differ only in `info.description` and one space inside an
  example value, so this is a defect in the specification as issued, not a transcription slip in
  the copy shipped with the server.
- **Steps to reproduce:** read the `404` response example in `/signin`'s swagger documentation (or
  visit the served Swagger UI at the server's root) and compare its `message` field against the
  message the server actually returns for a non-matching credential pair. The same example in the
  brief's appendix can be compared the same way, without running the server.
- **Expected behaviour:** the documentation's `404` example message describes a not-found
  outcome, consistent with its own `status: "Not found"` field on the same example.
- **Actual behaviour:** the example's `message` field reads `"Sign in success"`, contradicting
  its own `status` field and the server's real `404` message (`"User not found"`). This is a
  defect in the documentation itself, not the server's runtime behaviour, and it reaches the
  candidate through both copies of that documentation.

## demoblaze

### WEB-001 — Checkout accepts any card value, including a single character

- **Severity:** High
- **Verification:** identified during design (SPEC.md); not yet reproduced against the live site
- **Steps to reproduce:** add a product to the cart, open Place Order, fill Name with a valid
  value, enter a single character (e.g. `"x"`) as the credit card number, submit.
- **Expected behaviour:** an order with a non-numeric or otherwise clearly invalid card value is
  rejected; no order confirmation appears.
- **Actual behaviour:** the order is accepted and a confirmation dialog appears regardless of the
  card value entered — demoblaze performs no card-format validation.
- Demonstrated by `TC-05` in `docs/test-cases.md`.

### WEB-002 — Checkout accepts an impossible expiry date

- **Severity:** High
- **Verification:** identified during design (SPEC.md); not yet reproduced against the live site
- **Steps to reproduce:** add a product to the cart, open Place Order, fill Name and Card with
  valid-looking values, enter an expiry month/year that cannot exist (e.g. month `13`, or a date
  already in the past), submit.
- **Expected behaviour:** an order with an impossible expiry date is rejected; no order
  confirmation appears.
- **Actual behaviour:** the order is accepted and confirmed regardless of the expiry value
  entered — demoblaze performs no expiry-date validation.
- Demonstrated by `TC-06` in `docs/test-cases.md`.

### WEB-003 — Passwords are base64-encoded, not encrypted, and travel with no authorization header

- **Severity:** Critical
- **Verification:** identified during design (SPEC.md); not yet reproduced against the live site
- **Steps to reproduce:** sign up or log in, capture the outgoing request in browser devtools,
  inspect the request body's password field and headers.
- **Expected behaviour:** credentials in transit are either encrypted or sent over a mechanism
  that does not trivially reveal the plaintext (e.g. hashed client-side, or carried in a
  standard `Authorization` header rather than the request body).
- **Actual behaviour:** the password is base64-encoded — trivially reversible, not encryption —
  and sent in the request body with no `Authorization` header, so it is fully recoverable by
  anyone who can see the request (proxy logs, browser history, a shared network).

### WEB-004 — Session cookies are set without Secure, HttpOnly, or an expiry

- **Severity:** High
- **Verification:** identified during design (SPEC.md); not yet reproduced against the live site
- **Steps to reproduce:** log in, inspect the `Set-Cookie` header(s) for the session cookie in
  browser devtools' network or storage panel.
- **Expected behaviour:** a session cookie carries `Secure` (not sent over plain HTTP),
  `HttpOnly` (not readable by page JavaScript, mitigating XSS-driven theft), and an explicit
  expiry (bounding session lifetime).
- **Actual behaviour:** the session cookie is set with none of the three attributes, leaving it
  readable by any script on the page and persistent with no defined lifetime.

### WEB-005 — Cart is keyed by token when adding but by username when emptying after purchase

- **Severity:** Medium
- **Verification:** identified during design (SPEC.md); not yet reproduced against the live site
- **Steps to reproduce:** log in, add an item to the cart (observe the add-to-cart request is
  keyed by the session token), place an order (observe the cart-clearing request is keyed by
  username instead).
- **Expected behaviour:** the same identity key is used to add to and to clear a given user's
  cart, so a completed order reliably empties the cart it was placed from.
- **Actual behaviour:** add-to-cart requests key the cart by token while the post-purchase clear
  keys it by username; the two are not guaranteed to resolve to the same cart, so a logged-in
  user's cart may not reliably clear after an order.

### WEB-006 — Duplicate element ids across category links and product cards

- **Severity:** Low
- **Verification:** identified during design (SPEC.md); not yet reproduced against the live site
- **Steps to reproduce:** inspect the DOM of the home page; note that `id="itemc"` is reused
  across all three category links and `id="article"` is reused across every product card.
- **Expected behaviour:** element ids are unique per the HTML specification, so id-based
  selectors and accessibility tooling can address a single element unambiguously.
- **Actual behaviour:** the same id is repeated across multiple sibling elements, which is why
  the `@e2e` suite is documented (`SPEC.md`, "Selector strategy") to use text- and role-based
  locators instead of these ids.

### WEB-007 — Inconsistent add-to-cart confirmation text between logged-in and anonymous users

- **Severity:** Low
- **Verification:** identified during design (SPEC.md). Reproduced live by the `@e2e` suite
  (`tests/e2e/cart.spec.ts`, `TC-19`): the anonymous confirmation reads `Product added` and the
  logged-in confirmation reads `Product added.` — a trailing full stop — across six anonymous and
  five logged-in runs, no exceptions.
- **Steps to reproduce:** add a product to the cart while logged out and note the confirmation
  dialog text; log in, add a product to the cart, and note the confirmation dialog text again.
- **Expected behaviour:** the add-to-cart confirmation communicates the same outcome regardless
  of authentication state, so shoppers get a consistent signal that the action registered.
- **Actual behaviour:** the confirmation text differs between the logged-in and anonymous
  states.
- Demonstrated by `TC-19` in `docs/test-cases.md`.

### WEB-008 — Cart total is computed across a request-per-item sequence and is observably racy

- **Severity:** Medium
- **Verification:** identified during design (SPEC.md); not yet reproduced against the live site
- **Steps to reproduce:** add two or more items to the cart, open the cart page, and watch the
  displayed total while the page issues one request to fetch the cart followed by one request
  per line item.
- **Expected behaviour:** the cart total reflects the sum of the items in the cart as a single,
  stable value once the page has finished loading; a reader should not be able to observe an
  intermediate, incorrect total.
- **Actual behaviour:** the total is recomputed incrementally as each per-item request resolves,
  so it passes through transient incorrect values before settling — which is why `SPEC.md`
  ("Cart total stability") requires polling the total to a stable value before asserting it
  rather than reading it immediately after navigation.

### WEB-009 — Checkout accepts an order placed from an empty cart

- **Severity:** Medium
- **Verification:** reproduced live by the `@e2e` suite (`tests/e2e/checkout-validation.spec.ts`,
  `TC-02`) on 2026-09-07, three consecutive runs. Not identified during design — found while
  implementing issue #10, when the live site's actual behaviour did not match `TC-02`'s
  design-time assumption that demoblaze enforces a non-empty cart.
- **Steps to reproduce:** log in with a fresh account (cart guaranteed
  empty), navigate directly to `/cart.html`, click "Place Order" with no
  items in the cart, fill the order form with valid-looking values, submit.
- **Expected behaviour:** an order cannot be completed from an empty cart —
  either the order action is unavailable, or submission is rejected and no
  order confirmation appears (SPEC.md user story 21, `docs/test-cases.md`
  `TC-02`).
- **Actual behaviour:** the "Place Order" button and order modal are
  available regardless of cart contents, and submitting the form against an
  empty cart is accepted: a confirmation dialog appears with a generated
  order id and an amount of `0`. Reproduced three times in a row against
  the live site, including with `itemCount()` confirmed at `0` beforehand.
- Demonstrated by `TC-02` in `docs/test-cases.md`.

### WEB-010 — Cart added while logged out is not visible after logging in

- **Severity:** Medium
- **Verification:** reproduced live by the `@e2e` suite (`tests/e2e/cart.spec.ts`, `TC-08`). Not
  identified during design — found while implementing issue #9, when the live site's actual
  behaviour did not match `TC-08`'s design-time assumption that a cart built while logged out
  survives logging in.
- **Steps to reproduce:** while logged out, add a product to the cart (observe the `addtocart`
  request keyed by the anonymous `user` cookie), open the cart to confirm the item is there, then
  log in with an existing account and open the cart again.
- **Expected behaviour:** a cart built while logged out survives logging in (`SPEC.md` user story
  22; `docs/test-cases.md` TC-08).
- **Actual behaviour:** the `user` cookie's value is unchanged by logging in — login only adds a
  separate `tokenp_` cookie alongside it — yet the cart returned after logging in is empty. The
  item added anonymously is not lost from the server (it was written under the `user` cookie's
  identity), but the post-login cart view does not surface it, so from the shopper's perspective
  the cart is emptied by logging in. This is the same class of identity-key mismatch as WEB-005
  (add and later lookups keyed inconsistently) but triggered by login rather than purchase.
- Demonstrated by `TC-08` in `docs/test-cases.md`.

### WEB-011 — `Previous` never returns to the preceding page; it shifts the listing forward by one product

- **Severity:** High
- **Verification:** observed live on 2026-09-07 and again on 2026-09-08 by throwaway exploration
  scripts (issue #16 and issue #18's measurement comment), reproduced across independent runs on
  each occasion. Not identified during design. Reproduced live by the `@e2e` suite
  (`tests/e2e/browse.spec.ts`, `TC-11`).
- **Steps to reproduce:** land on the home page with no category filter applied. Note the nine
  products shown, the first being "Samsung galaxy s6". Click `Next` and note the six products
  shown. Click `Previous`. Note the products now shown, and that "Samsung galaxy s6" is not among
  them. Click `Previous` a second time and note that nothing changes.
- **Expected behaviour:** `Previous` returns the listing to the page before the current one. On
  the first page there is no such page, so the control offers no navigation — it is either hidden
  (the treatment demoblaze already gives `Next` on the last page) or disabled. It must never move
  the listing forward, which is the one thing a control labelled "Previous" cannot mean. The pages
  of the listing partition the catalogue: every product appears on exactly one page, none twice,
  none missing.
- **Actual behaviour:** `Previous` moves the listing forward by one product instead of returning
  to the previous page, from any starting page. From the first page it re-renders the grid as
  products 2-10, dropping "Samsung galaxy s6". From an honestly-reached second page it produces
  the same 2-10 window rather than returning to 1-9. In both cases `#next2`'s `value` changes from
  `9` to `10`, and a second click is idempotent — the window stays at offset 1, which rules out a
  deliberate item-wise sliding window, since such an intent would step again. In the resulting
  state product 1 appears on no page and is recoverable only by reloading or clicking `Home`.
  `Previous` is also visible and clickable on the first page, where demoblaze hides `Next` in the
  mirror case, so the site is inconsistent with its own convention.
- **Severity note:** High rather than Medium because the fault is unconditional rather than a
  first-page edge case. It is reached by the ordinary browse path — page forward, then page back —
  and the product it makes unreachable, "Samsung galaxy s6", is the product `TC-01`, `TC-07` and
  the checkout-validation suite all purchase. It denies a shopper access to a product on the
  mainline path, which is a direct hit on user story 8.
- Demonstrated by `TC-11` in `docs/test-cases.md`.

### WEB-012 — Pagination silently discards the active category filter

- **Severity:** Medium
- **Verification:** observed live on 2026-09-07 by the throwaway exploration script recorded in
  issue #16, in all three categories. Not identified during design. Reproduced live by the `@e2e`
  suite (`tests/e2e/browse.spec.ts`, `TC-12`).
- **Steps to reproduce:** from the home page select the `Phones` category and note that seven
  products are shown, all phones. Observe that `Next` is visible. Click it and note the products
  now shown. Repeat with `Laptops` (six products) and `Monitors` (two products).
- **Expected behaviour:** pagination partitions the filtered result set. With a category selected,
  either no `Next` control is offered — because every product matching the filter is already on
  screen, which is the case for all three of demoblaze's categories — or, if a filtered set ever
  exceeded one page, the next page contains only products matching that filter. A shopper's
  explicitly chosen filter is never discarded by a control that says nothing about filtering.
- **Actual behaviour:** `Next` is visible under all three categories even though none has a second
  page, and clicking it in any of them yields the same unfiltered page 2 ("Apple monitor 24,
  MacBook air, Dell i7 8gb, 2017 Dell 15.6 Inch, ASUS Full HD, MacBook Pro"). The category filter
  is silently discarded, with nothing in the re-rendered grid indicating it is gone, so a shopper
  who filtered to `Phones` is shown laptops and monitors in a list they have every reason to read
  as phones. Both symptoms follow from one cause: the paginator computes page availability and
  page contents over the unfiltered 15-product catalogue and is not category-aware.
- Demonstrated by `TC-12` in `docs/test-cases.md`.

### WEB-013 — The order modal stays open after a successful purchase, blocking the nav bar and accepting a duplicate order

- **Severity:** High
- **Verification:** observed live on 2026-09-08 by throwaway exploration scripts, reproduced
  across two independent probes (8 runs and 2 runs), anonymous and logged in. Not identified
  during design. Reproduced live by the `@e2e` suite (`tests/e2e/browse.spec.ts`, `TC-17`).
- **Steps to reproduce:** add a product to the cart, open the cart and click `Place Order`.
  Complete the form and click `Purchase`. Note the confirmation and its order id, then dismiss it
  with `OK`. Observe the order modal. Attempt to click any link in the navigation bar. Click
  `Purchase` a second time and note the order id and amount.
- **Expected behaviour:** acknowledging the purchase confirmation closes the order modal and
  returns the shopper to the site. The order form, which holds their name and full card number,
  is cleared. The order cannot be placed a second time from a cart the completed order has already
  emptied.
- **Actual behaviour:** the order modal is never dismissed. After `OK`, `#orderModal` remains
  `class="modal fade show"` with `display: block`, covering the viewport, with the shopper's name
  and full card number still in the form and a live `Purchase` button. Every navigation-bar link
  is unreachable behind it — Playwright names the interceptor as `<input id="name">` within the
  `#orderModal` subtree, and `elementFromPoint` over a nav link returns `#name`. Clicking
  `Purchase` again is accepted and returns a second, different order id against a cart the first
  order already emptied. The second order's amount bears no relation to the cart: one probe run
  returned `105730 USD` for a 360 USD product, another returned `360 USD`. The modal's own `Close`
  button works, and the navigation bar behaves normally afterwards.
- **Severity note:** High because a shopper who clicks the still-live `Purchase` button — a
  reasonable thing to do when the form is still in front of them and nothing indicates the order
  completed — places a duplicate order for a fabricated amount. It also leaves a full card number
  on screen after the transaction the shopper believes is finished.
- Demonstrated by `TC-17` in `docs/test-cases.md`.

### WEB-014 — A filtered listing has no address, and browser Back discards the filter

- **Severity:** Low
- **Verification:** observed live on 2026-09-08 by a throwaway exploration script (issue #17).
  Reproduced live by the `@e2e` suite (`tests/e2e/browse.spec.ts`, `TC-18`).
- **Steps to reproduce:** from the home page select the `Laptops` category and note the listing.
  Note the browser's address bar. Open a product from the filtered listing, then press the
  browser's Back button.
- **Expected behaviour:** a filtered listing is a distinct view of the catalogue and has an
  address, so a shopper can bookmark it, share it, or return to it. Returning from a product
  opened out of a filtered listing restores that listing, not the unfiltered one.
- **Actual behaviour:** category links are `href="#"` and filtering runs entirely in client-side
  JavaScript (`byCat()`), so the active filter never enters the URL and a filtered listing cannot
  be addressed at all. Browser Back from a product detail page lands on the unfiltered first page,
  silently discarding a choice the shopper made.
- **Severity note:** Low. It costs the shopper a re-click rather than money or access, and no
  product becomes unreachable. Recorded because it is a real loss of a shopper's stated intent,
  not because it blocks a journey.
- Demonstrated by `TC-18` in `docs/test-cases.md`.
