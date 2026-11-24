# Ghostty setup

Ghostty replaces Alacritty in the Brewfile and the default Stow package list. The old Alacritty configuration remains available explicitly; setup does not uninstall its app or remove its existing links.

## Install and link on the new Mac

Use your normal profile, not sudo. Keep an existing Terminal window open.

```sh
cd ~/dotfiles
git pull --ff-only
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
mkdir -p ~/Applications
brew install --cask --appdir="$HOME/Applications" ghostty
./setup.sh --simulate ghostty
```

If Stow reports conflicts, compare and privately back up the conflicting files before proceeding. Do not use --adopt. If preview is clean:

```sh
./setup.sh ghostty
g="$HOME/Applications/Ghostty.app/Contents/MacOS/ghostty"
"$g" +validate-config
aerospace reload-config
open ~/Applications/Ghostty.app
```

Ghostty config is linked at `~/.config/ghostty/config.ghostty`. It can also load a legacy `config` in that directory and files under `~/Library/Application Support/com.mitchellh.ghostty/`. Later files can override the managed settings; inspect these paths if the effective config differs. Do not delete unknown configuration.

The Brewfile now declares `cask_args appdir: "~/Applications"` for its app bundles, including Ghostty and AeroSpace. A future `brew bundle --file=Brewfile --no-upgrade` can install missing entries without upgrading existing ones. No automatic cleanup or uninstall is needed. Homebrew may still need elevated authorization for casks using privileged installers; appdir is not a general sudo workaround.

## Migrated settings

The source is `alacritty/.config/alacritty/alacritty.toml`, not its legacy YAML counterpart.

| Existing preference | Ghostty setting |
|---|---|
| ComicCodeLigatures Nerd Font, 22 pt | Same family and size; automatically choose the family's bold/italic variants |
| Both Option keys act as Alt | `macos-option-as-alt = true` |
| Buttonless window | `macos-window-buttons = hidden`, a close equivalent retaining native decorations |
| Start maximized, not macOS fullscreen | `maximize = true` |
| Control+Q sends byte 0x11 | Explicit `text:\x11` binding |
| Option+H/J/K/L send Escape plus letter | Explicit `esc:` bindings |
| Command+Option+Space sends a nonbreaking space | Explicit UTF-8 byte binding |

Ligatures remain enabled through Ghostty's defaults and require a supporting font. After the first comparison on the old Mac, the user found Ghostty's default colors washed out compared with Alacritty. The managed config now explicitly sets Alacritty's default background `#181818`, foreground `#d8d8d8` and 16-color palette. These defaults were implicit in the old Alacritty config. The user reloaded this palette on the old Mac and confirmed the colors look great. No named theme, automatic tmux launch, or terminal split/tab workflow was added. AeroSpace still intercepts its global Option+H/J/K/L shortcuts before terminal bindings when enabled. Its Ghostty app-ID rule places newly detected windows on workspace 0, alongside the retained Alacritty rule.

The licensed font is not bundled. If not installed yet, expect fallback text, not an exact visual match. Ghostty's built-in Nerd Font fallback also permits using an unpatched Comic Code Ligatures family later, after verifying its installed family name.

## Verification status

The temporary-home Stow test checks Ghostty linking and repeatability. On the old Mac, macOS 15.7.7, Ghostty 1.4.0 was then installed successfully through Homebrew into `~/Applications`, with auto-update and install cleanup disabled. Explicit config validation passed before linking; Stow simulation and apply succeeded; validation of the linked config also passed. `+show-config` confirmed the font, size, Option handling, window settings and all migrated bindings. Normal app launch returned successfully and a Ghostty process was observed running. The user then opened Ghostty, attached to an existing tmux session through their sessionizer, and reported the requested font/ligature, clipboard and Neovim checks looked good. Images remain unverified. None of these old-Mac results establishes new-Mac compatibility.

- [ ] Homebrew installation and normal app launch succeed.
- [ ] `+validate-config` succeeds with no diagnostics.
- [ ] Font size, family and ligatures are correct after installing the font.
- [ ] Option input, Control+Q and nonbreaking-space binding work as intended.
- [ ] Native decorations and maximized behavior are acceptable with AeroSpace.
- [ ] Newly opened Ghostty window lands on workspace 0.
- [ ] Clipboard, colors, cursor changes and shortcuts work in tmux and Neovim.
- [ ] Images work in the intended application both outside and inside tmux. Outer-terminal graphics support alone does not prove tmux compatibility.

## Clipboard images in Pi

Command+V invokes Ghostty's terminal clipboard action and is not the same as Pi's image-paste action. Pi 1.6.0 documents `app.clipboard.pasteImage` as Control+V on macOS. With the user's native modifier swap, physical Caps Lock+V sends Control+V. Test that in Pi with a screenshot on the clipboard. Do not globally remap Command+V to Control+V, since that would change paste behavior in other terminal applications. The user reported neither Command+V nor Control+V attached clipboard images in Ghostty, while image paste still worked through Alacritty attached to the same tmux session. Text paste with Control+V worked in Ghostty. Cause remains unresolved. `scripts/probe-terminal-key.py` captures a single keypress in a spare interactive shell pane, without reading the clipboard, to distinguish the input encodings. This diagnostic restores terminal mode and has a 10-second initial timeout. Both runs supplied by the user were in Ghostty and returned legacy Control+V byte `16`. This verifies shell input, not Pi's active keyboard-protocol behavior. The next diagnostic, `scripts/probe-pi-clipboard.mjs`, calls the managed Pi installation's own image reader from a spare shell pane. It prompts for a fresh clipboard screenshot and reports only format and byte count, without storing or printing image data. It requires the managed Pi installation layout and has not yet been behavior-tested.

## Image smoke test

`scripts/test-terminal-images.py` generates a small PNG and sends it using the Kitty graphics protocol. It uses only Python's standard library, downloads nothing and writes no files. Outside tmux it sends the sequence directly; inside tmux it adds a passthrough envelope. Fake-data tests check PNG structure, CRCs, dimensions, RGB pixels and packet size, not actual terminal display.

First open a new Ghostty window outside tmux. `echo "$TMUX"` should be empty. Run:

```sh
python3 ~/dotfiles/scripts/test-terminal-images.py
```

Expect red, green and blue bars with a black/white strip below. Then, in the intended tmux pane, record `tmux show-options -pv allow-passthrough` and enable passthrough only for that pane:

```sh
tmux set-option -p allow-passthrough on
python3 ~/dotfiles/scripts/test-terminal-images.py
```

This pane-local permission lets applications send escape sequences through tmux to the outer terminal. It does not change the dotfiles' global tmux configuration. Restore the original pane value if desired; `tmux set-option -pu allow-passthrough` removes the local override and returns to inherited behavior. One-shot display does not guarantee correct image scrolling, pane switching, redraw, or Neovim plugin support. Test those separately before choosing a permanent configuration.

## Sources

- https://ghostty.org/docs/config
- https://github.com/alacritty/alacritty/blob/v0.17.0/alacritty/src/config/color.rs
- https://ghostty.org/docs/config/reference
- https://github.com/ghostty-org/ghostty/blob/v1.4.0/src/config/Config.zig
- https://ghostty.org/docs/features
- https://docs.brew.sh/Brew-Bundle-and-Brewfile#advanced-brewfiles
