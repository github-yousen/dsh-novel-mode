# Changelog

## 2.1.1 — pnpm-safe tarball layout (upstream maintainer feedback, 2026-11-11)

After PR #13689 was merged, upstream maintainer `fkysly` reported that the
v2.1.0 Release tarball used a **root-level layout** (`index.js`, `lib/...` at the
archive root). `pnpm` strips the first path segment when extracting a `.tgz`, so
subdirectory entries would be flattened (`lib/x.js` → `x.js`) and an install
from the tarball would find only the entry point, not the rest of the plugin.
They removed `tarball:` from the merged catalog entry (the site now installs via
`github:github-yousen/dsh-novel-mode`).

- `assets/make-tarball.py` now wraps **every** entry in a single `package/`
  prefix (`arcname="package/" + rel`), the npm/pnpm tarball convention, and
  asserts no entry lacks the prefix. Verified: 111/111 entries prefixed, 0 bad.
- Added a `manifest.test.mjs` regression so a root-level `arcname=rel` cannot
  silently return.
- Rebuilt and replaced the v2.1.1 Release asset (471373 B). Catalog/install
  docs now state the `github:` source as primary; the prebuilt tarball is the
  optional pnpm-safe alternative.
- Full suite: **10/10 suites, 298/298 assertions, exit 0**.

## 2.1.0 — multi-angle team review: real-workflow correctness + usability (2026-11-11)

A 5-angle review team (architecture / usability / security / QA / product) plus the
resident PM cross-reviewed the plugin and the accepted findings were implemented
directly. Details: `docs/REVIEW-*.md`.

**Real-workflow correctness (previously untestable paths, now covered by a real-`pwsh` test):**
- **Gate argv contracts**: `GATE_SPECS` / `gateArgsFor()` build the correct argv per
  validator. `validate-outline.ps1` needs `-All` or `-StartChapter/-EndChapter`,
  `analyze-source.ps1` takes no chapter; the old blanket `-Chapter N` failed
  PowerShell parameter binding and made those gates unwinnable. Verified with real
  `pwsh` (`test/real-pwsh.test.mjs`).
- **Linear-stage chapter propagation (F2)**: `gate-pass` now forwards the caller's
  `chapter` into the gate state, so `validate-chapter.ps1 -Chapter N` binds.
- **Gate-less BATCH sub-steps (F1/F3)**: added a `step-done` engine event + Host
  action for the 9 sub-steps with no validator, and made `verify` adjudicate on
  worker evidence alone at `O1/A2/D4` (no fabricated script PASS). The
  100-chapter loop and batch→export exit are now reachable through the tool flow;
  a full 15-step chapter loop is unit-tested.
- **Missing `pwsh` (ENOENT)** now classifies as `DEGRADED`/environment-setup,
  not a `FAIL` that burns the retry budget forever.

**Usability:**
- One short `novel:mode-route` tool-routing section (NOT a prompt group) so the
  model knows to call `novel_orchestrate`; stage order/gates remain code-owned.
- Actionable status tokens: `进行中 / 正在重试 / 请选择开始方式 / 需要准备运行环境`;
  bootstrap branch choices surfaced in the render; internal stage/step ids shown
  with Chinese labels; `GATE_DEGRADED` no longer implies auto-recovery.
- `descriptionFromFrontmatter()` now rejects YAML block-scalar indicators (`|`/`>`).
- Worker roles + the two optional external-site integrations default to
  `userInvocable:false` (opt-in), leaving only user-facing workflow skills in `/`.
- Docs: restart (not just refresh), novel-project cwd, `pwsh` setup, no `client.js`.

**Security / packaging:**
- `.gitignore` anchored to `/.dsh/` so the shipped `assets/.dsh/` tree is not
  silently excluded from git (F-1).
- All 34 `.codebuddy/...` path references in shipped assets replaced with `.dsh/`
  (clean-profile installs work); `AGENTS.md` rewritten path-neutral. Regression
  test asserts no `.codebuddy` reference remains.

**Docs / market:** PR_STATE rewritten with v2.1.0 + `Submission gate` SUCCESS and
dated evidence; PR_BODY honest about the single routing section; token-storage
disclosure removed; version-drift guard added; stale test counts corrected.
Self-hosted index and Release are at v2.1.0.
Post-review fixes: `import` gate uses `-Chapter All` (no 120s hang, PM-B1),
`start` from paused preserves progress (F6), real-`pwsh` regression tests.
Test suite: **10/10 suites, 297/297 assertions, exit 0**.

## 2.0.1 — mode dropdown visibility fix (2026-11-10)

- **Real defect found from a user screenshot**: the `小说模式` entry was
  registered in the agent-preset roster but **filtered out of the mode dropdown**
  because its declaration included `@deepseek-ai/dsh-tool-subagent-control/list-agents`
  — a subpath export that is not resolvable in every DSH build. The preset was
  marked `broken` ("never started"), and `presetOptions()` hides broken presets.
  Verified against the live Host roster with a temporary diagnostic plugin
  before and after the fix.
- Removed the two `dsh-tool-subagent-control` rows from the preset; the novel
  workflow only needs `dsh-tool-subagent` (dispatch), which stays.
- Added a `manifest.test.mjs` regression that rejects unresolvable deep-subpath
  package names in the preset, so this cannot silently recur.
- Verified after a Host restart: roster has 5 healthy presets, `novel` has
  `name: 小说模式` and no `broken` → visible in the dropdown.

## 2.0.0 — deterministic orchestration engine (enterprise/production)

The product was rebuilt from a "preset + persona prompt group" into a **quiet
engine**. This is a breaking architectural change.

- **Added `lib/orchestrator.js`**: pure, importable, unit-testable deterministic
  state machine — `STAGE_GRAPH` (11 stages incl. 3 bootstrap branches),
  `BATCH_SUBSTEPS` (15 strictly serial per-chapter steps), pure `advance()`
  reducer with a closed event set, `validateTransition()`, `stageGuard()`,
  `gate()`, `adjudicate()`, `dispatchArgs()`/`validateDispatch()`,
  `normalizeChapter()`/`artifactPath()`, `logEvent()`, `summarize()`,
  versioned atomic `loadState()`/`saveState()` with corruption backup.
- **Added the `novel_orchestrate` Host tool**: the only control surface. It
  re-verifies gate events against real PowerShell script verdicts, rejects
  illegal transitions, never leaks stderr/exception text/script names/exit codes,
  and returns structured JSON + a generic localized status token.
- **Removed the persona prompt group** from `cordis.patch.yml` (no
  `@deepseek-ai/dsh-persona` workflow prose). No `systemPrompt.section`, no
  workflow brief injection, no user-visible prompt text anywhere.
- **Removed the `/novel` command, `novel_mode` tool, composer button and
  `client.js`** from earlier builds.
- **Kept** the 21 runtime skills (worker library only), silent idempotent
  `.dsh/` materialization scoped to sessions that selected the `小说模式`
  preset, and zero bundled credentials.
- **Docs**: `docs/ARCHITECTURE.md`, `docs/PM-PRD.md` (AC-1..48),
  `docs/orchestration-research.md`; rewritten bilingual README with the
  engine/outcome value proposition; honest re-counted asset figures.
- **Presentation**: real raster catalog icon + capability screenshot (PNG).
- **Tests**: multi-angle automated suite under `test/`.

## 1.1.0

- Added a selectable `小说模式` entry to the session mode dropdown (Agent preset).

## 1.0.0

- First release: bundled the complete novel-writing workflow as a DSH plugin.
