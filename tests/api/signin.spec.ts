import { test, expect } from '@playwright/test';

// @api coverage of POST /signin, written from api-main/swagger.yaml's documented
// request/response contract for the endpoint (not from server.js's behaviour).
// Where api-main violates its own spec, the test below fails by design and
// carries the defect id from docs/defects.md so the red output is
// self-explanatory. See CONTEXT.md ("api", "defect") and SPEC.md
// ("Assertion basis").
//
// Known users, from api-main/server.js's in-memory fixture data (not
// modified here — read only to compose valid/invalid request bodies):
const USER_001 = {
  id: '001',
  phone_no: '020011893',
  otp: '123456',
  first_name: 'John',
  last_name: 'Doe',
  permission: 'admin',
};
const USER_002 = {
  id: '002',
  phone_no: '020011894',
  otp: '654321',
  first_name: 'Jane',
  last_name: 'Smith',
  permission: 'user',
};

test.describe('POST /signin', () => {
  test('valid phone_no and otp sign in and return the matching user @api', async ({ request }) => {
    const response = await request.post('/signin', {
      data: { phone_no: USER_001.phone_no, otp: USER_001.otp },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('Pass');
    expect(body.message).toBe('Sign in success');
    expect(body.data).toEqual({
      id: USER_001.id,
      first_name: USER_001.first_name,
      last_name: USER_001.last_name,
      permission: USER_001.permission,
    });
    // The signed-in user's own otp/phone_no must not be echoed back.
    expect(body.data.otp).toBeUndefined();
    expect(body.data.phone_no).toBeUndefined();
  });

  test('a second valid user signs in and returns their own identity, not the first user\'s @api', async ({
    request,
  }) => {
    const response = await request.post('/signin', {
      data: { phone_no: USER_002.phone_no, otp: USER_002.otp },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({
      id: USER_002.id,
      first_name: USER_002.first_name,
      last_name: USER_002.last_name,
      permission: USER_002.permission,
    });
  });

  test('a wrong otp for a known phone_no is rejected @api', async ({ request }) => {
    const response = await request.post('/signin', {
      data: { phone_no: USER_001.phone_no, otp: 'not-the-real-otp' },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.status).toBe('Not found');
    expect(body.data).toEqual({});
    expect(body.message).toBe('User not found');
  });

  test('one user\'s otp presented with another user\'s phone_no is rejected @api', async ({ request }) => {
    // Neither credential is missing and both belong to real users, but they
    // don't belong to the same account — this is a mismatch, not a partial
    // request, so it is unaffected by the OR/AND guard defect (API-001) and
    // is expected to match the documented 404 behaviour exactly.
    const response = await request.post('/signin', {
      data: { phone_no: USER_001.phone_no, otp: USER_002.otp },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.status).toBe('Not found');
    expect(body.data).toEqual({});
    expect(body.message).toBe('User not found');
  });

  test('a request missing otp produces the documented internal-error response [API-001] @api', async ({
    request,
  }) => {
    // swagger.yaml documents /signin's request body as requiring both
    // phone_no and otp, and describes the 500 response as "Internal Server
    // Error" — implying an incomplete-credentials request should hit that
    // path. api-main/server.js:59 guards with `"phone_no" in body ||
    // "otp" in body` (OR instead of AND), so a phone_no-only body is let
    // through to the match loop instead of falling to the else branch,
    // and returns 404 "User not found" rather than the documented 500.
    // This test asserts the documented behaviour and fails by design
    // against that defect (docs/defects.md API-001).
    const response = await request.post('/signin', {
      data: { phone_no: USER_001.phone_no },
    });

    expect(response.status()).toBe(500);
    const body = await response.json();
    expect(body.status).toBe('Fail');
    expect(body.data).toEqual({});
    expect(body.message).toBe('Internal Server Error');
  });

  test('a request missing phone_no produces the documented internal-error response [API-001] @api', async ({
    request,
  }) => {
    // Same defect as above (docs/defects.md API-001), the other missing
    // field: an otp-only body should also fall through to the 500 else
    // branch per swagger.yaml, but the OR guard at server.js:59 lets it
    // through to the match loop and it returns 404 instead.
    const response = await request.post('/signin', {
      data: { otp: USER_001.otp },
    });

    expect(response.status()).toBe(500);
    const body = await response.json();
    expect(body.status).toBe('Fail');
    expect(body.data).toEqual({});
    expect(body.message).toBe('Internal Server Error');
  });

  test('an empty request body produces the documented internal-error response @api', async ({ request }) => {
    // Neither key is present at all, so both arms of the OR guard are
    // false regardless of the OR/AND defect (API-001) — this case is
    // unaffected by it and is expected to match swagger.yaml exactly.
    const response = await request.post('/signin', { data: {} });

    expect(response.status()).toBe(500);
    const body = await response.json();
    expect(body.status).toBe('Fail');
    expect(body.data).toEqual({});
    expect(body.message).toBe('Internal Server Error');
  });

  test('the 200 response\'s field types match the documented schema, including status_code [API-002] @api', async ({
    request,
  }) => {
    // swagger.yaml (:125, and likewise :157/:177 for the 404/500 branches)
    // declares status_code as type: string, with examples quoted as
    // strings ("200", "404", "500"). api-main/server.js:64 assigns
    // status_code from the numeric literal 200 and serialises it as a
    // JSON number. This test asserts the documented string type and fails
    // by design against that defect (docs/defects.md API-002); every other
    // field in the schema is checked as documented and expected to pass.
    const response = await request.post('/signin', {
      data: { phone_no: USER_001.phone_no, otp: USER_001.otp },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(typeof body.status_code).toBe('string'); // fails by design: API-002
    expect(typeof body.status).toBe('string');
    expect(typeof body.message).toBe('string');
    expect(typeof body.data).toBe('object');
    expect(typeof body.data.id).toBe('string');
    expect(typeof body.data.first_name).toBe('string');
    expect(typeof body.data.last_name).toBe('string');
    expect(typeof body.data.permission).toBe('string');
  });
});
