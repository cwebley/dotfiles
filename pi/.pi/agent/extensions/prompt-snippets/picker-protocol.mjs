import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const PROTOCOL_VERSION = 1;
export const MAX_CONFIG_BYTES = 4 * 1024 * 1024;
export const MAX_SNAPSHOT_BYTES = 1024 * 1024;
export const escapeDisplay = text => String(text).replace(/[\x00-\x1f\x7f-\x9f]/g, c => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
export function safePreview(text) {
  return String(text).replace(/\r\n/g, '\n').split('\n').map(line => {
    let column = 0;
    return [...line].map(c => {
      if (c === '\t') { const spaces = 4 - column % 4; column += spaces; return ' '.repeat(spaces); }
      const out = escapeDisplay(c); column += [...out].length; return out;
    }).join('');
  }).join('\n');
}
export const shellQuote = text => "'" + String(text).replace(/'/g, "'\\''") + "'";
export const canonicalCommand = command => '"' + command.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
export function parseSnippet(filename, raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  const body = match[2].trim();
  if (!body) return null;
  const order = Number.parseInt(meta.order ?? '', 10);
  return { id: filename, name: meta.name || filename.replace(/\.md$/i, ''), description: meta.description ?? '',
    placement: meta.placement === 'prepend' ? 'prepend' : 'append', order: Number.isFinite(order) ? order : 9999, body, raw };
}
export function loadSnippets(directory) {
  let files;
  try { files = readdirSync(directory); } catch { return []; }
  const snippets = [];
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    try { const snippet = parseSnippet(file, readFileSync(join(directory, file), 'utf8')); if (snippet) snippets.push(snippet); } catch { /* Unreadable snippets are omitted. */ }
  }
  return snippets.sort((a, b) => (a.placement === 'prepend' ? 0 : 1) - (b.placement === 'prepend' ? 0 : 1) || a.order - b.order || a.name.localeCompare(b.name));
}
export function composePrompt(snippets, enabled, text) {
  const active = snippets.filter(s => enabled.has(s.id));
  return active.length ? [...active.filter(s => s.placement === 'prepend').map(s => s.body), text,
    ...active.filter(s => s.placement === 'append').map(s => s.body)].join('\n\n') : text;
}
export function makeCandidates(snippets, enabled) {
  return snippets.map((s, index) => ({ id: String(index + 1), filename: s.id, name: escapeDisplay(s.name),
    label: `[${s.placement}]`.padEnd(9), raw: s.raw, selected: enabled.has(s.id) }));
}
export function outputLimit(count) { return Math.max(4096, count * 16 + 128); }
export function fzfArgs(config, helperPath) {
  const args = ['--multi', '--sync', '--layout=reverse', '--border', '--delimiter=\t', '--with-nth={3}  \t{2}',
    '--nth=2', '--accept-nth=1', '--marker=✓', '--preview-window=right,60%,wrap,<60(down,50%,wrap)',
    '--preview=' + shellQuote(process.execPath) + ' ' + shellQuote(helperPath) + ' --preview ' + shellQuote(config.directory) + ' {1}',
    '--bind=ctrl-n:down,ctrl-p:up,ctrl-j:preview-down,ctrl-k:preview-up,ctrl-u:clear-query,tab:toggle,shift-tab:toggle,esc:abort',
    '--bind=enter:transform:printf "print(snippet-confirm:%s)+accept" "$FZF_SELECT_COUNT"'];
  const selected = config.candidates.filter(c => c.selected).map(c => `pos(${Number(c.id)})+select`);
  if (selected.length) args.push('--bind=load:' + selected.join('+') + '+first');
  return args;
}
export function validateResult(result, nonce, candidates) {
  const error = reason => ({ kind: 'error', reason });
  if (!result || result.version !== PROTOCOL_VERSION || result.nonce !== nonce) return error('Invalid picker envelope');
  if (result.error || result.signal || typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > outputLimit(candidates.length)) return error('Picker process failed');
  if (result.status === 130 && result.stdout === '') return { kind: 'cancel' };
  if (![0, 1].includes(result.status)) return error('Unexpected picker exit');
  const lines = result.stdout.endsWith('\n') ? result.stdout.slice(0, -1).split('\n') : result.stdout.split('\n');
  const marker = /^snippet-confirm:(0|[1-9]\d*)$/.exec(lines.shift() ?? '');
  if (!marker) return error('Missing selection confirmation');
  const count = Number(marker[1]);
  const known = new Map(candidates.map(c => [c.id, c.filename]));
  if (!Number.isSafeInteger(count) || count > candidates.length || lines.some(id => !/^[1-9]\d*$/.test(id) || !known.has(id)) || new Set(lines).size !== lines.length) return error('Invalid selected identifiers');
  if (count === 0) {
    if (lines.length > 1) return error('Unexpected empty-selection output');
    return { kind: 'confirm', ids: [] };
  }
  if (result.status !== 0 || count !== lines.length) return error('Selection count mismatch');
  return { kind: 'confirm', ids: lines.map(id => known.get(id)) };
}
