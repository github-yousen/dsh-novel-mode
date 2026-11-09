"""Strip prose control-flow ("关卡宣言"/"有限状态机"/"铁律") from worker skills.

The deterministic engine (lib/orchestrator.js) owns all state transitions and
gates. These SKILL.md files are WORKER REFERENCE MATERIAL ONLY: they describe
how to perform creative work, never how to run the workflow. Any line that
tells the model to act as a state machine, emit gate declarations, or print
checkpoint slogans is removed / replaced with a neutral engine-delegation note.

Applied to: novel-batch (main offender), novel-write (minor).
Idempotent: re-running is safe.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SKILLS = os.path.join(HERE, '.dsh', 'skills')

ENGINE_NOTE = """## 由确定性引擎驱动（本技能只承担创作工作）

本技能是**工人参考材料**，不是流程控制器。阶段顺序、门禁、重试、断点与放行
全部由插件的 JS 状态机（`lib/orchestrator.js`）代码裁决，脚本退出码是唯一质量
裁判；模型不决定阶段是否通过，也不自行输出流程宣言或关卡口号。

- 收到引擎派发的类型化参数（章节号、步骤 id）后，只完成本步骤的创作任务。
- 需要校验时如实报告证据；是否放行由引擎按事实文件裁决。
- 不得输出「关卡宣言」「自检宣言」「固定措辞」等面向用户的流程文本。
- 不得整章重写；回修只改问题处；`state.yaml` 剧情字段只由 `sync-state.ps1` 写入。
- 脚本一律 `pwsh -NoProfile -File .dsh/scripts/<name>.ps1 -Chapter <整数>`，禁止 `-Command`。

以下为创作工作的参考细节。
"""

# Lines whose ENTIRE content is a control-flow instruction to be dropped.
DROP_LINE_PATTERNS = [
    r'^🔴 \*\*关卡[A-E] 过关宣言.*',
    r'^🔴 D[1-4] 属关卡D.*',
    r'^🔴 \*\*主流程每章的固定输出预算.*',
    r'^- 🔴 \*\*五个关卡一条都不能省.*',
    r'^- 🔴 \*\*关卡内每个子步骤都必须给出证据.*',
    r'^- 🔴 "我不赶工.*',
    r'^- 🔴 宣言必须作为.*',
    r'^- 🔴 如果发现自己想跳过宣言.*',
    r'^- 如果回头发现漏了某关卡宣言.*',
    r'^- 主流程任何时刻只允许处于一个明确阶段.*',
    r'^- \*\*未满足当前阶段退出条件前.*',
    r'^- \*\*禁止\*\*用"已经差不多了.*',
    r'^- 一旦发现自己已经越级.*',
    r'^- 本命令\*\*覆盖\*\*全局.*',
    r'^- \*\*只允许并行\*\*的场景.*',
    r'^- \*\*禁止并行\*\*的场景.*',
    r'^  - Step O 各批次扩纲',
    r'^  - 同一章的 .*',
    r'^  - 任意"先写正文.*',
    r'^- 🔴 \*\*禁止\*\*在同一批工具调用里.*',
    r'^- `outline\.md`：.*',
    r'^- `design\.md`：.*',
    r'^- `content\.md`：.*',
    r'^- `summary\.md`：.*',
    r'^- `state\.yaml`：.*',
    r'^- \*\*任何 ERROR / CRITICAL 未清零.*',
    r'^- 禁止使用以下放行话术.*',
    r'^- Step C 的唯一出口条件.*',
    r'^  - `C1\.5` 的普通 AI 味信号.*',
    r'^  - 🔴 但 `C1\.5` 中的.*',
    r'^- Step D 的唯一出口条件.*',
    r'^- 声称某一步"完成"之前.*',
    r'^- \*\*没看到成功证据.*',
    r'^- 特别地：',
    r'^  - 没看到 `validate-design.*',
    r'^  - 没看到 `validate-chapter.*',
    r'^  - 没看到 `validate-summary.*',
    r'^  - 没看到 `sync-state.*',
    r'^  - 没看到 `continuity-validator.*',
    r'^  - 没写回 `batchProgress.*',
]
DROP_RE = re.compile('|'.join(DROP_LINE_PATTERNS))


def process(name):
    path = os.path.join(SKILLS, name, 'SKILL.md')
    with open(path, encoding='utf-8') as f:
        text = f.read()
    lines = text.split('\n')

    # 1) Replace the whole "执行铁律 ... 前置检查" control block (if present).
    start = next((i for i, l in enumerate(lines) if l.startswith('## 执行铁律')), None)
    if start is not None:
        end = next((i for i, l in enumerate(lines[start + 1:], start + 1)
                    if l.startswith('## 前置检查')), None)
        if end is None:
            end = min(start + 90, len(lines))
        lines = lines[:start] + ENGINE_NOTE.split('\n') + [''] + lines[end:]

    # 2) Drop remaining control-flow lines anywhere.
    out = [l for l in lines if not DROP_RE.match(l)]
    # 3) Drop now-empty "### 6. 关卡自检宣言 ..." heading + fenced declaration block.
    final = []
    i = 0
    while i < len(out):
        if out[i].startswith('### 6. 关卡自检宣言'):
            # Skip until the next '## ' heading or '约束：' block end.
            i += 1
            while i < len(out) and not out[i].startswith('## '):
                i += 1
            continue
        final.append(out[i])
        i += 1

    new_text = '\n'.join(final)
    # Collapse >2 blank lines.
    new_text = re.sub(r'\n{3,}', '\n\n', new_text)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(new_text)
    hits = sum(1 for k in ['关卡', '我不赶工', '有限状态机', '不可改写或删除', '自检宣言']
               for _ in re.finditer(k, new_text))
    print(f'{name}: control-prose hits remaining = {hits}; lines {len(lines)} -> {len(final)}')


if __name__ == '__main__':
    for n in ('novel-batch', 'novel-write'):
        process(n)
