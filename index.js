/**
 * 小说模式 (Novel Mode) — Host half.
 *
 * A DSH bundle that turns the long-form novel writing workflow into a mode the
 * user can enter with one click (or the /novel command). It contributes:
 *
 *  - Every workflow skill as a runtime skill, with a resourceBase pointing at
 *    the bundled `assets/.dsh/skills/<name>` directory.
 *  - A short system-prompt routing section (the full skill bodies are loaded on
 *    demand, never pasted into every request).
 *  - A `/novel` command AND an equivalent `novel_mode` tool that share one
 *    operation: materialize the bundled `.dsh/` working copy into the current
 *    project and steer the model into the full workflow.
 *  - The "小说模式" button itself lives in client.js.
 *
 * Why the working copy is materialized: all 21 skills and all PowerShell
 * scripts reference paths relative to the *project root* (`.dsh/scripts/...`,
 * `.dsh/templates/...`, `.dsh/config.yaml`) and the scripts compute the project
 * root from `$PSScriptRoot` by going up two levels. They therefore must sit at
 * `<project>/.dsh/` — a bundle-internal directory cannot satisfy those paths.
 * The copy is idempotent and never overwrites an existing project's files.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, cpSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cordis plugin display name (also the Client module id). */
export const name = 'novel-mode';

/**
 * Required Host services. Declaring them keeps this plugin inactive rather than
 * throwing in a composition that does not mount the registries.
 */
export const inject = ['skills', 'systemPrompt', 'commands', 'tools'];

const here = dirname(fileURLToPath(import.meta.url));
const ASSET_DSH = join(here, 'assets', '.dsh');
const ASSET_SKILLS = join(ASSET_DSH, 'skills');

/** Where the routing section sits: before the built-in web surface. */
const DEFAULT_SECTION_ORDER = 1960;

/** Skills that are optional external-site integrations, kept for completeness. */
const SKILL_DESCRIPTIONS = {
  'novel-constitution': 'Create or update the novel constitution (world, style, characters, book info) with guided, free-form, document-import or hot-ranking modes.',
  'novel-disassemble': 'Reverse-engineer a source book into a reusable skeleton (7-dimension analysis, anti-plagiarism check), then rebuild a fresh constitution and outline.',
  'novel-import': 'Import an existing manuscript: split chapters, extract constitution, summarize, build state and style baseline, validate, and generate an outline skeleton.',
  'novel-outline': 'Expand the structured chapter outline, appending to outline.md (single chapter, a range, or all with --extend).',
  'novel-design': 'Generate the full-book outline, extend it, or produce one chapter design.md (with template generation, validation and semantic review).',
  'novel-write': 'Write one chapter: load minimal context, draft, post-process with scripts, validate, summarize, sync state, deep continuity audit, style fingerprint.',
  'novel-batch': 'Unattended batch writing for a chapter range: automatic outlining, per-chapter design/writing/validation state machine with checkpoints and resume.',
  'novel-validate': 'Hard consistency validation for one, several, or all chapters: post-processing, 22 checks, deep continuity audit, and minimal repair.',
  'novel-design-export': 'Export one chapter\'s complete writing context (design + Humanizer rules) to design-export.md for an external LLM.',
  'agent-novel-writer': 'Subagent role: draft one chapter from its design.md and produce its summary.md in one isolated context.',
  'agent-continuity-validator': 'Subagent role: deep continuity audit (outline/design/chapter/chapter-full/post-sync-lite), reporting CRITICAL/WARNING/PASS and a repair route; never edits files.',
  'agent-book-analyzer': 'Subagent role: 7-dimension source-book analysis for a batch of at most 5 chapters; outputs patterns, never copies original text.',
  'agent-chapter-outliner': 'Subagent role: high-quality structured chapter outline expansion with format adaptation.',
  'agent-batch-outliner': 'Subagent role: unattended outline extension, at most 20 chapters per batch.',
  'agent-batch-designer': 'Subagent role: generate one chapter design.md from the context bundle (single chapter number only).',
  'agent-chapter-summarizer': 'Subagent role: three-layer chapter summary plus character evolution records.',
  'agent-constitution-extractor': 'Subagent role: extract structured settings from a setting document plus a batch of chapters.',
  'agent-skeleton-rebuilder': 'Subagent role: turn a disassemble report and reskin settings into a brand-new constitution and outline.',
  'Humanizer-zh': 'Chinese de-AI-writing rulebook: 24 AI-writing tells, quick checklist and quality scoring, referenced by the writing and validation skills.',
  'site-fanqie': 'Optional Fanqie author-backend / ranking / help-center integration (credentials are user-supplied; never bundled).',
  'novel-downloader': 'Optional web-novel TXT downloader with multi-source search, chapter crawling and encoding conversion.',
};

/** The workflow stages the mode routes between, in dependency order. */
const WORKFLOW_STAGES = [
  'novel-constitution   — set up the constitution (world/style/characters/book info)',
  'novel-disassemble    — or bootstrap by reverse-engineering a source book',
  'novel-import         — or bootstrap by importing an existing manuscript',
  'novel-outline        — expand the chapter outline',
  'novel-design         — full outline or a single chapter design.md',
  'novel-write          — write one chapter (design → draft → validate → state)',
  'novel-batch          — unattended batch writing with checkpoints',
  'novel-validate       — deep whole-book consistency validation',
  'novel-design-export  — export one chapter context for an external LLM',
];

/** Build the model-facing instruction that starts the complete workflow. */
function workflowBrief(detail = '') {
  const task = detail.trim() !== '' ? `\n\nUser's goal for this session: ${detail.trim()}` : '';
  return [
    'You are now in 小说模式 (Novel Mode). The complete long-form novel writing workflow has been installed in this project at `.dsh/` (skills, subagent roles, templates, validation scripts, config and rules). Follow it faithfully.',
    '',
    'Available workflow skills (load the one that matches the current request with the skill tool; the `agent-*` skills are subagent roles you dispatch with the subagent tool):',
    ...WORKFLOW_STAGES.map(line => `  - ${line}`),
    '',
    'Rules that are always in force:',
    '  - The project working copy is `.dsh/`; scripts run as `pwsh -NoProfile -File .dsh/scripts/<name>.ps1 -Chapter N` (never -Command).',
    '  - Chapter directories are three-digit zero-padded: `novel/chapters/001/`.',
    '  - A `design.md` must exist before writing any chapter body; every finished chapter must be validated and its state synced.',
    '  - Fix only the problematic passage; never rewrite a whole chapter. No metadata (foreshadow IDs, scene numbers) in prose.',
    '  - Chinese dialogue uses double quotes "". Word counts are decided by the scripts, not by your estimate.',
    '  - When dispatching a subagent role, pass only its parameters and the sentence "请严格按照你的 <context_loading> 规则自行加载所有必要上下文"; never list files or plot in its prompt.',
    '  - You are the sole adjudicator of subagent reports: facts in files outrank subagent verdicts outrank your memory.',
    '',
    'Start by reading `.dsh/AGENTS.md` and `.dsh/config.yaml`, then determine which stage the current project is at (inspect `novel/` — constitution, outline.md, state.yaml and chapters). Continue from that stage: if the project is empty, begin with `novel-constitution` (or ask the user whether to disassemble/import instead). Do not skip stages.',
    task,
  ].join('\n');
}

/** True when `name` looks like a skill directory shipped in the bundle. */
function isSkillDir(entry) {
  return entry.isDirectory() && existsSync(join(ASSET_SKILLS, entry.name, 'SKILL.md'));
}

/** Read one bundled skill body. */
function loadSkillBody(name) {
  return readFileSync(join(ASSET_SKILLS, name, 'SKILL.md'), 'utf8');
}

/** Extract the one-line description from a SKILL.md frontmatter, if present. */
function descriptionFromFrontmatter(body, fallback) {
  const match = /^description:\s*(.+)$/m.exec(body);
  const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  return value && value.length > 0 ? value : fallback;
}

/** One immutable user message with a fresh identity (createUserMessage equivalent). */
function userMessage(text) {
  return Object.freeze({
    id: `novel-mode-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    role: 'user',
    content: Object.freeze([{ type: 'text', text }]),
    source: Object.freeze({ kind: 'user' }),
  });
}

/**
 * Materialize the bundled `.dsh/` working copy into the target project.
 *
 * Existing files are never overwritten: a project that already has a `.dsh/`
 * working copy keeps it. Returns a report the caller shows to the user.
 */
function materialize(projectRoot) {
  if (!existsSync(ASSET_DSH)) {
    throw new Error(`Novel Mode assets are missing at ${ASSET_DSH}. Reinstall the plugin.`);
  }
  const target = join(projectRoot, '.dsh');
  const created = [];
  const kept = [];

  /** Recursively copy files that do not exist yet; never descend into .git. */
  const copyTree = (src, dest) => {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '__pycache__') continue;
      const from = join(src, entry.name);
      const to = join(dest, entry.name);
      if (entry.isDirectory()) {
        copyTree(from, to);
      } else if (existsSync(to)) {
        kept.push(to.slice(projectRoot.length + 1));
      } else {
        cpSync(from, to);
        created.push(to.slice(projectRoot.length + 1));
      }
    }
  };

  copyTree(ASSET_DSH, target);
  return { target, created, kept };
}

/** Resolve the project root from the agent's session working directory. */
function projectRootOf(agent, ctx) {
  const wd = ctx.get('workingDirectory');
  const session = agent?.session;
  let root;
  if (wd && session) {
    try { root = wd.get(session); } catch { /* fall through */ }
  }
  if (!root) {
    const meta = session?.header?.cwd ?? session?.cwd;
    if (typeof meta === 'string' && meta.length > 0) root = meta;
  }
  if (!root) root = process.cwd();
  return resolve(root);
}

/** Guard against a path that escapes the project root. */
function safeProjectRoot(value) {
  const root = resolve(value);
  if (root.length < 2 || root.includes('..')) return null;
  return root;
}

export function apply(ctx, config) {
  const order = Number.isFinite(config?.sectionOrder)
    ? config.sectionOrder
    : DEFAULT_SECTION_ORDER;
  const invocation = {
    modelInvocable: config?.modelInvocable !== false,
    userInvocable: config?.userInvocable !== false,
  };

  // --- skills -------------------------------------------------------------
  let registered = 0;
  for (const entry of readdirSync(ASSET_SKILLS, { withFileTypes: true })) {
    if (!isSkillDir(entry)) continue;
    const skill = entry.name;
    const body = loadSkillBody(skill).trimEnd();
    ctx.skills.register({
      name: skill,
      description: descriptionFromFrontmatter(body, SKILL_DESCRIPTIONS[skill] ?? skill),
      content: body,
      source: 'runtime',
      whenToUse: SKILL_DESCRIPTIONS[skill] ?? skill,
      invocation,
      resourceBase: {
        kind: 'directory',
        path: join(ASSET_SKILLS, skill),
      },
    });
    registered += 1;
  }

  // --- prompt routing section --------------------------------------------
  ctx.systemPrompt.section({
    name: 'novel:mode',
    order,
    text: [
      '小说模式 (Novel Mode) is installed. When the user asks to write, plan, outline, design, continue, batch-write, validate, disassemble or import a novel, load the matching `novel-*` skill with the skill tool before acting, and follow `.dsh/AGENTS.md`. Dispatch `agent-*` skills with the subagent tool for isolated context. Entering the mode is `/novel` or the 小说模式 button.',
    ].join('\n'),
  });

  // --- the single operation shared by the UI command and the agent tool ----
  /**
   * Enter Novel Mode for one agent: install the working copy if needed and
   * steer the model into the full workflow. `agent.steer` both queues the
   * model-visible instruction and wakes an idle driver, so a click from the UI
   * starts a real turn.
   */
  const enterMode = (agent, detail) => {
    if (agent === undefined) return { ok: false, message: 'No active agent/session for this operation.' };
    const root = safeProjectRoot(projectRootOf(agent, ctx));
    if (root === null) return { ok: false, message: 'Cannot resolve a safe working directory for this session.' };
    let report;
    try {
      report = materialize(root);
    } catch (error) {
      return { ok: false, message: `Failed to install .dsh/ working copy: ${String(error?.message ?? error)}` };
    }
    try {
      agent.steer(userMessage(workflowBrief(detail)));
    } catch (error) {
      return { ok: false, message: `Workflow installed at ${report.target}, but the model could not be started: ${String(error?.message ?? error)}` };
    }
    return {
      ok: true,
      root,
      target: report.target,
      created: report.created.length,
      kept: report.kept.length,
      skills: registered,
      message: `小说模式已启动：已在 ${report.target} 就绪（新建 ${report.created.length} 个文件，保留 ${report.kept.length} 个已有文件，注册 ${registered} 个技能）。完整小说工作流已交给模型执行。`,
    };
  };

  // --- /novel command (the UI button calls this through the Remote) -------
  ctx.commands.register({
    name: 'novel',
    description: 'Enter 小说模式 (Novel Mode) and run the complete novel-writing workflow',
    input: { hint: '[what you want to write]' },
    handler: ({ agent, rawInput }) => {
      const result = enterMode(agent, rawInput ?? '');
      return result.ok
        ? { kind: 'success', text: result.message }
        : { kind: 'error', text: result.message };
    },
  });

  // --- equivalent agent tool, so the model can enter the mode itself ------
  ctx.tools.register({
    name: 'novel_mode',
    description: 'Enter 小说模式 (Novel Mode): install the bundled .dsh working copy into this project and start the complete long-form novel writing workflow. Use when the user wants to write, plan, outline, continue, batch-write, or validate a novel, or asks to switch to Novel Mode.',
    parameters: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'Optional short description of what the user wants to work on in this session.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
          skills: { type: 'number' },
        },
        required: ['ok', 'message'],
        additionalProperties: true,
      },
      render(_args, value) {
        return [{ type: 'text', text: String(value?.message ?? '') }];
      },
    },
    async execute(args, exec) {
      const agent = exec?.agent;
      const result = enterMode(agent, String(args?.goal ?? ''));
      return { ok: result.ok, message: result.message, skills: result.skills ?? registered };
    },
  });
}
