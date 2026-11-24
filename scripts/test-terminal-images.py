#!/usr/bin/env python3
"""Display a generated RGB test card using the Kitty graphics protocol.

No dependencies, downloads or files written. In tmux, wraps output in a DCS
passthrough envelope; the pane must permit passthrough. This tests one-shot
image display, not scrolling, redraw or application-specific integration.
"""
import base64
import os
import struct
import sys
import zlib


def chunk(kind, payload):
    return (struct.pack('!I', len(payload)) + kind + payload +
            struct.pack('!I', zlib.crc32(kind + payload) & 0xffffffff))


def png():
    width, height = 240, 120
    rows = bytearray()
    colors = [(240, 70, 70), (60, 200, 100), (60, 120, 240)]
    for y in range(height):
        rows.append(0)  # PNG filter: none
        for x in range(width):
            color = colors[x // 80]
            if y >= 100:
                color = (240, 240, 240) if (x // 10) % 2 else (30, 30, 30)
            rows.extend(color)
    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', struct.pack('!IIBBBBB', width, height, 8, 2, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(bytes(rows))) + chunk(b'IEND', b''))


def main():
    if not sys.stdout.isatty():
        print('Run directly in an interactive terminal, not through a pipe or redirect.',
              file=sys.stderr)
        return 1
    inside_tmux = bool(os.environ.get('TMUX'))
    print('Image test ' + ('inside tmux.' if inside_tmux else 'outside tmux.'))
    print('Expect red, green and blue bars with a black/white strip below.')
    print('A blank area is NOT a pass. Image scrolling/redraw is a separate test.')
    sys.stdout.flush()
    payload = base64.b64encode(png())
    # Transmit and display a small PNG in one packet, suppress protocol replies.
    sequence = b'\x1b_Ga=T,f=100,t=d,q=2,c=30,r=8;' + payload + b'\x1b\\'
    if inside_tmux:
        sequence = b'\x1bPtmux;' + sequence.replace(b'\x1b', b'\x1b\x1b') + b'\x1b\\'
    sys.stdout.buffer.write(sequence)
    sys.stdout.buffer.write(b'\n' * 9)
    sys.stdout.buffer.flush()
    return 0


if __name__ == '__main__':
    sys.exit(main())
