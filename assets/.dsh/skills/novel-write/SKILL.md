---
name: novel-write
description: 写某一章正文时使用。输入为章节号 N。执行：加载最小上下文 → 直写正文 → 脚本后处理 → 综合AI校验 → 生成摘要 → 同步状态 → 深度连续性校验。
whenToUse: 写某一章正文时使用。输入为章节号 N。执行：加载最小上下文 → 直写正文 → 脚本后处理 → 综合AI校验 → 生成摘要 → 同步状态 → 深度连续性校验。
---

# novel-write

## 用户输入

```text
$ARGUMENTS
```

用户输入为章节号 N（如 `1`、`15`、`42`）。

示例：

```
/novel-write 15
/novel-write 42
```

## token预算

| 模式         | 预估token | SubAgent数 | 适用场景 |
| ------------ | --------- | ---------- | -------- |
| 标准（默认） | 15-25k    | 1          | 日常写作（Step 9 调 continuity-validator 深度校验） |

---

## 执行步骤

### Step 1. 一次性加载上下文（主流程）

🔴 **一次加载，全程复用**。不调用SubAgent，不重复读取文件。

读取以下文件（仅一次）：

1. `novel/chapters/[NNN]/design.md` — **本章设计稿（主蓝图）**
2. `novel/constitution/core.md` — 核心设定
3. `novel/constitution/style.md` — 风格设定
4. `novel/outline.md` 的 **`## 创作约束` 段**（Grep切片：`## 创作约束` 标题到下一个 `##` 之间）
5. `novel/outline.md` 中**第 N 章那一行**（Grep `\| ${N} \|` 或 `第${N}章` 模式定位本章梗概行 + 前后各 2 行作衔接）
6. `novel/chapters/[NNN-1]/content.md`（N > 1 时）— 上一章正文，衔接锚点
7. N-1, N-2, N-3 章的 `summary.md`（如存在）— 短期记忆
8. **从 `design.md` 提取出场角色名列表**，仅加载这些角色的 `novel/constitution/characters/[角色名].md`（不全量扫描 characters 目录）
9. **`state.yaml` 子段**（按需 grep）：
   - `foreshadowing.active` — 活跃伏笔
   - `worldAssets` — 关键资产数值
   - `characters.[name].status` — 仅本章出场角色的生死/位置/状态
   - 其他段落不读
10. **`novel/state/memory-digest.md`**（🔴 触发式加载，不是默认项）：
    - 触发条件（满足任一才读）：① 本章要回指 N-20 之外的早期剧情；② 要引用早期专名（地名/组织/功法/物品/称号）；③ design.md 要求回收很早埋设的伏笔
    - 读法：只按索引定位（第一节逐章剧情 / 第二节专名词表 / 第三节伏笔台账），需要细节时再回读对应章 `summary.md`
    - 🔴 引用早期专名必须按词表**原样照抄**，不得凭记忆改写（这是长篇最高频的一致性事故）

🔴 **明确禁止**：

- 加载 `outline.md` 全文
- 加载 `characters/` 目录全部文件
- 加载 N-4 之前的远章 summary
- 调用任何 SubAgent（本步骤）
- 无触发条件时读取 `memory-digest.md`（它是查档工具，不是常态上下文）

总计 ≈ 12-15k tokens

### Step 2. 主流程直接写正文

按 `design.md` 的场景列表逐段写作，输出到 `novel/chapters/[NNN]/content.md`。

**a) 章节标题**

- 首行写入 `# 第N章 [自拟标题]`，标题 2-8 字、网文风格
- 标题不计入正文字数

**b) 逐场景写作**

按 design.md 场景顺序执行：

- 以 `design.md` 为主做加载（开篇承接锚点 / 写作硬约束 / 角色写作提示 / 伏笔必引细节）
- 角色对话风格匹配各角色文件中的设定
- 上一章结尾 → 本章开头自然衔接
- 🔴 **参考上一章文风（🔴 仅限叙事口吻与用词）**：写作前快速浏览上一章 `content.md`，对齐**叙事口吻 / 用词习惯 / 对话方式 / 叙事详略 / 对话占比**。
  - 🔴 **禁止模仿上一章的"段落密度 / 句长"**：段落与句长节奏由 `reformat-chapter.ps1` + `validate-chapter.ps1` 检测 5.5 统一把关，本章一律按**均句 25~35 字**的写作目标执行。
  - 🔴 原因：若上一章本身节奏失准（写碎或"一逗到底"），"向上一章对齐"会把同一个问题逐章复制，形成无法自愈的正反馈。
- 场景间用空行过渡，🔴 禁止 `---` / `——` / `***` / `===` 等独占一行的分隔符
- 🔴 禁止正文中出现伏笔 ID（`F-N-X`）、`回收成功`、`埋设`、`[需更新宪法]`、场景编号等元数据
- 🔴 禁止结束标记（`（本章完）`、`（未完待续）`、`--- END ---`）
- 🔴 禁止保留设计稿的 `~波浪号~` 泛称标记，写入正文必须去掉波浪号
- 对话使用中文双引号 `""` 包裹，禁止 `「」`、`『』`、`""`
- 严格遵守 `outline.md` 的 `## 创作约束`（死线绝对不碰；黄线技巧处理；弹性区适度）
- 严格遵守 `core.md` 中标记 `[不可变]` 的硬设定
- 死亡角色（`state.yaml` 中 `status: dead`）不得出场

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
- **三章联动**：第一章结束时，设计稿必须注明第二、三章将兑现什么（冲突升级方向 / 金手指落地 / 首个爽点），确保三章一气呵成
- **第一章自检三问**（写完必须过）：
  1. 第一章看完，读者会不会自然点"下一章"？
  2. 第一章是否在 300 字内就"出事"了？
  3. 第一章是否明确让读者知道"这本书的看点是什么"？
  答不上来 → 重写第一章。

**c) 字数控制**

- 🔴 字数范围从 `.dsh/config.yaml` 的 `wordCount` 段读取（缺省 `min=2000 / target=2500 / max=3500`）；如无该配置项则用默认值，写作前先读取配置
- 全章目标 = `wordCount.target` 字（中位数），容差 [min, max]
- 写作中动态统计中文字符数；超 `max` → 精简最长场景描写；不足 `min` → 扩展环境/动作/反应（不加新剧情）

**d) 场景执行要点**

- 直接进入事件，禁止长篇背景介绍
- 每场景：明确目的 + 障碍设置 + 冲突结果 + 反应节拍
- 🔴 台词与内心独白措辞必须由写作阶段原创，不得照搬 design.md "反应节拍"（设计稿只给情绪走向/大的方向，不给台词或独白原句；若设计稿意外出现台词/独白描述，仅作方向参考，写作时按文风重新创作）
- 章末必须留钩子

**e) 写作规则参照**

- 场景类型（搭戏/唱戏/高潮/结尾）参照 design.md 中的场景规划
- 角色约束参照各角色文件中的性格内核/说话风格
- 设定约束参照 core.md 中 [不可变] 规则
- 🔴 风格约束**全量遵守** style.md：无论标准字段还是自定义小节（参考文件/人称写法/双层语言等），都必须执行；写作前通读 style.md 全文提炼"本章自查清单"，写完后逐条核对
- 冲突约束参照 design.md 的写作硬约束
- 伏笔回收参照 design.md 的伏笔必引细节

### Step 3. 脚本后处理（必跑三件套）

🔴 **必须在验证之前执行**，不可跳过。

```powershell
pwsh -NoProfile -File .dsh/scripts/fix-punctuation.ps1 -Chapter N
pwsh -NoProfile -File .dsh/scripts/reformat-chapter.ps1 -Chapter N
pwsh -NoProfile -File .dsh/scripts/validate-chapter.ps1 -Chapter N
```

🔴 **执行 .ps1 必须使用 `pwsh -NoProfile -File`，禁止 `-Command`**。

### Step 4. 综合AI校验（一次pass完成所有检查）

🔴 **主流程一次性完成所有AI校验**，不调用任何 SubAgent（本步为浅层快速自检：角色名/设定/创作约束/英文/人称/AI味/读者留存 + 连续性浅查；深度 25 项审计由 Step 9 的 continuity-validator 完成）。

**输入**（已在 Step 1 加载，无需重读）：

- `content.md`（Step 2 写完的正文）
- `core.md` 的 `[不可变]` 行
- `outline.md` 的 `## 创作约束`段 + 第 N 章梗概行
- `design.md`（Step 1 已加载）
- `characters/` 文件名列表（用 `Glob` 取，不读内容）
- `validate-chapter.ps1` 输出的英文单词列表

**AI味参考检测（合并到校验前先跑）**：

🔴 **主动调用 humanizer-zh 技能**：进入 AI味检查前，先 `use_skill humanizer-zh` 加载其去AI味规则（24种AI写作痕迹 + 快速检查清单 + 质量评分），作为本次检查与回修的依据清单；技能内容与项目规则（定义于 `agents/novel-writer.md` 的【去AI味规则】段，主流程可读取该文件获取）并用，技能未覆盖处按项目规则执行。

```powershell
pwsh -NoProfile -File .dsh/scripts/check-ai-flavor.ps1 -Chapter N
```

- 脚本**只输出参考信号，不设硬门禁**（研究结论：AI检测只能作参考，不能作绝对判据）
- 信号项叠加 ≥4 点 → 建议按【去AI味规则】做最小回修；轻信号 → 记录即可
- 🔴 注意：**短句多 ≠ AI味**；可量化的硬伤是"**句子普遍过短**"（均句 <22 字 = 电报体）+ 语气词缺失 + AI高频词堆砌。原"句长过于均匀（CV）"指标已废弃（实测与人类成书完全重叠，无区分度）
- 🔴 **例外：`[AI味参考] 段落节奏` 不是"参考信号"**——它是按人类成书绝对基线判定的硬问题（严重档已由 `validate-chapter.ps1` 判 ERROR），必须回修：句子过短 → **把短句改写成长句（补细节/感官/因果）**；超长段 → **在语义停顿处断句**
- 语义层（无内心流/无留白/情绪贴标签）由主流程按【去AI味规则】人工核对

**校验项（合并执行）**：

| 类别       | 检查内容                                                                                  | 分级                              |
| ---------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| 角色名     | 正文中的命名角色是否在 `characters/` 文件名列表中                                       | 缺登记 → ERROR                   |
| 设定一致性 | 是否违反 `core.md` 中 `[不可变]` 规则（境界数量、能力越级、地理硬设定、死亡角色出场） | CRITICAL                          |
| 创作约束   | 是否触犯 outline 的死线/本书禁写项；黄线/弹性区处理是否得当                               | 死线→CRITICAL；黄线过满→WARNING |
| 大纲兑现   | 正文是否覆盖 outline 第 N 章梗概行的关键事件                                              | 完全未体现→CRITICAL              |
| 设计兑现   | design.md 关键动作/结果/钩子是否兑现                                                      | 整段跳过→CRITICAL                |
| 英文内容   | 脚本列出的英文词逐个判断（专名/缩写→PASS；普通英文词→ERROR）                            | ERROR/WARNING                     |
| 连续性     | 时间线/数值链/资源来源/角色状态/伏笔链/summary漂移                                        | 硬冲突→CRITICAL；歧义→WARNING   |
| AI味       | 先跑 `check-ai-flavor.ps1 -Chapter N`（清单体/八股词/高频词/句式重复），再按【去AI味规则】检查无内心流/无留白 | 脚本 ERROR→必修；语义问题→WARNING |
| 人称用法   | 动作发起者用名字，"他"只做连续承接；🔴 禁止连续3句以上以"他/她"开头；内心独白不自呼其名 | 连续"他"堆叠→WARNING；指代混乱→CRITICAL |
| 读者留存   | ①开篇吸引（仅1-3章：300字内出事/看点明确）；②章首衔接（所有章：与上章自然衔接或合理切换）；③章末钩子（所有章：是否留钩子逼读者点下一章） | 逻辑断裂→CRITICAL；吸引/钩子不足→WARNING |
| 跨章重复   | ①本章结尾的收束意象/句式/比喻系统与上一章（及近2~3章）是否雷同（完全复制→CRITICAL；近似复用→WARNING）；②连续多章章末钩子类型单一（如都是"XX来了"式悬念）→WARNING；③真·剧情伏笔回响（约定信物/重复物品）不算雷同，可保留 | 完全复制→CRITICAL；近似复用/钩子同质化→WARNING |
| 长程记忆   | 🔴 仅 N>21 且已按 Step 1 第10项加载 `memory-digest.md` 时执行：①本章核心冲突/打脸套路是否与几十章前某章高度同型→WARNING（第三次复用→CRITICAL）；②早期专名写法是否与词表首次出现一致（数值类不一致→CRITICAL） | 桥段复用→WARNING；专名/数值漂移→WARNING/CRITICAL |

**判断规则**：

- 代词、称谓、群众性称呼**不算**角色名
- "扩展未定义细节"不算冲突，"违反已定义规则"才算
- 不确定 → WARNING 而非 CRITICAL
- 死亡角色（state.yaml 中 status: dead）出场 → CRITICAL
- **跨章重复比对范围**：上一章以 N-1 章 `content.md` 全文比对（Step 1 已加载）；N-2/N-3 章以 `summary.md` 的"可引用细节"与章末钩子描述为参考；仅比对**修辞/收束方式/意象比喻/钩子形式**的复制，真·剧情伏笔的回响（约定信物、重复物品、前后呼应台词）不算雷同

**输出格式**：

```
=== AI 综合校验报告 ===

[CRITICAL]
- 设定一致性: 第X段出现"渡劫八层"，core.md 规定渡劫为最高境界
- 大纲兑现: outline 第N章要求"主角击败黑袍人"，正文未体现

[ERROR]
- 角色名: "张三"未登记，需补 characters/张三.md 或改回泛称

[WARNING]
- 创作约束: 第Y段对暴力描写偏满，建议技巧化处理
- 英文内容: "very" 建议改为中文

[PASS]
- 设计兑现、角色名其余项、其余英文词

修复路由建议: main-repair / manual-review
```

### Step 5. 处理校验结果

- **CRITICAL/ERROR**（来自 Step 4）→ 分情况处理：

  - 若来源是 **命名角色缺设定文件** → **优先补角色设定文件**（或确认该角色应改回泛称后修正文案），补完后再重新执行 `fix-punctuation.ps1 + reformat-chapter.ps1 + validate-chapter.ps1` + 综合AI校验
  - 其他 ERROR / CRITICAL → 主流程读取现有 `content.md` + `design.md` + 相关上下文，自诊断并**只改必要位置**（最小回修，禁止整章重写）；完成后重新执行 Step 3 + Step 4
  - 修复路由为 `manual-review` → 展示问题并等待人工介入
- **WARNING** → 🔴 **必须逐条展示给用户**，包含检测项名称、具体数值和基准对比，由用户决定是否修改。

  **英文内容 WARNING 特殊处理**：
  🔴 **禁止直接跳过，必须逐个判断**。对脚本报出的每个英文单词：

  1. **合理专有名词/缩写**（军事/技术/机构术语如 `F-15I`、`GBU-57`、`GPS` 等）→ 告知用户"已确认合理"
  2. **单字母残片**（如 `F`、`I` 等被正则从复合词中切出的片段）→ 检查上下文，若属于合理复合词的一部分（如 `F-15I` 中的 `F` 和 `I`）→ PASS
  3. **不合理的英文词**（如中文语境中混入的普通英文词 `truth`、`very`、`beautiful` 等）→ 🔴 **展示给用户并建议修正为中文翻译或中文间隔号 `·`**，用户确认后修改 content.md 对应行，再重新执行后处理流水线
  4. 🔴 **禁止**不看上下文就一律标记为"合理"跳过
- **全部 PASS** → 步骤6

🔴 验证-修复不限次数，持续循环直到所有 ERROR / CRITICAL 修完。绝不因重试次数而停。

🔴 **输出自检宣言**：`✅ Step 4 完成：综合AI校验通过。 ⏳ 下一步：Step 6（生成摘要）。我不赶工，严格按流程继续。`

### Step 6. 主流程内联生成摘要

🔴 直接在主流程读 `content.md` + `core.md`（已在 Step 1 加载），按 `.dsh/templates/summary.md` 模板生成 `novel/chapters/[NNN]/summary.md`，包含：

```markdown
## 第N章 摘要

### 剧情（≤100字）
[时间][人物]在[地点][事件]，[结果/转折]。

### 剧情详述（≤500字）
[关键对话要点、重要决定、转折细节、伏笔相关场景描写、章末钩子具体内容]

### 角色状态
- [角色名]: 位置=[当前位置], 状态=[境界/生死/伤势等，无变化写"无变化"]

### 伏笔
- 新埋: [F-N-X] [简述]（如无则省略）
- 回收: [F-N-X] [简述]（如无则省略）

### 时间线
- [本章时间点/时间推进]

### 可引用细节
- [≤5条，每条≤20字。专有名词/原话/数字/物品状态。无则写"无"]

### 世界资产变更
- [资产名]: [当前值]（仅记录本章变更项，无变更写"无"）
```

写入后跑摘要校验：

```powershell
pwsh -NoProfile -File .dsh/scripts/validate-summary.ps1 -Chapter N
```

校验失败 → 主流程修 summary → 重跑校验，直到通过。

🔴 **输出自检宣言**：`✅ Step 6 完成：摘要已生成并通过校验。 ⏳ 下一步：Step 7（角色演化检测）。我不赶工，严格按流程继续。`

### Step 7. 角色演化检测（主流程内联）

主流程检查本章出场角色（已在 Step 1 加载）是否有重要变化（境界/技能/物品/关系/性格）：

- **有变化** → 直接 Edit 对应 `characters/[角色名].md` 的 `## 演化记录` 段，**追加**一条记录（不覆盖）
- **无变化** → 跳过

🔴 **输出自检宣言**：`✅ Step 7 完成：角色演化检测完成。 ⏳ 下一步：Step 8（同步全局状态）。我不赶工，严格按流程继续。`

### Step 8. 同步全局状态

```powershell
pwsh -NoProfile -File .dsh/scripts/sync-state.ps1 -Chapter N
```

🔴 **不再做 post-sync-lite 复核**。`sync-state.ps1` 是确定性脚本，相信脚本输出。

🔴 该脚本会顺带把本章的长期记忆（一句话剧情 / 专名词条 / 伏笔台账）增量追加到 `novel/state/memory-digest.md`；失败只告警、不阻断。

🔴 **输出自检宣言**：`✅ Step 8 完成：状态同步成功。 ⏳ 下一步：Step 9（深度连续性校验）。我不赶工，严格按流程继续。`

### Step 9. 深度连续性校验（调用 SubAgent continuity-validator）

🔴 **与 Step 4 的浅层自检互补**：Step 4 主流程自检负责角色名/设定/创作约束/英文/人称/AI味等专项；本步由 `continuity-validator` 在独立上下文执行深度审计（三方一致性 / 时间线 / 数值链 / 资源来源 / 角色状态 / 伏笔链 / summary-state 漂移 / 角色档案一致性 / 书籍元数据 / 设计稿反向合法性 / 跨章重复 / 角色谱系平衡），输出 CRITICAL/WARNING/PASS + 修复路由。

🔴 必须在 Step 6（摘要）与 Step 8（状态同步）之后执行——validator 的 `chapter-full` 模式需要 summary 与 state 就绪才能查漂移。

**a) 角色谱系统计（脚本先行，零 token）**

```powershell
pwsh -NoProfile -File .dsh/scripts/analyze-roster.ps1 -Chapter N
```

- 主流程先跑一次作为提前预警；validator 在其上下文加载阶段会**自行再跑同一脚本**作为第 7/8 项（新角色引入节奏 / 角色谱系平衡）的正式判定依据，主流程结果仅作参考

**b) 调用 continuity-validator**

调用 SubAgent `continuity-validator`，使用 `stage=chapter-full`（合并正文连续性 + summary/state 漂移检查，一次性完成）：

- 三方一致性：`design.md` 关键动作/结果/钩子是否在正文兑现；`outline.md` 本章事件是否端到端落地；是否出现大纲与设计稿都没有的重大偏航
- 常规连续性：时间线 / 数值资源闭环 / 角色状态 / 伏笔因果
- summary/state 漂移：summary 是否漏掉重大结果；state 是否提前写入未发生状态；关键资产与角色状态是否正确更新
- 角色档案 / 书籍元数据 / 设计稿反向合法性 / 跨章重复意象 / 角色谱系量化（validator 自跑 `analyze-roster.ps1`）

**c) 主会话独立核验**

🔴 不盲信子会话结论：对照 `content.md` / `summary.md` / `state.yaml` 复核各项评定，误报驳回（记录理由）、漏报补入；核验确认为真问题后按下述闭环修复。

**d) 结果处理（循环直到 PASS）**

- **CRITICAL / WARNING** → 按修复路由处理：
  - summary 漏写/错写 → 主会话最小修正 `summary.md` → 重跑 `validate-summary.ps1` → `sync-state.ps1` → 再次调用 validator
  - state.yaml 偏移 → 重跑 `sync-state.ps1` → 再次调用 validator
  - 正文问题 → 主会话最小回修（只改问题处） → 重跑 Step 3 三件套 → 再次调用 validator（改动较大时补跑 Step 4 关键校验项）
  - 路由为 `manual-review` → 展示问题，等待人工介入，不自动修改
- **PASS** → 继续 Step 10

🔴 验证-修复不限次数，循环直到 validator 评定 PASS 或主会话核验后确认属误报。

🔴 **输出自检宣言**：`✅ Step 9 完成：深度连续性校验通过。 ⏳ 下一步：Step 10（风格指纹）。我不赶工，严格按流程继续。`

### Step 10. 风格指纹（按需）

- 🔴 **以前10章正文为唯一文风母本**；`compute-style.ps1` 默认只采样第1~10章正文（不含标题）建立固定基准
- 如 `N < 10`：继续写作，不建基准，风格检测保持跳过状态
- 如 `N >= 10` 且 `novel/state.yaml` 中 `basedOnChapters` < 10：立即执行一次基准建立：

```powershell
pwsh -NoProfile -File .dsh/scripts/compute-style.ps1
```

- 🔴 **建立基准前必须先通过体检**：脚本会对采样章节做段落节奏体检，并写入 `baselineHealthy` 字段
  - 体检通过（`baselineHealthy: true`）→ 基准生效，后续按偏差值报警
  - 体检未通过（`baselineHealthy: false`）→ 🔴 **不要就此继续往下写**：说明前 10 章本身节奏失准（均句/均段过短或"一逗到底"），此时锁基准等于把问题固化成全书母本。应先按 `validate-chapter.ps1` 检测 5.5 的提示修正前 10 章的句子长度，再重建基准
- 基准建成后，**后续章节只与这套前10章固定基准对比，不随正文后续漂移**
- 🔴 **自愈路径（例外）**：若在**前 30 章内**发现基准本身失准，允许重建一次（这是唯一允许推翻既有基准的窗口）：

```powershell
pwsh -NoProfile -File .dsh/scripts/compute-style.ps1 -Rebuild
```

- 超过 30 章后基准不再重建（保护全书一致性）；此时节奏类问题一律走 `validate-chapter.ps1` 检测 5.5，不靠改基准绕过

### Step 11. 宪法增量（按需）

如 `design.md` 中标记 `[需更新宪法]` 的项被本章实际触发：

- 提示用户确认 → 用户同意后写入对应宪法文件
- 写入后清空 `state.yaml.batchProgress.pendingConstitution` 中已确认条目

### Step 12. 提示下一步

```
✓ 第N章完成（XXXX字）

已生成/同步：
- 正文: novel/chapters/[NNN]/content.md
- 摘要: novel/chapters/[NNN]/summary.md
- 全局状态: state.yaml 已更新
- 角色演化: [已更新角色列表] 或 [本章无角色演化变更]
- 深度校验: continuity-validator（chapter-full）已通过

下一步：
- 继续写下一章：/novel-write [N+1]
- 先设计下一章：/novel-design [N+1]
- 全书/多章深度校验：/novel-validate N（单章深度校验已在 Step 9 完成）
```

---

## 上下文管理

```
主流程上下文一次性加载，全程复用：
├── Step 1: design.md (~2k) + core.md + style.md (~3k) + outline切片 (~1k)
│           + 上一章 content.md (~3k) + N-1~N-3 summary (~2k)
│           + 出场角色文件 (~2k) + state.yaml 子段 (~1k)
│           总计 ≈ 12-15k tokens
├── Step 2: 写作（复用Step 1上下文，不额外加载）
├── Step 3: 脚本执行（0 token，进程外运行）
├── Step 4: 综合AI校验（复用Step 1上下文，不额外加载）
├── Step 6: 摘要生成（复用content.md + core.md）
├── Step 9: 深度校验（SubAgent continuity-validator 独立上下文，stage=chapter-full；
│           analyze-roster.ps1 0 token；validator 自行加载 bundle + outline 全文）
└── 仅 Step 9 调用 1 个 SubAgent，其余环节主流程直做
```

## 约束

- 🔴 **所有章节路径使用三位数补零格式**：`novel/chapters/001/`、`novel/chapters/052/`（即 `{0:D3}` 格式），如 `novel/chapters/[NNN]/content.md`、`novel/chapters/[NNN]/design.md`
- 🔴 字数由脚本最终裁决，AI 的字数估算不作为依据
- 🔴 必须先过 design.md 再写正文，禁止跳过设计
- 🔴 每章写完必须执行验证 + 状态同步，禁止跳过
- 🔴 修复段落时只改问题部分，禁止重写全章
- 🔴 **执行 .ps1 脚本必须使用 `pwsh -NoProfile -File` 方式，禁止 `-Command`**（`-Command` 会导致脚本中 `$` 变量和 `` `u{} `` 转义被 shell 二次解析，引发静默失败）
- 🔴 风格指纹基准建成后只与前 10 章对比，不允许随写随刷新
- 🔴 仅 Step 9 深度校验调用 SubAgent（continuity-validator，stage=chapter-full），其余环节主流程直做，禁止额外调用其他 SubAgent
- 🔴 单章模式不主动构建 bundle；如发现残留 `context-bundle.md`，先清理再继续
