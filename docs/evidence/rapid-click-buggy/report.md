# rapid-click

**observed_failure** — Create exactly one project despite repeated clicks

An observed failure is an assertion mismatch. Repetition and contract review are required before calling it a reproducible product defect.

- URL: `http://127.0.0.1:57202/?mode=buggy`
- App: `1.0.0-demo`
- Browser: Chromium 145.0.7632.6; Playwright 1.58.2
- Runtime: Node v24.15.0; win32 10.0.26100 x64; RageClick 0.1.0
- Viewport: 1440 × 1000; fresh context; exact-origin network only
- Started: 2026-09-23T02:15:56.371Z; finished: 2026-09-23T02:15:58.417Z
- Plan SHA-256: `df14a5fe52434cc8f2129fb406925a21c2579bab845b42dba4efd2974a1879d0`

| # | Action | Result | Duration | Evidence |
| --- | --- | --- | --- | --- |
| 1 | fill | executed | 101 ms | [screenshot](01-fill.png) |
| 2 | rapid-click | executed | 494 ms | [screenshot](02-rapid-click.png) |
| 3 | wait-text | executed | 477 ms | [screenshot](03-wait-text.png) |
| 4 | check | FAIL: 3 (expected 1) | 75 ms | [screenshot](04-check.png) |

## Replay / regression command

Run from the RageClick repository root with the same disposable app state:

```sh
node /path/to/this-report/replay.mjs --url <target-url> --out <new-output-directory>
```

For an installed skill, add `--runner /path/to/rageclick/scripts/run.mjs`. Exit codes: 0 passed, 1 assertion mismatch, 2 execution/configuration error. The replay preserves the plan; changing `--url` selects another app revision.

## Artifacts

- [Exact plan](plan.json)
- [Machine-readable report](report.json)
- [initial](00-initial.png)
- Trace: omitted from this tracked sample; complete trace retained in the local run.
- [video](video.webm)

Sample packaging: Trace omitted from this tracked sample because it contains local filesystem paths. The original local run retained a complete trace.
