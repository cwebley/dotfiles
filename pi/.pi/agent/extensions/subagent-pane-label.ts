import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// interactive-subagents supplies PI_SUBAGENT_NAME on both spawn and resume.
// Use a pane-local option rather than pane_title, which Pi and the shell overwrite.
const option = "@pi_subagent_name";

export default function (pi: ExtensionAPI) {
  let labeledPane: string | undefined;

  pi.on("session_start", (_event, ctx) => {
    const pane = process.env.TMUX_PANE;
    const name = process.env.PI_SUBAGENT_NAME?.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim();
    if (ctx.mode !== "tui" || !process.env.TMUX || !pane || !name) return;

    try {
      execFileSync("tmux", ["set-option", "-p", "-t", pane, option, name], {
        stdio: "ignore",
        timeout: 1000,
      });
      labeledPane = pane;
    } catch {
      // Cosmetic only. A missing tmux binary or closed pane must not stop Pi.
    }
  });

  pi.on("session_shutdown", () => {
    if (!labeledPane) return;
    try {
      execFileSync("tmux", ["set-option", "-p", "-u", "-t", labeledPane, option], {
        stdio: "ignore",
        timeout: 1000,
      });
    } catch {
      // interactive-subagents may already have closed this pane.
    }
    labeledPane = undefined;
  });
}
