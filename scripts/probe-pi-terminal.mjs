#!/usr/bin/env node
// Test the managed Pi's real keyboard negotiation without starting a session.
// No clipboard access. Ordinary text/paste contents are redacted.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let terminal;
let timer;
try {
  if (!process.stdin.isTTY) throw new Error('Run in an interactive shell pane');
  const root = join(homedir(), '.pi/agent/install');
  const version = (await readFile(join(root, 'current-version'), 'utf8')).trim();
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) {
    throw new Error('Unrecognized managed Pi version');
  }
  const dist = join(root, 'releases', version, 'node_modules', '@earendil-works/pi-tui/dist');
  const { ProcessTerminal } = await import(pathToFileURL(join(dist, 'terminal.js')).href);
  const { matchesKey } = await import(pathToFileURL(join(dist, 'keys.js')).href);
  terminal = new ProcessTerminal();
  console.log(`Pi terminal version: ${version}`);
  console.log('Press Control+V once. Wait up to 15 seconds for RESULT. Control+C stops early.');
  console.log('No clipboard access. Text and paste contents are redacted.');
  const events = [];
  const result = await new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timeout: true, events }), 15000);
    terminal.start((data) => {
      // Classify replies and pastes without printing their potentially private payloads.
      const safe = /^[\x00-\x1f\x7f]$/.test(data) || /^\x1b\[[?>]?[0-9;:]*[A-Za-z~]$/.test(data);
      let kind = 'text-or-unknown';
      if (data.startsWith('\x1b[200~')) kind = 'bracketed-paste';
      else if (data.startsWith('\x1b]')) kind = 'OSC-reply';
      else if (data.startsWith('\x1bP')) kind = 'DCS-reply';
      else if (data.startsWith('\x1b[')) kind = 'CSI-sequence';
      else if (safe) kind = 'control-character';
      const event = {
        kind,
        length: Buffer.byteLength(data),
        bytes: safe ? Buffer.from(data).toString('hex') : '[redacted]',
        ctrlV: matchesKey(data, 'ctrl+v'),
        superV: matchesKey(data, 'super+v'),
        kitty: terminal.kittyProtocolActive,
        modifyOtherKeys: terminal.modifyOtherKeysActive,
      };
      if (events.length < 32) events.push(event);
      if (event.ctrlV || event.superV || matchesKey(data, 'ctrl+c')) {
        resolve({ events });
      }
    }, () => {});
  });
  clearTimeout(timer);
  terminal.stop();
  terminal = undefined;
  console.log('\nRESULT:', JSON.stringify(result));
} catch (error) {
  console.error(`Probe failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  terminal?.stop();
}
