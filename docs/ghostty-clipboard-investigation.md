# Ghostty / Pi clipboard-image investigation

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

If Ghostty's shell probe reads the image successfully, investigate Pi input dispatch under its active keyboard protocol and extension interactions. If it fails to read, investigate clipboard access/process context, comparing the same probe in Alacritty. No extension behavior has been changed, and no cause has been established yet.
