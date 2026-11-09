<#
.SYNOPSIS
    检查 outline.md 的可用性。

.DESCRIPTION
    本脚本保留原有命令行参数形式，用于做最小可用性检查：
    1. outline.md 文件存在
    2. outline.md 非空
    3. 章节范围参数合法（如传入）

    🔴 主流程据此确认 `outline.md` 可以作为设计与校验阶段的读取入口。

.PARAMETER StartChapter
    用于展示检查范围的起始章节号。

.PARAMETER EndChapter
    用于展示检查范围的结束章节号。

.PARAMETER All
    表示检查整个 outline.md。

.EXAMPLE
    pwsh -NoProfile -File validate-outline.ps1 -StartChapter 41 -EndChapter 60
    pwsh -NoProfile -File validate-outline.ps1 -All
#>
[CmdletBinding(DefaultParameterSetName = 'Range')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Range')]
    [int]$StartChapter,

    [Parameter(Mandatory, ParameterSetName = 'Range')]
    [int]$EndChapter,

    [Parameter(Mandatory, ParameterSetName = 'All')]
    [switch]$All
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrEmpty($PSScriptRoot)) {
    $scriptDir = (Get-Location).Path
    $projectRoot = $scriptDir
} else {
    $scriptDir = $PSScriptRoot
    $projectRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
}
$outlinePath = Join-Path $projectRoot 'novel' 'outline.md'

if (-not (Test-Path $outlinePath)) {
    Write-Error "[FATAL] outline.md 不存在: $outlinePath"
    exit 1
}

if (-not $All -and $StartChapter -gt $EndChapter) {
    Write-Error "[FATAL] 参数非法: StartChapter($StartChapter) 不能大于 EndChapter($EndChapter)"
    exit 1
}

$outlineRaw = Get-Content -LiteralPath $outlinePath -Raw -Encoding UTF8
$lineCount = if ([string]::IsNullOrWhiteSpace($outlineRaw)) { 0 } else { ($outlineRaw -split "`r?`n").Count }

Write-Host "validate-outline: 读取 $outlinePath (${lineCount} 行)"
Write-Host ""
Write-Host "━━━ validate-outline 检查结果 ━━━"

if ($All) {
    Write-Host "检查范围: outline 全文"
} else {
    Write-Host "检查范围: 第${StartChapter}章 → 第${EndChapter}章"
}

if ([string]::IsNullOrWhiteSpace($outlineRaw)) {
    Write-Host ""
    Write-Host "❌ ERROR (1):"
    Write-Host "  [ERROR] outline.md 为空，无法作为设计/校验阶段的真相源"
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━"
    Write-Host "FAIL — 请先补充 outline.md 内容"
    exit 1
}

Write-Host ""
Write-Host "ℹ 检查项: 文件存在、内容非空、范围参数合法"
Write-Host "✅ PASS — outline.md 可用"
Write-Host "━━━━━━━━━━━━━━━━━━━"
exit 0
