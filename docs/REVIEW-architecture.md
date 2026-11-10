# REVIEW — Architecture & Orchestration (ANGLE A, task-9)

Reviewer: `review-architecture`. Date: 2026-11-10.
Scope read in full: `lib/orchestrator.js` (749 lines), `index.js` (406 lines),
`cordis.patch.yml` (106 lines), `docs/ARCHITECTURE.md` (148 lines),
`docs/orchestration-research.md` (106 lines). Also inspected the real gate scripts'
`param()` blocks, `package.json`, and `test/*.mjs` to verify claims. No runtime
code was edited.

---

## 1. Verdict

**NOT production-grade. Do not ship as "strong orchestration".**

The *pure core* is genuinely well built: `advance()` is a real, non-mutating
reducer over a closed event set, gates are re-run in code (the model cannot
assert a PASS), error text is never leaked, and the checkpoint is atomic and
corruption-tolerant. Those parts are good and I list them in §3.

But the **integration between that core and the real workflow is broken**: with
the actual shipped scripts and the actual Host adapter, a novel run cannot
complete its documented deterministic path. Concretely:

- 9 of the 15 BATCH sub-steps have `gate: null`. For those, `gate()` returns
  `{ok:true, status:'PASS', skipped:true}`, which `index.js` *refuses* as a pass
  and `adjudicatedGate()` also *rejects*. So **no `gate-pass` and no `verify`
  can ever advance those steps**. The `advance('gate-pass')` branch is the ONLY
  place that increments the chapter and exits the batch loop — so the entire
  100-chapter loop and the `batch → export` transition are **unreachable from the
  tool**.
- The linear script gates are invoked with the wrong arguments (missing
  `-Chapter`, or `-Chapter` passed to a script that rejects it), so most of them
  can never return exit 0 either (verified with real `pwsh`).
- The only transition that works everywhere is `skip` — an "audited human
  override" — which at any mid-batch sub-step **abandons the whole batch**.

Net: a real novel project stalls at the first one or two sub-steps, or is forced
to skip every gate. The headline features (100-chapter batch loop, resume
mid-batch, adjudicated subagent workers) are not executable end-to-end. The
"deterministic, goodwill-independent" claim (ARCHITECTURE.md:17) holds for
*individual transition legality*, but not for *liveness*: nothing drives the
loop, and the one driver that exists cannot advance the gate-less steps.

---

## 2. CONCRETE findings, ranked by severity

### CRITICAL — F1. Gate-less BATCH sub-steps are unadvanceable; the chapter loop and batch exit are dead code in the tool flow

**File:line**
- `lib/orchestrator.js:53-69` — 9 of 15 `BATCH_SUBSTEPS` have `gate: null`
  (`O1, O2, A, A2, B, B2, D1, D4, E`).
- `lib/orchestrator.js:704` — `runGate()` returns
  `{ ok:true, status:'PASS', skipped:true, reason:'no-validator' }` when `rel`
  is falsy.
- `index.js:316` — `isRealPass = verdict.ok===true && verdict.status==='PASS'
  && verdict.skipped!==true` → **false** for every gate-less step.
- `index.js:317-322` — a `gate-pass` that is not a real pass is converted into
  `gate-fail` (retry/pause), never an advance.
- `lib/orchestrator.js:624` — `adjudicatedGate()` rejects any
  `scriptVerdict.skipped`, so the `verify` path (`index.js:348-355`) also fails.
- `lib/orchestrator.js:510-530` — the batch sub-step advance, the chapter
  increment (`:520-521`) and the batch exit (`:526-528`) live **only** inside
  `case 'gate-pass'`.

**Reproduction** (real `pwsh` + a faithful re-implementation of `index.js`'s
gate logic; also reproducible by importing the module directly):

```js
// io where every invoked script returns 0 — isolates the FSM from F2
const io = { exists: () => true, spawnSync: () => ({ status: 0 }), now: () => 1 };
const st = { ...engine.createState({project:'P'}), stage:'batch',
             status:'running', chapter:1, batchStep:'O1' };
const v = engine.gate('batch', io, 'P', st);
// v = { ok:true, status:'PASS', skipped:true }   <- no validator
const isRealPass = v.ok===true && v.status==='PASS' && v.skipped!==true; // false
engine.adjudicatedGate(v, [{verdict:'PASS', evidenceRefs:['novel/outline.md']}],
                       engine.truthResolver(io,'P'));
// => { ok:false, status:'PASS', reason:'script-not-pass' }
```
Driving the reducer by itself with 15 `gate-pass` events *does* walk
`O→…→E→chapter 2` correctly (I verified this), proving the loop logic exists;
but `index.js` never issues `advance({type:'gate-pass'})` for these steps, so
`orchestrator.js:520-528` is unreachable. Verified matrix: all 9 gate-less steps
→ `gate-pass` refused, `verify` rejected.

**Impact.** The product's central promise — an unattended 100-chapter batch with
resume — cannot run. The run stalls at `O1` (or at `O`, see F2) permanently:
each retry re-runs the same skipped gate, consumes the retry budget, and pauses.
`resume after crash mid-batch` rehydrates correctly but hits the same wall.

**Minimal fix.** Add a distinct, engine-decided event for "step finished, no
script gate required" (e.g. `step-done`), emitted by the Host after the worker
for a gate-less sub-step returns, and route `BATCH_SUBSTEPS` advancement through
it. In `index.js`, branch on `gateForStage(stage, batchStep) === null`: for those
steps do NOT require `isRealPass` from a script; instead require the completed
worker dispatch (or an explicit `step-done`) and call `advance`. Keep `gate-pass`
exclusively for script-gated steps. Mirror this in `adjudicatedGate`/`verify`
(use the worker verdict as the authority when there is no script). Do **not**
"fix" it by treating `skipped:true` as a pass — that would defeat B3.

---

### CRITICAL — F2. Gate scripts are invoked with wrong/missing parameters; most deterministic gates can never pass

**File:line**
- `lib/orchestrator.js:709-714` — `runGate()` builds
  `['-NoProfile','-File',rel]` and appends `-Chapter N` **only when
  `state.chapter` is non-null**. On all linear stages `chapter === null`.
- `STAGE_GRAPH` gates: `:89` import→`validate-chapter.ps1`, `:94`
  outline→`validate-outline.ps1`, `:99` design→`validate-design.ps1`, `:104`
  write→`validate-chapter.ps1`, `:109` validate→`validate-chapter.ps1`, `:84`
  disassemble→`analyze-source.ps1`, `:54` batch step `O`→`validate-outline.ps1`.

**Reproduction** — exact `runGate` argument vectors run against the **real**
shipped scripts with the harness `pwsh` (exit code is what `runGate` reads):

| Stage / step | Generated args | Real exit | Real stderr |
|---|---|---|---|
| import / write / validate | `-File validate-chapter.ps1` (no `-Chapter`) | **1** | `missing mandatory parameters: Chapter` |
| design | `-File validate-design.ps1` (no `-Chapter`) | **1** | `missing mandatory parameters: Chapter` |
| outline | `-File validate-outline.ps1` (no params) | **1** | `missing mandatory parameters: StartChapter EndChapter` |
| batch step `O` | `-File validate-outline.ps1 -Chapter 1` | **1** | `A parameter cannot be found that matches parameter name 'Chapter'` |
| disassemble | `-File analyze-source.ps1 [-Chapter 1]` | **1** | (needs `novel/source/chapters`, absent at bootstrap) |
| batch `A1 / C / D2 / D3` | `-File <script>.ps1 -Chapter 1` | 0 | (these accept `-Chapter`) |

The `param()` blocks confirm: `validate-chapter.ps1:28-32` requires `[string]$Chapter`;
`validate-design.ps1:17-20` requires `[int]$Chapter`;
`validate-summary.ps1:10-13` / `sync-state.ps1:11-13` / `build-context-bundle.ps1:31-36`
require `-Chapter`; **`validate-outline.ps1:26-36` accepts only
`-StartChapter/-EndChapter` or `-All` and has no `-Chapter` parameter at all**;
`analyze-source.ps1:21-26` has no `Chapter` parameter.

**Impact.** `import`, `outline`, `design`, `write`, `validate` and batch step `O`
have gates that are literally unwinnable — no project state makes them return 0
with the arguments the engine sends. So even if F1 were fixed, a run still cannot
pass its linear stages or the first batch step. This is the single largest reason
the test suite is green while the product is broken: `test/_lib.mjs:204` mocks
`spawnSync` to return `{status:0}` unconditionally, and no test executes a real
`.ps1` with the engine's argument vector.

**Minimal fix.** Replace the single generic `-Chapter` append with a per-gate
parameter template, e.g. a `PARAMS` map in `gateForStage`/`runGate`:
`validate-outline.ps1 → ['-All']`; the `-Chapter` scripts → `['-Chapter', N]`
with `N` defaulting to `state.chapter ?? 1` for linear stages;
`analyze-source.ps1 → []` with its inputs prepared by the skill. Then add ONE
integration test that runs `pwsh -NoProfile -File <real script> <template args>`
for every gate and asserts exit 0 on a fixture project.

---

### CRITICAL — F3. The adjudication subsystem (`verify`) is unusable at exactly the steps that need it

**File:line**
- `lib/orchestrator.js:594` — `REVIEW_STEPS = new Set(['O1','A2','D4'])`.
- `lib/orchestrator.js:601-611` — `dispatchFor()` sets `needsAdjudication`
  **only** for those three steps.
- `lib/orchestrator.js:55,60,67` — `O1`, `A2`, `D4` all have `gate: null`.
- `index.js:348-355` — `verify` calls `engine.gate()` → `skipped:true` →
  `adjudicatedGate()` (`:624`) returns `{ok:false, reason:'script-not-pass'}`.

**Reproduction** (verified): for `O1`, `A2`, `D4`,
`dispatchFor().needsAdjudication === true`,
`gate() === {ok:true,status:'PASS',skipped:true}`, and
`adjudicatedGate(...) === {ok:false,status:'PASS',reason:'script-not-pass'}`.
So `verify` returns `ADJUDICATION_FAILED` and calls `advance('gate-fail')` at
**every** review step, always. `adjudicatedGate` also returns the contradictory
`{ok:false, status:'PASS'}` — a caller that checks `status` instead of `ok`
would wrongly treat it as a pass.

**Impact.** `docs/ARCHITECTURE.md:101-103` states the adjudication path is "the
wired, code-enforced path (PM B2 / AC-8), **not dead code**". It is effectively
dead: `adjudicate()`, `truthResolver()`, `needsAdjudication` and the `verify`
action can never succeed at their intended steps. "PASS with no evidence cannot
flip a gate" is correct in the abstract, but here *nothing* can flip these gates.

**Minimal fix.** Same as F1: for gate-less review steps, `verify` must adjudicate
the worker verdicts directly (script verdict = "not applicable"), not through
`adjudicatedGate`'s script-PASS precondition. Also make the failure verdict
internally consistent (`ok:false` ⇒ `status` should not be `'PASS'`).

---

### HIGH — F4. `skip` at any mid-batch sub-step aborts the entire batch (and it is the only working transition)

**File:line** — `lib/orchestrator.js:573-581`: `skip` unconditionally sets
`next.stage = node.next` (`batch.next === 'export'`, `:113`) and
`batchStep = null`. There is no sub-step-level skip.

**Reproduction** (verified):
```js
let s = /* stage='batch', batchStep='C', chapter=1, totalChapters=100 */;
const r = engine.advance(s, { type:'skip', at:6 });
// r.state => { stage:'export', batchStep:null, chapter:1 }
```
A single `skip` abandons chapters 1–100. Since F1/F2 make `skip` the *only*
transition that reliably advances, the practical workflow is "skip everything",
which silently bypasses every gate — the exact failure mode the FSM was built to
prevent. `skip` also never reaches `done` (it jumps to `export`, then `skip`
again from `export` reaches `done`), but produces a fully DEGRADED run.

**Minimal fix.** When `state.stage==='batch' && state.batchStep`, `skip` should
advance to the next `BATCH_SUBSTEPS` entry (identical to the gate-pass branch),
recording `DEGRADED` for that one step. Require a separate explicit
`abort-batch` event (or `skip` with `stage:'batch', step:null`) to leave the
batch. Never collapse the whole loop.

---

### HIGH — F5. `batch-step` permits arbitrary sub-step jumps and arbitrary chapter numbers; the "strictly serial" FSM is not enforced

**File:line** — `lib/orchestrator.js:537-545`:
`if (event.step && BATCH_SUBSTEPS.some(...)) next.batchStep = event.step;`
(no check that the step is the immediate successor) and
`next.chapter = v.chapter` accepts any integer 1..99999 at any time.
`index.js:294` passes `args.step` straight through; the tool schema
(`index.js:219`) exposes `step` as "Optional BATCH sub-step id (O..E)".

**Reproduction** (verified):
```js
// at batch step O, chapter 1, totalChapters 100
engine.advance(s, {type:'batch-step', chapter:1, step:'E'}).ok === true;   // jumps O→E
engine.advance(s2,{type:'batch-step', chapter:1, step:'D1'}).ok === true;  // skips gate C
// and: first batch-step with chapter:57, totalChapters:100
//   → at step E, 57<100 → chapter becomes 58 … → chapters 1..56 are NEVER written
```
`ARCHITECTURE.md:46-48` and `orchestrator.js:50` claim "15 **strictly serial**
steps" and "the reducer is the only place this advances". Neither seriality nor
the chapter-1 starting point is enforced. A caller (the model is the only
transport) can jump to `D1` and skip the chapter validator `C`, or start the
batch at chapter 57 and silently omit 56 chapters. This is a control-integrity
bug, not a style nit.

**Minimal fix.** In `case 'batch-step'`, allow only `event.step === state.batchStep`
(a no-op re-affirm) or `BATCH_SUBSTEPS[idx+1]`; require `event.chapter ===
state.chapter` unless the engine itself just advanced from step `E`; and on the
*first* batch-step require `chapter === 1`.

---

### HIGH — F6. Retry budget is global/monotonic; an exhausted run has no working retry path, and `start` from `paused` wipes progress

**File:line**
- `lib/orchestrator.js:509` — `retries` resets **only** on `gate-pass`.
- `lib/orchestrator.js:563-566` — `retry` flips status but leaves `retries`
  unchanged; `advance`'s `case 'retry'` explicitly allows `paused`.
- `lib/orchestrator.js:457` — `validateTransition` **rejects** `retry` from
  `paused` (`cannot retry from paused`) — so the `paused` allowance at `:564`
  is unreachable/dead code, an internal contradiction.
- `lib/orchestrator.js:445` — `start` is allowed from `paused`/`blocked`;
  `lib/orchestrator.js:484-489` — `start` resets `stage='bootstrap'`,
  `chapter=null`, `batchStep=null`.
- `lib/orchestrator.js:108` — `validate.onFail = 'write'` with a **different**
  `maxRetries` (3) than `validate` (2).

**Reproduction** (verified):
```
constitution (maxRetries 3, onFail=self):
  fail×3 → status='paused', retries=2
  retry   → REJECTED ("cannot retry from paused")
  resume  → ok, status='running', retries STILL 2
  next gate-fail → status='paused' again (immediate re-pause, no real retry)
  start   → ok, but stage='bootstrap', chapter=null, batchStep=null  (progress lost)
```
Also verified: `validate` gate-fail moves the stage to `write` (`:108`) carrying
`retries=1` into a node whose budget is 3 — mixed retry budgets. And
`start` from a mid-batch `paused` state (`chapter:42, batchStep:'C'`) resets to
`bootstrap` with `chapter:null`, while `STATUS_TEXT` tells the user
"已保存进度，可继续 / Progress saved, you can continue" (`index.js:71-72`,
`index.js:136`). That message is misleading: calling `start` discards the saved
progress.

**Impact.** A transient failure that exhausts retries can only be escaped by
`skip` (bypasses the gate) or `start` (wipes the run). There is no genuine
retry. For "resume after crash" this is a data-loss trap.

**Minimal fix.** Reset `retries = 0` inside `case 'retry'` (or on a successful
`resume` from `paused`), and either allow `retry` from `paused` in
`validateTransition` or remove the dead `paused` branch at `:564`. Restrict
`start` to `idle`/`done`/`aborted`; from `paused` the only continuation should be
`resume`/`retry`/`skip`. Reset `retries` when `onFail` changes the stage node.

---

### HIGH — F7. Missing `pwsh` binary is classified `FAIL`, not `DEGRADED` as documented; DEGRADED burns retry budget

**File:line** — `lib/orchestrator.js:717-718` derives
`code = result.status ?? result.exitCode ?? 1`. When the binary is missing,
`spawnSync` returns `{status:null, error:'ENOENT'}` (it does **not** throw), so
`code = 1` → `:722` yields `ok:false, status:'FAIL', skipped:false`. The
`catch` at `:727` (which would return `DEGRADED`) is never reached.

**Reproduction** (verified): `spawnSync('pwsh-nonexistent-xyz', …)` →
`{status:null, error:'ENOENT'}`; engine computes `code=1` → `status='FAIL'`.
The `no-script-runner` branch (`:705-708`) does return `DEGRADED`, so the two
"runner unavailable" paths disagree. `docs/ARCHITECTURE.md:81`,
`orchestration-research.md:101-102` and the comment at `orchestrator.js:706`
all promise `DEGRADED` with `ok:false` for "missing pwsh / runner".

**Impact.** On a machine without `pwsh`, `ok:false` still holds (no fake pass —
good), but the user gets `GATE_REFUSED`/`paused` instead of
`GATE_DEGRADED`/`recovering` (`index.js:321`), and `index.js:317-322` converts
the degraded `gate-pass` into a `gate-fail` that **consumes the retry budget and
can permanently pause the run**. A transient "runner temporarily unavailable"
should not be treated as a hard quality failure.

**Minimal fix.** In `runGate`, after `spawnSync`, if `result?.error` or
`result?.status == null && result?.exitCode == null`, return
`{ok:false, status:'DEGRADED', skipped:true, reason:'runner-unavailable'}`.
In `index.js`, do not convert a DEGRADED `gate-pass` into `gate-fail` (leave
retries untouched, return the `recovering` token).

---

### MEDIUM — F8. `gate-fail` executes each validator script twice, double-running mutating scripts

**File:line** — `index.js:304` calls `engine.gate(...)` to build `event.failures`;
`index.js:313` calls `engine.gate(...)` again for the gate-event check. For
`action:'gate-fail'` both run. `BATCH_SUBSTEPS` include mutating scripts
`build-context-bundle.ps1` (`A0`, `:57`) and `sync-state.ps1` (`D3`, `:66`).

**Reproduction** (verified): one `gate-fail` action → `spawnSync` called 2×.
Each has a 120 s timeout (`orchestrator.js:717`), so a failing gate can block up
to 240 s and apply `sync-state.ps1` twice (duplicate state mutation).

**Minimal fix.** Compute `const verdict = engine.gate(...)` once at the top of
the gate branch and reuse it for both `event.failures` and `isRealPass`.

---

### MEDIUM — F9. `saveState()` failures are ignored; a checkpoint write failure is reported as a successful transition

**File:line** — `lib/orchestrator.js:259-271` returns
`{ok:false, error:'io-error'}` on write/rename failure. `index.js:320, 353, 358,
367` call `engine.saveState(io, project, state)` and discard the result, then
return `{ok:true, ...}`.

**Reproduction** (exact reasoning): disk-full / `EACCES` on
`<project>/.dsh/state/` is swallowed by `saveState`'s `catch`; the tool still
returns `ok:true` for the transition. The next `execute()` calls `loadState()`
and rehydrates the **old** checkpoint — a silent rollback of the stage/chapter
advance. The "durable checkpoint / survives process restart" guarantee
(`ARCHITECTURE.md:114-119`) is only as strong as this unchecked write.

**Minimal fix.** 
```js
const saved = engine.saveState(io, project, state);
if (!saved.ok) return { ok:false, status: STATUS_TEXT[locale].unavailable,
                        code: 'CHECKPOINT_FAILED' };
```
at all four call sites (or a single helper).

---

### MEDIUM — F10. `validateState()` does not validate derived FSM fields; a parseable-but-inconsistent checkpoint rehydrates into a broken machine

**File:line** — `lib/orchestrator.js:199-210` validates version, stage, status,
retries, arrays, project/runId, branch, chapter — but **not** `batchStep`,
`totalChapters`, or `stage ⇔ batchStep`/`branch` coherence.

**Reproduction** (verified):
```js
const s = engine.createState({project:'P'});
s.status='running'; s.stage='batch'; s.batchStep='NOT_A_REAL_STEP';
s.totalChapters='one hundred';
engine.validateState(s).ok === true;          // accepted
engine.plan(s) // => { step:'NOT_A_REAL_STEP', gate:null }  (gateForStage → null)
```
`loadState` (`:228-256`) only rejects *unparseable* JSON or a failed
`validateState`. A crash that truncates a checkpoint but leaves valid JSON (or a
manual edit, or a partial write before the rename) is therefore accepted with a
bogus `batchStep` — `dispatchFor` returns `role:null`, `gateForStage` returns
`null`, and the resumed run stalls with no diagnostic. `totalChapters` as a
string also makes `state.chapter < state.totalChapters` (`:520`) do JS string
coercion.

**Minimal fix.** Add to `validateState`:
`if (x.batchStep !== null && !BATCH_SUBSTEPS.some(s=>s.id===x.batchStep)) → {ok:false}`;
`if (x.totalChapters !== undefined && (!Number.isInteger(x.totalChapters) ||
x.totalChapters<1 || x.totalChapters>99999)) → {ok:false}`;
and `if ((x.stage==='batch') !== (x.batchStep!==null)) → {ok:false}`.

---

### MEDIUM — F11. `produces[]` is declared on every stage but never read

**File:line** — declared at `lib/orchestrator.js:116-166` (e.g. `:122`
`constitution` produces `core.md`, `style.md`, `bookinfo.md`); **zero reads**
anywhere in `lib/` or `index.js` (grep confirms). `stageGuard()` (`:674-684`)
checks only `entry[]`. `ARCHITECTURE.md:44` lists `produces[]` as a node field,
implying it is part of the contract.

**Impact.** Stage completion is never verified against declared outputs. A stage
that "passes" via `skip` (currently the only working path) advances to `outline`
without any `novel/constitution/core.md`; the next stage's `entry` guard then
fails — or worse, the run proceeds on missing inputs. The declared artifact
contract is decorative.

**Minimal fix.** Before advancing from a node (`gate-pass`/`skip`), verify
`node.produces.every(rel => io.exists(artifactPath(project, rel)))`, returning a
classified `ENTRY_GUARD`-style FAIL if any is missing. If this is intentionally
out of scope, remove `produces[]` and the `ARCHITECTURE.md:44` claim rather than
shipping dead metadata.

---

### MEDIUM — F12. `truthResolver()` is existence-only, so "truth files" can confirm any verdict and misspelled CRITICAL evidence is dismissed

**File:line** — `lib/orchestrator.js:635-643`: `resolve(ref)` is just
`io.exists(artifactPath(project, ref)) === true`. `adjudicate()`
(`:395-417`) treats `resolve(ref)===true` as "confirmed evidence"; a CRITICAL
with **no** confirmed ref is dismissed as `FALSE_POSITIVE` (`:410-412`).

**Impact.** The precedence "truth files > subagent judgment > engine memory"
(`ARCHITECTURE.md:91-95`) is implemented as "a file with that name exists",
with no content/line check and no relevance check. A genuine continuity defect
whose evidence ref has a typo (or points to a file the worker did not create) is
*dismissed*, and a PASS citing any existing unrelated file is *confirmed*. This
inverts the intended safety direction for real audits. (Moot in practice until
F3 is fixed, since `verify` cannot succeed — but the algorithm should be fixed
together with the wiring.)

**Minimal fix.** At minimum, require the evidence ref to be a **declared**
artifact for the current stage/step (e.g. `node.entry ∪ node.produces ∪
BATCH_SUBSTEPS artifacts`) and require the resolver to check content markers,
not mere existence; treat an unresolved CRITICAL as `NOT_COVERED` (needs human
review) rather than dismissing it as `FALSE_POSITIVE`.

---

### LOW — F13. Documentation honesty: the tool-call-driven model is *partly* honest, but several claims overreach

**File:line**
- **GOOD / honest:** `ARCHITECTURE.md:8-18` explicitly says the engine is
  "**tool-call driven**, not an autonomous background daemon", that the model is
  a *transport*, and that "a fully unattended Host-driven chain is a possible
  future enhancement, not part of this release". That is accurate and credited
  in §3.
- **Overreach:** `ARCHITECTURE.md:17-18` concludes "the product is still
  deterministic and **goodwill-independent** because control flow never lives in
  prose". Control-flow *legality* is code-enforced, but **liveness** is entirely
  goodwill-dependent: `index.js` subscribes to no Host event (`turn/end`,
  `tools/result`) that drives the next action, and `dispatch` (`:333-341`) only
  *returns* a role — grep of `index.js` shows **no** `subagents`/`startActivation`/
  subagent call. If the model stops calling `novel_orchestrate`, the workflow
  silently stops. Say "transport-dependent liveness".
- **Overreach:** `ARCHITECTURE.md:64-65` ("Only script exit codes + artifacts
  flip gates") and `:101-103` ("the wired, code-enforced path … **not dead
  code**") are false per F1–F3.
- **Stale:** `ARCHITECTURE.md:4` says "(v2.0.0)" but `package.json:3` is
  `2.0.1`. `orchestration-research.md:45` documents the tool as
  `status|start|advance|reset` and `:64` says `STATE_VERSION // number (1)`
  (actual: 13 actions, `STATE_VERSION = 2`, `:28`); `:84` lists a 5-event `event`
  shape (actual 11, `:129-132`). It is a research doc, but the "interface
  contract for the test suite" (§4) is stale enough to mislead a maintainer.
- **Minor:** the tool description says "never renders prose"
  (`index.js:206`) but `output.render()` (`:252-262`) does render a text line
  (`阶段 · 第 N 章 · 步骤 X · <status>`). It is bounded and generic, so this is a
  wording nit, not a leak.

**Minimal fix.** Amend the four overreaching/stale sentences to match F1–F3 and
the real action/version/event sets; keep the honest §1 paragraph. No code change
needed beyond what F1–F3 require.

---

## 3. What is GOOD (do not "fix" these)

- **Pure, non-mutating reducer.** `advance()` (`:466-587`) copies state, never
  mutates input; `validateTransition()` (`:440-463`) uses a closed `EVENT_TYPES`
  set (`:129-132`) and rejects unknown events, wrong-stage `batch-step`,
  bootstrap-without-branch, and non-running gate events. Illegal transitions
  genuinely cannot be forced by prose.
- **Model cannot assert a PASS.** `index.js:312-327` re-runs the real gate before
  `gate-pass`; a claimed `gate-fail` is ignored when the script says PASS
  (`:323-326`). `gate-fail` failures are recomputed from the gate verdict
  (`:304-305`), not taken from caller text. This is the correct anti-veto design.
- **Error containment (NG-3) is real.** `runGate` classifies failures as
  `script-exit-N` and never returns raw stderr (`:719-726`); `publicState`/
  `publicGate`/`publicPlan` (`:146-181`) strip script paths and internals; every
  adapter branch is `try/catch`ed into a generic localized token (`:375-379`).
  Verified: no `.ps1` path, exit code, or exception text escapes.
- **Durability mechanics are solid.** `stableStringify` (`:144-149`) gives
  byte-identical checkpoints; `saveState` is atomic `tmp → rename` (`:262-268`);
  `loadState` (`:228-256`) versions the schema, re-anchors `project` while
  keeping `runId`, renames a corrupt checkpoint to
  `novel-mode.checkpoint.corrupt.json` (rotating an existing backup) and records
  a structured `recover` DEGRADED log entry — **no data is silently discarded**.
  Because it lives in the project filesystem it genuinely survives process
  restart / plugin reload. `resume after crash mid-batch` is *structurally*
  present (`stage`/`batchStep`/`chapter`/`totalChapters` are all persisted); it
  is blocked only by F1, not by a missing feature.
- **DEGRADED is never a fake pass (B3).** `runGate:707` returns `ok:false` for a
  missing runner, `adjudicatedGate:624` rejects `skipped`, and `index.js:316`
  requires `skipped !== true`. The *intent* is right; the defect (F1) is that
  there is no separate path for legitimately gate-less steps.
- **Injection/traversal defenses are real.** `normalizeChapter()` (`:156-165`)
  bounds to integer 1..99999 and rejects floats/NaN/non-digits;
  `artifactPath()` (`:168-173`) rejects `..`, absolute paths and shell
  metacharacters; `validateDispatch()` (`:353-369`) enforces a field allowlist and
  rejects path-like/prose values; `runGate` uses `-File` and never `-Command`,
  passing the chapter as a separate argv element. Good security posture.
- **Adjudication *algorithm* is sound.** `adjudicate()` (`:386-434`) correctly
  returns `NOT_COVERED` for an empty verdict list and for PASS-without-evidence,
  and applies a fixed precedence string. The logic is good; only its Host wiring
  (F3) and truth resolver (F12) are broken.
- **Observability discipline.** Bounded `history`/`log` (`MAX_HISTORY = 128`,
  `:295-303`), structured `logEvent` with classified stage/step codes instead of
  `.ps1` paths (`:472-481`, `:279-293`), `summarize()` (`:647-667`) — all
  machine-readable, no prose.
- **`gateForStage()` (`:692-700`) is the right single source of truth** for
  resolving per-sub-step gates, correctly handling `STAGE_GRAPH.batch.gate ===
  null`. The idea is correct; F2 is about the *arguments* it feeds to the script.
- **Preset declaration is clean.** `cordis.patch.yml:14-106` adds only display
  metadata + tool wiring; no `systemPrompt.section`, no persona prose, no
  injected workflow brief — matching the "no prompt dump" requirement. The
  `disabled: !!js process.platform === 'win32'` / `!== 'win32'` pair (`:32-35`)
  correctly selects `tool-pwsh` vs `tool-bash`. Tool list mirrors `standard`.
- **Materialization is safe and isolated.** `index.js:88-106` is idempotent,
  never overwrites existing files, skips `.git`/`__pycache__`; `ensureFor`
  (`:384-398`) gates on `presetForSession(session) === 'novel'`, so other presets
  are untouched.
- **Model-facing tool schema is hygienic.** Closed `action` enum, typed fields,
  `additionalProperties:false`, classified `failures`/`verdicts` only
  (`index.js:207-236`).

---

## 4. What I could NOT verify in this harness

- **Live Cordis API contracts.** I did not run `cordis_inspect_query` against a
  live Host, so I cannot confirm that `ctx.skills.register`, `ctx.tools.register`,
  `ctx.get('workingDirectory')`, `agentPresets.presetForSession`, the
  `agent/created` / `agent-preset/selected` event names, or the exact preset YAML
  dialect in `cordis.patch.yml` match the real DSH Service/Event/Config schemas.
  If any is wrong the plugin may not register at all — a real integration risk
  outside this review's file set (task-2/7 territory).
- **Live Host / GUI execution.** I did not exercise `novel_orchestrate` from the
  running DSH session or the `小说模式` preset in the Web GUI
  (http://127.0.0.1:12630). All conclusions come from the source + real `pwsh`
  script runs + `node` imports of the actual `orchestrator.js`.
- **End-user `pwsh` version.** I tested the bundled harness `pwsh`. PowerShell 7
  parameter binding should be identical, but I did not test a second version.
- **A real 100-chapter project.** I used `io.exists: () => true` to isolate the
  FSM. Whether `stageGuard`'s `entry[]` paths (`novel/constitution/core.md`,
  `novel/outline.md`, ...) are actually produced by the 21 skills in a real run
  is unverified; F11 shows they are never checked via `produces[]`.
- **Full test suite.** I did not run `node test/run-all.mjs` (that is task-12's
  job). I only read `test/*.mjs` to establish *why* the suite passes despite
  F1/F2 (`test/_lib.mjs:204` stubs `spawnSync → {status:0}`, and
  `lead-integration.mjs:83-88` explicitly drives stages with `skip` instead of
  real gates). I therefore make no claim about the overall pass/fail count.
- **Other angles.** I did not audit the 21 `SKILL.md` bodies, the 18 scripts
  beyond their `param()` blocks, `README*`/`market/*` consistency, or credential
  hygiene — those belong to tasks 10–13.
- **"Production-grade" in the deployment sense.** No data on how a real user's
  `goal`/branch choice reaches `select-branch`, on concurrent calls to the tool
  from one session, or on `projectRootOf()` returning the intended directory
  when `workingDirectory.get(session)` is unavailable (it falls back to
  `process.cwd()`, which may be the plugin dir, not the novel project — a
  suspicion I could not confirm against a live Host).
