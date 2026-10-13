import assert from "node:assert/strict";
import { EventEmitter, getEventListeners } from "node:events";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import test from "node:test";
import { parseQuota, readQuota } from "../../.pi/agent/extensions/subscription-footer/quota.mjs";

const weekly = { usedPercent: 7, windowDurationMins: 10080, resetsAt: 1792344186 };
const fiveHour = { usedPercent: 31.5, windowDurationMins: 300, resetsAt: 1791740000 };
const limits = { limitId: "codex", planType: "prolite", primary: weekly, secondary: null };
const result = { rateLimits: limits, rateLimitsByLimitId: { codex: limits } };
const invalidQuota = /^Codex quota data was invalid or unavailable\.$/;

function fixture({ stubborn = false, onRequest } = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const requests = [];
  const kills = [];
  const spawns = [];
  let pending = "";
  child.stdin.on("data", (chunk) => {
    pending += chunk.toString();
    let newline;
    while ((newline = pending.indexOf("\n")) !== -1) {
      const request = JSON.parse(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      requests.push(request);
      onRequest?.(request, child);
    }
  });
  child.kill = (signal) => {
    kills.push(signal);
    if (!stubborn || signal === "SIGKILL") {
      queueMicrotask(() => {
        child.emit("exit", 0, signal);
        child.emit("close", 0, signal);
      });
    }
    return true;
  };
  const spawnProcess = (...args) => {
    spawns.push(args);
    return child;
  };
  const reply = (id, value) => child.stdout.write(`${JSON.stringify({ id, result: value })}\n`);
  const initialize = () => reply(1, { userAgent: "codex/0.162.1" });
  const assertClean = (signal) => {
    for (const event of ["exit", "close", "error"]) assert.equal(child.listenerCount(event), 0, event);
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      assert.equal(stream.listenerCount("error"), 0);
      assert.equal(stream.destroyed, true);
    }
    assert.equal(child.stdout.listenerCount("data"), 0);
    assert.equal(child.stdout.listenerCount("end"), 0);
    if (signal) assert.equal(getEventListeners(signal, "abort").length, 0);
  };
  return { child, requests, kills, spawns, spawnProcess, reply, initialize, assertClean };
}

function begin(f, options = {}) {
  return readQuota({ timeoutMs: 500, spawnProcess: f.spawnProcess, ...options });
}

async function expectFailure(action, expected = /^Codex quota /) {
  await assert.rejects(action, (error) => {
    assert.match(error.message, expected);
    assert.doesNotMatch(error.message, /PRIVATE|credential|token|secret/i);
    return true;
  });
}

test("parseQuota reads a weekly primary without inventing a five-hour quota", () => {
  assert.deepEqual(parseQuota(result, 12345), {
    observedAt: 12345, planType: "prolite", weekly: { usedPercent: 7, resetAt: 1792344186 },
  });
  assert.equal(Object.hasOwn(parseQuota(result), "fiveHour"), false);
  assert.equal(Number.isFinite(parseQuota(result).observedAt), true);
});

test("parseQuota identifies windows by duration rather than slot", () => {
  assert.deepEqual(parseQuota({ rateLimits: { primary: weekly, secondary: fiveHour } }, 1), {
    observedAt: 1,
    weekly: { usedPercent: 7, resetAt: weekly.resetsAt },
    fiveHour: { usedPercent: 31.5, resetAt: fiveHour.resetsAt },
  });
  assert.deepEqual(parseQuota({ rateLimits: { primary: fiveHour, secondary: weekly } }, 1), {
    observedAt: 1,
    fiveHour: { usedPercent: 31.5, resetAt: fiveHour.resetsAt },
    weekly: { usedPercent: 7, resetAt: weekly.resetsAt },
  });
  assert.deepEqual(parseQuota({ rateLimits: { primary: null, secondary: fiveHour } }, 1), {
    observedAt: 1, fiveHour: { usedPercent: 31.5, resetAt: fiveHour.resetsAt },
  });
});

test("parseQuota selects the map's codex snapshot and never additional limits", () => {
  const unrelated = { limitId: "other", primary: fiveHour };
  assert.deepEqual(parseQuota({ rateLimits: unrelated, rateLimitsByLimitId: { other: unrelated, codex: limits } }, 0), {
    observedAt: 0, planType: "prolite", weekly: { usedPercent: 7, resetAt: weekly.resetsAt },
  });
  assert.deepEqual(parseQuota({ rateLimits: limits, rateLimitsByLimitId: { other: unrelated } }, 0), {
    observedAt: 0, planType: "prolite", weekly: { usedPercent: 7, resetAt: weekly.resetsAt },
  });
  assert.throws(() => parseQuota({ rateLimits: unrelated, rateLimitsByLimitId: { other: unrelated } }), { message: invalidQuota });
  assert.throws(() => parseQuota({ rateLimitsByLimitId: { other: unrelated } }), { message: invalidQuota });
  assert.throws(() => parseQuota({ rateLimits: limits, rateLimitsByLimitId: { codex: unrelated } }), { message: invalidQuota });
  assert.throws(() => parseQuota({ rateLimits: limits, rateLimitsByLimitId: { codex: null } }), { message: invalidQuota });
});

test("parseQuota allows null or omitted root IDs, zero usage and full usage", () => {
  for (const limitId of [null, undefined, "codex"]) {
    for (const usedPercent of [0, 100]) {
      const parsed = parseQuota({ rateLimits: { limitId, primary: { ...weekly, usedPercent } } }, 0);
      assert.equal(parsed.weekly.usedPercent, usedPercent);
    }
  }
});

test("parseQuota ignores unknown durations but does not manufacture known windows", () => {
  const unknown = { ...fiveHour, windowDurationMins: 60 };
  assert.deepEqual(parseQuota({ rateLimits: { primary: weekly, secondary: unknown } }, 1), {
    observedAt: 1, weekly: { usedPercent: 7, resetAt: weekly.resetsAt },
  });
  assert.throws(() => parseQuota({ rateLimits: { primary: unknown } }), { message: invalidQuota });
});

test("parseQuota rejects malformed or missing snapshots with fixed errors", () => {
  for (const input of [null, [], "PRIVATE", {}, { rateLimits: null }, { rateLimits: [] },
    { rateLimits: { primary: null, secondary: null } }, { rateLimits: { primary: "PRIVATE" } },
    { rateLimits: { primary: weekly, secondary: weekly } }]) {
    assert.throws(() => parseQuota(input), { message: invalidQuota });
  }
  for (const observedAt of [NaN, Infinity, -1, "PRIVATE"]) {
    assert.throws(() => parseQuota(result, observedAt), { message: invalidQuota });
  }
});

test("parseQuota rejects invalid numeric fields instead of coercing them", () => {
  for (const usedPercent of [undefined, null, -1, 101, NaN, Infinity, "7"]) {
    assert.throws(() => parseQuota({ rateLimits: { primary: { ...weekly, usedPercent } } }), { message: invalidQuota });
  }
  for (const resetsAt of [undefined, null, 0, -1, NaN, Infinity, "1792344186"]) {
    assert.throws(() => parseQuota({ rateLimits: { primary: { ...weekly, resetsAt } } }), { message: invalidQuota });
  }
  for (const windowDurationMins of [undefined, null, 0, -1, NaN, Infinity, "10080"]) {
    assert.throws(() => parseQuota({ rateLimits: { primary: { ...weekly, windowDurationMins } } }), { message: invalidQuota });
  }
  assert.throws(() => parseQuota({ rateLimits: { primary: weekly, secondary: { ...fiveHour, usedPercent: 101 } } }), { message: invalidQuota });
});

test("readQuota uses keyring app-server and waits for initialize before reading", async () => {
  const f = fixture();
  const controller = new AbortController();
  const before = Date.now();
  const promise = begin(f, { signal: controller.signal });
  assert.deepEqual(f.spawns, [["codex", ["-c", 'cli_auth_credentials_store="keyring"', "app-server", "--listen", "stdio://"], {
    cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"],
  }]]);
  assert.deepEqual(f.requests, [{ jsonrpc: "2.0", id: 1, method: "initialize", params: {
    clientInfo: { name: "pi_subscription_footer", title: "Pi subscription footer", version: "1.0.0" },
  } }]);
  f.initialize();
  assert.deepEqual(f.requests.slice(1), [
    { jsonrpc: "2.0", method: "initialized", params: {} },
    { jsonrpc: "2.0", id: 2, method: "account/rateLimits/read", params: {} },
  ]);
  f.reply(2, result);
  const snapshot = await promise;
  assert.deepEqual(snapshot.weekly, { usedPercent: 7, resetAt: weekly.resetsAt });
  assert.equal(snapshot.planType, "prolite");
  assert.equal(Object.hasOwn(snapshot, "fiveHour"), false);
  assert.ok(snapshot.observedAt >= before && snapshot.observedAt <= Date.now());
  assert.deepEqual(f.kills, ["SIGTERM"]);
  f.assertClean(controller.signal);
});

test("readQuota supports fragmented JSON, CRLF, notifications and unrelated response IDs", async () => {
  const f = fixture();
  const promise = begin(f);
  f.child.stdout.write('{"method":"notification","params":{"text":"PRIVATE"}}\r\n');
  f.reply(99, { primary: fiveHour });
  f.child.stdout.write('{"id":1,"res');
  assert.equal(f.requests.length, 1);
  f.child.stdout.write('ult":{}}\r\n');
  const response = Buffer.from(`${JSON.stringify({ id: 2, result })}\n`);
  f.child.stdout.write(response.subarray(0, 13));
  f.child.stdout.write(response.subarray(13));
  assert.equal((await promise).weekly.usedPercent, 7);
  f.assertClean();
});

test("readQuota handles a final response without a trailing newline", async () => {
  const f = fixture();
  const promise = begin(f);
  f.initialize();
  f.child.stdout.end(JSON.stringify({ id: 2, result }));
  assert.equal((await promise).weekly.usedPercent, 7);
  f.assertClean();
});

test("readQuota drains stderr without retaining it or exposing it", async () => {
  const f = fixture();
  const promise = begin(f);
  f.child.stderr.write("PRIVATE secret credential token\n".repeat(1000));
  assert.equal(f.child.stderr.readableFlowing, true);
  f.initialize();
  f.reply(2, {});
  await expectFailure(promise, invalidQuota);
  f.assertClean();
});

test("readQuota sanitizes RPC errors and stops the handshake", async () => {
  for (const code of [-32000, "PRIVATE", NaN, undefined, 1.5]) {
    const f = fixture();
    const promise = begin(f);
    f.child.stdout.write(`${JSON.stringify({ id: 1, error: { code, message: "PRIVATE token", data: "PRIVATE secret" } })}\n`);
    await expectFailure(promise, code === -32000 ? /^Codex quota RPC failed \(code -32000\)\.$/ : /^Codex quota RPC failed\.$/);
    assert.equal(f.requests.length, 1);
    f.assertClean();
  }
  const f = fixture();
  const promise = begin(f);
  f.initialize();
  f.child.stdout.write('{"id":2,"error":{"code":401,"message":"PRIVATE"}}\n');
  await expectFailure(promise, /^Codex quota RPC failed \(code 401\)\.$/);
  f.assertClean();
});

test("readQuota sanitizes malformed JSON and invalid response shapes", async () => {
  for (const response of ["PRIVATE secret", "null", "[]", "{}", '{"id":1}', '{"id":1,"result":null}']) {
    const f = fixture();
    const promise = begin(f);
    f.child.stdout.write(`${response}\n`);
    await expectFailure(promise, /^Codex quota response was invalid\.$/);
    f.assertClean();
  }
});

test("readQuota rejects invalid quota data safely", async () => {
  const f = fixture();
  const promise = begin(f);
  f.initialize();
  f.reply(2, { rateLimits: { primary: { ...weekly, usedPercent: "PRIVATE secret" } } });
  await expectFailure(promise, invalidQuota);
  f.assertClean();
});

test("readQuota bounds both incomplete and cumulative stdout to 1 MiB", async () => {
  for (const cumulative of [false, true]) {
    const f = fixture();
    const promise = begin(f);
    if (cumulative) {
      const notification = `${JSON.stringify({ method: "notification", params: "x".repeat(4096) })}\n`;
      for (let i = 0; i < 256 && !f.child.stdout.destroyed; i++) f.child.stdout.write(notification);
    } else {
      f.child.stdout.write(Buffer.alloc(1024 * 1024 + 1, 120));
    }
    await expectFailure(promise, /^Codex quota response exceeded the size limit\.$/);
    f.assertClean();
  }
});

test("readQuota sanitizes synchronous spawn exceptions", async () => {
  await expectFailure(readQuota({ spawnProcess() { throw new Error("PRIVATE token"); } }), /^Codex quota process could not be started\.$/);
});

test("readQuota sanitizes child and pipe errors", async () => {
  for (const target of ["child", "stdin", "stdout", "stderr"]) {
    const f = fixture();
    const promise = begin(f);
    (target === "child" ? f.child : f.child[target]).emit("error", new Error("PRIVATE secret token"));
    await expectFailure(promise);
    assert.deepEqual(f.kills, ["SIGTERM"]);
    f.assertClean();
  }
});

test("readQuota sanitizes stdin.write exceptions", async () => {
  const f = fixture();
  f.child.stdin.write = () => { throw new Error("PRIVATE token"); };
  await expectFailure(begin(f), /^Codex quota request could not be sent\.$/);
  f.assertClean();
});

test("readQuota handles early process exit or close without killing an exited child", async () => {
  for (const event of ["exit", "close"]) {
    const f = fixture();
    const promise = begin(f);
    f.child.emit(event, 1, "PRIVATE");
    await expectFailure(promise, /^Codex quota process (exited|closed) before responding\.$/);
    assert.deepEqual(f.kills, []);
    f.assertClean();
  }
});

test("readQuota fails if stdout ends before a response", async () => {
  const f = fixture();
  const promise = begin(f);
  f.child.stdout.end();
  await expectFailure(promise, /^Codex quota process closed its output before responding\.$/);
  f.assertClean();
});

test("readQuota times out and cleans up the child and abort subscription", async () => {
  const f = fixture();
  const controller = new AbortController();
  await expectFailure(begin(f, { timeoutMs: 10, signal: controller.signal }), /^Codex quota read timed out\.$/);
  assert.deepEqual(f.kills, ["SIGTERM"]);
  f.assertClean(controller.signal);
});

test("readQuota aborts safely before spawning or during either RPC stage", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort(new Error("PRIVATE secret"));
  await expectFailure(begin(f, { signal: controller.signal }), /^Codex quota read was canceled\.$/);
  assert.equal(f.spawns.length, 0);
  for (const initialized of [false, true]) {
    const current = fixture();
    const aborter = new AbortController();
    const promise = begin(current, { signal: aborter.signal });
    if (initialized) current.initialize();
    aborter.abort(new Error("PRIVATE token"));
    await expectFailure(promise, /^Codex quota read was canceled\.$/);
    current.assertClean(aborter.signal);
    assert.deepEqual(current.kills, ["SIGTERM"]);
  }
});

test("readQuota notices cancellation during spawn", async () => {
  const f = fixture();
  const controller = new AbortController();
  await expectFailure(readQuota({ signal: controller.signal, spawnProcess(...args) {
    controller.abort("PRIVATE");
    return f.spawnProcess(...args);
  } }), /^Codex quota read was canceled\.$/);
  assert.equal(f.requests.length, 0);
  f.assertClean(controller.signal);
});

test("readQuota force-kills a child that ignores SIGTERM within one second", async () => {
  const f = fixture({ stubborn: true });
  const controller = new AbortController();
  const promise = begin(f, { signal: controller.signal });
  const started = Date.now();
  controller.abort("PRIVATE");
  await expectFailure(promise, /^Codex quota read was canceled\.$/);
  assert.deepEqual(f.kills, ["SIGTERM", "SIGKILL"]);
  assert.ok(Date.now() - started < 1500);
  f.assertClean(controller.signal);
});

test("readQuota resolves once when duplicate responses arrive during cleanup", async () => {
  const f = fixture({ onRequest(request, child) {
    if (request.method === "account/rateLimits/read") {
      const response = `${JSON.stringify({ id: 2, result })}\n`;
      child.stdout.write(response + response + '{"id":2,"error":{"message":"PRIVATE"}}\n');
    }
  } });
  const controller = new AbortController();
  const promise = begin(f, { signal: controller.signal });
  f.initialize();
  controller.abort("PRIVATE");
  assert.equal((await promise).weekly.usedPercent, 7);
  assert.deepEqual(f.kills, ["SIGTERM"]);
  f.assertClean(controller.signal);
});

test("readQuota rejects invalid timeout values without spawning", async () => {
  for (const timeoutMs of [0, -1, NaN, Infinity, "10", 2147483648]) {
    const f = fixture();
    await expectFailure(begin(f, { timeoutMs }), /^Codex quota timeout was invalid\.$/);
    assert.equal(f.spawns.length, 0);
  }
});
