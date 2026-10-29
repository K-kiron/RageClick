# Changelog

## Unreleased

- Accept credential-free HTTP(S) website URLs with native browser networking, redirects, cross-origin resources and APIs, and WebSockets. Loopback targets retain the v0.1.0 exact-origin request boundary.
- Allow website navigation relative to the current page and bounded request delays for an explicit API URL. Record the selected network mode and final URL in evidence reports.
- Add a read-only website smoke plan and document fresh-session behavior, navigation timeouts, and request-delay limits.

## 0.1.0 — 2026-09-23

Initial public version.

### Added

- An installable agent skill and a Playwright runner for explicit JSON workflow plans on local web applications.
- Five bounded perturbations: rapid clicks, Back and re-entry, invalid-file recovery, refresh, and delayed-request retry.
- Three synthetic fixture scenes for project creation, brief upload, and draft editing, with intentionally buggy and fixed modes.
- Replay bundles containing the saved plan, its SHA-256 identifier, a replay script, Markdown and JSON reports, screenshots, and available trace and video artifacts.
- Separate `passed`, `observed_failure`, and `execution_error` results with exit codes 0, 1, and 2.
- A self-contained skill installer that refuses to overwrite an existing installation, and run output that refuses to overwrite existing evidence.
- Skills CLI installation, a versioned skill ZIP with SHA-256 checksums and commit provenance, and a static recorded demo.
- Regression tests, a 22-run fixture verification matrix, and recorded before/after samples.

### Supported scope

- Node.js 22 or later and Playwright Chromium; local verification is recorded for Windows with Node.js 24. See the [verification record](docs/verification.md) for exact versions and observations.
- Loopback HTTP(S) targets with requests guarded to the exact origin. HTTP redirects are blocked, including same-origin redirects; service workers and WebSockets are blocked.
- Buffered responses and bounded request delays. Streaming, full network emulation, multi-origin authentication, and browser cookie or credential policy validation are unsupported.

The included fixtures establish repeatability for their seeded defects. This version makes no measured claim about defect discovery, speed, or quality on independent applications. Browser isolation does not reset an arbitrary application's backend or provide an operating-system network sandbox.
