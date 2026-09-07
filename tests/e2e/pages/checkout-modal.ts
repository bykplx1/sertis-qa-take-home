import { type Locator, type Page, expect } from '@playwright/test';
import { OrderConfirmation } from './order-confirmation';

export type OrderDetails = {
  name?: string;
  country?: string;
  city?: string;
  card?: string;
  month?: string;
  year?: string;
};

/**
 * The "Place order" modal. Its fields carry verified-unique ids
 * (`#name`, `#card`, ...) so ids are used directly here per SPEC.md
 * ("Selector strategy": "ids are used only where verified unique") —
 * note the modal's own "Total:" label incorrectly shares `for="name"`
 * with the Name field, which would make `getByLabel` ambiguous, so the
 * field ids are the more reliable seam here.
 *
 * Every field is optional so callers (including the unhappy-path checkout
 * tests built on this page object) can submit a form missing exactly the
 * field under test.
 */
export class CheckoutModal {
  constructor(private readonly page: Page) {}

  private get modal(): Locator {
    return this.page.locator('#orderModal');
  }

  async waitUntilOpen(): Promise<void> {
    await expect(this.modal).toBeVisible();
  }

  async fill(details: OrderDetails): Promise<void> {
    if (details.name !== undefined) await this.modal.locator('#name').fill(details.name);
    if (details.country !== undefined) await this.modal.locator('#country').fill(details.country);
    if (details.city !== undefined) await this.modal.locator('#city').fill(details.city);
    if (details.card !== undefined) await this.modal.locator('#card').fill(details.card);
    if (details.month !== undefined) await this.modal.locator('#month').fill(details.month);
    if (details.year !== undefined) await this.modal.locator('#year').fill(details.year);
  }

  async submit(): Promise<void> {
    await this.modal.getByRole('button', { name: 'Purchase', exact: true }).click();
  }

  /** The purchase confirmation, asserted as a DOM element (see `OrderConfirmation`). */
  confirmation(): OrderConfirmation {
    return new OrderConfirmation(this.page);
  }
}
