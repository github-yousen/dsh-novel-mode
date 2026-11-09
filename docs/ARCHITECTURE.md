# 小说模式 — Architecture

> Companion to [PM-PRD.md](PM-PRD.md). Describes the implemented engine, not a
> proposal. Status: implemented in `lib/orchestrator.js` + `index.js` (v2.0.0).

## 1. Layer split

| Layer | File | Responsibility | Testable alone |
|---|---|---|---|
| Deterministic core | `lib/orchestrator.js` | transition table, gates, adjudication, checkpoint, dispatch allowlist | ✅ pure JS, injected `io`, no Cordis |
| Host adapter | `index.js` | skill registration, `novel_orchestrate` tool, silent `.dsh/` install, generic status tokens | ✅ via mock ctx |
| Declarative surface | `cordis.patch.yml` | `小说模式` preset (display metadata + tool wiring) + Host row | ✅ YAML parse |
| Worker library | `assets/.dsh/skills/*` (21) | creative work only; never consulted for control flow | — |
| Validators | `assets/.dsh/scripts/*.ps1` (18) | authoritative quality verdicts via exit codes | ✅ fixture projects |

**No persona, no `systemPrompt.section`, no injected workflow brief.** The model
never sees the state machine definition as prose; it receives typed dispatch
arguments and the skill it is told to load.

## 2. Stage graph (`STAGE_GRAPH`)

```
BOOTSTRAP ─┬─▶ CONSTITUTION ─┐
           ├─▶ DISASSEMBLE ──┤ (each produces core.md/style.md/outline.md/state)
           └─▶ IMPORT ───────┘
                              ▼
   OUTLINE ─▶ DESIGN ─▶ WRITE ─▶ VALIDATE ─▶ BATCH ─▶ EXPORT ─▶ DONE
```

Stable ids: `bootstrap, constitution, disassemble, import, outline, design,
write, validate, batch, export, done`. Each node declares `next`, `onFail`,
`maxRetries`, `skill`, `gate`, `entry[]`, `produces[]`.

`BATCH` contains `BATCH_SUBSTEPS` (15 strictly serial steps):
`O, O1, O2, A0, A, A1, A2, B, B2, C, D1, D2, D3, D4, E`. Step `E` advances the
chapter or exits the loop; the reducer is the only place this advances.

## 3. Transition reducer (`advance`)

`advance(state, event) → { ok, state, reason? }` is **pure** (input never
mutated). `validateTransition()` rejects:
- unknown event types (closed `EVENT_TYPES` set),
- `gate-pass/fail/batch-step` from a non-running status,
- `start` from a terminal/invalid status,
- `select-branch` outside `bootstrap` or with an unknown branch,
- `reset` is the only way out of `done`,
- any chapter argument failing `normalizeChapter()`.

Gate events are **code-verified before the reducer runs**: in `index.js`, a
`gate-pass` triggers `engine.gate()`; if the real script verdict is not PASS the
engine converts it into a `gate-fail` and refuses to advance. A `gate-fail`
claim is ignored when the script says PASS. **Only script exit codes + artifacts
flip gates — never model assertions** (AC-14 / NG-5).

Failure policy: `gate-fail` increments `retries`; at `maxRetries` the status
becomes `paused` (never `done`, never silently advanced). `skip` is an explicit,
audited override producing a `DEGRADED` verdict (AC-17). Every transition
appends a bounded, structured `logEvent` (AC-24).

## 4. Gates (`stageGuard`, `gate`)

- `stageGuard(stage, io, project)` — checks `entry[]` artifacts exist. Used as
  the entry condition for every script-backed stage.
- `gate(stage, io, project, state)` — runs `pwsh -NoProfile -File <rel>
  -Chapter <int>` via `io.spawnSync`. Exit 0 → `PASS`; non-zero → `FAIL` with a
  **classified** failure (`script-exit-N`), never raw stderr. Missing `pwsh` or
  missing runner → `DEGRADED` (`skipped`), recorded, never a crash and never a
  silent pass (AC-12 / NG-3 / G1).
- `-Command`/`-c` is never used; chapter is normalized to an integer in
  1..99999, path-traversal values are rejected (AC-21 / S3 / S4).

## 5. Adjudication (`adjudicate`)

Verdicts `{ verdict: PASS|WARNING|CRITICAL, evidenceRefs[] }` are resolved
against a truth resolver with fixed precedence
**truth files > subagent judgment > engine memory**:
- `PASS` with no confirmed evidence → `NOT_COVERED` (cannot flip a gate);
- `CRITICAL` with no confirmed evidence → `FALSE_POSITIVE`, dismissed + logged;
- contradictions resolve by evidence, not by label.

`dispatchArgs()` builds typed minimal args from state; `validateDispatch()`
rejects any disallowed field, path-like string, or prose-like value. The
dispatcher therefore **cannot** emit a file list or plot hint (AC-8).

## 6. Durability & idempotency

- Checkpoint: `<project>/.dsh/state/novel-mode.checkpoint.json`, schema
  `version: 2`, containing `runId, stage, batchStep, chapter, status, retries,
  gate, history[], log[], timestamps`.
- `saveState` = write `.tmp` → `rename` (atomic). `loadState` = parse +
  `validateState`; on corruption the old file is renamed to
  `novel-mode.checkpoint.corrupt.json` and a fresh state is returned with a
  recorded `recover` event — **no data is silently discarded**.
- Survives process restart, session switch and plugin reload because it lives
  in the project's filesystem, not in Host memory.
- Materialization of `assets/.dsh/` is idempotent and never overwrites existing
  files. Re-running a completed stage with unchanged inputs is a no-op at the
  checker level; retries are recorded, not hidden.

## 7. User-visible surface

The `novel_orchestrate` tool returns structured JSON. Its `render()` shows only
`阶段 · 第 N 章 · 步骤 X · <generic status>`. `STATUS_TEXT` maps every internal
failure to one of four generic localized tokens (`就绪` / `已保存进度，可继续` /
`正在恢复，请稍候` / `工作流暂不可用，请稍候`). **No exception text, stderr,
script name, exit code, prompt body, or gate internals ever reach the user.**

All adapter work is wrapped in `try/catch` returning `{ ok:false, code }` —
`code` is a stable classified token (e.g. `ENGINE_UNAVAILABLE`), not a raw error.

## 8. Isolation

- `ensureFor(agent)` checks `agentPresets.presetForSession(session) === 'novel'`
  before materializing; other presets/projects are untouched (NG-9).
- No global prompt sections; no shared mutable singletons; each project keyed
  by its root path.
- Optional `site-fanqie` / `novel-downloader` skills are off the core gate path.

## 9. Reproducible verification

`test/run-all.mjs` runs every suite (unit, orchestrator, integration, security,
failure-recovery, manifest, marketing). The core needs neither DSH nor an LLM:
`io` is injected, `spawnSync` can be mocked, subagent verdicts are fixtures.
`docs/PM-REVIEW-R*.md` records the resident PM's per-AC verdicts.
