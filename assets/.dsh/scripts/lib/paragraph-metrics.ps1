<#
================================================================================
段落节奏公共库 — 人类成书基线的"绝对阈值"门控
================================================================================

🔴 为什么用绝对阈值，而不是"变异系数 CV"：
   实测 5 份专业文本（蛊真人 / 神秘复苏 / 光阴之外 / 道诡异仙 / 西游记）
   与 AI 产出的 CV 完全重叠，没有任何区分度——

     | 指标    | 人类成书区间 | AI 产出区间 | 能否区分 |
     |---------|--------------|-------------|----------|
     | 句长 CV | 0.53 ~ 0.86  | 0.58 ~ 0.88 | ❌ 重叠  |
     | 段长 CV | 0.38 ~ 1.13  | 0.55 ~ 0.72 | ❌ 重叠  |

   真正有区分度的是【绝对长度】和【极短段占比】。

🔴 人类成书基线（4 本现代网文各取 30 万字实测）：
    均段长       29.4 ~ 38.0 字   （中位 23 ~ 37）
    均句长       21.3 ~ 32.6 字   （中位 18 ~ 31）
    段落 <12 字   1.6% ~ 17.9%
    段落 ≥60 字   0.1% ~ 13.2%

🔴 AI 产出的典型病灶（女帝 1~90 章实测）：
    均段长 15.5 ~ 27.7 字（**低于人类下限 40%**）
    均句长 13.8 ~ 22.7 字
    <12 字段占比 14.3% ~ 43.4%
  反向病灶（第 110 章"一逗到底"）：均段 52.2 字、≥60 字段 35.6%

⚠️ 本流程中 reformat-chapter.ps1 会"逐句拆段"，因此【段落长度 ≈ 句子长度】。
   段长门与句长门在此流程下会同时触发，这是预期行为，不是重复报警。

🔴 分段口径（与 compute-style.ps1 / validate-chapter.ps1 完全一致，勿改）：
   优先按【空行】分段；若空行分段结果的均段 > 300 字，则降级为按【单换行】分段。
   ⚠️ 历史遗留章节常见"混排"（一部分段落用空行分隔、另一部分只换行不空行），
      这会让空行分段把多个句子并成一个大块，导致均段虚高、P75 异常大
      （实测女帝第 1~10 章：均段 149.1 / P50 17 / P75 198，而按"每行一段"口径只有 ~16~26）。
      规范化的新章节（经 reformat 处理）不存在此问题——每段都由空行分隔。
      判断遗留章节时，以 P50 而非均值为准，或参考 scripts/paragraph-audit.py 的"每行一段"口径。

用法：
    . (Join-Path $PSScriptRoot "lib/paragraph-metrics.ps1")
    $m = Get-ParagraphMetrics -Text $bodyText
    $issues = Get-ParagraphBandIssues -Metrics $m
================================================================================
#>

# 阈值（与人类成书区间对齐，留了安全余量）
# 🔴 两级设计：
#    WARNING 档 = 越过人类区间，但不离谱 → 需关注/可择期修
#    ERROR   档 = 严重偏离（约为人类区间边界的 1.5 倍）→ 必须回修，否则读者观感崩塌
$script:ParaBandThresholds = @{
    MinAvgSentence     = 22.0    # 人类下限 21.3 → WARNING
    MinAvgSentenceHard = 18.0    # 严重电报体 → ERROR
    MinAvgParagraph    = 22.0    # 人类下限 29.4 → WARNING
    MinAvgParagraphHard= 16.0    # 严重过碎 → ERROR
    MaxShortParaPct    = 25.0    # 人类上限 17.9% → WARNING
    MaxShortParaPctHard= 35.0    # → ERROR
    MaxLongParaPct     = 25.0    # 人类上限 13.2%（防"一逗到底"）→ WARNING
    MaxLongParaPctHard = 35.0    # → ERROR
    ShortParaLen       = 12      # "极短段"判定线
    LongParaLen        = 60      # "超长段"判定线
}

function Count-Cjk {
    <# 统计中文字符数（含中文标点），与各脚本口径一致 #>
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return 0 }
    return ([regex]::Matches($Text, '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2018-\u201f\u2026\u2014\u2013]')).Count
}

function Get-Percentile {
    param([double[]]$Values, [double]$P)
    if ($Values.Count -eq 0) { return 0 }
    $sorted = $Values | Sort-Object
    $idx = [math]::Min($sorted.Count - 1, [math]::Max(0, [int][math]::Floor($P * ($sorted.Count - 1))))
    return [math]::Round($sorted[$idx], 1)
}

function Get-ParagraphMetrics {
    <#
    计算段落/句长节奏指标。
    .PARAMETER Text 正文（应已去掉标题行）
    #>
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }

    # ---- 分句（与 compute-style / validate-chapter 同口径）----
    $sentences = $Text -split '[。！？…]+' | Where-Object { $_.Trim() -ne '' }
    $sentenceLens = @($sentences | ForEach-Object { Count-Cjk $_ } | Where-Object { $_ -gt 0 })
    $avgSentenceLen = if ($sentenceLens.Count -gt 0) {
        [math]::Round(($sentenceLens | Measure-Object -Average).Average, 1)
    } else { 0.0 }
    $medianSentenceLen = if ($sentenceLens.Count -gt 0) { Get-Percentile -Values $sentenceLens -P 0.5 } else { 0 }

    # ---- 分段（与 compute-style / validate-chapter 同口径：先双换行，>300字则降级单换行）----
    $paragraphs = ($Text -split '\r?\n\s*\r?\n') | Where-Object { $_.Trim() -ne '' }
    if ($paragraphs.Count -le 1) {
        $paragraphs = ($Text -split '\r?\n') | Where-Object { $_.Trim() -ne '' }
    } else {
        $checkLens = @($paragraphs | ForEach-Object { Count-Cjk $_ } | Where-Object { $_ -gt 0 })
        $checkAvg = if ($checkLens.Count -gt 0) { ($checkLens | Measure-Object -Average).Average } else { 0 }
        if ($checkAvg -gt 300) {
            $paragraphs = ($Text -split '\r?\n') | Where-Object { $_.Trim() -ne '' }
        }
    }
    $paraLens = @($paragraphs | ForEach-Object { Count-Cjk $_ } | Where-Object { $_ -gt 0 })
    if ($paraLens.Count -eq 0) { return $null }

    $avgParagraphLen = [math]::Round(($paraLens | Measure-Object -Average).Average, 1)
    $medianParagraphLen = Get-Percentile -Values $paraLens -P 0.5
    $p75ParagraphLen = Get-Percentile -Values $paraLens -P 0.75
    $shortCount = @($paraLens | Where-Object { $_ -lt $script:ParaBandThresholds.ShortParaLen }).Count
    $longCount = @($paraLens | Where-Object { $_ -ge $script:ParaBandThresholds.LongParaLen }).Count

    # ---- CV（保留输出供参考，但【不作为判定依据】）----
    $sCv = 0.0
    if ($sentenceLens.Count -ge 2 -and $avgSentenceLen -gt 0) {
        $std = 0.0
        foreach ($l in $sentenceLens) { $std += ($l - $avgSentenceLen) * ($l - $avgSentenceLen) }
        $sCv = [math]::Round([math]::Sqrt($std / $sentenceLens.Count) / $avgSentenceLen, 2)
    }
    $pCv = 0.0
    if ($paraLens.Count -ge 2 -and $avgParagraphLen -gt 0) {
        $std = 0.0
        foreach ($l in $paraLens) { $std += ($l - $avgParagraphLen) * ($l - $avgParagraphLen) }
        $pCv = [math]::Round([math]::Sqrt($std / $paraLens.Count) / $avgParagraphLen, 2)
    }

    return @{
        SentenceCount     = $sentenceLens.Count
        ParagraphCount    = $paraLens.Count
        AvgSentenceLen    = $avgSentenceLen
        MedianSentenceLen = $medianSentenceLen
        AvgParagraphLen   = $avgParagraphLen
        MedianParagraphLen= $medianParagraphLen
        P75ParagraphLen   = $p75ParagraphLen
        ShortParaPct      = [math]::Round($shortCount / $paraLens.Count * 100, 1)
        LongParaPct       = [math]::Round($longCount / $paraLens.Count * 100, 1)
        SentenceCv        = $sCv
        ParagraphCv       = $pCv
    }
}

function Get-ParagraphBandIssues {
    <#
    按人类基线判定节奏问题，返回 @{ Severity; Message } 数组（空数组 = 落在人类区间内）。
    Severity: 'ERROR'（严重偏离，必须回修） / 'WARNING'（越过人类区间，需关注）

    🔴 回修方向（重要）：必须【把短句改写成长句】（补细节/感官/因果/微动作），
       不要把多句硬挤进同一段——本流程的 reformat-chapter.ps1 会把每个句号重新拆成
       独立段落，合并段落会被下一次后处理打回原形，只有"句子本身变长"才是持久修复。
    #>
    param(
        [hashtable]$Metrics,
        [switch]$Quiet   # 兼容：不再使用，保留避免旧调用报错
    )
    $issues = @()
    if (-not $Metrics) { return $issues }
    $T = $script:ParaBandThresholds

    if ($Metrics.AvgSentenceLen -lt $T.MinAvgSentenceHard) {
        $issues += @{ Severity = 'ERROR'; Message = "句子过短: 均句 $($Metrics.AvgSentenceLen) 字，严重低于人类成书 21~33（红线 $($T.MinAvgSentence)）→ 电报体，必须把短句改写成长句。🔴 修复方式是把句子本身写长（补细节/感官/因果/微动作），不是把多句挤进一段——reformat-chapter.ps1 会把每个句号重新拆开" }
    } elseif ($Metrics.AvgSentenceLen -lt $T.MinAvgSentence) {
        $issues += @{ Severity = 'WARNING'; Message = "句子偏短: 均句 $($Metrics.AvgSentenceLen) 字（人类成书 21~33，红线 $($T.MinAvgSentence)）→ 补足句内信息量" }
    }

    if ($Metrics.AvgParagraphLen -lt $T.MinAvgParagraphHard) {
        $issues += @{ Severity = 'ERROR'; Message = "段落严重过碎: 均段 $($Metrics.AvgParagraphLen) 字（人类成书 29~38，红线 $($T.MinAvgParagraph)）" }
    } elseif ($Metrics.AvgParagraphLen -lt $T.MinAvgParagraph) {
        $issues += @{ Severity = 'WARNING'; Message = "段落偏碎: 均段 $($Metrics.AvgParagraphLen) 字（人类成书 29~38，红线 $($T.MinAvgParagraph)）" }
    }

    if ($Metrics.ShortParaPct -gt $T.MaxShortParaPctHard) {
        $issues += @{ Severity = 'ERROR'; Message = "极短段(<$($T.ShortParaLen)字)占比 $($Metrics.ShortParaPct)%，远超人类成书 1.6~17.9%（红线 $($T.MaxShortParaPct)%）→ 把过短的句子充实成长句" }
    } elseif ($Metrics.ShortParaPct -gt $T.MaxShortParaPct) {
        $issues += @{ Severity = 'WARNING'; Message = "极短段(<$($T.ShortParaLen)字)占比 $($Metrics.ShortParaPct)%（人类成书 1.6~17.9%，红线 $($T.MaxShortParaPct)%）" }
    }

    if ($Metrics.LongParaPct -gt $T.MaxLongParaPctHard) {
        $issues += @{ Severity = 'ERROR'; Message = "超长段(>=$($T.LongParaLen)字)占比 $($Metrics.LongParaPct)%，远超人类成书 0.1~13.2%（红线 $($T.MaxLongParaPct)%）→ 疑'一逗到底'。🔴 修复方式是在语义停顿处把长句断成 2~3 句（不是删内容）" }
    } elseif ($Metrics.LongParaPct -gt $T.MaxLongParaPct) {
        $issues += @{ Severity = 'WARNING'; Message = "超长段(>=$($T.LongParaLen)字)占比 $($Metrics.LongParaPct)%（人类成书 0.1~13.2%，红线 $($T.MaxLongParaPct)%）→ 疑'一逗到底'，需断句" }
    }

    return $issues
}

function Format-ParagraphBand {
    <# 单行摘要，供各脚本打印 #>
    param([hashtable]$Metrics)
    if (-not $Metrics) { return "(无正文)" }
    return "均句 $($Metrics.AvgSentenceLen) / 中位句 $($Metrics.MedianSentenceLen) / 均段 $($Metrics.AvgParagraphLen) / " +
           "中位段 $($Metrics.MedianParagraphLen) / <12字段 $($Metrics.ShortParaPct)% / >=60字段 $($Metrics.LongParaPct)%"
}
