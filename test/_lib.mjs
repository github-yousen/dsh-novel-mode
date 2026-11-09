/**
 * Shared, dependency-free test infrastructure for the Novel Mode plugin suite.
 *
 * Every *.test.mjs is a standalone runnable script: `node test/<file>.test.mjs`.
 * It exits 0 when all its assertions pass, 1 otherwise. Output is a stable
 * machine-readable summary line plus human-readable detail.
 *
 * No npm dependencies are used. js-yaml (only needed by manifest.test.mjs) is
 * loaded lazily through createRequire from the Desktop profile package.json.
 */
import {
  existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
  rmSync, statSync, cpSync, lstatSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the plugin package root. */
export const ROOT = resolve(HERE, '..');
export const ASSET_DSH = join(ROOT, 'assets', '.dsh');
export const ASSET_SKILLS = join(ASSET_DSH, 'skills');

/* -------------------------------------------------------------------------- */
/* Assertion harness                                                          */
/* -------------------------------------------------------------------------- */

export class TestFailure extends Error {}

let PASSED = 0;
let FAILED = 0;
const FAILURES = [];

/** A named assertion group. Failures inside are collected, not thrown. */
export function check(name, fn) {
  try {
    const result = fn();
    if (result === false) throw new TestFailure('assertion returned false');
    PASSED += 1;
    return true;
  } catch (e) {
    FAILED += 1;
    const msg = e instanceof Error ? e.message : String(e);
    FAILURES.push(`${name}: ${msg}`);
    process.stdout.write(`  x ${name}\n    ${msg}\n`);
    return false;
  }
}

/** Async variant for tool.execute() calls. Awaits before recording the result. */
export async function asyncCheck(name, fn) {
  try {
    const result = await fn();
    if (result === false) throw new TestFailure('assertion returned false');
    PASSED += 1;
    return true;
  } catch (e) {
    FAILED += 1;
    const msg = e instanceof Error ? e.message : String(e);
    FAILURES.push(`${name}: ${msg}`);
    process.stdout.write(`  x ${name}\n    ${msg}\n`);
    return false;
  }
}

export function ok(cond, msg) {
  if (!cond) throw new TestFailure(msg || 'expected truthy value');
}
export function eq(actual, expected, msg) {
  if (actual !== expected) throw new TestFailure(`${msg || 'not equal'}: got ${inspect(actual)}, expected ${inspect(expected)}`);
}
export function ne(actual, forbidden, msg) {
  if (actual === forbidden) throw new TestFailure(`${msg || 'values must differ'}: both ${inspect(actual)}`);
}
export function deepEq(actual, expected, msg) {
  const a = stableStringify(actual);
  const b = stableStringify(expected);
  if (a !== b) throw new TestFailure(`${msg || 'deep not equal'}:\n    got ${a}\n    exp ${b}`);
}
export function truthy(v, msg) { ok(!!v, msg || `expected truthy, got ${inspect(v)}`); }
export function falsy(v, msg) { ok(!v, msg || `expected falsy, got ${inspect(v)}`); }
export function match(s, re, msg) { ok(re.test(String(s)), `${msg || 'no match'}: ${JSON.stringify(String(s).slice(0, 160))} vs ${re}`); }
export function noMatch(s, re, msg) { ok(!re.test(String(s)), `${msg || 'unexpected match'}: ${JSON.stringify(String(s).slice(0, 160))} vs ${re}`); }
export function includes(haystack, needle, msg) { ok(String(haystack).includes(needle), `${msg || 'missing substring'}: ${JSON.stringify(needle)}`); }
export function excludes(haystack, needle, msg) { ok(!String(haystack).includes(needle), `${msg || 'forbidden substring present'}: ${JSON.stringify(needle)}`); }
export function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  ok(threw, msg || 'expected function to throw');
}
export function notThrows(fn, msg) {
  try { fn(); } catch (e) { throw new TestFailure(`${msg || 'unexpected throw'}: ${e && e.message ? e.message : e}`); }
}

/** Stable stringify for deep comparison / round-trip checks. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}
function inspect(v) {
  if (typeof v === 'string') return JSON.stringify(v.length > 140 ? v.slice(0, 140) + '...' : v);
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
}

/* -------------------------------------------------------------------------- */
/* Filesystem helpers                                                         */
/* -------------------------------------------------------------------------- */

/** Create an isolated temp directory. Caller must dispose() it. */
export function tmpProject(label = 'nm-test') {
  const dir = mkdtempSync(join(tmpdir(), `${label}-`));
  return {
    path: dir,
    dispose() { try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* best effort */ } },
  };
}

/** Recursively list all files (relative posix-ish paths) under a directory. */
export function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, base));
    else if (entry.isFile()) out.push(relative(base, abs).split(sep).join('/'));
  }
  return out.sort();
}

export function readText(p) { return readFileSync(p, 'utf8'); }
export function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
export function exists(p) { return existsSync(p); }
export function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
export function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }
export function countBy(files, predicate) { return files.filter(predicate).length; }

/** Mark every file in a tree read-only (best effort; Windows ACLs may override). */
export function markReadOnly(dir) {
  for (const rel of walk(dir)) {
    try { chmodSync(join(dir, rel), 0o444); } catch { /* ignore */ }
  }
}
/** Restore write permission so rmSync can clean up on Windows. */
export function restoreWritable(dir) {
  for (const rel of walk(dir)) {
    try { chmodSync(join(dir, rel), 0o644); } catch { /* ignore */ }
  }
}

/** Copy a JS module tree (index.js + lib) to a temp dir with type:module. */
export function moduleOnlyCopy(extra = {}) {
  const t = tmpProject('nm-moduleonly');
  writeFileSync(join(t.path, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  cpSync(join(ROOT, 'index.js'), join(t.path, 'index.js'));
  mkdirSync(join(t.path, 'lib'), { recursive: true });
  const libDir = join(ROOT, 'lib');
  if (existsSync(libDir)) {
    for (const f of readdirSync(libDir)) cpSync(join(libDir, f), join(t.path, 'lib', f));
  }
  for (const [rel, content] of Object.entries(extra)) {
    const dest = join(t.path, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, 'utf8');
  }
  return t;
}

/* -------------------------------------------------------------------------- */
/* Mock ctx / io                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A mock Cordis ctx that records skill/tool registrations and event handlers.
 * Overrides: get(name), cwdOf(session), presetForSession(session), agentGet().
 */
export function mockCtx(overrides = {}) {
  const skills = [];
  const tools = [];
  const events = {};
  const o = overrides;
  return {
    skills: { register(d) { skills.push(d); return () => {}; } },
    tools: { register(d) { tools.push(d); return () => {}; } },
    on(name, fn) { (events[name] ||= []).push(fn); },
    get(name) {
      if (o.get) { const r = o.get(name); if (r !== undefined) return r; }
      if (name === 'workingDirectory') return { get: (session) => o.cwdOf ? o.cwdOf(session) : (session?.header?.cwd ?? session?.cwd) };
      if (name === 'agentPresets') return { presetForSession: (session) => o.presetForSession ? o.presetForSession(session) : 'novel' };
      if (name === 'agents') return { get: () => o.agentGet ? o.agentGet() : undefined };
      return undefined;
    },
    _skills: skills, _tools: tools, _events: events,
  };
}

/** In-memory io port matching docs/orchestration-research.md §4. */
export function mockIo(files = {}, opts = {}) {
  const store = new Map(Object.entries(files));
  const calls = { spawnSync: [], writeFile: [], rename: [], mkdir: [], readFile: [], exists: [] };
  const baseSpawn = opts.spawnSync || (() => ({ status: 0, stdout: '', stderr: '' }));
  return {
    store, calls,
    exists(p) { calls.exists.push(p); return store.has(p); },
    readFile(p) { calls.readFile.push(p); if (!store.has(p)) throw new Error('ENOENT'); return store.get(p); },
    writeFile(p, text) { calls.writeFile.push([p, text]); store.set(p, text); },
    rename(a, b) { calls.rename.push([a, b]); if (store.has(a)) { store.set(b, store.get(a)); store.delete(a); } },
    mkdir(p) { calls.mkdir.push(p); },
    readdir() { return []; },
    spawnSync(cmd, args, o) { calls.spawnSync.push([cmd, args]); return baseSpawn(cmd, args, o); },
    now: () => opts.now ?? 123456789,
    log: () => {},
  };
}

/* -------------------------------------------------------------------------- */
/* Plugin loader + js-yaml                                                    */
/* -------------------------------------------------------------------------- */

export async function loadPlugin() { return import(pathToFileURL(join(ROOT, 'index.js')).href); }
export async function loadEngine() { return import(pathToFileURL(join(ROOT, 'lib', 'orchestrator.js')).href); }

/** Load js-yaml via createRequire from the Desktop profile package.json. */
export function loadYaml() {
  const require = createRequire('C:/Users/altria/.dsh/profiles/desktop/package.json');
  return require('js-yaml');
}

/** Parse cordis.patch.yml with a registered !!js custom tag (kept as string). */
export function parsePatch(text) {
  const yaml = loadYaml();
  const JsType = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (data) => data });
  const schema = yaml.DEFAULT_SCHEMA.extend([JsType]);
  return yaml.load(text, { schema });
}

/* -------------------------------------------------------------------------- */
/* Suite finish                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Print the standard summary and set process.exitCode.
 * Every standalone suite MUST call finish() exactly once at the end.
 */
export function finish(suiteName) {
  const total = PASSED + FAILED;
  const status = FAILED === 0 ? 'PASS' : 'FAIL';
  process.stdout.write(`\n[${suiteName}] ${status} ${PASSED}/${total} assertions\n`);
  if (FAILED > 0) {
    process.stdout.write(`  ${FAILED} failure(s):\n`);
    for (const f of FAILURES) process.stdout.write(`    - ${f}\n`);
  }
  // Stable machine-readable line consumed by run-all.mjs
  process.stdout.write(`RESULT ${suiteName} ${status} ${PASSED} ${FAILED} ${total}\n`);
  process.exitCode = FAILED === 0 ? 0 : 1;
  return { passed: PASSED, failed: FAILED, total, status };
}
