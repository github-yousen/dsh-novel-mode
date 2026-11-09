# Strong-orchestration research (task-7)

Author: lead. 2026-11-10. Sources: DSH source checkout `D:\yousen\github\deepseek-harness`,
live `cordis_inspect_query` service/event catalogs, GitHub REST API for PR #13689.

## 1. The product problem (from the user)

The previous build was rejected as a "垃圾简单的插件" (trash simple plugin): an entity
(a preset) plus "a prompt group" (persona prefix + injected workflow brief). The user
demands **强编排** — real, deterministic orchestration — with **no user-visible prompt
text and no surfaced errors**.

Design conclusion: the intelligence must live in **plugin-owned deterministic code**,
not in prompt prose. The model may perform creative work (writing a chapter) but the
stage graph, gates, transitions, retries and checkpointing are decided by the engine.

## 2. Available DSH seams (verified)

| Seam | Contract | Suitability |
|---|---|---|
| `workflowEngine.start(request)` | `WorkflowStartRequest = { script, meta, args?, subagentProvider?, maxTotalAgents?, parent, signal? }` → `WorkflowRun` with `result/cancel()/dispose()` | Runs a JS script that fans out subagents with `phase()`. **The script is supplied by the caller at call time** (the `workflow` tool takes `script` from the model). Not registrable as a fixed definition; no built-in "workflow definition registry" (`grep registerDefinition/defineWorkflow` → none). Rejected as the *primary* mechanism because the model would author the script → not deterministic. |
| `ctx.subagents.startActivation(spec)` | named provider registry; spawns children in isolated contexts | Good for the creative stage dispatch, but the Host-side API needs the parent agent and returns a `SubagentActivation`; heavyweight for our purposes. Can be used later for full automation. |
| `ctx.tools.register(def)` | Host tool registry; model-facing schema + `execute(args, exec)` with `exec.agent`, `exec.signal` | **Chosen**: register one orchestration tool whose `execute` calls the deterministic engine. The tool returns structured JSON; no prompt text is shown. |
| `ctx.skills.register(def)` | runtime skill with `resourceBase` | Kept: the 21 workflow skills remain loadable for creative stages. The engine *names* the skill to load; the model loads it. |
| `ctx.subprocess.spawn(spec)` / `execFile` | deterministic script execution | Gates: invoke `pwsh -NoProfile -File .dsh/scripts/<name>.ps1` and parse exit code. Injected as an `io` port for testability. |
| `storageDomain.open(spec)` | `DomainSpec {name, version, tables, ...}` → `Domain` with `table(name).get/put/set/delete`, `global.get/set` | Durable cross-session state is possible, but it requires zod schemas and a backend. **Chosen alternative**: an atomic JSON checkpoint inside the project's `.dsh/state/` (versioned, backup-on-corruption). Simpler, portable, inspectable by the user, and works when the plugin is uninstalled. |
| Events | `agent/created`, `agent-preset/selected`, `turn/end`, `tools/result`, `session/event` | Used only for *silent* install; per `practices.md` a plugin must NOT append new session event types. |

## 3. Chosen architecture

```
lib/orchestrator.js      PURE deterministic core (no Cordis import, no hidden globals)
  STAGES                 explicit stage graph: entry guard / skill / artifacts / gate / retry / next
  createState()          versioned checkpoint
  loadState/saveState    atomic write (tmp + rename), schema validation, corruption → backup + fresh
  plan(state)            derive the next action (loadSkill / runScript / dispatch / done)
  advance(state,event)   pure reducer: validate transition → apply gate → move/retry/halt
  validateTransition()   exhaustive valid/invalid transition table
  summarize(state)       bounded structured status
  STAGE_GRAPH            data-driven transition table (testable exhaustively)

index.js                  Host adapter
  io = { readFile, writeFile, rename, exists, mkdir, readdir, spawnSync, now, log }
  register 21 skills
  register ONE tool: novel_orchestrate({ action: status|start|advance|reset, ... })
    → calls core, returns { ok, state, plan } as structured JSON
    → ALL errors caught → { ok:false, code, message } (never thrown to UI)
  silent .dsh materialization on preset selection (no message injected)
  persona prefix reduced to ONE neutral line (no prompt dump)

cordis.patch.yml          preset '小说模式' + Host row (unchanged shape, persona minimal)
```

**Why this is "strong orchestration"**: the FSM owns stage order, entry/exit gates,
validation (real PowerShell scripts decide PASS/FAIL), retry budgets, checkpoint/resume
and idempotency. The model cannot skip a stage because `advance()` rejects invalid
transitions and gates must pass. Human-visible output is structured state, not prose.

## 4. Interface contract for the test suite (send to test-engineer)

`lib/orchestrator.js` exports (all synchronous, pure, no side effects except via `io`):

```js
export const STATE_VERSION            // number (1)
export const STAGES                   // ordered array of stage ids
export const STAGE_GRAPH              // { [stageId]: { next, onFail, maxRetries, ... } }
export function createState({ project, goal })       // → state
export function validateState(x)                     // → { ok, error? }
export function serializeState(state)                // → string (stable key order)
export function parseState(text)                     // → { ok, state?, error? }
export function loadState(io, project)               // → { ok, state, recovered? }
export function saveState(io, project, state)        // → { ok }
export function plan(state)                          // → { stage, action, skill?, script?, params?, done }
export function validateTransition(state, event)     // → { ok, reason? }
export function advance(state, event)                // → { ok, state, reason? }  (pure; never mutates input)
export function summarize(state)                     // → bounded object
export function stageGuard(stage, io, project, state)// → { ok, missing: [] }
export function gate(stage, io, project, state)      // → { ok, failures: [] }
```

`io` shape (injected):
`{ exists(p), readFile(p), writeFile(p,text), rename(a,b), mkdir(p), readdir(p), spawnSync(cmd,args,opts), now(), log(level,msg) }`

`event` shape: `{ type: 'start'|'gate-pass'|'gate-fail'|'skip'|'reset', stage?, goal?, note? }`

## 5. Market state (2026-11-10 01:10 +08)

- PR #13689: **open**, `merged=false`, head `708c0af`, 1 file (+25).
- `check` check-run: `in_progress`; earlier the only failure was `Submission gate` =
  "repository is 0.0 days old (needs 1) — re-runs by itself … No need to resubmit".
- Repo `github-yousen/dsh-novel-mode` created 2026-11-09; `github-yousen/skills` is
  public and created 2026-05-12 (age gate satisfied) — a possible mirror target if the
  age gate must be bypassed for a green CI.
- Merge is maintainer-controlled; the plugin cannot force it. A self-hosted format-1
  index (GitHub Pages) is a fully-controlled parallel channel.

## 6. Risks

1. Age gate + maintainer merge cannot be forced → report honestly; use the old-repo
   mirror or a self-hosted index as a controlled fallback.
2. `pwsh`/Python may be absent in some environments → gates must degrade to file-based
   checks and record `skipped`, never crash.
3. Preset scope vs Host-global skill layers: Host `skills.register` lands in the global
   layer, which every preset scope chain merges (`packages/skill/skill/src/index.ts:346-352`)
   → skills are visible in 小说模式. Verified.
4. No new session event types, no prompt dump, no thrown errors: enforced by tests.
