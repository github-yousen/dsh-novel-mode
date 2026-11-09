<#
.SYNOPSIS
    单章正文分段格式化 — 一句一段
.DESCRIPTION
    对指定章节的 content.md 执行分段格式化：
    将每个中文句子（以。！？…""等结尾）拆分为独立段落（空行分隔）。
    适配 novel-spec 目录结构：novel/chapters/{N:D3}/content.md
.PARAMETER Chapter
    章节号（数字），如 1、15、42
.PARAMETER DryRun
    仅预览变更，不实际写入文件
.EXAMPLE
    pwsh -NoProfile -File .dsh/scripts/reformat-chapter.ps1 -Chapter 15
    pwsh -NoProfile -File .dsh/scripts/reformat-chapter.ps1 -Chapter 15 -DryRun
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
$chapterDir = Join-Path $novelDir "chapters" ("{0:D3}" -f $Chapter)
$contentPath = Join-Path $chapterDir "content.md"

if (-not (Test-Path $contentPath)) {
    Write-Error "文件不存在: $contentPath"
    exit 1
}

# ============================================================
# 断句函数（来自 reformat-paragraphs.ps1）
# ============================================================

function Split-ToSentences {
    <#
    .SYNOPSIS
        将一段文本按中文句末标点拆分为句子数组（逐字符扫描）
    .DESCRIPTION
        断句标点：。！？……
        规则：
        - 在引号（""、「」、『』）内部时，遇到句末标点不断句，等到右引号处断句
        - 支持嵌套引号（用栈记录层级），仅最外层右引号闭合时断句，内层引号闭合只出栈不拆行
        - 省略号（……）视为一个整体句末标点
        - 单独一个句子则不拆分
    #>
    param([string]$Text)

    # 去除全角空格缩进
    $Text = $Text -replace '^\s+', ''

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @()
    }

    $sentences = [System.Collections.Generic.List[string]]::new()
    $buf = [System.Text.StringBuilder]::new()
    $inBracket = $false   # 是否在【】内
    # 引号嵌套栈：记录每层期望的右引号字符（支持 "……" 内再嵌套 "……"，避免内层右引号误判为对话结束）
    $quoteStack = [System.Collections.Generic.Stack[char]]::new()
    $len = $Text.Length

    # 左右引号配对表（弯引号 + 直引号 + 日式引号）
    $quotePairs = @{
        [char]"`u{201c}" = [char]"`u{201d}"   # " "  弯引号
        [char]"`u{300c}" = [char]"`u{300d}"   # 「 」
        [char]"`u{300e}" = [char]"`u{300f}"   # 『 』
        [char]"`u{ff02}" = [char]"`u{ff02}"   # ＂ ＂ 全角直引号（自配对）
    }
    $rightQuotes = [System.Collections.Generic.HashSet[char]]::new()
    $rightQuotes.Add([char]"`u{201d}") > $null
    $rightQuotes.Add([char]"`u{300d}") > $null
    $rightQuotes.Add([char]"`u{300f}") > $null
    $rightQuotes.Add([char]"`u{ff02}") > $null

    # 句末标点
    $endPuncts = [System.Collections.Generic.HashSet[char]]::new()
    $endPuncts.Add([char]'。') > $null
    $endPuncts.Add([char]'！') > $null
    $endPuncts.Add([char]'？') > $null

    for ($i = 0; $i -lt $len; $i++) {
        $c = $Text[$i]
        $buf.Append($c) > $null

        # ---- 【】方括号保护模式 ----
        if ($inBracket) {
            if ($c -eq [char]'】') {
                $inBracket = $false
            }
            continue
        }

        if ($quoteStack.Count -eq 0) {
            # ==== 不在引号内 ====
            # 检查是否进入【】
            if ($c -eq [char]'【') {
                $inBracket = $true
                continue
            }

            # 检查是否进入引号（弯引号/日式引号/全角直引号）
            if ($quotePairs.ContainsKey($c)) {
                $quoteStack.Push($quotePairs[$c]) > $null
                continue
            }

            # 半角双引号 "（自配对）
            if ($c -eq [char]'"') {
                $quoteStack.Push([char]'"') > $null
                continue
            }

            # 检查省略号 ……
            if ($c -eq '…') {
                while (($i + 1) -lt $len -and $Text[$i + 1] -eq '…') {
                    $i++
                    $buf.Append($Text[$i]) > $null
                }
                $s = $buf.ToString().Trim()
                if ($s) { $sentences.Add($s) }
                $buf.Clear() > $null
                continue
            }

            # 检查句末标点
            if ($endPuncts.Contains($c)) {
                # 如果下一个字符是右引号，把右引号也吃进来（容错：左引号缺失场景）
                if (($i + 1) -lt $len -and ($rightQuotes.Contains($Text[$i + 1]) -or $Text[$i + 1] -eq [char]'"')) {
                    $i++
                    $buf.Append($Text[$i]) > $null
                }
                $s = $buf.ToString().Trim()
                if ($s) { $sentences.Add($s) }
                $buf.Clear() > $null
                continue
            }
        }
        else {
            # ==== 在引号内 ====
            $expectedClose = $quoteStack.Peek()

            # 嵌套引号：遇到左引号则入栈（支持 "…"…" 多层嵌套）
            if ($quotePairs.ContainsKey($c)) {
                $quoteStack.Push($quotePairs[$c]) > $null
                continue
            }

            # 嵌套半角双引号
            if ($c -eq [char]'"') {
                $quoteStack.Push([char]'"') > $null
                continue
            }

            # 遇到期望的右引号：出栈
            if ($c -eq $expectedClose) {
                $quoteStack.Pop() > $null
                # 仅最外层引号闭合时才断句；内层闭合仅出栈，避免误拆出孤立引号行
                if ($quoteStack.Count -eq 0) {
                    $bufStr = $buf.ToString()
                    $hasEndPunct = $false
                    foreach ($ep in @('。', '！', '？', '…')) {
                        if ($bufStr.Contains($ep)) { $hasEndPunct = $true; break }
                    }
                    if ($hasEndPunct) {
                        $s = $bufStr.Trim()
                        if ($s) { $sentences.Add($s) }
                        $buf.Clear() > $null
                    }
                }
                continue
            }
        }
    }

    # 处理剩余文本
    $remaining = $buf.ToString().Trim()
    if ($remaining) {
        $sentences.Add($remaining)
    }

    return $sentences
}

# ============================================================
# 格式化主逻辑
# ============================================================

$content = Get-Content -Path $contentPath -Raw -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($content)) {
    Write-Host "第${Chapter}章: 内容为空，跳过" -ForegroundColor Yellow
    exit 0
}

$lines = $content -split "`r?`n"
$newLines = [System.Collections.Generic.List[string]]::new()
$changed = $false

foreach ($line in $lines) {
    $trimmed = $line.Trim()

    # 保留空行（避免连续多个空行）
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        if ($newLines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($newLines[$newLines.Count - 1])) {
            continue
        }
        $newLines.Add("")
        continue
    }

    # 保留标题行（# 开头）
    if ($trimmed -match '^#{1,6}\s') {
        $newLines.Add($trimmed)
        continue
    }

    # 保留章节标题行（第X章 格式）
    if ($trimmed -match '^第\d+章\s') {
        $newLines.Add($trimmed)
        continue
    }

    # 保留系统面板行（【】包裹）
    if ($trimmed -match '^\【') {
        $newLines.Add($trimmed)
        continue
    }

    # 保留括号注释行
    if ($trimmed -match '^\（' -or $trimmed -match '^\(') {
        $newLines.Add($trimmed)
        continue
    }

    # 保留分隔符行
    if ($trimmed -match '^[\-\*_]{3,}$' -or $trimmed -match '^…+$') {
        $newLines.Add($trimmed)
        continue
    }

    # 正文行：拆分为句子
    $sentences = Split-ToSentences -Text $trimmed

    if ($sentences.Count -le 1) {
        $newLines.Add($trimmed)
    }
    else {
        $changed = $true
        foreach ($s in $sentences) {
            $newLines.Add($s)
            $newLines.Add("")  # 每句后空行
        }
    }
}

# 清理末尾多余空行
while ($newLines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($newLines[$newLines.Count - 1])) {
    $newLines.RemoveAt($newLines.Count - 1)
}

# 确保文件末尾有换行
$newLines.Add("")

$newContent = $newLines -join "`n"

if (-not $changed) {
    Write-Host "第${Chapter}章: 已经是一句一段格式，无需修改" -ForegroundColor Green
    exit 0
}

if ($DryRun) {
    Write-Host "第${Chapter}章 [预览]: 需要分段格式化" -ForegroundColor Yellow
    exit 0
}

# 写入文件（UTF-8 无 BOM）
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($contentPath, $newContent, $utf8NoBom)

# 统计结果
$sentenceCount = ($newLines | Where-Object { $_.Trim() -ne '' -and $_ -notmatch '^#' }).Count
Write-Host "第${Chapter}章: 分段格式化完成（共 $sentenceCount 个段落）" -ForegroundColor Green
