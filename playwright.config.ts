import { defineConfig, devices } from '@playwright/test';

/**
 * The api project speaks HTTP to a running api-main instance. It never
 * imports the server module in-process (see CONTEXT.md / SPEC.md "API test
 * boundary"). The base url defaults to a locally started api-main and is
 * overridable so the identical suite can target a deployed instance.
 */
const API_PORT = process.env.API_PORT ?? '3000';
const DEFAULT_API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
const API_BASE_URL = process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL;

// Only start a local api-main when nothing else has been pointed to via
// API_BASE_URL (e.g. a deployed instance).
const usingLocalApi = API_BASE_URL === DEFAULT_API_BASE_URL;

/**
 * Playwright's `webServer` is a top-level config field: it starts
 * unconditionally, before Playwright has decided which projects `--project`
 * selected. That decoupling is exactly the bug this fixes — an `@e2e`-only
 * run (no `--project=api`) must not pay for, or depend on, api-main's
 * dependencies being installed.
 *
 * There's no per-project `webServer` hook to lean on instead, so the run's
 * own CLI invocation is inspected for `--project` selectors. When none are
 * given, every project (including api) runs, so the server is still needed.
 */
function isApiProjectRequested(argv: string[]): boolean {
  const selected: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project') {
      const value = argv[i + 1];
      if (value) selected.push(value);
    } else if (arg.startsWith('--project=')) {
      selected.push(arg.slice('--project='.length));
    }
  }
  return selected.length === 0 || selected.includes('api');
}

const shouldStartLocalApi = usingLocalApi && isApiProjectRequested(process.argv);

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'https://www.demoblaze.com';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['html', { open: 'never' }]],
  use: {
    // Traces are captured on failure regardless of retries, so the @api
    // project (which never retries) still produces an openable trace.
    trace: 'retain-on-failure',
  },

  // Starts a local api-main, but only when the @api project is actually
  // part of this run. Skipped when API_BASE_URL points somewhere else (e.g.
  // a deployed instance), and api-main/ is never imported in-process — only
  // spawned as a separate process.
  webServer: shouldStartLocalApi
    ? {
        // api-main reads ./swagger.yaml relative to its own cwd, so it must
        // be launched from within api-main/ rather than the repo root.
        command: 'node server.js',
        cwd: 'api-main',
        url: `${DEFAULT_API_BASE_URL}/user/ids`,
        reuseExistingServer: !process.env.CI,
        env: { PORT: API_PORT },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 30_000,
      }
    : undefined,

  projects: [
    // @e2e: demoblaze through a browser. Chromium is the default run.
    {
      name: 'e2e',
      testDir: './tests/e2e',
      grep: /@e2e/,
      retries: 2,
      use: { ...devices['Desktop Chrome'], baseURL: E2E_BASE_URL },
    },
    // Configured and runnable locally (not part of the default `npm test`
    // run) — see package.json's test:cross-browser script.
    {
      name: 'e2e-firefox',
      testDir: './tests/e2e',
      grep: /@e2e/,
      retries: 2,
      use: { ...devices['Desktop Firefox'], baseURL: E2E_BASE_URL },
    },
    {
      name: 'e2e-webkit',
      testDir: './tests/e2e',
      grep: /@e2e/,
      retries: 2,
      use: { ...devices['Desktop Safari'], baseURL: E2E_BASE_URL },
    },

    // @api: HTTP against api-main. No retries — the server is local,
    // in-memory and deterministic, so flakiness here is a finding.
    {
      name: 'api',
      testDir: './tests/api',
      grep: /@api/,
      retries: 0,
      use: { baseURL: API_BASE_URL },
    },
  ],
});
