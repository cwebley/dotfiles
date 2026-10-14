import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { TmuxPicker } from '../../.pi/agent/extensions/prompt-snippets/tmux-picker.mjs';
import { canonicalCommand, parseSnippet, composePrompt, escapeDisplay } from '../../.pi/agent/extensions/prompt-snippets/picker-protocol.mjs';

const helperPath = fileURLToPath(new URL('../../.pi/agent/extensions/prompt-snippets/picker-helper.mjs', import.meta.url));
const snippets = [parseSnippet('alpha.md', '---\nname: Alpha\nplacement: prepend\n---\nALPHA')];
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function harness({ delayed = false, lostId = false, replace = false, cleanupDelay = false, focused = true } = {}) {
  const gate = deferred(), reached = deferred(), cleanupGate = deferred(), cleanupReached = deferred();
  const commits = [], errors = [], calls = [], detached = [];
  let pane, oldDirectory;
  const execute = async (run, args) => {
    calls.push(args);
    if (args[0] === '-V') return 'tmux 3.5a';
    if (args[0] === 'display-message') return args.at(-1).includes('#{pid}') ? '123\t%1\t$1\t@1' : focused ? '1' : '0';
    if (args[0] === 'list-clients') return args.at(-1).includes('#{pane_id}') ? '/dev/test\t$1\t@1\t' + (focused ? '%2' : '%1') : '/dev/test\tattached';
    if (args[0] === 'split-window') {
      oldDirectory = run.directory; reached.resolve(run);
      if (delayed) await gate.promise;
      pane = { id: '%2', command: canonicalCommand(run.startCommand), tag: run.nonce };
      writeFileSync(join(run.directory, 'handshake.json'), JSON.stringify({ version: 1, nonce: run.nonce, pane: '%2', pid: 2147483647 }));
      if (lostId) throw new Error('Lost split reply');
      return '%2';
    }
    if (args[0] === 'list-panes') {
      const fields = args.at(-1);
      if (!pane) return '%1';
      if (replace) pane.command = '"exec sleep 30"';
      if (fields === '#{pane_id}') return '%1\n%2';
      return '%1\t"shell"\t\n' + [pane.id, pane.command, ...(fields.includes('@pi_snippets_nonce') ? [pane.tag] : [])].join('\t');
    }
    if (args[0] === 'if-shell') {
      if (args[5]?.startsWith('kill-pane')) {
        cleanupReached.resolve(); if (cleanupDelay) await cleanupGate.promise;
        if (pane?.command === canonicalCommand(run.startCommand) && pane.tag === run.nonce) pane = undefined;
        return '';
      }
      return ''; // Real nested if-shell commands need not forward stdout.
    }
    throw new Error('Unexpected mock command ' + args);
  };
  const picker = new TmuxPicker({ helperPath, execute, env: { ...process.env, TMUX: '/tmp/unit-socket,123,0', TMUX_PANE: '%1' },
    onCommit: ids => commits.push(ids), onError: text => errors.push(text), onDetached: () => detached.push(true) });
  return { picker, commits, errors, calls, detached, gate, reached, cleanupGate, cleanupReached, directory: () => oldDirectory, pane: () => pane };
}
function result(run, stdout) {
  writeFileSync(join(run.directory, 'result.json'), JSON.stringify({ version: 1, nonce: run.nonce, status: 0, signal: null, stdout }));
}
test('valid selection commits once before asynchronous cleanup, duplicate notifications harmless', async () => {
  const h = harness(); await h.picker.open(snippets, new Set()); const run = h.picker.current;
  result(run, 'snippet-confirm:1\n1\n'); await h.picker.consume(run); await run.cleanup;
  assert.deepEqual(h.commits, [['alpha.md']]); assert.equal(h.picker.current, undefined); assert.ok(!existsSync(run.directory));
  await h.picker.consume(run); assert.equal(h.commits.length, 1);
});
test('send invalidation is synchronous and rejects a late confirmed result', async () => {
  const h = harness(); await h.picker.open(snippets, new Set()); const run = h.picker.current;
  result(run, 'snippet-confirm:1\n1\n'); const previous = h.picker.generation;
  const closing = h.picker.invalidate(); assert.equal(run.cancelled, true); assert.equal(h.picker.generation, previous + 1);
  await h.picker.consume(run); await closing; assert.deepEqual(h.commits, []); assert.ok(!existsSync(run.directory));
});
test('shutdown drains a pending detached split and removes its late-created pane', async () => {
  const h = harness({ delayed: true }); const opening = h.picker.open(snippets, new Set());
  const run = await h.reached.promise; const closing = h.picker.invalidate();
  let done = false; closing.then(() => done = true); await Promise.resolve(); assert.equal(done, false);
  h.gate.resolve(); await Promise.all([opening, closing]);
  assert.equal(h.pane(), undefined); assert.ok(!existsSync(run.directory)); assert.deepEqual(h.commits, []);
  assert.ok(h.calls.find(a => a[0] === 'split-window').includes('-d'));
});
test('nonzero split reply with no ID reconciles only the exact owned pane', async () => {
  const h = harness({ lostId: true }); await h.picker.open(snippets, new Set());
  assert.equal(h.pane(), undefined); assert.ok(!existsSync(h.directory())); assert.equal(h.errors.length, 1);
});
test('teardown awaits cleanup already underway and prevents duplicate new launch', async () => {
  const h = harness({ cleanupDelay: true }); await h.picker.open(snippets, new Set()); const run = h.picker.current;
  result(run, 'snippet-confirm:1\n1\n'); await h.picker.consume(run); await h.cleanupReached.promise;
  const teardown = h.picker.invalidate(); let done = false; teardown.then(() => done = true); await Promise.resolve();
  await h.picker.open(snippets, new Set()); assert.equal(h.calls.filter(a => a[0] === 'split-window').length, 1); assert.equal(done, false);
  h.cleanupGate.resolve(); await teardown; assert.ok(!existsSync(run.directory));
});
test('respawned pane with stale tag is not killed and cleanup fails closed', async () => {
  const h = harness({ replace: true }); await h.picker.open(snippets, new Set()); const run = h.picker.current;
  await h.picker.invalidate(); assert.ok(h.pane()); assert.equal(h.picker.blocked, true);
  assert.ok(h.errors.some(e => e.includes('ownership changed'))); assert.ok(existsSync(join(run.directory, 'ownership.json')));
  assert.ok(!existsSync(join(run.directory, 'config.json'))); assert.ok(!existsSync(join(run.directory, '1.md')));
  rmSync(run.directory, { recursive: true, force: true });
});

test('focus reporting observes pane state rather than nested command stdout', async () => {
  for (const focused of [true, false]) {
    const h = harness({ focused }); await h.picker.open(snippets, new Set());
    await h.picker.focus(h.picker.current);
    assert.equal(h.detached.length > 0, !focused);
    const guard = h.calls.find(a => a[0] === 'if-shell' && !a[5]?.startsWith('kill-pane'));
    assert.equal(guard[3], '%1'); assert.match(guard[4], /session_attached_list/);
    assert.match(guard[5], /pane_start_command/);
    assert.ok(!h.calls.some(a => a[0] === 'select-pane'));
    await h.picker.invalidate();
  }
});
test('filesystem cleanup failure resolves safely and blocks further launches', async () => {
  const h = harness({ replace: true }); await h.picker.open(snippets, new Set());
  rmSync(h.picker.current.directory, { recursive: true, force: true });
  await assert.doesNotReject(h.picker.invalidate());
  assert.equal(h.picker.blocked, true); assert.equal(h.picker.current, undefined);
  assert.ok(h.errors.some(e => e.includes('cleanup failed')));
});

const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi/agent');
const hostRoot = process.env.PI_TEST_HOST_ROOT || join(agentDir, 'install/releases', fs.readFileSync(join(agentDir, 'install/current-version'), 'utf8').trim(), 'node_modules');
const { createJiti } = await import(pathToFileURL(join(hostRoot, 'jiti/lib/jiti.mjs')).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const entry = await jiti.import(fileURLToPath(new URL('../../.pi/agent/extensions/prompt-snippets/index.ts', import.meta.url)));
function stateHarness() {
  const events = new Map(), commands = new Map(), widgets = []; let instance;
  class Picker {
    constructor(options) { this.options = options; this.current = undefined; this.invalidations = 0; instance = this; }
    invalidate() { this.invalidations++; this.current = undefined; return Promise.resolve(); }
    async open() { this.current = {}; }
  }
  let files = [...snippets];
  const ctx = { mode: 'tui', hasUI: true, ui: { theme: { fg: (_token, s) => s }, setWidget: (_id, lines) => widgets.push(lines), notify() {} } };
  entry.installPromptSnippets({ on: (name, fn) => events.set(name, fn), registerShortcut() {}, registerCommand: (name, cmd) => commands.set(name, cmd) },
    { loadSnippets: () => files, composePrompt, escapeDisplay }, Picker);
  return { events, commands, widgets, ctx, instance, files: value => files = value };
}
test('every input hook invalidates provisional selections, including slash/queued and empty state', async () => {
  const h = stateHarness(); await h.events.get('session_start')({}, h.ctx); const before = h.instance.invalidations;
  for (const text of ['plain', '/skill:test', '/template arg']) {
    assert.equal(h.events.get('input')({ text }, h.ctx), undefined);
  }
  assert.equal(h.instance.invalidations, before + 3);
  assert.ok(!h.events.has('before_agent_start'));
});
test('committed bodies transform input, widget resets and stale files prune at opening', async () => {
  const h = stateHarness(); await h.events.get('session_start')({}, h.ctx);
  h.instance.options.onCommit(['alpha.md']); assert.match(h.widgets.at(-1)[0], /prepend: Alpha/);
  assert.deepEqual(h.events.get('input')({ text: 'USER' }, h.ctx), { action: 'transform', text: 'ALPHA\n\nUSER' });
  assert.equal(h.widgets.at(-1), undefined); assert.equal(h.events.get('input')({ text: 'NEXT' }, h.ctx), undefined);
  h.instance.options.onCommit(['alpha.md']); h.files([]); await h.commands.get('snippets').handler('', h.ctx);
  assert.equal(h.widgets.at(-1), undefined); assert.equal(h.events.get('input')({ text: 'UNCHANGED' }, h.ctx), undefined);
});
test('installed Stow-linked entry resolves real sibling modules without new home symlinks', async () => {
  const installed = join(homedir(), '.pi/agent/extensions/prompt-snippets/index.ts');
  const module = await jiti.import(installed); const events = [];
  await module.default({ on: name => events.push(name), registerShortcut() {}, registerCommand() {} });
  assert.ok(events.includes('input')); assert.ok(events.includes('session_shutdown'));
});
