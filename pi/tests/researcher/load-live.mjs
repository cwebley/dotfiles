import assert from 'node:assert/strict';
import path from 'node:path';
import { agentDir, cwd, loadExtensions } from './helpers.mjs';
const paths = [
  path.join(agentDir, 'extensions/web-search/index.ts'),
  path.join(agentDir, 'extensions/web-fetch/index.ts'),
  path.join(agentDir, 'extensions/ask-user-question.ts'),
];
const loaded = await loadExtensions(paths, cwd);
assert.deepEqual(loaded.errors, []);
const tools = loaded.extensions.flatMap(e => [...e.tools.values()].map(t => t.definition));
assert.deepEqual(tools.map(t => t.name).sort(), ['ask_user_question', 'web_fetch', 'web_search']);
const question = tools.find(t => t.name === 'ask_user_question');
assert.equal(question.exposure, 'model-only');
const unavailable = await question.execute('mode-check', {question:'test'}, undefined, undefined, {mode:'print',hasUI:false});
assert.equal(unavailable.details.status,'unavailable');
console.log('PASS: conventional installed paths load exactly the two web tools and main question UI; noninteractive UI guard holds.');
