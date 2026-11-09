# Test Evidence (AC-39)

Generated from `node test/run-all.mjs`, 2026-11-10 02:50 +08. Reproduce with:

```sh
cd novel-mode-plugin && node test/run-all.mjs
```

**Result: 9/9 suites PASS, 275/275 assertions, exit 0.** Each suite runs in its
own `node` process with mocked `io`/`ctx` — no DSH host, no LLM, no network, no
credentials needed.

| Suite | Assertions | Angle | AC coverage |
|---|---|---|---|
| `unit-skills.test.mjs` | 28/28 | Skill registrations: kebab-case names, no dupes, descriptions/whenToUse, `resourceBase` paths, content byte-equal to trimmed SKILL.md, engine-controlled skills not user-invocable | AC-9, AC-11, AC-28, B4 |
| `unit-orchestrator.test.mjs` | 83/83 | Exhaustive STAGES×EVENT_TYPES transition matrix, every valid/invalid transition, gate-pass/skip chain to done, 3 bootstrap branches, BATCH 15-substep FSM + chapter advance, gate-fail retry budgets, `stageGuard`/`gate` (entry guard, exit codes, `-NoProfile -File`, DEGRADED, no stderr leak), checkpoint round-trip/corruption/resume-from-every-stage/idempotency, `plan`/`summarize`/`dispatchArgs`/`validateDispatch`/`adjudicate`/`normalizeChapter`/`artifactPath`/`logEvent`, `advance()` purity, **sub-step gate execution** | AC-1..9, AC-23, AC-24, AC-30, AC-32, B1, B3 |
| `integration-materialize.test.mjs` | 33/33 | Real `.dsh/` materialization into tmpdir, path-set + byte fidelity, counts (21 SKILL.md / ≥18 .ps1 / ≥2 .py / 2 `.json.template` / 8 templates = 7 md + 1 yaml / 2 .mdc / 9 agents), forbidden artifacts + credential values absent, idempotency, never-overwrite, sibling isolation, sanitized tool result | AC-18, AC-19, AC-25, AC-27, AC-31, AC-35, AC-37 |
| `security.test.mjs` | 23/23 | Whole published tree scan, zero real credentials, no forbidden artifacts, zero network calls in Host code, no deps/scripts, no arbitrary path writes, projections present, `-Command` never used | AC-20, AC-21, AC-22, AC-35, NG-10 |
| `failure-recovery.test.mjs` | 16/16 | Missing assets, read-only project, corrupt checkpoint (backup + generic recovering status), 12× concurrent activations, 16× concurrent `tool.execute`, no-agent/junk/jumbo args, io-throws-everywhere (degrade, never throw), runner-unavailable DEGRADED, render degenerate values | AC-12, AC-26, AC-36, G1-G4, NG-3 |
| `manifest.test.mjs` | 27/27 | `dsh.bundle`/exports/files/engines, no `dsh.client`, YAML parsed with `!!js` tag registered, no persona/prefix/suffix/prompt-injection, locale en+zh validity, screenshots/LICENSE/README presence | AC-10, AC-13, AC-28, AC-29 |
| `marketing.test.mjs` | 24/24 | No stale button/command/prompt-injection claims, descriptions match code facts (7 stages/15 substeps/21 skills/9 roles/7 md + 1 yaml/2 rules), en+zh, no superlatives, version + engines consistency | AC-40, AC-41, AC-42, AC-43, AC-46 |
| `lead-integration.mjs` | 23/23 | Full real `index.js` apply + tool.execute happy path, silent preset-scoped materialization, checkpoint written, generic status only, no internals leaked on forced failure, re-entrancy idempotent | AC-12, AC-18, AC-31, AC-45 (code path) |
| `pm-blockers.test.mjs` | 18/18 | PM-REVIEW-R1 B1..B5 regressions: sub-step gates execute, DEGRADED never advances, adjudication wired & refuses evidence-free PASS, dispatch returns typed role, no control prose in registered skills, no root checkpoint | AC-3, AC-8, AC-9, AC-11, AC-15, AC-16, AC-25, AC-34, B1-B5 |

## PM blocker regressions (PM-REVIEW-R1 → R2)

| ID | Finding | Regression check | Result |
|---|---|---|---|
| B1 | BATCH sub-step gates never executed | `gateForStage('batch','C')` resolves `validate-chapter.ps1`; `gate()` spawns it with `-Chapter 7`; failing sub-step yields FAIL | PASS |
| B2 | `adjudicate()`/dispatch dead code | `dispatchFor` returns typed role; `adjudicatedGate` refuses evidence-free PASS; Host `dispatch`/`verify` actions wired; Host-level no-evidence gate flip rejected | PASS |
| B3 | DEGRADED advances as fake PASS | `gate()` returns DEGRADED with `ok=false`; `adjudicatedGate` refuses DEGRADED; Host `gate-pass` requires real PASS | PASS |
| B4 | Rejected prose FSM still shipped & user-invocable | 0 control-prose strings in any registered SKILL.md; `novel-batch`/`novel-write` `userInvocable:false` | PASS |
| B5 | Stray root runtime checkpoint ships | no root `.dsh/` checkpoint; `.gitignore` excludes `.dsh/` | PASS |

## Not verifiable in this harness (documented pending, not silent failures)

| AC | Why | Verification |
|---|---|---|
| AC-38 (real-model ≥3 chapters + `validate-chapter -Chapter All` PASS) | No live LLM worker dispatch in an automated test; engine dispatches typed roles, execution happens in a real user session | Real user session on a clean profile with `pwsh` installed, 3 chapters via the engine |
| AC-44 (market PR merged / CI gates success) | Upstream `awesome-dsh-plugin` PR #13689 merge is maintainer-controlled; age gate is time-based | Re-check PR after the age gate auto-reruns; see `market/PR_STATE.md` |
| AC-45 (clean-profile install + GUI mode dropdown) | Cannot spawn a second DSH profile or restart the Host/Web GUI from the automated harness | Equivalent code path verified by `lead-integration.mjs` (23/23) and `plugin_manager` install |

**Independent reproduction**: the resident PM re-ran `run-all.mjs` during R1 and
reproduced 8/8 suites / 257 assertions before the 5 blocker fixes; R2 re-runs
the 9-suite / 275-assertion version. See `docs/PM-REVIEW-R*.md`.
