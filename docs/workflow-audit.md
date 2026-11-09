# 小说模式（Novel Mode）工作流资产审计清单

> 审计人：workflow-auditor（task-1）
> 审计范围：`D:\yousen\novel\.codebuddy\**` 与 `D:\yousen\novel\.dsh\**`（含 `novel\AGENTS.md`）
> 目的：为「小说模式」DSH 插件提供**逐文件**打包清单（路径 / 用途 / 关键参数与依赖 / 是否随插件分发），并给出端到端流程、子代理角色、路径假设与迁移缺口。
> 所有结论基于实际读取文件（read/grep/glob），非推断。sizes 为字节数，取 `.dsh` 工作副本（`.codebuddy` 为母本，多数文件仅差前缀字符串 `.dsh`↔`.codebuddy` 与少量行数）。

---

## 0. 摘要与分类图例

| 分类 | 含义 |
|------|------|
| **BUNDLE（INSIDE）** | 共享逻辑，必须随插件包分发：技能正文、命令/子代理定义、脚本、模板、配置、规则、字表、去AI味规则、写作攻略。插件安装后须能**原样使用**。 |
| **RUNTIME（per-project）** | 每项目运行时状态/生成物，**不随插件分发**，由命令/脚本在目标小说项目的 `novel/` 目录下创建与维护：宪法、大纲、state、章节正文/设计稿/摘要、长期记忆、源书隔离目录、校验报告、临时文件。 |
| **EXCLUDE** | **禁止**进入公开开源插件：真实凭据、发布结果、缓存字节码、lockfile、迁移残留、过期大文件。可改发「空值模板」。 |
| **OPTIONAL（SEPARATE）** | 外部站点集成技能，与主写作流程解耦，建议拆成独立可选包/可选依赖。 |

**权威副本**：`novel/AGENTS.md` 明确「现以 `.dsh/` 为唯一工作副本，`.codebuddy/` 原封不动保留」。因此本审计以 `.dsh/` 为主；`.codebuddy/` 仅作为 CodeBuddy 版母本与若干**只存在于此**的资产（commands / agents / rules / .gitignore / 写作攻略）被一并登记。

**清点结果**（与 AGENTS.md 声明对齐并精确化）：

| 类别 | 数量 | 位置 |
|------|------|------|
| 工作流命令（斜杠命令母本） | **9** | `.codebuddy/commands/*.md` |
| 工作流技能（DSH 形态） | **9** | `.dsh/skills/novel-*/SKILL.md` |
| 子代理角色技能（DSH 形态） | **9** | `.dsh/skills/agent-*/SKILL.md` |
| 支撑技能 | **3** | `.dsh/skills/{Humanizer-zh,site-fanqie,novel-downloader}/` |
| DSH 技能合计 | **21** | `.dsh/skills/*/SKILL.md` ✓ 与 AGENTS.md「21 个技能」一致 |
| 子代理角色定义（母本） | **9** | `.codebuddy/agents/*.md` |
| PowerShell 脚本（含 lib 与空桩） | **19** | `.dsh/scripts/*.ps1` + `lib/paragraph-metrics.ps1` |
| Python 脚本 | **2** | `.dsh/scripts/fanqie-{rank,download}.py` |
| 脚本合计 | **21** | AGENTS.md 概称「20 个」，精确为 21（含 1 个 0 字节空桩 `invoke-subagent.ps1`） |
| 模板 | **7** | `.dsh/templates/`（含 `constitution/` 子目录 3 个） |
| 规则（.mdc） | **2** | 仅 `.codebuddy/rules/`（`.dsh/` **无** rules 目录，见 §6） |
| 配置 | **2** | `.codebuddy/config.yaml`（32 行，含 `review:`）、`.dsh/config.yaml`（20 行，**无** `review:`） |
| 字表 | **2** | 两树各一份 `charset.json`（4175 B） |

---

## 1. 两套目录的关系（给打包者的第一原则）

| 资产 | `.codebuddy/`（CodeBuddy 母本） | `.dsh/`（DSH 唯一工作副本） | 说明 |
|------|:---:|:---:|------|
| `commands/*.md`（9） | ✅ | ❌ | DSH 无自定义斜杠命令；9 命令已转成 9 个 `novel-*` SKILL.md（frontmatter 增加 `name`/`whenToUse`，正文几乎逐行对应） |
| `agents/*.md`（9） | ✅ | ❌ | 9 个角色定义转成 9 个 `agent-*` SKILL.md（正文含完整 `<context_loading>`/`<checks>`/`<severity>`/`<output_format>`） |
| `rules/*.mdc`（2） | ✅ | ❌ | **悬空**：`.dsh/skills/novel-batch/SKILL.md` 仍引用 `.dsh/rules/subagent-prompt-whitelist.mdc`，但该文件未迁移（详见 §6） |
| `skills/` 工作流 9 + 角色 9 + 支撑 3 | 部分（仅支撑技能 + 旧 `site-fanqie/novel-downloader` 嵌套） | ✅ 完整 21 | `.dsh/skills/` 是插件应采用的 DSH 原生形态 |
| `config.yaml` | ✅ 含 `review.design/outline/chapter` | ✅ **缺** `review:` 段 | 见 §6 迁移缺口 |
| `charset.json` | ✅ | ✅ | 内容相同；`fanqie-*.py` 依赖其位于「scripts 的上一级」 |
| `templates/` | ✅ | ✅ | 内容相同 |
| `scripts/` | ✅ | ✅ | 内容相同，仅路径前缀字符串不同（`.codebuddy/scripts` ↔ `.dsh/scripts`） |
| `.gitignore` / `编辑星河网文写作攻略.md` | ✅ | ❌ | 写作攻略另有 `novel/编辑星河网文写作攻略.md`（根级副本） |
| 迁移残留 | `skills/site-fanqienovel/`（仅 1 个 `.pyc`）、`skills/site-fanqie/novel-downloader/`（重复副本 + `.pyc`）、`scripts/__pycache__/` | 无 | 全部 EXCLUDE |

---

## 2. 资产总表（逐文件）

### 2.1 工作流技能（9，`novel-*`）— 全部 **BUNDLE**

> DSH 调用方式（AGENTS.md）：无斜杠命令；模型按 `whenToUse` 自动匹配，或输入框 `/` 点选技能名再补参数；需要独立上下文时由主流程用 `subagent` 工具加载 `agent-*` 技能。
> 共同依赖：`.dsh/scripts/*.ps1`、`.dsh/templates/*`、`.dsh/config.yaml`（wordCount/memory）、`Humanizer-zh` 技能、`novel/` 运行时目录。

| 路径（`.dsh/skills/...`） | 大小 | 用途 / 输入参数 | 关键依赖 | 分类 |
|---|---:|---|---|---|
| `novel-constitution/SKILL.md` | 28802 | 创建/更新宪法（引导 A / 自由输入 B / 文档导入 C / 番茄热榜选题 D 四模式）。$ARGUMENTS 含设定则跳引导；含路径→C；含「热榜/排行/选题/番茄」→D | 模板 `templates/constitution/{core,style,characters/_template}.md`、`templates/bookinfo.md`；模式 D 调 `python3 .dsh/scripts/fanqie-rank.py --gender male --top 10 --output novel/source/rank-data.json --format json` 与 `fanqie-download.py <book_id> --output-dir novel/source --chapters 30`；`compute-style.ps1`（导入时建基准，前 30 章内可 `-Rebuild`） | BUNDLE |
| `novel-disassemble/SKILL.md` | 26327 | 拆书仿写：源书路径 / 番茄 URL / 纯数字 ID；`--genre`、`--depth 粗拆\|精拆`、`--chapters N`（默认 30）、`--skip-write`。Phase 0 下载→1 拆分→2 数值预分析→3 七维拆解→4 合并报告→5 换皮设定→6 骨架重构→7 反抄袭→8 接写作 | `fanqie-download.py`、`split-chapters.ps1`、`analyze-source.ps1`（含 `-Mode similarity` 反抄袭）、模板 `templates/disassemble-report.md`；SubAgent `agent-book-analyzer`（≤5 章/批）、`agent-skeleton-rebuilder`；源书严格隔离在 `novel/source/` | BUNDLE |
| `novel-import/SKILL.md` | 14717 | 从已有书稿接入：扫描→拆章→分片提取宪法→合并确认→作品信息→逐章摘要→build-state→compute-style→全书校验→生成 `outline.md` 骨架 | `split-chapters.ps1`（`-InputFile`/`-InputDir`）、`build-state.ps1`、`compute-style.ps1`、`validate-chapter.ps1 -Chapter All`、`templates/{bookinfo,summary}.md`；SubAgent `agent-constitution-extractor`（≤5 章/批）、`agent-chapter-summarizer`；临时 `novel/temp/partial-*.yaml` 用后清理 | BUNDLE |
| `novel-outline/SKILL.md` | 4825 | 高质量结构化章纲扩写，追加到 `novel/outline.md`。参数 `N` / `N-M`（≤20 章）/ `all --extend` / `--standard` | SubAgent `agent-chapter-outliner`（`startChapter/endChapter/totalTarget/mode=structured`）；前置校验 `state.yaml.lastChapter` 保护已写章节；`novel/state/memory-digest.md`（>21 章时） | BUNDLE |
| `novel-design/SKILL.md` | 36104 | 三模式：`all`（全书大纲）、`all --extend`（追加）、`N`（单章设计稿）。模式 N 固定双重校验：`create-design-template.ps1 -Chapter N -Force` 生成合规骨架 → 填充 → `validate-design.ps1` → 语义校验 stage=design | `templates/chapter-design.md`；`validate-design.ps1`；`config.yaml` 的 `review.design/outline`；SubAgent/inline `continuity-validator`；前一章 `design.md`+`content.md` 差异化比对（防雷同） | BUNDLE |
| `novel-write/SKILL.md` | 26535 | 单章写作：$ARGUMENTS = 章节号 N。Step 1 一次性加载最小上下文 → 2 直写 `content.md` → 3 后处理三件套 → 4 综合 AI 校验（含 humanizer-zh）→ 5 处理 → 6 内联摘要 → 7 角色演化 → 8 `sync-state` → 9 深度校验 chapter-full → 10 风格指纹 → 11 宪法增量 | `fix-punctuation.ps1` / `reformat-chapter.ps1` / `validate-chapter.ps1` / `check-ai-flavor.ps1` / `validate-summary.ps1` / `sync-state.ps1` / `analyze-roster.ps1` / `compute-style.ps1`；`templates/summary.md`；`config.yaml` wordCount + `review.chapter`；`Humanizer-zh/SKILL.md` | BUNDLE |
| `novel-batch/SKILL.md` | 70893 | 批量自动写作。`1-100`、`15-50`、`--resume`、`--check N`、`--skip-design`。有限状态机：Step O（自动补纲，≤20 章/批）→ O1/O2（语义评审/回修）→ 每章串行 `A0→A→A1→A2→B→B2→C→D1→D2→D3→D4→E`；5 条关卡自检宣言；断点写回 `batchProgress` | 几乎所有脚本；SubAgent `agent-batch-outliner` / `agent-batch-designer`（**只传单章号**）/ `agent-novel-writer`（连产 content+summary）/ `agent-continuity-validator`（outline/design/chapter-full）；`build-context-bundle.ps1`（生成并每章清理 `context-bundle.md`）；`build-memory-digest.ps1`（>21 章补齐）；引用 `.dsh/rules/subagent-prompt-whitelist.mdc`（悬空，§6） | BUNDLE |
| `novel-validate/SKILL.md` | 20551 | 硬性一致性校验 `N` / `N,M,...` / `all`：后处理三件套 → 22 项检测（脚本 13 项 + AI 9 项）→ 默认自动最小回修复验 | `fix-punctuation/reformat-chapter/validate-chapter/analyze-roster.ps1`；SubAgent `continuity-validator`（chapter-full）与 `chapter-summarizer`（缺摘要时）；`Humanizer-zh/SKILL.md` | BUNDLE |
| `novel-design-export/SKILL.md` | 1896 | 导出单章写作上下文到 `novel/chapters/[NNN]/design-export.md` 供外部 LLM；把 humanizer-zh 规则追加进导出文件 | `export-design-context.ps1 -Chapter N`；`.dsh/skills/Humanizer-zh/SKILL.md` | BUNDLE |

### 2.2 子代理角色技能（9，`agent-*`）— 全部 **BUNDLE**

> 均为「被主流程用 `subagent` 工具在独立上下文加载」的角色，每个自带 `<context_loading>`（自行加载所需文件），主流程只传参数 + 一句加载指令（白名单规则，见 §4）。
> 与 `.codebuddy/agents/<name>.md` 一一对应（后者是母本，含 CodeBuddy frontmatter `tools/agentMode/enabled/enabledAutoRun`）；**DSH 插件采用 `.dsh` 的 SKILL.md 形态**。二者正文内容近乎一致，但注意 §6 的 `<inline_execution>` 差异。

| 路径（`.dsh/skills/...`） | 大小 | 角色 / 传入参数 | 关键依赖与产出 | 分类 |
|---|---:|---|---|---|
| `agent-novel-writer/SKILL.md` | 23828 | 按 design.md 写单章正文 + **连产** `summary.md` + 角色演化同步。参数 `chapter` / `characters` / `foreshadow_ids` | design.md（主蓝图）、core/style、outline 创作约束、上一章 content、N-1~N-3 summary、`config.yaml` wordCount、`Humanizer-zh/SKILL.md` 的【去AI味规则】 | BUNDLE |
| `agent-continuity-validator/SKILL.md` | 27257 | 深度连续性审计，只输出 CRITICAL/WARNING/PASS + 修复路由，不改文件。5 种 stage：`outline/design/chapter/chapter-full/post-sync-lite`。参数 `stage` + (`chapter` 或 `rangeStart/rangeEnd`) | `outline.md` **全文直读**为权威源；`context-bundle.md`（design/chapter/chapter-full 模式）；自跑 `analyze-roster.ps1`（角色谱系第 7/8 项）；`memory-digest.md`（rangeStart>21 必读）；`Humanizer-zh/SKILL.md` | BUNDLE |
| `agent-book-analyzer/SKILL.md` | 11733 | 拆书七维分析，≤5 章/批，只输出模式/手法/节奏/文笔风格，严禁摘抄原文。参数 `batch_id` / `chapter_range` / `analysis_data` / `is_first_batch` / `is_last_batch` | `novel/source/chapters/[N]/content.md`、前批 `dissect-*.yaml`、本批 `analysis.json` 摘要；产出 `novel/source/dissect-[batch].yaml` | BUNDLE |
| `agent-chapter-outliner/SKILL.md` | 13838 | 结构化章纲扩写（功能定位/情节要点/冲突/爽点/章末钩子/角色出场），格式自适应（标题式 or 表格式沿用现有）。参数 `startChapter/endChapter/totalTarget/mode` | outline 全文、state、近章摘要、`memory-digest.md`（>21 章，缺失则 `build-memory-digest.ps1 -Rebuild`） | BUNDLE |
| `agent-batch-outliner/SKILL.md` | 11517 | 无人值守一段式补纲，≤20 章/批，追加到 outline.md。参数 `startChapter/endChapter/totalTarget` | 宪法、已有 outline、state、活跃伏笔、近章摘要、`memory-digest.md` | BUNDLE |
| `agent-batch-designer/SKILL.md` | 17295 | 批量流程中自动生成**单章** `design.md`（🔴 收到范围参数只处理第一章并告警）。参数 `chapter` | 优先读 `context-bundle.md` + outline 全文，缺失回退逐个加载；`templates/chapter-design.md`；`config.yaml` wordCount | BUNDLE |
| `agent-chapter-summarizer/SKILL.md` | 10230 | 单章三层结构化摘要 + 角色演化追加到 `## 演化记录`。参数 `chapter` / `characters` | 本章 content.md、core.md、上章 summary.md；`templates/summary.md` 格式 | BUNDLE |
| `agent-constitution-extractor/SKILL.md` | 4282 | 从设定文档 + 一批章节提取结构化设定（世界观/角色/风格，`[不可变]` 判定），≤5 章/批。参数 `batch_id` / `chapter_range` / `setting_doc` | 产出 `novel/temp/partial-[N].yaml`（主流程合并后清理） | BUNDLE |
| `agent-skeleton-rebuilder/SKILL.md` | 9965 | 拆书报告骨架 DNA + 换皮设定 → 全新宪法 + outline.md，严禁复制源书具体内容。参数 `report_path` / `user_settings`（genre/world_setting/protagonist/characters/power_type/protagonist_start/conflict_path/style_preference/target_chapters/plan_range/plan_mode）/ `template_dir` | `novel/source/report.md`；`templates/constitution/`（含 `characters/_template.md`）；**只读报告与设定，不读源书原文** | BUNDLE |

### 2.3 支撑技能（3）

| 路径（`.dsh/skills/...`） | 大小 | 用途 | 分类 |
|---|---:|---|---|
| `Humanizer-zh/SKILL.md` (+ `README.md` 8038 / `LICENSE` 1084 / `.gitignore` 47) | 19616 | 去 AI 味规则（24 种 AI 痕迹 + 快速检查清单 + 质量评分）。被 `novel-write` / `novel-batch` / `novel-validate` / `agent-novel-writer` / `agent-continuity-validator` / `novel-design-export` 引用（路径 `.dsh/skills/Humanizer-zh/SKILL.md`，或 `use_skill humanizer-zh`）；`agent-novel-writer.md` 的【去AI味规则】段是项目内并用的权威补充 | **BUNDLE**（核心共享逻辑） |
| `site-fanqie/SKILL.md` (+ `scripts/` 15 py/js、`references/` 8 文档、`package.json` 229、`package-lock.json` 939、`fanqienovel_auth.json` 2607、`publish_result.json` 2391) | 15118 | 番茄系站点**外部集成**：作者后台（查/发章节、数据、收益、评论、签到，需凭证）、短剧榜单（免登录）、帮助中心/作家课堂（免登录）。三通道闭环「选题→写作→发布→诊断→答疑」 | **OPTIONAL（SEPARATE）**；内含 **EXCLUDE** 凭据/生成物（见 §2.9）。`fanqie_encrypt.js` 依赖 `../references/vm_code.js`；`api_client.py` 以 `scripts/` 上一级为技能根定位 `fanqienovel_auth.json`（可用环境变量 `FANQIENOVEL_DATA_DIR` 覆盖）；`package.json` 依赖 `crypto-js` + `bignumber.js`（需 `npm install`）；`references/main.e63907e3.js` 1831521 B、`writer_backend_api_report.json` 1209212 B 为逆向分析大文件 |
| `novel-downloader/SKILL.md` (+ `scripts/novel_download.py` 19824、`scripts/novel_crawler.py` 10309) | 8946 | 网络小说 TXT 下载（多源搜索、打包下载、逐章爬虫、GBK→UTF-8 转码、完整性校验）。命令形如 `py scripts/novel_download.py 书名 --source sudugu --id {aid} --out d:/yousen/`（相对技能根） | **OPTIONAL（SEPARATE）**：与主写作流程无硬依赖，仅 `novel-disassemble`/热榜选题的取书备选 |

> 备注：`site-fanqie` 与 `novel-downloader` 在 `.codebuddy` 中还有一份**嵌套旧副本**（`skills/site-fanqie/novel-downloader/`）和一个只含 `.pyc` 的 `skills/site-fanqienovel/` —— 均为迁移残留，EXCLUDE。

### 2.4 命令母本（9，`.codebuddy/commands/`）— **BUNDLE（或按插件形态取舍）**

| 路径 | 大小 | 用途（对应技能） | 分类 |
|---|---:|---|---|
| `novel-constitution.md` | 28653 | 宪法创建/更新（引导/自由/文档导入/热榜四模式、类型预设库、平台审核红线、读者视角追问、文笔约束推导）→ `novel-constitution` | BUNDLE |
| `novel-disassemble.md` | 26259 | 拆书仿写七维拆解 + 换皮重构 + 反抄袭校验 → `novel-disassemble` | BUNDLE |
| `novel-import.md` | 14618 | 从已有书稿导入构建宪法/摘要/状态/风格指纹/大纲骨架 → `novel-import` | BUNDLE |
| `novel-outline.md` | 4437 | 章纲扩写命令（与 `novel-design all --extend` / `novel-batch` Step O 分工表）→ `novel-outline` | BUNDLE |
| `novel-design.md` | 37813 | 大纲/设计稿三模式 + `review.design/outline` 配置 + 跨章防雷同自检 → `novel-design` | BUNDLE |
| `novel-write.md` | 28302 | 单章写作 12 步 + `review.chapter` 配置 + 黄金开篇铁律 → `novel-write` | BUNDLE |
| `novel-batch.md` | 71130 | 批量有限状态机（最大文件，1036 行）→ `novel-batch` | BUNDLE |
| `novel-validate.md` | 20521 | 22 项校验 + 自动回修 + 多章汇总报告 → `novel-validate` | BUNDLE |
| `novel-design-export.md` | 1841 | 导出写作上下文 + 追加去AI味规则 → `novel-design-export` | BUNDLE |

> 打包决策：DSH 运行时用 SKILL.md 注册技能，命令 `.md` 是 CodeBuddy 斜杠命令母本。若插件只面向 DSH，可**仅分发 21 个 SKILL.md**；但命令正文是技能正文的「原始完整版」（含 `review:` 配置说明、`agents/continuity-validator.md` 的 `<inline_execution>` 引用、`.codebuddy/rules/` 规则引用），建议作为 `docs/legacy-commands/` 或对照资料随包保留，避免逻辑丢失。

### 2.5 子代理角色定义母本（9，`.codebuddy/agents/`）— **BUNDLE**

| 路径 | 大小 | 角色 | 关键内容 | 分类 |
|---|---:|---|---|---|
| `novel-writer.md` | 23895 | 写正文 + 连产摘要 | frontmatter `tools: Read,Write,Edit,Bash; agentMode: agentic`；`<context_loading>` 设计稿驱动轻量加载；【去AI味规则】段（226 行起，项目并用权威） | BUNDLE |
| `continuity-validator.md` | 29338 | 深度连续性审计（5 stage） | `<context_loading>`（outline 全文直读 + bundle 路径 A/B）、`<checks>` 25 项、`<severity>`、`<output_format>`、`<inline_execution>`（346–361 行，**仅此文件有**，供 `review.*=inline` 时主会话执行） | BUNDLE |
| `book-analyzer.md` | 11611 | 拆书七维 | 每批 ≤5 章，输出 `dissect-*.yaml`，禁摘抄 | BUNDLE |
| `constitution-extractor.md` | 4206 | 分片提取设定 | ≤5 章/批，纯设定文档模式，`[不可变]` 判定 | BUNDLE |
| `skeleton-rebuilder.md` | 9935 | 骨架换皮重构 | 加载 `report.md` + 换皮设定 + `.codebuddy/templates/constitution/` | BUNDLE |
| `batch-outliner.md` | 11508 | 无人值守补纲 | ≤20 章/批，追加 outline.md | BUNDLE |
| `chapter-outliner.md` | 14065 | 结构化章纲 | 格式自适应（标题式/表格式） | BUNDLE |
| `batch-designer.md` | 17304 | 单章设计稿 | 收到范围只处理第一章 | BUNDLE |
| `chapter-summarizer.md` | 10281 | 单章三层摘要 + 角色演化 | 上下文最小化 | BUNDLE |

> 这些 `.md` 是 `.dsh/skills/agent-*/SKILL.md` 的转换母本。**关键**：`continuity-validator.md` 的 `<inline_execution>` 段在 `.dsh` 技能里**缺失**（grep `.dsh/skills` 无 `inline_execution` 命中），而 `.dsh` 命令/技能仍引用 `review.*=inline` 语义 —— 见 §6。

### 2.6 脚本（21 + 2 支持文件，`.dsh/scripts/`）— 全部 **BUNDLE**（凭据文件除外）

> 统一执行铁律（AGENTS.md + `rules/script-execution.mdc`）：**必须 `pwsh -NoProfile -File`**，禁止 `-Command`/`-c`（否则 `$变量` 与 `` `u{} `` 被外层二次解析）；Mandatory 参数必须显式传入否则挂起；退出码 0=成功；脚本经 `$PSScriptRoot` 自推项目根，无需 cd。章节目录一律三位补零 `novel/chapters/{0:D3}/`。

| 路径（`scripts/...`） | 大小 | 用途 | 关键参数 / 依赖 | 分类 |
|---|---:|---|---|---|
| `validate-chapter.ps1` | 36049 | 正文 13 项硬校验（字数/设定冲突/风格指纹/格式/英文标点/伏笔ID/元数据泄漏/章节号泄漏/波浪线/对话格式/结束标记/场景分隔符/**检测 5.5 段落节奏**）+ `all` 模式导入报告 | `-Chapter N\|All`；读 `config.yaml` wordCount；点源 `lib/paragraph-metrics.ps1`；产出 `novel/validation/import-report.md`（All 模式） | BUNDLE |
| `sync-state.ps1` | 36806 | 从 `summary.md` 确定性聚合 `state.yaml`（timeline/characters/foreshadowing/worldAssets），并**增量**维护 `novel/state/memory-digest.md` | `-Chapter N`；正则解析固定格式摘要；失败分类自愈 `[RETRY_SUMMARIZER]`/`[REGISTER_CHARACTER]`/`[MANUAL_REVIEW]`；调 `build-memory-digest.ps1` | BUNDLE |
| `validate-design.ps1` | 27830 | 设计稿格式合法性（场景表格篇幅占比、出场角色建档、回收伏笔 ID 在 state.active 中） | `-Chapter N`；`~泛称~` 自动跳过 | BUNDLE |
| `build-context-bundle.ps1` | 26728 | 合并高频上下文到 `novel/chapters/[NNN]/context-bundle.md`（缓存，非真相源）：宪法/state/设计稿模板/全部角色/近章摘要/远章压缩/**远期记忆索引**/伏笔关联/本章 design/上一章全文 | `-Chapter N`（必传）、`-ForeshadowIds "F-16-1,..."`；读 `config.yaml` 的 `memory` 段（farIndexFullChapters/oldIndexCharLimit/lexiconMaxEntries）；自动刷新 `memory-digest.md`；缺失检测 `[RETRY_SUMMARIZER]`/`[RETRY_WRITER]` | BUNDLE |
| `analyze-source.ps1` | 19085 | 拆书数值预分析（字数/节奏指纹/对话比/钩子密度/情绪词频/卷结构）+ `-Mode similarity` 反抄袭 N-gram | `-InputDir`、`-Mode analyze\|similarity`、`-SourceDir`、`-TargetFile`；产出 `novel/source/analysis.json` + `analysis-summary.txt` | BUNDLE |
| `create-design-template.ps1` | 14768 | 生成合规 `design.md` 骨架（从 state.yaml 预填时间线/角色/伏笔，从 outline.md 提第 N 章梗概），生成后自带一次骨架校验 | `-Chapter N`（必传）、`-Force`、`-Scenes N`；读 `config.yaml` wordCount；调 `validate-design.ps1` | BUNDLE |
| `export-design-context.ps1` | 17205 | 导出单章写作上下文 `design-export.md`（宪法/近章摘要/上章正文/出场角色/设计稿/字数约束提示词） | `-Chapter N`；读 `config.yaml` wordCount + `novel/bookinfo.md` 书名 | BUNDLE |
| `build-state.ps1` | 11729 | 导入时全量遍历 `summary.md` 重建 `state.yaml` + `state/timeline-archive.yaml` + `state/resolved-foreshadowing.yaml`，并全量重建 `memory-digest.md` | 无必传；调 `build-memory-digest.ps1` | BUNDLE |
| `build-memory-digest.ps1` | 12948 | 增量维护全书长期记忆 `novel/state/memory-digest.md`（逐章一句话剧情 + 专名词表 + 伏笔台账，头部 `<!-- covered: 1-K -->`） | `-UpTo N`、`-Rebuild`、`-ProjectRoot "路径"`（共享 .dsh 多项目必需）；常态由 sync-state / build-context-bundle 自动调 | BUNDLE |
| `compute-style.ps1` | 10100 | 以前 1~10 章正文建固定风格指纹基准（均句/对话比/段长 P50P75/叹号频率）+ 段落节奏体检 `baselineHealthy` 写入 state.yaml | 无必传；`-InputDir`/`-Output`/`-StartChapter`/`-EndChapter`/`-Rebuild`（🔴 仅前 30 章内允许一次）；点源 `lib/paragraph-metrics.ps1` | BUNDLE |
| `validate-summary.ps1` | 10197 | 摘要结构与固定格式校验（剧情/详述/角色状态/伏笔/时间线/可引用细节/世界资产变更） | `-Chapter N`；按 `templates/summary.md` 格式 | BUNDLE |
| `check-ai-flavor.ps1` | 10319 | AI 味机械检测（清单体/八股词/高频词/段落节奏），只输出参考信号（`[AI味参考] 段落节奏` 为硬问题） | `-Chapter N` 或 `-All`；`-ProjectRoot`（共享 .dsh 多项目必需）；点源 `lib/paragraph-metrics.ps1` | BUNDLE |
| `reformat-chapter.ps1` | 10875 | 一句一段机械重排（空行分隔） | `-Chapter N`、`-DryRun` | BUNDLE |
| `fix-punctuation.ps1` | 5122 | 英文标点→中文标点批量替换（含数字上下文豁免） | `-Chapter N`、`-DryRun` | BUNDLE |
| `split-chapters.ps1` | 7814 | 书稿拆章（识别 `第X章`/`Chapter X`/Markdown 标题，序章入 `000/`），输出 JSON 统计 | `-OutputDir`（必传）、`-InputFile` 或 `-InputDir`、`-Encoding` | BUNDLE |
| `analyze-roster.ps1` | 8023 | 角色谱系量化（近 10 章 design.md 出场角色列）：`activeNamedTotal`/`sceneOverload`/`newCharsThisChapter`/`staleCores`/`roster` | `-Chapter N` | BUNDLE |
| `validate-outline.ps1` | 2714 | outline.md 最小可用性检查（存在/非空/范围参数合法），**不做逐章模板校验** | `-StartChapter N -EndChapter M` 或 `-All`；用 `(Resolve-Path (Join-Path $scriptDir '..\..'))` 推项目根 | BUNDLE |
| `lib/paragraph-metrics.ps1` | 11112 | **公共库，不单独执行**：人类成书实测基线（4 本网文各 30 万字）+ ERROR/WARNING 两级绝对阈值 + `Get-ParagraphMetrics`/`Get-ParagraphBandIssues` | 被 `validate-chapter.ps1`（检测 5.5）、`check-ai-flavor.ps1`、`compute-style.ps1` **点源加载**：`. (Join-Path $PSScriptRoot "lib/paragraph-metrics.ps1")` | BUNDLE |
| `invoke-subagent.ps1` | **0** | 空桩（0 字节），未被任何命令/技能引用 | — | BUNDLE（占位）或 EXCLUDE（建议删除空桩） |
| `fanqie-rank.py` | 13740 | 番茄新书排行榜抓取（纯标准库 + `charset.json` 字体解密），输出各分类 TOP10 | `--gender male\|female`、`--top N`、`--output <json>`、`--format json`；`CHARSET_FILE = SCRIPT_DIR.parent / 'charset.json'` | BUNDLE（热榜选题 D 模式依赖） |
| `fanqie-download.py` | 14290 | 番茄小说前 N 章下载（供拆书 Phase 0） | `<book_id_or_url>`、`--output-dir`、`--chapters N`；`CHARSET_FILE = Path(__file__).parent.parent / 'charset.json'` | BUNDLE |
| `requirements.txt` | 354 | 依赖声明：`fanqie-rank.py` / `fanqie-download.py` **纯标准库**，Python ≥3.7，无需 pip | — | BUNDLE |
| `fanqie-auth.json` | 386 | **真实凭据**：`msToken` / `session_id` / `device_id` / `user_id` / `web_id` | — | **EXCLUDE**（详见 §2.9） |

### 2.7 模板（7，`.dsh/templates/`）— 全部 **BUNDLE**

| 路径 | 大小 | 用途 | 被谁读取 | 分类 |
|---|---:|---|---|---|
| `bookinfo.md` | 453 | 作品信息骨架（书名 ≤15 字 / 简介 150~300 字 / 类型 / 目标平台 / 标签） | `novel-constitution`、`novel-import` Step 4b；运行时产出 `novel/bookinfo.md` | BUNDLE |
| `constitution/core.md` | 876 | 核心世界观模板（`[不可变]`/`[可变]` 标注 + `## 机器校验规则` 冲突正则） | `novel-constitution`、`agent-skeleton-rebuilder`、`agent-constitution-extractor` | BUNDLE |
| `constitution/style.md` | 2514 | 写作风格模板（人称/时态/中文双引号/基调/文笔约束 5 维） | `novel-constitution`、`agent-skeleton-rebuilder` | BUNDLE |
| `constitution/characters/_template.md` | 1405 | 单角色设定模板（性格内核/说话风格，**必须含 `## 演化记录`**） | `novel-constitution`、`agent-skeleton-rebuilder` | BUNDLE |
| `chapter-design.md` | 6698 | 章节设计稿模板（上文状态/本章目标/场景规划篇幅占比表/伏笔操作/写作硬约束） | `novel-design` 模式 N、`agent-batch-designer`、build-context-bundle（作为 bundle 内嵌模板） | BUNDLE |
| `summary.md` | 1693 | 三层摘要模板（剧情 ≤100 字 / 详述 ≤500 字 / 角色状态 / 伏笔 / 时间线 / 可引用细节 / 世界资产变更，固定格式供脚本正则提取） | `novel-write` Step 6、`agent-chapter-summarizer`、novel-batch 兜底补摘要 | BUNDLE |
| `state.yaml` | 1498 | 全局状态初始骨架（version/lastChapter/timeline/characters/foreshadowing/worldAssets/styleFingerprint/batchProgress） | `sync-state.ps1`/`build-state.ps1` 写入时的结构基准；运行时产出 `novel/state.yaml` | BUNDLE |
| `disassemble-report.md` | 3661 | 拆书总报告模板（骨架 DNA/角色功能矩阵/金手指模式/爽点公式库/写作风格指纹/可复用技巧） | `novel-disassemble` Phase 4 生成 `novel/source/report.md` | BUNDLE |

### 2.8 配置 / 规则 / 数据 / 文档

| 路径 | 大小 | 用途 | 关键内容 | 分类 |
|---|---:|---|---|---|
| `.dsh/config.yaml` | 1174 | **插件运行时配置**（母本同步到各小说项目） | `wordCount{min:2000,target:2500,max:3500}`、`memory{farIndexFullChapters:40,oldIndexCharLimit:30,lexiconMaxEntries:150}`；缺省回退内置默认。**缺 `review:` 段**（§6） | BUNDLE（须补全，见 §6） |
| `.codebuddy/config.yaml` | 2340 | 母本配置（比 `.dsh` 多 `review` 段） | `review.design/outline/chapter: inline`（`subagent` 为缺省；子代理不可用时降级 inline 并注明）；注释明确「`/novel-batch` 与 `/novel-validate` 不读本段，仍固定调用 SubAgent」 | BUNDLE（作为 `review:` 段补齐来源） |
| `.dsh/charset.json` / `.codebuddy/charset.json` | 4175 | 番茄字体加密字表（两个字符映射数组，`CHARSET_CODE=[[58344,58715],[58345,58716]]`） | 被 `fanqie-rank.py` / `fanqie-download.py` 以「scripts 上一级」相对路径读取 | BUNDLE（**必须放在 `.dsh/` 根，与 scripts/ 同级**） |
| `.codebuddy/rules/script-execution.mdc` | 4846 | 全局强制规则：`pwsh -NoProfile -File` 禁 `-Command`、各脚本必传/可选参数速查表、`$PSScriptRoot` 免 cd、退出码语义 | `alwaysApply: true` | BUNDLE（DSH 侧以 AGENTS.md 承载，但建议随包保留规则原文） |
| `.codebuddy/rules/subagent-prompt-whitelist.mdc` | 4707 | 全局强制规则：主流程只当调度员（参数 + 一句加载指令），禁列文件/剧情/上下文；子会话返回的批判性评判（PASS 放行、CRITICAL/WARNING 复查、事实文件 > 子会话判断 > 主会话记忆）；附各 SubAgent prompt 模板 | `alwaysApply: true`，`updatedAt 2026-03-09` | BUNDLE（**且须补迁移到 `.dsh/rules/`**，见 §6） |
| `novel/AGENTS.md` | 108 行 | 工作流总入口：目录布局、9 命令→9 技能映射表、9 原子代理→9 技能映射表、PowerShell 执行规则、SubAgent 规则、通用写作铁律、多项目说明（根目录无 `novel/`，实际项目在 `archive/*` 与 `new/`） | 项目级 AGENTS.md，被 DSH 自动注入上下文 | BUNDLE（作为插件的 `AGENTS.md`/入口说明；或注入 systemPrompt.section —— 与 task-2 结论对齐） |
| `.codebuddy/编辑星河网文写作攻略.md`（+ `novel/编辑星河网文写作攻略.md` 根级副本） | 13681 | 起点编辑星河网文写作全攻略（253 行，题材避坑/写长不崩法则/卖点分阶段演变等），命令与技能正文中引用其观点（内联引用，无路径依赖） | 参考知识库 | BUNDLE（可选随包；无硬路径依赖） |
| `.codebuddy/.gitignore` | 14 | `/.idea/` 忽略项（内容含疑似误入的 `=====` 行） | — | EXCLUDE 或忽略 |

### 2.9 凭据 / 生成物 / 残留 — **EXCLUDE（禁止进入公开插件）**

> 依据 lead 的 CRITICAL 打包提示，逐项核实：

| 路径 | 大小 | 风险 | 处置 |
|---|---:|---|---|
| `.dsh/skills/site-fanqie/fanqienovel_auth.json`（`.codebuddy` 同名副本） | 2607 | **真实账号凭据**：完整 `cookie`（含 `sessionid` / `sid_guard` / `passport_csrf_token` / `passport_mfa_token` / `uid_tt` / `ttwid` / `s_v_web_id=verify_...` 等）、`ms_token`、`a_bogus`、`secsdk_token`（x-secsdk-csrf-token） | **EXCLUDE**；改发 `fanqienovel_auth.json.template`（空 `cookie`/`ms_token`/`a_bogus`/`secsdk_token` + `note` 字段说明如何 F12 抓取）。`api_client.py` 的 `load_auth()` 已支持读空值报错 + 环境变量 `FANQIENOVEL_DATA_DIR` 覆盖目录 |
| `.codebuddy/scripts/fanqie-auth.json` / `.dsh/scripts/fanqie-auth.json` | 386 | **真实凭据**：`msToken`、`session_id`、`device_id`、`user_id`、`web_id` | **EXCLUDE**（或空值模板） |
| `.dsh/skills/site-fanqie/publish_result.json`（`.codebuddy` 同名副本） | 2391 | **真实发布结果/业务数据**：书名《全校最差班，藏了个省状元》、`book_id` 7677483242244541502、`item_id` 7680561916242035262、章节发布状态 | **EXCLUDE**（运行期生成物，非资产） |
| `.dsh/skills/site-fanqie/package-lock.json` | 939 | lockfile（含依赖解析信息），非源码 | **EXCLUDE**（`package.json` 已声明 crypto-js / bignumber.js，安装时重生成） |
| 各 `__pycache__/*.pyc`（`scripts/`、`skills/site-fanqie/scripts/`、`skills/site-fanqie/novel-downloader/scripts/`、`skills/site-fanqienovel/scripts/`） | 若干 | 编译缓存 / 迁移残留 | **EXCLUDE** |
| `.codebuddy/skills/site-fanqienovel/`（仅 1 个 `.pyc`） | — | 迁移残留空壳 | **EXCLUDE** |
| `.codebuddy/skills/site-fanqie/novel-downloader/`（重复副本 + `.pyc`） | — | 与 `.dsh/skills/novel-downloader/` 重复的旧副本 | **EXCLUDE** |
| `.dsh/skills/site-fanqie/references/main.e63907e3.js`（1.8 MB）、`writer_backend_api_report.json`（1.2 MB） | 3 MB | 逆向分析大文件，非运行必需（`fanqie_encrypt.js` 仅引用 `../references/vm_code.js`） | **EXCLUDE 或移入可选包**（若保留 site-fanqie 技能，`vm_code.js` 必须保留） |

**Python 脚本内是否硬编码 token？** 已 grep `.dsh/skills/site-fanqie/scripts/*.py` 的 `msToken|sessionid|sid_guard|passport|a_bogus|secsdk|cookie|token|Authorization|verify_|webid` 及具体 ID/token 值：**未发现硬编码真实凭据或业务 ID**。`api_client.py` 只从 `load_auth()` 读 `fanqienovel_auth.json`（路径 `AUTH_FILE = <skill_dir>/fanqienovel_auth.json`，可用 `FANQIENOVEL_DATA_DIR` 覆盖），命中项均为变量名、请求头名、`need_sig`/`need_secsdk` 参数与文档字符串；`_AID="2503"` / `_APP_NAME="muye_novel"` 为公共常量非凭据。**结论：脚本代码本身可分发，风险全部集中在上述 JSON 数据文件。**

### 2.10 每项目运行时文件（RUNTIME，插件产生/维护，**不分发**）

```
<项目根>/novel/
├── bookinfo.md                       作品元信息（宪法/导入流程生成，发布用）
├── outline.md                        全书大纲 + 头部「## 创作约束」（审核红线/避毒指南/豁免项，batch-designer/novel-writer/continuity-validator 的权威约束源）
├── state.yaml                        全局状态（脚本独占写权限；主流程仅维护 batchProgress / pendingConstitution）
├── constitution/
│   ├── core.md                       核心世界观 + [不可变] 硬设定 + 机器校验正则（≤5000 字）
│   ├── style.md                      写作风格 + 文笔约束（≤200 字）
│   └── characters/[角色名].md        每角色一文件，含 ## 演化记录（chapter-summarizer 追加）
├── chapters/[NNN]/                   NNN = {0:D3} 三位补零，禁止 `1/`
│   ├── content.md                    正文（初稿由 novel-writer/agent-novel-writer 产出，回修由主会话最小改）
│   ├── design.md                     设计稿（create-design-template.ps1 生成骨架，batch-designer/主流程填充）
│   ├── summary.md                    三层摘要（连产或兜底补生成）
│   ├── context-bundle.md             上下文缓存（build-context-bundle.ps1 生成，Step E 用 delete_file 清理）
│   └── design-export.md              导出给外部 LLM 的写作上下文（design-export 流程生成）
├── state/
│   ├── memory-digest.md              长期记忆（逐章一句话剧情 + 专名词表 + 伏笔台账，sync-state 增量/ build-memory-digest 全量）
│   ├── timeline-archive.yaml         冷归档时间线
│   └── resolved-foreshadowing.yaml  已回收伏笔归档
├── source/                           拆书源书隔离区（写作阶段禁止读取）
│   ├── chapters/[NNN]/content.md
│   ├── analysis.json / analysis-summary.txt
│   ├── dissect-[batch].yaml
│   ├── report.md / rank-data.json
├── validation/import-report.md       导入全量校验报告
└── temp/partial-*.yaml               导入临时分片（合并后必须清理）
```

> 生成者/消费者链：`content.md → summary.md → state.yaml / memory-digest.md → 下一章 SubAgent 自行读取`；章节间信息**完全通过文件系统**传递，主流程不累积正文。

---

## 3. 端到端工作流顺序

> 用户的目标顺序：**constitution → disassemble/import → outline → design → write → batch → validate → design-export**。
> 实际是非线性 DAG：disassemble / import 是「跳过手动宪法」的**两个前置入口**；outline 被 design/batch 内嵌；batch 自带 Step O 扩纲；validate 可独立全量复核；design-export 是旁路输出。

```
① novel-constitution（宪法，起点）
   产出 novel/{bookinfo.md, outline.md 头部创作约束, constitution/{core,style,characters}}
   ├─ 模式 D 热榜选题 → fanqie-rank.py → fanqie-download.py → 可一键跳 ②
   └─ 模式 C 文档导入 → agent-constitution-extractor

② novel-disassemble（拆书仿写，替代①的 bootstrap）   或   novel-import（旧书稿接入，替代①）
   disassemble: Phase0 下载 → 1 split-chapters → 2 analyze-source → 3 agent-book-analyzer×N
                → 4 合并 report.md → 5 换皮设定 → 6 agent-skeleton-rebuilder（新宪法+大纲）
                → 7 analyze-source -Mode similarity 反抄袭 → 8 询问是否直接 novel-batch
   import:      split-chapters → agent-constitution-extractor×N → 合并确认 → bookinfo
                → agent-chapter-summarizer×N → build-state → compute-style
                → validate-chapter -Chapter All → 生成 outline.md 骨架
   ★ 两条路径最终都产出「宪法 + outline.md（含创作约束）+ state.yaml」，汇入 ③

③ novel-outline（章纲扩写，可选/提前）    或    novel-design all / all --extend（全书大纲）
   novel-outline → agent-chapter-outliner（结构化章纲，人在场高质扩纲）
   novel-design all → 主流程引导生成分段/全书大纲 + stage=outline 语义评审
   novel-batch Step O → agent-batch-outliner（无人值守自动补纲，≤20 章/批，串行）

④ novel-design N（单章设计稿）
   create-design-template.ps1 -Chapter N -Force（合规骨架）
   → 填充（读上一章 design.md + content.md 做差异化防雷同）
   → validate-design.ps1 → stage=design 语义校验（review.design: subagent/inline）
   ★ 铁律：必须先有 design.md 才能写正文

⑤ novel-write N（单章写作）
   Step1 一次性最小加载 → 2 直写 content.md → 3 后处理三件套
   → 4 综合 AI 校验（含 humanizer-zh + check-ai-flavor.ps1）
   → 6 内联摘要(summary.md) + validate-summary.ps1 → 7 角色演化
   → 8 sync-state.ps1（同时增量 memory-digest.md）
   → 9 chapter-full 深度校验（review.chapter）→ 10 compute-style（N≥10 建前10章基准）

⑥ novel-batch N-M（批量，覆盖⑤的单章流水线为「每章串行状态机」）
   Step O 自动补纲 → O1/O2 评审回修 → 主循环 for N:
     A0 build-context-bundle → A batch-designer(单章) → A1 validate-design → A2 validator(design)
     → B agent-novel-writer(连产 content+summary) → B2 fix-punctuation+reformat
     → C1 validate-chapter / C1.5 check-ai-flavor(+humanizer-zh) / C2 角色名 / C3 设定+创作约束
     → D1 摘要核验 → D2 validate-summary → D3 sync-state → D4 validator(chapter-full)
     → E 写回 batchProgress + delete_file 清理 context-bundle.md
   支持 --resume（从 batchProgress.nextChapter 断点续写）、--check N 检查点

⑦ novel-validate N | N,M,... | all（独立全量/多章校验 + 自动最小回修复验）
   后处理三件套 → 22 项检测 → continuity-validator(chapter-full) +（缺摘要时）chapter-summarizer
   ★ 与 ⑤/⑥ 的章内校验互补：批量无人值守后做全书复核

⑧ novel-design-export N（旁路输出）
   export-design-context.ps1 -Chapter N → design-export.md
   + 追加 Humanizer-zh 去AI味规则小节 → 供外部 LLM 写正文 → 回贴 content.md → /novel-validate N
```

**贯穿全局的铁律**（插件必须保留）：三位补零章节目录；字数以脚本裁决（config.yaml wordCount）；`pwsh -NoProfile -File`；先 design 后正文；每章必验证 + 同步状态；回修只改问题处禁止整章重写；正文禁止伏笔 ID / `[需更新宪法]` / 场景编号等元数据；中文双引号 `""`；去AI味均句 25~35 字、≤12 字短句占比 ≤25%；`config.yaml` 缺省回退；SubAgent 超时无限重试且主流程永不代写。

---

## 4. 子代理角色（9 个）与调度规则

| # | 角色（技能 / 母本） | 职责 | 调用方 | 传入参数 | 输出 |
|---|---|---|---|---|---|
| 1 | `agent-novel-writer` / `novel-writer.md` | 设计稿驱动写单章正文 + **连产** summary.md + 角色演化同步 | novel-batch Step B（novel-write 单章模式主流程直写，不调） | `chapter` / `characters` / `foreshadow_ids` | `content.md` + `summary.md` |
| 2 | `agent-continuity-validator` / `continuity-validator.md` | 深度连续性审计（5 stage），只报 CRITICAL/WARNING/PASS + 修复路由，不改文件 | novel-design（design/outline）、novel-write（chapter-full）、novel-batch（O1/A2/D4）、novel-validate | `stage` + (`chapter` 或 `rangeStart/rangeEnd`) | 审计报告 + `main-repair`/`manual-review` 路由 |
| 3 | `agent-book-analyzer` / `book-analyzer.md` | 拆书七维分析（≤5 章/批），只输出模式/手法/节奏/文笔风格 | novel-disassemble Phase 3 | `batch_id`/`chapter_range`/`analysis_data`/`is_first_batch`/`is_last_batch` | `novel/source/dissect-[batch].yaml` |
| 4 | `agent-chapter-outliner` / `chapter-outliner.md` | 结构化章纲扩写（人在场高质），格式自适应 | novel-outline | `startChapter`/`endChapter`/`totalTarget`/`mode` | 追加 `outline.md` |
| 5 | `agent-batch-outliner` / `batch-outliner.md` | 无人值守一段式补纲（≤20 章/批） | novel-batch Step O | `startChapter`/`endChapter`/`totalTarget` | 追加 `outline.md` |
| 6 | `agent-batch-designer` / `batch-designer.md` | 批量流程自动生成**单章** design.md（收到范围只处理第一章） | novel-batch Step A | `chapter`（🔴 单个章节号） | `design.md` |
| 7 | `agent-chapter-summarizer` / `chapter-summarizer.md` | 单章三层摘要 + 角色演化追加 `## 演化记录` | novel-import Step 5、novel-validate 缺摘要时、novel-batch 兜底 | `chapter` / `characters` | `summary.md` |
| 8 | `agent-constitution-extractor` / `constitution-extractor.md` | 分片提取设定（≤5 章/批），`[不可变]` 判定 | novel-import Step 3、novel-constitution 模式 C | `batch_id`/`chapter_range`/`setting_doc` | `novel/temp/partial-[N].yaml` |
| 9 | `agent-skeleton-rebuilder` / `skeleton-rebuilder.md` | 拆书报告 + 换皮设定 → 全新宪法 + outline.md（严禁复制源书内容） | novel-disassemble Phase 6 | `report_path`/`user_settings`/`template_dir` | `constitution/` + `outline.md` + 初始 state.yaml |

**调度白名单（`.codebuddy/rules/subagent-prompt-whitelist.mdc`，`alwaysApply: true`）**：
- 主流程「只当调度员，传参数、收结果，不当导演」：prompt **只传参数 + 一句「请严格按照你的 `<context_loading>` 规则自行加载所有必要上下文`」**。
- 禁止在 prompt 中出现：文件路径列表、「当前上下文/背景信息/参考资料」段、剧情方向提示、扩纲/写作要求具体描述 —— 无论用什么标题措辞。
- 每个 `agent-*` 技能自带完整 `<context_loading>`，会自行加载所需文件；主流程手写清单必然不完整。
- **主会话是唯一裁决者**：子会话 PASS 直接放行；报 CRITICAL/WARNING 或主会话自行发现问题/子会话矛盾时，必须对照事实文件独立核验；评判优先序 **事实文件（core/outline/state/正文）> 子会话主观判断 > 主会话记忆**；只信「证据」不信「结论标签」；误报驳回并记录理由，漏报补入。
- 校验后的回修由**主会话**按验证报告做最小修改，不回调 SubAgent 反复回修。

---

## 5. 路径假设（插件必须保留或改写）★ 关键

### 5.1 `$PSScriptRoot` 项目根推算（所有 `.ps1` 共用）

```powershell
if ([string]::IsNullOrEmpty($PSScriptRoot)) { $projectRoot = (Get-Location).Path }
else { $projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent }  # scripts/ 往上两级
$novelDir = Join-Path $projectRoot "novel"
```

即**脚本假定自己位于 `<项目根>/.dsh/scripts/`（或 `.codebuddy/scripts/`）**，往上两级得到 `<项目根>`，项目根下必须有 `novel/` 且 `novel/constitution/` 存在。三级回退：① `$PSScriptRoot` 推算 → ② `Get-Location/novel` → ③ **兄弟目录扫描**（`Get-ChildItem (Split-Path $codebuddyDir -Parent) -Directory`，找任意兄弟目录下含 `novel/constitution` 的项目，用于「根目录 `.dsh` 被多个项目共享」场景，如 `d:\temp\novel` 下有 `new/`、`1999/`）。`check-ai-flavor.ps1` 与 `build-memory-digest.ps1` 另提供 `-ProjectRoot` 显式参数（共享多项目时必须传，否则兄弟目录搜索可能命中错误项目）。
- `validate-outline.ps1` 用等价写法 `(Resolve-Path (Join-Path $scriptDir '..\..')).Path`。
- **含义**：若插件把脚本放进 bundle 内部目录（如 `plugin/assets/scripts/`），`$PSScriptRoot` 上两级不再是小说项目根，所有路径推算失效。**插件必须把脚本物化（materialize）到目标项目的 `.dsh/scripts/` 下，或改写全部 `$PSScriptRoot` 推算逻辑并注入显式 `-ProjectRoot`。**

### 5.2 配置 / 模板 / 库 / 姊妹脚本的相对定位

| 依赖 | 代码写法 | 解析出的位置（相对项目根） |
|---|---|---|
| 配置 | `Join-Path (Split-Path $PSScriptRoot -Parent) "config.yaml"` | `.dsh/config.yaml`（`validate-chapter.ps1` / `create-design-template.ps1` / `export-design-context.ps1`） |
| 模板 | `$codebuddyDir = Split-Path $PSScriptRoot -Parent; Join-Path $codebuddyDir "templates" "chapter-design.md"` | `.dsh/templates/chapter-design.md`（`build-context-bundle.ps1`） |
| memory 配置 | `Join-Path $codebuddyDir "config.yaml"` | `.dsh/config.yaml`（`build-context-bundle.ps1` 读 `memory` 段） |
| 公共库 | `. (Join-Path $PSScriptRoot "lib/paragraph-metrics.ps1")` | `.dsh/scripts/lib/paragraph-metrics.ps1`（点源，3 个脚本依赖） |
| 姊妹脚本 | `Join-Path $PSScriptRoot "build-memory-digest.ps1"` / `"validate-design.ps1"` | 同 `scripts/` 目录（`build-context-bundle` / `build-state` / `sync-state` / `create-design-template` 相互调用） |
| 字表 | `Path(__file__).parent.parent / 'charset.json'`（fanqie-download.py）、`SCRIPT_DIR.parent / 'charset.json'`（fanqie-rank.py） | `.dsh/charset.json`（**必须在 scripts/ 的上一级**） |

### 5.3 技能正文硬编码的 `.dsh/...` 相对路径 ★ lead 重点

已 grep 确认：所有 21 个 SKILL.md 中的脚本/模板/配置引用均为**相对项目根的字符串**，例如：
- `pwsh -NoProfile -File .dsh/scripts/validate-chapter.ps1 -Chapter N`
- `python3 .dsh/scripts/fanqie-rank.py ...`
- `读取模板 .dsh/templates/constitution/core.md`、`.dsh/templates/summary.md`、`.dsh/templates/chapter-design.md`
- `.dsh/config.yaml` 的 `wordCount` / `memory` 段
- `.dsh/skills/Humanizer-zh/SKILL.md`（6 处技能引用）
- `.dsh/rules/subagent-prompt-whitelist.mdc`（`novel-batch` 引用 2 处，**该文件实际缺失**）
- `agents/novel-writer.md` 的【去AI味规则】段（2 处技能引用，**`.dsh` 无 agents/ 目录**）

> **打包结论（与 lead 一致）**：插件必须在**每个目标小说项目根目录物化一份 `.dsh/` 工作副本**（scripts / templates / config.yaml / charset.json / skills / rules），使这些既有技能**原样可用**；否则必须系统性改写全部技能正文里的 `.dsh/...` 路径为插件注册后的实际路径（工作量大且易漏）。物化方案也天然满足 §5.1 的 `$PSScriptRoot` 假设与 §5.2 的相对定位。

### 5.4 外部集成技能自身的路径假设

- `site-fanqie`：`api_client.py` 以 `_SKILL_DIR = dirname(dirname(__file__))`（即 `scripts/` 上一级 = 技能根）定位 `fanqienovel_auth.json`，可用环境变量 `FANQIENOVEL_DATA_DIR` 覆盖；`fanqie_encrypt.js` 通过 `../references/vm_code.js` 相对引用 VM 代码；SKILL.md 明确「**新增脚本必须平铺在 `scripts/` 下，不要建子目录**」；CLI 形如 `py {skill_dir}/scripts/*.py`。
- `novel-downloader`：CLI 形如 `py scripts/novel_download.py ... --out d:/yousen/`（相对技能根）。
- 两者都不依赖 `.dsh/` 布局，适合**独立可选包**。

### 5.5 其他执行假设

- 统一 `pwsh -NoProfile -File <相对或绝对路径>/xxx.ps1 -参数 值`，禁止 `-Command`/`-c`；Mandatory 参数显式传入；退出码 0=成功、非 0 读 stderr；stdout 含结构化进度/PASS/FAIL 供解析。
- 章节目录 `{0:D3}` 三位补零；`novel/source/` 源书隔离，写作阶段所有 Agent/脚本禁止读取。
- `novel-batch` Step E 清理 `context-bundle.md` **必须用 `delete_file` 工具**，禁止 PowerShell 内联删除（`-Command` 会二次解析 `$变量`）。
- 根目录 `novel/` 当前为空；AGENTS.md 声明实际项目在 `archive/*` 与 `new/` 子目录，各自有独立 `novel/` —— 插件需先确认目标项目目录。

---

## 6. 迁移缺口 / 悬空引用（给插件构建者的风险清单）

| # | 问题 | 证据 | 建议 |
|---|---|---|---|
| 1 | **`.dsh/` 没有 `rules/` 目录**，但 `novel-batch/SKILL.md` 两处引用 `.dsh/rules/subagent-prompt-whitelist.mdc`（并称其 `alwaysApply: true` 常驻上下文） | glob `novel/.dsh/rules/**` 无结果；grep 命中 2 处 | 打包时把 `.codebuddy/rules/*.mdc` 一并物化到 `.dsh/rules/`，或在插件层把规则注入 systemPrompt/常驻上下文（与 task-2 的 API 结论对齐） |
| 2 | **`.dsh/config.yaml` 缺 `review:` 段**（只有 wordCount + memory），而命令/技能多处读 `review.design/outline/chapter`（缺省 `subagent`、值 `inline` 时主会话按 `<inline_execution>` 执行、子代理不可用降级 inline） | `.codebuddy/config.yaml` 32 行含 `review`；`.dsh/config.yaml` 20 行无 | 以 `.codebuddy/config.yaml` 为母本补齐 `review` 段，否则插件运行时深度校验的 subagent/inline 分支行为不确定 |
| 3 | **`<inline_execution>` 段只存在于 `.codebuddy/agents/continuity-validator.md`（346–361 行）**，`.dsh/skills/agent-continuity-validator/SKILL.md` 无该段（grep `.dsh/skills` 无命中） | 已验证 | 若保留 `review.*=inline` 能力，须把该段并入 `agent-continuity-validator/SKILL.md`，否则 inline 模式无清单可执行 |
| 4 | `.dsh` 技能仍引用 `agents/novel-writer.md` 的【去AI味规则】段（2 处），但 `.dsh/` 无 `agents/` 目录 | `novel-write/SKILL.md:164`、`novel-batch/SKILL.md:648` | 把该段内联进技能，或随插件保留一份 `agents/` 文档并改路径；`Humanizer-zh/SKILL.md` 已在 `.dsh` 内可用 |
| 5 | `.dsh/skills/novel-write/SKILL.md` 的 token 预算表被简化为「标准（默认）15-25k / 1 SubAgent」，而母本命令按 `review.chapter` 分 `subagent`/`inline` 两种预算 | 已读两者 | 与 #2/#3 一并统一 |
| 6 | 写作攻略 / `.gitignore` / `commands/` / `agents/` / `rules/` 只存在于 `.codebuddy/` | 已比对 | 按需随包保留（见 §2.4/§2.8），不要遗漏母本逻辑 |
| 7 | 迁移残留、`__pycache__`、重复嵌套副本、0 字节 `invoke-subagent.ps1` | 已清点 | EXCLUDE（§2.9） |
| 8 | `.codebuddy/.gitignore` 内容异常（含 `=====` 行） | 已读 | 忽略/清理，不随包 |

---

## 7. 打包建议（可直接作为构建清单）

**BUNDLE（随插件分发，物化到目标项目 `.dsh/`）**
- `.dsh/skills/` 全部 **21** 个 SKILL.md（9 工作流 + 9 agent-* + Humanizer-zh + site-fanqie + novel-downloader，后两者见 OPTIONAL）
- `.dsh/scripts/` 全部 **21** 个脚本 + `requirements.txt`（**不含** `fanqie-auth.json`）
- `.dsh/templates/` 全部 **7** 个模板（含 `constitution/` 3 个）
- `.dsh/config.yaml`（**用 `.codebuddy/config.yaml` 补齐 `review:` 段**）
- `.dsh/charset.json`
- `.dsh/rules/`（**新建**，从 `.codebuddy/rules/*.mdc` 拷入 2 个规则）
- `AGENTS.md`（入口说明 / 注入 systemPrompt）
- `.codebuddy/commands/*.md`（9）、`.codebuddy/agents/*.md`（9）：作为母本/对照资料随包（尤其 `continuity-validator.md` 的 `<inline_execution>`）
- `Humanizer-zh/` 的 README / LICENSE
- `编辑星河网文写作攻略.md`（可选参考）

**RUNTIME（插件在目标项目生成，绝不分发）**：§2.10 全部 `novel/` 树。

**EXCLUDE（公开开源插件禁止）**：§2.9 全部 —— `fanqienovel_auth.json`、`fanqie-auth.json`、`publish_result.json`、`package-lock.json`、所有 `__pycache__/*.pyc`、`skills/site-fanqienovel/`、`.codebuddy/skills/site-fanqie/novel-downloader/` 旧副本、1.8 MB `main.e63907e3.js` 与 1.2 MB `writer_backend_api_report.json`（若保留 site-fanqie，须保留 `vm_code.js`）。凭据类改发**空值模板**。

**OPTIONAL（SEPARATE 可选包）**：`site-fanqie`（作者后台/榜单/帮助中心，需 npm 依赖 + 用户自填 `fanqienovel_auth.json`）、`novel-downloader`（TXT 下载）。二者与主写作流程无硬依赖，拆包可显著缩小主插件体积并规避凭据/逆向大文件风险。

**顺序**：先物化 `.dsh/` 工作副本（满足 §5.1–§5.3 全部相对路径假设）→ 注册 21 个技能 → 注入 2 条常驻规则（或用 rules 文件）→ 确认 `pwsh -NoProfile -File` 可用 → 目标项目 `novel/` 由流程自举（constitution/import 首次创建）。

---

## 8. 跨评审记录（cross-review duty）

- 已在写作过程中接收并落实 lead 的两次 CRITICAL 打包提示：凭据/发布结果/pyc/lockfile/逆向大文件全部标 EXCLUDE 并核实脚本无硬编码 token；site-fanqie / novel-downloader 标 OPTIONAL；`.dsh/rules/` 缺失须从 `.codebuddy/rules/` 补发；§5.3 明确「必须物化 `.dsh/` 工作副本或改写全部路径」。两次提示所述文件均已逐项实读核对，无需改动本清单。
- 完稿后 `api-research.md`（task-2）与 `publishing-research.md`（task-3）已落地，已**全文交叉复核**，修正意见已发 lead，要点存档如下：

**对 `api-research.md` 的修正**

1. **（最重要）`resourceBase.kind:'directory'` 不足以让既有技能跑通**：该文 §1.1/§4 建议把 21 个 SKILL.md 放进 bundle 的 `skills/<name>/` 并用 `resourceBase` 指向其目录。但 `resourceBase` 只能让技能按「相对技能目录」取资源；现有 21 个技能正文里的路径全是**相对项目根**的字符串（`.dsh/scripts/...`、`.dsh/templates/...`、`.dsh/config.yaml`、`.dsh/skills/Humanizer-zh/SKILL.md`、`.dsh/rules/subagent-prompt-whitelist.mdc`），且 19 个 `.ps1` 用 `$PSScriptRoot` 上两级推项目根、要求脚本位于 `<项目根>/.dsh/scripts/`（本清单 §5.1–§5.3）。纯 bundle 内布局会让这些路径全部失效。**必须在目标小说项目根目录物化一份 `.dsh/` 工作副本，或系统性改写全部路径。** 另：21 个脚本 + 7 个模板 + config + charset 是**跨技能共享资产**，不能按该文 §4 目录示意那样塞进各技能自己的子目录。
2. **分类澄清**：该文 §6 把「project-runtime `.codebuddy`/`.dsh` config files」笼统称需 Host half 注册。准确区分是：`.dsh/` 工作副本资产（config.yaml / charset.json / scripts / templates / rules / 21 SKILL.md / Humanizer-zh）是 **BUNDLE 共享逻辑，必须随包分发**；只有 `novel/` 树（constitution/、outline.md、state.yaml、chapters/、source/、state/、validation/、temp/）是**每项目运行时状态**。混淆二者会漏发配置与脚本。
3. **数值精度**：该文 §4「21 skills, 20 scripts」沿用 AGENTS.md 概数。精确为 **21 个脚本**（18 个 `scripts/*.ps1` + 1 个 `scripts/lib/paragraph-metrics.ps1` + 2 个 `.py`）；AGENTS.md 的 20 只是不含 0 字节空桩 `invoke-subagent.ps1`。供投稿描述用的准确数：9 命令母本 / 21 DSH 技能（9 工作流 + 9 agent-* + 3 支撑）/ 9 角色定义母本 / 7 模板 / 2 规则 / 21 脚本 / 1 charset / 2 config。

**对 `publishing-research.md` 的修正**

4. **描述措辞**：§5 YAML 草稿的 "bundled commands" 不严谨 —— AGENTS.md 明确「DSH 没有自定义斜杠命令」；插件唯一新增命令是 `/novel`（api-research §1.3），9 个 `novel-*.md` 是工作流**技能**定义/旧命令母本。建议改为「21 skills + shared scripts/templates/config」以符合 CI「描述与代码逐条相符」门槛。另 **Humanizer-zh 必须进主包**（6 个技能引用 `.dsh/skills/Humanizer-zh/SKILL.md`），只有 `site-fanqie` / `novel-downloader` 是可选；该文 §1.2 提到用户的 `github-yousen/skills` 仓库已含这三个技能，恰好佐证「两个外部站点技能可拆包、避免重复」。
5. **两文互相矛盾（需 lead 裁决）**：api-research §5.3 称 CI 扫描 `package.json` 只认**仓库根**或 `packages/` · `plugins/` · `apps/` 子包；publishing-research §1.4 注则称「或直接读 `url` 指向目录内的 `package.json`」。两者对「顶层 `novel-mode-plugin/` 子目录能否被扫描」结论不一致，而 A′/B′ monorepo 方案正是顶层子目录。建议投稿前核对 contributing.md 的 CI 源码，或改用 `packages/novel-mode-plugin/` 布局使两种解读都成立；并注意 `github-yousen/novel` 默认分支是 **`master`**（该文 §1.4 已提醒，URL 中不能写 `main`）。
6. **peerDependencies 是有条件的**：publishing-research §2.4 gate 6 / §6 平铺直叙「`@deepseek-ai/*` 用 peerDependencies」；api-research §5.3 的 nuance 正确 —— 通过 `ctx.*` / `inject` 取服务的插件**无需任何依赖**，不要为误读门槛添加 peerDependencies（反会触发 ERESOLVE）。构建时按后者执行。

- 建议 lead 在最终架构定稿前复核：本清单 §5.3/§6 的「物化 `.dsh/` 工作副本」与 DSH 技能注册 API（`ctx.skills.register`）、systemPrompt.section、命令注册方式是否相容；若以 bundle 内资源 + 运行时解包分发，需确认解包目标即项目根 `.dsh/`。

---

*（本文件为 task-1 唯一写入目标；其余路径均为只读审计。）*
