export interface SearchResult { title: string; url: string; snippet: string; }

class SearchFailure extends Error {}
const MAX_BODY = 1024 * 1024;
const TIMEOUT_MS = 30_000;

async function readBody(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new SearchFailure('Brave Search malformed response: missing body.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    signal.throwIfAborted();
    while (true) {
      const {done, value} = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY) throw new SearchFailure('Brave Search response exceeds 1 MiB.');
      chunks.push(value);
    }
    const all = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(all);
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function braveSearch(query: string, count: number, apiKey: string, caller?: AbortSignal) {
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  const signal = caller ? AbortSignal.any([caller, deadline]) : deadline;
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('result_filter', 'web');
  url.searchParams.set('text_decorations', 'false');
  try {
    signal.throwIfAborted();
    const response = await fetch(url, {
      headers: {'Accept': 'application/json', 'X-Subscription-Token': apiKey},
      redirect: 'error', signal,
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      if (response.status === 401 || response.status === 403) throw new SearchFailure(`Brave Search invalid credentials or plan access, HTTP ${response.status}. Stop and check configuration privately.`);
      if (response.status === 429) throw new SearchFailure('Brave Search rate or quota limit, HTTP 429. Stop; no automatic retry.');
      throw new SearchFailure(`Brave Search provider failure, HTTP ${response.status}. No automatic retry.`);
    }
    const body = await readBody(response, signal);
    let data: unknown;
    try { data = JSON.parse(body); } catch { throw new SearchFailure('Brave Search malformed JSON response.'); }
    if (!object(data) || (data.web !== undefined && !object(data.web))) throw new SearchFailure('Brave Search malformed response shape.');
    const web = data.web as Record<string, unknown> | undefined;
    const entries = web?.results;
    if (entries !== undefined && !Array.isArray(entries)) throw new SearchFailure('Brave Search malformed results.');
    let truncated = false;
    const clean = (value: string, max: number) => {
      // Do not allow even a reflected subscription token into tool results.
      const redacted = value.replaceAll(apiKey, '[redacted]');
      if (redacted.length <= max) return redacted;
      truncated = true;
      return redacted.slice(0, max - 15) + ' [truncated]';
    };
    const results: SearchResult[] = [];
    for (const entry of (entries ?? []) as unknown[]) {
      if (!object(entry) || typeof entry.title !== 'string' || typeof entry.url !== 'string' || (entry.description !== undefined && typeof entry.description !== 'string')) {
        throw new SearchFailure('Brave Search malformed result entry.');
      }
      results.push({title: clean(entry.title, 2000), url: clean(entry.url, 4000), snippet: clean((entry.description ?? '') as string, 4000).replace(/\n/g, ' ')});
    }
    signal.throwIfAborted();
    return {results: results.slice(0, count), truncated};
  } catch (error) {
    if (caller?.aborted) throw new Error('Brave Search cancelled by caller.');
    if (deadline.aborted) throw new Error('Brave Search timed out after 30 seconds.');
    if (error instanceof SearchFailure) throw error;
    // Provider bodies and arbitrary fetch exceptions can contain credentials.
    throw new Error('Brave Search network failure or refused redirect. No automatic retry.');
  }
}
