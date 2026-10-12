import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { getEventListeners } from 'node:events';
import { pathToFileURL } from 'node:url';
const { getDocumentProxy } = await import(pathToFileURL(extensions + 'web-fetch/node_modules/unpdf/dist/index.mjs'));
import { themeModule, tui } from './helpers.mjs';
const { getThemeByName } = themeModule;
const { visibleWidth } = tui;
import { loadTool, extensions, withFetch, text, checkRender, streamingResponse, abortingFetch, theme } from './helpers.mjs';

const tool = await loadTool(`${extensions}web-fetch`, 'web_fetch');
const source = 'https://example.com/article';
const MiB = 1024 * 1024;
const tinyPDF = await readFile(new URL('./fixtures/tiny.pdf', import.meta.url));
const manyPDF = await readFile(new URL('./fixtures/pages-101.pdf', import.meta.url));
const execute = (url = source, signal) => tool.execute('fetch-mock', {url}, signal);
const plain = (body = '# Fixture\n\nPublic text.', headers = {}) => new Response(body, {headers: {'content-type': 'text/plain', ...headers}});
const jina = () => plain('Title: Reader\n\nMarkdown Content:\n# Reader fixture\n\n' + 'Third-party public content. '.repeat(30));
const redirect = location => new Response(null, {status: 302, headers: {location}});
const failedPage = () => new Response('<html><body><script>run()</script><script>run()</script><script>run()</script><script>run()</script></body></html>', {headers: {'content-type': 'text/html'}});

async function terminal(url, mock, pattern, signal) {
  let calls = 0;
  await withFetch(async (requested, options) => {
    calls++;
    assert.ok(!requested.startsWith('https://r.jina.ai/'), 'terminal direct failure must not invoke Jina');
    return mock(requested, options);
  }, () => assert.rejects(() => execute(url, signal), pattern));
  return calls;
}

// Fire a fake AbortSignal.timeout deterministically. No timer state escapes the test.
async function withDeadline(run) {
  const original = AbortSignal.timeout;
  const timeout = new AbortController();
  let count = 0;
  AbortSignal.timeout = ms => {
    assert.equal(ms, 30_000);
    count++;
    return timeout.signal;
  };
  try {
    await run(timeout, () => count);
    assert.equal(getEventListeners(timeout.signal, 'abort').length, 0, 'deadline listeners removed');
  } finally { AbortSignal.timeout = original; }
}

await test('web_fetch extracts plain text and always reports source, including untitled content', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, source);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    return plain('Untitled public content.');
  }, async () => {
    const result = await execute();
    assert.match(text(result), /Source: https:\/\/example.com\/article/);
    assert.match(text(result), /Untitled public content/);
    assert.equal(result.details.fallback, false);
    assert.equal(result.details.finalUrl, source);
    assert.equal(result.details.chars, text(result).length);
    checkRender(tool, {url: source}, result);
  });
});

await test('web_fetch retains Readability/Turndown HTML extraction', async () => {
  const html = '<html><head><title>HTML fixture</title></head><body><nav>Navigation</nav><article><h1>HTML fixture</h1><p>' +
    'Readable article evidence and useful context. '.repeat(35) + '</p><h2>Section</h2><p><strong>Bold evidence</strong> and <a href="https://example.com/reference">Reference</a>.</p></article></body></html>';
  let calls = 0;
  await withFetch(async () => { calls++; return new Response(html, {headers: {'content-type': 'text/html'}}); }, async () => {
    const result = await execute();
    assert.match(text(result), /# HTML fixture/);
    assert.match(text(result), /## Section/);
    assert.match(text(result), /\*\*Bold evidence\*\*/);
    assert.match(text(result), /\[Reference\]\(https:\/\/example.com\/reference\)/);
    assert.equal(result.details.fallback, false);
    assert.equal(calls, 1);
  });
});

await test('web_fetch retains Next RSC extraction', async () => {
  const tree = ['$', 'article', null, {children: [
    ['$', 'h1', null, {children: 'RSC evidence'}],
    ['$', 'p', null, {children: 'Server component facts. '.repeat(35)}],
    ['$', 'pre', null, {children: ['$', 'code', null, {children: 'const value = 1;'}]}],
  ]}];
  const payload = `23:${JSON.stringify(tree)}\n`;
  const html = `<html><head><title>RSC title | Docs</title></head><body><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></body></html>`;
  let calls = 0;
  await withFetch(async () => { calls++; return new Response(html, {headers: {'content-type': 'text/html'}}); }, async () => {
    const result = await execute();
    assert.match(text(result), /RSC title/);
    assert.match(text(result), /# RSC evidence/);
    assert.match(text(result), /```\nconst value = 1;/);
    assert.equal(result.details.fallback, false);
    assert.equal(calls, 1);
  });
});

await test('web_fetch extracts a real small PDF and limits a real 101-page PDF', async () => {
  for (const [bytes, url, many] of [[tinyPDF, source, false], [manyPDF, 'https://example.com/book.pdf', true]]) {
    let calls = 0;
    await withFetch(async () => { calls++; return new Response(bytes, {headers: {'content-type': many ? 'application/octet-stream' : 'application/pdf'}}); }, async () => {
      const result = await execute(url);
      assert.match(text(result), /# Tiny fixture/);
      assert.match(text(result), /> Author: Local test/);
      assert.match(text(result), /PDF fixture page 001/);
      if (many) {
        assert.match(text(result), /PDF fixture page 100/);
        assert.doesNotMatch(text(result), /PDF fixture page 101/);
        assert.match(text(result), /extracted first 100/);
        assert.match(text(result), /Truncated: Only the first 100 PDF pages/);
        assert.equal(result.details.truncated, true);
      } else assert.equal(result.details.truncated, false);
      assert.equal(result.details.fallback, false);
      assert.equal(calls, 1);
      assert.ok(text(result).length <= 30_000);
    });
  }
});

await test('web_fetch destroys real PDF documents on success, extraction failure, timeout and cancellation', async () => {
  const seed = await getDocumentProxy(new Uint8Array(tinyPDF));
  const prototype = Object.getPrototypeOf(seed);
  await seed.destroy();
  const originalDestroy = prototype.destroy;
  const originalMetadata = prototype.getMetadata;
  const originalPage = prototype.getPage;
  for (const mode of ['success', 'metadata-failure', 'page-failure', 'cancel', 'timeout']) {
    const run = async deadline => {
      const caller = new AbortController();
      let destroyed = 0;
      let calls = 0;
      let operationSignal;
      prototype.destroy = function () { destroyed++; return originalDestroy.call(this); };
      prototype.getMetadata = function () {
        if (mode === 'metadata-failure') return Promise.reject(new Error('SECRET_MOCK_PDF_ERROR'));
        return originalMetadata.call(this);
      };
      prototype.getPage = function (page) {
        if (mode === 'page-failure') return Promise.reject(new Error('SECRET_MOCK_PAGE_ERROR'));
        if (mode === 'cancel' || mode === 'timeout') {
          if (mode === 'cancel') caller.abort();
          else deadline.abort();
          return new Promise(() => {});
        }
        return originalPage.call(this, page);
      };
      try {
        await withFetch(async (url, options) => {
          calls++;
          operationSignal = options.signal;
          return url === source ? new Response(tinyPDF, {headers: {'content-type': 'application/pdf'}}) : jina();
        }, async () => {
          if (mode === 'cancel' || mode === 'timeout') {
            await assert.rejects(() => execute(source, caller.signal), mode === 'cancel' ? /Caller cancellation/ : /Fetch timeout/);
            assert.equal(calls, 1, 'PDF abort/timeout must not trigger fallback');
          } else {
            const result = await execute(source, caller.signal);
            assert.equal(result.details.fallback, mode !== 'success');
            assert.equal(calls, mode === 'success' ? 1 : 2);
            assert.doesNotMatch(text(result), /SECRET_MOCK/);
          }
          assert.equal(destroyed, 1, `${mode} destroys the document once`);
          assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
          assert.equal(getEventListeners(operationSignal, 'abort').length, 0);
        });
      } finally {
        prototype.destroy = originalDestroy;
        prototype.getMetadata = originalMetadata;
        prototype.getPage = originalPage;
      }
    };
    if (mode === 'timeout') await withDeadline(deadline => run(deadline));
    else await run();
  }
});

await test('web_fetch Jina fallback succeeds, discloses third-party use and preserves final direct URL', async () => {
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    if (url === source) return redirect('/dynamic');
    if (url === 'https://example.com/dynamic') return failedPage();
    assert.equal(url, `https://r.jina.ai/${source}`);
    assert.equal(options.headers.Accept, 'text/markdown');
    return jina();
  }, async () => {
    const result = await execute();
    assert.equal(calls.length, 3);
    assert.equal(result.details.fallback, true);
    assert.equal(result.details.url, source);
    assert.equal(result.details.finalUrl, 'https://example.com/dynamic');
    assert.equal(result.details.jinaFinalUrl, `https://r.jina.ai/${source}`);
    assert.match(text(result), /Final URL: https:\/\/example.com\/dynamic/);
    assert.match(text(result), /Fallback: Jina Reader, third-party extracted content/);
    assert.match(text(result), /requested public URL was sent to r.jina.ai/);
    checkRender(tool, {url: source}, result);
  });
});

await test('web_fetch has one fallback attempt for extraction, network and ordinary HTTP failures', async () => {
  for (const direct of [
    () => failedPage(),
    () => new Response('private mock provider error', {status: 500}),
    () => { throw new Error('arbitrary-secret-bearing network text'); },
    () => new Response('invalid PDF', {headers: {'content-type': 'application/pdf'}}),
  ]) {
    let calls = 0;
    await withFetch(async url => {
      calls++;
      if (url === source) return direct();
      assert.equal(url, `https://r.jina.ai/${source}`);
      return jina();
    }, async () => {
      const result = await execute();
      assert.equal(result.details.fallback, true);
      assert.equal(calls, 2);
      assert.doesNotMatch(text(result), /arbitrary-secret|private mock/);
    });
  }
});

await test('web_fetch failed Jina fallback is explicit without leaking arbitrary response/errors', async () => {
  for (const fallback of [
    () => plain('Missing Markdown Content marker'),
    () => plain('Markdown Content: Loading...'),
    () => plain('Markdown Content: Please enable JavaScript'),
    () => new Response('private mock body', {status: 500}),
    () => { throw new Error('arbitrary-secret-bearing error'); },
  ]) {
    let calls = 0;
    await withFetch(async url => { calls++; return url === source ? failedPage() : fallback(); }, async () => {
      await assert.rejects(() => execute(), error => {
        assert.match(error.message, /Jina Reader fallback failed/);
        assert.doesNotMatch(error.message, /private mock|arbitrary-secret/);
        return true;
      });
      assert.equal(calls, 2);
    });
  }
});

await test('web_fetch rejects the exact literal host ranges, normalized variants and invalid URLs before fetch', async () => {
  const blocked = [
    'not a URL', 'file:///tmp/file', 'ftp://example.com/file', 'https://user:pass@example.com/',
    'http://LOCALHOST./', 'https://x.localhost./', 'http://box.local./', 'http://intranet/',
    'http://0.1.2.3/', 'http://10.0.0.1/', 'http://100.64.0.1/', 'http://100.127.255.255/',
    'http://127.0.0.1/', 'http://169.254.0.1/', 'http://172.16.0.1/', 'http://172.31.255.255/',
    'http://192.0.0.1/', 'http://192.0.2.1/', 'http://192.168.0.1/', 'http://198.18.0.1/',
    'http://198.19.255.255/', 'http://198.51.100.1/', 'http://203.0.113.1/', 'http://224.0.0.1/', 'http://255.255.255.255/',
    'http://127.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://127.0.0.1./',
    'http://[::]/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:a00:1]/',
    'http://[fc00::1]/', 'http://[fdff::1]/', 'http://[fe80::1]/', 'http://[febf::1]/',
    'http://[fec0::1]/', 'http://[feff::1]/', 'http://[ff00::1]/', 'http://[2001:db8::1]/',
  ];
  for (const url of blocked) {
    assert.equal(await terminal(url, () => { throw new Error('must not fetch'); }, /Invalid URL|URL rejected/), 0, url);
  }
  // IPv4-mapped addresses must apply every IPv4 rule, not just loopback.
  for (const host of ['0.1.2.3', '10.0.0.1', '100.64.0.1', '169.254.0.1', '172.16.0.1', '192.0.0.1', '192.0.2.1', '192.168.0.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1']) {
    assert.equal(await terminal(`http://[::ffff:${host}]/`, () => { throw new Error('must not fetch'); }, /URL rejected/), 0);
  }
});

await test('web_fetch allows public boundary neighbors, strips fragments and normalizes hosts', async () => {
  const allowed = ['100.63.255.255', '100.128.0.0', '169.253.255.255', '172.15.255.255', '172.32.0.0', '192.0.1.1', '192.0.3.1', '198.17.255.255', '198.20.0.0', '198.51.101.1', '203.0.114.1', '223.255.255.255', '[::ffff:8.8.8.8]', '[2001:4860:4860::8888]', '[fe7f::1]'];
  for (const host of allowed) {
    await withFetch(async url => { assert.equal(url, new URL(`https://${host}/`).href); return plain(); }, async () => {
      assert.equal((await execute(`https://${host}/#fragment`)).details.fallback, false);
    });
  }
  await withFetch(async url => {
    assert.equal(url, 'https://example.com/article');
    return plain();
  }, () => execute('https://EXAMPLE.COM./article#fragment'));
});

await test('web_fetch validates redirect destinations before direct or Jina requests', async () => {
  for (const destination of ['http://127.1/', 'http://[::ffff:10.0.0.1]/', 'https://user:pass@example.com/', 'file:///tmp/file', 'http://box.local./']) {
    assert.equal(await terminal(source, () => redirect(destination), /URL rejected/), 1);
    let calls = 0;
    await withFetch(async url => {
      calls++;
      if (url === source) return failedPage();
      assert.equal(url, `https://r.jina.ai/${source}`);
      return redirect(destination);
    }, async () => {
      await assert.rejects(() => execute(), /URL rejected/);
      assert.equal(calls, 2);
    });
  }
  assert.equal(await terminal(source, () => new Response(null, {status: 302}), /missing a destination/), 1);
});

await test('web_fetch allows five redirect hops and rejects the sixth without fallback for both routes', async () => {
  for (const fallback of [false, true]) {
    for (const hops of [5, 6]) {
      const calls = [];
      await withFetch(async (url, options) => {
        assert.equal(options.redirect, 'manual');
        calls.push(url);
        if (fallback && url === source) return failedPage();
        const routeCalls = calls.length - (fallback ? 1 : 0);
        if (routeCalls <= hops) return redirect(`/hop-${routeCalls}`);
        return fallback ? jina() : plain();
      }, async () => {
        if (hops === 6) await assert.rejects(() => execute(), /Redirect limit exceeded/);
        else {
          const result = await execute();
          assert.equal(result.details.fallback, fallback);
          assert.equal(fallback ? result.details.jinaFinalUrl : result.details.finalUrl,
            `https://${fallback ? 'r.jina.ai' : 'example.com'}/hop-5`);
          if (!fallback) assert.match(text(result), /Final URL: https:\/\/example.com\/hop-5/);
        }
        assert.equal(calls.length, 6 + (fallback ? 1 : 0));
        if (!fallback) assert.ok(calls.every(url => !url.startsWith('https://r.jina.ai/')));
      });
    }
  }
});

await test('web_fetch auth/rate failures and unsupported types are terminal without raw error bodies', async () => {
  for (const status of [401, 403, 429]) {
    assert.equal(await terminal(source, () => new Response('SECRET_MOCK_BODY', {status}), new RegExp(`HTTP ${status}`)), 1);
    let calls = 0;
    await withFetch(async url => {
      calls++;
      return url === source ? failedPage() : new Response('SECRET_MOCK_BODY', {status});
    }, async () => {
      await assert.rejects(() => execute(), error => {
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.doesNotMatch(error.message, /SECRET_MOCK_BODY/);
        return true;
      });
      assert.equal(calls, 2);
    });
  }
  for (const type of ['image/png', 'audio/mpeg', 'video/mp4', 'application/zip', 'application/octet-stream']) {
    assert.equal(await terminal(source, () => new Response('binary', {headers: {'content-type': type}}), /Unsupported content type/), 1);
  }
});

await test('web_fetch enforces streamed text/HTML/PDF and Jina caps without Content-Length', async () => {
  for (const [type, limit] of [['text/plain', 5 * MiB], ['text/html', 5 * MiB], ['application/pdf', 20 * MiB]]) {
    assert.equal(await terminal(source, () => streamingResponse(limit + 1, type), /Response too large/), 1);
    assert.equal(await terminal(source, () => new Response('short', {headers: {'content-type': type, 'content-length': String(limit + 1)}}), /Response too large/), 1);
  }
  // A dishonest short header does not exempt a body from the streamed cap.
  assert.equal(await terminal(source, () => {
    const response = streamingResponse(5 * MiB + 1);
    response.headers.set('content-length', '1');
    return response;
  }, /Response too large/), 1);
  let calls = 0;
  await withFetch(async url => { calls++; return url === source ? failedPage() : streamingResponse(5 * MiB + 1); }, async () => {
    await assert.rejects(() => execute(), /Response too large/);
    assert.equal(calls, 2);
  });
  await withFetch(async () => streamingResponse(5 * MiB), async () => {
    const result = await execute();
    assert.equal(result.details.truncated, true);
    assert.equal(text(result).length, 30_000);
  });
  let cancelled = false;
  assert.equal(await terminal(source, () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(MiB)); },
    cancel() { cancelled = true; },
  }), {headers: {'content-type': 'text/plain'}}), /Response too large/), 1);
  assert.equal(cancelled, true, 'oversized stream must be cancelled');
});

await test('web_fetch cancellation is terminal before request, during fetch, body, PDF and fallback', async () => {
  const already = new AbortController();
  already.abort();
  assert.equal(await terminal(source, () => { throw new Error('must not fetch'); }, /Caller cancellation/, already.signal), 0);

  const during = new AbortController();
  assert.equal(await terminal(source, (url, options) => {
    const pending = abortingFetch(url, options);
    during.abort();
    return pending;
  }, /Caller cancellation/, during.signal), 1);

  const bodyAbort = new AbortController();
  let bodyCancelled = false;
  assert.equal(await terminal(source, () => new Response(new ReadableStream({
    pull() { bodyAbort.abort(); },
    cancel() { bodyCancelled = true; },
  }), {headers: {'content-type': 'text/plain'}}), /Caller cancellation/, bodyAbort.signal), 1);
  assert.equal(bodyCancelled, true);

  const pdfAbort = new AbortController();
  assert.equal(await terminal(source, () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(tinyPDF); },
    pull(controller) { controller.close(); queueMicrotask(() => pdfAbort.abort()); },
  }), {headers: {'content-type': 'application/pdf'}}), /Caller cancellation/, pdfAbort.signal), 1);

  const fallbackAbort = new AbortController();
  let calls = 0;
  await withFetch(async (url, options) => {
    calls++;
    if (url === source) return failedPage();
    const pending = abortingFetch(url, options);
    fallbackAbort.abort();
    return pending;
  }, async () => {
    await assert.rejects(() => execute(source, fallbackAbort.signal), /Caller cancellation/);
    assert.equal(calls, 2);
  });
});

await test('web_fetch has one shared deadline across direct request, body and fallback', async () => {
  await withDeadline(async (deadline, count) => {
    assert.equal(await terminal(source, (url, options) => {
      const pending = abortingFetch(url, options);
      deadline.abort();
      return pending;
    }, /Fetch timeout/), 1);
    assert.equal(count(), 1);
  });
  await withDeadline(async (deadline, count) => {
    let cancelled = false;
    assert.equal(await terminal(source, () => new Response(new ReadableStream({
      pull() { deadline.abort(); }, cancel() { cancelled = true; },
    })), /Fetch timeout/), 1);
    assert.equal(cancelled, true);
    assert.equal(count(), 1);
  });
  await withDeadline(async (deadline, count) => {
    let calls = 0;
    let directSignal;
    await withFetch(async (url, options) => {
      calls++;
      if (url === source) { directSignal = options.signal; return failedPage(); }
      assert.equal(options.signal, directSignal, 'fallback shares the direct deadline signal');
      const pending = abortingFetch(url, options);
      deadline.abort();
      return pending;
    }, async () => {
      await assert.rejects(() => execute(), /Fetch timeout/);
      assert.equal(calls, 2);
      assert.equal(count(), 1);
    });
  });
});

await test('web_fetch bounds total output, metadata and notices and renders narrow/partial/error states', async () => {
  await withFetch(async () => plain('# Output fixture\n\n' + 'x'.repeat(35_000)), async () => {
    const result = await execute();
    assert.equal(text(result).length, 30_000);
    assert.equal(result.details.truncated, true);
    assert.match(text(result), /Source: https:\/\/example.com\/article/);
    assert.match(text(result), /Truncated: output limited to 30,000 characters/);
    checkRender(tool, {url: source}, result);
    checkRender(tool, {}, result);
    const hostTheme = getThemeByName('dark');
    assert.ok(hostTheme, 'installed Pi built-in dark theme');
    const components = [
      tool.renderCall({url: source + '/界'.repeat(40)}, hostTheme, {}),
      tool.renderCall({}, hostTheme, {}),
      tool.renderResult(result, {expanded: true, isPartial: false}, hostTheme, {isError: false}),
      tool.renderResult(result, {expanded: false, isPartial: false}, hostTheme, {isError: false}),
      tool.renderResult(result, {expanded: false, isPartial: true}, hostTheme, {isError: false}),
      tool.renderResult({content: [{type: 'text', text: 'Long failure 界 '.repeat(100)}]},
        {expanded: false, isPartial: false}, hostTheme, {isError: true}),
    ];
    for (const component of components) {
      for (const width of [20, 40, 80]) {
        for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width, `host-theme render exceeds ${width} columns`);
      }
      component.invalidate();
    }
    for (const [partial, error] of [[true, false], [false, true]]) {
      const component = tool.renderResult({content: [{type: 'text', text: 'Long failure '.repeat(100)}], details: undefined},
        {expanded: false, isPartial: partial}, theme, {isError: error});
      assert.ok(component.render(20).length > 0);
    }
  });
  const longURL = `https://example.com/${'path'.repeat(4000)}`;
  await withFetch(async () => plain(`# ${'title'.repeat(1000)}\n\n` + 'x'.repeat(40_000)), async () => {
    const result = await execute(longURL);
    assert.ok(text(result).length <= 30_000);
    assert.match(text(result), /source\/title metadata was shortened/);
    assert.match(text(result), /Source: https:\/\/example.com/);
    assert.equal(result.details.url, longURL);
    assert.equal(result.details.truncated, true);
  });
  let calls = 0;
  await withFetch(async url => {
    calls++;
    return url === source ? failedPage() : plain('Markdown Content:\n# Reader fixture\n\n' + 'x'.repeat(40_000));
  }, async () => {
    const result = await execute();
    assert.equal(text(result).length, 30_000);
    assert.match(text(result), /Fallback: Jina Reader/);
    assert.match(text(result), /Truncated: output limited/);
    assert.equal(result.details.fallback, true);
    assert.equal(calls, 2);
  });
});
