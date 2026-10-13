import { homedir } from 'node:os';
import { relative, resolve, sep } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { readQuota } from './quota.mjs';
import { cachePercent, compact, isSubscription, quotaText, showOpenAIQuota, usageTotals } from './format.mjs';

const clean = (text: string) => text.replace(/[\r\n\t]/g, ' ').trim();

// Dependencies are injectable for tests. No auth files or browser state are read here.
export function installFooter(pi: ExtensionAPI, {
  fetchQuota = readQuota,
  now = Date.now,
  pollMs = 5 * 60 * 1000,
} = {}) {
  let context: ExtensionContext | undefined;
  let snapshot: Awaited<ReturnType<typeof readQuota>> | undefined;
  let error: string | undefined;
  let request: Promise<void> | undefined;
  let controller: AbortController | undefined;
  let lastAttempt = -Infinity;
  let timer: ReturnType<typeof setInterval> | undefined;
  let requestRender = () => {};
  let generation = 0;

  function stop() {
    generation++;
    controller?.abort();
    controller = undefined;
    request = undefined;
    if (timer) clearInterval(timer);
    timer = undefined;
    requestRender = () => {};
    context = undefined;
  }

  function refresh(force = false): Promise<void> {
    if (!context || context.mode !== 'tui' || !showOpenAIQuota(context)) return Promise.resolve();
    if (request) return request;
    if (!force && now() - lastAttempt < pollMs) return Promise.resolve();
    lastAttempt = now();
    const activeGeneration = generation;
    const activeController = new AbortController();
    controller = activeController;
    request = (async () => {
      try {
        const result = await fetchQuota({ signal: activeController.signal });
        if (generation !== activeGeneration) return;
        snapshot = result;
        error = undefined;
      } catch {
        if (generation !== activeGeneration) return;
        // Never forward external process output or auth diagnostics into Pi.
        error = 'Codex quota unavailable. Check the Keychain login with codex -c \'cli_auth_credentials_store="keyring"\' login status.';
      } finally {
        if (generation === activeGeneration) {
          request = undefined;
          controller = undefined;
          requestRender();
        }
      }
    })();
    requestRender();
    return request;
  }

  pi.on('session_start', (_event, ctx) => {
    stop();
    snapshot = undefined;
    error = undefined;
    lastAttempt = -Infinity;
    context = ctx;
    if (ctx.mode !== 'tui') return;
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(requestRender);
      let cachedKey: string | undefined;
      let totals = usageTotals([]);
      return {
        dispose() { unsubscribe(); requestRender = () => {}; },
        invalidate() { cachedKey = undefined; },
        render(width: number) {
          const current = context ?? ctx;
          const manager = current.sessionManager;
          const key = `${manager.getSessionId()}:${manager.getLeafId()}`;
          if (cachedKey !== key) {
            totals = usageTotals(manager.getEntries());
            cachedKey = key;
          }
          const cwd = resolve(manager.getCwd());
          const rel = relative(homedir(), cwd);
          const path = rel === '' ? '~' : rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep) ? `~${sep}${rel}` : cwd;
          const branch = footerData.getGitBranch();
          const name = manager.getSessionName();
          const location = clean(`${path}${branch ? ` (${branch})` : ''}${name ? ` · ${name}` : ''}`);
          const stats = [];
          if (totals.input) stats.push(`↑${compact(totals.input)}`);
          if (totals.output) stats.push(`↓${compact(totals.output)}`);
          const cached = cachePercent(totals);
          if (cached != null) stats.push(`cache ${cached.toFixed(1)}%`);
          if (!isSubscription(current) && totals.cost) stats.push(`$${totals.cost.toFixed(3)}`);
          const usage = current.getContextUsage();
          const window = usage?.contextWindow ?? current.model?.contextWindow;
          if (window) stats.push(`ctx ${usage?.percent == null ? '?' : usage.percent.toFixed(1)}%/${compact(window)}`);
          let left = theme.fg('dim', stats.join(' '));
          if (showOpenAIQuota(current)) {
            const text = quotaText(snapshot, { now: now(), failed: Boolean(error), loading: Boolean(request), compact: true });
            const percent = snapshot?.weekly?.usedPercent ?? snapshot?.fiveHour?.usedPercent;
            const color = error ? 'warning' : percent != null && percent >= 90 ? 'error' : percent != null && percent >= 70 ? 'warning' : 'dim';
            left += `${stats.length ? ' · ' : ''}${theme.fg(color, text)}`;
          }
          const right = theme.fg('dim', clean(`${current.model?.id ?? 'no-model'}${current.model?.reasoning ? ` · ${current.thinkingLevel ?? 'off'}` : ''}`));
          const pad = ' '.repeat(Math.max(2, width - visibleWidth(left) - visibleWidth(right)));
          const lines = [
            truncateToWidth(theme.fg('dim', location), width),
            truncateToWidth(left + pad + right, width),
          ];
          const statuses = Array.from(footerData.getExtensionStatuses().entries())
            .sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => clean(value));
          if (statuses.length) lines.push(truncateToWidth(statuses.join(' '), width));
          return lines;
        },
      };
    });
    timer = setInterval(() => { void refresh(); requestRender(); }, 60 * 1000);
    timer.unref?.();
    void refresh();
  });

  pi.on('model_select', (_event, ctx) => {
    context = ctx;
    // Different provider/account choices must not retain an old quota snapshot.
    snapshot = undefined;
    error = undefined;
    lastAttempt = -Infinity;
    generation++;
    controller?.abort();
    request = undefined;
    controller = undefined;
    void refresh();
    requestRender();
  });
  pi.on('agent_end', (_event, ctx) => { context = ctx; requestRender(); });
  pi.on('session_shutdown', () => stop());

  pi.registerCommand('plan-usage', {
    description: 'Refresh OpenAI plan usage through the official Codex Keychain login',
    handler: async (_args, ctx) => {
      context = ctx;
      if (ctx.mode !== 'tui' || !showOpenAIQuota(ctx)) {
        ctx.ui.notify('Select an OpenAI subscription model to show plan usage.', 'info');
        return;
      }
      await refresh(true);
      ctx.ui.notify(error ?? quotaText(snapshot, { now: now() }), error ? 'warning' : 'info');
    },
  });
}

export default function (pi: ExtensionAPI) { installFooter(pi); }
