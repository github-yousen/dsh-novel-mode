/**
 * lead-integration.mjs — end-to-end through the real Host adapter in
 * PANEL-ONLY form. No agent preset: materialization happens on demand from
 * drive(), and the Client panel reaches it through the /novel/api route.
 */
import { mkdtempSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'D:/yousen/novel-mode-plugin';
const idx = await import(pathToFileURL(join(ROOT, 'index.js')).href);
const { writeFileSync } = await import('node:fs');

const results = [];
const check = (label, cond, detail = '') => {
  results.push({ label, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const temp = mkdtempSync(join(tmpdir(), 'nm-lead-'));
const project = join(temp, 'project');
mkdirSync(join(project, 'novel', 'constitution'), { recursive: true });
writeFileSync(join(project, 'novel', 'constitution', 'core.md'), '# core');
writeFileSync(join(project, 'novel', 'outline.md'), '# outline');

const skills = [], tools = [], routes = [], sections = [], listeners = {};
const ctx = {
  skills: { register: (d) => { skills.push(d); return () => {}; } },
  tools: { register: (d) => { tools.push(d); return () => {}; } },
  systemPrompt: { section: () => () => {} },
  webServer: { register: (r) => { routes.push(r); return () => {}; } },
  on: (name, fn) => { (listeners[name] ||= []).push(fn); },
  inject: (names, fn) => {
    const scoped = {};
    if (names.includes('webServer')) scoped.webServer = ctx.webServer;
    const off = fn(scoped);
    return typeof off === 'function' ? off : () => {};
  },
  get: (k) => k === 'workingDirectory' ? { get: () => project }
    : k === 'webServer' ? ctx.webServer
    : k === 'agents' ? { get: () => ({ session: {} }) } : undefined,
};

let applyError;
try { idx.apply(ctx); } catch (e) { applyError = e; }
check('apply() did not throw', applyError === undefined, applyError ? String(applyError.stack || applyError) : '');
check('21 runtime skills registered', skills.length === 21, `${skills.length}`);
check('exactly one tool registered', tools.length === 1 && tools[0].name === 'novel_orchestrate', tools.map(t => t.name).join(','));
check('/novel/api route registered', routes.length === 1 && routes[0].path === '/novel/api');
check('NO preset listeners registered', !listeners['agent-preset/selected'] && !listeners['agent/created']);
check('all skills are model-only (none user-invocable)', skills.every(s => s.invocation.userInvocable === false));

const tool = tools[0];
const agent = { session: { header: { cwd: project } } };
const exec = { agent };
const run = (args) => tool.execute(args ?? {}, exec);

// --- on-demand WHITE-LIST materialization via drive() ----------------------
check('.dsh absent before first drive', !existsSync(join(project, '.dsh')));
let r = await run({ action: 'status', locale: 'zh' });
check('.dsh materialized on demand', existsSync(join(project, '.dsh')));
const dest = join(project, '.dsh');
check('.dsh has scripts/ but NO skills/ or agents/',
  existsSync(join(dest, 'scripts')) && !existsSync(join(dest, 'skills')) && !existsSync(join(dest, 'agents')));
const count = (dir, re) => { let n = 0; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) n += count(p, re); else if (re.test(e.name)) n += 1; } return n; };
check('.dsh has .ps1 scripts', count(dest, /\.ps1$/) >= 18);
check('.dsh has NO SKILL.md', count(dest, /^SKILL\.md$/) === 0);
check('.dsh has no credential files', count(dest, /^(fanqie-auth\.json|fanqienovel_auth\.json|publish_result\.json)$/) === 0);

// --- tool happy path ------------------------------------------------------
check('status ok', r.ok === true, JSON.stringify(r).slice(0, 160));
check('status has generic text only', typeof r.status === 'string' && !/pwsh|stderr|exit|Error|\.ps1|exception|script-exit/i.test(r.status), r.status);
check('status returns structured state', !!r.state && !!r.next && typeof r.stage === 'string');

r = await run({ action: 'start', goal: '写一本长篇', locale: 'zh' });
check('start ok', r.ok === true && r.stage === 'bootstrap', JSON.stringify(r).slice(0, 160));
r = await run({ action: 'select-branch', branch: 'constitution', locale: 'zh' });
check('select-branch → constitution', r.ok === true && r.stage === 'constitution', JSON.stringify(r).slice(0, 160));

// Gate behavior: drive to design (2 skips from constitution: outline, design).
r = await run({ action: 'skip', locale: 'zh' });
r = await run({ action: 'skip', locale: 'zh' });
check('reached design stage', r.stage === 'design', r.stage);
// validate-design.ps1 exits 0 on its structured verdict, so a real gate-pass
// with chapter 1 is a legitimate advance (proves the gate is executed).
r = await run({ action: 'gate-pass', chapter: 1, locale: 'zh' });
check('gate-pass with a real script verdict ADVANCES to write', r.ok === true && r.stage === 'write', JSON.stringify(r).slice(0, 160));

// --- route path drives the SAME operation ---------------------------------
const route = routes[0];
const callRoute = async (args) => {
  let captured;
  const req = { method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ project, args })); } };
  const res = { writeHead() {}, end(body) { captured = JSON.parse(body); } };
  await route.handler(req, res);
  return captured;
};
const viaRoute = await callRoute({ action: 'status', locale: 'en' });
check('route returns the same structured shape as the tool',
  viaRoute && typeof viaRoute.ok === 'boolean' && viaRoute.state && viaRoute.next);
check('route result is generic (no leaks)',
  !/pwsh|stderr|\.ps1|exception|script-exit/i.test(JSON.stringify(viaRoute)));

check('verify with no evidence is refused', (await run({ action: 'verify', verdicts: [], locale: 'zh' })).ok === false);
check('step-done at a wrong stage is refused', (await run({ action: 'step-done', locale: 'zh' })).ok === false);

const failed = results.filter(x => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILED:', failed.map(x => x.label).join(' | ')); process.exit(1); }
