<#
.SYNOPSIS
    快速创建章节设计稿模板（novel/chapters/[NNN]/design.md）

.DESCRIPTION
    解决痛点：Agent 手工写 design.md 时，格式细节不符 validate-design.ps1 的解析规则
    （尤其"伏笔操作"段的回收/新埋必须使用独立行格式），导致被校验脚本拦截返工。

    本脚本生成一个格式 100% 合规的骨架模板：
    - 所有必要段落/子段落齐全（validate-design.ps1 检测0）
    - 场景表格 N 行（默认4：搭戏/唱戏/高潮/结尾），占比合计 100%（检测1）
    - 伏笔操作段使用脚本可解析的独立行格式 "- **回收**:" + 换行缩进（检测3）
    - 从 state.yaml 自动预填时间线/角色位置/活跃伏笔/世界资产
    - 从 outline.md 提取第 N 章梗概预填"主线推进"
    Agent 只需替换 <占位> 内容，无需关心格式细节。

.PARAMETER Chapter
    章节号（数字）

.PARAMETER Force
    已存在 design.md 时强制覆盖（默认：已存在且非空则跳过并打印提示）

.PARAMETER Scenes
    场景数（默认 4，范围 3-5）

.PARAMETER NoValidate
    生成后不自动运行 validate-design.ps1（默认生成后自动校验一次并打印结果）

.EXAMPLE
    pwsh -NoProfile -File .dsh/scripts/create-design-template.ps1 -Chapter 1
    pwsh -NoProfile -File .dsh/scripts/create-design-template.ps1 -Chapter 15 -Force -Scenes 5
#>

param(
    [Parameter(Mandatory = $true)]
    [int]$Chapter,

    [switch]$Force,

    [ValidateRange(3, 5)]
    [int]$Scenes = 4,

    [switch]$NoValidate
)

$ErrorActionPreference = "Stop"

# ---------- 定位 novel 目录（与 validate-design.ps1 同一套逻辑） ----------
if ([string]::IsNullOrEmpty($PSScriptRoot)) {
    $projectRoot = (Get-Location).Path
} else {
    $projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}
$novelDir = Join-Path $projectRoot "novel"
if (-not (Test-Path (Join-Path $novelDir "constitution"))) {
    $cwdNovel = Join-Path (Get-Location).Path "novel"
    if (Test-Path (Join-Path $cwdNovel "constitution")) {
        $projectRoot = (Get-Location).Path
        $novelDir = $cwdNovel
    } else {
        $codebuddyDir = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { $null }
        if ($codebuddyDir -and (Split-Path $codebuddyDir -Leaf) -eq "scripts") {
            $codebuddyDir = Split-Path $codebuddyDir -Parent
        }
        if ($codebuddyDir) {
            $siblingDirs = Get-ChildItem (Split-Path $codebuddyDir -Parent) -Directory -ErrorAction SilentlyContinue
            foreach ($dir in $siblingDirs) {
                $candidateNovel = Join-Path $dir.FullName "novel"
                if (Test-Path (Join-Path $candidateNovel "constitution")) {
                    $projectRoot = $dir.FullName
                    $novelDir = $candidateNovel
                    break
                }
            }
        }
    }
}

# ---------- 目标文件 ----------
$chapDir = Join-Path $novelDir "chapters" ("{0:D3}" -f $Chapter)
$designPath = Join-Path $chapDir "design.md"

if (Test-Path $designPath) {
    $size = (Get-Item $designPath).Length
    if ($size -gt 0 -and -not $Force) {
        Write-Host "[SKIP] design.md 已存在且非空（$size 字节）。如确认覆盖请加 -Force。" -ForegroundColor Yellow
        exit 0
    }
}

# ---------- 字数配置（从母本 .dsh/config.yaml 读取，缺省回退内置默认值） ----------
$wordMin = 2000
$wordTarget = 2500
$wordMax = 3500
$configPath = Join-Path (Split-Path $PSScriptRoot -Parent) "config.yaml"
if (Test-Path $configPath) {
    $configText = Get-Content $configPath -Raw -Encoding UTF8
    if ($configText -match '(?m)^\s*min:\s*(\d+)') { $wordMin = [int]$Matches[1] }
    if ($configText -match '(?m)^\s*target:\s*(\d+)') { $wordTarget = [int]$Matches[1] }
    if ($configText -match '(?m)^\s*max:\s*(\d+)') { $wordMax = [int]$Matches[1] }
}

# ---------- 解析 state.yaml（正则，不依赖 YAML 模块） ----------
$timeline = ""
$charEntries = @()   # 角色位置
$fsEntries = @()     # 活跃伏笔
$assetEntries = @()  # 世界资产

$statePath = Join-Path $novelDir "state.yaml"
if (Test-Path $statePath) {
    $stateText = Get-Content $statePath -Raw -Encoding UTF8

    # 时间线
    $m = [regex]::Match($stateText, '(?m)^\s*current:\s*(.*)$')
    if ($m.Success -and $m.Groups[1].Value.Trim()) { $timeline = $m.Groups[1].Value.Trim() }

    # 角色 active 段
    # 🔴 前瞻只匹配顶格字段（如 foreshadowing:），不能用 \s*\w+:
    #    否则角色子字段 status:/location: 会被误当成段边界，导致段被提前截断
    $sec = [regex]::Match($stateText, '(?s)characters:\s*\n\s*active:\s*\n(.*?)(?=\n[^\s#:][^:]*:|\z)')
    if ($sec.Success) {
        $cur = $null
        foreach ($ln in ($sec.Groups[1].Value -split '\r?\n')) {
            if ($ln -match '^\s{3,}([^\s#:][^:]*):\s*$') {
                if ($cur) { $charEntries += $cur }
                $cur = @{ name = $Matches[1].Trim(); location = ""; status = "" }
            }
            elseif ($cur -and $ln -match '^\s{4,}(location|status):\s*(.*)$') {
                $cur[$Matches[1]] = $Matches[2].Trim()
            }
        }
        if ($cur) { $charEntries += $cur }
    }

    # 活跃伏笔段
    $sec = [regex]::Match($stateText, '(?s)foreshadowing:\s*\n\s*active:\s*\n(.*?)(?=\n\s+resolved_ref:|\n[^\s#:][^:]*:|\z)')
    if ($sec.Success) {
        foreach ($mi in [regex]::Matches($sec.Groups[1].Value, '(?m)^\s*-\s+id:\s*(F-\d+(?:-\d+)?)')) {
            $tail = $sec.Groups[1].Value.Substring($mi.Index)
            $dm = [regex]::Match($tail, '(?m)^\s+description:\s*(.*)$')
            $desc = if ($dm.Success) { $dm.Groups[1].Value.Trim() } else { "" }
            $fsEntries += @{ id = $mi.Groups[1].Value; desc = $desc }
        }
    }

    # 世界资产段
    $sec = [regex]::Match($stateText, '(?s)worldAssets:\s*\n\s*active:\s*\n(.*?)(?=\n[^\s#:][^:]*:|\z)')
    if ($sec.Success) {
        foreach ($ki in [regex]::Matches($sec.Groups[1].Value, '(?m)^\s*-\s+key:\s*(.*)$')) {
            $tail = $sec.Groups[1].Value.Substring($ki.Index)
            $vm = [regex]::Match($tail, '(?m)^\s+value:\s*(.*)$')
            $val = if ($vm.Success) { $vm.Groups[1].Value.Trim() } else { "" }
            $assetEntries += @{ key = $ki.Groups[1].Value.Trim(); value = $val }
        }
    }
}
if (-not $timeline) { $timeline = "[待填：state.yaml timeline.current 为空]" }

# ---------- 从 outline.md 提取第 N 章梗概 ----------
$outlineBrief = ""
$outlinePath = Join-Path $novelDir "outline.md"
if (Test-Path $outlinePath) {
    $outlineText = Get-Content $outlinePath -Raw -Encoding UTF8
    # 依次尝试：表格行 | N | 梗概 |、**第N章 标题** 或 ### 第N章 标题
    # 🔴 必须用 ${Chapter}：否则 PowerShell 会把 "第$Chapter章" 中的汉字"章"并入变量名
    #    （变量不存在 → 展开为空 → 正则退化成 "第.*"，误匹配到卷标题）
    $m = [regex]::Match($outlineText, "(?m)^\s*\|?\s*${Chapter}\s*\|[^|]*\|([^|]*)\|")
    if (-not $m.Success) {
        $m = [regex]::Match($outlineText, "(?m)^\s*(?:#{1,6}|\*{2})\s*第${Chapter}章[^\r\n]*")
    }
    if ($m.Success) {
        if ($m.Groups[1].Success) {
            $outlineBrief = $m.Groups[1].Value.Trim()
        } else {
            $outlineBrief = ($m.Value -replace '^\s*[#*]+\s*', '' -replace '\s*[*#]+$', '').Trim()
        }
    }
}
if (-not $outlineBrief) {
    $outlineBrief = "<!-- 未能自动定位到 outline.md 第${Chapter}章梗概，请手工补充 -->"
}

# ---------- 组装预填片段 ----------
# 角色位置
$charp = ""
if ($charEntries.Count -gt 0) {
    foreach ($c in $charEntries) {
        $loc = if ($c.location) { $c.location } else { "[位置]" }
        $st  = if ($c.status)  { $c.status }  else { "[状态]" }
        $charp += "  - $($c.name): $loc / $st`n"
    }
} else {
    $charp = "  - [角色名]: [位置] / [状态]`n"
}

# 待回收伏笔（上文状态）
$recvCand = ""
if ($fsEntries.Count -gt 0) {
    foreach ($f in $fsEntries) {
        $recvCand += "  - $($f.id) $($f.desc)`n"
    }
} else {
    $recvCand = "  - 无（当前 state.yaml 无活跃伏笔）`n"
}

# 伏笔操作-回收区（独立行格式，validate-design.ps1 可正确解析）
$recvPlan = ""
if ($fsEntries.Count -gt 0) {
    foreach ($f in $fsEntries) {
        $recvPlan += "  - $($f.id) $($f.desc) → [回收方式，Agent 按需保留/删除]`n"
    }
} else {
    $recvPlan = "  - 无`n"
}

# 关键资产快照
$assets = ""
if ($assetEntries.Count -gt 0) {
    foreach ($a in $assetEntries) {
        $assets += "- $($a.key): $($a.value)（来源: state.yaml）`n"
    }
} else {
    $assets = "- [资产key]: [当前值]（来源: state.yaml）`n- [资产key]: [当前值]（来源: state.yaml）`n"
}

# 场景占比/类型
switch ($Scenes) {
    3 { $pcts = @(20, 40, 40);        $types = @('搭戏', '唱戏', '高潮') }
    5 { $pcts = @(15, 25, 30, 20, 10); $types = @('搭戏', '唱戏', '高潮', '唱戏', '结尾') }
    default { $pcts = @(20, 30, 30, 20); $types = @('搭戏', '唱戏', '高潮', '结尾') }
}

# 场景表格行
$sceneRows = ""
for ($i = 1; $i -le $Scenes; $i++) {
    $sceneRows += "| $i. [场景名] | $($pcts[$i - 1])% | ~待填~ | [情绪变化] | $($types[$i - 1]) | [角色反应] |`n"
}

# 场景详细规划
$details = ""
for ($i = 1; $i -le $Scenes; $i++) {
    $details += "**场景$i：[场景名]（$($types[$i - 1])，建议占比$($pcts[$i - 1])%）**`n"
    $details += "- 切入方式：<!-- 如何开始这个场景，直接进入事件 -->`n"
    $details += "- 目的：<!-- 这个场景推动了什么 -->`n"
    $details += "- 障碍：<!-- 阻力/冲突设置 -->`n"
    $details += "- 结果：<!-- 解决冲突或留悬念 -->`n"
    $details += "- 反应节拍：<!-- 场景结束时角色的情绪走向/状态变化（🔴 只是大的方向，禁止台词原句与内心独白式描述） -->`n"
    $details += "`n"
}

# ---------- 模板骨架（格式与 validate-design.ps1 的解析规则严格对齐） ----------
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"

$template = @'
# 第{CHAPTER}章 设计稿

**章节标题**: <!-- 选填 -->
**创建时间**: {TIMESTAMP}

---

## 上文状态

> 由 create-design-template.ps1 从 state.yaml 自动预填，Agent 核对后按需调整

- **时间线**: {TIMELINE}
- **角色位置**:
{CHARP}- **待回收伏笔**:
{RECV_CAND}
---

## 本章目标

### 主线推进
<!-- 从 outline.md 第{CHAPTER}章梗概行提取 -->
{OUTLINE}

### 伏笔操作
- **回收**:
{RECV_PLAN}- **新埋**:
  - F-{CHAPTER}-1 [新伏笔描述] → [计划回收章节]
  - F-{CHAPTER}-2 [新伏笔描述] → [计划回收章节]

### 角色发展
- [角色名]：[本章发展（关系/状态/性格变化，逐角色列出）]

---

## 场景规划

| 场景 | 篇幅占比 | 出场角色 | 情绪走向 | 场景类型 | 反应节拍 |
|------|---------|---------|---------|---------|---------|
{SCENE_ROWS}| **合计** | **100%** | | | | |

> 提示：场景表格使用篇幅占比而非具体字数；正文最终硬约束 {WORDRANGE} 字（来自 .dsh/config.yaml）。

### 开篇承接锚点

> 🔴 **第 1 章专用**（N=1 时必填）：
> - **开篇钩子类型**：<!-- 黄金开篇五选一：开局即绝境/悬念驱动/人设即钩子/金手指前置/新世界规则先亮 -->
> - **300字内出事点**：<!-- 主角绝境+核心冲突+题材卖点，如何在前300字拍脸 -->
> - **翻页钩子**：<!-- 第一章结尾埋什么钩子逼读者点下一章 -->
> - **三章联动**：<!-- 第二、三章将兑现什么（冲突升级/金手指落地/首个爽点），确保前三章一气呵成 -->

> 通用字段（N>1）：
- 上一章结尾动作锚点：<!-- 上一章结尾的动作状态 -->
- 上一章情绪锚点：<!-- 上一章结尾的情绪基调 -->
- 本章开场第一句建议：<!-- 给 writer 的第一句执行锚点 -->

### 写作硬约束（本章）

- 必须兑现：[从 outline.md 第{CHAPTER}章梗概提炼的关键承诺1]
- 必须兑现：[关键承诺2]
- 禁止偏离：[禁止新增主线事件]
- 禁止偏离：[禁止角色越权知情 / 禁写未定义设定]
- 字数策略：<!-- 例如：本章偏紧凑，优先压缩环境描写 -->

### 角色写作提示（仅本章出场角色）

- [角色名]：说话风格=[短句/冷硬/调侃]；行为约束=[不可暴露系统/不可主动示弱]

### 伏笔必引细节（仅回收项）

> 本章无回收时，可直接写：**本章无回收**（脚本自动跳过后续检查）

- [F-N-X]：埋设章=[第X章]；必引关键词=[原词1/原词2]

### 关键资产快照（本章会用到的）

{ASSETS}---

### 场景详细规划

{DETAILS}---
## 设定增量

<!-- 本章引入的新设定，如有需要写入宪法的标注 [需更新宪法] -->
<!-- 示例: - [需更新宪法] 苏晚的时间减速能力：3秒内有效 -->
'@

$template = $template.Replace("{CHAPTER}", "$Chapter")
$template = $template.Replace("{TIMESTAMP}", $timestamp)
$template = $template.Replace("{TIMELINE}", $timeline)
$template = $template.Replace("{CHARP}", $charp)
$template = $template.Replace("{RECV_CAND}", $recvCand)
$template = $template.Replace("{OUTLINE}", $outlineBrief)
$template = $template.Replace("{RECV_PLAN}", $recvPlan)
$template = $template.Replace("{ASSETS}", $assets)
$template = $template.Replace("{SCENE_ROWS}", $sceneRows)
$template = $template.Replace("{DETAILS}", $details)
$template = $template.Replace("{WORDRANGE}", "${wordMin}-${wordMax}")

# ---------- 写入 ----------
New-Item -ItemType Directory -Path $chapDir -Force | Out-Null
Set-Content -Path $designPath -Value $template -Encoding UTF8
Write-Host "[OK] 已生成模板: $designPath" -ForegroundColor Green
Write-Host "     场景数: $Scenes | 占比: $($pcts -join '+')=100%" -ForegroundColor Cyan

# ---------- 生成后自动校验（默认开启） ----------
if (-not $NoValidate) {
    $validateScript = Join-Path $PSScriptRoot "validate-design.ps1"
    if (Test-Path $validateScript) {
        Write-Host "`n=== 自动校验 validate-design.ps1 -Chapter $Chapter ===" -ForegroundColor Cyan
        & $validateScript -Chapter $Chapter
    } else {
        Write-Host "[WARN] 未找到 validate-design.ps1，跳过自动校验" -ForegroundColor Yellow
    }
}
