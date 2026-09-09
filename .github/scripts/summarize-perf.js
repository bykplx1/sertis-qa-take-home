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

// Accumulates this step's own verdict as the sections below decide it.
// Applied once, at the foot of the file, after everything has rendered — the
// summary must be written whatever the outcome, so nothing here exits early.
let perfExitCode = 0;

say(`## Performance run — \`${profile}\` profile`);
say('');

if (summary === null) {
  // No summary file, or an unreadable one. k6 never got far enough to
  // report, so there is no verdict to render — say so loudly.
  perfExitCode = 2;
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
  // A zero-sample row is neither held nor a genuine breach — it means the
  // request/metric the row depends on never happened, and k6 can still
  // report `ok: true` on it (the vacuity this whole change exists to
  // catch). Kept as its own bucket, not folded into "breached", so a real
  // performance breach and a broken/empty run are never printed the same.
  const vacuous = thresholds.filter((t) => t.samples === 0);
  const breached = thresholds.filter((t) => !t.ok && t.samples !== 0);

  // Failed `check()`s, counted independently of whether the `checks`
  // threshold survived them. The two are not the same question: `full`
  // tolerates up to 1% and `smoke` up to 20%, so a run can fail real checks
  // and still hold every threshold — which used to render as an unqualified
  // green. Under the current policy any failed check is red, because a
  // check that failed is a fact about demoblaze that a green tick would
  // conceal.
  const checkValues = (metrics.checks && metrics.checks.values) || {};
  const checkFails = typeof checkValues.fails === 'number' ? checkValues.fails : 0;
  const checkPasses = typeof checkValues.passes === 'number' ? checkValues.passes : 0;

  if (thresholds.length === 0) {
    perfExitCode = 1;
    say('### :warning: No thresholds evaluated');
    say('');
    say(
      'A summary was produced but it contains no threshold results. A run with no thresholds ' +
        'produces a chart, not a verdict (`CONTEXT.md`) — check that the script’s `options.thresholds` ' +
        'survived, and that the tagged requests the thresholds reference actually ran.',
    );
  } else if (vacuous.length > 0) {
    perfExitCode = 1;
    say(`### :rotating_light: ${vacuous.length} of ${thresholds.length} threshold(s) measured ZERO samples`);
    say('');
    say(
      'A threshold can report `ok: true` on a metric with zero samples — not shown here as ' +
        '"held": the request or metric a zero-sample row depends on never happened this run. See ' +
        'the `Samples` column below for which ones.',
    );
    if (breached.length > 0) {
      say('');
      say(`In addition, ${breached.length} threshold(s) that did collect samples were genuinely breached.`);
    }
  } else if (breached.length === 0) {
    say(`### :white_check_mark: All ${thresholds.length} thresholds held`);
  } else {
    perfExitCode = 1;
    say(`### :x: ${breached.length} of ${thresholds.length} thresholds breached`);
    say('');
    say(
      'A breach is a **result about demoblaze**, not a broken pipeline — the script is designed ' +
        'to produce a verdict (`perf/README.md`). It fails this job so the verdict cannot be ' +
        'read as green, and gates nothing: no branch protection references this workflow ' +
        '(`SPEC.md`, Out of Scope). Thresholds are defined in `docs/performance-plan.md` §4.',
    );
  }

  // Reported as its own line whether or not a threshold noticed it. A run
  // where every threshold held and 201 checks failed is not a clean run, and
  // said only in the k6 console output it would be a fact buried in an
  // artifact nobody opens.
  if (checkFails > 0) {
    perfExitCode = 1;
    say('');
    say(`### :x: ${checkFails} failed \`check()\`s (${checkPasses} passed)`);
    say('');
    say(
      'Any failed check fails this job, independently of the `checks` threshold above — that ' +
        'threshold budgets for third-party noise (1% on `full`, 20% on `smoke`), so it can hold ' +
        'over real failures. A check asserts response *shape*, not just status, so a failure ' +
        'here means demoblaze answered something the script did not expect — or that the check ' +
        'itself encodes a wrong expectation. Both want a human; neither is green. The failing ' +
        'check names are in `k6-console.log`, attached to this run.',
    );
  }

  if (profile === 'smoke') {
    say('');
    say(
      'Profile: `smoke`. A smoke run is seconds long with single-digit VUs, by design — read its ' +
        "verdicts against the sample counts below, not as the plan-shaped `full` run's evidence.",
    );
  }

  say('');
  say('| Threshold | Metric | Samples | Verdict |');
  say('|---|---|---|---|');
  for (const t of thresholds) {
    const samples = t.samples === null ? '—' : String(t.samples);
    const verdict =
      t.samples === 0 ? ':rotating_light: vacuous (0 samples)' : t.ok ? ':white_check_mark: held' : ':x: breached';
    say(`| \`${t.expression}\` | \`${t.metric}\` | ${samples} | ${verdict} |`);
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
    `Full k6 summary and console log are attached to this run as artifacts (both carry the k6 ` +
      `version — see below). k6 version: \`${summary.k6_version || 'unknown (not recorded — see perf.yml Install k6 step)'}\`. ` +
      `k6 exit code: \`${k6ExitCode}\`.`,
  );
  say('');
  say(
    '> Black box, by design: these numbers establish **that** something is slow and **by how ' +
      'much**, never **why** — there is no server-side visibility into demoblaze ' +
      '(`docs/performance-plan.md` §7).',
  );
}

// The verdict, mirroring `.github/scripts/summarize-failures.js`: any
// non-clean result exits non-zero, and this step is not wrapped in
// `continue-on-error`, so it is what turns the job red. `perf.yml`'s final
// step still fails on k6's own exit code — a threshold breach exits 99 there
// — but that step cannot see a failed check that no threshold caught, which
// is the gap this closes.
if (typeof perfExitCode === 'number' && perfExitCode !== 0) {
  process.exitCode = perfExitCode;
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
