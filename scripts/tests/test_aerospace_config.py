"""Guard the schema-2 migration's workspace persistence and key reservations."""
from pathlib import Path
import tomllib
import unittest


class AerospaceConfigTests(unittest.TestCase):
    def test_explicit_workspaces_preserve_binding_targets(self):
        path = Path(__file__).resolve().parents[2] / 'aerospace/.config/aerospace/aerospace.toml'
        config = tomllib.loads(path.read_text())
        self.assertEqual(config['config-version'], 2)
        targets = set()
        for mode in config['mode'].values():
            for commands in mode['binding'].values():
                for command in commands if isinstance(commands, list) else [commands]:
                    parts = command.split()
                    if parts and parts[0] in {'workspace', 'move-node-to-workspace'}:
                        self.assertEqual(len(parts), 2)
                        targets.add(parts[1])
        persistent = config['persistent-workspaces']
        self.assertEqual(len(persistent), len(set(persistent)))
        self.assertEqual(set(persistent), targets)
        self.assertEqual(len(persistent), 29)
        self.assertIn('0', persistent)
        self.assertTrue(set('FHJKLRS').isdisjoint(persistent))
        bindings = config['mode']['main']['binding']
        self.assertNotIn('alt-s', bindings)
        self.assertNotIn('alt-shift-s', bindings)
        self.assertTrue(bindings['alt-r'].startswith('exec-and-forget '))
        for rule in config['on-window-detected']:
            for command in rule['run']:
                parts = command.split()
                if parts[0] == 'move-node-to-workspace':
                    self.assertIn(parts[1], persistent)


if __name__ == '__main__':
    unittest.main()
