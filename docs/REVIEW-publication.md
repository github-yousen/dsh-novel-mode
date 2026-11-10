# 市场/投稿状态交叉核查（market-prep，2026-11-10 23:00 +08:00 / 15:00 UTC）

> 数据源：GitHub REST API（token 取自 `C:\Users\altria\.codebuddy\rules\MyRules.mdc`，仅读入内存变量，**从未打印**）；
> 托管索引经 `web_fetch` 另验。时间以 UTC 为准。**仅写入本文件，未改动任何运行时代码。**

## 1. PR #13689

| 项 | 值 |
|---|---|
| 状态 | **open，未合并**（`merged=false`，`merged_at` 空） |
| head | `github-yousen/awesome-dsh-plugin:add-dsh-novel-mode` → 上游 `main` |
| 变更文件数 | **1**（`data/plugins/github-yousen__dsh-novel-mode.yml`，+20/-0） |
| 旧 head `03243c7` 的 check | `check` = **success**（14:26:22Z） |
| 旧 head 的 `Submission gate` | **failure**（14:27:53Z） |

`Submission gate` 失败**唯一原因**（check-run `129892396371` 原文）：
> `repository is 1.0 days old (needs 1) — nothing to do: this check re-runs by itself and should clear in about 1h. No need to resubmit, push, or close and reopen; the age bar is the only thing failing here.`

即：仅仓库年龄门槛，其余（条目数、`dsh.bundle`、YAML 格式、lint、站点构建）全绿。

## 2. 仓库 `github-yousen/dsh-novel-mode`

| 项 | 值 |
|---|---|
| 可见性 | **Public**（`private=false`） |
| 默认分支 | **`main`** |
| `created_at` | **`2026-11-09T14:44:55Z`**（原始 ISO，未做时区转换） |
| 24h 门槛时刻 | `2026-11-10T14:44:55Z` |
| 核查时刻 | `2026-11-10T15:00:26Z` |
| **实际年龄** | **约 24.26 小时 / 1.01 天 — 已过门槛** |
| topics | `chinese-fiction, deepseek-harness, dsh-plugin, novel, workflow, writing` |

⚠️ 关键判断：失败的那次 gate 运行在 **14:27:53Z**，**早于** 14:44:55Z 的 24h 门槛，是一个过期快照（gate 自身说明「过期会自动重跑」）。此前 `PR_STATE.md` 记的「32h / 约 0 天」是本地 `DateTime.Parse` 把 UTC 当本地时区（+8）换算造成的偏差，API 原始值以上表为准。

## 3. Releases

| tag | 发布 (UTC) | 资产 |
|---|---|---|
| `v2.0.1` | 2026-11-10 13:59:53 | `dsh-novel-mode.tgz`（465252 B）— `https://github.com/github-yousen/dsh-novel-mode/releases/download/v2.0.1/dsh-novel-mode.tgz` |
| `v2.0.0` | 2026-11-09 18:32:55 | `dsh-novel-mode.tgz`（464795 B） |

两个均为正式 release（非 draft / 非 prerelease），资产名版本无关，URL 不会随下次发版腐坏。

## 4. 自托管 format-1 索引

`https://github-yousen.github.io/skills/dsh-plugin-index.json` → **HTTP 200**（2191 B）。
`format: 1`，`plugins[]` 恰好 1 个：`@yousen/dsh-novel-mode`，**version `2.0.1`**，category `workflow`，source 为 git（commit `2f38b944…`），`engines.dsh` 已声明。描述已升级为 v2.0.x「确定性写作引擎」文案，与仓库 README 方向一致。

## 5. Fork 分支目录条目的 tarball

分支 `add-dsh-novel-mode` 的 `data/plugins/github-yousen__dsh-novel-mode.yml` **已含生效的**：
```yaml
tarball: https://github.com/github-yousen/dsh-novel-mode/releases/download/v2.0.1/dsh-novel-mode.tgz
```
（钉住 tag，非 `latest/download/`，符合 contributing.md 不腐坏规则。）同时含 `icon:` 指向 `main/assets/icon-180.png`。

## 6. 触发新 gate 链的动作

按 lead 指令，在确认「gate 仍失败 + 仓库已 >1 天」且**无重复推送**（fork 分支最后提交为 14:01:13Z，无 14:50Z 之后的提交）后，经 contents API 向 fork 分支推送 **1 个纯注释改动**（未关闭/重开 PR、未 force-push、未改生成 README、未改任何 YAML 数据行）：

- 新提交：`314cb55f085c85a007b2aefae657e73865a606ef`
- 提交信息：`docs: comment-only touch to retrigger Submission gate after repo age bar clears`
- 追加内容仅一行注释：`# Re-run the Submission gate after the repository passed the 1-day age bar (comment-only; no catalog data changed).`
- 回读校验：活动 YAML 行（`url`/`name`/`category`/`icon`/`tarball`）**逐字未变**，v2.0.1 tarball 仍在。
- 15:00:59Z 新 head 的 `check` 已 `in_progress`，`Submission gate` 随后运行。

**新 gate 结论：✅ SUCCESS**（见「补记」）。

## 7. 与定时任务 `schedule-d03e7c43` 的协调

- 本会话为**被委派的 subagent**，`schedule_list` / `schedule_view` 均返回 `A delegated subagent cannot use scheduled tasks`，**无法查询该任务状态**（权限限制，非失败）。
- 替代去重手段：推送前直接查 fork 分支最近提交列表与 PR `updated_at`，确认 14:01:13Z 之后无任何推送，才执行本次**唯一**一次注释推送（commit `314cb55f`），供 lead 与定时任务比对，避免重复推送。lead 已确认不再推送。

## 补记：新 gate 判定（2026-11-10 15:29 UTC / 23:29 北京时间）

| 项 | 结果 |
|---|---|
| 新 head `314cb55f` 的 `check` | **success**（15:00:59Z 启动 → 15:26:46Z 完成，约 26 分钟；站点构建耗时长） |
| 新 head 的 `Submission gate` | **✅ SUCCESS**（15:27:45Z 完成） |
| gate `output.title` | `Entries look good` |
| gate `output.summary`（原文） | `All 1 submitted entry passes: dsh.bundle declared, repo old enough, enough commits.` |
| 是否仍因年龄失败 | **否** —— 年龄、manifest、提交数三项全部通过；无其它失败原因 |
| PR #13689 | **仍 open、未合并**（`merged=false`，`merged_at` 空），`changed_files=1`，无 label / 无评论，`head=314cb55f` |

工作流中途所有校验步骤（Stale-fork guard、READMEs match data/plugins、awesome-lint、Entry-path / Added-date / Capability-disclosure / Discussion-adoption 测试）均为 success，仅最后的 Build 站点构建耗时长。

**后续不在我方自动化范围**：维护者人工评审（读源码核对描述、分类、重复、可疑代码）→ 合并 → 站点自动重建 → `plugins.json` / `dsh-plugin-catalog` 更新 → dshmarket 通常一天内收录。若被打 `held: author`，把修复推到同一分支并只留一条评论。

**后台作业**：`pwsh-f056f8a0a2304ffd`（22 分钟超时，已结束）、`pwsh-b6814fea2e5b44d0`（已捕获 gate success，已结束）。两次均为只读轮询，token 仅读入内存、从未打印。

---

## 终记：v2.1.0 最终 head `8eb60cc`（2026-11-11 01:51 +08 / 2026-11-10 17:50 UTC）

多方评审修复发布为 v2.1.0 后，catalog 的 `tarball:` 更新为 v2.1.0 并推送到 fork 分支（head `8eb60cc`），再次触发完整 `PR check` → `Submission gate` 链：

| 项 | 结果 |
|---|---|
| `PR check`（head `8eb60cc`） | ✅ **success**（17:05:54Z 启动 → 17:50 前完成，18/18 步 success，0 failure；Build 站点构建耗时长） |
| `Submission gate`（head `8eb60cc`） | ✅ **SUCCESS**（17:50:46Z 完成） |
| gate `output.title` | `Entries look good` |
| gate `output.summary`（原文） | `All 1 submitted entry passes: dsh.bundle declared, repo old enough, enough commits.` |
| PR #13689 | **open、未合并**（`merged=false`），`changed_files=1`，无 label / 无评论，`mergeable=true` |

两条独立通道结论逐字一致：后台轮询作业 `pwsh-ecbdc1690dd64595`（`FINAL GATE=success`）与 lead 直接 API 读取。`schedule-ff46ab16`（01:50 +08）亦已到点。**官方目录侧 CI 全部通过；仅剩上游维护者人工评审与合并**，属外部环节，不宣称已合并。
