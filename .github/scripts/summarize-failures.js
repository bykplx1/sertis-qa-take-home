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
// Usage: node summarize-failures.js <results.json> "<suite label>"
//
// Never throws past its own boundary: a missing/unreadable results file is
// reported as its own summary section rather than failing the step, because
// this script runs with `if: always()` after a test step that may itself
// have failed to produce any report (e.g. the runner or webServer never
// came up).

const fs = require('fs');

const [, , resultsPath, suiteLabelArg] = process.argv;
const suiteLabel = suiteLabelArg || resultsPath || 'suite';

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
      lines.push(`- **${e.classification.defectId}** (${e.status}): ${e.title}`);
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
      lines.push(`- (${e.status}): ${e.title}`);
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
      lines.push(`- (${e.status}): ${e.title}`);
      if (e.errorMessage) {
        lines.push(`  \`${e.errorMessage.split('\n')[0].slice(0, 200)}\``);
      }
    }
    lines.push('');
  }

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
    writeSummary(
      `## Failure summary - ${suiteLabel}\n\nNo results file path given to summarize-failures.js.`,
    );
    return;
  }

  if (!fs.existsSync(resultsPath)) {
    // The test step itself may have failed before Playwright wrote a JSON
    // report (e.g. the webServer never started, or `npm ci`/browser install
    // failed upstream). Say so plainly rather than pretending there were no
    // failures.
    writeSummary(
      [
        `## Failure summary - ${suiteLabel}`,
        '',
        `No results file found at \`${resultsPath}\`. The run likely failed before ` +
          'Playwright could write a report (dependency install, browser install, or the ' +
          'local server/webServer failing to start). Check the "Run tests" step log above.',
      ].join('\n'),
    );
    return;
  }

  let report;
  try {
    report = readJson(resultsPath);
  } catch (err) {
    writeSummary(
      `## Failure summary - ${suiteLabel}\n\nCould not parse \`${resultsPath}\`: ${err.message}`,
    );
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

  writeSummary(renderSummary(nonPassing, stats));
}

main();
