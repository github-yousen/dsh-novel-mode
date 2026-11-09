<#
.SYNOPSIS
    为指定章节构建 context-bundle.md，将 batch-designer / continuity-validator 所需的高频上下文文件合并为一个文件（novel-writer 采用设计稿驱动轻量加载）。
.DESCRIPTION
    将以下内容合并写入 novel/chapters/[NNN]/context-bundle.md：
    1. 宪法核心 (core.md + style.md)
    2. 全局状态 (state.yaml)
    3. 设计稿模板 (.dsh/templates/chapter-design.md)
    4. 全部角色设定文件
    5. 近章完整摘要 (N-2 ~ N-10)
    6. 远章剧情压缩段 (N-11 ~ N-20，只提取 ### 剧情 和 ### 可引用细节)
    6.5 远期记忆索引 (第1章 ~ N-21，来自 state/memory-digest.md：逐章一句话 + 专名词表，分层压缩)
    7. 伏笔关联章节的完整摘要（去重）
    8. 本章设计稿 (design.md，如已存在)
    9. 上一章全文 (content.md)

    🔴 目标：将高频重复上下文预编译为单个 bundle，显著减少 SubAgent 的零散读文件次数。
    🔴 novel-writer 采用设计稿驱动的轻量加载（主读 design.md + 宪法核心 + 上一章正文 + 必要角色设定），不依赖 bundle。
    🔴 batch-designer / continuity-validator 仍以 bundle 为主，但必须自行直读 `outline.md` 全文；本脚本不再向 bundle 中提取任何大纲片段。

    🔴 此文件在每章流水线结束后（Step E）由主流程删除，避免干扰后续章节。
.PARAMETER Chapter
    当前要写的章节号 N
.PARAMETER ForeshadowIds
    可选。需回收的伏笔 ID 列表（逗号分隔），如 "F-16-1,F-18-2"
.EXAMPLE
    pwsh -NoProfile -File .dsh/scripts/build-context-bundle.ps1 -Chapter 19
    pwsh -NoProfile -File .dsh/scripts/build-context-bundle.ps1 -Chapter 19 -ForeshadowIds "F-16-1,F-18-2"
#>

param(
    [Parameter(Mandatory = $true)]
    [int]$Chapter,

    [Parameter(Mandatory = $false)]
    [string]$ForeshadowIds = ""
)

$ErrorActionPreference = "Stop"

# ============================================================
# 路径解析
# ============================================================
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
$chaptersDir = Join-Path $novelDir "chapters"
$constitutionDir = Join-Path $novelDir "constitution"
$charactersDir = Join-Path $constitutionDir "characters"

$chapterPadded = $Chapter.ToString("D3")
$chapterDir = Join-Path $chaptersDir $chapterPadded

if (-not (Test-Path $chapterDir)) {
    New-Item $chapterDir -ItemType Directory -Force | Out-Null
}

$bundlePath = Join-Path $chapterDir "context-bundle.md"
$output = [System.Text.StringBuilder]::new()

if (Test-Path $bundlePath) {
    Remove-Item $bundlePath -Force
    Write-Host "  ⓘ 已删除旧 context-bundle.md，避免复用过期缓存"
}

function Pad3([int]$n) { $n.ToString("D3") }

function AppendSection([System.Text.StringBuilder]$sb, [string]$header, [string]$content) {
    [void]$sb.AppendLine("═══════════════════════════════════════════════════════")
    [void]$sb.AppendLine($header)
    [void]$sb.AppendLine("═══════════════════════════════════════════════════════")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine($content)
    [void]$sb.AppendLine("")
}

Write-Host "构建 context-bundle.md: 第${Chapter}章 → $bundlePath"

# ============================================================
# 1. 宪法核心
# ============================================================

$corePath = Join-Path $constitutionDir "core.md"
$stylePath = Join-Path $constitutionDir "style.md"

if (Test-Path $corePath) {
    $coreContent = Get-Content $corePath -Raw -Encoding UTF8
    AppendSection $output "## 宪法核心 (core.md)" $coreContent
    Write-Host "  ✓ core.md ($(($coreContent -split "`n").Count) 行)"
} else {
    Write-Error "core.md 不存在: $corePath。必须先通过 /novel-constitution 初始化宪法设定。"
    exit 1
}

if (Test-Path $stylePath) {
    $styleContent = Get-Content $stylePath -Raw -Encoding UTF8
    AppendSection $output "## 风格设定 (style.md)" $styleContent
    Write-Host "  ✓ style.md ($(($styleContent -split "`n").Count) 行)"
} else {
    Write-Error "style.md 不存在: $stylePath。必须先通过 /novel-constitution 初始化风格设定。"
    exit 1
}

# ============================================================
# 2. 全局状态
# ============================================================

$statePath = Join-Path $novelDir "state.yaml"
if (Test-Path $statePath) {
    $stateContent = Get-Content $statePath -Raw -Encoding UTF8
    AppendSection $output "## 全局状态 (state.yaml)" $stateContent
    Write-Host "  ✓ state.yaml ($(($stateContent -split "`n").Count) 行)"
} else {
    if ($Chapter -gt 1) {
        Write-Error "致命异常: 第${Chapter}章缺少全局状态！当写作章节 > 1 时，state.yaml 必须存在，否则角色数值、库存和伏笔档案将全部断层。"
        exit 1
    } else {
        Write-Host "  ⓘ state.yaml 不存在（第1章允许无初始状态，将由同步脚本自动生成）"
    }
}

# ============================================================
# 3. 设计稿模板
# ============================================================

if ([string]::IsNullOrEmpty($PSScriptRoot)) {
    $codebuddyDir = Join-Path (Get-Location).Path ".dsh"
} else {
    $codebuddyDir = Split-Path $PSScriptRoot -Parent
}
$templatePath = Join-Path $codebuddyDir "templates" "chapter-design.md"
if (Test-Path $templatePath) {
    $templateContent = Get-Content $templatePath -Raw -Encoding UTF8
    AppendSection $output "## 设计稿模板 (chapter-design.md)" $templateContent
    Write-Host "  ✓ 设计稿模板 ($((($templateContent -split "`n").Count)) 行)"
} else {
    Write-Host "  ⚠ 设计稿模板不存在，跳过"
}

# ============================================================
# 4. 全部角色设定
# ============================================================

if (Test-Path $charactersDir) {
    $charFiles = Get-ChildItem $charactersDir -Filter "*.md" | Sort-Object Name
    $charCount = 0
    $charTotalLines = 0

    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("## 角色设定 (characters/)")
    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("")

    foreach ($file in $charFiles) {
        $charContent = Get-Content $file.FullName -Raw -Encoding UTF8
        $lineCount = ($charContent -split "`n").Count
        [void]$output.AppendLine("### 角色: $($file.BaseName)")
        [void]$output.AppendLine("")
        [void]$output.AppendLine($charContent)
        [void]$output.AppendLine("")
        $charCount++
        $charTotalLines += $lineCount
    }

    Write-Host "  ✓ 角色文件: ${charCount}个 (共${charTotalLines}行)"
} else {
    Write-Host "  ⚠ characters 目录不存在，跳过"
}

$loadedChapters = [System.Collections.Generic.HashSet[int]]::new()

# ============================================================
# 5. 近章完整摘要 (N-2 ~ N-10)
# ============================================================

$nearStart = [math]::Max(1, $Chapter - 10)
$nearEnd = [math]::Max(1, $Chapter - 2)
$nearCount = 0

if ($Chapter -gt 2) {
    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("## 近章完整摘要 (第$(${nearStart})章 ~ 第$(${nearEnd})章)")
    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("")

    for ($i = $nearEnd; $i -ge $nearStart; $i--) {
        $summaryPath = Join-Path $chaptersDir "$(Pad3 $i)" "summary.md"
        if (Test-Path $summaryPath) {
            $summaryContent = Get-Content $summaryPath -Raw -Encoding UTF8
            [void]$output.AppendLine("### 第${i}章 摘要 (完整)")
            [void]$output.AppendLine("")
            [void]$output.AppendLine($summaryContent)
            [void]$output.AppendLine("")
            [void]$loadedChapters.Add($i)
            $nearCount++
        }
    }

    Write-Host "  ✓ 近章摘要: ${nearCount}个 (第${nearStart}-${nearEnd}章)"

    $criticalNearStart = [math]::Max(1, $Chapter - 3)
    $criticalNearEnd = [math]::Max(1, $Chapter - 1)
    $missingSummaries = @()

    for ($i = $criticalNearStart; $i -le $criticalNearEnd; $i++) {
        $checkSummaryPath = Join-Path $chaptersDir "$(Pad3 $i)" "summary.md"
        $checkContentPath = Join-Path $chaptersDir "$(Pad3 $i)" "content.md"
        if ((Test-Path $checkContentPath) -and -not (Test-Path $checkSummaryPath)) {
            $missingSummaries += $i
        }
    }

    if ($missingSummaries.Count -gt 0) {
        $missingList = ($missingSummaries | ForEach-Object { "第${_}章" }) -join "、"
        Write-Error "[RETRY_SUMMARIZER] 近章摘要缺失: ${missingList} 有 content.md 但缺少 summary.md。请先为这些章节补跑摘要（chapter-summarizer + validate-summary + sync-state），否则后续 SubAgent 上下文不完整。"
        exit 1
    }

    $warnNearStart = [math]::Max(1, $Chapter - 10)
    $warnNearEnd = [math]::Max(1, $Chapter - 4)
    $warningSummaries = @()

    for ($i = $warnNearStart; $i -le $warnNearEnd; $i++) {
        $checkSummaryPath = Join-Path $chaptersDir "$(Pad3 $i)" "summary.md"
        $checkContentPath = Join-Path $chaptersDir "$(Pad3 $i)" "content.md"
        if ((Test-Path $checkContentPath) -and -not (Test-Path $checkSummaryPath)) {
            $warningSummaries += $i
        }
    }

    if ($warningSummaries.Count -gt 0) {
        $warningList = ($warningSummaries | ForEach-Object { "第${_}章" }) -join "、"
        Write-Host "  ⚠ WARNING: 近章摘要缺失: ${warningList} 有 content.md 但缺 summary.md，bundle 上下文可能不完整"
    }
}

if ($Chapter -gt 1) {
    [void]$loadedChapters.Add($Chapter - 1)
}
[void]$loadedChapters.Add($Chapter)

# ============================================================
# 6. 远章剧情压缩段 (N-11 ~ N-20)
# ============================================================

$farStart = [math]::Max(1, $Chapter - 20)
$farEnd = [math]::Max(1, $Chapter - 11)
$farCount = 0

if ($Chapter -gt 11) {
    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("## 远章压缩段 (第$(${farStart})章 ~ 第$(${farEnd})章)")
    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("")

    for ($i = $farEnd; $i -ge $farStart; $i--) {
        $summaryPath = Join-Path $chaptersDir "$(Pad3 $i)" "summary.md"
        if (Test-Path $summaryPath) {
            $summaryContent = Get-Content $summaryPath -Raw -Encoding UTF8

            $plotMatch = [regex]::Match($summaryContent, '(?s)(### 剧情[^\n]*\n.+?)(?=\n###|\z)')
            if (-not $plotMatch.Success) {
                $plotMatch = [regex]::Match($summaryContent, '(?s)(## 详细剧情[^\n]*\n.+?)(?=\n##|\z)')
                if (-not $plotMatch.Success) {
                    $plotMatch = [regex]::Match($summaryContent, '(?s)(## 一句话剧情[^\n]*\n.+?)(?=\n##|\z)')
                }
            }
            $plotSection = if ($plotMatch.Success) { $plotMatch.Value } else { "[剧情段未找到]" }

            $detailMatch = [regex]::Match($summaryContent, '(?s)(### 可引用细节[^\n]*\n.+?)(?=\n###|\z)')
            if (-not $detailMatch.Success) {
                $detailMatch = [regex]::Match($summaryContent, '(?s)(## 关键细节[^\n]*\n.+?)(?=\n##|\z)')
            }
            $detailSection = if ($detailMatch.Success) { "`n" + $detailMatch.Value } else { "" }

            [void]$output.AppendLine("### 第${i}章 (压缩)")
            [void]$output.AppendLine("")
            [void]$output.AppendLine($plotSection)
            if ($detailSection) {
                [void]$output.AppendLine($detailSection)
            }
            [void]$output.AppendLine("")

            [void]$loadedChapters.Add($i)
            $farCount++
        }
    }

    Write-Host "  ✓ 远章压缩: ${farCount}个 (第${farStart}-${farEnd}章)"

    $warningFarSummaries = @()
    for ($i = $farStart; $i -le $farEnd; $i++) {
        $checkSummaryPath = Join-Path $chaptersDir "$(Pad3 $i)" "summary.md"
        $checkContentPath = Join-Path $chaptersDir "$(Pad3 $i)" "content.md"
        if ((Test-Path $checkContentPath) -and -not (Test-Path $checkSummaryPath)) {
            $warningFarSummaries += $i
        }
    }

    if ($warningFarSummaries.Count -gt 0) {
        $warningFarList = ($warningFarSummaries | ForEach-Object { "第${_}章" }) -join "、"
        Write-Host "  ⚠ WARNING: 远章摘要缺失: ${warningFarList} 有 content.md 但缺 summary.md"
    }
}

# ============================================================
# 6.5 远期记忆索引 (第1章 ~ 第N-21章，来自 state/memory-digest.md)
#     🔴 补齐"记忆窗口只到 N-20"的失忆区：老桥段复用、早期专名、未回收伏笔
# ============================================================

$memFullChapters = 40   # 远期索引中保留完整一句话的章数（自 N-21 向前）
$memOldCharLimit = 30   # 更早章节每章截断字数
$memLexiconMax = 150    # 词表最多嵌入条数（取最近出现的）

$memConfigPath = Join-Path $codebuddyDir "config.yaml"
if (Test-Path $memConfigPath) {
    $memConfigText = Get-Content $memConfigPath -Raw -Encoding UTF8
    if ($memConfigText -match '(?m)^\s*farIndexFullChapters:\s*(\d+)') { $memFullChapters = [int]$Matches[1] }
    if ($memConfigText -match '(?m)^\s*oldIndexCharLimit:\s*(\d+)') { $memOldCharLimit = [int]$Matches[1] }
    if ($memConfigText -match '(?m)^\s*lexiconMaxEntries:\s*(\d+)') { $memLexiconMax = [int]$Matches[1] }
}

$digestPath = Join-Path $novelDir "state" "memory-digest.md"
$digestScript = Join-Path $PSScriptRoot "build-memory-digest.ps1"

if ($Chapter -gt 1 -and (Test-Path $digestScript)) {
    try {
        & $digestScript -UpTo ($Chapter - 1) -ProjectRoot $projectRoot | Out-Null
    } catch {
        Write-Host "  ⚠ 长期记忆摘录刷新失败（不阻断）: $($_.Exception.Message)"
    }
}

$farMemEnd = $Chapter - 21

if ($farMemEnd -ge 1 -and (Test-Path $digestPath)) {
    $digestRaw = Get-Content $digestPath -Raw -Encoding UTF8
    $memGist = @()
    $memLex = @()

    foreach ($line in ($digestRaw -split "`r?`n")) {
        $mg = [regex]::Match($line, '^- 第(\d+)章：(.*)$')
        if ($mg.Success) {
            $cn = [int]$mg.Groups[1].Value
            if ($cn -le $farMemEnd) { $memGist += [pscustomobject]@{ ch = $cn; text = $mg.Groups[2].Value } }
            continue
        }
        $ml = [regex]::Match($line, '^- \[第(\d+)章\]\s*(.+)$')
        if ($ml.Success) {
            $lexCh = [int]$ml.Groups[1].Value
            # 🔴 只嵌入远期词条：N-20 以内的细节已由近章/远章摘要原文覆盖，避免重复占位
            if ($lexCh -le $farMemEnd) { $memLex += [pscustomobject]@{ ch = $lexCh; text = $ml.Groups[2].Value } }
            continue
        }
    }

    if ($memGist.Count -gt 0 -or $memLex.Count -gt 0) {
        [void]$output.AppendLine("═══════════════════════════════════════════════════════")
        [void]$output.AppendLine("## 远期记忆索引 (第1章 ~ 第${farMemEnd}章，分层压缩)")
        [void]$output.AppendLine("═══════════════════════════════════════════════════════")
        [void]$output.AppendLine("")
        [void]$output.AppendLine("🔴 用途：避免重复用老桥段、避免伏笔遗忘、避免早期专名写错。需要细节时回读对应章 summary.md。")
        [void]$output.AppendLine("")

        $fullFrom = [math]::Max(1, $farMemEnd - $memFullChapters + 1)

        [void]$output.AppendLine("### 逐章剧情索引")
        [void]$output.AppendLine("")
        foreach ($g in ($memGist | Sort-Object ch)) {
            $t = $g.text
            if ($g.ch -lt $fullFrom -and $t.Length -gt $memOldCharLimit) {
                $t = $t.Substring(0, $memOldCharLimit) + "…"
            }
            [void]$output.AppendLine("- 第$($g.ch)章：$t")
        }
        [void]$output.AppendLine("")

        if ($memLex.Count -gt 0) {
            $lexPick = $memLex | Sort-Object ch
            if ($lexPick.Count -gt $memLexiconMax) {
                $lexPick = $lexPick | Select-Object -Last $memLexiconMax
            }
            [void]$output.AppendLine("### 专名/细节词表 (原样引用，禁止改写)")
            [void]$output.AppendLine("")
            foreach ($l in $lexPick) {
                [void]$output.AppendLine("- [第$($l.ch)章] $($l.text)")
            }
            [void]$output.AppendLine("")
        }

        [void]$output.AppendLine("> 全书伏笔台账（含已回收/未回收全量）见 novel/state/memory-digest.md 第三节；活跃伏笔以 state.yaml 为准。")
        [void]$output.AppendLine("")

        $lexEmbedded = [math]::Min($memLex.Count, $memLexiconMax)
        Write-Host "  ✓ 远期记忆索引: 剧情$($memGist.Count)条 / 词表${lexEmbedded}条 (第1-${farMemEnd}章)"
    }
} elseif ($farMemEnd -ge 1) {
    Write-Host "  ⚠ 未找到 state/memory-digest.md，远期记忆索引跳过（可执行 build-memory-digest.ps1 -Rebuild 重建）"
} else {
    Write-Host "  ⓘ 第${Chapter}章尚无远期记忆区（近章+远章窗口已覆盖全部前文），跳过"
}

# ============================================================
# 7. 伏笔关联摘要（去重）
# ============================================================

if ($ForeshadowIds -and $ForeshadowIds.Trim() -ne "") {
    $fsIds = $ForeshadowIds -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

    if ($fsIds.Count -gt 0 -and (Test-Path $statePath)) {
        $stateRaw = Get-Content $statePath -Raw -Encoding UTF8
        $fsChapters = @()

        foreach ($fsId in $fsIds) {
            $escapedFsId = [regex]::Escape($fsId)
            $plantedMatch = [regex]::Match($stateRaw, "(?ms)^[ \t-]*id:\s*${escapedFsId}\s*$.*?^[ \t]*planted:\s*(\d+)\s*$")
            $plantedChapter = $null

            if ($plantedMatch.Success) {
                $plantedChapter = [int]$plantedMatch.Groups[1].Value
            } elseif ($fsId -match '^F-(\d+)-\d+$') {
                $plantedChapter = [int]$Matches[1]
            }

            if ($null -ne $plantedChapter -and -not $loadedChapters.Contains($plantedChapter)) {
                $fsChapters += $plantedChapter
                [void]$loadedChapters.Add($plantedChapter)
            }
        }

        if ($fsChapters.Count -gt 0) {
            [void]$output.AppendLine("═══════════════════════════════════════════════════════")
            [void]$output.AppendLine("## 伏笔关联摘要 (去重后)")
            [void]$output.AppendLine("═══════════════════════════════════════════════════════")
            [void]$output.AppendLine("")

            $fsLoaded = 0
            foreach ($fc in $fsChapters | Sort-Object) {
                $summaryPath = Join-Path $chaptersDir "$(Pad3 $fc)" "summary.md"
                if (Test-Path $summaryPath) {
                    $summaryContent = Get-Content $summaryPath -Raw -Encoding UTF8
                    [void]$output.AppendLine("### 第${fc}章 摘要 (伏笔关联 - 完整)")
                    [void]$output.AppendLine("")
                    [void]$output.AppendLine($summaryContent)
                    [void]$output.AppendLine("")
                    $fsLoaded++
                }
            }
            Write-Host "  ✓ 伏笔关联摘要: ${fsLoaded}个"
        } else {
            Write-Host "  ✓ 伏笔关联: 所有埋设章节已在近/远章中加载，无需额外加载"
        }
    }
} else {
    Write-Host "  ⓘ 无伏笔 ID 传入，跳过伏笔关联加载"
}

# ============================================================
# 8. 本章设计稿（如已存在）
# ============================================================

$designPath = Join-Path $chapterDir "design.md"
if (Test-Path $designPath) {
    $designContent = Get-Content $designPath -Raw -Encoding UTF8
    AppendSection $output "## 本章设计稿 (design.md)" $designContent
    $designLines = ($designContent -split "`n").Count
    Write-Host "  ✓ design.md ($designLines 行)"
} else {
    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("## 本章设计稿 (design.md)")
    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("")
    [void]$output.AppendLine("[设计稿尚未生成，batch-designer 将在本次调用中生成]")
    [void]$output.AppendLine("")
    Write-Host "  ⓘ design.md 尚未生成，标记为待生成"
}

# ============================================================
# 9. 上一章全文 (content.md)
# ============================================================

if ($Chapter -gt 1) {
    $prevChapterPadded = ($Chapter - 1).ToString("D3")
    $prevContentPath = Join-Path $chaptersDir $prevChapterPadded "content.md"
    if (Test-Path $prevContentPath) {
        $prevContent = Get-Content $prevContentPath -Raw -Encoding UTF8
        AppendSection $output "## 上一章全文 (第$($Chapter - 1)章 content.md)" $prevContent
        $prevLines = ($prevContent -split "`n").Count
        Write-Host "  ✓ 上一章 content.md ($prevLines 行)"
    } else {
        Write-Error "[RETRY_WRITER] 上一章全文缺失: 第$($Chapter - 1)章 content.md 不存在（路径: $prevContentPath）。没有上一章全文，设计稿和正文无法衔接。请先完成第$($Chapter - 1)章的写作流水线。"
        exit 1
    }
} else {
    Write-Host "  ⓘ 第1章无上一章全文，跳过"
}

# ============================================================
# 写入 bundle 文件
# ============================================================

$header = @"
# Context Bundle — 第${Chapter}章
# 自动生成于 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# 🔴 此文件由脚本自动合并，主要用于减少 SubAgent 的重复读文件成本
# 🔴 包含: 宪法(core+style) + 全局状态 + 设计稿模板 + 全部角色 + 近章摘要 + 远章压缩 + 远期记忆索引 + 伏笔关联 + 本章设计稿 + 上一章全文
# 🔴 记忆分层: N-2~N-10 完整摘要 / N-11~N-20 压缩段 / 1~N-21 远期索引(逐章一句话 + 专名词表)
# 🔴 全书伏笔台账（埋设→回收全量）见 novel/state/memory-digest.md
# 🔴 batch-designer / continuity-validator 会自行直读 outline.md 全文
# 🔴 此文件在每章流水线结束后自动删除

"@

$finalContent = $header + $output.ToString()

Set-Content $bundlePath $finalContent -Encoding UTF8 -NoNewline

$sizeKB = [math]::Round((Get-Item $bundlePath).Length / 1024, 1)
$lineCount = ($finalContent -split "`n").Count

Write-Host ""
Write-Host "✓ context-bundle.md 已生成"
Write-Host "  路径: $bundlePath"
Write-Host "  大小: ${sizeKB} KB"
Write-Host "  行数: ${lineCount}"
Write-Host "  包含章节: $(($loadedChapters | Sort-Object) -join ', ')"
if ($sizeKB -gt 120) {
    Write-Host "  ⚠ bundle 体积超过 120 KB，建议关注角色设定/摘要膨胀"
}
