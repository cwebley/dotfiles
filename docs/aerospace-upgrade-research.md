# AeroSpace upgrade research

Research scope: changes since 0.18.5-Beta, migration of this repo's config, and useful features. Shipped behavior was checked against official release notes and v0.21.3-Beta source, not just the newer main documentation.

## Release and migration

The official Homebrew tap currently installs **0.21.3-Beta**. GitHub marks it as a prerelease, not a stable 1.0 release. [Official cask](https://github.com/nikitabobko/homebrew-tap/blob/main/Casks/aerospace.rb) · [Release](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.21.3-Beta)

Config version 2 first shipped in **0.20.0-Beta**. Version 0.21.0 added the warning about outdated config versions. AeroSpace 0.18.5 does not accept the new keys. Upgrade old installations before pulling the migrated config. [0.20 parser](https://github.com/nikitabobko/AeroSpace/blob/v0.20.0-Beta/Sources/AppBundle/config/parseConfig.swift) · [0.18.5 parser](https://github.com/nikitabobko/AeroSpace/blob/v0.18.5-Beta/Sources/AppBundle/config/parseConfig.swift) · [0.21 release](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.21.0-Beta)

Omitting `config-version` means version 1. Version 1 infers persistent empty workspaces from bindings and monitor assignments. Version 2 allows an explicit `persistent-workspaces` list and defaults it to an empty list. Merely adding `config-version = 2` would therefore change behavior. [Tagged migration guide](https://github.com/nikitabobko/AeroSpace/blob/v0.21.3-Beta/docs/guide.adoc#config-version)

Our migration explicitly preserves these 29 workspaces:

```toml
config-version = 2
persistent-workspaces = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'A', 'B', 'C', 'D', 'E', 'G', 'I', 'M', 'N', 'O', 'P', 'Q',
    'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
]
```

This is the set inferred from our active workspace bindings and confirmed by the old Mac's workspace list before upgrading. F is fullscreen, H/J/K/L navigate, R runs TrailMix, and S is reserved for terminal/Pi shortcuts. Do not copy the upstream workspace list, which omits our terminal workspace 0.

Legacy app-ID detection rules remain supported in 0.21.3. Our eight rules all have nonempty conditions. `after-login-command = []` also remains accepted; nonempty values were deprecated. No required migration changes were found for the existing shortcuts, gaps, normalizations or monitor mouse-centering callback. [Tagged parser](https://github.com/nikitabobko/AeroSpace/blob/v0.21.3-Beta/Sources/AppBundle/config/parseConfig.swift)

The parser handles a command starting with `exec-and-forget` before the new shell lexer, preserving its shell suffix. That supports retaining the quoted TrailMix command, but source inspection is not a live TrailMix test. [Command parser](https://github.com/nikitabobko/AeroSpace/blob/v0.21.3-Beta/Sources/AppBundle/command/parseCommand.swift)

## Changes worth knowing

- **0.19:** window `swap`, depth-first focus navigation, move-boundary controls, menu-bar styles/app names, proper macOS Login Item registration, and fixes for random workspace jumps and off-screen floating windows. [0.19.0](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.19.0-Beta) · [0.19.1](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.19.1-Beta)
- **0.20:** explicit persistent workspaces, richer list formatting, `on-mode-changed`, fewer restrictions on window-detection commands, fullscreen/Secure Input indicators, popup improvements and a Tahoe Chrome-tab-detach fix. Stdin-driven workspace commands now need `--stdin`; our static targets do not use it. [0.20.0](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.20.0-Beta)
- **0.20.3:** floating-window positioning fixes and a renewed signing certificate, requiring Accessibility approval again. [0.20.3](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.20.3-Beta)
- **0.21:** native focus-follows-mouse, shell-style command composition with `&&`, `||`, `;` and `|`, `test`/`eval`/`echo`, composable window rules, automatic config reload, event subscriptions and root/workspace layout targeting. Outlook reminder-popup handling is relevant to our company app rules. There are also socket-protocol and command-parsing changes; CLI and app versions should match. [0.21.0](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.21.0-Beta)
- **0.21.1–0.21.3:** fixes for mouse focus, menus, accordion layouts, floating-window snapping and a crash. Version .3 ignores zero-ID windows, including mistakenly detected cmux windows, and improves Wispr Flow popup detection. [0.21.1](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.21.1-Beta) · [0.21.2](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.21.2-Beta) · [0.21.3](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.21.3-Beta)

Recommendation: keep the migration minimal. Consider auto-reload, swap bindings or menu-bar indicators separately. Focus-follows-mouse is different from our current mouse-follows-monitor-focus behavior and should not be enabled without trying it. None of these optional features were enabled by this migration.

## Performance and security

Version 0.20 avoids unnecessary Accessibility focus requests for apps slow to answer `AXRaiseAction`, with Godot as the example. Version 0.21 fixes a potentially infinite loop and offers more efficient shell-based gesture examples. These are targeted improvements, not published cross-version CPU, memory or latency benchmarks. There is no evidence here that our normal workflow is a particular percentage faster. Animation-free workspace switching predates this upgrade. [0.20 notes](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.20.0-Beta) · [0.21 notes](https://github.com/nikitabobko/AeroSpace/releases/tag/v0.21.0-Beta)

The official README states binary support for macOS 13+, with source builds guaranteed on macOS 15+. AeroSpace remains public beta, is not notarized, needs Accessibility permission and does not require disabling SIP. Those statements are not certification for a company-managed macOS build. Follow IT policy for installation and permissions; do not bypass MDM or Gatekeeper. [Official README](https://github.com/nikitabobko/AeroSpace#macos-compatibility)

The guide suggests disabling “Displays have separate Spaces” for some focus/performance issues. It also documents tradeoffs: native fullscreen makes the other monitor black, and the menu bar appears only on the main display. This is an optional troubleshooting experiment, not part of the migration. [Tagged monitor guidance](https://github.com/nikitabobko/AeroSpace/blob/v0.21.3-Beta/docs/guide.adoc#a-note-on-displays-have-separate-spaces)

## Applying on the new Mac

First check that CLI and server are at least 0.20.0-Beta, ideally the tested 0.21.3-Beta:

```sh
aerospace --version
cd ~/dotfiles
git pull --ff-only
aerospace reload-config --dry-run --no-gui --warnings-as-errors
aerospace reload-config --no-gui
```

The config is already Stow-linked on the new Mac, so no restow is needed. Stop and inspect any version or validation error rather than reloading blindly. The dry-run validates the running server's active config path; it is not an offline alternate-file validator. There is no standalone app `--validate-config` flag. [Reload manual](https://github.com/nikitabobko/AeroSpace/blob/v0.21.3-Beta/docs/aerospace-reload-config.adoc)

After reloading, check Option+number workspace selection, Option+Shift+number window movement, Option+H/J/K/L focus, Option+Tab, monitor movement if applicable, and new-window routing. Check Login Items at a convenient login. TrailMix needs its separate installation and is not part of new-Mac acceptance until installed.

## Local validation and remaining gaps

On the old Mac, Homebrew upgraded CLI/app from 0.18.5 to 0.21.3. The user approved renewed Accessibility access. Both running components report 0.21.3-Beta. The migrated config passes server dry-run validation with warnings treated as errors and has been reloaded successfully. The workspace list still contains the same 29 names. A regression test checks that explicit persistence matches our workspace bindings and retains the shortcut reservations.

New-Mac CLI/server versions and live acceptance of this migration remain unconfirmed. No benchmark was run. Company-app popup behavior, monitor movement, TrailMix and shortcut behavior after the upgrade still need live acceptance; successful parsing does not prove them.
