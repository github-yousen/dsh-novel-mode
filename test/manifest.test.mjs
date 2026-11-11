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
check('dsh.client declares the Web Client half (panel-only form)', () => {
  ok('client' in (pkg.dsh || {}), 'dsh.client must be present');
  eq(pkg.dsh.client.platform, 'web');
  ok(Array.isArray(pkg.dsh.client.inject) && pkg.dsh.client.inject.length >= 1, 'client inject list');
  eq(pkg.exports?.['./client'], './client.js', './client export');
  ok(isFile(join(ROOT, 'client.js')), 'client.js exists');
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
check('patch has EXACTLY ONE Host row (no agent preset / no mode dropdown)', () => {
  const rows = patch[0].insert;
  eq(rows.length, 1, 'single row');
  eq(rows[0].id, 'novel-mode');
  eq(rows[0].name, '@yousen/dsh-novel-mode');
});
check('patch declares NO preset / persona / prompt-injection / client row', () => {
  const text = patchText;
  excludes(text, 'dsh-agent-preset', 'no agent preset row');
  excludes(text, '小说模式', 'no mode-display name in patch');
  excludes(text, 'prefix:', 'no persona prefix');
  excludes(text, 'suffix:', 'no persona suffix');
  excludes(text, '你正处于', 'no workflow prompt dump');
  excludes(text, 'prompt injection', 'no prompt injection');
});
check('every patch row has id + name; no duplicate ids', () => {
  const rows = patch[0].insert;
  const allIds = rows.map((r) => r.id);
  eq(new Set(allIds).size, allIds.length, 'duplicate row ids');
  for (const r of rows) {
    ok(typeof r.id === 'string' && r.id.length > 0, 'row id');
    ok(typeof r.name === 'string' && r.name.length > 0, 'row name');
  }
});
check('patch references no unresolvable deep subpath package', () => {
  for (const n of patch[0].insert.map((r) => r.name).filter(Boolean)) {
    ok(!/^@deepseek-ai\/dsh-[^/]+\/.+/.test(n), `no deep subpath package: ${n}`);
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

check('make-tarball.py wraps every entry in a single package/ prefix (pnpm-safe)', () => {
  // Upstream awesome-dsh-plugin PR #13689 maintainer feedback: pnpm strips the
  // first path segment when extracting a tgz, so a root-level layout flattens
  // lib/x.js -> x.js and the installed plugin cannot find its own files.
  const py = readText(join(ROOT, 'assets/make-tarball.py'));
  match(py, /PREFIX\s*=\s*["']package\/["']/, 'single package/ wrapper');
  match(py, /arcname\s*=\s*PREFIX\s*\+\s*rel/, 'arcname uses the wrapper');
  match(py, /assert\s+not\s+bad|assert\s+bad\s*==\s*\[\]/, 'asserts no entry lacks the prefix');
  noMatch(py, /arcname\s*=\s*rel\b/, 'must not add root-level arcname');
});

finish(SUITE);
