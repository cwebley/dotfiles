import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import test from 'node:test';
import { loadTool, extensions, theme, text, checkRender } from './helpers.mjs';
import { tui, KeybindingsManager } from './helpers.mjs';
const { Editor, CURSOR_MARKER, visibleWidth } = tui;


const tool = await loadTool(`${extensions}ask-user-question.ts`, 'ask_user_question');
const hostTheme = theme;
const keys = new KeybindingsManager();
const UP = '\x1b[A', DOWN = '\x1b[B', ENTER = '\r', ESC = '\x1b';
const options = [
  {label: '  Alpha (Recommended)  ', value: '  a  ', description: ' Details with 界 and a long explanation '.repeat(3)},
  {label: 'Beta', value: 'b'},
];
const question = 'Which approach should we use for 界 and emoji 🙂? '.repeat(3);
const params = {question, details: '  Context for the decision. '.repeat(4), options};

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return {promise, resolve};
}
function widths(component) {
  // Wide to narrow to wide without invalidate reproduces the host resize contract.
  for (const width of [80, 20, 8, 80]) {
    const lines = component.render(width);
    assert.ok(Array.isArray(lines) && lines.length > 0);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, `dialog exceeds ${width} columns`);
  }
  component.invalidate?.();
}
function cursor(component, expected) {
  const lines = component.render(80);
  assert.equal(lines.some(line => line.includes(CURSOR_MARKER)), expected, 'focus propagates to real Editor cursor');
}

// Models the host custom() lifecycle: construct the real component, assign focus,
// render it, deliver terminal data, and close through done before resolving.
class MockUI {
  dialogs = [];
  waiters = new Map();
  active = 0;
  maxActive = 0;
  renders = 0;
  failBeforeFactory = false;
  failRendering = false;
  holdCompletion = false;
  ctx = {mode: 'tui', hasUI: true, ui: this};
  editor() { throw new Error('text mode must use cancellable custom Editor, not ui.editor'); }
  opened(number = this.dialogs.length + 1) {
    if (this.dialogs.length >= number) return Promise.resolve(this.dialogs[number - 1]);
    const wait = deferred();
    this.waiters.set(number, wait);
    return wait.promise;
  }
  custom(factory, customOptions) {
    assert.equal(customOptions, undefined, 'no unsupported signal option on custom()');
    if (this.failBeforeFactory) {
      this.failBeforeFactory = false;
      throw new Error('mock UI unavailable');
    }
    return new Promise((resolve, reject) => {
      let completed = false;
      let component;
      const closed = deferred();
      const dialog = {
        component: undefined,
        doneCalls: 0,
        closed: closed.promise,
        input: data => {
          assert.equal(completed, false, 'cannot type into a closed dialog');
          try { component.handleInput(data); if (!completed) widths(component); }
          catch (error) { close(undefined, error); }
        },
        finishClose: undefined,
      };
      const close = (value, error) => {
        if (completed) return;
        completed = true;
        dialog.doneCalls++;
        const finish = () => {
          if (component) component.focused = false;
          this.active--;
          component?.dispose?.();
          closed.resolve();
          if (error) reject(error); else resolve(value);
        };
        if (this.holdCompletion) dialog.finishClose = finish;
        else finish();
      };
      this.active++;
      this.maxActive = Math.max(this.active, this.maxActive);
      try {
        component = factory({terminal: {rows: 40, columns: 80}, requestRender: () => this.renders++}, hostTheme, keys, value => close(value));
        dialog.component = component;
        if (!completed) {
          component.focused = true;
          if (this.failRendering) {
            this.failRendering = false;
            throw new Error('mock render failure');
          }
          widths(component);
        }
      } catch (error) { close(undefined, error); }
      this.dialogs.push(dialog);
      this.waiters.get(this.dialogs.length)?.resolve(dialog);
      this.waiters.delete(this.dialogs.length);
    });
  }
}
function execute(ui, args = params, signal, implementation = tool) {
  return implementation.execute('question-test', args, signal, undefined, ui.ctx);
}
function listeners(signal) { return getEventListeners(signal, 'abort').length; }
function resultRenders(args, result) {
  checkRender(tool, args, result);
  // Include repeated wide/narrow resizes with ANSI colors from the host theme.
  for (const component of [tool.renderCall(args, hostTheme, {}), tool.renderResult(result, {expanded: true, isPartial: false}, hostTheme, {})]) widths(component);
}
async function nextSuccess(ui) {
  const opened = ui.opened();
  const pending = execute(ui);
  const dialog = await opened;
  dialog.input(ENTER);
  const result = await pending;
  assert.equal(result.details.status, 'answered');
  assert.equal(ui.active, 0);
}

await test('host registration, schema, model-only exposure and non-TUI guard', {timeout: 4000}, async () => {
  assert.equal(tool.exposure, 'model-only');
  assert.equal(tool.parameters.type, 'object');
  assert.equal(tool.parameters.properties.multiSelect.type, 'boolean');
  for (const mode of ['rpc', 'json', 'print', 'tui']) {
    const ui = new MockUI();
    ui.ctx.mode = mode;
    ui.ctx.hasUI = mode !== 'tui';
    const result = await execute(ui);
    assert.equal(result.details.status, 'unavailable');
    assert.match(text(result), /interactive terminal UI/);
    assert.equal(ui.dialogs.length, 0);
    resultRenders(params, result);
  }
});

await test('text uses real host Editor, editing, multiline paste, trimming and empty submission', {timeout: 4000}, async () => {
  const original = Editor.prototype.handleInput;
  let editorInputs = 0;
  Editor.prototype.handleInput = function(data) { editorInputs++; return original.call(this, data); };
  try {
    for (const [data, expected] of [
      ['\x1b[200~  first 界🙂\nsecond  \x1b[201~', 'first 界🙂\nsecond'],
      ['', ''],
    ]) {
      const ui = new MockUI();
      const controller = new AbortController();
      const args = {question, details: params.details, options: [{label: '   '}]};
      const pending = execute(ui, args, controller.signal);
      const dialog = await ui.opened(1);
      assert.equal(listeners(controller.signal), 1);
      cursor(dialog.component, true);
      dialog.component.focused = false;
      cursor(dialog.component, false);
      dialog.component.focused = true;
      if (data) dialog.input(data);
      dialog.input(ENTER);
      const result = await pending;
      assert.deepEqual(result.details.answers, [{type: 'text', label: expected, value: expected}]);
      assert.equal(result.details.mode, 'text');
      assert.equal(result.details.context, params.details.trim());
      assert.equal(listeners(controller.signal), 0);
      assert.equal(dialog.doneCalls, 1);
      assert.equal(ui.active, 0);
      resultRenders(args, result);
    }
    assert.ok(editorInputs >= 3, 'keyboard data reached actual host Editor');
    const ui = new MockUI();
    const args = {question};
    const pending = execute(ui, args);
    const dialog = await ui.opened(1);
    dialog.input('abc');
    dialog.input('\x7f');
    dialog.input('d');
    dialog.input(ENTER);
    assert.equal((await pending).details.answers[0].value, 'abd');
  } finally { Editor.prototype.handleInput = original; }
});

await test('single-select navigation, normalization, values and Other Editor', {timeout: 4000}, async () => {
  const ui = new MockUI();
  let pending = execute(ui);
  let dialog = await ui.opened(1);
  cursor(dialog.component, false);
  dialog.input(UP); // Clamp at first option.
  dialog.input(DOWN);
  dialog.input(ENTER);
  let result = await pending;
  assert.deepEqual(result.details.answers, [{type: 'option', label: 'Beta', value: 'b', index: 2}]);
  resultRenders(params, result);

  const args = {question, options: [{label: ' Other '}, {label: ' Label fallback ', value: '  '}]};
  pending = execute(ui, args);
  dialog = await ui.opened(2);
  assert.ok(dialog.component.render(80).join('\n').includes('Other (custom)'));
  dialog.input(DOWN);
  dialog.input(ENTER);
  result = await pending;
  assert.deepEqual(result.details.answers, [{type: 'option', label: 'Label fallback', value: 'Label fallback', index: 2}]);

  pending = execute(ui);
  dialog = await ui.opened(3);
  dialog.input(DOWN); dialog.input(DOWN); dialog.input(DOWN); // Clamp on Other.
  dialog.input(ENTER);
  cursor(dialog.component, true);
  dialog.component.focused = false; cursor(dialog.component, false);
  dialog.component.focused = true; cursor(dialog.component, true);
  dialog.input('   '); dialog.input(ENTER); // Empty Other cannot submit.
  assert.equal(ui.active, 1);
  dialog.input(ESC); // Other escape goes back, not full cancellation.
  cursor(dialog.component, false);
  dialog.input(ENTER); dialog.input('  custom 界🙂  '); dialog.input(ENTER);
  result = await pending;
  assert.deepEqual(result.details.answers, [{type: 'other', label: 'custom 界🙂', value: 'custom 界🙂'}]);
  resultRenders(params, result);
  assert.equal(ui.maxActive, 1);
});

await test('multi-select toggling, Other edit/remove/back, empty submit and answer ordering', {timeout: 4000}, async () => {
  const ui = new MockUI();
  const args = {...params, multiSelect: true};
  const pending = execute(ui, args);
  const dialog = await ui.opened(1);
  dialog.input(DOWN); dialog.input(DOWN); dialog.input(DOWN); dialog.input(ENTER);
  assert.equal(ui.active, 1, 'empty multi-selection cannot submit');
  dialog.input(UP); dialog.input(ENTER); // Other editor.
  cursor(dialog.component, true);
  dialog.input(ENTER); assert.equal(ui.active, 1, 'empty Other cannot save');
  dialog.input('old custom'); dialog.input(ENTER); cursor(dialog.component, false);
  dialog.input(ENTER); dialog.input(' extra'); dialog.input(ESC); // Discard edit, retain saved Other.
  cursor(dialog.component, false);
  dialog.input(' '); // Remove saved Other.
  dialog.input(' '); // Re-open empty Other.
  dialog.input('  final custom  '); dialog.input(ENTER);
  dialog.input(UP); dialog.input(' '); // Beta selected first.
  dialog.input(UP); dialog.input(ENTER); // Alpha selected second.
  dialog.input(' '); dialog.input(' '); // Toggle Alpha off and back on.
  dialog.input(DOWN); dialog.input(DOWN); dialog.input(DOWN); dialog.input(ENTER);
  const result = await pending;
  assert.deepEqual(result.details.answers, [
    {type: 'option', label: 'Alpha (Recommended)', value: 'a', index: 1},
    {type: 'option', label: 'Beta', value: 'b', index: 2},
    {type: 'other', label: 'final custom', value: 'final custom'},
  ]);
  resultRenders(args, result);
  assert.equal(ui.active, 0);
  assert.ok(ui.renders > 0);
});

const modes = [
  {name: 'text', args: {question}},
  {name: 'single', args: params},
  {name: 'multi', args: {...params, multiSelect: true}},
  {name: 'single Other', args: params, edit: true},
  {name: 'multi Other', args: {...params, multiSelect: true}, edit: true},
];
for (const mode of modes) {
  await test(`${mode.name}: successful answer removes listener and permits another question`, {timeout: 4000}, async () => {
    const ui = new MockUI();
    const controller = new AbortController();
    const pending = execute(ui, mode.args, controller.signal);
    const dialog = await ui.opened(1);
    if (mode.name === 'text') dialog.input('answer');
    if (mode.edit) {
      dialog.input(DOWN); dialog.input(DOWN); dialog.input(ENTER);
      dialog.input('custom answer'); dialog.input(ENTER);
      if (mode.args.multiSelect) { dialog.input(DOWN); dialog.input(ENTER); }
    } else if (mode.args.multiSelect) {
      dialog.input(' '); dialog.input(DOWN); dialog.input(DOWN); dialog.input(DOWN); dialog.input(ENTER);
    } else dialog.input(ENTER);
    assert.equal((await pending).details.status, 'answered');
    assert.equal(listeners(controller.signal), 0);
    assert.equal(dialog.doneCalls, 1);
    await nextSuccess(ui);
  });
  await test(`${mode.name}: active abort closes via done, removes listener, then unlocks`, {timeout: 4000}, async () => {
    const ui = new MockUI();
    const controller = new AbortController();
    const pending = execute(ui, mode.args, controller.signal);
    const dialog = await ui.opened(1);
    if (mode.edit) { dialog.input(DOWN); dialog.input(DOWN); dialog.input(ENTER); dialog.input('unfinished'); }
    assert.equal(listeners(controller.signal), 1);
    const nextOpened = ui.opened(2);
    const next = execute(ui);
    // Keep the host promise pending after done. The mutex must not release yet.
    ui.holdCompletion = true;
    controller.abort();
    assert.equal(dialog.doneCalls, 1, 'abort called completion callback');
    assert.equal(listeners(controller.signal), 0);
    assert.equal(ui.active, 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.dialogs.length, 1, 'subsequent UI waits for custom promise');
    ui.holdCompletion = false;
    dialog.finishClose();
    const result = await pending;
    assert.equal(result.details.status, 'cancelled');
    resultRenders(mode.args, result);
    const nextDialog = await nextOpened;
    nextDialog.input(ENTER);
    assert.equal((await next).details.status, 'answered');
    assert.equal(ui.maxActive, 1);
    assert.equal(ui.active, 0);
  });
}

for (const mode of modes) {
  await test(`${mode.name}: Escape releases UI and cleans listener`, {timeout: 4000}, async () => {
    const ui = new MockUI();
    const controller = new AbortController();
    const pending = execute(ui, mode.args, controller.signal);
    const dialog = await ui.opened(1);
    if (mode.edit) {
      dialog.input(DOWN); dialog.input(DOWN); dialog.input(ENTER); dialog.input('discard');
      dialog.input(ESC); assert.equal(ui.active, 1);
    }
    dialog.input(ESC);
    const result = await pending;
    assert.equal(result.details.status, 'cancelled');
    assert.equal(listeners(controller.signal), 0);
    assert.equal(dialog.doneCalls, 1);
    await nextSuccess(ui);
  });
}

for (const mode of modes.filter(mode => !mode.edit)) {
await test(`${mode.name}: already aborted and queued abort return promptly without opening or bypassing previous UI`, {timeout: 4000}, async () => {
  const ui = new MockUI();
  const already = new AbortController(); already.abort();
  assert.equal((await execute(ui, mode.args, already.signal)).details.status, 'cancelled');
  assert.equal(ui.dialogs.length, 0);
  assert.equal(listeners(already.signal), 0);
  const first = execute(ui);
  const firstDialog = await ui.opened(1);
  const queuedController = new AbortController();
  const queued = execute(ui, mode.args, queuedController.signal);
  assert.equal(listeners(queuedController.signal), 1);
  const thirdOpened = ui.opened(2);
  const third = execute(ui, {...params, multiSelect: true});
  queuedController.abort();
  assert.equal((await queued).details.status, 'cancelled', 'queued cancellation completes while previous stays open');
  assert.equal(listeners(queuedController.signal), 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.dialogs.length, 1);
  assert.equal(ui.active, 1, 'cancelled waiter cannot release the active predecessor lock');
  firstDialog.input(ENTER);
  await first;
  const thirdDialog = await thirdOpened;
  thirdDialog.input(' '); thirdDialog.input(DOWN); thirdDialog.input(DOWN); thirdDialog.input(DOWN); thirdDialog.input(ENTER);
  assert.equal((await third).details.status, 'answered');
  assert.equal(ui.dialogs.length, 2, 'cancelled waiter never constructs its UI');
  assert.equal(ui.maxActive, 1);
  await nextSuccess(ui);
});
}

await test('shared global mutex serializes separate host-loaded registrations', {timeout: 4000}, async () => {
  const secondTool = await loadTool(`${extensions}ask-user-question.ts`, 'ask_user_question');
  const ui = new MockUI();
  const first = execute(ui, {question: 'first'});
  const firstDialog = await ui.opened(1);
  const secondOpened = ui.opened(2);
  const second = execute(ui, params, undefined, secondTool);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.dialogs.length, 1);
  firstDialog.input('answer'); firstDialog.input(ENTER); await first;
  const secondDialog = await secondOpened;
  secondDialog.input(ENTER);
  assert.equal((await second).details.status, 'answered');
  assert.equal(ui.maxActive, 1);
});

await test('UI creation/render/input errors clean listeners and unlock subsequent calls', {timeout: 4000}, async () => {
  for (const failure of ['before factory', 'render', 'input']) {
    const ui = new MockUI();
    const controller = new AbortController();
    if (failure === 'before factory') ui.failBeforeFactory = true;
    if (failure === 'render') ui.failRendering = true;
    const pending = execute(ui, params, controller.signal);
    const rejection = assert.rejects(pending, /mock .*failure|mock UI unavailable/);
    if (failure === 'input') {
      const dialog = await ui.opened(1);
      const original = Editor.prototype.setText;
      Editor.prototype.setText = () => { throw new Error('mock input failure'); };
      try { dialog.input(DOWN); dialog.input(DOWN); dialog.input(ENTER); }
      finally { Editor.prototype.setText = original; }
    }
    await rejection;
    assert.equal(listeners(controller.signal), 0);
    assert.equal(ui.active, 0);
    await nextSuccess(ui);
  }
});

await test('abort between custom invocation and factory installation closes without leaving a UI', {timeout: 4000}, async () => {
  const ui = new MockUI();
  const controller = new AbortController();
  const originalCustom = ui.custom;
  ui.custom = function(factory, opts) {
    controller.abort();
    return originalCustom.call(this, factory, opts);
  };
  const result = await execute(ui, params, controller.signal);
  assert.equal(result.details.status, 'cancelled');
  assert.equal(ui.active, 0);
  assert.equal(ui.dialogs[0].doneCalls, 1);
  assert.equal(listeners(controller.signal), 0);
  ui.custom = originalCustom;
  await nextSuccess(ui);
});

await test('factory exception also removes its installed abort listener', {timeout: 4000}, async () => {
  const ui = new MockUI();
  const controller = new AbortController();
  const originalCustom = ui.custom;
  ui.custom = function(factory, opts) {
    // Construct the actual component before injecting a host factory failure.
    return originalCustom.call(this, (tui, theme, kb, done) => {
      factory(tui, theme, kb, done);
      throw new Error('mock factory failure');
    }, opts);
  };
  const pending = execute(ui, params, controller.signal);
  await assert.rejects(pending, /mock factory failure/);
  assert.equal(listeners(controller.signal), 0);
  ui.custom = originalCustom;
  await nextSuccess(ui);
});

console.log('PASS: Stow-linked ask_user_question host loading, real Editor mocked UI, cancellation, serialization, cleanup and renders');
