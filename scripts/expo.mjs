import { spawnSync } from 'node:child_process';
const [environment, ...args] = process.argv.slice(2);
if (!['development', 'production'].includes(environment)) throw new Error('Choose development or production.');
const result = spawnSync(process.execPath, ['node_modules/expo/bin/cli', ...args], {
  stdio: 'inherit', windowsHide: true, env: { ...process.env, APP_ENV: environment },
});
process.exit(result.status ?? 1);
