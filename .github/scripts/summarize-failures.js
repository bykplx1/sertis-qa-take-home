#!/usr/bin/env node
'use strict';

// Turns a Playwright JSON reporter file into a human-readable CI failure
// summary, written to $GITHUB_STEP_SUMMARY (rendered inline in the Actions
// run, no artifact download needed) and echoed to stdout.
//
// Sorts every non-passing test into one of four buckets:
//   1. By-design defect failures  - the title carries a defect id (API-xxx /
//      WEB-xxx per docs/defects.md's numbering) - expected, not a regression.
//      Includes `test.fail()` reproductions failing as declared: Playwright
//      reports those with `status: "expected"`, the same value a genuine
//      pass carries, so this bucket is only reachable by also reading
//      `expectedStatus` - see collectNonPassing below.
//   2. Defects that may be FIXED   - a `test.fail()` test (expectedStatus
//      "failed") whose real run passed anyway (status "unexpected"). This is
//      the loud, opposite case: the defect this test exists to reproduce may
//      no longer be present and wants a human look, not a green checkmark.
//   3. Possible demoblaze outage  - no defect id, but the failure error looks
//      like a network/navigation problem talking to third-party
//      infrastructure rather than an assertion mismatch.
//   4. Unexpected failures        - everything else. These are the ones a
//      reviewer should look at as possible regressions.
//
// Usage: node summarize-failures.js <results.json> "<suite label>" [testStepExitCode]
//
// Never throws past its own boundary: a missing/unreadable/empty results
// file is reported as its own LOUD failure section rather than as "no
// failures", because this script runs with `if: always()` after a test step
// that may itself have died before producing any report (e.g. the runner or
// webServer never came up) - and a broken run must never render as a green
// checkmark. See the "brokenRun" handling below; this was exactly the false
// green produced when the e2e job's webServer failed to start (run
// 34110055006 / commit 503c92f): a results file existed but described zero
// executed tests, and the old code rendered that as "No failing or flaky
// tests. :white_check_mark:".

const fs = require('fs');

const [, , resultsPath, suiteLabelArg, exitCodeArg] = process.argv;
const suiteLabel = suiteLabelArg || resultsPath || 'suite';
// The workflow passes the test step's real exit code (captured with `set
// +e` around the run, since continue-on-error only affects the job's
// conclusion, not what's visible to this script). "unknown" if the caller
// didn't supply one.
const testStepExitCode = exitCodeArg && exitCodeArg.trim() !== '' ? exitCodeArg.trim() : 'unknown';

// A human label for a Playwright test status that reads correctly no matter
// which bucket heading it sits under - the raw status string ("unexpected")
// used to appear verbatim even inside a "By-design (expected)" section,
// contradicting the heading it was in.
//
// `test.fail()` inverts what "expected" means for a given entry, so the
// label also needs `expectedStatus` (see collectNonPassing/classify): a
// plain test's "unexpected" is a real failure, but a `test.fail()` test's
// "unexpected" is an unexpected PASS, which is a completely different fact
// and must not read as "failed".
const STATUS_LABEL = {
  unexpected: 'failed',
  flaky: 'flaky, passed after retry',
};
function statusLabel(entry) {
  if (entry.expectedStatus === 'failed') {
    if (entry.status === 'expected') return 'failed as expected (test.fail())';
    if (entry.status === 'unexpected') return 'passed unexpectedly (test.fail())';
    if (entry.status === 'flaky') return 'flaky - reproduced the defect on some attempts, not others';
  }
  return STATUS_LABEL[entry.status] || entry.status;
}

const DEFECT_ID_RE = /\b(API|WEB)-\d{3}\b/;
const OUTAGE_RE =
  /net::ERR_|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|getaddrinfo|ENOTFOUND|net::|Timeout .*(exceeded|waiting for)|NS_ERROR_/i;

function readJson(path) {
  const raw = fs.readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

// Walks the JSON reporter's nested suite tree and yields one entry per test
// result that Playwright did not consider a straightforward pass.
function collectNonPassing(report) {
  const found = [];

  function visitSuite(suite, titlePath) {
    const nextPath = suite.title ? [...titlePath, suite.title] : titlePath;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const status = test.status; // 'expected' | 'unexpected' | 'flaky' | 'skipped'
        // `expectedStatus` is what Playwright expects the test to end in -
        // 'passed' for a plain test, 'failed' for a `test.fail()`. A
        // `test.fail()` reproduction that fails as declared still reports
        // `status: 'expected'`, the same value a genuine pass carries, so a
        // plain `status === 'expected'` skip would silently drop every
        // known-defect reproduction (issue #33). Only skip a status of
        // 'expected' when it is *also* an ordinary expected pass.
        if (status === 'skipped') continue;
        if (status === 'expected' && test.expectedStatus !== 'failed') continue;

        const lastResult = (test.results || [])[test.results.length - 1];
        const errorMessage =
          (lastResult && lastResult.error && lastResult.error.message) ||
          (lastResult &&
            Array.isArray(lastResult.errors) &&
            lastResult.errors[0] &&
            lastResult.errors[0].message) ||
          '';

        found.push({
          title: [...nextPath, spec.title].filter(Boolean).join(' > '),
          status,
          expectedStatus: test.expectedStatus,
          errorMessage,
        });
      }
    }
    for (const child of suite.suites || []) {
      visitSuite(child, nextPath);
    }
  }

  for (const suite of report.suites || []) {
    visitSuite(suite, []);
  }
  return found;
}

function classify(entry) {
  const defectMatch = entry.title.match(DEFECT_ID_RE);

  // A `test.fail()` test (expectedStatus 'failed') whose real run passed
  // anyway reports `status: 'unexpected'` - the same status a genuine
  // regression carries. That is E10's whole point: when the defect this
  // test reproduces gets fixed, this is how it surfaces. It must go loud as
  // its own bucket, not fall into "By-design" (it did not fail) or get
  // buried in "Unexpected failures" (it is not a regression - it's good
  // news that wants a human to confirm and retire the test.fail()).
  if (entry.status === 'unexpected' && entry.expectedStatus === 'failed') {
    return {
      bucket: 'fixedDefect',
      defectId: defectMatch ? defectMatch[0].replace(/[[\]]/g, '') : undefined,
    };
  }

  if (defectMatch) {
    return { bucket: 'defect', defectId: defectMatch[0].replace(/[[\]]/g, '') };
  }
  if (OUTAGE_RE.test(entry.errorMessage)) {
    return { bucket: 'outage' };
  }
  return { bucket: 'unexpected' };
}

function renderSummary(entries, stats) {
  const lines = [];
  lines.push(`## Failure summary - ${suiteLabel}`);
  lines.push('');
  lines.push(
    `${stats.expected ?? '?'} passed, ${entries.length} not passing (of ${stats.total} total).`,
  );
  lines.push('');

  const byDefect = entries.filter((e) => e.classification.bucket === 'defect');
  const fixedDefects = entries.filter((e) => e.classification.bucket === 'fixedDefect');
  const byOutage = entries.filter((e) => e.classification.bucket === 'outage');
  const unexpected = entries.filter((e) => e.classification.bucket === 'unexpected');

  if (entries.length === 0) {
    lines.push('No failing or flaky tests. :white_check_mark:');
    return lines.join('\n');
  }

  // Why this run is red, stated before the buckets rather than left for the
  // reader to infer from a red X in the sidebar. Under the current policy
  // ANY non-passing test fails the job, by-design defect reproductions
  // included: a green check on a run that just reproduced nineteen defects
  // asserts something untrue about the systems under test, and the summary
  // it hides is the exact artifact a QA reader came for. Red here is a
  // statement about demoblaze and api-main, not about this repository's own
  // code, and it blocks nothing - no branch protection references these jobs
  // (SPEC.md, Out of Scope).
  lines.push(
    `**This job is red because ${entries.length} test(s) did not pass.** Every non-passing ` +
      'result fails the job, including the by-design defect reproductions below. The ' +
      'breakdown that follows is the point of the run: read it before treating red as a ' +
      'regression. Nothing is gated on this check.',
  );
  lines.push('');

  if (byDefect.length > 0) {
    lines.push('### By-design defect failures (expected - see `docs/defects.md`)');
    lines.push('');
    for (const e of byDefect) {
      lines.push(`- **${e.classification.defectId}** (${statusLabel(e)}): ${e.title}`);
    }
    lines.push('');
  }

  if (fixedDefects.length > 0) {
    lines.push('### :bell: Defects that may be FIXED (`test.fail()` passed unexpectedly)');
    lines.push('');
    lines.push(
      '_Each test below is written with `test.fail()` to reproduce a known defect - it should ' +
        'fail every run until the defect is fixed. It passed instead. That is good news, but it ' +
        "is not certified here: confirm the fix, then update the test and `docs/defects.md` " +
        'rather than leaving the defect id live against a passing test._',
    );
    lines.push('');
    for (const e of fixedDefects) {
      const idLabel = e.classification.defectId ? `**${e.classification.defectId}** ` : '';
      lines.push(`- ${idLabel}(${statusLabel(e)}): ${e.title}`);
    }
    lines.push('');
  }

  if (byOutage.length > 0) {
    lines.push('### Possible third-party outage (demoblaze), not a code regression');
    lines.push('');
    lines.push(
      '_The error below looks like a network/navigation failure talking to demoblaze rather ' +
        'than an assertion mismatch. demoblaze is live third-party infrastructure this repo ' +
        "does not control; re-run before treating this as a regression._",
    );
    lines.push('');
    for (const e of byOutage) {
      lines.push(`- (${statusLabel(e)}): ${e.title}`);
      if (e.errorMessage) {
        lines.push(`  \`${e.errorMessage.split('\n')[0].slice(0, 200)}\``);
      }
    }
    lines.push('');
  }

  if (unexpected.length > 0) {
    lines.push('### Unexpected failures (possible regressions - no defect id found in title)');
    lines.push('');
    for (const e of unexpected) {
      lines.push(`- (${statusLabel(e)}): ${e.title}`);
      if (e.errorMessage) {
        lines.push(`  \`${e.errorMessage.split('\n')[0].slice(0, 200)}\``);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// Renders the one state that must never be mistaken for a pass: the run
// didn't produce a real result set at all. `reason` is a short, specific
// diagnosis (missing file / parse error / zero tests executed); this is
// deliberately its own heading with its own emoji so it cannot be confused
// with, or scrolled past as part of, the normal "no failures" case.
function renderBrokenRun(reason) {
  const lines = [];
  lines.push(`## :rotating_light: BROKEN RUN - ${suiteLabel}`);
  lines.push('');
  lines.push(
    '**This is not a pass.** The suite did not produce a usable set of test results, so ' +
      'there is nothing here to certify as green - treat this the same as a failing run ' +
      'until it is understood.',
  );
  lines.push('');
  lines.push(`- **Why:** ${reason}`);
  lines.push(`- **Test step exit code:** \`${testStepExitCode}\``);
  lines.push(
    '- **Note:** this failed the job on purpose. `continue-on-error` on the test step (see ' +
      '`.github/workflows/ci.yml`) only stops a red *test* result from blocking a merge - it ' +
      "does not apply here. A broken run isn't a test result to certify either way, so this " +
      'step deliberately goes red instead. Check the "Run tests" step log above for the ' +
      'underlying cause (dependency install, browser install, or the local server/webServer ' +
      'failing to start).',
  );
  return lines.join('\n');
}

// A broken run is not a test failure - the non-gating policy for test
// failures (SPEC.md:19) is deliberate and untouched by this. But a broken
// run being invisible is a defect in the pipeline itself: setting
// `process.exitCode` here (rather than inside the pure `renderBrokenRun`
// above) is what lets the "Summarize failures" step in ci.yml, which is not
// wrapped in `continue-on-error`, actually fail the job.
function reportBrokenRun(reason) {
  process.exitCode = 2;
  writeSummary(renderBrokenRun(reason));
}

function writeSummary(markdown) {
  console.log(markdown);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    fs.appendFileSync(summaryPath, markdown + '\n');
  }
}

function main() {
  if (!resultsPath) {
    reportBrokenRun('No results file path was given to summarize-failures.js.');
    return;
  }

  if (!fs.existsSync(resultsPath)) {
    // The test step itself may have failed before Playwright wrote a JSON
    // report (e.g. the webServer never started, or `npm ci`/browser install
    // failed upstream). Say so loudly rather than pretending there were no
    // failures.
    reportBrokenRun(`No results file found at \`${resultsPath}\`.`);
    return;
  }

  let report;
  try {
    report = readJson(resultsPath);
  } catch (err) {
    reportBrokenRun(`Could not parse \`${resultsPath}\`: ${err.message}`);
    return;
  }

  // JSON.parse succeeds on plenty of things that aren't a Playwright report:
  // `null`, a bare number, an array. readJson's caller above only catches a
  // parse failure, not a successful parse of a non-object - reading `.suites`
  // off `null` throws past this function's boundary instead of rendering the
  // broken-run section this whole script exists to guarantee.
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    reportBrokenRun(
      `\`${resultsPath}\` parsed but is not a Playwright JSON report object ` +
        `(got ${report === null ? 'null' : Array.isArray(report) ? 'an array' : typeof report}).`,
    );
    return;
  }

  const nonPassing = collectNonPassing(report).map((e) => ({
    ...e,
    classification: classify(e),
  }));

  // `hasStats` gates on the same signal the old code used
  // (`report.stats && typeof report.stats.expected === 'number'`): a report
  // whose `stats` object is missing or unusable falls back to
  // `nonPassing.length` rather than to 0. That fallback is load-bearing, not
  // cosmetic - a report with real failing tests but no usable `stats` must
  // still compute a non-zero total, or it wrongly hits the zero-tests
  // broken-run check below and turns a TEST FAILURE into what reads as a
  // BROKEN RUN (see C1: those two must never be conflated).
  //
  // When `hasStats` is true, each field is still defaulted individually
  // (not gated as a group) so a stats object with some but not all fields
  // numeric (e.g. `{ expected: 2 }`) doesn't sum to `undefined`s and render
  // "undefined passed ... (of NaN total)" - NaN === 0 is false, so that
  // used to slip past the zero-tests broken-run check instead of being
  // caught by it.
  const s = report.stats;
  const hasStats = s && typeof s.expected === 'number';
  const total = hasStats
    ? (typeof s.expected === 'number' ? s.expected : 0) +
      (typeof s.unexpected === 'number' ? s.unexpected : 0) +
      (typeof s.flaky === 'number' ? s.flaky : 0) +
      (typeof s.skipped === 'number' ? s.skipped : 0)
    : nonPassing.length;
  // Playwright's own `stats.expected` counts every test whose result
  // matched its `expectedStatus` - which, for a `test.fail()` reproduction
  // that failed as declared, is still `expected` even though it is now
  // listed under "By-design defect failures" below. Subtracting those out
  // keeps the headline "N passed" honest instead of counting known-defect
  // reproductions as passes (the false-green this ticket exists to fix).
  const byDesignFailureCount = nonPassing.filter((e) => e.status === 'expected').length;
  const stats = {
    total,
    expected: hasStats ? s.expected - byDesignFailureCount : undefined,
  };

  // A results file that exists and parses but describes zero executed tests
  // is exactly as broken as a missing file - e.g. the webServer died before
  // Playwright ran a single test, so it wrote an empty report and exited
  // non-zero. Rendering that as "0 not passing, no failures" is a false
  // green; this is the case that motivated this whole function.
  if (stats.total === 0) {
    reportBrokenRun(
      `The results file exists and parses, but describes zero executed tests ` +
        `(0 of 0). The test process likely exited before running anything.`,
    );
    return;
  }

  writeSummary(renderSummary(nonPassing, stats));

  // The verdict. Exit 1 - distinct from reportBrokenRun's 2 - when the run
  // produced any non-passing result at all. This step is deliberately not
  // wrapped in `continue-on-error` in ci.yml, so this is what turns the job
  // red.
  //
  // `nonPassing` is the right population and `stats.expected` is not: a
  // `test.fail()` reproduction failing as declared is `expected` to
  // Playwright and leaves its exit code at 0, which is precisely the green
  // that hid the defect register from anyone reading the check rather than
  // the summary. collectNonPassing already keeps those entries (see its
  // `expectedStatus === 'failed'` carve-out), so counting it here covers
  // failures, flakes, unexpected passes and declared reproductions in one
  // number without re-deriving any of them.
  if (nonPassing.length > 0) {
    process.exitCode = 1;
  }
}

main();
