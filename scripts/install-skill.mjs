#!/usr/bin/env node
import { cp, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export async function installSkill(workspace) {
  if (!workspace) throw new Error('Specify --workspace /path/to/your/project');
  const source = fileURLToPath(new URL('../skills/rageclick/', import.meta.url));
  const target = resolve(workspace, '.agents', 'skills', 'rageclick');
  await mkdir(dirname(target), { recursive: true });
  await mkdir(target); // Refuse to overwrite an existing installation.
  for (const name of ['SKILL.md', 'INSTALL.md', 'LICENSE', 'package.json', 'package-lock.json', 'agents', 'references', 'scripts']) {
    await cp(resolve(source, name), resolve(target, name), { recursive: true, errorOnExist: true, force: false });
  }
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { workspace: { type: 'string' } } });
    console.log(`Installed: ${await installSkill(values.workspace)}\nNext: run npm ci and npx playwright install chromium in that directory, then reopen your coding host.`);
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
