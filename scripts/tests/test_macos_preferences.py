#!/usr/bin/env python3
"""Unit tests with fake preferences. Never write real macOS settings."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / 'macos-preferences.py'
SPEC = importlib.util.spec_from_file_location('macos_preferences', MODULE_PATH)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class FakeDefaults:
    def __init__(self):
        self.values = {}
        self.fail = set()
        self.fail_read = set()
        self.writes = []
        self.ignore_writes = False
        self.on_write = None
        self.detected_keyboard = None

    def keyboard_target(self):
        return self.detected_keyboard

    @staticmethod
    def target(spec):
        return (spec['domain'], spec['key'], spec['host'])

    def domain(self, domain, host=False):
        return {key: copy.deepcopy(value) for (d, key, h), value in self.values.items()
                if d == domain and h == host}

    def read(self, spec):
        target = self.target(spec)
        if target in self.fail_read:
            raise m.PreferenceError('mock read denied')
        return dict(present=target in self.values, value=copy.deepcopy(self.values.get(target)))

    def write(self, spec, state):
        if self.on_write:
            self.on_write(spec, state)
        target = self.target(spec)
        self.writes.append((target, copy.deepcopy(state)))
        if target in self.fail:
            raise m.PreferenceError('mock write denied')
        if self.ignore_writes:
            return
        if state['present']:
            self.values[target] = copy.deepcopy(state['value'])
        else:
            self.values.pop(target, None)


class PreferencesTests(unittest.TestCase):
    def setUp(self):
        self.backend = FakeDefaults()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = io.StringIO()
        self.redirect = contextlib.redirect_stdout(self.output)
        self.redirect.__enter__()
        self.addCleanup(self.redirect.__exit__, None, None, None)

    def spec(self, key='KeyRepeat', desired=2):
        return m.setting('keyboard', key, m.GLOBAL, key, desired)

    def apply(self, specs):
        return m.apply(self.backend, m.snapshot(self.backend, specs), m.BASELINE_VERSION, self.root)

    def test_desired_repeat_values_match_accepted_faster_settings(self):
        specs, _ = m.settings(self.backend)
        values = {s['key']: s['desired'] for s in specs}
        self.assertEqual(values['KeyRepeat'], 1)
        self.assertEqual(values['InitialKeyRepeat'], 10)

    def test_preview_only_reads(self):
        specs, notes = m.settings(self.backend)
        entries = m.snapshot(self.backend, specs)
        self.assertEqual(len(entries), 8)
        self.assertTrue(any('skipped' in note for note in notes))
        self.assertEqual(self.backend.writes, [])
        self.assertEqual(list(self.root.iterdir()), [])

    def test_existing_and_unset_restore_and_repeat(self):
        a, b = self.spec(), self.spec('InitialKeyRepeat', 15)
        self.backend.values[self.backend.target(a)] = 8.0
        errors, path = self.apply([a, b])
        self.assertEqual(errors, 0)
        data = json.loads(path.read_text())
        self.assertEqual(data['entries'][0]['before'], {'present': True, 'value': 8.0})
        self.assertEqual(data['entries'][1]['before'], {'present': False, 'value': None})
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(self.apply([a, b]), (0, None))
        self.assertEqual(m.restore(self.backend, path), 0)
        self.assertEqual(self.backend.read(a), {'present': True, 'value': 8.0})
        self.assertFalse(self.backend.read(b)['present'])
        count = len(self.backend.writes)
        self.assertEqual(m.restore(self.backend, path), 0)
        self.assertEqual(len(self.backend.writes), count)

    def test_backup_journal_is_saved_before_write(self):
        def verify(spec, state):
            files = list(self.root.glob('*/backup.json'))
            self.assertEqual(len(files), 1)
            entry = json.loads(files[0].read_text())['entries'][0]
            self.assertTrue(entry['attempted'])
            self.assertFalse(entry['before']['present'])
        self.backend.on_write = verify
        self.assertEqual(self.apply([self.spec()])[0], 0)

    def test_backup_failure_prevents_preference_writes(self):
        with patch.object(m, 'save', side_effect=OSError('mock disk full')):
            with self.assertRaises(OSError):
                self.apply([self.spec()])
        self.assertFalse(self.backend.writes)

    def test_change_since_snapshot_is_preserved(self):
        spec = self.spec()
        entries = m.snapshot(self.backend, [spec])
        self.backend.values[self.backend.target(spec)] = 77
        errors, path = m.apply(self.backend, entries, m.BASELINE_VERSION, self.root)
        self.assertEqual(errors, 1)
        self.assertFalse(self.backend.writes)
        self.assertEqual(self.backend.read(spec)['value'], 77)
        self.assertFalse(json.loads(path.read_text())['entries'][0]['attempted'])

    def test_failed_write_does_not_stop_other_settings(self):
        a, b = self.spec(), self.spec('InitialKeyRepeat', 15)
        self.backend.fail.add(self.backend.target(a))
        errors, path = self.apply([a, b])
        self.assertEqual(errors, 1)
        self.assertTrue(self.backend.read(b)['present'])
        self.assertIn('mock write denied', path.read_text())

    def test_read_failure_is_not_treated_as_missing(self):
        a = self.spec()
        self.backend.fail_read.add(self.backend.target(a))
        self.assertEqual(self.apply([a]), (1, None))
        self.assertFalse(self.backend.writes)

    def test_failed_verification_is_reported(self):
        self.backend.ignore_writes = True
        errors, path = self.apply([self.spec()])
        self.assertEqual(errors, 1)
        self.assertIn('Read-back did not match', path.read_text())

    def test_restore_preserves_subsequent_user_change(self):
        a = self.spec()
        _, path = self.apply([a])
        self.backend.values[self.backend.target(a)] = 99
        self.assertEqual(m.restore(self.backend, path), 1)
        self.assertEqual(self.backend.read(a)['value'], 99)

    def test_unattempted_entry_is_never_restored(self):
        a = self.spec()
        entries = m.snapshot(self.backend, [a])
        path, data = m.new_backup(entries, m.BASELINE_VERSION, self.root)
        self.backend.values[self.backend.target(a)] = 2
        self.assertEqual(m.restore(self.backend, path), 0)
        self.assertFalse(self.backend.writes)

    def test_cross_host_and_unsupported_backup_rejected(self):
        _, path = self.apply([self.spec()])
        data = json.loads(path.read_text())
        data['identity']['host'] = 'other-mac'
        path.write_text(json.dumps(data))
        with self.assertRaises(m.PreferenceError):
            m.restore(self.backend, path)
        data['identity'] = m.identity()
        data['entries'][0]['spec']['domain'] = 'unrelated.domain'
        path.write_text(json.dumps(data))
        with self.assertRaises(m.PreferenceError):
            m.restore(self.backend, path)

    def test_mapping_preserves_unrelated_modifiers(self):
        unrelated = {'HIDKeyboardModifierMappingSrc': 0x7000000E3, 'HIDKeyboardModifierMappingDst': 0x7000000E2}
        old_caps = {'HIDKeyboardModifierMappingSrc': m.CAPS, 'HIDKeyboardModifierMappingDst': m.LEFT_CONTROL}
        result = m.swap_mapping([unrelated, old_caps])
        self.assertIn(unrelated, result)
        self.assertNotIn(old_caps, result)
        self.assertEqual(len(result), 4)
        self.assertEqual(m.swap_mapping(result), result)

    def test_unique_existing_mapping_or_explicit_key_only(self):
        key = m.MAPPING_PREFIX + '0-0-0'
        self.backend.values[(m.GLOBAL, key, True)] = []
        specs, _ = m.settings(self.backend)
        self.assertEqual(specs[-1]['key'], key)
        second = m.MAPPING_PREFIX + '1-2-3'
        self.backend.values[(m.GLOBAL, second, True)] = []
        specs, _ = m.settings(self.backend)
        self.assertFalse(any(s['key'].startswith(m.MAPPING_PREFIX) for s in specs))
        specs, _ = m.settings(self.backend, second)
        self.assertEqual(specs[-1]['key'], second)
        with self.assertRaises(m.PreferenceError):
            m.settings(self.backend, '-not-a-preference')

    def test_fresh_recognized_mac_applies_both_repeat_and_native_swap(self):
        key = m.MAPPING_PREFIX + '0-0-0'
        self.backend.detected_keyboard = key
        specs, _ = m.settings(self.backend)
        keyboard = [s for s in specs if s['group'] == 'keyboard']
        self.assertEqual(len(keyboard), 3)
        errors, path = self.apply(keyboard)
        self.assertEqual(errors, 0)
        self.assertEqual(self.backend.values[(m.GLOBAL, 'KeyRepeat', False)], 1)
        self.assertEqual(self.backend.values[(m.GLOBAL, 'InitialKeyRepeat', False)], 10)
        self.assertEqual(self.backend.values[(m.GLOBAL, key, True)], m.swap_mapping([]))
        self.assertEqual(self.apply(keyboard), (0, None))
        self.assertEqual(m.restore(self.backend, path), 0)
        self.assertEqual(self.backend.values, {})

    def test_detected_builtin_does_not_overwrite_other_keyboard(self):
        target = m.MAPPING_PREFIX + '0-0-0'
        other = m.MAPPING_PREFIX + '1-2-3'
        self.backend.detected_keyboard = target
        self.backend.values[(m.GLOBAL, other, True)] = []
        specs, _ = m.settings(self.backend)
        mapping = [s for s in specs if s['key'].startswith(m.MAPPING_PREFIX)]
        self.assertEqual([s['key'] for s in mapping], [target])
        specs, _ = m.settings(self.backend, other)
        self.assertEqual(specs[-1]['key'], other)

    def test_hardware_discovery_requires_exact_recognized_device(self):
        device = dict(IORegistryEntryName='AppleHIDKeyboardEventDriverV2',
                      Product='Apple Internal Keyboard / Trackpad',
                      VendorID=0, ProductID=0, LocationID=172, Transport='FIFO')
        backend = m.Defaults()
        cases = [([device], m.MAPPING_PREFIX + '0-0-0'),
                 ([dict(device, LocationID=106)], m.MAPPING_PREFIX + '0-0-0'),
                 ([dict(device, ProductID=123)], None),
                 ([dict(device, Transport='USB')], None),
                 ([device, device], None), ([], None)]
        for devices, expected in cases:
            with self.subTest(devices=devices), patch.object(m, 'run') as run:
                run.return_value.returncode = 0
                run.return_value.stdout = m.plistlib.dumps(devices).decode()
                self.assertEqual(backend.keyboard_target(), expected)
        with patch.object(m, 'run') as run:
            run.return_value.returncode = 1
            with self.assertRaises(m.PreferenceError):
                backend.keyboard_target()
        with patch.object(m, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = 'not a plist'
            with self.assertRaises(m.PreferenceError):
                backend.keyboard_target()

    def test_defaults_command_types_and_host_scope(self):
        backend = m.Defaults()
        cases = [(True, '-bool'), (2, '-int'), (2.5, '-float'), (m.swap_mapping([]), '-array')]
        for value, expected in cases:
            with patch.object(m, 'run') as run:
                run.return_value.returncode = 0
                spec = m.setting('keyboard', 'test', m.GLOBAL, 'test', value, True)
                backend.write(spec, {'present': True, 'value': value})
                command = run.call_args.args[0]
                self.assertEqual(command[:2], ['/usr/bin/defaults', '-currentHost'])
                self.assertIn(expected, command)
        with patch.object(m, 'run') as run:
            run.return_value.returncode = 0
            backend.write(spec, {'present': False, 'value': None})
            self.assertIn('delete', run.call_args.args[0])

    def test_domain_absence_and_permission_error_are_distinct(self):
        backend = m.Defaults()
        with patch.object(m, 'run') as run:
            run.return_value.returncode = 1
            run.return_value.stderr = 'Domain example does not exist'
            self.assertEqual(backend.domain('example'), {})
            run.return_value.stderr = 'Permission denied'
            with self.assertRaises(m.PreferenceError):
                backend.domain('example')

    def test_version_gate_prevents_apply_and_restore(self):
        for args in [['--apply', 'all'], ['--restore', 'anything.json']]:
            with patch.object(m.platform, 'system', return_value='Darwin'), \
                 patch.object(m, 'run') as run, \
                 patch.object(m, 'Defaults') as backend, \
                 patch.object(m.sys, 'argv', ['macos-preferences.py', *args]), \
                 contextlib.redirect_stderr(io.StringIO()):
                run.return_value.stdout = '99.0\n'
                with self.assertRaises(SystemExit) as exc:
                    m.main()
                self.assertEqual(exc.exception.code, 2)
                backend.assert_not_called()


if __name__ == '__main__':
    unittest.main()
