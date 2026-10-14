import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, statSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOL_VERSION, MAX_CONFIG_BYTES, outputLimit, fzfArgs } from './picker-protocol.mjs';

function readBounded(path, limit) {
  if (statSync(path).size > limit) throw new Error('Picker file too large');
  return readFileSync(path, 'utf8');
}
function publish(directory, name, data) {
  const temp = join(directory, name + '.tmp');
  const fd = openSync(temp, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(data) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, join(directory, name));
}
if (process.argv[2] === '--preview') {
  const directory = process.argv[3], id = process.argv[4];
  if (!directory || !/^[1-9]\d*$/.test(id ?? '')) process.exit(1);
  try { process.stdout.write(readBounded(join(directory, id + '.md'), 2 * 1024 * 1024)); } catch { process.stdout.write('Preview unavailable\n'); process.exitCode = 1; }
} else {
  const configPath = process.argv[2];
  let config, child, failure, interrupted = false, escalation;
  const result = (status = null, signal = null, stdout = '') => ({ version: PROTOCOL_VERSION, nonce: config?.nonce, status, signal, stdout, ...(failure ? { error: failure } : {}) });
  const stop = () => {
    interrupted = true;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      escalation = setTimeout(() => child.kill('SIGKILL'), 1000); escalation.unref();
    } else process.exit(130);
  };
  process.on('SIGTERM', stop); process.on('SIGHUP', stop);
  try {
    config = JSON.parse(readBounded(configPath, MAX_CONFIG_BYTES));
    if (config.version !== PROTOCOL_VERSION || !/^[a-f0-9]{32}$/.test(config.nonce ?? '') || resolve(config.directory) !== resolve(dirname(configPath)) || !/^%\d+$/.test(process.env.TMUX_PANE ?? '') || !Array.isArray(config.candidates)) throw new Error('Invalid picker configuration');
    if (config.candidates.some((c, i) => c.id !== String(i + 1) || typeof c.name !== 'string' || typeof c.label !== 'string' || /[\t\r\n\x1b]/.test(c.name + c.label))) throw new Error('Invalid picker candidates');
    execFileSync(config.tmux, ['-S', config.socket, 'set-option', '-p', '-t', process.env.TMUX_PANE, '@pi_snippets_nonce', config.nonce], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 2000 });
    publish(config.directory, 'handshake.json', { version: PROTOCOL_VERSION, nonce: config.nonce, pane: process.env.TMUX_PANE, pid: process.pid });
    const env = { ...process.env, FZF_DEFAULT_OPTS: '', FZF_DEFAULT_OPTS_FILE: '', SHELL: '/bin/sh' };
    child = spawn(config.fzf, fzfArgs(config, fileURLToPath(import.meta.url)), { stdio: ['pipe', 'pipe', 'inherit'], env });
    let output = '', bytes = 0;
    child.stdout.on('data', data => {
      bytes += data.length;
      if (bytes > outputLimit(config.candidates.length)) { failure = 'Picker output limit exceeded'; child.kill('SIGTERM'); if (!escalation) { escalation = setTimeout(() => child.kill('SIGKILL'), 1000); escalation.unref(); } }
      else output += data.toString('utf8');
    });
    child.stdin.on('error', error => { if (!interrupted) failure = error.code === 'EPIPE' ? 'Picker input closed' : 'Picker input failed'; });
    child.on('error', () => { failure = 'Unable to start fzf'; });
    child.on('close', (status, signal) => {
      clearTimeout(escalation);
      if (interrupted) process.exit(130);
      try { publish(config.directory, 'result.json', result(status, signal, output)); } catch { process.exitCode = 1; }
      // Parent owns pane removal. Keep the pane alive briefly for a durable result read.
      const end = Date.now() + 5000;
      const timer = setInterval(() => { if (!existsSync(configPath) || Date.now() >= end) { clearInterval(timer); process.exit(interrupted ? 130 : 0); } }, 100);
    });
    child.stdin.end(config.candidates.map(c => `${c.id}\t${c.name}\t${c.label}`).join('\n') + '\n');
  } catch {
    failure = 'Unable to prepare snippet picker';
    if (config?.directory && existsSync(config.directory)) { try { publish(config.directory, 'result.json', result()); } catch {} }
    process.exitCode = 1;
  }
}
