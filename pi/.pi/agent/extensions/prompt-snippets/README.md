# Prompt snippets

Choose small prompt instructions with fzf in a separate tmux pane. Committed snippet bodies are inserted into your next message, before or after your text.

## Load and open

Run `/reload` in interactive Pi, then press Alt-s or run `/snippets`.
The existing Stow-linked entry resolves sibling modules through its source path. No restow is needed on this machine.

Requires Pi inside tmux, tmux 3.5 or newer, and fzf 0.62 or newer on `PATH`. The helper uses Pi's Node executable and standard library. Python is needed only for integration tests. Tested on macOS with Pi 1.2.0, tmux 3.5a, fzf 0.62.0, and Node 22.23.3. There is no same-terminal fallback. Missing dependencies or a failed split produce a notification without changing committed selections.

The picker spans the bottom of the entire tmux window and uses 40% of its height. Pi and existing sibling columns remain above it. The list uses 40% of picker width and the preview uses 60%. Below 60 columns, the preview moves beneath the list. There is no controls header.

Rows show a fixed-width `[prepend]` or `[append]` label followed by the snippet name. Fuzzy search matches names only. The preview shows the filename and full source, including frontmatter, with wrapping.

## Keys

| Key | Action |
|---|---|
| Type | Fuzzy search names |
| Ctrl-n / Ctrl-p or down / up | Move through the list |
| Ctrl-j / Ctrl-k | Scroll the preview down / up |
| Ctrl-u | Clear the entire query without changing selections |
| Tab or Shift-Tab | Toggle the highlighted snippet without moving |
| Enter | Commit explicitly selected snippets |
| Esc or Ctrl-c | Cancel without changing committed snippets |

Enter with zero selections clears the committed set, even if a row is highlighted. A highlighted row is never selected automatically. Reopening preselects committed snippets, including selections hidden by a query. Reinvocation while open does not create another pane.

Automatic focus requires a single attached originating client using shared active panes, still on the originating pane and window. Otherwise the picker stays detached and Pi tells you to use tmux pane-navigation keys. Closing the picker never force-selects Pi or takes focus back from another pane.

## Prompt composition and lifecycle

Committed snippets appear in a widget above the editor, grouped into prepend and append. Sending a message builds its actual text in this order:

1. Prepend snippet bodies, sorted by `order`, then name.
2. Your message.
3. Append snippet bodies, sorted by `order`, then name.

Each part is separated by two newlines. Frontmatter is excluded. Selection order and fuzzy ranking do not affect composition. Selections reset after sending and at session start. Snippets are refreshed from disk when opening a new picker and when applying committed selections on send. Deleted or invalid files are omitted.

Pi continues streaming, running tools, and showing dialogs in its own pane while the picker is open. Sending through Pi's `input` event immediately invalidates provisional picker results and closes the pane. That prompt uses only the previously committed set. A confirmation processed before the input event can commit; a late result after input cannot. Agent settlement alone does not cancel a picker opened after submission.

Session switching, forking, tree navigation, reload, and shutdown clean up the picker. Out-of-band API submissions that bypass Pi's `input` event are not guaranteed to apply snippets or cancel an open picker.

## Snippet files

Store one Markdown file per snippet in `snippets/` next to the source `index.ts`:

```markdown
---
name: Concise
description: Keep answers short and to the point
placement: prepend
order: 10
---
Keep your response concise. Skip preamble and unnecessary explanation.
```

| Field | Required | Behavior |
|---|---|---|
| `name` | No | Defaults to filename without `.md` |
| `description` | No | Appears in the raw preview only, not the list or search |
| `placement` | No | `prepend` or `append`, defaults to `append` |
| `order` | No | Integer, defaults to `9999`; ties sort by name |

The parser reads simple frontmatter key/value lines, not general YAML. Files need frontmatter and a nonempty body. Edits do not require `/reload`; an already open picker keeps its preview snapshot until it closes.

## Safety and limits

Private temporary directories use mode `0700` and files use `0600`. Preview snapshots escape terminal controls, normalize CRLF, and expand tabs to four-column stops. Raw snapshots are limited to 1 MiB per snippet, configuration to 4 MiB, and preview reads to 2 MiB. Result output is bounded and validated before any selection changes. `FZF_DEFAULT_OPTS` and `FZF_DEFAULT_OPTS_FILE` are ignored for this picker.

Node/helper/config executable paths cannot contain commas, `#`, or newlines because the tmux ownership comparison does not escape those format characters. This restriction does not apply to snippet names or filenames.

Cleanup checks the exact helper start command and, after handshake, its nonce tag before closing a pane. If ownership changes or cleanup cannot be verified, the extension blocks new launches instead of closing an unrelated pane. Follow the notification: identify and remove the picker manually, then `/reload`. Do not kill an unrelated tmux session. Normal cleanup removes snapshots; uncertain cleanup retains minimal ownership evidence and attempts to remove snippet/config content.

## Tests

From `~/dotfiles/pi`:

```sh
node --test tests/prompt-snippets/*.test.mjs
python3 tests/prompt-snippets/tmux.integration.py --mode regular
python3 tests/prompt-snippets/tmux.integration.py --mode fullscreen
```

Integration tests use isolated tmux sockets and an offline Pi provider. They exercise production prompt composition, streaming/tools/dialogs, controls, races, layout, and cleanup without network model calls. Multiclient and independent-active-pane focus denial, and live socket-disconnection timing, do not yet have full end-to-end coverage.
