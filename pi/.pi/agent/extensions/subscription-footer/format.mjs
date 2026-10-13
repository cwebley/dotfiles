// Pure formatting helpers. Quota snapshots contain no credentials or account identifiers.
export function compact(n) {
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}

export function duration(seconds) {
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function cachePercent(totals) {
  const totalInput = totals.input + totals.cacheRead + totals.cacheWrite;
  return totalInput > 0 ? 100 * totals.cacheRead / totalInput : undefined;
}

export function quotaText(snapshot, { now = Date.now(), failed = false, loading = false, compact = false } = {}) {
  if (!snapshot) {
    if (compact) return loading ? 'week …' : 'week unavailable';
    return loading ? 'OpenAI week: checking' : 'OpenAI week: unavailable · /plan-usage';
  }
  const windows = [['week', snapshot.weekly], ['5h', snapshot.fiveHour]].filter(([, w]) => w);
  const parts = windows.map(([name, w]) => {
    const remaining = 100 - w.usedPercent;
    const reset = w.resetAt * 1000;
    if (compact) return `${name} ${Number(remaining.toFixed(1))}% ${reset <= now ? 'reset due' : duration((reset - now) / 1000).replaceAll(' ', '')}`;
    return `${name}: ${Number(remaining.toFixed(1))}% left · ${reset <= now ? 'reset due, refreshing' : `resets in ${duration((reset - now) / 1000)}`}`;
  });
  const age = Math.max(0, now - snapshot.observedAt);
  const expired = windows.some(([, w]) => w.resetAt * 1000 <= now);
  if (failed || expired || age >= 10 * 60 * 1000) parts.push(compact ? `stale ${duration(age / 1000).replaceAll(' ', '')}` : `stale, updated ${duration(age / 1000)} ago`);
  return `${compact ? '' : 'OpenAI '}${parts.join(' · ')}`;
}

export function usageTotals(entries) {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  for (const entry of entries) {
    const message = entry.type === 'message' ? entry.message : undefined;
    const usage = message?.role === 'assistant' || message?.role === 'toolResult'
      ? message.usage
      : ['usage', 'compaction', 'branch_summary'].includes(entry.type) ? entry.usage : undefined;
    if (!usage) continue;
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) totals[key] += usage[key] ?? 0;
    totals.cost += usage.cost?.total ?? 0;
  }
  return totals;
}

export function isSubscription(ctx) {
  const model = ctx.model;
  if (!model) return false;
  // Kimi Coding is subscription-backed even with API-key authentication.
  if (model.provider === 'kimi-coding') return true;
  return ctx.modelRegistry.isUsingOAuth(model)
    && ctx.modelRegistry.getProvider(model.provider)?.auth?.oauth?.isSubscription === true;
}

export function showOpenAIQuota(ctx) {
  return ['openai', 'openai-codex'].includes(ctx.model?.provider) && isSubscription(ctx);
}
