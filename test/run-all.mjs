/**
 * Run every standalone *.test.mjs suite and print a summary.
 *
 *   node test/run-all.mjs
 *
 * Exits 0 only when EVERY suite exits 0. Each suite is spawned as its own
 * `node` process (isolated module cache, isolated cwd-independent state), so a
 * crash or leaked global in one suite cannot poison another. The machine-
 * readable `RESULT <suite> <PASS|FAIL> <passed> <failed> <total>` line is
 * parsed for the aggregate; stdout/stderr detail is shown for failures.
 *
 * No npm dependencies. Uses only node:child_process / node:fs / node:path.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// All standalone suites: our *.test.mjs files PLUS the Lead-owned integration
// check (lead-integration.mjs) which uses a different naming convention.
const SUITES = readdirSync(HERE)
  .filter((f) => /\.test\.mjs$/.test(f) || f === 'lead-integration.mjs')
  .sort();

if (SUITES.length === 0) {
  process.stdout.write('No *.test.mjs suites found.\n');
  process.exit(1);
}

const results = [];
let anyFailed = false;

for (const suite of SUITES) {
  const file = join(HERE, suite);
  const started = Date.now();
  const r = spawnSync(process.execPath, [file], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  const ms = Date.now() - started;
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const lines = out.split(/\r?\n/);
  const resultLine = [...lines].reverse().find((l) => l.startsWith('RESULT '));
  let status, passed, failed, total, reason;
  if (resultLine) {
    const parts = resultLine.split(/\s+/);
    status = parts[2] === 'PASS' && r.status === 0 ? 'PASS' : 'FAIL';
    passed = Number(parts[3] ?? 0);
    failed = Number(parts[4] ?? 1);
    total = Number(parts[5] ?? (passed + failed));
    reason = status === 'FAIL'
      ? (r.error ? `spawn: ${r.error.code ?? r.error.message}` : r.signal ? `signal ${r.signal}` : r.status !== 0 ? `exit ${r.status}` : 'RESULT line invalid')
      : '';
  } else {
    // Suites that use a different reporting convention (e.g. the Lead-owned
    // lead-integration.mjs): count PASS/FAIL lines and use the exit code.
    passed = lines.filter((l) => /^PASS\s/.test(l)).length;
    failed = lines.filter((l) => /^FAIL\s/.test(l)).length;
    // Fall back to the explicit "N/M checks passed" summary if present.
    const sum = [...lines].reverse().find((l) => /^\d+\/\d+ checks? passed/.test(l.trim()));
    if (sum) {
      const m = sum.trim().match(/^(\d+)\/(\d+) checks? passed/);
      if (m) { passed = Number(m[1]); total = Number(m[2]); failed = total - passed; }
    }
    total = total || passed + failed;
    status = r.status === 0 && failed === 0 ? 'PASS' : 'FAIL';
    reason = status === 'FAIL'
      ? (r.error ? `spawn: ${r.error.code ?? r.error.message}` : r.signal ? `signal ${r.signal}` : `exit ${r.status}`)
      : '';
  }

  results.push({ suite, status, passed, failed, total, ms, reason, out });
  if (status === 'FAIL') anyFailed = true;

  const tag = status === 'PASS' ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${suite.padEnd(34)} ${String(passed).padStart(3)}/${String(total).padEnd(3)} assertions  ${String(ms).padStart(5)}ms${reason ? '  (' + reason + ')' : ''}\n`);
  if (status === 'FAIL') {
    // Show the failing suite's own detail (indented), capped to keep output sane.
    const detail = out.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (const l of detail.slice(-40)) process.stdout.write(`        ${l}\n`);
  }
}

const suitesPass = results.filter((r) => r.status === 'PASS').length;
const suitesFail = results.length - suitesPass;
const totalAssertions = results.reduce((a, r) => a + r.total, 0);
const passedAssertions = results.reduce((a, r) => a + r.passed, 0);
const failedAssertions = results.reduce((a, r) => a + r.failed, 0);

process.stdout.write('\n==========================================================================\n');
process.stdout.write(`  Novel Mode test suite: ${suitesPass}/${results.length} suites PASS, ${suitesFail} FAIL\n`);
process.stdout.write(`  Assertions: ${passedAssertions}/${totalAssertions} passed, ${failedAssertions} failed\n`);
process.stdout.write('==========================================================================\n');
for (const r of results) {
  process.stdout.write(`  ${r.status === 'PASS' ? 'OK  ' : 'FAIL'} ${r.suite}\n`);
}

process.exit(anyFailed ? 1 : 0);
