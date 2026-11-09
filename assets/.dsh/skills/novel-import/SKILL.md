---
name: novel-import
description: 从已有书稿和设定文档导入，构建宪法、摘要、全局状态和风格指纹时使用。输入为书稿目录路径。
whenToUse: 从已有书稿和设定文档导入，构建宪法、摘要、全局状态和风格指纹时使用。输入为书稿目录路径。
---

# novel-import

## 用户输入

```text
$ARGUMENTS
```

用户输入为已有书稿的目录路径或文件说明。

## 目标

将已写到一半的小说接入 Novel-Spec 体系，自动构建所有状态文件，使后续可以用 `/novel-write` 继续写作。

## 上下文管理原则

🔴 **主流程始终保持轻量**，不累积任何章节正文：
```
主流程上下文 ≈ 调度逻辑 + 章节文件名列表 (< 1000字)
每个 SubAgent 调用 = 独立会话，完成后上下文释放
```

## 执行步骤

### 1. 扫描已有文件（主流程）

- 请用户提供：
  - 书稿文件（支持：单文件按章节分隔 / 多文件每章一个）
  - 设定文档（如有，可以是任意格式的世界观/角色设定）
- 扫描文件，识别章节数量和结构
- 🔴 只读文件名和大小，不读正文内容

### 2. 拆分章节（脚本执行，进程外）

🔴 **主流程不读取书稿正文**，由 PowerShell 脚本在进程外完成拆分/归集：

**单文件书稿** → 调用拆分脚本：
```powershell
pwsh -NoProfile -File .dsh/scripts/split-chapters.ps1 -InputFile "用户提供的书稿路径" -OutputDir "novel/chapters"
```


**多文件（每章一个文件）** → 调用归集脚本（同一脚本，不同参数）：
```powershell
pwsh -NoProfile -File .dsh/scripts/split-chapters.ps1 -InputDir "用户提供的书稿目录" -OutputDir "novel/chapters"
```


脚本功能：
- 自动识别章节标记（`第X章` / `Chapter X` / Markdown标题格式）
- 按章拆分写入 `novel/chapters/[NNN]/content.md`（三位数编号补零）
- 自动检测前言/序章内容（写入 `novel/chapters/000/content.md`）
- 输出 JSON 格式统计结果

解析脚本 JSON 输出，向用户展示拆分结果：
```
识别到 42 章（匹配模式: 第X章）：
- 第1章: 2856字 — 第一章 初入江湖
- 第2章: 3012字 — 第二章 暗流涌动
...
总计: 124,320字
请确认拆分是否正确。
```

🔴 主流程**全程不接触正文内容**，只读脚本输出的 JSON 统计（几百字）

### 3. 分片提取宪法（SubAgent × 多轮）

🔴 **不一次读全部章节**，分片处理：

```
每5章一片，调用 SubAgent constitution-extractor：
├── 第1轮: SubAgent 读第1-5章 → 输出 partial-001.yaml（独立会话，完成释放）
├── 第2轮: SubAgent 读第6-10章 → 输出 partial-002.yaml（独立会话，完成释放）
├── ...
└── 第N轮: SubAgent 读最后几章 → 输出 partial-N.yaml
```

每轮 SubAgent 只需加载 ~15000字（5章×3000字），不会溢出。

如有设定文档，第1轮额外加载设定文档。

### 4. 合并宪法草稿（主流程）

- 读取所有 `novel/temp/partial-*.yaml` 文件（每个几百字）
- 合并去重，冲突项标注
- 生成 `novel/constitution.draft.md`
- 展示草稿，🔴 等用户逐项确认：
  ```
  从已有内容提取了以下设定，请逐项确认：

  ## 世界观
  1. [不可变] XXXX ← 确认?
  2. [不可变] XXXX ← 确认?

  ## 角色
  3. 林渊 — 性格: XXX, 说话风格: XXX ← 确认?
  4. 苏晚 — 性格: XXX, 说话风格: XXX ← 确认?

  ## 风格
  5. 叙事人称: 第三人称 ← 确认?
  6. 对话格式: \u201c\u201d ← 确认?
  ```
- 确认后写入宪法目录结构：
  - `novel/constitution/core.md`
  - `novel/constitution/style.md`
  - `novel/constitution/characters/[角色名].md`（每角色一个文件）
- 🔴 `core.md` 只承载世界观 / 力量 / 地理等 `[不可变]` 硬设定；平台审核红线与创作避毒指南不写入 `core.md`，而是在 Step 9 写入 `outline.md` 头部「创作约束」段
- 清理临时 `novel/temp/partial-*.yaml` 文件

### 4b. 生成作品信息（主流程）

🔴 宪法确认后，**立即向用户收集作品信息**并生成 `novel/bookinfo.md`，格式严格遵循 `.dsh/templates/bookinfo.md` 模板。

- 从已确认的宪法草稿中提取可自动填充的字段：
  - **类型**：从 `core.md` 的世界观/题材推断（如"玄幻修仙"）
  - **标签**：从 `core.md` 的设定特征推断（如"系统流"、"重生"）
- 需要用户补充的字段：
  - **书名**（≤15字）
  - **简介**（150~300字，可由 AI 生成草稿供用户确认）
  - **目标平台**（如：番茄小说 / 起点中文网 / 晋江文学城）

展示并确认：
```
从宪法设定推断了部分作品信息，请补充确认：

📖 书名: [请输入，≤15字]
📝 简介: [AI根据宪法生成的草稿，150~300字]
📂 类型: [自动推断] ← 确认?
🏷️ 标签: [自动推断] ← 确认?
📱 目标平台: [请选择/输入]

回复确认或修改。
```

- 确认后写入 `novel/bookinfo.md`
- 🔴 书名值将在 Step 9 大纲头部元数据中引用

### 5. 逐章生成摘要（SubAgent × N轮）

🔴 **每章独立调用 SubAgent `chapter-summarizer`**，每次独立会话：

```
for chapter in 1..totalChapters:
    调用 SubAgent chapter-summarizer:
    ├── 传入: 章节号
    ├── SubAgent 自行读取:
    │   - novel/chapters/[N]/content.md (~3000字)
    │   - novel/constitution/core.md (~500字)
    │   - novel/chapters/[N-1]/summary.md (如存在，~200字)
    ├── 输出: novel/chapters/[N]/summary.md
    └── 会话释放
```

每次 SubAgent 上下文 ≈ 4000字，完成后释放。
主流程始终不累积正文。

### 6. 构建全局状态（脚本）

```powershell
pwsh -NoProfile -File .dsh/scripts/build-state.ps1
```


脚本遍历所有 `summary.md`，构建 `novel/state.yaml`：
- timeline：从每章摘要提取时间线事件
- characters：最后出现的位置/状态（活跃部分）
- foreshadowing：active / resolved 伏笔表
- 🔴 脚本只做聚合，不做内容判断
- 🔴 同时**全量重建** `novel/state/memory-digest.md`（长期记忆摘录：全书逐章一句话剧情 + 专名词表 + 伏笔台账）。导入的老书往往有上百章，这份索引是后续扩纲/写作/校验访问"远期剧情"的唯一入口

### 7. 计算风格指纹基准（脚本）

```powershell
pwsh -NoProfile -File .dsh/scripts/compute-style.ps1
```

默认以前10章正文建立固定基准（不足10章时先记录部分样本，补满后再生效）：
- 平均句长（中文字数）+ 中位句长
- 对话占比
- 平均段落字数 + P50 / P75 段长
- 极短段(<12字)占比 / 超长段(>=60字)占比
- 叹号频率
- 🔴 **`baselineHealthy`（基准体检结论）**：导入的老书常见"句子偏短/一逗到底"，脚本会按人类成书基线体检并标记。
  `false` 表示这套基准**不适合当母本**，应先修采样章节的节奏再 `-Rebuild`（导入阶段不阻塞流程，但会在导入报告中提示）
- 🔴 基准冻结后，后续章节只与这套前10章母本对比，不随正文继续漂移


### 8. 全书一致性扫描（脚本）

```powershell
pwsh -NoProfile -File .dsh/scripts/validate-chapter.ps1 -Chapter All
```


对已有章节做一次全量校验，生成 `novel/validation/import-report.md`
- 🔴 导入阶段的 WARNING/ERROR 仅记录不阻塞（已有内容不强制改）

### 9. 生成大纲骨架（主流程）

🔴 导入流程必须生成 `novel/outline.md`，供后续 `/novel-batch`、`batch-outliner`、`batch-designer`、`continuity-validator` **直接全文读取**。

#### 9a. 收集素材

- 🔴 **优先读 `novel/state/memory-digest.md`（1 次读取搞定全书）**：Step 6 已全量重建，其第一节就是"全书逐章一句话剧情索引"，等价于逐章 `### 剧情` 段的聚合；第二节专名词表、第三节伏笔台账可直接用于大纲的专名统一与伏笔规划
- 读取 `novel/state.yaml` 中的 `foreshadowing`（active / resolved 伏笔表）
- 仅当 digest 缺失时才回退到"逐章读取 `summary.md` 的 `### 剧情` 段"（章节数 > 50 时每批 20 章分批读取，拼接后统一生成）

#### 9b. 生成结构化大纲

基于上述素材，生成**结构化、可全文直读**的 `novel/outline.md`，建议包含以下信息块：

**① 头部创作约束**（必填）：
- 写入 `## 创作约束` 段，包含：平台通用审核红线（死线 / 黄线 / 弹性区）+ 从设定文档 / `outline_constraints` / 宪法草稿中提炼出的本书避毒指南 + 豁免项
- 🔴 这是后续 `batch-designer` / `novel-writer` / `continuity-validator` 的权威约束来源
- 🔴 这里写的是创作约束，不替代 `core.md` 中的 `[不可变]` 世界观硬设定

**② 头部元数据**（必填）：
```markdown
**书名**: [从 novel/bookinfo.md 的书名字段获取（Step 4b 已生成）]
**预计总章数**: [用户确认；若用户未定，填"待定"]
**当前已规划**: 第1-N章（N=已导入章数）
**规划模式**: 分段规划
**类型/标签**: [从 novel/bookinfo.md 的类型/标签字段获取]
```

**③ 全书走向（粗纲）**（必填）：
- 从所有摘要中提炼 3-5 句话概述主线走向（开篇 → 当前进度的脉络）
- 如果导入的不是全书（只导入到一半），**只描述已有内容的走向**，末尾标注"（后续待续）"
- **阶段划分**：根据已有剧情的节奏变化，粗分为若干阶段，每阶段一句话核心矛盾

**④ 主线剧情**（必填）：
- 3-5 句话概述已有内容的主线

**⑤ 章节级规划**（必填，🔴 这是 batch 流程的核心依赖）：
- 根据剧情节奏自动分卷（若无明显分卷标记，按 ~20-30 章一卷粗分）
- 每个已导入章节都要有**可定位的章节级规划信息**
- 可采用表格 / 列表 / 分卷小节等结构化形式，满足以下条件即可：
  - 能直接定位“第N章”或等价章节标记
  - 能读出该章的梗概、关键事件、伏笔操作、节奏（如未单独列出节奏，可写在同一条描述里）
  - 后续 `batch-designer` / `novel-writer` / `continuity-validator` 能从 `outline.md` **全文**直接理解本章计划
- **梗概**：从 `### 剧情（≤100字）` 压缩到 50 字内
- **关键事件**：重大情节节点（战斗、揭示、转折等），普通章可留空
- **伏笔操作**：从 `state.yaml` 的 foreshadowing 匹配，格式为 `📌F-x-x`（埋设）或 `✅F-x-x`（回收），无则留空
- **节奏**：可标注 `铺垫` / `上升` / `高潮` / `过渡` 四选一；如未显式标注，后续设计阶段可结合全文语境判断

**⑥ 支线剧情 / 关键转折点 / 伏笔规划**（选填）：
- 从已有内容能识别出的支线、转折点、伏笔，按模板表格格式填入
- 识别不出的可留空表格占位（保留段标题和表头）

#### 9c. 展示并确认

展示生成的大纲，🔴 等用户确认：
```
从已有内容生成了结构化大纲（后续可通过 /novel-design all 调整）：

📋 头部创作约束: 已写入死线 / 黄线 / 弹性区 / 本书避毒指南 / 豁免项
📋 头部元数据: 书名=[X], 当前已规划=第1-42章, 规划模式=分段规划
📋 全书走向: [3句话摘要]
📋 章节级规划: 共X卷，42章全部覆盖（可全文定位）
📋 伏笔: 已标注 X 个埋设 / X 个回收

确认写入 novel/outline.md？
```

- 确认后写入 `novel/outline.md`
- 写入后执行自检：
  - `outline.md` 头部是否存在可直接读取的 `## 创作约束` 段
  - 已导入章节是否都在 `outline.md` 全文中具备**可定位的章节级规划**
  - 后续 `batch-designer` / `novel-writer` / `continuity-validator` 是否能直接从全文理解当前章目标、关键事件、创作约束与前后衔接
  - 全文结构是否清晰、连续、便于维护

### 10. 提示下一步

```
✓ 导入完成
- 已导入 42 章
- 作品信息: novel/bookinfo.md（书名+简介+类型+标签+平台）
- 宪法: novel/constitution/ (core.md + style.md + 角色文件)
- 大纲: novel/outline.md（头部含创作约束，从摘要自动生成的骨架）
- 状态: novel/state.yaml（风格指纹已处理：满10章则前10章固定基准已生效；不足10章则已记录样本，待补满后生效）

- 验证报告: novel/validation/import-report.md

下一步：
- 继续写第43章：/novel-design 43
- 调整大纲：/novel-design all
- 查看/调整宪法：/novel-constitution
- 查看验证报告中的问题：/novel-validate all
```

## 上下文占用对比

| 步骤 | 主流程上下文 | SubAgent 上下文 | 说明 |
|------|-------------|----------------|------|
| 1 扫描文件 | ~500字 | — | 只读文件名 |
| 2 拆分章节 | ~200字 | — | 脚本进程外执行，主流程只读JSON输出 |
| 3 提取宪法 | ~500字 | ~15000字/轮 | 每轮独立会话 |
| 4 合并宪法 | ~2000字 | — | 读 partial 文件 |
| 4b 作品信息 | ~500字 | — | 读宪法推断类型/标签+用户输入书名简介 |
| 5 生成摘要 | ~500字 | ~4000字/章 | 每章独立会话 |
| 6-8 脚本 | ~200字 | — | 进程外执行 |
| 9 大纲骨架 | ~12000字（100章时） | — | 读所有摘要剧情行+state伏笔+宪法元数据，分批处理 |

🔴 **Step 9 是主流程上下文峰值**：100 章时摘要剧情行约 10000字 + state 伏笔约 1000字 + 宪法元数据约 500字。超过 50 章时分批读取（每批20章），峰值可控在 ~3000字左右。

## 约束

- 🔴 **所有章节路径使用三位数补零格式**：`novel/chapters/001/`、`novel/chapters/052/`（即 `{0:D3}` 格式），如 `novel/chapters/[NNN]/content.md`
- 🔴 主流程**禁止**读取章节正文内容，正文只由 SubAgent 在独立会话中读取
- 🔴 宪法草稿必须经用户确认，AI 不得自行定稿
- 🔴 state.yaml 由脚本聚合生成，AI 不直接写 state.yaml
- 🔴 导入阶段不修改已有内容，只生成元数据文件
- 🔴 临时文件（novel/temp/partial-*.yaml）在合并完成后必须清理
- 🔴 **执行 .ps1 脚本必须使用 `pwsh -NoProfile -File` 方式，禁止 `-Command`**（`-Command` 会导致脚本中 `$` 变量和 `` `u{} `` 转义被 shell 二次解析，引发静默失败）
