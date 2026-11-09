# 安装「小说模式」(Novel Mode)

> 插件是 `github-yousen/novel` 的 monorepo 子包，路径 `packages/novel-mode-plugin/`，默认分支 **`master`**（不是 `main`）。
> 前提：STEP 0（`SUBMISSION_STEPS.md`）已把插件推到该仓库；从源码安装前，仓库里必须真的有 `packages/novel-mode-plugin/package.json`。

---

## 主机先决条件（重要）

- **PowerShell 7（`pwsh`）**：打包的工作流脚本是 `.ps1`，统一以 `pwsh -NoProfile -File .dsh/scripts/<name>.ps1 -Chapter N` 执行（禁止 `-Command`）。
- **Python 3**：`fanqie-rank.py` / `fanqie-download.py` 两个脚本。它们**纯标准库**（`requirements.txt`：Python ≥3.7，无需 `pip install`）。
- 一个**可写的小说项目目录**：进入模式时插件会把随包的 `.dsh/` 工作副本物化到当前项目根目录（已存在的文件不会被覆盖）。
- 插件本体**是纯 JavaScript、无构建脚本、无 npm 依赖**（只用 `ctx` / `inject` 取宿主服务），所以从 git 安装**不需要** `prepare` 脚本，也**不需要** pnpm `allowBuilds` / `approvedBuilds` 构建授权。

`engines.dsh`：`>=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-rc.1 <0.3.0-0`（安装时宿主会复核）。

---

## 方法 A — 从 GitHub 源码（目录 URL，即目录条目里的 `url`）

```sh
dsh plugin --profile <profile> add https://github.com/github-yousen/novel/tree/master/packages/novel-mode-plugin
```

`<profile>` 是**必填**的（`dsh plugin` 只是把参数转发给 profile 目录下的 pnpm），例如 `--profile desktop`。

> 说明：这条 URL 就是目录条目 `data/plugins/...yml` 里记录的 `url`，也是市场卡片「从源码安装」所依据的来源。若你的 `dsh` 把它原样转给 pnpm，pnpm 需要的是 **git spec 而非网页 tree URL**（见方法 B）；市场 UI 的安装按钮会自行把子目录解析成正确的 git spec。发布后的推荐安装方式其实是市场卡片，而非手敲这条 URL。

## 方法 B — git spec 变体（pnpm 直接可用的形式）

```sh
# GitHub 简写（分支 master）
dsh plugin --profile <profile> add "github:github-yousen/novel#master&path:packages/novel-mode-plugin"

# 等价的 git+https 形式
dsh plugin --profile <profile> add "git+https://github.com/github-yousen/novel.git#master&path:packages/novel-mode-plugin"

# 更安全：钉住提交（推荐，防止之后 push 改变被安装的代码）
dsh plugin --profile <profile> add "git+https://github.com/github-yousen/novel.git#<40-hex-sha>&path:packages/novel-mode-plugin"
```

- `&path:packages/novel-mode-plugin` 是 pnpm/DSH 用来指向 monorepo 子包的写法；DSH 的 format-1 索引也是用 `git+<url>.git#<commit>` + `&path:<directory>` 安装 git 版本。
- **一定要给整个 spec 加引号**：`&` 在 shell 里有特殊含义。
- ⚠️ **Windows 已知坑**（DSH Discussion [#5815](https://github.com/deepseek-ai/deepseek-harness/discussions/5815)，0.1.2-rc.1 起、0.1.3-alpha.1 仍在）：`dsh plugin add` 在 Windows 通过 `cmd.exe`（`shell: true`）拉起 pnpm，`&` 会被当作命令分隔符，导致 `&path:...` 被吞掉、**静默装成仓库根包**并以 0 退出。本机正是 Windows。因此在 Windows 上优先用**方法 C**（本地绝对路径），或在安装后用 `dsh --profile <profile> --dump-config` / 检查 profile 的 `package.json` 确认装进去的是 `@yousen/dsh-novel-mode` 而不是仓库根包。
- 安装后**重启 dsh / 重新加载 profile**：`package.json` 与 `cordis.patch.yml` 的变更在下次入口启动/启动时才被观察到。

## 方法 C — 本地安装（`plugin_manager`，绝对路径）

最可靠、不依赖网络/推送的方式，适合本机验证：

```
plugin_manager({
  "action": "install_bundle",
  "target": "D:\\yousen\\novel-mode-plugin",
  "enabled": true
})
```

- `target` 必须是**绝对路径**（Windows 上反斜杠在 JSON 里要写成 `\\`）。
- 这是当前 profile 内的安装，不会发布到任何市场。
- 该插件无构建脚本，故无需 `approvedBuilds`；若将来加了需要构建脚本的依赖，工具会先列出 `pendingBuilds` 并需要用户显式批准。

---

## 验证安装

```sh
dsh --profile <profile> --dump-config     # 应能看到 # == @yousen/dsh-novel-mode 这一层
```

然后重启 dsh：会话输入框出现「小说模式」按钮，或在输入框输入 `/novel`。进入模式后当前项目根目录会多出 `.dsh/`（skills / scripts / templates / config.yaml / charset.json / rules / AGENTS.md）。

卸载：`dsh plugin --profile <profile> remove @yousen/dsh-novel-mode`，或用 `plugin_manager` 的 `remove_bundle`。

---

## 与「市场收录」的区别

- 官方精选目录 / dshmarket：需向 `awesome-dsh-plugin/awesome-dsh-plugin` 提 PR（见 `SUBMISSION_STEPS.md`），合并后约一天内收录。
- 自托管 Discover 索引：见 `index-snippet.json`，需用户手动添加索引源。
- 本文件的三种命令都只是**直接安装**，与是否被收录无关。
