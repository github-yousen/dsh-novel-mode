/**
 * 小说模式 (Novel Mode) — Client half.
 *
 * Adds one button below the composer. Clicking it executes the Host's `/novel`
 * command through the same Client-callable Remote the built-in command menu
 * uses (`remote.commands.execute`), so the UI button and the `/novel` slash
 * command share one Host operation.
 *
 * Plain-JS `dsh.client` bundle: React comes from the host module table, all
 * styling is a component-local <style> element (removed on unmount), and no
 * other plugin's modules are imported.
 *
 * Service access rule: `ctx` is a restricted Cordis proxy. Every service is
 * resolved once inside `apply()` with `ctx.get(name)` (after declaring it in
 * `inject`), and only plain closures/values are handed to the React component.
 * The component never touches `ctx` or a service proxy itself — reading
 * `remote.commands` from a captured proxy at click time is what produces
 * "cannot get property \"remote.commands\" without inject".
 */

window.__ModuleLoader__.load({
  id: '@yousen/dsh-novel-mode',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const CSS = `
.nm-wrap { display: inline-flex; align-items: center; gap: 8px; }
.nm-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; line-height: 1.4;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
.nm-btn:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
}
.nm-btn:disabled { opacity: .55; cursor: default; }
.nm-btn.nm-active { border-color: var(--dsw-alias-brand-primary); }
.nm-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary);
}
.nm-active .nm-dot { background: var(--dsw-alias-brand-primary); }
.nm-err { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
`;

    /** A small book glyph, drawn inline so no external artwork is required. */
    function BookIcon() {
      return h('svg', {
        width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      },
        h('path', { d: 'M2.5 2.5h4.2c1 0 1.8.8 1.8 1.8v9c0-1-.8-1.8-1.8-1.8H2.5z' }),
        h('path', { d: 'M13.5 2.5H9.3c-1 0-1.8.8-1.8 1.8v9c0-1 .8-1.8 1.8-1.8h4.2z' }),
      );
    }

    function NovelModeButton(props) {
      const sessionId = props.sessionId;
      const t = props.t;
      const onEnter = props.onEnter;   // plain closure, resolved in apply()
      const [busy, setBusy] = React.useState(false);
      const [active, setActive] = React.useState(false);
      const [error, setError] = React.useState('');

      const onClick = async () => {
        if (busy || !sessionId) return;
        setBusy(true);
        setError('');
        try {
          const result = await onEnter(sessionId);
          if (!result || !result.ok) {
            setError(String((result && result.error && result.error.message) || t('errorGeneric')));
          } else if (result.value && result.value.result && result.value.result.kind === 'error') {
            setError(String(result.value.result.text || t('errorGeneric')));
          } else {
            setActive(true);
          }
        } catch (cause) {
          setError(String(cause && cause.message ? cause.message : cause));
        } finally {
          setBusy(false);
        }
      };

      const label = busy ? t('starting') : (active ? t('started') : t('label'));

      return h('div', { className: 'nm-wrap' },
        h('style', null, CSS),
        h('button', {
          type: 'button',
          className: `nm-btn${active ? ' nm-active' : ''}`,
          disabled: busy || !sessionId,
          onClick,
          title: t('tooltip'),
          'aria-label': t('label'),
        },
          h('span', { className: 'nm-dot' }),
          h(BookIcon, null),
          h('span', null, label),
        ),
        error ? h('span', { className: 'nm-err', role: 'alert' }, error) : null,
      );
    }

    return {
      // Cordis resolves `ctx.remote.commands` through the nested service key
      // `remote.commands`: both `remote` and `remote.commands` must be declared,
      // or the context proxy throws `cannot get property "remote.commands"
      // without inject`. This matches the shipped `dsh-client-ui-commands`
      // declaration (['...','remote','remote.commands','locale']).
      inject: ['slots', 'remote', 'remote.commands', 'locale'],
      apply(ctx) {
        // Resolve every service eagerly, inside the injected context. No proxy
        // reference escapes into the React tree.
        const get = (name) => (typeof ctx.get === 'function' ? ctx.get(name) : undefined);
        const slots = get('slots');
        const remoteCommands = get('remote.commands');
        const locale = get('locale');

        /** Plain closure: the only thing the button ever calls. */
        const onEnter = async (sessionId) => {
          if (!remoteCommands || typeof remoteCommands.execute !== 'function') {
            throw new Error('Remote command service unavailable');
          }
          return remoteCommands.execute(sessionId, '/novel ', []);
        };

        /** Locale-owned copy with a safe English/Chinese fallback. */
        let t = (key) => ({
          label: '小说模式', starting: '启动中…', started: '小说模式 · 已启动',
          tooltip: '进入小说模式：一键启动完整小说写作工作流',
          errorGeneric: '小说模式启动失败',
        }[key] ?? key);
        try {
          if (locale && typeof locale.register === 'function') {
            ctx.effect(() => locale.register('novel-mode', {
              zh: {
                label: '小说模式', starting: '启动中…', started: '小说模式 · 已启动',
                tooltip: '进入小说模式：一键启动完整小说写作工作流',
                errorGeneric: '小说模式启动失败',
              },
              en: {
                label: 'Novel mode', starting: 'Starting…', started: 'Novel mode · running',
                tooltip: 'Enter Novel mode: run the complete novel-writing workflow',
                errorGeneric: 'Novel mode failed to start',
              },
            }), 'novel-mode: dictionaries');
            const bound = typeof locale.bind === 'function' ? locale.bind('novel-mode') : undefined;
            if (bound) t = (key) => bound(key);
          }
        } catch (cause) {
          if (console && console.error) console.error('novel-mode locale:', cause);
        }

        if (!slots || typeof slots.inject !== 'function') return () => {};
        return slots.inject('conversation.composer.dock', () => slots.register(
          {
            name: 'conversation.composer.dock',
            id: 'novel-mode',
            order: 90,
            label: () => t('label'),
          },
          function NovelModeSlot(slotProps) {
            return h(NovelModeButton, {
              sessionId: slotProps && slotProps.sessionId,
              onEnter,
              t,
            });
          },
        ));
      },
    };
  },
});
