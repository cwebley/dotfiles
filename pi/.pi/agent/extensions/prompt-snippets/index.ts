/** Prompt snippets, selected independently in a tmux/fzf pane. */
import { mkdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

// Stow links index.ts individually. Resolve its source before loading sibling resources.
const extensionDir = dirname(realpathSync(fileURLToPath(import.meta.url)));
const snippetsDir = join(extensionDir, 'snippets');
const WIDGET_ID = 'prompt-snippets';

export default async function (pi: ExtensionAPI) {
  const protocol = await import(pathToFileURL(join(extensionDir, 'picker-protocol.mjs')).href);
  const { TmuxPicker } = await import(pathToFileURL(join(extensionDir, 'tmux-picker.mjs')).href);
  installPromptSnippets(pi, protocol, TmuxPicker);
}

export function installPromptSnippets(pi: ExtensionAPI, { loadSnippets, composePrompt, escapeDisplay }, Picker) {
  let snippets = [];
  let enabled = new Set<string>();
  let lastContext: ExtensionContext | undefined;

  function updateWidget(ctx: ExtensionContext) {
    if (!ctx.hasUI || ctx.mode !== 'tui') return;
    const active = snippets.filter(s => enabled.has(s.id));
    const prepend = active.filter(s => s.placement === 'prepend');
    const append = active.filter(s => s.placement === 'append');
    const lines = [];
    if (prepend.length) lines.push(ctx.ui.theme.fg('accent', `↑ prepend: ${prepend.map(s => escapeDisplay(s.name)).join(' · ')}`));
    if (append.length) lines.push(ctx.ui.theme.fg('warning', `↓ append: ${append.map(s => escapeDisplay(s.name)).join(' · ')}`));
    ctx.ui.setWidget(WIDGET_ID, lines.length ? lines : undefined);
  }

  const picker = new Picker({
    helperPath: join(extensionDir, 'picker-helper.mjs'),
    onCommit(ids: string[]) {
      enabled = new Set(ids);
      if (lastContext) updateWidget(lastContext);
    },
    onError(message: string) { lastContext?.ui.notify(message, 'warning'); },
    onDetached() { lastContext?.ui.notify('Prompt snippets is open in the bottom pane. Use your tmux pane-navigation keys to reach it.', 'info'); },
  });

  async function openMenu(ctx: ExtensionContext) {
    if (ctx.mode !== 'tui') { ctx.ui.notify('Snippet picker requires interactive pi inside tmux', 'warning'); return; }
    lastContext = ctx;
    if (!picker.current) {
      snippets = loadSnippets(snippetsDir);
      enabled = new Set([...enabled].filter(id => snippets.some(s => s.id === id)));
      updateWidget(ctx);
      if (!snippets.length) { ctx.ui.notify(`No snippets found in ${snippetsDir}`, 'warning'); return; }
    }
    await picker.open(snippets, enabled);
  }

  pi.on('session_start', async (_event, ctx) => {
    await picker.invalidate();
    lastContext = ctx; enabled = new Set();
    mkdirSync(snippetsDir, { recursive: true });
    snippets = loadSnippets(snippetsDir); updateWidget(ctx);
  });
  pi.on('input', (event, ctx) => {
    // Invalidate first, even for empty selections and slash/queued prompts reaching this hook.
    // Confirmation and this boundary are synchronous: no late result can target another prompt.
    void picker.invalidate();
    lastContext = ctx;
    if (!enabled.size) return;
    snippets = loadSnippets(snippetsDir);
    const text = composePrompt(snippets, enabled, event.text);
    enabled = new Set(); updateWidget(ctx);
    if (text === event.text) return;
    return { action: 'transform' as const, text };
  });
  pi.on('session_before_switch', async () => { await picker.invalidate(); });
  pi.on('session_before_fork', async () => { await picker.invalidate(); });
  pi.on('session_before_tree', async () => { await picker.invalidate(); });
  pi.on('session_shutdown', async () => { await picker.invalidate(); lastContext = undefined; });

  pi.registerShortcut('alt+s', { description: 'Choose prompt snippets in tmux', handler: openMenu });
  pi.registerCommand('snippets', { description: 'Choose prompt snippets in tmux', handler: async (_args, ctx) => openMenu(ctx) });
}
