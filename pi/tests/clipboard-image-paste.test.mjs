import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Use the managed Pi's TS loader, with a fake clipboard. Never access the real clipboard.
const root = join(homedir(), '.pi/agent/install');
const { readFile } = await import('node:fs/promises');
const version = (await readFile(join(root, 'current-version'), 'utf8')).trim();
assert.match(version, /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
const { createJiti } = await import(pathToFileURL(join(root, 'releases', version,
  'node_modules/jiti/lib/jiti.mjs')).href);
const temp = await mkdtemp(join(tmpdir(), 'pi-clipboard-test-'));
try {
  const stub = join(temp, 'tui.mjs');
  await writeFile(stub, `
    export const matchesKey = (data, key) => key === 'ctrl+v' &&
      (data === '\\x16' || data === '\\x1b[118;5u');
    export const getNativeClipboard = () => ({ getImage: async () => new Uint8Array(3) });
  `);
  const jiti = createJiti(import.meta.url, { alias: { '@earendil-works/pi-tui': stub } });
  const mod = await jiti.import(fileURLToPath(new URL('../.pi/agent/extensions/clipboard-image-paste.ts', import.meta.url)));
  assert.deepEqual(mod.translateEmptyPaste('\x1b[200~\x1b[201~'), { data: '\x16' });
  assert.equal(mod.translateEmptyPaste('private text'), undefined);
  const events = new Map(), commands = new Map(), listeners = new Set();
  let widget;
  const ctx = { mode: 'tui', ui: {
    setWidget: (_name, value) => { widget = value; },
    onTerminalInput: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  } };
  mod.default({ on: (name, fn) => events.set(name, fn), registerCommand: (name, cmd) => commands.set(name, cmd) });
  await events.get('session_start')({}, ctx);
  assert.equal(listeners.size, 1);
  await commands.get('clipboard-debug').handler('', ctx);
  assert.equal(listeners.size, 2);
  for (const listener of [...listeners]) assert.equal(listener('PRIVATE_TEXT'), undefined);
  assert.ok(!widget.join('\n').includes('PRIVATE_TEXT'));
  for (const listener of [...listeners]) assert.equal(listener('\x1b[118;5u'), undefined);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(widget.join('\n'), /Native clipboard image found: 3 bytes/);
  assert.equal(listeners.size, 1, 'one-shot trace detaches without removing translation');
  await commands.get('clipboard-debug').handler('', ctx);
  await commands.get('clipboard-debug').handler('', ctx);
  assert.equal(listeners.size, 2, 'rearming does not duplicate trace listeners');
  await events.get('session_shutdown')({}, ctx);
  assert.equal(listeners.size, 0);
  assert.equal(widget, undefined);
  console.log('PASS: translation, non-consuming trace, redaction, metadata, rearming and shutdown');
} finally {
  await rm(temp, { recursive: true, force: true });
}
