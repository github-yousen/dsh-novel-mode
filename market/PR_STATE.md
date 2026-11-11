# 市场投稿状态（2026-11-12 00:40 +08 复核）

> **当前版本 `0.3.0`（0.x 打磨线，尚未发布 `1.0.0` 正式版）**。2.x 的四个
> Release 与 git tag 已按确认删除，仓库当前只有 `v0.3.0` 一个 Release/tag。
> 官方目录 PR #13689 已合并并收录，条目走 `github:` 安装行、不含版本号，
> 因此版本重编号与 2.x 发布物删除都不影响用户安装。

| 项目 | 值 |
|---|---|
| 插件开源仓库 | https://github.com/github-yousen/dsh-novel-mode （Public, `main`, MIT, topic `dsh-plugin`） |
| 产品版本 | **v0.3.0 — 0.x 打磨线当前版本**（见 [CHANGELOG](../CHANGELOG.md)「版本策略」；PM R3 APPROVE，U1–U8 全 PASS） |
| **正式发布** | **GitHub Release [v0.3.0](https://github.com/github-yousen/dsh-novel-mode/releases/tag/v0.3.0)**，pnpm-safe `package/` tarball（含 `client.js`） |
| **自控市场渠道** | **自托管 format-1 索引**：https://github-yousen.github.io/skills/dsh-plugin-index.json （HTTP 200，format 1，1 plugin `@yousen/dsh-novel-mode` **0.3.0**）— 由 `github-yousen/skills` 仓库 GitHub Pages 托管，用户可在 Plugins → Discover → Index sources 添加该 URL |
| 官方精选目录 PR | **https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13689** （**已合并 merged=true**，2026-11-10 18:32:30 UTC，merge commit `f415e5c`，1 file，`check`=success, `Submission gate`=**SUCCESS**；站点 `plugins.json` 已收录） |
| Fork / 分支 | https://github.com/github-yousen/awesome-dsh-plugin @ `add-dsh-novel-mode` |

## 版本策略说明（2026-11-11）

最初建包时起始号误定为 `2.0.0`，未经语义考量。经确认重开 `0.x` 打磨线并于
`0.3.0` 对齐全部版本面；2.x 的四个 Release（2.0.0 / 2.0.1 / 2.1.0 / 2.1.1）
及对应 git tag **已删除**，仓库只剩 `v0.3.0`。`1.0.0` 正式版以 **AC-38**
（真模型连续写多章 + 全书 `validate-chapter -Chapter All` PASS）与 **AC-45**
（全新独立 profile + 人工可视化点选下拉框）两项真实验收为闸门。

`docs/` 下的 `REVIEW-*.md` / `PM-REVIEW-*.md` 是当时评审的时点记录，文中
2.x 版本号与 Release URL 属历史快照，不代表当前发布物。

## 已自动完成

建仓 → 推送 → 加 topic → fork 上游 → 建分支 → 提交一个 YAML → 向上游 `main` 开 PR →
同步 fork 分支 YAML 与 PR 正文 → 建立 GitHub Release + 预构建 tarball → 建立并验证
自托管 format-1 索引（GitHub Pages，`status=built`）→ 年龄门槛过后触发 gate 判决
并确认转绿 → 上游维护者合并、站点收录 → 按维护者反馈修复 tarball 为 pnpm-safe
`package/` 布局 → 重开 0.x 版本线、发布 `v0.3.0`、删除全部 2.x 发布物。

## CI 实测（head `8eb60cc`，2026-11-10 17:50:46 UTC）

| Check | 结论 |
|---|---|
| `check`（条目数 / `dsh.bundle` / YAML / lint / 站点构建 / 描述一致性） | ✅ success |
| `Submission gate` | ✅ **SUCCESS** — title `Entries look good`；summary: "All 1 submitted entry passes: `dsh.bundle` declared, repo old enough, enough commits." |

两次独立通道（后台轮询 + 直接 API 读取）结论逐字一致。详见
[REVIEW-publication.md](../docs/REVIEW-publication.md)。

## 「成功推送到市场」的判定（全部 ✅）

- ✅ **正式发布 + 可安装分发**：Release **v0.3.0** 附 pnpm-safe 预构建 tarball
  （471373 B，每个条目带 `package/` 外壳；真实下载验证 111/111 带前缀）。
- ✅ **进入可被 DSH 市场读取的索引**：自托管 format-1 索引已公开、HTTP 200、
  版本 **0.3.0**，`plugin_market` Discover 可添加。
- ✅ **官方精选目录 CI 全绿**：PR #13689 的 `check` 与 `Submission gate` 均 success。
- ✅ **官方目录已合并并收录**：`merged=true`，`awesome-dsh-plugin.com/plugins.json`
  HTTP 200 且含本条目（站点改用 `github:` 安装行，不依赖 tarball）。

## 维护者反馈与 tarball 修复

维护者 `fkysly` 合并时指出：早期 Release tarball 是**根布局**，pnpm 解包会砍掉
第一段路径把子目录压平（`lib/x.js` → `x.js`），导致从 tarball 安装时入口之外的
文件找不到；合并时因此移除了条目里的 `tarball:`，并给出修法
`arcname="package/" + rel`。

**已修复**：`make-tarball.py` 现在给全部 111 个条目加单一 `package/` 前缀并断言
无遗漏；`manifest.test.mjs` 加了防回归测试；真实下载 v0.3.0 tarball 验证
`111/111` 带前缀、`lib/` / `assets/` / `locale/` 子目录完整；全套 10/10 suites、
298/298 断言。已在 PR 下回复维护者。站点 `github:` 安装路径本来就不受影响。

> 具体 commit SHA 以仓库 `main` 分支为准；format-1 索引钉在已发布代码 commit，
> 避免追 HEAD 造成漂移。
