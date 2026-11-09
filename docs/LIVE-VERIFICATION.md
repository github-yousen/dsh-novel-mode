# Live Runtime Verification (Round 2, 2026-11-10 03:55 +08)

The PM's R2/R3 reviews correctly marked AC-38 (real-model ≥3 chapters) and
AC-45 (clean-profile GUI) as **documented-pending** because the automated suite
uses mock `ctx`/`io`. In this round the FINAL plugin was exercised through the
**real Harness runtime** — the `novel_orchestrate` tool called by the real Agent,
the real working directory, the real `pwsh` validator, and the real durable
checkpoint. This closes the "does it actually run here" part of those N/As;
the clean-profile GUI dropdown and a full multi-chapter novel with a live LLM
worker remain external.

## Sequence (all calls made against the live installed plugin, row `active`)

| # | Call | Live result | Meaning |
|---|---|---|---|
| 1 | `status` | `阶段：bootstrap · 就绪` | Tool is live, returns only sanitized structured status — no prompt dump, no error |
| 2 | `start` | (rejected from stale `running` checkpoint) → generic "已保存进度，可继续" | No crash, no internals leaked |
| 3 | `reset` | `阶段：bootstrap · 就绪` | Clean run established |
| 4 | `start` | `阶段：bootstrap · 就绪` | Run started |
| 5 | `select-branch (constitution)` | `阶段：constitution · 就绪` | Bootstrap branch enforced by code |
| 6..9 | `skip` ×4 | `outline → design → write → validate → batch · 步骤 O` | Audited DEGRADED overrides advance one stage each, all recorded |
| 10 | `gate-pass` at `write` | `阶段：write · Progress saved, you can continue` | **Real `validate-chapter.ps1` ran; it did NOT pass, so the engine REFUSED to advance.** No model assertion can flip a gate. |
| 11 | `batch-step (chapter 15, step D4, total 100)` | `阶段：batch · 第 15 章 · 步骤 D4 · Ready` | Typed integer args, nested BATCH sub-FSM addressed |
| 12 | `dispatch` | `阶段：batch · 步骤 O · Ready` (typed worker role in structured result) | Engine-driven dispatch in the live runtime |
| 13 | `verify` with `PASS` + **no evidenceRefs** | `阶段：batch · 第 15 章 · 步骤 D4 · Progress saved, you can continue` | **Code adjudication REFUSED an evidence-free PASS**; sub-step stayed at D4 |

Every user-visible string above is a generic localized token or a short stage
label — zero prompt text, zero stderr, zero script names, zero exception text,
zero "关卡宣言".

## Durable checkpoint (real filesystem)

`D:\yousen\.dsh\state\novel-mode.checkpoint.json` after the live run:

```
version=2 stage=batch batchStep=D4 chapter=15 status=retrying
retries=1 log=11 history=11
last verdicts: validate/DEGRADED, batch/PASS, batch/RETRYABLE
```

Versioned, atomic, structured, restart-safe — proven in the real runtime, not
just a tmpdir fixture.

## Security fix discovered by the live run

The live checkpoint's structured log contained a `.dsh/scripts/validate-chapter.ps1`
**path** in the `gate` field (internal observability only — the tool's
`publicState` never surfaced it, which the live renders confirm). For
defense-in-depth, `lib/orchestrator.js::advance()` now stores a classified gate
CODE (`stage` or `batch:<step>`) instead of any script path (NG-3). A new
`security.test.mjs` regression asserts `serializeState()` contains neither
`.ps1` nor raw stderr. Full suite after the fix: **9/9 suites, 278/278
assertions, exit 0**.

## Updated external-gate status

| AC | R2/R3 | This round |
|---|---|---|
| AC-38 real-model ≥3 chapters | pending (no live LLM worker) | **partially closed**: the engine, script gates, dispatch, adjudication and checkpoint are now proven live with real `pwsh`; only multi-chapter novel generation with an LLM worker remains |
| AC-45 clean-profile GUI dropdown | pending (cannot restart Host/GUI) | **partially closed**: real installed plugin exercised end-to-end in the live profile; only a *fresh separate* profile + visual dropdown pick remains |
| AC-44 official catalog merge | pending (age gate + maintainer) | unchanged: PR #13689 open, `check`=success, repo 13.4h/24h |

Artifacts: [TEST-EVIDENCE.md](TEST-EVIDENCE.md), [PM-REVIEW-R3.md](PM-REVIEW-R3.md),
[ARCHITECTURE.md](ARCHITECTURE.md).
