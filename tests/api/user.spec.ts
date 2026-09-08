import { test, expect } from '@playwright/test';
import { KNOWN_USER_IDS, USER_001, USER_002 } from './support/users';

// @api coverage of the two user endpoints (GET /user/ids, GET /user/:id),
// asserted against api-main/swagger.yaml rather than against what the
// server happens to do (see CLAUDE.md, SPEC.md "Assertion basis").
//
// Known users and ids are shared via ./support/users instead of being
// declared locally.
const UNKNOWN_ID = '999';
const PROTOTYPE_CHAIN_ID_CASES = ['toString', 'constructor', '__proto__'];

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

    // swagger.yaml's /user/{id} 200 schema (swagger.yaml:60-77) declares
    // five properties as strings, but phone_no and otp are intentionally
    // not checked here. Asserting typeof body.otp === 'string' would
    // assert that an OTP *is present* in this unauthenticated response —
    // exactly the behaviour API-003 (docs/defects.md, Critical) says must
    // not happen, and the opposite of the API-003 test below. Fixing that
    // defect would remove otp/phone_no from the response and would turn
    // this assertion red (SPEC.md "Assertion basis" / "no test is written
    // to certify a known defect as correct"). swagger.yaml:68-71
    // documenting phone_no/otp here cannot justify checking them: that
    // schema block is itself in scope of API-003, not an oracle for this
    // test.
    expect(typeof body.first_name).toBe('string');
    expect(typeof body.last_name).toBe('string');
    expect(typeof body.permission).toBe('string');
  });

  // The shape test above only checks field *types*, so a server returning
  // Jane Smith's record for id 001, or swapping first_name and permission,
  // would still pass it, and id 002 was never fetched at all. These
  // assert the actual documented values for both known ids. otp/phone_no
  // are excluded from the equality check for the same reason as above:
  // asserting their values would still assert their presence, certifying
  // API-003 (docs/defects.md).
  for (const user of [USER_001, USER_002]) {
    test(`id ${user.id} matches its documented first_name, last_name and permission @api`, async ({
      request,
    }) => {
      const response = await request.get(`/user/${user.id}`);

      expect(response.status()).toBe(200);
      const { first_name, last_name, permission } = await response.json();
      expect({ first_name, last_name, permission }).toEqual({
        first_name: user.first_name,
        last_name: user.last_name,
        permission: user.permission,
      });
    });
  }

  // swagger.yaml:79-92 documents 400 + a JSON error body for any invalid
  // id. '999' is a plain own-property miss on user_data and is the one
  // invalid-id class the server handles correctly per that spec — no
  // defect id, expected to pass.
  test(`an unknown id ('${UNKNOWN_ID}') produces the documented error shape and status code @api`, async ({
    request,
  }) => {
    const response = await request.get(`/user/${UNKNOWN_ID}`);

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.status_code).toBe('400');
    expect(typeof body.message).toBe('string');
  });

  // API-005 (new defect id assigned by issue #27; register entry pending
  // in ticket #28). server.js:43 looks up the id with
  // `if (id in user_data)`, which walks the prototype chain rather than
  // checking user_data's own keys. Confirmed live against a local instance
  // on 2026-09-08:
  //   GET /user/toString     -> 500 Internal Server Error, text/html
  //                              (Express stack-trace page; toString is a
  //                              function, not a string user_data entry)
  //   GET /user/constructor  -> 500 Internal Server Error, text/html
  //                              (same cause, Object's constructor)
  //   GET /user/__proto__    -> 200 OK, application/json, body {}
  //                              (matches Object.prototype, sends an empty
  //                              object instead of the documented 400)
  // swagger.yaml:79-92 documents 400 + a JSON error body for any invalid
  // id, with no exception for these. These three are prototype-chain
  // hits, unlike '999' above, and fail by design.
  for (const id of PROTOTYPE_CHAIN_ID_CASES) {
    test(`a prototype-chain id ('${id}') produces the documented error shape and status code [API-005] @api`, async ({
      request,
    }) => {
      const response = await request.get(`/user/${id}`);

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.status_code).toBe('400');
      expect(typeof body.message).toBe('string');
    });
  }

  // Trailing defect-id convention (README.md), matching the rest of this
  // suite.
  test('does not return otp and phone_no to an unauthenticated caller [API-003] @api', async ({ request }) => {
    const response = await request.get(`/user/${KNOWN_USER_IDS[0]}`);
    const body = await response.json();

    expect(body.otp).toBeUndefined();
    expect(body.phone_no).toBeUndefined();
  });
});
