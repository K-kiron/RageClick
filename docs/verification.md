# Verification record

Recorded on 2026-09-23 UTC using Node.js v24.15.0, Windows 10.0.26100 x64, Playwright 1.58.2, Chromium 145.0.7632.6, and the included application version 1.0.0-demo. Both modes use the same application source with the documented defect switches.

## Behavior matrix

`npm run verify:demo` starts its own loopback server on an available port and runs every case with a fresh browser context. The fixture assigns a new synthetic server session to each context. The exact observations are retained in [summary.json](evidence/summary.json).

| Case | Buggy mode | Fixed mode | Expected/actual observation |
| --- | --- | --- | --- |
| Ordinary baseline | 1/1 pass | 1/1 pass | One project, successful brief upload, editable draft |
| Rapid clicks | 2/2 assertion failures | 2/2 pass | Expected 1 project; buggy produced 3; fixed produced 1 |
| Back and re-enter | 2/2 assertion failures | 2/2 pass | Expected `Field notes`; buggy returned an empty draft |
| Invalid file then retry | 2/2 assertion failures | 2/2 pass | Expected `Uploaded brief.txt`; buggy remained `Unsupported file` |
| Refresh | 2/2 assertion failures | 2/2 pass | Expected `Field notes`; buggy restored an empty draft |
| Delayed request and retry | 2/2 assertion failures | 2/2 pass | Expected 1 project; buggy produced 2; fixed produced 1 |

All 22 runs had screenshots, a trace, and a video. This is a deterministic fixture matrix, not a measured defect-detection rate on external projects.

The tracked samples include real screenshots, recordings, plans, and expected/actual observations for [rapid-click buggy](evidence/rapid-click-buggy/report.md) and [rapid-click fixed](evidence/rapid-click-fixed/report.md). Both saved plans have SHA-256 `df14a5fe52434cc8f2129fb406925a21c2579bab845b42dba4efd2974a1879d0`. The [paired recording page](demo.html) plays those videos without changing speed.

Trace archives are retained in the full local matrix output but omitted from the tracked samples because they include local filesystem paths. Each sample explicitly records that packaging omission. The other report paths in summary.json are relative to the complete matrix directory; regenerate it with `npm run verify:demo` to obtain all 22 bundles.

## Regression and execution checks

`npm test` passed six top-level tests and exited normally (approximately 19 seconds in the recorded final run). They exercise:

- Expected/actual mismatch versus missing-selector execution failure and initial HTTP 500 failure.
- Blocking an outside-origin image, a direct outside-origin redirect, and a same-origin redirect chain. A second local HTTP server received zero requests; the chained intermediate redirect endpoint was not reached.
- A generated replay script reproducing the three-record failure with exit 1, then passing against fixed mode with exit 0. The plan hash remains tied to the saved JSON.
- Refusal to overwrite existing evidence.
- Rejection of remote/lookalike/credential-bearing URLs and unbounded or executable plans.
- Self-contained installation and preservation of an existing skill installation.

Successful process exit covers cleanup of the early navigation-failure recording paths. The runner primes a blank video frame before app navigation to avoid Playwright 1.58's zero-frame recorder cleanup defect. Browser/transport errors remain execution failures, not application findings.

## Installation check

The installer copied the package into a separate test workspace. `npm ci` completed in the copied skill without relying on the source installation's node_modules. The copied runner executed the rapid-click plan against fixed mode and returned `passed`.

The local Codex 0.147.0 app-server's `skills/list` response discovered `rageclick` with `enabled: true`, `scope: repo`, and the expected UI metadata from `.agents/skills/rageclick`. No model task was required for that discovery check. Other hosts and platforms have not been tested.

A separate page-led skill invocation constructed a plan without reading the application source, supplied plans, or prior reports. Its ordinary create-and-upload path passed. Two native clicks then produced two projects instead of one in both fresh-context repetitions; the valid text upload still passed in all three trials. This is a workflow smoke check, not a controlled comparison against ordinary prompting.

## Interpretation limits

The fixture defects were intentionally seeded. The fixed behavior reflects explicit fixture contracts. Two repetitions establish repeatability for these runs; they do not establish reliability across app architectures, devices, or load conditions. No controlled ordinary-prompt versus skill comparison has been performed. No performance, quality, or adoption improvement is claimed.

HTTP redirects, streaming, credential/Set-Cookie policy tests, service workers, WebSockets, and remote targets are outside the runner's supported scope. Delay injection uses buffered API transport; it does not emulate full network conditions. See [the plan contract](../skills/rageclick/references/plans.md) before applying the skill elsewhere.

## Repeat a sample

With `npm run demo` running in another terminal, from the repository root:

```sh
node docs/evidence/rapid-click-buggy/replay.mjs --url "http://127.0.0.1:4317/?mode=buggy" --out output/playwright/sample-buggy
node docs/evidence/rapid-click-buggy/replay.mjs --url "http://127.0.0.1:4317/?mode=fixed" --out output/playwright/sample-fixed
```

The first command is expected to exit 1; the second is expected to exit 0. Use new output paths for each rerun. View local traces with `npm --prefix skills/rageclick exec -- playwright show-trace /absolute/path/to/trace.zip`.
