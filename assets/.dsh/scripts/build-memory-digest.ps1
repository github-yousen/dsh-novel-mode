<#
.SYNOPSIS
    构建 / 增量维护全书长期记忆摘录：novel/state/memory-digest.md
.DESCRIPTION
    解决"记忆窗口只到 N-20，更早剧情彻底失忆"的问题。
    从每章 summary.md 中抽取三类长期记忆，落盘为单一可增量追加的档案：

    1. 全书剧情索引   —— 每章一行（取 `### 剧情` 压缩段，≤120字）
    2. 专名/细节词表   —— 每章 `### 可引用细节` 去重汇总（记录首次出现章）
    3. 伏笔台账       —— 每章 `### 伏笔` 的新埋/回收，汇总为 埋设章→回收章 台账

    🔴 增量维护：文件头记录 `<!-- covered: 1-N -->`，默认只读取尚未纳入的章节，
       已纳入章节不再重复读盘（写到第 300 章时每次也只读 1 个 summary）。
    🔴 幂等：可反复执行；-Rebuild 强制全量重建。
    🔴 软失败：任何单章解析异常只跳过该章并告警，不中断调用方流水线。

    消费方：
    - build-context-bundle.ps1（把"远期剧情索引 + 词表"分层嵌入 bundle）
    - batch-outliner / chapter-outliner / continuity-validator（扩纲、伏笔链、跨章重复直读本文件）
.PARAMETER UpTo
    纳入的最大章节号；0 = 自动取 chapters 目录中最后一个有 summary.md 的章节
.PARAMETER Rebuild
    强制全量重建（忽略已有 covered 标记）
.PARAMETER ProjectRoot
    项目根目录。共享 .dsh 的多项目场景必须显式传入
.EXAMPLE
    pwsh -NoProfile -File .dsh/scripts/build-memory-digest.ps1
    pwsh -NoProfile -File .dsh/scripts/build-memory-digest.ps1 -UpTo 137
    pwsh -NoProfile -File .dsh/scripts/build-memory-digest.ps1 -Rebuild
#>

param(
    [Parameter(Mandatory = $false)]
    [int]$UpTo = 0,

    [Parameter(Mandatory = $false)]
    [switch]$Rebuild,

    [Parameter(Mandatory = $false)]
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

# ============================================================
# 路径解析（与其他脚本一致：显式 ProjectRoot > 推算 > CWD > 兄弟目录）
# ============================================================
function Resolve-NovelDir {
    param([string]$Explicit)

    if ($Explicit -and (Test-Path (Join-Path $Explicit "novel/constitution"))) {
        return (Join-Path $Explicit "novel")
    }

    if (-not [string]::IsNullOrEmpty($PSScriptRoot)) {
        $root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
        if (Test-Path (Join-Path $root "novel/constitution")) { return (Join-Path $root "novel") }
    }

    $cwdNovel = Join-Path (Get-Location).Path "novel"
    if (Test-Path (Join-Path $cwdNovel "constitution")) { return $cwdNovel }

    if (-not [string]::IsNullOrEmpty($PSScriptRoot)) {
        $codebuddyDir = Split-Path $PSScriptRoot -Parent
        $siblings = Get-ChildItem (Split-Path $codebuddyDir -Parent) -Directory -ErrorAction SilentlyContinue
        foreach ($dir in $siblings) {
            $candidate = Join-Path $dir.FullName "novel"
            if (Test-Path (Join-Path $candidate "constitution")) { return $candidate }
        }
    }

    return $null
}

$novelDir = Resolve-NovelDir -Explicit $ProjectRoot
if (-not $novelDir) {
    Write-Error "未找到 novel/ 目录（缺少 novel/constitution）。请在项目根目录执行，或显式传入 -ProjectRoot。"
    exit 1
}

$chaptersDir = Join-Path $novelDir "chapters"
$stateDir = Join-Path $novelDir "state"
$digestPath = Join-Path $stateDir "memory-digest.md"

if (-not (Test-Path $stateDir)) {
    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
}

function Pad3([int]$n) { $n.ToString("D3") }

# ============================================================
# 确定纳入上限
# ============================================================
if ($UpTo -le 0) {
    $UpTo = 0
    if (Test-Path $chaptersDir) {
        Get-ChildItem $chaptersDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Name -match '^\d+$') {
                $n = [int]$_.Name
                if ((Test-Path (Join-Path $_.FullName "summary.md")) -and $n -gt $UpTo) { $UpTo = $n }
            }
        }
    }
}

if ($UpTo -le 0) {
    Write-Host "ⓘ 尚无任何 summary.md，跳过长期记忆摘录构建"
    exit 0
}

# ============================================================
# 载入已有档案（增量基线）
# ============================================================
$gist = @{}                                           # 章节号(int) -> 一句话剧情（🔴 必须用普通哈希表：[ordered] 用 int 下标会按"位置"而非"键"解析）
$lexicon = [ordered]@{}                               # 词条 -> 首次出现章
$foreshadow = [ordered]@{}                            # 伏笔ID -> @{ planted; resolved; desc }
$covered = 0

if ((Test-Path $digestPath) -and -not $Rebuild) {
    $old = Get-Content $digestPath -Raw -Encoding UTF8
    $m = [regex]::Match($old, '<!--\s*covered:\s*1-(\d+)\s*-->')
    if ($m.Success) { $covered = [int]$m.Groups[1].Value }

    foreach ($line in ($old -split "`r?`n")) {
        $mg = [regex]::Match($line, '^- 第(\d+)章：(.*)$')
        if ($mg.Success) { $gist[[int]$mg.Groups[1].Value] = $mg.Groups[2].Value; continue }

        $ml = [regex]::Match($line, '^- \[第(\d+)章\]\s*(.+)$')
        if ($ml.Success) {
            $term = $ml.Groups[2].Value.Trim()
            if (-not $lexicon.Contains($term)) { $lexicon[$term] = [int]$ml.Groups[1].Value }
            continue
        }

        $mf = [regex]::Match($line, '^- (F-[\d\-]+) ｜ 埋设@(\d+|\?) ｜ (回收@(\d+)|未回收) ｜ (.*)$')
        if ($mf.Success) {
            $foreshadow[$mf.Groups[1].Value] = @{
                planted  = $mf.Groups[2].Value
                resolved = if ($mf.Groups[4].Success -and $mf.Groups[4].Value) { $mf.Groups[4].Value } else { "" }
                desc     = $mf.Groups[5].Value
            }
            continue
        }
    }
}

$startFrom = if ($Rebuild) { 1 } else { $covered + 1 }

if ($startFrom -gt $UpTo) {
    Write-Host "✓ 长期记忆摘录已是最新（覆盖 1-$covered，请求上限 $UpTo），无需重建"
    exit 0
}

# ============================================================
# 摘要解析辅助
# ============================================================
function Get-SummarySection {
    param([string]$Text, [string]$Header)
    $pattern = "(?s)#{2,3}\s*$([regex]::Escape($Header))[^\n]*\n(.*?)(?=\n#{2,3}\s|\z)"
    $m = [regex]::Match($Text, $pattern)
    if ($m.Success) { return $m.Groups[1].Value }
    return ""
}

function Get-CleanLines {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return @() }
    $stripped = [regex]::Replace($Text, '(?s)<!--.*?-->', '')
    return @($stripped -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
}

function Truncate {
    param([string]$Text, [int]$Max)
    $t = [regex]::Replace($Text, '\s+', ' ').Trim()
    if ($t.Length -le $Max) { return $t }
    return $t.Substring(0, $Max) + "…"
}

$isPlaceholder = {
    param([string]$s)
    return ($s -match '^\[.*\]$') -or ($s -in @('无', '无。', '-', '—', '暂无'))
}

# ============================================================
# 逐章抽取（只读尚未纳入的章节）
# ============================================================
$added = 0
$skipped = 0

for ($i = $startFrom; $i -le $UpTo; $i++) {
    $summaryPath = Join-Path $chaptersDir (Pad3 $i) "summary.md"
    if (-not (Test-Path $summaryPath)) { $skipped++; continue }

    try {
        $raw = Get-Content $summaryPath -Raw -Encoding UTF8
    } catch {
        Write-Host "  ⚠ 第${i}章 summary.md 读取失败，已跳过：$($_.Exception.Message)"
        $skipped++
        continue
    }

    # 1) 一句话剧情
    $plotText = Get-SummarySection -Text $raw -Header "剧情"
    if ([string]::IsNullOrWhiteSpace($plotText)) {
        $plotText = Get-SummarySection -Text $raw -Header "一句话剧情"
    }
    $plotLines = Get-CleanLines -Text $plotText
    if ($plotLines.Count -gt 0) {
        $gist[$i] = Truncate -Text ($plotLines -join ' ') -Max 120
    } else {
        $gist[$i] = "[剧情段缺失]"
    }

    # 2) 可引用细节 → 词表（首次出现章优先）
    $detailLines = Get-CleanLines -Text (Get-SummarySection -Text $raw -Header "可引用细节")
    foreach ($line in $detailLines) {
        $mm = [regex]::Match($line, '^[-*]\s*(.+)$')
        if (-not $mm.Success) { continue }
        $term = Truncate -Text $mm.Groups[1].Value -Max 30
        if (& $isPlaceholder $term) { continue }
        if (-not $lexicon.Contains($term)) { $lexicon[$term] = $i }
    }

    # 3) 伏笔台账
    $fsLines = Get-CleanLines -Text (Get-SummarySection -Text $raw -Header "伏笔")
    foreach ($line in $fsLines) {
        $ids = [regex]::Matches($line, 'F-\d+(?:-\d+)?') | ForEach-Object { $_.Value }
        if ($ids.Count -eq 0) { continue }
        $isResolve = $line -match '回收|收回|已回收|兑现'
        $descRaw = [regex]::Replace($line, '^[-*]\s*(新埋|埋设|新增|回收|已回收|收回)\s*[:：]?\s*', '')
        $descRaw = [regex]::Replace($descRaw, '\[?F-\d+(?:-\d+)?\]?\s*', '')   # 去掉 ID 前缀，正文描述才有信息量
        $desc = Truncate -Text $descRaw -Max 40
        foreach ($id in $ids) {
            if (-not $foreshadow.Contains($id)) {
                $foreshadow[$id] = @{ planted = "?"; resolved = ""; desc = "" }
            }
            $entry = $foreshadow[$id]
            if ($isResolve) {
                if (-not $entry.resolved) { $entry.resolved = "$i" }
            } elseif ($entry.planted -eq "?") {
                $entry.planted = "$i"
            }
            if (-not $entry.desc -and $desc) { $entry.desc = $desc }
            if ($entry.planted -eq "?" -and $id -match '^F-(\d+)-') { $entry.planted = $Matches[1] }
            $foreshadow[$id] = $entry
        }
    }

    $added++
}

# ============================================================
# 写出档案
# ============================================================
$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("# 全书长期记忆摘录（build-memory-digest.ps1 自动维护，禁止手改）")
[void]$sb.AppendLine("<!-- covered: 1-$UpTo -->")
[void]$sb.AppendLine("<!-- generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -->")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> 用途：补齐 N-20 之外的长期记忆。扩纲查「桥段是否重复 / 伏笔是否遗忘」、写作查「早期专名原样引用」、")
[void]$sb.AppendLine("> 校验查「跨章意象雷同 / 伏笔悬空」时，以本文件为索引，再按需回读对应章 summary.md 取细节。")
[void]$sb.AppendLine("")

[void]$sb.AppendLine("## 一、全书剧情索引（每章一句）")
[void]$sb.AppendLine("")
foreach ($k in ($gist.Keys | Sort-Object)) {
    [void]$sb.AppendLine("- 第${k}章：$($gist[$k])")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("## 二、专名与可引用细节词表（标注首次出现章）")
[void]$sb.AppendLine("")
if ($lexicon.Count -eq 0) {
    [void]$sb.AppendLine("（暂无）")
} else {
    foreach ($term in ($lexicon.Keys | Sort-Object { $lexicon[$_] })) {
        [void]$sb.AppendLine("- [第$($lexicon[$term])章] $term")
    }
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("## 三、伏笔台账（埋设 → 回收）")
[void]$sb.AppendLine("")
if ($foreshadow.Count -eq 0) {
    [void]$sb.AppendLine("（暂无）")
} else {
    $pending = 0
    $fsSorted = $foreshadow.Keys | Sort-Object @{ Expression = {
            $mNum = [regex]::Match($_, '^F-(\d+)')
            if ($mNum.Success) { [int]$mNum.Groups[1].Value } else { 0 }
        }
    }, @{ Expression = { $_ } }
    foreach ($id in $fsSorted) {
        $e = $foreshadow[$id]
        $resolvedTxt = if ($e.resolved) { "回收@$($e.resolved)" } else { "未回收" }
        if (-not $e.resolved) { $pending++ }
        [void]$sb.AppendLine("- $id ｜ 埋设@$($e.planted) ｜ $resolvedTxt ｜ $($e.desc)")
    }
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("<!-- pending: $pending -->")
}

Set-Content $digestPath $sb.ToString() -Encoding UTF8 -NoNewline

$sizeKB = [math]::Round((Get-Item $digestPath).Length / 1024, 1)
Write-Host "✓ 长期记忆摘录已更新: $digestPath"
Write-Host "  覆盖章节: 1-$UpTo（本次新增 ${added} 章，跳过 ${skipped} 章无摘要）"
Write-Host "  剧情索引: $($gist.Count) 条 | 词表: $($lexicon.Count) 条 | 伏笔: $($foreshadow.Count) 条"
Write-Host "  文件大小: ${sizeKB} KB"
