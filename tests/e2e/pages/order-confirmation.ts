import { type Locator, type Page, expect } from '@playwright/test';

export type OrderConfirmationDetails = {
  /** Client-side generated; format is asserted, the value itself is not (SPEC.md "Oracles"). */
  orderId: string;
  amount: number;
};

/**
 * Purchase confirmation is a SweetAlert DOM component, not a native
 * browser dialog, and must be asserted as an element — deliberately a
 * different mechanism from the native add-to-cart dialog (SPEC.md "Dialog
 * handling": "These two must not be handled by the same mechanism").
 * There is no server-side order (SPEC.md); this confirmation is the only
 * oracle for order completion.
 */
export class OrderConfirmation {
  constructor(private readonly page: Page) {}

  private get root(): Locator {
    return this.page.locator('.sweet-alert');
  }

  async waitUntilVisible(timeout = 15_000): Promise<void> {
    await expect(this.root).toBeVisible({ timeout });
  }

  async details(): Promise<OrderConfirmationDetails> {
    const text = ((await this.root.locator('p.lead').textContent()) ?? '').replace(/\s+/g, ' ');
    const idMatch = text.match(/Id:\s*(\d+)/);
    const amountMatch = text.match(/Amount:\s*([\d,.]+)\s*USD/);
    if (!idMatch || !amountMatch) {
      throw new Error(`Could not parse order confirmation details from "${text}"`);
    }
    return {
      orderId: idMatch[1],
      amount: Number(amountMatch[1].replace(/,/g, '')),
    };
  }

  async close(): Promise<void> {
    await this.root.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(this.root).toBeHidden();
  }
}
