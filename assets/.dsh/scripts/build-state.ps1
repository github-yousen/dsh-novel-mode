<#
.SYNOPSIS
    从所有章节摘要构建初始 state.yaml（用于 /novel-import）
.DESCRIPTION
    遍历 novel/chapters/*/summary.md，聚合生成完整的 state.yaml
    支持活跃/归档分层：近10章角色放 active，其余归档
.EXAMPLE
    pwsh -File .dsh/scripts/build-state.ps1
#>

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrEmpty($PSScriptRoot)) {
    $projectRoot = (Get-Location).Path
} else {
    $projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}
$novelDir = Join-Path $projectRoot "novel"
# 如果 .dsh 不在项目根目录下（多项目共享场景），回退到 CWD
if (-not (Test-Path (Join-Path $novelDir "constitution"))) {
    $cwdNovel = Join-Path (Get-Location).Path "novel"
    if (Test-Path (Join-Path $cwdNovel "constitution")) {
        $projectRoot = (Get-Location).Path
        $novelDir = $cwdNovel
    }
}
$chaptersDir = Join-Path $novelDir "chapters"
$statePath = Join-Path $novelDir "state.yaml"
$stateDir = Join-Path $novelDir "state"

if (-not (Test-Path $chaptersDir)) {
    Write-Error "chapters 目录不存在: $chaptersDir"
    exit 1
}

$chapDirs = Get-ChildItem $chaptersDir -Directory | Sort-Object Name

if ($chapDirs.Count -eq 0) {
    Write-Error "未找到任何章节目录"
    exit 1
}

# 确保 state/ 归档目录存在
if (-not (Test-Path $stateDir)) { New-Item $stateDir -ItemType Directory -Force | Out-Null }

Write-Host "扫描到 $($chapDirs.Count) 个章节目录"

# ============================================================
# 初始化数据结构
# ============================================================

$lastChapter = 0
$timelineEvents = @()
$characters = @{}
$foreshadowActive = @()
$foreshadowResolved = @()
$worldAssets = @{}

# ============================================================
# 遍历所有章节摘要
# ============================================================

foreach ($dir in $chapDirs) {
    $chapterNum = [int]$dir.Name
    $summaryPath = Join-Path $dir.FullName "summary.md"

    if (-not (Test-Path $summaryPath)) {
        Write-Host "  跳过 第${chapterNum}章 (无 summary.md)"
        continue
    }

    $lastChapter = $chapterNum
    $summary = Get-Content $summaryPath -Raw -Encoding UTF8

    # --- 时间线 ---
    $timeMatch = [regex]::Match($summary, '### 时间线\s*\n[-\s]*(.+)')
    $timeInfo = if ($timeMatch.Success) { $timeMatch.Groups[1].Value.Trim().TrimStart('- ') } else { "" }

    $plotMatch = [regex]::Match($summary, '### 剧情[^\n]*\n(.+)')
    $plotEvent = if ($plotMatch.Success) {
        $plotLine = $plotMatch.Groups[1].Value.Trim()
        if ($plotLine -match '^(.+?[。！？])') { $Matches[1] } else { $plotLine.Substring(0, [math]::Min(50, $plotLine.Length)) }
    } else { "第${chapterNum}章" }

    $timelineEvents += @{ chapter = $chapterNum; time = $timeInfo; event = $plotEvent }

    # --- 角色状态 ---
    $charSection = [regex]::Match($summary, '(?s)### 角色状态\s*\n(.*?)(?=\n###|\z)')
    if ($charSection.Success) {
        $charLines = $charSection.Groups[1].Value -split "`n" | Where-Object { $_ -match '^- ' }
        foreach ($line in $charLines) {
            # 新格式: "- 角色名: 位置=xxx, 状态=xxx"
            if ($line -match '^- (.+?):\s*位置=(.+?),\s*状态=(.+)$') {
                $name = ($Matches[1].Trim() -replace '[*`_]', '').Trim()
                $location = $Matches[2].Trim()
                $statusRaw = $Matches[3].Trim()

                $status = "alive"
                if ($statusRaw -match '死亡|阵亡|牺牲') { $status = "dead" }
                elseif ($statusRaw -ne "无变化") { $status = $statusRaw }
            }
            # 旧格式兼容: "- 角色名: 描述文本"
            elseif ($line -match '^- (.+?)[:：]\s*(.+)') {
                $name = ($Matches[1].Trim() -replace '[*`_]', '').Trim()
                $info = $Matches[2].Trim()

                $status = "alive"
                $location = ""
                if ($info -match '死亡|阵亡|牺牲') { $status = "dead" }
                if ($info -match '位置[=：:]\s*(.+?)(?:[,，;；]|$)') { $location = $Matches[1] }
                elseif ($info -match '(?:在|到达|前往|位于)\s*(.+?)(?:[,，;；。]|$)') { $location = $Matches[1] }
            }
            else { continue }

            $characters[$name] = @{
                status          = $status
                location        = $location
                lastAppearance  = $chapterNum
            }
        }
    }

    # --- 伏笔 ---
    $fsSection = [regex]::Match($summary, '(?s)### 伏笔\s*\n(.*?)(?=\n###|\z)')
    if ($fsSection.Success) {
        $fsContent = $fsSection.Groups[1].Value

        # 新埋伏笔（兼容多种表述：新埋/埋下/新增伏笔/埋设）
        $planted = [regex]::Matches($fsContent, '(?:新埋|埋下|新增伏笔|埋设).*?(F-\d+(?:-\d+)?)\s*[\]\s]*(.+)')
        foreach ($m in $planted) {
            $foreshadowActive += @{ id = $m.Groups[1].Value; planted = $chapterNum; description = $m.Groups[2].Value.Trim() }
        }

        # 回收伏笔（兼容多种表述：回收/已回收/收回）
        $resolved = [regex]::Matches($fsContent, '(?:回收|已回收|收回).*?(F-\d+(?:-\d+)?)\s*[\]\s]*(.*)')
        foreach ($m in $resolved) {
            $rid = $m.Groups[1].Value
            $rdesc = $m.Groups[2].Value.Trim()
            $found = $foreshadowActive | Where-Object { $_.id -eq $rid }
            if ($found) {
                $foreshadowResolved += @{ id = $rid; planted = $found.planted; resolved = $chapterNum; description = $found.description }
                $foreshadowActive = $foreshadowActive | Where-Object { $_.id -ne $rid }
            } else {
                $foreshadowResolved += @{ id = $rid; planted = 0; resolved = $chapterNum; description = $rdesc }
            }
        }
    }

    # --- 世界资产变更 ---
    $assetSection = [regex]::Match($summary, '(?s)### 世界资产变更\s*\n(.*?)(?=\n###|\z)')
    if ($assetSection.Success) {
        $assetLines = $assetSection.Groups[1].Value -split "`n" | Where-Object { $_ -match '^\s*-\s+.+:\s+.+' }
        foreach ($line in $assetLines) {
            if ($line -match '^\s*-\s+(.+?):\s+(.+)$') {
                $aKey = $Matches[1].Trim()
                $aVal = $Matches[2].Trim()
                # 跳过"无"和模板占位符
                if ($aKey -eq "无" -or $aVal -eq "无") { continue }
                if ($aKey -match '^\[' -or $aVal -match '^\[') { continue }
                # 同 key 覆盖
                $worldAssets[$aKey] = @{ value = $aVal; lastUpdated = $chapterNum }
            }
        }
    }

    Write-Host "  处理 第${chapterNum}章 完成"
}

# ============================================================
# 分层：时间线归档（角色不归档，常驻 active）
# ============================================================

# 时间线：只保留最近10章事件在主文件
$recentThreshold = [math]::Max(1, $lastChapter - 9)
$recentEvents = $timelineEvents | Where-Object { $_.chapter -ge $recentThreshold }
$archivedEvents = $timelineEvents | Where-Object { $_.chapter -lt $recentThreshold }

# 🔴 角色不归档，全部常驻 active
$activeChars = $characters

# ============================================================
# 生成主 state.yaml
# ============================================================

$yaml = "# Novel-Spec 全局状态 (自动生成)`n"
$yaml += "version: 1`n"
$yaml += "lastChapter: $lastChapter`n`n"

# Timeline (recent only)
$currentTime = if ($recentEvents.Count -gt 0) { $recentEvents[-1].time } else { "" }
$yaml += "timeline:`n  current: `"$currentTime`"`n  recent_events:`n"
foreach ($evt in $recentEvents) {
    $yaml += "    - chapter: $($evt.chapter)`n"
    $yaml += "      time: `"$($evt.time)`"`n"
    $yaml += "      event: `"$($evt.event)`"`n"
}

# Characters (all in active, no archiving)
$yaml += "`ncharacters:`n  active:`n"
foreach ($entry in $activeChars.GetEnumerator() | Sort-Object { $_.Value.lastAppearance } -Descending) {
    $name = $entry.Key
    $info = $entry.Value
    $yaml += "    $name`:`n"
    $yaml += "      status: $($info.status)`n"
    $yaml += "      location: `"$($info.location)`"`n"
    $yaml += "      lastAppearance: $($info.lastAppearance)`n"
}

# Foreshadowing
$yaml += "`nforeshadowing:`n  active:`n"
foreach ($fs in $foreshadowActive) {
    $yaml += "    - id: $($fs.id)`n"
    $yaml += "      planted: $($fs.planted)`n"
    $yaml += "      description: `"$($fs.description)`"`n"
}
$yaml += "  resolved_ref: `"state/resolved-foreshadowing.yaml`"`n"

# WorldAssets
$yaml += "`nworldAssets:`n  active:`n"
foreach ($entry in $worldAssets.GetEnumerator()) {
    $yaml += "    - key: `"$($entry.Key)`"`n"
    $yaml += "      value: `"$($entry.Value.value)`"`n"
    $yaml += "      lastUpdated: $($entry.Value.lastUpdated)`n"
}

# StyleFingerprint（默认值占位，后续由 compute-style.ps1 以前10章正文覆盖）
$yaml += "`nstyleFingerprint:`n"
$yaml += "  avgSentenceLen: 0`n"
$yaml += "  dialogueRatio: 0`n"
$yaml += "  avgParagraphLen: 0`n"
$yaml += "  exclamationRate: 0`n"
$yaml += "  basedOnChapters: 0`n"
$yaml += "  baselineMode: fixed_first_10`n"
$yaml += "  baselineStartChapter: 1`n"
$yaml += "  baselineEndChapter: 10`n"


# BatchProgress
$yaml += "`nbatchProgress:`n"
$yaml += "  running: false`n"
$yaml += "  startChapter: 0`n"
$yaml += "  endChapter: 0`n"
$yaml += "  nextChapter: 0`n"
$yaml += "  checkpointInterval: 10`n"
$yaml += "  completedChapters: []`n"
$yaml += "  totalWords: 0`n"
$yaml += "  pendingConstitution: []`n"

Set-Content $statePath $yaml -Encoding UTF8 -NoNewline

# ============================================================
# 生成归档文件（只归档时间线和已回收伏笔，不归档角色）
# ============================================================

# 归档时间线
$archiveTimeline = "# 时间线归档 (章节 < $recentThreshold)`n"
foreach ($evt in $archivedEvents) {
    $archiveTimeline += "- chapter: $($evt.chapter)`n  time: `"$($evt.time)`"`n  event: `"$($evt.event)`"`n"
}
Set-Content (Join-Path $stateDir "timeline-archive.yaml") $archiveTimeline -Encoding UTF8

# 归档已回收伏笔
$archiveFs = "# 已回收伏笔`n"
foreach ($fs in $foreshadowResolved) {
    $archiveFs += "- id: $($fs.id)`n  planted: $($fs.planted)`n  resolved: $($fs.resolved)`n  description: `"$($fs.description)`"`n"
}
Set-Content (Join-Path $stateDir "resolved-foreshadowing.yaml") $archiveFs -Encoding UTF8

# 全量重建长期记忆摘录（软失败，不阻断）
if (-not [string]::IsNullOrEmpty($PSScriptRoot)) {
    $digestScript = Join-Path $PSScriptRoot "build-memory-digest.ps1"
    if (Test-Path $digestScript) {
        try {
            & $digestScript -Rebuild -ProjectRoot $projectRoot | Out-Null
            Write-Host "✓ memory-digest.md 已全量重建"
        } catch {
            Write-Host "⚠ 长期记忆摘录重建失败（不影响 state.yaml）: $($_.Exception.Message)"
        }
    }
}

Write-Host "`n✓ state.yaml 已生成: $statePath"
Write-Host "  章节: $lastChapter | 角色总数: $($activeChars.Count)"
Write-Host "  活跃伏笔: $($foreshadowActive.Count) | 已回收: $($foreshadowResolved.Count)"
Write-Host "  世界资产: $($worldAssets.Count) 项"
Write-Host "  近期事件: $($recentEvents.Count) | 归档事件: $($archivedEvents.Count)"
