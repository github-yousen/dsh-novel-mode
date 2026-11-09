<#
.SYNOPSIS
    计算全书风格指纹基准值，默认以前10章正文建立固定基准，写入 state.yaml 的 styleFingerprint 部分
.PARAMETER InputDir
    章节目录（默认 novel/chapters）
.PARAMETER Output
    state.yaml 路径（默认 novel/state.yaml）
.PARAMETER StartChapter
    风格基准采样起始章（默认 1）
.PARAMETER EndChapter
    风格基准采样结束章（默认 10）
.EXAMPLE
    pwsh -NoProfile -File .dsh/scripts/compute-style.ps1
#>

param(
    [string]$InputDir,
    [string]$Output,
    [int]$StartChapter = 1,
    [int]$EndChapter = 10,
    [switch]$Rebuild    # 显式声明"重建基准"（覆盖已有基准），用于修正历史遗留的坏基准
)

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
if (-not $InputDir) { $InputDir = Join-Path $novelDir "chapters" }
if (-not $Output) { $Output = Join-Path $novelDir "state.yaml" }

# 段落节奏公共库（基线体检用）
$script:ParaLibLoaded = $false
if (-not [string]::IsNullOrEmpty($PSScriptRoot)) {
    $paraLib = Join-Path $PSScriptRoot "lib/paragraph-metrics.ps1"
    if (Test-Path $paraLib) { . $paraLib; $script:ParaLibLoaded = $true }
}

if ($EndChapter -lt $StartChapter) {
    Write-Error "EndChapter 必须大于或等于 StartChapter"
    exit 1
}

function Count-ChineseChars {
    <# 统计中文字符数（含汉字和中文标点） #>
    param([string]$Text)
    return ([regex]::Matches($Text, '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2018-\u201f\u2026\u2014\u2013]')).Count
}

# 收集指定范围内的章节正文（跳过标题行）
$allTexts = @()
$sampledChapters = @()
$missingChapters = @()
for ($chapterNum = $StartChapter; $chapterNum -le $EndChapter; $chapterNum++) {
    $chapDir = Join-Path $InputDir ("{0:D3}" -f $chapterNum)
    $contentFile = Join-Path $chapDir "content.md"

    if (-not (Test-Path $contentFile)) {
        $missingChapters += $chapterNum
        continue
    }

    $content = Get-Content $contentFile -Raw -Encoding UTF8
    $bodyLines = $content -split "`n"
    $bodyText = ($bodyLines | Select-Object -Skip 1) -join "`n"
    if ([string]::IsNullOrWhiteSpace($bodyText)) {
        $bodyText = $content
    }

    if ([string]::IsNullOrWhiteSpace($bodyText)) {
        $missingChapters += $chapterNum
        continue
    }

    $allTexts += $bodyText
    $sampledChapters += $chapterNum
}

if ($allTexts.Count -eq 0) {
    Write-Host "在第${StartChapter}章到第${EndChapter}章范围内未找到可用正文，跳过风格指纹计算"
    exit 0
}

# 合并正文计算统计
$fullText = $allTexts -join "`n"
$totalChars = Count-ChineseChars $fullText

# 分句
$sentences = $fullText -split '[。！？…]+' | Where-Object { $_.Trim() -ne '' }
$sentenceLens = $sentences | ForEach-Object { Count-ChineseChars $_ } | Where-Object { $_ -gt 0 }
$avgSentenceLen = if ($sentenceLens.Count -gt 0) {
    [math]::Round(($sentenceLens | Measure-Object -Average).Average, 1)
} else { 0 }

# 对话占比（仅匹配中文双引号 “”）
$dialogueMatches = [regex]::Matches($fullText, '[“][^”]*[”]')
$dialogueChars = 0
foreach ($m in $dialogueMatches) { $dialogueChars += Count-ChineseChars $m.Value }
$dialogueRatio = if ($totalChars -gt 0) { [math]::Round($dialogueChars / $totalChars, 3) } else { 0 }

# 段落长度（智能分段：先双换行，若结果不合理则降级单换行）
$paragraphs = ($fullText -split '\r?\n\s*\r?\n') | Where-Object { $_.Trim() -ne '' }
if ($paragraphs.Count -le 1) {
    $paragraphs = ($fullText -split '\r?\n') | Where-Object { $_.Trim() -ne '' }
} else {
    # 双换行分段成功，但检查平均段落长度是否合理（>300字说明书稿实际用单换行分段）
    $checkLens = $paragraphs | ForEach-Object { Count-ChineseChars $_ } | Where-Object { $_ -gt 0 }
    $checkAvg = if ($checkLens.Count -gt 0) { ($checkLens | Measure-Object -Average).Average } else { 0 }
    if ($checkAvg -gt 300) {
        $paragraphs = ($fullText -split '\r?\n') | Where-Object { $_.Trim() -ne '' }
    }
}
$paraLens = $paragraphs | ForEach-Object { Count-ChineseChars $_ } | Where-Object { $_ -gt 0 }
$avgParagraphLen = if ($paraLens.Count -gt 0) {
    [math]::Round(($paraLens | Measure-Object -Average).Average, 1)
} else { 0 }

# 标点频率
$exclamations = ([regex]::Matches($fullText, '[！!]')).Count
$exclamationRate = if ($totalChars -gt 0) { [math]::Round($exclamations / $totalChars, 4) } else { 0 }

# ============================================================
# 基线体检（🔴 关键：不能把"碎"的章节锁成全书基准）
# 只在样本节奏落在人类成书区间时才认为基准健康
# ============================================================
$bandMetrics = $null
$bandIssues = @()
$baselineHealthy = $true
if ($script:ParaLibLoaded) {
    $bandMetrics = Get-ParagraphMetrics -Text $fullText
    $bandIssues = @(Get-ParagraphBandIssues -Metrics $bandMetrics)
    if ($bandIssues.Count -gt 0) { $baselineHealthy = $false }
}

$p50Para = if ($bandMetrics) { $bandMetrics.MedianParagraphLen } else { $avgParagraphLen }
$p75Para = if ($bandMetrics) { $bandMetrics.P75ParagraphLen } else { $avgParagraphLen }
$shortParaPct = if ($bandMetrics) { $bandMetrics.ShortParaPct } else { 0 }
$longParaPct = if ($bandMetrics) { $bandMetrics.LongParaPct } else { 0 }
$p50Sent = if ($bandMetrics) { $bandMetrics.MedianSentenceLen } else { $avgSentenceLen }

$sampledLabel = ($sampledChapters | ForEach-Object { "第${_}章" }) -join '、'
Write-Host "风格指纹计算完成（固定基准模式：前10章）"
Write-Host "  目标范围: 第${StartChapter}章 ~ 第${EndChapter}章"
Write-Host "  实际采样: $sampledLabel"
if ($missingChapters.Count -gt 0) {
    Write-Host "  缺失章节: $((($missingChapters | ForEach-Object { "第${_}章" }) -join '、'))"
}
Write-Host "  基于 $($allTexts.Count) 章, $totalChars 字"
Write-Host "  平均句长: $avgSentenceLen (中位 $p50Sent)"
Write-Host "  对话占比: $dialogueRatio"
Write-Host "  平均段落: $avgParagraphLen (P50 $p50Para / P75 $p75Para)"
Write-Host "  极短段(<12字): $shortParaPct% | 超长段(>=60字): $longParaPct%"
Write-Host "  叹号频率: $exclamationRate"

if (-not $script:ParaLibLoaded) {
    Write-Host "  ⚠ 段落节奏库未加载，跳过基线体检（基准健康状态标记为未知）" -ForegroundColor Yellow
    $baselineHealthy = $true
} elseif (-not $baselineHealthy) {
    Write-Host ""
    Write-Host "  ⚠⚠⚠ 基线体检未通过：采样章节的段落节奏偏离人类成书区间 ⚠⚠⚠" -ForegroundColor Yellow
    foreach ($bi in $bandIssues) { Write-Host "      [$($bi.Severity)] $($bi.Message)" -ForegroundColor Yellow }
    Write-Host "      → 这套指纹一旦锁为全书母本，后续每章都会被要求'保持一致'，把问题固化下去。" -ForegroundColor Yellow
    Write-Host "      → 建议：先按 validate-chapter.ps1 检测 5.5 的建议修正前 ${EndChapter} 章的句子长度，再重新执行本脚本。" -ForegroundColor Yellow
    Write-Host "      → 已按原样写入，但标记 baselineHealthy: false。前 30 章内可用 -Rebuild 重建修正。" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ 基线体检通过：采样节奏落在人类成书区间" -ForegroundColor Green
}

# ============================================================
# 写入或更新 state.yaml
# ============================================================
$healthyStr = if ($baselineHealthy) { "true" } else { "false" }
$fpLines = @(
    "styleFingerprint:",
    "  avgSentenceLen: $avgSentenceLen",
    "  dialogueRatio: $dialogueRatio",
    "  avgParagraphLen: $avgParagraphLen",
    "  exclamationRate: $exclamationRate",
    "  basedOnChapters: $($allTexts.Count)",
    "  baselineMode: fixed_first_10",
    "  baselineStartChapter: $StartChapter",
    "  baselineEndChapter: $EndChapter",
    "  medianSentenceLen: $p50Sent",
    "  medianParagraphLen: $p50Para",
    "  p75ParagraphLen: $p75Para",
    "  shortParaPct: $shortParaPct",
    "  longParaPct: $longParaPct",
    "  baselineHealthy: $healthyStr"
)

if ($Rebuild) {
    Write-Host "  ⓘ -Rebuild 已指定：本次结果将覆盖既有基准（用于修正历史坏基准）" -ForegroundColor Cyan
}

if (Test-Path $Output) {
    # 结构化更新：逐行读取，替换 styleFingerprint 段
    $lines = Get-Content $Output -Encoding UTF8
    $newLines = [System.Collections.ArrayList]::new()
    $inFpSection = $false
    foreach ($line in $lines) {
        if ($line -match '^styleFingerprint:') {
            $inFpSection = $true
            continue  # 跳过旧段落头
        }
        if ($inFpSection) {
            if ($line -match '^\S' -or $line -eq '') {
                # 遇到下一个顶层字段或空行，结束跳过
                if ($line -ne '') { $inFpSection = $false }
                else { continue }
            } else {
                continue  # 跳过旧段落的缩进行
            }
        }
        [void]$newLines.Add($line)
    }
    # 在末尾追加新的 styleFingerprint 段
    foreach ($l in $fpLines) { [void]$newLines.Add($l) }
    Set-Content $Output ($newLines -join "`n") -Encoding UTF8 -NoNewline
} else {
    Set-Content $Output (($fpLines -join "`n") + "`n") -Encoding UTF8
}

Write-Host "已写入: $Output"
