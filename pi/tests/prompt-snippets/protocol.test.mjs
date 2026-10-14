import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseSnippet, loadSnippets, composePrompt, escapeDisplay, safePreview, makeCandidates, validateResult, fzfArgs, canonicalCommand } from '../../.pi/agent/extensions/prompt-snippets/picker-protocol.mjs';
import { parseTmuxContext, supportsVersion, ownershipExpression, focusExpression } from '../../.pi/agent/extensions/prompt-snippets/tmux-picker.mjs';

const raw = (name, placement, order, body) => `---\nname: ${name}\nplacement: ${placement}\norder: ${order}\n---\n${body}`;
const a = parseSnippet('a.md', raw('Alpha', 'prepend', 10, 'A'));
const b = parseSnippet('b.md', raw('Beta', 'append', 5, 'B'));
const candidates = makeCandidates([a, b], new Set(['b.md']));
const envelope = (stdout, status = 0, extra = {}) => ({ version: 1, nonce: 'test', status, signal: null, stdout, ...extra });

test('parser retains original defaults, quotes, CRLF, and exact filename identity', () => {
  const s = parseSnippet("odd\t'名.md", '---\r\nname: "Quoted"\r\norder: nope\r\n---\r\n body \r\n');
  assert.equal(s.id, "odd\t'名.md"); assert.equal(s.name, 'Quoted'); assert.equal(s.placement, 'append'); assert.equal(s.order, 9999); assert.equal(s.body, 'body');
  assert.equal(parseSnippet('x.md', 'no frontmatter'), null);
  assert.equal(parseSnippet('x.md', '---\nname: Empty\n---\n \n'), null);
  assert.equal(parseSnippet('fallback.MD', '---\n---\ntext')?.name, undefined, 'same frontmatter contract as original parser');
});
test('loader sorts prepend/append then configured order and name; skips invalid files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snippet-unit-'));
  try {
    writeFileSync(join(dir, 'b.md'), b.raw); writeFileSync(join(dir, 'a.md'), a.raw);
    writeFileSync(join(dir, 'c.md'), raw('Earlier', 'prepend', 2, 'C'));
    writeFileSync(join(dir, 'bad.md'), 'invalid'); writeFileSync(join(dir, 'ignored.txt'), a.raw);
    const snippets = loadSnippets(dir);
    assert.deepEqual(snippets.map(s => s.id), ['c.md', 'a.md', 'b.md']);
    assert.equal(composePrompt(snippets, new Set(['b.md', 'a.md', 'c.md']), 'USER'), 'C\n\nA\n\nUSER\n\nB');
    assert.equal(composePrompt(snippets, new Set(['vanished.md']), 'USER'), 'USER');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('names, row labels and preview controls cannot inject delimiters or terminal sequences', () => {
  assert.equal(escapeDisplay('a\tb\n\x1b[31m\x9b'), 'a\\x09b\\x0a\\x1b[31m\\x9b');
  assert.equal(safePreview('a\tb\r\n\x1b[31m\r\n'), 'a   b\n\\x1b[31m\n');
  assert.equal(candidates[0].label.length, candidates[1].label.length);
  assert.deepEqual(candidates.map(c => [c.id, c.filename, c.selected]), [['1', 'a.md', false], ['2', 'b.md', true]]);
});
test('strict valid confirmations distinguish explicit empty from highlighted fallback', () => {
  assert.deepEqual(validateResult(envelope('snippet-confirm:2\n2\n1\n'), 'test', candidates), { kind: 'confirm', ids: ['b.md', 'a.md'] });
  for (const [out, status] of [['snippet-confirm:0\n1\n', 0], ['snippet-confirm:0\n', 1], ['snippet-confirm:0', 0]]) {
    assert.deepEqual(validateResult(envelope(out, status), 'test', candidates), { kind: 'confirm', ids: [] });
  }
  assert.deepEqual(validateResult(envelope('', 130), 'test', candidates), { kind: 'cancel' });
});
test('malformed result never becomes a partial selection', () => {
  const bad = [envelope('snippet-confirm:1\n9\n'), envelope('snippet-confirm:2\n1\n1\n'), envelope('snippet-confirm:2\n1\n'),
    envelope('snippet-confirm:0\n1\n2\n'), envelope('snippet-confirm:01\n1\n'), envelope('snippet-confirm:1\n1\n\n'),
    envelope('snippet-confirm:1\n1\n', 1), envelope('snippet-confirm:1\n1\n', 130), envelope('snippet-confirm:1\n1\n', 0, { nonce: 'wrong' }),
    envelope('snippet-confirm:1\n1\n', 0, { signal: 'SIGTERM' }), envelope('snippet-confirm:1\n1\n', 0, { error: 'spawn' }),
    envelope('snippet-confirm:9999999999999999999999\n'), envelope('snippet-confirm:1\n1\r\n')];
  for (const result of bad) assert.equal(validateResult(result, 'test', candidates).kind, 'error', JSON.stringify(result));
});
test('fzf options expose only names to filtering and return original numeric IDs', () => {
  const config = { directory: '/tmp/example', candidates };
  const args = fzfArgs(config, '/tmp/helper.mjs');
  assert.ok(args.includes('--nth=2')); assert.ok(args.includes('--accept-nth=1'));
  assert.ok(args.includes('--preview-window=right,60%,wrap,<60(down,50%,wrap)'));
  assert.ok(!args.some(a => a.startsWith('--header')));
  assert.ok(args.some(a => a.includes('ctrl-u:clear-query') && a.includes('ctrl-j:preview-down')));
  assert.ok(args.includes('--bind=load:pos(2)+select+first'));
  const rows = candidates.map(c => `${c.id}\t${c.name}\t${c.label}`).join('\n') + '\n';
  for (const [query, matches] of [['Alpha', ['1']], ['Beta', ['2']], ['append', []], ['a.md', []]]) {
    const p = spawnSync('fzf', ['--delimiter=\t', '--with-nth={3}  \t{2}', '--nth=2', '--accept-nth=1', '--filter=' + query],
      { input: rows, encoding: 'utf8', env: { ...process.env, FZF_DEFAULT_OPTS: '', FZF_DEFAULT_OPTS_FILE: '' } });
    assert.ifError(p.error); assert.deepEqual(p.stdout.trim() ? p.stdout.trim().split('\n').map(row => row.split('\t')[0]) : [], matches);
  }
});
test('tmux context parses socket commas from right and rejects implicit target', () => {
  assert.deepEqual(parseTmuxContext({ TMUX: '/tmp/a,b,123,0', TMUX_PANE: '%7' }), { socket: '/tmp/a,b', serverPid: '123', origin: '%7' });
  assert.throws(() => parseTmuxContext({ TMUX: '/tmp/a,123,0' }));
  assert.ok(supportsVersion('tmux 3.5a', 3, 5)); assert.ok(!supportsVersion('tmux 3.4', 3, 5));
  assert.ok(supportsVersion('0.62.0 (brew)', 0, 62));
});
test('ownership checks require command and tag, focus includes originating-client guard', () => {
  const command = "exec '/path with spaces/node' 'helper' 'config'";
  assert.equal(canonicalCommand(command), '"' + command + '"');
  assert.ok(ownershipExpression(command, 'nonce', true).includes('@pi_snippets_nonce'));
  assert.ok(ownershipExpression(command, 'nonce', true).includes('pane_start_command'));
  assert.ok(!ownershipExpression(command, 'nonce', false).includes('@pi_snippets_nonce'));
  const focus = focusExpression('%1', '/dev/pts/1');
  for (const part of ['client_session', 'session_attached_list', 'pane_active', 'window_active', 'active-pane']) assert.ok(focus.includes(part));
});
