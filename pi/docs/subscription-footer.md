# Subscription footer

The personal `subscription-footer` extension replaces Pi's footer. It keeps the working directory, Git branch, session name, token totals, context usage, model/thinking level, and other extensions' statuses.

Subscription-backed models do not show dollar costs. API-paid models still show session cost. OpenAI subscription models also show the remaining plan allowance:

```text
↑298k ↓24k cache 95.9% ctx 55.6%/272k · week 93% 5d14h
```

Stats and quota share one line. `cache` is the cumulative cached-read percentage of all input tokens: `cacheRead / (input + cacheRead + cacheWrite) × 100`. Output tokens are excluded. The weekly percentage is allowance remaining, and `5d14h` is the reset countdown. `/plan-usage` still gives the more descriptive quota text.

It selects windows by duration. A weekly-only plan does not get a fabricated five-hour meter. If OpenAI actually reports a five-hour window, that window is also shown.

## Data source

Quota reads go through the official Codex CLI's local stdio app-server and `account/rateLimits/read`. No thread or turn is started and no model request is made. The extension only sends `initialize`, `initialized`, and the quota-read request.

Pi's inference provider and OAuth login are unchanged. The separate Codex login must use the same account and workspace as Pi. This measures overall Work/Codex plan allowance, not Pi's app-specific cap. If either login changes, verify the association again. The footer cannot independently prove that the two logins represent the same account.

The CLI manages its own authentication through macOS Keychain. The extension never reads credential files, browser cookies, access tokens, or Keychain secrets. Child-process diagnostics are not displayed. Quota snapshots stay in memory and are not written to disk or the conversation.

The footer reads immediately at session start and every five minutes while an OpenAI subscription model is selected. Reset countdowns repaint once a minute. Run `/plan-usage` for an immediate refresh. There is no HTTP listener and Brave does not need to be open.

Failed refreshes retain the last value with a stale label. Readings ten minutes old, or whose reset time has passed, are marked stale. No value is assumed to reset to zero without a successful new read. Missing or malformed usage is shown as unavailable.

## Setup

Install the official CLI independently of dotfiles:

```sh
npm install --global --ignore-scripts @openai/codex
codex -c 'cli_auth_credentials_store="keyring"' login
codex -c 'cli_auth_credentials_store="keyring"' login status
```

Complete the OpenAI login yourself. Do not paste login URLs, tokens, or codes into Pi. Keep the selected account/workspace consistent with Pi's inference login.

Restow the Pi configuration, then run `/reload` or restart Pi. The Codex executable must be available on Pi's inherited PATH. This machine was validated with Codex CLI 0.162.1 and Pi 1.1.0.

If you temporarily enabled Brave's **View → Developer → Allow JavaScript from Apple Events** during investigation, it is no longer needed and can be turned off.

## Tests

```sh
node --test pi/tests/subscription-footer/*.test.mjs
```

Tests mock the quota subprocess and use the installed Pi TUI for width checks. They do not read login credentials or call OpenAI. `PI_TEST_HOST_ROOT` can override the installed host's node_modules location.

## Limits

This custom footer does not reproduce every optional built-in footer indicator, such as automatic-compaction state, virtual-model routing, experimental-mode badges, or the latest request's cache-hit percentage. The displayed cache percentage covers the whole session. Quota display is limited to OpenAI subscription provider IDs `openai` and `openai-codex`. Subscription cost hiding uses the provider's subscription-auth declaration, with Kimi Coding handled as a subscription-backed API-key provider.

OpenAI app-server is a versioned integration and can change. See [OpenAI app-server documentation](https://learn.chatgpt.com/docs/app-server) and the local [research notes](../research/openai-subscription-usage.md).
