/**
 * 小说模式 (Novel Mode) — Host half.
 *
 * This bundle adds ONE thing to the Harness UI: a selectable "小说模式" entry in
 * the session's Agent-preset (mode) dropdown. It is declared as a
 * `@deepseek-ai/dsh-agent-preset` row in cordis.patch.yml — no custom button,
 * no slash command, no prompt injection, no auto-started workflow.
 *
 * The Host half has two quiet jobs:
 *
 *  1. Register the 21 novel-writing skills as runtime skills so they are
 *     loadable from the / menu while this mode is active.
 *  2. When a session actually selects the "小说模式" preset, materialize the
 *     bundled `.dsh/` working copy into that project's root — silently, with no
 *     message injected into the model. All 21 skills and all PowerShell scripts
 *     reference paths relative to the project root (`.dsh/scripts/...`,
 *     `.dsh/templates/...`, `.dsh/config.yaml`) and the scripts compute the
 *     project root from `$PSScriptRoot` by going up two levels, so the assets
 *     must live at `<project>/.dsh/`. The copy is idempotent and never
 *     overwrites an existing project's files.
 *
 * Workflow execution itself is entirely skill-driven: the user describes the
 * intent, the model loads the matching `novel-*` skill, and the skill's own
 * instructions drive the pipeline. Nothing here dictates a stage order.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, cpSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cordis plugin display name. */
export const name = 'novel-mode';

/** Only the skill registry is required; the working-directory service is read defensively. */
export const inject = ['skills'];

const here = dirname(fileURLToPath(import.meta.url));
const ASSET_DSH = join(here, 'assets', '.dsh');
const ASSET_SKILLS = join(ASSET_DSH, 'skills');

/** The preset id declared in cordis.patch.yml. */
const PRESET_ID = 'novel';

/** Directory names that differ from their valid kebab-case skill name. */
const DIRECTORY_OF_SKILL = { 'humanizer-zh': 'Humanizer-zh' };
const SKILL_NAME_OF_DIRECTORY = { 'Humanizer-zh': 'humanizer-zh' };

/** Short discovery descriptions for skills whose frontmatter has none. */
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

/** True when `entry` looks like a skill directory shipped in the bundle. */
function isSkillDir(entry) {
  return entry.isDirectory() && existsSync(join(ASSET_SKILLS, entry.name, 'SKILL.md'));
}

/** Read one bundled skill body by its registered name. */
function loadSkillBody(name) {
  return readFileSync(join(ASSET_SKILLS, DIRECTORY_OF_SKILL[name] ?? name, 'SKILL.md'), 'utf8');
}

/** Extract the one-line description from a SKILL.md frontmatter, if present. */
function descriptionFromFrontmatter(body, fallback) {
  const match = /^description:\s*(.+)$/m.exec(body);
  const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  return value && value.length > 0 ? value : fallback;
}

/**
 * Materialize the bundled `.dsh/` working copy into the target project.
 * Existing files are never overwritten. Returns a small report for logging only
 * (never surfaced to the user or the model).
 */
function materialize(projectRoot) {
  if (!existsSync(ASSET_DSH)) {
    throw new Error(`Novel Mode assets are missing at ${ASSET_DSH}. Reinstall the plugin.`);
  }
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

/** Resolve the project root from the agent's session working directory. */
function projectRootOf(session, ctx) {
  const wd = ctx.get ? ctx.get('workingDirectory') : undefined;
  if (wd && session) {
    try { const value = wd.get(session); if (value) return resolve(value); } catch { /* fall through */ }
  }
  const meta = session?.header?.cwd ?? session?.cwd;
  if (typeof meta === 'string' && meta.length > 0) return resolve(meta);
  return resolve(process.cwd());
}

export function apply(ctx) {
  // --- skills -------------------------------------------------------------
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

  // --- silent working-copy materialization for sessions in 小说模式 ---------
  // Fires on agent creation (when a session starts with the preset selected)
  // and on the durable `agent-preset/selected` event (when the user switches
  // the mode mid-session). No message is injected into the model.
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
      // Asset installation must never break session startup. The skills simply
      // will be unavailable until the next session; no user-facing noise.
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
