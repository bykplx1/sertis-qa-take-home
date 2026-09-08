import { test as base, expect } from '@playwright/test';
import { HomePage } from './pages/home-page';
import { ProductPage } from './pages/product-page';
import { CartPage } from './pages/cart-page';
import { CheckoutModal } from './pages/checkout-modal';
import { ListingPage } from './pages/listing-page';
import { randomAccount, type Account } from './support/random-account';

/**
 * `@e2e` fixtures: page objects injected into tests so spec files contain
 * no selectors (issue #8 / SPEC.md "E2E architecture"). Reused by the
 * cart-behaviour (#9) and checkout-validation (#10) tickets, which are
 * built on these same page objects rather than duplicating them.
 */
type PurchaseJourneyFixtures = {
  homePage: HomePage;
  productPage: ProductPage;
  cartPage: CartPage;
  checkoutModal: CheckoutModal;
  listingPage: ListingPage;
  /** A fresh, randomised account generated per test (SPEC.md "Test data"). */
  freshAccount: Account;
};

export const test = base.extend<PurchaseJourneyFixtures>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutModal: async ({ page }, use) => {
    await use(new CheckoutModal(page));
  },
  listingPage: async ({ page }, use) => {
    await use(new ListingPage(page));
  },
  freshAccount: async ({}, use) => {
    await use(randomAccount());
  },
});

export { expect };
