import { type Locator, type Page, expect } from '@playwright/test';

/**
 * The demoblaze chrome present on every page: the nav bar and the sign-up
 * and log-in modals. The category sidebar and the product grid it filters
 * live on `ListingPage` instead (issue #19 review) — they share a
 * synchronisation problem (the stale-window race) that this chrome-only
 * class never has to deal with.
 */
export class HomePage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  /**
   * Signs up a new account. The confirmation is a native browser dialog
   * ("Sign up successful."), so the handler is registered before the click
   * that can trigger it — a handler registered after the click risks the
   * dialog firing first and silently blocking every later action on the
   * page (issue #8 / SPEC.md "Dialog handling").
   */
  async signUp(username: string, password: string): Promise<void> {
    await this.page.getByRole('link', { name: 'Sign up', exact: true }).click();

    const modal = this.page.locator('#signInModal');
    await expect(modal).toBeVisible();
    await modal.locator('#sign-username').fill(username);
    await modal.locator('#sign-password').fill(password);

    const dialogHandled = this.page.waitForEvent('dialog').then(async (dialog) => {
      await dialog.accept();
    });
    await modal.getByRole('button', { name: 'Sign up', exact: true }).click();
    await dialogHandled;

    await expect(modal).toBeHidden();
  }

  /**
   * Logs in with an existing account. Unlike sign-up, a successful log-in
   * does not raise a native dialog — it updates the nav bar in place — so
   * no dialog handler is needed here for the happy path.
   */
  async logIn(username: string, password: string): Promise<void> {
    await this.page.getByRole('link', { name: 'Log in', exact: true }).click();

    const modal = this.page.locator('#logInModal');
    await expect(modal).toBeVisible();
    await modal.locator('#loginusername').fill(username);
    await modal.locator('#loginpassword').fill(password);
    await modal.getByRole('button', { name: 'Log in', exact: true }).click();

    await expect(this.loggedInUserLabel).toHaveText(`Welcome ${username}`);
  }

  get loggedInUserLabel(): Locator {
    return this.page.locator('#nameofuser');
  }

  async openProduct(productName: string): Promise<void> {
    await this.page.getByRole('link', { name: productName, exact: true }).click();
  }
}
