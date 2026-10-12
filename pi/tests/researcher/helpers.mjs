import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

export const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(homedir(), '.pi/agent');
const hostRoot = process.env.PI_TEST_HOST_ROOT || path.join(agentDir, 'install/releases', fs.readFileSync(path.join(agentDir, 'install/current-version'), 'utf8').trim(), 'node_modules');
const hostImport = relative => import(pathToFileURL(path.join(hostRoot, '@earendil-works', relative)).href);
export const { loadExtensions } = await hostImport('pi-coding-agent/dist/core/extensions/loader.js');
export const tui = await hostImport('pi-tui/dist/index.js');
const { visibleWidth } = tui;
export const themeModule = await hostImport('pi-coding-agent/dist/modes/interactive/theme/theme.js');
const { initTheme, theme: hostTheme } = themeModule;
export const { KeybindingsManager } = await hostImport('pi-coding-agent/dist/core/keybindings.js');
// Stow links these paths to repository source; dependencies remain local here.
export const extensions = path.join(agentDir, 'extensions') + path.sep;
export const cwd = fileURLToPath(new URL('../../../', import.meta.url));
export const safeBashPath = path.join(agentDir, 'git/github.com/amosblomqvist/pi-interactive-subagents/pi-extension/subagents/tools/safe-bash.ts');
export async function loadTool(path, name) {
  const loaded = await loadExtensions([path], cwd);
  assert.deepEqual(loaded.errors, [], 'host extension load errors');
  const registration = loaded.extensions.flatMap(e => [...e.tools.values()]).find(t => t.definition.name === name);
  assert.ok(registration, `registered ${name}`);
  return registration.definition;
}
export function text(result) { return result.content.filter(c => c.type === 'text').map(c => c.text).join('\n'); }
export async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await run(); } finally { globalThis.fetch = original; }
}
// Never inspect or print the inherited credential. Tests use a fake sentinel.
export async function withFakeKey(run, key = 'FAKE_BRAVE_TEST_SENTINEL') {
  const original = process.env.BRAVE_SEARCH_API_KEY;
  if (key === undefined || key === null) delete process.env.BRAVE_SEARCH_API_KEY;
  else process.env.BRAVE_SEARCH_API_KEY = key;
  try { return await run(); } finally {
    if (original === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = original;
  }
}
initTheme('dark', false);
export const theme = hostTheme;
export function checkRender(tool, args, result) {
  const call = tool.renderCall?.(args, theme, {});
  const output = tool.renderResult?.(result, {expanded: true, isPartial: false}, theme, {isError: false});
  for (const component of [call, output].filter(Boolean)) {
    for (const width of [20, 80]) {
      for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width, `render exceeds ${width} columns`);
    }
    component.invalidate?.();
  }
}
export function streamingResponse(size, type = 'text/plain') {
  return new Response(new ReadableStream({
    start(controller) {
      let left = size;
      while (left > 0) {
        const bytes = new Uint8Array(Math.min(left, 64 * 1024)).fill(65);
        controller.enqueue(bytes);
        left -= bytes.length;
      }
      controller.close();
    },
  }), {headers: {'content-type': type}});
}
export function abortingFetch(_url, {signal}) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  });
}
