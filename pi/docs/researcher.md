# Brave research tools

Researcher uses web_search, web_fetch and the package's safe_bash, plus child-to-parent ask_question. Worker has its ordinary editing/shell tools, both web tools, and permission to delegate to scout or researcher. OpenAI model overrides and thinking levels are preserved; junior-engineer is custom and read-only.

## Behavior and limits

- Search uses Brave Web Search, not Answers or LLM Context. It reads only inherited BRAVE_SEARCH_API_KEY and sends it in the HTTPS subscription-token header. No credential files, automatic retries or authenticated redirects.
- Structured query parameters preserve upstream query/exactPhrases/excludeTerms/site/count behavior. Count defaults to five, integer range 1–10. Queries are limited to 600 characters and 75 words. Response body cap is 1 MiB, with bounded result fields and sanitized errors.
- Fetch retains HTML/Readability, plain text, PDF/unpdf and Next RSC extraction. One shared 30-second deadline covers direct requests and fallback. Streamed caps are 5 MiB text/HTML and 20 MiB PDF, first 100 PDF pages, at most five redirects per request and 30,000 model-facing output characters including source/notices. Synchronous parsing has no hard CPU bound.
- Automatic Jina fallback sends the requested public URL to r.jina.ai and identifies third-party extraction in output. Do not use private/authenticated URLs, cookies, signed links, tokens or sensitive content.
- URL checks reject unsupported schemes, credentials, local names and obvious reserved/private literal IP ranges. Redirect destinations get the same checks. DNS-resolved private addresses and rebinding are not covered. These checks and the regex-filtered safe_bash are not an OS or network sandbox.
- URLs and fetched contents may persist in Pi sessions. Fetched content is untrusted data, not instructions.
- Default research budget is six searches/six fetches, reduced when the parent specifies. Workers delegate open-ended external research and source synthesis; known single URLs can use direct fetch. These are prompt instructions, not billing enforcement.
- Main ask_user_question has text/single-select/multi-select/Other UI, an inline shared mutex and cancellation handling. It requires terminal UI mode. Restricted children receive ask_question for their parent instead.

## Costs

[Brave pricing](https://brave.com/search/api/) lists Search at $5 per 1,000 requests and $5 monthly credits. Credits are not a hard spending cap. Account rate limits depend on the activated plan. Missing/invalid credentials and HTTP 429 stop research without automatic retries. Model usage is billed separately according to the configured provider.

## Provenance

- Search, fetch and question UI were adapted from [pi-config](https://github.com/amosblomqvist/pi-config), revision `f82da563ab05d66729492d64c7ed4e96db3663f3`. Published upstream search uses Google. Local search uses Brave; local fetch adds request/output bounds; question UI adds host compatibility and reliable cancellation.
- Worker/scout/researcher profiles derive from [pi-interactive-subagents](https://github.com/amosblomqvist/pi-interactive-subagents), revision `c3e8b53c0754ae5ccc19fdab5a7481ec039bc2f7`, matching the settings pin. Local differences preserve OpenAI models, explicitly select standalone mode, correct stale model claims and add public-source/delegation/budget guidance. Managed package code is unchanged.
- `upstream-subagents-LICENSE` preserves the available upstream package license.
- The pi-config source snapshot has no LICENSE file or README license declaration. Attribution is retained, but public redistribution rights have not been established. Review this before publishing the adapted source in a public repository; do not invent a license.
- The Brave contract was checked against [Web Search guide](https://api-dashboard.search.brave.com/documentation/services/web-search) and [reference](https://api-dashboard.search.brave.com/api-reference/web/search/get).

## Verification and follow-ups

The original setup passed 43 fetch/UI tests, 12 search test groups, the bundled safe_bash smoke check and installation/rollback failure checks. Required live checks passed for fresh researcher, same-session resume, worker delegation and worker direct fetch. Saved loadouts confirmed model/thinking/tool restrictions and read-only scout/junior-engineer. Five Brave calls were used. One additional guessed source URL returned HTTP 401; researcher stopped without retry and disclosed the gap.

Original machine-specific evidence and the retired installation journal are archived locally in `~/.pi/agent/backups/`. The retained mocked suite now loads the actual repository extensions. Search and question code passed the original strict host-declaration check; no passing static fetch typecheck is claimed.

Remaining checks are a human terminal question-dialog test and a reviewed Readability upgrade. See `dependency-audit.md` for the low-severity regex denial-of-service advisory. No unreviewed dependency update was applied during organization.

## Maintenance

Compare upstream changes manually, preserve local overrides, regenerate a lockfile when deliberately changing dependencies, and rerun the saved mocked tests. Run bounded live checks when changing provider/delegation/resume behavior. Do not automatically move the package pin.

To remove these tools, back up current source files, remove the corresponding extension/profile configuration deliberately, then restow Pi and start a fresh session. The old setup-specific rollback script is retired because the Stow layout now owns these paths; do not run its archived installation journal against this reorganized tree.
