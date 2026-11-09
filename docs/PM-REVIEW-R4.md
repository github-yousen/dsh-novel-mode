# PM Round-2 Spot-Check — R4 (RESIDENT PM)

> **Reviewer**: `product-manager` (resident). **Task**: task-8 (still `in_progress`). **Date**: 2026-11-10 04:09 +08.
> **Scope**: short R4 — confirm the live-runtime defect fix caused no B1–B5 / N1–N2 regression, re-read `docs/LIVE-VERIFICATION.md`, and update AC-38/AC-45 wording to **"partially closed with live runtime evidence"**.
> **Prior**: [PM-REVIEW-R3.md](PM-REVIEW-R3.md) = APPROVE-CONFIRMED.
> **Verdict**: **APPROVE-CONFIRMED**. 0 blockers, 0 regressions, 1 real defect fixed with a regression test.

---

## 1. What changed since R3 (re-read myself)

| Item | Evidence | Result |
|---|---|---|
| Live runtime verification | `docs/LIVE-VERIFICATION.md` (64 lines) — real Agent + real cwd + real `pwsh` + real durable checkpoint | **PASS** — honest write-up, correctly says "partially closed", names the two remaining external sub-steps |
| Defect: structured log stored a `.ps1` path in `gate` field | `lib/orchestrator.js:472-481` — `push()` now computes `gateCode = state.batchStep ? 'batch:<step>' : state.stage` (classified code), never `node.gate` | **PASS** — my probe: `serializeState(advance(gate-fail))` contains **no `.ps1`**; `log.gate` = `design` (was a script path). NG-3 defense in depth, no behavior change to transitions. |
| Regression test | `test/security.test.mjs:287-296` asserts `serializeState()` contains neither `.ps1` nor `SECRET` | **PASS** |
| Scratch dir cleanup | `.gitignore:13` `.verify-live/`; dir absent on disk | **PASS** — cannot ship |
| Rebuilt Release tarball | Lead: 464386 B (was 464297 B at R3, +89 B consistent with the small source edit) | **NOTE** — I could not re-confirm HTTP 200 this round: two `Invoke-WebRequest`/`HttpWebRequest` attempts hit a transient `github.com:443` connection timeout (IPv6 `::ffff:20.205.243.166`). At R3 I independently verified HTTP 200 / 464297 B / octet-stream. I am **not** asserting a fresh 200 I did not obtain; this is a transient network check failure, not a product defect. Re-verify the rebuilt asset once before any final "published" claim if desired. |
| Official PR #13689 | unchanged: open, `check`=success, `Submission gate` age-gate only (repo 13.4h / 24h) | **documented pending**, external |

## 2. Regression check — B1..B5 + N1/N2 (empirical, by me)

`node test/run-all.mjs` re-run by me → **9/9 suites, 278/278 assertions, 0 failures** (+3 vs R3, from the new security regression).

| ID | Probe | Result |
|---|---|---|
| **B1** | `gateForStage('batch','C')` → `validate-chapter.ps1`; `gate('batch',io,{C,ch7}).status=PASS` (real spawn) | **PASS** |
| **B2** | `adjudicatedGate(PASS, [{PASS,evidenceRefs:[]}]) → NOT_COVERED`; `dispatchFor(D4).role=agent-continuity-validator` | **PASS** |
| **B3** | DEGRADED `gate().ok = false` | **PASS** |
| **B4** | grep control prose across all 21 SKILL.md → **0 hits**; `ENGINE_CONTROLLED_SKILLS` (index.js:43) + `userInvocable:false` (:198) intact | **PASS** |
| **B5** | `git check-ignore -v .dsh/state/novel-mode.checkpoint.json` → `.gitignore:7:.dsh/`; `.verify-live/` → `.gitignore:13` | **PASS** |
| **N1/N2** | The `advance()` change touched only the **log's gate label**, not `STAGE_GRAPH`, `gateForStage`, `dispatchFor`, `adjudicatedGate`, Host `isRealPass`, or any README/ARCHITECTURE claim. LIVE-VERIFICATION:10-13 independently confirms the real `validate-chapter.ps1` gate refusal + evidence-free `verify` refusal — N1 ("never a silent pass") and N2 ("workers evidence-adjudicated in code") remain TRUE in the live runtime. | **PASS** |

**No blocker regressed.** The fix is a pure observability hardening; the deterministic control path is untouched.

## 3. AC-38 / AC-45 wording update (as requested)

- **AC-38 (real-model ≥3 chapters)**: **partially closed with live runtime evidence**. Closed: the engine, real PowerShell script gates (a failing `validate-chapter.ps1` genuinely REFUSED to advance — `LIVE-VERIFICATION.md:22`), typed dispatch, code adjudication (evidence-free PASS REFUSED, `:25`), and the versioned durable checkpoint (`:31-42`, `version=2 / stage=batch / batchStep=D4 / chapter=15 / status=retrying / log=11 / history=11`) all proven in the **real Harness** with real `pwsh`. Remaining external: multi-chapter novel generation with a live LLM worker + `validate-chapter -Chapter All` PASS.
- **AC-45 (clean-profile install + GUI)**: **partially closed with live runtime evidence**. Closed: the FINAL installed plugin row (`active`) exercised end-to-end in the live profile with real tool calls, real cwd, sanitized generic user-visible tokens only (`:16-29`); R3 already verified the live Discover index + Release tarball (HTTP 200). Remaining external: a *fresh separate* profile + a visual mode-dropdown pick.
- **AC-44 (official catalog merge)**: **unchanged, documented pending** — PR #13689 open, `check`=success, `Submission gate` age-gate only (13.4h / 24h, auto-clears), maintainer merge external. Do not claim "merged into awesome-dsh-plugin" until it is.

These are now recorded in `LIVE-VERIFICATION.md:55-61` and here; consistent with `TEST-EVIDENCE.md`'s documented-pending table (which should be updated to "partially closed" at the next docs pass — minor, non-blocking).

## 4. Non-blocking observations

- **O8 (docs sync)**: `docs/TEST-EVIDENCE.md:35-41` still labels AC-38/AC-45 fully "Not verifiable in this harness"; `LIVE-VERIFICATION.md` now says "partially closed". Worth one line of alignment so a reader doesn't see a contradiction. No functional impact.
- **O9 (R6/R3 carry)**: O6 (local `index-snippet.json:57` commit `0f3f4096…` vs live index `2f38b94…`), O7 (no `tarball:`/`icon:` assertion in `marketing.test.mjs`), R2-O3 (commit SHA vs `main` HEAD) — all still non-blocking, unchanged.
- **O10 (transient)**: this round's tarball HTTP re-check timed out (network, not product). R3 verification stands; optionally re-confirm the 464386 B rebuilt asset.

## 5. Decision

**APPROVE-CONFIRMED.** The live-runtime round produced genuine additional evidence (real `pwsh` gate refusal, evidence-free `verify` refusal, durable checkpoint) and a real defense-in-depth fix (no `.ps1` paths in the persisted log) with a regression test; 9/9 suites 278/278 green; B1–B5 and N1/N2 intact; AC-38/AC-45 upgraded to **partially closed with live runtime evidence**; AC-44 carried honestly. The product remains publishable and safe to report as complete, with the accurate nuance: **published + installable (Release + live Discover index), live-runtime-verified; official catalog PR still awaiting the age gate + maintainer merge.**

**Resident status**: task-8 stays `in_progress`; I do **not** mark myself done. Available for R5 if AC-44 clears, the remaining AC-38/AC-45 sub-steps get real evidence, or any further round is called.

*End of PM-REVIEW-R4.*
