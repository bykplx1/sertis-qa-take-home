import { test, expect } from '@playwright/test';

// Proves the @api project's wiring end to end: the local api-main starts,
// is reachable over HTTP at the configured base url, and returns JSON.
test('GET /user/ids returns the known user ids @api', async ({ request }) => {
  const response = await request.get('/user/ids');

  expect(response.status()).toBe(200);
  const ids = await response.json();
  expect(Array.isArray(ids)).toBe(true);
  expect(ids).toEqual(expect.arrayContaining(['001', '002']));
});
