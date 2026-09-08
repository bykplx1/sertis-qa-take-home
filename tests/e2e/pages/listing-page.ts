import { type Locator, type Page } from '@playwright/test';

// Matches the ~25ms sampling rate issue #19's comments measured the
// stale-listing window at (321-702ms across five runs); the ceiling is
// comfortably past the slowest of those measurements.
const POLL_INTERVAL_MS = 25;
const MAX_POLL_ATTEMPTS = 200; // ~5s ceiling

/**
 * The product grid and its pagination, on whichever page currently renders
 * them (home, unfiltered or category-filtered — both share the same
 * markup). Split out from `HomePage` because the grid has a
 * synchronisation problem of its own: after a category click or `Next`,
 * the OLD window stays rendered for 321-702ms before flipping in one step
 * (stale, not empty — issue #19 comments), which `HomePage`'s nav/modal
 * chrome never has to deal with.
 *
 * demoblaze reuses `id="article"` across every product card (WEB-006), so
 * cards are addressed by their visible name text rather than id (SPEC.md
 * "Selector strategy").
 */
export class ListingPage {
  constructor(private readonly page: Page) {}

  private get cardTitles(): Locator {
    return this.page.locator('.card h4.card-title a');
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

  /** The product names in the current page window, in DOM order. */
  async productNames(): Promise<string[]> {
    const names = await this.cardTitles.allTextContents();
    return names.map((name) => name.trim());
  }

  /**
   * A card's price, parsed out the same way as `ProductPage.priceValue()`.
   * The card reads "$360", the detail page reads "$360 *includes tax";
   * comparing parsed amounts rather than raw strings is what TC-15 (issue
   * #17) needs to hold across both renderings.
   */
  async cardPrice(productName: string): Promise<number> {
    const text = (await this.cardFor(productName).locator('h5').textContent()) ?? '';
    const match = text.match(/\$([\d,.]+)/);
    if (!match) {
      throw new Error(`Could not parse a price out of listing card text "${text}"`);
    }
    return Number(match[1].replace(/,/g, ''));
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
   * Polls until the listing's product-name window differs from `previous`,
   * then returns the new window. A category click (and `Next`) leaves the
   * OLD window rendered for 321-702ms before flipping in one step (issue
   * #19 comments), so waiting on card count alone is unsound: a category
   * with the same product count as the current view is indistinguishable
   * from the stale state. "The listing is no longer what it was" is the
   * only sound synchronisation primitive available, and it is also TC-13's
   * own assertion, so it is exposed once here rather than hand-rolled in
   * every spec that needs it — the idiom `CartPage.stableTotal()`
   * (`tests/e2e/pages/cart-page.ts:52`) already follows for an analogous
   * race.
   */
  async waitForChange(previous: string[]): Promise<string[]> {
    const previousKey = JSON.stringify(previous);

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const current = await this.productNames();
      if (JSON.stringify(current) !== previousKey) {
        return current;
      }
      await this.page.waitForTimeout(POLL_INTERVAL_MS);
    }

    throw new Error(`Listing did not change from its previous window: ${previousKey}`);
  }
}
