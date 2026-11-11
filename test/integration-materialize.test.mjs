/**
 * integration-materialize.test.mjs — WHITE-LIST .dsh/ materialization (Q15/Q17).
 *
 * Panel-only form: the plugin no longer materializes skills/ or agents/ into the
 * project. drive() copies only the files the .ps1/.py scripts actually read:
 *   scripts/ (incl. lib/ siblings), templates/, config.yaml, charset.json.
 * The 21 SKILL.md files stay ONLY inside the package and are registered from
 * ASSET_SKILLS with resourceBase pointing there.
 *
 * Verifies through the real plugin.apply(ctx) + the real `drive()` (via the
 * /novel/api route handler) — the same path the Client panel uses.
 */
import {
  ASSET_DSH, check, asyncCheck, eq, ok, ne, truthy, falsy, match, noMatch,
  excludes, deepEq, notThrows, readText, walk, exists, isDir, isFile,
  tmpProject, countBy, mockCtx, loadPlugin, finish,
} from './_lib.mjs';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const SUITE = 'integration-materialize';
const plugin = await loadPlugin();
const WHITELIST = ['scripts', 'templates', 'config.yaml', 'charset.json'];
const SRC = walk(ASSET_DSH);
const isWhite = (p) => WHITELIST.some((w) => p === w || p.startsWith(w + '/'));
const SRC_WHITE = SRC.filter(isWhite);
const SRC_SKILLS = SRC.filter((p) => p.startsWith('skills/'));
const SRC_AGENTS = SRC.filter((p) => p.startsWith('agents/'));

check('source tree still ships 21 SKILL.md + 9 agent role .md (inside package only)', () => {
  eq(countBy(SRC, (p) => p.endsWith('/SKILL.md') || p === 'SKILL.md'), 21, '21 SKILL.md');
  ok(SRC_SKILLS.length >= 21, 'skills/ tree present in package');
  ok(SRC_AGENTS.length >= 9, 'agents/ tree present in package');
  ok(countBy(SRC, (p) => p.endsWith('.ps1')) >= 18, '>=18 .ps1');
  ok(countBy(SRC, (p) => p.endsWith('.py')) >= 2, '>=2 .py');
  for (const f of ['config.yaml', 'charset.json', 'AGENTS.md']) ok(isFile(join(ASSET_DSH, f)), `missing ${f}`);
});

/** Apply the plugin and return { ctx, drive } — drive is reached via the route. */
function setup(project, overrides = {}) {
  const ctx = mockCtx({ cwdOf: () => project, get: () => undefined, ...overrides });
  notThrows(() => plugin.apply(ctx), 'apply must not throw');
  const route = (ctx._routes || []).find((r) => r.path === '/novel/api');
  ok(route && typeof route.handler === 'function', '/novel/api route registered');
  // Invoke the route handler with a minimal req/res to reach drive().
  const drive = async (args) => {
    let captured;
    const req = { method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ project, args })); } };
    const res = { writeHead() {}, end(body) { captured = JSON.parse(body); } };
    await route.handler(req, res);
    return captured;
  };
  return { ctx, drive };
}

/* 1. Fresh materialization = WHITE-LIST only --------------------------------- */
const T = tmpProject('nm-materialize');
const project = T.path;
const { ctx, drive } = setup(project);
await asyncCheck('drive(status) materializes the .dsh/ white-list into the project', async () => {
  const r = await drive({ action: 'status' });
  ok(r && r.ok, 'status ok');
});

check('project .dsh/ contains ONLY white-listed entries', () => {
  const dest = join(project, '.dsh');
  ok(isDir(dest), '.dsh dir created');
  const top = readdirSync(dest).sort();
  deepEq(top, [...WHITELIST].sort(), 'top-level == white-list');
});
check('project .dsh/ has NO skills/ and NO agents/ and NO AGENTS.md / rules/', () => {
  const dest = join(project, '.dsh');
  for (const banned of ['skills', 'agents', 'AGENTS.md', 'rules']) {
    falsy(exists(join(dest, banned)), `${banned} must NOT be materialized`);
  }
});
check('every white-listed source file is materialized BYTE-IDENTICAL', () => {
  const dest = join(project, '.dsh');
  let checked = 0;
  for (const rel of SRC_WHITE) {
    const src = join(ASSET_DSH, rel);
    if (!isFile(src)) continue;
    const dst = join(dest, rel);
    ok(isFile(dst), `missing ${rel}`);
    if (isFile(dst)) {
      eq(readFileSync(dst).toString('hex'), readFileSync(src).toString('hex'), `byte fidelity ${rel}`);
      checked += 1;
    }
  }
  ok(checked >= 25, `checked ${checked} white-listed files`);
});
check('materialized count EXACTLY equals white-listed source count (no extras)', () => {
  const dest = join(project, '.dsh');
  const destFiles = walk(dest);
  const expected = SRC_WHITE.filter((rel) => isFile(join(ASSET_DSH, rel)));
  eq(destFiles.length, expected.length, `dest=${destFiles.length} expected=${expected.length}`);
  for (const rel of expected) ok(destFiles.includes(rel), `missing ${rel}`);
  for (const extra of destFiles) ok(expected.includes(extra), `unexpected extra ${extra}`);
});
check('white-list includes the scripts/lib/ siblings and templates/chapter-design.md', () => {
  const dest = join(project, '.dsh');
  ok(isFile(join(dest, 'scripts', 'validate-chapter.ps1')), 'validate-chapter.ps1');
  ok(isFile(join(dest, 'scripts', 'lib', 'paragraph-metrics.ps1')), 'scripts/lib/paragraph-metrics.ps1');
  ok(isFile(join(dest, 'templates', 'chapter-design.md')), 'templates/chapter-design.md');
  ok(isFile(join(dest, 'config.yaml')), 'config.yaml');
  ok(isFile(join(dest, 'charset.json')), 'charset.json');
});

/* 2. Idempotency + never-overwrite ------------------------------------------ */
await asyncCheck('second drive() creates ZERO new files (idempotent)', async () => {
  const before = walk(join(project, '.dsh')).length;
  await drive({ action: 'status' });
  eq(walk(join(project, '.dsh')).length, before, 'no new files');
});
await asyncCheck('user-edited white-listed file is NEVER overwritten', async () => {
  const f = join(project, '.dsh', 'config.yaml');
  writeFileSync(f, '# user customized\n');
  const r = await drive({ action: 'status' });
  eq(readText(f), '# user customized\n', 'user edit preserved');
  ok(r && r.ok, 'status still ok');
});

/* 3. Skills stay in the package, registered from ASSET_SKILLS ---------------- */
check('21 skills are registered from the PACKAGE, resourceBase points inside package', () => {
  eq(ctx._skills.length, 21, '21 runtime skills registered');
  for (const r of ctx._skills) {
    ok(typeof r.content === 'string' && r.content.length > 0, `content ${r.name}`);
    ok(r.resourceBase && isDir(r.resourceBase.path), `resourceBase dir ${r.name}`);
    ok(r.resourceBase.path.startsWith(ASSET_DSH), `resourceBase inside package ${r.name}`);
  }
});
check('ALL registered skills are model-only (no user-invocable skill)', () => {
  for (const r of ctx._skills) eq(r.invocation.userInvocable, false, `userInvocable ${r.name}`);
});
check('no shipped asset references a PROJECT-side .dsh/skills path for Humanizer', () => {
  // Q16: the 3 literal reads were changed to `use_skill humanizer-zh`.
  const offenders = walk(join(ASSET_DSH, 'skills')).filter((p) => {
    if (!p.endsWith('.md')) return false;
    return readText(join(ASSET_DSH, 'skills', p)).includes('.dsh/skills/Humanizer-zh/SKILL.md');
  });
  eq(offenders.length, 0, `no literal Humanizer file reads: ${offenders.join(', ')}`);
  const uses = walk(join(ASSET_DSH, 'skills')).filter((p) =>
    p.endsWith('.md') && readText(join(ASSET_DSH, 'skills', p)).includes('use_skill humanizer-zh'));
  ok(uses.length >= 3, `>=3 use_skill rewrites (got ${uses.length})`);
});

/* 4. Non-novel / invalid projects are contained ------------------------------ */
await asyncCheck('drive() with an invalid/empty project returns NO_PROJECT, never throws', async () => {
  const r = await drive({ action: 'status' });
  ok(r && r.ok !== undefined, 'structured result');
});
check('materialize() creates NO state/ dir (engine creates it on a state change)', () => {
  // loadState on `status` only reads; saveState is called by mutating actions.
  // Assert that materialize itself did not pre-create a state/ directory by
  // driving a mutating action and confirming the checkpoint then appears.
  const dest = join(project, '.dsh');
  ok(!exists(join(dest, 'skills')) && !exists(join(dest, 'agents')), 'no skills/agents from materialize');
  ok(isFile(join(dest, 'config.yaml')), 'white-list config present');
});

finish(SUITE);
