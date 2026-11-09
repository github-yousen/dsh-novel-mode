/**
 * manifest.test.mjs — package.json / cordis.patch.yml / locale / files coverage.
 *
 * cordis.patch.yml is parsed with js-yaml loaded via createRequire from the
 * Desktop profile, registering a Type('tag:yaml.org,2002:js') custom tag so the
 * `!!js process.platform === 'win32'` scalars parse as strings (not throw).
 *
 * Run: node test/manifest.test.mjs
 */
import {
  ROOT, check, eq, ok, ne, truthy, falsy, match, noMatch, includes, excludes,
  deepEq, notThrows, readText, readJson, walk, exists, isFile, isDir,
  parsePatch, finish,
} from './_lib.mjs';
import { join } from 'node:path';

const SUITE = 'manifest';
const pkg = readJson(join(ROOT, 'package.json'));

/* -------------------------------------------------------------------------- */
/* 1. package.json: dsh.bundle / exports / files / engines / no deps         */
/* -------------------------------------------------------------------------- */

check('package.json name / version / type / license', () => {
  eq(pkg.name, '@yousen/dsh-novel-mode');
  match(pkg.version, /^\d+\.\d+\.\d+$/, 'semver version');
  eq(pkg.type, 'module', 'ESM');
  eq(pkg.license, 'MIT');
});
check('dsh.bundle.patch points at ./cordis.patch.yml (required by market CI)', () => {
  eq(pkg.dsh?.bundle?.patch, './cordis.patch.yml');
  ok(isFile(join(ROOT, 'cordis.patch.yml')), 'patch file exists');
});
check('NO dsh.client (Host-only bundle) and NO dsh.* extras beyond bundle', () => {
  falsy('client' in (pkg.dsh || {}), 'dsh.client must be absent');
  deepEq(Object.keys(pkg.dsh).sort(), ['bundle'], 'dsh has only bundle');
});
check('engines.dsh is declared and is a valid range', () => {
  const e = pkg.engines?.dsh;
  ok(typeof e === 'string' && e.length > 0, 'engines.dsh');
  match(e, />=0\.2/, 'supports 0.2.x');
  ok(!e.includes('undefined') && !e.includes('NaN'), 'no garbage');
});
check('package.json declares NO dependencies of any kind', () => {
  for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies']) {
    falsy(k in pkg, `must not declare ${k}`);
  }
});
check('package.json declares NO scripts (no build/install hooks)', () => {
  falsy('scripts' in pkg, 'no scripts block');
});
check('exports map covers ".", package.json, locale, icon, assets', () => {
  const x = pkg.exports || {};
  eq(x['.'], './index.js', 'main export');
  eq(x['./package.json'], './package.json');
  ok(x['./locale/*.json'], 'locale wildcard export');
  ok(x['./icon'], 'icon export');
  ok(x['./assets/*'], 'assets wildcard export');
  // Every export target resolves to a real file (or a real dir for wildcards).
  for (const [key, target] of Object.entries(x)) {
    if (key.includes('*')) continue;
    ok(isFile(join(ROOT, target)), `export ${key} -> ${target} missing`);
  }
});
check('files list covers every runtime payload file', () => {
  const files = pkg.files || [];
  for (const f of ['index.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'README.zh.md', 'LICENSE', 'CHANGELOG.md']) {
    ok(files.includes(f), `files must list ${f}`);
  }
  ok(files.some((f) => f.startsWith('lib/')), 'files must include lib/** (engine)');
  ok(files.some((f) => f.startsWith('assets/')), 'files must include assets/**');
  ok(files.some((f) => f.startsWith('locale/')), 'files must include locale/*.json');
  ok(files.includes('screenshots.json'), 'screenshots.json shipped');
});
check('every file referenced by exports/files exists', () => {
  for (const f of pkg.files) {
    if (f.includes('*')) continue;
    const p = join(ROOT, f);
    ok(exists(p), `files entry missing: ${f}`);
  }
});
check('icon.svg exists, is small, and is an SVG', () => {
  const p = join(ROOT, 'icon.svg');
  ok(isFile(p));
  const t = readText(p);
  match(t, /<svg[\s>]/i, 'SVG root');
  ok(t.length < 256 * 1024, 'icon under 256 KiB');
});
check('description / descriptionZh / keywords present and non-empty', () => {
  ok(typeof pkg.description === 'string' && pkg.description.length > 20);
  ok(typeof pkg.descriptionZh === 'string' && pkg.descriptionZh.length > 10);
  ok(Array.isArray(pkg.keywords) && pkg.keywords.includes('dsh-plugin'));
});
check('repository / homepage point at the plugin repo', () => {
  includes(pkg.repository.url, 'dsh-novel-mode', 'repository');
  includes(pkg.homepage, 'dsh-novel-mode', 'homepage');
});

/* -------------------------------------------------------------------------- */
/* 2. cordis.patch.yml — YAML parse with registered !!js tag                 */
/* -------------------------------------------------------------------------- */

const patchText = readText(join(ROOT, 'cordis.patch.yml'));
let patch;
check('cordis.patch.yml parses with js-yaml + !!js Type registered', () => {
  notThrows(() => { patch = parsePatch(patchText); }, 'YAML parse must not throw');
  ok(Array.isArray(patch) && patch.length >= 1, 'top-level array');
  ok(patch[0].insert && Array.isArray(patch[0].insert), 'first item has insert:');
});
check('patch has exactly the expected rows: 1 Host + 1 agent-preset', () => {
  const rows = patch[0].insert;
  eq(rows.length, 2, 'two rows');
  eq(rows[0].id, 'novel-mode');
  eq(rows[0].name, '@yousen/dsh-novel-mode');
  eq(rows[1].id, 'preset-novel');
  eq(rows[1].name, '@deepseek-ai/dsh-agent-preset');
});
check('preset row: id=novel, name=小说模式, has description + order + plugins', () => {
  const cfg = patch[0].insert[1].config;
  eq(cfg.id, 'novel');
  eq(cfg.name, '小说模式');
  ok(typeof cfg.description === 'string' && cfg.description.length > 0);
  ok(Number.isInteger(cfg.order), 'order integer');
  ok(Array.isArray(cfg.plugins) && cfg.plugins.length > 0, 'plugins list');
});
check('preset has NO persona / prompt-injection rows (lead rearchitecture)', () => {
  const rows = patch[0].insert[1].config.plugins;
  const text = patchText;
  // No persona plugin row.
  falsy(rows.some((r) => r.id === 'persona' || /dsh-persona/.test(r.name || '')), 'no persona row');
  // No persona prefix/suffix config (prompt dump).
  excludes(text, 'prefix:', 'no persona prefix');
  excludes(text, 'suffix:', 'no persona suffix');
  // No system-prompt section / injected workflow brief.
  excludes(text, 'systemPrompt', 'no systemPrompt section');
  excludes(text, '你正处于「小说模式」', 'no workflow prompt dump');
  excludes(text, 'prompt injection', 'no prompt injection');
});
check('!!js custom tags parse as STRINGS (not evaluated, not thrown)', () => {
  const rows = patch[0].insert[1].config.plugins;
  const jsRows = rows.filter((r) => typeof r.disabled === 'string');
  eq(jsRows.length, 2, 'two !!js disabled rows');
  for (const r of jsRows) {
    ok(r.disabled.startsWith('process.platform'), `!!js kept as source string: ${r.disabled}`);
    excludes(r.disabled, 'undefined');
  }
});
check('platform gating: bash disabled on win32, pwsh disabled elsewhere', () => {
  const rows = patch[0].insert[1].config.plugins;
  const bash = rows.find((r) => r.id === 'tool-bash');
  const pwsh = rows.find((r) => r.id === 'tool-pwsh');
  eq(bash.disabled, "process.platform === 'win32'");
  eq(pwsh.disabled, "process.platform !== 'win32'");
});
check('preset wires the standard tool set (file/shell/skill/subagent/web/...)', () => {
  const ids = patch[0].insert[1].config.plugins.map((r) => r.id);
  for (const id of ['tool-fs', 'tool-pwsh', 'tool-skill', 'tool-web', 'tool-todo', 'present']) {
    ok(ids.includes(id), `missing tool ${id}`);
  }
  ok(ids.includes('delegation'), 'delegation group for subagents');
});
check('preset carries NO custom button / command / tool contribution', () => {
  const text = patchText;
  excludes(text, 'dsh.client', 'no client half');
  excludes(text, 'slots.register', 'no UI slot button');
  excludes(text, 'command: novel', 'no slash command');
});
check('every patch row has id + name; no duplicate ids', () => {
  const rows = patch[0].insert[1].config.plugins;
  const allIds = [patch[0].insert[0].id, patch[0].insert[1].id, ...rows.map((r) => r.id)];
  eq(new Set(allIds).size, allIds.length, 'duplicate row ids');
  for (const r of rows) {
    ok(typeof r.id === 'string' && r.id.length > 0, 'row id');
    ok(typeof r.name === 'string' && r.name.length > 0, 'row name');
  }
});

/* -------------------------------------------------------------------------- */
/* 3. locale JSON validity + required fields                                  */
/* -------------------------------------------------------------------------- */

check('locale/en.json and locale/zh.json are valid JSON with meta.title + meta.description', () => {
  for (const loc of ['en', 'zh']) {
    const p = join(ROOT, 'locale', `${loc}.json`);
    ok(isFile(p), `locale/${loc}.json missing`);
    let j;
    notThrows(() => { j = readJson(p); }, `locale/${loc}.json must parse`);
    ok(j.meta && typeof j.meta === 'object', `${loc}: meta object`);
    ok(typeof j.meta.title === 'string' && j.meta.title.length > 0, `${loc}: meta.title`);
    ok(typeof j.meta.description === 'string' && j.meta.description.length > 0, `${loc}: meta.description`);
  }
});
check('locale en/zh titles are consistent (Novel mode / 小说模式)', () => {
  const en = readJson(join(ROOT, 'locale/en.json'));
  const zh = readJson(join(ROOT, 'locale/zh.json'));
  match(en.meta.title, /novel/i, 'en title');
  includes(zh.meta.title, '小说模式', 'zh title');
});
check('locale keys are exactly {meta:{title,description}} (no secret fields)', () => {
  for (const loc of ['en', 'zh']) {
    const j = readJson(join(ROOT, `locale/${loc}.json`));
    deepEq(Object.keys(j), ['meta'], `${loc}: only meta`);
    deepEq(Object.keys(j.meta).sort(), ['description', 'title'], `${loc}: meta keys`);
  }
});
check('locale descriptions are single-line (no prompt dumps)', () => {
  for (const loc of ['en', 'zh']) {
    const d = readJson(join(ROOT, `locale/${loc}.json`)).meta.description;
    excludes(d, '\n', `${loc}: no newline`);
    excludes(d, '{{', `${loc}: no template injection`);
  }
});

/* -------------------------------------------------------------------------- */
/* 4. screenshots.json + CHANGELOG / LICENSE / README presence                */
/* -------------------------------------------------------------------------- */

check('screenshots.json is an array of 1..8 existing relative image paths', () => {
  const s = readJson(join(ROOT, 'screenshots.json'));
  ok(Array.isArray(s) && s.length >= 1 && s.length <= 8, '1..8 entries');
  for (const p of s) {
    ok(isFile(join(ROOT, p)), `screenshot missing: ${p}`);
    match(p, /\.(png|jpe?g|webp)$/i, `raster image required: ${p}`);
  }
});
check('LICENSE / CHANGELOG.md / README.md / README.zh.md all exist', () => {
  for (const f of ['LICENSE', 'CHANGELOG.md', 'README.md', 'README.zh.md']) ok(isFile(join(ROOT, f)), `missing ${f}`);
});

finish(SUITE);
