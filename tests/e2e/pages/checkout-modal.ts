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

  /** Whether the modal is currently displayed (TC-17, WEB-013: it should not be, after a purchase is acknowledged). */
  async isOpen(): Promise<boolean> {
    return this.modal.isVisible();
  }

  /** The order form's current field values, used to confirm it was cleared (TC-17, WEB-013: it is not). */
  async fieldValues(): Promise<Required<OrderDetails>> {
    return {
      name: await this.modal.locator('#name').inputValue(),
      country: await this.modal.locator('#country').inputValue(),
      city: await this.modal.locator('#city').inputValue(),
      card: await this.modal.locator('#card').inputValue(),
      month: await this.modal.locator('#month').inputValue(),
      year: await this.modal.locator('#year').inputValue(),
    };
  }

  async fill(details: OrderDetails): Promise<void> {
    if (details.name !== undefined) await this.modal.locator('#name').fill(details.name);
    if (details.country !== undefined) await this.modal.locator('#country').fill(details.country);
    if (details.city !== undefined) await this.modal.locator('#city').fill(details.city);
    if (details.card !== undefined) await this.modal.locator('#card').fill(details.card);
    if (details.month !== undefined) await this.modal.locator('#month').fill(details.month);
    if (details.year !== undefined) await this.modal.locator('#year').fill(details.year);
  }

  async submit(options?: { timeout?: number }): Promise<void> {
    await this.modal.getByRole('button', { name: 'Purchase', exact: true }).click(options);
  }

  /**
   * Attempts `submit()` within a bounded timeout and reports whether the
   * click actually landed, instead of letting a click on an unreachable
   * button throw uncaught. Exists for TC-19 (`WEB-013`, issue #26 review
   * item 1): once the order modal genuinely closes (the defect fixed), its
   * `Purchase` button becomes unreachable, and an unconditional `submit()`
   * would still time out on it — the *same* failure as while the defect is
   * present, which defeats `test.fail()`'s purpose of turning red only
   * once the defect is gone. Distinguishing "the click landed" from "the
   * button was unreachable" gives the caller two genuinely different,
   * falsifiable outcomes to assert on.
   */
  async attemptSubmit(timeout = 5_000): Promise<boolean> {
    return this.submit({ timeout }).then(
      () => true,
      () => false,
    );
  }

  /**
   * Submits the order form when rejection is the expected outcome
   * (TC-03/TC-04): demoblaze rejects an incomplete order via a native
   * `alert()`, a different mechanism from the SweetAlert confirmation
   * `submit()` expects on success (SPEC.md "Dialog handling"). The handler
   * is registered before the click that can trigger it, the same
   * before-the-triggering-action shape as `HomePage.signUp()` and
   * `ProductPage.addToCart()` (issue #26 E6 — asserting on this message is
   * the real oracle for rejection; without a registered handler, these
   * tests previously passed only because Playwright auto-dismisses an
   * unhandled dialog, which would look identical against a site that
   * silently swallowed the submit instead). Returns the dialog's message
   * so a caller can assert on it.
   */
  async submitExpectingRejection(): Promise<string> {
    const dialogMessage = this.page.waitForEvent('dialog').then(async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await this.submit();
    return dialogMessage;
  }

  /** The purchase confirmation, asserted as a DOM element (see `OrderConfirmation`). */
  confirmation(): OrderConfirmation {
    return new OrderConfirmation(this.page);
  }
}
