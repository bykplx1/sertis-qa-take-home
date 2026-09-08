import { test, expect } from '@playwright/test';

// Undocumented request shapes on POST /signin. Live observations backing
// this test are recorded in the #27 implementation report, not here — this
// suite asserts intended behaviour, not observed behaviour (SPEC.md
// "Assertion basis"). No defect id: assigning new API-0xx ids belongs to
// ticket #28, which owns docs/defects.md.
test('malformed JSON on POST /signin gets a JSON error envelope, not an HTML stack page [API-007] @api', async ({
  request,
}) => {
  const response = await request.post('/signin', {
    headers: { 'content-type': 'application/json' },
    data: '{bad',
  });

  // swagger.yaml documents no dedicated response for a request-parse
  // failure, so this does not pin a status code — swagger.yaml:170's 500
  // "Internal Server Error" is the closest documented branch, but a
  // correctly behaving server could equally answer 400; asserting a
  // specific code here would be inference, not a documented contract.
  // What every response swagger.yaml *does* document for this endpoint
  // (its 200/404/500 branches) shares is a JSON error envelope:
  // content-type application/json, body shape { status_code, status, data,
  // message }. That is the narrower, spec-anchored claim this test makes.
  expect(response.headers()['content-type']).toContain('application/json');
  const body = await response.json();
  expect(typeof body.status_code).toBe('string');
  expect(typeof body.status).toBe('string');
  expect(typeof body.data).toBe('object');
  expect(typeof body.message).toBe('string');
});
