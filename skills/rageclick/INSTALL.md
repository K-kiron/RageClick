# Install RageClick

Requires Node.js 22+ and a coding host that can read Agent Skills and run local commands. Codex on Windows with Chromium is the verified host combination.

For a release ZIP, extract the `rageclick` directory into your project's `.agents/skills` directory. Do not overwrite an existing installation without reviewing local changes. From the extracted skill directory:

```sh
npm ci
npx playwright install chromium
```

Restart the coding host if the skill is not discovered automatically. In Codex:

```text
Use $rageclick on http://127.0.0.1:3000.
Goal: create one project and upload a text brief using disposable data.
Keep evidence outside the repository.
```

Read [SKILL.md](SKILL.md) for the workflow and [references/plans.md](references/plans.md) for the runner contract. The host interprets the goal and writes a plan; the runner does not infer actions from natural language.

Only test disposable, authorized loopback applications. A local server may still call a real backend. Chromium request guards do not provide an operating-system network sandbox.

Repository, demo, and release checksums: [K-kiron/RageClick](https://github.com/K-kiron/RageClick).
