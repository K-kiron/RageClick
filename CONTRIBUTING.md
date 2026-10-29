# Contributing to RageClick

RageClick tests explicit workflow contracts in local applications and authorized online websites. Contributions should preserve bounded actions, reproducible plans, and the distinction between an observed assertion failure and an execution error.

## Set up a checkout

Use Node.js 22 or later. From the repository root:

```sh
npm --prefix skills/rageclick ci
npm --prefix skills/rageclick exec -- playwright install chromium
npm test
npm run verify:demo
```

On Windows, an optional project-local browser cache can be selected before installation and verification:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PWD '.rageclick/browsers'
```

Use the same environment setting for subsequent browser commands. The `.rageclick/` directory is ignored.

`npm test` covers runner contracts, browser behavior, generated replay, and installation. `npm run verify:demo` starts its own fixture server and checks 22 browser runs across the baseline and five perturbations. It expects assertion failures in the deliberately buggy cases and passes in the fixed cases; the verification command itself should exit successfully.

Use `npm run demo` to inspect the fixture interactively. See the [README](README.md), [plan format](skills/rageclick/references/plans.md), and [verification record](docs/verification.md) for commands and current limits.

## Report a reproducible problem

Use the [bug report form](https://github.com/K-kiron/RageClick/issues/new?template=bug_report.yml). Include:

- The RageClick revision or version, Node.js, operating system, Playwright, Chromium, and application revision.
- The requested URL, final URL, and `networkMode` (`loopback` or `website`), with sensitive URL values removed.
- The exact JSON plan and command, using synthetic data and a disposable local fixture where possible.
- The promised invariant, why it applies, and the expected and observed values.
- The starting state, reset procedure, and results of repeated runs. A fresh browser context resets browser storage; it does not reset an arbitrary application's database.
- The result category and any relevant, reviewed evidence links.

`observed_failure` (exit 1) means a configured expected/actual check differed. Confirm that the selector and invariant describe the intended application behavior before treating it as a product defect. `execution_error` (exit 2) means an action, selector, prerequisite, configuration, or request boundary prevented execution; include the error message. `passed` (exit 0) applies only to the configured checks in that run.

Plans, reports, screenshots, videos, and traces can expose private data, URLs, local paths, cookies, or credentials. Share only reviewed material suitable for a public issue. Evidence attachments are optional; a small synthetic reproducer is usually sufficient. Keep generated evidence in ignored `output/` directories and use a new output path for each replay.

For a new capability, use the [feature request form](https://github.com/K-kiron/RageClick/issues/new?template=feature_request.yml). Describe the workflow, the observable contract, and a concrete example that can verify the requested behavior.

## Submit a change

Keep changes focused and follow the existing JavaScript module style. The runner and installable skill are in `skills/rageclick/`, the synthetic fixture is in `demo/`, and reusable plans are in `examples/plans/`.

For behavior changes, add or update a minimal regression case that demonstrates the intended contract. Run `npm test` and `npm run verify:demo`, then report the commands and outcomes in the pull request. Documentation-only changes need link and command checks relevant to the edited text.

Keep website networking tests reproducible with controlled HTTP fixtures where possible. The loopback mode must retain its exact-origin request guard and redirect blocking; website mode uses browser networking across origins. Do not make tests depend on a public site's availability or perform unauthorized submissions.

Explain the trigger, previous behavior, and resulting behavior. Link the issue when applicable. Include an exact replay plan and reset instructions when the change concerns a workflow. State any verification you could not perform and any supported-scope changes.

Do not include generated private evidence, credentials, local working notes, or unrelated changes. The project is [MIT licensed](LICENSE); contributions are distributed under the same license.
