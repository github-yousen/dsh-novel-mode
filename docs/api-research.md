# 小说模式 (Novel Mode) plugin — API research

Task-2 findings. Author: api-researcher. Sources: `cordis_inspect_query` (Host catalog + full spill),
the `cordis-plugin-development` skill references/templates read directly out of `app.asar`, installed
package READMEs, three working workspace plugins, the installed `dshmarket` package, `plugin_market`,
and public market/contribution docs.

> **Read this first — one harness quirk.** In this Desktop build, `cordis_inspect_query` **rejects any
> explicit `input` argument** (`"input" must be an object`), even a valid object or a JSON string.
> Omit `input` entirely to get the whole catalog. The catalog output is large and spills to a temp
> file: `C:\Users\altria\AppData\Local\Temp\dsh-spill-D98EuI\session-5c989c6e00be\ba188582957d-cordis_inspect_query.txt`
> (read it with `read`/`grep`). Host `listService`/`listEvents` catalogs worked; **all Client
> `cordis_inspect_query` calls timed out after 10 s** ("Open or reconnect the Harness page"), because
> this subagent has no connected page. Client slot/builtin facts below therefore come from the
> shipped skill references, the installed `dshmarket` client bundle, and the DSH package READMEs,
> not from a live `Slots.listSubTree` / `Builtin.listBuiltins` answer. The plugin builder should
> re-run those Client queries from a Lead/connected-page session before coding.

---

## 1. Exact Host Service contracts

All signatures below are verbatim from the live Host `Service.listService` catalog (spill file).
Host Service keys are reached as `ctx.<key>` (e.g. `ctx.skills`, `ctx.commands`), or defensively as
`ctx.get('skills')`. String entries in a plugin's `inject` array resolve them immediately and keep
the plugin inactive instead of throwing when a composition lacks them.

### 1.1 `skills` — runtime skill registry (`@deepseek-ai/dsh-skill`)

```
registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void
register(skill: SkillRegistration): () => void
async list(options: SkillViewOptions = {}): Promise<SkillSummary[]>
async snapshot(options: SkillViewOptions = {}): Promise<SkillCatalogSnapshot>
async get(name: string, options: SkillViewOptions = {}): Promise<SkillDefinition | undefined>
```

`ctx.skills.register()` is the sanctioned "embedded/runtime skill" path. The registry fills in a
default invocation policy and the reserved `runtime` provider label. Same-name runtime
registrations in one layer are first-wins with a warning; `runtime` is a reserved provider name.
Reads are layered host + per-scope; a nearer layer shadows a farther one. Invalidation is
provider-driven (no TTL); a runtime registration or disposal emits the unfiltered `skills/change`
event. See §6 for events.

**Verified `SkillRegistration`/`SkillDefinition` fields** — taken from two working workspace
plugins ([dsh-web-research](../../../packages/dsh-web-research/index.js) and
[dsh-delegation-advisor](../../../packages/dsh-delegation-advisor/index.js)) that are installed in
this profile and register runtime skills exactly this way:

```js
ctx.skills.register({
  name: 'web-searcher',                       // exact kebab-case name
  description: '...',                         // one-line discovery description
  content: readFileSync(skillMdPath, 'utf8').trimEnd(), // full SKILL.md body
  source: 'runtime',
  whenToUse: '...',                            // routing hint shown in catalogs
  invocation: {                               // optional; registry fills a default
    modelInvocable: true,                     // model-facing skill tool/catalog
    userInvocable: true,                      // human-facing slash commands
  },
  resourceBase: {                            // where the skill's scripts/templates live
    kind: 'directory',
    path: join(here, 'skills', 'web-searcher'), // absolute path inside the bundle
  },
})
```

`resourceBase.kind: 'directory'` with an absolute `path` is the key that lets a skill body reference
bundled scripts/resources by relative path. Invocation policy matrix (from the dsh-skill README):
`{modelInvocable:true,userInvocable:true}` both surfaces; either false excludes that surface;
both false excluded everywhere. Put `dsh.bundle.patch` config values (`modelInvocable`,
`userInvocable`, `sectionOrder`) in the row's `config` and read them from `apply(ctx, config)`.

Both example plugins declare `export const inject = ['skills', 'systemPrompt'];` and register
everything inside `apply(ctx, config)` (registrations are context-owned effects and unwind on
unload). For 小说模式, ship the 21 skills as `skills/<name>/SKILL.md` (+ their scripts/templates)
inside the bundle and register each with this call from one Host half.

### 1.2 `systemPrompt` — prompt section registry (`@deepseek-ai/dsh-system-prompt`)

```
section(section: PromptSection): () => void
getSectionOrder(name: PromptSectionOrderName): number
getContextOrder(name: PromptContextOrderName): number
context(context: PromptContext): () => void
suppressRuntimeContext(): () => void
tools(provider: (context: AssembleContext) => ToolProviderResult): () => void
variable(name: string, provider: (context: AssembleContext) => string | undefined): () => void
refreshContext(assembly: PromptAssembly, context: AssembleContext = {}): PromptAssembly
async assemble(context: AssembleContext = {}): Promise<PromptAssembly>
```

`PromptSection` fields (verified in the system-prompt README and both example plugins):
`{ name, order, text }`, plus optional `interpolate: false` (preserve literal `{{…}}`) and
`complete: true` (this section becomes the entire prompt; >1 effective complete section fails
assembly), and optional `text` as a function of the assembly context. Sections concatenate in
ascending `order`; equal orders use code-unit name order. Text interpolates `{{variable}}` by
default. First-party orders: harness identity `-1000`, persona prefix `0`, tool docs around
`100`–`2000`, web surface `10100`, persona suffix `10200`. External plugins may use any finite
order; the two workspace examples picked `1950` and `2750` to sit just before built-in tool
sections. Scoped sections (registered on `agent.ctx`) shadow a same-named global for one agent.

```js
ctx.systemPrompt.section({
  name: 'web:research',
  order: 1950,
  text: 'When a request needs the open web, choose the mechanism deliberately: ...',
})
```

For 小说模式 the section should carry only the short routing rule ("when a novel-writing request
arrives, load the `novel-mode` skill"), keeping the 21 skill bodies out of every step's prompt.

### 1.3 `commands` — human slash-command registry (`@deepseek-ai/dsh-commands`)

```
register(definition: CommandDefinition): () => void
registerFileReceiptResolver(resolver: CommandFileReceiptResolver): () => void
@Remote list(agent: Agent): readonly CommandDescriptor[]
find(agent: Agent, name: string): CommandDefinition | undefined
@Remote async execute(agent: Agent, line: string,
  submittedAttachments: readonly CommandSubmitAttachment[],
  signal: AbortSignal): Promise<CommandExecution | undefined>
```

`CommandDefinition` (verified in the dsh-commands README + `lib/index.js`):
`{ name, description, input?: { hint, attachments? }, definitionId?, recordInput?, handler }`.
`name` is lowercase letters/digits/`_`/`-`; the command line is `/name [rawInput]`; everything
after the name (including separator whitespace) is `rawInput` and the command owns its grammar.
`handler: ({ agent, rawInput, ...invocation }) => CommandResult` where a result is
`{ kind: 'success'|'error', text?, ... }` (optional UI text). `recordInput` defaults to `true`;
set false when an authoritative domain event already carries the payload. A stable plugin-namespaced
`definitionId` (built with the package's `CommandDefinitionId` brand) gives first-party adapters a
stable identity independent of display copy. `input.attachments` opts into composer images/files,
which reach the handler as a frozen `invocation.attachments` array. Registering the same name twice
in one scope throws. Registrations are global unless the plugin is mounted under `agent.ctx` and
declares its `commands` injection (agent-scoped shadowing).

```js
ctx.commands.register({
  name: 'novel',
  description: 'Enter Novel Mode and start the novel-writing workflow',
  input: { hint: '<brief>' },
  handler: ({ agent, rawInput }) => {
    // Runs directly against the agent; no model message is created by the registry.
    return { kind: 'success', text: '小说模式已启动' }
  },
})
```

`execute()` mints a `commandId`, appends `command/run` before the handler and `command/done` at
settlement (both log-only, no turn wrapper); invalid syntax/unknown name returns `undefined` and
logs nothing. The command line and result **never become a model message** — but a command handler
may explicitly use the receiving `Agent` (e.g. `agent.followup()` / `agent.inject()`) to start
model-visible work, exactly as `dsh-plan-mode` does with `/plan`.

### 1.4 `agentPresets` — preset registry (`@deepseek-ai/dsh-agent-preset-registry`)

```
presetForSession(session: Session): string | null
async register(definition: PresetDefinition): Promise<() => Promise<void>>
inspectCompositions(ctx?: Context): AgentPresetInspection[]
async list(): Promise<AgentPreset[]>
@Remote('list') async remoteExportList(): Promise<AgentPresetRoster>
async resolve(id?: string): Promise<AgentPreset>
@Remote('read') readDocument(agentPreset: string): Promise<AgentPresetDocument>
async mount(ctx: Context, id?: string): Promise<AgentPreset>
composeFrom(ctx: Context, parent: Context): string | undefined
composedPreset(ctx: Context): string | undefined
serviceFor<K extends string & keyof Context>(agent, name): Context[K] | undefined
async recompose(ctx: Context, id: string): Promise<AgentPreset>
@Remote('select') async select(agent: Agent, agentPreset: string): Promise<string>
async acquireScope(id?: string): Promise<{ key: ScopeKey } & AsyncDisposable>
compositionInventory(): Promise<AgentPresetComposition[]>
```

**Important:** the README states "the registry writes no declarations. A new preset or an override
of a shipped one is a **bundle patch**: an `insert` of a `@deepseek-ai/dsh-agent-preset` row, or a
patch keyed by that row's id, installed into the profile with `plugin_manager`". So for a novel
preset, prefer a **declarative patch row**, not `agentPresets.register()` at runtime. Minimal
config (verbatim from the registry README):

```yaml
- id: agent-preset-registry
  name: '@deepseek-ai/dsh-agent-preset-registry'
  config: { default: standard }
- id: preset-novel
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: novel
    plugins: []          # child rows: skills, prompt sections, tools this preset composes
```

Each declaration eagerly creates a registry-owned scope and an in-memory Loader tree; plugin
registrations inherit the preset scope. A preset service provider and its consumers must share one
`cordis:group` isolation realm. `select()` commits a preset id to the session's durable log
(`agent-preset/selected` event); existing Agents retain their composition. Presets are **not**
security sandboxes. `PresetDefinition` itself is a runtime-registration type; use it only if the
plugin deliberately registers a preset from JavaScript (then keep the returned disposer in
`ctx.effect`).

### 1.5 `tools` — tool registry (`@deepseek-ai/dsh-tools`)

```
register(definition: ToolDefinition, options: ToolRegistrationOptions = {}): () => void
restrict(filter: ToolRestriction): () => void
get(name, scope?, toolSet?): ToolDefinition | undefined
executable(name, scope?, toolSet?): ToolDefinition | undefined
async resolve(context: ToolActivationContext): Promise<ResolvedToolSet>
definitions(scope?, toolSet?): readonly ToolDefinition[]
schemas(scope?, toolSet?): ToolSchema[]
setExecutor(executor: ToolExecutor): () => void
async execute(input: ToolBatchInput): Promise<ToolBatchResult>
guard(guard: ToolGuard): () => void
checkGuards(exec: ToolExecution): string | undefined
```

`ToolDefinition` shape (verified in the tools README and the working
[dsh-codebuddy-models](../../../packages/dsh-codebuddy-models/index.js) plugin, which registers a
tool with a raw JSON Schema — plain-JS plugins cannot import `defineTool`'s typed DSL):

```js
ctx.tools.register({
  name: 'novel_mode_start',
  description: 'Start the novel-writing workflow...',
  parameters: {                          // raw JSON Schema (object-rooted)
    type: 'object',
    properties: { stage: { type: 'string' } },
    additionalProperties: false,
  },
  output: {
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    render(_args, value) { return [{ type: 'text', text: String(value?.message ?? '') }] },
  },
  async execute(args, exec) { /* exec.signal is cooperative cancellation */ return { ok: true } },
})
```

Schemas flow into system-prompt assembly automatically. `register(def, { when })` evaluates a
per-step condition `{ agent, modelSelection, signal }`. Policy: `tools/pre-execute` (waterfall,
allow/deny/ask) → `ctx.tools.guard()` (monotonic deny) → `tools/execute` → `tools/post-execute` →
`tools/result` (observe-only). Per the `user-actions.md` reference, a plugin operation exposed to
both UI and agent should be implemented **once** as a Host service method, called by the UI via a
Client-callable entry point (a command) and by a tool with matching parameters.

### 1.6 Other services worth knowing (from the catalog)

- `agents`: `create/resume/get/list/roots`, `currentInitiator()`, `withInitiator()`, `register()`,
  `announce()`. Per `practices.md`, register per-agent behavior on `agent.ctx` obtained in an
  `agent/created` listener, wrapped in one `agent.ctx.effect()` **and** keep that disposer in your
  plugin's own effect.
- `agentLoop`: `create(id, options, meta)`, `createAgent(ownerCtx, options)`, `resume(...)`.
- `workflowEngine`: `abstract start(request: WorkflowStartRequest): WorkflowRun` — the Host
  workflow service behind the `workflow` tool.
- `skill` is mounted by `@deepseek-ai/dsh-skill`; `tool-skill` renders the model-facing catalog.
- `clientModules`: `graph()`, `clientPath(id)`, `fetchBundle(request)`, `onGraphChanged(...)` —
  the `dsh.client` boot graph (see §4).
- `locale` exists on the **Client** (`@deepseek-ai/dsh-client-locale`); see §4.3.

---

## 2. Host Event contracts (relevant subset)

Verbatim from the live Host `Event.listEvents` catalog. Modes: `emit` (fire-and-forget),
`serial` (awaited in order), `parallel` (awaited, no veto), `waterfall` (each listener calls
`next()`).

| Event | Mode | Signature |
|---|---|---|
| `commands/change` | emit | `(): void` — a command was registered/unregistered; live adapters refresh discovery |
| `skills/change` | emit | `(): void` — a skill provider/runtime contribution/catalog may have changed |
| `system-prompt/change` | emit | `(): void` |
| `system-prompt/assemble` | waterfall | `(this: Scoped<SystemPrompt>, assembly: PromptPresentation, context: AssembleContext, next: () => Promise<PromptPresentation>): Promise<PromptPresentation>` |
| `tools/change` | emit | `(): void` |
| `tools/result` | emit | `(this: Scoped<ToolsService>, exec, result): undefined` |
| `agent/created` | serial | `(this: Scoped<Agent>, payload: { agent, source, signal? })` |
| `agent/pre-step` | waterfall | `(payload: { agent, messages, turn, step, signal, modelSelection }, next)` |
| `agent/turn-stopping` | serial | `(payload: { agent, turn, signal })` |
| `agent-preset/selected` | emit | `(sessionId: SessionId, agentPreset: string): void` |
| `plugin-manager/changed` | emit | `(change: PluginChange): void` |
| `plugin-market/changed` | emit | `(): void` — configured index sources changed |
| `workflow/start`, `workflow/phase`, `workflow/log`, `workflow/agent-start`, `workflow/agent-end`, `workflow/end` | emit | workflow run lifecycle, useful for a progress UI |
| `session/event`, `session/flush` | emit / parallel | session log feeds (use projections instead of rescanning) |

`practices.md` warnings: do not append new session event `type`s (readers reject unknown live
events; `appendPluginRecord()` is reserved for DSH experimental packages); keep per-session state in
`ctx.sessionProjections`; wait on durable events, not `agent/status` polling; a non-owning
waterfall listener must `return next()`; `agent.inject()` does **not** wake an agent, while
`agent.followup()` does — a timer that starts work calls `followup()`.

---

## 3. Client UI: the `dsh.client` manifest and slot registration

### 3.1 Client module format (verified template + installed dshmarket)

`templates/decoration/client.js` (read directly from `app.asar`) and the installed `dshmarket`'s
`client/client.js` both use the lazy-CJS factory format:

```js
window.__ModuleLoader__.load({
  id: '@local/novel-mode',                 // MUST equal the package name
  factory(require) {
    const React = require('react');        // React comes from the host's frozen module table
    const h = React.createElement;
    function NovelModeButton(props) { /* ... */ }
    return {
      inject: ['slots'],                   // services the returned plugin declares
      apply(ctx) {
        // ctx.slots.inject(ownerKey, () => ctx.slots.register(...))
      },
    };
  },
});
```

No duplicate React install, CDN, JSX, or TypeScript in a plain-JS Client half. Keep factories
side-effect-free; register styles/listeners inside `apply` with `ctx.effect`/`ctx.on` and return
cleanup. Route visible text through `ctx.locale`. Do not read another plugin's DOM or append a
second app to `document.body`. A throwing component blanks its slot entry.

### 3.2 Client Builtins (from the Lead's connected-page query; my Client queries timed out)

`ctx.get`, `ctx.on`, `ctx.provide`, `ctx.effect`, `React`, `host.call(method, args)` (package-private
RPC from the Client half to its own Host half), `styles.insert`, `console`.

**Caveat worth carrying into the design:** the `host.call` symbol is documented in the
`@deepseek-ai/dsh-cordis-client-runner` README as the **dynamic Cordis package** browser-half
surface ("a browser half is written in plain JavaScript … receives a fixed set of names —
`React`, `console`, `styles`, and `host` … Calling `host.call(method, args)` from the loaded half
reaches its own host half", routed through the Remote namespace). A **static `dsh.client` bundle**
(what `templates/decoration` produces) instead participates in the Client Cordis tree via
`ctx.slots`/`ctx.remote` — the shipped `ui-commands` README confirms the standard UI→Host path is
`ctx.remote.commands.execute(...)` (the `@Remote execute` on the commands Service). So treat
`host.call` as available to the *dynamic runner* face and confirm with a connected-page
`Builtin.listBuiltins` before relying on it in a static bundle; the safest documented cross-half
route for a static bundle is the **command plane** below.

### 3.3 `dsh.client` manifest fields (verified template + dshmarket package.json)

```json
{
  "name": "@local/novel-mode",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["index.js", "client.js", "cordis.patch.yml", "locale/*.json", "icon.svg"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-ui-conversation"]
    }
  }
}
```

- `dsh.bundle.patch` — path to the Loader YAML patch (Host rows).
- `dsh.client.platform: "web"`, `dsh.client.immediately: true` — load eagerly at boot.
- `dsh.client.inject` — **compile-time ordering** of dynamic providers before consumers (NOT
  runtime service injection). The installed `dshmarket` uses
  `["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-client-ui-theme"]`.
  For a conversation button, the shipped template uses
  `["@deepseek-ai/dsh-client-ui-conversation"]`; adding
  `@deepseek-ai/dsh-client-ui-commands` / `@deepseek-ai/dsh-api-remotes` may be needed for the
  command path — confirm via a connected-page `Builtin.listBuiltins` / `Client Service.listService`.
- `dsh.client.external` — exact non-baseline module requests (built bundles only).
- The Client export must be `./client`; the Host's `clientModules` service serves it under
  `/plugins`. A `package.json` edit alone is only observed on the next entry restart/boot.
- **Display checklist** (`host-plugin.md`): `meta.title` + `meta.description` in `locale/en.json`
  (sentence case) and `locale/zh.json`; an original `icon.svg` (SVG/PNG/JPEG/WebP ≤256 KiB, inside
  the package); export `./locale/*.json` and `./icon`; keep every runtime file in `files`; verify
  the packed file list. A package-root plugin may instead declare a top-level `"icon"` in
  `package.json`. Missing text falls back to `name`/`description`; missing images use default
  artwork — never silently accept that.

```yaml
# cordis.patch.yml (template form)
- insert:
    - id: novel-mode
      name: '@local/novel-mode'
      config: {}   # optional
```

### 3.4 Slots — recommended placement for a clickable mode button

`Slots.listSubTree` was unavailable from this subagent (Client queries timed out). Verified slot
names and registration shapes from the shipped template, the `ui-conversation` README, and the
installed `dshmarket` client bundle:

- `conversation.composer.dock` — the template's recommended slot for a simple decoration with
  allocated space ("for a simple drawing, prefer a slot with allocated space, such as
  `conversation.composer.dock` when available"). Best first version for a button.
- Other host slots named in the `ui-conversation` README: `conversation.composer`,
  `conversation.composer.bar`, `conversation.input.dock`, `conversation.input.activity` (one
  control between model selector and Send, with `onActiveChange` to expand),
  `conversation.input.overlay`, `conversation.session.header.views.actions`, `conversation.user.text.node`.
  **Note:** contributions to `conversation.composer.*` and `conversation.input.*` must portal fixed
  overlays to `document.body` (the composer is a containing block for `position: fixed`).
- `sidebar.panellist` and `main` — verified real usage in dshmarket: a panel row plus a `main`
  panel component, e.g.
  `ctx.slots.register({ name: 'sidebar.panellist', id: 'novel-mode', order: 1, label: () => t('nav'), locale: NS }, IconComponent)`
  and `ctx.slots.register({ name: 'main', key: 'novel-mode', locale: NS }, PanelComponent)`.
- `settings.section` (+ `settings.section.icon`, `plugins.tab`, `settings.plugins.tab`,
  `plugins.detail.section`, `shell.overlay`) — all verified in dshmarket's `mountMarket()`.

Registration shape (template + dshmarket, verbatim patterns):

```js
ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
  name: 'conversation.composer.dock',
  id: 'novel-mode',
  order: 5,
  label: () => t('novelMode'),           // localized label when the slot renders rows
  locale: 'novel-mode',
}, NovelModeButton));
```

`ctx.slots.inject(ownerKey, callback)` — the callback's registrations are disposed when the owning
declaration collapses and reinstalled when it returns. The callback may take a third arg (`false`
in dshmarket's sidebar gate) and may return a cleanup function. `ctx.slots.register(options,
Component)` returns a disposer. Options seen in the wild: `name`, `id`, `key`, `order`, `label`,
`locale`, `inject`, `select` (chain slots). Slot props (`PropsRuntime`) supply Session/global
standard props; read session data through the smallest selector hook. `practices.md`: contribute
through slots, do not write DOM outside your component, use `--dsw-alias-*` theme tokens (query
`Theme.listTokens`), and copy host control markup/CSS under your own class prefix rather than
importing `@deepseek-ai/dsh-client-ui-primitives` as a module.

For a **mode button** specifically, an alternative with less custom UI is the command surface:
`ctx.commandUi` (`@deepseek-ai/dsh-client-ui-commands`) registers a `popupSelect` or `action`; a
typed `/novel` line resolves through the `/` trigger menu. The "+" composer button and a typed `/`
open the same menu. That path needs no slot at all but is less visibly a "mode button"; combining a
`conversation.composer.dock` button with a Host `/novel` command gives both.

### 3.5 Client `locale` service (`@deepseek-ai/dsh-client-locale`)

`ctx.locale.register(ns, { zh, en, ja })` requires both baseline locales (`zh`, `en`); `t` comes
from `ctx.locale.bind(ns)` or the framework-injected `t` seat / slot `inject: () => ({ t })`.
`ctx.locale.resolveText()` handles `LocalizedText`; `addLanguage({ id, label, fallback })` adds a
language pack. Registrations are owned effects (`ctx.effect(() => ctx.locale.register(...))`).
Slot-rendered copy follows language switches live; registry-held text (command descriptions)
is read once at registration.

---

## 4. Recommended architecture — how the button triggers the workflow

**Bundle layout** (one package, Host half + Client half + assets):

```
novel-mode/
  package.json            # dsh.bundle.patch + dsh.client (§3.3)
  cordis.patch.yml        # one insert row: id novel-mode, name @local/novel-mode
  index.js                # Host half: skills, prompt section, command, optional tool
  client.js               # Client half: the 小说模式 button in a conversation slot
  locale/{en,zh}.json     # meta.title/description + UI dictionary
  icon.svg
  skills/<21 skills>/...  # SKILL.md + scripts/templates (from the workflow audit)
  commands/, agents/, templates/, rules/  # packaged workflow assets
```

**Host half (`index.js`)** — `export const inject = ['skills', 'systemPrompt', 'commands']`
(plus `'tools'` only if a tool is registered; use `ctx.get('tools')` + optional chaining like the
codebuddy plugin does). In `apply(ctx, config)`:
1. `ctx.skills.register(...)` for each workflow skill with `resourceBase.kind:'directory'` pointing
   into the bundle (§1.1) — this is how the 21 skills, 20 scripts and templates become loadable.
2. `ctx.systemPrompt.section({ name:'novel:mode', order:<finite>, text: <short routing rule> })`
   (§1.2) — keeps per-step token cost near zero.
3. `ctx.commands.register({ name:'novel', ... , handler })` (§1.3) — the single operation that
   starts the workflow, implemented once (per `user-actions.md`).
4. Optionally `ctx.tools.register(...)` with the same operation for the agent (§1.5), so UI and
   tool paths share logic.
5. Optionally an agent-preset patch row (§1.4) if Novel Mode should be a selectable preset with
   its own skills/prompt/tools composition.

**Client half (`client.js`)** — a `NovelModeButton` React component in
`conversation.composer.dock` (or `conversation.input.activity` / `sidebar.panellist`). On click,
**Option A (recommended, fully documented)**: call the Host command through the Client Remote:

```js
// inside the component / an action registered in apply
await ctx.remote.commands.execute(/* agent */, '/novel ' + brief, [], signal)
```

`commands.execute` is `@Remote` (§1.3); the shipped `ui-commands` package dispatches `/` lines
through exactly this `command.execute` RPC. The command handler runs in the Host against the
receiving Agent — no model message is created by the registry itself.

**Option B (Lead's suggestion, verify first)**: `host.call(method, args)` from the Client half
directly to a Host method. This is the **dynamic Cordis runner** browser-half contract (§3.2);
confirm with a connected-page `Builtin.listBuiltins` that a static `dsh.client` bundle also receives
`host`. If it does, it is the cleanest package-private RPC; if it does not, use Option A.

**Starting actual model-visible work** (inside the command handler / Host method), in increasing
strength:
- `agent.inject(content)` — adds per-agent context, logged as `agent/inbox/spliced`, enters the
  next admitted step; does **not** wake the agent.
- `agent.followup(...)` — wakes the agent; required when a timer/button must start a turn.
- `ctx.get('workflowEngine').start(request)` / the `workflow` tool — runs the full multi-stage
  novel workflow; lifecycle is observable via `workflow/start|phase|log|end` events (§2).
- `ctx.agentPresets.select(agent, 'novel')` — switch the session to the Novel preset
  (`@Remote('select')`), if the preset approach is chosen.

**Display & verification**: complete the `host-plugin.md` checklist (localized `meta.title`/
`description`, original icon, exports + `files`), syntax-check JS and manifest, install with
`plugin_manager install_bundle` (absolute workspace dir), read `application: applied`, then confirm
the new rows with `cordis_inspect_query` (approval-free) and exercise the button. Report
verification limits honestly — installation + slot registration alone do not prove what the user
sees (`verification.md`).

---

## 5. dshmarket & market contribution path

### 5.1 Installed dshmarket package (verified)

- Bundle `dshmarket@1.73.16`, availability `profile`, installed & enabled, row `dsh-market`
  (`plugin_manager list_bundles`). Package dir:
  `C:\Users\altria\.dsh\profiles\desktop\node_modules\dshmarket`.
- `package.json` declares `dsh.bundle.patch: ./cordis.patch.yml`, `dsh.client` with
  `platform: "web"` and `inject: [...locale, ...ui-settings, ...ui-theme]`, exports
  `./client: ./client/client.js`, `./locale/*.json`, `./cordis.patch.yml`; `files` lists
  `assets/logo.svg`, `locale`, `lib`, `client`, `UPDATE-API-V1.md`, `cordis.patch.yml`, `LICENSE`.
  Its repo is `https://github.com/dsh-market/dsh-market`.
- README §"Submit your plugin": **"This repo is the market app, not the catalog."** The plugin list
  comes from the curated [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
  registry — open a PR **there** (one entry in the list; site and market pick it up automatically,
  usually within a day). Do **not** PR plugin entries against `dsh-market/dsh-market`.
- Data source: fetched live on every open from
  `https://awesome-dsh-plugin.com/plugins.json` (curated entries, npm mapping, star counts
  refreshed daily by CI). Install sources are restricted to that curated registry. Mirror override:
  `DSHM_REGISTRY_URL`. China region reads the same catalog from npm first.
- README §link to format-1 index: on dsh 0.2.1+, **Plugins → Discover → Index sources** accepts
  `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` — "this list as a format-1 index,
  served from npm so it loads quickly everywhere" (GitHub Pages copies
  `https://awesome-dsh-plugin.com/index.json` and `https://dshmarket.com/index.json` may exceed the
  host's 15 s budget). The Host's Discover tab and the `plugin_market` agent tool then search it.

### 5.2 `plugin_market` (first-party, verified)

- `plugin_market list_indexes` returned `{"indexes":[]}` — **this profile has no configured index
  sources**; the experimental `@deepseek-ai/dsh-experimental-plugin-market-bundle` (rows
  `plugin-market`, `ui-plugin-market`) is shipped but **disabled** (`list_bundles`). To browse an
  index, enable that bundle and add the URL via Discover → Index sources (or
  `setIndexes` / Settings). `plugin_market list_plugins` with the jsdelivr URL failed with
  "Not a configured index source" — expected until it is added.
- `dsh-plugin-market` Host README: `listIndexes()`, `setIndexes(urls)` (volatile config, writes via
  `settings.update`, emits `plugin-market/changed`), `search(url, query)` (only configured URLs),
  `readEntryDetail(...)`. Each version carries exact `install`/`target` + `registry` arguments for
  `plugin_manager install_bundle`. URL rules: `http:`/`https:` only, no credentials, no `#`
  fragment, no redirects; fetch timeout 15 s, body up to 128 MiB; successful docs cached 10 min.
  Compatibility is computed from each version's `engines.dsh` + profile version exemptions.
- `web_fetch` of `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` (HTTP 200) confirmed
  the **format-1 index schema**: top-level
  `{ format: 1, title: {en,zh}, description: {en,zh}, metadata: { categories, labels, sortKeys }, plugins: [...] }`.
  Each plugin: `name`, `title`, `description: {en,zh}`, `homepage`,
  `repository: { url, directory? }`, `metadata: { category, keywords, labels, sortKeys }`,
  `versions: [{ version, publishTimestamp, source: { type: 'npm'|'git', ... }, engines: { dsh? } }]`.
  Categories include `skill`, `workflow`, `ui`, `tools`, … (a novel-writing plugin fits `workflow`
  or `skill`). Its sibling doc: [plugin-market.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.md)
  — "A plugin index is one JSON file that lists installable DSH bundles … Turn on the experimental
  **Custom plugin indexes** bundle … To publish an index, write or generate an index file and
  serve it, together with its icon files, from any static host."

### 5.3 Community submission process (verified via web_search + web_fetch, untrusted external data)

Source: [awesome-dsh-plugin/contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)
(confirmed by both search snippets and the fetched GitHub blob). Key rules:

- **The READMEs are generated — do not edit them by hand.** The list lives in `data/plugins/`,
  one YAML file per plugin.
- Submission = **one PR adding one file** `data/plugins/<owner>__<repo>.yml`:

```yaml
url: https://github.com/owner/repo        # must match the repo exactly
name: owner/repo                          # link text shown in the list
category: workflow                        # see the category list
description:
  en: One-line description ending with a period.
  zh: 一句话描述，以句号结尾。             # optional — a maintainer will add it
# optional — GitHub-hosted raster image used as the storefront tile;
# falls back to the owner's avatar when omitted
icon: https://raw.githubusercontent.com/owner/repo/main/assets/icon-180.png
```

Only `description.en` is required. A description containing `": "` must be quoted or YAML parsing
fails. One PR may carry up to 3 entries; monorepo subpackages use
`url: .../tree/main/packages/xxx` + `name: owner/repo#subname` and filename
`owner__repo--packages-xxx.yml`. Feedback comes as a PR comment naming exactly what to change.
The two READMEs are regenerated on `main` after the PR merges. An optional `tarball:` names a
prebuilt `.tgz` from a GitHub Release (installs without build-script approval); screenshots are
declared in a `screenshots.json` in the plugin's own repo (1–8 GitHub-hosted images). A
`pr-body.md` in that repo supplies the PR checklist template.
- The plugin's own repo `package.json` must be scannable: **`dsh.bundle`** (patch) is fetched from
  the repo's `package.json` (root, or a `packages/` · `plugins/` · `apps/` subpackage) — "Declaring
  only `dsh.client` fails here." Also recommended by community publishing guides: `dsh.client`,
  `engines.dsh`, `description`/`descriptionZh`/`keywords`, README install command, the `dsh-plugin`
  GitHub Topic, and a Release/tag (optionally an npm package).
- **CI / human-review gates** (from the full contributing.md, cross-checked against the
  publishing-researcher's CDN copy — see §6): (1) the repo must carry real runnable code, not a
  placeholder/README-only repo; (2) the repo must be **at least 1 day old** (CI age check, auto
  re-runs); (3) the repo must have the **`dsh-plugin` topic**; (4) the description must match the
  code, with no superlatives/marketing claims — maintainers read the source; (5) any official
  `@deepseek-ai/*` packages belong in `peerDependencies` with explicit prerelease ranges (otherwise
  `ERESOLVE`); pure aggregator packages (dependency lists only) are not listed. Adding only a Topic
  does **not** auto-list the plugin; the PR is required.
  - **Nuance for the builder:** gate (5) applies only when the bundle actually declares DSH package
    dependencies. A plugin that reaches services through `ctx.*` / `inject` needs **no
    dependencies at all** — `host-plugin.md` says "A Host-only bundle needs no dependencies", and
    all three working workspace plugins in §1 declare none. Do not add `@deepseek-ai/*`
    peerDependencies just to satisfy a misread of that gate.
- Valid categories (23): `agi ui usage theme model identity session memory tools wsl browser vision
  voice docs skill workflow git notify dev security remote market fun` — 小说模式 fits `workflow`
  (or `skill`). A wrong category is corrected by maintainers, not a rejection.
- Cross-checked against [DSH-Enhance/docs/PUBLISHING.md](https://github.com/IndieXiaoLong/DSH-Enhance/blob/main/docs/PUBLISHING.md):
  two distinct entry points — (A) self-hosted format-1 index for Discover (user must manually add
  the index URL; no global official index upload), (B) dsh-market listing via the
  awesome-dsh-plugin PR above. Example current draft PR: `awesome-dsh-plugin#8863`.
- Note for the publishing-researcher: the market catalog is curated, so **automation ends at
  "open the PR"** — a maintainer merges it; the site/market then syncs (usually within a day).
  A git push / PR creation can be automated; the merge and sync cannot.

---

## 6. Cross-review notes (for lead)

- **`publishing-research.md` (task-3) — reviewed, no factual corrections.** It agrees with §5 on
  every overlapping point: dshmarket@1.73.16 at the same profile path, the awesome-dsh-plugin
  `data/plugins/<owner>__<repo>.yml` PR as the real submission channel (not `dsh-market/dsh-market`),
  the format-1 index URL, `plugin_market list_indexes` being empty, and the "Not a configured index
  source" error. It adds valuable detail I folded into §5.3: the full contributing.md CI gates
  (repo ≥1 day old, `dsh-plugin` topic, real runnable code, description matches source,
  `@deepseek-ai/*` in peerDependencies with prerelease ranges), the `pr-body.md` template, the
  23-category list, the ≤3-entries/monorepo naming rule, and `tarball:`/`screenshots.json`.
  **One nuance to relay to the builder:** the peerDependencies gate only binds plugins that actually
  declare DSH package dependencies; this bundle (like the three working workspace plugins) needs
  none — see the nuance note in §5.3. Also note §5.2 here is deliberately explicit that the
  format-1 index is the **read/Discover side**, while the awesome-dsh-plugin PR is the
  **submission side** — the publishing doc's §6 warning about not conflating them is correct and
  already reflected in my §5 headings.
  - Its §6 said my doc had not appeared at 21:42; it has now (written 21:41+, revised after
    reading theirs). No action needed.
- **`workflow-audit.md` (task-1) — not yet present at the time of this revision.** Provisional
  cross-check for when it lands: audited "files that must ship inside the bundle" should map to
  `skills/<name>/` directories pointed at by `resourceBase` (§1.1) and be listed in
  `package.json` `files` (§3.3); project-runtime `.codebuddy`/`.dsh` config files are not Loader
  rows — they need the Host half to register them (commands/skills/preset), not a patch insert.
  Skill bodies must be `SKILL.md` files loaded with `readFileSync` at registration time, and a
  bundle must declare `dsh.bundle.patch` even if it also declares `dsh.client` (market CI).
- **Correction to the Lead's item (4)**: `host.call` is the *dynamic Cordis runner* browser-half
  symbol (`dsh-cordis-client-runner` README); for a static `dsh.client` bundle the documented
  UI→Host path is `ctx.remote.commands.execute(...)` (`ui-commands` README + the `@Remote` commands
  Service). Both are recorded in §4; please confirm via a connected-page `Builtin.listBuiltins`
  before the builder commits to `host.call`.
- **Open verification gaps** (unavailable from this subagent): live `Client Slots.listSubTree` for
  `conversation.hero.options` / `conversation.input.left|right` / `sidebar.panellist` /
  `settings.section` (all Client queries timed out — no connected page); `Client Builtin.listBuiltins`;
  `Client Service.listService` (e.g. `remote/commands/locale`); exact `PresetDefinition`,
  `PromptSection`, `CommandDefinition`, `SkillRegistration` type declarations (the exact-contract
  `input` argument is rejected in this harness — §0). The Lead/connected-page session should run
  these before implementation; I recommend re-running with **no `input` arg** and reading the
  spilled catalog, and using `Config.listConfigs` for field-level schemas.
