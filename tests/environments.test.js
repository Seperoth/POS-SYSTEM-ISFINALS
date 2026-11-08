import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const json = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
function config(environment) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import config from './app.config.js'; console.log(JSON.stringify(config.expo))"], {
    encoding: 'utf8', env: { ...process.env, APP_ENV: environment }, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
test('group app identities and runtime versions are separate with client updates disabled', () => {
  const dev = config('development'), prod = config('production'), profiles = json('eas.json').build;
  assert.equal(prod.android.package, 'com.seperoth.possystemisfinals');
  assert.equal(dev.android.package, 'com.seperoth.possystemisfinals.dev');
  assert.notEqual(dev.runtimeVersion, prod.runtimeVersion);
  assert.equal(prod.runtimeVersion, 'pos-system-isfinals-production-1');
  for (const [environment, current] of [['development', dev], ['production', prod]]) {
    assert.equal(current.updates.enabled, false);
    assert.equal(current.updates.url, undefined);
    assert.equal(current.owner, undefined);
    assert.equal(current.extra.eas, undefined);
    assert.equal(current.extra.updatesConfigured, false);
    assert.equal(current.extra.appEnvironment, environment);
    assert.equal(profiles[environment].channel, environment);
    assert.equal(profiles[environment].env.APP_ENV, environment);
  }
});
test('release, npm package, lockfile and native config show the same version', () => {
  const release = json('release.json');
  assert.equal(json('package.json').version, release.version);
  assert.equal(json('package-lock.json').version, release.version);
  assert.equal(config('production').version, release.version);
  assert.ok(release.androidVersionCode > 20003);
});

test('group automation cannot publish to the client update project', () => {
  const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
  assert.ok(!/eas update|EXPO_TOKEN|publish:/.test(workflow));
  const publish = spawnSync(process.execPath, ['scripts/publish-update.mjs', 'production'], { encoding: 'utf8', windowsHide: true });
  assert.notEqual(publish.status, 0);
  assert.match(publish.stderr, /intentionally disconnected/);
});
