# Dotfiles

Configuration managed with GNU Stow. For a fresh Apple Silicon Mac, follow [New Mac setup](docs/new-mac.md), including Homebrew, Pi dependencies, private environment and login steps.

Clone this repository at `~/dotfiles` and install selected packages:

```sh
cd ~/dotfiles
./setup.sh nvim zsh tmux alacritty aerospace lazygit git pi agent-skills
```

Run `./setup.sh` without package names for the full default set, including lvim and misc. The script uses `--restow --no-folding` and targets HOME explicitly. Preview the same operation with `./setup.sh --simulate pi agent-skills`. Never use `--adopt` to overwrite source with unknown home-directory state.

The `git` package manages global ignore patterns only, not your identity or credentials. Git uses `~/.config/git/ignore` by default unless `core.excludesFile` overrides it. `Brewfile` is an optional shortcut for the checklist's Homebrew installs; Stow itself does not install software.

## Pi and shared skills

- `pi/` contains Pi settings, keybindings, agent profiles, extensions, prompts, a Pi-specific skill and saved tests. See [Pi setup](pi/README.md).
- `agent-skills/` contains shared skills and their source lock, linked into `~/.agents/` for Pi and other tools.
- Pi authentication, sessions, runtime releases, package checkouts, model cache and backups stay local under `~/.pi/agent/`, outside Git.
- Project-specific Pi settings stay in each project's `.pi/settings.json`.

## Private shell environment

`zsh/.zshenv` sources `~/.zsh_secrets` for interactive and non-interactive zsh. That private file is outside this repository and ignored if accidentally copied inside it. Keep it mode 600 and limited to environment assignments. Commit the loader, never the private file. Open a new shell and start Pi from it after changing private values.

## Optional macOS preferences

`python3 scripts/macos-preferences.py --show` previews your saved preferences without changing anything. Explicit apply commands, backups, undo and the new-Mac behavior checks are in [macOS preferences helper and acceptance checklist](docs/macos-preferences.md). Stow and the Brewfile never run it. Preference storage was inspected on macOS 15.7.7; actual activation is still awaiting acceptance testing.

## Setup checks

```sh
python3 scripts/test-setup.py
python3 -m unittest discover -s scripts/tests -v
```

This checks a fresh install, repeated Stow runs with private/runtime state present, private environment loading and conflict preservation in a temporary HOME. It does not install software or modify your real HOME. Git ignores and Stow ignores are separate; both must exclude local Pi state.

## Before committing

Review `git status --short` and the intended diff. Run the redacted scanner over tracked and non-ignored untracked source:

```sh
# Requires gitleaks v8 on PATH. Install it separately if needed.
python3 scripts/check-credentials.py
```

The check prints paths/rules/line numbers only, checks an inherited Brave key for exact matches without exposing it, and does not stage anything. It excludes ignored private state and is not a full historical audit or proof that every possible secret format is detectable. Ignore rules do not remove a secret already tracked by Git.

Never stage credential files, shell history, sessions, browser data, dependencies or local setup/acceptance archives. This repository is public, so review third-party source licensing as well as credentials before publication. The adapted pi-config research extensions have no upstream license declaration; see `pi/docs/researcher.md` before including them in a public push.
