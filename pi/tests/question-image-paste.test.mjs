import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Managed Pi loader and real Editor, but a fake native clipboard. No clipboard access.
const root = join(homedir(), '.pi/agent/install');
const version = (await readFile(join(root, 'current-version'), 'utf8')).trim();
assert.match(version, /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
const modules = join(root, 'releases', version, 'node_modules');
const { createJiti } = await import(pathToFileURL(join(modules, 'jiti/lib/jiti.mjs')).href);
const temp = await mkdtemp(join(tmpdir(), 'pi-question-image-test-'));
const key = { paste: '\x16', superPaste: '\x1b[118;9u', enter: '\r', esc: '\x1b', down: '\x1b[B', up: '\x1b[A', space: ' ' };
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 42]);
const b64 = Buffer.from(png).toString('base64');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const theme = { fg: (_color, text) => text, bold: text => text };
let tests = 0;
try {
  const tuiStub = join(temp, 'tui.mjs');
  const agentStub = join(temp, 'agent.mjs');
  await writeFile(tuiStub, `
    export * from ${JSON.stringify(pathToFileURL(join(modules, '@earendil-works/pi-tui/dist/index.js')).href)};
    export const getNativeClipboard = () => globalThis.__questionClipboard;
  `);
  await writeFile(agentStub, `export const convertToPng = (...args) => globalThis.__questionConvert(...args);`);
  const jiti = createJiti(import.meta.url, { alias: {
    '@earendil-works/pi-tui': tuiStub,
    '@earendil-works/pi-coding-agent': agentStub,
    typebox: join(modules, 'typebox/build/index.mjs'),
  } });
  const { default: extension } = await jiti.import(fileURLToPath(new URL('../.pi/agent/extensions/ask-user-question.ts', import.meta.url)));
  let tool;
  extension({ registerTool: value => { tool = value; } });
  let imageReads, textReads;
  function clipboard({ image = png, text = null, getImage, getText } = {}) {
    imageReads = 0; textReads = 0;
    globalThis.__questionClipboard = {
      getImage: async () => { imageReads++; return getImage ? getImage() : image; },
      getText: async () => { textReads++; return getText ? getText() : text; },
    };
    globalThis.__questionConvert = async () => null;
  }
  const opts = [{ label: ' Alpha ', value: ' a ', description: 'First' }, { label: 'Beta' }];
  async function open(params = {}, controller = new AbortController(), mapping = [key.paste, key.superPaste]) {
    let component, renders = 0, doneCalls = 0, settled = false;
    const ready = deferred();
    const tui = { terminal: { rows: 40, columns: 100 }, requestRender: () => { renders++; } };
    const kb = { matches: (data, action) => action === 'app.clipboard.pasteImage' ? mapping.includes(data) : action === 'tui.input.submit' && data === key.enter };
    const ctx = { mode: 'tui', hasUI: true, ui: { custom: factory => new Promise(resolve => {
      component = factory(tui, theme, kb, value => { doneCalls++; settled = true; resolve(value); });
      component.focused = true;
      ready.resolve();
    }) } };
    const result = tool.execute('test', { question: 'Which?', ...params }, controller.signal, undefined, ctx);
    await ready.promise;
    return {
      result, controller, ctx,
      input: (...data) => { for (const value of data) component.handleInput(value); },
      render: (width = 100) => component.render(width).join('\n'),
      get renders() { return renders; }, get doneCalls() { return doneCalls; }, get settled() { return settled; },
    };
  }
  async function paste(dialog, shortcut = key.paste) { dialog.input(shortcut); await tick(); }
  function images(result) { return result.content.filter(part => part.type === 'image'); }
  function redacted(result) {
    assert.ok(!JSON.stringify(result.details).includes(b64));
    assert.ok(!JSON.stringify(tool.renderResult(result, {}, theme).render(100)).includes(b64));
    assert.ok(!result.content.filter(part => part.type === 'text').some(part => part.text.includes(b64)));
  }
  async function check(name, fn) { await fn(); tests++; console.log(`PASS: ${name}`); }

  await check('free text, multiple images, image result propagation and redaction', async () => {
    clipboard(); const d = await open();
    d.input('Look here '); await paste(d); await paste(d, key.superPaste);
    assert.match(d.render(), /2 images attached/);
    assert.ok(!d.render().includes(b64));
    d.input(key.enter); const r = await d.result;
    assert.equal(r.details.status, 'answered');
    assert.equal(r.details.answers[0].value, 'Look here [question-image:1][question-image:2]');
    assert.deepEqual(images(r), [1, 2].map(() => ({ type: 'image', data: b64, mimeType: 'image/png' })));
    assert.equal(textReads, 0); redacted(r);
  });
  await check('image-only free text and single Other', async () => {
    for (const params of [{}, { options: opts }]) {
      clipboard(); const d = await open(params);
      if (params.options) d.input(key.down, key.down, key.enter);
      await paste(d); d.input(key.enter); const r = await d.result;
      assert.equal(images(r).length, 1);
      assert.equal(r.details.answers[0].type, params.options ? 'other' : 'text'); redacted(r);
    }
  });
  await check('multi Other saves, reopens, cancels edits and propagates only saved images', async () => {
    clipboard(); const d = await open({ options: opts, multiSelect: true });
    d.input(key.enter, key.down, key.down, key.enter, 'Saved ');
    await paste(d); d.input(key.enter);
    assert.match(d.render(), /Other.*Saved \[question-image:1\]/);
    d.input(key.enter); await paste(d); d.input(key.esc); // Discard second attachment.
    d.input(key.down, key.enter); const r = await d.result;
    assert.deepEqual(r.details.answers.map(a => a.type), ['option', 'other']);
    assert.equal(images(r).length, 1); redacted(r);
  });
  await check('multi image-only Other and deselection drops attachments', async () => {
    for (const deselect of [false, true]) {
      clipboard(); const d = await open({ options: opts, multiSelect: true });
      d.input(key.enter, key.down, key.down, key.enter);
      await paste(d); d.input(key.enter);
      if (deselect) d.input(key.space);
      d.input(key.down, key.enter); const r = await d.result;
      assert.equal(images(r).length, deselect ? 0 : 1);
      assert.equal(r.details.answers.length, deselect ? 1 : 2);
    }
  });
  await check('deleted tokens do not submit images, including edited multi Other', async () => {
    for (const multi of [false, true]) {
      clipboard(); const d = await open(multi ? { options: opts, multiSelect: true } : {});
      if (multi) d.input(key.down, key.down, key.enter);
      await paste(d);
      if (multi) d.input(key.enter, key.enter);
      // Use real Editor select-to-start deletion. Tokens are ordinary editable text.
      d.input('\x01', '\x0b', 'replacement', key.enter);
      if (multi) d.input(key.down, key.enter);
      const r = await d.result;
      assert.equal(images(r).length, 0);
      assert.equal(r.details.answers[0].label, 'replacement');
    }
  });
  await check('native text fallback, image failure fallback and bracketed paste preserve text', async () => {
    for (const failure of [false, true]) {
      clipboard({ image: null, text: 'native\ntext', getImage: failure ? () => { throw Error('PRIVATE'); } : undefined });
      const d = await open(); await paste(d);
      d.input('\x1b[200~ bracketed\ntext\x1b[201~', key.enter);
      const r = await d.result;
      assert.equal(r.details.answers[0].value, 'native\ntext bracketed\ntext');
      assert.equal(images(r).length, 0); assert.equal(textReads, 1);
    }
  });
  await check('Other text answers and native text fallback keep their existing labels', async () => {
    for (const multiSelect of [false, true]) {
      clipboard({ image: null, text: 'from clipboard' });
      const d = await open({ options: opts, multiSelect });
      d.input(key.down, key.down, key.enter, 'custom ');
      await paste(d); d.input(key.enter);
      if (multiSelect) d.input(key.down, key.enter);
      const r = await d.result;
      assert.deepEqual(r.details.answers, [{ type: 'other', label: 'custom from clipboard', value: 'custom from clipboard' }]);
      assert.equal(images(r).length, 0);
    }
  });
  await check('deleting one of several tokens submits only the remaining image', async () => {
    clipboard(); const d = await open(); await paste(d); await paste(d);
    for (let i = 0; i < '[question-image:2]'.length; i++) d.input('\x7f');
    assert.match(d.render(), /1 image attached/); d.input(key.enter);
    const r = await d.result; assert.equal(images(r).length, 1);
    assert.equal(r.details.answers[0].label, '[question-image:1]');
  });
  await check('pending read serializes CtrlV and blocks Enter without losing answer', async () => {
    const pending = deferred(); clipboard({ getImage: () => pending.promise });
    const d = await open(); d.input('keep', key.paste, key.paste, key.enter);
    assert.equal(imageReads, 1); assert.equal(d.settled, false);
    assert.match(d.render(), /Reading clipboard/);
    pending.resolve(png); await tick();
    assert.equal(d.settled, false, 'requires a fresh Enter after clipboard finishes');
    d.input(key.enter); const r = await d.result;
    assert.equal(images(r).length, 1); assert.match(r.details.answers[0].label, /^keep/);
  });
  await check('cancel and abort pending image/text reads never emit or render after close', async () => {
    for (const text of [false, true]) for (const abort of [false, true]) {
      const pending = deferred(); clipboard(text ? { image: null, getText: () => pending.promise } : { getImage: () => pending.promise });
      const d = await open(); d.input(key.paste); await tick();
      if (abort) d.controller.abort(); else d.input(key.esc);
      const r = await d.result; const renders = d.renders;
      pending.resolve(text ? 'SECRET' : png); await tick();
      assert.equal(d.renders, renders); assert.equal(d.doneCalls, 1);
      assert.equal(r.details.status, 'cancelled'); assert.equal(images(r).length, 0);
    }
  });
  await check('leaving Other cancels pending reads even after immediate reentry', async () => {
    for (const multiSelect of [false, true]) {
      const pending = deferred(); clipboard({ getImage: () => pending.promise });
      const d = await open({ options: opts, multiSelect });
      d.input(key.down, key.down, key.enter, key.paste, key.esc, key.enter, 'new');
      const renders = d.renders; pending.resolve(png); await tick();
      assert.equal(d.renders, renders); assert.ok(!d.render().includes('[question-image:'));
      d.input(key.enter); if (multiSelect) d.input(key.down, key.enter);
      assert.equal(images(await d.result).length, 0);
    }
  });
  await check('stale reads cannot unlock or insert into a newer edit session', async () => {
    const oldRead = deferred(), newRead = deferred(); let calls = 0;
    clipboard({ getImage: () => (++calls === 1 ? oldRead : newRead).promise });
    const d = await open({ options: opts });
    d.input(key.down, key.down, key.enter, key.paste, key.esc, key.enter, key.paste);
    oldRead.resolve(png); await tick(); d.input(key.enter);
    assert.equal(d.settled, false); assert.match(d.render(), /Reading clipboard/);
    newRead.resolve(png); await tick(); d.input(key.enter);
    assert.equal(images(await d.result).length, 1);
  });
  await check('pending text and format conversion block Enter and respect cancellation', async () => {
    for (const kind of ['text', 'conversion']) {
      const pending = deferred();
      clipboard(kind === 'text' ? { image: null, getText: () => pending.promise } : { image: Uint8Array.of(1) });
      if (kind === 'conversion') globalThis.__questionConvert = () => pending.promise;
      const d = await open(); d.input(key.paste); await tick(); d.input(key.enter);
      assert.equal(d.settled, false); d.controller.abort(); const r = await d.result;
      const renders = d.renders;
      pending.resolve(kind === 'text' ? 'PRIVATE' : { data: b64, mimeType: 'image/png' }); await tick();
      assert.equal(d.renders, renders); assert.equal(r.details.status, 'cancelled');
    }
  });
  await check('newlines, bracketed paste and narrow resize preserve editor behavior', async () => {
    clipboard(); const d = await open({ options: opts });
    d.input(key.down, key.down, key.enter, 'line one', '\x0a', 'line two');
    await paste(d);
    const { visibleWidth } = await import(pathToFileURL(join(modules, '@earendil-works/pi-tui/dist/index.js')).href);
    for (const width of [100, 30, 8, 1, 80]) {
      for (const line of d.render(width).split('\n')) assert.ok(visibleWidth(line) <= width);
    }
    d.input(key.enter); const r = await d.result;
    assert.equal(r.details.answers[0].label, 'line one\nline two[question-image:1]');
  });
  await check('clipboard unavailable, empty, rejected and unsupported images stay private', async () => {
    for (const kind of ['unavailable', 'empty', 'reject', 'unsupported']) {
      clipboard({ image: kind === 'unsupported' ? Uint8Array.of(1, 2, 3) : null, getText: kind === 'reject' ? () => { throw Error(b64); } : undefined });
      if (kind === 'unavailable') globalThis.__questionClipboard = undefined;
      const d = await open(); await paste(d);
      assert.ok(!d.render().includes(b64)); d.input('still works', key.enter);
      assert.equal(images(await d.result).length, 0);
    }
  });
  await check('supported image MIME types and conversion return real image content', async () => {
    for (const [bytes, mime] of [[Uint8Array.of(255, 216, 255), 'image/jpeg'], [Buffer.from('GIF89a'), 'image/gif'], [Buffer.from('RIFF1234WEBP'), 'image/webp'], [Uint8Array.of(1), 'image/png']]) {
      clipboard({ image: bytes }); globalThis.__questionConvert = async () => ({ data: b64, mimeType: 'image/png' });
      const d = await open(); await paste(d); d.input(key.enter);
      assert.equal(images(await d.result)[0].mimeType, mime);
    }
  });
  await check('choice navigation never reads clipboard; original text, sorting, empty and cancel behavior', async () => {
    clipboard(); let d = await open({ options: opts });
    d.input(key.paste, key.superPaste, key.down, key.up, key.enter);
    let r = await d.result; assert.equal(imageReads, 0);
    assert.deepEqual(r.details.answers, [{ type: 'option', label: 'Alpha', value: 'a', index: 1 }]);
    d = await open(); d.input(key.enter); r = await d.result;
    assert.equal(r.content[0].text, 'User submitted an empty response');
    d = await open({ options: opts }); d.input(key.down, key.down, key.enter, key.enter);
    assert.equal(d.settled, false, 'empty Other cannot submit'); d.input(key.esc, key.esc);
    assert.equal((await d.result).details.status, 'cancelled');
    d = await open({ options: opts, multiSelect: true });
    d.input(key.down, key.down, key.down, key.enter); assert.equal(d.settled, false);
    d.input(key.up, key.up, key.enter, key.up, key.space, key.down, key.down, key.down, key.enter);
    assert.deepEqual((await d.result).details.answers.map(a => a.index), [1, 2]);
  });
  await check('configurable paste shortcut and bracketed input do not use literal CtrlV', async () => {
    clipboard(); const d = await open({}, undefined, [key.superPaste]);
    d.input(key.paste); assert.equal(imageReads, 0);
    await paste(d, key.superPaste); d.input(key.enter); assert.equal(images(await d.result).length, 1);
  });
  await check('shared UI lock holds across abort and queued cancellation', async () => {
    clipboard(); const first = await open();
    let calls = 0; const controller = new AbortController();
    const ctx = { ...first.ctx, ui: { custom: () => { calls++; throw Error('must not open'); } } };
    const queued = tool.execute('queued', { question: 'Next?' }, controller.signal, undefined, ctx);
    controller.abort(); assert.equal((await queued).details.status, 'cancelled'); assert.equal(calls, 0);
    first.controller.abort(); await first.result;
    const next = await open(); next.input('next', key.enter); assert.equal((await next.result).details.status, 'answered');
  });
  await check('unavailable modes and pre-abort do not open UI', async () => {
    for (const mode of ['rpc', 'json', 'print']) {
      const r = await tool.execute('x', { question: 'Q' }, undefined, undefined, { mode, hasUI: true });
      assert.equal(r.details.status, 'unavailable');
    }
    const controller = new AbortController(); controller.abort();
    const r = await tool.execute('x', { question: 'Q' }, controller.signal, undefined, {});
    assert.equal(r.details.status, 'cancelled');
  });
  console.log(`PASS: ${tests} question image paste test groups. Real Editor, fake clipboard; live paste unverified.`);
} finally {
  delete globalThis.__questionClipboard; delete globalThis.__questionConvert;
  await rm(temp, { recursive: true, force: true });
}
