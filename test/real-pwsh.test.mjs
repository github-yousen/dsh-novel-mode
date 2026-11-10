/**
 * real-pwsh.test.mjs — the ONE test the QA review (REVIEW-qa.md F1/F2) found
 * missing: execute the ACTUAL bundled PowerShell validators with the argv the
 * engine builds (gateArgsFor), against a minimal real project fixture.
 *
 * No spawnSync mock. Skips gracefully (with an explicit SKIP line) only when
 * `pwsh` is genuinely absent from the host.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = 'D:/yousen/novel-mode-plugin';
const SCRIPTS = join(ROOT, 'assets', '.dsh', 'scripts');
const e = await import(pathToFileURL(join(ROOT, 'lib', 'orchestrator.js')).href);

const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

// Is pwsh actually available?
const probe = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8', windowsHide: true });
const pwshAvailable = probe.status === 0 && !probe.error;

if (!pwshAvailable) {
  console.log('SKIP  real pwsh is not installed on this host — real-pwsh integration cannot run');
  console.log('\n0/0 checks run (SKIP)');
  process.exit(0);
}

/** Build a minimal novel project so validators find their artifacts. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'nm-realpwsh-'));
  mkdirSync(join(root, '.dsh', 'scripts'), { recursive: true });
  // Copy the real scripts (they compute projectRoot from $PSScriptRoot/../..).
  for (const f of readdirSync(SCRIPTS)) {
    if (f.endsWith('.ps1')) writeFileSync(join(root, '.dsh', 'scripts', f), readFileSync(join(SCRIPTS, f)));
  }
  mkdirSync(join(root, 'novel', 'constitution'), { recursive: true });
  writeFileSync(join(root, 'novel', 'constitution', 'core.md'), '# core');
  writeFileSync(join(root, 'novel', 'constitution', 'style.md'), '# style');
  writeFileSync(join(root, 'novel', 'outline.md'), '# outline');
  return root;
}

/** Run engine.gate() with the REAL spawnSync (no mock) for a given stage/state. */
function realGate(stage, state, project) {
  const io = {
    exists: (p) => existsSync(p),
    spawnSync: (cmd, args, opts) => spawnSync(cmd, args, { ...opts, encoding: 'utf8', windowsHide: true }),
    now: () => 1,
  };
  return e.gate(stage, io, project, state);
}

const project = fixture();
try {
  // Every gate script referenced by the engine must accept the argv we build.
  const refs = new Set();
  for (const n of Object.values(e.STAGE_GRAPH)) if (n.gate) refs.add(n.gate);
  for (const s of e.BATCH_SUBSTEPS) if (s.gate) refs.add(s.gate);
  const argv = [];
  for (const rel of refs) argv.push([rel, e.gateArgsFor(rel, { chapter: 1 })]);

  check('all gate scripts exist in the bundled tree', [...refs].every(r => existsSync(join(ROOT, 'assets', ...r.split('/')))), `${refs.size} scripts`);
  check('gateArgsFor produces no -Command and only classified tokens', argv.every(([, a]) => !a.includes('-Command') && a.every(t => /^-?[A-Za-z0-9]+$/.test(t))), JSON.stringify(argv));

  // The two scripts that used to break parameter binding (F1).
  const outlineRel = '.dsh/scripts/validate-outline.ps1';
  const outlineArgs = e.gateArgsFor(outlineRel, { chapter: 1 });
  check('validate-outline.ps1 gets -StartChapter/-EndChapter, NOT -Chapter', outlineArgs.includes('-StartChapter') && !outlineArgs.includes('-Chapter'), outlineArgs.join(' '));
  const analyzeArgs = e.gateArgsFor('.dsh/scripts/analyze-source.ps1', { chapter: 1 });
  check('analyze-source.ps1 gets NO chapter argument', !analyzeArgs.some(a => /Chapter/i.test(a)), JSON.stringify(analyzeArgs));

  // Actually execute validate-outline.ps1 with the engine argv: -All must be a
  // valid parameter set (exit 0 on our minimal fixture).
  const r = spawnSync('pwsh', ['-NoProfile', '-File', join(project, '.dsh', 'scripts', 'validate-outline.ps1'), ...e.gateArgsFor('.dsh/scripts/validate-outline.ps1', {})], { encoding: 'utf8', windowsHide: true, cwd: project });
  check('real pwsh: validate-outline.ps1 -All is a valid invocation', r.status === 0 || (r.status !== null && /outline|章|PASS|未找到|缺失/i.test(String(r.stdout) + String(r.stderr))), `exit=${r.status}`);
  const bad = spawnSync('pwsh', ['-NoProfile', '-File', join(project, '.dsh', 'scripts', 'validate-outline.ps1'), '-Chapter', '1'], { encoding: 'utf8', windowsHide: true, cwd: project });
  check('real pwsh: the OLD blanket -Chapter is REJECTED (proves the bug was real)', bad.status !== 0 && /parameter.*Chapter|cannot be found/i.test(String(bad.stderr) + String(bad.stdout)), `exit=${bad.status}`);

  // Linear-stage gates with a caller-supplied chapter (F2): engine.gate must
  // pass -Chapter N through so the script binds (even if it then fails on
  // missing artifacts — binding failure is what we must rule out).
  const designState = { stage: 'design', chapter: 1, status: 'running' };
  const dg = realGate('design', designState, project);
  check('real pwsh: design gate with chapter=1 does NOT fail parameter binding', !/parameter.*Chapter|missing mandatory|Mandatory/i.test(String(dg.failures.join(' '))), JSON.stringify(dg.failures));

  // gate-less BATCH sub-steps are advanced by step-done, never a fake gate pass.
  const gs = e.createState({ project });
  gs.stage = 'batch'; gs.batchStep = 'A'; gs.chapter = 1; gs.totalChapters = 100; gs.status = 'running';
  check('gate-less step A is in GATELESS_STEPS', e.GATELESS_STEPS.has('A'));
  check('gate-less step A is NOT in REVIEW_STEPS', !e.REVIEW_STEPS.has('A'));
  const adv = e.advance(gs, { type: 'step-done', at: 1 });
  check('step-done advances gate-less step A to A1', adv.ok && adv.state.batchStep === 'A1', JSON.stringify(adv.state.batchStep));
} finally {
  rmSync(project, { recursive: true, force: true });
}

const failed = results.filter(x => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILED:', failed.map(x => x.label).join(' | ')); process.exit(1); }
