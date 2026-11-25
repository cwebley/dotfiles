# Images in question answers

The custom `ask_user_question` tool accepts clipboard screenshots in free-text answers and in the single-select or multi-select Other editor.

Use the configured `app.clipboard.pasteImage` shortcut while typing an answer. Pi defaults to Ctrl+V on macOS. A configured Super+V binding works too, provided the terminal reports that modifier. The extension uses the keybindings manager supplied by Pi rather than hard-coding a key.

Each pasted image inserts a token such as `[question-image:1]`. The editor also shows an attachment count. You can paste several images or submit an image without adding any text. Delete an image's complete token to exclude it from the answer. Undoing that deletion restores the attachment while the dialog remains open.

For multi-select questions, Enter in Other saves the draft and its attachments. Submit sends them along with the checked options. Esc discards unsaved edits and restores the previously saved Other answer. Space on a selected Other item deselects it and removes its images from the submitted answer. Clipboard shortcuts outside the Other editor do not read the clipboard or change selection.

## Clipboard behavior

The shared `lib/question-image-paste.ts` editor reads images through Pi's `getNativeClipboard().getImage()`. It does not use shell clipboard commands or temporary files. PNG, JPEG, GIF, and WebP bytes become image content directly. Other formats use Pi's PNG converter; failed conversion shows a fixed error message and attaches nothing.

If there is no image, the editor tries native `getText()` when available. Terminal bracketed text pastes still go through the normal Editor handling. When the native clipboard is unavailable, ordinary terminal text paste remains available.

While a clipboard read or conversion is pending, the editor shows a status message and blocks submission. Press Enter again after it finishes. Repeated shortcut events during that read are ignored. Esc, cancellation, or leaving Other invalidates the pending operation, so its eventual result cannot insert text, attach an image, or request a render. A new edit session can start its own read without waiting for a discarded one.

Submitted images are actual `ImageContent` entries in the tool result's `content` array, next to the textual answer. Image bytes and base64 do not go into `details`, answer labels, clipboard error messages, or the custom result renderer. Pi can still persist image content in its session transcript, as with other image tool results.

## Verification

From the repository root:

```sh
node pi/tests/question-image-paste.test.mjs
node pi/tests/clipboard-image-paste.test.mjs
```

The question tests use the managed Pi jiti loader, the installed real Editor, and temporary fake clipboard and conversion backends. They cover all three question modes, multiple and image-only attachments, token deletion, text fallback, pending reads, cancellation, stale completions, result redaction, narrow rendering, selection behavior, and the shared UI lock. They never read the system clipboard.

A subsequent live test on the old Mac, macOS 15.7.7 with Ghostty + tmux + Pi 1.6.0, passed after `/reload`. The user pasted a clipboard screenshot with Control+V into a free-text question and submitted the image-only answer. The tool returned `[question-image:1]` plus actual image content, and the assistant received and could see the screenshot. This verifies native clipboard access, question submission, and model image delivery for that case. Single/multi-select Other fields, multiple images, and deletion remain fake-backend-tested rather than live-verified. New-Mac behavior remains untested.
