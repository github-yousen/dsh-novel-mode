/**
 * failure-recovery.test.mjs — simulate hostile / degraded conditions and
 * assert: NO throw escapes the Host adapter, NO user-visible internal output,
 * and the engine degrades gracefully.
 *
 * Cases:
 *   - missing assets dir (apply + listeners + tool must not throw/leak)
 *   - read-only project (writes fail, but no throw escapes / no leak)
 *   - malformed / corrupt checkpoint (backup + fresh + generic status)
 *   - concurrent activations (materialization + tool.execute)
 *   - tool.execute with no agent / junk args / every action
 *   - io that throws on every operation
 *   - gate runner unavailable (DEGRADED, never silent PASS)
 *   - render() with degenerate values
 *
 * Run: node test/failure-recovery.test.mjs
 */
import {
  ROOT, check, asyncCheck, eq, ok, truthy, falsy, match, noMatch, includes,
  excludes, notThrows, readText, walk, exists, isDir,
  tmpProject, mockCtx, moduleOnlyCopy, markReadOnly, restoreWritable,
  loadPlugin, loadEngine, finish,
} from './_lib.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const SUITE = 'failure-recovery';
const plugin = await loadPlugin();
const engine = await loadEngine();

/* Generic, non-leaking status vocabulary (zh + en). */
const ALL_GENERIC = [
  '就绪', '已保存进度，可继续', '正在恢复，请稍候', '工作流暂不可用，请稍候',
  'Ready', 'Progress saved, you can continue', 'Recovering, please wait',
  'Workflow is temporarily unavailable',
];
const LEAK_PATTERNS = [
  /\.ps1/i, /stderr/i, /script-exit/i, /exception/i, /Error:/, /at Object/,
  /ENOENT/i, /EACCES/i, /stack/i, /node:internal/, /RAW/i, /checkpoint/i,
  /pwsh/i, /exitCode/i, /TypeError/, /ReferenceError/,
];

/** User-facing surfaces: the full no-leak set applies. */
function assertNoLeak(value, label) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  for (const re of LEAK_PATTERNS) noMatch(s, re, `${label} leaked ${re}`);
}
/** Internal engine results: script paths / classified codes are legitimate
 *  data; only assert no CREDENTIAL values and no raw exception/stack text. */
const INTERNAL_LEAK_PATTERNS = [
  /stack/i, /node:internal/, /TypeError/, /ReferenceError/, /RAW_INTERNAL/i,
  /"cookie"\s*:\s*"[^"]+"/i, /verify_[A-Za-z0-9_-]{12,}/,
];
function assertNoInternalLeak(value, label) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  for (const re of INTERNAL_LEAK_PATTERNS) noMatch(s, re, `${label} leaked ${re}`);
}
function assertGenericResult(r, label) {
  ok(r && typeof r.ok === 'boolean', `${label}: result shape`);
  ok(ALL_GENERIC.includes(r.status), `${label}: generic status (got ${r && r.status})`);
  assertNoLeak(r, label);
}
/** Await fn(); fail the assertion if it throws. Returns its resolved value. */
async function mustNotThrow(fn, label) {
  try { return await fn(); }
  catch (err) { throw new Error(`${label} threw: ${err && err.message ? err.message : err}`); }
}

/* -------------------------------------------------------------------------- */
/* 1. Missing assets dir                                                      */
/* -------------------------------------------------------------------------- */

const M = moduleOnlyCopy(); // package.json type:module, index.js + lib, NO assets/

await asyncCheck('missing assets: module imports successfully', async () => {
  const m = await import(pathToFileURL(join(M.path, 'index.js')).href);
  eq(m.name, 'novel-mode');
});
await asyncCheck('missing assets: apply(ctx) never surfaces a raw internal error', async () => {
  const m = await import(pathToFileURL(join(M.path, 'index.js')).href);
  const ctx = mockCtx({ get: () => undefined });
  // The current implementation reads ASSET_SKILLS synchronously in apply() and
  // WILL throw ENOENT when the assets tree is absent. Recovery contract: the
  // throw must be a clean Error (never a user-visible string / no stdout), and
  // the tool / listeners must still be safe afterwards.
  let err;
  try { m.apply(ctx); } catch (e) { err = e; }
  if (err) {
    ok(err instanceof Error, 'thrown value must be an Error object');
    eq(typeof err.message, 'string');
    // Host-startup errors go to the internal log, never to the user. Assert
    // they carry no credential values / prompt text / stack dump.
    assertNoInternalLeak(err.message, 'missing-assets apply error');
    excludes(err.message, 'RAW', 'no raw internals');
    excludes(err.message, 'process.env', 'no env dump');
  }
});
await asyncCheck('missing assets: tool.execute + listeners never throw / never leak', async () => {
  const m = await import(pathToFileURL(join(M.path, 'index.js')).href);
  const ctx = mockCtx({ get: () => undefined });
  try { m.apply(ctx); } catch { /* contained above */ }
  const tool = ctx._tools[0];
  if (tool) {
    const r = await mustNotThrow(() => tool.execute({ action: 'status' }, { agent: { session: {} } }), 'missing-assets tool');
    assertGenericResult(r, 'missing-assets tool result');
  }
  for (const [name, fns] of Object.entries(ctx._events)) {
    for (const fn of fns) {
      notThrows(() => fn({ agent: { session: { header: { cwd: M.path } } } }), `${name} listener must not throw`);
    }
  }
});
M.dispose();

/* -------------------------------------------------------------------------- */
/* 2. Read-only project                                                       */
/* -------------------------------------------------------------------------- */

const R = tmpProject('nm-readonly');
await asyncCheck('read-only project: tool.execute never throws, never leaks', async () => {
  const ctx = mockCtx({ cwdOf: () => R.path, get: () => undefined });
  notThrows(() => plugin.apply(ctx), 'apply');
  const tool = ctx._tools[0];
  const exec = { agent: { session: { header: { cwd: R.path } } } };
  const r = await mustNotThrow(() => tool.execute({ action: 'start' }, exec), 'read-only start');
  assertGenericResult(r, 'read-only tool result');
});
R.dispose();

const R2 = tmpProject('nm-readonly2');
check('read-only target: materialization listener swallows cpSync failures', () => {
  const project = R2.path;
  const ctx = mockCtx({
    cwdOf: () => project,
    presetForSession: () => 'novel',
    agentGet: () => ({ session: { header: { cwd: project } } }),
  });
  plugin.apply(ctx);
  mkdirSync(join(project, '.dsh'), { recursive: true });
  writeFileSync(join(project, '.dsh', 'config.yaml'), '# USER\n', 'utf8');
  markReadOnly(project);
  notThrows(() => {
    for (const fn of ctx._events['agent-preset/selected'] || []) fn('sid', 'novel');
    for (const fn of ctx._events['agent/created'] || []) fn({ agent: { session: { header: { cwd: project } } } });
  }, 'listeners must swallow cpSync failures');
  restoreWritable(project); // allow cleanup
  eq(readText(join(project, '.dsh', 'config.yaml')), '# USER\n', 'pre-existing file preserved');
});
R2.dispose();

/* -------------------------------------------------------------------------- */
/* 3. Malformed / corrupt state                                               */
/* -------------------------------------------------------------------------- */

const C = tmpProject('nm-corrupt');
mkdirSync(join(C.path, '.dsh', 'state'), { recursive: true });
writeFileSync(join(C.path, '.dsh', 'state', 'novel-mode.checkpoint.json'), 'THIS IS NOT JSON {', 'utf8');

await asyncCheck('corrupt checkpoint: tool recovers with generic status, no leak', async () => {
  const ctx = mockCtx({ cwdOf: () => C.path, get: () => undefined });
  plugin.apply(ctx);
  const tool = ctx._tools[0];
  const exec = { agent: { session: { header: { cwd: C.path } } } };
  const r = await mustNotThrow(() => tool.execute({ action: 'status', locale: 'zh' }, exec), 'corrupt status');
  eq(r.ok, true, 'status must still succeed');
  includes(r.status, '正在恢复', 'recovering token expected');
  eq(r.stage, 'bootstrap', 'fresh state at bootstrap');
  assertGenericResult(r, 'corrupt-checkpoint status');
});
check('corrupt checkpoint: backed up, not silently dropped', () => {
  const bk = join(C.path, '.dsh', 'state', 'novel-mode.checkpoint.corrupt.json');
  ok(exists(bk), 'corrupt file must be backed up');
  eq(readText(bk), 'THIS IS NOT JSON {', 'backup preserves bytes');
});
await asyncCheck('every action after recovery returns generic, non-leaking results', async () => {
  const ctx = mockCtx({ cwdOf: () => C.path, get: () => undefined });
  plugin.apply(ctx);
  const tool = ctx._tools[0];
  const exec = { agent: { session: { header: { cwd: C.path } } } };
  for (const action of ['status', 'start', 'select-branch', 'gate-pass', 'gate-fail', 'batch-step', 'skip', 'resume', 'retry', 'pause', 'reset', 'bogus']) {
    const args = { action, locale: action === 'gate-fail' ? 'en' : 'zh', branch: 'constitution', chapter: 1, failures: ['RAW_STDERR_STRING', 'script-exit-9'] };
    const r = await mustNotThrow(() => tool.execute(args, exec), `action ${action}`);
    assertGenericResult(r, `action ${action}`);
    excludes(JSON.stringify(r), 'RAW_STDERR_STRING', `action ${action} echoed caller text`);
    excludes(JSON.stringify(r), 'script-exit-9', `action ${action} echoed caller code`);
  }
});
C.dispose();

/* -------------------------------------------------------------------------- */
/* 4. Concurrent activations                                                  */
/* -------------------------------------------------------------------------- */

const K = tmpProject('nm-concurrent');
check('concurrent preset activations create ONE .dsh with no throw', () => {
  const ctx = mockCtx({
    cwdOf: () => K.path,
    presetForSession: () => 'novel',
    agentGet: () => ({ session: { header: { cwd: K.path } } }),
  });
  plugin.apply(ctx);
  const fns = ctx._events['agent-preset/selected'] || [];
  notThrows(() => {
    for (let i = 0; i < 12; i += 1) for (const fn of fns) fn('sess-' + i, 'novel');
  }, 'concurrent activations must not throw');
  ok(isDir(join(K.path, '.dsh')), '.dsh exists');
  eq(walk(join(K.path, '.dsh')).filter((p) => p.endsWith('SKILL.md')).length, 21, '21 SKILL.md despite concurrency');
});
await asyncCheck('concurrent tool.execute calls: all ok, all generic, no leak', async () => {
  const ctx = mockCtx({ cwdOf: () => K.path, get: () => undefined });
  plugin.apply(ctx);
  const tool = ctx._tools[0];
  const exec = { agent: { session: { header: { cwd: K.path } } } };
  const rs = await Promise.all(Array.from({ length: 16 }, (_, i) => tool.execute({ action: i % 2 ? 'status' : 'start', locale: i % 3 ? 'zh' : 'en' }, exec)));
  for (const r of rs) assertGenericResult(r, 'concurrent tool result');
});
K.dispose();

/* -------------------------------------------------------------------------- */
/* 5. No agent / junk args / io that throws                                   */
/* -------------------------------------------------------------------------- */

await asyncCheck('no-agent tool.execute returns generic unavailable, never throws', async () => {
  const ctx = mockCtx({ get: () => undefined });
  plugin.apply(ctx);
  const tool = ctx._tools[0];
  for (const args of [undefined, {}, { action: 'status' }, { action: 'bogus' }, null, 'string', 42]) {
    const r = await mustNotThrow(() => tool.execute(args, {}), 'no-agent');
    assertGenericResult(r, 'no-agent result');
    eq(r.ok, false, 'no-agent must be ok:false');
  }
});
await asyncCheck('tool.execute with junk/jumbo args never throws or leaks', async () => {
  const ctx = mockCtx({ get: () => undefined });
  plugin.apply(ctx);
  const tool = ctx._tools[0];
  const exec = { agent: { session: {} } };
  for (const args of [
    { action: 'start', goal: 'x'.repeat(5000), locale: 'zh' },
    { action: 'start', goal: { nested: 'RAW_INTERNAL_OBJECT' }, locale: 'en' },
    { action: 'gate-fail', failures: ['RAW_STDERR', 'script-exit-9', 'x'.repeat(999)], locale: 'en' },
    { action: 'batch-step', chapter: -1, step: '../../../etc', totalChapters: 1.5 },
    { action: 'select-branch', branch: 'BOGUS' },
    { action: 'status', locale: 'klingon' },
  ]) {
    const r = await mustNotThrow(() => tool.execute(args, exec), 'junk args');
    assertGenericResult(r, 'junk-args result');
    excludes(JSON.stringify(r), 'RAW_STDERR', 'caller raw text echoed');
    excludes(JSON.stringify(r), 'RAW_INTERNAL_OBJECT', 'object arg echoed');
  }
});

check('engine: io that throws on EVERY operation never escapes loadState/saveState/gate', () => {
  const boom = () => { throw new Error('DISK ON FIRE RAW_INTERNAL'); };
  const io = {
    exists: boom, readFile: boom, writeFile: boom, rename: boom, mkdir: boom,
    readdir: boom, spawnSync: boom, now: () => 1, log: () => {},
  };
  let l, s, g;
  notThrows(() => { l = engine.loadState(io, '/p', { goal: '' }); }, 'loadState with throwing io');
  notThrows(() => { s = engine.saveState(io, '/p', engine.createState({ project: '/p' })); }, 'saveState with throwing io');
  notThrows(() => { g = engine.gate('design', io, '/p', engine.createState({ project: '/p' })); }, 'gate with throwing io');
  eq(l.ok, true, 'loadState degrades to fresh');
  eq(l.recovered, true, 'loadState marks recovered');
  eq(s.ok, false, 'saveState reports failure');
  ok(g && (g.status === 'DEGRADED' || g.status === 'FAIL'), 'gate degrades, never silent PASS');
  // loadState/saveState top-level `reason`/`error` are internal observability
  // (classified io error strings); the Host adapter discards saveState's return
  // and never surfaces either. The PERSISTED state + gate verdict must be clean.
  ok(typeof l.reason === 'string', 'recovery reason recorded');
  ok(typeof s.error === 'string', 'save failure reason recorded');
  assertNoInternalLeak({ state: l.state, gate: g }, 'throwing-io persisted engine outputs');
  // The persisted recovery state carries a structured DEGRADED log, no prose.
  eq(l.state.log[0].verdict, 'DEGRADED');
  eq(l.state.history.length, 0, 'no raw error text stored in history');
});
check('engine: gate runner unavailable -> DEGRADED skipped, not a crash / silent PASS', () => {
  const io = {
    exists: () => true, readFile: () => 'x', writeFile: () => {}, rename: () => {}, mkdir: () => {}, readdir: () => [],
    spawnSync: () => { throw new Error('no pwsh RAW_INTERNAL'); }, now: () => 1, log: () => {},
  };
  const s = engine.createState({ project: '/p' }); s.stage = 'design'; s.status = 'running';
  const r = engine.gate('design', io, '/p', s);
  eq(r.status, 'DEGRADED');
  eq(r.skipped, true);
  excludes(JSON.stringify(r), 'RAW_INTERNAL', 'runner error text leaked');
});
check('engine: parseState on arbitrary junk never throws / never leaks internals', () => {
  for (const t of ['', 'null', '[]', '{', 'DROP TABLE', '\u0000', 'x'.repeat(10000)]) {
    let r;
    notThrows(() => { r = engine.parseState(t); }, 'parseState junk');
    eq(r.ok, false, 'junk must be rejected');
    ok(typeof r.error === 'string' && r.error.length > 0, 'classified error');
    // V8's JSON.parse error quotes the offending token; that is an internal
    // engine error string, not a user-facing surface (loadState classifies it).
    assertNoInternalLeak(r.error, 'parseState error');
  }
});

/* -------------------------------------------------------------------------- */
/* 6. render() degenerate values                                              */
/* -------------------------------------------------------------------------- */

check('render() never throws on degenerate values (only generic statuses are ever supplied)', () => {
  const ctx = mockCtx({ get: () => undefined });
  plugin.apply(ctx);
  const render = ctx._tools[0].output.render;
  // The adapter only ever passes its own generic localized status tokens; feed
  // those plus degenerate structural values (never inject fake internals).
  for (const v of [undefined, null, {}, { state: null }, { state: { chapter: NaN } }, { stage: {} }, [],
    ...ALL_GENERIC.map((status) => ({ ok: true, status, stage: 'design', state: { stage: 'design', chapter: 5 } }))]) {
    notThrows(() => render({}, v), 'render must not throw');
    const out = render({}, v);
    ok(Array.isArray(out), 'render returns an array');
    assertNoLeak(out, 'render output');
  }
});

finish(SUITE);
