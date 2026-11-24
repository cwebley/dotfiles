"""Validate the generated test PNG without needing a GUI terminal."""
import base64
import importlib.util
from pathlib import Path
import struct
import unittest
import zlib

SPEC = importlib.util.spec_from_file_location(
    'terminal_images', Path(__file__).resolve().parents[1] / 'test-terminal-images.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class TerminalImageTests(unittest.TestCase):
    def test_png_structure_crc_and_pixels(self):
        data = m.png()
        self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
        offset, blocks = 8, {}
        while offset < len(data):
            length = struct.unpack('!I', data[offset:offset + 4])[0]
            kind = data[offset + 4:offset + 8]
            payload = data[offset + 8:offset + 8 + length]
            crc = struct.unpack('!I', data[offset + 8 + length:offset + 12 + length])[0]
            self.assertEqual(crc, zlib.crc32(kind + payload) & 0xffffffff)
            blocks[kind] = payload
            offset += length + 12
        self.assertEqual(offset, len(data))
        self.assertEqual(struct.unpack('!IIBBBBB', blocks[b'IHDR']),
                         (240, 120, 8, 2, 0, 0, 0))
        rows = zlib.decompress(blocks[b'IDAT'])
        self.assertEqual(len(rows), 120 * (240 * 3 + 1))
        self.assertEqual(rows[1:4], bytes((240, 70, 70)))
        self.assertEqual(rows[241:244], bytes((60, 200, 100)))
        self.assertEqual(rows[481:484], bytes((60, 120, 240)))
        self.assertLess(len(base64.b64encode(data)), 4096)
