# 安装「小说模式」(Novel Mode)

> 独立仓库：https://github.com/github-yousen/dsh-novel-mode （Public，默认分支 **`main`**，MIT）。
> 包根目录就是插件本体（`package.json` / `cordis.patch.yml` / `index.js` / `client.js` / `assets/` 都在仓库根）。

---

## 主机先决条件（重要）

- **PowerShell 7（`pwsh`）**：打包的工作流脚本是 `.ps1`，统一以 `pwsh -NoProfile -File .dsh/scripts/<name>.ps1 -Chapter N` 执行（禁止 `-Command`）。
- **Python 3**：`fanqie-rank.py` / `fanqie-download.py` 两个脚本。它们**纯标准库**（`requirements.txt`：Python ≥3.7，无需 `pip install`）。
- 一个**可写的小说项目目录**：进入模式时插件会把随包的 `.dsh/` 工作副本物化到当前项目根目录（已存在的文件不会被覆盖）。
- 插件本体**是纯 JavaScript、无构建脚本、无 npm 依赖**（只用 `ctx` / `inject` 取宿主服务），所以从 git 安装**不需要** `prepare` 脚本，也**不需要** pnpm `allowBuilds` / `approvedBuilds` 构建授权。

`engines.dsh`：`>=0.2.0-rc.1 <0.2.0 || >=0.2.1-rc.1 <0.3.0-0`（安装时宿主会复核）。

---

## 方法 A — 从 GitHub 源码（仓库 URL，即目录条目里的 `url`）

```sh
dsh plugin --profile <profile> add https://github.com/github-yousen/dsh-novel-mode
```

`<profile>` 是**必填**的（`dsh plugin` 只是把参数转发给 profile 目录下的 pnpm），例如 `--profile desktop`。

## 方法 B — git spec 变体（可钉住提交）

```sh
# GitHub 简写（分支 main）
dsh plugin --profile <profile> add "github:github-yousen/dsh-novel-mode#main"

# 等价的 git+https 形式
dsh plugin --profile <profile> add "git+https://github.com/github-yousen/dsh-novel-mode.git#main"

# 更安全：钉住提交（推荐，防止之后 push 改变被安装的代码）
dsh plugin --profile <profile> add "git+https://github.com/github-yousen/dsh-novel-mode.git#<40-hex-sha>"
```

- 独立仓库**不需要** `&path:` 子目录参数，因此绕开了 Windows `cmd.exe` 把 `&` 当命令分隔符、静默装成根包的已知坑（DSH Discussion [#5815](https://github.com/deepseek-ai/deepseek-harness/discussions/5815)）。
- 安装后**重启 dsh / 重新加载 profile**：`package.json` 与 `cordis.patch.yml` 的变更在下次入口启动/启动时才被观察到。

## 方法 C — 本地安装（`plugin_manager`，绝对路径）

最可靠、不依赖网络的方式，适合本机验证：

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
