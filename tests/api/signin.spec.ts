import { test, expect } from '@playwright/test';
import { USER_001, USER_002 } from './support/users';
import { expectSigninEnvelope } from './support/signin-envelope';

// @api coverage of POST /signin, written from api-main/swagger.yaml's documented
// request/response contract for the endpoint (not from server.js's behaviour).
// Where api-main violates its own spec, the test below fails by design and
// carries the defect id from docs/defects.md so the red output is
// self-explanatory. See CONTEXT.md ("api", "defect") and SPEC.md
// ("Assertion basis").
//
// Known users live in ./support/users, and expectSigninEnvelope()
// (./support/signin-envelope) replaces the POST + json() + envelope-assert
// triple that used to repeat in every test below.
//
// A note on the 404 message asserted below ('User not found'): swagger.yaml's
// own 404 example for this endpoint claims 'Sign in success', which
// contradicts its own 'status: "Not found"' field on the same example — that
// contradiction is API-004 (docs/defects.md), a defect in the documentation
// itself. The assertions below follow API-004's intended not-found message,
// not the erroneous example, and are not a case of codifying observed
// behaviour.

test.describe('POST /signin', () => {
  test('valid phone_no and otp sign in and return the matching user @api', async ({ request }) => {
    const body = await expectSigninEnvelope(
      request,
      { phone_no: USER_001.phone_no, otp: USER_001.otp },
      {
        httpStatus: 200,
        status: 'Pass',
        message: 'Sign in success',
        data: {
          id: USER_001.id,
          first_name: USER_001.first_name,
          last_name: USER_001.last_name,
          permission: USER_001.permission,
        },
      },
    );

    // The signed-in user's own otp/phone_no must not be echoed back.
    expect(body.data.otp).toBeUndefined();
    expect(body.data.phone_no).toBeUndefined();
  });

  test('a second valid user signs in and returns their own identity, not the first user\'s @api', async ({
    request,
  }) => {
    await expectSigninEnvelope(
      request,
      { phone_no: USER_002.phone_no, otp: USER_002.otp },
      {
        httpStatus: 200,
        status: 'Pass',
        message: 'Sign in success',
        data: {
          id: USER_002.id,
          first_name: USER_002.first_name,
          last_name: USER_002.last_name,
          permission: USER_002.permission,
        },
      },
    );
  });

  test('a wrong otp for a known phone_no is rejected [API-002] @api', async ({ request }) => {
    const body = await expectSigninEnvelope(
      request,
      { phone_no: USER_001.phone_no, otp: 'not-the-real-otp' },
      { httpStatus: 404, status: 'Not found', message: 'User not found' },
    );

    // API-002 (docs/defects.md): swagger.yaml:157 documents status_code as
    // a string on the 404 response too, not just the 200 branch
    // (swagger.yaml:125). server.js:84 assigns it from the numeric literal
    // 404. Soft so the rest of the envelope (already asserted above) is
    // unaffected by this defect.
    expect.soft(body.status_code).toBe('404');
  });

  test('one user\'s otp presented with another user\'s phone_no is rejected [API-002] @api', async ({
    request,
  }) => {
    // Neither credential is missing and both belong to real users, but they
    // don't belong to the same account — this is a mismatch, not a partial
    // request, so it is unaffected by the OR/AND guard defect (API-001) and
    // is expected to match the documented 404 behaviour exactly.
    const body = await expectSigninEnvelope(
      request,
      { phone_no: USER_001.phone_no, otp: USER_002.otp },
      { httpStatus: 404, status: 'Not found', message: 'User not found' },
    );

    // API-002 (docs/defects.md), same as the wrong-otp case above.
    expect.soft(body.status_code).toBe('404');
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
    await expectSigninEnvelope(
      request,
      { phone_no: USER_001.phone_no },
      { httpStatus: 500, status: 'Fail', message: 'Internal Server Error' },
    );
  });

  test('a request missing phone_no produces the documented internal-error response [API-001] @api', async ({
    request,
  }) => {
    // Same defect as above (docs/defects.md API-001), the other missing
    // field: an otp-only body should also fall through to the 500 else
    // branch per swagger.yaml, but the OR guard at server.js:59 lets it
    // through to the match loop and it returns 404 instead.
    await expectSigninEnvelope(
      request,
      { otp: USER_001.otp },
      { httpStatus: 500, status: 'Fail', message: 'Internal Server Error' },
    );
  });

  test('an empty request body produces the documented internal-error response [API-002] @api', async ({
    request,
  }) => {
    // Neither key is present at all, so both arms of the OR guard are
    // false regardless of the OR/AND defect (API-001) — this case is
    // unaffected by it and matches swagger.yaml's envelope shape exactly.
    const body = await expectSigninEnvelope(
      request,
      {},
      { httpStatus: 500, status: 'Fail', message: 'Internal Server Error' },
    );

    // API-002 (docs/defects.md): swagger.yaml:177 documents status_code as
    // a string on the 500 response too. server.js:93 assigns it from the
    // numeric literal 500 — the third of the endpoint's three branches to
    // do this (200: server.js:64, 404: server.js:84, both asserted
    // elsewhere in this file), closing the register's claim that all
    // three emit a numeric status_code. This is the one branch otherwise
    // unaffected by every other defect in this file, which is why the
    // soft check lives here rather than on the missing-field tests above.
    expect.soft(body.status_code).toBe('500');
  });

  test('non-string phone_no and otp (numeric coercion) do not sign in [API-006] @api', async ({ request }) => {
    // API-006 (new defect id assigned by issue #27; register entry pending
    // in ticket #28). swagger.yaml:109-112 types both phone_no and otp as
    // strings. api-main/server.js:63 compares them with `==`, so a numeric
    // body ({"phone_no":20011893,"otp":123456} — note the dropped leading
    // zero, itself only survivable because of the loose comparison) is
    // coerced to match the string-typed fixture data and signs in as user
    // 001. Confirmed live 2026-09-08 against a local instance: 200
    // {"status_code":200,"status":"Pass","data":{"id":"001",...},"message":
    // "Sign in success"}. The intended behaviour is that credentials typed
    // as strings do not match via numeric coercion; a mismatch of this kind
    // is indistinguishable, per the documented contract, from any other
    // non-matching credential pair, so it is expected to produce the
    // documented 404. Fails by design.
    await expectSigninEnvelope(
      request,
      { phone_no: 20011893, otp: 123456 },
      { httpStatus: 404, status: 'Not found', message: 'User not found' },
    );
  });

  test('non-string phone_no and otp (array coercion) do not sign in [API-006] @api', async ({ request }) => {
    // API-006 (new defect id assigned by issue #27; register entry pending
    // in ticket #28), same defect, the Array#toString path —
    // {"phone_no":["020011893"],"otp":["123456"]} also coerces to match via
    // `==`. Confirmed live 2026-09-08 against a local instance: 200
    // {"status_code":200,"status":"Pass","data":{"id":"001",...},"message":
    // "Sign in success"}. Fails by design, same reasoning as the
    // numeric-coercion case above.
    await expectSigninEnvelope(
      request,
      { phone_no: ['020011893'], otp: ['123456'] },
      { httpStatus: 404, status: 'Not found', message: 'User not found' },
    );
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
    //
    // Every field below is a *separate* soft assertion so a defect in one
    // (status_code, against API-002) does not abort the test before the
    // other seven run — a regression in any of them would otherwise go
    // uncaught.
    const response = await request.post('/signin', {
      data: { phone_no: USER_001.phone_no, otp: USER_001.otp },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect.soft(typeof body.status_code).toBe('string'); // fails by design: API-002
    expect.soft(typeof body.status).toBe('string');
    expect.soft(typeof body.message).toBe('string');
    expect.soft(typeof body.data).toBe('object');
    expect.soft(typeof body.data.id).toBe('string');
    expect.soft(typeof body.data.first_name).toBe('string');
    expect.soft(typeof body.data.last_name).toBe('string');
    expect.soft(typeof body.data.permission).toBe('string');
  });
});
