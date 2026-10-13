# OpenAI subscription usage for Pi

## Goal

Show the user's Pro $100 overall weekly allowance and reset in Pi's footer. Hide dollar costs for subscription-backed models. Do not confuse overall allowance with Pi's app cap or invent a five-hour window.

## Verified findings

- OpenAI currently states that Pro 100, Pro 200, and Pro 500 have no five-hour usage limit in Work and Codex. Settings → Usage shows allowance and reset information. [Plan usage guidance](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)
- App-specific weekly limits cap the percentage of overall weekly allowance an app can consume. They are not separate or reserved allowances. An app may exhaust its cap while overall allowance remains. [Subscription sharing](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)
- Pi 1.1.0's current OpenAI OAuth flow uses `dynamic_agent_client`, resource `https://api.openai.com/v1`, and scope `chatgpt.tokens.use.direct`. Official inference routes are `GET /v1/models` and `POST /v1/responses`. The docs warn against routing this inference flow to ChatGPT backend-api endpoints. This warning alone does not prove every backend usage route rejects direct tokens. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- No supported quota-read endpoint, extra quota-reading scope, or weekly subscription response-header contract was verified in the reviewed official documentation. This is an unresolved question, not proof that no mechanism exists. The documented usage UI is https://chatgpt.com/settings/usage.
- `subscription_sharing_usage_limit_exceeded` can mean an overall or app-specific limit. It does not reveal a percentage or reset time. `subscription_sharing_usage_unavailable` indicates usage-service unavailability. [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
- Ordinary request/token rate-limit headers describe API throughput, not a documented weekly subscription allowance. Do not convert them into weekly percentages. [API rate limits](https://developers.openai.com/api/docs/guides/rate-limits)

## Local checks

Using Pi's existing credential resolution without logging credentials:

- `GET https://api.openai.com/v1/models` returned HTTP 200. No header matching limit, usage, quota, subscription, or reset was present.
- `GET https://chatgpt.com/backend-api/wham/usage` returned HTTP 401 with the current OpenAI OAuth token, including after runtime auth resolution.
- No `openai-codex` credential was configured. The existing OpenAI credential was not expired.
- No browser cookies, browser tokens, or authenticated browser page were inspected. No inference request was issued merely to obtain telemetry.

## Endpoint leads, not compatible direct-token contracts

OpenAI's Codex client passively reads `/backend-api/wham/usage`, or `/api/codex/usage` for another path style. It maps `used_percent`, `limit_window_seconds`, and `reset_at`. Select windows by duration, not primary/secondary position: weekly is 604800 seconds, five-hour is 18000 seconds. Missing windows are absent, not zero usage. Do not add reserve/allowance-changing headers for a passive footer.

Sources:

- https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client/rate_limit_resets.rs
- https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client.rs

[SIWC devkit issue #3](https://github.com/openai/sign-in-with-chatgpt-devkit/issues/3) reports the same pattern: `/v1/models` succeeds, but `/wham/usage` and `/wham/usage/chatpass/apps` reject a direct token. This is an issue author's report, not an official OpenAI explanation. The app endpoint merits observation in the actual usage page, not speculative authentication-header changes.

## Proposed browser workaround

With explicit user permission, read only the rendered usage panel in the user's existing signed-in browser. Export only percentage, used/remaining semantics, reset text, and observation time. Do not read/export cookies, storage, tokens, auth headers, HAR files, whole-page HTML, account IDs, or unrelated content.

A browser-managed same-origin GET might work without extracting cookies, but this has not been tested. Cookie inclusion does not guarantee authorization; stop on failure rather than mining tokens. DOM extraction is the simpler fallback. It would be a browser-derived snapshot, not supported live API telemetry.

Sources:

- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch

Before implementation, inspect the actual panel, confirm that the selected browser account matches Pi's account, and separate overall weekly allowance from Pi's app cap. Preserve relative reset text if there is no reliable timestamp. Show age/staleness and invalidate snapshots on account changes. Prefer explicit sanitized export or a secured native-messaging channel over an unauthenticated localhost server.

## Gaps

No compatible quota endpoint, stable DOM selector, app endpoint schema, or account-specific reset has been verified. No authenticated browser inspection was performed. Source links target mutable main and plan guidance can change. The research agent's fetched Codex client was truncated, though cited mapping/header sections were present; the smaller rate-limit operations file was complete. The official Accounts and sessions page was inaccessible to the research agent.

## Follow-up validation

With the user's explicit permission, a read-only AppleScript evaluation inspected only the open Brave Settings → Usage panel. It showed:

- Plan limits: Weekly limit, 93% left, resets in 5d 14h.
- The accessibility meter had `aria-label="Usage remaining"`, value 93, maximum 100.
- Pi's app cap was 100%, a setting rather than an amount used.
- No five-hour allowance appeared in Plan limits.

No controls were clicked and no authentication material was read. Brave's JavaScript-from-Apple-Events setting initially blocked the read; the user opted to enable it. They later declined browser-backed polling and requested continued browser-free API research.

The DevKit's [usage indicator implementation](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/packages/react/src/usage-indicator.tsx) accepts caller-provided source/limit state and provides no remaining-percentage fetching. Its [Responses implementation](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/packages/local/src/responses.ts) checks stream/error state but does not parse a weekly quota header.

A separate official Codex integration is a promising browser-free runtime path. OpenAI's [app-server documentation](https://learn.chatgpt.com/docs/app-server) documents `account/rateLimits/read` to fetch ChatGPT rate limits and `account/rateLimits/updated` notifications. A local stdio client could ask the official CLI for usage without extracting tokens. This would require a separate Codex login to the same account/workspace and validation against the observed plan meter. It is not yet verified for this user's account, and would not establish Pi's app-specific allowance. No Codex executable was on PATH, no default `~/.codex/auth.json` existed, and no `/Applications/Codex.app` was found during a presence-only check.

## Browser-free result

The user approved installing the official Codex CLI and a separate login. Codex CLI 0.162.1 was installed through npm with lifecycle scripts disabled. The user completed the official login with `cli_auth_credentials_store="keyring"`; `login status` confirmed ChatGPT login.

A local stdio app-server test sent only initialization and `account/rateLimits/read`. It returned `limitId="codex"`, `planType="prolite"`, primary window duration 10080 minutes, `usedPercent=7`, `resetsAt=1792344186`, and no secondary window. Thus it matched the visible overall weekly meter's 93% remaining, and did not report a five-hour window. No inference call or thread was started. The CLI handled credentials; the probe emitted only allowlisted quota fields.

The footer implementation uses this separate Codex login for overall quota only. It does not replace Pi's inference login or report Pi's app-specific cap. The user must keep the selected account/workspace consistent between logins. This route needs an initial browser authorization but subsequent quota reads are browser-free.

Another source-level lead is the official [Codex quota parser](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/rate_limits.rs): it recognizes `x-codex-primary-used-percent`, corresponding window-minutes/reset-at headers, a secondary family, and a `codex.rate_limits` event. Delivery through the direct SIWC API remains unverified; no extra inference was generated to test it. That may eventually remove the need for the second login, but is not the implementation's data source.
