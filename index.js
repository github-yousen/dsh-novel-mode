/**
 * 小说工作台 (Novel Workbench) — Host adapter.
 *
 * ONE Client panel (sidebar.panellist + main keyed panel) is the sole user
 * surface. No agent preset, no mode dropdown, no persona prose, no user-visible
 * workflow prompt. The engine is a deterministic JS state machine.
 *
 *   lib/orchestrator.js  pure deterministic state machine
 *   index.js             Host: 21 model-only runtime skills, one agent tool,
 *                        one Client-callable HTTP route (both call drive()),
 *                        white-list .dsh/ materialization, generic status tokens
 *   client.js            Web Client: the 小说工作台 panel
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, cpSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as engine from './lib/orchestrator.js';

/** Cordis plugin display name. */
export const name = 'novel-mode';

/** Required registries. `webServer` is optional and read defensively. */
export const inject = ['skills', 'tools', 'systemPrompt'];

/** Project-side white-list: only files the .ps1/.py scripts actually read. */
const MATERIALIZE_ENTRIES = ['scripts', 'templates', 'config.yaml', 'charset.json'];
/** All skills are model-only: none appear in the user-facing / menu (Q14). */
const USER_INVOCABLE = new Set();

const here = dirname(fileURLToPath(import.meta.url));
const ASSET_DSH = join(here, 'assets', '.dsh');
const ASSET_SKILLS = join(ASSET_DSH, 'skills');

const DIRECTORY_OF_SKILL = { 'humanizer-zh': 'Humanizer-zh' };
const SKILL_NAME_OF_DIRECTORY = { 'Humanizer-zh': 'humanizer-zh' };
/**
 * Skills that are NOT user-invocable from the / menu:
 *  - engine-controlled stages (would bypass deterministic gates),
 *  - agent-* worker roles (only dispatched by the engine),
 *  - optional external-site integrations (F-2: default-off; they ship scripts
 *    that evaluate bundled JS and spawn Node with cookies, so a user must opt in).
 */
const ENGINE_CONTROLLED_SKILLS = new Set([
  'novel-batch', 'novel-write',
  'agent-novel-writer', 'agent-continuity-validator', 'agent-book-analyzer',
  'agent-chapter-outliner', 'agent-batch-outliner', 'agent-batch-designer',
  'agent-chapter-summarizer', 'agent-constitution-extractor', 'agent-skeleton-rebuilder',
  'site-fanqie', 'novel-downloader',
]);

const SKILL_DESCRIPTIONS = {
  'novel-constitution': 'Create or update the novel constitution (world, style, characters, book info) with guided, free-form, document-import or hot-ranking modes.',
  'novel-disassemble': 'Reverse-engineer a source book into a reusable skeleton (7-dimension analysis, anti-plagiarism check), then rebuild a fresh constitution and outline.',
  'novel-import': 'Import an existing manuscript: split chapters, extract constitution, summarize, build state and style baseline, validate, and generate an outline skeleton.',
  'novel-outline': 'Expand the structured chapter outline, appending to outline.md (single chapter, a range, or all with --extend).',
  'novel-design': 'Generate the full-book outline, extend it, or produce one chapter design.md (with template generation, validation and semantic review).',
  'novel-write': 'Write one chapter: load minimal context, draft, post-process with scripts, validate, summarize, sync state, deep continuity audit, style fingerprint.',
  'novel-batch': 'Unattended batch writing for a chapter range: automatic outlining, per-chapter design/writing/validation state machine with checkpoints and resume.',
  'novel-validate': 'Hard consistency validation for one, several, or all chapters: post-processing, 22 checks, deep continuity audit, and minimal repair.',
  'novel-design-export': "Export one chapter's complete writing context (design + Humanizer rules) to design-export.md for an external LLM.",
  'agent-novel-writer': 'Subagent role: draft one chapter from its design.md and produce its summary.md in one isolated context.',
  'agent-continuity-validator': 'Subagent role: deep continuity audit (outline/design/chapter/chapter-full/post-sync-lite), reporting CRITICAL/WARNING/PASS and a repair route; never edits files.',
  'agent-book-analyzer': 'Subagent role: 7-dimension source-book analysis for a batch of at most 5 chapters; outputs patterns, never copies original text.',
  'agent-chapter-outliner': 'Subagent role: high-quality structured chapter outline expansion with format adaptation.',
  'agent-batch-outliner': 'Subagent role: unattended outline extension, at most 20 chapters per batch.',
  'agent-batch-designer': 'Subagent role: generate one chapter design.md from the context bundle (single chapter number only).',
  'agent-chapter-summarizer': 'Subagent role: three-layer chapter summary plus character evolution records.',
  'agent-constitution-extractor': 'Subagent role: extract structured settings from a setting document plus a batch of chapters.',
  'agent-skeleton-rebuilder': 'Subagent role: turn a disassemble report and reskin settings into a brand-new constitution and outline.',
  'humanizer-zh': 'Chinese de-AI-writing rulebook: 24 AI-writing tells, quick checklist and quality scoring, referenced by the writing and validation skills.',
  'site-fanqie': 'Optional Fanqie author-backend / ranking / help-center integration (credentials are user-supplied; never bundled).',
  'novel-downloader': 'Optional web-novel TXT downloader with multi-source search, chapter crawling and encoding conversion.',
};

/** Generic, localized status tokens — the ONLY strings a UI may surface. */
const STATUS_TEXT = {
  zh: {
    ok: '就绪', running: '进行中', retrying: '正在重试',
    paused: '已保存进度，可继续', needChoice: '请选择开始方式',
    needSetup: '需要准备运行环境，请查看安装说明',
    recovering: '正在恢复，请稍候', unavailable: '工作流暂不可用，请稍候',
  },
  en: {
    ok: 'Ready', running: 'In progress', retrying: 'Retrying',
    paused: 'Progress saved, you can continue', needChoice: 'Choose how to start',
    needSetup: 'Environment setup needed, see the install guide',
    recovering: 'Recovering, please wait', unavailable: 'Workflow is temporarily unavailable',
  },
};

/** Human-readable Chinese labels for internal stage/sub-step ids (G6). */
const STAGE_ZH = {
  bootstrap: '准备开始', constitution: '建立设定', disassemble: '拆书重构', import: '导入书稿',
  outline: '扩展大纲', design: '章节设计', write: '撰写正文', validate: '一致性校验',
  batch: '批量写作', export: '导出上下文', done: '已完成',
};
const STEP_ZH = {
  O: '自动扩纲', O1: '大纲评审', O2: '大纲回修', A0: '构建上下文', A: '章节设计',
  A1: '设计校验', A2: '设计评审', B: '撰写正文', B2: '后处理', C: '正文校验',
  D1: '摘要呈现', D2: '摘要校验', D3: '同步状态', D4: '连续性评审', E: '章节收尾',
};
const labelOf = (id, map) => map[id] ?? id;

function isSkillDir(entry) {
  return entry.isDirectory() && existsSync(join(ASSET_SKILLS, entry.name, 'SKILL.md'));
}
function loadSkillBody(name) {
  return readFileSync(join(ASSET_SKILLS, DIRECTORY_OF_SKILL[name] ?? name, 'SKILL.md'), 'utf8');
}
function descriptionFromFrontmatter(body, fallback) {
  const match = /^description:\s*(.+)$/m.exec(body);
  const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  // G10: YAML block scalars (`description: |` / `description: >`) capture only
  // the indicator, not the real text. Fall back to the curated description.
  if (!value || value.length < 2 || /^[|>][-+]?\d*$/.test(value)) return fallback;
  return value;
}

/**
 * Idempotent, non-overwriting install of the WHITE-LISTED .dsh/ working files.
 * Only scripts/ (incl. lib/ siblings), templates/, config.yaml, charset.json
 * are copied. skills/, agents/, AGENTS.md, rules/ stay ONLY in the package:
 * skill bodies are registered from ASSET_SKILLS with resourceBase pointing there.
 */
function materialize(projectRoot) {
  if (!existsSync(ASSET_DSH)) throw new Error('assets-missing');
  const target = join(projectRoot, '.dsh');
  let created = 0;
  let kept = 0;
  const copyTree = (src, dest) => {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '__pycache__') continue;
      const from = join(src, entry.name);
      const to = join(dest, entry.name);
      if (entry.isDirectory()) copyTree(from, to);
      else if (existsSync(to)) kept += 1;
      else { cpSync(from, to); created += 1; }
    }
  };
  for (const name of MATERIALIZE_ENTRIES) {
    const src = join(ASSET_DSH, name);
    if (!existsSync(src)) continue;
    if (statSync(src).isDirectory()) copyTree(src, join(target, name));
    else {
      mkdirSync(target, { recursive: true });
      const to = join(target, name);
      if (existsSync(to)) kept += 1;
      else { cpSync(src, to); created += 1; }
    }
  }
  return { target, created, kept, entries: MATERIALIZE_ENTRIES.slice() };
}

function projectRootOf(session, ctx) {
  const wd = ctx.get ? ctx.get('workingDirectory') : undefined;
  if (wd && session) {
    try { const value = wd.get(session); if (value) return resolve(value); } catch { /* fall through */ }
  }
  const meta = session?.header?.cwd ?? session?.cwd;
  if (typeof meta === 'string' && meta.length > 0) return resolve(meta);
  return resolve(process.cwd());
}

/** Build the injected io port. All failures are contained; no raw error escapes. */
function createIo(project) {
  return {
    exists: (p) => existsSync(p),
    readFile: (p) => readFileSync(p, 'utf8'),
    writeFile: (p, text) => writeFileSync(p, text, 'utf8'),
    rename: (a, b) => renameSync(a, b),
    mkdir: (p) => mkdirSync(p, { recursive: true }),
    readdir: (p) => readdirSync(p, { withFileTypes: true }),
    spawnSync: (cmd, args, opts) => spawnSync(cmd, args, { ...opts, encoding: 'utf8', windowsHide: true }),
    now: () => Date.now(),
    log: () => {},
  };
}

/** Generic status for the current state; never contains internals. */
function statusOf(state, locale) {
  const dict = STATUS_TEXT[locale] ?? STATUS_TEXT.zh;
  // G5: an idle bootstrap needs a user choice, not a misleading "Ready".
  if (state.stage === 'bootstrap' && (state.status === 'idle' || state.status === 'running')) return dict.needChoice;
  if (state.status === 'paused' || state.status === 'failed' || state.status === 'blocked') return dict.paused;
  if (state.status === 'retrying') return dict.retrying;
  if (state.status === 'running') return dict.running;
  if (state.recovered) return dict.recovering;
  return dict.ok;
}

/**
 * Public projection of the engine state: bounded, structured, and FREE of any
 * raw failure text, script paths, stderr, or exception strings. Only codes and
 * counts survive. This is the only state shape the tool ever returns.
 */
function publicState(state) {
  const s = engine.summarize(state);
  const gate = s.gate ? { verdict: s.gate.verdict, skipped: !!s.gate.skipped, failedCount: Array.isArray(s.gate.failures) ? s.gate.failures.length : 0 } : null;
  return {
    version: s.version, runId: s.runId, project: s.project, goal: s.goal,
    branch: s.branch, stage: s.stage, batchStep: s.batchStep,
    chapter: s.chapter, totalChapters: s.totalChapters, status: s.status,
    retries: s.retries, gate, historyLength: s.historyLength, logLength: s.logLength,
    next: publicPlan(s.next),
  };
}

/** Classified public gate verdict — never script paths, stderr or raw failures. */
function publicGate(verdict) {
  if (!verdict) return null;
  return {
    status: verdict.status,
    ok: verdict.ok,
    skipped: !!verdict.skipped,
    code: verdict.code ?? null,
    failedCount: Array.isArray(verdict.failures) ? verdict.failures.length : 0,
  };
}

/** Sanitize the planned next action: no script paths or internal file names. */
function publicPlan(p) {
  if (!p || typeof p !== 'object') return null;
  const out = { stage: p.stage, action: p.action, done: !!p.done };
  if (p.skill) out.skill = p.skill;
  if (p.gate) out.gate = true;              // presence only, never the path
  if (p.step) out.step = p.step;
  if (p.chapter != null) out.chapter = p.chapter;
  if (Array.isArray(p.options)) out.options = p.options.slice(0, 8);
  if (p.maxRetries != null) out.maxRetries = p.maxRetries;
  return out;
}

/**
 * The SINGLE operation behind both the agent tool and the Client HTTP route.
 * @param {Record<string, unknown>} args - typed action payload.
 * @param {string} project - absolute novel-project root.
 * @returns structured, localized, non-leaking result.
 */
function drive(args, project) {
  const locale = args?.locale === 'en' ? 'en' : 'zh';
  let root;
  try {
    if (!project || typeof project !== 'string' || project.length < 2) throw new Error('no-project');
    root = resolve(project);
    materialize(root);
  } catch {
    return { ok: false, status: STATUS_TEXT[locale].unavailable, code: 'NO_PROJECT' };
  }

  // Every branch below is wrapped: internal failures never surface.
  try {
    const io = createIo(root);
    const loaded = engine.loadState(io, root, { goal: args?.goal ?? '' });
    let state = loaded.state;
    const action = args?.action ?? 'status';

    if (action === 'status') {
      return { ok: true, status: statusOf({ ...state, recovered: loaded.recovered }, locale), stage: state.stage, state: publicState(state), next: publicPlan(engine.plan(state)) };
    }

    // Build a typed event; reject any free-text control payload.
    const event = { type: action, at: io.now() };
    // F2 fix: a linear-stage gate needs the caller's chapter for scripts
    // like validate-chapter.ps1 (-Chapter N). Build one state snapshot that
    // carries it and use it for EVERY gate computation in this call.
    const chapter = args?.chapter !== undefined ? args.chapter : state.chapter;
    const gateState = chapter === null || chapter === undefined
      ? state
      : { ...state, chapter };
    if (action === 'start' || action === 'reset') {
      if (args?.goal !== undefined) event.goal = String(args.goal).slice(0, 500);
    } else if (action === 'select-branch') {
      event.branch = args?.branch;
    } else if (action === 'batch-step') {
      event.chapter = args?.chapter ?? state.chapter;
      event.step = args?.step ?? state.batchStep;
      event.totalChapters = args?.totalChapters ?? state.totalChapters;
      // Enforce the typed-dispatch allowlist before mutating anything.
      const dv = engine.validateDispatch(engine.dispatchArgs({ ...state, chapter: args?.chapter ?? state.chapter, batchStep: args?.step ?? state.batchStep, totalChapters: args?.totalChapters }));
      if (!dv.ok) return { ok: false, status: STATUS_TEXT[locale].paused, code: 'DISPATCH_REJECTED' };
    } else if (action === 'gate-fail') {
      // Classify only: raw caller text is NEVER accepted into the state.
      // Failures come from the deterministic gate verdict, not from the
      // model. This closes the NG-3 leak where arbitrary strings could be
      // echoed back through summarize().
      const verdict = engine.gate(state.stage, io, root, gateState);
      event.failures = verdict.failures.slice(0, 20);
    }
    if (args?.chapter !== undefined && action !== 'batch-step') event.chapter = args.chapter;

    // For gate events, run the deterministic gate FIRST (stage gate OR the
    // BATCH sub-step gate via gateForStage inside engine.gate — B1). A model
    // cannot assert PASS: only a real script verdict can produce gate-pass.
    if (action === 'gate-pass' || action === 'gate-fail') {
      const verdict = engine.gate(state.stage, io, root, gateState);
      // B3: a DEGRADED / skipped verdict is NEVER a pass. Only a real
      // PASS (ok=true, status='PASS', skipped=false) may advance.
      const isRealPass = verdict.ok === true && verdict.status === 'PASS' && verdict.skipped !== true;
      if (action === 'gate-pass' && !isRealPass) {
        const failed = engine.advance(state, { type: 'gate-fail', at: io.now(), failures: verdict.failures.length ? verdict.failures : [verdict.status] });
        state = failed.ok ? failed.state : state;
        engine.saveState(io, root, state);
        return { ok: false, status: verdict.status === 'DEGRADED' ? STATUS_TEXT[locale].needSetup : STATUS_TEXT[locale].paused, stage: state.stage, state: publicState(state), gate: publicGate(verdict), code: verdict.status === 'DEGRADED' ? 'GATE_DEGRADED' : 'GATE_REFUSED' };
      }
      if (action === 'gate-fail' && isRealPass) {
        // Script says PASS; a claimed failure is ignored (no model veto).
        return { ok: true, status: STATUS_TEXT[locale].ok, stage: state.stage, state: publicState(state), gate: publicGate(verdict), code: 'GATE_PASS_CONFIRMED' };
      }
    }

    // B2: `dispatch` is the engine-driven worker path. It returns the
    // typed role + allowlisted args the Host must use for a subagent, and
    // `verify` adjudicates returned verdicts against truth files before a
    // gate can pass. No free text ever enters the control path.
    if (action === 'dispatch' || action === 'verify') {
      const decision = engine.dispatchFor(state);
      if (action === 'dispatch') {
        return {
          ok: true, status: STATUS_TEXT[locale].ok, stage: state.stage,
          state: publicState(state),
          dispatch: { role: decision.role, args: decision.args, needsAdjudication: decision.needsAdjudication },
          next: publicPlan(engine.plan(state)),
        };
      }
      // verify: worker verdicts are passed as typed structured data only.
      const workerVerdicts = Array.isArray(args?.verdicts) ? args.verdicts.slice(0, 16).map(v => ({
        verdict: String(v?.verdict ?? ''),
        evidenceRefs: Array.isArray(v?.evidenceRefs) ? v.evidenceRefs.filter(r => typeof r === 'string').slice(0, 32) : [],
      })) : [];
      const scriptVerdict = engine.gate(state.stage, io, root, gateState);
      const gateLessReview = state.stage === 'batch' && engine.GATELESS_STEPS.has(state.batchStep)
        && engine.REVIEW_STEPS.has(state.batchStep);
      const combined = engine.adjudicatedGate(scriptVerdict, workerVerdicts, engine.truthResolver(io, root));
      if (!combined.ok) {
        const failed = engine.advance(state, { type: 'gate-fail', at: io.now(), failures: [combined.status] });
        state = failed.ok ? failed.state : state;
        engine.saveState(io, root, state);
        return { ok: false, status: STATUS_TEXT[locale].paused, stage: state.stage, state: publicState(state), code: combined.status === 'NOT_COVERED' ? 'WORKER_NO_EVIDENCE' : 'ADJUDICATION_FAILED' };
      }
      // A gate-less review step has NO script to pass: advance it with the
      // dedicated `step-done` event, never a fabricated `gate-pass` (F1/F3).
      const pastType = gateLessReview ? 'step-done' : 'gate-pass';
      const passed = engine.advance(state, { type: pastType, at: io.now() });
      if (!passed.ok) {
        return { ok: false, status: STATUS_TEXT[locale].paused, stage: state.stage, state: publicState(state), code: 'TRANSITION_REJECTED' };
      }
      state = passed.state;
      engine.saveState(io, root, state);
      return { ok: true, status: statusOf(state, locale), stage: state.stage, state: publicState(state), next: publicPlan(engine.plan(state)), code: 'ADJUDICATED_PASS' };
    }

    // `step-done` advances a gate-less BATCH sub-step (creative/review work
    // with no validator). It is the only way those 9 sub-steps move, so the
    // 100-chapter loop is reachable through the tool flow (F1 fix).
    if (action === 'step-done') {
      const result = engine.advance(state, { type: 'step-done', at: io.now() });
      if (!result.ok) {
        return { ok: false, status: STATUS_TEXT[locale].paused, stage: state.stage, state: publicState(state), code: 'TRANSITION_REJECTED' };
      }
      state = result.state;
      engine.saveState(io, root, state);
      return { ok: true, status: statusOf(state, locale), stage: state.stage, state: publicState(state), next: publicPlan(engine.plan(state)), code: 'STEP_DONE' };
    }

    const result = engine.advance(state, event);
    if (!result.ok) {
      return { ok: false, status: STATUS_TEXT[locale].paused, stage: state.stage, state: publicState(state), code: 'TRANSITION_REJECTED' };
    }
    state = result.state;
    engine.saveState(io, root, state);
    return {
      ok: true,
      status: statusOf(state, locale),
      stage: state.stage,
      state: publicState(state),
      next: publicPlan(engine.plan(state)),
    };
  } catch {
    // Generic, localized, non-leaking. No exception text, no stderr, no
    // script name, no exit code, no stack trace (NG-3, AC-12).
    return { ok: false, status: STATUS_TEXT[locale].unavailable, code: 'ENGINE_UNAVAILABLE' };
  }
}

export function apply(ctx) {
  // ONE short routing rule (not a workflow prompt group): it tells the model
  // WHICH tool drives the engine, never how to write a novel. Stage order,
  // gates, retries and checkpoints remain code-owned in lib/orchestrator.js.
  ctx.systemPrompt.section({
    name: 'novel:mode-route',
    order: 1960,
    text: [
      'When the user asks to write, plan, outline, design, continue, batch-write,',
      'validate, disassemble or import a novel, use the novel_orchestrate tool to',
      'drive the workflow: call status first (resume a prior run if the state is',
      "not idle/done), then start → select-branch → follow the engine's `next` action.",
      'For BATCH sub-steps with no validator use step-done; for review steps use',
      'dispatch → verify with typed worker verdicts. Never decide stage order or',
      'quality yourself — only real script verdicts advance gates. Load a novel-*',
      'skill only when the engine names it as the current worker.',
    ].join('\n'),
  });

  // --- 21 runtime skills (worker reference library) ------------------------
  for (const entry of readdirSync(ASSET_SKILLS, { withFileTypes: true })) {
    if (!isSkillDir(entry)) continue;
    const dir = entry.name;
    const skill = SKILL_NAME_OF_DIRECTORY[dir] ?? dir;
    const body = loadSkillBody(skill).trimEnd();
    ctx.skills.register({
      name: skill,
      description: descriptionFromFrontmatter(body, SKILL_DESCRIPTIONS[skill] ?? skill),
      content: body,
      source: 'runtime',
      whenToUse: SKILL_DESCRIPTIONS[skill] ?? skill,
      // Q14: every skill is model-only; the panel is the sole user surface.
      invocation: { modelInvocable: true, userInvocable: USER_INVOCABLE.has(skill) },
      resourceBase: { kind: 'directory', path: join(ASSET_SKILLS, dir) },
    });
  }

  // --- deterministic orchestration tool -----------------------------------
  ctx.tools.register({
    name: 'novel_orchestrate',
    description: 'Drive the 小说模式 (Novel Mode) deterministic workflow engine. Returns structured state only; never renders prose or errors. Actions: status (read), start, select-branch (bootstrap), gate-pass/gate-fail (code-verified gate results), step-done (finish a BATCH sub-step without a validator), batch-step (set chapter + sub-step), dispatch (engine-returned typed worker role + allowlisted args), verify (engine adjudicates structured worker verdicts against truth files), skip (audited override), resume, retry, pause, reset.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'start', 'select-branch', 'gate-pass', 'gate-fail', 'step-done', 'batch-step', 'skip', 'resume', 'retry', 'pause', 'reset', 'dispatch', 'verify'],
          description: 'The state-machine action. status (read), start, select-branch (bootstrap), gate-pass/gate-fail (code-verified gate results), step-done (finish a BATCH sub-step that has no validator script), batch-step (set chapter + sub-step), dispatch (typed worker role), verify (evidence-adjudicated worker verdicts), skip/resume/retry/pause/reset.',
        },
        goal: { type: 'string', description: 'Optional short description of the writing goal (used by start/reset).' },
        branch: { type: 'string', enum: ['constitution', 'disassemble', 'import'], description: 'Bootstrap branch (select-branch only).' },
        chapter: { type: 'integer', description: 'Chapter number (integer 1..99999) for batch-step / gate events.' },
        totalChapters: { type: 'integer', description: 'Planned chapter count for a batch run.' },
        step: { type: 'string', description: 'Optional BATCH sub-step id (O..E) for batch-step.' },
        failures: { type: 'array', items: { type: 'string' }, description: 'Classified gate failure codes (gate-fail only); raw stderr is never accepted or returned.' },
        verdicts: {
          type: 'array',
          description: 'Structured worker verdicts for the verify action only (never free text).',
          items: {
            type: 'object',
            properties: {
              verdict: { type: 'string', enum: ['PASS', 'WARNING', 'CRITICAL'] },
              evidenceRefs: { type: 'array', items: { type: 'string' }, description: 'Project-relative artifact paths used as evidence.' },
            },
            additionalProperties: false,
          },
        },
        locale: { type: 'string', enum: ['zh', 'en'], description: 'Locale for the generic status token.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          status: { type: 'string', description: 'Generic localized status token (no internals).' },
          stage: { type: 'string' },
          state: { type: 'object', description: 'Bounded structured engine state.' },
          next: { type: 'object', description: 'Next action as data.' },
          gate: { type: 'object', description: 'Deterministic gate verdict.' },
          code: { type: 'string', description: 'Classified internal code (never raw errors).' },
        },
        required: ['ok', 'status'],
        additionalProperties: true,
      },
      render(_args, value) {
        // Structured, bounded rendering. No prompt text, no internals.
        // G4/G6: show human-readable Chinese labels, and surface the bootstrap
        // branch choices so the first-run user has an actionable next step.
        const s = value?.state ?? {};
        const stage = String(value?.stage ?? s.stage ?? '');
        const parts = [
          `阶段：${labelOf(stage, STAGE_ZH)}`,
          s.chapter ? `第 ${s.chapter} 章` : null,
          s.batchStep ? `步骤 ${labelOf(String(s.batchStep), STEP_ZH)}` : null,
          String(value?.status ?? ''),
          stage === 'bootstrap' ? '（可说：从零搭建 / 拆书换皮 / 导入已有书稿）' : null,
        ].filter(Boolean);
        return [{ type: 'text', text: parts.join(' · ') }];
      },
    },
    async execute(args, exec) {
      const agent = exec?.agent;
      const locale = args?.locale === 'en' ? 'en' : 'zh';
      if (!agent) return { ok: false, status: STATUS_TEXT[locale].unavailable, code: 'NO_SESSION' };
      let project;
      try { project = projectRootOf(agent.session, ctx); }
      catch { return { ok: false, status: STATUS_TEXT[locale].unavailable, code: 'NO_SESSION' }; }
      return drive(args, project);
    },
  });

  // --- Client-callable Host route (zero-dep @Remote equivalent, dshmarket pattern)
  // `webServer` may become available AFTER this plugin activates on a fresh
  // Host boot. Use ctx.inject so the route registers when the service is ready
  // and is disposed automatically when either side tears down.
  ctx.inject(['webServer'], (scoped) => {
    const web = scoped.webServer;
    if (!web || typeof web.register !== 'function') return;
    web.register({
      kind: 'exact',
      path: '/novel/api',
      handler: async (request, response) => {
        const send = (code, obj) => {
          const body = JSON.stringify(obj);
          response.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          response.end(body);
        };
        try {
          if (request.method === 'OPTIONS') { send(204, {}); return; }
          if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST, OPTIONS' }); response.end(); return; }
          const chunks = [];
          for await (const c of request) chunks.push(c);
          const raw = Buffer.concat(chunks).toString('utf8');
          const payload = raw ? JSON.parse(raw) : {};
          const project = typeof payload.project === 'string' ? payload.project : '';
          const args = payload.args && typeof payload.args === 'object' ? payload.args : {};
          send(200, drive(args, project));
        } catch {
          send(200, { ok: false, status: STATUS_TEXT.zh.unavailable, code: 'ENGINE_UNAVAILABLE' });
        }
      },
    });
  });
}
