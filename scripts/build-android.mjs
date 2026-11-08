import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const environment = process.argv[2];
if (!['development', 'production'].includes(environment)) throw new Error('Use npm run build:android:dev or npm run build:android.');
if (process.platform === 'win32' && root.length > 10) {
  throw new Error(`Windows native builds need a short checkout path, such as C:\\pos, because Ninja has a 260-character filename limit. Use npm run ${environment === 'development' ? 'build:cloud:dev' : 'build:cloud'} from this folder instead, or clone the project to a short path.`);
}
const release = JSON.parse(readFileSync('release.json', 'utf8'));
const bundledJava = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const javaHome = process.env.POS_JAVA_HOME || (process.platform === 'win32' && existsSync(bundledJava) ? bundledJava : process.env.JAVA_HOME || '');
const sdk = process.env.ANDROID_HOME || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '');
const env = { ...process.env, ...(javaHome ? { JAVA_HOME: javaHome } : {}), ...(sdk ? { ANDROID_HOME: sdk } : {}), NODE_ENV: 'production', APP_ENV: environment };
function command(file, args, extra = {}) {
  const result = spawnSync(file, args, { cwd: root, env, stdio: 'inherit', windowsHide: true, ...extra });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} failed (${result.status}).`);
}
mkdirSync('.signing', { recursive: true });
const configPath = '.signing/key.json', keyPath = resolve('.signing/universal-pos.jks');
if (!existsSync(configPath)) {
  if (existsSync(keyPath)) throw new Error('Signing key exists without its configuration. Recover key.json instead of overwriting the key.');
  const config = { storePassword: randomBytes(24).toString('hex'), keyPassword: randomBytes(24).toString('hex'), alias: 'universalpos' };
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  command(join(javaHome, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool'), ['-genkeypair', '-v', '-storetype', 'JKS', '-keystore', keyPath,
    '-alias', config.alias, '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Universal POS, O=Universal POS, C=PH', '-storepass', config.storePassword, '-keypass', config.keyPassword]);
}
if (!existsSync(keyPath)) throw new Error('Signing key is missing. Restore .signing from its safe backup.');
const config = JSON.parse(readFileSync(configPath));
const versionPath = environment === 'production' ? '.signing/version-code.json' : '.signing/development-version-code.json';
const lastVersion = existsSync(versionPath) ? JSON.parse(readFileSync(versionPath)).versionCode : 19999;
const versionCode = Math.max(lastVersion + 1, Number(process.env.POS_VERSION_CODE || release.androidVersionCode));
env.POS_VERSION_CODE = String(versionCode);
env.POS_STORE_FILE = keyPath.replaceAll('\\', '/'); env.POS_STORE_PASSWORD = config.storePassword;
env.POS_KEY_ALIAS = config.alias; env.POS_KEY_PASSWORD = config.keyPassword;
writeFileSync('credentials.json', JSON.stringify({ android: { keystore: { keystorePath: '.signing/universal-pos.jks', keystorePassword: config.storePassword, keyAlias: config.alias, keyPassword: config.keyPassword } } }, null, 2));
command(process.execPath, ['node_modules/expo/bin/cli', 'prebuild', '--platform', 'android', '--no-install']);
command(process.platform === 'win32' ? 'cmd.exe' : './gradlew', process.platform === 'win32'
  ? ['/d', '/c', 'gradlew.bat', ':app:assembleRelease', '--console=plain', '--max-workers=2', '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a']
  : [':app:assembleRelease', '--console=plain', '--max-workers=2', '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a'], { cwd: join(root, 'android') });
mkdirSync('artifacts', { recursive: true });
const target = `artifacts/Universal-POS${environment === 'development' ? '-Dev' : ''}-${release.version}-${versionCode}.apk`;
copyFileSync('android/app/build/outputs/apk/release/app-release.apk', target);
writeFileSync(versionPath, JSON.stringify({ versionCode }));
console.log(`\nAPK: ${resolve(target)}\nBack up the .signing folder securely. It is required for future APK updates.`);
