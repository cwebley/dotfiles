import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(new URL("../../.pi/agent/extensions/subagent-pane-label.ts", import.meta.url), "utf8");
const { default: extension } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`);
const config = readFileSync(new URL("../../../tmux/.tmux.conf", import.meta.url), "utf8");
const format = config.match(/^set -g pane-border-format '(.*)'$/m)[1];

let tmuxPath;
try { tmuxPath = execFileSync("which", ["tmux"], { encoding: "utf8" }).trim(); } catch {}

test("subagent labels survive title changes, ordinary panes fall back, shutdown cleans up", { skip: !tmuxPath }, () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-pane-label-"));
  const socket = join(dir, "socket");
  const savedEnv = { ...process.env };
  const tmux = (...args) => execFileSync(tmuxPath, ["-S", socket, ...args], { encoding: "utf8" }).trim();
  // Route only the extension's tmux calls to an isolated test server.
  writeFileSync(join(dir, "tmux"), `#!/bin/sh\nexec '${tmuxPath.replaceAll("'", "'\\''")}' -S '${socket.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
  try {
    const pane = tmux("-f", "/dev/null", "new-session", "-d", "-s", "labels", "-P", "-F", "#{pane_id}");
    process.env.PATH = `${dir}:${process.env.PATH}`;
    process.env.TMUX = socket;
    process.env.TMUX_PANE = pane;
    const handlers = {};
    extension({ on: (event, handler) => { handlers[event] = handler; } });
    const label = () => tmux("display-message", "-p", "-t", pane, "#{?@pi_subagent_name,#{@pi_subagent_name},#{pane_title}}");
    const option = () => tmux("display-message", "-p", "-t", pane, "#{@pi_subagent_name}");

    tmux("select-pane", "-t", pane, "-T", "π - fantasy");
    delete process.env.PI_SUBAGENT_NAME;
    handlers.session_start({}, { mode: "tui" });
    assert.equal(label(), "π - fantasy");
    assert.equal(option(), "");

    process.env.PI_SUBAGENT_NAME = "goedert-check";
    handlers.session_start({}, { mode: "json" });
    assert.equal(option(), "");
    handlers.session_start({}, { mode: "tui" });
    assert.equal(label(), "goedert-check");
    tmux("select-pane", "-t", pane, "-T", "π - fantasy again");
    assert.equal(label(), "goedert-check");
    assert.match(tmux("display-message", "-p", "-t", pane, format), /goedert-check/);
    assert.doesNotMatch(tmux("display-message", "-p", "-t", pane, format), /fantasy/);

    handlers.session_shutdown();
    handlers.session_shutdown();
    assert.equal(option(), "");
    assert.equal(label(), "π - fantasy again");

    process.env.PI_SUBAGENT_NAME = " researcher's λ; $(echo nope)\n ";
    handlers.session_start({}, { mode: "tui" });
    assert.equal(label(), "researcher's λ; $(echo nope)");
    handlers.session_shutdown();

    delete process.env.TMUX;
    handlers.session_start({}, { mode: "tui" });
    assert.equal(option(), "");
    process.env.TMUX = socket;
    process.env.TMUX_PANE = "%999999";
    assert.doesNotThrow(() => handlers.session_start({}, { mode: "tui" }));
  } finally {
    try { tmux("kill-server"); } catch {}
    process.env = savedEnv;
    rmSync(dir, { recursive: true, force: true });
  }
});
