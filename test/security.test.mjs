/**
 * security.test.mjs — scan the WHOLE published tree for real credential values
 * and forbidden artifacts; assert the Host code makes no network calls and no
 * arbitrary path writes.
 *
 * "Published tree" = the plugin root minus docs/, market/, test/, .gitignore,
 * screenshots.json (metadata), i.e. what package.json `files` ships. We also
 * scan docs/market text for credential VALUES (they legitimately discuss names).
 *
 * Run: node test/security.test.mjs
 */
import {
  ROOT, ASSET_DSH, check, eq, ok, ne, truthy, falsy, match, noMatch, includes,
  excludes, deepEq, notThrows, readText, readJson, walk, exists, isFile,
  isDir, countBy, loadEngine, finish,
} from './_lib.mjs';
import { join, relative } from 'node:path';
import { readdirSync } from 'node:fs';

const SUITE = 'security';
const engine = await loadEngine();

// Exclude VCS metadata / editor scratch from the "shipped tree" scan: these
// belong to the working checkout, not to the plugin payload.
const ALL = walk(ROOT).filter((p) => !/^\.git(\/|$)/i.test(p) && !/\.idea\//i.test(p));
const pkg = readJson(join(ROOT, 'package.json'));

/* -------------------------------------------------------------------------- */
/* 0. Define the published tree from package.json `files`                     */
/* -------------------------------------------------------------------------- */

/** Files that are shipped by npm (package.json files globs, simplified). */
function isPublished(rel) {
  // Directories not part of the package payload.
  if (/^(docs|market|test)\//.test(rel)) return false;
  if (rel === 'docs' || rel === 'market' || rel === 'test') return false;
  // These are dev/metadata, not runtime payload (still scanned for secrets).
  if (rel === '.gitignore' || rel === 'screenshots.json') return false;
  return true;
}
const PUBLISHED = ALL.filter(isPublished);

check('published tree is non-empty and contains the runtime payload', () => {
  ok(PUBLISHED.length > 50, `only ${PUBLISHED.length} published files`);
  for (const f of ['index.js', 'cordis.patch.yml', 'package.json', 'lib/orchestrator.js']) {
    ok(PUBLISHED.includes(f), `missing ${f}`);
  }
});

/* -------------------------------------------------------------------------- */
/* 1. Forbidden artifacts (real credentials, caches, lockfiles, RE dumps)    */
/* -------------------------------------------------------------------------- */

const FORBIDDEN_EXACT = new Set([
  'assets/.dsh/scripts/fanqie-auth.json',
  'assets/.dsh/skills/site-fanqie/fanqienovel_auth.json',
  'assets/.dsh/skills/site-fanqie/publish_result.json',
  'assets/.dsh/skills/site-fanqie/package-lock.json',
]);
const FORBIDDEN_BASENAMES = [
  'fanqie-auth.json', 'fanqienovel_auth.json', 'publish_result.json',
  'package-lock.json', 'id_ed25519', 'id_rsa', 'id_ed25519.pub', 'id_rsa.pub',
  '.npmrc', 'credentials.json', 'secrets.json', '.env',
];
const FORBIDDEN_PATTERNS = [
  /\.pyc$/i, /__pycache__/i, /(^|\/)\.git(\/|$)/i, /node_modules/i,
  /main\.e63907e3\.js$/i, /writer_backend_api_report\.json$/i,
  /\.tgz$/i, /\.log$/i,
];

check('no EXACT forbidden credential/data file path exists in the tree', () => {
  for (const p of FORBIDDEN_EXACT) falsy(exists(join(ROOT, p)), `forbidden path present: ${p}`);
});
check('no forbidden basename anywhere in the published tree', () => {
  for (const rel of ALL) {
    const base = rel.split('/').pop();
    for (const f of FORBIDDEN_BASENAMES) ne(base, f, `forbidden file: ${rel}`);
  }
});
check('no forbidden artifact pattern (pyc/pycache/.git/node_modules/RE dump) in tree', () => {
  for (const rel of ALL) for (const re of FORBIDDEN_PATTERNS) noMatch(rel, re, `forbidden artifact: ${rel}`);
});

/* -------------------------------------------------------------------------- */
/* 2. No real credential VALUES                                               */
/* -------------------------------------------------------------------------- */

// These match a NON-EMPTY credential value. Empty templates ("") are allowed.
const CREDENTIAL_VALUE_PATTERNS = [
  { re: /"cookie"\s*:\s*"[^"]{8,}"/i, name: 'cookie' },
  { re: /"ms_?token"\s*:\s*"[^"]{8,}"/i, name: 'ms_token' },
  { re: /"msToken"\s*:\s*"[^"]{8,}"/i, name: 'msToken' },
  { re: /"session_?id"\s*:\s*"[^"]{8,}"/i, name: 'session_id' },
  { re: /"sessionid"\s*:\s*"[^"]{8,}"/i, name: 'sessionid' },
  { re: /"sid_guard"\s*:\s*"[^"]{8,}"/i, name: 'sid_guard' },
  { re: /"passport_csrf_token"\s*:\s*"[^"]{8,}"/i, name: 'passport_csrf_token' },
  { re: /"passport_mfa_token"\s*:\s*"[^"]{8,}"/i, name: 'passport_mfa_token' },
  { re: /"a_bogus"\s*:\s*"[^"]{8,}"/i, name: 'a_bogus' },
  { re: /"secsdk_token"\s*:\s*"[^"]{8,}"/i, name: 'secsdk_token' },
  { re: /"device_id"\s*:\s*"[^"]{8,}"/i, name: 'device_id' },
  { re: /"user_id"\s*:\s*"[^"]{8,}"/i, name: 'user_id' },
  { re: /"web_id"\s*:\s*"[^"]{8,}"/i, name: 'web_id' },
  { re: /"ttwid"\s*:\s*"[^"]{8,}"/i, name: 'ttwid' },
  { re: /"uid_tt"\s*:\s*"[^"]{8,}"/i, name: 'uid_tt' },
  { re: /verify_[A-Za-z0-9_-]{12,}/, name: 's_v_web_id verify_ token' },
  { re: /sessionid=[A-Za-z0-9_-]{12,}/i, name: 'sessionid= cookie value' },
  { re: /msToken=[A-Za-z0-9_%+-]{12,}/i, name: 'msToken= query value' },
  { re: /passport_csrf_token=[A-Za-z0-9_-]{12,}/i, name: 'csrf token value' },
  { re: /-----BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY-----/, name: 'private key' },
  { re: /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/, name: 'GitHub token' },
  { re: /sk-[A-Za-z0-9]{20,}/, name: 'OpenAI-style key' },
];

const SCANNABLE = /\.(json|json\.template|ya?ml|py|js|mjs|ps1|md|mdc|txt|yml|svg)$/i;

check('no real credential VALUE in any published text file', () => {
  for (const rel of PUBLISHED) {
    if (!SCANNABLE.test(rel)) continue;
    const text = readText(join(ROOT, rel));
    for (const { re, name } of CREDENTIAL_VALUE_PATTERNS) noMatch(text, re, `${name} in ${rel}`);
  }
});
check('no real credential VALUE in docs/market either (names are OK, values are not)', () => {
  for (const rel of ALL.filter((p) => /^(docs|market)\//.test(p))) {
    if (!SCANNABLE.test(rel)) continue;
    const text = readText(join(ROOT, rel));
    for (const { re, name } of CREDENTIAL_VALUE_PATTERNS) noMatch(text, re, `${name} in ${rel}`);
  }
});
check('no hardcoded token literals in the site-fanqie Python helpers', () => {
  const dir = join(ASSET_DSH, 'skills', 'site-fanqie', 'scripts');
  const files = walk(dir).filter((p) => p.endsWith('.py'));
  ok(files.length > 0, 'site-fanqie scripts present');
  for (const rel of files) {
    const text = readText(join(dir, rel));
    for (const { re, name } of CREDENTIAL_VALUE_PATTERNS) noMatch(text, re, `${name} in ${rel}`);
  }
});
check('the two shipped credential templates contain ONLY empty values + a note', () => {
  const templates = [
    'assets/.dsh/scripts/fanqie-auth.json.template',
    'assets/.dsh/skills/site-fanqie/fanqienovel_auth.json.template',
  ];
  for (const rel of templates) {
    const j = readJson(join(ROOT, rel));
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === 'string' && /(token|cookie|_id|bogus|secsdk)/i.test(k)) {
        eq(v, '', `non-empty credential field ${k} in ${rel}`);
      }
    }
    ok(Object.values(j).some((v) => typeof v === 'string' && /TEMPLATE|NO REAL CREDENTIALS/i.test(v)), `sanitization note missing in ${rel}`);
  }
});
check('.gitignore lists every real credential filename (never commit them)', () => {
  const gi = readText(join(ROOT, '.gitignore'));
  for (const f of ['fanqie-auth.json', 'fanqienovel_auth.json', 'publish_result.json', 'package-lock.json']) {
    includes(gi, f, `.gitignore must ignore ${f}`);
  }
});

/* -------------------------------------------------------------------------- */
/* 3. Host code: NO network calls                                             */
/* -------------------------------------------------------------------------- */

const HOST_CODE_FILES = ['index.js', 'lib/orchestrator.js'];
const NETWORK_PATTERNS = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bnode-fetch\b|\bundici\b|\baxios\b/,
  /require\(['"](?:http|https|net|tls|dgram)['"]\)/,
  /https?:\/\//,           // no URLs hardcoded in the engine/adapter
  /\bhttp\.request\b|\bhttps\.request\b/,
  /\bnet\.connect\b|\bnet\.createConnection\b/,
  /\bInvoke-WebRequest\b|\bcurl\b/,
];

check('Host adapter + engine contain ZERO network-call primitives', () => {
  for (const rel of HOST_CODE_FILES) {
    const text = readText(join(ROOT, rel));
    for (const re of NETWORK_PATTERNS) noMatch(text, re, `network pattern ${re} in ${rel}`);
  }
});
check('Host adapter imports only node: core modules (no third-party)', () => {
  for (const rel of HOST_CODE_FILES) {
    const text = readText(join(ROOT, rel));
    const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const spec of imports) {
      ok(spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../'), `non-core import ${spec} in ${rel}`);
    }
  }
});
check('package.json declares NO dependencies / devDependencies / peerDependencies', () => {
  for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    falsy(k in pkg, `package.json must not declare ${k}`);
  }
});
check('package.json has NO build/prepare/postinstall scripts (no arbitrary code on install)', () => {
  falsy('scripts' in pkg, 'scripts block must be absent');
});

/* -------------------------------------------------------------------------- */
/* 4. Host code: NO arbitrary path writes                                     */
/* -------------------------------------------------------------------------- */

const indexText = readText(join(ROOT, 'index.js'));
const engineText = readText(join(ROOT, 'lib', 'orchestrator.js'));

check('all writes in index.js go through fixed, project-relative paths', () => {
  // Materialization target is always join(projectRoot, '.dsh').
  includes(indexText, "join(projectRoot, '.dsh')", 'fixed .dsh target');
  // createIo closure from project; checkpoint path is fixed in engine.
  includes(indexText, "createIo(project)", 'io bound to project');
  // `process.cwd()` is a legitimate READ fallback for resolving the project
  // root; it must never be used as a WRITE target.
  noMatch(indexText, /writeFileSync\s*\([^)]*process\.cwd\(\)/, 'no write to ambient cwd');
  noMatch(indexText, /writeFileSync\s*\(\s*['"]\.\.\//, 'no traversal write');
  excludes(indexText, '..' + '/', 'no hardcoded traversal segment');
});
check('engine checkpoint path is a FIXED relative path under .dsh/state', () => {
  includes(engineText, "'.dsh/state'", 'checkpoint dir constant');
  includes(engineText, "'novel-mode.checkpoint.json'", 'checkpoint file constant');
  includes(engineText, "'novel-mode.checkpoint.corrupt.json'", 'backup file constant');
  // No writes to arbitrary absolute paths or drive letters.
  noMatch(engineText, /writeFile\s*\(\s*['"]\/(?!\*)/, 'no absolute POSIX write literal');
  noMatch(engineText, /[A-Za-z]:\\\\/, 'no hardcoded Windows drive path');
});
check('engine artifactPath rejects traversal / absolute / drive paths', () => {
  for (const bad of ['../etc', 'a/../../b', '/etc/passwd', 'C:\\x', 'a:b', 'a*b', 'a?b', 'a|b', 'a"b', 'a<b>']) {
    eq(engine.artifactPath('/p', bad), null, `artifactPath should reject ${bad}`);
  }
  eq(engine.artifactPath('/p', 'novel/outline.md'), '/p/novel/outline.md');
});
check('normalizeChapter rejects path traversal and non-integer chapter values', () => {
  for (const bad of [0, -1, 1.5, 100000, '../../1', '1/../../etc', 'abc', NaN, Infinity, null]) {
    eq(engine.normalizeChapter(bad).ok, false, `should reject ${String(bad)}`);
  }
});
check('gate() invokes scripts with -File + typed int args, NEVER -Command / string concat', () => {
  includes(engineText, "'-NoProfile'", '-NoProfile');
  includes(engineText, "'-File'", '-File');
  includes(engineText, "'-Chapter'", '-Chapter');
  excludes(engineText, "'-Command'", 'must not use -Command');
  // Chapter is normalized to an integer before becoming an argv element.
  includes(engineText, 'normalizeChapter(chapter)', 'chapter normalized');
});
check('gate() never returns raw stderr/stdout (classified failures only)', () => {
  match(engineText, /Raw stderr is NEVER returned to the caller/i, 'classification documented');
  includes(engineText, 'script-exit-', 'classified failure code');
  // The text var is used only to derive `code`; failures are classified strings.
  includes(engineText, '`script-exit-${code}`', 'classified failure format');
  eq(engine.normalizeChapter(7).ok, true);
});
check('Host adapter contains no prompt/persona/systemPrompt injection', () => {
  const combined = indexText + '\n' + readText(join(ROOT, 'cordis.patch.yml'));
  excludes(indexText, 'systemPrompt', 'no systemPrompt section registered');
  excludes(indexText, 'agent.inject(', 'no message injection');
  excludes(indexText, 'agent.followup(', 'no forced turn injection');
  excludes(combined, 'prefix:', 'no persona prefix in patch');
  excludes(combined, 'suffix:', 'no persona suffix in patch');
});

/* -------------------------------------------------------------------------- */
/* 5. No secrets leak through tool result (static projection checks)          */
/* -------------------------------------------------------------------------- */

check('Host adapter uses publicState/publicGate/publicPlan projections', () => {
  for (const fn of ['publicState', 'publicGate', 'publicPlan', 'statusOf']) {
    includes(indexText, `function ${fn}(`, `${fn} projection must exist`);
  }
  // The adapter never returns engine.summarize()/plan()/gate() raw results.
  noMatch(indexText, /:\s*engine\.summarize\(state\)\s*[,}]/, 'raw summarize must not be returned');
  includes(indexText, 'publicPlan(engine.plan(state))', 'plan is sanitized');
  includes(indexText, 'publicGate(verdict)', 'gate is sanitized');
});
check('publicPlan turns script path into a boolean presence flag only', () => {
  includes(indexText, 'out.gate = true', 'gate path replaced by boolean');
  includes(indexText, 'presence only, never the path', 'documented');
});
check('publicGate exposes only codes + failedCount, never failures array', () => {
  includes(indexText, 'failedCount: Array.isArray(verdict.failures)', 'count only');
  // Isolate the publicGate function body and assert it never emits a failures field.
  const body = indexText.slice(indexText.indexOf('function publicGate('), indexText.indexOf('function publicPlan('));
  excludes(body, 'failures:', 'publicGate must not project a failures field');
  includes(body, 'failedCount', 'publicGate projects only a count');
});

finish(SUITE);
