import type { HomePage } from '../pages/home-page';
import type { Account } from './random-account';

/**
 * Signs up and logs in a fresh account, per SPEC.md "Test data". Shared by
 * specs that need a logged-in shopper as a precondition, rather than
 * re-authoring the same sign-up/log-in pair in each one (issue #20 review).
 */
export async function logInAs(homePage: HomePage, account: Account): Promise<void> {
  await homePage.signUp(account.username, account.password);
  await homePage.logIn(account.username, account.password);
}
