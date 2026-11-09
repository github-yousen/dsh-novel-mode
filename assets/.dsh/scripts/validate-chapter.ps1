<#
.SYNOPSIS
    章节验证脚本 — 对小说章节执行硬性校验
.DESCRIPTION
    检测项:
    1. 正文字数范围（默认 [2000, 3500]，可从 .dsh/config.yaml 配置；含中文标点，不含章节标题）
    2. 角色名校验（对比 constitution/characters/ 目录）
    3. 设定冲突检测（正则匹配 constitution/core.md）
    4. 风格指纹偏差（与前10章固定基准对比）

    5. 格式规范（段落长度、对话格式）
    5.5 段落节奏（段落/句长分布，按人类成书基线绝对阈值双向把关：过碎 / 一逗到底）
    6. 英文标点检测（不允许使用英文标点）
    7. 旧格式伏笔ID提示
    8. 正文元数据泄漏
    8.5 波浪线泛称标记泄漏（设计稿 ~泛称~ 不可出现在正文）
    9. 对话格式（必须使用中文双引号 "" 包裹）
    10. 章节结束标记（禁止"本章完"等）
    11. 英文内容检测（列出英文单词，交由AI判断是否为合理专有名词/缩写）
    12. 场景分隔符检测（禁止独占一行的纯符号分割）
.PARAMETER Chapter
    章节号（数字），或 "All" 验证全部章节
.EXAMPLE
    pwsh -File .dsh/scripts/validate-chapter.ps1 -Chapter 15
    pwsh -File .dsh/scripts/validate-chapter.ps1 -Chapter All
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Chapter,
    [switch]$Quick
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

# 宪法目录结构
$constitutionDir = Join-Path $novelDir "constitution"
$corePath = Join-Path $constitutionDir "core.md"
$stylePath = Join-Path $constitutionDir "style.md"
$charsDir = Join-Path $constitutionDir "characters"
$statePath = Join-Path $novelDir "state.yaml"

# ============================================================
# 段落节奏公共库（人类成书基线的绝对阈值门控）
# 缺失时降级：跳过"段落节奏"检测项，不阻断其它校验
# ============================================================
$script:ParaLibLoaded = $false
if (-not [string]::IsNullOrEmpty($PSScriptRoot)) {
    $paraLib = Join-Path $PSScriptRoot "lib/paragraph-metrics.ps1"
    if (Test-Path $paraLib) {
        . $paraLib
        $script:ParaLibLoaded = $true
    }
}

# ============================================================
# 字数配置（从母本 .dsh/config.yaml 读取，缺省回退内置默认值）
# ============================================================
$wordMin = 2000
$wordTarget = 2500
$wordMax = 3500
$configPath = Join-Path (Split-Path $PSScriptRoot -Parent) "config.yaml"
if (Test-Path $configPath) {
    $configText = Get-Content $configPath -Raw -Encoding UTF8
    if ($configText -match '(?m)^\s*min:\s*(\d+)') { $wordMin = [int]$Matches[1] }
    if ($configText -match '(?m)^\s*target:\s*(\d+)') { $wordTarget = [int]$Matches[1] }
    if ($configText -match '(?m)^\s*max:\s*(\d+)') { $wordMax = [int]$Matches[1] }
}

# ============================================================
# 工具函数
# ============================================================

function Count-ChineseChars {
    <# 统计中文字符数（含汉字和中文标点） #>
    param([string]$Text)
    $matches = [regex]::Matches($Text, '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2018-\u201f\u2026\u2014\u2013]')
    return $matches.Count
}

function Get-CharacterNames {
    <# 从 constitution/characters/ 目录获取角色名清单（文件名即角色名） #>
    $names = @()
    if (Test-Path $charsDir) {
        $charFiles = Get-ChildItem $charsDir -Filter "*.md" | Where-Object { $_.Name -ne '_template.md' }
        foreach ($f in $charFiles) {
            $names += $f.BaseName
        }
    }
    return $names
}

function Get-ConflictPatterns {
    <# 从 constitution/core.md 提取冲突正则 #>
    param([string]$CoreContent)
    $patterns = @()
    $inSection = $false
    foreach ($line in $CoreContent -split "`n") {
        if ($line -match '设定冲突检测') { $inSection = $true; continue }
        if ($line -match '^## ' -and $inSection) { break }
        if ($inSection -and $line -match '^- 冲突模式[:：]\s*`(.+)`') {
            $patterns += $Matches[1]
        }
    }
    return $patterns
}




function Compute-StyleFingerprint {
    <# 计算单章的风格指纹 #>
    param([string]$Text)

    $sentences = $Text -split '[。！？…]+' | Where-Object { $_.Trim() -ne '' }
    $sentenceLens = $sentences | ForEach-Object { (Count-ChineseChars $_) }
    $avgSentenceLen = if ($sentenceLens.Count -gt 0) {
        ($sentenceLens | Measure-Object -Average).Average
    } else { 0 }

    $dialogueMatches = [regex]::Matches($Text, '[\u201c][^\u201d]*[\u201d]')
    $dialogueChars = ($dialogueMatches | ForEach-Object { Count-ChineseChars $_.Value } | Measure-Object -Sum).Sum
    $totalChars = Count-ChineseChars $Text
    $dialogueRatio = if ($totalChars -gt 0) { [math]::Round($dialogueChars / $totalChars, 3) } else { 0 }

    $paragraphs = ($Text -split '\r?\n\s*\r?\n') | Where-Object { $_.Trim() -ne '' }
    if ($paragraphs.Count -le 1) {
        $paragraphs = ($Text -split '\r?\n') | Where-Object { $_.Trim() -ne '' }
    } else {
        # 双换行分段成功，但检查平均段落长度是否合理（>300字说明实际用单换行分段）
        $checkLens = $paragraphs | ForEach-Object { Count-ChineseChars $_ } | Where-Object { $_ -gt 0 }
        $checkAvg = if ($checkLens.Count -gt 0) { ($checkLens | Measure-Object -Average).Average } else { 0 }
        if ($checkAvg -gt 300) {
            $paragraphs = ($Text -split '\r?\n') | Where-Object { $_.Trim() -ne '' }
        }
    }
    $paraLens = $paragraphs | ForEach-Object { Count-ChineseChars $_ }
    $avgParagraphLen = if ($paraLens.Count -gt 0) {
        ($paraLens | Measure-Object -Average).Average
    } else { 0 }

    $exclamations = ([regex]::Matches($Text, '[！!]')).Count
    $exclamationRate = if ($totalChars -gt 0) { [math]::Round($exclamations / $totalChars, 4) } else { 0 }

    return @{
        avgSentenceLen  = [math]::Round($avgSentenceLen, 1)
        dialogueRatio   = $dialogueRatio
        avgParagraphLen = [math]::Round($avgParagraphLen, 1)
        exclamationRate = $exclamationRate
    }
}

function Get-StateStyleFingerprint {
    <# 从 state.yaml 读取风格指纹基准 #>
    param([string]$StatePath)
    $fp = @{
        avgSentenceLen       = 18.0
        dialogueRatio        = 0.30
        avgParagraphLen      = 120.0
        exclamationRate      = 0.02
        basedOnChapters      = 0
        baselineMode         = "fixed_first_10"
        baselineStartChapter = 1
        baselineEndChapter   = 10
        baselineHealthy      = $true   # 未知时按健康处理（老项目无该字段）
    }
    if (-not (Test-Path $StatePath)) { return $fp }

    $content = Get-Content $StatePath -Raw -Encoding UTF8
    if ($content -match 'avgSentenceLen:\s*([\d.]+)') { $fp.avgSentenceLen = [double]$Matches[1] }
    if ($content -match 'dialogueRatio:\s*([\d.]+)') { $fp.dialogueRatio = [double]$Matches[1] }
    if ($content -match 'avgParagraphLen:\s*([\d.]+)') { $fp.avgParagraphLen = [double]$Matches[1] }
    if ($content -match 'exclamationRate:\s*([\d.]+)') { $fp.exclamationRate = [double]$Matches[1] }
    if ($content -match 'basedOnChapters:\s*(\d+)') { $fp.basedOnChapters = [int]$Matches[1] }
    if ($content -match 'baselineMode:\s*(.+)') { $fp.baselineMode = $Matches[1].Trim().Trim('"') }
    if ($content -match 'baselineStartChapter:\s*(\d+)') { $fp.baselineStartChapter = [int]$Matches[1] }
    if ($content -match 'baselineEndChapter:\s*(\d+)') { $fp.baselineEndChapter = [int]$Matches[1] }
    if ($content -match 'baselineHealthy:\s*(true|false)') { $fp.baselineHealthy = ($Matches[1] -eq 'true') }
    return $fp
}


# ============================================================
# 单章验证函数
# ============================================================

function Validate-SingleChapter {
    param([int]$ChapterNum)

    $chapDir = Join-Path $novelDir "chapters" ("{0:D3}" -f $ChapterNum)
    $contentPath = Join-Path $chapDir "content.md"

    $issues = @()

    if (-not (Test-Path $contentPath)) {
        $issues += @{ level = "ERROR"; check = "文件"; message = "章节文件不存在: $contentPath" }
        return @{ chapter = $ChapterNum; issues = $issues }
    }

    $content = Get-Content $contentPath -Raw -Encoding UTF8
    $bodyLines = $content -split "`n"
    $bodyText = ($bodyLines | Select-Object -Skip 1) -join "`n"

    # === 检测0: 章节标题 ===
    $headerLine = ($bodyLines | Select-Object -First 1).Trim()
    if ([string]::IsNullOrWhiteSpace($headerLine)) {
        $issues += @{ level = "ERROR"; check = "章节标题"; message = "首行为空，缺少章节标题行（应形如 `# 第${ChapterNum}章 xxx`）" }
    } elseif ($headerLine -notmatch '^#\s*第') {
        $issues += @{ level = "ERROR"; check = "章节标题"; message = "首行不是章节标题（应形如 `# 第${ChapterNum}章 xxx`），当前首行: $($headerLine.Substring(0, [math]::Min(30, $headerLine.Length)))..." }
    } else {
        $headerChapter = if ($headerLine -match '第\s*(\d+)\s*章') { [int]$Matches[1] } else { $null }
        $titleIssues = @()
        if ($null -ne $headerChapter -and $headerChapter -ne $ChapterNum) {
            $titleIssues += "标题章节号(${headerChapter})与验证章节号(${ChapterNum})不一致"
        }
        if ($titleIssues.Count -gt 0) {
            $issues += @{ level = "WARNING"; check = "章节标题"; message = ($titleIssues -join "; ") }
        } else {
            $issues += @{ level = "PASS"; check = "章节标题"; message = "标题格式正确: $headerLine" }
        }
    }

    # 加载 core.md 用于冲突检测
    $coreContent = ""
    if (Test-Path $corePath) {
        $coreContent = Get-Content $corePath -Raw -Encoding UTF8
    }

    # === 检测1: 字数（范围来自 .dsh/config.yaml，缺省 [2000, 3500]） ===
    $wordCount = Count-ChineseChars $bodyText
    if ($wordCount -lt $wordMin) {
        $issues += @{ level = "ERROR"; check = "字数"; message = "字数不足: ${wordCount}/$wordMin（不含标题）" }
    } elseif ($wordCount -gt $wordMax) {
        $issues += @{ level = "ERROR"; check = "字数"; message = "字数超出: ${wordCount}/$wordMax（不含标题）" }
    } else {
        $issues += @{ level = "PASS"; check = "字数"; message = "字数: $wordCount（范围 $wordMin-$wordMax，不含标题）" }
    }

    # === 检测2: 角色名 ===
    # 🔴 角色名检测已移至 AI 验证环节（正则无法准确识别角色名，误报率极高）
    # 脚本跳过此项，由主流程 AI 读取正文 + 已登记角色列表后自行判断
    $issues += @{ level = "PASS"; check = "角色名"; message = "已移交AI验证（脚本跳过）" }

    # === 检测3: 设定冲突 ===
    if (-not $Quick) {
        if ($coreContent -ne "") {
            $conflictPatterns = Get-ConflictPatterns $coreContent
            $conflicts = @()
            foreach ($pattern in $conflictPatterns) {
                try {
                    $m = [regex]::Matches($content, $pattern)
                    if ($m.Count -gt 0) {
                        $conflicts += "模式 /$pattern/ 匹配到: $($m[0].Value)"
                    }
                } catch {
                    # 正则语法错误，跳过
                }
            }
            if ($conflicts.Count -gt 0) {
                $issues += @{ level = "CRITICAL"; check = "设定冲突"; message = ($conflicts -join "; ") }
            } else {
                $issues += @{ level = "PASS"; check = "设定冲突"; message = "未检测到冲突" }
            }
        } else {
            $issues += @{ level = "PASS"; check = "设定冲突"; message = "无 core.md，跳过" }
        }
    }

    # === 检测4: 风格指纹 ===
    # 🔴 以前10章正文为固定基准；基准未凑满 10 章前跳过风格检测
    $currentFp = $null
    if (-not $Quick) {
        $baseFp = Get-StateStyleFingerprint $statePath
        $expectedBaselineCount = [math]::Max(1, $baseFp.baselineEndChapter - $baseFp.baselineStartChapter + 1)
        $basedOn = $baseFp.basedOnChapters

        if ($basedOn -lt $expectedBaselineCount) {
            $issues += @{ level = "PASS"; check = "风格指纹"; message = "前10章固定基准尚未建成（已收集${basedOn}/${expectedBaselineCount}章），跳过风格检测" }
        } elseif (-not $baseFp.baselineHealthy) {
            # 🔴 基准本身失准：采样章节的节奏已偏离人类成书区间。
            # 此时若继续按偏差值报警，会变成"每章必响"的常态噪音（基准是死的，正文永远对不上）；
            # 正确做法是明确报出"基准不可信"，并给出重建路径，而不是逐章刷 WARNING。
            $issues += @{ level = "WARNING"; check = "风格指纹"; message = "风格基准本身失准（state.yaml 标记 baselineHealthy: false）：采样章节（第$($baseFp.baselineStartChapter)~$($baseFp.baselineEndChapter)章）的段落节奏已偏离人类成书区间，锁为母本会把问题固化。→ 先按检测 5.5 修正这些章节的句子长度，再执行 compute-style.ps1 -Rebuild 重建；本项暂不按偏差值报警，避免常态噪音" }
        } else {
            $currentFp = Compute-StyleFingerprint $bodyText

            $styleIssues = @()
            $sentenceDiff = [math]::Abs($currentFp.avgSentenceLen - $baseFp.avgSentenceLen)
            if ($sentenceDiff -gt 8) {
                $styleIssues += "平均句长偏差过大: $($currentFp.avgSentenceLen) vs 前10章基准$($baseFp.avgSentenceLen)"
            }
            $dialogueDiff = [math]::Abs($currentFp.dialogueRatio - $baseFp.dialogueRatio)
            if ($dialogueDiff -gt 0.20) {
                $styleIssues += "对话占比偏差过大: $($currentFp.dialogueRatio) vs 前10章基准$($baseFp.dialogueRatio)"
            }
            $paraLenDiff = [math]::Abs($currentFp.avgParagraphLen - $baseFp.avgParagraphLen)
            if ($paraLenDiff -gt 15) {
                $styleIssues += "段落长度偏差过大: $($currentFp.avgParagraphLen) vs 前10章基准$($baseFp.avgParagraphLen)"
            }
            $exclDiff = [math]::Abs($currentFp.exclamationRate - $baseFp.exclamationRate)
            if ($exclDiff -gt 0.03) {
                $styleIssues += "叹号频率偏差: $($currentFp.exclamationRate) vs 前10章基准$($baseFp.exclamationRate)"
            }

            if ($styleIssues.Count -gt 0) {
                $issues += @{ level = "WARNING"; check = "风格指纹"; message = ($styleIssues -join "; ") }
            } else {
                $issues += @{ level = "PASS"; check = "风格指纹"; message = "风格一致（对比前10章固定基准，句长:$($currentFp.avgSentenceLen) 对话:$($currentFp.dialogueRatio)）" }
            }
        }
    }


    # === 检测5: 格式 ===
    if (-not $Quick) {
        $formatIssues = @()
        $paragraphs = ($content -split '\r?\n\s*\r?\n') | Where-Object { $_.Trim() -ne '' }
        if ($paragraphs.Count -le 1) {
            $paragraphs = ($content -split '\r?\n') | Where-Object { $_.Trim() -ne '' }
        } else {
            $checkLens = $paragraphs | ForEach-Object { Count-ChineseChars $_ } | Where-Object { $_ -gt 0 }
            $checkAvg = if ($checkLens.Count -gt 0) { ($checkLens | Measure-Object -Average).Average } else { 0 }
            if ($checkAvg -gt 300) {
                $paragraphs = ($content -split '\r?\n') | Where-Object { $_.Trim() -ne '' }
            }
        }
        foreach ($para in $paragraphs) {
            $paraLen = Count-ChineseChars $para
            if ($paraLen -gt 300) {
                $preview = $para.Substring(0, [math]::Min(20, $para.Length))
                $formatIssues += "段落过长(${paraLen}字): ${preview}..."
            }
        }

        if ($formatIssues.Count -gt 0) {
            $issues += @{ level = "WARNING"; check = "格式"; message = ($formatIssues -join "; ") }
        } else {
            $issues += @{ level = "PASS"; check = "格式"; message = "格式正常" }
        }
    }

    # === 检测5.5: 段落节奏（人类成书基线绝对阈值门） ===
    # 🔴 只查长度上限（检测5）远远不够：正文可以"碎"到每段 15 字而不触发任何报警。
    # 本项按 4 本专业成书实测基线，双向把关（过碎 / 一逗到底）。
    # ⚠️ 本流程中 reformat-chapter.ps1 逐句拆段 → 段落长度 ≈ 句子长度，两项会同时命中。
    if (-not $Quick) {
        if ($script:ParaLibLoaded) {
            $bandMetrics = Get-ParagraphMetrics -Text $bodyText
            $bandIssues = Get-ParagraphBandIssues -Metrics $bandMetrics
            $bandErr = @($bandIssues | Where-Object { $_.Severity -eq 'ERROR' })
            $bandWarn = @($bandIssues | Where-Object { $_.Severity -eq 'WARNING' })
            $bandDetail = " ｜ 实测: " + (Format-ParagraphBand -Metrics $bandMetrics)
            if ($bandErr.Count -gt 0) {
                $issues += @{ level = "ERROR"; check = "段落节奏"; message = ((($bandErr | ForEach-Object { $_.Message }) -join "; ") + $bandDetail) }
            }
            if ($bandWarn.Count -gt 0) {
                $issues += @{ level = "WARNING"; check = "段落节奏"; message = ((($bandWarn | ForEach-Object { $_.Message }) -join "; ") + $bandDetail) }
            }
            if ($bandErr.Count -eq 0 -and $bandWarn.Count -eq 0) {
                $issues += @{ level = "PASS"; check = "段落节奏"; message = ("落在人类成书区间 ｜ " + (Format-ParagraphBand -Metrics $bandMetrics)) }
            }
        } else {
            $issues += @{ level = "PASS"; check = "段落节奏"; message = "段落节奏库未加载，跳过" }
        }
    }

    # === 检测6: 英文标点（不含引号，引号可能是书稿对话风格） ===
    # 🔴 对数字上下文豁免（如 3.5、1,000 等数字格式不视为英文标点错误）
    if (-not $Quick) {
        $enPuncChecks = @(
            @{ pattern = '(?<!\d),(?!\d)';  display = ',';  suggest = '，' }
            @{ pattern = '\.{3,}';          display = '...'; suggest = '……' }
            @{ pattern = '(?<!\d)\.(?!\d)'; display = '.';  suggest = '。' }
            @{ pattern = '!';               display = '!';  suggest = '！' }
            @{ pattern = '\?';              display = '?';  suggest = '？' }
            @{ pattern = '(?<!\d):(?!\d|\\|/)'; display = ':'; suggest = '：' }
            @{ pattern = ';';               display = ';';  suggest = '；' }
            @{ pattern = '\(';              display = '(';  suggest = '（' }
            @{ pattern = '\)';              display = ')';  suggest = '）' }
            @{ pattern = '--+';             display = '--'; suggest = '——' }
        )
        $enPuncFound = @()
        # $bodyLines / $bodyText 已在前文统一构造，此处直接复用
        foreach ($chk in $enPuncChecks) {
            $m = [regex]::Matches($bodyText, $chk.pattern)
            if ($m.Count -gt 0) {
                $enPuncFound += "英文[$($chk.display)]应替换为中文[$($chk.suggest)](共$($m.Count)处)"
            }
        }
        if ($enPuncFound.Count -gt 0) {
            $issues += @{ level = "ERROR"; check = "英文标点"; message = ($enPuncFound -join "; ") }
        } else {
            $issues += @{ level = "PASS"; check = "英文标点"; message = "未发现英文标点" }
        }
    }

    # === 检测7: 旧格式伏笔ID提示 ===
    # 检查正文和同目录 summary.md/design.md 中的旧格式伏笔ID（F-NNN 无序号）
    if (-not $Quick) {
        $filesToCheck = @($content)
        $summPath = Join-Path $chapDir "summary.md"
        $dsnPath = Join-Path $chapDir "design.md"
        if (Test-Path $summPath) { $filesToCheck += Get-Content $summPath -Raw -Encoding UTF8 }
        if (Test-Path $dsnPath) { $filesToCheck += Get-Content $dsnPath -Raw -Encoding UTF8 }
        $allText = $filesToCheck -join "`n"
        $oldFIds = [regex]::Matches($allText, 'F-\d{3}(?!-\d)') | ForEach-Object { $_.Value } | Sort-Object -Unique
        if ($oldFIds.Count -gt 0) {
            $issues += @{ level = "WARNING"; check = "伏笔ID格式"; message = "检测到旧格式伏笔ID（建议迁移为 F-章节号-序号 格式）: $($oldFIds -join ', ')" }
        }
    }

    # === 检测8: 正文元数据泄漏 ===
    # 检测正文中不应出现的元数据标记（伏笔ID、回收标记、设计稿标注等）
    $metaPatterns = @(
        @{ pattern = 'F-\d+(?:-\d+)?[，,]\s*(?:回收成功|回收|埋设|埋下)'; display = '伏笔回收/埋设标记' }
        @{ pattern = '(?:回收成功|埋设成功)[。．.]'; display = '元数据操作标记' }
        @{ pattern = '\[需更新宪法\]'; display = '宪法更新标注' }
        @{ pattern = '(?:场景\d+|Scene\s*\d+)[：:]'; display = '场景编号标注' }
    )
    $metaFound = @()
    foreach ($mp in $metaPatterns) {
        $mm = [regex]::Matches($content, $mp.pattern)
        if ($mm.Count -gt 0) {
            $metaFound += "$($mp.display)(共$($mm.Count)处，如: $($mm[0].Value))"
        }
    }
    if ($metaFound.Count -gt 0) {
        $issues += @{ level = "ERROR"; check = "元数据泄漏"; message = "正文中混入了非小说内容的元数据标记: $($metaFound -join '; ')" }
    }

    # === 检测8.4: 章节编号引用泄漏（正文/台词中不得出现"第X章"等章节元数据，会跳戏） ===
    # 用 $bodyText（已跳过标题行），避免与章节标题 `# 第N章 xxx` 冲突
    $chapRefMatches = [regex]::Matches($bodyText, '第\s*\d+\s*章')
    if ($chapRefMatches.Count -gt 0) {
        $chapRefExamples = ($chapRefMatches | Select-Object -First 3 | ForEach-Object { $_.Value }) -join '、'
        $issues += @{ level = "ERROR"; check = "章节编号泄漏"; message = "正文/台词中出现章节编号引用（跳戏）: $chapRefExamples（共$($chapRefMatches.Count)处）。角色不应知道'第几章'，须改为剧情内时间/事件锚点（如'上次修水柜时'）" }
    }

    # === 检测8.5: 波浪线泛称标记泄漏（设计稿的 ~泛称~ 不可出现在正文中） ===
    $tildeMatches = [regex]::Matches($content, '~[^~\r\n]+~')
    if ($tildeMatches.Count -gt 0) {
        $tildeExamples = ($tildeMatches | Select-Object -First 5 | ForEach-Object { $_.Value }) -join '、'
        $issues += @{ level = "ERROR"; check = "波浪线标记"; message = "正文中发现设计稿泛称标记（~文字~ 会渲染为删除线），须去掉波浪号直接写泛称: $tildeExamples（共$($tildeMatches.Count)处）" }
    } else {
        $issues += @{ level = "PASS"; check = "波浪线标记"; message = "未发现波浪线泛称标记" }
    }

    if (-not $Quick) {
    # === 检测9: 对话格式（必须使用中文双引号 "" 包裹） ===
    # 检测非法对话引号：「」『』、英文双引号""、英文单引号''等
    $illegalQuotePatterns = @(
        @{ pattern = '[「」]'; display = '直角引号「」' }
        @{ pattern = '[『』]'; display = '双层直角引号『』' }
        @{ pattern = '[""]'; display = '英文双引号""' }
        @{ pattern = "[']"; display = "英文单引号'" }
        @{ pattern = '[\u2018\u2019]'; display = "中文单引号''" }
    )
    $illegalQuoteFound = @()
    foreach ($iq in $illegalQuotePatterns) {
        $qm = [regex]::Matches($content, $iq.pattern)
        if ($qm.Count -gt 0) {
            $illegalQuoteFound += "$($iq.display)(共$($qm.Count)处)"
        }
    }
    if ($illegalQuoteFound.Count -gt 0) {
        $issues += @{ level = "ERROR"; check = "对话格式"; message = "对话必须使用中文双引号\u201c\u201d包裹，检测到非法引号: $($illegalQuoteFound -join '; ')" }
    } else {
        $issues += @{ level = "PASS"; check = "对话格式"; message = "对话格式正确（中文双引号\u201c\u201d）" }
    }
    }

    if (-not $Quick) {
    # === 检测10: 章节结束标记（禁止"本章完"等） ===
    # 🔴 覆盖所有括号变体：（()【[]「」『』<>）+ 独立行 + 分隔线包围
    $endMarkPatterns = @(
        @{ pattern = '[（(\[【「『<]\s*(?:本章完|全文完|未完待续|完|END|end|待续|下章继续|The\s+End)\s*[）)\]】」』>]'; display = '章节结束标记' }
        @{ pattern = '---\s*(?:END|end|完)\s*---'; display = '分隔线结束标记' }
        @{ pattern = '(?m)^\s*(?:本章完|全文完|未完待续|The\s+End|END|end|完)\s*$'; display = '独立行结束标记' }
    )
    $endMarkFound = @()
    foreach ($em in $endMarkPatterns) {
        $emm = [regex]::Matches($content, $em.pattern)
        if ($emm.Count -gt 0) {
            $endMarkFound += "$($em.display)(如: $($emm[0].Value.Trim()))"
        }
    }
    if ($endMarkFound.Count -gt 0) {
        $issues += @{ level = "ERROR"; check = "结束标记"; message = "正文禁止添加章节结束标记: $($endMarkFound -join '; ')" }
    } else {
        $issues += @{ level = "PASS"; check = "结束标记"; message = "未发现章节结束标记" }
    }

    }
    # === 检测12: 场景分隔符（禁止独占一行的纯符号分割） ===
    # 匹配独占一行的纯符号行：——、……、***、---、===、· · · 等
    $separatorPatterns = @(
        @{ pattern = '(?m)^\s*\u2014{1,4}\s*$';    display = '——（破折号分隔线）' }
        @{ pattern = '(?m)^\s*\u2026{1,4}\s*$';    display = '……（省略号分隔线）' }
        @{ pattern = '(?m)^\s*\*{3,}\s*$';          display = '***（星号分隔线）' }
        @{ pattern = '(?m)^\s*-{3,}\s*$';            display = '---（短横线分隔线）' }
        @{ pattern = '(?m)^\s*={3,}\s*$';            display = '===（等号分隔线）' }
        @{ pattern = '(?m)^\s*[·\u00b7\u2027][\s·\u00b7\u2027]*\s*$'; display = '· · ·（间隔号分隔线）' }
        @{ pattern = '(?m)^\s*#\s*$';                display = '#（井号分隔线）' }
    )
    $sepFound = @()
    foreach ($sp in $separatorPatterns) {
        $spm = [regex]::Matches($bodyText, $sp.pattern)
        if ($spm.Count -gt 0) {
            $sepFound += "$($sp.display)(共$($spm.Count)处)"
        }
    }
    if ($sepFound.Count -gt 0) {
        $issues += @{ level = "ERROR"; check = "场景分隔符"; message = "正文禁止独占一行的符号分隔，场景须叙事自然衔接: $($sepFound -join '; ')" }
    } else {
        $issues += @{ level = "PASS"; check = "场景分隔符"; message = "未发现场景分隔符" }
    }

    # === 检测11: 英文内容（正文中不允许出现英文单词） ===
    # 🔴 脚本仅列出英文单词供 AI 语义判断，不直接判定 ERROR
    # AI 负责区分：专有名词/缩写（如 CNN、GBU、WiFi）→ 合理使用，不算错误
    #             中文句子里混入普通英文词（如"他very开心"）→ ERROR
    # 排除章节标题行（第一行），只检测正文部分
    # 按行逐行检测，记录每个单词出现的所有行号 + 首次出现的上下文
    $bodyLineArray = $bodyText -split '\r?\n'
    $enWordLines = @{}    # word -> @(行号列表)
    $enWordCtx   = @{}    # word -> 首次出现的上下文字符串
    $enWordOrder = @()    # 保持首次出现顺序
    $contextRadius = 5
    for ($li = 0; $li -lt $bodyLineArray.Count; $li++) {
        $lineText = $bodyLineArray[$li]
        $lineMatches = [regex]::Matches($lineText, '[a-zA-Z]+')
        foreach ($m in $lineMatches) {
            $word = $m.Value
            $lineNum = $li + 2  # +2: 跳过标题行(+1) + 从1开始计数(+1)
            if (-not $enWordLines.ContainsKey($word)) {
                $enWordLines[$word] = @()
                $enWordOrder += $word
                # 记录首次出现的上下文
                $start = [math]::Max(0, $m.Index - $contextRadius)
                $end = [math]::Min($lineText.Length, $m.Index + $m.Length + $contextRadius)
                $enWordCtx[$word] = $lineText.Substring($start, $end - $start)
            }
            $enWordLines[$word] += $lineNum
        }
    }
    if ($enWordOrder.Count -gt 0) {
        $enDetails = @()
        foreach ($word in $enWordOrder) {
            $lines = ($enWordLines[$word] | Sort-Object -Unique) -join ','
            $ctx = $enWordCtx[$word]
            $enDetails += "[$word] 行${lines} ...${ctx}..."
        }
        $preview = ($enDetails | Select-Object -First 10) -join "; "
        $total = $enWordOrder.Count
        $more = if ($total -gt 10) { "（仅展示前10个，共${total}个）" } else { "（共${total}个）" }
        $issues += @{ level = "WARNING"; check = "英文内容"; message = "正文中发现英文单词（需AI判断是否为合理专有名词/缩写）: $preview $more" }
    } else {
        $issues += @{ level = "PASS"; check = "英文内容"; message = "未发现英文内容" }
    }

    return @{ chapter = $ChapterNum; wordCount = $wordCount; issues = $issues; fingerprint = $currentFp }
}

# ============================================================
# 输出函数
# ============================================================

function Format-Report {
    param($Result)

    $ch = $Result.chapter
    $issues = $Result.issues

    $criticals = ($issues | Where-Object { $_.level -eq "CRITICAL" }).Count
    $errors = ($issues | Where-Object { $_.level -eq "ERROR" }).Count
    $warnings = ($issues | Where-Object { $_.level -eq "WARNING" }).Count
    $passes = ($issues | Where-Object { $_.level -eq "PASS" }).Count

    $output = @{
        chapter   = $ch
        wordCount = $Result.wordCount
        status    = if ($criticals -gt 0 -or $errors -gt 0) { "FAIL" } elseif ($warnings -gt 0) { "WARN" } else { "PASS" }
        summary   = @{ critical = $criticals; error = $errors; warning = $warnings; pass = $passes }
        issues    = $issues
        fingerprint = $Result.fingerprint
    }

    return $output | ConvertTo-Json -Depth 5
}

# ============================================================
# 主流程
# ============================================================

if ($Chapter -eq "All") {
    $chaptersDir = Join-Path $novelDir "chapters"
    if (-not (Test-Path $chaptersDir)) {
        Write-Error "chapters 目录不存在: $chaptersDir"
        exit 1
    }
    $results = @()
    $dirs = Get-ChildItem $chaptersDir -Directory | Sort-Object Name
    foreach ($dir in $dirs) {
        $num = [int]$dir.Name
        $result = Validate-SingleChapter -ChapterNum $num
        $results += $result
    }
    $allOutput = @{
        mode    = "all"
        total   = $results.Count
        results = $results | ForEach-Object {
            @{
                chapter   = $_.chapter
                wordCount = $_.wordCount
                status    = if (($_.issues | Where-Object { $_.level -in @("CRITICAL","ERROR") }).Count -gt 0) { "FAIL" }
                           elseif (($_.issues | Where-Object { $_.level -eq "WARNING" }).Count -gt 0) { "WARN" }
                           else { "PASS" }
                issues    = $_.issues
            }
        }
    }
    $jsonResult = $allOutput | ConvertTo-Json -Depth 5
    $jsonResult

    # 生成 import-report.md（供 novel-import 步骤8使用）
    $validationDir = Join-Path $novelDir "validation"
    if (-not (Test-Path $validationDir)) { New-Item -ItemType Directory -Path $validationDir -Force | Out-Null }
    $reportPath = Join-Path $validationDir "import-report.md"

    $passCount = ($results | Where-Object { ($_.issues | Where-Object { $_.level -in @("CRITICAL","ERROR") }).Count -eq 0 -and ($_.issues | Where-Object { $_.level -eq "WARNING" }).Count -eq 0 }).Count
    $warnCount = ($results | Where-Object { ($_.issues | Where-Object { $_.level -in @("CRITICAL","ERROR") }).Count -eq 0 -and ($_.issues | Where-Object { $_.level -eq "WARNING" }).Count -gt 0 }).Count
    $failCount = ($results | Where-Object { ($_.issues | Where-Object { $_.level -in @("CRITICAL","ERROR") }).Count -gt 0 }).Count

    $reportLines = @()
    $reportLines += "# 全书一致性验证报告"
    $reportLines += ""
    $reportLines += "> 生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $reportLines += ""
    $reportLines += "## 总览"
    $reportLines += ""
    $reportLines += "| 指标 | 数值 |"
    $reportLines += "|------|------|"
    $reportLines += "| 总章数 | $($results.Count) |"
    $reportLines += "| 通过 | $passCount |"
    $reportLines += "| 警告 | $warnCount |"
    $reportLines += "| 失败 | $failCount |"
    $reportLines += ""
    $reportLines += "## 逐章结果"
    $reportLines += ""
    $reportLines += "| 章节 | 字数 | 状态 | 问题 |"
    $reportLines += "|------|------|------|------|"

    foreach ($r in $results) {
        $ch = $r.chapter
        $wc = $r.wordCount
        $errs = ($r.issues | Where-Object { $_.level -in @("CRITICAL","ERROR") }).Count
        $warns = ($r.issues | Where-Object { $_.level -eq "WARNING" }).Count
        $st = if ($errs -gt 0) { "FAIL" } elseif ($warns -gt 0) { "WARN" } else { "PASS" }
        $issueDescs = ($r.issues | Where-Object { $_.level -ne "PASS" } | ForEach-Object { "$($_.level): $($_.message)" }) -join "; "
        if (-not $issueDescs) { $issueDescs = "-" }
        $reportLines += "| $("{0:D3}" -f $ch) | $wc | $st | $issueDescs |"
    }

    $reportLines += ""
    $reportLines += "---"
    $reportLines += ""
    $reportLines += "*此报告由 validate-chapter.ps1 -Chapter All 自动生成，导入阶段的 WARNING/ERROR 仅记录不阻塞。*"

    $reportLines -join "`n" | Set-Content $reportPath -Encoding UTF8
    Write-Host "验证报告已写入: $reportPath"
} else {
    $chapterNum = [int]$Chapter
    $result = Validate-SingleChapter -ChapterNum $chapterNum
    Format-Report $result
}
