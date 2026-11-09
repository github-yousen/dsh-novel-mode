# 小说模式（Novel Mode）插件 — 发布与投稿渠道研究

> 研究者：publishing-researcher（task-3）
> 采样时间：2026-11-09 ~21:42 +08:00（Asia/Shanghai）；补充修订 21:47（lead 反馈 + 仓库年龄证据）
> 范围：**仅研究，不推送、不发布、不开 PR**。本文只写入 `novel-mode-plugin/docs/publishing-research.md`。
> 所有 web 内容均为外部不可信数据，仅作证据，已标注 URL。

---

## 0. 结论速览（TL;DR）

| 问题 | 结论 |
|---|---|
| 目标开源仓库 | **尚未存在专用仓库**。GitHub 账号为 `github-yousen`。**修订推荐（见 §1.5）**：优先把插件作为子目录放入**已存在且已满 1 天**的 `github-yousen/novel`（首次提交 2026-02-26，分支 `master`）或 `github-yousen/skills`（2026-05-12，分支 `main`），以绕过 CI 的「仓库创建满 1 天」门槛；若用户坚持独立仓库，则新建 `github-yousen/dsh-novel-mode` 并接受 ~1 天延迟。 |
| Git 推送可行性 | **可行**。SSH 认证成功（`Hi github-yousen! You've successfully authenticated`），HTTPS 也通。但 `gh` CLI 未安装、`GITHUB_TOKEN`/`GH_TOKEN` 为空，所以**无法用 API/CLI 自动开 PR**，只能 `git push` 到自己的仓库/分支。 |
| DSH 市场投稿渠道 | **不是给 `dsh-market/dsh-market` 提 PR**。实际目录在 `awesome-dsh-plugin/awesome-dsh-plugin`，通过 PR 在 `data/plugins/<owner>__<repo>.yml` 增加**一个 YAML 文件**；合并后站点与 dshmarket 自动收录（通常一天内）。 |
| 能否自动完成市场投稿 | **不能直推**：用户对 `awesome-dsh-plugin/awesome-dsh-plugin` 无写权限（无 fork、无 token、无 gh）。可做到的是：推送到自己仓库 + 生成**可直接提交的 YAML 条目和 PR 文案**，由用户在 GitHub 网页端 fork 后粘贴提交。 |
| npm publish | **当前不可行**：`npm whoami` → `ENEEDAUTH`，无 `NPM_TOKEN`/`NODE_AUTH_TOKEN`。且收录**不要求** npm 包。 |
| format-1 索引 | `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` 与 `https://awesome-dsh-plugin.com/plugins.json` 均可访问（HEAD 200）；本机 `plugin_market list_indexes` 为空，该 URL 未配置为索引源，故 `plugin_market list_plugins` 报 "Not a configured index source"。这是**读取侧索引**，不是投稿入口。 |

---

## 1. 用户 GitHub 与目标仓库（精确信息）

### 1.1 认证与身份证据（不含任何密钥值）

| 项目 | 结果 | 证据 |
|---|---|---|
| git 版本 | `git version 2.20.1.windows.1`（较老，不支持 `git branch --show-current`） | `git --version` |
| `user.name` / `user.email` | `'yousen'` / `'2540462586@qq.com'`（配置文件里含单引号字符，原样记录） | `git config --get user.name/user.email`，`ConvertTo-Json` 复验得 `"'yousen'"`、`"'2540462586@qq.com'"` |
| SSH 认证 | **成功**：`Hi github-yousen! You've successfully authenticated, but GitHub does not provide shell access.`（退出码 1 是 GitHub 拒绝 shell 的正常表现，非认证失败） | `ssh -o BatchMode=yes -o ConnectTimeout=5 -T git@github.com` |
| SSH 密钥 | 存在 `~/.ssh/id_ed25519(.pub)`、`id_rsa(.pub)`、`config`、`known_hosts`（仅列名，未读取内容） | `Get-ChildItem ~/.ssh` |
| SSH config | 只有 `Host MyCar → 192.168.1.102 / agilex`，**没有 github.com 特殊配置**，走默认 `git@github.com` | `~/.ssh/config` |
| `gh` CLI | **未安装** | `Get-Command gh` 为空 |
| `gh auth status` | 跳过（无 gh） | — |
| Token 环境变量 | `GITHUB_TOKEN`、`GH_TOKEN`、`GH_ENTERPRISE_TOKEN`、`GH_HOST`、`GH_REPO`、`GIT_ASKPASS` **全部为空** | 仅输出 presence/长度，未打印值 |
| npm 认证 | **未登录**：`npm whoami` → `ENEEDAUTH` | `npm whoami` |
| npm token 环境变量 | `NPM_TOKEN`、`NODE_AUTH_TOKEN`、`NPM_CONFIG_USERCONFIG` **全部为空**；用户 `~/.npmrc` 仅有 `registry` 键 | 仅输出键名，未打印值 |
| git 全局其他配置 | `http.sslverify=false`、`http.postbuffer=524288000`、`http.lowspeedlimit=0`、`http.lowspeedtime=999999`；无 `credential.helper` | `git config --global --list` |

> 说明：`git config --global --list` 中未出现任何 `remote.*.url` 或 token；所有 remote 都是仓库局部 `.git/config`。未打印任何凭据值。

### 1.2 工作区 git 仓库清单（`D:\yousen`）

**`github-yousen`（用户自己的账号）名下的仓库**（均为 `origin`）：

| 本地路径 | remote URL | 默认分支 | tracking | 备注 |
|---|---|---|---|---|
| `D:\yousen\novel` | `git@github.com:github-yousen/novel.git` | `master` | `master...origin/master` | **插件素材来源**（`.codebuddy`/`.dsh` 工作流、技能、命令、脚本在此）。有未提交改动：`.gitignore`、一个角色 md。 |
| `D:\yousen\skills-yousen` | `git@github.com:github-yousen/skills.git` | `main` | `main...origin/main` | 用户自有技能集合（含 `site-fanqie`、`novel-downloader`、`Humanizer-zh` 等目录）；**不是 DSH 插件包**（无根 `package.json`/`cordis.patch.yml`，只有 `site-fanqie/package.json`）。 |
| `D:\yousen\Personal` | `git@github.com:github-yousen/personal.git` | `main` | `main...origin/main` | 个人资料；内含 `AI`、`resume` 两个嵌套 `.git`。 |
| `D:\yousen\github\agent-harness-comparison` | `https://github.com/github-yousen/agent-harness-comparison.git` | `master` | `[behind 9]` | 对比研究仓库。 |
| `D:\yousen\github\interview-prep` | `git@github.com:github-yousen/interview-prep.git` | `main` | `[ahead 1]`，有改动 | 面试准备。 |
| `D:\yousen\github\resume` | `git@github.com:github-yousen/resume.git` | `master` | `master...origin/master` | 简历。 |
| `D:\yousen\github\teachpi` | `git@github.com:github-yousen/teachpi.git` | `main` | `main...origin/main` | 教学项目。 |

**第三方 / 官方仓库（仅克隆，非投稿目标）**：`github/*` 下还有 `aircrack-ng`、`codex`（gh-proxy）、`deepseek-harness`（`ssh://git@github.com/deepseek-ai/deepseek-harness.git`）、`fluxion`、`grok-build`、`grok-cli`、`hashcat`、`hermes-agent`、`Humanizer-zh`（op7418）、`pi`、`reaver-wps-fork-t6x`、`skills`（anthropics）、`wifite2`、`ZCode` 等；`D:\yousen\.dsh\dsh-recent` → `https://github.com/deepseek-ai/deepseek-harness.git`。其中 `deepseek-harness` 是 DSH 本体的本地 checkout，可作为插件 API 参考，但不是投稿目标。

**`D:\yousen\packages/*`**：`dsh-codebuddy-models`、`dsh-delegation-advisor`、`dsh-web-research` 三个本地插件包（`@local/*`，见 `plugin_manager list_bundles`），**均无独立 `.git`**（未推送到任何仓库）。它们证明用户已有本地 DSH 插件开发习惯，但不构成现成的开源发布目标。

### 1.3 是否已有插件 / 市场索引仓库？

- **没有**：工作区浅层（depth ≤ 2）未发现 `index.json` / `plugins.json` / `catalog.json` / `*.market.json` 形式的市场索引文件；全量搜索命中的都是第三方项目里的测试数据（opencode fixture、`catalog.json` 实验数据、node_modules 内 `@babel/compat-data/plugins.json` 等），**与 DSH 市场无关**。
- **`plugin_market list_indexes` → `{"indexes":[]}`**：本机没有配置任何插件市场索引源（这解释了 §4 的报错）。
- **候选目标 repo 名探测**（`git ls-remote --heads git@github.com:github-yousen/<name>.git`，只读）：`dsh-novel-mode`、`novel-mode-plugin`、`dsh-plugin-novel-mode`、`dsh-novel`、`novel-mode`、`dsh-plugins`、`awesome-dsh-plugin` **全部 NOT FOUND**。`github-yousen/awesome-dsh-plugin`（fork）**也不存在**（`Repository not found`）。
- GitHub REST API 查询 `users/github-yousen/repos` 与 `repos/awesome-dsh-plugin/awesome-dsh-plugin` 均返回 `API rate limit exceeded`（出口 IP 13.230.26.192 未认证限额耗尽），因此**无法用 API 枚举账号全部仓库**；上述结论基于本地 remote + 只读 `ls-remote` 探测。
- `https://github.com/github-yousen/skills.git` 的 HTTPS `ls-remote` 成功（返回 `refs/heads/main`），确认该账号两种传输都可用。
- `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin.git` 的 HTTPS `ls-remote --heads` 成功，返回 `refs/heads/main` @ `668c3fa6...`（只读可达，见 §2）。

### 1.4 目标仓库推荐（经 lead 反馈与仓库年龄证据修订）

**修订后的推荐：优先复用已存在且「已满 1 天」的用户仓库作为 monorepo 子包，而不是新建仓库。**

原因（lead 提出，本地证据确认）：`contributing.md` 的 CI 会检查**仓库创建满 1 天**；若新建仓库，投稿 PR 无法立即合并，需等 gate 自动重跑（约 24h）。而 `github-yousen/novel`、`github-yousen/skills` 都是数月前的老仓库，天然满足该门槛。

本地 `git log --reverse`（首次提交，作为仓库年龄的下界代理；GitHub REST API 因 rate limit 无法取 `created_at`）：

| 仓库 | 首次提交 | 最后提交 | 提交数 | 年龄 |
|---|---|---|---|---|
| `github-yousen/novel` | 2026-02-26 14:20:03 +0800 | 2026-09-30 | 155 | ~8.5 个月 ✅ |
| `github-yousen/skills` | 2026-05-12 20:17:34 +0800 | 2026-10-15 | 47 | ~6 个月 ✅ |
| `github-yousen/agent-harness-comparison` | 2026-06-05 | 2026-06-05 | 4 | ~5 个月 ✅ |
| `github-yousen/interview-prep` | 2026-09-10 | 2026-09-16 | 21 | ~2 个月 ✅ |
| `github-yousen/teachpi` | 2026-08-20 | 2026-08-31 | 58 | ~3 个月 ✅ |
| `github-yousen/personal` | 2026-11-03 | 2026-11-09 | 14 | ~6 天 ✅（但为个人资料，语义不合） |

| 方案 | 评价 |
|---|---|
| **A′（修订推荐）插件作为 `github-yousen/novel` 的子目录** | 语义最贴（该仓库本就是小说工作流素材来源）、仓库已满 1 天、无未提交改动冲突需先处理（`.gitignore` 与一个角色 md 有本地修改，推送前需确认不误提交）。按 monorepo 规则：`url: https://github.com/github-yousen/novel/tree/master/novel-mode-plugin`、`name: github-yousen/novel#novel-mode-plugin`、YAML 文件名 `github-yousen__novel--novel-mode-plugin.yml`。**注意默认分支是 `master`**（非 `main`），URL 里必须写 `master`。见 §5 的 B 版条目草稿。 |
| **B′（次选）插件作为 `github-yousen/skills` 的子目录** | 分支 `main` 更主流、已满 1 天；但该仓库是通用技能集合，插件语义稍弱。条目 `github-yousen__skills--novel-mode-plugin.yml`。 |
| C 新建 `github-yousen/dsh-novel-mode` | 干净、独立、文件名 `github-yousen__dsh-novel-mode.yml`；但**触发 1 天年龄 gate**（PR 需等待），且无 token/`gh` 无法用 API 建仓，需用户网页端先建空仓库。若用户不介意一天延迟，这仍是长期最整洁的形态。 |

> ⚠️ 最终选哪个、子目录名、是否公开需**用户确认**；研究阶段不创建、不推送。若选 A′/B′，`package.json` 必须放在子目录里，`cordis.patch.yml` 与 `screenshots.json` 同目录。
>
> **子目录命名的一个风险点**：`contributing.md` 的 CI 说明写的是「从 root，或 `packages/` · `plugins/` · `apps/` 子包读取 `package.json`」，但 monorepo 规则又说「把 `url` 指向子目录」，且实取的 format-1 目录里确有 `directory: "core"`、`"integrations/deepseek-harness/dsh-plugin-mission-control"` 等**非三前缀**的条目（说明目录生成器能处理任意子目录）。两套说法不完全一致。为降低 CI 误判风险，若走 monorepo，建议把插件放在 **`packages/novel-mode-plugin/`**（或 `plugins/novel-mode-plugin/`）这类文档点名的前缀下，并让 `url` 指向它；`name` 用 `github-yousen/novel#packages-novel-mode-plugin`、文件名 `github-yousen__novel--packages-novel-mode-plugin.yml`。§5 的 A′/B′ 草稿用了较短的 `novel-mode-plugin/` 形式，落地时按此建议改前缀更稳妥。

### 1.5 仓库「满 1 天」CI 门槛的应对（lead 反馈项）

`contributing.md`：CI 第 3 项检查 **repo age ≥ 1 day**；`pr-body.md` 实例中作者自述「created 2026-11-03T11:51:02Z，so this is the only failing gate. Per the CI note it re-runs by itself and should clear in ~16h; no resubmission needed」。即：

- 新建仓库 → PR 的 `Submission gate` 先红，但**无需重新提交/推空提交**，gate 结论是快照、过期会自动重跑；约 1 天后自动转绿，再进入人工评审队列。
- 复用老仓库（`novel` / `skills`） → 该 gate 直接通过，可立即进入 `awesome-lint` 与人工评审，节省约一天。
- 无论哪种，PR 合并后还有「站点自动重建 + dshmarket 通常一天内收录」的固有延迟，所以总上线时间差约一天。**若时间不敏感，新建独立仓库（C）更整洁；若希望尽快收录，走 A′/B′。**
- 注意 CI 还检查 `dsh.bundle`（从 repo 的 `package.json` 读取，monorepo 也支持子包）、`awesome-lint`、README 再生成一致性；这些与仓库年龄无关，构建阶段就要满足（见 §6 给构建者的要点）。

---

## 2. DSH 插件市场（dshmarket）的真实投稿渠道

### 2.1 本机安装的 dshmarket

- 来源：`plugin_manager list_bundles` → `dshmarket@1.73.16`，`availability: profile`，`installed: true`，`enabled: true`，`source: dshmarket@1.73.16`，描述为「Visual plugin market inside DeepSeek Harness …」。
- 安装位置：`C:\Users\altria\.dsh\profiles\desktop\node_modules\dshmarket`（`DSH_PROFILE_DIR` 对应 `desktop` profile）。
- `package.json`：`repository` = `git+https://github.com/dsh-market/dsh-market.git`，`homepage` = `https://dshmarket.com`，`license` = MIT，`dsh.bundle.patch` = `./cordis.patch.yml`，`publishConfig.registry` = `https://registry.npmjs.org/`。
- `scripts.snapshot` 明确指向 `https://awesome-dsh-plugin.com/plugins.json` 与 `readmes.json`。

### 2.2 提交入口（决定性证据）

`dshmarket/README.md` **第 134–136 行**（"Submit your plugin"）与 `README.zh.md` **第 124–126 行**（"提交你的插件"）：

> **This repo is the market app, not the catalog.** The plugin list comes from the curated [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) registry — to get your plugin listed in the market, open a PR **there** (one entry in the list; the site and this market pick it up automatically, usually within a day). Please don't PR plugin entries against this repo.

即：

- **不要**向 `dsh-market/dsh-market` 提插件条目（该仓库 README 的 "Submit your plugin" 也重申；其 issues 只收 bug，roadmap 收功能建议）。
- **要**向 **`https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`** 提 PR。
- `dshmarket` 运行时读取的目录：`lib\regions.js` 中 `CATALOG_OFFICIAL = 'https://awesome-dsh-plugin.com/plugins.json'`（第 83 行），China 区域还会先读 npm 包 `dsh-plugin-catalog`（第 100、125 行）。`lib\routes.js` 第 7334–7336 行确认安装来源必须命中 curated registry（`not in curated registry: …` 会被拒绝），`README` "Security" 段亦写明「Installs are restricted to sources listed in the curated awesome-dsh-plugin registry」。

### 2.3 市场与目录的相关 URL（均验证可访问 / 存在）

| 用途 | URL | 验证 |
|---|---|---|
| 投稿目标仓库 | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin | 页面 200；`ls-remote` 得到 `refs/heads/main`；24k stars / 7.6k forks / 626 open PRs（页面快照） |
| 实时目录 JSON | https://awesome-dsh-plugin.com/plugins.json | HEAD 200 |
| format-1 索引（npm CDN） | https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json | HEAD 200；`web_fetch` 返回 `{"format":1,...}` 与 `plugins[]` |
| format-1 索引（GitHub Pages 副本） | https://awesome-dsh-plugin.com/index.json 、https://dshmarket.com/index.json | HEAD 200 |
| 贡献指南 | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md （CDN 镜像：https://cdn.jsdelivr.net/gh/awesome-dsh-plugin/awesome-dsh-plugin@main/contributing.md） | CDN 200，取得全文 |
| PR 模板示例 | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/pr-body.md （CDN 镜像同路径） | CDN 200，取得全文 |
| 市场 App 仓库（**非投稿目标**） | https://github.com/dsh-market/dsh-market | 页面 200；MIT；95 issues / 4 PRs |
| 市场官网 | https://dshmarket.com | README 声明 |
| 第三方目录（补充，非官方投稿口） | https://github.com/LivXue/dsh-plugin-shop 、https://dsh-plugin.org/ | 页面 200；前者为自动采集 npm/GitHub `dsh-plugin` 关键词的目录，后者称「tag your repo dsh-plugin to submit」。**仅作旁证，不作为主渠道** |

### 2.4 投稿格式（来自 contributing.md 全文）

**一个 PR 只加一个文件**：`data/plugins/<owner>__<repo>.yml`。两个 README 由脚本从 `data/plugins/*.yml` 生成，**不要手工编辑 README**（历史上因此产生大量冲突）。

```yaml
url: https://github.com/owner/repo        # 必须与仓库完全一致
name: owner/repo                          # 列表中的链接文字
category: ui                              # 见分类表
description:
  en: One-line description ending with a period.
  zh: 一句话描述，以句号结尾。              # 可选，维护者会补
# 可选：
icon: https://raw.githubusercontent.com/owner/repo/main/assets/icon-180.png
tarball: https://github.com/owner/repo/releases/latest/download/your-plugin.tgz
```

- **只有 `description.en` 必填**；含 `": "` 的描述必须加引号，否则 YAML 解析失败。
- 合法 `category`：`agi ui usage theme model identity session memory tools wsl browser vision voice docs skill workflow git notify dev security remote market fun`。小说模式最贴合 **`workflow`**（工作流与自动化），次选 `skill`；分类选错由维护者直接改，不会打回。
- 一个 PR 最多 3 条；monorepo 子包用 `url: .../tree/main/packages/xxx` + `name: owner/repo#subname`，文件名 `owner__repo--packages-xxx.yml`。

**CI / 人工评审硬性要求**（对插件构建方的约束，需转达 lead / 构建者）：

1. 仓库 `package.json` 必须声明 **`dsh.bundle`**（`{"dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}`），只写 `dsh.client` 会被拒；`cordis.patch.yml` 需含 `- insert: - id: ... name: ...`。
2. 仓库需有**真实可运行代码**，不接受占位/纯 README 仓库。
3. 仓库**创建满 1 天**（CI 自动检查，2026-11-09 新建的仓库需等到 11-10 之后才能过 gate；期间无需重新提交，gate 会自动重跑）。
4. 仓库需加 **`dsh-plugin` topic**。
5. 描述必须**与代码相符**，不得夸大、不用营销词；维护者会读源码逐条核对。
6. 官方 `@deepseek-ai/*` 包应放 `peerDependencies`（且 peer 范围需带显式预发布分支，否则 `ERESOLVE`）；纯聚合包（只有依赖清单）不单独收录。
7. 推荐（非必须）：发布 npm 包，或在 GitHub Release 附预构建 `.tgz` 并用 `tarball:` 指定（免 `allowBuilds` 构建授权）；`screenshots.json` 放**自己仓库**里声明 1–8 张 GitHub 托管图片。
8. 合并后网站自动重建，`awesome-dsh-plugin.com/plugins.json` 与 `dsh-plugin-catalog` 索引随之更新，dshmarket 通常**一天内**收录。

`pr-body.md` 提供了 PR 描述模板（复选框形式：一个文件、`dsh.bundle`、仓库满 1 天、分类、描述如实、`dsh-plugin` topic、插件功能说明）。

### 2.5 用户对该目录仓库的权限

- **无写权限**：`github-yousen/awesome-dsh-plugin`（fork）不存在（`ls-remote` → `Repository not found`），无 token、无 `gh` CLI，因此**不能**直接向 `awesome-dsh-plugin/awesome-dsh-plugin:main` 推送，也不能用 API 自动开 PR。
- 正确路径是 **fork → 新分支 → 提交一个 YAML 文件 → 网页端开 PR**（或由用户在网页端直接编辑 `data/plugins/...yml` 发起 PR，GitHub 会自动创建 fork 分支）。
- 该仓库有 626 个开放 PR，说明投稿走的就是社区 fork PR 流程。

---

## 3. 可自动化的程度（逐项判定）

| 动作 | 能否自动化 | 依据与限制 |
|---|---|---|
| `git push` 到用户自己的仓库（新建/已有） | ✅ **能**（只待用户确认仓库名与创建空仓库） | SSH 认证成功；HTTPS 亦通。需用户先在 GitHub 建空仓库（无 token/`gh`，不能用 API 建仓）。`git 2.20.1` 较老，避免 `branch --show-current`，用 `rev-parse --abbrev-ref HEAD`。 |
| 向 `awesome-dsh-plugin/awesome-dsh-plugin` 直推 | ❌ 不能 | 无写权限；应走 fork PR。 |
| 自动开 PR / issue（`gh pr create`、REST API） | ❌ 当前不能 | `gh` 未安装；`GITHUB_TOKEN`/`GH_TOKEN` 为空；REST API 未认证且已触发 rate limit（出口 IP 13.230.26.192）。 |
| `npm publish` | ❌ 当前不能 | `npm whoami` = `ENEEDAUTH`，无 `NPM_TOKEN`/`NODE_AUTH_TOKEN`。收录**不要求** npm 包，可用 GitHub Release tarball 替代。 |
| 生成可直接提交的 YAML 条目 + PR 文案 | ✅ **能，且是主要 fallback** | 见 §5。 |
| 生成 format-1 `index.json` 条目 / 私有索引 | ✅ 能（备选分发） | 若想自建索引，可按 `{"format":1,...}` 结构产出并托管；但本机 `plugin_market list_indexes` 为空，需用户手动在 **Plugins → Discover → Index sources** 添加 URL 才会生效。 |
| 验证目录 URL / 读取贡献指南 | ✅ 已完成 | 三个 catalog URL HEAD 200；contributing.md / pr-body.md 经 jsDelivr CDN 取得全文（`raw.githubusercontent.com` 在本环境 DNS 解析失败，用 CDN 镜像绕过）。 |

---

## 4. plugin_market / format-1 索引（读取侧，非投稿口）

- `plugin_market list_indexes` → `{"indexes":[]}`（本机未配置任何索引源）。
- 对 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` 调 `plugin_market list_plugins` → `Error: Not a configured index source: ...`。**原因**：该工具只接受「已配置的索引源」，与 URL 本身是否有效无关；URL 本身 HEAD 200 且 `web_fetch` 能取到完整 `format:1` JSON。
- `dshmarket/README.md` 第 14 行（中文第 14 行）明确：dsh 0.2.1+ 可在 **Plugins → Discover → Index sources** 添加 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`；宿主 Discover 页与 `plugin_market` 工具随后可搜索它。另有 Pages 副本 `https://awesome-dsh-plugin.com/index.json`、`https://dshmarket.com/index.json`（README 提示部分网络下会超过 dsh 给索引源的 15 秒超时）。
- 索引条目形状（从实取 JSON 摘要）：`{name, title, description:{zh,en}, homepage, repository:{url, directory?}, metadata:{category, keywords, labels, sortKeys}, versions:[{version, publishTimestamp, source:{type:"npm"}, engines:{dsh?}}]}`。顶级含 `format:1`、`title`、`description`、`metadata.categories`（含 `workflow` 等 23 类）、`labels`、`sortKeys`、`plugins[]`。
- 第三方文章 [Installing a Plugin in DeepSeek Harness: I Hit Three Walls](https://mings.in/en/posts/dsh-plugin-index/) 补充：索引写入 profile 的 `cordis.patch.yml`（`name: "@deepseek-ai/dsh-plugin-market"`, `config.indexes: [...]`）、索引不签名、安装按 commit 固定、需进程重启生效、URL 不能有 301——**均作旁证，不作为操作依据**。
- **关键区分**：`dsh-plugin-catalog/index.json` 是「给别人读取/发现插件」的索引；`awesome-dsh-plugin` 的 `data/plugins/*.yml` 是「投稿入口」。给市场投稿 = 改后者，前者由 CI 自动生成。

---

## 5. 推荐发布计划（含 fallback）

### 阶段 A：本地准备（我们可做，research 之外需 lead 批准）

1. 确认插件最终包名与目录：`D:\yousen\novel-mode-plugin`（当前还不存在，仅 `docs/` 由本次研究创建）。**先请用户在 §1.4 的 A′ / B′ / C 中选定目标仓库形态**——这决定 `package.json.repository`、YAML 条目和命令。
2. 构建产物必须满足 §2.4：`package.json` 声明 **`dsh.bundle.patch`**（`{"dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}`；只写 `dsh.client` 必拒）+ 同目录 `cordis.patch.yml`；`repository` 指回所选仓库；真实可运行代码；`@deepseek-ai/*` 放 `peerDependencies`（范围带显式预发布分支）。
3. 在所选仓库加 **`dsh-plugin` topic**（网页端；monorepo 条目即给整个仓库加）。
4. 推荐产出 **`screenshots.json`**（放插件自己目录，1–8 张 GitHub 托管 png/jpg/webp；SVG 与第三方图床会被拒）与 **GitHub Release 预构建 `.tgz`**（若源码安装需要 build 授权，`tarball:` 可绕过 `allowBuilds`；lead 特别建议）。`tarball:` 必须是 GitHub Release 托管的 https `.tgz`；用 `latest/download/` 时资产名**不要带版本号**，否则下次发版即 404。
5. 生成投稿素材（见下方三版「可直接提交的条目」与「PR 文案」）。

### 阶段 B：开源仓库（需用户确认 + 一次 push）

**B-1（修订推荐，A′：`novel` 子目录——跳过 1 天年龄 gate）**：无需新建仓库，`novel` 已满 8 个月。

```sh
cd D:\yousen\novel
# 先把已有本地改动处理干净（.gitignore 与一个角色 md 有 M 状态，勿误提交）
git status -sb
# 将 novel-mode-plugin 内容拷入 novel/novel-mode-plugin/ 后：
git add novel-mode-plugin
git commit -m "feat: add 小说模式 (Novel Mode) DSH plugin"
git push origin master        # 注意：默认分支是 master，不是 main
```

**B-2（备选，C：新建独立仓库）**：请用户在 GitHub 网页端创建**空仓库** `dsh-novel-mode`（公开、分支 `main`；无 token/`gh` 不能代建）。

```sh
cd D:\yousen\novel-mode-plugin
git init -b main            # 若 git 2.20 不支持 -b：git init && git checkout -b main
git remote add origin git@github.com:github-yousen/dsh-novel-mode.git
git add . && git commit -m "feat: 小说模式 (Novel Mode) DSH plugin"
git push -u origin main
```

**B-3（共同后续）**：打 tag、上传 Release `.tgz`。若走 B-2（新仓库），**投稿 PR 需等仓库满 1 天**（§1.5）；若走 B-1（老仓库），可直接投稿。

### 阶段 C：投稿 DSH 市场（fallback：人工一步）

因无法自动开 PR，交付**可直接复制**的素材。三版分别对应 §1.4 的三种仓库形态；**只选一版**，在 fork 内新增**一个** `data/plugins/*.yml` 文件（README 由脚本生成，禁止手改）。

**版本 A′（修订推荐）：`data/plugins/github-yousen__novel--novel-mode-plugin.yml`**（`novel` monorepo 子目录，分支 `master`）

```yaml
url: https://github.com/github-yousen/novel/tree/master/novel-mode-plugin
name: github-yousen/novel#novel-mode-plugin
category: workflow
description:
  en: 'A DeepSeek Harness plugin that turns novel-writing workflows into a guided mode: bundled commands, skills, agents, templates and scripts for planning, drafting, and revising long-form fiction.'
  zh: '把长篇小说创作流程做成 DeepSeek Harness 的可切换模式：内置规划、起草、修订所需的命令、技能、智能体、模板与脚本。'
# 可选（下列字段仅在仓库内确实提供时启用）：
# icon: https://raw.githubusercontent.com/github-yousen/novel/master/novel-mode-plugin/assets/icon-180.png
# tarball: https://github.com/github-yousen/novel/releases/latest/download/dsh-novel-mode.tgz
```

**版本 B′（次选）：`data/plugins/github-yousen__skills--novel-mode-plugin.yml`**（`skills` monorepo 子目录，分支 `main`）

```yaml
url: https://github.com/github-yousen/skills/tree/main/novel-mode-plugin
name: github-yousen/skills#novel-mode-plugin
category: workflow
description:
  en: 'A DeepSeek Harness plugin that turns novel-writing workflows into a guided mode: bundled commands, skills, agents, templates and scripts for planning, drafting, and revising long-form fiction.'
  zh: '把长篇小说创作流程做成 DeepSeek Harness 的可切换模式：内置规划、起草、修订所需的命令、技能、智能体、模板与脚本。'
# icon: https://raw.githubusercontent.com/github-yousen/skills/main/novel-mode-plugin/assets/icon-180.png
# tarball: https://github.com/github-yousen/skills/releases/latest/download/dsh-novel-mode.tgz
```

**版本 C（独立新仓库）：`data/plugins/github-yousen__dsh-novel-mode.yml`**（需用户先建空仓库；触发 1 天年龄 gate）

```yaml
url: https://github.com/github-yousen/dsh-novel-mode
name: github-yousen/dsh-novel-mode
category: workflow
description:
  en: 'A DeepSeek Harness plugin that turns novel-writing workflows into a guided mode: bundled commands, skills, agents, templates and scripts for planning, drafting, and revising long-form fiction.'
  zh: '把长篇小说创作流程做成 DeepSeek Harness 的可切换模式：内置规划、起草、修订所需的命令、技能、智能体、模板与脚本。'
# icon: https://raw.githubusercontent.com/github-yousen/dsh-novel-mode/main/assets/icon-180.png
# tarball: https://github.com/github-yousen/dsh-novel-mode/releases/latest/download/dsh-novel-mode.tgz
```

> ⚠️ 三版共同约束：① 描述中的具体数量（命令/技能/脚本数）必须以 `workflow-audit.md`（task-1）实际清单为准后填入，遵守「描述必须与代码相符、不得夸大」；② 分类 `workflow` 可按最终形态改 `skill`/`ui`；③ 含 `": "` 的整句必须加引号（上例已加）；④ `icon` 只接受 GitHub 托管的 **png/jpg/jpeg/webp** 位图，**SVG 与第三方图床会被拒**；⑤ `tarball` 必须是 GitHub Release 托管的 https `.tgz`；⑥ monorepo 版本的 `url` 分支段必须与实际默认分支一致（`novel` = `master`）；⑦ 一个 PR 最多 3 条，这里只投 1 条。

**PR 标题与正文**（仿 `pr-body.md` 模板；标题/YAML 路径按所选版本替换）

```
Title: Add github-yousen/novel#novel-mode-plugin   # 或 .../dsh-novel-mode

- [x] I added one file at `data/plugins/github-yousen__novel--novel-mode-plugin.yml` — that single file is the whole submission.
- [x] My repo's `package.json` declares `dsh.bundle` (`dsh.bundle.patch: ./cordis.patch.yml`), plus `dsh.client` for the browser half.
- [x] My repo is at least 1 day old (first commit 2026-02-26).   # 版本 C 新仓库则改为：created <date>, gate will clear in ~24h
- [x] `category: workflow` — a writing-workflow mode plugin.
- [x] Description states what the plugin does, no superlatives.
- [x] My repo has the `dsh-plugin` topic.
- [x] A prebuilt `.tgz` is attached to a GitHub Release (declared via `tarball:`).   # 若已提供

小说模式（Novel Mode）把既有小说创作工作流（规划 / 起草 / 修订所需的命令、技能、智能体、模板与脚本）打包为可安装的 DSH 插件，并提供一键进入「小说模式」的入口。源码与安装说明见仓库 README。
```

**用户需在 GitHub 网页端完成的 3 步**：① fork `awesome-dsh-plugin/awesome-dsh-plugin`；② 在 fork 的 `main` 上新建分支并添加上面那一个 YAML 文件；③ 开 PR 到上游 `main`（贴上述正文），等待 CI（entry count → `dsh.bundle` → repo age → `awesome-lint`/站点构建）与维护者人工评审。若 gate 因年龄变红，**无需重开 PR 或推空提交**，约一天后自动重跑转绿。

### Fallback 层级

| 若… | 则… |
|---|---|
| 用户不想新建仓库 | 退回方案 B/C（放入 `novel` 或 `skills` 子目录，按 monorepo 规则写 YAML：`url: .../tree/main/novel-mode-plugin`、`name: github-yousen/novel#novel-mode-plugin`，文件名带 `--`）。需注意 `novel` 默认分支是 `master`。 |
| 无法/不想提市场 PR | 仍可分发：① GitHub Release `.tgz` 直装（`dsh plugin --profile <p> add <url>`）；② 自建 format-1 `index.json` 托管并让用户在 Discover 添加索引源；③ 给 `LivXue/dsh-plugin-shop` / `dsh-plugin.org` 打 `dsh-plugin` topic 自动收录（旁证渠道，非官方）。 |
| 想让市场投稿自动化 | 需用户提供 `GITHUB_TOKEN`（`repo`/`public_repo` + `workflow` 范围，或安装 `gh` 并 `gh auth login`）；有了 token 即可 `gh repo fork` → 分支 → 提交 → `gh pr create`。**本次研究不索取、不存储、不打印任何 token。** |
| 想让 `npm publish` 可用 | 需 `npm adduser` 或 `NPM_TOKEN`；且 npm 包名需未被占用、包的 `repository` 字段指回同一仓库（否则目录不会关联）。非必需。 |
| 想让 `plugin_market` 工具能搜目录 | 需用户先在 GUI 把 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` 加进 **Plugins → Discover → Index sources**；这是读取侧配置，与投稿无关。 |

---

## 6. 给 lead / 其他研究者的要点（含交叉评审备注）

- **给 lead**：`dshmarket` 的 README 第 134–136 行与你转述一致——投稿口是 `awesome-dsh-plugin/awesome-dsh-plugin`，**不是** `dsh-market/dsh-market`。补充三点：① 投稿是「一个 YAML 文件」而非 `plugins.json`（已按你给的 exact shape 写出三版草稿，见 §5）；② 本机 `plugin_market list_indexes` 为空，所以那个 format-1 索引 URL 目前**不能被 `plugin_market` 工具直接查询**，需用户先手动在 GUI 添加为索引源；③ **关于 1 天年龄 gate 的建议已纳入并验证**：`novel` 首次提交 2026-02-26、`skills` 2026-05-12（本地 `git log --reverse`），均远超 1 天，故把「复用老仓库做 monorepo 子包」提升为 §1.4 的修订推荐 A′，并给出对应 YAML/命令；新建独立仓库（C）作为「不介意一天延迟」的整洁备选。REST API 仍 rate-limited，`created_at` 无法取，故用首次提交作年龄下界代理。
- **给插件构建者（task-1/task-2 下游）**：市场 CI 会实际拉取仓库 `package.json` 校验 **`dsh.bundle.patch`**（只写 `dsh.client` 必拒）、检查仓库**满 1 天**、要求 `dsh-plugin` topic、描述与代码逐条相符；`@deepseek-ai/*` 用 `peerDependencies` 且范围需带显式预发布分支。建议构建时同步产出 `cordis.patch.yml`、（可选）`screenshots.json`（png/jpg/webp，SVG 拒）与 Release `.tgz`（`tarball:`）。**若选 monorepo 子包，`package.json`/`cordis.patch.yml`/`screenshots.json` 都要放子目录里。**
- **交叉评审 api-researcher 的 `docs/api-research.md`（已于 21:47 出现，已通读 §5 与 §6）**：其市场/投稿部分与我的研究**一致，无事实性错误需要更正**——同样认定投稿口是 `awesome-dsh-plugin` 的 `data/plugins/<owner>__<repo>.yml` PR（非 `dsh-market/dsh-market`）、`plugin_market list_indexes` 为空、format-1 索引是读取/Discover 侧而非投稿侧。它补充了两点有价值的信息，建议 lead 采纳：① `@deepseek-ai/*` peerDependencies 门槛**只约束真正声明了 DSH 包依赖的 bundle**，纯 `ctx.*`/`inject` 的 Host-only 插件可以没有任何依赖，不要为「满足 gate」硬加 peer；② `dsh-plugin-market` 的 `setIndexes(urls)` 是 volatile 配置、URL 不接受 `#` fragment/重定向、15s 超时、10 分钟缓存。
  - **一处需要提醒的小分歧**：其 §5.3 的 `icon:` 示例写成 `https://raw.githubusercontent.com/owner/repo/main/assets/icon-180.png` 并注「GitHub-hosted raster image」——方向正确（contributing.md 明确 **SVG 与第三方图床被拒**，只收 png/jpg/jpeg/webp），但示例用 `.png` 已合规，不构成错误；本文 §5 三版草稿均用 `.png` 并显式写明格式约束。
  - **一处我主动补充给 lead 的风险**（见 §1.4 注）：其 §5.3 monorepo 示例用 `packages/xxx` 前缀，与 CI 文案「只扫 `packages/` · `plugins/` · `apps/` 子包」一致；而我的 A′/B′ 草稿最初用了裸 `novel-mode-plugin/` 子目录。实取目录里确有非三前缀的 `directory` 条目，但为避免 CI 误判，建议构建时统一用 `packages/novel-mode-plugin/` 前缀。已在我文档 §1.4 加注。
  - 其 §6 已声明「reviewed publishing-research.md, no factual corrections」并注明我文档当时「尚未出现」的时间戳已过时——双方交叉评审结论一致，无需 lead 介入仲裁。

---

## 7. 证据与来源索引

**本地命令证据**（均只读；未打印任何密钥值）：`git remote -v` / `git branch -a` / `git status -sb` / `git rev-parse --abbrev-ref HEAD` / `git config --get` / `git ls-remote` / `ssh -T git@github.com` / `npm whoami` / `npm root -g` / `Get-ChildItem` / `plugin_manager list_bundles` / `plugin_market list_indexes` / `plugin_market list_plugins` / 对 `dshmarket` 包内文件的 `read`/`grep`。

**外部 URL（不可信数据，已引用）**：

- [dshmarket README（本机安装版，含 Submit your plugin / 索引 URL）](https://github.com/dsh-market/dsh-market) — 本机路径 `C:\Users\altria\.dsh\profiles\desktop\node_modules\dshmarket\README.md`（L134–L136）
- [dshmarket 仓库页面（MIT，95 issues / 4 PRs）](https://github.com/dsh-market/dsh-market)
- [dshmarket 官网](https://dshmarket.com/)
- [awesome-dsh-plugin 投稿目标仓库](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
- [contributing.md 全文（经 jsDelivr CDN）](https://cdn.jsdelivr.net/gh/awesome-dsh-plugin/awesome-dsh-plugin@main/contributing.md)
- [pr-body.md 全文（经 jsDelivr CDN）](https://cdn.jsdelivr.net/gh/awesome-dsh-plugin/awesome-dsh-plugin@main/pr-body.md)
- [实时目录 plugins.json](https://awesome-dsh-plugin.com/plugins.json)
- [format-1 索引（npm CDN）](https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json)
- [format-1 索引（Pages 副本 A）](https://awesome-dsh-plugin.com/index.json) / [副本 B](https://dshmarket.com/index.json)
- [LivXue/dsh-plugin-shop（自动采集目录，旁证）](https://github.com/LivXue/dsh-plugin-shop)
- [DSH Plugin Hub（第三方目录，旁证）](https://dsh-plugin.org/)
- [dsh plugin index 解析文章（旁证）](https://mings.in/en/posts/dsh-plugin-index/)
- [DSH 本体仓库（本地 checkout 的 upstream）](https://github.com/deepseek-ai/deepseek-harness)
- [Agent Note: Plugin market index format（搜索结果摘要，旁证）](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-10-02-plugin-market-index-format.md)

> 注：`raw.githubusercontent.com` 在本环境 DNS 解析失败（`cannot resolve host`），故 contributing.md / pr-body.md 用 `cdn.jsdelivr.net/gh/...` 镜像取得；GitHub REST API 因未认证触发 rate limit，相关结论改用 `git ls-remote` 只读探测。
