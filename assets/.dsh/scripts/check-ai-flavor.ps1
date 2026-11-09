<#
.SYNOPSIS
    检查章节正文的"AI味"参考信号（基于权威研究指标，不设硬门禁）。

.DESCRIPTION
    依据《LLM 写作去 AI 味研究》(MasterLee) / 社科院语言所 / 马良写作 AI 味检测工具
    的可实证指标做机械扫描，输出参考信号。

    🔴 重要设计原则（研究结论）：
    - "检测结果只能作参考信号，不能作为绝对判据"——本脚本【不设 ERROR 阻断】，
      只输出 WARNING；仅当【多重信号叠加命中】时才建议主会话回修。
    - 短句多 ≠ AI味；但【句子普遍过短】= 电报体，是最强的可测信号（见 ④，按绝对长度判定）
    - 🔴 原"句长变异系数 CV / 低突发性"指标已废弃——实测与人类成书完全重叠，无区分度
    - "的"字高频 ≠ AI味（结构助词）；可靠指标是【语气词缺失】（人类语气词是AI的4倍）

    语义层面（无内心流/无留白/情绪贴标签）由 novel-writer 的【去AI味规则】和主会话覆盖。

.PARAMETER Chapter
    要检测的章节号 N（三位补零）。

.PARAMETER All
    检测全部章节（用于批量回归扫描）。

.PARAMETER ProjectRoot
    可选。项目根目录（含 novel/ 的那个目录）。共享 .dsh 多项目场景下必须显式传入。

.OUTPUTS
    按 [AI味参考] 输出命中项；无 ERROR 阻断，退出码恒为 0（信号仅供主会话参考）。

.EXAMPLE
    pwsh -NoProfile -File .dsh/scripts/check-ai-flavor.ps1 -Chapter 5
    pwsh -NoProfile -File .dsh/scripts/check-ai-flavor.ps1 -Chapter 5 -ProjectRoot "d:\temp\novel\new"
#>

param(
    [Parameter(Mandatory = $false)]
    [int]$Chapter,
    [switch]$All,
    [string]$ProjectRoot
)

$ErrorActionPreference = "Stop"

# ============ 路径解析（与 build-context-bundle.ps1 一致，支持共享 .dsh 多项目场景） ============
if ($ProjectRoot) {
    $projectRoot = $ProjectRoot
} elseif ([string]::IsNullOrEmpty($PSScriptRoot)) {
    $projectRoot = (Get-Location).Path
} else {
    $projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}
$novelDir = Join-Path $projectRoot "novel"
if (-not (Test-Path (Join-Path $novelDir "constitution"))) {
    $cwdNovel = Join-Path (Get-Location).Path "novel"
    if (Test-Path (Join-Path $cwdNovel "constitution")) {
        $projectRoot = (Get-Location).Path
        $novelDir = $cwdNovel
    } else {
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
$chaptersDir = Join-Path $novelDir "chapters"

# ============ 段落节奏公共库（人类成书基线绝对阈值） ============
$script:ParaLibLoaded = $false
if (-not [string]::IsNullOrEmpty($PSScriptRoot)) {
    $paraLib = Join-Path $PSScriptRoot "lib/paragraph-metrics.ps1"
    if (Test-Path $paraLib) {
        . $paraLib
        $script:ParaLibLoaded = $true
    }
}

# ============ 检测规则（依据权威研究） ============

# ① AI 高频词黑名单（马良工具 + MasterLee + 社科院，中文通用）
$aiHighFreqWords = @(
    '值得注意的是', '综上所述', '总而言之', '与此同时', '不仅如此',
    '此外', '然而', '总之', '具有重要意义', '发挥着关键作用',
    '不难发现', '由此可见', '众所周知', '不可否认', '毋庸置疑',
    '显而易见', '从某种意义上说', '在一定程度上', '进一步来说',
    '换句话说', '总的来说', '因此', '因而', '更重要的是',
    '值得一提的是', '首先', '其次', '最后', '随着.*的发展',
    '一方面', '另一方面'
)

# ② AI 模板句式（否定式排比 / 连续否定——研究确认的高辨识句式）
$aiSentencePatterns = @(
    '这不是[^。]{1,20}，而是[^。]{1,20}',
    '不是[^。]{0,10}。不是[^。]{0,10}。'
)

# ③ 语气词（人类语气词约为 AI 的 4 倍，缺失 = AI 信号）
$toneWords = @('吧', '呢', '啊', '嘛', '啧', '唉', '哈', '嗯', '么', '咧')

# ④ 四字格 / 名词化（AI 四字格约为人类 3 倍）—— 仅统计常见文言四字连接，避免误伤正常成语
$stiffFour = @('何尝', '犹如', '宛若', '仿若', '所谓', '无疑', '诚然', '换言之', '抑或', '继而')

# ============ 收集待检测文件 ============
$targets = @()
if ($All) {
    $dirs = Get-ChildItem $chaptersDir -Directory | Where-Object { $_.Name -match '^\d{3}$' } | Sort-Object Name
    foreach ($d in $dirs) {
        $cf = Join-Path $d.FullName "content.md"
        if (Test-Path $cf) { $targets += $cf }
    }
} elseif ($Chapter) {
    $targets += Join-Path (Join-Path $chaptersDir ("{0:D3}" -f $Chapter)) "content.md"
} else {
    Write-Error "必须提供 -Chapter N 或 -All"
    exit 1
}

foreach ($contentFile in $targets) {
    if (-not (Test-Path $contentFile)) {
        Write-Host "ⓘ 跳过（不存在）: $contentFile"
        continue
    }
    $chapName = Split-Path (Split-Path $contentFile -Parent) -Leaf
    Write-Host "─── AI味参考检测: 第${chapName}章 ───"

    $lines = Get-Content $contentFile -Encoding UTF8
    $bodyLines = @($lines | Where-Object { $_ -match '\S' } | Select-Object -Skip 1)
    $bodyText = ($bodyLines -join "`n")

    $hits = @()   # 命中的参考信号
    $weak = 0     # 弱信号计数（多重叠加才建议）

    # ---- ① AI 高频词 ----
    foreach ($w in $aiHighFreqWords) {
        $m = [regex]::Matches($bodyText, $w)
        $cnt = $m.Count
        if ($cnt -gt 0) {
            $hits += "AI高频词『$w』x${cnt}"
            $weak += $cnt
        }
    }

    # ---- ② 模板句式 ----
    foreach ($p in $aiSentencePatterns) {
        $m = [regex]::Matches($bodyText, $p)
        $cnt = $m.Count
        if ($cnt -gt 0) {
            $hits += "模板句式命中 x${cnt}（$p）"
            $weak += $cnt
        }
    }

    # ---- ③ 语气词缺失（可靠信号：人类语气词是AI的4倍）----
    $toneTotal = 0
    foreach ($t in $toneWords) {
        $toneTotal += ([regex]::Matches($bodyText, [regex]::Escape($t))).Count
    }
    $totalChars = ([regex]::Matches($bodyText, '[\u4e00-\u9fff]')).Count
    if ($totalChars -gt 500 -and $toneTotal -eq 0) {
        $hits += "整章无语气词（吧/呢/啊/嘛/啧等）：语气平板，缺口语感"
        $weak += 2
    } elseif ($toneTotal -lt 3) {
        $hits += "语气词过少（仅${toneTotal}个）：口语衔接不足"
        $weak += 1
    }

    # ---- ④ 段落/句长绝对分布（🔴 取代原"句长变异系数 CV"）----
    # 📌 原 CV 指标已废弃：实测 5 份专业文本（蛊真人/神秘复苏/光阴之外/道诡异仙/西游记）
    #    句长 CV 0.53~0.86、段长 CV 0.38~1.13，与 AI 产出（0.58~0.88 / 0.55~0.72）完全重叠，
    #    阈值 0.4 从未触发过，属于"看起来科学但没有区分度"的指标。
    #    真正有区分度的是【绝对长度】与【极短段占比】，见 lib/paragraph-metrics.ps1 基线注释。
    if ($script:ParaLibLoaded) {
        $bandMetrics = Get-ParagraphMetrics -Text $bodyText
        $bandIssues = Get-ParagraphBandIssues -Metrics $bandMetrics
        foreach ($bi in $bandIssues) {
            $hits += "段落节奏 [$(if ($bi.Severity -eq 'ERROR') { '严重' } else { '轻度' })] $($bi.Message)"
            $weak += $(if ($bi.Severity -eq 'ERROR') { 3 } else { 2 })
        }
        if ($bandIssues.Count -eq 0) {
            Write-Host ("  ✓ 段落节奏落在人类成书区间（" + (Format-ParagraphBand -Metrics $bandMetrics) + "）")
        }
    }

    # ---- ⑤ 文言四字/名词化堆砌（AI 四字格约为人类 3 倍，仅统计机械连接类）----
    $fourTotal = 0
    foreach ($f in $stiffFour) {
        $fourTotal += ([regex]::Matches($bodyText, [regex]::Escape($f))).Count
    }
    if ($fourTotal -ge 5) {
        $hits += "文言四字/名词化连接过多（${fourTotal}处）：书面腔重"
        $weak += 1
    }

    # ---- ⑥ 破折号成瘾（人类2-3个，AI 20+）----
    $dashCount = ([regex]::Matches($bodyText, '——')).Count
    if ($dashCount -ge 15) {
        $hits += "破折号过多（${dashCount}处）：刻意强调痕迹重"
        $weak += 1
    }

    # ---- ⑦ 叹号 / 省略号（⚠️ 非可靠指标，仅极极端时提示；搞笑/高情绪文风叹号多是正常表达）----
    $bangCount = ([regex]::Matches($bodyText, '！')).Count
    $ellipsisCount = ([regex]::Matches($bodyText, '……')).Count
    if ($bangCount -gt 50) { $hits += "叹号 ${bangCount} 个（极极端）"; $weak += 1 }
    if ($ellipsisCount -gt 30) { $hits += "省略号 ${ellipsisCount} 处（极极端）"; $weak += 1 }

    # ---- 输出与建议 ----
    if ($hits.Count -eq 0) {
        Write-Host "  ✓ 未命中明显 AI 味信号（正文 ${totalChars} 字，句数 $($lens.Count)）"
    } else {
        foreach ($h in $hits) {
            Write-Host "  [AI味参考] $h"
        }
        if ($weak -ge 4) {
            Write-Host "  → 多重信号叠加（${weak}点），建议主会话按【去AI味规则】做最小回修"
        } else {
            Write-Host "  → 轻信号（${weak}点），可暂不处理，记录到章节报告"
        }
    }
    Write-Host "  ✓ 第${chapName}章检测完成"
    Write-Host ""
}

Write-Host "━━━ AI味参考检测结束（无硬门禁，信号供主会话判断） ━━━"
exit 0
