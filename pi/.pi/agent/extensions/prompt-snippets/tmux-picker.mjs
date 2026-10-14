import { execFile } from 'node:child_process';
import { constants, accessSync, realpathSync, mkdtempSync, chmodSync, writeFileSync, readFileSync, statSync, existsSync, watch, rmSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { MAX_CONFIG_BYTES, MAX_SNAPSHOT_BYTES, PROTOCOL_VERSION, escapeDisplay, safePreview, shellQuote, canonicalCommand, makeCandidates, validateResult, outputLimit } from './picker-protocol.mjs';

const TAG = '@pi_snippets_nonce';
export function parseTmuxContext(env) {
  const match = /^(.*),(\d+),(\d+)$/.exec(env.TMUX ?? '');
  if (!match || !match[1] || !/^%\d+$/.test(env.TMUX_PANE ?? '')) throw new Error('Prompt snippets requires pi inside tmux');
  return { socket: match[1], serverPid: match[2], origin: env.TMUX_PANE };
}
export function resolveExecutable(name, env = process.env) {
  for (const directory of (env.PATH ?? '').split(delimiter)) {
    try { const path = resolve(directory || '.', name); accessSync(path, constants.X_OK); if (statSync(path).isFile()) return realpathSync(path); } catch {}
  }
  throw new Error(`${name} is not available on PATH`);
}
export function supportsVersion(output, major, minor) {
  const match = /(?:^|\s)(\d+)\.(\d+)/.exec(output);
  return !!match && (Number(match[1]) > major || (Number(match[1]) === major && Number(match[2]) >= minor));
}
export function ownershipExpression(command, nonce, tagged) {
  // The fixed executable/config paths are rejected if they contain format syntax.
  const sameCommand = '#{==:#{pane_start_command},' + canonicalCommand(command) + '}';
  return tagged ? '#{&&:' + sameCommand + ',#{==:#{' + TAG + '},' + nonce + '}}' : sameCommand;
}
export function focusExpression(origin, client) {
  const parts = ['#{==:#{L:#{?client_session,x,}},x}', '#{==:#{session_attached_list},' + client + '}', '#{==:#{pane_id},' + origin + '}',
    '#{==:#{pane_active},1}', '#{==:#{window_active},1}', '#{==:#{session_attached},1}', '#{==:#{L:#{?client_session,#{m:*active-pane*,#{client_flags}},}},0}'];
  return parts.reduce((a, b) => '#{&&:' + a + ',' + b + '}');
}
function readJSON(path, limit) {
  const stat = statSync(path); if (!stat.isFile() || stat.size > limit) throw new Error('Picker file exceeds its limit');
  return JSON.parse(readFileSync(path, 'utf8'));
}
export class TmuxPicker {
  constructor({ helperPath, onCommit, onError, onDetached, env = process.env, execute } = {}) {
    this.helperPath = realpathSync(helperPath); this.onCommit = onCommit; this.onError = onError; this.onDetached = onDetached;
    this.env = env; this.execute = execute; this.generation = 0; this.current = undefined; this.blocked = false;
  }
  command(run, args) {
    if (this.execute) return this.execute(run, args);
    return new Promise((resolvePromise, reject) => execFile(run.tmux, ['-S', run.socket, ...args],
      { timeout: 2500, maxBuffer: 1024 * 1024, env: { ...this.env, TMUX: '' } }, (error, stdout) => {
        if (error) reject(new Error(`tmux ${args[0]} failed (${error.killed ? 'timeout' : error.code ?? 'error'})`)); else resolvePromise(stdout.trimEnd());
      }));
  }
  async open(snippets, enabled) {
    if (this.blocked) { this.onError?.('A previous snippet pane could not be safely cleaned up. Remove that pane manually and reload pi.'); return; }
    if (this.current) {
      const run = this.current;
      if (!run.cancelled && !run.finishing && run.pane && run.ready) await this.focus(run).catch(() => this.finish(run, { kind: 'error', reason: 'Unable to focus snippet pane' }));
      return;
    }
    const run = { generation: ++this.generation, nonce: randomBytes(16).toString('hex'), cancelled: false, finishing: false, tagged: false, candidates: makeCandidates(snippets, enabled) };
    this.current = run;
    // Reservation happens before the first await; cancellation can invalidate launch immediately.
    run.launch = this.launch(run).catch(error => { run.launchError = error; });
    await run.launch;
    if (run.launchError) await this.finish(run, { kind: 'error', reason: run.launchError.message });
    else if (run.cancelled) await this.teardown(run);
  }
  async launch(run) {
    Object.assign(run, parseTmuxContext(this.env));
    run.tmux = resolveExecutable('tmux', this.env); run.fzf = resolveExecutable('fzf', this.env);
    const tmuxVersion = await this.command(run, ['-V']);
    if (!supportsVersion(tmuxVersion, 3, 5)) throw new Error('Prompt snippets requires tmux 3.5 or newer');
    const fzfVersion = await new Promise((res, rej) => execFile(run.fzf, ['--version'], { timeout: 2500, maxBuffer: 65536, env: { ...this.env, FZF_DEFAULT_OPTS: '', FZF_DEFAULT_OPTS_FILE: '' } }, (error, out) => error ? rej(new Error('Unable to check fzf')) : res(out)));
    if (!supportsVersion(fzfVersion, 0, 62)) throw new Error('Prompt snippets requires fzf 0.62 or newer');
    if (run.cancelled) return;
    const identity = await this.command(run, ['display-message', '-p', '-t', run.origin, '#{pid}\t#{pane_id}\t#{session_id}\t#{window_id}']);
    const [pid, pane, session, window] = identity.split('\t');
    if (pid !== run.serverPid || pane !== run.origin || !/^\$\d+$/.test(session ?? '') || !/^@\d+$/.test(window ?? '')) throw new Error('Unable to identify the originating tmux pane');
    run.session = session; run.window = window;
    const clients = (await this.command(run, ['list-clients', '-F', '#{client_name}\t#{client_flags}'])).split('\n').filter(Boolean);
    if (clients.length === 1) {
      const [name, flags] = clients[0].split('\t');
      if (name && !/[#,\r\n]/.test(name) && !flags?.split(',').includes('active-pane')) run.client = name;
    }
    if (run.cancelled) return;
    run.directory = mkdtempSync(join(tmpdir(), 'pi-snippets-')); chmodSync(run.directory, 0o700);
    run.startCommand = 'exec ' + [process.execPath, this.helperPath, join(run.directory, 'config.json')].map(shellQuote).join(' ');
    if (/[#,\r\n]/.test(run.startCommand)) throw new Error('Picker executable paths cannot contain commas, #, or newlines');
    const candidates = run.candidates.map(({ raw, ...c }) => c);
    for (const c of run.candidates) {
      if (Buffer.byteLength(c.raw) > MAX_SNAPSHOT_BYTES) throw new Error('A snippet is too large to preview');
      writeFileSync(join(run.directory, c.id + '.md'), escapeDisplay(c.filename) + '\n\n' + safePreview(c.raw), { mode: 0o600 });
    }
    const config = JSON.stringify({ version: PROTOCOL_VERSION, nonce: run.nonce, directory: run.directory, tmux: run.tmux, socket: run.socket, fzf: run.fzf, candidates });
    if (Buffer.byteLength(config) > MAX_CONFIG_BYTES) throw new Error('Too many snippets for the picker');
    writeFileSync(join(run.directory, 'config.json'), config, { mode: 0o600 });
    run.watcher = watch(run.directory, () => { void this.consume(run); });
    run.timer = setInterval(() => { void this.consume(run); }, 250);
    run.liveness = setInterval(() => { void this.checkPane(run); }, 1000);
    if (run.cancelled) return;
    const paneId = await this.command(run, ['split-window', '-d', '-v', '-f', '-p', '40', '-t', run.origin, '-P', '-F', '#{pane_id}', run.startCommand]);
    if (!/^%\d+$/.test(paneId)) throw new Error('tmux did not return a picker pane');
    run.pane = paneId;
    // The handshake is consumed by the watcher/reconciliation timer, never inferred from focus.
    await this.consume(run);
  }
  async consume(run) {
    if (run.finishing || run.cancelled || this.current !== run || !run.directory) return;
    try {
      const handshake = join(run.directory, 'handshake.json');
      if (!run.tagged && existsSync(handshake)) {
        const data = readJSON(handshake, 4096);
        if (data.version !== PROTOCOL_VERSION || data.nonce !== run.nonce || !/^%\d+$/.test(data.pane ?? '') || (run.pane && data.pane !== run.pane)) throw new Error('Invalid pane ownership handshake');
        run.pane = data.pane; run.tagged = true;
        if (Number.isSafeInteger(data.pid) && data.pid > 0) run.helperPid = data.pid;
        if (!run.ready) {
          run.ready = true;
          // Never await focus before reading a possible early authoritative result.
          void this.focus(run).catch(() => this.finish(run, { kind: 'error', reason: 'Unable to focus snippet pane' }));
        }
      }
      const resultPath = join(run.directory, 'result.json');
      if (existsSync(resultPath)) {
        const result = readJSON(resultPath, outputLimit(run.candidates.length) + 65536);
        const verdict = validateResult(result, run.nonce, run.candidates);
        void this.finish(run, verdict);
      }
    } catch { void this.finish(run, { kind: 'error', reason: 'Invalid snippet picker result' }); }
  }
  async focus(run) {
    if (run.cancelled || run.finishing || this.current !== run || !run.pane) return;
    if (!run.client) { this.onDetached?.(); return; }
    // Ownership and originating-focus formats need different target panes. Nest server-side conditions.
    const owned = ownershipExpression(run.startCommand, run.nonce, true);
    const choose = ['if-shell', '-F', '-t', run.pane, owned, 'select-pane -t ' + run.pane, ''].map(shellQuote).join(' ');
    await this.command(run, ['if-shell', '-F', '-t', run.origin, focusExpression(run.origin, run.client), choose, '']);
    if (run.cancelled || run.finishing || this.current !== run) return;
    // Nested command output is not reliably forwarded to this command client.
    // Observe attached-client focus only for reporting; selection still uses the server-side guard.
    const clients = await this.command(run, ['list-clients', '-F', '#{client_name}\t#{session_id}\t#{window_id}\t#{pane_id}']);
    const focused = clients.split('\n').some(line => line === [run.client, run.session, run.window, run.pane].join('\t'));
    if (!focused && !run.cancelled && !run.finishing && this.current === run) this.onDetached?.();
  }
  async checkPane(run) {
    if (run.checking || run.finishing || run.cancelled || !run.pane) return;
    run.checking = true;
    try {
      const panes = await this.command(run, ['list-panes', '-a', '-F', '#{pane_id}']);
      if (!panes.split('\n').includes(run.pane)) { await this.consume(run); if (!run.finishing) void this.finish(run, { kind: 'cancel' }); }
    } catch { void this.finish(run, { kind: 'error', reason: 'Lost connection to snippet pane' }); }
    finally { run.checking = false; }
  }
  finish(run, verdict) {
    if (run.finishing) return run.cleanup;
    run.finishing = true;
    if (!run.cancelled && this.current === run && run.generation === this.generation) {
      // Synchronous validation/commit before any awaited cleanup is the send/confirm boundary.
      if (verdict.kind === 'confirm') this.onCommit?.(verdict.ids);
      else if (verdict.kind === 'error') run.error = verdict.reason;
    }
    return this.teardown(run);
  }
  invalidate() {
    const run = this.current;
    if (!run) return Promise.resolve();
    ++this.generation; run.cancelled = true;
    return this.teardown(run);
  }
  teardown(run) {
    if (run.cleanup) return run.cleanup;
    run.cleanup = (async () => {
      await run.launch;
      run.watcher?.close(); clearInterval(run.timer); clearInterval(run.liveness);
      let safe = true;
      try {
        if (run.directory && !run.tagged && existsSync(join(run.directory, 'handshake.json'))) {
          const handshake = readJSON(join(run.directory, 'handshake.json'), 4096);
          if (handshake.version !== PROTOCOL_VERSION || handshake.nonce !== run.nonce || !/^%\d+$/.test(handshake.pane ?? '')) throw new Error('Invalid cleanup handshake');
          run.pane = handshake.pane; run.tagged = true;
          if (Number.isSafeInteger(handshake.pid) && handshake.pid > 0) run.helperPid = handshake.pid;
        }
        if (run.startCommand) {
          const listing = await this.command(run, ['list-panes', '-a', '-F', '#{pane_id}\t#{pane_start_command}\t#{' + TAG + '}']);
          const rows = listing.split('\n').filter(Boolean).map(line => line.split('\t'));
          const exact = rows.filter(row => row[1] === canonicalCommand(run.startCommand));
          if (run.pane && rows.some(row => row[0] === run.pane && !exact.some(own => own[0] === run.pane))) safe = false;
          for (const [pane, , tag] of exact) {
            if (run.tagged && tag !== run.nonce) { safe = false; continue; }
            const expression = ownershipExpression(run.startCommand, run.nonce, run.tagged);
            await this.command(run, ['if-shell', '-F', '-t', pane, expression, 'kill-pane -t ' + pane, '']);
          }
          const remaining = await this.command(run, ['list-panes', '-a', '-F', '#{pane_id}\t#{pane_start_command}']);
          if (remaining.split('\n').some(line => line.split('\t')[1] === canonicalCommand(run.startCommand))) safe = false;
        }
      } catch {
        // A disappeared socket/server has no live pane to destroy; otherwise fail closed.
        if (run.socket && existsSync(run.socket)) safe = false;
      }
      if (safe && run.helperPid) {
        const deadline = Date.now() + 2000;
        for (;;) {
          let alive = false;
          try { process.kill(run.helperPid, 0); alive = true; } catch (error) { if (error.code !== 'ESRCH') alive = true; }
          if (!alive) break;
          if (Date.now() >= deadline) { safe = false; break; }
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }
      if (run.directory) {
        if (safe) rmSync(run.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
        else {
          for (const c of run.candidates) rmSync(join(run.directory, c.id + '.md'), { force: true });
          rmSync(join(run.directory, 'config.json'), { force: true });
          rmSync(join(run.directory, 'result.json'), { force: true });
          writeFileSync(join(run.directory, 'ownership.json'), JSON.stringify({ nonce: run.nonce, socket: run.socket, pane: run.pane, startCommand: run.startCommand }), { mode: 0o600 });
        }
      }
      if (!safe) { this.blocked = true; this.onError?.('Snippet pane ownership changed or cleanup failed. No unrelated pane was closed. Remove the picker manually and reload pi.'); }
      else if (run.error && !run.cancelled) this.onError?.(run.error);
      if (this.current === run) this.current = undefined;
    })().catch(() => {
      // Filesystem failures must not reject fire-and-forget input/watch cleanup.
      // Retain ownership evidence and block launches rather than guessing what survived.
      clearInterval(run.timer); clearInterval(run.liveness);
      this.blocked = true;
      if (this.current === run) this.current = undefined;
      this.onError?.('Snippet cleanup failed. Remove the picker manually and reload pi.');
    });
    return run.cleanup;
  }
}
