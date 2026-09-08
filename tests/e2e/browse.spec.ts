import { type ListingPage } from './pages/listing-page';
import { test, expect } from './fixtures';

// TC-09 through TC-18 in the ticket that wrote them (issue #20; the cases
// themselves are drafted in #21, #17 and #22 and land in docs/test-cases.md
// separately from this ticket, per issue #20's scope). Covers the browse
// and listing surface: pagination (TC-09-TC-12), category filtering and
// card/detail agreement (TC-13-TC-15), log out (TC-16), the post-purchase
// nav bar (TC-17) and the filtered listing's browser history (TC-18).
//
// Four of these fail by design: WEB-011 (TC-11), WEB-012 (TC-12), WEB-013
// (TC-17), WEB-014 (TC-18) — bringing the suite's by-design failure count
// from four to eight (docs/adr/0001-pagination-oracle.md, issue #21).

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

  // No product appears on both pages.
  const seen = new Set<string>();
  for (const window of pages) {
    for (const name of window) {
      expect(seen.has(name)).toBe(false);
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
test('TC-10: the last page offers no way to page further forward @e2e', async ({
  homePage,
  listingPage,
}) => {
  await homePage.goto();
  await collectPages(listingPage);
  expect(await listingPage.hasNextPage()).toBe(false);
});

// TC-11: `Previous` returns to the preceding page, and offers nothing on
// the first page — WEB-011. Two paths in one case. `ListingPage` exposes
// no `previousPage()` by design (WEB-011 means the control cannot be
// walked the same safe way `Next` can), so this case reaches it directly
// — the one place in this suite that does.
test('TC-11: Previous returns to the preceding page, and offers nothing on the first page — WEB-011 @e2e', async ({
  page,
  homePage,
  listingPage,
}) => {
  // Path 1: from the first page, `Previous` must offer no navigation —
  // either hidden/disabled, or, if clicked, no change to the listing.
  await homePage.goto();
  await listingPage.waitUntilLoaded();
  const firstPage = await listingPage.productNames();
  const previousControl = page.locator('#prev2');

  if (await previousControl.isVisible()) {
    await previousControl.click();
    const afterClick = await listingPage.waitUntilStable();
    expect(afterClick).toEqual(firstPage);
  }

  // Path 2: from an honestly-reached second page, `Previous` must return
  // the first page's products.
  await homePage.goto();
  await listingPage.waitUntilLoaded();
  const firstPageAgain = await listingPage.productNames();
  await listingPage.nextPage();
  await previousControl.click();
  const afterPreviousFromSecondPage = await listingPage.waitUntilStable();
  expect(afterPreviousFromSecondPage).toEqual(firstPageAgain);
});

// TC-12: paging within a category keeps the category filter — WEB-012.
// Categories are enumerated from the DOM, never hardcoded. The oracle: a
// further page reached while a category is active must show only products
// the filter already matched — this listing's own first window is the
// only available ground truth for "matches the filter", since no category
// marker exists anywhere in the rendered page (#17).
test('TC-12: paging within a category keeps the category filter — WEB-012 @e2e', async ({
  homePage,
  listingPage,
}) => {
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
});

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
        await homePage.signUp(freshAccount.username, freshAccount.password);
        await homePage.logIn(freshAccount.username, freshAccount.password);
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
        await homePage.signUp(freshAccount.username, freshAccount.password);
        await homePage.logIn(freshAccount.username, freshAccount.password);
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
      homePage,
      listingPage,
      productPage,
      freshAccount,
    }) => {
      test.setTimeout(90_000);

      await homePage.goto();
      if (authState === 'logged in') {
        await homePage.signUp(freshAccount.username, freshAccount.password);
        await homePage.logIn(freshAccount.username, freshAccount.password);
      }

      await listingPage.waitUntilLoaded();
      let pageIndex = 0;

      // Forward-only pagination, as everywhere else in this file: walk
      // every page once, verifying each card against its own detail page,
      // then step forward again from a fresh Home rather than navigating
      // Back — a paginated (or filtered) listing has no address to return
      // to directly (TC-18, WEB-014).
      let hasMorePages = true;
      while (hasMorePages) {
        const window = await listingPage.productNames();

        for (const name of window) {
          const cardPrice = await listingPage.cardPrice(name);

          await homePage.openProduct(name);
          await productPage.waitUntilLoaded();
          await expect(productPage.name).toHaveText(name);
          expect(await productPage.priceValue()).toBe(cardPrice);

          // Rebuild this same page window before checking its next card.
          await homePage.goto();
          await listingPage.waitUntilLoaded();
          for (let step = 0; step < pageIndex; step++) {
            await listingPage.nextPage();
          }
        }

        if (await listingPage.hasNextPage()) {
          await listingPage.nextPage();
          pageIndex += 1;
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
  await homePage.signUp(freshAccount.username, freshAccount.password);
  await homePage.logIn(freshAccount.username, freshAccount.password);

  // Step 1: while logged in, add a product to the cart.
  await listingPage.waitUntilLoaded();
  await listingPage.openCategory(CATEGORY);
  await homePage.openProduct(PRODUCT_NAME);
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
  expect(await cartPage.isEmpty()).toBe(true);

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

// TC-17: after a completed purchase, the order modal closes, the form
// clears, and the order cannot be repeated — WEB-013. Known to fail: the
// order modal is never dismissed, its subtree intercepts pointer events
// across the whole viewport (hiding the nav bar behind a form still
// holding the shopper's card number), and a second Purchase books a
// duplicate order for a fabricated amount.
test('TC-17: after a completed purchase, the order modal closes, the form clears, and the order cannot be repeated — WEB-013 @e2e', async ({
  homePage,
  productPage,
  cartPage,
  checkoutModal,
  listingPage,
  freshAccount,
}) => {
  await homePage.goto();
  await homePage.signUp(freshAccount.username, freshAccount.password);
  await homePage.logIn(freshAccount.username, freshAccount.password);

  await listingPage.waitUntilLoaded();
  await listingPage.openCategory(CATEGORY);
  await homePage.openProduct(PRODUCT_NAME);
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

  // Expected result: with the modal gone, the shopper can reach the rest
  // of the site — the nav Cart link works and shows the now-empty cart.
  // Known to fail: the still-open modal's subtree intercepts pointer
  // events across the whole viewport, so this click times out.
  await homePage.openCartFromNav();
  expect(await cartPage.isEmpty()).toBe(true);

  // Expected result: a cart the completed order already emptied cannot be
  // ordered from again. Known to fail: the live `Purchase` button is still
  // clickable and books a second order for a fabricated amount.
  await checkoutModal.submit();
  await checkoutModal.confirmation().assertDoesNotAppear();
});

// TC-18: a filtered listing has no address, and browser Back discards the
// filter — WEB-014.
test('TC-18: browser Back from a product opened out of a filtered listing restores that listing — WEB-014 @e2e', async ({
  page,
  homePage,
  listingPage,
}) => {
  await homePage.goto();
  await listingPage.waitUntilLoaded();
  const [category] = await listingPage.categories();
  const filteredWindow = await listingPage.openCategory(category);

  await homePage.openProduct(filteredWindow[0]);
  await page.goBack();
  await listingPage.waitUntilLoaded();

  // Expected result: returning from a product opened out of a filtered
  // listing restores that listing, not the unfiltered one. Known to fail:
  // category links are `href="#"` and filtering is pure client-side JS, so
  // the filter never enters the URL and Back lands on the unfiltered first
  // page instead.
  const afterBack = await listingPage.productNames();
  expect(afterBack).toEqual(filteredWindow);
});
