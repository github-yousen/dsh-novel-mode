/**
 * unit-skills.test.mjs — multi-angle verification of the 21 runtime skill
 * registrations produced by index.js apply(ctx) against a mock Cordis ctx.
 *
 * Run: node test/unit-skills.test.mjs
 */
import {
  ASSET_SKILLS, check, eq, ok, ne, match, noMatch,
  excludes, deepEq, notThrows, readText, isDir,
  isFile, mockCtx, loadPlugin, finish,
} from './_lib.mjs';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';

const SUITE = 'unit-skills';

// The canonical 21 skill names shipped under assets/.dsh/skills.
const EXPECTED_NAMES = [
  'agent-batch-designer', 'agent-batch-outliner', 'agent-book-analyzer',
  'agent-chapter-outliner', 'agent-chapter-summarizer', 'agent-constitution-extractor',
  'agent-continuity-validator', 'agent-novel-writer', 'agent-skeleton-rebuilder',
  'humanizer-zh', 'novel-batch', 'novel-constitution', 'novel-design',
  'novel-design-export', 'novel-disassemble', 'novel-downloader', 'novel-import',
  'novel-outline', 'novel-validate', 'novel-write', 'site-fanqie',
];
const NAME_OF_DIR = { 'Humanizer-zh': 'humanizer-zh' };
const DIR_OF_NAME = { 'humanizer-zh': 'Humanizer-zh' };
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const plugin = await loadPlugin();
const ctx = mockCtx({ get: () => undefined });
notThrows(() => plugin.apply(ctx), 'apply(ctx) must not throw with a minimal mock ctx');
const regs = ctx._skills;

check('plugin exports name === novel-mode', () => eq(plugin.name, 'novel-mode'));
check('inject includes skills', () => ok(Array.isArray(plugin.inject) && plugin.inject.includes('skills'), 'inject must list skills'));

check('exactly 21 skills registered', () => eq(regs.length, 21));
check('registered names === canonical 21 (sorted)', () =>
  deepEq(regs.map((r) => r.name).sort(), [...EXPECTED_NAMES].sort()));
check('no duplicate skill names', () => {
  const names = regs.map((r) => r.name);
  eq(new Set(names).size, names.length, 'duplicate registration names');
});
check('every name is valid kebab-case', () => {
  for (const r of regs) match(r.name, KEBAB, `name not kebab-case: ${r.name}`);
});
check('directory names map to skill names (Humanizer-zh special case)', () => {
  eq(regs.find((r) => r.name === 'humanizer-zh') !== undefined, true, 'humanizer-zh must be registered (not Humanizer-zh)');
  eq(regs.find((r) => r.name === 'Humanizer-zh'), undefined, 'Humanizer-zh dir name must not leak as a skill name');
});

/* ---- registration field shape (every single one) ---- */
check('every registration has source === runtime', () => {
  for (const r of regs) eq(r.source, 'runtime', `source for ${r.name}`);
});
check('invocation: ALL 21 skills modelInvocable, NONE user-invocable (panel-only form, Q14)', () => {
  // The panel is the sole user surface; no plugin skill reaches the `/` menu.
  for (const r of regs) {
    eq(r.invocation?.modelInvocable, true, `modelInvocable for ${r.name}`);
    eq(r.invocation?.userInvocable, false, `userInvocable for ${r.name}`);
  }
  // G10: block-scalar frontmatter must NOT become a 1-character description.
  for (const r of regs) {
    ok(r.description.length > 2, `description not a block-scalar indicator for ${r.name}`);
    ok(!/^[|>]$/.test(r.description), `description is real text for ${r.name}`);
  }
});
check('every registration has non-empty string content === trimmed SKILL.md body', () => {
  for (const r of regs) {
    ok(typeof r.content === 'string' && r.content.length > 0, `content empty for ${r.name}`);
    noMatch(r.content, /\s+$/, `content not trimEnd-ed for ${r.name}`);
    const dir = DIR_OF_NAME[r.name] ?? r.name;
    const body = readText(join(ASSET_SKILLS, dir, 'SKILL.md')).trimEnd();
    eq(r.content, body, `content mismatch for ${r.name}`);
  }
});
check('every registration has a non-empty description string', () => {
  for (const r of regs) {
    ok(typeof r.description === 'string' && r.description.trim().length > 0, `description empty for ${r.name}`);
    excludes(r.description, '\n', `description must be a single line for ${r.name}`);
  }
});
check('description is frontmatter-derived when present, else SKILL_DESCRIPTIONS fallback', () => {
  for (const r of regs) {
    const dir = DIR_OF_NAME[r.name] ?? r.name;
    const body = readText(join(ASSET_SKILLS, dir, 'SKILL.md'));
    const m = /^description:\s*(.+)$/m.exec(body);
    const fm = m && m[1].trim().replace(/^['"]|['"]$/g, '');
    if (fm === '|' || fm === '>') {
      // Block scalar: regex picks up the marker; the runtime uses it verbatim.
      // Assert it is still a non-empty single-line token (no prose dump).
      ok(r.description.length > 0 && !r.description.includes('\n'), `${r.name} block description must stay single-line`);
    } else if (fm && fm.length > 0) {
      eq(r.description, fm, `frontmatter description must win for ${r.name}`);
    } else {
      ok(r.description.length > 0, `fallback description must be non-empty for ${r.name}`);
    }
  }
});
check('whenToUse is a non-empty string', () => {
  for (const r of regs) ok(typeof r.whenToUse === 'string' && r.whenToUse.length > 0, `whenToUse for ${r.name}`);
});
check('whenToUse never equals a bare skill name placeholder', () => {
  for (const r of regs) ne(r.whenToUse, r.name, `whenToUse must be a routing hint, not the name, for ${r.name}`);
});

/* ---- resourceBase paths ---- */
check('every resourceBase is { kind: "directory", path: <abs> }', () => {
  for (const r of regs) {
    eq(r.resourceBase?.kind, 'directory', `resourceBase.kind for ${r.name}`);
    ok(typeof r.resourceBase?.path === 'string' && r.resourceBase.path.length > 0, `resourceBase.path for ${r.name}`);
  }
});
check('every resourceBase.path is absolute', () => {
  for (const r of regs) ok(/^[A-Za-z]:[\\/]|^[\\/]/.test(r.resourceBase.path), `not absolute: ${r.name} -> ${r.resourceBase.path}`);
});
check('every resourceBase.path points at the shipped skill directory', () => {
  for (const r of regs) {
    const dir = DIR_OF_NAME[r.name] ?? r.name;
    eq(r.resourceBase.path, join(ASSET_SKILLS, dir), `resourceBase.path for ${r.name}`);
  }
});
check('every resourceBase.path exists and is a directory containing SKILL.md', () => {
  for (const r of regs) {
    ok(isDir(r.resourceBase.path), `resourceBase dir missing for ${r.name}: ${r.resourceBase.path}`);
    ok(isFile(join(r.resourceBase.path, 'SKILL.md')), `SKILL.md missing in resourceBase for ${r.name}`);
  }
});
check('resourceBase paths are all distinct', () => {
  eq(new Set(regs.map((r) => r.resourceBase.path)).size, regs.length, 'two skills share one resourceBase');
});

/* ---- asset tree cross-check ---- */
check('assets/.dsh/skills contains exactly 21 SKILL.md files', () => {
  const dirs = readdirSync(ASSET_SKILLS, { withFileTypes: true }).filter((e) => e.isDirectory());
  const withSkill = dirs.filter((e) => isFile(join(ASSET_SKILLS, e.name, 'SKILL.md')));
  eq(withSkill.length, 21, 'skill directory count');
  eq(new Set(withSkill.map((e) => NAME_OF_DIR[e.name] ?? e.name)).size, 21, 'skill name uniqueness in tree');
});
check('every shipped skill directory is registered (no orphan)', () => {
  const dirs = readdirSync(ASSET_SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isFile(join(ASSET_SKILLS, e.name, 'SKILL.md')))
    .map((e) => NAME_OF_DIR[e.name] ?? e.name);
  for (const d of dirs) ok(regs.some((r) => r.name === d), `shipped skill not registered: ${d}`);
});
check('no skill body references an absolute host path (portable paths only)', () => {
  // Only match a real absolute path: a drive letter followed by a backslash,
  // or /Users/... /home/... at a token boundary (not inside a URL).
  const WIN_ABS = /(?:^|[\s"'=(])[A-Za-z]:\\/m;
  const POSIX_ABS = /(?:^|[\s"'=(])\/(?:Users|home)\/[a-z]/m;
  for (const r of regs) {
    noMatch(r.content, WIN_ABS, `absolute Windows path in ${r.name}`);
    noMatch(r.content, POSIX_ABS, `absolute POSIX path in ${r.name}`);
  }
});

/* ---- exactly one tool, no prompt surface ---- */
check('apply registers exactly one tool (novel_orchestrate)', () => {
  eq(ctx._tools.length, 1, 'tool count');
  eq(ctx._tools[0].name, 'novel_orchestrate');
});
check('apply registers the Client HTTP route + exactly ONE short tool-routing section', () => {
  // No preset listeners: materialization is now on-demand from drive().
  eq(ctx._events['agent/created'], undefined, 'no agent/created listener');
  eq(ctx._events['agent-preset/selected'], undefined, 'no preset/selected listener');
  ok(ctx._routes && ctx._routes.length >= 1, '/novel/api route registered');
  eq(ctx._routes[0].path, '/novel/api');
  eq(ctx._sections.length, 1, 'exactly one routing section');
  eq(ctx._sections[0].name, 'novel:mode-route');
  ok(ctx._sections[0].text.length < 900, 'routing section is short, not a workflow prompt group');
});
check('tool parameters is an object-rooted JSON Schema with additionalProperties:false', () => {
  const p = ctx._tools[0].parameters;
  eq(p.type, 'object');
  eq(p.additionalProperties, false);
  ok(p.properties && p.properties.action, 'action parameter missing');
  ok(Array.isArray(p.properties.action.enum), 'action enum missing');
});
check('tool action enum has no free-text action', () => {
  const en = ctx._tools[0].parameters.properties.action.enum;
  for (const a of en) match(a, /^[a-z][a-z-]*$/, `non-typed action: ${a}`);
});
check('tool output render never throws and returns text blocks', () => {
  const render = ctx._tools[0].output.render;
  const r1 = render({}, { ok: true, status: '就绪', stage: 'design', state: { stage: 'design' } });
  const r2 = render({}, {}); // degenerate input must not throw
  ok(Array.isArray(r1) && r1[0].type === 'text', 'render shape');
  ok(Array.isArray(r2), 'render with empty value must not throw');
});
check('tool render contains only generic status, never internals', () => {
  const text = ctx._tools[0].output.render({}, {
    ok: true, status: '就绪', stage: 'design',
    state: { stage: 'design', chapter: 5, batchStep: 'A' },
  }).map((b) => b.text).join('');
  excludes(text, 'stderr');
  excludes(text, 'exit-');
  excludes(text, 'pwsh');
  excludes(text, 'Error');
  excludes(text, 'script-exit');
});

finish(SUITE);
