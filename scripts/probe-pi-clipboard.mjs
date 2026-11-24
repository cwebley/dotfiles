#!/usr/bin/env node
// Read image metadata using the managed Pi installation's own reader.
// Does not print image contents, write files, or alter the clipboard.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

try {
  const root = join(homedir(), '.pi/agent/install');
  const version = (await readFile(join(root, 'current-version'), 'utf8')).trim();
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) {
    throw new Error('Unrecognized managed Pi version; no clipboard read attempted');
  }
  const modulePath = join(root, 'releases', version, 'node_modules',
    '@earendil-works/pi-coding-agent/dist/utils/clipboard-image.js');
  const { readClipboardImage } = await import(pathToFileURL(modulePath).href);
  if (!process.stdin.isTTY) throw new Error('Run in an interactive shell pane');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question('Take a screenshot to the clipboard now, then press Enter here. ');
  } finally {
    rl.close();
  }
  const image = await readClipboardImage();
  console.log(`Pi reader version: ${version}`);
  if (!image) {
    console.log('RESULT: Pi reader found no supported clipboard image.');
    process.exitCode = 1;
  } else {
    console.log(`RESULT: image found, format=${image.mimeType}, bytes=${image.bytes.length}`);
  }
} catch (error) {
  console.error(`Probe failed: ${error.message}`);
  process.exitCode = 1;
}
