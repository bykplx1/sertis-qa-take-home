import { test, expect } from '@playwright/test';

// @api coverage of the two user endpoints (GET /user/ids, GET /user/:id),
// asserted against api-main/swagger.yaml rather than against what the
// server happens to do (see CLAUDE.md, SPEC.md "Assertion basis").
//
// api-main's own fixture data (server.js) is fixed and read-only: two known
// users, ids "001" and "002". A truly unknown id is one outside that set.
const KNOWN_USER_IDS = ['001', '002'];
const UNKNOWN_USER_ID = '999';

test.describe('GET /user/ids', () => {
  test('returns every known user id @api', async ({ request }) => {
    const response = await request.get('/user/ids');

    expect(response.status()).toBe(200);
    const ids = await response.json();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.sort()).toEqual([...KNOWN_USER_IDS].sort());
  });
});

test.describe('GET /user/:id', () => {
  test('known id matches the documented schema and field types @api', async ({ request }) => {
    const response = await request.get(`/user/${KNOWN_USER_IDS[0]}`);

    expect(response.status()).toBe(200);
    const body = await response.json();

    // swagger.yaml's /user/{id} 200 schema declares all five properties as
    // strings. This checks the contract's shape, not any particular value.
    expect(typeof body.first_name).toBe('string');
    expect(typeof body.last_name).toBe('string');
    expect(typeof body.permission).toBe('string');
    expect(typeof body.phone_no).toBe('string');
    expect(typeof body.otp).toBe('string');
  });

  test('unknown id produces the documented error shape and status code @api', async ({ request }) => {
    const response = await request.get(`/user/${UNKNOWN_USER_ID}`);

    expect(response.status()).toBe(400);
    const body = await response.json();

    // swagger.yaml's /user/{id} 400 schema documents status_code as a
    // string (example "400"), unlike /signin's status_code (API-002).
    expect(typeof body.status_code).toBe('string');
    expect(body.status_code).toBe('400');
    expect(typeof body.message).toBe('string');
  });

  // API-003 (docs/defects.md): swagger.yaml documents no authentication
  // requirement for /user/{id} at all, yet its 200 schema includes phone_no
  // and otp — a live one-time password handed to any unauthenticated
  // caller who knows or enumerates an id via GET /user/ids. The intended
  // behaviour is that a resource carrying a live OTP is not retrievable
  // without authentication; server.js:41-51 has no auth middleware and
  // sends the record unfiltered, so this fails by design.
  test('API-003: does not return otp and phone_no to an unauthenticated caller @api', async ({ request }) => {
    const response = await request.get(`/user/${KNOWN_USER_IDS[0]}`);
    const body = await response.json();

    expect(body.otp).toBeUndefined();
    expect(body.phone_no).toBeUndefined();
  });
});
