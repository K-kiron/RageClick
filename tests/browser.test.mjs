import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { runPlan } from '../skills/rageclick/scripts/run.mjs';
import { startDemo } from '../demo/server.mjs';

const check = { action: 'check', kind: 'count', selector: 'h1', expected: 1, because: 'Heading exists' };
const plan = steps => ({ schemaVersion: 1, name: 'boundary-check', goal: 'Inspect local fixture', steps });
async function serve(handler) {
  const server = createServer(handler);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(done => server.close(done)) };
}
async function output() { return resolve(await mkdtemp(resolve(tmpdir(), 'rageclick-browser-')), 'run'); }
function command(args) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', chunk => { text += chunk; });
    child.stderr.on('data', chunk => { text += chunk; });
    child.on('error', reject);
    child.on('close', code => done({ code, text }));
  });
}

test('assertion mismatch, browser failure, and initial HTTP failure are distinct', async () => {
  const site = await serve((req, res) => { res.writeHead(req.url === '/fail' ? 500 : 200, { 'Content-Type': 'text/html' }); res.end('<h1>Fixture</h1>'); });
  try {
    const mismatch = await runPlan({ url: site.url, plan: plan([{ ...check, expected: 2 }]), out: await output() });
    assert.equal(mismatch.status, 'observed_failure');
    assert.equal(mismatch.steps[0].observation.actual, 1);
    const missing = await runPlan({ url: site.url, plan: plan([{ action: 'click', selector: '#missing' }, check]), out: await output() });
    assert.equal(missing.status, 'execution_error');
    assert.equal(missing.steps.some(x => x.observation), false);
    const failed = await runPlan({ url: site.url + '/fail', plan: plan([check]), out: await output() });
    assert.equal(failed.status, 'execution_error');
    assert.match(failed.error, /500/);
  } finally { await site.close(); }
});

test('cross-origin requests and redirects cannot reach a second local server', async () => {
  let hits = 0;
  let redirectHits = 0;
  const outside = await serve((req, res) => { hits++; res.end('<h1>Outside</h1>'); });
  const site = await serve((req, res) => {
    if (req.url === '/redirect') { redirectHits++; res.writeHead(302, { Location: outside.url }); res.end(); }
    else if (req.url === '/chain') { res.writeHead(302, { Location: '/redirect' }); res.end(); }
    else { res.setHeader('Content-Type', 'text/html'); res.end(`<h1>Local</h1><img src="${outside.url}/pixel">`); }
  });
  try {
    for (const path of ['/', '/redirect', '/chain']) {
      const report = await runPlan({ url: site.url + path, plan: plan([check]), out: await output() });
      assert.equal(report.status, 'execution_error', path);
      assert.ok(report.blockedRequests.length > 0);
      assert.equal(hits, 0, `External server reached through ${path}`);
    }
    assert.equal(redirectHits, 1, 'Same-origin redirect continuation must also be blocked');
  } finally { await site.close(); await outside.close(); }
});

test('generated replay reproduces duplicates and becomes a passing regression on fixed mode', async () => {
  const demo = await startDemo();
  try {
    const sourcePlan = JSON.parse(await readFile(new URL('../examples/plans/rapid-click.json', import.meta.url), 'utf8'));
    const out = await output();
    const first = await runPlan({ url: demo.url + '/?mode=buggy', plan: sourcePlan, out });
    assert.equal(first.status, 'observed_failure');
    assert.equal(first.steps.at(-1).observation.actual, 3);
    assert.equal(first.planSha256, createHash('sha256').update(await readFile(resolve(out, 'plan.json'))).digest('hex'));
    const again = await command([resolve(out, 'replay.mjs'), '--out', await output()]);
    assert.equal(again.code, 1, again.text);
    const fixed = await command([resolve(out, 'replay.mjs'), '--url', demo.url + '/?mode=fixed', '--out', await output()]);
    assert.equal(fixed.code, 0, fixed.text);
    await assert.rejects(runPlan({ url: demo.url, plan: sourcePlan, out }), /EEXIST/);
  } finally { await demo.close(); }
});
