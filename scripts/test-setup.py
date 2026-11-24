#!/usr/bin/env python3
"""Exercise the current Git-eligible source in a disposable HOME. No downloads."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]
PACKAGES = ['nvim', 'zsh', 'tmux', 'ghostty', 'alacritty', 'aerospace', 'lazygit', 'git', 'pi', 'agent-skills']


class SetupTests(unittest.TestCase):
    def test_fresh_install_and_runtime_safe_restow(self):
        with tempfile.TemporaryDirectory(prefix='dotfiles-setup-test-') as tmp:
            home = Path(tmp) / 'home'
            repo = home / 'dotfiles'
            repo.mkdir(parents=True)
            names = subprocess.check_output(
                ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=REPO)
            for name in set(names.split(b'\0')) - {b''}:
                rel = Path(os.fsdecode(name))
                src, dest = REPO / rel, repo / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                if src.is_symlink():
                    dest.symlink_to(os.readlink(src))
                elif src.is_file():
                    shutil.copy2(src, dest)
            # A working tree may contain Git-ignored private/runtime files.
            runtime = [
                '.pi/agent/auth.json', '.pi/agent/models-store.json',
                '.pi/agent/install/releases/example/runtime.js',
                '.pi/agent/bin/pi', '.pi/agent/bin/fd',
                '.pi/agent/git/example/package.json', '.pi/agent/sessions/example.jsonl',
                '.pi/agent/backups/example.json', '.pi/agent/crashes.json',
                '.pi/agent/settings.before-skill-cleanup.json',
                '.pi/agent/extensions/browser/.profile/Default/Cookies',
                '.pi/agent/extensions/browser/.env',
                '.pi/agent/extensions/browser/auth.json',
                '.pi/agent/extensions/browser/credentials.json',
                '.pi/agent/extensions/browser/.cache/example.json',
                '.pi/agent/extensions/browser/node_modules/example/index.js',
            ]
            for rel in runtime:
                for base in [home, repo / 'pi']:
                    path = base / rel
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text('local state, not dotfiles\n')
            (repo / 'zsh/.zshrc~').write_text('backup\n')
            (repo / 'zsh/..zshrc.un~').write_text('undo\n')
            env = dict(os.environ, HOME=str(home))
            def setup(*args):
                result = subprocess.run(['bash', str(repo / 'setup.sh'), *args], env=env,
                                        cwd=repo, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            setup('--simulate', *PACKAGES)
            self.assertFalse((home / '.zshrc').exists())
            setup(*PACKAGES)
            setup(*PACKAGES)  # Must be repeatable with runtime already present.
            for rel in runtime:
                self.assertFalse((home / rel).is_symlink(), rel)
                self.assertEqual((home / rel).read_text(), 'local state, not dotfiles\n')
            for rel in ['.zshrc', '.zprofile', '.zshenv', '.tmux.conf',
                        '.pi/agent/settings.json', '.pi/agent/extensions/subagent-pane-label.ts',
                        '.local/bin/pi-skills', '.config/git/ignore',
                        '.config/ghostty/config.ghostty']:
                self.assertTrue((home / rel).is_symlink(), rel)
                self.assertTrue((home / rel).exists(), rel)
            for rel in ['research', 'docs', 'tests', 'README.md', '.zshrc~', '..zshrc.un~']:
                self.assertFalse((home / rel).exists(), rel)
            # Private environment loads once, including non-interactive zsh.
            (home / '.zsh_secrets').write_text('export DOTFILES_SECRET_LOADS=$(( ${DOTFILES_SECRET_LOADS:-0} + 1 ))\n')
            shell_env = dict(env)
            shell_env.pop('DOTFILES_SECRET_LOADS', None)
            output = subprocess.check_output(
                ['zsh', '-c', 'source "$HOME/.zsh_profile"; print -r -- "$DOTFILES_SECRET_LOADS"'],
                env=shell_env, text=True)
            self.assertEqual(output.strip(), '1')
            # Conflicting real config must be preserved, not adopted or overwritten.
            (home / '.zshrc').unlink()
            (home / '.zshrc').write_text('existing config\n')
            result = subprocess.run(['bash', str(repo / 'setup.sh'), 'zsh'], env=env,
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((home / '.zshrc').read_text(), 'existing config\n')


if __name__ == '__main__':
    unittest.main()
