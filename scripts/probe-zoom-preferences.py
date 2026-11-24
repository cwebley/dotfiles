#!/usr/bin/env python3
"""Probe zoom through CFPreferences without sudo or permission changes.

Default: read only. --probe-write saves unchanged values. --test-toggle briefly
turns scroll zoom off, reads it in a separate process, and attempts restoration
in a finally block. Force-killing the process can prevent restoration.
"""
import argparse
import ctypes
import platform
import subprocess
import sys


def test_toggle(write_enabled, read_enabled):
    """Always attempt restoration, including after failed writes or reads."""
    try:
        write_enabled(False)
        if read_enabled() is not False:
            raise RuntimeError('Separate-process read did not observe zoom disabled')
        print('VERIFIED: separate process observed scroll zoom disabled.')
    finally:
        write_enabled(True)
        if read_enabled() is not True:
            raise RuntimeError('RESTORE FAILED: turn scroll zoom on in System Settings')
        print('RESTORED: separate process observed scroll zoom enabled.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--probe-write', action='store_true',
                      help='attempt to save existing matching values unchanged')
    mode.add_argument('--test-toggle', action='store_true',
                      help='briefly disable scroll zoom and restore it; Option is untouched')
    args = parser.parse_args()
    if platform.system() != 'Darwin':
        parser.error('Run this on the Mac being diagnosed.')

    cf = ctypes.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
    ptr = ctypes.c_void_p

    def bind(name, restype, argtypes):
        fn = getattr(cf, name)
        fn.restype = restype
        fn.argtypes = argtypes
        return fn

    string = bind('CFStringCreateWithCString', ptr, [ptr, ctypes.c_char_p, ctypes.c_uint32])
    number = bind('CFNumberCreate', ptr, [ptr, ctypes.c_int, ptr])
    read = bind('CFPreferencesCopyAppValue', ptr, [ptr, ptr])
    equal = bind('CFEqual', ctypes.c_ubyte, [ptr, ptr])
    set_value = bind('CFPreferencesSetAppValue', None, [ptr, ptr, ptr])
    sync = bind('CFPreferencesAppSynchronize', ctypes.c_ubyte, [ptr])
    release = bind('CFRelease', None, [ptr])

    owned = []

    def text(value):
        ref = string(None, value.encode('utf-8'), 0x08000100)
        if not ref:
            raise RuntimeError('Cannot allocate CFString')
        owned.append(ref)
        return ref

    try:
        domain = text('com.apple.universalaccess')
        option = ctypes.c_int64(524288)
        expected_option = number(None, 4, ctypes.byref(option))  # kCFNumberSInt64Type
        if not expected_option:
            raise RuntimeError('Cannot allocate CFNumber')
        owned.append(expected_option)
        expected_true = ptr.in_dll(cf, 'kCFBooleanTrue').value
        checks = [('closeViewScrollWheelToggle', expected_true),
                  ('closeViewScrollWheelModifiersInt', expected_option)]
        values = []
        for name, expected in checks:
            key = text(name)
            current = read(key, domain)
            if current:
                owned.append(current)
            if not current or not equal(current, expected):
                print(f'STOP: {name} is absent or not the expected working value.')
                print('No writes attempted. Keep your working settings intact.')
                return 1
            print(f'READ MATCH: {name}')
            values.append((key, current))
        if not args.probe_write and not args.test_toggle:
            print('Read-only. Add --probe-write to attempt saving the same values.')
            return 0
        # Recheck both values before attempting any writes.
        for key, current in values:
            latest = read(key, domain)
            if latest:
                owned.append(latest)
            if not latest or not equal(latest, current):
                print('STOP: preferences changed during the probe. No writes attempted.')
                return 1
        if args.test_toggle:
            def write_enabled(enabled):
                value = ptr.in_dll(cf, 'kCFBooleanTrue' if enabled else 'kCFBooleanFalse').value
                set_value(values[0][0], value, domain)
                if not sync(domain):
                    raise RuntimeError(f'Native synchronize failed for enabled={enabled}')

            def read_enabled():
                result = subprocess.run(
                    ['/usr/bin/defaults', 'read', 'com.apple.universalaccess',
                     'closeViewScrollWheelToggle'], capture_output=True, text=True)
                if result.returncode:
                    raise RuntimeError('Separate-process defaults read failed')
                value = result.stdout.strip().lower()
                if value not in ('0', '1', 'false', 'true'):
                    raise RuntimeError('Unexpected separate-process boolean value')
                return value in ('1', 'true')

            try:
                test_toggle(write_enabled, read_enabled)
            except (RuntimeError, OSError) as exc:
                print(f'FAILED: {exc}')
                print('Check Accessibility > Zoom; enable scroll zoom with Option if needed.')
                return 1
            print('Native change and restoration verified through separate-process reads.')
            print('Option was not written. Retest Option-scroll behavior yourself.')
            return 0
        for key, current in values:
            set_value(key, current, domain)
        ok = bool(sync(domain))
        print(f'CFPreferencesAppSynchronize returned {ok}.')
        print('Only existing values were submitted; no permission changes were requested.')
        print('This result alone does not prove durable storage or authorization to change values.')
        return 0 if ok else 1
    finally:
        for ref in reversed(owned):
            release(ref)


if __name__ == '__main__':
    sys.exit(main())
