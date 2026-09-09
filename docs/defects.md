# Defect register

Every failing `@e2e` or `@api` test carries a defect id in its title; that id resolves to an
entry here. Ids are numbered by system: `API-` for `api-main`, `WEB-` for demoblaze. Severity
uses a standard Critical/High/Medium/Low scale. Priority is not tracked separately.

demoblaze's absent server-side order (the purchase flow never persists an order; the
confirmation dialog is the only oracle) is not a defect and is not listed here — it is recorded
in the assumptions, because it reflects how the demo is built rather than a violation of any
documented behaviour.

**Verification status**, stated per entry so this register does not overclaim:

- `API-001`, `API-002` and `API-003` were originally verified by reading `api-main/server.js`
  against `api-main/swagger.yaml` line for line, before the `@api` suite existed. `api-main` was
  not modified (it is a read-only system under test). They are now **reproduced live**: the
  `@api` suite (`tests/api/signin.spec.ts`, `tests/api/user.spec.ts`) drives each of
  them over HTTP every run — `AC-15`/`AC-16` for `API-001`, `AC-13`/`AC-14`/`AC-17`/`AC-20` for
  `API-002`, `AC-10` for `API-003` (`docs/test-cases.md`). `API-004` is the exception: it is a
  defect in `swagger.yaml`'s own documentation (its `404` example contradicts its own `status`
  field), which no HTTP request can reproduce — comparing two static passages is the whole test —
  so it remains verified by static source inspection alone.
- `WEB-001` and `WEB-002` were identified during design, by reading `SPEC.md`'s "Defects
  identified during design" section and reasoning about demoblaze's documented/expected
  behaviour. They are now **reproduced live**: the `@e2e` suite (`tests/e2e/checkout-validation.spec.ts`,
  `TC-05` and `TC-06`) drives each of them against the live site every run and is what `README.md`
  lists as a live failure — they are no longer design-time-only assertions.
- `WEB-003` through `WEB-006` and `WEB-008` were identified during design, by the same reading of
  `SPEC.md`. They are **design-time assertions, not yet reproduced against the live site** by
  this register — demoblaze is third-party infrastructure this ticket does not drive a browser
  against, and no later `@e2e` ticket added a test for these. Each entry's repro steps are written
  as the manual steps a future test would automate.
- `WEB-009` and `WEB-010` were **not** identified during design; they were found once the `@e2e`
  suite actually drove a browser against the live site, while implementing the checkout-validation
  and cart-behaviour specs respectively, and each was **reproduced live** by the test named in its
  Verification line. Their repro steps describe what that test actually did, not a manual
  procedure still to be automated.
- `WEB-011` and `WEB-012` were **not** identified during design; they were found by throwaway
  exploration scripts driving the live site while inventorying the coverage map, argued into
  defects rather than design-time assumptions by `docs/adr/0001-pagination-oracle.md`, and are now
  **reproduced live** by the `@e2e` suite.
- `WEB-013` and `WEB-014` were likewise found live, by throwaway exploration scripts driving the
  live site during the same browse/listing coverage work, and are now reproduced live by the
  `@e2e` suite.
- `WEB-007` was identified during design but, as first implemented, asserted too loosely
  (`/added/i`) to distinguish the two wordings it claims differ. It is now **reproduced live** by
  `TC-21`, which compares the two states' messages to each other rather than certifying either as
  correct.
- `API-005`, `API-006` and `API-007` did not exist when the four entries above were written. They
  were assigned once the `@api` suite actually drove HTTP requests against a running
  instance and found behaviour the first four entries did not cover, and are **reproduced live**:
  confirmed against a local instance on 2026-09-08, independently by this register entry's author
  re-running the same requests by hand against a freshly started local instance the same day.
  All three carry their id in the title of the test that demonstrates them: `AC-07`–`AC-09` in
  `tests/api/user.spec.ts`, `AC-18`–`AC-19` and `AC-21` in `tests/api/signin.spec.ts` and
  `tests/api/edge-cases.spec.ts`.

## `api-main`

### API-001 — Signin guard accepts a request with only one credential (OR instead of AND)

- **Severity:** High
- **Verification:** reproduced live — `AC-15` and `AC-16` (`docs/test-cases.md`,
  `tests/api/signin.spec.ts`) each `POST /signin` with one of the two credentials missing every
  run. Originally identified by static source inspection, before the `@api` suite existed.
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
- **Why 500, not 400 or 404, is the intended response for one credential missing:**
  `swagger.yaml:107-115` documents `/signin`'s request body with `phone_no` and `otp` as
  properties but marks neither `required`, so the schema itself gives no basis for calling a
  one-field body malformed — there is no OpenAPI constraint it violates, which rules out `400`:
  this endpoint documents no `400` response at all, and nothing in the spec ties an incomplete
  body to that status. `404` is also the wrong fit: it is documented as the response to a
  well-formed pair of credentials that does not match any account (`swagger.yaml:150-169`,
  `"status": "Not found"`), which presupposes both fields were present to compare in the first
  place. A body missing one of the two was never in a position to "not match" — there is nothing
  to compare `undefined` against a stored `phone_no` or `otp` and call it a considered non-match,
  as opposed to a request the endpoint could not evaluate at all. That leaves `500`, which is
  where `server.js:59`'s own `else` branch already sits, guarding the case where neither field is
  present. Extending that guard to "at least one of the two is missing" is the only reading
  consistent with the endpoint needing both credentials simultaneously to attempt a signin: a
  request that cannot supply enough information to run the comparison is a precondition failure
  on the server's side, which is what the documented `"Internal Server Error"` message names,
  not a client-side shape violation (`400`) and not a completed, unsuccessful lookup (`404`).

### API-002 — `status_code` is documented as a string but emitted as a number

- **Severity:** Medium
- **Verification:** reproduced live — `AC-13`, `AC-14`, `AC-17` and `AC-20` (`docs/test-cases.md`,
  `tests/api/signin.spec.ts`) each assert `status_code`'s documented `string` type against a live
  response every run, on the `404`, `404`, `500` and `200` branches respectively. Originally
  identified by static source inspection, before the `@api` suite existed.
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
- **Verification:** reproduced live — `AC-10` (`docs/test-cases.md`, `tests/api/user.spec.ts`)
  asserts `otp` and `phone_no` are absent from a live, unauthenticated `GET /user/001` every run.
  Originally identified by static source inspection, before the `@api` suite existed.
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
  (`docs/QA Take-Home-Test.docx.pdf`).
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

### API-005 — `GET /user/:id` walks the prototype chain instead of checking `user_data`'s own keys

- **Severity:** High
- **Verification:** reproduced live against a local instance — confirmed when the `@api` suite
  drove HTTP requests against a running instance, and independently re-confirmed by this
  register entry's author, both on 2026-09-08.
- **Spec reference:** `api-main/swagger.yaml:79-92` documents `400` and a JSON error body
  (`{status_code: "400", message: string}`) for any `id` that is not a valid user id, with no
  carve-out for a particular class of invalid id.
- **Location:** `api-main/server.js:43` — `if (id in user_data)` uses the `in` operator, which
  resolves inherited properties as well as `user_data`'s own keys, so any name that exists on
  `Object.prototype` matches even though it was never one of the two seeded user records.
- **Steps to reproduce:** `GET /user/toString`, `GET /user/constructor`, `GET /user/__proto__`.
- **Expected behaviour:** none of the three is a valid user id (`user_data` only has own keys
  `"001"` and `"002"`), so each should produce the documented `400` JSON error response.
- **Actual behaviour:** confirmed live, 2026-09-08, against a local instance:
  - `GET /user/toString` → `500 Internal Server Error`, `text/html` — an Express stack-trace
    page. `toString` resolves to `Object.prototype.toString`, a function; `server.js:44-45`
    passes it to `res.send(data)`, which throws (`TypeError [ERR_INVALID_ARG_TYPE]` in
    `Buffer.from`, uncaught) instead of reaching either the `200` or `400` branch.
  - `GET /user/constructor` → `500 Internal Server Error`, `text/html`, same cause
    (`Object.prototype.constructor`).
  - `GET /user/__proto__` → `200 OK`, `application/json`, body `{}` — `user_data.__proto__`
    resolves to `Object.prototype` itself, so the truthy `in` check succeeds and `res.send(data)`
    serialises an object with no own enumerable properties, an undocumented `200` in place of the
    documented `400`.
  None of the three reaches the documented error shape; two crash the request instead, and one
  returns a wrong status with a body indistinguishable from an empty valid record.
- Demonstrated by `AC-07`, `AC-08` and `AC-09` in `docs/test-cases.md`.

### API-006 — `POST /signin` compares credentials with loose `==`, so non-string values coerce and match

- **Severity:** Medium
- **Verification:** reproduced live against a local instance — confirmed when the `@api` suite
  drove HTTP requests against a running instance, and independently re-confirmed by this
  register entry's author, both on 2026-09-08.
- **Spec reference:** `api-main/swagger.yaml:109-112` types both `phone_no` and `otp` as
  `string` in `/signin`'s request body schema.
- **Location:** `api-main/server.js:63` — `if ((body.phone_no == data.phone_no) && (body.otp ==
  data.otp))` uses `==`, so a numeric or array-valued credential is coerced to a string before
  comparison rather than rejected as the wrong type.
- **Steps to reproduce:** `POST /signin` with `{"phone_no": 20011893, "otp": 123456}` (numeric,
  and note the leading zero from the documented `"020011893"` is dropped — only survivable
  because of the loose comparison); separately, `POST /signin` with `{"phone_no":
  ["020011893"], "otp": ["123456"]}` (single-element arrays).
- **Expected behaviour:** credentials typed as anything other than the documented `string` do
  not match a stored `string` value; per the documented contract this is indistinguishable from
  any other non-matching credential pair, so both requests should produce the `404` `"Not
  found"` response.
- **Actual behaviour:** confirmed live, 2026-09-08, against a local instance — both requests
  return `200` `{"status_code":200,"status":"Pass","data":{"id":"001","first_name":"John",
  "last_name":"Doe","permission":"admin"},"message":"Sign in success"}`, signing in as user
  `001`. JavaScript's `==` coerces `20011893 == "020011893"` and `["020011893"] ==
  "020011893"` (via `Array.prototype.toString`) to `true`, so a client that sends credentials as
  numbers or single-element arrays signs in as though it had sent the correctly typed string.
- Demonstrated by `AC-18` and `AC-19` in `docs/test-cases.md`.

### API-007 — Malformed JSON on `POST /signin` returns an HTML stack-trace page instead of a JSON error envelope

- **Severity:** Medium
- **Verification:** reproduced live against a local instance — confirmed when the `@api` suite
  drove HTTP requests against a running instance, and independently re-confirmed by this register
  entry's author, both on 2026-09-08. Assigned by the ticket that wrote this register entry, which
  is what let the id be threaded into the title of the test that demonstrates it,
  `tests/api/edge-cases.spec.ts:8`.
- **Spec reference:** every one of `/signin`'s three documented responses — `200`
  (`swagger.yaml:116-149`), `404` (`:150-169`), `500` (`:170-189`) — shares the same JSON error
  envelope shape (`{status_code, status, data, message}`) and a JSON content-type; there is no
  documented branch of this endpoint that is not JSON. Swagger does not document a dedicated
  response for a request-parse failure, so this entry does not claim a specific status code is
  wrong — only that the response abandons the one property every documented branch of this
  endpoint shares.
- **Location:** `api-main/server.js:13` — `app.use(bodyParser.json())` is registered with no
  error-handling middleware after it, so a `JSON.parse` failure inside `body-parser` propagates
  as an unhandled error and falls through to Express's default error handler.
- **Steps to reproduce:** `POST /signin` with header `Content-Type: application/json` and body
  `{bad` (invalid JSON).
- **Expected behaviour:** the response is JSON, matching the envelope shape every documented
  `/signin` branch shares (`status_code`, `status`, `data`, `message`), so a client parsing any
  `/signin` response the same way does not need a special case for this one.
- **Actual behaviour:** confirmed live, 2026-09-08, against a local instance — `400 Bad Request`,
  `text/html`, Express's default error page, containing a full stack trace (`SyntaxError:
  Expected property name or '}' in JSON at position 1`, file paths through `body-parser` and
  `raw-body`). No `status_code`, `status`, `data` or `message` field exists in the response; a
  client written against `/signin`'s documented envelope cannot parse this response at all.
- Demonstrated by `AC-21` in `docs/test-cases.md`.

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
  (`tests/e2e/cart.spec.ts`, `TC-21`): the anonymous confirmation reads `Product added` and the
  logged-in confirmation reads `Product added.` — a trailing full stop — across six anonymous and
  five logged-in runs, no exceptions.
- **Steps to reproduce:** add a product to the cart while logged out and note the confirmation
  dialog text; log in, add a product to the cart, and note the confirmation dialog text again.
- **Expected behaviour:** the add-to-cart confirmation communicates the same outcome regardless
  of authentication state, so shoppers get a consistent signal that the action registered.
- **Actual behaviour:** the confirmation text differs between the logged-in and anonymous
  states.
- Demonstrated by `TC-21` in `docs/test-cases.md`.

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
  implementing the checkout-validation suite, when the live site's actual behaviour did not match
  `TC-02`'s design-time assumption that demoblaze enforces a non-empty cart.
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
  identified during design — found while implementing the cart-behaviour suite, when the live
  site's actual behaviour did not match `TC-08`'s design-time assumption that a cart built while
  logged out survives logging in.
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
  scripts driving the live site while inventorying the coverage map and again while measuring for
  the pagination-oracle decision record, reproduced across independent runs on each occasion. Not
  identified during design. Reproduced live by the `@e2e` suite (`tests/e2e/browse.spec.ts`,
  `TC-11`).
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
- **Verification:** observed live on 2026-09-07 by the throwaway exploration script driving the
  live site while inventorying the coverage map, in all three categories. Not identified during
  design. Reproduced live by the `@e2e` suite (`tests/e2e/browse.spec.ts`, `TC-12`).
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
  during design. Reproduced live by the `@e2e` suite (`tests/e2e/browse.spec.ts`, `TC-17`,
  `TC-18` and `TC-19` — the case originally designed as one `TC-17` was split into three so each
  symptom below is independently exercised and reported; see "Demonstrated by" below for exactly
  what each of the three proves).
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
- **Demonstrated by `TC-17`, `TC-18` and `TC-19` in `docs/test-cases.md`, each for a narrower
  claim than the "Actual behaviour" paragraph above states in full.** `TC-17` asserts the modal
  stays open and the form stays populated; `TC-18` asserts the nav bar stays unreachable behind
  it; `TC-19` asserts only that no confirmation appears for a duplicate submission when the
  `Purchase` button is still reachable, or that the modal is genuinely closed when it is not.
  None of the three reads the duplicate order's id or its fabricated amount — "a second, different
  order id" and the `105730 USD`/`360 USD` figures above come from the exploration probes this
  entry's Verification line cites, not from an automated assertion. A reviewer should not read
  `TC-19` as proving the fabricated-amount claim; only the probes do.

### WEB-014 — A filtered listing has no address, and browser Back discards the filter

- **Severity:** Low
- **Verification:** observed live on 2026-09-08 by a throwaway exploration script driving the
  live site during the browse/listing coverage work. Reproduced live by the `@e2e` suite
  (`tests/e2e/browse.spec.ts`, `TC-20`).
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
- Demonstrated by `TC-20` in `docs/test-cases.md`.
