import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { cachePercent, compact, duration, isSubscription, quotaText, showOpenAIQuota, usageTotals } from '../../.pi/agent/extensions/subscription-footer/format.mjs';

const now = 1800000000000;
const snapshot = { weekly: { usedPercent: 7, resetAt: now / 1000 + 5 * 86400 + 14 * 3600 }, observedAt: now };

test('weekly-only quota matches 93% left and does not invent 5h', () => {
  assert.equal(quotaText(snapshot, { now }), 'OpenAI week: 93% left · resets in 5d 14h');
  assert.ok(!quotaText(snapshot, { now }).includes('5h:'));
  assert.match(quotaText({ ...snapshot, fiveHour: { usedPercent: 50, resetAt: now / 1000 + 120 } }, { now }), /5h: 50% left/);
});
test('unavailable, stale, refresh errors and expired resets are explicit', () => {
  assert.match(quotaText(undefined), /unavailable/);
  assert.match(quotaText(undefined, { loading: true }), /checking/);
  assert.match(quotaText(snapshot, { now: now + 600001 }), /stale/);
  assert.match(quotaText(snapshot, { now, failed: true }), /stale/);
  assert.match(quotaText({ ...snapshot, weekly: { usedPercent: 7, resetAt: now / 1000 } }, { now }), /reset due, refreshing/);
  assert.equal(duration(65), '2m');
  assert.equal(compact(1200), '1.2k');
});
test('compact quota preserves remaining semantics, real windows and stale state', () => {
  assert.equal(quotaText(snapshot, { now, compact: true }), 'week 93% 5d14h');
  assert.match(quotaText(snapshot, { now, compact: true, failed: true }), /stale 0m/);
  assert.equal(quotaText(undefined, { compact: true }), 'week unavailable');
  assert.equal(quotaText(undefined, { compact: true, loading: true }), 'week …');
  assert.match(quotaText({ ...snapshot, fiveHour: { usedPercent: 50, resetAt: now / 1000 + 120 } }, { now, compact: true }), /5h 50% 2m/);
  assert.match(quotaText({ ...snapshot, weekly: { usedPercent: 7, resetAt: now / 1000 } }, { now, compact: true }), /reset due.*stale/);
});
test('cache percentage includes all input but excludes output and cache writes from hits', () => {
  assert.equal(cachePercent({ input: 25, cacheRead: 50, cacheWrite: 25, output: 1000 }), 50);
  assert.equal(cachePercent({ input: 0, cacheRead: 0, cacheWrite: 0 }), undefined);
  assert.equal(cachePercent({ input: 10, cacheRead: 0, cacheWrite: 0 }), 0);
  assert.equal(cachePercent({ input: 0, cacheRead: 10, cacheWrite: 0 }), 100);
  assert.equal(cachePercent({ input: 298000, cacheRead: 7000000, cacheWrite: 0 }).toFixed(1), '95.9');
});
test('subscription detection requires subscription auth, not just OAuth', () => {
  const ctx = { model: { provider: 'openai' }, modelRegistry: { isUsingOAuth: () => true, getProvider: () => ({ auth: { oauth: { isSubscription: true } } }) } };
  assert.equal(isSubscription(ctx), true);
  assert.equal(showOpenAIQuota(ctx), true);
  ctx.modelRegistry.isUsingOAuth = () => false;
  assert.equal(isSubscription(ctx), false);
  ctx.model.provider = 'kimi-coding';
  assert.equal(isSubscription(ctx), true);
  assert.equal(showOpenAIQuota(ctx), false);
});
test('all billed session usages counted, including tools and compaction', () => {
  const u = { input: 10, output: 2, cacheRead: 4, cost: { total: 0.01 } };
  const entries = [
    { type: 'message', message: { role: 'assistant', usage: u } },
    { type: 'message', message: { role: 'toolResult', usage: u } },
    { type: 'compaction', usage: u }, { type: 'branch_summary', usage: u }, { type: 'usage', usage: u },
    { type: 'message', message: { role: 'user' } },
  ];
  assert.deepEqual(usageTotals(entries), { input: 50, output: 10, cacheRead: 20, cacheWrite: 0, cost: 0.05 });
});

const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(homedir(), '.pi/agent');
const hostRoot = process.env.PI_TEST_HOST_ROOT || path.join(agentDir, 'install/releases', fs.readFileSync(path.join(agentDir, 'install/current-version'), 'utf8').trim(), 'node_modules');
const { createJiti } = await import(pathToFileURL(path.join(hostRoot, 'jiti/lib/jiti.mjs')).href);
const tuiPath = path.join(hostRoot, '@earendil-works/pi-tui/dist/index.js');
const jiti = createJiti(import.meta.url, { alias: { '@earendil-works/pi-tui': tuiPath }, moduleCache: false });
const { installFooter } = await jiti.import(fileURLToPath(new URL('../../.pi/agent/extensions/subscription-footer/index.ts', import.meta.url)));
const { visibleWidth } = await import(pathToFileURL(tuiPath).href);

function harness(fetchQuota = async () => snapshot) {
  const handlers = new Map();
  const commands = new Map();
  let factory;
  const ctx = {
    mode: 'tui', model: { provider: 'openai', id: 'gpt-test', reasoning: true, contextWindow: 100000 }, thinkingLevel: 'high',
    modelRegistry: { isUsingOAuth: () => true, getProvider: () => ({ auth: { oauth: { isSubscription: true } } }) },
    sessionManager: {
      getSessionId: () => 'test', getLeafId: () => 'leaf', getSessionName: () => '测试', getCwd: () => homedir(),
      getEntries: () => [{ type: 'message', message: { role: 'assistant', usage: { input: 1000, output: 100, cacheRead: 7000, cost: { total: 2 } } } }],
    },
    getContextUsage: () => ({ percent: 20, contextWindow: 100000 }),
    ui: { setFooter: f => { factory = f; }, notify() {} },
  };
  installFooter({ on: (name, fn) => handlers.set(name, fn), registerCommand: (name, command) => commands.set(name, command) }, { fetchQuota, now: () => now });
  const start = () => handlers.get('session_start')({}, ctx);
  const shutdown = () => handlers.get('session_shutdown')({}, ctx);
  const component = () => factory({ requestRender() {} }, { fg: (_color, text) => text }, {
    onBranchChange: () => () => {}, getGitBranch: () => 'main', getExtensionStatuses: () => new Map([['other', 'Other extension status']]),
  });
  return { ctx, handlers, commands, start, shutdown, component };
}

test('real Pi TUI width helpers: subscription no dollars, paid API dollars, other statuses retained', async () => {
  const h = harness();
  try {
    h.start();
    await h.commands.get('plan-usage').handler('', h.ctx);
    const c = h.component();
    const lines = c.render(120);
    assert.equal(lines.length, 3, 'directory, combined stats/quota, and extension statuses');
    assert.ok(lines[1].includes('↑1.0k') && lines[1].includes('cache 87.5%') && lines[1].includes('week 93% 5d14h'));
    assert.ok(!lines.join('\n').includes('R7.0k'));
    assert.ok(!lines.join('\n').includes('$'));
    assert.ok(lines.some(line => line.includes('Other extension status')));
    for (const width of [1, 10, 20, 40, 80, 120]) for (const line of c.render(width)) assert.ok(visibleWidth(line) <= width);
    h.ctx.modelRegistry.isUsingOAuth = () => false;
    assert.ok(c.render(120).join('\n').includes('$2.000'));
    assert.ok(!c.render(120).join('\n').includes('week 93%'));
    c.dispose();
  } finally { h.shutdown(); }
});

test('non-TUI never starts quota process or custom footer', () => {
  let reads = 0;
  const h = harness(async () => { reads++; return snapshot; });
  h.ctx.mode = 'print';
  h.start();
  assert.equal(reads, 0);
  h.shutdown();
});

test('shutdown cancels requests and late results cannot repaint', async () => {
  let resolve;
  let signal;
  const h = harness(options => { signal = options.signal; return new Promise(r => { resolve = r; }); });
  h.start();
  h.shutdown();
  assert.equal(signal.aborted, true);
  resolve(snapshot);
  await Promise.resolve();
});

test('refresh failures never expose process diagnostics', async () => {
  const h = harness(async () => { throw new Error('SENSITIVE_TEST_SENTINEL'); });
  try {
    h.start();
    let notification;
    h.ctx.ui.notify = text => { notification = text; };
    await h.commands.get('plan-usage').handler('', h.ctx);
    assert.ok(!notification.includes('SENSITIVE_TEST_SENTINEL'));
    assert.match(h.component().render(120).join('\n'), /unavailable/);
  } finally { h.shutdown(); }
});
