#!/usr/bin/env node
'use strict';

// Turns a Playwright JSON reporter file into a human-readable CI failure
// summary, written to $GITHUB_STEP_SUMMARY (rendered inline in the Actions
// run, no artifact download needed) and echoed to stdout.
//
// Sorts every non-passing test into one of three buckets:
//   1. By-design defect failures  - the title carries a defect id (API-xxx /
//      WEB-xxx per docs/defects.md's numbering) - expected, not a regression.
//   2. Possible demoblaze outage  - no defect id, but the failure error looks
//      like a network/navigation problem talking to third-party
//      infrastructure rather than an assertion mismatch.
//   3. Unexpected failures        - everything else. These are the ones a
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
const STATUS_LABEL = {
  unexpected: 'failed',
  flaky: 'flaky, passed after retry',
};
function statusLabel(status) {
  return STATUS_LABEL[status] || status;
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
        if (status === 'expected' || status === 'skipped') continue;

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
    `${stats.expected} passed, ${entries.length} not passing (of ${stats.total} total).`,
  );
  lines.push('');

  const byDefect = entries.filter((e) => e.classification.bucket === 'defect');
  const byOutage = entries.filter((e) => e.classification.bucket === 'outage');
  const unexpected = entries.filter((e) => e.classification.bucket === 'unexpected');

  if (entries.length === 0) {
    lines.push('No failing or flaky tests. :white_check_mark:');
    return lines.join('\n');
  }

  if (byDefect.length > 0) {
    lines.push('### By-design defect failures (expected - see `docs/defects.md`)');
    lines.push('');
    for (const e of byDefect) {
      lines.push(`- **${e.classification.defectId}** (${statusLabel(e.status)}): ${e.title}`);
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
      lines.push(`- (${statusLabel(e.status)}): ${e.title}`);
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
      lines.push(`- (${statusLabel(e.status)}): ${e.title}`);
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
    '- **Note:** this job is configured with `continue-on-error` on the test step so a red ' +
      'result never blocks a merge (see `.github/workflows/ci.yml`) - that setting keeps the ' +
      'job from *gating*, it does not mean the run passed. Check the "Run tests" step log ' +
      'above for the underlying cause (dependency install, browser install, or the ' +
      'local server/webServer failing to start).',
  );
  return lines.join('\n');
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
    writeSummary(renderBrokenRun('No results file path was given to summarize-failures.js.'));
    return;
  }

  if (!fs.existsSync(resultsPath)) {
    // The test step itself may have failed before Playwright wrote a JSON
    // report (e.g. the webServer never started, or `npm ci`/browser install
    // failed upstream). Say so loudly rather than pretending there were no
    // failures.
    writeSummary(renderBrokenRun(`No results file found at \`${resultsPath}\`.`));
    return;
  }

  let report;
  try {
    report = readJson(resultsPath);
  } catch (err) {
    writeSummary(renderBrokenRun(`Could not parse \`${resultsPath}\`: ${err.message}`));
    return;
  }

  const nonPassing = collectNonPassing(report).map((e) => ({
    ...e,
    classification: classify(e),
  }));

  const stats = {
    total: report.stats && typeof report.stats.expected === 'number'
      ? report.stats.expected + report.stats.unexpected + report.stats.flaky + report.stats.skipped
      : nonPassing.length,
    expected: report.stats ? report.stats.expected : undefined,
  };

  // A results file that exists and parses but describes zero executed tests
  // is exactly as broken as a missing file - e.g. the webServer died before
  // Playwright ran a single test, so it wrote an empty report and exited
  // non-zero. Rendering that as "0 not passing, no failures" is a false
  // green; this is the case that motivated this whole function.
  if (stats.total === 0) {
    writeSummary(
      renderBrokenRun(
        `The results file exists and parses, but describes zero executed tests ` +
          `(0 of 0). The test process likely exited before running anything.`,
      ),
    );
    return;
  }

  writeSummary(renderSummary(nonPassing, stats));
}

main();
