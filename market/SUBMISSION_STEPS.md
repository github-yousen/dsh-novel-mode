# 投稿 DSH 市场（awesome-dsh-plugin）

> 目标仓库：`awesome-dsh-plugin/awesome-dsh-plugin`（**不是** `dsh-market/dsh-market`）。
> 规则依据：[contributing.md](https://cdn.jsdelivr.net/gh/awesome-dsh-plugin/awesome-dsh-plugin@main/contributing.md)
> 与 [pr-body.md](https://cdn.jsdelivr.net/gh/awesome-dsh-plugin/awesome-dsh-plugin@main/pr-body.md)（外部不可信数据，仅作对照）。

---

## 已自动完成的部分（2026-11-09 建仓，2026-11-10 v0.2.0 打磨线）

以下发布步骤**已通过 GitHub API 自动完成**（使用了用户授权的凭据，未在此记录凭据位置或取值），无需用户手动操作：

1. **创建并推送开源仓库**：`https://github.com/github-yousen/dsh-novel-mode`（Public、`main`、MIT）。根 `package.json` 声明 `dsh.bundle`，旁边有 `cordis.patch.yml`；不含任何凭据。0.2.0 为确定性编排引擎打磨线版本（具体 commit SHA 见仓库 `main` 分支，不写死旧 SHA）。
2. **添加 topic**：`dsh-plugin`（另有 `deepseek-harness`、`novel`、`workflow`、`writing`、`chinese-fiction`）。
3. **产出目录条目**：[`data/plugins/github-yousen__dsh-novel-mode.yml`](data/plugins/github-yousen__dsh-novel-mode.yml)——一个 YAML 文件，`url`/`name`/文件名三者一致，`category: workflow`，`description.en` 必填且已引号化，描述与代码相符、无夸大；`icon:` 指向仓库内真实的 GitHub 托管 raster PNG。
4. **fork 上游并开 PR**：见下方「自动投稿结果」记录的 PR 链接。产品重建后，fork 分支的 YAML 与 PR 正文均已同步更新。

> ⚠️ **仓库年龄门槛（实测）**：`contributing.md` 的 CI 要求仓库创建满 **1 天**。PR #13689 的 `Submission gate` 目前只因此一项为 failure，输出原文：`repository is 0.0 days old (needs 1) — nothing to do: this check re-runs by itself and should clear in about 24h. No need to resubmit, push, or close and reopen; the age bar is the only thing failing here.` 其余 `check`（条目数、`dsh.bundle`、格式、lint、站点构建）均为 success。约 24 小时后 gate 自动重跑转绿，无需任何操作、不要重开 PR。这是唯一的固有延迟。

---

## 自动投稿结果

- **Fork**：`github-yousen/awesome-dsh-plugin`（通过 GitHub REST API `POST /repos/{owner}/{repo}/forks` 创建）。
- **分支**：`add-dsh-novel-mode`（基于 fork 的 `main`）。
- **提交**：仅新增一个文件 `data/plugins/github-yousen__dsh-novel-mode.yml`（API `PUT /repos/.../contents/...`）。
- **PR**：`awesome-dsh-plugin/awesome-dsh-plugin#13689`（https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13689）。
- 标题：[`PR_TITLE.md`](PR_TITLE.md)；正文：[`PR_BODY.md`](PR_BODY.md)。

合并与站点同步由上游维护者完成；`awesome-dsh-plugin.com/plugins.json` 与 `dsh-plugin-catalog` 索引通常在合并后一天内更新，dshmarket 随之收录。这段延迟无法加速。

---

## 若需要用户手动重做（fallback）

若 PR 被关闭或需要重新提交，用 GitHub 网页端完成：

1. Fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin> 到 `github-yousen`（若已有 fork 可跳过）。
2. 在 fork 的 `main` 上新建分支（例如 `add-dsh-novel-mode`），不要直接改 `main`。
3. **Add file → Create new file**，路径必须是 `data/plugins/github-yousen__dsh-novel-mode.yml`，内容复制 [`market/data/plugins/github-yousen__dsh-novel-mode.yml`](data/plugins/github-yousen__dsh-novel-mode.yml) 全文。
4. **Contribute → Open pull request**，base 选 `awesome-dsh-plugin/awesome-dsh-plugin:main`；标题/正文分别粘贴 `PR_TITLE.md` / `PR_BODY.md`。
5. 等待 CI（Entry count ≤3、`dsh.bundle`、Repo age ≥1 天、awesome-lint + 站点构建）与维护者人工评审。若被打 `held: author`，把修复推到同一分支并**只留一条评论**说明改了什么；标签需重新评审才会摘掉。

约束（`contributing.md`）：

- 一个 PR 只加一个文件；两个 README 由脚本生成，**禁止手工编辑**。
- 只有 `description.en` 必填；含 `": "` 的描述必须加引号（本文件已加）。
- `icon:` 只收 GitHub 托管的 **png/jpg/jpeg/webp 位图**（SVG 与第三方图床被拒）；`tarball:` 只收 GitHub Release 的 https `.tgz`。二者都非必填，本条目已注释说明。
- 不要向 `dsh-market/dsh-market` 提插件条目；不要改动与本次无关的其他条目。

---

## 可选：自建 format-1 Discover 索引（**不是**官方投稿口）

[`index-snippet.json`](index-snippet.json) 是一个**已完成、无占位符**的 format-1 索引（`plugins[]` 恰好一个插件对象，`source.commit` 与 `publishTimestamp` 为真实值）。把它托管到任意静态 https 地址（GitHub Pages / GitLab Pages / 对象存储；无重定向、URL 不含 `#` 或凭据），然后用户需在 GUI 启用实验性 **Custom plugin indexes** bundle，并在 **Plugins → Discover → Index sources** 添加该 URL。这是读取侧配置，不会让插件进入官方精选市场，但即使官方 PR 未合并也能分发。

---

## 兜底分发

若不想/不能走市场 PR：① GitHub Release 附预构建 `.tgz`（`tarball:`）直接安装；② 上面的自托管 format-1 索引；③ `dsh-plugin` topic 会让第三方采集目录（`LivXue/dsh-plugin-shop`、`dsh-plugin.org`）自动收录（旁证渠道，非官方）。安装命令见 [`INSTALL.md`](INSTALL.md)。
