# 小说模式 (Novel Mode) — Product Requirements Document & Acceptance Criteria

> **Owner**: Resident Product Manager (`product-manager`), durable standing teammate.
> **Status**: v1.0 — requirements + executable acceptance checklist. Supersedes the "preset + persona" baseline.
> **Scope of this file**: normative product definition only. I author/edit **only** `novel-mode-plugin/docs/PM-*.md`.
> **Audience**: Team Lead (build + self-verify), builders, testers, market-prep.
> **Language**: spec is bilingual-friendly; Chinese terms kept where the shipped assets use them.

---

## 0. Mandate (verbatim intent distilled)

The user rejected the current plugin as "垃圾简单的插件" (trash simple plugin). The product must be:

1. **Enterprise / production-grade.**
2. **STRONG ORCHESTRATION** — a *real deterministic workflow engine / state machine*, **NOT** a prompt group, **NOT** a persona that shows prompt text to users.
3. **Must never surface prompt dumps or errors to the user.**
4. **Exhaustively tested from multiple angles.**
5. **Successfully published to the DSH market** with **ATTRACTIVE marketing copy that drives downloads**.

### 0.1 What I verified in the baseline (read myself, 2026-11-10)

| File | Fact | Why it fails the mandate |
|---|---|---|
| `cordis.patch.yml` L25-33 | A `@deepseek-ai/dsh-persona` `prefix:` with 4 lines of Chinese prose telling the model "you are in Novel Mode, load the matching skill, obey AGENTS.md". | This is the rejected **persona prompt group**. It is literally a prompt the model is shown. |
| `index.js` L22-24 (header) | *"Workflow execution itself is entirely skill-driven… Nothing here dictates a stage order."* | No deterministic engine; stage order delegated to model goodwill. |
| `index.js` L129-175 | Host half registers 21 runtime skills + silently materializes `.dsh/`. | Useful foundation, but that is asset provisioning, **not orchestration**. |
| `assets/.dsh/skills/novel-batch/SKILL.md` L32-108 | A long **prose** "有限状态机" (finite state machine) with "关卡自检宣言" declarations, "禁止越级" rules, "固定措辞…不可改写". | A state machine *described in a prompt*, enforced only if the model chooses to comply. This is the **"prompt group / pseudo-workflow"** anti-pattern. |
| `assets/.dsh/config.yaml`, `rules/*.mdc`, `AGENTS.md` | Ironclad rules written as text (`alwaysApply: true`, "🔴 全局强制"). | Rules live in model-visible text; there is no code-level gate that *must* pass. |
| `state.yaml` / `batchProgress` | Progress written back by the model following prose. | Durable state is a side effect of obedience, not a transactional checkpoint. |
| `market/data/plugins/github-yousen__dsh-novel-mode.yml`, `PR_BODY.md`, `PR_STATE.md` | Catalog entry submitted (PR #13689), copy is **bland feature-list** ("adds a selectable entry… 21 runtime skills…"). Age gate was the only CI failure. | Marketing does not yet communicate the orchestration value prop; copy is not download-driving. |

**Conclusion**: the shipped *assets* (21 skills, 18+ PowerShell validators, 9 subagent roles, 7 templates, 2 rules, config, charset) are a strong library. The *product* is currently a persona + a prose workflow. The rebuild must keep the library, **replace orchestration with code**, and **strip every model-visible prose prompt out of the user's path**.

---

## 1. Product Definition — "Strong Orchestration"

### 1.1 The one-line definition

> **Strong orchestration = a deterministic, code-executed state machine whose transitions are gated by machine-checkable evidence (PowerShell validator exit codes + file artifacts + adjudicated subagent findings), whose state is durable and resumable, and whose execution does not depend on the language model choosing to follow instructions.**

The model is a **worker** invoked *by* the engine at specific stages (drafting, summarizing, semantic review). The model is **never the engine**, never sees the state-machine definition, and never decides whether a gate passed.

### 1.2 Normative architecture

```
                         ┌──────────────────────────────────────────────┐
   user intent ─────────▶│  Host-side Workflow Engine (CODE, not prompt)│
   (button / command /   │  • stage graph + transition table             │
    preset selection)    │  • entry/exit gates (script-backed)           │
                         │  • checkpoint store (durable, per project)   │
                         │  • retry / failure / rollback policy         │
                         │  • subagent dispatcher + adjudicator          │
                         │  • structured observability log              │
                         └───────┬──────────────────────────────┬──────┘
                                 │ dispatch (typed args only)     │ observe
                                 ▼                                ▼
                       ┌─────────────────┐            ┌────────────────────┐
                       │ workers (LLM /  │            │ validation scripts │
                       │ subagent roles) │            │ (pwsh, exit codes) │
                       └─────────────────┘            └────────────────────┘
                                 │ artifacts (content.md, design.md, summary.md…)
                                 ▼
                       structured project state (novel/ tree + engine checkpoint)
```

Minimum viable engine substrate, per `docs/api-research.md` (which the Lead is extending in `docs/orchestration-research.md`):
- `ctx.get('workflowEngine').start(WorkflowStartRequest)` **or** a dedicated Host service/plugin that owns a transition table. Either is acceptable **iff** the transition function is real JS, not string instructions.
- `workflow/start|phase|log|agent-start|agent-end|end` events for lifecycle.
- `commands.register` / a Client slot for the user entry point (no prompt shown).
- Durable state via a `storageDomain`-style service or a versioned on-disk checkpoint file under the project; must survive process restart and session switch.
- `tools/result` (observe-only) and `agent/turn-stopping` may feed reconciliation, but must not be the sole source of truth.

### 1.3 Mandatory stage graph

Stages are a **DAG**, not a flat checklist. Legal edges only (forward); backward edges are *rework* transitions, not silent skips.

```
        ┌───────────────────────────────────────────────────────────────┐
        │                     ENTRY / BOOTSTRAP                          │
        │   constitution ──┬──▶ disassemble ──┐                          │
        │   (guided/import)│   (reskin)       │                          │
        │                  └──▶ import ───────┤  (each produces:        │
        │                     (existing ms)   │   core.md, style.md,     │
        │                                      ▼   outline.md, state.yaml)│
        │                                OUTLINE ──▶ DESIGN ──▶ WRITE     │
        │                                  │            │          │      │
        │                                  │            │          ▼      │
        │                                  │            │       VALIDATE   │
        │                                  │            │          │      │
        │                                  └────────────┴──────────┤      │
        │                                                         ▼      │
        │                                    BATCH (per-chapter sub-FSM)  │
        │                                    O→A0→A→A1→A2→B→B2→C→D1→D2  │
        │                                          →D3→D4→E (serial)     │
        │                                                         │      │
        │                                                         ▼      │
        │                                                      EXPORT    │
        └───────────────────────────────────────────────────────────────┘
```

Named stages (must appear as stable string IDs in engine state and logs):
`BOOTSTRAP`, `CONSTITUTION`, `DISASSEMBLE`, `IMPORT`, `OUTLINE`, `DESIGN`, `WRITE`, `VALIDATE`, `BATCH`, `EXPORT`, `DONE`, `FAILED`, `PAUSED`.

`BATCH` is itself a nested, **serial**, per-chapter state machine:
`O` (auto-outline) → `O1/O2` (semantic review/repair) → for each chapter `A0` (context bundle) → `A` (design) → `A1` (`validate-design.ps1`) → `A2` (design continuity review) → `B` (draft + summary in one isolated context) → `B2` (`fix-punctuation.ps1` + `reformat-chapter.ps1`) → `C` (`validate-chapter.ps1` + `check-ai-flavor.ps1` + roster + setting/constraint checks) → `D1` (summary present) → `D2` (`validate-summary.ps1`) → `D3` (`sync-state.ps1`) → `D4` (chapter-full continuity review) → `E` (checkpoint write-back + cleanup).

### 1.4 Entry / exit / validation gates (hard requirements)

Every stage has **code-enforced** gates. "Enforced" means: the engine **will not** invoke the next stage's tools until the gate function returns `PASS`, and a failed gate cannot be overridden by model text.

| Gate type | Mechanism | Backing evidence (must be machine-checkable) |
|---|---|---|
| **Entry gate** | Engine checks preconditions before dispatch. | e.g. `DESIGN` entry requires `outline.md` exists + `validate-outline.ps1 -All` exit 0; `WRITE` entry requires `design.md` exists + `validate-design.ps1 -Chapter N` exit 0; `BATCH` entry requires `constitution/core.md`, `style.md`, `outline.md`, `state.yaml` present and `lastChapter` consistent. |
| **Exit gate** | Engine checks artifacts + script exit codes after a stage's worker returns. | e.g. `WRITE` exit requires `content.md` exists, `validate-chapter.ps1 -Chapter N` exit 0 (incl. paragraph-rhythm ERROR cleared), `validate-summary.ps1` exit 0, `sync-state.ps1` exit 0, continuity review verdict ≠ CRITICAL. |
| **Validation gate** | Deterministic PowerShell scripts are the **authority**; AI estimation never counts. | `validate-chapter.ps1` (13 checks), `validate-design.ps1`, `validate-summary.ps1`, `validate-outline.ps1`, `check-ai-flavor.ps1` (paragraph-rhythm item is a hard gate, not advisory), `analyze-roster.ps1`, `compute-style.ps1`. Exit code `0` = PASS; non-zero = FAIL with classified reason. |
| **Truth-source write whitelist** | Engine grants writes per stage. | `outline.md` only via OUTLINE/O; `design.md` initial draft only via DESIGN subagent (minimal repair by adjudicator); `content.md` initial draft only via WRITE/B; `summary.md` co-produced with content; **`state.yaml`剧情/角色/伏笔/世界资产 ONLY writable by `sync-state.ps1`**; engine alone owns `batchProgress`/checkpoint fields. |

**Gate result vocabulary** (structured, logged, never shown raw to user): `PASS | FAIL(error_code, evidence_ref) | DEGRADED(reason) | RETRYABLE(attempt, next_after)`.

### 1.5 Checkpoint / resume / idempotency

- After **every** chapter `E` and after every top-level stage completion, the engine writes a **versioned checkpoint** (schema `checkpointVersion`, `runId`, `stageId`, `chapterNo`, `completedStages[]`, `pendingGates[]`, `inputHash`, `artifactHashes{}`, `subagentVerdicts[]`, `timestamp`). This is the structured state: durable, diffable, `query`-able — not prose.
- `--resume` / API `resume(runId)` reads the checkpoint and **re-enters at the exact failed stage**; it does **not** re-run already-`PASS`ed stages unless their input hash changed.
- **Idempotency**: re-running a completed stage with unchanged inputs is a no-op (content-addressed via `artifactHashes`). Re-running `sync-state.ps1` on the same `summary.md` must not corrupt `state.yaml`. Materialization of `.dsh/` remains idempotent (never overwrite existing files — baseline `index.js` `materialize()` already does this; keep it).
- **Failure / retry policy** (deterministic, bounded, classified):
  - `SCRIPT_FAIL` → retry up to N with backoff, then `FAILED` with a classified error code; never surface raw stderr to the user.
  - `SUBAGENT_TIMEOUT / NO_RETURN` → retry dispatch up to N; on exhaustion, **degrade** to a deterministic fallback (e.g. inline validator path) and record `DEGRADED(reason)`; never silently pass.
  - `GATE_FAIL` → bounded repair loop (minimal repair only, never whole-chapter rewrite); after N failed repairs → `PAUSED` with an internal reason; the engine never "带病放行" (never advances on unresolved ERROR/CRITICAL).
  - All retries are **recorded in the checkpoint**; retry counts are visible to observability, not to the user.
- **No reliance on model goodwill**: there is no prose sentence anywhere in the execution path that, if ignored, changes an outcome. Removing all `SKILL.md` "铁律/关卡宣言/固定措辞" prose from the *control* path is required; those texts may remain only as **worker reference material** (see §2.3).

### 1.6 Subagent dispatch with adjudication (in code)

- Engine dispatches workers with **typed, minimal arguments only** (chapter number, stage, character list, foreshadow IDs). The current `rules/subagent-prompt-whitelist.mdc` content becomes an **engine-enforced allowlist**: the dispatcher literally cannot emit file-path lists, plot hints, or "context" paragraphs because it builds args from a typed schema, not free text.
- **Adjudication is a code function**, not a model rule-of-thumb:
  - A validator subagent returns `{ verdict: PASS|WARNING|CRITICAL, evidenceRefs[] }`.
  - Engine resolves `evidenceRefs` against the actual truth files; `PASS` with empty/insufficient evidence is treated as `NOT_COVERED`, `CRITICAL` with disprovable evidence is a `FALSE_POSITIVE` (dismissed + logged), contradictions between subagents are resolved by **evidence precedence: truth files > subagent judgment > engine memory**.
  - Only an adjudicated verdict can flip a gate. The main session / model is **not** the final judge — the engine is. (This closes the baseline gap where "主会话是唯一裁决者" was a prose rule.)
- Repair after a `WARNING/CRITICAL` is a bounded, minimal, engine-driven edit or a targeted re-dispatch; never an unbounded "ask the model to fix it".

### 1.7 User-visible surface (what the user actually sees)

- A **mode entry** in the dropdown / a button / a single command — no prompt text.
- Concise **status only**: e.g. `阶段：写作 · 第 16/100 章 · 校验通过` / `已暂停（可恢复）`. Structured progress may feed a progress UI via `workflow/*` events.
- On **any** internal failure, the user sees a friendly, localized, **generic** status (e.g. "正在恢复，请稍候" / "已保存进度，可继续") — **never** stack traces, stderr, script names, prompt bodies, gate-internals, or error codes. (AC in §4.)

---

## 2. Non-Goals / Explicit Anti-Patterns (reject on sight)

| # | Anti-pattern | Concrete rejection test |
|---|---|---|
| NG-1 | **User-visible prompt text / prompt dumps** | No `persona.prefix`/`suffix` prose, no `systemPrompt.section` text describing the workflow to the user, no `SKILL.md` body rendered into the conversation, no "关卡自检宣言" printed as chat output. Model-visible instructions may exist only as worker reference, never as user-facing content. |
| NG-2 | **Persona prompt group** | `cordis.patch.yml` must not contain `@deepseek-ai/dsh-persona` with workflow prose. The preset (if kept) carries **only** display metadata + tool wiring, no instructions. |
| NG-3 | **Error surfacing** | No raw stderr, no exit-code dumps, no "脚本 xxx.ps1 失败", no exception text, no validation report pasted into chat. Errors are classified, logged internally, and translated to generic localized status. |
| NG-4 | **"Entity + prompt" pseudo-workflow** | A `SKILL.md` that says "you are now a finite state machine, obey these 铁律" is **marketing copy about a workflow, not a workflow**. The engine must be a JS transition table + gate functions. Prose "关卡宣言/固定措辞/禁止越级" in the control path = automatic REJECT. |
| NG-5 | **Model-as-final-judge** | No gate depends on the model asserting "PASS"/"可以放行"/"问题不大". Only script exit codes + artifacts + adjudicated evidence flip gates. |
| NG-6 | **Unbounded/parallel dependent stages** | No parallel dispatch of stages with data dependencies; `BATCH` chapter pipeline is strictly serial (baseline's own rule, now enforced in code, not prose). |
| NG-7 | **Whole-chapter rewrites / truth-source tampering** | Engine forbids rewriting an entire `content.md`/`design.md`/`outline.md` during repair; `state.yaml` narrative fields are writable only by `sync-state.ps1`. |
| NG-8 | **Silent degradation / fake success** | Every `DEGRADED` and `PAUSED` must be recorded and reflected as a non-green status; the engine may never advance on unresolved ERROR/CRITICAL. |
| NG-9 | **Side effects on unrelated sessions** | Selecting Novel Mode must not materialize `.dsh/` or run scripts in a project that did not opt in; no global prompts, no cross-session state mutation. |
| NG-10 | **Bundled credentials / network writes without consent** | No `fanqie-auth.json`, `fanqienovel_auth.json`, `publish_result.json`, tokens, cookies, or lockfiles in the package. Optional Fanqie integrations are disabled by default and user-supplied. |

**Reworded positively**: the product is a *quiet engine* — the user picks a mode, asks for a book, and gets a book; the machinery (stages, gates, prompts, scripts, retries) is invisible.

---

## 3. Enterprise / Production Bar

### 3.1 Security (no credentials; least privilege)
- **S1** Package contains zero real credentials (AC test sweeps for `msToken`, `sessionid`, `sid_guard`, `passport_*`, `a_bogus`, `secsdk`, `cookie`, `<redacted-id>` — i.e. any real account/book/business ID from private data, expressed only as a placeholder, never as a literal value — and the known real auth/result filenames). Only empty `*.template` files ship.
- **S2** No hardcoded tokens/IDs in any `.py`/`.js`/`.ps1`; secrets read only from user-supplied local files / env at runtime. (Baseline `workflow-audit.md §2.9` already cleared the Python scripts — re-verify after rebuild.)
- **S3** Validation scripts execute via `pwsh -NoProfile -File <path> -Chapter N` with explicit mandatory args; **never** `-Command`/`-c` (double-parse injection vector). Engine constructs argv from typed data, not string concatenation of user input.
- **S4** Engine reads/writes only under the target project's `novel/` + `.dsh/`; path traversal from user-supplied chapter/ranges is rejected (integer-bounded, `{0:D3}` normalized).
- **S5** Optional external-site integrations (Fanqie, downloader) are **off by default**, isolated, and never part of the core gate path.

### 3.2 Determinism
- **D1** Same inputs + same checkpoint → same stage sequence and same gate outcomes. Scripts are the authority for word count, format, punctuation, style fingerprint, paragraph rhythm — AI estimates never count.
- **D2** Transition table is code; no free-text "should" drives control flow.
- **D3** Adjudication uses evidence precedence, deterministic and logged.

### 3.3 Observability (structured state)
- **O1** A machine-readable run log (`workflow/*` events + checkpoint file): `runId, stageId, chapterNo, gate, verdict, evidenceRef, attempt, durationMs, timestamp`. No prose-only logs.
- **O2** `status(runId)` / `resume(runId)` are queryable API/service methods.
- **O3** Progress UI (optional) consumes events; it never contains prompt text.

### 3.4 Durability
- **U1** Checkpoint survives process restart, session switch, and plugin reload (durable storage, not in-memory only).
- **U2** Interrupt at any chapter → `--resume` continues at exact stage with no duplicated/missing chapters.
- **U3** Existing project `novel/` files are never overwritten by install/materialization.

### 3.5 Graceful degradation
- **G1** `pwsh`/`python` missing → engine refuses to start with a friendly generic status, records `DEGRADED`, does not crash the session.
- **G2** Subagent unavailable → deterministic fallback path (`inline` validator) with recorded reason; never a silent pass.
- **G3** Optional integrations missing → core workflow unaffected.
- **G4** A single chapter's failure pauses the run, preserves all prior chapters, never corrupts `state.yaml`.

### 3.6 No side effects on unrelated sessions
- **N1** Materialization is scoped to the session that selected Novel Mode (baseline `presetForSession` guard retained and strengthened).
- **N2** No global `systemPrompt.section` prose leaking into other presets; no shared mutable singleton state across projects.
- **N3** Multiple projects each get their own checkpoint store keyed by project root hash.

### 3.7 Idempotent install
- **I1** `plugin_manager install_bundle` / `dsh plugin add` → repeat install is a no-op; `cordis.patch.yml` uses stable ids (`novel-mode`, `preset-novel`); no duplicate rows.
- **I2** `.dsh/` materialization never overwrites; upgrade adds only new files.
- **I3** Uninstall leaves user's `novel/` data intact.

### 3.8 Testability
- **T1** Engine core is importable JS with a **pure** `transition(state, event) → state` function, testable with `node --test` / a test harness **without** a running DSH or LLM (mock script runner + mock subagent).
- **T2** Gates are individually unit-testable with fixture artifacts.
- **T3** Scripts are independently runnable against fixture `novel/` trees.

### 3.9 Docs
- **DOC1** README (en + zh) explains **capabilities**, install, requirements, privacy — and never prints the workflow prompt.
- **DOC2** Architecture doc describes the stage graph, gate table, checkpoint schema, resume, failure policy.
- **DOC3** Changelog + version bump reflecting the orchestration rewrite (not "1.1.0 removed the button" — that was the *old* direction).
- **DOC4** Market copy is accurate (see §4).

---

## 4. Marketing Requirements (download-driving, honest)

### 4.1 One-line value proposition (must appear first, in both languages)
> **EN**: *"From one idea to a finished, consistency-checked novel — a deterministic writing engine that runs the stages for you, so you never babysit a prompt."*
> **ZH**: *「一个想法到一本校验通过的小说：确定性写作引擎替你跑完全部阶段，你不用再伺候提示词。」*

The value prop must sell the **engine**, not the asset count. Lead with the outcome (finished, consistent book + no prompt babysitting), not "adds a mode entry / 21 skills".

### 4.2 Concrete capabilities (bullet block, quantified, verified)
- A real **state machine**: 7 top-level stages (`constitution→outline→design→write→validate→batch→export`, plus `disassemble`/`import` bootstrap) with code-enforced entry/exit gates.
- **Machine-checked quality**: 13 hard checks per chapter (word count, setting/style fingerprint, format, paragraph rhythm, foreshadow IDs, metadata leakage…), backed by PowerShell validators — the script decides, not the model's opinion.
- **Checkpoint & resume**: interrupt at chapter 47 of 100 and continue exactly there; idempotent re-runs.
- **Adjudicated subagents**: 9 isolated worker roles (writer, continuity validator, outliner, designer, summarizer, analyzer, extractor, rebuilder) whose findings are evidence-checked before a gate can pass.
- **Silent & safe**: no prompts shown, no errors leaked, no credentials bundled, no effect on other sessions.
- Honest quantified asset line (only if still true after rebuild): *"21 skills · 18+ PowerShell/Python validators · 9 subagent roles · 7 templates · 2 rule sets"* — **re-count on the final build; never inflate**.

### 4.3 Honesty constraints (CI + human review)
- Copy must match shipped code **line-for-line** (the upstream `Submission gate` / PR body explicitly checks "claims are checked against the shipped code"). If the engine is a Host service, say "workflow engine"; do **not** claim "commands/slash commands" (DSH has none — audit §8.4). Do not claim "no prompt injection" if a persona still exists — just remove it.
- No superlatives ("best", "#1", "革命性"). No unverifiable numbers. No "AI 自动保证质量" — say "script-gated".
- Catalog `description.en`/`zh` must be quoted if they contain `": "`, `category: workflow`, one-file submission, filename = `url` slug = `name`.

### 4.4 Package/presentation polish
- Square **raster** icon (png/jpg/webp, GitHub-hosted) for the catalog tile — current `icon.svg` is refused by the catalog (`PR_BODY`/catalog YAML comments). `screenshots.json` currently references `assets/screenshot-1.png` which does **not** exist — either ship the screenshot or remove the reference (AC-M4).
- A short "before/after" or capability screenshot that shows the **quiet status UI**, not a wall of text.
- README quick-start in ≤5 lines; requirements (`pwsh` 7, Python 3.7+) stated up front.

### 4.5 Publication acceptance (the "successfully published" bar)
- **PUB1** Repo is Public, `main`/`master` consistent, MIT, topic `dsh-plugin`, `package.json` declares `dsh.bundle` (+ `dsh.client` if a Client half exists), root `cordis.patch.yml`.
- **PUB2** Catalog YAML, `PR_TITLE.md`, `PR_BODY.md`, `SUBMISSION_STEPS.md`, `INSTALL.md` reflect the **final rebuilt** product; `PR_STATE.md` records the **actual** PR number/status (re-verify PR #13689 still applies to the rebuilt repo/commit — do not ship a stale commit SHA).
- **PUB3** CI `check` = success and `Submission gate` = success (age gate cleared). If the rebuild changes the repo, re-confirm the age gate from the *new* PR.
- **PUB4** A published install path works from a clean profile (`dsh plugin add` or `plugin_manager install_bundle`), verified end-to-end.
- **PUB5** Marketing copy criterion: an independent reader can state, in one sentence, *what the engine does for them* and *what makes it different from a prompt pack*. (Reviewer test in AC-M5.)

---

## 5. Numbered Acceptance-Criteria Checklist (Lead executes; PM re-verifies)

> Verdict per item: **PASS / FAIL / N/A-with-reason**. A build is **APPROVE**-able only if all `BLOCKER` items PASS. `MAJOR` items must PASS or have an explicitly accepted, documented exception. I re-run this list every review round.

### A. Strong orchestration (BLOCKER)
- [ ] **AC-1** A JS/Host **transition table** exists (not prose). `grep` the engine source for a stage→gate→next-stage structure; confirm no workflow control lives in `SKILL.md`/`persona`/`systemPrompt` text. *(Ref §1.2)*
- [ ] **AC-2** All 7 top-level stages + `disassemble`/`import` bootstrap + `BATCH` nested 15-step sub-FSM are represented as stable IDs in code and checkpoint. *(§1.3)*
- [ ] **AC-3** Entry/exit/validation gates are code functions; each named gate maps to a real PowerShell script exit code + artifact existence check. Demonstrate by breaking an artifact and showing the engine **refuses** to advance. *(§1.4)*
- [ ] **AC-4** Truth-source write whitelist enforced by engine (esp. `state.yaml` narrative fields only via `sync-state.ps1`). *(§1.4)*
- [ ] **AC-5** Checkpoint schema is versioned + durable; kill the process mid-chapter, restart, `--resume` continues at the exact stage with no duplicate/missing chapter. *(§1.5)*
- [ ] **AC-6** Idempotency: re-run a completed stage with unchanged inputs = no-op; state unchanged. *(§1.5)*
- [ ] **AC-7** Failure/retry policy is bounded + classified; intentionally fail `validate-chapter.ps1` and show bounded repair → `PAUSED`, **never** advance on unresolved ERROR. *(§1.5)*
- [ ] **AC-8** Subagent dispatch uses typed minimal args; dispatcher cannot emit file-path lists/plot hints. Adjudication is code with evidence precedence; a `PASS`-with-no-evidence does **not** flip a gate; a disprovable `CRITICAL` is dismissed + logged. *(§1.6)*
- [ ] **AC-9** Removing all worker-facing "铁律/关卡宣言" prose does **not** change any gate outcome (goodwill-independence test). *(§1.5, NG-4)*

### B. Anti-patterns (BLOCKER)
- [ ] **AC-10** `cordis.patch.yml` contains **no** `@deepseek-ai/dsh-persona` with workflow prose; no `systemPrompt.section` prose describing stages. *(NG-1/2)*
- [ ] **AC-11** No `SKILL.md` body, gate declaration, or prompt is rendered into user-visible chat output. Grep for the baseline "关卡{X} 过" / "我不赶工" strings in the **user-output** path (they may remain only as worker reference, clearly isolated). *(NG-1/4)*
- [ ] **AC-12** Force a script failure, a missing `pwsh`, and a subagent timeout; capture **all** user-visible text: no stderr, no script name, no exit code, no exception, no error code — only generic localized status. *(NG-3)*
- [ ] **AC-13** No "entity + prompt" pseudo-workflow: the engine's control flow is not a string of instructions. *(NG-4)*
- [ ] **AC-14** No gate flips on model-asserted "PASS/可放行/问题不大". *(NG-5)*
- [ ] **AC-15** `BATCH` chapter pipeline is serial in code (no dependent parallel tools). *(NG-6)*
- [ ] **AC-16** Repair never rewrites a whole chapter / never tampers `state.yaml`. *(NG-7)*
- [ ] **AC-17** Every `DEGRADED`/`PAUSED` is recorded + reflected as non-green status. *(NG-8)*
- [ ] **AC-18** Selecting Novel Mode in project A leaves project B untouched; no global prompt/state mutation. *(NG-9)*
- [ ] **AC-19** No credentials/tokens/cookies/lockfiles/result JSON anywhere in the package; only empty templates. *(NG-10, S1)*

### C. Enterprise / production (BLOCKER where marked)
- [ ] **AC-20** *(BLOCKER)* Credential sweep passes on the final tree (patterns in §3.1 S1), including `assets/.dsh/skills/site-fanqie/`. *(S1/S2)*
- [ ] **AC-21** All script invocations are `pwsh -NoProfile -File … -Chapter <int>`; zero `-Command`/`-c`; argv built from typed data, chapter ranges integer-bounded and `{0:D3}` normalized; path traversal rejected. *(S3/S4)*
- [ ] **AC-22** External-site skills off by default, isolated, not in core gate path. *(S5)*
- [ ] **AC-23** Determinism: same fixtures + checkpoint → identical stage sequence & verdicts across 2 runs. *(D1-D3)*
- [ ] **AC-24** Structured run log exposes `runId/stageId/gate/verdict/evidenceRef/attempt/durationMs/timestamp`; `status()` & `resume()` queryable. *(O1/O2)*
- [ ] **AC-25** Durability: checkpoint survives restart + plugin reload; install never overwrites existing `novel/`. *(U1-U3)*
- [ ] **AC-26** Graceful degradation G1-G4 all exercised (missing `pwsh`, missing python, subagent down, single-chapter fail). *(G1-G4)*
- [ ] **AC-27** No-side-effects + idempotent install: double install no-op, stable ids, uninstall preserves user data. *(N1-N3, I1-I3)*
- [ ] **AC-28** Engine core has a pure `transition()` testable **without** DSH/LLM; mock runner + mock subagent; `node --check` on all JS; JSON/YAML valid. *(T1-T3)*
- [ ] **AC-29** Docs: README en/zh = capabilities (no prompt dump), architecture doc, accurate CHANGELOG + version bump. *(DOC1-DOC3)*

### D. Exhaustive testing (BLOCKER — "multiple angles")
- [ ] **AC-30** **Unit**: pure transition table + every gate function with fixture artifacts (pass + fail + edge). *(T1/T2)*
- [ ] **AC-31** **Integration**: full `BOOTSTRAP→…→EXPORT` run on a fixture project with mock workers; assert checkpoint sequence & final artifact set. *(§1.3)*
- [ ] **AC-32** **Resume/chaos**: kill at chapter 1/2/47/99 and at each of the 15 `BATCH` sub-steps; resume; assert no dup/missing/corruption. *(§1.5)*
- [ ] **AC-33** **Adversarial gates**: inject metadata leakage, foreshadow-ID-in-prose, English quotes, paragraph-rhythm ERROR, setting contradiction, missing design.md — each must block at the correct gate with the correct `error_code`. *(§1.4)*
- [ ] **AC-34** **Adversarial subagents**: `PASS`-with-no-evidence, false `CRITICAL`, contradictory verdicts, timeout, no-return — adjudication must behave per §1.6. *(§1.6)*
- [ ] **AC-35** **Security**: credential sweep, `-Command` injection attempt, path-traversal chapter arg, fake auth template. *(§3.1)*
- [ ] **AC-36** **UX/no-leak**: for every failure class, assert user-visible text contains no internals and is localized (en/zh). *(NG-3)*
- [ ] **AC-37** **Isolation/idempotency**: two projects, double install, unrelated session untouched, re-run no-op. *(N1-N3, I1-I3)*
- [ ] **AC-38** **Real end-to-end**: one clean-profile install → pick Novel Mode → write ≥3 real chapters with a real model → `validate-chapter -Chapter All` PASS → export. *(PUB4)*
- [ ] **AC-39** **Test evidence**: a test report (file under `docs/` or `tests/`) lists every AC-30..38 case with PASS/FAIL + how to reproduce. I re-read it in review. *(T1-T3)*

### E. Marketing & publication (BLOCKER where marked)
- [ ] **AC-40** *(BLOCKER)* One-line value prop (§4.1) appears first in README en/zh + catalog `description.en`/`zh`; it sells the **engine/outcome**, not the mode entry. *(§4.1)*
- [ ] **AC-41** Capability bullets are concrete + quantified + **re-counted against the final build**; no superlatives; claims match shipped code. *(§4.2/4.3)*
- [ ] **AC-42** Catalog YAML: one file, slug/url/name consistent, `category: workflow`, quoted descriptions, no `": "` parse bug; `icon:` uses a real GitHub-hosted **raster** file if present; `screenshots.json` reference resolves or is removed. *(§4.3/4.4)*
- [ ] **AC-43** `PR_TITLE.md`/`PR_BODY.md`/`SUBMISSION_STEPS.md`/`INSTALL.md`/`PR_STATE.md` reflect the **final** product and **real** PR number + commit SHA (no stale `173fe81…` if rebuilt). *(PUB2)*
- [ ] **AC-44** *(BLOCKER)* CI `check` **and** `Submission gate` are success (or documented, dated, evidence-backed pending state with an owner + next action). *(PUB3)*
- [ ] **AC-45** *(BLOCKER)* Clean-profile install path verified end-to-end; mode appears; `.dsh/` materialized silently in the right project only. *(PUB4, N1)*
- [ ] **AC-46** Independent-reader test: a reviewer (me, or a teammate) can state in one sentence what the engine does and how it differs from a prompt pack, **from the copy alone**. *(PUB5)*

### F. PM governance (process)
- [ ] **AC-47** Lead creates a review task on the shared board; I claim it and re-verify AC-1..46 against the built tree. *(resident duty)*
- [ ] **AC-48** I deliver `APPROVE` or `REJECT` with **line-level findings** (`file:line` + AC id + expected vs actual + fix). REJECT is not final — I stay available for the next round. *(resident duty)*

---

## 6. Review protocol (how I will operate)

1. **This PRD is the contract.** I will not move the goalposts mid-build; clarifications go in a `PM-*.md` addendum with a dated note.
2. When Lead says *"build is ready"*, I: `team_task_list` → claim the review task → re-read the final tree (not the summary) → execute AC-1..46 → write findings to `docs/PM-REVIEW-R<n>.md` → `send_message(lead, APPROVE|REJECT + top findings)`.
3. **REJECT** always includes: blocker list (AC ids), exact `file:line` evidence, minimal fix, and which ACs already PASS (so Lead knows what not to redo).
4. I remain **inactive-but-available** between rounds; I do **not** mark myself done, do **not** edit outside `docs/PM-*.md`, and do **not** touch build/market/assets files.
5. Marketing copy is reviewed as a **product artifact**, not as prose polish: if it's accurate but not compelling, that's a MAJOR (rework), not a PASS.

---

## 7. Open questions for Lead (non-blocking; answer when convenient)

- **Q1** Will the engine live in `index.js` (Host service + `workflowEngine.start`) or a standalone importable `engine/*.js` module with its own unit tests? (PM prefers the latter for AC-28/30.)
- **Q2** Does the final product keep the `小说模式` mode-dropdown entry, add a button, or both? (PM: any is fine **iff** no persona prose; the dropdown entry should remain for discoverability.)
- **Q3** Checkpoint storage: `storageDomain`-style service vs versioned file under `novel/state/`? (PM: whichever is durable + restart-safe; please document the choice in the architecture doc.)
- **Q4** Should `site-fanqie` / `novel-downloader` ship in the main bundle or as optional packs? (PM: optional/off-by-default; they are not on the core gate path — see §3.1 S5, audit §7.)
- **Q5** Rebuild repo strategy: update the existing `github-yousen/dsh-novel-mode` repo (preserving PR/age) or a new commit on the same repo? This changes `PR_STATE.md`/SHA handling (AC-43).

---

*End of PRD v1.0. Resident PM — available for review rounds and addenda.*
