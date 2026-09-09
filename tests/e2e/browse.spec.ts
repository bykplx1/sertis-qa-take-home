import { type ListingPage } from './pages/listing-page';
import { ProductPage } from './pages/product-page';
import { type HomePage } from './pages/home-page';
import { type CartPage } from './pages/cart-page';
import { type CheckoutModal } from './pages/checkout-modal';
import { logInAs } from './support/auth';
import { CATEGORY, PRODUCT_NAME, VALID_ORDER_DETAILS } from './support/test-data';
import { type Account } from './support/random-account';
import { test, expect } from './fixtures';

// TC-09 through TC-20 in the ticket that wrote them (issue #20; the cases
// themselves are drafted in #21, #17 and #22 and land in docs/test-cases.md
// separately from this ticket, per issue #20's scope). Covers the browse
// and listing surface: pagination (TC-09-TC-12), category filtering and
// card/detail agreement (TC-13-TC-15), log out (TC-16), the post-purchase
// order modal and nav bar (TC-17-TC-19) and the filtered listing's browser
// history (TC-20).
//
// Four of these fail by design: WEB-011 (TC-11), WEB-012 (TC-12), WEB-013
// (TC-17-TC-19), WEB-014 (TC-20). Together with TC-21 (WEB-007, cart.spec.ts —
// not this file, since it belongs next to the add-to-cart tests it
// extends), the suite's by-design failure count goes from four to nine
// (docs/adr/0001-pagination-oracle.md, issue #21). The original TC-17 is
// split into three tests below (issue #26 E4), so the by-design *test* count is
// eleven even though the by-design *defect* count is still nine.
//
// The nine by-design defect reproductions in this file and cart.spec.ts are
// all declared with `test.fail()` rather than a plain `test()` (issue #26
// E10): each is a known-failing reproduction, not a flaky assertion, so
// `retries: 2` re-running it three times each was tripling its cost for no
// new evidence. `test.fail()` runs it once, reports green while the defect
// persists, and turns red the moment demoblaze fixes it.

/**
 * Enumerates every page window of the current (unfiltered or filtered)
 * listing, forward-only via `Next` — `ListingPage` has no `previousPage`
 * because `Previous` corrupts the window instead of returning to the prior
 * one (`WEB-011`). Assumes the caller has already navigated to the listing.
 */
async function collectPages(listingPage: ListingPage): Promise<string[][]> {
  await listingPage.waitUntilLoaded();
  const pages: string[][] = [await listingPage.productNames()];
  while (await listingPage.hasNextPage()) {
    pages.push(await listingPage.nextPage());
  }
  return pages;
}

// TC-09: the two pages of the unfiltered listing partition the catalogue.
// No product appears on both pages; no product appears on neither.
// Asserted without naming a product count (docs/adr/0001-pagination-oracle.md
// ruling 4), so a changed catalogue does not turn this red.
test('TC-09: the pages of the unfiltered listing partition the catalogue @e2e', async ({
  homePage,
  listingPage,
}) => {
  await homePage.goto();
  const pages = await collectPages(listingPage);

  // No product appears on both pages. The failure names the product and
  // the fact that it repeated across page windows, rather than reporting
  // the uninformative "expected false, received true" a `seen.has(name)`
  // boolean assertion would (issue #26 E13).
  const seen = new Set<string>();
  for (const window of pages) {
    for (const name of window) {
      expect(seen, `${name} appears on more than one page window`).not.toContain(name);
      seen.add(name);
    }
  }

  // No product appears on neither: `collectPages` walked forward until no
  // further page was offered, so this collection is the entire listing by
  // construction — there is nothing left outside it to be missing from it.
  expect(await listingPage.hasNextPage()).toBe(false);
});

// TC-10: the last page offers no way to page further forward. Guards the
// convention TC-11 leans on.
//
// Two independent oracles, not one (issue #26 E5): `hasNextPage()` is the
// same boolean `collectPages()`'s own loop already used to decide it had
// reached this page, so asserting it again afterwards is tautological — a
// regression would surface as a `waitForChange` timeout inside the page
// object during collection, never as this assertion actually failing.
// `forceClickNext()` is the independent signal: a genuine attempt to click
// past Playwright's visibility check, whose outcome — refused outright, or
// landed and left the window unchanged — is asserted explicitly rather
// than collapsed into one silently-caught error (issue #26 review, item
// 2): a dispatched click that actually moved the listing is what this
// case exists to catch, and a click that never reached the control at all
// cannot demonstrate that either way.
test('TC-10: the last page offers no way to page further forward @e2e', async ({
  homePage,
  listingPage,
}) => {
  await homePage.goto();
  const pages = await collectPages(listingPage);
  const lastWindow = pages[pages.length - 1];

  const { dispatched, window } = await listingPage.forceClickNext();
  if (dispatched) {
    // The control was reachable enough to accept a forced click. Expected
    // result: even so, the listing is left unchanged.
    expect(window).toEqual(lastWindow);
  } else {
    // The click never landed at all — refused outright (demoblaze hides
    // `#next2` via `display: none` here, verified live). Re-confirmed
    // rather than assumed from the click's failure alone, so a click
    // refused for an unrelated reason is not mistaken for this.
    expect(await listingPage.hasNextPage()).toBe(false);
  }
});

// TC-11: `Previous` returns to the preceding page, and offers nothing on
// the first page — WEB-011. Two paths in one case. `ListingPage` exposes
// no general `previousPage()` for walking (WEB-011 means the control
// cannot be walked the same safe way `Next` can), only `clickPrevious()`
// and `isPreviousOffered()` for the case that tests the control itself
// (issue #25 E2/E8).
test.fail(
  'TC-11: Previous returns to the preceding page, and offers nothing on the first page — WEB-011 @e2e',
  async ({ homePage, listingPage }) => {
    // Path 1: from the first page, `Previous` must offer no navigation —
    // either hidden/disabled, or, if clicked, no change to the listing.
    await homePage.goto();
    await listingPage.waitUntilLoaded();
    const firstPage = await listingPage.productNames();

    if (await listingPage.isPreviousOffered()) {
      const afterClick = await listingPage.clickPrevious();
      expect(afterClick).toEqual(firstPage);
    }

    // Path 2: from an honestly-reached second page, `Previous` must return
    // the first page's products.
    await homePage.goto();
    await listingPage.waitUntilLoaded();
    const firstPageAgain = await listingPage.productNames();
    await listingPage.nextPage();
    const afterPreviousFromSecondPage = await listingPage.clickPrevious();
    expect(afterPreviousFromSecondPage).toEqual(firstPageAgain);
  },
);

// TC-12: paging within a category keeps the category filter — WEB-012.
// Categories are enumerated from the DOM, never hardcoded. The oracle: a
// further page reached while a category is active must show only products
// the filter already matched — this listing's own first window is the
// only available ground truth for "matches the filter", since no category
// marker exists anywhere in the rendered page (#17).
test.fail(
  'TC-12: paging within a category keeps the category filter — WEB-012 @e2e',
  async ({ homePage, listingPage }) => {
    await homePage.goto();
    await listingPage.waitUntilLoaded();
    const categories = await listingPage.categories();

    for (const category of categories) {
      await homePage.goto();
      await listingPage.waitUntilLoaded();
      const filteredWindow = await listingPage.openCategory(category);

      if (!(await listingPage.hasNextPage())) {
        // No further page offered under this category: correct, every
        // matching product is already on screen.
        continue;
      }

      const nextWindow = await listingPage.nextPage();
      for (const name of nextWindow) {
        expect(filteredWindow).toContain(name);
      }
    }
  },
);

const AUTH_STATES = ['anonymous', 'logged in'] as const;

// TC-13, TC-14 and TC-15 run in both auth states as one parameterised run
// (issue #20/#21: "a deliberate call to prove auth-invariance rather than
// assume it" — a third state costs one line here).
for (const authState of AUTH_STATES) {
  test.describe(`auth state: ${authState}`, () => {
    test(`TC-13 (${authState}): a category narrows the listing to a non-empty proper subset of the unfiltered result set @e2e`, async ({
      homePage,
      listingPage,
      freshAccount,
    }) => {
      await homePage.goto();
      if (authState === 'logged in') {
        await logInAs(homePage, freshAccount);
      }

      const unfilteredPages = await collectPages(listingPage);
      const unfilteredSet = new Set(unfilteredPages.flat());
      const categories = await listingPage.categories();

      for (const category of categories) {
        await homePage.goto();
        await listingPage.waitUntilLoaded();
        const categoryWindow = await listingPage.openCategory(category);

        // Non-empty.
        expect(categoryWindow.length).toBeGreaterThan(0);
        // Subset of the unfiltered result set.
        for (const name of categoryWindow) {
          expect(unfilteredSet.has(name)).toBe(true);
        }
        // Strictly narrower — a proper subset, not the whole listing
        // again. A relative comparison, not a named count.
        expect(categoryWindow.length).toBeLessThan(unfilteredSet.size);
      }
    });

    test(`TC-14 (${authState}): every product on the unfiltered listing appears in some category @e2e`, async ({
      homePage,
      listingPage,
      freshAccount,
    }) => {
      await homePage.goto();
      if (authState === 'logged in') {
        await logInAs(homePage, freshAccount);
      }

      const unfilteredNames = (await collectPages(listingPage)).flat();
      const categories = await listingPage.categories();

      // Coverage only (Option B, issue #17): the reverse direction — every
      // category product also appears unfiltered — is already TC-13's
      // subset clause. Union *equality* (Option A) was rejected as
      // brittle: a correct catalogue that added an uncategorised product
      // would turn that assertion red for being correct.
      const categorised = new Set<string>();
      for (const category of categories) {
        await homePage.goto();
        await listingPage.waitUntilLoaded();
        const categoryWindow = await listingPage.openCategory(category);
        categoryWindow.forEach((name) => categorised.add(name));
      }

      for (const name of unfilteredNames) {
        expect(categorised.has(name)).toBe(true);
      }
    });

    test(`TC-15 (${authState}): a listing card and its detail page agree on the product and its parsed price @e2e`, async ({
      page,
      homePage,
      listingPage,
      freshAccount,
    }) => {
      await homePage.goto();
      if (authState === 'logged in') {
        await logInAs(homePage, freshAccount);
      }

      await listingPage.waitUntilLoaded();
      let hasMorePages = true;

      // Forward-only pagination, as everywhere else in this file. Each
      // card's detail page is opened in a second, throwaway page rather
      // than navigated to on this one — the listing page's current
      // window is never disturbed, so this stays linear in the number of
      // products instead of the re-pagination an O(n^2) walk would
      // otherwise need, and it never relies on browser Back, which
      // WEB-014 (TC-20) shows does not return to a paginated window.
      while (hasMorePages) {
        const window = await listingPage.productNames();

        for (const name of window) {
          const cardPrice = await listingPage.cardPrice(name);
          const href = await listingPage.hrefFor(name);

          const detailPage = await page.context().newPage();
          const productPage = new ProductPage(detailPage);
          try {
            await detailPage.goto(href);
            await productPage.waitUntilLoaded();
            await expect(productPage.name).toHaveText(name);
            expect(await productPage.priceValue()).toBe(cardPrice);
          } finally {
            // Closed even when an assertion above throws, so a failure
            // mid-loop doesn't leak an extra tab into the trace for every
            // remaining product (issue #26 E12).
            await detailPage.close();
          }
        }

        if (await listingPage.hasNextPage()) {
          await listingPage.nextPage();
        } else {
          hasMorePages = false;
        }
      }
    });
  });
}

// TC-16: logging out hides the account's cart without destroying it.
// Expected to PASS — the cart belongs to the account, not the session
// (issue #22). Must not be read as demonstrating WEB-005, which did not
// reproduce: three completed purchases, two of them logged in, all left
// the cart correctly empty.
test("TC-16: logging out hides the account's cart, and logging back in restores it @e2e", async ({
  homePage,
  productPage,
  cartPage,
  listingPage,
  freshAccount,
}) => {
  await homePage.goto();
  await logInAs(homePage, freshAccount);

  // Step 1: while logged in, add a product to the cart.
  await listingPage.waitUntilLoaded();
  await listingPage.openCategory(CATEGORY);
  await listingPage.openProduct(PRODUCT_NAME);
  await productPage.waitUntilLoaded();
  const price = await productPage.priceValue();
  await productPage.addToCart();

  // Step 2: open the cart and note its contents.
  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_NAME);
  expect(await cartPage.stableTotal()).toBe(price);

  // Step 3: log out.
  await homePage.goto();
  await homePage.logOut();

  // Step 4: open the cart. Expected result: the anonymous shopper is not
  // shown the account's cart.
  await cartPage.open();
  await cartPage.assertEmpty();

  // Step 5: log back in with the same account.
  await homePage.goto();
  await homePage.logIn(freshAccount.username, freshAccount.password);

  // Step 6: open the cart again. Expected result: it contains exactly the
  // items added in step 1, at the same price — logging out hid the cart,
  // it did not destroy it.
  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_NAME);
  expect(await cartPage.stableTotal()).toBe(price);
});

// One case originally bundled three WEB-013 claims (modal closes and clears,
// the nav bar is reachable again, a second Purchase is refused) into one
// test. Only the first `expect` was ever reached: once it failed, the
// nav-bar and duplicate-order assertions never executed, yet the case as a
// single test would have credited a run with reproducing all three
// symptoms including "a second, different order id" the moment the first
// assertion happened to fail for any reason. Split into three tests below,
// each independently completing its own purchase through the shared
// `completedPurchase()` helper, so each symptom is actually exercised and
// separately reported (issue #26 E4). What the three now prove, for the
// record, matching `docs/test-cases.md`'s TC-17, TC-18 and TC-19:
//   1. acknowledging the purchase confirmation closes the order modal and
//      clears its form;
//   2. after acknowledging, the navigation bar is reachable again;
//   3. a cart a completed order already emptied cannot be ordered from a
//      second time — proved two ways depending on which world the run
//      lands in (issue #26 review item 1): if the `Purchase` button is
//      still reachable at all, no confirmation appears for the duplicate
//      submission; if it is not reachable, there is no live control left
//      to place a duplicate order from. Neither branch asserts the
//      register's stronger claim of "a second, different order id" for a
//      fabricated amount — that would need reading the confirmation's own
//      details on the defect-present path, which this case does not do.
// All three are known to fail against the live site (WEB-013): the order
// modal is never dismissed, its subtree intercepts pointer events across
// the whole viewport (hiding the nav bar behind a form still holding the
// shopper's card number), and a second Purchase books a duplicate order
// for a fabricated amount.

/**
 * Signs up, logs in, adds the one product this suite uses, places an order
 * with valid-looking details, and acknowledges the confirmation. Shared by
 * TC-17, TC-18 and TC-19 (issue #26 E4) so each independently reaches
 * the state WEB-013 is about, rather than one test's assertion failure
 * hiding the other two symptoms from ever being exercised.
 */
async function completedPurchase(
  homePage: HomePage,
  productPage: ProductPage,
  cartPage: CartPage,
  checkoutModal: CheckoutModal,
  listingPage: ListingPage,
  freshAccount: Account,
): Promise<void> {
  await homePage.goto();
  await logInAs(homePage, freshAccount);

  await listingPage.waitUntilLoaded();
  await listingPage.openCategory(CATEGORY);
  await listingPage.openProduct(PRODUCT_NAME);
  await productPage.waitUntilLoaded();
  await productPage.addToCart();

  await cartPage.open();
  await cartPage.waitForItem(PRODUCT_NAME);
  await cartPage.placeOrder();
  await checkoutModal.waitUntilOpen();
  await checkoutModal.fill(VALID_ORDER_DETAILS);
  await checkoutModal.submit();

  const confirmation = checkoutModal.confirmation();
  await confirmation.waitUntilVisible();
  await confirmation.close();
}

test.fail(
  'TC-17: acknowledging the purchase confirmation closes the order modal and clears its form — WEB-013 @e2e',
  async ({ homePage, productPage, cartPage, checkoutModal, listingPage, freshAccount }) => {
    await completedPurchase(homePage, productPage, cartPage, checkoutModal, listingPage, freshAccount);

    // Expected result: acknowledging the confirmation closes the order
    // modal, clearing the form that held the shopper's name and full card
    // number. Known to fail: `#orderModal` stays `class="modal fade show"`,
    // `display: block`, with the form still populated.
    expect(await checkoutModal.isOpen()).toBe(false);
    expect(await checkoutModal.fieldValues()).toEqual({
      name: '',
      country: '',
      city: '',
      card: '',
      month: '',
      year: '',
    });
  },
);

test.fail(
  'TC-18: after a completed purchase, the navigation bar is reachable again — WEB-013 @e2e',
  async ({ homePage, productPage, cartPage, checkoutModal, listingPage, freshAccount }) => {
    await completedPurchase(homePage, productPage, cartPage, checkoutModal, listingPage, freshAccount);

    // Expected result: with the modal gone, the shopper can reach the rest
    // of the site — the nav Cart link works and shows the now-empty cart.
    // Known to fail: the still-open modal's subtree intercepts pointer
    // events across the whole viewport, so this click times out.
    await homePage.openCartFromNav();
    await cartPage.assertEmpty();
  },
);

test.fail(
  'TC-19: a cart already emptied by a completed order cannot be ordered from a second time — WEB-013 @e2e',
  async ({ homePage, productPage, cartPage, checkoutModal, listingPage, freshAccount }) => {
    await completedPurchase(homePage, productPage, cartPage, checkoutModal, listingPage, freshAccount);

    // An unconditional `submit()` here would time out identically whether
    // the defect is present (a still-open modal whose Purchase button
    // books a duplicate order) or fixed (a genuinely closed modal whose
    // Purchase button is simply unreachable) — the same failure either
    // way, which would make this test green forever regardless of whether
    // demoblaze ever fixes WEB-013 (issue #26 review item 1). Distinguish
    // the two worlds explicitly instead: whether the click landed at all
    // is itself the signal.
    const dispatched = await checkoutModal.attemptSubmit();

    if (dispatched) {
      // The live Purchase button was still reachable and clickable — the
      // defect's premise. Expected result: even so, no confirmation
      // appears for the duplicate submission. Known to fail: it does —
      // the live button books a second order for a fabricated amount.
      await checkoutModal.confirmation().assertDoesNotAppear();
    } else {
      // The Purchase button was not reachable at all — the modal WEB-013
      // keeps open is genuinely closed. Asserted directly rather than
      // accepted as silent success, so a click refused for an unrelated
      // reason is not mistaken for this: a duplicate order is impossible
      // because there is no live control left to place one from.
      expect(await checkoutModal.isOpen()).toBe(false);
    }
  },
);

// TC-20: a filtered listing has no address, and browser Back discards the
// filter — WEB-014.
test.fail(
  'TC-20: browser Back from a product opened out of a filtered listing restores that listing — WEB-014 @e2e',
  async ({ page, homePage, listingPage }) => {
    await homePage.goto();
    await listingPage.waitUntilLoaded();
    const [category] = await listingPage.categories();
    const filteredWindow = await listingPage.openCategory(category);

    await listingPage.openProduct(filteredWindow[0]);
    await page.goBack();
    await listingPage.waitUntilLoaded();

    // Expected result: returning from a product opened out of a filtered
    // listing restores that listing, not the unfiltered one. Known to fail:
    // category links are `href="#"` and filtering is pure client-side JS, so
    // the filter never enters the URL and Back lands on the unfiltered first
    // page instead.
    const afterBack = await listingPage.productNames();
    expect(afterBack).toEqual(filteredWindow);
  },
);
