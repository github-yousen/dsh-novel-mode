<#
.SYNOPSIS
    章节摘要验证脚本 — 校验 summary.md 的结构、格式和关键约束
.PARAMETER Chapter
    章节号（数字）
.EXAMPLE
    pwsh -NoProfile -File .dsh/scripts/validate-summary.ps1 -Chapter 15
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
$charsDir = Join-Path $novelDir "constitution/characters"
$chapDir = Join-Path $novelDir "chapters" ("{0:D3}" -f $Chapter)
$summaryPath = Join-Path $chapDir "summary.md"

function Count-ChineseChars {
    param([string]$Text)
    return ([regex]::Matches($Text, '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2018-\u201f\u2026\u2014\u2013]')).Count
}

function Get-SectionText {
    param(
        [string]$Text,
        [string]$Heading
    )
    $m = [regex]::Match($Text, "(?s)$([regex]::Escape($Heading))\s*\n(.*?)(?=\n###|\z)")
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
    return $null
}

function Get-NonEmptyLines {
    param([string]$Text)
    if ($null -eq $Text) { return @() }
    return @($Text -split "`n" | Where-Object { $_.ToString().Trim() -ne '' })
}

$issues = @()


if (-not (Test-Path $summaryPath)) {
    $issues += @{ level = "ERROR"; check = "文件"; message = "摘要文件不存在: $summaryPath" }
    @{ chapter = $Chapter; status = "FAIL"; summary = @{ error = 1; warning = 0 }; issues = $issues } | ConvertTo-Json -Depth 5
    exit 0
}

$summaryRaw = Get-Content $summaryPath -Raw -Encoding UTF8
$registeredChars = @()
if (Test-Path $charsDir) {
    $registeredChars = Get-ChildItem $charsDir -Filter "*.md" | Where-Object { $_.Name -ne '_template.md' } | ForEach-Object { $_.BaseName }
}

$requiredSections = @(
    '### 剧情',
    '### 剧情详述',
    '### 角色状态',
    '### 伏笔',
    '### 时间线',
    '### 可引用细节',
    '### 世界资产变更'
)

foreach ($sec in $requiredSections) {
    if ($summaryRaw -notmatch [regex]::Escape($sec)) {
        $issues += @{ level = "ERROR"; check = "结构"; message = "缺少必要段落: $sec" }
    }
}

$plotText = Get-SectionText -Text $summaryRaw -Heading '### 剧情'
if ($null -ne $plotText) {
    $plotChars = Count-ChineseChars $plotText
    if ($plotChars -gt 100) {
        $issues += @{ level = "ERROR"; check = "剧情"; message = "剧情部分超出限制: ${plotChars}/100" }
    } elseif ($plotChars -eq 0) {
        $issues += @{ level = "ERROR"; check = "剧情"; message = "剧情部分为空" }
    }
    if ($plotText -match '\[[^\]]+\]') {
        $issues += @{ level = "ERROR"; check = "剧情"; message = "剧情部分仍含模板占位符" }
    }
}

$detailText = Get-SectionText -Text $summaryRaw -Heading '### 剧情详述'
if ($null -ne $detailText) {
    $detailChars = Count-ChineseChars $detailText
    if ($detailChars -gt 500) {
        $issues += @{ level = "ERROR"; check = "剧情详述"; message = "剧情详述超出限制: ${detailChars}/500" }
    } elseif ($detailChars -eq 0) {
        $issues += @{ level = "ERROR"; check = "剧情详述"; message = "剧情详述为空" }
    }
    if ($detailText -match '\[[^\]]+\]') {
        $issues += @{ level = "ERROR"; check = "剧情详述"; message = "剧情详述仍含模板占位符" }
    }
}

$charText = Get-SectionText -Text $summaryRaw -Heading '### 角色状态'
if ($null -ne $charText) {
    $charLines = Get-NonEmptyLines $charText
    $validCharLines = 0
    foreach ($line in $charLines) {
        $trimmed = $line.ToString().Trim()
        if ($trimmed -eq '无' -or $trimmed -eq '- 无') { continue }
        if ($trimmed -notmatch '^- (.+?):\s*位置=(.+?),\s*状态=(.+)$') {
            $issues += @{ level = "ERROR"; check = "角色状态"; message = "角色状态格式错误: $trimmed" }
            continue
        }

        $charName = ($Matches[1].Trim() -replace '[*`_]', '').Trim()
        $location = $Matches[2].Trim()
        $statusVal = $Matches[3].Trim()
        $validCharLines++

        if ($charName -match '\[[^\]]+\]' -or $location -match '\[[^\]]+\]' -or $statusVal -match '\[[^\]]+\]') {
            $issues += @{ level = "ERROR"; check = "角色状态"; message = "角色状态仍含模板占位符: $trimmed" }
        }
        if ($location -match ',') {
            $issues += @{ level = "ERROR"; check = "角色状态"; message = "角色位置中禁止使用英文逗号: $trimmed" }
        }
        if ($registeredChars.Count -gt 0 -and $charName -notin $registeredChars) {
            $issues += @{ level = "ERROR"; check = "角色状态"; message = "角色未在 constitution/characters 中建档: $charName" }
        }
    }

    if ($charLines.Count -gt 0 -and $validCharLines -eq 0 -and ($charLines -join "\n") -notmatch '(^|\n)\s*-?\s*无\s*($|\n)') {
        $issues += @{ level = "ERROR"; check = "角色状态"; message = "角色状态段未提供任何可解析条目" }
    }
}

$foreshadowText = Get-SectionText -Text $summaryRaw -Heading '### 伏笔'
if ($null -ne $foreshadowText) {
    $fsLines = Get-NonEmptyLines $foreshadowText
    foreach ($line in $fsLines) {
        $trimmed = $line.ToString().Trim()
        if ($trimmed -eq '无' -or $trimmed -eq '- 无') { continue }
        if ($trimmed -notmatch '^- (新埋|回收):') {
            $issues += @{ level = "ERROR"; check = "伏笔"; message = "伏笔段格式错误: $trimmed" }
            continue
        }
        $ids = [regex]::Matches($trimmed, 'F-\d+(?:-\d+)?') | ForEach-Object { $_.Value }
        foreach ($fid in $ids) {
            if ($fid -notmatch '^F-\d+-\d+$') {
                $issues += @{ level = "WARNING"; check = "伏笔"; message = "检测到旧格式或非标准伏笔 ID: $fid" }
            }
        }
        if ($trimmed -match '\[[^F][^\]]*\]') {
            $issues += @{ level = "ERROR"; check = "伏笔"; message = "伏笔段仍含模板占位符: $trimmed" }
        }
    }
}

$timeMatch = [regex]::Match($summaryRaw, '### 时间线\s*\n[-\s]*(.+)')
$timelineLine = if ($timeMatch.Success) { $timeMatch.Groups[1].Value.Trim() } else { '' }

if ([string]::IsNullOrWhiteSpace($timelineLine)) {
    $issues += @{ level = "ERROR"; check = "时间线"; message = "时间线为空" }
}
if ($timelineLine -match '未提取到|\[[^\]]+\]') {
    $issues += @{ level = "ERROR"; check = "时间线"; message = "时间线仍为占位或未提取状态" }
}

$detailRefText = Get-SectionText -Text $summaryRaw -Heading '### 可引用细节'
if ($null -ne $detailRefText) {
    $detailLines = Get-NonEmptyLines $detailRefText
    $refCount = 0
    foreach ($line in $detailLines) {
        $trimmed = $line.ToString().Trim()
        if ($trimmed -eq '无' -or $trimmed -eq '- 无') { continue }
        if ($trimmed -notmatch '^- ') {
            $issues += @{ level = "ERROR"; check = "可引用细节"; message = "可引用细节格式错误: $trimmed" }
            continue
        }
        $refBody = $trimmed.Substring(2).Trim()
        $refCount++
        if ((Count-ChineseChars $refBody) -gt 20) {
            $issues += @{ level = "ERROR"; check = "可引用细节"; message = "可引用细节超长（>20字）: $refBody" }
        }
        if ($refBody -match '\[[^\]]+\]') {
            $issues += @{ level = "ERROR"; check = "可引用细节"; message = "可引用细节仍含模板占位符: $refBody" }
        }
    }
    if ($refCount -gt 5) {
        $issues += @{ level = "ERROR"; check = "可引用细节"; message = "可引用细节条数超出限制: ${refCount}/5" }
    }
}

$assetText = Get-SectionText -Text $summaryRaw -Heading '### 世界资产变更'
if ($null -ne $assetText) {
    $assetLines = Get-NonEmptyLines $assetText
    foreach ($line in $assetLines) {
        $trimmed = $line.ToString().Trim()
        if ($trimmed -eq '无' -or $trimmed -eq '- 无') { continue }
        if ($trimmed -notmatch '^- .+?: .+$') {
            $issues += @{ level = "ERROR"; check = "世界资产变更"; message = "世界资产格式错误: $trimmed" }
            continue
        }
        if ($trimmed -match '\[[^\]]+\]') {
            $issues += @{ level = "ERROR"; check = "世界资产变更"; message = "世界资产段仍含模板占位符: $trimmed" }
        }
    }
}

$errors = ($issues | Where-Object { $_.level -eq 'ERROR' }).Count
$warnings = ($issues | Where-Object { $_.level -eq 'WARNING' }).Count
$status = if ($errors -gt 0) { 'FAIL' } elseif ($warnings -gt 0) { 'WARN' } else { 'PASS' }

@{
    chapter = $Chapter
    status = $status
    summary = @{ error = $errors; warning = $warnings }
    issues = $issues
} | ConvertTo-Json -Depth 5
