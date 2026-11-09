    <#
.SYNOPSIS
    章节拆分/归集脚本 — 将书稿整理为标准目录结构
.DESCRIPTION
    在进程外执行，不占用主会话上下文。
    支持两种模式：
    - 单文件模式（-InputFile）：按章节标记正则拆分
    - 多文件模式（-InputDir）：按文件名排序复制归集
    输出 JSON 格式的统计结果，供命令解析。
.PARAMETER InputFile
    单文件书稿路径（支持 .txt / .md），与 InputDir 二选一
.PARAMETER InputDir
    多文件书稿目录（每章一个文件），与 InputFile 二选一
.PARAMETER OutputDir
    输出目录，章节写入 OutputDir/[NNN]/content.md
.PARAMETER Encoding
    文件编码，默认 UTF8
.EXAMPLE
    pwsh -File .dsh/scripts/split-chapters.ps1 -InputFile "稿件.txt" -OutputDir "novel/chapters"
    pwsh -File .dsh/scripts/split-chapters.ps1 -InputDir "书稿目录/" -OutputDir "novel/chapters"
#>

param(
    [string]$InputFile,
    [string]$InputDir,

    [Parameter(Mandatory=$true)]
    [string]$OutputDir,

    [string]$Encoding = "UTF8"
)

$ErrorActionPreference = "Stop"

# ── 参数校验 ──
if (-not $InputFile -and -not $InputDir) {
    @{ success = $false; error = "必须提供 -InputFile 或 -InputDir 参数之一" } | ConvertTo-Json -Depth 5
    exit 1
}
if ($InputFile -and $InputDir) {
    @{ success = $false; error = "-InputFile 和 -InputDir 不能同时使用" } | ConvertTo-Json -Depth 5
    exit 1
}

# ── 创建输出目录 ──
if (-not (Test-Path $OutputDir)) {
    New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null
}

function Count-CJKChars {
    param([string]$Text)
    return ([regex]::Matches($Text, '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]')).Count
}

# ================================================================
# 模式B：多文件归集
# ================================================================

if ($InputDir) {
    if (-not (Test-Path $InputDir)) {
        @{ success = $false; error = "目录不存在: $InputDir" } | ConvertTo-Json -Depth 5
        exit 1
    }

     # 支持所有文件类型（.txt / .md / 无扩展名），按文件名自然排序，排除设定文档
     $files = Get-ChildItem $InputDir -File -Recurse |
                 Where-Object { $_.Name -notmatch '^(设定|简介|大纲|readme)' } |
                 Sort-Object { [regex]::Match($_.BaseName, '\d+').Value -as [int] }, Name

    if ($files.Count -eq 0) {
        @{ success = $false; error = "目录中未找到 .txt 或 .md 文件: $InputDir" } | ConvertTo-Json -Depth 5
        exit 1
    }

    $chapters = @()
    $totalChars = 0

    for ($i = 0; $i -lt $files.Count; $i++) {
        $chapterNum = $i + 1
        $chapterDir = Join-Path $OutputDir ("{0:D3}" -f $chapterNum)

        if (-not (Test-Path $chapterDir)) {
            New-Item -Path $chapterDir -ItemType Directory -Force | Out-Null
        }

        $outputPath = Join-Path $chapterDir "content.md"
        # 直接复制文件内容，主流程不接触
        Copy-Item -Path $files[$i].FullName -Destination $outputPath -Force

        # 统计字数
        $text = Get-Content $files[$i].FullName -Raw -Encoding $Encoding
        $charCount = Count-CJKChars $text

        $totalChars += $charCount
        $chapters += @{
            number    = $chapterNum
            title     = $files[$i].BaseName
            charCount = $charCount
            file      = $outputPath
            source    = $files[$i].FullName
        }
    }

    @{
        success       = $true
        mode          = "multi-file"
        inputDir      = $InputDir
        totalChapters = $chapters.Count
        totalChars    = $totalChars
        prologue      = $null
        chapters      = $chapters
    } | ConvertTo-Json -Depth 5
    exit 0
}

# ================================================================
# 模式A：单文件拆分
# ================================================================

if (-not (Test-Path $InputFile)) {
    @{ success = $false; error = "文件不存在: $InputFile" } | ConvertTo-Json -Depth 5
    exit 1
}

$content = Get-Content -Path $InputFile -Raw -Encoding $Encoding

if ([string]::IsNullOrWhiteSpace($content)) {
    @{ success = $false; error = "文件内容为空: $InputFile" } | ConvertTo-Json -Depth 5
    exit 1
}

# ── 章节标记正则 ──
$chapterPatterns = @(
    '(?m)^#{1,3}\s*第[零一二三四五六七八九十百千万\d]+章',   # Markdown 标题 + 中文
    '(?m)^第[零一二三四五六七八九十百千万\d]+章',             # 纯中文章节号
    '(?m)^#{1,3}\s*Chapter\s+\d+',                          # Markdown + English
    '(?m)^Chapter\s+\d+',                                    # 纯英文
    '(?m)^CHAPTER\s+\d+'                                     # 大写英文
)

# ── 尝试匹配最佳模式 ──
$bestPattern = $null
$bestMatches = $null
$bestCount = 0

foreach ($pattern in $chapterPatterns) {
    $regexMatches = [regex]::Matches($content, $pattern)
    if ($regexMatches.Count -gt $bestCount) {
        $bestCount = $regexMatches.Count
        $bestPattern = $pattern
        $bestMatches = $regexMatches
    }
}

if ($bestCount -eq 0) {
    @{
        success = $false
        error   = "未识别到章节标记。支持的格式: 第X章 / Chapter X / # 第X章"
        hint    = "如果书稿是多文件格式（每章一个文件），请使用 -InputDir 参数。"
    } | ConvertTo-Json -Depth 5
    exit 1
}

# ── 拆分章节 ──
$chapters = @()
$totalChars = 0

for ($i = 0; $i -lt $bestMatches.Count; $i++) {
    $startIdx = $bestMatches[$i].Index

    if ($i -lt $bestMatches.Count - 1) {
        $endIdx = $bestMatches[$i + 1].Index
    } else {
        $endIdx = $content.Length
    }

    $chapterContent = $content.Substring($startIdx, $endIdx - $startIdx).Trim()

    $titleLine = ($chapterContent -split "`n")[0].Trim()
    $titleLine = $titleLine -replace '^#+\s*', ''

    $chapterNum = $i + 1
    $chapterDir = Join-Path $OutputDir ("{0:D3}" -f $chapterNum)

    if (-not (Test-Path $chapterDir)) {
        New-Item -Path $chapterDir -ItemType Directory -Force | Out-Null
    }

    $outputPath = Join-Path $chapterDir "content.md"
    $chapterContent | Set-Content -Path $outputPath -Encoding UTF8 -NoNewline

    $chineseChars = Count-CJKChars $chapterContent
    $totalChars += $chineseChars

    $chapters += @{
        number    = $chapterNum
        title     = $titleLine
        charCount = $chineseChars
        file      = $outputPath
    }
}

# ── 检测前言/序章 ──
$prologueContent = $null
if ($bestMatches[0].Index -gt 50) {
    $prologueText = $content.Substring(0, $bestMatches[0].Index).Trim()
    if ($prologueText.Length -gt 20) {
        $prologueDir = Join-Path $OutputDir "000"
        if (-not (Test-Path $prologueDir)) {
            New-Item -Path $prologueDir -ItemType Directory -Force | Out-Null
        }
        $prologuePath = Join-Path $prologueDir "content.md"
        $prologueText | Set-Content -Path $prologuePath -Encoding UTF8 -NoNewline
        $prologueChars = Count-CJKChars $prologueText

        $prologueContent = @{
            title     = "前言/序章"
            charCount = $prologueChars
            file      = $prologuePath
        }
    }
}

@{
    success       = $true
    mode          = "single-file"
    inputFile     = $InputFile
    pattern       = $bestPattern
    totalChapters = $chapters.Count
    totalChars    = $totalChars
    prologue      = $prologueContent
    chapters      = $chapters
} | ConvertTo-Json -Depth 5
