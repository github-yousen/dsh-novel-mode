<#
.SYNOPSIS
    章节完成后同步全局状态 — 读取 summary.md 和 design.md，更新 state.yaml
    🔴 使用结构化哈希表操作，不使用字符串正则替换，确保 YAML 格式永远正确
.PARAMETER Chapter
    刚完成的章节号
.EXAMPLE
    pwsh -File .dsh/scripts/sync-state.ps1 -Chapter 15
#>

param(
    [Parameter(Mandatory=$true)]
    [int]$Chapter
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrEmpty($PSScriptRoot)) {
    $projectRoot = (Get-Location).Path
} else {
    $projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}
$novelDir = Join-Path $projectRoot "novel"
# 如果 .dsh 不在项目根目录下（多项目共享场景），回退到 CWD 或搜索兄弟目录
if (-not (Test-Path (Join-Path $novelDir "constitution"))) {
    $cwdNovel = Join-Path (Get-Location).Path "novel"
    if (Test-Path (Join-Path $cwdNovel "constitution")) {
        $projectRoot = (Get-Location).Path
        $novelDir = $cwdNovel
    } else {
        # 搜索 .dsh 的兄弟目录（共享 .dsh 场景）
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
$constitutionDir = Join-Path $novelDir "constitution"
$charsDir = Join-Path $constitutionDir "characters"
$statePath = Join-Path $novelDir "state.yaml"
$stateDir = Join-Path $novelDir "state"
$chapDir = Join-Path $novelDir "chapters" ("{0:D3}" -f $Chapter)

$summaryPath = Join-Path $chapDir "summary.md"
$designPath = Join-Path $chapDir "design.md"
$contentPath = Join-Path $chapDir "content.md"

function Get-NonEmptyLines {
    param([string]$Text)
    if ($null -eq $Text) { return @() }
    return @($Text -split "`n" | Where-Object { $_.ToString().Trim() -ne '' })
}

# 确保 state/ 归档目录存在
if (-not (Test-Path $stateDir)) {
    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
}

# ============================================================
# 辅助函数：解析 state.yaml 为结构化哈希表
# ============================================================

function Parse-StateYaml {
    param([string]$Path)

    $state = @{
        version          = 1
        lastChapter      = 0
        timeline         = @{
            current       = ""
            recent_events = [System.Collections.ArrayList]@()
        }
        characters       = @{
            active       = [ordered]@{}
        }
        foreshadowing    = @{
            active       = [System.Collections.ArrayList]@()
            resolved_ref = "state/resolved-foreshadowing.yaml"
        }
        worldAssets      = @{
            active       = [System.Collections.ArrayList]@()
        }
        styleFingerprint = @{
            avgSentenceLen       = 18.0
            dialogueRatio        = 0.30
            avgParagraphLen      = 120.0
            exclamationRate      = 0.02
            basedOnChapters      = 0
            baselineMode         = "fixed_first_10"
            baselineStartChapter = 1
            baselineEndChapter   = 10
        }

        batchProgress    = @{
            running             = $false
            startChapter        = 0
            endChapter          = 0
            nextChapter         = 0
            checkpointInterval  = 10
            completedChapters   = [System.Collections.ArrayList]@()
            totalWords          = 0
            pendingConstitution = [System.Collections.ArrayList]@()
        }
    }

    if (-not (Test-Path $Path)) { return $state }

    $lines = Get-Content $Path -Encoding UTF8
    $currentSection = ""
    $currentSubSection = ""
    $currentChar = ""
    $currentForeshadow = $null
    $currentAsset = $null

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]

        # 跳过注释和空行
        if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }

        # 顶层字段
        if ($line -match '^version:\s*(.+)') {
            $state.version = [int]$Matches[1].Trim()
            $currentSection = ""
            continue
        }
        if ($line -match '^lastChapter:\s*(.+)') {
            $state.lastChapter = [int]$Matches[1].Trim()
            $currentSection = ""
            continue
        }

        # Section 头
        if ($line -match '^timeline:\s*$') { $currentSection = "timeline"; $currentSubSection = ""; continue }
        if ($line -match '^characters:\s*$') { $currentSection = "characters"; $currentSubSection = ""; continue }
        if ($line -match '^foreshadowing:\s*$') { $currentSection = "foreshadowing"; $currentSubSection = ""; continue }
        if ($line -match '^worldAssets:\s*$') { $currentSection = "worldAssets"; $currentSubSection = ""; continue }
        if ($line -match '^styleFingerprint:\s*$') { $currentSection = "style"; continue }
        if ($line -match '^batchProgress:\s*$') { $currentSection = "batch"; continue }

        # timeline 区域
        if ($currentSection -eq "timeline") {
            if ($line -match '^\s+current:\s*"?(.*?)"?\s*$') {
                $state.timeline.current = $Matches[1].Trim()
                continue
            }
            if ($line -match '^\s+recent_events:\s*$') { $currentSubSection = "recent_events"; continue }
            if ($currentSubSection -eq "recent_events") {
                if ($line -match '^\s+- chapter:\s*(\d+)') {
                    $evt = @{ chapter = [int]$Matches[1]; time = ""; event = "" }
                    $state.timeline.recent_events.Add($evt) | Out-Null
                    continue
                }
                if ($line -match '^\s+time:\s*"?(.*?)"?\s*$' -and $state.timeline.recent_events.Count -gt 0) {
                    $state.timeline.recent_events[-1].time = $Matches[1].Trim()
                    continue
                }
                if ($line -match '^\s+event:\s*"?(.*?)"?\s*$' -and $state.timeline.recent_events.Count -gt 0) {
                    $state.timeline.recent_events[-1].event = $Matches[1].Trim()
                    continue
                }
            }
        }

        # characters 区域
        if ($currentSection -eq "characters") {
            if ($line -match '^\s+active:\s*$') { $currentSubSection = "char_active"; continue }
            if ($currentSubSection -eq "char_active") {
                # 角色名行: "    角色名:"
                if ($line -match '^\s{4}(\S.*?):\s*$') {
                    $currentChar = $Matches[1].Trim()
                    if (-not $state.characters.active.Contains($currentChar)) {
                        $state.characters.active[$currentChar] = @{
                            status         = "alive"
                            location       = ""
                            lastAppearance = 0
                        }
                    }
                    continue
                }
                # 角色属性行
                if ($currentChar -and $line -match '^\s{6}(\w+):\s*(.+)') {
                    $key = $Matches[1].Trim()
                    $val = $Matches[2].Trim().Trim('"')
                    if ($key -eq "lastAppearance") {
                        $state.characters.active[$currentChar][$key] = [int]$val
                    } else {
                        $state.characters.active[$currentChar][$key] = $val
                    }
                    continue
                }
            }
        }

        # foreshadowing 区域
        if ($currentSection -eq "foreshadowing") {
            if ($line -match '^\s+active:\s*$') { $currentSubSection = "fs_active"; continue }
            if ($line -match '^\s+resolved_ref:\s*"?(.*?)"?\s*$') {
                $state.foreshadowing.resolved_ref = $Matches[1].Trim()
                continue
            }
            if ($currentSubSection -eq "fs_active") {
                if ($line -match '^\s+- id:\s*(.+)') {
                    $currentForeshadow = @{ id = $Matches[1].Trim(); planted = 0; description = "" }
                    $state.foreshadowing.active.Add($currentForeshadow) | Out-Null
                    continue
                }
                if ($null -ne $currentForeshadow) {
                    if ($line -match '^\s+planted:\s*(\d+)') {
                        $currentForeshadow.planted = [int]$Matches[1]
                        continue
                    }
                    if ($line -match '^\s+description:\s*"?(.*?)"?\s*$') {
                        $currentForeshadow.description = $Matches[1].Trim()
                        continue
                    }
                    if ($line -match '^\s+resolved:\s*(\d+)') {
                        $currentForeshadow["resolved"] = [int]$Matches[1]
                        continue
                    }
                }
            }
        }

        # worldAssets 区域
        if ($currentSection -eq "worldAssets") {
            if ($line -match '^\s+active:\s*$') { $currentSubSection = "wa_active"; continue }
            if ($currentSubSection -eq "wa_active") {
                if ($line -match '^\s+- key:\s*"?(.*?)"?\s*$') {
                    $currentAsset = @{ key = $Matches[1].Trim(); value = ""; lastUpdated = 0 }
                    $state.worldAssets.active.Add($currentAsset) | Out-Null
                    continue
                }
                if ($null -ne $currentAsset) {
                    if ($line -match '^\s+value:\s*"?(.*?)"?\s*$') {
                        $currentAsset.value = $Matches[1].Trim()
                        continue
                    }
                    if ($line -match '^\s+lastUpdated:\s*(\d+)') {
                        $currentAsset.lastUpdated = [int]$Matches[1]
                        continue
                    }
                }
            }
        }

        # styleFingerprint 区域
        if ($currentSection -eq "style") {
            if ($line -match '^\s+avgSentenceLen:\s*(.+)') { $state.styleFingerprint.avgSentenceLen = [double]$Matches[1]; continue }
            if ($line -match '^\s+dialogueRatio:\s*(.+)') { $state.styleFingerprint.dialogueRatio = [double]$Matches[1]; continue }
            if ($line -match '^\s+avgParagraphLen:\s*(.+)') { $state.styleFingerprint.avgParagraphLen = [double]$Matches[1]; continue }
            if ($line -match '^\s+exclamationRate:\s*(.+)') { $state.styleFingerprint.exclamationRate = [double]$Matches[1]; continue }
            if ($line -match '^\s+basedOnChapters:\s*(.+)') { $state.styleFingerprint.basedOnChapters = [int]$Matches[1]; continue }
            if ($line -match '^\s+baselineMode:\s*(.+)') { $state.styleFingerprint.baselineMode = $Matches[1].Trim().Trim('"'); continue }
            if ($line -match '^\s+baselineStartChapter:\s*(.+)') { $state.styleFingerprint.baselineStartChapter = [int]$Matches[1]; continue }
            if ($line -match '^\s+baselineEndChapter:\s*(.+)') { $state.styleFingerprint.baselineEndChapter = [int]$Matches[1]; continue }
        }


        # batchProgress 区域
        if ($currentSection -eq "batch") {
            if ($line -match '^\s+running:\s*(.+)') { $state.batchProgress.running = ($Matches[1].Trim() -eq "true"); continue }
            if ($line -match '^\s+startChapter:\s*(\d+)') { $state.batchProgress.startChapter = [int]$Matches[1]; continue }
            if ($line -match '^\s+endChapter:\s*(\d+)') { $state.batchProgress.endChapter = [int]$Matches[1]; continue }
            if ($line -match '^\s+nextChapter:\s*(\d+)') { $state.batchProgress.nextChapter = [int]$Matches[1]; continue }
            if ($line -match '^\s+checkpointInterval:\s*(\d+)') { $state.batchProgress.checkpointInterval = [int]$Matches[1]; continue }
            if ($line -match '^\s+totalWords:\s*(\d+)') { $state.batchProgress.totalWords = [int]$Matches[1]; continue }
            if ($line -match '^\s+completedChapters:\s*\[(.+)?\]') {
                $val = $Matches[1]
                if ($val) {
                    $state.batchProgress.completedChapters = [System.Collections.ArrayList]@($val -split ',' | ForEach-Object { [int]$_.Trim() })
                }
                continue
            }
            if ($line -match '^\s+pendingConstitution:\s*\[(.+)?\]') {
                $val = $Matches[1]
                if ($val) {
                    $state.batchProgress.pendingConstitution = [System.Collections.ArrayList]@($val -split ',' | ForEach-Object { $_.Trim().Trim('"') })
                }
                continue
            }
        }
    }

    return $state
}

# ============================================================
# 辅助函数：将结构化哈希表序列化为 state.yaml
# ============================================================

function Write-StateYaml {
    param($State, [string]$Path)

    $sb = [System.Text.StringBuilder]::new()

    [void]$sb.AppendLine("# Novel-Spec 全局状态")
    [void]$sb.AppendLine("# 由脚本自动维护，AI写作时只读参考")
    [void]$sb.AppendLine("# 🔴 活跃数据放本文件，冷数据归档到 state/ 目录")
    [void]$sb.AppendLine("# 🔴 长期记忆（全书逐章剧情索引 / 专名词表 / 伏笔台账）见 state/memory-digest.md")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("version: $($State.version)")
    [void]$sb.AppendLine("lastChapter: $($State.lastChapter)")
    [void]$sb.AppendLine("")

    # timeline
    [void]$sb.AppendLine("timeline:")
    [void]$sb.AppendLine("  current: `"$($State.timeline.current)`"")
    [void]$sb.AppendLine("  recent_events:")
    foreach ($evt in $State.timeline.recent_events) {
        [void]$sb.AppendLine("    - chapter: $($evt.chapter)")
        [void]$sb.AppendLine("      time: `"$($evt.time)`"")
        [void]$sb.AppendLine("      event: `"$($evt.event)`"")
    }
    [void]$sb.AppendLine("")

    # characters
    [void]$sb.AppendLine("characters:")
    [void]$sb.AppendLine("  active:")
    foreach ($charName in $State.characters.active.Keys) {
        $char = $State.characters.active[$charName]
        [void]$sb.AppendLine("    ${charName}:")
        [void]$sb.AppendLine("      status: $($char.status)")
        [void]$sb.AppendLine("      location: `"$($char.location)`"")
        [void]$sb.AppendLine("      lastAppearance: $($char.lastAppearance)")
    }
    [void]$sb.AppendLine("")

    # foreshadowing
    [void]$sb.AppendLine("foreshadowing:")
    [void]$sb.AppendLine("  active:")
    foreach ($fs in $State.foreshadowing.active) {
        [void]$sb.AppendLine("    - id: $($fs.id)")
        [void]$sb.AppendLine("      planted: $($fs.planted)")
        [void]$sb.AppendLine("      description: `"$($fs.description)`"")
    }
    [void]$sb.AppendLine("  resolved_ref: `"$($State.foreshadowing.resolved_ref)`"")
    [void]$sb.AppendLine("")

    # worldAssets
    [void]$sb.AppendLine("worldAssets:")
    [void]$sb.AppendLine("  active:")
    foreach ($asset in $State.worldAssets.active) {
        [void]$sb.AppendLine("    - key: `"$($asset.key)`"")
        [void]$sb.AppendLine("      value: `"$($asset.value)`"")
        [void]$sb.AppendLine("      lastUpdated: $($asset.lastUpdated)")
    }
    [void]$sb.AppendLine("")

    # styleFingerprint
    [void]$sb.AppendLine("styleFingerprint:")
    [void]$sb.AppendLine("  avgSentenceLen: $($State.styleFingerprint.avgSentenceLen)")
    [void]$sb.AppendLine("  dialogueRatio: $($State.styleFingerprint.dialogueRatio)")
    [void]$sb.AppendLine("  avgParagraphLen: $($State.styleFingerprint.avgParagraphLen)")
    [void]$sb.AppendLine("  exclamationRate: $($State.styleFingerprint.exclamationRate)")
    [void]$sb.AppendLine("  basedOnChapters: $($State.styleFingerprint.basedOnChapters)")
    [void]$sb.AppendLine("  baselineMode: $($State.styleFingerprint.baselineMode)")
    [void]$sb.AppendLine("  baselineStartChapter: $($State.styleFingerprint.baselineStartChapter)")
    [void]$sb.AppendLine("  baselineEndChapter: $($State.styleFingerprint.baselineEndChapter)")
    [void]$sb.AppendLine("")


    # batchProgress
    [void]$sb.AppendLine("batchProgress:")
    [void]$sb.AppendLine("  running: $($State.batchProgress.running.ToString().ToLower())")
    [void]$sb.AppendLine("  startChapter: $($State.batchProgress.startChapter)")
    [void]$sb.AppendLine("  endChapter: $($State.batchProgress.endChapter)")
    [void]$sb.AppendLine("  nextChapter: $($State.batchProgress.nextChapter)")
    [void]$sb.AppendLine("  checkpointInterval: $($State.batchProgress.checkpointInterval)")
    $completedStr = ($State.batchProgress.completedChapters | ForEach-Object { $_ }) -join ", "
    [void]$sb.AppendLine("  completedChapters: [$completedStr]")
    [void]$sb.AppendLine("  totalWords: $($State.batchProgress.totalWords)")
    $pendingStr = ($State.batchProgress.pendingConstitution | ForEach-Object { "`"$_`"" }) -join ", "
    [void]$sb.AppendLine("  pendingConstitution: [$pendingStr]")

    Set-Content $Path $sb.ToString().TrimEnd() -Encoding UTF8 -NoNewline
}

# ============================================================
# 主逻辑开始
# ============================================================

# 1. 解析现有 state.yaml 为结构化对象
$state = Parse-StateYaml $statePath
Write-Host "已加载 state.yaml (lastChapter: $($state.lastChapter))"

# 2. 校验摘要
if (-not (Test-Path $summaryPath)) {
    Write-Error "[RETRY_SUMMARIZER] 摘要文件不存在: $summaryPath"
    exit 1
}


$summaryRaw = Get-Content $summaryPath -Raw -Encoding UTF8
$registeredChars = @()
if (Test-Path $charsDir) {
    $registeredChars = Get-ChildItem $charsDir -Filter "*.md" | Where-Object { $_.Name -ne '_template.md' } | ForEach-Object { $_.BaseName }
}

$requiredSummarySections = @(
    '### 剧情',
    '### 剧情详述',
    '### 角色状态',
    '### 伏笔',
    '### 时间线',
    '### 可引用细节',
    '### 世界资产变更'
)
foreach ($sec in $requiredSummarySections) {
    if ($summaryRaw -notmatch [regex]::Escape($sec)) {
        Write-Error "[RETRY_SUMMARIZER] 摘要缺少必要段落: $sec"
        exit 1
    }
}


# 校验剧情字数（≤100中文字符）

$plotMatch = [regex]::Match($summaryRaw, '(?s)### 剧情（[^）]*）\s*\n(.+?)(?=\n###|\z)')
if (-not $plotMatch.Success) {
    # 兼容旧格式
    $plotMatch = [regex]::Match($summaryRaw, '(?s)### 剧情[^\n]*\n(.+?)(?=\n###|\z)')
}
if ($plotMatch.Success) {
    $plotText = $plotMatch.Groups[1].Value.Trim()
    $plotChars = ([regex]::Matches($plotText, '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2018-\u201f\u2026\u2014\u2013]')).Count
    if ($plotChars -gt 100) {
        Write-Error "[RETRY_SUMMARIZER] 摘要剧情部分超出限制: ${plotChars}/100 中文字符，请精简后重试"
        exit 1
    }

    Write-Host "摘要校验通过 (剧情: ${plotChars}/100 字)"
}

# 校验剧情详述字数（≤500中文字符）
$detailMatch = [regex]::Match($summaryRaw, '(?s)### 剧情详述[^\n]*\n(.+?)(?=\n###|\z)')
if ($detailMatch.Success) {
    $detailText = $detailMatch.Groups[1].Value.Trim()
    $detailChars = ([regex]::Matches($detailText, '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2018-\u201f\u2026\u2014\u2013]')).Count
    if ($detailChars -gt 500) {
        Write-Error "[RETRY_SUMMARIZER] 摘要剧情详述超出限制: ${detailChars}/500 中文字符，请精简后重试"
        exit 1
    }

    Write-Host "摘要校验通过 (剧情详述: ${detailChars}/500 字)"
} else {
    Write-Host "WARNING: 未发现 '### 剧情详述' 段落，建议使用新版摘要模板"
}

# ============================================================
# 3. 更新 lastChapter
# ============================================================

$state.lastChapter = $Chapter

# ============================================================
# 4. 更新 timeline（追加本章事件）
# ============================================================

# 提取时间线信息
$timeMatch = [regex]::Match($summaryRaw, '### 时间线\s*\n[-\s]*(.+)')
$timeInfo = if ($timeMatch.Success) { $timeMatch.Groups[1].Value.Trim().TrimStart('- ') } else { "" }
if ([string]::IsNullOrWhiteSpace($timeInfo) -or $timeInfo -match '未提取到|\[[^\]]+\]') {
    Write-Error "[RETRY_SUMMARIZER] 摘要时间线无有效内容，请先修正 summary.md 后再同步 state.yaml"
    exit 1
}



# 提取剧情第一句作为事件
$plotEventMatch = [regex]::Match($summaryRaw, '### 剧情（[^）]*）\s*\n(.+)')
if (-not $plotEventMatch.Success) {
    $plotEventMatch = [regex]::Match($summaryRaw, '### 剧情[^\n]*\n(.+)')
}
$plotEvent = if ($plotEventMatch.Success) {
    $plotLine = $plotEventMatch.Groups[1].Value.Trim()
    if ($plotLine -match '^(.+?[。！？])') { $Matches[1] } else { $plotLine.Substring(0, [math]::Min(50, $plotLine.Length)) }
} else { "第${Chapter}章事件" }

# 追加事件到 recent_events（同章去重：重跑同一章时覆盖而非追加）
$existingIdx = -1
for ($j = 0; $j -lt $state.timeline.recent_events.Count; $j++) {
    if ($state.timeline.recent_events[$j].chapter -eq $Chapter) {
        $existingIdx = $j
        break
    }
}
$newEvent = @{
    chapter = $Chapter
    time    = $timeInfo
    event   = $plotEvent
}
if ($existingIdx -ge 0) {
    $state.timeline.recent_events[$existingIdx] = $newEvent
    Write-Host "时间线: 第${Chapter}章事件已覆盖更新（同章去重）"
} else {
    $state.timeline.recent_events.Add($newEvent) | Out-Null
}

# 只保留最近10章事件，更早的归档
if ($state.timeline.recent_events.Count -gt 10) {
    $archivePath = Join-Path $stateDir "timeline-archive.yaml"
    $archiveEvents = $state.timeline.recent_events[0..($state.timeline.recent_events.Count - 11)]
    foreach ($evt in $archiveEvents) {
        $archiveLine = "- chapter: $($evt.chapter)`n  time: `"$($evt.time)`"`n  event: `"$($evt.event)`"`n"
        Add-Content $archivePath $archiveLine -Encoding UTF8
    }
    $state.timeline.recent_events = [System.Collections.ArrayList]@($state.timeline.recent_events[($state.timeline.recent_events.Count - 10)..($state.timeline.recent_events.Count - 1)])
    Write-Host "已归档 $($archiveEvents.Count) 条旧时间线事件"
}

# 更新 current 为最新时间
$state.timeline.current = $timeInfo

# ============================================================
# 5. 更新角色状态（从 summary.md 的 ### 角色状态 提取）
# 🔴 现在同时更新 location 和 status，不只是 lastAppearance
# ============================================================

$charSection = [regex]::Match($summaryRaw, '(?s)### 角色状态\s*\n(.*?)(?=\n###|\z)')
if ($charSection.Success) {
    $charLines = Get-NonEmptyLines $charSection.Groups[1].Value
    $parsedCount = 0
    $invalidCount = 0

    foreach ($rawLine in $charLines) {
        $line = $rawLine.ToString().Trim()
        if ($line -eq '无' -or $line -eq '- 无') { continue }

        if ($line -notmatch '^- (.+?):\s*位置=(.+?),\s*状态=(.+)$') {
            Write-Error "[RETRY_SUMMARIZER] 角色状态格式错误: $line。必须使用 '- 角色名: 位置=xxx, 状态=xxx'"
            exit 1
        }


        $charName = ($Matches[1].Trim() -replace '[*`_]', '').Trim()
        $location = $Matches[2].Trim()
        $statusVal = $Matches[3].Trim()

        if ($charName -match '\[[^\]]+\]' -or $location -match '\[[^\]]+\]' -or $statusVal -match '\[[^\]]+\]') {
            Write-Error "[RETRY_SUMMARIZER] 角色状态仍含模板占位符: $line"
            exit 1
        }

        if ($location -match ',') {
            Write-Error "[RETRY_SUMMARIZER] 角色位置中禁止使用英文逗号: $line"
            exit 1
        }

        if ($registeredChars.Count -gt 0 -and $charName -notin $registeredChars) {
            Write-Error "[REGISTER_CHARACTER] 角色 '$charName' 未在 constitution/characters 中建档，禁止同步进 state.yaml"
            exit 1
        }


        if ($state.characters.active.Contains($charName)) {
            $state.characters.active[$charName].lastAppearance = $Chapter
            $state.characters.active[$charName].location = $location
            if ($statusVal -ne "无变化") {
                if ($statusVal -match '死亡|阵亡|牺牲') { $statusVal = "dead" }
                $state.characters.active[$charName].status = $statusVal
            }
            $parsedCount++
        } else {
            $newStatus = $statusVal
            if ($newStatus -match '死亡|阵亡|牺牲') { $newStatus = "dead" }
            $state.characters.active[$charName] = @{
                status         = $newStatus
                location       = $location
                lastAppearance = $Chapter
            }
            Write-Host "新增已建档角色到 active: $charName"
            $parsedCount++
        }
    }

    if ($parsedCount -eq 0 -and ($charLines -join "`n") -notmatch '(^|\n)\s*-?\s*无\s*($|\n)') {
        $invalidCount++
    }
    if ($invalidCount -gt 0) {
        Write-Error "[RETRY_SUMMARIZER] 角色状态段未提供任何可解析条目"
        exit 1
    }


    Write-Host "角色状态更新: $parsedCount 个角色已更新"

    # 🔴 已取消角色归档机制 — 所有角色常驻 active，避免回归角色状态丢失
} else {
    Write-Error "[RETRY_SUMMARIZER] 摘要缺少 '### 角色状态' 段，禁止同步 state.yaml"
    exit 1
}



# ============================================================
# 6. 更新伏笔追踪（从 summary.md 的 ### 伏笔 提取）
# 🔴 回收的伏笔从 active 移到归档文件，不再留在 active 列表
# ============================================================

$fsSection = [regex]::Match($summaryRaw, '(?s)### 伏笔\s*\n(.*?)(?=\n###|\z)')
if ($fsSection.Success) {
    $fsContent = $fsSection.Groups[1].Value

    # 新埋伏笔（兼容多种表述）
    $newPlanted = [regex]::Matches($fsContent, '(?:新埋|埋下|新增伏笔|埋设).*?(F-\d+(?:-\d+)?)\s*[\]\s]*(.+)')
    foreach ($m in $newPlanted) {
        $fid = $m.Groups[1].Value
        $fdesc = $m.Groups[2].Value.Trim()

        # 检查是否已存在
        $exists = $state.foreshadowing.active | Where-Object { $_.id -eq $fid }
        if (-not $exists) {
            $newFs = @{
                id          = $fid
                planted     = $Chapter
                description = $fdesc
            }
            $state.foreshadowing.active.Add($newFs) | Out-Null
            Write-Host "新增伏笔: $fid - $fdesc"
        }
    }

    # 🔴 回收伏笔：从 active 移除，写入归档文件
    $resolved = [regex]::Matches($fsContent, '(?:回收|已回收|收回).*?(F-\d+(?:-\d+)?)')
    $resolvedArchivePath = Join-Path $stateDir "resolved-foreshadowing.yaml"
    foreach ($m in $resolved) {
        $fid = $m.Groups[1].Value
        $found = $state.foreshadowing.active | Where-Object { $_.id -eq $fid }
        if ($found) {
            # 写入归档文件
            $archiveEntry = "- id: $fid`n  planted: $($found.planted)`n  resolved: $Chapter`n  description: `"$($found.description)`"`n"
            Add-Content $resolvedArchivePath $archiveEntry -Encoding UTF8

            # 从 active 移除
            $state.foreshadowing.active = [System.Collections.ArrayList]@($state.foreshadowing.active | Where-Object { $_.id -ne $fid })
            Write-Host "伏笔已回收并归档: $fid (埋设于第$($found.planted)章，回收于第${Chapter}章)"
        } else {
            Write-Host "WARNING: 尝试回收伏笔 $fid 但未在 active 列表中找到"
        }
    }
}

# ============================================================
# 7. 更新世界资产（从 summary.md 的 ### 世界资产变更 提取）
# 🔴 同 key 覆盖 value 和 lastUpdated，Trim 后比对，幂等
# ============================================================

$assetSection = [regex]::Match($summaryRaw, '(?s)### 世界资产变更\s*\n(.*?)(?=\n###|\z)')
if ($assetSection.Success) {
    $assetContent = $assetSection.Groups[1].Value
    $assetLines = @(Get-NonEmptyLines $assetContent | Where-Object { $_.ToString() -match '^\s*-\s+.+:\s+.+' })
    $assetUpdated = 0

    foreach ($line in $assetLines) {
        # 格式: "- key: value"
        if ($line -match '^\s*-\s+(.+?):\s+(.+)$') {
            $assetKey = $Matches[1].Trim()
            $assetValue = $Matches[2].Trim()

            # 跳过"无"
            if ($assetKey -eq "无" -or $assetValue -eq "无") { continue }
            # 跳过模板占位符
            if ($assetKey -match '^\[' -or $assetValue -match '^\[') { continue }

            # 同 key 覆盖（Trim 后比对）
            $existing = $state.worldAssets.active | Where-Object { $_.key.Trim() -eq $assetKey }
            if ($existing) {
                $existing.value = $assetValue
                $existing.lastUpdated = $Chapter
            } else {
                $newAsset = @{ key = $assetKey; value = $assetValue; lastUpdated = $Chapter }
                $state.worldAssets.active.Add($newAsset) | Out-Null
            }
            $assetUpdated++
        }
    }

    if ($assetUpdated -gt 0) {
        Write-Host "世界资产更新: $assetUpdated 项"
    } else {
        Write-Host "世界资产: 无变更"
    }
} else {
    Write-Error "[RETRY_SUMMARIZER] 摘要缺少 '### 世界资产变更' 段落，禁止同步 state.yaml"
    exit 1
}



# ============================================================
# 8. 提取设定增量到 pendingConstitution（从 design.md 的 ## 设定增量 提取）
# 🔴 仅解析 ## 设定增量 段，跳过注释/示例行，同章重跑去重
# ============================================================

if (Test-Path $designPath) {
    $designRaw = Get-Content $designPath -Raw -Encoding UTF8
    $incrementSection = [regex]::Match($designRaw, '(?s)## 设定增量\s*\n(.*?)(?=\n## |\z)')
    if ($incrementSection.Success) {
        $incrementContent = $incrementSection.Groups[1].Value
        $incrementLines = @(Get-NonEmptyLines $incrementContent | Where-Object { $_.ToString() -match '\[需更新宪法\]' })
        $pendingAdded = 0

        foreach ($line in $incrementLines) {
            # 跳过 HTML 注释行（模板示例）
            if ($line -match '^\s*<!--') { continue }

            # 提取 [需更新宪法] 后面的内容
            if ($line -match '\[需更新宪法\]\s*(.+)$') {
                $pendingItem = "第${Chapter}章: $($Matches[1].Trim())"

                # 去重：检查是否已存在同一条
                $alreadyExists = $state.batchProgress.pendingConstitution | Where-Object { $_ -eq $pendingItem }
                if (-not $alreadyExists) {
                    $state.batchProgress.pendingConstitution.Add($pendingItem) | Out-Null
                    $pendingAdded++
                    Write-Host "新增待确认宪法更新: $pendingItem"
                }
            }
        }

        if ($pendingAdded -eq 0) {
            Write-Host "设定增量: 无新增待确认项"
        }
    }
}

# ============================================================
# 9. 交叉校验 — 检测 summary / state / content 三方矛盾
# 🔴 无法自动判断修哪一方时，标记 [MANUAL_REVIEW] 交给用户
# ============================================================

# 注意：角色"死亡→复活"矛盾由 continuity-validator(post-sync-lite) 检测更可靠
# 因为脚本在步骤5已将摘要状态写入 state，此处检测会有时序问题
# 这里只做脚本层面可确定的交叉校验

# 9.1 时间线倒流检测：如上一章时间点明显晚于本章（简单字面比较，仅捕获明显倒流）
if ($state.timeline.recent_events.Count -ge 2) {
    $prevEvent = $state.timeline.recent_events[$state.timeline.recent_events.Count - 2]
    $currEvent = $state.timeline.recent_events[$state.timeline.recent_events.Count - 1]
    # 如果上一章包含"之后""后来""次日""翌日"等时间推进词，而本章时间反而包含"之前""此前""早些"
    if ($currEvent.time -match '之前|此前|早些|前一天|昨天' -and $prevEvent.time -match '之后|后来|次日|翌日|第二天') {
        Write-Error "[MANUAL_REVIEW] 时间线疑似倒流：第$($prevEvent.chapter)章时间='$($prevEvent.time)' → 第$($currEvent.chapter)章时间='$($currEvent.time)'。请人工确认：是正文时间描写有误（修正文）、还是摘要时间提取有误（修摘要）、还是故意的时间跳转/闪回（在摘要中注明）"
        exit 1
    }
}

# 9.2 伏笔回收悬空检测：摘要标记回收了某伏笔，但 active 中根本没有该 ID
$fsSection2 = [regex]::Match($summaryRaw, '(?s)### 伏笔\s*\n(.*?)(?=\n###|\z)')
if ($fsSection2.Success) {
    $resolvedIds = [regex]::Matches($fsSection2.Groups[1].Value, '(?:回收|已回收|收回).*?(F-\d+(?:-\d+)?)') | ForEach-Object { $_.Groups[1].Value }
    $resolvedArchivePath2 = Join-Path $stateDir "resolved-foreshadowing.yaml"
    $archivedContent = if (Test-Path $resolvedArchivePath2) { Get-Content $resolvedArchivePath2 -Raw -Encoding UTF8 } else { "" }
    foreach ($rid in $resolvedIds) {
        $inActive = $state.foreshadowing.active | Where-Object { $_.id -eq $rid }
        $inArchive = $archivedContent -match [regex]::Escape($rid)
        if (-not $inActive -and -not $inArchive) {
            Write-Error "[MANUAL_REVIEW] 摘要标记回收伏笔 $rid，但该 ID 在 state.yaml active 和已归档列表中均不存在。请人工确认：是伏笔 ID 写错（修摘要）、还是该伏笔从未被埋设（需检查正文和设计稿）"
            exit 1
        }
    }
}

# ============================================================
# 10. 风格指纹提示
# ============================================================

if (Test-Path $contentPath) {
    Write-Host "提示: 风格指纹默认以前10章正文建立固定基准；如需首次建基准或手动重建，请执行:"
    Write-Host "  pwsh -NoProfile -File .dsh/scripts/compute-style.ps1"
}


# ============================================================
# 11. 结构化写出 state.yaml（格式永远正确）
# ============================================================

Write-StateYaml $state $statePath
Write-Host "state.yaml 已更新 (lastChapter: $Chapter)"

# ============================================================
# 11.5 长期记忆摘录增量维护（软失败，不阻断）
#      🔴 state.yaml 只存"活跃"热数据；本章新增的长期记忆（逐章一句话剧情 /
#      专名词表 / 伏笔台账）增量写入 novel/state/memory-digest.md，
#      供 N-20 之外的失忆区查询（扩纲防桥段重复、写作防专名写错、校验防伏笔悬空）
# ============================================================

if (-not [string]::IsNullOrEmpty($PSScriptRoot)) {
    $digestScript = Join-Path $PSScriptRoot "build-memory-digest.ps1"
    if (Test-Path $digestScript) {
        try {
            & $digestScript -UpTo $Chapter -ProjectRoot $projectRoot | Out-Null
            Write-Host "memory-digest.md 已增量更新 (覆盖至第 $Chapter 章)"
        } catch {
            Write-Host "提示: 长期记忆摘录更新失败（不影响本次同步）: $($_.Exception.Message)"
        }
    }
}

# 输出 JSON 给命令解析
@{
    status      = "OK"
    lastChapter = $Chapter
    updated     = @("timeline", "characters", "foreshadowing", "worldAssets", "pendingConstitution")
} | ConvertTo-Json
