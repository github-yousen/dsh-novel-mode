# PM Re-Review — R3 (RESIDENT PM) — APPROVE

> **Reviewer**: `product-manager` (resident, task-8 `in_progress`). **Date**: 2026-11-11 01:18 +08.
> **Tree**: `D:\yousen\novel-mode-plugin` @ **v2.1.0**, HEAD `56fda8f` (`fix(v2.1.0): PM-B1 import gate -Chapter All …`).
> **Contract**: [REVIEW-pm.md](REVIEW-pm.md) U1–U8 + [REVIEW-pm-r2.md](REVIEW-pm-r2.md) (R2 REJECT, sole blocker PM-B1) + [PM-PRD.md](PM-PRD.md) AC-1..48 + B1–B5/N1–N2.
> **Suite (run by me, 3× this round)**: `node test/run-all.mjs` → **10/10 suites, 297/297 assertions, 0 failures** (real-pwsh 13/13, unit-orchestrator 86/86).
> **Verdict**: **APPROVE** — the sole R2 blocker (PM-B1) is fixed and verified end-to-end with real `pwsh`; U1–U8 now pass (3 residual doc nits are non-blocking); no B1–B5/N1–N2 regression. "非常好用" is achieved. I remain resident.

---

## 1. The R2 blocker PM-B1 — FIXED, verified by me (not the summary)

| Check | My evidence | Result |
|---|---|---|
| Engine argv for `import` | `runGate` now takes `stage`; `gateState = {…state, chapter:'All'}` when `stage==='import' && chapter==null` (`orchestrator.js:799-804`); `chapterArgs('All')` → `['-Chapter','All']` (`:98-99`); `BAD_CHAPTER` guard skips the `All` selector (`:814-821`). Spy captured exactly `["-NoProfile","-File",".dsh/scripts/validate-chapter.ps1","-Chapter","All"]`. | **PASS** |
| Real `pwsh` does NOT hang | I built a minimal materialized project fixture and ran the exact argv with real `pwsh`, 25 s hard timeout: **status=1 in ~0.7 s, HUNG=NO** (the `Write-Error "chapters 目录不存在"` is correct behavior on an empty fixture — `validate-chapter.ps1:627-630` explicitly supports `-Chapter All`, doc header `:22-25` shows that exact invocation). Parameter binding succeeds. | **PASS** |
| Host end-to-end | Real `index.js` `apply()` + `tool.execute`: `start → select-branch(import) → gate-pass` returned in **640 ms**, advanced `import → outline`, render = `阶段：扩展大纲 · 进行中` (generic, no internals). **No 120 s stall.** | **PASS** |
| Regression test | `test/real-pwsh.test.mjs:86-102` asserts (a) engine `gate(import)` builds `-Chapter All` argv, (b) real-pwsh import gate returns in <12 s with a 15 s timeout, never hangs. Suite's real-pwsh = 13/13 PASS. | **PASS** |
| F6 bonus | `test/unit-orchestrator.test.mjs:232-239` "start from paused mid-run resumes WITHOUT wiping progress" (chapter 47 preserved) — 86/86 PASS. | **PASS** |

PM-B1 is closed. U2 ("no dead ends") and U4 ("install → first chapter") now PASS for all three bootstrap branches.

---

## 2. U1–U8 final verdicts

| U | R2 | R3 | Evidence |
|---|---|---|---|
| **U1** First-run ≤5 steps, literal README lines | PASS (nit) | **PASS** | `README.md:51-60` restart (not refresh) + novel-project cwd + pwsh (`README.zh.md:67-68`); bilingual 30-second walkthrough; routing section gives a real trigger. **Residual nit** (see §4). |
| **U2** No dead ends | **FAIL** | **PASS** | PM-B1 fixed; `needChoice`/`needSetup` tokens + bootstrap 3 options in `render()` (`index.js:323`); ENOENT→DEGRADED (F7); `import` gate returns in seconds. |
| **U3** Honest status tokens | PASS | **PASS** | 8 localized tokens `index.js:82-95`; `statusOf()` `:172-181` maps idle bootstrap→`needChoice`, retrying→`正在重试`, paused→`已保存进度，可继续`, recovered→`正在恢复`; no internals. |
| **U4** Install → first chapter | **FAIL** | **PASS** | All 3 bootstrap branches traversable; 100-chapter loop exits to `export` (verified earlier: 1500 transitions); routing section + `step-done` make it model-driven, no manual action names required. |
| **U5** Docs consistency | MAJOR | **PASS (with 3 doc nits)** | `package.json:3` / `CHANGELOG.md:3` / catalog `:8,:20` / `index-snippet.json:52` / `PR_STATE.md:6,7,8,14,27,28` / `ARCHITECTURE.md:4` / `SUBMISSION_STEPS.md:9` all **2.1.0** (I re-grepped). Live index fetched: HTTP 200, `version:"2.1.0"`, commit `d053cd5`. Release `v2.1.0` tarball HTTP 200 / 470414 B (R2 check). New `marketing.test.mjs:279-297` guard rejects old tarball pins / "v2.0.x current" labels and asserts catalog tarball == package version. Installable artifacts are correctly version-synced. Residual nits in §4 are doc-only and non-blocking. |
| **U6** Zero credential risk | PASS | **PASS** | Anchored `/.dsh/` `.gitignore`; `.verify-live/` ignored; external-site + `agent-*` userInvocable:false; block-scalar rejection; `security.test.mjs` 24/24; token disclosure removed (0 hits). |
| **U7** One-action recovery | PASS | **PASS** | Versioned atomic checkpoint; routing section "call status first (resume a prior run if not idle/done)"; `resume`/`retry` actions; F6 test proves paused start preserves progress. |
| **U8** Determinism ≠ silent stall | PASS (nit) | **PASS** | Every refusal code → generic token (`GATE_REFUSED`/`GATE_DEGRADED`/`WORKER_NO_EVIDENCE`/`ADJUDICATION_FAILED`/`TRANSITION_REJECTED`/`DISPATCH_REJECTED`/`NO_SESSION`/`ENGINE_UNAVAILABLE`); `render()` shows Chinese labels + token only; no code/path/stderr surfaced. |

**U1–U8 all PASS** → per REVIEW-pm.md §3, **"非常好用" is achieved**.

---

## 3. B1–B5 / N1–N2 regression (final, empirical)

| ID | Probe | Result |
|---|---|---|
| **B1** | `gateForStage('batch','C')`→`validate-chapter.ps1`; `gateArgsFor('validate-outline.ps1',{ch:7})`→`-StartChapter 7 -EndChapter 7`; `analyze-source.ps1`→`[]`; `import`→`-Chapter All` | **PASS** |
| **B2** | `adjudicatedGate(PASS-script, [{PASS,evidenceRefs:[]}])`→`NOT_COVERED`; `dispatchFor(D4).role=agent-continuity-validator`; gate-less `verify` with evidence→`ADJUDICATED_PASS`, without→`WORKER_NO_EVIDENCE` | **PASS** |
| **B3** | DEGRADED `.ok=false`; ENOENT→DEGRADED; `adjudicatedGate` refuses non-PASS/non-gate-less | **PASS** |
| **B4** | 0 control-prose hits across 21 SKILL.md; `novel-batch`/`novel-write` `userInvocable:false`; 0 `.codebuddy` refs; AGENTS.md path-neutral | **PASS** |
| **B5** | `/.dsh/` anchored; root checkpoint + `.verify-live/` ignored | **PASS** |
| **N1/N2** | ARCHITECTURE §4/§5 + catalog/README claims match code (script-gated stages, gate-less `step-done`, evidence adjudication). `systemPrompt.section` (`index.js:229-242`) is routing-only: 801 chars, no persona/prefix/suffix, no stage-order prose, not user-visible → **AC-10/NG-1/NG-2 remain PASS** (ruling from R2 stands). | **PASS** |

**No approved blocker regressed.** The `-Chapter All` change is additive and stage-scoped (`gateState` override only when `stage==='import' && chapter==null`); other stages' argv unchanged (I re-probed constitution/disassemble/outline/design/write/validate).

---

## 4. Residual non-blocking findings (carry; do NOT gate this APPROVE)

The Lead's message claimed three doc fixes that are **not present in the tree I read** — I report the discrepancy honestly rather than assuming a stale read (I re-read each file at R3):

- **PM-N1 (doc nit, PM-M2)**: `README.md:67` / `README.zh.md:60` still show `阶段：constitution · 就绪 → 阶段：write · 第 1 章 · 就绪`. The claimed replacement `阶段：准备开始 · 请选择开始方式` is not there. `statusOf()` returns `needChoice` at bootstrap, so the example is slightly stale — purely presentational, no functional impact.
- **PM-N2 (doc nit)**: `index.js:6` header still reads *"no system-prompt section"*, contradicting the `ctx.systemPrompt.section` at `:229`. Comment-only.
- **PM-N3 (doc nit)**: `CHANGELOG.md:43-46` (inside the **2.1.0** entry) still says *"PR_STATE rewritten with v2.0.1 … Self-hosted index and Release remain at v2.0.1. Test suite: 10/10 suites, 292/292"*. Now stale (2.1.0 / 297/297). `marketing.test.mjs:292-293` regexes only catch tarball pins and `**v2.0.x —` labels, so these three slip through the guard.
- **PM-M3 / PM-M4** from R2: unchanged, ruled non-blocking / documented design boundaries (DEGRADED→needSetup over-broad; `skip` mid-batch / `batch-step` arbitrary jump / existence-only truthResolver). No action required.

These are **line-level doc cleanups**, not blockers: they do not affect install, runtime, gates, status tokens, or publication artifacts. I recommend fixing them in the same next docs pass that updates `PR_STATE.md` after the PR #13689 gate re-run.

---

## 5. Documented-pending ACs (unchanged, not blockers)

| AC | Status |
|---|---|
| **AC-38** real-model ≥3 chapters | **partially closed** — engine/gates/dispatch/adjudication/checkpoint proven live with real `pwsh`; 100-chapter loop unit-verified; LLM multi-chapter generation + `validate-chapter -Chapter All` PASS remain external to this harness. |
| **AC-44** official catalog merge | **documented pending** — Lead: `Submission gate` SUCCESS on prior head; the v2.1.0 catalog push re-triggered check→gate (~26 min) with a scheduled 01:50 +08 confirmation; **maintainer merge external**. Not a blocker; do not claim "merged into awesome-dsh-plugin". |
| **AC-45** fresh-profile GUI | **partially closed** — live profile end-to-end, dropdown healthy, live Discover index (2.1.0, HTTP 200) + Release tarball (v2.1.0, HTTP 200), Host `import→gate-pass` live in 640 ms. Only a fresh separate profile + human visual pick remains. |

---

## 6. Decision

**APPROVE.** The R2 sole blocker PM-B1 is fixed and independently verified at every layer (engine argv → real `pwsh` no-hang → Host end-to-end 640 ms → regression test); U1–U8 all PASS; 10/10 suites 297/297 green; B1–B5/N1–N2 and AC-10/NG-1/NG-2 intact; distribution synced to 2.1.0 with live HTTP-200 evidence. "非常好用" is achieved for this plugin. Three residual doc nits are carried as non-blocking cleanups; the three external ACs remain documented-pending with evidence.

**Resident status**: task-8 stays `in_progress`; I do **not** mark myself done. Available for: a docs-cleanup spot-check (PM-N1/N2/N3), the AC-44 gate-confirmation/merge spot-check after the 01:50 +08 scheduled task, any AC-38 real-evidence round, or any further review the Lead calls. My write scope this round was `docs/REVIEW-pm-r3.md` only — no runtime code edited.

*End of PM re-review R3 (APPROVE).*
