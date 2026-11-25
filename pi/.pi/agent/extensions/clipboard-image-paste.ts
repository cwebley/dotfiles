import type { ExtensionAPI, TerminalInputHandler } from "@earendil-works/pi-coding-agent";
import { getNativeClipboard, matchesKey } from "@earendil-works/pi-tui";

// Pi's terminal parser assembles even split paste markers before this hook runs.
// Alacritty emits an empty bracketed paste for an image-only clipboard.
export const translateEmptyPaste: TerminalInputHandler = (data) => {
  if (data === "\x1b[200~\x1b[201~") {
    // Route through the focused component, not a global clipboard read.
    // The stock main editor handles Ctrl+V; dialogs retain their own input handling.
    // Requires ctrl+v in app.clipboard.pasteImage, as in Pi's macOS defaults.
    return { data: "\x16" };
  }
  return undefined;
};

export default function clipboardImagePaste(pi: ExtensionAPI) {
  let unsubscribe: (() => void) | undefined;
  let stopTrace: (() => void) | undefined;
  const cleanup = () => {
    unsubscribe?.();
    unsubscribe = undefined;
    stopTrace?.();
    stopTrace = undefined;
  };

  pi.registerCommand("clipboard-debug", {
    description: "Trace one paste shortcut and clipboard image metadata for 20 seconds",
    handler: async (_args, ctx) => {
      if (process.platform !== "darwin" || ctx.mode !== "tui") return;
      stopTrace?.();
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let removeListener: (() => void) | undefined;
      const lines = ["Clipboard debug: take a screenshot to clipboard, then press Control+V."];
      const render = () => {
        if (!cancelled) ctx.ui.setWidget("clipboard-debug", [...lines]);
      };
      const detach = () => {
        clearTimeout(timer);
        removeListener?.();
        removeListener = undefined;
      };
      stopTrace = () => {
        cancelled = true;
        detach();
        ctx.ui.setWidget("clipboard-debug", undefined);
      };
      render();
      removeListener = ctx.ui.onTerminalInput((data) => {
        const ctrlV = matchesKey(data, "ctrl+v");
        const superV = matchesKey(data, "super+v");
        if (lines.length < 9) {
          const kind = data.startsWith("\x1b[200~") ? "bracketed paste" :
            data.startsWith("\x1b[") ? "CSI sequence" : "other input";
          lines.push(`Input: ${kind}, ${Buffer.byteLength(data)} bytes; ctrlV=${ctrlV}, superV=${superV}`);
        }
        if (ctrlV || superV) {
          detach();
          lines.push("Paste shortcut reached Pi. Reading native image metadata...");
          void (async () => {
            try {
              const clipboard = getNativeClipboard();
              const image = await clipboard?.getImage();
              lines.push(!clipboard ? "Native clipboard backend unavailable." :
                image?.length ? `Native clipboard image found: ${image.length} bytes.` :
                "Native clipboard returned no image.");
            } catch {
              // Do not expose arbitrary native error strings or clipboard payloads.
              lines.push("Native clipboard read failed.");
            }
            render();
          })();
        }
        render();
        // Observe only. Let the normal focused component handle the key.
        return undefined;
      });
      timer = setTimeout(() => {
        detach();
        lines.push("Trace ended without a recognized paste shortcut.");
        render();
      }, 20_000);
    },
  });

  pi.on("session_start", (_event, ctx) => {
    cleanup();
    if (process.platform === "darwin" && ctx.mode === "tui") {
      unsubscribe = ctx.ui.onTerminalInput(translateEmptyPaste);
    }
  });

  pi.on("session_shutdown", cleanup);
}
