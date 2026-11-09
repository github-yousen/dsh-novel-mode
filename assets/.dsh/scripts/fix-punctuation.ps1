<#
.SYNOPSIS
    将章节正文中的英文标点替换为中文标点
.USAGE
    pwsh -File .dsh/scripts/fix-punctuation.ps1 -Chapter 15
    pwsh -File .dsh/scripts/fix-punctuation.ps1 -Chapter 15 -DryRun
#>

param(
    [Parameter(Mandatory)][int]$Chapter,
    [switch]$DryRun
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
$chapterDir = Join-Path $novelDir "chapters" ("{0:D3}" -f $Chapter)
$contentPath = Join-Path $chapterDir "content.md"

if (-not (Test-Path $contentPath)) {
    Write-Error "文件不存在: $contentPath"
    exit 1
}

$raw = Get-Content $contentPath -Raw -Encoding UTF8
$original = $raw

# ── 分离标题行（第一行）与正文，只对正文执行替换 ──
$newlineIdx = $raw.IndexOf("`n")
if ($newlineIdx -ge 0) {
    $headerLine = $raw.Substring(0, $newlineIdx + 1)
    $text = $raw.Substring($newlineIdx + 1)
} else {
    # 整个文件只有一行（标题），无正文可替换
    Write-Host "第${Chapter}章: 无正文内容，跳过" -ForegroundColor Yellow
    exit 0
}

# ── 替换规则（仅作用于正文部分） ──
# ⚠️ 顺序重要：多字符模式（省略号、破折号）必须在单字符模式（句号）之前处理

# 英文省略号 → 中文省略号（必须先于句号规则，否则 ... 会被逐个替换为。）
$text = $text -replace '\.{3,}', "`u{2026}`u{2026}"
# 英文破折号 → 中文破折号（必须先于其他单字符规则）
$text = $text -replace '--+', "`u{2014}`u{2014}"

# 英文逗号 → 中文逗号（排除数字上下文如 1,000）
$text = $text -replace '(?<!\d),(?!\d)', "`u{ff0c}"
# 英文句号 → 中文句号（排除小数点如 3.14）
$text = $text -replace '(?<!\d)\.(?!\d)', "`u{3002}"
# 英文问号 → 中文问号
$text = $text -replace '\?', "`u{ff1f}"
# 英文感叹号 → 中文感叹号
$text = $text -replace '!', "`u{ff01}"
# 英文冒号 → 中文冒号（排除时间格式如 12:30 和路径）
$text = $text -replace '(?<!\d):(?!\d|\\|/)', "`u{ff1a}"
# 英文分号 → 中文分号
$text = $text -replace ';', "`u{ff1b}"

# 英文双引号 → 中文双引号（逐字符扫描，奇偶判断左右）
# 🔴 不能用正则成对匹配，因为一句一段格式下左右引号分布在不同行
$chars = $text.ToCharArray()
$halfDoubleOpen = $false
$asciiDoubleQuote = [char]0x22
for ($j = 0; $j -lt $chars.Length; $j++) {
    if ($chars[$j] -eq $asciiDoubleQuote) {
        if (-not $halfDoubleOpen) {
            $chars[$j] = [char]0x201C  # 左弯双引号
            $halfDoubleOpen = $true
        } else {
            $chars[$j] = [char]0x201D  # 右弯双引号
            $halfDoubleOpen = $false
        }
    }
}
$text = [string]::new($chars)

# 英文单引号 → 中文双引号（逐字符扫描，小说对话统一使用中文双引号）
$chars = $text.ToCharArray()
$halfSingleOpen = $false
$asciiSingleQuote = [char]0x27
for ($j = 0; $j -lt $chars.Length; $j++) {
    if ($chars[$j] -eq $asciiSingleQuote) {
        if (-not $halfSingleOpen) {
            $chars[$j] = [char]0x201C  # 左弯双引号
            $halfSingleOpen = $true
        } else {
            $chars[$j] = [char]0x201D  # 右弯双引号
            $halfSingleOpen = $false
        }
    }
}
$text = [string]::new($chars)

# 中文单引号 → 中文双引号（统一为合法格式）
$text = $text -replace "`u{2018}", "`u{201c}"
$text = $text -replace "`u{2019}", "`u{201d}"

# 直角引号 → 中文双引号
$text = $text -replace "[`u{300c}`u{300e}]", "`u{201c}"
$text = $text -replace "[`u{300d}`u{300f}]", "`u{201d}"

# 英文括号 → 中文括号
$text = $text -replace '\(', "`u{ff08}"
$text = $text -replace '\)', "`u{ff09}"

# ── 拼回标题行 + 替换后的正文 ──
$text = $headerLine + $text

# ── 统计变化 ──
$changeCount = 0
$minLen = [math]::Min($text.Length, $original.Length)
for ($i = 0; $i -lt $minLen; $i++) {
    if ($text[$i] -ne $original[$i]) { $changeCount++ }
}
$changeCount += [math]::Abs($text.Length - $original.Length)

if ($changeCount -eq 0) {
    Write-Host "第${Chapter}章: 无需替换，标点已全部正确" -ForegroundColor Green
    exit 0
}

if ($DryRun) {
    Write-Host "第${Chapter}章 [预览]: 发现 $changeCount 处需替换" -ForegroundColor Yellow
} else {
    Set-Content $contentPath $text -Encoding UTF8 -NoNewline
    Write-Host "第${Chapter}章: 已替换 $changeCount 处英文标点" -ForegroundColor Green
}
