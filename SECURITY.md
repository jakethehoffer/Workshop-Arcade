# Security Policy

Workshop Arcade is a static catalog of browser games hosted on GitHub Pages. There is no server, no user accounts, and no data collection — every game is a sandboxed HTML page that runs in the visitor's browser.

## Supported Versions

The site only ships from the `main` branch via GitHub Pages. Older commits are not separately maintained; security fixes land on `main` and roll out automatically when Pages redeploys.

| Branch | Supported |
|--------|-----------|
| `main` | ✅ |
| Other  | ❌ |

## Reporting a Vulnerability

**Please do not open a public issue.** Use GitHub's private security advisories so we can triage and patch before any exploit lands in `main`:

- **Report:** [github.com/jakethehoffer/Workshop-Arcade/security/advisories/new](https://github.com/jakethehoffer/Workshop-Arcade/security/advisories/new)
- **RFC 9116 canonical:** [`.well-known/security.txt`](.well-known/security.txt)

When reporting, please include:

- A short description of the vulnerability and its impact.
- A minimal reproduction (URL, payload, steps).
- The browser + version where you observed the behavior, if relevant.

We aim to acknowledge reports within a few days and resolve confirmed issues in `main` as quickly as the fix complexity allows. There is no bug bounty program.

## Scope

In scope:

- **XSS / injection via a game submission** (the Workshop intake flow opens a GitHub issue that a maintainer or AI agent eventually merges into `websites/manifest.json` + a new `websites/*.html` game file).
- **Supply chain issues** in the project's npm dependencies (currently just Playwright) or the full-commit-SHA-pinned GitHub Actions (see [`.github/dependabot.yml`](.github/dependabot.yml) for the auto-update surface).
- **Catalog policy gaps** that would let a malicious manifest entry compromise visitors (e.g. a `url` field escaping the sandbox).
- **CSP bypasses** against the [meta CSP](index.html) declared at the top of `index.html`.

Out of scope:

- Issues in individual games' inline JavaScript that don't escape the sandboxed `<iframe>` in the player modal (they're per-game gameplay code, reported via normal issues).
- Reports about hosting infrastructure GitHub Pages controls (forward those to GitHub Bug Bounty).
- Self-XSS scenarios that require the user to paste attacker-supplied JavaScript into the DevTools console.

## Defense in Depth

The catalog ships several preventative measures that bound the blast radius of any single vulnerability:

- [Content Security Policy](index.html) with strict `default-src 'self'`, `connect-src` allowlist, `object-src 'none'`, and `base-uri 'self'`.
- The player modal iframes use `sandbox="allow-scripts allow-forms allow-pointer-lock"` + `referrerpolicy="no-referrer"` — games cannot navigate the parent, access cookies, or break out of the iframe.
- [CodeQL](.github/workflows/codeql.yml) with the `security-extended` query pack runs on every push and weekly.
- [Dependabot](.github/dependabot.yml) auto-PRs npm + GitHub Actions updates weekly.
- Every external workflow action is pinned to a full immutable commit SHA with a release comment; `npm run test:security-workflows` rejects movable or inconsistent refs.
- `npm run test:csp` enforces the CSP contract in CI.
- `npm run test:meta-files` enforces that `LICENSE`, `.well-known/security.txt`, `humans.txt`, and `SECURITY.md` all stay valid.
