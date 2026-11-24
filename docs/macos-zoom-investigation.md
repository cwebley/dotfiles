# Zoom automation investigation

## Confirmed on the new Mac

On macOS 27.2.1, both helper writes to the zoom preferences failed. A direct `defaults write com.apple.universalaccess closeViewScrollWheelToggle -bool true` also failed with `Could not write domain com.apple.universalaccess; exiting`.

The user configured scroll zoom with Option in System Settings and confirmed it works. Read-back returned `1` for `closeViewScrollWheelToggle` and `524288` for `closeViewScrollWheelModifiersInt`. The helper subsequently reported `NO CHANGE` for both. These results confirm the preference names and values, not a working automated write route.

Console log access required admin authentication. No denial logs were obtained. Ordinary file metadata does not explain the failure. The presence of `com.apple.macl` does not by itself identify the denying mechanism. See the acceptance record in [macOS preferences](macos-preferences.md).

## Apple-documented alternative investigated

Apple publishes an Accessibility configuration-profile payload, `com.apple.universalaccess`:

- [Apple Developer documentation](https://developer.apple.com/documentation/devicemanagement/accessibility)
- [Apple's device-management schema](https://github.com/apple/device-management/blob/release/mdm/profiles/com.apple.universalaccess.yaml)

The schema documents `closeViewScrollWheelToggle` to enable the scroll gesture. It lists device and user channels, and allows manual profile installation. It does not list `closeViewScrollWheelModifiersInt`. Allowing manual installation does not establish that this user can install it without admin authentication or company approval.

This is therefore not a verified solution for automating both required controls. No profile was generated or installed. Do not add an undocumented modifier key to a profile and claim Apple supports it.

## Native API probe

`scripts/probe-zoom-preferences.py` uses Python ctypes to call Apple's CoreFoundation CFPreferences API without invoking defaults. By default it only reads. With `--probe-write`, it requires both existing values to match the working configuration, rechecks them, then submits those same values and reports the synchronize result. It does not deliberately alter zoom behavior or request permissions.

Read-only execution passed on the old Mac. On the new Mac, the user ran `--probe-write`: both values matched and `CFPreferencesAppSynchronize` returned True. A successful same-value synchronize may be a no-op, so this does not establish permission to change settings or identify the access-control mechanism.

The user approved a real reversible test. The added `--test-toggle` mode requires the existing desired values, briefly writes scroll zoom off through CFPreferences, reads it using a separate defaults process, and attempts to restore it to on in a finally block. It then verifies restoration with another separate-process read. The modifier is not written. Force-killing the process or rejected restoration could require manual recovery in System Settings. This real-change test has not yet run on the new Mac. Fake-callback tests cover successful restoration and restoration attempts after write/read failures; they do not establish macOS compatibility.

## Remaining questions

- Which access control rejected the defaults write? No diagnostic evidence establishes it yet.
- Is there a documented non-admin API for writing both controls? None has been verified in this investigation. This is not proof that none exists.
- UI scripting would be another automation approach to investigate, but it can require Accessibility/Automation permission and depends on the Settings UI. It is not implemented or tested here.

Keep working zoom settings intact. Do not remove attributes, edit protected plist files directly, grant broad permissions or bypass company controls to test a theory.
