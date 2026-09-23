# Replay plan format (v1)

Plans are data, not executable code. `goal` explains the user's intent; the agent supplies selectors after inspecting the actual application. The runner cannot translate natural language into a workflow.

```json
{
  "schemaVersion": 1,
  "name": "one-project-after-repeated-clicks",
  "goal": "Create exactly one project named Field notes",
  "template": "rapid-click",
  "steps": [
    { "action": "fill", "selector": "[data-testid=project-name]", "value": "Field notes" },
    { "action": "rapid-click", "selector": "[data-testid=create-project]", "count": 3, "intervalMs": 60 },
    { "action": "wait-text", "selector": "[data-testid=project-status]", "text": "Ready" },
    { "action": "check", "kind": "count", "selector": "[data-testid=project-item]", "expected": 1, "because": "One submission intent creates one project" }
  ]
}
```

The runner first opens `--url` (query strings are preserved), then executes steps in order. Required metadata: `schemaVersion: 1`, nonempty `name`, `goal`, and `steps`. Optional `template` names the perturbation. Every plan must include a `check`.

| Action | Fields | Behavior |
| --- | --- | --- |
| `fill` | `selector`, `value` | Fill one visible, editable element. |
| `click` | `selector` | One ordinary Playwright click. |
| `rapid-click` | `selector`, `count` (2–5), `intervalMs` (20–500) | Native pointer clicks at the same initial position. |
| `back` | none | Browser Back; missing history is an execution error. |
| `reload` | none | Refresh to DOMContentLoaded. |
| `goto` | `path` | Navigate to a path on the exact allowed origin. |
| `upload` | `selector`, `file: {name, mimeType, text}` | Select synthetic inline UTF-8 file; no local file reads. |
| `delay-network` | `path`, `delayMs` (0–3000) | Delay requests whose exact pathname matches; replaces the prior delay. Set 0 to clear. |
| `wait` | `ms` (0–5000) | Fixed wait for a deliberate timing experiment. Prefer visible completion conditions. |
| `wait-visible` | `selector` | Wait up to 5 seconds for one visible element. |
| `wait-text` | `selector`, `text` | Wait up to 5 seconds for exact trimmed text. |
| `check` | `kind`, `selector`, `expected`, `because` | Snapshot an invariant after settling. Kinds: `count` (integer), `text` (trimmed string), `value` (input string). |

Checks are immediate observations; place a meaningful completion wait before them. A text/value check with a missing or ambiguous selector is an execution error. A count check can legitimately observe zero. Incorrect selectors can still produce false findings, so inspect the screenshots and confirm the contract before reporting a product bug. Browser console errors are context, not standalone findings.

Limits: 60 steps, 10 checks, 32 KiB per string, 64 KiB per inline file, 512 KiB plan input. The browser receives no existing cookies, profile, or storage state. Routed HTTP(S) requests are restricted to the exact loopback origin. HTTP redirects are aborted before following any Location, including same-origin redirects; Chromium otherwise bypasses request routing on redirect continuations. Responses are buffered with a 10-second timeout and transport retries disabled. Streaming responses are unsupported. WebSockets and service workers are blocked. This is a request guard, not an operating-system network sandbox; it cannot prevent the local server from calling external systems.

## Output and replay

`report.json` records schema/tool/Node/OS/Playwright/browser/app versions, URL, viewport, timestamps, each executed action with timings, assertion observations, console errors, blocked requests, and artifact availability. It also includes a SHA-256 of the saved plan. `report.md` is the readable equivalent. Screenshots follow each completed step, including failed assertions; interrupted actions get an error screenshot when possible. `trace.zip` and `video.webm` provide richer evidence. Generated artifacts may contain sensitive data and require review before sharing.

From the RageClick repository root:

```sh
node /path/to/evidence/replay.mjs --url http://127.0.0.1:3000 --out /path/to/new-evidence
```

For an installed skill, add `--runner /path/to/rageclick/scripts/run.mjs`. The default runner path is `skills/rageclick/scripts/run.mjs` relative to the working directory. The replay uses the original URL unless overridden. A server must already be running and application state must be reset appropriately. Supply `--app-version` when replaying another revision; otherwise it is detected from `<meta name="app-version">` or recorded as `unknown`.

The replay's nonzero assertion exit makes it a regression check. Include the plan and command in an existing test suite only when the invariant reflects intended product behavior. Do not commit personal data, application traces, or temporary analysis by default.

In PowerShell automation, inspect `$LASTEXITCODE` immediately after the Node command or propagate `exit $LASTEXITCODE`. A parent shell may otherwise normalize different nonzero codes to 1; use report.status when analyzing saved results.
