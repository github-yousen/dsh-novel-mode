# PM Governance Perspective — "非常好用" Acceptance Bar

> **Author**: `product-manager` (RESIDENT PM, task-8 `in_progress` — not complete).
> **Date**: 2026-11-10 22:55 +08. **Tree reviewed**: `D:\yousen\novel-mode-plugin` @ **v2.0.1** (after the mode-dropdown visibility fix).
> **Scope of this file**: governance only. I write/edit **only** `docs/REVIEW-pm.md` in this round. No runtime code changes.
> **Companion docs**: [PM-PRD.md](PM-PRD.md) (AC-1..48), [PM-REVIEW-R1.md](PM-REVIEW-R1.md) … [PM-REVIEW-R4.md](PM-REVIEW-R4.md), [LIVE-VERIFICATION.md](LIVE-VERIFICATION.md).
> **Purpose**: for the 5 parallel angle reviews (tasks 9–13), define the measurable bar for "非常好用" (very usable), restate what remains *documented pending*, and set the prioritized list of improvements the PM will accept at the post-improvement re-review.

---

## 1. What I re-read in the CURRENT v2.0.1 tree

| Artifact | Finding |
|---|---|
| `package.json:3` | `version: "2.0.1"`; `dsh.bundle.patch`, `files`, `exports`, `engines.dsh` unchanged from the approved shape. |
| `CHANGELOG.md:3-17` | **Real defect fixed**: the `小说模式` preset was filtered OUT of the mode dropdown because `cordis.patch.yml` declared `@deepseek-ai/dsh-tool-subagent-control/list-agents`, a deep subpath unresolvable in some builds → preset `broken` → `presetOptions()` hid it. Verified against the live Host roster with a diagnostic plugin; removed the 2 control-plane rows; added `manifest.test.mjs:177-193` regression rejecting deep-subpath package names. After Host restart: 5 healthy presets, `novel` visible. |
| `cordis.patch.yml:65-89` | Now only `tool-subagent` + `tool-subagent-fork` + `workflow-ptc` + `tool-workflow` in the delegation group; **no persona, no systemPrompt prose** (AC-10 intact). |
| `README.md:62-74` / `README.zh.md:55-65` | New bilingual **"30-second try it"** first-run walkthrough added since R4 (one user sentence → engine status line). |
| `index.js:70-72` | 4 generic localized status tokens unchanged (`就绪 / 已保存进度，可继续 / 正在恢复 / 暂不可用`; en equivalents). |
| `test/run-all.mjs` | I re-ran it: **9/9 suites, 279/279 assertions, 0 failures** (manifest 28, marketing 26, security 24 — +1/+2/+1 vs R4). |
| `market/PR_STATE.md:6-8,14,27,36` | ⚠️ **Still says v2.0.0** in 6 places while `package.json`, catalog `tarball:` (`:20`), and `index-snippet.json:52` are **v2.0.1**. Concrete docs-consistency gap (see §4, U5). I do NOT fix it — only `REVIEW-pm.md` is my write scope this round. |
| Angle reviews | `docs/REVIEW-*.md` not yet written (tasks 9–13 `in_progress`). This note defines the bar they are measured against; it does not duplicate their findings. |

**Regression status**: the v2.0.1 change is a **preset-manifest fix only** — no change to `lib/orchestrator.js`, the gate/adjudication/checkpoint core, or the worker skills. B1–B5 and N1/N2 from R1–R4 remain PASS. `node test/run-all.mjs` green confirms no regression.

---

## 2. Acceptance criteria still only "documented pending"

Unchanged from R4. I restate precisely, including whether the v2.0.1 dropdown fix changes any verdict:

| AC | Status (post-v2.0.1) | What is closed | What genuinely remains external | Does the dropdown fix change it? |
|---|---|---|---|---|
| **AC-38** — real-model ≥3 chapters + `validate-chapter -Chapter All` PASS + export | **partially closed with live runtime evidence** | Engine, real PowerShell script gates (failing `validate-chapter.ps1` refused to advance — `LIVE-VERIFICATION.md:22`), typed dispatch, code adjudication (evidence-free PASS refused, `:25`), durable checkpoint (`:31-42`), all proven in the real Harness with real `pwsh` | Multi-chapter novel generation with a **live LLM worker** and a full-book validate run in a real user session | **No.** The fix affects preset visibility only, not worker execution. |
| **AC-45** — clean-profile install + GUI mode dropdown | **partially closed with live runtime evidence** | Final installed plugin exercised end-to-end in the live profile (`LIVE-VERIFICATION.md:12-29`); live Discover index + Release tarball HTTP 200 (R3); **and now the dropdown entry is verifiably visible** (`CHANGELOG.md:16-17`, live roster: 5 healthy presets, `novel` not `broken`) | A *fresh separate DSH profile* + a **human visually picking 小说模式** in the dropdown and confirming `.dsh/` materializes in that project only | **Yes — partially.** The dropdown fix closes the specific dead end "the mode cannot be selected at all" (previously a real usability blocker). AC-45 moves from "GUI sub-step unverifiable" to "GUI entry proven healthy in the live profile; only a fresh-profile + human-pick reproduction remains". **It does NOT fully close AC-45** and does not change my APPROVE-CONFIRMED verdict — it strengthens it. |
| **AC-44** — official awesome-dsh-plugin catalog merge | **documented pending** | PR #13689 submitted, `check`=success, catalog YAML synced, 1 file only; Release + self-hosted format-1 index are live, self-controlled distribution channels proven HTTP 200 | `Submission gate` age gate (repo created 2026-11-09 06:44 UTC; ~13.4h at last check, needs 24h, auto-clears) + **upstream maintainer merge** — outside team control | **No.** Unrelated to the plugin manifest. Do not claim "merged into awesome-dsh-plugin" until it is. |

**Governance ruling**: none of these three are blockers to "published + usable". They are carried forward with dates, evidence, and owners. **The v2.0.1 dropdown fix is a genuine usability improvement (it removed a real dead end), not a verdict change.** My R4 **APPROVE-CONFIRMED stands**.

---

## 3. What "非常好用" (very usable) MEANS — measurable acceptance criteria for THIS plugin

The user's goal is no longer just "enterprise-grade / strong orchestration" (that bar is met and approved). "非常好用" = a **first-time user can get value without guessing, without dead ends, and without needing to read the architecture doc**. I define it as 8 numbered, testable criteria (U1–U8). Each has a concrete measurement the angle reviews / post-improvement re-review can execute.

### U1 — First-run walkthrough clarity (install → first status in ≤ N steps)
- **Measurable**: from a fresh install, a user following ONLY `README.md` / `README.zh.md` reaches a visible `阶段：… · 就绪` status in **≤ 5 explicit actions** (install command → refresh page → pick 小说模式 in dropdown → type one natural-language intent → see status). Each action is named in the README, no hidden prerequisite.
- **Test**: a reviewer simulates the 5 steps from the docs; every step must map to a literal line in the README. The "30-second try it" block (`README.md:62-68`, `README.zh.md:55-61`) must show a **real** one-line user input and the **real** resulting status text.
- **Fail condition**: any step requires knowledge from `ARCHITECTURE.md`, `PM-PRD.md`, or the tool schema; or the example status text does not match `index.js:70-72` tokens.

### U2 — No dead ends (every state has a legible next action)
- **Measurable**: for each of these real situations, the user sees a generic status AND the docs/UI tell them what to do next: (a) no project `novel/` dir yet; (b) `pwsh` missing (DEGRADED → paused, `README.md:76-78`); (c) bootstrap branch selection; (d) gate refused (`已保存进度，可继续`); (e) evidence-free worker verdict refused; (f) corrupt/absent checkpoint (recovering); (g) non-novel cwd.
- **Test**: enumerate the engine's reachable `status` values (`idle/running/blocked/retrying/paused/failed/done/aborted`) × the 4 status tokens; each must have a human-meaningful sentence in README (or a documented "resume" action). No state may leave the user with only `就绪` while nothing progresses.
- **Fail condition**: a reachable state where the user cannot tell whether to wait, retry, resume, or install something.

### U3 — Honest, understandable status tokens (no internals, no false comfort)
- **Measurable**: the 4 tokens (`就绪 / 已保存进度，可继续 / 正在恢复，请稍候 / 工作流暂不可用`) are (i) localized en+zh, (ii) free of `.ps1`/stderr/exit-code/script-name/exception text (AC-12, NG-3), (iii) **semantically accurate**: `就绪` only when progress is possible, `已保存进度，可继续` must be accompanied by a resumable checkpoint, `正在恢复` must not be shown forever.
- **Test**: grep every `return {… status: …}` in `index.js` and map to `statusOf()` logic; assert no token is returned on a `done`/`failed` state contradicting its wording. `publicState` must never surface gate internals (R2 verified).
- **Fail condition**: a token that says "continue" when no resume is possible, or any internal string in user-visible text.

### U4 — Install → first chapter in a bounded, documented step count
- **Measurable**: from a clean project, the path to a first *validated* chapter is documented as an ordered sequence (constitution → outline → design → write → validate) and does not require the user to manually invoke `novel_orchestrate` actions or know stage IDs — the model drives the tool, the user types intent. If the engine requires explicit `start`/`select-branch`, the README must say who does it (model) and what the user types.
- **Test**: a scripted "user intent" → tool-call trace must be derivable from the README's 30-second example; no undocumented manual tool call required.
- **Fail condition**: the documented happy path silently depends on the user knowing `select-branch`, `gate-pass`, `batch-step`, or `verify` action names.

### U5 — Docs consistency (one version, one truth, no stale claims)
- **Measurable**: a single `VERSION` string must match across `package.json`, `CHANGELOG.md` top entry, catalog `tarball:` tag, `market/index-snippet.json`, `PR_STATE.md`, and `locale/*.json` where present. All numeric claims (21 skills / 18+ validators / 9 roles / 7+1 templates / 15 sub-steps / 13 hard checks) must be re-counted against the shipped tree. All dates in `PR_STATE.md` must be current. No stale SHA/tarball/commit references (carry O3/O6/O8 from R3/R4).
- **Test**: `grep` version numbers across surfaces → exactly one value (currently **v2.0.1**); a `docs-consistency` test asserts equality. **Concrete current gap I found**: `market/PR_STATE.md:6,7,8,14,27,36` still say **v2.0.0** while `package.json:3`, catalog `:20`, `index-snippet.json:52` say **2.0.1** — this FAILS U5 today and is a legitimate angle-E (product) finding.
- **Fail condition**: any two surfaces disagree on version, or any marketing number is not backed by the tree.

### U6 — Zero credential / privacy risk, by construction
- **Measurable**: no real credential or business-ID value in the shipped tree; only empty `*.json.template` files; `site-fanqie` / `novel-downloader` external-site skills are **off the core gate path** and clearly labeled optional (AC-19/20/22). `git check-ignore` covers `.dsh/`, `.verify-live/`, and every real credential filename.
- **Test**: `node test/security.test.mjs` (24/24) + a fresh whole-tree sweep; confirm `materialize()` never overwrites user files or writes outside project root.
- **Fail condition**: any non-empty credential field, any un-ignored runtime state artifact, or an external-site skill reachable from a core gate.

### U7 — Recoverability is user-visible, not just internal
- **Measurable**: after an interruption (session end / process kill / corrupt checkpoint), a user can resume with **one** documented action (`--resume` equivalent / `resume` action / simply restating intent) and the README says so plainly. The checkpoint is versioned, atomic, corruption-tolerant (AC-5/25, R4 live proof).
- **Test**: kill mid-run, restart, assert the status token + docs lead to resume at the exact chapter with no duplicate/missing chapter; `LIVE-VERIFICATION.md:31-42` is the evidence template.
- **Fail condition**: resume requires editing `state.yaml`, deleting files, or knowing the checkpoint path.

### U8 — Determinism must not become user-visible friction
- **Measurable**: code-enforced gates (AC-3/14) must not produce a *silent* stall. Every refusal (`GATE_REFUSED`, `GATE_DEGRADED`, `WORKER_NO_EVIDENCE`, `ADJUDICATION_FAILED`, `TRANSITION_REJECTED`) must map to one of the 4 generic tokens + a documented user action (repair / wait / resume / install prerequisite). No raw codes, script names, or verdict internals surfaced (NG-3).
- **Test**: map every `code:` in `index.js` to a status token + a README sentence; assert the render text contains no code.
- **Fail condition**: a refusal that shows only `就绪`, or that leaks `NOT_COVERED` / `.ps1` to the user.

> **PM ruling**: "非常好用" is achieved when **U1–U8 all PASS**. Orchestration strength (AC-1..48) is a *prerequisite*, not the goal, of this round. A change that improves U1–U8 **without** weakening any AC-1..48 BLOCKER is acceptable; a change that trades a blocker for convenience is not.

---

## 4. Prioritized improvements the PM will ACCEPT from the angle reviews

Criteria only — no implementation. Ordered by user impact × risk. I will verify these at the post-improvement re-review.

| Priority | Accept from | Criterion it serves | What I will accept (measurable) | What I will REJECT |
|---|---|---|---|---|
| **P0** | Any angle | U2, U5, AC-45 | **A real dead-end fix** with file:line + reproduction (like the v2.0.1 dropdown fix): e.g. a reachable state with no legible next action, or a stale version/date that misleads a user. **Concrete known candidate: `market/PR_STATE.md` v2.0.0 → v2.0.1 sync (6 lines) + date refresh.** | Cosmetic rewording, or a "fix" that hides a state instead of explaining it. |
| **P0** | Usability (task-10) / Product (task-13) | U1, U4 | A **first-run walkthrough** that names all ≤5 actions literally, uses the real status tokens from `index.js:70-72`, and states who (model vs user) calls `start`/`select-branch`. Bilingual en+zh parity. | Any doc that tells the user to type `novel_orchestrate(gate-pass)` manually, or dumps the tool schema / stage IDs at a first-timer. |
| **P1** | QA (task-12) | U7, U4 | **Real-workflow test gaps** that a novel project actually hits: 100-chapter batch loop, chapter 1, all 3 bootstrap branches, resume mid-batch, missing `pwsh`, script param-name mismatches (`-Chapter` vs `-StartChapter/-EndChapter`), dangling skill paths after materialization. | Tests that only re-assert the pure reducer without touching scripts/materialization. |
| **P1** | Security (task-11) | U6 | Confirmed **credential sweep + materialize() boundary** results, off-by-default recommendation for `site-fanqie`/`novel-downloader` if they are reachable from a core path, and any real path-traversal/overwrite finding. | Speculative "supply chain" concerns without a concrete reachable path or file:line. |
| **P1** | Architecture (task-9) | U8, AC-1..9 | **Reproducible edge-case bugs** in `advance()`/`validateTransition()`/`adjudicatedGate()`/`gateForStage()`/`dispatchFor()` that a real project hits (multi-chapter loop, `totalChapters`, resume after crash), with a minimal fix that does **not** move control flow into prose. | Style nits, or any change that reintroduces model-goodwill dependence (R1 B4 regression). |
| **P2** | Any angle | U3, U5 | Refining a status token's wording for accuracy (e.g. distinguishing "paused, resumable" from "unavailable"), and a **single `docs-consistency` test** asserting one version string across all surfaces. | Adding a 5th+ status token that leaks internals, or a token that says "continue" when resume is impossible. |
| **P2** | Product (task-13) | U5 | Aligning `TEST-EVIDENCE.md:35-41` with `LIVE-VERIFICATION.md:55-61` ("partially closed" wording — carry O8), and resolving O3/O6 (commit SHA / local-snippet vs live-index commit) with a clarifying note. | Rewriting history to claim AC-44 is merged, or any superlative in marketing copy. |

**Cross-cutting acceptance rule for the re-review**: every accepted improvement must come with (a) file:line evidence, (b) a test or reproducible check, (c) `node test/run-all.mjs` still ≥ 9/9 green with no AC-1..48 BLOCKER regression, and (d) no new user-visible prompt text, error leakage, or credential. I will re-run B1–B5 + N1/N2 probes and spot-check U1–U8 at that round.

---

## 5. Verdict / governance note to Lead

- **R4 APPROVE-CONFIRMED stands** for v2.0.1; the dropdown fix is a genuine usability gain that **partially closes AC-45's GUI sub-step** and changes no other verdict.
- **AC-38 / AC-44 / AC-45** remain *documented pending* as specified in §2 — none silently dropped, none blockers.
- **"非常好用" is NOT yet declared achieved**: it requires U1–U8 (§3). Today U5 **fails** on the v2.0.0/v2.0.1 `PR_STATE.md` mismatch I found; U1/U2/U4 are improved by the new 30-second walkthrough but need the angle reviews to confirm no dead ends.
- **task-8 stays `in_progress`**. I remain RESIDENT for the post-improvement re-review: after tasks 9–13 land and Lead says "improvements ready", I will re-read the final tree, execute U1–U8 + B1–B5/N1–N2 regression, write `docs/REVIEW-pm-r2.md` (or a PM addendum), and return APPROVE / REJECT with line-level findings. I will not mark myself done.

*End of PM governance note.*
