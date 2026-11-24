# macOS preferences helper and acceptance checklist

This is an optional shortcut for the manual settings in [New Mac setup](new-mac.md). It is not part of Stow or the Brewfile and never runs automatically. The manual checklist remains the fallback.

**This is a new, experimental script. Key repeat and the native Caps Lock/Control mapping have been behavior-tested on the new Mac. Trackpad, zoom and Mission Control still need acceptance testing.**

Preference storage was inspected on macOS **15.7.7**. On **27.2.1**, the user confirmed key repeat at `2`/`15` after applying the helper and logging out/in, then confirmed the faster `1`/`10` values after a direct `defaults` write and another logout/login. The user prefers `1`/`10`, now the helper's defaults. Opening a fresh TextEdit window alone did not activate the first change. This is user-reported behavior verification, not an automated measurement or proof of compatibility for other groups.

The user also confirmed the native Caps Lock/Control swap on 27.2.1 after writing the current-host key `com.apple.keyboard.modifiermapping.0-0-0`, clearing the temporary `hidutil` mapping, and logging out/in. This used the built-in Apple Internal Keyboard / Trackpad with reported vendor/product IDs `0`/`0`. No login task or LaunchAgent was installed. The native values match the helper's mapping; the live write was performed with `defaults`, not through the helper end to end. Other keyboards and persistence across a full reboot remain untested.

The automated tests exercise fake preferences, not macOS behavior. A successful write/read-back is not proof that macOS or an app uses the value. The version guard remains unchanged because the other groups have not been verified on 27.2.1.

For each group: preview, apply only that group, check every setting in System Settings and through actual behavior, record the result, then continue. Verify persistence after a convenient restart or reconnection. If a step fails or is unclear, use the manual checklist rather than assuming the script handled it.

## Desired preferences

| Group | Setting | Desired value |
|---|---|---|
| `keyboard` | Repeat interval | `1` |
| `keyboard` | Initial repeat delay | `10` |
| `keyboard` | Caps Lock / Control | Full native swap, automatically targeting the recognized built-in keyboard |
| `trackpad` | Tap-to-click | On in built-in, Bluetooth and current-host preferences |
| `zoom` | Scroll-to-zoom | On, with Option as the modifier |
| `mission-control` | Group windows by application | On, following the AeroSpace workaround |

The faster `1`/`10` values are now the desired preferences. If they cause unwanted repeated letters, restore the original `2`/`15` values and log out/in when convenient. Desired values are defined by `KEY_REPEAT` and `INITIAL_KEY_REPEAT` in the script. Older script revisions still apply `2`/`15`; pull the updated revision before reapplying `keyboard` or `all`.

No Dock app cleanup, automatic device watcher, account setup, sudo, permissions bypass, application restart or logout is included.

## Run it

From the repo root, preview first:

```sh
python3 scripts/macos-preferences.py --show
```

Preview writes nothing. It reports unset preferences as unset, not as disabled: macOS can supply defaults that aren't explicitly stored.

Apply one group at a time on the new Mac:

```sh
python3 scripts/macos-preferences.py --apply trackpad
python3 scripts/macos-preferences.py --apply zoom
python3 scripts/macos-preferences.py --apply mission-control
python3 scripts/macos-preferences.py --apply keyboard
```

`--apply all` is also supported once the individual groups have been reviewed. On any release other than 15.7.7, writes and restoration are refused by default. Review the preview and add `--allow-untested` deliberately if you want to try it:

```sh
python3 scripts/macos-preferences.py --apply trackpad --allow-untested
```

This override does not establish compatibility or bypass macOS permissions. A denied Accessibility write is a failure, not a reason to grant broad permissions to the terminal or rerun with sudo. Use System Settings instead.

`STORED` means the requested value was written and read back. `NO CHANGE` means the stored value already matches. Neither means behavior was independently verified. Failures are reported per setting and other settings are still attempted; a partial failure returns a nonzero exit status. A skipped keyboard swap makes a keyboard/all apply incomplete.

### Automatic keyboard setup and its limits

On a fresh Mac with the recognized built-in keyboard, one command sets both repeat at `1`/`10` and the persistent Caps Lock/Control swap:

```sh
python3 scripts/macos-preferences.py --apply keyboard --allow-untested
```

No prior mapping, manual System Settings change, hardware-ID argument or login task is needed. Log out/in afterward, then test repeat and the swap. This writes the same native mapping confirmed during the new-Mac test; the automatic detection plus helper write still needs end-to-end acceptance testing there.

Detection uses the exact observed `AppleHIDKeyboardEventDriverV2` device with product `Apple Internal Keyboard / Trackpad`, vendor/product IDs `0`/`0` and `FIFO` transport. It requires exactly one such driver entry. The native `0-0-0` target is a tested association, not a formula based on LocationID or a universal rule for all keyboards. Other native keyboard mappings and unrelated Command, Option and Globe source mappings are preserved.

An explicit `--keyboard-key` takes priority. Otherwise the recognized built-in target is preferred. If hardware isn't recognized, the script can use a unique existing native mapping, with a warning to confirm it belongs to your keyboard. If neither is available, it reports the swap as skipped and the apply as incomplete rather than claiming success. A stored mapping can refer to a disconnected keyboard.

For troubleshooting, explicit target selection remains available:

```sh
key=com.apple.keyboard.modifiermapping.0-0-0
python3 scripts/macos-preferences.py --apply keyboard \
  --keyboard-key "$key" --allow-untested
```

Pull the updated script first so it includes automatic detection and retains the preferred `1`/`10` repeat values. After writing a native mapping, log out/in when convenient and test the swap. Clear any temporary `hidutil` mapping before the test so it cannot mask the result. The helper writes native preferences only; it never installs a login task.

Do not assume this target works for another keyboard just from its vendor/product IDs. For an unverified device, investigate its native target or use the manual fallback:

1. Open Keyboard > Keyboard Shortcuts > Modifier Keys, or the equivalent page on that macOS version.
2. Select your keyboard.
3. Set Caps Lock to Control and Control to Caps Lock.
4. Leave the other modifiers unchanged.
5. Run preview again. The helper should now recognize the mapping.

With multiple stored mappings, choose one only after inspecting the available keys. An advanced explicit selection is supported:

```sh
python3 scripts/macos-preferences.py --apply keyboard --keyboard-key com.apple.keyboard.modifiermapping.VENDOR-PRODUCT-INDEX
```

Replace the entire placeholder with a reviewed numeric key. The tested `0-0-0` target applies to the specific built-in keyboard described above, not every Mac or external keyboard. Other or newly connected keyboards are not guaranteed to inherit the swap. If selecting a mapping is unclear, keep this step manual.

## Backups and undo

Before any writes, the helper saves the selected settings' previous values, including whether they were unset, under:

```text
~/.local/state/dotfiles/macos-preferences/<run>/backup.json
```

The run directory is private and the JSON file is mode 600. It contains only selected preferences and local host/account metadata, not whole preference domains. The helper journals each attempted write before making it, so the backup survives a failed or interrupted apply.

Restore a specific run using its printed path:

```sh
python3 scripts/macos-preferences.py --restore "$HOME/.local/state/dotfiles/macos-preferences/RUN/backup.json"
```

Use `--allow-untested` on a different macOS release after reviewing the same risks. Restoration is restricted to the original host, user and HOME. It restores only attempted settings, deletes a preference that was originally unset, and verifies storage afterward. If a setting has since changed to a third value, restoration refuses to overwrite that newer choice. Review that setting manually. Backups never include commands to execute.

A failed run does not automatically roll back successful changes. Use its backup if you want to undo them. Keep backups local, and inspect a backup before restoring it. A partially written value that differs from both the old and requested values also needs manual review.

## New Mac acceptance checklist

Fill this in on the new Mac. Do not mark a row as behavior-confirmed merely because the helper printed `STORED`.

```text
Date:
Mac model / built-in or external input devices:
macOS version and build, from sw_vers:
Dotfiles commit, from git rev-parse --short HEAD:
Groups applied and backup paths, kept locally:
Failures or manual fallbacks:
```

### Before applying

- [ ] Pull the intended dotfiles revision and read the preview.
- [ ] Confirm desired repeat values are `1` and `10`, or deliberately edit them. The less aggressive fallback is `2` and `15`.
- [ ] On an unfamiliar macOS release, review each group before using `--allow-untested`.
- [ ] Save any unrelated work before deliberately testing keyboard behavior. No logout is required just to run the helper.
- [ ] Choose only one group for the first apply; note the backup path it prints.

### Tap-to-click

- [ ] Apply `trackpad`; check for failed writes.
- [ ] In Trackpad settings, confirm Tap to click is enabled.
- [ ] Lightly tap the built-in trackpad on a harmless button or file. It should click without pressing the trackpad down.
- [ ] If you have an external trackpad, repeat the test there. If not, mark external behavior **not tested**, not passed.
- [ ] Reconnect an external trackpad later and confirm whether it keeps the preference. This is not guaranteed by read-back.

### Option-scroll zoom

- [ ] Apply `zoom`; check for denied or failed writes.
- [ ] In Accessibility > Zoom, confirm the scroll gesture is enabled and the modifier is Option.
- [ ] Hold Option and scroll up/down. Confirm screen zoom changes, rather than only an app's text size.
- [ ] Return to normal magnification and confirm scrolling without Option behaves normally.
- [ ] If it fails, use the manual settings. Record whether the helper stored values that macOS ignored. Do not bypass permissions.

### Mission Control / AeroSpace

- [ ] Apply `mission-control`; check read-back.
- [ ] In Desktop & Dock, confirm Group windows by application is enabled.
- [ ] Open several windows from the same app and enter Mission Control. Confirm the grouping and AeroSpace workaround behave as expected.
- [ ] If the preference is stored but not active, restart the Dock only when convenient with `killall Dock`, then test again. The helper never does this automatically.

### Key repeat

- [ ] Apply `keyboard`, noting whether the modifier mapping was applied or skipped.
- [ ] Test holding arrow keys and Backspace in a harmless document in a newly launched app. Holding letters can invoke the accent picker instead.
- [ ] Check another app, including Alacritty, because apps can handle repeat differently.
- [ ] If unchanged, quit/reopen the affected app. Defer logout/login or reboot until convenient; don't disrupt working terminal sessions just to test.
- [ ] After the next normal logout/restart, retest and record whether that was required.
- [ ] With the faster `1`/`10` defaults, check for unwanted repeated letters during normal typing. Use `2`/`15` if they are too sensitive.

### Caps Lock / Control swap

- [ ] On a fresh Mac, confirm preview detects the built-in keyboard and proposes creating its native mapping without manual setup.
- [ ] Apply `keyboard`; confirm both repeat settings and the native mapping are stored with no skipped swap.
- [ ] Confirm the correct keyboard is selected in Modifier Keys settings.
- [ ] Confirm Caps Lock is assigned Control and Control is assigned Caps Lock. Other modifiers should remain unchanged.
- [ ] In a disposable TextEdit document, hold physical Caps Lock and press A. Confirm it behaves like Control+A, moving to the beginning of the line, rather than Command+A.
- [ ] Press physical Control, then type letters. Confirm it toggles Caps Lock; toggle it off afterward. The indicator light alone isn't enough to verify behavior.
- [ ] Confirm Option and Command still work normally.
- [ ] After a convenient normal restart, verify the swap persists. Test another keyboard only if you actually use one.

### Repeatability and undo

- [ ] Preview again. Successfully stored settings should report `NO CHANGE`.
- [ ] Reapply a verified group. It should require no writes and create no new backup if values still match.
- [ ] If comfortable, restore one recent group backup and verify the old behavior. Then reapply and verify the desired behavior again.
- [ ] Mark each group **working**, **stored but inactive**, **failed**, or **not tested**, with any restart needed. Record the macOS version alongside the result.

## Iterate on the new Mac and bring fixes back

Edit the checked-out repo, not copies of the script under HOME. Desired repeat values and preference definitions are in `scripts/macos-preferences.py`; the checklist is here. Do not add backup JSON files or whole preference exports to the repo.

Before editing, synchronize while the working tree is clean:

```sh
git pull --ff-only
```

After a change, run:

```sh
python3 -m unittest discover -s scripts/tests -v
python3 scripts/test-setup.py
python3 scripts/macos-preferences.py --show
python3 scripts/check-credentials.py
git diff --check
git diff
```

Keep the storage tests and real acceptance results separate. Add a regression test for a bug fix. Don't change the version baseline just to suppress a warning; record what was actually checked on that release and update the guard deliberately.

Stage only intended source and documentation, commit, and push. On the old Mac, pull those commits after preserving any local work. Pulling or Stowing does **not** apply macOS preferences; running this helper with `--apply` is always a separate decision.
