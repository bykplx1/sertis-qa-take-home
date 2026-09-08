/**
 * Product, category and order-form data shared across specs that drive the
 * same purchase journey. Previously copied verbatim into
 * `purchase-journey.spec.ts`, `checkout-validation.spec.ts` and
 * `browse.spec.ts`, so changing the test card, or the product when
 * demoblaze retires "Samsung galaxy s6", was a multi-file edit
 * (issue #26 E7).
 */

/** A single, unambiguous product under this category with a stable, low price. */
export const CATEGORY = 'Phones' as const;
export const PRODUCT_NAME = 'Samsung galaxy s6';

/** A valid-looking order form submission — demoblaze performs no real card validation. */
export const VALID_ORDER_DETAILS = {
  name: 'QA Automation',
  country: 'Thailand',
  city: 'Bangkok',
  card: '4111111111111111',
  month: '5',
  year: '2030',
};
