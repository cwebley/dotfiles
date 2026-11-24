# New Mac setup

Personal checklist for an Apple Silicon Mac. Account logins and private files stay manual. macOS preferences can be configured manually or with the optional helper below. Stow links configuration; it does not install applications. The Brewfile is an optional shortcut, not a requirement.

Before leaving the old Mac, review the diff, run `python3 scripts/check-credentials.py`, and commit and push the intended changes. A fresh clone only receives pushed commits. Keep credentials, password databases, browser profiles and Pi sessions out of Git.

## 1. Early setup and passwords

- Optionally install opencode from its official GitHub instructions if free models would help with setup. Review commands before running them. Unrestricted or YOLO mode can change the machine without approval; don't give it the password database, browser cookies or private keys.
- Adjust keyboard key repeat and delay.
- Enable trackpad tap-to-click.
- Enable the scroll gesture for zoom in Accessibility settings.
- In Keyboard > Modifier Keys, swap Control and Caps Lock for each keyboard you use.
- Enable Dock auto-hide, clear pinned apps and hide recent-app suggestions. The optional helper's `dock` group does this while keeping Trash, stacks and existing reveal timing. Running apps can still appear.
- Download Brave from https://brave.com and sign into Google.
- Download Dropbox from https://www.dropbox.com/install and sign in.
- Make the `passwords.kdbx` file available offline in Dropbox before opening it.
- Download KeePassXC from https://keepassxc.org and open the password database yourself.

An optional [macOS preferences helper and acceptance checklist](macos-preferences.md) can apply key repeat, tap-to-click, Option-scroll zoom, Mission Control grouping, Dock auto-hide and a selected keyboard mapping. Preview first after cloning and installing Python. It does not run during Stow or Homebrew setup. Key repeat and the native Caps Lock/Control swap have been confirmed on the new Mac after logout/login; trackpad, zoom and Mission Control still need acceptance testing. Keep the manual steps above as the fallback. The `dock` group clears all pinned apps, including custom pins, without uninstalling them. Account setup remains manual.

Don't paste passwords, tokens or recovery codes into an agent conversation.

## 2. Homebrew and terminal basics

Install Apple's command-line tools with `xcode-select --install` if needed. Install Homebrew using https://brew.sh, then:

```sh
eval "$(/opt/homebrew/bin/brew shellenv)"
mkdir -p "$HOME/Applications"
brew install --cask --appdir="$HOME/Applications" ghostty
brew install stow fzf jq ripgrep
```

## 3. SSH, GitHub and dotfiles

For a new GitHub key, prefer Ed25519 unless a service requires RSA. Use a passphrase and a descriptive machine label. Don't overwrite an existing key:

```sh
ssh-keygen -t ed25519 -C 'DESCRIPTION OF THIS MAC'
/usr/bin/ssh-add --apple-use-keychain "$HOME/.ssh/id_ed25519"
pbcopy < "$HOME/.ssh/id_ed25519.pub"
```

Add the copied **public** key in GitHub Settings > SSH and GPG keys. `ssh-add` loads the key into the agent; the Keychain option remembers its passphrase. It does not remove the key's passphrase. Never copy or upload the private file without `.pub`.

Test `ssh -T git@github.com`, checking any host-key prompt against GitHub's published fingerprints. Successful GitHub authentication reports that shell access is unavailable and exits with status 1. Then:

```sh
git clone git@github.com:cwebley/dotfiles.git "$HOME/dotfiles"
cd "$HOME/dotfiles"
```

HTTPS cloning also works if you want to defer SSH setup:

```sh
git clone https://github.com/cwebley/dotfiles.git "$HOME/dotfiles"
```

Run only one clone command. Set your commit identity separately:

```sh
git config --global user.name 'YOUR NAME'
git config --global user.email 'YOUR COMMIT EMAIL'
```

## 4. Remaining Homebrew tools and Stow

Continue your usual individual installs:

```sh
brew install tmux neovim fnm
brew install --cask nikitabobko/tap/aerospace
# Support the saved config and its checks:
brew install fd lazygit python zsh-autosuggestions zsh-syntax-highlighting gitleaks
```

Alternatively, from `~/dotfiles`, `brew bundle --file=Brewfile` covers these tools and the earlier Homebrew tools, plus FontForge used below. Discord is an optional personal-machine install, excluded from the Brewfile. Homebrew packages aren't version-locked. The Brewfile doesn't install Brave, Dropbox, KeePassXC, Docker or Adobe apps.

If Homebrew requires tap trust for AeroSpace, review the source and trust only that cask with `brew trust --cask nikitabobko/tap/aerospace`. Don't grant whole-tap trust just to silence a warning. Older Homebrew releases may not have this trust command.

Preview and link the selected configuration:

```sh
cd "$HOME/dotfiles"
./setup.sh --simulate nvim zsh tmux ghostty aerospace lazygit git pi agent-skills
./setup.sh nvim zsh tmux ghostty aerospace lazygit git pi agent-skills
```

If Stow reports a conflict, compare the existing file with its repo source. Back up only the conflicting file outside the repo, preserve any customizations, then retry. Never use `--adopt` or delete a directory of unknown configuration.

Homebrew's installer commonly creates `~/.zprofile`. Compare it with `zsh/.zprofile`; move the old regular file to a private backup location before retrying Stow. The managed file initializes Homebrew. `.zsh_profile` is a separate, older filename that this repo's `.zshrc` intentionally sources.

The `git` package installs `~/.config/git/ignore` with:

```gitignore
**/.claude/settings.local.json
tmp/
*.local.md
```

Git uses this location by default unless `core.excludesFile` overrides it. Check an override with `git config --global --get core.excludesFile`. These patterns do not untrack files already committed.

The selected Stow set leaves out legacy `lvim` and machine-specific `misc` scripts. Running `./setup.sh` without arguments still installs the historical default set, which does not include the new `git` package. Taskwarrior is optional and needs its own software install, Stow package and private secrets.

Open a new terminal after linking shell configuration.

Ghostty replaces Alacritty as the default terminal. The Brewfile installs app bundles into `~/Applications`, matching the standard-account setup. It does not move existing system-wide apps. See [Ghostty setup](ghostty.md) for configuration migration details, validation and live acceptance checks. The legacy `alacritty` Stow package remains available explicitly, but its disabled Homebrew cask is no longer requested.

### Optional: apply and test macOS preferences

**This is a new, experimental script. Key repeat and the native Caps Lock/Control swap have been behavior-confirmed on the new Mac.** On macOS 27.2.1, `2`/`15` worked after logout/login, and the user then confirmed and preferred the faster `1`/`10` values, now the script defaults. A newly opened app alone did not activate the first change. The native `0-0-0` modifier mapping also worked after clearing the temporary `hidutil` swap and logging out/in, with no login task installed. Those live native writes used `defaults`; the helper still needs end-to-end acceptance testing. Trackpad, zoom and Mission Control remain unverified. Automated tests cover the helper's logic with fake preferences, not whether macOS honors the settings.

Treat every group as an experiment: preview, apply only that group, verify each setting in System Settings and through actual behavior, and record the result before continuing. A successful command or read-back is not enough to mark a step as working. Use the manual instructions if a step fails or is unclear.

You can use this instead of the corresponding manual settings in section 1. Start with a read-only preview:

```sh
cd "$HOME/dotfiles"
python3 scripts/macos-preferences.py --show
```

Then apply **one group at a time**, completing its behavior checks before moving on:

```sh
python3 scripts/macos-preferences.py --apply trackpad
python3 scripts/macos-preferences.py --apply zoom
python3 scripts/macos-preferences.py --apply mission-control
python3 scripts/macos-preferences.py --apply dock
python3 scripts/macos-preferences.py --apply keyboard
```

The helper's storage baseline is macOS 15.7.7. On another release, it refuses writes unless you explicitly add `--allow-untested`. Review the preview and [helper documentation](macos-preferences.md) first. For example:

```sh
python3 scripts/macos-preferences.py --apply trackpad --allow-untested
```

The `keyboard` group automatically recognizes the tested built-in keyboard and sets both the faster `1`/`10` repeat values and the persistent Caps Lock/Control swap, even with no existing mapping. No manual modifier setup, keyboard-ID argument or login task is needed on that hardware. Log out/in afterward to activate and test the native preferences.

The helper never restarts apps, logs you out, requests sudo or guesses unfamiliar hardware targets. If the swap is skipped, the command reports incomplete setup. See [automatic keyboard setup and limits](macos-preferences.md#automatic-keyboard-setup-and-its-limits) for detection details and explicit selection. Manual configuration in Modifier Keys remains a fallback for unrecognized keyboards. A failed Accessibility write should be handled manually, not by rerunning with sudo.

For every group, distinguish these three checks:

- [ ] **Storage:** the helper reports `STORED` or `NO CHANGE`, with no failure. This alone does not prove the setting works.
- [ ] **Behavior:** test tap-to-click, Option-scroll screen zoom, Mission Control grouping, key repeat or the modifier swap as applicable.
- [ ] **Persistence:** retest after a convenient normal restart, or trackpad reconnection if applicable. Mark anything not tried as not tested.

**Complete the [per-setting acceptance checklist](macos-preferences.md#new-mac-acceptance-checklist).** It has the exact behavior tests, activation troubleshooting, backup/restore commands and instructions for committing fixes from this Mac back to the repo. Keep that page open while testing; no instructions from the original chat are needed.

Each changing run prints a private backup path. Save that path locally. Don't commit the backups. Defer any logout or restart until convenient; the script does not require disrupting active sessions just to run.

## 5. Pi and private environment

Install Node and Pi:

```sh
fnm install 22
fnm default 22
fnm use 22
node --version
curl -fsSL https://pi.dev/install.sh | sh
```

Node must be at least 22.19. The official Pi installer manages its runtime separately from dotfiles. Follow any interactive prompts and reopen the shell if needed.

```sh
pi --version
cd "$HOME/dotfiles"
bash scripts/install-pi-deps.sh
pi update --extensions
./setup.sh --simulate pi agent-skills
```

The helper installs locked browser/web-fetch npm dependencies without lifecycle scripts, creates ignored module-resolution aliases, and downloads matching Chromium through the locked playwright-core CLI. It refuses unexpected source dependency directories rather than replacing them. Pi reconciles interactive-subagents at the commit pinned in settings.

The old Mac was running Pi 1.6.0, Node 22.23.3 and Codex CLI 0.167.0 at this audit. The Pi installer gets the currently available release, not a runtime pinned by this repo. `lastChangelogVersion` is not an installation pin. Run the checks below before relying on a newer release.

Create the private environment file in your editor:

```sh
(umask 077; touch "$HOME/.zsh_secrets")
chmod 600 "$HOME/.zsh_secrets"
"${EDITOR:-vi}" "$HOME/.zsh_secrets"
```

Add required `export` statements privately, including `BRAVE_SEARCH_API_KEY` for web search. `.zshenv` loads this file for interactive and non-interactive zsh. Keep it limited to environment assignments, with no output, interactive commands or recursive shell startup. Open a new terminal and start Pi from it so Pi and subagents inherit those values.

In Pi, run `/login`, then `/model`. The saved default is `openai/gpt-6.1-sol`; choose an available model if the account cannot access it. Reauthenticate rather than copying old OAuth tokens or model caches.

For the optional subscription allowance footer:

```sh
npm install --global --ignore-scripts @openai/codex@0.167.0
codex -c 'cli_auth_credentials_store="keyring"' login
codex -c 'cli_auth_credentials_store="keyring"' login status
```

Use the same account and workspace as Pi, completing authentication yourself. Without Codex, Pi still works but allowance readings are unavailable. See [subscription footer](../pi/docs/subscription-footer.md).

## 6. Desktop apps and window management

- Open AeroSpace and grant Accessibility permission in System Settings.
- Enable Mission Control > Group windows by application in Desktop & Dock settings for your AeroSpace workflow. Exact settings names can vary by macOS version.
- Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and sign in with Google. Review its license for the intended use.
- Personal machines only, optional: `brew install --cask discord`, then sign in. Discord is excluded from the shared Brewfile and isn't wanted on the company Mac.
- Install Adobe Illustrator through Adobe Creative Cloud and sign in.
- Open Neovim and let LazyVim install its locked plugins. Language servers and language runtimes may need separate installs.

TrailMix is not installed here. Its Neovim integration and AeroSpace `alt-r` shortcut need a separate install at `~/.local/bin/trailmix`. Bun, Go, project checkouts and project-specific `.pi` settings are also separate.

## 7. Comic Code and Nerd Fonts

1. Download your licensed Comic Code Ligatures fonts from your Gmail purchase/download link. Keep the files outside this public repo.
2. Add the original fonts to Font Book.
3. Download the Nerd Fonts patcher and its supporting files from https://www.nerdfonts.com. Keep the extracted directory together.
4. Run `brew install fontforge` if you didn't use the Brewfile.
5. Patch all six font files. For each `.otf`, run a command like this, replacing the paths with your actual download locations:

   ```sh
   fontforge -script /path/to/font-patcher --complete --outputdir "$HOME/Downloads/ComicCode-patched" "/path/to/Comic Code Ligatures Regular.otf"
   ```

6. Open Font Book and add all six patched files.
7. Restart Ghostty. Its config expects the family `ComicCodeLigatures Nerd Font`. If the patcher produces a different family name, check Font Book and adjust the Ghostty font family to match. Ghostty also has built-in Nerd Font symbol fallback, so using the original unpatched Comic Code Ligatures font with its actual family name is another option.

If you already have a private backup of all six patched fonts, install those instead of patching again. Until the configured font is installed, Ghostty uses a fallback.

## 8. Verify and maintain

```sh
cd "$HOME/dotfiles"
python3 scripts/test-setup.py
python3 -m unittest discover -s scripts/tests -v
node pi/tests/researcher/run.mjs
node pi/tests/researcher/load-live.mjs
node --test pi/tests/subscription-footer/*.test.mjs pi/tests/subagent-pane-label/*.test.mjs pi/tests/prompt-snippets/lifecycle.test.mjs pi/tests/prompt-snippets/protocol.test.mjs
~/.local/bin/pi-skills matt status
python3 scripts/check-credentials.py
```

The credential check is pre-publication hygiene. It scans current tracked and non-ignored untracked source, prints findings without values, and doesn't stage or upload files. It doesn't scan ignored private state or Git history, and a clean result is not proof that every credential format is detectable.

The automated tests use temporary homes or mocked preferences/network/authentication. If using the optional macOS helper, complete its [per-setting acceptance checklist](macos-preferences.md#new-mac-acceptance-checklist) and note the macOS version and any activation steps needed. Also check the actual workflow:

1. Start tmux, then Pi. Confirm the footer, prompt picker and subagent pane labels.
2. Use `/plan-usage` after the optional Codex login.
3. Ask Pi for one Brave search to confirm its inherited key works.
4. Use `/browser on` and ask Pi to open a public page to confirm Chromium launches.
5. Check the font, clipboard and keybindings in Neovim and Ghostty, including inside tmux.

Keep software installs, credentials and macOS preferences separate from the public configuration. Don't upload `~/.pi`, browser profiles, `~/.ssh` private keys or `~/.zsh_secrets` to Git.
