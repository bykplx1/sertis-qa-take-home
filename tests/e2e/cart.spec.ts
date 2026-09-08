import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';

// Two distinct, low-priced, unambiguous products under "Phones" — same
// category as the purchase journey (issue #8), so this spec exercises a
// second, independent product pairing rather than depending on TC-01's
// product still being the only one in the catalogue.
const CATEGORY = 'Phones' as const;
const PRODUCT_A = 'Samsung galaxy s6';
const PRODUCT_B = 'Nokia lumia 1520';

// demoblaze keys the anonymous cart by a `user` cookie set on landing
// (distinct from the `tokenp_` cookie login adds). WEB-010 claims this
// cookie survives login unchanged while the cart view still comes back
// empty — read directly rather than asserted from memory, so the test
// itself proves (or disproves) the mechanism the defect id claims.
async function userCookieValue(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === 'user')?.value;
}

// TC-07 in docs/test-cases.md, extended to also cover this issue's first two
// acceptance criteria (several products appear in the cart; the total is
// their sum) as TC-07's own precondition — "the cart contains two or more
// items of known prices" — since docs/test-cases.md does not define a
// separate case for that precondition on its own.
test('TC-07: several products appear in the cart, the total is their sum, and removing one recalculates it @e2e', async ({
  homePage,
  productPage,
  cartPage,
  listingPage,
  freshAccount,
}) => {
  await homePage.goto();
  await homePage.signUp(freshAccount.username, freshAccount.password);
  await homePage.logIn(freshAccount.username, freshAccount.password);

  // Add PRODUCT_A.
  await listingPage.waitUntilLoaded();
  await listingPage.openCategory(CATEGORY);
  await homePage.openProduct(PRODUCT_A);
  await productPage.waitUntilLoaded();
  const priceA = await productPage.priceValue();
  // Exact string, not /added/i: both products are added while logged in,
  // whose confirmation carries a trailing full stop the anonymous one
  // does not (WEB-007, issue #20).
  const messageA = await productPage.addToCart();
  expect(messageA).toBe('Product added.');

  // Add PRODUCT_B.
  await homePage.goto();
  await listingPage.waitUntilLoaded();
  await listingPage.openCategory(CATEGORY);
  await homePage.openProduct(PRODUCT_B);
  await productPage.waitUntilLoaded();
  const priceB = await productPage.priceValue();
  const messageB = await productPage.addToCart();
  expect(messageB).toBe('Product added.');

  // Steps 1: open the cart and note the displayed total. Both products
  // appear (acceptance criterion: "several products added all appear in
  // the cart") and the total is their sum (acceptance criterion: "the cart
  // total equals the sum of the item prices").
  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_A);
  await cartPage.waitForItem(PRODUCT_B);
  expect(await cartPage.itemCount()).toBe(2);
  await expect(cartPage.rowFor(PRODUCT_A)).toContainText(String(priceA));
  await expect(cartPage.rowFor(PRODUCT_B)).toContainText(String(priceB));

  const totalBeforeRemoval = await cartPage.stableTotal();
  expect(totalBeforeRemoval).toBe(priceA + priceB);

  // Step 2: remove one item from the cart.
  await cartPage.removeItem(PRODUCT_A);
  await expect(cartPage.rowFor(PRODUCT_A)).toHaveCount(0);

  // Step 3: wait for the displayed total to stop changing.
  // Expected result: the stabilised total equals the sum of the prices of
  // the items still in the cart (WEB-008: the total is recomputed
  // incrementally per line item and is observably racy along the way,
  // which is exactly why this is polled to stability rather than read
  // immediately after the removal).
  const totalAfterRemoval = await cartPage.stableTotal();
  expect(totalAfterRemoval).toBe(priceB);
  expect(await cartPage.itemCount()).toBe(1);
});

// TC-08 in docs/test-cases.md. Written from intended behaviour (SPEC.md
// user story 22) and expected to pass; live runs against demoblaze show it
// does not — the anonymous `user` cookie that keys the cart is unchanged by
// logging in, but the post-login cart view does not surface items added
// under it. Registered as WEB-010 in docs/defects.md.
test('TC-08: adding to cart while logged out, then logging in, preserves the cart — WEB-010 @e2e', async ({
  page,
  homePage,
  productPage,
  cartPage,
  listingPage,
  freshAccount,
}) => {
  // Preconditions: not logged in. An existing account is available to log
  // into during the journey — demoblaze cannot be seeded, so that account
  // is created here via sign-up (without logging in yet) rather than
  // assumed to pre-exist.
  await homePage.goto();
  await homePage.signUp(freshAccount.username, freshAccount.password);

  // Step 1: while logged out, add one or more products to the cart.
  await listingPage.waitUntilLoaded();
  await listingPage.openCategory(CATEGORY);
  await homePage.openProduct(PRODUCT_A);
  await productPage.waitUntilLoaded();
  const priceA = await productPage.priceValue();
  // Exact string, not /added/i: this shopper is still logged out at this
  // point, whose confirmation reads without the logged-in state's
  // trailing full stop (WEB-007, issue #20).
  const messageA = await productPage.addToCart();
  expect(messageA).toBe('Product added');

  // Step 2: open the cart and note its contents.
  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_A);
  expect(await cartPage.itemCount()).toBe(1);
  const totalWhileLoggedOut = await cartPage.stableTotal();
  expect(totalWhileLoggedOut).toBe(priceA);
  const cookieBeforeLogin = await userCookieValue(page);
  expect(cookieBeforeLogin).toBeTruthy();

  // Step 3: log in with an existing account.
  await homePage.goto();
  await homePage.logIn(freshAccount.username, freshAccount.password);

  // The identity cookie that keyed the anonymous cart is unchanged by
  // logging in (WEB-010) — login only adds a separate `tokenp_` cookie
  // alongside it, it does not rotate `user`. Asserted here, not just
  // observed while debugging, so a reader of this test's failure output
  // sees the mechanism WEB-010 claims rather than having to take it on
  // trust.
  const cookieAfterLogin = await userCookieValue(page);
  expect(cookieAfterLogin).toBe(cookieBeforeLogin);

  // Step 4: open the cart again.
  // Expected result: the cart still contains the item added while logged
  // out; logging in does not lose it. WEB-010: it does not — the cart view
  // comes back empty despite the identity cookie above being unchanged.
  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_A);
  expect(await cartPage.itemCount()).toBe(1);
  const totalAfterLogin = await cartPage.stableTotal();
  expect(totalAfterLogin).toBe(priceA);
});
