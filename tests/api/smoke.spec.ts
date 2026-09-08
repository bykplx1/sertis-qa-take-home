import { test, expect } from '@playwright/test';

// Proves the @api project's wiring end to end: the local api-main starts,
// is reachable over HTTP at the configured base url, and returns JSON.
//
// This used to assert expect.arrayContaining(['001', '002']) on the same
// endpoint user.spec.ts already asserts exact set equality on, in the same
// run — a strictly weaker duplicate that would still pass with 500 extra
// ids. Asserting the content-type instead keeps this a wiring smoke test
// without duplicating user.spec.ts's contract check.
test('GET /user/ids responds over the wired base url with a JSON array @api', async ({ request }) => {
  const response = await request.get('/user/ids');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const ids = await response.json();
  expect(Array.isArray(ids)).toBe(true);
});
