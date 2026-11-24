#!/usr/bin/env python3
"""Optional macOS preferences helper. Preview by default; no sudo or app restarts."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import platform
import plistlib
import re
import socket
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

# Inspected on this release, NOT independently behavior-verified by this script.
BASELINE_VERSION = '15.7.7'
GROUPS = ('keyboard', 'trackpad', 'zoom', 'mission-control')
GLOBAL = 'NSGlobalDomain'
MAPPING_PREFIX = 'com.apple.keyboard.modifiermapping.'
CAPS, LEFT_CONTROL, RIGHT_CONTROL = 0x700000039, 0x7000000E0, 0x7000000E4
# Keep the original settings. The faster 1/10 experiment is not yet confirmed.
KEY_REPEAT = 2
INITIAL_KEY_REPEAT = 15


class PreferenceError(Exception):
    pass


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


class Defaults:
    def command(self, domain, host, *args):
        return ['/usr/bin/defaults', *(['-currentHost'] if host else []), *args]

    def domain(self, domain, host=False):
        result = run(self.command(domain, host, 'export', domain, '-'))
        if result.returncode:
            # Do not interpret permission errors or arbitrary failures as absence.
            if 'does not exist' in result.stderr.lower():
                return {}
            raise PreferenceError(f'Cannot read {domain}; defaults exited {result.returncode}')
        try:
            return plistlib.loads(result.stdout.encode())
        except Exception as exc:
            raise PreferenceError(f'Cannot parse {domain} export') from exc

    def read(self, spec):
        values = self.domain(spec['domain'], spec['host'])
        key = spec['key']
        return {'present': key in values, 'value': values.get(key)}

    def write(self, spec, state):
        args = self.command(spec['domain'], spec['host'])
        if not state['present']:
            args += ['delete', spec['domain'], spec['key']]
        else:
            value = state['value']
            args += ['write', spec['domain'], spec['key']]
            if type(value) is bool:
                args += ['-bool', 'true' if value else 'false']
            elif type(value) is int:
                args += ['-int', str(value)]
            elif type(value) is float:
                args += ['-float', str(value)]
            elif isinstance(value, list):
                # defaults accepts XML plist values as array elements.
                args += ['-array', *[ET.tostring(ET.fromstring(plistlib.dumps(v))[0], encoding='unicode') for v in value]]
            else:
                raise PreferenceError('Unsupported preference value type')
        result = run(args)
        if result.returncode:
            raise PreferenceError(f'Write failed for {spec["key"]}; defaults exited {result.returncode}')


def setting(group, label, domain, key, desired, host=False):
    return dict(group=group, label=label, domain=domain, key=key, desired=desired, host=host)


def swap_mapping(existing):
    if not isinstance(existing, list) or any(not isinstance(x, dict) for x in existing):
        raise PreferenceError('Unexpected keyboard mapping format; use System Settings')
    sources = {CAPS, LEFT_CONTROL, RIGHT_CONTROL}
    # Preserve mappings for Command, Option, Globe and every unrelated source.
    kept = [x for x in existing if x.get('HIDKeyboardModifierMappingSrc') not in sources]
    return kept + [
        {'HIDKeyboardModifierMappingSrc': LEFT_CONTROL, 'HIDKeyboardModifierMappingDst': CAPS},
        {'HIDKeyboardModifierMappingSrc': CAPS, 'HIDKeyboardModifierMappingDst': RIGHT_CONTROL},
        {'HIDKeyboardModifierMappingSrc': RIGHT_CONTROL, 'HIDKeyboardModifierMappingDst': CAPS},
    ]


def settings(backend, keyboard_key=None):
    specs = [
        setting('keyboard', 'Repeat interval', GLOBAL, 'KeyRepeat', KEY_REPEAT),
        setting('keyboard', 'Initial repeat delay', GLOBAL, 'InitialKeyRepeat', INITIAL_KEY_REPEAT),
        setting('trackpad', 'Built-in tap-to-click', 'com.apple.AppleMultitouchTrackpad', 'Clicking', True),
        setting('trackpad', 'Bluetooth tap-to-click', 'com.apple.driver.AppleBluetoothMultitouch.trackpad', 'Clicking', True),
        setting('trackpad', 'Host tap-to-click', GLOBAL, 'com.apple.mouse.tapBehavior', 1, True),
        setting('zoom', 'Scroll-to-zoom', 'com.apple.universalaccess', 'closeViewScrollWheelToggle', True),
        setting('zoom', 'Zoom modifier: Option', 'com.apple.universalaccess', 'closeViewScrollWheelModifiersInt', 524288),
        setting('mission-control', 'Group windows by application', 'com.apple.dock', 'expose-group-apps', True),
    ]
    notes = []
    try:
        values = backend.domain(GLOBAL, True)
        keys = sorted(k for k in values if k.startswith(MAPPING_PREFIX))
        if keyboard_key:
            if not re.fullmatch(re.escape(MAPPING_PREFIX) + r'\d+-\d+-\d+', keyboard_key):
                raise PreferenceError('Invalid --keyboard-key; expected com.apple.keyboard.modifiermapping.N-N-N')
            key = keyboard_key
        elif len(keys) == 1:
            key = keys[0]
        else:
            key = None
            notes.append('Keyboard swap skipped: no unique existing host mapping. Set the swap in System Settings first, or pass a reviewed --keyboard-key. No device ID is guessed.')
            if keys:
                notes.append('Existing mapping keys: ' + ', '.join(keys))
        if key:
            specs.append(setting('keyboard', 'Caps Lock / Control swap', GLOBAL, key,
                                 swap_mapping(values.get(key, [])), True))
            notes.append(f'Keyboard mapping target: {key}. This does not guarantee coverage of other or future keyboards.')
    except PreferenceError as exc:
        notes.append(f'Keyboard mapping unavailable: {exc}')
        if keyboard_key:
            raise
    return specs, notes


def snapshot(backend, specs):
    entries = []
    for spec in specs:
        entry = dict(spec=spec, attempted=False)
        try:
            entry['before'] = backend.read(spec)
        except PreferenceError as exc:
            entry['error'] = str(exc)
        entries.append(entry)
    return entries


def matches(state, value):
    # defaults may store UI-created numbers as reals, and bools as 0/1.
    return state['present'] and state['value'] == value


def save(path, data):
    path = Path(path)
    fd, tmp = tempfile.mkstemp(prefix='.preferences-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream, indent=2)
            stream.write('\n')
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def identity():
    return {'host': socket.gethostname(), 'home': str(Path.home()), 'uid': os.getuid()}


def new_backup(entries, version, root=None):
    root = root or Path.home() / '.local/state/dotfiles/macos-preferences'
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory = Path(tempfile.mkdtemp(prefix=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-'), dir=root))
    path = directory / 'backup.json'
    data = dict(schema=1, identity=identity(), macos=version, entries=entries)
    save(path, data)  # Persist the entire plan BEFORE any preference write.
    return path, data


def apply(backend, entries, version, root=None):
    changes = [x for x in entries if 'error' not in x and not matches(x['before'], x['spec']['desired'])]
    errors = sum('error' in x for x in entries)
    if not changes:
        print('No writable settings need changing.')
        return errors, None
    path, data = new_backup(changes, version, root)
    print(f'Backup: {path}')
    for entry in data['entries']:
        spec = entry['spec']
        try:
            # Refuse to overwrite a change made since preview/snapshot.
            if backend.read(spec) != entry['before']:
                raise PreferenceError('Value changed during this run; skipped')
            entry['attempted'] = True
            save(path, data)  # Journal before writing, including failed/partial writes.
            backend.write(spec, {'present': True, 'value': spec['desired']})
            if not matches(backend.read(spec), spec['desired']):
                raise PreferenceError('Read-back did not match the requested value')
            entry['result'] = 'stored-and-read-back'
            print(f'STORED: {spec["label"]}. Behavior still needs manual confirmation.')
        except PreferenceError as exc:
            errors += 1
            entry['result'] = str(exc)
            print(f'FAILED: {spec["label"]}: {exc}')
        save(path, data)
    return errors, path


def validate_backup(data):
    if data.get('schema') != 1 or data.get('identity') != identity():
        raise PreferenceError('Backup is not schema 1 for this host, user and HOME')
    if not isinstance(data.get('entries'), list):
        raise PreferenceError('Invalid backup entries')
    # Backups are data, never executable commands. Limit restoration to our keys.
    allowed = {(x['domain'], x['key'], x['host']) for x in settings_without_mapping()}
    for entry in data['entries']:
        spec = entry['spec']
        target = (spec['domain'], spec['key'], spec['host'])
        mapping = (spec['domain'] == GLOBAL and spec['host'] is True and
                   re.fullmatch(re.escape(MAPPING_PREFIX) + r'\d+-\d+-\d+', spec['key']))
        if target not in allowed and not mapping:
            raise PreferenceError('Backup contains an unsupported preference target')
        if not isinstance(entry.get('before'), dict) or type(entry['before'].get('present')) is not bool:
            raise PreferenceError('Invalid original preference state')


def settings_without_mapping():
    class Empty:
        def domain(self, *args):
            return {}
    return settings(Empty())[0]


def restore(backend, path):
    path = Path(path)
    data = json.loads(path.read_text())
    validate_backup(data)
    errors = 0
    for entry in reversed(data['entries']):
        if not entry.get('attempted'):
            continue
        spec, before = entry['spec'], entry['before']
        try:
            current = backend.read(spec)
            if current == before:
                print(f'UNCHANGED: {spec["label"]} already matches backup')
                continue
            if not matches(current, spec['desired']):
                raise PreferenceError('Current value differs from both original and requested values; preserve it and review manually')
            backend.write(spec, before)
            if backend.read(spec) != before:
                raise PreferenceError('Restore read-back did not match original state')
            print(f'RESTORED: {spec["label"]}. Behavior still needs manual confirmation.')
        except PreferenceError as exc:
            errors += 1
            print(f'FAILED: {spec["label"]}: {exc}')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--show', action='store_true', help='read-only preview, also the default')
    mode.add_argument('--apply', choices=(*GROUPS, 'all'))
    mode.add_argument('--restore', type=Path, metavar='BACKUP_JSON')
    parser.add_argument('--allow-untested', action='store_true', help='explicitly allow writes on a different macOS release')
    parser.add_argument('--keyboard-key', help='explicit native host mapping key; no automatic hardware-ID guessing')
    args = parser.parse_args()
    if platform.system() != 'Darwin':
        parser.error('This helper runs only on macOS')
    version = run(['/usr/bin/sw_vers', '-productVersion']).stdout.strip()
    print(f'macOS {version}. Preference storage inspected on {BASELINE_VERSION}; behavior is NOT automatically verified.')
    if (args.apply or args.restore) and version != BASELINE_VERSION and not args.allow_untested:
        parser.error('Untested macOS release. Preview first; use --allow-untested only after reviewing docs/macos-preferences.md')
    backend = Defaults()
    if args.restore:
        return bool(restore(backend, args.restore))
    specs, notes = settings(backend, args.keyboard_key)
    if args.apply and args.apply != 'all':
        specs = [s for s in specs if s['group'] == args.apply]
    entries = snapshot(backend, specs)
    for entry in entries:
        spec = entry['spec']
        if 'error' in entry:
            print(f'UNAVAILABLE [{spec["group"]}] {spec["label"]}: {entry["error"]}')
        else:
            before = entry['before']
            current = repr(before['value']) if before['present'] else '<unset>'
            status = 'NO CHANGE' if matches(before, spec['desired']) else 'WOULD CHANGE'
            print(f'{status} [{spec["group"]}] {spec["label"]}: {current} -> {spec["desired"]!r}')
    for note in notes:
        print('NOTE: ' + note)
    if not args.apply:
        print('Preview only. No writes, backups, app restarts or logouts performed.')
        return bool(any('error' in x for x in entries))
    errors, path = apply(backend, entries, version)
    print('No apps were restarted. See docs/macos-preferences.md for acceptance checks and activation steps.')
    if args.apply in ('keyboard', 'all') and not any(s['key'].startswith(MAPPING_PREFIX) for s in specs):
        errors += 1
        print('INCOMPLETE: keyboard swap was skipped; follow the manual checklist.')
    return bool(errors)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (PreferenceError, OSError, ValueError, KeyError, TypeError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
