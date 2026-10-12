#!/usr/bin/env python3
"""Scan prospective Git files without printing credential values.

Requires gitleaks v8. Scan tracked and non-ignored untracked source, not home
credentials, ignored state, dependency trees, or Git history. No files staged.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gitleaks', default=shutil.which('gitleaks'))
    args = parser.parse_args()
    if not args.gitleaks:
        parser.error('Install gitleaks or supply --gitleaks /path/to/gitleaks')
    repo = Path(__file__).resolve().parents[1]
    names = subprocess.check_output(['git', '-C', str(repo), 'ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    files = sorted({repo / os.fsdecode(name) for name in names.split(b'\0') if name})
    findings = []
    scanned = links = 0
    # Exact comparison happens only in memory. Never print or persist this value.
    known_brave_key = os.environ.get('BRAVE_SEARCH_API_KEY')
    environment = os.environ.copy()
    environment.pop('GITLEAKS_CONFIG', None)
    environment.pop('GITLEAKS_CONFIG_TOML', None)
    with tempfile.TemporaryDirectory(prefix='dotfiles-secret-check-') as ignore_directory:
        for path in files:
            label = str(path.relative_to(repo))
            name = path.name.lower()
            example = any(word in name for word in ('example', 'template', 'sample'))
            if name in ('auth.json', 'credentials.json', 'models-store.json', '.zsh_secrets', '.zsh_history', '.bash_history', 'id_rsa', 'id_ed25519') or (not example and (name.startswith('.env') or 'secrets' in name or name.endswith(('.pem', '.key')))):
                findings.append({'path': label, 'issue': 'Sensitive filename is eligible for Git; file was not read'})
                continue
            if path.is_symlink():
                target = path.resolve(strict=False)
                if not target.is_relative_to(repo):
                    findings.append({'path': label, 'issue': 'Source symlink points outside this repository'})
                links += 1
                continue
            if not path.is_file():
                continue
            if known_brave_key and known_brave_key.encode() in path.read_bytes():
                findings.append({'path': label, 'issue': 'Exact inherited Brave credential found; value withheld'})
            result = subprocess.run([
                args.gitleaks, 'dir', str(path), '--redact=100', '--no-banner', '--no-color',
                '--log-level', 'error', '--ignore-gitleaks-allow', '--gitleaks-ignore-path', ignore_directory,
                '--report-format', 'json', '--report-path', '-',
            ], capture_output=True, text=True, env=environment)
            if result.returncode not in (0, 1):
                print(f'Scanner failed for {label}; output withheld.', file=sys.stderr)
                return 2
            for finding in json.loads(result.stdout or '[]'):
                findings.append({'path': label, 'rule': finding.get('RuleID'), 'line': finding.get('StartLine')})
            scanned += 1
    if findings:
        print(json.dumps({'findings_without_values': findings}, indent=2))
        return 1
    print(f'PASS: {scanned} prospective files scanned, {links} internal source links checked; no detected secrets.')
    print('Scope: current Git-eligible source, not historical commits or ignored private state. No files staged.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
