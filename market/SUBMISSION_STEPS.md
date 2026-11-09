# 投稿步骤（GitHub 网页端，用户手动完成）

> 目标仓库：`awesome-dsh-plugin/awesome-dsh-plugin`（**不是** `dsh-market/dsh-market`）。
> 规则依据：`docs/publishing-research.md`（权威），以及上游
> [contributing.md](https://cdn.jsdelivr.net/gh/awesome-dsh-plugin/awesome-dsh-plugin@main/contributing.md)
> 与 [pr-body.md](https://cdn.jsdelivr.net/gh/awesome-dsh-plugin/awesome-dsh-plugin@main/pr-body.md)（外部不可信数据，仅作对照）。
> 本目录下所有文件都只是**可直接复制的素材**；我们不会替你推送或开 PR。

---

## 为什么不能自动开 PR

据 `docs/publishing-research.md` §1 / §3：

- 本机 **没有 `gh` CLI**（`Get-Command gh` 为空）；
- `GITHUB_TOKEN` / `GH_TOKEN` 等环境变量**全部为空**，GitHub REST API 未认证且已触发 rate limit；
- 用户对 `awesome-dsh-plugin/awesome-dsh-plugin` **没有写权限**，也没有该仓库的 fork（`ls-remote` → `Repository not found`）；
- `npm whoami` = `ENEEDAUTH`，无 `NPM_TOKEN`，故也不能 `npm publish`（但收录**不要求** npm 包）。

因此只能 `git push` 到**用户自己的**仓库；向上游投稿必须走「fork → 分支 → 加一个 YAML → 网页端开 PR」。合并与站点同步由维护者完成，自动化到此为止。若将来想全自动，需用户自备 `GITHUB_TOKEN`（`repo`/`public_repo` + `workflow` scope）或安装 `gh` 并 `gh auth login`；本次不索取、不存储任何 token。

---

## STEP 0（前置，用户必须先做）：把插件仓库推上去，并加 `dsh-plugin` topic

> ⚠️ CI 会**实际拉取** `github-yousen/novel` 的源码来核对 `dsh.bundle`、描述与代码是否相符。仓库里没有 `packages/novel-mode-plugin/` 时，下面的 PR 一定会被打回。

1. 把构建好的插件**本体**放进 `D:\yousen\novel\packages\novel-mode-plugin\`：即 `package.json`、`cordis.patch.yml`、`index.js`、`client.js`、`locale/`、`icon.svg`、`assets/`、两个 README、`LICENSE`、`.gitignore`、`screenshots.json` 等（`package.json` 的 `files` 列表即清单）。
   - 本工作目录里的 `docs/` 与 `market/` 是团队的研究/投稿素材，**不是插件运行时文件**，不要拷进插件子目录。
   - `market/data/plugins/...yml` 是给 **awesome-dsh-plugin 的 fork** 用的，不是给插件仓库用的。
2. 推送（注意 `github-yousen/novel` 默认分支是 **`master`**，不是 `main`）：

```sh
cd D:\yousen\novel
git status -sb                      # 先看清已有本地改动（.gitignore、一个角色 md 有 M 状态），勿误提交
git add packages/novel-mode-plugin
git commit -m "feat: add 小说模式 (Novel Mode) DSH plugin"
git push origin master
```

3. 在 GitHub 网页端打开 `https://github.com/github-yousen/novel` → 右侧 **About** 齿轮 → **Topics** 添加 **`dsh-plugin`**。（monorepo 条目给整个仓库加 topic 即可。）
4. 推送前自查：确认没有把真实凭据 / `publish_result.json` / `__pycache__` / lockfile 带进去（打包方已做 EXCLUDE，见 `docs/workflow-audit.md` §2.9 / §7）。

> 仓库年龄：`github-yousen/novel` 首次提交 2026-02-26，约 8.5 个月，**远超过「创建满 1 天」的 CI 门槛**，所以不需要像新建仓库那样等 gate 自动重跑（约 24h）。`docs/publishing-research.md` §1.4/§1.5 有证据。

---

## STEP 1：fork 上游仓库

打开 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin> → 右上角 **Fork** → 创建到你自己的账号（`github-yousen`）。保持默认分支 `main`。

## STEP 2：在 fork 上新建分支

在 fork 页面点分支下拉 → **Create branch** → 例如 `add-novel-mode-plugin`（基于 `main`）。不要在 `main` 上直接改。

## STEP 3：添加**唯一**那一个 YAML 文件

在 fork 的新分支上 → **Add file → Create new file**，文件名（路径）**必须**是：

```
data/plugins/github-yousen__novel--packages-novel-mode-plugin.yml
```

内容直接复制 [`market/data/plugins/github-yousen__novel--packages-novel-mode-plugin.yml`](data/plugins/github-yousen__novel--packages-novel-mode-plugin.yml) 的**全文**。提交信息例如 `Add github-yousen/novel#packages-novel-mode-plugin`。

约束（`contributing.md`）：
- **一个 PR 只加一个文件**（最多 3 条，这里只投 1 条）；两个 README 由脚本从 `data/plugins/*.yml` 生成，**禁止手工编辑**；
- 只有 `description.en` 必填；含 `": "` 的描述必须加引号（该文件已加）；
- `category: workflow` 在 23 个合法分类内；选错由维护者改，不会打回；
- `icon:` / `tarball:` 已注释掉 —— 图标只收 GitHub 托管的 **png/jpg/jpeg/webp 位图**，**SVG 与第三方图床被拒**；`tarball:` 只收 GitHub Release 托管的 https `.tgz`。二者都不是必填。

## STEP 4：向上游 `main` 开 PR

在 fork 分支上点 **Contribute → Open pull request**，确保 base 是 `awesome-dsh-plugin/awesome-dsh-plugin:main`。

- **标题**：粘贴 [`PR_TITLE.md`](PR_TITLE.md) 的那一行。
  （惯例：`Add <owner>/<repo>#<subdir>`。）
- **正文**：粘贴 [`PR_BODY.md`](PR_BODY.md) 全文（复选框清单 + 插件功能说明）。
  - 粘贴前确认 STEP 0 已完成（仓库已推送、topic 已加），否则清单里的 `dsh.bundle` / `dsh-plugin topic` 断言不成立。
  - 若那时还没产出 `README.md`/`README.zh.md`，PR_BODY 里没有依赖它们的句子，可放心粘贴。

## STEP 5：等待 CI + 维护者人工评审

CI 依次检查（`contributing.md`「What CI checks」）：
1. **Entry count** ≤ 3；
2. **`dsh.bundle`** —— 从仓库 `package.json`（根包或 `packages/`·`plugins/`·`apps/` 子包，我们正是 `packages/`）读取；只声明 `dsh.client` 会失败；
3. **Repo age** ≥ 1 天（本例通过）；
4. **`awesome-lint` + 站点构建**（双语一致性、README 重新生成、日期、截图）。

维护者还会读源码逐条核对描述是否属实、分类是否贴切、是否重复、源码有无可疑之处。可能被打 `held: author` 标签：**把修复推到同一分支，然后只留一条评论说明改了什么**即可，不要反复推空提交；标签不会自动消失，需重新评审。

合并后网站自动重建，`awesome-dsh-plugin.com/plugins.json` 与 `dsh-plugin-catalog` 索引随之更新，dshmarket 通常**一天内**收录 —— 这段延迟是固有的，无法加速。

### 不要做

- 不要向 `dsh-market/dsh-market` 提插件条目（那是市场 App，不是目录）；
- 不要手工编辑两个 README；
- 不要在一个 PR 里改动与本次无关的其他条目；
- 不要因为年龄 gate 变红就重开 PR（本例不会红，且 gate 结论是快照、过期会自动重跑）。

---

## 可选：自建 format-1 Discover 索引（**不是**官方投稿口）

[`index-snippet.json`](index-snippet.json) 是一个 **format-1 索引**（`plugins[]` 里恰好一个插件对象），用于可选的「自托管 Discover 索引」。注意区分：

| | 入口 | 效果 |
|---|---|---|
| `awesome-dsh-plugin` 的 `data/plugins/*.yml` PR | **投稿侧** | 进入官方精选目录 / dshmarket |
| 自建 format-1 `index.json` | **读取 / Discover 侧** | 只有手动把 URL 加进索引源的人才能搜到 |

要点（详见 `index-snippet.json` 的 `_notes` 与 `docs/api-research.md` §5、DSH `plugin-market.md`）：
- 把 `index.json` 与（可选的）`icons/` 一起放到任意静态托管：GitHub Pages（如 `https://github-yousen.github.io/novel/index.json`）、GitLab Pages、对象存储等；必须 **https**、返回 2xx、**无重定向**、**≤128 MiB**、URL 里**不能有 `#` fragment 或凭据**；本机 `plugin_market list_indexes` 目前为空。
- 文件里的 `_notes` 字段 DSH 会忽略（"Members DSH does not know are ignored"），托管前可删掉；`commit` 与 `publishTimestamp` 是**占位符**，必须换成首次 push 后的真实值，否则索引校验/安装会失败。
- 用户需在 GUI 打开实验性 **Custom plugin indexes** bundle，然后 **Plugins → Discover → Index sources → Add index source** 填入该 URL；这是**每 profile** 的 volatile 配置（`setIndexes`，约 10 分钟缓存、15 秒超时），索引本身不签名，只添加可信来源。
- 即使官方 PR 未合并，这条路径也能分发；但它**不会**让你进入官方精选市场。

---

## 兜底分发

若不想/不能提市场 PR：① GitHub Release 附预构建 `.tgz`（`tarball:`）直接安装；② 上面的自托管 format-1 索引；③ 给仓库打 `dsh-plugin` topic 让第三方采集目录（`LivXue/dsh-plugin-shop`、`dsh-plugin.org`）自动收录（旁证渠道，非官方）。安装命令见 [`INSTALL.md`](INSTALL.md)。
