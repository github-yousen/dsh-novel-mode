# PM Post-Improvement Re-Review — R2 (RESIDENT PM)

> **Reviewer**: `product-manager` (resident, task-8 `in_progress`). **Date**: 2026-11-11 01:08 +08.
> **Tree**: `D:\yousen\novel-mode-plugin` @ **v2.1.0** (HEAD `edc2f15`), after the multi-angle improvement round.
> **Contract**: [REVIEW-pm.md](REVIEW-pm.md) U1–U8 ("非常好用") + [PM-PRD.md](PM-PRD.md) AC-1..48 + B1–B5/N1–N2 regression from R1–R4.
> **Suite (run by me, twice, final)**: `node test/run-all.mjs` → **10/10 suites, 292/292 assertions, 0 failures** (real-pwsh 10/10 genuinely executes real PowerShell).
> **Verdict**: **REJECT for the "非常好用" goal — 1 BLOCKER (U2/U4: `import` branch gate hangs)** + 3 non-blocking findings. The earlier functional **APPROVE-CONFIRMED (R4) still stands for the engine core**; this REJECT is scoped to the new usability bar, not a regression of the approved orchestration. I remain resident for R3.

---

## 0. Executive summary

The improvement round is **substantially real and high quality**: F1/F2/F3 (gate argv contracts, caller-chapter propagation, gate-less `step-done` sub-steps) are genuinely fixed and I verified them end-to-end — a full **100-chapter × 15-step loop now exits cleanly to `export`**; gate-less `verify` adjudicates on worker evidence without a fabricated script PASS; a real-`pwsh` test suite now guards the param contracts; usability gaps G1/G2/G3b/G4/G6/G7 are addressed; security F-1/F-5 fixed; distribution artifacts are live and version-synced.

**But one genuinely reachable dead end remains**, and my governance rule (REVIEW-pm.md §3 U2 + §4 cross-cutting: "no dead ends, no BLOCKER regression") makes it a gate:

> **BLOCKER PM-B1**: the **`import` bootstrap branch** spawns `validate-chapter.ps1` with **no `-Chapter`**, and that script declares `[Parameter(Mandatory=$true)] $Chapter`. Real `pwsh` **hangs on the mandatory-parameter prompt** (I reproduced: HUNG after 15 s; the engine's own `spawnSync` timeout is 120 s). The `needsChapter` guard at `lib/orchestrator.js:796-800` does not fire because `gateArgsFor()` returns `[]` when `chapter === null`, so `needsChapter` is false. A first-time user who picks 「导入已有书稿」 gets a 120-second stall and then a refused gate — with no actionable status. This is QA review's F4, explicitly **not** in the Lead's fixed list. U2 and U4 FAIL.

---

## 1. U1–U8 verification (with file:line evidence)

| U | Verdict | Evidence |
|---|---|---|
| **U1** First-run ≤5 steps, every step a literal README line | **PASS (with 1 nit)** | `README.md:51-60` (install → **restart** → pick mode → describe intent), `README.zh.md:45-53`; bilingual "30-second try it" `README.md:62-68` / `README.zh.md:55-61`; prerequisites `README.zh.md:67-68` (novel-project cwd + pwsh). G2 (refresh→restart) fixed. **Nit**: the example status `阶段：constitution · 就绪 → 阶段：write · 第 1 章 · 就绪` (`README.md:67`) shows `就绪` at bootstrap, but `statusOf()` (`index.js:175`) now returns `needChoice` (`请选择开始方式`) at bootstrap — example is slightly stale, contradictory for a careful reader. Minor, not a blocker. |
| **U2** No dead ends | **FAIL (BLOCKER)** | See **PM-B1** above. Also note the `systemPrompt.section` (`index.js:229-242`) now gives the model a legitimate trigger (closes usability G1 — "type a sentence → engine runs"), and `needSetup`/`needChoice` tokens + bootstrap branch options in `render()` (`index.js:323`) address most dead ends. But the `import` branch gate hang is a reachable, reproducible dead end → U2 cannot PASS. |
| **U3** Honest status tokens | **PASS** | 8 localized tokens `index.js:82-95`; `statusOf()` `:172-181` maps idle/running bootstrap → `needChoice` (no false "Ready"), `retrying` → `正在重试`, `paused/failed/blocked` → `已保存进度，可继续`, `recovered` → `正在恢复`; `GATE_DEGRADED` → `needSetup` (`:392`). No internals in any token. **Caveat**: `已保存进度，可继续` still covers both transient retry and terminal block identically (usability G5 partially open) — acceptable, not a blocker, since a resumable checkpoint does exist. |
| **U4** Install → first chapter, no manual tool-call knowledge | **FAIL (BLOCKER, import path)** | For constitution/disassemble branches the new routing section + `step-done` make the path model-driven (PASS). For the **`import` branch the gate hangs** (PM-B1) → first chapter unreachable. `README.md:64-68` shows the intended one-line flow, but the advertised third bootstrap branch is broken. |
| **U5** Docs consistency (one version, one truth) | **MAJOR (non-blocking)** | Tree is **2.1.0**: `package.json:3`, `CHANGELOG.md:3`, catalog `:8/:20` (I verified `tarball: v2.1.0` → **HTTP 200, 470414 B**), `market/index-snippet.json:52`, and the **live hosted index** (I fetched it: HTTP 200, `version: "2.1.0"`, commit `d053cd5998b…`, fresh `publishTimestamp 1794330241`) — so the **installable distribution is correctly synced**. **But** `market/PR_STATE.md:6,7,8,14,27,28` still say **v2.0.1** (and `docs/ARCHITECTURE.md:4` says v2.0.1; `SUBMISSION_STEPS.md:9` says v2.0.0). `CHANGELOG.md:43-46` explicitly documents "PR_STATE rewritten with v2.0.1 … Self-hosted index and Release remain at v2.0.1" — a stale snapshot of a decision that has since been overtaken by 2.1.0 artifacts. Not a ship blocker (installers get 2.1.0), but it fails my U5 "one VERSION string across surfaces" criterion and is the exact class of gap REVIEW-pm.md §4 P0 targeted. |
| **U6** Zero credential risk | **PASS** | `.gitignore:7` anchored to `/.dsh/` (shipped `assets/.dsh/` no longer ignored — security F-1 fixed); `.verify-live/` ignored; `site-fanqie`/`novel-downloader` + all `agent-*` default `userInvocable:false` (verified at `index.js:258` via `ENGINE_CONTROLLED_SKILLS` + extended set); `descriptionFromFrontmatter` rejects `|`/`>` block scalars (`:119-122`); `security.test.mjs` 24/24. `SUBMISSION_STEPS.md` token disclosure removed (F-5 fixed — grep returned 0 hits). |
| **U7** One-action recovery | **PASS** | Durable versioned checkpoint (`orchestrator.js:228-272`), `resume` action, `status` with "resume a prior run if not idle/done" now in the routing section (`index.js:235`), `LIVE-VERIFICATION.md:31-42` evidence. (Usability G8 "user isn't told to call resume" is now mitigated by the routing section telling the model to call `status` first.) |
| **U8** Determinism ≠ silent stall | **PASS (with 1 nit)** | Every refusal code maps to a generic token: `GATE_REFUSED`/`GATE_DEGRADED`→paused/needSetup (`:392`), `WORKER_NO_EVIDENCE`/`ADJUDICATION_FAILED`→paused (`:427`), `DISPATCH_REJECTED`/`TRANSITION_REJECTED`→paused (`:298/:364/:447/:456`), `NO_SESSION`/`ENGINE_UNAVAILABLE`→unavailable (`:336/:470`). `render()` shows Chinese stage/step labels + token only (`index.js:312-325`), never a code. **Nit**: `GATE_DEGRADED` → `needSetup` ("需要准备运行环境，请查看安装说明") is also returned for a `BAD_CHAPTER` / runner-throw DEGRADED that is not an environment problem — mildly misleading but non-leaking. Not a blocker. |

**U1–U8 result: 5 PASS, 1 FAIL (U2/U4 share the blocker), 1 MAJOR, 2 nits.** Per REVIEW-pm.md §3, "非常好用" requires U1–U8 all PASS → **not achieved**.

---

## 2. B1–B5 / N1–N2 regression check (empirical, by me)

| ID | Probe | Result |
|---|---|---|
| **B1** | `gateForStage('batch','C')` → `validate-chapter.ps1`; `gate()` spawns it; `gateArgsFor('validate-outline.ps1',{ch:7})` → `["-StartChapter","7","-EndChapter","7"]`, `analyze-source.ps1` → `[]` (F1 fix) | **PASS** |
| **B2** | `adjudicatedGate(PASS-script, [{PASS,evidenceRefs:[]}])` → `NOT_COVERED`; `dispatchFor(D4).role = agent-continuity-validator`; Host `verify` at gate-less O1 with PASS+evidence → `ADJUDICATED_PASS`, step O1→O2; evidence-free → `WORKER_NO_EVIDENCE` refused | **PASS** |
| **B3** | DEGRADED `.ok=false`; ENOENT(missing pwsh) now → `DEGRADED` (`orchestrator.js:811-814`, F7/G7 fix — I probed it); `adjudicatedGate` refuses any non-PASS/non-gate-less verdict | **PASS** |
| **B4** | control-prose grep over all 21 SKILL.md → **0 hits**; `novel-batch`/`novel-write` `userInvocable:false`; `AGENTS.md` rewritten path-neutral (no `archive/*`/`new/` staleness); 0 `.codebuddy` refs in shipped assets | **PASS** |
| **B5** | `.gitignore:7` `/.dsh/` anchored; root runtime checkpoint ignored; `.verify-live/` ignored | **PASS** |
| **N1/N2** | `ARCHITECTURE.md:60-95` + catalog/README claims now match code (script-gated stages, `step-done` for gate-less steps, evidence adjudication). No overclaim introduced. 100-chapter loop verified live through the real tool | **PASS** |

**No approved blocker regressed.** The `step-done` event / `adjudicatedGate` gate-less special case / `GATE_SPECS` are additive and do not move control flow into prose.

---

## 3. AC-10 / NG-1 / NG-2 scrutiny of the new `systemPrompt.section` (my top concern)

`index.js:229-242` registers ONE `novel:mode-route` section (801 chars). I extracted its exact text:
- It is **routing-only**: "when 小说模式 is selected and the user asks to write… use the `novel_orchestrate` tool… call status first… follow the engine's `next` action… never decide stage order or quality yourself — only real script verdicts advance gates."
- It contains **no** `persona`/`prefix`/`suffix`, **no** stage-order prose (`constitution→outline→…` sequence absent — I checked with a regex), **no** workflow instructions shown to the **user** (it is model-facing system-prompt text, not chat output), and **no** quality rules.
- Stage order, gates, retries, checkpoints remain code-owned in `lib/orchestrator.js` (verified: the reducer's `EVENT_TYPES` is still a closed set; no prose can flip a gate).

**Ruling**: this is **NOT** the rejected "persona prompt group" (NG-2) and does **not** surface prompt text to the user (NG-1/AC-10). It is the minimum trigger that closes usability G1 ("type a sentence → engine actually runs"). **AC-10 / NG-1 / NG-2 remain PASS**, with one governance caveat: the header comment at `index.js:6` still says *"no system-prompt section"* — stale and self-contradictory; fix the comment (doc-only, non-blocking). I accept this design.

---

## 4. The BLOCKER in detail

### PM-B1 — `import` bootstrap branch: mandatory `-Chapter` omitted → real `pwsh` hangs (U2, U4, QA F4)

**Reproduction (all steps executed by me this round):**
1. `engine.advance(state, {type:'select-branch', branch:'import'})` → `stage:'import'`, `chapter: null`.
2. `STAGE_GRAPH.import.gate = '.dsh/scripts/validate-chapter.ps1'` (`orchestrator.js:131`).
3. `gateArgsFor('.dsh/scripts/validate-chapter.ps1', {chapter:null})` → `chapterArgs()` returns **`[]`** (`:96-103`, because `chapter` is null) → `extra = []`.
4. `needsChapter = extra.includes('-Chapter') || extra.includes('-StartChapter')` → **false** (`:796`), so the `BAD_CHAPTER` guard at `:798-800` **never fires**.
5. `runGate()` spawns `["-NoProfile","-File",".dsh/scripts/validate-chapter.ps1"]` — I captured the exact argv via a spy `spawnSync`.
6. `assets/.dsh/scripts/validate-chapter.ps1:28-29` declares `param([Parameter(Mandatory=$true)] $Chapter …)`.
7. I ran real `pwsh -NoProfile -File …validate-chapter.ps1` with no `-Chapter` under a 15 s watch: **HUNG (no exit)** — PowerShell waits on the mandatory-parameter prompt. In the Host, `spawnSync` has `timeout: 120000` (`orchestrator.js:807`), so every `gate-pass` at the `import` branch stalls **120 s** then yields a refused gate with `已保存进度，可继续`.

**Impact**: one of the three advertised bootstrap branches (README.zh.md:30, catalog zh `:16`, `render()` bootstrap hint `index.js:323` 「导入已有书稿」) is a dead end. A first-time user picking it gets a long stall + no actionable status. This is exactly U2's fail condition ("a reachable state where the user cannot tell whether to wait, retry, resume, or install something") and U4's ("install → first chapter"). `disassemble`'s `analyze-source.ps1` has all-optional params (`:21-26`) so it does not hang — only `import` is affected.

**Minimal fix (choose one, state it in R3):**
- **(a) Preferred** — give `import` a chapter-independent gate: set `STAGE_GRAPH.import.gate = '.dsh/scripts/validate-chapter.ps1'` → `'validate-chapter.ps1'` with `gateArgsFor(..., {chapter:null})` → `['-Chapter','All']` (the script accepts `-Chapter All` per `script-execution.mdc`/AGENTS.md). Add a `GATE_SPECS` entry keyed on stage-or-branch, or a dedicated `'import'` argv builder returning `['-Chapter','All']`. **Verify with real `pwsh` that `-Chapter All` does not hang.**
- **(b)** Set `STAGE_GRAPH.import.gate = null` and let `novel-import`'s own `validate-chapter -Chapter All` step own validation (a gate-less bootstrap, advanced by a small `step-done`-equivalent) — but this weakens the "every stage has a code gate" property, so (a) is preferred.
- **(c)** Add a `chapter-required` classified FAIL when a chapter-scoped script is invoked with `chapter === null` (fix `needsChapter` to detect by script name, not by the returned argv) — this prevents the hang but still leaves `import` unable to pass, so it is a mitigation, not a full fix.
- **Regression test required**: in `test/real-pwsh.test.mjs`, drive the `import` branch with real `pwsh` and a short timeout; assert the gate **returns within a few seconds** with a classified verdict (no mandatory-prompt hang).

---

## 5. Non-blocking findings (carry, do not gate an R3 APPROVE once PM-B1 is fixed)

- **PM-M1 (U5, MAJOR)**: sync `market/PR_STATE.md:6,7,8,14,27,28` and `docs/ARCHITECTURE.md:4` from v2.0.1 → **2.1.0**, refresh the header date, and update `CHANGELOG.md:43-46`'s "Release/index remain at v2.0.1" note (now 2.1.0, tarball 470414 B). `SUBMISSION_STEPS.md:9` "v2.0.0 重建同步" is historical but confusing — add one 2.1.0 line. Add a `docs-consistency` test asserting one version string across surfaces (REVIEW-pm.md §4 P2).
- **PM-M2 (U1 nit)**: `README.md:67` / `README.zh.md:60` example shows `就绪` at `constitution` while `statusOf()` returns `needChoice` at bootstrap — align the example with the real render (`阶段：准备开始 · 请选择开始方式` then `阶段：建立设定 · 进行中`).
- **PM-M3 (U8 nit)**: `index.js:392` maps **any** DEGRADED to `needSetup` ("需要准备运行环境") — but `BAD_CHAPTER` / runner-throw DEGRADED are not environment problems. Either split the token or accept as documented; no leak either way. Also `index.js:6` header comment "no system-prompt section" is stale (doc-only).
- **PM-M4 (accepted boundary, no action)**: architecture F4/F5/F12 from `REVIEW-architecture.md` are still observable — `skip` mid-batch exits the whole batch (it is an *explicit audited human override*, acceptable), `batch-step` permits arbitrary sub-step jumps (by design — it is the "set chapter + step" action), `truthResolver` is existence-only. I do **not** gate on these; they are documented design boundaries, not first-run dead ends.

---

## 6. Documented-pending ACs (unchanged)

| AC | Status |
|---|---|
| **AC-38** real-model ≥3 chapters | **partially closed** — engine/gates/dispatch/adjudication/checkpoint proven live with real `pwsh`; LLM multi-chapter generation + `validate-chapter -Chapter All` PASS still external. The 100-chapter loop is now unit-verified (1500 transitions → `export`), which strengthens but does not close it. |
| **AC-44** official catalog merge | **documented pending** — Lead reports `Submission gate` now **SUCCESS** (verified 15:27:45Z), `check`=success; **maintainer merge remains external**. Not a blocker; do not claim "merged". |
| **AC-45** fresh-profile GUI | **partially closed** — live profile end-to-end + dropdown healthy (v2.0.1 fix) + live Discover index (2.1.0, HTTP 200) + Release tarball (v2.1.0, HTTP 200, 470414 B); only a fresh separate profile + human visual pick remains. |

---

## 7. Decision

**REJECT (scoped to "非常好用" / U1–U8), with 1 BLOCKER: PM-B1.** The improvement round is genuinely strong — 9 of 10 U-criteria effectively met, no B1–B5/N1–N2 regression, 10/10 suites 292/292 green, real-`pwsh` coverage added, distribution verified live and version-synced — but U2/U4 still fail on a reachable, reproduced dead end in the `import` branch. My governance rule (REVIEW-pm.md §3/§4) does not allow declaring "非常好用" with a reachable hang. The earlier functional APPROVE-CONFIRMED (R4, engine core) is **not** withdrawn.

**To convert to APPROVE at R3**, I need:
1. PM-B1 fixed (preferred: `-Chapter All` for the `import` gate) with a real-`pwsh` regression test proving no hang.
2. `node test/run-all.mjs` still 10/10 green, no B1–B5/N1–N2 regression.
3. Re-probe: `select-branch(import)` → `gate-pass` returns a classified verdict within seconds, renders a generic token, and a first-timer can reach the first chapter.
4. (Strongly recommended, not required) PM-M1 version sync so U5 fully passes.

**Resident status**: task-8 stays `in_progress`; I do **not** mark myself done. I remain available for R3 (PM-B1 verification), any further round, or the AC-44 merge spot-check. My write scope this round was `docs/REVIEW-pm-r2.md` only — I edited no runtime code.

*End of PM post-improvement re-review R2.*
