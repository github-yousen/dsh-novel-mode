# 市场投稿状态

| 项目 | 值 |
|---|---|
| 插件开源仓库 | https://github.com/github-yousen/dsh-novel-mode （Public, `main`, MIT, topic `dsh-plugin`） |
| 产品版本 | **v2.0.0 — 确定性编排引擎**（非 persona/提示词组） |
| Fork | https://github.com/github-yousen/awesome-dsh-plugin |
| 分支 | `add-dsh-novel-mode` |
| 目录条目 | `data/plugins/github-yousen__dsh-novel-mode.yml` |
| **PR** | **https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13689** |
| 状态 | open（维护者合并） |

> 具体 commit SHA 以推送后的 `git rev-parse HEAD` 为准；本文件不写死旧 SHA，
> 避免 AC-43「stale commit」问题。最终 SHA 见仓库 `main` 分支与 `docs/PM-REVIEW-R1.md`。

## 已自动完成

建仓 → 推送 → 加 topic → fork 上游 → 建分支 → 提交一个 YAML → 向上游 `main`
开 PR → 随产品重建同步更新 fork 分支的 YAML 与 PR 正文。

## CI 实测（2026-11-10 01:10 +08 复查）

| Check | 结论 |
|---|---|
| `check`（格式/lint/站点构建） | ✅ success（此前一轮）／最新一轮 in_progress |
| `Submission gate` | ⏳ 历史唯一失败原因：`repository is 0.0 days old (needs 1) — nothing to do: this check re-runs by itself and should clear in about 24h. No need to resubmit, push, or close and reopen; the age bar is the only thing failing here.` |

即：`dsh.bundle`、条目数量、YAML 格式、描述一致性等全部通过；只剩上游强制的
「仓库创建满 1 天」时间门槛。仓库建于 2026-11-09，gate 结论是快照、会自动重跑，
**无需重开 PR、无需推空提交**。

## 剩下的（维护者/CI 侧，插件无法强制）

- 年龄 gate 转绿 + 维护者人工评审（读源码核对描述、分类、是否重复、有无可疑代码）。
- 合并后站点自动重建，`awesome-dsh-plugin.com/plugins.json` 与 `dsh-plugin-catalog`
  更新，dshmarket 通常一天内收录——这段延迟是上游规则决定的。
- 可并行、完全自控的分发渠道：自托管 format-1 索引（`market/index-snippet.json`，
  托管到 GitHub Pages 后在 Plugins → Discover → Index sources 添加）。

若被打 `held: author`：把修复推到同一分支并只留一条评论；标签需重新评审才摘掉。
