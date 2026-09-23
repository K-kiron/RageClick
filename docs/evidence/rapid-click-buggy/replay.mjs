#!/usr/bin/env node
// Run from the RageClick repository root, or provide --runner for an installed skill.
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const { values } = parseArgs({ options: { runner: { type: 'string', default: 'skills/rageclick/scripts/run.mjs' }, url: { type: 'string', default: "http://127.0.0.1:57202/?mode=buggy" }, out: { type: 'string' }, 'app-version': { type: 'string' } } });
const args = [resolve(values.runner), '--plan', fileURLToPath(new URL('./plan.json', import.meta.url)), '--url', values.url, '--out', values.out || resolve('output', 'replay-' + Date.now())];
if (values['app-version']) args.push('--app-version', values['app-version']);
const result = spawnSync(process.execPath, args, { stdio: 'inherit', shell: false });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 2;
