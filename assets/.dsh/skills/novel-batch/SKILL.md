---
name: novel-batch
description: 批量自动写作一段章节时使用。输入为章节范围，如 1-100 或 15-50。含断点续写与定期检查点。
whenToUse: 批量自动写作一段章节时使用。输入为章节范围，如 1-100 或 15-50。含断点续写与定期检查点。
---

# novel-batch

## 用户输入

```text
$ARGUMENTS
```

支持格式：

- `1-100` — 从第1章写到第100章（默认不暂停，一口气写完）
- `15-50` — 从第15章写到第50章
- `--resume` — 从 state.yaml 记录的断点处续写
- `--check N` — 每N章暂停一次让用户审阅（不加此参数则不暂停）
- `--skip-design` — 已有 design.md 的章节不重新生成设计稿（**注意**：即使复用 design.md，Step A1/A2 校验仍必须执行，不可跳过）

示例：

```
/novel-batch 1-100
/novel-batch 1-100 --check 20
/novel-batch --resume
/novel-batch 30-60 --check 10
```

## 由确定性引擎驱动（本技能只承担创作工作）

本技能是**工人参考材料**，不是流程控制器。阶段顺序、门禁、重试、断点与放行
全部由插件的 JS 状态机（`lib/orchestrator.js`）代码裁决，脚本退出码是唯一质量
裁判；模型不决定阶段是否通过，也不自行输出流程宣告或检查点口号。

- 收到引擎派发的类型化参数（章节号、步骤 id）后，只完成本步骤的创作任务。
- 需要校验时如实报告证据；是否放行由引擎按事实文件裁决。
- 不得输出任何面向用户的流程宣告、检查点口号或固定措辞文本。
- 不得整章重写；回修只改问题处；`state.yaml` 剧情字段只由 `sync-state.ps1` 写入。
- 脚本一律 `pwsh -NoProfile -File .dsh/scripts/<name>.ps1 -Chapter <整数>`，禁止 `-Command`。

以下为创作工作的参考细节。

## 前置检查（主流程）

- [ ] **0. 粗略解析参数**：先解析 `$ARGUMENTS` 得到 `startChapter` / `endChapter` / `checkpointInterval`（`--resume` 则从 `state.yaml.batchProgress` 读取这三项），后续所有检查与 Step O 均依赖这三个值；正式的参数确认与计划展示在 Step 1 进行
  - 🔴 `--resume` 时若 `batchProgress` 字段不存在或关键项缺失 → 报错阻断：无断点可续，请改用章节范围参数（如 `1-100`）
- [ ] 检查 `novel/constitution/core.md` 是否存在 → 不存在则报错，提示先执行 `/novel-constitution`
- [ ] 检查 `novel/constitution/style.md` 是否存在 → 不存在则报错，提示先执行 `/novel-constitution`
- [ ] 检查 `novel/outline.md` 是否存在 → 不存在则报错，提示先执行 `/novel-design all`
- [ ] **全局状态一致性检查**：
  - 读取 `novel/state.yaml`（如存在），获取 `lastChapter` 和 `batchProgress`
  - 🔴 **状态缺失检测**：若 `startChapter > 1` 且 `novel/state.yaml` 不存在 → 报错阻断，提示必须找回该文件，否则剧情数值和伏笔档案将全线崩塌
- [ ] **长期记忆摘录检查**（仅 `startChapter > 21` 时执行，一次性，不进入章节循环）：
  - 读取 `novel/state/memory-digest.md` 头部 `<!-- covered: 1-K -->`
  - 文件不存在，或 `K < lastChapter` → 执行一次补齐（脚本增量，秒级；老项目首次会全量扫描一遍 summary）：
    ```powershell
    pwsh -NoProfile -File .dsh/scripts/build-memory-digest.ps1
    ```
  - 失败只记 WARNING，不阻断（远期记忆索引缺失时，bundle 会跳过该段并告警）
- [ ] **大纲覆盖度检查**（详见 Step O）：
  - 读取 `novel/outline.md` **全文**
  - 🔴 **覆盖判断标准**：只要全文中存在能够明确定位到某章节的规划信息（如章节标题、列表项、表格行、分卷条目中的章节说明等），该章节就算已规划
  - 以下内容**不算**逐章覆盖：
    - `## 待续篇章` 下的模糊主线悬念描述
    - `## 待回收伏笔` 等仅做索引/档案用途的表格
    - 只描述卷目标/阶段划分、但无法落到具体章节的概要性文字
  - 确定 `outlineCoveredEnd`：`outline.md` 全文中最后一个被**明确规划到章节级**的章节号
  - 如 `startChapter > outlineCoveredEnd` 或 `endChapter > outlineCoveredEnd` → 需要自动扩纲（Step O）
  - 如已全部覆盖 → 跳过 Step O，直接进入 Step 1

🔴 **主流程始终保持轻量**：只持有调度状态（当前进度、错误计数），不累积任何章节正文。

🔴🔴🔴 **上下文不足强制断点规则**：
当主会话上下文接近容量上限（感知到响应变慢、思考变浅、开始产生"由于时间/上下文限制"类想法）时，**必须立即执行以下操作**：

1. **立即停止当前流水线**，不得以任何理由"简化流程"/"快速完成"/"跳过步骤"
2. 将当前进度写入 `novel/state.yaml` 的 `batchProgress`（设置 `nextChapter` 为**当前未完成章**的章节号）
3. 向用户输出断点通知：
   ```
   ━━━ 上下文容量不足，已保存断点 ━━━

   已完成: 第X章（进度已保存）
   断点位置: 第Y章 [具体阶段: 设计/写作/验证/摘要/同步]

   请开启新会话，执行:
   /novel-batch --resume
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```
4. **然后立即结束响应**，不再执行任何后续操作

🔴🔴🔴 **以下行为是绝对禁止的（严重违规）**：

- ❌ "由于时间和上下文限制，我将快速完成剩余章节"
- ❌ "由于时间关系，我采用简化流程继续批量写作"
- ❌ "让我快速扩充第X-Y章并完成批量写作"
- ❌ 主流程在连产正常时重写 summary.md（由 novel-writer 在 Step B 连产）
- ❌ 主流程自行生成 content.md（必须通过 SubAgent novel-writer）
- ❌ 主流程自行生成 design.md（必须通过 SubAgent batch-designer）
- ❌ 跳过设计稿直接写正文
- ❌ 跳过验证直接生成摘要
- ❌ 跳过 Step D2/D3/D4 中的任何子步骤
- ❌ 一次性把多章正文塞进同一个 content.md
- ❌ 降低正文质量/字数来"赶进度"
- ❌ 用任何"简化""加速""压缩""由于时间关系"字眼合理化跳过流程的行为
  **上下文不足 = 只能停下来，不能降质赶工。宁可少写一章高质量的，也不要多写十章垃圾。**
  **想说"由于时间关系"的那一刻 = 立刻保存断点并停止响应。**

---

## 执行流程

### Step O: 大纲自动同步（OutlineSync）

🔴🔴🔴 **此步骤在主循环之前执行，确保请求范围内的所有章节都有逐章大纲。**

**触发条件**：前置检查发现 `endChapter > outlineCoveredEnd`（请求范围超出大纲已覆盖范围）

**执行逻辑**：

```
needOutlineFrom = outlineCoveredEnd + 1
needOutlineTo = endChapter

🔴 注意：即使 startChapter > outlineCoveredEnd + 1（中间有间隔），
也必须从 outlineCoveredEnd + 1 开始补齐，不允许跳过中间章节。
例如：大纲到第40章，请求 batch 50-100
→ 必须补齐 41-100 的大纲（不能只补 50-100）
→ 因为第50章设计时需要参考 41-49 的大纲脉络
```

**分批扩纲**（每批 ≤ 20章，按卷分批）：

```
扩纲范围: needOutlineFrom → needOutlineTo
按每批最多20章分割:
  batch1: needOutlineFrom → min(needOutlineFrom + 19, needOutlineTo)
  batch2: batch1_end + 1 → min(batch1_end + 20, needOutlineTo)
  ...

for each batch:
    调用 SubAgent batch-outliner（独立会话）:
    ├── 传入: startChapter=batchStart, endChapter=batchEnd, totalTarget=全书预计总章数
    ├── SubAgent 自行加载上下文（按 batch-outliner.md 的 <context_loading> 规则）
    ├── 生成逐章大纲梗概，追加到 novel/outline.md
    ├── 返回: 扩纲摘要（新增卷数、章数、伏笔操作、关键爽点）
    ├── 执行 validate-outline.ps1 做结构校验
    ├── 调用 continuity-validator(stage=outline) 做语义评审
    ├── 如有 CRITICAL / ERROR，由主会话最小回修并重新校验
    └── 当前批次通过后才进入下一批 ✓
```

🔴🔴🔴 **SubAgent 调用 prompt 白名单（适用于本文件中所有 SubAgent 调用）**

**prompt 模板与禁止项以全局规则 `.dsh/rules/subagent-prompt-whitelist.mdc` 为唯一出处**（该规则 `alwaysApply: true`，已常驻上下文，本文件不再复制一遍）。一句话原则：**主流程只当调度员，传参数 + 一句"请严格按照你的 `<context_loading>` 规则自行加载所有必要上下文"，不列文件、不提剧情、不当导演。**

本命令用到的参数一览（其余格式细节见上述规则）：

| SubAgent | 传入参数 | 本命令中的取值来源 |
|---|---|---|
| `batch-outliner` | `startChapter` / `endChapter` / `totalTarget` | 分批范围；`totalTarget` 取 `outline.md` 头部"全书预计总章数"，读不到传 `不限` |
| `batch-designer` | `chapter` | 🔴 只能是单个章节号，禁止范围 |
| `novel-writer` | `chapter` / `characters` / `foreshadow_ids` | 后两项从本章 `design.md` 提取 |
| `continuity-validator` | `stage` + (`chapter` 或 `rangeStart`/`rangeEnd`) | 本命令只用 `outline`（Step O1）与 `design`（A2）、`chapter-full`（D4）三种 stage |

> novel-writer 会在同一次会话内连产 `content.md + summary.md`（含角色演化同步）。返回报告中"摘要连产: 否"时，进入 Step D1 走兜底路径。

🔴 **校验后的回修不再回调 SubAgent**：`novel-writer` / `batch-designer` / `batch-outliner` 只负责初稿；校验结果返回后，由主会话读取验证报告与相关文件，按 `main-repair` 路由做最小必要修改，再重跑后处理和校验。不得把错误详情再次塞给 SubAgent 反复回修。

🔴 **分批扩纲的串行规则**：

- 每批必须等上一批完成并写入 `outline.md` 后，才能开始下一批
- 因为下一批需要读取上一批的大纲末尾来保持剧情衔接
- 🔴 禁止并行调用多个 batch-outliner

**扩纲批次生成后**：

```
展示本批扩纲结果摘要:
━━━ 大纲批次扩展完成 ━━━
补充范围: 第batchStart章 → 第batchEnd章（共Z章）
新增卷数: N卷
关键爽点预览:
  - 第XX章: [爽点描述]
  - 第XX章: [爽点描述]
  ...
伏笔新增: M个
━━━━━━━━━━━━━━━━━━━

→ 当前批次进入 Step O1 语义评审...
```

**Step O1：大纲语义评审（每个扩纲批次必执行）**

```text
调用 SubAgent continuity-validator（独立会话）
├── stage: outline
├── rangeStart: batchStart
├── rangeEnd: batchEnd
├── 评审对象：本批新增大纲 + 扩展前已有大纲 + state.yaml + 实际前文
└── 输出：PASS / WARNING / CRITICAL + 覆盖边界 + 修复路由建议
```

🔴 **PASS 直接放行**；validator 报出 CRITICAL / WARNING 时，主会话才须对照大纲、state、实际前文等文件事实独立核验，误报可驳回（记录理由），漏报须补入评审结果；确认是真问题后才进入回修。

- 评审重点：全书方向、卷目标、前文衔接、时间线、角色状态、资源数值、伏笔因果、逐章可执行性和节奏密度
- `PASS` 或仅有 `observe-only` WARNING → 进入下一批扩纲或 Step 1
- `CRITICAL / ERROR` → 进入 Step O2，不得直接生成设计稿

**Step O2：大纲评审后的主会话回修**

- 主会话读取 `outline.md`、评审结果和必要上下文，只做最小修改
- 不回调 `batch-outliner` 重写，不整批推翻，不擅自改变全书方向
- 回修后依次重跑 `validate-outline.ps1` → `continuity-validator(stage=outline)`
- 直到 `CRITICAL / ERROR` 清零；无法安全判断时标记 `manual-review` 并暂停
- 当前批次通过后，才允许开始下一批扩纲；全部批次通过后才进入 Step 1

**每批扩纲后的处理规则**：

- 检查本批新增章节是否已经写入 `outline.md`，并且能在全文中被明确定位（逐章可定位性，参考前置检查的"大纲覆盖度"判断标准）
- 执行脚本最小可用性检查：
  ```powershell
  pwsh -NoProfile -File .dsh/scripts/validate-outline.ps1 -StartChapter {batchStart} -EndChapter {batchEnd}
  ```

  ⚠️ 该脚本只检查 `outline.md` 存在/非空/参数合法，**不做逐章模板校验**；逐章完整性由主流程按"大纲覆盖度"标准确认
- 可用性检查通过后进入 **Step O1：大纲语义评审**，调用 `continuity-validator(stage=outline)` 检查全书方向、实际剧情衔接、节奏、角色、资源和伏笔链
- 语义评审 `PASS` 或仅有可观察 `WARNING` → 当前批次完成，才允许开始下一批扩纲
- 任何 `CRITICAL / ERROR` → 进入 **Step O2：主会话最小回修**，修复后重新执行 `validate-outline.ps1` 和 `continuity-validator(stage=outline)`，直到清零或转 `manual-review`

**扩纲失败处理**：

- 如某批 `batch-outliner` 返回异常或写入失败 → **立即暂停批量流程**
- 如结构校验失败 → 主会话只修正明确的格式/覆盖问题；无法安全判断时暂停
- 如语义评审发现方向、时间线、资源或伏笔硬冲突 → 主会话按报告最小回修，禁止回调 `batch-outliner` 反复重写
- 主会话无法确定修复会不会改变全书方向 → 标记 `manual-review`，展示问题并暂停
- 🔴 禁止在大纲未通过结构与语义评审的情况下开始章节流水线（没有可靠大纲的设计稿会失去方向约束）

---

### 1. 解析参数 & 初始化

```
输入: "1-100"
  → startChapter = 1
  → endChapter = 100
  → checkpointInterval = 0（默认不暂停，一口气写完）
  → totalChapters = 100

输入: "1-100 --check 20"
  → startChapter = 1
  → endChapter = 100
  → checkpointInterval = 20
  → totalChapters = 100

输入: "--resume"
  → 从 novel/state.yaml.batchProgress 读取:
    → startChapter = batchProgress.nextChapter
    → endChapter = batchProgress.endChapter
    → checkpointInterval = batchProgress.checkpointInterval
```

展示批量写作计划：

```
━━━ 批量写作计划 ━━━
范围: 第1章 → 第100章（共100章）
检查点: 无（一口气写完）            ← checkpointInterval == 0 时
检查点: 每20章暂停审阅              ← checkpointInterval > 0 时
预估总字数: ~XXX,XXX字（wordCount.target 缺省2500字/章 × 总章数，取 .dsh/config.yaml 的 wordCount 段）
```

🔴 **全自动模式：展示计划后直接开始执行，不需要用户确认**。参数已在命令中指定，前置检查已确保合法性；如需调整参数，请中止后重新调用命令。

### 2. 主循环（核心）

🔴🔴🔴 **禁止自行暂停**：当 `checkpointInterval == 0`（用户未指定 `--check`）时，主循环必须**一口气跑完所有章节**，中途**严禁**以任何理由暂停、询问用户"是否继续"、"继续吗"、请求确认。这包括但不限于：

- ❌ "由于是长时间任务，主人可以选择：继续执行 / 暂停休息"
- ❌ "已完成X章，继续吗？"
- ❌ "我将继续处理第X-Y章，继续吗？"
- ❌ 任何形式的中途进度汇报后等待用户回复

唯一允许暂停的情况：

- ✅ `checkpointInterval > 0` 且到达检查点
- ✅ 某章流水线失败（设计/写作/验证重试耗尽）

```
for N in startChapter..endChapter:
    执行 ChapterPipeline(N)
    更新进度
    如果 checkpointInterval > 0 且 N % checkpointInterval == 0，执行检查点暂停
    否则，直接进入下一章（🔴 禁止暂停询问）
```

🔴🔴🔴 **绝对禁止任何形式的"简化流程"或"并行优化"**：

- ❌ 禁止同时创建多章的目录
- ❌ 禁止同时调用多个 batch-designer 生成多章设计稿
- ❌ 禁止同时调用多个 novel-writer 生成多章正文
- ❌ 禁止在第N章的 Step E 完成之前，开始第N+1章的任何操作（包括创建目录）
- ❌ 禁止以"篇幅较长""简化流程""提高效率""由于时间关系"为由跳过任何步骤或合并任何步骤
- ✅ 每章必须严格按 A0→A→A1→A2→B→B2→C→D1→D2→D3→D4→E 完整走完，才能进入下一章的 Step A0
- ✅ 循环体内永远只有**一章**在执行，上一章的 Step E 输出进度行后，才允许开始下一章的 Step A0

#### ChapterPipeline(N) — 单章完整流水线

每一章严格按以下顺序执行，**前一步完成后才进入下一步**：

---

**Step A0: 构建 / 重建 context-bundle（design 变更同步钩子）**

🔴🔴🔴 **触发时机（同一步骤，可在本章内多次触发）**：

1. **进入 Step A 之前**（每章必执行一次）——给 `batch-designer` 准备上下文缓存
2. **design.md 落盘或被改动之后、进入下一环节之前**（无条件执行，不判断是新生成还是复用）——让 `continuity-validator` 读到最新设计稿
   - 即：`Step A` 生成/确认 design.md 后 → 重建；`A1` / `A2` 回修过 design.md 后 → 重建，再复跑 A1/A2
   - 重建开销 <1s，但可避免 validator 读到旧设计稿而误判

为后续 SubAgent（batch-designer / continuity-validator）预先合并高频上下文文件，显著减少零散读文件次数，降低超时风险。

```
主流程读取 novel/chapters/[NNN]/design.md（如已存在），提取:
├── 伏笔回收 ID 列表（用于 bundle 中的伏笔关联加载）
└── 如 design.md 不存在，ForeshadowIds 留空（设计阶段暂不需要伏笔关联）
```

```powershell
pwsh -NoProfile -File .dsh/scripts/build-context-bundle.ps1 -Chapter N
# 或带伏笔参数：
pwsh -NoProfile -File .dsh/scripts/build-context-bundle.ps1 -Chapter N -ForeshadowIds "F-16-1,F-18-2"
```

脚本自动合并以下内容到 `novel/chapters/[NNN]/context-bundle.md`：

- 宪法核心 (core.md + style.md)
- 全局状态 (state.yaml)
- 设计稿模板
- 全部角色设定
- 近章完整摘要 (N-2 ~ N-10)
- 远章压缩段 (N-11 ~ N-20)
- 🔴 **远期记忆索引 (第1章 ~ N-21)**：逐章一句话剧情 + 专名/细节词表（脚本自动刷新 `novel/state/memory-digest.md` 后分层嵌入，体积由 `config.yaml` 的 `memory` 段控制）
- 伏笔关联摘要 (去重)
- 本章设计稿 (如已存在)
- 上一章全文 (content.md)

🔴 **记忆结构总览（四层，全自动维护，主流程无需额外操作）**：

| 层 | 范围 | 载体 | 生产者 → 装配者 |
|---|---|---|---|
| 短期（全文级） | 上一章正文 | `content.md` | novel-writer → SubAgent 直读 |
| 中期（摘要级） | N-2~N-10 完整 / N-11~N-20 压缩 | 各章 `summary.md` | novel-writer 连产 → `build-context-bundle.ps1` |
| 长期（索引级） | 第1章 ~ N-21 | `novel/state/memory-digest.md` | `sync-state.ps1` 每章增量 → bundle 分层嵌入 |
| 状态（数值级） | 当前快照 + 冷归档 | `novel/state.yaml` + `state/*.yaml` | `sync-state.ps1` |

🔴 **失忆区已封堵**：长期层解决的正是"第 60 章时完全不记得第 10 章写过什么"导致的**桥段重复、伏笔遗忘、专名漂移**三类长篇事故。

🔴 **bundle 的定位是缓存，不是唯一真相源**：

- `batch-designer` / `continuity-validator` 优先读 bundle，但**始终额外直读 `outline.md` 全文**作为权威真相源
- `novel-writer` **不依赖 bundle**，采用设计稿驱动的轻量加载（主读 design.md + 宪法核心 + `outline.md` 头部创作约束 + 上一章正文 + 必要角色设定）

🔴 **outline 的使用方式**：

- `context-bundle.md` 聚合高频上下文缓存
- `batch-designer` / `continuity-validator` 在各自阶段直读 `outline.md` 全文，定位本章计划与衔接关系
- 🔴 **禁止主流程在 ChapterPipeline 中直接编辑 `outline.md`**。如确认大纲确实缺失，只能回退到 **Step O** 由 `batch-outliner` 处理，或暂停等用户人工修复

🔴 **脚本会检测近章摘要和上一章全文缺失**：

- `[RETRY_SUMMARIZER]`（近 3 章有 `content.md` 但缺 `summary.md`）→ **主流程必须先为缺失章节补跑摘要链**：逐章按模板补生成 `summary.md` → `validate-summary.ps1` → `sync-state.ps1`，全部补完后重新执行 Step A0
- `[RETRY_WRITER]`（上一章 `content.md` 不存在）→ **立即暂停批量流程**，提示用户先完成上一章的完整写作流水线后 `--resume`（这是链式依赖，无法自动修复）

🔴 其他普通脚本失败（如 IO/编码偶发问题）→ 可记录 WARNING，并允许 SubAgent 回退到逐个加载模式（路径 B）。长期记忆摘录刷新失败只告警、不阻断。

---

**Step A: 设计稿（如缺失则自动生成）**

🔴🔴🔴 **严禁批量生成设计稿**：每次只调用 batch-designer 生成**当前章N一章**的设计稿，生成完成后必须立即进入 Step B 写作。**禁止**一次性为多章（如1-20章）批量生成设计稿。每章的设计依赖上一章的 content.md 进行衔接，必须等上一章完整流水线（设计→写作→验证→摘要→同步）全部完成后，才能开始下一章的设计。

🔴🔴🔴 **SubAgent 调用时的 prompt 必须明确指定单章号**：传入 `chapter=N`（单个数字），**禁止**传入章节范围（如 `1-20`）。Task 描述中也**禁止**出现"批量生成第X-Y章设计稿"字样，应写为"生成第N章设计稿"。

检查 `novel/chapters/[NNN]/design.md` 是否存在：

- 存在 → **不重生稿**，标记为"复用已有 `design.md`"，但**仍必须继续执行 Step A1 + Step A2 校验**；任一校验失败都必须先修复 `design.md`，再进入 Step B
- 不存在 → **先运行模板脚本生成合规骨架**（格式 100% 符合 validate-design.ps1 解析规则，自动从 state.yaml 预填时间线/角色位置/活跃伏笔、从 outline.md 提取梗概；生成后自带一次骨架校验）：

```powershell
pwsh -NoProfile -File .dsh/scripts/create-design-template.ps1 -Chapter N -Force
```

然后调用 SubAgent `batch-designer` 在**骨架基础上填充**生成**仅当前章**的设计稿（🔴 禁止从零手写格式，保留骨架段落结构/场景表格/伏笔操作格式，只替换占位符与示例文字）：

```
调用 SubAgent batch-designer（独立会话）:
├── 传入: chapter=N（🔴 只传单个章节号，禁止传范围）
├── SubAgent 自行加载（按 batch-designer.md 的 <context_loading> 规则）:
│   ├ 🔴 优先读 novel/chapters/[NNN]/context-bundle.md（Step A0 已生成，缓存绝大多数上下文，含上一章全文）
│   ├ 🔴 然后直读 `novel/outline.md` **全文**，从全书走向 + 当前章规划 + 前后章节关系中定位本章设计约束
│   └ 如 bundle 不存在则回退逐个加载（core+style+state+outline全文+characters+摘要+上一章content等）
├── 生成 novel/chapters/[NNN]/design.md
├── 返回: 设计稿摘要（场景数、出场角色、伏笔操作）
└── 会话释放 ✓
```

🔴 **design.md 就绪后立刻回到 Step A0 重建一次 bundle**（无条件，带 `-ForeshadowIds "从design.md提取的伏笔ID"`），确保 validator 读到的是最新设计稿；然后进入 A1。

**Step A1: 设计稿脚本校验**

🔴 **无论 `design.md` 是新生成还是已存在复用，都必须执行这一轮脚本校验**：

```powershell
pwsh -NoProfile -File .dsh/scripts/validate-design.ps1 -Chapter N
```

- PASS → 进入 Step A2
- FAIL → 按以下规则修正，修正后重新校验（不限次数，直到 PASS）：

  **角色文件缺失 ERROR 修正规则**：
  🔴🔴🔴 **严禁通过删除角色来消除 ERROR**。必须按以下流程处理：

  1. 先判断该角色是否为本章剧情**命名角色**（有名字、有对话、有行动、推动剧情）还是**泛称/背景角色**（无名的功能性存在，可替换）
  2. **命名角色（新角色）** → 🔴 **必须创建设定文件**：在 `novel/constitution/characters/` 下创建该角色的 `.md` 设定文件（参考已有角色设定模板，至少包含：姓名、身份、性格特征、与主角关系），然后重新校验
  3. **泛称/背景角色** → 在设计稿场景表格中将该名称改为 `~泛称~` 格式（如"东方技术人员"→"`~技术员~`"），脚本会自动跳过泛称角色的设定文件检测
  4. 🔴 **禁止**直接从设计稿的场景表格中删除该角色行或删除涉及该角色的场景
  5. 🔴 **判断标准**：如果大纲/剧情中明确提到该角色名字，或该角色有对话、有行动线、未来还会出场 → 一定是命名角色，必须建文件；如果只是"某个技术员""一名哨兵"这类无名背景 → 泛称

  **篇幅占比/节奏修正规则**：

  - 优先调整场景篇幅占比，使整章节奏更合理；设计稿使用百分比而非具体字数
  - 🔴 正文硬约束仍是 `.dsh/config.yaml` 的 `wordCount` 段（缺省 2000-3500 字）；禁止通过删除场景来"凑字数"，应调整描写密度或篇幅侧重

  **伏笔 ID ERROR 修正规则**：

  - 检查 `novel/state.yaml` 中 active 伏笔的实际 ID 格式，修正设计稿中的 ID 引用
  - 🔴 **禁止**通过删除伏笔回收来消除 ERROR
- 仍 FAIL → 🔴 **立即暂停批量流程**，展示设计稿错误详情，等用户手动修复后 `--resume` 续写（因为没有合格设计稿就无法写正文，没有正文下一章也无法衔接）

**Step A2: 设计稿语义连续性 & 三方一致性校验（SubAgent）**

调用 SubAgent `continuity-validator`，使用 `stage=design` 对 `design.md` 做语义级连续性审计，重点检查：

🔴 **PASS 直接放行**；validator 报出 CRITICAL / WARNING 时，主会话才须对照正文、设计稿、state 等文件事实独立核验，误报可驳回（记录理由），漏报须补入验证报告；确认是真问题后才按下述规则回修。

- 🔴 **大纲覆盖度**：从 `outline.md` 提取本章事件/目标，逐条检查 `design.md` 是否为每个事件安排了对应场景；大纲事件被设计稿遗漏 → CRITICAL
- 🔴 **偏航预警**：设计稿新增了大纲未提及的重大事件 → WARNING
- 时间线是否和上一章 / `state.yaml` / `outline.md` 连续
- 角色位置、伤势、知情边界是否合理
- 数值链 / 库存链 / 装备来源是否自洽
- 伏笔安排是否可执行、是否误回收/漏回收
- **宪法合规**：设计稿场景 / 角色能力 / 信息获取方式是否违反 `core.md` 的 `[不可变]` 硬设定（与 validator 第 14 项对齐）
- 是否存在"脚本能过，但设计一写就会炸"的硬逻辑问题

结果处理：

- **CRITICAL / ERROR** → 主会话读取 `design.md`、验证报告和必要上下文，按 `main-repair` 做最小回修；修复后**先回到 Step A0 重建 bundle**，再重新执行 `validate-design.ps1 + continuity-validator(stage=design)`。不得回调 `batch-designer` 做回修，不得整稿重写。
- **WARNING / PASS** → 如本轮 A1/A2 改动过 `design.md`，先回到 Step A0 重建 bundle；随后进入 Step B
- 主会话无法判断或需要改变章节方向 → 标记 `manual-review`，暂停等待用户，不调用 SubAgent 代改。

---

**Step B: 写作**

🔴 **断点恢复 / 已有正文处理规则**：如 `novel/chapters/[NNN]/content.md` 已存在，**禁止**仅因正文文件存在就整章跳过。必须区分：

- `content.md` 存在，但 `summary.md` 缺失、`state.yaml` 未同步、或该章未完整通过 Step C / Step D → 视为**半成品章**，**不得重写正文**，但必须从 **Step B2 → Step C → Step D → Step E** 重新补齐后处理、验证、同步和进度写回
- `content.md`、`summary.md`、`state.yaml` 已齐全，且该章已完整通过验证与同步 → 才允许在主循环中标记为已完成并进入下一章
- 🔴 **禁止**只因为 `content.md` 存在就跳过本章全部流水线，否则脏 `summary.md` / `state.yaml` 会直接污染下一章

```
主流程读取 novel/chapters/[NNN]/design.md，提取:
├── 出场角色名列表
├── 伏笔回收 ID 列表
└── 场景数量

如 content.md 不存在：
├── 调用 SubAgent novel-writer（独立会话）
│   ├── 传入: chapter=N, characters=[角色列表], foreshadow_ids=[伏笔列表]
│   ├── SubAgent 按 novel-writer.md 定义自行加载（🔴 以 design.md 为主，最小化读取 core/style/`outline.md` 头部创作约束/上一章content/相关角色/必要伏笔摘要）
│   ├── 输出: novel/chapters/[NNN]/content.md + summary.md（连产，含角色演化同步）+ 写作摘要
│   └── 会话释放 ✓
└── 再进入 Step B2

如 content.md 已存在：
└── 不重写正文，直接进入 Step B2 做后处理与补链校验
```

🔴🔴🔴 **SubAgent 超时处理规则（适用于所有 SubAgent 调用，尤其是 novel-writer）**：

当 SubAgent 调用返回超时错误（timeout / 执行中断 / 无响应 / `Task execute cancelled!`）时，**必须无限重试，永不放弃**：

🔴🔴🔴 **无限重试规则：每次超时后立即使用完全相同的参数重新调用同一 SubAgent，不设重试次数上限，一直重试到成功为止。**

- 每次重试前输出：`⏳ SubAgent [名称] 第N次超时，立即重试...`
- **绝对不允许因为超时而保存断点、暂停流程或结束响应**
- **绝对不允许因为超时次数多就判定失败**

🔴🔴🔴 **以下行为是绝对禁止的**：

- ❌ SubAgent 超时后，主流程自行在当前会话中写作正文（"SubAgent 持续超时，我直接在当前会话写作第N章正文"）
- ❌ 主流程替代任何超时的 SubAgent 执行其工作（设计稿/摘要/校验均同理）
- ❌ 以"SubAgent 不可用"为由简化流程或跳过步骤
- ❌ 因超时次数达到某个数字就保存断点并暂停（**没有上限，永远重试**）

**一句话原则：SubAgent 超时 = 立即重试，无限循环直到成功。主流程永远不替代 SubAgent 干活，永远不因超时而停。**

🔴 **`novel-writer` 只负责初稿写作**，不负责校验后的回修；校验回修统一由主会话按验证报告做最小修改，不新增润色 / 伏笔 / 节奏 Agent。

🔴🔴🔴 **第一章专项铁律（黄金开篇 — 仅 N=1 时强制执行）**：

> 番茄用前 3 章完读率当第一道流量门槛，第一章完读率 ≥60% 才算合格。第一章的任务不是"开始讲故事"，而是"300字内把读者按住"。

- **300字内出事**：主角绝境 + 核心冲突 + 题材卖点，直接拍在读者脸上。禁止铺垫、禁止背景介绍、禁止"我是谁在哪"
- 🔴 **"300字内出事"指的是信息密度，不是句子长度**：禁止为提速把句子砍成电报体。第一章是**全书风格基准的采样样本**（前 10 章指纹），句子同样必须满足**均句 25~35 字**；第 1 章写碎 → 后面全书基准跟着碎
- **开篇钩子类型**（写第一章前先选定一种，写进 design.md）：
  1. 开局即绝境（主角已在最惨状态，全书冲突即刻引爆）
  2. 悬念驱动（身份错位/怪事开场，勾好奇心）
  3. 人设即钩子（主角性格/吐槽/反差本身就是卖点）
  4. 金手指前置（第一时间亮出特殊能力/系统/身份）
  5. 新世界规则先亮（先抛世界观钩子，再让主角动）
- **第一章结尾必埋翻页钩子**：让读者产生"必须点下一章"的冲动（悬念/冲突升级/身份揭露半个）
- **三章联动**：第一章结束时，design.md 必须注明第二、三章将兑现什么（冲突升级方向 / 金手指落地 / 首个爽点），确保三章一气呵成
- **第一章自检三问**（写完必须过）：
  1. 第一章看完，读者会不会自然点"下一章"？
  2. 第一章是否在 300 字内就"出事"了？
  3. 第一章是否明确让读者知道"这本书的看点是什么"？
     答不上来 → 重写第一章。

---

**Step B2: 机械后处理（正文落盘后立即执行，两条脚本按序跑完）**

🔴🔴🔴 **必须在验证之前执行，两条都不可跳过、不可换序**。SubAgent novel-writer 返回后立即执行：

```powershell
pwsh -NoProfile -File .dsh/scripts/fix-punctuation.ps1 -Chapter N
pwsh -NoProfile -File .dsh/scripts/reformat-chapter.ps1 -Chapter N
```

- `fix-punctuation.ps1`：英文标点（逗号/句号/问号/感叹号/冒号/分号/引号/括号/省略号/破折号）批量替换为中文标点
- `reformat-chapter.ps1`：把挤在同一段的多句拆成一句一段（空行分隔），统一阅读体验

🔴 **禁止跳过直接验证**（会引发大量标点 ERROR 与段落过长 WARNING，浪费回修轮次）。
🔴 **禁止 AI 手动替换标点或手动分段**，必须由脚本完成。
🔴 **回修正文后必须重跑本步骤这两条脚本，再重跑 Step C**。

---

**Step C: 验证（脚本 + 主流程 AI 三阶段）**

验证分为三个阶段，必须全部执行（🔴 原 C4 正文连续性 SubAgent 校验已合并至 Step D4 的 `chapter-full` 综合校验，正文、摘要、状态三者齐备后一次完成，本阶段不再调用 SubAgent）：

🔴 **C2 / C3 共享同一次正文读取**：C2 加载的 `content.md` 直接复用于 C3，禁止重复加载（主流程上下文保护）。

**C1. 脚本验证**

```powershell
pwsh -NoProfile -File .dsh/scripts/validate-chapter.ps1 -Chapter N
```

校验硬指标（脚本负责）：

1. **字数** ∈ [min, max]（正文中文字符计数，不含章节标题），范围取自 `.dsh/config.yaml` 的 `wordCount` 段，缺省 [2000, 3500]
2. **设定冲突** 检测（正则匹配 novel/constitution/core.md 中的冲突模式）
3. **风格指纹** 偏差 < 阈值（与 `novel/state.yaml` 中的前10章固定基准对比）
4. **格式** 段落长度上限、对话格式等
5. 🔴 **段落节奏**（检测 5.5，新增）— 按人类成书**绝对基线**双向把关，不再只看"段落过长"：
   - 严重档 → **ERROR**（计入 C1 出口条件，必须回修）：均句 <18 字、均段 <16 字、极短段(<12字)占比 >35%、超长段(>=60字)占比 >35%
   - 轻度档 → WARNING：均句 <22、均段 <22、极短段 >25%、超长段 >25%
   - 🔴 **回修方向**：句子过短 → **把短句改写成长句**（补细节/感官/因果/微动作），**不要靠合并段落**（`reformat-chapter.ps1` 会在下次后处理时把每个句号重新拆开，合并无效）；超长段 → 在语义停顿处断句
   - 依据与阈值定义见 `.dsh/scripts/lib/paragraph-metrics.ps1`（4 本专业成书实测基线）

**C1.5. AI味参考检测（每章必跑）**

🔴 **主动调用 humanizer-zh 技能**：进入 AI味检查前，先 `use_skill humanizer-zh` 加载其去AI味规则（24种AI写作痕迹 + 快速检查清单 + 质量评分），作为本次检查与回修的依据清单；技能内容与项目规则（定义于 `agents/novel-writer.md` 的【去AI味规则】段，主流程可读取该文件获取）并用，技能未覆盖处按项目规则执行。

```powershell
pwsh -NoProfile -File .dsh/scripts/check-ai-flavor.ps1 -Chapter N
```

- 脚本**只输出参考信号，不设硬门禁**（AI检测只能作参考，不能作绝对判据）
- 信号叠加 ≥4 点 → 主会话按【去AI味规则】做最小回修；轻信号 → 记录到章节报告
- 🔴 注意：**短句多 ≠ AI味**；可量化的硬伤是"**句子普遍过短**"（均句 <22 字 = 电报体）+ 语气词缺失 + AI高频词堆砌。原"句长过于均匀（CV）"指标已废弃（实测与人类成书完全重叠，无区分度）
- 🔴 **例外：`[AI味参考] 段落节奏` 不是"参考信号"**——按人类成书绝对基线判定，严重档已由 `validate-chapter.ps1` 检测 5.5 判 ERROR，属 Step C 出口条件，必须回修（短句 → 改写成承载细节/因果的长句；超长段 → 语义停顿处断句）
- 语义层（无内心流/无留白）由 C3 主流程按【去AI味规则】核对

**C2. AI 角色名校验（主流程执行）**

🔴 **角色名检测由 AI 完成，不使用正则**（正则无法准确区分角色名与普通词语，误报率极高）。

主流程执行：

1. 读取 `novel/constitution/characters/` 目录下所有角色文件名，得到已登记角色名列表
2. 读取 `novel/chapters/[NNN]/content.md` 正文
3. AI 自行理解正文语义，判断正文中实际出现了哪些**角色**（人物），逐个比对是否在已登记列表中
4. **明确属于命名角色且未登记** → 列为 `ERROR`，必须先补角色设定文件或将正文修回泛称后再继续
5. **无法确认是否属于命名角色** → 列为 `WARNING`

🔴 判断标准：

- 只有**真正的人物角色**才算（有名字、有对话或行动的人物）
- 代词（他/她/它）、称谓（老头/前辈/少年）、描写性词语**不算**角色名
- 群众性称呼（众人/弟子们/围观者）**不算**角色名
- 一旦该人物有稳定名字、台词或关键行动，并会进入后续 `summary.md` / `state.yaml` → 按**命名角色**处理，缺设定文件不可放行

**C3. AI 设定一致性 & 创作约束校验（主流程执行）**

🔴 **语义级设定冲突由 AI 完成，弥补正则的不足**。

主流程执行：

1. 读取 `novel/constitution/core.md` 中所有标记 `[不可变]` 的规则条目
2. 读取 `novel/outline.md` 的 `## 创作约束` 段（Grep 切片：`## 创作约束` 标题到下一个 `##` 之间）
3. 读取 `novel/chapters/[NNN]/content.md` 正文
4. AI 逐条对比：
   - 正文中是否有与任何 `[不可变]` 规则**语义冲突**的内容 → CRITICAL
   - 正文是否触犯创作约束的**死线 / 本书禁写项** → CRITICAL；**黄线**描写过满、技巧化处理不当 → WARNING

🔴 检查重点：

- 力量体系等级数量是否被突破
- 角色能力是否越级
- 地理/历史硬设定是否被矛盾描述
- 已死亡角色是否复活出场（对比 state.yaml 中 status: dead 的角色）
- 🔴 **死线 / 本书禁写项必须逐章拦截**：批量模式无人值守，一旦触犯死线会随批量流程连续污染后续章节，其危害远大于单章模式，不得以"写作端已遵守"为由省略验证端复查

🔴 **读者留存兜底检查（主流程执行，D4 chapter-full 联动）**：

- **开篇吸引**（仅前 3 章）：第 1 章是否 300 字内出事、看点明确；前 3 章是否有持续"看下去的理由"
- **章首衔接**（所有章）：与上一章结尾自然衔接，或刻意切换时交代清楚（让读者不迷路）
- **章末钩子**（所有章）：是否留钩子逼读者点下一章（悬念/冲突逼近/新威胁）
- 逻辑断裂 → 列入 D4 CRITICAL 一并处理；吸引/钩子不足 → WARNING 记录到章节报告，主会话回修时顺手优化

🔴 **人称用法兜底检查（主流程执行）**：

- 动作发起者用名字，"他"只做连续承接；🔴 禁止连续 3 句以上以"他/她"开头（"他他他"堆叠 = 指代不清，读感差）
- 视角角色内心独白不自呼其名（"石天，你怂什么"→"你怂什么"）
- 发现"他他他"堆叠 → WARNING，主会话回修时回填名字

🔴 注意区分：

- "扩展未定义的细节"**不算**冲突
- "违反已定义的规则"**才算**冲突
- 不确定是否冲突 → 列为 WARNING 而非 CRITICAL

**处理验证结果（C1 + C2 + C3 汇总）：**

- **ERROR/CRITICAL** → 统一由主会话处理：

  - 主会话读取验证报告、当前文件和必要上下文，按 `main-repair` 做**最小回修**（补一句交代 / 改错 / 精简冗余），禁止整章重写、禁止回调任何 SubAgent
  - C2 命名角色缺设定文件 → 主会话补建角色设定文件，或将误判名称修回泛称，再重跑验证
  - 回修 `content.md` 后按顺序重跑 `Step B2 → Step C`
  - 🔴 若回修涉及**剧情/事实改动**（非纯格式修正），必须同步最小修正连产的 `summary.md`（改对应段落），再进入 Step D——避免 D4 漂移检查兜底才发现、多耗一轮 D2/D3/D4 循环
- 🔴 **验证-修复不限次数，持续循环直到所有 ERROR / CRITICAL 修完**；每一轮都由主会话回修，不再创建新的回修 SubAgent 会话。
- 🔴 **字数偏差分诊规则（Step C1 字数 ERROR 的回修路由）**：

  - 偏差 < 15%（相对 `wordCount` 容差区间，缺省约 ±300~500 字）→ 主会话最小回修：调整描写密度/篇幅侧重，禁止删场景凑字数
  - 偏差 ≥ 15% → 🔴 禁止主会话大段补写或删改（等同于变相重写正文，违反 `content.md` 初稿白名单）；应先将不合格 `content.md` 改名为 `content.md.reject` 保留现场，再回到 **Step B** 重新调用 `novel-writer` 生成该章初稿，然后按 `Step B2 → Step C` 重跑
- 🔴 **零放行规则**：只要仍有任何一项 ERROR / CRITICAL，**禁止**输出"验证通过""可继续""可接受""可忽略""正文已写完先继续"等结论；也**禁止**用"只是角色台词""只超/少一点字数"之类的主观解释绕过 Step C
- **WARNING** → 🔴 大部分 WARNING 自动记录但不暂停，汇总到最终报告和检查点。但以下 WARNING **必须在当场处理**：

  **英文内容 WARNING 处理规则**：
  🔴🔴🔴 **禁止直接跳过，必须逐个判断并处理**。对脚本报出的每个英文单词：

  1. **合理专有名词/缩写**（如 `F-15I`、`GBU-57`、`GPS`、`CNN`、`WiFi`、`FBI`、`TOP SECRET` 等军事/技术/机构术语）→ PASS，记录为"已确认合理"
  2. **单字母残片**（如 `F`、`I` 等被正则从复合词中切出的片段）→ 检查上下文，若属于合理复合词的一部分（如 `F-15I` 中的 `F` 和 `I`）→ PASS
  3. **不合理的英文词**（如中文语境中混入的普通英文词 `truth`、`very`、`beautiful` 等，或外语音译中残留的连接词 `e`、`al`、`de`、`el`、`bin` 等）→ 🔴 **必须修正**：读取 content.md 对应行号位置，将英文词替换为对应的中文翻译或中文间隔号 `·`（如 `库赫-e贾汉纳姆` → `库赫·贾汉纳姆`），修正后**重新执行 fix-punctuation.ps1 + reformat-chapter.ps1 + validate-chapter.ps1**
  4. 🔴 **禁止**不看上下文就一律标记为"合理"跳过

---

**Step D: 摘要 & 状态同步 & 角色演化**

🔴🔴🔴 **Step D 绝对不允许简化**：摘要是下一章所有 SubAgent 的关键输入。如果你感觉上下文快不够了，**必须在进入 Step D 之前就保存断点并停止**。绝对禁止"由于时间关系采用简化流程生成摘要"——这会导致下一章的设计稿和正文因缺失关键信息而质量崩塌。**Step D 要么完整执行（D1→D2→D3→D4），要么根本不开始（保存断点停下来）。没有中间态。**

**Step D1: 摘要核验与角色演化同步**

🔴 **摘要常态由 novel-writer 在 Step B 连产**（正文写完时上下文最热，同一次会话完成正文+摘要+角色演化，省一次子会话调度与正文重读）。本步骤核验连产结果，仅在缺失/不合格时走兜底：

```
核验 novel/chapters/[NNN]/summary.md：
├── 存在且包含必要段落（### 剧情 / ### 剧情详述 / ### 角色状态 / ### 时间线 / ### 世界资产变更）
│   └── 连产通过：角色演化已由 novel-writer 附带同步 → 直接进入 Step D2
├── 缺失、段落残缺或 novel-writer 返回报告"摘要连产: 否"（如超时中断）
│   └── 主会话兜底补生成：读取 `content.md` + 出场角色设定，按 `.dsh/templates/summary.md` 模板生成 `novel/chapters/[NNN]/summary.md`，并检测出场角色演化变更、追加到角色设定文件的 `## 演化记录`
└── 核验通过后统一进入 Step D2
```

旧断点续写时（历史版本未连产的半成品章）同样走兜底路径补齐。

**Step D2: 摘要脚本校验**

🔴 **摘要是下一章 design/writer/validator 的关键输入，禁止未校验就直接同步到 `state.yaml`。**

```powershell
pwsh -NoProfile -File .dsh/scripts/validate-summary.ps1 -Chapter N
```

结果处理：

- **PASS** → 进入 Step D3
- **FAIL** → 主会话读取 `summary.md`、验证结果和必要上下文，做**最小回修**后重跑 `validate-summary.ps1`
  - 摘要结构 / 时间线 / 角色状态 / 世界资产格式 → 主会话只改对应错误段落
  - 未建档命名角色 → 主会话补建角色设定文件；若为摘要误写，则主会话修正该角色记录
- 主会话无法安全判断 → 标记 `manual-review` 并暂停；不得带病进入 Step D3

**Step D3: 状态同步（有限自愈）**

```powershell
pwsh -NoProfile -File .dsh/scripts/sync-state.ps1 -Chapter N
```

如 `sync-state.ps1` 返回错误，**禁止立刻判死停**，必须持续**分类自愈**（不限次数，直到成功）：

- **`[RETRY_SUMMARIZER]` 类错误**（如摘要缺段、时间线无效、角色状态格式错误、缺 `### 世界资产变更` 段）
  - 主会话读取 `summary.md` 与报错详情，按错误段落**最小修正摘要**（只改对应错误位置，不整篇重写）
  - 然后按顺序重跑：`validate-summary.ps1` → `sync-state.ps1`
- **`[REGISTER_CHARACTER]` 类错误**（如未建档命名角色）
  - 先自动补建角色设定文件
  - 然后按顺序重跑：`validate-summary.ps1` → `sync-state.ps1`
- **`[MANUAL_REVIEW]` 类错误**（如脚本无法判断该修摘要、正文还是现有 state）
  - 直接暂停，展示错误详情给用户

🔴 持续自愈直到成功，绝不因重试次数而暂停；禁止第一次 `sync-state.ps1` 报错就中断整章。唯一允许暂停的情况是 `[MANUAL_REVIEW]` 类错误（脚本明确判定需要人工介入）。

🔴 `sync-state.ps1` 成功时会顺带增量更新 `novel/state/memory-digest.md`（长期记忆摘录）；该更新失败只告警、不阻断。

**Step D4: 综合连续性校验（chapter-full，每章必跑，含自愈）**

🔴 **每章唯一的 SubAgent 连续性校验点**：正文、摘要、状态三方齐备后（D1 摘要就绪 → D2 校验 → D3 同步），**无条件**执行一次 `chapter-full` 综合校验，合并原 C4(chapter) + D4(post-sync-lite) 两次调用的全部检查项：

调用 SubAgent `continuity-validator`，使用 `stage=chapter-full`，一次性检查：

🔴 **PASS 直接放行**；validator 报出 CRITICAL / WARNING 时，主会话才须对照正文、summary、state 等文件事实独立核验，误报可驳回（记录理由），漏报须补入验证报告；确认是真问题后才按下述规则回修。

🔴 **三方一致性校验（outline ↔ design ↔ content）：**

1. **设计稿兑现度**：`design.md` 的关键动作/关键结果是否在 `content.md` 中全部兑现；场景被整段跳过 → CRITICAL
2. **大纲完成度（端到端闭环）**：从 `outline.md` 提取本章事件/目标，直接与 `content.md` 比对，防止"设计稿漏了A → 正文也漏了A"的穿透性遗漏；大纲事件完全未体现 → CRITICAL
3. **偏航预警**：正文出现大纲和设计稿中都没有的重大事件 → WARNING

**常规连续性检查：**
4. 当前章与上一章正文、近章摘要、`state.yaml`、`outline.md` 是否时间连续
5. 积分 / 国运值 / 库存 / 兵力 / 装备来源是否闭环
6. 角色位置 / 伤势 / 知情边界 / 保密边界是否前后一致
7. 伏笔是否真的回收，钩子是否真的成立
8. **文风 / 节奏风险 + AI味（仅 WARNING）**：连续大段纯对话无动作承接、场景推进过平、章末钩子偏弱、清单体/机械连接词/无内心流等；只作回修参考

**漂移检查（原 post-sync-lite 职责）：**
9. **正文 ↔ summary ↔ state 漂移**：summary 是否漏掉重大结果；state 是否把正文未发生的未来状态提前写入；关键资产与角色状态是否正确更新

**扩展一致性检查（与单章 `novel-validate` 步骤2.9 对齐）：**
10. **角色档案一致性**：本章出场角色的 `characters/[角色].md`（演化记录/能力/关系网/状态）与 `state.yaml` / `summary.md` / 正文三方一致；档案缺失该角色或档案 dead 但出场 → CRITICAL
11. **书籍元数据一致性**：`bookinfo.md` 的书名/类型/标签/简介基调与正文风格定位一致；简介承诺的核心卖点是否在正文延续（换题材/变画风 → WARNING）
12. **设计稿反向合法性**：`design.md` 是否违反 outline 创作约束 / 擅自改变大纲关键事件与角色命运 / 与全书走向相悖（违反死线 → CRITICAL；黄线失当/偏离 → WARNING）
13. **跨章重复 / 意象雷同**：本章结尾与上一章/近章是否用相同收束意象或句式（完全复制 → CRITICAL；近似复用 → WARNING）；`design.md` 是否预埋"与第N章结尾跨章呼应"或写死相同修辞意象（→ WARNING）；连续多章钩子同质化 → WARNING。真·剧情伏笔回响不算雷同
14. **角色谱系（chapter-full 必查，仅 WARNING）**：新角色引入节奏 / 角色谱系平衡，量化依据 = validator 自行执行 `analyze-roster.ps1`（脚本零 token，从设计稿提取）

结果处理（🔴 **与其他环节一致，先回修再继续**）：

- **CRITICAL** → 主会话读取 `content.md`、`summary.md`、校验结果和必要上下文，按类别最小回修：
  - **summary 漏写/错写关键结果** → 主会话修正 `summary.md` → 重跑 `validate-summary.ps1` → `sync-state.ps1` → 再次 chapter-full
  - **state.yaml 字段偏移** → 不直接改 `state.yaml`；主会话修正 `summary.md` 后重跑 `sync-state.ps1` → 再次 chapter-full
  - **正文事实 / 剧情连续性问题** → 主会话只改必要位置，再按 `Step B2 → Step C → Step D1 → D2 → D3 → D4` 补跑；涉及设计方向或无法安全判断 → `manual-review`，暂停等待用户
- **WARNING** → 记录到最终报告与检查点；如属于"关键事实漏写/错写"，由主会话优先修正
- **PASS** → 继续
- 主会话无法安全判断 → `manual-review` 暂停；不回调 SubAgent 做回修

风格指纹维护（与 `novel-write` 规则一致）：

- 🔴 **以前10章正文为唯一文风母本**；`compute-style.ps1` 默认只采样第1~10章正文（不含标题）建立固定基准
- `N < 10` → 继续累积样本，不建基准，风格检测保持跳过状态
- `N >= 10` 且 `basedOnChapters` < 10 → 执行一次 `compute-style.ps1` 建立固定基准
- 🔴 **建立基准前必须先通过体检**：脚本对采样章节做段落节奏体检并写入 `baselineHealthy`
  - `baselineHealthy: true` → 基准生效，后续按偏差值报警
  - `baselineHealthy: false` → 🔴 **暂停批量流程**：前 10 章本身节奏失准，锁基准会把问题固化成全书母本。必须先按 `validate-chapter.ps1` 检测 5.5 修正前 10 章的句子长度，再重建基准
- 基准建成后，后续所有章节**只与前10章固定基准对比，不随正文后续漂移**
- 🔴 **自愈路径（例外）**：**前 30 章内**若确认基准本身失准，允许 `-Rebuild` 重建一次（唯一允许推翻既有基准的窗口）；超过 30 章不再重建，节奏问题一律走检测 5.5

```powershell
pwsh -NoProfile -File .dsh/scripts/compute-style.ps1
# 前30章内修正坏基准：
pwsh -NoProfile -File .dsh/scripts/compute-style.ps1 -Rebuild
```

---

**Step E: 章节收尾（更新进度 + 清理 bundle）**

**E-1) 更新进度** — 更新 `novel/state.yaml` 的 `batchProgress` 字段（本章字数取 Step C1 `validate-chapter.ps1` 输出的中文字符计数）：

```yaml
batchProgress:
  running: true
  startChapter: 1
  endChapter: 100
  nextChapter: N+1          # 下次续写起点（失败时 = 失败章节号）
  checkpointInterval: 20
  completedChapters: [1,2,...,N]
  totalWords: XXXXX          # 累计字数
  pendingConstitution: []    # 宪法增量（结束前自动写入并清空）
```

输出进度行：

```
✓ 第N章完成（XXXX字）[N/total]  已累计: XX,XXX字
```

**E-2) 清理 context-bundle**

🔴 **进度写回后立即删除该章的 `context-bundle.md`**，避免大文件残留干扰后续章节的 SubAgent 上下文。

使用 `delete_file` 工具删除 `novel/chapters/[NNN]/context-bundle.md`（将 `[NNN]` 替换为实际三位数章节号）。

🔴 **禁止使用 PowerShell 内联命令删除**（`-Command` 模式会导致 `$` 变量被 shell 二次解析），必须使用 `delete_file` 工具。
🔴 清理失败不阻断流程（文件可能已被删或不存在），但应在日志中标注。
🔴 下一章的 Step A0 会生成新的 bundle，所以旧 bundle 必须清理，否则可能包含过时的 state.yaml / summary / 远期记忆数据。

---

### 3. 检查点暂停

🔴 **仅在用户指定了 `--check N` 时才启用检查点**。默认不暂停。

当 `checkpointInterval > 0` 且 `N % checkpointInterval == 0` 时，直接进入检查点暂停：

暂停展示：

```
━━━ 检查点 [第N章 / 共total章] ━━━

已完成: N章
累计字数: XX,XXX字
平均字数: 2,XXX字/章
WARNING汇总: X条

最近5章概况:
- 第N-4章: 2756字 PASS — [大纲梗概]
- 第N-3章: 2831字 PASS — [大纲梗概]
- 第N-2章: 2693字 WARN(风格偏差) — [大纲梗概]
- 第N-1章: 2812字 PASS — [大纲梗概]
- 第N章:   2745字 PASS — [大纲梗概]

操作:
A) 继续写作（进入第N+1章）
B) 查看某章详情（输入章节号）
C) 修改某章（输入章节号，进入 /novel-write 单章模式）
D) 终止批量写作
```

🔴 用户选择 A 后继续循环；选择 C 在单章模式修改完成后，重新展示本检查点菜单供用户再次决策（被修改章节须已走完完整流水线，否则后续循环从该章补跑）；选择 D 则保存进度退出（`batchProgress.running` 保持 `true`，可通过 `--resume` 续写）。

### 4. 异常处理

🔴 **核心原则：任何一章失败都必须立即暂停，不能跳过。**
因为每章都依赖上一章的 `content.md` 进行衔接，跳过失败章节会导致后续所有章节断链。

**任何步骤失败（设计/写作/验证）**：

- 自动修复**不限次数**，持续重试直到成功
- 唯一允许暂停的情况：`[MANUAL_REVIEW]` 类错误（脚本明确要求人工介入）
- 展示详细错误信息：
  ```
  ━━━ 批量写作暂停 ━━━

  ❌ 第N章失败，批量流程已暂停

  失败阶段: 设计稿生成 / 正文验证
  错误详情: [具体错误信息]
  已尝试修复: 3次

  已完成: N-1 章（进度已保存）

  处理方式:
  A) 手动修复第N章: /novel-design N 或 /novel-write N
  B) 修复后续写: /novel-batch --resume
  C) 终止批量写作
  ```
- 用户手动修复该章后，通过 `--resume` 从第N章（或N+1章，取决于修复程度）继续

**宪法更新处理（全自动）**：

- 🔴 批量模式下，设定增量中标记 `[需更新宪法]` 的项**自动累积**到 `state.yaml` 的 `batchProgress.pendingConstitution`
- 🔴 **全自动写入**：批量流程结束（写回最终状态前），主会话将 `pendingConstitution` 中的条目**自动写入对应宪法文件**（`core.md` / `style.md` 等，按条目标注的目标文件），并同步更新 `outline.md` 头部「创作约束」段中对应的增量项（如适用）
- 写入完成后**立即清空** `batchProgress.pendingConstitution`（置为 `[]`），避免越积越多
- 🔴 **全程无人工确认**：不暂停、不询问；如有检查点（`--check N`），在检查点暂停展示中仅展示已累积的增量条目供用户知悉，不要求确认

### 5. 批量完成报告

展示最终完成报告前，**先写回最终状态**：`batchProgress.running: false`、`completedChapters` 固化为最终完整列表、`nextChapter` 置为 `endChapter + 1`（仅作档案记录）

```
━━━ 批量写作完成 ━━━━━━━━━━━━━━━━━━━━━

范围: 第1章 → 第100章
完成: 100/100 章
总字数: 275,000字

逐章统计:
| 章节 | 字数  | 状态 | WARNING |
|------|-------|------|---------|
| 001  | 2756  | PASS | -       |
| 002  | 2831  | PASS | -       |
| ...  | ...   | ...  | ...     |
| 100  | 2698  | PASS | -       |
```

---

## 上下文管理

```
主流程上下文
│
├── Step O 大纲同步（如需要）:
│   └── SubAgent batch-outliner:  按需加载，上下文窗口充裕（独立会话，完成释放）
│                                  按每批≤20章分批调用，每批独立会话
│
├── 每章循环:
│   ├── Step A0: build-context-bundle.ps1 生成/重建 context-bundle.md（脚本，0 上下文；含 design.md + 上一章 content.md + 远期记忆索引，不内嵌大纲摘录）
│   ├── SubAgent batch-designer:   优先读 bundle + outline 全文（2次读），无 bundle 时回退逐个加载（独立会话，完成释放）
│   ├── SubAgent novel-writer:     设计稿驱动加载（design.md + 宪法/风格 + 上一章正文 + N-1~N-3 summary + 必要角色设定，不依赖 bundle；仅按需查 memory-digest.md）（独立会话，完成释放）
│   ├── SubAgent continuity-validator: 每章仅 2 次调用 —— Step A2 用 design 模式（bundle + outline 全文，2次读）；Step D4 用 chapter-full 模式（bundle + outline 全文 + content + summary，4次读），一次合并正文连续性 + 漂移检查，不再拆 chapter / post-sync-lite 两次调用
│   ├── 摘要: novel-writer 连产（省 ≈5000字/章）；缺失/不合格时主会话补生成（0 额外 SubAgent 开销）
│   ├── 长期记忆: sync-state.ps1 每章增量追加 state/memory-digest.md（脚本，0 上下文）
│   ├── 脚本执行: 0（进程外运行）
│   └── Step E: 写回 batchProgress（主流程直写 state.yaml）+ 删除 context-bundle.md
│
```

🔴 **关键**：每个 SubAgent 调用都是独立会话，用完释放。主流程不累积任何正文内容。章节间的信息传递**完全通过文件系统**（content.md → summary.md → state.yaml / memory-digest.md → 下一章的 SubAgent 自行读取）。大纲同步也是通过文件系统传递（outline.md → batch-designer 自行读取）。

---

## 约束

- 🔴 **所有章节路径使用三位数补零格式**：`novel/chapters/001/`、`novel/chapters/052/`
- 🔴 **写作阶段**（Step A/B）主流程**禁止**加载任何章节正文或宪法全文——这些由 SubAgent 独立加载（验证阶段 Step C2/C3 需临时读取正文、宪法与 `outline.md` 创作约束段做 AI 校验，属于正常操作）
- 🔴 必须先有 `novel/outline.md` 才能批量写作（Step O 会自动补齐不足部分）
- 🔴 每章写完必须走完整流水线（验证+摘要+同步），禁止跳过
- 🔴 `--resume` 续写时从 `batchProgress.nextChapter` 精确恢复（🔴 `--resume` 也必须检查大纲覆盖度，不足则先执行 Step O）
- 🔴 已有 `content.md` **不代表该章可直接跳过**：只有该章的 `content.md`、`summary.md`、`state.yaml` 同步结果与验证状态都完整无缺时，才允许视为已完成；否则必须补跑后处理、验证、摘要、同步链路
- 🔴 **任何一章失败都立即暂停，不允许跳过**（每章依赖上一章衔接，跳过会断链）
- 🔴 检查点暂停时保存完整进度，断电/断网后可通过 `--resume` 恢复
- 🔴🔴🔴 **严禁批量生成设计稿**：每次调用 batch-designer SubAgent 只传入**单个章节号**（`chapter=N`），禁止传入范围。Task 描述必须写"生成第N章设计稿"，禁止写"批量生成第X-Y章设计稿"。每章必须完成完整流水线（设计→写作→验证→摘要→同步）后才能开始下一章的设计，因为设计依赖上一章的 content.md 进行衔接。
- 🔴 **执行 .ps1 脚本必须使用 `pwsh -NoProfile -File` 方式，禁止 `-Command`**（`-Command` 会导致脚本中 `$` 变量和 `` `u{} `` 转义被 shell 二次解析，引发静默失败）
- 🔴🔴🔴 **严禁非检查点暂停**：当用户未指定 `--check N` 时（即 `checkpointInterval == 0`），批量流程必须从第一章一口气写到最后一章，**绝对禁止**中途以"长时间任务""进度汇报""确认继续"等任何理由暂停等待用户回复。每章完成后输出一行进度（`✓ 第N章完成`）然后**立即**进入下一章，不等待、不询问、不暂停。违反此规则等同于流程 BUG。
- 🔴🔴🔴 **Step O 大纲同步必须在主循环之前完成**：禁止在章节流水线中途发现大纲不足再临时扩纲。所有大纲必须在 Step O 阶段一次性补齐（分批串行），然后再进入 Step 1。
- 🔴 **大纲覆盖判断标准**：只要 `outline.md` 全文中存在能明确落到某章节的规划信息（标题 / 列表 / 表格 / 分卷条目等），该章节就算已规划；"待续篇章"下的模糊悬念、"待回收伏笔"表格、仅有阶段划分但无法落到具体章节的概要文字**不算**逐章覆盖。
- 🔴 **扩纲范围必须连续**：如大纲到第40章而请求 batch 50-100，必须补齐 41-100（不能只补 50-100），因为中间章节的大纲脉络对设计稿衔接至关重要。
- 🔴🔴🔴 **SubAgent 调用 prompt 禁止手写文件加载清单**：调用任何 SubAgent（batch-outliner / batch-designer / novel-writer / continuity-validator）时，prompt 中**只传参数**（如 chapter=N、startChapter=X、endChapter=Y）+ 一句"请严格按照你的 `<context_loading>` 规则自行加载所有必要上下文"，**严禁**列出"上下文加载规则"或"请读取以下文件"之类的文件清单。每个 SubAgent 有自己的 `<context_loading>` 定义，会自行加载完整上下文；主流程手写的清单必然不完整（会遗漏角色设定、style.md、足够范围的 summary、memory-digest 等），SubAgent 看到清单后会误以为"只需加载这些"而跳过自己的加载规则，导致关键上下文缺失、输出质量崩塌。完整模板见 `.dsh/rules/subagent-prompt-whitelist.mdc`。
- 🔴 **长期记忆自动维护，主流程不手动干预**：`novel/state/memory-digest.md` 由 `sync-state.ps1`（每章增量）与 `build-context-bundle.ps1`（构建前补齐）自动维护；主流程**禁止**手改该文件，需要重建时只能执行 `build-memory-digest.ps1 -Rebuild`。
