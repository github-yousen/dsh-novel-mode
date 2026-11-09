# 小说模式 (Novel Mode) for DeepSeek Harness

[中文说明](README.zh.md)

A DSH plugin that adds **小说模式 (Novel Mode)** as a selectable entry in the
session's **mode dropdown** (the Agent-preset picker next to the workspace
name). Pick it for a session and the complete long-form novel writing workflow
is available; no custom button, slash command, or auto-started prompt is added.

## What it does

The plugin contributes exactly two Loader rows:

1. **An Agent preset** declared with `@deepseek-ai/dsh-agent-preset`:
   `id: novel`, display name `小说模式`, with a persona that tells the model it
   is in Novel Mode and the standard tool set (file, shell, skill, subagent,
   web, compaction, goal, todo, present). Workflow execution is skill-driven —
   the user describes the intent and the model loads the matching `novel-*`
   skill from the `/` menu.
2. **A Host plugin** that quietly:
   - registers the **21 workflow skills** as runtime skills (9+1 `novel-*`
     workflow skills, 9 `agent-*` subagent roles, `humanizer-zh`, `site-fanqie`,
     `novel-downloader`);
   - when a session selects the `小说模式` preset, **silently materializes** the
     bundled `.dsh/` working copy into that project's root (idempotent, never
     overwrites existing files). No message is injected into the model.

Why the working copy is materialized: all skills and all PowerShell scripts
reference paths relative to the *project root* (`.dsh/scripts/...`,
`.dsh/templates/...`, `.dsh/config.yaml`) and the scripts compute the project
root from `$PSScriptRoot` by going up two levels. They therefore must sit at
`<project>/.dsh/`.

The bundled working copy contains 21 SKILL.md, 18 `.ps1` scripts, 19 `.py`
scripts, 8 templates, `config.yaml`, `charset.json`, `AGENTS.md`, 2 `.mdc`
rules, 9 agent role definitions, plus Humanizer-zh README/LICENSE. No
credentials are bundled.

## Install

```sh
dsh plugin --profile <profile> add https://github.com/github-yousen/dsh-novel-mode
```

Or from a local checkout through the Harness plugin manager
(`plugin_manager install_bundle` with the absolute path to this directory).

After installation, **refresh the Web page / start a new session**. The new
mode appears in the mode dropdown. Existing sessions keep the preset they
started with.

## Requirements

- DeepSeek Harness `0.2.x` (Web profile; the mode dropdown is a Web UI).
- **PowerShell 7 (`pwsh`)** and **Python 3.7+** on the host: the workflow
  scripts are invoked as `pwsh -NoProfile -File .dsh/scripts/<name>.ps1 ...`.
- The target project directory should be the session's working directory. The
  workflow manages its own `novel/` tree (chapters, state, constitution).

## Usage

1. In a new session, open the **mode dropdown** (next to the workspace name)
   and select **小说模式**.
2. Describe the intent — "set up the constitution", "design chapter 15",
   "write chapter 16", "validate the whole book" — and the model loads the
   matching skill from the `/` menu, or pick a skill from that menu directly.
3. Workflow stages: constitution → disassemble/import → outline → design →
   writing → batch → validation → design-export.

The bundled `AGENTS.md` carries the full rule set (three-digit chapter
directories, design-before-draft, validate-and-sync each chapter, Chinese
double quotes, de-AI-writing, `pwsh -NoProfile -File`).

## Credentials and privacy

**No credentials are included.** The optional Fanqie integrations ship empty
`fanqie-auth.json.template` and `fanqienovel_auth.json.template` files. If you
want those integrations, copy each `.template` to the real filename and fill in
your own values locally; those real filenames are git-ignored.
`publish_result.json`, `package-lock.json`, bytecode caches and the large
reverse-engineering artifacts are deliberately excluded.

## Layout

```
package.json          dsh.bundle manifest (Host-only; no dsh.client)
cordis.patch.yml      one Host row + one @deepseek-ai/dsh-agent-preset row
index.js              Host half: skills + silent .dsh/ materialization
locale/*.json         display metadata
icon.svg              original book icon
assets/.dsh/          the workflow working copy (materialized into projects)
market/               ready-to-submit awesome-dsh-plugin catalog entry
docs/                 research notes (audit, API, publishing)
```

## License

MIT. The bundled `Humanizer-zh` skill carries its own license.
