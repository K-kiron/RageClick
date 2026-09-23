import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const VERSION = '1.0.0-demo';
const RESPONSE_DELAY_MS = 450;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/** Start the synthetic, session-isolated fixture. It never binds beyond loopback. */
export async function startDemo({ port = 0, host = '127.0.0.1' } = {}) {
  if (!LOOPBACK_HOSTS.has(host)) throw new Error('The demo must bind to a loopback host.');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');

  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const sessions = new Map();
  let origin;

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");

    const json = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };

    try {
      if (request.headers.host !== new URL(origin).host) return json(403, { error: 'Unexpected host.' });
      const url = new URL(request.url, origin);
      if (url.pathname === '/health' && request.method === 'GET') return json(200, { status: 'ok', version: VERSION });

      const cookie = request.headers.cookie?.match(/(?:^|;\s*)rageclick_session=([a-f0-9-]{36})(?:;|$)/)?.[1];
      let session = cookie && sessions.get(cookie);
      if (!session) {
        const id = randomUUID();
        session = { buggy: { projects: [], operations: new Map() }, fixed: { projects: [], operations: new Map() } };
        // The fixture holds only synthetic data and bounds retained browser sessions.
        if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
        sessions.set(id, session);
        response.setHeader('Set-Cookie', `rageclick_session=${id}; Path=/; HttpOnly; SameSite=Strict`);
      }
      const mode = url.searchParams.get('mode') === 'fixed' ? 'fixed' : 'buggy';
      const state = session[mode];

      if (url.pathname === '/api/projects') {
        if (request.method === 'GET') return json(200, { projects: state.projects });
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'GET, POST');
          return json(405, { error: 'Method not allowed.' });
        }
        if (request.headers.origin !== origin) return json(403, { error: 'Same-origin requests only.' });
        if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) return json(415, { error: 'Expected JSON.' });

        let body = '';
        for await (const chunk of request) {
          body += chunk.toString('utf8');
          if (Buffer.byteLength(body) > 4096) return json(413, { error: 'Request too large.' });
        }
        let input;
        try { input = JSON.parse(body); } catch { return json(400, { error: 'Invalid JSON.' }); }
        const { name, key } = input ?? {};
        if (typeof name !== 'string' || !name.trim() || name.length > 100 || typeof key !== 'string' || !key || key.length > 128) {
          return json(400, { error: 'A name (1–100 characters) and operation key (1–128 characters) are required.' });
        }

        const existing = mode === 'fixed' && state.operations.get(key);
        if (existing) {
          if (existing.name !== name.trim()) return json(409, { error: 'This operation key belongs to another project.' });
          return json(200, { project: await existing.promise, deduplicated: true });
        }
        const mutation = new Promise((resolve) => {
          setTimeout(() => {
            const project = { id: randomUUID(), name: name.trim() };
            state.projects.push(project);
            resolve(project);
          }, RESPONSE_DELAY_MS);
        });
        // Reserve the key before awaiting, including when the first response is lost.
        if (mode === 'fixed') state.operations.set(key, { name: name.trim(), promise: mutation });
        return json(201, { project: await mutation, deduplicated: false });
      }

      if (['/', '/index.html', '/preview'].includes(url.pathname) && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(html);
        return;
      }
      if (url.pathname === '/favicon.ico') {
        response.writeHead(204);
        response.end();
        return;
      }
      return json(404, { error: 'Not found.' });
    } catch {
      if (!response.headersSent) json(500, { error: 'The local demo could not complete this request.' });
      else response.end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  origin = `http://${host === '::1' ? '[::1]' : host}:${address.port}`;
  return {
    server,
    url: origin,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]))) {
    console.error('Usage: node demo/server.mjs [--port 4317]');
    process.exitCode = 1;
  } else {
    try {
      const demo = await startDemo({ port: args.length ? Number(args[1]) : 4317 });
      console.log(`RageClick demo: ${demo.url}`);
      const stop = async () => { await demo.close(); };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
