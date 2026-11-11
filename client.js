/**
 * 小说工作台 (Novel Workbench) — Web Client half.
 *
 * Registers one `main` keyed panel and one `sidebar.panellist` row. The panel
 * is the plugin's sole user surface: it binds a novel-project directory, shows
 * the deterministic engine's state, and drives the SAME Host `drive()` used by
 * the `novel_orchestrate` agent tool, through the `/novel/api` Host route.
 *
 * Plain React from the browser module table; no framework package imports.
 * Theme tokens are inherited; all copy goes through the locale dictionary.
 */
window.__ModuleLoader__.load({
  id: '@yousen/dsh-novel-mode',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    const NS = 'novel-mode';
    const PANEL_ID = 'novel';
    const DICT = {
      zh: {
        nav: '小说', title: '小说工作台',
        subtitle: '确定性写作引擎 · 一个工作区，一次写作',
        project: '小说项目目录', projectPlaceholder: 'D:\\novels\\my-book',
        goal: '写作目标', goalPlaceholder: '写一本都市悬疑',
        bind: '绑定工作区', refresh: '刷新状态', newRun: '新建流程',
        start: '开始', choose: '选择开始方式',
        branchConstitution: '从零搭建', branchDisassemble: '拆书换皮', branchImport: '导入已有书稿',
        resume: '继续', retry: '重试', stepDone: '完成本步', gatePass: '校验通过',
        dispatch: '派发工人', verify: '提交评审', skip: '跳过', reset: '重置',
        stage: '阶段', chapter: '章节', step: '步骤', status: '状态',
        next: '下一步', action: '动作', options: '可选开始方式',
        idle: '尚未开始', noProject: '请先绑定一个小说项目目录',
        loading: '读取中…', error: '暂不可用，请稍候重试',
        gateResult: '门禁', dispatchRole: '工人角色',
        empty: '暂无状态', pwdHint: '脚本需要 PowerShell 7 (pwsh) 与 Python 3.7+',
      },
      en: {
        nav: 'Novel', title: 'Novel Workbench',
        subtitle: 'Deterministic writing engine · one workspace, one book',
        project: 'Novel project directory', projectPlaceholder: 'D:\\novels\\my-book',
        goal: 'Writing goal', goalPlaceholder: 'An urban mystery novel',
        bind: 'Bind workspace', refresh: 'Refresh', newRun: 'New run',
        start: 'Start', choose: 'Choose how to start',
        branchConstitution: 'Build from scratch', branchDisassemble: 'Disassemble & reskin', branchImport: 'Import manuscript',
        resume: 'Resume', retry: 'Retry', stepDone: 'Finish step', gatePass: 'Gate passed',
        dispatch: 'Dispatch', verify: 'Verify', skip: 'Skip', reset: 'Reset',
        stage: 'Stage', chapter: 'Chapter', step: 'Step', status: 'Status',
        next: 'Next', action: 'Action', options: 'Start options',
        idle: 'Not started', noProject: 'Bind a novel project directory first',
        loading: 'Loading…', error: 'Temporarily unavailable, try again',
        gateResult: 'Gate', dispatchRole: 'Worker role',
        empty: 'No state', pwdHint: 'Requires PowerShell 7 (pwsh) and Python 3.7+',
      },
    };
    const STAGE_ZH = {
      bootstrap: '准备开始', constitution: '建立设定', disassemble: '拆书重构', import: '导入书稿',
      outline: '扩展大纲', design: '章节设计', write: '撰写正文', validate: '一致性校验',
      batch: '批量写作', export: '导出上下文', done: '已完成',
    };

    /** POST the same action payload the agent tool accepts to the Host route. */
    async function call(project, args) {
      const url = new URL('novel/api', document.baseURI).toString();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project, args }),
      });
      if (!res.ok) throw new Error('http');
      return res.json();
    }

    function Field(props) {
      return h('label', { style: S.field },
        h('span', { style: S.fieldLabel }, props.label),
        h('input', {
          style: S.input, value: props.value, placeholder: props.placeholder,
          onChange: (e) => props.onChange(e.target.value),
        }));
    }

    function Btn(props) {
      return h('button', {
        style: { ...S.btn, ...(props.primary ? S.btnPrimary : {}), ...(props.disabled ? S.btnDisabled : {}) },
        disabled: !!props.disabled, onClick: props.onClick, type: 'button',
      }, props.label);
    }

    const S = {
      root: { display: 'flex', flexDirection: 'column', height: '100%', gap: 16, padding: 24,
        color: 'var(--dsw-alias-text-primary, inherit)', fontFamily: 'inherit', overflow: 'auto' },
      h1: { fontSize: 22, fontWeight: 600, margin: 0 },
      sub: { fontSize: 13, opacity: 0.7, marginTop: 4 },
      card: { border: '1px solid var(--dsw-alias-border, rgba(127,127,127,.3))', borderRadius: 12,
        padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
      row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' },
      field: { display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 240px' },
      fieldLabel: { fontSize: 12, opacity: 0.75 },
      input: { padding: '8px 10px', borderRadius: 8, fontSize: 13,
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,.35))',
        background: 'var(--dsw-alias-surface, transparent)', color: 'inherit' },
      btn: { padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,.35))',
        background: 'var(--dsw-alias-surface, transparent)', color: 'inherit' },
      btnPrimary: { background: 'var(--dsw-alias-accent, #247bbf)', color: '#fff', borderColor: 'transparent' },
      btnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 },
      kv: { fontSize: 13 }, kvLabel: { opacity: 0.65, marginRight: 6 }, kvVal: { fontWeight: 600 },
      status: { fontSize: 14, fontWeight: 600, padding: '8px 12px', borderRadius: 8,
        background: 'var(--dsw-alias-surface-2, rgba(127,127,127,.08))' },
      actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
      note: { fontSize: 12, opacity: 0.6 },
      code: { fontFamily: 'monospace', fontSize: 12, opacity: 0.8 },
    };

    function Panel(props) {
      const t = props.t;
      const [project, setProject] = useState('');
      const [bound, setBound] = useState(false);
      const [goal, setGoal] = useState('');
      const [result, setResult] = useState(null);
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');

      const run = useCallback(async (args) => {
        if (!bound) { setErr(t.noProject); return; }
        setBusy(true); setErr('');
        try { const r = await call(project, { ...args, locale: props.locale }); setResult(r); }
        catch { setErr(t.error); }
        finally { setBusy(false); }
      }, [bound, project, props.locale, t]);

      useEffect(() => { if (bound) run({ action: 'status' }); }, [bound]); // eslint-disable-line

      const st = result?.state ?? {};
      const stage = result?.stage ?? st.stage ?? 'bootstrap';
      const branch = st.branch;
      const next = result?.next ?? st.next ?? {};
      const options = Array.isArray(next.options) ? next.options : [];
      const isBootstrap = stage === 'bootstrap';

      const actionBtn = (label, args, primary) =>
        h(Btn, { label, primary, disabled: busy || !bound, onClick: () => run(args) });

      return h('div', { style: S.root },
        h('div', null,
          h('h1', { style: S.h1 }, t.title),
          h('div', { style: S.sub }, t.subtitle)),

        h('div', { style: S.card },
          h('div', { style: S.row },
            h(Field, { label: t.project, value: project, placeholder: t.projectPlaceholder, onChange: setProject }),
            h(Field, { label: t.goal, value: goal, placeholder: t.goalPlaceholder, onChange: setGoal }),
            h(Btn, { label: t.bind, primary: true, disabled: project.trim().length < 2,
              onClick: () => { setBound(true); setErr(''); } })),
          h('div', { style: S.note }, t.pwdHint)),

        err ? h('div', { style: { ...S.status, color: 'crimson' } }, err) : null,

        h('div', { style: S.card },
          h('div', { style: S.actions },
            actionBtn(t.refresh, { action: 'status' }),
            actionBtn(t.newRun, { action: 'start', goal: goal || undefined }, true),
            actionBtn(t.resume, { action: 'resume' }),
            actionBtn(t.retry, { action: 'retry' }),
            actionBtn(t.reset, { action: 'reset', goal: goal || undefined })),
          h('div', { style: S.grid },
            h('div', { style: S.kv }, h('span', { style: S.kvLabel }, t.stage + ':'),
              h('span', { style: S.kvVal }, STAGE_ZH[stage] || stage)),
            st.chapter ? h('div', { style: S.kv }, h('span', { style: S.kvLabel }, t.chapter + ':'),
              h('span', { style: S.kvVal }, String(st.chapter) + (st.totalChapters ? ' / ' + st.totalChapters : ''))) : null,
            st.batchStep ? h('div', { style: S.kv }, h('span', { style: S.kvLabel }, t.step + ':'),
              h('span', { style: S.kvVal }, String(st.batchStep))) : null,
            st.status ? h('div', { style: S.kv }, h('span', { style: S.kvLabel }, 'status:'),
              h('span', { style: S.kvVal }, String(st.status))) : null),
          h('div', { style: S.status }, result?.status || (busy ? t.loading : t.idle)),
          result?.code ? h('div', { style: S.code }, 'code: ' + result.code) : null,
          result?.gate ? h('div', { style: S.note }, t.gateResult + ': ' + (result.gate.status || '') +
            (result.gate.ok ? ' ✓' : '')) : null,
          result?.dispatch ? h('div', { style: S.note }, t.dispatchRole + ': ' +
            (result.dispatch.role || '—')) : null),

        h('div', { style: S.card },
          h('div', { style: S.fieldLabel }, t.next + ': ' + (next.action || next.stage || '—')),
          options.length
            ? h('div', { style: S.actions },
                h('span', { style: S.note }, t.options + ':'),
                ...options.map((o) => {
                  const label = o === 'constitution' ? t.branchConstitution
                    : o === 'disassemble' ? t.branchDisassemble
                    : o === 'import' ? t.branchImport : String(o);
                  return actionBtn(label, { action: 'select-branch', branch: o }, isBootstrap);
                }))
            : null,
          h('div', { style: S.actions },
            actionBtn(t.start, { action: 'start', goal: goal || undefined }),
            actionBtn(t.stepDone, { action: 'step-done' }),
            actionBtn(t.gatePass, { action: 'gate-pass' }),
            actionBtn(t.dispatch, { action: 'dispatch' }),
            actionBtn(t.verify, { action: 'verify', verdicts: [] }),
            actionBtn(t.skip, { action: 'skip' })),
          branch ? h('div', { style: S.note }, t.choose + ': ' + branch) : null),
      );
    }

    function Icon(owner) {
      const size = owner?.size ?? 18;
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block' }, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 },
        h('path', { d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5z' }),
        h('path', { d: 'M8 7h7M8 11h7M8 15h4' }));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = (ctx.locale && typeof ctx.locale.getLocale === 'function')
          ? ctx.locale.getLocale() : 'zh';
        const t = (key) => (DICT[locale] || DICT.zh)[key] || DICT.zh[key] || key;

        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({
            name: 'main', key: PANEL_ID, locale: NS,
            inject: () => ({ t, locale }),
          }, () => h(Panel, { t, locale }));
        });
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 5,
          label: () => t('nav'), locale: NS,
        }, Icon));
      },
    };
  },
});
