import { test } from './fixtures';

// TC-02 through TC-06 in docs/test-cases.md: the unhappy paths through the
// order form. Reuses the purchase-journey page objects and fixtures
// (issue #8) rather than a parallel set (SPEC.md "E2E architecture").
//
// TC-05 and TC-06 are known to fail by design: demoblaze performs no
// card-format or expiry-date validation (WEB-001, WEB-002 in
// docs/defects.md). TC-02 also fails by design — the live site was found
// during this ticket's implementation to accept an order placed from an
// empty cart, a defect not identified at design time and now recorded as
// WEB-009 in docs/defects.md. TC-03 and TC-04 are confirmed, against the
// live site, to be enforced by demoblaze and are written as passing tests.

const CATEGORY = 'Phones' as const;
const PRODUCT_NAME = 'Samsung galaxy s6';

const VALID_ORDER_DETAILS = {
  name: 'QA Automation',
  country: 'Thailand',
  city: 'Bangkok',
  card: '4111111111111111',
  month: '5',
  year: '2030',
};

/** Signs up and logs in a fresh account, per SPEC.md "Test data". */
async function signUpAndLogIn(
  homePage: import('./pages/home-page').HomePage,
  account: import('./support/random-account').Account,
): Promise<void> {
  await homePage.goto();
  await homePage.signUp(account.username, account.password);
  await homePage.logIn(account.username, account.password);
}

/** Adds the one product this suite uses to a freshly logged-in shopper's cart. */
async function addProductToCart(
  homePage: import('./pages/home-page').HomePage,
  listingPage: import('./pages/listing-page').ListingPage,
  productPage: import('./pages/product-page').ProductPage,
): Promise<void> {
  await listingPage.waitUntilLoaded();
  await listingPage.openCategory(CATEGORY);
  await listingPage.openProduct(PRODUCT_NAME);
  await productPage.waitUntilLoaded();
  await productPage.addToCart();
}

// TC-02 in docs/test-cases.md.
//
// Known to fail: contrary to TC-02's design-time expectation, the live
// site does not prevent ordering from an empty cart — the "Place Order"
// modal opens regardless of cart contents, and submitting it against zero
// items produces a confirmation with an order id and an amount of 0
// (verified against the live site three times running while implementing
// this ticket; see docs/defects.md WEB-009). This test asserts the
// intended behaviour, not the observed one, and fails by design.
test('TC-02: ordering with an empty cart is prevented — WEB-009 @e2e', async ({
  homePage,
  cartPage,
  checkoutModal,
  freshAccount,
}) => {
  // 1. Open the cart with nothing in it.
  await signUpAndLogIn(homePage, freshAccount);
  await cartPage.open();
  await cartPage.assertEmpty();

  // 2. Attempt to proceed to place an order.
  await cartPage.placeOrder();
  await checkoutModal.waitUntilOpen();
  await checkoutModal.fill(VALID_ORDER_DETAILS);
  await checkoutModal.submit();

  // Expected result: the shopper cannot complete an order from an empty
  // cart — no order confirmation appears.
  await checkoutModal.confirmation().assertDoesNotAppear();
});

// TC-03 in docs/test-cases.md. Confirmed against the live site: demoblaze
// does enforce a non-blank name, so this is written as a passing test.
test('TC-03: ordering with a blank name is prevented @e2e', async ({
  homePage,
  productPage,
  cartPage,
  checkoutModal,
  listingPage,
  freshAccount,
}) => {
  await signUpAndLogIn(homePage, freshAccount);
  await addProductToCart(homePage, listingPage, productPage);
  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_NAME);
  await cartPage.placeOrder();
  await checkoutModal.waitUntilOpen();

  // 1. Leave the Name field blank.
  // 2. Fill in the remaining order fields, including a valid-looking card
  //    number, with valid values.
  const { name: _omittedName, ...rest } = VALID_ORDER_DETAILS;
  await checkoutModal.fill(rest);

  // 3. Submit the order.
  await checkoutModal.submit();

  // Expected result: the order is rejected. No order confirmation appears.
  await checkoutModal.confirmation().assertDoesNotAppear();
});

// TC-04 in docs/test-cases.md. Confirmed against the live site: demoblaze
// does enforce a non-blank card number, so this is written as a passing
// test.
test('TC-04: ordering with a blank card is prevented @e2e', async ({
  homePage,
  productPage,
  cartPage,
  checkoutModal,
  listingPage,
  freshAccount,
}) => {
  await signUpAndLogIn(homePage, freshAccount);
  await addProductToCart(homePage, listingPage, productPage);
  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_NAME);
  await cartPage.placeOrder();
  await checkoutModal.waitUntilOpen();

  // 1. Fill in the Name field with a valid value.
  // 2. Leave the Credit card field blank.
  const { card: _omittedCard, ...rest } = VALID_ORDER_DETAILS;
  await checkoutModal.fill(rest);

  // 3. Submit the order.
  await checkoutModal.submit();

  // Expected result: the order is rejected. No order confirmation appears.
  await checkoutModal.confirmation().assertDoesNotAppear();
});

// TC-05 in docs/test-cases.md. Known to fail by design: demoblaze performs
// no card-format validation and accepts the order regardless of the card
// value entered (docs/defects.md WEB-001). This test asserts intended
// behaviour, not observed behaviour, and is not weakened to certify the
// defect as correct.
test('TC-05: an invalid card number format is rejected — WEB-001 @e2e', async ({
  homePage,
  productPage,
  cartPage,
  checkoutModal,
  listingPage,
  freshAccount,
}) => {
  await signUpAndLogIn(homePage, freshAccount);
  await addProductToCart(homePage, listingPage, productPage);
  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_NAME);
  await cartPage.placeOrder();
  await checkoutModal.waitUntilOpen();

  // 1. Fill in the Name field with a valid value.
  // 2. Enter a card value that is not a valid card number (a single
  //    character).
  // 3. Fill in the remaining order fields with valid values.
  await checkoutModal.fill({ ...VALID_ORDER_DETAILS, card: 'x' });

  // 4. Submit the order.
  await checkoutModal.submit();

  // Expected result: the order is rejected as an invalid card format; no
  // order confirmation appears.
  await checkoutModal.confirmation().assertDoesNotAppear();
});

// TC-06 in docs/test-cases.md. Known to fail by design: demoblaze performs
// no expiry-date validation and accepts the order regardless of the expiry
// value entered (docs/defects.md WEB-002). This test asserts intended
// behaviour, not observed behaviour, and is not weakened to certify the
// defect as correct.
test('TC-06: an impossible expiry date is rejected — WEB-002 @e2e', async ({
  homePage,
  productPage,
  cartPage,
  checkoutModal,
  listingPage,
  freshAccount,
}) => {
  await signUpAndLogIn(homePage, freshAccount);
  await addProductToCart(homePage, listingPage, productPage);
  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_NAME);
  await cartPage.placeOrder();
  await checkoutModal.waitUntilOpen();

  // 1. Fill in the Name field and Credit card field with valid values.
  // 2. Enter an expiry month/year combination that cannot exist (a month
  //    outside 1-12).
  await checkoutModal.fill({ ...VALID_ORDER_DETAILS, month: '13', year: '2001' });

  // 3. Submit the order.
  await checkoutModal.submit();

  // Expected result: the order is rejected as having an impossible expiry
  // date; no order confirmation appears.
  await checkoutModal.confirmation().assertDoesNotAppear();
});
