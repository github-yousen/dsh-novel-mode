# 小说模式（Novel Mode）for DeepSeek Harness

[English](README.md)

把一整套长篇小说工业化写作工作流做成 DSH 的一个**可选模式**：装上插件后，
会话工作区名旁边的**模式下拉框**里会多出「小说模式」。选中它，该会话即可使用
完整写作流程——不额外添加按钮、斜杠命令，也不自动注入提示词。

## 它做了什么

插件只贡献两行 Loader 声明：

1. **一个 Agent Preset**（`@deepseek-ai/dsh-agent-preset`）：`id: novel`，显示名
   `小说模式`，带一段说明「当前处于小说模式」的 persona，以及标准工具集（文件、
   shell、技能、子代理、网页、压缩、goal、todo、present）。**工作流由技能驱动**：
   用户描述意图，模型从 `/` 菜单加载匹配的 `novel-*` 技能执行。
2. **一个 Host 插件**，静默做两件事：
   - 把 **21 个工作流技能**注册为运行时技能（10 个 `novel-*` 工作流技能、
     9 个 `agent-*` 子代理角色、`humanizer-zh`、`site-fanqie`、`novel-downloader`）；
   - 当会话选中「小说模式」时，**静默**把随包 `.dsh/` 工作副本物化到该项目根目录
     （幂等，绝不覆盖已有文件）。**不向模型注入任何消息**。

为什么必须物化：所有技能与 PowerShell 脚本都按「相对项目根」引用路径
（`.dsh/scripts/...`、`.dsh/templates/...`、`.dsh/config.yaml`），脚本用
`$PSScriptRoot` 上两级推算项目根，因此 assets 必须落在 `<项目根>/.dsh/`。

工作副本包含 21 个 SKILL.md、18 个 `.ps1`、19 个 `.py`、8 个模板、`config.yaml`、
`charset.json`、`AGENTS.md`、2 条 `.mdc` 规则、9 个角色定义，以及 Humanizer-zh 的
README/LICENSE。**不含任何凭据**。

## 安装

```sh
dsh plugin --profile <profile> add https://github.com/github-yousen/dsh-novel-mode
```

或从本地检出目录安装（Harness 插件管理器的 `plugin_manager install_bundle`，
`target` 填本目录绝对路径）。

安装后**刷新 Web 页面 / 新建会话**，模式下拉框里就会出现「小说模式」。已有会话
保留其启动时选定的预设。

## 运行要求

- DeepSeek Harness `0.2.x`（Web profile；模式下拉框属于 Web UI）。
- 主机安装 **PowerShell 7（`pwsh`）** 与 **Python 3.7+**：脚本统一以
  `pwsh -NoProfile -File .dsh/scripts/<脚本>.ps1` 调用。
- 目标小说项目目录应为会话工作目录；工作流自行维护项目下的 `novel/` 树。

## 使用

1. 新建会话，点开工作区名旁的**模式下拉框**，选择 **小说模式**。
2. 描述意图——「建立宪法」「设计第 15 章」「写第 16 章」「全书校验」——模型会从
   `/` 菜单加载匹配的技能；也可直接在 `/` 菜单点选技能。
3. 流程阶段：宪法 → 拆书/导入 → 大纲 → 设计 → 写作 → 批量 → 校验 → 设计稿导出。

随包 `AGENTS.md` 载有全部铁律（章节三位补零、先设计稿后正文、每章验证并同步状态、
中文双引号、去 AI 味、`pwsh -NoProfile -File`）。

## 凭据与隐私

**包内不含任何凭据。** 可选的番茄站点集成只提供空的
`fanqie-auth.json.template` / `fanqienovel_auth.json.template`；如需使用，把
`.template` 复制为真实文件名并在本地填写，这些真实文件名已被 git 忽略。
`publish_result.json`、`package-lock.json`、字节码缓存与体积很大的逆向分析文件
均已刻意剔除。

## 目录结构

```
package.json          dsh.bundle 清单（纯 Host，无 dsh.client）
cordis.patch.yml      一行 Host 声明 + 一行 @deepseek-ai/dsh-agent-preset 声明
index.js              Host 半：技能注册 + 静默 .dsh/ 物化
locale/*.json         展示元数据
icon.svg              原创书本图标
assets/.dsh/          工作流工作副本（物化到各小说项目）
market/               可直接提交的 awesome-dsh-plugin 目录条目
docs/                 研究记录（资产审计、API、发布）
```

## 许可

MIT。随包附带的 `Humanizer-zh` 技能使用其自带许可证。
