# 市场投稿状态（2026-11-09，自动完成）

| 项目 | 值 |
|---|---|
| 插件开源仓库 | https://github.com/github-yousen/dsh-novel-mode （Public, main, MIT, topic `dsh-plugin`） |
| 插件 commit | `173fe81debcf1d9c187206407db4c511ae0a7087` |
| Fork | https://github.com/github-yousen/awesome-dsh-plugin |
| 分支 | `add-dsh-novel-mode` |
| 目录条目 | `data/plugins/github-yousen__dsh-novel-mode.yml` |
| **PR** | **https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13689** |
| 状态 | open |

已自动完成：建仓 → 推送 → 加 topic → fork 上游 → 建分支 → 提交一个 YAML → 向上游 `main` 开 PR。

## CI 实测结果（2026-11-09 23:2x）

| Check | 结论 |
|---|---|
| `check`（格式/lint/站点构建） | ✅ success |
| `Submission gate` | ⏳ failure — **唯一原因**：`repository is 0.0 days old (needs 1) — nothing to do: this check re-runs by itself and should clear in about 24h. No need to resubmit, push, or close and reopen; the age bar is the only thing failing here.` |

即：`dsh.bundle`、条目数量、YAML 格式、描述一致性等全部通过；只剩上游强制的「仓库创建满 1 天」时间门槛，约 24 小时后 gate 自动重跑转绿，**无需任何操作、不要重开 PR**。

剩余（维护者/CI 侧，无法自动化）：

- 维护者人工评审：读源码核对描述、分类、是否重复、有无可疑代码。
- 合并后站点自动重建，`awesome-dsh-plugin.com/plugins.json` 与 `dsh-plugin-catalog` 更新，dshmarket 通常一天内收录。

若被打 `held: author`：把修复推到同一分支并只留一条评论；标签需重新评审才摘掉。
