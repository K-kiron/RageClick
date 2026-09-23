#!/usr/bin/env node
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import os from 'node:os';

const require = createRequire(import.meta.url);
const version = require('../package.json').version;
const sleep = ms => new Promise(done => setTimeout(done, ms));
const actions = new Set(['fill', 'click', 'rapid-click', 'back', 'reload', 'goto', 'upload', 'delay-network', 'wait', 'wait-visible', 'wait-text', 'check']);
const hasSelector = new Set(['fill', 'click', 'rapid-click', 'upload', 'wait-visible', 'wait-text', 'check']);

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
function string(value, label, allowEmpty = false) {
  ensure(typeof value === 'string' && (allowEmpty || value.length > 0) && value.length <= 32768, `${label} must be a ${allowEmpty ? '' : 'nonempty '}string of at most 32768 characters`);
}
function integer(value, min, max, label) {
  ensure(Number.isInteger(value) && value >= min && value <= max, `${label} must be an integer from ${min} to ${max}`);
}

export function localURL(value) {
  const url = new URL(value);
  ensure(['http:', 'https:'].includes(url.protocol), 'Only HTTP(S) targets are supported');
  ensure(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Runner accepts loopback targets only');
  ensure(!url.username && !url.password, 'Credentials in URLs are not supported');
  return url;
}

function sameOriginPath(path, base) {
  string(path, 'path');
  const target = new URL(path, base);
  ensure(target.origin === base.origin && !target.username && !target.password, 'Navigation must remain on the exact allowed origin');
  return target;
}

export function validatePlan(plan, base) {
  ensure(plan && plan.schemaVersion === 1, 'Expected plan schemaVersion 1');
  string(plan.name, 'name');
  string(plan.goal, 'goal');
  if (plan.template !== undefined) string(plan.template, 'template');
  ensure(Array.isArray(plan.steps), 'steps must be an array');
  integer(plan.steps.length, 1, 60, 'step count');
  let checks = 0;
  for (const [i, step] of plan.steps.entries()) {
    ensure(step && actions.has(step.action), `Unknown action at step ${i + 1}`);
    if (hasSelector.has(step.action)) string(step.selector, 'selector');
    switch (step.action) {
      case 'fill': string(step.value, 'value', true); break;
      case 'rapid-click':
        integer(step.count, 2, 5, 'click count');
        integer(step.intervalMs, 20, 500, 'click interval'); break;
      case 'goto': sameOriginPath(step.path, base); break;
      case 'delay-network': {
        const target = sameOriginPath(step.path, base);
        ensure(step.path === target.pathname, 'delay-network path must be an exact pathname without query');
        integer(step.delayMs, 0, 3000, 'network delay'); break;
      }
      case 'wait': integer(step.ms, 0, 5000, 'wait duration'); break;
      case 'wait-text': string(step.text, 'text', true); break;
      case 'upload':
        ensure(step.file && typeof step.file === 'object', 'upload requires an inline file');
        string(step.file.name, 'file name');
        ensure(!/[\\/\x00-\x1f]/.test(step.file.name), 'file name must be a basename');
        string(step.file.mimeType, 'mimeType');
        string(step.file.text, 'file text', true);
        ensure(Buffer.byteLength(step.file.text) <= 65536, 'Inline file exceeds 64 KiB'); break;
      case 'check':
        checks++;
        ensure(['count', 'text', 'value'].includes(step.kind), 'Unknown check kind');
        string(step.because, 'check because');
        if (step.kind === 'count') integer(step.expected, 0, 10000, 'expected count');
        else string(step.expected, 'expected', true);
        break;
    }
  }
  integer(checks, 1, 10, 'check count');
  return plan;
}

async function one(page, selector) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible' });
  ensure(await locator.count() === 1, `Selector must identify exactly one visible element: ${selector}`);
  return locator;
}

async function waitText(page, selector, text) {
  const locator = await one(page, selector);
  const deadline = Date.now() + 5000;
  do {
    if ((await locator.innerText()).trim() === text) return;
    await sleep(50);
  } while (Date.now() < deadline);
  throw new Error(`Completion condition did not settle to ${JSON.stringify(text)}: ${selector}`);
}

async function act(page, step, state) {
  const get = () => one(page, step.selector);
  switch (step.action) {
    case 'fill': await (await get()).fill(step.value); break;
    case 'click': await (await get()).click(); break;
    case 'rapid-click': {
      const locator = await get();
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      ensure(box, 'Click target has no screen position');
      const position = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      for (let i = 0; i < step.count; i++) {
        await page.mouse.click(position.x, position.y);
        if (i < step.count - 1) await sleep(step.intervalMs);
      }
      return { position };
    }
    case 'back':
      ensure(await page.evaluate(() => history.length > 1), 'No browser history to go back to');
      await page.goBack({ waitUntil: 'domcontentloaded' }); break;
    case 'reload': await page.reload({ waitUntil: 'domcontentloaded' }); break;
    case 'goto': await page.goto(sameOriginPath(step.path, state.base).href, { waitUntil: 'domcontentloaded' }); break;
    case 'upload':
      // Hidden native file inputs are valid upload controls.
      await page.locator(step.selector).setInputFiles({ name: step.file.name, mimeType: step.file.mimeType, buffer: Buffer.from(step.file.text) }); break;
    case 'delay-network': state.delay = { path: step.path, ms: step.delayMs }; break;
    case 'wait': await sleep(step.ms); break;
    case 'wait-visible': await get(); break;
    case 'wait-text': await waitText(page, step.selector, step.text); break;
    case 'check': {
      const locator = step.kind === 'count' ? page.locator(step.selector) : await get();
      const actual = step.kind === 'count' ? await locator.count() : step.kind === 'value' ? await locator.inputValue() : (await locator.innerText()).trim();
      return { expected: step.expected, actual, passed: actual === step.expected, because: step.because };
    }
  }
  return {};
}

function replaySource(url) {
  return `#!/usr/bin/env node
// Run from the RageClick repository root, or provide --runner for an installed skill.
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const { values } = parseArgs({ options: { runner: { type: 'string', default: 'skills/rageclick/scripts/run.mjs' }, url: { type: 'string', default: ${JSON.stringify(url)} }, out: { type: 'string' }, 'app-version': { type: 'string' } } });
const args = [resolve(values.runner), '--plan', fileURLToPath(new URL('./plan.json', import.meta.url)), '--url', values.url, '--out', values.out || resolve('output', 'replay-' + Date.now())];
if (values['app-version']) args.push('--app-version', values['app-version']);
const result = spawnSync(process.execPath, args, { stdio: 'inherit', shell: false });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 2;
`;
}

const inline = value => String(value).replace(/[\r\n]/g, ' ').replace(/`/g, "'");
const cell = value => inline(value).replace(/\|/g, '\\|');
function markdown(report) {
  const lines = [
    `# ${inline(report.name)}`, '', `**${report.status}** — ${inline(report.goal)}`, '',
    'An observed failure is an assertion mismatch. Repetition and contract review are required before calling it a reproducible product defect.', '',
    `- URL: \`${inline(report.url)}\``, `- App: \`${inline(report.appVersion)}\``,
    `- Browser: Chromium ${inline(report.browserVersion)}; Playwright ${report.playwrightVersion}`,
    `- Runtime: Node ${report.nodeVersion}; ${report.os}; RageClick ${report.toolVersion}`,
    `- Viewport: ${report.viewport.width} × ${report.viewport.height}; fresh context; exact-origin network only`,
    `- Started: ${report.startedAt}; finished: ${report.finishedAt}`,
    `- Plan SHA-256: \`${report.planSha256}\``, '',
    '| # | Action | Result | Duration | Evidence |', '| --- | --- | --- | --- | --- |'
  ];
  for (const row of report.steps) {
    const result = row.error || (row.observation ? `${row.observation.passed ? 'PASS' : 'FAIL'}: ${JSON.stringify(row.observation.actual)} (expected ${JSON.stringify(row.observation.expected)})` : 'executed');
    lines.push(`| ${row.index} | ${cell(row.step.action)} | ${cell(result)} | ${row.durationMs} ms | ${row.screenshot ? `[screenshot](${row.screenshot})` : 'unavailable'} |`);
  }
  lines.push('', '## Replay / regression command', '', 'Run from the RageClick repository root with the same disposable app state:', '', '```sh', 'node /path/to/this-report/replay.mjs --url <target-url> --out <new-output-directory>', '```', '', 'For an installed skill, add `--runner /path/to/rageclick/scripts/run.mjs`. Exit codes: 0 passed, 1 assertion mismatch, 2 execution/configuration error. The replay preserves the plan; changing `--url` selects another app revision.', '', '## Artifacts', '', '- [Exact plan](plan.json)', '- [Machine-readable report](report.json)');
  for (const [label, file] of Object.entries(report.artifacts)) lines.push(`- ${file ? `[${label}](${file})` : `${label}: unavailable`}`);
  if (report.error) lines.push('', `Execution error: ${inline(report.error)}`);
  if (report.blockedRequests.length) lines.push('', `Blocked requests: ${report.blockedRequests.map(x => inline(x.url)).join(', ')}`);
  if (report.artifactErrors.length) lines.push('', `Artifact gaps: ${report.artifactErrors.map(inline).join('; ')}`);
  if (report.consoleErrors.length) lines.push('', 'Console errors (context, not automatic findings):', '', ...report.consoleErrors.map(x => `- ${inline(x)}`));
  return lines.join('\n') + '\n';
}

export async function runPlan({ url, plan, out, appVersion, headed = false }) {
  const base = localURL(url);
  validatePlan(plan, base);
  const serialized = JSON.stringify(plan, null, 2) + '\n';
  ensure(Buffer.byteLength(serialized) <= 524288, 'Plan exceeds 512 KiB');
  const directory = resolve(out);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory); // Never overwrite evidence from an earlier attempt.
  await writeFile(resolve(directory, 'plan.json'), serialized);
  await writeFile(resolve(directory, 'replay.mjs'), replaySource(base.href));
  const report = {
    schemaVersion: 1, toolVersion: version, name: plan.name, goal: plan.goal,
    template: plan.template ?? 'custom', url: base.href, appVersion: appVersion ?? 'unknown',
    playwrightVersion: require('playwright/package.json').version, browserVersion: 'unavailable',
    nodeVersion: process.version, os: `${os.platform()} ${os.release()} ${os.arch()}`,
    viewport: { width: 1440, height: 1000 }, startedAt: new Date().toISOString(),
    planSha256: createHash('sha256').update(serialized).digest('hex'), status: 'passed',
    steps: [], consoleErrors: [], blockedRequests: [], artifactErrors: [],
    artifacts: { initial: null, trace: null, video: null },
  };
  const state = { base, delay: null, closing: false, networkError: null };
  let browser, context, page, video, tracing = false;
  try {
    browser = await chromium.launch({ headless: !headed });
    report.browserVersion = browser.version();
    context = await browser.newContext({ viewport: report.viewport, serviceWorkers: 'block', acceptDownloads: false, recordVideo: { dir: directory, size: report.viewport } });
    context.setDefaultTimeout(5000);
    context.setDefaultNavigationTimeout(10000);
    await context.route('**/*', async route => {
      try {
        if (state.closing) { await route.abort(); return; }
        const requested = new URL(route.request().url());
        if (requested.origin !== base.origin) {
          report.blockedRequests.push({ url: requested.href, reason: 'outside exact allowed origin' });
          await route.abort('blockedbyclient');
          return;
        }
        if (state.delay?.ms && requested.pathname === state.delay.path) await sleep(state.delay.ms);
        if (state.closing) { await route.abort(); return; }
        // Chromium skips routing for redirect continuations. Never let it start a redirect chain.
        // No transport retry: retrying a mutation here would change the experiment itself.
        const headers = await route.request().allHeaders();
        if (state.closing) { await route.abort(); return; }
        const response = await route.fetch({ headers: { ...headers, cookie: headers.cookie ?? '' }, maxRedirects: 0, maxRetries: 0, timeout: 10000 });
        try {
          if (response.status() >= 300 && response.status() < 400 && response.headers().location) {
            report.blockedRequests.push({ url: requested.href, reason: 'HTTP redirects unsupported', location: response.headers().location });
            await route.abort('blockedbyclient');
          } else await route.fulfill({ response });
        } finally { await response.dispose(); }
      } catch (error) {
        if (!state.closing) state.networkError = error.message;
        await route.abort('failed').catch(() => {});
      }
    });
    await context.routeWebSocket('**/*', socket => {
      report.blockedRequests.push({ url: socket.url(), reason: 'WebSockets unsupported' });
      socket.close();
    });
    try {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      tracing = true;
    } catch (error) { report.artifactErrors.push(`Trace start: ${error.message}`); }
    page = await context.newPage();
    video = page.video();
    // Playwright 1.58 can leave FFmpeg alive when navigation fails before any frame.
    // Produce a blank frame before navigating; video.path resolves once recording starts.
    await page.screenshot();
    let frameTimer;
    try {
      await Promise.race([video.path(), new Promise((_, reject) => { frameTimer = setTimeout(() => reject(new Error('Video did not receive an initial frame')), 5000); })]);
    } finally { clearTimeout(frameTimer); }
    page.on('pageerror', error => report.consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    const response = await page.goto(base.href, { waitUntil: 'domcontentloaded' });
    ensure(response && response.ok(), `Initial page returned HTTP ${response?.status() ?? 'unknown'}`);
    if (!appVersion) report.appVersion = await page.locator('meta[name="app-version"]').getAttribute('content', { timeout: 500 }).catch(() => null) || 'unknown';
    await page.screenshot({ path: resolve(directory, '00-initial.png'), fullPage: true });
    report.artifacts.initial = '00-initial.png';
    for (const [i, step] of plan.steps.entries()) {
      const row = { index: i + 1, step, startedAt: new Date().toISOString() };
      const start = performance.now();
      try {
        const result = await act(page, step, state);
        if (step.action === 'check') {
          row.observation = result;
          if (!result.passed) report.status = 'observed_failure';
        } else if (result.position) row.position = result.position;
        ensure(!report.blockedRequests.length, 'Execution encountered an unsupported network boundary');
        ensure(!state.networkError, `Network execution failed: ${state.networkError}`);
        row.screenshot = `${String(i + 1).padStart(2, '0')}-${step.action}.png`;
        await page.screenshot({ path: resolve(directory, row.screenshot), fullPage: true });
      } catch (error) {
        row.error = error.message;
        report.status = 'execution_error';
        report.error = error.message;
        row.screenshot = `${String(i + 1).padStart(2, '0')}-error.png`;
        await page.screenshot({ path: resolve(directory, row.screenshot), fullPage: true }).catch(() => { row.screenshot = null; });
      } finally {
        row.durationMs = Math.round(performance.now() - start);
        report.steps.push(row);
      }
      if (report.status === 'execution_error') break;
    }
  } catch (error) {
    report.status = 'execution_error';
    report.error = error.message;
    if (page) {
      await page.screenshot({ path: resolve(directory, 'execution-error.png'), fullPage: true })
        .then(() => { report.artifacts.error = 'execution-error.png'; })
        .catch(() => {});
    }
  } finally {
    state.closing = true;
    if (tracing) {
      try { await context.tracing.stop({ path: resolve(directory, 'trace.zip') }); report.artifacts.trace = 'trace.zip'; }
      catch (error) { report.artifactErrors.push(`Trace stop: ${error.message}`); }
    }
    if (context) {
      try { await context.close(); }
      catch (error) { report.artifactErrors.push(`Context close: ${error.message}`); }
    }
    if (video) {
      try { await rename(await video.path(), resolve(directory, 'video.webm')); report.artifacts.video = 'video.webm'; }
      catch (error) { report.artifactErrors.push(`Video: ${error.message}`); }
    }
    if (browser) await browser.close().catch(error => report.artifactErrors.push(`Browser close: ${error.message}`));
  }
  if (report.blockedRequests.length) {
    report.status = 'execution_error';
    report.error ||= 'Unsupported network boundary encountered';
  }
  if (state.networkError) {
    report.status = 'execution_error';
    report.error ||= state.networkError;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(directory, 'report.md'), markdown(report));
  return report;
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    url: { type: 'string' }, plan: { type: 'string' }, out: { type: 'string' },
    'app-version': { type: 'string' }, headed: { type: 'boolean', default: false }, help: { type: 'boolean' }
  } });
  if (values.help) {
    console.log('RageClick: node scripts/run.mjs --url LOOPBACK_URL --plan case.json --out NEW_DIRECTORY [--app-version VERSION] [--headed]\nExit: 0 passed; 1 assertion mismatch; 2 execution/configuration error.');
    return 0;
  }
  ensure(values.url && values.plan && values.out, '--url, --plan, and --out are required');
  ensure((await stat(values.plan)).size <= 524288, 'Plan exceeds 512 KiB');
  const plan = JSON.parse(await readFile(values.plan, 'utf8'));
  const report = await runPlan({ url: values.url, plan, out: values.out, appVersion: values['app-version'], headed: values.headed });
  console.log(`${report.status}: ${plan.name}\n${resolve(values.out, 'report.md')}`);
  return report.status === 'passed' ? 0 : report.status === 'observed_failure' ? 1 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 2; });
}
