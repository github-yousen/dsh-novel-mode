# 小说模式（Novel Mode）for DeepSeek Harness

[English](README.md)

把一整套长篇小说工业化写作工作流做成 DSH 的「**模式**」：装上插件后，点一下
**小说模式**（或输入 `/novel`），Harness 就进入从选题、宪法、大纲、设计稿、
正文、批量写作到全书校验的完整流程。

## 它做了什么

激活模式时做两件事：

1. **安装工作副本**：把包内 `assets/.dsh/` 整棵树复制到当前项目的 `.dsh/`
   目录（幂等，绝不覆盖已有文件）。其中包含：
   - **21 个技能**：9 个工作流技能（`novel-constitution`、`novel-disassemble`、
     `novel-import`、`novel-outline`、`novel-design`、`novel-write`、
     `novel-batch`、`novel-validate`、`novel-design-export`）、9 个 `agent-*`
     子代理角色技能、`Humanizer-zh` 去 AI 味规则，以及可选的 `site-fanqie`
     与 `novel-downloader` 集成；
   - **PowerShell / Python 校验脚本**（字数、标点、段落节奏、摘要/状态同步、
     风格指纹、连续性辅助）、**7 个 Markdown 模板加一份 `state.yaml` 骨架**
     （宪法、章节设计稿、摘要、状态、作品信息、拆书报告）、
     `config.yaml`、`charset.json`、两条 `.mdc` 规则、
     `AGENTS.md`。
2. **启动工作流**：模型收到流程调度指令，检查项目的 `novel/` 目录，从正确的
   阶段继续 —— 宪法 → 拆书/导入 → 大纲 → 设计 → 写作 → 批量 → 校验 →
   设计稿导出。

技能正文以运行时技能注册、按需加载，因此每轮请求只多一段很短的路由说明，
不会把整套工作流塞进上下文。

## 安装

从 GitHub 仓库（monorepo 子目录）安装：

```sh
dsh plugin --profile <profile> add https://github.com/github-yousen/novel/tree/master/packages/novel-mode-plugin
```

或从本地检出目录安装（Harness 插件管理器的 `plugin_manager install_bundle`，
`target` 填本目录绝对路径）。

安装后**刷新 Web 页面**（Client 半在启动时加载），composer 下方会出现
「小说模式」按钮。

## 运行要求

- DeepSeek Harness `0.2.x`（Web profile；Client 半依赖 Web UI）。
- 主机安装 **PowerShell 7（`pwsh`）** 与 **Python 3.7+**：脚本统一以
  `pwsh -NoProfile -File .dsh/scripts/<脚本>.ps1` 调用。
- 目标小说项目目录应为会话的工作目录；工作流自行维护项目下的 `novel/` 树
  （章节、状态、宪法）。

## 使用

| 操作 | 效果 |
|---|---|
| 点击 composer 下方的 **小说模式** | 进入模式并启动完整工作流 |
| 输入 `/novel [这次想写什么]` | 同一操作，可附带目标说明 |
| 直接说「写第 15 章」「校验全书」 | 自动调用 `novel_mode` 工具或匹配对应 `novel-*` 技能 |

模式内部是**技能**而非斜杠命令：直接描述意图（如「设计第 15 章」「写第 16 章」），
模型会加载匹配的技能；也可在输入框 `/` 菜单里点选技能。

## 凭据与隐私

**包内不含任何凭据。** 可选的番茄站点集成只提供空的
`fanqie-auth.json.template` / `fanqienovel_auth.json.template`；如需使用，
把 `.template` 复制为真实文件名并在本地填写，这些真实文件名已被 git 忽略。
`publish_result.json`、`package-lock.json`、字节码缓存与体积很大的逆向分析文件
均已刻意剔除。

## 目录结构

```
package.json          dsh.bundle + dsh.client 清单
cordis.patch.yml      Loader insert 行
index.js              Host 半：技能、/novel 命令、novel_mode 工具、
                      .dsh/ 物化、prompt 路由段
client.js             Client 半：小说模式按钮
locale/*.json         展示元数据 + UI 文案
icon.svg              原创书本图标
assets/.dsh/          工作流工作副本（物化到各小说项目）
market/               可直接提交的 awesome-dsh-plugin 目录条目
docs/                 研究记录（资产审计、API、发布）
```

## 许可

MIT。随包附带的 `Humanizer-zh` 技能使用其自带许可证。
