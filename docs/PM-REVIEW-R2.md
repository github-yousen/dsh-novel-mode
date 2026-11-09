# PM Acceptance Review — R2 (RESIDENT PM)

> **Reviewer**: `product-manager` (resident, standing). **Task**: task-8 (still `in_progress`, owner `product-manager`).
> **Reviewed tree**: `D:\yousen\novel-mode-plugin` as of 2026-11-10 02:57 +08. I re-read the final files myself and re-ran the suite; I did not rely on the Lead's fix summary.
> **Contract**: [PM-PRD.md](PM-PRD.md) AC-1..48. **Prior round**: [PM-REVIEW-R1.md](PM-REVIEW-R1.md) = REJECT with 5 blockers (B1–B5).
> **Test run (by me)**: `node test/run-all.mjs` → **9/9 suites, 275/275 assertions, 0 failures** (new `pm-blockers.test.mjs` 18/18).
> **Verdict**: **APPROVE** — all 5 blockers fixed, verified empirically at engine AND Host level; N1/N2 honest-claims contradictions resolved; AC-38/44/45 remain documented-pending external release gates (not blockers, per Lead's instruction and R1 precedent).

---

## 0. Verdict summary

| Area | R1 | R2 |
|---|---|---|
| B1 sub-step gates never run | FAIL | **PASS** (empirically spawned) |
| B2 adjudication/dispatch dead code | FAIL | **PASS** (Host `dispatch`/`verify` wired end-to-end) |
| B3 DEGRADED advances as fake PASS | FAIL | **PASS** (`ok:false` + `isRealPass` gate) |
| B4 prose FSM shipped & user-invocable | FAIL | **PASS** (stripped + `userInvocable:false`) |
| B5 stray root checkpoint ships | FAIL | **PASS** (git-ignored + no committed checkpoint) |
| N1/N2 honest-claims | MAJOR | **PASS** (ARCHITECTURE §4/§5 + README now match code) |
| AC-39 test report | MAJOR | **PASS** ([TEST-EVIDENCE.md](TEST-EVIDENCE.md)) |

**BLOCKERS remaining: 0.** I am issuing **APPROVE**. Two non-blocking observations in §4; three external N/As in §5. I remain resident for R3/further rounds and do **not** mark task-8 done.

---

## 1. Independent verification of each fixed blocker

### B1 — BATCH sub-step gates now execute (AC-3, AC-15) → **PASS**
**Code**: `gateForStage(stage, batchStep)` `orchestrator.js:687-695` is the single source of truth; `gate()` `orchestrator.js:732-744` calls it with `state.batchStep`, and `runGate()` `:698-725` spawns `pwsh -NoProfile -File <rel> -Chapter <int>`. Host `index.js:313` uses `engine.gate(state.stage, io, project, state)` — now sub-step-aware.

**My probe (not the Lead's claim)**:
```
gateForStage('batch','C') → .dsh/scripts/validate-chapter.ps1
gate('batch', io, '/p', {batchStep:'C',chapter:7}) spawn →
  ["pwsh", ["-NoProfile","-File",".dsh/scripts/validate-chapter.ps1","-Chapter","7"]]
failing script (status 4, stderr 'SECRET') → FAIL, ok:false, failures:["script-exit-4"], no 'SECRET' leak
gateForStage('batch','O1') → null (no-script step, correctly skipped)
```
`test/pm-blockers.test.mjs:41-58` and `unit-orchestrator.test.mjs` (updated) cover this. R1's "declared but never run" gap is closed.

### B2 — Adjudication + dispatch wired into the Host (AC-8, AC-16, AC-34) → **PASS**
**Code**: new `dispatchFor()` `:596-606` (typed role + allowlisted args for `O/O1/O2/A/A2/B/D4`), `REVIEW_STEPS` `:589`, `adjudicatedGate()` `:618-627`, `truthResolver()` `:630-638`. Host exposes `dispatch` + `verify` actions (`index.js:212-213`, `:333-360`) with a typed `verdicts` schema (`additionalProperties:false`, `:221-232`). `verify` re-runs the script gate, calls `adjudicatedGate()`, and only then advances.

**My probes**:
```
adjudicatedGate(PASS script, [{PASS, evidenceRefs:[]}]) → ok:false NOT_COVERED
adjudicatedGate(PASS script, [{PASS, evidenceRefs:['novel/state.yaml']}], truth resolving true) → ok:true PASS
adjudicatedGate(DEGRADED script, …) → ok:false 'degraded-not-a-pass'
dispatchFor({batchStep:'D4'}) → {role:'agent-continuity-validator', args typed, needsAdjudication:true}
```
**Host end-to-end** (real `apply()` + `tool.execute` on a temp project with a real `pwsh` shim): `verify` with a PASS + confirmed evidence → `code: 'ADJUDICATED_PASS'`, stage `design → write`, user-visible render = `阶段：write · 就绪` only. And `verify` with evidence-free PASS → refused (no gate flip) — confirmed by `pm-blockers.test.mjs:136-140`. `adjudicate()` is no longer dead code; N2 ("9 workers evidence-adjudicated in code") is now TRUE.

### B3 — DEGRADED never advances as fake PASS (AC-3, AC-26, NG-8) → **PASS**
**Code**: `runGate()` returns `{ok:false, status:'DEGRADED', skipped:true}` on missing runner (`:700-703`) and on runner throw (`:722-724`). Host `isRealPass = verdict.ok===true && verdict.status==='PASS' && verdict.skipped!==true` (`index.js:316`); `gate-pass` with a non-real pass returns `GATE_DEGRADED` + generic `recovering` status without advancing (`:317-322`). `adjudicatedGate()` also refuses any non-PASS script verdict (`:619-621`).

**My probe**: `gate('write', io-without-spawnSync, …)` → `DEGRADED, ok:false, skipped:true`. Host `gate-pass` no longer advances (R1's `write→validate` fake PASS is gone). `test/pm-blockers.test.mjs:60-95` + `failure-recovery.test.mjs:278-288` cover it. README:63-64 / ARCHITECTURE:69-71 now accurate (N1 resolved).

### B4 — Rejected prose FSM stripped & engine-only (AC-9, AC-11, NG-1/4) → **PASS**
**Code**: `index.js:43` `ENGINE_CONTROLLED_SKILLS = {'novel-batch','novel-write'}`; registration `:198` sets `userInvocable: false` for both. `novel-batch/SKILL.md:32-42` now says "本技能是**工人参考材料**，不是流程控制器……由 JS 状态机代码裁决……不得输出任何面向用户的流程宣告" — the old `执行铁律/关卡宣言/我不赶工/固定措辞` block is gone; `novel-write` 5 自检宣言 lines removed.

**My scan**: grep `关卡|我不赶工|有限状态机|执行铁律|自检宣言|固定措辞` across all 21 `SKILL.md` → **1 hit**, which is the *negative* instruction `不得输出任何面向用户的流程宣告` (`novel-batch/SKILL.md:40`) — acceptable worker reference, not a control declaration. `pm-blockers.test.mjs:143-162` asserts 0 control-prose strings (its regex excludes that negative phrasing) and both skills `userInvocable:false`. A user can no longer select the prose FSM from the `/` menu. AC-9/AC-11 PASS.

### B5 — Stray root checkpoint no longer ships (AC-25, I1) → **PASS (with minor note)**
**Code/state**: `.gitignore:7` now has `.dsh/`. I ran `git check-ignore -v .dsh/state/novel-mode.checkpoint.json` → `.gitignore:7:.dsh/` (ignored); `git status --short --ignored .dsh` → `!! .dsh/`. So even if present locally it **cannot be committed and cannot ship via the git install path** — which was the actual R1 concern. `pm-blockers.test.mjs:164-175` asserts no root checkpoint + ignore rule.

**Minor note (non-blocking)**: running `node test/run-all.mjs` recreates `.dsh/state/novel-mode.checkpoint.json` in the CWD (a test writes it via `projectRootOf` fallback). It is harmless (git-ignored, never published), but the suite is not fully CWD-clean. See O2 in §4 — housekeeping only, not a ship blocker.

---

## 2. AC-1..46 re-verification (delta-focused)

All ACs not listed below retain their R1 PASS verdicts (re-confirmed by the 9-suite green run + my re-reads of `package.json`, `cordis.patch.yml`, READMEs, market files, PNGs). Changes since R1:

| AC | R1 | R2 | Evidence |
|---|---|---|---|
| AC-3 | FAIL | **PASS** | B1 + B3 (sub-step scripts run; DEGRADED refuses). |
| AC-4 | MAJOR | **MAJOR (unchanged, accepted)** | Truth-source write whitelist remains prose in `AGENTS.md`/`novel-batch/SKILL.md:41`; engine does not itself enforce artifact writes. Documented exception: workers own writes; engine owns gates/checkpoints. Not a blocker — the engine never writes truth files, so it cannot violate the whitelist. |
| AC-8 | FAIL | **PASS** | B2 wired `dispatch`/`verify` + `adjudicatedGate`. |
| AC-9 | FAIL | **PASS** | B4 stripped control prose; no goodwill-dependent gate remains. |
| AC-11 | FAIL | **PASS** | B4 `userInvocable:false` + 0 residual declarations; tool `render()` clean. |
| AC-15 | FAIL (partial) | **PASS** | B1 sub-step gates now executed within the serial 15-step walk. |
| AC-16 | FAIL | **PASS** | B2 `verify` path implements the adjudicated repair/refusal decision in code. (Note: *minimal content repair* itself is still a worker task, not engine code — accepted; the engine's job is to refuse/allow, not to edit prose.) |
| AC-25 | MAJOR→FAIL | **PASS** | B5 git-ignored; no committed checkpoint. |
| AC-26 | FAIL | **PASS** | G1 DEGRADED now non-advancing; G2 subagent-unavailable → `verify` refuses (no evidence); G3/G4 unchanged PASS. |
| AC-34 | FAIL | **PASS** | `pm-blockers.test.mjs:103-140` Host-level adversarial: evidence-free PASS does NOT flip a gate. |
| AC-39 | MAJOR | **PASS** | `docs/TEST-EVIDENCE.md` maps suites→ACs + B1..B5 regressions + reproduction + the 3 N/As. |
| AC-43 | PASS (N4 note) | **PASS** | `index-snippet.json` commit SHA still needs confirming against pushed `main` HEAD at publish time — carried as O3, not a blocker (I cannot query the remote in this harness). |
| AC-38 / AC-44 / AC-45 | N/A | **N/A (carried)** | See §5. |

**N1 (ARCHITECTURE claims vs B3)** → **RESOLVED**: `ARCHITECTURE.md:64-71` now describes `gateForStage` + `ok:false` DEGRADED + Host `isRealPass`; matches code I probed.
**N2 (honest claims about adjudication)** → **RESOLVED**: `ARCHITECTURE.md:75-95` and `README.md:41-43` now describe a wired, code-enforced `dispatch`/`verify` path — TRUE per my Host end-to-end probe.

---

## 3. What I re-ran / re-read in this round

- `node test/run-all.mjs` → 9/9, 275/275, exit 0 (independently, in this session).
- `lib/orchestrator.js` (full, 744 lines), `index.js` (full, 406 lines) — line-level re-read.
- Engine probes: `gateForStage`, sub-step spawn argv, failing script, DEGRADED, `adjudicatedGate` (3 cases), `dispatchFor`.
- **Host end-to-end probe**: real `apply()` + `tool.execute` `verify` with a passing script + confirmed evidence → `ADJUDICATED_PASS` → `design→write`; render text = `阶段：write · 就绪` (no internals).
- `grep` all 21 `SKILL.md` for control prose → only 1 negative instruction.
- `git check-ignore` / `git status --ignored` for B5.
- `docs/ARCHITECTURE.md` §4/§5, `docs/TEST-EVIDENCE.md`, `README.md:27-49`, `test/pm-blockers.test.mjs` (full).
- Re-confirmed unchanged PASS areas: 21 skills registered, no persona in `cordis.patch.yml`, `STATUS_TEXT`/projections, catalog YAML + raster PNGs (verified in R1, unchanged), `PR_STATE.md` pending record.

---

## 4. Non-blocking observations (carry forward, do NOT gate this APPROVE)

- **O1 (architecture note, not a defect)**: the engine is **tool-call driven**, not a self-running timer loop — the model/agent acts as the *transport* that calls `start → select-branch → dispatch → verify → gate-pass → …`. Every **decision** (which worker role, typed args, whether a gate passed, whether to advance) is made by code; the model cannot skip a stage, fake a PASS, or supply free-text control. This satisfies PRD §1.5 "no reliance on the model's goodwill" for **outcomes**, which is the normative bar. If the team later wants fully unattended execution, add a Host-side driver that chains `dispatch→verify→advance` without model turns — but that is an enhancement, not a blocker. Worth stating in ARCHITECTURE so reviewers don't misread "deterministic engine" as "autonomous daemon".
- **O2 (housekeeping)**: `run-all.mjs` leaves a CWD `.dsh/state/novel-mode.checkpoint.json` (git-ignored, never ships). Consider having the suites use a temp project root consistently so the checkout stays pristine. Cosmetic.
- **O3 (publish-time)**: `market/index-snippet.json:40` `source.commit` (`6438cd6…`) and `:36` `publishTimestamp` must be confirmed against the actual pushed `main` HEAD before hosting the self-hosted index. I cannot query the remote from this delegated harness. Owner: Lead at publish time.
- **O4 (AC-4 accepted exception)**: truth-source write whitelist (state.yaml only via `sync-state.ps1`, no whole-chapter rewrite) is enforced as worker reference prose, not engine code. Acceptable because the engine never writes truth files; document it as a deliberate boundary.
- **O5**: `pm-blockers.test.mjs:165-170` tolerates a root `.dsh/` dir as long as no `.checkpoint.json` exists — correct for shipping, but combined with O2 the local tree is not byte-clean after a test run. No publish impact.

None of O1–O5 block APPROVE.

---

## 5. External / documented-pending items (carried, NOT blockers)

| AC | Status | Why not verifiable here | Next owner/action |
|---|---|---|---|
| **AC-38** (real-model ≥3 chapters, `validate-chapter -Chapter All` PASS, export) | **N/A — deferred release gate** | Automated suites use mocked `io`/`ctx`; no live LLM worker run, no real `pwsh` fixture project driven to 3 finished chapters. `dispatch`/`verify` are wired but worker execution happens in a real user session. | Lead/user: real session on a clean profile with `pwsh`, 3 chapters via the engine, then full-book validate. |
| **AC-44** (CI gates success / PR merged) | **N/A — documented pending** | PR #13689 open; `Submission gate` age gate + maintainer merge are upstream-controlled. `PR_STATE.md:21-30` + `PR_BODY.md:3` + `SUBMISSION_STEPS.md:18` hold the dated (2026-11-10 01:10 +08), evidence-backed pending record; `check` = success. Per Lead's instruction and R1 precedent this is **not** counted as a blocker, but the plugin is **not yet "successfully published"** (PUB3). | Upstream CI auto-rerun + maintainer; re-check PR #13689 and update `PR_STATE.md`. |
| **AC-45** (clean-profile install + GUI mode dropdown) | **N/A — documented pending** | Cannot create a second DSH profile, restart the Host/Web GUI, or start a replacement server from this delegated teammate session. Equivalent code path verified by `lead-integration.mjs` (23/23) + `TEST-EVIDENCE.md:41`. | Lead/user on a real profile: `dsh plugin add`, refresh existing GUI, select 小说模式, confirm `.dsh/` appears only in that project. |

These are the same three documented-pending items from R1, now also recorded in `docs/TEST-EVIDENCE.md:35-41`. I have **not** silently dropped them; they remain external release gates. If the catalog goes public, AC-44 must be re-checked before claiming "published".

---

## 6. Decision

**APPROVE.** The five R1 blockers are fixed and verified at both the pure-engine and Host-adapter levels; the honest-claims contradictions are resolved; the test bar is 9 suites / 275 assertions with a dedicated B1–B5 regression suite and an AC→evidence report; marketing copy is accurate, engine-led, and download-driving; no credentials, no prompt dumps, no error leaks, no persona prose. The remaining items are one accepted design boundary (AC-4), five non-blocking observations, and three external release gates outside this harness.

**Resident status**: task-8 stays `in_progress`; I do **not** mark myself done. I remain available for:
- R3 if any of O1–O5 is addressed or if AC-38/44/45 produce real evidence,
- a final pre-publication spot-check of AC-43/O3 (commit SHA) and AC-44 (PR state),
- any further review rounds the Lead calls.

*End of PM-REVIEW-R2.*
