#!/usr/bin/env python3
"""Probe CFPreferences directly, re-saving only the existing desired zoom values.

No sudo, UI scripting, permission changes or direct plist editing. Run on the
Mac being diagnosed. A successful synchronize is not proof of behavior or of
permission to change a value; this probe deliberately keeps values unchanged.
"""
import argparse
import ctypes
import platform
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--probe-write', action='store_true',
                        help='attempt to save existing matching values unchanged')
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
        if not args.probe_write:
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
