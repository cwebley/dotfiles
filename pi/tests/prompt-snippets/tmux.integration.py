#!/usr/bin/env python3
"""Production acceptance through real Pi SDK and fzf, offline on private tmux sockets.

Run: python3 tests/prompt-snippets/tmux.integration.py
Use --mode fullscreen or --case matrix for a focused run. Evidence is retained in
an external private directory printed before launch. No installs or credentials.
The copied production code is hash-checked; only its snippets directory differs.
Ownership/launch race injection belongs in deterministic production unit tests.
"""
import argparse
import fcntl
import hashlib
import json
import os
import pty
import select
import shlex
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
PRODUCTION = REPO / '.pi/agent/extensions/prompt-snippets'
DRAFT = 'DRAFT π café 保留'
BODIES = {'alpha.md': 'ALPHA prepend body π',
          'beta.md': '\n'.join('BETA preview line %02d' % i for i in range(1, 41)),
          'charlie.md': 'CHARLIE append body 保留', 'delta.md': 'DELTA append body café'}
META = [('alpha.md', 'Alpha', 'prepend', 20), ('beta.md', 'Beta', 'prepend', 10),
        ('charlie.md', 'Charlie', 'append', 20), ('delta.md', 'Delta', 'append', 10)]


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)


class Case:
    def __init__(self, opts, mode, kind):
        self.opts, self.mode, self.kind = opts, mode, kind
        self.case = opts.evidence / (mode + '-' + kind)
        self.case.mkdir(mode=0o700)
        # Deliberately outside long evidence paths. Never use inherited TMUX.
        self.socketdir = Path(tempfile.mkdtemp(prefix='psi-', dir='/tmp'))
        self.socket = self.socketdir / 's'
        assert len(os.fsencode(self.socket)) < 80
        self.master = self.client = self.origin = None
        self.screen = bytearray()
        self.started = time.monotonic()
        self.checks = []
        self.closed_pids = set()
        self.child_pids = set()
        for name in ['home', 'agent', 'tmp', 'bin', 'work']:
            (self.case / name).mkdir(mode=0o700)
        self.copy = self.case / 'production'
        shutil.copytree(PRODUCTION, self.copy, ignore=shutil.ignore_patterns('snippets'))
        hashes = {}
        for src in PRODUCTION.rglob('*'):
            if src.is_file() and 'snippets' not in src.relative_to(PRODUCTION).parts:
                rel = src.relative_to(PRODUCTION)
                actual = self.copy / rel
                hashes[str(rel)] = hashlib.sha256(src.read_bytes()).hexdigest()
                assert hashlib.sha256(actual.read_bytes()).hexdigest() == hashes[str(rel)]
        self.write_json('production-hashes.json', hashes)
        snippets = self.copy / 'snippets'
        snippets.mkdir()
        for filename, name, placement, order in META:
            (snippets / filename).write_text('---\nname: %s\ndescription: DESCRIPTION_ONLY_%s\nplacement: %s\norder: %s\n---\n%s\n' % (name, name, placement, order, BODIES[filename]))
        self.skill = self.case / 'fixture-skill'
        self.skill.mkdir()
        (self.skill / 'SKILL.md').write_text('---\nname: fixture-skill\ndescription: Offline fixture instructions\n---\nSKILL_FIXTURE_BODY\n')
        self.template = self.case / 'fixture-template.md'
        self.template.write_text('---\ndescription: Offline template\n---\nTEMPLATE_FIXTURE_BODY $ARGUMENTS\n')
        self.log = self.case / 'events.jsonl'
        self.network = self.case / 'network.jsonl'
        self.log.touch(); self.network.touch()
        self.env = dict(PATH=str(self.case / 'bin') + ':' + os.path.dirname(opts.node) + ':' + os.path.dirname(opts.tmux) + ':' + os.path.dirname(opts.fzf) + ':/usr/bin:/bin',
                        HOME=str(self.case / 'home'), TMPDIR=str(self.case / 'tmp'),
                        XDG_CONFIG_HOME=str(self.case / 'home/config'), XDG_CACHE_HOME=str(self.case / 'home/cache'),
                        TERM='xterm-256color', LANG='en_US.UTF-8', PI_CODING_AGENT_DIR=str(self.case / 'agent'),
                        PI_OFFLINE='1', PI_SKIP_VERSION_CHECK='1', PI_TELEMETRY='0',
                        SPIKE_LOG=str(self.log), SPIKE_NETWORK_LOG=str(self.network), SPIKE_DIALOG='1',
                        PI_TUI_WRITE_LOG=str(self.case / 'pi-tui.ansi'),
                        NODE_OPTIONS='--require=' + str(ROOT / 'integration-no-network.cjs'),
                        FZF_DEFAULT_OPTS='--invalid-integration-default-option',
                        FZF_DEFAULT_OPTS_FILE=str(self.case/'poison-fzf-options'),
                        INTEGRATION_SDK_ENTRY=str(opts.sdk / 'dist/index.js'),
                        INTEGRATION_PRODUCTION_ENTRY=str(self.copy / 'index.ts'),
                        INTEGRATION_SKILL=str(self.skill), INTEGRATION_TEMPLATE=str(self.template))
        # Wrapper failures affect production PATH lookup, not the driver's known binary.
        tmux_wrapper = '#!/bin/sh\n'
        if kind == 'split-failure':
            tmux_wrapper += 'for arg do if [ "$arg" = split-window ]; then echo "fixture split failure" >&2; exit 1; fi; done\n'
        tmux_wrapper += 'exec ' + shlex.quote(opts.tmux) + ' "$@"\n'
        self.script('tmux', tmux_wrapper)
        if kind == 'missing-fzf':
            self.env['PATH'] = str(self.case/'bin')+':/usr/bin:/bin'
        elif kind == 'fzf-runtime-failure':
            self.script('fzf', '#!/bin/sh\nif [ "$1" = --version ]; then exec ' + shlex.quote(opts.fzf) + ' "$@"; fi\nexec /missing/integration-fzf\n')
        else:
            # Delay only transport in a deterministic send-first test. Actual fzf still runs.
            self.script('fzf', '#!' + sys.executable + '\n' +
                        'import json,os,subprocess,sys,time\nfrom pathlib import Path\n' +
                        'real=' + repr(opts.fzf) + '\nbase=Path(' + repr(str(self.case)) + ')\n' +
                        'if "--version" in sys.argv: os.execv(real,[real,*sys.argv[1:]])\n' +
                        'with (base/"fzf-invocations.jsonl").open("a") as log: log.write(json.dumps({"args":sys.argv[1:],"defaults":os.environ.get("FZF_DEFAULT_OPTS"),"file":os.environ.get("FZF_DEFAULT_OPTS_FILE"),"shell":os.environ.get("SHELL")})+"\\n")\n' +
                        'p=subprocess.Popen([real,*sys.argv[1:]],stdout=subprocess.PIPE)\n' +
                        '(base/"fzf-pid").write_text(str(p.pid))\n' +
                        'out,_=p.communicate()\n' +
                        'if (base/"delay-fzf").exists():\n' +
                        ' (base/"fzf-captured.json").write_text(json.dumps({"status":p.returncode,"output":out.decode()}))\n' +
                        ' end=time.monotonic()+5\n' +
                        ' while (base/"delay-fzf").exists() and time.monotonic()<end: time.sleep(.02)\n' +
                        'sys.stdout.buffer.write(out);sys.stdout.buffer.flush();sys.exit(p.returncode)\n')
        self.write_json('invocation.json', {'mode':mode, 'case':kind, 'socket':str(self.socket), 'env':self.env, 'tmux':opts.tmux, 'fzf':opts.fzf, 'node':opts.node})

    def script(self, name, text):
        path = self.case / 'bin' / name
        path.write_text(text); path.chmod(0o700)

    def write_json(self, name, value):
        (self.case / name).write_text(json.dumps(value, indent=2) + '\n')

    def tmux(self, *args, check=True):
        result = subprocess.run([self.opts.tmux, '-S', str(self.socket), *args], env=self.env,
                                capture_output=True, text=True, timeout=4)
        if check and result.returncode:
            raise AssertionError('tmux %r: %s' % (args, result.stderr))
        return result.stdout.strip()

    def drain(self, seconds=.04):
        if time.monotonic() - self.started > self.opts.timeout:
            raise TimeoutError('bounded case timeout')
        if self.master is None:
            return
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            ready, _, _ = select.select([self.master], [], [], max(0, min(.04, end-time.monotonic())))
            if ready:
                try:
                    self.screen.extend(os.read(self.master, 65536))
                except OSError:
                    break

    def events(self, kind=None):
        data = [json.loads(line) for line in self.log.read_text().splitlines() if line]
        return [e for e in data if kind is None or e['event'] == kind]

    def wait_until(self, predicate, message, timeout=12):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            self.drain()
            value = predicate()
            if value:
                return value
        raise AssertionError(message + '\n' + repr(self.events()[-8:]))

    def wait(self, kind, count=1, predicate=lambda e: True, timeout=12):
        return self.wait_until(lambda: ([e for e in self.events(kind) if predicate(e)] or [None])[-1]
                               if len([e for e in self.events(kind) if predicate(e)]) >= count else None,
                               'missing ' + kind, timeout)

    def key(self, pane, *keys):
        self.tmux('send-keys', '-t', pane, *keys)

    def literal(self, pane, text):
        self.tmux('send-keys', '-t', pane, '-l', '--', text)

    def panes(self):
        return self.tmux('list-panes', '-t', self.origin, '-F', '#{pane_id}').splitlines()

    def active(self):
        return self.tmux('display-message', '-p', '-t', self.origin, '#{window_id}') and self.tmux('list-panes', '-t', self.origin, '-F', '#{pane_id} #{pane_active}').splitlines()

    def editor(self):
        n = len(self.events('editor'))
        self.key(self.origin, 'M-t')
        return self.wait('editor', n+1)

    def draft(self, text=DRAFT):
        self.key(self.origin, 'C-u'); self.literal(self.origin, text)
        assert self.editor()['text'] == text

    def capture(self, label, picker=None):
        pi = self.tmux('capture-pane', '-p', '-t', self.origin, '-S', '-200')
        (self.case / (label+'-pi.txt')).write_text(pi+'\n')
        assert '[prepend]' not in pi and '[append]' not in pi, 'picker list leaked into Pi pane'
        if picker and picker in self.panes():
            text = self.tmux('capture-pane', '-p', '-t', picker)
            (self.case / (label+'-fzf.txt')).write_text(text+'\n')
            return text
        return pi

    def open(self):
        before = set(self.panes())
        self.key(self.origin, 'M-s')
        new = self.wait_until(lambda: set(self.panes()) - before, 'no production picker pane')
        assert len(new) == 1
        pane = new.pop()
        pid = int(self.tmux('display-message', '-p', '-t', pane, '#{pane_pid}'))
        self.child_pids.add(pid)
        self.wait_until(lambda: '[prepend]' in self.tmux('capture-pane', '-p', '-t', pane), 'fzf did not render')
        self.drain(.12)
        if (self.case/'fzf-pid').exists(): self.child_pids.add(int((self.case/'fzf-pid').read_text()))
        directories = list((self.case/'tmp').glob('pi-snippets-*'))
        assert len(directories) == 1, 'one private invocation directory required'
        directory = directories[0]
        assert directory.stat().st_mode & 0o777 == 0o700
        for path in directory.iterdir():
            if path.is_file(): assert path.stat().st_mode & 0o777 == 0o600, 'private file permission: '+str(path)
        self.capture('open-'+pane[1:], pane)
        if pane+' 1' not in self.active():
            self.write_json('focus-diagnostic.json', {
                'clients': self.tmux('list-clients', '-F', '#{client_name}|#{client_flags}'),
                'origin': self.tmux('display-message', '-p', '-t', self.origin, '#{L:x}|#{session_attached_list}|#{pane_id}|#{pane_active}|#{window_active}|#{session_attached}|#{L:#{m:*active-pane*,#{client_flags}}}'),
                'picker': self.tmux('display-message', '-p', '-t', pane, '#{pane_start_command}|#{@pi_snippets_nonce}'),
                'config': json.loads((directory/'config.json').read_text())})
        assert pane+' 1' in self.active(), 'single-client focus guard did not select picker'
        assert not any('Use your tmux pane-navigation keys' in e.get('message', '') for e in self.events('notification')), 'misleading detached-focus notification'
        return pane

    def query(self, pane, text):
        self.key(pane, 'C-u'); self.literal(pane, text); self.drain(.15)

    def close(self, pane, keys=('Enter',), expected_focus=None):
        self.key(pane, *keys)
        self.wait_until(lambda: pane not in self.panes(), 'picker did not close')
        self.wait_until(lambda: not list((self.case / 'tmp').glob('pi-snippets-*')), 'snapshot directory leaked')
        self.drain(.10)
        assert (expected_focus or self.origin)+' 1' in self.active(), 'closure stole focus'
        assert self.editor()['text'] == DRAFT
        return self.editor()

    def widget_names(self, expected):
        widget = self.editor()['widget']
        text = '\n'.join(widget or [])
        for _, name, _, _ in META:
            assert (name in text) == (name in expected), (expected, text)

    def select(self, names):
        pane = self.open()
        for name in names:
            self.query(pane, name); self.key(pane, 'Tab')
        self.close(pane)
        self.widget_names(names)

    def submit(self, text, streaming=False):
        self.draft(text)
        n = len(self.events('production-input-after'))
        self.key(self.origin, 'M-Enter' if streaming else 'Enter')
        result = self.wait('production-input-after', n+1)
        self.wait_until(lambda: not list((self.case / 'tmp').glob('pi-snippets-*')), 'input did not clean snapshots')
        return result

    def provider_contains(self, expected):
        self.wait_until(lambda: any(expected in list(strings(e['messages'])) for e in self.events('mock-request')),
                        'normalized provider transcript lacks exact composed body')

    def settled(self, previous):
        self.wait('agent_settled', previous+1, timeout=20)
        self.draft()

    def start(self):
        command = 'exec ' + shlex.quote(self.opts.node) + ' ' + shlex.quote(str(ROOT/'integration-sdk.mjs')) + ' --tui-mode ' + self.mode + ' -e ' + shlex.quote(str(ROOT/'integration-extension.ts'))
        self.origin = self.tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'production-offline', '-x', '160', '-y', '44', '-P', '-F', '#{pane_id}', command)
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 44, 160, 0, 0))
        self.client = subprocess.Popen([self.opts.tmux, '-S', str(self.socket), 'attach-session', '-t', 'production-offline'],
                                       stdin=slave, stdout=slave, stderr=slave, env=self.env, start_new_session=True)
        os.close(slave)
        self.wait('ready')
        self.child_pids.add(int(self.tmux('display-message', '-p', '-t', self.origin, '#{pane_pid}')))
        assert self.editor()['text'] == DRAFT

    def matrix(self):
        self.key(self.origin, 'M-r'); self.wait('mock-delta')
        pane = self.open()
        n = len(self.panes()); self.key(self.origin, 'M-s'); self.drain(.25)
        assert len(self.panes()) == n, 'duplicate invocation created a second picker'
        self.wait('tool-dialog-installed')
        pi = self.tmux('capture-pane', '-p', '-t', self.origin, '-S', '-200')
        assert 'OFFLINE TOOL DIALOG' in pi and 'MOCK_INITIAL_' in pi
        self.query(pane, 'Alpha'); self.key(pane, 'Tab')
        before = len(self.events('pi-write'))
        self.close(pane)
        observed = self.editor()
        assert observed['focus'] == 'tool-dialog' and 'tool-dialog' in observed['editorChildren']
        assert not self.events('production-custom-ui'), 'production invoked custom UI'
        self.widget_names(['Alpha'])
        self.key(self.origin, 'Enter'); self.wait('tool-dialog-resolved')
        pane = self.open(); self.query(pane, 'Beta')
        self.wait('agent_settled')
        assert pane in self.panes(), 'settlement cancelled picker'
        self.close(pane); self.widget_names(['Alpha'])
        assert len(self.events('pi-write')) > before
        self.checks += ['real streaming/tool/custom-dialog independence', 'duplicate invocation and reinvocation focus', 'agent settlement retains picker', 'hidden preselection', 'Unicode draft preserved']
        pane = self.open(); self.query(pane, 'Alpha'); self.close(pane, ('Tab', 'Enter')); self.widget_names([])
        pane = self.open(); self.query(pane, 'NO_MATCH'); self.close(pane); self.widget_names([])
        for key in ['Escape', 'C-c']:
            pane = self.open(); self.query(pane, 'Beta'); self.close(pane, ('Tab', key)); self.widget_names([])
        self.checks += ['empty/no-match apply', 'Escape and Ctrl-c discard provisional selection']
        # Ctrl-u clears ALL query despite a moved cursor, without changing selection.
        pane = self.open(); self.query(pane, 'Alpha'); self.key(pane, 'Tab')
        self.query(pane, 'Beta'); self.key(pane, 'Left', 'C-u')
        self.drain(.12)
        cleared = self.capture('ctrl-u-cleared-all-query', pane)
        assert 'Delta' in cleared and 'Charlie' in cleared, 'Ctrl-u did not clear suffix after cursor'
        self.close(pane); self.widget_names(['Alpha'])
        self.checks.append('Ctrl-u clears entire query and preserves hidden selections')
        # Clearing preselection then choosing focused rows proves preview keys do not move list.
        pane = self.open(); self.query(pane, 'Alpha'); self.key(pane, 'Tab', 'C-u')
        self.query(pane, 'Beta'); self.key(pane, 'C-u'); self.drain(.12)
        preview_before = self.capture('preview-before-scroll', pane)
        self.key(pane, 'C-j', 'C-j', 'C-j', 'C-k'); self.drain(.15)
        preview_after = self.capture('preview-after-scroll', pane)
        assert preview_before != preview_after, 'preview did not scroll'
        self.key(pane, 'Tab', 'Enter')
        self.wait_until(lambda: pane not in self.panes(), 'preview key apply did not close'); self.widget_names(['Beta'])
        pane = self.open(); self.query(pane, 'Beta'); self.key(pane, 'Tab', 'C-u', 'C-n', 'C-p', 'Tab')
        self.close(pane); self.widget_names(['Beta'])
        self.checks += ['Ctrl-j/k preview scrolling does not move list cursor', 'Ctrl-n/p list navigation']
        # Apply all in intentionally reverse display/application order.
        pane = self.open(); self.query(pane, 'Beta'); self.key(pane, 'Tab')
        for name in ['Charlie', 'Alpha', 'Delta', 'Beta']:
            self.query(pane, name); self.key(pane, 'Tab')
        self.close(pane); self.widget_names(['Alpha', 'Beta', 'Charlie', 'Delta'])
        previous = len(self.events('agent_settled'))
        expected = '\n\n'.join([BODIES['beta.md'], BODIES['alpha.md'], 'ORDER_BODY_PROMPT', BODIES['delta.md'], BODIES['charlie.md']])
        sent = self.submit('ORDER_BODY_PROMPT')
        assert sent['result']['text'] == expected
        self.provider_contains(expected); self.widget_names([]); self.settled(previous)
        self.checks.append('actual bodies, prepend/append order and exact separators reach provider, reset after send')
        # Confirm-first, then send while streaming. Send-first has already captured
        # a successful actual fzf result held by a fixture PATH wrapper.
        self.select(['Alpha'])
        self.key(self.origin, 'M-r'); self.wait('mock-delta', predicate=lambda e: e['call'] >= 5)
        previous = len(self.events('agent_settled'))
        # M-r sends a real prior prompt, consuming/resetting its Alpha selection.
        # Commit Alpha again for the next prompt while that run is streaming.
        self.select(['Alpha'])
        pane = self.open(); self.query(pane, 'Beta'); self.key(pane, 'Tab')
        (self.case/'delay-fzf').touch(); self.key(pane, 'Enter')
        captured = self.wait_until(lambda: (self.case/'fzf-captured.json').exists(), 'no held fzf confirmation')
        data = json.loads((self.case/'fzf-captured.json').read_text()); assert data['status'] == 0 and data['output']
        sent = self.submit('QUEUED_SEND_FIRST', streaming=True)
        assert sent['result']['text'] == BODIES['alpha.md']+'\n\nQUEUED_SEND_FIRST'
        (self.case/'delay-fzf').unlink()
        self.wait_until(lambda: pane not in self.panes(), 'send-first pane survived')
        self.provider_contains(sent['result']['text']); self.widget_names([]); self.settled(previous)
        self.checks.append('confirm-first and send-first queued input use only committed bodies')
        # Slash-prefixed skill/template input reaches production input, not /snippets dispatch.
        for text in ['/fixture-template ARG', '/skill:fixture-skill ARG']:
            pane = self.open(); self.query(pane, 'Alpha'); self.key(pane, 'Tab')
            previous = len(self.events('agent_settled'))
            sent = self.submit(text)
            assert sent['original'] == text and sent['result'] is None
            self.wait_until(lambda: pane not in self.panes(), 'slash input did not invalidate')
            self.settled(previous)
        assert any('TEMPLATE_FIXTURE_BODY ARG' in list(strings(e['messages'])) for e in self.events('mock-request'))
        assert any('SKILL_FIXTURE_BODY' in s for e in self.events('mock-request') for s in strings(e['messages']))
        self.checks.append('real slash template and skill input invalidate picker')
        self.key(self.origin, 'M-o'); self.wait('continuation-armed')
        previous = len(self.events('agent_settled'))
        self.submit('CONTINUATION_PROMPT'); self.wait('mock-delta', predicate=lambda e:e['time'] >= self.events('production-input-after')[-1]['time'])
        self.draft()
        pane = self.open(); self.wait('continuation-requested'); self.wait('agent_settled', previous+1, timeout=25)
        assert pane in self.panes(), 'automatic continuation cancelled newly opened picker'
        self.close(pane, ('Escape',)); self.checks.append('automatic continuation does not invalidate newly opened picker')
        # Full-width bottom split with existing columns, exact unresized restoration.
        guard = self.tmux('split-window', '-d', '-h', '-t', self.origin, '-P', '-F', '#{pane_id}', 'exec /bin/sleep 180')
        layout = self.tmux('display-message', '-p', '-t', self.origin, '#{window_layout}')
        pane = self.open()
        geometry = self.tmux('display-message', '-p', '-t', pane, '#{pane_width} #{pane_left} #{pane_top} #{window_width}').split()
        assert geometry[0] == geometry[3] and geometry[1] == '0' and int(geometry[2]) > 0
        assert guard in self.panes()
        self.tmux('select-pane', '-t', guard); self.close(pane, ('Escape',), guard)
        assert self.tmux('display-message', '-p', '-t', self.origin, '#{window_layout}') == layout
        self.tmux('select-pane', '-t', self.origin)
        pane = self.open()
        fcntl.ioctl(self.master, termios.TIOCSWINSZ, struct.pack('HHHH', 36, 88, 0, 0))
        self.client.send_signal(signal.SIGWINCH); self.drain(.25)
        self.capture('narrow-resize', pane)
        geometry = self.tmux('display-message', '-p', '-t', pane, '#{pane_width} #{window_width}').split()
        assert geometry[0] == geometry[1]
        self.close(pane, ('Escape',)); self.tmux('kill-pane', '-t', guard)
        self.checks += ['bottom full-width layout with sibling columns and exact restoration', 'resize retains full width', 'no third-pane closure focus theft']
        pane = self.open(); self.tmux('kill-pane', '-t', pane)
        self.wait_until(lambda: not list((self.case/'tmp').glob('pi-snippets-*')), 'manual pane kill leaked snapshot')
        self.widget_names([]); self.checks.append('manual pane destruction cancels unchanged')
        for command in ['/reload', '/new']:
            pane = self.open(); n = len(self.events('ready'))
            self.draft(command); self.key(self.origin, 'Enter'); self.wait('ready', n+1)
            self.wait_until(lambda: pane not in self.panes(), command+' left stale picker')
            self.wait_until(lambda: not list((self.case/'tmp').glob('pi-snippets-*')), command+' leaked snapshot')
            self.widget_names([])
        self.checks += ['reload/new session remove stale panes and snapshots, reset widget']
        pane = self.open()
        self.draft('/quit'); self.key(self.origin, 'Enter')
        self.wait_until(lambda: self.client.poll() is not None, 'graceful shutdown left attached client')
        self.wait_until(lambda: not list((self.case/'tmp').glob('pi-snippets-*')), 'shutdown snapshot leaked')
        self.checks.append('graceful shutdown removes running picker')

    def failures(self):
        n = len(self.events('notification'))
        self.key(self.origin, 'M-s')
        self.wait('notification', n+1, predicate=lambda e:e.get('level') in ['error', 'warning'])
        self.wait_until(lambda: self.panes() == [self.origin], 'launch failure left sibling')
        self.wait_until(lambda: not list((self.case/'tmp').glob('pi-snippets-*')), 'failure leaked snapshot')
        assert self.editor()['text'] == DRAFT
        self.widget_names([])
        self.checks.append(self.kind+' notifies, leaves draft/selection unchanged, removes owned pane/snapshot')
        self.draft('/quit'); self.key(self.origin, 'Enter')
        self.wait_until(lambda: self.client.poll() is not None, 'failure-case graceful quit did not exit')

    def finish(self):
        # The private directory and fresh socket are the only server targets allowed.
        assert self.socket.parent == self.socketdir and self.socketdir.name.startswith('psi-')
        # Try Pi's orderly shutdown even after an assertion, including a stranded
        # tool dialog. Only the recorded origin PID may receive SIGTERM as fallback.
        if self.client and self.client.poll() is None and self.origin:
            try:
                self.key(self.origin, 'M-x', 'C-u')
                self.literal(self.origin, '/quit'); self.key(self.origin, 'Enter')
                end = time.monotonic()+4
                while self.client.poll() is None and time.monotonic()<end: self.drain()
                if self.client.poll() is None:
                    pid = int(self.tmux('display-message', '-p', '-t', self.origin, '#{pane_pid}'))
                    ready_pid = self.events('ready')[-1]['pid']
                    if pid == ready_pid and pid in self.child_pids:
                        os.kill(pid, signal.SIGTERM)
                        end = time.monotonic()+3
                        while self.client.poll() is None and time.monotonic()<end: self.drain()
            except (AssertionError, OSError, ValueError): pass
        self.tmux('kill-server', check=False)
        if self.client and self.client.poll() is None:
            self.client.terminate(); self.client.wait(timeout=3)
        if self.master is not None:
            os.close(self.master)
        (self.case/'client.ansi').write_bytes(self.screen)
        # No broad process-group kill or matching by name. Diagnose instead of killing unknown PIDs.
        end = time.monotonic()+3
        while True:
            ps = subprocess.run(['/bin/ps', '-axo', 'pid=,ppid=,stat=,command='], capture_output=True, text=True, timeout=3).stdout
            owned = [line for line in ps.splitlines() if str(self.case) in line or str(self.socket) in line
                     or (line.split() and line.split()[0].isdigit() and int(line.split()[0]) in self.child_pids)]
            if not owned or time.monotonic() >= end: break
            time.sleep(.05)
        (self.case/'processes-after.txt').write_text(ps)
        self.write_json('leftovers.json', owned)
        shutil.rmtree(self.socketdir)
        return owned

    def run(self):
        result = {'mode':self.mode, 'case':self.kind, 'pass':False, 'checks':self.checks}
        error = None
        try:
            self.start()
            if self.kind == 'matrix': self.matrix()
            else: self.failures()
            assert self.network.stat().st_size == 0, 'network guard saw API attempts'
            assert not self.events('mock-error'), self.events('mock-error')
            invocations = self.case/'fzf-invocations.jsonl'
            if invocations.exists():
                for line in invocations.read_text().splitlines():
                    invocation = json.loads(line)
                    assert invocation['defaults'] == '' and invocation['file'] == '' and invocation['shell'] == '/bin/sh'
                self.checks.append('fzf defaults/options-file cleared and explicit POSIX shell')
            result['pass'] = True
        except Exception as exc:
            error = exc; result['error'] = repr(exc); result['traceback'] = traceback.format_exc()
            if self.origin:
                try: self.capture('failure-diagnostic')
                except Exception: pass
        finally:
            try:
                leftovers = self.finish()
                result['leftovers'] = leftovers
                if leftovers:
                    result['pass'] = False; result['cleanup_error'] = 'owned-looking processes remain; see diagnostics'
            except Exception as exc:
                result['pass'] = False; result['cleanup_error'] = repr(exc)
            result['seconds'] = round(time.monotonic()-self.started, 2)
            result['network_attempts'] = len(self.network.read_text().splitlines())
            self.write_json('result.json', result)
            print(json.dumps(result), flush=True)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['fullscreen', 'regular'])
    parser.add_argument('--case', choices=['matrix', 'missing-fzf', 'fzf-runtime-failure', 'split-failure'])
    parser.add_argument('--evidence', type=Path)
    parser.add_argument('--timeout', type=float, default=180)
    parser.add_argument('--node', default=shutil.which('node'))
    parser.add_argument('--tmux', default=shutil.which('tmux'))
    parser.add_argument('--fzf', default=shutil.which('fzf'))
    default_sdk = Path.home()/'.pi/agent/install/releases/1.2.0/node_modules/@earendil-works/pi-coding-agent'
    parser.add_argument('--sdk', type=Path, default=default_sdk)
    opts = parser.parse_args()
    for name in ['node', 'tmux', 'fzf']:
        value = getattr(opts, name)
        if not value or not Path(value).is_file(): parser.error(name+' executable missing, test not run')
        setattr(opts, name, os.path.realpath(value))
    if not (opts.sdk/'dist/index.js').is_file(): parser.error('installed SDK missing; pass --sdk, test not run')
    if not (PRODUCTION/'tmux-picker.mjs').is_file(): parser.error('production tmux-picker.mjs not present; test not run')
    opts.evidence = opts.evidence or Path(tempfile.mkdtemp(prefix='pi-snippets-integration-', dir='/tmp'))
    opts.evidence.mkdir(mode=0o700, parents=True, exist_ok=True)
    print('Evidence: '+str(opts.evidence), flush=True)
    results = []
    for mode in [opts.mode] if opts.mode else ['fullscreen', 'regular']:
        for kind in [opts.case] if opts.case else ['matrix', 'missing-fzf', 'fzf-runtime-failure', 'split-failure']:
            result = Case(opts, mode, kind).run(); results.append(result)
            if not result['pass']:
                (opts.evidence/'summary.json').write_text(json.dumps(results, indent=2)+'\n')
                return 1
    (opts.evidence/'summary.json').write_text(json.dumps(results, indent=2)+'\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
