---
name: rageclick
description: Test a web workflow at a local or online HTTP(S) URL with repeated clicks, navigation, invalid files, refreshes, and delayed requests; produce replayable evidence of objective failures.
---

# RageClick

Turn a URL and a user goal into a short, reproducible sequence that breaks a promised behavior. Use the existing browser tool to inspect the real page, then the bundled Playwright runner for repeatable evidence. This skill does not rate visual design or claim to represent real user research.

## Scope and success criteria

Work only on owned fixtures or explicitly authorized local apps and online websites. The runner accepts HTTP(S) URLs without inline credentials and starts a fresh browser context with no existing login. Loopback targets retain an exact-origin request boundary; other targets use normal browser networking across origins, including HTTP redirects and WebSockets. Establish synthetic data and a disposable account before submitting; local apps can also mutate real backends. Do not buy, send messages, delete valuable data, or change access settings. Existing permission covers the agreed workflow only.

From the user's goal and observed UI, identify one concrete invariant: one project for one submission intent, recovery after an invalid file, or a draft surviving a promised save. If the contract is ambiguous, record an observation or ask about that specific behavior instead of inventing a defect. Record the application version or commit; use `unknown` if unavailable.

## Explore, perturb, replay

1. Inspect the current page using an available browser tool or the target source. Select stable labels, roles, or test IDs from actual evidence. Run the ordinary successful workflow first. If it cannot complete, resolve that prerequisite or report it separately.
2. Read [references/plans.md](references/plans.md) to write a JSON plan. Choose the applicable templates from [references/perturbations.md](references/perturbations.md). Change one dimension per case. Fresh browser contexts isolate browser state, but server data requires a known reset or a unique disposable account. Do not assume a fresh browser resets a database.
3. Run from this skill directory after `npm ci` and `npx playwright install chromium`:

   ```sh
   node scripts/run.mjs --url http://127.0.0.1:3000 --plan /absolute/path/case.json --out /absolute/path/evidence --app-version COMMIT
   ```

   The output directory must be new. The runner writes a readable report, exact plan, step results, screenshots, trace, video, and replay script. It cannot infer a goal or selectors by itself; the skill does that work. Keep generated evidence outside the target repository unless requested as a durable example.
4. Treat `observed_failure` as an assertion mismatch, not an established root cause. Repeat the same case in fresh state at least twice before calling it reproducible. Capture failures and passes; never discard contradictory reruns. `execution_error` means an action, selector, browser, or boundary failed and is not product evidence. Record subjective UX comments separately from objective assertions.
5. Minimize the sequence without changing the failure, then use `replay.mjs` as a regression command (exit 0 passes, 1 assertion mismatch, 2 execution/configuration error). If authorized to fix the app, rerun the identical plan against the fixed version and verify the ordinary path still passes. Never change the assertion to manufacture a passing result.

Report the violated contract, actual and expected state, occurrence count, requested and final URLs, network mode, app/browser versions, exact commands and evidence paths. Say when video, trace, baseline, reset, or repeatability is missing. Redact credentials and personal data before sharing captures; traces can contain complete request/response data. No publishing or external messages are implied by this skill.

## Limits

The runner uses Chromium, CSS selectors, native pointer events, synthetic inline files, and bounded request delays. Navigation waits up to 10 seconds in `loopback` mode and 30 seconds in `website` mode; individual actions wait up to 5 seconds. Service workers are blocked in both modes. It does not import an existing login, solve CAPTCHAs, or execute arbitrary plan-supplied JavaScript.

Loopback mode blocks all HTTP redirects and WebSockets and buffers responses through Playwright with transport retries disabled. Streaming, browser credential policy, and Set-Cookie policy testing remain unsupported in this mode. Website mode uses native browser networking, so cross-origin resources, APIs, redirects, and WebSockets can reach external systems. It is not a network sandbox. A request delay is not bandwidth throttling or packet loss, and redirect continuations may bypass it. For unsupported workflows use an already available, authorized browser tool and preserve the same evidence contract; mark unsupported perturbations explicitly. Do not weaken the loopback boundary to make a test pass.
