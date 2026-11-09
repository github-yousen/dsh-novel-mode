<#
.SYNOPSIS
    角色谱系统计脚本 — 直接从设计稿(design.md)的场景表格提取出场角色，跨章统计角色谱系平衡指标。
.DESCRIPTION
    与 validate-design.ps1 的检测2 共用同一套"出场角色"列解析逻辑，但本脚本跨章扫描 N-10 ~ N 章设计稿，
    输出以下谱系平衡指标（供 continuity-validator / novel-validate 直接消费，无需 AI 逐字读正文）：
    1. activeNamedTotal   — 近10章窗口内活跃命名角色总量（建议 ≤ 25）
    2. sceneOverload      — 单场命名角色 > 5 的场景清单（章节:场景:数量）
    3. newChars           — 本章新引入的命名角色（在 N-1 ~ N-10 章设计稿中未出现过）
    4. appearance         — 各命名角色近10章出场章节数（用于识别核心配角 vs 龙套）
    5. staleCores         — 出场 ≥4 次但最近 5 章未再登场的角色（核心配角"放长假"预警）
    6. lastChapter        — 各角色最后一次出场章节
.PARAMETER Chapter
    章节号（数字），以此为窗口终点向前扫描 10 章
.EXAMPLE
    pwsh -NoProfile -File .dsh/scripts/analyze-roster.ps1 -Chapter 15
.NOTES
    纯脚本零 token 消耗。设计稿解析规则与 validate-design.ps1 保持一致：
    - 泛称角色（~波浪号~）自动跳过
    - 括号备注（（传音）等）剔除
#>

param(
    [Parameter(Mandatory = $true)]
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

# ============================================================
# 从单章 design.md 提取命名角色 + 单场角色数
# ============================================================

function Get-NamedChars {
    param([string]$DesignPath)
    $chars = @()
    $perScene = @()
    if (-not (Test-Path $DesignPath)) { return @{ chars = $chars; perScene = $perScene } }

    $content = Get-Content $DesignPath -Raw -Encoding UTF8
    $lines = $content -split '\r?\n'

    $colIdx = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match '^\|' -and $line -match '出场角色') {
            $cols = $line -split '\|' | ForEach-Object { $_.Trim() }
            for ($j = 0; $j -lt $cols.Count; $j++) {
                if ($cols[$j] -eq '出场角色') { $colIdx = $j; break }
            }
            # 表头所在行之后开始解析数据行
            for ($k = $i + 1; $k -lt $lines.Count; $k++) {
                $d = $lines[$k]
                if ($d -notmatch '^\|') { break }
                if ($d -match '^\|[\s-]+\|') { continue }
                if ($d -match '合计') { continue }
                $dc = $d -split '\|' | ForEach-Object { $_.Trim() }
                if ($colIdx -lt $dc.Count) {
                    $cell = $dc[$colIdx]
                    if ($cell -ne '' -and $cell -ne '—') {
                        $rowChars = $cell -split '[,，、]+' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
                        $rowChars = $rowChars | ForEach-Object { $_ -replace '[（(][^）)]*[）)]', '' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
                        $rowChars = $rowChars | Where-Object { $_ -notmatch '^~.+~$' }
                        $perScene += $rowChars.Count
                        $chars += $rowChars
                    }
                }
            }
            break
        }
    }
    return @{ chars = ($chars | Sort-Object -Unique); perScene = $perScene }
}

function Pad3([int]$n) { $n.ToString("D3") }

# ============================================================
# 跨章统计 N-10 ~ N
# ============================================================

$windowStart = [math]::Max(1, $Chapter - 10)
$appearance = @{}       # 角色 -> 出场章节列表
$perChapterNew = @{}    # 章节 -> 该章新增角色列表
$sceneOverload = @()    # 单场 >5 的记录
$allNamed = @()         # 窗口内全部命名角色（去重）

for ($c = $windowStart; $c -le $Chapter; $c++) {
    $designPath = Join-Path $chaptersDir "$(Pad3 $c)" "design.md"
    if (-not (Test-Path $designPath)) { continue }

    $named = Get-NamedChars -DesignPath $designPath

    # 单场超限
    for ($si = 0; $si -lt $named.perScene.Count; $si++) {
        if ($named.perScene[$si] -gt 5) {
            $sceneOverload += @{ chapter = $c; scene = $si + 1; count = $named.perScene[$si] }
        }
    }

    # 出场统计
    foreach ($ch in $named.chars) {
        if (-not $appearance.ContainsKey($ch)) { $appearance[$ch] = @() }
        $appearance[$ch] += $c
    }

    # 本章新增（相对窗口内更早章节）
    if ($c -gt $windowStart) {
        $prev = @()
        for ($p = $windowStart; $p -lt $c; $p++) {
            $pPath = Join-Path $chaptersDir "$(Pad3 $p)" "design.md"
            if (-not (Test-Path $pPath)) { continue }
            $pNamed = Get-NamedChars -DesignPath $pPath
            $prev += $pNamed.chars
        }
        $prevSet = $prev | Sort-Object -Unique
        $newOnes = $named.chars | Where-Object { $_ -notin $prevSet }
        if ($newOnes.Count -gt 0) { $perChapterNew[$c] = $newOnes }
    }

    $allNamed += $named.chars
}

$allNamed = $allNamed | Sort-Object -Unique
$activeNamedTotal = $allNamed.Count

# 各角色出场章节数 + 最后一次出场
$rosterList = @(foreach ($ch in $allNamed) {
    $chapters = $appearance[$ch] | Sort-Object
    [PSCustomObject]@{
        name         = $ch
        appearCount  = $chapters.Count
        firstChapter = if ($chapters.Count -gt 0) { $chapters[0] } else { $null }
        lastChapter  = if ($chapters.Count -gt 0) { $chapters[-1] } else { $null }
    }
})
$roster = $rosterList | Sort-Object -Property appearCount -Descending

# 核心配角（出场 ≥4 次）但最近 5 章未再登场
$staleCores = @()
if ($Chapter -ge 5) {
    $staleCores = $roster | Where-Object {
        $_.appearCount -ge 4 -and ($null -eq $_.lastChapter -or $_.lastChapter -le ($Chapter - 5))
    } | ForEach-Object { $_.name }
}

# 本章新增
$newCharsThisChapter = if ($perChapterNew.ContainsKey($Chapter)) { $perChapterNew[$Chapter] } else { @() }

$output = @{
    chapter          = $Chapter
    window           = "${windowStart}~${Chapter}"
    activeNamedTotal = $activeNamedTotal
    sceneOverload    = $sceneOverload
    newCharsThisChapter = @($newCharsThisChapter)
    staleCores       = @($staleCores)
    roster           = @($roster)
}

$output | ConvertTo-Json -Depth 5
