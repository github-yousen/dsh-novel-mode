# Changelog

## 1.1.0

- Reworked to match the requested behavior exactly: **小说模式 is now an entry
  in the session's mode dropdown** (a declarative `@deepseek-ai/dsh-agent-preset`
  row with display name `小说模式`), not a composer button.
- Removed the composer button, the `/novel` command, the `novel_mode` tool, the
  system-prompt routing section, and the automatic workflow brief injection.
  No prompt is injected into the model; workflow execution is skill-driven.
- The Host half now only registers the 21 runtime skills and silently
  materializes the bundled `.dsh/` working copy when a session selects the
  `小说模式` preset (idempotent, never overwrites existing files).

## 1.0.0

- First release: bundled the complete novel-writing workflow as a DSH plugin.
