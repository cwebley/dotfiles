# Pi configuration

This Stow package contains authored configuration, not Pi's installed runtime or credentials.

```sh
cd ~/dotfiles
./setup.sh pi agent-skills
```

`--no-folding` keeps the mixed `~/.pi/agent/` directory real and links individual configuration files. `.stow-local-ignore` keeps this README, documentation, tests and node_modules out of HOME.

## Contents

- `.pi/agent/settings.json` and `keybindings.json`: preferences and keyboard controls.
- `.pi/agent/agents/`: worker, scout, researcher and custom junior-engineer profiles.
- `.pi/agent/extensions/`: browser, clipboard image paste, prompt snippets, Brave search, web fetch, question UI, subscription footer and subagent pane labels.
- `docs/subscription-footer.md`: browser-free OpenAI plan usage through the official Codex CLI, with subscription dollar costs hidden.
- `.pi/agent/prompts/`: prompt templates.
- `.pi/agent/skills/web-debug/`: Pi-specific browser debugging skill.
- `.pi/agent/bin/pi-skills`: shared Matt Pocock skill toggle. Its `~/.local/bin/pi-skills` command link is also stored in this package and managed by Stow.
- `tests/researcher/`: saved mocked tests against the actual installed Pi host and Stow-linked repository extensions.

Shared skills are in the separate `agent-skills/` package and still load from `~/.agents/skills/`. Moving them does not change which skills are enabled in Pi or affect other tools using that shared path.

## Installation and updates

Install Pi independently. The managed `~/.pi/agent/bin/pi` launcher, fd binary, `install/` releases and package `git/` checkouts are local runtime files, not dotfiles.

Follow [New Mac setup](../docs/new-mac.md) for the full installation and login sequence. After Stow, install locked extension dependencies without lifecycle scripts and download the matching Chromium binary:

```sh
cd "$HOME/dotfiles"
bash scripts/install-pi-deps.sh
pi update --extensions
```

The dependency script refuses unexpected existing dependency directories or aliases rather than replacing them.

Dependencies stay in the local home extension directory. The ignored source-side node_modules alias also lets Pi resolve imports when package discovery follows the Stow-linked manifest to its repository path. Neither the dependency tree nor this machine-local alias is tracked or managed by Stow.

Reload or restart Pi after restowing configuration. Keep package versions pinned in settings unless deliberately updating them. When an installer replaces a home symlink with a regular file, compare it with its repository source before restowing; never use `stow --adopt` to absorb unknown local state.

## Interactive-subagents pane labels

The pinned interactive-subagents package stays unchanged. The local
`.pi/agent/extensions/subagent-pane-label.ts` extension reads its
`PI_SUBAGENT_NAME` environment variable on interactive startup and sets the
pane-local tmux option `@pi_subagent_name`. This works for new and resumed
subagents, including custom names such as `goedert-check`.

`tmux/.tmux.conf` displays that option in the pane border, falling back to
`pane_title` for ordinary panes. Pi and shell title updates cannot overwrite
the subagent label. On orderly shutdown, the extension removes the option
so a surviving shell pane returns to its normal title.

After restowing, reload tmux with `tmux source-file ~/.tmux.conf`. Newly
started subagents load the extension automatically. Already-running
subagents need `/reload` in their own Pi pane.

## Secrets and local state

Authentication, sessions, installed runtime/package checkouts, backups, model cache and browser state remain local and untracked. Git and Stow have separate ignore rules. The Stow package allows only authored settings, keybindings, resource directories and `bin/pi-skills` under `.pi/agent/`; runtime files and browser profiles are not linked even if present in the working tree. Ignore rules are not a substitute for a redacted secret scan before staging or publishing.

Brave reads `BRAVE_SEARCH_API_KEY` from the inherited environment. `zsh/.zshenv` sources `~/.zsh_secrets` for interactive and non-interactive zsh; the private file stays outside dotfiles with mode 600. There is no token in the committed configuration and no credential-file fallback in search.

## Tests

```sh
cd ~/dotfiles
node pi/tests/researcher/run.mjs
node pi/tests/researcher/load-live.mjs
node --test pi/tests/subscription-footer/*.test.mjs
node --test pi/tests/subagent-pane-label/*.test.mjs
~/.local/bin/pi-skills matt status
```

The runner discovers the managed Pi host through its `install/current-version` file rather than a hardcoded username/version. For a different installation, set `PI_TEST_HOST_ROOT` to its node_modules directory. It uses the installed pinned subagent package for the harmless safe_bash smoke check. Stow and install the extension dependencies first. Mocked tests do not make Brave requests. `load-live.mjs` checks the Stow-linked extension paths without making web requests or opening a question dialog.

See `docs/researcher.md` for research limits, provenance, costs and remaining checks. The original setup staging copies, acceptance transcripts and install/rollback journal were archived locally under `~/.pi/agent/backups/`, not published as dotfiles. Tests now exercise the Stow-linked repository implementation, not a duplicate staging copy.
