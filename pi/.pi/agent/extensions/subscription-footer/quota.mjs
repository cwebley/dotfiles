import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { StringDecoder } from "node:string_decoder";

const MAX_OUTPUT_BYTES = 1024 * 1024;
const KILL_GRACE_MS = 1000;
const INVALID_QUOTA = "Codex quota data was invalid or unavailable.";
const INVALID_RESPONSE = "Codex quota response was invalid.";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Parse the Codex snapshot. Reset timestamps remain in Unix seconds. */
export function parseQuota(result, observedAt = Date.now()) {
  const invalid = () => {
    throw new Error(INVALID_QUOTA);
  };
  if (!isRecord(result) || !Number.isFinite(observedAt) || observedAt < 0) invalid();

  const byId = result.rateLimitsByLimitId;
  const hasCodex = isRecord(byId) && Object.hasOwn(byId, "codex");
  const limits = hasCodex ? byId.codex : result.rateLimits;
  if (!isRecord(limits) || (limits.limitId != null && limits.limitId !== "codex")) invalid();

  const snapshot = { observedAt };
  if (typeof limits.planType === "string" && limits.planType.length > 0) {
    snapshot.planType = limits.planType;
  }
  for (const window of [limits.primary, limits.secondary]) {
    if (window == null) continue;
    if (!isRecord(window) || !Number.isFinite(window.windowDurationMins) || window.windowDurationMins <= 0) {
      invalid();
    }
    const name = window.windowDurationMins === 10080 ? "weekly"
      : window.windowDurationMins === 300 ? "fiveHour" : undefined;
    // Other durations are not substitutes for the weekly or five-hour quota.
    if (!name) continue;
    if (!Number.isFinite(window.usedPercent) || window.usedPercent < 0 || window.usedPercent > 100
      || !Number.isFinite(window.resetsAt) || window.resetsAt <= 0 || snapshot[name]) {
      invalid();
    }
    snapshot[name] = { usedPercent: window.usedPercent, resetAt: window.resetsAt };
  }
  if (!snapshot.weekly && !snapshot.fiveHour) invalid();
  return snapshot;
}

/** Read quota through the authenticated Codex CLI without reading credentials. */
export async function readQuota({ signal, timeoutMs = 20000, spawnProcess = spawn } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    throw new Error("Codex quota timeout was invalid.");
  }
  if (signal?.aborted) throw new Error("Codex quota read was canceled.");

  return new Promise((resolve, reject) => {
    let child;
    let settled = false;
    let exited = false;
    let timeout;
    let expectedId = 1;
    let bytes = 0;
    let pending = "";
    const decoder = new StringDecoder("utf8");
    const subscriptions = [];

    function listen(emitter, event, handler) {
      emitter.on(event, handler);
      subscriptions.push(() => emitter.removeListener(event, handler));
    }

    function finish(error, snapshot) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      for (const unsubscribe of subscriptions) unsubscribe();

      const deliver = () => error ? reject(error) : resolve(snapshot);
      if (!child) {
        deliver();
        return;
      }

      // Keep errors handled during shutdown, but remove every owned listener
      // when the child exits or the bounded SIGKILL fallback has run.
      const ignoreError = () => {};
      const streams = [child.stdin, child.stdout, child.stderr].filter(Boolean);
      let killTimer;
      let cleaned = false;
      function complete() {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(killTimer);
        child.removeListener("exit", complete);
        child.removeListener("close", complete);
        child.removeListener("error", ignoreError);
        for (const stream of streams) stream.removeListener("error", ignoreError);
        deliver();
      }
      child.on("error", ignoreError);
      child.on("exit", complete);
      child.on("close", complete);
      for (const stream of streams) {
        stream.on("error", ignoreError);
        stream.destroy();
      }
      if (exited) {
        complete();
        return;
      }
      killTimer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* Never expose process errors. */ }
        complete();
      }, KILL_GRACE_MS);
      try { child.kill("SIGTERM"); } catch { /* The fallback still runs. */ }
    }

    function fail(message) {
      finish(new Error(message));
    }

    function onAbort() {
      fail("Codex quota read was canceled.");
    }

    function send(message) {
      if (settled) return;
      try {
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
      } catch {
        fail("Codex quota request could not be sent.");
      }
    }

    function handleLine(line) {
      if (settled || line.trim() === "") return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        fail(INVALID_RESPONSE);
        return;
      }
      if (!isRecord(message)) {
        fail(INVALID_RESPONSE);
        return;
      }
      // App-server notifications and responses to other IDs carry no quota.
      if (!Object.hasOwn(message, "id")) {
        if (typeof message.method !== "string") fail(INVALID_RESPONSE);
        return;
      }
      if (message.id !== expectedId) return;
      if (Object.hasOwn(message, "error")) {
        const code = message.error?.code;
        fail(Number.isSafeInteger(code) ? `Codex quota RPC failed (code ${code}).` : "Codex quota RPC failed.");
        return;
      }
      if (!Object.hasOwn(message, "result")) {
        fail(INVALID_RESPONSE);
        return;
      }
      if (expectedId === 1) {
        if (!isRecord(message.result)) {
          fail(INVALID_RESPONSE);
          return;
        }
        expectedId = 2;
        send({ method: "initialized", params: {} });
        send({ id: 2, method: "account/rateLimits/read", params: {} });
      } else {
        let snapshot;
        try {
          snapshot = parseQuota(message.result);
        } catch {
          fail(INVALID_QUOTA);
          return;
        }
        finish(null, snapshot);
      }
    }

    function onData(chunk) {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        fail("Codex quota response exceeded the size limit.");
        return;
      }
      pending += decoder.write(buffer);
      let newline;
      while (!settled && (newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        handleLine(line);
      }
    }

    try {
      timeout = setTimeout(() => fail("Codex quota read timed out."), timeoutMs);
      child = spawnProcess("codex", [
        "-c", 'cli_auth_credentials_store="keyring"', "app-server", "--listen", "stdio://",
      ], { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
      listen(child, "error", () => fail("Codex quota process could not be started."));
      listen(child, "exit", () => {
        exited = true;
        fail("Codex quota process exited before responding.");
      });
      listen(child, "close", () => {
        exited = true;
        fail("Codex quota process closed before responding.");
      });
      listen(child.stdin, "error", () => fail("Codex quota request could not be sent."));
      listen(child.stdout, "error", () => fail("Codex quota response could not be read."));
      listen(child.stderr, "error", () => fail("Codex quota process output failed."));
      listen(child.stdout, "data", onData);
      listen(child.stdout, "end", () => {
        pending += decoder.end();
        handleLine(pending);
        if (!settled) fail("Codex quota process closed its output before responding.");
      });
      // Drain diagnostics without collecting, logging, or including them in errors.
      child.stderr.resume();
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      send({
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "pi_subscription_footer", title: "Pi subscription footer", version: "1.0.0" } },
      });
    } catch {
      fail("Codex quota process could not be started.");
    }
  });
}
