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

  /** Whether a further page window is offered ahead of the current one. */
  async hasNextPage(): Promise<boolean> {
    return this.page.locator('#next2').isVisible();
  }

  /**
   * Advances to the next page window and returns it once it has settled.
   * `Next` only, deliberately — this page object has no `previousPage`,
   * because `Previous` never returns to the prior page: it corrupts the
   * window by shifting it forward by one product instead (`WEB-011`,
   * `docs/adr/0001-pagination-oracle.md`). Enumerating a listing is
   * therefore forward-only.
   */
  async nextPage(): Promise<string[]> {
    const before = await this.productNames();
    await this.page.locator('#next2').click();
    return this.waitForChange(before);
  }

  /**
   * Clicks a category link and returns its settled product-name window, as
   * one operation rather than three calls spread across two page objects
   * (issue #19 review): capture the current window, click, and wait for
   * the new one to settle.
   */
  async openCategory(category: string): Promise<string[]> {
    const before = await this.productNames();
    await this.page.getByRole('link', { name: category, exact: true }).click();
    return this.waitForChange(before);
  }

  /**
   * Polls until the listing's product-name window has both changed from
   * `previousWindow` and settled — read the same across
   * `STABLE_READS_REQUIRED` consecutive checks — then returns it. A
   * category click (and `Next`) leaves the OLD window rendered for
   * 321-702ms before flipping, but the flip itself is not instantaneous
   * for every card: reading on the first observed difference risks
   * returning a partially-rendered grid. "The listing's product-name
   * window is no longer what it was, and has stopped moving" is the sound
   * synchronisation primitive here, and it is also TC-13's own assertion,
   * so it is exposed once rather than hand-rolled in every spec that needs
   * it (issue #19) — the same idiom as `CartPage.stableTotal()`
   * (`tests/e2e/pages/cart-page.ts:52`).
   */
  /**
   * Polls until the listing's product-name window reads the same across
   * `STABLE_READS_REQUIRED` consecutive checks, then returns it — the
   * "stopped moving" half of `waitForChange`, exposed on its own for a
   * case that needs to confirm a window did NOT change after an action
   * (TC-11, issue #20: `Previous` on the first page should offer no
   * navigation) rather than one that requires it to.
   */
  async waitUntilStable(): Promise<string[]> {
    let lastKey: string | null = null;
    let lastNames: string[] = [];
    let stableReads = 0;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const currentNames = await this.productNames();
      const currentKey = JSON.stringify(currentNames);

      if (currentKey === lastKey) {
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

    throw new Error(`Listing did not settle on a stable window (last read: ${JSON.stringify(lastNames)})`);
  }

  async waitForChange(previousWindow: string[]): Promise<string[]> {
    const initialKey = JSON.stringify(previousWindow);
    let lastNames: string[] = [];
    let lastKey: string | null = null;
    let stableReads = 0;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const currentNames = await this.productNames();
      const currentKey = JSON.stringify(currentNames);
      const hasChanged = currentKey !== initialKey;

      if (hasChanged && currentKey === lastKey) {
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

    throw new Error(`Listing did not settle on a new window (last read: ${JSON.stringify(lastNames)})`);
  }
}
