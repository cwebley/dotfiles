import { appendFileSync } from 'node:fs';
export function log(data: Record<string, unknown>) {
  appendFileSync(process.env.SPIKE_LOG!, JSON.stringify({time: Date.now(), ...data}) + '\n');
}
export function observeWrites() {
  const original = process.stdout.write;
  process.stdout.write = function (...args: any[]) {
    log({event: 'pi-write', bytes: Buffer.byteLength(String(args[0]))});
    return original.apply(this, args as any);
  } as any;
}
