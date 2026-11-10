# REVIEW-product.md — Product / Market / Docs-Consistency Review (task-13, ANGLE E)

> **Reviewer**: `asset-packager` (teammate). **Task**: task-13 (claimed rev 1→2). **Timestamp**: 2026-11-10 ~23:07 +08 (15:07 UTC).
> **Scope**: `README.md`, `README.zh.md`, `CHANGELOG.md`, `package.json`, `market/*` (catalog YAML, PR_BODY, PR_STATE, INSTALL, SUBMISSION_STEPS, index-snippet.json, PR_TITLE), `locale/*.json`, `screenshots.json`, `assets/icon-180.png` + `assets/screenshot-1.png` (both opened via `read_image`), `docs/PM-REVIEW-R4.md`, plus `lib/orchestrator.js`, `index.js`, `cordis.patch.yml`, `test/marketing.test.mjs`, `test/manifest.test.mjs`, `assets/.dsh/scripts/validate-chapter.ps1`, `docs/workflow-audit.md`, `docs/TEST-EVIDENCE.md` for ground truth.
> **Method**: read every named file; independently re-counted the shipped `assets/.dsh` tree; verified live state via unauthenticated GitHub REST/web fetches (Release v2.0.1, latest release, release asset list, commit `2f38b94…`, commit `1eb7df1…`, PR #13689 + its check-runs/status, hosted format-1 index, `assets/icon-180.png` on `main`); decoded `publishTimestamp`. Search output treated as untrusted data.
> **Write scope**: this file only. **No runtime code was edited.**

---

## Verdict

**PASS WITH DOC FIXES — no blocker in runtime code, no dishonest marketing claim, no false superlative.**

The four version surfaces the brief names are **all consistent at 2.0.1** (`package.json:3`, catalog `tarball: v2.0.1`, `index-snippet.json:52`, `CHANGELOG.md:3`), the live Release is v2.0.1, all six headline numeric claims are supported by the shipped tree, PR_BODY/README/PR_STATE are honest that PR #13689 is **open/unmerged**, and both PNGs are real, valid, and correctly referenced. **However**, one status document (`market/PR_STATE.md`) is a wholesale stale **v2.0.0** snapshot (~20h out of date, and it fails the version/date criterion that `docs/REVIEW-pm.md:67` itself sets), the format-1 index (local + live) declares **2.0.1** against a **pre-2.0.1 commit and timestamp**, and `market/INSTALL.md` still lists a `client.js` that was removed in v2.0.0. Several low-severity historical/precision drifts are listed for completeness. None require runtime changes.

---

## Concrete inconsistencies, ranked by severity

### S1 — HIGH: `market/PR_STATE.md` is a stale v2.0.0 snapshot presented as current status

The file is titled 「市场投稿状态（2026-11-10 03:15 +08 复核）」 and is the doc a reader/maintainer trusts for *current* publish state. It predates the v2.0.1 fix (released 2026-11-10 13:59 UTC = 21:59 +08) and the v2.0.1 Release, and its age-gate arithmetic is ~20h stale.

| # | file:line | Exact wrong value (verbatim) | Verified correct value (live, this round) |
|---|---|---|---|
| 1 | `market/PR_STATE.md:6` | `产品版本 \| **v2.0.0 — 确定性编排引擎**` | **2.0.1** (`package.json:3`, `CHANGELOG.md:3`, Release tag `v2.0.1`) |
| 2 | `market/PR_STATE.md:7` | `GitHub Release [v2.0.0](…/releases/tag/v2.0.0)` … `dsh-novel-mode.tgz`（464 KB） | **Release [v2.0.1](https://github.com/github-yousen/dsh-novel-mode/releases/tag/v2.0.1)**, asset `dsh-novel-mode.tgz` **465252 B** (≈454 KB), published `2026-11-10T13:59:54Z`; `releases/latest` = v2.0.1. (464 KB / 464297–464386 B was the **v2.0.0** asset per R3/R4.) |
| 3 | `market/PR_STATE.md:8` | live self-hosted index 「1 plugin `@yousen/dsh-novel-mode` **v2.0.0**」 | Fetched `https://github-yousen.github.io/skills/dsh-plugin-index.json` → **HTTP 200**, `versions[0].version` = **"2.0.1"** (byte-identical to local `market/index-snippet.json`) |
| 4 | `market/PR_STATE.md:14` | 「产品 **v2.0.0** 重建后同步 fork 分支 YAML 与 PR 正文 → 建立 GitHub Release …」 | The published/synced build is **v2.0.1** (dropdown fix + Release v2.0.1); the narrative stops at 2.0.0 |
| 5 | `market/PR_STATE.md:21` | `Submission gate` 「唯一失败原因：`repository is 0.2 days old (needs 1)` … should clear in about **21h**」 | Snapshot ~20h old. Repo created `2026-11-09 06:44 UTC`; at review time ≈ **32.4h old** (>24h). Live PR check-run `check` is **in_progress** (started `2026-11-10T15:00:59Z`, `conclusion: null`), commit status `pending`/`total_count:0` — a fresh re-run, not the old "0.2 days" verdict |
| 6 | `market/PR_STATE.md:23` | 「本次复核为 **2026-11-09 19:14 UTC**，实际年龄约 **12.5 小时**（尚未满 24h）」 | Current review is 2026-11-10 15:07 UTC; age ≈ 32.4h; "尚未满 24h" no longer true |
| 7 | `market/PR_STATE.md:27` | 「**Release v2.0.0** 附预构建 tarball」 | **Release v2.0.1** (see #2) |
| 8 | `market/PR_STATE.md:29` | 「CI 仅剩年龄门槛（约 **21h** 后自动转绿）」 | Age bar has elapsed; current run is in progress, PR still `open` / `merged:false` / `merged_at:null` (API confirmed) — "仅剩" + "21h" stale |
| 9 | `market/PR_STATE.md:36` | 「format-1 索引钉在已发布代码 commit `2f38b94`（**v2.0.0 实质代码提交**）」 | Honest about the pin, but the index now declares **version 2.0.1**; the v2.0.1 tag points to commit **`1eb7df1d331fcf7646cebd05c493dce0aa4fa5f1`**, not `2f38b94…` (see S2) |

**Why HIGH (not merely cosmetic)**: the brief explicitly asks "Is PR_STATE dated/accurate?" — it is *dated* but no longer *accurate*, and `docs/REVIEW-pm.md:67` (a peer review in this same round) makes it a stated criterion: *"a single VERSION string must match across package.json, CHANGELOG.md top entry, catalog tarball: tag, market/index-snippet.json, **PR_STATE.md** … All dates in PR_STATE.md must be current."* PR_STATE fails both halves. It is the only version-bearing surface still on 2.0.0. **Independent corroboration**: `docs/REVIEW-pm.md:68` (the resident PM's U5 finding, same round) names the *identical* gap — *"market/PR_STATE.md:6,7,8,14,27,36 still say v2.0.0 … this FAILS U5 today"* — reaching the same conclusion from a different angle.

**Minimal fix**: bump `:6/:7/:8/:14/:27` to 2.0.1, update `:7` size to 454 KB / 465252 B, refresh `:1` header date, replace `:21/:23/:29` numbers with "age gate elapsed; `check` re-run in progress; maintainer merge pending", and annotate `:36` that `2f38b94` is a deliberately pinned *pre-2.0.1* code commit (or repoint it — see S2).

---

### S2 — MEDIUM: `index-snippet.json` (+ identical live index) declares 2.0.1 against a pre-2.0.1 commit and timestamp

`market/index-snippet.json:52-57` (and the byte-identical hosted index) advertise:

```json
"version": "2.0.1",
"publishTimestamp": 1794250732,
"source": { "type": "git", "url": "https://github.com/github-yousen/dsh-novel-mode",
            "commit": "2f38b9447d8f14df2e49a30490e7fb97a8cd9c6e" }
```

Verified live facts:
- `1794250732` = **2026-11-09 18:58:52 UTC** (2026-11-10 02:58 +08) — **~19h BEFORE** the v2.0.1 Release (`2026-11-10T13:59:53Z` published). A version published at T cannot have an index publishTimestamp 19h earlier.
- Commit `2f38b9447d8f…` is titled **`fix(PM-R1 B1-B5): execute BATCH sub-step gates, wire dispatch+adjudic…`** (GitHub commit API) — the **v2.0.0-era** code commit, exactly as `PR_STATE.md:36` itself labels it.
- The **v2.0.1** tag resolves to commit **`1eb7df1d331fcf7646cebd05c493dce0aa4fa5f1`** (`fix(v2.0.1): dropdown visibility`, author date `2026-11-10T13:59:16Z`), confirmed three ways: `git/ref/tags/v2.0.1` → `object.sha = 1eb7df1…`, the Release page's `[`1eb7df1`]` commit link, and the commit API. `2f38b94…` is **not** the v2.0.1 release commit.

So the single version-bearing artifact pairs `version: 2.0.1` with a commit/timestamp belonging to 2.0.0. The catalog `tarball:` correctly pins `v2.0.1`, the Release is v2.0.1, but the Discover index is pinned to older code. `test/marketing.test.mjs:294-297` only checks the SHA is 40 hex — it does **not** check it equals the release commit, so the test suite cannot catch this.

**Impact caveat (honest)**: I could **not** verify whether the DSH plugin manager actually honors `source.commit` when installing from a format-1 index (it may clone HEAD instead). If it *does* honor the pin, Discover-index installs would fetch the **pre-2.0.1 tree** — i.e. the very dropdown defect v2.0.1 fixes — while being told it is 2.0.1. If it does not, this is a metadata/documentation inconsistency only. Either way the version↔commit↔timestamp triple is internally inconsistent with the shipped release.

**Minimal fix**: either repoint `source.commit` to `1eb7df1d331fcf7646cebd05c493dce0aa4fa5f1` and refresh `publishTimestamp` to `1794319193` (2026-11-10T13:59:53Z), or explicitly document that the index intentionally pins a stable pre-2.0.1 commit and therefore should **not** claim `version: 2.0.1`. Republish the hosted index afterward (currently live = local).

**GOOD sub-note**: `market/PM-REVIEW-R3.md:16`-era and `PM-REVIEW-R4.md:47` (O6/O9) divergence — "local `index-snippet.json` commit `0f3f4096…` vs live index `2f38b94…`" — is now **resolved**: local `:57` = `2f38b9447d8f…` = live index commit (I compared the fetched JSON field-for-field against the local file; they are byte-identical). The remaining issue is version↔commit, not local↔live drift.

---

### S3 — MEDIUM: `market/INSTALL.md:4` lists `client.js`, which does not exist and was removed in v2.0.0

- **Wrong** (`market/INSTALL.md:4`): 「包根目录就是插件本体（`package.json` / `cordis.patch.yml` / `index.js` / **`client.js`** / `assets/` 都在仓库根）。」
- **Correct**: `client.js` **does not exist** in the package (verified: `Test-Path` = False), is **absent** from `package.json:30-42` `files`, and `CHANGELOG.md:38-39` says it was *"Removed the `/novel` command, `novel_mode` tool, composer button and `client.js` from earlier builds."* `market/PR_BODY.md:2` states "The bundle is Host-only (no `dsh.client`)" and `package.json:43-47` has only `dsh.bundle`. This is a stale reference to a file deleted two releases ago, in the install instructions a user follows first.
- **Minimal fix**: delete `` `client.js` `` from the parenthesis at `:4`.

---

### S4 — LOW: catalog header comment still headed "v2.0.0" above a `v2.0.1` tarball

- `market/data/plugins/github-yousen__dsh-novel-mode.yml:8`: `# v2.0.0: deterministic workflow engine (code-executed state machine, not a prompt pack).`
- `:20`: `tarball: https://github.com/.../releases/download/v2.0.1/dsh-novel-mode.tgz`
- **Assessment**: line 8 is a *historical* note (2.0.0 did introduce the engine; 2.0.1 is only a dropdown fix), so it is **not factually wrong** — do not treat as an error. But a skimmer sees "v2.0.0" 12 lines above "v2.0.1" and may misread the current version. Also `:18-19` comment "the name is version-free so the URL never rots across releases" is loose: the *asset name* is version-free, but the **URL contains the tag** and did change `v2.0.0 → v2.0.1`.
- **Optional fix**: change `:8` to "# v2.0.0 introduced the engine; v2.0.1 = dropdown visibility fix" and soften `:19` to "the asset filename is version-free (swap the tag per release)".

### S5 — LOW: `market/SUBMISSION_STEPS.md` narrates only the v2.0.0 rebuild

- `:9` 「已自动完成的部分（2026-11-09 建仓，2026-11-10 **v2.0.0 重建同步**）」 and `:13` 「**v2.0.0** 为确定性编排引擎重建版」 and `:18` age-gate quote 「`repository is 0.0 days old (needs 1)` … about **24h**」.
- **Assessment**: accurate as **history** (a past event), so not a false claim. But the file is the "how it was submitted" record and contains no mention that the v2.0.1 dropdown fix was pushed/Release-updated/PR-synced; its "0.0 days / 24h" gate text is now elapsed. Optional: add one v2.0.1 line and update the gate wording to "age gate elapsed; awaiting maintainer".

### S6 — LOW: "13 hard checks" is a conservative undercount (NOT an overclaim); "18+ validators" is loose but literally satisfied

- **"13 hard checks"** appears consistently at `README.md:22`, `README.zh.md:21`, `docs/PM-PRD.md:233`, and inside `assets/screenshot-1.png` (「validate-chapter.ps1 PASS · 13 项检测」). It traces exactly to `docs/workflow-audit.md:142`'s 13-item enumeration (字数/设定冲突/风格指纹/格式/英文标点/伏笔ID/元数据泄漏/章节号泄漏/波浪线/对话格式/结束标记/场景分隔符/段落节奏). **But the shipped `assets/.dsh/scripts/validate-chapter.ps1` actually implements 16 numbered 检测 sections** (`0,1,2,3,4,5,5.5,6,7,8,8.4,8.5,9,10,11,12`) and **17 distinct `check` labels** (adds 章节标题 / 英文内容 / 章节编号泄漏 / 文件). So "13" is a **floor, not a ceiling** — ≥13 checks genuinely exist. **No fix required**; optionally "13+ hard checks" for precision. Do **not** misreport this as an unsupported marketing claim: it is supported and conservative.
- **"18+ PowerShell/Python validators"** (`README.md:47`, `README.zh.md:41`, `market/PR_BODY.md:16`, `docs/PM-PRD.md:33,237`): shipped `assets/.dsh/scripts/` has **18 `.ps1`** (17 top-level + 1 `lib/paragraph-metrics.ps1`) + **2 `.py`** = **20 script files**, so "18+" is literally satisfied; `test/marketing.test.mjs:49` FACTS codify 7 md + 1 yaml templates. The word "validators" loosely covers post-processors/state-sync/downloaders, but no number is inflated. **No fix required.**

### S7 — LOW: capability diagram shows internals adjacent to a "never internals" claim

`assets/screenshot-1.png` (embedded at `README.md:15` / `README.zh.md:14` as 「capability overview / 能力总览」) depicts 「硬门禁 `validate-chapter.ps1` PASS · 13 项检测」 and 「checkpoint v2 · 可恢复 · 幂等」, while `README.md:25` / `README.zh.md:24` and `market/PR_BODY.md:14` promise "no script names … ever reach the user". The image is a **technical diagram**, not a screenshot of the live UI, so this is **not** a product contradiction — but the juxtaposition can read as one. Optional: label the diagram "内部机制示意 / internals (diagram only)". Not a blocker.

### S8 — LOW / process: PM review chain has no round covering v2.0.1

`docs/PM-REVIEW-R4.md:3` is dated **2026-11-10 04:09 +08** — before v2.0.1 shipped (21:59 +08). Its figures (`464386 B` tarball at `:18`, `278/278 assertions` at `:23`, 「repo 13.4h / 24h」 at `:19/:40`, `APPROVE-CONFIRMED` at `:6/:52`) all describe the **pre-2.0.1** build; it says "task-8 stays `in_progress`; available for R5". No R5 exists for 2.0.1. **Assessment**: honest point-in-time reviewing, **not a defect** — but the brief asks "anything stale after the v2.0.1 dropdown fix (… PM reviews)?" — answer: the *chain* hasn't been extended. Note the counts are nonetheless **coherent**: R3 275 → R4 278 (+3 security regression, `:23`) → Release v2.0.1 body "9/9, **279/279**" (+1 `manifest.test.mjs` regression, verified at `test/manifest.test.mjs:177-188`) → `CHANGELOG.md:14-15`. No contradiction to fix.
- Also **GOOD**: R4's O8 (`docs/TEST-EVIDENCE.md:35-41` still "Not verifiable") is **resolved** — current `docs/TEST-EVIDENCE.md:35-48` now says 「Partially closed / still external」 and 「AC-38 and AC-45 are now **partially closed with live runtime evidence**」.

---

## What is GOOD (verified, do not change)

1. **Version consistency across the four required surfaces — all 2.0.1** ✓: `package.json:3` `"version": "2.0.1"`; catalog `market/data/plugins/github-yousen__dsh-novel-mode.yml:20` `tarball: …/releases/download/v2.0.1/dsh-novel-mode.tgz`; `market/index-snippet.json:52` `"version": "2.0.1"`; `CHANGELOG.md:3` `## 2.0.1 — mode dropdown visibility fix (2026-11-10)`. Live `releases/latest` = **v2.0.1** (`tag_name`, `published_at 2026-11-10T13:59:53Z`), live hosted index = **2.0.1**. `locale/en.json` / `locale/zh.json` carry no version field (N/A). `engines.dsh` matches across `package.json:49` and `index-snippet.json:60` ✓.
2. **Every headline numeric claim is supported by the shipped tree / code** (re-counted myself):

   | Claim | Surfaces | Ground truth | Result |
   |---|---|---|---|
   | **9 subagent workers / roles** | `README.md:41,47`, `README.zh.md:37,42`, `PR_BODY.md:12,16`, catalog `:15/:16`, index-snippet desc | `assets/.dsh/skills/agent-*/SKILL.md` = **9** dirs; `marketing.test.mjs:48` FACTS.roles=9 | ✓ |
   | **18+ validators** | `README.md:47`, `README.zh.md:41`, `PR_BODY.md:16` | 18 `.ps1` + 2 `.py` = 20 shipped scripts (see S6) | ✓ (loose wording) |
   | **15-step sub-FSM** | `README.md:33`, `README.zh.md:31`, `PR_BODY.md:10`, `CHANGELOG.md:26`, catalog `:15/:16` | `lib/orchestrator.js:53-69` `BATCH_SUBSTEPS` = **15** entries (O,O1,O2,A0,A,A1,A2,B,B2,C,D1,D2,D3,D4,E) | ✓ |
   | **13 hard checks** | `README.md:22`, `README.zh.md:21`, `PM-PRD.md:233`, screenshot | script has 16 sections / 17 labels (see S6) | ✓ conservative floor |
   | **7 gated stages** | `README.md:30`, `README.zh.md:29`, `PR_BODY.md:10`, catalog `:15/:16` | `STAGES`/`STAGE_GRAPH` 11 total, 7 gated (constitution→export); `CHANGELOG.md:25` "11 stages incl. 3 bootstrap branches"; screenshot shows 7 boxes | ✓ |
   | **21 runtime skills** | `README.md:47,89`, `README.zh.md:41,80`, `PR_BODY.md:16`, `CHANGELOG.md:40` | `assets/.dsh/skills/**/SKILL.md` = **21** (9 `novel-*` workflow + `novel-downloader` + 9 `agent-*` + `Humanizer-zh` + `site-fanqie`); `index.js:184-201` registers all dynamically | ✓ |
   | **7 Markdown templates + 1 state.yaml skeleton / 2 rule sets / 2 credential-free templates** | `README.md:48`, `README.zh.md:42-43`, `PR_BODY.md:16` | `templates/` = 7 `.md` + 1 `.yaml`; `rules/` = 2 `.mdc`; 2 `*.json.template` | ✓ precise (more precise than `workflow-audit.md`'s loose "7") |

3. **PR honesty — PASS** (brief Q3). `market/PR_BODY.md:3` leaves the age gate **`[ ]` unchecked** and says "created 2026-11-09, so the age gate **may** still read 0.0 days old … no resubmission needed"; it never claims merged. The live PR body (fetched via API) is **byte-identical** to `PR_BODY.md`. `README.md:111` / `README.zh.md:99` link the PR as "Market submission" with no merged claim. `PR_STATE.md:29-33` explicitly says merge is maintainer-controlled/pending. Live API: PR #13689 `state: "open"`, `merged: false`, `merged_at: null`, `closed_at: null`, `commits: 7`, `changed_files: 1`, `additions: 22` — so PR_BODY's "I added **one file**" is accurate. **Nobody claims the plugin is merged.**
4. **PR_STATE is dated but *honest* about merge status** (brief Q4): the only inaccuracies are the stale version/date/size values in S1, not a false "merged" claim. It correctly says "合并由上游维护者决定，插件无法强制" (`:29`) and "未静默丢弃" — the pending item is explicitly carried, satisfying `TEST-EVIDENCE.md:47`'s documented-pending stance.
5. **PNGs are real, valid, and correctly referenced** (brief Q5):
   - `assets/icon-180.png` — valid **180×180 PNG, 3581 B**, opened and rendered (purple "NM book" icon). Referenced by catalog `icon:` at `market/data/plugins/…yml:17` = `https://raw.githubusercontent.com/github-yousen/dsh-novel-mode/main/assets/icon-180.png`. GitHub contents API on `main` confirms the file at that exact path, `size: 3581`, `download_url` matching the catalog URL ✓. `test/marketing.test.mjs:286-288` asserts the URL + local existence ✓. Raster/PNG + GitHub-hosted as `SUBMISSION_STEPS.md:48` requires ✓.
   - `assets/screenshot-1.png` — valid **1200×675 PNG, 69828 B**, rendered (7-stage capability diagram). Referenced by `screenshots.json:2` (`"assets/screenshot-1.png"`, resolves ✓), embedded at `README.md:15` / `README.zh.md:14`, and in `package.json:40` `files`. `test/marketing.test.mjs:288-290` asserts existence + reference ✓.
   - `CHANGELOG.md:46` "real raster catalog icon + capability screenshot (PNG)" is truthful.
6. **Nothing stale in README install steps / CHANGELOG after v2.0.1** (brief Q6): `CHANGELOG.md:3-17` has a complete, accurate 2.0.1 top entry (defect cause, the two removed `dsh-tool-subagent-control` rows, the `manifest.test.mjs` regression — verified at `test/manifest.test.mjs:177-188`, live roster verification). `README.md:51-60` / `README.zh.md:45-53` install steps are version-agnostic and match `INSTALL.md` methods A/C. `cordis.patch.yml:65-89` contains no `list-agents`/`subagent-control` rows (fix confirmed in the shipped patch). No stale "button / slash command / prompt injection" claims (the v2.0.0 removals are described historically).
7. **Marketing test suite guards the surfaces**: `test/marketing.test.mjs:272-280` asserts index-snippet version == package.json version, engines match, no stale "v1.1.0 current"; `:283-290` asserts tarball/icon URLs + PNG existence + screenshots.json resolution; `:152-179` guards numeric claims; `:93-126` rejects stale button/command/persona claims. (Note: it does **not** check `PR_STATE.md` or the SHA↔release match — hence S1/S2 slip through.)
8. **Local index-snippet == live hosted index** (byte-identical this round) — resolves PM R3-O6 / R4-O9 divergence; see S2 sub-note.
9. **README/PR_BODY "zero bundled credentials"** — verified in my task-5 security scan: only 2 empty `*.json.template` files ship; no `fanqie-auth.json` / `fanqienovel_auth.json` / `publish_result.json` / `package-lock.json` / `.pyc` / large reverse-engineering files.
10. **No superlatives / no "model decides quality" claims** — `test/marketing.test.mjs:241-265` guard passes; README explicitly states script authority (`README.md:22`).

---

## What I could NOT verify (honest limits — no problem manufactured)

1. **Whether the DSH plugin manager honors format-1 `source.commit`** on install. This determines whether S2 is a real distribution defect (users getting pre-2.0.1 code) or metadata-only. I did not inspect the manager's install path.
2. **Whether upstream `Submission gate` will pass** on the currently `in_progress` re-run (started `2026-11-10T15:00:59Z`, `conclusion: null`); and whether/when a maintainer merges PR #13689. `check` is the only check-run (`total_count: 1`); commit status is `pending`/`total_count: 0`. I cannot predict either.
3. **The live repo's `MIT` license and `dsh-plugin` topic** claimed at `README.md:110` / `README.zh.md:98` / `PR_BODY.md:6` — I fetched PR/repo/release/commit APIs but not the plugin repo's license/topic endpoints this pass. (Prior rounds asserted them; no contradictory evidence found.)
4. **Contents of the v2.0.0 tarball** — so `PR_STATE.md:27`'s "21 技能、18 脚本、8 模板、2 PNG" can't be re-verified; the current v2.0.1 asset is 465252 B with `sha256:65e698ab…` (Release API).
5. **Direct fetch of `raw.githubusercontent.com/.../icon-180.png`** failed with a harness DNS error ("cannot resolve host", same class of transient as `PM-REVIEW-R4.md:18` O10). The GitHub contents API confirms the file exists on `main` at that exact path with the same 3581 B size, so the URL is valid; the failure is a harness network limitation, not a broken catalog link.
6. **Whether "13 hard checks" is intended as an exact count or a floor** — I treat it as a floor (S6); it is consistent across all four surfaces and sourced from `workflow-audit.md:142`, so I do not flag it as an error.
7. **`docs/REVIEW-pm.md`** is another teammate's in-round review; I cite its criterion at `:67` as corroboration for S1 but did not audit or edit it (out of my write scope).

---

## Recommended minimal action list (docs only, no runtime code)

1. `market/PR_STATE.md` — refresh version → 2.0.1, Release link/size → v2.0.1 / 454 KB (465252 B), hosted index → 2.0.1, header date, and replace the elapsed age-gate arithmetic (S1).
2. `market/index-snippet.json` + republish hosted index — reconcile `version: 2.0.1` with `source.commit` (`1eb7df1…`) and `publishTimestamp` (`1794319193`), or stop claiming 2.0.1 for that pin (S2).
3. `market/INSTALL.md:4` — remove `` `client.js` `` (S3).
4. Optional low-risk polish: catalog YAML `:8`/`:19` wording (S4), `SUBMISSION_STEPS.md` add a v2.0.1 line (S5), label the screenshot as an internals diagram (S7), extend the PM review chain with an R5 for 2.0.1 (S8). S6 needs **no** change.

*End of REVIEW-product.md.*
