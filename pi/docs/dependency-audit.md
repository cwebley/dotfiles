# Fetch dependency audit

`npm ci --ignore-scripts` and a subsequent `npm audit --json --ignore-scripts` reported one low-severity advisory in the retained upstream dependency tree:

- Package: `@mozilla/readability`, upstream range `^0.5.0`.
- Advisory: [Denial of service through regex, GHSA-3p6v-hrg8-8qj7](https://github.com/advisories/GHSA-3p6v-hrg8-8qj7).
- npm identifies `0.6.0` as an available fix outside the retained manifest range.

No moderate, high or critical advisories were reported by this audit. That is an audit result, not proof of absence of vulnerabilities. The manifest and lockfile remain exactly upstream; no npm audit fix or unreviewed dependency upgrade was applied. A reviewed upgrade with regenerated lockfile and repeated extraction tests is a follow-up.

Network/body bounds do not impose a hard CPU deadline on synchronous Readability parsing. Public fetched HTML remains untrusted and this regex advisory is relevant to that limitation.
