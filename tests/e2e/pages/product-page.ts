import { type Locator, type Page } from '@playwright/test';
import { parsePrice } from '../support/price';

/**
 * A single product's detail page. Content is injected into `#tbodyid` by
 * client-side JS after navigation, so callers should wait for it via
 * `waitUntilLoaded()` before reading name/price/description.
 */
export class ProductPage {
  constructor(private readonly page: Page) {}

  async waitUntilLoaded(): Promise<void> {
    await this.page.locator('#tbodyid h2.name').waitFor({ state: 'visible' });
  }

  get name(): Locator {
    return this.page.locator('#tbodyid h2.name');
  }

  get price(): Locator {
    return this.page.locator('#tbodyid h3.price-container');
  }

  get description(): Locator {
    return this.page.locator('#tbodyid .description');
  }

  /** The product's price as a number, parsed out of the "$360 *includes tax" display text. */
  async priceValue(): Promise<number> {
    const text = (await this.price.textContent()) ?? '';
    return parsePrice(text, 'product page');
  }

  /**
   * Adds the product to the cart. This triggers demoblaze's native
   * add-to-cart dialog, which is handled explicitly here rather than left
   * to the caller: the handler is registered before the click so the
   * dialog cannot fire before Playwright is listening and silently stall
   * the test (issue #8 / SPEC.md "Dialog handling"). Returns the dialog's
   * message so a caller can assert on it if it chooses to.
   */
  async addToCart(): Promise<string> {
    const dialogMessage = this.page.waitForEvent('dialog').then(async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await this.page.getByRole('link', { name: 'Add to cart', exact: true }).click();
    return dialogMessage;
  }
}
