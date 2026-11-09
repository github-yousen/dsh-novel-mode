# PM Acceptance Review — R1 (RESIDENT PM)

> **Reviewer**: `product-manager` (resident, standing). **Task**: task-8 (claimed, in_progress).
> **Reviewed tree**: `D:\yousen\novel-mode-plugin` as of 2026-11-10 02:30 +08. I re-read the files myself; I did not rely on the Lead's summary.
> **Contract**: [PM-PRD.md](PM-PRD.md) AC-1..48. **Test run**: `node test/run-all.mjs` executed by me → **8/8 suites, 257/257 assertions, 0 failures** (independently reproduced).
> **Verdict**: **REJECT** — strong engineering, but 5 BLOCKER-class gaps remain against the mandate. This is not a final judgment; I stay available for R2.

---

## 0. Verdict summary

| Block | AC range | Result |
|---|---|---|
| A — Strong orchestration | AC-1..9 | 6 PASS / 3 FAIL (AC-3, AC-8, AC-9) |
| B — Anti-patterns | AC-10..19 | 8 PASS / 2 FAIL (AC-11, AC-15 partial) |
| C — Enterprise / production | AC-20..29 | 9 PASS / 1 FAIL (AC-26) + 1 MAJOR (stray checkpoint) |
| D — Exhaustive testing | AC-30..39 | 7 PASS / 2 FAIL (AC-34, AC-38 N/A) + 1 MAJOR (AC-39 report) |
| E — Marketing & publication | AC-40..46 | 5 PASS / 2 N/A (AC-44, AC-45 documented pending) |
| F — Governance | AC-47..48 | PASS (this review) |

**BLOCKERS (must fix before APPROVE):**
1. **B1** — BATCH sub-step gates are declared but **never executed** (AC-3, AC-15).
2. **B2** — `adjudicate()` and subagent dispatch are **never wired into the Host**; no worker is ever dispatched (AC-8, AC-16, §1.6).
3. **B3** — A `DEGRADED` gate is recorded as `PASS` and **advances the stage** (AC-3, AC-26, NG-8, ARCHITECTURE.md:67 claims otherwise).
4. **B4** — The rejected prose "finite state machine" + user-visible "关卡宣言" are **still shipped and user-invocable** (AC-9, AC-11, NG-1/NG-4).
5. **B5** — A stray runtime checkpoint with a 500-char filler goal is **untracked at plugin root** and would ship on a git install (AC-25, I1, NG-9).

**N/A (documented, per Lead's note):** AC-38, AC-44, AC-45 — see §5.

---

## 1. What genuinely improved (credit where due)

This is a real, substantial rebuild — **not** the skin-deep rewrite I flagged as R1-risk in my PRD handoff:
- `lib/orchestrator.js` is a **pure, importable JS reducer** (`advance()` L466, `validateTransition()` L440, `STAGE_GRAPH` L71, `BATCH_SUBSTEPS` L53) with a closed `EVENT_TYPES` set (L129) and no model-visible prose. AC-1 PASS.
- `cordis.patch.yml` has **no persona** (verified L25-110: first plugin is `agent-instructions`, no `prefix:`/`suffix:`). AC-10 PASS.
- The Host **re-verifies gate events against real script verdicts** before honoring `gate-pass` (`index.js:295-303`): a model cannot assert PASS. AC-14 PASS.
- Versioned atomic checkpoint with corruption backup (`orchestrator.js:228-272`) — genuinely durable, restart-safe. AC-5/AC-25 largely PASS.
- `publicState`/`publicGate`/`publicPlan` projections (`index.js:144-179`) + generic localized `STATUS_TEXT` (L68-71) + full try/catch (L323-327). AC-12 PASS.
- Marketing copy is excellent and honest: README en/zh lead with the engine value prop, the "prompt pack vs engine" table, re-counted asset line, real raster PNGs (icon 180×180, screenshot 1200×675 — I verified the PNG signatures/dimensions myself). AC-40/41/42 PASS.
- 257/257 tests across 8 angles — genuinely multi-angle, not a token suite.

The problems below are about **wiring completeness**, not about the quality of the engine core.

---

## 2. BLOCKER findings (file:line evidence + minimal fix)

### B1 — BATCH sub-step gate scripts are never executed (AC-3, AC-15, §1.4)
**Evidence**
- `lib/orchestrator.js:53-69` declares `BATCH_SUBSTEPS` with 7 `gate` scripts (`validate-outline.ps1`, `build-context-bundle.ps1`, `validate-design.ps1`, `validate-chapter.ps1`, `validate-summary.ps1`, `sync-state.ps1`) — good data.
- `lib/orchestrator.js:629-632`: `gate()` reads `const node = STAGE_GRAPH[stage]` and runs **`node.gate` only**. `STAGE_GRAPH.batch.gate === null` (`orchestrator.js:114`), so `gate('batch', …)` returns `PASS skipped / no-validator` (`orchestrator.js:632`).
- `plan()` emits `step.gate` as **data** (`orchestrator.js:323`) but nothing consumes it: `index.js:295-308` calls `engine.gate(state.stage, …)`, i.e. always the **stage** gate, never the sub-step gate.
- I probed: `gate('batch', io, '/p', state)` → `{ok:true, status:'PASS', skipped:true, reason:'no-validator'}` with zero spawn.
- `test/unit-orchestrator.test.mjs:437` "gate-pass walks every BATCH_SUBSTEPS id in strict serial order" tests the **reducer walk**, not script execution. No test asserts a sub-step validator runs.

**Impact**: for the entire unattended batch pipeline (the product's headline capability), the "PowerShell validators decide every gate" claim (`README.md:22`, `PR_BODY.md:12`, catalog YAML:14) is **false at runtime**. The 15-step FSM advances on `gate-pass` events with no script behind them. This is exactly AC-3's "break an artifact and show the engine refuses to advance".

**Minimal fix**: in `index.js` gate handling, when `state.stage === 'batch' && state.batchStep`, resolve `BATCH_SUBSTEPS.find(s => s.id === state.batchStep)?.gate` and run that script instead of `node.gate`; add a test that injects a failing sub-step script and asserts the batch step does NOT advance. Optionally expose `gateForStage(stage, batchStep)` in the engine so the Host cannot get it wrong.

### B2 — `adjudicate()` / subagent dispatch is dead code (AC-8, AC-16, §1.6)
**Evidence**
- `lib/orchestrator.js:386-434` implements `adjudicate()` correctly (I verified: PASS-no-evidence → `NOT_COVERED`, disproved CRITICAL → dismissed, fixed precedence).
- `grep adjudicate\(|startActivation|workflowEngine|agent\.steer|followup` over all `*.js` in the plugin returns **only** the definition and its doc comment (`orchestrator.js:14, 386`) — **zero call sites**.
- `index.js` never calls `ctx.get('workflowEngine')`, never dispatches a subagent, never collects `{verdict, evidenceRefs[]}`. `dispatchArgs`/`validateDispatch` are used once (`index.js:281`) purely as an input guard on `batch-step`.
- `cordis.patch.yml:65-93` wires subagent/workflow **tools** into the preset, but that only makes them available to the *model*; the engine does not drive them.

**Impact**: the mandate "subagent dispatch with adjudication" and my §1.6 are unmet at the product level. The engine is a **state tracker**, not yet an **orchestrator that runs workers**. `adjudicate()` is unit-tested (`unit-orchestrator.test.mjs:804-828`) but unreachable in production. AC-8's "PASS with no evidence does not flip a gate" is untestable end-to-end because no gate ever receives a subagent verdict. ARCHITECTURE.md:72-83 and README.md:41-43 describe a behavior the shipped Host does not perform.

**Minimal fix**: wire one concrete path — e.g. at `A2`/`D4`/`O1` sub-steps, dispatch the registered `agent-continuity-validator` role via the subagent tool with `dispatchArgs()`, feed its `{verdict, evidenceRefs}` into `adjudicate()` with a truth resolver over `novel/` files, and let the adjudicated verdict drive `gate-pass`/`gate-fail`. Add an integration test with a mocked subagent returning `PASS`-with-no-evidence and assert the engine does not advance. **If the team intentionally scopes the engine to "stage tracker" only**, then downgrade the marketing claims (README/PR_BODY/catalog) to match reality — but that would still fail the user's explicit strong-orchestration mandate, so wiring is preferred.

### B3 — DEGRADED gate advances as PASS (AC-3, AC-26, NG-8)
**Evidence**
- `lib/orchestrator.js:638-640` and `:660-662`: missing `pwsh`/runner returns `{ ok: true, status: 'DEGRADED', skipped: true }`.
- `index.js:297`: `if (action === 'gate-pass' && !verdict.ok)` — a DEGRADED verdict has `ok === true`, so it is treated as a pass. `index.js:304` also lets a claimed `gate-fail` be ignored when the script "says PASS".
- `lib/orchestrator.js:502-503`: `gate-pass` unconditionally records `next.gate = { verdict: 'PASS', ... }` and advances to `node.next`.
- **My probe**: `gate('write', io-without-spawnSync, …)` → DEGRADED; `advance(state,{type:'gate-pass'})` → **stage `validate`**, `gate.verdict = "PASS"`.
- `test/failure-recovery.test.mjs:278-288` checks `gate()` in isolation only; no test covers the **Host admission** of a DEGRADED verdict.

**Impact**: violates PRD §1.4 ("DEGRADED is non-green, never a silent pass"), §3.5 G1, NG-8, and directly contradicts `README.md:63-64` / `ARCHITECTURE.md:67` ("never a crash and never a silent pass"). On a machine without `pwsh` (a documented supported degradation path), the engine silently walks the whole DAG recording fake PASSes.

**Minimal fix**: `index.js:295-308` — honor `gate-pass` only when `verdict.status === 'PASS' && verdict.ok && !verdict.skipped`; on `DEGRADED`, do not advance, return a neutral generic status and record a `DEGRADED` log entry. Add a Host-level test (missing runner + `gate-pass` action → stage unchanged, verdict DEGRADED).

### B4 — Rejected prose "state machine" + user-visible declarations still shipped (AC-9, AC-11, NG-1/NG-4)
**Evidence**
- `assets/.dsh/skills/novel-batch/SKILL.md:32-108` is **unchanged** from the baseline: `## 执行铁律`, L34 "先把本命令当成**有限状态机**", L87-88 the literal `✅ 关卡{X} 过…` / `⏳ 下一关…我不赶工，严格按流程继续`, L105 "不可改写或删除", plus 5 more 宣言 sites (L529, L618, L743, L867, L903).
- `index.js:188-196` registers all 21 skills with `invocation: { modelInvocable: true, userInvocable: true }` — including `novel-batch`. So a user can select it directly from the `/` menu and get a **prompt dump** + a parallel, model-obedience workflow that bypasses the engine entirely.
- `test/unit-skills.test.mjs:141` only asserts "no skill body references an absolute host path"; there is **no test** asserting the control prose is gone or that gate outcomes are goodwill-independent.

**Impact**: the exact artifact the user called "垃圾简单的插件" is still in the package and reachable. AC-9 ("removing all worker-facing 铁律/关卡宣言 prose does not change any gate outcome") is untested; AC-11 ("no SKILL.md body / gate declaration rendered into user-visible chat") fails for the user-invocable skill path. Note: the PRD permits these texts as **isolated worker reference** (§1.5, AC-11 parenthetical) — but they are not isolated; they are the *only* definition of the batch state machine for anyone who loads the skill, and they are user-invocable.

**Minimal fix** (choose one, state it in R2):
- (a) **Delete the state-machine control sections** from `novel-batch/SKILL.md` (keep only creative-writing guidance), and set `userInvocable: false` for the `novel-batch` skill (engine-only); or
- (b) Keep the file as legacy reference under `docs/legacy-commands/` (per `workflow-audit.md §2.4`) and remove it from runtime registration.
Then add a test asserting no `"关卡" / "我不赶工" / "有限状态机"` string exists in any **registered** skill body, and an AC-9 test that strips all prose and re-runs the gates.

### B5 — Stray runtime checkpoint at plugin root would ship (AC-25, I1, NG-9)
**Evidence**
- `novel-mode-plugin/.dsh/state/novel-mode.checkpoint.json` exists with `project: "D:\\yousen\\novel-mode-plugin"`, `status: "running"`, and a **500-char `goal` of `xxxx…`** (a test/Host smoke artifact).
- `git status --short` (I ran it): `?? .dsh/` — **untracked but present**. `git ls-files .dsh` returns nothing today, but `git add -A` (the normal publish flow) would commit it. A git-based install (`dsh plugin add <url>`) clones the repo, so this runtime state ships.
- `.gitignore:1-10` does **not** ignore `.dsh/` or `.dsh/state/`. `package.json:30-41` `files` whitelist would exclude it from an **npm pack**, but the documented primary install path is git URL (`README.md:54`, `market/INSTALL.md`), not npm pack.
- `test/security.test.mjs:25` filters `.git`/`.idea` but its `isPublished()` (L33-40) does **not** exclude root `.dsh/`, so the suite does not flag it.

**Impact**: a non-empty, non-deterministic engine state (a "running" run with a filler goal) ships in the plugin and could be loaded as a pre-existing checkpoint in a target project; it also pollutes the public repo. Minor in severity but a clean BLOCKER for the "enterprise/production bar" (idempotent install, no runtime state in the payload).

**Minimal fix**: delete `novel-mode-plugin/.dsh/state/novel-mode.checkpoint.json`, add `.dsh/` and `.dsh/state/` to `.gitignore`, and add a security-test assertion that no `*.checkpoint.json` exists at plugin root.

---

## 3. Per-AC verdicts (AC-1..46)

Legends: **PASS** = verified with file:line or test evidence; **FAIL** = blocker; **MAJOR** = must fix or accept with documented exception; **N/A** = not verifiable in this harness (reason given).

### A. Strong orchestration
| AC | Verdict | Evidence |
|---|---|---|
| AC-1 | **PASS** | Real JS transition tables `orchestrator.js:71-126`, `:53-69`; pure reducer `:466-582`; closed events `:129-132`. No control prose in `index.js` or patch. |
| AC-2 | **PASS** | 11 STAGES `:41-44`, 3 branches `:47`, 15 sub-steps `:53-69`, stable ids in state `:186-188`. |
| AC-3 | **FAIL** | `gate()` only uses `STAGE_GRAPH[stage].gate` (`:629-632`); `batch.gate=null` (`:114`); sub-step gates never spawned. See **B1**. Also DEGRADED advances — see **B3**. |
| AC-4 | **MAJOR** | `stageGuard` (`:612-622`) enforced for `entry[]` artifacts; but the PRD's full truth-source write whitelist (`state.yaml` only via `sync-state.ps1`, no whole-chapter rewrite) is **not enforced by the engine** — it lives only as prose in `AGENTS.md`/`SKILL.md`. Engine never writes artifacts at all, so it neither violates nor enforces it. Acceptable only if documented that workers (skills) own writes and are unverified; otherwise add an artifact-write guard. |
| AC-5 | **PASS** | Versioned atomic `saveState`/`loadState` `:228-272`; `test/unit-orchestrator.test.mjs:619-703` round-trip, corruption, resume-from-every-stage. I re-ran the suite. |
| AC-6 | **PASS** | `stableStringify` `:144-149`; idempotent re-entry test `:691`; materialize idempotent `index.js:98` + `integration-materialize.test.mjs:191-207`. |
| AC-7 | **PASS** | `gate-fail` bounded `maxRetries` → `paused` `:542-556`, `:379-403` test; classified `script-exit-N` `:653`. |
| AC-8 | **FAIL** | `adjudicate()` correct (`:386-434`) but **zero call sites**; no subagent dispatch from Host. See **B2**. |
| AC-9 | **FAIL** | Old prose FSM still shipped & user-invocable. See **B4**. No goodwill-independence test exists. |

### B. Anti-patterns
| AC | Verdict | Evidence |
|---|---|---|
| AC-10 | **PASS** | `cordis.patch.yml:25-110` no `@deepseek-ai/dsh-persona`; `security.test.mjs:254-261` asserts no `prefix:`/`suffix:`/`systemPrompt`/`agent.inject`. |
| AC-11 | **FAIL** | `novel-batch/SKILL.md:87-88` declarations + `index.js:194` `userInvocable:true`. See **B4**. (Tool `render()` itself `index.js:236-246` is clean — PASS for the tool surface.) |
| AC-12 | **PASS** | `STATUS_TEXT` `index.js:68-71`, projections `:144-179`, catch-all `:323-327`; `lead-integration.mjs:100-105` + `integration-materialize.test.mjs:313` assert no stderr/script/exception in output. I reproduced 0 leaks for generic paths. |
| AC-13 | **PASS** | Control flow is JS, not instruction strings (`orchestrator.js:440-582`). |
| AC-14 | **PASS** | `index.js:295-303` re-verifies gate-pass against real script verdict; `README.md:22` "a gate cannot be flipped by model text" holds for the tool path. |
| AC-15 | **FAIL (partial)** | Reducer walks sub-steps serially (`:505-525`, test `:437-467`) — that part PASSES. But no per-step gate execution (**B1**) and no real serial worker dispatch (**B2**), so "strictly serial pipeline" is only a counter, not an executed pipeline. |
| AC-16 | **FAIL** | No repair path exists in Host at all; `adjudicate()` unwired (**B2**). Engine does not perform or forbid repairs — the mandate's "bounded minimal repair" is unimplemented. |
| AC-17 | **PASS** | `skip` records `DEGRADED` + audited history (`:568-576`, test `:344`); `pause`/`fail` recorded (`:562-567`). **Caveat**: B3 means DEGRADED can also be recorded as PASS — see B3. |
| AC-18 | **PASS** | `ensureFor` preset guard `index.js:332-346`; `integration-materialize.test.mjs:239-269` sibling-project isolation. |
| AC-19 | **PASS** | `security.test.mjs:71-159` credential sweep; empty templates; I re-ran and also grepped the whole tree for the previously-redacted ID → 0 hits. |

### C. Enterprise / production
| AC | Verdict | Evidence |
|---|---|---|
| AC-20 | **PASS** | 23 security assertions, run by me; `PRD.md:173` literal replaced by `<redacted-id>` (my earlier fix). |
| AC-21 | **PASS** | `gate()` `:641-649` `-NoProfile -File -Chapter <int>`; `normalizeChapter` `:156-165`; `artifactPath` `:168-173`; `security.test.mjs:228-246`. |
| AC-22 | **PASS** | `ARCHITECTURE.md:117`; `site-fanqie`/`novel-downloader` not referenced by `STAGE_GRAPH`/`gate()`. Credential templates empty. |
| AC-23 | **PASS** | `stableStringify` + pure reducer; `unit-orchestrator.test.mjs:149-174, 287`. |
| AC-24 | **PASS** | `logEvent` `:279-293` fixed key set incl. `runId/stageId/gate/verdict/evidenceRef/attempt/durationMs/timestamp`; `summarize` `:585-605`. |
| AC-25 | **MAJOR→FAIL** | Checkpoint durable (`:228-272`), but stray root checkpoint (**B5**) ships on git install. |
| AC-26 | **FAIL** | G1 (`pwsh` missing) produces a **silent stage advance** (**B3**). G2 (`subagent` unavailable): no subagent path exists, so no degradation to test (**B2**). G3/G4 PASS via `failure-recovery.test.mjs`. |
| AC-27 | **PASS** | `integration-materialize.test.mjs:191-207` idempotent, `:239-269` isolation, `:210-238` no-overwrite. |
| AC-28 | **PASS** | Pure engine testable with `node` alone (`test/_lib.mjs` mock io); `node --check` implicitly via imports; 257/257. |
| AC-29 | **PASS** | `README.md`/`README.zh.md` capabilities only, `ARCHITECTURE.md`, `CHANGELOG.md:3-31` v2.0.0, version `package.json:3` = 2.0.0 consistent (`marketing.test.mjs:272`). |

### D. Exhaustive testing
| AC | Verdict | Evidence |
|---|---|---|
| AC-30 | **PASS** | `unit-orchestrator.test.mjs` 83 assertions incl. exhaustive transition matrix `:206`. |
| AC-31 | **PASS** | `lead-integration.mjs` (23) + `integration-materialize.test.mjs` (33) mock-ctx full path. |
| AC-32 | **PASS** | `unit-orchestrator.test.mjs:652` resume from every stage; `:666-689` corruption; `failure-recovery.test.mjs:171, 254`. **Caveat**: chaos is simulated at reducer level, not real process-kill — acceptable with mock io. |
| AC-33 | **PASS** | `security.test.mjs:228-246` traversal/-Command; `unit-orchestrator.test.mjs:535-592` gate failures. **Caveat**: "inject metadata leakage into `content.md` and watch the correct gate block it" is NOT tested end-to-end (no script execution against fixtures) — see B1. |
| AC-34 | **FAIL** | `adjudicate()` unit-tested (`:804-828`) but **no Host-level adversarial subagent test** because there is no Host subagent path (**B2**). |
| AC-35 | **PASS** | `security.test.mjs` full sweep (23 assertions). |
| AC-36 | **PASS** | `lead-integration.mjs:100-105`, `integration-materialize.test.mjs:313`, `failure-recovery.test.mjs:305`. **Caveat**: no en/zh locale-switch leak test, but `STATUS_TEXT` is a fixed 4-token dict. |
| AC-37 | **PASS** | `integration-materialize.test.mjs:191-207, 239-269`; `lead-integration.mjs:111`. |
| AC-38 | **N/A** | Real-model ≥3-chapter end-to-end **not verifiable in this harness** (no live LLM/worker dispatch wired — see B2; no `pwsh` fixture project exercised with a real model). Reason: the current session is a delegated review context with no model-in-the-loop run; the engine dispatches no workers. Defer to a real user session; keep as a release gate. |
| AC-39 | **MAJOR** | No standalone test **report file** mapping AC-30..38 → PASS/FAIL with reproduction. This review doc is the first such artifact. Add `test/RESULTS.md` (or `docs/TEST-EVIDENCE.md`) generated from `run-all.mjs`. |

### E. Marketing & publication
| AC | Verdict | Evidence |
|---|---|---|
| AC-40 | **PASS** | `README.md:3-5`, `README.zh.md:3-5`, catalog YAML:14-15, `PR_BODY.md:8`, `locale/*.json`, `index-snippet.json:20-21` — all lead with the engine/outcome value prop, not the mode entry. `marketing.test.mjs:139-146`. |
| AC-41 | **PASS** | `README.md:47-49` re-counted (21 skills / 18+ validators / 9 roles / 7 md + 1 yaml / 2 rules / 2 templates); `marketing.test.mjs:152-179` numeric-claim checks verified by me (8 suites green). |
| AC-42 | **PASS** | One catalog file, slug/url/name consistent, `category: workflow`, quoted en/zh; `icon:` → GitHub raw `assets/icon-180.png` (verified real 180×180 PNG); `screenshots.json` → real 1200×675 PNG. |
| AC-43 | **PASS** | `PR_STATE.md:13-14` explicitly refuses to hardcode stale SHA ("以 git rev-parse HEAD 为准"), v2.0.0 noted; `SUBMISSION_STEPS.md:9-16` updated for rebuild. `index-snippet.json:40` still carries a real 40-hex commit `6438cd6…` — **MAJOR note**: please confirm it matches the pushed `main` HEAD at publish time (I cannot verify the remote without network/credentials in this harness). |
| AC-44 | **N/A (documented pending)** | PR #13689 open, not merged. `PR_STATE.md:21-30` + `PR_BODY.md:3` + `SUBMISSION_STEPS.md:18` record the **only** CI blocker: repo age gate `0.0 days old (needs 1)`, dated 2026-11-10 01:10 +08 recheck, with the upstream message that it auto-clears in ~24h. `check` = success. Maintainer merge is outside our control. **This is the documented, dated, evidence-backed pending state the Lead asked me to accept** — so I do NOT count it as a blocker, but it is **not yet "successfully published"** (PUB3). Owner: upstream CI/maintainer; next action: re-check PR #13689 after the age gate reruns. |
| AC-45 | **N/A (documented pending)** | Clean-profile install from a fresh profile (`dsh plugin add` + GUI refresh + mode dropdown) is **not verifiable in this harness**: I am a delegated teammate in the same workspace, cannot create a second DSH profile or restart the Host/Web GUI, and must not start a replacement server. Local `plugin_manager install_bundle` equivalence IS covered by `lead-integration.mjs` (mock ctx, materialization + tool calls 23/23) — so the code path is verified, the clean-profile distribution path is not. Defer to user/lead on a real profile. |
| AC-46 | **PASS** | Independent-reader test: from `README.md:9-25` alone I can state *"it's a JS state machine that gates stages on PowerShell scripts and resumes from checkpoints, unlike a prompt pack where the model merely promises to follow instructions"*. Pass. |

### F. Governance
| AC | Verdict | Evidence |
|---|---|---|
| AC-47 | **PASS** | task-8 claimed (revision 2, in_progress, owner `product-manager`), final tree re-read, AC-1..46 executed. |
| AC-48 | **PASS** | This `docs/PM-REVIEW-R1.md` + the APPROVE/REJECT message with line-level findings. I remain resident and do not mark done. |

---

## 4. Non-blocking notes (MAJOR / observations, fix at convenience)

- **N1 (MAJOR)** `docs/ARCHITECTURE.md:67` and `README.md:63-64` claim missing `pwsh` "never a silent pass" — **contradicted by B3**. Fix the code (preferred) or the copy after B3.
- **N2 (MAJOR)** Marketing says "9 subagent workers are evidence-adjudicated in code" (`README.md:41-43`, `PR_BODY.md:12`, catalog:14). With B2 unwired this is currently an **honest-claims violation** (AC-41/§4.3). Fix B2, or soften the claim immediately so the public catalog doesn't overclaim.
- **N3** `PRD §1.4` truth-source whitelist (AC-4) is only prose in `assets/.dsh/AGENTS.md`; consider an engine-level artifact-write guard or explicitly document that worker skills own writes unverified.
- **N4** `market/index-snippet.json:40` commit SHA + `:36` `publishTimestamp` — confirm against the actual pushed `main` HEAD before hosting (AC-43).
- **N5** `test/security.test.mjs:33-40` `isPublished()` should exclude root `.dsh/` so B5 cannot recur silently.
- **N6** `test/marketing.test.mjs:152` numeric-claim check is good; extend it to assert the catalog `icon:` file exists and is a raster (it does today, verified by me).

---

## 5. Precisely what is NOT verifiable in this harness (requested)

| AC | Why not | What would verify it |
|---|---|---|
| **AC-38** (real-model ≥3 chapters, `validate-chapter -Chapter All` PASS, export) | No live LLM worker is dispatched by the Host (B2), no real `pwsh` fixture project was driven end-to-end, and this delegated review context has no model-in-the-loop run. | A real user session on a clean profile with `pwsh` installed, 3 chapters written via the engine, then `novel-validate all`. |
| **AC-44** (CI gates success / merged) | Upstream `awesome-dsh-plugin` PR #13689 is open; the age gate + maintainer merge are external. No network/credentials in this harness to query check-runs. | Re-check PR #13689 after the age gate auto-reruns (~24h) and after maintainer merge; update `PR_STATE.md`. |
| **AC-45** (clean-profile install + GUI) | I cannot create a fresh DSH profile, restart the Host/Web GUI, or start a replacement server from this delegated teammate session. The **equivalent code path** is verified by `lead-integration.mjs` (23/23, mock ctx). | Lead/user runs `dsh plugin --profile <fresh> add …`, refreshes the existing GUI URL, selects 小说模式, confirms `.dsh/` appears only in that project. |

These three are **documented pending**, not silent failures. I have not treated AC-44/45 as blockers per your instruction; I have treated AC-38 as deferred (but note it is also *blocked* by B2 in the current build).

---

## 6. Re-review protocol for R2

1. Fix B1–B5 (B2 and B4 are the largest; B3/B5 are small). 
2. Re-run `node test/run-all.mjs`; add the 3 missing tests I named (sub-step gate execution, Host DEGRADED admission, Host adjudication wiring, no-control-prose scan, no-root-checkpoint scan).
3. Re-check the honest-claims items N1/N2 against the new code.
4. Ping me: I will re-read the final tree, re-run AC-1..46 (focusing on the 5 blockers + N1/N2), write `docs/PM-REVIEW-R2.md`, and return **APPROVE** or **REJECT**. 
5. AC-38/44/45 remain external release gates — I will carry them forward as "documented pending" until real evidence exists, and flag if the catalog goes public while N2 still overclaims.

**Resident status**: task-8 stays `in_progress`; I am **not** marking done. Available for R2 and any further rounds.

*End of PM-REVIEW-R1.*
