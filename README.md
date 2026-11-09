# 小说模式 (Novel Mode) for DeepSeek Harness

[中文说明](README.zh.md)

A DSH plugin that turns a complete long-form novel writing workflow into a
**mode**: install it, click **小说模式** (or type `/novel`), and the Harness
enters a guided pipeline for planning, drafting and validating a novel.

## What it does

Activating the mode does two things:

1. **Installs the working copy.** The bundled `assets/.dsh/` tree is copied into
   the current project's `.dsh/` directory (idempotent — existing files are
   never overwritten). That tree contains:
   - **21 skills**: 9 workflow skills (`novel-constitution`, `novel-disassemble`,
     `novel-import`, `novel-outline`, `novel-design`, `novel-write`,
     `novel-batch`, `novel-validate`, `novel-design-export`), 9 subagent-role
     skills (`agent-*`), `Humanizer-zh` (de-AI-writing rules), plus the optional
     `site-fanqie` and `novel-downloader` integrations;
   - **PowerShell/Python validation scripts** (word count, punctuation,
     paragraph rhythm, summary/state sync, style fingerprint, continuity
     helpers), **7 Markdown templates plus a `state.yaml` skeleton**
     `.mdc` rules, and `AGENTS.md`.
2. **Starts the workflow.** The model receives the workflow routing
   instructions, inspects the project's `novel/` directory, and continues from
   the correct stage — constitution → disassemble/import → outline → design →
   write → batch → validate → design-export.

The skills' bodies are registered as runtime skills and loaded on demand, so
the plugin adds only a short routing paragraph to each request instead of the
whole workflow text.

## Install

From the GitHub repository (monorepo subdirectory):

```sh
dsh plugin --profile <profile> add https://github.com/github-yousen/novel/tree/master/packages/novel-mode-plugin
```

Or from a local checkout through the Harness plugin manager
(`plugin_manager install_bundle` with the absolute path to this directory).

After installation, **refresh the Web page** (Client bundles are loaded at
boot). The `小说模式` button appears below the composer.

## Requirements

- DeepSeek Harness `0.2.x` (Web profile; the Client half needs the Web UI).
- **PowerShell 7 (`pwsh`)** and **Python 3.7+** on the host: the workflow
  scripts are invoked as `pwsh -NoProfile -File .dsh/scripts/<name>.ps1 ...`.
- The target project directory must be the session's working directory. The
  workflow manages its own `novel/` tree (chapters, state, constitution).

## Usage

| Action | Result |
|---|---|
| Click **小说模式** below the composer | Enters the mode and starts the full workflow |
| Type `/novel [what you want to write]` | Same operation, with an optional goal |
| Ask the model to write/plan/validate a novel | The `novel_mode` tool or the matching `novel-*` skill is loaded automatically |

Workflow commands inside the mode are skills, not slash commands: describe the
intent (e.g. "design chapter 15", "write chapter 16") and the model loads the
matching skill, or pick a skill from the `/` menu in the composer.

## Credentials and privacy

**No credentials are included.** The optional Fanqie integrations ship empty
`fanqie-auth.json.template` and `fanqienovel_auth.json.template` files. If you
want those integrations, copy each `.template` to the real filename and fill in
your own values locally; those real filenames are git-ignored. `publish_result.json`,
`package-lock.json`, bytecode caches and the large reverse-engineering artifacts
are deliberately excluded.

## Layout

```
package.json          dsh.bundle + dsh.client manifest
cordis.patch.yml      one Loader insert row
index.js              Host half: skills, /novel command, novel_mode tool,
                      .dsh/ materialization, prompt routing section
client.js             Client half: the 小说模式 button
locale/*.json         display metadata + UI copy
icon.svg              original book icon
assets/.dsh/          the workflow working copy (materialized into projects)
market/               ready-to-submit awesome-dsh-plugin catalog entry
docs/                 research notes (audit, API, publishing)
```

## License

MIT. The bundled `Humanizer-zh` skill carries its own license.
