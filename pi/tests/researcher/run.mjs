import assert from 'node:assert/strict';
import { loadTool, cwd, text, safeBashPath } from './helpers.mjs';

for (const file of ['search.test.mjs', 'fetch.test.mjs', 'question.test.mjs']) {
  console.log(`Running ${file}`);
  await import(`./${file}`);
}
const safe = await loadTool(safeBashPath, 'safe_bash');
const result = await safe.execute('safe-smoke', {command: "printf 'safe-bash-ok\\n'"}, undefined, undefined, {cwd});
assert.equal(text(result), 'safe-bash-ok\n');
console.log('PASS: bundled safe_bash host loading and harmless execution');
console.log('PASS: all mocked extension tests');
