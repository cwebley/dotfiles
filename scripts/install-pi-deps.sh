#!/bin/bash
# Run after Stow. Downloads locked npm dependencies and matching Chromium.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
command -v npm >/dev/null || { echo 'Install Node with fnm first.' >&2; exit 1; }

for extension in browser web-fetch; do
  live="$HOME/.pi/agent/extensions/$extension"
  source_dir="$repo/pi/.pi/agent/extensions/$extension"
  if [ ! -L "$live/package.json" ] || ! [ "$live/package.json" -ef "$source_dir/package.json" ]; then
    echo "Restow pi first; $live/package.json must link to this checkout." >&2
    exit 1
  fi
  alias_path="$source_dir/node_modules"
  if [ -L "$alias_path" ]; then
    if [ "$(readlink "$alias_path")" != "$live/node_modules" ]; then
      echo "Unexpected dependency alias: $alias_path. Review it manually." >&2
      exit 1
    fi
  elif [ -e "$alias_path" ]; then
    echo "Source dependency directory exists: $alias_path. Review it manually." >&2
    exit 1
  fi
done

for extension in browser web-fetch; do
  live="$HOME/.pi/agent/extensions/$extension"
  (cd "$live" && npm ci --ignore-scripts)
  alias_path="$repo/pi/.pi/agent/extensions/$extension/node_modules"
  if [ ! -L "$alias_path" ]; then
    ln -s "$live/node_modules" "$alias_path"
  fi
done

# Use the locked playwright-core CLI, not an unpinned npx download.
node "$HOME/.pi/agent/extensions/browser/node_modules/playwright-core/cli.js" install chromium
printf '\nPi extension dependencies and Chromium installed. Restart Pi.\n'
