import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { localURL, targetURL, validatePlan, runPlan } from '../skills/rageclick/scripts/run.mjs';

const { chromium } = createRequire(new URL('../skills/rageclick/package.json', import.meta.url))('playwright');
const check = { action: 'check', kind: 'count', selector: 'h1', expected: 1, because: 'The fixture finished rendering' };
const plan = steps => ({ schemaVersion: 1, name: 'website-contract', goal: 'Use native website networking', steps });
const output = async () => resolve(await mkdtemp(resolve(tmpdir(), 'rageclick-website-')), 'run');

async function serve(t, host, handler, upgrade) {
  const server = createServer(handler);
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  if (upgrade) server.on('upgrade', upgrade);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => { for (const socket of sockets) socket.destroy(); server.close(done); }));
  return `http://${host}:${server.address().port}`;
}

function localDNS(t) {
  const launch = chromium.launch.bind(chromium);
  t.mock.method(chromium, 'launch', options => launch({ ...options, args: [
    ...(options.args || []), '--no-proxy-server',
    '--host-resolver-rules=MAP website.test 127.0.0.1, MAP assets.test 127.0.0.1',
  ] }));
}

test('website URLs and plans accept HTTP(S) while rejecting credentials and executable schemes', () => {
  const base = targetURL('https://website.test/app/');
  for (const url of ['https://example.com/a?b=c', 'http://192.168.1.2:8080', 'http://localhost:3000']) assert.ok(targetURL(url));
  for (const url of ['not a URL', 'file:///tmp/page.html', 'javascript:alert(1)', 'data:text/html,test', 'ftp://website.test', 'https://user:pass@website.test']) assert.throws(() => targetURL(url));
  assert.throws(() => localURL(base.href));
  for (const path of ['next', '/next', 'https://assets.test/page']) assert.equal(validatePlan(plan([{ action: 'goto', path }, check]), base).steps[0].path, path);
  for (const path of ['javascript:alert(1)', 'data:text/html,test', 'https://user:pass@assets.test']) assert.throws(() => validatePlan(plan([{ action: 'goto', path }, check]), base));
  for (const path of ['/api/save', 'https://assets.test/api/save']) assert.ok(validatePlan(plan([{ action: 'delay-network', path, delayMs: 500 }, check]), base));
  for (const path of ['api/save', '//assets.test/api/save', '/api/save?x=1', 'https://assets.test/api/save#hash', 'https://user:pass@assets.test/api/save']) assert.throws(() => validatePlan(plan([{ action: 'delay-network', path, delayMs: 500 }, check]), base));
});

test('loopback aliases retain the exact-origin navigation and delay boundary', () => {
  for (const url of ['http://localhost.:3000', 'http://sub.localhost:3000', 'http://127.0.0.2:3000', 'http://127.1:3000', 'http://0x7f000002:3000', 'http://[::ffff:127.0.0.1]:3000', 'http://[::ffff:7fff:ffff]:3000']) {
    const base = localURL(url);
    assert.ok(validatePlan(plan([{ action: 'goto', path: '/next' }, check]), base));
    assert.throws(() => validatePlan(plan([{ action: 'goto', path: 'https://website.test/next' }, check]), base));
    assert.throws(() => validatePlan(plan([{ action: 'delay-network', path: base.origin + '/api', delayMs: 500 }, check]), base));
  }
});

test('loopback relative navigation preserves the original replay base URL', async t => {
  const site = await serve(t, '127.0.0.1', (req, res) => {
    res.setHeader('Content-Type', 'text/html'); res.end(`<h1>${req.url}</h1>`);
  });
  const report = await runPlan({ url: site + '/app/', plan: plan([
    { action: 'goto', path: '/settings/' }, { action: 'goto', path: 'details' },
    { action: 'check', kind: 'text', selector: 'h1', expected: '/app/details', because: 'Existing local replay paths retain their initial base' },
  ]), out: await output() });
  assert.equal(report.status, 'passed', report.error);
  assert.equal(report.networkMode, 'loopback');
  assert.equal(report.finalUrl, site + '/app/details');
});

test('website mode renders external scripts, APIs, and WebSockets while preserving browser CORS', async t => {
  localDNS(t);
  const hits = [];
  let site;
  const assets = await serve(t, 'assets.test', (req, res) => {
    hits.push(req.url);
    if (req.url === '/script.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('document.querySelector("#script").textContent = "external script ready";'); }
    else {
      if (req.url === '/allowed') res.setHeader('Access-Control-Allow-Origin', site);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ value: req.url === '/allowed' ? 'external API ready' : 'private response' }));
    }
  }, (req, socket) => {
    hits.push(req.url);
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const message = Buffer.from('live connection ready');
    socket.write(Buffer.concat([Buffer.from([0x81, message.length]), message]));
  });
  site = await serve(t, 'website.test', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<h1>Website</h1><p id="script"></p><p id="api"></p><p id="cors"></p><p id="socket"></p>
      <script src="${assets}/script.js"></script><script>
      fetch('${assets}/allowed').then(r => r.json()).then(data => document.querySelector('#api').textContent = data.value);
      fetch('${assets}/denied').then(r => r.json()).then(data => document.querySelector('#cors').textContent = data.value).catch(() => document.querySelector('#cors').textContent = 'CORS blocked');
      const live = new WebSocket('${assets.replace('http:', 'ws:')}/live');
      live.onmessage = event => document.querySelector('#socket').textContent = event.data;
      </script>`);
  });
  const report = await runPlan({ url: site, plan: plan([
    { action: 'wait-text', selector: '#script', text: 'external script ready' },
    { action: 'wait-text', selector: '#api', text: 'external API ready' },
    { action: 'wait-text', selector: '#cors', text: 'CORS blocked' },
    { action: 'wait-text', selector: '#socket', text: 'live connection ready' }, check,
    { action: 'check', kind: 'text', selector: '#socket', expected: 'live connection ready', because: 'Native WebSocket messages remain available' },
  ]), out: await output() });
  assert.equal(report.status, 'passed', report.error);
  assert.equal(report.networkMode, 'website');
  assert.equal(report.finalUrl, site + '/');
  assert.deepEqual(report.blockedRequests, []);
  for (const path of ['/script.js', '/allowed', '/denied', '/live']) assert.ok(hits.includes(path), path);
  assert.ok(report.consoleErrors.some(error => /CORS|Access-Control-Allow-Origin/.test(error)));
});

test('website redirects and subsequent relative navigation use the current page origin and path', async t => {
  localDNS(t);
  const reached = [];
  const assets = await serve(t, 'assets.test', (req, res) => {
    reached.push(req.url);
    if (req.url === '/app/home') { res.writeHead(302, { Location: '/app/work/' }); res.end(); }
    else { res.setHeader('Content-Type', 'text/html'); res.end(`<h1>${req.url}</h1>`); }
  });
  const site = await serve(t, 'website.test', (req, res) => {
    if (req.url === '/start') { res.writeHead(302, { Location: assets + '/app/home' }); res.end(); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<h1>Final website</h1>'); }
  });
  const report = await runPlan({ url: site + '/start', plan: plan([
    { action: 'check', kind: 'text', selector: 'h1', expected: '/app/work/', because: 'Canonical redirect completed' },
    { action: 'goto', path: 'details' },
    { action: 'check', kind: 'text', selector: 'h1', expected: '/app/work/details', because: 'Relative navigation uses the redirected page' },
    { action: 'goto', path: site + '/landing' },
    { action: 'check', kind: 'text', selector: 'h1', expected: 'Final website', because: 'Absolute cross-origin navigation completed' },
  ]), out: await output() });
  assert.equal(report.status, 'passed', report.error);
  assert.equal(report.finalUrl, site + '/landing');
  assert.deepEqual(report.blockedRequests, []);
  assert.ok(reached.includes('/app/work/details'));
});

test('website endpoint delay selects the API origin and exact pathname only', async t => {
  localDNS(t);
  const arrivals = {};
  let site;
  const assets = await serve(t, 'assets.test', (req, res) => {
    arrivals['assets' + new URL(req.url, 'http://fixture').pathname] = performance.now();
    res.setHeader('Access-Control-Allow-Origin', site);
    res.end('ok');
  });
  site = await serve(t, 'website.test', (req, res) => {
    if (req.url.startsWith('/api/')) { arrivals['site' + req.url] = performance.now(); res.end('ok'); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<h1>Endpoint delay</h1><button id="go">Fetch</button><p id="result"></p><script>
      document.querySelector('#go').onclick = () => Promise.all([
        fetch('${assets}/api/selected?sample=1'), fetch('${assets}/api/unselected'), fetch('/api/selected')
      ]).then(() => document.querySelector('#result').textContent = 'done');
      </script>`);
  });
  const report = await runPlan({ url: site, plan: plan([
    { action: 'delay-network', path: assets + '/api/selected', delayMs: 650 },
    { action: 'click', selector: '#go' },
    { action: 'wait-text', selector: '#result', text: 'done' }, check,
  ]), out: await output() });
  assert.equal(report.status, 'passed', report.error);
  for (const key of ['assets/api/selected', 'assets/api/unselected', 'site/api/selected']) assert.equal(typeof arrivals[key], 'number', key);
  for (const key of ['assets/api/unselected', 'site/api/selected']) assert.ok(arrivals['assets/api/selected'] - arrivals[key] >= 450, `${key} was delayed with the selected endpoint`);
});
