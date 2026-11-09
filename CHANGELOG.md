# Changelog

## 1.0.0

- First release of 小说模式 (Novel Mode) for DeepSeek Harness.
- One-click `小说模式` button in the conversation composer plus the `/novel`
  command and the `novel_mode` agent tool. Activating the mode materializes a
  complete `.dsh/` working copy (21 skills, 9 subagent roles, templates,
  validation scripts, config, rules and AGENTS.md) into the current project and
  steers the model into the full novel-writing workflow.
- The working copy is idempotent: existing project files are never overwritten.
- No credentials are bundled. Optional Fanqie integrations ship empty
  `*.json.template` files that users fill in locally.
