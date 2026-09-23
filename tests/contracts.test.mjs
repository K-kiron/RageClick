import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { installSkill } from '../scripts/install-skill.mjs';
import { localURL, validatePlan } from '../skills/rageclick/scripts/run.mjs';

const base = new URL('http://127.0.0.1:3000');
const plan = { schemaVersion: 1, name: 'sample', goal: 'One record', steps: [{ action: 'check', kind: 'count', selector: '.item', expected: 1, because: 'One intent' }] };

test('loopback boundary rejects remote, lookalike, and credential URLs', () => {
  for (const url of ['https://example.com', 'http://localhost.evil.test', 'http://192.168.1.2', 'file:///tmp/demo.html', 'http://user:pass@localhost:3000']) assert.throws(() => localURL(url));
  for (const url of ['http://127.0.0.1:3000/?mode=buggy', 'http://localhost:1234', 'http://[::1]:8080']) assert.ok(localURL(url));
});

test('plans reject unbounded or executable operations before a browser starts', () => {
  for (const bad of [
    { ...plan, steps: [] },
    { ...plan, steps: [{ action: 'eval', code: 'anything' }] },
    { ...plan, steps: [{ action: 'goto', path: 'http://localhost:3001' }, ...plan.steps] },
    { ...plan, steps: [{ action: 'rapid-click', selector: 'button', count: 100, intervalMs: 1 }, ...plan.steps] },
    { ...plan, steps: [{ action: 'upload', selector: 'input', file: { name: '../private.txt', text: 'test', mimeType: 'text/plain' } }, ...plan.steps] },
    { ...plan, steps: [{ action: 'delay-network', path: '//evil.test', delayMs: 500 }, ...plan.steps] },
    { ...plan, steps: Array.from({ length: 61 }, () => plan.steps[0]) },
  ]) assert.throws(() => validatePlan(bad, base));
  assert.equal(validatePlan(plan, base), plan);
});

test('installation is self-contained and refuses to overwrite a skill', async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'rageclick-install-'));
  const installed = await installSkill(workspace);
  for (const path of ['SKILL.md', 'INSTALL.md', 'LICENSE', 'references/plans.md', 'scripts/run.mjs', 'package-lock.json', 'agents/openai.yaml']) await access(resolve(installed, path));
  await assert.rejects(access(resolve(installed, 'node_modules')));
  await writeFile(resolve(installed, 'keep.txt'), 'user work');
  await assert.rejects(installSkill(workspace), /EEXIST/);
  assert.equal(await readFile(resolve(installed, 'keep.txt'), 'utf8'), 'user work');
});
