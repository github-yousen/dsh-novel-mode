---
name: novel-outline
description: 为指定章节范围生成高质量结构化章纲（功能定位/情节要点/冲突/爽点/章末钩子/角色出场），追加到 novel/outline.md。
whenToUse: 为指定章节范围生成高质量结构化章纲（功能定位/情节要点/冲突/爽点/章末钩子/角色出场），追加到 novel/outline.md。
---

# novel-outline

# novel-outline — 章节大纲（章纲）扩写命令

## 作用

为指定章节范围生成**高质量结构化章纲**（按网文方法论），追加到 `novel/outline.md`。

与 `/novel-design all --extend` 的分工：
- `/novel-design all --extend`：主流程直接扩纲（一段式梗概，零 SubAgent，手动确认）
- `/novel-outline`：调用 SubAgent `chapter-outliner` 扩纲（结构化章纲，要素完整，节奏严格）——**推荐用于对章纲质量有要求的扩纲**

与 `novel-batch` Step O 的分工：
- `novel-batch` Step O：批量写作前自动补纲（无人值守，调用 `batch-outliner`）
- `/novel-outline`：手动高质量扩纲（人在场，调用 `chapter-outliner`）

## 支持参数

- `N` — 扩写第 N 章（单章）
- `N-M` — 扩写第 N 到 M 章（推荐按卷，≤20 章）
- `all --extend` — 从大纲当前覆盖末尾继续追加（等价于交互式追加大纲，调用 chapter-outliner 生成）
- `--standard` — 可选，使用一段式模式（等同 batch-outliner 输出），默认 `structured`

## 执行流程

### 1. 前置检查

- 检查 `novel/constitution/core.md` / `style.md` 存在 → 不存在则报错，提示先执行 `/novel-constitution`
- 检查 `novel/outline.md` 存在 → 不存在则报错，提示先执行 `/novel-design all`
- 读取 `novel/outline.md`，解析 `当前已规划` 范围，确定扩纲起点：
  - 参数为 `N` / `N-M`：直接使用指定范围
  - 参数为 `all --extend`：起点 = 大纲末尾已规划章节 + 1
- 🔴 **范围校验**：若请求范围 ≤ 大纲已覆盖范围 → 提示"该范围已规划，无需扩纲"
- 🔴 **已写章节保护**：若 `startChapter` ≤ `state.yaml.lastChapter`（已写完的章节）→ 报错阻断，禁止重写已写章节的规划

### 2. 调用 SubAgent `chapter-outliner`

🔴 **SubAgent 调用 prompt 白名单规则**：只传参数 + 一句加载指令，禁止传文件清单/剧情方向/上下文描述。

```
执行高质量章节大纲扩展任务。
startChapter: {X}
endChapter: {Y}
totalTarget: {Z}
mode: structured
请严格按照你的 <context_loading> 规则自行加载所有必要上下文。
```

- `totalTarget` 来自大纲头部元数据（如无则默认不限）
- `mode` 默认 `structured`，用户指定 `--standard` 则传 `standard`
- SubAgent 自行加载上下文（宪法 / outline 全文 / state / 近章摘要 / 上一章全文 / 全部角色），生成结构化章纲并追加到 `outline.md`

### 3. 展示扩纲摘要 & 用户确认

SubAgent 返回扩纲摘要后，主流程展示并请用户确认：

```
━━━ 章节大纲扩展完成 ━━━
范围: 第X章 → 第Y章
模式: structured（结构化章纲）
新增章数: M
新埋伏笔: [ID列表]
预计回收: [ID列表及对应章节]
关键爽点: [每卷最大爽点]
新角色: [新登场命名角色 + 复用性]
```

🔴 **不覆盖已有章节**，只追加。确认后保留写入结果。

### 4. 扩纲后自检

- 新增章节在 `outline.md` 全文中能被明确定位（标题格式 `### 第N章` 保持）
- 新旧衔接处（如第 50→51 章）能从全文直接读出承接关系
- 头部 `当前已规划` 范围已更新
- 追加内容保持全文阅读顺畅、结构清晰
- 🔴 自检失败（如章节号断档、无法定位、衔接断裂）→ 回调 `chapter-outliner` 重做或暂停人工处理

## 边界与约束

- 🔴 **大纲必须完整后才可写设计稿/正文**：若 `novel-batch` 请求范围超出大纲覆盖，仍由 Step O 自动扩纲；本命令用于手动/提前扩纲
- 🔴 遵守 `outline.md` 头部「创作约束」的审核红线与避毒指南（由 chapter-outliner 约束，主流程无需重复）
- 🔴 只允许追加，禁止删除/改写已有章节梗概
- 批量场景（>20 章）：主流程按卷分批调用 chapter-outliner，每批 ≤20 章，串行执行，上一批写完再调下一批

## 与现有命令的关系

| 命令 | 扩纲主体 | 模式 | 适用 |
|---|---|---|---|
| `/novel-design all --extend` | 主流程（零 SubAgent） | 一段式 | 快速追加大纲 |
| `/novel-outline` | SubAgent `chapter-outliner` | 结构化 | 高质量章纲扩写（推荐） |
| `/novel-batch` Step O | SubAgent `batch-outliner` | 一段式 | 批量写作前自动补纲 |
