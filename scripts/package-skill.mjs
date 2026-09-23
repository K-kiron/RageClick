#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();

export async function packageSkill(out = resolve(root, 'output/releases')) {
  if (git(['status', '--porcelain', '--', 'skills/rageclick'])) throw new Error('Commit skill changes before packaging a release.');
  const { version } = JSON.parse(git(['show', 'HEAD:skills/rageclick/package.json']));
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a numeric release version.');
  const directory = resolve(out);
  await mkdir(directory, { recursive: true });
  const filename = `rageclick-v${version}.zip`;
  const archive = resolve(directory, filename);
  const exists = await access(archive).then(() => true, () => false);
  if (exists) throw new Error('Release archive already exists. Choose a new --out directory.');
  git(['archive', '--format=zip', '--prefix=rageclick/', '-o', archive, 'HEAD:skills/rageclick']);
  const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(resolve(directory, 'SHA256SUMS.txt'), `${sha256}  ${filename}\n`);
  await writeFile(resolve(directory, 'release.json'), JSON.stringify({ name: 'rageclick', version, commit: git(['rev-parse', 'HEAD']), archive: filename, sha256 }, null, 2) + '\n');
  return { archive, sha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { out: { type: 'string' } } });
    console.log(JSON.stringify(await packageSkill(values.out), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
