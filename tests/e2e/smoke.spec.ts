import { test, expect } from '@playwright/test';

// Proves the @e2e project's wiring end to end: browser launches, reaches
// demoblaze, and can assert on the rendered page.
test('storefront home page loads and shows the nav brand @e2e', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'PRODUCT STORE' })).toBeVisible();
});
