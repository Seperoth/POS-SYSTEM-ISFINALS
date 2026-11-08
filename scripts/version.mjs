import { readFileSync, writeFileSync } from 'node:fs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const release = read('release.json'), parts = release.version.split('.').map(Number);
const change = process.argv[2];
if (['major', 'minor', 'patch'].includes(change)) {
  const index = ['major', 'minor', 'patch'].indexOf(change);
  parts[index]++; for (let i = index + 1; i < 3; i++) parts[i] = 0;
} else throw new Error('Use npm run version:bump -- patch (or minor / major).');
release.version = parts.join('.');
release.androidVersionCode = Math.max(release.androidVersionCode + 1, parts[0] * 10000 + parts[1] * 100 + parts[2]);
const pkg = read('package.json'), lock = read('package-lock.json');
pkg.version = lock.version = lock.packages[''].version = release.version;
for (const [path, value] of [['release.json', release], ['package.json', pkg], ['package-lock.json', lock]]) writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
console.log(`Version ${release.version}. Add its changes to CHANGELOG.md, then commit on codex/development.`);
