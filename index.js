/**
 * 小说模式 (Novel Mode) — Host adapter.
 *
 * This bundle contributes ONE selectable mode ("小说模式", declared as a
 * `@deepseek-ai/dsh-agent-preset` row in cordis.patch.yml) and a QUIET,
 * deterministic workflow engine. No persona prose, no system-prompt section,
 * no injected workflow brief, no user-visible prompt text, no surfaced errors.
 *
 * Layers:
 *   lib/orchestrator.js  pure deterministic state machine (importable, testable)
 *   index.js             Host adapter: registers the 21 runtime skills, one
 *                        orchestration tool, silent .dsh/ materialization, and
 *                        translates every internal failure into a generic,
 *                        localized status token.
 *
 * The engine, not the model, decides stage order, gates, retries, checkpointing
 * and resume. The model is a worker invoked at specific stages via the skills
 * already registered. The tool returns structured JSON only; on any failure it
 * returns { ok:false, code } and never leaks stderr, script names, exception
 * text, or internal verdicts.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, cpSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as engine from './lib/orchestrator.js';

/** Cordis plugin display name. */
export const name = 'novel-mode';

/** Required registries. Optional services are read defensively with ctx.get. */
export const inject = ['skills', 'tools'];

const here = dirname(fileURLToPath(import.meta.url));
const ASSET_DSH = join(here, 'assets', '.dsh');
const ASSET_SKILLS = join(ASSET_DSH, 'skills');
const PRESET_ID = 'novel';

const DIRECTORY_OF_SKILL = { 'humanizer-zh': 'Humanizer-zh' };
const SKILL_NAME_OF_DIRECTORY = { 'Humanizer-zh': 'humanizer-zh' };

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
  zh: { ok: '就绪', paused: '已保存进度，可继续', recovering: '正在恢复，请稍候', unavailable: '工作流暂不可用，请稍候' },
  en: { ok: 'Ready', paused: 'Progress saved, you can continue', recovering: 'Recovering, please wait', unavailable: 'Workflow is temporarily unavailable' },
};

function isSkillDir(entry) {
  return entry.isDirectory() && existsSync(join(ASSET_SKILLS, entry.name, 'SKILL.md'));
}
function loadSkillBody(name) {
  return readFileSync(join(ASSET_SKILLS, DIRECTORY_OF_SKILL[name] ?? name, 'SKILL.md'), 'utf8');
}
function descriptionFromFrontmatter(body, fallback) {
  const match = /^description:\s*(.+)$/m.exec(body);
  const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  return value && value.length > 0 ? value : fallback;
}

/** Idempotent, non-overwriting install of the bundled .dsh/ working copy. */
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
  copyTree(ASSET_DSH, target);
  return { target, created, kept };
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
  if (state.status === 'paused' || state.status === 'failed' || state.status === 'blocked') return dict.paused;
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

export function apply(ctx) {
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
      invocation: { modelInvocable: true, userInvocable: true },
      resourceBase: { kind: 'directory', path: join(ASSET_SKILLS, dir) },
    });
  }

  // --- deterministic orchestration tool -----------------------------------
  ctx.tools.register({
    name: 'novel_orchestrate',
    description: 'Drive the 小说模式 (Novel Mode) deterministic workflow engine. Returns structured state only; never renders prose or errors. Actions: status (read), start (begin a run), select-branch (choose constitution/disassemble/import), gate-pass / gate-fail (record a code-verified gate result), batch-step (advance a nested batch step with a chapter), skip (audited human override), resume, retry, pause, reset.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'start', 'select-branch', 'gate-pass', 'gate-fail', 'batch-step', 'skip', 'resume', 'retry', 'pause', 'reset'],
          description: 'The state-machine action to perform.',
        },
        goal: { type: 'string', description: 'Optional short description of the writing goal (used by start/reset).' },
        branch: { type: 'string', enum: ['constitution', 'disassemble', 'import'], description: 'Bootstrap branch (select-branch only).' },
        chapter: { type: 'integer', description: 'Chapter number (integer 1..99999) for batch-step / gate events.' },
        totalChapters: { type: 'integer', description: 'Planned chapter count for a batch run.' },
        step: { type: 'string', description: 'Optional BATCH sub-step id (O..E) for batch-step.' },
        failures: { type: 'array', items: { type: 'string' }, description: 'Classified gate failure codes (gate-fail only); raw stderr is never accepted or returned.' },
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
        const s = value?.state ?? {};
        const parts = [
          `阶段：${String(value?.stage ?? s.stage ?? '')}`,
          s.chapter ? `第 ${s.chapter} 章` : null,
          s.batchStep ? `步骤 ${s.batchStep}` : null,
          String(value?.status ?? ''),
        ].filter(Boolean);
        return [{ type: 'text', text: parts.join(' · ') }];
      },
    },
    async execute(args, exec) {
      const agent = exec?.agent;
      const locale = args?.locale === 'en' ? 'en' : 'zh';
      let project;
      try {
        if (!agent) throw new Error('no-agent');
        project = projectRootOf(agent.session, ctx);
      } catch {
        return { ok: false, status: STATUS_TEXT[locale].unavailable, code: 'NO_SESSION' };
      }

      // Every branch below is wrapped: internal failures never surface.
      try {
        const io = createIo(project);
        const loaded = engine.loadState(io, project, { goal: args?.goal ?? '' });
        let state = loaded.state;
        const action = args?.action ?? 'status';

        if (action === 'status') {
          return { ok: true, status: statusOf({ ...state, recovered: loaded.recovered }, locale), stage: state.stage, state: publicState(state), next: publicPlan(engine.plan(state)) };
        }

        // Build a typed event; reject any free-text control payload.
        const event = { type: action, at: io.now() };
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
          const verdict = engine.gate(state.stage, io, project, state);
          event.failures = verdict.failures.slice(0, 20);
        }
        if (args?.chapter !== undefined && action !== 'batch-step') event.chapter = args.chapter;

        // For gate events, run the deterministic gate FIRST. A model cannot
        // assert PASS: only a real script verdict can produce gate-pass.
        if (action === 'gate-pass' || action === 'gate-fail') {
          const verdict = engine.gate(state.stage, io, project, state);
          if (action === 'gate-pass' && !verdict.ok) {
            // Engine refuses to advance on a failed gate (AC-3, NG-5).
            const failed = engine.advance(state, { type: 'gate-fail', at: io.now(), failures: verdict.failures });
            state = failed.ok ? failed.state : state;
            engine.saveState(io, project, state);
            return { ok: false, status: STATUS_TEXT[locale].paused, stage: state.stage, state: publicState(state), gate: publicGate(verdict), code: 'GATE_REFUSED' };
          }
          if (action === 'gate-fail' && verdict.ok && !verdict.skipped) {
            // Script says PASS; a claimed failure is ignored (no model veto).
            return { ok: true, status: STATUS_TEXT[locale].ok, stage: state.stage, state: publicState(state), gate: publicGate(verdict), code: 'GATE_PASS_CONFIRMED' };
          }
        }

        const result = engine.advance(state, event);
        if (!result.ok) {
          return { ok: false, status: STATUS_TEXT[locale].paused, stage: state.stage, state: publicState(state), code: 'TRANSITION_REJECTED' };
        }
        state = result.state;
        engine.saveState(io, project, state);
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
    },
  });

  // --- silent .dsh/ materialization for sessions in 小说模式 ----------------
  const ensureFor = (agent) => {
    if (agent === undefined) return;
    try {
      const registry = ctx.get ? ctx.get('agentPresets') : undefined;
      if (registry && typeof registry.presetForSession === 'function') {
        const session = agent.session;
        if (session && registry.presetForSession(session) !== PRESET_ID) return;
      }
      const root = projectRootOf(agent.session, ctx);
      if (!root || root.length < 2) return;
      materialize(root);
    } catch {
      // Never break session startup; never surface anything.
    }
  };
  ctx.on('agent/created', ({ agent }) => ensureFor(agent));
  ctx.on('agent-preset/selected', (sessionId, agentPreset) => {
    if (agentPreset !== PRESET_ID) return;
    const agents = ctx.get ? ctx.get('agents') : undefined;
    const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined;
    ensureFor(agent);
  });
}
