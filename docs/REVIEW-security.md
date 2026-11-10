# ANGLE C — Security / Packaging review

Reviewer: api-researcher (task-11, multi-angle review round). Date: 2026-11-10.
Scope: **read-only**. Only file written is `docs/REVIEW-security.md`. No runtime code edited.

## Method / evidence

- Read the actual files: `package.json`, `index.js`, `lib/orchestrator.js`, `.gitignore`,
  `test/security.test.mjs`, `test/integration-materialize.test.mjs`, `docs/workflow-audit.md`,
  `cordis.patch.yml`, `assets/.dsh/scripts/{validate-chapter.ps1,build-context-bundle.ps1,fanqie-rank.py,fanqie-download.py,validate-outline.ps1}`,
  `assets/.dsh/skills/site-fanqie/SKILL.md`, `api_client.py`, `fanqie_encrypt.js`, `fanqie_drama_rank.py`,
  both `*.json.template`, `assets/make-tarball.py`, `README.md`, and the `market/*` files.
- Ran `npm pack --dry-run --json` (npm 10.1.0 / node 20.9.0): **110 files, 1,260,760 B unpacked**.
- Ran `node test/security.test.mjs`: **PASS 24/24 assertions** (exit 0).
- Exhaustive credential/business-ID sweep with **PowerShell**, covering hidden directories
  (`assets/.dsh/**`) that ripgrep skips by default: 144 files, **0 credential-VALUE hits**.
  Also scanned `docs/` and `market/`: **0 hits**.
- `git check-ignore --no-index -v` on shipped and runtime paths; `git ls-files` counts.
- Concretely probed `fs.cpSync` into a junction (symlink target) in a temp dir, then cleaned up.
- Ran `pwsh -NoProfile -File validate-outline.ps1 -Chapter 15` to check an adjacent observation.

> All findings below are **concrete and reproduced**. Nothing is manufactured. Where a
> risk is conditional/inherent rather than an exploitable bug, it is ranked and labeled as such.

---

## VERDICT

**CONDITIONAL PASS — shipable, but fix F-1 (`.gitignore`) before the next repo push or any
fresh clone, and address F-2 (default-off external-site skills) before a public listing.**

There are **no real credentials, cookies, session tokens, private keys, or GitHub tokens in the
shipped tree**, and `npm pack --dry-run` confirms zero forbidden artifacts (only the two empty
`*.json.template` files; no `fanqie-auth.json`, `fanqienovel_auth.json`, `publish_result.json`,
`package-lock.json`, `.pyc`, `__pycache__`, `node_modules`, or RE dumps). The Host adapter is
genuinely defensive: no network primitives, no third-party imports, no `-Command`, no
concatenated user input, integer-bounded chapter, 120 s timeout, and bounded public projections.
The two highest-value risks are **packaging hygiene** (an ignore rule that matches shipped
assets — F-1) and **supply-chain/privacy exposure from default-on external-site skills** (F-2/F-3).
Neither is a runtime credential leak.

---

## CONCRETE FINDINGS (ranked by severity)

### F-1 — HIGH (packaging / repo hygiene): `.gitignore:7` `.dsh/` matches the SHIPPED `assets/.dsh/` tree

**File:line:** [.gitignore:7](.gitignore#L7) — `.dsh/`

**Reproduction (run in `novel-mode-plugin/`):**
```
git check-ignore --no-index -v assets/.dsh/scripts/validate-chapter.ps1
→ .gitignore:7:.dsh/   assets/.dsh/scripts/validate-chapter.ps1     (EXIT=0, IGNORED)

git ls-files assets/.dsh | Measure-Object -Line  → 93   (tracked, so they survive TODAY)
```
`git check-ignore` (without `--no-index`) returns exit 1 only because those 93 files are already
tracked; ignore rules do not apply to tracked files. The raw rule genuinely matches every shipped
file under `assets/.dsh/`.

**Impact:** Fragile-by-construction. Any **new** workflow asset added under `assets/.dsh/`
(a new script, template, skill, or rule) is silently ignored by `git add .` and is **missing from
the GitHub repo** (the repo is the market install source per `market/data/plugins/...yml` and
`market/INSTALL.md`). `npm pack` is unaffected today because `package.json files: ["assets/**"]`
packs the local directory regardless of git tracking — but a fresh clone/CI checkout of the repo
would silently lack the file. The rule's intent (verified at `.dsh/state/novel-mode.checkpoint.json`,
which IS ignored) is to exclude the **root-level runtime checkpoint dir**, not bundled assets.

**Minimal fix (verified):** change line 7 from `.dsh/` to `/.dsh/` (anchor to repo root):
```
# before → after (respect CRLF line endings)
- .dsh/
+ /.dsh/
```
Verified with a temporary edit + `git check-ignore --no-index`: `assets/.dsh/...` → EXIT=1 (not
ignored), root `.dsh/state/...` → EXIT=0 (still ignored). Original `.gitignore` was restored.
No other .gitignore / global excludes / `.git/info/exclude` rule is involved.

### F-2 — MEDIUM (supply-chain / privacy): external-site skills `site-fanqie` + `novel-downloader` are `userInvocable: true` by default

**File:line:** [index.js:198](index.js#L198) (`invocation: { modelInvocable: true, userInvocable: !ENGINE_CONTROLLED_SKILLS.has(skill) }`),
with `ENGINE_CONTROLLED_SKILLS` = only `{'novel-batch','novel-write'}` at [index.js:43](index.js#L43).
So `site-fanqie` and `novel-downloader` are registered **model-invocable AND user-invocable**
(the `/` menu) for every session that installs the plugin — including users who only want the
offline writing engine. Their descriptions at [index.js:65-66](index.js#L65-L66) call them
"Optional", but the registration does not enforce that.

**What ships (verified in `npm pack --dry-run`):** 110 files include the **entire** `site-fanqie`
bundle — 15 Python/JS CLI scripts, `api_client.py` (39,690 B), `fanqie_encrypt.js`, 6 reverse-
engineering reference docs, `vm_code.js`, `package.json` — plus `novel-downloader` (2 Python
crawlers) and `fanqie-rank.py` / `fanqie-download.py`. The workflow-audit itself classifies both
as **OPTIONAL (SEPARATE)** ([docs/workflow-audit.md:99-100](docs/workflow-audit.md#L99-L100)).

**Impact (concrete, not hypothetical):**
- `site-fanqie` scripts **send user-supplied cookies/msToken/a_bogus to `fanqienovel.com`** once
  the user fills a template ([api_client.py:64-79](assets/.dsh/skills/site-fanqie/scripts/api_client.py#L64),
  [SKILL.md:72-79](assets/.dsh/skills/site-fanqie/SKILL.md#L72)), and include **write operations**
  (`publish_chapter.py`, `manage_comments.py --delete`, `modify_book.py`, `attend.py`).
- `api_client.py:553,600,651` spawns a **Node subprocess** and `json.dumps(auth['cookie'])` into
  generated JS; `fanqie_encrypt.js:48` runs **`eval(vmCode)`** on a bundled 7,441-byte obfuscated
  VM blob (`references/vm_code.js`). That is third-party reverse-engineered code executed with
  the user's credential in scope — a real supply-chain surface.
- `novel-downloader` / `fanqie-download.py` fetch third-party novel sites; `fanqie_drama_rank.py:52`
  hardcodes a public `CELL_ID` (not a secret).
- All these Python clients **disable TLS verification**: `ssl.CERT_NONE` + `check_hostname=False`
  in `fanqie-rank.py:36-37`, `fanqie-download.py:20-21`, `api_client.py:97-98`,
  `fanqie_drama_rank.py:55-56`, `helpcenter_query.py:36-37`, `verify_domains.py:3-4`,
  `novel_crawler.py:38-39`. If any of them ever carries an auth cookie, a network MITM can steal
  it. (Ranked under F-3.)

**Why this is a finding, not a "manufactured problem":** the plugin's own docs and the workflow
audit say these are optional/separate, but a plain install exposes them in the user-facing `/`
menu and ships ~50 KB of reverse-engineered external-site code to every user. For a **public
market listing** this is the wrong default.

**Minimal fix (no runtime code rewrite needed):**
- **Option A (code, 1 line):** extend the default-off set at [index.js:43](index.js#L43):
  `new Set(['novel-batch','novel-write','site-fanqie','novel-downloader'])` and make those two
  `userInvocable: false` (keep `modelInvocable: false` too if they should be fully off), gated by
  a `Config` flag / separate bundle for users who opt in.
- **Option B (packaging):** split `assets/.dsh/skills/{site-fanqie,novel-downloader}` plus
  `assets/.dsh/scripts/fanqie-{rank,download}.py` into a separate opt-in bundle, so the core
  engine ships no external-site code at all.
- Minimum for a public listing: document the exposure prominently in README (the current
  "Privacy & security" section at README.md:99-106 does not mention `eval(vmCode)`, `CERT_NONE`,
  or subprocess-with-cookie) and obtain explicit user consent before first use.

### F-3 — MEDIUM (transport security): TLS verification disabled in every bundled HTTP client

**File:lines:**
- [fanqie-rank.py:36-37](assets/.dsh/scripts/fanqie-rank.py#L36) `CTX.check_hostname=False; CTX.verify_mode=ssl.CERT_NONE`
- [fanqie-download.py:20-21](assets/.dsh/scripts/fanqie-download.py#L20) (same)
- [site-fanqie/scripts/api_client.py:97-98](assets/.dsh/skills/site-fanqie/scripts/api_client.py#L97),
  `fanqie_drama_rank.py:55-56`, `helpcenter_query.py:36-37`, `verify_domains.py:3-4`,
  `novel-downloader/scripts/novel_crawler.py:38-39`

**Reproduction:** plain-text read of those lines; the exhaustive PowerShell sweep over the hidden
tree listed all 8 occurrences. Every `urllib.request.urlopen(..., context=CTX)` therefore accepts
any certificate.

**Impact:** conditional on the scripts being used with auth (see F-2). `fanqie-rank.py`'s
`build_cookie()` does attach `sessionid` / `msToken` / `device_id` when a user fills
`fanqie-auth.json.template` ([fanqie-rank.py:140-166](assets/.dsh/scripts/fanqie-rank.py#L140)),
and `api_client.py` sends a full `Cookie` header. On an untrusted network an MITM can present a
self-signed cert and harvest those credentials. Today the plugin ships **empty** credentials, so
the exposure is latent, not active.

**Minimal fix:** remove the two lines (use `ssl.create_default_context()`), or make verification
opt-out via an explicit config flag with a warning. If a site genuinely has a broken chain, pin
its CA instead of disabling verification globally.

### F-4 — LOW (FS robustness): `materialize()` follows an existing symlink/junction at `<project>/.dsh`

**File:line:** [index.js:88-106](index.js#L88) (`copyTree` → `mkdirSync(dest,{recursive:true})` → `cpSync(from,to)`),
called from [index.js:394](index.js#L394).

**Reproduction (concrete, temp dir, cleaned up):** created `<tmp>/outside/proof.txt`, made
`<tmp>/project/.dsh` a **NTFS junction** pointing at `<tmp>/outside`, then ran the exact
`fs.cpSync(from, to)` pattern from `materialize()`:
```
junction-created=True
cpSync OK; content at outside path: BUNDLED
```
i.e. the bundled file was written **through** `.dsh` into a directory outside the project root.

**Impact:** Requires a pre-existing symlink/junction at the project's `.dsh` path (attacker- or
user-created). The Host code does not create symlinks and does not resolve `projectRoot` against
untrusted input (`projectRootOf` uses the session's working directory, [index.js:108-116](index.js#L108)).
No path traversal via `project`/`rel` exists (see GOOD). This is defense-in-depth, not a remotely
triggerable vulnerability. Note `copyTree` also skips `.git`/`__pycache__` by name but never calls
`lstatSync`/`realpathSync`, so a symlinked *directory inside* `.dsh` is traversed as a directory.

**Minimal fix:** before `mkdirSync`, if `dest` exists and is a symlink, refuse or replace it:
```js
const st = statSync(dest, { throwIfNoEntry: false });
if (st && st.isSymbolicLink()) throw new Error('unsafe-dsh-symlink');
```
(or use `lstatSync` on each entry and skip `entry.isSymbolicLink()`), plus a final
`realpathSync(target).startsWith(realpathSync(projectRoot)+sep)` guard. Note this is **not**
covered by the existing `test/integration-materialize.test.mjs` symlink case if any — worth adding.

### F-5 — LOW (docs / secret-handling disclosure): `market/SUBMISSION_STEPS.md:11` states a GitHub token was used, and names its source path

**File:line:** [market/SUBMISSION_STEPS.md:11](market/SUBMISSION_STEPS.md#L11) — "用户授权使用了其
`.codebuddy/rules/MyRules.mdc` 中保存的 GitHub token，因此以下步骤已由本会话自动完成".

**Verification:** **no token VALUE is present** — the token-literal sweep
(`ghp_…|github_pat_…|gho_…|ghs_…|Bearer …|sk-…`) over all 144 files returned **0 hits**; the
referenced `D:\yousen\novel\.codebuddy\rules\MyRules.mdc` does **not exist** in this workspace and
is outside the plugin tree; `market/SUBMISSION_STEPS.md` is git-tracked (it would be pushed).

**Impact:** No leak. But it (a) tells any reader of the public repo that the author keeps a
long-lived GitHub token in a plaintext rules file, and (b) contradicts `publishing-research.md`
(`GITHUB_TOKEN`/`GH_TOKEN` empty, no `gh`) and `PR_STATE.md`, and (c) the "auto-completed via
REST API" claim is an operational detail that invites questions about token handling. This is a
**disclosure-hygiene / consistency** issue, not a credential exposure. `docs/`, `market/` secret
sweep for **values** = 0 hits (confirmed).

**Minimal fix:** rewrite the line to state the actions were completed with user authorization
without naming a token's storage location; e.g. "仓库创建/推送/PR 已在用户授权下完成" — and
reconcile with `publishing-research.md` (which says no token was available at research time).

### F-6 — INFO (docs accuracy, out of scope for code): `market/INSTALL.md:4` lists a `client.js` that does not exist

**File:line:** [market/INSTALL.md:4](market/INSTALL.md#L4) — "(`package.json` / `cordis.patch.yml` /
`index.js` / **`client.js`** / `assets/` 都在仓库根)". The `npm pack --dry-run` file list confirms
there is **no** `client.js` (Host-only bundle, as `PR_BODY.md` correctly states). Not a security
issue; flagging only because a wrong manifest claim can mislead a reviewer checking packaging.

### F-7 — INFO (functional correctness, adjacent): `gateForStage('batch','O')` points at `validate-outline.ps1`, which rejects `-Chapter`

**File:lines:** [lib/orchestrator.js:54](lib/orchestrator.js#L54) (`{ id:'O', gate:'.dsh/scripts/validate-outline.ps1' }`),
[lib/orchestrator.js:709-717](lib/orchestrator.js#L709) (`args = ['-NoProfile','-File',rel]` +
optional `-Chapter <int>`), vs.
[validate-outline.ps1:26-36](assets/.dsh/scripts/validate-outline.ps1#L26) whose parameter sets are
`-StartChapter/-EndChapter` or `-All` — **no `-Chapter`**.

**Reproduction:** `pwsh -NoProfile -File validate-outline.ps1 -Chapter 15` →
`A parameter cannot be found that matches parameter name 'Chapter'.` **EXIT=1**.
So the O gate fails closed (`script-exit-1` → FAIL → retries/pause) whenever a chapter is set;
when no chapter is set the script hits `Mandatory` parameters and prompts/hangs (mitigated by the
120 s timeout). This is a **correctness/availability** issue with a security-adjacent silver lining
(fails closed, never silent-passes), and it belongs to the orchestration reviewer, not to a fix
in this review. Recorded so the lead does not read "all gates verified" as "all gates functional".

---

## WHAT IS GOOD (verified, no action needed)

1. **Zero real credentials / business-ID values.** Exhaustive PowerShell sweep over all 144 files
   (including hidden `assets/.dsh/**`), plus `docs/` and `market/`: **0 hits** for
   `msToken/sessionid/session_id/sid_guard/a_bogus/passport_csrf_token/cookie/ttwid/verify_…/`
   private keys / `ghp_` / `sk-` with non-empty values. `node test/security.test.mjs` → 24/24 PASS.
   The only credential-shaped files are the **2 empty** `*.json.template` files
   ([fanqie-auth.json.template](assets/.dsh/scripts/fanqie-auth.json.template),
   [fanqienovel_auth.json.template](assets/.dsh/skills/site-fanqie/fanqienovel_auth.json.template)):
   every credential key is `""`, each carries a "SANITIZED TEMPLATE / NO REAL CREDENTIALS" note,
   and the real filenames are git-ignored (`.gitignore:8-11`). **Safe.**
2. **`npm pack --dry-run` ships no forbidden artifacts.** 110 files; no `fanqie-auth.json`,
   `fanqienovel_auth.json`, `publish_result.json`, `package-lock.json`, `.pyc`, `__pycache__`,
   `node_modules`, `main.e63907e3.js`, `writer_backend_api_report.json`, `.tgz`, or `.log`.
   The root-level runtime checkpoint `.dsh/state/novel-mode.checkpoint.json` (which contains a
   500-char `goal` of `x` and the project path) is **NOT packed** — `files` has no `.dsh/`
   entry and `.gitignore:7` ignores it. `assets/make-tarball.py:16-28` likewise excludes root
   `.dsh/`, the three credential filenames, and lockfiles. **Safe.**
3. **`files` / `exports` cover every runtime file.** Verified in the pack list: `index.js`,
   `lib/orchestrator.js`, `cordis.patch.yml`, `icon.svg`, `locale/{en,zh}.json`,
   and all **93** `assets/.dsh/**` files (21 SKILL.md, ≥18 .ps1, 2 .py, 8 templates, 2 .mdc,
   9 agent defs, config.yaml, charset.json, AGENTS.md). `exports` maps `.`, `./package.json`,
   `./locale/*.json`, `./icon`, `./assets/*`; `lib/` is reached through the `.` import
   (`import * as engine from './lib/orchestrator.js'`) and is correctly included by `lib/**`.
   README/README.zh/LICENSE/CHANGELOG/screenshots.json are also included. **Complete.**
   (Note: `dsh.bundle.patch` is declared but there is **no `dsh.client`** — this is a Host-only
   bundle, consistent with `PR_BODY.md`.)
4. **Script invocations are safe.** [lib/orchestrator.js:709-717](lib/orchestrator.js#L709):
   `pwsh -NoProfile -File <rel> [-Chapter <int>]`; `-Command`/`-c` appears **only in
   documentation forbidding it** (AGENTS.md, rules, SKILL.md, README). No concatenated user
   input: args are built from typed data, `normalizeChapter()` at
   [lib/orchestrator.js:156-165](lib/orchestrator.js#L156) rejects floats/NaN/negatives/`>99999`/
   non-digit strings/`..`, and `validateDispatch()` allowlists fields. `spawnSync` has
   `timeout: 120000`, `encoding:'utf8'`, `windowsHide:true`, `cwd: project`. Raw stderr/exit
   codes are classified into `script-exit-N` and never returned
   ([lib/orchestrator.js:719-726](lib/orchestrator.js#L719)). **Good.**
5. **`materialize()` never overwrites existing user files.** [index.js:100-101](index.js#L100):
   `else if (existsSync(to)) kept+=1; else cpSync(...)`. Verified by
   `test/integration-materialize.test.mjs:210-218` (pre-existing `config.yaml` preserved
   verbatim) and idempotency checks at :191-204. Target is always
   `join(projectRoot, '.dsh')` ([index.js:90](index.js#L90)) — no absolute/traversal write from
   `project` or `rel` (see below). **Good** (symlink caveat = F-4).
6. **No path traversal via `project` / `rel`.** `artifactPath()`
   [lib/orchestrator.js:168-173](lib/orchestrator.js#L168) rejects `..`, leading `/`, and
   `\ : * ? " < > |`; `test/security.test.mjs:228-233` enumerates 10 bad inputs. All engine
   writes go to fixed `${project}/.dsh/state/...` constants
   ([lib/orchestrator.js:134-136,224-225,263-267](lib/orchestrator.js#L134)); `checkpointPath`
   is never caller-controlled. `dispatchArgs()`/`validateDispatch()`
   [lib/orchestrator.js:343-369](lib/orchestrator.js#L343) reject path-like/prose values, and
   `truthResolver` only **reads** via `artifactPath` + `io.exists`. `projectRootOf` comes from
   the session's working directory, not from tool args. **Good.**
7. **Host code has no network / no dependencies / no install scripts.** `test/security.test.mjs:178-200`
   passes: zero `fetch`/`XMLHttpRequest`/`WebSocket`/`http.request`/`curl` in `index.js` or
   `lib/orchestrator.js`, only `node:` core imports, and `package.json` declares no
   `dependencies`/`devDependencies`/`peerDependencies`/`optionalDependencies`/`scripts`.
   No `prepare`/`postinstall` arbitrary code on install. **Good.**
8. **Failures never leak internals.** `execute()` wraps everything in `try/catch` → generic
   localized status + classified `code` ([index.js:264-379](index.js#L264)); `publicState`/
   `publicGate`/`publicPlan` strip paths, stderr, failures arrays
   ([index.js:146-181](index.js#L146)); gate-pass requires a real script PASS
   ([index.js:312-327](index.js#L312)). **Good.**
9. **No secrets in `docs/` or `market/`.** Credential-VALUE sweep = 0 hits. `docs/workflow-audit.md:198`
   and `docs/PM-PRD.md:173` discuss credential **names/sizes only** (values redacted —
   "数值已从公开文档中略去"). `market/*.yml`/`*.json`/`*.md` contain only URLs, descriptions,
   a pinned commit SHA, a Release tarball URL, and PR status — no tokens. **Good.**
10. **`.gitignore` does protect the real credential filenames** (lines 8-11) and the runtime
    checkpoint (line 7), and `test/security.test.mjs:154-159` asserts this. **Good** — the
    problem is only that line 7 is too broad (F-1).

---

## WHAT I COULD NOT VERIFY

- **Live Harness behavior.** No `plugin_manager install_bundle`, no connected Web GUI, no
  `agent/created` / `agent-preset/selected` event exercised in this review. I verified static
  code, the test suite, `npm pack --dry-run`, git behavior, and a Node-level `cpSync` probe —
  not an actual installed run. (The lead's `docs/LIVE-VERIFICATION.md` / `TEST-EVIDENCE.md`
  cover that separately; I did not re-run it.)
- **The GitHub Release tarball / remote repo contents.** `market/PR_STATE.md` claims a published
  `dsh-novel-mode.tgz` (v2.0.0/v2.0.1) and PR #13689; I did not fetch it. My pack verdict is for
  the **local** `npm pack --dry-run` output. If the Release tarball was produced by
  `assets/make-tarball.py` from a different working tree, it should be re-swept (its `wanted()`
  filter looks correct, but I did not run it against the published artifact). Also note
  `make-tarball.py:11` writes to `D:\yousen\dsh-novel-mode.tgz` (parent of the plugin dir) —
  outside the workspace, worth confirming that is intended for the release pipeline.
- **Whether the public repo's `.gitignore` has already been fixed.** My F-1 check is against the
  **local** checkout. If the pushed repo has a corrected rule, F-1 is moot there; the local file
  still needs the fix.
- **Full 1,000-line `api_client.py` / all 15 site-fanqie scripts.** I read the auth, request,
  subprocess and TLS-relevant portions plus `SKILL.md`; I did not audit every endpoint for e.g.
  silent telemetry. The `eval(vmCode)` + `CERT_NONE` + cookie-in-subprocess findings are from
  the code I did read.
- **`pwsh` gate end-to-end for all 15 BATCH substeps.** I runtime-verified one mismatch (F-7)
  and read the gate wiring; I did not execute the whole workflow. The unit suite
  (`test/unit-orchestrator.test.mjs`) asserts `-File`/`-Chapter` shape statically.
- **Whether `site-fanqie`/`novel-downloader` are ever *auto*-invoked by the engine.** They are
  registered `userInvocable:true` (F-2) but I found no `STAGE_GRAPH` entry dispatching them;
  `dispatchFor()` maps only `agent-*` roles. So the exposure is via the `/` menu / model choice,
  not the deterministic engine.
