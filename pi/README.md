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
- `.pi/agent/extensions/`: browser, clipboard image paste, prompt snippets, Brave search, web fetch, question UI and subscription footer.
- `docs/subscription-footer.md`: browser-free OpenAI plan usage through the official Codex CLI, with subscription dollar costs hidden.
- `.pi/agent/prompts/`: prompt templates.
- `.pi/agent/skills/web-debug/`: Pi-specific browser debugging skill.
- `.pi/agent/bin/pi-skills`: shared Matt Pocock skill toggle. Its `~/.local/bin/pi-skills` command link is also stored in this package and managed by Stow.
- `tests/researcher/`: saved mocked tests against the actual installed Pi host and Stow-linked repository extensions.

Shared skills are in the separate `agent-skills/` package and still load from `~/.agents/skills/`. Moving them does not change which skills are enabled in Pi or affect other tools using that shared path.

## Installation and updates

Install Pi independently. The managed `~/.pi/agent/bin/pi` launcher, fd binary, `install/` releases and package `git/` checkouts are local runtime files, not dotfiles.

Install extension dependencies without lifecycle scripts:

```sh
for extension in browser web-fetch; do
  (cd "$HOME/.pi/agent/extensions/$extension" && npm ci --ignore-scripts)
  source_alias="$HOME/dotfiles/pi/.pi/agent/extensions/$extension/node_modules"
  if [ ! -e "$source_alias" ] && [ ! -L "$source_alias" ]; then
    ln -s "$HOME/.pi/agent/extensions/$extension/node_modules" "$source_alias"
  fi
done
```

Dependencies stay in the local home extension directory. The ignored source-side node_modules alias also lets Pi resolve imports when package discovery follows the Stow-linked manifest to its repository path. Neither the dependency tree nor this machine-local alias is tracked or managed by Stow.

Reload or restart Pi after restowing configuration. Keep package versions pinned in settings unless deliberately updating them. When an installer replaces a home symlink with a regular file, compare it with its repository source before restowing; never use `stow --adopt` to absorb unknown local state.

## Secrets and local state

Authentication, sessions, installed runtime/package checkouts, backups, model cache and browser state remain outside the repository. Ignore rules defend against accidental copies, but are not a substitute for a redacted secret scan before staging or publishing.

Brave reads `BRAVE_SEARCH_API_KEY` from the inherited environment. `zsh/.zshrc` sources `~/.zsh_secrets`; the private file stays outside dotfiles with mode 600. There is no token in the committed configuration and no credential-file fallback in search.

## Tests

```sh
cd ~/dotfiles
node pi/tests/researcher/run.mjs
node pi/tests/researcher/load-live.mjs
node --test pi/tests/subscription-footer/*.test.mjs
~/.local/bin/pi-skills matt status
```

The runner discovers the managed Pi host through its `install/current-version` file rather than a hardcoded username/version. For a different installation, set `PI_TEST_HOST_ROOT` to its node_modules directory. It uses the installed pinned subagent package for the harmless safe_bash smoke check. Stow and install the extension dependencies first. Mocked tests do not make Brave requests. `load-live.mjs` checks the Stow-linked extension paths without making web requests or opening a question dialog.

See `docs/researcher.md` for research limits, provenance, costs and remaining checks. The original setup staging copies, acceptance transcripts and install/rollback journal were archived locally under `~/.pi/agent/backups/`, not published as dotfiles. Tests now exercise the Stow-linked repository implementation, not a duplicate staging copy.
