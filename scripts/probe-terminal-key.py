#!/usr/bin/env python3
"""Print one keypress as bytes, restoring terminal mode even on failure.

Run in a spare shell pane, not in Pi's input. Does not access the clipboard.
"""
import os
import select
import sys
import termios
import tty


def main():
    fd = sys.stdin.fileno()
    if not sys.stdin.isatty():
        print('Run in an interactive shell pane.', file=sys.stderr)
        return 1
    print('Press Control+V once. Waiting up to 10 seconds. No clipboard access.', flush=True)
    saved = termios.tcgetattr(fd)
    data = bytearray()
    try:
        tty.setraw(fd)
        if select.select([fd], [], [], 10)[0]:
            data.extend(os.read(fd, 1024))
            while len(data) < 4096 and select.select([fd], [], [], 0.15)[0]:
                data.extend(os.read(fd, min(1024, 4096 - len(data))))
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, saved)
    if not data:
        print('No input bytes received.')
        return 1
    print('Bytes:', bytes(data).hex(' '))
    print('Representation:', repr(bytes(data)))
    print('Legacy Control+V is 16. An escape sequence may be an extended key encoding.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
