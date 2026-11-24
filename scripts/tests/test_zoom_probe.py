"""Test probe restoration logic without invoking native APIs or preferences."""
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location(
    'zoom_probe', Path(__file__).resolve().parents[1] / 'probe-zoom-preferences.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class ZoomProbeTests(unittest.TestCase):
    def exercise(self, reads, fail_disable=False):
        writes = []
        values = iter(reads)

        def write(value):
            writes.append(value)
            if fail_disable and not value:
                raise RuntimeError('disable failed')

        try:
            with contextlib.redirect_stdout(io.StringIO()):
                m.test_toggle(write, lambda: next(values))
        finally:
            self.assertEqual(writes, [False, True])

    def test_success_restores(self):
        self.exercise([False, True])

    def test_failed_disable_still_restores(self):
        with self.assertRaisesRegex(RuntimeError, 'disable failed'):
            self.exercise([True], fail_disable=True)

    def test_failed_verification_still_restores(self):
        with self.assertRaisesRegex(RuntimeError, 'did not observe'):
            self.exercise([True, True])

    def test_read_exception_still_restores(self):
        writes = []
        calls = 0

        def read():
            nonlocal calls
            calls += 1
            if calls == 1:
                raise OSError('read failed')
            return True

        with contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(OSError, 'read failed'):
                m.test_toggle(writes.append, read)
        self.assertEqual(writes, [False, True])

    def test_failed_restore_verification_reported(self):
        with self.assertRaisesRegex(RuntimeError, 'RESTORE FAILED'):
            self.exercise([False, False])
