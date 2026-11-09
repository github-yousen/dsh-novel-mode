# 小说写作工作流（DSH 版）

本目录是一套长篇小说工业化写作工作流。它从 `.codebuddy`（CodeBuddy 版）迁移而来，
现以 `.dsh/` 为唯一工作副本，`.codebuddy/` 原封不动保留，两套可并存。

## 目录布局

| 路径 | 作用 |
|------|------|
| `.dsh/config.yaml` | 全局配置：章节字数区间、长期记忆分层参数 |
| `.dsh/scripts/` | 20 个 PowerShell/Python 脚本（校验、后处理、状态同步、指纹、记忆） |
| `.dsh/templates/` | 摘要、设计稿、宪法、状态、拆书报告模板 |
| `.dsh/skills/` | 21 个技能：写作流程 9 个 + 子代理角色 9 个 + 去AI味/番茄站点/下载器 3 个 |
| `novel/` | 当前项目正文（本根目录下暂为空，实际项目在 `archive/*` 与 `new/` 子目录） |

⚠️ 本根目录 **没有** `novel/` 目录。写作前先确认目标项目目录；
`archive/` 下每个子目录、`new/` 各自是一个独立小说项目，都有自己的 `novel/`。

## 技能调用方式

DSH 没有自定义斜杠命令。原 `/novel-write 15` 这类命令，现在这样说：

- 直接描述意图，模型按 `whenToUse` 自动匹配技能
- 或在输入框里输入 `/` 后点选技能名，再补参数（如 `novel-write 15`）
- 需要独立上下文跑子代理时，让模型用 `subagent` 工具加载 `agent-*` 技能

| 原命令 | 现技能 |
|--------|--------|
| `/novel-write N` | `novel-write` |
| `/novel-design all` / `all --extend` / `N` | `novel-design` |
| `/novel-batch 1-100` | `novel-batch` |
| `/novel-validate N` / `all` | `novel-validate` |
| `/novel-outline` | `novel-outline` |
| `/novel-constitution` | `novel-constitution` |
| `/novel-disassemble` | `novel-disassemble` |
| `/novel-import` | `novel-import` |
| `/novel-design-export N` | `novel-design-export` |

| 原子代理 | 现技能 |
|----------|--------|
| `novel-writer` | `agent-novel-writer` |
| `continuity-validator` | `agent-continuity-validator` |
| `book-analyzer` | `agent-book-analyzer` |
| `chapter-outliner` | `agent-chapter-outliner` |
| `batch-outliner` | `agent-batch-outliner` |
| `batch-designer` | `agent-batch-designer` |
| `chapter-summarizer` | `agent-chapter-summarizer` |
| `constitution-extractor` | `agent-constitution-extractor` |
| `skeleton-rebuilder` | `agent-skeleton-rebuilder` |

## 🔴 PowerShell 脚本执行规则（全局强制）

**必须用 `pwsh -NoProfile -File`，禁止 `-Command` / `-c`。**

```
✅ pwsh -NoProfile -File .dsh/scripts/validate-chapter.ps1 -Chapter 15
❌ pwsh -NoProfile -Command "& .dsh/scripts/validate-chapter.ps1 ..."
❌ pwsh -c "..."
```

原因：`-Command` 模式下，脚本里的 `$变量` 与 `` `u{} `` Unicode 转义会被外层 shell
二次解析，导致静默失败或乱码。`-File` 原样传给 PowerShell，不存在此问题。

**必传参数必须显式给出**，否则脚本会进入交互式等待输入而挂起。
各脚本的必传参数见 `.dsh/skills/` 中对应技能正文，或 `rules` 原文件
`.codebuddy/rules/script-execution.mdc`。常用几个：

| 脚本 | 必传参数 |
|------|---------|
| `validate-chapter.ps1` | `-Chapter N` 或 `-Chapter All` |
| `validate-summary.ps1` | `-Chapter N` |
| `validate-design.ps1` | `-Chapter N` |
| `sync-state.ps1` | `-Chapter N` |
| `fix-punctuation.ps1` / `reformat-chapter.ps1` | `-Chapter N`（可选 `-DryRun`） |
| `check-ai-flavor.ps1` | `-Chapter N` 或 `-All`（多项目共享时需 `-ProjectRoot`） |
| `build-context-bundle.ps1` | `-Chapter N` |
| `compute-style.ps1` | 无（可选 `-Rebuild`，仅前 30 章内允许） |

脚本通过 `$PSScriptRoot` 自行推算项目根，**无需先 cd 到项目目录**。
退出码 `0` = 成功；非 0 读 stderr。

## 🔴 SubAgent 调用规则（全局强制）

**主流程只当调度员，传参数、收结果，不当导演。**

- 每个 `agent-*` 技能自带完整的 `<context_loading>`，会自行加载所需文件
- **禁止**在 prompt 里替子代理列文件路径、复述剧情方向、描述"当前上下文"
- 无论用"背景信息""参考资料"等什么措辞，只要是在代列文件或描述剧情，都禁止

**子会话的返回不一定对，主会话必须评判：**

- 子会话报 PASS → 直接放行，无需例行复查
- 子会话报 CRITICAL/WARNING，或主会话自行发现问题而子会话漏报 → 必须复查
- 结论与事实文件（core/outline/state/正文）矛盾 → 以事实为准，驳回并说明理由
- 依据明显错误（读错文件、把设计稿当正文）→ 驳回重验
- 子会话之间矛盾 → 主会话是唯一裁决者，对比依据后定夺
- 评判依据优先序：事实文件 > 子会话主观判断 > 主会话记忆
- 只信"证据"，不信"结论标签"

## 通用写作铁律（各技能正文有完整版）

- 章节目录一律三位补零：`novel/chapters/001/`，禁止 `1/`
- 字数以脚本裁决为准，AI 估算不作数
- 必须先有 `design.md` 再写正文；每章写完必须验证 + 同步状态
- 回修只改问题处，禁止整章重写
- 正文禁止出现伏笔 ID、`[需更新宪法]`、场景编号等元数据
- 对话用中文双引号 `""`，禁止「」『』和英文引号
- 去AI味：均句 25~35 字，短句（≤12字）占比 ≤25%
