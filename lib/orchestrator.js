/**
 * 小说模式 — deterministic orchestration core (enterprise substrate).
 *
 * PURE module: no Cordis, no fs, no hidden globals, no prompt text. All I/O is
 * injected through an `io` port, so the entire state machine is testable with
 * `node` alone — no DSH host, no LLM, no network.
 *
 * What makes this "strong orchestration" (not a prompt group):
 *  - STAGE_GRAPH / BATCH_SUBSTEPS are real JS transition tables.
 *  - `advance()` is a pure reducer that REJECTS illegal transitions; the model
 *    cannot skip a stage by saying so.
 *  - `gate()` and `stageGuard()` are code functions that consult PowerShell
 *    validator exit codes + artifact existence. Scripts are the authority.
 *  - `adjudicate()` resolves subagent verdicts against truth files with a fixed
 *    evidence precedence; a PASS with no evidence cannot flip a gate.
 *  - `dispatchArgs()` builds typed, minimal worker arguments from state and
 *    rejects free-text file lists / plot hints (engine-enforced allowlist).
 *  - `loadState`/`saveState` are versioned, atomic, corruption-tolerant, durable
 *    checkpoints — resume survives process restart and plugin reload.
 *  - Structured, bounded observability (`logEvent`, `summarize`) — no prose.
 *
 * Nothing here renders text to the user. `plan()` returns the next ACTION as
 * data; the Host adapter decides how to execute it and translates every
 * failure into a generic localized status.
 */

/** Checkpoint format version. Bump when fold semantics change. */
export const STATE_VERSION = 2;

/** Terminal / control statuses. */
export const STATUSES = ['idle', 'running', 'blocked', 'retrying', 'paused', 'failed', 'done', 'aborted'];

/** Gate verdict vocabulary (AC-24). */
export const GATE_VERDICTS = ['PASS', 'FAIL', 'DEGRADED', 'RETRYABLE'];

/**
 * Top-level stage graph, including the three bootstrap branches.
 * `entry` = artifacts that must exist before dispatch; `gate` = deterministic
 * validator; `skill` = worker role; `next`/`onFail` = transition table.
 */
export const STAGES = [
  'bootstrap', 'constitution', 'disassemble', 'import',
  'outline', 'design', 'write', 'validate', 'batch', 'export', 'done',
];

/** Legal bootstrap branches (AC-2). */
export const BOOTSTRAP_BRANCHES = ['constitution', 'disassemble', 'import'];

/**
 * BATCH is a nested, strictly serial, per-chapter sub-FSM (AC-2, AC-15).
 * Each step names its deterministic gate script where one exists.
 */
export const BATCH_SUBSTEPS = [
  { id: 'O', label: 'auto-outline', gate: '.dsh/scripts/validate-outline.ps1' },
  { id: 'O1', label: 'outline-review', gate: null },
  { id: 'O2', label: 'outline-repair', gate: null },
  { id: 'A0', label: 'context-bundle', gate: '.dsh/scripts/build-context-bundle.ps1' },
  { id: 'A', label: 'chapter-design', gate: null },
  { id: 'A1', label: 'design-validate', gate: '.dsh/scripts/validate-design.ps1' },
  { id: 'A2', label: 'design-review', gate: null },
  { id: 'B', label: 'draft', gate: null },
  { id: 'B2', label: 'post-process', gate: null },
  { id: 'C', label: 'chapter-validate', gate: '.dsh/scripts/validate-chapter.ps1' },
  { id: 'D1', label: 'summary-present', gate: null },
  { id: 'D2', label: 'summary-validate', gate: '.dsh/scripts/validate-summary.ps1' },
  { id: 'D3', label: 'sync-state', gate: '.dsh/scripts/sync-state.ps1' },
  { id: 'D4', label: 'continuity-review', gate: null },
  { id: 'E', label: 'checkpoint', gate: null },
];

export const STAGE_GRAPH = {
  bootstrap: {
    next: 'constitution', onFail: 'bootstrap', maxRetries: 0,
    skill: null, gate: null, entry: [], produces: [], branch: BOOTSTRAP_BRANCHES,
  },
  constitution: {
    next: 'outline', onFail: 'constitution', maxRetries: 3,
    skill: 'novel-constitution', gate: null,
    entry: [],
    produces: ['novel/constitution/core.md', 'novel/constitution/style.md', 'novel/bookinfo.md'],
  },
  disassemble: {
    next: 'outline', onFail: 'disassemble', maxRetries: 3,
    skill: 'novel-disassemble', gate: '.dsh/scripts/analyze-source.ps1',
    entry: [], produces: ['novel/source/report.md', 'novel/outline.md'],
  },
  import: {
    next: 'outline', onFail: 'import', maxRetries: 3,
    skill: 'novel-import', gate: '.dsh/scripts/validate-chapter.ps1',
    entry: [], produces: ['novel/constitution/core.md', 'novel/outline.md', 'novel/state.yaml'],
  },
  outline: {
    next: 'design', onFail: 'outline', maxRetries: 3,
    skill: 'novel-outline', gate: '.dsh/scripts/validate-outline.ps1',
    entry: ['novel/constitution/core.md'], produces: ['novel/outline.md'],
  },
  design: {
    next: 'write', onFail: 'design', maxRetries: 3,
    skill: 'novel-design', gate: '.dsh/scripts/validate-design.ps1',
    entry: ['novel/outline.md'], produces: [],
  },
  write: {
    next: 'validate', onFail: 'write', maxRetries: 3,
    skill: 'novel-write', gate: '.dsh/scripts/validate-chapter.ps1',
    entry: ['novel/outline.md'], produces: [],
  },
  validate: {
    next: 'batch', onFail: 'write', maxRetries: 2,
    skill: 'novel-validate', gate: '.dsh/scripts/validate-chapter.ps1',
    entry: ['novel/outline.md'], produces: [],
  },
  batch: {
    next: 'export', onFail: 'batch', maxRetries: 2,
    skill: 'novel-batch', gate: null, nested: BATCH_SUBSTEPS,
    entry: ['novel/outline.md', 'novel/constitution/core.md'], produces: [],
  },
  export: {
    next: 'done', onFail: 'export', maxRetries: 2,
    skill: 'novel-design-export', gate: null,
    entry: [], produces: [],
  },
  done: {
    next: 'done', onFail: 'done', maxRetries: 0,
    skill: null, gate: null, entry: [], produces: [],
  },
};

/** Events the reducer accepts (AC-1: closed set, no free-text control). */
export const EVENT_TYPES = [
  'start', 'select-branch', 'gate-pass', 'gate-fail', 'skip',
  'retry', 'pause', 'resume', 'reset', 'batch-step', 'fail',
];

const CHECKPOINT_DIR = '.dsh/state';
const CHECKPOINT_FILE = 'novel-mode.checkpoint.json';
const BACKUP_FILE = 'novel-mode.checkpoint.corrupt.json';
const MAX_HISTORY = 128;

/* -------------------------------------------------------------------------- */
/* Deterministic helpers                                                       */
/* -------------------------------------------------------------------------- */

/** Stable-key JSON for byte-identical checkpoints (AC-23). */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * Normalize a chapter argument to an integer in [1, 99999] and a `{0:D3}`-style
 * path segment. Rejects path traversal, floats, negative, NaN and strings with
 * non-digits (AC-21, S4). Returns a verdict, never throws.
 */
export function normalizeChapter(raw) {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 99999) {
    return { ok: true, chapter: raw, dir: String(raw).padStart(3, '0') };
  }
  if (typeof raw === 'string' && /^\d{1,5}$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (n >= 1 && n <= 99999) return { ok: true, chapter: n, dir: String(n).padStart(3, '0') };
  }
  return { ok: false, reason: 'chapter must be an integer in 1..99999' };
}

/** Project-relative artifact path, guarded against traversal. */
export function artifactPath(project, rel) {
  if (typeof rel !== 'string' || rel.includes('..') || rel.startsWith('/') || /[\\:*?"<>|]/.test(rel)) {
    return null;
  }
  return `${project}/${rel}`;
}

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

export function createState({ project = '', goal = '', branch = null } = {}) {
  return {
    version: STATE_VERSION,
    runId: `nm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    project: String(project),
    goal: String(goal).slice(0, 500),
    branch,                       // null | constitution | disassemble | import
    stage: 'bootstrap',
    batchStep: null,              // id in BATCH_SUBSTEPS while stage === batch
    chapter: null,                // current chapter number (int) or null
    status: 'idle',
    retries: 0,
    gate: null,                   // last gate verdict object
    history: [],                  // bounded structured audit trail
    log: [],                      // bounded structured run log (AC-24)
    createdAt: 0,
    updatedAt: 0,
  };
}

export function validateState(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, error: 'state is not an object' };
  if (x.version !== STATE_VERSION) return { ok: false, error: `unsupported version ${x.version}` };
  if (!STAGES.includes(x.stage)) return { ok: false, error: `unknown stage ${x.stage}` };
  if (!STATUSES.includes(x.status)) return { ok: false, error: `unknown status ${x.status}` };
  if (!Number.isInteger(x.retries) || x.retries < 0) return { ok: false, error: 'retries must be a non-negative integer' };
  if (!Array.isArray(x.history) || !Array.isArray(x.log)) return { ok: false, error: 'history/log must be arrays' };
  if (typeof x.project !== 'string' || typeof x.runId !== 'string') return { ok: false, error: 'project/runId must be strings' };
  if (x.branch !== null && !BOOTSTRAP_BRANCHES.includes(x.branch)) return { ok: false, error: `unknown branch ${x.branch}` };
  if (x.chapter !== null) { const v = normalizeChapter(x.chapter); if (!v.ok) return { ok: false, error: 'invalid chapter' }; }
  return { ok: true };
}

export function serializeState(state) { return stableStringify(state); }

export function parseState(text) {
  try {
    const parsed = JSON.parse(String(text));
    const verdict = validateState(parsed);
    return verdict.ok ? { ok: true, state: parsed } : { ok: false, error: verdict.error };
  } catch (e) {
    return { ok: false, error: `malformed JSON: ${e && e.message ? e.message : String(e)}` };
  }
}

function checkpointPath(project) { return `${project}/${CHECKPOINT_DIR}/${CHECKPOINT_FILE}`; }
function backupPath(project) { return `${project}/${CHECKPOINT_DIR}/${BACKUP_FILE}`; }

/** Durable load: missing → fresh; corrupt → atomic backup + fresh + recorded. */
export function loadState(io, project, { goal = '' } = {}) {
  const path = checkpointPath(project);
  let fresh = createState({ project, goal });
  fresh.createdAt = io.now ? io.now() : 0;
  fresh.updatedAt = fresh.createdAt;
  try {
    if (!io.exists(path)) return { ok: true, state: fresh, fresh: true };
    const parsed = parseState(io.readFile(path));
    if (parsed.ok) {
      parsed.state.project = project;   // re-anchor, keep run identity
      return { ok: true, state: parsed.state, fresh: false };
    }
    try {
      const backup = backupPath(project);
      if (io.exists(backup)) io.rename(backup, `${backup}.${Date.now()}`);
      io.rename(path, backup);
    } catch { /* best effort; never crash */ }
    fresh.goal = String(goal);
    // Persisted fields carry classified codes only, never raw parse errors.
    fresh.history = [{ at: fresh.createdAt, from: 'none', to: 'bootstrap', event: 'recover', verdict: 'corrupt-checkpoint' }];
    fresh.log = [logEvent(fresh, 'recover', 'DEGRADED', { reason: 'corrupt-checkpoint' })];
    return { ok: true, state: fresh, fresh: true, recovered: true, reason: parsed.error };
  } catch {
    // Outer I/O failure: classified only. The exception message may contain
    // paths, stderr or internal detail and must never be returned (NG-3).
    fresh.log = [logEvent(fresh, 'recover', 'DEGRADED', { reason: 'io-error' })];
    return { ok: true, state: fresh, fresh: true, recovered: true, reason: 'io-error' };
  }
}

/** Atomic persist (write tmp → rename). Never throws. */
export function saveState(io, project, state) {
  const verdict = validateState(state);
  if (!verdict.ok) return { ok: false, error: verdict.error };
  try {
    io.mkdir(`${project}/${CHECKPOINT_DIR}`);
    const path = checkpointPath(project);
    const tmp = `${path}.tmp`;
    io.writeFile(tmp, `${serializeState(state)}\n`);
    io.rename(tmp, path);
    return { ok: true };
  } catch {
    return { ok: false, error: 'io-error' };
  }
}

/* -------------------------------------------------------------------------- */
/* Structured observability (AC-24)                                            */
/* -------------------------------------------------------------------------- */

/** One bounded, machine-readable log entry. Never contains prose. */
export function logEvent(state, gate, verdict, extra = {}) {
  return {
    runId: state.runId,
    stageId: state.stage,
    batchStep: state.batchStep ?? null,
    chapterNo: state.chapter ?? null,
    gate: String(gate),
    verdict: String(verdict),
    evidenceRef: extra.evidenceRef ?? null,
    attempt: state.retries,
    durationMs: typeof extra.durationMs === 'number' ? extra.durationMs : null,
    timestamp: typeof extra.at === 'number' ? extra.at : (state.updatedAt || 0),
    code: extra.code ?? null,
  };
}

function append(state, entry, log) {
  const history = [...state.history, entry];
  const runLog = [...state.log, log];
  return {
    ...state,
    history: history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history,
    log: runLog.length > MAX_HISTORY ? runLog.slice(-MAX_HISTORY) : runLog,
  };
}

/* -------------------------------------------------------------------------- */
/* Planning                                                                    */
/* -------------------------------------------------------------------------- */

/** Derive the next ACTION as data. The Host executes it; no prose is rendered. */
export function plan(state) {
  const node = STAGE_GRAPH[state.stage];
  if (state.stage === 'done' || state.status === 'done') return { stage: 'done', action: 'done', done: true };
  if (['blocked', 'paused', 'failed', 'aborted'].includes(state.status)) {
    return { stage: state.stage, action: 'paused', done: false, reason: state.status };
  }
  if (state.stage === 'bootstrap') {
    return { stage: 'bootstrap', action: 'select-branch', options: BOOTSTRAP_BRANCHES, done: false };
  }
  if (state.stage === 'batch' && state.batchStep) {
    const step = BATCH_SUBSTEPS.find(s => s.id === state.batchStep);
    return {
      stage: 'batch', action: 'batch-step', step: state.batchStep,
      gate: step?.gate ?? null, chapter: state.chapter ?? null,
      params: dispatchArgs(state), done: false,
    };
  }
  return {
    stage: state.stage,
    action: 'run-stage',
    skill: node.skill,
    gate: node.gate,
    params: dispatchArgs(state),
    maxRetries: node.maxRetries,
    done: false,
  };
}

/**
 * Typed, minimal worker arguments (AC-8, AC-21). Built from state, never from
 * free text. Rejects any path-like or prose-like value: the dispatcher literally
 * cannot emit a file list or plot hint.
 */
export function dispatchArgs(state) {
  const args = { stage: state.stage };
  if (state.chapter !== null && state.chapter !== undefined) args.chapter = state.chapter;
  if (state.batchStep) args.batchStep = state.batchStep;
  if (Array.isArray(state.characters)) args.characters = state.characters.slice(0, 64).filter(x => typeof x === 'string' && x.length <= 64);
  if (Array.isArray(state.foreshadowIds)) args.foreshadowIds = state.foreshadowIds.slice(0, 64).filter(x => /^F-\d+-\d+$/.test(String(x)));
  return args;
}

/** Engine-enforced allowlist check on a candidate dispatch payload. */
export function validateDispatch(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'payload is not an object' };
  const allowed = new Set(['stage', 'chapter', 'batchStep', 'characters', 'foreshadowIds']);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) return { ok: false, reason: `disallowed field ${key}` };
  }
  if (payload.chapter !== undefined) { const v = normalizeChapter(payload.chapter); if (!v.ok) return { ok: false, reason: v.reason }; }
  for (const key of ['characters', 'foreshadowIds']) {
    if (payload[key] !== undefined && !Array.isArray(payload[key])) return { ok: false, reason: `${key} must be an array` };
    if (Array.isArray(payload[key])) {
      for (const item of payload[key]) {
        if (typeof item !== 'string' || /[\\/]|\.\.|[：:；;]/.test(item)) return { ok: false, reason: `${key} contains a path or prose` };
      }
    }
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Adjudication (AC-8)                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Resolve subagent verdicts against truth files with fixed evidence precedence:
 *   truth files  >  subagent judgment  >  engine memory
 * A PASS with no/insufficient evidence is NOT_COVERED (cannot flip a gate).
 * A CRITICAL whose evidence is disproved by truth files is FALSE_POSITIVE
 * (dismissed + logged). Contradictions resolve by evidence, never by label.
 *
 * @param {Array<{verdict:string, evidenceRefs:string[], role?:string}>} verdicts
 * @param {{resolve:(ref:string)=>boolean}} truth  resolves a ref to a real fact
 * @returns {{ok, verdict, dismissed, notCovered, reasons, precedenceApplied}}
 */
export function adjudicate(verdicts, truth) {
  const list = Array.isArray(verdicts) ? verdicts : [];
  const reasons = [];
  const dismissed = [];
  const notCovered = [];
  let hasCritical = false;
  let hasWarning = false;
  let passCovered = false;

  for (const v of list) {
    const label = String(v?.verdict ?? '').toUpperCase();
    const refs = Array.isArray(v?.evidenceRefs) ? v.evidenceRefs.filter(r => typeof r === 'string') : [];
    const confirmed = truth && typeof truth.resolve === 'function' ? refs.map(r => ({ ref: r, real: truth.resolve(r) === true })) : [];
    const realRefs = confirmed.filter(c => c.real).map(c => c.ref);

    if (label === 'PASS') {
      if (realRefs.length === 0) {
        notCovered.push(v?.role ?? 'unknown');
        reasons.push('PASS without confirmed evidence is NOT_COVERED');
      } else passCovered = true;
    } else if (label === 'WARNING') {
      hasWarning = true;
      if (realRefs.length === 0) reasons.push('WARNING lacks confirmed evidence; recorded only');
    } else if (label === 'CRITICAL') {
      if (realRefs.length === 0) {
        dismissed.push(v?.role ?? 'unknown');
        reasons.push('CRITICAL disproved by truth files (FALSE_POSITIVE); dismissed');
      } else hasCritical = true;
    } else {
      reasons.push(`unknown verdict ${label}; ignored`);
    }
  }

  // Truth files outrank verdicts: a CRITICAL with no real evidence cannot block,
  // but a PASS with no real evidence cannot pass either. A gate flips to PASS
  // ONLY on confirmed positive evidence; an empty verdict list is NOT_COVERED.
  let verdict;
  if (hasCritical) verdict = 'FAIL';
  else if (!passCovered) verdict = notCovered.length > 0 || list.length === 0 ? 'NOT_COVERED' : 'DEGRADED';
  else verdict = hasWarning ? 'DEGRADED' : 'PASS';
  return {
    ok: verdict === 'PASS',
    verdict,
    dismissed,
    notCovered,
    reasons,
    precedenceApplied: 'truth-files > subagent-judgment > engine-memory',
  };
}

/* -------------------------------------------------------------------------- */
/* Reducer                                                                     */
/* -------------------------------------------------------------------------- */

export function validateTransition(state, event) {
  if (!event || typeof event !== 'object') return { ok: false, reason: 'event is not an object' };
  if (!EVENT_TYPES.includes(event.type)) return { ok: false, reason: `unknown event ${event.type}` };
  if (event.type === 'reset') return { ok: true };
  if (state.stage === 'done' && !['reset'].includes(event.type)) return { ok: false, reason: 'run is terminal; reset to restart' };
  if (event.type === 'start' && !['idle', 'blocked', 'paused'].includes(state.status)) return { ok: false, reason: `cannot start from ${state.status}` };
  if (event.type === 'select-branch') {
    if (state.stage !== 'bootstrap') return { ok: false, reason: 'branch selection only at bootstrap' };
    if (!BOOTSTRAP_BRANCHES.includes(event.branch)) return { ok: false, reason: `unknown branch ${event.branch}` };
    return { ok: true };
  }
  if (event.type === 'batch-step' && state.stage !== 'batch') {
    return { ok: false, reason: `batch-step only valid at batch, not ${state.stage}` };
  }
  if (['gate-pass', 'gate-fail', 'skip'].includes(event.type) && state.stage === 'bootstrap') {
    return { ok: false, reason: 'bootstrap requires select-branch, not a gate event' };
  }
  if (['gate-pass', 'gate-fail', 'batch-step', 'retry', 'pause', 'fail'].includes(event.type) && !['running', 'retrying'].includes(state.status)) {
    return { ok: false, reason: `cannot ${event.type} from ${state.status}` };
  }
  if (event.stage !== undefined && event.stage !== state.stage) return { ok: false, reason: `event stage ${event.stage} != ${state.stage}` };
  if (event.chapter !== undefined) { const v = normalizeChapter(event.chapter); if (!v.ok) return { ok: false, reason: v.reason }; }
  return { ok: true };
}

/** Pure reducer: never mutates the input; returns { ok, state, reason? }. */
export function advance(state, event) {
  const check = validateTransition(state, event);
  if (!check.ok) return { ok: false, reason: check.reason, state };
  const node = STAGE_GRAPH[state.stage];
  const at = event.at !== undefined ? event.at : (state.updatedAt || 0);
  let next = { ...state };
  const push = (from, to, verdict, code) => {
    next = append(next,
      { at, from, to, event: event.type, verdict, code: code ?? null },
      logEvent({ ...next, updatedAt: at }, event.type === 'gate-fail' ? node.gate ?? state.stage : state.stage, verdict, { at, code: code ?? null }));
  };

  switch (event.type) {
    case 'start':
      next.status = 'running'; next.stage = 'bootstrap'; next.retries = 0; next.gate = null;
      next.batchStep = null; next.chapter = null;
      if (event.goal) next.goal = String(event.goal).slice(0, 500);
      push(state.stage, 'bootstrap', 'PASS', 'START');
      break;
    case 'reset': {
      const fresh = createState({ project: state.project, goal: event.goal ?? state.goal });
      fresh.createdAt = state.createdAt; fresh.updatedAt = at;
      fresh.history = [{ at, from: state.stage, to: 'bootstrap', event: 'reset', verdict: 'PASS' }];
      fresh.log = [logEvent(fresh, 'reset', 'PASS', { at, code: 'RESET' })];
      return { ok: true, state: fresh };
    }
    case 'select-branch':
      next.branch = event.branch;
      next.stage = event.branch;
      next.status = 'running';
      push('bootstrap', event.branch, 'PASS', 'BRANCH');
      break;
    case 'resume':
      if (['idle', 'paused', 'blocked', 'retrying'].includes(state.status)) next.status = 'running';
      push(state.stage, state.stage, 'PASS', 'RESUME');
      break;
    case 'gate-pass':
      next.gate = { verdict: 'PASS', failures: [], at };
      next.retries = 0;
      if (state.stage === 'batch' && state.batchStep) {
        const idx = BATCH_SUBSTEPS.findIndex(s => s.id === state.batchStep);
        if (idx >= 0 && idx < BATCH_SUBSTEPS.length - 1) {
          next.batchStep = BATCH_SUBSTEPS[idx + 1].id;
          push(state.stage, state.stage, 'PASS', `STEP-${next.batchStep}`);
          break;
        }
        if (idx === BATCH_SUBSTEPS.length - 1) {
          // Chapter complete → advance chapter or leave batch.
          next.batchStep = null;
          if (typeof state.chapter === 'number' && state.totalChapters && state.chapter < state.totalChapters) {
            next.chapter = state.chapter + 1;
            next.batchStep = BATCH_SUBSTEPS[0].id;
            push(state.stage, state.stage, 'PASS', 'NEXT-CHAPTER');
            break;
          }
          push(state.stage, node.next, 'PASS', 'BATCH-DONE');
          next.stage = node.next;
          next.status = node.next === 'done' ? 'done' : 'running';
          break;
        }
      }
      push(state.stage, node.next, 'PASS', 'GATE-PASS');
      next.stage = node.next;
      next.batchStep = node.next === 'batch' ? BATCH_SUBSTEPS[0].id : null;
      next.status = node.next === 'done' ? 'done' : 'running';
      break;
    case 'batch-step': {
      const v = normalizeChapter(event.chapter ?? state.chapter);
      if (!v.ok) return { ok: false, reason: v.reason, state };
      next.chapter = v.chapter;
      if (event.step && BATCH_SUBSTEPS.some(s => s.id === event.step)) next.batchStep = event.step;
      else if (!next.batchStep) next.batchStep = BATCH_SUBSTEPS[0].id;
      if (!next.totalChapters && Number.isInteger(event.totalChapters)) next.totalChapters = event.totalChapters;
      push(state.stage, state.stage, 'PASS', `STEP-${next.batchStep}`);
      break;
    }
    case 'gate-fail': {
      const failures = Array.isArray(event.failures) ? event.failures.slice(0, 20).map(String) : [];
      const budget = node.maxRetries;
      next.gate = { verdict: 'FAIL', failures, at };
      if (next.retries + 1 >= budget) {
        next.status = 'paused';
        next.stage = node.onFail;
        push(state.stage, node.onFail, 'FAIL', 'PAUSED');
      } else {
        next.retries += 1;
        next.status = 'retrying';
        next.stage = node.onFail;
        push(state.stage, node.onFail, 'RETRYABLE', `ATTEMPT-${next.retries}`);
      }
      break;
    }
    case 'retry':
      if (state.status !== 'retrying' && state.status !== 'paused') return { ok: false, reason: 'not in a retryable state', state };
      next.status = 'running'; push(state.stage, state.stage, 'RETRYABLE', 'RETRY');
      break;
    case 'pause':
      next.status = 'paused'; push(state.stage, state.stage, 'DEGRADED', 'PAUSED');
      break;
    case 'fail':
      next.status = 'failed'; push(state.stage, state.stage, 'FAIL', 'FAILED');
      break;
    case 'skip':
      // Explicit, audited human override only — never silent (AC-17).
      next.gate = { verdict: 'DEGRADED', skipped: true, failures: [], at };
      next.retries = 0;
      push(state.stage, node.next, 'DEGRADED', 'SKIPPED');
      next.stage = node.next;
      next.batchStep = node.next === 'batch' ? BATCH_SUBSTEPS[0].id : null;
      next.status = node.next === 'done' ? 'done' : 'running';
      break;
    default:
      return { ok: false, reason: 'unreachable', state };
  }
  next.updatedAt = at;
  return { ok: true, state: next };
}

/** Bounded structured status — no prose. */
export function summarize(state) {
  return {
    version: state.version,
    runId: state.runId,
    project: state.project,
    goal: state.goal,
    branch: state.branch,
    stage: state.stage,
    batchStep: state.batchStep,
    chapter: state.chapter,
    totalChapters: state.totalChapters ?? null,
    status: state.status,
    retries: state.retries,
    gate: state.gate,
    historyLength: state.history.length,
    logLength: state.log.length,
    recent: state.history.slice(-5),
    recentLog: state.log.slice(-5),
    next: plan(state),
  };
}

/* -------------------------------------------------------------------------- */
/* Gates                                                                       */
/* -------------------------------------------------------------------------- */

/** Entry guard: which required artifacts are missing (never throws). */
export function stageGuard(stage, io, project, _state) {
  const node = STAGE_GRAPH[stage];
  if (!node) return { ok: false, missing: [`unknown stage ${stage}`] };
  const missing = [];
  for (const rel of node.entry) {
    const path = artifactPath(project, rel);
    if (!path) { missing.push(rel); continue; }
    try { if (!io.exists(path)) missing.push(rel); } catch { missing.push(rel); }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Deterministic gate. Runs the stage's validation script via io.spawnSync using
 * `pwsh -NoProfile -File <rel> -Chapter <int>` (never -Command). A missing pwsh
 * or runner yields DEGRADED (skipped), never a crash and never a silent PASS.
 */
export function gate(stage, io, project, state) {
  const node = STAGE_GRAPH[stage];
  if (!node) return { ok: false, status: 'FAIL', skipped: false, failures: [`unknown stage ${stage}`], script: null, exitCode: null };
  if (!node.gate) return { ok: true, status: 'PASS', skipped: true, failures: [], script: null, exitCode: null, reason: 'no-validator' };

  const guard = stageGuard(stage, io, project, state);
  if (!guard.ok) {
    return { ok: false, status: 'FAIL', skipped: false, failures: guard.missing.map(m => `missing:${m}`), script: node.gate, exitCode: null, code: 'ENTRY_GUARD' };
  }
  if (typeof io.spawnSync !== 'function') {
    return { ok: true, status: 'DEGRADED', skipped: true, failures: [], script: node.gate, exitCode: null, reason: 'no-script-runner' };
  }
  const args = ['-NoProfile', '-File', node.gate];
  const chapter = state?.chapter ?? (typeof io.chapter === 'function' ? io.chapter() : null);
  if (chapter !== null && chapter !== undefined) {
    const v = normalizeChapter(chapter);
    if (!v.ok) return { ok: false, status: 'FAIL', skipped: false, failures: [v.reason], script: node.gate, exitCode: null, code: 'BAD_CHAPTER' };
    args.push('-Chapter', String(v.chapter));
  }
  try {
    const result = io.spawnSync('pwsh', args, { cwd: project, timeout: 120000 });
    const code = result && typeof result.status === 'number' ? result.status : (result && typeof result.exitCode === 'number' ? result.exitCode : 1);
    const text = String(result?.stdout ?? '') + String(result?.stderr ?? '');
    // Raw stderr is NEVER returned to the caller (NG-3): it is classified.
    const failures = code === 0 ? [] : [`script-exit-${code}`];
    return {
      ok: code === 0, status: code === 0 ? 'PASS' : 'FAIL', skipped: false,
      failures, script: node.gate, exitCode: code,
      code: code === 0 ? null : 'SCRIPT_FAIL',
      evidenceRef: `${node.gate}#exit-${code}`,
    };
  } catch (e) {
    return { ok: true, status: 'DEGRADED', skipped: true, failures: [], script: node.gate, exitCode: null, reason: 'runner-unavailable' };
  }
}
