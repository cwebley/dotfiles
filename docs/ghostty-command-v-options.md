# Command+V screenshot paste options

Target: macOS, Ghostty 1.4, tmux 3.5a, Pi 1.6. Research only.

## Summary

There is no verified stock configuration-only fix meeting all three requirements: preserve ordinary text paste, deliver screenshot-only Command+V to Pi through tmux 3.5a, and keep Alt+V distinct. **The supported native mechanism is Kitty paste events (mode 5522), but a Pi-only passthrough toggle is not safe in a shared tmux surface without pane-aware mode ownership and incoming-event routing.** Key tables can scope a workaround to a deliberately selected Ghostty surface, but cannot supply a missing clipboard-type conditional or track tmux panes automatically.

The smallest technically sound compatibility implementation is an **opt-in Ghostty paste-action fallback that emits an empty bracketed paste only for an image-only clipboard**. This would preserve the existing native text path and reuse Pi's existing empty-paste extension, but requires a Ghostty patch; it is not an available setting today. Until implemented and tested, Ctrl+V remains the working temporary workaround, not fulfillment of the requested Command+V workflow.

## Findings

### 1. Why the performable candidate still fails

**Verified in supplied Ghostty 1.4 source:** `paste_from_clipboard` is performed only when `startClipboardRequest` returns `.started`. Normal paste requests text; the macOS callback returns unavailable when none of the requested representations can be served and no listing was requested. A failed `performable:` binding returns to normal **key encoding**, not a second configured paste action. [Surface.zig](https://github.com/ghostty-org/ghostty/blob/v1.4.0/src/Surface.zig), [App.swift](https://github.com/ghostty-org/ghostty/blob/v1.4.0/macos/Sources/Ghostty/Ghostty.App.swift), [binding semantics](https://ghostty.org/docs/config/keybind).

**Verified source plus additional supplied evidence:** macOS legacy encoding explicitly drops Super-modified text when no extended encoding applies. However, **Ghostty's modifyOtherKeys modifier table DOES support Super** (`/tmp/ghostty-function-keys.zig`). The earlier hypothesis that this table cannot represent Super is wrong. A failed performable paste might therefore produce no bytes in legacy mode or a Super-bearing sequence under extended encoding. Neither establishes a working Pi shortcut through this tmux version. [key encoder](https://github.com/ghostty-org/ghostty/blob/v1.4.0/src/input/key_encode.zig), [modifier table](https://github.com/ghostty-org/ghostty/blob/v1.4.0/src/input/function_keys.zig).

**Verified in tmux 3.5a:** `tty_keys_extended_key` subtracts one from the wire modifier value, then maps both Alt bit 2 and Meta bit 8 to `KEYC_META`. Thus a Super+V sequence such as `CSI 118;9u` loses its distinction from Alt+V. Enabling the client's `extkeys` feature can improve negotiation, but cannot repair this representation loss. The extended-key parser runs **before** key-tree lookup, so defining a raw Super sequence as a tmux `user-key` cannot intercept it first. Additional supplied evidence says master retains this modifier collapse; upgrading blindly is not a solution. [3.5a tty-keys.c](https://github.com/tmux/tmux/blob/3.5a/tty-keys.c).

**Additional isolated runtime evidence supplied during research:** a fake tmux 3.5a client injected actual Super+V `ESC[27;9;118~`; a pane requesting mode 2 with CSI-u output received `ESC[118;3u` (Alt+V). This test did not touch the user server. It confirms the source-derived modifier collapse in practice: `performable:` plus `extkeys` is not a solution.

**Reported, not retested here:** Ctrl+V works; screenshot-only Command+V emits no Pi event; the `performable:super+v=paste_from_clipboard` setting and reload did not fix it. This is consistent with the source but does not identify the exact active encoder branch in that session. Do not relabel this as a native image-reader failure.

### 2. Supported native route: mode 5522, with substantial integration requirements

**Verified:** Ghostty 1.4 implements OSC 5522 clipboard reads/writes and mode 5522 paste notifications. Enabling `CSI ? 5522 h` makes native paste actions request a MIME listing instead of text. Disabling uses `CSI ? 5522 l`; capability/state detection uses DECRQM. The protocol supports MIME data, a one-time paste password and response IDs. This is separate from Kitty image display. [Ghostty 1.4 release notes](https://ghostty.org/docs/install/release-notes/1-4-0), [Kitty clipboard specification](https://sw.kovidgoyal.net/kitty/clipboard/).

**Crucial:** this mode changes **text pastes too**, not just screenshot paste. A Pi implementation must consume complete paste-event OSC packets, prefer text when available to preserve existing behavior, request its text representation and route it through ordinary editor paste semantics. Images can use OSC reads or, on local macOS, the existing native clipboard image reader. The latter avoids image transport but introduces a notification/read clipboard-change race. Treat passwords as ephemeral and never log packet payloads.

Pi's installed `stdin-buffer.js` has generic OSC framing; that is not proof of correct fragmented OSC 5522 delivery, timeout handling, or a clipboard-event consumer. The existing extension only translates exactly `ESC[200~ESC[201~` to Ctrl+V. It cannot act on a keypress for which Ghostty sends nothing.

**Why passthrough alone is not robust in tmux 3.5a:** DCS passthrough carries output to the outer Ghostty surface. It does not implement incoming OSC routing, per-pane mode state, request correlation or focus ownership. The reviewed 3.5a input path has no general OSC 5522 router; an unsolicited event can instead be parsed as ordinary key input and affected by bindings. The Kitty spec explicitly requires multiplexers to forward unsolicited paste events to the currently active window. [tmux parser](https://github.com/tmux/tmux/blob/3.5a/tty-keys.c), [Kitty multiplexer requirements](https://sw.kovidgoyal.net/kitty/clipboard/#support-for-terminal-multiplexers).

**Safe long-term design:** tmux must own the requested mode per pane, apply it to each attached client according to the active pane, route complete notifications to that pane and correlate clipboard replies. Cover pane/window/session changes, multiple clients, detach, process exit and crashes. Pi process start/exit hooks and terminal focus events alone do not cover these transitions. A hidden Pi pane must never leave ordinary shell paste in event-only mode.

Upstream support request [tmux #5837](https://github.com/tmux/tmux/issues/5837) was discovered by search, but its full body/resolution was not fetched; no tmux release with this functionality was verified. Do not recommend enabling mode 5522 globally or loosening passthrough for all panes as a fix.

**Actionable prototype boundary:** implement the Pi protocol consumer first in a disposable dedicated Ghostty surface outside tmux. Verify text round-trips and event framing before investigating multiplexer transport. This tests the supported terminal mechanism but does **not** satisfy the requested tmux stack. For the exact stack, native protocol support requires multiplexer work or separately verified routing infrastructure.

### 3. Key tables: useful scoping, not a conditional fallback

**Verified in supplied v1.4 source:** Ghostty supports `activate_key_table`, `activate_key_table_once`, `deactivate_key_table` and `deactivate_all_key_tables`. Its table stack belongs to a Ghostty **surface**, not a tmux pane. Lookup checks inner tables, outer tables and then root **until an entry matches**. A matched performable action that fails returns to key encoding; it does not continue searching lower tables. Config reload clears the table stack. [Surface binding lookup and dispatch](https://github.com/ghostty-org/ghostty/blob/v1.4.0/src/Surface.zig), [configuration reference](https://ghostty.org/docs/config/reference#keybind).

Consequently:

- A performable native-paste entry above a root `text:` fallback will not implement conditional image paste.
- Chaining paste and Ctrl+V is not conditional: Ghostty runs **every** action and considers the chain performed if any action performs. Text paste would trigger the image handler too.
- Timing-based suppression of a marker following a text paste is not a robust alternative: clipboard completion and input framing can be asynchronous, and mixed text/image clipboards matter.
- A table mapping Command+V directly to Ctrl+V changes text behavior in that table and can stay active after a tmux pane switch. It fails the requirements.
- No supported foreground-program/clipboard-type binding predicate was established in the reviewed dispatch path. An OS application-specific remapper identifies Ghostty, not the active Pi pane; a tmux predicate cannot recover an event that Ghostty never sent.

**Safe contextual use:** explicitly select a dedicated Ghostty surface/table containing a genuinely text-preserving new action, and provide an explicit way to leave the table. Do not present a manually activated table as automatic Pi detection. If automatic pane scoping is mandatory, implement and verify the pane ownership lifecycle rather than checking terminal titles or process names heuristically.

### 4. Smallest compatibility implementation: opt-in image-only empty paste

This is a proposed Ghostty change, not existing syntax. Prefer a new opt-in paste action rather than globally altering all pastes.

Required behavior:

1. Keep existing text representation selection, paste protection and bracketed-paste encoding unchanged. If text is available, do normal paste with **no extra notification**. Text wins for mixed text/image clipboards.
2. Only when text is **unavailable**, distinguish a supported native image representation from an empty/unsupported clipboard, ideally by type inspection rather than reading image bytes.
3. If an image is available and bracketed paste is enabled, explicitly enqueue exactly `ESC[200~ESC[201~` and report the action performed. Never synthesize Ctrl+V, literal `v` or Alt+V in the terminal.
4. Preserve read-only behavior. When mode 5522 is active, retain its native event path and avoid duplicate notifications. Keep request lifetime/ownership rules intact.

**Implementation trap:** `completeClipboardPaste` returns immediately for zero-length data. Returning an empty text representation from the native callback alone will therefore not generate the desired event. Add an explicit mode-checked queue operation or intentionally extend the shared paste encoder. `completeClipboardPasteEvent` provides a source example for read-only checks, locking and queued writes. [Surface implementation](https://github.com/ghostty-org/ghostty/blob/v1.4.0/src/Surface.zig).

The existing `pi/.pi/agent/extensions/clipboard-image-paste.ts` already translates the exact empty paste through the focused component into the known-working Ctrl+V handler. Nonempty text remains untouched; dialogs retain their normal input routing. The notification bypasses unsupported Super transport and requires no global Alt+V binding.

**Safety boundary:** empty paste is a compatibility convention, not a standardized image protocol. Bracketed-paste mode means application opt-in, not specifically Pi. Keep the new action opt-in, optionally scoped to a dedicated Pi surface/table. Other bracketed-paste programs should receive only an empty paste, never a destructive control key. If absolute Pi-only notification is required, use explicit negotiation rather than guessing the foreground application.

**Recommendation:** this is the smallest credible exact-stack implementation to develop and test while native tmux support is absent. It requires a local Ghostty build or upstream acceptance. Do not claim it is a ready-to-use config fix.

### 5. Rejected shortcuts and upstream priorities

- Global `M-v -> C-v`, raw Super `user-keys`, `extkeys` alone, unconditional `text:\x16`, chained paste+Ctrl+V: reject for the reasons above.
- Changing only Pi's `super+v` binding cannot create missing input or reverse tmux's modifier collapse.
- Implementing a first-success/otherwise Ghostty action would allow composition, but current chained actions are not that primitive; it would be a new feature.
- Best standards outcome: pane-aware mode 5522 in tmux plus native paste-event handling in Pi.
- Smallest compatibility outcome: opt-in image-only empty-paste fallback in Ghostty, reusing the current Pi extension.

## Acceptance tests for later implementation

Use a disposable session and deliberate test clipboard fixtures; no clipboard or live settings tests were performed here.

1. Screenshot-only Command+V produces exactly one image insertion, no text debris.
2. Plain text, multiline text and text+image retain prior text paste behavior and protection, with no image insertion/read.
3. Empty/unsupported clipboard and zero-length text do not accidentally invoke the image reader; define zero-length-text policy explicitly.
4. Alt+V and physical Ctrl+V are unchanged; dialogs and custom editor focus retain normal routing.
5. Pane/window/session switches, copy mode, detach/reattach, multiple clients, reload, process exit and crash leave no leaked modes or control keys.
6. Fragment marker/OSC input at every byte boundary; test installed Pi parser framing, tmux handling, clipboard changes during processing and read-only surfaces.

## Sources

**Kept:** versioned Ghostty Surface/App/key encoder/modifier source linked above; supplied local copies; tmux 3.5a `tty-keys.c`; official Ghostty binding documentation and release notes; Kitty clipboard specification. These establish actual dispatch, encoding and protocol semantics. Installed Pi 1.6 source and the repository extension establish local integration behavior.

**Discovery only:** tmux issue #5837; not used to claim a resolved implementation or release.

**Dropped as implementation authority:** generic clipboard tutorials, third-party keybinding posts, older screenshot anecdotes, image-display and drag/drop issues. They do not establish a safe path for this versioned stack. The current online Ghostty action reference omits table actions present in the supplied 1.4 source; prefer versioned source for that feature.

## Gaps and next steps

No executable fix or live end-to-end test was produced. Configuration/release-note fetches were truncated; relevant claims were checked against focused pages and supplied source rather than omitted text. A tmux version providing pane-aware native paste events remains unverified. Next implementation decision: a small opt-in Ghostty compatibility action now, or coordinated tmux/Pi native protocol work; neither should be disguised as another global remap.

Only this findings document was written. Existing working-tree changes were left alone; no clipboard access, terminal mode changes or configuration reloads were performed.
