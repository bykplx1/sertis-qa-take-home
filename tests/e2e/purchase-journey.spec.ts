import { CATEGORY, PRODUCT_NAME, VALID_ORDER_DETAILS } from './support/test-data';
import { test, expect } from './fixtures';

// TC-01 in docs/test-cases.md. Steps below map line for line to that
// document's numbered steps (SPEC.md "E2E architecture": "the designed
// test case document and the automated script should map to each other
// line for line").
test('TC-01: sign up, add to cart, place an order, see confirmation @e2e', async ({
  homePage,
  productPage,
  cartPage,
  checkoutModal,
  listingPage,
  freshAccount,
}) => {
  // 1. Land on the demoblaze home page.
  await homePage.goto();

  // 2. Sign up for a new account using the fresh randomised username and password.
  await homePage.signUp(freshAccount.username, freshAccount.password);

  // 3. Log in with that account.
  await homePage.logIn(freshAccount.username, freshAccount.password);

  // 4. Open a product category and select a product from it.
  await listingPage.waitUntilLoaded();
  await listingPage.openCategory(CATEGORY);
  await listingPage.openProduct(PRODUCT_NAME);

  // 5. On the product page, confirm its name, price and description are displayed.
  await productPage.waitUntilLoaded();
  await expect(productPage.name).toHaveText(PRODUCT_NAME);
  await expect(productPage.price).toContainText('$');
  await expect(productPage.description).not.toBeEmpty();
  const productPrice = await productPage.priceValue();

  // 6. Add the product to the cart and acknowledge the add-to-cart confirmation.
  // Intent-level match: this journey's subject is that adding registers at
  // all, not the confirmation's exact wording. The wording's consistency
  // across auth states is TC-21's subject (cart.spec.ts, WEB-007).
  const addToCartMessage = await productPage.addToCart();
  expect(addToCartMessage).toMatch(/added/i);

  // 7. Open the cart and confirm the product appears, priced correctly.
  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_NAME);
  await expect(cartPage.rowFor(PRODUCT_NAME)).toContainText(String(productPrice));
  const cartTotal = await cartPage.stableTotal();
  expect(cartTotal).toBe(productPrice);

  // 8. Proceed to place the order.
  await cartPage.placeOrder();
  await checkoutModal.waitUntilOpen();

  // 9. Fill in the order form with a name and a card number (and any other
  //    fields the form requires) using valid-looking values.
  await checkoutModal.fill(VALID_ORDER_DETAILS);

  // 10. Submit the order.
  await checkoutModal.submit();

  // Expected result: an order confirmation appears, showing an order id
  // and a purchase amount equal to the sum of the products added to the
  // cart. The order id's value itself is not asserted, only that it is
  // present and shaped like an id.
  const confirmation = checkoutModal.confirmation();
  await confirmation.waitUntilVisible();
  const { orderId, amount } = await confirmation.details();
  expect(orderId).toMatch(/^\d+$/);
  expect(amount).toBe(productPrice);
  await confirmation.close();

  // Returning to the cart afterwards shows it empty.
  await cartPage.open();
  await cartPage.assertEmpty();
});

// Secondary scenario (issue #8 acceptance criteria: "the anonymous journey
// is covered as a secondary scenario"). Same purchase journey, minus the
// account: demoblaze scopes the anonymous cart to a per-browser-session
// cookie, so an anonymous purchase is a legitimate, supported path and not
// merely a truncated version of TC-01.
test('TC-22: an anonymous shopper can add to cart and place an order without an account @e2e', async ({
  homePage,
  productPage,
  cartPage,
  checkoutModal,
  listingPage,
}) => {
  await homePage.goto();
  await listingPage.waitUntilLoaded();
  await listingPage.openCategory(CATEGORY);
  await listingPage.openProduct(PRODUCT_NAME);

  await productPage.waitUntilLoaded();
  const productPrice = await productPage.priceValue();

  const addToCartMessage = await productPage.addToCart();
  expect(addToCartMessage).toMatch(/added/i);

  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_NAME);
  const cartTotal = await cartPage.stableTotal();
  expect(cartTotal).toBe(productPrice);

  await cartPage.placeOrder();
  await checkoutModal.waitUntilOpen();
  await checkoutModal.fill(VALID_ORDER_DETAILS);
  await checkoutModal.submit();

  const confirmation = checkoutModal.confirmation();
  await confirmation.waitUntilVisible();
  const { orderId, amount } = await confirmation.details();
  expect(orderId).toMatch(/^\d+$/);
  expect(amount).toBe(productPrice);
  await confirmation.close();

  await cartPage.open();
  await cartPage.assertEmpty();
});
