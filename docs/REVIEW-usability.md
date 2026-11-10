# REVIEW — Usability / End-user experience (ANGLE B, task-10)

> Reviewer: workflow-auditor. Scope: **read-only** review of the delivered plugin; only this file is written. Runtime code is NOT edited.
> Method: read the actual files listed by lead (`README.md`, `README.zh.md`, `market/INSTALL.md`, `market/SUBMISSION_STEPS.md`, `cordis.patch.yml`, `index.js`, `docs/LIVE-VERIFICATION.md`, `assets/.dsh/AGENTS.md`), plus `lib/orchestrator.js`, `package.json`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `locale/*.json`, and the shipped SKILL.md frontmatter. Two small runtime probes were run to confirm behavior (no files written).
> **GUI was not available** — see §5. All "what the user sees" statements are inferred from `index.js::render()`, the tool's output schema, and the transcripts in `docs/LIVE-VERIFICATION.md` — not from a screenshot.

---

## 1. Verdict on "very usable"

**Not yet "very usable" for a first-time user.** The install/onboarding *documentation* is genuinely strong (§4), and the no-leak status design is a good security posture. But the **first-run interaction has a structural gap**: after installing and selecting 小说模式, there is **no code path that turns a typed sentence into a running workflow**, and the two places where the user must make a decision (which bootstrap branch; what to do when a gate cannot pass) are **never surfaced as an actionable question or instruction**. The marketing promise "说出你想写什么，剩下的交给引擎 / the engine takes it from there" (`README.zh.md:53`, `README.md:59-60`) is not what the shipped v2.0.1 build does: the build itself documents that it is *tool-call driven, model as transport, unattended chain is a future enhancement* (`docs/ARCHITECTURE.md:8-18`, `CHANGELOG.md:31-39`).

The verdict is **"usable by an expert who knows the internals; confusing / dead-ending for a first-time user"** — i.e. the *engine* is strong, the *product surface* around it is thin. Most gaps below are **documentation + tiny presentation-layer fixes**, not architectural rewrites. With the ranked minimal fixes in §3 (a short system-prompt routing section, rendering the branch options, a stage-label map, honest first-run wording, and prerequisite hints) this becomes genuinely very usable. None of the findings require changing the deterministic engine.

I did **not** manufacture problems: every gap below cites a specific file:line and either a runtime probe or an explicit statement in the shipped docs/tests. Where I could not confirm something (GUI rendering, live model behavior), it is listed in §5, not asserted as a defect.

---

## 2. Numbered FIRST-RUN WALKTHROUGH (simulated)

Realistic first-timer: has DSH desktop (Web profile) open on a general workspace, reads the market listing, installs, wants to write 都市悬疑.

1. **Install.** User reads `market/INSTALL.md` and runs `dsh plugin --profile desktop add https://github.com/github-yousen/dsh-novel-mode` (`INSTALL.md:22`). Clear: `<profile>` is required (`INSTALL.md:25`), no build scripts / no `allowBuilds` needed (`INSTALL.md:13,57`), `engines.dsh` stated (`INSTALL.md:15`). **Good.**
   - ⚠️ Contradiction already: `INSTALL.md:41` and `:67` say **"重启 dsh / 重新加载 profile"**, `CHANGELOG.md:16` says "Verified after a **Host restart**", but the README — the file a market visitor actually reads — says only **"refresh the page" / "刷新页面"** (`README.md:59`, `README.zh.md:53`). A new `cordis.patch.yml` row is observed on the **next entry restart/boot**, not a page refresh (per `docs/api-research.md §3.3`). → **Gap G2.**

2. **Refresh (or restart).** User refreshes the page and opens the mode dropdown. If only a refresh was done, the `小说模式` row may not be there yet (preset row is new this boot). No message tells the user they need a full restart. → **Dead end D-A** (see G2). If they restarted, the entry shows with the clear Chinese description from `cordis.patch.yml:23`. **Good.**

3. **Select 小说模式.** On `agent/created` / `agent-preset/selected`, `index.js:399-405` silently runs `materialize()` and copies the bundled `.dsh/` tree into the **session cwd** (`projectRootOf`, `index.js:108-116` → falls back to `process.cwd()`). No prompt, no confirmation, no check that cwd is a novel project. Evidence this really happens in a general workspace: `docs/LIVE-VERIFICATION.md:33` records the live checkpoint at `D:\yousen\.dsh\state\novel-mode.checkpoint.json` — i.e. `.dsh/` was materialized into the workspace root, not a dedicated novel folder. → **Gap G3.**
   - The user is also never told to open/create a project folder first (`INSTALL.md:12` lists "可写的小说项目目录" as a prerequisite but gives no step and no verification).
   - The materialized `assets/.dsh/AGENTS.md:16-17` is auto-surfaced as project instructions (this harness does inject `.dsh/AGENTS.md` for work under that dir) and tells the model *"本根目录没有 novel/ 目录… 实际项目在 archive/* 与 new/ 子目录"* — stale context from the original `D:\yousen\novel` repo, wrong for a fresh user, and liable to make the model hunt for non-existent `archive/` / `new/` folders. → **Gap G3b.**

4. **Type 「写一本都市悬疑」.** Per `README.md:64-68` / `README.zh.md:57-61`, the user expects `Model → novel_orchestrate(start → select-branch constitution → …)` and to see `阶段：constitution · 就绪 → 阶段：write · 第 1 章 · 就绪`.
   - **Reality:** there is no `systemPrompt.section`, no `/novel` command, no composer button, no `agent.followup()`/`inject()` anywhere in the shipped JS (grep over `*.js`: zero matches; `CHANGELOG.md:36-39` explicitly says all were removed in v2.0.0; `ARCHITECTURE.md:28` "No persona, no systemPrompt.section, no injected workflow brief"). The **only** control surface is the `novel_orchestrate` tool (`index.js:204`). Nothing instructs or steers the model to call it, let alone to chain `start → select-branch → gate-pass → …` one action at a time. `ARCHITECTURE.md:8-18` concedes the model is a *transport* and a fully unattended chain is future work.
   - So the typed sentence either produces an ordinary LLM answer about writing a novel, or — if the model happens to notice the tool description — a single `status`/`start` call. **There is no deterministic trigger.** → **Gap G1 (most severe).**

5. **At bootstrap, the branch choice.** `engine.plan()` returns `{action:'select-branch', options:['constitution','disassemble','import']}` (`orchestrator.js:316-318`); `publicPlan()` passes `options` through in the JSON (`index.js:178`). But `render()` (`index.js:252-262`) renders **only** `阶段 · 第 N 章 · 步骤 X · <status>` — it never renders `options`, and there is no `ask-user` call or followup injection. So the user is *never asked* "从零搭建 / 拆书仿写 / 导入已有书稿?" The visible result of `start` is exactly `阶段：bootstrap · 就绪` (`LIVE-VERIFICATION.md:16,19`). `就绪` reads as "ready / waiting", i.e. the user waits for a question that never comes. → **Gap G4 + G5.**

6. **If the run somehow proceeds.** The model must call the tool once per action (`dispatch`, `verify`, `gate-pass`, `batch-step` …). The user sees raw internal tokens: `阶段：disassemble · 步骤 D4 · 第 15 章 · 已保存进度，可继续` (format from `index.js:256-259`; `LIVE-VERIFICATION.md:23` shows `batch · 第 15 章 · 步骤 D4`). `bootstrap / constitution / disassemble / import / outline / design / write / validate / batch / export` and `O/O1/O2/A0/A/A1/A2/B/B2/C/D1/D2/D3/D4/E` are untranslated machine ids. → **Gap G6.**

7. **When a gate cannot pass (e.g. `pwsh` missing).** README promises a DEGRADED pause (`README.md:77-78`, `README.zh.md:68-69`). Runtime probe: a genuinely missing `pwsh` binary yields `spawnSync` ENOENT (`status:null`), which `runGate()` classifies as **FAIL / code 1** (`orchestrator.js:717-726`), not the DEGRADED/`正在恢复，请稍候` path (`index.js:321`). Either way the user sees one of the four generic tokens and **no hint to install PowerShell 7**, no "what to do next", and no distinction between a transient retry and a terminal block. `已保存进度，可继续` is a false promise when the gate can never pass. → **Gap G5 / G7.** (Probe detail in §3 G7.)

8. **Restart mid-book.** README claims "100 章写到第 47 章中断，就从第 47 章继续" (`README.zh.md:64-65`). The checkpoint is durable (`orchestrator.js:228-272`) — good — but **nothing tells the user or the model to call `resume`/`status`** in the new session, and `statusOf()` on a still-`running` state returns `就绪` (`index.js:134-139`), so a resumable run is indistinguishable from a fresh idle one. → **Gap G8.**

9. **Uninstall.** `INSTALL.md:69` gives the remove command but says nothing about cleanup. The materialized `.dsh/` tree, `.dsh/state/novel-mode.checkpoint.json`, and any generated `novel/` remain silently; because `materialize()` never overwrites existing files (`index.js:100`), a later reinstall/upgrade also keeps stale scripts. → **Gap G9.**

**Net first-run outcome:** install docs work; the "pick mode → type a sentence → engine runs" core loop is **not actually wired** and, where it is wired, the user is never asked the required question nor told what to do on failure. This is the crux of the "not very usable" verdict.

---

## 3. CONCRETE GAPS, ranked by severity

Each: **file:line + user impact + minimal fix** (specific wording/code). Fixes are additive/presentation-layer; none alter the deterministic engine contract.

### G1 — CRITICAL: no trigger/steering from a typed sentence; "engine takes it from there" is not implemented
- **Evidence:** `index.js:33` (`inject = ['skills','tools']` only), `index.js:204-381` (tool is the sole control surface), `CHANGELOG.md:36-39` (removed persona prompt group, `/novel` command, `novel_mode` tool, composer button, `client.js`), `ARCHITECTURE.md:8-18` ("tool-call driven… model acts as a transport… A fully unattended Host-driven chain is a possible future enhancement, not part of this release"), `ARCHITECTURE.md:28`. Marketing claim: `README.md:3-5,59-60,70-74`, `README.zh.md:3,53,63-65`.
- **User impact:** the single advertised interaction ("说出你想写什么，剩下的交给引擎") depends entirely on model goodwill. There is no prompt section, command, or followup that (a) starts the engine, (b) chains actions, (c) asks the branch question. A first-timer's `写一本都市悬疑` can produce a normal chat answer and no workflow at all. Highest-severity first-run dead end; also the biggest honesty gap between copy and code.
- **Minimal fix (two parts, no engine change):**
  1. Register one short routing section in `apply()`: `ctx.systemPrompt.section({ name:'novel:route', order:1950, text:'当用户在此模式描述写作意图时，立即调用 novel_orchestrate(action:"status")，然后按其返回的 next.action 逐步调用（start → select-branch → …）；在 bootstrap 阶段必须先用 ask-user 向用户展示 next.options 的三个分支并等待选择；不要自行编造阶段顺序。' })` and add `'systemPrompt'` to `inject`. (~10 lines; keeps the 21 skill bodies out of the prompt, per `api-research.md §1.2`.)
  2. Soften the copy to match reality: change `README.md:59-60` / `README.zh.md:53` to e.g. **「刷新/重启后在模式下拉框选择「小说模式」，说出你想写什么；工作流会逐步推进，每一步状态会显示出来。首次使用会先问你从哪种方式开始。」** and replace `README.md:70-74` / `README.zh.md:63-65` "engine has already picked the branch… Kill the session at chapter 47…" with an accurate step-by-step example. If the team prefers a truly autonomous chain, that is the architecture work `ARCHITECTURE.md:16-18` already flags as future — do not claim it now.

### G2 — HIGH: "refresh the page" vs "restart dsh" — install appears to fail on first try
- **Evidence:** `README.md:59`, `README.zh.md:53` say **refresh**; `INSTALL.md:41,67`, `CHANGELOG.md:16`, `api-research.md §3.3` say a **Host/entry restart** is required for a new `package.json` + `cordis.patch.yml` row.
- **User impact:** user refreshes, the mode dropdown has no 小说模式, no explanation → they think the install failed and give up (or reinstall repeatedly).
- **Minimal fix:** in both READMEs replace "refresh the page / 刷新页面" with **「重启 DeepSeek Harness（不是仅刷新页面），然后在工作区名旁的模式下拉框选择「小说模式」」** / "Restart DeepSeek Harness (a page refresh is not enough), then pick 小说模式 in the mode dropdown next to the workspace name." Add one line: "首次安装后若下拉框没有该模式，请完全重启 dsh 再试。"

### G3 — HIGH: materialization into an arbitrary / non-novel cwd; no "open a project folder first" step
- **Evidence:** `index.js:108-116` (`projectRootOf` → `resolve(process.cwd())` fallback), `index.js:384-405` (`ensureFor` materializes on mode selection with no cwd validation beyond `root.length >= 2`), `index.js:88-106` (`materialize`). `INSTALL.md:12` lists the prerequisite but no action/verification. Live proof of writing into a general workspace: `LIVE-VERIFICATION.md:33` (`D:\yousen\.dsh\state\...`).
- **User impact:** selecting the mode in any session silently dumps a large `.dsh/` tree (21 skills, 21 scripts, templates, rules, AGENTS.md) into an unrelated folder (home dir, a code repo). No confirmation, no "where is my novel?", no warning. On a shared/non-writable dir it fails silently (`index.js:395-397` swallows all errors).
- **Minimal fix:** (a) In `INSTALL.md`, add an explicit first step **「先在 DSH 中打开（或新建）一个空目录作为小说项目工作区，再选择「小说模式」；插件会把 .dsh/ 写入该目录」**; (b) in `apply()`, before materializing, if no `novel/` dir exists and the cwd looks non-empty/non-project, at minimum skip the silent copy and let the routing section (G1) ask the user to open a project folder. Cheapest safe version: gate `materialize()` on `existsSync(join(root,'novel')) || isEmptyDir(root)`, else no-op with a one-line generic status. (c) Document that the copy is silent in the README.

### G3b — MEDIUM-HIGH: the materialized `AGENTS.md` is stale and misleading
- **Evidence:** `assets/.dsh/AGENTS.md:14-17` — "本根目录下暂为空，实际项目在 `archive/*` 与 `new/` 子目录… ⚠️ 本根目录**没有** `novel/` 目录"; `:65` points to `.codebuddy/rules/script-execution.mdc` (not shipped). This file is materialized into `<project>/.dsh/AGENTS.md` and this harness surfaces `.dsh/AGENTS.md` as additional instructions for work under that dir (observed directly in this session).
- **User impact:** the model is told the user's project has no `novel/` and that real projects live in `archive/*` / `new/` — false for every new install. It may search non-existent folders or advise the user to create `new/`. Also `:11` says "20 个脚本" and `:21` says "DSH 没有自定义斜杠命令", both inherited from the source repo rather than this plugin.
- **Minimal fix:** replace `assets/.dsh/AGENTS.md` with a **plugin-specific, cwd-agnostic** version: keep the useful parts (PowerShell `-File` rule, three-digit chapter dirs, subagent whitelist, writing iron rules), and replace lines 14-17 with **「本项目根目录下的 `novel/` 即当前小说工程；`.dsh/` 为本模式的工作副本，由插件维护，请勿手工修改。」** Point rule references to `.dsh/rules/*.mdc` (which *are* shipped: `assets/.dsh/rules/`). Update the script count to 21.

### G4 — HIGH: bootstrap branch choice is never shown to the user
- **Evidence:** `orchestrator.js:316-318` (`plan` → `options`), `index.js:171-181` (`publicPlan` forwards `options` in JSON only), `index.js:252-262` (`render()` ignores `options`), no `ask-user` / `followup` / `inject` calls anywhere (grep). `LIVE-VERIFICATION.md:16,19`: `start` → `阶段：bootstrap · 就绪`, then the live operator had to *know* to call `select-branch (constitution)` (`LIVE-VERIFICATION.md:20`).
- **User impact:** the three bootstrap branches (从零建宪法 / 拆书换皮 / 导入已有书稿) are a required user decision, but the user sees only `阶段：bootstrap · 就绪` and is never asked. Dead end: no question, no menu, no "what should I type?". The internal codes `constitution/disassemble/import` are never explained in user-facing copy.
- **Minimal fix:** make the bootstrap step explicitly interactive. Cheapest: in the routing section (G1) add the exact question text, and have the model use the already-mounted `tool-ask-user` (`cordis.patch.yml:90-91`) with options:
  ```
  你想怎么开始？
  A) 从零搭建（引导设定世界观/角色/风格）
  B) 拆书仿写（提供一本书或番茄小说链接，提炼骨架再换皮）
  C) 导入已有书稿（已有章节/设定文档，接入工作流继续写）
  ```
  map A/B/C → `select-branch` `constitution`/`disassemble`/`import`. Additionally, render `next.options` as friendly labels in `render()` when `stage==='bootstrap'` (one `if` block). Either fix alone removes the dead end; doing both is best.

### G5 — HIGH: the 4 status tokens are not actionable and two are misleading
Per-token verdict (user is a first-timer, zh UI):

| Token (`index.js:71-72`) | Shown when (`index.js`) | Understandable? | Problem |
|---|---|---|---|
| `就绪` / Ready | `statusOf` default: `idle`, **`running`**, **`retrying`** (`:134-139`); `LIVE-VERIFICATION.md:16,19` | ❌ ambiguous | Means "ready/waiting" but is shown while the engine is **actively running** and while it is **retrying a failed gate**. User can't tell "working" from "waiting for me". |
| `已保存进度，可继续` / "Progress saved, you can continue" | `paused/failed/blocked` (`:136`), `TRANSITION_REJECTED` (`:364`), `DISPATCH_REJECTED` (`:298`), `ADJUDICATION_FAILED` (`:354`), gate retries (`:321`) | ❌ false promise | Says "可继续" but gives **no continue action** and no reason. Covers both transient retry and terminal block identically. In the missing-`pwsh` case the gate can *never* pass — "可继续" is simply untrue. |
| `正在恢复，请稍候` / "Recovering, please wait" | `recovered` (`:137` — corrupt checkpoint) AND `GATE_DEGRADED` (`:321`) | ⚠️ half-true | Correct for checkpoint corruption (auto-recovery really happens). For a degraded gate there is **no automatic recovery** — the user waits for something that won't arrive. |
| `工作流暂不可用，请稍候` / "unavailable" | `NO_SESSION` (`:272`), catch-all `ENGINE_UNAVAILABLE` (`:378`) | ❌ false reassurance | "请稍候" implies it will come back by itself; a missing `assets/` dir or a persistent error will not. |

- **User impact:** on **every** failure/degraded path the user gets a generic token with zero actionable information, and the deliberate "no errors, no internals" design (`README.md:25`) means there is also no *friendly* hint. Combined, the user cannot recover without reading the source. This is the "DEGRADED gate pausing with no next action" dead end from the brief, confirmed.
- **Minimal fix (keeps the no-leak guarantee):** add a **5th, actionable token** and use it for the cases that need user action, e.g.
  ```js
  zh: { ..., needSetup: '需要准备运行环境，请查看安装说明' , needChoice: '请选择开始方式' }
  en: { ..., needSetup: 'Setup required — see the install guide', needChoice: 'Please choose how to start' }
  ```
  - bootstrap → `needChoice`; `GATE_DEGRADED` / `ENGINE_UNAVAILABLE` / `NO_SESSION` → `needSetup` (not `recovering`/`unavailable`); keep `recovering` only for genuine `recovered`.
  - `running` → a distinct `进行中` / "In progress" instead of `就绪`; `retrying` → `正在重试` / "Retrying".
  - Add one sentence to `INSTALL.md` §主机先决条件: **「若状态显示『需要准备运行环境』，请确认已安装 PowerShell 7（`pwsh --version`）与 Python 3.7+，然后重启 dsh。」** No script names, stderr, exit codes or paths leak — only a classified, friendly action.

### G6 — MEDIUM: raw internal stage/step ids leak into the user-visible line
- **Evidence:** `index.js:256-259` renders `阶段：${stage}` / `步骤 ${batchStep}` / `第 ${chapter} 章` verbatim; ids defined at `orchestrator.js:42-44,53-69`. The README's own example shows the user `阶段：constitution · 就绪 → 阶段：write · 第 1 章 · 就绪` (`README.md:67`, `README.zh.md:60`). `LIVE-VERIFICATION.md:23` shows `batch · 第 15 章 · 步骤 D4`.
- **User impact:** a Chinese first-timer reads `阶段：disassemble · 步骤 D4 · 已保存进度，可继续` — untranslated English/internal jargon. `README.md:25`'s "Only generic localized status tokens — never internals" is only half true: the status *word* is localized, the stage/step labels are not.
- **Minimal fix:** add a small label map in `render()` (~20 lines), e.g.
  ```js
  const STAGE_ZH = { bootstrap:'准备', constitution:'设定宪法', disassemble:'拆书换皮', import:'导入书稿', outline:'大纲', design:'章节设计', write:'正文写作', validate:'校验', batch:'批量写作', export:'导出', done:'完成' };
  const STEP_ZH  = { O:'补纲', O1:'大纲评审', O2:'大纲回修', A0:'上下文包', A:'设计稿', A1:'设计校验', A2:'设计评审', B:'正文', B2:'后处理', C:'正文校验', D1:'摘要', D2:'摘要校验', D3:'状态同步', D4:'连续性评审', E:'进度保存' };
  ```
  plus an EN twin keyed by `locale` (the tool already has `args.locale`, thread it into `render` via the output value, e.g. include `locale` in the returned object). Render `阶段：设定宪法 · 第 1 章 · 就绪`.

### G7 — MEDIUM: missing `pwsh` does not produce the documented DEGRADED/"正在恢复" path, and neither path helps the user
- **Evidence:** `README.md:77-78` / `README.zh.md:68-69` promise "若缺少 `pwsh`，门禁会记为 `DEGRADED` 并**暂停**运行". `orchestrator.js:703-730`: DEGRADED is returned only when `io.spawnSync` is absent (`:705-708`) or *throws* (`:727-729`). In the real Host, `createIo` always provides `spawnSync` (`index.js:127`); a missing binary yields ENOENT with `status:null`, so `code` is computed as **1** → `status:'FAIL'`, `skipped:false` (`:717-726`). Runtime probe (this session): `spawnSync('dsh-no-such-binary-xyz', …)` → `status=null, exitCode=undefined, error.code=ENOENT`, and the engine's classification is `code=1 ⇒ FAIL`, **not DEGRADED**.
- **User impact:** the documented behavior is not what happens; the user instead sees `已保存进度，可继续` (G5) with retries that can never succeed, and never learns "install PowerShell 7". The DEGRADED/`正在恢复，请稍候` token is effectively unreachable for the realistic missing-binary case. (Classifying ENOENT as DEGRADED is an architecture/classification concern — noted here only for its *usability* consequence, and cross-referred to ANGLE A.)
- **Minimal fix:** (a) in `runGate`, treat `result.error` (ENOENT) as a classified `DEGRADED` with `ok:false, reason:'runner-unavailable'`; (b) regardless, map that verdict to the friendly `needSetup` token from G5 and add the `pwsh --version` hint in `INSTALL.md`. Do **not** surface `pwsh`/ENOENT text to the user — only the generic actionable token.

### G8 — MEDIUM: resume after restart has no discovery affordance
- **Evidence:** durable checkpoint is real and good (`orchestrator.js:228-272`, `LIVE-VERIFICATION.md:31-42`). But `statusOf` maps a `running` state to `就绪` (`index.js:134-139`), and there is no prompt section / command / followup (G1) to call `resume` or `status` in a new session. `README.zh.md:64-65` promises "回来仍从第 47 章继续".
- **User impact:** after restarting dsh, the user sees nothing indicating an unfinished run; if they type a new request, `start` is rejected from a `running` checkpoint and they get `已保存进度，可继续` (`LIVE-VERIFICATION.md:17`) — again with no "how". Resumable work is indistinguishable from a fresh idle session.
- **Minimal fix:** in the routing section (G1) add **"每个新会话先调用 `novel_orchestrate(action:'status')`；若返回的 `state.status` 非 idle/done，先调用 `action:'resume'` 再继续，不要重新 `start`."** Optionally add `resumed:'已恢复进度，继续写作'` to `STATUS_TEXT` and set `recovered`-style flag on a real resume. One line of copy + one routing sentence.

### G9 — LOW-MEDIUM: uninstall / upgrade leaves `.dsh/` behind; stale assets persist
- **Evidence:** `INSTALL.md:69` gives `dsh plugin … remove` / `remove_bundle` but no cleanup note. `materialize()` never overwrites (`index.js:100` `kept += 1`), so an upgraded plugin keeps the old `.dsh/scripts/` and `.dsh/skills/`; the checkpoint lives in the same `.dsh/state/` (`orchestrator.js:134-135`).
- **User impact:** a user who tries then uninstalls keeps a large hidden `.dsh/` + `.dsh/state/novel-mode.checkpoint.json` with no explanation; a user who upgrades silently runs old scripts/old skill text against the new engine.
- **Minimal fix:** add to `INSTALL.md` §卸载: **「卸载不会删除已生成的 `.dsh/` 工作副本与 `.dsh/state/novel-mode.checkpoint.json`，也不会删除你写出的 `novel/` 正文。若要彻底清理，请手动删除项目目录下的 `.dsh/state/` 与（确认不需要正文后）`novel/`。升级插件后如需更新工作副本，先删除 `.dsh/` 再重选模式（正文不会受影响）。」**

### G10 — MEDIUM: 3 skill catalog descriptions parse as a bare `|` / `>`; 11 internal/optional skills clutter the `/` menu
- **Evidence:** `index.js:81-85` `descriptionFromFrontmatter()` uses `/^description:\s*(.+)$/m`; for block-scalar frontmatter it captures only the indicator. Runtime probe (this session) on the shipped files: `Humanizer-zh` → `"|"`, `novel-downloader` → `">"`, `site-fanqie` → `">"`, while `novel-write` → correct Chinese text. Since `description` is non-empty, the `SKILL_DESCRIPTIONS` fallback (`index.js:192`) is **not** used for those three. Separately, `ENGINE_CONTROLLED_SKILLS` (`index.js:43`) hides only `novel-batch`/`novel-write` from the user `/` menu — all **9 `agent-*`** skills remain `userInvocable:true` (`index.js:198`) with English "Subagent role: …" descriptions, plus the two credential-requiring external-site skills (`site-fanqie`, `novel-downloader`).
- **User impact:** if the catalog surfaces `description`, three skills show a literal `|` / `>`. The `/` menu shows 19 entries including 9 internal worker roles a user must never invoke manually and 2 optional network/credential integrations — confusing for a first-timer and invites misuse (invoking `agent-batch-designer` directly bypasses the engine's gates).
- **Minimal fix:** (a) tighten `descriptionFromFrontmatter` to reject bare indicators: `return value && value.length > 0 && !/^[|>]$/.test(value) ? value : fallback;` (one line); (b) set `userInvocable:false` for all `agent-*` skills (and the two optional integrations, or move them behind an explicit opt-in): `invocation: { modelInvocable:true, userInvocable: !(ENGINE_CONTROLLED_SKILLS.has(skill) || skill.startsWith('agent-') || skill==='site-fanqie' || skill==='novel-downloader') }`. `whenToUse` (the curated Chinese one-liners, `index.js:45-67`) stays intact and is good.

### G11 — LOW: `locale` is model-supplied, default `zh`; English-UI users get Chinese tokens
- **Evidence:** `index.js:266` `const locale = args?.locale === 'en' ? 'en' : 'zh';` — the tool's `locale` param (`index.js:233`) is supplied by the model, not derived from the GUI locale; no code reads `ctx.locale`. `render()` (`index.js:256`) is hardcoded Chinese (`阶段：` / `第 … 章` / `步骤`) even for `locale:'en'`.
- **User impact:** an English-UI user sees `阶段：constitution · 就绪` — a Chinese frame around an English status word. Inconsistent with the bilingual README/locale files.
- **Minimal fix:** have the Host half read the Client locale service (`ctx.get('locale')`) or accept a preset-level default; at minimum, pass `locale` through into the returned value and make `render()` use `locale==='en' ? 'Stage: ' : '阶段：'`, `'Chapter ' : '第 '`, `'Step ' : '步骤 '`. Combine with G6's label maps (EN twin).

### G12 — LOW: skill `whenToUse`/`description` are helpful overall, but the 9 workflow skills describe a *manual* invocation model that the engine no longer uses
- **Evidence:** `index.js:45-54` descriptions say e.g. "Write one chapter: … Step 9 调 continuity-validator", "Unattended batch writing for a chapter range …", and `assets/.dsh/skills/*/SKILL.md` bodies contain `/novel-write 15` examples; `assets/.dsh/AGENTS.md:21-37` maps "原命令 → 现技能" and says "或在输入框里输入 `/` 后点选技能名" — a workflow the v2.0.0 engine replaced with tool-call orchestration (`CHANGELOG.md:38-39`).
- **User impact:** a curious user who opens a skill sees instructions to type `/novel-design all` / `novel-write 15` — which no longer drive the engine and, for `novel-write`/`novel-batch`, are intentionally hidden from `/` (`index.js:43`). Mixed mental models.
- **Minimal fix:** not urgent (the engine hides the two risky ones), but if G10's menu cleanup lands, add one line to each workflow skill's frontmatter: **「本技能由 novel_orchestrate 引擎按阶段调度；请勿手动调用。」** to prevent confusion.

---

## 4. What is GOOD (verified, keep it)

- **Install documentation is the strongest surface.** `market/INSTALL.md` covers 3 install methods, the required `<profile>` (`:25`), pinning a commit (`:36-37`), the Windows `&`-in-URL pitfall (`:40`), restart requirement (`:41`), local absolute-path install (`:43-57`), a verification command (`:64`), `engines.dsh` (`:15`), and an explicit uninstall command (`:69`). Genuinely first-timer-friendly.
- **`market/SUBMISSION_STEPS.md` is honest and precise** about what was automated vs. the human fork→PR fallback (`:9-30`, `:34-49`), the 1-day CI age gate (`:18`), and the format-1 index being a *read-side* distribution path, not the submission channel (`:53-56`). No manufactured claims.
- **Bilingual, consistent READMEs** (`README.md` / `README.zh.md`) with honest "verified against the shipped tree" asset counts (`:47-49` / `:41-43`), an explicit no-credentials privacy section (`:99-106` / `:89-94`), and a clear "Why it is different" comparison table. The capability screenshot is referenced (`README.md:15`).
- **Preset display copy is clear:** `cordis.patch.yml:23` is a good one-line Chinese description of what the mode does; `locale/{zh,en}.json` both provide `meta.title` + `meta.description`.
- **The no-leak design is a real strength:** `publicState()` (`index.js:146-156`), `publicGate()` (`:159-168`), `publicPlan()` (`:171-181`) and the catch-all (`:375-379`) ensure no stderr, script path, exit code, exception or prompt text reaches the user. `render()` is bounded and structured (`:252-262`). `LIVE-VERIFICATION.md:27-29` confirms this on the live runtime.
- **Corrupt-checkpoint recovery is automatic and safe** (`orchestrator.js:228-255`): backs up, rebuilds, records a classified `DEGRADED` log — no user action, no data loss. Same for atomic `saveState` (`:259-272`).
- **Non-overwriting materialization** (`index.js:100`) never clobbers existing files — safe for a user with an existing project (the flip side is G9, a documentation fix).
- **Tool schema is well-typed and model-friendly** (`index.js:207-236`): `enum` actions, integer `chapter 1..99999`, structured `verdicts` with `evidenceRefs`, `additionalProperties:false`, clear per-field descriptions. `SKILL_DESCRIPTIONS` (`index.js:45-67`) are 21 genuinely helpful one-line `whenToUse` hints (the `description` parsing defect G10 is narrowly scoped to 3 block-scalar files).
- **`docs/LIVE-VERIFICATION.md` is candid** about what remains external (clean-profile GUI, live LLM multi-chapter worker — `:55-61`) rather than overclaiming. The changelog documents the real dropdown-visibility defect and its fix (`CHANGELOG.md:3-17`).

---

## 5. What I could NOT verify (GUI / live model — do not treat as confirmed defects)

- **Actual dropdown rendering in a fresh profile.** `LIVE-VERIFICATION.md:60` marks AC-45 (clean-profile GUI dropdown) as *partially closed / pending*; `CHANGELOG.md:16-17` says the fix was verified on this machine. I could not restart the Host or open the GUI, so I cannot confirm the entry appears for a brand-new profile. G2 is therefore a **documentation contradiction + likely** first-run failure, not an observed one.
- **Whether `render()` output is visible as chat text** or only as a tool-call chip, and how the GUI localizes it. All "the user sees `阶段：…`" statements come from `index.js:252-262` and the `LIVE-VERIFICATION.md` transcripts; the actual visual treatment is unknown. If tool results are collapsed, G4/G6 become **even more** severe (the user sees *nothing*).
- **Whether a real model reliably calls `novel_orchestrate`** on a typed sentence, and whether it chains actions. `LIVE-VERIFICATION.md:59` marks AC-38 (real-model ≥3 chapters) pending; no live LLM worker test exists. G1 is proven as *"no code path steers it"*, not as *"the model definitely never calls it"* — a capable model may still discover the tool from its description. The absence of a guarantee/routing instruction is the confirmed defect.
- **Whether the `/` menu displays `description` or `whenToUse`.** If it uses `whenToUse` (the curated map), G10's `|`/`>` defect is cosmetic-only; if `description`, it is user-visible. Either way the one-line fix is correct.
- **Whether this harness auto-injects the materialized `.dsh/AGENTS.md`** for a user's project. It did in this session (`<system-reminder>` from `novel-mode-plugin/assets/.dsh/AGENTS.md`), which is why G3b is credible, but I did not observe it in a fresh install scenario.
- **DEGRADED-vs-FAIL classification for missing `pwsh`** was probed at the `spawnSync`/`runGate` level (ENOENT → `code=1`), not through a full live Host session with `pwsh` actually uninstalled. Cross-referred to ANGLE A for the classification question; the usability conclusion (generic token, no actionable hint) holds either way.

---

## 6. Prioritized fix list for lead (smallest effort → biggest UX gain)

| # | Fix | Effort | Removes |
|---|---|---|---|
| 1 | G2 — README: "refresh" → "restart dsh" + fallback hint | 2 lines | install dead end |
| 2 | G5 — add `needChoice` / `needSetup` / `进行中` tokens + the `pwsh --version` hint in INSTALL.md | ~6 lines + 1 doc line | all 4-token confusion, degraded dead end |
| 3 | G1 — short `systemPrompt.section` routing rule + soften README's "engine takes it from there" | ~10 lines + copy edit | **the core first-run dead end** |
| 4 | G4 — ask-user branch question (A/B/C → select-branch), render `next.options` | ~10 lines | bootstrap dead end |
| 5 | G6+G11 — STAGE/STEP label maps (zh+en) in `render()` | ~25 lines | internal jargon / locale mismatch |
| 6 | G3+G3b+G9 — INSTALL.md "open a project folder first" + rewrite `assets/.dsh/AGENTS.md` + uninstall/upgrade cleanup note | doc + 1 file | cwd pollution, stale instructions, leftovers |
| 7 | G8 — routing sentence "start each session with `status`/`resume`" | 1 line | resume discovery |
| 8 | G10 — reject `|`/`>` descriptions; hide 9 `agent-*` skills from `/` | 2 lines | menu clutter / broken descriptions |
| 9 | G7 — classify ENOENT as DEGRADED (architecture-owned, coordinate with ANGLE A) | 1 line | doc/behavior mismatch |

**Bottom line:** the engine and the install docs are solid; the *product surface* (trigger, first question, status vocabulary, stage labels, prerequisite hints) is what stands between this build and "very usable". Items 1–5 are all small, additive, and do not touch `lib/orchestrator.js`.

---

*Cross-review note:* G1/G4/G8 overlap with ANGLE A's "tool-call driven" finding (`ARCHITECTURE.md:8-18`) — I reviewed that from the user's perspective only; G7's ENOENT→FAIL vs DEGRADED classification is explicitly deferred to ANGLE A. G3b/G9/G10 overlap with ANGLE C/E (leftover `.dsh/`, optional external skills, stale AGENTS.md) — I kept those to their usability consequences to avoid duplicating their findings.
