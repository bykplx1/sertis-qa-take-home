# Designed test cases: demoblaze purchase journey

The written source for the `@e2e` purchase-flow coverage. One happy-path journey and seven
unhappy paths, each stated as intent: preconditions, steps, expected result. No selectors, no
code — the automated specs (see the `@e2e` purchase-journey, cart-behaviour and
checkout-validation work) map to these cases step for step.

Terms follow `CONTEXT.md`: **journey** is one complete path from landing to order confirmation,
**e2e** is a test that drives demoblaze through a browser, **defect** is a numbered discrepancy
recorded in `docs/defects.md`.

A case expected to fail carries the `WEB-` defect id it demonstrates. Two cases below were known
at design time to be expected to fail because demoblaze performs no such validation: `TC-05` and
`TC-06`. Their defect ids assume `docs/defects.md` numbers demoblaze's card-and-expiry defects
`WEB-001` (any card value accepted) and `WEB-002` (impossible expiry accepted), in the order
those defects are listed in `SPEC.md`'s "Defects identified during design" section — the
register is being built in a parallel ticket; if its numbering lands differently, these two ids
should be updated to match rather than the register renumbered to match this document.

A third case, `TC-08`, was written from intended behaviour at design time and only found to fail
once the `@e2e` cart-behaviour suite (issue #9) actually drove a browser against the live site;
it carries `WEB-010`, added to the register after the fact rather than assumed up front.

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

## TC-02 — Ordering with an empty cart is prevented

**Preconditions:** logged in with a valid account. The cart contains no items.

**Steps:**

1. Open the cart with nothing in it.
2. Attempt to proceed to place an order.

**Expected result:** the shopper cannot complete an order from an empty cart — either the
order action is unavailable, or submitting it is rejected and no order confirmation appears.

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
