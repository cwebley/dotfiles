# Dotfiles

Configuration managed with GNU Stow. Clone this repository at `~/dotfiles` and install selected packages:

```sh
cd ~/dotfiles
./setup.sh nvim zsh tmux alacritty aerospace pi agent-skills
```

Run `./setup.sh` without package names for the full default set, including lvim and misc. The script uses `--restow --no-folding` and targets HOME explicitly. Preview the same operation with `./setup.sh --simulate pi agent-skills`. Never use `--adopt` to overwrite source with unknown home-directory state.

## Pi and shared skills

- `pi/` contains Pi settings, keybindings, agent profiles, extensions, prompts, a Pi-specific skill and saved tests. See [Pi setup](pi/README.md).
- `agent-skills/` contains shared skills and their source lock, linked into `~/.agents/` for Pi and other tools.
- Pi authentication, sessions, runtime releases, package checkouts, model cache and backups stay local under `~/.pi/agent/`, outside Git.
- Project-specific Pi settings stay in each project's `.pi/settings.json`.

## Private shell environment

`zsh/.zshrc` sources `~/.zsh_secrets` when it exists. That private file is outside this repository and ignored if accidentally copied inside it. Keep it mode 600 and configure secret values privately. Commit the loader in `.zshrc`, never the private file. Environment changes require starting Pi from a shell that inherited them.

## Before committing

Review `git status --short` and the intended diff. Run the redacted scanner over tracked and non-ignored untracked source:

```sh
# Requires gitleaks v8 on PATH. Install it separately if needed.
python3 scripts/check-credentials.py
```

The check prints paths/rules/line numbers only, checks an inherited Brave key for exact matches without exposing it, and does not stage anything. It excludes ignored private state and is not a full historical audit or proof that every possible secret format is detectable. Ignore rules do not remove a secret already tracked by Git.

Never stage credential files, shell history, sessions, browser data, dependencies or local setup/acceptance archives. This repository is public, so review third-party source licensing as well as credentials before publication. The adapted pi-config research extensions have no upstream license declaration; see `pi/docs/researcher.md` before including them in a public push.
