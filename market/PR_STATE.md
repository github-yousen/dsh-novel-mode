# 市场投稿状态（2026-11-11 00:20 +08 复核）

| 项目 | 值 |
|---|---|
| 插件开源仓库 | https://github.com/github-yousen/dsh-novel-mode （Public, `main`, MIT, topic `dsh-plugin`） |
| 产品版本 | **v2.1.0 — 多方评审修复：真实工作流正确性 + 可用性**（PM R2 复评；引擎核心 R4 APPROVE-CONFIRMED 有效） |
| **正式发布** | **GitHub Release [v2.1.0](https://github.com/github-yousen/dsh-novel-mode/releases/tag/v2.1.0)**，附预构建 `dsh-novel-mode.tgz`（470414 B）；另有历史 Release v2.0.1 / v2.0.0 |
| **自控市场渠道** | **自托管 format-1 索引**：https://github-yousen.github.io/skills/dsh-plugin-index.json （HTTP 200，format 1，1 plugin `@yousen/dsh-novel-mode` **2.1.0**）— 由 `github-yousen/skills` 仓库 GitHub Pages 托管，用户可在 Plugins → Discover → Index sources 添加该 URL |
| 官方精选目录 PR | **https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13689** （**open**, 1 file, `check`=success, `Submission gate`=**SUCCESS**） |
| Fork / 分支 | https://github.com/github-yousen/awesome-dsh-plugin @ `add-dsh-novel-mode` |

## 已自动完成

建仓 → 推送 → 加 topic → fork 上游 → 建分支 → 提交一个 YAML → 向上游 `main` 开 PR → 产品重建后同步 fork 分支 YAML 与 PR 正文（最新推送 head `8eb60cc`，tarball 指向 v2.1.0） → 建立 GitHub Release（v2.0.0 / v2.0.1）+ 预构建 tarball → 建立并验证自托管 format-1 索引（GitHub Pages，`status=built`）→ 年龄门槛过后触发一次新 gate 判决并确认转绿。

## CI 实测（2026-11-10 15:27 UTC）

| Check | 结论 |
|---|---|
| `check`（条目数 / `dsh.bundle` / YAML / lint / 站点构建 / 描述一致性） | ✅ success |
| `Submission gate` | ✅ **SUCCESS** — title `Entries look good`；summary: "All 1 submitted entry passes: `dsh.bundle` declared, repo old enough, enough commits." |

仓库创建于 2026-11-09 14:44:55 UTC，2026-11-10 14:44:55 UTC 满 24h。此前 14:27:53 UTC 的失败判决（"repository is 1.0 days old"）是**门槛到达前的旧快照**；15:00 UTC 的一次注释级推送触发 `PR check` → gate 重算，15:27:45 UTC 判决转绿。详见 [REVIEW-publication.md](../docs/REVIEW-publication.md)。

## 「成功推送到市场」的判定

- ✅ **正式发布 + 可安装分发**：Release v2.1.0 附预构建 tarball（470414 B），可从 Release 或仓库 URL 直接安装；已验证 tarball 含 `lib/orchestrator.js`、21 技能、18 脚本、8 模板、2 PNG，零凭据。
- ✅ **进入可被 DSH 市场读取的索引**：自托管 format-1 索引已公开、format 合法、HTTP 200、版本 2.1.0，`plugin_market` Discover 可添加。这是完全自控、已验证成功的市场渠道。
- ✅ **官方精选目录 CI 全绿**：PR #13689 的 `check` 与 `Submission gate` 均 success，1 个 YAML 文件，无年龄/清单/格式问题。
- ⏳ **仅剩维护者合并**：PR 仍 `open / merged=false`，人工评审与合并由上游维护者决定，插件无法强制。合并后站点自动重建，`awesome-dsh-plugin.com/plugins.json` 与 `dsh-plugin-catalog` 更新，dshmarket 通常一天内收录。

## 剩下的（维护者侧）

- 上游人工评审 → 合并 → 站点重建 → dshmarket 同步。
- 若被打 `held: author`：把修复推到同一分支并只留一条评论；标签需重新评审才摘掉。

> 具体 commit SHA 以仓库 `main` 分支为准；format-1 索引钉在已发布代码 commit，避免追 HEAD 造成漂移。
