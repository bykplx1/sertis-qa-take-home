import { type Locator, type Page } from '@playwright/test';
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

// `settleAfterClick()` waits this long before its first read, clearing the
// 321-702ms stale window outright rather than relying on 3 x 25ms
// (~75-120ms) of polling, which sits deep inside it (issue #25 E2).
const STALE_WINDOW_CLEAR_MS = 1_000;

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
    return this.page.locator('#next2').isVisible();
  }

  /** Whether a `Previous` control is offered on the current page window. */
  async isPreviousOffered(): Promise<boolean> {
    return this.page.locator('#prev2').isVisible();
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
    await this.page.locator('#next2').click();
    return this.waitForChange(before);
  }

  /**
   * Clicks `Previous` and returns the window once it has genuinely
   * settled. Exists solely for TC-11 (`WEB-011`, issue #25 E2/E8): reading
   * on the first 3 stable polls (~75-120ms) sits deep inside the
   * 321-702ms window the OLD window stays rendered after a click (module
   * docstring above), so a "no change" reading taken that early would be
   * indistinguishable from one taken honestly. `settleAfterClick()` waits
   * the window out first.
   */
  async clickPrevious(): Promise<string[]> {
    await this.page.locator('#prev2').click();
    return this.settleAfterClick();
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
    return this.settleAfterClick();
  }

  /**
   * Polls the listing's product-name window until `isAcceptable` accepts
   * it and it then reads the same across `STABLE_READS_REQUIRED`
   * consecutive checks, then returns it. A category click (and `Next`)
   * leaves the OLD window rendered for 321-702ms before flipping, but the
   * flip itself is not instantaneous for every card: reading on the first
   * observed difference risks returning a partially-rendered grid.
   * "Acceptable, and has stopped moving" is the sound synchronisation
   * primitive here, and `waitForChange` and `settleAfterClick` are both
   * exactly that shape — they differ only in what "acceptable" means —
   * so the poll itself lives once (issue #19 / issue #20 review) rather
   * than being hand-rolled per case, the same idiom as
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
   * window stays rendered after a click (module docstring above), then
   * polls until the window has stopped moving, and returns whatever window
   * that turns out to be — changed from before the click, or not. Used by
   * both `clickPrevious()` and `openCategory()` (issue #25 E2/E11): neither
   * requires a change to have happened before returning, so a caller whose
   * own assertion depends on one (TC-11's WEB-011 case; TC-13's
   * category-narrowing case) fails there, with a readable diff, instead of
   * inside this method with an opaque timeout.
   */
  private async settleAfterClick(): Promise<string[]> {
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
