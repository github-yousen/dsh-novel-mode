# Changelog

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
