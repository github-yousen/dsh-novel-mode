<#
.SYNOPSIS
    为指定章节导出写作上下文，生成单个 md 文件供外部 LLM 写正文使用。
.DESCRIPTION
    将以下内容合并写入 novel/chapters/[NNN]/design-export.md（2026-05-19 调整后）：
    1. 宪法核心 (core.md + style.md)
    2. 近章摘要 (N-1 ~ N-3)
    3. 上一章正文 (content.md)
    4. 出场角色设定文件（仅本章设计稿中出场的角色，不全量）
    5. 本章设计稿 (design.md)

    历史版本曾包含「大纲全文 (outline.md)」与「全局状态 (state.yaml)」，已于 2026-05-19 移除，
    相关读取/拼装逻辑保留为注释以便后续回滚追溯。

    输出文件可直接复制到外部 LLM，生成正文后再复制回来。
.PARAMETER Chapter
    要导出的章节号 N
.EXAMPLE
    pwsh -NoProfile -File .dsh/scripts/export-design-context.ps1 -Chapter 19
#>

param(
    [Parameter(Mandatory = $true)]
    [int]$Chapter
)

$ErrorActionPreference = "Stop"

# ============================================================
# 路径解析
# ============================================================
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
$chaptersDir = Join-Path $novelDir "chapters"
$constitutionDir = Join-Path $novelDir "constitution"
$charactersDir = Join-Path $constitutionDir "characters"

# 字数配置（从母本 .dsh/config.yaml 读取，缺省回退内置默认值）
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

# 书名（从 novel/bookinfo.md 提取，用于提示词；不存在则用"本书"）
$bookName = "本书"
$bookInfoPath = Join-Path $novelDir "bookinfo.md"
if (Test-Path $bookInfoPath) {
    $bi = Get-Content $bookInfoPath -Raw -Encoding UTF8
    $bm = [regex]::Match($bi, '(?m)^## 书名\s*$[\s\S]{0,20}?^(.+)$')
    if ($bm.Success) { $bookName = $bm.Groups[1].Value.Trim() }
}

$chapterPadded = $Chapter.ToString("D3")
$chapterDir = Join-Path $chaptersDir $chapterPadded

if (-not (Test-Path $chapterDir)) {
    New-Item $chapterDir -ItemType Directory -Force | Out-Null
}

$exportPath = Join-Path $chapterDir "design-export.md"
$output = [System.Text.StringBuilder]::new()

function Pad3([int]$n) { $n.ToString("D3") }

function AppendSection([System.Text.StringBuilder]$sb, [string]$header, [string]$content) {
    [void]$sb.AppendLine("═══════════════════════════════════════════════════════")
    [void]$sb.AppendLine($header)
    [void]$sb.AppendLine("═══════════════════════════════════════════════════════")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine($content)
    [void]$sb.AppendLine("")
}

Write-Host "导出设计稿上下文: 第${Chapter}章 → $exportPath"

# ============================================================
# [已废弃 2026-05-19] 1. 大纲全文 — 不再纳入导出，保留代码以便回滚
# ============================================================
<#
$outlinePath = Join-Path $novelDir "outline.md"
if (Test-Path $outlinePath) {
    $outlineContent = Get-Content $outlinePath -Raw -Encoding UTF8
    AppendSection $output "## 大纲全文 (outline.md)" $outlineContent
    Write-Host "  ✓ outline.md ($(($outlineContent -split "`n").Count) 行)"
} else {
    Write-Error "outline.md 不存在: $outlinePath。必须先通过 /novel-design all 创建大纲。"
    exit 1
}
#>

# ============================================================
# 1. 宪法核心 （新顺序：第 1 节）
# ============================================================

$corePath = Join-Path $constitutionDir "core.md"
$stylePath = Join-Path $constitutionDir "style.md"

if (Test-Path $corePath) {
    $coreContent = Get-Content $corePath -Raw -Encoding UTF8
    AppendSection $output "## 宪法核心 (core.md)" $coreContent
    Write-Host "  ✓ core.md ($(($coreContent -split "`n").Count) 行)"
} else {
    Write-Error "core.md 不存在: $corePath。必须先通过 /novel-constitution 初始化宪法设定。"
    exit 1
}

if (Test-Path $stylePath) {
    $styleContent = Get-Content $stylePath -Raw -Encoding UTF8
    AppendSection $output "## 风格设定 (style.md)" $styleContent
    Write-Host "  ✓ style.md ($(($styleContent -split "`n").Count) 行)"
} else {
    Write-Host "  ⚠ style.md 不存在，跳过"
}

# ============================================================
# [已废弃 2026-05-19] 3. 全局状态 — 不再纳入导出，保留代码以便回滚
# ============================================================
<#
$statePath = Join-Path $novelDir "state.yaml"
if (Test-Path $statePath) {
    $stateContent = Get-Content $statePath -Raw -Encoding UTF8
    AppendSection $output "## 全局状态 (state.yaml)" $stateContent
    Write-Host "  ✓ state.yaml ($(($stateContent -split "`n").Count) 行)"
} else {
    if ($Chapter -gt 1) {
        Write-Host "  ⚠ state.yaml 不存在（第${Chapter}章建议有状态文件）"
    } else {
        Write-Host "  ⓘ state.yaml 不存在（第1章允许无初始状态）"
    }
}
#>

# ============================================================
# 2. 近章摘要 (N-1 ~ N-3)  （新顺序：第 2 节，原为第 7 节）
# ============================================================

$summaryStart = [math]::Max(1, $Chapter - 3)
$summaryEnd = [math]::Max(1, $Chapter - 1)
$summaryCount = 0

if ($Chapter -gt 1) {
    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("## 近章摘要 (第${summaryStart}章 ~ 第${summaryEnd}章)")
    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("")

    for ($i = $summaryEnd; $i -ge $summaryStart; $i--) {
        $summaryPath = Join-Path $chaptersDir "$(Pad3 $i)" "summary.md"
        if (Test-Path $summaryPath) {
            $summaryContent = Get-Content $summaryPath -Raw -Encoding UTF8
            [void]$output.AppendLine("### 第${i}章 摘要")
            [void]$output.AppendLine("")
            [void]$output.AppendLine($summaryContent)
            [void]$output.AppendLine("")
            $summaryCount++
        }
    }

    Write-Host "  ✓ 近章摘要: ${summaryCount}个"
}

# ============================================================
# 3. 上一章正文  （新顺序：第 3 节，原为第 6 节）
# ============================================================

if ($Chapter -gt 1) {
    $prevChapterPadded = ($Chapter - 1).ToString("D3")
    $prevContentPath = Join-Path $chaptersDir $prevChapterPadded "content.md"
    if (Test-Path $prevContentPath) {
        $prevContent = Get-Content $prevContentPath -Raw -Encoding UTF8
        AppendSection $output "## 上一章全文 (第$($Chapter - 1)章 content.md)" $prevContent
        Write-Host "  ✓ 上一章 content.md ($(($prevContent -split "`n").Count) 行)"
    } else {
        Write-Host "  ⚠ 上一章 content.md 不存在，跳过"
    }
} else {
    Write-Host "  ⓘ 第1章无上一章，跳过"
}

# ============================================================
# 4. 出场角色设定  （新顺序：第 4 节，原为第 5 节）
# 🔴 仅加载本章 design.md 中出场的角色，不加载全部角色文件
# ============================================================

# 预读 design.md（供本节约角色 + 第5节复用），提取出场角色名单
$designPath = Join-Path $chapterDir "design.md"
$designContent = ""
if (Test-Path $designPath) {
    $designContent = Get-Content $designPath -Raw -Encoding UTF8
} else {
    Write-Error "design.md 不存在: $designPath。必须先通过 /novel-design N 创建设计稿。"
    exit 1
}

# 出场角色提取：
#   a) 场景表格"出场角色"列（| N. 场景名 | xx% | 角色列表 | ...），过滤 ~泛称~
#   b) "角色写作提示（仅本章出场角色）"段的角色名（- 角色名：说话风格=...）
$selectedNames = @{}
# a) 场景表格第3列
$tableMatches = [regex]::Matches($designContent, '(?m)^\| *\d+\. .*? \| *[0-9]+%? *\| *([^|]+) *\|')
foreach ($m in $tableMatches) {
    $cell = $m.Groups[1].Value
    foreach ($token in ($cell -split '[、，,/\s]+')) {
        $token = $token.Trim()
        if ($token -eq "" -or $token -match '^~.*~$') { continue }
        $selectedNames[$token] = $true
    }
}
# b) 角色写作提示段
$hintMatches = [regex]::Matches($designContent, '(?m)^- *([^：:]+)[：:] *说话风格=')
foreach ($m in $hintMatches) {
    $name = $m.Groups[1].Value.Trim()
    if ($name -ne "") { $selectedNames[$name] = $true }
}

if (Test-Path $charactersDir) {
    $charFiles = Get-ChildItem $charactersDir -Filter "*.md" | Where-Object { $_.Name -ne '_template.md' } | Sort-Object Name
    $charCount = 0
    $charTotalLines = 0
    $loadedNames = @()

    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("## 出场角色设定 (characters/ 仅本章出场)")
    [void]$output.AppendLine("═══════════════════════════════════════════════════════")
    [void]$output.AppendLine("")

    foreach ($file in $charFiles) {
        if ($selectedNames.Count -gt 0 -and -not $selectedNames.ContainsKey($file.BaseName)) {
            continue
        }
        $charContent = Get-Content $file.FullName -Raw -Encoding UTF8
        $lineCount = ($charContent -split "`n").Count
        [void]$output.AppendLine("### 角色: $($file.BaseName)")
        [void]$output.AppendLine("")
        [void]$output.AppendLine($charContent)
        [void]$output.AppendLine("")
        $charCount++
        $charTotalLines += $lineCount
        $loadedNames += $file.BaseName
    }

    Write-Host "  ✓ 出场角色文件: ${charCount}个 (共${charTotalLines}行)"
    if ($selectedNames.Count -gt 0) {
        $skipped = @($charFiles | Where-Object { $selectedNames.ContainsKey($_.BaseName) -eq $false } | ForEach-Object { $_.BaseName })
        if ($skipped.Count -gt 0) {
            Write-Host "  ⓘ 已跳过非出场角色: $($skipped -join '、')"
        }
    }
} else {
    Write-Host "  ⚠ characters 目录不存在，跳过"
}

# ============================================================
# 5. 本章设计稿  （新顺序：第 5 节，原为第 4 节）
# 内容已在第 4 节预读，此处直接复用
# ============================================================

AppendSection $output "## 本章设计稿 (design.md)" $designContent
Write-Host "  ✓ design.md ($((($designContent -split "`n").Count)) 行)"

# ============================================================
# 6. 内置写作任务指令（写入导出文件最前，用户复制整个文件给外部 LLM 即可直接写作）
# ============================================================

$writingPrompt = @"
## 任务指令（请直接执行，无需用户额外说明）

你是网文写手，正在为小说《${bookName}》创作正文。请严格按照以下要求写作：

**任务**：根据本文件提供的【宪法核心】【风格设定】【近章摘要】【上一章正文】【出场角色设定】【本章设计稿】，创作第${Chapter}章正文。

**输出要求**：
- 只输出正文内容，不输出任何解释、总结、分析、前言或后记
- 首行必须是章节标题：`# 第${Chapter}章 [自拟标题]`（标题 2-8 字，网文风格）
- 正文字数 ${wordMin}-${wordMax} 字（目标 ${wordTarget} 字，不含标题，以中文计）
- 使用 Markdown 段落格式，段落之间用空行分隔

**硬性规则**：
1. 按【本章设计稿】的场景顺序逐场景写作，完整覆盖每个场景（搭戏/唱戏/高潮/结尾），章末必须留钩子
2. 设计稿"反应节拍"只是情绪方向参考，台词与内心独白必须由你原创，不得照搬设计稿
3. 对话使用中文双引号“”包裹，禁止「」『』""等
4. 禁止出现：伏笔 ID（F-N-X）、"回收成功"、"埋设"、"本章完"等元数据
5. 正文不得保留设计稿的 ~波浪号~ 泛称标记，直接写"村民""修士"等泛称
6. 严格遵守【宪法核心】中 [不可变] 规则与【风格设定】全部要求
7. 涉及历史/平台红线的内容一律技巧化处理或回避
8. 承接【上一章正文】结尾，保持文风一致
9. 只用【出场角色设定】中的角色；其余用泛称
10. 完成后只输出正文，等待用户后续指令

**完成标准**：剧情连贯、覆盖设计稿全部场景、字数达标、风格贴合本书。

═══════════════════════════════════════════════════════
以下为写作所需全部上下文，请通读后开始写作：
═══════════════════════════════════════════════════════

"@

[void]$output.Insert(0, $writingPrompt)

# ============================================================
# 写入导出文件
# ============================================================

# [变更记录 2026-05-19] header 中 包含/顺序 同步更新；旧版本说明保留如下供回滚参考：
# 包含: 大纲全文 + 宪法(core+style) + 全局状态 + 本章设计稿 + 角色设定 + 上一章正文 + 近章摘要
$header = @"
# 写作上下文导出 — 第${Chapter}章
# 生成于 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
#
# 包含: 宪法(core+style) + 近章摘要 + 上一章正文 + 出场角色设定 + 本章设计稿
# 用法: 复制本文件全部内容，粘贴到外部 LLM，即可直接生成第${Chapter}章正文
#       （文件内已含完整写作任务指令，无需再向 LLM 描述需求）

"@

$finalContent = $header + $output.ToString()

Set-Content $exportPath $finalContent -Encoding UTF8 -NoNewline

$sizeKB = [math]::Round((Get-Item $exportPath).Length / 1024, 1)
$lineCount = ($finalContent -split "`n").Count

Write-Host ""
Write-Host "✓ 写作上下文已导出"
Write-Host "  路径: $exportPath"
Write-Host "  大小: ${sizeKB} KB"
Write-Host "  行数: ${lineCount}"
Write-Host ""
Write-Host "下一步:"
Write-Host "  1. 打开 $exportPath"
Write-Host "  2. 复制全部内容到外部 LLM（文件内已含写作任务指令，直接粘贴即可）"
Write-Host "  3. 将 LLM 生成的正文复制到 novel/chapters/${chapterPadded}/content.md"
Write-Host "  4. 执行: pwsh -NoProfile -File .dsh/scripts/validate-chapter.ps1 -Chapter ${Chapter}"
