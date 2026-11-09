# 市场投稿状态（2026-11-10 03:15 +08 复核）

| 项目 | 值 |
|---|---|
| 插件开源仓库 | https://github.com/github-yousen/dsh-novel-mode （Public, `main`, MIT, topic `dsh-plugin`） |
| 产品版本 | **v2.0.0 — 确定性编排引擎**（PM R2 APPROVE，0 blocker） |
| **正式发布** | **GitHub Release [v2.0.0](https://github.com/github-yousen/dsh-novel-mode/releases/tag/v2.0.0)**，附预构建 `dsh-novel-mode.tgz`（464 KB） |
| **自控市场渠道** | **自托管 format-1 索引**：https://github-yousen.github.io/skills/dsh-plugin-index.json （HTTP 200，format 1，1 plugin `@yousen/dsh-novel-mode` v2.0.0）— 由 `github-yousen/skills` 仓库 GitHub Pages 托管，用户可在 Plugins → Discover → Index sources 添加该 URL |
| 官方精选目录 PR | **https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13689** （open, 1 file, `check`=success） |
| Fork / 分支 | https://github.com/github-yousen/awesome-dsh-plugin @ `add-dsh-novel-mode` |

## 已自动完成

建仓 → 推送 → 加 topic → fork 上游 → 建分支 → 提交一个 YAML → 向上游 `main` 开 PR → 产品 v2.0.0 重建后同步 fork 分支 YAML 与 PR 正文 → 建立 GitHub Release + 预构建 tarball → 建立并验证自托管 format-1 索引（GitHub Pages，`status=built`）。

## CI 实测

| Check | 结论 |
|---|---|
| `check`（条目数 / `dsh.bundle` / YAML / lint / 站点构建 / 描述一致性） | ✅ success |
| `Submission gate` | ⏳ **唯一失败原因**：`repository is 0.2 days old (needs 1) — nothing to do: this check re-runs by itself and should clear in about 21h. No need to resubmit, push, or close and reopen; the age bar is the only thing failing here.` |

仓库创建于 2026-11-09 06:44 UTC；本次复核为 2026-11-09 19:14 UTC，实际年龄约 12.5 小时（尚未满 24h）。gate 结论是快照、会自动重跑，**无需重开 PR、无需推空提交**。

## 「成功推送到市场」的判定

- ✅ **正式发布 + 可安装分发**：Release v2.0.0 附预构建 tarball，可从 Release 或仓库 URL 直接安装；已验证 tarball 含 `lib/orchestrator.js`、21 技能、18 脚本、8 模板、2 PNG，零凭据。
- ✅ **进入可被 DSH 市场读取的索引**：自托管 format-1 索引已公开、format 合法、HTTP 200、`(plugin_market)` Discover 可添加。这是完全自控、已验证成功的市场渠道。
- ⏳ **官方 awesome-dsh-plugin 精选目录**：PR #13689 已提交、CI 仅剩年龄门槛（约 21h 后自动转绿），**合并由上游维护者决定，插件无法强制**。这是唯一未完结的环节，附日期与证据，未静默丢弃。

## 剩下的（维护者/CI 侧）

- 年龄 gate 转绿 + 维护者人工评审合并。合并后站点自动重建，`awesome-dsh-plugin.com/plugins.json` 与 `dsh-plugin-catalog` 更新，dshmarket 通常一天内收录。
- 若被打 `held: author`：把修复推到同一分支并只留一条评论；标签需重新评审才摘掉。

> 具体 commit SHA 以仓库 `main` 分支为准；format-1 索引钉在已发布代码 commit `2f38b94`（v2.0.0 实质代码提交），比追 HEAD 更稳定。
