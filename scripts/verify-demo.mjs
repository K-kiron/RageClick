#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemo } from '../demo/server.mjs';
import { runPlan } from '../skills/rageclick/scripts/run.mjs';

export async function verifyDemo(root = resolve('output', 'playwright', 'demo-' + Date.now())) {
  await mkdir(root, { recursive: true });
  const demo = await startDemo();
  const results = [];
  try {
    for (const name of ['baseline', 'rapid-click', 'back-reenter', 'invalid-file', 'refresh', 'slow-retry']) {
      const plan = JSON.parse(await readFile(new URL(`../examples/plans/${name}.json`, import.meta.url), 'utf8'));
      for (const mode of ['buggy', 'fixed']) {
        const attempts = name === 'baseline' ? 1 : 2;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          const id = `${name}-${mode}-${attempt}`;
          const report = await runPlan({ url: `${demo.url}/?mode=${mode}`, plan, out: resolve(root, id) });
          const expected = name === 'baseline' || mode === 'fixed' ? 'passed' : 'observed_failure';
          const entry = { id, expected, actual: report.status, browserVersion: report.browserVersion, appVersion: report.appVersion, assertions: report.steps.filter(x => x.observation).map(x => x.observation), report: `${id}/report.json`, video: report.artifacts.video, trace: report.artifacts.trace, error: report.error ?? null };
          results.push(entry);
          await writeFile(resolve(root, 'summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2) + '\n');
          console.log(`${id}: ${report.status}`);
          assert.equal(report.status, expected, `${id}: ${report.error || JSON.stringify(entry.assertions)}`);
          assert.ok(report.artifacts.video, `${id}: video missing`);
          assert.ok(report.artifacts.trace, `${id}: trace missing`);
        }
      }
    }
    console.log(`Verified ${results.length} browser runs. Evidence: ${root}`);
    return { root, results };
  } finally { await demo.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyDemo().catch(error => { console.error(error); process.exitCode = 1; });
}
