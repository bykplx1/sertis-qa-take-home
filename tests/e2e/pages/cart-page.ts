import { type Locator, type Page, expect } from '@playwright/test';

const STABLE_READS_REQUIRED = 3;
const POLL_INTERVAL_MS = 250;
const MAX_POLL_ATTEMPTS = 60; // ~15s ceiling

/**
 * The cart page. Cart rows carry no identifying attribute (SPEC.md
 * "Selector strategy"), so rows are addressed by their visible product
 * name text.
 *
 * Navigation goes through `page.goto('/cart.html')` rather than clicking
 * the nav "Cart" link: after a purchase, the order modal is never
 * dismissed at all (`WEB-013`) — `#orderModal` stays `class="modal fade
 * show"`, `display: block`, form still populated — and Playwright names
 * the interceptor as `<input id="name">` inside that still-open modal's
 * subtree, not its backdrop. A direct navigation sidesteps it entirely.
 * This workaround is correct and must stay; `WEB-013`'s own case (TC-17,
 * `tests/e2e/browse.spec.ts`) is what deliberately clicks the nav link
 * instead, as the control under test.
 */
export class CartPage {
  constructor(private readonly page: Page) {}

  /**
   * Navigates to the cart page and waits for its `/viewcart` fetch to
   * resolve — the request cart.js issues unconditionally on document ready,
   * whether or not the cart holds items — before returning. Registered
   * before the `goto` so a response that lands early is not missed (the
   * same before-the-triggering-action shape as the dialog handlers in
   * `home-page.ts`/`product-page.ts`). This is what makes `assertEmpty()`
   * below honest: by the time `open()` returns, an empty cart's zero rows
   * is its true, settled state, not a still-loading page read too early.
   */
  async open(): Promise<void> {
    const viewCartLoaded = this.page.waitForResponse(
      (response) => response.url().includes('/viewcart') && response.request().method() === 'POST',
    );
    await this.page.goto('/cart.html');
    await viewCartLoaded;
  }

  rowFor(productName: string): Locator {
    return this.page.locator('#tbodyid tr', { hasText: productName });
  }

  async waitForItem(productName: string, timeout = 15_000): Promise<void> {
    await expect(this.rowFor(productName)).toBeVisible({ timeout });
  }

  async itemCount(): Promise<number> {
    return this.page.locator('#tbodyid tr').count();
  }

  /**
   * Asserts the cart holds no items. Rows render asynchronously after the
   * cart's fetch resolves (`:49-56` below) — a bare `count() === 0` read
   * right after `open()` used to be a no-op, since a still-loading cart
   * also reads zero rows at that instant. `open()` now waits for the
   * `/viewcart` response itself before returning, so this is a genuine
   * wait rather than a point-in-time read: an empty cart's zero rows is
   * already settled by the time this runs, and a non-empty cart's rows are
   * already rendering, so this retries until they arrive — correctly
   * failing — or the timeout elapses.
   */
  async assertEmpty(timeout = 15_000): Promise<void> {
    await expect(this.page.locator('#tbodyid tr')).toHaveCount(0, { timeout });
  }

  async removeItem(productName: string): Promise<void> {
    await this.rowFor(productName).getByRole('link', { name: 'Delete', exact: true }).click();
  }

  /**
   * The cart page issues one request to fetch the cart and then one
   * request per line item, recomputing the displayed total as each
   * resolves (SPEC.md "Cart total stability", WEB-008) — reading it once
   * right after navigation risks catching it mid-recalculation. This polls
   * until the displayed value is a parseable number that reads the same
   * across several consecutive checks before returning it.
   */
  async stableTotal(): Promise<number> {
    const totalLocator = this.page.locator('#totalp');
    let previous: string | null = null;
    let stableReads = 0;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const current = ((await totalLocator.textContent()) ?? '').trim();
      const isNumeric = current !== '' && !Number.isNaN(Number(current));

      if (isNumeric && current === previous) {
        stableReads += 1;
        if (stableReads >= STABLE_READS_REQUIRED) {
          return Number(current);
        }
      } else {
        stableReads = 0;
      }

      previous = current;
      await this.page.waitForTimeout(POLL_INTERVAL_MS);
    }

    throw new Error(`Cart total did not stabilise (last read: "${previous ?? ''}")`);
  }

  async placeOrder(): Promise<void> {
    await this.page.getByRole('button', { name: 'Place Order', exact: true }).click();
  }
}
