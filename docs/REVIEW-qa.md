# QA / Test-Coverage Review — 小说模式 (Novel Mode)

> Reviewer: `publishing-researcher` (task-12, ANGLE D)
> Date: 2026-11-10 22:53–23:27 +08:00 (Asia/Shanghai)
> Scope: **read-only review**, write ONLY `docs/REVIEW-qa.md`. No runtime code edits.
> Method: read every `test/*.mjs`, `lib/orchestrator.js`, `index.js`, `docs/TEST-EVIDENCE.md`, sample `assets/.dsh/skills/*/SKILL.md`, all `assets/.dsh/scripts/*.ps1` param blocks; ran `node test/run-all.mjs`; and (beyond the brief) drove `engine.gate()` / the real `index.js` Host with **real `pwsh`** against a materialized temp project.

---

## 0. VERDICT

**CONDITIONAL / NOT READY — the automated suite is green on mocks but does not prove the real workflow runs.**

- The suite is fast, broad, well-isolated (9 processes, injected `io`/`ctx`, no LLM/network), and genuinely covers the **pure state machine**: transitions, checkpoint, corruption, 3 bootstrap branches, concurrency, no-leak. That part is good.
- **But every `spawnSync` in every test is a mock.** No test ever executes a bundled `.ps1`. When I substituted real `pwsh`, the parameter mismatch the brief suspected is **real and reproducible**, and after a teammate's mid-review fix, a **second, structural** class of blocker remains: the Host never supplies `state.chapter` to non-batch gates, and gate-less BATCH steps can never pass the Host's `gate-pass` path. The real 100-chapter batch loop cannot complete.
- The tree was **actively edited by another teammate during this review** (see §6). I report both the state at my first run and the final stable-ish state. Do not treat any single test count here as a permanent baseline.

**Blocking items**: F1 (gate param mismatch — partially fixed mid-review, regression test added), F2 (chapter-less non-batch gates), F3 (gate-less BATCH sub-steps can never advance), F4 (`import` gate = `validate-chapter.ps1 -Chapter` with no chapter), F5 (suite currently RED mid-refactor). Non-blocking but real: dangling `.codebuddy/` paths in agent docs, `agents/novel-writer.md` prefix, doc count drift, suite's coverage gaps.

---

## 1. EXACT TEST COUNTS I RAN (`node test/run-all.mjs`)

| Run | Time (approx) | Result | Notes |
|---|---|---|---|
| **R1** (first, baseline) | 22:54 | **9/9 suites PASS, 279/279 assertions, exit 0** | Matches `REVIEW-pm.md:20`. Per-suite: failure-recovery 16, integration-materialize 33, lead-integration 23, manifest 28, marketing 26, pm-blockers 18, security 24, unit-orchestrator 83, unit-skills 28. |
| **R2** | ~23:05 | **7/9 suites PASS, 2 FAIL, 278/280 assertions** | Another teammate had just added `GATE_SPECS` + a new regression test. Failures: `security.test.mjs` 23/24 (`gate() invokes scripts with -File + typed int args` — stale static assertion looking for literal `normalizeChapter(chapter)`), `unit-orchestrator.test.mjs` 83/84 (`bad chapter -> BAD_CHAPTER` — the `chapter=0` guard had been dropped). |
| **R3** | 23:16 | **9/9 suites PASS, 280/280 assertions, exit 0** | Both R2 failures fixed; `BAD_CHAPTER` guard restored in `runGate()`. |
| **R4** | ~23:23 | **2/9 suites PASS, 7 FAIL, 54/54 assertions** | Mid-refactor syntax error: `lib/orchestrator.js:671 SyntaxError: Identifier 'REVIEW_STEPS' has already been declared` (duplicate `export const REVIEW_STEPS` at :180 and :671). 7 suites could not even import the module. |
| **R5** (final I observed) | ~23:26 | **8/9 suites PASS, 1 FAIL, 279/280 assertions, exit 1** | Duplicate const removed, but `unit-orchestrator.test.mjs` 83/84: `EXHAUSTIVE validateTransition matrix ... stage=bootstrap event=step-done: got false, expected true` — a new `step-done` event was added to `EVENT_TYPES` without updating the test's derived expectation table. |

**So: the count depends entirely on when you run it.** The only clean, self-consistent baseline is **R1 = 9/9, 279/279** (and R3 = 9/9, 280/280 after the fix). The final state I can verify is **RED (8/9, 279/280)**. `docs/TEST-EVIDENCE.md:9` still claims "9/9 suites PASS, **275/275** assertions" — **stale by 4–5 assertions** and does not mention the current failure. `LIVE-VERIFICATION.md:52` claims "9/9 suites, 278/278" — also stale. Minimal fix: regenerate TEST-EVIDENCE from the final settled tree, and don't hand-edit counts.

---

## 2. DOES THE SUITE EXERCISE REAL NOVEL-PROJECT PATHS? (brief's checklist)

| Path | Covered? | Evidence |
|---|---|---|
| **100-chapter batch loop** | ❌ **No** | `unit-orchestrator.test.mjs:450-467` tests only `chapter 3→4` and `chapter 5/totalChapters 5` (2 synthetic steps). `grep totalChapters` in `test/` finds only `5`, `30`, `1.5`; **no `100` anywhere**. The 15×100-step loop, checkpoint interval, and `totalChapters` progression are never run. |
| **Chapter 1** | ⚠️ Partially | `chapter: 1` appears as a **transition argument** (`:184`, `:256`, `:485`) and as `chapter=1` in my probes; but no test runs a real chapter-1 write/validate/sync end-to-end with real files. |
| **ALL 3 bootstrap branches** | ✅ Yes (reducer only) | `unit-orchestrator.test.mjs:325-334` loops `BOOTSTRAP_BRANCHES` with `gate-pass` to `done` — but **with mocked gates**; `select-branch` → branch → `gate-pass` chain never executes a real script. |
| **Resume mid-batch** | ⚠️ Partially | `unit-orchestrator.test.mjs:663-676` resumes from **every stage** (including `batch`) but uses `stateAt('batch')` with `batchStep=null`, `chapter=null`, `totalChapters` unset. `failure-recovery.test.mjs:156-175` covers corrupt-checkpoint recovery. **No test saves a real mid-batch checkpoint (`chapter=47, batchStep='D3', totalChapters=100`) and resumes it.** `unit-orchestrator.test.mjs:645` does set those fields but only for a byte-equality round-trip, not a resumed transition. |
| **Corrupt checkpoint** | ✅ Yes | `unit-orchestrator.test.mjs:677-701` (malformed JSON, schema-invalid, io error), `failure-recovery.test.mjs:156-188` (backup bytes preserved, generic status). Good. |
| **Missing pwsh** | ✅ Yes (mocked) | `unit-orchestrator.test.mjs:582-591`, `failure-recovery.test.mjs:278-288`, `pm-blockers.test.mjs:90-95`: `spawnSync` throws / undefined → `DEGRADED` with `ok=false`. Good — but note "missing pwsh" is simulated as a **throwing mock**, not by removing `pwsh` from `PATH`; real `spawnSync('pwsh', …)` on a host without pwsh returns `status:null, error:ENOENT`, which `runGate()` classifies as `code=1 → FAIL`, **not DEGRADED**. Minor semantic gap. |
| **Concurrent calls** | ✅ Yes | `failure-recovery.test.mjs:196-217` (12 activations, 16 `tool.execute`), `integration-materialize.test.mjs:321-327` (8 concurrent status). Good. |

**Other genuine gaps (not "manufactured" — each is a concrete untested path):**

- **G1 (biggest): zero real PowerShell execution anywhere.** `_lib.mjs:204` defines `baseSpawn = opts.spawnSync || (() => ({status:0}))`; `pm-blockers.test.mjs:31`, `unit-orchestrator.test.mjs:535/557/570` all inject `spawnSync: () => ({status:0})`. `lead-integration.mjs:83-85` explicitly says "on this machine pwsh exists, so we instead assert the *contract*" and avoids it. `security.test.mjs:239-246` is a **static source-text grep**, not an execution. Consequence: the entire `-Chapter` param mismatch (§3) passed 279/279 unnoticed.
- **G2: no end-to-end gate→advance→checkpoint with real scripts.** `lead-integration.mjs` drives `start → select-branch → skip ×2 → gate-fail` — it never issues a successful `gate-pass` (comment at :81-85 concedes this). No test proves a stage can actually **advance** on a real validator PASS.
- **G3: no 100-chapter / `totalChapters` boundary loop** (above), no `chapter→export→done` full chain with real `batchStep` cycling.
- **G4: `validate-chapter -Chapter All` (the batch-final full-book validation, AC-38) is never tested.** `normalizeChapter` explicitly rejects the string `'All'` (`:156-165`), so the engine can never express it; only `novel-import/SKILL.md:198` uses `-Chapter All`.
- **G5: `-ForeshadowIds` / `-Quick` / `-All` / `-StartChapter/-EndChapter` argv variants** are not exercised (the one R5-era regression test at `unit-orchestrator.test.mjs:582-609` covers `-All`/`-StartChapter` argv but with a mock spawn).
- **G6: no test asserts the shipped `.ps1` param blocks match `GATE_SPECS`** — i.e. no contract test reading `assets/.dsh/scripts/*.ps1`. That is the single cheapest test that would have caught F1.
- **G7: no test detects dangling `.codebuddy/` paths** in agent docs (§5).

---

## 3. ★ CRITICAL — SCRIPT / PARAM MISMATCHES (brief's main question)

### 3.1 I read EVERY gate script's `param()` block

Scripts referenced by `STAGE_GRAPH.gate` / `BATCH_SUBSTEPS[].gate` (`lib/orchestrator.js:53-69, 113-126`), with their real param blocks:

| Script | Real `param()` | `-Chapter` accepted? | File:line |
|---|---|---|---|
| `validate-outline.ps1` | `[CmdletBinding(DefaultParameterSetName='Range')] param([Parameter(Mandatory,ParameterSetName='Range')][int]$StartChapter, [Parameter(Mandatory,ParameterSetName='Range')][int]$EndChapter, [Parameter(Mandatory,ParameterSetName='All')][switch]$All)` | **NO** — needs `-StartChapter/-EndChapter` or `-All` | `assets/.dsh/scripts/validate-outline.ps1:26-36` |
| `analyze-source.ps1` | `param([string]$InputDir, [string]$Mode='analyze', [string]$SourceDir, [string]$TargetFile)` | **NO** — no chapter param, no mandatory params | `assets/.dsh/scripts/analyze-source.ps1:21-26` |
| `validate-chapter.ps1` | `param([Parameter(Mandatory=$true)][string]$Chapter, [switch]$Quick)` | YES (also accepts `"All"`) | `assets/.dsh/scripts/validate-chapter.ps1:28-32` |
| `validate-design.ps1` | `param([Parameter(Mandatory=$true)][int]$Chapter)` | YES (mandatory) | `assets/.dsh/scripts/validate-design.ps1:17-20` |
| `validate-summary.ps1` | `param([Parameter(Mandatory=$true)][int]$Chapter)` | YES (mandatory) | `assets/.dsh/scripts/validate-summary.ps1:10-13` |
| `sync-state.ps1` | `param([Parameter(Mandatory=$true)][int]$Chapter)` | YES (mandatory) | `assets/.dsh/scripts/sync-state.ps1:11-14` |
| `build-context-bundle.ps1` | `param([Parameter(Mandatory=$true)][int]$Chapter, [string]$ForeshadowIds='')` | YES (mandatory) | `assets/.dsh/scripts/build-context-bundle.ps1:31-37` |

`AGENTS.md` ("🔴 PowerShell 脚本执行规则") confirms the intended usage: `validate-outline.ps1 -StartChapter 41 -EndChapter 60` / `-All` (also `novel-batch/SKILL.md:225`), and `analyze-source.ps1 -InputDir ...` (`novel-disassemble/SKILL.md:151`).

### 3.2 F1 — CONFIRMED, REPRODUCIBLE MISMATCH (original `runGate`)

At my first read, `lib/orchestrator.js:709-714` built `args = ['-NoProfile','-File',rel]` and then **unconditionally** appended `'-Chapter', String(chapter)` whenever `state.chapter` was set. I verified against real `pwsh`:

```
pwsh -NoProfile -File validate-outline.ps1 -Chapter 1  → exit 1
  "validate-outline.ps1: A parameter cannot be found that matches parameter name 'Chapter'."
pwsh -NoProfile -File validate-outline.ps1              → exit 1
  "Cannot process command because of one or more missing mandatory parameters: StartChapter EndChapter."
```

`analyze-source.ps1 -Chapter 1` also failed (PowerShell reported the unknown parameter / fell through to its own "章节目录不存在" JSON error). Driving the **real Host** through `gate-pass` at BATCH sub-step `O` produced `ok=false, code=GATE_REFUSED` — the batch could not start. This is exactly the "would break real gates" case in the brief.

**Impact**: BATCH sub-step `O` (`BATCH_SUBSTEPS[0]`) and stage `outline` could **never** pass; `disassemble` received a junk param. 100-chapter batch is dead on arrival.

**Minimal fix (already applied by another teammate mid-review — I did not edit)**: add a per-script argv table (`GATE_SPECS` at `lib/orchestrator.js:79-93`): `validate-outline.ps1` → `-StartChapter N -EndChapter N` when a chapter exists else `-All`; `analyze-source.ps1` → `[]`; the other five → `-Chapter N`. `runGate()` now calls `gateArgsFor()` (`:107-111`, `:755-768`). A regression test was added at `test/unit-orchestrator.test.mjs:582-609`. **I independently verified the fix with real pwsh**: `outline` → `-All`, exit 0 PASS; `batch:O` → `-StartChapter 1 -EndChapter 1`, exit 0 PASS; `disassemble` → `[]`. ✅ Good fix.

**Residual risk in the fix**: `GATE_SPECS` is keyed by **basename only** (`String(rel).split('/').pop()`), and `chapterArgs()` returns `['-Chapter','INVALID']` for a malformed chapter (`:100-102`). That string would be passed verbatim to `[int]$Chapter` scripts — but `runGate():764-767` rejects invalid chapters before spawn, so it's contained. Fine.

### 3.3 F2 — ★ STILL OPEN: non-batch gates never receive a chapter

`runGate()` derives argv from **`state.chapter`**. But in the real Host, `state.chapter` is `null` at every non-batch stage:

- `index.js:307` puts `args.chapter` into `event.chapter`, which `advance()` consumes to set `next.chapter` **only for `batch-step`** (`lib/orchestrator.js:614-622`); for `gate-pass` the reducer never copies `event.chapter` into state.
- `index.js:313` and `:348` call `engine.gate(state.stage, io, project, state)` with the **unmodified `state`**, which has `chapter === null`.

Verified with real `pwsh` on the fixed engine (chapter=null, as in a real run):

```
disassemble  FAIL exit=1 argv=[]            (analyze-source: no source/chapters)
import       FAIL exit=1 argv=[]            (validate-chapter.ps1: missing mandatory Chapter)
outline      PASS exit=0 argv=["-All"]      ✅
design       FAIL exit=1 argv=[]            (validate-design.ps1: missing mandatory Chapter)
write        FAIL exit=1 argv=[]            (validate-chapter.ps1: missing mandatory Chapter)
validate     FAIL exit=1 argv=[]            (validate-chapter.ps1: missing mandatory Chapter)
```

And with the real Host: `gate-pass@design` even **with** `args.chapter=7` → `ok=false, GATE_REFUSED`; `engine.gateArgsFor('validate-design.ps1', {chapter:null})` → `[]`.

**Impact**: 5 of 6 gate-bearing stages (and the whole `disassemble`/`import` branches) can **never pass** a real `gate-pass` in a normal run. The workflow is only traversable via `skip` (audited DEGRADED override), which is exactly what `lead-integration.mjs:86-87` and `pm-blockers.test.mjs:77/131` do — **so the green suite is effectively testing the skip path, not the gate path**. Note the `LIVE-VERIFICATION.md:22` line "real validate-chapter.ps1 ran; it did NOT pass, so the engine REFUSED to advance" is consistent with this and should be read as evidence of the blocker, not of a working gate.

**Minimal fix**: either (a) pass the caller's chapter into the gate state — e.g. in `index.js:313` call `engine.gate(state.stage, io, project, { ...state, chapter: args?.chapter ?? state.chapter })` (and the same at `:304`/`:348`), or (b) explicitly decide that non-batch stages are **whole-project** validations and map them to `-All`/`-InputDir`-style argv with no chapter, then make `gate-pass` accept that. Option (a) is smaller.

### 3.4 F3 — ★ STILL OPEN: gate-less BATCH sub-steps can never advance via the Host

9 of 15 `BATCH_SUBSTEPS` have `gate: null` (`O1,O2,A,A2,B,B2,D1,D4,E`). `runGate()` returns `{ok:true, status:'PASS', skipped:true}` for `rel=null` (`lib/orchestrator.js:746`). But `index.js:316` defines `isRealPass = verdict.ok && verdict.status==='PASS' && verdict.skipped !== true` — so a **skipped PASS is deliberately refused** (B3). Likewise `adjudicatedGate()` (`:700-701`) refuses `scriptVerdict.skipped`. Verified with real Host:

```
gate-pass @O  → GATE_REFUSED (validate-outline param error, pre-fix)
gate-pass @O1 (null gate) → GATE_REFUSED, step stays O1
verify @O1 with PASS + evidenceRefs → ADJUDICATION_FAILED
```

At the reducer level `advance()` **would** happily walk `O1→O2` on `gate-pass` (`unit-orchestrator.test.mjs:437-449`), which is why the unit suite is green — but the Host never lets that event through.

**Impact**: even after F1/F2 are fixed, a real batch chapter can never get past sub-step `O1`. No 100-chapter run is possible. This is the single biggest untested-by-design hole.

**Minimal fix**: add an explicit Host action (e.g. `step-done`) for gate-less steps that calls `engine.advance(state, {type:'step-done'})` with **no** `engine.gate()` call, gated on "current step has no validator". (A `step-done` event + `GATELESS_STEPS` set appeared in `lib/orchestrator.js` mid-review — see §6 — but `index.js`'s tool `action` enum at `index.js:212` still lists only `['status','start','select-branch','gate-pass','gate-fail','batch-step','skip','resume','retry','pause','reset','dispatch','verify']`, so it is **not reachable from the tool**. This needs the Host half too.)

### 3.5 F4 — `import` branch gate is wrong-shaped

`STAGE_GRAPH.import.gate = '.dsh/scripts/validate-chapter.ps1'` (`lib/orchestrator.js:131`), but `import` produces `novel/state.yaml` + splits chapters and has **no single chapter**; `novel-import/SKILL.md:198` calls `validate-chapter.ps1 -Chapter All`. With `chapter=null`, F2 makes it fail with "missing mandatory Chapter"; even with a chapter it would validate one chapter, not the import. `disassemble`'s gate (`analyze-source.ps1`) likewise needs `-InputDir`/`-SourceDir`, not a bare invocation — its real failure is "章节目录不存在" (source not downloaded yet), so it can't pass at gate time either.

**Minimal fix**: give `import`/`disassemble` gates explicit argv (`-Chapter All` / `-InputDir novel/source/chapters`) via `GATE_SPECS`, or set `gate: null` for those stages and let their skills self-validate.

### 3.6 F5 — suite currently RED (mid-refactor)

At R4 `lib/orchestrator.js` had a duplicate `export const REVIEW_STEPS` (`:180` and `:671`) → `SyntaxError` → 7/9 suites failed to import. At R5 the duplicate was gone but `unit-orchestrator.test.mjs:206-218`'s "EXHAUSTIVE validateTransition matrix" derived table didn't know about the new `step-done` event → 8/9, 279/280. **Minimal fix**: update `expectedAllowed()` in `test/unit-orchestrator.test.mjs:194-204` to return `false` for `step-done` at non-gate-less states, or add `step-done` to the matrix's valid-args builder. Also re-run and regenerate `TEST-EVIDENCE.md`.

---

## 4. DANGLING PATH REFERENCES AFTER MATERIALIZATION (brief's item 4)

`materialize()` (`index.js:88-106`) copies `assets/.dsh/**` to `<project>/.dsh/**` and **nothing else**. I checked each referenced path against `assets/.dsh`:

| Reference | Exists in shipped `assets/.dsh`? | Verdict |
|---|---|---|
| `.dsh/rules/script-execution.mdc`, `.dsh/rules/subagent-prompt-whitelist.mdc` (referenced `AGENTS.md:66`, `novel-batch/SKILL.md:157,957`) | ✅ `rules/*.mdc` (2 files, `integration-materialize.test.mjs:132` asserts) | OK |
| `.dsh/config.yaml` (`novel-write/SKILL.md:117`, `novel-batch/SKILL.md:272`, many) | ✅ | OK |
| `.dsh/skills/Humanizer-zh/SKILL.md` (`agent-novel-writer/SKILL.md:228`, `agent-continuity-validator/SKILL.md:232`, `novel-design-export/SKILL.md:34`) | ✅ (exact capital `Humanizer-zh`, registered as skill `humanizer-zh` via `index.js:40-41`) | OK |
| `.dsh/scripts/*.ps1`, `.dsh/scripts/lib/paragraph-metrics.ps1`, `.dsh/templates/*` | ✅ (byte-fidelity proven `integration-materialize.test.mjs:109-136`) | OK |
| `agents/novel-writer.md` — **no `.dsh/` prefix** (`novel-batch/SKILL.md:580`, `novel-write/SKILL.md:164`: "定义于 `agents/novel-writer.md` 的【去AI味规则】段，主流程可读取该文件") | ❌ `<project>/agents/novel-writer.md` does **not** exist; the real file is `<project>/.dsh/agents/novel-writer.md` | **DANGLING (relative-path prefix bug)**. Impact: the "去AI味规则" fallback read fails silently. Minimal fix: change to `.dsh/agents/novel-writer.md` in both SKILL.md lines (or resolve relative to `.dsh/`). |
| **`.codebuddy/...`** in the 9 `assets/.dsh/agents/*.md` | ❌ **No `.codebuddy/` directory exists anywhere under `assets/`** (verified `Get-ChildItem -Recurse -Filter .codebuddy` → empty) | **DANGLING — 19 occurrences** across `agents/chapter-outliner.md:64`, `batch-outliner.md:62`, `batch-designer.md:95,126,154,196`, `continuity-validator.md:3,14,104,105,106,236,347`, `skeleton-rebuilder.md:37,79`, `novel-writer.md:3,88,228,302`. Also `agent-continuity-validator/SKILL.md:343` and `config.yaml:1,21` and `AGENTS.md:3-4,66` mention `.codebuddy/` as the legacy source. |
| `.codebuddy/*` in `assets/.dsh/skills/*/SKILL.md` | ✅ none (skills were correctly migrated to `.dsh/`) | OK |

**Impact of `.codebuddy` refs**: these are the **agent role definition files** (`.dsh/agents/*.md`), which are shipped as reference docs for subagents. A subagent following `agents/continuity-validator.md:104` would run `pwsh -File .codebuddy/scripts/analyze-roster.ps1 -Chapter N` → file not found → `exit 1` → the audit degrades/fails. Same for `build-memory-digest.ps1 -Rebuild` fallbacks (`chapter-outliner.md:64`, `batch-outliner.md:62`) and the constitution templates (`skeleton-rebuilder.md:37,79`). Note the **skills** versions of the same roles were correctly rewritten (e.g. `agent-continuity-validator/SKILL.md:100` uses `.dsh/scripts/analyze-roster.ps1`, `:232` uses `.dsh/skills/Humanizer-zh/SKILL.md`) — so this is a **partial migration**: `.dsh/skills/*/SKILL.md` ✅, `.dsh/agents/*.md` ❌.

**Caveat (don't overstate)**: `AGENTS.md:3-4` says `.codebuddy/` is "原封不动保留，两套可并存" — the **original** `D:\yousen\novel\.codebuddy` does still exist (I verified `Test-Path` = True), so in that one legacy project the paths happen to resolve. But a **fresh clean-profile install** (the plugin's actual distribution scenario, AC-45) materializes only `.dsh/`; `.codebuddy/` will not exist. No test covers this.

**Minimal fix**: mechanical `.codebuddy/` → `.dsh/` rewrite in the 9 `assets/.dsh/agents/*.md` + `config.yaml:1,21` comments; add a **contract test** that walks every shipped `.md`/`.mdc`/`.yaml` and fails on any `.codebuddy/` path (this also closes G7). Cheap, zero runtime risk.

---

## 5. WHAT IS GOOD (genuine strengths — don't manufacture problems)

- **Pure, testable engine**: `lib/orchestrator.js` is dependency-free, `io`-injected, `advance()` is a pure reducer (verified non-mutating across STAGES×EVENTS at `unit-orchestrator.test.mjs:287-298`). Strong design.
- **Exhaustive transition matrix** (`:206-218`), all 3 bootstrap branches (`:325-334`), BATCH 15-step serial order (`:437-449`), retry budgets (`:379-402`), history/log bounded at 128 (`:424-431`).
- **Checkpoint durability is genuinely well tested**: atomic tmp→rename (`:605-615`), byte-stable `stableStringify`, corrupt-file backup preserving bytes (`:677-689`), schema-invalid (`:690-696`), io-read-error (`:697-701`), resume-from-every-stage (`:663-676`), idempotency (`:702-710`).
- **Security / no-leak discipline**: raw stderr/stdout/caller text never echoed (`:560-566`, `failure-recovery.test.mjs:38-63`, `integration-materialize.test.mjs:282-312`); `publicState` drops `recent`/`recentLog`/`gate.failures` (`index.js:146-168`). DEGRADED never advances as fake PASS (B3, `pm-blockers.test.mjs:60-95`). Adjudication requires confirmed evidence (`:815-838`, `pm-blockers.test.mjs:103-113`).
- **Materialization fidelity**: exact path-set + byte-equality, idempotency, never-overwrite user edits, sibling isolation, non-novel preset untouched (`integration-materialize.test.mjs`). This is the best-covered area.
- **Concurrency / hostile input**: 12 activations, 16 concurrent `tool.execute`, junk/jumbo args, io-throws-everywhere, no-agent (`failure-recovery.test.mjs`). No throw escapes; good.
- **run-all.mjs** isolates each suite in its own `node` process and parses a machine-readable `RESULT` line; clean, no deps.
- **The mid-review `GATE_SPECS` fix + regression test is a real, correct improvement** — I verified it against real `pwsh` (§3.2). Whoever did it fixed the exact bug this review was commissioned to find.

---

## 6. WHAT I COULD NOT VERIFY / CAVEATS

1. **The tree was being edited concurrently.** `lib/orchestrator.js` mtime moved 23:08 → 23:13 → 23:23 → 23:25 → 23:26 during this review; `test/unit-orchestrator.test.mjs` gained 28 lines (882→910?) and a new regression test; `docs/REVIEW-publication.md` and `REVIEW-pm.md` appeared. Test counts are a **moving target** — R1/R3 green, R2/R4/R5 red. All `file:line` references are from the snapshot at the time of reading; re-check before acting. I did **not** edit any runtime file (write scope = `docs/REVIEW-qa.md` only).
2. **No live LLM worker / real 3-chapter novel** (AC-38) — same external limit as `TEST-EVIDENCE.md:46` and `LIVE-VERIFICATION.md:59`. I can't verify chapter content generation or the full-book `validate-chapter -Chapter All` PASS.
3. **No clean second DSH profile / GUI dropdown** (AC-45) — cannot restart the Host from this subagent.
4. **`sync-state.ps1` / `build-context-bundle.ps1` FAIL on my synthetic project** (exit 1) even with correct `-Chapter 1`: both need real `summary.md`, `design.md`, `content.md`, `state.yaml`, `style.md` fixtures which I did not fabricate. I therefore **do not claim** those two scripts are broken — only that their param blocks accept `-Chapter` and that a bare/minimal project can't pass them. A full fixture-based integration test is missing (G2).
5. **`analyze-source.ps1`** needs a real `novel/source/chapters` dir; I did not construct one, so its `disassemble` FAIL is an environment absence, not necessarily a code defect — but the `-Chapter` mismatch was real and is fixed.
6. GitHub/market PR status (AC-44) is outside this QA scope; see `REVIEW-publication.md` / `market/PR_STATE.md`.
7. I did not run the tests inside the live DSH Host (only `node` + real `pwsh`); `cordis_inspect_query` Client queries timed out in the api-researcher's session, so Client-slot behavior is unverified here too.

---

## 7. PRIORITIZED MINIMAL-FIX LIST (for lead / builder)

| # | Severity | Finding | Minimal fix |
|---|---|---|---|
| **F3** | 🔴 Blocker | Gate-less BATCH steps (`O1…E`) can never pass Host `gate-pass` (`index.js:316` refuses `skipped`) → batch loop dead | Add a Host action (e.g. `step-done`) that advances without `engine.gate()`, restricted to steps with no validator; wire it into `index.js:212` enum; add an end-to-end test walking all 15 steps of one chapter with real scripts. |
| **F2** | 🔴 Blocker | `index.js:313/348` passes `state` (chapter=null) to `engine.gate()`; 5 non-batch gates fail "missing mandatory Chapter" | Pass `{...state, chapter: args?.chapter ?? state.chapter}` into `engine.gate()` (and at `:304`/`:348`); or map those stages to explicit whole-project argv. Add a test that issues a real `gate-pass` at `design` and asserts it advances. |
| **F4** | 🟠 High | `import` gate `validate-chapter.ps1` with no chapter; `disassemble` gate `analyze-source.ps1` with no `-InputDir` | Add `GATE_SPECS` entries (`-Chapter All` / `-InputDir novel/source/chapters`) or set `gate:null` and let the skill self-validate. |
| **F5** | 🟠 High (transient) | Suite RED at final observation (8/9, `step-done` matrix mismatch); earlier transient duplicate `REVIEW_STEPS` SyntaxError | Update `expectedAllowed()` in `test/unit-orchestrator.test.mjs:194-204`; re-run; regenerate `TEST-EVIDENCE.md` (currently stale 275/275) and `LIVE-VERIFICATION.md:52` (278/278). |
| **F1** | ✅ **Fixed mid-review** (was 🔴) | Blanket `-Chapter` broke `validate-outline.ps1` / `analyze-source.ps1` | `GATE_SPECS` + `gateArgsFor()` (`lib/orchestrator.js:79-111`) — **verified correct with real pwsh**. Keep the regression test `test/unit-orchestrator.test.mjs:582-609`. |
| **G1/G6** | 🟡 Coverage | No test executes a real `.ps1`; no contract test between `GATE_SPECS` and script `param()` blocks | Add ONE integration test: materialize into tmpdir, run `engine.gate()` for every stage/step with real `pwsh` on a minimal-but-valid fixture, assert exit codes; plus a static test parsing each `.ps1` `param()` block and comparing to `GATE_SPECS`. This single addition would have caught F1/F2/F4. |
| **G3** | 🟡 Coverage | No 100-chapter / `totalChapters=100` loop test | Parametrize the existing `final substep gate-pass advances chapter` test with `totalChapters=100`, loop 100×, assert `chapter===100` then `stage==='export'`. |
| **G4** | 🟡 Coverage | `validate-chapter -Chapter All` unreachable (`normalizeChapter` rejects non-numeric) | Either add a typed `all-chapters` event or document that full-book validation is skill-level only. |
| **D1** | 🟡 Docs | 19 `.codebuddy/` refs in `assets/.dsh/agents/*.md` + `config.yaml`; `agents/novel-writer.md` missing `.dsh/` prefix | Mechanical rewrite `.codebuddy/`→`.dsh/`; fix the two `agents/novel-writer.md` refs to `.dsh/agents/novel-writer.md`; add a static "no `.codebuddy/` in shipped assets" test. |
| **Docs** | ⚪ Consistency | `TEST-EVIDENCE.md:9` (275/275), `LIVE-VERIFICATION.md:52` (278/278), `REVIEW-pm.md:20` (279/279) disagree with current 280/280 + RED | Regenerate from the final settled `run-all.mjs` output. |

---

## 8. BOTTOM LINE FOR LEAD

The **publishing/plugin packaging** is well covered; the **real novel-writing workflow is not**. 279–280 green assertions all run against a mocked `spawnSync` that returns `{status:0}`, so they prove the *state machine* but not the *gates*. My real-`pwsh` probes found that the original blanket `-Chapter` binding was broken (now fixed mid-review ✅), but two deeper structural blockers remain unaddressed in the Host: **non-batch gates get no chapter** and **gate-less batch steps can never pass**. Until F2 + F3 are fixed and a real-script integration test is added, "AC-38 partially closed with live runtime evidence" (`LIVE-VERIFICATION.md:59`) is optimistic — the live evidence shows a gate being *refused*, not a chapter being *completed*.

**Recommendation: do not ship as "非常好用" until F2/F3 are fixed and one real-`pwsh` end-to-end test exists.** F1's fix and the regression test are genuine improvements worth keeping.
