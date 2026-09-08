import { APIRequestContext, expect } from '@playwright/test';

// The documented POST /signin response shape (swagger.yaml:116-189):
// status_code is documented as a string on every branch (200/404/500);
// api-main emits it as a number instead (API-002, docs/defects.md), which
// is exactly why this type is not narrowed to `string`.
export type SigninEnvelope = {
  status_code: string | number;
  status: string;
  data: Record<string, unknown>;
  message: string;
};

export type SigninSuccessData = {
  id: string;
  first_name: string;
  last_name: string;
  permission: string;
};

export type SigninEnvelopeExpectation = {
  /** The HTTP response status code. */
  httpStatus: number;
  /** The JSON body's `status` field, e.g. 'Pass' | 'Not found' | 'Fail'. */
  status: string;
  message: string;
  data?: SigninSuccessData | Record<string, never>;
};

/**
 * POSTs to /signin and asserts the documented response envelope (HTTP
 * status, `status`, `data`, `message`) in one place, replacing the
 * POST + json() + envelope-assert triple that used to repeat across
 * signin.spec.ts. Returns the parsed body so callers can make additional
 * field-level assertions of their own.
 */
export async function expectSigninEnvelope(
  request: APIRequestContext,
  data: unknown,
  expected: SigninEnvelopeExpectation,
): Promise<SigninEnvelope> {
  const response = await request.post('/signin', { data });

  expect(response.status()).toBe(expected.httpStatus);
  const body = (await response.json()) as SigninEnvelope;
  expect(body.status).toBe(expected.status);
  expect(body.data).toEqual(expected.data ?? {});
  expect(body.message).toBe(expected.message);

  return body;
}
