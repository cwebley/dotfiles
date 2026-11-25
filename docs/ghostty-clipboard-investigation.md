# Ghostty / Pi clipboard-image investigation

## Outcome

The user confirmed **Control+V pastes a clipboard screenshot in Ghostty + tmux + Pi on the old Mac**. Pi inserted a temporary `pi-clipboard-*.png` path. The user clarified that the final failed live diagnostic attempts had used Command+V. Those attempts did not trigger the input hook; other keys did. Earlier reports of a separate Control+V failure were not reproduced once the physical shortcut was distinguished.

Use Control+V for screenshot paste. No Ghostty or tmux configuration change was needed, and there is no established tmux key-handling bug to fix. Command+V's image-only clipboard behavior remains a separate limitation. The diagnostic extension is opt-in and leaves normal input unchanged. New-Mac behavior remains untested.

## User decision

Leave the Ghostty Command+V issue for now and use Control+V for screenshots. Do not start a custom Ghostty build or upstream patch without a new request. Separately, the user reported that even Control+V does not paste screenshots in `ask_user_question` answer fields. Inspection of the local question extension found it uses plain `Editor` instances with no clipboard-image handler. That is a separate custom-dialog limitation, not evidence that main-editor paste is broken again.

## Command+V compatibility candidate

The user wants the existing Command+V workflow preserved, not a different shortcut. Added `keybind = performable:super+v=paste_from_clipboard` to Ghostty's managed config. This keeps Ghostty's paste action for supported text and allows normal key encoding if that action cannot run. It does not map Command+V to Control+V. Pi already binds `super+v` to its native clipboard paste action.

Primary-source basis:

- [Ghostty keybinding documentation](https://ghostty.org/docs/config/keybind) says `performable:` only consumes the key when the action can be performed.
- [Ghostty 1.4.0 Surface.zig](https://github.com/ghostty-org/ghostty/blob/v1.4.0/src/Surface.zig) returns performed for `paste_from_clipboard` only when `startClipboardRequest` returns `.started`.
- [Ghostty 1.4.0 macOS clipboard callback](https://github.com/ghostty-org/ghostty/blob/v1.4.0/macos/Sources/Ghostty/Ghostty.App.swift) returns unavailable if none of the requested clipboard representations can be served.

The user reloaded Ghostty through its menu and Command+V image paste still failed. Removed the candidate binding from the managed config.

Follow-up primary sources explain why native key fallback is not sufficient:

- [Ghostty 1.4.0 key encoding](https://github.com/ghostty-org/ghostty/blob/v1.4.0/src/input/key_encode.zig) suppresses macOS Super text in legacy mode. Its modifyOtherKeys modifier table does support Super, but tmux's active Ghostty client did not advertise `extkeys`.
- [tmux 3.5a extended input parser](https://github.com/tmux/tmux/blob/3.5a/tty-keys.c) maps modifier bit 8 to Meta, the same internal modifier used for Alt. Simply enabling extkeys therefore would not preserve Pi's `super+v` binding.

An isolated tmux 3.5a server with a fake terminal client confirmed the second issue. Sending `ESC[27;9;118~`, Command+V, to a pane requesting mode 2 with csi-u output produced `ESC[118;3u`, Alt+V. This test never changed the user's running server or clipboard. It demonstrates a modifier-loss problem in that path, not a complete live trace of Ghostty's failed fallback.

Ghostty 1.4.0 also implements Kitty mode 5522 paste notifications. A Pi-scoped implementation may avoid key encoding, but tmux pane routing and mode cleanup must be resolved before enabling it. Do not enable a terminal-wide mode blindly via passthrough or globally reinterpret Alt+V. Further options are under investigation.

The sections below retain the investigation history and intermediate hypotheses.

## Local evidence

On the old Mac, Ghostty 1.4.0 launches and displays the generated graphics-protocol image test. The user reports screenshot paste works through Alacritty but not Ghostty, including Control+V. Both terminal clients attach to the same tmux session. Two Control+V shell probes in Ghostty returned legacy byte 0x16. That does not establish what Pi receives while its extended keyboard protocol is active.

## Existing extension found

`pi/.pi/agent/extensions/clipboard-image-paste.ts` translates exactly an empty bracketed paste (`ESC[200~ESC[201~`) into Control+V. Its comment documents Alacritty emitting this event for an image-only clipboard. The replacement is routed through the focused component, so Pi's stock editor can invoke its native clipboard reader without intercepting dialogs globally.

`pi/.pi/agent/keybindings.json` binds `app.clipboard.pasteImage` to both Control+V and Super+V.

The extension does not read images itself and cannot react if a terminal emits no input event. This explains a possible Alacritty Command+V advantage, not the reported Control+V failure in Ghostty. Do not claim the latter is diagnosed.

## Online findings

Ghostty upstream discussion [#10478](https://github.com/ghostty-org/ghostty/discussions/10478) reports screenshot-only clipboard Command+V doing nothing on macOS 15.5 / Ghostty 1.2.3, while copying a saved image file from Finder works. This is a close match for the Command+V symptom, not proof of a Ghostty 1.4.0 Control+V bug. The fetched discussion body did not include the comments; search snippets referring to successful Pi Control+V are not treated as verified comment evidence.

Ghostty issue [#11924](https://github.com/ghostty-org/ghostty/issues/11924) reports image drag/drop failures in Claude Code. That is a different input path and application, not a diagnosis of this failure.

Pi's installed 1.6.0 documentation at docs/keybindings.md lists Control+V for `app.clipboard.pasteImage`. Inspection of the installed clipboard-image.js shows macOS reads use the native clipboard library rather than Ghostty's image display protocol. Therefore graphics display, native clipboard access and terminal input dispatch must be tested separately.

## Next diagnostic

`scripts/probe-pi-clipboard.mjs` prompts for a fresh clipboard screenshot, calls the managed Pi installation's own `readClipboardImage`, and prints only MIME type and byte count. No clipboard contents are logged or files created. Run it from a spare shell pane in Ghostty, then Alacritty if needed. It targets the managed Pi layout by reading current-version and does not support arbitrary npm installs.

The user ran the probe in Ghostty: Pi 1.6.0's reader found `image/png`, 255998 bytes. Native image reading therefore works in that shell process. The user then confirmed screenshot paste works in a fresh Pi directly in Ghostty, but reports it fails in tmux + Pi. The direct Ghostty shell inherited stale TMUX variables from the app launch; process ancestry and tmux's pane list confirmed it was outside tmux, and the variables were unset before testing.

The tmux server is 3.5a, with `extended-keys on` and `extended-keys-format csi-u`. Its Ghostty client reports `xterm-ghostty` without the `extkeys` feature. This is configuration evidence, not yet a diagnosis.

`scripts/probe-pi-terminal.mjs` uses the managed Pi's actual `ProcessTerminal` and `matchesKey`, including its Kitty/modifyOtherKeys negotiation. Run in a spare Ghostty/tmux shell, then press Control+V. It prints recognized shortcut flags and numeric control sequences, redacts ordinary text, and never accesses the clipboard. This differs from the earlier raw-shell key probe. Fake-PTY checks passed for legacy Control+V, CSI-u Control+V after fallback negotiation, and Kitty Control+V. Cleanup sequences were checked too; live Ghostty/tmux input remains untested. The first live probe returned one redacted 60-byte event with neither shortcut recognized and modifyOtherKeys active. Its event type was not recorded, so this cannot distinguish a paste, terminal reply, or malformed key event. The probe now collects events until a recognized paste shortcut, Control+C, or timeout, classifies replies and bracketed pastes, and redacts payloads. Additional fake-PTY checks verified that an unrelated DCS reply or a bracketed paste before Control+V does not stop collection or leak its payload. The second live run recorded a redacted 58-byte bracketed paste followed by `ESC[118;5u`, with `ctrlV: true`, `kitty: false`, and `modifyOtherKeys: true`. Thus Ghostty/tmux delivers a Control+V sequence recognized by Pi's own matcher in this standalone process. The earlier 60-byte event remains unclassified. This does not establish that the running interactive Pi has the same input state or dispatch. Next try `/reload` in the affected Pi, which its installed implementation confirms reloads keybindings as well as extensions, then test with a fresh clipboard screenshot and the normal editor focused.

Reloading the affected interactive Pi did not restore paste. The existing clipboard-image-paste extension now adds an opt-in `/clipboard-debug` command. After `/reload`, the command watches input for up to 20 seconds and shows only event types, byte counts, and shortcut matches in a widget. On a recognized paste shortcut it detaches and calls this process's native clipboard backend, reporting image byte count only. It never consumes input or changes the existing empty-paste translation. Reload/shutdown removes the trace and widget. A fake-backend test passed for translation, non-consuming observation, text redaction, metadata reporting, repeated arming, and shutdown cleanup. Live in-process results are pending.

No Ghostty or tmux configuration has been changed.
