#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# Pass package names to install a subset, for example: ./setup.sh pi agent-skills
if [ "$#" -eq 0 ]; then
  set -- nvim lvim misc zsh tmux ghostty aerospace pi agent-skills
fi
stow --target="$HOME" --restow --no-folding "$@"
