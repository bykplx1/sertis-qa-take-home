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
- **Spec reference:** `api-main/swagger.yaml:166-169`, the `404` response example for `/signin`.
- **Location:** `api-main/swagger.yaml:169` — `message: "Sign in success"` under the `404`
  example, versus the actual message the server emits for that case at `api-main/server.js:89`
  — `"message": "User not found"`.
- **Steps to reproduce:** read the `404` response example in `/signin`'s swagger documentation (or
  visit the served Swagger UI at the server's root) and compare its `message` field against the
  message the server actually returns for a non-matching credential pair.
- **Expected behaviour:** the documentation's `404` example message describes a not-found
  outcome, consistent with its own `status: "Not found"` field on the same example.
- **Actual behaviour:** the example's `message` field reads `"Sign in success"`, contradicting
  its own `status` field and the server's real `404` message (`"User not found"`). This is a
  defect in the documentation itself, not the server's runtime behaviour.

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
- **Verification:** identified during design (SPEC.md); not yet reproduced against the live site
- **Steps to reproduce:** add a product to the cart while logged out and note the confirmation
  dialog text; log in, add a product to the cart, and note the confirmation dialog text again.
- **Expected behaviour:** the add-to-cart confirmation communicates the same outcome regardless
  of authentication state, so shoppers get a consistent signal that the action registered.
- **Actual behaviour:** the confirmation text differs between the logged-in and anonymous
  states.

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
