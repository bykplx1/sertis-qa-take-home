import { type Locator, type Page, expect } from '@playwright/test';
import { parsePrice } from '../support/price';

// Matches the shape of `CartPage.stableTotal()` (`tests/e2e/pages/cart-page.ts:52`):
// wait for a value to differ from a known-stale reading, then require it to
// read the same across several consecutive checks before trusting it.
// Polled faster than the cart total because issue #19's comments measured
// the listing's stale window at 321-702ms, an order of magnitude below the
// cart's recalculation window.
const STABLE_READS_REQUIRED = 3;
const POLL_INTERVAL_MS = 25;
const MAX_POLL_ATTEMPTS = 200; // ~5s ceiling

// `settleAfterCategoryClick()` waits this long before its first read.
// Category filtering has no synchronous DOM signal equivalent to `#next2`'s
// `value` attribute (verified live: that attribute never moves on a
// category click, only on `Next`/`Previous` — ASSUMPTIONS.md), so this is a
// bounded sleep, not a proof, and is used nowhere a false "settled" reading
// would certify a defect as fixed (`openCategory()` settles on ANY window,
// issue #25 E11 — the caller's own assertion is what can still fail, and
// correctly so, if this fires early). See ASSUMPTIONS.md for the margin
// this constant is asserting over the documented 321-702ms window.
const STALE_WINDOW_CLEAR_MS = 1_000;

// `clickPrevious()`'s bound while waiting for `#next2`'s `value` attribute
// to demonstrably change (or demonstrably not) after a click — a live
// signal, not a sleep, so this only needs to be generous, not exact.
const NEXT_VALUE_SETTLE_TIMEOUT_MS = 5_000;

/**
 * The category sidebar, the product grid, and pagination — all on
 * whichever page currently renders them (home, unfiltered or
 * category-filtered; both share the same markup). Split out from
 * `HomePage` because this surface has a synchronisation problem of its
 * own: after a category click or `Next`, the OLD window stays rendered for
 * 321-702ms before flipping in one step (stale, not empty — issue #19
 * comments), which `HomePage`'s nav/modal chrome never has to deal with.
 *
 * demoblaze reuses `id="article"` across every product card and `id="itemc"`
 * across every category link (WEB-006), so both are addressed by their
 * visible text rather than id (SPEC.md "Selector strategy"). `#next2` is
 * not one of those duplicated ids — there is exactly one `Next` control —
 * so it is used directly, per SPEC.md: "ids are used only where verified
 * unique".
 */
export class ListingPage {
  constructor(private readonly page: Page) {}

  private get cardTitles(): Locator {
    return this.page.locator('.card h4.card-title a');
  }

  /**
   * The category sidebar's links, excluding its "CATEGORIES" heading
   * (which shares the same `.list-group-item` class as the links but no
   * distinguishing role of its own). Scoped to the one `.list-group`
   * container on the page rather than to `#itemc`, so this reads around
   * the duplicated id (WEB-006) instead of keying on it.
   */
  private get categoryLinks(): Locator {
    return this.page.locator('.list-group').getByRole('link').filter({ hasNotText: 'CATEGORIES' });
  }

  /**
   * Cards are injected by client-side JS after the page's `load` event, so
   * a read immediately after navigation can race an empty grid — the same
   * shape of problem `ProductPage.waitUntilLoaded()` solves for the detail
   * page. Call this once after landing on a listing, before its first read.
   */
  async waitUntilLoaded(): Promise<void> {
    await this.cardTitles.first().waitFor({ state: 'visible' });
  }

  private cardFor(productName: string): Locator {
    return this.page
      .locator('.card')
      .filter({ has: this.page.getByRole('link', { name: productName, exact: true }) });
  }

  /**
   * `#next2` is not one of demoblaze's duplicated ids (WEB-006) — there is
   * exactly one `Next` control — so it is addressed directly (SPEC.md:
   * "ids are used only where verified unique"), through this getter rather
   * than inline, matching `cardTitles`/`categoryLinks` above.
   */
  private get nextControl(): Locator {
    return this.page.locator('#next2');
  }

  private get previousControl(): Locator {
    return this.page.locator('#prev2');
  }

  /**
   * The category links' visible text, read from the DOM rather than
   * hardcoded, so a fourth category added later is picked up automatically
   * (issue #19).
   */
  async categories(): Promise<string[]> {
    const texts = await this.categoryLinks.allTextContents();
    return texts.map((text) => text.trim());
  }

  /** The product names in the current page window, in DOM order. */
  async productNames(): Promise<string[]> {
    const names = await this.cardTitles.allTextContents();
    return names.map((name) => name.trim());
  }

  /**
   * A card's price, parsed through the same `parsePrice()` helper as
   * `ProductPage.priceValue()`. The card reads "$360", the detail page
   * reads "$360 *includes tax"; going through one shared parser rather than
   * two copies is what makes comparing them by parsed amount (TC-15, issue
   * #17) meaningful instead of coincidental.
   */
  async cardPrice(productName: string): Promise<number> {
    const text = (await this.cardFor(productName).locator('h5').textContent()) ?? '';
    return parsePrice(text, 'listing card');
  }

  /**
   * The `prod.html?idp_=N` target behind a card's title link. TC-15 (issue
   * #20) opens this in a second page rather than navigating the current
   * one away from its page window — keeping that check linear in the
   * number of products, instead of the re-pagination an O(n^2) walk would
   * otherwise need, and without relying on browser Back, which WEB-014
   * (TC-18) shows does not return to a filtered or paginated window.
   */
  async hrefFor(productName: string): Promise<string> {
    const href = await this.cardFor(productName).locator('h4.card-title a').getAttribute('href');
    if (!href) {
      throw new Error(`No href found for product "${productName}"`);
    }
    return href;
  }

  /** Whether a further page window is offered ahead of the current one. */
  async hasNextPage(): Promise<boolean> {
    return this.nextControl.isVisible();
  }

  /** Whether a `Previous` control is offered on the current page window. */
  async isPreviousOffered(): Promise<boolean> {
    return this.previousControl.isVisible();
  }

  /**
   * Advances to the next page window and returns it once it has settled.
   * `Next` only, deliberately — this page object has no general
   * `previousPage` for walking a listing backwards, because `Previous`
   * never returns to the prior page: it corrupts the window by shifting it
   * forward by one product instead (`WEB-011`,
   * `docs/adr/0001-pagination-oracle.md`). Enumerating a listing is
   * therefore forward-only. `clickPrevious()` below exists only for the
   * case that tests `Previous` itself, not for walking.
   */
  async nextPage(): Promise<string[]> {
    const before = await this.productNames();
    await this.nextControl.click();
    return this.waitForChange(before);
  }

  /**
   * Clicks `Previous` and returns the window once it has genuinely
   * settled. Exists solely for TC-11 (`WEB-011`, issue #25 E2/E8).
   *
   * A fixed sleep cannot prove "no change" here, only assume it lasted
   * longer than whatever the stale window turns out to be on the machine
   * this happens to run on — which is the exact failure mode this method
   * replaces. `#next2`'s `value` attribute is a live signal instead: it
   * flips in lockstep with the corrupted window (`docs/defects.md`
   * WEB-011, confirmed live — ASSUMPTIONS.md), so waiting for it to
   * demonstrably change, or demonstrably not within a generous bound,
   * proves the outcome rather than assuming a margin covered it.
   */
  async clickPrevious(): Promise<string[]> {
    const before = (await this.nextControl.getAttribute('value')) ?? '';
    await this.previousControl.click();
    await expect(this.nextControl)
      .not.toHaveAttribute('value', before, { timeout: NEXT_VALUE_SETTLE_TIMEOUT_MS })
      .catch(() => {
        // Timed out without the attribute moving: proof, not an assumption,
        // that this click did not navigate the listing.
      });
    return this.pollUntilStable(
      () => true,
      (lastNames) => `Listing did not settle after Previous (last read: ${JSON.stringify(lastNames)})`,
    );
  }

  /**
   * Opens a product from the current listing window's card link and waits
   * for the detail page's navigation to commit before returning (issue #25
   * E9) — moved here from `HomePage`, which had no notion of the page it
   * was navigating to and left `goBack()` racing this click's dispatch
   * rather than its commit (E3; TC-18, `WEB-014`).
   */
  async openProduct(productName: string): Promise<void> {
    await this.page.getByRole('link', { name: productName, exact: true }).click();
    await this.page.waitForURL(/prod\.html/);
  }

  /**
   * Clicks a category link and returns its settled product-name window, as
   * one operation rather than three calls spread across two page objects
   * (issue #19 review): click, then wait for the window to settle.
   * Settles on ANY window rather than requiring a change from before the
   * click (issue #25 E11): if a category filter stopped narrowing the
   * listing — the fault TC-13 exists to catch — that is for the caller's
   * own assertion to catch with a readable diff, not for this method to
   * die on with an opaque "did not settle on a new window" timeout.
   */
  async openCategory(category: string): Promise<string[]> {
    await this.page.getByRole('link', { name: category, exact: true }).click();
    return this.settleAfterCategoryClick();
  }

  /**
   * Polls the listing's product-name window until `isAcceptable` accepts
   * it and it then reads the same across `STABLE_READS_REQUIRED`
   * consecutive checks, then returns it. A category click (and `Next`)
   * leaves the OLD window rendered for 321-702ms before flipping, but the
   * flip itself is not instantaneous for every card: reading on the first
   * observed difference risks returning a partially-rendered grid.
   * "Acceptable, and has stopped moving" is the sound synchronisation
   * primitive here, and `waitForChange` and `clickPrevious`/
   * `settleAfterCategoryClick` are all built on it — they differ only in
   * what "acceptable" means and in how they decide the window has
   * genuinely stopped moving — so the poll itself lives once (issue #19 /
   * issue #20 review) rather than being hand-rolled per case, the same
   * idiom as
   * `CartPage.stableTotal()` (`tests/e2e/pages/cart-page.ts:52`).
   */
  private async pollUntilStable(
    isAcceptable: (window: string[]) => boolean,
    describeTimeout: (lastWindow: string[]) => string,
  ): Promise<string[]> {
    let lastKey: string | null = null;
    let lastNames: string[] = [];
    let stableReads = 0;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const currentNames = await this.productNames();
      const currentKey = JSON.stringify(currentNames);

      if (isAcceptable(currentNames) && currentKey === lastKey) {
        stableReads += 1;
        if (stableReads >= STABLE_READS_REQUIRED) {
          return currentNames;
        }
      } else {
        stableReads = 0;
      }

      lastKey = currentKey;
      lastNames = currentNames;
      await this.page.waitForTimeout(POLL_INTERVAL_MS);
    }

    throw new Error(describeTimeout(lastNames));
  }

  /**
   * Waits out the 321-702ms window during which the OLD product-name
   * window stays rendered after a category click (module docstring above),
   * then polls until the window has stopped moving, and returns whatever
   * window that turns out to be — changed from before the click, or not
   * (issue #25 E11): if a category filter stopped narrowing the listing —
   * the fault TC-13 exists to catch — that is for the caller's own
   * assertion to catch with a readable diff, not for this method to die on
   * with an opaque timeout.
   *
   * Unlike `clickPrevious()`, this has no equivalent to `#next2`'s `value`
   * attribute to wait on — verified live that it does not move on a
   * category click (ASSUMPTIONS.md) — so this is a bounded sleep rather
   * than a proof. That is acceptable here specifically because nothing
   * this method returns is itself asserted as correct; `openCategory()`
   * settling on any window is what makes reading too early a caller-side
   * (readable) failure rather than a page-object-side false pass.
   */
  private async settleAfterCategoryClick(): Promise<string[]> {
    await this.page.waitForTimeout(STALE_WINDOW_CLEAR_MS);
    return this.pollUntilStable(
      () => true,
      (lastNames) => `Listing did not settle after the click (last read: ${JSON.stringify(lastNames)})`,
    );
  }

  /**
   * Polls until the listing's product-name window has both changed from
   * `previousWindow` and settled, then returns it. Used by `nextPage()`,
   * where a further page window is only ever offered when there genuinely
   * is one to move to, so requiring the change is sound there (unlike
   * `openCategory()`/`clickPrevious()`, issue #25 E11, which settle on any
   * window instead).
   */
  async waitForChange(previousWindow: string[]): Promise<string[]> {
    const initialKey = JSON.stringify(previousWindow);
    return this.pollUntilStable(
      (window) => JSON.stringify(window) !== initialKey,
      (lastNames) => `Listing did not settle on a new window (last read: ${JSON.stringify(lastNames)})`,
    );
  }
}
