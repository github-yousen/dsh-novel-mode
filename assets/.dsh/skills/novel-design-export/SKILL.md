---
name: novel-design-export
description: 把某一章的写作上下文导出成单个 md 文件，供外部 LLM 写正文时使用。输入为章节号 N。
whenToUse: 把某一章的写作上下文导出成单个 md 文件，供外部 LLM 写正文时使用。输入为章节号 N。
---

# novel-design-export

## 用户输入

```text
$ARGUMENTS
```

用户输入为章节号 N（如 `1`、`15`、`42`）。

## 执行步骤

### 1. 执行导出脚本

```powershell
pwsh -NoProfile -File .dsh/scripts/export-design-context.ps1 -Chapter N
```

脚本将生成 `novel/chapters/[NNN]/design-export.md`，包含：
- 宪法核心 (core.md + style.md)
- 近章摘要 (N-1 ~ N-3)
- 上一章正文 (content.md)
- 出场角色设定（仅本章 design.md 中出场的角色，非全量）
- 本章设计稿 (design.md)

### 2. 附加去AI味规则

🔴 **将 humanizer-zh 技能规则并入导出文件**：读取 `.dsh/skills/Humanizer-zh/SKILL.md`（如文件存在），将其中「核心规则速查 / 内容模式 / 语言和语法模式 / 快速检查清单 / 质量评分」要点以「## 去AI味规则（外部 LLM 写作时必须遵守）」小节**追加到 `novel/chapters/[NNN]/design-export.md` 末尾**，确保外部 LLM 写作时自动按该规则执行；文件不存在则跳过并提示用户。

### 3. 提示下一步

```
✓ 写作上下文已导出到 novel/chapters/[NNN]/design-export.md（含去AI味规则）

使用流程：
1. 打开 design-export.md，复制全部内容
2. 粘贴到外部 LLM —— 文件内已内置完整写作任务指令 + 去AI味规则，LLM 会自动按设计稿写第N章正文（字数范围见 `.dsh/config.yaml` 的 `wordCount` 段，缺省 2000-3500字），无需再描述需求
3. 将 LLM 输出复制到 novel/chapters/[NNN]/content.md
4. 执行校验：
   /novel-validate N
```

