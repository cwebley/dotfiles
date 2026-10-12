import assert from 'node:assert/strict';
import { loadTool, extensions, withFetch, withFakeKey, text, checkRender, streamingResponse, abortingFetch } from './helpers.mjs';
const tool = await loadTool(extensions + 'web-search/index.ts', 'web_search');
const execute = (args, signal) => tool.execute('search-test', args, signal);
const json = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});
let tests = 0;
async function test(name, fn) { await fn(); tests++; console.log(`PASS: search ${name}`); }
await withFakeKey(async () => {
  await test('normalization, headers, mapping, rendering', () => withFetch(async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin + url.pathname, 'https://api.search.brave.com/res/v1/web/search');
    assert.equal(url.searchParams.get('q'), 'Pi tool access "resume restrictions" -cookies -"private docs" site:github.com');
    assert.equal(url.searchParams.get('count'), '5');
    assert.equal(url.searchParams.get('result_filter'), 'web');
    assert.equal(url.searchParams.get('text_decorations'), 'false');
    assert.equal(options.headers['X-Subscription-Token'], 'FAKE_BRAVE_TEST_SENTINEL');
    assert.equal(options.redirect, 'error');
    assert.ok(!String(input).includes('FAKE_BRAVE_TEST_SENTINEL'));
    return json({web: {results: [{title: 'Original source', url: 'https://github.com/example', description: 'first\nsecond'}, {title: 'No snippet', url: 'https://example.com'}]}});
  }, async () => {
    const args = {query: '  Pi  tool access ', exactPhrases: [' "resume   restrictions" ', ' '], excludeTerms: [' cookies ', 'private docs'], site: 'site:https://github.com/path/'};
    const result = await execute(args);
    assert.match(text(result), /first second/);
    assert.match(text(result), /No snippet/);
    assert.equal(result.details.resultCount, 2);
    checkRender(tool, args, result);
  }));
  await test('exact phrase alone', () => withFetch(async input => {
    assert.equal(new URL(input).searchParams.get('q'), '"exact phrase"'); return json({web: {results: []}});
  }, () => execute({exactPhrases: ['exact phrase']})));
  await test('query/count bounds do not request', () => withFetch(() => { throw new Error('unexpected request'); }, async () => {
    for (const count of [0, 11, 1.5, NaN]) await assert.rejects(execute({query: 'test', count}), /integer/);
    await assert.rejects(execute({query: ' ', exactPhrases: [' ']}), /required/);
    await assert.rejects(execute({query: 'x'.repeat(601)}), /600/);
    await assert.rejects(execute({query: Array(76).fill('a').join(' ')}), /75/);
  }));
  await test('count limits and empty results', async () => {
    for (const count of [1, 10]) await withFetch(async input => {
      assert.equal(new URL(input).searchParams.get('count'), String(count));
      return json({web:{results: Array.from({length: 12}, (_,i) => ({title: String(i), url: 'https://example.com/' + i}))}});
    }, async () => assert.equal((await execute({query:'q', count})).details.resultCount, count));
    for (const body of [{}, {query:{}}, {web:{}}, {web:{results:[]}}]) await withFetch(async () => json(body), async () => assert.equal(text(await execute({query:'q'})), 'No results found.'));
  });
  await test('malformed JSON and shapes including entries past count', async () => {
    await withFetch(async () => new Response('{broken'), () => assert.rejects(execute({query:'q'}), /malformed JSON/));
    for (const value of [null, [], {web:null}, {web:[]}, {web:{results:{}}}, {web:{results:[null]}}, {web:{results:[{title:1,url:'https://example.com'}]}}, {web:{results:[{title:'a',url:'b',description:7}]}}, {web:{results:[{title:'ok',url:'ok'}, {title:'bad',url:9}]}}]) {
      await withFetch(async () => json(value), () => assert.rejects(execute({query:'q',count:1}), /malformed/));
    }
  });
  await test('HTTP failures have no provider body or token and no retries', async () => {
    for (const [status, pattern] of [[401,/invalid credentials/],[403,/invalid credentials/],[429,/rate or quota/],[500,/provider failure/]]) {
      let calls = 0;
      await withFetch(async () => { calls++; return new Response('FAKE_BRAVE_TEST_SENTINEL raw secret body', {status}); }, async () => {
        await assert.rejects(execute({query:'q'}), error => pattern.test(error.message) && !error.message.includes('FAKE_BRAVE_TEST_SENTINEL') && !error.message.includes('raw secret'));
        assert.equal(calls, 1);
      });
    }
  });
  await test('network failure cannot expose fetch exception', () => withFetch(async () => {throw new Error('FAKE_BRAVE_TEST_SENTINEL');}, () => assert.rejects(execute({query:'q'}), error => /network failure/.test(error.message) && !error.message.includes('FAKE_BRAVE_TEST_SENTINEL'))));
  await test('caller cancellation before and during request', () => withFetch(abortingFetch, async () => {
    const before = new AbortController(); before.abort();
    await assert.rejects(execute({query:'q'}, before.signal), /cancelled by caller/);
    const active = new AbortController(); const task = execute({query:'q'}, active.signal); active.abort();
    await assert.rejects(task, /cancelled by caller/);
  }));
  await test('timeout covers request and body', async () => {
    const original = AbortSignal.timeout;
    AbortSignal.timeout = () => original(5);
    const keepAlive = setInterval(() => {}, 100);
    try {
      await withFetch(abortingFetch, () => assert.rejects(execute({query:'q'}), /timed out/));
      await withFetch(async () => new Response(new ReadableStream({start(){}})), () => assert.rejects(execute({query:'q'}), /timed out/));
    } finally { clearInterval(keepAlive); AbortSignal.timeout = original; }
  });
  await test('streamed body cap without Content-Length', () => withFetch(async () => streamingResponse(1024 * 1024 + 1, 'application/json'), () => assert.rejects(execute({query:'q'}), /exceeds 1 MiB/)));
  await test('bounded fields, truncation notice, reflected token redaction', () => withFetch(async () => json({web:{results:[{title:'x'.repeat(3000),url:'https://example.com/'+'x'.repeat(5000),description:'FAKE_BRAVE_TEST_SENTINEL'+'x'.repeat(5000)}]}}), async () => {
    const result = await execute({query:'q'});
    assert.equal(result.details.truncated, true);
    assert.match(text(result), /Truncated/);
    assert.ok(text(result).length < 10300);
    assert.ok(!JSON.stringify(result).includes('FAKE_BRAVE_TEST_SENTINEL'));
  }));
});
await test('missing inherited key does not request', () => withFakeKey(() => withFetch(() => {throw new Error('unexpected request');}, () => assert.rejects(execute({query:'q'}), /Missing BRAVE_SEARCH_API_KEY/)), null));
console.log(`PASS: ${tests} search test groups`);
