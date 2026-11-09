/**
 * unit-orchestrator.test.mjs — EXHAUSTIVE, multi-angle tests of the pure
 * deterministic engine at lib/orchestrator.js.
 *
 * Contract: docs/orchestration-research.md §4 (+ the extra exports that the
 * shipped module actually provides: STATUSES, GATE_VERDICTS,
 * BOOTSTRAP_BRANCHES, BATCH_SUBSTEPS, EVENT_TYPES, normalizeChapter,
 * artifactPath, logEvent, dispatchArgs, validateDispatch, adjudicate).
 *
 * Run: node test/unit-orchestrator.test.mjs
 *
 * All tests use the real module (no SKIP). io is injected via mockIo.
 */
import {
  check, eq, ne, ok, deepEq, match, noMatch, includes,
  excludes, notThrows, stableStringify, loadEngine, mockIo, finish,
} from './_lib.mjs';

const SUITE = 'unit-orchestrator';
const e = await loadEngine();

/* ========================================================================== */
/* 0. Export shape / contract                                                 */
/* ========================================================================== */

const REQUIRED_EXPORTS = [
  'STATE_VERSION', 'STAGES', 'STAGE_GRAPH', 'createState', 'validateState',
  'serializeState', 'parseState', 'loadState', 'saveState', 'plan',
  'validateTransition', 'advance', 'summarize', 'stageGuard', 'gate',
];
const EXTRA_EXPORTS = [
  'STATUSES', 'GATE_VERDICTS', 'BOOTSTRAP_BRANCHES', 'BATCH_SUBSTEPS',
  'EVENT_TYPES', 'normalizeChapter', 'artifactPath', 'logEvent',
  'dispatchArgs', 'validateDispatch', 'adjudicate',
];

check('all §4 contract exports exist and are the right kind', () => {
  for (const k of REQUIRED_EXPORTS) ok(k in e, `missing export ${k}`);
  for (const k of ['createState', 'validateState', 'serializeState', 'parseState', 'loadState', 'saveState', 'plan', 'validateTransition', 'advance', 'summarize', 'stageGuard', 'gate']) {
    eq(typeof e[k], 'function', `${k} is not a function`);
  }
  eq(typeof e.STATE_VERSION, 'number', 'STATE_VERSION must be a number');
  ok(Array.isArray(e.STAGES), 'STAGES must be an array');
  ok(e.STAGE_GRAPH && typeof e.STAGE_GRAPH === 'object', 'STAGE_GRAPH must be an object');
});
check('all documented extra exports exist', () => {
  for (const k of EXTRA_EXPORTS) ok(k in e, `missing extra export ${k}`);
});
check('STATE_VERSION is a positive integer', () => {
  ok(Number.isInteger(e.STATE_VERSION) && e.STATE_VERSION > 0, `STATE_VERSION=${e.STATE_VERSION}`);
});
check('STAGES is a non-empty ordered array of unique kebab-ish ids', () => {
  ok(e.STAGES.length >= 5, 'too few stages');
  eq(new Set(e.STAGES).size, e.STAGES.length, 'duplicate stages');
  for (const s of e.STAGES) match(s, /^[a-z][a-z0-9-]*$/, `bad stage id ${s}`);
});
check('STAGE_GRAPH has exactly one node per STAGES id', () => {
  deepEq(Object.keys(e.STAGE_GRAPH).sort(), [...e.STAGES].sort());
});
check('every STAGE_GRAPH node has a legal next/onFail in STAGES and non-neg maxRetries', () => {
  for (const [id, node] of Object.entries(e.STAGE_GRAPH)) {
    ok(e.STAGES.includes(node.next), `${id}.next=${node.next} not a stage`);
    ok(e.STAGES.includes(node.onFail), `${id}.onFail=${node.onFail} not a stage`);
    ok(Number.isInteger(node.maxRetries) && node.maxRetries >= 0, `${id}.maxRetries invalid`);
    ok(Array.isArray(node.entry) && Array.isArray(node.produces), `${id}.entry/produces must be arrays`);
  }
});
check('BATCH_SUBSTEPS is a strictly serial ordered list with unique ids', () => {
  ok(Array.isArray(e.BATCH_SUBSTEPS) && e.BATCH_SUBSTEPS.length > 0, 'BATCH_SUBSTEPS missing');
  const ids = e.BATCH_SUBSTEPS.map((s) => s.id);
  eq(new Set(ids).size, ids.length, 'duplicate substep ids');
});
check('STATUSES / GATE_VERDICTS / BOOTSTRAP_BRANCHES / EVENT_TYPES are valid closed sets', () => {
  for (const k of ['STATUSES', 'GATE_VERDICTS', 'BOOTSTRAP_BRANCHES', 'EVENT_TYPES']) {
    ok(Array.isArray(e[k]) && e[k].length > 0 && new Set(e[k]).size === e[k].length, `${k} invalid`);
  }
  ok(e.STATUSES.includes('running') && e.STATUSES.includes('done'), 'statuses must include running/done');
  ok(e.BOOTSTRAP_BRANCHES.every((b) => e.STAGES.includes(b)), 'bootstrap branches must be stages');
});

/* ========================================================================== */
/* 1. createState / validateState                                             */
/* ========================================================================== */

check('createState() produces a valid initial state at bootstrap/idle', () => {
  const s = e.createState({ project: '/p', goal: 'write a book' });
  eq(s.stage, 'bootstrap');
  eq(s.status, 'idle');
  eq(s.version, e.STATE_VERSION);
  eq(s.project, '/p');
  eq(s.goal, 'write a book');
  eq(s.retries, 0);
  eq(s.branch, null);
  eq(s.chapter, null);
  eq(s.batchStep, null);
  ok(Array.isArray(s.history) && Array.isArray(s.log), 'history/log arrays');
  ok(typeof s.runId === 'string' && s.runId.length > 0, 'runId');
  eq(e.validateState(s).ok, true, 'fresh state must validate');
});
check('createState() bounds goal to 500 chars', () => {
  const s = e.createState({ project: 'p', goal: 'x'.repeat(900) });
  eq(s.goal.length, 500);
});
check('createState() distinct runIds per call', () => {
  ne(e.createState({}).runId, e.createState({}).runId);
});
check('validateState rejects every malformed field', () => {
  const good = e.createState({ project: 'p' });
  const bad = [
    null, [], 'string', 42,
    { ...good, version: e.STATE_VERSION + 99 },
    { ...good, stage: 'not-a-stage' },
    { ...good, status: 'not-a-status' },
    { ...good, retries: -1 },
    { ...good, retries: 1.5 },
    { ...good, history: null },
    { ...good, log: 'x' },
    { ...good, project: 5 },
    { ...good, runId: 5 },
    { ...good, branch: 'bogus' },
    { ...good, chapter: 0 },
    { ...good, chapter: 100000 },
  ];
  for (const b of bad) {
    const v = e.validateState(b);
    eq(v.ok, false, `should reject ${stableStringify(b).slice(0, 90)}`);
    ok(typeof v.error === 'string' && v.error.length > 0, 'error message required');
  }
});
check('validateState accepts every valid status and branch combination', () => {
  for (const status of e.STATUSES) {
    const s = { ...e.createState({ project: 'p' }), status };
    eq(e.validateState(s).ok, true, `status ${status}`);
  }
  for (const branch of [null, ...e.BOOTSTRAP_BRANCHES]) {
    const s = { ...e.createState({ project: 'p' }), branch };
    eq(e.validateState(s).ok, true, `branch ${branch}`);
  }
  for (const chapter of [null, 1, 15, 99999, '007']) {
    const s = { ...e.createState({ project: 'p' }), chapter };
    eq(e.validateState(s).ok, true, `chapter ${chapter}`);
  }
});

/* ========================================================================== */
/* 2. serializeState / parseState round-trip                                  */
/* ========================================================================== */

check('serializeState returns a string with stable key order', () => {
  const s = e.createState({ project: 'p', goal: 'g' });
  const a = e.serializeState(s);
  ok(typeof a === 'string' && a.length > 0);
  const shuffled = { updatedAt: s.updatedAt, gate: s.gate, log: s.log, history: s.history, chapter: s.chapter, batchStep: s.batchStep, status: s.status, stage: s.stage, branch: s.branch, goal: s.goal, project: s.project, runId: s.runId, createdAt: s.createdAt, retries: s.retries, version: s.version };
  eq(a, e.serializeState(shuffled), 'key order must not affect bytes');
});
check('parseState round-trips a serialized state exactly', () => {
  const s = e.createState({ project: 'p', goal: 'g' });
  s.stage = 'design'; s.status = 'running'; s.chapter = 7; s.retries = 2;
  const p = e.parseState(e.serializeState(s));
  eq(p.ok, true, p.error);
  deepEq(p.state, s, 'round-trip deep equality');
});
check('parseState rejects malformed JSON with a reason, never throws', () => {
  for (const bad of ['{oops', '', 'null', '[]', '{"version":2}', 'not json at all']) {
    const r = e.parseState(bad);
    eq(r.ok, false, `should reject ${JSON.stringify(bad)}`);
    ok(typeof r.error === 'string' && r.error.length > 0, 'error required');
  }
});
check('parseState rejects structurally-invalid but parseable JSON', () => {
  const r = e.parseState(JSON.stringify({ version: e.STATE_VERSION, stage: 'design', status: 'running', retries: 0, history: [], log: [], project: 'p', runId: 'r', branch: null, chapter: 0 }));
  eq(r.ok, false, 'invalid chapter must be rejected');
});
check('serializeState(parseState(x).state) === x (byte-stable)', () => {
  const s = e.createState({ project: 'p' }); s.stage = 'write'; s.status = 'running';
  const x = e.serializeState(s);
  eq(e.serializeState(e.parseState(x).state), x);
});

/* ========================================================================== */
/* 3. validateTransition — EXHAUSTIVE matrix over stages x event types        */
/* ========================================================================== */

const EVENTS_WITH_VALID_ARGS = e.EVENT_TYPES.map((type) => ({ type, branch: e.BOOTSTRAP_BRANCHES[0], chapter: 1 }));

/** Build a state for a stage with a "normal" running status. */
function stateAt(stage, status = 'running') {
  const s = e.createState({ project: '/p', goal: 'g' });
  s.stage = stage;
  s.status = stage === 'done' ? 'done' : status;
  return s;
}

function expectedAllowed(stage, ev) {
  // Derived from the documented rules, not from the implementation.
  if (ev.type === 'reset') return true;
  if (stage === 'done') return false;
  if (ev.type === 'start') return false; // we use status 'running' for the matrix
  if (ev.type === 'select-branch') return stage === 'bootstrap' && e.BOOTSTRAP_BRANCHES.includes(ev.branch);
  if (ev.type === 'batch-step') return stage === 'batch';
  if (['gate-pass', 'gate-fail', 'skip'].includes(ev.type)) return stage !== 'bootstrap';
  // pause/retry/resume/fail allowed from running in most stages
  return true;
}

check('EXHAUSTIVE validateTransition matrix: STAGES x EVENT_TYPES matches derived table', () => {
  let cells = 0;
  for (const stage of e.STAGES) {
    const s = stateAt(stage);
    for (const ev of EVENTS_WITH_VALID_ARGS) {
      cells += 1;
      const got = e.validateTransition(s, ev).ok;
      const exp = expectedAllowed(stage, ev);
      eq(got, exp, `stage=${stage} event=${ev.type}`);
    }
  }
  ok(cells >= e.STAGES.length * e.EVENT_TYPES.length, 'matrix coverage');
});
check('validateTransition rejects every unknown event type on every stage', () => {
  for (const stage of e.STAGES) {
    const s = stateAt(stage);
    for (const bogus of ['bogus', 'START', '', 'gate_pass', null, undefined]) {
      eq(e.validateTransition(s, { type: bogus }).ok, false, `${stage}/${bogus}`);
    }
  }
});
check('validateTransition rejects non-object events', () => {
  const s = stateAt('design');
  for (const ev of [null, undefined, 'gate-pass', 5, []]) eq(e.validateTransition(s, ev).ok, false);
});
check('validateTransition: start only legal from idle/blocked/paused', () => {
  for (const status of e.STATUSES) {
    const s = { ...stateAt('bootstrap'), status };
    const exp = ['idle', 'blocked', 'paused'].includes(status);
    eq(e.validateTransition(s, { type: 'start' }).ok, exp, `start from ${status}`);
  }
});
check('validateTransition: select-branch only at bootstrap with a legal branch', () => {
  for (const stage of e.STAGES) {
    for (const branch of [...e.BOOTSTRAP_BRANCHES, 'bogus', undefined]) {
      const s = stateAt(stage);
      const exp = stage === 'bootstrap' && e.BOOTSTRAP_BRANCHES.includes(branch);
      eq(e.validateTransition(s, { type: 'select-branch', branch }).ok, exp, `${stage}/${branch}`);
    }
  }
});
check('validateTransition: gate/batch-step/retry/pause/fail require running|retrying', () => {
  const guarded = ['gate-pass', 'gate-fail', 'batch-step', 'retry', 'pause', 'fail'];
  for (const stage of e.STAGES.filter((s) => s !== 'bootstrap' && s !== 'done')) {
    for (const ev of guarded) {
      for (const status of ['idle', 'running', 'retrying', 'paused', 'done']) {
        // batch-step additionally requires stage === batch.
        const s = { ...stateAt(stage), status };
        let exp = ['running', 'retrying'].includes(status);
        if (ev === 'batch-step') exp = exp && stage === 'batch';
        eq(e.validateTransition(s, { type: ev, chapter: 1 }).ok, exp, `${stage}/${ev}/${status}`);
      }
    }
  }
});
check('validateTransition: event.stage mismatch rejected; matching accepted', () => {
  const s = stateAt('design');
  eq(e.validateTransition(s, { type: 'gate-pass', stage: 'write' }).ok, false);
  eq(e.validateTransition(s, { type: 'gate-pass', stage: 'design' }).ok, true);
});
check('validateTransition: chapter traversal / floats / negatives rejected', () => {
  const s = stateAt('design');
  for (const c of [0, -1, 1.5, 100000, '1/../../etc', '../../etc', 'abc', NaN, Infinity]) {
    eq(e.validateTransition(s, { type: 'gate-pass', chapter: c }).ok, false, `chapter ${String(c)}`);
  }
  for (const c of [1, 15, 99999, '007']) {
    eq(e.validateTransition(s, { type: 'gate-pass', chapter: c }).ok, true, `chapter ${String(c)}`);
  }
});
check('validateTransition: done is terminal except reset', () => {
  const s = stateAt('done');
  for (const ev of EVENTS_WITH_VALID_ARGS) {
    const exp = ev.type === 'reset';
    eq(e.validateTransition(s, ev).ok, exp, `done/${ev.type}`);
  }
});

/* ========================================================================== */
/* 4. advance() — pure reducer, valid transitions, invalid rejection          */
/* ========================================================================== */

check('advance() NEVER mutates its input state (all event types)', () => {
  for (const stage of e.STAGES) {
    for (const ev of EVENTS_WITH_VALID_ARGS) {
      const s = stateAt(stage);
      const before = stableStringify(s);
      let r;
      notThrows(() => { r = e.advance(s, ev); }, `advance threw at ${stage}/${ev.type}`);
      eq(stableStringify(s), before, `input mutated at ${stage}/${ev.type}`);
      ok(r && typeof r.ok === 'boolean' && r.state, 'result shape');
    }
  }
});
check('advance() rejects invalid transitions and returns {ok:false,reason,state===input}', () => {
  const s = stateAt('design');
  const r = e.advance(s, { type: 'bogus' });
  eq(r.ok, false);
  ok(typeof r.reason === 'string' && r.reason.length > 0, 'reason required');
  eq(stableStringify(r.state), stableStringify(s), 'rejected advance must not change state');
});
check('happy path: start -> select-branch -> gate-pass chain reaches done', () => {
  let s = e.createState({ project: '/p', goal: 'g' });
  let r = e.advance(s, { type: 'start', at: 1 });
  eq(r.ok, true); eq(r.state.status, 'running'); eq(r.state.stage, 'bootstrap');
  s = r.state;
  r = e.advance(s, { type: 'select-branch', branch: 'constitution', at: 2 });
  eq(r.ok, true); eq(r.state.stage, 'constitution'); eq(r.state.branch, 'constitution');
  s = r.state;
  let guard = 0;
  while (s.stage !== 'done' && guard < 200) {
    r = e.advance(s, { type: 'gate-pass', at: 10 + guard });
    eq(r.ok, true, `gate-pass rejected at ${s.stage}`);
    s = r.state;
    guard += 1;
  }
  eq(s.stage, 'done', 'chain must reach done');
  eq(s.status, 'done');
  ok(guard < 200, 'no infinite loop');
});
check('all three bootstrap branches reach outline then done via gate-pass', () => {
  for (const branch of e.BOOTSTRAP_BRANCHES) {
    let s = e.advance(e.createState({ project: '/p' }), { type: 'start', at: 1 }).state;
    s = e.advance(s, { type: 'select-branch', branch, at: 2 }).state;
    eq(s.stage, branch, `branch ${branch}`);
    let guard = 0;
    while (s.stage !== 'done' && guard < 200) { s = e.advance(s, { type: 'gate-pass', at: guard + 3 }).state; guard += 1; }
    eq(s.stage, 'done', `branch ${branch} did not finish`);
  }
});
check('every STAGE_GRAPH node.next is exactly where gate-pass lands (non-batch)', () => {
  for (const stage of e.STAGES.filter((s) => s !== 'batch' && s !== 'done' && s !== 'bootstrap')) {
    const s = stateAt(stage);
    const r = e.advance(s, { type: 'gate-pass', at: 5 });
    eq(r.ok, true, `gate-pass at ${stage}`);
    eq(r.state.stage, e.STAGE_GRAPH[stage].next, `${stage}.next`);
    eq(r.state.retries, 0, 'gate-pass resets retries');
  }
});
check('skip is an audited DEGRADED override that still advances one stage', () => {
  for (const stage of e.STAGES.filter((s) => s !== 'bootstrap' && s !== 'done')) {
    const s = stateAt(stage);
    const r = e.advance(s, { type: 'skip', at: 5 });
    eq(r.ok, true, `skip at ${stage}`);
    eq(r.state.stage, e.STAGE_GRAPH[stage].next, `skip next for ${stage}`);
    eq(r.state.gate.verdict, 'DEGRADED');
    eq(r.state.gate.skipped, true);
    ok(r.state.history.some((h) => h.event === 'skip'), 'skip must be recorded in history');
  }
});
check('pause / resume / fail / retry status transitions', () => {
  let s = stateAt('design');
  s = e.advance(s, { type: 'pause', at: 1 }).state; eq(s.status, 'paused');
  s = e.advance(s, { type: 'resume', at: 2 }).state; eq(s.status, 'running');
  s = e.advance(s, { type: 'fail', at: 3 }).state; eq(s.status, 'failed');
  // retry is gated by validateTransition to running|retrying only: rejected
  // from `failed` and from `paused`; accepted from `retrying`.
  eq(e.advance(s, { type: 'retry' }).ok, false, 'retry from failed must be rejected');
  const p = stateAt('design', 'paused');
  eq(e.advance(p, { type: 'retry' }).ok, false, 'retry from paused must be rejected');
  const rt = stateAt('design', 'retrying');
  eq(e.advance(rt, { type: 'retry' }).state.status, 'running', 'retry from retrying -> running');
});
check('reset returns a fresh bootstrap state with a new runId, preserving project', () => {
  const s = { ...stateAt('batch'), project: '/special', goal: 'old', chapter: 47 };
  const r = e.advance(s, { type: 'reset', at: 9, goal: 'new goal' });
  eq(r.ok, true);
  eq(r.state.stage, 'bootstrap');
  eq(r.state.status, 'idle');
  eq(r.state.project, '/special');
  eq(r.state.goal, 'new goal');
  ne(r.state.runId, s.runId);
  eq(r.state.chapter, null);
});
check('gate-fail honors maxRetries budget then pauses at onFail', () => {
  for (const startStage of e.STAGES.filter((s) => s !== 'bootstrap' && s !== 'done')) {
    let s = stateAt(startStage);
    // Each gate-fail moves to the CURRENT node's onFail; the applicable budget
    // is that node's maxRetries. Repeat until paused (bounded to avoid loops).
    // This correctly handles `validate` whose onFail is `write` (different
    // budget) — the budget is re-read from the node actually being executed.
    let attempt = 0;
    while (s.status !== 'paused' && attempt < 20) {
      attempt += 1;
      const node = e.STAGE_GRAPH[s.stage];
      const r = e.advance(s, { type: 'gate-fail', failures: [`f${attempt}`], at: attempt });
      eq(r.ok, true, `gate-fail at ${startStage} attempt ${attempt} (${s.stage})`);
      s = r.state;
      eq(s.stage, node.onFail, `onFail of ${node.next ? s.stage : startStage}`);
      ok(['retrying', 'paused'].includes(s.status), `${startStage} status after gate-fail: ${s.status}`);
      ok(s.retries >= 0 && s.retries <= Math.max(1, node.maxRetries), `${startStage} retries bounded: ${s.retries}`);
    }
    eq(s.status, 'paused', `${startStage} must eventually pause`);
    // A further gate-fail from paused is rejected (no unbounded retries).
    eq(e.advance(s, { type: 'gate-fail', failures: ['x'] }).ok, false, `${startStage} must not over-retry`);
    ok(attempt <= 10, `${startStage} pause must be bounded, got ${attempt}`);
  }
});
check('gate-pass after a gate-fail resets retries to 0', () => {
  let s = stateAt('design');
  s = e.advance(s, { type: 'gate-fail', failures: ['x'], at: 1 }).state;
  eq(s.status, 'retrying', 'precondition');
  // resume to running so gate-pass is legal
  s = e.advance(s, { type: 'resume', at: 2 }).state;
  const r = e.advance(s, { type: 'gate-pass', at: 3 });
  eq(r.ok, true);
  eq(r.state.retries, 0);
});
check('advance() records bounded history/log entries with structured shapes', () => {
  let s = e.advance(e.createState({ project: '/p' }), { type: 'start', at: 1 }).state;
  for (let i = 0; i < 20; i += 1) {
    s = e.advance(s, i % 2 === 0 ? { type: 'pause', at: i + 2 } : { type: 'resume', at: i + 2 }).state;
  }
  ok(s.history.length >= 1 && s.log.length >= 1, 'history/log populated');
  ok(s.history.length <= 128 && s.log.length <= 128, 'history/log bounded');
  for (const h of s.history) {
    ok(typeof h.event === 'string' && typeof h.verdict === 'string', 'history shape');
  }
});
check('history/log stay bounded at MAX_HISTORY under 300 transitions', () => {
  let s = e.advance(e.createState({ project: '/p' }), { type: 'start', at: 1 }).state;
  for (let i = 0; i < 300; i += 1) {
    s = e.advance(s, i % 2 === 0 ? { type: 'pause', at: i + 2 } : { type: 'resume', at: i + 2 }).state;
  }
  ok(s.history.length <= 128, `history=${s.history.length}`);
  ok(s.log.length <= 128, `log=${s.log.length}`);
});

/* ========================================================================== */
/* 5. BATCH nested sub-FSM                                                    */
/* ========================================================================== */

check('gate-pass walks every BATCH_SUBSTEPS id in strict serial order', () => {
  const ids = e.BATCH_SUBSTEPS.map((s) => s.id);
  let s = stateAt('batch');
  s.batchStep = ids[0];
  s.chapter = 1;
  for (let i = 0; i < ids.length - 1; i += 1) {
    eq(s.batchStep, ids[i], `at index ${i}`);
    const r = e.advance(s, { type: 'gate-pass', at: i + 1 });
    eq(r.ok, true, `gate-pass in batch at ${ids[i]}`);
    s = r.state;
  }
  eq(s.batchStep, ids[ids.length - 1], 'must reach last substep');
});
check('final substep gate-pass advances chapter when totalChapters > chapter', () => {
  const last = e.BATCH_SUBSTEPS[e.BATCH_SUBSTEPS.length - 1].id;
  let s = stateAt('batch');
  s.batchStep = last; s.chapter = 3; s.totalChapters = 5;
  const r = e.advance(s, { type: 'gate-pass', at: 1 });
  eq(r.ok, true);
  eq(r.state.chapter, 4, 'chapter increments');
  eq(r.state.batchStep, e.BATCH_SUBSTEPS[0].id, 'restart sub-FSM for next chapter');
});
check('final substep gate-pass leaves batch -> export at/after final chapter', () => {
  const last = e.BATCH_SUBSTEPS[e.BATCH_SUBSTEPS.length - 1].id;
  let s = stateAt('batch');
  s.batchStep = last; s.chapter = 5; s.totalChapters = 5;
  const r = e.advance(s, { type: 'gate-pass', at: 1 });
  eq(r.ok, true);
  eq(r.state.stage, e.STAGE_GRAPH.batch.next, 'batch -> next stage');
  eq(r.state.batchStep, null, 'substep cleared');
});
check('batch-step sets chapter + step and validates typed args', () => {
  const s = stateAt('batch');
  const r = e.advance(s, { type: 'batch-step', chapter: 12, step: 'A1', totalChapters: 30, at: 1 });
  eq(r.ok, true);
  eq(r.state.chapter, 12);
  eq(r.state.batchStep, 'A1');
  eq(r.state.totalChapters, 30);
});
check('batch-step with invalid chapter is rejected', () => {
  const s = stateAt('batch');
  for (const c of [0, -3, 1.5, 100000, '../etc', 'abc']) {
    eq(e.advance(s, { type: 'batch-step', chapter: c }).ok, false, `chapter ${String(c)}`);
  }
});
check('batch-step outside stage batch is rejected (lead fix)', () => {
  for (const stage of e.STAGES.filter((s) => s !== 'batch')) {
    const s = stateAt(stage);
    eq(e.validateTransition(s, { type: 'batch-step', chapter: 1 }).ok, false, `batch-step at ${stage}`);
    eq(e.advance(s, { type: 'batch-step', chapter: 1 }).ok, false, `advance batch-step at ${stage}`);
  }
});

/* ========================================================================== */
/* 6. Gate predicates: stageGuard / gate                                      */
/* ========================================================================== */

check('stageGuard: ok with empty missing when stage has no entry artifacts', () => {
  const io = mockIo();
  for (const stage of e.STAGES.filter((s) => e.STAGE_GRAPH[s].entry.length === 0)) {
    const r = e.stageGuard(stage, io, '/p', stateAt(stage));
    eq(r.ok, true, `${stage} guard`);
    deepEq(r.missing, []);
  }
});
check('stageGuard: reports every missing entry artifact (no throw on io error)', () => {
  const io = mockIo();
  for (const stage of e.STAGES.filter((s) => e.STAGE_GRAPH[s].entry.length > 0)) {
    const r = e.stageGuard(stage, io, '/p', stateAt(stage));
    eq(r.ok, false, `${stage} guard should fail`);
    deepEq(r.missing, e.STAGE_GRAPH[stage].entry, `${stage} missing list`);
  }
});
check('stageGuard: ok when all entry artifacts exist', () => {
  const files = {};
  for (const stage of e.STAGES) for (const rel of e.STAGE_GRAPH[stage].entry) files[`/p/${rel}`] = 'x';
  const io = mockIo(files);
  for (const stage of e.STAGES) eq(e.stageGuard(stage, io, '/p', stateAt(stage)).ok, true, `${stage} guard`);
});
check('stageGuard: unknown stage -> {ok:false,missing:[...]}', () => {
  const r = e.stageGuard('nope', mockIo(), '/p', {});
  eq(r.ok, false);
  ok(r.missing.length > 0);
});
check('gate: stage with no validator -> PASS skipped (no-validator)', () => {
  // BATCH is special: its gates live on the 15 nested sub-steps, so a batch
  // state WITH a batchStep resolves a real sub-step script (B1). Only stages
  // with no validator at all (and batch with no sub-step) skip.
  for (const stage of e.STAGES.filter((s) => !e.STAGE_GRAPH[s].gate && s !== 'batch')) {
    const r = e.gate(stage, mockIo(), '/p', stateAt(stage));
    eq(r.ok, true, `${stage} gate`);
    eq(r.status, 'PASS');
    eq(r.skipped, true);
    eq(r.script, null);
    deepEq(r.failures, []);
  }
  // A batch sub-step with a gate must resolve that script, not skip.
  const bs = stateAt('batch'); bs.batchStep = 'A1'; bs.chapter = 3;
  const io = mockIo({ '/p/novel/outline.md': 'x' }, { spawnSync: () => ({ status: 0 }) });
  const bg = e.gate('batch', io, '/p', bs);
  eq(bg.status, 'PASS');
  eq(bg.script, '.dsh/scripts/validate-design.ps1');
  eq(io.calls.spawnSync.length, 1, 'sub-step validator actually spawned');
});
check('gate: unknown stage -> FAIL, not skipped', () => {
  const r = e.gate('nope', mockIo(), '/p', {});
  eq(r.ok, false); eq(r.status, 'FAIL'); eq(r.skipped, false);
});
check('gate: ENTRY_GUARD fails before spawning when artifacts missing', () => {
  const io = mockIo({}, { spawnSync: () => { throw new Error('must not spawn'); } });
  const r = e.gate('design', io, '/p', stateAt('design'));
  eq(r.ok, false);
  eq(r.code, 'ENTRY_GUARD');
  eq(r.exitCode, null);
  ok(r.failures.some((f) => f.startsWith('missing:')), 'missing: classified failures');
  eq(io.calls.spawnSync.length, 0, 'spawnSync must not run');
});
check('gate: exit code 0 -> PASS; non-zero -> FAIL with classified code only', () => {
  const files = { '/p/novel/outline.md': 'x' };
  const s = stateAt('design'); s.chapter = 7;
  const pass = e.gate('design', mockIo(files, { spawnSync: () => ({ status: 0, stdout: '', stderr: '' }) }), '/p', s);
  eq(pass.ok, true); eq(pass.status, 'PASS'); eq(pass.exitCode, 0);
  eq(pass.evidenceRef, '.dsh/scripts/validate-design.ps1#exit-0');
  const fail = e.gate('design', mockIo(files, { spawnSync: () => ({ status: 3, stdout: 'RAW', stderr: 'TOP_SECRET_STDERR' }) }), '/p', s);
  eq(fail.ok, false); eq(fail.status, 'FAIL'); eq(fail.exitCode, 3);
  eq(fail.code, 'SCRIPT_FAIL');
  deepEq(fail.failures, ['script-exit-3'], 'only classified failure');
  excludes(JSON.stringify(fail), 'TOP_SECRET_STDERR', 'raw stderr must never leak');
  excludes(JSON.stringify(fail), 'RAW', 'raw stdout must never leak');
});
check('gate: uses -NoProfile -File and -Chapter <int>, NEVER -Command', () => {
  const files = { '/p/novel/outline.md': 'x' };
  const s = stateAt('design'); s.chapter = 15;
  const io = mockIo(files, { spawnSync: () => ({ status: 0 }) });
  e.gate('design', io, '/p', s);
  eq(io.calls.spawnSync.length, 1);
  const [cmd, args] = io.calls.spawnSync[0];
  eq(cmd, 'pwsh');
  includes(args.join(' '), '-NoProfile');
  includes(args.join(' '), '-File');
  excludes(args.join(' '), '-Command');
  excludes(args.join(' '), '-c ');
  ok(args.includes('.dsh/scripts/validate-design.ps1'), 'validator path');
  ok(args.includes('-Chapter') && args.includes('15'), 'integer chapter arg');
});
check('gate: runner unavailable / throw -> DEGRADED skipped, never a silent PASS', () => {
  // B3: DEGRADED must carry ok=false so no caller can mistake it for a pass.
  const files = { '/p/novel/outline.md': 'x' };
  const s = stateAt('design');
  const a = e.gate('design', mockIo(files, { spawnSync: () => { throw new Error('no pwsh'); } }), '/p', s);
  eq(a.ok, false); eq(a.status, 'DEGRADED'); eq(a.skipped, true); eq(a.reason, 'runner-unavailable');
  const noRunner = { ...mockIo(files), spawnSync: undefined };
  const b = e.gate('design', noRunner, '/p', s);
  eq(b.ok, false); eq(b.status, 'DEGRADED'); eq(b.reason, 'no-script-runner'); eq(b.skipped, true);
});
check('gate: bad chapter -> BAD_CHAPTER FAIL, never spawns', () => {
  const files = { '/p/novel/outline.md': 'x' };
  const s = stateAt('design'); s.chapter = 0; // invalid via direct assignment
  const io = mockIo(files, { spawnSync: () => ({ status: 0 }) });
  const r = e.gate('design', io, '/p', s);
  eq(r.ok, false); eq(r.code, 'BAD_CHAPTER');
  eq(io.calls.spawnSync.length, 0);
});

/* ========================================================================== */
/* 7. Checkpoint: saveState / loadState / corruption / resume                 */
/* ========================================================================== */

check('saveState writes tmp then renames atomically (never throws)', () => {
  const io = mockIo();
  const s = e.createState({ project: '/p', goal: 'g' }); s.stage = 'write'; s.status = 'running';
  const r = e.saveState(io, '/p', s);
  eq(r.ok, true, r.error);
  ok(io.calls.mkdir.some((p) => p.includes('.dsh/state')), 'state dir created');
  ok(io.calls.writeFile.some(([p]) => p.endsWith('.tmp')), 'tmp file written');
  ok(io.calls.rename.some(([a, b]) => a.endsWith('.tmp') && b.endsWith('checkpoint.json')), 'tmp renamed to checkpoint');
  const cp = '/p/.dsh/state/novel-mode.checkpoint.json';
  ok(io.store.has(cp), 'checkpoint persisted');
});
check('saveState rejects an invalid state (never writes garbage)', () => {
  const io = mockIo();
  const r = e.saveState(io, '/p', { version: 0, stage: 'nope' });
  eq(r.ok, false);
  eq(io.calls.writeFile.length, 0, 'must not write invalid state');
});
check('saveState never throws when io fails (returns {ok:false})', () => {
  const s = e.createState({ project: '/p' });
  const io = { ...mockIo(), writeFile: () => { throw new Error('disk full'); } };
  let r;
  notThrows(() => { r = e.saveState(io, '/p', s); });
  eq(r.ok, false);
  ok(typeof r.error === 'string');
});
check('loadState: missing checkpoint -> fresh valid state (no throw)', () => {
  const io = mockIo();
  const r = e.loadState(io, '/p', { goal: 'hello' });
  eq(r.ok, true);
  eq(r.fresh, true);
  eq(r.state.stage, 'bootstrap');
  eq(r.state.goal, 'hello');
  eq(e.validateState(r.state).ok, true);
  ne(r.recovered, true);
});
check('saveState->loadState round-trip: exact byte equality + project re-anchor', () => {
  // Use the SAME project for save + load so only the re-anchor is exercised
  // (loadState re-anchors to the project passed to it, by design).
  const io = mockIo();
  const s = e.createState({ project: '/P', goal: 'g' });
  s.stage = 'batch'; s.status = 'running'; s.chapter = 47; s.batchStep = 'D3'; s.retries = 2;
  eq(e.saveState(io, '/P', s).ok, true);
  const r = e.loadState(io, '/P', { goal: '' });
  eq(r.ok, true); eq(r.fresh, false);
  eq(r.state.project, '/P', 'project re-anchored to load project');
  eq(e.serializeState(r.state), e.serializeState(s), 'round-trip byte equality');
});
check('loadState preserves run identity and re-anchors project field', () => {
  const io = mockIo();
  const s = e.createState({ project: '/P', goal: 'g' });
  eq(e.saveState(io, '/P', s).ok, true);
  const r = e.loadState(io, '/P', { goal: '' });
  eq(r.ok, true);
  eq(r.fresh, false, 'existing checkpoint must load, not a fresh state');
  eq(r.state.project, '/P', 'project re-anchored to the load project');
  eq(r.state.runId, s.runId, 'run identity preserved across checkpoint');
  eq(r.state.goal, 'g', 'goal preserved');
});
check('resume from EVERY stage: load a saved state and continue with a legal event', () => {
  for (const stage of e.STAGES.filter((s) => s !== 'done')) {
    const io = mockIo();
    const s = stateAt(stage);
    eq(e.saveState(io, '/p', s).ok, true, `save ${stage}`);
    const loaded = e.loadState(io, '/p', { goal: '' });
    eq(loaded.ok, true, `load ${stage}`);
    eq(loaded.state.stage, stage, `resumed stage ${stage}`);
    // A legal event must be accepted from the resumed state.
    const ev = stage === 'bootstrap' ? { type: 'select-branch', branch: 'import', at: 1 } : { type: 'pause', at: 1 };
    const r = e.advance(loaded.state, ev);
    eq(r.ok, true, `advance after resume at ${stage}`);
  }
});
check('loadState: corrupt checkpoint -> backup + fresh + recovered (no throw)', () => {
  const cp = '/p/.dsh/state/novel-mode.checkpoint.json';
  const bk = '/p/.dsh/state/novel-mode.checkpoint.corrupt.json';
  const io = mockIo({ [cp]: 'THIS IS NOT JSON {' });
  let r;
  notThrows(() => { r = e.loadState(io, '/p', { goal: '' }); });
  eq(r.ok, true); eq(r.recovered, true); eq(r.fresh, true);
  eq(r.state.stage, 'bootstrap');
  ok(typeof r.reason === 'string' && r.reason.length > 0, 'reason recorded');
  ok(io.store.has(bk), 'corrupt file backed up');
  eq(io.store.get(bk), 'THIS IS NOT JSON {', 'backup preserves corrupt bytes');
  eq(r.state.log.length, 1, 'recovery logged');
});
check('loadState: schema-invalid checkpoint is treated as corrupt (recovered)', () => {
  const cp = '/p/.dsh/state/novel-mode.checkpoint.json';
  const io = mockIo({ [cp]: JSON.stringify({ version: 999, stage: 'design', status: 'running', retries: 0, history: [], log: [], project: 'p', runId: 'r', branch: null, chapter: null }) });
  const r = e.loadState(io, '/p', { goal: '' });
  eq(r.ok, true); eq(r.recovered, true);
  eq(r.state.stage, 'bootstrap');
});
check('loadState: io read error -> recovered fresh, never throws', () => {
  const io = { ...mockIo(), exists: () => true, readFile: () => { throw new Error('EACCES'); } };
  let r; notThrows(() => { r = e.loadState(io, '/p', { goal: '' }); });
  eq(r.ok, true); eq(r.recovered, true); eq(r.state.stage, 'bootstrap');
});
check('idempotent re-entry: save same state twice yields byte-identical checkpoint', () => {
  const io = mockIo();
  const s = e.createState({ project: '/p' }); s.stage = 'write'; s.status = 'running';
  eq(e.saveState(io, '/p', s).ok, true);
  const first = io.store.get('/p/.dsh/state/novel-mode.checkpoint.json');
  eq(e.saveState(io, '/p', s).ok, true);
  const second = io.store.get('/p/.dsh/state/novel-mode.checkpoint.json');
  eq(second, first, 'byte-identical');
});

/* ========================================================================== */
/* 8. plan / summarize / dispatch / adjudicate / helpers                      */
/* ========================================================================== */

check('plan(done) -> {action:"done",done:true}', () => {
  const r = e.plan(stateAt('done'));
  eq(r.action, 'done'); eq(r.done, true);
});
check('plan(bootstrap) -> select-branch with all branch options', () => {
  const r = e.plan(stateAt('bootstrap'));
  eq(r.action, 'select-branch');
  deepEq(r.options, e.BOOTSTRAP_BRANCHES);
  eq(r.done, false);
});
check('plan(paused|blocked|failed|aborted) -> paused action, never done', () => {
  for (const status of ['blocked', 'paused', 'failed', 'aborted']) {
    const r = e.plan({ ...stateAt('design'), status });
    eq(r.action, 'paused', `status ${status}`);
    eq(r.done, false);
  }
});
check('plan(run-stage) names the STAGE_GRAPH skill/gate + typed params', () => {
  for (const stage of e.STAGES.filter((s) => !['bootstrap', 'batch', 'done'].includes(s))) {
    const r = e.plan(stateAt(stage));
    eq(r.action, 'run-stage', `plan ${stage}`);
    eq(r.stage, stage);
    eq(r.skill, e.STAGE_GRAPH[stage].skill, `skill ${stage}`);
    eq(r.gate, e.STAGE_GRAPH[stage].gate, `gate ${stage}`);
    eq(r.maxRetries, e.STAGE_GRAPH[stage].maxRetries, `maxRetries ${stage}`);
    eq(e.validateDispatch(r.params).ok, true, `params ${stage}`);
  }
});
check('plan(batch with substep) -> batch-step with step/gate/chapter', () => {
  const s = stateAt('batch'); s.batchStep = 'C'; s.chapter = 9;
  const r = e.plan(s);
  eq(r.action, 'batch-step'); eq(r.step, 'C'); eq(r.chapter, 9);
  eq(r.gate, e.BATCH_SUBSTEPS.find((x) => x.id === 'C').gate);
  eq(e.validateDispatch(r.params).ok, true);
});
check('summarize is bounded & structured (no prose fields, fixed key set)', () => {
  const s = stateAt('design'); s.chapter = 4;
  const r = e.summarize(s);
  for (const k of ['version', 'runId', 'project', 'goal', 'branch', 'stage', 'batchStep', 'chapter', 'totalChapters', 'status', 'retries', 'gate', 'historyLength', 'logLength', 'recent', 'recentLog', 'next']) {
    ok(k in r, `summarize missing ${k}`);
  }
  ok(Array.isArray(r.recent) && r.recent.length <= 5, 'recent bounded');
  ok(Array.isArray(r.recentLog) && r.recentLog.length <= 5, 'recentLog bounded');
  eq(typeof r.historyLength, 'number');
  ok(r.next && typeof r.next === 'object', 'next plan included');
});
check('normalizeChapter accepts ints/strings 1..99999 with 3-digit dir', () => {
  for (const [v, n, d] of [[1, 1, '001'], [15, 15, '015'], ['007', 7, '007'], [99999, 99999, '99999']]) {
    const r = e.normalizeChapter(v);
    eq(r.ok, true); eq(r.chapter, n); eq(r.dir, d);
  }
});
check('normalizeChapter rejects traversal / floats / negatives / NaN / out-of-range', () => {
  // 0x10 == 16 is a VALID integer in 1..99999, so it must be accepted; the
  // function normalizes by value, not by literal spelling.
  for (const v of [0, -1, 1.5, 100000, 'abc', '1/../../etc', '..', '../../etc/passwd', '1 OR 1=1', NaN, Infinity, null, undefined, {}, []]) {
    const r = e.normalizeChapter(v);
    eq(r.ok, false, `should reject ${String(v)}`);
  }
  eq(e.normalizeChapter(0x10).chapter, 16, '0x10 is valid integer 16');
});
check('artifactPath builds project/rel and rejects traversal / absolute / drive', () => {
  eq(e.artifactPath('/p', 'novel/outline.md'), '/p/novel/outline.md');
  for (const bad of ['../etc', 'novel/../../etc', '/etc/passwd', 'C:\\x', 'a:b', 'a*b', 'a?b']) {
    eq(e.artifactPath('/p', bad), null, `should reject ${bad}`);
  }
});
check('dispatchArgs emits ONLY allowlisted typed fields', () => {
  const s = stateAt('batch'); s.chapter = 3; s.batchStep = 'A'; s.characters = ['甲', '乙']; s.foreshadowIds = ['F-16-1'];
  const a = e.dispatchArgs(s);
  deepEq(Object.keys(a).sort(), ['batchStep', 'characters', 'chapter', 'foreshadowIds', 'stage'].sort());
  eq(e.validateDispatch(a).ok, true);
});
check('dispatchArgs filters foreshadowIds by F-N-N shape; validateDispatch is the guard for path/prose', () => {
  // dispatchArgs filters foreshadowIds to /^F-\d+-\d+$/ but passes `characters`
  // through (length-capped). validateDispatch is the SECOND, strict layer that
  // rejects path-like / prose-like values. Assert the defence-in-depth contract.
  const s = stateAt('design'); s.characters = ['ok', '乙']; s.foreshadowIds = ['F-16-1', '../bad', 'DROP TABLE'];
  const a = e.dispatchArgs(s);
  ok(a.foreshadowIds.every((x) => /^F-\d+-\d+$/.test(x)), 'malformed foreshadowIds dropped');
  eq(e.validateDispatch(a).ok, true, 'clean typed payload accepted');
  const dirty = { ...a, characters: ['ok', '../etc/passwd', 'a very long prose hint: do this'] };
  eq(e.validateDispatch(dirty).ok, false, 'path/prose in characters rejected by validateDispatch');
});
check('validateDispatch rejects any disallowed field / path / prose / bad chapter', () => {
  for (const bad of [
    { stage: 'design', files: ['a.md'] },
    { stage: 'design', plotHint: 'make it sad' },
    { stage: 'design', chapter: 0 },
    { stage: 'design', chapter: '../1' },
    { stage: 'design', characters: 'not-array' },
    { stage: 'design', characters: ['../etc/passwd'] },
    { stage: 'design', foreshadowIds: ['a: b'] },
    null, 'string',
  ]) {
    eq(e.validateDispatch(bad).ok, false, `should reject ${stableStringify(bad)}`);
  }
  eq(e.validateDispatch({ stage: 'design' }).ok, true);
});
check('adjudicate: gate flips to PASS ONLY with confirmed positive evidence', () => {
  const T = (r) => ({ resolve: () => r });
  const cases = [
    [[], T(false), 'NOT_COVERED', false],
    [[{ verdict: 'PASS', evidenceRefs: [] }], T(false), 'NOT_COVERED', false],
    [[{ verdict: 'PASS', evidenceRefs: ['real'] }], T(true), 'PASS', true],
    [[{ verdict: 'CRITICAL', evidenceRefs: [] }], T(false), 'DEGRADED', false], // lead fix
    [[{ verdict: 'CRITICAL', evidenceRefs: ['real'] }], T(true), 'FAIL', false],
    [[{ verdict: 'WARNING', evidenceRefs: ['real'] }], T(true), 'DEGRADED', false],
    [[{ verdict: 'PASS', evidenceRefs: ['real'] }, { verdict: 'WARNING', evidenceRefs: ['real'] }], T(true), 'DEGRADED', false],
  ];
  for (const [verdicts, truth, verdict, okFlag] of cases) {
    const r = e.adjudicate(verdicts, truth);
    eq(r.verdict, verdict, `verdict for ${stableStringify(verdicts)}`);
    eq(r.ok, okFlag, `ok for ${stableStringify(verdicts)}`);
    includes(r.precedenceApplied, 'truth-files', 'evidence precedence documented');
  }
});
check('adjudicate: disproved CRITICAL is dismissed and logged (never PASS)', () => {
  const r = e.adjudicate([{ verdict: 'CRITICAL', evidenceRefs: [], role: 'validator' }], { resolve: () => false });
  ok(r.dismissed.includes('validator'), 'dismissed role recorded');
  excludes(r.verdict, 'PASS', 'disproved CRITICAL must not yield PASS');
  ok(r.reasons.length > 0, 'reason recorded');
});
check('adjudicate never throws on junk input', () => {
  notThrows(() => e.adjudicate(null, null));
  notThrows(() => e.adjudicate([null, {}, { verdict: 5 }], {}));
});
check('logEvent produces a bounded structured entry (no prose)', () => {
  const s = stateAt('design'); s.chapter = 5;
  const entry = e.logEvent(s, 'validate-design.ps1', 'PASS', { at: 42, code: 'OK' });
  for (const k of ['runId', 'stageId', 'batchStep', 'chapterNo', 'gate', 'verdict', 'evidenceRef', 'attempt', 'durationMs', 'timestamp', 'code']) {
    ok(k in entry, `logEvent missing ${k}`);
  }
  eq(entry.timestamp, 42);
  eq(entry.verdict, 'PASS');
});

finish(SUITE);
