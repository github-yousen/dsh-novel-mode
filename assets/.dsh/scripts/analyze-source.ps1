<#
.SYNOPSIS
    源书数值化预分析 + 反抄袭相似度检测
.DESCRIPTION
    两种模式：
    - 默认模式: 对源书章节进行六维数值化分析（字数/节奏/对话/钩子/情绪/卷结构）
    - similarity 模式: 对比源书与新大纲的文本相似度
.PARAMETER InputDir
    源书章节目录（默认 novel/source/chapters）
.PARAMETER Mode
    运行模式: "analyze"（默认）| "similarity"
.PARAMETER SourceDir
    相似度模式下的源书目录
.PARAMETER TargetFile
    相似度模式下的新大纲文件
.EXAMPLE
    pwsh -File .dsh/scripts/analyze-source.ps1 -InputDir "novel/source/chapters"
    pwsh -File .dsh/scripts/analyze-source.ps1 -Mode similarity -SourceDir "novel/source/chapters" -TargetFile "novel/outline.md"
#>

param(
    [string]$InputDir,
    [string]$Mode = "analyze",
    [string]$SourceDir,
    [string]$TargetFile
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
$sourceDir = Join-Path $novelDir "source"

if (-not $InputDir) { $InputDir = Join-Path $sourceDir "chapters" }

# ============================================================
# 工具函数
# ============================================================

function Count-ChineseChars {
    param([string]$Text)
    return ([regex]::Matches($Text, '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2018-\u201f\u2026\u2014\u2013]')).Count
}

function Get-DialogueRatio {
    param([string]$Text)
    $totalChars = Count-ChineseChars $Text
    if ($totalChars -eq 0) { return 0 }
    $dialogueMatches = [regex]::Matches($Text, '[\u201c][^\u201d]*[\u201d]')
    $dialogueChars = 0
    foreach ($m in $dialogueMatches) { $dialogueChars += Count-ChineseChars $m.Value }
    return [math]::Round($dialogueChars / $totalChars, 3)
}

function Get-HookScore {
    <# 估算章末钩子强度（基于关键词密度） #>
    param([string]$TailText)
    $hookWords = @('突然', '竟然', '但是', '却', '谁知', '没想到', '不对', '一个声音', '忽然',
                   '一道身影', '就在这时', '然而', '可是', '居然', '不好', '危险',
                   '来了', '出现', '难道', '莫非', '不可能', '怎么会', '秘密', '真相')
    $score = 0
    foreach ($word in $hookWords) {
        $matches = [regex]::Matches($TailText, [regex]::Escape($word))
        $score += $matches.Count
    }
    # 归一化到 1-5
    $normalized = [math]::Min(5, [math]::Max(1, [math]::Round($score / 2 + 1)))
    return $normalized
}

function Get-EmotionProfile {
    <# 统计情绪词频分布 #>
    param([string]$Text)
    $categories = @{
        action  = @('挥剑', '一拳', '闪避', '冲锋', '击杀', '爆发', '轰', '斩', '劈', '碎', '碰撞', '震荡', '战斗', '攻击', '防御', '冲击')
        sweet   = @('温柔', '微笑', '心跳', '脸红', '牵手', '拥抱', '喜欢', '爱', '甜蜜', '温暖', '幸福', '在意', '关心', '心疼')
        tension = @('紧张', '危险', '恐惧', '害怕', '不安', '焦虑', '威胁', '陷阱', '包围', '绝境', '死亡', '杀意', '惊恐', '颤抖')
        humor   = @('哈哈', '笑', '有趣', '搞笑', '逗', '乐', '好笑', '滑稽', '吐槽', '无语', '黑线', '翻白眼')
        sad     = @('悲伤', '流泪', '痛苦', '心碎', '绝望', '失去', '牺牲', '遗憾', '孤独', '怀念', '离别', '死')
    }
    $result = @{}
    foreach ($cat in $categories.Keys) {
        $count = 0
        foreach ($word in $categories[$cat]) {
            $count += ([regex]::Matches($Text, [regex]::Escape($word))).Count
        }
        $result[$cat] = $count
    }
    return $result
}

# ============================================================
# 模式: 相似度检测
# ============================================================

if ($Mode -eq "similarity") {
    if (-not $SourceDir) { $SourceDir = Join-Path $sourceDir "chapters" }
    if (-not $TargetFile) { $TargetFile = Join-Path $novelDir "outline.md" }

    if (-not (Test-Path $SourceDir)) {
        @{ success = $false; error = "源书目录不存在: $SourceDir" } | ConvertTo-Json
        exit 1
    }
    if (-not (Test-Path $TargetFile)) {
        @{ success = $false; error = "目标文件不存在: $TargetFile" } | ConvertTo-Json
        exit 1
    }

    $targetContent = Get-Content $TargetFile -Raw -Encoding UTF8

    # --- 提取源书所有专有名词（2-4字中文词，高频出现） ---
    $allSourceText = ""
    $chapDirs = Get-ChildItem $SourceDir -Directory -ErrorAction SilentlyContinue | Sort-Object Name
    foreach ($dir in $chapDirs) {
        $contentFile = Join-Path $dir.FullName "content.md"
        if (Test-Path $contentFile) {
            $allSourceText += Get-Content $contentFile -Raw -Encoding UTF8
        }
    }

    # 提取高频中文词组（简化版：提取角色名模式的高频词）
    $namePatterns = [regex]::Matches($allSourceText, '[\u4e00-\u9fff]{2,4}(?:说|道|笑|喊|叫|问|答|叹|怒)')
    $nameCounts = @{}
    foreach ($m in $namePatterns) {
        $name = $m.Value -replace '(说|道|笑|喊|叫|问|答|叹|怒)$', ''
        if (-not $nameCounts.ContainsKey($name)) { $nameCounts[$name] = 0 }
        $nameCounts[$name]++
    }
    $sourceNames = $nameCounts.GetEnumerator() | Where-Object { $_.Value -ge 5 } | ForEach-Object { $_.Key }

    # 检测新大纲中是否包含源书角色名
    $nameOverlap = @()
    foreach ($name in $sourceNames) {
        if ($targetContent.Contains($name)) {
            $nameOverlap += $name
        }
    }

    # --- N-gram 文本重叠检测（3-gram） ---
    function Get-NGrams {
        param([string]$Text, [int]$N = 3)
        $chars = [regex]::Matches($Text, '[\u4e00-\u9fff]') | ForEach-Object { $_.Value }
        $grams = @{}
        for ($i = 0; $i -le $chars.Count - $N; $i++) {
            $gram = ($chars[$i..($i+$N-1)]) -join ''
            if (-not $grams.ContainsKey($gram)) { $grams[$gram] = 0 }
            $grams[$gram]++
        }
        return $grams
    }

    # 从源书中随机采样（避免全量计算太慢）
    $sampleSize = [math]::Min(20, $chapDirs.Count)
    $sampleIndices = 0..($chapDirs.Count - 1) | Get-Random -Count $sampleSize
    $sampleText = ""
    foreach ($idx in $sampleIndices) {
        $contentFile = Join-Path $chapDirs[$idx].FullName "content.md"
        if (Test-Path $contentFile) {
            $sampleText += Get-Content $contentFile -Raw -Encoding UTF8
        }
    }

    $sourceGrams = Get-NGrams $sampleText
    $targetGrams = Get-NGrams $targetContent

    $overlapCount = 0
    $targetTotal = ($targetGrams.Values | Measure-Object -Sum).Sum
    foreach ($gram in $targetGrams.Keys) {
        if ($sourceGrams.ContainsKey($gram)) {
            $overlapCount += [math]::Min($targetGrams[$gram], $sourceGrams[$gram])
        }
    }
    $overlapRate = if ($targetTotal -gt 0) { [math]::Round($overlapCount / $targetTotal * 100, 1) } else { 0 }

    # --- 提取源书地名/组织名（高频2-4字词，排除常见词） ---
    $commonWords = @('一个', '没有', '什么', '不是', '可以', '这个', '那个', '他们', '我们', '自己',
                     '已经', '知道', '时候', '现在', '还是', '就是', '不过', '因为', '所以', '如果',
                     '但是', '虽然', '然后', '之后', '出来', '起来', '下去', '过来', '回去',
                     '觉得', '开始', '看着', '这样', '那样', '一下', '一些', '很多', '非常', '怎么',
                     '这里', '那里', '哪里', '还有', '只是', '只有', '这么', '那么', '一定', '应该',
                     '不会', '不能', '不要', '不知', '为什么', '的时候', '的样子', '一样', '一直', '终于',
                     '忽然', '突然', '居然', '果然', '竟然', '似乎', '仿佛', '慢慢', '轻轻', '静静',
                     '默默', '微微', '渐渐', '终于', '忍不住', '不由得', '只好', '于是', '连忙', '立刻',
                     '马上', '赶紧', '急忙', '随后', '接着', '同时', '此时', '这时', '那时', '之前',
                     '以后', '以前', '心里', '眼前', '面前', '身边', '手中', '口中', '脸上', '身上',
                     '头上', '手上', '眼中', '心中', '身后', '一声', '一步', '一眼', '一口', '两人',
                     '三人', '众人', '对方', '所有', '其他', '任何', '每个', '整个', '各种', '全部')
    $wordCounts = @{}
    $wordMatches = [regex]::Matches($allSourceText, '[\u4e00-\u9fff]{2,4}')
    foreach ($m in $wordMatches) {
        $w = $m.Value
        if ($w -notin $commonWords) {
            if (-not $wordCounts.ContainsKey($w)) { $wordCounts[$w] = 0 }
            $wordCounts[$w]++
        }
    }
    # 取高频特征词（出现>50次，可能是地名/组织名/功法名等专有名词）
    $highFreqWords = $wordCounts.GetEnumerator() | Where-Object { $_.Value -ge 50 } |
                     Sort-Object Value -Descending | Select-Object -First 100 | ForEach-Object { $_.Key }

    $locationOverlap = @()
    foreach ($word in $highFreqWords) {
        if ($targetContent.Contains($word) -and $word -notin $commonWords) {
            $locationOverlap += $word
        }
    }

    @{
        success         = $true
        mode            = "similarity"
        ngramOverlap    = $overlapRate
        ngramThreshold  = 15.0
        ngramPass       = ($overlapRate -lt 15.0)
        nameOverlap     = $nameOverlap
        namePass        = ($nameOverlap.Count -eq 0)
        locationOverlap = $locationOverlap
        locationCount   = $locationOverlap.Count
    } | ConvertTo-Json -Depth 5
    exit 0
}

# ============================================================
# 模式: 数值化预分析
# ============================================================

if (-not (Test-Path $InputDir)) {
    @{ success = $false; error = "章节目录不存在: $InputDir" } | ConvertTo-Json
    exit 1
}

$chapDirs = Get-ChildItem $InputDir -Directory -ErrorAction SilentlyContinue | Sort-Object Name

if ($chapDirs.Count -eq 0) {
    @{ success = $false; error = "未找到任何章节目录" } | ConvertTo-Json
    exit 1
}

Write-Host "开始分析源书，共 $($chapDirs.Count) 章..."

# ============================================================
# 逐章分析
# ============================================================

$chapters = @()
$totalChars = 0

foreach ($dir in $chapDirs) {
    $chapterNum = [int]$dir.Name
    $contentPath = Join-Path $dir.FullName "content.md"

    if (-not (Test-Path $contentPath)) {
        Write-Host "  跳过 第${chapterNum}章 (无 content.md)"
        continue
    }

    $content = Get-Content $contentPath -Raw -Encoding UTF8
    $charCount = Count-ChineseChars $content
    $totalChars += $charCount

    # 对话占比
    $dialogueRatio = Get-DialogueRatio $content

    # 章末钩子强度
    $tailLength = [math]::Min(200, $content.Length)
    $tailText = $content.Substring($content.Length - $tailLength)
    $hookScore = Get-HookScore $tailText

    # 情绪分布
    $emotions = Get-EmotionProfile $content

    # 句长统计
    $sentences = $content -split '[。！？…]+' | Where-Object { $_.Trim() -ne '' }
    $sentenceLens = $sentences | ForEach-Object { Count-ChineseChars $_ } | Where-Object { $_ -gt 0 }
    $avgSentLen = if ($sentenceLens.Count -gt 0) {
        [math]::Round(($sentenceLens | Measure-Object -Average).Average, 1)
    } else { 0 }

    $chapters += @{
        chapter        = $chapterNum
        charCount      = $charCount
        dialogueRatio  = $dialogueRatio
        hookScore      = $hookScore
        avgSentenceLen = $avgSentLen
        emotions       = $emotions
    }

    if ($chapterNum % 20 -eq 0) {
        Write-Host "  已分析 ${chapterNum} 章..."
    }
}

# ============================================================
# 全书统计
# ============================================================

$totalChapters = $chapters.Count
$avgChapterLen = if ($totalChapters -gt 0) { [math]::Round($totalChars / $totalChapters) } else { 0 }

# 字数波动 — 标记波峰（高潮章）和波谷（过渡章）
$charCounts = $chapters | ForEach-Object { $_.charCount }
$avgLen = $avgChapterLen
$stdDev = 0
if ($charCounts.Count -gt 1) {
    $sumSq = ($charCounts | ForEach-Object { ($_ - $avgLen) * ($_ - $avgLen) } | Measure-Object -Sum).Sum
    $stdDev = [math]::Sqrt($sumSq / ($charCounts.Count - 1))
}

$peakChapters = @()  # 高潮章（字数显著高于均值）
$valleyChapters = @()  # 过渡章（字数显著低于均值）
foreach ($ch in $chapters) {
    if ($ch.charCount -gt $avgLen + $stdDev) { $peakChapters += $ch.chapter }
    if ($ch.charCount -lt $avgLen - $stdDev) { $valleyChapters += $ch.chapter }
}

# 爽点周期估算（相邻波峰间隔）
$peakIntervals = @()
for ($i = 1; $i -lt $peakChapters.Count; $i++) {
    $peakIntervals += ($peakChapters[$i] - $peakChapters[$i - 1])
}
$avgPeakCycle = if ($peakIntervals.Count -gt 0) {
    [math]::Round(($peakIntervals | Measure-Object -Average).Average, 1)
} else { 0 }

# 对话占比统计
$dialogueRatios = $chapters | ForEach-Object { $_.dialogueRatio }
$avgDialogue = if ($dialogueRatios.Count -gt 0) {
    [math]::Round(($dialogueRatios | Measure-Object -Average).Average, 3)
} else { 0 }

# 钩子密度统计
$hookScores = $chapters | ForEach-Object { $_.hookScore }
$avgHookScore = if ($hookScores.Count -gt 0) {
    [math]::Round(($hookScores | Measure-Object -Average).Average, 1)
} else { 0 }

# 情绪分布汇总
$emotionTotals = @{ action = 0; sweet = 0; tension = 0; humor = 0; sad = 0 }
foreach ($ch in $chapters) {
    foreach ($cat in $ch.emotions.Keys) {
        $emotionTotals[$cat] += $ch.emotions[$cat]
    }
}
$emotionTotal = ($emotionTotals.Values | Measure-Object -Sum).Sum
$emotionDistribution = @{}
foreach ($cat in $emotionTotals.Keys) {
    $emotionDistribution[$cat] = if ($emotionTotal -gt 0) {
        [math]::Round($emotionTotals[$cat] / $emotionTotal * 100, 1)
    } else { 0 }
}

# 卷结构估算（按大波谷位置划分）
$volumeBreaks = @()
$windowSize = 5
for ($i = $windowSize; $i -lt $chapters.Count - $windowSize; $i++) {
    $localAvg = ($chapters[($i-$windowSize)..($i+$windowSize)] | ForEach-Object { $_.charCount } | Measure-Object -Average).Average
    if ($chapters[$i].charCount -lt $localAvg * 0.7 -and $chapters[$i].hookScore -le 2) {
        # 可能是卷分隔点
        if ($volumeBreaks.Count -eq 0 -or ($chapters[$i].chapter - $volumeBreaks[-1]) -gt 10) {
            $volumeBreaks += $chapters[$i].chapter
        }
    }
}

# ============================================================
# 输出 JSON
# ============================================================

$analysisJson = @{
    success        = $true
    totalChapters  = $totalChapters
    totalChars     = $totalChars
    avgChapterLen  = $avgChapterLen
    stdDevLen      = [math]::Round($stdDev, 0)

    rhythm         = @{
        peakChapters     = $peakChapters
        valleyChapters   = $valleyChapters
        avgPeakCycle     = $avgPeakCycle
        peakRatio        = if ($totalChapters -gt 0) { [math]::Round($peakChapters.Count / $totalChapters * 100, 1) } else { 0 }
    }

    dialogue       = @{
        avgRatio         = $avgDialogue
        perChapter       = ($chapters | ForEach-Object { @{ chapter = $_.chapter; ratio = $_.dialogueRatio } })
    }

    hooks          = @{
        avgScore         = $avgHookScore
        perChapter       = ($chapters | ForEach-Object { @{ chapter = $_.chapter; score = $_.hookScore } })
    }

    emotions       = @{
        distribution     = $emotionDistribution
        perChapter       = ($chapters | ForEach-Object { @{ chapter = $_.chapter; emotions = $_.emotions } })
    }

    structure      = @{
        suggestedBreaks  = $volumeBreaks
        suggestedVolumes = $volumeBreaks.Count + 1
    }

    chapters       = ($chapters | ForEach-Object {
        @{
            chapter        = $_.chapter
            charCount      = $_.charCount
            dialogueRatio  = $_.dialogueRatio
            hookScore      = $_.hookScore
            avgSentenceLen = $_.avgSentenceLen
        }
    })
}

$jsonPath = Join-Path $sourceDir "analysis.json"
$analysisJson | ConvertTo-Json -Depth 10 | Set-Content $jsonPath -Encoding UTF8

# ============================================================
# 输出人类可读摘要
# ============================================================

$summary = @"
=== 源书数值化分析摘要 ===

【基础统计】
- 总章数: $totalChapters 章
- 总字数: $totalChars 字 ($([math]::Round($totalChars/10000, 1))万字)
- 平均章节: $avgChapterLen 字/章 (标准差: $([math]::Round($stdDev, 0)))

【节奏指纹】
- 高潮章(波峰): $($peakChapters.Count) 章 ($([math]::Round($peakChapters.Count/$totalChapters*100, 1))%)
- 过渡章(波谷): $($valleyChapters.Count) 章
- 爽点周期: 平均每 $avgPeakCycle 章一个高潮
- 张弛比估算: $([math]::Round(($totalChapters - $valleyChapters.Count) / [math]::Max(1, $valleyChapters.Count), 1)):1

【对话/叙事比】
- 全书对话占比: $([math]::Round($avgDialogue * 100, 1))%

【钩子密度】
- 平均钩子强度: $avgHookScore / 5

【情绪分布】
- 动作/战斗: $($emotionDistribution['action'])%
- 甜蜜/情感: $($emotionDistribution['sweet'])%
- 紧张/悬疑: $($emotionDistribution['tension'])%
- 幽默/轻松: $($emotionDistribution['humor'])%
- 悲伤/沉重: $($emotionDistribution['sad'])%

【卷结构】
- 建议分卷: $($volumeBreaks.Count + 1) 卷
- 分卷节点: $(if($volumeBreaks.Count -gt 0) { $volumeBreaks -join ', ' } else { '未检测到明显分卷点' })
"@

$summaryPath = Join-Path $sourceDir "analysis-summary.txt"
Set-Content $summaryPath $summary -Encoding UTF8

Write-Host "`n✓ 分析完成"
Write-Host "  JSON数据: $jsonPath"
Write-Host "  可读摘要: $summaryPath"
Write-Host "  总章数: $totalChapters | 总字数: $totalChars | 平均: $avgChapterLen 字/章"
