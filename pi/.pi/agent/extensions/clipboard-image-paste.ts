import type { ExtensionAPI, TerminalInputHandler } from "@earendil-works/pi-coding-agent";

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
  const cleanup = () => {
    unsubscribe?.();
    unsubscribe = undefined;
  };

  pi.on("session_start", (_event, ctx) => {
    cleanup();
    if (process.platform === "darwin" && ctx.mode === "tui") {
      unsubscribe = ctx.ui.onTerminalInput(translateEmptyPaste);
    }
  });

  pi.on("session_shutdown", cleanup);
}
