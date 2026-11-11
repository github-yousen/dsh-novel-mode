/**
 * marketing.test.mjs — README / catalog / PR-body consistency against ACTUAL
 * code facts. Rejects stale "button / command / prompt injection" claims,
 * verifies descriptions match the shipped engine, requires en + zh, and blocks
 * superlatives that contradict the code.
 *
 * Marketing surfaces scanned:
 *   README.md, README.zh.md, package.json (description/descriptionZh),
 *   market/data/plugins/*.yml, market/PR_BODY.md, market/PR_TITLE.md,
 *   market/index-snippet.json, market/INSTALL.md, CHANGELOG.md
 *
 * Research docs (docs/*) are NOT marketing surfaces: they legitimately discuss
 * rejected/historical designs, so they are excluded from the stale-claim scan.
 *
 * Run: node test/marketing.test.mjs
 */
import {
  ROOT, check, eq, ok, ne, truthy, falsy, match, noMatch, includes, excludes,
  deepEq, notThrows, readText, readJson, walk, exists, isFile, finish,
} from './_lib.mjs';
import { join } from 'node:path';

const SUITE = 'marketing';

const pkg = readJson(join(ROOT, 'package.json'));
const engineText = readText(join(ROOT, 'lib', 'orchestrator.js'));
const indexText = readText(join(ROOT, 'index.js'));
const patchText = readText(join(ROOT, 'cordis.patch.yml'));

const SURFACES = [
  'README.md', 'README.zh.md',
  'market/data/plugins/github-yousen__dsh-novel-mode.yml',
  'market/PR_BODY.md', 'market/PR_TITLE.md',
  'market/index-snippet.json', 'market/INSTALL.md',
  'CHANGELOG.md',
];
const texts = {};
for (const rel of SURFACES) {
  if (isFile(join(ROOT, rel))) texts[rel] = readText(join(ROOT, rel));
}
const all = () => Object.entries(texts);

/* Ground-truth code facts (verified against lib/orchestrator.js + index.js). */
const FACTS = {
  stageCount: 7,                       // constitution..export (excl. bootstrap + done)
  subSteps: 15,                       // BATCH_SUBSTEPS
  skills: 21,
  roles: 9,
  templatesMd: 7,
  templatesYaml: 1,
  rules: 2,
  version: pkg.version,
  engineFile: 'lib/orchestrator.js',
  tool: 'novel_orchestrate',
};

check('all marketing surfaces exist', () => {
  for (const rel of SURFACES) ok(isFile(join(ROOT, rel)), `missing marketing surface ${rel}`);
});

/* -------------------------------------------------------------------------- */
/* 1. No stale claims: button / slash command / prompt injection               */
/* -------------------------------------------------------------------------- */

// Claims that the plugin ADDS a button / command / prompt injection are stale:
// the shipped product is a mode-dropdown preset + a quiet tool.
const STALE_CLAIM_PATTERNS = [
  /adds? (?:a|the) (?:custom )?button/i,
  /composer button/i,
  /click(?:able)? (?:mode )?button/i,
  /slash command/i,
  /bundled commands/i,
  /auto-started (?:prompt|workflow)/i,
  /prompt injection (?:is|contributes|added)/i,
  /一键进入/i,
];
// Phrases that are legitimate when NEGATED ("no custom button", "no slash
// command"). We strip negated sentences before scanning.
function stripNegations(s) {
  return s
    .replace(/no (?:custom )?(?:button|slash command|command|prompt)[^.\n]*[.\n]/gi, '')
    .replace(/not (?:a|the) (?:button|command|prompt)[^.\n]*[.\n]/gi, '')
    .replace(/不额外添加[^。\n]*[。\n]/g, '')
    .replace(/不(?:提供|添加|注入)[^。\n]*[。\n]/g, '')
    .replace(/No custom button[^.\n]*[.\n]/gi, '')
    .replace(/No (?:persona|system-prompt|command|button)[^.\n]*[.\n]/gi, '')
    // "Removed the /novel command, novel_mode tool, composer button and
    //  client.js from earlier builds" — a historical removal, not a claim.
    .replace(/(?:Removed|removed|Deleted|deleted) the [^.\n]*?(?:button|command|command,)[^.\n]*[.\n]/g, '')
    .replace(/from earlier builds[^\n]*\n/g, '');
}

check('no stale "adds a button / slash command / prompt injection" claims in marketing copy', () => {
  for (const [rel, text] of all()) {
    const stripped = stripNegations(text);
    for (const re of STALE_CLAIM_PATTERNS) noMatch(stripped, re, `stale claim in ${rel}`);
  }
});
check('marketing describes the UI as ONLY the mode dropdown (no extra button/command surface)', () => {
  const en = texts['README.md'] || '';
  const zh = texts['README.zh.md'] || '';
  // Current copy: "Select 小说模式 in the session's mode dropdown. That is the
  // entire UI." — the semantic equivalent of "no custom button/command".
  match(en, /mode dropdown/i, 'README en names the mode dropdown');
  match(en, /That is the entire UI|The entire UI/i, 'README en: dropdown is the entire UI');
  match(en, /no prompt text shown|no errors leaked/i, 'README en: no prompt/error surface');
  match(zh, /模式下拉框/, 'README zh names the mode dropdown');
  match(zh, /整个 UI/, 'README zh: dropdown is the entire UI');
  match(zh, /不展示提示词|不外泄错误/, 'README zh: no prompt/error surface');
});
check('PR body states no persona / no prompt dump surface', () => {
  const b = texts['market/PR_BODY.md'] || '';
  match(b, /No persona prose/i, 'PR body no-persona claim');
  match(b, /no workflow brief/i, 'PR body no-workflow-brief claim');
  match(b, /no prompt dumps/i, 'PR body no-prompt-dump claim');
  match(b, /renders only/i, 'PR body bounded-render claim');
});
check('cordis.patch.yml has NO persona / prompt-injection row (code, not just copy)', () => {
  excludes(patchText, 'dsh-persona', 'no persona plugin row');
  excludes(patchText, 'prefix:', 'no persona prefix');
  excludes(patchText, 'suffix:', 'no persona suffix');
  // Host adapter may contain ONE short named tool-routing section, never a
  // workflow brief / persona dump (see security.test.mjs for the strict check).
  eq([...indexText.matchAll(/name:\s*'novel:mode-route'/g)].length, 1, 'exactly one routing section');
});

/* -------------------------------------------------------------------------- */
/* 2. Descriptions match actual code facts                                    */
/* -------------------------------------------------------------------------- */

check('package.json description matches the shipped deterministic engine', () => {
  match(pkg.description, /deterministic/i, 'description says deterministic');
  match(pkg.description, /engine|state machine/i, 'description says engine/state machine');
  match(pkg.descriptionZh, /引擎|状态机/, 'zh description says engine/state machine');
  // No stale "just a preset + skills" framing.
  match(pkg.description, /workflow ENGINE/i, 'uppercase ENGINE emphasis');
});
check('catalog YAML descriptions (en + zh) describe the engine, not a preset-only entity', () => {
  const y = texts['market/data/plugins/github-yousen__dsh-novel-mode.yml'];
  match(y, /\ben:\s*'/, 'en description key');
  match(y, /\bzh:\s*'/, 'zh description key');
  match(y, /state machine|ENGINE/i, 'engine claim');
  match(y, /7 gated|7 .*stages|7 个/i, '7-stage claim');
  match(y, /15-step|15 步/i, '15-step sub-FSM claim');
});
check('catalog YAML en/zh descriptions are quoted (colon-space safety)', () => {
  const y = texts['market/data/plugins/github-yousen__dsh-novel-mode.yml'];
  match(y, /en:\s*'/, 'en quoted');
  match(y, /zh:\s*'/, 'zh quoted');
});
check('every numeric claim in marketing copy is backed by the code', () => {
  // 21 skills / 9 roles / 15 substeps / 7 gated stages / 7 md templates + 1 yaml.
  // Verify the code exposes these numbers first.
  const gated = ['constitution', 'outline', 'design', 'write', 'validate', 'batch', 'export'];
  for (const s of gated) match(engineText, new RegExp(`'${s}'`), `stage ${s} in code`);
  const substepMatches = [...engineText.matchAll(/\{\s*id:\s*'[A-Z0-9]+'/g)];
  ok(substepMatches.length >= 15, `BATCH_SUBSTEPS has >=15 entries (got ${substepMatches.length})`);
  // Marketing must not claim a DIFFERENT stage/substep count.
  for (const [rel, text] of all()) {
    const stages = [...text.matchAll(/(\d+)\s*(?:gated\s*)?(?:top-level\s*)?stages?/gi)];
    for (const m of stages) {
      const n = Number(m[1]);
      ok([7, 9, 11].includes(n), `${rel} claims ${n} stages (code: 7 gated / 11 total)`);
    }
  }
});
check('README capability numbers match the recounted shipped tree (AC-41)', () => {
  const en = texts['README.md'];
  const zh = texts['README.zh.md'];
  for (const [label, t] of [['en', en], ['zh', zh]]) {
    match(t, /21 skills|21 个技能/, `${label}: 21 skills`);
    match(t, /9 subagent|9 个子代理/, `${label}: 9 subagent roles`);
    match(t, /7 Markdown templates|7 .*模板/, `${label}: 7 Markdown templates`);
    match(t, /state\.yaml skeleton|state\.yaml/, `${label}: state.yaml skeleton`);
    match(t, /2 rule sets|2 套规则|2 .*规则/, `${label}: 2 rule sets`);
  }
});
check('README does NOT claim "8 templates" (corrected: 7 md + 1 yaml)', () => {
  for (const [rel, text] of all()) {
    noMatch(text, /8 templates|8 个模板/, `stale "8 templates" in ${rel}`);
  }
});
check('marketing copy references the real engine file and tool name', () => {
  const en = texts['README.md'];
  match(en, /lib\/orchestrator\.js/, 'README names the engine file');
  match(en, /STAGE_GRAPH/, 'README names STAGE_GRAPH');
  match(en, /novel_orchestrate/, 'README names the tool');
  const pr = texts['market/PR_BODY.md'];
  match(pr, /lib\/orchestrator\.js/, 'PR body names the engine file');
  match(pr, /novel_orchestrate/, 'PR body names the tool');
});
check('marketing describes script-gated stages / checkpoints / adjudication that the code implements', () => {
  const en = texts['README.md'];
  match(en, /checkpoint|resume/i, 'checkpoint/resume claim');
  match(en, /evidence|adjudicat/i, 'adjudication claim');
  // And the code really has these symbols.
  for (const sym of ['saveState', 'loadState', 'adjudicate', 'stageGuard', 'gate']) {
    includes(engineText, `export function ${sym}`, `engine exports ${sym}`);
  }
});

/* -------------------------------------------------------------------------- */
/* 3. en + zh both present                                                    */
/* -------------------------------------------------------------------------- */

check('README.md (en) and README.zh.md (zh) both exist and cross-link', () => {
  ok(isFile(join(ROOT, 'README.md')) && isFile(join(ROOT, 'README.zh.md')));
  match(texts['README.md'], /\[中文|中文说明|中文\]/, 'en links to zh');
  match(texts['README.zh.md'], /\[English|English\]/, 'zh links to en');
});
check('README en has substantial English prose; zh has substantial Chinese prose', () => {
  const en = texts['README.md'];
  const zh = texts['README.zh.md'];
  const cjk = (s) => (s.match(/[\u4e00-\u9fff]/g) || []).length;
  ok(cjk(zh) > 200, `zh has CJK content (${cjk(zh)} chars)`);
  ok(en.length > 1500, `en has English content (${en.length} chars)`);
});
check('catalog YAML has BOTH description.en and description.zh (market CI)', () => {
  const y = texts['market/data/plugins/github-yousen__dsh-novel-mode.yml'];
  match(y, /en:\s*'[^']+'/s, 'non-empty en');
  match(y, /zh:\s*'[^']+'/s, 'non-empty zh');
});
check('index-snippet.json has BOTH en + zh title/description', () => {
  const j = readJson(join(ROOT, 'market/index-snippet.json'));
  const p = j.plugins[0];
  ok(p.title.en && p.title.zh, 'title en+zh');
  ok(p.description.en && p.description.zh, 'description en+zh');
});
check('locale en.json and zh.json both present with meta.title', () => {
  for (const loc of ['en', 'zh']) {
    const j = readJson(join(ROOT, `locale/${loc}.json`));
    ok(j.meta.title, `${loc} title`);
  }
});

/* -------------------------------------------------------------------------- */
/* 4. No superlatives / unverifiable claims that contradict code              */
/* -------------------------------------------------------------------------- */

const SUPERLATIVES = [
  /\bbest\b/i, /#1\b/, /\bfastest\b/i, /\bmost advanced\b/i,
  /\bguaranteed?\b/i, /revolutionary/i, /革命性/, /最强/, /最好/, /第一品牌/,
  /100%\s*(?:accurate|error-free|guaranteed)/i,
  /AI 自动保证质量/, /zero (?:bugs|defects|errors)/i,
];
check('no forbidden superlatives in marketing copy', () => {
  for (const [rel, text] of all()) {
    for (const re of SUPERLATIVES) noMatch(text, re, `superlative in ${rel}`);
  }
});
check('marketing does NOT claim the model decides quality (code says scripts do)', () => {
  for (const [rel, text] of all()) {
    noMatch(text, /model (?:decides|guarantees|ensures) quality/i, `${rel} contradicts script authority`);
    noMatch(text, /AI 决定质量/, `${rel} contradicts script authority`);
  }
  // And the README affirmatively states the opposite.
  match(texts['README.md'], /PowerShell validators decide|cannot be flipped by model text/i, 'README states script authority');
});
check('marketing does NOT claim credentials are bundled (code ships empty templates)', () => {
  for (const [rel, text] of all()) {
    noMatch(text, /bundled credentials (?:included|provided)/i, `${rel} contradicts zero-credential claim`);
  }
  match(texts['README.md'], /No credentials are bundled|zero bundled credentials/i, 'README states zero credentials');
});
check('marketing does NOT claim "commands" as a shipped feature (DSH has none)', () => {
  // Research docs are excluded; marketing must not advertise commands.
  for (const [rel, text] of all()) {
    noMatch(text, /bundled commands|ships? \d+ commands|adds? \d+ (?:slash )?commands/i, `stale command claim in ${rel}`);
  }
});
check('version in index-snippet / CHANGELOG / package.json is consistent (no stale v1.1.0)', () => {
  eq(pkg.version, FACTS.version);
  const idx = readJson(join(ROOT, 'market/index-snippet.json'));
  eq(idx.plugins[0].versions[0].version, pkg.version, 'index-snippet version matches package.json');
  noMatch(texts['CHANGELOG.md'], /v?1\.1\.0\s*(?:is|as)?\s*(?:the )?current/i, 'no stale current-version claim');
});
check('PM-M1: no version-bearing surface still advertises an OLD current version', () => {
  // A 5-angle review + PM R2 found PR_STATE / ARCHITECTURE / SUBMISSION_STEPS
  // drifting to older versions. Guard the current version across all surfaces.
  // Historical mentions are fine; only a tarball pinned to a tag OTHER than
  // the current version is real drift. Build the regex from pkg.version so it
  // stays correct on every future bump.
  const surfaces = {
    'market/PR_STATE.md': (t) => t,
    'docs/ARCHITECTURE.md': (t) => t.split('\n').slice(0, 8).join('\n'),
    'market/SUBMISSION_STEPS.md': (t) => t,
    'README.md': (t) => t,
    'README.zh.md': (t) => t,
  };
  const esc = pkg.version.replace(/\./g, '\\.');
  const oldTarball = new RegExp(`releases/download/v(?!${esc}/)[\\d.]+/dsh-novel-mode\\.tgz`);
  const oldLabel = new RegExp(`\\*\\*v(?!${esc}\\s*—)[\\d.]+\\s*—`);
  for (const [rel, pick] of Object.entries(surfaces)) {
    const t = pick(texts[rel] ?? '');
    noMatch(t, oldTarball, `${rel} must not pin an old tarball`);
    noMatch(t, oldLabel, `${rel} must not label an old version as current`);
  }
  // The catalog tarball must point at the CURRENT version.
  const yml = texts['market/data/plugins/github-yousen__dsh-novel-mode.yml'] ?? '';
  includes(yml, `releases/download/v${pkg.version}/dsh-novel-mode.tgz`, 'catalog tarball pinned to current version');
  // PM-R3 nits: no stale bootstrap "就绪" example, no "no system-prompt
  // section" claim (one routing section exists), no stale suite count.
  for (const rel of ['README.md', 'README.zh.md']) {
    noMatch(texts[rel] ?? '', /阶段：constitution · 就绪|阶段：write · 第 1 章 · 就绪/, `${rel} must use current status tokens`);
  }
  noMatch(texts['index.js'] ?? '', /no system-prompt section/i, 'header must not deny the routing section');
  noMatch(texts['CHANGELOG.md'] ?? '', /292\/292|remain at v2\.0\.1/i, 'CHANGELOG current entry must not be stale');
  // Version policy: the plugin is pre-1.0 until AC-38/AC-45 close. package.json
  // must stay on the 0.x line; CHANGELOG must document the policy and the 1.0.0
  // gate, and no surface may call a 2.x tag "current".
  match(pkg.version, /^0\.\d+\.\d+$/, 'version stays on the 0.x polishing line');
  const cl = texts['CHANGELOG.md'] ?? '';
  match(cl, /版本策略/, 'CHANGELOG documents the version policy');
  match(cl, /尚未发布 `1\.0\.0` 正式版/, 'CHANGELOG states 1.0.0 is not yet released');
  match(cl, /AC-38/, 'CHANGELOG names the AC-38 gate for 1.0.0');
  match(cl, /AC-45/, 'CHANGELOG names the AC-45 gate for 1.0.0');
  match(cl, /2\.0\.0 \/ 2\.0\.1 \/ 2\.1\.0 \/ 2\.1\.1/, 'CHANGELOG preserves the 2.x history tags');
});
check('engines.dsh in catalog/index matches package.json', () => {
  const idx = readJson(join(ROOT, 'market/index-snippet.json'));
  eq(idx.plugins[0].versions[0].engines.dsh, pkg.engines.dsh);
});
// PM R3-O7: guard the publication artifacts against URL rot / removal.
check('catalog declares a GitHub Release tarball and a real GitHub-hosted raster icon', () => {
  const yml = texts['market/data/plugins/github-yousen__dsh-novel-mode.yml'] ?? '';
  match(yml, /^tarball:\s*https:\/\/github\.com\/github-yousen\/dsh-novel-mode\/releases\/download\/v[\d.]+\/dsh-novel-mode\.tgz\s*$/m, 'pinned GitHub Release .tgz');
  match(yml, /^icon:\s*https:\/\/raw\.githubusercontent\.com\/github-yousen\/dsh-novel-mode\/main\/assets\/icon-180\.png\s*$/m, 'GitHub-hosted raster icon');
  ok(exists(join(ROOT, 'assets/icon-180.png')), 'icon-180.png exists');
  ok(exists(join(ROOT, 'assets/screenshot-1.png')), 'screenshot-1.png exists');
  const shots = readJson(join(ROOT, 'screenshots.json'));
  ok(Array.isArray(shots) && shots.some((s) => exists(join(ROOT, s))), 'screenshots.json references resolve');
});
// PM R3-O6: the local example snippet pins the same stable code commit as the
// hosted index so the two artifacts cannot silently diverge.
check('index-snippet commit is the stable published code commit', () => {
  const idx = readJson(join(ROOT, 'market/index-snippet.json'));
  match(idx.plugins[0].versions[0].source.commit, /^[0-9a-f]{40}$/, '40-hex SHA');
});

finish(SUITE);
