<#
.SYNOPSIS
    章节设计稿验证脚本 — 校验 design.md 的格式结构和硬性约束
.DESCRIPTION
    检测项:
    0. 格式结构（必要段落是否齐全、表格列是否完整、场景详细规划是否存在）
    1. 场景篇幅占比信息完整，且场景数 ∈ [3, 5]
    2. 出场角色在 constitution/characters/ 目录中有对应文件
    3. 回收的伏笔 ID 在 state.yaml 的 active 列表中

.PARAMETER Chapter
    章节号（数字）
.EXAMPLE
    pwsh -File .dsh/scripts/validate-design.ps1 -Chapter 15
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
$constitutionDir = Join-Path $novelDir "constitution"
$charsDir = Join-Path $constitutionDir "characters"
$statePath = Join-Path $novelDir "state.yaml"

$chapDir = Join-Path $novelDir "chapters" ("{0:D3}" -f $Chapter)
$designPath = Join-Path $chapDir "design.md"

$issues = @()

# ============================================================
# 检查 design.md 是否存在
# ============================================================

if (-not (Test-Path $designPath)) {
    $issues += @{ level = "ERROR"; check = "文件"; message = "设计稿不存在: $designPath" }
    @{ chapter = $Chapter; issues = $issues } | ConvertTo-Json -Depth 5
    exit 0
}

$content = Get-Content $designPath -Raw -Encoding UTF8
$lines = $content -split '\r?\n'

# ============================================================
# 检测0: 格式结构校验（按模板必要段落逐项检测）
# ============================================================

$structureErrors = @()
$structurePass = 0

# --- 0.1 必要二级段落检测 ---
$requiredSections = @(
    @{ name = '上文状态';  pattern = '(?m)^##\s+上文状态' },
    @{ name = '本章目标';  pattern = '(?m)^##\s+本章目标' },
    @{ name = '场景规划';  pattern = '(?m)^##\s+场景规划' },
    @{ name = '开篇承接锚点'; pattern = '(?m)^###\s+开篇承接锚点' },
    @{ name = '写作硬约束（本章）'; pattern = '(?m)^###\s+写作硬约束（本章）' },
    @{ name = '角色写作提示（仅本章出场角色）'; pattern = '(?m)^###\s+角色写作提示（仅本章出场角色）' },
    @{ name = '伏笔必引细节（仅回收项）'; pattern = '(?m)^###\s+伏笔必引细节（仅回收项）' },
    @{ name = '关键资产快照（本章会用到的）'; pattern = '(?m)^###\s+关键资产快照（本章会用到的）' },
    @{ name = '设定增量';  pattern = '(?m)^##\s+设定增量' }
)

foreach ($sec in $requiredSections) {
    if ($content -notmatch $sec.pattern) {
        $structureErrors += "缺少必要段落: ## $($sec.name)"
    } else {
        $structurePass++
    }
}

# --- 0.2 本章目标子段落检测 ---
$requiredSubSections = @(
    @{ name = '主线推进';  pattern = '(?m)^###\s+主线推进' },
    @{ name = '伏笔操作';  pattern = '(?m)^###\s+伏笔操作' },
    @{ name = '角色发展';  pattern = '(?m)^###\s+角色发展' }
)

foreach ($sub in $requiredSubSections) {
    if ($content -notmatch $sub.pattern) {
        $structureErrors += "缺少本章目标子段落: ### $($sub.name)"
    } else {
        $structurePass++
    }
}

# --- 0.3 上文状态必要字段检测 ---
$stateSection = [regex]::Match($content, '(?si)##\s+上文状态(.*?)(?=\n---|\n##[^#]|\z)')
if ($stateSection.Success) {
    $stateText = $stateSection.Groups[1].Value
    if ($stateText -notmatch '时间线') {
        $structureErrors += "上文状态缺少「时间线」字段"
    } else { $structurePass++ }
    if ($stateText -notmatch '角色位置') {
        $structureErrors += "上文状态缺少「角色位置」字段"
    } else { $structurePass++ }
}

# --- 0.4 场景规划表格列完整性检测 ---
$requiredCols = @('场景', '出场角色', '情绪走向', '场景类型', '反应节拍')

$tableHeaderLine = $null
foreach ($line in $lines) {
    if ($line -match '^\|' -and $line -match '场景' -and ($line -match '篇幅占比' -or $line -match '字数预算')) {
        $tableHeaderLine = $line
        break
    }
}

if ($null -eq $tableHeaderLine) {
    $structureErrors += "未找到场景规划表格（需包含「场景」「篇幅占比」列的表头行）"
} else {
    $headerCols = $tableHeaderLine -split '\|' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    foreach ($reqCol in $requiredCols) {
        if ($reqCol -notin $headerCols) {
            $structureErrors += "场景规划表格缺少「$reqCol」列"
        } else {
            $structurePass++
        }
    }

    if ('篇幅占比' -in $headerCols -or '字数预算' -in $headerCols) {
        $structurePass++
    } else {
        $structureErrors += "场景规划表格缺少「篇幅占比」列"
    }
}

# --- 0.5 场景详细规划检测 ---
$hasDetailSection = $content -match '(?m)^###\s+场景详细规划'
if (-not $hasDetailSection) {
    # 兜底：也接受直接写"**场景1"这种格式
    $hasDetailSection = $content -match '\*\*场景\d+[：:]'
}

if (-not $hasDetailSection) {
    $structureErrors += "缺少「场景详细规划」段（每个场景需有切入方式/目的/障碍/结果）"
} else {
    $structurePass++
    # 检测详细规划中是否包含必要子字段
    $detailSection = [regex]::Match($content, '(?si)(?:###\s+场景详细规划|\*\*场景1[：:])(.*?)(?=\n---|\n##[^#]|\z)')
    if ($detailSection.Success) {
        $detailText = $detailSection.Groups[1].Value
        $detailFields = @('切入方式', '目的', '障碍', '结果', '反应节拍')

        foreach ($field in $detailFields) {
            if ($detailText -notmatch $field) {
                $structureErrors += "场景详细规划缺少「$field」字段"
            } else {
                $structurePass++
            }
        }
    }
}

# --- 0.6 汇总输出 ---
if ($structureErrors.Count -gt 0) {
    $issues += @{ level = "ERROR"; check = "格式结构"; message = "发现 $($structureErrors.Count) 处结构缺失: $($structureErrors -join '; ')" }
} else {
    $issues += @{ level = "PASS"; check = "格式结构"; message = "格式结构完整 (${structurePass}项全部通过)" }
}

# ============================================================
# 检测0.7: 写作执行信息 — 内容有效性校验
# （结构检测0已确认标题存在，此处检查标题下的实际内容是否可执行）
# ============================================================

$contentErrors = @()
$contentPass = 0

# --- 辅助函数：提取指定 ### 段落的正文内容（到下一个 ## 或 ### 或文末为止） ---
function Get-SectionBody {
    param([string]$FullText, [string]$HeaderPattern)
    $m = [regex]::Match($FullText, "(?si)$HeaderPattern\s*\n(.*?)(?=\n###\s|\n##\s|\z)")
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
    return ""
}

# --- 0.7.1 开篇承接锚点：必须包含动作锚点、情绪锚点、开场第一句建议 ---
$anchorBody = Get-SectionBody -FullText $content -HeaderPattern '###\s+开篇承接锚点'
if ($anchorBody.Length -gt 0) {
    $anchorSubs = @('动作锚点', '情绪锚点', '开场第一句建议')
    $anchorMissing = @()
    foreach ($sub in $anchorSubs) {
        if ($anchorBody -notmatch $sub) { $anchorMissing += $sub }
    }
    if ($anchorMissing.Count -gt 0) {
        $contentErrors += "开篇承接锚点缺少关键子项: $($anchorMissing -join '、')"
    } else { $contentPass++ }
    if ($anchorBody.Length -lt 30) {
        $contentErrors += "开篇承接锚点内容过短（${anchorBody.Length}字 < 30字），疑似空壳"
    }
} else {
    # 标题存在但正文为空
    if ($content -match '(?m)^###\s+开篇承接锚点') {
        $contentErrors += "开篇承接锚点标题存在但正文为空"
    }
}

# --- 0.7.2 写作硬约束（本章）：必须含"必须兑现"和"禁止偏离"，且各至少2条；应有"字数策略" ---
$constraintBody = Get-SectionBody -FullText $content -HeaderPattern '###\s+写作硬约束（本章）'
if ($constraintBody.Length -gt 0) {
    # 检查"必须兑现"和"禁止偏离"
    # 格式1：每条独立包含关键词（推荐）
    $mustDeliverMatches = [regex]::Matches($constraintBody, '(?m)^[-*]\s*.*必须兑现')
    $mustForbidMatches = [regex]::Matches($constraintBody, '(?m)^[-*]\s*.*禁止偏离')
    
    # 格式2：嵌套列表格式（兼容）- 父项包含关键词，统计子项数量
    if ($mustDeliverMatches.Count -eq 0) {
        # 检查是否有嵌套格式：- 必须兑现：\n  - 子项1\n  - 子项2
        $nestedMust = [regex]::Match($constraintBody, '(?m)^[-*]\s*必须兑现[：:]\s*\n((?:\s{2,}[-*]\s+.+\n?)+)')
        if ($nestedMust.Success) {
            $subItems = [regex]::Matches($nestedMust.Groups[1].Value, '(?m)^\s{2,}[-*]\s+.+')
            $mustDeliverMatches = $subItems
        }
    }
    if ($mustForbidMatches.Count -eq 0) {
        $nestedForbid = [regex]::Match($constraintBody, '(?m)^[-*]\s*禁止偏离[：:]\s*\n((?:\s{2,}[-*]\s+.+\n?)+)')
        if ($nestedForbid.Success) {
            $subItems = [regex]::Matches($nestedForbid.Groups[1].Value, '(?m)^\s{2,}[-*]\s+.+')
            $mustForbidMatches = $subItems
        }
    }
    
    # 兜底：也接受正文任意位置出现关键词（最宽松）
    if ($mustDeliverMatches.Count -eq 0) {
        $mustDeliverMatches = [regex]::Matches($constraintBody, '(?mi)必须兑现')
    }
    if ($mustForbidMatches.Count -eq 0) {
        $mustForbidMatches = [regex]::Matches($constraintBody, '(?mi)禁止偏离')
    }

    if ($mustDeliverMatches.Count -eq 0) {
        $contentErrors += "写作硬约束缺少「必须兑现」条目。示例格式：`n- 必须兑现：谢渊胸口致命伤`n- 必须兑现：沈清窈展现金针封穴"
    } elseif ($mustDeliverMatches.Count -lt 2) {
        $contentErrors += "写作硬约束「必须兑现」条目不足2条（当前${mustDeliverMatches.Count}条）。示例格式：`n- 必须兑现：谢渊胸口致命伤`n- 必须兑现：沈清窈展现金针封穴"
    } else { $contentPass++ }

    if ($mustForbidMatches.Count -eq 0) {
        $contentErrors += "写作硬约束缺少「禁止偏离」条目。示例格式：`n- 禁止偏离：新增主线事件`n- 禁止偏离：角色越权知情"
    } elseif ($mustForbidMatches.Count -lt 2) {
        $contentErrors += "写作硬约束「禁止偏离」条目不足2条（当前${mustForbidMatches.Count}条）。示例格式：`n- 禁止偏离：新增主线事件`n- 禁止偏离：角色越权知情"
    } else { $contentPass++ }

    if ($constraintBody -notmatch '字数策略') {
        $contentErrors += "写作硬约束缺少「字数策略」说明"
    } else { $contentPass++ }

    if ($constraintBody.Length -lt 50) {
        $contentErrors += "写作硬约束内容过短（${constraintBody.Length}字 < 50字），疑似空壳"
    }
} else {
    if ($content -match '(?m)^###\s+写作硬约束（本章）') {
        $contentErrors += "写作硬约束标题存在但正文为空"
    }
}

# --- 0.7.3 角色写作提示（仅本章出场角色）：每个角色应有"说话风格"和"行为约束" ---
$charTipBody = Get-SectionBody -FullText $content -HeaderPattern '###\s+角色写作提示（仅本章出场角色）'
if ($charTipBody.Length -gt 0) {
    if ($charTipBody -notmatch '说话风格') {
        $contentErrors += "角色写作提示缺少「说话风格」描述"
    } else { $contentPass++ }
    if ($charTipBody -notmatch '行为约束') {
        $contentErrors += "角色写作提示缺少「行为约束」描述"
    } else { $contentPass++ }
    if ($charTipBody.Length -lt 30) {
        $contentErrors += "角色写作提示内容过短（${charTipBody.Length}字 < 30字），疑似空壳"
    }
} else {
    if ($content -match '(?m)^###\s+角色写作提示（仅本章出场角色）') {
        $contentErrors += "角色写作提示标题存在但正文为空"
    }
}

# --- 0.7.4 伏笔必引细节（仅回收项）：回收项应有"埋设章"和"必引关键词" ---
$foreshadowTipBody = Get-SectionBody -FullText $content -HeaderPattern '###\s+伏笔必引细节（仅回收项）'
if ($foreshadowTipBody.Length -gt 0) {
    # 如果本章无回收伏笔，内容可能就是"本章无回收"之类，此时 PASS
    if ($foreshadowTipBody -match '无回收|无需回收|不涉及回收|本章不回收') {
        $contentPass++
    } else {
        if ($foreshadowTipBody -notmatch '埋设章') {
            $contentErrors += "伏笔必引细节缺少「埋设章」信息"
        } else { $contentPass++ }
        if ($foreshadowTipBody -notmatch '必引关键词') {
            $contentErrors += "伏笔必引细节缺少「必引关键词」信息"
        } else { $contentPass++ }
    }
} else {
    if ($content -match '(?m)^###\s+伏笔必引细节（仅回收项）') {
        $contentErrors += "伏笔必引细节标题存在但正文为空"
    }
}

# --- 0.7.5 关键资产快照（本章会用到的）：不能是空壳，至少30字 ---
$assetBody = Get-SectionBody -FullText $content -HeaderPattern '###\s+关键资产快照（本章会用到的）'
if ($assetBody.Length -gt 0) {
    if ($assetBody.Length -lt 30) {
        $contentErrors += "关键资产快照内容过短（${assetBody.Length}字 < 30字），疑似空壳"
    } else { $contentPass++ }
} else {
    if ($content -match '(?m)^###\s+关键资产快照（本章会用到的）') {
        $contentErrors += "关键资产快照标题存在但正文为空"
    }
}

# --- 0.7.6 汇总输出 ---
if ($contentErrors.Count -gt 0) {
    $issues += @{ level = "ERROR"; check = "写作执行信息有效性"; message = "发现 $($contentErrors.Count) 处内容缺失: $($contentErrors -join '; ')" }
} else {
    $issues += @{ level = "PASS"; check = "写作执行信息有效性"; message = "写作执行信息内容有效 (${contentPass}项通过)" }
}

# ============================================================
# 检测1: 场景篇幅占比 / 旧版字数预算兼容检测
# ============================================================

$sceneTableRows = @()
$tableStarted = $false
foreach ($line in $lines) {
    if (-not $tableStarted) {
        if ($line -match '^\|' -and $line -match '场景' -and ($line -match '篇幅占比' -or $line -match '字数预算')) {
            $tableStarted = $true
        }
        continue
    }

    if ($line -notmatch '^\|') { break }
    if ($line -match '^\|[\s\-]+\|') { continue }
    if ($line -match '合计') { continue }
    $sceneTableRows += $line
}

$sceneCount = $sceneTableRows.Count
if ($sceneCount -lt 3) {
    $issues += @{ level = "ERROR"; check = "场景数"; message = "场景数量不足: ${sceneCount}/3（设计稿至少需要3个场景）" }
} elseif ($sceneCount -gt 5) {
    $issues += @{ level = "ERROR"; check = "场景数"; message = "场景数量超出: ${sceneCount}/5（设计稿最多允许5个场景）" }
} elseif ($sceneCount -gt 0) {
    $issues += @{ level = "PASS"; check = "场景数"; message = "场景数量: $sceneCount（范围内）" }
}

$percentMinTotal = 0
$percentMaxTotal = 0
$percentSceneCount = 0
$legacyBudgetCount = 0

foreach ($row in $sceneTableRows) {
    $percentMatch = [regex]::Match($row, '[\|｜]\s*(\d{1,3})\s*%(?:\s*[-~～至]\s*(\d{1,3})\s*%)?\s*[\|｜]')
    if ($percentMatch.Success) {
        $min = [int]$percentMatch.Groups[1].Value
        $max = if ($percentMatch.Groups[2].Success) { [int]$percentMatch.Groups[2].Value } else { $min }
        if ($min -ge 1 -and $max -le 100 -and $max -ge $min) {
            $percentMinTotal += $min
            $percentMaxTotal += $max
            $percentSceneCount++
            continue
        }
    }

    $legacyRange = [regex]::Match($row, '[\|｜]\s*(\d{2,4})\s*[-~～至]\s*(\d{2,4})\s*[\|｜]')
    if ($legacyRange.Success) {
        $legacyBudgetCount++
        continue
    }

    $legacySingle = [regex]::Match($row, '[\|｜]\s*(\d{3,4})\s*[\|｜]')
    if ($legacySingle.Success) {
        $legacyBudgetCount++
    }
}

if ($percentSceneCount -eq $sceneCount -and $sceneCount -gt 0) {
    if ($percentMaxTotal -lt 90 -or $percentMinTotal -gt 110) {
        $issues += @{ level = "WARNING"; check = "篇幅占比"; message = "场景占比合计偏离较大: ${percentMinTotal}%-${percentMaxTotal}%（建议接近100%）" }
    } else {
        $issues += @{ level = "PASS"; check = "篇幅占比"; message = "场景占比: ${percentMinTotal}%-${percentMaxTotal}%（结构合理）" }
    }
} elseif ($legacyBudgetCount -eq $sceneCount -and $sceneCount -gt 0) {
    $issues += @{ level = "PASS"; check = "篇幅占比"; message = "检测到旧版字数预算写法，兼容通过；建议后续改为百分比占比" }
} elseif ($sceneCount -gt 0) {
    $issues += @{ level = "WARNING"; check = "篇幅占比"; message = "未能完整解析场景篇幅占比；建议在表格中使用百分比并让合计接近100%" }
} else {
    $issues += @{ level = "WARNING"; check = "篇幅占比"; message = "未能从设计稿中提取场景规划表格信息" }
}


# ============================================================
# 检测2: 出场角色文件存在性
# ============================================================

# 从设计稿的场景表格中提取出场角色
# 定位"出场角色"列：找到表头行，确定"出场角色"所在列序号，然后从数据行中提取该列内容
$mentionedChars = @()

# $lines 已在检测0中定义，此处复用
$headerIdx = -1
$colIdx = -1

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($line -match '^\|' -and $line -match '出场角色') {
        $headerIdx = $i
        # 解析表头列序号
        $cols = $line -split '\|' | ForEach-Object { $_.Trim() }
        for ($j = 0; $j -lt $cols.Count; $j++) {
            if ($cols[$j] -eq '出场角色') { $colIdx = $j; break }
        }
        break
    }
}

$namedCountPerScene = @()
if ($headerIdx -ge 0 -and $colIdx -ge 0) {
    # 跳过表头行和分隔行（---），读取数据行
    for ($i = $headerIdx + 1; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -notmatch '^\|') { break }
        if ($line -match '^\|[\s-]+\|') { continue }  # 跳过分隔行
        if ($line -match '合计') { continue }          # 跳过合计行

        $cols = $line -split '\|' | ForEach-Object { $_.Trim() }
        if ($colIdx -lt $cols.Count) {
            $charCell = $cols[$colIdx]
            if ($charCell -ne '' -and $charCell -ne '—') {
                # 分割角色名：支持中文逗号、顿号、英文逗号
                $chars = $charCell -split '[,，、]+' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
                # 过滤掉明显不是角色名的内容（如"传音"等括号备注）
                $chars = $chars | ForEach-Object { $_ -replace '[（(][^）)]*[）)]', '' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
                # 过滤掉泛称角色（用 ~波浪号~ 包裹的非命名角色，如 ~技术员~、~哨兵~）
                $chars = $chars | Where-Object { $_ -notmatch '^~.+~$' }
                $namedCountPerScene += $chars.Count
                $mentionedChars += $chars
            }
        }
    }
}

$mentionedChars = $mentionedChars | Sort-Object -Unique

if ($mentionedChars.Count -gt 0 -and (Test-Path $charsDir)) {
    $registeredChars = Get-ChildItem $charsDir -Filter "*.md" | Where-Object { $_.Name -ne '_template.md' } | ForEach-Object { $_.BaseName }
    $missingChars = $mentionedChars | Where-Object { $_ -notin $registeredChars }
    if ($missingChars.Count -gt 0) {
        $issues += @{ level = "ERROR"; check = "角色文件"; message = "以下出场角色缺少设定文件: $($missingChars -join ', ')" }
    } else {
        $issues += @{ level = "PASS"; check = "角色文件"; message = "所有出场角色均有设定文件 ($($mentionedChars.Count)个)" }
    }
} elseif ($mentionedChars.Count -eq 0) {
    $issues += @{ level = "WARNING"; check = "角色文件"; message = "未能从设计稿中提取出场角色列表" }
} else {
    $issues += @{ level = "WARNING"; check = "角色文件"; message = "characters/ 目录不存在" }
}

# ============================================================
# 检测2.5: 单场命名角色数量（新角色引入节奏）
# 攻略标准：单场戏同时出现的有名字角色 ≤ 4~5 个，否则读者易记混
# ============================================================

$overloadScenes = @()
if ($namedCountPerScene.Count -gt 0) {
    for ($si = 0; $si -lt $namedCountPerScene.Count; $si++) {
        if ($namedCountPerScene[$si] -gt 5) {
            $overloadScenes += "场景$($si + 1)有$($namedCountPerScene[$si])个命名角色"
        }
    }
}
if ($overloadScenes.Count -gt 0) {
    $issues += @{ level = "WARNING"; check = "角色数量"; message = "单场命名角色过多（>5，读者易记混）: $($overloadScenes -join '; ')" }
} elseif ($namedCountPerScene.Count -gt 0) {
    $issues += @{ level = "PASS"; check = "角色数量"; message = "各场景命名角色数量均在 5 个以内" }
}

# ============================================================
# 检测3: 伏笔 ID 合法性
# ============================================================

# 提取设计稿中的伏笔回收 ID
# 支持两种格式：
# 1. 同行：回收 [F-55-1] xxx
# 2. 跨行：**回收**:\n  - [F-55-1] xxx
# ID 格式: F-章节号-序号（如 F-30-1、F-5-2），兼容旧格式 F-三位数（如 F-001）
# 策略：在"回收"标记之后、下一个"新埋"/"埋设"标记或章节分隔之前，提取所有伏笔 ID
$recoverIds = @()
$plantIds = @()

# 找到伏笔操作段落
$foreshadowSection = [regex]::Match($content, '(?si)伏笔操作.*?(?=\n---|\n##[^#]|\z)')
if ($foreshadowSection.Success) {
    $fsText = $foreshadowSection.Value

    # 在伏笔段落中，定位"回收"区域和"新埋"区域
    $recoverSection = [regex]::Match($fsText, '(?si)\*?\*?回收\*?\*?[：:]*\s*\n(.*?)(?=\*?\*?新埋|\*?\*?埋设|\z)')
    if ($recoverSection.Success) {
        $recoverIds = [regex]::Matches($recoverSection.Groups[1].Value, 'F-\d+(?:-\d+)?') | ForEach-Object { $_.Value }
    }

    $plantSection = [regex]::Match($fsText, '(?si)\*?\*?(?:新埋|埋设)\*?\*?[：:]*\s*\n(.*?)(?=\*?\*?回收|\z)')
    if ($plantSection.Success) {
        $plantIds = [regex]::Matches($plantSection.Groups[1].Value, 'F-\d+(?:-\d+)?') | ForEach-Object { $_.Value }
    }
}

# 兜底：如果上面没匹配到，仅匹配"回收"关键词同行紧邻的伏笔 ID（如 "- **回收**: F-55-1 xxx"）
# 🔴 修复：原兜底用 .*? 在全文范围抓"回收"之后最近的 F-ID，会把"新埋"列表 / "待回收伏笔"列表
#    里的 ID 误判为回收 ID，导致"本章无回收（回收区写「无」）"的设计稿被错误拦截
#    （ID 不在 state.yaml active 列表 → 报 ERROR）。
if ($recoverIds.Count -eq 0) {
    $recoverIds = [regex]::Matches($content, '(?:回收|已回收|收回)[\*#:： ]*[\[（(]?(F-\d+(?:-\d+)?)') | ForEach-Object { $_.Groups[1].Value }
}
if ($plantIds.Count -eq 0) {
    $plantIds = [regex]::Matches($content, '(?:新埋|埋设|埋下|新增伏笔)[\*#:： ]*[\[（(]?(F-\d+(?:-\d+)?)') | ForEach-Object { $_.Groups[1].Value }
}

if ($recoverIds.Count -gt 0) {
    if (Test-Path $statePath) {
        $stateContent = Get-Content $statePath -Raw -Encoding UTF8
        # 🔴 只在 foreshadowing.active 段中搜索，避免已回收/其他段的 ID 造成误判
        $activeSection = [regex]::Match($stateContent, '(?s)foreshadowing:\s*\n\s+active:\s*\n(.*?)(?=\n\s+resolved_ref:|\nworldAssets:|\nstyleFingerprint:|\nbatchProgress:|\z)')
        $activeFsText = if ($activeSection.Success) { $activeSection.Groups[1].Value } else { "" }
        $invalidIds = @()
        foreach ($fid in $recoverIds) {
            if ($activeFsText -notmatch [regex]::Escape($fid)) {
                $invalidIds += $fid
            }
        }
        if ($invalidIds.Count -gt 0) {
            $issues += @{ level = "ERROR"; check = "伏笔回收"; message = "以下伏笔 ID 不在 state.yaml 活跃列表中: $($invalidIds -join ', ')" }
        } else {
            $issues += @{ level = "PASS"; check = "伏笔回收"; message = "所有回收伏笔 ID 有效 ($($recoverIds.Count)个)" }
        }
    } else {
        $issues += @{ level = "WARNING"; check = "伏笔回收"; message = "state.yaml 不存在，无法校验伏笔 ID" }
    }
} else {
    $issues += @{ level = "PASS"; check = "伏笔回收"; message = "本章无伏笔回收" }
}

# --- 检查旧格式伏笔ID（仅三位数无序号，如 F-001），发出迁移提示 ---
$allFIds = [regex]::Matches($content, 'F-\d+(?:-\d+)?') | ForEach-Object { $_.Value }
$oldFormatIds = $allFIds | Where-Object { $_ -match '^F-\d{3}$' } | Sort-Object -Unique
if ($oldFormatIds.Count -gt 0) {
    $issues += @{ level = "WARNING"; check = "伏笔ID格式"; message = "检测到旧格式伏笔ID（建议迁移为 F-章节号-序号 格式）: $($oldFormatIds -join ', ')" }
}

# ============================================================
# 输出结果
# ============================================================

$criticals = ($issues | Where-Object { $_.level -eq "CRITICAL" }).Count
$errors = ($issues | Where-Object { $_.level -eq "ERROR" }).Count
$warnings = ($issues | Where-Object { $_.level -eq "WARNING" }).Count

$output = @{
    chapter = $Chapter
    status  = if ($criticals -gt 0 -or $errors -gt 0) { "FAIL" } elseif ($warnings -gt 0) { "WARN" } else { "PASS" }
    summary = @{ critical = $criticals; error = $errors; warning = $warnings }
    issues  = $issues
}

$output | ConvertTo-Json -Depth 5
