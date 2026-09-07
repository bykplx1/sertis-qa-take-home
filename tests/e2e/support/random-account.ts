import crypto from 'node:crypto';

export type Account = {
  username: string;
  password: string;
};

/**
 * A fresh, randomised account per call. demoblaze cannot be seeded or reset
 * (SPEC.md), so every run that signs up must use a username no other
 * concurrent run could collide with (SPEC.md "Test data" / issue #8: "each
 * run needs a fresh randomised account so concurrent runs cannot corrupt
 * each other"). No credentials are ever hard-coded or persisted.
 */
export function randomAccount(): Account {
  const unique = `${Date.now().toString(36)}${crypto.randomInt(1_000_000, 9_999_999).toString(36)}`;
  return {
    username: `qa_${unique}`,
    // Not a "real" credential worth protecting; randomised so nothing
    // committed to the repo could ever be a live secret.
    password: `Qa!${crypto.randomBytes(9).toString('hex')}`,
  };
}
