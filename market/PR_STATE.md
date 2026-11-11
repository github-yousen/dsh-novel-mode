# 市场投稿状态（2026-11-11 19:50 +08 最终复核）

> **已合并**：PR #13689 于 2026-11-10 18:32:30 UTC（北京时间 11/11 02:32）由上游维护者 `fkysly` 合并，merge commit `f415e5c`；站点 `plugins.json` 已收录（HTTP 200 / 12.5 MB / 含本条目）。合并时维护者按仓库实际行为重写了描述，并**移除了 `tarball:`**（站点改用 `github:github-yousen/dsh-novel-mode` 安装行）。详见下方「维护者反馈与 v2.1.1」。

| 项目 | 值 |
|---|---|
| 插件开源仓库 | https://github.com/github-yousen/dsh-novel-mode （Public, `main`, MIT, topic `dsh-plugin`） |
| 产品版本 | **v0.2.0 — 0.x 打磨线当前版本**（尚未发布 `1.0.0` 正式版；见 CHANGELOG「版本策略」。PM R3 APPROVE，U1–U8 全 PASS） |
| **正式发布** | **GitHub Release [v0.2.0](https://github.com/github-yousen/dsh-novel-mode/releases/tag/v0.2.0)**（pnpm-safe `package/` tarball）；`2.x` 四个 Release 保留为历史不删除 |
| **自控市场渠道** | **自托管 format-1 索引**：https://github-yousen.github.io/skills/dsh-plugin-index.json （HTTP 200，format 1，1 plugin `@yousen/dsh-novel-mode` **0.2.0**）— 由 `github-yousen/skills` 仓库 GitHub Pages 托管，用户可在 Plugins → Discover → Index sources 添加该 URL |
| 官方精选目录 PR | **https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13689** （**已合并 merged=true**，2026-11-10 18:32:30 UTC，1 file，`check`=success, `Submission gate`=**SUCCESS**；站点 `plugins.json` 已收录） |
| Fork / 分支 | https://github.com/github-yousen/awesome-dsh-plugin @ `add-dsh-novel-mode` |

## 已自动完成

建仓 → 推送 → 加 topic → fork 上游 → 建分支 → 提交一个 YAML → 向上游 `main` 开 PR → 产品重建后同步 fork 分支 YAML 与 PR 正文（最新推送 head `8eb60cc`，tarball 指向 v2.1.0） → 建立 GitHub Release（v2.0.0 / v2.0.1）+ 预构建 tarball → 建立并验证自托管 format-1 索引（GitHub Pages，`status=built`）→ 年龄门槛过后触发一次新 gate 判决并确认转绿。

## CI 实测（最终 head `8eb60cc`，2026-11-10 17:50:46 UTC）

| Check | 结论 |
|---|---|
| `check`（条目数 / `dsh.bundle` / YAML / lint / 站点构建 / 描述一致性） | ✅ success |
| `Submission gate` | ✅ **SUCCESS** — title `Entries look good`；summary: "All 1 submitted entry passes: `dsh.bundle` declared, repo old enough, enough commits." |

仓库创建于 2026-11-09 14:44:55 UTC，2026-11-10 14:44:55 UTC 满 24h。此前 14:27:53 UTC 的失败判决（"repository is 1.0 days old"）是**门槛到达前的旧快照**；v2.0.1 阶段 15:27:45 UTC 首次转绿，v2.1.0 catalog 推送（head `8eb60cc`）再次触发 `PR check` → gate 重算，**17:50:46 UTC 最终判决同样 SUCCESS**。两次独立通道（后台轮询 + 直接 API 读取）结论逐字一致。详见 [REVIEW-publication.md](../docs/REVIEW-publication.md)。

## 「成功推送到市场」的判定（全部 ✅）

- ✅ **正式发布 + 可安装分发**：Release **v2.1.1** 附 pnpm-safe 预构建 tarball（471373 B，每个条目带 `package/` 外壳）；另有 v2.1.0 / v2.0.1 / v2.0.0 历史 Release。
- ✅ **进入可被 DSH 市场读取的索引**：自托管 format-1 索引已公开、HTTP 200、版本 **2.1.1**，`plugin_market` Discover 可添加。
- ✅ **官方精选目录 CI 全绿**：PR #13689 的 `check` 与 `Submission gate` 均 success。
- ✅ **官方目录已合并并收录**：`merged=true`，`awesome-dsh-plugin.com/plugins.json` HTTP 200 且含本条目（站点改用 `github:` 安装行，不依赖 tarball）。

## 维护者反馈与 v2.1.1（2026-11-11）

维护者 `fkysly` 合并时指出：v2.1.0 的 Release tarball 是**根布局**（文件直接放压缩包根），pnpm 解包会砍掉第一段路径把子目录压平（`lib/x.js` → `x.js`），导致从 tarball 安装时入口之外的文件找不到。因此合并时移除了条目里的 `tarball:`，并给出了精确修法：`make-tarball.py` 的 `arcname="package/" + rel`。

**已修复并发布 v2.1.1**：`make-tarball.py` 现在给全部 111 个条目加单一 `package/` 前缀并断言无遗漏；`manifest.test.mjs` 加了防回归测试；真实下载已发布 tarball 验证 `111/111` 带前缀、`lib/`/`assets/`/`locale/` 子目录完整；全套 10/10 suites、298/298 断言。站点 `github:` 安装路径本来就不受影响。

> 具体 commit SHA 以仓库 `main` 分支为准；format-1 索引钉在已发布代码 commit，避免追 HEAD 造成漂移。
