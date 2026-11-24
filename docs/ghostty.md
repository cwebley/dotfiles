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

Ligatures remain enabled through Ghostty's defaults and require a supporting font. No theme, automatic tmux launch, or terminal split/tab workflow was added. AeroSpace still intercepts its global Option+H/J/K/L shortcuts before terminal bindings when enabled. Its Ghostty app-ID rule places newly detected windows on workspace 0, alongside the retained Alacritty rule.

The licensed font is not bundled. If not installed yet, expect fallback text, not an exact visual match. Ghostty's built-in Nerd Font fallback also permits using an unpatched Comic Code Ligatures family later, after verifying its installed family name.

## Verification status

The temporary-home Stow test checks Ghostty linking and repeatability. This does not validate Ghostty's config parser or live macOS behavior. Ghostty is not installed on the old Mac used to make these changes, so parser validation and new-Mac acceptance remain pending.

- [ ] Homebrew installation and normal app launch succeed.
- [ ] `+validate-config` succeeds with no diagnostics.
- [ ] Font size, family and ligatures are correct after installing the font.
- [ ] Option input, Control+Q and nonbreaking-space binding work as intended.
- [ ] Native decorations and maximized behavior are acceptable with AeroSpace.
- [ ] Newly opened Ghostty window lands on workspace 0.
- [ ] Clipboard, colors, cursor changes and shortcuts work in tmux and Neovim.
- [ ] Images work in the intended application both outside and inside tmux. Outer-terminal graphics support alone does not prove tmux compatibility.

## Sources

- https://ghostty.org/docs/config
- https://ghostty.org/docs/config/reference
- https://github.com/ghostty-org/ghostty/blob/v1.4.0/src/config/Config.zig
- https://ghostty.org/docs/features
- https://docs.brew.sh/Brew-Bundle-and-Brewfile#advanced-brewfiles
