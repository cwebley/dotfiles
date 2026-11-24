# Alacritty macOS startup investigation

Research checked 2026-11-24 against upstream GitHub and Homebrew sources. Commands in this session run on the old Mac unless explicitly supplied for the new Mac.

## Is it maintained?

Yes. The repository is not archived. Its latest stable release is v0.17.0, published April 6, 2026. Recent default-branch commits include November 18, 2026, adding Windows ARM64 release CI, and November 6, adding WebAssembly build support. Release cadence alone should not be interpreted as abandonment.

Sources:
- https://github.com/alacritty/alacritty/releases/tag/v0.17.0
- https://github.com/alacritty/alacritty/commit/791efff6d74c66bee390c259e322626ca93aadb6
- https://github.com/alacritty/alacritty/commit/aa5d942f46c40184a3f214830ff5f7989f4733a1
- https://api.github.com/repos/alacritty/alacritty

## Known distribution problem

Homebrew's actual cask lists v0.17.0 and explicitly disables it effective September 1, 2026, because it fails Gatekeeper checks. This independently matches the new Mac's install output.

Source: https://github.com/Homebrew/homebrew-cask/blob/master/Casks/a/alacritty.rb

Upstream issue #8749 discusses this exact Homebrew restriction. Maintainer chrisduerr closed it stating that he was not interested in signing with an Apple signature. This is an explicit distribution decision, not evidence the software is abandoned. GPG release/source signatures, ad-hoc code signatures, and Apple Developer ID/notarization are different mechanisms.

Sources:
- https://github.com/alacritty/alacritty/issues/8749
- https://github.com/alacritty/alacritty/issues/8749#issuecomment-3538882791
- https://github.com/alacritty/alacritty/issues/8749#issuecomment-3524941145

Earlier upstream issue #6500 also reports macOS rejecting the downloaded DMG application. This establishes recurrent Gatekeeper launch friction, not the prevalence or exact cause of the new Mac's hang.

Source: https://github.com/alacritty/alacritty/issues/6500

## Similar startup hangs, not an exact diagnosis

Issue #8444 reports intermittent macOS 15.2 startup hangs with no window. The reporter said force-quitting and retrying worked. Its stack analysis reached shell spawning and Apple runtime/UI code. Maintainers discussed macOS/winit regressions; the discussion does not establish a fix for this user's always-reproducible hang.

Source: https://github.com/alacritty/alacritty/issues/8444

The new Mac's sample contains only `_dyld_start`, no application frames, and a 96 KB reported footprint. It is insufficient to identify the blocker. Do not equate it with #8444 or claim endpoint software caused it.

## Confirmed new-Mac evidence

- Official downloaded app in ~/Applications bounces without opening a window.
- Running the ARM64 executable with -vv also hangs without application logs.
- codesign verification reports valid on disk and satisfies its Designated Requirement.
- spctl execution assessment reports rejected.
- The user reports Open Anyway hangs and remains visible; restarting did not resolve it.
- No security/endpoint denial logs identify the cause. No configuration error has been observed.

## Next option to consider

Upstream documents building the app locally with `make app`. The v0.17.0 Makefile invokes cargo, scdoc, tic and ad-hoc codesign. Building from a pinned official release would test a locally built artifact rather than the downloaded DMG. It is not a proven fix, does not make the app Apple-notarized, and may still be blocked. Only pursue it if local development builds are permitted. Do not automatically alter quarantine or disable security services.

Sources:
- https://github.com/alacritty/alacritty/blob/master/INSTALL.md#macos
- https://github.com/alacritty/alacritty/blob/v0.17.0/Makefile
- https://github.com/alacritty/alacritty/issues/8749#issuecomment-4199573872

No source build has been attempted as part of this investigation. The shared Brewfile still contains the disabled Alacritty cask and needs a separately reviewed installation-path update.
