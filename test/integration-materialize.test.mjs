/**
 * integration-materialize.test.mjs — REAL .dsh/ materialization into isolated
 * tmpdirs, driven through the actual index.js apply(ctx) + silent
 * `agent-preset/selected` / `agent/created` listeners.
 *
 * Multi-angle: file counts by category, forbidden-file absence, credential
 * absence, byte-for-byte source fidelity, idempotency (second run creates 0),
 * never-overwrite, non-novel sessions untouched, failure containment, and the
 * sanitized (no-leak) tool result shape.
 *
 * Run: node test/integration-materialize.test.mjs
 */
import {
  ASSET_DSH, check, asyncCheck, eq, ok, ne, truthy, falsy, match, noMatch,
  excludes, deepEq, notThrows, readText, walk, exists, isDir, isFile,
  tmpProject, countBy, mockCtx, loadPlugin, finish,
} from './_lib.mjs';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SUITE = 'integration-materialize';
const plugin = await loadPlugin();

/* -------------------------------------------------------------------------- */
/* Canonical source counts (verified against the shipped assets tree)         */
/* -------------------------------------------------------------------------- */

const SRC = walk(ASSET_DSH);
// Templates: 8 FILES total = 7 *.md + 1 state.yaml (AC-41 ground truth).
const isTemplate = (p) => p.startsWith('templates/');
const isTemplateMd = (p) => p.startsWith('templates/') && p.endsWith('.md');
const isTemplateYaml = (p) => p.startsWith('templates/') && p.endsWith('.yaml');
const SRC_COUNTS = {
  skillMd: countBy(SRC, (p) => p.endsWith('/SKILL.md') || p === 'SKILL.md'),
  ps1: countBy(SRC, (p) => p.endsWith('.ps1')),
  py: countBy(SRC, (p) => p.endsWith('.py')),
  jsonTemplate: countBy(SRC, (p) => p.endsWith('.json.template')),
  mdc: countBy(SRC, (p) => p.endsWith('.mdc')),
  templates: countBy(SRC, isTemplate),
  templateMd: countBy(SRC, isTemplateMd),
  templateYaml: countBy(SRC, isTemplateYaml),
  agents: countBy(SRC, (p) => p.startsWith('agents/') && p.endsWith('.md')),
};

check('source assets tree has the documented counts (>= thresholds)', () => {
  eq(SRC_COUNTS.skillMd, 21, '21 SKILL.md');
  ok(SRC_COUNTS.ps1 >= 18, `>=18 .ps1 (got ${SRC_COUNTS.ps1})`);
  ok(SRC_COUNTS.py >= 2, `>=2 .py (got ${SRC_COUNTS.py})`);
  eq(SRC_COUNTS.jsonTemplate, 2, '2 .json.template');
  eq(SRC_COUNTS.templates, 8, '8 template files total');
  eq(SRC_COUNTS.templateMd, 7, '7 Markdown templates');
  eq(SRC_COUNTS.templateYaml, 1, '1 state.yaml skeleton');
  eq(SRC_COUNTS.mdc, 2, '2 .mdc rules');
  eq(SRC_COUNTS.agents, 9, '9 agent role definitions');
});
check('source has config.yaml, charset.json, AGENTS.md at .dsh root', () => {
  for (const f of ['config.yaml', 'charset.json', 'AGENTS.md']) ok(isFile(join(ASSET_DSH, f)), `missing ${f}`);
});

/* -------------------------------------------------------------------------- */
/* Helper: apply plugin with a project whose preset IS novel                  */
/* -------------------------------------------------------------------------- */

function setupNovelSession(project, overrides = {}) {
  const ctx = mockCtx({
    cwdOf: () => project,
    presetForSession: () => 'novel',
    agentGet: () => ({ session: { header: { cwd: project } } }),
    ...overrides,
  });
  notThrows(() => plugin.apply(ctx), 'apply must not throw');
  return ctx;
}

/** Fire the preset-selected listener (the real activation path). */
function selectNovel(ctx, sessionId = 'sess-1') {
  for (const fn of ctx._events['agent-preset/selected'] || []) fn(sessionId, 'novel');
}
/** Fire agent/created listener. */
function agentCreated(ctx, project) {
  for (const fn of ctx._events['agent/created'] || []) fn({ agent: { session: { header: { cwd: project } } } });
}

/* -------------------------------------------------------------------------- */
/* 1. Fresh materialization: counts + fidelity                                */
/* -------------------------------------------------------------------------- */

const T = tmpProject('nm-materialize');
const project = T.path;
const ctx = setupNovelSession(project);

check('listeners registered: agent/created + agent-preset/selected', () => {
  ok((ctx._events['agent/created'] || []).length >= 1, 'agent/created');
  ok((ctx._events['agent-preset/selected'] || []).length >= 1, 'agent-preset/selected');
});

check('before selection, project has NO .dsh directory', () => {
  falsy(exists(join(project, '.dsh')), 'precondition');
});

check('selecting the novel preset materializes .dsh/ silently (no throw)', () => {
  notThrows(() => selectNovel(ctx), 'preset listener must not throw');
  truthy(isDir(join(project, '.dsh')), '.dsh/ must exist');
});

const DEST = join(project, '.dsh');
const dst = walk(DEST);

check('materialized file count EXACTLY equals source asset count', () => {
  eq(dst.length, SRC.length, `source=${SRC.length} dest=${dst.length}`);
});
check('materialized relative path set EXACTLY equals source (no drops/extras)', () => {
  deepEq(dst, SRC, 'relative path sets must be identical');
});
check('every materialized file is BYTE-IDENTICAL to its source', () => {
  for (const rel of SRC) {
    const a = readFileSync(join(ASSET_DSH, rel));
    const b = readFileSync(join(DEST, rel));
    ok(Buffer.compare(a, b) === 0, `byte mismatch: ${rel}`);
  }
});

check('materialized: 21 SKILL.md', () => eq(countBy(dst, (p) => p.endsWith('/SKILL.md') || p === 'SKILL.md'), 21));
check('materialized: >=18 .ps1', () => ok(countBy(dst, (p) => p.endsWith('.ps1')) >= 18));
check('materialized: >=2 .py', () => ok(countBy(dst, (p) => p.endsWith('.py')) >= 2));
check('materialized: 2 .json.template', () => eq(countBy(dst, (p) => p.endsWith('.json.template')), 2));
check('materialized: 8 templates = 7 .md + 1 .yaml', () => {
  eq(countBy(dst, isTemplate), 8, '8 template files total');
  eq(countBy(dst, isTemplateMd), 7, '7 Markdown templates');
  eq(countBy(dst, isTemplateYaml), 1, '1 state.yaml skeleton');
});
check('materialized: 2 .mdc rules', () => eq(countBy(dst, (p) => p.endsWith('.mdc')), 2));
check('materialized: 9 agent role definitions', () => eq(countBy(dst, (p) => p.startsWith('agents/') && p.endsWith('.md')), 9));
check('materialized: config.yaml / charset.json / AGENTS.md present', () => {
  for (const f of ['config.yaml', 'charset.json', 'AGENTS.md']) ok(isFile(join(DEST, f)), `missing ${f}`);
});

/* -------------------------------------------------------------------------- */
/* 2. Forbidden artifacts / credentials                                       */
/* -------------------------------------------------------------------------- */

const FORBIDDEN_BASENAMES = [
  'fanqie-auth.json', 'fanqienovel_auth.json', 'publish_result.json',
  'package-lock.json', 'id_ed25519', 'id_rsa', '.npmrc',
];
const FORBIDDEN_PATTERNS = [
  /\.pyc$/i, /__pycache__/i, /\.git\b/i, /node_modules/i,
  /main\.e63907e3\.js$/i, /writer_backend_api_report\.json$/i,
];

check('no forbidden credential/data artifacts in materialized tree', () => {
  for (const rel of dst) {
    const base = rel.split('/').pop();
    for (const f of FORBIDDEN_BASENAMES) ne(base, f, `forbidden file ${rel}`);
    for (const re of FORBIDDEN_PATTERNS) noMatch(rel, re, `forbidden artifact ${rel}`);
  }
});
check('no real credential VALUES anywhere in the materialized tree', () => {
  const VALUE_PATTERNS = [
    /"cookie"\s*:\s*"[^"]{8,}"/i,
    /"ms_?token"\s*:\s*"[^"]{8,}"/i,
    /"session_?id"\s*:\s*"[^"]{8,}"/i,
    /"a_bogus"\s*:\s*"[^"]{8,}"/i,
    /"secsdk_token"\s*:\s*"[^"]{8,}"/i,
    /"device_id"\s*:\s*"[^"]{8,}"/i,
    /"user_id"\s*:\s*"[^"]{8,}"/i,
    /"web_id"\s*:\s*"[^"]{8,}"/i,
    /verify_[A-Za-z0-9_-]{10,}/,
    /sessionid=[A-Za-z0-9_-]{10,}/i,
    /passport_csrf_token=[A-Za-z0-9_-]{8,}/i,
  ];
  for (const rel of dst) {
    if (!/\.(json|json\.template|ya?ml|py|js|ps1|md|mdc|txt)$/i.test(rel)) continue;
    const text = readText(join(DEST, rel));
    for (const re of VALUE_PATTERNS) noMatch(text, re, `credential-like value in ${rel}`);
  }
});
check('the two credential templates contain ONLY empty credential values', () => {
  const t1 = JSON.parse(readText(join(DEST, 'scripts/fanqie-auth.json.template')));
  const t2 = JSON.parse(readText(join(DEST, 'skills/site-fanqie/fanqienovel_auth.json.template')));
  for (const k of ['msToken', 'session_id', 'device_id', 'user_id', 'web_id']) eq(t1[k], '', `t1.${k}`);
  for (const k of ['cookie', 'ms_token', 'a_bogus', 'secsdk_token']) eq(t2[k], '', `t2.${k}`);
  match(t1._note, /TEMPLATE/i);
  match(t2.note, /TEMPLATE/i);
});

/* -------------------------------------------------------------------------- */
/* 3. Idempotency: second run creates 0 new files, content unchanged          */
/* -------------------------------------------------------------------------- */

check('re-selecting the same preset is idempotent (0 new files)', () => {
  const before = walk(DEST);
  notThrows(() => selectNovel(ctx, 'sess-2'));
  notThrows(() => agentCreated(ctx, project));
  const after = walk(DEST);
  deepEq(after, before, 'no new files on second activation');
});
check('re-selection does not change any file bytes', () => {
  const snapshots = new Map(SRC.map((rel) => [rel, readFileSync(join(DEST, rel))]));
  selectNovel(ctx, 'sess-3');
  for (const rel of SRC) {
    ok(Buffer.compare(snapshots.get(rel), readFileSync(join(DEST, rel))) === 0, `byte changed on re-run: ${rel}`);
  }
});

/* -------------------------------------------------------------------------- */
/* 4. Never overwrite existing project files                                  */
/* -------------------------------------------------------------------------- */

check('materialize NEVER overwrites a pre-existing .dsh file', () => {
  const U = tmpProject('nm-nooverwrite');
  const pre = join(U.path, '.dsh', 'config.yaml');
  mkdirSync(join(U.path, '.dsh'), { recursive: true });
  const marker = '# USER-OWNED CONFIG — MUST NOT BE OVERWRITTEN\n';
  writeFileSync(pre, marker, 'utf8');
  const c = setupNovelSession(U.path);
  notThrows(() => selectNovel(c));
  eq(readText(pre), marker, 'pre-existing config.yaml must be preserved verbatim');
  // ...while the rest of the tree still materializes.
  ok(isFile(join(U.path, '.dsh', 'charset.json')), 'other assets still copied');
  U.dispose();
});
check('materialize preserves a pre-existing SKILL.md edit', () => {
  const U = tmpProject('nm-nooverwrite-skill');
  const skillDir = join(U.path, '.dsh', 'skills', 'novel-write');
  mkdirSync(skillDir, { recursive: true });
  const marker = '# USER EDIT — KEEP ME\n';
  writeFileSync(join(skillDir, 'SKILL.md'), marker, 'utf8');
  const c = setupNovelSession(U.path);
  notThrows(() => selectNovel(c));
  eq(readText(join(skillDir, 'SKILL.md')), marker, 'user-edited SKILL.md preserved');
  U.dispose();
});

/* -------------------------------------------------------------------------- */
/* 5. Non-novel sessions untouched / other presets untouched                  */
/* -------------------------------------------------------------------------- */

check('a session whose preset is NOT novel does NOT get .dsh materialized', () => {
  const U = tmpProject('nm-othernovel');
  const c = mockCtx({
    cwdOf: () => U.path,
    presetForSession: () => 'standard',
    agentGet: () => ({ session: { header: { cwd: U.path } } }),
  });
  plugin.apply(c);
  notThrows(() => agentCreated(c, U.path));
  falsy(exists(join(U.path, '.dsh')), 'non-novel agent/created must be a no-op');
  U.dispose();
});
check('agent-preset/selected with a NON-novel preset id does nothing', () => {
  const U = tmpProject('nm-otherpreset');
  const c = setupNovelSession(U.path);
  for (const fn of c._events['agent-preset/selected'] || []) fn('sid', 'standard');
  for (const fn of c._events['agent-preset/selected'] || []) fn('sid', 'some-other-preset');
  falsy(exists(join(U.path, '.dsh')), 'wrong preset must not materialize');
  U.dispose();
});
check('materialization for one project does NOT touch a sibling project', () => {
  const U = tmpProject('nm-sibling');
  const a = join(U.path, 'projA');
  const b = join(U.path, 'projB');
  mkdirSync(a, { recursive: true }); mkdirSync(b, { recursive: true });
  const c = setupNovelSession(a);
  notThrows(() => selectNovel(c));
  ok(isDir(join(a, '.dsh')), 'target A materialized');
  falsy(exists(join(b, '.dsh')), 'sibling B must be untouched');
  U.dispose();
});
check('agent/created with agent===undefined is a silent no-op', () => {
  const c = setupNovelSession(project);
  notThrows(() => { for (const fn of c._events['agent/created'] || []) fn({ agent: undefined }); });
});

/* -------------------------------------------------------------------------- */
/* 6. Tool result shape: sanitized (no internals)                             */
/* -------------------------------------------------------------------------- */

const tool = ctx._tools[0];
const exec = { agent: { session: { header: { cwd: project } } } };

await asyncCheck('tool status result contains ONLY bounded structured state (no leaks)', async () => {
  const r = await tool.execute({ action: 'status', locale: 'zh' }, exec);
  eq(r.ok, true);
  ok(typeof r.status === 'string' && r.status.length > 0, 'generic status token');
  // No raw internals anywhere in the serialized result.
  const out = JSON.stringify(r);
  for (const forbidden of ['.ps1', 'stderr', 'script-exit', 'exception', 'Error:', 'at Object', 'RAW', 'novel-mode.checkpoint']) {
    excludes(out, forbidden, `leaked ${forbidden}`);
  }
});
await asyncCheck('tool state is the sanitized publicState projection (gate has no failures array)', async () => {
  const r = await tool.execute({ action: 'status', locale: 'en' }, exec);
  ok(r.state && typeof r.state === 'object', 'state present');
  ok('stage' in r.state && 'status' in r.state && 'historyLength' in r.state, 'bounded fields');
  falsy('recent' in r.state, 'publicState must drop raw recent history');
  falsy('recentLog' in r.state, 'publicState must drop raw recent log');
  if (r.state.gate) {
    falsy('failures' in r.state.gate, 'gate.failures must not be public');
    ok('failedCount' in r.state.gate, 'gate exposes only failedCount');
  }
  if (r.next) {
    if (r.next.gate) eq(r.next.gate, true, 'plan.gate is boolean presence only, never a script path');
    excludes(JSON.stringify(r.next), '.ps1', 'no script path in next');
  }
});
await asyncCheck('gate-fail with caller-supplied raw strings never echoes them back', async () => {
  const r = await tool.execute({ action: 'gate-fail', failures: ['RAW INTERNAL STDERR', 'script-exit-9'], locale: 'en' }, exec);
  excludes(JSON.stringify(r), 'RAW INTERNAL STDERR', 'raw caller text leaked');
  excludes(JSON.stringify(r), 'script-exit-9', 'caller-coded failure leaked');
  ok(typeof r.status === 'string', 'generic status');
});
check('render() never includes internals, even with a rich state value', () => {
  const text = tool.output.render({}, {
    ok: true, status: '就绪', stage: 'design',
    state: { stage: 'design', chapter: 5, batchStep: 'A', gate: { verdict: 'FAIL' } },
    next: { gate: true, skill: 'novel-design' },
  }).map((b) => b.text).join('');
  for (const f of ['stderr', '.ps1', 'pwsh', 'Error', 'exception', 'RAW']) excludes(text, f, `render leaked ${f}`);
});
await asyncCheck('multiple concurrent status calls are all ok and leak nothing', async () => {
  const rs = await Promise.all(Array.from({ length: 8 }, () => tool.execute({ action: 'status' }, exec)));
  for (const r of rs) {
    eq(r.ok, true);
    excludes(JSON.stringify(r), '.ps1', 'concurrent leak');
  }
});

/* -------------------------------------------------------------------------- */
/* 7. agent/created activation path (separate from preset/selected)            */
/* -------------------------------------------------------------------------- */

check('agent/created also materializes for a novel-preset session', () => {
  const U = tmpProject('nm-created');
  const c = setupNovelSession(U.path);
  notThrows(() => agentCreated(c, U.path));
  ok(isDir(join(U.path, '.dsh')), 'agent/created must materialize');
  eq(countBy(walk(join(U.path, '.dsh')), (p) => p.endsWith('SKILL.md')), 21, '21 SKILL.md');
  U.dispose();
});

T.dispose();
finish(SUITE);
