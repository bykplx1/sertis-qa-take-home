#!/usr/bin/env node
'use strict';

// Turns k6's handleSummary output (perf/demoblaze-load.js writes
// `perf-summary.json`) into a human-readable CI summary, written to
// $GITHUB_STEP_SUMMARY (rendered inline in the Actions run, no artifact
// download needed) and echoed to stdout.
//
// The performance script is designed to produce a verdict, not a chart
// (perf/README.md): every threshold in docs/performance-plan.md §4 either
// holds or is breached, and this script's job is to make that verdict
// legible at a glance. A breach is a real result, not a broken run — the two
// are reported differently and must never be confused.
//
// Usage: node summarize-perf.js <perf-summary.json> "<profile>" [k6ExitCode]
//
// Never throws past its own boundary. Like summarize-failures.js, this runs
// with `if: always()` after a step that may have died before producing any
// summary at all (k6 not installed, demoblaze unreachable, the runner
// killed). A missing or unparseable summary is reported as its own LOUD
// section rather than as "no breaches", because a broken run must never
// render as a clean one.

const fs = require('fs');

const [, , summaryPath, profileArg, exitCodeArg] = process.argv;
const profile = profileArg && profileArg.trim() !== '' ? profileArg.trim() : 'unknown';
const k6ExitCode = exitCodeArg && exitCodeArg.trim() !== '' ? exitCodeArg.trim() : 'unknown';

const out = [];
const say = (line) => out.push(line);

/** Reads the summary file, returning null if it is missing or unusable. */
function readSummary(path) {
  if (!path || !fs.existsSync(path)) return null;
  try {
    const raw = fs.readFileSync(path, 'utf8');
    if (raw.trim() === '') return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

/** k6 reports a threshold as `{ ok: bool }` per expression, keyed by the
 * expression string, under each metric's `thresholds` object. Flattens that
 * into one row per expression.
 *
 * Each row also carries the metric's sample count (`values.count`, falling
 * back to `values.passes` for `checks`-style metrics that don't report a
 * plain `count`), so "held" on a smoke run's two samples and "held" on a
 * nine-minute run's thousands never read identically (C11) — a reader sees
 * the sample size a verdict was computed on, not just the verdict. */
function collectThresholds(metrics) {
  const rows = [];
  for (const [metricName, metric] of Object.entries(metrics || {})) {
    if (!metric || !metric.thresholds) continue;
    const values = metric.values || {};
    const samples =
      typeof values.count === 'number'
        ? values.count
        : typeof values.passes === 'number'
          ? values.passes + (values.fails || 0)
          : null;
    for (const [expression, result] of Object.entries(metric.thresholds)) {
      rows.push({
        metric: metricName,
        expression,
        ok: result && result.ok !== false,
        samples,
      });
    }
  }
  return rows;
}

/** Pulls the handful of numbers worth reading without opening the artifact. */
function keyMetrics(metrics) {
  // `stat` may be a list: k6 only reports the trend stats configured in
  // `summaryTrendStats`, so a summary produced by an older revision of the
  // script (or one run with different options) can lack the exact percentile
  // asked for. Falling back to the next-nearest stat is better than printing
  // a dash next to a threshold the run plainly evaluated.
  const pick = (name, stats) => {
    const m = metrics && metrics[name];
    if (!m || !m.values) return null;
    for (const stat of [].concat(stats)) {
      if (typeof m.values[stat] === 'number') return { value: m.values[stat], stat };
    }
    return null;
  };
  // Each formatter names the stat actually found, so a fallback is visible
  // rather than silently passed off as the stat that was asked for.
  const ms = (r) => (r === null ? '—' : `${r.value.toFixed(0)}ms (${r.stat})`);
  const pct = (r) => (r === null ? '—' : `${(r.value * 100).toFixed(2)}%`);
  const count = (r) => (r === null ? '—' : String(r.value));

  return [
    ['http_reqs (total)', count(pick('http_reqs', 'count'))],
    ['http_req_failed (rate)', pct(pick('http_req_failed', 'rate'))],
    ['http_req_duration', ms(pick('http_req_duration', ['p(95)', 'p(90)', 'med']))],
    ['browser_web_vital_lcp', ms(pick('browser_web_vital_lcp', ['p(75)', 'p(90)', 'med']))],
    ['iterations', count(pick('iterations', 'count'))],
    ['vus_max', count(pick('vus_max', 'value'))],
  ];
}

const summary = readSummary(summaryPath);

say(`## Performance run — \`${profile}\` profile`);
say('');

if (summary === null) {
  // No summary file, or an unreadable one. k6 never got far enough to
  // report, so there is no verdict to render — say so loudly.
  say('### :rotating_light: BROKEN RUN — no summary produced');
  say('');
  say(
    `k6 exited with \`${k6ExitCode}\` and no readable \`${summaryPath || '(no path given)'}\` was found.`,
  );
  say('');
  say(
    'This is **not** a clean run and **not** a threshold breach: the test did not get far enough ' +
      'to produce a verdict. Likely causes are k6 failing to install, demoblaze being ' +
      'unreachable, the browser scenario finding no Chromium, or the runner killing the step. ' +
      'Check the run log above.',
  );
} else {
  const metrics = summary.metrics || {};
  const thresholds = collectThresholds(metrics);
  const breached = thresholds.filter((t) => !t.ok);

  if (thresholds.length === 0) {
    say('### :warning: No thresholds evaluated');
    say('');
    say(
      'A summary was produced but it contains no threshold results. A run with no thresholds ' +
        'produces a chart, not a verdict (`CONTEXT.md`) — check that the script’s `options.thresholds` ' +
        'survived, and that the tagged requests the thresholds reference actually ran.',
    );
  } else if (breached.length === 0) {
    say(`### :white_check_mark: All ${thresholds.length} thresholds held`);
  } else {
    say(`### :x: ${breached.length} of ${thresholds.length} thresholds breached`);
    say('');
    say(
      'A breach is a **result, not a failure of the pipeline** — the script is designed to ' +
        'produce a verdict (`perf/README.md`). Thresholds are defined in ' +
        '`docs/performance-plan.md` §4.',
    );
  }

  say('');
  say(
    profile === 'smoke'
      ? `Profile: \`smoke\`. A smoke run is seconds long with single-digit VUs, by design — read ` +
          'its "held" verdicts against the sample counts below, not as the plan-shaped `full` ' +
          "run's evidence."
      : `Profile: \`${profile}\`.`,
  );
  say('');
  say('| Threshold | Metric | Samples | Verdict |');
  say('|---|---|---|---|');
  for (const t of thresholds) {
    const samples = t.samples === null ? '—' : String(t.samples);
    say(
      `| \`${t.expression}\` | \`${t.metric}\` | ${samples} | ${t.ok ? ':white_check_mark: held' : ':x: breached'} |`,
    );
  }

  say('');
  say('### Key metrics');
  say('');
  say('| Metric | Value |');
  say('|---|---|');
  for (const [label, value] of keyMetrics(metrics)) {
    say(`| ${label} | ${value} |`);
  }

  say('');
  say(
    `Full k6 summary and console log are attached to this run as artifacts. k6 exit code: \`${k6ExitCode}\`.`,
  );
  say('');
  say(
    '> Black box, by design: these numbers establish **that** something is slow and **by how ' +
      'much**, never **why** — there is no server-side visibility into demoblaze ' +
      '(`docs/performance-plan.md` §7).',
  );
}

const rendered = out.join('\n') + '\n';
process.stdout.write(rendered);
if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, rendered);
  } catch (e) {
    // Writing the step summary is best-effort; stdout above is the fallback.
  }
}
